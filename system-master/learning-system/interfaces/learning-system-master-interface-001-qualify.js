'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const root = __dirname;
const reqSchema = JSON.parse(fs.readFileSync(path.join(root,'learning-command-request.schema.json'),'utf8'));
const resSchema = JSON.parse(fs.readFileSync(path.join(root,'learning-command-response.schema.json'),'utf8'));
const eventSchema = JSON.parse(fs.readFileSync(path.join(root,'learning-event.schema.json'),'utf8'));
const mutationCommands = new Set(['COURSE_CONTINUE','ATTEMPT_SUBMIT','RETENTION_CHECK_REQUEST','LEARNING_ACTION_CANCEL']);
const forbiddenKeys = new Set(['raw_learner_response','mastery_override','core_correctness_flag','participant_consent_generated','psychometric_validity_claim','prose_target']);

function stable(v){
  if(Array.isArray(v)) return v.map(stable);
  if(v && typeof v === 'object'){
    const o={}; for(const k of Object.keys(v).sort()) o[k]=stable(v[k]); return o;
  }
  return v;
}
function semanticInput(r){return stable({actor_context_class:r.actor_context_class,command:r.command,learning_context:r.learning_context,evidence_policy:r.evidence_policy,command_input:r.command_input||{}});}
function fingerprint(r){return crypto.createHash('sha256').update(JSON.stringify(semanticInput(r))).digest('hex');}
function forbiddenPath(v,p='$'){
  if(Array.isArray(v)){for(let i=0;i<v.length;i++){const x=forbiddenPath(v[i],`${p}[${i}]`);if(x)return x;}return null;}
  if(v && typeof v==='object'){for(const [k,x] of Object.entries(v)){if(forbiddenKeys.has(k))return `${p}.${k}`;const y=forbiddenPath(x,`${p}.${k}`);if(y)return y;}}
  return null;
}
function admit(r, liveVersion, replayStore){
  if(!reqSchema.properties.command.enum.includes(r.command)) return {result_class:'REJECTED_INVALID_INPUT'};
  if(r.learning_context?.target_owner_path && r.learning_context.target_owner_path!=='SYSTEM_MASTER/LEARNING') return {result_class:'REJECTED_AUTHORITY_BOUNDARY'};
  if(forbiddenPath(r)) return {result_class:'REJECTED_AUTHORITY_BOUNDARY'};
  if(r.command==='ATTEMPT_SUBMIT' && r.evidence_policy==='USER_AUTHORIZED_LEARNER_EVIDENCE' && r.command_input?.consent_ref == null) return {result_class:'INSUFFICIENT_EVIDENCE'};
  if(mutationCommands.has(r.command)){
    if(r.command_input?.expected_learning_state_version === undefined) return {result_class:'REJECTED_INVALID_INPUT'};
    if(String(r.command_input.expected_learning_state_version)!==String(liveVersion)) return {result_class:'CONFLICT__LEARNING_STATE_ADVANCED'};
  }
  const key=r.idempotency_key, fp=fingerprint(r);
  if(replayStore.has(key)){
    const old=replayStore.get(key);
    if(old.fp!==fp) return {result_class:'REJECTED_INVALID_INPUT', reason:'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_INPUT'};
    return old.result;
  }
  const result={result_class:'SUCCESS',learning_state_version:liveVersion}; replayStore.set(key,{fp,result}); return result;
}
function dedupEvent(e,seen){if(seen.has(e.event_id))return false;seen.add(e.event_id);return true;}
function base(){return {request_id:'r1',idempotency_key:'k1',occurred_at:'2026-09-11T04:50:00Z',actor_context_class:'TEST_FIXTURE',command:'COURSE_CONTINUE',learning_context:{target_owner_path:'SYSTEM_MASTER/LEARNING',learner_scope:'fixture',course_id:'c1'},evidence_policy:'NO_HUMAN_EVIDENCE',command_input:{expected_learning_state_version:'7'}};}
let n=0;function t(name,fn){fn();n++;console.log(`PASS ${String(n).padStart(2,'0')} ${name}`)}

t('request schema draft',()=>assert.equal(reqSchema.$schema,'https://json-schema.org/draft/2020-12/schema'));
t('response schema draft',()=>assert.equal(resSchema.$schema,reqSchema.$schema));
t('event schema draft',()=>assert.equal(eventSchema.$schema,reqSchema.$schema));
t('six commands frozen',()=>assert.equal(reqSchema.properties.command.enum.length,6));
t('three actor classes frozen',()=>assert.equal(reqSchema.properties.actor_context_class.enum.length,3));
t('three evidence policies frozen',()=>assert.equal(reqSchema.properties.evidence_policy.enum.length,3));
t('ten result classes frozen',()=>assert.equal(resSchema.properties.result_class.enum.length,10));
t('three events frozen',()=>assert.equal(eventSchema.properties.event.enum.length,3));
t('event owner Learning const',()=>assert.equal(eventSchema.properties.owner_path.const,'SYSTEM_MASTER/LEARNING'));
t('request owner Learning const',()=>assert.equal(reqSchema.properties.learning_context.properties.target_owner_path.const,'SYSTEM_MASTER/LEARNING'));
t('stable canonicalization independent of key order',()=>assert.deepStrictEqual(stable({b:1,a:{d:2,c:3}}),{a:{c:3,d:2},b:1}));
t('fingerprint ignores request id transport identity',()=>{const a=base(),b=base();b.request_id='r2';assert.equal(fingerprint(a),fingerprint(b));});
t('fingerprint ignores occurred_at transport timestamp',()=>{const a=base(),b=base();b.occurred_at='2026-09-11T05:00:00Z';assert.equal(fingerprint(a),fingerprint(b));});
t('fingerprint changes command',()=>{const a=base(),b=base();b.command='LEARNING_STATUS_GET';assert.notEqual(fingerprint(a),fingerprint(b));});
t('fingerprint changes input',()=>{const a=base(),b=base();b.command_input.expected_learning_state_version='8';assert.notEqual(fingerprint(a),fingerprint(b));});
t('valid mutation succeeds',()=>assert.equal(admit(base(),'7',new Map()).result_class,'SUCCESS'));
t('stale mutation conflicts',()=>assert.equal(admit(base(),'8',new Map()).result_class,'CONFLICT__LEARNING_STATE_ADVANCED'));
t('missing mutation precondition rejected',()=>{const x=base();delete x.command_input.expected_learning_state_version;assert.equal(admit(x,'7',new Map()).result_class,'REJECTED_INVALID_INPUT');});
t('read only status needs no version',()=>{const x=base();x.command='LEARNING_STATUS_GET';x.command_input={};assert.equal(admit(x,'7',new Map()).result_class,'SUCCESS');});
t('same idempotency same semantic input replays',()=>{const s=new Map(),x=base();const a=admit(x,'7',s),b=admit({...x,request_id:'r2'},'7',s);assert.strictEqual(a,b);});
t('same idempotency changed input rejected',()=>{const s=new Map(),x=base();admit(x,'7',s);const y=JSON.parse(JSON.stringify(x));y.command_input.expected_learning_state_version='8';assert.equal(admit(y,'8',s).result_class,'REJECTED_INVALID_INPUT');});
t('Book target rejected',()=>{const x=base();x.learning_context.target_owner_path='SYSTEM_MASTER/BOOK';assert.equal(admit(x,'7',new Map()).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
t('Documents target rejected',()=>{const x=base();x.learning_context.target_owner_path='SYSTEM_MASTER/DOCUMENTS';assert.equal(admit(x,'7',new Map()).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
t('Programming target rejected',()=>{const x=base();x.learning_context.target_owner_path='SYSTEM_MASTER/PROGRAMMING';assert.equal(admit(x,'7',new Map()).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
t('retired Prose target rejected',()=>{const x=base();x.learning_context.target_owner_path='SYSTEM_MASTER/BOOK/PROSE';assert.equal(admit(x,'7',new Map()).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
t('core correctness injection rejected',()=>{const x=base();x.command_input.core_correctness_flag=true;assert.equal(admit(x,'7',new Map()).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
t('mastery override rejected',()=>{const x=base();x.command_input.mastery_override=1;assert.equal(admit(x,'7',new Map()).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
t('generated participant consent rejected',()=>{const x=base();x.command_input.participant_consent_generated=true;assert.equal(admit(x,'7',new Map()).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
t('real evidence policy requires consent ref',()=>{const x=base();x.command='ATTEMPT_SUBMIT';x.evidence_policy='USER_AUTHORIZED_LEARNER_EVIDENCE';x.command_input={expected_learning_state_version:'7'};assert.equal(admit(x,'7',new Map()).result_class,'INSUFFICIENT_EVIDENCE');});
t('real evidence with external consent ref can proceed structurally',()=>{const x=base();x.command='ATTEMPT_SUBMIT';x.evidence_policy='USER_AUTHORIZED_LEARNER_EVIDENCE';x.command_input={expected_learning_state_version:'7',consent_ref:'external:real'};assert.equal(admit(x,'7',new Map()).result_class,'SUCCESS');});
t('raw learner response forbidden in durable envelope',()=>{const x=base();x.command_input.raw_learner_response='secret';assert.equal(admit(x,'7',new Map()).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
t('event first delivery admitted',()=>assert.equal(dedupEvent({event_id:'e1'},new Set()),true));
t('event duplicate delivery deduped',()=>{const s=new Set();dedupEvent({event_id:'e1'},s);assert.equal(dedupEvent({event_id:'e1'},s),false);});
t('practice cannot inject mastery override',()=>{const x=base();x.command='ATTEMPT_SUBMIT';x.command_input={expected_learning_state_version:'7',mode:'PRACTICE',mastery_override:true};assert.equal(admit(x,'7',new Map()).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
t('cancel is mutation and requires current version',()=>{const x=base();x.command='LEARNING_ACTION_CANCEL';x.command_input={target_request_id:'old',expected_learning_state_version:'6'};assert.equal(admit(x,'7',new Map()).result_class,'CONFLICT__LEARNING_STATE_ADVANCED');});
t('retention check is mutation',()=>{const x=base();x.command='RETENTION_CHECK_REQUEST';delete x.command_input.expected_learning_state_version;assert.equal(admit(x,'7',new Map()).result_class,'REJECTED_INVALID_INPUT');});
t('unknown command rejected',()=>{const x=base();x.command='WRITE_BOOK';assert.equal(admit(x,'7',new Map()).result_class,'REJECTED_INVALID_INPUT');});
assert(n>=35);console.log(`LEARNING_SYSTEM_MASTER_INTERFACE_PORTABLE_PASS cases=${n}`);
