import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ControllerKernel, ControllerError } from '../src/kernel.js';
import { reduceSemanticEvents, rebuildControllerStore } from '../src/recovery.js';
import { uuidv7 } from '../src/canonical.js';

const SHA='0123456789abcdef0123456789abcdef01234567';
function command(){return {protocol_version:'1.0',schema:'controller://schemas/command/v1',command_id:uuidv7(),created_at:new Date().toISOString(),issuer:{principal:'user:test',source:'chatgpt'},command_type:'controller.work.submit',target:{repository:'BFochtman746/system-master',expected_subject_sha:SHA},preconditions:{},intent:{task:'recovery'},constraints:{},required_policy_version:null};}
function tempDb(){const dir=mkdtempSync(join(tmpdir(),'controller-v2-recovery-'));return {dir,db:join(dir,'recovered.sqlite')};}
function assertCode(fn,code){assert.throws(fn,e=>e instanceof ControllerError&&e.code===code);}

test('RC-T001 semantic replay recognizes terminal typed worker result',()=>{
  const k=new ControllerKernel(':memory:');const tx=k.acceptCommand(command()).transaction_id;const op=k.createOperation(tx,{resourceId:'r'});k.transitionOperation(op,'READY');k.transitionOperation(op,'RUNNING');const l=k.acquireLease(op,'r','worker',60000);k.submitWorkerResult({leaseId:l.lease_id,generation:l.generation,operationId:op,result:'SUCCEEDED'});const state=reduceSemanticEvents(k.exportEvents());assert.equal(state.operations[op].state,'SUCCEEDED');assert.equal(k.db.prepare('SELECT status FROM leases WHERE lease_id=?').get(l.lease_id).status,'RELEASED');k.close();
});

test('RC-T002 durable journal rebuild restores promotion barrier and remains executable',()=>{
  const source=new ControllerKernel(':memory:');const tx=source.acceptCommand(command()).transaction_id;const q=source.createQualification(tx,SHA,'policy-1');source.finishQualification(q,'PASSED');const p=source.requestPromotion(tx,q,SHA);source.authorizePromotion(p);source.sealAllOutbox();const events=source.exportEvents();source.close();
  const {dir,db}=tempDb();try{const recovered=rebuildControllerStore(db,events);assert.equal(recovered.pendingOutbox().length,0);let applied=0;assert.equal(recovered.executePromotion(p,{apply(){applied+=1;},observe(){return false;}}),'SUCCEEDED');assert.equal(applied,1);recovered.close();}finally{rmSync(dir,{recursive:true,force:true});}
});

test('RC-T003 recovery preserves fencing generation but never resurrects an active lease',()=>{
  const source=new ControllerKernel(':memory:');const tx=source.acceptCommand(command()).transaction_id;const op=source.createOperation(tx,{resourceId:'r'});source.transitionOperation(op,'READY');source.transitionOperation(op,'RUNNING');const old=source.acquireLease(op,'r','old-worker',60000,1000);source.sealAllOutbox();const events=source.exportEvents();source.close();
  const {dir,db}=tempDb();try{const recovered=rebuildControllerStore(db,events);assert.equal(recovered.db.prepare("SELECT COUNT(*) n FROM leases WHERE status='ACTIVE'").get().n,0);assert.equal(recovered.db.prepare("SELECT generation FROM resource_generations WHERE resource_id='r'").get().generation,old.generation);const next=recovered.acquireLease(op,'r','new-worker',60000,2000);assert.equal(next.generation,old.generation+1);assertCode(()=>recovered.assertWorkerLease({leaseId:old.lease_id,generation:old.generation,operationId:op},2001),'NOT_FOUND');recovered.close();}finally{rmSync(dir,{recursive:true,force:true});}
});

test('RC-T004 tampered durable event is rejected before rebuild',()=>{
  const k=new ControllerKernel(':memory:');k.acceptCommand(command());const events=k.exportEvents();k.close();events[0].data.command_type='tampered';assertCode(()=>reduceSemanticEvents(events),'EVENT_INTEGRITY_FAILURE');
});

test('RC-T005 rebuild refuses a non-empty target store',()=>{
  const source=new ControllerKernel(':memory:');source.acceptCommand(command());source.sealAllOutbox();const events=source.exportEvents();source.close();const {dir,db}=tempDb();try{const existing=new ControllerKernel(db);existing.acceptCommand(command());existing.close();assertCode(()=>rebuildControllerStore(db,events),'RECOVERY_TARGET_NOT_EMPTY');}finally{rmSync(dir,{recursive:true,force:true});}
});

test('RC-T006 process restart from EXECUTING promotion observes before any reapply',()=>{
  const k=new ControllerKernel(':memory:');const tx=k.acceptCommand(command()).transaction_id;const q=k.createQualification(tx,SHA,'policy-1');k.finishQualification(q,'PASSED');const p=k.requestPromotion(tx,q,SHA);k.authorizePromotion(p);k.sealAllOutbox();k.db.prepare("UPDATE promotions SET state='EXECUTING' WHERE promotion_id=?").run(p);let apply=0,observe=0;const result=k.executePromotion(p,{apply(){apply+=1;},observe(){observe+=1;return true;}});assert.equal(result,'SUCCEEDED');assert.equal(apply,0);assert.equal(observe,1);k.close();
});

test('RC-T007 reconciliation proving mutation absent emits recoverable AUTHORIZED event',()=>{
  const k=new ControllerKernel(':memory:');const tx=k.acceptCommand(command()).transaction_id;const q=k.createQualification(tx,SHA,'policy-1');k.finishQualification(q,'PASSED');const p=k.requestPromotion(tx,q,SHA);k.authorizePromotion(p);k.sealAllOutbox();const adapter={apply(){throw new Error('ambiguous timeout');},observe(){return false;}};assert.equal(k.executePromotion(p,adapter),'RECONCILIATION_REQUIRED');assert.equal(k.executePromotion(p,adapter),'AUTHORIZED');const state=reduceSemanticEvents(k.exportEvents());assert.equal(state.promotions[p].state,'AUTHORIZED');assert.ok(k.exportEvents().some(e=>e.event_type==='promotion.reconciled-not-applied'));k.close();
});
