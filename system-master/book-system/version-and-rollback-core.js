'use strict';

const crypto = require('crypto');

class VersionRollbackError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'VersionRollbackError';
    this.code = code;
    this.detail = detail;
  }
}

const GOVERNED = {
  GOVERNING_BRIEF: { collection: 'governing_briefs', id: 'brief_id', version: 'version', pointer: 'governing_brief_ref' },
  CANON_MANIFEST: { collection: 'canon_manifests', id: 'canon_manifest_id', version: 'version', pointer: 'canon_manifest_ref' },
  STORY_BIBLE: { collection: 'story_bibles', id: 'story_bible_id', version: 'version', pointer: 'story_bible_ref' },
  BOOK_PLAN: { collection: 'book_plans', id: 'plan_id', version: 'version', pointer: 'book_plan_ref' },
  MANUSCRIPT_MANIFEST: { collection: 'manuscripts', id: 'manuscript_id', version: 'version_id', pointer: 'canonical_manuscript_ref' },
};

const APPEND_ONLY = {
  research_evidence_links: 'link_id',
  author_decisions: 'decision_id',
  integration_proposals: 'proposal_id',
  export_releases: 'release_id',
};

const FROZEN_STATUSES = new Set(['EXPORT_FROZEN', 'PUBLISHED_OR_DELIVERED', 'ARCHIVED']);
const AFFIRMATIVE = new Set(['APPROVE', 'APPROVED', 'ACCEPT', 'ACCEPTED', 'PROMOTE', 'PROMOTED', 'YES', true]);

function fail(code, detail = '') { throw new VersionRollbackError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function isSha(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }
function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (obj(v)) {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = normalize(v[k]);
    return out;
  }
  return v;
}
function stable(v) { return JSON.stringify(normalize(v)); }
function sha(v) { return crypto.createHash('sha256').update(v).digest('hex'); }
function digest(v) { return sha(Buffer.from(stable(v), 'utf8')); }
function makeId(prefix, seed, n = 24) { return `${prefix}-${digest(seed).slice(0, n).toUpperCase()}`; }
function req(v, fields, label) {
  if (!obj(v)) fail('OBJECT_REQUIRED', label);
  for (const f of fields) if (!own(v, f)) fail('REQUIRED_FIELD_MISSING', `${label}.${f}`);
}

function computeStateDigest(state) {
  const copy = clone(state);
  delete copy.state_digest;
  return digest(copy);
}
function sealState(state) {
  const copy = clone(state);
  copy.state_digest = computeStateDigest(copy);
  return copy;
}
function validateParentState(state) {
  req(state, ['schema_version', 'state_version', 'book_project', 'governing_briefs', 'canon_manifests', 'story_bibles', 'book_plans', 'manuscripts', 'research_evidence_links', 'author_decisions', 'integration_proposals', 'export_releases', 'active'], 'parent_state');
  if (!Number.isInteger(state.state_version) || state.state_version < 1) fail('INVALID_PARENT_STATE_VERSION');
  if (!isSha(state.state_digest)) fail('INVALID_PARENT_STATE_DIGEST');
  if (computeStateDigest(state) !== state.state_digest) fail('PARENT_STATE_DIGEST_MISMATCH');
  if (!obj(state.book_project) || !nonEmpty(state.book_project.book_project_id) || !nonEmpty(state.book_project.book_id)) fail('INVALID_BOOK_PROJECT_IDENTITY');
  for (const name of ['governing_briefs', 'canon_manifests', 'story_bibles', 'book_plans', 'manuscripts', 'research_evidence_links', 'author_decisions', 'integration_proposals', 'export_releases']) {
    if (!Array.isArray(state[name])) fail('PARENT_COLLECTION_ARRAY_REQUIRED', name);
  }
  if (!obj(state.active)) fail('ACTIVE_POINTERS_REQUIRED');
  return true;
}

function ledgerDigestProjection(ledger) {
  const copy = clone(ledger);
  if (obj(copy.version_receipts)) {
    for (const receipt of Object.values(copy.version_receipts)) {
      if (!obj(receipt)) continue;
      receipt.post_ledger_digest = '__SELF_EXCLUDED__';
      receipt.rollback_ledger_digest = '__SELF_EXCLUDED__';
    }
  }
  return copy;
}
function digestLedger(ledger) { return digest(ledgerDigestProjection(ledger)); }

function nodeKey(type, objectId, version) { return `${type}|${objectId}|${String(version)}`; }
function familyKey(type, objectId) { return `${type}|${objectId}`; }
function nodeId(type, objectId, version, objectDigest) {
  return makeId('OBJV', { type, objectId, version: String(version), objectDigest }, 28);
}
function snapshotId(version, stateDigest) { return `STATE-V${version}-${stateDigest.slice(0, 20).toUpperCase()}`; }

function objectRecords(state) {
  const out = [];
  for (const [type, meta] of Object.entries(GOVERNED)) {
    for (const payload of state[meta.collection]) {
      req(payload, [meta.id, meta.version], `${meta.collection}.item`);
      const objectId = String(payload[meta.id]);
      const version = String(payload[meta.version]);
      if (!nonEmpty(objectId) || !nonEmpty(version)) fail('INVALID_OBJECT_VERSION_IDENTITY', `${type}:${objectId}:${version}`);
      if (type === 'MANUSCRIPT_MANIFEST') {
        if (!isSha(payload.artifact_digest)) fail('INVALID_MANUSCRIPT_ARTIFACT_DIGEST', `${objectId}:${version}`);
        if (!['CANONICAL', 'HISTORICAL', 'CANDIDATE', 'REJECTED', 'DEFERRED'].includes(payload.authority_state)) fail('INVALID_MANUSCRIPT_AUTHORITY_STATE', `${objectId}:${version}`);
      }
      const objectDigest = digest(payload);
      out.push({ type, meta, payload: clone(payload), object_id: objectId, object_version: version, object_digest: objectDigest, key: nodeKey(type, objectId, version), family: familyKey(type, objectId), node_id: nodeId(type, objectId, version, objectDigest) });
    }
  }
  return out;
}

function pointerRefMatches(record, ref) {
  if (!nonEmpty(ref)) return false;
  return ref === record.object_id || ref === `${record.object_id}:${record.object_version}`;
}
function candidateNodesForPointer(state, records, pointer) {
  const ref = state.active[pointer];
  return records.filter(r => r.meta.pointer === pointer && pointerRefMatches(r, ref));
}
function validateBookProjectPointerMirror(state) {
  if (state.book_project.governing_brief_ref !== state.active.governing_brief_ref) fail('BOOK_PROJECT_ACTIVE_POINTER_MISMATCH', 'governing_brief_ref');
  if (state.book_project.canonical_manifest_ref !== state.active.canon_manifest_ref) fail('BOOK_PROJECT_ACTIVE_POINTER_MISMATCH', 'canon_manifest_ref');
}
function resolveBindings(state, records, requested = {}) {
  validateBookProjectPointerMirror(state);
  const bindings = {};
  for (const meta of Object.values(GOVERNED)) {
    const pointer = meta.pointer;
    if (!own(state.active, pointer)) fail('ACTIVE_POINTER_MISSING', pointer);
    const candidates = candidateNodesForPointer(state, records, pointer);
    if (candidates.length === 0) fail('ACTIVE_POINTER_TARGET_NOT_FOUND', pointer);
    let chosen = null;
    if (requested && nonEmpty(requested[pointer])) {
      chosen = candidates.find(c => c.node_id === requested[pointer]) || null;
      if (!chosen) fail('ACTIVE_BINDING_TARGET_MISMATCH', pointer);
    } else if (candidates.length === 1) {
      chosen = candidates[0];
    } else {
      fail('ACTIVE_POINTER_VERSION_AMBIGUOUS', pointer);
    }
    if (chosen.type === 'MANUSCRIPT_MANIFEST' && chosen.payload.authority_state !== 'CANONICAL') fail('ACTIVE_MANUSCRIPT_NOT_CANONICAL');
    bindings[pointer] = chosen.node_id;
  }
  return bindings;
}

function validateAppendOnlyPreservation(currentState, proposedState) {
  for (const [collection, idField] of Object.entries(APPEND_ONLY)) {
    const oldMap = new Map();
    for (const item of currentState[collection]) {
      if (!obj(item) || !nonEmpty(String(item[idField] || ''))) fail('INVALID_APPEND_ONLY_ENTRY', collection);
      oldMap.set(String(item[idField]), digest(item));
    }
    const nextMap = new Map();
    for (const item of proposedState[collection]) {
      if (!obj(item) || !nonEmpty(String(item[idField] || ''))) fail('INVALID_APPEND_ONLY_ENTRY', collection);
      const id = String(item[idField]);
      if (nextMap.has(id)) fail('DUPLICATE_APPEND_ONLY_ID', `${collection}:${id}`);
      nextMap.set(id, digest(item));
    }
    for (const [id, d] of oldMap) {
      if (!nextMap.has(id)) fail('APPEND_ONLY_HISTORY_REMOVAL_FORBIDDEN', `${collection}:${id}`);
      if (nextMap.get(id) !== d) fail('APPEND_ONLY_HISTORY_MUTATION_FORBIDDEN', `${collection}:${id}`);
    }
  }
}

function affirmativeAuthorDecision(state, ref) {
  const d = state.author_decisions.find(x => x && x.decision_id === ref);
  return !!(d && d.status === 'APPROVED' && AFFIRMATIVE.has(d.author_choice));
}
function validateLifecycleStatusChange(currentState, proposedState, receipt) {
  const fromStatus = currentState.book_project.status;
  const toStatus = proposedState.book_project.status;
  if (fromStatus === toStatus) return;
  if (!obj(receipt)) fail('LIFECYCLE_TRANSITION_RECEIPT_REQUIRED');
  if (receipt.from_status !== fromStatus || receipt.to_status !== toStatus) fail('LIFECYCLE_TRANSITION_RECEIPT_STATUS_MISMATCH');
  if (receipt.pre_parent_state_version !== currentState.state_version || receipt.pre_parent_state_digest !== currentState.state_digest) fail('LIFECYCLE_TRANSITION_RECEIPT_PARENT_MISMATCH');
  if (!nonEmpty(receipt.transition_receipt_id)) fail('LIFECYCLE_TRANSITION_RECEIPT_ID_REQUIRED');
}

function validateLedger(ledger, parentState = null) {
  req(ledger, ['ledger_schema_version', 'ledger_version', 'bound_parent_state_version', 'bound_parent_state_digest', 'current_snapshot_id', 'state_snapshots', 'object_version_nodes', 'object_family_heads', 'processed_requests', 'version_receipts', 'outbox_entries'], 'version_ledger');
  if (ledger.ledger_schema_version !== 1 || !Number.isInteger(ledger.ledger_version) || ledger.ledger_version < 1) fail('INVALID_VERSION_LEDGER');
  for (const f of ['state_snapshots', 'object_version_nodes', 'object_family_heads', 'processed_requests', 'version_receipts']) if (!obj(ledger[f])) fail('LEDGER_OBJECT_REQUIRED', f);
  if (!Array.isArray(ledger.outbox_entries)) fail('LEDGER_OUTBOX_ARRAY_REQUIRED');
  const snap = ledger.state_snapshots[ledger.current_snapshot_id];
  if (!snap) fail('CURRENT_SNAPSHOT_NOT_FOUND');
  if (snap.state_version !== ledger.bound_parent_state_version || snap.state_digest !== ledger.bound_parent_state_digest) fail('CURRENT_SNAPSHOT_LEDGER_BINDING_MISMATCH');
  if (parentState) {
    validateParentState(parentState);
    if (ledger.bound_parent_state_version !== parentState.state_version || ledger.bound_parent_state_digest !== parentState.state_digest) fail('LEDGER_PARENT_BINDING_MISMATCH');
  }
  return true;
}

function sortVersionTokens(records) {
  return [...records].sort((a, b) => {
    const an = Number(String(a.object_version).replace(/^V/i, ''));
    const bn = Number(String(b.object_version).replace(/^V/i, ''));
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    return String(a.object_version).localeCompare(String(b.object_version));
  });
}

function createVersionLedger(initialStateInput, options = {}) {
  let state = clone(initialStateInput);
  if (!own(state, 'state_digest') || !isSha(state.state_digest)) state = sealState(state);
  validateParentState(state);
  const records = objectRecords(state);
  const requestedBindings = options.active_version_bindings || {};
  const bindings = resolveBindings(state, records, requestedBindings);
  const ledger = {
    ledger_schema_version: 1,
    ledger_version: 1,
    bound_parent_state_version: state.state_version,
    bound_parent_state_digest: state.state_digest,
    current_snapshot_id: null,
    state_snapshots: {},
    object_version_nodes: {},
    object_family_heads: {},
    processed_requests: {},
    version_receipts: {},
    outbox_entries: [],
  };
  const grouped = new Map();
  for (const r of records) {
    if (!grouped.has(r.family)) grouped.set(r.family, []);
    grouped.get(r.family).push(r);
  }
  for (const [family, familyRecords] of grouped) {
    const sorted = sortVersionTokens(familyRecords);
    if (sorted.length > 1 && !obj(options.initial_lineage)) fail('INITIAL_LINEAGE_REQUIRED', family);
    let predecessor = null;
    for (const r of sorted) {
      if (ledger.object_version_nodes[r.node_id]) fail('DUPLICATE_OBJECT_VERSION_NODE', r.node_id);
      if (sorted.length > 1) {
        const explicit = options.initial_lineage[r.node_id];
        if (explicit === undefined) fail('INITIAL_LINEAGE_NODE_REQUIRED', r.node_id);
        predecessor = explicit;
        if (predecessor !== null && !ledger.object_version_nodes[predecessor]) fail('INITIAL_LINEAGE_PREDECESSOR_NOT_FOUND', r.node_id);
      }
      ledger.object_version_nodes[r.node_id] = {
        node_id: r.node_id,
        object_type: r.type,
        object_id: r.object_id,
        object_version: r.object_version,
        object_digest: r.object_digest,
        predecessor_node_id: predecessor,
        payload: clone(r.payload),
        first_seen_state_version: state.state_version,
      };
      ledger.object_family_heads[family] = r.node_id;
      predecessor = r.node_id;
    }
  }
  const sid = snapshotId(state.state_version, state.state_digest);
  ledger.current_snapshot_id = sid;
  ledger.state_snapshots[sid] = {
    snapshot_id: sid,
    state_version: state.state_version,
    state_digest: state.state_digest,
    predecessor_snapshot_id: null,
    predecessor_state_version: null,
    predecessor_state_digest: null,
    active_version_bindings: clone(bindings),
    canonical_state: clone(state),
    created_by: 'BOOK_SYSTEM_PARENT_VERSION_ROLLBACK',
    created_from_request_id: options.initial_request_id || 'INITIAL_IMPORT',
  };
  validateLedger(ledger, state);
  return { parent_state: state, version_ledger: ledger };
}

function requestFingerprint(request) { return digest(request); }
function checkReplay(ledger, request) {
  if (!nonEmpty(request.request_id) || !nonEmpty(request.idempotency_key)) fail('REQUEST_IDEMPOTENCY_REQUIRED');
  const fp = requestFingerprint(request);
  const prior = ledger.processed_requests[request.idempotency_key];
  if (prior) {
    if (prior.request_fingerprint !== fp) fail('IDEMPOTENCY_KEY_CONFLICT');
    if (prior.request_id !== request.request_id) fail('IDEMPOTENCY_REQUEST_ID_CONFLICT');
    const receipt = ledger.version_receipts[prior.receipt_id];
    if (!receipt) fail('PROCESSED_REQUEST_RECEIPT_MISSING');
    return { replay: true, fingerprint: fp, receipt: clone(receipt) };
  }
  for (const p of Object.values(ledger.processed_requests)) if (p.request_id === request.request_id) fail('REQUEST_ID_CONFLICT');
  return { replay: false, fingerprint: fp };
}
function validateExpected(request, parentState, ledger) {
  if (request.actor_class !== 'PARENT_SYSTEM') fail('VERSION_AUTHORITY_DENIED', String(request.actor_class));
  if (request.expected_state_version !== parentState.state_version || request.expected_state_digest !== parentState.state_digest) fail('STALE_PARENT_WRITE');
  if (request.expected_ledger_version !== ledger.ledger_version || request.expected_ledger_digest !== digestLedger(ledger)) fail('STALE_LEDGER_WRITE');
}
function recordMap(records) {
  const map = new Map();
  for (const r of records) {
    if (map.has(r.key)) fail('DUPLICATE_OBJECT_VERSION_IDENTITY', r.key);
    map.set(r.key, r);
  }
  return map;
}
function currentActiveNodeForFamily(ledger, family) {
  const snap = ledger.state_snapshots[ledger.current_snapshot_id];
  for (const nodeIdValue of Object.values(snap.active_version_bindings)) {
    const node = ledger.object_version_nodes[nodeIdValue];
    if (node && familyKey(node.object_type, node.object_id) === family) return node.node_id;
  }
  return null;
}

function addNewObjectNodes(ledger, currentState, nextState, nextBindings) {
  const nextRecords = objectRecords(nextState);
  const nextMap = recordMap(nextRecords);
  const newByFamily = new Map();
  for (const r of nextRecords) {
    const existingById = ledger.object_version_nodes[r.node_id];
    if (existingById) {
      if (existingById.object_digest !== r.object_digest || digest(existingById.payload) !== r.object_digest) fail('IMMUTABLE_OBJECT_VERSION_CONFLICT', r.key);
      continue;
    }
    const conflicting = Object.values(ledger.object_version_nodes).find(n => nodeKey(n.object_type, n.object_id, n.object_version) === r.key);
    if (conflicting) fail('IMMUTABLE_OBJECT_VERSION_CONFLICT', r.key);
    if (!newByFamily.has(r.family)) newByFamily.set(r.family, []);
    newByFamily.get(r.family).push(r);
  }
  for (const [family, rs] of newByFamily) if (rs.length > 1) fail('MULTIPLE_NEW_VERSIONS_SAME_FAMILY_ONE_COMMIT', family);
  const added = [];
  for (const [family, rs] of newByFamily) {
    const r = rs[0];
    let predecessor = ledger.object_family_heads[family] || null;
    const pointer = r.meta.pointer;
    if (nextBindings[pointer] === r.node_id) {
      const activePredecessor = currentActiveNodeForFamily(ledger, family);
      if (activePredecessor) predecessor = activePredecessor;
    }
    ledger.object_version_nodes[r.node_id] = {
      node_id: r.node_id,
      object_type: r.type,
      object_id: r.object_id,
      object_version: r.object_version,
      object_digest: r.object_digest,
      predecessor_node_id: predecessor,
      payload: clone(r.payload),
      first_seen_state_version: nextState.state_version,
    };
    ledger.object_family_heads[family] = r.node_id;
    added.push(r.node_id);
  }
  for (const [pointer, nodeIdValue] of Object.entries(nextBindings)) {
    const node = ledger.object_version_nodes[nodeIdValue];
    if (!node) fail('ACTIVE_BINDING_NODE_NOT_FOUND', pointer);
    const key = nodeKey(node.object_type, node.object_id, node.object_version);
    if (!nextMap.has(key)) fail('ACTIVE_BINDING_NOT_PRESENT_IN_AGGREGATE', pointer);
  }
  return added.sort();
}

function appendOutbox(ledger, type, ref, stateVersion) {
  const event = {
    event_id: makeId('VEVT', { type, ref, stateVersion, sequence: ledger.outbox_entries.length + 1 }, 24),
    event_type: type,
    aggregate_id: 'BOOK_SYSTEM_CANONICAL_STATE',
    payload_ref: ref,
    state_version: stateVersion,
    sequence: ledger.outbox_entries.length + 1,
    delivery_state: 'PENDING',
  };
  ledger.outbox_entries.push(event);
  return event;
}
function makeReceipt(action, request, preState, postState, preLedger, postLedger, preSnapshotId, postSnapshotId, restoredFrom, newNodes, bindings) {
  return {
    receipt_id: makeId('VRCPT', { action, request_id: request.request_id, pre: preState.state_digest, post: postState.state_digest }, 28),
    request_id: request.request_id,
    action,
    pre_parent_state_version: preState.state_version,
    pre_parent_state_digest: preState.state_digest,
    pre_ledger_version: preLedger.ledger_version,
    pre_ledger_digest: digestLedger(preLedger),
    post_parent_state_version: postState.state_version,
    post_parent_state_digest: postState.state_digest,
    post_ledger_version: postLedger.ledger_version,
    post_ledger_digest: '__PENDING__',
    pre_snapshot_id: preSnapshotId,
    post_snapshot_id: postSnapshotId,
    restored_from_snapshot_id: restoredFrom || null,
    new_object_version_node_ids: clone(newNodes || []),
    active_version_bindings: clone(bindings),
    rollback_parent_state_version: preState.state_version,
    rollback_parent_state_digest: preState.state_digest,
    rollback_ledger_version: preLedger.ledger_version,
    rollback_ledger_digest: digestLedger(preLedger),
  };
}
function finalizeCommit({ preState, preLedger, nextState, nextLedger, request, action, bindings, newNodes, restoredFrom }) {
  const preSnapshotId = preLedger.current_snapshot_id;
  const sid = snapshotId(nextState.state_version, nextState.state_digest);
  if (nextLedger.state_snapshots[sid]) fail('STATE_SNAPSHOT_ID_CONFLICT', sid);
  nextLedger.state_snapshots[sid] = {
    snapshot_id: sid,
    state_version: nextState.state_version,
    state_digest: nextState.state_digest,
    predecessor_snapshot_id: preSnapshotId,
    predecessor_state_version: preState.state_version,
    predecessor_state_digest: preState.state_digest,
    active_version_bindings: clone(bindings),
    canonical_state: clone(nextState),
    created_by: 'BOOK_SYSTEM_PARENT_VERSION_ROLLBACK',
    created_from_request_id: request.request_id,
  };
  nextLedger.current_snapshot_id = sid;
  nextLedger.bound_parent_state_version = nextState.state_version;
  nextLedger.bound_parent_state_digest = nextState.state_digest;
  nextLedger.ledger_version += 1;
  const receipt = makeReceipt(action, request, preState, nextState, preLedger, nextLedger, preSnapshotId, sid, restoredFrom, newNodes, bindings);
  nextLedger.version_receipts[receipt.receipt_id] = receipt;
  nextLedger.processed_requests[request.idempotency_key] = { request_id: request.request_id, request_fingerprint: requestFingerprint(request), receipt_id: receipt.receipt_id };
  appendOutbox(nextLedger, action === 'RESTORE_AS_NEW_SUCCESSOR' ? 'BOOK_CANONICAL_STATE_RESTORED' : 'BOOK_CANONICAL_STATE_VERSION_COMMITTED', receipt.receipt_id, nextState.state_version);
  receipt.post_ledger_version = nextLedger.ledger_version;
  receipt.post_ledger_digest = digestLedger(nextLedger);
  nextLedger.version_receipts[receipt.receipt_id] = receipt;
  validateLedger(nextLedger, nextState);
  return { parent_state: nextState, version_ledger: nextLedger, receipt: clone(receipt), disposition: 'COMMITTED' };
}
function prepareProposedState(currentState, proposedInput) {
  const proposed = clone(proposedInput);
  delete proposed.state_digest;
  proposed.state_version = currentState.state_version + 1;
  return sealState(proposed);
}

function commitSuccessor({ parentState, versionLedger, request }) {
  validateParentState(parentState);
  validateLedger(versionLedger, parentState);
  req(request, ['request_id', 'idempotency_key', 'actor_class', 'expected_state_version', 'expected_state_digest', 'expected_ledger_version', 'expected_ledger_digest', 'proposed_parent_state', 'active_version_bindings', 'evidence_refs', 'author_decision_refs', 'lifecycle_transition_receipt'], 'successor_request');
  const replay = checkReplay(versionLedger, request);
  if (replay.replay) return { parent_state: clone(parentState), version_ledger: clone(versionLedger), receipt: replay.receipt, disposition: 'REPLAY' };
  validateExpected(request, parentState, versionLedger);
  if (!Array.isArray(request.evidence_refs) || !Array.isArray(request.author_decision_refs)) fail('REQUEST_EVIDENCE_ARRAY_REQUIRED');
  const proposed = prepareProposedState(parentState, request.proposed_parent_state);
  validateParentState(proposed);
  if (proposed.book_project.book_project_id !== parentState.book_project.book_project_id || proposed.book_project.book_id !== parentState.book_project.book_id) fail('BOOK_PROJECT_IDENTITY_IMMUTABLE');
  validateAppendOnlyPreservation(parentState, proposed);
  validateLifecycleStatusChange(parentState, proposed, request.lifecycle_transition_receipt);
  if (FROZEN_STATUSES.has(parentState.book_project.status) && proposed.active.canonical_manuscript_ref !== parentState.active.canonical_manuscript_ref) fail('FROZEN_OR_PUBLISHED_CONTENT_MUTATION_FORBIDDEN');
  const nextLedger = clone(versionLedger);
  const proposedRecords = objectRecords(proposed);
  const bindings = resolveBindings(proposed, proposedRecords, request.active_version_bindings || {});
  const newNodes = addNewObjectNodes(nextLedger, parentState, proposed, bindings);
  return finalizeCommit({ preState: clone(parentState), preLedger: clone(versionLedger), nextState: proposed, nextLedger, request, action: 'COMMIT_SUCCESSOR', bindings, newNodes, restoredFrom: null });
}

function mergeGovernedCollections(currentState, targetState) {
  const out = clone(currentState);
  for (const meta of Object.values(GOVERNED)) {
    const seen = new Map();
    const merged = [];
    for (const item of [...currentState[meta.collection], ...targetState[meta.collection]]) {
      const k = `${String(item[meta.id])}|${String(item[meta.version])}`;
      const d = digest(item);
      if (seen.has(k) && seen.get(k) !== d) fail('IMMUTABLE_OBJECT_VERSION_CONFLICT', `${meta.collection}:${k}`);
      if (!seen.has(k)) {
        seen.set(k, d);
        merged.push(clone(item));
      }
    }
    out[meta.collection] = merged;
  }
  return out;
}
function validateRestoreRevalidation(currentState, currentBindings, targetBindings, revalidation) {
  req(revalidation, ['rights_privacy_current', 'critical_evidence_resolved', 'dependency_revalidation_refs', 'binding_checks', 'author_decision_required', 'author_decision_refs', 'lifecycle_transition_receipt'], 'restore.revalidation');
  if (revalidation.rights_privacy_current !== true) fail('RESTORE_RIGHTS_PRIVACY_NOT_CURRENT');
  if (revalidation.critical_evidence_resolved !== true) fail('RESTORE_CRITICAL_EVIDENCE_UNRESOLVED');
  if (!Array.isArray(revalidation.dependency_revalidation_refs) || !Array.isArray(revalidation.binding_checks) || !Array.isArray(revalidation.author_decision_refs)) fail('RESTORE_REVALIDATION_ARRAY_REQUIRED');
  const changed = Object.keys(targetBindings).filter(p => currentBindings[p] !== targetBindings[p]);
  if (changed.length && revalidation.dependency_revalidation_refs.length === 0) fail('RESTORE_DEPENDENCY_REVALIDATION_REQUIRED');
  for (const pointer of changed) {
    const check = revalidation.binding_checks.find(x => x && x.pointer === pointer && x.target_node_id === targetBindings[pointer]);
    if (!check) fail('RESTORE_BINDING_CHECK_REQUIRED', pointer);
    if (!Array.isArray(check.evidence_refs) || check.evidence_refs.length === 0) fail('RESTORE_BINDING_EVIDENCE_REQUIRED', pointer);
  }
  if (revalidation.author_decision_required === true) {
    if (revalidation.author_decision_refs.length === 0) fail('RESTORE_AUTHOR_DECISION_REQUIRED');
    for (const ref of revalidation.author_decision_refs) if (!affirmativeAuthorDecision(currentState, ref)) fail('RESTORE_AUTHOR_DECISION_NOT_APPROVED', ref);
  }
  return changed;
}

function restoreAsNewSuccessor({ parentState, versionLedger, request }) {
  validateParentState(parentState);
  validateLedger(versionLedger, parentState);
  req(request, ['request_id', 'idempotency_key', 'actor_class', 'expected_state_version', 'expected_state_digest', 'expected_ledger_version', 'expected_ledger_digest', 'target_state_version', 'target_state_digest', 'mode', 'revalidation'], 'restore_request');
  const replay = checkReplay(versionLedger, request);
  if (replay.replay) return { parent_state: clone(parentState), version_ledger: clone(versionLedger), receipt: replay.receipt, disposition: 'REPLAY' };
  validateExpected(request, parentState, versionLedger);
  if (!['RESTORE_CONTENT', 'RESTORE_FULL_STATE'].includes(request.mode)) fail('UNKNOWN_RESTORE_MODE');
  if (FROZEN_STATUSES.has(parentState.book_project.status)) fail('FROZEN_OR_PUBLISHED_REOPEN_REQUIRED', parentState.book_project.status);
  const target = Object.values(versionLedger.state_snapshots).find(s => s.state_version === request.target_state_version && s.state_digest === request.target_state_digest);
  if (!target) fail('RESTORE_TARGET_NOT_FOUND');
  if (target.snapshot_id === versionLedger.current_snapshot_id) fail('RESTORE_TARGET_ALREADY_CURRENT');
  const currentSnap = versionLedger.state_snapshots[versionLedger.current_snapshot_id];
  const changed = validateRestoreRevalidation(parentState, currentSnap.active_version_bindings, target.active_version_bindings, request.revalidation);
  if (request.mode === 'RESTORE_FULL_STATE' && target.canonical_state.book_project.status !== parentState.book_project.status) fail('FULL_STATE_RESTORE_REQUIRES_PRIOR_LIFECYCLE_TRANSITION');
  let proposed = mergeGovernedCollections(parentState, target.canonical_state);
  proposed.active = clone(target.canonical_state.active);
  proposed.book_project.governing_brief_ref = proposed.active.governing_brief_ref;
  proposed.book_project.canonical_manifest_ref = proposed.active.canon_manifest_ref;
  proposed.book_project.status = parentState.book_project.status;
  proposed.research_evidence_links = clone(parentState.research_evidence_links);
  proposed.author_decisions = clone(parentState.author_decisions);
  proposed.integration_proposals = clone(parentState.integration_proposals);
  proposed.export_releases = clone(parentState.export_releases);
  proposed = prepareProposedState(parentState, proposed);
  validateParentState(proposed);
  validateAppendOnlyPreservation(parentState, proposed);
  const nextLedger = clone(versionLedger);
  const proposedRecords = objectRecords(proposed);
  const bindings = resolveBindings(proposed, proposedRecords, target.active_version_bindings);
  if (stable(bindings) !== stable(target.active_version_bindings)) fail('RESTORE_ACTIVE_BINDING_MISMATCH');
  const newNodes = addNewObjectNodes(nextLedger, parentState, proposed, bindings);
  if (newNodes.length !== 0) fail('RESTORE_MUST_NOT_CREATE_NEW_OBJECT_CONTENT');
  const result = finalizeCommit({ preState: clone(parentState), preLedger: clone(versionLedger), nextState: proposed, nextLedger, request, action: 'RESTORE_AS_NEW_SUCCESSOR', bindings, newNodes, restoredFrom: target.snapshot_id });
  result.changed_active_pointers = changed.sort();
  return result;
}

module.exports = {
  VersionRollbackError,
  GOVERNED,
  stableStringify: stable,
  digest,
  computeStateDigest,
  sealState,
  digestLedger,
  validateParentState,
  validateLedger,
  objectRecords,
  nodeId,
  createVersionLedger,
  commitSuccessor,
  restoreAsNewSuccessor,
};
