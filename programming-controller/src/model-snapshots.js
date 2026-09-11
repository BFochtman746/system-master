'use strict';

const crypto = require('crypto');
const { SystemModelError, SystemModelService } = require('./system-model');
const { AuthorityBoundaryService } = require('./authority-model');

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

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(canonicalStringify(value)).digest('hex');
}

function snapshotDigestInput(snapshot) {
  return {
    workspace_id: snapshot.workspace_id,
    parent_snapshot_id: snapshot.parent_snapshot_id,
    model: snapshot.model
  };
}

function makeSnapshot({ workspace_id, parent_snapshot_id = null, model, created_at = new Date().toISOString() }) {
  requiredString(workspace_id, 'workspace_id');
  const digest = sha256({ workspace_id, parent_snapshot_id, model });
  return deepFreeze({
    snapshot_id: `sha256:${digest}`,
    digest_algorithm: 'sha256',
    workspace_id,
    parent_snapshot_id,
    created_at,
    model: cloneJson(model)
  });
}

function hydrateRuntime(modelState, identityValidator = null) {
  const model = new SystemModelService({ workspace_id: modelState.workspace_id, identityValidator });
  for (const definition of modelState.entity_types || []) model.registerEntityType(cloneJson(definition));
  for (const definition of modelState.relationship_types || []) model.registerRelationshipType(cloneJson(definition));
  for (const entity of modelState.entities || []) model.upsertEntity(cloneJson(entity));
  for (const relationship of modelState.relationships || []) model.declareRelationship(cloneJson(relationship));
  model.validate();

  let authority = null;
  if (modelState.authority_state) {
    authority = new AuthorityBoundaryService({ model });
    for (const responsibility of modelState.authority_state.responsibilities || []) authority.registerResponsibility(cloneJson(responsibility));
    for (const assignment of modelState.authority_state.assignments || []) authority.assignAuthority(cloneJson(assignment));
    for (const boundary of modelState.authority_state.boundaries || []) authority.defineBoundary(cloneJson(boundary));
  }
  return { model, authority };
}

function hydrateModel(modelState, identityValidator = null) {
  return hydrateRuntime(modelState, identityValidator).model;
}

function ensureAuthority(runtime) {
  if (!runtime.authority) runtime.authority = new AuthorityBoundaryService({ model: runtime.model });
  return runtime.authority;
}

function applyOperation(runtimeOrModel, operation) {
  const runtime = runtimeOrModel instanceof SystemModelService
    ? { model: runtimeOrModel, authority: null }
    : runtimeOrModel;
  if (!runtime?.model) throw new SystemModelError('MODEL_REQUIRED', 'Change operation requires a model runtime');
  const kind = requiredString(operation?.kind, 'operation.kind');
  switch (kind) {
    case 'REGISTER_ENTITY_TYPE':
      return runtime.model.registerEntityType(cloneJson(operation.definition));
    case 'REGISTER_RELATIONSHIP_TYPE':
      return runtime.model.registerRelationshipType(cloneJson(operation.definition));
    case 'UPSERT_ENTITY':
      return runtime.model.upsertEntity(cloneJson(operation.entity));
    case 'DECLARE_RELATIONSHIP':
      return runtime.model.declareRelationship(cloneJson(operation.relationship));
    case 'REGISTER_RESPONSIBILITY':
      return ensureAuthority(runtime).registerResponsibility(cloneJson(operation.responsibility));
    case 'ASSIGN_AUTHORITY':
      return ensureAuthority(runtime).assignAuthority(cloneJson(operation.assignment));
    case 'DEFINE_BOUNDARY':
      return ensureAuthority(runtime).defineBoundary(cloneJson(operation.boundary));
    default:
      throw new SystemModelError('UNSUPPORTED_CHANGE_OPERATION', `Unsupported change operation: ${kind}`, { kind });
  }
}

function materializeRuntimeState(baseState, runtime) {
  const next = { ...cloneJson(baseState), ...runtime.model.exportDraft() };
  if (runtime.authority) next.authority_state = runtime.authority.exportDraft();
  else if (baseState.authority_state) next.authority_state = cloneJson(baseState.authority_state);
  return next;
}

class SnapshotQueryCache {
  constructor({ max_entries = 256 } = {}) {
    if (!Number.isInteger(max_entries) || max_entries <= 0) {
      throw new SystemModelError('INVALID_CACHE_SIZE', 'max_entries must be a positive integer', { max_entries });
    }
    this.maxEntries = max_entries;
    this.entries = new Map();
  }

  getOrCompute({ snapshot_id, query_key, compute }) {
    requiredString(snapshot_id, 'snapshot_id');
    requiredString(query_key, 'query_key');
    if (typeof compute !== 'function') throw new SystemModelError('COMPUTE_REQUIRED', 'compute must be a function');
    const key = `${snapshot_id}\u0000${query_key}`;
    if (this.entries.has(key)) return this.entries.get(key);
    const value = deepFreeze(cloneJson(compute()));
    this.entries.set(key, value);
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
    return value;
  }
}

class InMemoryModelStore {
  constructor() {
    this.workspaces = new Map();
    this.snapshots = new Map();
    this.changeSets = new Map();
    this.receipts = new Map();
    this.outbox = new Map();
    this.commitHistory = new Map();
    this.recoveryRecords = [];
  }

  initializeWorkspace({ workspace_id, genesis_snapshot }) {
    if (this.workspaces.has(workspace_id)) throw new SystemModelError('WORKSPACE_EXISTS', `Workspace already exists: ${workspace_id}`, { workspace_id });
    this.snapshots.set(genesis_snapshot.snapshot_id, genesis_snapshot);
    this.workspaces.set(workspace_id, { workspace_id, active_snapshot_id: genesis_snapshot.snapshot_id });
    this.commitHistory.set(workspace_id, [genesis_snapshot.snapshot_id]);
    return cloneJson(this.workspaces.get(workspace_id));
  }

  getWorkspace(workspaceId) {
    const record = this.workspaces.get(workspaceId);
    return record ? cloneJson(record) : null;
  }

  getSnapshot(snapshotId) {
    const snapshot = this.snapshots.get(snapshotId);
    return snapshot ? cloneJson(snapshot) : null;
  }

  putChangeSet(changeSet) {
    if (this.changeSets.has(changeSet.change_set_id)) throw new SystemModelError('CHANGESET_EXISTS', `Change set already exists: ${changeSet.change_set_id}`, { change_set_id: changeSet.change_set_id });
    this.changeSets.set(changeSet.change_set_id, cloneJson(changeSet));
    return cloneJson(changeSet);
  }

  updateChangeSet(changeSet) {
    if (!this.changeSets.has(changeSet.change_set_id)) throw new SystemModelError('CHANGESET_UNKNOWN', `Unknown change set: ${changeSet.change_set_id}`, { change_set_id: changeSet.change_set_id });
    this.changeSets.set(changeSet.change_set_id, cloneJson(changeSet));
    return cloneJson(changeSet);
  }

  getChangeSet(changeSetId) {
    const record = this.changeSets.get(changeSetId);
    return record ? cloneJson(record) : null;
  }

  getReceipt(commandId) {
    const receipt = this.receipts.get(commandId);
    return receipt ? cloneJson(receipt) : null;
  }

  atomicCommit({ workspace_id, expected_active_snapshot_id, snapshot, change_set, receipt, outbox_event }) {
    const workspace = this.workspaces.get(workspace_id);
    if (!workspace) throw new SystemModelError('WORKSPACE_UNKNOWN', `Unknown workspace: ${workspace_id}`, { workspace_id });
    if (workspace.active_snapshot_id !== expected_active_snapshot_id) {
      throw new SystemModelError('STALE_BASE', 'Active snapshot changed before commit', {
        workspace_id,
        expected_active_snapshot_id,
        actual_active_snapshot_id: workspace.active_snapshot_id
      });
    }
    if (this.receipts.has(receipt.command_id)) throw new SystemModelError('COMMAND_RECEIPT_EXISTS', `Command receipt already exists: ${receipt.command_id}`, { command_id: receipt.command_id });
    this.snapshots.set(snapshot.snapshot_id, snapshot);
    this.changeSets.set(change_set.change_set_id, cloneJson(change_set));
    this.receipts.set(receipt.command_id, cloneJson(receipt));
    this.outbox.set(outbox_event.event_id, cloneJson(outbox_event));
    workspace.active_snapshot_id = snapshot.snapshot_id;
    if (!this.commitHistory.has(workspace_id)) this.commitHistory.set(workspace_id, []);
    this.commitHistory.get(workspace_id).push(snapshot.snapshot_id);
    return cloneJson(receipt);
  }

  listPendingOutboxEvents(workspaceId) {
    return [...this.outbox.values()].filter((event) => event.workspace_id === workspaceId && event.status === 'PENDING').map(cloneJson);
  }

  recoverActivePointer({ workspace_id, snapshot_id, reason, prior_snapshot_id }) {
    const workspace = this.workspaces.get(workspace_id);
    if (!workspace) throw new SystemModelError('WORKSPACE_UNKNOWN', `Unknown workspace: ${workspace_id}`, { workspace_id });
    workspace.active_snapshot_id = snapshot_id;
    const record = deepFreeze({
      recovery_id: `RECOVERY-${this.recoveryRecords.length + 1}`,
      workspace_id,
      prior_snapshot_id,
      recovered_snapshot_id: snapshot_id,
      reason,
      recorded_at: new Date().toISOString()
    });
    this.recoveryRecords.push(record);
    return cloneJson(record);
  }
}

class ModelSnapshotService {
  constructor({ store, identityValidator = null, cache = new SnapshotQueryCache() } = {}) {
    if (!store) throw new SystemModelError('PERSISTENCE_PORT_REQUIRED', 'ModelSnapshotService requires a 001P persistence port');
    this.store = store;
    this.identityValidator = identityValidator;
    this.cache = cache;
  }

  createWorkspace({ workspace_id, initial_model }) {
    requiredString(workspace_id, 'workspace_id');
    const state = cloneJson(initial_model || { workspace_id, entity_types: [], relationship_types: [], entities: [], relationships: [] });
    if (state.workspace_id !== workspace_id) throw new SystemModelError('WORKSPACE_ID_MISMATCH', 'Initial model workspace id does not match requested workspace', { workspace_id, model_workspace_id: state.workspace_id });
    hydrateRuntime(state, this.identityValidator);
    const snapshot = makeSnapshot({ workspace_id, model: state });
    this.store.initializeWorkspace({ workspace_id, genesis_snapshot: snapshot });
    return snapshot;
  }

  getActiveSnapshot(workspaceId) {
    const workspace = this.store.getWorkspace(workspaceId);
    if (!workspace) throw new SystemModelError('WORKSPACE_UNKNOWN', `Unknown workspace: ${workspaceId}`, { workspace_id: workspaceId });
    const snapshot = this.store.getSnapshot(workspace.active_snapshot_id);
    if (!snapshot) throw new SystemModelError('ACTIVE_SNAPSHOT_MISSING', 'Active snapshot pointer does not resolve', { workspace_id: workspaceId, snapshot_id: workspace.active_snapshot_id });
    this.verifySnapshotIntegrity(snapshot);
    return deepFreeze(snapshot);
  }

  verifySnapshotIntegrity(snapshotOrId) {
    const snapshot = typeof snapshotOrId === 'string' ? this.store.getSnapshot(snapshotOrId) : cloneJson(snapshotOrId);
    if (!snapshot) throw new SystemModelError('SNAPSHOT_UNKNOWN', `Unknown snapshot: ${snapshotOrId}`, { snapshot_id: snapshotOrId });
    const expected = `sha256:${sha256(snapshotDigestInput(snapshot))}`;
    if (snapshot.snapshot_id !== expected) {
      throw new SystemModelError('SNAPSHOT_INTEGRITY_FAILED', 'Snapshot digest does not match contents', { snapshot_id: snapshot.snapshot_id, expected_snapshot_id: expected });
    }
    hydrateRuntime(snapshot.model, this.identityValidator);
    return true;
  }

  openChangeSet({ workspace_id, change_set_id, base_snapshot_id = null, actor = null, command_context = null }) {
    requiredString(change_set_id, 'change_set_id');
    const workspace = this.store.getWorkspace(workspace_id);
    if (!workspace) throw new SystemModelError('WORKSPACE_UNKNOWN', `Unknown workspace: ${workspace_id}`, { workspace_id });
    const base = base_snapshot_id || workspace.active_snapshot_id;
    const snapshot = this.store.getSnapshot(base);
    if (!snapshot) throw new SystemModelError('SNAPSHOT_UNKNOWN', `Unknown base snapshot: ${base}`, { snapshot_id: base });
    this.verifySnapshotIntegrity(snapshot);
    return this.store.putChangeSet(deepFreeze({
      change_set_id,
      workspace_id,
      base_snapshot_id: base,
      revision: 0,
      status: 'DRAFT',
      actor: actor || null,
      command_context: cloneJson(command_context || {}),
      operations: []
    }));
  }

  applyChange({ change_set_id, expected_revision, operation }) {
    if (!Number.isInteger(expected_revision) || expected_revision < 0) throw new SystemModelError('INVALID_REVISION', 'expected_revision must be a non-negative integer', { expected_revision });
    const changeSet = this.store.getChangeSet(change_set_id);
    if (!changeSet) throw new SystemModelError('CHANGESET_UNKNOWN', `Unknown change set: ${change_set_id}`, { change_set_id });
    if (changeSet.status !== 'DRAFT') throw new SystemModelError('CHANGESET_NOT_DRAFT', `Change set is not mutable: ${change_set_id}`, { change_set_id, status: changeSet.status });
    if (changeSet.revision !== expected_revision) throw new SystemModelError('STALE_CHANGESET_REVISION', 'Change set revision changed', { change_set_id, expected_revision, actual_revision: changeSet.revision });
    const base = this.store.getSnapshot(changeSet.base_snapshot_id);
    this.verifySnapshotIntegrity(base);
    const runtime = hydrateRuntime(base.model, this.identityValidator);
    for (const prior of changeSet.operations) applyOperation(runtime, prior);
    applyOperation(runtime, operation);
    runtime.model.validate();
    changeSet.operations.push(cloneJson(operation));
    changeSet.revision += 1;
    return this.store.updateChangeSet(changeSet);
  }

  materializeChangeSet(changeSet) {
    const base = this.store.getSnapshot(changeSet.base_snapshot_id);
    if (!base) throw new SystemModelError('SNAPSHOT_UNKNOWN', `Unknown base snapshot: ${changeSet.base_snapshot_id}`, { snapshot_id: changeSet.base_snapshot_id });
    this.verifySnapshotIntegrity(base);
    const runtime = hydrateRuntime(base.model, this.identityValidator);
    for (const operation of changeSet.operations) applyOperation(runtime, operation);
    runtime.model.validate();
    return materializeRuntimeState(base.model, runtime);
  }

  commitChangeSet({ change_set_id, command_id, expected_base_snapshot_id }) {
    requiredString(command_id, 'command_id');
    requiredString(expected_base_snapshot_id, 'expected_base_snapshot_id');
    const requestFingerprint = sha256({ change_set_id, expected_base_snapshot_id });
    const prior = this.store.getReceipt(command_id);
    if (prior) {
      if (prior.request_fingerprint !== requestFingerprint) {
        throw new SystemModelError('IDEMPOTENCY_CONFLICT', 'command_id was already used with different commit semantics', { command_id });
      }
      return deepFreeze(prior);
    }

    const changeSet = this.store.getChangeSet(change_set_id);
    if (!changeSet) throw new SystemModelError('CHANGESET_UNKNOWN', `Unknown change set: ${change_set_id}`, { change_set_id });
    if (changeSet.status !== 'DRAFT') throw new SystemModelError('CHANGESET_NOT_DRAFT', `Change set is not committable: ${change_set_id}`, { change_set_id, status: changeSet.status });
    if (changeSet.base_snapshot_id !== expected_base_snapshot_id) throw new SystemModelError('STALE_BASE', 'Caller expected a different base snapshot', { change_set_id, expected_base_snapshot_id, change_set_base_snapshot_id: changeSet.base_snapshot_id });
    const workspace = this.store.getWorkspace(changeSet.workspace_id);
    if (!workspace) throw new SystemModelError('WORKSPACE_UNKNOWN', `Unknown workspace: ${changeSet.workspace_id}`, { workspace_id: changeSet.workspace_id });
    if (workspace.active_snapshot_id !== changeSet.base_snapshot_id) throw new SystemModelError('STALE_BASE', 'Active snapshot changed after change set was opened', { change_set_id, base_snapshot_id: changeSet.base_snapshot_id, active_snapshot_id: workspace.active_snapshot_id });

    const modelState = this.materializeChangeSet(changeSet);
    const snapshot = makeSnapshot({ workspace_id: changeSet.workspace_id, parent_snapshot_id: changeSet.base_snapshot_id, model: modelState });
    const committedChangeSet = deepFreeze({ ...changeSet, status: 'COMMITTED', committed_snapshot_id: snapshot.snapshot_id });
    const receipt = deepFreeze({
      command_id,
      request_fingerprint: requestFingerprint,
      workspace_id: changeSet.workspace_id,
      change_set_id,
      base_snapshot_id: changeSet.base_snapshot_id,
      snapshot_id: snapshot.snapshot_id,
      change_set_revision: changeSet.revision,
      status: 'COMMITTED'
    });
    const outboxEvent = deepFreeze({
      event_id: `MODEL-COMMIT:${command_id}`,
      workspace_id: changeSet.workspace_id,
      event_type: 'MODEL_SNAPSHOT_COMMITTED',
      command_id,
      change_set_id,
      base_snapshot_id: changeSet.base_snapshot_id,
      snapshot_id: snapshot.snapshot_id,
      status: 'PENDING'
    });
    return deepFreeze(this.store.atomicCommit({
      workspace_id: changeSet.workspace_id,
      expected_active_snapshot_id: changeSet.base_snapshot_id,
      snapshot,
      change_set: committedChangeSet,
      receipt,
      outbox_event: outboxEvent
    }));
  }

  recoverCommand({ command_id, expected_request_fingerprint = null } = {}) {
    requiredString(command_id, 'command_id');
    const receipt = this.store.getReceipt(command_id);
    if (!receipt) return deepFreeze({ command_id, standing: 'NOT_FOUND' });
    if (expected_request_fingerprint && receipt.request_fingerprint !== expected_request_fingerprint) {
      return deepFreeze({
        command_id,
        standing: 'CONFLICT',
        expected_request_fingerprint,
        actual_request_fingerprint: receipt.request_fingerprint
      });
    }
    const snapshot = this.store.getSnapshot(receipt.snapshot_id);
    if (!snapshot) return deepFreeze({ command_id, standing: 'COMMITTED_SNAPSHOT_MISSING', receipt });
    this.verifySnapshotIntegrity(snapshot);
    return deepFreeze({ command_id, standing: 'COMMITTED', receipt, snapshot });
  }

  query({ snapshot_id, query_key, compute }) {
    const snapshot = this.store.getSnapshot(snapshot_id);
    if (!snapshot) throw new SystemModelError('SNAPSHOT_UNKNOWN', `Unknown snapshot: ${snapshot_id}`, { snapshot_id });
    this.verifySnapshotIntegrity(snapshot);
    return this.cache.getOrCompute({ snapshot_id, query_key, compute: () => compute(deepFreeze(cloneJson(snapshot.model))) });
  }

  recoverWorkspace(workspaceId) {
    const workspace = this.store.getWorkspace(workspaceId);
    if (!workspace) throw new SystemModelError('WORKSPACE_UNKNOWN', `Unknown workspace: ${workspaceId}`, { workspace_id: workspaceId });
    try {
      this.verifySnapshotIntegrity(workspace.active_snapshot_id);
      return { recovered: false, snapshot_id: workspace.active_snapshot_id, recovery_record: null };
    } catch (error) {
      if (!['SNAPSHOT_UNKNOWN', 'SNAPSHOT_INTEGRITY_FAILED', 'RELATIONSHIP_ENDPOINT_MISSING', 'RELATIONSHIP_CYCLE', 'UNKNOWN_ENTITY_TYPE', 'RESPONSIBILITY_UNKNOWN', 'OWNER_ENTITY_UNKNOWN', 'CANONICAL_OWNER_COLLISION', 'BOUNDARY_OWNER_MISMATCH', 'DELEGATE_ENTITY_UNKNOWN'].includes(error.code)) throw error;
    }
    const history = [...(this.store.commitHistory.get(workspaceId) || [])].reverse();
    for (const candidateId of history) {
      if (candidateId === workspace.active_snapshot_id) continue;
      try {
        this.verifySnapshotIntegrity(candidateId);
        const record = this.store.recoverActivePointer({
          workspace_id: workspaceId,
          snapshot_id: candidateId,
          prior_snapshot_id: workspace.active_snapshot_id,
          reason: 'ACTIVE_SNAPSHOT_INTEGRITY_FAILURE'
        });
        return { recovered: true, snapshot_id: candidateId, recovery_record: record };
      } catch (_) {
      }
    }
    throw new SystemModelError('NO_KNOWN_GOOD_SNAPSHOT', 'No valid historical snapshot is available for recovery', { workspace_id: workspaceId });
  }
}

module.exports = {
  InMemoryModelStore,
  ModelSnapshotService,
  SnapshotQueryCache,
  canonicalStringify,
  hydrateModel,
  hydrateRuntime,
  makeSnapshot
};
