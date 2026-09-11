'use strict';
const assert=require('assert');
const {SecondShiftKernel}=require('./second-shift-kernel');
const HEAD='a'.repeat(40),HEAD2='b'.repeat(40),AUTH='c'.repeat(40),CTRL={controlRef:'system-master/control-v2',controlHead:HEAD},CTRL2={controlRef:'system-master/control-v2',controlHead:HEAD2};
function item(id,now='2026-09-11T05:00:00Z'){return {id,lane:'CORE',objectiveId:`O-${id}`,payload:{id},idempotencyKey:`K-${id}`,retryBudget:3,priority:0,now,controlRef:CTRL.controlRef,controlHead:CTRL.controlHead,authoritySha:AUTH};}
function throws(fn,msg){let ok=false;try{fn();}catch(e){ok=e.message.includes(msg);}assert(ok,`missing ${msg}`);}
let cases=0;
// Exact expiry is expired, not one last valid instant.
{
 const k=new SecondShiftKernel();k.enqueue(item('EXACT'));const c=k.claim('CORE','W','2026-09-11T05:00:00Z',60,CTRL);throws(()=>k.start('EXACT','W',c.generation,'2026-09-11T05:01:00Z',CTRL),'LEASE_EXPIRED');const s=k.sweepExpired('2026-09-11T05:01:00Z');assert.equal(s.length,1);assert.equal(k.get('EXACT').state,'READY');k.close();cases++;
}
// A job claimed at 06:59:59 may terminalize after 07:00 if its lease remains valid; no new job may claim after 07:00.
{
 const k=new SecondShiftKernel();k.enqueue(item('EDGE','2026-09-11T10:59:58Z'));k.enqueue({...item('NEXT','2026-09-11T10:59:58Z'),id:'NEXT',idempotencyKey:'K-NEXT',objectiveId:'O-NEXT'});const c=k.claim('CORE','W','2026-09-11T10:59:59Z',60,CTRL);k.start(c.id,'W',c.generation,'2026-09-11T10:59:59.100Z',CTRL);k.complete(c.id,'W',c.generation,'2026-09-11T11:00:20Z',{},CTRL);throws(()=>k.claim('CORE','W','2026-09-11T11:00:21Z',60,CTRL),'SHIFT_CLOSED');k.close();cases++;
}
// Heartbeat at the exact expiry must fail.
{
 const k=new SecondShiftKernel();k.enqueue(item('HB'));const c=k.claim('CORE','W','2026-09-11T05:00:00Z',60,CTRL);throws(()=>k.heartbeat('HB','W',c.generation,'2026-09-11T05:01:00Z',60,'cp',CTRL),'LEASE_EXPIRED');k.close();cases++;
}
// Invalid lane, retry, priority, lease and backoff inputs fail closed.
{
 const k=new SecondShiftKernel();throws(()=>k.enqueue({...item('BAD-LANE'),lane:'PROSE'}),'INVALID_LANE');throws(()=>k.enqueue({...item('BAD-RETRY'),retryBudget:4}),'INVALID_RETRY_BUDGET');throws(()=>k.enqueue({...item('BAD-PRI'),priority:1.5}),'INVALID_PRIORITY');k.enqueue(item('LIMITS'));throws(()=>k.claim('CORE','W','2026-09-11T05:00:00Z',0,CTRL),'INVALID_LEASE_DURATION');throws(()=>k.claim('CORE','W','2026-09-11T05:00:00Z',3601,CTRL),'INVALID_LEASE_DURATION');const c=k.claim('CORE','W','2026-09-11T05:00:00Z',60,CTRL);throws(()=>k.transientFailure('LIMITS','W',c.generation,'2026-09-11T05:00:01Z','X',3601,CTRL),'INVALID_BACKOFF');k.close();cases++;
}
// Authority reconciliation remains available outside shift so stale claims cannot survive until next midnight.
{
 const k=new SecondShiftKernel();k.enqueue(item('AUTH-CLEAN'));assert.equal(k.reconcileAuthority('CORE',CTRL2,'2026-09-11T12:00:00Z'),1);assert.equal(k.get('AUTH-CLEAN').state,'BLOCKED');assert.equal(k.pendingOutbox()[0].kind,'REVALIDATE_AUTHORITY');k.close();cases++;
}
// Invalid current authority cannot dispatch.
{
 const k=new SecondShiftKernel();k.enqueue(item('AUTH-BAD'));throws(()=>k.claim('CORE','W','2026-09-11T05:00:00Z',60,{controlRef:CTRL.controlRef,controlHead:'bad'}),'CURRENT_CONTROL_REQUIRED');k.close();cases++;
}
// FIFO within equal priority and higher priority first.
{
 const k=new SecondShiftKernel();k.enqueue({...item('LOW'),priority:0,now:'2026-09-11T05:00:00Z'});k.enqueue({...item('HIGH'),priority:10,now:'2026-09-11T05:00:01Z'});let c=k.claim('CORE','W','2026-09-11T05:00:02Z',60,CTRL);assert.equal(c.id,'HIGH');k.complete(c.id,'W',c.generation,'2026-09-11T05:00:03Z',{},CTRL);c=k.claim('CORE','W','2026-09-11T05:00:04Z',60,CTRL);assert.equal(c.id,'LOW');k.close();cases++;
}
// Cleanup/sweeping works outside the dispatch window and does not depend on GitHub cron timing.
{
 const k=new SecondShiftKernel();k.enqueue(item('SWEEP'));const c=k.claim('CORE','W','2026-09-11T10:59:00Z',60,CTRL);k.start('SWEEP','W',c.generation,'2026-09-11T10:59:01Z',CTRL);const s=k.sweepExpired('2026-09-11T11:00:00Z');assert.equal(s.length,1);assert.equal(k.get('SWEEP').state,'READY');k.close();cases++;
}
console.log(JSON.stringify({result:'PASS',boundary_cases:cases,exact_expiry_fenced:true,post_0700_terminalization:true,new_claim_after_0700_rejected:true,outside_shift_cleanup:true,input_fail_closed:true,priority_order:true},null,2));
