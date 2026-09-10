'use strict';

const contentAdmission = require('./content-object-admission-core.js');
const authorQueue = require('./author-decision-queue.js');
const currentSubjectGuard = require('./author-decision-current-subject-guard.js');

const GUARD_ID = 'BOOK-SYSTEM-CONTENT-ADMISSION-AUTHOR-DECISION-APPLICABILITY-GUARD-004';
const AFFIRMATIVE = new Set(['APPROVE', 'APPROVED', 'ACCEPT', 'ACCEPTED', 'PROMOTE', 'PROMOTED', 'YES', true]);

class ContentAdmissionAuthorDecisionApplicabilityError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'ContentAdmissionAuthorDecisionApplicabilityError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new ContentAdmissionAuthorDecisionApplicabilityError(code, detail); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function stable(v) { return authorQueue.stable(v); }
function digest(v) { return authorQueue.digest(v); }
function exactRefs(refs) {
  if (!Array.isArray(refs) || refs.length === 0) fail('REQUIRED_SUBJECT_IDENTITY_REFS_MISSING');
  return refs.slice().sort((a, b) => stable(a).localeCompare(stable(b)));
}
function sameRefs(a, b) { return stable(exactRefs(a)) === stable(exactRefs(b)); }
function requiredOperationIndexes(request) {
  if (!obj(request) || !Array.isArray(request.operations) || request.operations.length === 0) fail('CONTENT_ADMISSION_REQUEST_REQUIRED');
  const indexes = [];
  request.operations.forEach((op, index) => {
    if (obj(op) && op.requires_author_decision === true) indexes.push(index);
  });
  return indexes;
}
function canonicalDecision(parentState, decisionId) {
  const item = Array.isArray(parentState && parentState.author_decisions)
    ? parentState.author_decisions.find(d => d && d.decision_id === decisionId)
    : null;
  if (!item) fail('CANONICAL_AUTHOR_DECISION_NOT_FOUND', String(decisionId));
  if (item.status !== 'APPROVED' || !AFFIRMATIVE.has(item.author_choice)) fail('CANONICAL_AUTHOR_DECISION_NOT_APPROVED', decisionId);
  return item;
}
function receiptFor(queueLedger, receiptId) {
  if (!nonEmpty(receiptId)) fail('RESOLUTION_RECEIPT_ID_REQUIRED');
  const receipt = queueLedger.resolution_receipts && queueLedger.resolution_receipts[receiptId];
  if (!receipt) fail('RESOLUTION_RECEIPT_MISSING', receiptId);
  return receipt;
}
function validateReceiptIntegrity(queueLedger, receipt) {
  if (receipt.receipt_id !== undefined && receipt.receipt_id !== receipt.decision_receipt_id && receipt.decision_receipt_id !== undefined) {
    fail('RESOLUTION_RECEIPT_ID_INCONSISTENT', String(receipt.receipt_id));
  }
  const snapshot = queueLedger.decision_request_snapshots && queueLedger.decision_request_snapshots[receipt.decision_request_id];
  if (!snapshot) fail('RESOLUTION_DECISION_REQUEST_SNAPSHOT_MISSING', String(receipt.decision_request_id));
  if (authorQueue.digestDecisionRequest(snapshot) !== receipt.decision_request_digest) fail('RESOLUTION_DECISION_REQUEST_DIGEST_MISMATCH', receipt.decision_request_id);
  if (!sameRefs(snapshot.subject_identity_refs, receipt.subject_identity_refs)) fail('RESOLUTION_RECEIPT_SNAPSHOT_SUBJECT_MISMATCH', receipt.decision_request_id);
  if (snapshot.decision_type !== receipt.decision_type) fail('RESOLUTION_RECEIPT_DECISION_TYPE_MISMATCH', receipt.decision_request_id);
  return snapshot;
}
function validateBinding({ parentState, queueLedger, request, operationIndex, binding }) {
  if (!obj(binding)) fail('APPLICABILITY_BINDING_REQUIRED', String(operationIndex));
  if (binding.operation_index !== operationIndex) fail('APPLICABILITY_BINDING_OPERATION_INDEX_MISMATCH', String(operationIndex));
  const operation = request.operations[operationIndex];
  if (!nonEmpty(binding.operation_fingerprint) || binding.operation_fingerprint !== digest(operation)) fail('APPLICABILITY_BINDING_OPERATION_FINGERPRINT_MISMATCH', String(operationIndex));
  if (!nonEmpty(binding.author_decision_ref)) fail('APPLICABILITY_BINDING_DECISION_REF_REQUIRED', String(operationIndex));
  const canonical = canonicalDecision(parentState, binding.author_decision_ref);
  const requestRefs = Array.isArray(request.author_decision_refs) ? request.author_decision_refs : [];
  if (!requestRefs.includes(binding.author_decision_ref)) fail('BOUND_AUTHOR_DECISION_NOT_PRESENT_IN_ADMISSION_REQUEST', binding.author_decision_ref);
  const receipt = receiptFor(queueLedger, binding.resolution_receipt_id);
  validateReceiptIntegrity(queueLedger, receipt);
  if (receipt.decision_id !== binding.author_decision_ref) fail('RESOLUTION_RECEIPT_DECISION_ID_MISMATCH', binding.author_decision_ref);
  if (receipt.canonical_decision_status !== canonical.status) fail('RESOLUTION_RECEIPT_CANONICAL_STATUS_MISMATCH', binding.author_decision_ref);
  const requiredRefs = exactRefs(binding.required_subject_identity_refs);
  if (!sameRefs(receipt.subject_identity_refs, requiredRefs)) fail('RESOLUTION_RECEIPT_SUBJECT_IDENTITY_MISMATCH', binding.author_decision_ref);
  try {
    currentSubjectGuard.assertStrictSubjectCurrent(parentState, requiredRefs);
  } catch (e) {
    if (e && ['AUTHOR_DECISION_SUBJECT_NOT_CURRENT', 'SUBJECT_IDENTITY_NOT_CURRENT'].includes(e.code)) {
      fail('AUTHOR_DECISION_SUBJECT_NOT_CURRENT', binding.author_decision_ref);
    }
    throw e;
  }
  return {
    operation_index: operationIndex,
    author_decision_ref: binding.author_decision_ref,
    resolution_receipt_id: binding.resolution_receipt_id,
    required_subject_identity_refs: requiredRefs
  };
}

function commitContentAdmissionWithAuthorDecisionApplicability({ parentState, versionLedger, queueLedger, request, applicabilityBindings }) {
  if (!queueLedger) fail('AUTHOR_DECISION_QUEUE_EVIDENCE_REQUIRED');
  authorQueue.validateQueueLedger(queueLedger, parentState);
  const required = requiredOperationIndexes(request);
  const bindings = Array.isArray(applicabilityBindings) ? applicabilityBindings : [];
  const byIndex = new Map();
  for (const binding of bindings) {
    if (!obj(binding) || !Number.isInteger(binding.operation_index) || binding.operation_index < 0 || binding.operation_index >= request.operations.length) fail('INVALID_APPLICABILITY_BINDING');
    if (byIndex.has(binding.operation_index)) fail('DUPLICATE_APPLICABILITY_BINDING', String(binding.operation_index));
    byIndex.set(binding.operation_index, binding);
  }
  for (const index of byIndex.keys()) if (!required.includes(index)) fail('UNEXPECTED_APPLICABILITY_BINDING', String(index));
  const verified = required.map(index => validateBinding({ parentState, queueLedger, request, operationIndex:index, binding:byIndex.get(index) }));
  const boundDecisionIds = [...new Set(verified.map(v => v.author_decision_ref))].sort();
  const requestDecisionIds = [...new Set((request.author_decision_refs || []).map(String))].sort();
  if (stable(boundDecisionIds) !== stable(requestDecisionIds)) fail('AUTHOR_DECISION_REF_BINDING_SET_MISMATCH');

  const result = contentAdmission.commitContentAdmission({ parentState, versionLedger, request });
  return {
    ...result,
    applicability_receipt: {
      guard_id: GUARD_ID,
      admission_mutation_id: request.mutation_id,
      verified_binding_count: verified.length,
      verified_bindings: verified,
      disposition: result.disposition === 'REPLAY' ? 'VERIFIED_REPLAY' : 'VERIFIED_AND_DELEGATED_TO_BASE_ADMISSION'
    }
  };
}

module.exports = {
  GUARD_ID,
  ContentAdmissionAuthorDecisionApplicabilityError,
  commitContentAdmissionWithAuthorDecisionApplicability
};
