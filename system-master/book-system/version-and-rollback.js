'use strict';

const core = require('./version-and-rollback-core.js');

const AUTHORITY_KINDS = new Set([
  'CANONICAL_STATE_MUTATION',
  'LIFECYCLE_TRANSITION',
  'INTEGRATION_RUNTIME',
  'AUTHOR_DECISION',
  'EXPORT_RELEASE',
]);

const APPEND_ONLY = {
  research_evidence_links: 'link_id',
  author_decisions: 'decision_id',
  integration_proposals: 'proposal_id',
  export_releases: 'release_id',
};

function fail(code, detail = '') { throw new core.VersionRollbackError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function makeId(prefix, seed, n = 24) { return `${prefix}-${core.digest(seed).slice(0, n).toUpperCase()}`; }
function req(v, fields, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const f of fields) if (!own(v, f)) fail('REQUIRED_FIELD_MISSING', `${label}.${f}`);
}

function familyKey(type, objectId) { return `${type}|${objectId}`; }
function objectKey(type, objectId, version) { return `${type}|${objectId}|${String(version)}`; }
function snapshotId(version, stateDigest) { return `STATE-V${version}-${stateDigest.slice(0, 20).toUpperCase()}`; }

function appendOnlyPreserved(pre, post) {
  for (const [collection, idField] of Object.entries(APPEND_ONLY)) {
    const before = new Map();
    for (const item of pre[collection]) {
      if (!obj(item) || !nonEmpty(String(item[idField] || ''))) fail('INVALID_APPEND_ONLY_ENTRY', collection);
      before.set(String(item[idField]), core.digest(item));
    }
    const after = new Map();
    for (const item of post[collection]) {
      if (!obj(item) || !nonEmpty(String(item[idField] || ''))) fail('INVALID_APPEND_ONLY_ENTRY', collection);
      const id = String(item[idField]);
      if (after.has(id)) fail('DUPLICATE_APPEND_ONLY_ID', `${collection}:${id}`);
      after.set(id, core.digest(item));
    }
    for (const [id, digestValue] of before) {
      if (!after.has(id)) fail('APPEND_ONLY_HISTORY_REMOVAL_FORBIDDEN', `${collection}:${id}`);
      if (after.get(id) !== digestValue) fail('APPEND_ONLY_HISTORY_MUTATION_FORBIDDEN', `${collection}:${id}`);
    }
  }
}

function pointerMatches(record, ref) {
  return ref === record.object_id || ref === `${record.object_id}:${record.object_version}`;
}

function resolveExactBindings(state, requested) {
  if (!obj(requested)) fail('ACTIVE_VERSION_BINDINGS_REQUIRED');
  const records = core.objectRecords(state);
  const bindings = {};
  for (const meta of Object.values(core.GOVERNED)) {
    const pointer = meta.pointer;
    if (!nonEmpty(requested[pointer])) fail('ACTIVE_BINDING_REQUIRED', pointer);
    if (!own(state.active, pointer)) fail('ACTIVE_POINTER_MISSING', pointer);
    const candidates = records.filter(r => r.meta.pointer === pointer && pointerMatches(r, state.active[pointer]));
    const chosen = candidates.find(r => r.node_id === requested[pointer]);
    if (!chosen) fail('ACTIVE_BINDING_TARGET_MISMATCH', pointer);
    if (chosen.type === 'MANUSCRIPT_MANIFEST' && chosen.payload.authority_state !== 'CANONICAL') fail('ACTIVE_MANUSCRIPT_NOT_CANONICAL');
    bindings[pointer] = chosen.node_id;
  }
  return bindings;
}

function currentActiveNodeForFamily(ledger, family) {
  const snapshot = ledger.state_snapshots[ledger.current_snapshot_id];
  if (!snapshot) fail('CURRENT_SNAPSHOT_NOT_FOUND');
  for (const nodeId of Object.values(snapshot.active_version_bindings)) {
    const node = ledger.object_version_nodes[nodeId];
    if (node && familyKey(node.object_type, node.object_id) === family) return node.node_id;
  }
  return null;
}

function indexNewObjectVersions(ledger, preState, postState, bindings) {
  const records = core.objectRecords(postState);
  const postKeys = new Set();
  const pending = new Map();
  for (const r of records) {
    if (postKeys.has(r.key)) fail('DUPLICATE_OBJECT_VERSION_IDENTITY', r.key);
    postKeys.add(r.key);
    if (ledger.object_version_nodes[r.node_id]) {
      const existing = ledger.object_version_nodes[r.node_id];
      if (existing.object_digest !== r.object_digest || core.digest(existing.payload) !== r.object_digest) fail('IMMUTABLE_OBJECT_VERSION_CONFLICT', r.key);
      continue;
    }
    const conflicting = Object.values(ledger.object_version_nodes).find(n => objectKey(n.object_type, n.object_id, n.object_version) === r.key);
    if (conflicting) fail('IMMUTABLE_OBJECT_VERSION_CONFLICT', r.key);
    const family = familyKey(r.type, r.object_id);
    if (!pending.has(family)) pending.set(family, []);
    pending.get(family).push(r);
  }
  for (const [family, list] of pending) if (list.length > 1) fail('MULTIPLE_NEW_VERSIONS_SAME_FAMILY_ONE_COMMIT', family);

  const added = [];
  for (const [family, list] of pending) {
    const r = list[0];
    let predecessor = ledger.object_family_heads[family] || null;
    if (bindings[r.meta.pointer] === r.node_id) {
      const active = currentActiveNodeForFamily(ledger, family);
      if (active) predecessor = active;
    }
    ledger.object_version_nodes[r.node_id] = {
      node_id: r.node_id,
      object_type: r.type,
      object_id: r.object_id,
      object_version: r.object_version,
      object_digest: r.object_digest,
      predecessor_node_id: predecessor,
      payload: clone(r.payload),
      first_seen_state_version: postState.state_version,
    };
    ledger.object_family_heads[family] = r.node_id;
    added.push(r.node_id);
  }
  return added.sort();
}

function authorityReceiptId(receipt) {
  for (const field of ['receipt_id', 'transition_receipt_id', 'mutation_receipt_id', 'decision_receipt_id', 'release_receipt_id']) {
    if (nonEmpty(receipt && receipt[field])) return receipt[field];
  }
  return null;
}

function validateAuthorityReceipt(preState, postState, kind, receipt) {
  if (!AUTHORITY_KINDS.has(kind)) fail('UNKNOWN_PARENT_AUTHORITY_KIND', String(kind));
  if (!obj(receipt)) fail('PARENT_AUTHORITY_RECEIPT_REQUIRED');
  const id = authorityReceiptId(receipt);
  if (!id) fail('PARENT_AUTHORITY_RECEIPT_ID_REQUIRED');
  req(receipt, ['pre_parent_state_version', 'pre_parent_state_digest', 'post_parent_state_version', 'post_parent_state_digest'], 'authority_receipt');
  if (receipt.pre_parent_state_version !== preState.state_version || receipt.pre_parent_state_digest !== preState.state_digest) fail('PARENT_AUTHORITY_RECEIPT_PRE_IDENTITY_MISMATCH');
  if (receipt.post_parent_state_version !== postState.state_version || receipt.post_parent_state_digest !== postState.state_digest) fail('PARENT_AUTHORITY_RECEIPT_POST_IDENTITY_MISMATCH');
  return id;
}

function checkReplay(ledger, request) {
  if (!nonEmpty(request.request_id) || !nonEmpty(request.idempotency_key)) fail('REQUEST_IDEMPOTENCY_REQUIRED');
  const fingerprint = core.digest(request);
  const old = ledger.processed_requests[request.idempotency_key];
  if (old) {
    if (old.request_fingerprint !== fingerprint) fail('IDEMPOTENCY_KEY_CONFLICT');
    if (old.request_id !== request.request_id) fail('IDEMPOTENCY_REQUEST_ID_CONFLICT');
    const receipt = ledger.version_receipts[old.receipt_id];
    if (!receipt) fail('PROCESSED_REQUEST_RECEIPT_MISSING');
    return { replay: true, fingerprint, receipt: clone(receipt) };
  }
  for (const item of Object.values(ledger.processed_requests)) if (item.request_id === request.request_id) fail('REQUEST_ID_CONFLICT');
  return { replay: false, fingerprint };
}

function validateExpected(preState, ledger, request) {
  if (request.actor_class !== 'PARENT_SYSTEM') fail('VERSION_AUTHORITY_DENIED', String(request.actor_class));
  if (request.expected_state_version !== preState.state_version || request.expected_state_digest !== preState.state_digest) fail('STALE_PARENT_WRITE');
  if (request.expected_ledger_version !== ledger.ledger_version || request.expected_ledger_digest !== core.digestLedger(ledger)) fail('STALE_LEDGER_WRITE');
}

function appendOutbox(ledger, receiptId, stateVersion, authorityKind) {
  const event = {
    event_id: makeId('VEVT', { receiptId, stateVersion, authorityKind, sequence: ledger.outbox_entries.length + 1 }, 24),
    event_type: 'BOOK_AUTHORIZED_PARENT_SUCCESSOR_RECORDED',
    aggregate_id: 'BOOK_SYSTEM_CANONICAL_STATE',
    payload_ref: receiptId,
    state_version: stateVersion,
    authority_kind: authorityKind,
    sequence: ledger.outbox_entries.length + 1,
    delivery_state: 'PENDING',
  };
  ledger.outbox_entries.push(event);
}

function recordAuthorizedParentSuccessor({ parentState, versionLedger, request }) {
  core.validateParentState(parentState);
  core.validateLedger(versionLedger, parentState);
  req(request, ['request_id', 'idempotency_key', 'actor_class', 'expected_state_version', 'expected_state_digest', 'expected_ledger_version', 'expected_ledger_digest', 'authority_kind', 'authority_receipt', 'committed_parent_state', 'active_version_bindings'], 'authorized_successor_request');
  const replay = checkReplay(versionLedger, request);
  if (replay.replay) return { parent_state: clone(parentState), version_ledger: clone(versionLedger), receipt: replay.receipt, disposition: 'REPLAY' };
  validateExpected(parentState, versionLedger, request);

  const postState = clone(request.committed_parent_state);
  core.validateParentState(postState);
  if (postState.state_version !== parentState.state_version + 1) fail('AUTHORIZED_SUCCESSOR_VERSION_NOT_NEXT');
  if (postState.book_project.book_project_id !== parentState.book_project.book_project_id || postState.book_project.book_id !== parentState.book_project.book_id) fail('BOOK_PROJECT_IDENTITY_IMMUTABLE');
  appendOnlyPreserved(parentState, postState);
  const authorityReceiptRef = validateAuthorityReceipt(parentState, postState, request.authority_kind, request.authority_receipt);
  const bindings = resolveExactBindings(postState, request.active_version_bindings);

  const nextLedger = clone(versionLedger);
  const newNodes = indexNewObjectVersions(nextLedger, parentState, postState, bindings);
  const preSnapshotId = versionLedger.current_snapshot_id;
  const postSnapshotId = snapshotId(postState.state_version, postState.state_digest);
  if (nextLedger.state_snapshots[postSnapshotId]) fail('STATE_SNAPSHOT_ID_CONFLICT', postSnapshotId);
  nextLedger.state_snapshots[postSnapshotId] = {
    snapshot_id: postSnapshotId,
    state_version: postState.state_version,
    state_digest: postState.state_digest,
    predecessor_snapshot_id: preSnapshotId,
    predecessor_state_version: parentState.state_version,
    predecessor_state_digest: parentState.state_digest,
    active_version_bindings: clone(bindings),
    canonical_state: clone(postState),
    created_by: 'BOOK_SYSTEM_PARENT_VERSION_ROLLBACK_AUTHORITY_INGEST',
    created_from_request_id: request.request_id,
  };
  nextLedger.current_snapshot_id = postSnapshotId;
  nextLedger.bound_parent_state_version = postState.state_version;
  nextLedger.bound_parent_state_digest = postState.state_digest;
  nextLedger.ledger_version += 1;

  const receiptId = makeId('VRCPT', { action: 'RECORD_AUTHORIZED_PARENT_SUCCESSOR', request_id: request.request_id, pre: parentState.state_digest, post: postState.state_digest, authorityReceiptRef }, 28);
  const receipt = {
    receipt_id: receiptId,
    request_id: request.request_id,
    action: 'RECORD_AUTHORIZED_PARENT_SUCCESSOR',
    authority_kind: request.authority_kind,
    authority_receipt_ref: authorityReceiptRef,
    authority_receipt_digest: core.digest(request.authority_receipt),
    pre_parent_state_version: parentState.state_version,
    pre_parent_state_digest: parentState.state_digest,
    pre_ledger_version: versionLedger.ledger_version,
    pre_ledger_digest: core.digestLedger(versionLedger),
    post_parent_state_version: postState.state_version,
    post_parent_state_digest: postState.state_digest,
    post_ledger_version: nextLedger.ledger_version,
    post_ledger_digest: '__PENDING__',
    pre_snapshot_id: preSnapshotId,
    post_snapshot_id: postSnapshotId,
    restored_from_snapshot_id: null,
    new_object_version_node_ids: clone(newNodes),
    active_version_bindings: clone(bindings),
    rollback_parent_state_version: parentState.state_version,
    rollback_parent_state_digest: parentState.state_digest,
    rollback_ledger_version: versionLedger.ledger_version,
    rollback_ledger_digest: core.digestLedger(versionLedger),
  };
  nextLedger.version_receipts[receiptId] = receipt;
  nextLedger.processed_requests[request.idempotency_key] = { request_id: request.request_id, request_fingerprint: replay.fingerprint, receipt_id: receiptId };
  appendOutbox(nextLedger, receiptId, postState.state_version, request.authority_kind);
  receipt.post_ledger_digest = core.digestLedger(nextLedger);
  nextLedger.version_receipts[receiptId] = receipt;
  core.validateLedger(nextLedger, postState);
  return { parent_state: postState, version_ledger: nextLedger, receipt: clone(receipt), disposition: 'COMMITTED' };
}

function commitSuccessor(args) {
  if (!args || !args.parentState || !args.request || !args.request.proposed_parent_state) fail('SUCCESSOR_REQUEST_REQUIRED');
  const currentStatus = args.parentState.book_project && args.parentState.book_project.status;
  const proposedStatus = args.request.proposed_parent_state.book_project && args.request.proposed_parent_state.book_project.status;
  if (currentStatus !== proposedStatus) fail('LIFECYCLE_STATUS_CHANGE_REQUIRES_QUALIFIED_ENGINE_FIRST', `${currentStatus}->${proposedStatus}`);
  return core.commitSuccessor(args);
}

function restoreAsNewSuccessor(args) {
  return core.restoreAsNewSuccessor(args);
}

module.exports = {
  ...core,
  AUTHORITY_KINDS,
  commitSuccessor,
  restoreAsNewSuccessor,
  recordAuthorizedParentSuccessor,
};
