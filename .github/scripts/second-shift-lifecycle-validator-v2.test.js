'use strict';
const assert=require('assert');
const {validateLedgerLifecycle,validateDelegationTimes}=require('./second-shift-lifecycle-validator-v2');
const NOW='2026-09-11T04:00:00-04:00';
function e(type,minute,extra={}){return {event_id:`E-${type}-${minute}-${Math.random()}`,occurred_at:`2026-09-11T03:${String(minute).padStart(2,'0')}:00-04:00`,event_type:type,lane:'CORE',control_ref:'core/ref',control_head:'a'.repeat(40),delegation_id:'D1',objective_id:'O1',evidence:'test',...extra};}
function claim(minute=31,extra={}){return e('CLAIMED',minute,{lease_id:'L1',idempotency_key:'I1',lease_expires_at:'2026-09-11T03:50:00-04:00',attempt:1,...extra});}
function types(events){return new Set(validateLedgerLifecycle({events},{now:NOW,max_retry_budget:3,future_clock_skew_seconds:120}).map(x=>x.type));}
function must(name,type,events){const t=types(events);assert(t.has(type),`${name}: missing ${type}; got ${[...t]}`);}
function clean(events){const f=validateLedgerLifecycle({events},{now:NOW,max_retry_budget:3,future_clock_skew_seconds:120});assert.equal(f.length,0,JSON.stringify(f));}
clean([e('SHIFT_OPEN',30),claim(31),e('RUNNING',32,{idempotency_key:'I1'}),e('PROGRESS',33,{idempotency_key:'I1'}),e('HEARTBEAT',34,{lease_id:'L1',idempotency_key:'I1',checkpoint_pointer:'cp'}),e('COMPLETED',35,{idempotency_key:'I1'}),e('SUCCESSOR_BOUND',36),e('READY',37),e('SHIFT_CLOSE',38)]);
must('retry max','RETRY_BUDGET_INVALID',[e('SHIFT_OPEN',30),e('RETRY',31,{retry_budget:4,attempt:1})]);
must('retry attempt','RETRY_ATTEMPT_EXCEEDS_BUDGET',[e('SHIFT_OPEN',30),e('RETRY',31,{retry_budget:2,attempt:3})]);
must('terminal claim','TERMINAL_WITHOUT_CLAIM',[e('SHIFT_OPEN',30),e('COMPLETED',31)]);
must('idempotency','IDEMPOTENCY_KEY_MISMATCH',[e('SHIFT_OPEN',30),claim(31),e('RUNNING',32,{idempotency_key:'WRONG'}),e('STALE',33)]);
must('expiry','EXECUTION_AFTER_LEASE_EXPIRY',[e('SHIFT_OPEN',30),claim(31,{lease_expires_at:'2026-09-11T03:32:00-04:00'}),e('RUNNING',33,{idempotency_key:'I1'}),e('STALE',34)]);
must('successor','SUCCESSOR_SEQUENCE_INVALID',[e('SHIFT_OPEN',30),e('SUCCESSOR_BOUND',31)]);
must('missing successor','SUCCESSOR_MISSING_AFTER_TERMINAL',[e('SHIFT_OPEN',30),claim(31),e('COMPLETED',32),e('READY',33)]);
must('close lease','SHIFT_CLOSE_WITH_OPEN_CLAIM',[e('SHIFT_OPEN',30),claim(31),e('SHIFT_CLOSE',32)]);
must('event after close','EVENT_AFTER_SHIFT_CLOSE',[e('SHIFT_OPEN',30),e('SHIFT_CLOSE',31),e('READY',32)]);
must('lease reuse','LEASE_ID_REUSE',[e('SHIFT_OPEN',30),claim(31),e('STALE',32),e('SUCCESSOR_BOUND',33),e('READY',34),claim(35)]);
must('future event','FUTURE_EVENT_TIME',[{...e('READY',31),occurred_at:'2026-09-11T04:10:00-04:00'}]);
let df=validateDelegationTimes({active_delegations:[{delegation_id:'D',created_at:'2026-09-11T04:10:00-04:00'}]},NOW);assert(df.some(x=>x.type==='FUTURE_REVALIDATION'));
df=validateDelegationTimes({active_delegations:[{delegation_id:'D',created_at:'2026-09-11T03:00:00-04:00',claim:{claimed_at:'2026-09-11T03:00:00-04:00',last_heartbeat_at:'2026-09-11T04:10:00-04:00',lease_expires_at:'2026-09-11T04:20:00-04:00'}}]},NOW);assert(df.some(x=>x.type==='FUTURE_HEARTBEAT'));

// Independent randomized model: every generated deliberately-invalid sequence must be rejected.
let seed=0x51f7cafe; function rnd(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;} function pick(a){return a[Math.floor(rnd()*a.length)];}
const mutations=['terminal_without_claim','run_without_claim','heartbeat_without_claim','retry_over','retry_attempt','successor_without_terminal','close_with_claim','idempotency','after_expiry','event_after_close'];
let rejected=0;
for(let i=0;i<10000;i++){
  const m=pick(mutations); let ev=[e('SHIFT_OPEN',30)];
  if(m==='terminal_without_claim')ev.push(e(pick(['COMPLETED','BLOCKED','STALE']),31));
  if(m==='run_without_claim')ev.push(e(pick(['RUNNING','PROGRESS']),31,{idempotency_key:'I1'}));
  if(m==='heartbeat_without_claim')ev.push(e('HEARTBEAT',31,{lease_id:'L1',idempotency_key:'I1',checkpoint_pointer:'cp'}));
  if(m==='retry_over')ev.push(e('RETRY',31,{retry_budget:4,attempt:1}));
  if(m==='retry_attempt')ev.push(e('RETRY',31,{retry_budget:2,attempt:3}));
  if(m==='successor_without_terminal')ev.push(e('SUCCESSOR_BOUND',31));
  if(m==='close_with_claim')ev.push(claim(31),e('SHIFT_CLOSE',32));
  if(m==='idempotency')ev.push(claim(31),e('RUNNING',32,{idempotency_key:'X'}),e('STALE',33));
  if(m==='after_expiry')ev.push(claim(31,{lease_expires_at:'2026-09-11T03:32:00-04:00'}),e('RUNNING',33,{idempotency_key:'I1'}),e('STALE',34));
  if(m==='event_after_close')ev.push(e('SHIFT_CLOSE',31),e('READY',32));
  if(validateLedgerLifecycle({events:ev},{now:NOW,max_retry_budget:3}).some(x=>x.severity==='ERROR'))rejected++;
}
assert.equal(rejected,10000,`only ${rejected}/10000 invalid sequences rejected`);
console.log(JSON.stringify({result:'PASS',named_boundaries:13,property_invalid_sequences:10000,rejected,seed:'0x51f7cafe'},null,2));
