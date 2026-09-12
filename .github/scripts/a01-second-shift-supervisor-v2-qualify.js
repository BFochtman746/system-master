'use strict';

const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.env.A01_SUBJECT_ROOT || process.env.GITHUB_WORKSPACE || '.');
const EVIDENCE_DIR = path.resolve(process.env.A01_EVIDENCE_DIR || path.join(ROOT, '.a01-second-shift-evidence'));
const EXPECTED_SHA = String(process.env.A01_SUBJECT_SHA || process.env.GITHUB_SHA || '').trim().toLowerCase();
const SHA_RE = /^[0-9a-f]{40}$/;
const CG011_FROZEN_BASE = 'f4f3787f90788e964fcd2b12872a7a10392d78c1';
const ALLOWED_HARNESS_CHANGES = new Set([
  '.github/scripts/a01-second-shift-supervisor-v2-qualify.js',
  '.github/workflows/second-shift-control-gateway-cg-011-a01-host-qualification.yml',
]);

function fail(message) { throw new Error(message); }
function run(exe, args, options = {}) {
  const result = cp.spawnSync(exe, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 240000,
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

function assertQualificationHarnessOnly() {
  run('git', ['merge-base', '--is-ancestor', CG011_FROZEN_BASE, 'HEAD']);
  const changed = run('git', ['diff', '--name-only', `${CG011_FROZEN_BASE}..HEAD`]).stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const forbidden = changed.filter((name) => !ALLOWED_HARNESS_CHANGES.has(name));
  if (forbidden.length) fail(`CG011_PRODUCT_BYTES_CHANGED_AFTER_FREEZE:${forbidden.join(',')}`);
  return changed;
}

function assertGithubSchedulerRetired() {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'a01-overnight-night-shift.yml'), 'utf8');
  const failures = [];
  if (/^\s*schedule\s*:/m.test(workflow)) failures.push('schedule trigger remains');
  if (/cron\s*:/m.test(workflow)) failures.push('cron remains');
  if (/slot_0[1-8]/.test(workflow)) failures.push('slot-chain scheduling remains');
  if (workflow.includes('a01-overnight-plan.js')) failures.push('GitHub night planner remains wired');
  if (workflow.includes('uses: ./.github/workflows/a01-control-plane-gateway.yml')) failures.push('workflow still dispatches A-01 work');
  if (!workflow.includes('GITHUB_SCHEDULER_RETIRED=1')) failures.push('retirement marker missing');
  if (!workflow.includes('A01_SCHEDULING_OWNER=SecondShiftSupervisorV2')) failures.push('A-01 ownership marker missing');
  if (failures.length) fail(`CG011_GITHUB_SCHEDULER_RETIREMENT_FAILED:${failures.join('; ')}`);
}

function main() {
  if (!SHA_RE.test(EXPECTED_SHA)) fail(`INVALID_A01_SUBJECT_SHA:${EXPECTED_SHA}`);
  const actual = gitHead();
  if (actual !== EXPECTED_SHA) fail(`SUBJECT_CHECKOUT_MISMATCH expected=${EXPECTED_SHA} actual=${actual}`);
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  const changedHarnessFiles = assertQualificationHarnessOnly();
  assertGithubSchedulerRetired();

  run('node', ['.github/scripts/validate-system-topology.js']);
  run('node', ['--test'], { cwd: path.join(ROOT, 'control-gateway'), timeout: 300000 });

  const syntaxTargets = [
    'tools/second_shift_supervisor_v2.py',
    'control-gateway/python/a01_supervisor_adapter.py',
    'control-gateway/python/a01_supervisor_coordination.py',
    'control-gateway/python/a01_supervisor_coordination_strict.py',
    'control-gateway/python/a01_night_scheduler.py',
    'tests/test_control_gateway_a01_supervisor_adapter.py',
    'tests/test_control_gateway_a01_supervisor_coordination.py',
    'tests/test_control_gateway_a01_supervisor_coordination_authority.py',
    'tests/test_control_gateway_a01_night_scheduler.py',
    'tests/test_control_gateway_failure_restart_idempotency.py',
    'tests/run_control_gateway_failure_restart_idempotency_bounded.py',
    'tests/test_control_gateway_cg011_adversarial_closure.py',
    'tests/test_control_gateway_cg011_dispatch_failure_replay.py',
    'tests/test_second_shift_supervisor_v2.py',
    'tests/run_second_shift_supervisor_v2_optimized.py',
  ];
  run('python', ['-m', 'py_compile', ...syntaxTargets]);

  const gates = [
    ['CG008_HANDOFF', 'tests/test_control_gateway_a01_supervisor_adapter.py'],
    ['CG009_COORDINATION', 'tests/test_control_gateway_a01_supervisor_coordination.py'],
    ['CG009_AUTHORITY_CLOSURE', 'tests/test_control_gateway_a01_supervisor_coordination_authority.py'],
    ['CG010_NIGHT_SCHEDULER', 'tests/test_control_gateway_a01_night_scheduler.py'],
    ['CG011_FAILURE_RESTART_IDEMPOTENCY', 'tests/run_control_gateway_failure_restart_idempotency_bounded.py'],
    ['CG011_DISPATCH_FAILURE_REPLAY', 'tests/test_control_gateway_cg011_dispatch_failure_replay.py'],
    ['CG011_ADVERSARIAL_CLOSURE', 'tests/test_control_gateway_cg011_adversarial_closure.py'],
    ['SUPERVISOR_CRASH_CONCURRENCY_STRESS', 'tests/run_second_shift_supervisor_v2_optimized.py'],
  ];
  const completedGates = [];
  for (const [gate, script] of gates) {
    console.log(`A01_CUMULATIVE_GATE_START=${gate}`);
    run('python', [script], { timeout: gate === 'SUPERVISOR_CRASH_CONCURRENCY_STRESS' ? 300000 : 180000 });
    completedGates.push(gate);
    console.log(`A01_CUMULATIVE_GATE_PASS=${gate}`);
  }

  const reportPath = path.join(ROOT, '.second-shift-supervisor-v2-stress.json');
  if (!fs.existsSync(reportPath)) fail('SUPERVISOR_STRESS_EVIDENCE_MISSING');
  const report = readJson(reportPath);
  if (report.successful !== true || report.failures !== 0 || report.errors !== 0) fail('SUPERVISOR_STRESS_NOT_SUCCESSFUL');
  if (report.randomized_transitions !== 20000 || report.rigor_reduced !== false) fail('SUPERVISOR_STRESS_RIGOR_MISMATCH');

  const evidence = {
    evidence_version: 2,
    qualification_id: process.env.A01_QUALIFICATION_ID || 'SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS',
    workstream_id: process.env.A01_WORKSTREAM_ID || 'SECOND-SHIFT-CONTROL-GATEWAY',
    subject_sha: actual,
    frozen_product_base_sha: CG011_FROZEN_BASE,
    frozen_product_bytes_unchanged: true,
    harness_changes_only: changedHarnessFiles,
    target_host: {
      os: process.env.RUNNER_OS || null,
      arch: process.env.RUNNER_ARCH || null,
      name: process.env.RUNNER_NAME || null,
    },
    foundation_build_rule: 'INDIVIDUAL_THEN_CUMULATIVE_THEN_REAL_HOST_BEFORE_FREEZE',
    cumulative_gates: completedGates,
    adapter_contract: 'control-gateway.a01-supervisor-handoff.v1',
    scheduling_owner: 'A01_SUPERVISOR',
    github_role: 'ADMISSION_TRANSPORT_EVIDENCE_ONLY',
    supervisor_stress: report,
  };
  writeJson(path.join(EVIDENCE_DIR, 'second-shift-supervisor-v2-stress.json'), report);
  writeJson(path.join(EVIDENCE_DIR, 'cg011-a01-cumulative-foundation.json'), evidence);
  writeJson(path.join(EVIDENCE_DIR, 'cg008-supervisor-integration.json'), evidence);
  console.log('CG011_A01_CUMULATIVE_FOUNDATION_QUALIFIER=PASS');
}

try { main(); }
catch (error) {
  console.error(`CG011_A01_CUMULATIVE_FOUNDATION_QUALIFIER=FAIL ${error && error.stack ? error.stack : error}`);
  process.exit(1);
}
