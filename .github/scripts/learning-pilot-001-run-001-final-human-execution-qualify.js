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

try {
  const subject = (process.env.A01_SUBJECT_SHA || process.env.GITHUB_SHA || '').trim();
  assert(/^[0-9a-f]{40}$/i.test(subject), `INVALID_SUBJECT_SHA:${subject}`);
  fs.writeFileSync(path.join(evidenceDir, 'subject-sha.txt'), `${subject}\n`);

  // Inherit the full closed-loop qualification: frozen protocol authority,
  // promotion boundary, complete Learning Lab discovery, and repeated critical
  // integrity tests under deterministic hash seeds. This creates synthetic
  // qualification evidence only; it cannot stand in for a participant.
  run('closed-loop-base', 'node', ['.github/scripts/learning-pilot-001-run-001-closed-loop-overnight-qualify.js'], {
    env: { A01_SUBJECT_SHA: subject, A01_EVIDENCE_DIR: evidenceDir },
  });

  const evidenceModules = [
    'tests.test_real_learner_pilot_review_intake',
    'tests.test_real_learner_pilot_evidence_notice',
    'tests.test_real_learner_pilot_handoff',
    'tests.test_real_learner_pilot_preflight',
  ];
  const focused = run('local-first-evidence-boundary', 'python', ['-m', 'unittest', '-v', ...evidenceModules], {
    cwd: LAB,
    env: { PYTHONHASHSEED: '0' },
  });
  const focusedText = focused.stdout + focused.stderr;
  const focusedCount = observedTestCount(focusedText, 'LOCAL_FIRST_EVIDENCE_BOUNDARY');
  assert(focusedCount === 13, `LOCAL_FIRST_EVIDENCE_BOUNDARY_EXPECTED_13_GOT_${focusedCount}`);
  assert(/\bOK\b/.test(focusedText), 'LOCAL_FIRST_EVIDENCE_BOUNDARY_NOT_OK');

  const policy = fs.readFileSync(path.join(LAB, 'PILOT_001_RUN_001_EVIDENCE_HANDLING.md'), 'utf8');
  const consent = fs.readFileSync(path.join(LAB, 'PILOT_001_RUN_001_PARTICIPANT_CONSENT.md'), 'utf8');
  const entry = fs.readFileSync(path.join(LAB, 'run_pilot001.py'), 'utf8');
  const review = fs.readFileSync(path.join(LAB, 'learning_lab', 'real_learner_pilot_review_intake.py'), 'utf8');
  const reviewCli = fs.readFileSync(path.join(LAB, 'run_pilot001_review_intake.py'), 'utf8');

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
      'learning/lab/run_pilot001.py', '--state-root', tempRoot, '--preflight-only'
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
    `PILOT_RUN001_LOCAL_FIRST_EVIDENCE_TESTS=${focusedCount}`,
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
  console.log(`PILOT_RUN001_LOCAL_FIRST_EVIDENCE_TESTS=${focusedCount}`);
  console.log('PILOT_RUN001_REAL_PARTICIPANT_EVIDENCE=NOT_CREATED');
} catch (error) {
  fs.writeFileSync(path.join(evidenceDir, 'final-human-execution-qualifier-failure.txt'), `${error.stack || error.message}\n`);
  console.error(error.stack || error.message);
  process.exit(1);
}
