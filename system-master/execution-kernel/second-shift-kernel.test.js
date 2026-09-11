'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {SecondShiftKernel,isSecondShiftOpen}=require('./second-shift-kernel');
const T0='2026-09-11T05:00:00.000Z'; // 01:00 America/New_York
const t=(s)=>new Date(Date.parse(T0)+s*1000).toISOString();
const HEAD1='a'.repeat(40), HEAD2='b'.repeat(40), AUTH='c'.repeat(40);
const CTRL1={controlRef:'system-master/control-v2',controlHead:HEAD1};
const CTRL2={controlRef:'system-master/control-v2',controlHead:HEAD2};
function item(id,lane='CORE',retryBudget=3){return {id,lane,objectiveId:`OBJ-${id}`,payload:{id},idempotencyKey:`KEY-${id}`,retryBudget,now:T0,controlRef:CTRL1.controlRef,controlHead:CTRL1.controlHead,authoritySha:AUTH};}
function expectThrow(fn,msg){let ok=false;try{fn();}catch(e){ok=e.message.includes(msg);}assert(ok,`expected ${msg}`);}

// 1. durable idempotent enqueue + authority-sensitive conflict fence
{
 const k=new SecondShiftKernel(); const a=k.enqueue(item('A')); const b=k.enqueue(item('A')); assert.equal(a.duplicate,false); assert.equal(b.duplicate,true);
 expectThrow(()=>k.enqueue({...item('X'),id:'X2',idempotencyKey:'KEY-A',objectiveId:'OTHER'}),'IDEMPOTENCY_CONFLICT');
 expectThrow(()=>k.enqueue({...item('X'),id:'X3',idempotencyKey:'KEY-A',controlHead:HEAD2}),'IDEMPOTENCY_CONFLICT'); assert.equal(k.integrity().integrity_check,'ok'); k.close();
}
// 2. one mutation claim per lane; four lanes progress independently
{
 const k=new SecondShiftKernel(); for(const lane of ['CORE','LEARNING','BOOK','DOCUMENTS']){k.enqueue(item(lane,lane)); k.enqueue(item(`${lane}-2`,lane));}
 const claims={}; for(const lane of ['CORE','LEARNING','BOOK','DOCUMENTS']){claims[lane]=k.claim(lane,`W-${lane}`,t(1),60,CTRL1);assert(claims[lane]);assert.equal(k.claim(lane,'OTHER',t(2),60,CTRL1),null);}
 k.start(claims.CORE.id,'W-CORE',claims.CORE.generation,t(3),CTRL1); k.block(claims.CORE.id,'W-CORE',claims.CORE.generation,t(4),'BLOCKER',{},CTRL1);
 for(const lane of ['LEARNING','BOOK','DOCUMENTS']){const c=claims[lane];k.start(c.id,`W-${lane}`,c.generation,t(3),CTRL1);k.complete(c.id,`W-${lane}`,c.generation,t(4),{ok:true},CTRL1);}
 assert.equal(k.get('CORE').state,'BLOCKED'); assert.equal(k.get('LEARNING').state,'COMPLETED'); assert.equal(k.pendingOutbox().length,4); k.close();
}
// 3. stale lease is swept, old fencing token cannot mutate, work is requeued
{
 const k=new SecondShiftKernel();k.enqueue(item('S'));const c=k.claim('CORE','W1',t(1),5,CTRL1);k.start('S','W1',c.generation,t(2),CTRL1);
 const swept=k.sweepExpired(t(7));assert.equal(swept.length,1);assert.equal(k.get('S').state,'READY');assert(k.get('S').generation>c.generation);
 expectThrow(()=>k.complete('S','W1',c.generation,t(8),{},CTRL1),'WORK_NOT_LEASED');const c2=k.claim('CORE','W2',t(8),60,CTRL1);assert(c2.generation>c.generation); k.close();
}
// 4. crash/restart with open lease recovers from disk after expiry
{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ss-kernel-'));const db=path.join(dir,'kernel.db');
 let k=new SecondShiftKernel(db);k.enqueue(item('CRASH'));const c=k.claim('CORE','W1',t(1),5,CTRL1);k.start('CRASH','W1',c.generation,t(2),CTRL1);k.close();
 k=new SecondShiftKernel(db);const rec=k.startupRecover(t(7));assert.equal(rec.recovered.length,1);assert.equal(k.get('CRASH').state,'READY');const c2=k.claim('CORE','W2',t(8),60,CTRL1);assert(c2.generation>c.generation);assert.equal(k.integrity().integrity_check,'ok');k.close();fs.rmSync(dir,{recursive:true,force:true});
}
// 5. transactional outbox survives process restart and can be acknowledged idempotently
{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ss-outbox-'));const db=path.join(dir,'kernel.db');let k=new SecondShiftKernel(db);k.enqueue(item('OUT'));const c=k.claim('CORE','W',t(1),60,CTRL1);k.start('OUT','W',c.generation,t(2),CTRL1);k.complete('OUT','W',c.generation,t(3),{},CTRL1);const key=k.pendingOutbox()[0].effect_key;k.close();
 k=new SecondShiftKernel(db);assert.equal(k.pendingOutbox().length,1);assert.equal(k.ackOutbox(key,t(4)),1);assert.equal(k.ackOutbox(key,t(5)),0);assert.equal(k.pendingOutbox().length,0);k.close();fs.rmSync(dir,{recursive:true,force:true});
}
// 6. finite retries -> circuit-open/fallback; no infinite retry loop
{
 const k=new SecondShiftKernel();k.enqueue(item('R','CORE',2));let c=k.claim('CORE','W',t(1),60,CTRL1);k.start('R','W',c.generation,t(2),CTRL1);k.transientFailure('R','W',c.generation,t(3),'NET',1,CTRL1);assert.equal(k.get('R').state,'READY');
 c=k.claim('CORE','W',t(5),60,CTRL1);k.start('R','W',c.generation,t(6),CTRL1);k.transientFailure('R','W',c.generation,t(7),'NET',1,CTRL1);assert.equal(k.get('R').state,'BLOCKED');assert.equal(k.pendingOutbox()[0].kind,'SELECT_FALLBACK');assert(k.events('R').some(e=>e.event_type==='CIRCUIT_OPEN'));k.close();
}
// 7. lease expiry is enforced even before sweeper runs
{
 const k=new SecondShiftKernel();k.enqueue(item('E'));const c=k.claim('CORE','W',t(1),5,CTRL1);expectThrow(()=>k.start('E','W',c.generation,t(7),CTRL1),'LEASE_EXPIRED');k.close();
}
// 8. heartbeat renews lease and preserves fencing generation
{
 const k=new SecondShiftKernel();k.enqueue(item('H'));const c=k.claim('CORE','W',t(1),5,CTRL1);k.start('H','W',c.generation,t(2),CTRL1);const h=k.heartbeat('H','W',c.generation,t(4),10,'cp1',CTRL1);assert.equal(h.generation,c.generation);k.complete('H','W',c.generation,t(12),{},CTRL1);assert.equal(k.get('H').state,'COMPLETED');k.close();
}
// 9. authority snapshots require exact SHA and produce evidence digest
{
 const k=new SecondShiftKernel();const a=k.snapshotAuthority({capturedAt:T0,mainSha:'a'.repeat(40),authority:{topology:'005'}});assert.equal(a.digest.length,64);expectThrow(()=>k.snapshotAuthority({capturedAt:T0,mainSha:'bad',authority:{}}),'INVALID_AUTHORITY_SHA');k.close();
}
// 10. changed live owner head fences a running mutation and requires explicit revalidation
{
 const k=new SecondShiftKernel();k.enqueue(item('AUTH'));const c=k.claim('CORE','W',t(1),60,CTRL1);k.start('AUTH','W',c.generation,t(2),CTRL1);
 expectThrow(()=>k.complete('AUTH','W',c.generation,t(3),{},CTRL2),'AUTHORITY_FENCE_REJECTED');assert.equal(k.reconcileAuthority('CORE',CTRL2,t(4)),1);const row=k.get('AUTH');assert.equal(row.state,'BLOCKED');assert(row.generation>c.generation);assert.equal(row.terminal_reason,'AUTHORITY_CHANGED');assert(k.pendingOutbox().some(x=>x.kind==='REVALIDATE_AUTHORITY'));k.close();
}
// 11. stale READY authority is not dispatchable under a changed control head
{
 const k=new SecondShiftKernel();k.enqueue(item('STALE-READY'));const c=k.claim('CORE','W',t(1),60,CTRL2);assert.equal(c,null);assert.equal(k.get('STALE-READY').state,'BLOCKED');assert.equal(k.get('STALE-READY').terminal_reason,'AUTHORITY_CHANGED');k.close();
}
// 12. backwards wall clock is rejected instead of manufacturing lease freshness
{
 const k=new SecondShiftKernel();k.enqueue(item('CLOCK'));const c=k.claim('CORE','W',t(2),60,CTRL1);expectThrow(()=>k.start('CLOCK','W',c.generation,t(1),CTRL1),'CLOCK_ROLLBACK_DETECTED');k.close();
}
// 13. New York shift boundaries are exact: 06:59:59 open, 07:00:00 closed
{
 assert.equal(isSecondShiftOpen('2026-09-11T10:59:59Z'),true);assert.equal(isSecondShiftOpen('2026-09-11T11:00:00Z'),false);
 const k=new SecondShiftKernel();k.enqueue({...item('WINDOW'),now:'2026-09-11T10:59:58Z'});const c=k.claim('CORE','W','2026-09-11T10:59:59Z',60,CTRL1);assert(c);k.close();
 const k2=new SecondShiftKernel();k2.enqueue({...item('WINDOW2'),now:'2026-09-11T10:59:58Z'});expectThrow(()=>k2.claim('CORE','W','2026-09-11T11:00:00Z',60,CTRL1),'SHIFT_CLOSED');k2.close();
}
// 14. DST fall-back repeated 01:30 and spring-forward 03:30 are both inside the logical New York shift
{
 // 2026-11-01 01:30 occurs twice: 05:30Z (EDT) and 06:30Z (EST).
 assert.equal(isSecondShiftOpen('2026-11-01T05:30:00Z'),true);assert.equal(isSecondShiftOpen('2026-11-01T06:30:00Z'),true);
 // 2026-03-08 jumps from 01:59:59 EST to 03:00 EDT; both sides remain inside 00:00-07:00 local.
 assert.equal(isSecondShiftOpen('2026-03-08T06:59:59Z'),true);assert.equal(isSecondShiftOpen('2026-03-08T07:00:00Z'),true);assert.equal(isSecondShiftOpen('2026-03-08T11:00:00Z'),false);
}
// 15. soak: 10,000 complete transitions across four lanes with immediate outbox acknowledgement
{
 const k=new SecondShiftKernel();const lanes=['CORE','LEARNING','BOOK','DOCUMENTS'];
 for(let i=0;i<10000;i++){const lane=lanes[i%4],id=`SOAK-${i}`;k.enqueue({id,lane,objectiveId:`O-${i}`,payload:{i},idempotencyKey:`K-${i}`,retryBudget:3,now:t(20+i),controlRef:CTRL1.controlRef,controlHead:CTRL1.controlHead,authoritySha:AUTH});const c=k.claim(lane,`W-${lane}`,t(20+i),60,CTRL1);assert(c);k.start(id,`W-${lane}`,c.generation,t(20+i),CTRL1);k.complete(id,`W-${lane}`,c.generation,t(20+i),{i},CTRL1);const o=k.pendingOutbox(1)[0];assert(o);k.ackOutbox(o.effect_key,t(20+i));}
 const counts=Object.fromEntries(k.counts().map(x=>[x.state,Number(x.count)]));assert.equal(counts.COMPLETED,10000);assert.equal(k.pendingOutbox().length,0);assert.equal(k.integrity().integrity_check,'ok');k.close();
}
// 16. restart soak: repeatedly close/reopen while durable queue advances
{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ss-restart-soak-'));const db=path.join(dir,'kernel.db');let k=new SecondShiftKernel(db);for(let i=0;i<200;i++)k.enqueue(item(`RS-${i}`,['CORE','LEARNING','BOOK','DOCUMENTS'][i%4]));k.close();
 for(let round=0;round<50;round++){k=new SecondShiftKernel(db);for(const lane of ['CORE','LEARNING','BOOK','DOCUMENTS']){const c=k.claim(lane,`W-${lane}`,t(100+round),60,CTRL1);if(c){k.start(c.id,`W-${lane}`,c.generation,t(100+round),CTRL1);k.complete(c.id,`W-${lane}`,c.generation,t(100+round),{},CTRL1);}}assert.equal(k.integrity().integrity_check,'ok');k.close();}
 k=new SecondShiftKernel(db);assert.equal(Number(k.db.prepare("SELECT count(*) AS n FROM work_items WHERE state='COMPLETED'").get().n),200);assert.equal(k.integrity().integrity_check,'ok');k.close();fs.rmSync(dir,{recursive:true,force:true});
}
console.log(JSON.stringify({result:'PASS',scenarios:16,soak_completed:10000,restart_cycles:50,restart_items:200,features:['idempotency','per-lane mutual exclusion','four-lane isolation','fencing tokens','lease expiry','automatic stale recovery','crash restart','transactional outbox','finite retry','circuit fallback','heartbeat renewal','authority snapshots','live-control authority fencing','clock rollback detection','07:00 shift cutoff','DST fall-back','DST spring-forward','sqlite integrity']},null,2));
