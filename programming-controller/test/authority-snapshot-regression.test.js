'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SystemModelService } = require('../src/system-model');
const { InMemoryModelStore, ModelSnapshotService } = require('../src/model-snapshots');

function initialModel() {
  const model = new SystemModelService({ workspace_id: 'programming-controller' });
  model.registerEntityType({ type: 'AUTHORITY' });
  model.upsertEntity({ entity_id: 'PROGRAMMING', entity_type: 'AUTHORITY' });
  model.upsertEntity({ entity_id: 'CORE', entity_type: 'AUTHORITY' });
  return model.exportDraft();
}

test('authority assignments and boundaries are part of immutable canonical snapshot truth', () => {
  const store = new InMemoryModelStore();
  const service = new ModelSnapshotService({ store });
  const genesis = service.createWorkspace({ workspace_id: 'programming-controller', initial_model: initialModel() });

  service.openChangeSet({
    workspace_id: 'programming-controller',
    change_set_id: 'CS-AUTHORITY',
    base_snapshot_id: genesis.snapshot_id
  });
  service.applyChange({
    change_set_id: 'CS-AUTHORITY',
    expected_revision: 0,
    operation: {
      kind: 'REGISTER_RESPONSIBILITY',
      responsibility: { responsibility_id: 'RESP-GITHUB', key: 'github-traffic', required: true }
    }
  });
  service.applyChange({
    change_set_id: 'CS-AUTHORITY',
    expected_revision: 1,
    operation: {
      kind: 'ASSIGN_AUTHORITY',
      assignment: {
        assignment_id: 'ASSIGN-GITHUB',
        responsibility_id: 'RESP-GITHUB',
        owner_entity_id: 'PROGRAMMING',
        evidence_refs: ['R5AY']
      }
    }
  });
  service.applyChange({
    change_set_id: 'CS-AUTHORITY',
    expected_revision: 2,
    operation: {
      kind: 'DEFINE_BOUNDARY',
      boundary: {
        boundary_id: 'BOUNDARY-GITHUB-A01',
        responsibility_id: 'RESP-GITHUB',
        canonical_owner_entity_id: 'PROGRAMMING',
        delegate_entity_ids: ['CORE'],
        permitted_calls: ['A01_QUALIFY']
      }
    }
  });

  const receipt = service.commitChangeSet({
    change_set_id: 'CS-AUTHORITY',
    command_id: 'CMD-AUTHORITY',
    expected_base_snapshot_id: genesis.snapshot_id
  });
  const active = service.getActiveSnapshot('programming-controller');

  assert.equal(active.snapshot_id, receipt.snapshot_id);
  assert.equal(active.model.authority_state.responsibilities.length, 1);
  assert.equal(active.model.authority_state.assignments[0].owner_entity_id, 'PROGRAMMING');
  assert.deepEqual(active.model.authority_state.boundaries[0].delegate_entity_ids, ['CORE']);
  assert.equal(active.model.authority_state.boundaries[0].ownership_transfer_allowed, false);
  assert.equal(service.verifySnapshotIntegrity(active.snapshot_id), true);

  const restarted = new ModelSnapshotService({ store });
  const afterRestart = restarted.getActiveSnapshot('programming-controller');
  assert.deepEqual(afterRestart.model.authority_state, active.model.authority_state);
});

test('explicit command recovery resolves a previously committed result without replaying effects', () => {
  const store = new InMemoryModelStore();
  const service = new ModelSnapshotService({ store });
  const genesis = service.createWorkspace({ workspace_id: 'programming-controller', initial_model: initialModel() });
  service.openChangeSet({ workspace_id: 'programming-controller', change_set_id: 'CS-RECOVER' });
  const receipt = service.commitChangeSet({
    change_set_id: 'CS-RECOVER',
    command_id: 'CMD-RECOVER',
    expected_base_snapshot_id: genesis.snapshot_id
  });

  const recovered = new ModelSnapshotService({ store }).recoverCommand({ command_id: 'CMD-RECOVER' });
  assert.equal(recovered.standing, 'COMMITTED');
  assert.deepEqual(recovered.receipt, receipt);
  assert.equal(recovered.snapshot.snapshot_id, receipt.snapshot_id);
  assert.equal(store.commitHistory.get('programming-controller').length, 2);
});

test('legacy snapshots without authority_state remain valid and readable', () => {
  const store = new InMemoryModelStore();
  const service = new ModelSnapshotService({ store });
  const genesis = service.createWorkspace({ workspace_id: 'programming-controller', initial_model: initialModel() });
  assert.equal(genesis.model.authority_state, undefined);
  assert.equal(service.verifySnapshotIntegrity(genesis.snapshot_id), true);
});
