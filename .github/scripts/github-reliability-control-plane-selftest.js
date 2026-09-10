'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..', '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const sha40 = (v) => /^[0-9a-f]{40}$/i.test(String(v || ''));
const digest = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

function registerIntent(store, key, intent) {
  const d = digest(intent);
  if (!store.has(key)) { store.set(key, d); return 'CREATED'; }
  if (store.get(key) !== d) throw new Error('DIVERGENT_IDEMPOTENCY_REUSE');
  return 'REPLAY';
}

function claimFence(lastIssuedEpoch, candidateEpoch) {
  if (!Number.isInteger(candidateEpoch) || candidateEpoch <= lastIssuedEpoch) {
    throw new Error('STALE_FENCE_EPOCH');
  }
  return candidateEpoch;
}

function admit({ liveHead, expectedBaseSha, operationFenceEpoch, currentFenceEpoch }) {
  if (!sha40(liveHead) || !sha40(expectedBaseSha)) throw new Error('INVALID_SHA');
  if (operationFenceEpoch !== currentFenceEpoch) throw new Error('STALE_FENCE_EPOCH');
  if (liveHead !== expectedBaseSha) throw new Error('STALE_BASE');
  return 'ELIGIBLE_FOR_FAST_FORWARD_ONLY_ADMISSION';
}

function consumeTerminalEvent(seen, eventId) {
  if (seen.has(eventId)) return 'DUPLICATE_NO_EFFECT';
  seen.add(eventId);
  return 'SUCCESSOR_EVALUATION_REQUIRED';
}

const leaseSchema = readJson('governance/github/GITHUB-WORK-LEASE-SCHEMA-001.json');
const opSchema = readJson('governance/github/GITHUB-OPERATION-LEDGER-SCHEMA-001.json');
const secondShift = readJson('governance/second-shift/SECOND-SHIFT-REGISTRY-001.json');

const requiredLease = new Set(leaseSchema.required_fields || []);
for (const f of ['work_session_id','owner_lane','objective_id','candidate_branch','base_sha','owner_control_head','fence_epoch','allowed_paths','allowed_effects','forbidden_effects','authorization_class','issued_at','expires_at','issued_by']) {
  assert(requiredLease.has(f), `lease schema missing ${f}`);
}
assert((leaseSchema.authorization_classes || []).includes('USER_REQUIRED'), 'USER_REQUIRED authorization class missing');
assert((leaseSchema.effect_classes?.USER_REQUIRED || []).includes('REPLACE_CENTRAL_OBJECTIVE'), 'central objective replacement must require user authority');
assert((leaseSchema.effect_classes?.USER_REQUIRED || []).includes('CROSS_OWNER_CANONICAL_WRITE'), 'cross-owner canonical write must require user authority');
assert(leaseSchema.canonical_write_requirement === 'OWNER_LANE_LEASE_AND_GLOBAL_REPOSITORY_WRITER_FENCE', 'two-lock write law missing');

const requiredOp = new Set(opSchema.required_fields || []);
for (const f of ['operation_id','idempotency_key','owner_lane','objective_id','work_session_id','operation_class','resource','expected_base_sha','fence_epoch','payload_sha256','priority','attempt','state']) {
  assert(requiredOp.has(f), `operation schema missing ${f}`);
}
assert(opSchema.retry_law?.single_retry_layer === true, 'retry ownership must be centralized');
assert(opSchema.retry_law?.bounded === true, 'retry budget must be bounded');
assert(opSchema.retry_law?.poison_work === 'QUARANTINE', 'poison work must quarantine');

const lanes = Object.keys(secondShift.owner_files || {});
assert(lanes.length > 0, 'Second Shift registry has no active lanes');
assert(lanes.includes('DOCUMENTS'), 'DOCUMENTS must be registry-discovered');
assert(!lanes.includes('PROSE'), 'retired PROSE must not be active');
assert(!lanes.includes('SYSTEM_MASTER'), 'MASTER_ROOT must not be an active worker lane');
assert(String(secondShift.owner_discovery_rule || '').includes('owner_files'), 'owner discovery must be registry-driven');

const intents = new Map();
const intentA = { owner: 'DOCUMENTS', objective: 'R4', resource: 'main', base: 'a'.repeat(40), payload: 'p1' };
assert(registerIntent(intents, 'idem-1', intentA) === 'CREATED', 'first intent not created');
assert(registerIntent(intents, 'idem-1', intentA) === 'REPLAY', 'exact replay not idempotent');
let divergentRejected = false;
try { registerIntent(intents, 'idem-1', { ...intentA, payload: 'p2' }); } catch (e) { divergentRejected = e.message === 'DIVERGENT_IDEMPOTENCY_REUSE'; }
assert(divergentRejected, 'divergent idempotency reuse was not rejected');

const epoch41 = claimFence(40, 41);
const epoch42 = claimFence(epoch41, 42);
let staleFenceRejected = false;
try { claimFence(epoch42, 41); } catch (e) { staleFenceRejected = e.message === 'STALE_FENCE_EPOCH'; }
assert(staleFenceRejected, 'old fence became valid again');

const base = 'b'.repeat(40);
assert(admit({ liveHead: base, expectedBaseSha: base, operationFenceEpoch: 42, currentFenceEpoch: 42 }) === 'ELIGIBLE_FOR_FAST_FORWARD_ONLY_ADMISSION', 'valid CAS admission rejected');
let staleBaseRejected = false;
try { admit({ liveHead: 'c'.repeat(40), expectedBaseSha: base, operationFenceEpoch: 42, currentFenceEpoch: 42 }); } catch (e) { staleBaseRejected = e.message === 'STALE_BASE'; }
assert(staleBaseRejected, 'stale base was not rejected');
let staleWriterRejected = false;
try { admit({ liveHead: base, expectedBaseSha: base, operationFenceEpoch: 41, currentFenceEpoch: 42 }); } catch (e) { staleWriterRejected = e.message === 'STALE_FENCE_EPOCH'; }
assert(staleWriterRejected, 'stale writer was not rejected');

const terminalEvents = new Set();
assert(consumeTerminalEvent(terminalEvents, 'evt-1') === 'SUCCESSOR_EVALUATION_REQUIRED', 'first terminal event failed');
assert(consumeTerminalEvent(terminalEvents, 'evt-1') === 'DUPLICATE_NO_EFFECT', 'duplicate terminal event duplicated work');

console.log(JSON.stringify({
  status: 'PASS',
  tests: {
    lease_contract: true,
    user_authority_boundary: true,
    dynamic_second_shift_lanes: lanes,
    idempotent_replay: true,
    divergent_reuse_rejected: true,
    monotonic_fencing: true,
    stale_base_rejected: true,
    stale_writer_rejected: true,
    duplicate_terminal_event_deduped: true,
    bounded_single_layer_retry_contract: true
  }
}, null, 2));
