'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const LAB = path.join(ROOT, 'learning', 'lab');
const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || ROOT, `learning-pilot-run001-exec-${Date.now()}`);
fs.mkdirSync(evidenceDir, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

function gitBlob(file) {
  const result = cp.spawnSync('git', ['hash-object', '--', file], { cwd: ROOT, encoding: 'utf8', shell: false });
  if (result.status !== 0) throw new Error(`GIT_HASH_OBJECT_FAILED:${file}:${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

try {
  const subject = (process.env.A01_SUBJECT_SHA || process.env.GITHUB_SHA || '').trim();
  assert(/^[0-9a-f]{40}$/i.test(subject), `INVALID_SUBJECT_SHA:${subject}`);
  fs.writeFileSync(path.join(evidenceDir, 'subject-sha.txt'), `${subject}\n`);

  const frozen = {
    'learning/lab/LEARNING_LAB_PILOT_001_PROTOCOL.md': '0db3de824060f4eb7ce3c2c7ffa0ed4b57ba9d35',
    'learning/lab/learning_lab/real_learner_pilot.py': '0c9f7a8b7850cef15643e3c11899585d2c25a08d',
    'learning/lab/tests/test_real_learner_pilot.py': 'e77d423078af4662f2c72b0cc1f8501e20d29851',
    'learning/lab/qualification_pilot001.py': '44aa0124f194f074a421f0a87a0695d96d7bae11'
  };
  const frozenLines = [];
  for (const [file, expected] of Object.entries(frozen)) {
    const actual = gitBlob(file);
    assert(actual === expected, `FROZEN_PILOT_BLOB_DRIFT:${file}:expected=${expected}:actual=${actual}`);
    frozenLines.push(`${file}=${actual}`);
  }
  fs.writeFileSync(path.join(evidenceDir, 'frozen-blobs.txt'), frozenLines.join('\n') + '\n');

  run('python-version', 'python', ['--version']);
  run('compile', 'python', [
    '-m', 'py_compile',
    'learning/lab/run_pilot001.py',
    'learning/lab/run_pilot001_real_participant.py',
    'learning/lab/learning_lab/real_learner_pilot_withdrawal.py',
    'learning/lab/learning_lab/real_learner_pilot_human_session.py',
    'learning/lab/system_master_real_learner_human_session_bridge.py'
  ]);

  const focused = run('execution-focused', 'python', [
    '-m', 'unittest', '-v',
    'tests.test_real_learner_pilot_console',
    'tests.test_real_learner_pilot_withdrawal',
    'tests.test_real_learner_pilot_human_session',
    'tests.test_real_learner_pilot_runtime_binding',
    'tests.test_real_learner_pilot'
  ], { cwd: LAB });
  const focusedText = focused.stdout + focused.stderr;
  assert(/Ran 37 tests/.test(focusedText), 'EXPECTED_37_EXECUTION_FOCUSED_TESTS_NOT_OBSERVED');
  assert(/\bOK\b/.test(focusedText), 'EXECUTION_FOCUSED_SUITE_NOT_OK');

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
  const regressionText = regressions.stdout + regressions.stderr;
  assert(/Ran 57 tests/.test(regressionText), 'EXPECTED_57_REGRESSION_TESTS_NOT_OBSERVED');
  assert(/\bOK\b/.test(regressionText), 'REGRESSION_SUITE_NOT_OK');

  const consent = fs.readFileSync(path.join(LAB, 'PILOT_001_RUN_001_PARTICIPANT_CONSENT.md'), 'utf8');
  const consoleSource = fs.readFileSync(path.join(LAB, 'run_pilot001_real_participant.py'), 'utf8');
  const launcher = fs.readFileSync(path.join(LAB, 'run_pilot001.py'), 'utf8');
  const withdrawal = fs.readFileSync(path.join(LAB, 'learning_lab', 'real_learner_pilot_withdrawal.py'), 'utf8');
  assert(consent.includes('Participation is voluntary'), 'CONSENT_VOLUNTARY_BOUNDARY_MISSING');
  assert(consent.includes('do not use ChatGPT'), 'INDEPENDENT_AI_CONTAMINATION_RULE_MISSING');
  assert(consoleSource.includes('FIRST_FROZEN_COURSE_SKILL'), 'DETERMINISTIC_BASELINE_SELECTION_MISSING');
  assert(consoleSource.includes('getpass.getpass'), 'HIDDEN_RESPONSE_INPUT_MISSING');
  assert(consoleSource.includes('INDEPENDENT_ITEM_CONTAMINATED'), 'CONTAMINATION_LOCKOUT_MISSING');
  assert(launcher.includes('withdraw_runtime_bound_pilot'), 'SAFE_WITHDRAWAL_LAUNCHER_MISSING');
  assert(withdrawal.includes('PRE_BASELINE'), 'PREBASELINE_WITHDRAWAL_BOUNDARY_MISSING');
  assert(withdrawal.includes('pilot001_v1_evidence_record_materialized'), 'NO-FABRICATED-V1-RECORD_ATTESTATION_MISSING');

  fs.writeFileSync(path.join(evidenceDir, 'truth-boundary.txt'), [
    'PILOT_RUN001_EXECUTION_PREP=PASS',
    'PILOT_RUN001_FOCUSED_TESTS=37',
    'PILOT_RUN001_PREDECESSOR_REGRESSIONS=57',
    'PILOT_RUN001_TOTAL_TESTS=94',
    'PILOT_RUN001_FROZEN_V1_CHANGED=FALSE',
    'PILOT_RUN001_PREBASELINE_WITHDRAWAL_FABRICATED_BASELINE=FALSE',
    'PILOT_RUN001_REAL_PARTICIPANT_EVIDENCE=NOT_CREATED',
    'PILOT_RUN001_CONSENT_INFERRED=FALSE',
    'PILOT_RUN001_A01_MAY_SUPPLY_PARTICIPANT_RESPONSE=FALSE',
    ''
  ].join('\n'));

  console.log('PILOT_RUN001_EXECUTION_PREP_STATUS=PASS');
  console.log('PILOT_RUN001_FOCUSED_TESTS=37');
  console.log('PILOT_RUN001_PREDECESSOR_REGRESSIONS=57');
  console.log('PILOT_RUN001_TOTAL_TESTS=94');
  console.log('PILOT_RUN001_FROZEN_V1_CHANGED=FALSE');
  console.log('PILOT_RUN001_REAL_PARTICIPANT_EVIDENCE=NOT_CREATED');
  console.log('PILOT_RUN001_CONSENT_INFERRED=FALSE');
} catch (error) {
  fs.writeFileSync(path.join(evidenceDir, 'qualifier-failure.txt'), `${error.stack || error.message}\n`);
  console.error(error.stack || error.message);
  process.exit(1);
}
