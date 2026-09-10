'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const schema = readJson('governance/github/GITHUB-CONTROL-STATE-SCHEMA-001.json');
const opSchema = readJson('governance/github/GITHUB-OPERATION-LEDGER-SCHEMA-001.json');
const isSha = (v) => /^[0-9a-f]{40}$/i.test(String(v || ''));
const clone = (v) => JSON.parse(JSON.stringify(v));
const digest = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

function initialState(now = new Date()) {
  const state = clone(schema.initial_state);
  state.updated_at = now.toISOString();
  return state;
}

function assertState(state) {
  for (const f of schema.required_state_fields || []) {
    if (!(f in state)) throw new Error(`INVALID_STATE:${f}`);
  }
  if (state.schema_id !== schema.schema_id) throw new Error('INVALID_STATE:SCHEMA');
  if (!Number.isInteger(state.generation) || state.generation < 1) throw new Error('INVALID_STATE:GENERATION');
  if (!Number.isInteger(state.repository_writer_epoch) || state.repository_writer_epoch < 0) throw new Error('INVALID_STATE:EPOCH');
  if (state.last_reconciled_main_sha !== null && !isSha(state.last_reconciled_main_sha)) throw new Error('INVALID_STATE:MAIN_SHA');
  return true;
}

function semanticIntent(op) {
  return {
    idempotency_key: op.idempotency_key,
    owner_lane: op.owner_lane,
    objective_id: op.objective_id,
    work_session_id: op.work_session_id,
    operation_class: op.operation_class,
    resource: op.resource,
    expected_base_sha: op.expected_base_sha,
    payload_sha256: op.payload_sha256
  };
}

function registerOperation(state, op, now = new Date()) {
  assertState(state);
  for (const field of opSchema.required_fields || []) {
    if (op[field] === undefined || op[field] === null || op[field] === '') throw new Error(`INVALID_OPERATION:${field}`);
  }
  const key = String(op.idempotency_key);
  const intentDigest = digest(semanticIntent(op));
  const existing = Object.values(state.known_operations || {}).find((x) => x && x.idempotency_key === key);
  if (existing) {
    if (existing.intent_digest !== intentDigest) throw new Error('DIVERGENT_IDEMPOTENCY_REUSE');
    return { state, outcome: 'NOOP_REPLAY', operation: existing };
  }
  if (state.known_operations[op.operation_id]) throw new Error('INVALID_TRANSITION:OPERATION_ID_REUSE');
  const record = {
    operation_id: op.operation_id,
    idempotency_key: key,
    intent_digest: intentDigest,
    owner_lane: op.owner_lane,
    objective_id: op.objective_id,
    work_session_id: op.work_session_id,
    operation_class: op.operation_class,
    resource: op.resource,
    expected_base_sha: op.expected_base_sha,
    fence_epoch: op.fence_epoch,
    payload_sha256: op.payload_sha256,
    priority: op.priority,
    attempt: op.attempt,
    state: op.state,
    created_at: op.created_at || now.toISOString(),
    updated_at: now.toISOString()
  };
  state.known_operations[op.operation_id] = record;
  state.generation += 1;
  state.updated_at = now.toISOString();
  return { state, outcome: 'APPLIED', operation: record };
}

function claimRepositoryWriter(state, request, now = new Date()) {
  assertState(state);
  const current = state.active_repository_writer;
  if (current) {
    const expires = new Date(current.lease_expires_at);
    if (!Number.isNaN(expires.getTime()) && expires > now) {
      if (current.operation_id === request.operation_id && current.lease_id === request.lease_id) {
        return { state, outcome: 'NOOP_REPLAY', writer: current };
      }
      throw new Error('WRITER_BUSY');
    }
  }
  if (!isSha(request.expected_base_sha)) throw new Error('STALE_BASE');
  const nextEpoch = state.repository_writer_epoch + 1;
  if (request.requested_epoch !== undefined && request.requested_epoch !== nextEpoch) throw new Error('STALE_FENCE_EPOCH');
  const expires = new Date(request.lease_expires_at);
  if (Number.isNaN(expires.getTime()) || expires <= now) throw new Error('LEASE_EXPIRED');
  const writer = {
    lease_id: request.lease_id,
    operation_id: request.operation_id,
    owner_lane: request.owner_lane,
    objective_id: request.objective_id,
    target_ref: request.target_ref,
    expected_base_sha: request.expected_base_sha,
    fence_epoch: nextEpoch,
    claimed_at: now.toISOString(),
    lease_expires_at: expires.toISOString()
  };
  state.repository_writer_epoch = nextEpoch;
  state.active_repository_writer = writer;
  state.generation += 1;
  state.updated_at = now.toISOString();
  return { state, outcome: 'APPLIED', writer };
}

function releaseRepositoryWriter(state, leaseId, fenceEpoch, now = new Date()) {
  assertState(state);
  const current = state.active_repository_writer;
  if (!current) return { state, outcome: 'NOOP_REPLAY' };
  if (current.lease_id !== leaseId || current.fence_epoch !== fenceEpoch) throw new Error('STALE_FENCE_EPOCH');
  state.active_repository_writer = null;
  state.generation += 1;
  state.updated_at = now.toISOString();
  return { state, outcome: 'APPLIED' };
}

function recordTerminalEvent(state, event, now = new Date()) {
  assertState(state);
  if (!event || !event.event_id) throw new Error('INVALID_TRANSITION:EVENT_ID');
  const existing = state.seen_terminal_events[event.event_id];
  const eventDigest = digest(event);
  if (existing) {
    if (existing.event_digest !== eventDigest) throw new Error('DIVERGENT_IDEMPOTENCY_REUSE');
    return { state, outcome: 'NOOP_REPLAY', event: existing };
  }
  const record = { ...event, event_digest: eventDigest, recorded_at: now.toISOString() };
  state.seen_terminal_events[event.event_id] = record;
  state.generation += 1;
  state.updated_at = now.toISOString();
  return { state, outcome: 'APPLIED', event: record };
}

function reconcileMain(state, mainSha, now = new Date()) {
  assertState(state);
  if (!isSha(mainSha)) throw new Error('INVALID_STATE:MAIN_SHA');
  if (state.last_reconciled_main_sha === mainSha) return { state, outcome: 'NOOP_REPLAY' };
  state.last_reconciled_main_sha = mainSha;
  state.generation += 1;
  state.updated_at = now.toISOString();
  return { state, outcome: 'APPLIED' };
}

function selftest() {
  const t0 = new Date('2026-09-10T22:00:00Z');
  let state = initialState(t0);
  const op = {
    operation_id: 'op-1', idempotency_key: 'idem-1', owner_lane: 'DOCUMENTS', objective_id: 'OBJ-1', work_session_id: 'session-1',
    operation_class: 'ADMISSION', resource: 'main', expected_base_sha: 'a'.repeat(40), fence_epoch: 1,
    payload_sha256: 'b'.repeat(64), priority: 100, attempt: 1, state: 'READY', created_at: t0.toISOString(), updated_at: t0.toISOString()
  };
  let r = registerOperation(state, op, t0); state = r.state;
  if (r.outcome !== 'APPLIED') throw new Error('REGISTER_OPERATION_FAILED');
  r = registerOperation(state, op, t0);
  if (r.outcome !== 'NOOP_REPLAY') throw new Error('IDEMPOTENT_REPLAY_FAILED');
  let divergent = false;
  try { registerOperation(state, { ...op, operation_id: 'op-2', payload_sha256: 'c'.repeat(64) }, t0); } catch (e) { divergent = e.message === 'DIVERGENT_IDEMPOTENCY_REUSE'; }
  if (!divergent) throw new Error('DIVERGENT_REUSE_NOT_REJECTED');

  const claim = {
    lease_id: 'writer-1', operation_id: 'op-1', owner_lane: 'DOCUMENTS', objective_id: 'OBJ-1', target_ref: 'main',
    expected_base_sha: 'a'.repeat(40), lease_expires_at: '2026-09-10T22:30:00Z'
  };
  r = claimRepositoryWriter(state, claim, t0); state = r.state;
  if (r.writer.fence_epoch !== 1) throw new Error('FIRST_EPOCH_NOT_ONE');
  let busy = false;
  try { claimRepositoryWriter(state, { ...claim, lease_id: 'writer-2', operation_id: 'op-2' }, new Date('2026-09-10T22:05:00Z')); } catch (e) { busy = e.message === 'WRITER_BUSY'; }
  if (!busy) throw new Error('CONCURRENT_WRITER_NOT_BLOCKED');
  r = releaseRepositoryWriter(state, 'writer-1', 1, new Date('2026-09-10T22:10:00Z')); state = r.state;
  const claim2 = { ...claim, lease_id: 'writer-2', operation_id: 'op-2', lease_expires_at: '2026-09-10T22:40:00Z' };
  r = claimRepositoryWriter(state, claim2, new Date('2026-09-10T22:11:00Z')); state = r.state;
  if (r.writer.fence_epoch !== 2) throw new Error('EPOCH_NOT_MONOTONIC');
  let staleRelease = false;
  try { releaseRepositoryWriter(state, 'writer-1', 1, new Date('2026-09-10T22:12:00Z')); } catch (e) { staleRelease = e.message === 'STALE_FENCE_EPOCH'; }
  if (!staleRelease) throw new Error('STALE_WRITER_RELEASE_ACCEPTED');

  r = recordTerminalEvent(state, { event_id: 'evt-1', operation_id: 'op-1', result: 'PASS' }, t0); state = r.state;
  if (r.outcome !== 'APPLIED') throw new Error('TERMINAL_EVENT_NOT_RECORDED');
  r = recordTerminalEvent(state, { event_id: 'evt-1', operation_id: 'op-1', result: 'PASS' }, t0);
  if (r.outcome !== 'NOOP_REPLAY') throw new Error('TERMINAL_EVENT_NOT_DEDUPED');

  r = reconcileMain(state, 'd'.repeat(40), t0); state = r.state;
  if (state.last_reconciled_main_sha !== 'd'.repeat(40)) throw new Error('MAIN_RECONCILE_FAILED');
  assertState(state);

  console.log(JSON.stringify({ status: 'PASS', tests: {
    operation_registration: true,
    exact_replay_idempotent: true,
    divergent_reuse_rejected: true,
    one_repository_writer: true,
    monotonic_fence_epoch: true,
    stale_writer_rejected: true,
    terminal_event_deduped: true,
    main_reconciliation: true
  }, final_generation: state.generation, final_writer_epoch: state.repository_writer_epoch }, null, 2));
}

if (require.main === module) {
  const mode = process.argv[2] || 'selftest';
  if (mode === 'selftest') selftest();
  else if (mode === 'init') {
    const out = process.argv[3];
    if (!out) throw new Error('OUTPUT_PATH_REQUIRED');
    fs.writeFileSync(out, `${JSON.stringify(initialState(), null, 2)}\n`);
  } else throw new Error(`UNKNOWN_MODE:${mode}`);
}

module.exports = { initialState, assertState, registerOperation, claimRepositoryWriter, releaseRepositoryWriter, recordTerminalEvent, reconcileMain };
