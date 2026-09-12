'use strict';

const assert = require('assert');
const crypto = require('crypto');
const bindingRuntime = require('./book-capability-binding-v1');
const bindingSource = require('./book-capability-binding-v1.registry.json');
const planRuntime = require('./book-workflow-execution-plan');
const foundation = require('./book-execution-foundation-b01');

let checks = 0;
function ok(v, m) { assert(v, m); checks += 1; }
function eq(a, b, m) { assert.strictEqual(a, b, m); checks += 1; }
function expectCode(fn, code) {
  let caught = null;
  try { fn(); } catch (err) { caught = err; }
  ok(caught, `expected ${code}`);
  eq(caught.code, code, `expected ${code}`);
}
function h(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }

const registry = bindingRuntime.buildRegistry(bindingSource);

function boundRef(binding, suffix) {
  return {
    bound_context_id: `book-bound-context-v1:${h(`bound:${suffix}:${binding.binding_digest}`)}`,
    bound_context_digest_sha256: h(`bound:${suffix}:${binding.binding_digest}`),
    current_capability_id: binding.current_capability_id,
    capability_binding_digest: binding.binding_digest
  };
}

function currentTask(taskId, capabilityId, domain, deps = [], sourceRegistry = registry) {
  const b = bindingRuntime.resolveBinding(capabilityId, domain, { registry: sourceRegistry });
  return {
    task_id: taskId,
    task_class: 'SPECIALIST_SERVICE_TASK',
    capability_id: capabilityId,
    required_authority_domain: domain,
    capability_binding_id: b.binding_id,
    capability_binding_digest: b.binding_digest,
    authority_wait_owner: null,
    required_dependency_ids: deps,
    optional_dependency_ids: [],
    input_ref_hashes: { [`input:${taskId}`]: h(`input:${taskId}`) },
    context_package_refs: [`context://${taskId}`],
    bound_context_refs: [boundRef(b, taskId)],
    required_for_plan_success: true
  };
}

function makePlan(tasks) {
  const plan = {
    plan_schema_version: 2,
    plan_id: 'plan-b01-d3',
    plan_version: 1,
    plan_digest: '',
    workflow_id: 'workflow-b01-d3',
    workflow_state_identity: { workflow_version: 7, workflow_digest: h('workflow-b01-d3') },
    book_project_id: 'book-b01-d3',
    source_identity: {
      book_state_version: 12,
      book_state_digest: h('book-state-12'),
      canonical_manuscript_ref: 'book://canonical/b01-d3',
      manuscript_version_id: 'mv-12',
      manuscript_digest_sha256: h('manuscript-12')
    },
    objective_ref: 'objective://b01-d3',
    objective_hash_sha256: h('objective-b01-d3'),
    tasks,
    created_at: '2026-09-12T05:40:00-04:00'
  };
  plan.plan_digest = planRuntime.digestPlan(plan);
  return plan;
}

const tasks = [
  currentTask('analyze', 'BOOK.LITERARY.ANALYZE_PASSAGE', 'LITERARY_DIAGNOSIS'),
  currentTask('generate', 'BOOK.LITERARY.GENERATE_REVISION_CANDIDATE', 'LITERARY_CANDIDATE_GENERATION', ['analyze']),
  currentTask('evaluate', 'BOOK.EVALUATION.INDEPENDENT_BOOK_OR_UNIT', 'LITERARY_EVALUATION_EVIDENCE', ['generate'])
];
const plan = makePlan(tasks);

// Current routing is Book-owned and never grants dispatch/effect authority by itself.
for (const b of registry.bindings) {
  const route = foundation.resolveCurrentRoute({
    capability_id: b.current_capability_id,
    required_authority_domain: b.authority_domain,
    capability_binding_id: b.binding_id,
    capability_binding_digest: b.binding_digest
  }, { binding_registry: registry });
  eq(route.current_owner_path, 'SYSTEM_MASTER/BOOK');
  eq(route.capability_binding_digest, b.binding_digest);
  eq(route.provider_provenance.historical_or_provider_service_id, b.provider_provenance.historical_or_provider_service_id);
  eq(route.provider_provenance.operation_id, b.provider_provenance.operation_id);
  eq(route.current_dispatch_eligible, false);
  eq(route.canonical_write_authority, false);
  eq(route.publication_authority, false);
  eq(route.private_data_authority, 'NOT_GRANTED_BY_BINDING');
  ok(route.dispatch_blocker.startsWith('BLOCKED_'));
}

const generatedRoute = foundation.resolveCurrentRoute({
  capability_id: 'BOOK.LITERARY.GENERATE_REVISION_CANDIDATE',
  required_authority_domain: 'LITERARY_CANDIDATE_GENERATION'
}, { binding_registry: registry });
eq(generatedRoute.registered_idempotent, false);
eq(generatedRoute.concurrency_policy_class, 'SERIAL_ONLY_NONIDEMPOTENT_OR_SIDE_EFFECTING');
eq(generatedRoute.dispatch_blocker, 'BLOCKED_PROVIDER_SUBJECT_UNADMITTED');
const evaluatorRoute = foundation.resolveCurrentRoute({
  capability_id: 'BOOK.EVALUATION.INDEPENDENT_BOOK_OR_UNIT',
  required_authority_domain: 'LITERARY_EVALUATION_EVIDENCE'
}, { binding_registry: registry });
eq(evaluatorRoute.concurrency_policy_class, 'ISOLATION_GATED');
eq(evaluatorRoute.dispatch_blocker, 'BLOCKED_EVALUATOR_ISOLATION');

expectCode(() => foundation.resolveCurrentRoute({ capability_id: 'PROSE.ANALYZE_PASSAGE', required_authority_domain: 'LITERARY_DIAGNOSIS' }, { binding_registry: registry }), 'RETIRED_PROSE_EXECUTION_ID');
expectCode(() => foundation.resolveCurrentRoute({ capability_id: 'BOOK.LITERARY.UNKNOWN', required_authority_domain: 'X' }, { binding_registry: registry }), 'CAPABILITY_BINDING_NOT_FOUND');
expectCode(() => foundation.resolveCurrentRoute({ capability_id: 'BOOK.LITERARY.ANALYZE_PASSAGE', required_authority_domain: 'WRONG' }, { binding_registry: registry }), 'CAPABILITY_AUTHORITY_DOMAIN_MISMATCH');

// Plan binding makes exact current capability binding identity part of task and plan semantic identity.
const bindingPlan = foundation.bindExecutionPlan(plan, { binding_registry: registry });
eq(bindingPlan.task_bindings.length, 3);
eq(bindingPlan.canonical_effect, false);
ok(/^[0-9a-f]{64}$/.test(bindingPlan.binding_plan_digest));
ok(bindingPlan.binding_plan_id.endsWith(bindingPlan.binding_plan_digest));
ok(foundation.validateExecutionBindingPlan(bindingPlan, plan, { binding_registry: registry }));
for (const tb of bindingPlan.task_bindings) {
  ok(/^[0-9a-f]{64}$/.test(tb.task_execution_identity_digest));
  eq(tb.current_dispatch_eligible, false);
  ok(tb.dispatch_blocker.startsWith('BLOCKED_'));
}

const analyzeTB = bindingPlan.task_bindings.find(x => x.task_id === 'analyze');
const generateTB = bindingPlan.task_bindings.find(x => x.task_id === 'generate');
const evaluateTB = bindingPlan.task_bindings.find(x => x.task_id === 'evaluate');
eq(analyzeTB.concurrency_policy_class, 'READ_ONLY_PARALLEL_ELIGIBLE');
eq(generateTB.concurrency_policy_class, 'SERIAL_ONLY_NONIDEMPOTENT_OR_SIDE_EFFECTING');
eq(evaluateTB.concurrency_policy_class, 'ISOLATION_GATED');

// Concurrency is policy-only in D3; no task becomes executable from concurrency classification.
const concurrency = foundation.deriveCurrentConcurrency(bindingPlan, plan, { binding_registry: registry });
eq(concurrency.canonical_effect, false);
eq(concurrency.decisions.length, 3);
eq(concurrency.decisions.find(x => x.task_id === 'analyze').parallel_policy_eligible, true);
eq(concurrency.decisions.find(x => x.task_id === 'analyze').executable_now, false);
eq(concurrency.decisions.find(x => x.task_id === 'generate').parallel_policy_eligible, false);
eq(concurrency.decisions.find(x => x.task_id === 'evaluate').blocker, 'BLOCKED_EVALUATOR_ISOLATION');

// Operation identity binds plan + task + current binding + provider service/operation + context refs.
const genOp = foundation.buildCurrentOperationIdentity(bindingPlan, plan, 'generate', { binding_registry: registry });
ok(foundation.validateCurrentOperationIdentity(genOp));
eq(genOp.registered_idempotent, false);
eq(genOp.projection.current_capability_id, 'BOOK.LITERARY.GENERATE_REVISION_CANDIDATE');
eq(genOp.projection.capability_binding_digest, generateTB.capability_binding_digest);
eq(genOp.projection.provider_service_id, 'PROSE_ANALYSIS_AND_REVISION');
eq(genOp.projection.provider_operation_id, 'GENERATE_BOUNDED_REVISION_CANDIDATE');
ok(genOp.idempotency_key.endsWith(genOp.operation_digest));

const analyzeOp = foundation.buildCurrentOperationIdentity(bindingPlan, plan, 'analyze', { binding_registry: registry });
eq(analyzeOp.registered_idempotent, true);
ok(!foundation.sameLogicalOperation(analyzeOp, genOp));

// Non-idempotent unknown outcome never authorizes automatic regeneration.
const unknownGen = foundation.deriveCurrentRetryDecision({
  plan,
  binding_plan: bindingPlan,
  task_id: 'generate',
  observed_outcome: 'UNKNOWN_OUTCOME',
  reconciliation_state: 'NOT_PERFORMED',
  reconciliation_evidence_refs: []
}, { binding_registry: registry });
eq(unknownGen.decision_class, 'RECONCILE_REQUIRED');
eq(unknownGen.automatic_dispatch_authorized, false);
eq(unknownGen.canonical_effect, false);

expectCode(() => foundation.deriveCurrentRetryDecision({
  plan,
  binding_plan: bindingPlan,
  task_id: 'generate',
  observed_outcome: 'UNKNOWN_OUTCOME',
  reconciliation_state: 'CONFIRMED_NO_EFFECT',
  reconciliation_evidence_refs: []
}, { binding_registry: registry }), 'RECONCILIATION_EVIDENCE_REQUIRED');

const confirmedNoEffect = foundation.deriveCurrentRetryDecision({
  plan,
  binding_plan: bindingPlan,
  task_id: 'generate',
  observed_outcome: 'UNKNOWN_OUTCOME',
  reconciliation_state: 'CONFIRMED_NO_EFFECT',
  reconciliation_evidence_refs: ['evidence://reconcile/no-effect']
}, { binding_registry: registry });
eq(confirmedNoEffect.decision_class, 'NEW_ATTEMPT_AFTER_CONFIRMED_NO_EFFECT_POLICY');
eq(confirmedNoEffect.automatic_dispatch_authorized, false);

const existing = foundation.deriveCurrentRetryDecision({
  plan,
  binding_plan: bindingPlan,
  task_id: 'generate',
  observed_outcome: 'UNKNOWN_OUTCOME',
  reconciliation_state: 'CONFIRMED_EXISTING_RESULT',
  reconciliation_evidence_refs: ['evidence://reconcile/existing']
}, { binding_registry: registry });
eq(existing.decision_class, 'REUSE_OR_REVIEW_EXISTING_RESULT');
eq(existing.automatic_dispatch_authorized, false);

const safeReplayPolicy = foundation.deriveCurrentRetryDecision({
  plan,
  binding_plan: bindingPlan,
  task_id: 'analyze',
  observed_outcome: 'UNKNOWN_OUTCOME',
  reconciliation_state: 'NOT_APPLICABLE',
  reconciliation_evidence_refs: []
}, { binding_registry: registry });
eq(safeReplayPolicy.decision_class, 'SAFE_SAME_OPERATION_REPLAY_POLICY');
eq(safeReplayPolicy.automatic_dispatch_authorized, false);

// Changing an adapter/binding requires a changed task/plan/operation identity rather than reuse.
const changedSource = JSON.parse(JSON.stringify(bindingSource));
changedSource.binding_inputs[0].adapter_version = '1.0.1';
const changedRegistry = bindingRuntime.buildRegistry(changedSource);
const changedAnalyzeBinding = bindingRuntime.resolveBinding('BOOK.LITERARY.ANALYZE_PASSAGE', 'LITERARY_DIAGNOSIS', { registry: changedRegistry });
const changedTasks = JSON.parse(JSON.stringify(tasks));
changedTasks[0].capability_binding_id = changedAnalyzeBinding.binding_id;
changedTasks[0].capability_binding_digest = changedAnalyzeBinding.binding_digest;
changedTasks[0].bound_context_refs = [boundRef(changedAnalyzeBinding, 'analyze')];
const changedPlan = makePlan(changedTasks);
const changedBindingPlan = foundation.bindExecutionPlan(changedPlan, { binding_registry: changedRegistry });
const changedAnalyzeOp = foundation.buildCurrentOperationIdentity(changedBindingPlan, changedPlan, 'analyze', { binding_registry: changedRegistry });
ok(changedPlan.plan_digest !== plan.plan_digest);
ok(changedBindingPlan.binding_plan_digest !== bindingPlan.binding_plan_digest);
ok(changedAnalyzeOp.operation_digest !== analyzeOp.operation_digest);

const changedDecision = foundation.deriveCurrentRetryDecision({
  plan: changedPlan,
  binding_plan: changedBindingPlan,
  task_id: 'analyze',
  prior_operation_identity: analyzeOp,
  observed_outcome: 'UNKNOWN_OUTCOME',
  reconciliation_state: 'NOT_APPLICABLE',
  reconciliation_evidence_refs: []
}, { binding_registry: changedRegistry });
eq(changedDecision.decision_class, 'NEW_OPERATION_REQUIRED_CHANGED_BINDING_OR_INPUTS');
eq(changedDecision.automatic_dispatch_authorized, false);

// Stale binding metadata and stale bound-context binding fail before execution semantics are emitted.
expectCode(() => foundation.bindExecutionPlan(plan, { binding_registry: changedRegistry }), 'CAPABILITY_BINDING_ID_MISMATCH');
const staleContextPlan = JSON.parse(JSON.stringify(plan));
staleContextPlan.tasks[0].bound_context_refs[0].capability_binding_digest = '0'.repeat(64);
staleContextPlan.plan_digest = planRuntime.digestPlan(staleContextPlan);
expectCode(() => foundation.bindExecutionPlan(staleContextPlan, { binding_registry: registry }), 'BOUND_CONTEXT_BINDING_MISMATCH');

// Retired identity, missing binding, and raw/private content remain fail-closed.
const retiredPlan = makePlan([{
  ...tasks[0],
  task_id: 'retired',
  capability_id: 'PROSE.ANALYZE_PASSAGE'
}]);
expectCode(() => foundation.bindExecutionPlan(retiredPlan, { binding_registry: registry }), 'RETIRED_PROSE_EXECUTION_ID');
const missingBindingTask = JSON.parse(JSON.stringify(tasks[0]));
delete missingBindingTask.capability_binding_id;
const missingBindingPlan = makePlan([missingBindingTask]);
expectCode(() => foundation.bindExecutionPlan(missingBindingPlan, { binding_registry: registry }), 'CURRENT_CAPABILITY_BINDING_REQUIRED');
const rawPlan = JSON.parse(JSON.stringify(plan));
rawPlan.tasks[0].raw_manuscript_text = 'forbidden';
rawPlan.plan_digest = planRuntime.digestPlan(rawPlan);
expectCode(() => foundation.bindExecutionPlan(rawPlan, { binding_registry: registry }), 'FORBIDDEN_CONTENT_FIELD');

// Provider subject reference changes semantic binding but still does not grant availability or dispatch.
const subjectSource = JSON.parse(JSON.stringify(bindingSource));
subjectSource.binding_inputs[0].provider_provenance.provider_subject_ref = 'provider-subject://observed-reference-only';
const subjectRegistry = bindingRuntime.buildRegistry(subjectSource);
const subjectBinding = bindingRuntime.resolveBinding('BOOK.LITERARY.ANALYZE_PASSAGE', 'LITERARY_DIAGNOSIS', { registry: subjectRegistry });
const subjectRoute = foundation.resolveCurrentRoute({
  capability_id: subjectBinding.current_capability_id,
  required_authority_domain: subjectBinding.authority_domain,
  capability_binding_id: subjectBinding.binding_id,
  capability_binding_digest: subjectBinding.binding_digest
}, { binding_registry: subjectRegistry });
eq(subjectRoute.provider_provenance.provider_subject_ref, 'provider-subject://observed-reference-only');
eq(subjectRoute.current_dispatch_eligible, false);
eq(subjectRoute.dispatch_blocker, 'BLOCKED_PROVIDER_AVAILABILITY_UNPROVEN');

console.log(JSON.stringify({
  result: 'PASS',
  checks,
  current_book_capability_mappings: registry.bindings.length,
  execution_plan_task_bindings: bindingPlan.task_bindings.length,
  retired_prose_execution_allowed: false,
  scheduler_dispatch_changed: false,
  current_dispatch_authorized_by_d3: false,
  nonidempotent_unknown_outcome_auto_replay: false,
  evaluator_isolation_satisfied: false,
  provider_subjects_admitted: 0,
  canonical_effect_allowed: false,
  publication_authority_granted: false,
  private_authority_granted: false
}));
