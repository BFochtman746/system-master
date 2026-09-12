'use strict';

const core = require('./canonical-parent-v2-f6-core.js');
const queue = require('./author-decision-queue-core.js');

const SPECIALIST_SCHEMA_VERSION = 'BOOK_AUTHOR_DECISION_SPECIALIST_V2';
const SPECIALIST_RECEIPT_SCHEMA_VERSION = 'BOOK_AUTHOR_DECISION_SPECIALIST_RECEIPT_V1';
const SPECIALIST_KIND = 'AUTHOR_DECISION';
const RESOLVABLE = new Set(['PENDING', 'PRESENTED']);
const CANONICAL_STATUSES = new Set(['APPROVED', 'REJECTED']);

class BookAuthorDecisionV2RebindError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookAuthorDecisionV2RebindError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookAuthorDecisionV2RebindError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function isSha(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }
function required(v, keys, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const key of keys) if (!own(v, key)) fail('REQUIRED_FIELD_MISSING', `${label}.${key}`);
}
function uniq(values) { return [...new Set((values || []).map(String))].sort(); }
function makeId(prefix, seed, n = 32) { return `${prefix}-${core.sha256(seed).slice(0, n).toUpperCase()}`; }

function emptyQueueLedger(canonicalParent) {
  return {
    queue_schema_version: 1,
    queue_ledger_version: 1,
    bound_parent_state_version: canonicalParent.state_version,
    bound_parent_state_digest: canonicalParent.state_digest,
    decision_families: {},
    decision_request_snapshots: {},
    current_request_index: {},
    source_handoff_index: {},
    processed_requests: {},
    resolution_receipts: {},
    outbox_entries: [],
  };
}

function createAuthorDecisionSpecialistState(canonicalParentInput, options = {}) {
  const canonicalParent = clone(canonicalParentInput);
  core.validateParent(canonicalParent);
  const ledger = clone(options.queue_ledger || emptyQueueLedger(canonicalParent));
  ledger.bound_parent_state_version = canonicalParent.state_version;
  ledger.bound_parent_state_digest = canonicalParent.state_digest;
  queue.validateQueueLedger(ledger);
  const state = {
    schema_version: SPECIALIST_SCHEMA_VERSION,
    book_project_id: canonicalParent.book_project.book_project_id,
    canonical_parent_state_version: canonicalParent.state_version,
    canonical_parent_state_digest: canonicalParent.state_digest,
    queue_ledger: ledger,
  };
  validateAuthorDecisionSpecialistState(state, canonicalParent);
  return state;
}

function parentSubjectCatalog(canonicalParent) {
  const catalog = new Set();
  catalog.add(`${canonicalParent.book_project.book_project_id}|STATE-${canonicalParent.state_version}|${core.sha256(canonicalParent.book_project)}`);
  for (const collection of Object.values(canonicalParent.governed_objects || {})) {
    for (const record of collection || []) {
      const digest = record.object_digest || record.artifact_digest;
      if (nonEmpty(record.object_id) && nonEmpty(String(record.version)) && isSha(digest)) {
        catalog.add(`${record.object_id}|${String(record.version)}|${digest}`);
      }
    }
  }
  for (const [collection, idField] of [
    ['research_evidence_links', 'link_id'], ['author_decisions', 'decision_id'],
    ['integration_proposals', 'proposal_id'], ['export_releases', 'release_id'],
  ]) {
    for (const record of canonicalParent[collection] || []) {
      const id = String(record[idField] || '');
      if (id) catalog.add(`${id}|UNVERSIONED|${core.sha256(record)}`);
    }
  }
  return catalog;
}

function validateSubjectIdentityRefs(canonicalParent, refs) {
  if (!Array.isArray(refs) || refs.length === 0) fail('SUBJECT_IDENTITY_REFS_REQUIRED');
  const catalog = parentSubjectCatalog(canonicalParent);
  const seen = new Set();
  for (const ref of refs) {
    required(ref, ['object_id', 'object_version', 'object_digest'], 'subject_identity_ref');
    if (!nonEmpty(String(ref.object_id)) || !nonEmpty(String(ref.object_version)) || !isSha(ref.object_digest)) fail('INVALID_SUBJECT_IDENTITY_REF');
    const key = `${String(ref.object_id)}|${String(ref.object_version)}|${ref.object_digest}`;
    if (seen.has(key)) fail('DUPLICATE_SUBJECT_IDENTITY_REF', key);
    seen.add(key);
    if (!catalog.has(key)) fail('SUBJECT_IDENTITY_NOT_CURRENT', `${ref.object_id}:${ref.object_version}`);
  }
  return clone(refs).sort((a, b) => core.sha256(a).localeCompare(core.sha256(b)));
}

function validateAuthorDecisionSpecialistState(stateInput, canonicalParentInput) {
  const state = clone(stateInput);
  const canonicalParent = clone(canonicalParentInput);
  required(state, ['schema_version', 'book_project_id', 'canonical_parent_state_version', 'canonical_parent_state_digest', 'queue_ledger'], 'author_decision_state');
  if (state.schema_version !== SPECIALIST_SCHEMA_VERSION) fail('INVALID_SPECIALIST_SCHEMA_VERSION');
  core.validateParent(canonicalParent);
  if (state.book_project_id !== canonicalParent.book_project.book_project_id) fail('SPECIALIST_BOOK_PROJECT_MISMATCH');
  if (state.canonical_parent_state_version !== canonicalParent.state_version) fail('SPECIALIST_PARENT_VERSION_BINDING_MISMATCH');
  if (state.canonical_parent_state_digest !== canonicalParent.state_digest) fail('SPECIALIST_PARENT_DIGEST_BINDING_MISMATCH');
  queue.validateQueueLedger(state.queue_ledger);
  if (state.queue_ledger.bound_parent_state_version !== canonicalParent.state_version || state.queue_ledger.bound_parent_state_digest !== canonicalParent.state_digest) {
    fail('QUEUE_PARENT_BINDING_MISMATCH');
  }
  return true;
}

function authorDecisionIdentity(stateInput, canonicalParentInput) {
  validateAuthorDecisionSpecialistState(stateInput, canonicalParentInput);
  return core.sha256(stateInput);
}

function currentSnapshot(state, decisionRequestId) {
  const ledger = state.queue_ledger;
  const snap = ledger.decision_request_snapshots[decisionRequestId];
  if (!snap) fail('DECISION_REQUEST_NOT_FOUND', String(decisionRequestId));
  if (ledger.current_request_index[snap.decision_family_id] !== decisionRequestId) fail('DECISION_REQUEST_NOT_CURRENT', decisionRequestId);
  return snap;
}

function validateChoice(snapshot, request) {
  const predefined = nonEmpty(request.selected_option_id) ? (snapshot.options || []).find(o => o.option_id === request.selected_option_id) : null;
  const custom = nonEmpty(request.custom_author_choice) ? request.custom_author_choice : null;
  if ((predefined ? 1 : 0) + (custom ? 1 : 0) !== 1) fail('EXACTLY_ONE_AUTHOR_CHOICE_REQUIRED');
  if (custom && snapshot.custom_option_allowed !== true) fail('CUSTOM_AUTHOR_CHOICE_FORBIDDEN');
  const canonicalStatus = predefined ? predefined.canonical_decision_status : 'APPROVED';
  if (!CANONICAL_STATUSES.has(canonicalStatus)) fail('INVALID_CANONICAL_DECISION_STATUS', String(canonicalStatus));
  const selectedIdentity = predefined ? `OPTION:${predefined.option_id}` : `CUSTOM_DIGEST:${core.sha256(custom)}`;
  return {
    canonicalStatus,
    selectedIdentity,
    canonicalChoice: predefined ? predefined.option_id : selectedIdentity,
  };
}

function validateConfirmation(snapshot, request, selectedIdentity) {
  const policy = snapshot.confirmation_policy || 'NONE';
  if (policy === 'NONE') return null;
  const evidence = request.confirmation_evidence;
  if (!obj(evidence) || evidence.confirmed !== true) fail('AUTHOR_CONFIRMATION_REQUIRED');
  if (evidence.decision_request_digest !== queue.digestDecisionRequest(snapshot)) fail('AUTHOR_CONFIRMATION_REQUEST_MISMATCH');
  if (evidence.selected_option_identity !== selectedIdentity) fail('AUTHOR_CONFIRMATION_CHOICE_MISMATCH');
  if (policy === 'REVIEW_SELECTED_CHOICE_AND_CONSEQUENCE' && evidence.consequence_reviewed !== true) fail('AUTHOR_CONSEQUENCE_CONFIRMATION_REQUIRED');
  if (!nonEmpty(evidence.confirmation_evidence_ref)) fail('AUTHOR_CONFIRMATION_EVIDENCE_REF_REQUIRED');
  return evidence.confirmation_evidence_ref;
}

function validateResolutionRequest(canonicalParent, state, request) {
  required(request, [
    'resolution_request_id', 'idempotency_key', 'author_actor_ref', 'author_authority_proof_ref',
    'expected_parent_state_version', 'expected_parent_state_digest', 'expected_author_decision_identity',
    'decision_request_id', 'expected_decision_request_version', 'expected_decision_request_digest',
    'selected_option_id', 'custom_author_choice', 'confirmation_evidence', 'created_at'
  ], 'resolution_request');
  if (!nonEmpty(request.resolution_request_id) || !nonEmpty(request.idempotency_key)) fail('REQUEST_IDEMPOTENCY_REQUIRED');
  if (!nonEmpty(request.author_actor_ref) || !nonEmpty(request.author_authority_proof_ref)) fail('AUTHOR_AUTHORITY_PROOF_REQUIRED');
  if (request.expected_parent_state_version !== canonicalParent.state_version || request.expected_parent_state_digest !== canonicalParent.state_digest) fail('STALE_PARENT_WRITE');
  const currentIdentity = authorDecisionIdentity(state, canonicalParent);
  if (request.expected_author_decision_identity !== currentIdentity) fail('AUTHOR_DECISION_IDENTITY_MISMATCH');
  if (!nonEmpty(request.created_at) || Number.isNaN(Date.parse(request.created_at))) fail('INVALID_EFFECT_TIME');
  return currentIdentity;
}

function prepareAuthorDecisionResolution({ canonicalParent: canonicalParentInput, authorDecisionState: stateInput, request: requestInput }) {
  const canonicalParent = clone(canonicalParentInput);
  const state = clone(stateInput);
  const request = clone(requestInput);
  core.validateParent(canonicalParent);
  const preIdentity = validateResolutionRequest(canonicalParent, state, request);
  const snapshot = currentSnapshot(state, request.decision_request_id);
  if (!RESOLVABLE.has(snapshot.queue_state)) fail('DECISION_REQUEST_NOT_RESOLVABLE', snapshot.queue_state);
  if (snapshot.authority_class !== 'AUTHOR_ONLY') fail('QUEUE_AUTHORITY_CLASS_INVALID', String(snapshot.authority_class));
  if (snapshot.bound_parent_state_version !== canonicalParent.state_version || snapshot.bound_parent_state_digest !== canonicalParent.state_digest) fail('DECISION_REQUEST_STALE_PARENT');
  if (request.expected_decision_request_version !== snapshot.decision_request_version || request.expected_decision_request_digest !== queue.digestDecisionRequest(snapshot)) fail('STALE_DECISION_REQUEST');
  const subjectRefs = validateSubjectIdentityRefs(canonicalParent, snapshot.subject_identity_refs);
  const choice = validateChoice(snapshot, request);
  const confirmationRef = validateConfirmation(snapshot, request, choice.selectedIdentity);
  const requestFingerprint = core.sha256(request);
  const receiptId = makeId('BADC', {
    resolution_request_id: request.resolution_request_id,
    idempotency_key: request.idempotency_key,
    request_fingerprint: requestFingerprint,
    pre_identity: preIdentity,
  });
  const decisionId = makeId('AUTHORDECISION', {
    decision_family_id: snapshot.decision_family_id,
    decision_request_id: snapshot.decision_request_id,
    selected_identity: choice.selectedIdentity,
    author_actor_ref: request.author_actor_ref,
    authority_proof_ref: request.author_authority_proof_ref,
  }, 28);

  const authorDecision = {
    decision_id: decisionId,
    subject_ref: snapshot.subject_ref,
    decision_type: snapshot.decision_type,
    status: choice.canonicalStatus,
    author_choice_identity: choice.canonicalChoice,
    decision_request_id: snapshot.decision_request_id,
    subject_identity_refs: subjectRefs,
    author_actor_ref: request.author_actor_ref,
    author_authority_proof_ref: request.author_authority_proof_ref,
    confirmation_evidence_ref: confirmationRef,
    rationale_ref: nonEmpty(request.rationale_ref) ? request.rationale_ref : null,
    effective_version: canonicalParent.state_version + 1,
  };

  const effectPayload = { record: authorDecision };
  const evidenceRefs = uniq([
    ...(snapshot.evidence_refs || []),
    request.author_actor_ref,
    request.author_authority_proof_ref,
    ...(confirmationRef ? [confirmationRef] : []),
  ]);
  const parentEffect = {
    effect_schema_version: core.EFFECT_SCHEMA_VERSION,
    effect_request_id: `BAD-PARENT-${core.sha256({ resolution_request_id: request.resolution_request_id, idempotency_key: request.idempotency_key }).slice(0, 32).toUpperCase()}`,
    idempotency_key: `BAD:${request.idempotency_key}`,
    actor_class: 'AUTHOR',
    authority_ref: request.author_authority_proof_ref,
    expected_parent_state_version: canonicalParent.state_version,
    expected_parent_state_digest: canonicalParent.state_digest,
    effect_type: 'REGISTER_FINAL_AUTHOR_DECISION',
    effect_payload: effectPayload,
    effect_payload_digest: core.effectPayloadDigest(effectPayload),
    subject_identity_refs: uniq([snapshot.subject_ref, ...subjectRefs.map(r => `${r.object_id}:${r.object_version}:${r.object_digest}`)]),
    evidence_refs: evidenceRefs,
    specialist_receipt_refs: [receiptId],
    created_at: request.created_at,
    expected_specialist_ledger_identity: preIdentity,
  };
  const anticipated = core.applyEffect(canonicalParent, parentEffect).parent_state;

  const nextState = clone(state);
  const ledger = nextState.queue_ledger;
  const nextSnapshot = clone(snapshot);
  nextSnapshot.decision_request_version = snapshot.decision_request_version + 1;
  nextSnapshot.predecessor_decision_request_id = snapshot.decision_request_id;
  nextSnapshot.decision_request_id = makeId('ADREQ', { receiptId, prior: snapshot.decision_request_id, version: nextSnapshot.decision_request_version }, 28);
  nextSnapshot.queue_state = 'RESOLVED';
  nextSnapshot.presentation_state = snapshot.confirmation_policy === 'NONE' ? snapshot.presentation_state : 'CONFIRMED';
  nextSnapshot.bound_parent_state_version = anticipated.state_version;
  nextSnapshot.bound_parent_state_digest = anticipated.state_digest;
  nextSnapshot.created_by = 'AUTHOR_VIA_BOOK_PARENT_V2';
  nextSnapshot.created_at = request.created_at;
  ledger.decision_request_snapshots[nextSnapshot.decision_request_id] = nextSnapshot;
  ledger.current_request_index[nextSnapshot.decision_family_id] = nextSnapshot.decision_request_id;
  ledger.bound_parent_state_version = anticipated.state_version;
  ledger.bound_parent_state_digest = anticipated.state_digest;
  ledger.queue_ledger_version += 1;
  ledger.processed_requests[request.idempotency_key] = {
    action: 'RESOLVE_V2', request_id: request.resolution_request_id, request_fingerprint: requestFingerprint,
    resolution_receipt_id: receiptId, decision_request_id: nextSnapshot.decision_request_id,
  };
  ledger.resolution_receipts[receiptId] = {
    receipt_id: receiptId,
    resolution_request_id: request.resolution_request_id,
    decision_request_id: snapshot.decision_request_id,
    decision_id: decisionId,
    author_actor_ref: request.author_actor_ref,
    author_authority_proof_ref: request.author_authority_proof_ref,
    selected_option_identity: choice.selectedIdentity,
    confirmation_evidence_ref: confirmationRef,
    pre_parent_state_version: canonicalParent.state_version,
    pre_parent_state_digest: canonicalParent.state_digest,
    post_parent_state_version: anticipated.state_version,
    post_parent_state_digest: anticipated.state_digest,
  };
  ledger.outbox_entries.push({
    event_id: makeId('ADQEVT', { receiptId, sequence: ledger.outbox_entries.length + 1 }, 24),
    event_type: 'AUTHOR_DECISION_PREPARED_FOR_PARENT_V2',
    aggregate_id: 'BOOK_SYSTEM_AUTHOR_DECISION_QUEUE',
    payload_ref: receiptId,
    parent_state_version: anticipated.state_version,
    sequence: ledger.outbox_entries.length + 1,
    delivery_state: 'PENDING',
  });
  nextState.canonical_parent_state_version = anticipated.state_version;
  nextState.canonical_parent_state_digest = anticipated.state_digest;
  queue.validateQueueLedger(ledger);
  validateAuthorDecisionSpecialistState(nextState, anticipated);
  const postIdentity = core.sha256(nextState);

  const specialistReceipt = {
    receipt_schema_version: SPECIALIST_RECEIPT_SCHEMA_VERSION,
    receipt_id: receiptId,
    specialist_kind: SPECIALIST_KIND,
    book_project_id: canonicalParent.book_project.book_project_id,
    resolution_request_id: request.resolution_request_id,
    idempotency_key: request.idempotency_key,
    request_fingerprint: requestFingerprint,
    decision_request_id: snapshot.decision_request_id,
    decision_id: decisionId,
    author_actor_ref: request.author_actor_ref,
    author_authority_proof_ref: request.author_authority_proof_ref,
    selected_option_identity: choice.selectedIdentity,
    confirmation_evidence_ref: confirmationRef,
    pre_author_decision_identity: preIdentity,
    post_author_decision_identity: postIdentity,
    pre_parent_state_version: canonicalParent.state_version,
    pre_parent_state_digest: canonicalParent.state_digest,
    post_parent_state_version: anticipated.state_version,
    post_parent_state_digest: anticipated.state_digest,
    disposition: 'PREPARED_FOR_PARENT',
    created_at: request.created_at,
  };
  specialistReceipt.receipt_digest = core.sha256(specialistReceipt);
  const delta = {
    specialist_kind: SPECIALIST_KIND,
    book_project_id: canonicalParent.book_project.book_project_id,
    expected_author_decision_identity: preIdentity,
    post_author_decision_identity: postIdentity,
    post_state: nextState,
    specialist_receipt: specialistReceipt,
  };
  delta.delta_digest = core.sha256({
    specialist_kind: delta.specialist_kind,
    book_project_id: delta.book_project_id,
    expected_author_decision_identity: delta.expected_author_decision_identity,
    post_author_decision_identity: delta.post_author_decision_identity,
    specialist_receipt: delta.specialist_receipt,
  });
  return {
    disposition: 'PREPARED_FOR_PARENT',
    parent_effect: parentEffect,
    anticipated_parent_state: anticipated,
    specialist_delta: delta,
  };
}

function validatePreparedAuthorDecisionDelta(deltaInput, canonicalPreInput, canonicalPostInput) {
  const delta = clone(deltaInput);
  const canonicalPre = clone(canonicalPreInput);
  const canonicalPost = clone(canonicalPostInput);
  required(delta, ['specialist_kind', 'book_project_id', 'expected_author_decision_identity', 'post_author_decision_identity', 'post_state', 'specialist_receipt', 'delta_digest'], 'author_decision_delta');
  if (delta.specialist_kind !== SPECIALIST_KIND) fail('SPECIALIST_KIND_MISMATCH');
  if (!isSha(delta.expected_author_decision_identity) || !isSha(delta.post_author_decision_identity) || !isSha(delta.delta_digest)) fail('INVALID_AUTHOR_DECISION_IDENTITY');
  validateAuthorDecisionSpecialistState(delta.post_state, canonicalPost);
  if (core.sha256(delta.post_state) !== delta.post_author_decision_identity) fail('AUTHOR_DECISION_POST_IDENTITY_MISMATCH');
  const receipt = delta.specialist_receipt;
  if (!obj(receipt) || receipt.receipt_schema_version !== SPECIALIST_RECEIPT_SCHEMA_VERSION) fail('INVALID_SPECIALIST_RECEIPT');
  if (receipt.pre_author_decision_identity !== delta.expected_author_decision_identity || receipt.post_author_decision_identity !== delta.post_author_decision_identity) fail('SPECIALIST_RECEIPT_IDENTITY_MISMATCH');
  if (receipt.pre_parent_state_version !== canonicalPre.state_version || receipt.pre_parent_state_digest !== canonicalPre.state_digest) fail('SPECIALIST_RECEIPT_PRE_PARENT_MISMATCH');
  if (receipt.post_parent_state_version !== canonicalPost.state_version || receipt.post_parent_state_digest !== canonicalPost.state_digest) fail('SPECIALIST_RECEIPT_POST_PARENT_MISMATCH');
  const receiptCopy = clone(receipt); const claimedReceiptDigest = receiptCopy.receipt_digest; delete receiptCopy.receipt_digest;
  if (core.sha256(receiptCopy) !== claimedReceiptDigest) fail('SPECIALIST_RECEIPT_DIGEST_MISMATCH');
  const expectedDeltaDigest = core.sha256({
    specialist_kind: delta.specialist_kind,
    book_project_id: delta.book_project_id,
    expected_author_decision_identity: delta.expected_author_decision_identity,
    post_author_decision_identity: delta.post_author_decision_identity,
    specialist_receipt: delta.specialist_receipt,
  });
  if (expectedDeltaDigest !== delta.delta_digest) fail('SPECIALIST_DELTA_DIGEST_MISMATCH');
  return true;
}

module.exports = {
  SPECIALIST_SCHEMA_VERSION,
  SPECIALIST_RECEIPT_SCHEMA_VERSION,
  BookAuthorDecisionV2RebindError,
  emptyQueueLedger,
  createAuthorDecisionSpecialistState,
  validateAuthorDecisionSpecialistState,
  validateSubjectIdentityRefs,
  authorDecisionIdentity,
  prepareAuthorDecisionResolution,
  validatePreparedAuthorDecisionDelta,
};