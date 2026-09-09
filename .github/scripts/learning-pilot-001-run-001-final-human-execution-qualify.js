'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const LAB = path.join(ROOT, 'learning', 'lab');
const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || os.tmpdir(), `learning-pilot-run001-final-human-${Date.now()}`);
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
    env: { ...process.env, ...(options.env || {}) },
    maxBuffer: 128 * 1024 * 1024,
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  fs.writeFileSync(path.join(evidenceDir, `${name}.stdout.txt`), stdout);
  fs.writeFileSync(path.join(evidenceDir, `${name}.stderr.txt`), stderr);
  fs.writeFileSync(path.join(evidenceDir, `${name}.timing-ms.txt`), `${Math.max(0, Date.now() - started)}\n`);
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${name.toUpperCase()}_FAILED:${result.status}`);
  return { stdout, stderr };
}

function observedTestCount(text, name) {
  const matches = [...text.matchAll(/Ran (\d+) tests?/g)];
  assert(matches.length > 0, `${name}_TEST_COUNT_NOT_OBSERVED`);
  return Number(matches[matches.length - 1][1]);
}

function gitOutput(args, failureCode) {
  const result = cp.spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${failureCode}:${result.status}:${(result.stderr || result.stdout || '').trim()}`);
  }
  return (result.stdout || '').trim();
}

function assertCleanCheckout(subject) {
  const head = gitOutput(['rev-parse', 'HEAD'], 'GIT_HEAD_LOOKUP_FAILED');
  assert(head.toLowerCase() === subject.toLowerCase(), `SUBJECT_HEAD_MISMATCH:expected=${subject}:actual=${head}`);

  const status = gitOutput(['status', '--porcelain=v1', '--untracked-files=all'], 'GIT_STATUS_FAILED');
  fs.writeFileSync(path.join(evidenceDir, 'checkout-cleanliness.txt'), [
    `subject=${subject}`,
    `head=${head}`,
    `index_worktree_clean=${status === '' ? 'TRUE' : 'FALSE'}`,
    status ? `status=${status.replace(/\r?\n/g, ' | ')}` : 'status=',
    '',
  ].join('\n'));
  assert(status === '', `GIT_INDEX_WORKTREE_NOT_CLEAN:${status.replace(/\r?\n/g, '|')}`);
}

function gitBlobAt(subject, file) {
  const objectId = gitOutput(['rev-parse', `${subject}:${file}`], `GIT_OBJECT_LOOKUP_FAILED:${file}`);
  assert(/^[0-9a-f]{40,64}$/i.test(objectId), `INVALID_GIT_OBJECT_ID:${file}:${objectId}`);
  const type = gitOutput(['cat-file', '-t', objectId], `GIT_OBJECT_TYPE_LOOKUP_FAILED:${file}`);
  assert(type === 'blob', `FROZEN_AUTHORITY_NOT_BLOB:${file}:${type}`);
  return objectId;
}

function assertSuite(name, modules, expectedCount, seed = '0') {
  const result = run(name, 'python', ['-m', 'unittest', '-v', ...modules], {
    cwd: LAB,
    env: { PYTHONHASHSEED: seed },
  });
  const text = result.stdout + result.stderr;
  const count = observedTestCount(text, name.toUpperCase().replace(/-/g, '_'));
  assert(count === expectedCount, `${name.toUpperCase()}_EXPECTED_${expectedCount}_GOT_${count}`);
  assert(/\bOK\b/.test(text), `${name.toUpperCase()}_NOT_OK`);
  return count;
}

try {
  const subject = (process.env.A01_SUBJECT_SHA || process.env.GITHUB_SHA || '').trim();
  assert(/^[0-9a-f]{40}$/i.test(subject), `INVALID_SUBJECT_SHA:${subject}`);
  fs.writeFileSync(path.join(evidenceDir, 'subject-sha.txt'), `${subject}\n`);

  assertCleanCheckout(subject);

  const frozen = {
    'learning/lab/LEARNING_LAB_PILOT_001_PROTOCOL.md': '0db3de824060f4eb7ce3c2c7ffa0ed4b57ba9d35',
    'learning/lab/learning_lab/real_learner_pilot.py': '0c9f7a8b7850cef15643e3c11899585d2c25a08d',
    'learning/lab/tests/test_real_learner_pilot.py': 'e77d423078af4662f2c72b0cc1f8501e20d29851',
    'learning/lab/qualification_pilot001.py': '44aa0124f194f074a421f0a87a0695d96d7bae11',
  };
  const frozenLines = [];
  for (const [file, expected] of Object.entries(frozen)) {
    const actual = gitBlobAt(subject, file);
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
    'learning/lab/run_pilot001_review_intake.py',
    'learning/lab/learning_lab/real_learner_pilot_completion.py',
    'learning/lab/learning_lab/real_learner_pilot_handoff.py',
    'learning/lab/learning_lab/real_learner_pilot_preflight.py',
    'learning/lab/learning_lab/real_learner_pilot_review_intake.py',
    'learning/lab/learning_lab/real_learner_pilot_withdrawal.py',
    'learning/lab/learning_lab/real_learner_pilot_human_session.py',
  ]);

  const closedLoopModules = [
    'tests.test_real_learner_pilot_completion',
    'tests.test_real_learner_pilot_closed_loop_launcher',
    'tests.test_real_learner_pilot_console',
    'tests.test_real_learner_pilot_withdrawal',
    'tests.test_real_learner_pilot_human_session',
    'tests.test_real_learner_pilot_runtime_binding',
    'tests.test_real_learner_pilot',
  ];
  const predecessorModules = [
    'tests.test_unified_fresh_evidence_recovery',
    'tests.test_fresh_evidence_provider_acquisition',
    'tests.test_fresh_evidence_configured_http',
    'tests.test_fresh_evidence_admission',
    'tests.test_unified_turn_controller',
    'tests.test_adaptive_journey_continuation',
    'tests.test_provider_multi_candidate_runtime',
  ];
  const evidenceModules = [
    'tests.test_real_learner_pilot_review_intake',
    'tests.test_real_learner_pilot_evidence_notice',
    'tests.test_real_learner_pilot_handoff',
    'tests.test_real_learner_pilot_preflight',
  ];

  const closedLoopCount = assertSuite('closed-loop-current', closedLoopModules, 54);
  const predecessorCount = assertSuite('predecessor-regressions', predecessorModules, 57);
  const evidenceCount = assertSuite('local-first-evidence-boundary', evidenceModules, 13);

  const full = run('full-learning-lab-suite', 'python', [
    '-m', 'unittest', 'discover', '-v', '-s', 'tests', '-p', 'test_*.py',
  ], { cwd: LAB, env: { PYTHONHASHSEED: '0' } });
  const fullText = full.stdout + full.stderr;
  const fullCount = observedTestCount(fullText, 'FULL_LEARNING_LAB');
  assert(fullCount === 698, `FULL_LEARNING_LAB_EXPECTED_698_GOT_${fullCount}`);
  assert(/\bOK\b/.test(fullText), 'FULL_LEARNING_LAB_SUITE_NOT_OK');
  fs.writeFileSync(path.join(evidenceDir, 'full-learning-lab-test-count.txt'), `${fullCount}\n`);

  const seeds = ['1', '7', '42', '99'];
  let repeatedTests = 0;
  for (const seed of seeds) {
    repeatedTests += assertSuite(`critical-seed-${seed}`, closedLoopModules, 54, seed);
  }

  const policy = fs.readFileSync(path.join(LAB, 'PILOT_001_RUN_001_EVIDENCE_HANDLING.md'), 'utf8');
  const consent = fs.readFileSync(path.join(LAB, 'PILOT_001_RUN_001_PARTICIPANT_CONSENT.md'), 'utf8');
  const entry = fs.readFileSync(path.join(LAB, 'run_pilot001.py'), 'utf8');
  const launcher = fs.readFileSync(path.join(LAB, 'run_pilot001_closed_loop.py'), 'utf8');
  const completion = fs.readFileSync(path.join(LAB, 'learning_lab', 'real_learner_pilot_completion.py'), 'utf8');
  const handoff = fs.readFileSync(path.join(LAB, 'learning_lab', 'real_learner_pilot_handoff.py'), 'utf8');
  const review = fs.readFileSync(path.join(LAB, 'learning_lab', 'real_learner_pilot_review_intake.py'), 'utf8');
  const reviewCli = fs.readFileSync(path.join(LAB, 'run_pilot001_review_intake.py'), 'utf8');

  assert(completion.includes('RETENTION_MINIMUM_DELAY_SECONDS = 3600'), 'RETENTION_DELAY_BOUNDARY_MISSING');
  assert(completion.includes('PILOT_COMPLETION_CAPTURE_WITHOUT_HUMAN_ATTESTATION'), 'HUMAN_ATTESTATION_FAIL_CLOSED_BOUNDARY_MISSING');
  assert(completion.includes('COMPLETION_READY'), 'TRANSFER_COMPLETION_AUTHORITY_MISSING');
  assert(launcher.includes('turn.get("mode") == "WAIT"'), 'WAIT_RESPONSE_GUARD_MISSING');
  assert(launcher.includes('raw_response_included": False'), 'DIGEST_ONLY_COMPLETION_PACKAGE_BOUNDARY_MISSING');
  assert(handoff.includes('local_hash_files_alone_prevent_malicious_rewrite": False'), 'HANDOFF_LOCAL_HASH_TRUTH_BOUNDARY_MISSING');
  assert(policy.includes('Local-by-default storage'), 'LOCAL_FIRST_POLICY_MISSING');
  assert(policy.includes('MUST NOT automatically'), 'NO_AUTOMATIC_UPLOAD_POLICY_MISSING');
  assert(policy.includes('Local review-intake generation is NOT external-export authorization'), 'EXPORT_AUTHORITY_BOUNDARY_MISSING');
  assert(consent.includes('stored locally on the pilot machine by default'), 'CONSENT_LOCAL_STORAGE_NOTICE_MISSING');
  assert(consent.includes('does not automatically upload'), 'CONSENT_NO_AUTO_UPLOAD_NOTICE_MISSING');
  assert(entry.includes('Pilot evidence is stored locally on this machine by default'), 'PARTICIPANT_ENTRY_LOCAL_NOTICE_MISSING');
  assert(entry.includes('does not automatically upload pilot evidence to GitHub'), 'PARTICIPANT_ENTRY_NO_UPLOAD_NOTICE_MISSING');
  assert(review.includes('external_upload_performed": False'), 'REVIEW_INTAKE_UPLOAD_FALSE_MISSING');
  assert(review.includes('external_anchor_created": False'), 'REVIEW_INTAKE_ANCHOR_FALSE_MISSING');
  assert(review.includes('external_export_authorized_by_this_packet": False'), 'REVIEW_INTAKE_EXPORT_AUTH_FALSE_MISSING');
  assert(reviewCli.includes('No network upload is performed'), 'REVIEW_CLI_NO_NETWORK_NOTICE_MISSING');

  const networkSignals = ['import requests', 'from requests', 'import urllib', 'from urllib', 'import http.client', 'import socket'];
  for (const signal of networkSignals) {
    assert(!review.includes(signal), `REVIEW_INTAKE_NETWORK_CAPABILITY_FORBIDDEN:${signal}`);
    assert(!reviewCli.includes(signal), `REVIEW_CLI_NETWORK_CAPABILITY_FORBIDDEN:${signal}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot001-final-human-preflight-'));
  try {
    const preflight = run('participant-entry-preflight', 'python', [
      'learning/lab/run_pilot001.py', '--state-root', tempRoot, '--preflight-only',
    ]);
    const preflightText = preflight.stdout + preflight.stderr;
    assert(preflightText.includes('READY_FOR_EXPLICIT_PARTICIPANT_CONSENT'), 'PARTICIPANT_PREFLIGHT_NOT_READY');
    assert(preflightText.includes('Pilot evidence is stored locally on this machine by default'), 'PARTICIPANT_PREFLIGHT_LOCAL_NOTICE_NOT_SHOWN');
    assert(preflightText.includes('does not automatically upload pilot evidence to GitHub'), 'PARTICIPANT_PREFLIGHT_NO_UPLOAD_NOTICE_NOT_SHOWN');
    const residue = fs.readdirSync(tempRoot);
    assert(residue.length === 0, `PREFLIGHT_CREATED_PARTICIPANT_STATE:${residue.join(',')}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  const truth = [
    'PILOT_RUN001_FINAL_HUMAN_EXECUTION_QUALIFIER=PASS',
    `PILOT_RUN001_CLOSED_LOOP_CURRENT_TESTS=${closedLoopCount}`,
    `PILOT_RUN001_PREDECESSOR_REGRESSIONS=${predecessorCount}`,
    `PILOT_RUN001_LOCAL_FIRST_EVIDENCE_TESTS=${evidenceCount}`,
    `PILOT_RUN001_FULL_LEARNING_LAB_TESTS=${fullCount}`,
    `PILOT_RUN001_CRITICAL_REPEAT_TESTS=${repeatedTests}`,
    'PILOT_RUN001_CRITICAL_HASH_SEEDS=1,7,42,99',
    'PILOT_RUN001_FROZEN_V1_CHANGED=FALSE',
    'PILOT_RUN001_PARTICIPANT_STORAGE_DEFAULT=LOCAL',
    'PILOT_RUN001_AUTOMATIC_EXTERNAL_UPLOAD=FALSE',
    'PILOT_RUN001_REVIEW_INTAKE_IS_EXPORT_AUTHORITY=FALSE',
    'PILOT_RUN001_EXTERNAL_ANCHOR_CREATED=FALSE',
    'PILOT_RUN001_RAW_PARTICIPANT_RESPONSE_RETAINED=FALSE',
    'PILOT_RUN001_DIRECT_PII_RETAINED=FALSE',
    'PILOT_RUN001_REAL_PARTICIPANT_EVIDENCE=NOT_CREATED',
    'PILOT_RUN001_CONSENT_INFERRED=FALSE',
    'PILOT_RUN001_A01_MAY_SUPPLY_PARTICIPANT_RESPONSE=FALSE',
    'PILOT_RUN001_SINGLE_PARTICIPANT_PROVES_POPULATION_EFFECTIVENESS=FALSE',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(evidenceDir, 'final-human-execution-truth-boundary.txt'), truth);

  console.log('PILOT_RUN001_FINAL_HUMAN_EXECUTION_STATUS=PASS');
  console.log(`PILOT_RUN001_CLOSED_LOOP_CURRENT_TESTS=${closedLoopCount}`);
  console.log(`PILOT_RUN001_PREDECESSOR_REGRESSIONS=${predecessorCount}`);
  console.log(`PILOT_RUN001_LOCAL_FIRST_EVIDENCE_TESTS=${evidenceCount}`);
  console.log(`PILOT_RUN001_FULL_LEARNING_LAB_TESTS=${fullCount}`);
  console.log(`PILOT_RUN001_CRITICAL_REPEAT_TESTS=${repeatedTests}`);
  console.log('PILOT_RUN001_REAL_PARTICIPANT_EVIDENCE=NOT_CREATED');
} catch (error) {
  fs.writeFileSync(path.join(evidenceDir, 'final-human-execution-qualifier-failure.txt'), `${error.stack || error.message}\n`);
  console.error(error.stack || error.message);
  process.exit(1);
}
