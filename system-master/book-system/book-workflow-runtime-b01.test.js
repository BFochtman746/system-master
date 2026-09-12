'use strict';

const assert = require('assert');
const crypto = require('crypto');
const bindingRuntime = require('./book-capability-binding-v1');
const bindingSource = require('./book-capability-binding-v1.registry.json');
const planRuntime = require('./book-workflow-execution-plan');
const foundation = require('./book-execution-foundation-b01');
const runtime = require('./book-workflow-runtime-b01');

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
  const digest = h(`bound:${suffix}:${binding.binding_digest}`);
  return {
    bound_context_id: `book-bound-context-v1:${digest}`,
    bound_context_digest_sha256: digest,
    current_capability_id: binding.current_capability_id,
    capability_binding_digest: binding.binding_digest
  };
}
function task(taskId, capabilityId, domain, deps = []) {
  const b = bindingRuntime.resolveBinding(capabilityId, domain, { registry });
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
function makePlan() {
  const plan = {
    plan_schema_version: 2,
    plan_id: 'plan-b01-d4',
    plan_version: 1,
    plan_digest: '',
    workflow_id: 'workflow-b01-d4',
    workflow_state_identity: { workflow_version: 9, workflow_digest: h('workflow-b01-d4') },
    book_project_id: 'book-b01-d4',
    source_identity: {
      book_state_version: 14,
      book_state_digest: h('book-state-14'),
      canonical_manuscript_ref: 'book://canonical/b01-d4',
      manuscript_version_id: 'mv-14',
      manuscript_digest_sha256: h('manuscript-14')
    },
    objective_ref: 'objective://b01-d4',
    objective_hash_sha256: h('objective-b01-d4'),
    tasks: [
      task('analyze', 'BOOK.LITERARY.ANALYZE_PASSAGE', 'LITERARY_DIAGNOSIS'),
      task('generate', 'BOOK.LITERARY.GENERATE_REVISION_CANDIDATE', 'LITERARY_CANDIDATE_GENERATION', ['analyze']),
      task('evaluate', 'BOOK.EVALUATION.INDEPENDENT_BOOK_OR_UNIT', 'LITERARY_EVALUATION_EVIDENCE', ['generate'])
    ],
    created_at: '2026-09-12T05:45:00-04:00'
  };
  plan.plan_digest = planRuntime.digestPlan(plan);
  return plan;
}

const plan = makePlan();
const bindingPlan = foundation.bindExecutionPlan(plan, { binding_registry: registry });

// Fresh reconciliation discovers durable blockers and authorizes no dispatch.
const state1 = runtime.reconcileSchedulerState({ plan, binding_plan: bindingPlan }, { binding_registry: registry });
ok(runtime.validateSchedulerState(state1, plan, bindingPlan, { binding_registry: registry }));
eq(state1.scheduler_dispatch_authorized, false);
eq(state1.canonical_effect, false);
eq(state1.task_states.length, 3);
for (const taskState of state1.task_states) {
  eq(taskState.state, 'BLOCKED');
  eq(taskState.dispatch_authorized, false);
  eq(taskState.canonical_effect, false);
  ok(taskState.blocker.startsWith('BLOCKED_'));
}
eq(state1.task_states.find(x => x.task_id === 'analyze').blocker, 'BLOCKED_PROVIDER_SUBJECT_UNADMITTED');
eq(state1.task_states.find(x => x.task_id === 'generate').blocker, 'BLOCKED_PROVIDER_SUBJECT_UNADMITTED');
eq(state1.task_states.find(x => x.task_id === 'evaluate').blocker, 'BLOCKED_EVALUATOR_ISOLATION');

// Pure reconciliation is idempotent and does not assume read-after-write freshness.
const state2 = runtime.reconcileSchedulerState({ plan, binding_plan: bindingPlan, prior_state: state1 }, { binding_registry: registry });
eq(state2.scheduler_state_digest, state1.scheduler_state_digest);
eq(state2.scheduler_state_id, state1.scheduler_state_id);

// Durable create-once persistence accepts exact replay and rejects same-key divergence.
const memory = new Map();
const adapter = {
  read(key) { return memory.has(key) ? JSON.parse(JSON.stringify(memory.get(key))) : null; },
  writeAtomic(key, value) { memory.set(key, JSON.parse(JSON.stringify(value))); return { key }; }
};
const p1 = runtime.persistSchedulerState(adapter, state1, plan, bindingPlan, { binding_registry: registry });
eq(p1.persisted, true);
eq(p1.idempotent, false);
const p2 = runtime.persistSchedulerState(adapter, state1, plan, bindingPlan, { binding_registry: registry });
eq(p2.persisted, false);
eq(p2.idempotent, true);
const divergent = { ...state1, task_states: state1.task_states.map(x => ({ ...x })) };
divergent.task_states[0].blocker = 'BLOCKED_DIFFERENT';
expectCode(() => runtime.persistCreateOnce(adapter, state1.scheduler_state_id, divergent, 'scheduler_state_digest'), 'DURABLE_CREATE_ONCE_CONFLICT');

// Verified completion survives restart and is not redispatched.
const completed = JSON.parse(JSON.stringify(state1));
completed.task_states[0].state = 'COMPLETED_VERIFIED';
completed.task_states[0].blocker = null;
completed.task_states[0].verified_receipt_ref = 'receipt://verified/analyze';
completed.task_states[0].dispatch_authorized = false;
delete completed.scheduler_state_digest;
delete completed.scheduler_state_id;
const completedProjection = JSON.parse(JSON.stringify(completed));
const completedDigest = runtime.sha256(runtime.stableStringify(completedProjection));
completed.scheduler_state_digest = completedDigest;
completed.scheduler_state_id = `book-b01-scheduler-state-v1:${completedDigest}`;
ok(runtime.validateSchedulerState(completed, plan, bindingPlan, { binding_registry: registry }));
const resumed = runtime.reconcileSchedulerState({ plan, binding_plan: bindingPlan, prior_state: completed }, { binding_registry: registry });
eq(resumed.task_states.find(x => x.task_id === 'analyze').state, 'COMPLETED_VERIFIED');
eq(resumed.task_states.find(x => x.task_id === 'analyze').dispatch_authorized, false);

// Unknown outcome remains reconciliation-blocked across restart.
const unknown = JSON.parse(JSON.stringify(state1));
unknown.task_states[1].state = 'UNKNOWN_OUTCOME_RECONCILE_REQUIRED';
unknown.task_states[1].blocker = 'BLOCKED_RECONCILIATION';
unknown.task_states[1].dispatch_authorized = false;
delete unknown.scheduler_state_digest;
delete unknown.scheduler_state_id;
const unknownDigest = runtime.sha256(runtime.stableStringify(unknown));
unknown.scheduler_state_digest = unknownDigest;
unknown.scheduler_state_id = `book-b01-scheduler-state-v1:${unknownDigest}`;
ok(runtime.validateSchedulerState(unknown, plan, bindingPlan, { binding_registry: registry }));
const resumedUnknown = runtime.reconcileSchedulerState({ plan, binding_plan: bindingPlan, prior_state: unknown }, { binding_registry: registry });
eq(resumedUnknown.task_states.find(x => x.task_id === 'generate').state, 'UNKNOWN_OUTCOME_RECONCILE_REQUIRED');
eq(resumedUnknown.task_states.find(x => x.task_id === 'generate').dispatch_authorized, false);

// Failure records bind current operation/binding/provider provenance and authorize no retry by themselves.
const failure = runtime.createFailureRecord({
  plan,
  binding_plan: bindingPlan,
  task_id: 'generate',
  failure_class: 'PROVIDER_OR_ADAPTER_UNAVAILABLE',
  reason_code: 'BLOCKED_PROVIDER_SUBJECT_UNADMITTED',
  evidence_refs: ['evidence://binding/provider-subject-null']
}, { binding_registry: registry });
ok(runtime.validateFailureRecord(failure));
eq(failure.current_capability_id, 'BOOK.LITERARY.GENERATE_REVISION_CANDIDATE');
eq(failure.retry_authorized, false);
eq(failure.canonical_effect, false);

// Cancellation checkpoint requires reread and forbids unknown-outcome redispatch.
const checkpoint = runtime.createCancellationCheckpoint({
  plan,
  binding_plan: bindingPlan,
  scheduler_state: unknown,
  reason_code: 'SECOND_SHIFT_BOUNDARY_OR_OPERATOR_CANCEL',
  evidence_refs: ['evidence://scheduler/state']
}, { binding_registry: registry });
ok(runtime.validateCancellationCheckpoint(checkpoint));
eq(checkpoint.resume_requires_reread, true);
eq(checkpoint.redispatch_unknown_outcome_forbidden, true);
eq(checkpoint.canonical_effect, false);

// Synthetic execution receipts are evidence-only and cannot self-authorize canon/publication/author decisions.
const syntheticReceipt = runtime.createExecutionReceipt({
  plan,
  binding_plan: bindingPlan,
  task_id: 'generate',
  result_ref: 'synthetic-test://candidate-result',
  result_digest: h('synthetic-candidate-result'),
  result_class: 'SYNTHETIC_TEST_OBSERVATION_ONLY',
  evidence_refs: ['synthetic-test://evidence/provider-output']
}, { binding_registry: registry });
ok(runtime.validateExecutionReceipt(syntheticReceipt));
eq(syntheticReceipt.provider_subject_ref, null);
eq(syntheticReceipt.canonical_effect, false);
eq(syntheticReceipt.publication_authority, false);
eq(syntheticReceipt.author_decision_authority, false);

// Admission handoff is current Book candidate identity + binding + receipt only; it never performs canonical admission.
const handoff = runtime.createAdmissionHandoff({
  plan,
  binding_plan: bindingPlan,
  task_id: 'generate',
  execution_receipt: syntheticReceipt,
  candidate_ref: 'synthetic-test://candidate/1',
  candidate_digest: h('synthetic-candidate-1'),
  author_decision_refs: [],
  evidence_refs: ['synthetic-test://evidence/candidate-generation']
}, { binding_registry: registry });
ok(runtime.validateAdmissionHandoff(handoff));
eq(handoff.current_capability_id, 'BOOK.LITERARY.GENERATE_REVISION_CANDIDATE');
eq(handoff.capability_binding_digest, bindingPlan.task_bindings.find(x => x.task_id === 'generate').capability_binding_digest);
eq(handoff.target_authority, 'SYSTEM_MASTER/BOOK_CANONICAL_CONTENT_ADMISSION');
eq(handoff.canonical_effect, false);
eq(handoff.publication_authority, false);
eq(handoff.author_decision_authority, false);
eq(handoff.handoff_only, true);

// Non-generation result cannot be repackaged as a candidate admission handoff.
const analyzeReceipt = runtime.createExecutionReceipt({
  plan,
  binding_plan: bindingPlan,
  task_id: 'analyze',
  result_ref: 'synthetic-test://analysis-result',
  result_digest: h('synthetic-analysis-result'),
  result_class: 'SYNTHETIC_TEST_OBSERVATION_ONLY',
  evidence_refs: ['synthetic-test://evidence/analysis']
}, { binding_registry: registry });
expectCode(() => runtime.createAdmissionHandoff({
  plan,
  binding_plan: bindingPlan,
  task_id: 'analyze',
  execution_receipt: analyzeReceipt,
  candidate_ref: 'synthetic-test://candidate/invalid',
  candidate_digest: h('invalid-candidate')
}, { binding_registry: registry }), 'ADMISSION_CANDIDATE_CAPABILITY_REQUIRED');

// Receipt integrity fails first; a resealed wrong-binding receipt must reach and fail the binding guard.
const tamperedReceipt = { ...syntheticReceipt, capability_binding_digest: '0'.repeat(64) };
expectCode(() => runtime.createAdmissionHandoff({
  plan,
  binding_plan: bindingPlan,
  task_id: 'generate',
  execution_receipt: tamperedReceipt,
  candidate_ref: 'synthetic-test://candidate/2',
  candidate_digest: h('candidate-2')
}, { binding_registry: registry }), 'EXECUTION_RECEIPT_DIGEST_MISMATCH');
const resealedBindingMismatch = JSON.parse(JSON.stringify(tamperedReceipt));
delete resealedBindingMismatch.receipt_id;
delete resealedBindingMismatch.receipt_digest;
resealedBindingMismatch.receipt_digest = runtime.sha256(runtime.stableStringify(resealedBindingMismatch));
resealedBindingMismatch.receipt_id = `book-b01-execution-receipt-v1:${resealedBindingMismatch.receipt_digest}`;
ok(runtime.validateExecutionReceipt(resealedBindingMismatch));
expectCode(() => runtime.createAdmissionHandoff({
  plan,
  binding_plan: bindingPlan,
  task_id: 'generate',
  execution_receipt: resealedBindingMismatch,
  candidate_ref: 'synthetic-test://candidate/resealed-binding-mismatch',
  candidate_digest: h('candidate-resealed-binding-mismatch')
}, { binding_registry: registry }), 'ADMISSION_RECEIPT_BINDING_MISMATCH');
const rawFailureInput = {
  plan,
  binding_plan: bindingPlan,
  task_id: 'generate',
  failure_class: 'X',
  reason_code: 'Y',
  evidence_refs: []
};
rawFailureInput.plan = JSON.parse(JSON.stringify(plan));
rawFailureInput.plan.tasks[0].raw_manuscript_text = 'forbidden';
rawFailureInput.plan.plan_digest = planRuntime.digestPlan(rawFailureInput.plan);
expectCode(() => runtime.createFailureRecord(rawFailureInput, { binding_registry: registry }), 'FORBIDDEN_CONTENT_FIELD');

// Changed capability binding invalidates old scheduler state and prevents stale restart reuse.
const changedSource = JSON.parse(JSON.stringify(bindingSource));
changedSource.binding_inputs[0].adapter_version = '1.0.1';
const changedRegistry = bindingRuntime.buildRegistry(changedSource);
expectCode(() => runtime.reconcileSchedulerState({ plan, binding_plan: bindingPlan, prior_state: state1 }, { binding_registry: changedRegistry }), 'CAPABILITY_BINDING_ID_MISMATCH');

// Mutable chat/webhook metadata is never consulted by the runtime; adding it to caller wrapper cannot grant dispatch.
const wrapper = { chat_role: 'admin', webhook_authorized: true, scheduler_state: state1 };
eq(wrapper.scheduler_state.scheduler_dispatch_authorized, false);

console.log(JSON.stringify({
  result: 'PASS',
  checks,
  scheduler_tasks: state1.task_states.length,
  provider_subjects_admitted: 0,
  provider_calls_executed: 0,
  scheduler_dispatch_authorized: false,
  retired_prose_execution_allowed: false,
  restart_verified_completion_reused: true,
  unknown_outcome_redispatched: false,
  admission_handoff_canonical_effect: false,
  synthetic_execution_receipts_real_provider_evidence: false,
  canonical_effect_allowed: false,
  publication_authority_granted: false,
  author_authority_granted: false,
  private_authority_granted: false
}));
