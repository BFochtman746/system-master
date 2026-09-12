'use strict';

const engine = require('./lifecycle-transition-engine.js');
const core = require('./canonical-parent-v2-f6-core.js');
const contract = require('../../qualification/book-system/lifecycle-transition-001/BOOK-SYSTEM-LIFECYCLE-TRANSITION-ENGINE-001.json');

const SPECIALIST_SCHEMA_VERSION = 'BOOK_LIFECYCLE_SPECIALIST_V2';
const SPECIALIST_RECEIPT_SCHEMA_VERSION = 'BOOK_LIFECYCLE_SPECIALIST_RECEIPT_V1';
const SPECIALIST_KIND = 'LIFECYCLE';

class BookLifecycleV2RebindError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookLifecycleV2RebindError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookLifecycleV2RebindError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function isSha(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }
function required(v, keys, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const key of keys) if (!own(v, key)) fail('REQUIRED_FIELD_MISSING', `${label}.${key}`);
}

function assertCanonicalProjectionIdentity(record, canonicalParent, label) {
  if (!obj(record) || !obj(record.parent_projection_identity)) return;
  const identity = record.parent_projection_identity;
  if (identity.parent_state_version !== canonicalParent.state_version || identity.parent_state_digest !== canonicalParent.state_digest) {
    fail('STALE_CANONICAL_EVIDENCE', label);
  }
}

function indexRecords(records, idField, canonicalParent, label) {
  if (!Array.isArray(records)) fail('PARENT_COLLECTION_ARRAY_REQUIRED', label);
  const out = {};
  for (const recordInput of records) {
    const record = clone(recordInput);
    if (!obj(record) || !nonEmpty(record[idField])) fail('RECORD_ID_REQUIRED', `${label}.${idField}`);
    if (own(out, record[idField])) fail('DUPLICATE_RECORD_ID', `${label}:${record[idField]}`);
    assertCanonicalProjectionIdentity(record, canonicalParent, `${label}:${record[idField]}`);
    delete record.parent_projection_identity;
    out[record[idField]] = record;
  }
  return out;
}

function projectCanonicalParent(canonicalParentInput) {
  const canonicalParent = clone(canonicalParentInput);
  core.validateParent(canonicalParent);
  return {
    state_version: canonicalParent.state_version,
    book_project: clone(canonicalParent.book_project),
    research_evidence_links: indexRecords(canonicalParent.research_evidence_links, 'link_id', canonicalParent, 'research_evidence_links'),
    author_decisions: indexRecords(canonicalParent.author_decisions, 'decision_id', canonicalParent, 'author_decisions'),
    integration_proposals: indexRecords(canonicalParent.integration_proposals, 'proposal_id', canonicalParent, 'integration_proposals'),
    export_releases: indexRecords(canonicalParent.export_releases, 'release_id', canonicalParent, 'export_releases'),
  };
}

function emptyUnitState(unitRef, unitType = 'CHAPTER', status = 'PLANNED', authorRequired = false) {
  return {
    unit_ref: unitRef,
    unit_type: unitType,
    status,
    status_version: 1,
    last_transition_receipt_ref: null,
    deferred_from_status: null,
    invalidated_from_status: null,
    invalidation_causes: [],
    author_required: authorRequired,
  };
}

function createLifecycleSpecialistState(canonicalParentInput, options = {}) {
  const canonicalParent = clone(canonicalParentInput);
  const projection = projectCanonicalParent(canonicalParent);
  const ledger = {
    ledger_schema_version: contract.engine_version,
    ledger_version: 1,
    bound_parent_state_version: projection.state_version,
    bound_parent_state_digest: engine.digestParentState(projection),
    unit_states: clone(options.unit_states || {}),
    dependency_edges: clone(options.dependency_edges || []),
    processed_requests: {},
    transition_receipts: {},
  };
  engine.validateLedger(contract, projection, ledger);
  return {
    schema_version: SPECIALIST_SCHEMA_VERSION,
    book_project_id: canonicalParent.book_project.book_project_id,
    canonical_parent_state_version: canonicalParent.state_version,
    canonical_parent_state_digest: canonicalParent.state_digest,
    delegated_parent_projection_digest: engine.digestParentState(projection),
    lifecycle_ledger: ledger,
  };
}

function validateLifecycleSpecialistState(stateInput, canonicalParentInput) {
  const state = clone(stateInput);
  const canonicalParent = clone(canonicalParentInput);
  required(state, ['schema_version','book_project_id','canonical_parent_state_version','canonical_parent_state_digest','delegated_parent_projection_digest','lifecycle_ledger'], 'lifecycle_state');
  if (state.schema_version !== SPECIALIST_SCHEMA_VERSION) fail('INVALID_SPECIALIST_SCHEMA_VERSION');
  core.validateParent(canonicalParent);
  if (state.book_project_id !== canonicalParent.book_project.book_project_id) fail('SPECIALIST_BOOK_PROJECT_MISMATCH');
  if (state.canonical_parent_state_version !== canonicalParent.state_version) fail('SPECIALIST_PARENT_VERSION_BINDING_MISMATCH');
  if (state.canonical_parent_state_digest !== canonicalParent.state_digest) fail('SPECIALIST_PARENT_DIGEST_BINDING_MISMATCH');
  if (!isSha(state.canonical_parent_state_digest) || !isSha(state.delegated_parent_projection_digest)) fail('INVALID_SPECIALIST_PARENT_DIGEST');
  const projection = projectCanonicalParent(canonicalParent);
  const projectionDigest = engine.digestParentState(projection);
  if (projectionDigest !== state.delegated_parent_projection_digest) fail('SPECIALIST_PROJECTION_DIGEST_BINDING_MISMATCH');
  engine.validateLedger(contract, projection, state.lifecycle_ledger);
  return true;
}

function lifecycleIdentity(stateInput, canonicalParentInput) {
  validateLifecycleSpecialistState(stateInput, canonicalParentInput);
  return core.sha256(stateInput);
}

function validateAdapterRequest(canonicalParent, lifecycleState, request) {
  required(request, ['transition_request_id','idempotency_key','actor_class','scope','target_ref','target_status','expected_parent_state_version','expected_parent_state_digest','expected_lifecycle_identity','evidence_refs','author_decision_refs','integration_proposal_refs','cause_refs','created_at'], 'lifecycle_request');
  if (!nonEmpty(request.transition_request_id) || !nonEmpty(request.idempotency_key)) fail('REQUEST_IDEMPOTENCY_REQUIRED');
  if (request.actor_class !== 'PARENT_SYSTEM') fail('TRANSITION_AUTHORITY_DENIED', String(request.actor_class));
  if (!['PROJECT','UNIT'].includes(request.scope)) fail('INVALID_TRANSITION_SCOPE', String(request.scope));
  if (!nonEmpty(request.target_ref) || !nonEmpty(request.target_status)) fail('TRANSITION_TARGET_REQUIRED');
  if (request.expected_parent_state_version !== canonicalParent.state_version) fail('PARENT_STATE_VERSION_MISMATCH');
  if (request.expected_parent_state_digest !== canonicalParent.state_digest) fail('PARENT_STATE_DIGEST_MISMATCH');
  const currentIdentity = lifecycleIdentity(lifecycleState, canonicalParent);
  if (request.expected_lifecycle_identity !== currentIdentity) fail('LIFECYCLE_IDENTITY_MISMATCH');
  if (!nonEmpty(request.created_at) || Number.isNaN(Date.parse(request.created_at))) fail('INVALID_EFFECT_TIME');
  for (const field of ['evidence_refs','author_decision_refs','integration_proposal_refs','cause_refs']) if (!Array.isArray(request[field])) fail('TRANSITION_REQUEST_ARRAY_REQUIRED', field);
  return currentIdentity;
}

function delegatedRequest(canonicalParent, lifecycleState, request) {
  const projection = projectCanonicalParent(canonicalParent);
  return {
    transition_request_id: request.transition_request_id,
    idempotency_key: request.idempotency_key,
    actor_class: request.actor_class,
    scope: request.scope,
    target_ref: request.target_ref,
    target_status: request.target_status,
    expected_parent_state_version: projection.state_version,
    expected_parent_state_digest: engine.digestParentState(projection),
    expected_ledger_version: lifecycleState.lifecycle_ledger.ledger_version,
    expected_ledger_digest: engine.digestLedger(lifecycleState.lifecycle_ledger),
    evidence_refs: clone(request.evidence_refs),
    author_decision_refs: clone(request.author_decision_refs),
    integration_proposal_refs: clone(request.integration_proposal_refs),
    cause_refs: clone(request.cause_refs),
  };
}

function specialistReceiptIdFromFingerprint(transitionRequestId, idempotencyKey, requestFingerprint, preIdentity) {
  return `BLC-${core.sha256({
    transition_request_id: transitionRequestId,
    idempotency_key: idempotencyKey,
    request_fingerprint: requestFingerprint,
    pre_identity: preIdentity,
  }).slice(0, 32).toUpperCase()}`;
}

function specialistReceiptId(request, preIdentity) {
  return specialistReceiptIdFromFingerprint(request.transition_request_id, request.idempotency_key, core.sha256(request), preIdentity);
}

function buildSpecialistReceipt({ receiptId, request, requestFingerprint, preIdentity, postIdentity, delegatedResult, canonicalPre, canonicalPost, disposition }) {
  const receipt = {
    receipt_schema_version: SPECIALIST_RECEIPT_SCHEMA_VERSION,
    receipt_id: receiptId,
    specialist_kind: SPECIALIST_KIND,
    book_project_id: canonicalPre.book_project.book_project_id,
    transition_request_id: request.transition_request_id,
    idempotency_key: request.idempotency_key,
    request_fingerprint: requestFingerprint,
    scope: request.scope,
    target_ref: request.target_ref,
    from_status: delegatedResult.receipt.from_status,
    to_status: delegatedResult.receipt.to_status,
    evidence_refs: clone(request.evidence_refs),
    author_decision_refs: clone(request.author_decision_refs),
    integration_proposal_refs: clone(request.integration_proposal_refs),
    cause_refs: clone(request.cause_refs),
    engine_transition_receipt_id: delegatedResult.receipt.transition_receipt_id,
    pre_lifecycle_identity: preIdentity,
    post_lifecycle_identity: postIdentity,
    pre_parent_state_version: canonicalPre.state_version,
    pre_parent_state_digest: canonicalPre.state_digest,
    post_parent_state_version: canonicalPost.state_version,
    post_parent_state_digest: canonicalPost.state_digest,
    delegated_pre_parent_digest: delegatedResult.receipt.pre_parent_state_digest,
    delegated_post_parent_digest: delegatedResult.receipt.post_parent_state_digest,
    invalidated_unit_refs: clone(delegatedResult.receipt.invalidated_unit_refs || []),
    disposition,
    created_at: request.created_at,
  };
  receipt.receipt_digest = core.sha256(receipt);
  return receipt;
}

function validatePreparedLifecycleDelta(deltaInput, canonicalPreInput, canonicalPostInput = null) {
  const delta = clone(deltaInput);
  const canonicalPre = clone(canonicalPreInput);
  required(delta, ['specialist_kind','scope','book_project_id','expected_lifecycle_identity','post_lifecycle_identity','post_state','specialist_receipt','delta_digest'], 'lifecycle_delta');
  if (delta.specialist_kind !== SPECIALIST_KIND) fail('SPECIALIST_KIND_MISMATCH');
  if (!['PROJECT','UNIT'].includes(delta.scope)) fail('INVALID_TRANSITION_SCOPE');
  if (!isSha(delta.expected_lifecycle_identity) || !isSha(delta.post_lifecycle_identity) || !isSha(delta.delta_digest)) fail('INVALID_LIFECYCLE_IDENTITY');
  const canonicalPost = canonicalPostInput ? clone(canonicalPostInput) : canonicalPre;
  validateLifecycleSpecialistState(delta.post_state, canonicalPost);
  if (core.sha256(delta.post_state) !== delta.post_lifecycle_identity) fail('LIFECYCLE_POST_IDENTITY_MISMATCH');
  if (!obj(delta.specialist_receipt) || delta.specialist_receipt.receipt_schema_version !== SPECIALIST_RECEIPT_SCHEMA_VERSION) fail('INVALID_SPECIALIST_RECEIPT');
  const sr = delta.specialist_receipt;
  if (sr.pre_lifecycle_identity !== delta.expected_lifecycle_identity || sr.post_lifecycle_identity !== delta.post_lifecycle_identity) fail('SPECIALIST_RECEIPT_IDENTITY_MISMATCH');
  if (!isSha(sr.request_fingerprint)) fail('INVALID_REQUEST_FINGERPRINT');
  const expectedReceiptId = specialistReceiptIdFromFingerprint(sr.transition_request_id, sr.idempotency_key, sr.request_fingerprint, delta.expected_lifecycle_identity);
  if (sr.receipt_id !== expectedReceiptId) fail('SPECIALIST_RECEIPT_ID_MISMATCH');
  const receiptCopy = clone(sr);
  const claimedReceiptDigest = receiptCopy.receipt_digest;
  delete receiptCopy.receipt_digest;
  if (core.sha256(receiptCopy) !== claimedReceiptDigest) fail('SPECIALIST_RECEIPT_DIGEST_MISMATCH');
  const expectedDeltaDigest = core.sha256({
    specialist_kind: delta.specialist_kind,
    scope: delta.scope,
    book_project_id: delta.book_project_id,
    expected_lifecycle_identity: delta.expected_lifecycle_identity,
    post_lifecycle_identity: delta.post_lifecycle_identity,
    specialist_receipt: delta.specialist_receipt,
  });
  if (expectedDeltaDigest !== delta.delta_digest) fail('SPECIALIST_DELTA_DIGEST_MISMATCH');
  return true;
}

function prepareLifecycleTransition({ canonicalParent: canonicalParentInput, lifecycleState: lifecycleStateInput, request: requestInput }) {
  const canonicalParent = clone(canonicalParentInput);
  const lifecycleState = clone(lifecycleStateInput);
  const request = clone(requestInput);
  core.validateParent(canonicalParent);
  const preIdentity = validateAdapterRequest(canonicalParent, lifecycleState, request);
  const projection = projectCanonicalParent(canonicalParent);
  const engineRequest = delegatedRequest(canonicalParent, lifecycleState, request);
  const delegatedResult = engine.applyTransition(contract, projection, lifecycleState.lifecycle_ledger, engineRequest);
  const requestFingerprint = core.sha256(request);
  const receiptId = specialistReceiptIdFromFingerprint(request.transition_request_id, request.idempotency_key, requestFingerprint, preIdentity);

  let canonicalPost = canonicalParent;
  let parentEffect = null;
  if (request.scope === 'PROJECT') {
    if (request.target_ref !== canonicalParent.book_project.book_project_id) fail('PROJECT_TARGET_REF_MISMATCH');
    const payload = { to_status: delegatedResult.receipt.to_status };
    parentEffect = {
      effect_schema_version: core.EFFECT_SCHEMA_VERSION,
      effect_request_id: `BLC-PARENT-${core.sha256({ transition_request_id: request.transition_request_id, idempotency_key: request.idempotency_key }).slice(0, 32).toUpperCase()}`,
      idempotency_key: `BLC:${request.idempotency_key}`,
      actor_class: 'SYSTEM',
      authority_ref: null,
      expected_parent_state_version: canonicalParent.state_version,
      expected_parent_state_digest: canonicalParent.state_digest,
      effect_type: 'ADVANCE_PROJECT_STATUS',
      effect_payload: payload,
      effect_payload_digest: core.effectPayloadDigest(payload),
      subject_identity_refs: [canonicalParent.book_project.book_project_id],
      evidence_refs: clone(request.evidence_refs),
      specialist_receipt_refs: [receiptId],
      created_at: request.created_at,
      expected_specialist_ledger_identity: preIdentity,
    };
    canonicalPost = core.applyEffect(canonicalParent, parentEffect).parent_state;
  }

  const postProjection = request.scope === 'PROJECT' ? projectCanonicalParent(canonicalPost) : projection;
  const postState = {
    schema_version: SPECIALIST_SCHEMA_VERSION,
    book_project_id: canonicalParent.book_project.book_project_id,
    canonical_parent_state_version: canonicalPost.state_version,
    canonical_parent_state_digest: canonicalPost.state_digest,
    delegated_parent_projection_digest: engine.digestParentState(postProjection),
    lifecycle_ledger: clone(delegatedResult.lifecycle_ledger),
  };
  if (postState.lifecycle_ledger.bound_parent_state_version !== postProjection.state_version || postState.lifecycle_ledger.bound_parent_state_digest !== engine.digestParentState(postProjection)) {
    fail('DELEGATED_LEDGER_POST_BINDING_MISMATCH');
  }
  validateLifecycleSpecialistState(postState, canonicalPost);
  const postIdentity = core.sha256(postState);
  const disposition = request.scope === 'PROJECT' ? 'PREPARED_FOR_PARENT' : 'PREPARED_SPECIALIST_ONLY';
  const specialistReceipt = buildSpecialistReceipt({ receiptId, request, requestFingerprint, preIdentity, postIdentity, delegatedResult, canonicalPre: canonicalParent, canonicalPost, disposition });

  const delta = {
    specialist_kind: SPECIALIST_KIND,
    scope: request.scope,
    book_project_id: canonicalParent.book_project.book_project_id,
    expected_lifecycle_identity: preIdentity,
    post_lifecycle_identity: postIdentity,
    post_state: postState,
    specialist_receipt: specialistReceipt,
  };
  delta.delta_digest = core.sha256({
    specialist_kind: delta.specialist_kind,
    scope: delta.scope,
    book_project_id: delta.book_project_id,
    expected_lifecycle_identity: delta.expected_lifecycle_identity,
    post_lifecycle_identity: delta.post_lifecycle_identity,
    specialist_receipt: delta.specialist_receipt,
  });
  validatePreparedLifecycleDelta(delta, canonicalParent, canonicalPost);

  return {
    disposition,
    parent_effect: parentEffect,
    anticipated_parent_state: clone(canonicalPost),
    specialist_delta: delta,
    delegated_transition_receipt: clone(delegatedResult.receipt),
  };
}

module.exports = {
  BookLifecycleV2RebindError,
  SPECIALIST_SCHEMA_VERSION,
  SPECIALIST_RECEIPT_SCHEMA_VERSION,
  SPECIALIST_KIND,
  contract,
  emptyUnitState,
  projectCanonicalParent,
  createLifecycleSpecialistState,
  validateLifecycleSpecialistState,
  lifecycleIdentity,
  specialistReceiptId,
  prepareLifecycleTransition,
  validatePreparedLifecycleDelta,
};
