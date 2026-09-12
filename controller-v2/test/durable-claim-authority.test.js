import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ControllerKernel, ControllerError } from '../src/kernel.js';
import { uuidv7 } from '../src/canonical.js';
import {
  CLAIM_RENEWAL_MAX_HORIZON_MS,
  getLeaseStanding,
  renewLease,
  revokeLease
} from '../src/durable-claim-authority.js';
import { prepareExternalEffect, authorizeExternalEffectDispatch } from '../src/external-effect-authority.js';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const SUBJECT = { algorithm: 'sha1', oid: SHA };
const BASE = Date.parse('2026-09-12T05:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();

function command(overrides = {}) {
  return {
    protocol_version: '1.0',
    schema: 'controller://schemas/command/v1',
    command_id: uuidv7(),
    created_at: new Date().toISOString(),
    issuer: { principal: 'user:test', source: 'test' },
    command_type: 'controller.work.submit',
    target: { repository: 'BFochtman746/system-master', expected_subject: { ...SUBJECT } },
    preconditions: {},
    intent: { task: 'claim-test' },
    constraints: {},
    required_policy_version: 'claim-test-v1',
    ...overrides
  };
}

function assertCode(fn, code) {
  assert.throws(fn, (error) => error instanceof ControllerError && error.code === code);
}

function activeTransaction(kernel) {
  const tx = kernel.acceptCommand(command()).transaction_id;
  kernel.admitTransaction(tx, { operations: 'all_succeeded', qualification: 'not_required', promotion: 'not_required' });
  kernel.activateTransaction(tx);
  return tx;
}

function readyOperation(kernel, resourceId = 'resource:one', transactionId = null) {
  const tx = transactionId ?? activeTransaction(kernel);
  const operationId = kernel.createOperation(tx, { resourceId });
  kernel.transitionOperation(operationId, 'READY');
  return { tx, operationId, resourceId };
}

function acquire(kernel, { resourceId = 'resource:one', tx = null, workerId = 'worker:one', nowMs = BASE, ttlMs = 60_000 } = {}) {
  const ready = readyOperation(kernel, resourceId, tx);
  const lease = kernel.acquireLease(ready.operationId, resourceId, workerId, ttlMs, nowMs);
  return { ...ready, lease, nowMs, ttlMs };
}

function renewalRequest(ctx, { observedMs = BASE + 10_000, desiredMs = BASE + 120_000 } = {}) {
  return {
    leaseId: ctx.lease.lease_id,
    generation: ctx.lease.generation,
    operationId: ctx.operationId,
    desiredExpiresAt: iso(desiredMs),
    observedAt: iso(observedMs)
  };
}

function revocationRequest(ctx, { observedMs = BASE + 10_000, reasonCode = 'CONTROLLER_REVOKED' } = {}) {
  return {
    leaseId: ctx.lease.lease_id,
    generation: ctx.lease.generation,
    operationId: ctx.operationId,
    reasonCode,
    observedAt: iso(observedMs)
  };
}

// 1-8: current substrate / fencing regression.
test('FCLAIM-001 schema v5 remains unchanged by claim authority', () => {
  const k = new ControllerKernel(':memory:');
  assert.equal(Number(k.db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v), 5);
  k.close();
});

test('FCLAIM-002 read-only standing leaves existing lease row unchanged', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  const before = k.db.prepare('SELECT * FROM leases WHERE lease_id=?').get(ctx.lease.lease_id);
  const standing = getLeaseStanding(k, ctx.lease.lease_id);
  const after = k.db.prepare('SELECT * FROM leases WHERE lease_id=?').get(ctx.lease.lease_id);
  assert.deepEqual(after, before);
  assert.equal(standing.status, 'ACTIVE');
  k.close();
});

test('FCLAIM-003 one ACTIVE lease per resource remains enforced', () => {
  const k = new ControllerKernel(':memory:');
  const first = acquire(k);
  const second = readyOperation(k, first.resourceId, first.tx);
  assertCode(() => k.acquireLease(second.operationId, first.resourceId, 'worker:two', 60_000, BASE + 1), 'LEASE_CONFLICT');
  k.close();
});

test('FCLAIM-004 READY operation on its planned resource can acquire a claim', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  const row = getLeaseStanding(k, ctx.lease.lease_id);
  assert.equal(row.operation_id, ctx.operationId);
  assert.equal(row.resource_id, ctx.resourceId);
  assert.equal(row.current_generation, 1);
  k.close();
});

test('FCLAIM-005 conflicting live claim fails closed without generation advance', () => {
  const k = new ControllerKernel(':memory:');
  const first = acquire(k);
  const second = readyOperation(k, first.resourceId, first.tx);
  assertCode(() => k.acquireLease(second.operationId, first.resourceId, 'worker:two', 60_000, BASE + 2), 'LEASE_CONFLICT');
  assert.equal(Number(k.db.prepare('SELECT generation FROM resource_generations WHERE resource_id=?').get(first.resourceId).generation), 1);
  k.close();
});

test('FCLAIM-006 expired claim is replaced only by a fresh acquisition reconcile', () => {
  const k = new ControllerKernel(':memory:');
  const first = acquire(k, { ttlMs: 10 });
  const second = readyOperation(k, first.resourceId, first.tx);
  const replacement = k.acquireLease(second.operationId, first.resourceId, 'worker:two', 60_000, BASE + 11);
  assert.equal(k.db.prepare('SELECT status FROM leases WHERE lease_id=?').get(first.lease.lease_id).status, 'EXPIRED');
  assert.equal(getLeaseStanding(k, replacement.lease_id).status, 'ACTIVE');
  k.close();
});

test('FCLAIM-007 replacement acquisition increments generation exactly once', () => {
  const k = new ControllerKernel(':memory:');
  const first = acquire(k, { ttlMs: 10 });
  const second = readyOperation(k, first.resourceId, first.tx);
  const replacement = k.acquireLease(second.operationId, first.resourceId, 'worker:two', 60_000, BASE + 11);
  assert.equal(replacement.generation, first.lease.generation + 1);
  assert.equal(Number(k.db.prepare('SELECT generation FROM resource_generations WHERE resource_id=?').get(first.resourceId).generation), replacement.generation);
  k.close();
});

test('FCLAIM-008 old generation remains permanently fenced after replacement', () => {
  const k = new ControllerKernel(':memory:');
  const first = acquire(k, { ttlMs: 10 });
  const second = readyOperation(k, first.resourceId, first.tx);
  k.acquireLease(second.operationId, first.resourceId, 'worker:two', 60_000, BASE + 11);
  assertCode(() => k.assertWorkerLease({ leaseId: first.lease.lease_id, generation: first.lease.generation, operationId: first.operationId }, BASE + 12), 'STALE_LEASE');
  k.close();
});

// 9-13: heartbeat remains a liveness hint, not renewal authority.
test('FCLAIM-009 heartbeat updates last heartbeat observation', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  k.heartbeatLease(ctx.lease.lease_id, ctx.lease.generation, BASE + 5_000);
  assert.equal(getLeaseStanding(k, ctx.lease.lease_id).last_heartbeat_at, iso(BASE + 5_000));
  k.close();
});

test('FCLAIM-010 heartbeat does not extend expiry', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  const before = getLeaseStanding(k, ctx.lease.lease_id).expires_at;
  k.heartbeatLease(ctx.lease.lease_id, ctx.lease.generation, BASE + 5_000);
  assert.equal(getLeaseStanding(k, ctx.lease.lease_id).expires_at, before);
  k.close();
});

test('FCLAIM-011 heartbeat creates no semantic authority event', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  const before = Number(k.db.prepare('SELECT COUNT(*) n FROM events').get().n);
  k.heartbeatLease(ctx.lease.lease_id, ctx.lease.generation, BASE + 5_000);
  assert.equal(Number(k.db.prepare('SELECT COUNT(*) n FROM events').get().n), before);
  k.close();
});

test('FCLAIM-012 expired lease heartbeat is rejected', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k, { ttlMs: 10 });
  assertCode(() => k.heartbeatLease(ctx.lease.lease_id, ctx.lease.generation, BASE + 10), 'STALE_LEASE');
  k.close();
});

test('FCLAIM-013 stale-generation heartbeat is rejected', () => {
  const k = new ControllerKernel(':memory:');
  const first = acquire(k, { ttlMs: 10 });
  const second = readyOperation(k, first.resourceId, first.tx);
  k.acquireLease(second.operationId, first.resourceId, 'worker:two', 60_000, BASE + 11);
  assertCode(() => k.heartbeatLease(first.lease.lease_id, first.lease.generation, BASE + 12), 'STALE_LEASE');
  k.close();
});

// 14-25: explicit replay-stable renewal.
test('FCLAIM-014 current active lease renews to explicit desired expiry', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  const result = renewLease(k, renewalRequest(ctx));
  assert.equal(result.changed, true);
  assert.equal(result.expires_at, iso(BASE + 120_000));
  k.close();
});

test('FCLAIM-015 renewal does not change fencing generation', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  const result = renewLease(k, renewalRequest(ctx));
  assert.equal(result.generation, ctx.lease.generation);
  assert.equal(result.current_generation, ctx.lease.generation);
  k.close();
});

test('FCLAIM-016 exact renewal replay is idempotent and does not duplicate event', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  const request = renewalRequest(ctx);
  assert.equal(renewLease(k, request).changed, true);
  assert.equal(renewLease(k, request).changed, false);
  assert.equal(Number(k.db.prepare("SELECT COUNT(*) n FROM events WHERE event_type='lease.renewed'").get().n), 1);
  k.close();
});

test('FCLAIM-017 earlier desired expiry is stable no-op when current durable expiry is later', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k, { ttlMs: 180_000 });
  const result = renewLease(k, renewalRequest(ctx, { observedMs: BASE + 5_000, desiredMs: BASE + 120_000 }));
  assert.equal(result.changed, false);
  assert.equal(result.expires_at, iso(BASE + 180_000));
  k.close();
});

test('FCLAIM-018 desired expiry at or before observation is rejected', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  assertCode(() => renewLease(k, renewalRequest(ctx, { observedMs: BASE + 10_000, desiredMs: BASE + 10_000 })), 'CLAIM_RENEWAL_HORIZON_INVALID');
  k.close();
});

test('FCLAIM-019 renewal beyond portable maximum horizon is rejected', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  assertCode(() => renewLease(k, renewalRequest(ctx, { observedMs: BASE + 1_000, desiredMs: BASE + 1_000 + CLAIM_RENEWAL_MAX_HORIZON_MS + 1 })), 'CLAIM_RENEWAL_HORIZON_INVALID');
  k.close();
});

test('FCLAIM-020 expired lease cannot renew', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k, { ttlMs: 10 });
  assertCode(() => renewLease(k, renewalRequest(ctx, { observedMs: BASE + 10, desiredMs: BASE + 20_000 })), 'LEASE_EXPIRED');
  k.close();
});

test('FCLAIM-021 released lease cannot renew', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  k.releaseLease(ctx.lease.lease_id, ctx.lease.generation, BASE + 1_000);
  assertCode(() => renewLease(k, renewalRequest(ctx)), 'LEASE_NOT_ACTIVE');
  k.close();
});

test('FCLAIM-022 revoked lease cannot renew', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  revokeLease(k, revocationRequest(ctx));
  assertCode(() => renewLease(k, renewalRequest(ctx)), 'LEASE_NOT_ACTIVE');
  k.close();
});

test('FCLAIM-023 stale generation cannot renew', () => {
  const k = new ControllerKernel(':memory:');
  const first = acquire(k, { ttlMs: 10 });
  const second = readyOperation(k, first.resourceId, first.tx);
  k.acquireLease(second.operationId, first.resourceId, 'worker:two', 60_000, BASE + 11);
  assertCode(() => renewLease(k, renewalRequest(first, { observedMs: BASE + 5, desiredMs: BASE + 5_000 })), 'STALE_LEASE');
  k.close();
});

test('FCLAIM-024 wrong operation binding cannot renew', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  const other = readyOperation(k, 'resource:two', ctx.tx);
  const request = { ...renewalRequest(ctx), operationId: other.operationId };
  assertCode(() => renewLease(k, request), 'LEASE_OPERATION_MISMATCH');
  k.close();
});

test('FCLAIM-025 renewal returns reread durable post-commit expiry and heartbeat', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  const request = renewalRequest(ctx, { observedMs: BASE + 20_000, desiredMs: BASE + 150_000 });
  const result = renewLease(k, request);
  const durable = getLeaseStanding(k, ctx.lease.lease_id);
  assert.equal(result.expires_at, durable.expires_at);
  assert.equal(result.last_heartbeat_at, durable.last_heartbeat_at);
  assert.equal(durable.last_heartbeat_at, request.observedAt);
  k.close();
});

// 26-33: revocation and terminal fencing.
test('FCLAIM-026 current active lease can be revoked with bounded reason code', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  const result = revokeLease(k, revocationRequest(ctx));
  assert.equal(result.changed, true);
  assert.equal(result.status, 'REVOKED');
  k.close();
});

test('FCLAIM-027 exact revocation replay is idempotent and writes one event', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  const request = revocationRequest(ctx);
  assert.equal(revokeLease(k, request).changed, true);
  assert.equal(revokeLease(k, request).changed, false);
  assert.equal(Number(k.db.prepare("SELECT COUNT(*) n FROM events WHERE event_type='lease.revoked'").get().n), 1);
  k.close();
});

test('FCLAIM-028 changed revocation reason conflicts with immutable replay semantics', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  revokeLease(k, revocationRequest(ctx, { reasonCode: 'CONTROLLER_REVOKED' }));
  assertCode(() => revokeLease(k, revocationRequest(ctx, { reasonCode: 'POLICY_REVOKED' })), 'IDEMPOTENCY_CONFLICT');
  k.close();
});

test('FCLAIM-029 stale generation cannot revoke a current holder', () => {
  const k = new ControllerKernel(':memory:');
  const first = acquire(k, { ttlMs: 10 });
  const second = readyOperation(k, first.resourceId, first.tx);
  k.acquireLease(second.operationId, first.resourceId, 'worker:two', 60_000, BASE + 11);
  assertCode(() => revokeLease(k, revocationRequest(first, { observedMs: BASE + 5 })), 'STALE_LEASE');
  k.close();
});

test('FCLAIM-030 revoked lease cannot start an operation', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  revokeLease(k, revocationRequest(ctx));
  assertCode(() => k.startLeasedOperation({ leaseId: ctx.lease.lease_id, generation: ctx.lease.generation, operationId: ctx.operationId, nowMs: BASE + 11_000 }), 'STALE_LEASE');
  k.close();
});

test('FCLAIM-031 revoked lease cannot submit a worker result', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  k.startLeasedOperation({ leaseId: ctx.lease.lease_id, generation: ctx.lease.generation, operationId: ctx.operationId, nowMs: BASE + 1_000 });
  revokeLease(k, revocationRequest(ctx, { observedMs: BASE + 2_000 }));
  assertCode(() => k.submitWorkerResult({ leaseId: ctx.lease.lease_id, generation: ctx.lease.generation, operationId: ctx.operationId, result: 'SUCCEEDED', nowMs: BASE + 3_000 }), 'STALE_LEASE');
  k.close();
});

test('FCLAIM-032 revoked lease cannot authorize external-effect dispatch', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  k.startLeasedOperation({ leaseId: ctx.lease.lease_id, generation: ctx.lease.generation, operationId: ctx.operationId, nowMs: BASE + 1_000 });
  const effect = prepareExternalEffect(k, {
    transaction_id: ctx.tx,
    operation_id: ctx.operationId,
    provider: 'qualified-test-provider',
    effect_type: 'test.write',
    target_key: 'target:one',
    idempotency_key: 'claim-test-effect-1',
    request: { value: 1 }
  });
  revokeLease(k, revocationRequest(ctx, { observedMs: BASE + 2_000 }));
  assertCode(() => authorizeExternalEffectDispatch(k, effect.effect_id, ctx.lease.lease_id, BASE + 3_000), 'STALE_LEASE');
  k.close();
});

test('FCLAIM-033 released lease remains terminal and cannot reactivate through liveness or renewal', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k);
  k.releaseLease(ctx.lease.lease_id, ctx.lease.generation, BASE + 1_000);
  assertCode(() => k.heartbeatLease(ctx.lease.lease_id, ctx.lease.generation, BASE + 2_000), 'STALE_LEASE');
  assertCode(() => renewLease(k, renewalRequest(ctx)), 'LEASE_NOT_ACTIVE');
  assert.equal(getLeaseStanding(k, ctx.lease.lease_id).status, 'RELEASED');
  k.close();
});

// 34-40: restart, races, replay and ownership/source constraints.
test('FCLAIM-034 same-database restart preserves renewed expiry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'controller-claim-renew-'));
  const db = join(dir, 'controller.sqlite');
  let k = new ControllerKernel(db);
  const ctx = acquire(k);
  const request = renewalRequest(ctx, { observedMs: BASE + 20_000, desiredMs: BASE + 150_000 });
  renewLease(k, request);
  k.close();
  k = new ControllerKernel(db);
  assert.equal(getLeaseStanding(k, ctx.lease.lease_id).expires_at, request.desiredExpiresAt);
  k.close();
  rmSync(dir, { recursive: true, force: true });
});

test('FCLAIM-035 same-database restart preserves revocation and immutable event evidence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'controller-claim-revoke-'));
  const db = join(dir, 'controller.sqlite');
  let k = new ControllerKernel(db);
  const ctx = acquire(k);
  revokeLease(k, revocationRequest(ctx, { reasonCode: 'CONTROLLER_REVOKED' }));
  k.close();
  k = new ControllerKernel(db);
  assert.equal(getLeaseStanding(k, ctx.lease.lease_id).status, 'REVOKED');
  const event = k.db.prepare("SELECT data_json FROM events WHERE event_type='lease.revoked'").get();
  assert.equal(JSON.parse(event.data_json).reason_code, 'CONTROLLER_REVOKED');
  k.close();
  rmSync(dir, { recursive: true, force: true });
});

test('FCLAIM-036 competing acquisitions converge to one current holder and one generation advance', () => {
  const k = new ControllerKernel(':memory:');
  const tx = activeTransaction(k);
  const a = readyOperation(k, 'resource:race', tx);
  const b = readyOperation(k, 'resource:race', tx);
  const first = k.acquireLease(a.operationId, a.resourceId, 'worker:a', 60_000, BASE);
  assertCode(() => k.acquireLease(b.operationId, b.resourceId, 'worker:b', 60_000, BASE), 'LEASE_CONFLICT');
  assert.equal(Number(k.db.prepare("SELECT COUNT(*) n FROM leases WHERE resource_id='resource:race' AND status='ACTIVE'").get().n), 1);
  assert.equal(Number(k.db.prepare("SELECT generation FROM resource_generations WHERE resource_id='resource:race'").get().generation), first.generation);
  k.close();
});

test('FCLAIM-037 renewal racing replacement cannot resurrect old generation', () => {
  const k = new ControllerKernel(':memory:');
  const first = acquire(k, { resourceId: 'resource:race-replace', ttlMs: 10 });
  const second = readyOperation(k, first.resourceId, first.tx);
  k.acquireLease(second.operationId, first.resourceId, 'worker:new', 60_000, BASE + 11);
  assertCode(() => renewLease(k, renewalRequest(first, { observedMs: BASE + 5, desiredMs: BASE + 5_000 })), 'STALE_LEASE');
  assert.equal(getLeaseStanding(k, first.lease.lease_id).status, 'EXPIRED');
  k.close();
});

test('FCLAIM-038 renewal racing revocation converges to revoked terminal standing', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k, { resourceId: 'resource:race-revoke' });
  renewLease(k, renewalRequest(ctx, { observedMs: BASE + 5_000, desiredMs: BASE + 120_000 }));
  revokeLease(k, revocationRequest(ctx, { observedMs: BASE + 6_000 }));
  assertCode(() => renewLease(k, renewalRequest(ctx, { observedMs: BASE + 7_000, desiredMs: BASE + 140_000 })), 'LEASE_NOT_ACTIVE');
  assert.equal(getLeaseStanding(k, ctx.lease.lease_id).status, 'REVOKED');
  k.close();
});

test('FCLAIM-039 lost-response renewal replay cannot mint generation or duplicate authority event', () => {
  const k = new ControllerKernel(':memory:');
  const ctx = acquire(k, { resourceId: 'resource:lost-response' });
  const request = renewalRequest(ctx, { observedMs: BASE + 5_000, desiredMs: BASE + 150_000 });
  renewLease(k, request);
  const generationAfterCommit = getLeaseStanding(k, ctx.lease.lease_id).current_generation;
  renewLease(k, request);
  assert.equal(getLeaseStanding(k, ctx.lease.lease_id).current_generation, generationAfterCommit);
  assert.equal(Number(k.db.prepare("SELECT COUNT(*) n FROM events WHERE event_type='lease.renewed'").get().n), 1);
  k.close();
});

test('FCLAIM-040 claim authority source contains no scheduler, provider, network, process-spawn or peer-domain import', () => {
  const source = readFileSync(new URL('../src/durable-claim-authority.js', import.meta.url), 'utf8');
  const imports = source.split('\n').filter((line) => line.startsWith('import ')).join('\n');
  assert.doesNotMatch(imports, /node:http|node:https|child_process|scheduler|provider|book|learning|documents|programming/i);
  assert.match(imports, /canonical\.js/);
  assert.match(imports, /errors\.js/);
});
