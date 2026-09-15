'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SystemModelService, SystemModelError } = require('../src/system-model');
const { InMemoryModelStore, ModelSnapshotService } = require('../src/model-snapshots');
const { ENVELOPE_SCHEMA, ImportExportService, ProjectionAdapterRegistry, REQUIRED_VIEWPOINTS, ViewProjectionService } = require('../src/model-io');

function fixture() {
  const model = new SystemModelService({ workspace_id: 'programming-controller' });
  for (const type of ['AUTHORITY', 'COMPONENT', 'DATA_STORE']) model.registerEntityType({ type });
  model.registerRelationshipType({ type: 'DEPENDS_ON', cycle_policy: 'ACYCLIC' });
  model.registerRelationshipType({ type: 'CALLS', cycle_policy: 'ALLOW' });
  model.upsertEntity({ entity_id: 'PROGRAMMING', entity_type: 'AUTHORITY' });
  model.upsertEntity({ entity_id: 'controller', entity_type: 'COMPONENT' });
  model.upsertEntity({ entity_id: 'ledger', entity_type: 'DATA_STORE' });
  model.declareRelationship({ relationship_id: 'R1', source_entity_id: 'controller', target_entity_id: 'ledger', relationship_type: 'DEPENDS_ON' });
  const store = new InMemoryModelStore();
  const snapshots = new ModelSnapshotService({ store });
  const snapshot = snapshots.createWorkspace({ workspace_id: 'programming-controller', initial_model: model.exportDraft() });
  return { store, snapshots, snapshot };
}

test('registers all required engineer viewpoints and binds generated views to one immutable snapshot', () => {
  const { snapshots, snapshot } = fixture();
  const views = new ViewProjectionService({ snapshotService: snapshots });
  assert.deepEqual(views.listViewpoints().map((v) => v.viewpoint_id).sort(), [...REQUIRED_VIEWPOINTS].sort());
  const dependency = views.generateView({ snapshot_id: snapshot.snapshot_id, viewpoint_id: 'DEPENDENCY' });
  assert.equal(dependency.snapshot_id, snapshot.snapshot_id);
  assert.equal(dependency.viewpoint_id, 'DEPENDENCY');
  assert.equal(dependency.content.relationships.length, 1);
  assert.deepEqual(dependency.content.entities.map((e) => e.entity_id).sort(), ['controller', 'ledger']);
});

test('returns an explicit unsupported-elements marker rather than inventing missing security semantics', () => {
  const { snapshots, snapshot } = fixture();
  const views = new ViewProjectionService({ snapshotService: snapshots });
  const security = views.generateView({ snapshot_id: snapshot.snapshot_id, viewpoint_id: 'SECURITY' });
  assert.deepEqual(security.content.unsupported_elements, ['NO_MATCHING_SEMANTIC_ELEMENTS_IN_SNAPSHOT']);
});

test('exports a deterministic canonical envelope including authority and constraint extensions', () => {
  const { snapshots, snapshot } = fixture();
  const io = new ImportExportService({ snapshotService: snapshots });
  const envelope = io.exportSnapshot({
    snapshot_id: snapshot.snapshot_id,
    authority_state: {
      responsibilities: [{ responsibility_id: 'RESP-1', key: 'github-traffic' }],
      assignments: [{ assignment_id: 'ASSIGN-1', responsibility_id: 'RESP-1', owner_entity_id: 'PROGRAMMING' }],
      boundaries: [{ boundary_id: 'BOUNDARY-1', responsibility_id: 'RESP-1' }]
    },
    constraints: [{ constraint_id: 'C1', rule: 'NO_PRODUCT_RUNTIME_EMBEDDING' }]
  });
  assert.equal(envelope.schema, ENVELOPE_SCHEMA);
  assert.equal(envelope.snapshot_id, snapshot.snapshot_id);
  assert.equal(envelope.responsibilities.length, 1);
  assert.equal(io.serializeEnvelope(envelope), io.serializeEnvelope(JSON.parse(JSON.stringify(envelope))));
});

test('imports canonical JSON only as a validated non-authoritative candidate', () => {
  const { store, snapshots, snapshot } = fixture();
  const io = new ImportExportService({ snapshotService: snapshots });
  const before = store.getWorkspace('programming-controller').active_snapshot_id;
  const envelope = io.exportSnapshot({ snapshot_id: snapshot.snapshot_id });
  const candidate = io.importModel({ document: io.serializeEnvelope(envelope) });
  assert.equal(candidate.standing, 'CANDIDATE_NOT_AUTHORITATIVE');
  assert.equal(candidate.source_snapshot_id, snapshot.snapshot_id);
  assert.equal(store.getWorkspace('programming-controller').active_snapshot_id, before);
});

test('rejects invalid or oversized import envelopes without mutating canonical state', () => {
  const { store, snapshots, snapshot } = fixture();
  const io = new ImportExportService({ snapshotService: snapshots, max_import_bytes: 200 });
  const before = store.getWorkspace('programming-controller').active_snapshot_id;
  assert.throws(() => io.importModel({ document: '{broken' }), (error) => error instanceof SystemModelError && error.code === 'IMPORT_JSON_INVALID');
  const envelope = { schema: ENVELOPE_SCHEMA, snapshot_id: snapshot.snapshot_id, workspace_id: 'programming-controller', model: { workspace_id: 'programming-controller', entity_types: [], relationship_types: [], entities: [], relationships: [] }, padding: 'x'.repeat(500) };
  assert.throws(() => io.importModel({ document: envelope }), (error) => error instanceof SystemModelError && error.code === 'IMPORT_BUDGET_EXCEEDED');
  assert.equal(store.getWorkspace('programming-controller').active_snapshot_id, before);
});

test('marks external projections as lossless or lossy and reports unsupported semantics', () => {
  const { snapshots, snapshot } = fixture();
  const io = new ImportExportService({ snapshotService: snapshots });
  const canonical = io.exportSnapshot({ snapshot_id: snapshot.snapshot_id });
  const adapters = new ProjectionAdapterRegistry();
  adapters.registerAdapter({
    adapter_id: 'summary-v1',
    fidelity: 'LOSSY',
    exportProjection: (envelope) => ({ content: { entity_count: envelope.model.entities.length }, unsupported_elements: ['relationships', 'schemas', 'authority_state'] })
  });
  const projected = adapters.export({ adapter_id: 'summary-v1', canonical_envelope: canonical });
  assert.equal(projected.fidelity, 'LOSSY');
  assert.deepEqual(projected.unsupported_elements, ['authority_state', 'relationships', 'schemas']);
  assert.throws(() => adapters.import({ adapter_id: 'summary-v1', projection: projected }), (error) => error instanceof SystemModelError && error.code === 'LOSSY_IMPORT_FORBIDDEN');
});

test('supports a declared lossless projection adapter with explicit round-trip import', () => {
  const { snapshots, snapshot } = fixture();
  const io = new ImportExportService({ snapshotService: snapshots });
  const canonical = io.exportSnapshot({ snapshot_id: snapshot.snapshot_id });
  const adapters = new ProjectionAdapterRegistry();
  adapters.registerAdapter({
    adapter_id: 'canonical-json-v1',
    fidelity: 'LOSSLESS',
    exportProjection: (envelope) => ({ content: JSON.stringify(envelope), unsupported_elements: [] }),
    importProjection: (projection) => JSON.parse(projection.content)
  });
  const projection = adapters.export({ adapter_id: 'canonical-json-v1', canonical_envelope: canonical });
  const imported = adapters.import({ adapter_id: 'canonical-json-v1', projection });
  assert.equal(imported.snapshot_id, snapshot.snapshot_id);
  assert.equal(projection.unsupported_elements.length, 0);
});
