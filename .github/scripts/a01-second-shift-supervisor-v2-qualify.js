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
    maxBuffer: 64 * 1024 * 1024,
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
  const inCi = process.env.GITHUB_ACTIONS === 'true';
  const optIn = process.env.SYSTEM_MASTER_RUN_CI_ONLY === '1';
  if (!SHA_RE.test(EXPECTED_SHA) && !inCi && !optIn) {
    console.log('SKIP A01-SECOND-SHIFT-SUPERVISOR-V2 reason=CI_ONLY_GATE detail=requires_A01_SUBJECT_SHA_or_GITHUB_SHA_equal_to_HEAD override=SYSTEM_MASTER_RUN_CI_ONLY=1');
    return;
  }
  const subject = SHA_RE.test(EXPECTED_SHA) ? EXPECTED_SHA : gitHead();
  if (!SHA_RE.test(subject)) fail(`INVALID_A01_SUBJECT_SHA:${subject}`);
  const actual = gitHead();
  if (actual !== subject) fail(`SUBJECT_CHECKOUT_MISMATCH expected=${subject} actual=${actual}`);
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  const syntaxTargets = [
    'tools/second_shift_supervisor_v2.py',
    'control-gateway/python/a01_supervisor_adapter.py',
    'control-gateway/python/a01_supervisor_coordination.py',
    'control-gateway/python/a01_supervisor_coordination_strict.py',
    'control-gateway/python/a01_night_scheduler.py',
    'control-gateway/python/a01_execution_worker.py',
    'control-gateway/python/a01_execution_service.py',
    'tests/test_control_gateway_a01_supervisor_adapter.py',
    'tests/test_control_gateway_a01_supervisor_coordination.py',
    'tests/test_control_gateway_a01_supervisor_coordination_authority.py',
    'tests/test_control_gateway_a01_night_scheduler.py',
    'tests/test_control_gateway_a01_execution_worker.py',
    'tests/test_a01_execution_service.py',
    'control-gateway/python/a01_run_now_once.py',
    'tests/test_a01_user_directed_run_now.py',
    'tests/test_a01_run_now_once.py',
    'tests/test_control_gateway_failure_restart_idempotency.py',
    'tests/run_control_gateway_failure_restart_idempotency_bounded.py',
    'tests/test_control_gateway_cg011_dispatch_failure_replay.py',
    'tests/test_control_gateway_cg011_adversarial_closure.py',
    'tests/test_second_shift_supervisor_p10_foundation.py',
    'tests/run_second_shift_supervisor_v2_optimized.py',
  ];
  const stages = [];
  const stage = (name, exe, args, options = {}) => {
    console.log(`CG011_A01_STAGE_START=${name}`);
    run(exe, args, options);
    stages.push(name);
    writeJson(path.join(EVIDENCE_DIR, 'cg011-cumulative-stage-progress.json'), {
      evidence_version: 2,
      subject_sha: actual,
      completed_stages: stages,
    });
    console.log(`CG011_A01_STAGE_PASS=${name}`);
  };

  stage('PYTHON_COMPILE', 'python', ['-m', 'py_compile', ...syntaxTargets], { timeout: 120000 });
  stage('P10_FOUNDATION_INVARIANTS', 'python', ['tests/test_second_shift_supervisor_p10_foundation.py'], { timeout: 180000 });
  stage('CONTROL_GATEWAY_NODE_SUITE', 'node', ['--test'], { cwd: path.join(ROOT, 'control-gateway'), timeout: 180000 });
  stage('CG008_SUPERVISOR_ADAPTER', 'python', ['tests/test_control_gateway_a01_supervisor_adapter.py'], { timeout: 120000 });
  stage('CG009_COORDINATION_BASE', 'python', ['tests/test_control_gateway_a01_supervisor_coordination.py'], { timeout: 120000 });
  stage('CG009_COORDINATION_AUTHORITY', 'python', ['tests/test_control_gateway_a01_supervisor_coordination_authority.py'], { timeout: 120000 });
  stage('CG010_NIGHT_SCHEDULER', 'python', ['tests/test_control_gateway_a01_night_scheduler.py'], { timeout: 180000 });
  stage('PQF_REPAIR_A01_EXECUTION_WORKER', 'python', ['tests/test_control_gateway_a01_execution_worker.py'], { timeout: 240000 });
  stage('PQF_REPAIR_A01_EXECUTION_SERVICE', 'python', ['tests/test_a01_execution_service.py'], { timeout: 120000 });
  stage('USER_DIRECTED_RUN_NOW', 'python', ['tests/test_a01_user_directed_run_now.py'], { timeout: 120000 });
  stage('USER_DIRECTED_RUN_NOW_LIVE_PATH', 'python', ['tests/test_a01_run_now_once.py'], { timeout: 120000 });
  stage('GATE4_REPAIR_WAVE1_FOUNDATIONS', 'node', ['.github/scripts/a01-autonomous-repository-repair-wave1-qualify.js'], { timeout: 180000 });
  stage('GATE4_MUTATION_READINESS', 'node', ['--test', 'control-gateway/test/a01-repository-repair-mutation-readiness.test.js'], { timeout: 180000 });
  stage('GATE4_LIVE_REPAIR_PREFLIGHT', 'node', ['.github/scripts/a01-repository-repair-preflight.js'], { timeout: 180000 });
  stage('CG011_FAILURE_RESTART_IDEMPOTENCY', 'python', ['tests/run_control_gateway_failure_restart_idempotency_bounded.py'], { timeout: 300000 });
  stage('CG011_DISPATCH_FAILURE_REPLAY', 'python', ['tests/test_control_gateway_cg011_dispatch_failure_replay.py'], { timeout: 120000 });
  stage('CG011_20K_STRESS', 'python', ['tests/run_second_shift_supervisor_v2_optimized.py'], { timeout: 600000 });

  const reportPath = path.join(ROOT, '.second-shift-supervisor-v2-stress.json');
  if (!fs.existsSync(reportPath)) fail('SUPERVISOR_STRESS_EVIDENCE_MISSING');
  const report = readJson(reportPath);
  if (report.successful !== true || report.failures !== 0 || report.errors !== 0) fail('SUPERVISOR_STRESS_NOT_SUCCESSFUL');
  if (report.randomized_transitions !== 20000 || report.rigor_reduced !== false) fail('SUPERVISOR_STRESS_RIGOR_MISMATCH');

  stage('CG011_ADVERSARIAL_CLOSURE', 'python', ['tests/test_control_gateway_cg011_adversarial_closure.py'], { timeout: 180000 });

  const evidence = {
    evidence_version: 5,
    qualification_id: process.env.A01_QUALIFICATION_ID || 'SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS',
    workstream_id: process.env.A01_WORKSTREAM_ID || 'SECOND-SHIFT-CONTROL-GATEWAY',
    subject_sha: actual,
    foundation_requirement: 'P10',
    foundation_rule: 'TARGETED_P10_INVARIANTS_THEN_BOTTOM_UP_CUMULATIVE_THEN_TARGET_HOST',
    p10_invariants: [
      'EXACTLY_ONE_CLAIM_WINNER_UNDER_32_WAY_CONTENTION',
      'RECOVERY_FENCES_STALE_WORKER_WRITES',
      'LEASE_AND_HEARTBEAT_BOUNDARY_REASON_SEMANTICS',
      'CIRCUIT_NEXT_PROBE_ON_RETRY_BUDGET_EXHAUSTION',
      'AUDIT_INVARIANT_CORRUPTION_DETECTION',
    ],
    pqf_repair_a01_001_invariants: [
      'EXACTLY_ONE_EXECUTOR_INVOCATION_FOR_OVERLAPPING_WORKERS',
      'STALE_EXECUTION_GENERATION_CANNOT_MUTATE_TERMINAL_RESULT',
      'RECOVERY_ROTATES_EXECUTION_GENERATION_BEFORE_REPLAY',
      'RECONCILIATION_REQUIRED_EXECUTION_IS_NOT_AUTO_REPLAYED',
      'RECOVERY_IDENTITY_MISMATCH_FAILS_CLOSED',
      'ATTEMPT_EVIDENCE_IDENTITY_IS_GENERATION_SCOPED',
      'FENCE_LOSS_TERMINATES_MANAGED_PROCESS_TREE_ON_TARGET_HOST',
      'PRODUCTION_SERVICE_REGISTERS_A01_REPOSITORY_REPAIR',
      'REPOSITORY_REPAIR_RETRY_REQUIRES_RECONCILIATION',
    ],
    gate4_repository_repair_invariants: [
      'READ_ONLY_WAVE1_FOUNDATIONS_PASS',
      'LIVE_REPAIR_PREFLIGHT_SAFE_TO_REPAIR',
      'EXACT_SUBJECT_MUTATION_READINESS_REQUIRED',
      'REPAIR_CLAIM_AND_FENCE_REQUIRED',
      'DEVELOPMENT_RESPONSE_RECEIPT_REQUIRED',
      'SYSTEM_FILE_LEASE_REQUIRED',
      'EXACT_PREDECESSOR_CAS_REQUIRED',
      'DIRECT_A01_GITHUB_WRITE_AUTHORITY_FALSE',
      'PROMOTION_AUTHORITY_FALSE',
      'BRANCH_DELETION_AUTHORITY_FALSE',
    ],
    cumulative_modules: ['P10', 'CG-008', 'CG-009', 'CG-010', 'CG-011', 'PQF-REPAIR-A01-001', 'A01-EXECUTION-SERVICE', 'A01-REPOSITORY-REPAIR-WAVE1', 'GATE4-MUTATION-READINESS'],
    completed_stages: stages,
    adapter_contract: 'control-gateway.a01-supervisor-handoff.v1',
    execution_worker_protocol: 'control-gateway.a01-execution-worker.v1',
    repair_mutation_readiness_protocol: 'control-gateway.a01-repository-repair-mutation-readiness.v1',
    scheduling_owner: 'A01_SUPERVISOR',
    github_role: 'ADMISSION_TRANSPORT_EVIDENCE_ONLY',
    supervisor_stress: report,
  };
  writeJson(path.join(EVIDENCE_DIR, 'second-shift-supervisor-v2-stress.json'), report);
  writeJson(path.join(EVIDENCE_DIR, 'cg011-a01-cumulative-qualification.json'), evidence);
  console.log('GATE4_REPOSITORY_REPAIR_MUTATION_READINESS=PASS');
  console.log('PQF_REPAIR_A01_001_EXECUTION_WORKER=PASS');
  console.log('PQF_REPAIR_A01_EXECUTION_SERVICE=PASS');
  console.log('CG011_A01_CUMULATIVE_QUALIFIER=PASS');
  console.log('P10_FOUNDATION_INVARIANTS=PASS');
}

try { main(); }
catch (error) {
  console.error(`CG011_A01_CUMULATIVE_QUALIFIER=FAIL ${error && error.stack ? error.stack : error}`);
  process.exit(1);
}
