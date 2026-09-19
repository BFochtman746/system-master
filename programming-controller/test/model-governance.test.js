'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SystemModelError, SystemModelService } = require('../src/system-model');
const { ImportExportService, ViewProjectionService } = require('../src/model-io');
const { InMemoryModelStore, ModelSnapshotService } = require('../src/model-snapshots');
const { AuthorizationGuard, ConformanceContractRegistry, EvidenceOutboxAdapter, GovernedModelIO, GovernedModelSnapshotService, GuardedDependencyGraphEngine, ModelMigrationService, ResourceGuard, SnapshotIntegrityInspector } = require('../src/model-governance');

function baseline(version = 1) {
  const m = new SystemModelService({ workspace_id: 'programming-controller' });
  m.registerEntityType({ type: 'COMPONENT' }); m.registerEntityType({ type: 'SECURITY_BOUNDARY' });
  m.registerRelationshipType({ type: 'DEPENDS_ON', cycle_policy: 'ACYCLIC' }); m.registerRelationshipType({ type: 'TRUSTS', cycle_policy: 'ALLOW' });
  m.upsertEntity({ entity_id: 'A', entity_type: 'COMPONENT' }); return { ...m.exportDraft(), schema_version: version };
}
function fixture() { const store = new InMemoryModelStore(); const service = new ModelSnapshotService({ store }); const genesis = service.createWorkspace({ workspace_id: 'programming-controller', initial_model: baseline() }); return { store, service, genesis }; }

test('hard conformance rules fail closed when evaluator is unavailable', () => {
  const { service } = fixture(); const r = new ConformanceContractRegistry();
  r.registerConstraint({ constraint_id: 'C1', evaluator_key: 'REQUIRE_ENTITY_TYPE', parameters: { entity_type: 'COMPONENT' } });
  assert.equal(r.evaluate({ snapshot: service.getActiveSnapshot('programming-controller') }).standing, 'PASS');
  r.registerConstraint({ constraint_id: 'C2', evaluator_key: 'NOT_REGISTERED' });
  assert.equal(r.evaluate({ snapshot: service.getActiveSnapshot('programming-controller') }).standing, 'CANNOT_DETERMINE');
});

test('hard conformance violation returns exact offending relationship', () => {
  const { service, genesis } = fixture(); service.openChangeSet({ workspace_id: 'programming-controller', change_set_id: 'CS' });
  service.applyChange({ change_set_id: 'CS', expected_revision: 0, operation: { kind: 'UPSERT_ENTITY', entity: { entity_id: 'B', entity_type: 'COMPONENT' } } });
  service.applyChange({ change_set_id: 'CS', expected_revision: 1, operation: { kind: 'DECLARE_RELATIONSHIP', relationship: { relationship_id: 'T1', source_entity_id: 'A', target_entity_id: 'B', relationship_type: 'TRUSTS' } } });
  const x = service.commitChangeSet({ change_set_id: 'CS', command_id: 'CMD', expected_base_snapshot_id: genesis.snapshot_id }); const r = new ConformanceContractRegistry();
  r.registerConstraint({ constraint_id: 'NO-TRUST', evaluator_key: 'FORBID_RELATIONSHIP_TYPE', parameters: { relationship_type: 'TRUSTS' } }); const result = r.evaluate({ snapshot: service.store.getSnapshot(x.snapshot_id) });
  assert.equal(result.standing, 'FAIL'); assert.deepEqual(result.results[0].details.relationship_ids, ['T1']);
});

test('governed commit re-check blocks publication after authorization revocation', () => {
  let allow = true; const auth = new AuthorizationGuard({ authorize: () => ({ allowed: allow }) }); const { store, service, genesis } = fixture(); const g = new GovernedModelSnapshotService({ service, authorizationGuard: auth });
  g.openChangeSet({ workspace_id: 'programming-controller', change_set_id: 'CS' }); g.applyChange({ change_set_id: 'CS', expected_revision: 0, operation: { kind: 'UPSERT_ENTITY', entity: { entity_id: 'B', entity_type: 'COMPONENT' } } }); allow = false;
  assert.throws(() => g.commitChangeSet({ change_set_id: 'CS', command_id: 'CMD', expected_base_snapshot_id: genesis.snapshot_id }), e => e.code === 'AUTHORIZATION_DENIED');
  assert.equal(store.getWorkspace('programming-controller').active_snapshot_id, genesis.snapshot_id); assert.equal(store.getReceipt('CMD'), null);
});

test('authorization provider errors fail closed', () => {
  const auth = new AuthorizationGuard({ authorize: () => { throw new Error('down'); } });
  assert.throws(() => auth.assertAllowed({ capability: 'MODEL_READ', operation: 'READ' }), e => e.code === 'AUTHORIZATION_UNAVAILABLE');
});

test('governed model IO protects import/export while allowing authorized reads', () => {
  const auth = new AuthorizationGuard({ authorize: ({ capability }) => ({ allowed: capability === 'MODEL_READ' }) }); const { service, genesis } = fixture();
  const g = new GovernedModelIO({ importExportService: new ImportExportService({ snapshotService: service }), viewProjectionService: new ViewProjectionService({ snapshotService: service }), authorizationGuard: auth });
  assert.throws(() => g.exportSnapshot({ snapshot_id: genesis.snapshot_id }), e => e.code === 'AUTHORIZATION_DENIED'); assert.throws(() => g.importModel({ document: '{}' }), e => e.code === 'AUTHORIZATION_DENIED');
  assert.equal(g.generateView({ snapshot_id: genesis.snapshot_id, viewpoint_id: 'CONTEXT' }).snapshot_id, genesis.snapshot_id);
});

test('resource budgets guard traversal, import and projection', () => {
  const rg = new ResourceGuard({ limits: { TRAVERSAL_NODES: 1, IMPORT_BYTES: 80, PROJECTION_ELEMENTS: 10, MIGRATION_BYTES: 2000 } }); const m = new SystemModelService({ workspace_id: 'programming-controller' });
  m.registerEntityType({ type: 'COMPONENT' }); m.registerRelationshipType({ type: 'DEPENDS_ON', cycle_policy: 'ACYCLIC' }); m.upsertEntity({ entity_id: 'A', entity_type: 'COMPONENT' }); m.upsertEntity({ entity_id: 'B', entity_type: 'COMPONENT' }); m.declareRelationship({ relationship_id: 'R', source_entity_id: 'A', target_entity_id: 'B', relationship_type: 'DEPENDS_ON' });
  assert.throws(() => new GuardedDependencyGraphEngine({ model: m, resourceGuard: rg }).traverse({ start_entity_id: 'A', max_nodes: 2 }), e => e.code === 'RESOURCE_BUDGET_EXCEEDED');
  const store = new InMemoryModelStore(), service = new ModelSnapshotService({ store }), genesis = service.createWorkspace({ workspace_id: 'programming-controller', initial_model: m.exportDraft() }); const rawIO = new ImportExportService({ snapshotService: service, max_import_bytes: 10000 }), rawViews = new ViewProjectionService({ snapshotService: service }), auth = new AuthorizationGuard({ authorize: () => true }); const g = new GovernedModelIO({ importExportService: rawIO, viewProjectionService: rawViews, authorizationGuard: auth, resourceGuard: rg }); const env = rawIO.exportSnapshot({ snapshot_id: genesis.snapshot_id });
  assert.throws(() => g.importModel({ document: JSON.stringify(env) }), e => e.code === 'RESOURCE_BUDGET_EXCEEDED');
  const small = new ResourceGuard({ limits: { TRAVERSAL_NODES: 10, IMPORT_BYTES: 10000, PROJECTION_ELEMENTS: 1, MIGRATION_BYTES: 2000 } }); const g2 = new GovernedModelIO({ importExportService: rawIO, viewProjectionService: rawViews, authorizationGuard: auth, resourceGuard: small });
  assert.throws(() => g2.generateView({ snapshot_id: genesis.snapshot_id, viewpoint_id: 'CONTEXT' }), e => e.code === 'RESOURCE_BUDGET_EXCEEDED');
});

test('evidence outbox exposes pending events and idempotent acknowledgements through ports', () => {
  const { store, service, genesis } = fixture(); service.openChangeSet({ workspace_id: 'programming-controller', change_set_id: 'CS' }); service.commitChangeSet({ change_set_id: 'CS', command_id: 'CMD', expected_base_snapshot_id: genesis.snapshot_id }); const acks = new Map();
  const a = new EvidenceOutboxAdapter({ listPendingEvents: id => [...store.outbox.values()].filter(x => x.workspace_id === id && !acks.has(x.event_id)), acknowledgeEvent: ({ event_id, evidence_ref }) => { const event = store.outbox.get(event_id); if (!event) throw new SystemModelError('OUTBOX_EVENT_UNKNOWN','unknown'); const prior = acks.get(event_id); if (prior && prior.evidence_ref !== evidence_ref) throw new SystemModelError('OUTBOX_ACK_CONFLICT','conflict'); const ack = prior || { ...event, status: 'ACKNOWLEDGED', evidence_ref }; acks.set(event_id, ack); return ack; } });
  const p = a.getPendingEvents('programming-controller'); assert.equal(p.length, 1); const ack = a.ackEvent({ event_id: p[0].event_id, evidence_ref: '001S:E1' }); assert.equal(ack.status, 'ACKNOWLEDGED'); assert.equal(a.getPendingEvents('programming-controller').length, 0); assert.deepEqual(a.ackEvent({ event_id: p[0].event_id, evidence_ref: '001S:E1' }), ack); assert.throws(() => a.ackEvent({ event_id: p[0].event_id, evidence_ref: '001S:E2' }), e => e.code === 'OUTBOX_ACK_CONFLICT');
});

test('integrity inspector verifies counts and fails on corruption', () => {
  const { store, service, genesis } = fixture(); const i = new SnapshotIntegrityInspector({ snapshotService: service }); assert.equal(i.inspect(genesis.snapshot_id).entity_count, 1); const x = store.snapshots.get(genesis.snapshot_id); store.snapshots.set(genesis.snapshot_id, { ...x, model: { ...x.model, entities: [] } }); assert.throws(() => i.inspect(genesis.snapshot_id), e => e.code === 'SNAPSHOT_INTEGRITY_FAILED');
});

test('migration planning is validated copy-on-write and non-authoritative', () => {
  const { store, service, genesis } = fixture(); const m = new ModelMigrationService({ snapshotService: service }); const p = m.planMigration({ workspace_id: 'programming-controller', migration_id: 'M1', target_schema_version: 2, migrate: x => ({ ...x, entities: [...x.entities, { entity_id: 'B', entity_type: 'COMPONENT', name: null, attributes: {}, metadata: {} }] }) });
  assert.equal(p.standing, 'VALIDATED_NOT_ACTIVE'); assert.equal(p.source_schema_version, 1); assert.deepEqual(p.diff.entities_added, ['B']); assert.equal(store.getWorkspace('programming-controller').active_snapshot_id, genesis.snapshot_id);
});

test('migration activation is atomic, evidenced and preserves history', () => {
  const { store, service, genesis } = fixture(); const m = new ModelMigrationService({ snapshotService: service }); const p = m.planMigration({ workspace_id: 'programming-controller', migration_id: 'M1', target_schema_version: 2, migrate: x => ({ ...x }) }); const r = m.executeMigration({ plan: p, command_id: 'MIG1' });
  assert.notEqual(r.snapshot_id, genesis.snapshot_id); assert.equal(store.getSnapshot(r.snapshot_id).model.schema_version, 2); assert.equal(store.getSnapshot(genesis.snapshot_id).model.schema_version, 1); assert.equal(store.listPendingOutboxEvents('programming-controller').some(x => x.event_type === 'MODEL_SCHEMA_MIGRATED'), true); assert.deepEqual(m.executeMigration({ plan: p, command_id: 'MIG1' }), r);
});

test('migration execution rejects stale plan', () => {
  const { service, genesis } = fixture(); const m = new ModelMigrationService({ snapshotService: service }); const p = m.planMigration({ workspace_id: 'programming-controller', migration_id: 'M1', target_schema_version: 2, migrate: x => ({ ...x }) }); service.openChangeSet({ workspace_id: 'programming-controller', change_set_id: 'CS' }); service.commitChangeSet({ change_set_id: 'CS', command_id: 'CMD', expected_base_snapshot_id: genesis.snapshot_id }); assert.throws(() => m.executeMigration({ plan: p, command_id: 'MIG1' }), e => e.code === 'STALE_BASE');
});

test('migration rollback creates a new snapshot instead of rewinding history', () => {
  const { store, service, genesis } = fixture(); const m = new ModelMigrationService({ snapshotService: service }); const p = m.planMigration({ workspace_id: 'programming-controller', migration_id: 'M1', target_schema_version: 2, migrate: x => ({ ...x }) }); const migrated = m.executeMigration({ plan: p, command_id: 'MIG1' }); const rb = m.rollbackMigration({ workspace_id: 'programming-controller', target_snapshot_id: genesis.snapshot_id, command_id: 'RB1' }); assert.notEqual(rb.snapshot_id, genesis.snapshot_id); assert.notEqual(rb.snapshot_id, migrated.snapshot_id); assert.equal(store.getSnapshot(rb.snapshot_id).parent_snapshot_id, migrated.snapshot_id); assert.equal(store.getSnapshot(rb.snapshot_id).model.schema_version, 1);
});
