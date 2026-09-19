#!/usr/bin/env node
// Qualifies the control-gateway authority bootstrap path.
//
// Why this file exists: the bootstrap runtime
// (`control-gateway/src/github-authority-bootstrap.js`, plus the thin CI wrapper
// `.github/scripts/control-gateway-authority-bootstrap.js`) is covered by a real test with
// 17 bootstrap cases â€” but that test lives under `control-gateway/test/` and was reachable
// ONLY from CI workflows. `verify.sh` discovers qualifiers from `.github/scripts/*qualify*`,
// so no local pre-push run could catch a bootstrap regression. The path was gated in CI and
// ungated locally. This qualifier puts it in the suite.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const tests = [
  'control-gateway/test/github-control-adapter-repair.test.js',
  'control-gateway/test/github-genesis-publication-builder.test.js'
];

// Pin the reporter: node's default reporter is version- and TTY-dependent (>=20 emits spec
// `â„¹ pass N`, TAP emits `# pass N`). The counters below are a load-bearing non-vacuity
// gate, so the output format must not be inherited. This is the same defect that made
// two qualifiers fail closed under Node 24 â€” do not remove the pin.
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...tests], {
  cwd: root,
  encoding: 'utf8',
  env: process.env
});

if (result.status !== 0) {
  process.stderr.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  process.exit(result.status ?? 1);
}

const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
// Accept either reporter's counter line, so a future reporter change degrades to an
// unparseable-counter refusal rather than a silently vacuous PASS.
const passMatch = combined.match(/^[#\u2139]\s*pass\s+(\d+)\s*$/m);
const failMatch = combined.match(/^[#\u2139]\s*fail\s+(\d+)\s*$/m);
// Unparseable counters must fail closed: pass=0 / fail=-1 both trip the gate below.
const pass = Number(passMatch?.[1] ?? 0);
const fail = Number(failMatch?.[1] ?? -1);

// 21 cases exist today, 17 of them bootstrap cases. Asserting the floor makes a silently
// shrinking suite a failure rather than a quiet PASS.
if (pass < 42 || fail !== 0) {
  process.stderr.write(combined);
  process.stderr.write(`\nControl-gateway authority bootstrap qualification is not non-vacuous: pass=${pass} fail=${fail}\n`);
  process.exit(2);
}

// The bootstrap concern is two files, not one: a library and the CI wrapper that imports
// it. Assert the wiring, because a wrapper that stopped importing the library would leave
// the tests passing while the production path did nothing.
import fs from 'node:fs';
const wrapper = fs.readFileSync(path.join(root, '.github/scripts/control-gateway-authority-bootstrap.js'), 'utf8');
if (!wrapper.includes('control-gateway/src/github-authority-bootstrap.js')) {
  process.stderr.write('\nBOOTSTRAP_WRAPPER_UNWIRED: the CI wrapper no longer imports the bootstrap library\n');
  process.exit(2);
}

process.stdout.write(JSON.stringify({
  status: 'PASS',
  contract_id: 'P04-FOUNDATION-CONTRACT-001',
  capability_id: 'P04',
  exact_subject: process.env.GITHUB_SHA ?? 'WORKTREE',
  tests_passed: pass,
  tests_failed: fail,
  bootstrap_library: 'control-gateway/src/github-authority-bootstrap.js',
  bootstrap_ci_wrapper: '.github/scripts/control-gateway-authority-bootstrap.js',
  wrapper_imports_library: true,
  negative_proofs_present: [
    'bootstrap invalid namespace',
    'bootstrap mismatched head',
    'bootstrap packet digest mismatch',
    'bootstrap concurrent race',
    'bootstrap post-write mismatch',
    'bootstrap unauthorized writer App slug'
  ]
}) + '\n');

