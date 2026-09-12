import { canonicalize, sha256, uuidv7 } from './canonical.js';
import { ControllerError } from './errors.js';

function requireText(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new ControllerError('EXTERNAL_EFFECT_SCHEMA_INVALID', `${name} required`);
  return value;
}

function effectStream(effectId) { return `external-effect:${effectId}`; }

function rowToEffect(row) {
  if (!row) return null;
  return {
    effect_id: row.effect_id,
    transaction_id: row.transaction_id,
    operation_id: row.operation_id,
    provider: row.provider,
    effect_type: row.effect_type,
    target_key: row.target_key,
    idempotency_key: row.idempotency_key,
    request_digest: row.request_digest,
    expected_remote_version: row.expected_remote_version,
    state: row.state,
    terminal_evidence: row.terminal_evidence_json ? JSON.parse(row.terminal_evidence_json) : null,
    last_error_code: row.last_error_code,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function validateEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw new ControllerError('EXTERNAL_EFFECT_EVIDENCE_REQUIRED', 'structured observation evidence required');
  requireText(evidence.kind, 'evidence.kind');
  requireText(evidence.reference, 'evidence.reference');
  const allowed = new Set(['kind','reference','digest','observed_version','detail_code']);
  for (const key of Object.keys(evidence)) if (!allowed.has(key)) throw new ControllerError('EXTERNAL_EFFECT_EVIDENCE_INVALID', `unsupported evidence field ${key}`);
  for (const key of ['digest','observed_version','detail_code']) if (key in evidence && evidence[key] !== null && typeof evidence[key] !== 'string') throw new ControllerError('EXTERNAL_EFFECT_EVIDENCE_INVALID', `${key} must be string or null`);
  return structuredClone(evidence);
}

export function prepareExternalEffect(kernel, spec) {
  if (!kernel?.db || typeof kernel.atomic !== 'function') throw new ControllerError('EXTERNAL_EFFECT_KERNEL_INVALID', 'open ControllerKernel required');
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new ControllerError('EXTERNAL_EFFECT_SCHEMA_INVALID', 'effect spec required');
  const transactionId = requireText(spec.transaction_id, 'transaction_id');
  const operationId = requireText(spec.operation_id, 'operation_id');
  const provider = requireText(spec.provider, 'provider');
  const effectType = requireText(spec.effect_type, 'effect_type');
  const targetKey = requireText(spec.target_key, 'target_key');
  const idempotencyKey = requireText(spec.idempotency_key, 'idempotency_key');
  if (!('request' in spec) || spec.request === undefined) throw new ControllerError('EXTERNAL_EFFECT_SCHEMA_INVALID', 'request required');
  const requestDigest = sha256(spec.request);
  const expectedRemoteVersion = spec.expected_remote_version ?? null;
  if (expectedRemoteVersion !== null && typeof expectedRemoteVersion !== 'string') throw new ControllerError('EXTERNAL_EFFECT_SCHEMA_INVALID', 'expected_remote_version must be string or null');

  return kernel.atomic(() => {
    const operation = kernel.db.prepare('SELECT transaction_id FROM operations WHERE operation_id=?').get(operationId);
    if (!operation || operation.transaction_id !== transactionId) throw new ControllerError('EXTERNAL_EFFECT_OPERATION_MISMATCH', 'operation must exist and belong to transaction');
    const prior = kernel.db.prepare('SELECT * FROM external_effects WHERE provider=? AND idempotency_key=?').get(provider, idempotencyKey);
    if (prior) {
      const expected = [transactionId,operationId,provider,effectType,targetKey,requestDigest,expectedRemoteVersion];
      const actual = [prior.transaction_id,prior.operation_id,prior.provider,prior.effect_type,prior.target_key,prior.request_digest,prior.expected_remote_version];
      if (canonicalize(actual) !== canonicalize(expected)) throw new ControllerError('IDEMPOTENCY_CONFLICT', 'external effect idempotency key reused with different semantics');
      return { effect_id: prior.effect_id, duplicate: true, request_digest: requestDigest };
    }
    const effectId = uuidv7();
    const now = new Date().toISOString();
    kernel.db.prepare(`INSERT INTO external_effects(effect_id,transaction_id,operation_id,provider,effect_type,target_key,idempotency_key,request_digest,expected_remote_version,state,terminal_evidence_json,last_error_code,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'PREPARED',NULL,NULL,?,?)`).run(effectId,transactionId,operationId,provider,effectType,targetKey,idempotencyKey,requestDigest,expectedRemoteVersion,now,now);
    kernel.appendEvent(effectStream(effectId),0,'external-effect.prepared',{
      effect_id:effectId,transaction_id:transactionId,operation_id:operationId,provider,effect_type:effectType,target_key:targetKey,idempotency_key:idempotencyKey,request_digest:requestDigest,expected_remote_version:expectedRemoteVersion,state:'PREPARED'
    },now);
    return { effect_id: effectId, duplicate: false, request_digest: requestDigest };
  });
}

export function getExternalEffect(kernel, effectId) {
  const row = kernel.db.prepare('SELECT * FROM external_effects WHERE effect_id=?').get(effectId);
  if (!row) throw new ControllerError('NOT_FOUND', 'external effect not found');
  return rowToEffect(row);
}

export function authorizeExternalEffectDispatch(kernel, effectId, leaseId, nowMs = Date.now()) {
  requireText(effectId, 'effect_id');
  requireText(leaseId, 'lease_id');
  return kernel.atomic(() => {
    const effect = kernel.db.prepare('SELECT * FROM external_effects WHERE effect_id=?').get(effectId);
    if (!effect) throw new ControllerError('NOT_FOUND', 'external effect not found');
    if (effect.state !== 'PREPARED') throw new ControllerError('EXTERNAL_EFFECT_DISPATCH_STATE_INVALID', 'dispatch requires PREPARED effect');
    const op = kernel.db.prepare('SELECT * FROM operations WHERE operation_id=?').get(effect.operation_id);
    if (!op || op.state !== 'RUNNING') throw new ControllerError('EXTERNAL_EFFECT_OPERATION_NOT_RUNNING', 'dispatch requires RUNNING operation');
    const lease = kernel.db.prepare('SELECT * FROM leases WHERE lease_id=?').get(leaseId);
    if (!lease) throw new ControllerError('NOT_FOUND', 'lease not found');
    kernel.assertWorkerLease({leaseId,generation:Number(lease.generation),operationId:effect.operation_id},nowMs);
    const currentGeneration = kernel.db.prepare('SELECT generation FROM resource_generations WHERE resource_id=?').get(lease.resource_id);
    if (!currentGeneration || Number(currentGeneration.generation) !== Number(lease.generation)) throw new ControllerError('STALE_LEASE', 'external effect lease generation is stale');
    const prior = kernel.db.prepare('SELECT attempt_id FROM external_effect_attempts WHERE effect_id=?').get(effectId);
    if (prior) throw new ControllerError('EXTERNAL_EFFECT_REDISPATCH_FORBIDDEN', 'portable v1 permits only one physical dispatch attempt');
    const attemptId = uuidv7(nowMs);
    const now = new Date(nowMs).toISOString();
    kernel.db.prepare('INSERT INTO external_effect_attempts(attempt_id,effect_id,attempt_number,lease_id,resource_id,generation,authorized_at) VALUES (?,?,1,?,?,?,?)').run(attemptId,effectId,leaseId,lease.resource_id,Number(lease.generation),now);
    kernel.db.prepare("UPDATE external_effects SET state='UNKNOWN',last_error_code=NULL,updated_at=? WHERE effect_id=?").run(now,effectId);
    const event = kernel.appendEvent(effectStream(effectId),kernel.currentStreamVersion(effectStream(effectId)),'external-effect.dispatch-authorized',{
      attempt_id:attemptId,effect_id:effectId,attempt_number:1,lease_id:leaseId,resource_id:lease.resource_id,generation:Number(lease.generation),state:'UNKNOWN'
    },now);
    return {attempt_id:attemptId,effect_id:effectId,attempt_number:1,lease_id:leaseId,resource_id:lease.resource_id,generation:Number(lease.generation),authorized_at:now,dispatch_event_id:event.event_id,durability_status:'PENDING'};
  });
}

export function getExternalEffectDispatchPermit(kernel, effectId, leaseId, nowMs = Date.now()) {
  requireText(effectId, 'effect_id');
  requireText(leaseId, 'lease_id');
  const effect = kernel.db.prepare('SELECT * FROM external_effects WHERE effect_id=?').get(effectId);
  if (!effect) throw new ControllerError('NOT_FOUND', 'external effect not found');
  if (effect.state !== 'UNKNOWN') throw new ControllerError('EXTERNAL_EFFECT_DISPATCH_PERMIT_STATE_INVALID', 'dispatch permit requires UNKNOWN effect after local authorization');
  const attempt = kernel.db.prepare('SELECT * FROM external_effect_attempts WHERE effect_id=? ORDER BY attempt_number').get(effectId);
  if (!attempt || Number(attempt.attempt_number) !== 1) throw new ControllerError('EXTERNAL_EFFECT_DISPATCH_PERMIT_MISSING', 'exactly one dispatch attempt required');
  if (attempt.lease_id !== leaseId) throw new ControllerError('STALE_LEASE', 'dispatch permit requires the authorizing lease');
  kernel.assertWorkerLease({leaseId,generation:Number(attempt.generation),operationId:effect.operation_id},nowMs);
  const currentGeneration = kernel.db.prepare('SELECT generation FROM resource_generations WHERE resource_id=?').get(attempt.resource_id);
  if (!currentGeneration || Number(currentGeneration.generation) !== Number(attempt.generation)) throw new ControllerError('STALE_LEASE', 'dispatch permit lease generation is stale');
  const row = kernel.db.prepare(`
    SELECT e.event_id,e.data_json,o.status
      FROM events e
      JOIN outbox o ON o.event_id=e.event_id
     WHERE e.stream_id=? AND e.event_type='external-effect.dispatch-authorized'
     ORDER BY e.stream_version DESC LIMIT 1
  `).get(effectStream(effectId));
  if (!row) throw new ControllerError('EXTERNAL_EFFECT_DISPATCH_PERMIT_MISSING', 'dispatch authorization event missing');
  const data = JSON.parse(row.data_json);
  if (data.effect_id !== effectId || data.attempt_id !== attempt.attempt_id || data.lease_id !== attempt.lease_id || data.resource_id !== attempt.resource_id || Number(data.generation) !== Number(attempt.generation)) {
    throw new ControllerError('EXTERNAL_EFFECT_DISPATCH_PERMIT_MISMATCH', 'dispatch event and immutable attempt evidence disagree');
  }
  if (row.status !== 'SEALED') throw new ControllerError('DURABILITY_BARRIER_NOT_MET', 'dispatch authorization is not durably sealed');
  return Object.freeze({
    effect_id:effectId,
    attempt_id:attempt.attempt_id,
    lease_id:attempt.lease_id,
    resource_id:attempt.resource_id,
    generation:Number(attempt.generation),
    dispatch_event_id:row.event_id,
    durability_status:'SEALED'
  });
}

export function beginExternalEffectReconciliation(kernel, effectId) {
  return kernel.atomic(() => {
    const effect = kernel.db.prepare('SELECT * FROM external_effects WHERE effect_id=?').get(effectId);
    if (!effect) throw new ControllerError('NOT_FOUND', 'external effect not found');
    if (effect.state === 'RECONCILING') return 'RECONCILING';
    if (effect.state !== 'UNKNOWN') throw new ControllerError('EXTERNAL_EFFECT_RECONCILIATION_STATE_INVALID', 'only UNKNOWN effects may begin reconciliation');
    const now = new Date().toISOString();
    kernel.db.prepare("UPDATE external_effects SET state='RECONCILING',updated_at=? WHERE effect_id=?").run(now,effectId);
    kernel.appendEvent(effectStream(effectId),kernel.currentStreamVersion(effectStream(effectId)),'external-effect.reconciliation-started',{effect_id:effectId,state:'RECONCILING'},now);
    return 'RECONCILING';
  });
}

export function resolveExternalEffect(kernel, effectId, outcome) {
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) throw new ControllerError('EXTERNAL_EFFECT_OUTCOME_INVALID', 'outcome required');
  const state = requireText(outcome.state, 'outcome.state');
  if (!['SUCCEEDED','FAILED','UNKNOWN'].includes(state)) throw new ControllerError('EXTERNAL_EFFECT_OUTCOME_INVALID', 'outcome state must be SUCCEEDED, FAILED, or UNKNOWN');
  const evidence = validateEvidence(outcome.evidence);
  const errorCode = outcome.error_code ?? null;
  if (state === 'FAILED' && (typeof errorCode !== 'string' || errorCode.length === 0)) throw new ControllerError('EXTERNAL_EFFECT_ERROR_CODE_REQUIRED', 'permanent failure requires error_code');
  if (errorCode !== null && typeof errorCode !== 'string') throw new ControllerError('EXTERNAL_EFFECT_OUTCOME_INVALID', 'error_code must be string or null');

  return kernel.atomic(() => {
    const effect = kernel.db.prepare('SELECT * FROM external_effects WHERE effect_id=?').get(effectId);
    if (!effect) throw new ControllerError('NOT_FOUND', 'external effect not found');
    if (effect.state !== 'RECONCILING') throw new ControllerError('EXTERNAL_EFFECT_RECONCILIATION_STATE_INVALID', 'resolution requires RECONCILING effect');
    const now = new Date().toISOString();
    const eventType = state === 'SUCCEEDED' ? 'external-effect.succeeded' : state === 'FAILED' ? 'external-effect.failed' : 'external-effect.unknown';
    const terminalEvidence = state === 'UNKNOWN' ? null : canonicalize(evidence);
    kernel.db.prepare('UPDATE external_effects SET state=?,terminal_evidence_json=?,last_error_code=?,updated_at=? WHERE effect_id=?').run(state,terminalEvidence,errorCode,now,effectId);
    kernel.appendEvent(effectStream(effectId),kernel.currentStreamVersion(effectStream(effectId)),eventType,{effect_id:effectId,state,evidence,error_code:errorCode},now);
    return state;
  });
}

export function cancelExternalEffect(kernel, effectId, reason) {
  requireText(reason, 'reason');
  return kernel.atomic(() => {
    const effect = kernel.db.prepare('SELECT * FROM external_effects WHERE effect_id=?').get(effectId);
    if (!effect) throw new ControllerError('NOT_FOUND', 'external effect not found');
    if (effect.state !== 'PREPARED') throw new ControllerError('EXTERNAL_EFFECT_CANCEL_FORBIDDEN', 'effect may be cancelled only before dispatch authorization');
    const now = new Date().toISOString();
    const evidence = {kind:'controller-cancellation',reference:reason};
    kernel.db.prepare("UPDATE external_effects SET state='CANCELLED',terminal_evidence_json=?,last_error_code='CANCELLED_BEFORE_DISPATCH',updated_at=? WHERE effect_id=?").run(canonicalize(evidence),now,effectId);
    kernel.appendEvent(effectStream(effectId),kernel.currentStreamVersion(effectStream(effectId)),'external-effect.cancelled',{effect_id:effectId,state:'CANCELLED',evidence,error_code:'CANCELLED_BEFORE_DISPATCH'},now);
    return 'CANCELLED';
  });
}
