'use strict';

const core = require('./canonical-parent-v2-f6-core.js');

const SPECIALIST_SCHEMA_VERSION = 'BOOK_EXPORT_FREEZE_SPECIALIST_V2';
const SPECIALIST_RECEIPT_SCHEMA_VERSION = 'BOOK_EXPORT_FREEZE_SPECIALIST_RECEIPT_V1';
const SPECIALIST_KIND = 'EXPORT_FREEZE';
const FORMAT_IDENTITIES = new Set(['DOCX','PDF','EPUB','PRINT_PDF','OTHER_DECLARED']);

class BookExportFreezeV2RebindError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookExportFreezeV2RebindError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookExportFreezeV2RebindError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v,k) { return Object.prototype.hasOwnProperty.call(v,k); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function isSha(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }
function required(v, keys, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const key of keys) if (!own(v,key)) fail('REQUIRED_FIELD_MISSING', `${label}.${key}`);
}
function uniq(values) { return [...new Set((values || []).filter(nonEmpty).map(String))].sort(); }
function makeId(prefix, seed, n = 32) { return `${prefix}-${core.sha256(seed).slice(0,n).toUpperCase()}`; }

function createFreezeSpecialistState(parentInput) {
  const parent=clone(parentInput); core.validateParent(parent);
  const state={schema_version:SPECIALIST_SCHEMA_VERSION,book_project_id:parent.book_project.book_project_id,canonical_parent_state_version:parent.state_version,canonical_parent_state_digest:parent.state_digest,ledger_version:1,processed_requests:{},freeze_receipts:{}};
  validateFreezeSpecialistState(state,parent); return state;
}

function validateFreezeSpecialistState(stateInput,parentInput) {
  const state=clone(stateInput), parent=clone(parentInput);
  required(state,['schema_version','book_project_id','canonical_parent_state_version','canonical_parent_state_digest','ledger_version','processed_requests','freeze_receipts'],'export_freeze_state');
  if (state.schema_version!==SPECIALIST_SCHEMA_VERSION) fail('INVALID_SPECIALIST_SCHEMA_VERSION');
  core.validateParent(parent);
  if (state.book_project_id!==parent.book_project.book_project_id) fail('SPECIALIST_BOOK_PROJECT_MISMATCH');
  if (state.canonical_parent_state_version!==parent.state_version || state.canonical_parent_state_digest!==parent.state_digest) fail('SPECIALIST_PARENT_BINDING_MISMATCH');
  if (!Number.isInteger(state.ledger_version)||state.ledger_version<1||!obj(state.processed_requests)||!obj(state.freeze_receipts)) fail('INVALID_FREEZE_LEDGER');
  for (const [id,r] of Object.entries(state.freeze_receipts)) {
    required(r,['receipt_id','release_id','freeze_request_id','request_fingerprint','post_parent_state_version','post_parent_state_digest','publication_authority_state'],'freeze_receipt_record');
    if (id!==r.receipt_id || r.publication_authority_state!=='NOT_AUTHORIZED') fail('INVALID_FREEZE_RECEIPT_RECORD',id);
  }
  return true;
}

function exportFreezeIdentity(stateInput,parentInput) { validateFreezeSpecialistState(stateInput,parentInput); return core.sha256(stateInput); }

function activeManuscript(parent, identity) {
  required(identity,['manuscript_id','version_id','artifact_digest'],'canonical_manuscript_identity');
  const ref=parent.active.canonical_manuscript_ref;
  if (!nonEmpty(ref)) fail('ACTIVE_CANONICAL_MANUSCRIPT_MISSING');
  const record=(parent.governed_objects.manuscripts||[]).find(r=>`${r.object_id}:${String(r.version)}`===ref);
  if (!record) fail('ACTIVE_CANONICAL_MANUSCRIPT_MISSING');
  const digest=record.artifact_digest||record.object_digest;
  if (String(identity.manuscript_id)!==record.object_id||String(identity.version_id)!==String(record.version)) fail('CANONICAL_MANUSCRIPT_IDENTITY_MISMATCH');
  if (!isSha(digest)||identity.artifact_digest!==digest) fail('CANONICAL_MANUSCRIPT_DIGEST_MISMATCH');
  return {record,digest};
}

function validateAdmissions(parent,refs) {
  if (!Array.isArray(refs)) fail('PARENT_ADMISSION_REFS_REQUIRED');
  const seen=new Set();
  for (const ref of refs) {
    if (!nonEmpty(ref)||seen.has(ref)) fail('INVALID_OR_DUPLICATE_PARENT_ADMISSION_REF',String(ref)); seen.add(ref);
    const p=(parent.integration_proposals||[]).find(x=>x&&x.proposal_id===ref);
    if (!p||p.admission_state!=='ADMITTED') fail('PARENT_ADMISSION_NOT_ADMITTED',ref);
  }
}

function validateAuthorDecisions(parent,refs) {
  if (!Array.isArray(refs)) fail('AUTHOR_DECISION_REFS_REQUIRED');
  const seen=new Set();
  for (const ref of refs) {
    if (!nonEmpty(ref)||seen.has(ref)) fail('INVALID_OR_DUPLICATE_AUTHOR_DECISION_REF',String(ref)); seen.add(ref);
    const d=(parent.author_decisions||[]).find(x=>x&&x.decision_id===ref);
    if (!d||d.status!=='APPROVED') fail('AUTHOR_DECISION_NOT_CURRENT_APPROVED',ref);
  }
}

function validateEvidence(request,manuscript) {
  required(request.artifact_evidence,['artifact_ref','artifact_digest','artifact_currentness','format_identity','source_manuscript_id','source_version_id','source_digest','generator_or_toolchain_identity'],'artifact_evidence');
  required(request.target_medium_evidence,['target_medium_profile_id','target_medium_profile_version','technical_state','format_validation_result','source_to_render_integrity_result','accessibility_result','accessibility_rationale','proof_result','correction_ledger_ref','correction_ledger_state','rendered_candidate_digest'],'target_medium_evidence');
  required(request.rights_privacy_evidence,['rights_state','privacy_state','evidence_ref'],'rights_privacy_evidence');
  required(request.provenance_evidence,['currentness_state','validation_result','projection_ref','bound_artifact_digest'],'provenance_evidence');
  const a=request.artifact_evidence,t=request.target_medium_evidence,rp=request.rights_privacy_evidence,p=request.provenance_evidence;
  if (!nonEmpty(a.artifact_ref)||!isSha(a.artifact_digest)) fail('INVALID_EXPORT_ARTIFACT_IDENTITY');
  if (a.artifact_currentness!=='CURRENT_FOR_BOUND_SOURCE') fail('EXPORT_ARTIFACT_NOT_CURRENT');
  if (!FORMAT_IDENTITIES.has(a.format_identity)) fail('UNSUPPORTED_OR_UNDECLARED_FORMAT_IDENTITY');
  if (String(a.source_manuscript_id)!==manuscript.record.object_id||String(a.source_version_id)!==String(manuscript.record.version)||a.source_digest!==manuscript.digest) fail('EXPORT_SOURCE_MANUSCRIPT_MISMATCH');
  if (!nonEmpty(a.generator_or_toolchain_identity)) fail('INVALID_EXPORT_TOOLCHAIN_IDENTITY');
  if (!nonEmpty(t.target_medium_profile_id)||!nonEmpty(String(t.target_medium_profile_version))) fail('TARGET_MEDIUM_PROFILE_REQUIRED');
  if (t.technical_state!=='POST_LAYOUT_PROOF_COMPLETE') fail('POST_LAYOUT_PROOF_NOT_COMPLETE');
  if (t.format_validation_result!=='PASS') fail('FORMAT_VALIDATION_NOT_PASS');
  if (t.source_to_render_integrity_result!=='PASS') fail('SOURCE_TO_RENDER_INTEGRITY_NOT_PASS');
  if (t.proof_result!=='PASS') fail('POST_LAYOUT_PROOF_NOT_PASS');
  if (t.accessibility_result==='NOT_APPLICABLE_WITH_RATIONALE'&&!nonEmpty(t.accessibility_rationale)) fail('ACCESSIBILITY_NA_RATIONALE_REQUIRED');
  if (!['PASS','NOT_APPLICABLE_WITH_RATIONALE'].includes(t.accessibility_result)) fail('ACCESSIBILITY_NOT_ACCEPTABLE');
  if (!nonEmpty(t.correction_ledger_ref)||t.correction_ledger_state!=='CLOSED_CURRENT') fail('CORRECTION_LEDGER_NOT_CLOSED_CURRENT');
  if (!isSha(t.rendered_candidate_digest)||t.rendered_candidate_digest!==a.artifact_digest) fail('RENDERED_CANDIDATE_DIGEST_MISMATCH');
  if (rp.rights_state!=='CURRENT_AUTHORIZED'||rp.privacy_state!=='CURRENT_ALLOWED'||!nonEmpty(rp.evidence_ref)) fail('RIGHTS_PRIVACY_NOT_CURRENT_ALLOWED');
  if (!isSha(p.bound_artifact_digest)||p.bound_artifact_digest!==a.artifact_digest) fail('PROVENANCE_ARTIFACT_BINDING_MISMATCH');
  if (p.currentness_state==='NONE') {
    if (p.validation_result!=='NOT_APPLICABLE'||(p.projection_ref!==null&&p.projection_ref!=='')) fail('PROVENANCE_NONE_INVALID');
  } else if (p.currentness_state==='CURRENT_FOR_BOUND_SOURCE_AND_ARTIFACT') {
    if (p.validation_result!=='PASS'||!nonEmpty(p.projection_ref)) fail('PROVENANCE_NOT_CURRENT');
  } else fail('PROVENANCE_NOT_CURRENT');
}

function validateRequest(parent,state,request) {
  required(request,['freeze_request_id','idempotency_key','authority_ref','expected_parent_state_version','expected_parent_state_digest','expected_export_freeze_identity','release_id','release_group_ref','canonical_manuscript_identity','artifact_evidence','target_medium_evidence','rights_privacy_evidence','provenance_evidence','parent_admission_refs','author_decision_refs','created_at'],'freeze_request');
  if (!nonEmpty(request.freeze_request_id)||!nonEmpty(request.idempotency_key)||!nonEmpty(request.release_id)) fail('REQUEST_IDEMPOTENCY_REQUIRED');
  if (!nonEmpty(request.authority_ref)) fail('EXPORT_FREEZE_AUTHORITY_REF_REQUIRED');
  if (request.expected_parent_state_version!==parent.state_version||request.expected_parent_state_digest!==parent.state_digest) fail('STALE_PARENT_WRITE');
  const identity=exportFreezeIdentity(state,parent);
  if (request.expected_export_freeze_identity!==identity) fail('EXPORT_FREEZE_IDENTITY_MISMATCH');
  if (!nonEmpty(request.created_at)||Number.isNaN(Date.parse(request.created_at))) fail('INVALID_EFFECT_TIME');
  if (request.publication_authorized===true||request.publication_authority_state==='AUTHORIZED') fail('EXPORT_CANNOT_AUTHORIZE_PUBLICATION');
  if (!['REVISING','EXPORT_FROZEN'].includes(parent.book_project.status)) fail('EXPORT_FREEZE_REQUIRES_REVISING_OR_EXPORT_FROZEN');
  if ((parent.export_releases||[]).some(r=>r&&r.release_id===request.release_id)) fail('RELEASE_ID_CONFLICT',request.release_id);
  return identity;
}

function prepareExportFreezeRegistration({canonicalParent:parentInput,exportFreezeState:stateInput,request:requestInput}) {
  const parent=clone(parentInput),state=clone(stateInput),request=clone(requestInput); core.validateParent(parent);
  const preIdentity=validateRequest(parent,state,request),fingerprint=core.sha256(request);
  if (state.processed_requests[request.idempotency_key]) fail('ALREADY_COMMITTED_REQUIRES_RECEIPT_RECONCILIATION');
  const manuscript=activeManuscript(parent,request.canonical_manuscript_identity);
  validateEvidence(request,manuscript); validateAdmissions(parent,request.parent_admission_refs); validateAuthorDecisions(parent,request.author_decision_refs);
  const receiptId=makeId('BEFR',{freeze_request_id:request.freeze_request_id,idempotency_key:request.idempotency_key,fingerprint,preIdentity});
  const release={release_id:request.release_id,release_group_ref:request.release_group_ref,book_project_id:parent.book_project.book_project_id,frozen_version_id:String(manuscript.record.version),format:request.artifact_evidence.format_identity,digest:request.artifact_evidence.artifact_digest,approval_state:'FROZEN',publication_authority_state:'NOT_AUTHORIZED',publication_authorized:false,evidence_type:'EXPORT_FREEZE_READY',canonical_manuscript_id:manuscript.record.object_id,canonical_manuscript_version_id:String(manuscript.record.version),canonical_manuscript_digest:manuscript.digest,artifact_ref:request.artifact_evidence.artifact_ref,artifact_currentness:request.artifact_evidence.artifact_currentness,target_medium_profile_id:request.target_medium_evidence.target_medium_profile_id,target_medium_profile_version:String(request.target_medium_evidence.target_medium_profile_version),technical_state:request.target_medium_evidence.technical_state,format_validation_result:request.target_medium_evidence.format_validation_result,source_to_render_integrity_result:request.target_medium_evidence.source_to_render_integrity_result,accessibility_result:request.target_medium_evidence.accessibility_result,proof_result:request.target_medium_evidence.proof_result,correction_ledger_ref:request.target_medium_evidence.correction_ledger_ref,rights_privacy_evidence_ref:request.rights_privacy_evidence.evidence_ref,provenance_projection_ref:request.provenance_evidence.projection_ref,provenance_currentness_state:request.provenance_evidence.currentness_state,parent_admission_refs:clone(request.parent_admission_refs),author_decision_refs:clone(request.author_decision_refs),freeze_request_id:request.freeze_request_id,frozen_at:request.created_at};
  const payload={record:release};
  const effect={effect_schema_version:core.EFFECT_SCHEMA_VERSION,effect_request_id:`BEF-PARENT-${core.sha256({freeze_request_id:request.freeze_request_id,idempotency_key:request.idempotency_key}).slice(0,32).toUpperCase()}`,idempotency_key:`BEF:${request.idempotency_key}`,actor_class:'SYSTEM',authority_ref:request.authority_ref,expected_parent_state_version:parent.state_version,expected_parent_state_digest:parent.state_digest,effect_type:'REGISTER_EXPORT_RELEASE',effect_payload:payload,effect_payload_digest:core.effectPayloadDigest(payload),subject_identity_refs:uniq([`${manuscript.record.object_id}:${String(manuscript.record.version)}:${manuscript.digest}`,request.release_id]),evidence_refs:uniq([request.artifact_evidence.artifact_ref,request.rights_privacy_evidence.evidence_ref,request.provenance_evidence.projection_ref,...request.parent_admission_refs,...request.author_decision_refs]),specialist_receipt_refs:[receiptId],created_at:request.created_at,expected_specialist_ledger_identity:preIdentity};
  const anticipated=core.applyEffect(parent,effect).parent_state;
  if (anticipated.book_project.status!==parent.book_project.status||core.stable(anticipated.active)!==core.stable(parent.active)) fail('EXPORT_FREEZE_SCOPE_MUTATION_FORBIDDEN');
  const next=clone(state); next.canonical_parent_state_version=anticipated.state_version; next.canonical_parent_state_digest=anticipated.state_digest; next.ledger_version+=1;
  next.processed_requests[request.idempotency_key]={freeze_request_id:request.freeze_request_id,request_fingerprint:fingerprint,release_id:request.release_id,specialist_receipt_id:receiptId};
  next.freeze_receipts[receiptId]={receipt_id:receiptId,release_id:request.release_id,freeze_request_id:request.freeze_request_id,request_fingerprint:fingerprint,post_parent_state_version:anticipated.state_version,post_parent_state_digest:anticipated.state_digest,publication_authority_state:'NOT_AUTHORIZED'};
  validateFreezeSpecialistState(next,anticipated); const postIdentity=core.sha256(next);
  const specialistReceipt={receipt_schema_version:SPECIALIST_RECEIPT_SCHEMA_VERSION,receipt_id:receiptId,specialist_kind:SPECIALIST_KIND,book_project_id:parent.book_project.book_project_id,freeze_request_id:request.freeze_request_id,idempotency_key:request.idempotency_key,request_fingerprint:fingerprint,release_id:request.release_id,pre_export_freeze_identity:preIdentity,post_export_freeze_identity:postIdentity,pre_parent_state_version:parent.state_version,pre_parent_state_digest:parent.state_digest,post_parent_state_version:anticipated.state_version,post_parent_state_digest:anticipated.state_digest,publication_authority_state:'NOT_AUTHORIZED',disposition:'PREPARED_FOR_PARENT',created_at:request.created_at};
  specialistReceipt.receipt_digest=core.sha256(specialistReceipt);
  const delta={specialist_kind:SPECIALIST_KIND,book_project_id:parent.book_project.book_project_id,expected_export_freeze_identity:preIdentity,post_export_freeze_identity:postIdentity,post_state:next,specialist_receipt:specialistReceipt};
  delta.delta_digest=core.sha256({specialist_kind:delta.specialist_kind,book_project_id:delta.book_project_id,expected_export_freeze_identity:preIdentity,post_export_freeze_identity:postIdentity,specialist_receipt:specialistReceipt});
  return {disposition:'PREPARED_FOR_PARENT',parent_effect:effect,anticipated_parent_state:anticipated,specialist_delta:delta};
}

function validatePreparedExportFreezeDelta(deltaInput,preInput,postInput) {
  const delta=clone(deltaInput),pre=clone(preInput),post=clone(postInput);
  required(delta,['specialist_kind','book_project_id','expected_export_freeze_identity','post_export_freeze_identity','post_state','specialist_receipt','delta_digest'],'export_freeze_delta');
  if (delta.specialist_kind!==SPECIALIST_KIND) fail('SPECIALIST_KIND_MISMATCH');
  validateFreezeSpecialistState(delta.post_state,post);
  if (core.sha256(delta.post_state)!==delta.post_export_freeze_identity) fail('EXPORT_FREEZE_POST_IDENTITY_MISMATCH');
  const r=delta.specialist_receipt;
  if (r.publication_authority_state!=='NOT_AUTHORIZED') fail('EXPORT_CANNOT_AUTHORIZE_PUBLICATION');
  if (r.pre_parent_state_version!==pre.state_version||r.pre_parent_state_digest!==pre.state_digest||r.post_parent_state_version!==post.state_version||r.post_parent_state_digest!==post.state_digest) fail('SPECIALIST_RECEIPT_PARENT_BINDING_MISMATCH');
  const rc=clone(r),claimed=rc.receipt_digest; delete rc.receipt_digest; if (core.sha256(rc)!==claimed) fail('SPECIALIST_RECEIPT_DIGEST_MISMATCH');
  return true;
}

module.exports={SPECIALIST_SCHEMA_VERSION,SPECIALIST_RECEIPT_SCHEMA_VERSION,BookExportFreezeV2RebindError,createFreezeSpecialistState,validateFreezeSpecialistState,exportFreezeIdentity,prepareExportFreezeRegistration,validatePreparedExportFreezeDelta};
