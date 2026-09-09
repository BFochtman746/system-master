'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const LAB = path.join(ROOT, 'learning', 'lab');
const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || ROOT, `learning-pilot-run001-closed-loop-overnight-${Date.now()}`);
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

try {
  const subject = (process.env.A01_SUBJECT_SHA || process.env.GITHUB_SHA || '').trim();
  assert(/^[0-9a-f]{40}$/i.test(subject), `INVALID_SUBJECT_SHA:${subject}`);
  fs.writeFileSync(path.join(evidenceDir, 'subject-sha.txt'), `${subject}\n`);

  // First prove the exact promotion boundary, frozen PILOT-001-v1 authority,
  // 50 focused closed-loop tests, 57 predecessor regressions, and truth guards.
  run('promotion-boundary', 'node', ['.github/scripts/learning-pilot-001-run-001-closed-loop-qualify.js'], {
    env: { A01_SUBJECT_SHA: subject, A01_EVIDENCE_DIR: evidenceDir },
  });

  // Then broaden to every Learning Lab unittest on the exact Windows/X64 subject.
  // This intentionally catches regressions outside the hand-selected predecessor set.
  const full = run('full-learning-lab-suite', 'python', [
    '-m', 'unittest', 'discover', '-v', '-s', 'tests', '-p', 'test_*.py'
  ], { cwd: LAB, env: { PYTHONHASHSEED: '0' } });
  const fullText = full.stdout + full.stderr;
  const fullCount = observedTestCount(fullText, 'FULL_LEARNING_LAB');
  assert(/\bOK\b/.test(fullText), 'FULL_LEARNING_LAB_SUITE_NOT_OK');
  assert(fullCount >= 107, `FULL_LEARNING_LAB_SUITE_TOO_SMALL:${fullCount}`);
  fs.writeFileSync(path.join(evidenceDir, 'full-learning-lab-test-count.txt'), `${fullCount}\n`);

  // Repeat the integrity-critical closed-loop modules under several deterministic
  // hash seeds. This is qualification-only synthetic-fixture execution; it is not
  // a learner record and cannot be used as participant evidence.
  const criticalModules = [
    'tests.test_real_learner_pilot_completion',
    'tests.test_real_learner_pilot_closed_loop_launcher',
    'tests.test_real_learner_pilot_console',
    'tests.test_real_learner_pilot_withdrawal',
    'tests.test_real_learner_pilot_human_session',
    'tests.test_real_learner_pilot_runtime_binding',
    'tests.test_real_learner_pilot',
  ];
  const seeds = ['1', '7', '42', '99'];
  let repeatedTests = 0;
  for (const seed of seeds) {
    const result = run(`critical-seed-${seed}`, 'python', ['-m', 'unittest', '-v', ...criticalModules], {
      cwd: LAB,
      env: { PYTHONHASHSEED: seed },
    });
    const text = result.stdout + result.stderr;
    const count = observedTestCount(text, `CRITICAL_SEED_${seed}`);
    assert(count === 50, `CRITICAL_SEED_${seed}_EXPECTED_50_GOT_${count}`);
    assert(/\bOK\b/.test(text), `CRITICAL_SEED_${seed}_NOT_OK`);
    repeatedTests += count;
  }

  const entry = fs.readFileSync(path.join(LAB, 'run_pilot001.py'), 'utf8');
  const completion = fs.readFileSync(path.join(LAB, 'learning_lab', 'real_learner_pilot_completion.py'), 'utf8');
  assert(entry.includes('run_pilot001_closed_loop'), 'DEFAULT_ENTRYPOINT_NOT_CLOSED_LOOP');
  assert(completion.includes('RETENTION_MINIMUM_DELAY_SECONDS = 3600'), 'RETENTION_MINIMUM_DELAY_DRIFT');
  assert(completion.includes('PILOT_COMPLETION_CAPTURE_WITHOUT_HUMAN_ATTESTATION'), 'HUMAN_ATTESTATION_FAIL_CLOSED_DRIFT');

  const truth = [
    'PILOT_RUN001_CLOSED_LOOP_OVERNIGHT=PASS',
    `PILOT_RUN001_FULL_LEARNING_LAB_TESTS=${fullCount}`,
    `PILOT_RUN001_CRITICAL_REPEAT_TESTS=${repeatedTests}`,
    'PILOT_RUN001_CRITICAL_HASH_SEEDS=1,7,42,99',
    'PILOT_RUN001_FROZEN_V1_CHANGED=FALSE',
    'PILOT_RUN001_WINDOWS_X64_FULL_SUITE_REQUIRED=TRUE',
    'PILOT_RUN001_REAL_PARTICIPANT_EVIDENCE=NOT_CREATED',
    'PILOT_RUN001_CONSENT_INFERRED=FALSE',
    'PILOT_RUN001_A01_MAY_SUPPLY_PARTICIPANT_RESPONSE=FALSE',
    'PILOT_RUN001_SYNTHETIC_FIXTURES_ARE_HUMAN_EVIDENCE=FALSE',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(evidenceDir, 'overnight-truth-boundary.txt'), truth);

  console.log('PILOT_RUN001_CLOSED_LOOP_OVERNIGHT_STATUS=PASS');
  console.log(`PILOT_RUN001_FULL_LEARNING_LAB_TESTS=${fullCount}`);
  console.log(`PILOT_RUN001_CRITICAL_REPEAT_TESTS=${repeatedTests}`);
  console.log('PILOT_RUN001_REAL_PARTICIPANT_EVIDENCE=NOT_CREATED');
} catch (error) {
  fs.writeFileSync(path.join(evidenceDir, 'overnight-qualifier-failure.txt'), `${error.stack || error.message}\n`);
  console.error(error.stack || error.message);
  process.exit(1);
}
