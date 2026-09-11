'use strict';

const TERMINALS = new Set(['COMPLETED','BLOCKED','STALE']);
const EXECUTION = new Set(['RUNNING','PROGRESS']);

function isInt(v){ return Number.isInteger(v); }
function time(v){ const n=Date.parse(v); return Number.isFinite(n)?n:null; }
function finding(type, message, event){ return {severity:'ERROR',type,message,event_id:event?.event_id||null}; }

function validateLedgerLifecycle(ledger, options={}){
  const maxRetryBudget = options.max_retry_budget ?? 3;
  const nowMs = options.now ? time(options.now) : Date.now();
  const futureSkewMs = (options.future_clock_skew_seconds ?? 120) * 1000;
  const findings=[];
  let lease=null;
  let terminalPendingSuccessor=false;
  let shiftClosed=false;
  let lastTime=null;
  let lastTerminal=null;
  const leaseIds=new Set();
  const eventIds=new Set();

  for(const e of ledger.events||[]){
    const t=time(e.occurred_at);
    if(!e.event_id || eventIds.has(e.event_id)) findings.push(finding('UTILIZATION_EVENT_DUPLICATE','event id missing or duplicated',e));
    if(e.event_id) eventIds.add(e.event_id);
    if(t===null){ findings.push(finding('UTILIZATION_EVENT_TIME_INVALID','event timestamp is invalid',e)); continue; }
    if(lastTime!==null && t<lastTime) findings.push(finding('UTILIZATION_EVENT_ORDER_INVALID','event timestamps are not monotonic',e));
    if(nowMs!==null && t>nowMs+futureSkewMs) findings.push(finding('FUTURE_EVENT_TIME','event timestamp is implausibly in the future',e));
    lastTime=t;
    if(shiftClosed) findings.push(finding('EVENT_AFTER_SHIFT_CLOSE','no event may follow SHIFT_CLOSE in the same shift ledger',e));

    if(e.event_type==='CLAIMED'){
      if(terminalPendingSuccessor) findings.push(finding('SUCCESSOR_MISSING_AFTER_TERMINAL','new claim began before prior terminal work was reconciled to a successor',e));
      if(lease) findings.push(finding('OVERLAPPING_MUTATION_CLAIMS','claim overlaps an unresolved lease',e));
      if(!e.lease_id || !e.idempotency_key || !e.lease_expires_at || !isInt(e.attempt) || e.attempt<1) findings.push(finding('CLAIM_EVENT_INVALID','claim fields are invalid',e));
      const exp=time(e.lease_expires_at);
      if(exp===null || exp<=t) findings.push(finding('CLAIM_EVENT_INVALID','lease expiry must be after claim time',e));
      if(e.lease_id && leaseIds.has(e.lease_id)) findings.push(finding('LEASE_ID_REUSE','lease id may not be reused in a shift ledger',e));
      if(e.lease_id) leaseIds.add(e.lease_id);
      lease={lease_id:e.lease_id,delegation_id:e.delegation_id,objective_id:e.objective_id,control_head:e.control_head,idempotency_key:e.idempotency_key,expires_at:exp,attempt:e.attempt};
    } else if(EXECUTION.has(e.event_type)){
      if(!lease || lease.delegation_id!==e.delegation_id || lease.objective_id!==e.objective_id || lease.control_head!==e.control_head) findings.push(finding(`${e.event_type}_WITHOUT_CLAIM`,`${e.event_type} requires its matching live claim`,e));
      else {
        if(e.idempotency_key!==lease.idempotency_key) findings.push(finding('IDEMPOTENCY_KEY_MISMATCH','execution event changed claim idempotency key',e));
        if(lease.expires_at!==null && t>lease.expires_at) findings.push(finding('EXECUTION_AFTER_LEASE_EXPIRY','execution occurred after lease expiry',e));
      }
    } else if(e.event_type==='HEARTBEAT'){
      if(!lease || lease.lease_id!==e.lease_id || lease.idempotency_key!==e.idempotency_key || lease.delegation_id!==e.delegation_id) findings.push(finding('HEARTBEAT_WITHOUT_CLAIM','heartbeat requires matching live lease',e));
      else if(lease.expires_at!==null && t>lease.expires_at) findings.push(finding('HEARTBEAT_AFTER_LEASE_EXPIRY','heartbeat occurred after lease expiry',e));
    } else if(TERMINALS.has(e.event_type)){
      if(!lease || lease.delegation_id!==e.delegation_id || lease.objective_id!==e.objective_id || lease.control_head!==e.control_head) findings.push(finding('TERMINAL_WITHOUT_CLAIM','terminal event requires its matching live claim',e));
      else {
        if(e.idempotency_key && e.idempotency_key!==lease.idempotency_key) findings.push(finding('IDEMPOTENCY_KEY_MISMATCH','terminal event changed claim idempotency key',e));
        if(lease.expires_at!==null && t>lease.expires_at && e.event_type!=='STALE') findings.push(finding('TERMINAL_AFTER_LEASE_EXPIRY','non-STALE terminal occurred after lease expiry',e));
        lease=null;
      }
      terminalPendingSuccessor=true; lastTerminal=e.event_type;
    } else if(e.event_type==='RETRY'){
      if(!isInt(e.retry_budget) || e.retry_budget<1 || e.retry_budget>maxRetryBudget) findings.push(finding('RETRY_BUDGET_INVALID',`retry budget must be 1..${maxRetryBudget}`,e));
      if(!isInt(e.attempt) || !isInt(e.retry_budget) || e.attempt<1 || e.attempt>e.retry_budget) findings.push(finding('RETRY_ATTEMPT_EXCEEDS_BUDGET','retry attempt exceeds declared budget',e));
    } else if(e.event_type==='SUCCESSOR_BOUND'){
      if(!terminalPendingSuccessor) findings.push(finding('SUCCESSOR_SEQUENCE_INVALID','SUCCESSOR_BOUND requires a preceding terminal transition',e));
      terminalPendingSuccessor=false; lastTerminal=null;
    } else if(e.event_type==='READY'){
      if(terminalPendingSuccessor) findings.push(finding('SUCCESSOR_MISSING_AFTER_TERMINAL','READY after terminal requires SUCCESSOR_BOUND first',e));
    } else if(e.event_type==='SHIFT_CLOSE'){
      if(lease) findings.push(finding('SHIFT_CLOSE_WITH_OPEN_CLAIM','SHIFT_CLOSE cannot occur with live mutation claim',e));
      if(terminalPendingSuccessor) findings.push(finding('SHIFT_CLOSE_WITH_UNRECONCILED_TERMINAL','SHIFT_CLOSE cannot strand terminal work before successor/exhaustion reconciliation',e));
      shiftClosed=true;
    }
  }
  if(lease) findings.push({severity:'ERROR',type:'UNCLOSED_MUTATION_CLAIM',message:'ledger ends with unresolved mutation claim',lease_id:lease.lease_id});
  return findings;
}

function validateDelegationTimes(owner, now, options={}){
  const findings=[]; const nowMs=time(now); const skew=(options.future_clock_skew_seconds??120)*1000;
  for(const d of owner.active_delegations||[]){
    const rv=time(d.last_revalidated_at||d.created_at);
    if(nowMs!==null && rv!==null && rv>nowMs+skew) findings.push({severity:'ERROR',type:'FUTURE_REVALIDATION',delegation_id:d.delegation_id,message:'delegation revalidation is implausibly in the future'});
    const c=d.claim||owner.active_claim;
    if(c){ const hb=time(c.last_heartbeat_at); const cl=time(c.claimed_at); const ex=time(c.lease_expires_at);
      if(nowMs!==null && hb!==null && hb>nowMs+skew) findings.push({severity:'ERROR',type:'FUTURE_HEARTBEAT',delegation_id:d.delegation_id,message:'claim heartbeat is implausibly in the future'});
      if(cl!==null && hb!==null && hb<cl) findings.push({severity:'ERROR',type:'CLAIM_INVALID',delegation_id:d.delegation_id,message:'heartbeat predates claim'});
      if(cl!==null && ex!==null && ex<=cl) findings.push({severity:'ERROR',type:'CLAIM_INVALID',delegation_id:d.delegation_id,message:'lease expiry must follow claim'});
    }
  }
  return findings;
}

module.exports={validateLedgerLifecycle,validateDelegationTimes};
