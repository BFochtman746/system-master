'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { validateOwner, validateLedger, DEFAULT_LIMITS } = require('../.github/scripts/second-shift-state-kernel-v2.js');

const ROOT = path.resolve(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'governance/second-shift/SECOND-SHIFT-UTILIZATION-EVENT-SCHEMA-001.json'), 'utf8'));
const HEAD = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const NOW = new Date('2026-09-11T05:00:00.000Z');
const LIMITS = { ...DEFAULT_LIMITS, heartbeat_sla_minutes: 5, ready_dispatch_sla_minutes: 5, telemetry_freshness_sla_minutes: 10, max_retry_budget: 3, max_clock_skew_seconds: 60 };

function d(overrides={}) { return { delegation_id:'D1', owner_path:'SYSTEM_MASTER/CORE', objective_id:'O1', obligation_id:'O1', state:'READY', valid_for_control_ref:'core/control', valid_for_control_head:HEAD, created_at:'2026-09-11T04:56:00Z', last_revalidated_at:'2026-09-11T04:58:00Z', completion_delta:'bounded', stop_condition:'terminal', allowed_work:['x'], forbidden_authority:['y'], on_pass:'next', on_failure:'block', ...overrides }; }
function claim(overrides={}) { return { lease_id:'L1', lane:'CORE', delegation_id:'D1', objective_id:'O1', control_ref:'core/control', control_head_at_claim:HEAD, idempotency_key:'I1', claimed_at:'2026-09-11T04:57:00Z', lease_expires_at:'2026-09-11T05:10:00Z', last_heartbeat_at:'2026-09-11T04:59:00Z', attempt:1, checkpoint_pointer:'cp:1', ...overrides }; }
function owner(active=[d()], overrides={}) { return { owner_system_id:'CORE', owner_path:'SYSTEM_MASTER/CORE', control_ref:'core/control', last_known_control_head:HEAD, active_delegations:active, retired_delegations:[], empty_is_valid:false, ...overrides }; }
function ev(n,type,overrides={}) { return { event_id:`E${n}-${type}`, occurred_at:`2026-09-11T04:${String(n).padStart(2,'0')}:00Z`, event_type:type, lane:'CORE', control_ref:'core/control', control_head:HEAD, delegation_id:'D1', objective_id:'O1', evidence:{kind:'stress'}, ...overrides }; }
function ce(n=2, overrides={}) { return ev(n,'CLAIMED',{lease_id:'L1',idempotency_key:'I1',lease_expires_at:'2026-09-11T05:10:00Z',attempt:1,...overrides}); }
function baseline() { return [ev(0,'SHIFT_OPEN'),ev(1,'READY'),ce(2),ev(3,'RUNNING',{lease_id:'L1',idempotency_key:'I1'}),ev(4,'HEARTBEAT',{lease_id:'L1',idempotency_key:'I1',checkpoint_pointer:'cp:2'}),ev(5,'PROGRESS',{lease_id:'L1',idempotency_key:'I1'}),ev(6,'COMPLETED',{lease_id:'L1',idempotency_key:'I1'}),ev(7,'SUCCESSOR_BOUND',{delegation_id:'D2',objective_id:'O2'}),ev(8,'SHIFT_CLOSE',{delegation_id:'D2',objective_id:'O2'})]; }
function ledger(events=baseline()) { return { schema_id:schema.schema_id, shift_id:'S1', shift_date:'2026-09-11', lane:'CORE', events }; }
function rungs(){return Array.from({length:8},(_,i)=>({rung:i+1,disposition:'DEPENDENCY_BLOCKED',evidence_or_blocker:`b${i}`,independent_preparation_assessment:'none',next_executable_condition:'change'}));}
function errs(f){return f.filter(x=>x.severity==='ERROR');}
function has(f,t){return f.some(x=>x.severity==='ERROR'&&x.type===t);}
function expect(f,t){assert(has(f,t),`missing ${t}: ${JSON.stringify(f)}`);}
function clean(f){assert.strictEqual(errs(f).length,0,JSON.stringify(f));}

const named=[]; function test(name,fn){named.push([name,fn]);}

test('owner ready fresh',()=>clean(validateOwner(owner(),'CORE',NOW,LIMITS)));
test('owner ready overdue',()=>expect(validateOwner(owner([d({last_revalidated_at:'2026-09-11T04:40:00Z'})]),'CORE',NOW,LIMITS),'READY_UNDISPATCHED'));
test('owner future revalidation',()=>expect(validateOwner(owner([d({last_revalidated_at:'2026-09-11T05:10:00Z'})]),'CORE',NOW,LIMITS),'FUTURE_REVALIDATION'));
test('owner expired claim',()=>expect(validateOwner(owner([d({state:'CLAIMED',claim:claim({lease_expires_at:'2026-09-11T04:59:00Z'})})]),'CORE',NOW,LIMITS),'STALE_CLAIM'));
test('owner stale heartbeat',()=>expect(validateOwner(owner([d({state:'CLAIMED',claim:claim({claimed_at:'2026-09-11T04:40:00Z',last_heartbeat_at:'2026-09-11T04:50:00Z'})})]),'CORE',NOW,LIMITS),'STALE_CLAIM'));
test('owner future heartbeat',()=>expect(validateOwner(owner([d({state:'CLAIMED',claim:claim({last_heartbeat_at:'2026-09-11T05:10:00Z'})})]),'CORE',NOW,LIMITS),'FUTURE_HEARTBEAT'));
test('owner overlapping claims',()=>{const d1=d({state:'CLAIMED',claim:claim()});const d2=d({delegation_id:'D2',objective_id:'O2',obligation_id:'O2',state:'CLAIMED',claim:claim({lease_id:'L2',delegation_id:'D2',objective_id:'O2',idempotency_key:'I2'})});expect(validateOwner(owner([d1,d2]),'CORE',NOW,LIMITS),'OVERLAPPING_MUTATION_CLAIMS');});
test('owner stale head',()=>expect(validateOwner(owner([d({valid_for_control_head:OTHER})]),'CORE',NOW,LIMITS),'STALE_DELEGATION'));
test('owner empty without exhaustion',()=>expect(validateOwner(owner([]),'CORE',NOW,LIMITS),'SECOND_SHIFT_SCOPE_VIOLATION'));
test('owner valid exhaustion',()=>clean(validateOwner(owner([],{empty_is_valid:true,all_rungs_exhausted:{rungs:rungs(),independent_work_remaining:false,next_external_condition:'external'}}),'CORE',NOW,LIMITS)));

test('baseline ledger',()=>clean(validateLedger(ledger(),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS})));
test('duplicate id',()=>{const x=baseline();x[2].event_id=x[1].event_id;expect(validateLedger(ledger(x),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'UTILIZATION_EVENT_DUPLICATE');});
test('out of order',()=>{const x=baseline();x[4].occurred_at='2026-09-11T04:01:30Z';expect(validateLedger(ledger(x),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'UTILIZATION_EVENT_ORDER_INVALID');});
test('running without claim',()=>expect(validateLedger(ledger([ev(0,'SHIFT_OPEN'),ev(1,'RUNNING',{idempotency_key:'I1'})]),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'RUNNING_WITHOUT_CLAIM'));
test('progress without claim',()=>expect(validateLedger(ledger([ev(0,'SHIFT_OPEN'),ev(1,'PROGRESS',{idempotency_key:'I1'})]),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'PROGRESS_WITHOUT_CLAIM'));
test('terminal without claim',()=>expect(validateLedger(ledger([ev(0,'SHIFT_OPEN'),ev(1,'COMPLETED',{idempotency_key:'I1'})]),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'TERMINAL_WITHOUT_CLAIM'));
test('idempotency mismatch',()=>{const x=[ev(0,'SHIFT_OPEN'),ce(1),ev(2,'RUNNING',{lease_id:'L1',idempotency_key:'BAD'}),ev(3,'STALE',{lease_id:'L1',idempotency_key:'I1'})];expect(validateLedger(ledger(x),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'IDEMPOTENCY_KEY_MISMATCH');});
test('objective mismatch',()=>{const x=[ev(0,'SHIFT_OPEN'),ce(1),ev(2,'PROGRESS',{lease_id:'L1',idempotency_key:'I1',objective_id:'BAD'}),ev(3,'STALE',{lease_id:'L1',idempotency_key:'I1'})];expect(validateLedger(ledger(x),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'PROGRESS_CLAIM_IDENTITY_MISMATCH');});
test('lease id mismatch',()=>{const x=[ev(0,'SHIFT_OPEN'),ce(1),ev(2,'RUNNING',{lease_id:'BAD',idempotency_key:'I1'}),ev(3,'STALE',{lease_id:'L1',idempotency_key:'I1'})];expect(validateLedger(ledger(x),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'LEASE_ID_MISMATCH');});
test('execution after expiry',()=>{const x=[ev(0,'SHIFT_OPEN'),ce(1,{lease_expires_at:'2026-09-11T04:01:30Z'}),ev(2,'RUNNING',{lease_id:'L1',idempotency_key:'I1'}),ev(3,'STALE',{lease_id:'L1',idempotency_key:'I1'})];expect(validateLedger(ledger(x),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'EXECUTION_AFTER_LEASE_EXPIRY');});
test('terminal mismatch keeps claim open',()=>{const x=[ev(0,'SHIFT_OPEN'),ce(1),ev(2,'COMPLETED',{lease_id:'L1',idempotency_key:'BAD'})];const f=validateLedger(ledger(x),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS});expect(f,'TERMINAL_CLAIM_MISMATCH');expect(f,'UNCLOSED_MUTATION_CLAIM');});
test('retry fields',()=>expect(validateLedger(ledger([ev(0,'SHIFT_OPEN'),ev(1,'RETRY')]),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'RETRY_EVENT_INVALID'));
test('retry max',()=>expect(validateLedger(ledger([ev(0,'SHIFT_OPEN'),ev(1,'RETRY',{dependency_or_operation:'dep',failure_class:'TRANSIENT',attempt:4,retry_budget:4,next_action:'circuit'})]),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'RETRY_BUDGET_INVALID'));
test('retry attempt',()=>expect(validateLedger(ledger([ev(0,'SHIFT_OPEN'),ev(1,'RETRY',{dependency_or_operation:'dep',failure_class:'TRANSIENT',attempt:3,retry_budget:2,next_action:'circuit'})]),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'RETRY_ATTEMPT_EXCEEDS_BUDGET'));
test('circuit fields',()=>expect(validateLedger(ledger([ev(0,'SHIFT_OPEN'),ev(1,'CIRCUIT_OPEN')]),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'CIRCUIT_EVENT_INVALID'));
test('circuit before exhausted',()=>{const x=[ev(0,'SHIFT_OPEN'),ev(1,'RETRY',{dependency_or_operation:'dep',failure_class:'TRANSIENT',attempt:1,retry_budget:3,next_action:'retry'}),ev(2,'CIRCUIT_OPEN',{dependency_or_operation:'dep',failure_class:'TRANSIENT',next_probe_at_or_condition:'later',fallback_successor_or_rung:'r2'})];expect(validateLedger(ledger(x),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'CIRCUIT_OPEN_BEFORE_RETRY_EXHAUSTION');});
test('circuit sequence',()=>{const x=[ev(0,'SHIFT_OPEN'),ev(1,'CIRCUIT_HALF_OPEN',{dependency_or_operation:'dep',failure_class:'TRANSIENT',next_probe_at_or_condition:'now',fallback_successor_or_rung:'r2'})];expect(validateLedger(ledger(x),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'CIRCUIT_SEQUENCE_INVALID');});
test('successor without terminal',()=>expect(validateLedger(ledger([ev(0,'SHIFT_OPEN'),ev(1,'SUCCESSOR_BOUND')]),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'SUCCESSOR_SEQUENCE_INVALID'));
test('ready before successor',()=>{const x=[ev(0,'SHIFT_OPEN'),ce(1),ev(2,'COMPLETED',{lease_id:'L1',idempotency_key:'I1'}),ev(3,'READY')];expect(validateLedger(ledger(x),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'SUCCESSOR_MISSING_AFTER_TERMINAL');});
test('invalid exhaustion',()=>expect(validateLedger(ledger([ev(0,'SHIFT_OPEN'),ev(1,'ALL_RUNGS_EXHAUSTED',{rungs:rungs().slice(0,7),independent_work_remaining:false,next_external_condition:'x'})]),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'ALL_RUNGS_EXHAUSTED_INVALID'));
test('idle without exhaustion',()=>expect(validateLedger(ledger([ev(0,'SHIFT_OPEN'),ev(1,'IDLE_VALID')]),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'IDLE_WITHOUT_EXHAUSTION'));
test('close open claim',()=>{const x=[ev(0,'SHIFT_OPEN'),ce(1),ev(2,'SHIFT_CLOSE')];expect(validateLedger(ledger(x),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'SHIFT_CLOSE_WITH_OPEN_CLAIM');});
test('event after close',()=>expect(validateLedger(ledger([ev(0,'SHIFT_OPEN'),ev(1,'SHIFT_CLOSE'),ev(2,'READY')]),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'EVENT_AFTER_SHIFT_CLOSE'));
test('duplicate open',()=>expect(validateLedger(ledger([ev(0,'SHIFT_OPEN'),ev(1,'SHIFT_OPEN')]),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'SHIFT_OPEN_SEQUENCE_INVALID'));
test('idempotency reuse',()=>{const x=[ev(0,'SHIFT_OPEN'),ce(1),ev(2,'COMPLETED',{lease_id:'L1',idempotency_key:'I1'}),ev(3,'SUCCESSOR_BOUND'),ce(4,{lease_id:'L2',delegation_id:'D2',objective_id:'O2',idempotency_key:'I1'}),ev(5,'STALE',{lease_id:'L2',delegation_id:'D2',objective_id:'O2',idempotency_key:'I1'})];expect(validateLedger(ledger(x),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}),'IDEMPOTENCY_KEY_REUSE');});
test('stale telemetry',()=>{const f=validateLedger(ledger([ev(0,'SHIFT_OPEN'),ev(1,'READY')]),'CORE','2026-09-11',owner(),schema,{now:new Date('2026-09-11T05:00:00Z'),dynamic:true,limits:{...LIMITS,telemetry_freshness_sla_minutes:10}});expect(f,'TELEMETRY_STALE');});
test('reconciliation stale exception',()=>{const x=[ev(0,'SHIFT_OPEN'),ev(1,'STALE',{evidence:{classification:'TELEMETRY_GAP_RECONCILED_FROM_EXACT_MAIN_EVIDENCE'}})];clean(validateLedger(ledger(x),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS}));});

let namedFailed=0;
for(const [name,fn] of named){try{fn();console.log(`PASS named ${name}`);}catch(e){namedFailed++;console.error(`FAIL named ${name}: ${e.message}`);}}

// Deterministic mutation fuzz: each generated case starts from a valid claim lifecycle and corrupts one safety invariant.
let seed=0x51f7a11; function rnd(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;}
const mutations=['idem','objective','lease','terminal-idem','terminal-objective','terminal-head','terminal-no-claim','successor-early','retry-over','retry-attempt','event-after-close','duplicate-id','time-order','execution-after-expiry','heartbeat-after-expiry','idempotency-reuse'];
let fuzzFailed=0; const samples=[]; const FUZZ_CASES=10000;
for(let i=0;i<FUZZ_CASES;i++){
  const kind=mutations[Math.floor(rnd()*mutations.length)]; let x=baseline(); let expected=null;
  if(kind==='idem'){x[3].idempotency_key='BAD';expected='IDEMPOTENCY_KEY_MISMATCH';}
  else if(kind==='objective'){x[5].objective_id='BAD';expected='PROGRESS_CLAIM_IDENTITY_MISMATCH';}
  else if(kind==='lease'){x[3].lease_id='BAD';expected='LEASE_ID_MISMATCH';}
  else if(kind==='terminal-idem'){x[6].idempotency_key='BAD';expected='TERMINAL_CLAIM_MISMATCH';}
  else if(kind==='terminal-objective'){x[6].objective_id='BAD';expected='TERMINAL_CLAIM_MISMATCH';}
  else if(kind==='terminal-head'){x[6].control_head=OTHER;expected='TERMINAL_CLAIM_MISMATCH';}
  else if(kind==='terminal-no-claim'){x=[ev(0,'SHIFT_OPEN'),ev(1,'COMPLETED')];expected='TERMINAL_WITHOUT_CLAIM';}
  else if(kind==='successor-early'){x=[ev(0,'SHIFT_OPEN'),ev(1,'SUCCESSOR_BOUND')];expected='SUCCESSOR_SEQUENCE_INVALID';}
  else if(kind==='retry-over'){x=[ev(0,'SHIFT_OPEN'),ev(1,'RETRY',{dependency_or_operation:'d',failure_class:'T',attempt:4,retry_budget:4,next_action:'x'})];expected='RETRY_BUDGET_INVALID';}
  else if(kind==='retry-attempt'){x=[ev(0,'SHIFT_OPEN'),ev(1,'RETRY',{dependency_or_operation:'d',failure_class:'T',attempt:3,retry_budget:2,next_action:'x'})];expected='RETRY_ATTEMPT_EXCEEDS_BUDGET';}
  else if(kind==='event-after-close'){x=[ev(0,'SHIFT_OPEN'),ev(1,'SHIFT_CLOSE'),ev(2,'READY')];expected='EVENT_AFTER_SHIFT_CLOSE';}
  else if(kind==='duplicate-id'){x[4].event_id=x[3].event_id;expected='UTILIZATION_EVENT_DUPLICATE';}
  else if(kind==='time-order'){x[5].occurred_at='2026-09-11T04:02:30Z';expected='UTILIZATION_EVENT_ORDER_INVALID';}
  else if(kind==='execution-after-expiry'){x[2].lease_expires_at='2026-09-11T04:02:30Z';expected='EXECUTION_AFTER_LEASE_EXPIRY';}
  else if(kind==='heartbeat-after-expiry'){x[2].lease_expires_at='2026-09-11T04:03:30Z';expected='HEARTBEAT_AFTER_LEASE_EXPIRY';}
  else if(kind==='idempotency-reuse'){x=[ev(0,'SHIFT_OPEN'),ce(1),ev(2,'COMPLETED',{lease_id:'L1',idempotency_key:'I1'}),ev(3,'SUCCESSOR_BOUND'),ce(4,{lease_id:'L2',delegation_id:'D2',objective_id:'O2',idempotency_key:'I1'}),ev(5,'STALE',{lease_id:'L2',delegation_id:'D2',objective_id:'O2',idempotency_key:'I1'})];expected='IDEMPOTENCY_KEY_REUSE';}
  const f=validateLedger(ledger(x),'CORE','2026-09-11',owner(),schema,{now:NOW,limits:LIMITS});
  if(!has(f,expected)){fuzzFailed++;if(samples.length<20)samples.push({i,kind,expected,observed:errs(f).map(z=>z.type)});}
}

// Replay today's real ledgers through the stricter kernel. Compatibility findings are reported separately and are never hidden.
const registry=JSON.parse(fs.readFileSync(path.join(ROOT,'governance/second-shift/SECOND-SHIFT-REGISTRY-001.json'),'utf8'));
const replay=[];
for(const [lane,rel] of Object.entries(registry.owner_files)){
  const ownerObj=JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
  const lp=path.join(ROOT,'governance','second-shift','execution-events','2026-09-11',`${lane}.json`);
  if(!fs.existsSync(lp)){replay.push({lane,status:'MISSING'});continue;}
  const l=JSON.parse(fs.readFileSync(lp,'utf8'));
  const f=validateLedger(l,lane,'2026-09-11',ownerObj,schema,{now:new Date('2026-09-11T12:00:00Z'),dynamic:false,limits:LIMITS});
  replay.push({lane,status:errs(f).length?'INCOMPATIBLE':'PASS',errors:errs(f).map(x=>({type:x.type,event_id:x.event_id||null,index:x.index??null}))});
}

const report={suite:'SECOND_SHIFT_STATE_KERNEL_V2_STRESS',named_cases:named.length,named_failed:namedFailed,fuzz_cases:FUZZ_CASES,fuzz_failed:fuzzFailed,fuzz_samples:samples,historical_replay:replay};
fs.writeFileSync('.second-shift-kernel-v2-stress.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(namedFailed||fuzzFailed)process.exit(1);
