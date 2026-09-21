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
  if (!SHA_RE.test(EXPECTED_SHA)) fail(`INVALID_A01_SUBJECT_SHA:${EXPECTED_SHA}`);
  const actual = gitHead();
  if (actual !== EXPECTED_SHA) fail(`SUBJECT_CHECKOUT_MISMATCH expected=${EXPECTED_SHA} actual=${actual}`);
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  const syntaxTargets = [
    'tools/second_shift_supervisor_v2.py',
    'control-gateway/python/a01_supervisor_adapter.py',
    'control-gateway/python/a01_supervisor_coordination.py',
    'control-gateway/python/a01_supervisor_coordination_strict.py',
    'control-gateway/python/a01_night_scheduler.py',
    'control-gateway/python/a01_github_ingress.py',
    'control-gateway/python/a01_model_dispatch.py',
    'control-gateway/python/a01_execution_worker.py',
    'control-gateway/python/a01_second_shift_001g_ai_coding_smoke.py',
    'tests/test_control_gateway_a01_supervisor_adapter.py',
    'tests/test_control_gateway_a01_supervisor_coordination.py',
    'tests/test_control_gateway_a01_supervisor_coordination_authority.py',
    'tests/test_control_gateway_a01_night_scheduler.py',
    'tests/test_a01_github_ingress.py',
    'tests/test_a01_model_dispatch.py',
    'tests/test_a01_execution_worker_ai_coding.py',
    'tests/test_a01_second_shift_001g_ai_coding_smoke.py',
    'tests/test_control_gateway_failure_restart_idempotency.py',
    'tests/run_control_gateway_failure_restart_idempotency_bounded.py',
    'tests/test_control_gateway_cg011_dispatch_failure_replay.py',
    'tests/test_control_gateway_cg011_adversarial_closure.py',
    'tests/run_second_shift_supervisor_v2_optimized.py',
  ];
  const stages = [];
  const stage = (name, exe, args, options = {}) => {
    console.log(`CG011_A01_STAGE_START=${name}`);
    run(exe, args, options);
    stages.push(name);
    writeJson(path.join(EVIDENCE_DIR, 'cg011-cumulative-stage-progress.json'), {
      evidence_version: 1,
      subject_sha: actual,
      completed_stages: stages,
    integrated_001c_coverage: ['AI_GITHUB_INGRESS', 'AI_MODEL_DISPATCH', 'AI_EXECUTION_WORKER_EVALUATOR', 'MASTERY_CONTRACTS'],
    });
    console.log(`CG011_A01_STAGE_PASS=${name}`);
  };

  stage('PYTHON_COMPILE', 'python', ['-m', 'py_compile', ...syntaxTargets], { timeout: 120000 });
  stage('CONTROL_GATEWAY_NODE_SUITE', 'node', ['--test'], { cwd: path.join(ROOT, 'control-gateway'), timeout: 180000 });
  stage('A01_GITHUB_INGRESS', 'python', ['tests/test_a01_github_ingress.py'], { timeout: 180000 });
  stage('A01_MODEL_DISPATCH', 'python', ['tests/test_a01_model_dispatch.py'], { timeout: 180000 });
  stage('A01_EXECUTION_WORKER_AI_CODING', 'python', ['tests/test_a01_execution_worker_ai_coding.py'], { timeout: 180000 });
  stage('A01_LIVE_AI_CODING_SMOKE', 'python', ['control-gateway/python/a01_second_shift_001g_ai_coding_smoke.py'], { timeout: 20 * 60 * 1000 });
  const aiCodingSmokePath = path.join(EVIDENCE_DIR, 'second-shift-001g-ai-coding-smoke-summary.json');
  if (!fs.existsSync(aiCodingSmokePath)) fail('A01_LIVE_AI_CODING_SMOKE_EVIDENCE_MISSING');
  const aiCodingSmoke = readJson(aiCodingSmokePath);
  if (
    aiCodingSmoke.state !== 'PASS' ||
    aiCodingSmoke.subject_sha !== actual ||
    aiCodingSmoke.model !== 'Qwen3-Coder-30B-A3B-Instruct-GGUF' ||
    aiCodingSmoke.live_ready_queue_touched !== false ||
    aiCodingSmoke.repository_commit_authority_granted !== false ||
    aiCodingSmoke.root_checkout_mutated !== false
  ) fail('A01_LIVE_AI_CODING_SMOKE_EVIDENCE_INVALID');
  stage('CG008_SUPERVISOR_ADAPTER', 'python', ['tests/test_control_gateway_a01_supervisor_adapter.py'], { timeout: 120000 });
  stage('CG009_COORDINATION_BASE', 'python', ['tests/test_control_gateway_a01_supervisor_coordination.py'], { timeout: 120000 });
  stage('CG009_COORDINATION_AUTHORITY', 'python', ['tests/test_control_gateway_a01_supervisor_coordination_authority.py'], { timeout: 120000 });
  stage('CG010_NIGHT_SCHEDULER', 'python', ['tests/test_control_gateway_a01_night_scheduler.py'], { timeout: 180000 });
  stage('CG011_FAILURE_RESTART_IDEMPOTENCY', 'python', ['tests/run_control_gateway_failure_restart_idempotency_bounded.py'], { timeout: 300000 });
  stage('CG011_DISPATCH_FAILURE_REPLAY', 'python', ['tests/test_control_gateway_cg011_dispatch_failure_replay.py'], { timeout: 120000 });
  stage('CG011_20K_STRESS', 'python', ['tests/run_second_shift_supervisor_v2_optimized.py'], { timeout: 600000 });

  const reportPath = path.join(ROOT, '.second-shift-supervisor-v2-stress.json');
  if (!fs.existsSync(reportPath)) fail('SUPERVISOR_STRESS_EVIDENCE_MISSING');
  const report = readJson(reportPath);
  if (report.successful !== true || report.failures !== 0 || report.errors !== 0) fail('SUPERVISOR_STRESS_NOT_SUCCESSFUL');
  if (report.randomized_transitions !== 20000 || report.rigor_reduced !== false) fail('SUPERVISOR_STRESS_RIGOR_MISMATCH');

  stage('CG011_ADVERSARIAL_CLOSURE', 'python', ['tests/test_control_gateway_cg011_adversarial_closure.py'], { timeout: 180000 });
  stage('MASTERY_CONTRACT_REGRESSION', 'node', ['--test', 'tests/test_second_shift_mastery_contracts.js'], { timeout: 120000 });

  const evidence = {
    evidence_version: 4,
    qualification_id: process.env.A01_QUALIFICATION_ID || 'SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS',
    workstream_id: process.env.A01_WORKSTREAM_ID || 'SECOND-SHIFT-CONTROL-GATEWAY',
    subject_sha: actual,
    foundation_rule: 'BOTTOM_UP_INDIVIDUAL_THEN_CUMULATIVE_THEN_TARGET_HOST',
    cumulative_modules: ['CG-008', 'CG-009', 'CG-010', 'CG-011'],
    completed_stages: stages,
    adapter_contract: 'control-gateway.a01-supervisor-handoff.v1',
    scheduling_owner: 'A01_SUPERVISOR',
    github_role: 'ADMISSION_TRANSPORT_EVIDENCE_ONLY',
    live_ai_coding_smoke: aiCodingSmoke,
    supervisor_stress: report,
  };
  writeJson(path.join(EVIDENCE_DIR, 'second-shift-supervisor-v2-stress.json'), report);
  writeJson(path.join(EVIDENCE_DIR, 'cg011-a01-cumulative-qualification.json'), evidence);
  console.log('CG011_A01_CUMULATIVE_QUALIFIER=PASS');
}

try { main(); }
catch (error) {
  console.error(`CG011_A01_CUMULATIVE_QUALIFIER=FAIL ${error && error.stack ? error.stack : error}`);
  process.exit(1);
}
