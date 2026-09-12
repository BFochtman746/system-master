'use strict';

const vr = require('./version-and-rollback-core.js');
const ca = require('./content-object-admission-core.js');
const parent = require('./canonical-parent-v2-f5-core.js');

const SPECIALIST_SCHEMA_VERSION = 'BOOK_VERSION_ADMISSION_SPECIALIST_V2';
const SPECIALIST_RECEIPT_SCHEMA_VERSION = 'BOOK_VERSION_ADMISSION_SPECIALIST_RECEIPT_V1';
const SPECIALIST_KIND = 'VERSION_ADMISSION';

const OBJECT_TYPES = Object.freeze({
  GOVERNING_BRIEF: { collection: 'governing_briefs', id: 'brief_id', version: 'version', pointer: 'governing_brief_ref' },
  CANON_MANIFEST: { collection: 'canon_manifests', id: 'canon_manifest_id', version: 'version', pointer: 'canon_manifest_ref' },
  STORY_BIBLE: { collection: 'story_bibles', id: 'story_bible_id', version: 'version', pointer: 'story_bible_ref' },
  BOOK_PLAN: { collection: 'book_plans', id: 'plan_id', version: 'version', pointer: 'book_plan_ref' },
  MANUSCRIPT_MANIFEST: { collection: 'manuscripts', id: 'manuscript_id', version: 'version_id', pointer: 'canonical_manuscript_ref' },
});

class BookVersionAdmissionRebindError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookVersionAdmissionRebindError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookVersionAdmissionRebindError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function isSha(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }
function refFor(meta, record) { return `${String(record[meta.id])}:${String(record[meta.version])}`; }

function createSpecialistState(legacyParentState, versionLedger) {
  vr.validateParentState(legacyParentState);
  vr.validateLedger(versionLedger, legacyParentState);
  return {
    schema_version: SPECIALIST_SCHEMA_VERSION,
    book_project_id: legacyParentState.book_project.book_project_id,
    legacy_parent_state: clone(legacyParentState),
    version_ledger: clone(versionLedger),
  };
}

function validateSpecialistState(state) {
  if (!obj(state)) fail('SPECIALIST_STATE_REQUIRED');
  if (state.schema_version !== SPECIALIST_SCHEMA_VERSION) fail('INVALID_SPECIALIST_SCHEMA_VERSION');
  if (!nonEmpty(state.book_project_id)) fail('SPECIALIST_BOOK_PROJECT_ID_REQUIRED');
  vr.validateParentState(state.legacy_parent_state);
  vr.validateLedger(state.version_ledger, state.legacy_parent_state);
  if (state.legacy_parent_state.book_project.book_project_id !== state.book_project_id) fail('SPECIALIST_BOOK_PROJECT_MISMATCH');
  return true;
}

function specialistIdentity(state) {
  validateSpecialistState(state);
  return parent.sha256(state);
}

function canonicalSummary(objectType, record, canonicalBookProjectId) {
  const meta = OBJECT_TYPES[objectType];
  const summary = {
    object_type: objectType,
    object_id: String(record[meta.id]),
    version: String(record[meta.version]),
    book_project_id: canonicalBookProjectId,
    object_digest: isSha(record.content_digest_sha256) ? record.content_digest_sha256 : vr.digest(record),
  };
  if (own(record, 'authority_state')) summary.authority_state = record.authority_state;
  if (own(record, 'artifact_digest')) summary.artifact_digest = record.artifact_digest;
  return summary;
}

function extractCanonicalDelta(beforeLegacy, afterLegacy, canonicalBookProjectId) {
  const governedObjectVersions = [];
  const activePointerUpdates = [];
  for (const [objectType, meta] of Object.entries(OBJECT_TYPES)) {
    const beforeRefs = new Set(beforeLegacy[meta.collection].map(x => refFor(meta, x)));
    for (const record of afterLegacy[meta.collection]) {
      const ref = refFor(meta, record);
      if (!beforeRefs.has(ref)) governedObjectVersions.push(canonicalSummary(objectType, record, canonicalBookProjectId));
    }
    const beforeRef = beforeLegacy.active[meta.pointer] ?? null;
    const afterRef = afterLegacy.active[meta.pointer] ?? null;
    if (beforeRef !== afterRef) activePointerUpdates.push({ object_type: objectType, target_ref: afterRef });
  }
  governedObjectVersions.sort((a, b) => `${a.object_type}|${a.object_id}|${a.version}`.localeCompare(`${b.object_type}|${b.object_id}|${b.version}`));
  activePointerUpdates.sort((a, b) => a.object_type.localeCompare(b.object_type));
  return { governed_object_versions: governedObjectVersions, active_pointer_updates: activePointerUpdates };
}

function buildReceipt({ request, preIdentity, postIdentity, legacyResult, canonicalDelta, bookProjectId }) {
  const requestFingerprint = parent.sha256(request);
  const receipt = {
    receipt_schema_version: SPECIALIST_RECEIPT_SCHEMA_VERSION,
    receipt_id: `BVA-${parent.sha256({ book_project_id: bookProjectId, mutation_id: request.mutation_id, request_fingerprint: requestFingerprint, pre_identity: preIdentity, post_identity: postIdentity }).slice(0, 32).toUpperCase()}`,
    specialist_kind: SPECIALIST_KIND,
    book_project_id: bookProjectId,
    mutation_id: request.mutation_id,
    request_fingerprint: requestFingerprint,
    legacy_version_receipt_id: legacyResult.version_receipt.receipt_id,
    operation_count: request.operations.length,
    canonical_summary_count: canonicalDelta.governed_object_versions.length,
    canonical_pointer_update_count: canonicalDelta.active_pointer_updates.length,
    pre_ledger_identity: preIdentity,
    post_ledger_identity: postIdentity,
    disposition: 'PREPARED_FOR_PARENT',
  };
  receipt.receipt_digest = parent.sha256(receipt);
  return receipt;
}

function validatePrepareRequest(canonicalParent, specialistState, request) {
  parent.validateParent(canonicalParent);
  validateSpecialistState(specialistState);
  if (!obj(request)) fail('REQUEST_REQUIRED');
  for (const field of ['mutation_id','created_at','expected_parent_state_version','expected_parent_state_digest','operations']) {
    if (!own(request, field)) fail('REQUIRED_FIELD_MISSING', `request.${field}`);
  }
  if (!nonEmpty(request.mutation_id)) fail('MUTATION_ID_REQUIRED');
  if (!nonEmpty(request.created_at) || Number.isNaN(Date.parse(request.created_at))) fail('INVALID_EFFECT_TIME');
  if (!Array.isArray(request.operations) || request.operations.length === 0) fail('CONTENT_ADMISSION_OPERATIONS_REQUIRED');
  if (canonicalParent.book_project.book_project_id !== specialistState.book_project_id) fail('SPECIALIST_BOOK_PROJECT_MISMATCH');
  if (canonicalParent.state_version !== request.expected_parent_state_version) fail('PARENT_STATE_VERSION_CONFLICT');
  if (canonicalParent.state_digest !== request.expected_parent_state_digest) fail('PARENT_STATE_DIGEST_CONFLICT');
}

function prepareContentAdmission({ canonicalParent, specialistState, request }) {
  validatePrepareRequest(canonicalParent, specialistState, request);
  const preIdentity = specialistIdentity(specialistState);
  const legacyRequest = {
    mutation_id: request.mutation_id,
    actor_class: request.actor_class || 'PARENT_SYSTEM',
    expected_state_version: specialistState.legacy_parent_state.state_version,
    expected_state_digest: specialistState.legacy_parent_state.state_digest,
    operations: clone(request.operations),
    evidence_refs: Array.isArray(request.evidence_refs) ? clone(request.evidence_refs) : [],
    author_decision_refs: Array.isArray(request.author_decision_refs) ? clone(request.author_decision_refs) : [],
  };
  const legacyResult = ca.commitContentAdmission({
    parentState: specialistState.legacy_parent_state,
    versionLedger: specialistState.version_ledger,
    request: legacyRequest,
  });

  const postState = createSpecialistState(legacyResult.parent_state, legacyResult.version_ledger);
  const postIdentity = specialistIdentity(postState);
  const canonicalDelta = extractCanonicalDelta(specialistState.legacy_parent_state, legacyResult.parent_state, canonicalParent.book_project.book_project_id);
  const specialistReceipt = buildReceipt({ request, preIdentity, postIdentity, legacyResult, canonicalDelta, bookProjectId: specialistState.book_project_id });
  const deltaDigest = parent.sha256({
    specialist_kind: SPECIALIST_KIND,
    book_project_id: specialistState.book_project_id,
    expected_ledger_identity: preIdentity,
    post_ledger_identity: postIdentity,
    specialist_receipt: specialistReceipt,
  });
  const payload = {
    governed_object_versions: canonicalDelta.governed_object_versions,
    active_pointer_updates: canonicalDelta.active_pointer_updates,
    specialist_delta_digest: deltaDigest,
  };
  const subjectRefs = new Set([canonicalParent.book_project.book_project_id]);
  for (const x of canonicalDelta.governed_object_versions) subjectRefs.add(`${x.object_id}:${x.version}`);
  for (const x of canonicalDelta.active_pointer_updates) subjectRefs.add(x.target_ref);
  const requestFingerprint = parent.sha256(request);
  const effect = {
    effect_schema_version: parent.EFFECT_SCHEMA_VERSION,
    effect_request_id: `BVA-PARENT-${parent.sha256({ mutation_id: request.mutation_id, request_fingerprint: requestFingerprint }).slice(0, 32).toUpperCase()}`,
    idempotency_key: `BVA:${request.mutation_id}`,
    actor_class: 'SYSTEM',
    authority_ref: null,
    expected_parent_state_version: canonicalParent.state_version,
    expected_parent_state_digest: canonicalParent.state_digest,
    effect_type: parent.F5_EFFECT_TYPE,
    effect_payload: payload,
    effect_payload_digest: parent.effectPayloadDigest(payload),
    subject_identity_refs: [...subjectRefs].sort(),
    evidence_refs: Array.isArray(request.evidence_refs) ? [...new Set(request.evidence_refs)].sort() : [],
    specialist_receipt_refs: [specialistReceipt.receipt_id],
    created_at: request.created_at,
    expected_specialist_ledger_identity: preIdentity,
  };
  parent.validateAdmissionEffect(canonicalParent, effect);

  return {
    disposition: 'PREPARED_FOR_PARENT',
    parent_effect: effect,
    specialist_delta: {
      specialist_kind: SPECIALIST_KIND,
      book_project_id: specialistState.book_project_id,
      expected_ledger_identity: preIdentity,
      post_ledger_identity: postIdentity,
      post_state: postState,
      specialist_receipt: specialistReceipt,
      delta_digest: deltaDigest,
    },
    legacy_candidate_parent: clone(legacyResult.parent_state),
    legacy_candidate_version_ledger: clone(legacyResult.version_ledger),
  };
}

function validatePreparedDelta(delta) {
  if (!obj(delta)) fail('PREPARED_SPECIALIST_DELTA_REQUIRED');
  for (const field of ['specialist_kind','book_project_id','expected_ledger_identity','post_ledger_identity','post_state','specialist_receipt','delta_digest']) {
    if (!own(delta, field)) fail('REQUIRED_FIELD_MISSING', `specialist_delta.${field}`);
  }
  if (delta.specialist_kind !== SPECIALIST_KIND) fail('SPECIALIST_KIND_MISMATCH');
  if (!isSha(delta.expected_ledger_identity) || !isSha(delta.post_ledger_identity) || !isSha(delta.delta_digest)) fail('INVALID_SPECIALIST_LEDGER_IDENTITY');
  validateSpecialistState(delta.post_state);
  if (delta.post_state.book_project_id !== delta.book_project_id) fail('SPECIALIST_BOOK_PROJECT_MISMATCH');
  if (specialistIdentity(delta.post_state) !== delta.post_ledger_identity) fail('SPECIALIST_POST_IDENTITY_MISMATCH');
  if (!obj(delta.specialist_receipt) || delta.specialist_receipt.receipt_schema_version !== SPECIALIST_RECEIPT_SCHEMA_VERSION) fail('INVALID_SPECIALIST_RECEIPT');
  if (delta.specialist_receipt.pre_ledger_identity !== delta.expected_ledger_identity || delta.specialist_receipt.post_ledger_identity !== delta.post_ledger_identity) fail('SPECIALIST_RECEIPT_IDENTITY_MISMATCH');
  const receiptCopy = clone(delta.specialist_receipt);
  const claimedReceiptDigest = receiptCopy.receipt_digest;
  delete receiptCopy.receipt_digest;
  if (claimedReceiptDigest !== parent.sha256(receiptCopy)) fail('SPECIALIST_RECEIPT_DIGEST_MISMATCH');
  const expectedDeltaDigest = parent.sha256({
    specialist_kind: delta.specialist_kind,
    book_project_id: delta.book_project_id,
    expected_ledger_identity: delta.expected_ledger_identity,
    post_ledger_identity: delta.post_ledger_identity,
    specialist_receipt: delta.specialist_receipt,
  });
  if (expectedDeltaDigest !== delta.delta_digest) fail('SPECIALIST_DELTA_DIGEST_MISMATCH');
  return true;
}

module.exports = {
  BookVersionAdmissionRebindError,
  SPECIALIST_SCHEMA_VERSION,
  SPECIALIST_RECEIPT_SCHEMA_VERSION,
  SPECIALIST_KIND,
  OBJECT_TYPES,
  createSpecialistState,
  validateSpecialistState,
  specialistIdentity,
  extractCanonicalDelta,
  prepareContentAdmission,
  validatePreparedDelta,
};
