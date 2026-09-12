'use strict';

const crypto = require('crypto');
const foundation = require('./book-execution-foundation-b01');

const SCHEMA_VERSION = '1';
const SHA256 = /^[0-9a-f]{64}$/;
const FORBIDDEN_FIELDS = new Set([
  'manuscript_text','passage_text','candidate_text','raw_manuscript','raw_passage','raw_candidate',
  'raw_manuscript_text','raw_candidate_text','private_gold_labels','blind_case_labels','author_secret',
  'provider_chain_of_thought','canonical_mutation_command','publication_credentials','production_credentials',
  'canonical_manuscript','canonical_manuscript_state','apply_revision_to_canonical','admit_canonical_manuscript'
]);

class BookWorkflowRuntimeB01Error extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookWorkflowRuntimeB01Error';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookWorkflowRuntimeB01Error(code, detail); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (isObject(v)) {
    const out = {};
    for (const key of Object.keys(v).sort()) out[key] = stable(v[key]);
    return out;
  }
  return v;
}
function stableStringify(v) { return JSON.stringify(stable(v)); }
function sha256(v) { return crypto.createHash('sha256').update(String(v), 'utf8').digest('hex'); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

function assertCoordinationOnly(value, where = '$') {
  if (Array.isArray(value)) return value.forEach((item, i) => assertCoordinationOnly(item, `${where}[${i}]`));
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELDS.has(key)) fail('FORBIDDEN_RUNTIME_FIELD', `${where}.${key}`);
    assertCoordinationOnly(child, `${where}.${key}`);
  }
}

function digestRecord(record, digestField) {
  const copy = clone(record);
  delete copy[digestField];
  return sha256(stableStringify(copy));
}

function contentId(prefix, digest) { return `${prefix}:${digest}`; }

function taskStateFromBinding(tb, prior = null) {
  if (prior) {
    if (prior.task_execution_identity_digest !== tb.task_execution_identity_digest) fail('STALE_TASK_EXECUTION_IDENTITY', tb.task_id);
    if (prior.capability_binding_digest !== tb.capability_binding_digest) fail('STALE_TASK_BINDING', tb.task_id);
    if (prior.state === 'COMPLETED_VERIFIED') return stable({ ...prior });
    if (prior.state === 'UNKNOWN_OUTCOME_RECONCILE_REQUIRED') return stable({ ...prior, dispatch_authorized: false });
    if (prior.state === 'CANCELLED') return stable({ ...prior, dispatch_authorized: false });
  }
  return stable({
    task_id: tb.task_id,
    task_execution_identity_digest: tb.task_execution_identity_digest,
    current_capability_id: tb.current_capability_id,
    capability_binding_digest: tb.capability_binding_digest,
    provider_service_id: tb.provider_service_id,
    provider_operation_id: tb.provider_operation_id,
    provider_subject_ref: tb.provider_subject_ref,
    state: 'BLOCKED',
    blocker: tb.dispatch_blocker,
    dispatch_authorized: false,
    canonical_effect: false
  });
}

function reconcileSchedulerState({ plan, binding_plan: bindingPlan, prior_state: priorState = null }, options = {}) {
  foundation.validateExecutionBindingPlan(bindingPlan, plan, options);
  if (priorState !== null) validateSchedulerState(priorState, plan, bindingPlan, options);
  const priorByTask = new Map((priorState?.task_states || []).map(x => [x.task_id, x]));
  const taskStates = bindingPlan.task_bindings.map(tb => taskStateFromBinding(tb, priorByTask.get(tb.task_id) || null));
  const projection = stable({
    scheduler_state_schema_version: SCHEMA_VERSION,
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    binding_plan_id: bindingPlan.binding_plan_id,
    binding_plan_digest: bindingPlan.binding_plan_digest,
    workflow_id: plan.workflow_id,
    workflow_digest: plan.workflow_state_identity.workflow_digest,
    source_identity: clone(plan.source_identity),
    task_states: taskStates,
    scheduler_dispatch_authorized: false,
    canonical_effect: false
  });
  const digest = sha256(stableStringify(projection));
  return stable({ ...projection, scheduler_state_id: contentId('book-b01-scheduler-state-v1', digest), scheduler_state_digest: digest });
}

function validateSchedulerState(state, plan, bindingPlan, options = {}) {
  if (!isObject(state) || state.scheduler_state_schema_version !== SCHEMA_VERSION) fail('SCHEDULER_STATE_REQUIRED');
  assertCoordinationOnly(state, 'scheduler_state');
  if (state.plan_id !== plan.plan_id || state.plan_digest !== plan.plan_digest) fail('STALE_SCHEDULER_PLAN');
  if (state.binding_plan_id !== bindingPlan.binding_plan_id || state.binding_plan_digest !== bindingPlan.binding_plan_digest) fail('STALE_SCHEDULER_BINDING_PLAN');
  if (state.workflow_id !== plan.workflow_id || state.workflow_digest !== plan.workflow_state_identity.workflow_digest) fail('STALE_SCHEDULER_WORKFLOW');
  if (state.scheduler_dispatch_authorized !== false || state.canonical_effect !== false) fail('SCHEDULER_AUTHORITY_WIDENING');
  if (!Array.isArray(state.task_states) || state.task_states.length !== bindingPlan.task_bindings.length) fail('SCHEDULER_TASK_COVERAGE_MISMATCH');
  const expected = new Map(bindingPlan.task_bindings.map(x => [x.task_id, x]));
  for (const taskState of state.task_states) {
    const tb = expected.get(taskState.task_id);
    if (!tb) fail('SCHEDULER_TASK_NOT_IN_BINDING_PLAN', taskState.task_id);
    if (taskState.task_execution_identity_digest !== tb.task_execution_identity_digest || taskState.capability_binding_digest !== tb.capability_binding_digest) fail('STALE_TASK_EXECUTION_IDENTITY', taskState.task_id);
    if (taskState.dispatch_authorized !== false || taskState.canonical_effect !== false) fail('TASK_AUTHORITY_WIDENING', taskState.task_id);
    if (!['BLOCKED','COMPLETED_VERIFIED','UNKNOWN_OUTCOME_RECONCILE_REQUIRED','CANCELLED'].includes(taskState.state)) fail('INVALID_TASK_RUNTIME_STATE', taskState.task_id);
  }
  const expectedDigest = digestRecord(state, 'scheduler_state_digest');
  if (state.scheduler_state_digest !== expectedDigest) fail('SCHEDULER_STATE_DIGEST_MISMATCH');
  if (state.scheduler_state_id !== contentId('book-b01-scheduler-state-v1', expectedDigest)) fail('SCHEDULER_STATE_ID_MISMATCH');
  foundation.validateExecutionBindingPlan(bindingPlan, plan, options);
  return true;
}

function validateAdapter(adapter) {
  if (!adapter || typeof adapter.read !== 'function' || typeof adapter.writeAtomic !== 'function') fail('DURABLE_ADAPTER_REQUIRED');
  return adapter;
}

function persistCreateOnce(adapter, key, record, digestField) {
  validateAdapter(adapter);
  assertCoordinationOnly(record, 'durable_record');
  const existing = adapter.read(key);
  if (existing !== null && existing !== undefined) {
    if (stableStringify(existing) === stableStringify(record)) return { persisted: false, idempotent: true, digest: record[digestField] };
    fail('DURABLE_CREATE_ONCE_CONFLICT', key);
  }
  adapter.writeAtomic(key, record);
  return { persisted: true, idempotent: false, digest: record[digestField] };
}

function persistSchedulerState(adapter, state, plan, bindingPlan, options = {}) {
  validateSchedulerState(state, plan, bindingPlan, options);
  return persistCreateOnce(adapter, state.scheduler_state_id, state, 'scheduler_state_digest');
}

function createFailureRecord({ plan, binding_plan: bindingPlan, task_id: taskId, failure_class: failureClass, reason_code: reasonCode, evidence_refs: evidenceRefs = [] }, options = {}) {
  const identity = foundation.buildCurrentOperationIdentity(bindingPlan, plan, taskId, options);
  if (!nonEmpty(failureClass) || !nonEmpty(reasonCode)) fail('FAILURE_CLASS_AND_REASON_REQUIRED');
  if (!Array.isArray(evidenceRefs) || evidenceRefs.some(x => !nonEmpty(x)) || new Set(evidenceRefs).size !== evidenceRefs.length) fail('INVALID_EVIDENCE_REFS');
  const projection = stable({
    failure_record_schema_version: SCHEMA_VERSION,
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    binding_plan_digest: bindingPlan.binding_plan_digest,
    task_id: taskId,
    operation_digest: identity.operation_digest,
    current_capability_id: identity.projection.current_capability_id,
    capability_binding_digest: identity.projection.capability_binding_digest,
    provider_service_id: identity.projection.provider_service_id,
    provider_operation_id: identity.projection.provider_operation_id,
    failure_class: failureClass,
    reason_code: reasonCode,
    evidence_refs: [...evidenceRefs],
    retry_authorized: false,
    canonical_effect: false
  });
  const digest = sha256(stableStringify(projection));
  return stable({ ...projection, failure_record_id: contentId('book-b01-failure-v1', digest), failure_record_digest: digest });
}

function validateFailureRecord(record) {
  if (!isObject(record) || record.failure_record_schema_version !== SCHEMA_VERSION) fail('FAILURE_RECORD_REQUIRED');
  assertCoordinationOnly(record, 'failure_record');
  if (record.retry_authorized !== false || record.canonical_effect !== false) fail('FAILURE_RECORD_AUTHORITY_WIDENING');
  const digest = digestRecord(record, 'failure_record_digest');
  if (record.failure_record_digest !== digest || record.failure_record_id !== contentId('book-b01-failure-v1', digest)) fail('FAILURE_RECORD_DIGEST_MISMATCH');
  return true;
}

function createCancellationCheckpoint({ plan, binding_plan: bindingPlan, scheduler_state: schedulerState, reason_code: reasonCode, evidence_refs: evidenceRefs = [] }, options = {}) {
  validateSchedulerState(schedulerState, plan, bindingPlan, options);
  if (!nonEmpty(reasonCode)) fail('CANCELLATION_REASON_REQUIRED');
  if (!Array.isArray(evidenceRefs) || evidenceRefs.some(x => !nonEmpty(x))) fail('INVALID_EVIDENCE_REFS');
  const projection = stable({
    cancellation_checkpoint_schema_version: SCHEMA_VERSION,
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    binding_plan_digest: bindingPlan.binding_plan_digest,
    scheduler_state_id: schedulerState.scheduler_state_id,
    scheduler_state_digest: schedulerState.scheduler_state_digest,
    workflow_id: plan.workflow_id,
    workflow_digest: plan.workflow_state_identity.workflow_digest,
    source_identity: clone(plan.source_identity),
    task_states: clone(schedulerState.task_states),
    reason_code: reasonCode,
    evidence_refs: [...evidenceRefs],
    resume_requires_reread: true,
    redispatch_unknown_outcome_forbidden: true,
    canonical_effect: false
  });
  const digest = sha256(stableStringify(projection));
  return stable({ ...projection, checkpoint_id: contentId('book-b01-cancel-checkpoint-v1', digest), checkpoint_digest: digest });
}

function validateCancellationCheckpoint(checkpoint) {
  if (!isObject(checkpoint) || checkpoint.cancellation_checkpoint_schema_version !== SCHEMA_VERSION) fail('CANCELLATION_CHECKPOINT_REQUIRED');
  assertCoordinationOnly(checkpoint, 'checkpoint');
  if (checkpoint.resume_requires_reread !== true || checkpoint.redispatch_unknown_outcome_forbidden !== true || checkpoint.canonical_effect !== false) fail('CANCELLATION_RESUME_AUTHORITY_WIDENING');
  const digest = digestRecord(checkpoint, 'checkpoint_digest');
  if (checkpoint.checkpoint_digest !== digest || checkpoint.checkpoint_id !== contentId('book-b01-cancel-checkpoint-v1', digest)) fail('CHECKPOINT_DIGEST_MISMATCH');
  return true;
}

function createExecutionReceipt({ plan, binding_plan: bindingPlan, task_id: taskId, result_ref: resultRef, result_digest: resultDigest, result_class: resultClass, evidence_refs: evidenceRefs = [] }, options = {}) {
  const identity = foundation.buildCurrentOperationIdentity(bindingPlan, plan, taskId, options);
  if (!nonEmpty(resultRef) || !SHA256.test(String(resultDigest || '')) || !nonEmpty(resultClass)) fail('EXECUTION_RESULT_IDENTITY_REQUIRED');
  if (!Array.isArray(evidenceRefs) || evidenceRefs.some(x => !nonEmpty(x)) || new Set(evidenceRefs).size !== evidenceRefs.length) fail('INVALID_EVIDENCE_REFS');
  const projection = stable({
    execution_receipt_schema_version: SCHEMA_VERSION,
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    binding_plan_digest: bindingPlan.binding_plan_digest,
    task_id: taskId,
    operation_digest: identity.operation_digest,
    current_capability_id: identity.projection.current_capability_id,
    capability_binding_digest: identity.projection.capability_binding_digest,
    provider_service_id: identity.projection.provider_service_id,
    provider_operation_id: identity.projection.provider_operation_id,
    provider_subject_ref: identity.projection.provider_subject_ref,
    result_ref: resultRef,
    result_digest: resultDigest,
    result_class: resultClass,
    evidence_refs: [...evidenceRefs],
    canonical_effect: false,
    publication_authority: false,
    author_decision_authority: false
  });
  const digest = sha256(stableStringify(projection));
  return stable({ ...projection, receipt_id: contentId('book-b01-execution-receipt-v1', digest), receipt_digest: digest });
}

function validateExecutionReceipt(receipt) {
  if (!isObject(receipt) || receipt.execution_receipt_schema_version !== SCHEMA_VERSION) fail('EXECUTION_RECEIPT_REQUIRED');
  assertCoordinationOnly(receipt, 'execution_receipt');
  if (receipt.canonical_effect !== false || receipt.publication_authority !== false || receipt.author_decision_authority !== false) fail('EXECUTION_RECEIPT_AUTHORITY_WIDENING');
  const digest = digestRecord(receipt, 'receipt_digest');
  if (receipt.receipt_digest !== digest || receipt.receipt_id !== contentId('book-b01-execution-receipt-v1', digest)) fail('EXECUTION_RECEIPT_DIGEST_MISMATCH');
  return true;
}

function createAdmissionHandoff({ plan, binding_plan: bindingPlan, task_id: taskId, execution_receipt: receipt, candidate_ref: candidateRef, candidate_digest: candidateDigest, author_decision_refs: authorDecisionRefs = [], evidence_refs: evidenceRefs = [] }, options = {}) {
  validateExecutionReceipt(receipt);
  const identity = foundation.buildCurrentOperationIdentity(bindingPlan, plan, taskId, options);
  if (identity.projection.current_capability_id !== 'BOOK.LITERARY.GENERATE_REVISION_CANDIDATE') fail('ADMISSION_CANDIDATE_CAPABILITY_REQUIRED');
  if (receipt.task_id !== taskId || receipt.operation_digest !== identity.operation_digest || receipt.capability_binding_digest !== identity.projection.capability_binding_digest) fail('ADMISSION_RECEIPT_BINDING_MISMATCH');
  if (!nonEmpty(candidateRef) || !SHA256.test(String(candidateDigest || ''))) fail('CANDIDATE_IDENTITY_REQUIRED');
  if (!Array.isArray(authorDecisionRefs) || authorDecisionRefs.some(x => !nonEmpty(x)) || !Array.isArray(evidenceRefs) || evidenceRefs.some(x => !nonEmpty(x))) fail('INVALID_HANDOFF_REFS');
  const projection = stable({
    admission_handoff_schema_version: SCHEMA_VERSION,
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    binding_plan_digest: bindingPlan.binding_plan_digest,
    workflow_id: plan.workflow_id,
    workflow_digest: plan.workflow_state_identity.workflow_digest,
    source_identity: clone(plan.source_identity),
    task_id: taskId,
    current_capability_id: identity.projection.current_capability_id,
    capability_binding_digest: identity.projection.capability_binding_digest,
    operation_digest: identity.operation_digest,
    execution_receipt_id: receipt.receipt_id,
    execution_receipt_digest: receipt.receipt_digest,
    provider_service_id: identity.projection.provider_service_id,
    provider_operation_id: identity.projection.provider_operation_id,
    provider_subject_ref: identity.projection.provider_subject_ref,
    candidate_ref: candidateRef,
    candidate_digest: candidateDigest,
    author_decision_refs: [...authorDecisionRefs],
    evidence_refs: [...evidenceRefs],
    target_authority: 'SYSTEM_MASTER/BOOK_CANONICAL_CONTENT_ADMISSION',
    canonical_effect: false,
    publication_authority: false,
    author_decision_authority: false,
    handoff_only: true
  });
  const digest = sha256(stableStringify(projection));
  return stable({ ...projection, handoff_id: contentId('book-b01-admission-handoff-v1', digest), handoff_digest: digest });
}

function validateAdmissionHandoff(handoff) {
  if (!isObject(handoff) || handoff.admission_handoff_schema_version !== SCHEMA_VERSION) fail('ADMISSION_HANDOFF_REQUIRED');
  assertCoordinationOnly(handoff, 'admission_handoff');
  if (handoff.current_capability_id !== 'BOOK.LITERARY.GENERATE_REVISION_CANDIDATE') fail('ADMISSION_CANDIDATE_CAPABILITY_REQUIRED');
  if (handoff.target_authority !== 'SYSTEM_MASTER/BOOK_CANONICAL_CONTENT_ADMISSION' || handoff.canonical_effect !== false || handoff.publication_authority !== false || handoff.author_decision_authority !== false || handoff.handoff_only !== true) fail('ADMISSION_HANDOFF_AUTHORITY_WIDENING');
  const digest = digestRecord(handoff, 'handoff_digest');
  if (handoff.handoff_digest !== digest || handoff.handoff_id !== contentId('book-b01-admission-handoff-v1', digest)) fail('ADMISSION_HANDOFF_DIGEST_MISMATCH');
  return true;
}

module.exports = {
  SCHEMA_VERSION,
  BookWorkflowRuntimeB01Error,
  stableStringify,
  sha256,
  assertCoordinationOnly,
  reconcileSchedulerState,
  validateSchedulerState,
  persistSchedulerState,
  persistCreateOnce,
  createFailureRecord,
  validateFailureRecord,
  createCancellationCheckpoint,
  validateCancellationCheckpoint,
  createExecutionReceipt,
  validateExecutionReceipt,
  createAdmissionHandoff,
  validateAdmissionHandoff
};
