'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const planRuntime = require('./book-workflow-execution-plan');
const routing = require('./book-capability-routing-interface');

const CONTRACT_PATH = path.join(__dirname, '../../qualification/book-system/book-prose-integration/orchestrator/BOOK-WORKFLOW-ORCHESTRATOR-CONCURRENCY-RULES-001.json');
const DECISION_SCHEMA_VERSION = 1;

class BookConcurrencyRulesError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookConcurrencyRulesError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookConcurrencyRulesError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
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
function loadContract() { return JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8')); }
function decisionDigest(decision) {
  const copy = clone(decision);
  delete copy.decision_digest;
  return sha256(stableStringify(copy));
}

function validateContract(contract) {
  if (!isObject(contract)) fail('CONCURRENCY_CONTRACT_REQUIRED');
  if (contract.contract_id !== 'BOOK-WORKFLOW-ORCHESTRATOR-CONCURRENCY-RULES-001') fail('CONCURRENCY_CONTRACT_ID_MISMATCH');
  if (!isObject(contract.capability_policy)) fail('CAPABILITY_POLICY_REQUIRED');
  const allowed = new Set([
    'READ_ONLY_PARALLEL_ELIGIBLE',
    'SERIAL_ONLY_NONIDEMPOTENT_OR_SIDE_EFFECTING',
    'ISOLATION_GATED',
    'NONEXECUTABLE_BLOCKER',
    'BOOK_ADMISSION_SERIAL_ONLY'
  ]);
  for (const [capabilityId, policyClass] of Object.entries(contract.capability_policy)) {
    if (!capabilityId || !allowed.has(policyClass)) fail('INVALID_CAPABILITY_POLICY', `${capabilityId}:${policyClass}`);
  }
  if (!contract.isolation_gate || contract.isolation_gate.currently_satisfied !== false) fail('ISOLATION_GATE_MUST_REMAIN_UNSATISFIED_IN_2E');
  if (contract.capability_policy['PROSE.GENERATE_REVISION_CANDIDATE'] !== 'SERIAL_ONLY_NONIDEMPOTENT_OR_SIDE_EFFECTING') fail('PROSE_GENERATION_MUST_REMAIN_SERIAL');
  if (contract.capability_policy['BOOK.CANONICAL_MANUSCRIPT_ADMISSION'] !== 'BOOK_ADMISSION_SERIAL_ONLY') fail('BOOK_ADMISSION_MUST_REMAIN_SERIAL');
  return true;
}

function taskPolicy(task, contract) {
  if (task.task_class === 'AUTHORITY_WAIT') return 'NONEXECUTABLE_BLOCKER';
  if (task.task_class === 'BOOK_ADMISSION_HANDOFF') return 'BOOK_ADMISSION_SERIAL_ONLY';
  if (task.task_class === 'DECLARED_BLOCKED_CAPABILITY') return 'NONEXECUTABLE_BLOCKER';
  const policy = contract.capability_policy[task.capability_id];
  if (!policy) fail('CAPABILITY_CONCURRENCY_POLICY_MISSING', task.capability_id);
  return policy;
}

function reasonFor(policyClass, task) {
  if (policyClass === 'READ_ONLY_PARALLEL_ELIGIBLE') return 'TOPOLOGICALLY_INDEPENDENT_READ_ONLY_SPECIALIST_TASK';
  if (policyClass === 'SERIAL_ONLY_NONIDEMPOTENT_OR_SIDE_EFFECTING') return 'SERIAL_ONLY_NONIDEMPOTENT_OR_SIDE_EFFECTING';
  if (policyClass === 'ISOLATION_GATED') return 'QUALIFIED_CONTEXT_ISOLATION_SEAM_NOT_YET_SATISFIED';
  if (policyClass === 'BOOK_ADMISSION_SERIAL_ONLY') return 'BOOK_ADMISSION_IS_CANONICAL_AUTHORITY_HANDOFF_AND_NEVER_PARALLEL_SPECIALIST_WORK';
  if (task.task_class === 'AUTHORITY_WAIT') return 'EXTERNAL_OR_HUMAN_AUTHORITY_WAIT';
  return 'DECLARED_CAPABILITY_NOT_CALLABLE';
}

function deriveConcurrencyDecision(plan, workflowState, routingRegistry = routing.loadDefaultRegistry(), contract = loadContract()) {
  validateContract(contract);
  const planState = planRuntime.validateExecutionPlan(plan, workflowState, routingRegistry);
  const layerIndex = new Map();
  planState.topological_layers.forEach((layer, index) => layer.forEach(taskId => layerIndex.set(taskId, index)));
  const decisions = [];
  for (const task of [...plan.tasks].sort((a, b) => a.task_id.localeCompare(b.task_id))) {
    const policyClass = taskPolicy(task, contract);
    const parallelEligible = policyClass === 'READ_ONLY_PARALLEL_ELIGIBLE';
    if (parallelEligible && task.task_class !== 'SPECIALIST_SERVICE_TASK') fail('NON_SPECIALIST_PARALLEL_ELIGIBILITY_FORBIDDEN', task.task_id);
    if (task.task_class === 'SPECIALIST_SERVICE_TASK') {
      const cap = routing.resolveCallableCapability({ capability_id: task.capability_id, required_authority_domain: task.required_authority_domain }, routingRegistry);
      if (cap.canonical_write_authority) fail('PARALLEL_CAPABILITY_CANONICAL_WRITE_FORBIDDEN', task.task_id);
    }
    decisions.push({
      task_id: task.task_id,
      topological_layer: layerIndex.get(task.task_id),
      policy_class: policyClass,
      parallel_eligible: parallelEligible,
      reason: reasonFor(policyClass, task)
    });
  }

  const groups = [];
  for (let layer = 0; layer < planState.topological_layers.length; layer += 1) {
    const ids = decisions.filter(d => d.topological_layer === layer && d.parallel_eligible).map(d => d.task_id).sort();
    if (ids.length >= 2) groups.push({ group_id: `LAYER-${layer}`, topological_layer: layer, task_ids: ids });
  }
  const withheld = decisions.filter(d => !d.parallel_eligible).map(d => ({ task_id: d.task_id, reason: d.reason })).sort((a,b) => a.task_id.localeCompare(b.task_id));
  const decision = {
    decision_schema_version: DECISION_SCHEMA_VERSION,
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    workflow_id: plan.workflow_id,
    workflow_digest: plan.workflow_state_identity.workflow_digest,
    source_identity: clone(plan.source_identity),
    task_decisions: decisions,
    parallel_groups: groups,
    withheld_tasks: withheld,
    decision_digest: ''
  };
  decision.decision_digest = decisionDigest(decision);
  validateConcurrencyDecision(decision, plan, workflowState, routingRegistry, contract);
  return decision;
}

function validateConcurrencyDecision(decision, plan, workflowState, routingRegistry = routing.loadDefaultRegistry(), contract = loadContract()) {
  validateContract(contract);
  const planState = planRuntime.validateExecutionPlan(plan, workflowState, routingRegistry);
  if (!isObject(decision)) fail('CONCURRENCY_DECISION_REQUIRED');
  const required = ['decision_schema_version','plan_id','plan_digest','workflow_id','workflow_digest','source_identity','task_decisions','parallel_groups','withheld_tasks','decision_digest'];
  for (const field of required) if (!Object.prototype.hasOwnProperty.call(decision, field)) fail('CONCURRENCY_DECISION_FIELD_MISSING', field);
  if (decision.decision_schema_version !== DECISION_SCHEMA_VERSION) fail('CONCURRENCY_DECISION_SCHEMA_MISMATCH');
  if (decision.plan_id !== plan.plan_id || decision.plan_digest !== plan.plan_digest) fail('STALE_CONCURRENCY_PLAN_BINDING');
  if (decision.workflow_id !== plan.workflow_id || decision.workflow_digest !== plan.workflow_state_identity.workflow_digest) fail('STALE_CONCURRENCY_WORKFLOW_BINDING');
  if (stableStringify(decision.source_identity) !== stableStringify(plan.source_identity)) fail('STALE_CONCURRENCY_SOURCE_BINDING');
  if (!Array.isArray(decision.task_decisions) || !Array.isArray(decision.parallel_groups) || !Array.isArray(decision.withheld_tasks)) fail('CONCURRENCY_DECISION_ARRAY_REQUIRED');
  const expectedTaskIds = [...plan.tasks].map(t => t.task_id).sort();
  const actualTaskIds = decision.task_decisions.map(d => d.task_id).sort();
  if (stableStringify(expectedTaskIds) !== stableStringify(actualTaskIds)) fail('CONCURRENCY_TASK_COVERAGE_MISMATCH');

  const byTask = new Map(decision.task_decisions.map(d => [d.task_id, d]));
  for (const group of decision.parallel_groups) {
    if (!Array.isArray(group.task_ids) || group.task_ids.length < 2) fail('PARALLEL_GROUP_TOO_SMALL', group.group_id || '');
    const unique = new Set(group.task_ids);
    if (unique.size !== group.task_ids.length) fail('PARALLEL_GROUP_DUPLICATE_TASK', group.group_id || '');
    for (const taskId of group.task_ids) {
      const d = byTask.get(taskId);
      if (!d || !d.parallel_eligible) fail('INELIGIBLE_TASK_IN_PARALLEL_GROUP', taskId);
      if (d.topological_layer !== group.topological_layer) fail('CROSS_LAYER_PARALLEL_GROUP_FORBIDDEN', taskId);
    }
  }
  for (const d of decision.task_decisions) {
    const task = plan.tasks.find(t => t.task_id === d.task_id);
    if (!task) fail('DECISION_TASK_NOT_IN_PLAN', d.task_id);
    const expectedPolicy = taskPolicy(task, contract);
    if (d.policy_class !== expectedPolicy) fail('TASK_POLICY_CLASS_MISMATCH', d.task_id);
    if (d.topological_layer !== planState.topological_layers.findIndex(layer => layer.includes(d.task_id))) fail('TASK_LAYER_MISMATCH', d.task_id);
    const shouldBeEligible = expectedPolicy === 'READ_ONLY_PARALLEL_ELIGIBLE';
    if (d.parallel_eligible !== shouldBeEligible) fail('TASK_ELIGIBILITY_MISMATCH', d.task_id);
    if (task.task_class === 'BOOK_ADMISSION_HANDOFF' && d.parallel_eligible) fail('BOOK_ADMISSION_PARALLEL_FORBIDDEN');
    if (task.task_class === 'AUTHORITY_WAIT' && d.parallel_eligible) fail('AUTHORITY_WAIT_PARALLEL_FORBIDDEN');
    if (task.task_class === 'DECLARED_BLOCKED_CAPABILITY' && d.parallel_eligible) fail('BLOCKED_CAPABILITY_PARALLEL_FORBIDDEN');
  }
  if (decision.decision_digest !== decisionDigest(decision)) fail('CONCURRENCY_DECISION_DIGEST_MISMATCH');
  return true;
}

module.exports = {
  CONTRACT_PATH,
  DECISION_SCHEMA_VERSION,
  BookConcurrencyRulesError,
  loadContract,
  validateContract,
  decisionDigest,
  deriveConcurrencyDecision,
  validateConcurrencyDecision
};
