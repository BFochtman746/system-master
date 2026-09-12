import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ControllerKernel, ControllerError } from '../src/kernel.js';
import { uuidv7 } from '../src/canonical.js';
import { MemoryDurableJournal, publishPendingOutbox } from '../src/durable-journal.js';
import { rebuildControllerStore, reconcileRecoveredStore } from '../src/recovery.js';
import {
  prepareExternalEffect,
  authorizeExternalEffectDispatch,
  getExternalEffectDispatchPermit
} from '../src/external-effect-authority.js';

const SUBJECT={algorithm:'sha1',oid:'0123456789abcdef0123456789abcdef01234567'};
function command(){return {protocol_version:'1.0',schema:'controller://schemas/command/v1',command_id:uuidv7(),created_at:new Date().toISOString(),issuer:{principal:'user:test',source:'chatgpt'},command_type:'controller.work.submit',target:{repository:'BFochtman746/system-master',expected_subject:{...SUBJECT}},preconditions:{},intent:{task:'external-effect-durability-barrier'},constraints:{},required_policy_version:null};}
function assertCode(fn,code){assert.throws(fn,e=>e instanceof ControllerError&&e.code===code);}
function runningOperation(k,nowMs=Date.now()){
  const tx=k.acceptCommand(command()).transaction_id;
  k.admitTransaction(tx,{operations:'all_succeeded'});k.activateTransaction(tx);
  const op=k.createOperation(tx,{resourceId:'repo:main'});k.transitionOperation(op,'READY');
  const lease=k.acquireLease(op,'repo:main','worker-ee-barrier',60000,nowMs);
  k.startLeasedOperation({leaseId:lease.lease_id,generation:lease.generation,operationId:op,nowMs});
  return {tx,op,lease};
}
function effectSpec(tx,op){return {transaction_id:tx,operation_id:op,provider:'github',effect_type:'git.ref.update',target_key:'refs/heads/main',idempotency_key:`effect-${uuidv7()}`,request:{ref:'refs/heads/main',sha:'a'.repeat(40),force:false},expected_remote_version:'b'.repeat(40)};}
async function sealDurably(kernel){const journal=new MemoryDurableJournal();const results=await publishPendingOutbox(kernel,journal);assert.ok(results.every(r=>r.sealed));return {journal,entries:await journal.list(),checkpoint:await journal.getCheckpoint()};}
function tempDb(){const dir=mkdtempSync(join(tmpdir(),'controller-v2-effect-barrier-'));return {dir,db:join(dir,'controller.sqlite')};}

test('EE-T033 PENDING dispatch event cannot yield provider-call permit',()=>{
  const k=new ControllerKernel(':memory:');
  const {tx,op,lease}=runningOperation(k);
  const effect=prepareExternalEffect(k,effectSpec(tx,op));
  const attempt=authorizeExternalEffectDispatch(k,effect.effect_id,lease.lease_id);
  assert.equal(attempt.durability_status,'PENDING');
  assertCode(()=>getExternalEffectDispatchPermit(k,effect.effect_id,lease.lease_id),'DURABILITY_BARRIER_NOT_MET');
  k.close();
});

test('EE-T034 exact durably SEALED dispatch event plus same live fence yields immutable permit',async()=>{
  const k=new ControllerKernel(':memory:');
  const {tx,op,lease}=runningOperation(k);
  const effect=prepareExternalEffect(k,effectSpec(tx,op));
  const attempt=authorizeExternalEffectDispatch(k,effect.effect_id,lease.lease_id);
  await sealDurably(k);
  const permit=getExternalEffectDispatchPermit(k,effect.effect_id,lease.lease_id);
  assert.deepEqual(permit,{
    effect_id:effect.effect_id,
    attempt_id:attempt.attempt_id,
    lease_id:lease.lease_id,
    resource_id:'repo:main',
    generation:lease.generation,
    dispatch_event_id:attempt.dispatch_event_id,
    durability_status:'SEALED'
  });
  k.close();
});

test('EE-T035 released authorizing lease cannot yield permit even after durable seal',async()=>{
  const k=new ControllerKernel(':memory:');
  const {tx,op,lease}=runningOperation(k);
  const effect=prepareExternalEffect(k,effectSpec(tx,op));
  authorizeExternalEffectDispatch(k,effect.effect_id,lease.lease_id);
  await sealDurably(k);
  k.releaseLease(lease.lease_id,lease.generation);
  assertCode(()=>getExternalEffectDispatchPermit(k,effect.effect_id,lease.lease_id),'STALE_LEASE');
  k.close();
});

test('EE-T036 durable rebuild restores SEALED uncertain attempt but no live lease and no automatic permit',async()=>{
  const source=new ControllerKernel(':memory:');
  const {tx,op,lease}=runningOperation(source);
  const effect=prepareExternalEffect(source,effectSpec(tx,op));
  authorizeExternalEffectDispatch(source,effect.effect_id,lease.lease_id);
  const durable=await sealDurably(source);
  source.close();
  const {dir,db}=tempDb();
  try{
    const recovered=rebuildControllerStore(db,durable.entries,{expectedCheckpoint:durable.checkpoint});
    assert.equal(recovered.db.prepare('SELECT COUNT(*) n FROM external_effect_attempts WHERE effect_id=?').get(effect.effect_id).n,1);
    assert.equal(recovered.db.prepare('SELECT COUNT(*) n FROM leases').get().n,0);
    assertCode(()=>getExternalEffectDispatchPermit(recovered,effect.effect_id,lease.lease_id),'NOT_FOUND');
    const report=reconcileRecoveredStore(recovered);
    assert.deepEqual(report.external_effects_requiring_observation,[{effect_id:effect.effect_id,state:'UNKNOWN',required_action:'OBSERVE_EXTERNAL_STATE'}]);
    recovered.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
