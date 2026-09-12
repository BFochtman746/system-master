'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MigrationExecutionAdapter,
  MigrationPlanner,
  MigrationStateRegistry
} = require('../src/contract-migration');
const { ContractVersioningError } = require('../src/contract-versioning');

function fixture() {
  let n = 0;
  const allocate = (kind) => `${kind}:${++n}`;
  const planner = new MigrationPlanner({ identityAllocator: allocate, authorization: () => ({ allowed: true }) });
  const state = new MigrationStateRegistry({ identityAllocator: allocate });
  return { allocate, planner, state };
}

function createPlan(planner, overrides = {}) {
  return planner.createPlan({
    source: { contract_version_id: 'v1', digest: 'a'.repeat(64) },
    target: { contract_version_id: 'v2', digest: 'b'.repeat(64) },
    affected_scope: ['consumer:A', 'data:orders'],
    strategy: 'EXPAND_CONTRACT',
    strategy_rationale: 'preserve mixed-version availability',
    workload_assumptions: { peak_rps: 100 },
    recovery_assumptions: { max_downtime_seconds: 0 },
    dependency_assumptions: { serviceA: 'rev:1' },
    policy_refs: ['policy:migration:1'],
    steps: [
      {
        step_id: 'step:expand', name: 'expand target', effectful: true,
        target_authority: 'PROGRAMMING-FOUNDATION-001P',
        transform_ref: 'transform:expand', validation_ref: 'validate:expand',
        reversibility_class: 'REVERSIBLE', rollback_ref: 'rollback:expand',
        idempotency_semantics: 'EXACT_COMMAND_KEY', side_effect_scope: 'schema:orders'
      },
      {
        step_id: 'step:backfill', name: 'backfill data', effectful: true,
        depends_on_step_ids: ['step:expand'], target_authority: 'DATA-ORDERS',
        transform_ref: 'transform:backfill', validation_ref: 'validate:backfill',
        reversibility_class: 'COMPENSATABLE', compensation_ref: 'compensate:backfill',
        idempotency_semantics: 'UPSERT_BY_PRIMARY_KEY', side_effect_scope: 'table:orders'
      }
    ],
    ...overrides
  });
}

function currentFacts() {
  return {
    source: { contract_version_id: 'v1', digest: 'a'.repeat(64) },
    target: { contract_version_id: 'v2', digest: 'b'.repeat(64) },
    policy_refs: ['policy:migration:1'],
    dependency_assumptions: { serviceA: 'rev:1' }
  };
}

test('migration plan binds exact source/target identities, explicit strategy and affected scope', () => {
  const { planner } = fixture();
  const plan = createPlan(planner);
  assert.equal(plan.source.contract_version_id, 'v1');
  assert.equal(plan.target.contract_version_id, 'v2');
  assert.equal(plan.strategy, 'EXPAND_CONTRACT');
  assert.deepEqual(plan.affected_scope, ['consumer:A', 'data:orders']);
  assert.match(plan.plan_digest, /^[0-9a-f]{64}$/);
  assert.equal(plan.state, 'CANDIDATE');
});

test('migration strategy is never implicit or universal', () => {
  const { planner } = fixture();
  assert.throws(() => createPlan(planner, { strategy: undefined }), (error) => error.code === 'INCOMPLETE_CONTRACT_INPUT');
  assert.throws(() => createPlan(planner, { strategy: 'MAGIC_AUTO' }), (error) => error.code === 'INCOMPLETE_CONTRACT_INPUT');
});

test('effectful steps require idempotency plus rollback/compensation/forward-recovery semantics', () => {
  const { planner } = fixture();
  assert.throws(() => createPlan(planner, { steps: [{ step_id: 's1', name: 'unsafe', effectful: true, target_authority: 'DATA-ORDERS' }] }), (error) => error.code === 'MIGRATION_STEP_NONIDEMPOTENT');
  assert.throws(() => createPlan(planner, { steps: [{ step_id: 's1', name: 'unsafe', effectful: true, target_authority: 'DATA-ORDERS', idempotency_semantics: 'KEYED', reversibility_class: 'REVERSIBLE' }] }), (error) => error.code === 'ROLLBACK_UNAVAILABLE');
});

test('migration step dependency graph rejects cycles and missing dependencies', () => {
  const { planner } = fixture();
  assert.throws(() => createPlan(planner, { steps: [
    { step_id: 'a', name: 'a', depends_on_step_ids: ['b'], effectful: false },
    { step_id: 'b', name: 'b', depends_on_step_ids: ['a'], effectful: false }
  ] }), (error) => error.code === 'MIGRATION_SOURCE_MISMATCH');
  assert.throws(() => createPlan(planner, { steps: [{ step_id: 'a', name: 'a', depends_on_step_ids: ['missing'], effectful: false }] }), (error) => error.code === 'MIGRATION_SOURCE_MISMATCH');
});

test('generated or AI migration steps remain candidates until exact test evidence exists', () => {
  const { planner } = fixture();
  const plan = createPlan(planner, { steps: [{
    step_id: 'ai:1', name: 'generated transform', effectful: true, origin: 'AI_GENERATED',
    target_authority: 'PROGRAMMING-FOUNDATION-001X', transform_ref: 'tool:generated',
    reversibility_class: 'FORWARD_RECOVERY_ONLY', forward_recovery_ref: 'forward:1',
    idempotency_semantics: 'COMMAND_KEY', side_effect_scope: 'artifact:set', required_test_evidence_refs: []
  }] });
  assert.equal(plan.steps[0].candidate_standing, 'CANDIDATE_REQUIRES_EXACT_VALIDATION_APPROVAL_AND_TEST_EVIDENCE');
  assert.throws(() => planner.validatePlan({ migration_plan_id: plan.migration_plan_id, current: currentFacts() }), (error) => error.code === 'MIGRATION_PLAN_STALE');
});

test('validation binds a freshness fingerprint and stale source/target/policy/dependency facts fail', () => {
  const { planner } = fixture();
  const plan = createPlan(planner);
  const validated = planner.validatePlan({ migration_plan_id: plan.migration_plan_id, current: currentFacts(), evidence_refs: ['test:plan'] });
  assert.equal(validated.state, 'VALIDATED');
  assert.match(validated.validation.fingerprint, /^[0-9a-f]{64}$/);
  assert.throws(() => planner.approvePlan({
    migration_plan_id: plan.migration_plan_id,
    current: { ...currentFacts(), dependency_assumptions: { serviceA: 'rev:2' } },
    authority_ref: 'PROGRAMMING'
  }), (error) => error.code === 'MIGRATION_PLAN_STALE');
});

test('approval requires fresh validation and scoped authorization', () => {
  let n = 0;
  const planner = new MigrationPlanner({ identityAllocator: (kind) => `${kind}:${++n}`, authorization: () => ({ allowed: false, reason: 'no approval role' }) });
  const plan = createPlan(planner);
  planner.validatePlan({ migration_plan_id: plan.migration_plan_id, current: currentFacts(), evidence_refs: ['test:plan'] });
  assert.throws(() => planner.approvePlan({ migration_plan_id: plan.migration_plan_id, current: currentFacts(), authority_ref: 'PROGRAMMING' }), (error) => error.code === 'UNAUTHORIZED_CONTRACT_CHANGE');
});

test('durable execution delegates to 001W and does not become worker/process/database truth', () => {
  const { planner, state } = fixture();
  const plan = createPlan(planner);
  const validated = planner.validatePlan({ migration_plan_id: plan.migration_plan_id, current: currentFacts(), evidence_refs: ['test:plan'] });
  const approved = planner.approvePlan({ migration_plan_id: validated.migration_plan_id, current: currentFacts(), authority_ref: 'PROGRAMMING' });
  const scheduled = [];
  const adapter = new MigrationExecutionAdapter({ stateRegistry: state, scheduleDurableWork: (intent) => { scheduled.push(intent); return '001W:job:1'; } });
  const execution = adapter.requestExecution({ plan: approved, command_id: 'migrate:1', current_validation_fingerprint: approved.approval.validation_fingerprint });
  assert.equal(execution.scheduler_ref, '001W:job:1');
  assert.equal(execution.state, 'EXECUTING');
  assert.equal(scheduled[0].authority, 'PROGRAMMING-FOUNDATION-001W');
  assert.equal(scheduled[0].semantic_owner, 'PROGRAMMING-FOUNDATION-001O');
});

test('delegated step intents route tool execution to 001X and data effects to owning data authority', () => {
  const { planner, state } = fixture();
  const plan = createPlan(planner);
  const validated = planner.validatePlan({ migration_plan_id: plan.migration_plan_id, current: currentFacts(), evidence_refs: ['test:plan'] });
  const approved = planner.approvePlan({ migration_plan_id: validated.migration_plan_id, current: currentFacts(), authority_ref: 'PROGRAMMING' });
  const adapter = new MigrationExecutionAdapter({ stateRegistry: state, scheduleDurableWork: () => '001W:job:1' });
  const execution = adapter.requestExecution({ plan: approved, command_id: 'migrate:1', current_validation_fingerprint: approved.approval.validation_fingerprint });
  const dataIntent = adapter.buildDelegatedStepIntent({ plan: approved, execution, step: approved.steps[1] });
  assert.equal(dataIntent.delegated_authority, 'DATA-ORDERS');
  assert.equal(dataIntent.port, 'requestDataMigration');

  const toolPlan = createPlan(planner, { target: { contract_version_id: 'v3', digest: 'c'.repeat(64) }, steps: [{
    step_id: 'tool:1', name: 'tool migration', effectful: true, target_authority: 'PROGRAMMING-FOUNDATION-001X',
    transform_ref: 'tool:transform', reversibility_class: 'FORWARD_RECOVERY_ONLY', forward_recovery_ref: 'forward:tool',
    idempotency_semantics: 'COMMAND_KEY', side_effect_scope: 'artifact:set'
  }] });
  const toolCurrent = { ...currentFacts(), target: { contract_version_id: 'v3', digest: 'c'.repeat(64) } };
  const toolValidated = planner.validatePlan({ migration_plan_id: toolPlan.migration_plan_id, current: toolCurrent, evidence_refs: ['test:tool'] });
  const toolApproved = planner.approvePlan({ migration_plan_id: toolValidated.migration_plan_id, current: toolCurrent, authority_ref: 'PROGRAMMING' });
  const toolExecution = adapter.requestExecution({ plan: toolApproved, command_id: 'migrate:tool', current_validation_fingerprint: toolApproved.approval.validation_fingerprint });
  const toolIntent = adapter.buildDelegatedStepIntent({ plan: toolApproved, execution: toolExecution, step: toolApproved.steps[0] });
  assert.equal(toolIntent.delegated_authority, 'PROGRAMMING-FOUNDATION-001X');
  assert.equal(toolIntent.port, 'requestToolExecution');
});

test('same migration command and same semantics returns same execution ref; semantic reuse is rejected', () => {
  const { planner, state } = fixture();
  const plan = createPlan(planner);
  const validated = planner.validatePlan({ migration_plan_id: plan.migration_plan_id, current: currentFacts(), evidence_refs: ['test:plan'] });
  const approved = planner.approvePlan({ migration_plan_id: validated.migration_plan_id, current: currentFacts(), authority_ref: 'PROGRAMMING' });
  let scheduled = 0;
  const adapter = new MigrationExecutionAdapter({ stateRegistry: state, scheduleDurableWork: () => { scheduled += 1; return 'job:1'; } });
  const first = adapter.requestExecution({ plan: approved, command_id: 'migrate:1', current_validation_fingerprint: approved.approval.validation_fingerprint });
  const second = adapter.requestExecution({ plan: approved, command_id: 'migrate:1', current_validation_fingerprint: approved.approval.validation_fingerprint });
  assert.equal(first.migration_execution_id, second.migration_execution_id);
  assert.equal(scheduled, 1);

  const otherPlan = createPlan(planner, { target: { contract_version_id: 'v3', digest: 'c'.repeat(64) } });
  const otherCurrent = { ...currentFacts(), target: { contract_version_id: 'v3', digest: 'c'.repeat(64) } };
  const otherValidated = planner.validatePlan({ migration_plan_id: otherPlan.migration_plan_id, current: otherCurrent, evidence_refs: ['test:other'] });
  const otherApproved = planner.approvePlan({ migration_plan_id: otherValidated.migration_plan_id, current: otherCurrent, authority_ref: 'PROGRAMMING' });
  assert.throws(() => adapter.requestExecution({ plan: otherApproved, command_id: 'migrate:1', current_validation_fingerprint: otherApproved.approval.validation_fingerprint }), (error) => error.code === 'DUPLICATE_MIGRATION_REQUEST');
});

test('UNKNOWN_EXTERNAL blocks blind retry until reconciled by evidence', () => {
  const { planner, state } = fixture();
  const plan = createPlan(planner);
  const validated = planner.validatePlan({ migration_plan_id: plan.migration_plan_id, current: currentFacts(), evidence_refs: ['test:plan'] });
  const approved = planner.approvePlan({ migration_plan_id: validated.migration_plan_id, current: currentFacts(), authority_ref: 'PROGRAMMING' });
  const adapter = new MigrationExecutionAdapter({ stateRegistry: state, scheduleDurableWork: () => 'job:1' });
  const execution = adapter.requestExecution({ plan: approved, command_id: 'migrate:1', current_validation_fingerprint: approved.approval.validation_fingerprint });
  state.recordCheckpoint({ migration_execution_id: execution.migration_execution_id, step_id: 'step:expand', state: 'UNKNOWN_EXTERNAL', external_ref: 'provider:op:1' });
  assert.throws(() => adapter.requestExecution({ plan: approved, command_id: 'migrate:1', current_validation_fingerprint: approved.approval.validation_fingerprint }), (error) => error.code === 'EXTERNAL_STATE_UNKNOWN');
  const reconciled = state.reconcileUnknown({ migration_execution_id: execution.migration_execution_id, step_id: 'step:expand', reconciled_state: 'SUCCEEDED', reconciliation_ref: 'evidence:provider:1' });
  assert.equal(reconciled.unknown_external, false);
});

test('partial scope cannot aggregate to success until all required steps, consumers and data slices are terminal accepted', () => {
  const { state } = fixture();
  const execution = state.openExecution({ migration_plan_id: 'plan:1', command_id: 'cmd:1', semantic_request_digest: 'digest:1' });
  state.recordCheckpoint({ migration_execution_id: execution.migration_execution_id, step_id: 's1', state: 'SUCCEEDED', evidence_refs: ['e1'] });
  assert.throws(() => state.assertComplete({
    migration_execution_id: execution.migration_execution_id,
    required_step_ids: ['s1', 's2'],
    required_consumer_ids: ['consumer:A'], consumer_dispositions: {},
    required_data_slice_ids: ['slice:1'], data_slice_dispositions: {}
  }), (error) => error instanceof ContractVersioningError && error.code === 'PARTIAL_MIGRATION');
  state.recordCheckpoint({ migration_execution_id: execution.migration_execution_id, step_id: 's2', state: 'SUCCEEDED', evidence_refs: ['e2'] });
  const standing = state.assertComplete({
    migration_execution_id: execution.migration_execution_id,
    required_step_ids: ['s1', 's2'],
    required_consumer_ids: ['consumer:A'], consumer_dispositions: { 'consumer:A': 'MIGRATED' },
    required_data_slice_ids: ['slice:1'], data_slice_dispositions: { 'slice:1': 'MIGRATED' }
  });
  assert.equal(standing.standing, 'SUCCEEDED_RECONCILED');
});
