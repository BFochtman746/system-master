'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const stateModel = require('../../system-master/book-system/book-workflow-state-model');
const planRuntime = require('../../system-master/book-system/book-workflow-execution-plan');
const routing = require('../../system-master/book-system/book-capability-routing-interface');
const retry = require('../../system-master/book-system/book-workflow-retry-idempotency-rules');
const evidence = require('../../system-master/book-system/book-workflow-evidence-provenance');
const handoff = require('../../system-master/book-system/book-workflow-book-admission-handoff');
const contentAdmission = require('../../system-master/book-system/content-object-admission');

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
function source(seed = '21') {
  return {
    book_state_version: 21,
    book_state_digest: h(`book-state-${seed}`),
    canonical_manuscript_ref: 'MANUSCRIPT-CANONICAL-001',
    manuscript_version_id: 'MANUSCRIPT-V021',
    manuscript_digest_sha256: h(`manuscript-${seed}`)
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
function defaultTasks() {
  return [
    task('T-GEN','SPECIALIST_SERVICE_TASK','PROSE.GENERATE_REVISION_CANDIDATE','LITERARY_CANDIDATE_GENERATION'),
    task('T-AUTH','AUTHORITY_WAIT',null,null,['T-GEN'],{ authority_wait_owner:'AUTHOR' }),
    task('T-ADMIT','BOOK_ADMISSION_HANDOFF','BOOK.CANONICAL_MANUSCRIPT_ADMISSION','CANONICAL_MANUSCRIPT_MUTATION',['T-AUTH'])
  ];
}
function makeWorkflow(id, tasks, opts = {}) {
  let w = stateModel.createWorkflowState({
    workflow_id: id,
    book_project_id: 'BOOK-PROJECT-001',
    objective: 'Prepare an evidence-bound Book admission handoff without canonical mutation.',
    target_section_ref: 'chapter-21:scene-2',
    source_identity: opts.source_identity || source(id),
    input_hashes: { objective: h(`objective:${id}`) },
    created_at: '2026-09-10T16:55:00-04:00'
  });
  const initialStatuses = Object.fromEntries(tasks.map(t => [t.task_id, 'PLANNED']));
  w = stateModel.advanceWorkflowState(w, { workflow_status:'PLANNING', planned_task_refs:tasks.map(t => t.task_id), task_statuses:initialStatuses });
  w = stateModel.advanceWorkflowState(w, { workflow_status:'READY' });
  w = stateModel.advanceWorkflowState(w, { workflow_status:'RUNNING', started_at:'2026-09-10T16:55:10-04:00' });
  const statuses = Object.fromEntries(tasks.map(t => [t.task_id, t.task_class === 'BOOK_ADMISSION_HANDOFF' ? (opts.admission_status || 'READY') : (opts.predecessor_statuses && opts.predecessor_statuses[t.task_id]) || 'COMPLETED']));
  const receiptIds = opts.evidence_receipt_refs || [];
  const outputs = opts.specialist_output_refs === undefined ? ['CANDIDATE-001'] : opts.specialist_output_refs;
  const finalStatus = opts.final_status || 'READY_FOR_ADMISSION_HANDOFF';
  w = stateModel.advanceWorkflowState(w, {
    workflow_status: finalStatus,
    task_statuses: statuses,
    specialist_output_refs: outputs,
    evidence_receipt_refs: receiptIds
  });
  return w;
}
function makePlan(id, w, tasks) {
  return planRuntime.createExecutionPlan({
    plan_id:id,
    book_project_id:w.book_project_id,
    objective_ref:`OBJ-${id}`,
    objective_hash_sha256:h(`plan-objective:${id}`),
    tasks,
    created_at:'2026-09-10T16:55:20-04:00'
  }, w, routing.loadDefaultRegistry());
}
function providerIdentity(taskObj) {
  const cap = routing.resolveCallableCapability({ capability_id:taskObj.capability_id, required_authority_domain:taskObj.required_authority_domain });
  return {
    service_id:cap.service_id,
    operation_id:cap.operation_id,
    provider_subject_sha:'1234567890abcdef1234567890abcdef12345678',
    implementation_or_artifact_id:`PROVIDER-${taskObj.task_id}`
  };
}
function providerReceipt(receiptId, seq, w, p, taskObj, parents = [], outputRef = `OUTPUT-${taskObj.task_id}`) {
  return evidence.createReceipt({
    receipt_id:receiptId,
    receipt_class:'TASK_RESULT_OBSERVED',
    sequence_number:seq,
    workflow_state:w,
    plan:p,
    current_source_identity:clone(w.source_identity),
    task_id:taskObj.task_id,
    provider_identity:providerIdentity(taskObj),
    operation_identity:retry.buildOperationIdentity(p,w,taskObj.task_id),
    output_refs:[outputRef],
    evidence_refs:[`EVIDENCE-${taskObj.task_id}`],
    decision_refs:[],
    parent_receipt_digests:parents,
    emitted_at:'2026-09-10T16:55:30-04:00'
  });
}
function authorReceipt(receiptId, seq, w, p, taskObj, parents = [], decisionRef = 'AUTHOR-DECISION-001') {
  return evidence.createReceipt({
    receipt_id:receiptId,
    receipt_class:'AUTHOR_DECISION_REFERENCE_OBSERVED',
    sequence_number:seq,
    workflow_state:w,
    plan:p,
    current_source_identity:clone(w.source_identity),
    task_id:taskObj.task_id,
    output_refs:[],
    evidence_refs:[],
    decision_refs:[decisionRef],
    parent_receipt_digests:parents,
    emitted_at:'2026-09-10T16:55:31-04:00'
  });
}
function validFixture(id = 'BASE') {
  const tasks = defaultTasks();
  const w = makeWorkflow(`WF-2J-${id}`,tasks,{ evidence_receipt_refs:['R-GEN','R-AUTH'] });
  const p = makePlan(`PLAN-2J-${id}`,w,tasks);
  const r1 = providerReceipt('R-GEN',1,w,p,tasks[0],[],'CANDIDATE-001');
  const r2 = authorReceipt('R-AUTH',2,w,p,tasks[1],[r1.receipt_digest]);
  const input = {
    handoff_id:`HANDOFF-${id}`,
    workflow_state:w,
    plan:p,
    current_source_identity:clone(w.source_identity),
    receipts:[r1,r2],
    admission_task_id:'T-ADMIT',
    candidate_artifact_ref:'CANDIDATE-001',
    candidate_digest_sha256:h(`candidate:${id}`),
    created_at:'2026-09-10T16:56:00-04:00'
  };
  return { tasks,w,p,r1,r2,input };
}
function resealHandoff(x) { x.handoff_digest = handoff.handoffDigest(x); return x; }
function resealWorkflow(x) { x.workflow_digest = stateModel.digestWorkflowState(x); return x; }

const base = validFixture();
const h1 = handoff.prepareAdmissionHandoff(base.input);
const h2 = handoff.prepareAdmissionHandoff(base.input);
if (h1.handoff_digest !== h2.handoff_digest) throw new Error('NONDETERMINISTIC_HANDOFF');
pass('OAH2J-001-DETERMINISTIC-HANDOFF-DIGEST');
if (h1.workflow_digest !== base.w.workflow_digest || h1.plan_digest !== base.p.plan_digest || JSON.stringify(h1.source_identity) !== JSON.stringify(base.w.source_identity)) throw new Error('EXACT_BINDING_MISSING');
pass('OAH2J-002-EXACT-WORKFLOW-PLAN-SOURCE-BINDING');
if (h1.target_owner_path !== 'SYSTEM_MASTER/BOOK' || h1.target_module !== 'system-master/book-system/content-object-admission.js' || h1.target_entrypoint !== 'commitContentAdmission' || h1.required_actor_class !== 'PARENT_SYSTEM') throw new Error('TARGET_BINDING_WRONG');
pass('OAH2J-003-FIXED-BOOK-ADMISSION-TARGET');
if (h1.canonical_effect_allowed !== false) throw new Error('HANDOFF_GAINED_CANONICAL_EFFECT');
pass('OAH2J-004-HANDOFF-EVIDENCE-ONLY');
if (typeof contentAdmission.commitContentAdmission !== 'function') throw new Error('BOOK_ADMISSION_ENTRYPOINT_MISSING');
pass('OAH2J-005-EXISTING-BOOK-ADMISSION-ENTRYPOINT-BOUND');
if (h1.candidate_provenance_receipt_id !== 'R-GEN' || h1.candidate_provenance_receipt_digest !== base.r1.receipt_digest) throw new Error('CANDIDATE_PROVENANCE_MISSING');
pass('OAH2J-006-CANDIDATE-PROVENANCE-BOUND');
if (JSON.stringify(h1.author_decision_refs) !== JSON.stringify(['AUTHOR-DECISION-001'])) throw new Error('AUTHOR_DECISION_NOT_DERIVED');
pass('OAH2J-007-AUTHOR-DECISION-REFERENCE-DERIVED');
if (h1.expected_parent_state_version !== base.w.source_identity.book_state_version || h1.expected_parent_state_digest !== base.w.source_identity.book_state_digest) throw new Error('PARENT_BINDING_MISSING');
pass('OAH2J-008-EXPECTED-PARENT-STATE-BOUND');

const running = validFixture('RUNNING');
let wr = clone(running.w); wr.workflow_status = 'RUNNING'; resealWorkflow(wr);
const pr = makePlan('PLAN-2J-RUNNING-REBIND',wr,running.tasks);
const rr1 = providerReceipt('R-GEN',1,wr,pr,running.tasks[0],[],'CANDIDATE-001');
const rr2 = authorReceipt('R-AUTH',2,wr,pr,running.tasks[1],[rr1.receipt_digest]);
expectError('OAH2J-009-WORKFLOW-STATUS-NOT-READY-REJECTED', () => handoff.prepareAdmissionHandoff({...running.input,workflow_state:wr,plan:pr,current_source_identity:clone(wr.source_identity),receipts:[rr1,rr2]}), 'WORKFLOW_NOT_READY_FOR_ADMISSION_HANDOFF');

const notReady = validFixture('ADMIT-NOT-READY');
let wn = clone(notReady.w); wn.task_statuses['T-ADMIT'] = 'PLANNED'; resealWorkflow(wn);
const pn = makePlan('PLAN-2J-ADMIT-NOT-READY-REBIND',wn,notReady.tasks);
const nr1 = providerReceipt('R-GEN',1,wn,pn,notReady.tasks[0],[],'CANDIDATE-001');
const nr2 = authorReceipt('R-AUTH',2,wn,pn,notReady.tasks[1],[nr1.receipt_digest]);
expectError('OAH2J-010-ADMISSION-TASK-NOT-READY-REJECTED', () => handoff.prepareAdmissionHandoff({...notReady.input,workflow_state:wn,plan:pn,current_source_identity:clone(wn.source_identity),receipts:[nr1,nr2]}), 'ADMISSION_TASK_NOT_READY');

for (const [idx,status] of ['FAILED','BLOCKED','CANCELLED','RUNNING'].entries()) {
  const fx = validFixture(`PRED-${status}`);
  let w = clone(fx.w); w.task_statuses['T-GEN'] = status; resealWorkflow(w);
  const p = makePlan(`PLAN-2J-PRED-${status}-REBIND`,w,fx.tasks);
  const r1 = providerReceipt('R-GEN',1,w,p,fx.tasks[0],[],'CANDIDATE-001');
  const r2 = authorReceipt('R-AUTH',2,w,p,fx.tasks[1],[r1.receipt_digest]);
  expectError(`OAH2J-${String(11+idx).padStart(3,'0')}-REQUIRED-PREDECESSOR-${status}-REJECTED`, () => handoff.prepareAdmissionHandoff({...fx.input,workflow_state:w,plan:p,current_source_identity:clone(w.source_identity),receipts:[r1,r2]}), 'REQUIRED_ANCESTOR_NOT_COMPLETED');
}

expectError('OAH2J-015-EMPTY-EVIDENCE-CHAIN-REJECTED', () => handoff.prepareAdmissionHandoff({...base.input,receipts:[]}), 'EVIDENCE_CHAIN_REQUIRED');
const badChain = clone(base.input); badChain.receipts[0].receipt_digest = h('tampered');
expectError('OAH2J-016-TAMPERED-EVIDENCE-CHAIN-REJECTED', () => handoff.prepareAdmissionHandoff(badChain), 'RECEIPT_DIGEST_MISMATCH');

const missingSpecialist = validFixture('MISS-SPECIALIST');
const onlyAuthor = authorReceipt('R-AUTH-ONLY',1,missingSpecialist.w,missingSpecialist.p,missingSpecialist.tasks[1],[]);
expectError('OAH2J-017-MISSING-SPECIALIST-EVIDENCE-REJECTED', () => handoff.prepareAdmissionHandoff({...missingSpecialist.input,receipts:[onlyAuthor]}), 'REQUIRED_SPECIALIST_EVIDENCE_MISSING');
const missingAuthor = validFixture('MISS-AUTHOR');
const onlyGen = providerReceipt('R-GEN-ONLY',1,missingAuthor.w,missingAuthor.p,missingAuthor.tasks[0],[],'CANDIDATE-001');
expectError('OAH2J-018-MISSING-AUTHOR-EVIDENCE-REJECTED', () => handoff.prepareAdmissionHandoff({...missingAuthor.input,receipts:[onlyGen]}), 'AUTHOR_DECISION_EVIDENCE_AMBIGUOUS_OR_MISSING');
const ambiguousAuthor = validFixture('AMB-AUTHOR');
const ar1 = providerReceipt('R-GEN-X',1,ambiguousAuthor.w,ambiguousAuthor.p,ambiguousAuthor.tasks[0],[],'CANDIDATE-001');
const ar2 = authorReceipt('R-AUTH-X1',2,ambiguousAuthor.w,ambiguousAuthor.p,ambiguousAuthor.tasks[1],[ar1.receipt_digest],'AUTHOR-DECISION-001');
const ar3 = authorReceipt('R-AUTH-X2',3,ambiguousAuthor.w,ambiguousAuthor.p,ambiguousAuthor.tasks[1],[ar2.receipt_digest],'AUTHOR-DECISION-002');
expectError('OAH2J-019-AMBIGUOUS-AUTHOR-EVIDENCE-REJECTED', () => handoff.prepareAdmissionHandoff({...ambiguousAuthor.input,receipts:[ar1,ar2,ar3]}), 'AUTHOR_DECISION_EVIDENCE_AMBIGUOUS_OR_MISSING');

const noOutput = validFixture('NO-OUTPUT');
let wo = clone(noOutput.w); wo.specialist_output_refs = ['OTHER-OUTPUT']; resealWorkflow(wo);
const po = makePlan('PLAN-2J-NO-OUTPUT-REBIND',wo,noOutput.tasks);
const or1 = providerReceipt('R-GEN',1,wo,po,noOutput.tasks[0],[],'CANDIDATE-001');
const or2 = authorReceipt('R-AUTH',2,wo,po,noOutput.tasks[1],[or1.receipt_digest]);
expectError('OAH2J-020-CANDIDATE-NOT-WORKFLOW-OUTPUT-REJECTED', () => handoff.prepareAdmissionHandoff({...noOutput.input,workflow_state:wo,plan:po,current_source_identity:clone(wo.source_identity),receipts:[or1,or2]}), 'CANDIDATE_NOT_IN_WORKFLOW_OUTPUT_REFS');
expectError('OAH2J-021-INVALID-CANDIDATE-DIGEST-REJECTED', () => handoff.prepareAdmissionHandoff({...base.input,candidate_digest_sha256:'not-a-digest'}), 'INVALID_CANDIDATE_DIGEST');
expectError('OAH2J-022-RAW-CANDIDATE-CONTENT-REJECTED', () => handoff.prepareAdmissionHandoff({...base.input,candidate_text:'rewrite this'}), 'UNEXPECTED_HANDOFF_INPUT_FIELD');
expectError('OAH2J-023-ADMISSION-OPERATIONS-IN-HANDOFF-REJECTED', () => handoff.prepareAdmissionHandoff({...base.input,operations:[]}), 'UNEXPECTED_HANDOFF_INPUT_FIELD');
expectError('OAH2J-024-ACTOR-OVERRIDE-REJECTED', () => handoff.prepareAdmissionHandoff({...base.input,actor_class:'ORCHESTRATOR'}), 'UNEXPECTED_HANDOFF_INPUT_FIELD');

const targetTamper = clone(h1); targetTamper.target_entrypoint = 'orchestratorCommit'; resealHandoff(targetTamper);
expectError('OAH2J-025-TARGET-ENTRYPOINT-TAMPER-REJECTED', () => handoff.validateAdmissionHandoff(targetTamper,base.w,base.p,base.input.receipts,base.w.source_identity), 'BOOK_ADMISSION_TARGET_MISMATCH');
const effectTamper = clone(h1); effectTamper.canonical_effect_allowed = true; resealHandoff(effectTamper);
expectError('OAH2J-026-CANONICAL-EFFECT-TRUE-REJECTED', () => handoff.validateAdmissionHandoff(effectTamper,base.w,base.p,base.input.receipts,base.w.source_identity), 'HANDOFF_CANONICAL_EFFECT_FORBIDDEN');
const staleSource = clone(base.w.source_identity); staleSource.manuscript_digest_sha256 = h('newer-manuscript');
expectError('OAH2J-027-STALE-CURRENT-SOURCE-REJECTED', () => handoff.prepareAdmissionHandoff({...base.input,current_source_identity:staleSource}), 'STALE_WORKFLOW_SOURCE_IDENTITY');

const evalTask = task('T-EVAL','SPECIALIST_SERVICE_TASK','EVALUATION.CONTRASTIVE_CANDIDATE','LITERARY_EVALUATION_EVIDENCE');
const evalAdmit = task('T-ADMIT','BOOK_ADMISSION_HANDOFF','BOOK.CANONICAL_MANUSCRIPT_ADMISSION','CANONICAL_MANUSCRIPT_MUTATION',['T-EVAL']);
const evalTasks = [evalTask,evalAdmit];
const ew = makeWorkflow('WF-2J-EVAL-CANDIDATE',evalTasks,{ evidence_receipt_refs:['R-EVAL'], specialist_output_refs:['CANDIDATE-001'] });
const ep = makePlan('PLAN-2J-EVAL-CANDIDATE',ew,evalTasks);
const er = providerReceipt('R-EVAL',1,ew,ep,evalTask,[],'CANDIDATE-001');
expectError('OAH2J-028-EVALUATOR-OUTPUT-CANNOT-BECOME-CANDIDATE-AUTHORITY', () => handoff.prepareAdmissionHandoff({handoff_id:'HANDOFF-EVAL',workflow_state:ew,plan:ep,current_source_identity:clone(ew.source_identity),receipts:[er],admission_task_id:'T-ADMIT',candidate_artifact_ref:'CANDIDATE-001',candidate_digest_sha256:h('eval-candidate'),created_at:'2026-09-10T16:56:00-04:00'}), 'CANDIDATE_PROVENANCE_AMBIGUOUS_OR_MISSING');

const noChange = validFixture('NO-CHANGE');
let wc = clone(noChange.w); wc.workflow_status = 'COMPLETED_NO_CHANGE'; wc.completed_at = '2026-09-10T16:56:10-04:00'; resealWorkflow(wc);
const pc = makePlan('PLAN-2J-NO-CHANGE-REBIND',wc,noChange.tasks);
const cr1 = providerReceipt('R-GEN',1,wc,pc,noChange.tasks[0],[],'CANDIDATE-001');
const cr2 = authorReceipt('R-AUTH',2,wc,pc,noChange.tasks[1],[cr1.receipt_digest]);
expectError('OAH2J-029-NO-CHANGE-PATH-DOES-NOT-HANDOFF', () => handoff.prepareAdmissionHandoff({...noChange.input,workflow_state:wc,plan:pc,current_source_identity:clone(wc.source_identity),receipts:[cr1,cr2]}), 'WORKFLOW_NOT_READY_FOR_ADMISSION_HANDOFF');

const exported = Object.keys(handoff).sort();
if (exported.some(k => /commit|execute|admitCanonical|applyRevision/i.test(k))) throw new Error(`EXECUTION_API_EXPOSED:${exported.join(',')}`);
pass('OAH2J-030-NO-ADMISSION-EXECUTION-OR-COMMIT-API');

if (results.length !== 30 || results.some(r => r.result !== 'PASS')) throw new Error(`QUALIFICATION_COUNT_MISMATCH:${results.length}`);
const summary = {
  qualification_id:'BOOK-WORKFLOW-ORCHESTRATOR-BOOK-ADMISSION-HANDOFF-001-QUALIFICATION',
  result:'PASS',
  subject_sha:process.env.GITHUB_SHA || null,
  fixture_class:'SYNTHETIC_NON_PRIVATE_ADMISSION_HANDOFF',
  planned_cases:30,
  passed_cases:30,
  assertions:30,
  content_admission_entrypoint_observed:true,
  content_admission_executed:false,
  canonical_manuscript_mutated:false,
  provider_execution_performed:false,
  retry_executed:false,
  durable_persistence_proven:false,
  fresh_blind_scoring_executed:false,
  a01_pass_claimed_for_this_subject:false,
  native_private_publication_production_claimed:false,
  results
};
const out = path.join(process.env.RUNNER_TEMP || process.cwd(),'book-workflow-orchestrator-book-admission-handoff-001-summary.json');
fs.writeFileSync(out,JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
