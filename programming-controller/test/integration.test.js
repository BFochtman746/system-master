'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SystemModelError } = require('../src/system-model');
const { InMemoryModelStore } = require('../src/model-snapshots');
const {
  DownstreamBindingRegistry,
  IntegratedSystemModelController,
  QualificationProfile001M,
  REQUIRED_BINDINGS
} = require('../src/integration');

function bindings(store = new InMemoryModelStore(), overrides = {}) {
  const acknowledgements = new Map();
  const base = {
    closureGovernance: {
      standing: 'SATISFIED_PRECONDITION',
      evidence_refs: ['R5AY:001L-CONSUMED-AS-GOVERNANCE-PREREQUISITE']
    },
    identity: {
      validate: () => true
    },
    contracts: {
      resolveVersion: ({ contract_id }) => ({ version: contract_id === 'system-model' ? '1.0.0' : '0.1.0', compatibility: 'COMPATIBLE' })
    },
    persistence: { store },
    authorization: {
      authorize: () => ({ allowed: true, decision_id: 'AUTH-1' })
    },
    consistency: {
      validateMutationContext: () => ({ valid: true })
    },
    evidence: {
      listPendingEvents: (workspaceId) => [...store.outbox.values()].filter((event) => event.workspace_id === workspaceId && !acknowledgements.has(event.event_id)),
      acknowledgeEvent: ({ event_id, evidence_ref }) => {
        const event = store.outbox.get(event_id);
        if (!event) throw new SystemModelError('OUTBOX_EVENT_UNKNOWN', 'Unknown event', { event_id });
        const prior = acknowledgements.get(event_id);
        if (prior && prior.evidence_ref !== evidence_ref) throw new SystemModelError('OUTBOX_ACK_CONFLICT', 'Evidence acknowledgement conflict', { event_id });
        const ack = prior || { ...event, status: 'ACKNOWLEDGED', evidence_ref };
        acknowledgements.set(event_id, ack);
        return ack;
      }
    },
    scheduling: {
      enqueueDurableJob: ({ reason }) => ({ job_id: `JOB:${reason}`, standing: 'ACCEPTED' })
    },
    projectArchitecture: {
      getObservedFacts: ({ subject }) => ({ standing: 'OBSERVED', subject, owner: 'REPAIR-002' })
    }
  };
  return { ...base, ...overrides };
}

function emptyModel(workspaceId = 'programming-controller') {
  return {
    workspace_id: workspaceId,
    schema_version: 1,
    entity_types: [],
    relationship_types: [],
    entities: [],
    relationships: []
  };
}

test('requires every delegated authority binding and never silently substitutes one', () => {
  const b = bindings();
  delete b.identity;
  assert.throws(
    () => new DownstreamBindingRegistry(b),
    (error) => error instanceof SystemModelError && error.code === 'DOWNSTREAM_BINDING_MISSING' && error.details.missing.includes('PROGRAMMING-FOUNDATION-001N')
  );
});

test('requires the already-consumed 001L governance prerequisite to carry explicit evidence', () => {
  const b = bindings();
  b.closureGovernance = { standing: 'SATISFIED_PRECONDITION', evidence_refs: [] };
  assert.throws(
    () => new DownstreamBindingRegistry(b),
    (error) => error instanceof SystemModelError && error.code === 'GOVERNANCE_EVIDENCE_MISSING'
  );
});

test('binds all nine downstream/prerequisite authorities without ownership transfer', () => {
  const registry = new DownstreamBindingRegistry(bindings());
  const records = registry.describe();
  assert.equal(records.length, REQUIRED_BINDINGS.length);
  assert.deepEqual(records.map((item) => item.authority_id), REQUIRED_BINDINGS.map((item) => item.authority_id));
  assert.equal(records.every((item) => item.ownership_transfer === false), true);
  assert.equal(records.filter((item) => item.binding_kind === 'RUNTIME_PORT').length, 8);
  assert.equal(records.filter((item) => item.binding_kind === 'GOVERNANCE_PREREQUISITE').length, 1);
});

test('publishes a machine-readable 32-of-32 qualification destination profile', () => {
  const plan = new QualificationProfile001M().getQualificationPlan();
  assert.equal(plan.requirement_count, 32);
  assert.equal(plan.coverage_standing, '32_OF_32_DESTINATIONS_BOUND');
  assert.equal(new Set(plan.requirements.map((item) => item.requirement_id)).size, 32);
  assert.equal(plan.requirements[0].requirement_id, 'BS-001M-001');
  assert.equal(plan.requirements[31].requirement_id, 'BS-001M-032');
  assert.equal(plan.requirements.every((item) => item.test_families.length > 0 && /^IMPL-001M-0[1-6]$/.test(item.implementation_package)), true);
  assert.deepEqual(plan.requirements.filter((item) => item.implementation_package === 'IMPL-001M-06').map((item) => item.requirement_id), ['BS-001M-031', 'BS-001M-032']);
});

test('integrated controller consumes 001N identity, 001O contracts, 001P storage and 001Q authorization through ports', () => {
  const store = new InMemoryModelStore();
  const seenIdentity = [];
  const seenAuth = [];
  const b = bindings(store, {
    identity: { validate: ({ id, kind }) => { seenIdentity.push([id, kind]); return id !== 'REJECTED'; } },
    authorization: { authorize: (request) => { seenAuth.push(request.operation); return { allowed: true, decision_id: 'AUTH-INTEGRATION' }; } }
  });
  const controller = new IntegratedSystemModelController({ workspace_id: 'programming-controller', bindings: b });
  const genesis = controller.createWorkspace({ workspace_id: 'programming-controller', initial_model: emptyModel() });
  assert.match(genesis.snapshot_id, /^sha256:/);
  assert.deepEqual(controller.getContractVersion('system-model'), { contract_id: 'system-model', version: '1.0.0', compatibility: 'COMPATIBLE' });
  controller.model.registerEntityType({ type: 'COMPONENT' });
  assert.throws(() => controller.model.upsertEntity({ entity_id: 'REJECTED', entity_type: 'COMPONENT' }), (error) => error.code === 'IDENTITY_REJECTED');
  assert.equal(seenIdentity.some(([id]) => id === 'REJECTED'), true);
  assert.equal(seenAuth.includes('CREATE_WORKSPACE'), true);
});

test('001R consistency gate rejects mutation before 001M changes authoritative state', () => {
  const store = new InMemoryModelStore();
  const b = bindings(store, {
    consistency: { validateMutationContext: ({ operation }) => operation === 'CREATE_WORKSPACE' ? { valid: true } : { valid: false, reason: 'FENCE_MISMATCH' } }
  });
  const controller = new IntegratedSystemModelController({ workspace_id: 'programming-controller', bindings: b });
  const genesis = controller.createWorkspace({ workspace_id: 'programming-controller', initial_model: emptyModel() });
  assert.throws(
    () => controller.openChangeSet({ workspace_id: 'programming-controller', change_set_id: 'CS-1' }),
    (error) => error instanceof SystemModelError && error.code === 'CONSISTENCY_GATE_REJECTED'
  );
  assert.equal(store.getWorkspace('programming-controller').active_snapshot_id, genesis.snapshot_id);
  assert.equal(store.getChangeSet('CS-1'), null);
});

test('001S evidence, 001W durable scheduling and REPAIR-002 observed architecture remain delegated calls', () => {
  const store = new InMemoryModelStore();
  const controller = new IntegratedSystemModelController({ workspace_id: 'programming-controller', bindings: bindings(store) });
  const genesis = controller.createWorkspace({ workspace_id: 'programming-controller', initial_model: emptyModel() });
  controller.openChangeSet({ workspace_id: 'programming-controller', change_set_id: 'CS-1' });
  controller.commitChangeSet({ change_set_id: 'CS-1', command_id: 'CMD-1', expected_base_snapshot_id: genesis.snapshot_id });
  const pending = controller.evidence.getPendingEvents('programming-controller');
  assert.equal(pending.length, 1);
  assert.equal(controller.evidence.ackEvent({ event_id: pending[0].event_id, evidence_ref: '001S:EVIDENCE-1' }).evidence_ref, '001S:EVIDENCE-1');
  assert.deepEqual(controller.enqueueDurableEscalation({ reason: 'RESOURCE_BUDGET', payload: { subject: 'graph' } }), { job_id: 'JOB:RESOURCE_BUDGET', standing: 'ACCEPTED' });
  assert.deepEqual(controller.getObservedProjectArchitecture({ repository: 'BFochtman746/system-master' }), { standing: 'OBSERVED', subject: { repository: 'BFochtman746/system-master' }, owner: 'REPAIR-002' });
});

test('integration standing is explicit that caller-bound providers are not production-proven by 001M', () => {
  const controller = new IntegratedSystemModelController({ workspace_id: 'programming-controller', bindings: bindings() });
  const standing = controller.getIntegrationStanding();
  assert.equal(standing.bindings.length, 9);
  assert.equal(standing.qualification.requirement_count, 32);
  assert.equal(standing.qualification.coverage_standing, '32_OF_32_DESTINATIONS_BOUND');
  assert.equal(standing.production_provider_standing, 'BOUND_BY_CALLER_NOT_PROVEN_BY_001M');
});
