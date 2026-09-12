'use strict';

const prior = require('./canonical-parent-v2-f5-core.js');

const PROJECT_STATUSES = Object.freeze([
  'CREATED',
  'BRIEFING',
  'PLANNING',
  'DRAFTING',
  'STRUCTURAL_REVIEW',
  'PROSE_REFINEMENT',
  'BOOK_EVALUATION',
  'AUTHOR_REVIEW',
  'FINALIZATION',
  'EXPORT_FROZEN',
  'PUBLISHED_OR_DELIVERED',
  'ARCHIVED',
]);

const PROJECT_TRANSITIONS = Object.freeze({
  CREATED: Object.freeze(['BRIEFING']),
  BRIEFING: Object.freeze(['PLANNING', 'ARCHIVED']),
  PLANNING: Object.freeze(['DRAFTING', 'BRIEFING', 'ARCHIVED']),
  DRAFTING: Object.freeze(['STRUCTURAL_REVIEW', 'PLANNING', 'ARCHIVED']),
  STRUCTURAL_REVIEW: Object.freeze(['DRAFTING', 'PROSE_REFINEMENT', 'ARCHIVED']),
  PROSE_REFINEMENT: Object.freeze(['STRUCTURAL_REVIEW', 'BOOK_EVALUATION', 'ARCHIVED']),
  BOOK_EVALUATION: Object.freeze(['PROSE_REFINEMENT', 'AUTHOR_REVIEW', 'ARCHIVED']),
  AUTHOR_REVIEW: Object.freeze(['PROSE_REFINEMENT', 'FINALIZATION', 'ARCHIVED']),
  FINALIZATION: Object.freeze(['AUTHOR_REVIEW', 'EXPORT_FROZEN', 'ARCHIVED']),
  EXPORT_FROZEN: Object.freeze(['FINALIZATION', 'PUBLISHED_OR_DELIVERED', 'ARCHIVED']),
  PUBLISHED_OR_DELIVERED: Object.freeze(['ARCHIVED']),
  ARCHIVED: Object.freeze([]),
});

const STATUS_SET = new Set(PROJECT_STATUSES);

class BookCanonicalParentF6Error extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookCanonicalParentF6Error';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookCanonicalParentF6Error(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }

function validateProjectStatus(status) {
  if (!STATUS_SET.has(status)) fail('INVALID_PROJECT_STATUS', String(status));
  return true;
}

function normalizeForPriorValidation(parentInput) {
  const parent = clone(parentInput);
  if (!parent || !parent.book_project) fail('OBJECT_REQUIRED', 'book_project');
  parent.book_project.status = 'PLANNING';
  return prior.sealParent(parent);
}

function validateParent(parentInput) {
  const parent = clone(parentInput);
  if (!parent || !parent.book_project) fail('OBJECT_REQUIRED', 'parent');
  if (prior.computeStateDigest(parent) !== parent.state_digest) fail('PARENT_STATE_DIGEST_MISMATCH');
  validateProjectStatus(parent.book_project.status);
  const normalized = normalizeForPriorValidation(parent);
  prior.validateParent(normalized);
  return true;
}

function normalizedEffect(parent, effect) {
  const normalizedParent = normalizeForPriorValidation(parent);
  const normalized = clone(effect);
  normalized.expected_parent_state_version = normalizedParent.state_version;
  normalized.expected_parent_state_digest = normalizedParent.state_digest;
  return { normalizedParent, normalizedEffect: normalized };
}

function validateEffectEnvelope(parentInput, effectInput) {
  const parent = clone(parentInput);
  const effect = clone(effectInput);
  validateParent(parent);
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)) fail('OBJECT_REQUIRED', 'effect');
  if (effect.expected_parent_state_version !== parent.state_version) fail('PARENT_STATE_VERSION_CONFLICT');
  if (effect.expected_parent_state_digest !== parent.state_digest) fail('PARENT_STATE_DIGEST_CONFLICT');
  const { normalizedParent, normalizedEffect: normalized } = normalizedEffect(parent, effect);
  if (effect.effect_type === prior.F5_EFFECT_TYPE) prior.validateAdmissionEffect(normalizedParent, normalized);
  else prior.validateEffectEnvelope(normalizedParent, normalized);
  return true;
}

function receiptFor(parent, effect, nextInput) {
  const next = clone(nextInput);
  const fingerprint = prior.effectRequestFingerprint(effect);
  const receiptId = `BCR-${prior.sha256({
    book_project_id: parent.book_project.book_project_id,
    effect_request_id: effect.effect_request_id,
    idempotency_key: effect.idempotency_key,
    request_fingerprint: fingerprint,
    pre_state_version: parent.state_version,
    pre_state_digest: parent.state_digest,
  }).slice(0, 32).toUpperCase()}`;
  next.mutation_head = receiptId;
  const sealed = prior.sealParent(next);
  validateParent(sealed);
  const receipt = {
    receipt_schema_version: prior.RECEIPT_SCHEMA_VERSION,
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
  receipt.receipt_digest = prior.sha256(receipt);
  return { parent_state: sealed, commit_receipt: receipt };
}

function replayOrConflict(parent, effect, options) {
  if (!options || !options.prior_receipt) return null;
  const priorReceipt = options.prior_receipt;
  if (priorReceipt.effect_request_id !== effect.effect_request_id && priorReceipt.idempotency_key !== effect.idempotency_key) return null;
  if (priorReceipt.effect_request_id !== effect.effect_request_id) fail('IDEMPOTENCY_REQUEST_ID_CONFLICT');
  if (priorReceipt.idempotency_key !== effect.idempotency_key) fail('REQUEST_IDEMPOTENCY_CONFLICT');
  if (priorReceipt.request_fingerprint !== prior.effectRequestFingerprint(effect)) fail('IDEMPOTENCY_KEY_CONFLICT');
  const replayParent = clone(options.prior_parent_state || parent);
  validateParent(replayParent);
  return { replay: true, parent_state: replayParent, commit_receipt: clone(priorReceipt) };
}

function applyLifecycleEffect(parent, effect) {
  const toStatus = effect.effect_payload && effect.effect_payload.to_status;
  validateProjectStatus(toStatus);
  const fromStatus = parent.book_project.status;
  const allowed = PROJECT_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) fail('ILLEGAL_PROJECT_TRANSITION', `${fromStatus}->${toStatus}`);
  if (!Array.isArray(effect.subject_identity_refs) || !effect.subject_identity_refs.includes(parent.book_project.book_project_id)) {
    fail('SUBJECT_IDENTITY_MISMATCH', parent.book_project.book_project_id);
  }
  const next = clone(parent);
  next.book_project.status = toStatus;
  next.state_version = parent.state_version + 1;
  return receiptFor(parent, effect, next);
}

function applyPriorEffectUnderRecoveredStatus(parent, effect) {
  const { normalizedParent, normalizedEffect: normalized } = normalizedEffect(parent, effect);
  const delegated = prior.applyEffect(normalizedParent, normalized);
  const next = clone(delegated.parent_state);
  next.book_project.status = parent.book_project.status;
  next.state_version = parent.state_version + 1;
  return receiptFor(parent, effect, next);
}

function applyEffect(parentInput, effectInput, options = {}) {
  const parent = clone(parentInput);
  const effect = clone(effectInput);
  validateParent(parent);
  validateEffectEnvelope(parent, effect);

  const replay = replayOrConflict(parent, effect, options);
  if (replay) return replay;

  let committed;
  if (effect.effect_type === 'ADVANCE_PROJECT_STATUS') committed = applyLifecycleEffect(parent, effect);
  else committed = applyPriorEffectUnderRecoveredStatus(parent, effect);

  if (committed.parent_state.book_project.book_project_id !== parent.book_project.book_project_id ||
      committed.parent_state.book_project.book_id !== parent.book_project.book_id) {
    fail('BOOK_PROJECT_IDENTITY_MUTATION_FORBIDDEN');
  }
  return { replay: false, ...committed };
}

function legalProjectTransition(fromStatus, toStatus) {
  validateProjectStatus(fromStatus);
  validateProjectStatus(toStatus);
  return (PROJECT_TRANSITIONS[fromStatus] || []).includes(toStatus);
}

module.exports = {
  ...prior,
  BookCanonicalParentF6Error,
  PROJECT_STATUSES,
  PROJECT_TRANSITIONS,
  validateProjectStatus,
  legalProjectTransition,
  validateParent,
  validateEffectEnvelope,
  applyEffect,
};
