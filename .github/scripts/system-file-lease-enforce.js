#!/usr/bin/env node
'use strict';

/**
 * system-file-lease-enforce.js — fail-closed single-writer enforcement.
 *
 * Two distinct proofs are required:
 *  1. immutable per-commit System-File-Lease trailers for governed mutations; and
 *  2. PR-level single-writer admission so two open PRs cannot concurrently claim the
 *     same control-plane operation or the same protected path.
 */

const fs = require('fs');
const { execFileSync } = require('child_process');

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

const OPERATION_ID_REQUIRED = [
  /^control-gateway\//,
  /^system-master\/control-gateway-lock\//,
  /^\.github\/scripts\/system-file-lease-enforce\.js$/,
  /^\.github\/workflows\/system-file-lease-enforcement\.yml$/,
  /^\.github\/scripts\/a01-second-shift-supervisor-v2-qualify\.js$/,
  /^tools\/second_shift_supervisor_v2\.py$/,
  /^tests\/test_control_gateway_a01_execution_worker\.py$/,
];

const TRAILER = /^System-File-Lease:\s*(\S+)@(\d+)\/(\S+)\s*$/;
const OPERATION_MARKER = /^System-Operation:\s*([A-Z0-9][A-Z0-9._-]{2,})\s*$/im;
const TITLE_OPERATION = /^([A-Z0-9]+(?:-[A-Z0-9]+){2,}):(?:\s|$)/;

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function isGoverned(p) {
  return GOVERNED.some((rx) => rx.test(p));
}

function requiresOperationIdentity(p) {
  return OPERATION_ID_REQUIRED.some((rx) => rx.test(p));
}

function isSingleWriterPath(p) {
  return isGoverned(p) || requiresOperationIdentity(p);
}

function extractOperationId(pr) {
  const body = String(pr && pr.body || '');
  const marker = OPERATION_MARKER.exec(body);
  if (marker) return marker[1].toUpperCase();
  const title = String(pr && pr.title || '').trim();
  const inferred = TITLE_OPERATION.exec(title);
  return inferred ? inferred[1].toUpperCase() : null;
}

function resolveRange() {
  const base = process.env.GITHUB_BASE_REF;
  if (base) {
    try {
      const mb = git(['merge-base', `origin/${base}`, 'HEAD']).trim();
      if (mb) return `${mb}..HEAD`;
    } catch (_) { /* fall through */ }
  }
  if (process.env.LEASE_AUDIT_RANGE) return process.env.LEASE_AUDIT_RANGE;
  return 'HEAD~1..HEAD';
}

function changedFiles(range) {
  return git(['diff', '--name-only', range])
    .split('\n').map((s) => s.trim()).filter(Boolean);
}

function buildPrViolations(currentPr, currentFiles, otherPrs, otherFilesByNumber = new Map()) {
  const violations = [];
  const operation = extractOperationId(currentPr);
  const operationRequired = currentFiles.some(requiresOperationIdentity);

  if (operationRequired && !operation) {
    violations.push({
      reason: 'SYSTEM_OPERATION_ID_REQUIRED',
      detail: 'Add `System-Operation: <stable-operation-id>` to the PR body or use a canonical operation-id title prefix.',
    });
  }

  const protectedCurrent = new Set(currentFiles.filter(isSingleWriterPath));
  for (const other of otherPrs) {
    if (!other || Number(other.number) === Number(currentPr.number)) continue;
    const otherOperation = extractOperationId(other);
    if (operation && otherOperation === operation) {
      violations.push({
        reason: 'DUPLICATE_OPEN_OPERATION_WRITER',
        detail: `operation=${operation} already claimed by PR #${other.number}`,
      });
    }

    if (protectedCurrent.size === 0) continue;
    const otherFiles = otherFilesByNumber.get(Number(other.number)) || [];
    const overlap = [...new Set(otherFiles.filter(isSingleWriterPath))]
      .filter((p) => protectedCurrent.has(p));
    for (const path of overlap) {
      violations.push({
        reason: 'DUPLICATE_OPEN_PATH_WRITER',
        detail: `${path} already changed by open PR #${other.number}`,
      });
    }
  }
  return violations;
}

function readPullRequestEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) return null;
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  if (!event.pull_request) return null;
  return {
    number: event.pull_request.number,
    title: event.pull_request.title,
    body: event.pull_request.body || '',
    base: event.pull_request.base && event.pull_request.base.ref,
  };
}

async function githubJson(path) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN_MISSING_FOR_PR_SINGLE_WRITER_AUDIT');
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'system-master-single-writer-gate',
    },
  });
  if (!response.ok) throw new Error(`GITHUB_API_${response.status}:${path}`);
  return response.json();
}

async function listOpenPrs(repo, base) {
  const out = [];
  for (let page = 1; ; page++) {
    const batch = await githubJson(`/repos/${repo}/pulls?state=open&base=${encodeURIComponent(base || 'main')}&per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

async function listPrFiles(repo, number) {
  const out = [];
  for (let page = 1; ; page++) {
    const batch = await githubJson(`/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`);
    out.push(...batch.map((f) => f.filename));
    if (batch.length < 100) break;
  }
  return out;
}

function auditCommitReceipts(range) {
  let shas;
  try {
    shas = git(['rev-list', range]).trim().split('\n').filter(Boolean);
  } catch (_) {
    throw new Error(`LEASE_AUDIT_RANGE_UNRESOLVABLE:${range}`);
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
      if (!receipt) violations.push({ sha: sha.slice(0, 8), path, reason: 'NO_LEASE_RECEIPT' });
      else if (!(receipt.epoch >= 1)) violations.push({ sha: sha.slice(0, 8), path, reason: `INVALID_EPOCH:${receipt.epoch}` });
      else if (receipt.fence.length < 8) violations.push({ sha: sha.slice(0, 8), path, reason: 'FENCE_TOKEN_TOO_SHORT' });
    }
  }

  console.log(`system-file-lease-enforce range=${range} commits_touching_governed=${auditedCommits} governed_mutations=${governedMutations}`);
  return violations;
}

async function auditPrSingleWriter(range) {
  const currentPr = readPullRequestEvent();
  if (!currentPr) {
    console.log('SKIP pr-single-writer: not a pull_request event');
    return [];
  }

  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GITHUB_REPOSITORY_MISSING_FOR_PR_SINGLE_WRITER_AUDIT');
  const files = changedFiles(range);
  const openPrs = await listOpenPrs(repo, currentPr.base || 'main');
  const others = openPrs.filter((pr) => Number(pr.number) !== Number(currentPr.number));
  const protectedCurrent = files.filter(isSingleWriterPath);
  const otherFilesByNumber = new Map();
  if (protectedCurrent.length > 0) {
    for (const other of others) {
      otherFilesByNumber.set(Number(other.number), await listPrFiles(repo, other.number));
    }
  }

  const violations = buildPrViolations(currentPr, files, others, otherFilesByNumber);
  console.log(`pr-single-writer pr=${currentPr.number} operation=${extractOperationId(currentPr) || 'NONE'} protected_paths=${protectedCurrent.length} competing_open_prs=${others.length}`);
  return violations;
}

async function main() {
  const range = resolveRange();
  const violations = [...auditCommitReceipts(range)];
  try {
    violations.push(...await auditPrSingleWriter(range));
  } catch (error) {
    violations.push({ reason: 'PR_SINGLE_WRITER_AUDIT_UNAVAILABLE', detail: error.message });
  }

  if (violations.length > 0) {
    console.log(`FAIL system-file-lease-enforce violations=${violations.length}`);
    for (const v of violations) {
      const prefix = v.sha && v.path ? `${v.sha} ${v.path}` : 'PR';
      console.log(`  ${prefix} -> ${v.reason}${v.detail ? `: ${v.detail}` : ''}`);
    }
    process.exit(1);
  }

  console.log('PASS system-file-lease-enforce');
}

module.exports = {
  buildPrViolations,
  extractOperationId,
  isGoverned,
  isSingleWriterPath,
  requiresOperationIdentity,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`FAIL system-file-lease-enforce fatal=${error.stack || error}`);
    process.exit(1);
  });
}
