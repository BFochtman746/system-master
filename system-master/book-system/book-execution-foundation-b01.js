'use strict';

const crypto = require('crypto');
const bindingRuntime = require('./book-capability-binding-v1');
const planRuntime = require('./book-workflow-execution-plan');

const SCHEMA_VERSION = '1';
const SHA256 = /^[0-9a-f]{64}$/;
const FORBIDDEN_RAW_FIELDS = new Set([
  'manuscript_text','passage_text','candidate_text','raw_manuscript','raw_passage','raw_candidate',
  'raw_manuscript_text','raw_candidate_text','private_gold_labels','blind_case_labels','author_secret',
  'provider_chain_of_thought','canonical_mutation_command','publication_credentials','production_credentials'
]);

class BookExecutionFoundationB01Error extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookExecutionFoundationB01Error';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookExecutionFoundationB01Error(code, detail); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function stable(v) { return bindingRuntime.stable(v); }
function stableStringify(v) { return JSON.stringify(stable(v)); }
function sha256(v) { return crypto.createHash('sha256').update(String(v), 'utf8').digest('hex'); }

function assertNoForbidden(value, where = '$') {
  if (Array.isArray(value)) return value.forEach((item, i) => assertNoForbidden(item, `${where}[${i}]`));
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_RAW_FIELDS.has(key)) fail('FORBIDDEN_CONTENT_FIELD', `${where}.${key}`);
    assertNoForbidden(child, `${where}.${key}`);
  }
}

function isCurrentBookCapability(capabilityId) {
  return typeof capabilityId === 'string' && (capabilityId.startsWith('BOOK.LITERARY.') || capabilityId.startsWith('BOOK.EVALUATION.'));
}

function assertNotRetiredExecutionIdentity(capabilityId, ownerPath) {
  if (String(capabilityId || '').toUpperCase().startsWith('PROSE.')) fail('RETIRED_PROSE_EXECUTION_ID', capabilityId);
  const owner = String(ownerPath || '').toUpperCase();
  if (owner === 'SYSTEM_MASTER/BOOK/PROSE' || owner.startsWith('SYSTEM_MASTER/BOOK/PROSE/')) fail('RETIRED_PROSE_OWNER_PATH', ownerPath);
  return true;
}

function routeBlocker(binding) {
  if (binding.concurrency_policy_class === 'ISOLATION_GATED') return 'BLOCKED_EVALUATOR_ISOLATION';
  if (binding.provider_provenance.provider_subject_ref === null) return 'BLOCKED_PROVIDER_SUBJECT_UNADMITTED';
  return 'BLOCKED_PROVIDER_AVAILABILITY_UNPROVEN';
}

function resolveCurrentRoute(request, options = {}) {
  if (!isObject(request)) fail('ROUTE_REQUEST_REQUIRED');
  if (!nonEmpty(request.capability_id)) fail('CAPABILITY_ID_REQUIRED');
  assertNotRetiredExecutionIdentity(request.capability_id, request.owner_path);
  if (!isCurrentBookCapability(request.capability_id)) fail('CURRENT_BOOK_CAPABILITY_REQUIRED', request.capability_id);

  let binding;
  try {
    binding = bindingRuntime.resolveBinding(request.capability_id, request.required_authority_domain, {
      registry: options.binding_registry || bindingRuntime.buildRegistry(),
      requireExecutable: false
    });
  } catch (err) {
    fail(err.code || 'CAPABILITY_BINDING_INVALID', request.capability_id);
  }

  if (request.capability_binding_id !== undefined && request.capability_binding_id !== binding.binding_id) fail('CAPABILITY_BINDING_ID_MISMATCH', request.capability_id);
  if (request.capability_binding_digest !== undefined && request.capability_binding_digest !== binding.binding_digest) fail('CAPABILITY_BINDING_DIGEST_MISMATCH', request.capability_id);

  return stable({
    route_schema_version: SCHEMA_VERSION,
    current_capability_id: binding.current_capability_id,
    current_owner_path: binding.current_owner_path,
    authority_domain: binding.authority_domain,
    capability_binding_id: binding.binding_id,
    capability_binding_digest: binding.binding_digest,
    adapter_id: binding.adapter_id,
    adapter_version: binding.adapter_version,
    provider_provenance: clone(binding.provider_provenance),
    registered_idempotent: binding.registered_idempotent,
    concurrency_policy_class: binding.concurrency_policy_class,
    current_dispatch_eligible: false,
    dispatch_blocker: routeBlocker(binding),
    canonical_write_authority: false,
    lifecycle_transition_authority: false,
    export_freeze_authority: false,
    publication_authority: false,
    author_decision_authority: false,
    private_data_authority: 'NOT_GRANTED_BY_BINDING'
  });
}

function validatePlanSkeleton(plan) {
  if (!isObject(plan)) fail('PLAN_OBJECT_REQUIRED');
  assertNoForbidden(plan, 'plan');
  for (const field of ['plan_id','plan_digest','workflow_id','workflow_state_identity','book_project_id','source_identity','tasks']) {
    if (!Object.prototype.hasOwnProperty.call(plan, field)) fail('PLAN_FIELD_MISSING', field);
  }
  if (!nonEmpty(plan.plan_id) || !SHA256.test(String(plan.plan_digest || '')) || !nonEmpty(plan.workflow_id) || !nonEmpty(plan.book_project_id)) fail('PLAN_IDENTITY_INVALID');
  if (!isObject(plan.workflow_state_identity) || !nonEmpty(plan.workflow_state_identity.workflow_digest)) fail('WORKFLOW_STATE_IDENTITY_REQUIRED');
  if (!isObject(plan.source_identity)) fail('SOURCE_IDENTITY_REQUIRED');
  if (!Array.isArray(plan.tasks) || plan.tasks.length === 0) fail('PLAN_TASKS_REQUIRED');
  if (plan.plan_digest !== planRuntime.digestPlan(plan)) fail('PLAN_DIGEST_MISMATCH');
  const layers = planRuntime.topologicalLayers(plan.tasks);
  return layers;
}

function validateBoundContextRef(ref, task, route) {
  if (!isObject(ref)) fail('BOUND_CONTEXT_REF_REQUIRED', task.task_id);
  for (const field of ['bound_context_id','bound_context_digest_sha256','current_capability_id','capability_binding_digest']) {
    if (!nonEmpty(ref[field])) fail('BOUND_CONTEXT_REF_FIELD_MISSING', `${task.task_id}:${field}`);
  }
  if (!SHA256.test(ref.bound_context_digest_sha256)) fail('BOUND_CONTEXT_DIGEST_INVALID', task.task_id);
  if (ref.current_capability_id !== task.capability_id) fail('BOUND_CONTEXT_CAPABILITY_MISMATCH', task.task_id);
  if (ref.capability_binding_digest !== route.capability_binding_digest) fail('BOUND_CONTEXT_BINDING_MISMATCH', task.task_id);
  return true;
}

function taskExecutionProjection(plan, task, route) {
  return stable({
    workflow_id: plan.workflow_id,
    workflow_digest: plan.workflow_state_identity.workflow_digest,
    book_project_id: plan.book_project_id,
    source_identity: clone(plan.source_identity),
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    task_id: task.task_id,
    task_class: task.task_class,
    capability_id: task.capability_id,
    required_authority_domain: task.required_authority_domain,
    capability_binding_id: route.capability_binding_id,
    capability_binding_digest: route.capability_binding_digest,
    adapter_id: route.adapter_id,
    adapter_version: route.adapter_version,
    provider_service_id: route.provider_provenance.historical_or_provider_service_id,
    provider_operation_id: route.provider_provenance.operation_id,
    provider_subject_ref: route.provider_provenance.provider_subject_ref,
    input_ref_hashes: clone(task.input_ref_hashes || {}),
    context_package_refs: clone(task.context_package_refs || []),
    bound_context_refs: clone(task.bound_context_refs || [])
  });
}

function bindExecutionPlan(plan, options = {}) {
  const layers = validatePlanSkeleton(plan);
  const layerIndex = new Map();
  layers.forEach((layer, index) => layer.forEach(id => layerIndex.set(id, index)));
  const taskBindings = [];

  for (const task of plan.tasks) {
    if (!isObject(task) || !nonEmpty(task.task_id) || !nonEmpty(task.task_class)) fail('TASK_IDENTITY_REQUIRED');
    if (task.task_class !== 'SPECIALIST_SERVICE_TASK') continue;
    if (String(task.capability_id || '').toUpperCase().startsWith('PROSE.')) fail('RETIRED_PROSE_EXECUTION_ID', task.task_id);
    if (!isCurrentBookCapability(task.capability_id)) continue;
    if (!nonEmpty(task.required_authority_domain)) fail('REQUIRED_AUTHORITY_DOMAIN_REQUIRED', task.task_id);
    if (!nonEmpty(task.capability_binding_id) || !SHA256.test(String(task.capability_binding_digest || ''))) fail('CURRENT_CAPABILITY_BINDING_REQUIRED', task.task_id);
    if (!Array.isArray(task.bound_context_refs) || task.bound_context_refs.length === 0) fail('BOUND_CONTEXT_REF_REQUIRED', task.task_id);

    const route = resolveCurrentRoute({
      capability_id: task.capability_id,
      required_authority_domain: task.required_authority_domain,
      capability_binding_id: task.capability_binding_id,
      capability_binding_digest: task.capability_binding_digest
    }, options);
    for (const ref of task.bound_context_refs) validateBoundContextRef(ref, task, route);
    const projection = taskExecutionProjection(plan, task, route);
    const taskDigest = sha256(stableStringify(projection));
    taskBindings.push(stable({
      task_id: task.task_id,
      topological_layer: layerIndex.get(task.task_id),
      current_capability_id: route.current_capability_id,
      capability_binding_id: route.capability_binding_id,
      capability_binding_digest: route.capability_binding_digest,
      task_execution_identity_digest: taskDigest,
      concurrency_policy_class: route.concurrency_policy_class,
      registered_idempotent: route.registered_idempotent,
      dispatch_blocker: route.dispatch_blocker,
      current_dispatch_eligible: false,
      provider_service_id: route.provider_provenance.historical_or_provider_service_id,
      provider_operation_id: route.provider_provenance.operation_id,
      provider_subject_ref: route.provider_provenance.provider_subject_ref
    }));
  }

  const projection = stable({
    binding_plan_schema_version: SCHEMA_VERSION,
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    workflow_id: plan.workflow_id,
    workflow_digest: plan.workflow_state_identity.workflow_digest,
    source_identity: clone(plan.source_identity),
    task_bindings: taskBindings
  });
  const digest = sha256(stableStringify(projection));
  return stable({
    ...projection,
    binding_plan_id: `book-execution-binding-plan-v1:${digest}`,
    binding_plan_digest: digest,
    canonical_effect: false
  });
}

function validateExecutionBindingPlan(bindingPlan, plan, options = {}) {
  if (!isObject(bindingPlan)) fail('EXECUTION_BINDING_PLAN_REQUIRED');
  const rebuilt = bindExecutionPlan(plan, options);
  if (stableStringify(rebuilt) !== stableStringify(bindingPlan)) fail('STALE_EXECUTION_BINDING_PLAN');
  return true;
}

function deriveCurrentConcurrency(bindingPlan, plan, options = {}) {
  validateExecutionBindingPlan(bindingPlan, plan, options);
  const decisions = bindingPlan.task_bindings.map(tb => stable({
    task_id: tb.task_id,
    topological_layer: tb.topological_layer,
    capability_binding_digest: tb.capability_binding_digest,
    policy_class: tb.concurrency_policy_class,
    parallel_policy_eligible: tb.concurrency_policy_class === 'READ_ONLY_PARALLEL_ELIGIBLE',
    executable_now: false,
    blocker: tb.dispatch_blocker
  }));
  const projection = stable({
    concurrency_schema_version: SCHEMA_VERSION,
    plan_id: bindingPlan.plan_id,
    plan_digest: bindingPlan.plan_digest,
    binding_plan_digest: bindingPlan.binding_plan_digest,
    decisions
  });
  return stable({ ...projection, concurrency_digest: sha256(stableStringify(projection)), canonical_effect: false });
}

function buildCurrentOperationIdentity(bindingPlan, plan, taskId, options = {}) {
  validateExecutionBindingPlan(bindingPlan, plan, options);
  const taskBinding = bindingPlan.task_bindings.find(x => x.task_id === taskId);
  if (!taskBinding) fail('CURRENT_BOOK_TASK_BINDING_NOT_FOUND', taskId);
  const task = plan.tasks.find(x => x.task_id === taskId);
  if (!task) fail('TASK_NOT_IN_PLAN', taskId);
  const projection = stable({
    workflow_id: plan.workflow_id,
    workflow_digest: plan.workflow_state_identity.workflow_digest,
    book_project_id: plan.book_project_id,
    source_identity: clone(plan.source_identity),
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    binding_plan_digest: bindingPlan.binding_plan_digest,
    task_id: task.task_id,
    task_execution_identity_digest: taskBinding.task_execution_identity_digest,
    current_capability_id: taskBinding.current_capability_id,
    capability_binding_digest: taskBinding.capability_binding_digest,
    provider_service_id: taskBinding.provider_service_id,
    provider_operation_id: taskBinding.provider_operation_id,
    provider_subject_ref: taskBinding.provider_subject_ref,
    input_ref_hashes: clone(task.input_ref_hashes || {}),
    bound_context_refs: clone(task.bound_context_refs || [])
  });
  const digest = sha256(stableStringify(projection));
  return stable({
    operation_identity_schema_version: SCHEMA_VERSION,
    task_id,
    operation_digest: digest,
    idempotency_key: `book-b01-op-${digest}`,
    registered_idempotent: taskBinding.registered_idempotent,
    projection
  });
}

function validateCurrentOperationIdentity(identity) {
  if (!isObject(identity) || identity.operation_identity_schema_version !== SCHEMA_VERSION) fail('CURRENT_OPERATION_IDENTITY_REQUIRED');
  assertNoForbidden(identity, 'operation_identity');
  if (!SHA256.test(String(identity.operation_digest || ''))) fail('CURRENT_OPERATION_DIGEST_INVALID');
  if (identity.idempotency_key !== `book-b01-op-${identity.operation_digest}`) fail('CURRENT_IDEMPOTENCY_KEY_MISMATCH');
  if (typeof identity.registered_idempotent !== 'boolean') fail('CURRENT_IDEMPOTENCY_CLASS_REQUIRED');
  const expected = sha256(stableStringify(identity.projection));
  if (expected !== identity.operation_digest) fail('CURRENT_OPERATION_IDENTITY_DIGEST_MISMATCH');
  return true;
}

function sameLogicalOperation(a, b) {
  validateCurrentOperationIdentity(a);
  validateCurrentOperationIdentity(b);
  return a.operation_digest === b.operation_digest;
}

function deriveCurrentRetryDecision(input, options = {}) {
  if (!isObject(input)) fail('CURRENT_RETRY_INPUT_REQUIRED');
  assertNoForbidden(input, 'retry_input');
  const observed = input.observed_outcome;
  const reconciliation = input.reconciliation_state;
  if (!['UNKNOWN_OUTCOME','CONFIRMED_FAILURE_NO_EFFECT','CONFIRMED_SUCCESS'].includes(observed)) fail('INVALID_OBSERVED_OUTCOME');
  if (!['NOT_APPLICABLE','NOT_PERFORMED','CONFIRMED_NO_EFFECT','CONFIRMED_EXISTING_RESULT','UNRESOLVED','CONTRADICTORY'].includes(reconciliation)) fail('INVALID_RECONCILIATION_STATE');
  const identity = buildCurrentOperationIdentity(input.binding_plan, input.plan, input.task_id, options);
  const evidence = Array.isArray(input.reconciliation_evidence_refs) ? [...input.reconciliation_evidence_refs] : [];
  if (evidence.some(x => !nonEmpty(x)) || new Set(evidence).size !== evidence.length) fail('INVALID_RECONCILIATION_EVIDENCE_REFS');

  let decisionClass;
  if (input.prior_operation_identity) {
    validateCurrentOperationIdentity(input.prior_operation_identity);
    if (!sameLogicalOperation(input.prior_operation_identity, identity)) decisionClass = 'NEW_OPERATION_REQUIRED_CHANGED_BINDING_OR_INPUTS';
  }

  if (!decisionClass) {
    if (identity.registered_idempotent) {
      if (reconciliation !== 'NOT_APPLICABLE') fail('IDEMPOTENT_RECONCILIATION_STATE_MUST_BE_NOT_APPLICABLE');
      decisionClass = observed === 'CONFIRMED_SUCCESS' ? 'REUSE_OR_REVIEW_EXISTING_RESULT' : 'SAFE_SAME_OPERATION_REPLAY_POLICY';
    } else {
      if (observed === 'CONFIRMED_SUCCESS' || reconciliation === 'CONFIRMED_EXISTING_RESULT') {
        decisionClass = 'REUSE_OR_REVIEW_EXISTING_RESULT';
      } else if (reconciliation === 'CONFIRMED_NO_EFFECT') {
        if (evidence.length === 0) fail('RECONCILIATION_EVIDENCE_REQUIRED');
        decisionClass = 'NEW_ATTEMPT_AFTER_CONFIRMED_NO_EFFECT_POLICY';
      } else {
        if (reconciliation !== 'NOT_PERFORMED' && evidence.length === 0) fail('RECONCILIATION_EVIDENCE_REQUIRED');
        decisionClass = 'RECONCILE_REQUIRED';
      }
    }
  }

  const projection = stable({
    retry_decision_schema_version: SCHEMA_VERSION,
    plan_id: input.plan.plan_id,
    plan_digest: input.plan.plan_digest,
    binding_plan_digest: input.binding_plan.binding_plan_digest,
    task_id: input.task_id,
    operation_identity: identity,
    observed_outcome: observed,
    reconciliation_state: reconciliation,
    reconciliation_evidence_refs: evidence,
    decision_class: decisionClass,
    automatic_dispatch_authorized: false,
    canonical_effect: false
  });
  return stable({ ...projection, retry_decision_digest: sha256(stableStringify(projection)) });
}

module.exports = {
  SCHEMA_VERSION,
  BookExecutionFoundationB01Error,
  stableStringify,
  sha256,
  isCurrentBookCapability,
  assertNotRetiredExecutionIdentity,
  resolveCurrentRoute,
  validatePlanSkeleton,
  bindExecutionPlan,
  validateExecutionBindingPlan,
  deriveCurrentConcurrency,
  buildCurrentOperationIdentity,
  validateCurrentOperationIdentity,
  sameLogicalOperation,
  deriveCurrentRetryDecision
};
