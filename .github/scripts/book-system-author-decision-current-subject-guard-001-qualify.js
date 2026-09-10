'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const evidenceDir = path.join(process.env.RUNNER_TEMP || root, 'book-rf012-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const guard = require(path.join(root, 'system-master/book-system/author-decision-current-subject-guard.js'));
const vr = require(path.join(root, 'system-master/book-system/version-and-rollback.js'));
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'qualification/book-system/version-and-rollback-001/BOOK-SYSTEM-VERSION-AND-ROLLBACK-001-FIXTURES.json'), 'utf8'));

let checks = 0;
const results = [];
function ok(v, code) { checks += 1; if (!v) throw new Error(code); }
function expectCode(fn, codes, id) {
  checks += 1;
  try { fn(); } catch (e) {
    if (codes.includes(e && e.code)) { results.push({case_id:id, result:'PASS', observed:e.code}); return; }
    throw new Error(`${id}:WRONG_ERROR:${e && e.code}:${e && e.message}`);
  }
  throw new Error(`${id}:EXPECTED_ERROR_NOT_THROWN`);
}
function digest(v) { return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function setup() {
  const initial = vr.createVersionLedger(fixtures.parent_state_template);
  return { parent: initial.parent_state, versionLedger: initial.version_ledger, queueLedger: guard.createQueueLedger(initial.parent_state) };
}
function activeManuscriptRecord(parent) {
  const records = vr.objectRecords(parent).filter(r => r.type === 'MANUSCRIPT_MANIFEST');
  const rec = records.find(r => parent.active.canonical_manuscript_ref === r.object_id || parent.active.canonical_manuscript_ref === `${r.object_id}:${r.object_version}`);
  if (!rec) throw new Error('ACTIVE_MANUSCRIPT_NOT_FOUND');
  return rec;
}
function refOf(rec) { return { object_id:rec.object_id, object_version:String(rec.object_version), object_digest:rec.object_digest }; }
function options() {
  return [
    { option_id:'APPROVE',label:'Approve',effect:'Use direction',consequence_class:'ROUTINE_REVERSIBLE',canonical_decision_status:'APPROVED' },
    { option_id:'REJECT',label:'Reject',effect:'Retain direction',consequence_class:'ROUTINE_REVERSIBLE',canonical_decision_status:'REJECTED' }
  ];
}
function enqueueRequest(s, refs, suffix='1') {
  return {
    enqueue_request_id:`RF012-ENQ-${suffix}`, idempotency_key:`RF012-IDEM-ENQ-${suffix}`, actor_class:'PARENT_SYSTEM',
    expected_parent_state_version:s.parent.state_version, expected_parent_state_digest:s.parent.state_digest,
    expected_queue_ledger_version:s.queueLedger.queue_ledger_version, expected_queue_ledger_digest:guard.digestQueueLedger(s.queueLedger),
    source_authority_kind:'PARENT_DIRECT_AUTHOR_QUERY', source_handoff_refs:['RF012-EVIDENCE'], decision_type:'REVISION_DIRECTION',
    subject_ref:s.parent.active.canonical_manuscript_ref, subject_identity_refs:refs, options:options(), custom_option_allowed:false,
    evidence_refs:['RF012-EVIDENCE'], disagreement_refs:[], consequence_summary:'Synthetic non-private RF012 qualification request.',
    confirmation_policy:'NONE', created_at:'2026-09-10T10:15:00Z'
  };
}
function actionRequest(s, snap, suffix='1') {
  return {
    queue_action_request_id:`RF012-ACTION-${suffix}`, idempotency_key:`RF012-IDEM-ACTION-${suffix}`, actor_class:'PARENT_SYSTEM',
    expected_parent_state_version:s.parent.state_version, expected_parent_state_digest:s.parent.state_digest,
    expected_queue_ledger_version:s.queueLedger.queue_ledger_version, expected_queue_ledger_digest:guard.digestQueueLedger(s.queueLedger),
    decision_request_id:snap.decision_request_id, created_at:'2026-09-10T10:16:00Z'
  };
}
function resolutionRequest(s, snap, suffix='1') {
  const opt=snap.options[0];
  return {
    resolution_request_id:`RF012-RES-${suffix}`, idempotency_key:`RF012-IDEM-RES-${suffix}`, author_actor_ref:'SYNTHETIC-AUTHOR-SESSION', author_authority_proof_ref:'SYNTHETIC-QUALIFIER-PROOF',
    expected_parent_state_version:s.parent.state_version, expected_parent_state_digest:s.parent.state_digest,
    expected_queue_ledger_version:s.queueLedger.queue_ledger_version, expected_queue_ledger_digest:guard.digestQueueLedger(s.queueLedger),
    decision_request_id:snap.decision_request_id, expected_decision_request_version:snap.decision_request_version,
    expected_decision_request_digest:guard.digestDecisionRequest(snap), selected_option_id:opt.option_id, custom_author_choice:null,
    confirmation_evidence:null, rationale_optional:null, resolved_at:'2026-09-10T10:17:00Z'
  };
}
function revalidationRequest(s, suffix='1') {
  return {
    revalidation_request_id:`RF012-REVAL-${suffix}`, idempotency_key:`RF012-IDEM-REVAL-${suffix}`, actor_class:'PARENT_SYSTEM',
    expected_queue_ledger_version:s.queueLedger.queue_ledger_version, expected_queue_ledger_digest:guard.digestQueueLedger(s.queueLedger),
    revalidation_evidence_refs:['RF012-REVALIDATION'], revalidated_at:'2026-09-10T10:18:00Z'
  };
}
function parentWithNewActiveManuscript(parent) {
  const next=clone(parent); delete next.state_digest; next.state_version=parent.state_version+1;
  const old=activeManuscriptRecord(parent);
  next.manuscripts.push({ manuscript_id:old.object_id, version_id:'V-RF012-NEXT', artifact_digest:'b'.repeat(64), authority_state:'CANONICAL', parent_version_ref:`${old.object_id}:${old.object_version}`, change_set_ref:'RF012-CHANGE', created_by:'BOOK_SYSTEM_PARENT', created_at:'2026-09-10T10:19:00Z' });
  next.active.canonical_manuscript_ref=`${old.object_id}:V-RF012-NEXT`;
  return vr.sealState(next);
}
function parentSuccessorSameActive(parent) {
  const next=clone(parent); delete next.state_digest; next.state_version=parent.state_version+1;
  return vr.sealState(next);
}

{
  const s=setup(), ref=refOf(activeManuscriptRecord(s.parent));
  ok(guard.strictSubjectCurrent(s.parent,[ref])===true,'RF012-001_CURRENT_NOT_ACCEPTED');
  results.push({case_id:'RF012-001',result:'PASS'});
}
{
  const s=setup(), oldRef=refOf(activeManuscriptRecord(s.parent)), next=parentWithNewActiveManuscript(s.parent);
  ok(guard.strictSubjectCurrent(next,[oldRef])===false,'RF012-002_OLD_VERSION_ACCEPTED');
  expectCode(()=>guard.assertStrictSubjectCurrent(next,[oldRef]),['AUTHOR_DECISION_SUBJECT_NOT_CURRENT'],'RF012-002');
}
{
  const s=setup(), ref=refOf(activeManuscriptRecord(s.parent)); ref.object_digest='c'.repeat(64);
  expectCode(()=>guard.assertStrictSubjectCurrent(s.parent,[ref]),['SUBJECT_IDENTITY_NOT_CURRENT','AUTHOR_DECISION_SUBJECT_NOT_CURRENT'],'RF012-003');
}
{
  const s=setup(), a=refOf(activeManuscriptRecord(s.parent)), b={...a,object_digest:'d'.repeat(64)};
  ok(guard.strictSubjectCurrent(s.parent,[a])===true,'RF012-004_A_NOT_CURRENT');
  expectCode(()=>guard.assertStrictSubjectCurrent(s.parent,[b]),['SUBJECT_IDENTITY_NOT_CURRENT','AUTHOR_DECISION_SUBJECT_NOT_CURRENT'],'RF012-004');
}

let staleScenario;
{
  let s=setup(); const oldRef=refOf(activeManuscriptRecord(s.parent));
  const enq=guard.enqueueDecision({parentState:s.parent,queueLedger:s.queueLedger,request:enqueueRequest(s,[oldRef],'5')});
  s.queueLedger=enq.queue_ledger; const nextParent=parentWithNewActiveManuscript(s.parent);
  const out=guard.revalidateAgainstParent({previousParentState:s.parent,currentParentState:nextParent,queueLedger:s.queueLedger,request:revalidationRequest(s,'5')});
  ok(out.strict_stale_request_ids.includes(enq.decision_request.decision_request_id),'RF012-005_NOT_STRICT_STALE');
  ok(guard.effectiveDecisionState(out.queue_ledger,enq.decision_request.decision_request_id)==='STALE','RF012-005_EFFECTIVE_STATE_NOT_STALE');
  results.push({case_id:'RF012-005',result:'PASS'});
  staleScenario={parent:nextParent,versionLedger:s.versionLedger,queueLedger:out.queue_ledger,decisionRequest:enq.decision_request};
}
{
  const s=staleScenario;
  expectCode(()=>guard.resolveDecision({parentState:s.parent,versionLedger:s.versionLedger,queueLedger:s.queueLedger,request:resolutionRequest(s,s.decisionRequest,'6')}),['AUTHOR_DECISION_SUBJECT_NOT_CURRENT'],'RF012-006');
}
{
  const s=setup(), ref=refOf(activeManuscriptRecord(s.parent)), before=digest(s.parent);
  expectCode(()=>guard.assertStrictSubjectCurrent(s.parent,[]),['SUBJECT_IDENTITY_REFS_REQUIRED'],'RF012-007A');
  expectCode(()=>guard.assertStrictSubjectCurrent(s.parent,[ref,clone(ref)]),['DUPLICATE_SUBJECT_IDENTITY_REF'],'RF012-007B');
  expectCode(()=>guard.assertStrictSubjectCurrent(s.parent,[{...ref,object_digest:'not-a-digest'}]),['INVALID_SUBJECT_IDENTITY_REF'],'RF012-007C');
  ok(digest(s.parent)===before,'RF012-007_PARENT_MUTATED');
  results.push({case_id:'RF012-007',result:'PASS'});
}
{
  const s=setup(); const item=s.parent.research_evidence_links[0];
  const ref={object_id:item.link_id,object_version:'UNVERSIONED',object_digest:vr.digest(item)};
  ok(guard.strictSubjectCurrent(s.parent,[ref])===true,'RF012-008_APPEND_ONLY_REJECTED');
  results.push({case_id:'RF012-008',result:'PASS'});
}
{
  let s=setup(); const oldRef=refOf(activeManuscriptRecord(s.parent));
  const enq=guard.enqueueDecision({parentState:s.parent,queueLedger:s.queueLedger,request:enqueueRequest(s,[oldRef],'9')});
  s.queueLedger=enq.queue_ledger; const nextParent=parentWithNewActiveManuscript(s.parent); const qBefore=digest(s.queueLedger);
  expectCode(()=>guard.presentDecision({parentState:nextParent,queueLedger:s.queueLedger,request:actionRequest({...s,parent:nextParent},enq.decision_request,'9P')}),['AUTHOR_DECISION_SUBJECT_NOT_CURRENT'],'RF012-009-PRESENT');
  expectCode(()=>guard.reopenDecision({parentState:nextParent,queueLedger:s.queueLedger,request:actionRequest({...s,parent:nextParent},enq.decision_request,'9R')}),['AUTHOR_DECISION_SUBJECT_NOT_CURRENT'],'RF012-009-REOPEN');
  ok(digest(s.queueLedger)===qBefore,'RF012-009_QUEUE_MUTATED');
  results.push({case_id:'RF012-009',result:'PASS'});
}
{
  let s=setup(); const ref=refOf(activeManuscriptRecord(s.parent));
  const enq=guard.enqueueDecision({parentState:s.parent,queueLedger:s.queueLedger,request:enqueueRequest(s,[ref],'10')}); s.queueLedger=enq.queue_ledger;
  const parent1=parentSuccessorSameActive(s.parent);
  const first=guard.revalidateAgainstParent({previousParentState:s.parent,currentParentState:parent1,queueLedger:s.queueLedger,request:revalidationRequest(s,'10A')});
  ok(first.strict_stale_request_ids.length===0,'RF012-010_FALSE_STALE_FIRST');
  s={...s,parent:parent1,queueLedger:first.queue_ledger};
  const parent2=parentSuccessorSameActive(parent1);
  const second=guard.revalidateAgainstParent({previousParentState:parent1,currentParentState:parent2,queueLedger:s.queueLedger,request:revalidationRequest(s,'10B')});
  ok(second.strict_stale_request_ids.length===0,'RF012-010_FALSE_STALE_SECOND');
  const currentId=second.queue_ledger.current_request_index[enq.decision_request.decision_family_id];
  ok(guard.effectiveDecisionState(second.queue_ledger,currentId)!=='STALE','RF012-010_EFFECTIVE_FALSE_STALE');
  results.push({case_id:'RF012-010',result:'PASS'});
}

const uniquePlanCases=new Set(results.map(x=>{const m=/^RF012-(\d{3})/.exec(x.case_id);return m?`RF012-${m[1]}`:x.case_id;}));
const summary={
  qualification_id:'BOOK-SYSTEM-AUTHOR-DECISION-CURRENT-SUBJECT-GUARD-001-DETERMINISTIC-QUALIFIER-002',
  result_class: uniquePlanCases.size===10 ? 'PASS' : 'FAIL',
  planned_case_count:10,
  passed_plan_cases:uniquePlanCases.size,
  assertions:checks,
  subject_sha:process.env.GITHUB_SHA || 'LOCAL',
  fixture_class:'SYNTHETIC_NON_PRIVATE',
  author_decision_observed_or_created:false,
  private_manuscript_or_development_gold_used:false,
  a01_pass_claimed:false,
  native_or_production_claimed:false,
  results
};
fs.writeFileSync(path.join(evidenceDir,'qualification-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
if(summary.result_class!=='PASS') process.exit(1);
