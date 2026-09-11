'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {SecondShiftKernel}=require('./second-shift-kernel');
const T0='2026-09-11T01:00:00.000Z';
const t=(s)=>new Date(Date.parse(T0)+s*1000).toISOString();
function item(id,lane='CORE',retryBudget=3){return {id,lane,objectiveId:`OBJ-${id}`,payload:{id},idempotencyKey:`KEY-${id}`,retryBudget,now:T0};}
function expectThrow(fn,msg){let ok=false;try{fn();}catch(e){ok=e.message.includes(msg);}assert(ok,`expected ${msg}`);}

// 1. durable idempotent enqueue + conflict fence
{
 const k=new SecondShiftKernel(); const a=k.enqueue(item('A')); const b=k.enqueue(item('A')); assert.equal(a.duplicate,false); assert.equal(b.duplicate,true);
 expectThrow(()=>k.enqueue({...item('X'),id:'X2',idempotencyKey:'KEY-A',objectiveId:'OTHER'}),'IDEMPOTENCY_CONFLICT'); assert.equal(k.integrity().integrity_check,'ok'); k.close();
}
// 2. one mutation claim per lane; four lanes progress independently
{
 const k=new SecondShiftKernel(); for(const lane of ['CORE','LEARNING','BOOK','DOCUMENTS']){k.enqueue(item(lane,lane)); k.enqueue(item(`${lane}-2`,lane));}
 const claims={}; for(const lane of ['CORE','LEARNING','BOOK','DOCUMENTS']){claims[lane]=k.claim(lane,`W-${lane}`,t(1),60);assert(claims[lane]);assert.equal(k.claim(lane,'OTHER',t(2),60),null);}
 k.start(claims.CORE.id,'W-CORE',claims.CORE.generation,t(3)); k.block(claims.CORE.id,'W-CORE',claims.CORE.generation,t(4),'BLOCKER');
 for(const lane of ['LEARNING','BOOK','DOCUMENTS']){const c=claims[lane];k.start(c.id,`W-${lane}`,c.generation,t(3));k.complete(c.id,`W-${lane}`,c.generation,t(4),{ok:true});}
 assert.equal(k.get('CORE').state,'BLOCKED'); assert.equal(k.get('LEARNING').state,'COMPLETED'); assert.equal(k.pendingOutbox().length,4); k.close();
}
// 3. stale lease is swept, old fencing token cannot mutate, work is requeued
{
 const k=new SecondShiftKernel();k.enqueue(item('S'));const c=k.claim('CORE','W1',t(1),5);k.start('S','W1',c.generation,t(2));
 const swept=k.sweepExpired(t(7));assert.equal(swept.length,1);assert.equal(k.get('S').state,'READY');assert(k.get('S').generation>c.generation);
 expectThrow(()=>k.complete('S','W1',c.generation,t(8)),'WORK_NOT_LEASED');const c2=k.claim('CORE','W2',t(8),60);assert(c2.generation>c.generation); k.close();
}
// 4. crash/restart with open lease recovers from disk after expiry
{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ss-kernel-'));const db=path.join(dir,'kernel.db');
 let k=new SecondShiftKernel(db);k.enqueue(item('CRASH'));const c=k.claim('CORE','W1',t(1),5);k.start('CRASH','W1',c.generation,t(2));k.close();
 k=new SecondShiftKernel(db);const rec=k.startupRecover(t(7));assert.equal(rec.recovered.length,1);assert.equal(k.get('CRASH').state,'READY');const c2=k.claim('CORE','W2',t(8),60);assert(c2.generation>c.generation);assert.equal(k.integrity().integrity_check,'ok');k.close();fs.rmSync(dir,{recursive:true,force:true});
}
// 5. transactional outbox survives process restart and can be acknowledged idempotently
{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ss-outbox-'));const db=path.join(dir,'kernel.db');let k=new SecondShiftKernel(db);k.enqueue(item('OUT'));const c=k.claim('CORE','W',t(1),60);k.start('OUT','W',c.generation,t(2));k.complete('OUT','W',c.generation,t(3));const key=k.pendingOutbox()[0].effect_key;k.close();
 k=new SecondShiftKernel(db);assert.equal(k.pendingOutbox().length,1);assert.equal(k.ackOutbox(key,t(4)),1);assert.equal(k.ackOutbox(key,t(5)),0);assert.equal(k.pendingOutbox().length,0);k.close();fs.rmSync(dir,{recursive:true,force:true});
}
// 6. finite retries -> circuit-open/fallback; no infinite retry loop
{
 const k=new SecondShiftKernel();k.enqueue(item('R','CORE',2));let c=k.claim('CORE','W',t(1),60);k.start('R','W',c.generation,t(2));k.transientFailure('R','W',c.generation,t(3),'NET',1);assert.equal(k.get('R').state,'READY');
 c=k.claim('CORE','W',t(5),60);k.start('R','W',c.generation,t(6));k.transientFailure('R','W',c.generation,t(7),'NET',1);assert.equal(k.get('R').state,'BLOCKED');assert.equal(k.pendingOutbox()[0].kind,'SELECT_FALLBACK');assert(k.events('R').some(e=>e.event_type==='CIRCUIT_OPEN'));k.close();
}
// 7. lease expiry is enforced even before sweeper runs
{
 const k=new SecondShiftKernel();k.enqueue(item('E'));const c=k.claim('CORE','W',t(1),5);expectThrow(()=>k.start('E','W',c.generation,t(7)),'LEASE_EXPIRED');k.close();
}
// 8. heartbeat renews lease and preserves fencing generation
{
 const k=new SecondShiftKernel();k.enqueue(item('H'));const c=k.claim('CORE','W',t(1),5);k.start('H','W',c.generation,t(2));const h=k.heartbeat('H','W',c.generation,t(4),10,'cp1');assert.equal(h.generation,c.generation);k.complete('H','W',c.generation,t(12));assert.equal(k.get('H').state,'COMPLETED');k.close();
}
// 9. authority snapshots require exact SHA and produce stable evidence digest
{
 const k=new SecondShiftKernel();const a=k.snapshotAuthority({capturedAt:T0,mainSha:'a'.repeat(40),authority:{topology:'005'}});assert.equal(a.digest.length,64);expectThrow(()=>k.snapshotAuthority({capturedAt:T0,mainSha:'bad',authority:{}}),'INVALID_AUTHORITY_SHA');k.close();
}
// 10. soak: 10,000 complete transitions across four lanes with immediate claim/start/complete/outbox ack
{
 const k=new SecondShiftKernel();const lanes=['CORE','LEARNING','BOOK','DOCUMENTS'];
 for(let i=0;i<10000;i++){const lane=lanes[i%4],id=`SOAK-${i}`;k.enqueue({id,lane,objectiveId:`O-${i}`,payload:{i},idempotencyKey:`K-${i}`,retryBudget:3,now:t(20+i)});const c=k.claim(lane,`W-${lane}`,t(20+i),60);assert(c);k.start(id,`W-${lane}`,c.generation,t(20+i));k.complete(id,`W-${lane}`,c.generation,t(20+i),{i});const o=k.pendingOutbox(1)[0];assert(o);k.ackOutbox(o.effect_key,t(20+i));}
 const counts=Object.fromEntries(k.counts().map(x=>[x.state,Number(x.count)]));assert.equal(counts.COMPLETED,10000);assert.equal(k.pendingOutbox().length,0);assert.equal(k.integrity().integrity_check,'ok');k.close();
}
// 11. restart soak: repeatedly close/reopen while durable queue advances
{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ss-restart-soak-'));const db=path.join(dir,'kernel.db');let k=new SecondShiftKernel(db);for(let i=0;i<200;i++)k.enqueue(item(`RS-${i}`,['CORE','LEARNING','BOOK','DOCUMENTS'][i%4]));k.close();
 for(let round=0;round<50;round++){k=new SecondShiftKernel(db);for(const lane of ['CORE','LEARNING','BOOK','DOCUMENTS']){const c=k.claim(lane,`W-${lane}`,t(100+round),60);if(c){k.start(c.id,`W-${lane}`,c.generation,t(100+round));k.complete(c.id,`W-${lane}`,c.generation,t(100+round));}}assert.equal(k.integrity().integrity_check,'ok');k.close();}
 k=new SecondShiftKernel(db);assert.equal(Number(k.db.prepare("SELECT count(*) AS n FROM work_items WHERE state='COMPLETED'").get().n),200);assert.equal(k.integrity().integrity_check,'ok');k.close();fs.rmSync(dir,{recursive:true,force:true});
}
console.log(JSON.stringify({result:'PASS',scenarios:11,soak_completed:10000,restart_cycles:50,restart_items:200,features:['idempotency','per-lane mutual exclusion','four-lane isolation','fencing tokens','lease expiry','automatic stale recovery','crash restart','transactional outbox','finite retry','circuit fallback','heartbeat renewal','authority snapshot','sqlite integrity']},null,2));
