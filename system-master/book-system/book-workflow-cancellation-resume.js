'use strict';

const crypto = require('crypto');
const stateModel = require('./book-workflow-state-model');
const planRuntime = require('./book-workflow-execution-plan');
const retry = require('./book-workflow-retry-idempotency-rules');
const routing = require('./book-capability-routing-interface');

const CHECKPOINT_SCHEMA_VERSION = 1;
const CHECKPOINT_CLASSES = new Set(['PAUSE_CHECKPOINT', 'CANCELLATION_CHECKPOINT']);
const PAUSABLE_STATUSES = new Set(['PLANNING','READY','RUNNING','WAITING_SPECIALIST','WAITING_EVIDENCE','WAITING_AUTHOR','READY_FOR_ADMISSION_HANDOFF']);
const CANCELLABLE_STATUSES = new Set(['CREATED','PLANNING','READY','RUNNING','WAITING_SPECIALIST','WAITING_EVIDENCE','WAITING_AUTHOR','READY_FOR_ADMISSION_HANDOFF','PAUSED']);
const FORBIDDEN_RAW_FIELDS = new Set(['manuscript_text','passage_text','candidate_text','raw_manuscript','raw_passage','raw_candidate']);

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
function checkpointDigest(checkpoint) {
  const copy = clone(checkpoint);
  delete copy.checkpoint_digest;
  return sha256(stableStringify(copy));
}
function assertNoRawContent(value, where = 'cancellation_resume') {
  if (Array.isArray(value)) return value.forEach((item, i) => assertNoRawContent(item, `${where}.${i}`));
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_RAW_FIELDS.has(key)) fail('RAW_MANUSCRIPT_CONTENT_FORBIDDEN', `${where}.${key}`);
    assertNoRawContent(child, `${where}.${key}`);
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
function validatePlanWorkflowAlignment(plan, workflowState, routingRegistry) {
  planRuntime.validateExecutionPlan(plan, workflowState, routingRegistry);
  const planIds = plan.tasks.map(t => t.task_id).sort();
  const workflowIds = [...workflowState.planned_task_refs].sort();
  if (stableStringify(planIds) !== stableStringify(workflowIds)) fail('WORKFLOW_PLAN_TASK_SET_MISMATCH');
  for (const id of planIds) if (!Object.prototype.hasOwnProperty.call(workflowState.task_statuses, id)) fail('WORKFLOW_TASK_STATUS_MISSING', id);
}
function validateVerifiedReceipts(receipts, workflowState, plan) {
  if (!isObject(receipts)) fail('VERIFIED_TASK_RECEIPTS_OBJECT_REQUIRED');
  const sourceDigest = sourceIdentityDigest(plan.source_identity);
  const verified = new Set();
  for (const [taskId, receipt] of Object.entries(receipts)) {
    if (!plan.tasks.some(t => t.task_id === taskId)) fail('VERIFIED_RECEIPT_TASK_NOT_IN_PLAN', taskId);
    if (!isObject(receipt)) fail('VERIFIED_TASK_RECEIPT_REQUIRED', taskId);
    for (const field of ['receipt_ref','workflow_digest','plan_digest','source_identity_digest']) {
      if (!Object.prototype.hasOwnProperty.call(receipt, field)) fail('VERIFIED_TASK_RECEIPT_FIELD_MISSING', `${taskId}:${field}`);
    }
    if (!nonEmpty(receipt.receipt_ref)) fail('VERIFIED_TASK_RECEIPT_REF_REQUIRED', taskId);
    if (receipt.workflow_digest !== workflowState.workflow_digest) fail('VERIFIED_RECEIPT_WORKFLOW_MISMATCH', taskId);
    if (receipt.plan_digest !== plan.plan_digest) fail('VERIFIED_RECEIPT_PLAN_MISMATCH', taskId);
    if (receipt.source_identity_digest !== sourceDigest) fail('VERIFIED_RECEIPT_SOURCE_MISMATCH', taskId);
    if (workflowState.task_statuses[taskId] !== 'COMPLETED') fail('VERIFIED_RECEIPT_REQUIRES_COMPLETED_TASK', taskId);
    verified.add(taskId);
  }
  return verified;
}
function adjustedTaskStatusesForStop(workflowState, verified, terminalCancel) {
  const statuses = clone(workflowState.task_statuses);
  const interrupted = [];
  for (const [taskId, status] of Object.entries(statuses)) {
    if (status === 'RUNNING') {
      interrupted.push(taskId);
      statuses[taskId] = terminalCancel ? 'CANCELLED' : 'BLOCKED';
    } else if (status === 'COMPLETED') {
      if (!verified.has(taskId)) statuses[taskId] = terminalCancel ? 'CANCELLED' : 'BLOCKED';
    } else if (terminalCancel && !['COMPLETED','SUPERSEDED'].includes(status)) {
      statuses[taskId] = 'CANCELLED';
    }
  }
  return { statuses, interrupted: interrupted.sort() };
}
function createCheckpoint({ checkpointId, checkpointClass, preState, postState, plan, verifiedTaskIds, interruptedTaskIds, createdAt }) {
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
    task_status_snapshot: clone(postState.task_statuses),
    dependency_status_snapshot: clone(postState.dependency_status),
    context_package_ids: clone(postState.context_package_ids),
    specialist_output_refs: clone(postState.specialist_output_refs),
    evaluator_result_refs: clone(postState.evaluator_result_refs),
    evidence_receipt_refs: clone(postState.evidence_receipt_refs),
    completed_verified_task_ids: [...verifiedTaskIds].sort(),
    interrupted_task_ids: [...interruptedTaskIds].sort(),
    checkpoint_created_at: createdAt,
    checkpoint_digest: ''
  };
  checkpoint.checkpoint_digest = checkpointDigest(checkpoint);
  return checkpoint;
}
function validateCheckpoint(checkpoint, postState, plan) {
  if (!isObject(checkpoint)) fail('CHECKPOINT_REQUIRED');
  assertNoRawContent(checkpoint, 'checkpoint');
  if (checkpoint.checkpoint_schema_version !== CHECKPOINT_SCHEMA_VERSION) fail('CHECKPOINT_SCHEMA_MISMATCH');
  if (!CHECKPOINT_CLASSES.has(checkpoint.checkpoint_class)) fail('INVALID_CHECKPOINT_CLASS');
  if (!nonEmpty(checkpoint.checkpoint_id) || !nonEmpty(checkpoint.checkpoint_created_at)) fail('CHECKPOINT_IDENTITY_REQUIRED');
  if (checkpoint.workflow_id !== postState.workflow_id) fail('CHECKPOINT_WORKFLOW_ID_MISMATCH');
  if (checkpoint.post_transition_workflow_version !== postState.workflow_version || checkpoint.post_transition_workflow_digest !== postState.workflow_digest) fail('CHECKPOINT_POST_WORKFLOW_MISMATCH');
  if (checkpoint.plan_id !== plan.plan_id || checkpoint.plan_digest !== plan.plan_digest) fail('CHECKPOINT_PLAN_MISMATCH');
  if (stableStringify(checkpoint.source_identity) !== stableStringify(plan.source_identity)) fail('CHECKPOINT_SOURCE_MISMATCH');
  validateUniqueStrings(checkpoint.completed_verified_task_ids, 'completed_verified_task_ids');
  validateUniqueStrings(checkpoint.interrupted_task_ids, 'interrupted_task_ids');
  if (stableStringify(checkpoint.task_status_snapshot) !== stableStringify(postState.task_statuses)) fail('CHECKPOINT_TASK_SNAPSHOT_MISMATCH');
  if (stableStringify(checkpoint.dependency_status_snapshot) !== stableStringify(postState.dependency_status)) fail('CHECKPOINT_DEPENDENCY_SNAPSHOT_MISMATCH');
  for (const field of ['context_package_ids','specialist_output_refs','evaluator_result_refs','evidence_receipt_refs']) {
    if (stableStringify(checkpoint[field]) !== stableStringify(postState[field])) fail('CHECKPOINT_REFERENCE_SNAPSHOT_MISMATCH', field);
  }
  if (checkpoint.checkpoint_digest !== checkpointDigest(checkpoint)) fail('CHECKPOINT_DIGEST_MISMATCH');
  return true;
}

function pauseWorkflow(input, routingRegistry = routing.loadDefaultRegistry()) {
  if (!isObject(input)) fail('PAUSE_INPUT_REQUIRED');
  assertNoRawContent(input, 'pause_input');
  const { workflow_state: workflowState, plan, checkpoint_id: checkpointId, checkpoint_created_at: createdAt, verified_task_receipts: receipts } = input;
  stateModel.validateWorkflowState(workflowState);
  if (workflowState.workflow_status === 'ADMISSION_PENDING') fail('ADMISSION_PENDING_OUTSIDE_CANCELLATION_AUTHORITY');
  if (!PAUSABLE_STATUSES.has(workflowState.workflow_status)) fail('WORKFLOW_NOT_PAUSABLE', workflowState.workflow_status);
  validatePlanWorkflowAlignment(plan, workflowState, routingRegistry);
  if (!nonEmpty(checkpointId) || !nonEmpty(createdAt)) fail('CHECKPOINT_IDENTITY_REQUIRED');
  const verified = validateVerifiedReceipts(receipts || {}, workflowState, plan);
  const adjusted = adjustedTaskStatusesForStop(workflowState, verified, false);
  const postState = stateModel.advanceWorkflowState(workflowState, {
    workflow_status: 'PAUSED',
    task_statuses: adjusted.statuses,
    checkpoint_ref: checkpointId
  });
  const checkpoint = createCheckpoint({ checkpointId, checkpointClass:'PAUSE_CHECKPOINT', preState:workflowState, postState, plan, verifiedTaskIds:[...verified], interruptedTaskIds:adjusted.interrupted, createdAt });
  validateCheckpoint(checkpoint, postState, plan);
  return { workflow_state: postState, checkpoint, original_manuscript_preserved: true, canonical_effect_allowed: false };
}

function cancelWorkflow(input, routingRegistry = routing.loadDefaultRegistry()) {
  if (!isObject(input)) fail('CANCEL_INPUT_REQUIRED');
  assertNoRawContent(input, 'cancel_input');
  const { workflow_state: workflowState, plan, checkpoint_id: checkpointId, checkpoint_created_at: createdAt, cancelled_at: cancelledAt, verified_task_receipts: receipts } = input;
  stateModel.validateWorkflowState(workflowState);
  if (workflowState.workflow_status === 'ADMISSION_PENDING') fail('ADMISSION_PENDING_OUTSIDE_CANCELLATION_AUTHORITY');
  if (!CANCELLABLE_STATUSES.has(workflowState.workflow_status)) fail('WORKFLOW_NOT_CANCELLABLE', workflowState.workflow_status);
  validatePlanWorkflowAlignment(plan, workflowState, routingRegistry);
  if (!nonEmpty(checkpointId) || !nonEmpty(createdAt) || !nonEmpty(cancelledAt)) fail('CANCELLATION_IDENTITY_REQUIRED');
  const verified = validateVerifiedReceipts(receipts || {}, workflowState, plan);
  const adjusted = adjustedTaskStatusesForStop(workflowState, verified, true);
  const postState = stateModel.advanceWorkflowState(workflowState, {
    workflow_status: 'CANCELLED',
    task_statuses: adjusted.statuses,
    checkpoint_ref: checkpointId,
    cancelled_at: cancelledAt
  });
  const checkpoint = createCheckpoint({ checkpointId, checkpointClass:'CANCELLATION_CHECKPOINT', preState:workflowState, postState, plan, verifiedTaskIds:[...verified], interruptedTaskIds:adjusted.interrupted, createdAt });
  validateCheckpoint(checkpoint, postState, plan);
  return { workflow_state: postState, checkpoint, resume_disposition: 'NEW_WORKFLOW_REQUIRED_CANCELLED_TERMINAL', original_manuscript_preserved: true, canonical_effect_allowed: false };
}

function classifyInterruptedTask(task, plan, workflowState, routingRegistry) {
  if (task.task_class === 'AUTHORITY_WAIT') return { task_id:task.task_id, disposition:'WAITING_FOR_REQUIRED_AUTHORITY', next_task_status:'BLOCKED' };
  if (task.task_class === 'DECLARED_BLOCKED_CAPABILITY') return { task_id:task.task_id, disposition:'BLOCKED_DECLARED_INTERFACE', next_task_status:'BLOCKED' };
  if (task.task_class === 'BOOK_ADMISSION_HANDOFF') return { task_id:task.task_id, disposition:'WAITING_FOR_REQUIRED_AUTHORITY', next_task_status:'BLOCKED' };
  const identity = retry.buildOperationIdentity(plan, workflowState, task.task_id, routingRegistry);
  if (identity.registered_idempotent) return { task_id:task.task_id, disposition:'READY_FOR_LATER_SCHEDULING', next_task_status:'READY' };
  return { task_id:task.task_id, disposition:'WAITING_FOR_RECONCILIATION', next_task_status:'BLOCKED' };
}

function resumeWorkflow(input, routingRegistry = routing.loadDefaultRegistry()) {
  if (!isObject(input)) fail('RESUME_INPUT_REQUIRED');
  assertNoRawContent(input, 'resume_input');
  const { workflow_state: workflowState, plan, checkpoint, current_source_identity: currentSourceIdentity } = input;
  stateModel.validateWorkflowState(workflowState);
  if (workflowState.workflow_status === 'CANCELLED') {
    return { resumed:false, disposition:'NEW_WORKFLOW_REQUIRED_CANCELLED_TERMINAL', workflow_state:clone(workflowState), original_manuscript_preserved:true, canonical_effect_allowed:false };
  }
  if (workflowState.workflow_status !== 'PAUSED') fail('WORKFLOW_NOT_PAUSED', workflowState.workflow_status);
  validatePlanWorkflowAlignment(plan, workflowState, routingRegistry);
  validateCheckpoint(checkpoint, workflowState, plan);
  if (checkpoint.checkpoint_class !== 'PAUSE_CHECKPOINT') fail('RESUME_REQUIRES_PAUSE_CHECKPOINT');
  try {
    stateModel.assertCurrentSourceIdentity(workflowState, currentSourceIdentity);
  } catch (err) {
    if (err.code === 'STALE_WORKFLOW_SOURCE_IDENTITY') {
      return { resumed:false, disposition:'NEW_WORKFLOW_REQUIRED_STALE_SOURCE', workflow_state:clone(workflowState), original_manuscript_preserved:true, canonical_effect_allowed:false };
    }
    throw err;
  }
  const nextStatuses = clone(workflowState.task_statuses);
  const taskDispositions = [];
  for (const taskId of checkpoint.interrupted_task_ids) {
    const task = plan.tasks.find(t => t.task_id === taskId);
    if (!task) fail('CHECKPOINT_INTERRUPTED_TASK_NOT_IN_PLAN', taskId);
    const disposition = classifyInterruptedTask(task, plan, workflowState, routingRegistry);
    taskDispositions.push(disposition);
    nextStatuses[taskId] = disposition.next_task_status;
  }
  const blockers = taskDispositions.filter(d => d.disposition !== 'READY_FOR_LATER_SCHEDULING');
  if (blockers.length) {
    const priority = blockers.some(d => d.disposition === 'WAITING_FOR_RECONCILIATION') ? 'WAITING_FOR_RECONCILIATION'
      : blockers.some(d => d.disposition === 'WAITING_FOR_REQUIRED_AUTHORITY') ? 'WAITING_FOR_REQUIRED_AUTHORITY'
      : 'BLOCKED_DECLARED_INTERFACE';
    return { resumed:false, disposition:priority, task_dispositions:taskDispositions, workflow_state:clone(workflowState), original_manuscript_preserved:true, canonical_effect_allowed:false };
  }
  const postState = stateModel.advanceWorkflowState(workflowState, {
    workflow_status: 'READY',
    task_statuses: nextStatuses
  });
  return { resumed:true, disposition:'READY_FOR_LATER_SCHEDULING', task_dispositions:taskDispositions, workflow_state:postState, original_manuscript_preserved:true, canonical_effect_allowed:false };
}

module.exports = {
  CHECKPOINT_SCHEMA_VERSION,
  CHECKPOINT_CLASSES,
  PAUSABLE_STATUSES,
  CANCELLABLE_STATUSES,
  BookCancellationResumeError,
  stableStringify,
  sourceIdentityDigest,
  checkpointDigest,
  validateCheckpoint,
  pauseWorkflow,
  cancelWorkflow,
  resumeWorkflow
};
