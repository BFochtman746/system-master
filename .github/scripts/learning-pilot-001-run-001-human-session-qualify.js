'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const LAB = path.join(ROOT, 'learning', 'lab');
const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || ROOT, `learning-pilot-run001-${Date.now()}`);
fs.mkdirSync(evidenceDir, { recursive: true });

function run(name, command, args, options = {}) {
  const started = Date.now();
  const result = cp.spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, ...(options.env || {}) }
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  fs.writeFileSync(path.join(evidenceDir, `${name}.stdout.txt`), stdout);
  fs.writeFileSync(path.join(evidenceDir, `${name}.stderr.txt`), stderr);
  fs.writeFileSync(path.join(evidenceDir, `${name}.timing.txt`), `${Math.max(0, Date.now() - started)}\n`);
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${name.toUpperCase()}_FAILED:${result.status}`);
  return { stdout, stderr };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const subject = (process.env.A01_SUBJECT_SHA || process.env.GITHUB_SHA || '').trim();
  assert(/^[0-9a-f]{40}$/i.test(subject), `INVALID_SUBJECT_SHA:${subject}`);
  fs.writeFileSync(path.join(evidenceDir, 'subject-sha.txt'), `${subject}\n`);

  run('python-version', 'python', ['--version']);
  run('compile', 'python', [
    '-m', 'py_compile',
    'learning/lab/learning_lab/real_learner_pilot_human_session.py',
    'learning/lab/learning_lab/real_learner_pilot_runtime_binding.py',
    'learning/lab/system_master_real_learner_human_session_bridge.py'
  ]);

  const focused = run('focused-human-session', 'python', [
    '-m', 'unittest', '-v',
    'tests.test_real_learner_pilot_human_session',
    'tests.test_real_learner_pilot_runtime_binding',
    'tests.test_real_learner_pilot'
  ], { cwd: LAB });
  assert(/Ran 26 tests/.test(focused.stderr + focused.stdout), 'EXPECTED_26_FOCUSED_TESTS_NOT_OBSERVED');
  assert(/OK/.test(focused.stderr + focused.stdout), 'FOCUSED_TEST_SUITE_NOT_OK');

  const regressions = run('learning-predecessor-regressions', 'python', [
    '-m', 'unittest', '-v',
    'tests.test_unified_fresh_evidence_recovery',
    'tests.test_fresh_evidence_provider_acquisition',
    'tests.test_fresh_evidence_configured_http',
    'tests.test_fresh_evidence_admission',
    'tests.test_unified_turn_controller',
    'tests.test_adaptive_journey_continuation',
    'tests.test_provider_multi_candidate_runtime'
  ], { cwd: LAB });
  assert(/Ran 57 tests/.test(regressions.stderr + regressions.stdout), 'EXPECTED_57_REGRESSION_TESTS_NOT_OBSERVED');
  assert(/OK/.test(regressions.stderr + regressions.stdout), 'REGRESSION_SUITE_NOT_OK');

  const humanModule = fs.readFileSync(path.join(LAB, 'learning_lab', 'real_learner_pilot_human_session.py'), 'utf8');
  const bridge = fs.readFileSync(path.join(LAB, 'system_master_real_learner_human_session_bridge.py'), 'utf8');
  assert(humanModule.includes('HUMAN_PILOT_RESPONSE_SOURCE_REQUIRED'), 'human source gate missing');
  assert(humanModule.includes('HUMAN_PILOT_INDEPENDENT_ASSISTANCE_FORBIDDEN'), 'assistance gate missing');
  assert(humanModule.includes('HUMAN_PILOT_INDEPENDENT_ANSWER_REVEAL_FORBIDDEN'), 'answer-reveal gate missing');
  assert(humanModule.includes('STAGE_1_COMPLETE_RETENTION_PENDING'), 'retention-pending standing missing');
  assert(humanModule.includes('RETENTION_MINIMUM_DELAY_SECONDS = 3600'), 'retention minimum changed');
  assert(bridge.includes('HUMAN_SESSION_BRIDGE_RAW_RESPONSE_LEAK'), 'bridge raw-response leak gate missing');

  fs.writeFileSync(path.join(evidenceDir, 'human-boundary.txt'), [
    'PILOT_RUN001_HUMAN_SOURCE_ATTESTATION=REQUIRED',
    'PILOT_RUN001_INDEPENDENT_ASSISTANCE=FORBIDDEN',
    'PILOT_RUN001_INDEPENDENT_ANSWER_REVEAL=FORBIDDEN',
    'PILOT_RUN001_RAW_RESPONSE_PILOT_PERSISTENCE=FORBIDDEN',
    'PILOT_RUN001_RETENTION_MINIMUM_SECONDS=3600',
    'PILOT_RUN001_A01_MAY_MANUFACTURE_HUMAN_EVIDENCE=FALSE',
    'PILOT_RUN001_REAL_PARTICIPANT_EVIDENCE=NOT_PROVEN_BY_QUALIFICATION',
    ''
  ].join('\n'));

  console.log('PILOT_RUN001_HUMAN_SESSION_STATUS=PASS');
  console.log('PILOT_RUN001_FOCUSED_TESTS=26');
  console.log('PILOT_RUN001_PREDECESSOR_REGRESSIONS=57');
  console.log('PILOT_RUN001_TOTAL_TESTS=83');
  console.log('PILOT_RUN001_RAW_RESPONSE_PERSISTENCE=NONE');
  console.log('PILOT_RUN001_HUMAN_EVIDENCE_MANUFACTURED=FALSE');
} catch (error) {
  fs.writeFileSync(path.join(evidenceDir, 'qualifier-failure.txt'), `${error.stack || error.message}\n`);
  console.error(error.stack || error.message);
  process.exit(1);
}
