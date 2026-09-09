'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const LAB = path.join(ROOT, 'learning', 'lab');
const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || ROOT, `learning-pilot-run001-closed-loop-${Date.now()}`);
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
    'learning/lab/run_pilot001_closed_loop.py',
    'learning/lab/run_pilot001_real_participant.py',
    'learning/lab/learning_lab/real_learner_pilot_completion.py',
    'learning/lab/learning_lab/real_learner_pilot_withdrawal.py',
    'learning/lab/learning_lab/real_learner_pilot_human_session.py'
  ]);

  const focused = run('closed-loop-focused', 'python', [
    '-m', 'unittest', '-v',
    'tests.test_real_learner_pilot_completion',
    'tests.test_real_learner_pilot_closed_loop_launcher',
    'tests.test_real_learner_pilot_console',
    'tests.test_real_learner_pilot_withdrawal',
    'tests.test_real_learner_pilot_human_session',
    'tests.test_real_learner_pilot_runtime_binding',
    'tests.test_real_learner_pilot'
  ], { cwd: LAB });
  const focusedText = focused.stdout + focused.stderr;
  assert(/Ran 50 tests/.test(focusedText), 'EXPECTED_50_CLOSED_LOOP_FOCUSED_TESTS_NOT_OBSERVED');
  assert(/\bOK\b/.test(focusedText), 'CLOSED_LOOP_FOCUSED_SUITE_NOT_OK');

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

  const completion = fs.readFileSync(path.join(LAB, 'learning_lab', 'real_learner_pilot_completion.py'), 'utf8');
  const launcher = fs.readFileSync(path.join(LAB, 'run_pilot001_closed_loop.py'), 'utf8');
  const entry = fs.readFileSync(path.join(LAB, 'run_pilot001.py'), 'utf8');
  assert(completion.includes('RETENTION_MINIMUM_DELAY_SECONDS = 3600'), 'RETENTION_DELAY_BOUNDARY_MISSING');
  assert(completion.includes('PILOT_COMPLETION_CAPTURE_WITHOUT_HUMAN_ATTESTATION'), 'HUMAN_ATTESTATION_FAIL_CLOSED_BOUNDARY_MISSING');
  assert(completion.includes('VERIFICATION_NONPASS_REMEDIATION_PENDING'), 'VERIFICATION_NONPASS_BOUNDARY_MISSING');
  assert(completion.includes('RETENTION_NONPASS_REMEDIATION_PENDING'), 'RETENTION_NONPASS_BOUNDARY_MISSING');
  assert(completion.includes('COMPLETION_READY'), 'TRANSFER_COMPLETION_AUTHORITY_MISSING');
  assert(launcher.includes('turn.get("mode") == "WAIT"'), 'WAIT_RESPONSE_GUARD_MISSING');
  assert(launcher.includes('raw_response_included": False'), 'DIGEST_ONLY_COMPLETION_PACKAGE_BOUNDARY_MISSING');
  assert(entry.includes('import run_pilot001_closed_loop as closed_loop'), 'DEFAULT_CLOSED_LOOP_ENTRYPOINT_MISSING');

  fs.writeFileSync(path.join(evidenceDir, 'truth-boundary.txt'), [
    'PILOT_RUN001_CLOSED_LOOP=PASS',
    'PILOT_RUN001_CLOSED_LOOP_FOCUSED_TESTS=50',
    'PILOT_RUN001_PREDECESSOR_REGRESSIONS=57',
    'PILOT_RUN001_TOTAL_TESTS=107',
    'PILOT_RUN001_FROZEN_V1_CHANGED=FALSE',
    'PILOT_RUN001_EARLY_RETENTION_PROMPT_ALLOWED=FALSE',
    'PILOT_RUN001_WAIT_RESPONSE_COLLECTION_ALLOWED=FALSE',
    'PILOT_RUN001_COMPLETION_REQUIRES_TRANSFER_TO_COURSE_COMPLETE=TRUE',
    'PILOT_RUN001_COMPLETION_PACKAGE_RAW_RESPONSE=FALSE',
    'PILOT_RUN001_REAL_PARTICIPANT_EVIDENCE=NOT_CREATED',
    'PILOT_RUN001_CONSENT_INFERRED=FALSE',
    'PILOT_RUN001_A01_MAY_SUPPLY_PARTICIPANT_RESPONSE=FALSE',
    ''
  ].join('\n'));

  console.log('PILOT_RUN001_CLOSED_LOOP_STATUS=PASS');
  console.log('PILOT_RUN001_CLOSED_LOOP_FOCUSED_TESTS=50');
  console.log('PILOT_RUN001_PREDECESSOR_REGRESSIONS=57');
  console.log('PILOT_RUN001_TOTAL_TESTS=107');
  console.log('PILOT_RUN001_FROZEN_V1_CHANGED=FALSE');
  console.log('PILOT_RUN001_REAL_PARTICIPANT_EVIDENCE=NOT_CREATED');
  console.log('PILOT_RUN001_CONSENT_INFERRED=FALSE');
} catch (error) {
  fs.writeFileSync(path.join(evidenceDir, 'qualifier-failure.txt'), `${error.stack || error.message}\n`);
  console.error(error.stack || error.message);
  process.exit(1);
}
