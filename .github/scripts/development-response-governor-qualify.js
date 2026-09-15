#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const tests = [
  'control-gateway/test/development-response-governor.test.js',
  'control-gateway/test/governed-execution-admission.test.js',
  'control-gateway/test/development-response-production-enforcement.test.js'
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
const passMatch = combined.match(/# pass (\d+)/);
const failMatch = combined.match(/# fail (\d+)/);
const pass = Number(passMatch?.[1] ?? 0);
const fail = Number(failMatch?.[1] ?? -1);
if (pass < 14 || fail !== 0) {
  process.stderr.write(combined);
  process.stderr.write(`\nDevelopment response governor qualification is not non-vacuous: pass=${pass} fail=${fail}\n`);
  process.exit(2);
}

process.stdout.write(JSON.stringify({
  status: 'PASS',
  contract_id: 'SYSTEM-MASTER-DEVELOPMENT-RESPONSE-GOVERNOR-001',
  capability_id: 'C04',
  exact_subject: process.env.GITHUB_SHA ?? 'WORKTREE',
  tests_passed: pass,
  tests_failed: fail,
  malformed_response_fail_closed: true,
  github_raw_admission_not_reached_on_missing_receipt: true,
  a01_raw_admission_not_reached_on_missing_receipt: true,
  production_bypass_audit: 'PASS'
}) + '\n');
