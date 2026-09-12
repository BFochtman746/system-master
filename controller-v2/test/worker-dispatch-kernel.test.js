import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ControllerKernel, ControllerError } from '../src/kernel.js';
import { ExecutionGraphKernel } from '../src/execution-graph-kernel.js';
import { uuidv7, sha256 } from '../src/canonical.js';
import { MemoryDurableJournal, publishPendingOutbox } from '../src/durable-journal.js';
import { createWorkerPort, describeWorkerAuthority } from '../src/authority-ports.js';
import {
  beginExternalEffectReconciliation,
  getExternalEffect,
  authorizeExternalEffectDispatch,
  resolveExternalEffect
} from '../src/external-effect-authority.js';
import {
  WorkerDispatchKernel,
  WORKER_BINDING_PROTOCOL,
  EXECUTION_CONTRACT_PROTOCOL,
  WORKER_DISPATCH_PROTOCOL,
  WORKER_DISPATCH_ENVELOPE_PROTOCOL,
  workerDispatchEnvelope,
  rebuildWorkerDispatchStore
} from '../src/worker-dispatch-kernel.js';

const SUBJECT = { algorithm:'sha1', oid:'0123456789abcdef0123456789abcdef01234567' };
const D = (c='a') => c.repeat(64);

function command() {
  return {
    protocol_version:'1.0', schema:'controller://schemas/command/v1', command_id:uuidv7(), created_at:new Date().toISOString(),
    issuer:{principal:'user:test',source:'test'}, command_type:'controller.work.submit',
    target:{repository:'BFochtman746/system-master',expected_subject:{...SUBJECT}}, preconditions:{}, intent:{task:'wdi'}, constraints:{}, required_policy_version:'wdi-v1'
  };
}
function assertCode(fn, code) {
  assert.throws(fn, (e) => e instanceof ControllerError && e.code === code);
}
function tempDb() { const dir=mkdtempSync(join(tmpdir(),'controller-wdi-')); return {dir,db:join(dir,'controller.sqlite')}; }
function cleanup(t) { rmSync(t.dir,{recursive:true,force:true}); }
function receipt(now=Date.now(), extra={}) {
  return {
    worker_ref:'worker:test', identity_authority:'test-idp', identity_evidence_ref:'id:test', identity_evidence_digest:D('1'),
    delegation_evidence_ref:'deleg:test', delegation_evidence_digest:D('2'), verifier_policy_revision:'v1', verifier_policy_digest:D('3'),
    capabilities:['exec.node','repo.read'], observed_at:new Date(now-1000).toISOString(), valid_until:new Date(now+120000).toISOString(), ...extra
  };
}
function setup({now=Date.now(),ready=true,capabilities=['exec.node','repo.read'],required=['exec.node']}={}) {
  const k=new WorkerDispatchKernel(':memory:');
  const tx=k.acceptCommand(command()).transaction_id;
  k.admitTransaction(tx,{operations:'all_succeeded',qualification:'not_required',promotion:'not_required'});
  const op=k.createOperation(tx,{resourceId:'resource:1'});
  if(ready) k.markOperationReadyIfEligible(op);
  const binding=k.recordWorkerBinding(receipt(now,{capabilities}));
  const contract=k.recordExecutionContract({operation_id:op,executor_kind:'node',protocol_version:'1',payload_ref:'artifact:payload',payload_digest:D('4'),required_capabilities:required});
  const lease=k.acquireLease(op,'resource:1','worker:test',60000,now);
  return {k,tx,op,bindingId:binding.binding_id,contractId:contract.contract_id,lease,now};
}
function intent(s) {
  return s.k.createDispatchIntent({operationId:s.op,contractId:s.contractId,workerBindingId:s.bindingId,leaseId:s.lease.lease_id,nowMs:s.now+10});
}
async function sealedDispatch(s) {
  const di=intent(s);
  const effect=s.k.prepareWorkerDispatchEffect(di.dispatch_id,s.now+20);
  const auth=s.k.activateWorkerDispatch(di.dispatch_id,effect.effect_id,s.now+30);
  const journal=new MemoryDurableJournal();
  await publishPendingOutbox(s.k,journal);
  const permit=s.k.getWorkerDispatchPermit(di.dispatch_id,effect.effect_id,s.now+40);
  return {di,effect,auth,permit,journal};
}
async function snapshot(k) {
  const journal=new MemoryDurableJournal();
  await publishPendingOutbox(k,journal);
  return {entries:await journal.list(), checkpoint:await journal.getCheckpoint()};
}

// WDI-001..006 — schema / migration / recovery.
test('WDI-001 v6 store upgrades append-only to v7 with four worker-dispatch tables',()=>{const t=tempDb();try{new ExecutionGraphKernel(t.db).close();const k=new WorkerDispatchKernel(t.db);assert.equal(k.db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v,7);for(const n of ['worker_bindings','worker_binding_revocations','execution_contracts','dispatch_intents'])assert.ok(k.db.prepare("SELECT 1 x FROM sqlite_master WHERE type='table' AND name=?").get(n));k.close();}finally{cleanup(t);}});
test('WDI-002 v6 predecessor command/transaction/operation rows survive migration unchanged',()=>{const t=tempDb();try{const b=new ExecutionGraphKernel(t.db);const tx=b.acceptCommand(command()).transaction_id;b.admitTransaction(tx,{operations:'all_succeeded',qualification:'not_required',promotion:'not_required'});const op=b.createOperation(tx,{resourceId:'resource:1'});const before=[b.db.prepare('SELECT payload_json FROM commands').get().payload_json,b.db.prepare('SELECT state FROM transactions WHERE transaction_id=?').get(tx).state,b.db.prepare('SELECT resource_id FROM operations WHERE operation_id=?').get(op).resource_id];b.close();const k=new WorkerDispatchKernel(t.db);const after=[k.db.prepare('SELECT payload_json FROM commands').get().payload_json,k.db.prepare('SELECT state FROM transactions WHERE transaction_id=?').get(tx).state,k.db.prepare('SELECT resource_id FROM operations WHERE operation_id=?').get(op).resource_id];assert.deepEqual(after,before);k.close();}finally{cleanup(t);}});
test('WDI-003 failed v7 migration rolls back without v7 marker',()=>{const b=new ExecutionGraphKernel(':memory:');try{b.db.exec('CREATE TABLE worker_bindings(bad TEXT)');assert.throws(()=>WorkerDispatchKernel.prototype.migrate.call(b));assert.equal(b.db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v,6);}finally{b.close();}});
test('WDI-004 reopening v7 is idempotent',()=>{const t=tempDb();try{new WorkerDispatchKernel(t.db).close();const k=new WorkerDispatchKernel(t.db);assert.equal(k.db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v,7);k.close();}finally{cleanup(t);}});
test('WDI-005 fresh-store journal recovery reconstructs binding contract and dispatch intent without live-lease FK',async()=>{const s=setup();const di=intent(s);const snap=await snapshot(s.k);s.k.close();const t=tempDb();try{const r=rebuildWorkerDispatchStore(t.db,snap.entries,{expectedCheckpoint:snap.checkpoint});assert.equal(r.db.prepare('SELECT COUNT(*) n FROM worker_bindings').get().n,1);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM execution_contracts').get().n,1);assert.equal(r.db.prepare('SELECT dispatch_id FROM dispatch_intents').get().dispatch_id,di.dispatch_id);r.close();}finally{cleanup(t);}});
test('WDI-006 recovery rejects tampered content-addressed binding identity',()=>{const s=setup();intent(s);const events=structuredClone(s.k.exportEvents());s.k.db.exec('DELETE FROM dispatch_intents; DELETE FROM execution_contracts; DELETE FROM worker_binding_revocations; DELETE FROM worker_bindings;');events.find(e=>e.event_type==='worker.binding_recorded').data.binding_id=D('0');assertCode(()=>s.k.restoreWorkerDispatchProjection(events),'RECOVERY_WORKER_DISPATCH_INVALID');s.k.close();});

// WDI-007..020 — worker binding.
test('WDI-007 canonical verification receipt records one binding',()=>{const k=new WorkerDispatchKernel(':memory:');const r=k.recordWorkerBinding(receipt());assert.equal(k.db.prepare('SELECT COUNT(*) n FROM worker_bindings').get().n,1);assert.equal(r.duplicate,false);k.close();});
test('WDI-008 exact binding replay is idempotent with one event',()=>{const k=new WorkerDispatchKernel(':memory:');const x=receipt();const a=k.recordWorkerBinding(x),b=k.recordWorkerBinding(x);assert.equal(a.binding_id,b.binding_id);assert.equal(b.duplicate,true);assert.equal(k.exportEvents().filter(e=>e.event_type==='worker.binding_recorded').length,1);k.close();});
test('WDI-009 changed identity evidence digest creates different binding ID',()=>{const k=new WorkerDispatchKernel(':memory:');const a=k.recordWorkerBinding(receipt()).binding_id,b=k.recordWorkerBinding(receipt(Date.now(),{identity_evidence_digest:D('9')})).binding_id;assert.notEqual(a,b);k.close();});
test('WDI-010 changed capability set creates different binding ID',()=>{const k=new WorkerDispatchKernel(':memory:');const now=Date.now();const a=k.recordWorkerBinding(receipt(now)).binding_id,b=k.recordWorkerBinding(receipt(now,{capabilities:['exec.node']})).binding_id;assert.notEqual(a,b);k.close();});
test('WDI-011 duplicate and unsorted capabilities canonicalize deterministically',()=>{const k=new WorkerDispatchKernel(':memory:');const now=Date.now();const a=k.recordWorkerBinding(receipt(now,{capabilities:['repo.read','exec.node','exec.node']})).binding_id,b=k.recordWorkerBinding(receipt(now,{capabilities:['exec.node','repo.read']})).binding_id;assert.equal(a,b);k.close();});
test('WDI-012 invalid digest shape is rejected',()=>{const k=new WorkerDispatchKernel(':memory:');assertCode(()=>k.recordWorkerBinding(receipt(Date.now(),{identity_evidence_digest:'no'})),'WORKER_DISPATCH_SCHEMA_INVALID');k.close();});
test('WDI-013 valid_until not after observed_at is rejected',()=>{const k=new WorkerDispatchKernel(':memory:');const now=Date.now();assertCode(()=>k.recordWorkerBinding(receipt(now,{observed_at:new Date(now).toISOString(),valid_until:new Date(now).toISOString()})),'WORKER_BINDING_VALIDITY_INVALID');k.close();});
test('WDI-014 raw credential/token/private-key fields are rejected by strict schema',()=>{const k=new WorkerDispatchKernel(':memory:');assertCode(()=>k.recordWorkerBinding({...receipt(),bearer_token:'secret'}),'WORKER_DISPATCH_SCHEMA_UNKNOWN_FIELD');k.close();});
test('WDI-015 CURRENT standing requires observed <= now < valid_until and no revocation',()=>{const k=new WorkerDispatchKernel(':memory:');const now=Date.now(),id=k.recordWorkerBinding(receipt(now)).binding_id;assert.equal(k.workerBindingStanding(id,now),'CURRENT');k.close();});
test('WDI-016 expired binding cannot authorize new intent',()=>{const s=setup();assert.equal(s.k.workerBindingStanding(s.bindingId,s.now+130000),'EXPIRED');assertCode(()=>s.k.createDispatchIntent({operationId:s.op,contractId:s.contractId,workerBindingId:s.bindingId,leaseId:s.lease.lease_id,nowMs:s.now+130000}),'WORKER_BINDING_NOT_CURRENT');s.k.close();});
test('WDI-017 not-yet-valid binding cannot authorize new intent',()=>{const now=Date.now(),k=new WorkerDispatchKernel(':memory:');const tx=k.acceptCommand(command()).transaction_id;k.admitTransaction(tx,{operations:'all_succeeded',qualification:'not_required',promotion:'not_required'});const op=k.createOperation(tx,{resourceId:'resource:1'});k.markOperationReadyIfEligible(op);const b=k.recordWorkerBinding(receipt(now,{observed_at:new Date(now+5000).toISOString(),valid_until:new Date(now+120000).toISOString()}));const c=k.recordExecutionContract({operation_id:op,executor_kind:'node',protocol_version:'1',payload_ref:'p',payload_digest:D('4'),required_capabilities:['exec.node']});const l=k.acquireLease(op,'resource:1','worker:test',60000,now);assert.equal(k.workerBindingStanding(b.binding_id,now),'NOT_YET_VALID');assertCode(()=>k.createDispatchIntent({operationId:op,contractId:c.contract_id,workerBindingId:b.binding_id,leaseId:l.lease_id,nowMs:now}),'WORKER_BINDING_NOT_CURRENT');k.close();});
test('WDI-018 exact revocation evidence is append-only and idempotent',()=>{const k=new WorkerDispatchKernel(':memory:');const id=k.recordWorkerBinding(receipt()).binding_id;const r={authority:'idp',evidence_ref:'rev:1',evidence_digest:D('5'),observed_at:new Date().toISOString()};assert.equal(k.revokeWorkerBinding(id,r).duplicate,false);assert.equal(k.revokeWorkerBinding(id,r).duplicate,true);assert.equal(k.db.prepare('SELECT COUNT(*) n FROM worker_binding_revocations').get().n,1);k.close();});
test('WDI-019 conflicting revocation evidence fails closed',()=>{const k=new WorkerDispatchKernel(':memory:');const id=k.recordWorkerBinding(receipt()).binding_id;const r={authority:'idp',evidence_ref:'rev:1',evidence_digest:D('5'),observed_at:new Date().toISOString()};k.revokeWorkerBinding(id,r);assertCode(()=>k.revokeWorkerBinding(id,{...r,evidence_digest:D('6')}),'WORKER_BINDING_REVOCATION_CONFLICT');k.close();});
test('WDI-020 revoked binding cannot authorize new intent while historical binding remains',()=>{const s=setup();s.k.revokeWorkerBinding(s.bindingId,{authority:'idp',evidence_ref:'rev:1',evidence_digest:D('5'),observed_at:new Date(s.now+1).toISOString()});assertCode(()=>intent(s),'WORKER_BINDING_NOT_CURRENT');assert.equal(s.k.db.prepare('SELECT COUNT(*) n FROM worker_bindings').get().n,1);s.k.close();});

// WDI-021..028 — execution contract.
test('WDI-021 contract exact-binds current transaction operation subject and resource',()=>{const s=setup({ready:false});const r=s.k.db.prepare('SELECT * FROM execution_contracts WHERE contract_id=?').get(s.contractId);assert.equal(r.transaction_id,s.tx);assert.equal(r.operation_id,s.op);assert.equal(r.subject_oid,SUBJECT.oid);assert.equal(r.resource_id,'resource:1');s.k.close();});
test('WDI-022 exact contract replay returns one content-addressed ID and event',()=>{const s=setup({ready:false});const x=s.k.recordExecutionContract({operation_id:s.op,executor_kind:'node',protocol_version:'1',payload_ref:'artifact:payload',payload_digest:D('4'),required_capabilities:['exec.node']});assert.equal(x.contract_id,s.contractId);assert.equal(x.duplicate,true);assert.equal(s.k.exportEvents().filter(e=>e.event_type==='operation.execution_contract_recorded').length,1);s.k.close();});
test('WDI-023 changed payload digest conflicts rather than mutating contract',()=>{const s=setup({ready:false});assertCode(()=>s.k.recordExecutionContract({operation_id:s.op,executor_kind:'node',protocol_version:'1',payload_ref:'artifact:payload',payload_digest:D('8'),required_capabilities:['exec.node']}),'EXECUTION_CONTRACT_CONFLICT');s.k.close();});
test('WDI-024 changed executor protocol or capability conflicts',()=>{const s=setup({ready:false});assertCode(()=>s.k.recordExecutionContract({operation_id:s.op,executor_kind:'python',protocol_version:'2',payload_ref:'artifact:payload',payload_digest:D('4'),required_capabilities:['exec.node']}),'EXECUTION_CONTRACT_CONFLICT');s.k.close();});
test('WDI-025 required capabilities canonicalize deterministically',()=>{const k=new WorkerDispatchKernel(':memory:');const tx=k.acceptCommand(command()).transaction_id;k.admitTransaction(tx,{operations:'all_succeeded',qualification:'not_required',promotion:'not_required'});const op=k.createOperation(tx,{resourceId:'r'});const a=k.recordExecutionContract({operation_id:op,executor_kind:'node',protocol_version:'1',payload_ref:'p',payload_digest:D('4'),required_capabilities:['b','a','a']});const row=k.db.prepare('SELECT required_capabilities_json FROM execution_contracts WHERE contract_id=?').get(a.contract_id);assert.equal(row.required_capabilities_json,'["a","b"]');k.close();});
test('WDI-026 unknown/mismatched operation cannot receive execution contract',()=>{const k=new WorkerDispatchKernel(':memory:');assertCode(()=>k.recordExecutionContract({operation_id:uuidv7(),executor_kind:'node',protocol_version:'1',payload_ref:'p',payload_digest:D('4'),required_capabilities:[]}),'NOT_FOUND');k.close();});
test('WDI-027 current subject mismatch is rejected before dispatch',()=>{const s=setup();s.k.db.prepare("UPDATE transactions SET subject_oid=? WHERE transaction_id=?").run('f'.repeat(40),s.tx);assertCode(()=>intent(s),'DISPATCH_CONTRACT_MISMATCH');s.k.close();});
test('WDI-028 raw specialist payload bytes are absent from contract row and event',()=>{const s=setup({ready:false});const row=s.k.db.prepare('SELECT * FROM execution_contracts').get();assert.equal('payload' in row,false);const e=s.k.exportEvents().find(x=>x.event_type==='operation.execution_contract_recorded');assert.equal('payload' in e.data,false);s.k.close();});

// WDI-029..042 — dispatch intent / claim binding.
test('WDI-029 READY exact contract CURRENT capable worker and ACTIVE lease creates one intent',()=>{const s=setup();const r=intent(s);assert.equal(r.duplicate,false);assert.equal(s.k.db.prepare('SELECT COUNT(*) n FROM dispatch_intents').get().n,1);s.k.close();});
test('WDI-030 exact intent replay is idempotent and Stage-B digest uses envelope protocol',()=>{const s=setup();const a=intent(s),b=intent(s);assert.equal(a.dispatch_id,b.dispatch_id);assert.equal(b.duplicate,true);const row=s.k.db.prepare('SELECT * FROM dispatch_intents').get();const env=workerDispatchEnvelope(row);assert.equal(env.protocol,WORKER_DISPATCH_ENVELOPE_PROTOCOL);assert.equal(sha256(env),row.request_digest);assert.equal(s.k.exportEvents().filter(e=>e.event_type==='operation.dispatch_intent_recorded').length,1);s.k.close();});
test('WDI-031 lease worker_ref mismatch rejects intent',()=>{const s=setup();s.k.db.prepare("UPDATE leases SET worker_id='worker:other' WHERE lease_id=?").run(s.lease.lease_id);assertCode(()=>intent(s),'DISPATCH_LEASE_BINDING_MISMATCH');s.k.close();});
test('WDI-032 lease operation/resource mismatch rejects intent',()=>{const s=setup();s.k.db.prepare("UPDATE leases SET resource_id='resource:other' WHERE lease_id=?").run(s.lease.lease_id);assert.throws(()=>intent(s));s.k.close();});
test('WDI-033 stale generation rejects intent',()=>{const s=setup();s.k.db.prepare('UPDATE resource_generations SET generation=generation+1 WHERE resource_id=?').run('resource:1');assertCode(()=>intent(s),'STALE_LEASE');s.k.close();});
test('WDI-034 non-ACTIVE lease rejects intent',()=>{for(const status of ['RELEASED','EXPIRED','REVOKED']){const s=setup();s.k.db.prepare('UPDATE leases SET status=? WHERE lease_id=?').run(status,s.lease.lease_id);assert.throws(()=>intent(s));s.k.close();}});
test('WDI-035 non-READY operation rejects new intent',()=>{const s=setup();s.k.transitionOperation(s.op,'CANCELLED');assertCode(()=>intent(s),'DISPATCH_OPERATION_NOT_READY');s.k.close();});
test('WDI-036 transaction outside ADMITTED/ACTIVE rejects new intent',()=>{const s=setup();s.k.db.prepare("UPDATE transactions SET state='WAITING' WHERE transaction_id=?").run(s.tx);assertCode(()=>intent(s),'DISPATCH_TRANSACTION_NOT_EXECUTABLE');s.k.close();});
test('WDI-037 missing required capability rejects intent',()=>{const s=setup({capabilities:['repo.read'],required:['exec.node']});assertCode(()=>intent(s),'WORKER_CAPABILITY_MISSING');s.k.close();});
test('WDI-038 expired binding rejects intent',()=>{const s=setup();assertCode(()=>s.k.createDispatchIntent({operationId:s.op,contractId:s.contractId,workerBindingId:s.bindingId,leaseId:s.lease.lease_id,nowMs:s.now+130000}),'WORKER_BINDING_NOT_CURRENT');s.k.close();});
test('WDI-039 revoked binding rejects intent',()=>{const s=setup();s.k.revokeWorkerBinding(s.bindingId,{authority:'idp',evidence_ref:'rev',evidence_digest:D('6'),observed_at:new Date(s.now+1).toISOString()});assertCode(()=>intent(s),'WORKER_BINDING_NOT_CURRENT');s.k.close();});
test('WDI-040 one lease cannot bind two semantic dispatch identities',()=>{const s=setup();intent(s);const b2=s.k.recordWorkerBinding(receipt(s.now,{identity_evidence_digest:D('9')})).binding_id;assertCode(()=>s.k.createDispatchIntent({operationId:s.op,contractId:s.contractId,workerBindingId:b2,leaseId:s.lease.lease_id,nowMs:s.now+10}),'DISPATCH_INTENT_CONFLICT');s.k.close();});
test('WDI-041 claim-without-intent has no external-send state and reconciles deterministic intent',()=>{const s=setup();assert.equal(s.k.db.prepare('SELECT COUNT(*) n FROM dispatch_intents').get().n,0);assert.equal(s.k.db.prepare('SELECT COUNT(*) n FROM external_effects').get().n,0);const a=intent(s),b=intent(s);assert.equal(a.dispatch_id,b.dispatch_id);s.k.close();});
test('WDI-042 replacement lease generation receives distinct dispatch ID',()=>{const s=setup();const a=intent(s);s.k.db.prepare("UPDATE leases SET status='RELEASED' WHERE lease_id=?").run(s.lease.lease_id);const l2=s.k.acquireLease(s.op,'resource:1','worker:test',60000,s.now+100);const b=s.k.createDispatchIntent({operationId:s.op,contractId:s.contractId,workerBindingId:s.bindingId,leaseId:l2.lease_id,nowMs:s.now+110});assert.notEqual(a.dispatch_id,b.dispatch_id);assert.ok(l2.generation>s.lease.generation);s.k.close();});

// WDI-043..053 — Foundation-003 effect reuse / uncertainty.
test('WDI-043 intent prepares exactly one idempotent external effect',()=>{const s=setup();const di=intent(s);const a=s.k.prepareWorkerDispatchEffect(di.dispatch_id,s.now+20),b=s.k.prepareWorkerDispatchEffect(di.dispatch_id,s.now+20);assert.equal(a.effect_id,b.effect_id);assert.equal(s.k.db.prepare('SELECT COUNT(*) n FROM external_effects').get().n,1);s.k.close();});
test('WDI-044 effect request digest exact-binds Stage-B envelope and full worker-dispatch tuple',()=>{const s=setup();const di=intent(s),fx=s.k.prepareWorkerDispatchEffect(di.dispatch_id,s.now+20);const row=s.k.db.prepare('SELECT d.*,c.executor_kind FROM dispatch_intents d JOIN execution_contracts c ON c.contract_id=d.contract_id').get();const env=workerDispatchEnvelope(row),effect=getExternalEffect(s.k,fx.effect_id);assert.equal(env.protocol,WORKER_DISPATCH_ENVELOPE_PROTOCOL);assert.equal(sha256(env),di.request_digest);assert.equal(effect.request_digest,di.request_digest);assert.equal(effect.provider,'worker-transport:node');assert.equal(effect.target_key,s.bindingId);s.k.close();});
test('WDI-045 duplicate effect preparation converges to same effect',()=>{const s=setup();const di=intent(s);const a=s.k.prepareWorkerDispatchEffect(di.dispatch_id,s.now+20),b=s.k.prepareWorkerDispatchEffect(di.dispatch_id,s.now+21);assert.equal(a.effect_id,b.effect_id);assert.equal(b.duplicate,true);s.k.close();});
test('WDI-046 Foundation-003 cannot authorize dispatch before operation RUNNING',()=>{const s=setup();const di=intent(s),fx=s.k.prepareWorkerDispatchEffect(di.dispatch_id,s.now+20);assertCode(()=>authorizeExternalEffectDispatch(s.k,fx.effect_id,s.lease.lease_id,s.now+25),'EXTERNAL_EFFECT_OPERATION_NOT_RUNNING');s.k.close();});
test('WDI-047 wrapper start plus effect authorization requires current binding and fence',()=>{const s=setup();const di=intent(s),fx=s.k.prepareWorkerDispatchEffect(di.dispatch_id,s.now+20),a=s.k.activateWorkerDispatch(di.dispatch_id,fx.effect_id,s.now+30);assert.equal(a.durability_status,'PENDING');assert.equal(getExternalEffect(s.k,fx.effect_id).state,'UNKNOWN');s.k.close();});
test('WDI-048 binding revocation before effect authorization prevents local send authorization',()=>{const s=setup();const di=intent(s),fx=s.k.prepareWorkerDispatchEffect(di.dispatch_id,s.now+20);s.k.revokeWorkerBinding(s.bindingId,{authority:'idp',evidence_ref:'rev',evidence_digest:D('7'),observed_at:new Date(s.now+25).toISOString()});assertCode(()=>s.k.activateWorkerDispatch(di.dispatch_id,fx.effect_id,s.now+30),'WORKER_BINDING_NOT_CURRENT');s.k.close();});
test('WDI-049 authorization records UNKNOWN before any physical permit and permit needs SEALED event',()=>{const s=setup();const di=intent(s),fx=s.k.prepareWorkerDispatchEffect(di.dispatch_id,s.now+20);s.k.activateWorkerDispatch(di.dispatch_id,fx.effect_id,s.now+30);assert.equal(getExternalEffect(s.k,fx.effect_id).state,'UNKNOWN');assertCode(()=>s.k.getWorkerDispatchPermit(di.dispatch_id,fx.effect_id,s.now+31),'DURABILITY_BARRIER_NOT_MET');s.k.close();});
test('WDI-050 lost acknowledgement leaves one UNKNOWN attempt and forbids blind redispatch',()=>{const s=setup();const di=intent(s),fx=s.k.prepareWorkerDispatchEffect(di.dispatch_id,s.now+20);s.k.activateWorkerDispatch(di.dispatch_id,fx.effect_id,s.now+30);assert.equal(s.k.db.prepare('SELECT COUNT(*) n FROM external_effect_attempts').get().n,1);assert.throws(()=>s.k.activateWorkerDispatch(di.dispatch_id,fx.effect_id,s.now+31));assert.equal(s.k.db.prepare('SELECT COUNT(*) n FROM external_effect_attempts').get().n,1);s.k.close();});
test('WDI-051 bounded provider observation can reconcile success with external reference',async()=>{const s=setup();const {effect}=await sealedDispatch(s);beginExternalEffectReconciliation(s.k,effect.effect_id);assert.equal(resolveExternalEffect(s.k,effect.effect_id,{state:'SUCCEEDED',evidence:{kind:'provider-observation',reference:'run:1',digest:D('8')}}),'SUCCEEDED');assert.equal(getExternalEffect(s.k,effect.effect_id).terminal_evidence.reference,'run:1');s.k.close();});
test('WDI-052 classified provider rejection reconciles permanent failure',async()=>{const s=setup();const {effect}=await sealedDispatch(s);beginExternalEffectReconciliation(s.k,effect.effect_id);assert.equal(resolveExternalEffect(s.k,effect.effect_id,{state:'FAILED',evidence:{kind:'provider-observation',reference:'reject:1'},error_code:'PERMANENT_REJECTION'}),'FAILED');s.k.close();});
test('WDI-053 unresolved observation remains UNKNOWN with one authorized attempt',async()=>{const s=setup();const {effect}=await sealedDispatch(s);beginExternalEffectReconciliation(s.k,effect.effect_id);assert.equal(resolveExternalEffect(s.k,effect.effect_id,{state:'UNKNOWN',evidence:{kind:'provider-observation',reference:'indeterminate:1'}}),'UNKNOWN');assert.equal(s.k.db.prepare('SELECT COUNT(*) n FROM external_effect_attempts').get().n,1);s.k.close();});

// WDI-054..060 — cancellation / restart / authority fences.
test('WDI-054 cancellation or revocation before effect authorization prevents new send',()=>{const s=setup();const di=intent(s);s.k.transitionOperation(s.op,'CANCELLED');assertCode(()=>s.k.prepareWorkerDispatchEffect(di.dispatch_id,s.now+20),'DISPATCH_OPERATION_NOT_READY');s.k.close();});
test('WDI-055 revocation after UNKNOWN preserves reconciliation obligation and blocks permit',async()=>{const s=setup();const di=intent(s),fx=s.k.prepareWorkerDispatchEffect(di.dispatch_id,s.now+20);s.k.activateWorkerDispatch(di.dispatch_id,fx.effect_id,s.now+30);s.k.revokeWorkerBinding(s.bindingId,{authority:'idp',evidence_ref:'rev',evidence_digest:D('9'),observed_at:new Date(s.now+31).toISOString()});assert.equal(getExternalEffect(s.k,fx.effect_id).state,'UNKNOWN');assertCode(()=>s.k.getWorkerDispatchPermit(di.dispatch_id,fx.effect_id,s.now+40),'WORKER_BINDING_NOT_CURRENT');beginExternalEffectReconciliation(s.k,fx.effect_id);assert.equal(resolveExternalEffect(s.k,fx.effect_id,{state:'UNKNOWN',evidence:{kind:'provider-observation',reference:'pending'}}),'UNKNOWN');s.k.close();});
test('WDI-056 fresh-store recovery reconstructs dispatch history but restores zero live claim authority',async()=>{const s=setup();intent(s);const snap=await snapshot(s.k);s.k.close();const t=tempDb();try{const r=rebuildWorkerDispatchStore(t.db,snap.entries,{expectedCheckpoint:snap.checkpoint});assert.equal(r.db.prepare('SELECT COUNT(*) n FROM dispatch_intents').get().n,1);assert.equal(r.db.prepare("SELECT COUNT(*) n FROM leases WHERE status='ACTIVE'").get().n,0);r.close();}finally{cleanup(t);}});
test('WDI-057 recovered UNKNOWN effect cannot regain send authority from historical intent alone',async()=>{const s=setup();const di=intent(s),fx=s.k.prepareWorkerDispatchEffect(di.dispatch_id,s.now+20);s.k.activateWorkerDispatch(di.dispatch_id,fx.effect_id,s.now+30);const snap=await snapshot(s.k);s.k.close();const t=tempDb();try{const r=rebuildWorkerDispatchStore(t.db,snap.entries,{expectedCheckpoint:snap.checkpoint});assert.equal(getExternalEffect(r,fx.effect_id).state,'UNKNOWN');assert.throws(()=>r.getWorkerDispatchPermit(di.dispatch_id,fx.effect_id,s.now+40));r.close();}finally{cleanup(t);}});
test('WDI-058 heartbeat socket chat and webhook metadata cannot create or extend binding authority',()=>{const k=new WorkerDispatchKernel(':memory:');assertCode(()=>k.recordWorkerBinding({...receipt(),chat_message_id:'mutable'}),'WORKER_DISPATCH_SCHEMA_UNKNOWN_FIELD');assert.equal(k.db.prepare('SELECT COUNT(*) n FROM worker_bindings').get().n,0);k.close();});
test('WDI-059 worker-facing port exposes only heartbeat and submitResult, not registrar/intent/effect authority',()=>{const s=setup();const p=createWorkerPort(s.k,{leaseId:s.lease.lease_id,generation:s.lease.generation,operationId:s.op});assert.deepEqual(Object.keys(p).sort(),['heartbeat','submitResult']);for(const name of ['recordWorkerBinding','revokeWorkerBinding','recordExecutionContract','createDispatchIntent','prepareWorkerDispatchEffect','activateWorkerDispatch'])assert.equal(name in p,false);assert.deepEqual(describeWorkerAuthority().allowed,['heartbeat','submitResult']);s.k.close();});
test('WDI-060 duplicate/reordered reconcile calls converge without double intent or double effect attempt',async()=>{const s=setup();const a=intent(s),b=intent(s);assert.equal(a.dispatch_id,b.dispatch_id);const f1=s.k.prepareWorkerDispatchEffect(a.dispatch_id,s.now+20),f2=s.k.prepareWorkerDispatchEffect(a.dispatch_id,s.now+21);assert.equal(f1.effect_id,f2.effect_id);s.k.activateWorkerDispatch(a.dispatch_id,f1.effect_id,s.now+30);assert.throws(()=>s.k.activateWorkerDispatch(a.dispatch_id,f1.effect_id,s.now+31));const journal=new MemoryDurableJournal();await publishPendingOutbox(s.k,journal);const permit=s.k.getWorkerDispatchPermit(a.dispatch_id,f1.effect_id,s.now+40);assert.equal(permit.durability_status,'SEALED');assert.equal(s.k.db.prepare('SELECT COUNT(*) n FROM dispatch_intents').get().n,1);assert.equal(s.k.db.prepare('SELECT COUNT(*) n FROM external_effects').get().n,1);assert.equal(s.k.db.prepare('SELECT COUNT(*) n FROM external_effect_attempts').get().n,1);s.k.close();});
