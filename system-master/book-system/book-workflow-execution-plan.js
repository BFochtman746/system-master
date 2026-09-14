'use strict';

const crypto = require('crypto');
const { resolveCapability, resolveCallableCapability } = require('./book-capability-routing-interface');
const { validateWorkflowState, assertCurrentSourceIdentity } = require('./book-workflow-state-model');

const PLAN_SCHEMA_VERSION = 1;
const SHA256 = /^[a-f0-9]{64}$/;
const TASK_CLASSES = new Set(['SPECIALIST_SERVICE_TASK','DECLARED_BLOCKED_CAPABILITY','AUTHORITY_WAIT','BOOK_ADMISSION_HANDOFF']);
const FORBIDDEN_RAW_FIELDS = new Set(['manuscript_text','passage_text','candidate_text','raw_manuscript','raw_passage','raw_candidate']);
const FORBIDDEN_CANONICAL_MUTATION_FIELDS = new Set(['canonical_manuscript','canonical_manuscript_state','next_canonical_manuscript_ref','admit_canonical_manuscript','apply_revision_to_canonical']);
const FORBIDDEN_CONCURRENCY_FIELDS = new Set(['parallel_execution_authorized','concurrency_authorized','max_concurrency','worker_count','parallelism']);

class BookExecutionPlanError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookExecutionPlanError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookExecutionPlanError(code, detail); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
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
function digestPlan(plan) {
  const copy = clone(plan);
  delete copy.plan_digest;
  delete copy.readiness_state;
  delete copy.topological_layers;
  return sha256(stableStringify(copy));
}

function assertNoForbiddenFields(value, path = 'plan') {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoForbiddenFields(item, `${path}.${i}`));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_RAW_FIELDS.has(key)) fail('RAW_MANUSCRIPT_CONTENT_FORBIDDEN', `${path}.${key}`);
    if (FORBIDDEN_CANONICAL_MUTATION_FIELDS.has(key)) fail('CANONICAL_MUTATION_FIELD_FORBIDDEN', `${path}.${key}`);
    if (FORBIDDEN_CONCURRENCY_FIELDS.has(key)) fail('CONCURRENCY_AUTHORITY_FIELD_FORBIDDEN', `${path}.${key}`);
    assertNoForbiddenFields(child, `${path}.${key}`);
  }
}

function validateUniqueStringArray(values, label) {
  if (!Array.isArray(values)) fail('ARRAY_REQUIRED', label);
  const seen = new Set();
  for (const value of values) {
    if (!nonEmpty(value)) fail('INVALID_REFERENCE', label);
    if (seen.has(value)) fail('DUPLICATE_REFERENCE', `${label}:${value}`);
    seen.add(value);
  }
}

function validateHashMap(map, label) {
  if (!isObject(map)) fail('HASH_MAP_REQUIRED', label);
  for (const [key, value] of Object.entries(map)) {
    if (!nonEmpty(key) || !SHA256.test(String(value || ''))) fail('INVALID_INPUT_HASH', `${label}:${key}`);
  }
}

function sameSourceIdentity(a, b) {
  const fields = ['book_state_version','book_state_digest','canonical_manuscript_ref','manuscript_version_id','manuscript_digest_sha256'];
  return fields.every(field => String(a[field]) === String(b[field]));
}

function validateWorkflowBinding(plan, workflowState) {
  validateWorkflowState(workflowState);
  if (plan.workflow_id !== workflowState.workflow_id) fail('WORKFLOW_ID_MISMATCH');
  if (plan.book_project_id !== workflowState.book_project_id) fail('BOOK_PROJECT_ID_MISMATCH');
  if (!isObject(plan.workflow_state_identity)) fail('WORKFLOW_STATE_IDENTITY_REQUIRED');
  if (plan.workflow_state_identity.workflow_version !== workflowState.workflow_version) fail('WORKFLOW_VERSION_MISMATCH');
  if (plan.workflow_state_identity.workflow_digest !== workflowState.workflow_digest) fail('WORKFLOW_DIGEST_MISMATCH');
  assertCurrentSourceIdentity(workflowState, plan.source_identity);
  if (!sameSourceIdentity(plan.source_identity, workflowState.source_identity)) fail('PLAN_SOURCE_IDENTITY_MISMATCH');
}

function validateTaskClass(task, routingRegistry) {
  if (!TASK_CLASSES.has(task.task_class)) fail('INVALID_TASK_CLASS', task.task_class);
  if (typeof task.required_for_plan_success !== 'boolean') fail('REQUIRED_FOR_PLAN_SUCCESS_BOOLEAN_REQUIRED', task.task_id);
  validateUniqueStringArray(task.required_dependency_ids, `${task.task_id}.required_dependency_ids`);
  validateUniqueStringArray(task.optional_dependency_ids, `${task.task_id}.optional_dependency_ids`);
  validateHashMap(task.input_ref_hashes, `${task.task_id}.input_ref_hashes`);
  validateUniqueStringArray(task.context_package_refs, `${task.task_id}.context_package_refs`);
  const overlap = task.required_dependency_ids.find(id => task.optional_dependency_ids.includes(id));
  if (overlap) fail('DEPENDENCY_REQUIRED_OPTIONAL_OVERLAP', `${task.task_id}:${overlap}`);
  if (task.required_dependency_ids.includes(task.task_id) || task.optional_dependency_ids.includes(task.task_id)) fail('SELF_DEPENDENCY', task.task_id);

  if (task.task_class === 'SPECIALIST_SERVICE_TASK') {
    if (!nonEmpty(task.capability_id) || !nonEmpty(task.required_authority_domain)) fail('SPECIALIST_CAPABILITY_REQUIRED', task.task_id);
    if (task.authority_wait_owner !== null) fail('SPECIALIST_AUTHORITY_WAIT_OWNER_MUST_BE_NULL', task.task_id);
    const cap = resolveCallableCapability({ capability_id: task.capability_id, required_authority_domain: task.required_authority_domain }, routingRegistry);
    if (cap.canonical_write_authority) fail('SPECIALIST_CANONICAL_WRITE_FORBIDDEN', task.task_id);
    if (cap.dispatch_class !== 'QUALIFIED_SERVICE_OPERATION') fail('SPECIALIST_DISPATCH_CLASS_INVALID', task.task_id);
    return;
  }

  if (task.task_class === 'DECLARED_BLOCKED_CAPABILITY') {
    if (!nonEmpty(task.capability_id) || !nonEmpty(task.required_authority_domain)) fail('BLOCKED_CAPABILITY_REQUIRED', task.task_id);
    if (task.authority_wait_owner !== null) fail('BLOCKED_AUTHORITY_WAIT_OWNER_MUST_BE_NULL', task.task_id);
    const cap = resolveCapability({ capability_id: task.capability_id, required_authority_domain: task.required_authority_domain }, routingRegistry);
    if (cap.capability_id === 'BOOK.CANONICAL_MANUSCRIPT_ADMISSION') fail('BOOK_ADMISSION_MUST_USE_HANDOFF_TASK', task.task_id);
    if (cap.callable || cap.dispatch_class !== 'DECLARED_AUTHORITY_NO_CALLABLE_INTERFACE') fail('DECLARED_BLOCKED_CAPABILITY_MUST_BE_NONCALLABLE', task.task_id);
    if (cap.canonical_write_authority) fail('BLOCKED_CAPABILITY_CANONICAL_WRITE_FORBIDDEN', task.task_id);
    return;
  }

  if (task.task_class === 'AUTHORITY_WAIT') {
    if (task.capability_id !== null || task.required_authority_domain !== null) fail('AUTHORITY_WAIT_CAPABILITY_MUST_BE_NULL', task.task_id);
    if (!nonEmpty(task.authority_wait_owner)) fail('AUTHORITY_WAIT_OWNER_REQUIRED', task.task_id);
    return;
  }

  if (task.capability_id !== 'BOOK.CANONICAL_MANUSCRIPT_ADMISSION') fail('BOOK_ADMISSION_CAPABILITY_REQUIRED', task.task_id);
  if (task.required_authority_domain !== 'CANONICAL_MANUSCRIPT_MUTATION') fail('BOOK_ADMISSION_AUTHORITY_DOMAIN_REQUIRED', task.task_id);
  if (task.authority_wait_owner !== null) fail('BOOK_ADMISSION_AUTHORITY_WAIT_OWNER_MUST_BE_NULL', task.task_id);
  const cap = resolveCapability({ capability_id: task.capability_id, required_authority_domain: task.required_authority_domain }, routingRegistry);
  if (cap.owner_path !== 'SYSTEM_MASTER/BOOK' || cap.canonical_write_authority !== true || cap.callable !== false || cap.dispatch_class !== 'BOOK_INTERNAL_AUTHORITY_GATE') {
    fail('BOOK_ADMISSION_DESCRIPTOR_INVALID', task.task_id);
  }
}

function buildGraph(tasks) {
  const byId = new Map(tasks.map(task => [task.task_id, task]));
  const downstream = new Map(tasks.map(task => [task.task_id, []]));
  const indegree = new Map(tasks.map(task => [task.task_id, 0]));
  for (const task of tasks) {
    for (const depId of [...task.required_dependency_ids, ...task.optional_dependency_ids]) {
      if (!byId.has(depId)) fail('MISSING_DEPENDENCY', `${task.task_id}:${depId}`);
      downstream.get(depId).push(task.task_id);
      indegree.set(task.task_id, indegree.get(task.task_id) + 1);
    }
  }
  return { byId, downstream, indegree };
}

function topologicalLayers(tasks) {
  const { downstream, indegree } = buildGraph(tasks);
  let ready = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id).sort();
  const layers = [];
  let visited = 0;
  while (ready.length) {
    const layer = [...ready];
    layers.push(layer);
    const next = [];
    for (const id of layer) {
      visited += 1;
      for (const child of [...downstream.get(id)].sort()) {
        const degree = indegree.get(child) - 1;
        indegree.set(child, degree);
        if (degree === 0) next.push(child);
      }
    }
    ready = [...new Set(next)].sort();
  }
  if (visited !== tasks.length) fail('DEPENDENCY_CYCLE_DETECTED');
  return layers;
}

function requiredAncestors(taskId, tasks) {
  const byId = new Map(tasks.map(task => [task.task_id, task]));
  const seen = new Set();
  const stack = [...byId.get(taskId).required_dependency_ids];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const task = byId.get(id);
    for (const parent of task.required_dependency_ids) stack.push(parent);
  }
  return seen;
}

function validateAdmissionSinks(tasks) {
  const admissionTasks = tasks.filter(t => t.task_class === 'BOOK_ADMISSION_HANDOFF');
  if (admissionTasks.length > 1) fail('MULTIPLE_BOOK_ADMISSION_HANDOFFS');
  if (admissionTasks.length === 0) return;
  const admission = admissionTasks[0];
  for (const task of tasks) {
    if (task.task_id === admission.task_id) continue;
    if (task.required_dependency_ids.includes(admission.task_id) || task.optional_dependency_ids.includes(admission.task_id)) fail('BOOK_ADMISSION_NOT_TERMINAL_SINK', task.task_id);
  }
  const ancestors = requiredAncestors(admission.task_id, tasks);
  for (const task of tasks) {
    if (task.task_id === admission.task_id) continue;
    if (task.required_for_plan_success && !ancestors.has(task.task_id)) fail('REQUIRED_TASK_NOT_BEFORE_ADMISSION', task.task_id);
  }
}

function readinessState(tasks) {
  const blockedInterface = tasks.some(t => t.task_class === 'DECLARED_BLOCKED_CAPABILITY');
  const blockedAuthority = tasks.some(t => t.task_class === 'AUTHORITY_WAIT');
  const blockedAdmission = tasks.some(t => t.task_class === 'BOOK_ADMISSION_HANDOFF');
  const count = [blockedInterface, blockedAuthority, blockedAdmission].filter(Boolean).length;
  if (count > 1) return 'BLOCKED_MULTIPLE';
  if (blockedInterface) return 'BLOCKED_ON_DECLARED_INTERFACE';
  if (blockedAuthority) return 'BLOCKED_ON_AUTHORITY_WAIT';
  if (blockedAdmission) return 'BLOCKED_ON_ADMISSION_HANDOFF';
  return 'READY_FOR_EXECUTION_POLICY';
}

function validateExecutionPlan(plan, workflowState, routingRegistry) {
  if (!isObject(plan)) fail('PLAN_OBJECT_REQUIRED');
  assertNoForbiddenFields(plan);
  const required = ['plan_schema_version','plan_id','plan_version','plan_digest','workflow_id','workflow_state_identity','book_project_id','source_identity','objective_ref','objective_hash_sha256','tasks','created_at'];
  for (const field of required) if (!Object.prototype.hasOwnProperty.call(plan, field)) fail('PLAN_FIELD_MISSING', field);
  if (plan.plan_schema_version !== PLAN_SCHEMA_VERSION) fail('PLAN_SCHEMA_VERSION_MISMATCH');
  if (!nonEmpty(plan.plan_id) || !nonEmpty(plan.workflow_id) || !nonEmpty(plan.book_project_id) || !nonEmpty(plan.objective_ref) || !nonEmpty(plan.created_at)) fail('PLAN_IDENTITY_REQUIRED');
  if (!Number.isInteger(plan.plan_version) || plan.plan_version < 1) fail('INVALID_PLAN_VERSION');
  if (!SHA256.test(String(plan.objective_hash_sha256 || ''))) fail('INVALID_OBJECTIVE_HASH');
  if (!Array.isArray(plan.tasks) || plan.tasks.length === 0) fail('PLAN_TASKS_REQUIRED');
  validateWorkflowBinding(plan, workflowState);

  const seen = new Set();
  for (const task of plan.tasks) {
    if (!isObject(task)) fail('TASK_OBJECT_REQUIRED');
    for (const field of ['task_id','task_class','capability_id','required_authority_domain','authority_wait_owner','required_dependency_ids','optional_dependency_ids','input_ref_hashes','context_package_refs','required_for_plan_success']) {
      if (!Object.prototype.hasOwnProperty.call(task, field)) fail('TASK_FIELD_MISSING', `${task.task_id || '?'}:${field}`);
    }
    if (!nonEmpty(task.task_id)) fail('TASK_ID_REQUIRED');
    if (seen.has(task.task_id)) fail('DUPLICATE_TASK_ID', task.task_id);
    seen.add(task.task_id);
    validateTaskClass(task, routingRegistry);
  }
  const layers = topologicalLayers(plan.tasks);
  validateAdmissionSinks(plan.tasks);
  const expectedDigest = digestPlan(plan);
  if (plan.plan_digest !== expectedDigest) fail('PLAN_DIGEST_MISMATCH');
  const expectedReadiness = readinessState(plan.tasks);
  if (Object.prototype.hasOwnProperty.call(plan, 'readiness_state') && plan.readiness_state !== expectedReadiness) fail('READINESS_STATE_MISMATCH');
  if (Object.prototype.hasOwnProperty.call(plan, 'topological_layers') && stableStringify(plan.topological_layers) !== stableStringify(layers)) fail('TOPOLOGICAL_LAYERS_MISMATCH');
  return { readiness_state: expectedReadiness, topological_layers: layers };
}

function createExecutionPlan(input, workflowState, routingRegistry) {
  validateWorkflowState(workflowState);
  if (!isObject(input)) fail('CREATE_PLAN_INPUT_REQUIRED');
  for (const field of ['plan_id','book_project_id','objective_ref','objective_hash_sha256','tasks','created_at']) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) fail('CREATE_PLAN_FIELD_MISSING', field);
  }
  const plan = {
    plan_schema_version: PLAN_SCHEMA_VERSION,
    plan_id: input.plan_id,
    plan_version: 1,
    plan_digest: '',
    workflow_id: workflowState.workflow_id,
    workflow_state_identity: { workflow_version: workflowState.workflow_version, workflow_digest: workflowState.workflow_digest },
    book_project_id: input.book_project_id,
    source_identity: clone(workflowState.source_identity),
    objective_ref: input.objective_ref,
    objective_hash_sha256: input.objective_hash_sha256,
    tasks: clone(input.tasks),
    created_at: input.created_at
  };
  plan.plan_digest = digestPlan(plan);
  const derived = validateExecutionPlan(plan, workflowState, routingRegistry);
  plan.readiness_state = derived.readiness_state;
  plan.topological_layers = derived.topological_layers;
  return plan;
}

function assertPlanCurrent(plan, workflowState, routingRegistry) {
  const derived = validateExecutionPlan(plan, workflowState, routingRegistry);
  return { current: true, ...derived };
}

module.exports = {
  PLAN_SCHEMA_VERSION,
  TASK_CLASSES,
  BookExecutionPlanError,
  stableStringify,
  digestPlan,
  topologicalLayers,
  readinessState,
  validateExecutionPlan,
  createExecutionPlan,
  assertPlanCurrent
};
