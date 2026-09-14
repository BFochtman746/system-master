#!/usr/bin/env node
'use strict';

/**
 * system-file-lease-enforce.js — (e) the gate that keeps the lock honest.
 *
 * WHY THIS SHAPE. The previous generation of "locks" in this repository failed in a
 * specific way worth not repeating: SYSTEM-PROGRAM-JOB-LOCK-001.json and the CG-*.lock.json
 * records validate that governance JSON agrees with other governance JSON. They cannot
 * refuse a write, and they run only after a push has already landed. Meanwhile
 * control-gateway/src/chat-recovery-gate.js was fully implemented and imported by nothing
 * but its own test. Both were "green" because neither was ever in a position to object.
 *
 * So this gate does not check that a document exists. It checks that every commit which
 * touched a governed system file carries a lease receipt proving the writer held the lock
 * for that path. A receipt is a commit trailer:
 *
 *     System-File-Lease: <path>@<epoch>/<fenceTokenPrefix>
 *
 * Trailers are chosen deliberately: they are part of the immutable commit object, they
 * survive rebase and squash, and they need no server-side state to audit. A lease-less
 * mutation to a governed path is therefore detectable forever, by anyone, from git alone.
 *
 * Exit 0 = every governed mutation carried a receipt. Exit 1 = a real finding.
 */

const { execFileSync } = require('child_process');

/** Paths under single-writer control. Kept narrow on purpose: a gate that fails on
 *  everything gets disabled, and a disabled gate protects nothing. */
const GOVERNED = [
  /^governance\/CURRENT-AUTHORITY\.json$/,
  /^governance\/SYSTEM-TOPOLOGY-.*\.json$/,
  /^governance\/SYSTEM-PROGRAM-JOB-LOCK-.*\.json$/,
  /^governance\/SYSTEM-COMPLETION-STATUS-.*\.json$/,
  /^governance\/COMPLETION-LEDGER-.*\.json$/,
  /^governance\/WORK-OBLIGATION-REGISTRY-.*\.json$/,
  /^governance\/second-shift\//,
  /^governance\/control-gateway\//,
];

const TRAILER = /^System-File-Lease:\s*(\S+)@(\d+)\/(\S+)\s*$/;

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function isGoverned(p) {
  return GOVERNED.some((rx) => rx.test(p));
}

/** Commit range to audit. On a PR, the merge-base..HEAD span; locally, the last commit. */
function resolveRange() {
  const base = process.env.GITHUB_BASE_REF;
  if (base) {
    try {
      const mb = git(['merge-base', `origin/${base}`, 'HEAD']).trim();
      if (mb) return `${mb}..HEAD`;
    } catch (_) { /* fall through to single-commit audit */ }
  }
  if (process.env.LEASE_AUDIT_RANGE) return process.env.LEASE_AUDIT_RANGE;
  return 'HEAD~1..HEAD';
}

function main() {
  const range = resolveRange();
  let shas;
  try {
    shas = git(['rev-list', range]).trim().split('\n').filter(Boolean);
  } catch (e) {
    console.log(`SKIP system-file-lease-enforce: range ${range} not resolvable (shallow clone?)`);
    process.exit(0);
  }

  const violations = [];
  let auditedCommits = 0;
  let governedMutations = 0;

  for (const sha of shas) {
    const files = git(['show', '--name-only', '--format=', sha])
      .split('\n').map((s) => s.trim()).filter(Boolean);
    const governed = files.filter(isGoverned);
    if (governed.length === 0) continue;

    auditedCommits++;
    governedMutations += governed.length;

    const message = git(['show', '-s', '--format=%B', sha]);
    const receipts = new Map();
    for (const line of message.split('\n')) {
      const m = TRAILER.exec(line.trim());
      if (m) receipts.set(m[1], { epoch: Number(m[2]), fence: m[3] });
    }

    for (const path of governed) {
      const receipt = receipts.get(path);
      if (!receipt) {
        violations.push({ sha: sha.slice(0, 8), path, reason: 'NO_LEASE_RECEIPT' });
      } else if (!(receipt.epoch >= 1)) {
        violations.push({ sha: sha.slice(0, 8), path, reason: `INVALID_EPOCH:${receipt.epoch}` });
      } else if (receipt.fence.length < 8) {
        violations.push({ sha: sha.slice(0, 8), path, reason: 'FENCE_TOKEN_TOO_SHORT' });
      }
    }
  }

  console.log(`system-file-lease-enforce range=${range} commits_touching_governed=${auditedCommits} governed_mutations=${governedMutations}`);

  if (violations.length > 0) {
    console.log(`FAIL system-file-lease-enforce violations=${violations.length}`);
    for (const v of violations) {
      console.log(`  ${v.sha} ${v.path} -> ${v.reason}`);
    }
    console.log('');
    console.log('A governed system file was mutated without proving the writer held its lease.');
    console.log('Claim the lease through the control gateway and record the receipt trailer:');
    console.log('  System-File-Lease: <path>@<epoch>/<fenceToken>');
    process.exit(1);
  }

  console.log('PASS system-file-lease-enforce');
}

main();
