'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const stateModel = require('../../system-master/book-system/book-workflow-state-model');
const routing = require('../../system-master/book-system/book-capability-routing-interface');
const planRuntime = require('../../system-master/book-system/book-workflow-execution-plan');

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
function task(task_id, task_class, capability_id, domain, deps = [], opts = {}) {
  return {
    task_id,
    task_class,
    capability_id,
    required_authority_domain: domain,
    authority_wait_owner: opts.authority_wait_owner === undefined ? null : opts.authority_wait_owner,
    required_dependency_ids: deps,
    optional_dependency_ids: opts.optional_dependency_ids || [],
    input_ref_hashes: opts.input_ref_hashes || { source: h(`source:${task_id}`) },
    context_package_refs: opts.context_package_refs || [],
    required_for_plan_success: opts.required_for_plan_success === undefined ? true : opts.required_for_plan_success
  };
}
function workflow() {
  return stateModel.createWorkflowState({
    workflow_id: 'WF-2D-001',
    book_project_id: 'BOOK-PROJECT-001',
    objective: 'Improve passage without weakening author intent or canon.',
    target_section_ref: 'chapter-7:scene-2',
    source_identity: {
      book_state_version: 7,
      book_state_digest: h('book-state-7'),
      canonical_manuscript_ref: 'MANUSCRIPT-CANONICAL-001',
      manuscript_version_id: 'MANUSCRIPT-V007',
      manuscript_digest_sha256: h('manuscript-v7')
    },
    input_hashes: { objective: h('objective'), target: h('target') },
    created_at: '2026-09-10T12:00:00-04:00'
  });
}
function baseTasks() {
  return [
    task('T-PROSE','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS'),
    task('T-REVISION','SPECIALIST_SERVICE_TASK','PROSE.GENERATE_REVISION_CANDIDATE','LITERARY_CANDIDATE_GENERATION',['T-PROSE']),
    task('T-EVAL','SPECIALIST_SERVICE_TASK','EVALUATION.CONTRASTIVE_CANDIDATE','LITERARY_EVALUATION_EVIDENCE',['T-REVISION'])
  ];
}
function makePlan(tasks = baseTasks(), wf = workflow(), extra = {}) {
  return planRuntime.createExecutionPlan({
    plan_id: extra.plan_id || 'PLAN-2D-001',
    book_project_id: wf.book_project_id,
    objective_ref: extra.objective_ref || 'OBJECTIVE-001',
    objective_hash_sha256: extra.objective_hash_sha256 || h('Improve passage without weakening author intent or canon.'),
    tasks,
    created_at: extra.created_at || '2026-09-10T12:01:00-04:00'
  }, wf, routing.loadDefaultRegistry());
}

const registry = routing.loadDefaultRegistry();
const wf = workflow();
const valid = makePlan(baseTasks(), wf);
if (valid.readiness_state !== 'READY_FOR_EXECUTION_POLICY') throw new Error('VALID_READY_STATE_WRONG');
pass('ODG-001-VALID-DAG-ACCEPTED');

const valid2 = makePlan(baseTasks(), wf);
if (valid.plan_digest !== valid2.plan_digest) throw new Error('NONDETERMINISTIC_PLAN_DIGEST');
pass('ODG-002-DETERMINISTIC-DIGEST');

if (JSON.stringify(valid.topological_layers) !== JSON.stringify([['T-PROSE'],['T-REVISION'],['T-EVAL']])) throw new Error('TOPOLOGICAL_LAYERS_WRONG');
pass('ODG-003-DETERMINISTIC-TOPOLOGICAL-LAYERS');

const changedTasks = baseTasks();
changedTasks[2].optional_dependency_ids = ['T-PROSE'];
const changed = makePlan(changedTasks, wf);
if (changed.plan_digest === valid.plan_digest) throw new Error('CHANGED_PLAN_DIGEST_NOT_CHANGED');
pass('ODG-004-CHANGED-DEPENDENCY-CHANGES-DIGEST');

const cycle = baseTasks(); cycle[0].required_dependency_ids = ['T-EVAL'];
expectError('ODG-005-CYCLE-REJECTED', () => makePlan(cycle, wf), 'DEPENDENCY_CYCLE_DETECTED');

const missing = baseTasks(); missing[1].required_dependency_ids = ['T-NOT-THERE'];
expectError('ODG-006-MISSING-DEPENDENCY-REJECTED', () => makePlan(missing, wf), 'MISSING_DEPENDENCY');

const self = baseTasks(); self[0].required_dependency_ids = ['T-PROSE'];
expectError('ODG-007-SELF-DEPENDENCY-REJECTED', () => makePlan(self, wf), 'SELF_DEPENDENCY');

const dup = baseTasks(); dup.push(clone(dup[0]));
expectError('ODG-008-DUPLICATE-TASK-REJECTED', () => makePlan(dup, wf), 'DUPLICATE_TASK_ID');

const wrongDomain = baseTasks(); wrongDomain[0].required_authority_domain = 'CANON_TRUTH';
expectError('ODG-009-WRONG-AUTHORITY-DOMAIN-REJECTED', () => makePlan(wrongDomain, wf), 'AUTHORITY_DOMAIN_MISMATCH');

const unknown = baseTasks(); unknown[0].capability_id = 'PROSE.GUESS_WHAT_I_MEAN';
expectError('ODG-010-UNKNOWN-CAPABILITY-REJECTED', () => makePlan(unknown, wf), 'UNKNOWN_CAPABILITY');

const noncallableSpecialist = [task('T-CANON','SPECIALIST_SERVICE_TASK','CANON.CONSISTENCY_CHECK','CANON_TRUTH')];
expectError('ODG-011-NONCALLABLE-SPECIALIST-REJECTED', () => makePlan(noncallableSpecialist, wf), 'CAPABILITY_NOT_CALLABLE');

const blockedCanon = [task('T-CANON','DECLARED_BLOCKED_CAPABILITY','CANON.CONSISTENCY_CHECK','CANON_TRUTH')];
const blockedPlan = makePlan(blockedCanon, wf, { plan_id: 'PLAN-BLOCKED-CANON' });
if (blockedPlan.readiness_state !== 'BLOCKED_ON_DECLARED_INTERFACE') throw new Error('BLOCKED_CANON_NOT_PRESERVED');
pass('ODG-012-DECLARED-BLOCKED-CAPABILITY-PRESERVED');

const authorWait = [task('T-AUTHOR','AUTHORITY_WAIT',null,null,[],{authority_wait_owner:'AUTHOR'})];
const authorPlan = makePlan(authorWait, wf, { plan_id: 'PLAN-AUTHOR-WAIT' });
if (authorPlan.readiness_state !== 'BLOCKED_ON_AUTHORITY_WAIT') throw new Error('AUTHOR_WAIT_NOT_PRESERVED');
pass('ODG-013-AUTHOR-WAIT-PRESERVED');

const withAdmission = baseTasks();
withAdmission.push(task('T-ADMIT','BOOK_ADMISSION_HANDOFF','BOOK.CANONICAL_MANUSCRIPT_ADMISSION','CANONICAL_MANUSCRIPT_MUTATION',['T-EVAL']));
const admissionPlan = makePlan(withAdmission, wf, { plan_id: 'PLAN-ADMISSION' });
if (admissionPlan.readiness_state !== 'BLOCKED_ON_ADMISSION_HANDOFF') throw new Error('ADMISSION_NOT_BLOCKED');
pass('ODG-014-BOOK-ADMISSION-TERMINAL-HANDOFF-ACCEPTED');

const nonterminalAdmission = clone(withAdmission);
nonterminalAdmission.push(task('T-AFTER','SPECIALIST_SERVICE_TASK','PROSE.ASSESS_VOICE','VOICE_EVIDENCE',['T-ADMIT'],{required_for_plan_success:false}));
expectError('ODG-015-NONTERMINAL-ADMISSION-REJECTED', () => makePlan(nonterminalAdmission, wf), 'BOOK_ADMISSION_NOT_TERMINAL_SINK');

const bypassRequired = baseTasks();
bypassRequired.push(task('T-RESEARCH','SPECIALIST_SERVICE_TASK','RESEARCH.ACQUIRE_BOUNDED_EVIDENCE','EXTERNAL_EVIDENCE_TRUTH'));
bypassRequired.push(task('T-ADMIT','BOOK_ADMISSION_HANDOFF','BOOK.CANONICAL_MANUSCRIPT_ADMISSION','CANONICAL_MANUSCRIPT_MUTATION',['T-EVAL']));
expectError('ODG-016-REQUIRED-TASK-BYPASS-ADMISSION-REJECTED', () => makePlan(bypassRequired, wf), 'REQUIRED_TASK_NOT_BEFORE_ADMISSION');

const twoAdmissions = clone(withAdmission);
twoAdmissions.push(task('T-ADMIT-2','BOOK_ADMISSION_HANDOFF','BOOK.CANONICAL_MANUSCRIPT_ADMISSION','CANONICAL_MANUSCRIPT_MUTATION',['T-EVAL']));
expectError('ODG-017-MULTIPLE-ADMISSIONS-REJECTED', () => makePlan(twoAdmissions, wf), 'MULTIPLE_BOOK_ADMISSION_HANDOFFS');

const specialistMutation = [task('T-BAD','SPECIALIST_SERVICE_TASK','PROSE.GENERATE_REVISION_CANDIDATE','CANONICAL_MANUSCRIPT_MUTATION')];
expectError('ODG-018-SPECIALIST-CANONICAL-MUTATION-REJECTED', () => makePlan(specialistMutation, wf), 'AUTHORITY_DOMAIN_MISMATCH');

const raw = baseTasks(); raw[0].manuscript_text = 'forbidden manuscript content';
expectError('ODG-019-RAW-MANUSCRIPT-CONTENT-REJECTED', () => makePlan(raw, wf), 'RAW_MANUSCRIPT_CONTENT_FORBIDDEN');

const rawNested = baseTasks(); rawNested[0].input_ref_hashes = { source: h('x') }; rawNested[0].nested = { candidate_text: 'forbidden' };
expectError('ODG-020-NESTED-CANDIDATE-TEXT-REJECTED', () => makePlan(rawNested, wf), 'RAW_MANUSCRIPT_CONTENT_FORBIDDEN');

const concurrency = baseTasks(); concurrency[0].parallel_execution_authorized = true;
expectError('ODG-021-CONCURRENCY-AUTHORITY-SMUGGLING-REJECTED', () => makePlan(concurrency, wf), 'CONCURRENCY_AUTHORITY_FIELD_FORBIDDEN');

const stale = clone(valid);
stale.source_identity.manuscript_digest_sha256 = h('different-manuscript');
stale.plan_digest = planRuntime.digestPlan(stale);
expectError('ODG-022-STALE-SOURCE-IDENTITY-REJECTED', () => planRuntime.validateExecutionPlan(stale, wf, registry), 'STALE_WORKFLOW_SOURCE_IDENTITY');

const tampered = clone(valid); tampered.objective_ref = 'OBJECTIVE-TAMPERED';
expectError('ODG-023-DIGEST-TAMPER-REJECTED', () => planRuntime.validateExecutionPlan(tampered, wf, registry), 'PLAN_DIGEST_MISMATCH');

const optionalCycle = baseTasks(); optionalCycle[0].optional_dependency_ids = ['T-EVAL'];
expectError('ODG-024-OPTIONAL-EDGE-CYCLE-REJECTED', () => makePlan(optionalCycle, wf), 'DEPENDENCY_CYCLE_DETECTED');

const overlap = baseTasks(); overlap[1].optional_dependency_ids = ['T-PROSE'];
expectError('ODG-025-REQUIRED-OPTIONAL-OVERLAP-REJECTED', () => makePlan(overlap, wf), 'DEPENDENCY_REQUIRED_OPTIONAL_OVERLAP');

const badHash = baseTasks(); badHash[0].input_ref_hashes = { source: 'not-a-sha' };
expectError('ODG-026-INVALID-INPUT-HASH-REJECTED', () => makePlan(badHash, wf), 'INVALID_INPUT_HASH');

expectError('ODG-027-INVALID-OBJECTIVE-HASH-REJECTED', () => makePlan(baseTasks(), wf, { objective_hash_sha256: 'bad' }), 'INVALID_OBJECTIVE_HASH');

const mixed = [
  task('T-CANON','DECLARED_BLOCKED_CAPABILITY','CANON.CONSISTENCY_CHECK','CANON_TRUTH'),
  task('T-AUTHOR','AUTHORITY_WAIT',null,null,[],{authority_wait_owner:'AUTHOR'})
];
const mixedPlan = makePlan(mixed, wf, { plan_id: 'PLAN-MULTI-BLOCK' });
if (mixedPlan.readiness_state !== 'BLOCKED_MULTIPLE') throw new Error('MULTI_BLOCK_STATE_WRONG');
pass('ODG-028-MULTIPLE-BLOCKERS-PRESERVED');

const contextPlan = makePlan([task('T-PROSE','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS',[],{context_package_refs:['CTX-OPAQUE-001']})], wf, {plan_id:'PLAN-CONTEXT-REF'});
if (contextPlan.tasks[0].context_package_refs[0] !== 'CTX-OPAQUE-001') throw new Error('CONTEXT_REF_NOT_PRESERVED');
pass('ODG-029-OPAQUE-CONTEXT-REF-PRESERVED-WITHOUT-COMPILATION');

const exported = Object.keys(planRuntime);
if (exported.some(name => /execute|dispatch|schedule|parallel|retry|admit/i.test(name) && name !== 'createExecutionPlan' && name !== 'validateExecutionPlan')) throw new Error(`UNAUTHORIZED_EXECUTION_API:${exported.join(',')}`);
pass('ODG-030-NO-EXECUTION-SCHEDULING-RETRY-OR-ADMISSION-API');

const summary = {
  qualification_id: 'BOOK-WORKFLOW-ORCHESTRATOR-DEPENDENCY-GRAPH-EXECUTION-PLAN-001-QUALIFICATION',
  result: 'PASS',
  subject_sha: process.env.GITHUB_SHA || null,
  fixture_class: 'SYNTHETIC_NON_PRIVATE_EXECUTION_PLAN_STRUCTURE',
  planned_cases: 30,
  passed_cases: results.length,
  assertions: results.length,
  canonical_manuscript_mutated: false,
  specialist_execution_performed: false,
  prose_runtime_mutated: false,
  fresh_blind_scoring_executed: false,
  concurrency_authority_claimed: false,
  scheduler_execution_performed: false,
  retry_authority_claimed: false,
  book_admission_executed: false,
  a01_pass_claimed_for_this_subject: false,
  native_private_publication_production_claimed: false,
  results
};
if (results.length !== 30) throw new Error(`CASE_COUNT_MISMATCH:${results.length}`);
const out = path.join(process.env.RUNNER_TEMP || '/tmp', 'book-workflow-orchestrator-dependency-graph-execution-plan-001-summary.json');
fs.writeFileSync(out, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
