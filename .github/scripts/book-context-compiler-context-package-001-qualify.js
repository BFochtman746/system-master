'use strict';
const assert = require('assert');
const { compileContext, stable, semanticProjection, digestProjection } = require('../../system-master/book-system/context-compiler/book-context-compiler');
const H = 'a'.repeat(64), H2 = 'b'.repeat(64);
const NOW = new Date('2026-09-11T04:40:00Z');
function base() {
  return {
    context_package_id:'ctx-1', schema_version:'1.0.0-proposed', package_class:'GENERATION_CONTEXT', book_project_id:'book-1',
    source_identity:{source_manuscript_ref:'manuscript:v1',source_manuscript_sha256:H,source_version_id:'1'},
    book_state_binding:{expected_book_state_version:'10',expected_book_state_digest_sha256:H},
    story_bible_binding:{story_bible_snapshot_ref:'story:v4',story_bible_snapshot_sha256:H,canon_version:'4'},
    author_authority_binding:{decision_required:false,observed_author_decision_refs:[],unresolved_author_questions:[]},
    constraint_set:[{constraint_id:'C-2',class:'canon',source_ref:'s2',priority:2,hard_or_advisory:'advisory'},{constraint_id:'C-1',class:'canon',source_ref:'s1',priority:1,hard_or_advisory:'hard'}],
    capability_request:{capability_id:'completed-prose-adapter',authority_domain:'SYSTEM_MASTER/BOOK',service_registry_id:'services-1',service_registry_subject_sha:'sha-services',consumer_role:'BOOK_OWNED_GENERATION_ADAPTER',integration_owner:'BOOK',completed_prose_input:true},
    privacy_class:'BOOK_PRIVATE_REF_ONLY',created_at:'2026-09-11T04:00:00Z',expires_at:'2026-09-11T06:00:00Z',compiler_version:'0.1.0',compiler_subject_sha:'subject-1',
    research_evidence_refs:[],prior_decision_refs:[],artifact_refs:[],evaluation_policy_ref:null
  };
}
function live(x){return {source_identity:x.source_identity,book_state_binding:x.book_state_binding,story_bible_binding:x.story_bible_binding,capability_request:{service_registry_id:x.capability_request.service_registry_id,service_registry_subject_sha:x.capability_request.service_registry_subject_sha}};}
let n=0; function t(name, fn){fn(); n++; console.log(`PASS ${String(n).padStart(2,'0')} ${name}`);} 

t('valid generation package ready',()=>assert.equal(compileContext(base(),live(base()),NOW).result_class,'PACKAGE_READY'));
t('canonical effect always false',()=>assert.equal(compileContext(base(),live(base()),NOW).canonical_effect,false));
t('key order stable',()=>assert.deepStrictEqual(stable({b:1,a:2}),stable({a:2,b:1})));
t('constraint order normalized',()=>{const x=base(); const y=base(); y.constraint_set=[...x.constraint_set].reverse(); assert.equal(digestProjection(semanticProjection(x)),digestProjection(semanticProjection(y)));});
t('created_at excluded from semantic digest',()=>{const x=base(),y=base(); y.created_at='2026-09-11T04:30:00Z'; assert.equal(digestProjection(semanticProjection(x)),digestProjection(semanticProjection(y)));});
t('source digest change changes digest',()=>{const x=base(),y=base(); y.source_identity={...y.source_identity,source_manuscript_sha256:H2}; assert.notEqual(digestProjection(semanticProjection(x)),digestProjection(semanticProjection(y)));});
t('book state change stale',()=>{const x=base(), l=live(x); l.book_state_binding={...l.book_state_binding,expected_book_state_version:'11'}; assert.equal(compileContext(x,l,NOW).result_class,'STALE_CONTEXT');});
t('story bible change stale',()=>{const x=base(),l=live(x); l.story_bible_binding={...l.story_bible_binding,canon_version:'5'}; assert.equal(compileContext(x,l,NOW).result_class,'STALE_CONTEXT');});
t('service registry change stale',()=>{const x=base(),l=live(x); l.capability_request.service_registry_subject_sha='new'; assert.equal(compileContext(x,l,NOW).result_class,'STALE_CONTEXT');});
t('author unresolved fails closed',()=>{const x=base(); x.author_authority_binding={decision_required:true,observed_author_decision_refs:[],unresolved_author_questions:['ending?']}; assert.equal(compileContext(x,live(x),NOW).result_class,'AUTHOR_DECISION_REQUIRED');});
t('hard conflict detected',()=>{const x=base(); x.constraint_set=[{constraint_id:'A',class:'canon',source_ref:'s',priority:1,hard_or_advisory:'hard',conflict_group:'G'},{constraint_id:'B',class:'canon',source_ref:'s',priority:1,hard_or_advisory:'hard',conflict_group:'G'}]; assert.equal(compileContext(x,live(x),NOW).result_class,'CONSTRAINT_CONFLICT');});
t('single hard conflict group okay',()=>{const x=base(); x.constraint_set=[{constraint_id:'A',class:'canon',source_ref:'s',priority:1,hard_or_advisory:'hard',conflict_group:'G'}]; assert.equal(compileContext(x,live(x),NOW).result_class,'PACKAGE_READY');});
t('raw manuscript forbidden top-level',()=>{const x=base(); x.raw_manuscript_text='secret'; assert.equal(compileContext(x,live(x),NOW).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
t('private gold forbidden nested',()=>{const x=base(); x.capability_request.extra={private_gold_labels:['x']}; assert.equal(compileContext(x,live(x),NOW).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
t('prose authority domain rejected',()=>{const x=base(); x.capability_request.authority_domain='SYSTEM_MASTER/BOOK/PROSE'; assert.equal(compileContext(x,live(x),NOW).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
t('documents cannot own completed prose integration',()=>{const x=base(); x.capability_request.integration_owner='DOCUMENTS'; assert.equal(compileContext(x,live(x),NOW).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
t('expired handle rejected',()=>{const x=base(); x.expires_at='2026-09-11T04:00:00Z'; assert.equal(compileContext(x,live(x),NOW).result_class,'EXPIRED');});
t('invalid package class rejected',()=>{const x=base(); x.package_class='PROSE_CONTEXT'; assert.equal(compileContext(x,live(x),NOW).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
t('evaluation rejects generation consumer',()=>{const x=base(); x.package_class='EVALUATION_CONTEXT'; assert.equal(compileContext(x,live(x),NOW).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
t('evaluation own consumer passes',()=>{const x=base(); x.package_class='EVALUATION_CONTEXT'; x.capability_request.consumer_role='BOOK_OWNED_EVALUATION_ADAPTER'; assert.equal(compileContext(x,live(x),NOW).result_class,'PACKAGE_READY');});
t('admission authority requires admission class',()=>{const x=base(); x.capability_request.authority_domain='BOOK_CANONICAL_CONTENT_ADMISSION'; assert.equal(compileContext(x,live(x),NOW).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
t('admission class allowed and nonmutating',()=>{const x=base(); x.package_class='ADMISSION_CONTEXT'; x.capability_request.authority_domain='BOOK_CANONICAL_CONTENT_ADMISSION'; const r=compileContext(x,live(x),NOW); assert.equal(r.result_class,'PACKAGE_READY'); assert.equal(r.canonical_effect,false);});
t('missing source identity rejected',()=>{const x=base(); delete x.source_identity; assert.equal(compileContext(x,{},NOW).result_class,'INVALID_SOURCE_IDENTITY');});
t('source ref mismatch stale',()=>{const x=base(), l=live(x); l.source_identity={...l.source_identity,source_manuscript_ref:'other'}; assert.equal(compileContext(x,l,NOW).result_class,'STALE_CONTEXT');});
t('source version mismatch stale',()=>{const x=base(), l=live(x); l.source_identity={...l.source_identity,source_version_id:'2'}; assert.equal(compileContext(x,l,NOW).result_class,'STALE_CONTEXT');});
t('book digest mismatch stale',()=>{const x=base(), l=live(x); l.book_state_binding={...l.book_state_binding,expected_book_state_digest_sha256:H2}; assert.equal(compileContext(x,l,NOW).result_class,'STALE_CONTEXT');});
t('story digest mismatch stale',()=>{const x=base(), l=live(x); l.story_bible_binding={...l.story_bible_binding,story_bible_snapshot_sha256:H2}; assert.equal(compileContext(x,l,NOW).result_class,'STALE_CONTEXT');});
t('nonsemantic key ordering stable deep',()=>assert.deepStrictEqual(stable({z:{b:2,a:1},a:0}),{a:0,z:{a:1,b:2}}));
t('advisory duplicate group not hard conflict',()=>{const x=base(); x.constraint_set=[{constraint_id:'A',class:'canon',source_ref:'s',priority:1,hard_or_advisory:'advisory',conflict_group:'G'},{constraint_id:'B',class:'canon',source_ref:'s',priority:1,hard_or_advisory:'advisory',conflict_group:'G'}]; assert.equal(compileContext(x,live(x),NOW).result_class,'PACKAGE_READY');});
t('research refs affect digest',()=>{const x=base(), y=base(); y.research_evidence_refs=[{evidence_id:'E1'}]; assert.notEqual(digestProjection(semanticProjection(x)),digestProjection(semanticProjection(y)));});
t('compiler subject affects digest',()=>{const x=base(),y=base(); y.compiler_subject_sha='subject-2'; assert.notEqual(digestProjection(semanticProjection(x)),digestProjection(semanticProjection(y)));});
t('expires hour bucket affects digest',()=>{const x=base(),y=base(); y.expires_at='2026-09-11T07:00:00Z'; assert.notEqual(digestProjection(semanticProjection(x)),digestProjection(semanticProjection(y)));});
t('raw candidate forbidden deeply',()=>{const x=base(); x.research_evidence_refs=[{nested:{raw_candidate_text:'x'}}]; assert.equal(compileContext(x,live(x),NOW).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
t('publication credentials forbidden',()=>{const x=base(); x.research_evidence_refs=[{publication_credentials:'x'}]; assert.equal(compileContext(x,live(x),NOW).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
t('canonical mutation command forbidden',()=>{const x=base(); x.artifact_refs=[{canonical_mutation_command:'write'}]; assert.equal(compileContext(x,live(x),NOW).result_class,'REJECTED_AUTHORITY_BOUNDARY');});
assert(n >= 30);
console.log(`BOOK_CONTEXT_COMPILER_PORTABLE_PASS cases=${n}`);
