'use strict';

const crypto = require('crypto');
const core = require('./lifecycle-transition-engine');

function fingerprint(request) {
  return crypto.createHash('sha256').update(core.stableStringify(request), 'utf8').digest('hex');
}

function applyTransition(contract, parentState, lifecycleLedger, request) {
  core.validateLedger(contract, parentState, lifecycleLedger);
  const prior = lifecycleLedger.processed_requests && lifecycleLedger.processed_requests[request.idempotency_key];
  if (prior) {
    const currentFingerprint = fingerprint(request);
    if (prior.request_fingerprint !== currentFingerprint) {
      throw new core.TransitionError('IDEMPOTENCY_KEY_CONFLICT');
    }
    if (prior.transition_request_id !== request.transition_request_id) {
      throw new core.TransitionError('IDEMPOTENCY_REQUEST_ID_CONFLICT');
    }
    const receipt = lifecycleLedger.transition_receipts[prior.transition_receipt_ref];
    if (!receipt) throw new core.TransitionError('PROCESSED_REQUEST_RECEIPT_MISSING', prior.transition_receipt_ref);
    return {
      disposition: 'REPLAY',
      parent_state: JSON.parse(JSON.stringify(parentState)),
      lifecycle_ledger: JSON.parse(JSON.stringify(lifecycleLedger)),
      receipt: JSON.parse(JSON.stringify(receipt)),
      parent_state_digest: core.digestParentState(parentState),
      lifecycle_ledger_digest: core.digestLedger(lifecycleLedger),
    };
  }
  return core.applyTransition(contract, parentState, lifecycleLedger, request);
}

module.exports = {
  ...core,
  applyTransition,
};
