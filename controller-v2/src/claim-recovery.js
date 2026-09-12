import { isRfc3339, isUuidV7 } from './canonical.js';
import { ControllerError } from './errors.js';

const BOUNDED_ID = /^[A-Za-z0-9._:/-]{1,256}$/;
const REASON_CODE = /^[A-Z][A-Z0-9._:-]{0,127}$/;
const CLAIM_EVENT_TYPES = new Set(['lease.granted', 'lease.renewed', 'lease.revoked', 'lease.released']);

function recoveryError(message) {
  return new ControllerError('RECOVERY_CLAIM_INVALID', message);
}

function boundedId(value, name) {
  if (typeof value !== 'string' || !BOUNDED_ID.test(value)) throw recoveryError(`${name} is invalid`);
  return value;
}

function uuid(value, name) {
  if (!isUuidV7(value)) throw recoveryError(`${name} must be UUIDv7`);
  return value;
}

function generation(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw recoveryError('claim generation must be a positive safe integer');
  return n;
}

function time(value, name) {
  if (!isRfc3339(value)) throw recoveryError(`${name} must use the Controller timestamp profile`);
  const n = Date.parse(value);
  if (!Number.isFinite(n)) throw recoveryError(`${name} is outside supported time range`);
  return n;
}

function immutableBinding(claim, data) {
  if (data.lease_id !== claim.lease_id || data.operation_id !== claim.operation_id || data.resource_id !== claim.resource_id || generation(data.generation) !== claim.generation) {
    throw recoveryError('claim event changes immutable lease binding');
  }
}

function terminal(claim) {
  return claim.terminal_status === 'RELEASED' || claim.terminal_status === 'REVOKED';
}

function sortedClaimEvents(events) {
  const streams = new Map();
  for (const event of events) {
    if (!CLAIM_EVENT_TYPES.has(event.event_type)) continue;
    if (!streams.has(event.stream_id)) streams.set(event.stream_id, []);
    streams.get(event.stream_id).push(event);
  }
  const ordered = [];
  for (const list of streams.values()) {
    list.sort((a, b) => Number(a.stream_version) - Number(b.stream_version));
    ordered.push(...list);
  }
  return ordered;
}

export function projectClaimHistory(events, baseState) {
  if (!Array.isArray(events)) throw recoveryError('events must be an array');
  if (!baseState?.operations || !baseState?.resource_generations) throw recoveryError('base semantic state required');

  const claims = {};
  const resourcePairs = new Map();

  for (const event of sortedClaimEvents(events)) {
    const data = event.data ?? {};

    if (event.event_type === 'lease.granted') {
      const leaseId = uuid(data.lease_id, 'lease_id');
      const operationId = uuid(data.operation_id, 'operation_id');
      const resourceId = boundedId(data.resource_id, 'resource_id');
      const workerId = boundedId(data.worker_id, 'worker_id');
      const gen = generation(data.generation);
      const issuedMs = time(event.occurred_at, 'lease grant occurred_at');
      const expiryMs = time(data.expires_at, 'lease grant expires_at');
      if (expiryMs <= issuedMs) throw recoveryError('lease grant expiry must be after issuance');
      if (claims[leaseId]) throw recoveryError('lease_id reused in durable claim history');

      const op = baseState.operations[operationId];
      if (!op) throw recoveryError('lease grant references missing operation');
      if (op.resource_id !== resourceId) throw recoveryError('lease grant resource differs from planned operation resource');

      const pair = `${resourceId}\u0000${gen}`;
      if (resourcePairs.has(pair)) throw recoveryError('duplicate resource generation in claim history');
      resourcePairs.set(pair, leaseId);

      claims[leaseId] = {
        lease_id: leaseId,
        operation_id: operationId,
        resource_id: resourceId,
        worker_id: workerId,
        generation: gen,
        issued_at: event.occurred_at,
        expires_at: data.expires_at,
        last_observed_at: event.occurred_at,
        terminal_status: null,
        revocation_reason_code: null,
        superseded_by_generation: null
      };
      continue;
    }

    const leaseId = uuid(data.lease_id, 'lease_id');
    const claim = claims[leaseId];
    if (!claim) throw recoveryError(`${event.event_type} precedes lease.granted`);
    immutableBinding(claim, data);

    if (event.event_type === 'lease.renewed') {
      if (terminal(claim)) throw recoveryError('terminal lease cannot be renewed in claim history');
      if (data.previous_expires_at !== claim.expires_at) throw recoveryError('renewal previous expiry does not match projected lease expiry');
      const previousMs = time(claim.expires_at, 'projected expires_at');
      const nextMs = time(data.expires_at, 'renewed expires_at');
      const observedMs = time(data.observed_at, 'renewed observed_at');
      const lastMs = time(claim.last_observed_at, 'projected last_observed_at');
      if (nextMs <= previousMs) throw recoveryError('renewal expiry must increase');
      if (observedMs < Date.parse(claim.issued_at) || observedMs < lastMs) throw recoveryError('renewal observation is stale/out of order');
      if (nextMs <= observedMs) throw recoveryError('renewed expiry must be after observation');
      claim.expires_at = data.expires_at;
      claim.last_observed_at = data.observed_at;
      continue;
    }

    if (event.event_type === 'lease.revoked') {
      if (terminal(claim)) throw recoveryError('terminal lease cannot be revoked again in claim history');
      if (typeof data.reason_code !== 'string' || !REASON_CODE.test(data.reason_code)) throw recoveryError('revocation reason code is invalid');
      const observedMs = time(data.observed_at, 'revoked observed_at');
      const lastMs = time(claim.last_observed_at, 'projected last_observed_at');
      if (observedMs < Date.parse(claim.issued_at) || observedMs < lastMs) throw recoveryError('revocation observation is stale/out of order');
      claim.last_observed_at = data.observed_at;
      claim.terminal_status = 'REVOKED';
      claim.revocation_reason_code = data.reason_code;
      continue;
    }

    if (event.event_type === 'lease.released') {
      if (terminal(claim)) throw recoveryError('terminal lease cannot be released again in claim history');
      const observedMs = time(event.occurred_at, 'release occurred_at');
      const lastMs = time(claim.last_observed_at, 'projected last_observed_at');
      if (observedMs < Date.parse(claim.issued_at) || observedMs < lastMs) throw recoveryError('release observation is stale/out of order');
      claim.last_observed_at = event.occurred_at;
      claim.terminal_status = 'RELEASED';
    }
  }

  const byResource = new Map();
  for (const claim of Object.values(claims)) {
    if (!byResource.has(claim.resource_id)) byResource.set(claim.resource_id, []);
    byResource.get(claim.resource_id).push(claim);
  }

  const generations = {};
  for (const [resourceId, list] of byResource.entries()) {
    list.sort((a, b) => a.generation - b.generation);
    for (let index = 0; index < list.length; index += 1) {
      const expected = index + 1;
      if (list[index].generation !== expected) throw recoveryError(`claim generation gap for resource ${resourceId}`);
    }
    const highest = list.at(-1).generation;
    generations[resourceId] = highest;
    for (const claim of list) if (claim.generation < highest) claim.superseded_by_generation = highest;
  }

  for (const [resourceId, baseGeneration] of Object.entries(baseState.resource_generations)) {
    if (!Object.hasOwn(generations, resourceId) || generations[resourceId] !== Number(baseGeneration)) {
      throw recoveryError('claim history disagrees with base resource generation projection');
    }
  }

  return Object.freeze({
    claim_history: Object.freeze(Object.fromEntries(Object.entries(claims).map(([key, value]) => [key, Object.freeze({ ...value })]))),
    resource_generations: Object.freeze({ ...generations })
  });
}
