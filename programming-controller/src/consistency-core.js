'use strict';

const { SystemModelError, SystemModelService } = require('./system-model');
const { AuthorityBoundaryService } = require('./authority-model');
const { SnapshotQueryCache, cloneJson, createSnapshot, deepFreeze, digestJson, requireString, verifySnapshotIntegrity } = require('./snapshot-store');

function captureRuntimePayload(runtimeOrModel) {
  const runtime = runtimeOrModel instanceof SystemModelService ? { model: runtimeOrModel, authority: null } : runtimeOrModel;
  if (!runtime || !(runtime.model instanceof SystemModelService)) throw new SystemModelError('MODEL_REQUIRED', 'Runtime requires SystemModelService');
  const payload = runtime.model.exportDraft();
  if (runtime.authority) payload.authority_state = runtime.authority.exportDraft();
  return payload;
}

function hydrateRuntime(snapshot, { identityValidator = null } = {}) {
  verifySnapshotIntegrity(snapshot);
  const draft = snapshot.payload;
  const model = new SystemModelService({ workspace_id: draft.workspace_id, identityValidator });
  for (const value of draft.entity_types || []) model.registerEntityType(value);
  for (const value of draft.relationship_types || []) model.registerRelationshipType(value);
  for (const value of draft.entities || []) model.upsertEntity(value);
  for (const value of draft.relationships || []) model.declareRelationship(value);
  model.validate();
  let authority = null;
  if (draft.authority_state) {
    authority = new AuthorityBoundaryService({ model });
    for (const value of draft.authority_state.responsibilities || []) authority.registerResponsibility(value);
    for (const value of draft.authority_state.assignments || []) authority.assignAuthority(value);
    for (const value of draft.authority_state.boundaries || []) authority.defineBoundary(value);
  }
  return { model, authority };
}

function applyOperation(runtime, operation) {
  const kind = requireString(operation?.kind, 'operation.kind');
  const value = cloneJson(operation.value);
  if (kind === 'REGISTER_ENTITY_TYPE') return runtime.model.registerEntityType(value);
  if (kind === 'REGISTER_RELATIONSHIP_TYPE') return runtime.model.registerRelationshipType(value);
  if (kind === 'UPSERT_ENTITY') return runtime.model.upsertEntity(value);
  if (kind === 'DECLARE_RELATIONSHIP') return runtime.model.declareRelationship(value);
  if (['REGISTER_RESPONSIBILITY', 'ASSIGN_AUTHORITY', 'DEFINE_BOUNDARY'].includes(kind) && !runtime.authority) runtime.authority = new AuthorityBoundaryService({ model: runtime.model });
  if (kind === 'REGISTER_RESPONSIBILITY') return runtime.authority.registerResponsibility(value);
  if (kind === 'ASSIGN_AUTHORITY') return runtime.authority.assignAuthority(value);
  if (kind === 'DEFINE_BOUNDARY') return runtime.authority.defineBoundary(value);
  throw new SystemModelError('UNSUPPORTED_CHANGE_OPERATION', `Unsupported change operation: ${kind}`, { kind });
}

class SnapshotConsistencyService {
  constructor({ workspace_id, store, identityValidator = null, queryCache = null } = {}) {
    this.workspaceId = requireString(workspace_id, 'workspace_id');
    if (!store || typeof store.commitAtomic !== 'function') throw new SystemModelError('ATOMIC_STORE_REQUIRED', 'An atomic 001P persistence port is required');
    this.store = store; this.identityValidator = identityValidator; this.queryCache = queryCache || new SnapshotQueryCache(); this.changeSets = new Map();
  }
  bootstrap(runtimeOrModel) {
    const runtime = runtimeOrModel instanceof SystemModelService ? { model: runtimeOrModel, authority: null } : runtimeOrModel;
    if (!runtime || !(runtime.model instanceof SystemModelService)) throw new SystemModelError('MODEL_REQUIRED', 'bootstrap requires SystemModelService runtime');
    if (runtime.model.workspaceId !== this.workspaceId) throw new SystemModelError('WORKSPACE_MISMATCH', 'Model workspace does not match consistency service', { expected: this.workspaceId, actual: runtime.model.workspaceId });
    runtime.model.validate();
    const snapshot = createSnapshot({ workspace_id: this.workspaceId, payload: captureRuntimePayload(runtime) });
    this.store.initialize({ workspace_id: this.workspaceId, snapshot }); return snapshot;
  }
  getActiveSnapshot() {
    const state = this.store.readWorkspace(this.workspaceId);
    if (!state) throw new SystemModelError('WORKSPACE_NOT_INITIALIZED', `Workspace not initialized: ${this.workspaceId}`);
    const snapshot = this.store.getSnapshot(this.workspaceId, state.active_snapshot_id); verifySnapshotIntegrity(snapshot); return snapshot;
  }
  getSnapshot(snapshot_id) {
    const snapshot = this.store.getSnapshot(this.workspaceId, snapshot_id);
    if (!snapshot) return null; verifySnapshotIntegrity(snapshot); return snapshot;
  }
  openChangeSet({ change_set_id, actor = null, command_context = null } = {}) {
    requireString(change_set_id, 'change_set_id');
    if (this.changeSets.has(change_set_id)) throw new SystemModelError('CHANGE_SET_EXISTS', `Change set already exists: ${change_set_id}`, { change_set_id });
    const base = this.getActiveSnapshot();
    const record = { change_set_id, base_snapshot_id: base.snapshot_id, change_set_revision: 0, actor: cloneJson(actor), command_context: cloneJson(command_context), operations: [], status: 'OPEN', committed_command_id: null, committed_receipt: null };
    this.changeSets.set(change_set_id, record); return deepFreeze(cloneJson(record));
  }
  getChangeSet(change_set_id) { const record = this.changeSets.get(change_set_id); return record ? deepFreeze(cloneJson(record)) : null; }
  applyChange(change_set_id, operation) {
    const record = this.changeSets.get(change_set_id);
    if (!record) throw new SystemModelError('CHANGE_SET_UNKNOWN', `Unknown change set: ${change_set_id}`, { change_set_id });
    if (record.status !== 'OPEN') throw new SystemModelError('CHANGE_SET_NOT_OPEN', `Change set is not open: ${change_set_id}`, { status: record.status });
    requireString(operation?.kind, 'operation.kind'); record.operations.push(cloneJson(operation)); record.change_set_revision += 1; return deepFreeze(cloneJson(record));
  }
  commandPayloadDigest(record, command_id) {
    return digestJson({ command_id, workspace_id: this.workspaceId, change_set_id: record.change_set_id, base_snapshot_id: record.base_snapshot_id, change_set_revision: record.change_set_revision, operations: record.operations, actor: record.actor, command_context: record.command_context });
  }
  commitChangeSet({ change_set_id, command_id } = {}) {
    requireString(command_id, 'command_id');
    const record = this.changeSets.get(change_set_id);
    if (!record) throw new SystemModelError('CHANGE_SET_UNKNOWN', `Unknown change set: ${change_set_id}`, { change_set_id });
    const payloadDigest = this.commandPayloadDigest(record, command_id);
    const prior = this.store.getReceipt(this.workspaceId, command_id);
    if (prior) {
      if (prior.command_payload_digest !== payloadDigest) throw new SystemModelError('IDEMPOTENCY_CONFLICT', 'command_id already completed with a different payload', { command_id });
      record.status = 'COMMITTED'; record.committed_command_id = command_id; record.committed_receipt = cloneJson(prior); return prior;
    }
    if (record.status !== 'OPEN') throw new SystemModelError('CHANGE_SET_NOT_OPEN', `Change set is not open: ${change_set_id}`, { status: record.status });
    const active = this.getActiveSnapshot();
    if (active.snapshot_id !== record.base_snapshot_id) throw new SystemModelError('STALE_BASE', 'Change set base is no longer active; silent rebase is prohibited', { change_set_id, base_snapshot_id: record.base_snapshot_id, active_snapshot_id: active.snapshot_id });
    const runtime = hydrateRuntime(this.getSnapshot(record.base_snapshot_id), { identityValidator: this.identityValidator });
    for (const operation of record.operations) applyOperation(runtime, operation);
    runtime.model.validate();
    const snapshot = createSnapshot({ workspace_id: this.workspaceId, parent_snapshot_id: record.base_snapshot_id, payload: captureRuntimePayload(runtime) });
    const receipt = deepFreeze({ receipt_id: `receipt:${digestJson({ command_id, snapshot_id: snapshot.snapshot_id, payloadDigest })}`, command_id, command_payload_digest: payloadDigest, workspace_id: this.workspaceId, change_set_id, change_set_revision: record.change_set_revision, base_snapshot_id: record.base_snapshot_id, snapshot_id: snapshot.snapshot_id, standing: 'COMMITTED' });
    const outbox_event = deepFreeze({ event_id: `event:${digestJson({ command_id, snapshot_id: snapshot.snapshot_id })}`, event_type: 'MODEL_SNAPSHOT_COMMITTED', workspace_id: this.workspaceId, snapshot_id: snapshot.snapshot_id, receipt_id: receipt.receipt_id, delivery_standing: 'PENDING_001S' });
    const committed = this.store.commitAtomic({ workspace_id: this.workspaceId, expected_active_snapshot_id: record.base_snapshot_id, snapshot, receipt, outbox_event });
    record.status = 'COMMITTED'; record.committed_command_id = command_id; record.committed_receipt = cloneJson(committed); return committed;
  }
  recoverCommand({ command_id, expected_command_payload_digest = null } = {}) {
    requireString(command_id, 'command_id');
    const receipt = this.store.getReceipt(this.workspaceId, command_id);
    if (!receipt) return Object.freeze({ command_id, standing: 'NOT_FOUND' });
    if (expected_command_payload_digest && receipt.command_payload_digest !== expected_command_payload_digest) return Object.freeze({ command_id, standing: 'CONFLICT', expected_command_payload_digest, actual_command_payload_digest: receipt.command_payload_digest });
    return Object.freeze({ command_id, standing: 'COMMITTED', receipt, snapshot: this.getSnapshot(receipt.snapshot_id) });
  }
  querySnapshot({ snapshot_id, query_name, params = {}, execute }) {
    requireString(snapshot_id, 'snapshot_id'); requireString(query_name, 'query_name');
    if (typeof execute !== 'function') throw new SystemModelError('QUERY_EXECUTOR_REQUIRED', 'querySnapshot requires execute function');
    const snapshot = this.getSnapshot(snapshot_id);
    if (!snapshot) throw new SystemModelError('SNAPSHOT_UNKNOWN', `Unknown snapshot: ${snapshot_id}`, { snapshot_id });
    const cached = this.queryCache.get(snapshot_id, query_name, params);
    if (cached !== null) return Object.freeze({ snapshot_id, query_name, cache_hit: true, value: deepFreeze(cached) });
    const value = cloneJson(execute(hydrateRuntime(snapshot, { identityValidator: this.identityValidator }), cloneJson(params)));
    this.queryCache.set(snapshot_id, query_name, params, value);
    return Object.freeze({ snapshot_id, query_name, cache_hit: false, value: deepFreeze(value) });
  }
}

module.exports = { SnapshotConsistencyService, applyOperation, captureRuntimePayload, hydrateRuntime };
