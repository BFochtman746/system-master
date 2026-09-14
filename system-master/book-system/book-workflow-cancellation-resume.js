'use strict';

const crypto = require('crypto');
const stateModel = require('./book-workflow-state-model');
const planRuntime = require('./book-workflow-execution-plan');
const routing = require('./book-capability-routing-interface');
const retry = require('./book-workflow-retry-idempotency-rules');

const CHECKPOINT_SCHEMA_VERSION = 1;
const RESUME_DECISION_SCHEMA_VERSION = 1;
const CHECKPOINT_CLASSES = new Set(['PAUSE_CHECKPOINT', 'CANCELLATION_CHECKPOINT']);
const RESUME_DISPOSITIONS = new Set([
  'READY_FOR_LATER_SCHEDULING',
  'WAITING_FOR_RECONCILIATION',
  'WAITING_FOR_REQUIRED_AUTHORITY',
  'BLOCKED_DECLARED_INTERFACE',
  'NEW_WORKFLOW_REQUIRED_STALE_SOURCE',
  'NEW_WORKFLOW_REQUIRED_CANCELLED_TERMINAL'
]);
const PAUSABLE_STATUSES = new Set(['PLANNING','READY','RUNNING','WAITING_SPECIALIST','WAITING_EVIDENCE','WAITING_AUTHOR']);
const CANCELLABLE_STATUSES = new Set(['CREATED','PLANNING','READY','RUNNING','WAITING_SPECIALIST','WAITING_EVIDENCE','WAITING_AUTHOR','READY_FOR_ADMISSION_HANDOFF','PAUSED']);
const FORBIDDEN_RAW_FIELDS = new Set(['manuscript_text','passage_text','candidate_text','raw_manuscript','raw_passage','raw_candidate']);
const FORBIDDEN_EFFECT_FIELDS = new Set(['canonical_manuscript','canonical_manuscript_state','next_canonical_manuscript_ref','apply_revision_to_canonical','admit_canonical_manuscript']);
const TERMINAL_TASK_STATUSES_PRESERVED_ON_CANCEL = new Set(['COMPLETED','FAILED','SUPERSEDED']);

class BookCancellationResumeError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookCancellationResumeError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookCancellationResumeError(code, detail); }
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
function sourceIdentityDigest(source) { return sha256(stableStringify(source)); }
function digestWithout(value, field) { const copy = clone(value); delete copy[field]; return sha256(stableStringify(copy)); }
function checkpointDigest(checkpoint) { return digestWithout(checkpoint, 'checkpoint_digest'); }
function resumeDecisionDigest(decision) { return digestWithout(decision, 'decision_digest'); }

function assertNoForbiddenFields(value, where = 'cancellation_resume') {
  if (Array.isArray(value)) return value.forEach((item, i) => assertNoForbiddenFields(item, `${where}.${i}`));
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_RAW_FIELDS.has(key)) fail('RAW_MANUSCRIPT_CONTENT_FORBIDDEN', `${where}.${key}`);
    if (FORBIDDEN_EFFECT_FIELDS.has(key)) fail('CANONICAL_EFFECT_FIELD_FORBIDDEN', `${where}.${key}`);
    assertNoForbiddenFields(child, `${where}.${key}`);
  }
}

function validateUniqueStrings(values, label) {
  if (!Array.isArray(values)) fail('ARRAY_REQUIRED', label);
  const seen = new Set();
  for (const value of values) {
    if (!nonEmpty(value)) fail('INVALID_REFERENCE', label);
    if (seen.has(value)) fail('DUPLICATE_REFERENCE', `${label}:${value}`);
    seen.add(value);
  }
}

function validatePlanSelf(plan) {
  if (!isObject(plan) || !nonEmpty(plan.plan_id) || !nonEmpty(plan.plan_digest)) fail('EXECUTION_PLAN_REQUIRED');
  if (plan.plan_digest !== planRuntime.digestPlan(plan)) fail('EXECUTION_PLAN_DIGEST_MISMATCH');
  return true;
}

function validatePlanWorkflowBeforeStop(plan, workflowState, routingRegistry) {
  planRuntime.validateExecutionPlan(plan, workflowState, routingRegistry);
  const planIds = plan.tasks.map(t => t.task_id).sort();
  const workflowIds = [...workflowState.planned_task_refs].sort();
  if (stableStringify(planIds) !== stableStringify(workflowIds)) fail('WORKFLOW_PLAN_TASK_SET_MISMATCH');
  for (const id of planIds) if (!Object.prototype.hasOwnProperty.call(workflowState.task_statuses, id)) fail('WORKFLOW_TASK_STATUS_MISSING', id);
  return true;
}

function taskById(plan, taskId) {
  const matches = plan.tasks.filter(t => t.task_id === taskId);
  if (matches.length !== 1) fail('PLAN_TASK_NOT_UNIQUE', taskId);
  return matches[0];
}

function validateVerifiedReceipts(receipts, workflowState, plan) {
  if (!isObject(receipts)) fail('VERIFIED_TASK_RECEIPTS_OBJECT_REQUIRED');
  const sourceDigest = sourceIdentityDigest(plan.source_identity);
  const verified = new Set();
  for (const [taskId, receipt] of Object.entries(receipts)) {
    if (!plan.tasks.some(t => t.task_id === taskId)) fail('VERIFIED_RECEIPT_TASK_NOT_IN_PLAN', taskId);
    if (!isObject(receipt)) fail('VERIFIED_TASK_RECEIPT_REQUIRED', taskId);
    for (const field of ['receipt_ref','workflow_digest','plan_digest','source_identity_digest']) if (!Object.prototype.hasOwnProperty.call(receipt, field)) fail('VERIFIED_TASK_RECEIPT_FIELD_MISSING', `${taskId}:${field}`);
    if (!nonEmpty(receipt.receipt_ref)) fail('VERIFIED_TASK_RECEIPT_REF_REQUIRED', taskId);
    if (receipt.workflow_digest !== workflowState.workflow_digest) fail('VERIFIED_RECEIPT_WORKFLOW_MISMATCH', taskId);
    if (receipt.plan_digest !== plan.plan_digest) fail('VERIFIED_RECEIPT_PLAN_MISMATCH', taskId);
    if (receipt.source_identity_digest !== sourceDigest) fail('VERIFIED_RECEIPT_SOURCE_MISMATCH', taskId);
    if (workflowState.task_statuses[taskId] !== 'COMPLETED') fail('VERIFIED_RECEIPT_REQUIRES_COMPLETED_TASK', taskId);
    verified.add(taskId);
  }
  return verified;
}

function buildInterruptedTaskRecords(workflowState, plan, routingRegistry) {
  const ids = Object.entries(workflowState.task_statuses).filter(([, status]) => status === 'RUNNING').map(([id]) => id).sort();
  return ids.map(taskId => {
    const task = taskById(plan, taskId);
    if (task.task_class === 'BOOK_ADMISSION_HANDOFF') fail('ADMISSION_TASK_IN_FLIGHT_CONTROL_FORBIDDEN', taskId);
    const operationIdentity = task.task_class === 'SPECIALIST_SERVICE_TASK'
      ? retry.buildOperationIdentity(plan, workflowState, taskId, routingRegistry)
      : null;
    return {
      task_id: taskId,
      task_class: task.task_class,
      capability_id: task.capability_id,
      required_authority_domain: task.required_authority_domain,
      operation_identity: operationIdentity
    };
  });
}

function adjustedTaskStatusesForStop(workflowState, verified, terminalCancel) {
  const statuses = clone(workflowState.task_statuses);
  for (const [taskId, status] of Object.entries(statuses)) {
    if (terminalCancel) {
      if (!TERMINAL_TASK_STATUSES_PRESERVED_ON_CANCEL.has(status) || (status === 'COMPLETED' && !verified.has(taskId))) statuses[taskId] = 'CANCELLED';
    } else if (status === 'RUNNING' || (status === 'COMPLETED' && !verified.has(taskId))) {
      statuses[taskId] = 'BLOCKED';
    }
  }
  return statuses;
}

function createCheckpoint({ checkpointId, checkpointClass, preState, postState, plan, verifiedTaskIds, interruptedTaskRecords, createdAt }) {
  const checkpoint = {
    checkpoint_schema_version: CHECKPOINT_SCHEMA_VERSION,
    checkpoint_id: checkpointId,
    checkpoint_class: checkpointClass,
    workflow_id: preState.workflow_id,
    pre_transition_workflow_version: preState.workflow_version,
    pre_transition_workflow_digest: preState.workflow_digest,
    post_transition_workflow_version: postState.workflow_version,
    post_transition_workflow_digest: postState.workflow_digest,
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    source_identity: clone(plan.source_identity),
    pre_transition_workflow_status: preState.workflow_status,
    task_status_snapshot: clone(preState.task_statuses),
    dependency_status_snapshot: clone(preState.dependency_status),
    context_package_ids: clone(preState.context_package_ids),
    specialist_output_refs: clone(preState.specialist_output_refs),
    evaluator_result_refs: clone(preState.evaluator_result_refs),
    evidence_receipt_refs: clone(preState.evidence_receipt_refs),
    completed_verified_task_ids: [...verifiedTaskIds].sort(),
    interrupted_task_ids: interruptedTaskRecords.map(r => r.task_id).sort(),
    interrupted_task_records: clone(interruptedTaskRecords),
    checkpoint_created_at: createdAt,
    checkpoint_digest: ''
  };
  checkpoint.checkpoint_digest = checkpointDigest(checkpoint);
  return checkpoint;
}

function validateInterruptedRecord(record, checkpoint, plan, routingRegistry, serviceRegistry) {
  if (!isObject(record) || !nonEmpty(record.task_id) || !nonEmpty(record.task_class)) fail('INTERRUPTED_TASK_RECORD_INVALID');
  const task = taskById(plan, record.task_id);
  if (task.task_class !== record.task_class || task.capability_id !== record.capability_id || task.required_authority_domain !== record.required_authority_domain) fail('INTERRUPTED_TASK_BINDING_MISMATCH', record.task_id);
  if (checkpoint.task_status_snapshot[record.task_id] !== 'RUNNING') fail('INTERRUPTED_TASK_WAS_NOT_RUNNING', record.task_id);
  if (task.task_class === 'BOOK_ADMISSION_HANDOFF') fail('ADMISSION_TASK_IN_FLIGHT_CONTROL_FORBIDDEN', record.task_id);
  if (task.task_class === 'SPECIALIST_SERVICE_TASK') {
    retry.validateOperationIdentity(record.operation_identity);
    const capability = routing.resolveCallableCapability({ capability_id: task.capability_id, required_authority_domain: task.required_authority_domain }, routingRegistry);
    const registered = retry.registeredOperationPolicy(capability, serviceRegistry);
    if (record.operation_identity.registered_idempotent !== registered.idempotent) fail('INTERRUPTED_OPERATION_IDEMPOTENCY_MISMATCH', record.task_id);
    const projection = record.operation_identity.projection;
    if (projection.workflow_id !== checkpoint.workflow_id || projection.workflow_digest !== checkpoint.pre_transition_workflow_digest) fail('INTERRUPTED_OPERATION_WORKFLOW_BINDING_MISMATCH', record.task_id);
    if (projection.plan_id !== checkpoint.plan_id || projection.plan_digest !== checkpoint.plan_digest || projection.task_id !== record.task_id) fail('INTERRUPTED_OPERATION_PLAN_BINDING_MISMATCH', record.task_id);
    if (stableStringify(projection.source_identity) !== stableStringify(checkpoint.source_identity)) fail('INTERRUPTED_OPERATION_SOURCE_BINDING_MISMATCH', record.task_id);
    if (stableStringify(projection.input_ref_hashes) !== stableStringify(task.input_ref_hashes) || stableStringify(projection.context_package_refs) !== stableStringify(task.context_package_refs)) fail('INTERRUPTED_OPERATION_INPUT_BINDING_MISMATCH', record.task_id);
  } else if (record.operation_identity !== null) {
    fail('NONPROVIDER_INTERRUPTED_TASK_HAS_OPERATION_IDENTITY', record.task_id);
  }
  return true;
}

function validateCheckpoint(checkpoint, postState, plan, routingRegistry = routing.loadDefaultRegistry(), serviceRegistry = retry.loadServiceRegistry()) {
  if (!isObject(checkpoint)) fail('CHECKPOINT_REQUIRED');
  assertNoForbiddenFields(checkpoint, 'checkpoint');
  stateModel.validateWorkflowState(postState);
  validatePlanSelf(plan);
  const required = [
    'checkpoint_schema_version','checkpoint_id','checkpoint_class','workflow_id','pre_transition_workflow_version','pre_transition_workflow_digest',
    'post_transition_workflow_version','post_transition_workflow_digest','plan_id','plan_digest','source_identity','pre_transition_workflow_status',
    'task_status_snapshot','dependency_status_snapshot','context_package_ids','specialist_output_refs','evaluator_result_refs','evidence_receipt_refs',
    'completed_verified_task_ids','interrupted_task_ids','interrupted_task_records','checkpoint_created_at','checkpoint_digest'
  ];
  for (const field of required) if (!Object.prototype.hasOwnProperty.call(checkpoint, field)) fail('CHECKPOINT_FIELD_MISSING', field);
  if (checkpoint.checkpoint_schema_version !== CHECKPOINT_SCHEMA_VERSION || !CHECKPOINT_CLASSES.has(checkpoint.checkpoint_class)) fail('CHECKPOINT_SCHEMA_OR_CLASS_INVALID');
  if (!nonEmpty(checkpoint.checkpoint_id) || !nonEmpty(checkpoint.checkpoint_created_at)) fail('CHECKPOINT_IDENTITY_REQUIRED');
  if (checkpoint.workflow_id !== postState.workflow_id || checkpoint.post_transition_workflow_version !== postState.workflow_version || checkpoint.post_transition_workflow_digest !== postState.workflow_digest) fail('CHECKPOINT_POST_WORKFLOW_BINDING_MISMATCH');
  if (postState.checkpoint_ref !== checkpoint.checkpoint_id) fail('WORKFLOW_CHECKPOINT_REF_MISMATCH');
  const expectedPostStatus = checkpoint.checkpoint_class === 'PAUSE_CHECKPOINT' ? 'PAUSED' : 'CANCELLED';
  if (postState.workflow_status !== expectedPostStatus) fail('CHECKPOINT_POST_STATUS_MISMATCH');
  if (checkpoint.plan_id !== plan.plan_id || checkpoint.plan_digest !== plan.plan_digest) fail('CHECKPOINT_PLAN_BINDING_MISMATCH');
  if (plan.workflow_id !== checkpoint.workflow_id || plan.workflow_state_identity.workflow_digest !== checkpoint.pre_transition_workflow_digest) fail('CHECKPOINT_PRE_WORKFLOW_BINDING_MISMATCH');
  if (stableStringify(plan.source_identity) !== stableStringify(checkpoint.source_identity) || stableStringify(postState.source_identity) !== stableStringify(checkpoint.source_identity)) fail('CHECKPOINT_SOURCE_BINDING_MISMATCH');
  validateUniqueStrings(checkpoint.completed_verified_task_ids, 'completed_verified_task_ids');
  validateUniqueStrings(checkpoint.interrupted_task_ids, 'interrupted_task_ids');
  const expectedInterrupted = Object.entries(checkpoint.task_status_snapshot).filter(([, status]) => status === 'RUNNING').map(([id]) => id).sort();
  if (stableStringify(checkpoint.interrupted_task_ids) !== stableStringify(expectedInterrupted)) fail('CHECKPOINT_INTERRUPTED_TASK_SET_MISMATCH');
  if (!Array.isArray(checkpoint.interrupted_task_records) || stableStringify(checkpoint.interrupted_task_records.map(r => r.task_id).sort()) !== stableStringify(expectedInterrupted)) fail('CHECKPOINT_INTERRUPTED_RECORD_SET_MISMATCH');
  for (const record of checkpoint.interrupted_task_records) validateInterruptedRecord(record, checkpoint, plan, routingRegistry, serviceRegistry);
  for (const id of checkpoint.completed_verified_task_ids) {
    if (checkpoint.task_status_snapshot[id] !== 'COMPLETED' || postState.task_statuses[id] !== 'COMPLETED') fail('COMPLETED_VERIFIED_TASK_NOT_PRESERVED', id);
  }
  if (checkpoint.checkpoint_class === 'PAUSE_CHECKPOINT') for (const id of expectedInterrupted) if (postState.task_statuses[id] === 'RUNNING') fail('PAUSED_WORKFLOW_TASK_LEFT_RUNNING', id);
  for (const field of ['context_package_ids','specialist_output_refs','evaluator_result_refs','evidence_receipt_refs']) if (stableStringify(checkpoint[field]) !== stableStringify(postState[field])) fail('CHECKPOINT_REFERENCE_PRESERVATION_MISMATCH', field);
  if (checkpoint.checkpoint_digest !== checkpointDigest(checkpoint)) fail('CHECKPOINT_DIGEST_MISMATCH');
  return true;
}

function pauseWorkflow(input, routingRegistry = routing.loadDefaultRegistry()) {
  if (!isObject(input)) fail('PAUSE_INPUT_REQUIRED');
  assertNoForbiddenFields(input, 'pause_input');
  const { workflow_state: workflowState, plan, checkpoint_id: checkpointId, checkpoint_created_at: createdAt, verified_task_receipts: receipts, current_source_identity: currentSourceIdentity } = input;
  stateModel.validateWorkflowState(workflowState);
  if (workflowState.workflow_status === 'ADMISSION_PENDING') fail('ADMISSION_PENDING_OUTSIDE_CANCELLATION_AUTHORITY');
  if (!PAUSABLE_STATUSES.has(workflowState.workflow_status)) fail('WORKFLOW_NOT_PAUSABLE', workflowState.workflow_status);
  validatePlanWorkflowBeforeStop(plan, workflowState, routingRegistry);
  stateModel.assertCurrentSourceIdentity(workflowState, currentSourceIdentity);
  if (!nonEmpty(checkpointId) || !nonEmpty(createdAt)) fail('CHECKPOINT_IDENTITY_REQUIRED');
  const verified = validateVerifiedReceipts(receipts || {}, workflowState, plan);
  const interruptedRecords = buildInterruptedTaskRecords(workflowState, plan, routingRegistry);
  const taskStatuses = adjustedTaskStatusesForStop(workflowState, verified, false);
  const postState = stateModel.advanceWorkflowState(workflowState, { workflow_status: 'PAUSED', task_statuses: taskStatuses, checkpoint_ref: checkpointId });
  const checkpoint = createCheckpoint({ checkpointId, checkpointClass: 'PAUSE_CHECKPOINT', preState: workflowState, postState, plan, verifiedTaskIds: [...verified], interruptedTaskRecords: interruptedRecords, createdAt });
  validateCheckpoint(checkpoint, postState, plan, routingRegistry);
  return { workflow_state: postState, checkpoint, original_manuscript_preserved: true, canonical_effect_allowed: false };
}

function cancelWorkflow(input, routingRegistry = routing.loadDefaultRegistry()) {
  if (!isObject(input)) fail('CANCEL_INPUT_REQUIRED');
  assertNoForbiddenFields(input, 'cancel_input');
  const { workflow_state: workflowState, plan, checkpoint_id: checkpointId, checkpoint_created_at: createdAt, cancelled_at: cancelledAt, verified_task_receipts: receipts, current_source_identity: currentSourceIdentity } = input;
  stateModel.validateWorkflowState(workflowState);
  if (workflowState.workflow_status === 'ADMISSION_PENDING') fail('ADMISSION_PENDING_OUTSIDE_CANCELLATION_AUTHORITY');
  if (!CANCELLABLE_STATUSES.has(workflowState.workflow_status)) fail('WORKFLOW_NOT_CANCELLABLE', workflowState.workflow_status);
  validatePlanWorkflowBeforeStop(plan, workflowState, routingRegistry);
  stateModel.assertCurrentSourceIdentity(workflowState, currentSourceIdentity);
  if (!nonEmpty(checkpointId) || !nonEmpty(createdAt) || !nonEmpty(cancelledAt)) fail('CANCELLATION_IDENTITY_REQUIRED');
  const verified = validateVerifiedReceipts(receipts || {}, workflowState, plan);
  const interruptedRecords = buildInterruptedTaskRecords(workflowState, plan, routingRegistry);
  const taskStatuses = adjustedTaskStatusesForStop(workflowState, verified, true);
  const postState = stateModel.advanceWorkflowState(workflowState, { workflow_status: 'CANCELLED', task_statuses: taskStatuses, checkpoint_ref: checkpointId, cancelled_at: cancelledAt });
  const checkpoint = createCheckpoint({ checkpointId, checkpointClass: 'CANCELLATION_CHECKPOINT', preState: workflowState, postState, plan, verifiedTaskIds: [...verified], interruptedTaskRecords: interruptedRecords, createdAt });
  validateCheckpoint(checkpoint, postState, plan, routingRegistry);
  return { workflow_state: postState, checkpoint, resume_disposition: 'NEW_WORKFLOW_REQUIRED_CANCELLED_TERMINAL', original_manuscript_preserved: true, canonical_effect_allowed: false };
}

function sourceIdentityMatches(a, b) { return stableStringify(a) === stableStringify(b); }

function classifyInterruptedTask(record, checkpoint, plan, routingRegistry, serviceRegistry) {
  validateInterruptedRecord(record, checkpoint, plan, routingRegistry, serviceRegistry);
  const task = taskById(plan, record.task_id);
  if (task.task_class === 'SPECIALIST_SERVICE_TASK') {
    if (record.operation_identity.registered_idempotent) return { task_id: task.task_id, disposition: 'READY_FOR_LATER_SCHEDULING', next_task_status: 'READY', operation_digest: record.operation_identity.operation_digest };
    return { task_id: task.task_id, disposition: 'WAITING_FOR_RECONCILIATION', next_task_status: 'BLOCKED', operation_digest: record.operation_identity.operation_digest };
  }
  if (task.task_class === 'AUTHORITY_WAIT') return { task_id: task.task_id, disposition: 'WAITING_FOR_REQUIRED_AUTHORITY', next_task_status: 'BLOCKED', operation_digest: null };
  if (task.task_class === 'DECLARED_BLOCKED_CAPABILITY') return { task_id: task.task_id, disposition: 'BLOCKED_DECLARED_INTERFACE', next_task_status: 'BLOCKED', operation_digest: null };
  return { task_id: task.task_id, disposition: 'BLOCKED_DECLARED_INTERFACE', next_task_status: 'BLOCKED', operation_digest: null };
}

function computeResumeClassification(workflowState, checkpoint, plan, currentSourceIdentity, routingRegistry, serviceRegistry) {
  if (checkpoint.checkpoint_class === 'CANCELLATION_CHECKPOINT' || workflowState.workflow_status === 'CANCELLED') return { resume_allowed: false, disposition_class: 'NEW_WORKFLOW_REQUIRED_CANCELLED_TERMINAL', recommended_workflow_status: null, task_statuses: clone(workflowState.task_statuses), interrupted_task_actions: [] };
  if (workflowState.workflow_status !== 'PAUSED') fail('WORKFLOW_NOT_PAUSED', workflowState.workflow_status);
  if (!sourceIdentityMatches(checkpoint.source_identity, currentSourceIdentity)) return { resume_allowed: false, disposition_class: 'NEW_WORKFLOW_REQUIRED_STALE_SOURCE', recommended_workflow_status: null, task_statuses: clone(workflowState.task_statuses), interrupted_task_actions: [] };
  const taskStatuses = clone(workflowState.task_statuses);
  const actions = checkpoint.interrupted_task_records.map(record => classifyInterruptedTask(record, checkpoint, plan, routingRegistry, serviceRegistry));
  let hasReconciliation = false;
  let hasAuthority = false;
  let hasBlockedInterface = false;
  for (const action of actions) {
    taskStatuses[action.task_id] = action.next_task_status;
    if (action.disposition === 'WAITING_FOR_RECONCILIATION') hasReconciliation = true;
    if (action.disposition === 'WAITING_FOR_REQUIRED_AUTHORITY') hasAuthority = true;
    if (action.disposition === 'BLOCKED_DECLARED_INTERFACE') hasBlockedInterface = true;
  }
  let dispositionClass = 'READY_FOR_LATER_SCHEDULING';
  let recommendedStatus;
  if (hasReconciliation) { dispositionClass = 'WAITING_FOR_RECONCILIATION'; recommendedStatus = 'WAITING_EVIDENCE'; }
  else if (hasAuthority) { dispositionClass = 'WAITING_FOR_REQUIRED_AUTHORITY'; recommendedStatus = 'WAITING_AUTHOR'; }
  else if (hasBlockedInterface) { dispositionClass = 'BLOCKED_DECLARED_INTERFACE'; recommendedStatus = 'WAITING_SPECIALIST'; }
  else if (actions.length > 0 || ['RUNNING','WAITING_SPECIALIST'].includes(checkpoint.pre_transition_workflow_status)) recommendedStatus = 'READY';
  else recommendedStatus = checkpoint.pre_transition_workflow_status;
  return { resume_allowed: true, disposition_class: dispositionClass, recommended_workflow_status: recommendedStatus, task_statuses: taskStatuses, interrupted_task_actions: actions };
}

function deriveResumeDecision(input, routingRegistry = routing.loadDefaultRegistry(), serviceRegistry = retry.loadServiceRegistry()) {
  if (!isObject(input)) fail('RESUME_INPUT_REQUIRED');
  assertNoForbiddenFields(input, 'resume_input');
  const { workflow_state: workflowState, plan, checkpoint, current_source_identity: currentSourceIdentity, decision_id: decisionId, decided_at: decidedAt } = input;
  if (!nonEmpty(decisionId) || !nonEmpty(decidedAt)) fail('RESUME_DECISION_IDENTITY_REQUIRED');
  stateModel.validateWorkflowState(workflowState);
  validateCheckpoint(checkpoint, workflowState, plan, routingRegistry, serviceRegistry);
  const classification = computeResumeClassification(workflowState, checkpoint, plan, currentSourceIdentity, routingRegistry, serviceRegistry);
  const decision = {
    decision_schema_version: RESUME_DECISION_SCHEMA_VERSION,
    decision_id: decisionId,
    workflow_id: workflowState.workflow_id,
    workflow_digest: workflowState.workflow_digest,
    checkpoint_id: checkpoint.checkpoint_id,
    checkpoint_digest: checkpoint.checkpoint_digest,
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    current_source_identity: clone(currentSourceIdentity),
    resume_allowed: classification.resume_allowed,
    disposition_class: classification.disposition_class,
    recommended_workflow_status: classification.recommended_workflow_status,
    task_statuses: classification.task_statuses,
    interrupted_task_actions: classification.interrupted_task_actions,
    canonical_effect_allowed: false,
    provider_execution_performed: false,
    retry_executed: false,
    reconciliation_executed: false,
    book_admission_executed: false,
    decided_at: decidedAt,
    decision_digest: ''
  };
  decision.decision_digest = resumeDecisionDigest(decision);
  validateResumeDecision(decision, workflowState, checkpoint, plan, routingRegistry, serviceRegistry);
  return decision;
}

function validateResumeDecision(decision, workflowState, checkpoint, plan, routingRegistry = routing.loadDefaultRegistry(), serviceRegistry = retry.loadServiceRegistry()) {
  if (!isObject(decision)) fail('RESUME_DECISION_REQUIRED');
  assertNoForbiddenFields(decision, 'resume_decision');
  validateCheckpoint(checkpoint, workflowState, plan, routingRegistry, serviceRegistry);
  if (decision.decision_schema_version !== RESUME_DECISION_SCHEMA_VERSION || !nonEmpty(decision.decision_id) || !nonEmpty(decision.decided_at)) fail('RESUME_DECISION_SCHEMA_OR_IDENTITY_INVALID');
  if (decision.workflow_id !== workflowState.workflow_id || decision.workflow_digest !== workflowState.workflow_digest) fail('STALE_RESUME_WORKFLOW_BINDING');
  if (decision.checkpoint_id !== checkpoint.checkpoint_id || decision.checkpoint_digest !== checkpoint.checkpoint_digest) fail('STALE_RESUME_CHECKPOINT_BINDING');
  if (decision.plan_id !== plan.plan_id || decision.plan_digest !== plan.plan_digest) fail('STALE_RESUME_PLAN_BINDING');
  if (!RESUME_DISPOSITIONS.has(decision.disposition_class)) fail('INVALID_RESUME_DISPOSITION');
  if (decision.canonical_effect_allowed !== false || decision.provider_execution_performed !== false || decision.retry_executed !== false || decision.reconciliation_executed !== false || decision.book_admission_executed !== false) fail('RESUME_EFFECT_AUTHORITY_FORBIDDEN');
  const expected = computeResumeClassification(workflowState, checkpoint, plan, decision.current_source_identity, routingRegistry, serviceRegistry);
  for (const field of ['resume_allowed','disposition_class','recommended_workflow_status']) if (decision[field] !== expected[field]) fail('RESUME_CLASSIFICATION_MISMATCH', field);
  if (stableStringify(decision.task_statuses) !== stableStringify(expected.task_statuses) || stableStringify(decision.interrupted_task_actions) !== stableStringify(expected.interrupted_task_actions)) fail('RESUME_TASK_CLASSIFICATION_MISMATCH');
  if (decision.decision_digest !== resumeDecisionDigest(decision)) fail('RESUME_DECISION_DIGEST_MISMATCH');
  return true;
}

function resumeWorkflow(input, routingRegistry = routing.loadDefaultRegistry(), serviceRegistry = retry.loadServiceRegistry()) {
  const decision = deriveResumeDecision(input, routingRegistry, serviceRegistry);
  if (!decision.resume_allowed) fail('RESUME_NOT_ALLOWED', decision.disposition_class);
  const nextState = stateModel.advanceWorkflowState(input.workflow_state, { workflow_status: decision.recommended_workflow_status, task_statuses: clone(decision.task_statuses) });
  return { workflow_state: nextState, resume_decision: decision, original_manuscript_preserved: true, canonical_effect_allowed: false };
}

module.exports = {
  CHECKPOINT_SCHEMA_VERSION,
  RESUME_DECISION_SCHEMA_VERSION,
  CHECKPOINT_CLASSES,
  RESUME_DISPOSITIONS,
  PAUSABLE_STATUSES,
  CANCELLABLE_STATUSES,
  BookCancellationResumeError,
  stableStringify,
  sourceIdentityDigest,
  checkpointDigest,
  resumeDecisionDigest,
  validateCheckpoint,
  pauseWorkflow,
  cancelWorkflow,
  deriveResumeDecision,
  validateResumeDecision,
  resumeWorkflow
};
