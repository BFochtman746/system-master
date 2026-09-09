'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  ExportFreezeError,
  ExportFreezeRuntime,
  digest,
  parentDigest,
  releaseRecord
} = require('../../system-master/book-system/export-freeze-core');

const contract = JSON.parse(fs.readFileSync(path.join(__dirname, '../../qualification/book-system/export-freeze-001/BOOK-SYSTEM-EXPORT-FREEZE-001-CONTRACT-001.json'), 'utf8'));
const D = seed => digest(String(seed));
const MANUSCRIPT_DIGEST = D('canonical-manuscript-v7');
const ARTIFACT_DIGEST = D('epub-artifact-v1');
const PROFILE_DIGEST = D('epub-3.3-prod-profile-v1');

function stateFixture() {
  return {
    schema_version: 1,
    state_version: 17,
    book_project: {book_project_id:'BOOK-PROJECT:001',book_id:'BOOK:001',status:'FINALIZATION',governing_brief_ref:'BRIEF:001',canonical_manifest_ref:'CANON:001'},
    governing_briefs: [], canon_manifests: [], story_bibles: [], book_plans: [],
    manuscripts: [{manuscript_id:'MANUSCRIPT:001',version_id:'MANUSCRIPT-VERSION:007',artifact_digest:MANUSCRIPT_DIGEST,authority_state:'CANONICAL',parent_version_ref:'MANUSCRIPT-VERSION:006',change_set_ref:'CHANGESET:007',created_by:'PARENT_SYSTEM',created_at:'2026-09-09T00:00:00Z'}],
    research_evidence_links: [], author_decisions: [], integration_proposals: [], export_releases: [],
    active: {governing_brief_ref:'BRIEF:001',canon_manifest_ref:'CANON:001',story_bible_ref:'STORY:001',book_plan_ref:'PLAN:001',canonical_manuscript_ref:'MANUSCRIPT:001'}
  };
}

function requestFixture(state = stateFixture()) {
  return {
    request_id:'FREEZE-REQUEST:001', idempotency_key:'IDEMPOTENCY:FREEZE:001', book_id:'BOOK:001', book_project_id:'BOOK-PROJECT:001',
    expected_parent_state_version:state.state_version, expected_parent_state_digest:parentDigest(state),
    canonical_manuscript_ref:'MANUSCRIPT:001', canonical_manuscript_version_id:'MANUSCRIPT-VERSION:007', canonical_manuscript_digest:MANUSCRIPT_DIGEST,
    artifact_ref:'ARTIFACT:EPUB:001', artifact_digest:ARTIFACT_DIGEST, format:'EPUB',
    target_medium_profile_id:'BOOK-EPUB-PRODUCTION', target_medium_profile_version:'1.0.0', target_medium_profile_digest:PROFILE_DIGEST,
    artifact_evidence:{artifact_ref:'ARTIFACT:EPUB:001',artifact_digest:ARTIFACT_DIGEST,source_version_identity:'MANUSCRIPT-VERSION:007',source_digest_identity:MANUSCRIPT_DIGEST,format_identity:'EPUB',target_profile_identity:'BOOK-EPUB-PRODUCTION@1.0.0',currentness:'CURRENT',format_validation_result:'PASS',source_to_render_integrity_result:'PASS',publication_authorized:false},
    target_medium_evidence:{technical_state:'POST_LAYOUT_PROOF_COMPLETE',validation_state:'PASS',source_to_render_integrity_state:'PASS',accessibility_state:'PASS',proof_state:'PASS',correction_ledger_ref:'CORRECTION-LEDGER:001',rendered_artifact_digest:ARTIFACT_DIGEST,currentness:'CURRENT',publication_authorized:false},
    provenance_evidence:{artifact_digest:ARTIFACT_DIGEST,source_digest:MANUSCRIPT_DIGEST,profile_digest:PROFILE_DIGEST,currentness:'CURRENT',standing:'VALID',publication_authorized:false},
    rights_privacy_evidence:{source_digest:MANUSCRIPT_DIGEST,rights_state:'ELIGIBLE',privacy_state:'ELIGIBLE',currentness:'CURRENT'},
    proof_correction_state:{correction_ledger_ref:'CORRECTION-LEDGER:001',open_corrections:0,last_validated_artifact_digest:ARTIFACT_DIGEST,last_proved_artifact_digest:ARTIFACT_DIGEST,currentness:'CURRENT'},
    requested_release_id:'EXPORT-RELEASE:EPUB:001', release_group_ref:'RELEASE-GROUP:001', publication_authorized:false
  };
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
function bad(name, code, mutate) {
  test(name, () => {
    const s=stateFixture(), r=requestFixture(s);
    mutate(s,r);
    if (r.expected_parent_state_digest === '__RECALC__') r.expected_parent_state_digest = parentDigest(s);
    assert.throws(() => new ExportFreezeRuntime().freeze(s,r), e => e instanceof ExportFreezeError && e.code === code, `${name} expected ${code}`);
  });
}

// 18 contract/positive-path cases.
test('contract identity',()=>assert.strictEqual(contract.contract_id,'BOOK-SYSTEM-EXPORT-FREEZE-001-CONTRACT-001'));
test('contract no publication effect',()=>assert.match(contract.qualification_effect,/CONTRACT_ONLY/));
test('contract stable epub baseline',()=>assert.match(contract.stable_standard_policy.EPUB,/EPUB 3\.3/));
test('contract stable accessibility baseline',()=>assert.match(contract.stable_standard_policy.EPUB_ACCESSIBILITY,/Accessibility 1\.1/));
test('positive freeze appends one release',()=>{const s=stateFixture(),o=new ExportFreezeRuntime().freeze(s,requestFixture(s));assert.strictEqual(o.state.export_releases.length,1);});
test('release fixed FROZEN approval',()=>{const s=stateFixture(),o=new ExportFreezeRuntime().freeze(s,requestFixture(s));assert.strictEqual(o.release.approval_state,'FROZEN');});
test('release publication not authorized',()=>{const s=stateFixture(),o=new ExportFreezeRuntime().freeze(s,requestFixture(s));assert.strictEqual(o.release.publication_authority_state,'NOT_AUTHORIZED');});
test('release evidence is freeze ready',()=>{const s=stateFixture(),o=new ExportFreezeRuntime().freeze(s,requestFixture(s));assert.strictEqual(o.release.evidence_type,'EXPORT_FREEZE_READY');});
test('lifecycle remains FINALIZATION',()=>{const s=stateFixture(),o=new ExportFreezeRuntime().freeze(s,requestFixture(s));assert.strictEqual(o.state.book_project.status,'FINALIZATION');assert.strictEqual(o.receipt.lifecycle_mutated,false);});
test('parent version advances exactly once',()=>{const s=stateFixture(),o=new ExportFreezeRuntime().freeze(s,requestFixture(s));assert.strictEqual(o.state.state_version,18);});
test('input parent remains immutable',()=>{const s=stateFixture(),b=JSON.stringify(s);new ExportFreezeRuntime().freeze(s,requestFixture(s));assert.strictEqual(JSON.stringify(s),b);});
test('receipt binds source and artifact',()=>{const s=stateFixture(),o=new ExportFreezeRuntime().freeze(s,requestFixture(s));assert.strictEqual(o.receipt.source_digest,MANUSCRIPT_DIGEST);assert.strictEqual(o.receipt.artifact_digest,ARTIFACT_DIGEST);});
test('receipt denies author synthesis',()=>{const s=stateFixture(),o=new ExportFreezeRuntime().freeze(s,requestFixture(s));assert.strictEqual(o.receipt.author_choice_created,false);});
test('receipt denies document mutation',()=>{const s=stateFixture(),o=new ExportFreezeRuntime().freeze(s,requestFixture(s));assert.strictEqual(o.receipt.document_bytes_generated_or_modified,false);});
test('exact idempotent replay returns receipt',()=>{const s=stateFixture(),r=requestFixture(s),rt=new ExportFreezeRuntime(),a=rt.freeze(s,r),b=rt.freeze(a.state,r);assert.strictEqual(b.replayed,true);assert.strictEqual(b.receipt.receipt_id,a.receipt.receipt_id);assert.strictEqual(b.state.export_releases.length,1);});
test('snapshot restores replay authority',()=>{const s=stateFixture(),r=requestFixture(s),rt=new ExportFreezeRuntime(),a=rt.freeze(s,r),rt2=new ExportFreezeRuntime(rt.snapshot()),b=rt2.freeze(a.state,r);assert.strictEqual(b.replayed,true);assert.strictEqual(b.receipt.receipt_id,a.receipt.receipt_id);});
test('distinct format can freeze as distinct release',()=>{const s=stateFixture(),r1=requestFixture(s),rt=new ExportFreezeRuntime(),a=rt.freeze(s,r1),r2=requestFixture(a.state);r2.request_id='FREEZE-REQUEST:002';r2.idempotency_key='IDEMPOTENCY:FREEZE:002';r2.requested_release_id='EXPORT-RELEASE:PDF:001';r2.format='PDF';r2.artifact_ref='ARTIFACT:PDF:001';r2.artifact_digest=D('pdf-artifact-v1');r2.artifact_evidence.artifact_ref=r2.artifact_ref;r2.artifact_evidence.artifact_digest=r2.artifact_digest;r2.artifact_evidence.format_identity='PDF';r2.target_medium_evidence.rendered_artifact_digest=r2.artifact_digest;r2.provenance_evidence.artifact_digest=r2.artifact_digest;r2.proof_correction_state.last_validated_artifact_digest=r2.artifact_digest;r2.proof_correction_state.last_proved_artifact_digest=r2.artifact_digest;const b=rt.freeze(a.state,r2);assert.strictEqual(b.state.export_releases.length,2);});
test('supersession lineage is additive',()=>{const s=stateFixture(),r=requestFixture(s);r.supersedes_release_ref='EXPORT-RELEASE:EPUB:000';assert.strictEqual(new ExportFreezeRuntime().freeze(s,r).release.supersedes_release_ref,'EXPORT-RELEASE:EPUB:000');});

// 46 fail-closed cases. A release ID seen without its idempotency receipt is never reconstructed as a safe replay.
bad('stale parent version','STALE_PARENT_VERSION',(s,r)=>{r.expected_parent_state_version--;});
bad('stale parent digest','STALE_PARENT_DIGEST',(s,r)=>{r.expected_parent_state_digest=D('wrong-parent');});
bad('project not finalization','PROJECT_NOT_FINALIZATION',(s,r)=>{s.book_project.status='EXPORT_FROZEN';r.expected_parent_state_digest='__RECALC__';});
bad('book project identity mismatch','BOOK_PROJECT_IDENTITY_MISMATCH',(s,r)=>{r.book_project_id='BOOK-PROJECT:OTHER';});
bad('active manuscript mismatch','ACTIVE_MANUSCRIPT_REF_MISMATCH',(s,r)=>{r.canonical_manuscript_ref='MANUSCRIPT:OTHER';});
bad('canonical manuscript absent','CANONICAL_MANUSCRIPT_NOT_FOUND',(s,r)=>{s.manuscripts=[];r.expected_parent_state_digest='__RECALC__';});
bad('manuscript not canonical','MANUSCRIPT_NOT_CANONICAL',(s,r)=>{s.manuscripts[0].authority_state='CANDIDATE';r.expected_parent_state_digest='__RECALC__';});
bad('manuscript version mismatch','MANUSCRIPT_VERSION_MISMATCH',(s,r)=>{r.canonical_manuscript_version_id='MANUSCRIPT-VERSION:006';});
bad('manuscript digest mismatch','MANUSCRIPT_DIGEST_MISMATCH',(s,r)=>{r.canonical_manuscript_digest=D('wrong-manuscript');});
bad('artifact evidence identity mismatch','ARTIFACT_EVIDENCE_IDENTITY_MISMATCH',(s,r)=>{r.artifact_evidence.artifact_digest=D('other-artifact');});
bad('artifact source version mismatch','ARTIFACT_SOURCE_BINDING_MISMATCH',(s,r)=>{r.artifact_evidence.source_version_identity='MANUSCRIPT-VERSION:006';});
bad('artifact source digest mismatch','ARTIFACT_SOURCE_BINDING_MISMATCH',(s,r)=>{r.artifact_evidence.source_digest_identity=D('other-source');});
bad('artifact format mismatch','ARTIFACT_FORMAT_MISMATCH',(s,r)=>{r.artifact_evidence.format_identity='PDF';});
bad('artifact profile mismatch','ARTIFACT_PROFILE_MISMATCH',(s,r)=>{r.artifact_evidence.target_profile_identity='BOOK-EPUB-PRODUCTION@2.0.0';});
bad('artifact evidence stale','ARTIFACT_EVIDENCE_STALE',(s,r)=>{r.artifact_evidence.currentness='STALE';});
bad('format validation fails','FORMAT_VALIDATION_NOT_PASS',(s,r)=>{r.artifact_evidence.format_validation_result='FAIL';});
bad('source render integrity fails','SOURCE_TO_RENDER_NOT_PASS',(s,r)=>{r.artifact_evidence.source_to_render_integrity_result='FAIL';});
bad('provider not proof complete','TECHNICAL_STATE_NOT_PROOF_COMPLETE',(s,r)=>{r.target_medium_evidence.technical_state='FORMAT_VALIDATED';});
bad('target validation fails','TARGET_VALIDATION_NOT_PASS',(s,r)=>{r.target_medium_evidence.validation_state='FAIL';});
bad('target integrity fails','TARGET_INTEGRITY_NOT_PASS',(s,r)=>{r.target_medium_evidence.source_to_render_integrity_state='FAIL';});
bad('accessibility fails','ACCESSIBILITY_NOT_PASS',(s,r)=>{r.target_medium_evidence.accessibility_state='FAIL';});
bad('proof fails','PROOF_NOT_PASS',(s,r)=>{r.target_medium_evidence.proof_state='FAIL';});
bad('target evidence stale','TARGET_EVIDENCE_STALE',(s,r)=>{r.target_medium_evidence.currentness='STALE';});
bad('proof digest does not match artifact','PROOF_ARTIFACT_DIGEST_MISMATCH',(s,r)=>{r.target_medium_evidence.rendered_artifact_digest=D('old-artifact');});
bad('provenance artifact mismatch','PROVENANCE_BINDING_MISMATCH',(s,r)=>{r.provenance_evidence.artifact_digest=D('old-artifact');});
bad('provenance source mismatch','PROVENANCE_BINDING_MISMATCH',(s,r)=>{r.provenance_evidence.source_digest=D('old-source');});
bad('provenance profile mismatch','PROVENANCE_BINDING_MISMATCH',(s,r)=>{r.provenance_evidence.profile_digest=D('old-profile');});
bad('provenance stale','PROVENANCE_NOT_CURRENT_VALID',(s,r)=>{r.provenance_evidence.currentness='STALE';});
bad('provenance invalid','PROVENANCE_NOT_CURRENT_VALID',(s,r)=>{r.provenance_evidence.standing='INVALID';});
bad('rights source mismatch','RIGHTS_SOURCE_BINDING_MISMATCH',(s,r)=>{r.rights_privacy_evidence.source_digest=D('old-source');});
bad('rights not eligible','RIGHTS_NOT_ELIGIBLE',(s,r)=>{r.rights_privacy_evidence.rights_state='BLOCKED';});
bad('privacy not eligible','PRIVACY_NOT_ELIGIBLE',(s,r)=>{r.rights_privacy_evidence.privacy_state='BLOCKED';});
bad('rights privacy stale','RIGHTS_PRIVACY_STALE',(s,r)=>{r.rights_privacy_evidence.currentness='STALE';});
bad('correction ledger stale','CORRECTION_LEDGER_STALE',(s,r)=>{r.proof_correction_state.currentness='STALE';});
bad('open proof corrections','OPEN_PROOF_CORRECTIONS',(s,r)=>{r.proof_correction_state.open_corrections=1;});
bad('changed bytes after validation','CHANGED_BYTES_AFTER_VALIDATION_OR_PROOF',(s,r)=>{r.proof_correction_state.last_validated_artifact_digest=D('previous-artifact');});
bad('changed bytes after proof','CHANGED_BYTES_AFTER_VALIDATION_OR_PROOF',(s,r)=>{r.proof_correction_state.last_proved_artifact_digest=D('previous-artifact');});
bad('correction ledger mismatch','CORRECTION_LEDGER_BINDING_MISMATCH',(s,r)=>{r.proof_correction_state.correction_ledger_ref='CORRECTION-LEDGER:OTHER';});
bad('request cannot authorize publication','PUBLICATION_AUTHORITY_FORBIDDEN',(s,r)=>{r.publication_authorized=true;});
bad('provider cannot authorize publication','PROVIDER_PUBLICATION_AUTHORITY_FORBIDDEN',(s,r)=>{r.artifact_evidence.publication_authorized=true;});
bad('provider cannot claim author approved','PROVIDER_PUBLICATION_AUTHORITY_FORBIDDEN',(s,r)=>{r.provenance_evidence.publication_authority_state='AUTHOR_APPROVED';});
bad('provider cannot claim export frozen','PROVIDER_FREEZE_AUTHORITY_FORBIDDEN',(s,r)=>{r.target_medium_evidence.technical_state='EXPORT_FROZEN';});
bad('release id conflict','RELEASE_ID_CONFLICT',(s,r)=>{s.export_releases=[{release_id:r.requested_release_id,frozen_version_id:'X',format:'PDF',digest:D('different'),approval_state:'FROZEN',publication_authority_state:'NOT_AUTHORIZED'}];r.expected_parent_state_digest='__RECALC__';});
bad('prior logical release without idempotency receipt is conflict','RELEASE_ID_CONFLICT',(s,r)=>{s.export_releases=[releaseRecord(r)];r.expected_parent_state_digest='__RECALC__';});
bad('invalid artifact digest','INVALID_DIGEST',(s,r)=>{r.artifact_digest='abc';});
bad('invalid parent version','INVALID_PARENT_VERSION',(s,r)=>{r.expected_parent_state_version=-1;});

// 6 final authority/replay cases.
test('idempotency conflict rejects changed request',()=>{const s=stateFixture(),r=requestFixture(s),rt=new ExportFreezeRuntime(),a=rt.freeze(s,r),c=JSON.parse(JSON.stringify(r));c.request_id='FREEZE-REQUEST:CHANGED';assert.throws(()=>rt.freeze(a.state,c),e=>e instanceof ExportFreezeError&&e.code==='IDEMPOTENCY_CONFLICT');});
test('replay fails if committed release is missing',()=>{const s=stateFixture(),r=requestFixture(s),rt=new ExportFreezeRuntime();rt.freeze(s,r);assert.throws(()=>rt.freeze(s,r),e=>e instanceof ExportFreezeError&&e.code==='IDEMPOTENT_REPLAY_RELEASE_MISSING');});
test('NOT_APPLICABLE accessibility accepted',()=>{const s=stateFixture(),r=requestFixture(s);r.target_medium_evidence.accessibility_state='NOT_APPLICABLE';assert.strictEqual(new ExportFreezeRuntime().freeze(s,r).release.approval_state,'FROZEN');});
test('release digest equals exact artifact bytes identity',()=>{const s=stateFixture(),r=requestFixture(s),o=new ExportFreezeRuntime().freeze(s,r);assert.strictEqual(o.release.digest,r.artifact_digest);});
test('freeze receipt lifecycle handoff only',()=>{const s=stateFixture(),o=new ExportFreezeRuntime().freeze(s,requestFixture(s));assert.strictEqual(o.receipt.lifecycle_handoff_evidence_type,'EXPORT_FREEZE_READY');});
test('freeze never sets publication authorized',()=>{const s=stateFixture(),o=new ExportFreezeRuntime().freeze(s,requestFixture(s));assert.strictEqual(o.receipt.publication_authorized,false);});

assert.strictEqual(tests.length,70,'qualification matrix must remain exactly 70 cases');
let passed=0; const failures=[];
for(const [name,fn] of tests){try{fn();passed++;}catch(e){failures.push({name,error:e&&e.stack?e.stack:String(e)});}}
const summary={objective:'BOOK-SYSTEM-EXPORT-FREEZE-001',qualifier_version:2,contract_id:contract.contract_id,total:tests.length,passed,failed:failures.length,result:failures.length?'FAIL':'PASS',collision_policy:'EXISTING_RELEASE_ID_WITHOUT_DURABLE_IDEMPOTENCY_RECEIPT_IS_CONFLICT',authority:{lifecycle_mutation_authorized:false,publication_authorized:false,author_choice_created:false,document_engine_created:false},stable_standard_policy:contract.stable_standard_policy,failures};
console.log(JSON.stringify(summary,null,2));
if(process.env.A01_EVIDENCE_DIR){fs.mkdirSync(process.env.A01_EVIDENCE_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.A01_EVIDENCE_DIR,'book-system-export-freeze-001-summary.json'),JSON.stringify(summary,null,2));}
if(failures.length)process.exit(1);
