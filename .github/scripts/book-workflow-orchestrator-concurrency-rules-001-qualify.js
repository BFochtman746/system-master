'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const stateModel = require('../../system-master/book-system/book-workflow-state-model');
const routing = require('../../system-master/book-system/book-capability-routing-interface');
const planRuntime = require('../../system-master/book-system/book-workflow-execution-plan');
const concurrency = require('../../system-master/book-system/book-workflow-concurrency-rules');

const results = [];
function h(v) { return crypto.createHash('sha256').update(String(v), 'utf8').digest('hex'); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function pass(case_id, extra = {}) { results.push({ case_id, result: 'PASS', ...extra }); }
function expectError(case_id, fn, code) {
  try { fn(); throw new Error(`EXPECTED_ERROR_NOT_THROWN:${code}`); }
  catch (err) {
    if (err.message === `EXPECTED_ERROR_NOT_THROWN:${code}`) throw err;
    if (err.code !== code) throw new Error(`${case_id}:EXPECTED_${code}:GOT_${err.code || err.message}`);
    pass(case_id, { observed: err.code });
  }
}
function wf() {
  return stateModel.createWorkflowState({
    workflow_id:'WF-2E-001', book_project_id:'BOOK-PROJECT-001', objective:'Evaluate chapter safely.', target_section_ref:'chapter-8',
    source_identity:{book_state_version:8,book_state_digest:h('bs8'),canonical_manuscript_ref:'MANUSCRIPT-CANONICAL-001',manuscript_version_id:'MANUSCRIPT-V008',manuscript_digest_sha256:h('mv8')},
    input_hashes:{objective:h('obj2e')}, created_at:'2026-09-10T12:10:00-04:00'
  });
}
function task(id, cls, cap, domain, deps = [], opts = {}) {
  return {task_id:id,task_class:cls,capability_id:cap,required_authority_domain:domain,authority_wait_owner:opts.authority_wait_owner===undefined?null:opts.authority_wait_owner,required_dependency_ids:deps,optional_dependency_ids:opts.optional_dependency_ids||[],input_ref_hashes:{source:h(id)},context_package_refs:[],required_for_plan_success:opts.required_for_plan_success===undefined?true:opts.required_for_plan_success};
}
function plan(tasks, workflow = wf(), id='PLAN-2E-001') {
  return planRuntime.createExecutionPlan({plan_id:id,book_project_id:workflow.book_project_id,objective_ref:'OBJ-2E',objective_hash_sha256:h('Evaluate chapter safely.'),tasks,created_at:'2026-09-10T12:11:00-04:00'},workflow,routing.loadDefaultRegistry());
}

const workflow = wf();
const independent = [
  task('T-PROSE','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS'),
  task('T-RESEARCH','SPECIALIST_SERVICE_TASK','RESEARCH.ACQUIRE_BOUNDED_EVIDENCE','EXTERNAL_EVIDENCE_TRUTH'),
  task('T-VOICE','SPECIALIST_SERVICE_TASK','PROSE.ASSESS_VOICE','VOICE_EVIDENCE')
];
const independentPlan = plan(independent, workflow);
const d1 = concurrency.deriveConcurrencyDecision(independentPlan, workflow);
if (d1.parallel_groups.length !== 1 || JSON.stringify(d1.parallel_groups[0].task_ids) !== JSON.stringify(['T-PROSE','T-RESEARCH','T-VOICE'])) throw new Error('INDEPENDENT_GROUP_WRONG');
pass('OCR-E-001-INDEPENDENT-READ-ONLY-TASKS-GROUPED');

const d2 = concurrency.deriveConcurrencyDecision(independentPlan, workflow);
if (d1.decision_digest !== d2.decision_digest || JSON.stringify(d1.parallel_groups)!==JSON.stringify(d2.parallel_groups)) throw new Error('NONDETERMINISTIC_CONCURRENCY_DECISION');
pass('OCR-E-002-DETERMINISTIC-GROUPING-AND-DIGEST');

const dependentPlan = plan([
  task('T-PROSE','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS'),
  task('T-VOICE','SPECIALIST_SERVICE_TASK','PROSE.ASSESS_VOICE','VOICE_EVIDENCE',['T-PROSE'])
],workflow,'PLAN-DEPENDENT');
const depDecision = concurrency.deriveConcurrencyDecision(dependentPlan,workflow);
if (depDecision.parallel_groups.length !== 0) throw new Error('DEPENDENT_TASKS_PARALLELIZED');
pass('OCR-E-003-DEPENDENT-TASKS-NEVER-GROUPED');

const optionalPlan = plan([
  task('T-PROSE','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS'),
  task('T-RESEARCH','SPECIALIST_SERVICE_TASK','RESEARCH.ACQUIRE_BOUNDED_EVIDENCE','EXTERNAL_EVIDENCE_TRUTH',[],{optional_dependency_ids:['T-PROSE']})
],workflow,'PLAN-OPTIONAL');
const optionalDecision = concurrency.deriveConcurrencyDecision(optionalPlan,workflow);
if (optionalDecision.parallel_groups.length !== 0) throw new Error('OPTIONAL_DEPENDENCY_IGNORED');
pass('OCR-E-004-OPTIONAL-DEPENDENCY-PREVENTS-PARALLEL-GROUP');

const generatorPlan = plan([
  task('T-PROSE','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS'),
  task('T-GEN','SPECIALIST_SERVICE_TASK','PROSE.GENERATE_REVISION_CANDIDATE','LITERARY_CANDIDATE_GENERATION'),
  task('T-RESEARCH','SPECIALIST_SERVICE_TASK','RESEARCH.ACQUIRE_BOUNDED_EVIDENCE','EXTERNAL_EVIDENCE_TRUTH')
],workflow,'PLAN-GENERATOR');
const generatorDecision = concurrency.deriveConcurrencyDecision(generatorPlan,workflow);
const gen = generatorDecision.task_decisions.find(x=>x.task_id==='T-GEN');
if (gen.parallel_eligible || gen.policy_class!=='SERIAL_ONLY_NONIDEMPOTENT_OR_SIDE_EFFECTING') throw new Error('GENERATOR_NOT_SERIAL');
if (generatorDecision.parallel_groups[0].task_ids.includes('T-GEN')) throw new Error('GENERATOR_IN_PARALLEL_GROUP');
pass('OCR-E-005-NONIDEMPOTENT-PROSE-GENERATION-SERIAL');

const evalPlan = plan([
  task('T-PROSE','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS'),
  task('T-EVAL','SPECIALIST_SERVICE_TASK','EVALUATION.INDEPENDENT_BOOK_OR_UNIT','LITERARY_EVALUATION_EVIDENCE')
],workflow,'PLAN-EVAL');
const evalDecision = concurrency.deriveConcurrencyDecision(evalPlan,workflow);
const evalTask = evalDecision.task_decisions.find(x=>x.task_id==='T-EVAL');
if (evalTask.parallel_eligible || evalTask.policy_class!=='ISOLATION_GATED') throw new Error('EVALUATOR_NOT_ISOLATION_GATED');
pass('OCR-E-006-EVALUATOR-ISOLATION-GATED');

const blockedCanonPlan = plan([task('T-CANON','DECLARED_BLOCKED_CAPABILITY','CANON.CONSISTENCY_CHECK','CANON_TRUTH')],workflow,'PLAN-CANON');
const canonDecision = concurrency.deriveConcurrencyDecision(blockedCanonPlan,workflow);
if (canonDecision.task_decisions[0].parallel_eligible || canonDecision.task_decisions[0].policy_class!=='NONEXECUTABLE_BLOCKER') throw new Error('CANON_PARALLELIZED');
pass('OCR-E-007-BLOCKED-CANON-NOT-PARALLEL');

const blockedContinuityPlan = plan([task('T-CONT','DECLARED_BLOCKED_CAPABILITY','CONTINUITY.CHECK','BOOK_CONTINUITY_EVIDENCE')],workflow,'PLAN-CONT');
const contDecision = concurrency.deriveConcurrencyDecision(blockedContinuityPlan,workflow);
if (contDecision.task_decisions[0].parallel_eligible) throw new Error('CONTINUITY_PARALLELIZED');
pass('OCR-E-008-BLOCKED-CONTINUITY-NOT-PARALLEL');

const authorPlan = plan([task('T-AUTHOR','AUTHORITY_WAIT',null,null,[],{authority_wait_owner:'AUTHOR'})],workflow,'PLAN-AUTHOR');
const authorDecision = concurrency.deriveConcurrencyDecision(authorPlan,workflow);
if (authorDecision.task_decisions[0].parallel_eligible) throw new Error('AUTHOR_WAIT_PARALLELIZED');
pass('OCR-E-009-AUTHOR-WAIT-NOT-PARALLEL');

const admitPlan = plan([
  task('T-PROSE','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS'),
  task('T-ADMIT','BOOK_ADMISSION_HANDOFF','BOOK.CANONICAL_MANUSCRIPT_ADMISSION','CANONICAL_MANUSCRIPT_MUTATION',['T-PROSE'])
],workflow,'PLAN-ADMIT');
const admitDecision = concurrency.deriveConcurrencyDecision(admitPlan,workflow);
const admit = admitDecision.task_decisions.find(x=>x.task_id==='T-ADMIT');
if (admit.parallel_eligible || admit.policy_class!=='BOOK_ADMISSION_SERIAL_ONLY') throw new Error('ADMISSION_PARALLELIZED');
pass('OCR-E-010-BOOK-ADMISSION-NOT-PARALLEL');

const singletonPlan = plan([task('T-PROSE','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS')],workflow,'PLAN-SINGLETON');
const singletonDecision = concurrency.deriveConcurrencyDecision(singletonPlan,workflow);
if (singletonDecision.parallel_groups.length !== 0 || !singletonDecision.task_decisions[0].parallel_eligible) throw new Error('SINGLETON_GROUP_POLICY_WRONG');
pass('OCR-E-011-SINGLETON-ELIGIBLE-BUT-NOT-GROUPED');

const stalePlan = clone(independentPlan); stalePlan.plan_digest = h('stale-plan-digest');
expectError('OCR-E-012-STALE-PLAN-REJECTED',()=>concurrency.validateConcurrencyDecision(d1,stalePlan,workflow),'PLAN_DIGEST_MISMATCH');

const staleDecision = clone(d1); staleDecision.plan_digest = h('other-plan'); staleDecision.decision_digest = concurrency.decisionDigest(staleDecision);
expectError('OCR-E-013-STALE-DECISION-PLAN-BINDING-REJECTED',()=>concurrency.validateConcurrencyDecision(staleDecision,independentPlan,workflow),'STALE_CONCURRENCY_PLAN_BINDING');

const staleWorkflowDecision = clone(d1); staleWorkflowDecision.workflow_digest = h('other-workflow'); staleWorkflowDecision.decision_digest = concurrency.decisionDigest(staleWorkflowDecision);
expectError('OCR-E-014-STALE-WORKFLOW-BINDING-REJECTED',()=>concurrency.validateConcurrencyDecision(staleWorkflowDecision,independentPlan,workflow),'STALE_CONCURRENCY_WORKFLOW_BINDING');

const staleSourceDecision = clone(d1); staleSourceDecision.source_identity.manuscript_digest_sha256 = h('other-source'); staleSourceDecision.decision_digest = concurrency.decisionDigest(staleSourceDecision);
expectError('OCR-E-015-STALE-SOURCE-BINDING-REJECTED',()=>concurrency.validateConcurrencyDecision(staleSourceDecision,independentPlan,workflow),'STALE_CONCURRENCY_SOURCE_BINDING');

const crossLayer = clone(depDecision);
crossLayer.parallel_groups=[{group_id:'BAD',topological_layer:0,task_ids:['T-PROSE','T-VOICE']}];
crossLayer.task_decisions.find(x=>x.task_id==='T-VOICE').parallel_eligible=true;
crossLayer.decision_digest=concurrency.decisionDigest(crossLayer);
expectError('OCR-E-016-CROSS-LAYER-GROUP-REJECTED',()=>concurrency.validateConcurrencyDecision(crossLayer,dependentPlan,workflow),'CROSS_LAYER_PARALLEL_GROUP_FORBIDDEN');

const tamperedPolicy = clone(generatorDecision); const tg=tamperedPolicy.task_decisions.find(x=>x.task_id==='T-GEN'); tg.policy_class='READ_ONLY_PARALLEL_ELIGIBLE'; tg.parallel_eligible=true; tamperedPolicy.decision_digest=concurrency.decisionDigest(tamperedPolicy);
expectError('OCR-E-017-SERIAL-POLICY-TAMPER-REJECTED',()=>concurrency.validateConcurrencyDecision(tamperedPolicy,generatorPlan,workflow),'TASK_POLICY_CLASS_MISMATCH');

const tamperedAdmission = clone(admitDecision); const ta=tamperedAdmission.task_decisions.find(x=>x.task_id==='T-ADMIT'); ta.parallel_eligible=true; tamperedAdmission.decision_digest=concurrency.decisionDigest(tamperedAdmission);
expectError('OCR-E-018-ADMISSION-ELIGIBILITY-TAMPER-REJECTED',()=>concurrency.validateConcurrencyDecision(tamperedAdmission,admitPlan,workflow),'TASK_ELIGIBILITY_MISMATCH');

const missingPolicyContract = clone(concurrency.loadContract()); delete missingPolicyContract.capability_policy['PROSE.ANALYZE_PASSAGE'];
expectError('OCR-E-019-MISSING-CAPABILITY-POLICY-FAILS-CLOSED',()=>concurrency.deriveConcurrencyDecision(singletonPlan,workflow,routing.loadDefaultRegistry(),missingPolicyContract),'CAPABILITY_CONCURRENCY_POLICY_MISSING');

const widenedContract = clone(concurrency.loadContract()); widenedContract.capability_policy['PROSE.GENERATE_REVISION_CANDIDATE']='READ_ONLY_PARALLEL_ELIGIBLE';
expectError('OCR-E-020-GENERATOR-POLICY-WIDENING-REJECTED',()=>concurrency.validateContract(widenedContract),'PROSE_GENERATION_MUST_REMAIN_SERIAL');

const isolationWidened = clone(concurrency.loadContract()); isolationWidened.isolation_gate.currently_satisfied=true;
expectError('OCR-E-021-UNQUALIFIED-ISOLATION-WIDENING-REJECTED',()=>concurrency.validateContract(isolationWidened),'ISOLATION_GATE_MUST_REMAIN_UNSATISFIED_IN_2E');

const groupTamper = clone(d1); groupTamper.parallel_groups[0].task_ids.push('T-PROSE'); groupTamper.decision_digest=concurrency.decisionDigest(groupTamper);
expectError('OCR-E-022-DUPLICATE-TASK-IN-GROUP-REJECTED',()=>concurrency.validateConcurrencyDecision(groupTamper,independentPlan,workflow),'PARALLEL_GROUP_DUPLICATE_TASK');

const digestTamper = clone(d1); digestTamper.decision_digest=h('tamper');
expectError('OCR-E-023-DECISION-DIGEST-TAMPER-REJECTED',()=>concurrency.validateConcurrencyDecision(digestTamper,independentPlan,workflow),'CONCURRENCY_DECISION_DIGEST_MISMATCH');

const exportedNames = Object.keys(concurrency);
if (exportedNames.some(name=>/dispatch|schedule|execute|runTask|retry|admit|worker/i.test(name))) throw new Error(`UNAUTHORIZED_RUNTIME_API:${exportedNames.join(',')}`);
pass('OCR-E-024-NO-EXECUTION-SCHEDULER-WORKER-RETRY-OR-ADMISSION-API');

if (d1.task_decisions.some(d=>d.policy_class==='ISOLATION_GATED' && d.parallel_eligible)) throw new Error('BLIND_ISOLATION_FALSELY_ELIGIBLE');
pass('OCR-E-025-NO-FRESH-BLIND-SCORING-OR-ISOLATION-CLAIM');

const summary={
  qualification_id:'BOOK-WORKFLOW-ORCHESTRATOR-CONCURRENCY-RULES-001-QUALIFICATION',result:'PASS',subject_sha:process.env.GITHUB_SHA||null,
  fixture_class:'SYNTHETIC_NON_PRIVATE_CONCURRENCY_ELIGIBILITY',planned_cases:25,passed_cases:results.length,assertions:results.length,
  specialist_execution_performed:false,scheduler_execution_performed:false,worker_execution_performed:false,canonical_manuscript_mutated:false,prose_runtime_mutated:false,
  retry_authority_claimed:false,fresh_blind_scoring_executed:false,evaluator_isolation_claimed:false,a01_pass_claimed_for_this_subject:false,native_private_publication_production_claimed:false,
  results
};
if(results.length!==25) throw new Error(`CASE_COUNT_MISMATCH:${results.length}`);
const out=path.join(process.env.RUNNER_TEMP||'/tmp','book-workflow-orchestrator-concurrency-rules-001-summary.json');
fs.writeFileSync(out,JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
