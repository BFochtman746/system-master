'use strict';

const crypto = require('crypto');

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_REF = /^[A-Za-z0-9._:/#@-]{1,320}$/;
const REQUIRED_RETENTION_CLASSES = Object.freeze([
  'SEMANTIC_BACKUP_SET',
  'PRESERVATION_RECEIPTS',
  'BOOK_LINEAGE'
]);

class BookSemanticOfflineContinuityError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookSemanticOfflineContinuityError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookSemanticOfflineContinuityError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (isObject(v)) return Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])]));
  return v;
}
function digest(v) { return crypto.createHash('sha256').update(JSON.stringify(stable(v)), 'utf8').digest('hex'); }
function requireRef(v, field) { if (typeof v !== 'string' || !SAFE_REF.test(v)) fail('INVALID_REFERENCE', field); }
function requireDigest(v, field) { if (!SHA256.test(String(v || ''))) fail('INVALID_SHA256', field); }
function sameSubject(a, b) {
  return Boolean(a && b && a.canonical_digest === b.canonical_digest && a.manuscript_digest === b.manuscript_digest);
}

function validateSemanticAnchor(anchor) {
  if (!isObject(anchor)) fail('SEMANTIC_ANCHOR_REQUIRED');
  requireRef(anchor.book_project_id, 'book_project_id');
  requireRef(anchor.semantic_manifest_id, 'semantic_manifest_id');
  requireDigest(anchor.semantic_manifest_digest, 'semantic_manifest_digest');
  if (!isObject(anchor.subject)) fail('SUBJECT_REQUIRED');
  requireRef(anchor.subject.canonical_state_ref, 'canonical_state_ref');
  requireDigest(anchor.subject.canonical_digest, 'canonical_digest');
  requireRef(anchor.subject.manuscript_ref, 'manuscript_ref');
  requireDigest(anchor.subject.manuscript_digest, 'manuscript_digest');
  return true;
}

function createOfflineSession({ session_id, semantic_anchor, opened_at, local_checkpoint_ref }) {
  requireRef(session_id, 'session_id');
  validateSemanticAnchor(semantic_anchor);
  requireRef(local_checkpoint_ref, 'local_checkpoint_ref');
  if (typeof opened_at !== 'string' || !opened_at) fail('OPENED_AT_REQUIRED');
  const payload = {
    session_schema_version: 1,
    session_id,
    owner_path: 'SYSTEM_MASTER/BOOK',
    component_id: 'BOOK-COMP-12',
    book_project_id: semantic_anchor.book_project_id,
    base_semantic_manifest_id: semantic_anchor.semantic_manifest_id,
    base_semantic_manifest_digest: semantic_anchor.semantic_manifest_digest,
    base_subject: clone(semantic_anchor.subject),
    local_checkpoint_ref,
    opened_at,
    auto_apply_allowed: false,
    canonical_effect_allowed: false
  };
  return Object.freeze({ ...payload, session_digest: digest(payload) });
}

function validateOfflineSession(session) {
  if (!isObject(session)) fail('OFFLINE_SESSION_REQUIRED');
  if (session.owner_path !== 'SYSTEM_MASTER/BOOK' || session.component_id !== 'BOOK-COMP-12') fail('OFFLINE_SESSION_OWNER_MISMATCH');
  requireRef(session.session_id, 'session_id');
  requireRef(session.book_project_id, 'book_project_id');
  requireRef(session.base_semantic_manifest_id, 'base_semantic_manifest_id');
  requireDigest(session.base_semantic_manifest_digest, 'base_semantic_manifest_digest');
  validateSemanticAnchor({
    book_project_id: session.book_project_id,
    semantic_manifest_id: session.base_semantic_manifest_id,
    semantic_manifest_digest: session.base_semantic_manifest_digest,
    subject: session.base_subject
  });
  requireRef(session.local_checkpoint_ref, 'local_checkpoint_ref');
  if (typeof session.opened_at !== 'string' || !session.opened_at) fail('OPENED_AT_REQUIRED');
  if (session.auto_apply_allowed !== false || session.canonical_effect_allowed !== false) fail('OFFLINE_CANONICAL_EFFECT_FORBIDDEN');
  requireDigest(session.session_digest, 'session_digest');
  const payload = clone(session);
  delete payload.session_digest;
  if (digest(payload) !== session.session_digest) fail('OFFLINE_SESSION_DIGEST_MISMATCH');
  return true;
}

function reconcileOfflineSession({ session, reconnect_anchor, offline_delta_digest }) {
  validateOfflineSession(session);
  validateSemanticAnchor(reconnect_anchor);
  requireDigest(offline_delta_digest, 'offline_delta_digest');
  if (session.book_project_id !== reconnect_anchor.book_project_id) fail('OFFLINE_PROJECT_IDENTITY_MISMATCH');
  const exactManifest = session.base_semantic_manifest_digest === reconnect_anchor.semantic_manifest_digest;
  const exactSubject = sameSubject(session.base_subject, reconnect_anchor.subject);
  const sameBase = exactManifest && exactSubject;
  const payload = {
    reconciliation_schema_version: 1,
    owner_path: 'SYSTEM_MASTER/BOOK',
    component_id: 'BOOK-COMP-12',
    session_id: session.session_id,
    base_semantic_manifest_digest: session.base_semantic_manifest_digest,
    reconnect_semantic_manifest_digest: reconnect_anchor.semantic_manifest_digest,
    offline_delta_digest,
    exact_manifest_base: exactManifest,
    exact_subject_base: exactSubject,
    disposition: sameBase ? 'ELIGIBLE_FOR_NORMAL_ADMISSION' : 'RECONCILIATION_REQUIRED',
    normal_admission_allowed: sameBase,
    auto_apply_allowed: false,
    canonical_effect_allowed: false
  };
  return Object.freeze({ ...payload, reconciliation_digest: digest(payload) });
}

function validateRetentionPolicy(policy) {
  if (!isObject(policy)) fail('RETENTION_POLICY_REQUIRED');
  requireRef(policy.policy_id, 'policy_id');
  requireRef(policy.core_physical_policy_ref, 'core_physical_policy_ref');
  if (!Array.isArray(policy.retained_semantic_classes)) fail('RETAINED_SEMANTIC_CLASSES_REQUIRED');
  const set = new Set(policy.retained_semantic_classes);
  if (set.size !== policy.retained_semantic_classes.length) fail('DUPLICATE_RETAINED_SEMANTIC_CLASS');
  for (const required of REQUIRED_RETENTION_CLASSES) if (!set.has(required)) fail('RETAINED_SEMANTIC_CLASS_MISSING', required);
  if (policy.retrievability_verification_required !== true) fail('RETRIEVABILITY_VERIFICATION_REQUIRED');
  if (policy.destructive_restore_drill_required !== true) fail('DESTRUCTIVE_RESTORE_DRILL_REQUIRED');
  if (policy.retain_book_lineage !== true) fail('BOOK_LINEAGE_RETENTION_REQUIRED');
  if (policy.core_executes_physical_retention !== true) fail('CORE_PHYSICAL_RETENTION_OWNERSHIP_REQUIRED');
  if (policy.book_executes_physical_retention !== false) fail('BOOK_PHYSICAL_RETENTION_FORBIDDEN');
  return true;
}

function createLineageReentryAnchor({ semantic_anchor, preservation_receipt_ref, continuation_anchor, reentry_anchor, created_at }) {
  validateSemanticAnchor(semantic_anchor);
  requireRef(preservation_receipt_ref, 'preservation_receipt_ref');
  requireRef(continuation_anchor, 'continuation_anchor');
  requireRef(reentry_anchor, 'reentry_anchor');
  if (typeof created_at !== 'string' || !created_at) fail('CREATED_AT_REQUIRED');
  const payload = {
    anchor_schema_version: 1,
    owner_path: 'SYSTEM_MASTER/BOOK',
    component_id: 'BOOK-COMP-12',
    book_project_id: semantic_anchor.book_project_id,
    semantic_manifest_digest: semantic_anchor.semantic_manifest_digest,
    subject: clone(semantic_anchor.subject),
    preservation_receipt_ref,
    continuation_anchor,
    reentry_anchor,
    created_at,
    release_authority_granted: false,
    distribution_authority_granted: false,
    canonical_effect_allowed: false
  };
  return Object.freeze({ ...payload, anchor_digest: digest(payload) });
}

module.exports = Object.freeze({
  REQUIRED_RETENTION_CLASSES,
  BookSemanticOfflineContinuityError,
  validateSemanticAnchor,
  createOfflineSession,
  validateOfflineSession,
  reconcileOfflineSession,
  validateRetentionPolicy,
  createLineageReentryAnchor
});
