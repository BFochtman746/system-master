'use strict';

const crypto = require('crypto');

class BookRightsCustodyError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookRightsCustodyError';
    this.code = code;
    this.detail = detail;
  }
}

const DISPOSITIONS = new Set([
  'UNKNOWN','REVIEW_REQUIRED','STALE','EXPIRED','REVOKED','CONFLICTING','REJECTED_FOR_SCOPE','ACCEPTED_FOR_DECLARED_SCOPE'
]);
const CURRENTNESS = new Set(['CURRENT','STALE','EXPIRED','REVOKED','UNKNOWN']);
function fail(code, detail='') { throw new BookRightsCustodyError(code, detail); }
function obj(v){ return v!==null && typeof v==='object' && !Array.isArray(v); }
function nonEmpty(v){ return typeof v==='string' && v.trim().length>0; }
function isSha(v){ return typeof v==='string' && /^[a-f0-9]{64}$/.test(v); }
function clone(v){ return v===undefined?undefined:JSON.parse(JSON.stringify(v)); }
function normalize(v){ if(Array.isArray(v)) return v.map(normalize); if(obj(v)){const o={}; for(const k of Object.keys(v).sort()) o[k]=normalize(v[k]); return o;} return v; }
function stable(v){ return JSON.stringify(normalize(v)); }
function sha256(v){ return crypto.createHash('sha256').update(typeof v==='string'?v:stable(v)).digest('hex'); }
function req(v, fields, label){ if(!obj(v)) fail('OBJECT_REQUIRED',label); for(const f of fields) if(!Object.prototype.hasOwnProperty.call(v,f)) fail('REQUIRED_FIELD_MISSING',`${label}.${f}`); }
function parseTime(v,label){ if(v===null||v===undefined) return null; const n=Date.parse(v); if(Number.isNaN(n)) fail('INVALID_TIME',label); return n; }

function validateEvidence(evidence) {
  req(evidence,['evidence_id','evidence_issuer_ref','evidence_ref','source_ref','source_digest','intended_use_scopes','currentness','effective_at','expires_at','revoked_at','conflict_refs','policy_expression'], 'evidence');
  if(!nonEmpty(evidence.evidence_id)||!nonEmpty(evidence.evidence_issuer_ref)||!nonEmpty(evidence.evidence_ref)||!nonEmpty(evidence.source_ref)) fail('RIGHTS_AUTHORITY_EVIDENCE_REQUIRED');
  if(!isSha(evidence.source_digest)) fail('INVALID_SOURCE_DIGEST');
  if(!Array.isArray(evidence.intended_use_scopes)||evidence.intended_use_scopes.some(x=>!nonEmpty(x))) fail('INVALID_INTENDED_USE_SCOPE');
  if(!CURRENTNESS.has(evidence.currentness)) fail('INVALID_CURRENTNESS');
  if(!Array.isArray(evidence.conflict_refs)) fail('CONFLICT_REFS_ARRAY_REQUIRED');
  if(!obj(evidence.policy_expression)) fail('POLICY_EXPRESSION_OBJECT_REQUIRED');
  return true;
}

function policyUnderstanding(policy, understood) {
  const type = policy.type || null;
  if(type===null) return {understood:true, refs:[]};
  if(!['ODRL','SPDX','OPAQUE_EXTERNAL'].includes(type)) return {understood:false, reason:'UNKNOWN_POLICY_TYPE', refs:[]};
  const refs=[];
  if(type==='ODRL') {
    if(!nonEmpty(policy.policy_ref)) return {understood:false,reason:'ODRL_POLICY_REF_REQUIRED',refs:[]};
    refs.push(policy.policy_ref);
    if(policy.profile_ref) {
      refs.push(policy.profile_ref);
      if(!Array.isArray(understood.odrl_profiles)||!understood.odrl_profiles.includes(policy.profile_ref)) return {understood:false,reason:'UNKNOWN_ODRL_PROFILE',refs};
    }
    if(policy.action_ref && Array.isArray(understood.odrl_actions) && !understood.odrl_actions.includes(policy.action_ref)) return {understood:false,reason:'UNKNOWN_ODRL_ACTION',refs:[...refs,policy.action_ref]};
  } else if(type==='SPDX') {
    if(!nonEmpty(policy.license_expression)) return {understood:false,reason:'SPDX_EXPRESSION_REQUIRED',refs:[]};
    refs.push(policy.license_expression);
  } else {
    if(!nonEmpty(policy.policy_ref)) return {understood:false,reason:'EXTERNAL_POLICY_REF_REQUIRED',refs:[]};
    refs.push(policy.policy_ref);
    if(policy.semantics_understood !== true) return {understood:false,reason:'OPAQUE_POLICY_SEMANTICS_UNKNOWN',refs};
  }
  return {understood:true,refs};
}

function evaluateRightsCustody(evidenceInput, expected, options={}) {
  const evidence=clone(evidenceInput);
  validateEvidence(evidence);
  req(expected,['book_project_id','source_ref','source_digest','intended_use_scope'], 'expected');
  if(!nonEmpty(expected.book_project_id)||!nonEmpty(expected.source_ref)||!isSha(expected.source_digest)||!nonEmpty(expected.intended_use_scope)) fail('INVALID_EXPECTED_BINDING');
  if(Object.prototype.hasOwnProperty.call(evidence,'disposition')) fail('CALLER_DISPOSITION_FORBIDDEN');
  const now=parseTime(options.now || new Date().toISOString(),'now');
  const effective=parseTime(evidence.effective_at,'effective_at');
  const expiry=parseTime(evidence.expires_at,'expires_at');
  const revoked=parseTime(evidence.revoked_at,'revoked_at');
  const understood=policyUnderstanding(evidence.policy_expression, options.understood_policy || {});
  let disposition='UNKNOWN';
  let reason='UNCLASSIFIED';
  if(evidence.source_ref!==expected.source_ref || evidence.source_digest!==expected.source_digest) { disposition='REJECTED_FOR_SCOPE'; reason='SOURCE_IDENTITY_MISMATCH'; }
  else if(!evidence.intended_use_scopes.includes(expected.intended_use_scope)) { disposition='REJECTED_FOR_SCOPE'; reason='INTENDED_USE_MISMATCH'; }
  else if(evidence.conflict_refs.length>0) { disposition='CONFLICTING'; reason='CONFLICTING_EVIDENCE'; }
  else if(evidence.currentness==='REVOKED' || revoked!==null && revoked<=now) { disposition='REVOKED'; reason='EVIDENCE_REVOKED'; }
  else if(evidence.currentness==='EXPIRED' || expiry!==null && expiry<=now) { disposition='EXPIRED'; reason='EVIDENCE_EXPIRED'; }
  else if(evidence.currentness==='STALE') { disposition='STALE'; reason='EVIDENCE_STALE'; }
  else if(evidence.currentness==='UNKNOWN') { disposition='UNKNOWN'; reason='CURRENTNESS_UNKNOWN'; }
  else if(effective!==null && effective>now) { disposition='REVIEW_REQUIRED'; reason='NOT_YET_EFFECTIVE'; }
  else if(!understood.understood) { disposition='REVIEW_REQUIRED'; reason=understood.reason; }
  else { disposition='ACCEPTED_FOR_DECLARED_SCOPE'; reason='CURRENT_EVIDENCE_ACCEPTED'; }
  if(!DISPOSITIONS.has(disposition)) fail('INTERNAL_DISPOSITION_ERROR');
  const record={
    rights_record_id:`RIGHTS-${sha256({evidence_id:evidence.evidence_id,book_project_id:expected.book_project_id,source_ref:expected.source_ref,intended_use_scope:expected.intended_use_scope}).slice(0,28).toUpperCase()}`,
    record_version:1,
    book_project_id:expected.book_project_id,
    source_ref:expected.source_ref,
    source_digest:expected.source_digest,
    evidence_issuer_ref:evidence.evidence_issuer_ref,
    evidence_ref:evidence.evidence_ref,
    evidence_id:evidence.evidence_id,
    intended_use_scope:expected.intended_use_scope,
    policy_expression_refs:understood.refs,
    currentness:evidence.currentness,
    effective_at:evidence.effective_at,
    expires_at:evidence.expires_at,
    revoked_at:evidence.revoked_at,
    conflict_refs:clone(evidence.conflict_refs),
    disposition,
    disposition_reason:reason,
    validated_at:options.now || new Date(now).toISOString(),
  };
  record.record_digest=sha256(record);
  return record;
}

module.exports={BookRightsCustodyError,DISPOSITIONS,validateEvidence,evaluateRightsCustody,sha256};
