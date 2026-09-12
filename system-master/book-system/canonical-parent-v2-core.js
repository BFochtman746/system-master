'use strict';

const crypto = require('crypto');

class BookCanonicalParentV2Error extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookCanonicalParentV2Error';
    this.code = code;
    this.detail = detail;
  }
}

const SCHEMA_VERSION = 'BOOK_CANONICAL_PARENT_V2';
const EFFECT_SCHEMA_VERSION = 'BOOK_PARENT_EFFECT_V1';
const RECEIPT_SCHEMA_VERSION = 'BOOK_PARENT_COMMIT_RECEIPT_V1';
const EFFECT_TYPES = new Set([
  'ADVANCE_PROJECT_STATUS',
  'SET_ACTIVE_GOVERNING_BRIEF',
  'SET_ACTIVE_CANON_MANIFEST',
  'SET_ACTIVE_STORY_BIBLE',
  'SET_ACTIVE_BOOK_PLAN',
  'SET_ACTIVE_CANONICAL_MANUSCRIPT',
  'REGISTER_RESEARCH_EVIDENCE_LINK',
  'REGISTER_FINAL_AUTHOR_DECISION',
  'REGISTER_ADMITTED_INTEGRATION_PROPOSAL',
  'REGISTER_RIGHTS_CUSTODY_RECORD',
  'REGISTER_STYLE_PROFILE_VERSION',
  'SET_ACTIVE_STYLE_PROFILE',
  'REGISTER_EXPORT_RELEASE',
  'REGISTER_PUBLICATION_AUTHORIZATION',
]);
const PUBLISH_BLOCKED = 'REGISTER_PUBLICATION_AUTHORIZATION';
const POINTER_EFFECTS = {
  SET_ACTIVE_GOVERNING_BRIEF: ['governing_brief_ref', 'governing_briefs'],
  SET_ACTIVE_CANON_MANIFEST: ['canon_manifest_ref', 'canon_manifests'],
  SET_ACTIVE_STORY_BIBLE: ['story_bible_ref', 'story_bibles'],
  SET_ACTIVE_BOOK_PLAN: ['book_plan_ref', 'book_plans'],
  SET_ACTIVE_CANONICAL_MANUSCRIPT: ['canonical_manuscript_ref', 'manuscripts'],
  SET_ACTIVE_STYLE_PROFILE: ['style_profile_ref', 'style_profiles'],
};
const COLLECTIONS = ['governing_briefs', 'canon_manifests', 'story_bibles', 'book_plans', 'manuscripts'];
const TOP_KEYS = new Set([
  'schema_version','state_version','state_digest','book_project','governed_objects',
  'research_evidence_links','author_decisions','integration_proposals','rights_custody_records',
  'style_profiles','export_releases','active','authority_metadata','mutation_head'
]);
const ACTIVE_KEYS = new Set(['governing_brief_ref','canon_manifest_ref','story_bible_ref','book_plan_ref','canonical_manuscript_ref','style_profile_ref']);
const PROJECT_STATUSES = ['PLANNING','RESEARCH','DRAFTING','REVISING','EXPORT_FROZEN','PUBLISHED_OR_DELIVERED','ARCHIVED'];
const PROJECT_TRANSITIONS = new Map([
  ['PLANNING', new Set(['RESEARCH','DRAFTING','ARCHIVED'])],
  ['RESEARCH', new Set(['DRAFTING','ARCHIVED'])],
  ['DRAFTING', new Set(['REVISING','ARCHIVED'])],
  ['REVISING', new Set(['DRAFTING','EXPORT_FROZEN','ARCHIVED'])],
  ['EXPORT_FROZEN', new Set(['REVISING','PUBLISHED_OR_DELIVERED','ARCHIVED'])],
  ['PUBLISHED_OR_DELIVERED', new Set(['ARCHIVED'])],
  ['ARCHIVED', new Set([])],
]);
const RIGHTS_DISPOSITIONS = new Set(['UNKNOWN','REVIEW_REQUIRED','STALE','EXPIRED','REVOKED','CONFLICTING','REJECTED_FOR_SCOPE','ACCEPTED_FOR_DECLARED_SCOPE']);
const STYLE_STANDINGS = new Set(['DRAFT','CURRENT','SUPERSEDED','INVALIDATED']);
const FORBIDDEN_KEY_PATTERNS = [
  /raw.*manuscript/i, /manuscript.*text/i, /raw.*research/i, /source.*bytes/i,
  /private.*content/i, /private.*payload/i, /evaluator.*text/i, /credential/i,
  /access.*token/i, /secret/i,
];

function fail(code, detail = '') { throw new BookCanonicalParentV2Error(code, detail); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function isSha(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (obj(v)) {
    const out = {};
    for (const key of Object.keys(v).sort()) out[key] = normalize(v[key]);
    return out;
  }
  return v;
}
function stable(v) { return JSON.stringify(normalize(v)); }
function sha256(v) { return crypto.createHash('sha256').update(typeof v === 'string' ? v : stable(v)).digest('hex'); }
function reqObject(v, label) { if (!obj(v)) fail('OBJECT_REQUIRED', label); }
function exactKeys(v, allowed, label) {
  reqObject(v, label);
  for (const key of Object.keys(v)) if (!allowed.has(key)) fail('UNKNOWN_FIELD', `${label}.${key}`);
}
function required(v, keys, label) {
  reqObject(v, label);
  for (const key of keys) if (!own(v, key)) fail('REQUIRED_FIELD_MISSING', `${label}.${key}`);
}
function checkRefs(refs, label) {
  if (!Array.isArray(refs)) fail('REFERENCE_ARRAY_REQUIRED', label);
  for (const ref of refs) if (!nonEmpty(ref)) fail('MALFORMED_REFERENCE', label);
}
function rejectForbidden(value, path = '$') {
  if (Array.isArray(value)) return value.forEach((x, i) => rejectForbidden(x, `${path}[${i}]`));
  if (!obj(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY_PATTERNS.some(r => r.test(key))) fail('FORBIDDEN_PRIVATE_FIELD', `${path}.${key}`);
    rejectForbidden(child, `${path}.${key}`);
  }
}

function computeStateDigest(state) {
  const copy = clone(state);
  delete copy.state_digest;
  return sha256(copy);
}
function sealParent(state) {
  const out = clone(state);
  out.state_digest = computeStateDigest(out);
  return out;
}
function objectRef(item) { return `${item.object_id}:${item.version}`; }
function findTarget(parent, collection, ref) {
  const list = collection === 'style_profiles' ? parent.style_profiles : parent.governed_objects[collection];
  return list.find(item => objectRef(item) === ref) || null;
}
function validateGovernedItem(item, collection, bookProjectId) {
  exactKeys(item, new Set(['object_id','version','book_project_id','object_digest','authority_state','artifact_digest']), `governed_objects.${collection}.item`);
  required(item, ['object_id','version','book_project_id'], `governed_objects.${collection}.item`);
  if (!nonEmpty(item.object_id) || !nonEmpty(String(item.version))) fail('MALFORMED_GOVERNED_OBJECT_REF', collection);
  if (item.book_project_id !== bookProjectId) fail('FOREIGN_BOOK_OBJECT', collection);
  if (own(item, 'object_digest') && !isSha(item.object_digest)) fail('INVALID_OBJECT_DIGEST', collection);
  if (own(item, 'artifact_digest') && !isSha(item.artifact_digest)) fail('INVALID_OBJECT_DIGEST', collection);
}
function validateStyleProfile(profile, bookProjectId) {
  reqObject(profile, 'style_profile');
  required(profile, ['object_id','version','book_project_id','standing','profile_digest'], 'style_profile');
  if (!nonEmpty(profile.object_id) || !nonEmpty(String(profile.version))) fail('INVALID_STYLE_PROFILE_IDENTITY');
  if (profile.book_project_id !== bookProjectId) fail('FOREIGN_BOOK_OBJECT', 'style_profile');
  if (!STYLE_STANDINGS.has(profile.standing)) fail('INVALID_STYLE_PROFILE_STANDING');
  if (!isSha(profile.profile_digest)) fail('INVALID_STYLE_PROFILE_DIGEST');
  rejectForbidden(profile, 'style_profile');
}

function validateParent(parent) {
  exactKeys(parent, TOP_KEYS, 'parent');
  required(parent, [...TOP_KEYS], 'parent');
  if (parent.schema_version !== SCHEMA_VERSION) fail('INVALID_PARENT_SCHEMA_VERSION');
  if (!Number.isInteger(parent.state_version) || parent.state_version < 1) fail('INVALID_PARENT_STATE_VERSION');
  if (!isSha(parent.state_digest)) fail('INVALID_PARENT_STATE_DIGEST');
  if (computeStateDigest(parent) !== parent.state_digest) fail('PARENT_STATE_DIGEST_MISMATCH');
  reqObject(parent.book_project, 'book_project');
  required(parent.book_project, ['book_project_id','book_id','status'], 'book_project');
  if (!nonEmpty(parent.book_project.book_project_id) || !nonEmpty(parent.book_project.book_id)) fail('INVALID_BOOK_PROJECT_IDENTITY');
  if (!PROJECT_STATUSES.includes(parent.book_project.status)) fail('INVALID_PROJECT_STATUS');
  reqObject(parent.governed_objects, 'governed_objects');
  for (const collection of COLLECTIONS) {
    if (!Array.isArray(parent.governed_objects[collection])) fail('GOVERNED_COLLECTION_ARRAY_REQUIRED', collection);
    for (const item of parent.governed_objects[collection]) validateGovernedItem(item, collection, parent.book_project.book_project_id);
  }
  for (const list of ['research_evidence_links','author_decisions','integration_proposals','rights_custody_records','style_profiles','export_releases']) {
    if (!Array.isArray(parent[list])) fail('PARENT_COLLECTION_ARRAY_REQUIRED', list);
  }
  for (const profile of parent.style_profiles) validateStyleProfile(profile, parent.book_project.book_project_id);
  exactKeys(parent.active, ACTIVE_KEYS, 'active');
  for (const key of ACTIVE_KEYS) if (!own(parent.active, key)) fail('ACTIVE_POINTER_MISSING', key);
  const pointerMap = {
    governing_brief_ref:'governing_briefs', canon_manifest_ref:'canon_manifests', story_bible_ref:'story_bibles',
    book_plan_ref:'book_plans', canonical_manuscript_ref:'manuscripts', style_profile_ref:'style_profiles'
  };
  for (const [key, collection] of Object.entries(pointerMap)) {
    const ref = parent.active[key];
    if (ref !== null && !nonEmpty(ref)) fail('INVALID_ACTIVE_POINTER', key);
    if (ref !== null) {
      const target = findTarget(parent, collection, ref);
      if (!target) fail('ACTIVE_POINTER_TARGET_NOT_FOUND', key);
      if (collection === 'style_profiles' && target.standing !== 'CURRENT') fail('ACTIVE_STYLE_PROFILE_NOT_CURRENT');
    }
  }
  reqObject(parent.authority_metadata, 'authority_metadata');
  if (parent.mutation_head !== null && !nonEmpty(parent.mutation_head)) fail('INVALID_MUTATION_HEAD');
  rejectForbidden(parent);
  return true;
}

function effectPayloadDigest(payload) { return sha256(payload); }
function effectRequestFingerprint(effect) {
  const copy = clone(effect);
  delete copy.transport_metadata;
  return sha256(copy);
}
function ensureAllowedActor(effect) {
  if (!['SYSTEM','AUTHOR','EXTERNAL_AUTHORITY'].includes(effect.actor_class)) fail('ACTOR_CLASS_NOT_ALLOWED');
  if (effect.effect_type === 'REGISTER_FINAL_AUTHOR_DECISION') {
    if (effect.actor_class !== 'AUTHOR' || !nonEmpty(effect.authority_ref)) fail('AUTHOR_AUTHORITY_REQUIRED');
  } else if (effect.effect_type === PUBLISH_BLOCKED) {
    fail('PUBLICATION_EFFECT_BUILD_BLOCKED');
  } else if (effect.actor_class !== 'SYSTEM') {
    fail('ACTOR_CLASS_NOT_ALLOWED', effect.effect_type);
  }
}
function payloadAllowedKeys(type) {
  if (type === 'ADVANCE_PROJECT_STATUS') return new Set(['to_status']);
  if (POINTER_EFFECTS[type]) return new Set(['target_ref']);
  const map = {
    REGISTER_RESEARCH_EVIDENCE_LINK: ['record'],
    REGISTER_FINAL_AUTHOR_DECISION: ['record'],
    REGISTER_ADMITTED_INTEGRATION_PROPOSAL: ['record'],
    REGISTER_RIGHTS_CUSTODY_RECORD: ['record'],
    REGISTER_STYLE_PROFILE_VERSION: ['record'],
    REGISTER_EXPORT_RELEASE: ['record'],
    REGISTER_PUBLICATION_AUTHORIZATION: ['record'],
  };
  return map[type] ? new Set(map[type]) : new Set();
}
function validateEffectEnvelope(parent, effect) {
  reqObject(effect, 'effect');
  const requiredFields = ['effect_schema_version','effect_request_id','idempotency_key','actor_class','authority_ref','expected_parent_state_version','expected_parent_state_digest','effect_type','effect_payload','effect_payload_digest','subject_identity_refs','evidence_refs','specialist_receipt_refs','created_at','expected_specialist_ledger_identity'];
  required(effect, requiredFields, 'effect');
  if (effect.effect_schema_version !== EFFECT_SCHEMA_VERSION) fail('INVALID_EFFECT_SCHEMA_VERSION');
  if (!nonEmpty(effect.effect_request_id) || !nonEmpty(effect.idempotency_key)) fail('REQUEST_IDEMPOTENCY_REQUIRED');
  if (!Number.isInteger(effect.expected_parent_state_version) || effect.expected_parent_state_version < 1) fail('INVALID_EXPECTED_PARENT_STATE_VERSION');
  if (!isSha(effect.expected_parent_state_digest)) fail('INVALID_EXPECTED_PARENT_STATE_DIGEST');
  if (!EFFECT_TYPES.has(effect.effect_type)) fail('UNKNOWN_EFFECT_TYPE');
  if (effect.effect_type === PUBLISH_BLOCKED) fail('PUBLICATION_EFFECT_BUILD_BLOCKED');
  if (effect.effect_payload_digest !== effectPayloadDigest(effect.effect_payload)) fail('EFFECT_PAYLOAD_DIGEST_MISMATCH');
  checkRefs(effect.subject_identity_refs, 'subject_identity_refs');
  checkRefs(effect.evidence_refs, 'evidence_refs');
  checkRefs(effect.specialist_receipt_refs, 'specialist_receipt_refs');
  if (!nonEmpty(effect.created_at) || Number.isNaN(Date.parse(effect.created_at))) fail('INVALID_EFFECT_TIME');
  ensureAllowedActor(effect);
  const allowed = payloadAllowedKeys(effect.effect_type);
  exactKeys(effect.effect_payload, allowed, 'effect_payload');
  if (parent.state_version !== effect.expected_parent_state_version) fail('PARENT_STATE_VERSION_CONFLICT');
  if (parent.state_digest !== effect.expected_parent_state_digest) fail('PARENT_STATE_DIGEST_CONFLICT');
  rejectForbidden(effect, 'effect');
  return true;
}
function requireSubject(effect, ref) {
  if (!effect.subject_identity_refs.includes(ref)) fail('SUBJECT_IDENTITY_MISMATCH', ref);
}
function appendUnique(list, record, idField, label) {
  reqObject(record, label);
  if (!nonEmpty(record[idField])) fail('RECORD_ID_REQUIRED', label);
  if (list.some(x => x && x[idField] === record[idField])) fail('DUPLICATE_RECORD_ID', `${label}:${record[idField]}`);
  list.push(clone(record));
}
function validateRightsRecord(record, bookProjectId) {
  required(record, ['rights_record_id','record_version','book_project_id','source_ref','evidence_issuer_ref','evidence_ref','intended_use_scope','disposition'], 'rights_record');
  if (record.book_project_id !== bookProjectId) fail('RIGHTS_BOOK_MISMATCH');
  if (!RIGHTS_DISPOSITIONS.has(record.disposition)) fail('INVALID_RIGHTS_DISPOSITION');
  if (record.disposition === 'ACCEPTED_FOR_DECLARED_SCOPE') {
    if (!nonEmpty(record.evidence_issuer_ref) || !nonEmpty(record.evidence_ref) || !nonEmpty(record.intended_use_scope)) fail('RIGHTS_AUTHORITY_EVIDENCE_REQUIRED');
    if (record.currentness === 'STALE' || record.currentness === 'EXPIRED' || record.currentness === 'REVOKED') fail('RIGHTS_EVIDENCE_NOT_CURRENT');
  }
  rejectForbidden(record, 'rights_record');
}

function applyEffect(parentInput, effectInput, options = {}) {
  const parent = clone(parentInput);
  const effect = clone(effectInput);
  validateParent(parent);
  validateEffectEnvelope(parent, effect);
  const fingerprint = effectRequestFingerprint(effect);
  if (options.prior_receipt) {
    const prior = options.prior_receipt;
    if (prior.effect_request_id === effect.effect_request_id || prior.idempotency_key === effect.idempotency_key) {
      if (prior.effect_request_id !== effect.effect_request_id) fail('IDEMPOTENCY_REQUEST_ID_CONFLICT');
      if (prior.idempotency_key !== effect.idempotency_key) fail('REQUEST_IDEMPOTENCY_CONFLICT');
      if (prior.request_fingerprint !== fingerprint) fail('IDEMPOTENCY_KEY_CONFLICT');
      return { replay: true, parent_state: clone(options.prior_parent_state || parent), commit_receipt: clone(prior) };
    }
  }
  const next = clone(parent);
  const p = effect.effect_payload;
  if (POINTER_EFFECTS[effect.effect_type]) {
    const [pointer, collection] = POINTER_EFFECTS[effect.effect_type];
    if (!nonEmpty(p.target_ref)) fail('TARGET_REF_REQUIRED');
    requireSubject(effect, p.target_ref);
    const target = findTarget(parent, collection, p.target_ref);
    if (!target) fail('POINTER_TARGET_NOT_ADMITTED');
    if (collection === 'style_profiles' && target.standing !== 'CURRENT') fail('STYLE_PROFILE_NOT_CURRENT');
    next.active[pointer] = p.target_ref;
  } else if (effect.effect_type === 'ADVANCE_PROJECT_STATUS') {
    if (!PROJECT_STATUSES.includes(p.to_status)) fail('INVALID_PROJECT_STATUS');
    const allowed = PROJECT_TRANSITIONS.get(parent.book_project.status) || new Set();
    if (!allowed.has(p.to_status)) fail('ILLEGAL_PROJECT_TRANSITION');
    next.book_project.status = p.to_status;
  } else if (effect.effect_type === 'REGISTER_RESEARCH_EVIDENCE_LINK') {
    appendUnique(next.research_evidence_links, p.record, 'link_id', 'research_evidence_link');
  } else if (effect.effect_type === 'REGISTER_FINAL_AUTHOR_DECISION') {
    appendUnique(next.author_decisions, p.record, 'decision_id', 'author_decision');
  } else if (effect.effect_type === 'REGISTER_ADMITTED_INTEGRATION_PROPOSAL') {
    appendUnique(next.integration_proposals, p.record, 'proposal_id', 'integration_proposal');
  } else if (effect.effect_type === 'REGISTER_RIGHTS_CUSTODY_RECORD') {
    validateRightsRecord(p.record, parent.book_project.book_project_id);
    appendUnique(next.rights_custody_records, p.record, 'rights_record_id', 'rights_record');
  } else if (effect.effect_type === 'REGISTER_STYLE_PROFILE_VERSION') {
    validateStyleProfile(p.record, parent.book_project.book_project_id);
    if (p.record.standing === 'CURRENT' && next.style_profiles.some(x => x.standing === 'CURRENT' && x.object_id === p.record.object_id)) fail('STYLE_PROFILE_CURRENT_VERSION_CONFLICT');
    if (next.style_profiles.some(x => x && x.object_id === p.record.object_id && String(x.version) === String(p.record.version))) fail('DUPLICATE_RECORD_ID', `style_profile:${p.record.object_id}:${p.record.version}`);
    next.style_profiles.push(clone(p.record));
  } else if (effect.effect_type === 'REGISTER_EXPORT_RELEASE') {
    if (p.record.publication_authorized === true) fail('EXPORT_CANNOT_AUTHORIZE_PUBLICATION');
    appendUnique(next.export_releases, p.record, 'release_id', 'export_release');
  } else {
    fail('UNKNOWN_EFFECT_TYPE');
  }
  next.state_version = parent.state_version + 1;
  const receiptId = `BCR-${sha256({book_project_id: parent.book_project.book_project_id, effect_request_id: effect.effect_request_id, idempotency_key: effect.idempotency_key, request_fingerprint: fingerprint, pre_state_version: parent.state_version, pre_state_digest: parent.state_digest}).slice(0, 32).toUpperCase()}`;
  next.mutation_head = receiptId;
  const sealed = sealParent(next);
  validateParent(sealed);
  if (sealed.book_project.book_project_id !== parent.book_project.book_project_id || sealed.book_project.book_id !== parent.book_project.book_id) fail('BOOK_PROJECT_IDENTITY_MUTATION_FORBIDDEN');
  const receipt = {
    receipt_schema_version: RECEIPT_SCHEMA_VERSION,
    receipt_id: receiptId,
    book_project_id: parent.book_project.book_project_id,
    effect_request_id: effect.effect_request_id,
    idempotency_key: effect.idempotency_key,
    request_fingerprint: fingerprint,
    effect_type: effect.effect_type,
    effect_payload_digest: effect.effect_payload_digest,
    actor_class: effect.actor_class,
    authority_ref: effect.authority_ref,
    pre_parent_state_version: parent.state_version,
    pre_parent_state_digest: parent.state_digest,
    post_parent_state_version: sealed.state_version,
    post_parent_state_digest: sealed.state_digest,
    subject_identity_refs: clone(effect.subject_identity_refs),
    evidence_refs: clone(effect.evidence_refs),
    specialist_receipt_refs: clone(effect.specialist_receipt_refs),
    predecessor_parent_commit_receipt_ref: parent.mutation_head,
    committed_at: effect.created_at,
  };
  receipt.receipt_digest = sha256(receipt);
  rejectForbidden(receipt, 'receipt');
  return { replay: false, parent_state: sealed, commit_receipt: receipt };
}

module.exports = {
  BookCanonicalParentV2Error,
  SCHEMA_VERSION,
  EFFECT_SCHEMA_VERSION,
  RECEIPT_SCHEMA_VERSION,
  EFFECT_TYPES,
  computeStateDigest,
  sealParent,
  validateParent,
  effectPayloadDigest,
  effectRequestFingerprint,
  validateEffectEnvelope,
  applyEffect,
  sha256,
};
