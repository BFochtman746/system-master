'use strict';

const vr = require('./version-and-rollback-core');

class ContentAdmissionError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'ContentAdmissionError';
    this.code = code;
    this.detail = detail;
  }
}

const OBJECT_META = {
  GOVERNING_BRIEF: { collection: 'governing_briefs', id: 'brief_id', version: 'version', pointer: 'governing_brief_ref' },
  CANON_MANIFEST: { collection: 'canon_manifests', id: 'canon_manifest_id', version: 'version', pointer: 'canon_manifest_ref' },
  STORY_BIBLE: { collection: 'story_bibles', id: 'story_bible_id', version: 'version', pointer: 'story_bible_ref' },
  BOOK_PLAN: { collection: 'book_plans', id: 'plan_id', version: 'version', pointer: 'book_plan_ref' },
  MANUSCRIPT_MANIFEST: { collection: 'manuscripts', id: 'manuscript_id', version: 'version_id', pointer: 'canonical_manuscript_ref' },
};

const UNIT_TYPES = new Set(['CHAPTER', 'SCENE']);
const AFFIRMATIVE = new Set(['APPROVE', 'APPROVED', 'ACCEPT', 'ACCEPTED', 'PROMOTE', 'PROMOTED', 'YES', true]);

function fail(code, detail = '') { throw new ContentAdmissionError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function isSha256(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }
function isSubjectSha(v) { return typeof v === 'string' && /^[a-f0-9]{40,64}$/.test(v); }
function req(v, fields, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const field of fields) if (!own(v, field)) fail('REQUIRED_FIELD_MISSING', `${label}.${field}`);
}
function same(a, b) { return vr.stableStringify(a) === vr.stableStringify(b); }
function objectRef(id, version) { return `${String(id)}:${String(version)}`; }
function unitRef(type, stableUnitId, versionId) { return `${type}:${String(stableUnitId)}:${String(versionId)}`; }
function unitKey(record) { return `${record.unit_type}|${record.stable_unit_id}|${record.version_id}`; }
function unitFamily(record) { return `${record.unit_type}|${record.stable_unit_id}`; }

function validateProvenance(v, label) {
  req(v, ['content_digest_sha256', 'provenance_ref', 'source_subject_sha', 'source_current', 'created_by', 'created_at'], label);
  if (!isSha256(v.content_digest_sha256)) fail('INVALID_CONTENT_DIGEST', label);
  if (!nonEmpty(v.provenance_ref)) fail('PROVENANCE_REF_REQUIRED', label);
  if (!isSubjectSha(v.source_subject_sha)) fail('INVALID_SOURCE_SUBJECT_SHA', label);
  if (v.source_current !== true) fail('SOURCE_CURRENTNESS_REQUIRED', label);
  if (!nonEmpty(v.created_by) || !nonEmpty(v.created_at)) fail('CREATION_IDENTITY_REQUIRED', label);
}

function assertAuthorDecision(parentState, request, operation, label) {
  if (operation.requires_author_decision !== true) return;
  if (!Array.isArray(request.author_decision_refs) || request.author_decision_refs.length === 0) fail('AUTHOR_DECISION_REQUIRED', label);
  const found = request.author_decision_refs.some(ref => {
    const d = parentState.author_decisions.find(x => x && x.decision_id === ref);
    return !!(d && d.status === 'APPROVED' && AFFIRMATIVE.has(d.author_choice));
  });
  if (!found) fail('AUTHOR_DECISION_NOT_APPROVED', label);
}

function validateContentUnitHistory(state) {
  if (!own(state, 'content_unit_versions')) return true;
  if (!Array.isArray(state.content_unit_versions)) fail('CONTENT_UNIT_VERSIONS_ARRAY_REQUIRED');
  const seen = new Set();
  const heads = new Map();
  const chapterRefs = new Set();
  for (let i = 0; i < state.content_unit_versions.length; i += 1) {
    const r = state.content_unit_versions[i];
    const label = `content_unit_versions.${i}`;
    req(r, ['unit_version_key', 'unit_type', 'book_project_id', 'stable_unit_id', 'version_id', 'content_digest_sha256', 'parent_version_ref', 'parent_object_ref', 'ordinal', 'provenance_ref', 'source_subject_sha', 'created_by', 'created_at'], label);
    if (!UNIT_TYPES.has(r.unit_type)) fail('UNKNOWN_CONTENT_UNIT_TYPE', r.unit_type);
    if (!nonEmpty(r.book_project_id) || r.book_project_id !== state.book_project.book_project_id) fail('CROSS_BOOK_CONTENT_UNIT_FORBIDDEN', label);
    if (!nonEmpty(r.stable_unit_id) || !nonEmpty(String(r.version_id))) fail('INVALID_CONTENT_UNIT_IDENTITY', label);
    if (!isSha256(r.content_digest_sha256) || !nonEmpty(r.provenance_ref) || !isSubjectSha(r.source_subject_sha)) fail('INVALID_CONTENT_UNIT_PROVENANCE', label);
    if (!Number.isInteger(r.ordinal) || r.ordinal < 1) fail('INVALID_CONTENT_UNIT_ORDINAL', label);
    if (r.unit_version_key !== unitKey(r)) fail('CONTENT_UNIT_VERSION_KEY_MISMATCH', label);
    if (seen.has(r.unit_version_key)) fail('DUPLICATE_CONTENT_UNIT_VERSION', r.unit_version_key);
    seen.add(r.unit_version_key);
    const family = unitFamily(r);
    const expectedParent = heads.has(family) ? unitRef(r.unit_type, r.stable_unit_id, heads.get(family).version_id) : null;
    if ((r.parent_version_ref ?? null) !== expectedParent) fail('CONTENT_UNIT_PREDECESSOR_MISMATCH', r.unit_version_key);
    if (r.unit_type === 'CHAPTER') {
      const expectedBookParent = `BOOK_PROJECT:${state.book_project.book_project_id}`;
      if (r.parent_object_ref !== expectedBookParent) fail('CHAPTER_PARENT_MISMATCH', r.unit_version_key);
      chapterRefs.add(unitRef('CHAPTER', r.stable_unit_id, r.version_id));
    } else {
      if (!chapterRefs.has(r.parent_object_ref)) fail('SCENE_PARENT_CHAPTER_NOT_FOUND', r.unit_version_key);
    }
    heads.set(family, r);
  }
  return true;
}

function ensureExtension(proposed) {
  if (!own(proposed, 'content_unit_versions')) proposed.content_unit_versions = [];
  if (!Array.isArray(proposed.content_unit_versions)) fail('CONTENT_UNIT_VERSIONS_ARRAY_REQUIRED');
}

function existingObject(state, type, id, version) {
  const meta = OBJECT_META[type];
  if (!meta) fail('UNKNOWN_CONTENT_OBJECT_TYPE', String(type));
  return state[meta.collection].find(x => x && String(x[meta.id]) === String(id) && String(x[meta.version]) === String(version)) || null;
}

function familyHeadNode(ledger, type, id) {
  const nodeId = ledger.object_family_heads[`${type}|${String(id)}`];
  return nodeId ? ledger.object_version_nodes[nodeId] || null : null;
}

function applyRegisterObject({ proposed, ledger, request, operation, registeredObjectFamilies, registeredObjectRefs }) {
  req(operation, ['object_type', 'object_id', 'version_id', 'content_digest_sha256', 'parent_version_ref', 'provenance_ref', 'source_subject_sha', 'source_current', 'created_by', 'created_at', 'payload'], 'REGISTER_CONTENT_OBJECT_VERSION');
  const type = operation.object_type;
  const meta = OBJECT_META[type];
  if (!meta) fail('UNKNOWN_CONTENT_OBJECT_TYPE', String(type));
  validateProvenance(operation, `REGISTER_CONTENT_OBJECT_VERSION:${type}`);
  assertAuthorDecision(proposed, request, operation, `REGISTER_CONTENT_OBJECT_VERSION:${type}`);
  if (!nonEmpty(operation.object_id) || !nonEmpty(String(operation.version_id))) fail('INVALID_CONTENT_OBJECT_IDENTITY', type);
  const family = `${type}|${operation.object_id}`;
  if (registeredObjectFamilies.has(family)) fail('MULTIPLE_NEW_VERSIONS_SAME_FAMILY_ONE_MUTATION', family);
  if (existingObject(proposed, type, operation.object_id, operation.version_id)) fail('DUPLICATE_CONTENT_OBJECT_VERSION', objectRef(operation.object_id, operation.version_id));
  const head = familyHeadNode(ledger, type, operation.object_id);
  const expectedParent = head ? objectRef(head.object_id, head.object_version) : null;
  if ((operation.parent_version_ref ?? null) !== expectedParent) fail('CONTENT_OBJECT_PREDECESSOR_MISMATCH', family);
  if (!obj(operation.payload)) fail('CONTENT_OBJECT_PAYLOAD_REQUIRED', type);
  const payload = clone(operation.payload);
  if (own(payload, meta.id) && String(payload[meta.id]) !== String(operation.object_id)) fail('CONTENT_OBJECT_PAYLOAD_ID_MISMATCH', type);
  if (own(payload, meta.version) && String(payload[meta.version]) !== String(operation.version_id)) fail('CONTENT_OBJECT_PAYLOAD_VERSION_MISMATCH', type);
  payload[meta.id] = operation.object_id;
  payload[meta.version] = operation.version_id;
  const admissionFields = {
    content_digest_sha256: operation.content_digest_sha256,
    parent_version_ref: operation.parent_version_ref ?? null,
    provenance_ref: operation.provenance_ref,
    source_subject_sha: operation.source_subject_sha,
    created_by: operation.created_by,
    created_at: operation.created_at,
  };
  for (const [k, v] of Object.entries(admissionFields)) {
    if (own(payload, k) && !same(payload[k], v)) fail('CONTENT_OBJECT_ADMISSION_METADATA_MISMATCH', `${type}.${k}`);
    payload[k] = v;
  }
  if (type === 'MANUSCRIPT_MANIFEST') {
    if (!isSha256(payload.artifact_digest)) fail('INVALID_MANUSCRIPT_ARTIFACT_DIGEST');
    if (payload.artifact_digest !== operation.content_digest_sha256) fail('MANUSCRIPT_CONTENT_DIGEST_MISMATCH');
    if (payload.authority_state !== 'CANONICAL') fail('MANUSCRIPT_CANONICAL_AUTHORITY_REQUIRED');
  }
  proposed[meta.collection].push(payload);
  registeredObjectFamilies.add(family);
  registeredObjectRefs.set(objectRef(operation.object_id, operation.version_id), { type, payload });
}

function applyRegisterUnit({ proposed, request, operation, registeredUnitFamilies, registeredUnitRefs }) {
  req(operation, ['unit_type', 'book_project_id', 'stable_unit_id', 'version_id', 'content_digest_sha256', 'parent_version_ref', 'parent_object_ref', 'ordinal', 'provenance_ref', 'source_subject_sha', 'source_current', 'created_by', 'created_at'], 'REGISTER_CONTENT_UNIT_VERSION');
  if (!UNIT_TYPES.has(operation.unit_type)) fail('UNKNOWN_CONTENT_UNIT_TYPE', String(operation.unit_type));
  validateProvenance(operation, `REGISTER_CONTENT_UNIT_VERSION:${operation.unit_type}`);
  assertAuthorDecision(proposed, request, operation, `REGISTER_CONTENT_UNIT_VERSION:${operation.unit_type}`);
  if (operation.book_project_id !== proposed.book_project.book_project_id) fail('CROSS_BOOK_CONTENT_UNIT_FORBIDDEN', operation.stable_unit_id);
  if (!nonEmpty(operation.stable_unit_id) || !nonEmpty(String(operation.version_id))) fail('INVALID_CONTENT_UNIT_IDENTITY');
  if (!Number.isInteger(operation.ordinal) || operation.ordinal < 1) fail('INVALID_CONTENT_UNIT_ORDINAL');
  const family = `${operation.unit_type}|${operation.stable_unit_id}`;
  if (registeredUnitFamilies.has(family)) fail('MULTIPLE_NEW_VERSIONS_SAME_FAMILY_ONE_MUTATION', family);
  const duplicate = proposed.content_unit_versions.find(x => x && x.unit_type === operation.unit_type && x.stable_unit_id === operation.stable_unit_id && String(x.version_id) === String(operation.version_id));
  if (duplicate) fail('DUPLICATE_CONTENT_UNIT_VERSION', unitRef(operation.unit_type, operation.stable_unit_id, operation.version_id));
  const familyVersions = proposed.content_unit_versions.filter(x => x && x.unit_type === operation.unit_type && x.stable_unit_id === operation.stable_unit_id);
  const head = familyVersions.length ? familyVersions[familyVersions.length - 1] : null;
  const expectedParent = head ? unitRef(operation.unit_type, operation.stable_unit_id, head.version_id) : null;
  if ((operation.parent_version_ref ?? null) !== expectedParent) fail('CONTENT_UNIT_PREDECESSOR_MISMATCH', family);
  if (operation.unit_type === 'CHAPTER') {
    if (operation.parent_object_ref !== `BOOK_PROJECT:${proposed.book_project.book_project_id}`) fail('CHAPTER_PARENT_MISMATCH', operation.stable_unit_id);
  } else {
    const parent = proposed.content_unit_versions.find(x => x && unitRef(x.unit_type, x.stable_unit_id, x.version_id) === operation.parent_object_ref);
    if (!parent || parent.unit_type !== 'CHAPTER' || parent.book_project_id !== proposed.book_project.book_project_id) fail('SCENE_PARENT_CHAPTER_NOT_FOUND', operation.stable_unit_id);
  }
  const record = {
    unit_version_key: `${operation.unit_type}|${operation.stable_unit_id}|${operation.version_id}`,
    unit_type: operation.unit_type,
    book_project_id: operation.book_project_id,
    stable_unit_id: operation.stable_unit_id,
    version_id: operation.version_id,
    content_digest_sha256: operation.content_digest_sha256,
    parent_version_ref: operation.parent_version_ref ?? null,
    parent_object_ref: operation.parent_object_ref,
    ordinal: operation.ordinal,
    provenance_ref: operation.provenance_ref,
    source_subject_sha: operation.source_subject_sha,
    created_by: operation.created_by,
    created_at: operation.created_at,
  };
  proposed.content_unit_versions.push(record);
  registeredUnitFamilies.add(family);
  registeredUnitRefs.set(unitRef(record.unit_type, record.stable_unit_id, record.version_id), record);
}

function resolveUnit(proposed, ref) {
  return proposed.content_unit_versions.find(x => x && unitRef(x.unit_type, x.stable_unit_id, x.version_id) === ref) || null;
}

function validateOrderedRefs(proposed, refs, type, label) {
  if (!Array.isArray(refs)) fail('CONTENT_UNIT_ORDER_ARRAY_REQUIRED', label);
  const seenRefs = new Set();
  const ordinalByParent = new Map();
  let priorChapterOrdinal = 0;
  for (const ref of refs) {
    if (!nonEmpty(ref) || seenRefs.has(ref)) fail('DUPLICATE_OR_INVALID_CONTENT_UNIT_ORDER_REF', `${label}:${String(ref)}`);
    seenRefs.add(ref);
    const unit = resolveUnit(proposed, ref);
    if (!unit || unit.unit_type !== type) fail('CONTENT_UNIT_ORDER_TARGET_NOT_FOUND', `${label}:${ref}`);
    if (type === 'CHAPTER') {
      if (unit.ordinal <= priorChapterOrdinal) fail('AMBIGUOUS_OR_NONDETERMINISTIC_CONTENT_UNIT_ORDER', label);
      priorChapterOrdinal = unit.ordinal;
    } else {
      const key = unit.parent_object_ref;
      const prior = ordinalByParent.get(key) || 0;
      if (unit.ordinal <= prior) fail('AMBIGUOUS_OR_NONDETERMINISTIC_CONTENT_UNIT_ORDER', `${label}:${key}`);
      ordinalByParent.set(key, unit.ordinal);
    }
  }
}

function applySetUnitOrder({ proposed, operation, registeredObjectRefs }) {
  req(operation, ['book_plan_ref', 'chapter_refs', 'scene_refs'], 'SET_ACTIVE_CONTENT_UNIT_ORDER');
  const registered = registeredObjectRefs.get(operation.book_plan_ref);
  if (!registered || registered.type !== 'BOOK_PLAN') fail('CONTENT_UNIT_ORDER_REQUIRES_NEW_BOOK_PLAN_VERSION', operation.book_plan_ref);
  validateOrderedRefs(proposed, operation.chapter_refs, 'CHAPTER', 'chapter_refs');
  validateOrderedRefs(proposed, operation.scene_refs, 'SCENE', 'scene_refs');
  const allowedChapterRefs = new Set(operation.chapter_refs);
  for (const sceneRef of operation.scene_refs) {
    const scene = resolveUnit(proposed, sceneRef);
    if (!allowedChapterRefs.has(scene.parent_object_ref)) fail('SCENE_PARENT_NOT_IN_ACTIVE_CHAPTER_ORDER', sceneRef);
  }
  registered.payload.chapter_refs = clone(operation.chapter_refs);
  registered.payload.scene_refs = clone(operation.scene_refs);
  const meta = OBJECT_META.BOOK_PLAN;
  const idx = proposed[meta.collection].findIndex(x => x === registered.payload || (x && objectRef(x[meta.id], x[meta.version]) === operation.book_plan_ref));
  if (idx < 0) fail('REGISTERED_BOOK_PLAN_NOT_FOUND', operation.book_plan_ref);
  proposed[meta.collection][idx] = registered.payload;
}

function applySetActiveObject({ proposed, ledger, operation, activeBindings }) {
  req(operation, ['object_type', 'object_ref'], 'SET_ACTIVE_CONTENT_OBJECT_VERSION');
  const meta = OBJECT_META[operation.object_type];
  if (!meta) fail('UNKNOWN_CONTENT_OBJECT_TYPE', String(operation.object_type));
  const split = String(operation.object_ref).lastIndexOf(':');
  if (split <= 0 || split === String(operation.object_ref).length - 1) fail('INVALID_CONTENT_OBJECT_REF', operation.object_ref);
  const id = String(operation.object_ref).slice(0, split);
  const version = String(operation.object_ref).slice(split + 1);
  const payload = existingObject(proposed, operation.object_type, id, version);
  if (!payload) fail('ACTIVE_CONTENT_OBJECT_TARGET_NOT_FOUND', operation.object_ref);
  if (operation.object_type === 'MANUSCRIPT_MANIFEST' && payload.authority_state !== 'CANONICAL') fail('ACTIVE_MANUSCRIPT_NOT_CANONICAL');
  proposed.active[meta.pointer] = operation.object_ref;
  if (operation.object_type === 'GOVERNING_BRIEF') proposed.book_project.governing_brief_ref = operation.object_ref;
  if (operation.object_type === 'CANON_MANIFEST') proposed.book_project.canonical_manifest_ref = operation.object_ref;
  activeBindings[meta.pointer] = vr.nodeId(operation.object_type, id, version, vr.digest(payload));
  if (!activeBindings[meta.pointer]) fail('ACTIVE_CONTENT_OBJECT_BINDING_FAILED', operation.object_ref);
  const familyHead = familyHeadNode(ledger, operation.object_type, id);
  if (familyHead && familyHead.object_version === version && familyHead.object_digest !== vr.digest(payload)) fail('ACTIVE_CONTENT_OBJECT_IMMUTABLE_CONFLICT', operation.object_ref);
}

function admissionRequestId(mutationId, fingerprint) { return `CONTENT_ADMISSION:${mutationId}:${fingerprint}`; }

function commitContentAdmission({ parentState, versionLedger, request }) {
  vr.validateParentState(parentState);
  vr.validateLedger(versionLedger, parentState);
  req(request, ['mutation_id', 'actor_class', 'expected_state_version', 'expected_state_digest', 'operations'], 'request');
  if (!nonEmpty(request.mutation_id)) fail('MUTATION_ID_REQUIRED');
  if (!Array.isArray(request.operations) || request.operations.length === 0) fail('CONTENT_ADMISSION_OPERATIONS_REQUIRED');
  const fingerprint = vr.digest(request);
  const lowerRequestId = admissionRequestId(request.mutation_id, fingerprint);
  const prior = versionLedger.processed_requests[request.mutation_id];
  if (prior) {
    if (prior.request_id !== lowerRequestId) fail('IDEMPOTENCY_KEY_CONFLICT', request.mutation_id);
    const receipt = versionLedger.version_receipts[prior.receipt_id];
    if (!receipt) fail('PROCESSED_REQUEST_RECEIPT_MISSING', request.mutation_id);
    return {
      parent_state: clone(parentState), version_ledger: clone(versionLedger), version_receipt: clone(receipt),
      admission_receipt: { mutation_id: request.mutation_id, request_fingerprint: fingerprint, version_receipt_id: receipt.receipt_id, disposition: 'REPLAY' },
      disposition: 'REPLAY',
    };
  }
  if (request.actor_class !== 'PARENT_SYSTEM') fail('CONTENT_ADMISSION_AUTHORITY_DENIED', String(request.actor_class));
  if (request.expected_state_version !== parentState.state_version || request.expected_state_digest !== parentState.state_digest) fail('STALE_PARENT_WRITE');
  validateContentUnitHistory(parentState);
  const proposed = clone(parentState);
  ensureExtension(proposed);
  const activeBindings = clone(versionLedger.state_snapshots[versionLedger.current_snapshot_id].active_version_bindings);
  const registeredObjectFamilies = new Set();
  const registeredObjectRefs = new Map();
  const registeredUnitFamilies = new Set();
  const registeredUnitRefs = new Map();
  for (let i = 0; i < request.operations.length; i += 1) {
    const operation = request.operations[i];
    if (!obj(operation) || !nonEmpty(operation.operation_type)) fail('INVALID_CONTENT_ADMISSION_OPERATION', String(i));
    if (operation.operation_type === 'REGISTER_CONTENT_OBJECT_VERSION') {
      applyRegisterObject({ proposed, ledger: versionLedger, request, operation, registeredObjectFamilies, registeredObjectRefs });
    } else if (operation.operation_type === 'REGISTER_CONTENT_UNIT_VERSION') {
      applyRegisterUnit({ proposed, request, operation, registeredUnitFamilies, registeredUnitRefs });
    } else if (operation.operation_type === 'SET_ACTIVE_CONTENT_UNIT_ORDER') {
      applySetUnitOrder({ proposed, operation, registeredObjectRefs });
    } else if (operation.operation_type === 'SET_ACTIVE_CONTENT_OBJECT_VERSION') {
      applySetActiveObject({ proposed, ledger: versionLedger, operation, activeBindings });
    } else {
      fail('UNKNOWN_CONTENT_ADMISSION_OPERATION', operation.operation_type);
    }
  }
  validateContentUnitHistory(proposed);
  if (proposed.book_project.status !== parentState.book_project.status) fail('LIFECYCLE_STATUS_MUTATION_FORBIDDEN');
  if (!same(proposed.export_releases, parentState.export_releases)) fail('EXPORT_RELEASE_MUTATION_FORBIDDEN');
  const lowerRequest = {
    request_id: lowerRequestId,
    idempotency_key: request.mutation_id,
    actor_class: 'PARENT_SYSTEM',
    expected_state_version: parentState.state_version,
    expected_state_digest: parentState.state_digest,
    expected_ledger_version: versionLedger.ledger_version,
    expected_ledger_digest: vr.digestLedger(versionLedger),
    proposed_parent_state: proposed,
    active_version_bindings: activeBindings,
    evidence_refs: Array.isArray(request.evidence_refs) ? clone(request.evidence_refs) : [],
    author_decision_refs: Array.isArray(request.author_decision_refs) ? clone(request.author_decision_refs) : [],
    lifecycle_transition_receipt: null,
  };
  const result = vr.commitSuccessor({ parentState, versionLedger, request: lowerRequest });
  return {
    parent_state: result.parent_state,
    version_ledger: result.version_ledger,
    version_receipt: result.receipt,
    admission_receipt: {
      mutation_id: request.mutation_id,
      request_fingerprint: fingerprint,
      version_receipt_id: result.receipt.receipt_id,
      pre_parent_state_version: result.receipt.pre_parent_state_version,
      pre_parent_state_digest: result.receipt.pre_parent_state_digest,
      post_parent_state_version: result.receipt.post_parent_state_version,
      post_parent_state_digest: result.receipt.post_parent_state_digest,
      operation_count: request.operations.length,
      disposition: result.disposition,
    },
    disposition: result.disposition,
  };
}

module.exports = {
  ContentAdmissionError,
  OBJECT_META,
  UNIT_TYPES,
  unitRef,
  validateContentUnitHistory,
  commitContentAdmission,
};
