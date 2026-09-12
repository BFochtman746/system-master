'use strict';

const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.env.A01_SUBJECT_ROOT || process.env.GITHUB_WORKSPACE || '.');
const EVIDENCE_DIR = path.resolve(process.env.A01_EVIDENCE_DIR || path.join(ROOT, '.a01-second-shift-evidence'));
const EXPECTED_SHA = String(process.env.A01_SUBJECT_SHA || process.env.GITHUB_SHA || '').trim().toLowerCase();
const SHA_RE = /^[0-9a-f]{40}$/;

function fail(message) { throw new Error(message); }
function run(exe, args, options = {}) {
  const result = cp.spawnSync(exe, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) fail(`${exe} spawn failed: ${result.error.message}`);
  if (result.status !== 0) fail(`${exe} ${args.join(' ')} failed with exit ${result.status}`);
  return result;
}
function gitHead() { return run('git', ['rev-parse', 'HEAD']).stdout.trim().toLowerCase(); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }

function main() {
  if (!SHA_RE.test(EXPECTED_SHA)) fail(`INVALID_A01_SUBJECT_SHA:${EXPECTED_SHA}`);
  const actual = gitHead();
  if (actual !== EXPECTED_SHA) fail(`SUBJECT_CHECKOUT_MISMATCH expected=${EXPECTED_SHA} actual=${actual}`);
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  const syntaxTargets = [
    'tools/second_shift_supervisor_v2.py',
    'tests/test_second_shift_supervisor_v2.py',
    'tests/run_second_shift_supervisor_v2_optimized.py',
    'control-gateway/python/a01_supervisor_adapter.py',
    'tests/test_control_gateway_a01_supervisor_adapter.py',
  ];
  run('python', ['-m', 'py_compile', ...syntaxTargets]);
  run('python', ['tests/test_control_gateway_a01_supervisor_adapter.py']);
  run('python', ['tests/run_second_shift_supervisor_v2_optimized.py']);

  const reportPath = path.join(ROOT, '.second-shift-supervisor-v2-stress.json');
  if (!fs.existsSync(reportPath)) fail('SUPERVISOR_STRESS_EVIDENCE_MISSING');
  const report = readJson(reportPath);
  if (report.successful !== true || report.failures !== 0 || report.errors !== 0) fail('SUPERVISOR_STRESS_NOT_SUCCESSFUL');
  if (report.randomized_transitions !== 20000 || report.rigor_reduced !== false) fail('SUPERVISOR_STRESS_RIGOR_MISMATCH');

  const evidence = {
    evidence_version: 1,
    qualification_id: process.env.A01_QUALIFICATION_ID || 'SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS',
    workstream_id: process.env.A01_WORKSTREAM_ID || 'SECOND-SHIFT-CONTROL-GATEWAY',
    subject_sha: actual,
    adapter_contract: 'control-gateway.a01-supervisor-handoff.v1',
    scheduling_owner: 'A01_SUPERVISOR',
    github_role: 'ADMISSION_TRANSPORT_EVIDENCE_ONLY',
    supervisor_stress: report,
  };
  writeJson(path.join(EVIDENCE_DIR, 'second-shift-supervisor-v2-stress.json'), report);
  writeJson(path.join(EVIDENCE_DIR, 'cg008-supervisor-integration.json'), evidence);
  console.log('CG008_A01_SUPERVISOR_QUALIFIER=PASS');
}

try { main(); }
catch (error) {
  console.error(`CG008_A01_SUPERVISOR_QUALIFIER=FAIL ${error && error.stack ? error.stack : error}`);
  process.exit(1);
}
