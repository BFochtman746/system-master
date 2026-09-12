'use strict';

const assert = require('assert');
const kb = require('./book-story-bible-knowledge-v1');
const mat = require('./book-knowledge-materializer-v1');
const inv = require('./book-knowledge-invalidation-v1');
const d4 = require('./book-story-bible-admission-v1');
const vr = require('./version-and-rollback-core');
const registry = require('./book-capability-binding-v1.registry.json');

let cases = 0;
function pass(label, fn) { fn(); cases += 1; process.stdout.write(`${label} PASS\n`); }
function expectCode(fn, code) {
  let caught = null;
  try { fn(); } catch (err) { caught = err; }
  assert(caught, `expected ${code}`);
  assert.strictEqual(caught.code, code, `expected ${code}, got ${caught && caught.code}`);
}
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function h(v) { return kb.sha256(v); }
function sealKnowledge(c) { c.knowledge_digest = kb.knowledgeDigest(c); c.knowledge_candidate_id = kb.knowledgeCandidateId(c.knowledge_digest); return c; }
function common(status = 'ASSERTED', confidence = 0.91, deps = ['ANCHOR:A1']) {
  return { status, confidence, source_anchor_ids:['ANCHOR:A1'], provenance_refs:['evidence://provider/1'], evidence_refs:['evidence://claim/1'], depends_on_refs:deps };
}
const SA_ID = 'book-source-custody-v1:source-001';
const SA_DIGEST = h('source-acceptance');
const PROJ_ID = 'book-normalized-source-projection-v1:projection-001';
const PROJ_DIGEST = h('projection');
const MANUSCRIPT_REF = 'MANUSCRIPT-001:V1';
const MANUSCRIPT_DIGEST = h('manuscript');
const ANCHOR_SPAN = h('span-a1');
const SUBJECT_SHA = 'b'.repeat(40);
const CREATED_AT = '2026-09-12T18:30:00Z';

function policy() {
  const rule = semantic_class => ({ semantic_class, admission_mode:'DETERMINISTIC_ONLY', min_confidence:null, min_distinct_evidence_families:1, allowed_support_statuses:['VERIFIED','OBSERVED','INFERRED','CONTESTED'], allowed_output_statuses:['ASSERTED','ALTERNATIVE','UNRESOLVED','CONTESTED','INVALIDATED'], calibration_evidence_refs:[], abstain_when_uncalibrated:false });
  return mat.sealCalibrationPolicyV1({ policy_schema_version:mat.POLICY_SCHEMA_VERSION, policy_id:'policy://book-knowledge/d4', policy_version:'1', policy_digest:'', provider_subject_scopes:[], rules:['ANCHOR','ENTITY','EVENT','THEME'].map(rule), standing:'ADMITTED' });
}
function knowledge(p = policy()) {
  const c = {
    knowledge_schema_version:kb.KNOWLEDGE_SCHEMA_VERSION,
    book_project_id:'BOOK-PROJECT-001', knowledge_candidate_id:'', knowledge_digest:'',
    prior_story_bible_ref:'BIBLE-001:V1', source_subject_refs:[SUBJECT_SHA],
    source_acceptance_refs:[{source_acceptance_id:SA_ID,source_acceptance_digest:SA_DIGEST}],
    projection_refs:[{projection_id:PROJ_ID,projection_digest:PROJ_DIGEST,source_acceptance_id:SA_ID}],
    manuscript_refs:[{manuscript_ref:MANUSCRIPT_REF,manuscript_digest:MANUSCRIPT_DIGEST}],
    calibration_policy_ref:`${p.policy_id}@${p.policy_version}`, calibration_policy_digest:p.policy_digest,
    anchors:[{anchor_id:'ANCHOR:A1',source_acceptance_id:SA_ID,source_acceptance_digest:SA_DIGEST,projection_id:PROJ_ID,projection_digest:PROJ_DIGEST,manuscript_ref:MANUSCRIPT_REF,unit_ref:'CHAPTER:CH-001:V1',ordinal:1,span_start:0,span_end:10,span_sha256:ANCHOR_SPAN,source_current:true,provenance_refs:['evidence://anchor/1']}],
    entities:[{entity_id:'ENTITY:ALICE',entity_type:'CHARACTER',aliases:['Alice'],state_assertion_ids:[],...common()}],
    events:[{event_id:'EVENT:E1',event_family_id:null,participant_entity_ids:['ENTITY:ALICE'],state_change_ids:[],goal_relation_ids:[],...common('ASSERTED',0.9,['ENTITY:ALICE'])}],
    temporal_claims:[], causal_goal_claims:[], state_assertions:[], character_knowledge_claims:[], relationships:[], arcs:[], motifs:[],
    themes:[{theme_id:'THEME:T1',kind:'THEME',label:'Trust',subject_refs:['ENTITY:ALICE'],...common('CONTESTED',0.65,['ENTITY:ALICE'])}],
    promises:[], setup_payoffs:[], open_questions:[], identity_lineage:[], standing:'MATERIALIZED_NOT_CANONICAL'
  };
  return sealKnowledge(c);
}
function materializationReceipt(k, p) {
  const r = {
    receipt_schema_version:mat.RECEIPT_SCHEMA_VERSION, receipt_id:'', receipt_digest:'',
    materialization_operation_id:`book-knowledge-materialization-v1:${h('materialization-op')}`,
    materialization_operation_digest:h('materialization-op'),
    materializer_subject_ref:mat.MATERIALIZER_SUBJECT_REF, validator_subject_ref:mat.VALIDATOR_SUBJECT_REF,
    prior_story_bible_ref:'BIBLE-001:V1', input_identity_refs:[SA_ID,PROJ_ID,MANUSCRIPT_REF],
    calibration_policy_ref:`${p.policy_id}@${p.policy_version}`, calibration_policy_digest:p.policy_digest,
    input_counts_by_class:{ANCHOR:1,ENTITY:1,EVENT:1,THEME:1}, admitted_counts_by_class:{ANCHOR:1,ENTITY:1,EVENT:1,THEME:1},
    alternative_counts_by_class:{}, unresolved_counts_by_class:{}, contested_counts_by_class:{THEME:1}, rejected_counts_by_class:{},
    rejection_reasons:[], identity_lineage_changes:[], knowledge_candidate_id:k.knowledge_candidate_id, knowledge_digest:k.knowledge_digest,
    knowledge_valid:true, raw_manuscript_text_persisted:false, canonical_write_performed:false
  };
  r.receipt_digest = mat.receiptDigest(r);
  r.receipt_id = `book-knowledge-materialization-receipt-v1:${r.receipt_digest}`;
  return r;
}
function baseState() {
  return vr.sealState({
    schema_version:1, state_version:1,
    book_project:{book_project_id:'BOOK-PROJECT-001',book_id:'BOOK-001',status:'DRAFTING',governing_brief_ref:'BRIEF-001:V1',canonical_manifest_ref:'CANON-001:V1'},
    governing_briefs:[{brief_id:'BRIEF-001',version:'V1'}],
    canon_manifests:[{canon_manifest_id:'CANON-001',version:'V1'}],
    story_bibles:[{story_bible_id:'BIBLE-001',version:'V1',entity_refs:[],relationship_refs:[],timeline_refs:[],arc_refs:[],motif_theme_refs:[],open_questions:[],provenance:[]}],
    book_plans:[{plan_id:'PLAN-001',version:'V1'}],
    manuscripts:[{manuscript_id:'MANUSCRIPT-001',version_id:'V1',artifact_digest:h('manuscript-artifact'),authority_state:'CANONICAL'}],
    research_evidence_links:[],
    author_decisions:[{decision_id:'AUTHOR-THEME-001',subject_ref:'THEME:T1',decision_type:'CANON_RESOLUTION',status:'APPROVED',author_choice:'APPROVE',effective_version:1}],
    integration_proposals:[], export_releases:[],
    active:{governing_brief_ref:'BRIEF-001:V1',canon_manifest_ref:'CANON-001:V1',story_bible_ref:'BIBLE-001:V1',book_plan_ref:'PLAN-001:V1',canonical_manuscript_ref:'MANUSCRIPT-001:V1'}
  });
}
function context() { return vr.createVersionLedger(baseState()); }
function storyRecord(parent) { return vr.objectRecords(parent).find(x => x.type === 'STORY_BIBLE' && x.object_id === 'BIBLE-001' && x.object_version === 'V1'); }
function draft(ctx, patch = {}) {
  const p = patch.calibration_policy || policy();
  const k = patch.knowledge || knowledge(p);
  const r = patch.materialization_receipt || materializationReceipt(k,p);
  const current = storyRecord(ctx.parent_state);
  const input = {
    admission_operation_id:'', admission_operation_digest:'', book_project_id:'BOOK-PROJECT-001',
    current_parent_state_version:ctx.parent_state.state_version, current_parent_state_digest:ctx.parent_state.state_digest,
    current_story_bible_ref:ctx.parent_state.active.story_bible_ref, current_story_bible_digest:current.object_digest,
    knowledge:k, knowledge_candidate_id:k.knowledge_candidate_id, knowledge_digest:k.knowledge_digest,
    materialization_receipt:r, materialization_receipt_id:r.receipt_id, materialization_receipt_digest:r.receipt_digest,
    calibration_policy:p, calibration_policy_ref:`${p.policy_id}@${p.policy_version}`, calibration_policy_digest:p.policy_digest,
    source_identity_evidence:[{source_acceptance_id:SA_ID,source_acceptance_digest:SA_DIGEST,current:true,rights_current:true,private_authority_current:true}],
    projection_identity_evidence:[{projection_id:PROJ_ID,projection_digest:PROJ_DIGEST,current:true}],
    manuscript_identity_evidence:[{manuscript_ref:MANUSCRIPT_REF,manuscript_digest:MANUSCRIPT_DIGEST,current:true}],
    definitive_contested_resolution_refs:[], author_decision_refs:[], author_applicability_bindings:[],
    new_story_bible_id:'BIBLE-001', new_story_bible_version:'V2', new_story_bible_content_digest:'',
    b03_subject_sha:SUBJECT_SHA, created_at:CREATED_AT, invalidation_result:null,
    ...patch
  };
  return d4.sealStoryBibleAdmissionInputV1(input);
}
function prepare(ctx, input = draft(ctx)) { return d4.prepareStoryBibleKnowledgeAdmissionV1(input,{parent_state:ctx.parent_state,version_ledger:ctx.version_ledger}); }
function mutateDraft(ctx, fn) { const x=draft(ctx); fn(x); x.admission_operation_id=''; x.admission_operation_digest=''; return d4.sealStoryBibleAdmissionInputV1(x); }
function mutateKnowledge(base, fn) { const k=clone(base); fn(k); return sealKnowledge(k); }
function invalidationResult(k, ctx) {
  const x = inv.sealInvalidationInputV1({ invalidation_operation_id:'', invalidation_operation_digest:'', invalidation_subject_ref:inv.INVALIDATION_SUBJECT_REF, book_project_id:'BOOK-PROJECT-001', base_story_bible_ref:'BIBLE-001:V1', base_story_bible_digest:storyRecord(ctx.parent_state).object_digest, base_knowledge:k, changed_identities:[{kind:'ANCHOR',identity_ref:'ANCHOR:A1',prior_digest:ANCHOR_SPAN,current_digest:h('changed-span'),current_identity_ref:'ANCHOR:A1'}] });
  return inv.computeStoryBibleInvalidationImpactV1(x);
}

pass('A01', () => {
  assert.strictEqual(d4.OWNER,'SYSTEM_MASTER/BOOK');
  assert.deepStrictEqual(Object.values(d4.OPERATION_IDENTITIES),[
    'BOOK.KNOWLEDGE.VALIDATE_STORY_BIBLE','BOOK.KNOWLEDGE.MATERIALIZE_STORY_BIBLE','BOOK.KNOWLEDGE.COMPUTE_STORY_BIBLE_INVALIDATION','BOOK.KNOWLEDGE.PREPARE_STORY_BIBLE_ADMISSION','BOOK.KNOWLEDGE.COMMIT_STORY_BIBLE_ADMISSION','BOOK.KNOWLEDGE.CHECK_STORY_BIBLE_INTEGRITY'
  ]);
  const k=knowledge(); const out=d4.invokeBookKnowledgeCommandV1({owner:d4.OWNER,operation_identity:d4.OPERATION_IDENTITIES.CHECK,payload:{knowledge:k}}); assert.strictEqual(out.result,'PASS');
});
pass('A02', () => {
  expectCode(()=>d4.invokeBookKnowledgeCommandV1({owner:d4.OWNER,operation_identity:'CANONICAL_NARRATIVE_STATE.BUILD',payload:{}}),'BLOCKED_RETIRED_B03_AUTHORITY');
  expectCode(()=>d4.invokeBookKnowledgeCommandV1({owner:d4.OWNER,operation_identity:'PROSE.BUILD_NARRATIVE_STATE',payload:{}}),'BLOCKED_RETIRED_B03_AUTHORITY');
});
pass('A03', () => { const c=context(), before=clone(c.parent_state), p=prepare(c); assert.strictEqual(p.canonical_effect,false); assert.deepStrictEqual(c.parent_state,before); });
pass('A04', () => {
  const c=context();
  expectCode(()=>prepare(c,mutateDraft(c,x=>{x.current_parent_state_digest='f'.repeat(64);})), 'BLOCKED_CURRENT_STORY_BIBLE_STALE');
  expectCode(()=>prepare(c,mutateDraft(c,x=>{x.current_story_bible_digest='e'.repeat(64);})), 'BLOCKED_CURRENT_STORY_BIBLE_STALE');
  expectCode(()=>prepare(c,mutateDraft(c,x=>{x.current_story_bible_ref='BIBLE-001:OLD';})), 'BLOCKED_CURRENT_STORY_BIBLE_STALE');
});
pass('A05', () => {
  const c=context();
  expectCode(()=>prepare(c,mutateDraft(c,x=>{x.knowledge_digest='d'.repeat(64);})), 'BLOCKED_KNOWLEDGE_DIGEST_MISMATCH');
  expectCode(()=>prepare(c,mutateDraft(c,x=>{x.materialization_receipt_digest='c'.repeat(64);})), 'BLOCKED_KNOWLEDGE_DIGEST_MISMATCH');
  expectCode(()=>prepare(c,mutateDraft(c,x=>{x.calibration_policy_digest='a'.repeat(64);})), 'BLOCKED_CALIBRATION_POLICY_MISSING');
  expectCode(()=>prepare(c,mutateDraft(c,x=>{x.source_identity_evidence[0].source_acceptance_digest='1'.repeat(64);})), 'BLOCKED_REFERENCE_INTEGRITY');
  expectCode(()=>prepare(c,mutateDraft(c,x=>{x.projection_identity_evidence[0].projection_digest='2'.repeat(64);})), 'BLOCKED_REFERENCE_INTEGRITY');
  expectCode(()=>prepare(c,mutateDraft(c,x=>{x.manuscript_identity_evidence[0].manuscript_digest='3'.repeat(64);})), 'BLOCKED_REFERENCE_INTEGRITY');
});
pass('A06', () => { const c=context(), k=knowledge(), ir=invalidationResult(k,c); expectCode(()=>prepare(c,mutateDraft(c,x=>{x.invalidation_result=ir;})),'BLOCKED_INVALIDATION_REQUIRED'); });
pass('A07', () => { const c=context(); expectCode(()=>prepare(c,mutateDraft(c,x=>{x.definitive_contested_resolution_refs=['THEME:T1'];})),'BLOCKED_AUTHOR_DECISION'); });
pass('A08', () => { const c=context(), p=prepare(c); assert.strictEqual(p.content_admission_request.author_decision_refs.length,0); assert.strictEqual(p.content_admission_request.operations[0].requires_author_decision,false); });
pass('A09', () => { const c=context(), p=prepare(c); assert.strictEqual(p.content_admission_request.operations.length,2); assert.strictEqual(p.content_admission_request.operations[0].object_type,'STORY_BIBLE'); assert.strictEqual(p.content_admission_request.operations[1].object_ref,'BIBLE-001:V2'); });
pass('A10', () => { const c=context(), p=prepare(c), r=d4.commitStoryBibleKnowledgeAdmissionV1(p,{parent_state:c.parent_state,version_ledger:c.version_ledger}); assert.strictEqual(r.result,'COMMITTED_VERIFIED'); assert.strictEqual(r.parent_state.state_version,2); assert.strictEqual(r.parent_state.active.story_bible_ref,'BIBLE-001:V2'); assert.strictEqual(r.parent_state.story_bibles.length,2); assert.strictEqual(r.canonical_effect_authority,'B00_CONTENT_ADMISSION_ONLY'); });
pass('A11', () => { const c=context(), p=prepare(c), stale=clone(c.parent_state); stale.state_version=2; stale.state_digest=vr.computeStateDigest(stale); const before=clone(stale); expectCode(()=>d4.commitStoryBibleKnowledgeAdmissionV1(p,{parent_state:stale,version_ledger:c.version_ledger}),'BLOCKED_CURRENT_STORY_BIBLE_STALE'); assert.deepStrictEqual(stale,before); });
pass('A12', () => { const c=context(), p=prepare(c), r1=d4.commitStoryBibleKnowledgeAdmissionV1(p,{parent_state:c.parent_state,version_ledger:c.version_ledger}); const r2=d4.commitStoryBibleKnowledgeAdmissionV1(p,{parent_state:r1.parent_state,version_ledger:r1.version_ledger}); assert.strictEqual(r2.result,'COMMITTED_VERIFIED_REPLAY'); assert.strictEqual(r2.parent_state.state_version,2); assert.strictEqual(r2.parent_state.active.story_bible_ref,'BIBLE-001:V2'); });
pass('A13', () => { const c=context(), base=draft(c).admission_operation_id; const variants=[x=>{x.calibration_policy_digest='1'.repeat(64);},x=>{x.knowledge_candidate_id='book-story-bible-knowledge-v1:'+'2'.repeat(64);},x=>{x.current_parent_state_digest='3'.repeat(64);},x=>{x.author_decision_refs=['D-OTHER'];},x=>{x.source_identity_evidence[0].source_acceptance_digest='4'.repeat(64);},x=>{x.projection_identity_evidence[0].projection_digest='5'.repeat(64);},x=>{x.manuscript_identity_evidence[0].manuscript_digest='6'.repeat(64);}]; for(const fn of variants){const x=draft(c);fn(x);x.admission_operation_id='';x.admission_operation_digest='';const y=d4.sealStoryBibleAdmissionInputV1(x);assert.notStrictEqual(y.admission_operation_id,base);} });
pass('A14', () => { assert.strictEqual(registry.binding_inputs.length,11); assert(!registry.binding_inputs.some(x=>String(x.current_capability_id).startsWith('BOOK.KNOWLEDGE.'))); assert.strictEqual(d4.AUTHORITY_CLAIMS.b01_registry_modified,false); });
pass('A15', () => { const k=knowledge(), before=clone(k); assert(d4.invokeBookKnowledgeQueryV1(d4.QUERY_IDENTITIES.BY_ID,{knowledge:k,id:'ENTITY:ALICE'})); assert(d4.invokeBookKnowledgeQueryV1(d4.QUERY_IDENTITIES.RELATIONS,{knowledge:k,id:'ENTITY:ALICE'}).length>=2); assert.strictEqual(d4.invokeBookKnowledgeQueryV1(d4.QUERY_IDENTITIES.STATUS,{knowledge:k}).canonical_effect,false); assert(d4.invokeBookKnowledgeQueryV1(d4.QUERY_IDENTITIES.EVIDENCE,{knowledge:k,id:'ENTITY:ALICE'})); assert.strictEqual(d4.invokeBookKnowledgeQueryV1(d4.QUERY_IDENTITIES.INTEGRITY,{knowledge:k}).result,'PASS'); assert.deepStrictEqual(k,before); });
pass('A16', () => { const c=context(), status=c.parent_state.book_project.status, exports=clone(c.parent_state.export_releases), r=d4.commitStoryBibleKnowledgeAdmissionV1(prepare(c),{parent_state:c.parent_state,version_ledger:c.version_ledger}); assert.strictEqual(r.parent_state.book_project.status,status); assert.deepStrictEqual(r.parent_state.export_releases,exports); assert.strictEqual(r.publication_authority,false); assert.strictEqual(r.export_authority,false); });

pass('X01', () => { assert.strictEqual(d4.AUTHORITY_CLAIMS.canonical_store_created,false); });
pass('X02', () => { const c=context(), canonBefore=clone(c.parent_state.canon_manifests), p=prepare(c); assert(!p.content_admission_request.operations.some(x=>x.object_type==='CANON_MANIFEST')); const r=d4.commitStoryBibleKnowledgeAdmissionV1(p,{parent_state:c.parent_state,version_ledger:c.version_ledger}); assert.deepStrictEqual(r.parent_state.canon_manifests,canonBefore); });
pass('X03', () => { expectCode(()=>d4.invokeBookKnowledgeCommandV1({owner:d4.OWNER,operation_identity:'CANONICAL_NARRATIVE_STATE',payload:{}}),'BLOCKED_RETIRED_B03_AUTHORITY'); });
pass('X04', () => { expectCode(()=>d4.invokeBookKnowledgeCommandV1({owner:d4.OWNER,operation_identity:'PROSE.REVISE',payload:{}}),'BLOCKED_RETIRED_B03_AUTHORITY'); });
pass('X05', () => { const c=context(); expectCode(()=>prepare(c,mutateDraft(c,x=>{x.raw_manuscript_text='forbidden';})),'BLOCKED_KNOWLEDGE_SCHEMA_INVALID'); });
pass('X06', () => { const c=context(); expectCode(()=>prepare(c,mutateDraft(c,x=>{x.provider_direct_canonical_write=true;})),'BLOCKED_AUTHORITY_WIDENING'); });
pass('X07', () => { const c=context(); expectCode(()=>prepare(c,mutateDraft(c,x=>{x.confidence_is_canonical_truth=true;})),'BLOCKED_AUTHORITY_WIDENING'); });
pass('X08', () => { const c=context(); expectCode(()=>prepare(c,mutateDraft(c,x=>{x.definitive_contested_resolution_refs=['THEME:T1'];x.author_decision_refs=[];})),'BLOCKED_AUTHOR_DECISION'); });
pass('X09', () => { const c=context(); expectCode(()=>prepare(c,mutateDraft(c,x=>{x.author_decision_synthesized=true;})),'BLOCKED_AUTHORITY_WIDENING'); });
pass('X10', () => { const c=context(); expectCode(()=>prepare(c,mutateDraft(c,x=>{x.source_identity_evidence[0].current=false;})),'BLOCKED_SOURCE_STALE'); expectCode(()=>prepare(c,mutateDraft(c,x=>{x.projection_identity_evidence[0].current=false;})),'BLOCKED_PROJECTION_STALE'); expectCode(()=>prepare(c,mutateDraft(c,x=>{x.manuscript_identity_evidence[0].current=false;})),'BLOCKED_MANUSCRIPT_STALE'); });
pass('X11', () => { const c=context(), k=knowledge(), ir=invalidationResult(k,c); assert(ir.impact.directly_affected_refs.includes('ENTITY:ALICE')); expectCode(()=>prepare(c,mutateDraft(c,x=>{x.invalidation_result=ir;})),'BLOCKED_INVALIDATION_REQUIRED'); });
pass('X12', () => { const c=context(), history=clone(c.parent_state.story_bibles), p=prepare(c); assert.deepStrictEqual(c.parent_state.story_bibles,history); d4.commitStoryBibleKnowledgeAdmissionV1(p,{parent_state:c.parent_state,version_ledger:c.version_ledger}); assert.deepStrictEqual(c.parent_state.story_bibles,history); });
pass('X13', () => { const c=context(), p=prepare(c); assert.strictEqual(p.canonical_effect,false); assert.strictEqual(p.content_admission_request.actor_class,'PARENT_SYSTEM'); const r=d4.commitStoryBibleKnowledgeAdmissionV1(p,{parent_state:c.parent_state,version_ledger:c.version_ledger}); assert.strictEqual(r.canonical_effect_authority,'B00_CONTENT_ADMISSION_ONLY'); });
pass('X14', () => { assert.strictEqual(registry.binding_inputs.length,11); assert.strictEqual(d4.AUTHORITY_CLAIMS.b01_registry_modified,false); });
pass('X15', () => { const c=context(), p=policy(), k=mutateKnowledge(knowledge(p),x=>{x.entities[0].reader_state='SURPRISED';}), r=materializationReceipt(k,p); expectCode(()=>prepare(c,draft(c,{calibration_policy:p,knowledge:k,materialization_receipt:r})),'BLOCKED_AUTHORITY_WIDENING'); });
pass('X16', () => { const c=context(), p=policy(), k=mutateKnowledge(knowledge(p),x=>{x.entities[0].focalization='ALICE';}), r=materializationReceipt(k,p); expectCode(()=>prepare(c,draft(c,{calibration_policy:p,knowledge:k,materialization_receipt:r})),'BLOCKED_AUTHORITY_WIDENING'); });
pass('X17', () => { const c=context(), p=policy(), k=mutateKnowledge(knowledge(p),x=>{x.events[0].narrative_function='TURN';}), r=materializationReceipt(k,p); expectCode(()=>prepare(c,draft(c,{calibration_policy:p,knowledge:k,materialization_receipt:r})),'BLOCKED_AUTHORITY_WIDENING'); });
pass('X18', () => { const c=context(); expectCode(()=>prepare(c,mutateDraft(c,x=>{x.whole_book_coherence='PERFECT';})),'BLOCKED_AUTHORITY_WIDENING'); assert.strictEqual(d4.AUTHORITY_CLAIMS.b09_whole_book_authority,false); });
pass('X19', () => { const c=context(), r=d4.commitStoryBibleKnowledgeAdmissionV1(prepare(c),{parent_state:c.parent_state,version_ledger:c.version_ledger}); assert.strictEqual(r.historical_pass_transferred,0); assert.strictEqual(d4.AUTHORITY_CLAIMS.historical_pass_transferred,0); });
pass('X20', () => { const c=context(); expectCode(()=>prepare(c,mutateDraft(c,x=>{x.model_accuracy_claimed=true;})),'BLOCKED_AUTHORITY_WIDENING'); const r=d4.commitStoryBibleKnowledgeAdmissionV1(prepare(c),{parent_state:c.parent_state,version_ledger:c.version_ledger}); assert.strictEqual(r.model_accuracy_claimed,false); });
pass('X21', () => { const c=context(); expectCode(()=>prepare(c,mutateDraft(c,x=>{x.real_book_validation_claimed=true;})),'BLOCKED_AUTHORITY_WIDENING'); const r=d4.commitStoryBibleKnowledgeAdmissionV1(prepare(c),{parent_state:c.parent_state,version_ledger:c.version_ledger}); assert.strictEqual(r.real_book_validation_claimed,false); });
pass('X22', () => { const c=context(); expectCode(()=>prepare(c,mutateDraft(c,x=>{x.source_identity_evidence[0].rights_current=false;})),'BLOCKED_RIGHTS_OR_PRIVATE_AUTHORITY'); expectCode(()=>prepare(c,mutateDraft(c,x=>{x.source_identity_evidence[0].private_authority_current=false;})),'BLOCKED_RIGHTS_OR_PRIVATE_AUTHORITY'); });
pass('X23', () => { const c=context(); expectCode(()=>prepare(c,mutateDraft(c,x=>{x.duplicate_evidence_vote_inflation=true;})),'BLOCKED_AUTHORITY_WIDENING'); });
pass('X24', () => { const c=context(); expectCode(()=>prepare(c,mutateDraft(c,x=>{x.a01_standing='PRODUCTION';})),'BLOCKED_AUTHORITY_WIDENING'); const r=d4.commitStoryBibleKnowledgeAdmissionV1(prepare(c),{parent_state:c.parent_state,version_ledger:c.version_ledger}); assert.strictEqual(r.publication_authority,false); assert.strictEqual(r.production_standing_claimed,false); assert.strictEqual(r.a01_standing_claimed,false); });

assert.strictEqual(cases,40);
process.stdout.write(JSON.stringify({result:'PASS',denominator:'A01-A16+X01-X24',cases,cumulative_b03_cases:108,scope:'B03-D4_GOVERNED_ADMISSION_RUNTIME_QUERY_ONLY',d4_admission_runtime_implemented:true,runtime_queries_implemented:true,b00_atomic_content_admission_composed:true,isolated_b03_108_complete:true,b03_e_cumulative_qualification_claimed:false,b03_freeze_claimed:false,b01_registry_modified:false,historical_pass_transferred:0,model_accuracy_claimed:false,real_book_validation_claimed:false,publication_standing_claimed:false,production_standing_claimed:false})+'\n');
