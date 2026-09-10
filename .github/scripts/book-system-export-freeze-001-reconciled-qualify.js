'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || workspace, 'book-export-freeze-reconciled-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const files = {
  contract: 'qualification/book-system/export-freeze-001/BOOK-SYSTEM-EXPORT-FREEZE-001.json',
  forensic: 'qualification/book-system/export-freeze-001/BOOK-SYSTEM-EXPORT-FREEZE-FORENSIC-MAP-001.json',
  reconciliation: 'qualification/book-system/export-freeze-001/BOOK-SYSTEM-EXPORT-FREEZE-PARALLEL-CANDIDATE-RECONCILIATION-001.json',
  fixtures: 'qualification/book-system/export-freeze-001/BOOK-SYSTEM-EXPORT-FREEZE-001-RECONCILED-FIXTURES.json',
  compatibilityClosure: 'qualification/book-system/lifecycle-transition-compatibility-001/BOOK-SYSTEM-LIFECYCLE-CURRENT-PARENT-COMPATIBILITY-ADAPTER-001-CLOSURE.json',
  lifecycleContract: 'qualification/book-system/lifecycle-transition-001/BOOK-SYSTEM-LIFECYCLE-TRANSITION-ENGINE-001.json',
  runtime: 'system-master/book-system/export-freeze.js',
  core: 'system-master/book-system/export-freeze-core.js',
  versionRuntime: 'system-master/book-system/version-and-rollback.js',
  compatibilityAdapter: 'system-master/book-system/lifecycle-current-parent-compatibility-adapter.js',
  lifecycleCore: 'system-master/book-system/lifecycle-transition-engine.js',
  lifecycleRuntime: 'system-master/book-system/lifecycle-transition-engine-runtime.js',
  qualifier: '.github/scripts/book-system-export-freeze-001-reconciled-qualify.js',
};

function readJson(p) { return JSON.parse(fs.readFileSync(path.join(workspace, p), 'utf8')); }
const contract = readJson(files.contract);
const forensic = readJson(files.forensic);
const reconciliation = readJson(files.reconciliation);
const fixtures = readJson(files.fixtures);
const compatibilityClosure = readJson(files.compatibilityClosure);
const lifecycleContract = readJson(files.lifecycleContract);
const ef = require(path.join(workspace, files.runtime));
const vr = require(path.join(workspace, files.versionRuntime));
const adapter = require(path.join(workspace, files.compatibilityAdapter));

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function stable(v) { return ef.stable(v); }
function assert(ok, code, detail = '') { if (!ok) { const e = new Error(detail ? `${code}:${detail}` : code); e.code = code; throw e; } }
function expectError(fn, code) {
  try { fn(); } catch (e) { assert(e && e.code === code, 'WRONG_ERROR_CODE', `expected=${code}:actual=${e && e.code}:detail=${e && e.message}`); return e; }
  assert(false, 'EXPECTED_ERROR_NOT_THROWN', code);
}
function git(args) { return spawnSync('git', ['-c', `safe.directory=${workspace}`, ...args], { cwd: workspace, encoding: 'utf8', shell: false, windowsHide: true }); }
function gitHead() { const r=git(['rev-parse','HEAD']); assert(r.status===0,'GIT_HEAD_FAILED'); return r.stdout.trim(); }
function gitBlobSha(p) { const r=git(['rev-parse',`HEAD:${p}`]); assert(r.status===0,'GIT_BLOB_FAILED',p); return r.stdout.trim(); }
function fileSha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(workspace,p))).digest('hex'); }
function write(name, value) { fs.writeFileSync(path.join(evidenceDir,name),JSON.stringify(value,null,2),'utf8'); }

function sealedParent(patch=null) { const p=clone(fixtures.base_parent_state); if (patch) patch(p); return vr.sealState(p); }
function setup(patch=null) {
  const parent=sealedParent(patch);
  const freezeLedger=ef.createFreezeLedger(parent);
  return {parent,freezeLedger};
}
function request(s, overrides={}) {
  const r=clone(fixtures.base_request);
  r.expected_parent_state_version=s.parent.state_version;
  r.expected_parent_state_digest=s.parent.state_digest;
  r.expected_freeze_ledger_version=s.freezeLedger.ledger_version;
  r.expected_freeze_ledger_digest=ef.digestFreezeLedger(s.freezeLedger);
  return deepMerge(r, overrides);
}
function deepMerge(base, patch) {
  const out=clone(base);
  for (const [k,v] of Object.entries(patch||{})) {
    if (v && typeof v==='object' && !Array.isArray(v) && out[k] && typeof out[k]==='object' && !Array.isArray(out[k])) out[k]=deepMerge(out[k],v);
    else out[k]=clone(v);
  }
  return out;
}
function freeze(s, overrides={}) {
  const r=request(s,overrides);
  const out=ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:r});
  return {...s,request:r,parent:out.parent_state,freezeLedger:out.freeze_ledger,freezeOut:out};
}
function currentBindings(versionLedger) { return clone(versionLedger.state_snapshots[versionLedger.current_snapshot_id].active_version_bindings); }
function recordRelease(preParent, versionLedger, freezeOut, id='VR-EXPORT-001') {
  return vr.recordAuthorizedParentSuccessor({
    parentState:preParent,
    versionLedger,
    request:{
      request_id:id,idempotency_key:`${id}-IDEM`,actor_class:'PARENT_SYSTEM',
      expected_state_version:preParent.state_version,expected_state_digest:preParent.state_digest,
      expected_ledger_version:versionLedger.ledger_version,expected_ledger_digest:vr.digestLedger(versionLedger),
      authority_kind:'EXPORT_RELEASE',authority_receipt:freezeOut.release_receipt,
      committed_parent_state:freezeOut.parent_state,active_version_bindings:currentBindings(versionLedger),
    }
  });
}
function lifecycleFreeze(parent, lifecycleLedger, releaseId='RELEASE-PDF-001') {
  const req={
    transition_request_id:'LIFECYCLE-FREEZE-001',idempotency_key:'LIFECYCLE-FREEZE-IDEM-001',actor_class:'PARENT_SYSTEM',
    scope:'PROJECT',target_ref:parent.book_project.book_project_id,target_status:'EXPORT_FROZEN',
    expected_parent_state_version:parent.state_version,expected_parent_state_digest:parent.state_digest,
    expected_ledger_version:lifecycleLedger.ledger_version,expected_ledger_digest:adapter.digestCompatibleLedger(lifecycleLedger),
    evidence_refs:[releaseId],author_decision_refs:[],integration_proposal_refs:[],cause_refs:[],
  };
  return adapter.applyTransition(lifecycleContract,parent,lifecycleLedger,req);
}
function fullChain() {
  const s=setup();
  const v0=vr.createVersionLedger(s.parent);
  const pre=clone(s.parent);
  const f=freeze(s);
  const releaseRecorded=recordRelease(pre,v0.version_ledger,f.freezeOut);
  const lifeLedger=adapter.createCompatibleLedger(lifecycleContract,releaseRecorded.parent_state,{unit_states:{},dependency_edges:[]});
  const life=lifecycleFreeze(releaseRecorded.parent_state,lifeLedger);
  const lifecycleRecorded=vr.recordAuthorizedParentSuccessor({
    parentState:releaseRecorded.parent_state,
    versionLedger:releaseRecorded.version_ledger,
    request:{
      request_id:'VR-LIFECYCLE-001',idempotency_key:'VR-LIFECYCLE-IDEM-001',actor_class:'PARENT_SYSTEM',
      expected_state_version:releaseRecorded.parent_state.state_version,expected_state_digest:releaseRecorded.parent_state.state_digest,
      expected_ledger_version:releaseRecorded.version_ledger.ledger_version,expected_ledger_digest:vr.digestLedger(releaseRecorded.version_ledger),
      authority_kind:'LIFECYCLE_TRANSITION',authority_receipt:life.receipt,
      committed_parent_state:life.parent_state,active_version_bindings:currentBindings(releaseRecorded.version_ledger),
    }
  });
  return {initial:pre,freeze:f.freezeOut,releaseRecorded,life,lifecycleRecorded};
}
function oldRelease(id='RELEASE-OLD-001') {
  return {release_id:id,frozen_version_id:'V1',format:'PDF',digest:'d'.repeat(64),approval_state:'FROZEN',publication_authority_state:'NOT_AUTHORIZED',evidence_type:'HISTORICAL_EXPORT_FREEZE_READY'};
}

const tests={}; function test(id,fn){tests[id]=fn;}

test('EF001_CURRENT_PARENT_VALID',()=>{const s=setup(); assert(vr.validateParentState(s.parent)===true,'PARENT_INVALID');});
test('EF002_FREEZE_LEDGER_BINDS_CURRENT_PARENT',()=>{const s=setup(); assert(s.freezeLedger.bound_parent_state_digest===s.parent.state_digest&&s.freezeLedger.bound_parent_state_version===s.parent.state_version,'LEDGER_BIND_FAIL');});
test('EF003_POSITIVE_FREEZE_COMMITS_ONE_RELEASE',()=>{const s=setup();const out=freeze(s);assert(out.freezeOut.disposition==='COMMITTED'&&out.parent.export_releases.length===1,'FREEZE_COMMIT_FAIL');});
test('EF004_NON_PARENT_ACTOR_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{actor_class:'DOCUMENT_SYSTEM'})}),'EXPORT_FREEZE_AUTHORITY_DENIED');});
test('EF005_STALE_PARENT_VERSION_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{expected_parent_state_version:999})}),'STALE_PARENT_WRITE');});
test('EF006_STALE_PARENT_DIGEST_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{expected_parent_state_digest:'0'.repeat(64)})}),'STALE_PARENT_WRITE');});
test('EF007_STALE_FREEZE_LEDGER_VERSION_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{expected_freeze_ledger_version:999})}),'STALE_FREEZE_LEDGER_WRITE');});
test('EF008_STALE_FREEZE_LEDGER_DIGEST_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{expected_freeze_ledger_digest:'0'.repeat(64)})}),'STALE_FREEZE_LEDGER_WRITE');});
test('EF009_NON_FINALIZATION_REJECTED',()=>{const s=setup(p=>p.book_project.status='AUTHOR_REVIEW');expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s)}),'EXPORT_FREEZE_REQUIRES_FINALIZATION');});
test('EF010_RELEASE_ID_CONFLICT_REJECTED',()=>{const s=setup(p=>p.export_releases.push(oldRelease('RELEASE-PDF-001')));expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s)}),'RELEASE_ID_CONFLICT');});
test('EF011_CANONICAL_MANUSCRIPT_ID_MISMATCH_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{canonical_manuscript_identity:{manuscript_id:'OTHER'}})}),'CANONICAL_MANUSCRIPT_IDENTITY_MISMATCH');});
test('EF012_CANONICAL_MANUSCRIPT_VERSION_MISMATCH_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{canonical_manuscript_identity:{version_id:'V2'}})}),'CANONICAL_MANUSCRIPT_IDENTITY_MISMATCH');});
test('EF013_CANONICAL_MANUSCRIPT_DIGEST_MISMATCH_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{canonical_manuscript_identity:{artifact_digest:'b'.repeat(64)}})}),'CANONICAL_MANUSCRIPT_DIGEST_MISMATCH');});
test('EF014_INVALID_ARTIFACT_DIGEST_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{artifact_evidence:{artifact_digest:'bad'}})}),'INVALID_EXPORT_ARTIFACT_IDENTITY');});
test('EF015_STALE_ARTIFACT_CURRENTNESS_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{artifact_evidence:{artifact_currentness:'STALE'}})}),'EXPORT_ARTIFACT_NOT_CURRENT');});
test('EF016_UNDECLARED_FORMAT_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{artifact_evidence:{format_identity:'UNKNOWN'}})}),'UNSUPPORTED_OR_UNDECLARED_FORMAT_IDENTITY');});
test('EF017_SOURCE_MANUSCRIPT_ID_MISMATCH_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{artifact_evidence:{source_manuscript_id:'OTHER'}})}),'EXPORT_SOURCE_MANUSCRIPT_MISMATCH');});
test('EF018_SOURCE_VERSION_MISMATCH_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{artifact_evidence:{source_version_id:'V2'}})}),'EXPORT_SOURCE_MANUSCRIPT_MISMATCH');});
test('EF019_SOURCE_DIGEST_MISMATCH_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{artifact_evidence:{source_digest:'b'.repeat(64)}})}),'EXPORT_SOURCE_MANUSCRIPT_MISMATCH');});
test('EF020_MISSING_TOOLCHAIN_IDENTITY_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{artifact_evidence:{generator_or_toolchain_identity:''}})}),'INVALID_EXPORT_SOURCE_OR_TOOLCHAIN_IDENTITY');});
test('EF021_MISSING_TARGET_PROFILE_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{target_medium_evidence:{target_medium_profile_id:''}})}),'TARGET_MEDIUM_PROFILE_REQUIRED');});
test('EF022_TECHNICAL_STATE_NOT_PROOF_COMPLETE_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{target_medium_evidence:{technical_state:'FORMAT_VALIDATED'}})}),'POST_LAYOUT_PROOF_NOT_COMPLETE');});
test('EF023_FORMAT_VALIDATION_FAILURE_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{target_medium_evidence:{format_validation_result:'FAIL'}})}),'FORMAT_VALIDATION_NOT_PASS');});
test('EF024_SOURCE_RENDER_FAILURE_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{target_medium_evidence:{source_to_render_integrity_result:'FAIL'}})}),'SOURCE_TO_RENDER_INTEGRITY_NOT_PASS');});
test('EF025_PROOF_FAILURE_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{target_medium_evidence:{proof_result:'FAIL'}})}),'POST_LAYOUT_PROOF_NOT_PASS');});
test('EF026_ACCESSIBILITY_UNKNOWN_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{target_medium_evidence:{accessibility_result:'UNKNOWN'}})}),'ACCESSIBILITY_NOT_ACCEPTABLE');});
test('EF027_ACCESSIBILITY_NA_WITHOUT_RATIONALE_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{target_medium_evidence:{accessibility_result:'NOT_APPLICABLE_WITH_RATIONALE',accessibility_rationale:''}})}),'ACCESSIBILITY_NA_RATIONALE_REQUIRED');});
test('EF028_ACCESSIBILITY_NA_WITH_RATIONALE_ACCEPTED',()=>{const s=setup();const out=freeze(s,{target_medium_evidence:{accessibility_result:'NOT_APPLICABLE_WITH_RATIONALE',accessibility_rationale:'Selected print-only profile has no digital accessibility conformance claim.'}});assert(out.freezeOut.release.accessibility_result==='NOT_APPLICABLE_WITH_RATIONALE','ACCESSIBILITY_NA_NOT_PRESERVED');});
test('EF029_OPEN_CORRECTION_LEDGER_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{target_medium_evidence:{correction_ledger_state:'OPEN'}})}),'CORRECTION_LEDGER_NOT_CLOSED_CURRENT');});
test('EF030_RENDERED_DIGEST_MISMATCH_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{target_medium_evidence:{rendered_candidate_digest:'e'.repeat(64)}})}),'RENDERED_CANDIDATE_DIGEST_MISMATCH');});
test('EF031_RIGHTS_NOT_AUTHORIZED_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{rights_privacy_evidence:{rights_state:'UNKNOWN'}})}),'RIGHTS_NOT_CURRENT_AUTHORIZED');});
test('EF032_PRIVACY_NOT_ALLOWED_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{rights_privacy_evidence:{privacy_state:'UNKNOWN'}})}),'PRIVACY_NOT_CURRENT_ALLOWED');});
test('EF033_MISSING_RIGHTS_PRIVACY_EVIDENCE_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{rights_privacy_evidence:{evidence_ref:''}})}),'RIGHTS_PRIVACY_EVIDENCE_REF_REQUIRED');});
test('EF034_STALE_PROVENANCE_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{provenance_evidence:{currentness_state:'SUPERSEDED_FOR_CURRENT_RELEASE'}})}),'PROVENANCE_NOT_CURRENT');});
test('EF035_PROVENANCE_VALIDATION_FAILURE_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{provenance_evidence:{validation_result:'FAIL'}})}),'PROVENANCE_VALIDATION_NOT_PASS');});
test('EF036_PROVENANCE_DIGEST_MISMATCH_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{provenance_evidence:{bound_artifact_digest:'e'.repeat(64)}})}),'PROVENANCE_ARTIFACT_BINDING_MISMATCH');});
test('EF037_PROVENANCE_NONE_MUST_BE_NA',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{provenance_evidence:{currentness_state:'NONE',validation_result:'PASS',projection_ref:null}})}),'PROVENANCE_NONE_VALIDATION_MUST_BE_NA');});
test('EF038_PROVENANCE_NONE_REF_FORBIDDEN',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{provenance_evidence:{currentness_state:'NONE',validation_result:'NOT_APPLICABLE',projection_ref:'SHOULD-NOT-EXIST'}})}),'PROVENANCE_NONE_PROJECTION_REF_FORBIDDEN');});
test('EF039_CURRENT_PROVENANCE_REF_REQUIRED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{provenance_evidence:{projection_ref:''}})}),'PROVENANCE_PROJECTION_REF_REQUIRED');});
test('EF040_PARENT_ADMISSION_NOT_FOUND_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{parent_admission_refs:['NOPE']})}),'PARENT_ADMISSION_REF_NOT_FOUND');});
test('EF041_PARENT_ADMISSION_NOT_ADMITTED_REJECTED',()=>{const s=setup(p=>p.integration_proposals[0].admission_state='PARENT_PREQUALIFIED');expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s)}),'PARENT_ADMISSION_NOT_ADMITTED');});
test('EF042_DUPLICATE_PARENT_ADMISSION_REF_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{parent_admission_refs:['PROPOSAL-DOCUMENT-001','PROPOSAL-DOCUMENT-001']})}),'INVALID_OR_DUPLICATE_PARENT_ADMISSION_REF');});
test('EF043_AUTHOR_DECISION_NOT_FOUND_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{author_decision_refs:['NOPE']})}),'AUTHOR_DECISION_REF_NOT_FOUND');});
test('EF044_AUTHOR_DECISION_NON_AFFIRMATIVE_REJECTED',()=>{const s=setup(p=>{p.author_decisions[0].status='REJECTED';p.author_decisions[0].author_choice='REJECT';});expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s)}),'AUTHOR_DECISION_NOT_AFFIRMATIVE_CURRENT');});
test('EF045_DUPLICATE_AUTHOR_DECISION_REF_REJECTED',()=>{const s=setup();expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{author_decision_refs:['DECISION-FREEZE-001','DECISION-FREEZE-001']})}),'INVALID_OR_DUPLICATE_AUTHOR_DECISION_REF');});
test('EF046_RELEASE_FIXED_AUTHORITY_VALUES',()=>{const s=setup();const out=freeze(s);const r=out.freezeOut.release;assert(r.approval_state==='FROZEN'&&r.publication_authority_state==='NOT_AUTHORIZED'&&r.evidence_type==='EXPORT_FREEZE_READY','FIXED_RELEASE_VALUES_FAIL');});
test('EF047_FREEZE_STATUS_AND_ACTIVE_POINTERS_UNCHANGED',()=>{const s=setup();const before=clone({status:s.parent.book_project.status,active:s.parent.active});const out=freeze(s);assert(out.parent.book_project.status===before.status&&stable(out.parent.active)===stable(before.active),'FREEZE_MUTATED_LIFECYCLE_OR_ACTIVE');});
test('EF048_APPEND_ONLY_PRIOR_RELEASE_PRESERVED',()=>{const old=oldRelease();const s=setup(p=>p.export_releases.push(old));const out=freeze(s,{release_id:'RELEASE-PDF-002',freeze_request_id:'FREEZE-REQ-002',idempotency_key:'FREEZE-IDEM-002'});assert(out.parent.export_releases.length===2&&stable(out.parent.export_releases[0])===stable(old),'OLD_RELEASE_MUTATED');});
test('EF049_IDEMPOTENT_REPLAY_NO_SECOND_RELEASE',()=>{const s=setup();const r=request(s);const first=ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:r});const replay=ef.freezeExport({parentState:first.parent_state,freezeLedger:first.freeze_ledger,request:r});assert(replay.disposition==='REPLAY'&&replay.parent_state.export_releases.length===1&&replay.release_receipt.release_receipt_id===first.release_receipt.release_receipt_id,'REPLAY_FAIL');});
test('EF050_IDEMPOTENCY_KEY_CONFLICT_REJECTED',()=>{const s=setup();const r=request(s);const first=ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:r});expectError(()=>ef.freezeExport({parentState:first.parent_state,freezeLedger:first.freeze_ledger,request:{...r,release_id:'OTHER'}}),'IDEMPOTENCY_KEY_CONFLICT');});
test('EF051_REQUEST_ID_CONFLICT_REJECTED',()=>{const s=setup();const r=request(s);const first=ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:r});const r2=request({parent:first.parent_state,freezeLedger:first.freeze_ledger},{freeze_request_id:r.freeze_request_id,idempotency_key:'OTHER-IDEM',release_id:'OTHER-REL'});expectError(()=>ef.freezeExport({parentState:first.parent_state,freezeLedger:first.freeze_ledger,request:r2}),'REQUEST_ID_CONFLICT');});
test('EF052_VERSION_ROLLBACK_ACCEPTS_EXPORT_RELEASE_RECEIPT',()=>{const s=setup();const v=vr.createVersionLedger(s.parent);const pre=clone(s.parent);const f=freeze(s);const rec=recordRelease(pre,v.version_ledger,f.freezeOut);assert(rec.parent_state.state_digest===f.parent.state_digest&&rec.receipt.authority_kind==='EXPORT_RELEASE','VR_RELEASE_INGEST_FAIL');});
test('EF053_LIFECYCLE_ADAPTER_ACCEPTS_EXPORT_FREEZE_READY_RELEASE',()=>{const chain=fullChain();assert(chain.life.parent_state.book_project.status==='EXPORT_FROZEN'&&chain.life.receipt.to_status==='EXPORT_FROZEN','LIFECYCLE_FREEZE_FAIL');});
test('EF054_VERSION_ROLLBACK_ACCEPTS_LIFECYCLE_RECEIPT',()=>{const chain=fullChain();assert(chain.lifecycleRecorded.parent_state.state_digest===chain.life.parent_state.state_digest&&chain.lifecycleRecorded.receipt.authority_kind==='LIFECYCLE_TRANSITION','VR_LIFECYCLE_INGEST_FAIL');});
test('EF055_FULL_CHAIN_PUBLICATION_REMAINS_UNAUTHORIZED',()=>{const chain=fullChain();const rel=chain.lifecycleRecorded.parent_state.export_releases.find(r=>r.release_id==='RELEASE-PDF-001');assert(rel.publication_authority_state==='NOT_AUTHORIZED'&&chain.lifecycleRecorded.parent_state.book_project.status==='EXPORT_FROZEN','PUBLICATION_AUTHORITY_LEAK');});
test('EF056_FULL_CHAIN_EXACT_STATE_VERSION_SEQUENCE',()=>{const chain=fullChain();assert(chain.freeze.parent_state.state_version===chain.initial.state_version+1&&chain.life.parent_state.state_version===chain.initial.state_version+2&&chain.lifecycleRecorded.parent_state.state_version===chain.initial.state_version+2,'STATE_VERSION_SEQUENCE_FAIL');});
test('EF057_FAILED_FREEZE_INPUTS_UNCHANGED',()=>{const s=setup();const p=stable(s.parent),l=stable(s.freezeLedger);expectError(()=>ef.freezeExport({parentState:s.parent,freezeLedger:s.freezeLedger,request:request(s,{actor_class:'PROSE_SYSTEM'})}),'EXPORT_FREEZE_AUTHORITY_DENIED');assert(stable(s.parent)===p&&stable(s.freezeLedger)===l,'FAILED_FREEZE_MUTATED_INPUT');});
test('EF058_PUBLIC_SURFACE_HAS_NO_DOCUMENT_OR_PUBLICATION_MUTATOR',()=>{const keys=Object.keys(ef);for(const k of ['renderPdf','renderDocx','renderEpub','generateDocument','authorizePublication','publish','advanceProjectStatus','setCanonicalManuscript'])assert(!keys.includes(k),'FORBIDDEN_PUBLIC_MUTATOR',k);});
test('EF059_LIFECYCLE_V1_BYTES_REMAIN_UNCHANGED',()=>{assert(gitBlobSha(files.lifecycleCore)==='26d36d2186c6e88fcab1acb3c9626b2d2d9e11db','LIFECYCLE_CORE_CHANGED');assert(gitBlobSha(files.lifecycleRuntime)==='dbaaf79479f400f7097cb5328cd5edae5e59696d','LIFECYCLE_RUNTIME_CHANGED');});
test('EF060_COMPATIBILITY_A01_CLOSURE_REQUIRED',()=>{assert(compatibilityClosure.standing==='CLOSED__HOSTED_AND_AUTHORITATIVE_A01_PASS__EXACT_SHA_SCOPED'&&compatibilityClosure.qualified_subject_sha==='fc5adf8fd130d7b5324cff0058ab3804d75ec54e','COMPATIBILITY_A01_CLOSURE_NOT_BOUND');});

assert(contract.standing.includes('CANONICAL_PARENT_EXPORT_FREEZE_CONTRACT'),'EXPORT_FREEZE_CONTRACT_NOT_CANONICAL');
assert(forensic.standing.includes('REUSE_MAP_COMPLETE'),'FORENSIC_MAP_NOT_CLOSED');
assert(reconciliation.standing.includes('PARALLEL_70_OF_70_WORK_PRESERVED'),'PARALLEL_CANDIDATE_RECONCILIATION_MISSING');
assert(fixtures.cases.length===60,'FIXTURE_CASE_COUNT_MISMATCH');
assert(Object.keys(tests).length===60&&fixtures.cases.every(id=>tests[id]),'QUALIFIER_CASE_COVERAGE_MISMATCH');
const source=(fs.readFileSync(path.join(workspace,files.runtime),'utf8')+fs.readFileSync(path.join(workspace,files.core),'utf8')).toLowerCase();
for(const token of ['pdf-lib','libreoffice','pandoc','epub-gen','c2pa-node'])assert(!source.includes(token),'DOCUMENT_ENGINE_DEPENDENCY_FORBIDDEN',token);

const results=[];
for(const id of fixtures.cases){try{tests[id]();results.push({id,result:'PASS'});}catch(e){results.push({id,result:'FAIL',code:e&&e.code?e.code:'UNEXPECTED_ERROR',detail:e&&e.message?e.message:String(e)});}}
const failed=results.filter(r=>r.result!=='PASS');
const summary={
  qualification_id:'BOOK-SYSTEM-EXPORT-FREEZE-001',
  result_class:failed.length?'FAIL':'PASS',subject_sha:gitHead(),case_count:results.length,pass_count:results.length-failed.length,fail_count:failed.length,
  predecessor_candidate_evidence:{subject_sha:'0bbdb5b6809dcd0d8ec0392a1b493641b4ffac85',hosted_cases:70,qualification_transfer:false},
  required_dependency:{lifecycle_compatibility_subject_sha:'fc5adf8fd130d7b5324cff0058ab3804d75ec54e',authoritative_a01_pass:true},
  authority:{lifecycle_mutation_in_freeze:false,publication_authorized:false,author_choice_created:false,document_engine_created:false,provider_freeze_authority:false},
  file_sha256:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,fileSha256(v)])),results,
};
write('qualification-summary.json',summary);
write('qualification-manifest.json',{qualification_id:summary.qualification_id,subject_sha:summary.subject_sha,evidence_files:['qualification-summary.json'],case_count:summary.case_count,result_class:summary.result_class,predecessor_candidate_hosted_cases:70,qualification_transfer:false});
console.log(JSON.stringify(summary,null,2));
if(failed.length)process.exit(1);
