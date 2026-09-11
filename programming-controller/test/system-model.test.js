'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SystemModelError, SystemModelService } = require('../src/system-model');

function model() {
  const service = new SystemModelService({
    workspace_id: 'programming-controller',
    identityValidator: (id) => typeof id === 'string' && /^[A-Za-z0-9._:-]+$/.test(id)
  });
  service.registerEntityType({ type: 'AUTHORITY', required_attributes: ['owner'] });
  service.registerEntityType({ type: 'COMPONENT' });
  service.registerRelationshipType({ type: 'DEPENDS_ON', cycle_policy: 'ACYCLIC' });
  service.registerRelationshipType({ type: 'CALLS', cycle_policy: 'ALLOW' });
  return service;
}

test('registers typed entities and relationships and validates the draft', () => {
  const service = model();
  service.upsertEntity({ entity_id: 'A', entity_type: 'AUTHORITY', attributes: { owner: 'PROGRAMMING' } });
  service.upsertEntity({ entity_id: 'B', entity_type: 'COMPONENT' });
  service.declareRelationship({ relationship_id: 'R1', source_entity_id: 'B', target_entity_id: 'A', relationship_type: 'DEPENDS_ON' });
  assert.deepEqual(service.validate(), { valid: true, errors: [] });
  assert.equal(service.queryRelationships({ entity_id: 'A', direction: 'IN' }).length, 1);
});

test('rejects unknown entity types explicitly', () => {
  const service = model();
  assert.throws(
    () => service.upsertEntity({ entity_id: 'X', entity_type: 'UNKNOWN' }),
    (error) => error instanceof SystemModelError && error.code === 'UNKNOWN_ENTITY_TYPE'
  );
});

test('rejects relationships whose endpoints do not exist', () => {
  const service = model();
  service.upsertEntity({ entity_id: 'A', entity_type: 'AUTHORITY', attributes: { owner: 'PROGRAMMING' } });
  assert.throws(
    () => service.declareRelationship({ relationship_id: 'R1', source_entity_id: 'A', target_entity_id: 'MISSING', relationship_type: 'DEPENDS_ON' }),
    (error) => error instanceof SystemModelError && error.code === 'RELATIONSHIP_ENDPOINT_MISSING'
  );
});

test('rejects cycles for acyclic relationship classes and rolls back the rejected edge', () => {
  const service = model();
  for (const id of ['A', 'B', 'C']) service.upsertEntity({ entity_id: id, entity_type: 'COMPONENT' });
  service.declareRelationship({ relationship_id: 'R1', source_entity_id: 'A', target_entity_id: 'B', relationship_type: 'DEPENDS_ON' });
  service.declareRelationship({ relationship_id: 'R2', source_entity_id: 'B', target_entity_id: 'C', relationship_type: 'DEPENDS_ON' });
  assert.throws(
    () => service.declareRelationship({ relationship_id: 'R3', source_entity_id: 'C', target_entity_id: 'A', relationship_type: 'DEPENDS_ON' }),
    (error) => error instanceof SystemModelError && error.code === 'RELATIONSHIP_CYCLE'
  );
  assert.equal(service.queryRelationships({ relationship_type: 'DEPENDS_ON' }).length, 2);
});

test('does not guess identity acceptance when the 001N identity port rejects an id', () => {
  const service = model();
  assert.throws(
    () => service.upsertEntity({ entity_id: 'contains spaces', entity_type: 'COMPONENT' }),
    (error) => error instanceof SystemModelError && error.code === 'IDENTITY_REJECTED'
  );
});

test('requires all declared type attributes', () => {
  const service = model();
  assert.throws(
    () => service.upsertEntity({ entity_id: 'A', entity_type: 'AUTHORITY', attributes: {} }),
    (error) => error instanceof SystemModelError && error.code === 'MISSING_REQUIRED_ATTRIBUTE'
  );
});

test('exports the current draft without inventing persisted snapshot semantics', () => {
  const service = model();
  service.upsertEntity({ entity_id: 'A', entity_type: 'AUTHORITY', attributes: { owner: 'PROGRAMMING' } });
  const draft = service.exportDraft();
  assert.equal(draft.workspace_id, 'programming-controller');
  assert.equal(draft.entities.length, 1);
  assert.equal(draft.relationships.length, 0);
});
