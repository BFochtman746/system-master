'use strict';

const currentParent = require('./version-and-rollback.js');
const compatibility = require('./lifecycle-current-parent-compatibility-adapter.js');

const REBIND_ID = 'BOOK-SYSTEM-LIFECYCLE-CURRENT-PARENT-REBIND-001';
const ALLOWED_AUTHORITY_KINDS = new Set([
  'CANONICAL_STATE_MUTATION',
  'INTEGRATION_RUNTIME',
  'AUTHOR_DECISION',
  'EXPORT_RELEASE',
  'VERSION_ROLLBACK',
]);

class LifecycleRebindError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'LifecycleRebindError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new LifecycleRebindError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function text(v) { return typeof v === 'string' && v.trim().length > 0; }
function requireFields(v, fields, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const field of fields) if (!own(v, field)) fail('REQUIRED_FIELD_MISSING', `${label}.${field}`);
}
function authorityReceiptId(receipt) {
  for (const field of ['receipt_id','transition_receipt_id','mutation_receipt_id','decision_receipt_id','release_receipt_id']) {
    if (text(receipt && receipt[field])) return receipt[field];
  }
  return null;
}
function lifecycleHistoryProjection(ledger) {
  return {
    unit_states: clone(ledger.unit_states),
    dependency_edges: clone(ledger.dependency_edges),
    processed_requests: clone(ledger.processed_requests),
    transition_receipts: clone(ledger.transition_receipts),
  };
}
function lifecycleHistoryDigest(ledger) { return currentParent.digest(lifecycleHistoryProjection(ledger)); }
function requestFingerprint(request) { return currentParent.digest(request); }
function ensureCompatibilityMaps(ledger) {
  if (!obj(ledger.compatibility_rebind_receipts)) ledger.compatibility_rebind_receipts = {};
  if (!obj(ledger.compatibility_rebind_requests)) ledger.compatibility_rebind_requests = {};
}
function validateProjectIdentity(preParent, postParent) {
  if (preParent.book_project.book_project_id !== postParent.book_project.book_project_id || preParent.book_project.book_id !== postParent.book_project.book_id) {
    fail('BOOK_PROJECT_IDENTITY_IMMUTABLE');
  }
}
function validateAuthorityReceipt(preParent, postParent, kind, receipt) {
  requireFields(receipt, ['pre_parent_state_version','pre_parent_state_digest','post_parent_state_version','post_parent_state_digest'], 'authority_receipt');
  const id = authorityReceiptId(receipt);
  if (!id) fail('AUTHORITY_RECEIPT_ID_REQUIRED');
  if (receipt.pre_parent_state_version !== preParent.state_version || receipt.pre_parent_state_digest !== preParent.state_digest) fail('AUTHORITY_RECEIPT_PRE_IDENTITY_MISMATCH');
  if (receipt.post_parent_state_version !== postParent.state_version || receipt.post_parent_state_digest !== postParent.state_digest) fail('AUTHORITY_RECEIPT_POST_IDENTITY_MISMATCH');
  if (receipt.authority_kind && receipt.authority_kind !== kind) fail('AUTHORITY_KIND_RECEIPT_MISMATCH');
  if (receipt.lifecycle_mutated === true || receipt.lifecycle_transition_performed === true) fail('LIFECYCLE_MUTATING_AUTHORITY_RECEIPT_FORBIDDEN');
  if (receipt.publication_authorized === true) fail('PUBLICATION_AUTHORITY_RECEIPT_FORBIDDEN');
  return id;
}
function replayOrConflict(ledger, postParent, request) {
  const requests = obj(ledger.compatibility_rebind_requests) ? ledger.compatibility_rebind_requests : {};
  const receipts = obj(ledger.compatibility_rebind_receipts) ? ledger.compatibility_rebind_receipts : {};
  const fp = requestFingerprint(request);
  const prior = requests[request.idempotency_key];
  if (prior) {
    if (prior.request_fingerprint !== fp) fail('IDEMPOTENCY_KEY_CONFLICT');
    if (prior.rebind_request_id !== request.rebind_request_id) fail('IDEMPOTENCY_REQUEST_ID_CONFLICT');
    const receipt = receipts[prior.rebind_receipt_id];
    if (!receipt) fail('REBIND_RECEIPT_MISSING', prior.rebind_receipt_id);
    currentParent.validateParentState(postParent);
    compatibility.validateCompatibleLedger(request.lifecycle_contract, postParent, ledger);
    if (receipt.post_parent_state_version !== postParent.state_version || receipt.post_parent_state_digest !== postParent.state_digest) fail('REPLAY_POST_PARENT_MISMATCH');
    return { replay: true, fingerprint: fp, receipt: clone(receipt) };
  }
  for (const record of Object.values(requests)) {
    if (record && record.rebind_request_id === request.rebind_request_id) fail('REQUEST_ID_CONFLICT');
  }
  return { replay: false, fingerprint: fp };
}

function rebindAfterAuthorizedParentSuccessor({ contract, preParentState, postParentState, lifecycleLedger, request: requestInput }) {
  const preParent = clone(preParentState);
  const postParent = clone(postParentState);
  const ledger = clone(lifecycleLedger);
  const request = clone(requestInput);
  requireFields(request, [
    'rebind_request_id','idempotency_key','actor_class','authority_kind',
    'expected_pre_parent_state_version','expected_pre_parent_state_digest',
    'expected_post_parent_state_version','expected_post_parent_state_digest',
    'expected_lifecycle_ledger_version','expected_lifecycle_ledger_digest','authority_receipt'
  ], 'rebind_request');
  if (!contract || contract.engine_id !== 'BOOK-SYSTEM-LIFECYCLE-TRANSITION-ENGINE-001') fail('LIFECYCLE_CONTRACT_REQUIRED');
  request.lifecycle_contract = contract;

  const replay = replayOrConflict(ledger, postParent, request);
  if (replay.replay) {
    return {
      disposition: 'REPLAY',
      parent_state: postParent,
      lifecycle_ledger: ledger,
      receipt: replay.receipt,
      lifecycle_ledger_digest: compatibility.digestCompatibleLedger(ledger),
    };
  }

  currentParent.validateParentState(preParent);
  currentParent.validateParentState(postParent);
  compatibility.validateCompatibleLedger(contract, preParent, ledger);
  if (request.actor_class !== 'PARENT_SYSTEM') fail('REBIND_AUTHORITY_DENIED', String(request.actor_class));
  if (!ALLOWED_AUTHORITY_KINDS.has(request.authority_kind)) fail('REBIND_AUTHORITY_KIND_DENIED', String(request.authority_kind));
  if (postParent.state_version !== preParent.state_version + 1) fail('POST_PARENT_VERSION_NOT_NEXT');
  validateProjectIdentity(preParent, postParent);
  if (postParent.book_project.status !== preParent.book_project.status) fail('LIFECYCLE_STATUS_CHANGE_FORBIDDEN_IN_REBIND');
  if (request.expected_pre_parent_state_version !== preParent.state_version || request.expected_pre_parent_state_digest !== preParent.state_digest) fail('STALE_PRE_PARENT_IDENTITY');
  if (request.expected_post_parent_state_version !== postParent.state_version || request.expected_post_parent_state_digest !== postParent.state_digest) fail('STALE_POST_PARENT_IDENTITY');
  if (request.expected_lifecycle_ledger_version !== ledger.ledger_version || request.expected_lifecycle_ledger_digest !== compatibility.digestCompatibleLedger(ledger)) fail('STALE_LIFECYCLE_LEDGER_IDENTITY');
  const authorityRef = validateAuthorityReceipt(preParent, postParent, request.authority_kind, request.authority_receipt);

  const preHistoryDigest = lifecycleHistoryDigest(ledger);
  const preLedgerDigest = compatibility.digestCompatibleLedger(ledger);
  const next = clone(ledger);
  ensureCompatibilityMaps(next);
  next.ledger_version += 1;
  next.bound_parent_state_version = postParent.state_version;
  next.bound_parent_state_digest = postParent.state_digest;

  const receiptId = `LIFECYCLE-REBIND-RECEIPT:${currentParent.digest({
    rebind_id: REBIND_ID,
    request_id: request.rebind_request_id,
    authority_kind: request.authority_kind,
    authority_receipt_ref: authorityRef,
    pre_parent: preParent.state_digest,
    post_parent: postParent.state_digest,
    pre_ledger: preLedgerDigest,
  }).slice(0,32).toUpperCase()}`;
  const receipt = {
    rebind_receipt_id: receiptId,
    rebind_request_id: request.rebind_request_id,
    idempotency_key: request.idempotency_key,
    authority_kind: request.authority_kind,
    authority_receipt_ref: authorityRef,
    authority_receipt_digest: currentParent.digest(request.authority_receipt),
    pre_parent_state_version: preParent.state_version,
    pre_parent_state_digest: preParent.state_digest,
    post_parent_state_version: postParent.state_version,
    post_parent_state_digest: postParent.state_digest,
    pre_lifecycle_ledger_version: ledger.ledger_version,
    pre_lifecycle_ledger_digest: preLedgerDigest,
    post_lifecycle_ledger_version: next.ledger_version,
    preserved_lifecycle_history_digest: preHistoryDigest,
    lifecycle_status: preParent.book_project.status,
    lifecycle_transition_performed: false,
    publication_authorized: false,
  };
  next.compatibility_rebind_receipts[receiptId] = clone(receipt);
  next.compatibility_rebind_requests[request.idempotency_key] = {
    rebind_request_id: request.rebind_request_id,
    request_fingerprint: replay.fingerprint,
    rebind_receipt_id: receiptId,
  };

  if (lifecycleHistoryDigest(next) !== preHistoryDigest) fail('LIFECYCLE_HISTORY_MUTATED_DURING_REBIND');
  compatibility.validateCompatibleLedger(contract, postParent, next);
  return {
    disposition: 'COMMITTED',
    parent_state: postParent,
    lifecycle_ledger: next,
    receipt: clone(receipt),
    lifecycle_ledger_digest: compatibility.digestCompatibleLedger(next),
  };
}

module.exports = {
  REBIND_ID,
  ALLOWED_AUTHORITY_KINDS,
  LifecycleRebindError,
  lifecycleHistoryProjection,
  lifecycleHistoryDigest,
  requestFingerprint,
  rebindAfterAuthorizedParentSuccessor,
};
