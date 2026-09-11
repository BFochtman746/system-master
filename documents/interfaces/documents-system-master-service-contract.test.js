'use strict';

const assert = require('assert');
const crypto = require('crypto');
const contract = require('./DOCUMENTS-SYSTEM-MASTER-SERVICE-CONTRACT-001.json');

const SHA256 = /^[a-f0-9]{64}$/;
const FORBIDDEN = new Set(contract.forbidden_payload_fields);
function isObject(v){return v !== null && typeof v === 'object' && !Array.isArray(v);}
function canonical(v){
  if(Array.isArray(v)) return v.map(canonical);
  if(isObject(v)){const o={}; for(const k of Object.keys(v).sort()) o[k]=canonical(v[k]); return o;}
  return v;
}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');}
function noForbidden(v, at='root'){
  if(Array.isArray(v)) return v.forEach((x,i)=>noForbidden(x,`${at}.${i}`));
  if(!isObject(v)) return;
  for(const [k,x] of Object.entries(v)){
    if(FORBIDDEN.has(k)) throw Object.assign(new Error(`FORBIDDEN_FIELD:${at}.${k}`),{code:'FORBIDDEN_FIELD'});
    noForbidden(x,`${at}.${k}`);
  }
}
function validateArtifactRef(a){assert(isObject(a)); assert(typeof a.artifact_id==='string'&&a.artifact_id); assert(SHA256.test(a.digest_sha256));}
function validateRequest(r){
  noForbidden(r); assert.strictEqual(r.schema_version,1); assert(contract.operations.includes(r.operation));
  for(const k of contract.request.required) assert(Object.prototype.hasOwnProperty.call(r,k),`missing ${k}`);
  assert(typeof r.request_id==='string'&&r.request_id); assert(typeof r.correlation_id==='string'&&r.correlation_id); assert(typeof r.idempotency_key==='string'&&r.idempotency_key);
  validateArtifactRef(r.input_artifact); return true;
}
function validateResponse(r,req){
  noForbidden(r); assert.strictEqual(r.schema_version,1); assert.strictEqual(r.request_id,req.request_id); assert.strictEqual(r.correlation_id,req.correlation_id); assert(contract.response.statuses.includes(r.status)); assert(Array.isArray(r.evidence_refs));
  if(r.status==='SUCCEEDED'){assert(Array.isArray(r.output_artifacts)&&r.output_artifacts.length>0); r.output_artifacts.forEach(validateArtifactRef);}
  if(r.status==='FAILED'||r.status==='BLOCKED'){assert(isObject(r.error)); for(const k of contract.response.error_required_when_failed_or_blocked) assert(Object.prototype.hasOwnProperty.call(r.error,k));}
  return true;
}
function validateEvent(e,req,lastSequence=0){
  noForbidden(e); assert.strictEqual(e.schema_version,1); assert(contract.event.event_types.includes(e.event_type)); assert.strictEqual(e.request_id,req.request_id); assert.strictEqual(e.correlation_id,req.correlation_id); assert(Number.isInteger(e.sequence)&&e.sequence===lastSequence+1); assert(Array.isArray(e.evidence_refs)); return true;
}
function semanticRequestDigest(r){
  validateRequest(r);
  const copy=JSON.parse(JSON.stringify(r)); delete copy.request_id; delete copy.correlation_id; return digest(copy);
}
function admitIdempotent(cache,r){
  const d=semanticRequestDigest(r); const prior=cache.get(r.idempotency_key);
  if(!prior){cache.set(r.idempotency_key,d); return 'NEW';}
  if(prior===d) return 'REPLAY';
  const err=new Error('IDEMPOTENCY_CONFLICT'); err.code='IDEMPOTENCY_CONFLICT'; throw err;
}
function expectCode(fn,code){let err; try{fn();}catch(e){err=e;} assert(err); assert.strictEqual(err.code,code);}

const req={schema_version:1,request_id:'req-001',operation:'RENDER',input_artifact:{artifact_id:'artifact://source/1',digest_sha256:digest('source')},target_format:'application/pdf',options:{page_size:'letter'},idempotency_key:'idem-001',correlation_id:'corr-001',caller_system_id:'SYSTEM_MASTER'};
validateRequest(req);
assert.strictEqual(semanticRequestDigest(req),semanticRequestDigest({...req,request_id:'req-retry',correlation_id:'corr-retry'}));
const cache=new Map(); assert.strictEqual(admitIdempotent(cache,req),'NEW'); assert.strictEqual(admitIdempotent(cache,{...req,request_id:'req-retry',correlation_id:'corr-retry'}),'REPLAY');
expectCode(()=>admitIdempotent(cache,{...req,target_format:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),'IDEMPOTENCY_CONFLICT');
expectCode(()=>validateRequest({...req,raw_bytes:'abc'}),'FORBIDDEN_FIELD');
expectCode(()=>validateRequest({...req,manuscript_text:'abc'}),'FORBIDDEN_FIELD');

const success={schema_version:1,request_id:req.request_id,correlation_id:req.correlation_id,status:'SUCCEEDED',output_artifacts:[{artifact_id:'artifact://render/1',digest_sha256:digest('output')}],evidence_refs:['evidence://render/1']};
validateResponse(success,req);
assert.throws(()=>validateResponse({...success,output_artifacts:[]},req));
const blocked={schema_version:1,request_id:req.request_id,correlation_id:req.correlation_id,status:'BLOCKED',error:{code:'NATIVE_REQUIRED',class:'NATIVE_BOUNDARY',retryable:false},evidence_refs:['evidence://blocker/1']}; validateResponse(blocked,req);
assert.throws(()=>validateResponse({...blocked,error:null},req));
assert.throws(()=>validateResponse({...success,request_id:'wrong'},req));

const e1={schema_version:1,event_id:'evt-001',event_type:'DOCUMENT_SERVICE_ACCEPTED',request_id:req.request_id,correlation_id:req.correlation_id,sequence:1,evidence_refs:[]};
const e2={schema_version:1,event_id:'evt-002',event_type:'DOCUMENT_SERVICE_SUCCEEDED',request_id:req.request_id,correlation_id:req.correlation_id,sequence:2,evidence_refs:['evidence://render/1']};
validateEvent(e1,req,0); validateEvent(e2,req,1); assert.throws(()=>validateEvent({...e2,sequence:4},req,1));
for(const op of contract.operations) validateRequest({...req,request_id:`req-${op}`,operation:op,idempotency_key:`idem-${op}`});
assert.strictEqual(contract.r4_dependency,'NONE_FOR_INTERFACE_CONTRACT__R4_EXACT_BYTE_CUSTODY_REMAINS_SEPARATE_BLOCKER');
assert.strictEqual(contract.production_authorized,false);

console.log(JSON.stringify({result:'PASS',cases:20,operations:contract.operations.length,reference_only:true,idempotency_conflict_rejected:true,correlation_preserved:true,classified_blocker_required:true,raw_bytes_forbidden:true,cross_lane_semantic_payload_fields_forbidden:true,r4_dependency:false,production_authorized:false}));
