'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SystemModelError, SystemModelService } = require('../src/system-model');
const { AuthorityBoundaryService, DependencyGraphEngine } = require('../src/authority-model');

function fixture() {
  const model = new SystemModelService({ workspace_id: 'programming-controller' });
  model.registerEntityType({ type: 'AUTHORITY' });
  model.registerEntityType({ type: 'COMPONENT' });
  model.registerRelationshipType({ type: 'DEPENDS_ON', cycle_policy: 'ACYCLIC' });
  for (const id of ['PROGRAMMING', 'CORE', 'A', 'B', 'C']) {
    model.upsertEntity({ entity_id: id, entity_type: id === 'PROGRAMMING' || id === 'CORE' ? 'AUTHORITY' : 'COMPONENT' });
  }
  return {
    model,
    authority: new AuthorityBoundaryService({ model }),
    graph: new DependencyGraphEngine({ model })
  };
}

test('resolves exactly one canonical owner and preserves delegation without ownership transfer', () => {
  const { authority } = fixture();
  authority.registerResponsibility({ responsibility_id: 'RESP-1', key: 'github-traffic', required: true });
  authority.assignAuthority({ assignment_id: 'ASSIGN-1', responsibility_id: 'RESP-1', owner_entity_id: 'PROGRAMMING', evidence_refs: ['R5AY'] });
  authority.defineBoundary({
    boundary_id: 'BOUNDARY-1',
    responsibility_id: 'RESP-1',
    canonical_owner_entity_id: 'PROGRAMMING',
    delegate_entity_ids: ['CORE'],
    permitted_calls: ['A01_QUALIFY']
  });
  const resolved = authority.resolveAuthority('RESP-1');
  assert.equal(resolved.owner_entity_id, 'PROGRAMMING');
  assert.deepEqual(resolved.boundary.delegate_entity_ids, ['CORE']);
  assert.equal(resolved.boundary.ownership_transfer_allowed, false);
});

test('rejects competing active canonical owners', () => {
  const { authority } = fixture();
  authority.registerResponsibility({ responsibility_id: 'RESP-1', key: 'source-control' });
  authority.assignAuthority({ assignment_id: 'ASSIGN-1', responsibility_id: 'RESP-1', owner_entity_id: 'PROGRAMMING' });
  assert.throws(
    () => authority.assignAuthority({ assignment_id: 'ASSIGN-2', responsibility_id: 'RESP-1', owner_entity_id: 'CORE' }),
    (error) => error instanceof SystemModelError && error.code === 'CANONICAL_OWNER_COLLISION'
  );
});

test('reports required responsibilities with no active owner', () => {
  const { authority } = fixture();
  authority.registerResponsibility({ responsibility_id: 'RESP-A', key: 'a', required: true });
  authority.registerResponsibility({ responsibility_id: 'RESP-B', key: 'b', required: false });
  assert.deepEqual(authority.findRequiredUnownedResponsibilities(), ['RESP-A']);
});

test('computes deterministic dependents and bounded impact', () => {
  const { model, graph } = fixture();
  model.declareRelationship({ relationship_id: 'R1', source_entity_id: 'B', target_entity_id: 'A', relationship_type: 'DEPENDS_ON' });
  model.declareRelationship({ relationship_id: 'R2', source_entity_id: 'C', target_entity_id: 'B', relationship_type: 'DEPENDS_ON' });
  assert.deepEqual(graph.getDependents('A'), ['B']);
  const impact = graph.evaluateImpact({ entity_id: 'A', max_nodes: 10 });
  assert.deepEqual(impact.impacted_entity_ids, ['B', 'C']);
  assert.equal(impact.truncated, false);
});

test('marks bounded traversal as truncated instead of silently dropping work', () => {
  const { model, graph } = fixture();
  model.declareRelationship({ relationship_id: 'R1', source_entity_id: 'B', target_entity_id: 'A', relationship_type: 'DEPENDS_ON' });
  model.declareRelationship({ relationship_id: 'R2', source_entity_id: 'C', target_entity_id: 'B', relationship_type: 'DEPENDS_ON' });
  const impact = graph.evaluateImpact({ entity_id: 'A', max_nodes: 2 });
  assert.equal(impact.truncated, true);
  assert.deepEqual(impact.impacted_entity_ids, ['B']);
});
