'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const planRuntime = require('./book-workflow-execution-plan');
const routing = require('./book-capability-routing-interface');

const CONTRACT_PATH = path.join(__dirname, '../../qualification/book-system/book-prose-integration/orchestrator/BOOK-WORKFLOW-ORCHESTRATOR-RETRY-IDEMPOTENCY-RULES-001.json');
const SERVICE_REGISTRY_PATH = path.join(__dirname, '../../qualification/book-system/service-interface-002/BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-002.json');
const EXPECTED_SERVICE_REGISTRY_GIT_BLOB_SHA = 'd5c31835cb79e8267fdbe868f073ef311e85214f';
const EXPECTED_SERVICE_REGISTRY_QUALIFIED_SUBJECT_SHA = '77db6b550e9aeb1dfb956627376becbb591498f8';
const DECISION_SCHEMA_VERSION = 1;
const SHA256 = /^[a-f0-9]{64}$/;
const OBSERVED_OUTCOMES = new Set(['UNKNOWN_OUTCOME','CONFIRMED_FAILURE_NO_EFFECT','CONFIRMED_SUCCESS']);
const RECONCILIATION_STATES = new Set(['NOT_APPLICABLE','NOT_PERFORMED','CONFIRMED_NO_EFFECT','CONFIRMED_EXISTING_RESULT','UNRESOLVED','CONTRADICTORY']);
const DECISION_CLASSES = new Set(['SAFE_SAME_OPERATION_REPLAY','RECONCILE_REQUIRED','NEW_ATTEMPT_AFTER_CONFIRMED_NO_EFFECT','REUSE_OR_REVIEW_EXISTING_RESULT','NEW_OPERATION_REQUIRED_CHANGED_INPUTS','NOT_EXECUTABLE_BY_RETRY_POLICY','BOOK_ADMISSION_RETRY_NOT_AUTHORIZED']);
const FORBIDDEN_RAW_FIELDS = new Set(['manuscript_text','passage_text','candidate_text','raw_manuscript','raw_passage','raw_candidate']);

class BookRetryIdempotencyError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookRetryIdempotencyError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookRetryIdempotencyError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function stableNormalize(v) {
  if (Array.isArray(v)) return v.map(stableNormalize);
  if (isObject(v)) {
    const out = {};
    for (const key of Object.keys(v).sort()) out[key] = stableNormalize(v[key]);
    return out;
  }
  return v;
}
function stableStringify(v) { return JSON.stringify(stableNormalize(v)); }
function sha256(v) { return crypto.createHash('sha256').update(String(v), 'utf8').digest('hex'); }
function gitBlobSha(raw) {
  const bytes = Buffer.from(raw, 'utf8');
  return crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`, 'utf8')).update(bytes).digest('hex');
}
function loadContract() { return JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8')); }
function loadServiceRegistry() {
  const raw = fs.readFileSync(SERVICE_REGISTRY_PATH, 'utf8');
  if (gitBlobSha(raw) !== EXPECTED_SERVICE_REGISTRY_GIT_BLOB_SHA) fail('SERVICE_REGISTRY_EXACT_CONTENT_PIN_MISMATCH');
  return JSON.parse(raw);
}

function assertNoRawContent(value, where = 'retry') {
  if (Array.isArray(value)) return value.forEach((item, i) => assertNoRawContent(item, `${where}.${i}`));
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_RAW_FIELDS.has(key)) fail('RAW_MANUSCRIPT_CONTENT_FORBIDDEN', `${where}.${key}`);
    assertNoRawContent(child, `${where}.${key}`);
  }
}

function validateContract(contract) {
  if (!isObject(contract) || contract.contract_id !== 'BOOK-WORKFLOW-ORCHESTRATOR-RETRY-IDEMPOTENCY-RULES-001') fail('RETRY_CONTRACT_ID_MISMATCH');
  if (!isObject(contract.registered_service_policy_source)) fail('REGISTERED_SERVICE_POLICY_SOURCE_REQUIRED');
  if (contract.registered_service_policy_source.registry_id !== 'BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-002') fail('SERVICE_POLICY_REGISTRY_MISMATCH');
  if (contract.registered_service_policy_source.qualified_subject_sha !== EXPECTED_SERVICE_REGISTRY_QUALIFIED_SUBJECT_SHA) fail('SERVICE_POLICY_QUALIFIED_SUBJECT_MISMATCH');
  const special = contract.non_idempotent_special_case;
  if (!isObject(special) || special.capability_id !== 'PROSE.GENERATE_REVISION_CANDIDATE' || special.registered_idempotent !== false || special.automatic_retry_after_unknown_outcome !== false) fail('NONIDEMPOTENT_PROSE_RULE_INVALID');
  return true;
}

function validatePinnedServiceRegistry(serviceRegistry) {
  if (!isObject(serviceRegistry) || serviceRegistry.registry_id !== 'BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-002' || serviceRegistry.registry_version !== 2) fail('SERVICE_REGISTRY_IDENTITY_MISMATCH');
  const canonical = loadServiceRegistry();
  if (stableStringify(serviceRegistry) !== stableStringify(canonical)) fail('SERVICE_REGISTRY_EXACT_CONTENT_PIN_MISMATCH');
  return true;
}

function registeredOperationPolicy(capability, serviceRegistry) {
  const service = serviceRegistry && serviceRegistry.services && serviceRegistry.services[capability.service_id];
  const operation = service && service.operations && service.operations[capability.operation_id];
  if (!operation) fail('REGISTERED_SERVICE_OPERATION_NOT_FOUND', `${capability.service_id}:${capability.operation_id}`);
  if (typeof operation.idempotent !== 'boolean') fail('REGISTERED_IDEMPOTENCY_FLAG_MISSING', `${capability.service_id}:${capability.operation_id}`);
  validatePinnedServiceRegistry(serviceRegistry);
  return { idempotent: operation.idempotent, service_id: capability.service_id, operation_id: capability.operation_id };
}

function operationIdentityProjection(plan, task, workflowState, capability) {
  return {
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
    service_id: capability ? capability.service_id : null,
    operation_id: capability ? capability.operation_id : null,
    input_ref_hashes: clone(task.input_ref_hashes),
    context_package_refs: clone(task.context_package_refs)
  };
}

function buildOperationIdentity(plan, workflowState, taskId, routingRegistry = routing.loadDefaultRegistry(), serviceRegistry = loadServiceRegistry()) {
  planRuntime.validateExecutionPlan(plan, workflowState, routingRegistry);
  if (!nonEmpty(taskId)) fail('TASK_ID_REQUIRED');
  const task = plan.tasks.find(t => t.task_id === taskId);
  if (!task) fail('TASK_NOT_IN_PLAN', taskId);
  assertNoRawContent(task, `task.${taskId}`);
  if (task.task_class !== 'SPECIALIST_SERVICE_TASK') {
    return {
      identity_schema_version: 1,
      task_id: task.task_id,
      task_class: task.task_class,
      provider_operation: false,
      operation_digest: null,
      idempotency_key: null,
      registered_idempotent: null,
      projection: operationIdentityProjection(plan, task, workflowState, null)
    };
  }
  const capability = routing.resolveCallableCapability({ capability_id: task.capability_id, required_authority_domain: task.required_authority_domain }, routingRegistry);
  if (capability.canonical_write_authority) fail('PROVIDER_CANONICAL_WRITE_FORBIDDEN', taskId);
  const policy = registeredOperationPolicy(capability, serviceRegistry);
  const projection = operationIdentityProjection(plan, task, workflowState, capability);
  const digest = sha256(stableStringify(projection));
  return {
    identity_schema_version: 1,
    task_id: task.task_id,
    task_class: task.task_class,
    provider_operation: true,
    operation_digest: digest,
    idempotency_key: `book-op-${digest}`,
    registered_idempotent: policy.idempotent,
    projection
  };
}

function validateOperationIdentity(identity) {
  if (!isObject(identity)) fail('OPERATION_IDENTITY_REQUIRED');
  assertNoRawContent(identity, 'operation_identity');
  if (identity.provider_operation) {
    if (!SHA256.test(String(identity.operation_digest || ''))) fail('INVALID_OPERATION_DIGEST');
    if (identity.idempotency_key !== `book-op-${identity.operation_digest}`) fail('IDEMPOTENCY_KEY_MISMATCH');
    const expected = sha256(stableStringify(identity.projection));
    if (expected !== identity.operation_digest) fail('OPERATION_IDENTITY_DIGEST_MISMATCH');
    if (typeof identity.registered_idempotent !== 'boolean') fail('REGISTERED_IDEMPOTENT_BOOLEAN_REQUIRED');
  } else {
    if (identity.operation_digest !== null || identity.idempotency_key !== null || identity.registered_idempotent !== null) fail('NONPROVIDER_IDENTITY_MUST_NOT_HAVE_RETRY_KEY');
  }
  return true;
}

function sameLogicalOperation(a, b) {
  validateOperationIdentity(a);
  validateOperationIdentity(b);
  if (!a.provider_operation || !b.provider_operation) return stableStringify(a.projection) === stableStringify(b.projection);
  return a.operation_digest === b.operation_digest;
}

function decisionDigest(decision) {
  const copy = clone(decision);
  delete copy.decision_digest;
  return sha256(stableStringify(copy));
}

function classifyProviderDecision(identity, observedOutcome, reconciliationState) {
  if (identity.registered_idempotent) {
    if (reconciliationState !== 'NOT_APPLICABLE') fail('IDEMPOTENT_RECONCILIATION_STATE_MUST_BE_NOT_APPLICABLE');
    if (observedOutcome === 'CONFIRMED_SUCCESS') return 'REUSE_OR_REVIEW_EXISTING_RESULT';
    return 'SAFE_SAME_OPERATION_REPLAY';
  }
  if (observedOutcome === 'CONFIRMED_SUCCESS') return 'REUSE_OR_REVIEW_EXISTING_RESULT';
  if (reconciliationState === 'CONFIRMED_NO_EFFECT') return 'NEW_ATTEMPT_AFTER_CONFIRMED_NO_EFFECT';
  if (reconciliationState === 'CONFIRMED_EXISTING_RESULT') return 'REUSE_OR_REVIEW_EXISTING_RESULT';
  if (['NOT_PERFORMED','UNRESOLVED','CONTRADICTORY'].includes(reconciliationState)) return 'RECONCILE_REQUIRED';
  fail('NONIDEMPOTENT_RECONCILIATION_STATE_INVALID', reconciliationState);
}

function deriveRetryDecision(input, routingRegistry = routing.loadDefaultRegistry(), serviceRegistry = loadServiceRegistry(), contract = loadContract()) {
  validateContract(contract);
  if (!isObject(input)) fail('RETRY_DECISION_INPUT_REQUIRED');
  assertNoRawContent(input, 'retry_input');
  const { plan, workflow_state: workflowState, task_id: taskId, observed_outcome: observedOutcome, reconciliation_state: reconciliationState } = input;
  if (!OBSERVED_OUTCOMES.has(observedOutcome)) fail('INVALID_OBSERVED_OUTCOME', String(observedOutcome));
  if (!RECONCILIATION_STATES.has(reconciliationState)) fail('INVALID_RECONCILIATION_STATE', String(reconciliationState));
  const identity = buildOperationIdentity(plan, workflowState, taskId, routingRegistry, serviceRegistry);
  const task = plan.tasks.find(t => t.task_id === taskId);
  if (input.requested_idempotency_key !== undefined) {
    if (!identity.provider_operation) fail('IDEMPOTENCY_KEY_NOT_ALLOWED_FOR_NONPROVIDER_TASK');
    if (!nonEmpty(input.requested_idempotency_key) || input.requested_idempotency_key !== identity.idempotency_key) fail('IDEMPOTENCY_KEY_CONFLICT');
  }
  let decisionClass;
  if (input.prior_operation_identity) {
    validateOperationIdentity(input.prior_operation_identity);
    if (!sameLogicalOperation(input.prior_operation_identity, identity)) decisionClass = 'NEW_OPERATION_REQUIRED_CHANGED_INPUTS';
    else if (input.prior_operation_identity.idempotency_key !== identity.idempotency_key) fail('IDEMPOTENCY_KEY_CONFLICT');
  }
  if (!decisionClass) {
    if (task.task_class === 'BOOK_ADMISSION_HANDOFF') decisionClass = 'BOOK_ADMISSION_RETRY_NOT_AUTHORIZED';
    else if (task.task_class !== 'SPECIALIST_SERVICE_TASK') decisionClass = 'NOT_EXECUTABLE_BY_RETRY_POLICY';
    else decisionClass = classifyProviderDecision(identity, observedOutcome, reconciliationState);
  }
  const evidenceRefs = Array.isArray(input.reconciliation_evidence_refs) ? [...input.reconciliation_evidence_refs] : [];
  if (new Set(evidenceRefs).size !== evidenceRefs.length || evidenceRefs.some(ref => !nonEmpty(ref))) fail('INVALID_RECONCILIATION_EVIDENCE_REFS');
  if (['CONFIRMED_NO_EFFECT','CONFIRMED_EXISTING_RESULT','UNRESOLVED','CONTRADICTORY'].includes(reconciliationState) && evidenceRefs.length === 0 && identity.provider_operation && identity.registered_idempotent === false) fail('RECONCILIATION_EVIDENCE_REQUIRED');
  const decision = {
    decision_schema_version: DECISION_SCHEMA_VERSION,
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    workflow_id: plan.workflow_id,
    workflow_digest: plan.workflow_state_identity.workflow_digest,
    source_identity: clone(plan.source_identity),
    task_id: taskId,
    operation_identity: identity,
    observed_outcome: observedOutcome,
    reconciliation_state: reconciliationState,
    reconciliation_evidence_refs: evidenceRefs,
    decision_class: decisionClass,
    decision_digest: ''
  };
  decision.decision_digest = decisionDigest(decision);
  validateRetryDecision(decision, plan, workflowState, routingRegistry, serviceRegistry, contract);
  return decision;
}

function validateRetryDecision(decision, plan, workflowState, routingRegistry = routing.loadDefaultRegistry(), serviceRegistry = loadServiceRegistry(), contract = loadContract()) {
  validateContract(contract);
  planRuntime.validateExecutionPlan(plan, workflowState, routingRegistry);
  if (!isObject(decision)) fail('RETRY_DECISION_REQUIRED');
  assertNoRawContent(decision, 'retry_decision');
  if (decision.decision_schema_version !== DECISION_SCHEMA_VERSION) fail('RETRY_DECISION_SCHEMA_MISMATCH');
  if (decision.plan_id !== plan.plan_id || decision.plan_digest !== plan.plan_digest) fail('STALE_RETRY_PLAN_BINDING');
  if (decision.workflow_id !== plan.workflow_id || decision.workflow_digest !== plan.workflow_state_identity.workflow_digest) fail('STALE_RETRY_WORKFLOW_BINDING');
  if (stableStringify(decision.source_identity) !== stableStringify(plan.source_identity)) fail('STALE_RETRY_SOURCE_BINDING');
  if (!DECISION_CLASSES.has(decision.decision_class)) fail('INVALID_RETRY_DECISION_CLASS');
  const currentIdentity = buildOperationIdentity(plan, workflowState, decision.task_id, routingRegistry, serviceRegistry);
  if (stableStringify(currentIdentity) !== stableStringify(decision.operation_identity)) fail('STALE_OPERATION_IDENTITY');
  if (decision.decision_digest !== decisionDigest(decision)) fail('RETRY_DECISION_DIGEST_MISMATCH');
  return true;
}

module.exports = {
  CONTRACT_PATH,
  SERVICE_REGISTRY_PATH,
  EXPECTED_SERVICE_REGISTRY_GIT_BLOB_SHA,
  EXPECTED_SERVICE_REGISTRY_QUALIFIED_SUBJECT_SHA,
  DECISION_SCHEMA_VERSION,
  BookRetryIdempotencyError,
  stableStringify,
  loadContract,
  loadServiceRegistry,
  validateContract,
  validatePinnedServiceRegistry,
  registeredOperationPolicy,
  buildOperationIdentity,
  validateOperationIdentity,
  sameLogicalOperation,
  decisionDigest,
  deriveRetryDecision,
  validateRetryDecision
};
