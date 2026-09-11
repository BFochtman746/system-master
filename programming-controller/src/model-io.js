'use strict';

const crypto = require('crypto');
const { SystemModelError, SystemModelService } = require('./system-model');
const { canonicalStringify } = require('./model-snapshots');

const ENVELOPE_SCHEMA = 'programming-system-model/v1';
const FIDELITY = new Set(['LOSSLESS', 'LOSSY']);
const REQUIRED_VIEWPOINTS = Object.freeze([
  'CONTEXT',
  'LOGICAL_COMPONENT',
  'AUTHORITY_BOUNDARY',
  'DEPENDENCY',
  'DATA_INTERFACE',
  'RUNTIME_CHANGE',
  'SECURITY'
]);

function requiredString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SystemModelError('INVALID_FIELD', `${field} must be a non-empty string`, { field });
  }
  return value;
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function sha256String(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function validateModelState(state) {
  const model = new SystemModelService({ workspace_id: state.workspace_id });
  for (const definition of state.entity_types || []) model.registerEntityType(cloneJson(definition));
  for (const definition of state.relationship_types || []) model.registerRelationshipType(cloneJson(definition));
  for (const entity of state.entities || []) model.upsertEntity(cloneJson(entity));
  for (const relationship of state.relationships || []) model.declareRelationship(cloneJson(relationship));
  model.validate();
  return true;
}

class ViewProjectionService {
  constructor({ snapshotService }) {
    if (!snapshotService) throw new SystemModelError('SNAPSHOT_SERVICE_REQUIRED', 'ViewProjectionService requires ModelSnapshotService');
    this.snapshotService = snapshotService;
    this.viewpoints = new Map();
    for (const viewpointId of REQUIRED_VIEWPOINTS) {
      this.registerViewpoint({
        viewpoint_id: viewpointId,
        concern: viewpointId.toLowerCase().replaceAll('_', '-'),
        fidelity: 'LOSSY',
        projector: (model) => this.defaultProject(viewpointId, model)
      });
    }
  }

  registerViewpoint({ viewpoint_id, concern, fidelity = 'LOSSY', projector }) {
    const id = requiredString(viewpoint_id, 'viewpoint_id');
    requiredString(concern, 'viewpoint.concern');
    if (this.viewpoints.has(id)) throw new SystemModelError('VIEWPOINT_EXISTS', `Viewpoint already exists: ${id}`, { viewpoint_id: id });
    if (!FIDELITY.has(fidelity)) throw new SystemModelError('INVALID_FIDELITY', `Unsupported fidelity: ${fidelity}`, { fidelity });
    if (typeof projector !== 'function') throw new SystemModelError('PROJECTOR_REQUIRED', 'viewpoint projector must be a function', { viewpoint_id: id });
    const record = { viewpoint_id: id, concern, fidelity, projector };
    this.viewpoints.set(id, record);
    return deepFreeze({ viewpoint_id: id, concern, fidelity });
  }

  listViewpoints() {
    return [...this.viewpoints.values()].map(({ projector, ...record }) => deepFreeze(cloneJson(record))).sort((a, b) => a.viewpoint_id.localeCompare(b.viewpoint_id));
  }

  defaultProject(viewpointId, model) {
    const entities = model.entities || [];
    const relationships = model.relationships || [];
    const contains = (value, parts) => parts.some((part) => String(value || '').toUpperCase().includes(part));
    const rules = {
      CONTEXT: { entity: [], relationship: [], all: true },
      LOGICAL_COMPONENT: { entity: ['COMPONENT', 'MODULE', 'SERVICE'], relationship: ['CALL', 'CONTAIN'] },
      AUTHORITY_BOUNDARY: { entity: ['AUTHORITY', 'BOUNDARY', 'OWNER'], relationship: ['OWN', 'DELEGAT', 'BOUNDARY'] },
      DEPENDENCY: { entity: [], relationship: ['DEPEND'], include_relationship_endpoints: true },
      DATA_INTERFACE: { entity: ['DATA', 'STORE', 'SCHEMA', 'INTERFACE', 'API'], relationship: ['READ', 'WRITE', 'CALL', 'PRODUCE', 'CONSUME'] },
      RUNTIME_CHANGE: { entity: ['RUNTIME', 'PROCESS', 'JOB', 'CHANGE', 'DEPLOY'], relationship: ['RUN', 'CHANGE', 'DEPLOY'] },
      SECURITY: { entity: ['SECURITY', 'TRUST', 'SECRET', 'AUTHORIZATION', 'CREDENTIAL'], relationship: ['TRUST', 'AUTHORIZE', 'PERMIT', 'DENY'] }
    };
    const rule = rules[viewpointId];
    if (rule.all) return { entities: cloneJson(entities), relationships: cloneJson(relationships), unsupported_elements: [] };
    const selectedRelationships = relationships.filter((rel) => contains(rel.relationship_type, rule.relationship));
    const endpointIds = new Set();
    if (rule.include_relationship_endpoints) {
      for (const rel of selectedRelationships) { endpointIds.add(rel.source_entity_id); endpointIds.add(rel.target_entity_id); }
    }
    const selectedEntities = entities.filter((entity) => contains(entity.entity_type, rule.entity) || endpointIds.has(entity.entity_id));
    const unsupported = selectedEntities.length === 0 && selectedRelationships.length === 0 ? ['NO_MATCHING_SEMANTIC_ELEMENTS_IN_SNAPSHOT'] : [];
    return { entities: cloneJson(selectedEntities), relationships: cloneJson(selectedRelationships), unsupported_elements: unsupported };
  }

  generateView({ snapshot_id, viewpoint_id }) {
    const id = requiredString(viewpoint_id, 'viewpoint_id');
    const viewpoint = this.viewpoints.get(id);
    if (!viewpoint) throw new SystemModelError('VIEWPOINT_NOT_SUPPORTED', `Unsupported viewpoint: ${id}`, { viewpoint_id: id });
    const snapshot = this.snapshotService.store.getSnapshot(snapshot_id);
    if (!snapshot) throw new SystemModelError('SNAPSHOT_UNKNOWN', `Unknown snapshot: ${snapshot_id}`, { snapshot_id });
    this.snapshotService.verifySnapshotIntegrity(snapshot);
    const projected = viewpoint.projector(deepFreeze(cloneJson(snapshot.model)));
    return deepFreeze({
      snapshot_id,
      viewpoint_id: id,
      concern: viewpoint.concern,
      fidelity: viewpoint.fidelity,
      content: cloneJson(projected)
    });
  }
}

class ProjectionAdapterRegistry {
  constructor() {
    this.adapters = new Map();
  }

  registerAdapter({ adapter_id, fidelity, exportProjection, importProjection = null }) {
    const id = requiredString(adapter_id, 'adapter_id');
    if (this.adapters.has(id)) throw new SystemModelError('PROJECTION_ADAPTER_EXISTS', `Projection adapter already exists: ${id}`, { adapter_id: id });
    if (!FIDELITY.has(fidelity)) throw new SystemModelError('INVALID_FIDELITY', `Unsupported fidelity: ${fidelity}`, { fidelity });
    if (typeof exportProjection !== 'function') throw new SystemModelError('EXPORT_ADAPTER_REQUIRED', 'exportProjection must be a function', { adapter_id: id });
    if (importProjection !== null && typeof importProjection !== 'function') throw new SystemModelError('INVALID_IMPORT_ADAPTER', 'importProjection must be null or a function', { adapter_id: id });
    this.adapters.set(id, { adapter_id: id, fidelity, exportProjection, importProjection });
    return deepFreeze({ adapter_id: id, fidelity, can_import: importProjection !== null });
  }

  export({ adapter_id, canonical_envelope }) {
    const adapter = this.adapters.get(adapter_id);
    if (!adapter) throw new SystemModelError('PROJECTION_ADAPTER_UNKNOWN', `Unknown projection adapter: ${adapter_id}`, { adapter_id });
    const result = adapter.exportProjection(deepFreeze(cloneJson(canonical_envelope)));
    const unsupported = [...new Set(result?.unsupported_elements || [])].sort();
    return deepFreeze({
      adapter_id,
      source_snapshot_id: canonical_envelope.snapshot_id,
      fidelity: adapter.fidelity,
      unsupported_elements: unsupported,
      content: cloneJson(result?.content)
    });
  }

  import({ adapter_id, projection }) {
    const adapter = this.adapters.get(adapter_id);
    if (!adapter) throw new SystemModelError('PROJECTION_ADAPTER_UNKNOWN', `Unknown projection adapter: ${adapter_id}`, { adapter_id });
    if (adapter.fidelity !== 'LOSSLESS') throw new SystemModelError('LOSSY_IMPORT_FORBIDDEN', 'Lossy projection cannot be accepted as canonical import', { adapter_id });
    if (!adapter.importProjection) throw new SystemModelError('PROJECTION_IMPORT_NOT_SUPPORTED', 'Projection adapter does not support import', { adapter_id });
    return adapter.importProjection(cloneJson(projection));
  }
}

class ImportExportService {
  constructor({ snapshotService, max_import_bytes = 1024 * 1024 } = {}) {
    if (!snapshotService) throw new SystemModelError('SNAPSHOT_SERVICE_REQUIRED', 'ImportExportService requires ModelSnapshotService');
    if (!Number.isInteger(max_import_bytes) || max_import_bytes <= 0) throw new SystemModelError('INVALID_IMPORT_BUDGET', 'max_import_bytes must be a positive integer', { max_import_bytes });
    this.snapshotService = snapshotService;
    this.maxImportBytes = max_import_bytes;
  }

  exportSnapshot({ snapshot_id, authority_state = {}, constraints = [] }) {
    const snapshot = this.snapshotService.store.getSnapshot(snapshot_id);
    if (!snapshot) throw new SystemModelError('SNAPSHOT_UNKNOWN', `Unknown snapshot: ${snapshot_id}`, { snapshot_id });
    this.snapshotService.verifySnapshotIntegrity(snapshot);
    const envelope = {
      schema: ENVELOPE_SCHEMA,
      snapshot_id: snapshot.snapshot_id,
      parent_snapshot_id: snapshot.parent_snapshot_id,
      workspace_id: snapshot.workspace_id,
      digest_algorithm: snapshot.digest_algorithm,
      model: cloneJson(snapshot.model),
      responsibilities: cloneJson(authority_state.responsibilities || []),
      authority_assignments: cloneJson(authority_state.assignments || []),
      boundaries: cloneJson(authority_state.boundaries || []),
      constraints: cloneJson(constraints)
    };
    return deepFreeze(envelope);
  }

  serializeEnvelope(envelope) {
    return canonicalStringify(envelope);
  }

  importModel({ document }) {
    const raw = typeof document === 'string' ? document : canonicalStringify(document);
    const byteLength = Buffer.byteLength(raw, 'utf8');
    if (byteLength > this.maxImportBytes) throw new SystemModelError('IMPORT_BUDGET_EXCEEDED', 'Import exceeds admitted byte budget', { byte_length: byteLength, max_import_bytes: this.maxImportBytes });
    let envelope;
    try { envelope = typeof document === 'string' ? JSON.parse(document) : cloneJson(document); }
    catch (error) { throw new SystemModelError('IMPORT_JSON_INVALID', 'Import is not valid JSON', { message: error.message }); }
    if (envelope?.schema !== ENVELOPE_SCHEMA) throw new SystemModelError('IMPORT_SCHEMA_UNSUPPORTED', `Unsupported model envelope schema: ${envelope?.schema}`, { schema: envelope?.schema });
    requiredString(envelope.workspace_id, 'envelope.workspace_id');
    requiredString(envelope.snapshot_id, 'envelope.snapshot_id');
    if (!envelope.model || envelope.model.workspace_id !== envelope.workspace_id) throw new SystemModelError('IMPORT_WORKSPACE_MISMATCH', 'Imported model does not match envelope workspace', { workspace_id: envelope.workspace_id, model_workspace_id: envelope.model?.workspace_id });
    validateModelState(envelope.model);
    const candidateId = `import:${sha256String(canonicalStringify(envelope))}`;
    return deepFreeze({
      import_candidate_id: candidateId,
      standing: 'CANDIDATE_NOT_AUTHORITATIVE',
      source_snapshot_id: envelope.snapshot_id,
      workspace_id: envelope.workspace_id,
      model: cloneJson(envelope.model),
      authority_state: {
        responsibilities: cloneJson(envelope.responsibilities || []),
        assignments: cloneJson(envelope.authority_assignments || []),
        boundaries: cloneJson(envelope.boundaries || [])
      },
      constraints: cloneJson(envelope.constraints || [])
    });
  }
}

module.exports = {
  ENVELOPE_SCHEMA,
  ImportExportService,
  ProjectionAdapterRegistry,
  REQUIRED_VIEWPOINTS,
  ViewProjectionService
};
