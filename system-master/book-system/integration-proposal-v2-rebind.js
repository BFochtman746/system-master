'use strict';

const core = require('./canonical-parent-v2-f6-core.js');
const recovered = require('./integration-proposal-runtime-v2-core.js');

const SPECIALIST_SCHEMA_VERSION = 'BOOK_INTEGRATION_PROPOSAL_SPECIALIST_V2';
const SPECIALIST_RECEIPT_SCHEMA_VERSION = 'BOOK_INTEGRATION_PROPOSAL_SPECIALIST_RECEIPT_V1';
const SPECIALIST_KIND = 'INTEGRATION_PROPOSAL';

class BookIntegrationProposalV2RebindError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookIntegrationProposalV2RebindError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookIntegrationProposalV2RebindError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function isSha(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }
function required(v, keys, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const key of keys) if (!own(v, key)) fail('REQUIRED_FIELD_MISSING', `${label}.${key}`);
}
function uniq(values) { return [...new Set((values || []).filter(nonEmpty).map(String))].sort(); }
function makeId(prefix, seed, n = 32) { return `${prefix}-${core.sha256(seed).slice(0, n).toUpperCase()}`; }

function latestSnapshot(ledger, proposalId) {
  const snapshot = (ledger.proposal_snapshots || []).find(x => x && x.proposal_id === proposalId);
  if (!snapshot) fail('PROPOSAL_SNAPSHOT_NOT_FOUND', String(proposalId));
  const family = ledger.proposal_families && ledger.proposal_families[snapshot.proposal_family_id];
  if (!family) fail('PROPOSAL_FAMILY_NOT_FOUND', String(snapshot.proposal_family_id));
  if (family.latest_snapshot_id !== snapshot.proposal_id || family.latest_version !== snapshot.proposal_version) {
    fail('PROPOSAL_SNAPSHOT_NOT_CURRENT', snapshot.proposal_id);
  }
  return snapshot;
}

function normalizeRecoveredSourceLane(sourceLane) {
  if (sourceLane === 'SYSTEM_MASTER/BOOK/PROSE' || sourceLane === 'PROSE_SYSTEM') return 'SYSTEM_MASTER/BOOK';
  return 'SYSTEM_MASTER/BOOK';
}

function validateCurrentness(ledger, snapshot) {
  const c = recovered.snapshotCurrentness(ledger, snapshot);
  if (!c.source_current) fail('STALE_SOURCE_IDENTITY');
  if (!c.artifact_current) fail('STALE_ARTIFACT_IDENTITY');
  if (!c.provenance_current) fail('STALE_PROVENANCE_IDENTITY');
  return c;
}

function rebindRecoveredLedgerToCanonicalParent(canonicalParentInput, recoveredLedgerInput) {
  const canonicalParent = clone(canonicalParentInput);
  const ledger = clone(recoveredLedgerInput);
  core.validateParent(canonicalParent);
  recovered.validateLedger(ledger);

  ledger.bound_parent_state_version = canonicalParent.state_version;
  ledger.bound_parent_state_digest = canonicalParent.state_digest;
  ledger.ledger_version += 1;

  for (const family of Object.values(ledger.proposal_families || {})) {
    if (!family || !nonEmpty(family.latest_snapshot_id)) continue;
    const snapshot = (ledger.proposal_snapshots || []).find(x => x && x.proposal_id === family.latest_snapshot_id);
    if (!snapshot) fail('PROPOSAL_SNAPSHOT_NOT_FOUND', family.latest_snapshot_id);
    const c = recovered.snapshotCurrentness(ledger, snapshot);
    if (c.all_current) {
      snapshot.last_revalidated_parent_state_version = canonicalParent.state_version;
      snapshot.last_revalidated_parent_state_digest = canonicalParent.state_digest;
    }
  }
  recovered.validateLedger(ledger, canonicalParent);
  return ledger;
}

function createIntegrationProposalSpecialistState(canonicalParentInput, options = {}) {
  const canonicalParent = clone(canonicalParentInput);
  core.validateParent(canonicalParent);
  if (!options.proposal_ledger) fail('PROPOSAL_LEDGER_REQUIRED');
  const ledger = options.rebind === false ? clone(options.proposal_ledger) : rebindRecoveredLedgerToCanonicalParent(canonicalParent, options.proposal_ledger);
  recovered.validateLedger(ledger, canonicalParent);
  const state = {
    schema_version: SPECIALIST_SCHEMA_VERSION,
    book_project_id: canonicalParent.book_project.book_project_id,
    canonical_parent_state_version: canonicalParent.state_version,
    canonical_parent_state_digest: canonicalParent.state_digest,
    proposal_ledger: ledger,
    canonical_registrations: clone(options.canonical_registrations || {}),
  };
  validateIntegrationProposalSpecialistState(state, canonicalParent);
  return state;
}

function validateIntegrationProposalSpecialistState(stateInput, canonicalParentInput) {
  const state = clone(stateInput);
  const canonicalParent = clone(canonicalParentInput);
  required(state, ['schema_version','book_project_id','canonical_parent_state_version','canonical_parent_state_digest','proposal_ledger','canonical_registrations'], 'integration_proposal_state');
  if (state.schema_version !== SPECIALIST_SCHEMA_VERSION) fail('INVALID_SPECIALIST_SCHEMA_VERSION');
  core.validateParent(canonicalParent);
  if (state.book_project_id !== canonicalParent.book_project.book_project_id) fail('SPECIALIST_BOOK_PROJECT_MISMATCH');
  if (state.canonical_parent_state_version !== canonicalParent.state_version) fail('SPECIALIST_PARENT_VERSION_BINDING_MISMATCH');
  if (state.canonical_parent_state_digest !== canonicalParent.state_digest) fail('SPECIALIST_PARENT_DIGEST_BINDING_MISMATCH');
  if (!obj(state.canonical_registrations)) fail('CANONICAL_REGISTRATIONS_OBJECT_REQUIRED');
  recovered.validateLedger(state.proposal_ledger, canonicalParent);
  for (const [proposalId, registration] of Object.entries(state.canonical_registrations)) {
    if (!obj(registration) || registration.proposal_id !== proposalId || !nonEmpty(registration.specialist_receipt_id)) fail('INVALID_CANONICAL_REGISTRATION', proposalId);
  }
  return true;
}

function integrationProposalIdentity(stateInput, canonicalParentInput) {
  validateIntegrationProposalSpecialistState(stateInput, canonicalParentInput);
  return core.sha256(stateInput);
}

function validateAuthorDecisionFence(canonicalParent, snapshot) {
  const refs = Array.isArray(snapshot.author_decision_refs) ? snapshot.author_decision_refs : [];
  if (snapshot.author_decision_required !== true) return [];
  if (refs.length === 0) fail('AUTHOR_DECISION_REQUIRED');
  const accepted = [];
  for (const ref of refs) {
    const id = typeof ref === 'string' ? ref : ref && (ref.decision_id || ref.author_decision_id);
    if (!nonEmpty(id)) continue;
    const decision = (canonicalParent.author_decisions || []).find(d => d && d.decision_id === id);
    if (decision && decision.status === 'APPROVED') accepted.push(id);
  }
  if (accepted.length === 0) fail('CURRENT_APPROVED_AUTHOR_DECISION_REQUIRED');
  return uniq(accepted);
}

function canonicalProposalRecord(canonicalParent, snapshot, approvedAuthorDecisionRefs) {
  if (snapshot.admission_state !== 'ADMITTED') fail('PROPOSAL_NOT_ADMITTED', String(snapshot.admission_state));
  if (snapshot.publication_authorized === true) fail('PROPOSAL_PUBLICATION_AUTHORITY_FORBIDDEN');
  if (!nonEmpty(snapshot.rights_boundary) || !nonEmpty(snapshot.privacy_boundary)) fail('RIGHTS_PRIVACY_BOUNDARY_REQUIRED');
  if (!nonEmpty(snapshot.proposal_id) || !nonEmpty(snapshot.proposal_family_id) || !Number.isInteger(snapshot.proposal_version)) fail('INVALID_PROPOSAL_IDENTITY');
  if (!/^[a-f0-9]{40,64}$/.test(String(snapshot.source_subject_sha || ''))) fail('INVALID_PROVIDER_SUBJECT_SHA');
  const snapshotDigest = core.sha256(snapshot);
  return {
    proposal_id: snapshot.proposal_id,
    book_project_id: canonicalParent.book_project.book_project_id,
    proposal_family_id: snapshot.proposal_family_id,
    proposal_version: snapshot.proposal_version,
    admission_state: 'ADMITTED',
    source_project_or_lane: normalizeRecoveredSourceLane(snapshot.source_project_or_lane),
    provenance_source_project_or_lane: nonEmpty(snapshot.source_project_or_lane) ? snapshot.source_project_or_lane : 'UNKNOWN_PROVIDER',
    source_subject_sha: snapshot.source_subject_sha,
    capability_id: nonEmpty(snapshot.capability_id) ? snapshot.capability_id : 'UNKNOWN_CAPABILITY',
    source_request_id: snapshot.source_request_id || null,
    source_response_id: snapshot.source_response_id || null,
    source_object_refs_and_digests: clone(snapshot.source_object_refs_and_digests || []),
    evidence_refs: clone(snapshot.evidence_refs || []),
    artifact_refs_and_digests: clone(snapshot.artifact_refs_and_digests || []),
    provenance_projection_refs_and_currentness: clone(snapshot.provenance_projection_refs_and_currentness || []),
    rights_boundary: snapshot.rights_boundary,
    privacy_boundary: snapshot.privacy_boundary,
    author_decision_refs: clone(approvedAuthorDecisionRefs),
    publication_authorized: false,
    specialist_snapshot_digest: snapshotDigest,
  };
}

function validateRegistrationRequest(canonicalParent, state, request) {
  required(request, [
    'registration_request_id','idempotency_key','authority_ref',
    'expected_parent_state_version','expected_parent_state_digest','expected_integration_proposal_identity',
    'proposal_id','created_at'
  ], 'registration_request');
  if (!nonEmpty(request.registration_request_id) || !nonEmpty(request.idempotency_key)) fail('REQUEST_IDEMPOTENCY_REQUIRED');
  if (!nonEmpty(request.authority_ref)) fail('BOOK_INTEGRATION_AUTHORITY_REF_REQUIRED');
  if (request.expected_parent_state_version !== canonicalParent.state_version || request.expected_parent_state_digest !== canonicalParent.state_digest) fail('STALE_PARENT_WRITE');
  const identity = integrationProposalIdentity(state, canonicalParent);
  if (request.expected_integration_proposal_identity !== identity) fail('INTEGRATION_PROPOSAL_IDENTITY_MISMATCH');
  if (!nonEmpty(request.proposal_id)) fail('PROPOSAL_ID_REQUIRED');
  if (!nonEmpty(request.created_at) || Number.isNaN(Date.parse(request.created_at))) fail('INVALID_EFFECT_TIME');
  return identity;
}

function prepareAdmittedIntegrationProposalRegistration({ canonicalParent: canonicalParentInput, integrationProposalState: stateInput, request: requestInput }) {
  const canonicalParent = clone(canonicalParentInput);
  const state = clone(stateInput);
  const request = clone(requestInput);
  core.validateParent(canonicalParent);
  const preIdentity = validateRegistrationRequest(canonicalParent, state, request);
  const ledger = state.proposal_ledger;
  const snapshot = latestSnapshot(ledger, request.proposal_id);
  if (snapshot.admission_state !== 'ADMITTED') fail('PROPOSAL_NOT_ADMITTED', String(snapshot.admission_state));
  if (snapshot.last_revalidated_parent_state_version !== canonicalParent.state_version || snapshot.last_revalidated_parent_state_digest !== canonicalParent.state_digest) {
    fail('PROPOSAL_PARENT_REVALIDATION_REQUIRED');
  }
  validateCurrentness(ledger, snapshot);
  const authorDecisionRefs = validateAuthorDecisionFence(canonicalParent, snapshot);
  if (own(state.canonical_registrations, snapshot.proposal_id)) fail('PROPOSAL_ALREADY_CANONICALLY_REGISTERED', snapshot.proposal_id);
  if ((canonicalParent.integration_proposals || []).some(p => p && p.proposal_id === snapshot.proposal_id)) fail('PROPOSAL_ALREADY_IN_PARENT', snapshot.proposal_id);
  const record = canonicalProposalRecord(canonicalParent, snapshot, authorDecisionRefs);
  const requestFingerprint = core.sha256(request);
  const receiptId = makeId('BIPR', {
    registration_request_id: request.registration_request_id,
    idempotency_key: request.idempotency_key,
    request_fingerprint: requestFingerprint,
    pre_identity: preIdentity,
    proposal_id: snapshot.proposal_id,
  });
  const effectPayload = { record };
  const evidenceRefs = uniq([
    ...(record.evidence_refs || []),
    ...(record.author_decision_refs || []),
    request.authority_ref,
  ]);
  const parentEffect = {
    effect_schema_version: core.EFFECT_SCHEMA_VERSION,
    effect_request_id: `BIP-PARENT-${core.sha256({ registration_request_id: request.registration_request_id, idempotency_key: request.idempotency_key }).slice(0, 32).toUpperCase()}`,
    idempotency_key: `BIP:${request.idempotency_key}`,
    actor_class: 'SYSTEM',
    authority_ref: request.authority_ref,
    expected_parent_state_version: canonicalParent.state_version,
    expected_parent_state_digest: canonicalParent.state_digest,
    effect_type: 'REGISTER_ADMITTED_INTEGRATION_PROPOSAL',
    effect_payload: effectPayload,
    effect_payload_digest: core.effectPayloadDigest(effectPayload),
    subject_identity_refs: uniq([
      snapshot.proposal_id,
      ...(snapshot.source_object_refs_and_digests || []).map(r => `${r.object_id}:${r.object_version}:${r.object_digest}`),
    ]),
    evidence_refs: evidenceRefs,
    specialist_receipt_refs: [receiptId],
    created_at: request.created_at,
    expected_specialist_ledger_identity: preIdentity,
  };
  const anticipated = core.applyEffect(canonicalParent, parentEffect).parent_state;

  const nextState = clone(state);
  nextState.canonical_parent_state_version = anticipated.state_version;
  nextState.canonical_parent_state_digest = anticipated.state_digest;
  nextState.proposal_ledger.bound_parent_state_version = anticipated.state_version;
  nextState.proposal_ledger.bound_parent_state_digest = anticipated.state_digest;
  const nextSnapshot = latestSnapshot(nextState.proposal_ledger, request.proposal_id);
  nextSnapshot.last_revalidated_parent_state_version = anticipated.state_version;
  nextSnapshot.last_revalidated_parent_state_digest = anticipated.state_digest;
  nextState.proposal_ledger.ledger_version += 1;
  nextState.canonical_registrations[snapshot.proposal_id] = {
    proposal_id: snapshot.proposal_id,
    proposal_family_id: snapshot.proposal_family_id,
    specialist_receipt_id: receiptId,
    canonical_parent_state_version: anticipated.state_version,
    canonical_parent_state_digest: anticipated.state_digest,
    canonical_record_digest: core.sha256(record),
  };
  recovered.validateLedger(nextState.proposal_ledger, anticipated);
  validateIntegrationProposalSpecialistState(nextState, anticipated);
  const postIdentity = core.sha256(nextState);

  const specialistReceipt = {
    receipt_schema_version: SPECIALIST_RECEIPT_SCHEMA_VERSION,
    receipt_id: receiptId,
    specialist_kind: SPECIALIST_KIND,
    book_project_id: canonicalParent.book_project.book_project_id,
    registration_request_id: request.registration_request_id,
    idempotency_key: request.idempotency_key,
    request_fingerprint: requestFingerprint,
    proposal_id: snapshot.proposal_id,
    proposal_family_id: snapshot.proposal_family_id,
    proposal_version: snapshot.proposal_version,
    proposal_snapshot_digest: core.sha256(snapshot),
    canonical_record_digest: core.sha256(record),
    pre_integration_proposal_identity: preIdentity,
    post_integration_proposal_identity: postIdentity,
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
    expected_integration_proposal_identity: preIdentity,
    post_integration_proposal_identity: postIdentity,
    post_state: nextState,
    specialist_receipt: specialistReceipt,
  };
  delta.delta_digest = core.sha256({
    specialist_kind: delta.specialist_kind,
    book_project_id: delta.book_project_id,
    expected_integration_proposal_identity: delta.expected_integration_proposal_identity,
    post_integration_proposal_identity: delta.post_integration_proposal_identity,
    specialist_receipt: delta.specialist_receipt,
  });
  return {
    disposition: 'PREPARED_FOR_PARENT',
    parent_effect: parentEffect,
    anticipated_parent_state: anticipated,
    specialist_delta: delta,
  };
}

function validatePreparedIntegrationProposalDelta(deltaInput, canonicalPreInput, canonicalPostInput) {
  const delta = clone(deltaInput);
  const canonicalPre = clone(canonicalPreInput);
  const canonicalPost = clone(canonicalPostInput);
  required(delta, ['specialist_kind','book_project_id','expected_integration_proposal_identity','post_integration_proposal_identity','post_state','specialist_receipt','delta_digest'], 'integration_proposal_delta');
  if (delta.specialist_kind !== SPECIALIST_KIND) fail('SPECIALIST_KIND_MISMATCH');
  if (!isSha(delta.expected_integration_proposal_identity) || !isSha(delta.post_integration_proposal_identity) || !isSha(delta.delta_digest)) fail('INVALID_INTEGRATION_PROPOSAL_IDENTITY');
  validateIntegrationProposalSpecialistState(delta.post_state, canonicalPost);
  if (core.sha256(delta.post_state) !== delta.post_integration_proposal_identity) fail('INTEGRATION_PROPOSAL_POST_IDENTITY_MISMATCH');
  const receipt = delta.specialist_receipt;
  if (!obj(receipt) || receipt.receipt_schema_version !== SPECIALIST_RECEIPT_SCHEMA_VERSION) fail('INVALID_SPECIALIST_RECEIPT');
  if (receipt.pre_integration_proposal_identity !== delta.expected_integration_proposal_identity || receipt.post_integration_proposal_identity !== delta.post_integration_proposal_identity) fail('SPECIALIST_RECEIPT_IDENTITY_MISMATCH');
  if (receipt.pre_parent_state_version !== canonicalPre.state_version || receipt.pre_parent_state_digest !== canonicalPre.state_digest) fail('SPECIALIST_RECEIPT_PRE_PARENT_MISMATCH');
  if (receipt.post_parent_state_version !== canonicalPost.state_version || receipt.post_parent_state_digest !== canonicalPost.state_digest) fail('SPECIALIST_RECEIPT_POST_PARENT_MISMATCH');
  const receiptCopy = clone(receipt); const claimedReceiptDigest = receiptCopy.receipt_digest; delete receiptCopy.receipt_digest;
  if (core.sha256(receiptCopy) !== claimedReceiptDigest) fail('SPECIALIST_RECEIPT_DIGEST_MISMATCH');
  const expectedDeltaDigest = core.sha256({
    specialist_kind: delta.specialist_kind,
    book_project_id: delta.book_project_id,
    expected_integration_proposal_identity: delta.expected_integration_proposal_identity,
    post_integration_proposal_identity: delta.post_integration_proposal_identity,
    specialist_receipt: delta.specialist_receipt,
  });
  if (expectedDeltaDigest !== delta.delta_digest) fail('SPECIALIST_DELTA_DIGEST_MISMATCH');
  return true;
}

module.exports = {
  SPECIALIST_SCHEMA_VERSION,
  SPECIALIST_RECEIPT_SCHEMA_VERSION,
  BookIntegrationProposalV2RebindError,
  rebindRecoveredLedgerToCanonicalParent,
  createIntegrationProposalSpecialistState,
  validateIntegrationProposalSpecialistState,
  integrationProposalIdentity,
  prepareAdmittedIntegrationProposalRegistration,
  validatePreparedIntegrationProposalDelta,
};