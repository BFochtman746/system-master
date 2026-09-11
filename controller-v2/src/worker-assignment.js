import { canonicalize, sha256, isUuidV7, isRfc3339 } from './canonical.js';
import { ControllerError } from './errors.js';
import { assertCanonicalSubjectRef } from './subject.js';

const SAFE_ACTIONS=new Set(['checkout-subject','create-workspace','analyze','edit-candidate','build','test','static-analysis','collect-evidence','emit-result']);
const FORBIDDEN_ACTIONS=new Set(['promote','qualify','write-controller-state','seal-outbox','mutate-policy','mutate-journal','mutate-subject-main','assign-work','acquire-authority']);

function fail(code,message,details={}){throw new ControllerError(code,message,details);}
function uniqueStrings(values,name){if(!Array.isArray(values)||values.length===0)fail('ASSIGNMENT_INVALID',`${name} must be non-empty array`);const out=[];for(const v of values){if(typeof v!=='string'||!v)fail('ASSIGNMENT_INVALID',`${name} entries must be non-empty strings`);if(out.includes(v))fail('ASSIGNMENT_INVALID',`${name} entries must be unique`);out.push(v);}return out;}

export function assignmentDigest(assignment){const x=structuredClone(assignment);delete x.assignment_digest;return sha256(x);}

export function validateWorkerAssignment(a){
  if(!a||typeof a!=='object'||Array.isArray(a))fail('ASSIGNMENT_INVALID','assignment object required');
  const allowed=['schema','assignment_id','transaction_id','operation_id','lease_id','fencing_generation','resource_id','worker_id','subject_repository','subject','controller_version','policy_version','issued_at','expires_at','allowed_actions','forbidden_actions','workspace','assignment_digest'];
  const required=allowed.filter(k=>k!=='assignment_digest');
  for(const k of Object.keys(a))if(!allowed.includes(k))fail('ASSIGNMENT_UNKNOWN_FIELD',`unknown assignment field ${k}`);
  for(const k of required)if(!(k in a))fail('ASSIGNMENT_MISSING_FIELD',`missing assignment field ${k}`);
  if(a.schema!=='controller://schemas/worker-assignment/v1')fail('ASSIGNMENT_SCHEMA_UNSUPPORTED','unsupported assignment schema');
  for(const k of ['assignment_id','transaction_id','operation_id','lease_id'])if(!isUuidV7(a[k]))fail('ASSIGNMENT_INVALID',`${k} must be UUIDv7`);
  if(!Number.isInteger(a.fencing_generation)||a.fencing_generation<1)fail('ASSIGNMENT_INVALID','positive fencing_generation required');
  for(const k of ['resource_id','worker_id','subject_repository','controller_version','policy_version'])if(typeof a[k]!=='string'||!a[k])fail('ASSIGNMENT_INVALID',`${k} required`);
  assertCanonicalSubjectRef(a.subject);
  if(!isRfc3339(a.issued_at)||!isRfc3339(a.expires_at)||Date.parse(a.expires_at)<=Date.parse(a.issued_at))fail('ASSIGNMENT_INVALID','valid increasing issued_at/expires_at required');
  const actions=uniqueStrings(a.allowed_actions,'allowed_actions');
  for(const action of actions)if(!SAFE_ACTIONS.has(action)||FORBIDDEN_ACTIONS.has(action))fail('WORKER_AUTHORITY_DENIED',`worker action ${action} is not assignable`);
  const forbidden=uniqueStrings(a.forbidden_actions,'forbidden_actions');
  for(const action of FORBIDDEN_ACTIONS)if(!forbidden.includes(action))fail('ASSIGNMENT_INVALID',`forbidden action ${action} must be explicit`);
  if(!a.workspace||typeof a.workspace!=='object'||Array.isArray(a.workspace))fail('ASSIGNMENT_INVALID','workspace object required');
  const workspaceKeys=['kind','id','candidate_ref'];for(const k of Object.keys(a.workspace))if(!workspaceKeys.includes(k))fail('ASSIGNMENT_INVALID',`unknown workspace field ${k}`);for(const k of workspaceKeys)if(typeof a.workspace[k]!=='string'||!a.workspace[k])fail('ASSIGNMENT_INVALID',`workspace.${k} required`);
  if(a.assignment_digest&&a.assignment_digest!==assignmentDigest(a))fail('ASSIGNMENT_DIGEST_MISMATCH','assignment digest mismatch');
  return true;
}

export function createWorkerAssignment(input){
  const assignment={...structuredClone(input),schema:'controller://schemas/worker-assignment/v1'};
  delete assignment.assignment_digest;
  if(!assignment.forbidden_actions)assignment.forbidden_actions=[...FORBIDDEN_ACTIONS];
  validateWorkerAssignment(assignment);
  assignment.assignment_digest=assignmentDigest(assignment);
  return Object.freeze(assignment);
}

export function assertAssignmentMatchesLease(assignment,{transactionId,operationId,leaseId,generation,resourceId,workerId,subjectRepository,subject,controllerVersion,policyVersion},nowMs=Date.now()){
  validateWorkerAssignment(assignment);
  const checks=[['transaction_id',transactionId],['operation_id',operationId],['lease_id',leaseId],['fencing_generation',generation],['resource_id',resourceId],['worker_id',workerId],['subject_repository',subjectRepository],['controller_version',controllerVersion],['policy_version',policyVersion]];
  for(const [field,expected] of checks)if(assignment[field]!==expected)fail('ASSIGNMENT_BINDING_MISMATCH',`${field} does not match authoritative controller state`,{field,expected,actual:assignment[field]});
  if(assignment.subject.algorithm!==subject.algorithm||assignment.subject.oid!==subject.oid)fail('ASSIGNMENT_BINDING_MISMATCH','subject does not match authoritative controller state');
  if(Date.parse(assignment.expires_at)<=nowMs)fail('ASSIGNMENT_EXPIRED','worker assignment expired');
  return true;
}

export const WORKER_ACTIONS=Object.freeze({allowed:Object.freeze([...SAFE_ACTIONS]),forbidden:Object.freeze([...FORBIDDEN_ACTIONS])});
