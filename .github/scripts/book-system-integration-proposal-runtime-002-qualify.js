'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const runnerTemp = process.env.RUNNER_TEMP || path.join(workspace, '.tmp-book-system-runtime-v2');
const runId = process.env.GITHUB_RUN_ID || 'local';
const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(runnerTemp, `book-system-runtime-v2-${runId}`);
fs.mkdirSync(evidenceDir, { recursive: true });

const paths = {
  registry: 'qualification/book-system/service-interface-002/BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-002.json',
  contract: 'qualification/book-system/integration-proposal-002/BOOK-SYSTEM-INTEGRATION-PROPOSAL-RUNTIME-002.json',
  research: 'qualification/book-system/integration-proposal-002/BOOK-SYSTEM-RUNTIME-V2-PREIMPLEMENTATION-RESEARCH-001.json',
  fixtures: 'qualification/book-system/integration-proposal-002/INTEGRATION-PROPOSAL-RUNTIME-002-FIXTURES.json',
  entrypoint: 'system-master/book-system/integration-proposal-runtime-v2.js',
  core: 'system-master/book-system/integration-proposal-runtime-v2-core.js',
  qualifier: '.github/scripts/book-system-integration-proposal-runtime-002-qualify.js',
};

class TestFailure extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new TestFailure(code, detail); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function stableNormalize(v) {
  if (Array.isArray(v)) return v.map(stableNormalize);
  if (v && typeof v === 'object') {
    const out = {};
    for (const key of Object.keys(v).sort()) out[key] = stableNormalize(v[key]);
    return out;
  }
  return v;
}
function stable(v) { return JSON.stringify(stableNormalize(v)); }
function sha256Bytes(v) { return crypto.createHash('sha256').update(v).digest('hex'); }
function isSha(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }
function deepMerge(target, patch) {
  if (Array.isArray(patch)) return clone(patch);
  if (!patch || typeof patch !== 'object') return clone(patch);
  const out = target && typeof target === 'object' && !Array.isArray(target) ? clone(target) : {};
  for (const [k, v] of Object.entries(patch)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(out[k], v) : clone(v);
  return out;
}
function writeEvidence(name, value) { fs.writeFileSync(path.join(evidenceDir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8'); }
function run(command, args) { return spawnSync(command, args, { cwd: workspace, encoding: 'utf8', windowsHide: true, shell: false }); }
function gitHead() {
  const r = run('git', ['-c', `safe.directory=${workspace}`, 'rev-parse', 'HEAD']);
  if (r.error || r.status !== 0) fail('GIT_HEAD_FAILED', r.stderr || '');
  return r.stdout.trim();
}
function gitBlobSha256(repoPath) {
  const r = spawnSync('git', ['-c', `safe.directory=${workspace}`, 'show', `HEAD:${repoPath}`], { cwd: workspace, encoding: null, windowsHide: true, shell: false });
  if (r.error || r.status !== 0) fail('GIT_BLOB_READ_FAILED', repoPath);
  return sha256Bytes(r.stdout || Buffer.alloc(0));
}
function expectError(fn, expectedCode) {
  try { fn(); } catch (error) {
    if (error && error.code === expectedCode) return error;
    fail('WRONG_ERROR_CODE', `expected=${expectedCode}:actual=${error && error.code ? error.code : error}`);
  }
  fail('EXPECTED_ERROR_NOT_THROWN', expectedCode);
}
function assert(condition, code, detail = '') { if (!condition) fail(code, detail); }

const registry = JSON.parse(fs.readFileSync(path.join(workspace, ...paths.registry.split('/')), 'utf8'));
const contract = JSON.parse(fs.readFileSync(path.join(workspace, ...paths.contract.split('/')), 'utf8'));
const research = JSON.parse(fs.readFileSync(path.join(workspace, ...paths.research.split('/')), 'utf8'));
const fixtures = JSON.parse(fs.readFileSync(path.join(workspace, ...paths.fixtures.split('/')), 'utf8'));
const rt = require(path.join(workspace, ...paths.entrypoint.split('/')));

function baseParent() { return rt.sealParentState(fixtures.parent_state_template); }
function baseLedger(parent, source = fixtures.source_identity) { return rt.createLedger(parent, { source_identity_refs: [source] }); }
function bind(templateRequest, templateResponse, parent, source = fixtures.source_identity) {
  const request = clone(templateRequest);
  request.parent_state_version = parent.state_version;
  request.parent_state_digest = parent.state_digest;
  request.source_identity_refs = [clone(source)];
  const response = clone(templateResponse);
  response.parent_projection_identity = { parent_state_version: parent.state_version, parent_state_digest: parent.state_digest };
  response.source_identity_refs = [clone(source)];
  return { request, response };
}
function prosePair(parent) { return bind(fixtures.prose_request_template, fixtures.prose_response_template, parent); }
function authorPair(parent) { return bind(fixtures.author_request_template, fixtures.author_response_template, parent); }
function documentPair(parent) { return bind(fixtures.document_request_template, fixtures.document_response_template, parent); }
function provenancePair(parent) { return bind(fixtures.provenance_request_template, fixtures.provenance_response_template, parent); }
function changedResponseId(pair, suffix) {
  const p = clone(pair);
  p.response.response_id = `${p.response.response_id}-${suffix}`;
  return p;
}
function currentProposal(result) { assert(result.proposal_snapshot, 'PROPOSAL_REQUIRED'); return result.proposal_snapshot; }

function genericProjection(operation) {
  const projection = {};
  for (const field of operation.required_projection || []) {
    if (field === 'editorial_stage_context') projection[field] = { stage_token: 'STRUCTURAL_EDIT_REVIEW', applicability: 'APPLICABLE', not_applicable_rationale: null };
    else if (field.includes('refs') || field.includes('constraints') || field.includes('scope') || field.includes('evidence')) projection[field] = [`${field}:001`];
    else if (field === 'publication_authorized') projection[field] = false;
    else projection[field] = `${field}:001`;
  }
  return projection;
}
function genericEvidenceOnlyPair(parent, serviceId, operationId, providerClass, providerSha, source = fixtures.source_identity) {
  const operation = registry.services[serviceId].operations[operationId];
  const requestId = `REQ-${serviceId}-${operationId}`;
  const request = {
    request_id: requestId,
    correlation_id: `CORR-${serviceId}-${operationId}`,
    idempotency_key: `IDEM-${serviceId}-${operationId}`,
    service_id: serviceId,
    operation_id: operationId,
    schema_version: 2,
    book_project_id: 'BOOK-PROJECT-001',
    book_id: 'BOOK-001',
    parent_state_version: parent.state_version,
    parent_state_digest: parent.state_digest,
    target_refs: ['TARGET:001'],
    source_identity_refs: [clone(source)],
    projection: genericProjection(operation),
    authority_context: {
      requesting_authority: 'BOOK_SYSTEM_PARENT',
      canonical_write_allowed: false,
      lifecycle_transition_allowed: false,
      export_freeze_allowed: false,
      publication_authorized: false,
      author_decision_required_if_returned: false,
      rights_boundary: 'AUTHORIZED_TEST_BOUNDARY',
      privacy_boundary: 'PRIVATE_INTERNAL_ONLY',
    },
  };
  const response = {
    response_id: `RESP-${serviceId}-${operationId}`,
    request_id: request.request_id,
    correlation_id: request.correlation_id,
    idempotency_key: request.idempotency_key,
    service_id: serviceId,
    operation_id: operationId,
    schema_version: 2,
    provider_class: providerClass,
    provider_subject: { subject_sha: providerSha, implementation_or_artifact_id: `${providerClass}-TEST` },
    parent_projection_identity: { parent_state_version: parent.state_version, parent_state_digest: parent.state_digest },
    source_identity_refs: [clone(source)],
    result_class: 'SUCCESS',
    evidence_refs: [`EVIDENCE:${serviceId}:${operationId}`],
    proposal_refs: [],
    artifact_evidence: [],
    editorial_stage_evidence: [],
    target_medium_evidence: [],
    provenance_evidence: [],
    abstentions: [],
    warnings: [],
    requested_parent_action: 'REGISTER_EVIDENCE',
  };
  return { request, response };
}

const cases = {};
function test(id, fn) { cases[id] = fn; }

test('RUNTIME_LEDGER_INITIALIZATION', () => {
  assert(registry.registry_id === 'BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-002' && registry.registry_version === 2, 'REGISTRY_V2_REQUIRED');
  const serviceIds = Object.keys(registry.services);
  assert(serviceIds.length === 4, 'SERVICE_FAMILY_COUNT_MISMATCH', String(serviceIds.length));
  const opCount = serviceIds.reduce((n, id) => n + Object.keys(registry.services[id].operations).length, 0);
  assert(opCount === 21, 'OPERATION_COUNT_MISMATCH', String(opCount));
  assert(contract.service_registry_compatibility.required_registry === registry.registry_id, 'RUNTIME_CONTRACT_REGISTRY_MISMATCH');
  assert(research.standing.startsWith('CLOSED__') && research.implementation_release === 'AUTHORIZED_WITHIN_STATE_012_BOUNDARIES', 'PREIMPLEMENTATION_RESEARCH_NOT_CLOSED');
  const parent = baseParent();
  let ledger = baseLedger(parent);
  assert(ledger.ledger_schema_version === 2 && ledger.ledger_version === 0, 'LEDGER_INITIALIZATION_FAIL');
  assert(ledger.bound_parent_state_version === parent.state_version && ledger.bound_parent_state_digest === parent.state_digest, 'LEDGER_PARENT_BINDING_FAIL');
  const families = [
    ['PROSE_ANALYSIS_AND_REVISION', 'ANALYZE_PASSAGE_OR_UNIT', 'PROSE_SYSTEM', '1111111111111111111111111111111111111111'],
    ['BOOK_EVALUATION', 'QUALIFICATION_EVIDENCE', 'BOOK_EVALUATOR', '3333333333333333333333333333333333333333'],
    ['RESEARCH_AND_EVIDENCE', 'CHECK_EVIDENCE_CONFLICTS', 'RESEARCH_SERVICE', '4444444444444444444444444444444444444444'],
    ['DOCUMENT_ARTIFACT_AND_EXPORT', 'VERIFY_ARTIFACT_IDENTITY', 'HEADLESS_ARTIFACT_SERVICE', '2222222222222222222222222222222222222222'],
  ];
  for (const family of families) {
    const pair = genericEvidenceOnlyPair(parent, ...family);
    const out = rt.intakeServiceResponse({ registry, parentState: parent, ledger, request: pair.request, response: pair.response });
    assert(out.disposition === 'RECORDED_NO_PROPOSAL' && out.parentState.state_digest === parent.state_digest, 'COMMON_INTAKE_PATH_FAIL', family[0]);
    ledger = out.ledger;
  }
  assert(new Set(ledger.intake_records.map(r => r.service_id)).size === 4, 'FOUR_SERVICE_FAMILIES_NOT_INTAKEN');
  return { service_count: 4, operation_count: 21, common_intake_family_count: 4 };
});

test('VALID_PROPOSAL_INTAKE_PROPOSED_ONLY', () => {
  const parent = baseParent(); const ledger = baseLedger(parent); const pair = prosePair(parent);
  const out = rt.intakeServiceResponse({ registry, parentState: parent, ledger, ...pair });
  const p = currentProposal(out);
  assert(out.disposition === 'PROPOSAL_CREATED', 'PROPOSAL_DISPOSITION_FAIL');
  assert(p.admission_state === 'PROPOSED' && p.publication_authorized === false, 'PROPOSED_ONLY_FAIL');
  assert(out.parentState.integration_proposals.length === 1 && out.parentState.state_version === parent.state_version + 1, 'PARENT_PROPOSAL_REGISTRATION_FAIL');
});

test('POST_COMMIT_SNAPSHOT_PARENT_BINDING', () => {
  const parent = baseParent(); const out = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...prosePair(parent) });
  const p = currentProposal(out);
  assert(p.last_revalidated_parent_state_version === out.parentState.state_version, 'SNAPSHOT_POST_PARENT_VERSION_FAIL');
  assert(p.last_revalidated_parent_state_digest === out.parentState.state_digest, 'SNAPSHOT_POST_PARENT_DIGEST_FAIL');
});

test('PARENT_PROTECTED_STATE_UNCHANGED', () => {
  const parent = baseParent(); const before = rt.protectedParentFingerprint(parent);
  const out = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...prosePair(parent) });
  assert(rt.protectedParentFingerprint(out.parentState) === before, 'PROTECTED_PARENT_MUTATED');
  assert(out.parentState.active.canonical_manuscript_ref === parent.active.canonical_manuscript_ref, 'CANONICAL_MANUSCRIPT_POINTER_MUTATED');
});

test('ATOMIC_RECEIPT_AND_OUTBOX', () => {
  const parent = baseParent(); const ledger = baseLedger(parent); const out = rt.intakeServiceResponse({ registry, parentState: parent, ledger, ...prosePair(parent) });
  assert(out.ledger.admission_receipts.length === 1, 'RECEIPT_MISSING');
  assert(out.ledger.outbox_entries.length === 1 && out.ledger.outbox_entries[0].delivery_state === 'PENDING', 'OUTBOX_MISSING');
  assert(out.receipt.rollback_parent_state_digest === parent.state_digest && out.receipt.rollback_integration_ledger_digest === rt.digestObject(ledger), 'ROLLBACK_IDENTITY_FAIL');
  assert(out.receipt.post_parent_state_digest === out.parentState.state_digest, 'RECEIPT_POST_PARENT_FAIL');
});

test('EXACT_RESPONSE_REPLAY_NO_COMMIT', () => {
  const parent = baseParent(); const first = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...prosePair(parent) });
  const second = rt.intakeServiceResponse({ registry, parentState: first.parentState, ledger: first.ledger, ...prosePair(parent) });
  assert(second.disposition === 'REPLAY' && second.committed === false, 'EXACT_REPLAY_FAIL');
  assert(rt.stableStringify(second.parentState) === rt.stableStringify(first.parentState) && rt.stableStringify(second.ledger) === rt.stableStringify(first.ledger), 'REPLAY_MUTATED_STATE');
});

test('RESPONSE_IDENTITY_CONFLICT_REJECTED', () => {
  const parent = baseParent(); const pair = prosePair(parent); const first = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...pair });
  const conflict = prosePair(parent); conflict.response.warnings = ['PAYLOAD_CHANGED'];
  expectError(() => rt.intakeServiceResponse({ registry, parentState: first.parentState, ledger: first.ledger, ...conflict }), 'RESPONSE_IDENTITY_CONFLICT');
});

test('IDEMPOTENCY_KEY_CONFLICT_REJECTED', () => {
  const parent = baseParent(); const firstPair = prosePair(parent); const first = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...firstPair });
  const pair = prosePair(first.parentState);
  pair.request.request_id = 'REQ-PROSE-DIFFERENT'; pair.request.correlation_id = 'CORR-PROSE-DIFFERENT'; pair.request.projection.authorized_unit_set = ['CHAPTER-004'];
  pair.response.request_id = pair.request.request_id; pair.response.correlation_id = pair.request.correlation_id; pair.response.response_id = 'RESP-PROSE-DIFFERENT';
  expectError(() => rt.intakeServiceResponse({ registry, parentState: first.parentState, ledger: first.ledger, ...pair }), 'IDEMPOTENCY_KEY_CONFLICT');
});

test('SUPERSEDING_RESPONSE_REQUIRES_RECONCILIATION', () => {
  const parent = baseParent(); const pair = prosePair(parent); const first = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...pair });
  const secondPair = changedResponseId(pair, 'V2');
  expectError(() => rt.intakeServiceResponse({ registry, parentState: first.parentState, ledger: first.ledger, ...secondPair }), 'SUPERSEDING_RESPONSE_REQUIRES_PARENT_RECONCILIATION');
});

test('STALE_PARENT_RESPONSE_PRESERVED_NO_PROPOSAL', () => {
  const staleParent = baseParent(); const currentRaw = clone(fixtures.parent_state_template); currentRaw.state_version = staleParent.state_version + 1; const current = rt.sealParentState(currentRaw);
  const out = rt.intakeServiceResponse({ registry, parentState: current, ledger: baseLedger(current), ...prosePair(staleParent) });
  assert(out.disposition === 'STALE_REJECTED_PRESERVED' && !out.proposal_snapshot && out.parentState.state_digest === current.state_digest, 'STALE_PARENT_NOT_PRESERVED');
});

test('SUPERSEDED_SOURCE_PRESERVED_NO_PROPOSAL', () => {
  const parent = baseParent(); const out = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent, fixtures.next_source_identity), ...prosePair(parent) });
  assert(out.disposition === 'SUPERSEDED_SOURCE_PRESERVED' && !out.proposal_snapshot, 'SUPERSEDED_SOURCE_NOT_PRESERVED');
});

test('PARTIAL_RESULT_PRESERVED_WITH_LIMITATIONS', () => {
  const parent = baseParent(); const pair = prosePair(parent); pair.response.result_class = 'PARTIAL'; pair.response.warnings = ['LIMITED_SCOPE'];
  const out = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...pair });
  assert(out.disposition === 'PARTIAL_PRESERVED' && out.proposal_snapshot && out.proposal_snapshot.source_result_class === 'PARTIAL', 'PARTIAL_NOT_PRESERVED');
  assert(out.proposal_snapshot.warnings.includes('LIMITED_SCOPE'), 'PARTIAL_LIMITATION_LOST');
});

test('ABSTAIN_RESULT_PRESERVED_NO_PROPOSAL', () => {
  const parent = baseParent(); const pair = prosePair(parent); pair.response.result_class = 'ABSTAIN'; pair.response.abstentions = ['LOW_CONFIDENCE']; pair.response.requested_parent_action = 'NONE'; pair.response.editorial_stage_evidence = [];
  const out = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...pair });
  assert(out.disposition === 'ABSTENTION_PRESERVED' && !out.proposal_snapshot && out.intake_record.abstentions[0] === 'LOW_CONFIDENCE', 'ABSTAIN_NOT_PRESERVED');
});

test('ERROR_RESULT_PRESERVED_NO_PROPOSAL', () => {
  const parent = baseParent(); const pair = prosePair(parent); pair.response.result_class = 'ERROR'; pair.response.warnings = ['ERROR_CODE:PROVIDER_FAILURE']; pair.response.requested_parent_action = 'NONE'; pair.response.editorial_stage_evidence = [];
  const out = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...pair });
  assert(out.disposition === 'ERROR_PRESERVED' && !out.proposal_snapshot && out.intake_record.warnings.length === 1, 'ERROR_NOT_PRESERVED');
});

test('DISAGREEMENT_PRESERVED', () => {
  const parent = baseParent(); const pair = prosePair(parent); pair.response.disagreement_state = { state: 'MINORITY_EVIDENCE_PRESENT', minority_evidence_refs: ['EVIDENCE:MINORITY-001'] };
  const out = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...pair });
  assert(out.proposal_snapshot.disagreement_state.state === 'MINORITY_EVIDENCE_PRESENT', 'DISAGREEMENT_LOST');
});

test('OUTPUT_CLASS_NOT_REGISTERED_REJECTED', () => {
  const parent = baseParent(); const pair = prosePair(parent);
  pair.response.artifact_evidence = [{ artifact_ref: 'ARTIFACT:ILLEGAL', artifact_digest: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', artifact_currentness: 'CURRENT_FOR_BOUND_SOURCE', format_identity: 'TXT', target_medium_profile_id: 'TXT', target_medium_profile_version: 1, generator_or_toolchain_identity: 'ILLEGAL' }];
  expectError(() => rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...pair }), 'OUTPUT_CLASS_NOT_REGISTERED_FOR_OPERATION');
});

test('PROVIDER_CANONICAL_AUTHORITY_REJECTED', () => {
  const parent = baseParent(); const pair = prosePair(parent); pair.response.canonical_write = true;
  expectError(() => rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...pair }), 'PROVIDER_AUTHORITY_CLAIM_FORBIDDEN');
});

test('PROVIDER_PUBLICATION_AUTHORITY_REJECTED', () => {
  const parent = baseParent(); const pair = prosePair(parent); pair.response.publication_authorized = true;
  expectError(() => rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...pair }), 'PROVIDER_AUTHORITY_CLAIM_FORBIDDEN');
});

test('PROVIDER_STAGE_COMPLETION_AUTHORITY_REJECTED', () => {
  const parent = baseParent(); const pair = prosePair(parent); pair.response.editorial_stage_evidence[0].stage_complete = true;
  expectError(() => rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...pair }), 'PROVIDER_STAGE_AUTHORITY_FORBIDDEN');
});

test('EDITORIAL_INCOMPLETE_BLOCKS_PREQUALIFICATION', () => {
  const parent = baseParent(); const pair = prosePair(parent); pair.response.editorial_stage_evidence[0].exit_evidence_refs = [];
  const initial = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...pair });
  const reviewed = rt.transitionProposal({ parentState: initial.parentState, ledger: initial.ledger, proposalId: initial.proposal_snapshot.proposal_id, targetState: 'EVIDENCE_REVIEWED' });
  expectError(() => rt.transitionProposal({ parentState: reviewed.parentState, ledger: reviewed.ledger, proposalId: reviewed.proposal_snapshot.proposal_id, targetState: 'PARENT_PREQUALIFIED' }), 'EDITORIAL_GATE_EVIDENCE_INCOMPLETE');
});

test('PROPOSAL_STATE_MACHINE_TO_ADMITTED', () => {
  const parent = baseParent(); const initial = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...prosePair(parent) });
  const reviewed = rt.transitionProposal({ parentState: initial.parentState, ledger: initial.ledger, proposalId: initial.proposal_snapshot.proposal_id, targetState: 'EVIDENCE_REVIEWED' });
  const preq = rt.transitionProposal({ parentState: reviewed.parentState, ledger: reviewed.ledger, proposalId: reviewed.proposal_snapshot.proposal_id, targetState: 'PARENT_PREQUALIFIED' });
  const admitted = rt.transitionProposal({ parentState: preq.parentState, ledger: preq.ledger, proposalId: preq.proposal_snapshot.proposal_id, targetState: 'ADMITTED' });
  const versions = admitted.ledger.proposal_snapshots.filter(p => p.proposal_family_id === initial.proposal_snapshot.proposal_family_id);
  assert(versions.length === 4 && versions.map(p => p.proposal_version).join(',') === '1,2,3,4', 'IMMUTABLE_VERSION_CHAIN_FAIL');
  assert(admitted.proposal_snapshot.admission_state === 'ADMITTED' && admitted.proposal_snapshot.publication_authorized === false, 'ADMISSION_STATE_FAIL');
});

test('ADMISSION_DOES_NOT_MUTATE_CANONICAL_POINTERS', () => {
  const parent = baseParent(); const protectedBefore = rt.protectedParentFingerprint(parent); const initial = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...prosePair(parent) });
  const reviewed = rt.transitionProposal({ parentState: initial.parentState, ledger: initial.ledger, proposalId: initial.proposal_snapshot.proposal_id, targetState: 'EVIDENCE_REVIEWED' });
  const preq = rt.transitionProposal({ parentState: reviewed.parentState, ledger: reviewed.ledger, proposalId: reviewed.proposal_snapshot.proposal_id, targetState: 'PARENT_PREQUALIFIED' });
  const admitted = rt.transitionProposal({ parentState: preq.parentState, ledger: preq.ledger, proposalId: preq.proposal_snapshot.proposal_id, targetState: 'ADMITTED' });
  assert(rt.protectedParentFingerprint(admitted.parentState) === protectedBefore, 'ADMISSION_MUTATED_PROTECTED_PARENT');
  assert(admitted.parentState.book_project.status === parent.book_project.status && admitted.parentState.active.canonical_manuscript_ref === parent.active.canonical_manuscript_ref, 'ADMISSION_CHANGED_CANONICAL_STATE');
});

test('AUTHOR_HANDOFF_PENDING_NO_FABRICATED_APPROVAL', () => {
  const parent = baseParent(); const out = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...authorPair(parent) });
  assert(out.disposition === 'AUTHOR_QUEUE_HANDOFF_CREATED' && out.ledger.author_queue_handoffs.length === 1, 'AUTHOR_HANDOFF_NOT_CREATED');
  const h = out.ledger.author_queue_handoffs[0];
  assert(h.status === 'PENDING' && !Object.prototype.hasOwnProperty.call(h, 'author_choice'), 'AUTHOR_APPROVAL_FABRICATED');
  assert(out.parentState.author_decisions.length === 0, 'AUTHOR_DECISION_OBJECT_FABRICATED');
});

test('AUTHOR_DECISION_REQUIRED_FOR_ADMISSION', () => {
  const parent = baseParent(); const initial = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...authorPair(parent) });
  const reviewed = rt.transitionProposal({ parentState: initial.parentState, ledger: initial.ledger, proposalId: initial.proposal_snapshot.proposal_id, targetState: 'EVIDENCE_REVIEWED' });
  const preq = rt.transitionProposal({ parentState: reviewed.parentState, ledger: reviewed.ledger, proposalId: reviewed.proposal_snapshot.proposal_id, targetState: 'PARENT_PREQUALIFIED' });
  expectError(() => rt.transitionProposal({ parentState: preq.parentState, ledger: preq.ledger, proposalId: preq.proposal_snapshot.proposal_id, targetState: 'ADMITTED' }), 'AUTHOR_DECISION_REQUIRED');
  const decision = { decision_id: 'AUTHOR-DECISION-001', subject_ref: preq.proposal_snapshot.proposal_id, status: 'APPROVED', author_choice: 'APPROVE' };
  const admitted = rt.transitionProposal({ parentState: preq.parentState, ledger: preq.ledger, proposalId: preq.proposal_snapshot.proposal_id, targetState: 'ADMITTED', authorDecisions: [decision] });
  assert(admitted.proposal_snapshot.admission_state === 'ADMITTED' && admitted.proposal_snapshot.author_decision_refs.length === 1, 'AUTHOR_APPROVED_ADMISSION_FAIL');
});

test('STALE_SOURCE_BLOCKS_ADVANCEMENT', () => {
  const parent = baseParent(); const initial = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...prosePair(parent) });
  const reviewed = rt.transitionProposal({ parentState: initial.parentState, ledger: initial.ledger, proposalId: initial.proposal_snapshot.proposal_id, targetState: 'EVIDENCE_REVIEWED' });
  const staleLedger = rt.updateSourceIdentity(reviewed.ledger, fixtures.next_source_identity);
  expectError(() => rt.transitionProposal({ parentState: reviewed.parentState, ledger: staleLedger, proposalId: reviewed.proposal_snapshot.proposal_id, targetState: 'PARENT_PREQUALIFIED' }), 'STALE_SOURCE_IDENTITY');
});

test('STALE_ARTIFACT_BLOCKS_ADVANCEMENT', () => {
  const parent = baseParent(); const initial = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...documentPair(parent) });
  const reviewed = rt.transitionProposal({ parentState: initial.parentState, ledger: initial.ledger, proposalId: initial.proposal_snapshot.proposal_id, targetState: 'EVIDENCE_REVIEWED' });
  const staleLedger = rt.updateArtifactIdentity(reviewed.ledger, { artifact_ref: 'ARTIFACT:EPUB-001', artifact_digest: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', target_medium_profile_id: 'EPUB_3_3_PRODUCTION', target_medium_profile_version: 1, current: true });
  expectError(() => rt.transitionProposal({ parentState: reviewed.parentState, ledger: staleLedger, proposalId: reviewed.proposal_snapshot.proposal_id, targetState: 'PARENT_PREQUALIFIED' }), 'STALE_ARTIFACT_IDENTITY');
});

test('RIGHTS_PRIVACY_RECLASSIFICATION_BLOCKS_ADVANCEMENT', () => {
  const parent = baseParent(); const initial = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...prosePair(parent) });
  const reviewed = rt.transitionProposal({ parentState: initial.parentState, ledger: initial.ledger, proposalId: initial.proposal_snapshot.proposal_id, targetState: 'EVIDENCE_REVIEWED' });
  const reclassified = rt.applyRightsPrivacyReclassification({ parentState: reviewed.parentState, ledger: reviewed.ledger, proposalId: reviewed.proposal_snapshot.proposal_id, rightsBoundary: 'RESTRICTED_PENDING_REVIEW', privacyBoundary: 'PRIVATE_INTERNAL_ONLY', action: 'STALE' });
  expectError(() => rt.transitionProposal({ parentState: reclassified.parentState, ledger: reclassified.ledger, proposalId: reclassified.proposal_snapshot.proposal_id, targetState: 'PARENT_PREQUALIFIED' }), 'CRITICAL_HARD_FAILURE_REMAINS');
});

test('POST_LAYOUT_PROOF_IS_NOT_EXPORT_FREEZE', () => {
  const parent = baseParent(); const out = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...documentPair(parent) });
  assert(out.proposal_snapshot.technical_export_state === 'POST_LAYOUT_PROOF_COMPLETE', 'PROOF_STATE_NOT_PRESERVED');
  assert(out.proposal_snapshot.publication_authorized === false && out.parentState.book_project.status === parent.book_project.status, 'PROOF_ESCALATED_AUTHORITY');
  assert(out.parentState.export_releases.length === parent.export_releases.length, 'PROOF_CREATED_EXPORT_RELEASE');
});

test('PROVIDER_EXPORT_FREEZE_TECHNICAL_STATE_REJECTED', () => {
  const parent = baseParent(); const pair = documentPair(parent); pair.response.target_medium_evidence[0].technical_state = 'EXPORT_FROZEN';
  expectError(() => rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...pair }), 'PROVIDER_TECHNICAL_STATE_FORBIDDEN');
});

test('PROVENANCE_CHANGED_BYTES_NEW_DIGEST_ACCEPTED', () => {
  const parent = baseParent(); const out = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...provenancePair(parent) });
  assert(out.disposition === 'RECORDED_NO_PROPOSAL' && !out.proposal_snapshot, 'PROVENANCE_REGISTER_ARTIFACT_SHOULD_NOT_PROPOSE');
  assert(out.ledger.artifact_identity_index['ARTIFACT:EPUB-001:CREDENTIALLED'].artifact_digest === 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', 'FINAL_CREDENTIAL_DIGEST_NOT_INDEXED');
  assert(out.ledger.provenance_projection_index['C2PA:MANIFEST-001'].current === true, 'PROVENANCE_NOT_CURRENT');
});

test('PROVENANCE_REUSED_DIGEST_REJECTED', () => {
  const parent = baseParent(); const pair = provenancePair(parent);
  pair.response.artifact_evidence[0].artifact_digest = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
  pair.response.provenance_evidence[0].bound_artifact_digest = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
  expectError(() => rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...pair }), 'CREDENTIAL_CHANGED_BYTES_REQUIRES_NEW_DIGEST');
});

test('STALE_PROVENANCE_PRESERVED', () => {
  const parent = baseParent(); const pair = provenancePair(parent); pair.response.provenance_evidence[0].currentness_state = 'SUPERSEDED_FOR_CURRENT_RELEASE';
  const out = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...pair });
  assert(out.disposition === 'STALE_PROVENANCE_PRESERVED' && !out.proposal_snapshot, 'STALE_PROVENANCE_NOT_PRESERVED');
});

test('NONIDEMPOTENT_UNKNOWN_RETRY_REQUIRES_RECONCILIATION', () => {
  const parent = baseParent(); const pair = provenancePair(parent); const ledger = baseLedger(parent);
  const first = rt.registerRequestAttempt(registry, ledger, pair.request, 'UNKNOWN');
  assert(first.disposition === 'NEW', 'NONIDEMPOTENT_FIRST_ATTEMPT_FAIL');
  expectError(() => rt.registerRequestAttempt(registry, first.ledger, pair.request, 'UNKNOWN'), 'NONIDEMPOTENT_RETRY_REQUIRES_RECONCILIATION');
  const reconciled = rt.reconcileRequestOutcome(first.ledger, pair.request.idempotency_key);
  assert(reconciled.request_attempt_index[pair.request.idempotency_key].outcome_state === 'RECONCILED', 'NONIDEMPOTENT_RECONCILIATION_FAIL');
});

test('OUTBOX_DELIVERY_REPLAY_IDEMPOTENT', () => {
  const parent = baseParent(); const initial = rt.intakeServiceResponse({ registry, parentState: parent, ledger: baseLedger(parent), ...prosePair(parent) });
  const event = initial.ledger.outbox_entries[0];
  const delivered = rt.markOutboxDelivered(initial.ledger, event.event_id);
  assert(delivered.disposition === 'DELIVERED' && delivered.committed === true, 'OUTBOX_FIRST_DELIVERY_FAIL');
  const replay = rt.markOutboxDelivered(delivered.ledger, event.event_id);
  assert(replay.disposition === 'REPLAY' && replay.committed === false, 'OUTBOX_REPLAY_FAIL');
});

test('FAILED_TRANSACTION_LEAVES_INPUTS_UNCHANGED', () => {
  const parent = baseParent(); const ledger = baseLedger(parent); const parentBefore = rt.stableStringify(parent); const ledgerBefore = rt.stableStringify(ledger);
  const pair = prosePair(parent); pair.response.canonical_write = true;
  expectError(() => rt.intakeServiceResponse({ registry, parentState: parent, ledger, ...pair }), 'PROVIDER_AUTHORITY_CLAIM_FORBIDDEN');
  assert(rt.stableStringify(parent) === parentBefore && rt.stableStringify(ledger) === ledgerBefore, 'FAILED_TRANSACTION_MUTATED_INPUTS');
});

function staticSafetyChecks() {
  const coreSource = fs.readFileSync(path.join(workspace, ...paths.core.split('/')), 'utf8');
  const entrySource = fs.readFileSync(path.join(workspace, ...paths.entrypoint.split('/')), 'utf8');
  const banned = ['pdf-lib', 'libreoffice', 'pandoc', 'epub-gen', 'docx-generator', 'c2pa-node', 'playwright'];
  for (const token of banned) assert(!coreSource.toLowerCase().includes(token), 'DOCUMENT_ENGINE_DEPENDENCY_FORBIDDEN', token);
  assert(!coreSource.includes("require('./lifecycle-transition-engine") && !coreSource.includes('require("./lifecycle-transition-engine'), 'LIFECYCLE_ENGINE_COUPLING_FORBIDDEN');
  assert(entrySource.includes("require('./integration-proposal-runtime-v2-core')"), 'ENTRYPOINT_NOT_BOUND_TO_HARDENED_CORE');
  assert(contract.runtime_id === 'BOOK-SYSTEM-INTEGRATION-PROPOSAL-RUNTIME-002', 'RUNTIME_CONTRACT_ID_MISMATCH');
  assert(contract.service_registry_compatibility.required_registry === 'BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-002', 'RUNTIME_REQUIRES_WRONG_REGISTRY');
  assert(research.decisions.some(d => d.topic === 'TRANSACTIONAL_OUTBOX' && d.classification === 'ADOPT'), 'OUTBOX_RESEARCH_DECISION_MISSING');
  assert(research.decisions.some(d => d.topic === 'IETF_IDEMPOTENCY_KEY_DRAFT_07' && d.classification === 'DO_NOT_BIND'), 'IDEMPOTENCY_DRAFT_BOUNDARY_MISSING');
}

try {
  staticSafetyChecks();
  const expectedIds = fixtures.case_ids;
  assert(Array.isArray(expectedIds) && expectedIds.length === 35, 'EXPECTED_35_CASES');
  for (const id of expectedIds) assert(typeof cases[id] === 'function', 'CASE_IMPLEMENTATION_MISSING', id);
  assert(Object.keys(cases).length === 35, 'QUALIFIER_CASE_COUNT_MISMATCH', String(Object.keys(cases).length));

  const results = [];
  for (const id of expectedIds) {
    try {
      const detail = cases[id]() || null;
      results.push({ case_id: id, result: 'PASS', detail });
    } catch (error) {
      results.push({ case_id: id, result: 'FAIL', code: error && error.code ? error.code : 'UNEXPECTED_ERROR', detail: error && error.detail ? error.detail : (error && error.stack ? error.stack : String(error)) });
      throw error;
    }
  }

  const head = gitHead();
  const subject = {
    qualification_id: 'BOOK-SYSTEM-INTEGRATION-PROPOSAL-RUNTIME-002',
    repository: process.env.GITHUB_REPOSITORY || 'BFochtman746/system-master',
    subject_sha: head,
    exact_subject_only: true,
    registry_v2_qualified_dependency_sha: '77db6b550e9aeb1dfb956627376becbb591498f8',
    runtime_entrypoint_sha256: gitBlobSha256(paths.entrypoint),
    runtime_core_sha256: gitBlobSha256(paths.core),
    runtime_contract_sha256: gitBlobSha256(paths.contract),
    registry_v2_sha256: gitBlobSha256(paths.registry),
    fixture_sha256: gitBlobSha256(paths.fixtures),
    qualifier_sha256: gitBlobSha256(paths.qualifier),
    research_sha256: gitBlobSha256(paths.research),
    fixture_count: results.length,
    service_family_count: 4,
    registered_operation_count: 21,
    provider_canonical_write_authority: false,
    provider_lifecycle_transition_authority: false,
    provider_export_freeze_authority: false,
    provider_publication_authority: false,
    book_owned_document_engine_authority: false,
    admission_equals_manuscript_promotion: false,
    admission_equals_publication: false,
  };
  for (const value of [subject.runtime_entrypoint_sha256, subject.runtime_core_sha256, subject.runtime_contract_sha256, subject.registry_v2_sha256, subject.fixture_sha256, subject.qualifier_sha256, subject.research_sha256]) assert(isSha(value), 'INVALID_SUBJECT_FILE_DIGEST');

  const payload = { standing: 'PASS', subject, results };
  writeEvidence('qualification-result.json', payload);
  writeEvidence('subject-sha.txt', `${head}\n`);
  writeEvidence('runtime-entrypoint-digest.txt', `${subject.runtime_entrypoint_sha256}\n`);
  writeEvidence('runtime-core-digest.txt', `${subject.runtime_core_sha256}\n`);
  writeEvidence('runtime-contract-digest.txt', `${subject.runtime_contract_sha256}\n`);
  writeEvidence('registry-v2-digest.txt', `${subject.registry_v2_sha256}\n`);
  writeEvidence('fixtures-digest.txt', `${subject.fixture_sha256}\n`);
  writeEvidence('qualifier-digest.txt', `${subject.qualifier_sha256}\n`);
  writeEvidence('research-digest.txt', `${subject.research_sha256}\n`);
  writeEvidence('authority-boundary.json', {
    canonical_owner: 'SYSTEM_MASTER/BOOK',
    prose_owner: 'SYSTEM_MASTER/BOOK/PROSE',
    document_implementation_owner: 'EXTERNAL_OR_FUTURE_ALLOCATED_TOOL__NOT_BOOK',
    provider_canonical_write_authority: false,
    provider_lifecycle_transition_authority: false,
    provider_export_freeze_authority: false,
    provider_publication_authority: false,
    author_decision_fabrication_authority: false,
    exact_sha_evidence_transfer: false,
  });
  console.log(`BOOK_SYSTEM_INTEGRATION_PROPOSAL_RUNTIME_002_QUALIFICATION_PASS cases=${results.length} services=4 operations=21 sha=${head}`);
} catch (error) {
  const payload = {
    standing: 'FAIL',
    code: error && error.code ? error.code : 'UNEXPECTED_ERROR',
    detail: error && error.detail ? error.detail : (error && error.stack ? error.stack : String(error)),
  };
  try { writeEvidence('qualification-result.json', payload); } catch (_) {}
  console.error(`BOOK_SYSTEM_INTEGRATION_PROPOSAL_RUNTIME_002_QUALIFICATION_FAIL ${payload.code}${payload.detail ? `:${payload.detail}` : ''}`);
  process.exit(1);
}
