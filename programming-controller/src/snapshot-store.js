'use strict';

const crypto = require('node:crypto');
const { SystemModelError } = require('./system-model');

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
  const result = {};
  for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key]);
  return result;
}

function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function digestJson(value) { return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex'); }
function requireString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new SystemModelError('INVALID_FIELD', `${field} must be a non-empty string`, { field });
  return value;
}
function snapshotIdFor(value) { return `snap:${digestJson(value)}`; }

function createSnapshot({ workspace_id, payload, parent_snapshot_id = null }) {
  requireString(workspace_id, 'workspace_id');
  const frozenPayload = cloneJson(payload);
  const payload_digest = digestJson(frozenPayload);
  const snapshot_id = snapshotIdFor({ workspace_id, parent_snapshot_id, payload_digest });
  return deepFreeze({ snapshot_id, workspace_id, parent_snapshot_id, payload_digest, payload: frozenPayload });
}

function verifySnapshotIntegrity(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw new SystemModelError('SNAPSHOT_INVALID', 'Snapshot must be an object');
  const expectedPayloadDigest = digestJson(snapshot.payload);
  if (snapshot.payload_digest !== expectedPayloadDigest) throw new SystemModelError('SNAPSHOT_CORRUPT', 'Snapshot payload digest mismatch', { snapshot_id: snapshot.snapshot_id, expected_payload_digest: expectedPayloadDigest, actual_payload_digest: snapshot.payload_digest });
  const expectedId = snapshotIdFor({ workspace_id: snapshot.workspace_id, parent_snapshot_id: snapshot.parent_snapshot_id || null, payload_digest: snapshot.payload_digest });
  if (snapshot.snapshot_id !== expectedId) throw new SystemModelError('SNAPSHOT_CORRUPT', 'Snapshot identity mismatch', { snapshot_id: snapshot.snapshot_id, expected_snapshot_id: expectedId });
  return true;
}

class InMemoryAtomicSnapshotStore {
  constructor() { this.workspaces = new Map(); }
  initialize({ workspace_id, snapshot }) {
    requireString(workspace_id, 'workspace_id'); verifySnapshotIntegrity(snapshot);
    if (this.workspaces.has(workspace_id)) throw new SystemModelError('WORKSPACE_ALREADY_INITIALIZED', `Workspace already initialized: ${workspace_id}`, { workspace_id });
    this.workspaces.set(workspace_id, { active_snapshot_id: snapshot.snapshot_id, snapshots: new Map([[snapshot.snapshot_id, cloneJson(snapshot)]]), receipts: new Map(), outbox: new Map() });
    return this.readWorkspace(workspace_id);
  }
  readWorkspace(workspace_id) {
    const state = this.workspaces.get(workspace_id);
    return state ? Object.freeze({ workspace_id, active_snapshot_id: state.active_snapshot_id }) : null;
  }
  getSnapshot(workspace_id, snapshot_id) {
    const snapshot = this.workspaces.get(workspace_id)?.snapshots.get(snapshot_id);
    return snapshot ? deepFreeze(cloneJson(snapshot)) : null;
  }
  getReceipt(workspace_id, command_id) {
    const receipt = this.workspaces.get(workspace_id)?.receipts.get(command_id);
    return receipt ? deepFreeze(cloneJson(receipt)) : null;
  }
  getOutboxEvent(workspace_id, event_id) {
    const event = this.workspaces.get(workspace_id)?.outbox.get(event_id);
    return event ? deepFreeze(cloneJson(event)) : null;
  }
  commitAtomic({ workspace_id, expected_active_snapshot_id, snapshot, receipt, outbox_event }) {
    const state = this.workspaces.get(workspace_id);
    if (!state) throw new SystemModelError('WORKSPACE_NOT_INITIALIZED', `Workspace not initialized: ${workspace_id}`, { workspace_id });
    verifySnapshotIntegrity(snapshot);
    const existing = state.receipts.get(receipt.command_id);
    if (existing) {
      if (existing.command_payload_digest !== receipt.command_payload_digest) throw new SystemModelError('IDEMPOTENCY_CONFLICT', 'command_id already used with a different payload', { command_id: receipt.command_id });
      return deepFreeze(cloneJson(existing));
    }
    if (state.active_snapshot_id !== expected_active_snapshot_id) throw new SystemModelError('STALE_BASE', 'Active snapshot changed before commit', { expected_active_snapshot_id, actual_active_snapshot_id: state.active_snapshot_id });
    const snapshots = new Map(state.snapshots); const receipts = new Map(state.receipts); const outbox = new Map(state.outbox);
    snapshots.set(snapshot.snapshot_id, cloneJson(snapshot)); receipts.set(receipt.command_id, cloneJson(receipt)); outbox.set(outbox_event.event_id, cloneJson(outbox_event));
    state.snapshots = snapshots; state.receipts = receipts; state.outbox = outbox; state.active_snapshot_id = snapshot.snapshot_id;
    return deepFreeze(cloneJson(receipt));
  }
}

class SnapshotQueryCache {
  constructor() { this.entries = new Map(); }
  key(snapshot_id, query_name, params) { return digestJson({ snapshot_id, query_name, params: params || {} }); }
  get(snapshot_id, query_name, params) {
    const value = this.entries.get(this.key(snapshot_id, query_name, params));
    return value === undefined ? null : cloneJson(value);
  }
  set(snapshot_id, query_name, params, value) {
    this.entries.set(this.key(snapshot_id, query_name, params), cloneJson(value));
    return cloneJson(value);
  }
}

module.exports = { InMemoryAtomicSnapshotStore, SnapshotQueryCache, canonicalJson, cloneJson, createSnapshot, deepFreeze, digestJson, requireString, verifySnapshotIntegrity };
