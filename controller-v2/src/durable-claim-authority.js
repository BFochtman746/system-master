import { isRfc3339, isUuidV7 } from './canonical.js';
import { ControllerError } from './errors.js';

export const CLAIM_RENEWAL_MAX_HORIZON_MS = 300_000;

const REASON_CODE = /^[A-Z][A-Z0-9._:-]{0,127}$/;

function claimError(code, message, details = {}) {
  return new ControllerError(code, message, details);
}

function exactKeys(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw claimError('CLAIM_REQUEST_INVALID', 'claim request object required');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw claimError('CLAIM_REQUEST_INVALID', `unknown field ${key}`);
  for (const key of required) if (!(key in value)) throw claimError('CLAIM_REQUEST_INVALID', `required field ${key} missing`);
}

function requireUuid(value, name) {
  if (!isUuidV7(value)) throw claimError('CLAIM_REQUEST_INVALID', `${name} must be UUIDv7`);
  return value;
}

function requireGeneration(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw claimError('CLAIM_REQUEST_INVALID', 'generation must be a positive safe integer');
  return value;
}

function timestampMs(value, name) {
  if (!isRfc3339(value)) throw claimError('CLAIM_REQUEST_INVALID', `${name} must use the Controller UTC timestamp profile`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw claimError('CLAIM_REQUEST_INVALID', `${name} is outside supported time range`);
  return parsed;
}

function readLeaseRow(kernel, leaseId) {
  if (!kernel?.db || typeof kernel.atomic !== 'function') throw claimError('CLAIM_KERNEL_INVALID', 'open ControllerKernel required');
  const lease = kernel.db.prepare('SELECT * FROM leases WHERE lease_id=?').get(leaseId);
  if (!lease) throw claimError('NOT_FOUND', 'lease not found');
  const current = kernel.db.prepare('SELECT generation FROM resource_generations WHERE resource_id=?').get(lease.resource_id);
  return { lease, currentGeneration: current ? Number(current.generation) : null };
}

function standingFrom(row, currentGeneration) {
  return Object.freeze({
    lease_id: row.lease_id,
    operation_id: row.operation_id,
    resource_id: row.resource_id,
    worker_id: row.worker_id,
    generation: Number(row.generation),
    current_generation: currentGeneration,
    status: row.status,
    issued_at: row.issued_at,
    expires_at: row.expires_at,
    last_heartbeat_at: row.last_heartbeat_at
  });
}

function assertBinding(lease, currentGeneration, { operationId, generation }) {
  if (lease.operation_id !== operationId) throw claimError('LEASE_OPERATION_MISMATCH', 'lease belongs to another operation');
  if (Number(lease.generation) !== generation || currentGeneration !== generation) throw claimError('STALE_LEASE', 'lease generation is no longer current');
}

function assertMutationObservation(lease, observedMs) {
  const issuedMs = Date.parse(lease.issued_at);
  const heartbeatMs = Date.parse(lease.last_heartbeat_at);
  if (observedMs < issuedMs || observedMs < heartbeatMs) throw claimError('CLAIM_STALE_OBSERVATION', 'observation predates durable lease standing');
}

function operationStream(operationId) {
  return `operation:${operationId}`;
}

function revocationEvidence(kernel, leaseId, operationId) {
  const rows = kernel.db.prepare("SELECT data_json FROM events WHERE stream_id=? AND event_type='lease.revoked' ORDER BY stream_version").all(operationStream(operationId));
  const matches = [];
  for (const row of rows) {
    let data;
    try { data = JSON.parse(row.data_json); }
    catch { throw claimError('CLAIM_EVIDENCE_INVALID', 'lease revocation event is not valid JSON'); }
    if (data?.lease_id === leaseId) matches.push(data);
  }
  if (matches.length > 1) throw claimError('CLAIM_EVIDENCE_CONFLICT', 'multiple revocation events exist for one lease');
  return matches[0] ?? null;
}

export function getLeaseStanding(kernel, leaseId) {
  requireUuid(leaseId, 'leaseId');
  const { lease, currentGeneration } = readLeaseRow(kernel, leaseId);
  return standingFrom(lease, currentGeneration);
}

export function renewLease(kernel, request) {
  exactKeys(request, ['leaseId', 'generation', 'operationId', 'desiredExpiresAt', 'observedAt']);
  const leaseId = requireUuid(request.leaseId, 'leaseId');
  const operationId = requireUuid(request.operationId, 'operationId');
  const generation = requireGeneration(request.generation);
  const observedMs = timestampMs(request.observedAt, 'observedAt');
  const desiredMs = timestampMs(request.desiredExpiresAt, 'desiredExpiresAt');
  const horizon = desiredMs - observedMs;
  if (horizon <= 0 || horizon > CLAIM_RENEWAL_MAX_HORIZON_MS) throw claimError('CLAIM_RENEWAL_HORIZON_INVALID', 'desired expiry must be after observation and within the portable renewal horizon');

  let changed = false;
  kernel.atomic(() => {
    const { lease, currentGeneration } = readLeaseRow(kernel, leaseId);
    assertBinding(lease, currentGeneration, { operationId, generation });
    if (lease.status !== 'ACTIVE') throw claimError('LEASE_NOT_ACTIVE', `cannot renew ${lease.status} lease`);

    const currentExpiryMs = Date.parse(lease.expires_at);
    if (!Number.isFinite(currentExpiryMs)) throw claimError('CLAIM_EVIDENCE_INVALID', 'durable lease expiry is invalid');

    // Desired state is already satisfied. This is the lost-response replay path.
    // It intentionally precedes stale-observation checks so a later heartbeat does
    // not make an already-committed exact renewal non-idempotent.
    if (currentExpiryMs >= desiredMs) return;

    assertMutationObservation(lease, observedMs);
    if (currentExpiryMs <= observedMs) throw claimError('LEASE_EXPIRED', 'expired lease cannot be renewed');

    kernel.db.prepare('UPDATE leases SET expires_at=?,last_heartbeat_at=? WHERE lease_id=? AND status=\'ACTIVE\' AND generation=?').run(request.desiredExpiresAt, request.observedAt, leaseId, generation);
    const eventAt = new Date().toISOString();
    kernel.appendEvent(
      operationStream(operationId),
      kernel.currentStreamVersion(operationStream(operationId)),
      'lease.renewed',
      {
        lease_id: leaseId,
        operation_id: operationId,
        resource_id: lease.resource_id,
        generation,
        previous_expires_at: lease.expires_at,
        expires_at: request.desiredExpiresAt,
        observed_at: request.observedAt
      },
      eventAt
    );
    changed = true;
  });

  // Reread after commit. The returned row is observed durable standing rather
  // than an assumed read-after-write result.
  const standing = getLeaseStanding(kernel, leaseId);
  return Object.freeze({ ...standing, changed });
}

export function revokeLease(kernel, request) {
  exactKeys(request, ['leaseId', 'generation', 'operationId', 'reasonCode', 'observedAt']);
  const leaseId = requireUuid(request.leaseId, 'leaseId');
  const operationId = requireUuid(request.operationId, 'operationId');
  const generation = requireGeneration(request.generation);
  if (typeof request.reasonCode !== 'string' || !REASON_CODE.test(request.reasonCode)) throw claimError('CLAIM_REASON_INVALID', 'reasonCode must be a bounded Controller reason code');
  const observedMs = timestampMs(request.observedAt, 'observedAt');

  let changed = false;
  kernel.atomic(() => {
    const { lease, currentGeneration } = readLeaseRow(kernel, leaseId);
    assertBinding(lease, currentGeneration, { operationId, generation });

    if (lease.status === 'REVOKED') {
      const evidence = revocationEvidence(kernel, leaseId, operationId);
      if (!evidence) throw claimError('CLAIM_EVIDENCE_MISSING', 'revoked lease lacks durable revocation evidence');
      if (evidence.operation_id !== operationId || Number(evidence.generation) !== generation || evidence.reason_code !== request.reasonCode) {
        throw claimError('IDEMPOTENCY_CONFLICT', 'revocation replay changes immutable semantics');
      }
      return;
    }
    if (lease.status !== 'ACTIVE') throw claimError('LEASE_NOT_ACTIVE', `cannot revoke ${lease.status} lease`);

    assertMutationObservation(lease, observedMs);
    if (Date.parse(lease.expires_at) <= observedMs) throw claimError('LEASE_EXPIRED', 'expired lease cannot be newly revoked');

    kernel.db.prepare("UPDATE leases SET status='REVOKED' WHERE lease_id=? AND status='ACTIVE' AND generation=?").run(leaseId, generation);
    const eventAt = new Date().toISOString();
    kernel.appendEvent(
      operationStream(operationId),
      kernel.currentStreamVersion(operationStream(operationId)),
      'lease.revoked',
      {
        lease_id: leaseId,
        operation_id: operationId,
        resource_id: lease.resource_id,
        generation,
        reason_code: request.reasonCode,
        observed_at: request.observedAt
      },
      eventAt
    );
    changed = true;
  });

  const standing = getLeaseStanding(kernel, leaseId);
  return Object.freeze({ ...standing, changed });
}
