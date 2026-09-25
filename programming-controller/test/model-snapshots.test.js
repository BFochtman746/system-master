'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SystemModelError, SystemModelService } = require('../src/system-model');
const { InMemoryModelStore, ModelSnapshotService, SnapshotQueryCache } = require('../src/model-snapshots');

function baseline() {
  const model = new SystemModelService({ workspace_id: 'programming-controller' });
  model.registerEntityType({ type: 'COMPONENT' });
  model.registerRelationshipType({ type: 'DEPENDS_ON', cycle_policy: 'ACYCLIC' });
  model.upsertEntity({ entity_id: 'A', entity_type: 'COMPONENT' });
  return model.exportDraft();
}

function fixture() {
  const store = new InMemoryModelStore();
  const service = new ModelSnapshotService({ store });
  const genesis = service.createWorkspace({ workspace_id: 'programming-controller', initial_model: baseline() });
  return { store, service, genesis };
}

test('creates an immutable content-integrity-checkable genesis snapshot', () => {
  const { service, genesis } = fixture();
  assert.match(genesis.snapshot_id, /^sha256:[a-f0-9]{64}$/);
  assert.equal(service.verifySnapshotIntegrity(genesis.snapshot_id), true);
  assert.equal(Object.isFrozen(genesis), true);
  assert.equal(Object.isFrozen(genesis.model), true);
});

test('opens a change set on an exact base and enforces revision compare-and-set', () => {
  const { service, genesis } = fixture();
  const cs = service.openChangeSet({ workspace_id: 'programming-controller', change_set_id: 'CS-1', base_snapshot_id: genesis.snapshot_id });
  assert.equal(cs.revision, 0);
  const changed = service.applyChange({ change_set_id: 'CS-1', expected_revision: 0, operation: { kind: 'UPSERT_ENTITY', entity: { entity_id: 'B', entity_type: 'COMPONENT' } } });
  assert.equal(changed.revision, 1);
  assert.throws(
    () => service.applyChange({ change_set_id: 'CS-1', expected_revision: 0, operation: { kind: 'UPSERT_ENTITY', entity: { entity_id: 'C', entity_type: 'COMPONENT' } } }),
    (error) => error instanceof SystemModelError && error.code === 'STALE_CHANGESET_REVISION'
  );
});

test('commits snapshot, receipt, pointer and outbox atomically through the persistence port', () => {
  const { store, service, genesis } = fixture();
  service.openChangeSet({ workspace_id: 'programming-controller', change_set_id: 'CS-1' });
  service.applyChange({ change_set_id: 'CS-1', expected_revision: 0, operation: { kind: 'UPSERT_ENTITY', entity: { entity_id: 'B', entity_type: 'COMPONENT' } } });
  const receipt = service.commitChangeSet({ change_set_id: 'CS-1', command_id: 'CMD-1', expected_base_snapshot_id: genesis.snapshot_id });
  assert.notEqual(receipt.snapshot_id, genesis.snapshot_id);
  assert.equal(store.getWorkspace('programming-controller').active_snapshot_id, receipt.snapshot_id);
  assert.equal(store.getChangeSet('CS-1').status, 'COMMITTED');
  assert.equal(store.listPendingOutboxEvents('programming-controller').length, 1);
  assert.equal(service.verifySnapshotIntegrity(receipt.snapshot_id), true);
});

test('returns the prior receipt for an identical command retry and rejects semantic command-id reuse', () => {
  const { service, genesis } = fixture();
  service.openChangeSet({ workspace_id: 'programming-controller', change_set_id: 'CS-1' });
  const first = service.commitChangeSet({ change_set_id: 'CS-1', command_id: 'CMD-1', expected_base_snapshot_id: genesis.snapshot_id });
  const retry = service.commitChangeSet({ change_set_id: 'CS-1', command_id: 'CMD-1', expected_base_snapshot_id: genesis.snapshot_id });
  assert.deepEqual(retry, first);
  assert.throws(
    () => service.commitChangeSet({ change_set_id: 'OTHER', command_id: 'CMD-1', expected_base_snapshot_id: genesis.snapshot_id }),
    (error) => error instanceof SystemModelError && error.code === 'IDEMPOTENCY_CONFLICT'
  );
});

test('rejects a stale change-set base after a competing commit advances the active pointer', () => {
  const { service, genesis } = fixture();
  service.openChangeSet({ workspace_id: 'programming-controller', change_set_id: 'CS-A', base_snapshot_id: genesis.snapshot_id });
  service.openChangeSet({ workspace_id: 'programming-controller', change_set_id: 'CS-B', base_snapshot_id: genesis.snapshot_id });
  service.applyChange({ change_set_id: 'CS-A', expected_revision: 0, operation: { kind: 'UPSERT_ENTITY', entity: { entity_id: 'B', entity_type: 'COMPONENT' } } });
  service.commitChangeSet({ change_set_id: 'CS-A', command_id: 'CMD-A', expected_base_snapshot_id: genesis.snapshot_id });
  assert.throws(
    () => service.commitChangeSet({ change_set_id: 'CS-B', command_id: 'CMD-B', expected_base_snapshot_id: genesis.snapshot_id }),
    (error) => error instanceof SystemModelError && error.code === 'STALE_BASE'
  );
});

test('validates the fully materialized candidate before mutation becomes authoritative', () => {
  const { service } = fixture();
  service.openChangeSet({ workspace_id: 'programming-controller', change_set_id: 'CS-1' });
  service.applyChange({ change_set_id: 'CS-1', expected_revision: 0, operation: { kind: 'UPSERT_ENTITY', entity: { entity_id: 'B', entity_type: 'COMPONENT' } } });
  service.applyChange({ change_set_id: 'CS-1', expected_revision: 1, operation: { kind: 'DECLARE_RELATIONSHIP', relationship: { relationship_id: 'R1', source_entity_id: 'B', target_entity_id: 'A', relationship_type: 'DEPENDS_ON' } } });
  assert.throws(
    () => service.applyChange({ change_set_id: 'CS-1', expected_revision: 2, operation: { kind: 'DECLARE_RELATIONSHIP', relationship: { relationship_id: 'R2', source_entity_id: 'A', target_entity_id: 'B', relationship_type: 'DEPENDS_ON' } } }),
    (error) => error instanceof SystemModelError && error.code === 'RELATIONSHIP_CYCLE'
  );
  assert.equal(service.store.getChangeSet('CS-1').revision, 2);
});

test('keys query cache by immutable snapshot id so a new active snapshot cannot reuse stale results', () => {
  const cache = new SnapshotQueryCache();
  const store = new InMemoryModelStore();
  const service = new ModelSnapshotService({ store, cache });
  const genesis = service.createWorkspace({ workspace_id: 'programming-controller', initial_model: baseline() });
  let computations = 0;
  const query = (snapshotId) => service.query({ snapshot_id: snapshotId, query_key: 'entity-count', compute: (model) => { computations += 1; return { count: model.entities.length }; } });
  assert.deepEqual(query(genesis.snapshot_id), { count: 1 });
  assert.deepEqual(query(genesis.snapshot_id), { count: 1 });
  assert.equal(computations, 1);
  service.openChangeSet({ workspace_id: 'programming-controller', change_set_id: 'CS-1' });
  service.applyChange({ change_set_id: 'CS-1', expected_revision: 0, operation: { kind: 'UPSERT_ENTITY', entity: { entity_id: 'B', entity_type: 'COMPONENT' } } });
  const receipt = service.commitChangeSet({ change_set_id: 'CS-1', command_id: 'CMD-1', expected_base_snapshot_id: genesis.snapshot_id });
  assert.deepEqual(query(receipt.snapshot_id), { count: 2 });
  assert.equal(computations, 2);
});

test('survives service restart with committed pointer, receipt and pending outbox intact', () => {
  const { store, service, genesis } = fixture();
  service.openChangeSet({ workspace_id: 'programming-controller', change_set_id: 'CS-1' });
  const receipt = service.commitChangeSet({ change_set_id: 'CS-1', command_id: 'CMD-1', expected_base_snapshot_id: genesis.snapshot_id });
  const restarted = new ModelSnapshotService({ store });
  assert.equal(restarted.getActiveSnapshot('programming-controller').snapshot_id, receipt.snapshot_id);
  assert.deepEqual(store.getReceipt('CMD-1'), receipt);
  assert.equal(store.listPendingOutboxEvents('programming-controller').length, 1);
});

test('fails closed on active snapshot corruption and records explicit rollback recovery', () => {
  const { store, service, genesis } = fixture();
  service.openChangeSet({ workspace_id: 'programming-controller', change_set_id: 'CS-1' });
  service.applyChange({ change_set_id: 'CS-1', expected_revision: 0, operation: { kind: 'UPSERT_ENTITY', entity: { entity_id: 'B', entity_type: 'COMPONENT' } } });
  const receipt = service.commitChangeSet({ change_set_id: 'CS-1', command_id: 'CMD-1', expected_base_snapshot_id: genesis.snapshot_id });
  const corrupt = store.snapshots.get(receipt.snapshot_id);
  store.snapshots.set(receipt.snapshot_id, { ...corrupt, model: { ...corrupt.model, entities: [] } });
  assert.throws(
    () => service.getActiveSnapshot('programming-controller'),
    (error) => error instanceof SystemModelError && error.code === 'SNAPSHOT_INTEGRITY_FAILED'
  );
  const recovery = service.recoverWorkspace('programming-controller');
  assert.equal(recovery.recovered, true);
  assert.equal(recovery.snapshot_id, genesis.snapshot_id);
  assert.equal(store.recoveryRecords.length, 1);
});
