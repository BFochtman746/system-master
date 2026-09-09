'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const runnerTemp = process.env.RUNNER_TEMP || path.join(workspace, '.tmp-book-system-lifecycle-transition');
const runId = process.env.GITHUB_RUN_ID || 'local';
const evidenceDir = path.join(runnerTemp, `book-system-lifecycle-transition-001-${runId}`);
fs.mkdirSync(evidenceDir, { recursive: true });

const contractRel = 'qualification/book-system/lifecycle-transition-001/BOOK-SYSTEM-LIFECYCLE-TRANSITION-ENGINE-001.json';
const fixturesRel = 'qualification/book-system/lifecycle-transition-001/LIFECYCLE-TRANSITION-FIXTURES-001.json';
const coreRel = 'system-master/book-system/lifecycle-transition-engine.js';
const runtimeRel = 'system-master/book-system/lifecycle-transition-engine-runtime.js';
const qualifierRel = '.github/scripts/book-system-lifecycle-transition-001-qualify.js';
const contractPath = path.join(workspace, ...contractRel.split('/'));
const fixturesPath = path.join(workspace, ...fixturesRel.split('/'));
const runtimePath = path.join(workspace, ...runtimeRel.split('/'));
const runtime = require(runtimePath);

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function deepMerge(target, patch) {
  if (!isObject(patch)) return clone(patch);
  const out = isObject(target) ? clone(target) : {};
  for (const [key, value] of Object.entries(patch)) out[key] = isObject(value) ? deepMerge(out[key], value) : clone(value);
  return out;
}
function fail(code, detail = '') { const error = new Error(detail ? `${code}:${detail}` : code); error.code = code; throw error; }
function sha256Bytes(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function run(command, args) { return spawnSync(command, args, { cwd: workspace, encoding: 'utf8', windowsHide: true, shell: false }); }
function gitHead() {
  const result = run('git', ['-c', `safe.directory=${workspace}`, 'rev-parse', 'HEAD']);
  if (result.error || result.status !== 0) fail('GIT_HEAD_FAILED', result.stderr || '');
  return result.stdout.trim();
}
function gitBlobSha256(repoPath) {
  const result = spawnSync('git', ['-c', `safe.directory=${workspace}`, 'show', `HEAD:${repoPath}`], { cwd: workspace, encoding: null, windowsHide: true, shell: false });
  if (result.error || result.status !== 0) fail('GIT_BLOB_READ_FAILED', repoPath);
  return sha256Bytes(result.stdout || Buffer.alloc(0));
}
function writeEvidence(name, value) { fs.writeFileSync(path.join(evidenceDir, name), String(value), 'utf8'); }

function prepareState(fixtures, testCase = {}) {
  let parent = deepMerge(fixtures.base_parent_state, testCase.parent_patch || {});
  let ledger = deepMerge(fixtures.base_lifecycle_ledger, {});
  if (testCase.unit_patch) {
    for (const [unitRef, patch] of Object.entries(testCase.unit_patch)) {
      ledger.unit_states[unitRef] = deepMerge(ledger.unit_states[unitRef] || {}, patch);
    }
  }
  ledger.bound_parent_state_version = parent.state_version;
  ledger.bound_parent_state_digest = runtime.digestParentState(parent);
  runtime.validateLedger(JSON.parse(fs.readFileSync(contractPath, 'utf8')), parent, ledger);
  return { parent, ledger };
}

function materializeRequest(requestInput, parent, ledger) {
  const request = clone(requestInput);
  if (request.expected_parent_state_version === undefined) request.expected_parent_state_version = parent.state_version;
  if (request.expected_parent_state_digest === undefined) request.expected_parent_state_digest = runtime.digestParentState(parent);
  if (request.expected_ledger_version === undefined) request.expected_ledger_version = ledger.ledger_version;
  if (request.expected_ledger_digest === undefined) request.expected_ledger_digest = runtime.digestLedger(ledger);
  return request;
}

function expectRejected(fn, expectedCode) {
  try {
    fn();
  } catch (error) {
    if (error instanceof runtime.TransitionError || error.code) {
      if (error.code !== expectedCode) fail('REJECTION_CODE_MISMATCH', `expected=${expectedCode}:actual=${error.code}`);
      return { code: error.code, detail: error.detail || '' };
    }
    throw error;
  }
  fail('EXPECTED_REJECTION_DID_NOT_OCCUR', expectedCode);
}

try {
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  if (contract.engine_id !== fixtures.engine_id) fail('FIXTURE_ENGINE_ID_MISMATCH');
  if (contract.engine_version !== 1) fail('ENGINE_VERSION_MISMATCH');
  if (fixtures.cases.length !== 18) fail('FIXTURE_CASE_COUNT_MISMATCH', String(fixtures.cases.length));

  const results = [];
  for (const testCase of fixtures.cases) {
    const { parent, ledger } = prepareState(fixtures, testCase);
    const originalParentDigest = runtime.digestParentState(parent);
    const originalLedgerDigest = runtime.digestLedger(ledger);
    let actual = 'PASS';
    let code = null;
    let detail = {};

    try {
      if (testCase.type === 'SINGLE') {
        const request = materializeRequest(testCase.request, parent, ledger);
        if (testCase.expected === 'REJECT') {
          const rejection = expectRejected(() => runtime.applyTransition(contract, parent, ledger, request), testCase.expected_code);
          actual = 'REJECT';
          code = rejection.code;
          detail = { rejection_detail: rejection.detail };
        } else {
          const result = runtime.applyTransition(contract, parent, ledger, request);
          if (result.disposition !== 'COMMITTED') fail('EXPECTED_COMMITTED_DISPOSITION');
          if (testCase.expected_parent_status && result.parent_state.book_project.status !== testCase.expected_parent_status) fail('PARENT_STATUS_MISMATCH');
          if (testCase.expected_unit_status && result.lifecycle_ledger.unit_states[testCase.request.target_ref].status !== testCase.expected_unit_status) fail('UNIT_STATUS_MISMATCH');
          if (testCase.expected_parent_version_delta !== undefined && result.parent_state.state_version !== parent.state_version + testCase.expected_parent_version_delta) fail('PARENT_VERSION_DELTA_MISMATCH');
          if (testCase.expected_ledger_version_delta !== undefined && result.lifecycle_ledger.ledger_version !== ledger.ledger_version + testCase.expected_ledger_version_delta) fail('LEDGER_VERSION_DELTA_MISMATCH');
          if (result.receipt.pre_parent_state_digest !== originalParentDigest || result.receipt.pre_ledger_digest !== originalLedgerDigest) fail('RECEIPT_PRESTATE_IDENTITY_MISMATCH');
          detail = { receipt_id: result.receipt.transition_receipt_id, disposition: result.disposition };
        }
      } else if (testCase.type === 'DEFER_RESUME') {
        const deferRequest = materializeRequest(testCase.defer_request, parent, ledger);
        const deferred = runtime.applyTransition(contract, parent, ledger, deferRequest);
        if (deferred.lifecycle_ledger.unit_states[testCase.defer_request.target_ref].status !== 'DEFERRED') fail('DEFER_STATUS_NOT_SET');
        const resumeRequest = materializeRequest(testCase.resume_request, deferred.parent_state, deferred.lifecycle_ledger);
        const resumed = runtime.applyTransition(contract, deferred.parent_state, deferred.lifecycle_ledger, resumeRequest);
        if (resumed.lifecycle_ledger.unit_states[testCase.resume_request.target_ref].status !== testCase.expected_restored_status) fail('DEFERRED_STATUS_NOT_RESTORED');
        detail = { deferred_receipt: deferred.receipt.transition_receipt_id, resumed_receipt: resumed.receipt.transition_receipt_id };
      } else if (testCase.type === 'INVALIDATE') {
        const request = materializeRequest(testCase.request, parent, ledger);
        const result = runtime.applyTransition(contract, parent, ledger, request);
        const invalidated = [];
        for (const ref of testCase.expected_invalidated) {
          if (result.lifecycle_ledger.unit_states[ref].status !== 'INVALIDATED_BY_UPSTREAM_CHANGE') fail('EXPECTED_UNIT_NOT_INVALIDATED', ref);
          invalidated.push(ref);
        }
        const receiptInvalidated = [testCase.request.target_ref, ...result.receipt.invalidated_unit_refs].sort();
        const expected = [...testCase.expected_invalidated].sort();
        if (JSON.stringify(receiptInvalidated) !== JSON.stringify(expected)) fail('INVALIDATION_RECEIPT_CLOSURE_MISMATCH');
        detail = { invalidated };
      } else if (testCase.type === 'INVALIDATE_RESTORE') {
        const invalidateRequest = materializeRequest(testCase.invalidate_request, parent, ledger);
        const invalidated = runtime.applyTransition(contract, parent, ledger, invalidateRequest);
        const restoreRequest = materializeRequest(testCase.restore_request, invalidated.parent_state, invalidated.lifecycle_ledger);
        const restored = runtime.applyTransition(contract, invalidated.parent_state, invalidated.lifecycle_ledger, restoreRequest);
        if (restored.lifecycle_ledger.unit_states[testCase.restore_request.target_ref].status !== testCase.expected_restored_status) fail('INVALIDATED_STATUS_NOT_RESTORED');
        if (testCase.expected_downstream_remains_invalidated) {
          for (const ref of ['SCENE:001', 'PASSAGE:001']) if (restored.lifecycle_ledger.unit_states[ref].status !== 'INVALIDATED_BY_UPSTREAM_CHANGE') fail('DOWNSTREAM_INVALIDATION_LOST', ref);
        }
        detail = { invalidate_receipt: invalidated.receipt.transition_receipt_id, restore_receipt: restored.receipt.transition_receipt_id };
      } else if (testCase.type === 'REPLAY') {
        const request = materializeRequest(testCase.request, parent, ledger);
        const first = runtime.applyTransition(contract, parent, ledger, request);
        const postParentDigest = runtime.digestParentState(first.parent_state);
        const postLedgerDigest = runtime.digestLedger(first.lifecycle_ledger);
        const second = runtime.applyTransition(contract, first.parent_state, first.lifecycle_ledger, request);
        if (second.disposition !== testCase.expected_second_disposition) fail('REPLAY_DISPOSITION_MISMATCH');
        if (runtime.digestParentState(second.parent_state) !== postParentDigest || runtime.digestLedger(second.lifecycle_ledger) !== postLedgerDigest) fail('REPLAY_DOUBLE_COMMIT_DETECTED');
        if (second.receipt.transition_receipt_id !== first.receipt.transition_receipt_id) fail('REPLAY_RECEIPT_ID_CHANGED');
        detail = { receipt_id: first.receipt.transition_receipt_id, second_disposition: second.disposition };
      } else if (testCase.type === 'IDEMPOTENCY_CONFLICT') {
        const firstRequest = materializeRequest(testCase.first_request, parent, ledger);
        const first = runtime.applyTransition(contract, parent, ledger, firstRequest);
        const secondRequest = deepMerge(firstRequest, testCase.second_request_patch || {});
        const rejection = expectRejected(() => runtime.applyTransition(contract, first.parent_state, first.lifecycle_ledger, secondRequest), testCase.expected_code);
        actual = 'REJECT';
        code = rejection.code;
      } else if (testCase.type === 'REQUEST_ID_CONFLICT') {
        const firstRequest = materializeRequest(testCase.first_request, parent, ledger);
        const first = runtime.applyTransition(contract, parent, ledger, firstRequest);
        const secondRequest = materializeRequest(testCase.second_request, first.parent_state, first.lifecycle_ledger);
        const rejection = expectRejected(() => runtime.applyTransition(contract, first.parent_state, first.lifecycle_ledger, secondRequest), testCase.expected_code);
        actual = 'REJECT';
        code = rejection.code;
      } else if (testCase.type === 'ROLLBACK') {
        const request = materializeRequest(testCase.request, parent, ledger);
        const result = runtime.applyTransition(contract, parent, ledger, request);
        if (result.rollback.parent_state_digest !== originalParentDigest || result.rollback.lifecycle_ledger_digest !== originalLedgerDigest) fail('ROLLBACK_IDENTITY_MISMATCH');
        if (runtime.digestParentState(result.rollback.parent_state) !== originalParentDigest || runtime.digestLedger(result.rollback.lifecycle_ledger) !== originalLedgerDigest) fail('ROLLBACK_PAYLOAD_NOT_EXACT');
        if (result.receipt.rollback_parent_state_digest !== originalParentDigest || result.receipt.rollback_ledger_digest !== originalLedgerDigest) fail('RECEIPT_ROLLBACK_IDENTITY_MISMATCH');
        detail = { rollback_parent_version: result.rollback.parent_state.state_version, rollback_ledger_version: result.rollback.lifecycle_ledger.ledger_version };
      } else {
        fail('UNKNOWN_FIXTURE_CASE_TYPE', testCase.type);
      }
    } catch (error) {
      if (testCase.expected === 'REJECT' && (error instanceof runtime.TransitionError || error.code)) {
        actual = 'REJECT';
        code = error.code;
      } else {
        throw error;
      }
    }

    if (testCase.expected === 'REJECT' && actual !== 'REJECT') fail('FIXTURE_EXPECTATION_MISMATCH', `${testCase.case_id}:expected=REJECT:actual=${actual}`);
    if (testCase.expected === 'PASS' && actual !== 'PASS') fail('FIXTURE_EXPECTATION_MISMATCH', `${testCase.case_id}:expected=PASS:actual=${actual}`);
    if (testCase.expected_code && code && testCase.expected_code !== code) fail('FIXTURE_REJECTION_CODE_MISMATCH', `${testCase.case_id}:${code}`);
    if (testCase.expect_atomic) {
      if (runtime.digestParentState(parent) !== originalParentDigest || runtime.digestLedger(ledger) !== originalLedgerDigest) fail('FAILED_TRANSITION_MUTATED_INPUT', testCase.case_id);
    }
    results.push({ case_id: testCase.case_id, actual, code, detail });
  }

  const commit = gitHead();
  const subject = {
    qualification_id: 'BOOK-SYSTEM-LIFECYCLE-TRANSITION-ENGINE-001',
    repository: process.env.GITHUB_REPOSITORY || '',
    commit,
    runner_name: process.env.RUNNER_NAME || '',
    runner_os: process.env.RUNNER_OS || '',
    runner_arch: process.env.RUNNER_ARCH || '',
    contract_git_blob_sha256: gitBlobSha256(contractRel),
    fixtures_git_blob_sha256: gitBlobSha256(fixturesRel),
    core_git_blob_sha256: gitBlobSha256(coreRel),
    runtime_git_blob_sha256: gitBlobSha256(runtimeRel),
    qualifier_git_blob_sha256: gitBlobSha256(qualifierRel),
    fixture_case_count: results.length,
    qualification_scope: 'A01_EXACT_SHA_BOOK_SYSTEM_LIFECYCLE_TRANSITION_ENGINE__NO_PUBLICATION_OR_AUTONOMOUS_AUTHOR_AUTHORITY',
  };
  writeEvidence('subject.json', `${JSON.stringify(subject, null, 2)}\n`);
  writeEvidence('cases.json', `${JSON.stringify(results, null, 2)}\n`);
  writeEvidence('result.txt', 'result=PASS\n');
  writeEvidence('qualification.txt', [
    `qualification_id=${subject.qualification_id}`,
    `commit=${commit}`,
    `cases=${subject.fixture_case_count}`,
    'project_transition_gates=PASS',
    'unit_transition_gates=PASS',
    'author_boundary=PASS',
    'service_direct_transition_denial=PASS',
    'stale_service_evidence_rejection=PASS',
    'parent_and_ledger_concurrency=PASS',
    'defer_resume_exactness=PASS',
    'transitive_invalidation=PASS',
    'invalidation_restore=PASS',
    'idempotent_replay_no_double_commit=PASS',
    'idempotency_and_request_conflicts=PASS',
    'atomic_failure=PASS',
    'rollback_identity=PASS',
    'result=PASS',
    '',
  ].join('\n'));
  console.log(`BOOK-SYSTEM-LIFECYCLE-TRANSITION-ENGINE-001 PASS cases=${results.length}`);
  console.log(`evidence_dir=${evidenceDir}`);
} catch (error) {
  writeEvidence('result.txt', 'result=FAIL\n');
  writeEvidence('failure.txt', `${error && error.stack ? error.stack : String(error)}\n`);
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
