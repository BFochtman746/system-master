'use strict';

const core = require('./canonical-parent-v2-f6-core.js');

const MIGRATION_SCHEMA_VERSION = 'BOOK_CANONICAL_PARENT_V1_V2_MIGRATION_V1';
const MIGRATION_RECEIPT_SCHEMA_VERSION = 'BOOK_CANONICAL_PARENT_V1_V2_MIGRATION_RECEIPT_V1';
const LEGACY_SCHEMA_VERSION = 1;
const LEGACY_STATUSES = new Set([
  'CREATED','BRIEFING','PLANNING','DRAFTING','STRUCTURAL_REVIEW','PROSE_REFINEMENT',
  'BOOK_EVALUATION','AUTHOR_REVIEW','FINALIZATION','EXPORT_FROZEN','PUBLISHED_OR_DELIVERED','ARCHIVED'
]);
const LEGACY_REQUIRED_TOP = [
  'schema_version','state_version','book_project','governing_briefs','canon_manifests','story_bibles',
  'book_plans','manuscripts','research_evidence_links','author_decisions','integration_proposals',
  'export_releases','active'
];
const LEGACY_ACTIVE_KEYS = [
  'governing_brief_ref','canon_manifest_ref','story_bible_ref','book_plan_ref','canonical_manuscript_ref'
];
const COLLECTION_SPECS = Object.freeze({
  governing_briefs: Object.freeze({ idField: 'brief_id', versionField: 'version' }),
  canon_manifests: Object.freeze({ idField: 'canon_manifest_id', versionField: 'version' }),
  story_bibles: Object.freeze({ idField: 'story_bible_id', versionField: 'version' }),
  book_plans: Object.freeze({ idField: 'plan_id', versionField: 'version' }),
  manuscripts: Object.freeze({ idField: 'manuscript_id', versionField: 'version_id' }),
});
const FORBIDDEN_CANONICAL_FIELD_PATTERNS = [
  /raw.*manuscript/i,/manuscript.*text/i,/raw.*research/i,/source.*bytes/i,
  /private.*content/i,/private.*payload/i,/evaluator.*text/i,/credential/i,/access.*token/i,/secret/i,
];

class BookCanonicalParentV1V2MigrationError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookCanonicalParentV1V2MigrationError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookCanonicalParentV1V2MigrationError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v,k) { return Object.prototype.hasOwnProperty.call(v,k); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function isSha(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }
function required(v, keys, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const key of keys) if (!own(v,key)) fail('REQUIRED_FIELD_MISSING', `${label}.${key}`);
}
function collectionMap(v,label) {
  if (!obj(v)) fail('LEGACY_COLLECTION_OBJECT_REQUIRED', label);
  return v;
}
function rejectCanonicalForbidden(value,path='$') {
  if (Array.isArray(value)) return value.forEach((x,i)=>rejectCanonicalForbidden(x,`${path}[${i}]`));
  if (!obj(value)) return;
  for (const [k,v] of Object.entries(value)) {
    if (FORBIDDEN_CANONICAL_FIELD_PATTERNS.some(r=>r.test(k))) fail('FORBIDDEN_PRIVATE_FIELD',`${path}.${k}`);
    rejectCanonicalForbidden(v,`${path}.${k}`);
  }
}
function legacySourceDigest(legacy) { return core.sha256(legacy); }
function mapVersion(record,spec) {
  const raw = record[spec.versionField];
  if (raw === null || raw === undefined || String(raw).trim() === '') fail('LEGACY_OBJECT_VERSION_REQUIRED', spec.versionField);
  return String(raw);
}
function targetRefForLegacyKey(key,record,spec) {
  const version=mapVersion(record,spec);
  // Preserve the legacy collection key as the target object id. This makes even
  // compound manuscript keys unambiguous and keeps the mapping reversible.
  return `${String(key)}:${version}`;
}
function validateLegacyGovernedCollection(legacy,name,spec) {
  const map=collectionMap(legacy[name],name);
  for (const [key,record] of Object.entries(map)) {
    if (!nonEmpty(key)||!obj(record)) fail('INVALID_LEGACY_GOVERNED_RECORD',`${name}.${key}`);
    if (!nonEmpty(String(record[spec.idField]||''))) fail('LEGACY_OBJECT_ID_REQUIRED',`${name}.${key}.${spec.idField}`);
    mapVersion(record,spec);
    if (name==='manuscripts') {
      if (!isSha(record.artifact_digest)) fail('LEGACY_MANUSCRIPT_DIGEST_INVALID',key);
      if (record.authority_state!=='CANONICAL') fail('LEGACY_ACTIVE_MANUSCRIPT_NOT_CANONICAL',key);
    }
  }
}
function validateLegacyParentV1(legacyInput) {
  const legacy=clone(legacyInput);
  required(legacy,LEGACY_REQUIRED_TOP,'legacy_parent_v1');
  if (legacy.schema_version!==LEGACY_SCHEMA_VERSION) fail('UNSUPPORTED_LEGACY_SCHEMA_VERSION',String(legacy.schema_version));
  if (!Number.isInteger(legacy.state_version)||legacy.state_version<1) fail('INVALID_LEGACY_STATE_VERSION');
  required(legacy.book_project,['book_project_id','book_id','status','governing_brief_ref','canonical_manifest_ref'],'legacy.book_project');
  if (!nonEmpty(legacy.book_project.book_project_id)||!nonEmpty(legacy.book_project.book_id)) fail('INVALID_LEGACY_BOOK_IDENTITY');
  if (!LEGACY_STATUSES.has(legacy.book_project.status)) fail('INVALID_LEGACY_PROJECT_STATUS',String(legacy.book_project.status));
  for (const [name,spec] of Object.entries(COLLECTION_SPECS)) validateLegacyGovernedCollection(legacy,name,spec);
  for (const name of ['research_evidence_links','author_decisions','integration_proposals','export_releases']) collectionMap(legacy[name],name);
  required(legacy.active,LEGACY_ACTIVE_KEYS,'legacy.active');
  const activeToCollection={governing_brief_ref:'governing_briefs',canon_manifest_ref:'canon_manifests',story_bible_ref:'story_bibles',book_plan_ref:'book_plans',canonical_manuscript_ref:'manuscripts'};
  for (const [activeKey,collection] of Object.entries(activeToCollection)) {
    const ref=legacy.active[activeKey];
    if (!nonEmpty(ref)||!own(legacy[collection],ref)) fail('LEGACY_ACTIVE_POINTER_TARGET_NOT_FOUND',`${activeKey}:${String(ref)}`);
  }
  if (legacy.book_project.governing_brief_ref!==legacy.active.governing_brief_ref) fail('LEGACY_BOOK_PROJECT_POINTER_MISMATCH','governing_brief_ref');
  if (legacy.book_project.canonical_manifest_ref!==legacy.active.canon_manifest_ref) fail('LEGACY_BOOK_PROJECT_POINTER_MISMATCH','canonical_manifest_ref');
  return true;
}

function governedProjection(legacy,name,bookProjectId) {
  const spec=COLLECTION_SPECS[name],out=[],mapping={};
  for (const [legacyKey,record] of Object.entries(legacy[name]).sort(([a],[b])=>a.localeCompare(b))) {
    const version=mapVersion(record,spec),sourceRecordDigest=core.sha256(record);
    const projected={object_id:String(legacyKey),version,book_project_id:bookProjectId,object_digest:sourceRecordDigest};
    if (name==='manuscripts') {
      projected.artifact_digest=record.artifact_digest;
      projected.authority_state='CANONICAL';
    } else if (nonEmpty(record.authority_state)) projected.authority_state=record.authority_state;
    out.push(projected);
    mapping[legacyKey]={legacy_key:legacyKey,legacy_object_id:String(record[spec.idField]),legacy_version:String(record[spec.versionField]),legacy_record_digest:sourceRecordDigest,v2_ref:`${projected.object_id}:${projected.version}`,v2_object_digest:projected.object_digest};
  }
  return {records:out,mapping};
}

function mapActive(legacy,mappings) {
  const active={style_profile_ref:null};
  const spec={governing_brief_ref:'governing_briefs',canon_manifest_ref:'canon_manifests',story_bible_ref:'story_bibles',book_plan_ref:'book_plans',canonical_manuscript_ref:'manuscripts'};
  for (const [activeKey,collection] of Object.entries(spec)) {
    const legacyRef=legacy.active[activeKey],entry=mappings[collection][legacyRef];
    if (!entry) fail('MIGRATION_ACTIVE_MAPPING_MISSING',`${activeKey}:${legacyRef}`);
    active[activeKey]=entry.v2_ref;
  }
  return active;
}

function mapResearchLinks(legacy) {
  const out=[];
  for (const [key,r] of Object.entries(legacy.research_evidence_links).sort(([a],[b])=>a.localeCompare(b))) {
    if (!obj(r)) fail('INVALID_LEGACY_RESEARCH_LINK',key);
    out.push({link_id:String(r.link_id||key),claim_or_evidence_ref:r.claim_or_evidence_ref||null,target_book_object_ref:r.target_book_object_ref||null,freshness_state:r.freshness_state||'UNKNOWN',conflict_state:r.conflict_state||'UNRESOLVED',provenance_refs:Array.isArray(r.provenance)?clone(r.provenance):[],rights_class:r.rights_class||'UNKNOWN',migration_source_record_digest:core.sha256(r)});
  }
  return out;
}
function mapAuthorDecisions(legacy) {
  const out=[];
  for (const [key,d] of Object.entries(legacy.author_decisions).sort(([a],[b])=>a.localeCompare(b))) {
    if (!obj(d)) fail('INVALID_LEGACY_AUTHOR_DECISION',key);
    const choice = own(d,'author_choice') ? d.author_choice : null;
    out.push({decision_id:String(d.decision_id||key),subject_ref:d.subject_ref||null,decision_type:d.decision_type||'LEGACY_UNSPECIFIED',status:d.status||'PENDING',author_choice_identity:choice===null?null:`LEGACY_CHOICE_DIGEST:${core.sha256(choice)}`,effective_version:d.effective_version||legacy.state_version,migration_source_record_digest:core.sha256(d),migration_authority_revalidation_required:true});
  }
  return out;
}
function mapIntegrationProposals(legacy) {
  const out=[];
  for (const [key,p] of Object.entries(legacy.integration_proposals).sort(([a],[b])=>a.localeCompare(b))) {
    if (!obj(p)) fail('INVALID_LEGACY_INTEGRATION_PROPOSAL',key);
    const source=String(p.source_project_or_lane||'LEGACY_UNKNOWN');
    out.push({proposal_id:String(p.proposal_id||key),source_project_or_lane:'SYSTEM_MASTER/BOOK',provenance_source_project_or_lane:source,source_subject_sha:p.source_subject_sha||null,capability_id:p.capability_id||null,admission_state:p.admission_state||'PROPOSED',publication_authorized:false,migration_source_record_digest:core.sha256(p),migration_authority_revalidation_required:true});
  }
  return out;
}
function mapExportReleases(legacy) {
  const out=[];
  for (const [key,r] of Object.entries(legacy.export_releases).sort(([a],[b])=>a.localeCompare(b))) {
    if (!obj(r)) fail('INVALID_LEGACY_EXPORT_RELEASE',key);
    out.push({release_id:String(r.release_id||key),frozen_version_id:r.frozen_version_id||null,format:r.format||'LEGACY_UNKNOWN',digest:isSha(r.digest)?r.digest:core.sha256(r),approval_state:r.approval_state||'LEGACY_UNVERIFIED',publication_authority_state:'NOT_AUTHORIZED',publication_authorized:false,legacy_publication_authority_state:r.publication_authority_state||null,migration_source_record_digest:core.sha256(r),publication_revalidation_required:true});
  }
  return out;
}

function migrationReceipt(input,legacy,parent,mappings) {
  const receipt={
    receipt_schema_version:MIGRATION_RECEIPT_SCHEMA_VERSION,
    migration_schema_version:MIGRATION_SCHEMA_VERSION,
    migration_id:`B00-F11-${core.sha256({source:legacySourceDigest(legacy),request_ref:input.migration_request_ref}).slice(0,32).toUpperCase()}`,
    migration_request_ref:input.migration_request_ref,
    book_project_id:legacy.book_project.book_project_id,
    legacy_schema_version:legacy.schema_version,
    legacy_state_version:legacy.state_version,
    legacy_state_digest:legacySourceDigest(legacy),
    legacy_snapshot_retained:true,
    governed_object_mapping:mappings,
    legacy_project_status:legacy.book_project.status,
    migrated_project_status:parent.book_project.status,
    lifecycle_projection:'IDENTITY_ONLY_NO_TRANSITION_EFFECT',
    v2_state_version:parent.state_version,
    v2_state_digest:parent.state_digest,
    rights_migration_state:'ABSENT_FAIL_CLOSED',
    style_migration_state:'ABSENT_NOT_INVENTED',
    publication_authority_state:'NOT_AUTHORIZED_REVALIDATION_REQUIRED',
    historical_pass_transferred:false,
    qualification_standing:'UNQUALIFIED_UNTIL_EXACT_SUBJECT_RUN',
    author_private_native_external_a01_evidence_synthesized:false,
    migrated_at:input.migrated_at,
  };
  receipt.receipt_digest=core.sha256(receipt);
  return receipt;
}

function migrateCanonicalParentV1ToV2(input) {
  required(input,['legacy_parent_v1','migration_request_ref','migrated_at'],'migration_input');
  if (!nonEmpty(input.migration_request_ref)) fail('MIGRATION_REQUEST_REF_REQUIRED');
  if (!nonEmpty(input.migrated_at)||Number.isNaN(Date.parse(input.migrated_at))) fail('MIGRATED_AT_INVALID');
  const legacy=clone(input.legacy_parent_v1);
  validateLegacyParentV1(legacy);
  const bookProjectId=legacy.book_project.book_project_id,mapped={},governed={};
  for (const name of Object.keys(COLLECTION_SPECS)) {
    const p=governedProjection(legacy,name,bookProjectId); governed[name]=p.records; mapped[name]=p.mapping;
  }
  const parent=core.sealParent({
    schema_version:core.SCHEMA_VERSION,
    state_version:legacy.state_version,
    state_digest:'0'.repeat(64),
    book_project:{book_project_id:bookProjectId,book_id:legacy.book_project.book_id,status:legacy.book_project.status},
    governed_objects:governed,
    research_evidence_links:mapResearchLinks(legacy),
    author_decisions:mapAuthorDecisions(legacy),
    integration_proposals:mapIntegrationProposals(legacy),
    rights_custody_records:[],
    style_profiles:[],
    export_releases:mapExportReleases(legacy),
    active:mapActive(legacy,mapped),
    authority_metadata:{
      owner:'SYSTEM_MASTER/BOOK',
      migration_schema_version:MIGRATION_SCHEMA_VERSION,
      migration_request_ref:input.migration_request_ref,
      legacy_schema_version:legacy.schema_version,
      legacy_state_version:legacy.state_version,
      legacy_state_digest:legacySourceDigest(legacy),
      migration_rights_state:'ABSENT_FAIL_CLOSED',
      migration_style_state:'ABSENT_NOT_INVENTED',
      migration_publication_state:'NOT_AUTHORIZED_REVALIDATION_REQUIRED',
      historical_pass_transferred:false,
      legacy_prose_authority_retired:true,
    },
    mutation_head:null,
  });
  rejectCanonicalForbidden(parent);
  core.validateParent(parent);
  const receipt=migrationReceipt(input,legacy,parent,mapped);
  return {migration_schema_version:MIGRATION_SCHEMA_VERSION,legacy_snapshot:legacy,legacy_snapshot_digest:legacySourceDigest(legacy),canonical_parent_v2:parent,migration_receipt:receipt};
}

function validateMigrationResult(resultInput) {
  const result=clone(resultInput);
  required(result,['migration_schema_version','legacy_snapshot','legacy_snapshot_digest','canonical_parent_v2','migration_receipt'],'migration_result');
  if (result.migration_schema_version!==MIGRATION_SCHEMA_VERSION) fail('MIGRATION_RESULT_SCHEMA_MISMATCH');
  validateLegacyParentV1(result.legacy_snapshot);
  if (legacySourceDigest(result.legacy_snapshot)!==result.legacy_snapshot_digest) fail('LEGACY_SNAPSHOT_DIGEST_MISMATCH');
  core.validateParent(result.canonical_parent_v2);
  const r=result.migration_receipt,copy=clone(r),claimed=copy.receipt_digest; delete copy.receipt_digest;
  if (core.sha256(copy)!==claimed) fail('MIGRATION_RECEIPT_DIGEST_MISMATCH');
  if (r.legacy_state_digest!==result.legacy_snapshot_digest||r.v2_state_digest!==result.canonical_parent_v2.state_digest||r.v2_state_version!==result.canonical_parent_v2.state_version) fail('MIGRATION_RECEIPT_STATE_BINDING_MISMATCH');
  if (r.historical_pass_transferred!==false||r.author_private_native_external_a01_evidence_synthesized!==false) fail('MIGRATION_EVIDENCE_PROMOTION_FORBIDDEN');
  if (result.canonical_parent_v2.rights_custody_records.length!==0||result.canonical_parent_v2.style_profiles.length!==0||result.canonical_parent_v2.active.style_profile_ref!==null) fail('MIGRATION_MUST_NOT_INVENT_RIGHTS_OR_STYLE');
  if (result.canonical_parent_v2.book_project.status!==result.legacy_snapshot.book_project.status) fail('MIGRATION_LIFECYCLE_STATUS_DRIFT');
  return true;
}

module.exports={MIGRATION_SCHEMA_VERSION,MIGRATION_RECEIPT_SCHEMA_VERSION,BookCanonicalParentV1V2MigrationError,validateLegacyParentV1,migrateCanonicalParentV1ToV2,validateMigrationResult};
