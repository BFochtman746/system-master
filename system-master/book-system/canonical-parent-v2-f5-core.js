'use strict';

const base = require('./canonical-parent-v2-core.js');

const EFFECT_TYPE = 'COMMIT_CONTENT_ADMISSION';
const OBJECT_META = Object.freeze({
  GOVERNING_BRIEF: { collection: 'governing_briefs', pointer: 'governing_brief_ref' },
  CANON_MANIFEST: { collection: 'canon_manifests', pointer: 'canon_manifest_ref' },
  STORY_BIBLE: { collection: 'story_bibles', pointer: 'story_bible_ref' },
  BOOK_PLAN: { collection: 'book_plans', pointer: 'book_plan_ref' },
  MANUSCRIPT_MANIFEST: { collection: 'manuscripts', pointer: 'canonical_manuscript_ref' },
});
const EFFECT_FIELDS = new Set([
  'effect_schema_version','effect_request_id','idempotency_key','actor_class','authority_ref',
  'expected_parent_state_version','expected_parent_state_digest','effect_type','effect_payload',
  'effect_payload_digest','subject_identity_refs','evidence_refs','specialist_receipt_refs',
  'created_at','expected_specialist_ledger_identity'
]);
const PAYLOAD_FIELDS = new Set(['governed_object_versions','active_pointer_updates','specialist_delta_digest']);
const SUMMARY_FIELDS = new Set(['object_type','object_id','version','book_project_id','object_digest','authority_state','artifact_digest']);
const UPDATE_FIELDS = new Set(['object_type','target_ref']);

class BookCanonicalParentF5Error extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookCanonicalParentF5Error';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookCanonicalParentF5Error(code, detail); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function isSha(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function exactKeys(v, allowed, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const key of Object.keys(v)) if (!allowed.has(key)) fail('UNKNOWN_FIELD', `${label}.${key}`);
}
function required(v, keys, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const key of keys) if (!own(v, key)) fail('REQUIRED_FIELD_MISSING', `${label}.${key}`);
}
function checkRefs(refs, label, requireOne = false) {
  if (!Array.isArray(refs)) fail('REFERENCE_ARRAY_REQUIRED', label);
  if (requireOne && refs.length === 0) fail('SPECIALIST_RECEIPT_REQUIRED', label);
  for (const ref of refs) if (!nonEmpty(ref)) fail('MALFORMED_REFERENCE', label);
}
function refOf(v) { return `${v.object_id}:${v.version}`; }
function findTarget(parent, meta, targetRef) {
  return parent.governed_objects[meta.collection].find(x => refOf(x) === targetRef) || null;
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function validateAdmissionEffect(parent, effect) {
  base.validateParent(parent);
  exactKeys(effect, EFFECT_FIELDS, 'effect');
  required(effect, [...EFFECT_FIELDS], 'effect');
  if (effect.effect_schema_version !== base.EFFECT_SCHEMA_VERSION) fail('INVALID_EFFECT_SCHEMA_VERSION');
  if (effect.effect_type !== EFFECT_TYPE) fail('UNKNOWN_EFFECT_TYPE');
  if (!nonEmpty(effect.effect_request_id) || !nonEmpty(effect.idempotency_key)) fail('REQUEST_IDEMPOTENCY_REQUIRED');
  if (effect.actor_class !== 'SYSTEM') fail('ACTOR_CLASS_NOT_ALLOWED', effect.actor_class);
  if (effect.authority_ref !== null && effect.authority_ref !== undefined && !nonEmpty(effect.authority_ref)) fail('INVALID_AUTHORITY_REF');
  if (!Number.isInteger(effect.expected_parent_state_version) || effect.expected_parent_state_version < 1) fail('INVALID_EXPECTED_PARENT_STATE_VERSION');
  if (!isSha(effect.expected_parent_state_digest)) fail('INVALID_EXPECTED_PARENT_STATE_DIGEST');
  if (effect.expected_parent_state_version !== parent.state_version) fail('PARENT_STATE_VERSION_CONFLICT');
  if (effect.expected_parent_state_digest !== parent.state_digest) fail('PARENT_STATE_DIGEST_CONFLICT');
  if (!nonEmpty(effect.expected_specialist_ledger_identity) || !isSha(effect.expected_specialist_ledger_identity)) fail('SPECIALIST_LEDGER_IDENTITY_REQUIRED');
  checkRefs(effect.subject_identity_refs, 'subject_identity_refs');
  checkRefs(effect.evidence_refs, 'evidence_refs');
  checkRefs(effect.specialist_receipt_refs, 'specialist_receipt_refs', true);
  if (!effect.subject_identity_refs.includes(parent.book_project.book_project_id)) fail('SUBJECT_IDENTITY_MISMATCH', parent.book_project.book_project_id);
  if (!nonEmpty(effect.created_at) || Number.isNaN(Date.parse(effect.created_at))) fail('INVALID_EFFECT_TIME');
  exactKeys(effect.effect_payload, PAYLOAD_FIELDS, 'effect_payload');
  required(effect.effect_payload, [...PAYLOAD_FIELDS], 'effect_payload');
  if (effect.effect_payload_digest !== base.effectPayloadDigest(effect.effect_payload)) fail('EFFECT_PAYLOAD_DIGEST_MISMATCH');
  if (!isSha(effect.effect_payload.specialist_delta_digest)) fail('INVALID_SPECIALIST_DELTA_DIGEST');
  if (!Array.isArray(effect.effect_payload.governed_object_versions)) fail('GOVERNED_OBJECT_VERSION_ARRAY_REQUIRED');
  if (!Array.isArray(effect.effect_payload.active_pointer_updates)) fail('ACTIVE_POINTER_UPDATE_ARRAY_REQUIRED');

  const seenNew = new Set();
  for (const [i, summary] of effect.effect_payload.governed_object_versions.entries()) {
    exactKeys(summary, SUMMARY_FIELDS, `governed_object_versions.${i}`);
    required(summary, ['object_type','object_id','version','book_project_id','object_digest'], `governed_object_versions.${i}`);
    const meta = OBJECT_META[summary.object_type];
    if (!meta) fail('UNKNOWN_CONTENT_OBJECT_TYPE', String(summary.object_type));
    if (!nonEmpty(summary.object_id) || !nonEmpty(String(summary.version))) fail('INVALID_CONTENT_OBJECT_IDENTITY', summary.object_type);
    if (summary.book_project_id !== parent.book_project.book_project_id) fail('FOREIGN_BOOK_OBJECT', summary.object_type);
    if (!isSha(summary.object_digest)) fail('INVALID_OBJECT_DIGEST', summary.object_type);
    if (own(summary, 'artifact_digest') && summary.artifact_digest !== undefined && !isSha(summary.artifact_digest)) fail('INVALID_OBJECT_DIGEST', summary.object_type);
    const ref = refOf(summary);
    if (!effect.subject_identity_refs.includes(ref)) fail('SUBJECT_IDENTITY_MISMATCH', ref);
    const key = `${summary.object_type}|${ref}`;
    if (seenNew.has(key)) fail('DUPLICATE_CONTENT_OBJECT_VERSION', key);
    seenNew.add(key);
    const existing = findTarget(parent, meta, ref);
    if (existing && !same(existing, canonicalSummary(summary))) fail('IMMUTABLE_OBJECT_VERSION_CONFLICT', ref);
    if (existing) fail('DUPLICATE_CONTENT_OBJECT_VERSION', ref);
  }

  const seenPointer = new Set();
  for (const [i, update] of effect.effect_payload.active_pointer_updates.entries()) {
    exactKeys(update, UPDATE_FIELDS, `active_pointer_updates.${i}`);
    required(update, ['object_type','target_ref'], `active_pointer_updates.${i}`);
    const meta = OBJECT_META[update.object_type];
    if (!meta) fail('UNKNOWN_CONTENT_OBJECT_TYPE', String(update.object_type));
    if (!nonEmpty(update.target_ref)) fail('TARGET_REF_REQUIRED');
    if (!effect.subject_identity_refs.includes(update.target_ref)) fail('SUBJECT_IDENTITY_MISMATCH', update.target_ref);
    if (seenPointer.has(meta.pointer)) fail('DUPLICATE_ACTIVE_POINTER_UPDATE', meta.pointer);
    seenPointer.add(meta.pointer);
  }
  return true;
}

function canonicalSummary(summary) {
  const out = {
    object_id: summary.object_id,
    version: summary.version,
    book_project_id: summary.book_project_id,
    object_digest: summary.object_digest,
  };
  if (own(summary, 'authority_state') && summary.authority_state !== undefined) out.authority_state = summary.authority_state;
  if (own(summary, 'artifact_digest') && summary.artifact_digest !== undefined) out.artifact_digest = summary.artifact_digest;
  return out;
}

function applyAdmissionEffect(parentInput, effectInput, options = {}) {
  const parent = clone(parentInput);
  const effect = clone(effectInput);
  validateAdmissionEffect(parent, effect);
  const fingerprint = base.effectRequestFingerprint(effect);
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
  for (const summary of effect.effect_payload.governed_object_versions) {
    const meta = OBJECT_META[summary.object_type];
    next.governed_objects[meta.collection].push(canonicalSummary(summary));
  }
  for (const update of effect.effect_payload.active_pointer_updates) {
    const meta = OBJECT_META[update.object_type];
    const target = findTarget(next, meta, update.target_ref);
    if (!target) fail('POINTER_TARGET_NOT_ADMITTED', update.target_ref);
    next.active[meta.pointer] = update.target_ref;
  }

  next.state_version = parent.state_version + 1;
  const receiptId = `BCR-${base.sha256({
    book_project_id: parent.book_project.book_project_id,
    effect_request_id: effect.effect_request_id,
    idempotency_key: effect.idempotency_key,
    request_fingerprint: fingerprint,
    pre_state_version: parent.state_version,
    pre_state_digest: parent.state_digest,
  }).slice(0, 32).toUpperCase()}`;
  next.mutation_head = receiptId;
  const sealed = base.sealParent(next);
  base.validateParent(sealed);

  const receipt = {
    receipt_schema_version: base.RECEIPT_SCHEMA_VERSION,
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
  receipt.receipt_digest = base.sha256(receipt);
  return { replay: false, parent_state: sealed, commit_receipt: receipt };
}

function applyEffect(parent, effect, options = {}) {
  if (effect && effect.effect_type === EFFECT_TYPE) return applyAdmissionEffect(parent, effect, options);
  return base.applyEffect(parent, effect, options);
}

module.exports = {
  ...base,
  BookCanonicalParentF5Error,
  F5_EFFECT_TYPE: EFFECT_TYPE,
  F5_OBJECT_META: OBJECT_META,
  validateAdmissionEffect,
  applyAdmissionEffect,
  applyEffect,
};
