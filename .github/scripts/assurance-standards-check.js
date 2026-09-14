#!/usr/bin/env node
'use strict';

/**
 * Assurance standards check — enforces STANDARDS.md in CI.
 *
 * S-01: a PR may not add a DESIGN-LOCK / FREEZE / RECONCILIATION record for a
 *       capability unless the same change also adds/modifies a production source
 *       file AND a test.
 * S-05: a new subsystem directory must appear in SYSTEM-MAP.md.
 *
 * Usage:
 *   node .github/scripts/assurance-standards-check.js [baseRef]
 * baseRef defaults to origin/main.
 *
 * Exit 0 = compliant, 1 = violation, 2 = harness could not run (never silent).
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = process.env.GITHUB_WORKSPACE || process.cwd();
const baseRef = process.argv[2] || process.env.ASSURANCE_BASE_REF || 'origin/main';

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

function fail(code, message, detail) {
  const payload = { check: 'ASSURANCE-STANDARDS-1.0', status: 'FAIL', rule: code, error: message };
  if (detail !== undefined) payload.detail = detail;
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(1);
}

function harnessError(message) {
  process.stdout.write(
    `${JSON.stringify({ check: 'ASSURANCE-STANDARDS-1.0', status: 'HARNESS_ERROR', error: message }, null, 2)}\n`,
  );
  process.exit(2);
}

let changed;
try {
  const mergeBase = git(['merge-base', baseRef, 'HEAD']).trim();
  if (!mergeBase) harnessError(`could not resolve merge-base against ${baseRef}`);
  changed = git(['diff', '--name-status', `${mergeBase}..HEAD`])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split(/\s+/);
      return { status, file: rest[rest.length - 1] };
    });
} catch (err) {
  harnessError(`git diff against ${baseRef} failed: ${err.message}`);
}

if (changed.length === 0) {
  process.stdout.write(
    `${JSON.stringify({ check: 'ASSURANCE-STANDARDS-1.0', status: 'PASS', note: 'no changes vs base' })}\n`,
  );
  process.exit(0);
}

const LOCK_RE = /(DESIGN-LOCK|FREEZE|RECONCILIATION)/i;
const TEST_RE = /(Test\.java$|_test\.py$|\.test\.(js|mjs|ts)$|\/tests?\/)/i;
const SOURCE_RE = /(\.java$|\.py$|\.js$|\.mjs$|\.ts$)/i;

const addedLocks = changed.filter(
  (c) => c.status.startsWith('A') && LOCK_RE.test(path.basename(c.file)) && /\.(md|json)$/i.test(c.file),
);

const touchedSources = changed.filter(
  (c) => SOURCE_RE.test(c.file) && !TEST_RE.test(c.file) && !c.file.startsWith('.github/scripts/'),
);
const touchedTests = changed.filter((c) => TEST_RE.test(c.file));

if (addedLocks.length > 0) {
  if (touchedSources.length === 0) {
    fail('S-01', 'design-lock/freeze/reconciliation record added with no production source in the same change', {
      locks: addedLocks.map((c) => c.file),
    });
  }
  if (touchedTests.length === 0) {
    fail('S-01', 'design-lock/freeze/reconciliation record added with no test in the same change', {
      locks: addedLocks.map((c) => c.file),
      sources: touchedSources.map((c) => c.file),
    });
  }
}

// S-05: new subsystem dirs must be registered in SYSTEM-MAP.md
const mapPath = path.join(REPO_ROOT, 'SYSTEM-MAP.md');
if (!fs.existsSync(mapPath)) fail('S-05', 'SYSTEM-MAP.md is missing from the repository root');
const mapText = fs.readFileSync(mapPath, 'utf8');

const newSubsystems = new Set();
for (const c of changed) {
  if (!c.status.startsWith('A')) continue;
  const m = /^system-master\/([^/]+)\//.exec(c.file);
  if (m) newSubsystems.add(m[1]);
  const t = /^tools\/([a-z0-9_]+)\.py$/.exec(c.file);
  if (t) newSubsystems.add(t[1]);
}

const unregistered = [...newSubsystems].filter((s) => !mapText.includes(s));
if (unregistered.length > 0) {
  fail('S-05', 'new subsystem(s) not registered in SYSTEM-MAP.md', { unregistered });
}

process.stdout.write(
  `${JSON.stringify(
    {
      check: 'ASSURANCE-STANDARDS-1.0',
      status: 'PASS',
      changed_files: changed.length,
      locks_added: addedLocks.length,
      sources_touched: touchedSources.length,
      tests_touched: touchedTests.length,
    },
    null,
    2,
  )}\n`,
);
process.exit(0);
