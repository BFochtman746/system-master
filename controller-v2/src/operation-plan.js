import { canonicalize, sha256, isUuidV7, isRfc3339 } from './canonical.js';
import { ControllerError } from './errors.js';
import { assertCanonicalSubjectRef } from './subject.js';
import { WORKER_ACTIONS } from './worker-assignment.js';

const OPERATION_TYPES=new Set(['repository-change','analysis','build','test','evidence-collection']);
const JITTER_MODES=new Set(['none','full']);
function fail(code,message,details={}){throw new ControllerError(code,message,details);}
function uniqStrings(values,name,{allowEmpty=false}={}){if(!Array.isArray(values)||(!allowEmpty&&values.length===0))fail('OPERATION_PLAN_INVALID',`${name} must be ${allowEmpty?'an':'a non-empty'} array`);const seen=new Set();for(const v of values){if(typeof v!=='string'||!v)fail('OPERATION_PLAN_INVALID',`${name} entries must be non-empty strings`);if(seen.has(v))fail('OPERATION_PLAN_INVALID',`${name} entries must be unique`);seen.add(v);}return [...seen];}
function safeInt(v,min,max,name){if(!Number.isSafeInteger(v)||v<min||v>max)fail('OPERATION_PLAN_INVALID',`${name} must be integer ${min}..${max}`);return v;}

export function operationPlanDigest(plan){const copy=structuredClone(plan);delete copy.plan_digest;return sha256(canonicalize(copy));}

export function validateOperationPlan(plan){
  if(!plan||typeof plan!=='object'||Array.isArray(plan))fail('OPERATION_PLAN_INVALID','operation plan object required');
  const allowed=['schema','plan_id','transaction_id','operation_id','operation_type','subject_repository','subject','resource_id','allowed_actions','workspace','worker_requirements','dispatch','plan_digest'];
  const required=allowed.filter(k=>k!=='plan_digest');
  for(const k of Object.keys(plan))if(!allowed.includes(k))fail('OPERATION_PLAN_UNKNOWN_FIELD',`unknown operation-plan field ${k}`);
  for(const k of required)if(!(k in plan))fail('OPERATION_PLAN_MISSING_FIELD',`missing operation-plan field ${k}`);
  if(plan.schema!=='controller://schemas/operation-plan/v1')fail('OPERATION_PLAN_SCHEMA_UNSUPPORTED','unsupported operation-plan schema');
  for(const k of ['plan_id','transaction_id','operation_id'])if(!isUuidV7(plan[k]))fail('OPERATION_PLAN_INVALID',`${k} must be UUIDv7`);
  if(!OPERATION_TYPES.has(plan.operation_type))fail('OPERATION_PLAN_INVALID','unsupported operation_type');
  for(const k of ['subject_repository','resource_id'])if(typeof plan[k]!=='string'||!plan[k])fail('OPERATION_PLAN_INVALID',`${k} required`);
  assertCanonicalSubjectRef(plan.subject);

  const actions=uniqStrings(plan.allowed_actions,'allowed_actions');
  for(const action of actions)if(!WORKER_ACTIONS.allowed.includes(action)||WORKER_ACTIONS.forbidden.includes(action))fail('OPERATION_PLAN_AUTHORITY_DENIED',`action ${action} is not assignable to a worker`);

  if(!plan.workspace||typeof plan.workspace!=='object'||Array.isArray(plan.workspace))fail('OPERATION_PLAN_INVALID','workspace required');
  for(const k of Object.keys(plan.workspace))if(!['kind','candidate_ref'].includes(k))fail('OPERATION_PLAN_UNKNOWN_FIELD',`unknown workspace field ${k}`);
  for(const k of ['kind','candidate_ref'])if(typeof plan.workspace[k]!=='string'||!plan.workspace[k])fail('OPERATION_PLAN_INVALID',`workspace.${k} required`);

  if(!plan.worker_requirements||typeof plan.worker_requirements!=='object'||Array.isArray(plan.worker_requirements))fail('OPERATION_PLAN_INVALID','worker_requirements required');
  for(const k of Object.keys(plan.worker_requirements))if(k!=='capabilities')fail('OPERATION_PLAN_UNKNOWN_FIELD',`unknown worker_requirements field ${k}`);
  uniqStrings(plan.worker_requirements.capabilities,'worker_requirements.capabilities',{allowEmpty:true});

  const d=plan.dispatch;
  if(!d||typeof d!=='object'||Array.isArray(d))fail('OPERATION_PLAN_INVALID','dispatch policy required');
  const dispatchKeys=['priority','not_before','max_attempts','lease_ttl_ms','execution_timeout_ms','retry'];
  for(const k of Object.keys(d))if(!dispatchKeys.includes(k))fail('OPERATION_PLAN_UNKNOWN_FIELD',`unknown dispatch field ${k}`);
  for(const k of dispatchKeys)if(!(k in d))fail('OPERATION_PLAN_MISSING_FIELD',`missing dispatch field ${k}`);
  safeInt(d.priority,0,1000,'dispatch.priority');
  if(d.not_before!==null&&!isRfc3339(d.not_before))fail('OPERATION_PLAN_INVALID','dispatch.not_before must be null or Controller UTC timestamp');
  safeInt(d.max_attempts,1,100,'dispatch.max_attempts');
  safeInt(d.lease_ttl_ms,1000,24*60*60*1000,'dispatch.lease_ttl_ms');
  safeInt(d.execution_timeout_ms,1000,7*24*60*60*1000,'dispatch.execution_timeout_ms');
  if(d.lease_ttl_ms>d.execution_timeout_ms)fail('OPERATION_PLAN_INVALID','lease TTL may not exceed execution timeout');
  const r=d.retry;
  if(!r||typeof r!=='object'||Array.isArray(r))fail('OPERATION_PLAN_INVALID','dispatch.retry required');
  for(const k of Object.keys(r))if(!['mode','max_retries','base_delay_ms','max_delay_ms','jitter'].includes(k))fail('OPERATION_PLAN_UNKNOWN_FIELD',`unknown retry field ${k}`);
  for(const k of ['mode','max_retries','base_delay_ms','max_delay_ms','jitter'])if(!(k in r))fail('OPERATION_PLAN_MISSING_FIELD',`missing retry field ${k}`);
  if(!['none','transient'].includes(r.mode))fail('OPERATION_PLAN_INVALID','retry.mode unsupported');
  safeInt(r.max_retries,0,99,'retry.max_retries');safeInt(r.base_delay_ms,0,60*60*1000,'retry.base_delay_ms');safeInt(r.max_delay_ms,0,24*60*60*1000,'retry.max_delay_ms');
  if(r.max_delay_ms<r.base_delay_ms)fail('OPERATION_PLAN_INVALID','retry max delay must be >= base delay');
  if(!JITTER_MODES.has(r.jitter))fail('OPERATION_PLAN_INVALID','retry.jitter unsupported');
  if(r.mode==='none'&&(r.max_retries!==0||r.base_delay_ms!==0||r.max_delay_ms!==0||r.jitter!=='none'))fail('OPERATION_PLAN_INVALID','retry mode none must have zero budget and no jitter');
  if(r.mode==='transient'&&r.max_retries!==d.max_attempts-1)fail('OPERATION_PLAN_INVALID','transient retry budget must equal max_attempts - 1');
  if(plan.plan_digest&&plan.plan_digest!==operationPlanDigest(plan))fail('OPERATION_PLAN_DIGEST_MISMATCH','operation plan digest mismatch');
  return true;
}

export function createOperationPlan(input){const plan={...structuredClone(input),schema:'controller://schemas/operation-plan/v1'};delete plan.plan_digest;validateOperationPlan(plan);plan.plan_digest=operationPlanDigest(plan);return Object.freeze(plan);}

export function assertPlanMatchesTransaction(plan,{transactionId,operationId,subjectRepository,subject,resourceId}){
  validateOperationPlan(plan);
  const checks=[['transaction_id',transactionId],['operation_id',operationId],['subject_repository',subjectRepository],['resource_id',resourceId]];
  for(const [field,expected] of checks)if(plan[field]!==expected)fail('OPERATION_PLAN_BINDING_MISMATCH',`${field} does not match controller state`,{field,expected,actual:plan[field]});
  if(plan.subject.algorithm!==subject.algorithm||plan.subject.oid!==subject.oid)fail('OPERATION_PLAN_BINDING_MISMATCH','subject does not match controller state');
  return true;
}

export function schedulerEligibility(plan,{nowMs=Date.now(),attempts=0,workerCapabilities=[]}={}){
  validateOperationPlan(plan);
  if(attempts>=plan.dispatch.max_attempts)return {eligible:false,reason:'ATTEMPT_BUDGET_EXHAUSTED'};
  if(plan.dispatch.not_before!==null&&Date.parse(plan.dispatch.not_before)>nowMs)return {eligible:false,reason:'NOT_BEFORE'};
  const offered=new Set(workerCapabilities);
  for(const capability of plan.worker_requirements.capabilities)if(!offered.has(capability))return {eligible:false,reason:'WORKER_CAPABILITY_MISMATCH'};
  return {eligible:true,reason:null};
}

export const OPERATION_PLAN_INVARIANTS=Object.freeze({immutable_after_binding:true,scheduler_may_only_narrow_authority:true,retry_layer:'scheduler',worker_cannot_expand_actions:true,exact_subject_binding:true,exact_resource_binding:true});
