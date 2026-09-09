'use strict';

const crypto = require('crypto');
const lifecycleV1 = require('./lifecycle-transition-engine-runtime.js');
const currentParent = require('./version-and-rollback-core.js');

const ADAPTER_ID = 'BOOK-SYSTEM-LIFECYCLE-CURRENT-PARENT-COMPATIBILITY-ADAPTER-001';

class LifecycleCompatibilityError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'LifecycleCompatibilityError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new LifecycleCompatibilityError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function sha256(v) { return crypto.createHash('sha256').update(v).digest('hex'); }
function externalRequestFingerprint(request) { return sha256(Buffer.from(lifecycleV1.stableStringify(request), 'utf8')); }
function digestCompatibleLedger(ledger) { return lifecycleV1.digestLedger(ledger); }

function keyed(items, keyFn, collection) {
  if (!Array.isArray(items)) fail('CURRENT_PARENT_COLLECTION_ARRAY_REQUIRED', collection);
  const out = {};
  for (const item of items) {
    if (!obj(item)) fail('CURRENT_PARENT_COLLECTION_ITEM_REQUIRED', collection);
    const key = keyFn(item);
    if (!nonEmpty(key)) fail('CURRENT_PARENT_COLLECTION_ID_REQUIRED', collection);
    if (own(out, key)) fail('DUPLICATE_PROJECTED_ID', `${collection}:${key}`);
    out[key] = clone(item);
  }
  return out;
}

function manuscriptProjectionKey(item) {
  if (!nonEmpty(String(item.manuscript_id || '')) || !nonEmpty(String(item.version_id || ''))) return '';
  const id = String(item.manuscript_id);
  const version = String(item.version_id);
  return version.startsWith(`${id}:`) ? version : `${id}:${version}`;
}

function projectParentForV1(parentState) {
  currentParent.validateParentState(parentState);
  const projected = clone(parentState);
  delete projected.state_digest;
  projected.governing_briefs = keyed(parentState.governing_briefs, x => String(x.brief_id || ''), 'governing_briefs');
  projected.canon_manifests = keyed(parentState.canon_manifests, x => String(x.canon_manifest_id || ''), 'canon_manifests');
  projected.story_bibles = keyed(parentState.story_bibles, x => String(x.story_bible_id || ''), 'story_bibles');
  projected.book_plans = keyed(parentState.book_plans, x => String(x.plan_id || ''), 'book_plans');
  projected.manuscripts = keyed(parentState.manuscripts, manuscriptProjectionKey, 'manuscripts');
  projected.research_evidence_links = keyed(parentState.research_evidence_links, x => String(x.link_id || ''), 'research_evidence_links');
  projected.author_decisions = keyed(parentState.author_decisions, x => String(x.decision_id || ''), 'author_decisions');
  projected.integration_proposals = keyed(parentState.integration_proposals, x => String(x.proposal_id || ''), 'integration_proposals');
  projected.export_releases = keyed(parentState.export_releases, x => String(x.release_id || ''), 'export_releases');
  return projected;
}

function projectLedgerForV1(contract, parentState, lifecycleLedger) {
  const projectedParent = projectParentForV1(parentState);
  const projectedLedger = clone(lifecycleLedger);
  projectedLedger.bound_parent_state_version = projectedParent.state_version;
  projectedLedger.bound_parent_state_digest = lifecycleV1.digestParentState(projectedParent);
  lifecycleV1.validateLedger(contract, projectedParent, projectedLedger);
  return { projectedParent, projectedLedger };
}

function validateCompatibleLedger(contract, parentState, lifecycleLedger) {
  currentParent.validateParentState(parentState);
  if (!obj(lifecycleLedger)) fail('LIFECYCLE_LEDGER_REQUIRED');
  if (lifecycleLedger.bound_parent_state_version !== parentState.state_version) fail('LEDGER_PARENT_VERSION_BINDING_MISMATCH');
  if (lifecycleLedger.bound_parent_state_digest !== parentState.state_digest) fail('LEDGER_PARENT_DIGEST_BINDING_MISMATCH');
  projectLedgerForV1(contract, parentState, lifecycleLedger);
  return true;
}

function createCompatibleLedger(contract, parentState, options = {}) {
  currentParent.validateParentState(parentState);
  const ledger = {
    ledger_schema_version: contract.engine_version,
    ledger_version: 1,
    bound_parent_state_version: parentState.state_version,
    bound_parent_state_digest: parentState.state_digest,
    unit_states: clone(options.unit_states || {}),
    dependency_edges: clone(options.dependency_edges || []),
    processed_requests: {},
    transition_receipts: {},
  };
  validateCompatibleLedger(contract, parentState, ledger);
  return ledger;
}

function checkExternalReplay(lifecycleLedger, request) {
  const fingerprint = externalRequestFingerprint(request);
  const prior = lifecycleLedger.processed_requests && lifecycleLedger.processed_requests[request.idempotency_key];
  if (prior) {
    if (prior.request_fingerprint !== fingerprint) throw new lifecycleV1.TransitionError('IDEMPOTENCY_KEY_CONFLICT');
    if (prior.transition_request_id !== request.transition_request_id) throw new lifecycleV1.TransitionError('IDEMPOTENCY_REQUEST_ID_CONFLICT');
    const receipt = lifecycleLedger.transition_receipts[prior.transition_receipt_ref];
    if (!receipt) throw new lifecycleV1.TransitionError('PROCESSED_REQUEST_RECEIPT_MISSING', prior.transition_receipt_ref);
    return { replay: true, fingerprint, receipt: clone(receipt) };
  }
  for (const entry of Object.values(lifecycleLedger.processed_requests || {})) {
    if (entry.transition_request_id === request.transition_request_id) throw new lifecycleV1.TransitionError('REQUEST_ID_CONFLICT');
  }
  return { replay: false, fingerprint };
}

function validateExternalRequestIdentity(parentState, lifecycleLedger, request) {
  if (!obj(request)) fail('TRANSITION_REQUEST_REQUIRED');
  if (request.expected_parent_state_version !== parentState.state_version) throw new lifecycleV1.TransitionError('PARENT_STATE_VERSION_MISMATCH');
  if (request.expected_parent_state_digest !== parentState.state_digest) throw new lifecycleV1.TransitionError('PARENT_STATE_DIGEST_MISMATCH');
  if (request.expected_ledger_version !== lifecycleLedger.ledger_version) throw new lifecycleV1.TransitionError('LEDGER_VERSION_MISMATCH');
  if (request.expected_ledger_digest !== digestCompatibleLedger(lifecycleLedger)) throw new lifecycleV1.TransitionError('LEDGER_DIGEST_MISMATCH');
}

function normalizeProjectedDelta(pre, post, scope) {
  const normalized = clone(post);
  if (scope === 'PROJECT') {
    normalized.state_version = pre.state_version;
    if (!obj(normalized.book_project) || !obj(pre.book_project)) fail('PROJECT_OBJECT_REQUIRED');
    normalized.book_project.status = pre.book_project.status;
  }
  return normalized;
}

function assertDelegatedParentDelta(preProjected, postProjected, request) {
  const normalized = normalizeProjectedDelta(preProjected, postProjected, request.scope);
  if (lifecycleV1.stableStringify(normalized) !== lifecycleV1.stableStringify(preProjected)) {
    fail('LIFECYCLE_V1_PARENT_DELTA_OUT_OF_SCOPE', request.scope);
  }
  if (request.scope === 'UNIT') {
    if (postProjected.state_version !== preProjected.state_version || postProjected.book_project.status !== preProjected.book_project.status) {
      fail('LIFECYCLE_V1_UNIT_PARENT_DELTA_FORBIDDEN');
    }
  } else if (request.scope === 'PROJECT') {
    if (postProjected.state_version !== preProjected.state_version + 1) fail('LIFECYCLE_V1_PROJECT_VERSION_DELTA_INVALID');
  }
}

function buildCurrentPostParent(parentState, delegatedPost, request) {
  if (request.scope === 'UNIT') return clone(parentState);
  const post = clone(parentState);
  delete post.state_digest;
  post.state_version = delegatedPost.state_version;
  post.book_project.status = delegatedPost.book_project.status;
  return currentParent.sealState(post);
}

function adaptReceipt(legacyReceipt, parentState, postParent, preLedger, postLedger, externalFingerprint) {
  const adapted = clone(legacyReceipt);
  const preLedgerDigest = digestCompatibleLedger(preLedger);
  adapted.pre_parent_state_version = parentState.state_version;
  adapted.pre_parent_state_digest = parentState.state_digest;
  adapted.post_parent_state_version = postParent.state_version;
  adapted.post_parent_state_digest = postParent.state_digest;
  adapted.rollback_parent_state_version = parentState.state_version;
  adapted.rollback_parent_state_digest = parentState.state_digest;
  adapted.pre_ledger_version = preLedger.ledger_version;
  adapted.pre_ledger_digest = preLedgerDigest;
  adapted.rollback_ledger_version = preLedger.ledger_version;
  adapted.rollback_ledger_digest = preLedgerDigest;
  adapted.post_ledger_version = postLedger.ledger_version;
  adapted.post_ledger_digest = '__PENDING__';
  adapted.compatibility_adapter_id = ADAPTER_ID;
  adapted.external_request_fingerprint = externalFingerprint;
  adapted.legacy_v1_receipt_digest = sha256(Buffer.from(lifecycleV1.stableStringify(legacyReceipt), 'utf8'));
  adapted.legacy_v1_pre_parent_digest = legacyReceipt.pre_parent_state_digest;
  adapted.legacy_v1_post_parent_digest = legacyReceipt.post_parent_state_digest;
  return adapted;
}

function applyTransition(contract, parentStateInput, lifecycleLedgerInput, requestInput) {
  const parentState = clone(parentStateInput);
  const lifecycleLedger = clone(lifecycleLedgerInput);
  const request = clone(requestInput);
  currentParent.validateParentState(parentState);
  validateCompatibleLedger(contract, parentState, lifecycleLedger);

  const replay = checkExternalReplay(lifecycleLedger, request);
  if (replay.replay) {
    return {
      disposition: 'REPLAY',
      parent_state: parentState,
      lifecycle_ledger: lifecycleLedger,
      receipt: replay.receipt,
      parent_state_digest: parentState.state_digest,
      lifecycle_ledger_digest: digestCompatibleLedger(lifecycleLedger),
    };
  }
  validateExternalRequestIdentity(parentState, lifecycleLedger, request);

  const { projectedParent, projectedLedger } = projectLedgerForV1(contract, parentState, lifecycleLedger);
  const delegatedRequest = clone(request);
  delegatedRequest.expected_parent_state_version = projectedParent.state_version;
  delegatedRequest.expected_parent_state_digest = lifecycleV1.digestParentState(projectedParent);
  delegatedRequest.expected_ledger_version = projectedLedger.ledger_version;
  delegatedRequest.expected_ledger_digest = lifecycleV1.digestLedger(projectedLedger);

  const delegated = lifecycleV1.applyTransition(contract, projectedParent, projectedLedger, delegatedRequest);
  if (delegated.disposition !== 'COMMITTED') fail('UNEXPECTED_DELEGATED_DISPOSITION', String(delegated.disposition));
  assertDelegatedParentDelta(projectedParent, delegated.parent_state, request);

  const postParent = buildCurrentPostParent(parentState, delegated.parent_state, request);
  const postLedger = clone(delegated.lifecycle_ledger);
  postLedger.bound_parent_state_version = postParent.state_version;
  postLedger.bound_parent_state_digest = postParent.state_digest;

  const adaptedReceipt = adaptReceipt(delegated.receipt, parentState, postParent, lifecycleLedger, postLedger, replay.fingerprint);
  postLedger.transition_receipts[adaptedReceipt.transition_receipt_id] = adaptedReceipt;
  postLedger.processed_requests[request.idempotency_key] = {
    transition_request_id: request.transition_request_id,
    request_fingerprint: replay.fingerprint,
    transition_receipt_ref: adaptedReceipt.transition_receipt_id,
  };
  adaptedReceipt.post_ledger_digest = digestCompatibleLedger(postLedger);
  postLedger.transition_receipts[adaptedReceipt.transition_receipt_id] = adaptedReceipt;
  validateCompatibleLedger(contract, postParent, postLedger);

  return {
    disposition: 'COMMITTED',
    parent_state: postParent,
    lifecycle_ledger: postLedger,
    receipt: clone(adaptedReceipt),
    parent_state_digest: postParent.state_digest,
    lifecycle_ledger_digest: digestCompatibleLedger(postLedger),
    rollback: {
      parent_state: clone(parentState),
      lifecycle_ledger: clone(lifecycleLedger),
      parent_state_digest: parentState.state_digest,
      lifecycle_ledger_digest: digestCompatibleLedger(lifecycleLedger),
    },
  };
}

module.exports = {
  ADAPTER_ID,
  LifecycleCompatibilityError,
  externalRequestFingerprint,
  digestCompatibleLedger,
  projectParentForV1,
  projectLedgerForV1,
  validateCompatibleLedger,
  createCompatibleLedger,
  applyTransition,
};
