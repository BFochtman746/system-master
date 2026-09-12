import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ControllerKernel, ControllerError } from '../src/kernel.js';
import { uuidv7, sha256 } from '../src/canonical.js';
import { reduceSemanticEvents, rebuildControllerStore, reconcileRecoveredStore } from '../src/recovery.js';
import { MemoryDurableJournal, publishPendingOutbox } from '../src/durable-journal.js';
import { renewLease, revokeLease, getLeaseStanding } from '../src/durable-claim-authority.js';

const SUBJECT = { algorithm: 'sha1', oid: '0123456789abcdef0123456789abcdef01234567' };
const BASE = Date.parse('2026-09-12T05:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();

function command() {
  return {
    protocol_version: '1.0', schema: 'controller://schemas/command/v1', command_id: uuidv7(), created_at: new Date().toISOString(),
    issuer: { principal: 'user:test', source: 'test' }, command_type: 'controller.work.submit',
    target: { repository: 'BFochtman746/system-master', expected_subject: { ...SUBJECT } }, preconditions: {}, intent: { task: 'claim-recovery' }, constraints: {}, required_policy_version: 'claim-recovery-v1'
  };
}

function activeTx(kernel) {
  const tx = kernel.acceptCommand(command()).transaction_id;
  kernel.admitTransaction(tx, { operations: 'all_succeeded', qualification: 'not_required', promotion: 'not_required' });
  kernel.activateTransaction(tx);
  return tx;
}

function readyOperation(kernel, tx, resourceId) {
  const operationId = kernel.createOperation(tx, { resourceId });
  kernel.transitionOperation(operationId, 'READY');
  return operationId;
}

function granted(kernel, { tx = null, resourceId = 'resource:one', workerId = 'worker:one', nowMs = BASE, ttlMs = 60_000 } = {}) {
  const transactionId = tx ?? activeTx(kernel);
  const operationId = readyOperation(kernel, transactionId, resourceId);
  const lease = kernel.acquireLease(operationId, resourceId, workerId, ttlMs, nowMs);
  return { tx: transactionId, operationId, resourceId, workerId, lease, nowMs, ttlMs };
}

function renewal(ctx, { observedMs = BASE + 5_000, desiredMs = BASE + 120_000 } = {}) {
  return { leaseId: ctx.lease.lease_id, generation: ctx.lease.generation, operationId: ctx.operationId, observedAt: iso(observedMs), desiredExpiresAt: iso(desiredMs) };
}

function revocation(ctx, { observedMs = BASE + 5_000, reasonCode = 'CONTROLLER_REVOKED' } = {}) {
  return { leaseId: ctx.lease.lease_id, generation: ctx.lease.generation, operationId: ctx.operationId, reasonCode, observedAt: iso(observedMs) };
}

function assertCode(fn, code = 'RECOVERY_CLAIM_INVALID') {
  assert.throws(fn, (error) => error instanceof ControllerError && error.code === code);
}

function resealStream(events, streamId) {
  const list = events.filter((event) => event.stream_id === streamId).sort((a, b) => a.stream_version - b.stream_version);
  let previousDigest = null;
  for (const event of list) {
    event.prev_event_digest = previousDigest;
    const core = {
      event_id: event.event_id, event_schema: event.event_schema, stream_id: event.stream_id, stream_version: event.stream_version,
      event_type: event.event_type, occurred_at: event.occurred_at, prev_event_digest: event.prev_event_digest, data: event.data
    };
    event.event_digest = sha256(core);
    previousDigest = event.event_digest;
  }
}

function mutateEvent(events, eventType, mutate, occurrence = 0) {
  const matches = events.filter((event) => event.event_type === eventType);
  const target = matches[occurrence];
  assert.ok(target, `missing ${eventType} occurrence ${occurrence}`);
  mutate(target);
  resealStream(events, target.stream_id);
  return target;
}

function appendClaimEvent(kernel, operationId, eventType, data, occurredAt) {
  kernel.atomic(() => kernel.appendEvent(`operation:${operationId}`, kernel.currentStreamVersion(`operation:${operationId}`), eventType, data, occurredAt));
}

async function durableSnapshot(kernel) {
  const journal = new MemoryDurableJournal();
  const published = await publishPendingOutbox(kernel, journal);
  assert.ok(published.every((item) => item.sealed));
  return { entries: await journal.list(), checkpoint: await journal.getCheckpoint() };
}

function tempDb(prefix = 'controller-claim-recovery-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, db: join(dir, 'recovered.sqlite') };
}

// 1-9 grant projection and integrity.
test('FREC-001 valid grant creates one historical claim record', () => {
  const k = new ControllerKernel(':memory:'); const ctx = granted(k); const state = reduceSemanticEvents(k.exportEvents());
  assert.equal(Object.keys(state.claim_history).length, 1); assert.ok(state.claim_history[ctx.lease.lease_id]); k.close();
});

test('FREC-002 grant projects exact operation resource worker generation and expiry', () => {
  const k = new ControllerKernel(':memory:'); const ctx = granted(k); const claim = reduceSemanticEvents(k.exportEvents()).claim_history[ctx.lease.lease_id];
  assert.equal(claim.operation_id, ctx.operationId); assert.equal(claim.resource_id, ctx.resourceId); assert.equal(claim.worker_id, ctx.workerId); assert.equal(claim.generation, 1); assert.equal(claim.expires_at, iso(BASE + 60_000)); k.close();
});

test('FREC-003 grant issued time comes from durable event occurrence', () => {
  const k = new ControllerKernel(':memory:'); const ctx = granted(k); const claim = reduceSemanticEvents(k.exportEvents()).claim_history[ctx.lease.lease_id];
  assert.equal(claim.issued_at, iso(BASE)); assert.equal(claim.last_observed_at, iso(BASE)); k.close();
});

test('FREC-004 grant preserves planned resource binding', () => {
  const k = new ControllerKernel(':memory:'); const ctx = granted(k, { resourceId: 'resource:planned' }); const state = reduceSemanticEvents(k.exportEvents());
  assert.equal(state.operations[ctx.operationId].resource_id, state.claim_history[ctx.lease.lease_id].resource_id); k.close();
});

test('FREC-005 grant referencing missing operation fails closed', () => {
  const k = new ControllerKernel(':memory:'); granted(k); const events = structuredClone(k.exportEvents()); k.close();
  mutateEvent(events, 'lease.granted', (event) => { event.data.operation_id = uuidv7(); }); assertCode(() => reduceSemanticEvents(events));
});

test('FREC-006 grant resource mismatch fails closed', () => {
  const k = new ControllerKernel(':memory:'); granted(k); const events = structuredClone(k.exportEvents()); k.close();
  mutateEvent(events, 'lease.granted', (event) => { event.data.resource_id = 'resource:wrong'; }); assertCode(() => reduceSemanticEvents(events));
});

test('FREC-007 duplicate lease id fails closed', () => {
  const k = new ControllerKernel(':memory:'); const tx = activeTx(k); const a = granted(k, { tx, resourceId: 'resource:a', workerId: 'worker:a' }); granted(k, { tx, resourceId: 'resource:b', workerId: 'worker:b' });
  const events = structuredClone(k.exportEvents()); k.close(); mutateEvent(events, 'lease.granted', (event) => { event.data.lease_id = a.lease.lease_id; }, 1); assertCode(() => reduceSemanticEvents(events));
});

test('FREC-008 duplicate resource generation fails closed', () => {
  const k = new ControllerKernel(':memory:'); const tx = activeTx(k); granted(k, { tx, resourceId: 'resource:a' }); granted(k, { tx, resourceId: 'resource:b' }); const events = structuredClone(k.exportEvents()); k.close();
  const secondGrant = events.filter((event) => event.event_type === 'lease.granted')[1];
  mutateEvent(events, 'operation.planned', (event) => { event.data.resource_id = 'resource:a'; }, 1);
  secondGrant.data.resource_id = 'resource:a'; resealStream(events, secondGrant.stream_id); assertCode(() => reduceSemanticEvents(events));
});

test('FREC-009 nonfuture grant expiry fails closed', () => {
  const k = new ControllerKernel(':memory:'); granted(k); const events = structuredClone(k.exportEvents()); k.close();
  mutateEvent(events, 'lease.granted', (event) => { event.data.expires_at = event.occurred_at; }); assertCode(() => reduceSemanticEvents(events));
});

// 10-14 generation-floor integrity.
test('FREC-010 one resource generation one projects floor one', () => {
  const k = new ControllerKernel(':memory:'); granted(k, { resourceId: 'resource:g' }); assert.equal(reduceSemanticEvents(k.exportEvents()).resource_generations['resource:g'], 1); k.close();
});

test('FREC-011 generations one then two project floor two across operation streams', () => {
  const k = new ControllerKernel(':memory:'); const tx = activeTx(k); granted(k, { tx, resourceId: 'resource:g', ttlMs: 10 }); const op2 = readyOperation(k, tx, 'resource:g'); k.acquireLease(op2, 'resource:g', 'worker:two', 60_000, BASE + 11);
  assert.equal(reduceSemanticEvents(k.exportEvents()).resource_generations['resource:g'], 2); k.close();
});

test('FREC-012 lower generation is marked superseded by highest generation', () => {
  const k = new ControllerKernel(':memory:'); const tx = activeTx(k); const first = granted(k, { tx, resourceId: 'resource:g', ttlMs: 10 }); const op2 = readyOperation(k, tx, 'resource:g'); k.acquireLease(op2, 'resource:g', 'worker:two', 60_000, BASE + 11);
  assert.equal(reduceSemanticEvents(k.exportEvents()).claim_history[first.lease.lease_id].superseded_by_generation, 2); k.close();
});

test('FREC-013 generation gap fails closed', () => {
  const k = new ControllerKernel(':memory:'); const tx = activeTx(k); granted(k, { tx, resourceId: 'resource:g', ttlMs: 10 }); const op2 = readyOperation(k, tx, 'resource:g'); k.acquireLease(op2, 'resource:g', 'worker:two', 60_000, BASE + 11); const events = structuredClone(k.exportEvents()); k.close();
  mutateEvent(events, 'lease.granted', (event) => { event.data.generation = 3; }, 1); assertCode(() => reduceSemanticEvents(events));
});

test('FREC-014 zero or noninteger generation fails closed', () => {
  const k = new ControllerKernel(':memory:'); granted(k); const original = k.exportEvents(); k.close();
  for (const invalid of [0, 1.5]) { const events = structuredClone(original); mutateEvent(events, 'lease.granted', (event) => { event.data.generation = invalid; }); assertCode(() => reduceSemanticEvents(events)); }
});

// 15-22 renewal replay.
test('FREC-015 valid renewal advances projected expiry', () => {
  const k = new ControllerKernel(':memory:'); const ctx = granted(k); renewLease(k, renewal(ctx)); const claim = reduceSemanticEvents(k.exportEvents()).claim_history[ctx.lease.lease_id]; assert.equal(claim.expires_at, iso(BASE + 120_000)); k.close();
});

test('FREC-016 renewal preserves generation and immutable binding', () => {
  const k = new ControllerKernel(':memory:'); const ctx = granted(k); renewLease(k, renewal(ctx)); const claim = reduceSemanticEvents(k.exportEvents()).claim_history[ctx.lease.lease_id];
  assert.equal(claim.operation_id, ctx.operationId); assert.equal(claim.resource_id, ctx.resourceId); assert.equal(claim.generation, ctx.lease.generation); k.close();
});

test('FREC-017 renewal before grant fails closed', () => {
  const k = new ControllerKernel(':memory:'); const tx = activeTx(k); const op = readyOperation(k, tx, 'resource:no-grant'); const leaseId = uuidv7(BASE);
  appendClaimEvent(k, op, 'lease.renewed', { lease_id: leaseId, operation_id: op, resource_id: 'resource:no-grant', generation: 1, previous_expires_at: iso(BASE + 60_000), expires_at: iso(BASE + 120_000), observed_at: iso(BASE + 5_000) }, iso(BASE + 5_001));
  const events = k.exportEvents(); k.close(); assertCode(() => reduceSemanticEvents(events));
});

test('FREC-018 renewal wrong operation resource or generation fails closed', () => {
  const k = new ControllerKernel(':memory:'); const ctx = granted(k); renewLease(k, renewal(ctx)); const original = k.exportEvents(); k.close();
  const mutations = [(d) => { d.operation_id = uuidv7(); }, (d) => { d.resource_id = 'resource:wrong'; }, (d) => { d.generation += 1; }];
  for (const mutate of mutations) { const events = structuredClone(original); mutateEvent(events, 'lease.renewed', (event) => mutate(event.data)); assertCode(() => reduceSemanticEvents(events)); }
});

test('FREC-019 renewal previous-expiry mismatch fails closed', () => {
  const k = new ControllerKernel(':memory:'); const ctx = granted(k); renewLease(k, renewal(ctx)); const events = structuredClone(k.exportEvents()); k.close();
  mutateEvent(events, 'lease.renewed', (event) => { event.data.previous_expires_at = iso(BASE + 59_000); }); assertCode(() => reduceSemanticEvents(events));
});

test('FREC-020 non-increasing renewal expiry fails closed', () => {
  const k = new ControllerKernel(':memory:'); const ctx = granted(k); renewLease(k, renewal(ctx)); const events = structuredClone(k.exportEvents()); k.close();
  mutateEvent(events, 'lease.renewed', (event) => { event.data.expires_at = event.data.previous_expires_at; }); assertCode(() => reduceSemanticEvents(events));
});

test('FREC-021 stale renewal observation fails closed', () => {
  const k = new ControllerKernel(':memory:'); const ctx = granted(k); renewLease(k, renewal(ctx)); const events = structuredClone(k.exportEvents()); k.close();
  mutateEvent(events, 'lease.renewed', (event) => { event.data.observed_at = iso(BASE - 1); }); assertCode(() => reduceSemanticEvents(events));
});

test('FREC-022 renewal after explicit terminal claim fails closed', () => {
  const k = new ControllerKernel(':memory:'); const ctx = granted(k); revokeLease(k, revocation(ctx));
  appendClaimEvent(k, ctx.operationId, 'lease.renewed', { lease_id: ctx.lease.lease_id, operation_id: ctx.operationId, resource_id: ctx.resourceId, generation: ctx.lease.generation, previous_expires_at: iso(BASE + 60_000), expires_at: iso(BASE + 120_000), observed_at: iso(BASE + 6_000) }, iso(BASE + 6_001));
  const events = k.exportEvents(); k.close(); assertCode(() => reduceSemanticEvents(events));
});

// 23-28 revocation and release.
test('FREC-023 valid revocation projects REVOKED and bounded reason', () => {
  const k = new ControllerKernel(':memory:'); const ctx = granted(k); revokeLease(k, revocation(ctx, { reasonCode: 'CONTROLLER_REVOKED' })); const claim = reduceSemanticEvents(k.exportEvents()).claim_history[ctx.lease.lease_id]; assert.equal(claim.terminal_status, 'REVOKED'); assert.equal(claim.revocation_reason_code, 'CONTROLLER_REVOKED'); k.close();
});

test('FREC-024 revocation wrong immutable binding fails closed', () => {
  const k = new ControllerKernel(':memory:'); const ctx = granted(k); revokeLease(k, revocation(ctx)); const events = structuredClone(k.exportEvents()); k.close(); mutateEvent(events, 'lease.revoked', (event) => { event.data.generation += 1; }); assertCode(() => reduceSemanticEvents(events));
});

test('FREC-025 revocation after terminal release fails closed', () => {
  const k = new ControllerKernel(':memory:'); const ctx = granted(k); k.releaseLease(ctx.lease.lease_id, ctx.lease.generation, BASE + 4_000);
  appendClaimEvent(k, ctx.operationId, 'lease.revoked', { lease_id: ctx.lease.lease_id, operation_id: ctx.operationId, resource_id: ctx.resourceId, generation: ctx.lease.generation, reason_code: 'CONTROLLER_REVOKED', observed_at: iso(BASE + 5_000) }, iso(BASE + 5_001));
  const events = k.exportEvents(); k.close(); assertCode(() => reduceSemanticEvents(events));
});

test('FREC-026 valid release projects RELEASED', () => {
  const k = new ControllerKernel(':memory:'); const ctx = granted(k); k.releaseLease(ctx.lease.lease_id, ctx.lease.generation, BASE + 4_000); const claim = reduceSemanticEvents(k.exportEvents()).claim_history[ctx.lease.lease_id]; assert.equal(claim.terminal_status, 'RELEASED'); k.close();
});

test('FREC-027 release wrong immutable binding fails closed', () => {
  const k = new ControllerKernel(':memory:'); const ctx = granted(k); k.releaseLease(ctx.lease.lease_id, ctx.lease.generation, BASE + 4_000); const events = structuredClone(k.exportEvents()); k.close(); mutateEvent(events, 'lease.released', (event) => { event.data.resource_id = 'resource:wrong'; }); assertCode(() => reduceSemanticEvents(events));
});

test('FREC-028 release after terminal revocation fails closed', () => {
  const k = new ControllerKernel(':memory:'); const ctx = granted(k); revokeLease(k, revocation(ctx));
  appendClaimEvent(k, ctx.operationId, 'lease.released', { lease_id: ctx.lease.lease_id, operation_id: ctx.operationId, resource_id: ctx.resourceId, generation: ctx.lease.generation }, iso(BASE + 6_000));
  const events = k.exportEvents(); k.close(); assertCode(() => reduceSemanticEvents(events));
});

// 29-36 fresh-store non-resurrection and reconciliation.
test('FREC-029 grant-only journal rebuild creates zero lease rows', async () => {
  const source = new ControllerKernel(':memory:'); granted(source); const durable = await durableSnapshot(source); source.close(); const { dir, db } = tempDb();
  try { const recovered = rebuildControllerStore(db, durable.entries, { expectedCheckpoint: durable.checkpoint }); assert.equal(Number(recovered.db.prepare('SELECT COUNT(*) n FROM leases').get().n), 0); recovered.close(); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FREC-030 renewed latest claim rebuild creates zero lease rows and preserves fence', async () => {
  const source = new ControllerKernel(':memory:'); const ctx = granted(source, { resourceId: 'resource:renewed' }); renewLease(source, renewal(ctx)); const durable = await durableSnapshot(source); source.close(); const { dir, db } = tempDb();
  try { const recovered = rebuildControllerStore(db, durable.entries, { expectedCheckpoint: durable.checkpoint }); assert.equal(Number(recovered.db.prepare('SELECT COUNT(*) n FROM leases').get().n), 0); assert.equal(Number(recovered.db.prepare("SELECT generation FROM resource_generations WHERE resource_id='resource:renewed'").get().generation), 1); recovered.close(); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FREC-031 revoked history rebuild creates zero lease rows and preserves sealed evidence', async () => {
  const source = new ControllerKernel(':memory:'); const ctx = granted(source); revokeLease(source, revocation(ctx)); const durable = await durableSnapshot(source); source.close(); const { dir, db } = tempDb();
  try { const recovered = rebuildControllerStore(db, durable.entries, { expectedCheckpoint: durable.checkpoint }); assert.equal(Number(recovered.db.prepare('SELECT COUNT(*) n FROM leases').get().n), 0); assert.equal(Number(recovered.db.prepare("SELECT COUNT(*) n FROM events WHERE event_type='lease.revoked'").get().n), 1); recovered.close(); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FREC-032 recovered RUNNING operation becomes STALE without resurrected lease', async () => {
  const source = new ControllerKernel(':memory:'); const ctx = granted(source); source.startLeasedOperation({ leaseId: ctx.lease.lease_id, generation: ctx.lease.generation, operationId: ctx.operationId, nowMs: BASE + 1_000 }); const durable = await durableSnapshot(source); source.close(); const { dir, db } = tempDb();
  try { const recovered = rebuildControllerStore(db, durable.entries, { expectedCheckpoint: durable.checkpoint }); const result = reconcileRecoveredStore(recovered); assert.deepEqual(result.orphaned_operations_staled, [ctx.operationId]); assert.equal(recovered.db.prepare('SELECT state FROM operations WHERE operation_id=?').get(ctx.operationId).state, 'STALE'); recovered.close(); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FREC-033 READY historical claim remains READY but has no execution authority after rebuild', async () => {
  const source = new ControllerKernel(':memory:'); const ctx = granted(source); const durable = await durableSnapshot(source); source.close(); const { dir, db } = tempDb();
  try { const recovered = rebuildControllerStore(db, durable.entries, { expectedCheckpoint: durable.checkpoint }); reconcileRecoveredStore(recovered); assert.equal(recovered.db.prepare('SELECT state FROM operations WHERE operation_id=?').get(ctx.operationId).state, 'READY'); assert.equal(Number(recovered.db.prepare('SELECT COUNT(*) n FROM leases').get().n), 0); recovered.close(); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FREC-034 replacement fresh claim advances preserved generation and old lease is not authority', async () => {
  const source = new ControllerKernel(':memory:'); const ctx = granted(source, { resourceId: 'resource:replace' }); const durable = await durableSnapshot(source); source.close(); const { dir, db } = tempDb();
  try { const recovered = rebuildControllerStore(db, durable.entries, { expectedCheckpoint: durable.checkpoint }); const next = recovered.acquireLease(ctx.operationId, ctx.resourceId, 'worker:new', 60_000, BASE + 120_000); assert.equal(next.generation, 2); assertCode(() => getLeaseStanding(recovered, ctx.lease.lease_id), 'NOT_FOUND'); recovered.close(); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FREC-035 recovery diagnostics expose bounded claim identity/fence facts without recreating authority', async () => {
  const source = new ControllerKernel(':memory:'); const ctx = granted(source, { resourceId: 'resource:diag' }); const durable = await durableSnapshot(source); source.close(); const { dir, db } = tempDb();
  try { const recovered = rebuildControllerStore(db, durable.entries, { expectedCheckpoint: durable.checkpoint }); const result = reconcileRecoveredStore(recovered); assert.equal(result.historical_claim_count, 1); assert.equal(result.historical_current_generation_by_resource['resource:diag'], 1); assert.deepEqual(result.nonresurrected_unterminated_claims, [ctx.lease.lease_id]); assert.equal(Number(recovered.db.prepare('SELECT COUNT(*) n FROM leases').get().n), 0); recovered.close(); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FREC-036 rebuilt durable journal remains sealed while live lease authority remains empty', async () => {
  const source = new ControllerKernel(':memory:'); granted(source); const durable = await durableSnapshot(source); source.close(); const { dir, db } = tempDb();
  try { const recovered = rebuildControllerStore(db, durable.entries, { expectedCheckpoint: durable.checkpoint }); assert.equal(Number(recovered.db.prepare("SELECT COUNT(*) n FROM outbox WHERE status<>'SEALED'").get().n), 0); assert.equal(Number(recovered.db.prepare("SELECT COUNT(*) n FROM leases WHERE status='ACTIVE'").get().n), 0); recovered.close(); } finally { rmSync(dir, { recursive: true, force: true }); }
});
