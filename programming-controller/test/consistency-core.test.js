'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SystemModelError, SystemModelService } = require('../src/system-model');
const { AuthorityBoundaryService } = require('../src/authority-model');
const { SnapshotConsistencyService } = require('../src/consistency-core');
const { InMemoryAtomicSnapshotStore, createSnapshot, verifySnapshotIntegrity } = require('../src/snapshot-store');

function fixture(Store = InMemoryAtomicSnapshotStore) {
  const model = new SystemModelService({ workspace_id: 'programming-controller' });
  model.registerEntityType({ type: 'AUTHORITY' });
  model.registerEntityType({ type: 'COMPONENT' });
  model.registerRelationshipType({ type: 'DEPENDS_ON', cycle_policy: 'ACYCLIC' });
  model.upsertEntity({ entity_id: 'PROGRAMMING', entity_type: 'AUTHORITY' });
  const store = new Store();
  const service = new SnapshotConsistencyService({ workspace_id: 'programming-controller', store });
  const initial = service.bootstrap(model);
  return { model, store, service, initial };
}

function addEntity(service, changeSetId, entityId) {
  service.applyChange(changeSetId, {
    kind: 'UPSERT_ENTITY',
    value: { entity_id: entityId, entity_type: 'COMPONENT' }
  });
}

test('publishes immutable content-addressed snapshots and advances only the active pointer', () => {
  const { service, initial } = fixture();
  service.openChangeSet({ change_set_id: 'CS-1' });
  addEntity(service, 'CS-1', 'A');
  const receipt = service.commitChangeSet({ change_set_id: 'CS-1', command_id: 'CMD-1' });
  const active = service.getActiveSnapshot();
  assert.equal(active.snapshot_id, receipt.snapshot_id);
  assert.equal(active.parent_snapshot_id, initial.snapshot_id);
  assert.equal(service.getSnapshot(initial.snapshot_id).snapshot_id, initial.snapshot_id);
  assert.equal(Object.isFrozen(active), true);
  assert.equal(Object.isFrozen(active.payload), true);
});

test('rejects stale-base commit instead of silently rebasing', () => {
  const { service } = fixture();
  service.openChangeSet({ change_set_id: 'CS-A' });
  service.openChangeSet({ change_set_id: 'CS-B' });
  addEntity(service, 'CS-A', 'A');
  addEntity(service, 'CS-B', 'B');
  service.commitChangeSet({ change_set_id: 'CS-A', command_id: 'CMD-A' });
  assert.throws(
    () => service.commitChangeSet({ change_set_id: 'CS-B', command_id: 'CMD-B' }),
    (error) => error instanceof SystemModelError && error.code === 'STALE_BASE'
  );
});

test('returns the prior receipt for an identical retry of the same command', () => {
  const { service } = fixture();
  service.openChangeSet({ change_set_id: 'CS-1', actor: { id: 'builder' } });
  addEntity(service, 'CS-1', 'A');
  const first = service.commitChangeSet({ change_set_id: 'CS-1', command_id: 'CMD-1' });
  const second = service.commitChangeSet({ change_set_id: 'CS-1', command_id: 'CMD-1' });
  assert.deepEqual(second, first);
  assert.equal(service.getActiveSnapshot().snapshot_id, first.snapshot_id);
});

test('rejects command-id reuse with a different semantic payload', () => {
  const { service } = fixture();
  service.openChangeSet({ change_set_id: 'CS-1' });
  addEntity(service, 'CS-1', 'A');
  service.commitChangeSet({ change_set_id: 'CS-1', command_id: 'CMD-1' });
  service.openChangeSet({ change_set_id: 'CS-2' });
  addEntity(service, 'CS-2', 'B');
  assert.throws(
    () => service.commitChangeSet({ change_set_id: 'CS-2', command_id: 'CMD-1' }),
    (error) => error instanceof SystemModelError && error.code === 'IDEMPOTENCY_CONFLICT'
  );
});

test('validation failure produces no partial snapshot, receipt, outbox event, or pointer advance', () => {
  const { service, store, initial } = fixture();
  service.openChangeSet({ change_set_id: 'CS-1' });
  service.applyChange('CS-1', {
    kind: 'DECLARE_RELATIONSHIP',
    value: { relationship_id: 'R1', source_entity_id: 'PROGRAMMING', target_entity_id: 'MISSING', relationship_type: 'DEPENDS_ON' }
  });
  assert.throws(
    () => service.commitChangeSet({ change_set_id: 'CS-1', command_id: 'CMD-1' }),
    (error) => error instanceof SystemModelError && error.code === 'RELATIONSHIP_ENDPOINT_MISSING'
  );
  assert.equal(service.getActiveSnapshot().snapshot_id, initial.snapshot_id);
  assert.equal(store.getReceipt('programming-controller', 'CMD-1'), null);
});

test('query cache is keyed by immutable snapshot identity and survives later publication safely', () => {
  const { service, initial } = fixture();
  const execute = (runtime) => runtime.model.exportDraft().entities.map((e) => e.entity_id).sort();
  const first = service.querySnapshot({ snapshot_id: initial.snapshot_id, query_name: 'entity-ids', execute });
  const cached = service.querySnapshot({ snapshot_id: initial.snapshot_id, query_name: 'entity-ids', execute });
  assert.equal(first.cache_hit, false);
  assert.equal(cached.cache_hit, true);
  assert.deepEqual(cached.value, ['PROGRAMMING']);
  service.openChangeSet({ change_set_id: 'CS-1' });
  addEntity(service, 'CS-1', 'A');
  const receipt = service.commitChangeSet({ change_set_id: 'CS-1', command_id: 'CMD-1' });
  const current = service.querySnapshot({ snapshot_id: receipt.snapshot_id, query_name: 'entity-ids', execute });
  const prior = service.querySnapshot({ snapshot_id: initial.snapshot_id, query_name: 'entity-ids', execute });
  assert.deepEqual(current.value, ['A', 'PROGRAMMING']);
  assert.deepEqual(prior.value, ['PROGRAMMING']);
  assert.equal(prior.cache_hit, true);
});

test('recovers a committed receipt after an ambiguous post-commit transport outcome', () => {
  class AmbiguousAfterCommitStore extends InMemoryAtomicSnapshotStore {
    commitAtomic(args) {
      const receipt = super.commitAtomic(args);
      const error = new SystemModelError('COMMIT_OUTCOME_UNKNOWN', 'transport failed after atomic commit');
      error.receipt = receipt;
      throw error;
    }
  }
  const { service } = fixture(AmbiguousAfterCommitStore);
  service.openChangeSet({ change_set_id: 'CS-1' });
  addEntity(service, 'CS-1', 'A');
  let expectedDigest;
  try {
    const cs = service.getChangeSet('CS-1');
    expectedDigest = service.commandPayloadDigest(cs, 'CMD-1');
    service.commitChangeSet({ change_set_id: 'CS-1', command_id: 'CMD-1' });
    assert.fail('expected ambiguous outcome');
  } catch (error) {
    assert.equal(error.code, 'COMMIT_OUTCOME_UNKNOWN');
  }
  const recovered = service.recoverCommand({ command_id: 'CMD-1', expected_command_payload_digest: expectedDigest });
  assert.equal(recovered.standing, 'COMMITTED');
  assert.equal(recovered.receipt.command_id, 'CMD-1');
  assert.equal(recovered.snapshot.snapshot_id, recovered.receipt.snapshot_id);
});

test('detects tampering in snapshot payloads instead of serving corrupted authority', () => {
  const { initial } = fixture();
  const corrupt = JSON.parse(JSON.stringify(initial));
  corrupt.payload.entities.push({ entity_id: 'INJECTED', entity_type: 'COMPONENT', attributes: {}, metadata: {} });
  assert.throws(
    () => verifySnapshotIntegrity(corrupt),
    (error) => error instanceof SystemModelError && error.code === 'SNAPSHOT_CORRUPT'
  );
});

test('snapshots authority assignments and boundaries as part of the same canonical truth', () => {
  const model = new SystemModelService({ workspace_id: 'programming-controller' });
  model.registerEntityType({ type: 'AUTHORITY' });
  model.upsertEntity({ entity_id: 'PROGRAMMING', entity_type: 'AUTHORITY' });
  model.upsertEntity({ entity_id: 'CORE', entity_type: 'AUTHORITY' });
  const authority = new AuthorityBoundaryService({ model });
  authority.registerResponsibility({ responsibility_id: 'RESP-1', key: 'github-traffic' });
  authority.assignAuthority({ assignment_id: 'ASSIGN-1', responsibility_id: 'RESP-1', owner_entity_id: 'PROGRAMMING' });
  authority.defineBoundary({ boundary_id: 'BOUNDARY-1', responsibility_id: 'RESP-1', canonical_owner_entity_id: 'PROGRAMMING', delegate_entity_ids: ['CORE'], permitted_calls: ['A01_QUALIFY'] });
  const store = new InMemoryAtomicSnapshotStore();
  const service = new SnapshotConsistencyService({ workspace_id: 'programming-controller', store });
  const initial = service.bootstrap({ model, authority });
  assert.equal(initial.payload.authority_state.responsibilities.length, 1);
  assert.equal(initial.payload.authority_state.assignments[0].owner_entity_id, 'PROGRAMMING');
  assert.deepEqual(initial.payload.authority_state.boundaries[0].delegate_entity_ids, ['CORE']);
  service.openChangeSet({ change_set_id: 'CS-AUTH' });
  service.applyChange('CS-AUTH', { kind: 'REGISTER_RESPONSIBILITY', value: { responsibility_id: 'RESP-2', key: 'runner-routing' } });
  service.applyChange('CS-AUTH', { kind: 'ASSIGN_AUTHORITY', value: { assignment_id: 'ASSIGN-2', responsibility_id: 'RESP-2', owner_entity_id: 'PROGRAMMING' } });
  const receipt = service.commitChangeSet({ change_set_id: 'CS-AUTH', command_id: 'CMD-AUTH' });
  const current = service.getSnapshot(receipt.snapshot_id);
  assert.equal(current.payload.authority_state.responsibilities.length, 2);
  assert.equal(current.payload.authority_state.assignments.length, 2);
});

test('content identity changes when parent lineage changes even for identical payload', () => {
  const payload = { workspace_id: 'programming-controller', entity_types: [], relationship_types: [], entities: [], relationships: [] };
  const a = createSnapshot({ workspace_id: 'programming-controller', payload, parent_snapshot_id: 'snap:parent-a' });
  const b = createSnapshot({ workspace_id: 'programming-controller', payload, parent_snapshot_id: 'snap:parent-b' });
  assert.notEqual(a.snapshot_id, b.snapshot_id);
  assert.equal(a.payload_digest, b.payload_digest);
});
