import test from 'node:test';
import assert from 'node:assert/strict';
import { uuidv7 } from '../src/canonical.js';
import { createWorkerAssignment, validateWorkerAssignment, assertAssignmentMatchesLease, WORKER_ACTIONS } from '../src/worker-assignment.js';

function base(now=Date.now()){
  return {
    assignment_id:uuidv7(now),transaction_id:uuidv7(now+1),operation_id:uuidv7(now+2),lease_id:uuidv7(now+3),fencing_generation:7,
    resource_id:'repo:BFochtman746/system-master',worker_id:'second-shift:worker-1',subject_repository:'BFochtman746/system-master',
    subject:{algorithm:'sha1',oid:'b'.repeat(40)},controller_version:'controller@abc123',policy_version:'policy@v1',
    issued_at:new Date(now).toISOString(),expires_at:new Date(now+60000).toISOString(),
    allowed_actions:['checkout-subject','create-workspace','analyze','edit-candidate','build','test','collect-evidence','emit-result'],
    workspace:{kind:'isolated-worktree',id:'ws-001',candidate_ref:'refs/heads/controller-candidate/ws-001'}
  };
}

function authority(a){return {transactionId:a.transaction_id,operationId:a.operation_id,leaseId:a.lease_id,generation:a.fencing_generation,resourceId:a.resource_id,workerId:a.worker_id,subjectRepository:a.subject_repository,subject:a.subject,controllerVersion:a.controller_version,policyVersion:a.policy_version};}

test('WA-T001 assignment is immutable, hashed, and schema-bound',()=>{const a=createWorkerAssignment(base());assert.equal(a.schema,'controller://schemas/worker-assignment/v1');assert.ok(a.assignment_digest);assert.equal(Object.isFrozen(a),true);assert.equal(validateWorkerAssignment(a),true);});

test('WA-T002 byte-semantic mutation invalidates assignment digest',()=>{const a=createWorkerAssignment(base()),x=structuredClone(a);x.worker_id='second-shift:other';assert.throws(()=>validateWorkerAssignment(x),e=>e.code==='ASSIGNMENT_DIGEST_MISMATCH');});

test('WA-T003 worker can never be assigned promotion authority',()=>{const x=base();x.allowed_actions.push('promote');assert.throws(()=>createWorkerAssignment(x),e=>e.code==='WORKER_AUTHORITY_DENIED');});

test('WA-T004 worker can never be assigned controller-state mutation',()=>{const x=base();x.allowed_actions.push('write-controller-state');assert.throws(()=>createWorkerAssignment(x),e=>e.code==='WORKER_AUTHORITY_DENIED');});

test('WA-T005 every dangerous action remains explicitly forbidden',()=>{const a=createWorkerAssignment(base());for(const x of WORKER_ACTIONS.forbidden)assert.ok(a.forbidden_actions.includes(x));});

test('WA-T006 exact lease/controller/policy/subject binding passes',()=>{const a=createWorkerAssignment(base());assert.equal(assertAssignmentMatchesLease(a,authority(a),Date.parse(a.issued_at)+1),true);});

test('WA-T007 stale fencing generation cannot use assignment',()=>{const a=createWorkerAssignment(base()),auth=authority(a);auth.generation+=1;assert.throws(()=>assertAssignmentMatchesLease(a,auth,Date.parse(a.issued_at)+1),e=>e.code==='ASSIGNMENT_BINDING_MISMATCH');});

test('WA-T008 different exact subject cannot inherit assignment',()=>{const a=createWorkerAssignment(base()),auth=authority(a);auth.subject={algorithm:'sha1',oid:'c'.repeat(40)};assert.throws(()=>assertAssignmentMatchesLease(a,auth,Date.parse(a.issued_at)+1),e=>e.code==='ASSIGNMENT_BINDING_MISMATCH');});

test('WA-T009 expired assignment cannot start or resume work',()=>{const a=createWorkerAssignment(base());assert.throws(()=>assertAssignmentMatchesLease(a,authority(a),Date.parse(a.expires_at)),e=>e.code==='ASSIGNMENT_EXPIRED');});

test('WA-T010 unknown assignment fields fail closed',()=>{const a=structuredClone(createWorkerAssignment(base()));a.unreviewed_capability=true;delete a.assignment_digest;assert.throws(()=>validateWorkerAssignment(a),e=>e.code==='ASSIGNMENT_UNKNOWN_FIELD');});

test('WA-T011 candidate workspace is explicit and cannot be omitted',()=>{const x=base();delete x.workspace;assert.throws(()=>createWorkerAssignment(x),e=>e.code==='ASSIGNMENT_MISSING_FIELD');});

test('WA-T012 assignment digest is stable for the same semantic envelope',()=>{const x=base(1770000000000),a=createWorkerAssignment(x),b=createWorkerAssignment(structuredClone(x));assert.equal(a.assignment_digest,b.assignment_digest);});
