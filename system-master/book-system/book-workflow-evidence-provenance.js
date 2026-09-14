'use strict';

const crypto = require('crypto');
const stateModel = require('./book-workflow-state-model');
const planRuntime = require('./book-workflow-execution-plan');
const routing = require('./book-capability-routing-interface');
const retry = require('./book-workflow-retry-idempotency-rules');

const RECEIPT_SCHEMA_VERSION = 1;
const RECEIPT_CLASSES = new Set([
  'WORKFLOW_STATE_OBSERVED','TASK_RESULT_OBSERVED','FAILURE_DISPOSITION_OBSERVED','RETRY_DECISION_OBSERVED',
  'CHECKPOINT_OBSERVED','RESUME_DECISION_OBSERVED','AUTHOR_DECISION_REFERENCE_OBSERVED','ADMISSION_HANDOFF_REFERENCE_OBSERVED'
]);
const TASK_REQUIRED_CLASSES = new Set([
  'TASK_RESULT_OBSERVED','FAILURE_DISPOSITION_OBSERVED','RETRY_DECISION_OBSERVED',
  'AUTHOR_DECISION_REFERENCE_OBSERVED','ADMISSION_HANDOFF_REFERENCE_OBSERVED'
]);
const PROVIDER_BINDING_CLASSES = new Set(['TASK_RESULT_OBSERVED','FAILURE_DISPOSITION_OBSERVED','RETRY_DECISION_OBSERVED']);
const CONTROL_REFERENCE_CLASSES = new Set([
  'FAILURE_DISPOSITION_OBSERVED','RETRY_DECISION_OBSERVED','CHECKPOINT_OBSERVED','RESUME_DECISION_OBSERVED',
  'AUTHOR_DECISION_REFERENCE_OBSERVED','ADMISSION_HANDOFF_REFERENCE_OBSERVED'
]);
const FORBIDDEN_RAW_FIELDS = new Set([
  'manuscript_text','passage_text','candidate_text','raw_manuscript','raw_passage','raw_candidate',
  'raw_research','raw_evaluator_text','private_manuscript_text'
]);
const FORBIDDEN_EFFECT_FIELDS = new Set([
  'canonical_manuscript','canonical_manuscript_state','next_canonical_manuscript_ref',
  'apply_revision_to_canonical','admit_canonical_manuscript','canonical_write_allowed',
  'publication_authorized','export_freeze_allowed'
]);
const SHA256 = /^[a-f0-9]{64}$/;
const SUBJECT_HASH = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const SAFE_REF = /^[A-Za-z0-9._:/#@-]{1,256}$/;

class BookWorkflowEvidenceProvenanceError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookWorkflowEvidenceProvenanceError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookWorkflowEvidenceProvenanceError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function stableNormalize(v) {
  if (Array.isArray(v)) return v.map(stableNormalize);
  if (isObject(v)) {
    const out = {};
    for (const key of Object.keys(v).sort()) out[key] = stableNormalize(v[key]);
    return out;
  }
  return v;
}
function stableStringify(v) { return JSON.stringify(stableNormalize(v)); }
function sha256(v) { return crypto.createHash('sha256').update(String(v), 'utf8').digest('hex'); }
function receiptDigest(receipt) {
  const copy = clone(receipt);
  delete copy.receipt_digest;
  return sha256(stableStringify(copy));
}

function assertNoForbiddenFields(value, where = 'evidence') {
  if (Array.isArray(value)) return value.forEach((item, i) => assertNoForbiddenFields(item, `${where}.${i}`));
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_RAW_FIELDS.has(key)) fail('RAW_CONTENT_FORBIDDEN', `${where}.${key}`);
    if (FORBIDDEN_EFFECT_FIELDS.has(key)) fail('CANONICAL_OR_PUBLICATION_EFFECT_FIELD_FORBIDDEN', `${where}.${key}`);
    assertNoForbiddenFields(child, `${where}.${key}`);
  }
}

function validateRefs(values, label, allowEmpty = true) {
  if (!Array.isArray(values)) fail('REFERENCE_ARRAY_REQUIRED', label);
  if (!allowEmpty && values.length === 0) fail('REFERENCE_REQUIRED', label);
  const seen = new Set();
  for (const ref of values) {
    if (!nonEmpty(ref) || !SAFE_REF.test(ref)) fail('INVALID_REFERENCE', `${label}:${String(ref)}`);
    if (seen.has(ref)) fail('DUPLICATE_REFERENCE', `${label}:${ref}`);
    seen.add(ref);
  }
}

function validateHashMap(map, label) {
  if (!isObject(map)) fail('HASH_MAP_REQUIRED', label);
  for (const [key, value] of Object.entries(map)) {
    if (!nonEmpty(key) || !SAFE_REF.test(key) || !SHA256.test(String(value || ''))) fail('INVALID_HASH_BINDING', `${label}:${key}`);
  }
}

function sameSource(a, b) { return stableStringify(a) === stableStringify(b); }
function taskById(plan, taskId) {
  const matches = plan.tasks.filter(t => t.task_id === taskId);
  if (matches.length !== 1) fail('TASK_NOT_UNIQUE_IN_PLAN', taskId);
  return matches[0];
}

function providerDescriptor(task, routingRegistry) {
  return routing.resolveCallableCapability({
    capability_id: task.capability_id,
    required_authority_domain: task.required_authority_domain
  }, routingRegistry);
}

function validateProviderIdentity(providerIdentity, task, routingRegistry) {
  if (!isObject(providerIdentity)) fail('PROVIDER_IDENTITY_REQUIRED', task.task_id);
  for (const field of ['service_id','operation_id','provider_subject_sha','implementation_or_artifact_id']) {
    if (!Object.prototype.hasOwnProperty.call(providerIdentity, field)) fail('PROVIDER_IDENTITY_FIELD_MISSING', field);
  }
  const cap = providerDescriptor(task, routingRegistry);
  if (providerIdentity.service_id !== cap.service_id || providerIdentity.operation_id !== cap.operation_id) fail('PROVIDER_SERVICE_OPERATION_MISMATCH', task.task_id);
  if (!SUBJECT_HASH.test(String(providerIdentity.provider_subject_sha || ''))) fail('PROVIDER_SUBJECT_SHA_INVALID', task.task_id);
  if (!nonEmpty(providerIdentity.implementation_or_artifact_id) || !SAFE_REF.test(providerIdentity.implementation_or_artifact_id)) fail('PROVIDER_IMPLEMENTATION_ID_INVALID', task.task_id);
  if (cap.canonical_write_authority) fail('PROVIDER_CANONICAL_WRITE_FORBIDDEN', task.task_id);
  return clone(providerIdentity);
}

function expectedOperationIdentity(plan, workflowState, task, routingRegistry, serviceRegistry) {
  if (task.task_class !== 'SPECIALIST_SERVICE_TASK') return null;
  return retry.buildOperationIdentity(plan, workflowState, task.task_id, routingRegistry, serviceRegistry);
}

function validateSuppliedOperationIdentity(operationIdentity, plan, workflowState, task, routingRegistry, serviceRegistry) {
  if (!isObject(operationIdentity)) fail('PROVIDER_OPERATION_IDENTITY_REQUIRED', task.task_id);
  retry.validateOperationIdentity(operationIdentity);
  const expected = expectedOperationIdentity(plan, workflowState, task, routingRegistry, serviceRegistry);
  if (stableStringify(expected) !== stableStringify(operationIdentity)) fail('STALE_OR_TAMPERED_OPERATION_IDENTITY', task.task_id);
  return expected.operation_digest;
}

function validateBinding(input, routingRegistry) {
  const workflowState = input.workflow_state;
  const plan = input.plan;
  stateModel.validateWorkflowState(workflowState);
  planRuntime.validateExecutionPlan(plan, workflowState, routingRegistry);
  if (!sameSource(workflowState.source_identity, plan.source_identity)) fail('SOURCE_IDENTITY_MISMATCH');
  stateModel.assertCurrentSourceIdentity(workflowState, input.current_source_identity || workflowState.source_identity);
  const task = input.task_id === null || input.task_id === undefined ? null : taskById(plan, input.task_id);
  return { workflowState, plan, task };
}

function createReceipt(input, routingRegistry = routing.loadDefaultRegistry(), serviceRegistry = retry.loadServiceRegistry()) {
  if (!isObject(input)) fail('RECEIPT_INPUT_REQUIRED');
  assertNoForbiddenFields(input, 'receipt_input');
  if (!RECEIPT_CLASSES.has(input.receipt_class)) fail('INVALID_RECEIPT_CLASS', String(input.receipt_class));
  if (!nonEmpty(input.receipt_id) || !SAFE_REF.test(input.receipt_id)) fail('RECEIPT_ID_INVALID');
  if (!Number.isInteger(input.sequence_number) || input.sequence_number < 1) fail('SEQUENCE_NUMBER_INVALID');
  if (!nonEmpty(input.emitted_at)) fail('EMITTED_AT_REQUIRED');
  const { workflowState, plan, task } = validateBinding(input, routingRegistry);
  if (TASK_REQUIRED_CLASSES.has(input.receipt_class) && !task) fail('TASK_REQUIRED_FOR_RECEIPT_CLASS', input.receipt_class);
  if (input.receipt_class === 'WORKFLOW_STATE_OBSERVED' && task) fail('WORKFLOW_RECEIPT_TASK_MUST_BE_NULL');

  const inputHashes = clone(input.input_ref_hashes || (task ? task.input_ref_hashes : workflowState.input_hashes));
  const contextRefs = clone(input.context_package_refs || (task ? task.context_package_refs : workflowState.context_package_ids));
  validateHashMap(inputHashes, 'input_ref_hashes');
  validateRefs(contextRefs, 'context_package_refs');
  if (task) {
    if (stableStringify(inputHashes) !== stableStringify(task.input_ref_hashes)) fail('TASK_INPUT_HASH_BINDING_MISMATCH', task.task_id);
    if (stableStringify(contextRefs) !== stableStringify(task.context_package_refs)) fail('TASK_CONTEXT_BINDING_MISMATCH', task.task_id);
  }

  const outputRefs = clone(input.output_refs || []);
  const evidenceRefs = clone(input.evidence_refs || []);
  const decisionRefs = clone(input.decision_refs || []);
  const parentDigests = clone(input.parent_receipt_digests || []);
  validateRefs(outputRefs, 'output_refs');
  validateRefs(evidenceRefs, 'evidence_refs');
  validateRefs(decisionRefs, 'decision_refs');
  if (!Array.isArray(parentDigests) || parentDigests.some(x => !SHA256.test(String(x || ''))) || new Set(parentDigests).size !== parentDigests.length) fail('PARENT_RECEIPT_DIGESTS_INVALID');

  let providerIdentity = null;
  let operationDigest = null;
  if (task && task.task_class === 'SPECIALIST_SERVICE_TASK' && PROVIDER_BINDING_CLASSES.has(input.receipt_class)) {
    providerIdentity = validateProviderIdentity(input.provider_identity, task, routingRegistry);
    operationDigest = validateSuppliedOperationIdentity(input.operation_identity, plan, workflowState, task, routingRegistry, serviceRegistry);
  } else {
    if (input.provider_identity !== null && input.provider_identity !== undefined) fail('PROVIDER_IDENTITY_NOT_ALLOWED_FOR_RECEIPT', input.receipt_class);
    if (input.operation_identity !== null && input.operation_identity !== undefined) fail('OPERATION_IDENTITY_NOT_ALLOWED_FOR_RECEIPT', input.receipt_class);
  }

  if (input.receipt_class === 'TASK_RESULT_OBSERVED' && outputRefs.length === 0 && evidenceRefs.length === 0) fail('TASK_RESULT_REFERENCE_REQUIRED');
  if (CONTROL_REFERENCE_CLASSES.has(input.receipt_class) && decisionRefs.length === 0) fail('DECISION_OR_CONTROL_REFERENCE_REQUIRED', input.receipt_class);
  if (input.receipt_class === 'AUTHOR_DECISION_REFERENCE_OBSERVED' && task.task_class !== 'AUTHORITY_WAIT') fail('AUTHOR_DECISION_REQUIRES_AUTHORITY_WAIT_TASK');
  if (input.receipt_class === 'ADMISSION_HANDOFF_REFERENCE_OBSERVED' && task.task_class !== 'BOOK_ADMISSION_HANDOFF') fail('ADMISSION_REFERENCE_REQUIRES_BOOK_HANDOFF_TASK');

  const receipt = {
    receipt_schema_version: RECEIPT_SCHEMA_VERSION,
    receipt_id: input.receipt_id,
    receipt_class: input.receipt_class,
    sequence_number: input.sequence_number,
    workflow_id: workflowState.workflow_id,
    workflow_digest: workflowState.workflow_digest,
    book_project_id: workflowState.book_project_id,
    source_identity: clone(workflowState.source_identity),
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    task_id: task ? task.task_id : null,
    capability_id: task ? task.capability_id : null,
    authority_domain: task ? task.required_authority_domain : null,
    provider_identity: providerIdentity,
    operation_identity_digest: operationDigest,
    input_ref_hashes: inputHashes,
    context_package_refs: contextRefs,
    output_refs: outputRefs,
    evidence_refs: evidenceRefs,
    decision_refs: decisionRefs,
    parent_receipt_digests: parentDigests,
    emitter_owner_path: 'SYSTEM_MASTER/BOOK',
    emitted_at: input.emitted_at,
    canonical_effect_allowed: false,
    receipt_digest: ''
  };
  receipt.receipt_digest = receiptDigest(receipt);
  validateReceipt(receipt, workflowState, plan, routingRegistry, serviceRegistry);
  return receipt;
}

function validateReceipt(receipt, workflowState, plan, routingRegistry = routing.loadDefaultRegistry(), serviceRegistry = retry.loadServiceRegistry()) {
  if (!isObject(receipt)) fail('RECEIPT_REQUIRED');
  assertNoForbiddenFields(receipt, 'receipt');
  stateModel.validateWorkflowState(workflowState);
  planRuntime.validateExecutionPlan(plan, workflowState, routingRegistry);
  if (receipt.receipt_schema_version !== RECEIPT_SCHEMA_VERSION || !RECEIPT_CLASSES.has(receipt.receipt_class)) fail('RECEIPT_SCHEMA_OR_CLASS_INVALID');
  if (!nonEmpty(receipt.receipt_id) || !SAFE_REF.test(receipt.receipt_id) || !Number.isInteger(receipt.sequence_number) || receipt.sequence_number < 1) fail('RECEIPT_IDENTITY_INVALID');
  if (receipt.workflow_id !== workflowState.workflow_id || receipt.workflow_digest !== workflowState.workflow_digest || receipt.book_project_id !== workflowState.book_project_id) fail('RECEIPT_WORKFLOW_BINDING_MISMATCH');
  if (receipt.plan_id !== plan.plan_id || receipt.plan_digest !== plan.plan_digest) fail('RECEIPT_PLAN_BINDING_MISMATCH');
  if (!sameSource(receipt.source_identity, workflowState.source_identity) || !sameSource(receipt.source_identity, plan.source_identity)) fail('RECEIPT_SOURCE_BINDING_MISMATCH');
  if (receipt.emitter_owner_path !== 'SYSTEM_MASTER/BOOK') fail('EMITTER_OWNER_MISMATCH');
  if (receipt.canonical_effect_allowed !== false) fail('EVIDENCE_CANONICAL_EFFECT_FORBIDDEN');
  if (!nonEmpty(receipt.emitted_at)) fail('EMITTED_AT_REQUIRED');
  validateHashMap(receipt.input_ref_hashes, 'input_ref_hashes');
  validateRefs(receipt.context_package_refs, 'context_package_refs');
  validateRefs(receipt.output_refs, 'output_refs');
  validateRefs(receipt.evidence_refs, 'evidence_refs');
  validateRefs(receipt.decision_refs, 'decision_refs');
  if (!Array.isArray(receipt.parent_receipt_digests) || receipt.parent_receipt_digests.some(x => !SHA256.test(String(x || ''))) || new Set(receipt.parent_receipt_digests).size !== receipt.parent_receipt_digests.length) fail('PARENT_RECEIPT_DIGESTS_INVALID');

  const task = receipt.task_id === null ? null : taskById(plan, receipt.task_id);
  if (TASK_REQUIRED_CLASSES.has(receipt.receipt_class) && !task) fail('TASK_REQUIRED_FOR_RECEIPT_CLASS', receipt.receipt_class);
  if (receipt.receipt_class === 'WORKFLOW_STATE_OBSERVED' && task) fail('WORKFLOW_RECEIPT_TASK_MUST_BE_NULL');
  if (CONTROL_REFERENCE_CLASSES.has(receipt.receipt_class) && receipt.decision_refs.length === 0) fail('DECISION_OR_CONTROL_REFERENCE_REQUIRED', receipt.receipt_class);
  if (receipt.receipt_class === 'TASK_RESULT_OBSERVED' && receipt.output_refs.length === 0 && receipt.evidence_refs.length === 0) fail('TASK_RESULT_REFERENCE_REQUIRED');

  if (task) {
    if (receipt.capability_id !== task.capability_id || receipt.authority_domain !== task.required_authority_domain) fail('RECEIPT_TASK_AUTHORITY_BINDING_MISMATCH', task.task_id);
    if (stableStringify(receipt.input_ref_hashes) !== stableStringify(task.input_ref_hashes)) fail('TASK_INPUT_HASH_BINDING_MISMATCH', task.task_id);
    if (stableStringify(receipt.context_package_refs) !== stableStringify(task.context_package_refs)) fail('TASK_CONTEXT_BINDING_MISMATCH', task.task_id);
    if (receipt.receipt_class === 'AUTHOR_DECISION_REFERENCE_OBSERVED' && task.task_class !== 'AUTHORITY_WAIT') fail('AUTHOR_DECISION_REQUIRES_AUTHORITY_WAIT_TASK');
    if (receipt.receipt_class === 'ADMISSION_HANDOFF_REFERENCE_OBSERVED' && task.task_class !== 'BOOK_ADMISSION_HANDOFF') fail('ADMISSION_REFERENCE_REQUIRES_BOOK_HANDOFF_TASK');

    const providerBound = task.task_class === 'SPECIALIST_SERVICE_TASK' && PROVIDER_BINDING_CLASSES.has(receipt.receipt_class);
    if (providerBound) {
      validateProviderIdentity(receipt.provider_identity, task, routingRegistry);
      const expected = expectedOperationIdentity(plan, workflowState, task, routingRegistry, serviceRegistry);
      if (receipt.operation_identity_digest !== expected.operation_digest) fail('STALE_OR_TAMPERED_OPERATION_DIGEST', task.task_id);
    } else if (receipt.provider_identity !== null || receipt.operation_identity_digest !== null) {
      fail('PROVIDER_BINDING_NOT_ALLOWED_FOR_RECEIPT', receipt.receipt_class);
    }
  } else if (receipt.capability_id !== null || receipt.authority_domain !== null || receipt.provider_identity !== null || receipt.operation_identity_digest !== null) {
    fail('WORKFLOW_RECEIPT_TASK_FIELDS_MUST_BE_NULL');
  }

  if (receipt.receipt_digest !== receiptDigest(receipt)) fail('RECEIPT_DIGEST_MISMATCH');
  return true;
}

function validateChain(receipts, workflowState, plan, routingRegistry = routing.loadDefaultRegistry(), serviceRegistry = retry.loadServiceRegistry()) {
  if (!Array.isArray(receipts)) fail('RECEIPT_CHAIN_ARRAY_REQUIRED');
  const ids = new Set();
  const digests = new Set();
  for (let i = 0; i < receipts.length; i += 1) {
    const receipt = receipts[i];
    validateReceipt(receipt, workflowState, plan, routingRegistry, serviceRegistry);
    if (ids.has(receipt.receipt_id)) fail('DUPLICATE_RECEIPT_ID', receipt.receipt_id);
    if (digests.has(receipt.receipt_digest)) fail('DUPLICATE_RECEIPT_DIGEST', receipt.receipt_digest);
    if (receipt.sequence_number !== i + 1) fail('RECEIPT_SEQUENCE_GAP_OR_REORDER', receipt.receipt_id);
    const expectedParents = i === 0 ? [] : [receipts[i - 1].receipt_digest];
    if (stableStringify(receipt.parent_receipt_digests) !== stableStringify(expectedParents)) fail('RECEIPT_PARENT_CHAIN_MISMATCH', receipt.receipt_id);
    ids.add(receipt.receipt_id);
    digests.add(receipt.receipt_digest);
  }
  return true;
}

function appendReceipt(existingReceipts, newReceipt, workflowState, plan, routingRegistry = routing.loadDefaultRegistry(), serviceRegistry = retry.loadServiceRegistry()) {
  validateChain(existingReceipts, workflowState, plan, routingRegistry, serviceRegistry);
  validateReceipt(newReceipt, workflowState, plan, routingRegistry, serviceRegistry);
  const nextSequence = existingReceipts.length + 1;
  if (newReceipt.sequence_number !== nextSequence) fail('APPEND_SEQUENCE_MISMATCH');
  const expectedParents = existingReceipts.length === 0 ? [] : [existingReceipts[existingReceipts.length - 1].receipt_digest];
  if (stableStringify(newReceipt.parent_receipt_digests) !== stableStringify(expectedParents)) fail('APPEND_PARENT_MISMATCH');
  if (existingReceipts.some(r => r.receipt_id === newReceipt.receipt_id)) fail('DUPLICATE_RECEIPT_ID', newReceipt.receipt_id);
  if (existingReceipts.some(r => r.receipt_digest === newReceipt.receipt_digest)) fail('DUPLICATE_RECEIPT_DIGEST', newReceipt.receipt_digest);
  const result = [...clone(existingReceipts), clone(newReceipt)];
  validateChain(result, workflowState, plan, routingRegistry, serviceRegistry);
  return result;
}

function replayVerify(receipts, workflowState, plan, routingRegistry = routing.loadDefaultRegistry(), serviceRegistry = retry.loadServiceRegistry()) {
  validateChain(receipts, workflowState, plan, routingRegistry, serviceRegistry);
  return {
    replay_verified: true,
    receipt_count: receipts.length,
    terminal_receipt_digest: receipts.length ? receipts[receipts.length - 1].receipt_digest : null,
    provider_execution_performed: false,
    canonical_effect_performed: false
  };
}

module.exports = {
  RECEIPT_SCHEMA_VERSION,
  RECEIPT_CLASSES,
  BookWorkflowEvidenceProvenanceError,
  stableStringify,
  receiptDigest,
  createReceipt,
  validateReceipt,
  validateChain,
  appendReceipt,
  replayVerify
};
