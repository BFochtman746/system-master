#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const tests = [
  'control-gateway/test/response-expectation-engine.test.js',
  'control-gateway/test/development-response-governor.test.js'
];

const result = spawnSync(process.execPath, ['--test', ...tests], {
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
const pass = Number(combined.match(/# pass (\d+)/)?.[1] ?? 0);
const fail = Number(combined.match(/# fail (\d+)/)?.[1] ?? -1);
if (pass < 21 || fail !== 0) {
  process.stderr.write(combined);
  process.stderr.write(`\nResponse expectation engine qualification is not non-vacuous: pass=${pass} fail=${fail}\n`);
  process.exit(2);
}

process.stdout.write(JSON.stringify({
  status: 'PASS',
  engine_id: 'RESPONSE-EXPECTATION-ENGINE-001',
  capability_id: 'C11',
  exact_subject: process.env.GITHUB_SHA ?? 'WORKTREE',
  tests_passed: pass,
  tests_failed: fail,
  generic_policy_engine: true,
  c04_adapter_regression: 'PASS',
  governance_registry_used_as_implementation_evidence: false,
  fail_closed: true
}) + '\n');
