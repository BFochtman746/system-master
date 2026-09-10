'use strict';

const crypto = require('crypto');
const planRuntime = require('./book-workflow-execution-plan');
const routing = require('./book-capability-routing-interface');
const retry = require('./book-workflow-retry-idempotency-rules');

const FAILURE_RECORD_SCHEMA_VERSION = 1;
const FAILURE_CLASSES = new Set([
  'PROVIDER_ERROR_CONFIRMED_NO_EFFECT','PROVIDER_TIMEOUT_UNKNOWN_OUTCOME','PROVIDER_PARTIAL','PROVIDER_ABSTAIN','PROVIDER_REJECTED',
  'MISSING_REQUIRED_EVIDENCE','STALE_SOURCE_OR_PLAN','STALE_CONTEXT_PACKAGE','HARD_GATE_FAILURE','AUTHORITY_UNRESOLVED','DECLARED_INTERFACE_UNAVAILABLE','BOOK_ADMISSION_REJECTED'
]);
const DISPOSITIONS = new Set([
  'RETRY_POLICY_REQUIRED','RECONCILIATION_REQUIRED','FAIL_CLOSED_REQUIRED_TASK','OPTIONAL_FAILURE_CONTINUE_WITH_PARTIAL_EVIDENCE',
  'MISSING_EVIDENCE_FAIL_CLOSED','STALE_EXECUTION_SUPERSEDE_REQUIRED','WAITING_REQUIRED_AUTHORITY','BLOCKED_DECLARED_INTERFACE',
  'PRESERVE_ORIGINAL_HARD_GATE_REJECTION','BOOK_ADMISSION_REJECTION_NO_CANONICAL_EFFECT'
]);
const FORBIDDEN_RAW_FIELDS = new Set(['manuscript_text','passage_text','candidate_text','raw_manuscript','raw_passage','raw_candidate']);

class BookFailureSemanticsError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookFailureSemanticsError';
    this.code = code;
    this.detail = detail;
  }
}
function fail(code, detail='') { throw new BookFailureSemanticsError(code, detail); }
function clone(v) { return v===undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function isObject(v) { return v!==null && typeof v==='object' && !Array.isArray(v); }
function nonEmpty(v) { return typeof v==='string' && v.trim().length>0; }
function stableNormalize(v) {
  if (Array.isArray(v)) return v.map(stableNormalize);
  if (isObject(v)) { const out={}; for (const key of Object.keys(v).sort()) out[key]=stableNormalize(v[key]); return out; }
  return v;
}
function stableStringify(v) { return JSON.stringify(stableNormalize(v)); }
function sha256(v) { return crypto.createHash('sha256').update(String(v),'utf8').digest('hex'); }
function assertNoRawContent(v, where='failure') {
  if (Array.isArray(v)) return v.forEach((x,i)=>assertNoRawContent(x,`${where}.${i}`));
  if (!isObject(v)) return;
  for (const [key,child] of Object.entries(v)) {
    if (FORBIDDEN_RAW_FIELDS.has(key)) fail('RAW_MANUSCRIPT_CONTENT_FORBIDDEN',`${where}.${key}`);
    assertNoRawContent(child,`${where}.${key}`);
  }
}
function recordDigest(record) { const copy=clone(record); delete copy.record_digest; return sha256(stableStringify(copy)); }

function requiredDownstreamTaskIds(plan, failedTaskId) {
  const downstream = new Map(plan.tasks.map(t=>[t.task_id,[]]));
  for (const task of plan.tasks) for (const dep of task.required_dependency_ids) downstream.get(dep).push(task.task_id);
  const seen=new Set(); const queue=[failedTaskId];
  while(queue.length){ const id=queue.shift(); for(const child of downstream.get(id)||[]){ if(seen.has(child)) continue; seen.add(child); queue.push(child); } }
  return [...seen].sort();
}
function blocksRequiredDownstream(plan, taskId) {
  const ids=requiredDownstreamTaskIds(plan,taskId);
  return ids.some(id=>plan.tasks.find(t=>t.task_id===id).required_for_plan_success===true);
}
function providerFailureDisposition(plan, workflowState, task, failureClass, routingRegistry) {
  if (task.task_class!=='SPECIALIST_SERVICE_TASK') fail('PROVIDER_FAILURE_REQUIRES_SPECIALIST_TASK',task.task_id);
  if (['PROVIDER_TIMEOUT_UNKNOWN_OUTCOME','PROVIDER_ERROR_CONFIRMED_NO_EFFECT'].includes(failureClass)) {
    const identity=retry.buildOperationIdentity(plan,workflowState,task.task_id,routingRegistry);
    return identity.registered_idempotent ? 'RETRY_POLICY_REQUIRED' : 'RECONCILIATION_REQUIRED';
  }
  if (task.required_for_plan_success || blocksRequiredDownstream(plan,task.task_id)) return 'FAIL_CLOSED_REQUIRED_TASK';
  return 'OPTIONAL_FAILURE_CONTINUE_WITH_PARTIAL_EVIDENCE';
}
function classifyDisposition(plan, workflowState, task, failureClass, routingRegistry) {
  if (failureClass.startsWith('PROVIDER_')) return providerFailureDisposition(plan,workflowState,task,failureClass,routingRegistry);
  if (failureClass==='MISSING_REQUIRED_EVIDENCE') return 'MISSING_EVIDENCE_FAIL_CLOSED';
  if (failureClass==='STALE_SOURCE_OR_PLAN' || failureClass==='STALE_CONTEXT_PACKAGE') return 'STALE_EXECUTION_SUPERSEDE_REQUIRED';
  if (failureClass==='HARD_GATE_FAILURE') return 'PRESERVE_ORIGINAL_HARD_GATE_REJECTION';
  if (failureClass==='AUTHORITY_UNRESOLVED') {
    if (task.task_class!=='AUTHORITY_WAIT') fail('AUTHORITY_FAILURE_REQUIRES_AUTHORITY_WAIT_TASK',task.task_id);
    return 'WAITING_REQUIRED_AUTHORITY';
  }
  if (failureClass==='DECLARED_INTERFACE_UNAVAILABLE') {
    if (task.task_class!=='DECLARED_BLOCKED_CAPABILITY') fail('INTERFACE_FAILURE_REQUIRES_DECLARED_BLOCKED_TASK',task.task_id);
    return 'BLOCKED_DECLARED_INTERFACE';
  }
  if (failureClass==='BOOK_ADMISSION_REJECTED') {
    if (task.task_class!=='BOOK_ADMISSION_HANDOFF') fail('ADMISSION_FAILURE_REQUIRES_ADMISSION_HANDOFF',task.task_id);
    return 'BOOK_ADMISSION_REJECTION_NO_CANONICAL_EFFECT';
  }
  fail('UNKNOWN_FAILURE_CLASS',failureClass);
}

function deriveFailureRecord(input, routingRegistry=routing.loadDefaultRegistry()) {
  if (!isObject(input)) fail('FAILURE_INPUT_REQUIRED');
  assertNoRawContent(input,'failure_input');
  const { plan, workflow_state:workflowState, failure_record_id:recordId, task_id:taskId, failure_class:failureClass, error_code:errorCode }=input;
  planRuntime.validateExecutionPlan(plan,workflowState,routingRegistry);
  if (!nonEmpty(recordId) || !nonEmpty(taskId) || !nonEmpty(errorCode)) fail('FAILURE_IDENTITY_REQUIRED');
  if (!FAILURE_CLASSES.has(failureClass)) fail('UNKNOWN_FAILURE_CLASS',String(failureClass));
  const task=plan.tasks.find(t=>t.task_id===taskId); if(!task) fail('TASK_NOT_IN_PLAN',taskId);
  const evidenceRefs=Array.isArray(input.evidence_refs)?[...input.evidence_refs]:[];
  if (evidenceRefs.length===0 || evidenceRefs.some(x=>!nonEmpty(x)) || new Set(evidenceRefs).size!==evidenceRefs.length) fail('VALID_FAILURE_EVIDENCE_REFS_REQUIRED');
  const disposition=classifyDisposition(plan,workflowState,task,failureClass,routingRegistry);
  const blocked=requiredDownstreamTaskIds(plan,taskId);
  const record={
    failure_record_schema_version:FAILURE_RECORD_SCHEMA_VERSION,
    failure_record_id:recordId,
    workflow_id:plan.workflow_id,
    workflow_digest:plan.workflow_state_identity.workflow_digest,
    plan_id:plan.plan_id,
    plan_digest:plan.plan_digest,
    source_identity:clone(plan.source_identity),
    task_id:taskId,
    failure_class:failureClass,
    error_code:errorCode,
    evidence_refs:evidenceRefs,
    blocked_downstream_task_ids:blocked,
    disposition_class:disposition,
    canonical_effect_allowed:false,
    original_manuscript_preserved:true,
    record_digest:''
  };
  record.record_digest=recordDigest(record);
  validateFailureRecord(record,plan,workflowState,routingRegistry);
  return record;
}

function validateFailureRecord(record,plan,workflowState,routingRegistry=routing.loadDefaultRegistry()) {
  planRuntime.validateExecutionPlan(plan,workflowState,routingRegistry);
  if (!isObject(record)) fail('FAILURE_RECORD_REQUIRED');
  assertNoRawContent(record,'failure_record');
  if (record.failure_record_schema_version!==FAILURE_RECORD_SCHEMA_VERSION) fail('FAILURE_RECORD_SCHEMA_MISMATCH');
  if (record.workflow_id!==plan.workflow_id || record.workflow_digest!==plan.workflow_state_identity.workflow_digest) fail('STALE_FAILURE_WORKFLOW_BINDING');
  if (record.plan_id!==plan.plan_id || record.plan_digest!==plan.plan_digest) fail('STALE_FAILURE_PLAN_BINDING');
  if (stableStringify(record.source_identity)!==stableStringify(plan.source_identity)) fail('STALE_FAILURE_SOURCE_BINDING');
  if (!FAILURE_CLASSES.has(record.failure_class) || !DISPOSITIONS.has(record.disposition_class)) fail('INVALID_FAILURE_CLASS_OR_DISPOSITION');
  const task=plan.tasks.find(t=>t.task_id===record.task_id); if(!task) fail('TASK_NOT_IN_PLAN',record.task_id);
  const expectedDisposition=classifyDisposition(plan,workflowState,task,record.failure_class,routingRegistry);
  if (record.disposition_class!==expectedDisposition) fail('FAILURE_DISPOSITION_MISMATCH');
  const expectedBlocked=requiredDownstreamTaskIds(plan,record.task_id);
  if (stableStringify(record.blocked_downstream_task_ids)!==stableStringify(expectedBlocked)) fail('BLOCKED_DOWNSTREAM_MISMATCH');
  if (record.canonical_effect_allowed!==false) fail('FAILURE_CANONICAL_EFFECT_FORBIDDEN');
  if (record.original_manuscript_preserved!==true) fail('ORIGINAL_MANUSCRIPT_PRESERVATION_REQUIRED');
  if (record.record_digest!==recordDigest(record)) fail('FAILURE_RECORD_DIGEST_MISMATCH');
  return true;
}

module.exports={
  FAILURE_RECORD_SCHEMA_VERSION,
  FAILURE_CLASSES,
  DISPOSITIONS,
  BookFailureSemanticsError,
  recordDigest,
  requiredDownstreamTaskIds,
  blocksRequiredDownstream,
  deriveFailureRecord,
  validateFailureRecord
};
