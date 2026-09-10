'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const stateModel = require('../../system-master/book-system/book-workflow-state-model');
const routing = require('../../system-master/book-system/book-capability-routing-interface');
const planRuntime = require('../../system-master/book-system/book-workflow-execution-plan');
const retry = require('../../system-master/book-system/book-workflow-retry-idempotency-rules');
const evidence = require('../../system-master/book-system/book-workflow-evidence-provenance');

const results = [];
function h(v) { return crypto.createHash('sha256').update(String(v), 'utf8').digest('hex'); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function pass(case_id, extra = {}) { results.push({ case_id, result: 'PASS', ...extra }); }
function expectError(case_id, fn, code) {
  try { fn(); throw new Error(`EXPECTED_ERROR_NOT_THROWN:${code}`); }
  catch (err) {
    if (err.message === `EXPECTED_ERROR_NOT_THROWN:${code}`) throw err;
    if (code && err.code !== code) throw new Error(`${case_id}:EXPECTED_${code}:GOT_${err.code || err.message}`);
    pass(case_id, { observed: err.code || err.message });
  }
}
function source() {
  return {
    book_state_version: 21,
    book_state_digest: h('book-state-21'),
    canonical_manuscript_ref: 'MANUSCRIPT-CANONICAL-001',
    manuscript_version_id: 'MANUSCRIPT-V021',
    manuscript_digest_sha256: h('manuscript-v21')
  };
}
function task(id, cls, cap, domain, deps = [], opts = {}) {
  return {
    task_id: id,
    task_class: cls,
    capability_id: cap,
    required_authority_domain: domain,
    authority_wait_owner: opts.authority_wait_owner === undefined ? null : opts.authority_wait_owner,
    required_dependency_ids: deps,
    optional_dependency_ids: opts.optional_dependency_ids || [],
    input_ref_hashes: { source: h(`input:${id}`) },
    context_package_refs: opts.context_package_refs || [],
    required_for_plan_success: opts.required_for_plan_success === undefined ? true : opts.required_for_plan_success
  };
}
function makeWorkflow(id, tasks) {
  let w = stateModel.createWorkflowState({
    workflow_id: id,
    book_project_id: 'BOOK-PROJECT-001',
    objective: 'Emit bounded evidence and provenance without canonical effect.',
    target_section_ref: 'chapter-21:scene-2',
    source_identity: source(),
    input_hashes: { objective: h(`objective:${id}`) },
    created_at: '2026-09-10T16:45:00-04:00'
  });
  const statuses = Object.fromEntries(tasks.map(t => [t.task_id, 'PLANNED']));
  w = stateModel.advanceWorkflowState(w, { workflow_status: 'PLANNING', planned_task_refs: tasks.map(t => t.task_id), task_statuses: statuses });
  return w;
}
function makePlan(id, w, tasks) {
  return planRuntime.createExecutionPlan({
    plan_id: id,
    book_project_id: w.book_project_id,
    objective_ref: `OBJ-${id}`,
    objective_hash_sha256: h(`plan-objective:${id}`),
    tasks,
    created_at: '2026-09-10T16:45:30-04:00'
  }, w, routing.loadDefaultRegistry());
}
function providerIdentity(taskObj) {
  const cap = routing.resolveCallableCapability({ capability_id: taskObj.capability_id, required_authority_domain: taskObj.required_authority_domain });
  return {
    service_id: cap.service_id,
    operation_id: cap.operation_id,
    provider_subject_sha: '1234567890abcdef1234567890abcdef12345678',
    implementation_or_artifact_id: `PROVIDER-${taskObj.task_id}`
  };
}
function providerReceiptInput(receiptId, seq, w, p, taskObj, parents = [], extra = {}) {
  return {
    receipt_id: receiptId,
    receipt_class: extra.receipt_class || 'TASK_RESULT_OBSERVED',
    sequence_number: seq,
    workflow_state: w,
    plan: p,
    current_source_identity: clone(w.source_identity),
    task_id: taskObj.task_id,
    provider_identity: providerIdentity(taskObj),
    operation_identity: retry.buildOperationIdentity(p, w, taskObj.task_id),
    output_refs: extra.output_refs || [`OUTPUT-${taskObj.task_id}`],
    evidence_refs: extra.evidence_refs || [`EVIDENCE-${taskObj.task_id}`],
    decision_refs: extra.decision_refs || [],
    parent_receipt_digests: parents,
    emitted_at: extra.emitted_at || '2026-09-10T16:46:00-04:00'
  };
}
function reseal(r) { r.receipt_digest = evidence.receiptDigest(r); return r; }

const proseTask = task('T-PROSE','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS');
const proseW = makeWorkflow('WF-2I-PROSE',[proseTask]);
const prosePlan = makePlan('PLAN-2I-PROSE',proseW,[proseTask]);
const proseInput = providerReceiptInput('R-PROSE-1',1,proseW,prosePlan,proseTask);
const proseR1 = evidence.createReceipt(proseInput);
const proseR1Again = evidence.createReceipt(proseInput);
if (proseR1.receipt_digest !== proseR1Again.receipt_digest) throw new Error('RECEIPT_NOT_DETERMINISTIC');
pass('OEP2I-001-DETERMINISTIC-RECEIPT-DIGEST');
if (proseR1.workflow_digest !== proseW.workflow_digest || proseR1.plan_digest !== prosePlan.plan_digest || JSON.stringify(proseR1.source_identity) !== JSON.stringify(proseW.source_identity)) throw new Error('EXACT_BINDING_MISSING');
pass('OEP2I-002-EXACT-WORKFLOW-PLAN-SOURCE-BINDING');
if (proseR1.capability_id !== proseTask.capability_id || proseR1.authority_domain !== proseTask.required_authority_domain) throw new Error('TASK_AUTHORITY_BINDING_MISSING');
pass('OEP2I-003-TASK-CAPABILITY-AUTHORITY-BINDING');
if (proseR1.provider_identity.service_id !== 'PROSE_ANALYSIS_AND_REVISION' || proseR1.provider_identity.operation_id !== 'ANALYZE_PASSAGE_OR_UNIT') throw new Error('PROVIDER_BINDING_WRONG');
pass('OEP2I-004-PROVIDER-SERVICE-OPERATION-BINDING');
if (proseR1.canonical_effect_allowed !== false) throw new Error('PROSE_SUCCESS_GAINED_CANONICAL_EFFECT');
pass('OEP2I-005-PROSE-SUCCESS-REMAINS-EVIDENCE-ONLY');

const researchTask = task('T-RESEARCH','SPECIALIST_SERVICE_TASK','RESEARCH.ACQUIRE_BOUNDED_EVIDENCE','EXTERNAL_EVIDENCE_TRUTH');
const researchW = makeWorkflow('WF-2I-RESEARCH',[researchTask]);
const researchPlan = makePlan('PLAN-2I-RESEARCH',researchW,[researchTask]);
const researchReceipt = evidence.createReceipt(providerReceiptInput('R-RESEARCH-1',1,researchW,researchPlan,researchTask));
if (researchReceipt.authority_domain !== 'EXTERNAL_EVIDENCE_TRUTH' || researchReceipt.canonical_effect_allowed !== false) throw new Error('RESEARCH_PROMOTED_TO_CANON');
pass('OEP2I-006-RESEARCH-EVIDENCE-DOES-NOT-BECOME-CANON');

const staleW = clone(proseW); staleW.workflow_digest = h('stale-workflow');
expectError('OEP2I-007-STALE-WORKFLOW-REJECTED', () => evidence.validateReceipt(proseR1, staleW, prosePlan), 'WORKFLOW_DIGEST_MISMATCH');
const badPlan = clone(prosePlan); badPlan.plan_digest = h('bad-plan');
expectError('OEP2I-008-TAMPERED-PLAN-REJECTED', () => evidence.validateReceipt(proseR1, proseW, badPlan), 'PLAN_DIGEST_MISMATCH');
const badSourceReceipt = clone(proseR1); badSourceReceipt.source_identity.manuscript_digest_sha256 = h('other-manuscript'); reseal(badSourceReceipt);
expectError('OEP2I-009-RECEIPT-SOURCE-MISMATCH-REJECTED', () => evidence.validateReceipt(badSourceReceipt, proseW, prosePlan), 'RECEIPT_SOURCE_BINDING_MISMATCH');
const badCap = clone(proseR1); badCap.capability_id = 'PROSE.DIAGNOSE'; reseal(badCap);
expectError('OEP2I-010-TASK-CAPABILITY-TAMPER-REJECTED', () => evidence.validateReceipt(badCap, proseW, prosePlan), 'RECEIPT_TASK_AUTHORITY_BINDING_MISMATCH');
const badDomain = clone(proseR1); badDomain.authority_domain = 'CANONICAL_MANUSCRIPT_MUTATION'; reseal(badDomain);
expectError('OEP2I-011-AUTHORITY-DOMAIN-TAMPER-REJECTED', () => evidence.validateReceipt(badDomain, proseW, prosePlan), 'RECEIPT_TASK_AUTHORITY_BINDING_MISMATCH');
const badService = clone(proseR1); badService.provider_identity.service_id = 'BOOK_EVALUATION'; reseal(badService);
expectError('OEP2I-012-PROVIDER-SERVICE-TAMPER-REJECTED', () => evidence.validateReceipt(badService, proseW, prosePlan), 'PROVIDER_SERVICE_OPERATION_MISMATCH');
const badOperation = clone(proseR1); badOperation.provider_identity.operation_id = 'COMPARE_ORIGINAL_AND_CANDIDATE'; reseal(badOperation);
expectError('OEP2I-013-PROVIDER-OPERATION-TAMPER-REJECTED', () => evidence.validateReceipt(badOperation, proseW, prosePlan), 'PROVIDER_SERVICE_OPERATION_MISMATCH');
const badSubject = clone(proseR1); badSubject.provider_identity.provider_subject_sha = 'not-a-subject-sha'; reseal(badSubject);
expectError('OEP2I-014-PROVIDER-SUBJECT-IDENTITY-REJECTED', () => evidence.validateReceipt(badSubject, proseW, prosePlan), 'PROVIDER_SUBJECT_SHA_INVALID');
const badOpDigest = clone(proseR1); badOpDigest.operation_identity_digest = h('forged-operation'); reseal(badOpDigest);
expectError('OEP2I-015-FORGED-OPERATION-DIGEST-REJECTED', () => evidence.validateReceipt(badOpDigest, proseW, prosePlan), 'STALE_OR_TAMPERED_OPERATION_DIGEST');

const rawInput = clone(proseInput); rawInput.manuscript_text = 'forbidden raw manuscript';
expectError('OEP2I-016-RAW-MANUSCRIPT-INPUT-REJECTED', () => evidence.createReceipt(rawInput), 'RAW_CONTENT_FORBIDDEN');
const rawCandidate = clone(proseR1); rawCandidate.candidate_text = 'forbidden candidate'; reseal(rawCandidate);
expectError('OEP2I-017-RAW-CANDIDATE-RECEIPT-REJECTED', () => evidence.validateReceipt(rawCandidate, proseW, prosePlan), 'RAW_CONTENT_FORBIDDEN');
const rawEvaluator = clone(proseR1); rawEvaluator.raw_evaluator_text = 'forbidden evaluator text'; reseal(rawEvaluator);
expectError('OEP2I-018-RAW-EVALUATOR-TEXT-REJECTED', () => evidence.validateReceipt(rawEvaluator, proseW, prosePlan), 'RAW_CONTENT_FORBIDDEN');
const proseRef = clone(proseR1); proseRef.output_refs = ['this is prose not a governed ref']; reseal(proseRef);
expectError('OEP2I-019-PROSE-SMUGGLING-IN-REFERENCE-REJECTED', () => evidence.validateReceipt(proseRef, proseW, prosePlan), 'INVALID_REFERENCE');
const effectTrue = clone(proseR1); effectTrue.canonical_effect_allowed = true; reseal(effectTrue);
expectError('OEP2I-020-CANONICAL-EFFECT-TRUE-REJECTED', () => evidence.validateReceipt(effectTrue, proseW, prosePlan), 'EVIDENCE_CANONICAL_EFFECT_FORBIDDEN');
const canonicalField = clone(proseR1); canonicalField.canonical_manuscript = 'MANUSCRIPT-NEW'; reseal(canonicalField);
expectError('OEP2I-021-CANONICAL-MUTATION-FIELD-REJECTED', () => evidence.validateReceipt(canonicalField, proseW, prosePlan), 'CANONICAL_OR_PUBLICATION_EFFECT_FIELD_FORBIDDEN');
const publicationField = clone(proseR1); publicationField.publication_authorized = true; reseal(publicationField);
expectError('OEP2I-022-PUBLICATION-AUTHORITY-FIELD-REJECTED', () => evidence.validateReceipt(publicationField, proseW, prosePlan), 'CANONICAL_OR_PUBLICATION_EFFECT_FIELD_FORBIDDEN');

const r2Input = providerReceiptInput('R-PROSE-2',2,proseW,prosePlan,proseTask,[proseR1.receipt_digest],{ emitted_at:'2026-09-10T16:46:01-04:00' });
const proseR2 = evidence.createReceipt(r2Input);
const chain = evidence.appendReceipt([proseR1], proseR2, proseW, prosePlan);
if (chain.length !== 2 || chain[0].receipt_digest !== proseR1.receipt_digest) throw new Error('APPEND_CHAIN_WRONG');
pass('OEP2I-023-APPEND-ONLY-CHAIN-VALID');
const gapR = evidence.createReceipt(providerReceiptInput('R-PROSE-GAP',3,proseW,prosePlan,proseTask,[proseR1.receipt_digest]));
expectError('OEP2I-024-SEQUENCE-GAP-REJECTED', () => evidence.validateChain([proseR1,gapR],proseW,prosePlan), 'RECEIPT_SEQUENCE_GAP_OR_REORDER');
const badParent = evidence.createReceipt(providerReceiptInput('R-PROSE-BAD-PARENT',2,proseW,prosePlan,proseTask,[h('wrong-parent')]));
expectError('OEP2I-025-PARENT-DIGEST-MISMATCH-REJECTED', () => evidence.validateChain([proseR1,badParent],proseW,prosePlan), 'RECEIPT_PARENT_CHAIN_MISMATCH');
const duplicateId = clone(proseR1); duplicateId.sequence_number = 2; duplicateId.parent_receipt_digests = [proseR1.receipt_digest]; reseal(duplicateId);
expectError('OEP2I-026-DUPLICATE-RECEIPT-ID-REJECTED', () => evidence.validateChain([proseR1,duplicateId],proseW,prosePlan), 'DUPLICATE_RECEIPT_ID');
const digestTamper = clone(proseR1); digestTamper.receipt_digest = h('tampered-receipt');
expectError('OEP2I-027-RECEIPT-DIGEST-TAMPER-REJECTED', () => evidence.validateReceipt(digestTamper,proseW,prosePlan), 'RECEIPT_DIGEST_MISMATCH');
const originalSnapshot = JSON.stringify([proseR1]);
evidence.appendReceipt([proseR1],proseR2,proseW,prosePlan);
if (JSON.stringify([proseR1]) !== originalSnapshot) throw new Error('APPEND_MUTATED_PRIOR_CHAIN');
pass('OEP2I-028-APPEND-DOES-NOT-MUTATE-PRIOR-RECEIPTS');

const authorTask = task('T-AUTHOR','AUTHORITY_WAIT',null,null,[],{authority_wait_owner:'AUTHOR'});
const authorW = makeWorkflow('WF-2I-AUTHOR',[authorTask]);
const authorPlan = makePlan('PLAN-2I-AUTHOR',authorW,[authorTask]);
const authorReceipt = evidence.createReceipt({
  receipt_id:'R-AUTHOR-1',receipt_class:'AUTHOR_DECISION_REFERENCE_OBSERVED',sequence_number:1,
  workflow_state:authorW,plan:authorPlan,current_source_identity:clone(authorW.source_identity),task_id:'T-AUTHOR',
  decision_refs:['AUTHOR-DECISION-001'],parent_receipt_digests:[],emitted_at:'2026-09-10T16:47:00-04:00'
});
if (authorReceipt.canonical_effect_allowed !== false || authorReceipt.decision_refs[0] !== 'AUTHOR-DECISION-001') throw new Error('AUTHOR_REFERENCE_SYNTHESIZED');
pass('OEP2I-029-AUTHOR-DECISION-REFERENCE-NOT-SYNTHESIZED');

const admissionTask = task('T-ADMIT','BOOK_ADMISSION_HANDOFF','BOOK.CANONICAL_MANUSCRIPT_ADMISSION','CANONICAL_MANUSCRIPT_MUTATION');
const admissionW = makeWorkflow('WF-2I-ADMIT',[admissionTask]);
const admissionPlan = makePlan('PLAN-2I-ADMIT',admissionW,[admissionTask]);
const admissionReceipt = evidence.createReceipt({
  receipt_id:'R-ADMIT-1',receipt_class:'ADMISSION_HANDOFF_REFERENCE_OBSERVED',sequence_number:1,
  workflow_state:admissionW,plan:admissionPlan,current_source_identity:clone(admissionW.source_identity),task_id:'T-ADMIT',
  decision_refs:['BOOK-ADMISSION-HANDOFF-001'],parent_receipt_digests:[],emitted_at:'2026-09-10T16:47:01-04:00'
});
if (admissionReceipt.canonical_effect_allowed !== false) throw new Error('ADMISSION_REFERENCE_BECAME_ADMISSION');
const replay = evidence.replayVerify([admissionReceipt],admissionW,admissionPlan);
if (!replay.replay_verified || replay.provider_execution_performed || replay.canonical_effect_performed) throw new Error('REPLAY_EXECUTED_EFFECT');
const exported = Object.keys(evidence);
if (exported.some(name => /dispatch|execute|admit|retry|reconcile|persist|preference|schedule|worker|writeCanonical/i.test(name))) throw new Error(`UNAUTHORIZED_EVIDENCE_API:${exported.join(',')}`);
pass('OEP2I-030-ADMISSION-REFERENCE-AND-REPLAY-REMAIN-EVIDENCE-ONLY-NO-EXECUTION-API');

if (results.length !== 30) throw new Error(`CASE_COUNT_MISMATCH:${results.length}`);
const summary = {
  qualification_id:'BOOK-WORKFLOW-ORCHESTRATOR-EVIDENCE-PROVENANCE-EMISSION-001-QUALIFICATION',
  result:'PASS',
  subject_sha:process.env.GITHUB_SHA || null,
  fixture_class:'SYNTHETIC_NON_PRIVATE_EVIDENCE_PROVENANCE',
  planned_cases:30,
  passed_cases:results.length,
  assertions:results.length,
  provider_execution_performed:false,
  retry_executed:false,
  reconciliation_executed:false,
  canonical_manuscript_mutated:false,
  book_admission_executed:false,
  durable_persistence_proven:false,
  preference_write_performed:false,
  fresh_blind_scoring_executed:false,
  a01_pass_claimed_for_this_subject:false,
  native_private_publication_production_claimed:false,
  results
};
const out = path.join(process.env.RUNNER_TEMP || '/tmp','book-workflow-orchestrator-evidence-provenance-emission-001-summary.json');
fs.writeFileSync(out,JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
