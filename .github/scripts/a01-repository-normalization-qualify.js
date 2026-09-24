'use strict';

const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.env.A01_SUBJECT_ROOT || process.env.GITHUB_WORKSPACE || '.');
const EVIDENCE_DIR = path.resolve(process.env.A01_EVIDENCE_DIR || path.join(ROOT, '.a01-repository-normalization-evidence'));
const EXPECTED_SHA = String(process.env.A01_SUBJECT_SHA || process.env.GITHUB_SHA || '').trim().toLowerCase();
const SHA_RE = /^[0-9a-f]{40}$/;

function fail(message) { throw new Error(message); }
function run(exe, args) {
  const result = cp.spawnSync(exe, args, { cwd: ROOT, encoding: 'utf8', shell: false, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) fail(exe + ' spawn failed: ' + result.error.message);
  if (result.status !== 0) fail(exe + ' ' + args.join(' ') + ' failed with exit ' + result.status);
  return result.stdout || '';
}
function gitHead() { return run('git', ['rev-parse', 'HEAD']).trim().toLowerCase(); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8'); }

function main() {
  if (!SHA_RE.test(EXPECTED_SHA)) fail('INVALID_A01_SUBJECT_SHA:' + EXPECTED_SHA);
  const actual = gitHead();
  if (actual !== EXPECTED_SHA) fail('SUBJECT_CHECKOUT_MISMATCH expected=' + EXPECTED_SHA + ' actual=' + actual);
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  run(process.execPath, ['--test', 'control-gateway/test/a01-native-qualification-ingress.test.js', 'control-gateway/test/github-native-state-publication-ingress.test.js']);
  run(process.execPath, ['--test', 'control-gateway/test/a01-repository-repair-mutation-readiness.test.js']);
  const preflightText = run(process.execPath, ['.github/scripts/a01-repository-repair-preflight.js']);
  let preflight;
  try { preflight = JSON.parse(preflightText); } catch { fail('REPOSITORY_PREFLIGHT_JSON_INVALID'); }
  if (preflight.standing !== 'SAFE_TO_REPAIR') fail('REPOSITORY_PREFLIGHT_NOT_SAFE:' + String(preflight.standing));
  const evidence = {
    evidence_version: 2,
    qualification_id: process.env.A01_QUALIFICATION_ID || 'REPOSITORY-NORMALIZATION-RECOVERY-A01',
    workstream_id: process.env.A01_WORKSTREAM_ID || 'SECOND-SHIFT-PRODUCTION-MASTER-COMPLETION',
    subject_sha: actual,
    exact_subject_verified: true,
    qualification_state_required_at_ingress: 'PENDING',
    live_repository_preflight: preflight.standing,
    controller_regression_files: ['control-gateway/test/a01-native-qualification-ingress.test.js','control-gateway/test/github-native-state-publication-ingress.test.js'],
    promotion_authority: false,
    repository_write_authority: false,
    branch_deletion_authority: false,
    repair_dispatch_authority: false
  };
  writeJson(path.join(EVIDENCE_DIR, 'repository-normalization-qualification.json'), evidence);
  console.log('REPOSITORY_NORMALIZATION_A01_QUALIFICATION=PASS');
  console.log(JSON.stringify(evidence));
}
try { main(); } catch (error) {
  console.error('REPOSITORY_NORMALIZATION_A01_QUALIFICATION=FAIL ' + (error && error.stack ? error.stack : error));
  process.exit(1);
}
