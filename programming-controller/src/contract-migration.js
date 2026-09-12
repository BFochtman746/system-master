'use strict';

const crypto = require('node:crypto');
const { ContractVersioningError } = require('./contract-versioning');
const { ContractAuthorizationPort } = require('./contract-lifecycle');

const MIGRATION_STRATEGIES = Object.freeze([
  'EAGER', 'LAZY', 'INCREMENTAL', 'EXPAND_CONTRACT', 'DUAL_READ', 'DUAL_WRITE', 'PROVIDER_SPECIFIC'
]);
const REVERSIBILITY_CLASSES = Object.freeze(['REVERSIBLE', 'COMPENSATABLE', 'FORWARD_RECOVERY_ONLY', 'IRREVERSIBLE_MANUAL_ONLY']);
const EXECUTION_STATES = Object.freeze(['NOT_STARTED', 'EXECUTING', 'PARTIAL', 'FAILED', 'SUCCEEDED', 'ROLLED_BACK', 'UNKNOWN_EXTERNAL']);
const TERMINAL_ACCEPTED_STATES = new Set(['SUCCEEDED', 'ROLLED_BACK']);

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new ContractVersioningError('INCOMPLETE_CONTRACT_INPUT', `${field} is required`, { field });
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stable(value)).digest('hex');
}

function unique(values) { return [...new Set(values || [])].sort(); }

function assertAcyclic(steps) {
  const ids = new Set(steps.map((step) => step.step_id));
  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(steps.map((step) => [step.step_id, step]));
  for (const step of steps) {
    for (const dep of step.depends_on_step_ids) {
      if (!ids.has(dep)) throw new ContractVersioningError('MIGRATION_SOURCE_MISMATCH', `Migration dependency does not exist: ${dep}`, { step_id: step.step_id, dependency_step_id: dep });
      if (dep === step.step_id) throw new ContractVersioningError('MIGRATION_SOURCE_MISMATCH', 'Migration step cannot depend on itself', { step_id: step.step_id });
    }
  }
  const visit = (id, stack = []) => {
    if (visiting.has(id)) throw new ContractVersioningError('MIGRATION_SOURCE_MISMATCH', 'Migration step dependency graph contains a cycle', { cycle: [...stack, id] });
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of byId.get(id).depends_on_step_ids) visit(dep, [...stack, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
  return true;
}

function validateStepRecovery(step) {
  if (!step.effectful) return;
  if (!step.idempotency_semantics) {
    throw new ContractVersioningError('MIGRATION_STEP_NONIDEMPOTENT', 'Effectful migration step requires explicit idempotency semantics', { step_id: step.step_id });
  }
  if (!REVERSIBILITY_CLASSES.includes(step.reversibility_class)) {
    throw new ContractVersioningError('ROLLBACK_UNAVAILABLE', 'Effectful migration step requires a known reversibility class', { step_id: step.step_id });
  }
  if (!step.rollback_ref && !step.compensation_ref && !step.forward_recovery_ref) {
    throw new ContractVersioningError('ROLLBACK_UNAVAILABLE', 'Effectful migration step requires rollback, compensation, or forward-recovery plan', { step_id: step.step_id });
  }
  if (step.reversibility_class === 'IRREVERSIBLE_MANUAL_ONLY' && step.automation_allowed === true) {
    throw new ContractVersioningError('ROLLBACK_UNAVAILABLE', 'Unjustified irreversible migration automation is prohibited', { step_id: step.step_id });
  }
}

class MigrationPlanner {
  constructor({ identityAllocator, authorization }) {
    if (typeof identityAllocator !== 'function') throw new ContractVersioningError('IDENTITY_PORT_REQUIRED', '001N identity allocation port required');
    this.allocate = identityAllocator;
    this.auth = new ContractAuthorizationPort(authorization);
    this.plans = new Map();
  }

  createPlan(record) {
    const strategy = text(record?.strategy, 'strategy');
    if (!MIGRATION_STRATEGIES.includes(strategy)) throw new ContractVersioningError('INCOMPLETE_CONTRACT_INPUT', `Unsupported migration strategy: ${strategy}`, { strategy });
    const source = freeze({
      contract_version_id: text(record.source?.contract_version_id, 'source.contract_version_id'),
      digest: text(record.source?.digest, 'source.digest')
    });
    const target = freeze({
      contract_version_id: text(record.target?.contract_version_id, 'target.contract_version_id'),
      digest: text(record.target?.digest, 'target.digest')
    });
    if (source.contract_version_id === target.contract_version_id && source.digest === target.digest) {
      throw new ContractVersioningError('MIGRATION_SOURCE_MISMATCH', 'Migration source and target must be distinct exact subjects');
    }
    if (!Array.isArray(record.affected_scope) || record.affected_scope.length === 0) throw new ContractVersioningError('INCOMPLETE_CONTRACT_INPUT', 'affected_scope must be explicit');
    const steps = (record.steps || []).map((raw, index) => {
      const effectful = raw.effectful === true;
      const generated = raw.origin === 'GENERATED' || raw.origin === 'AI_GENERATED';
      const step = freeze({
        step_id: raw.step_id || String(this.allocate('MIGRATION_STEP')),
        order_hint: index,
        name: text(raw.name || `step-${index + 1}`, 'step.name'),
        depends_on_step_ids: Object.freeze(unique(raw.depends_on_step_ids)),
        effectful,
        precondition_refs: Object.freeze(unique(raw.precondition_refs)),
        transform_ref: raw.transform_ref || null,
        validation_ref: raw.validation_ref || null,
        target_authority: text(raw.target_authority || 'PROGRAMMING-FOUNDATION-001O', 'step.target_authority'),
        reversibility_class: raw.reversibility_class || (effectful ? null : 'REVERSIBLE'),
        rollback_ref: raw.rollback_ref || null,
        compensation_ref: raw.compensation_ref || null,
        forward_recovery_ref: raw.forward_recovery_ref || null,
        idempotency_semantics: raw.idempotency_semantics || null,
        side_effect_scope: raw.side_effect_scope || null,
        origin: raw.origin || 'HUMAN_AUTHORED',
        required_test_evidence_refs: Object.freeze(unique(raw.required_test_evidence_refs)),
        automation_allowed: raw.automation_allowed === true,
        candidate_standing: generated ? 'CANDIDATE_REQUIRES_EXACT_VALIDATION_APPROVAL_AND_TEST_EVIDENCE' : 'CANDIDATE'
      });
      validateStepRecovery(step);
      if (generated && step.required_test_evidence_refs.length === 0) {
        // Generated steps may exist as candidates, but cannot later validate/approve without evidence.
      }
      return step;
    });
    assertAcyclic(steps);
    const planPayload = {
      migration_plan_id: String(this.allocate('MIGRATION_PLAN')),
      source,
      target,
      affected_scope: Object.freeze(unique(record.affected_scope)),
      strategy,
      strategy_rationale: text(record.strategy_rationale, 'strategy_rationale'),
      workload_assumptions: freeze(record.workload_assumptions || {}),
      recovery_assumptions: freeze(record.recovery_assumptions || {}),
      dependency_assumptions: freeze(record.dependency_assumptions || {}),
      policy_refs: Object.freeze(unique(record.policy_refs)),
      steps: Object.freeze(steps),
      state: 'CANDIDATE',
      validation: null,
      approval: null
    };
    const plan = freeze({ ...planPayload, plan_digest: sha256(planPayload) });
    this.plans.set(plan.migration_plan_id, plan);
    return plan;
  }

  getPlan(id) {
    const plan = this.plans.get(id);
    if (!plan) throw new ContractVersioningError('MIGRATION_SOURCE_MISMATCH', `Unknown migration plan: ${id}`, { migration_plan_id: id });
    return plan;
  }

  currentFingerprint(plan, current) {
    return sha256({
      source_version_id: current.source?.contract_version_id,
      source_digest: current.source?.digest,
      target_version_id: current.target?.contract_version_id,
      target_digest: current.target?.digest,
      policy_refs: unique(current.policy_refs),
      dependency_assumptions: current.dependency_assumptions || {},
      plan_digest: plan.plan_digest
    });
  }

  validatePlan({ migration_plan_id, current, evidence_refs = [] }) {
    const plan = this.getPlan(migration_plan_id);
    if (!current?.source || !current?.target) throw new ContractVersioningError('MIGRATION_PLAN_STALE', 'Current source/target facts are required');
    if (current.source.contract_version_id !== plan.source.contract_version_id || current.source.digest !== plan.source.digest || current.target.contract_version_id !== plan.target.contract_version_id || current.target.digest !== plan.target.digest) {
      throw new ContractVersioningError('MIGRATION_PLAN_STALE', 'Current exact source/target no longer match migration plan');
    }
    for (const step of plan.steps) {
      validateStepRecovery(step);
      if ((step.origin === 'GENERATED' || step.origin === 'AI_GENERATED') && step.required_test_evidence_refs.length === 0) {
        throw new ContractVersioningError('MIGRATION_PLAN_STALE', 'Generated migration step lacks required future test evidence', { step_id: step.step_id });
      }
    }
    const fingerprint = this.currentFingerprint(plan, current);
    const validated = freeze({
      ...plan,
      state: 'VALIDATED',
      validation: freeze({
        validation_id: String(this.allocate('MIGRATION_VALIDATION')),
        fingerprint,
        evidence_refs: Object.freeze(unique(evidence_refs)),
        exact_source: plan.source,
        exact_target: plan.target,
        policy_refs: Object.freeze(unique(current.policy_refs)),
        dependency_assumptions: freeze(current.dependency_assumptions || {})
      })
    });
    this.plans.set(plan.migration_plan_id, validated);
    return validated;
  }

  approvePlan({ migration_plan_id, current, authority_ref, authorization_context = null }) {
    const plan = this.getPlan(migration_plan_id);
    if (plan.state !== 'VALIDATED' || !plan.validation) throw new ContractVersioningError('MIGRATION_PLAN_STALE', 'Plan must be freshly validated before approval');
    const currentFingerprint = this.currentFingerprint(plan, current);
    if (currentFingerprint !== plan.validation.fingerprint) throw new ContractVersioningError('MIGRATION_PLAN_STALE', 'Migration assumptions changed since validation');
    this.auth.require('APPROVE_MIGRATION_PLAN', authorization_context);
    const approved = freeze({
      ...plan,
      state: 'APPROVED',
      approval: freeze({
        approval_id: String(this.allocate('MIGRATION_APPROVAL')),
        authority_ref: text(authority_ref, 'authority_ref'),
        validation_fingerprint: plan.validation.fingerprint
      })
    });
    this.plans.set(plan.migration_plan_id, approved);
    return approved;
  }
}

class MigrationStateRegistry {
  constructor({ identityAllocator }) {
    this.allocate = identityAllocator;
    this.executions = new Map();
    this.checkpoints = new Map();
    this.commandReceipts = new Map();
  }

  openExecution({ migration_plan_id, command_id, semantic_request_digest }) {
    const existing = this.commandReceipts.get(command_id);
    if (existing) {
      if (existing.semantic_request_digest !== semantic_request_digest) throw new ContractVersioningError('DUPLICATE_MIGRATION_REQUEST', 'Migration command ID reused with different semantics', { command_id });
      return existing.execution_ref;
    }
    const execution = freeze({
      migration_execution_id: String(this.allocate('MIGRATION_EXECUTION')),
      migration_plan_id,
      command_id,
      state: 'NOT_STARTED',
      scheduler_ref: null,
      external_execution_refs: Object.freeze([]),
      step_states: freeze({}),
      checkpoint_refs: Object.freeze([]),
      reconciliation_refs: Object.freeze([]),
      unknown_external: false
    });
    this.executions.set(execution.migration_execution_id, execution);
    this.commandReceipts.set(command_id, { semantic_request_digest, execution_ref: execution });
    return execution;
  }

  replace(execution) {
    this.executions.set(execution.migration_execution_id, execution);
    const receipt = this.commandReceipts.get(execution.command_id);
    if (receipt) receipt.execution_ref = execution;
    return execution;
  }

  recordCheckpoint({ migration_execution_id, step_id, state, evidence_refs = [], external_ref = null, reconciliation_ref = null }) {
    if (!EXECUTION_STATES.includes(state)) throw new ContractVersioningError('PARTIAL_MIGRATION', `Unsupported migration state: ${state}`);
    const current = this.getStatus(migration_execution_id);
    const checkpoint = freeze({
      checkpoint_ref: String(this.allocate('MIGRATION_CHECKPOINT')),
      migration_execution_id,
      step_id,
      state,
      evidence_refs: Object.freeze(unique(evidence_refs)),
      external_ref,
      reconciliation_ref
    });
    this.checkpoints.set(checkpoint.checkpoint_ref, checkpoint);
    const stepStates = { ...current.step_states, [step_id]: state };
    const checkpoints = [...current.checkpoint_refs, checkpoint.checkpoint_ref];
    const externalRefs = external_ref ? unique([...current.external_execution_refs, external_ref]) : [...current.external_execution_refs];
    const reconciliationRefs = reconciliation_ref ? unique([...current.reconciliation_refs, reconciliation_ref]) : [...current.reconciliation_refs];
    const unknown = Object.values(stepStates).includes('UNKNOWN_EXTERNAL');
    let aggregate = 'NOT_STARTED';
    const states = Object.values(stepStates);
    if (unknown) aggregate = 'UNKNOWN_EXTERNAL';
    else if (states.includes('FAILED')) aggregate = 'FAILED';
    else if (states.includes('EXECUTING')) aggregate = 'EXECUTING';
    else if (states.length && states.every((item) => item === 'SUCCEEDED')) aggregate = 'SUCCEEDED';
    else if (states.length && states.every((item) => TERMINAL_ACCEPTED_STATES.has(item))) aggregate = states.every((item) => item === 'ROLLED_BACK') ? 'ROLLED_BACK' : 'PARTIAL';
    else if (states.length) aggregate = 'PARTIAL';
    const next = freeze({
      ...current,
      state: aggregate,
      step_states: freeze(stepStates),
      checkpoint_refs: Object.freeze(checkpoints),
      external_execution_refs: Object.freeze(externalRefs),
      reconciliation_refs: Object.freeze(reconciliationRefs),
      unknown_external: unknown
    });
    return this.replace(next);
  }

  reconcileUnknown({ migration_execution_id, step_id, reconciled_state, reconciliation_ref, evidence_refs = [] }) {
    if (!['FAILED', 'SUCCEEDED', 'ROLLED_BACK', 'PARTIAL'].includes(reconciled_state)) throw new ContractVersioningError('EXTERNAL_STATE_UNKNOWN', 'Unknown external outcome requires a terminal/known reconciled state');
    return this.recordCheckpoint({ migration_execution_id, step_id, state: reconciled_state, reconciliation_ref: text(reconciliation_ref, 'reconciliation_ref'), evidence_refs });
  }

  assertComplete({ migration_execution_id, required_step_ids, required_consumer_ids = [], consumer_dispositions = {}, required_data_slice_ids = [], data_slice_dispositions = {} }) {
    const execution = this.getStatus(migration_execution_id);
    if (execution.unknown_external) throw new ContractVersioningError('EXTERNAL_STATE_UNKNOWN', 'Unknown external outcome must be reconciled before completion');
    const incompleteSteps = required_step_ids.filter((id) => execution.step_states[id] !== 'SUCCEEDED');
    const incompleteConsumers = required_consumer_ids.filter((id) => !['MIGRATED', 'EXPLICITLY_ACCEPTED', 'EXEMPT'].includes(consumer_dispositions[id]));
    const incompleteSlices = required_data_slice_ids.filter((id) => !['MIGRATED', 'EXPLICITLY_ACCEPTED', 'EXEMPT'].includes(data_slice_dispositions[id]));
    if (incompleteSteps.length || incompleteConsumers.length || incompleteSlices.length) {
      throw new ContractVersioningError('PARTIAL_MIGRATION', 'Migration cannot be promoted to success while required scope remains incomplete', { incomplete_steps: incompleteSteps, incomplete_consumers: incompleteConsumers, incomplete_data_slices: incompleteSlices });
    }
    return freeze({ standing: 'SUCCEEDED_RECONCILED', migration_execution_id });
  }

  getStatus(id) {
    const execution = this.executions.get(id);
    if (!execution) throw new ContractVersioningError('PARTIAL_MIGRATION', `Unknown migration execution: ${id}`, { migration_execution_id: id });
    return execution;
  }
}

class MigrationExecutionAdapter {
  constructor({ stateRegistry, scheduleDurableWork, requestToolExecution, requestDataMigration }) {
    if (!stateRegistry) throw new ContractVersioningError('INCOMPLETE_CONTRACT_INPUT', 'Migration state registry required');
    this.state = stateRegistry;
    this.schedule = scheduleDurableWork;
    this.executeTool = requestToolExecution;
    this.executeData = requestDataMigration;
  }

  requestExecution({ plan, command_id, current_validation_fingerprint }) {
    if (plan?.state !== 'APPROVED' || !plan.approval || plan.approval.validation_fingerprint !== current_validation_fingerprint) {
      throw new ContractVersioningError('MIGRATION_PLAN_STALE', 'Only a freshly approved exact migration plan may execute');
    }
    const semanticDigest = sha256({ migration_plan_id: plan.migration_plan_id, plan_digest: plan.plan_digest, validation_fingerprint: current_validation_fingerprint });
    const existing = this.state.openExecution({ migration_plan_id: plan.migration_plan_id, command_id: text(command_id, 'command_id'), semantic_request_digest: semanticDigest });
    if (existing.scheduler_ref || existing.state !== 'NOT_STARTED') {
      if (existing.unknown_external) throw new ContractVersioningError('EXTERNAL_STATE_UNKNOWN', 'Blind retry prohibited while prior external outcome is unknown', { migration_execution_id: existing.migration_execution_id });
      return existing;
    }
    if (typeof this.schedule !== 'function') throw new ContractVersioningError('EXTERNAL_STATE_UNKNOWN', '001W durable scheduler port is unavailable');
    const schedulerRef = this.schedule({
      authority: 'PROGRAMMING-FOUNDATION-001W',
      semantic_owner: 'PROGRAMMING-FOUNDATION-001O',
      migration_plan_id: plan.migration_plan_id,
      migration_execution_id: existing.migration_execution_id,
      plan_digest: plan.plan_digest
    });
    if (!schedulerRef) throw new ContractVersioningError('EXTERNAL_STATE_UNKNOWN', '001W returned no durable scheduler reference');
    return this.state.replace(freeze({ ...existing, state: 'EXECUTING', scheduler_ref: String(schedulerRef) }));
  }

  buildDelegatedStepIntent({ plan, execution, step }) {
    if (!plan.steps.some((item) => item.step_id === step.step_id)) throw new ContractVersioningError('MIGRATION_SOURCE_MISMATCH', 'Step is not part of exact plan');
    validateStepRecovery(step);
    const base = {
      semantic_owner: 'PROGRAMMING-FOUNDATION-001O',
      migration_plan_id: plan.migration_plan_id,
      migration_execution_id: execution.migration_execution_id,
      step_id: step.step_id,
      exact_source: plan.source,
      exact_target: plan.target,
      transform_ref: step.transform_ref,
      validation_ref: step.validation_ref,
      idempotency_semantics: step.idempotency_semantics,
      side_effect_scope: step.side_effect_scope
    };
    if (step.target_authority === 'PROGRAMMING-FOUNDATION-001X') return freeze({ ...base, delegated_authority: 'PROGRAMMING-FOUNDATION-001X', port: 'requestToolExecution' });
    if (step.target_authority === 'PROGRAMMING-FOUNDATION-001P' || step.target_authority.startsWith('DATA-')) return freeze({ ...base, delegated_authority: step.target_authority, port: 'requestDataMigration' });
    return freeze({ ...base, delegated_authority: step.target_authority, port: 'domainOwnedMigration' });
  }
}

module.exports = {
  EXECUTION_STATES,
  MIGRATION_STRATEGIES,
  MigrationExecutionAdapter,
  MigrationPlanner,
  MigrationStateRegistry,
  REVERSIBILITY_CLASSES,
  assertAcyclic,
  validateStepRecovery
};
