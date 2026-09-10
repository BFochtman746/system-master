'use strict';

const fs = require('fs');
const path = require('path');
const root = process.env.GITHUB_WORKSPACE || process.cwd();
const vr = require(path.join(root, 'system-master/book-system/version-and-rollback.js'));
const queue = require(path.join(root, 'system-master/book-system/author-decision-current-subject-guard.js'));
const admission = require(path.join(root, 'system-master/book-system/content-object-admission-core.js'));
const applicability = require(path.join(root, 'system-master/book-system/content-admission-author-decision-applicability-guard.js'));
const evidenceDir = path.join(process.env.RUNNER_TEMP || root, 'book-content-admission-applicability-evidence');
fs.mkdirSync(evidenceDir, {recursive:true});

let assertions = 0;
const results = [];
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function sha(ch) { return String(ch).repeat(64); }
function subject(ch) { return String(ch).repeat(40); }
function stable(v) { return vr.stableStringify(v); }
function ok(v, code) { assertions += 1; if (!v) { const e = new Error(code); e.code = code; throw e; } }
function run(id, fn) {
  try { fn(); results.push({case_id:id,result:'PASS'}); }
  catch (e) { results.push({case_id:id,result:'FAIL',observed_code:e&&e.code||null,detail:e&&e.message||String(e)}); }
}
function expectCode(id, expected, fn) {
  run(id, () => {
    let observed = null;
    try { fn(); } catch (e) { observed = e && e.code; }
    ok(expected.includes(observed), `${id}:EXPECTED_${expected.join('_OR_')}_GOT_${observed||'NO_ERROR'}`);
  });
}

function baseState() {
  return vr.sealState({
    schema_version:1,
    state_version:1,
    book_project:{book_project_id:'BOOK-PROJECT-APP-001',book_id:'BOOK-APP-001',status:'DRAFTING',governing_brief_ref:'BRIEF-001:V1',canonical_manifest_ref:'CANON-001:V1'},
    governing_briefs:[{brief_id:'BRIEF-001',version:'V1',author_intent:'test intent',form:'book',genre:'fiction',audience:'adult',voice_goals:[],hard_constraints:[]}],
    canon_manifests:[{canon_manifest_id:'CANON-001',version:'V1',facts:[],entities:[],world_rules:[],protected_language_refs:[],intent_constraints:[],approval_state:'APPROVED'}],
    story_bibles:[{story_bible_id:'BIBLE-001',version:'V1',entity_refs:[],relationship_refs:[],timeline_refs:[],arc_refs:[],motif_theme_refs:[],open_questions:[],provenance:[]}],
    book_plans:[{plan_id:'PLAN-001',version:'V1',part_refs:[],chapter_refs:[],scene_refs:[],dependency_edges:[],purpose_and_payoff_refs:[]}],
    manuscripts:[{manuscript_id:'MANUSCRIPT-001',version_id:'V1',artifact_digest:sha('a'),authority_state:'CANONICAL',parent_version_ref:null,change_set_ref:'INITIAL',created_by:'BOOK_SYSTEM_PARENT',created_at:'2026-09-10T14:00:00Z'}],
    research_evidence_links:[],
    author_decisions:[],
    integration_proposals:[],
    export_releases:[],
    active:{governing_brief_ref:'BRIEF-001:V1',canon_manifest_ref:'CANON-001:V1',story_bible_ref:'BIBLE-001:V1',book_plan_ref:'PLAN-001:V1',canonical_manuscript_ref:'MANUSCRIPT-001:V1'}
  });
}
function activeRecord(parent, type) {
  const records = vr.objectRecords(parent).filter(r => r.type === type);
  const pointer = type === 'MANUSCRIPT_MANIFEST' ? 'canonical_manuscript_ref' : type === 'STORY_BIBLE' ? 'story_bible_ref' : null;
  const active = parent.active[pointer];
  return records.find(r => active === r.object_id || active === `${r.object_id}:${r.object_version}`);
}
function refOf(record) { return {object_id:record.object_id,object_version:String(record.object_version),object_digest:record.object_digest}; }
function queueOptions() {
  return [
    {option_id:'APPROVE',label:'Approve',effect:'Permit the bounded admission action',consequence_class:'ROUTINE_REVERSIBLE',canonical_decision_status:'APPROVED'},
    {option_id:'REJECT',label:'Reject',effect:'Do not permit the bounded admission action',consequence_class:'ROUTINE_REVERSIBLE',canonical_decision_status:'REJECTED'}
  ];
}
function resolveAuthorDecision() {
  const initial = vr.createVersionLedger(baseState());
  let parent = initial.parent_state;
  let versionLedger = initial.version_ledger;
  let queueLedger = queue.createQueueLedger(parent);
  const manuscriptRef = refOf(activeRecord(parent,'MANUSCRIPT_MANIFEST'));
  const enqueueRequest = {
    enqueue_request_id:'APP-GUARD-ENQ-001',idempotency_key:'APP-GUARD-ENQ-IDEM-001',actor_class:'PARENT_SYSTEM',
    expected_parent_state_version:parent.state_version,expected_parent_state_digest:parent.state_digest,
    expected_queue_ledger_version:queueLedger.queue_ledger_version,expected_queue_ledger_digest:queue.digestQueueLedger(queueLedger),
    source_authority_kind:'PARENT_DIRECT_AUTHOR_QUERY',source_handoff_refs:['APP-GUARD-TEST'],decision_type:'ADMISSION',subject_ref:parent.active.canonical_manuscript_ref,
    subject_identity_refs:[manuscriptRef],options:queueOptions(),custom_option_allowed:false,evidence_refs:['APP-GUARD-SYNTHETIC-EVIDENCE'],disagreement_refs:[],
    consequence_summary:'Synthetic author decision for applicability-guard qualification.',confirmation_policy:'NONE',created_at:'2026-09-10T14:01:00Z'
  };
  const enq = queue.enqueueDecision({parentState:parent,queueLedger,request:enqueueRequest});
  queueLedger = enq.queue_ledger;
  const snap = enq.decision_request;
  const resolutionRequest = {
    resolution_request_id:'APP-GUARD-RES-001',idempotency_key:'APP-GUARD-RES-IDEM-001',author_actor_ref:'SYNTHETIC-AUTHOR-ACTOR',author_authority_proof_ref:'SYNTHETIC-AUTHOR-PROOF',
    expected_parent_state_version:parent.state_version,expected_parent_state_digest:parent.state_digest,
    expected_queue_ledger_version:queueLedger.queue_ledger_version,expected_queue_ledger_digest:queue.digestQueueLedger(queueLedger),
    decision_request_id:snap.decision_request_id,expected_decision_request_version:snap.decision_request_version,expected_decision_request_digest:queue.digestDecisionRequest(snap),
    selected_option_id:'APPROVE',custom_author_choice:null,confirmation_evidence:null,rationale_optional:'Synthetic qualification only.',resolved_at:'2026-09-10T14:02:00Z'
  };
  const resolved = queue.resolveDecision({parentState:parent,versionLedger,queueLedger,request:resolutionRequest});
  return {
    parent_state:resolved.parent_state,
    version_ledger:resolved.version_ledger,
    queue_ledger:resolved.queue_ledger,
    author_decision:resolved.author_decision,
    resolution_receipt:resolved.resolution_receipt,
    manuscript_ref:manuscriptRef
  };
}
function chapterOperation(ch='b') {
  return {
    operation_type:'REGISTER_CONTENT_UNIT_VERSION',unit_type:'CHAPTER',book_project_id:'BOOK-PROJECT-APP-001',stable_unit_id:'CH-APP-001',version_id:'V1',
    content_digest_sha256:sha(ch),parent_version_ref:null,parent_object_ref:'BOOK_PROJECT:BOOK-PROJECT-APP-001',ordinal:1,
    provenance_ref:`APP-PROV-${ch}`,source_subject_sha:subject(ch),source_current:true,created_by:'BOOK_SYSTEM_PARENT',created_at:'2026-09-10T14:03:00Z',requires_author_decision:true
  };
}
function admissionRequest(ctx, operation) {
  return {
    mutation_id:'APP-GUARD-ADMISSION-001',actor_class:'PARENT_SYSTEM',expected_state_version:ctx.parent_state.state_version,expected_state_digest:ctx.parent_state.state_digest,
    operations:[operation],evidence_refs:['APP-GUARD-SYNTHETIC-EVIDENCE'],author_decision_refs:[ctx.author_decision.decision_id]
  };
}
function binding(ctx, operation, patch={}) {
  return {
    operation_index:0,
    operation_fingerprint:queue.digest(operation),
    author_decision_ref:ctx.author_decision.decision_id,
    resolution_receipt_id:ctx.resolution_receipt.receipt_id,
    required_subject_identity_refs:clone(ctx.manuscript_ref ? [ctx.manuscript_ref] : []),
    ...clone(patch)
  };
}
function guarded(ctx, request, bindings, queueLedger=ctx.queue_ledger) {
  return applicability.commitContentAdmissionWithAuthorDecisionApplicability({parentState:ctx.parent_state,versionLedger:ctx.version_ledger,queueLedger,request,applicabilityBindings:bindings});
}
function storyBibleRef(parent) { return refOf(activeRecord(parent,'STORY_BIBLE')); }
function advanceManuscript(ctx) {
  const payload={manuscript_id:'MANUSCRIPT-001',version_id:'V2',artifact_digest:sha('e'),authority_state:'CANONICAL',parent_version_ref:'MANUSCRIPT-001:V1',change_set_ref:'APP-GUARD-ADVANCE',created_by:'BOOK_SYSTEM_PARENT',created_at:'2026-09-10T14:04:00Z'};
  const op={operation_type:'REGISTER_CONTENT_OBJECT_VERSION',object_type:'MANUSCRIPT_MANIFEST',object_id:'MANUSCRIPT-001',version_id:'V2',content_digest_sha256:sha('e'),parent_version_ref:'MANUSCRIPT-001:V1',provenance_ref:'APP-GUARD-ADVANCE-PROV',source_subject_sha:subject('e'),source_current:true,created_by:'BOOK_SYSTEM_PARENT',created_at:'2026-09-10T14:04:00Z',payload};
  const activate={operation_type:'SET_ACTIVE_CONTENT_OBJECT_VERSION',object_type:'MANUSCRIPT_MANIFEST',object_ref:'MANUSCRIPT-001:V2'};
  const request={mutation_id:'APP-GUARD-ADVANCE-MANUSCRIPT',actor_class:'PARENT_SYSTEM',expected_state_version:ctx.parent_state.state_version,expected_state_digest:ctx.parent_state.state_digest,operations:[op,activate],evidence_refs:['APP-GUARD-ADVANCE'],author_decision_refs:[]};
  const changed=admission.commitContentAdmission({parentState:ctx.parent_state,versionLedger:ctx.version_ledger,request});
  const revalidationRequest={revalidation_request_id:'APP-GUARD-REVAL-001',idempotency_key:'APP-GUARD-REVAL-IDEM-001',actor_class:'PARENT_SYSTEM',expected_queue_ledger_version:ctx.queue_ledger.queue_ledger_version,expected_queue_ledger_digest:queue.digestQueueLedger(ctx.queue_ledger),revalidation_evidence_refs:['APP-GUARD-MANUSCRIPT-SUCCESSOR'],revalidated_at:'2026-09-10T14:05:00Z'};
  const q=queue.revalidateAgainstParent({previousParentState:ctx.parent_state,currentParentState:changed.parent_state,queueLedger:ctx.queue_ledger,request:revalidationRequest});
  return {...ctx,parent_state:changed.parent_state,version_ledger:changed.version_ledger,queue_ledger:q.queue_ledger};
}

run('RF012_SAME_EXACT_SUBJECT_RECEIPT_PASSES_PRECONDITION',()=>{
  const ctx=resolveAuthorDecision(), op=chapterOperation(), request=admissionRequest(ctx,op), out=guarded(ctx,request,[binding(ctx,op)]);
  ok(out.parent_state.content_unit_versions.length===1,'CHAPTER_NOT_ADMITTED');
  ok(out.applicability_receipt.verified_binding_count===1,'BINDING_NOT_VERIFIED');
  ok(out.applicability_receipt.guard_id===applicability.GUARD_ID,'WRONG_GUARD');
});

expectCode('RF012_A_APPROVAL_REPLAYED_FOR_B_REJECTS',['RESOLUTION_RECEIPT_SUBJECT_IDENTITY_MISMATCH'],()=>{
  const ctx=resolveAuthorDecision(),op=chapterOperation(),request=admissionRequest(ctx,op);
  guarded(ctx,request,[binding(ctx,op,{required_subject_identity_refs:[storyBibleRef(ctx.parent_state)]})]);
});

expectCode('MISSING_APPLICABILITY_BINDING_FAILS_CLOSED',['APPLICABILITY_BINDING_REQUIRED'],()=>{
  const ctx=resolveAuthorDecision(),op=chapterOperation(),request=admissionRequest(ctx,op); guarded(ctx,request,[]);
});

expectCode('MISSING_RESOLUTION_RECEIPT_FAILS_CLOSED',['RESOLUTION_RECEIPT_MISSING'],()=>{
  const ctx=resolveAuthorDecision(),op=chapterOperation(),request=admissionRequest(ctx,op),ql=clone(ctx.queue_ledger); delete ql.resolution_receipts[ctx.resolution_receipt.receipt_id];
  guarded(ctx,request,[binding(ctx,op)],ql);
});

expectCode('RECEIPT_DECISION_ID_MISMATCH_FAILS_CLOSED',['RESOLUTION_RECEIPT_DECISION_ID_MISMATCH'],()=>{
  const ctx=resolveAuthorDecision(),op=chapterOperation(),request=admissionRequest(ctx,op),ql=clone(ctx.queue_ledger); ql.resolution_receipts[ctx.resolution_receipt.receipt_id].decision_id='AUTHORDECISION-OTHER';
  guarded(ctx,request,[binding(ctx,op)],ql);
});

expectCode('RECEIPT_SUBJECT_IDENTITY_MISMATCH_FAILS_CLOSED',['RESOLUTION_RECEIPT_SUBJECT_IDENTITY_MISMATCH'],()=>{
  const ctx=resolveAuthorDecision(),op=chapterOperation(),request=admissionRequest(ctx,op); guarded(ctx,request,[binding(ctx,op,{required_subject_identity_refs:[storyBibleRef(ctx.parent_state)]})]);
});

expectCode('STALE_GOVERNED_SUBJECT_FAILS_CLOSED',['AUTHOR_DECISION_SUBJECT_NOT_CURRENT'],()=>{
  let ctx=resolveAuthorDecision(); ctx=advanceManuscript(ctx); const op=chapterOperation(),request=admissionRequest(ctx,op); guarded(ctx,request,[binding(ctx,op)]);
});

expectCode('CANONICAL_DECISION_APPROVED_BUT_QUEUE_EVIDENCE_MISSING_FAILS_CLOSED',['AUTHOR_DECISION_QUEUE_EVIDENCE_REQUIRED'],()=>{
  const ctx=resolveAuthorDecision(),op=chapterOperation(),request=admissionRequest(ctx,op);
  applicability.commitContentAdmissionWithAuthorDecisionApplicability({parentState:ctx.parent_state,versionLedger:ctx.version_ledger,queueLedger:null,request,applicabilityBindings:[binding(ctx,op)]});
});

run('FAILED_APPLICABILITY_ZERO_PARENT_MUTATION_ZERO_SUCCESS_RECEIPT',()=>{
  const ctx=resolveAuthorDecision(),op=chapterOperation(),request=admissionRequest(ctx,op),beforeParent=stable(ctx.parent_state),beforeLedger=stable(ctx.version_ledger);
  let returned=null,code=null;
  try { returned=guarded(ctx,request,[]); } catch(e) { code=e&&e.code; }
  ok(code==='APPLICABILITY_BINDING_REQUIRED','WRONG_FAILURE_CODE');
  ok(returned===null,'SUCCESS_RESULT_RETURNED');
  ok(stable(ctx.parent_state)===beforeParent,'PARENT_MUTATED_ON_FAILED_APPLICABILITY');
  ok(stable(ctx.version_ledger)===beforeLedger,'VERSION_LEDGER_MUTATED_ON_FAILED_APPLICABILITY');
});

// Extra narrowing checks: operation binding is identity-bound and extra unbound author refs are rejected.
expectCode('OPERATION_FINGERPRINT_MISMATCH_FAILS_CLOSED',['APPLICABILITY_BINDING_OPERATION_FINGERPRINT_MISMATCH'],()=>{
  const ctx=resolveAuthorDecision(),op=chapterOperation(),request=admissionRequest(ctx,op); guarded(ctx,request,[binding(ctx,op,{operation_fingerprint:sha('9')})]);
});
expectCode('UNBOUND_AUTHOR_DECISION_REF_SET_FAILS_CLOSED',['AUTHOR_DECISION_REF_BINDING_SET_MISMATCH'],()=>{
  const ctx=resolveAuthorDecision(),op=chapterOperation(),request=admissionRequest(ctx,op); request.author_decision_refs.push('UNRELATED-DECISION'); guarded(ctx,request,[binding(ctx,op)]);
});

const requiredIds=[
  'RF012_SAME_EXACT_SUBJECT_RECEIPT_PASSES_PRECONDITION','RF012_A_APPROVAL_REPLAYED_FOR_B_REJECTS','MISSING_APPLICABILITY_BINDING_FAILS_CLOSED','MISSING_RESOLUTION_RECEIPT_FAILS_CLOSED','RECEIPT_DECISION_ID_MISMATCH_FAILS_CLOSED','RECEIPT_SUBJECT_IDENTITY_MISMATCH_FAILS_CLOSED','STALE_GOVERNED_SUBJECT_FAILS_CLOSED','CANONICAL_DECISION_APPROVED_BUT_QUEUE_EVIDENCE_MISSING_FAILS_CLOSED','FAILED_APPLICABILITY_ZERO_PARENT_MUTATION_ZERO_SUCCESS_RECEIPT'
];
const requiredResults=requiredIds.map(id=>results.find(r=>r.case_id===id));
const failed=results.filter(r=>r.result!=='PASS');
const summary={
  qualification_id:'BOOK-SYSTEM-CONTENT-ADMISSION-AUTHOR-DECISION-APPLICABILITY-GUARD-004-DETERMINISTIC-QUALIFIER-001',
  guard_id:applicability.GUARD_ID,
  result_class:requiredResults.every(r=>r&&r.result==='PASS')&&failed.length===0?'PASS':'FAIL',
  required_adversarial_cases:requiredIds.length,
  required_cases_passed:requiredResults.filter(r=>r&&r.result==='PASS').length,
  total_cases:results.length,
  total_passed:results.filter(r=>r.result==='PASS').length,
  assertions,
  subject_sha:process.env.GITHUB_SHA||'LOCAL',
  fixture_class:'SYNTHETIC_NON_PRIVATE',
  base_content_admission_modified:false,
  canonical_author_decision_schema_modified:false,
  author_choice_synthesized:false,
  a01_pass_claimed:false,
  lifecycle_or_publication_authority_claimed:false,
  prose_or_document_authority_claimed:false,
  native_or_production_claimed:false,
  results
};
fs.writeFileSync(path.join(evidenceDir,'qualification-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
if(summary.result_class!=='PASS') process.exit(1);
