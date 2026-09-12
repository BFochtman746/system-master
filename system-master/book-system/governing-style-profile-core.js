'use strict';
const crypto=require('crypto');
class BookStyleProfileError extends Error{constructor(code,detail=''){super(detail?`${code}:${detail}`:code);this.name='BookStyleProfileError';this.code=code;this.detail=detail;}}
function fail(code,detail=''){throw new BookStyleProfileError(code,detail);}
function obj(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);} function nonEmpty(v){return typeof v==='string'&&v.trim().length>0;} function clone(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
function norm(v){if(Array.isArray(v))return v.map(norm);if(obj(v)){const o={};for(const k of Object.keys(v).sort())o[k]=norm(v[k]);return o;}return v;} function sha(v){return crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(norm(v))).digest('hex');}
function req(v,fs,l){if(!obj(v))fail('OBJECT_REQUIRED',l);for(const f of fs)if(!Object.prototype.hasOwnProperty.call(v,f))fail('REQUIRED_FIELD_MISSING',`${l}.${f}`);}
const STANDINGS=new Set(['DRAFT','CURRENT','SUPERSEDED','INVALIDATED']);
function governingInputDigest(input){req(input,['governing_brief_ref','canon_manifest_ref','protected_language_refs','author_decision_refs'],'governing_inputs'); if(!nonEmpty(input.governing_brief_ref)||!nonEmpty(input.canon_manifest_ref))fail('GOVERNING_REFERENCE_REQUIRED'); for(const k of ['protected_language_refs','author_decision_refs']){if(!Array.isArray(input[k])||input[k].some(x=>!nonEmpty(x)))fail('INVALID_GOVERNING_REFERENCE',k);} return sha(input);}
function createStyleProfile(spec, currentContext){
 req(spec,['profile_id','version','book_project_id','predecessor_profile_ref','language','locale','external_style_guide_refs','spelling_usage_terminology','protected_term_refs','exceptions','standing','creation_evidence_refs','governing_inputs'],'style_profile_spec');
 req(currentContext,['book_project_id','expected_predecessor_profile_ref','governing_inputs'],'current_context');
 if(!nonEmpty(spec.profile_id)||!nonEmpty(String(spec.version)))fail('INVALID_STYLE_PROFILE_IDENTITY');
 if(spec.book_project_id!==currentContext.book_project_id)fail('STYLE_PROFILE_BOOK_MISMATCH');
 if(spec.predecessor_profile_ref!==currentContext.expected_predecessor_profile_ref)fail('STYLE_PROFILE_PREDECESSOR_STALE');
 if(!STANDINGS.has(spec.standing))fail('INVALID_STYLE_PROFILE_STANDING');
 if(!['DRAFT','CURRENT'].includes(spec.standing))fail('NEW_STYLE_PROFILE_STANDING_NOT_ADMISSIBLE');
 const expectedDigest=governingInputDigest(currentContext.governing_inputs); const suppliedDigest=governingInputDigest(spec.governing_inputs); if(expectedDigest!==suppliedDigest)fail('STYLE_PROFILE_GOVERNING_INPUTS_STALE');
 if(!nonEmpty(spec.language)||!nonEmpty(spec.locale))fail('STYLE_PROFILE_LANGUAGE_LOCALE_REQUIRED');
 for(const k of ['external_style_guide_refs','protected_term_refs','exceptions','creation_evidence_refs']) if(!Array.isArray(spec[k]))fail('STYLE_PROFILE_ARRAY_REQUIRED',k);
 if(!obj(spec.spelling_usage_terminology))fail('STYLE_PROFILE_TERMINOLOGY_OBJECT_REQUIRED');
 const p={profile_id:spec.profile_id,object_id:spec.profile_id,version:String(spec.version),book_project_id:spec.book_project_id,predecessor_profile_ref:spec.predecessor_profile_ref,language:spec.language,locale:spec.locale,external_style_guide_refs:clone(spec.external_style_guide_refs),spelling_usage_terminology:clone(spec.spelling_usage_terminology),protected_term_refs:clone(spec.protected_term_refs),exceptions:clone(spec.exceptions),standing:spec.standing,invalidation_input_digest:expectedDigest,creation_evidence_refs:clone(spec.creation_evidence_refs)};
 p.profile_digest=sha(p); return p;
}
function assessCurrentness(profile,currentContext){req(profile,['profile_id','version','book_project_id','standing','invalidation_input_digest','profile_digest'],'profile');req(currentContext,['book_project_id','governing_inputs'],'current_context');if(profile.book_project_id!==currentContext.book_project_id)return {current:false,reason:'BOOK_MISMATCH'}; if(profile.standing!=='CURRENT')return {current:false,reason:`STANDING_${profile.standing}`}; const d=governingInputDigest(currentContext.governing_inputs); if(d!==profile.invalidation_input_digest)return {current:false,reason:'GOVERNING_INPUTS_CHANGED'}; const c=clone(profile);delete c.profile_digest;if(sha(c)!==profile.profile_digest)return {current:false,reason:'PROFILE_DIGEST_MISMATCH'};return {current:true,reason:'CURRENT'};}
function projectForProvider(profile,currentContext){const status=assessCurrentness(profile,currentContext);if(!status.current)fail('STYLE_PROFILE_NOT_CURRENT',status.reason);const p=Object.freeze({profile_ref:`${profile.profile_id}:${profile.version}`,profile_digest:profile.profile_digest,language:profile.language,locale:profile.locale,external_style_guide_refs:Object.freeze(clone(profile.external_style_guide_refs)),spelling_usage_terminology:Object.freeze(clone(profile.spelling_usage_terminology)),protected_term_refs:Object.freeze(clone(profile.protected_term_refs)),exceptions:Object.freeze(clone(profile.exceptions)),canonical_effect_allowed:false,parent_mutation_allowed:false});return p;}
module.exports={BookStyleProfileError,STANDINGS,governingInputDigest,createStyleProfile,assessCurrentness,projectForProvider,sha256:sha};
