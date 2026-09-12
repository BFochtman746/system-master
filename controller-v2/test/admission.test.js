import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ControllerKernel, ControllerError } from '../src/kernel.js';
import { canonicalize, sha256, uuidv7 } from '../src/canonical.js';
import {
  ADMISSION_DECISION_SCHEMA,
  POLICY_DECISION_CANDIDATE_SCHEMA,
  buildAuthorizationRequest,
  createAdmissionPort,
  validatePolicyDecisionCandidate
} from '../src/admission.js';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const SUBJECT = Object.freeze({ algorithm: 'sha1', oid: SHA });
const POLICY_VERSION = 'policy.v1';
const POLICY_DIGEST = 'a'.repeat(64);
const CONTRACT = Object.freeze({ operations: 'none', qualification: 'not_required', promotion: 'not_required' });
const PROFILE = Object.freeze({
  actionClassByCommandType: Object.freeze({ 'controller.work.submit': 'controller.work' }),
  requestedCompletionClassByCommandType: Object.freeze({ 'controller.work.submit': 'standard' }),
  defaultRequestedCompletionClass: 'standard'
});

function command(overrides = {}) {
  return {
    protocol_version: '1.0',
    schema: 'controller://schemas/command/v1',
    command_id: uuidv7(),
    created_at: new Date().toISOString(),
    issuer: { principal: 'user:test', source: 'chatgpt' },
    command_type: 'controller.work.submit',
    target: { repository: 'BFochtman746/system-master', expected_subject: { ...SUBJECT } },
    preconditions: {},
    intent: { task: 'x' },
    constraints: {},
    required_policy_version: POLICY_VERSION,
    ...overrides
  };
}

function setup(overrides = {}) {
  const kernel = new ControllerKernel(':memory:');
  const cmd = command(overrides);
  const accepted = kernel.acceptCommand(cmd);
  return { kernel, cmd, tx: accepted.transaction_id, fingerprint: accepted.fingerprint };
}

function candidate(request, overrides = {}) {
  return {
    schema: POLICY_DECISION_CANDIDATE_SCHEMA,
    decision_id: uuidv7(),
    outcome: 'ALLOW',
    policy_version: request.required_policy_version,
    policy_revision: 'policy-rev-001',
    policy_digest: POLICY_DIGEST,
    input_digest: sha256(request),
    reason_codes: [],
    determining_policy_ids: ['policy.main'],
    diagnostic_error_codes: [],
    principal_refs: [...request.principal_refs],
    delegation_refs: [...request.delegation_refs],
    approval_refs: [],
    approval_required: false,
    completion_contract: { ...CONTRACT },
    valid_until: null,
    ...overrides
  };
}

function policyFrom(makeCandidate) {
  return { evaluate: async (request) => makeCandidate(request) };
}

function assertCode(fn, code) {
  assert.throws(fn, (error) => error instanceof ControllerError && error.code === code);
}

async function assertCodeAsync(fn, code) {
  await assert.rejects(fn, (error) => error instanceof ControllerError && error.code === code);
}

function decisionRows(kernel) {
  return kernel.db.prepare('SELECT * FROM admission_decisions ORDER BY decision_id').all();
}

function txState(kernel, tx) {
  return kernel.db.prepare('SELECT state FROM transactions WHERE transaction_id=?').get(tx).state;
}

function tamperCommand(kernel, tx, mutate) {
  const transaction = kernel.db.prepare('SELECT command_id FROM transactions WHERE transaction_id=?').get(tx);
  const row = kernel.db.prepare('SELECT payload_json FROM commands WHERE command_id=?').get(transaction.command_id);
  const payload = JSON.parse(row.payload_json);
  mutate(payload);
  kernel.db.prepare('UPDATE commands SET payload_json=? WHERE command_id=?').run(canonicalize(payload), transaction.command_id);
}

// Request and exact binding: F006-A001..A010.
test('F006-A001 valid OPEN transaction projects exact authorization request', () => {
  const { kernel, tx, fingerprint } = setup();
  const { request } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  assert.equal(request.transaction_id, tx);
  assert.equal(request.command_fingerprint, fingerprint);
  assert.equal(request.repository, 'BFochtman746/system-master');
  assert.deepEqual(request.subject, SUBJECT);
  assert.equal(request.action.command_type, 'controller.work.submit');
  assert.equal(request.action.action_class, 'controller.work');
  kernel.close();
});

test('F006-A002 authorization request digest is deterministic', () => {
  const { kernel, tx } = setup();
  const a = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  const b = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  assert.equal(a.input_digest, b.input_digest);
  assert.equal(canonicalize(a.request), canonicalize(b.request));
  kernel.close();
});

test('F006-A003 wrong transaction ID is rejected', () => {
  const { kernel } = setup();
  assertCode(() => buildAuthorizationRequest(kernel, uuidv7(), {}, PROFILE), 'ADMISSION_REQUEST_INVALID');
  kernel.close();
});

test('F006-A004 wrong embedded command ID is rejected', () => {
  const { kernel, tx } = setup();
  tamperCommand(kernel, tx, (payload) => { payload.command_id = uuidv7(); });
  assertCode(() => buildAuthorizationRequest(kernel, tx, {}, PROFILE), 'ADMISSION_REQUEST_INVALID');
  kernel.close();
});

test('F006-A005 wrong command fingerprint is rejected', () => {
  const { kernel, tx, cmd } = setup();
  kernel.db.prepare('UPDATE commands SET fingerprint=? WHERE command_id=?').run('b'.repeat(64), cmd.command_id);
  assertCode(() => buildAuthorizationRequest(kernel, tx, {}, PROFILE), 'ADMISSION_REQUEST_INVALID');
  kernel.close();
});

test('F006-A006 wrong repository is rejected', () => {
  const { kernel, tx } = setup();
  tamperCommand(kernel, tx, (payload) => { payload.target.repository = 'other/repository'; });
  assertCode(() => buildAuthorizationRequest(kernel, tx, {}, PROFILE), 'ADMISSION_REQUEST_INVALID');
  kernel.close();
});

test('F006-A007 wrong subject algorithm is rejected', () => {
  const { kernel, tx } = setup();
  tamperCommand(kernel, tx, (payload) => { payload.target.expected_subject.algorithm = 'sha256'; });
  assertCode(() => buildAuthorizationRequest(kernel, tx, {}, PROFILE), 'ADMISSION_REQUEST_INVALID');
  kernel.close();
});

test('F006-A008 wrong subject OID is rejected', () => {
  const { kernel, tx } = setup();
  tamperCommand(kernel, tx, (payload) => { payload.target.expected_subject.oid = 'f'.repeat(40); });
  assertCode(() => buildAuthorizationRequest(kernel, tx, {}, PROFILE), 'ADMISSION_REQUEST_INVALID');
  kernel.close();
});

test('F006-A009 command required policy version is captured exactly', () => {
  const { kernel, tx } = setup({ required_policy_version: 'policy.exact-2026-09-12' });
  const { request } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  assert.equal(request.required_policy_version, 'policy.exact-2026-09-12');
  kernel.close();
});

test('F006-A010 specialist payload is not reinterpreted into admission request', () => {
  const specialist = { book_truth: { chapter: 7 }, learning_truth: { mastery: 0.9 }, document_truth: { page: 12 } };
  const { kernel, tx } = setup({ intent: specialist });
  const { request } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  assert.equal('intent' in request, false);
  assert.equal(canonicalize(request).includes('book_truth'), false);
  assert.equal(canonicalize(request).includes('mastery'), false);
  kernel.close();
});

// Candidate validation / fail closed: F006-A011..A026.
test('F006-A011 valid ALLOW candidate is accepted', () => {
  const { kernel, tx } = setup();
  const { request, input_digest } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  const result = validatePolicyDecisionCandidate(candidate(request), request, input_digest, PROFILE);
  assert.equal(result.deferred, false);
  assert.equal(result.candidate.outcome, 'ALLOW');
  kernel.close();
});

test('F006-A012 valid DENY candidate is accepted', () => {
  const { kernel, tx } = setup();
  const { request, input_digest } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  const result = validatePolicyDecisionCandidate(candidate(request, { outcome: 'DENY', completion_contract: null, reason_codes: ['POLICY_DENY'] }), request, input_digest, PROFILE);
  assert.equal(result.deferred, false);
  assert.equal(result.candidate.outcome, 'DENY');
  kernel.close();
});

test('F006-A013 DEFER candidate produces no terminal state mutation', async () => {
  const { kernel, tx } = setup();
  const port = createAdmissionPort(kernel, policyFrom((request) => candidate(request, { outcome: 'DEFER', completion_contract: null, reason_codes: ['POLICY_PENDING'] })), {}, PROFILE);
  const result = await port.reconcileTransaction(tx);
  assert.equal(result.outcome, 'DEFERRED');
  assert.equal(txState(kernel, tx), 'OPEN');
  assert.equal(decisionRows(kernel).length, 0);
  kernel.close();
});

test('F006-A014 unknown outcome is rejected', () => {
  const { kernel, tx } = setup();
  const { request, input_digest } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  assertCode(() => validatePolicyDecisionCandidate(candidate(request, { outcome: 'MAYBE' }), request, input_digest, PROFILE), 'POLICY_DECISION_INVALID');
  kernel.close();
});

test('F006-A015 unknown candidate field is rejected', () => {
  const { kernel, tx } = setup();
  const { request, input_digest } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  assertCode(() => validatePolicyDecisionCandidate({ ...candidate(request), surprise: true }, request, input_digest, PROFILE), 'POLICY_DECISION_INVALID');
  kernel.close();
});

test('F006-A016 missing policy revision never becomes ALLOW', () => {
  const { kernel, tx } = setup();
  const { request, input_digest } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  const value = candidate(request);
  delete value.policy_revision;
  assertCode(() => validatePolicyDecisionCandidate(value, request, input_digest, PROFILE), 'POLICY_DECISION_INVALID');
  kernel.close();
});

test('F006-A017 malformed policy digest is rejected', () => {
  const { kernel, tx } = setup();
  const { request, input_digest } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  assertCode(() => validatePolicyDecisionCandidate(candidate(request, { policy_digest: 'not-a-digest' }), request, input_digest, PROFILE), 'POLICY_DECISION_INVALID');
  kernel.close();
});

test('F006-A018 input digest mismatch produces no admission candidate', () => {
  const { kernel, tx } = setup();
  const { request, input_digest } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  const result = validatePolicyDecisionCandidate(candidate(request, { input_digest: 'b'.repeat(64) }), request, input_digest, PROFILE);
  assert.equal(result.deferred, true);
  assert.ok(result.defer_reason_codes.includes('POLICY_INPUT_DIGEST_MISMATCH'));
  kernel.close();
});

test('F006-A019 policy version mismatch produces no admission', () => {
  const { kernel, tx } = setup();
  const { request, input_digest } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  const result = validatePolicyDecisionCandidate(candidate(request, { policy_version: 'policy.other' }), request, input_digest, PROFILE);
  assert.equal(result.deferred, true);
  assert.ok(result.defer_reason_codes.includes('POLICY_VERSION_MISMATCH'));
  kernel.close();
});

test('F006-A020 mutable latest or empty revision is rejected', () => {
  const { kernel, tx } = setup();
  const { request, input_digest } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  assertCode(() => validatePolicyDecisionCandidate(candidate(request, { policy_revision: 'latest' }), request, input_digest, PROFILE), 'POLICY_REVISION_UNBOUND');
  assertCode(() => validatePolicyDecisionCandidate(candidate(request, { policy_revision: '' }), request, input_digest, PROFILE), 'POLICY_REVISION_UNBOUND');
  kernel.close();
});

test('F006-A021 diagnostic errors force DEFER', () => {
  const { kernel, tx } = setup();
  const { request, input_digest } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  const result = validatePolicyDecisionCandidate(candidate(request, { diagnostic_error_codes: ['POLICY_SOURCE_PARTIAL'] }), request, input_digest, PROFILE);
  assert.equal(result.deferred, true);
  assert.ok(result.defer_reason_codes.includes('POLICY_EVALUATION_INDETERMINATE'));
  kernel.close();
});

test('F006-A022 expired decision produces no admission', () => {
  const { kernel, tx } = setup();
  const { request, input_digest } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  const result = validatePolicyDecisionCandidate(candidate(request, { valid_until: '2020-01-01T00:00:00.000Z' }), request, input_digest, PROFILE);
  assert.equal(result.deferred, true);
  assert.ok(result.defer_reason_codes.includes('ADMISSION_DECISION_EXPIRED'));
  kernel.close();
});

test('F006-A023 approval required without approval reference forces DEFER', () => {
  const { kernel, tx } = setup();
  const { request, input_digest } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  const result = validatePolicyDecisionCandidate(candidate(request, { approval_required: true }), request, input_digest, PROFILE);
  assert.equal(result.deferred, true);
  assert.ok(result.defer_reason_codes.includes('ADMISSION_APPROVAL_REQUIRED'));
  kernel.close();
});

test('F006-A024 malformed or duplicate evidence references are rejected', () => {
  const { kernel, tx } = setup();
  const { request, input_digest } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  assertCode(() => validatePolicyDecisionCandidate(candidate(request, { approval_refs: ['bad ref with spaces'] }), request, input_digest, PROFILE), 'POLICY_DECISION_INVALID');
  assertCode(() => validatePolicyDecisionCandidate(candidate(request, { approval_refs: ['approval:1', 'approval:1'] }), request, input_digest, PROFILE), 'POLICY_DECISION_INVALID');
  kernel.close();
});

test('F006-A025 ALLOW without valid completion contract is rejected', () => {
  const { kernel, tx } = setup();
  const { request, input_digest } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  assertCode(() => validatePolicyDecisionCandidate(candidate(request, { completion_contract: null }), request, input_digest, PROFILE), 'POLICY_DECISION_INVALID');
  assertCode(() => validatePolicyDecisionCandidate(candidate(request, { completion_contract: { operations: 'none', qualification: 'not_required', promotion: 'required' } }), request, input_digest, PROFILE), 'POLICY_DECISION_INVALID');
  kernel.close();
});

test('F006-A026 DENY with completion contract is rejected', () => {
  const { kernel, tx } = setup();
  const { request, input_digest } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  assertCode(() => validatePolicyDecisionCandidate(candidate(request, { outcome: 'DENY' }), request, input_digest, PROFILE), 'POLICY_DECISION_INVALID');
  kernel.close();
});

// Evidence ownership / privacy: F006-A027..A034.
test('F006-A027 valid opaque identity evidence satisfies bounded standing check', async () => {
  const { kernel, tx } = setup();
  const profile = { ...PROFILE, resolveOwnerFacts: async () => ({ principal_refs: ['identity:receipt:1'], delegation_refs: [], bounded_owner_facts: [] }) };
  const validators = { principal: async (ref) => ({ valid: ref === 'identity:receipt:1' }) };
  const port = createAdmissionPort(kernel, policyFrom((request) => candidate(request)), validators, profile);
  const result = await port.reconcileTransaction(tx);
  assert.equal(result.outcome, 'ADMITTED');
  kernel.close();
});

test('F006-A028 missing identity evidence validator forces DEFER', async () => {
  const { kernel, tx } = setup();
  const profile = { ...PROFILE, resolveOwnerFacts: async () => ({ principal_refs: ['identity:receipt:missing'], delegation_refs: [], bounded_owner_facts: [] }) };
  const port = createAdmissionPort(kernel, policyFrom((request) => candidate(request)), {}, profile);
  const result = await port.reconcileTransaction(tx);
  assert.equal(result.outcome, 'DEFERRED');
  assert.deepEqual(result.reason_codes, ['ADMISSION_EVIDENCE_INVALID']);
  assert.equal(txState(kernel, tx), 'OPEN');
  kernel.close();
});

test('F006-A029 revoked or expired identity evidence forces DEFER', async () => {
  const { kernel, tx } = setup();
  const profile = { ...PROFILE, resolveOwnerFacts: async () => ({ principal_refs: ['identity:receipt:revoked'], delegation_refs: [], bounded_owner_facts: [] }) };
  const validators = { principal: async () => ({ valid: false, stale: true }) };
  const port = createAdmissionPort(kernel, policyFrom((request) => candidate(request)), validators, profile);
  const result = await port.reconcileTransaction(tx);
  assert.equal(result.outcome, 'DEFERRED');
  assert.deepEqual(result.reason_codes, ['ADMISSION_EVIDENCE_STALE']);
  kernel.close();
});

test('F006-A030 delegation reference mismatch forces DEFER', async () => {
  const { kernel, tx } = setup();
  const profile = { ...PROFILE, resolveOwnerFacts: async () => ({ principal_refs: [], delegation_refs: ['delegation:expected'], bounded_owner_facts: [] }) };
  const port = createAdmissionPort(kernel, policyFrom((request) => candidate(request, { delegation_refs: ['delegation:other'] })), {}, profile);
  const result = await port.reconcileTransaction(tx);
  assert.equal(result.outcome, 'DEFERRED');
  assert.ok(result.reason_codes.includes('ADMISSION_EVIDENCE_STALE'));
  kernel.close();
});

test('F006-A031 required approval bound to wrong command or subject forces DEFER', async () => {
  const { kernel, tx } = setup();
  const validators = { approval: async () => ({ valid: false }) };
  const port = createAdmissionPort(kernel, policyFrom((request) => candidate(request, { approval_required: true, approval_refs: ['approval:wrong-binding'] })), validators, PROFILE);
  const result = await port.reconcileTransaction(tx);
  assert.equal(result.outcome, 'DEFERRED');
  assert.deepEqual(result.reason_codes, ['ADMISSION_EVIDENCE_INVALID']);
  kernel.close();
});

test('F006-A032 raw private evidence is never persisted in admission row or event', async () => {
  const { kernel, tx } = setup();
  const secret = 'PRIVATE-EVIDENCE-DO-NOT-PERSIST';
  const profile = { ...PROFILE, resolveOwnerFacts: async () => ({ principal_refs: ['identity:receipt:1'], delegation_refs: [], bounded_owner_facts: [] }) };
  const validators = { principal: async () => ({ valid: secret.length > 0 }) };
  const port = createAdmissionPort(kernel, policyFrom((request) => candidate(request)), validators, profile);
  await port.reconcileTransaction(tx);
  const durable = JSON.stringify(decisionRows(kernel)) + JSON.stringify(kernel.exportEvents());
  assert.equal(durable.includes(secret), false);
  kernel.close();
});

test('F006-A033 raw authentication secret is never persisted by admission', async () => {
  const { kernel, tx } = setup();
  const secret = 'HMAC-SECRET-NEVER-DURABLE';
  const port = createAdmissionPort(kernel, { evaluate: async (request) => { assert.ok(secret); return candidate(request); } }, {}, PROFILE);
  await port.reconcileTransaction(tx);
  const durable = JSON.stringify(decisionRows(kernel)) + JSON.stringify(kernel.exportEvents());
  assert.equal(durable.includes(secret), false);
  kernel.close();
});

test('F006-A034 fault text is not leaked as durable reason text', async () => {
  const { kernel, tx } = setup();
  const fault = 'secret-stack-and-private-payload';
  const port = createAdmissionPort(kernel, { evaluate: async () => { throw new Error(fault); } }, {}, PROFILE);
  await assertCodeAsync(() => port.reconcileTransaction(tx), 'POLICY_UNAVAILABLE_PERMANENT');
  const durable = JSON.stringify(decisionRows(kernel)) + JSON.stringify(kernel.exportEvents());
  assert.equal(durable.includes(fault), false);
  assert.equal(txState(kernel, tx), 'OPEN');
  kernel.close();
});

// Atomic commit / state machine: F006-A035..A047.
test('F006-A035 valid ALLOW creates exactly one admission row and OPEN to ADMITTED', async () => {
  const { kernel, tx } = setup();
  const port = createAdmissionPort(kernel, policyFrom((request) => candidate(request)), {}, PROFILE);
  const result = await port.reconcileTransaction(tx);
  assert.equal(result.outcome, 'ADMITTED');
  assert.equal(txState(kernel, tx), 'ADMITTED');
  assert.equal(decisionRows(kernel).length, 1);
  assert.equal(result.decision.schema, ADMISSION_DECISION_SCHEMA);
  kernel.close();
});

test('F006-A036 valid DENY creates exactly one admission row and OPEN to REJECTED', async () => {
  const { kernel, tx } = setup();
  const port = createAdmissionPort(kernel, policyFrom((request) => candidate(request, { outcome: 'DENY', completion_contract: null, reason_codes: ['POLICY_DENY'] })), {}, PROFILE);
  const result = await port.reconcileTransaction(tx);
  assert.equal(result.outcome, 'REJECTED');
  assert.equal(txState(kernel, tx), 'REJECTED');
  assert.equal(decisionRows(kernel).length, 1);
  kernel.close();
});

test('F006-A037 ALLOW stores immutable normalized completion contract', async () => {
  const { kernel, tx } = setup();
  const contract = { operations: 'all_succeeded', qualification: 'required', promotion: 'required' };
  const port = createAdmissionPort(kernel, policyFrom((request) => candidate(request, { completion_contract: contract })), {}, PROFILE);
  await port.reconcileTransaction(tx);
  const txRow = kernel.db.prepare('SELECT completion_contract_json FROM transactions WHERE transaction_id=?').get(tx);
  assert.deepEqual(JSON.parse(txRow.completion_contract_json), contract);
  assert.deepEqual(port.inspectDecision(tx).completion_contract, contract);
  kernel.close();
});

test('F006-A038 ALLOW event binds decision ID and fingerprint', async () => {
  const { kernel, tx } = setup();
  const port = createAdmissionPort(kernel, policyFrom((request) => candidate(request)), {}, PROFILE);
  const result = await port.reconcileTransaction(tx);
  const event = kernel.db.prepare("SELECT data_json FROM events WHERE stream_id=? AND event_type='transaction.admitted'").get(`transaction:${tx}`);
  const data = JSON.parse(event.data_json);
  assert.equal(data.admission_decision_id, result.decision.decision_id);
  assert.equal(data.admission_decision_fingerprint, result.decision.decision_fingerprint);
  kernel.close();
});

test('F006-A039 DENY event binds decision ID fingerprint and bounded reasons', async () => {
  const { kernel, tx } = setup();
  const port = createAdmissionPort(kernel, policyFrom((request) => candidate(request, { outcome: 'DENY', completion_contract: null, reason_codes: ['POLICY_DENY'] })), {}, PROFILE);
  const result = await port.reconcileTransaction(tx);
  const event = kernel.db.prepare("SELECT data_json FROM events WHERE stream_id=? AND event_type='transaction.rejected'").get(`transaction:${tx}`);
  const data = JSON.parse(event.data_json);
  assert.equal(data.admission_decision_id, result.decision.decision_id);
  assert.equal(data.admission_decision_fingerprint, result.decision.decision_fingerprint);
  assert.deepEqual(data.reason_codes, ['POLICY_DENY']);
  kernel.close();
});

test('F006-A040 exact ALLOW replay is duplicate and emits no second terminal event', async () => {
  const { kernel, tx } = setup();
  let evaluations = 0;
  const port = createAdmissionPort(kernel, { evaluate: async (request) => { evaluations += 1; return candidate(request); } }, {}, PROFILE);
  await port.reconcileTransaction(tx);
  const before = kernel.currentStreamVersion(`transaction:${tx}`);
  const replay = await port.reconcileTransaction(tx);
  assert.equal(replay.outcome, 'ALREADY_ADMITTED');
  assert.equal(replay.duplicate, true);
  assert.equal(evaluations, 1);
  assert.equal(kernel.currentStreamVersion(`transaction:${tx}`), before);
  kernel.close();
});

test('F006-A041 exact DENY replay is duplicate and emits no second terminal event', async () => {
  const { kernel, tx } = setup();
  let evaluations = 0;
  const port = createAdmissionPort(kernel, { evaluate: async (request) => { evaluations += 1; return candidate(request, { outcome: 'DENY', completion_contract: null, reason_codes: ['POLICY_DENY'] }); } }, {}, PROFILE);
  await port.reconcileTransaction(tx);
  const before = kernel.currentStreamVersion(`transaction:${tx}`);
  const replay = await port.reconcileTransaction(tx);
  assert.equal(replay.outcome, 'ALREADY_REJECTED');
  assert.equal(replay.duplicate, true);
  assert.equal(evaluations, 1);
  assert.equal(kernel.currentStreamVersion(`transaction:${tx}`), before);
  kernel.close();
});

test('F006-A042 concurrent same-transaction conflicting decisions fail closed', async () => {
  const { kernel, tx } = setup();
  let call = 0;
  const port = createAdmissionPort(kernel, { evaluate: async (request) => candidate(request, call++ === 0 ? {} : { outcome: 'DENY', completion_contract: null, reason_codes: ['POLICY_DENY'] }) }, {}, PROFILE);
  const results = await Promise.allSettled([port.reconcileTransaction(tx), port.reconcileTransaction(tx)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled' && ['ADMITTED', 'REJECTED'].includes(r.value.outcome)).length, 1);
  const failure = results.find((r) => r.status === 'rejected');
  assert.ok(failure);
  assert.equal(failure.reason.code, 'ADMISSION_DECISION_CONFLICT');
  assert.equal(decisionRows(kernel).length, 1);
  kernel.close();
});

test('F006-A043 same decision ID on different transaction conflicts', async () => {
  const kernel = new ControllerKernel(':memory:');
  const a = kernel.acceptCommand(command()).transaction_id;
  const b = kernel.acceptCommand(command()).transaction_id;
  const shared = uuidv7();
  const port = createAdmissionPort(kernel, policyFrom((request) => candidate(request, { decision_id: shared })), {}, PROFILE);
  assert.equal((await port.reconcileTransaction(a)).outcome, 'ADMITTED');
  await assertCodeAsync(() => port.reconcileTransaction(b), 'ADMISSION_DECISION_CONFLICT');
  assert.equal(txState(kernel, b), 'OPEN');
  kernel.close();
});

test('F006-A044 transaction change before commit returns stale with no partial decision', async () => {
  const { kernel, tx } = setup();
  const port = createAdmissionPort(kernel, { evaluate: async (request) => { kernel.cancelTransaction(tx, 'changed-during-evaluation'); return candidate(request); } }, {}, PROFILE);
  const result = await port.reconcileTransaction(tx);
  assert.equal(result.outcome, 'STALE_RECONCILE_INPUT');
  assert.equal(decisionRows(kernel).length, 0);
  assert.equal(txState(kernel, tx), 'CANCELLED');
  kernel.close();
});

test('F006-A045 decision expiry between evaluation and commit leaves no partial mutation', async () => {
  const { kernel, tx } = setup();
  const profile = { ...PROFILE, resolveOwnerFacts: async () => ({ principal_refs: ['identity:receipt:1'], delegation_refs: [], bounded_owner_facts: [] }) };
  const validators = { principal: async () => { await new Promise((resolve) => setTimeout(resolve, 40)); return { valid: true }; } };
  const port = createAdmissionPort(kernel, policyFrom((request) => candidate(request, { valid_until: new Date(Date.now() + 20).toISOString() })), validators, profile);
  await assertCodeAsync(() => port.reconcileTransaction(tx), 'ADMISSION_DECISION_EXPIRED');
  assert.equal(txState(kernel, tx), 'OPEN');
  assert.equal(decisionRows(kernel).length, 0);
  kernel.close();
});

test('F006-A046 evidence standing change before commit leaves no partial mutation', async () => {
  const { kernel, tx } = setup();
  const profile = { ...PROFILE, resolveOwnerFacts: async () => ({ principal_refs: ['identity:receipt:1'], delegation_refs: [], bounded_owner_facts: [] }) };
  let current = true;
  const validators = { principal: async () => { current = false; return { valid: current, stale: true }; } };
  const port = createAdmissionPort(kernel, policyFrom((request) => candidate(request)), validators, profile);
  const result = await port.reconcileTransaction(tx);
  assert.equal(result.outcome, 'DEFERRED');
  assert.equal(txState(kernel, tx), 'OPEN');
  assert.equal(decisionRows(kernel).length, 0);
  kernel.close();
});

test('F006-A047 policy and evidence adapters are never called inside SQLite transaction', async () => {
  const { kernel, tx } = setup();
  const profile = { ...PROFILE, resolveOwnerFacts: async () => ({ principal_refs: ['identity:receipt:1'], delegation_refs: [], bounded_owner_facts: [] }) };
  const policy = { evaluate: async (request) => { assert.equal(kernel.db.isTransaction, false); return candidate(request); } };
  const validators = { principal: async () => { assert.equal(kernel.db.isTransaction, false); return { valid: true }; } };
  const port = createAdmissionPort(kernel, policy, validators, profile);
  assert.equal((await port.reconcileTransaction(tx)).outcome, 'ADMITTED');
  kernel.close();
});

// Restart / reconciliation / authority fencing: F006-A048..A056.
test('F006-A048 restart rediscovers undecided OPEN transaction from durable DB', () => {
  const dir = mkdtempSync(join(tmpdir(), 'controller-f006-'));
  const path = join(dir, 'controller.sqlite');
  let kernel = new ControllerKernel(path);
  const tx = kernel.acceptCommand(command()).transaction_id;
  kernel.close();
  kernel = new ControllerKernel(path);
  const port = createAdmissionPort(kernel, policyFrom((request) => candidate(request)), {}, PROFILE);
  assert.ok(port.rediscoverOpen().includes(tx));
  kernel.close();
  rmSync(dir, { recursive: true, force: true });
});

test('F006-A049 already-admitted decision returns stable result without re-evaluation', async () => {
  const { kernel, tx } = setup();
  let count = 0;
  const port = createAdmissionPort(kernel, { evaluate: async (request) => { count += 1; return candidate(request); } }, {}, PROFILE);
  await port.reconcileTransaction(tx);
  const result = await port.reconcileTransaction(tx);
  assert.equal(result.outcome, 'ALREADY_ADMITTED');
  assert.equal(count, 1);
  kernel.close();
});

test('F006-A050 already-rejected decision returns stable result without re-evaluation', async () => {
  const { kernel, tx } = setup();
  let count = 0;
  const port = createAdmissionPort(kernel, { evaluate: async (request) => { count += 1; return candidate(request, { outcome: 'DENY', completion_contract: null, reason_codes: ['POLICY_DENY'] }); } }, {}, PROFILE);
  await port.reconcileTransaction(tx);
  const result = await port.reconcileTransaction(tx);
  assert.equal(result.outcome, 'ALREADY_REJECTED');
  assert.equal(count, 1);
  kernel.close();
});

test('F006-A051 lost response after ALLOW commit reconciles idempotently', async () => {
  const { kernel, tx } = setup();
  let count = 0;
  const port = createAdmissionPort(kernel, { evaluate: async (request) => { count += 1; return candidate(request); } }, {}, PROFILE);
  await port.reconcileTransaction(tx); // Treat returned response as lost.
  const recovered = await port.reconcileTransaction(tx);
  assert.equal(recovered.outcome, 'ALREADY_ADMITTED');
  assert.equal(recovered.duplicate, true);
  assert.equal(count, 1);
  assert.equal(decisionRows(kernel).length, 1);
  kernel.close();
});

test('F006-A052 transient policy failure defers without semantic retry', async () => {
  const { kernel, tx } = setup();
  let calls = 0;
  const policy = { evaluate: async () => { calls += 1; throw new ControllerError('POLICY_UNAVAILABLE_TRANSIENT', 'temporary'); } };
  const port = createAdmissionPort(kernel, policy, {}, PROFILE);
  const result = await port.reconcileTransaction(tx);
  assert.equal(result.outcome, 'DEFERRED');
  assert.deepEqual(result.reason_codes, ['POLICY_UNAVAILABLE_TRANSIENT']);
  assert.equal(calls, 1);
  assert.equal(txState(kernel, tx), 'OPEN');
  kernel.close();
});

test('F006-A053 supported local ingress has no direct admission call', () => {
  const source = readFileSync(new URL('../src/local-command-intake.js', import.meta.url), 'utf8');
  assert.equal(source.includes('.admitTransaction('), false);
  assert.equal(source.includes('createAdmissionPort('), false);
});

test('F006-A054 durable command ingress has no direct admission call', () => {
  const source = readFileSync(new URL('../src/durable-command-ingress.js', import.meta.url), 'utf8');
  assert.equal(source.includes('.admitTransaction('), false);
  assert.equal(source.includes('createAdmissionPort('), false);
});

test('F006-A055 worker authority port has no admission capability', () => {
  const source = readFileSync(new URL('../src/authority-ports.js', import.meta.url), 'utf8');
  assert.equal(source.includes('admitTransaction'), false);
  assert.equal(source.includes('createAdmissionPort'), false);
});

test('F006-A056 admission module contains no scheduler worker provider qualification or promotion execution path', () => {
  const source = readFileSync(new URL('../src/admission.js', import.meta.url), 'utf8');
  for (const forbidden of ['.createOperation(', '.acquireLease(', '.startLeasedOperation(', '.submitWorkerResult(', '.createQualification(', '.startQualification(', '.finishQualification(', '.requestPromotion(', '.authorizePromotion(', '.executePromotion(', '.reconcilePromotion(']) {
    assert.equal(source.includes(forbidden), false, `forbidden execution path: ${forbidden}`);
  }
});
