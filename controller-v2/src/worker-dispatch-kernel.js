import { canonicalize, sha256, isRfc3339 } from './canonical.js';
import { ControllerError } from './errors.js';
import { ExecutionGraphKernel, rebuildExecutionControllerStore } from './execution-graph-kernel.js';
import {
  prepareExternalEffect,
  getExternalEffect,
  authorizeExternalEffectDispatch,
  getExternalEffectDispatchPermit
} from './external-effect-authority.js';

export const WORKER_DISPATCH_SCHEMA_VERSION = 7;
export const WORKER_BINDING_PROTOCOL = 'controller.worker-binding/v1';
export const EXECUTION_CONTRACT_PROTOCOL = 'controller.execution-contract/v1';
export const WORKER_DISPATCH_PROTOCOL = 'controller.worker-dispatch/v1';
export const WORKER_DISPATCH_ENVELOPE_PROTOCOL = 'controller.worker-dispatch-envelope/v1';

const DIGEST = /^[a-f0-9]{64}$/;
const CAPABILITY = /^[A-Za-z0-9._:/-]{1,128}$/;
const EXECUTABLE_TX = new Set(['ADMITTED', 'ACTIVE']);

function currentVersion(db) {
  const table = db.prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
  if (!table) return 0;
  return Number(db.prepare('SELECT COALESCE(MAX(version),0) v FROM schema_migrations').get().v);
}

function hasTable(db, name) {
  return Boolean(db.prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function requireText(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new ControllerError('WORKER_DISPATCH_SCHEMA_INVALID', `${name} required`);
  return value;
}

function requireDigest(value, name) {
  requireText(value, name);
  if (!DIGEST.test(value)) throw new ControllerError('WORKER_DISPATCH_SCHEMA_INVALID', `${name} must be lowercase SHA-256 hex`);
  return value;
}

function requireTime(value, name) {
  requireText(value, name);
  if (!isRfc3339(value) || !Number.isFinite(Date.parse(value))) throw new ControllerError('WORKER_DISPATCH_SCHEMA_INVALID', `${name} must use Controller timestamp profile`);
  return value;
}

function strictKeys(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ControllerError('WORKER_DISPATCH_SCHEMA_INVALID', 'object required');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new ControllerError('WORKER_DISPATCH_SCHEMA_UNKNOWN_FIELD', `unsupported field ${key}`);
  for (const key of required) if (!(key in value)) throw new ControllerError('WORKER_DISPATCH_SCHEMA_INVALID', `missing field ${key}`);
}

function canonicalCapabilities(input) {
  if (!Array.isArray(input)) throw new ControllerError('WORKER_DISPATCH_SCHEMA_INVALID', 'capabilities must be array');
  return [...new Set(input.map((value) => {
    if (typeof value !== 'string' || !CAPABILITY.test(value)) throw new ControllerError('WORKER_DISPATCH_SCHEMA_INVALID', 'invalid capability');
    return value;
  }))].sort();
}

function bindingSemantic(receipt) {
  const capabilities = canonicalCapabilities(receipt.capabilities);
  const semantic = {
    protocol: WORKER_BINDING_PROTOCOL,
    worker_ref: requireText(receipt.worker_ref, 'worker_ref'),
    identity_authority: requireText(receipt.identity_authority, 'identity_authority'),
    identity_evidence_ref: requireText(receipt.identity_evidence_ref, 'identity_evidence_ref'),
    identity_evidence_digest: requireDigest(receipt.identity_evidence_digest, 'identity_evidence_digest'),
    delegation_evidence_ref: requireText(receipt.delegation_evidence_ref, 'delegation_evidence_ref'),
    delegation_evidence_digest: requireDigest(receipt.delegation_evidence_digest, 'delegation_evidence_digest'),
    verifier_policy_revision: requireText(receipt.verifier_policy_revision, 'verifier_policy_revision'),
    verifier_policy_digest: requireDigest(receipt.verifier_policy_digest, 'verifier_policy_digest'),
    capabilities,
    capability_digest: sha256(capabilities),
    observed_at: requireTime(receipt.observed_at, 'observed_at'),
    valid_until: requireTime(receipt.valid_until, 'valid_until')
  };
  if (Date.parse(semantic.valid_until) <= Date.parse(semantic.observed_at)) {
    throw new ControllerError('WORKER_BINDING_VALIDITY_INVALID', 'valid_until must be after observed_at');
  }
  return semantic;
}

function revocationSemantic(revocation) {
  strictKeys(revocation, ['authority','evidence_ref','evidence_digest','observed_at']);
  return {
    authority: requireText(revocation.authority, 'authority'),
    evidence_ref: requireText(revocation.evidence_ref, 'evidence_ref'),
    evidence_digest: requireDigest(revocation.evidence_digest, 'evidence_digest'),
    observed_at: requireTime(revocation.observed_at, 'observed_at')
  };
}

function dispatchFields(row) {
  return {
    transaction_id: row.transaction_id,
    operation_id: row.operation_id,
    contract_id: row.contract_id,
    worker_binding_id: row.worker_binding_id,
    lease_id: row.lease_id,
    resource_id: row.resource_id,
    generation: Number(row.generation)
  };
}

function dispatchIdentity(row) {
  return { protocol: WORKER_DISPATCH_PROTOCOL, ...dispatchFields(row) };
}

export function workerDispatchEnvelope(row) {
  return { protocol: WORKER_DISPATCH_ENVELOPE_PROTOCOL, dispatch_id: row.dispatch_id, ...dispatchFields(row) };
}

function rowCapabilities(row) {
  return JSON.parse(row.capabilities_json);
}

function expectedProvider(row) {
  return `worker-transport:${row.executor_kind}`;
}

export class WorkerDispatchKernel extends ExecutionGraphKernel {
  migrate() {
    let current = currentVersion(this.db);
    if (current < 7) {
      ExecutionGraphKernel.prototype.migrate.call(this);
      current = currentVersion(this.db);
    }
    if (current > WORKER_DISPATCH_SCHEMA_VERSION) throw new ControllerError('SCHEMA_TOO_NEW', `database schema ${current} is newer than supported ${WORKER_DISPATCH_SCHEMA_VERSION}`);
    if (current === 6) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec(`
          CREATE TABLE worker_bindings(
            binding_id TEXT PRIMARY KEY,
            worker_ref TEXT NOT NULL,
            identity_authority TEXT NOT NULL,
            identity_evidence_ref TEXT NOT NULL,
            identity_evidence_digest TEXT NOT NULL,
            delegation_evidence_ref TEXT NOT NULL,
            delegation_evidence_digest TEXT NOT NULL,
            verifier_policy_revision TEXT NOT NULL,
            verifier_policy_digest TEXT NOT NULL,
            capabilities_json TEXT NOT NULL,
            capability_digest TEXT NOT NULL,
            observed_at TEXT NOT NULL,
            valid_until TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE TABLE worker_binding_revocations(
            binding_id TEXT PRIMARY KEY REFERENCES worker_bindings(binding_id),
            authority TEXT NOT NULL,
            evidence_ref TEXT NOT NULL,
            evidence_digest TEXT NOT NULL,
            observed_at TEXT NOT NULL
          );
          CREATE TABLE execution_contracts(
            contract_id TEXT PRIMARY KEY,
            transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id),
            operation_id TEXT NOT NULL UNIQUE REFERENCES operations(operation_id),
            subject_repo TEXT NOT NULL,
            subject_algorithm TEXT NOT NULL,
            subject_oid TEXT NOT NULL,
            resource_id TEXT NOT NULL,
            executor_kind TEXT NOT NULL,
            protocol_version TEXT NOT NULL,
            payload_ref TEXT NOT NULL,
            payload_digest TEXT NOT NULL,
            required_capabilities_json TEXT NOT NULL,
            required_capability_digest TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE TABLE dispatch_intents(
            dispatch_id TEXT PRIMARY KEY,
            transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id),
            operation_id TEXT NOT NULL REFERENCES operations(operation_id),
            contract_id TEXT NOT NULL REFERENCES execution_contracts(contract_id),
            worker_binding_id TEXT NOT NULL REFERENCES worker_bindings(binding_id),
            lease_id TEXT NOT NULL UNIQUE,
            resource_id TEXT NOT NULL,
            generation INTEGER NOT NULL CHECK(generation > 0),
            request_digest TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
        `);
        this.db.prepare("INSERT INTO schema_migrations(version,applied_at) VALUES (7,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run();
        this.db.exec('COMMIT');
      } catch (error) {
        if (this.db.isTransaction) this.db.exec('ROLLBACK');
        throw error;
      }
      current = 7;
    }
    for (const table of ['operation_dependencies','worker_bindings','worker_binding_revocations','execution_contracts','dispatch_intents']) {
      if (!hasTable(this.db, table)) throw new ControllerError('SCHEMA_INCOMPLETE', `worker dispatch schema missing ${table}`);
    }
    if (current !== 7) throw new ControllerError('SCHEMA_INCOMPLETE', 'worker dispatch schema v7 incomplete');
  }

  recordWorkerBinding(receipt, createdAt = new Date().toISOString()) {
    strictKeys(receipt, ['worker_ref','identity_authority','identity_evidence_ref','identity_evidence_digest','delegation_evidence_ref','delegation_evidence_digest','verifier_policy_revision','verifier_policy_digest','capabilities','observed_at','valid_until']);
    const semantic = bindingSemantic(receipt);
    const bindingId = sha256(semantic);
    return this.atomic(() => {
      const prior = this.db.prepare('SELECT binding_id FROM worker_bindings WHERE binding_id=?').get(bindingId);
      if (prior) return { binding_id: bindingId, duplicate: true };
      this.db.prepare(`INSERT INTO worker_bindings(binding_id,worker_ref,identity_authority,identity_evidence_ref,identity_evidence_digest,delegation_evidence_ref,delegation_evidence_digest,verifier_policy_revision,verifier_policy_digest,capabilities_json,capability_digest,observed_at,valid_until,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(bindingId,semantic.worker_ref,semantic.identity_authority,semantic.identity_evidence_ref,semantic.identity_evidence_digest,semantic.delegation_evidence_ref,semantic.delegation_evidence_digest,semantic.verifier_policy_revision,semantic.verifier_policy_digest,canonicalize(semantic.capabilities),semantic.capability_digest,semantic.observed_at,semantic.valid_until,createdAt);
      this.appendEvent(`worker-binding:${bindingId}`,0,'worker.binding_recorded',{ binding_id:bindingId, ...semantic },createdAt);
      return { binding_id: bindingId, duplicate: false };
    });
  }

  revokeWorkerBinding(bindingId, revocation) {
    requireText(bindingId, 'binding_id');
    const normalized = revocationSemantic(revocation);
    return this.atomic(() => {
      if (!this.db.prepare('SELECT binding_id FROM worker_bindings WHERE binding_id=?').get(bindingId)) throw new ControllerError('NOT_FOUND', 'worker binding not found');
      const prior = this.db.prepare('SELECT * FROM worker_binding_revocations WHERE binding_id=?').get(bindingId);
      if (prior) {
        const actual = [prior.authority, prior.evidence_ref, prior.evidence_digest, prior.observed_at];
        const expected = [normalized.authority, normalized.evidence_ref, normalized.evidence_digest, normalized.observed_at];
        if (canonicalize(actual) !== canonicalize(expected)) throw new ControllerError('WORKER_BINDING_REVOCATION_CONFLICT', 'conflicting revocation evidence');
        return { binding_id: bindingId, duplicate: true };
      }
      this.db.prepare('INSERT INTO worker_binding_revocations(binding_id,authority,evidence_ref,evidence_digest,observed_at) VALUES (?,?,?,?,?)')
        .run(bindingId,normalized.authority,normalized.evidence_ref,normalized.evidence_digest,normalized.observed_at);
      this.appendEvent(`worker-binding:${bindingId}`,this.currentStreamVersion(`worker-binding:${bindingId}`),'worker.binding_revoked',{ binding_id:bindingId, ...normalized },normalized.observed_at);
      return { binding_id: bindingId, duplicate: false };
    });
  }

  workerBindingStanding(bindingId, nowMs = Date.now()) {
    const row = this.db.prepare('SELECT * FROM worker_bindings WHERE binding_id=?').get(bindingId);
    if (!row) return 'NOT_FOUND';
    if (this.db.prepare('SELECT 1 ok FROM worker_binding_revocations WHERE binding_id=?').get(bindingId)) return 'REVOKED';
    if (nowMs < Date.parse(row.observed_at)) return 'NOT_YET_VALID';
    if (nowMs >= Date.parse(row.valid_until)) return 'EXPIRED';
    return 'CURRENT';
  }

  recordExecutionContract(spec, createdAt = new Date().toISOString()) {
    strictKeys(spec, ['operation_id','executor_kind','protocol_version','payload_ref','payload_digest','required_capabilities']);
    const operationId = requireText(spec.operation_id, 'operation_id');
    const capabilities = canonicalCapabilities(spec.required_capabilities);
    const payloadDigest = requireDigest(spec.payload_digest, 'payload_digest');
    return this.atomic(() => {
      const row = this.db.prepare(`SELECT o.operation_id,o.transaction_id,o.state,o.resource_id,t.subject_repo,t.subject_algorithm,t.subject_oid,t.state transaction_state
        FROM operations o JOIN transactions t ON t.transaction_id=o.transaction_id WHERE o.operation_id=?`).get(operationId);
      if (!row) throw new ControllerError('NOT_FOUND', 'operation not found');
      if (!['PLANNED','READY'].includes(row.state)) throw new ControllerError('EXECUTION_CONTRACT_STATE_INVALID', 'contract requires PLANNED or READY operation');
      if (!row.resource_id) throw new ControllerError('EXECUTION_CONTRACT_RESOURCE_INVALID', 'operation resource required');
      const semantic = {
        protocol: EXECUTION_CONTRACT_PROTOCOL,
        transaction_id: row.transaction_id,
        operation_id: operationId,
        subject_repo: row.subject_repo,
        subject_algorithm: row.subject_algorithm,
        subject_oid: row.subject_oid,
        resource_id: row.resource_id,
        executor_kind: requireText(spec.executor_kind, 'executor_kind'),
        protocol_version: requireText(spec.protocol_version, 'protocol_version'),
        payload_ref: requireText(spec.payload_ref, 'payload_ref'),
        payload_digest: payloadDigest,
        required_capabilities: capabilities,
        required_capability_digest: sha256(capabilities)
      };
      const contractId = sha256(semantic);
      const prior = this.db.prepare('SELECT contract_id FROM execution_contracts WHERE operation_id=?').get(operationId);
      if (prior) {
        if (prior.contract_id !== contractId) throw new ControllerError('EXECUTION_CONTRACT_CONFLICT', 'operation already has different execution contract');
        return { contract_id: contractId, duplicate: true };
      }
      this.db.prepare(`INSERT INTO execution_contracts(contract_id,transaction_id,operation_id,subject_repo,subject_algorithm,subject_oid,resource_id,executor_kind,protocol_version,payload_ref,payload_digest,required_capabilities_json,required_capability_digest,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(contractId,row.transaction_id,operationId,row.subject_repo,row.subject_algorithm,row.subject_oid,row.resource_id,semantic.executor_kind,semantic.protocol_version,semantic.payload_ref,semantic.payload_digest,canonicalize(capabilities),semantic.required_capability_digest,createdAt);
      this.appendEvent(`operation:${operationId}`,this.currentStreamVersion(`operation:${operationId}`),'operation.execution_contract_recorded',{ contract_id:contractId, ...semantic },createdAt);
      return { contract_id: contractId, duplicate: false };
    });
  }

  _dispatchRows(dispatchId) {
    return this.db.prepare(`SELECT d.*,c.subject_repo,c.subject_algorithm,c.subject_oid,c.executor_kind,c.required_capabilities_json,c.payload_ref,c.payload_digest,b.worker_ref,b.capabilities_json,b.observed_at,b.valid_until
      FROM dispatch_intents d
      JOIN execution_contracts c ON c.contract_id=d.contract_id
      JOIN worker_bindings b ON b.binding_id=d.worker_binding_id
      WHERE d.dispatch_id=?`).get(dispatchId);
  }

  _assertDispatchBindingCurrent(row, nowMs) {
    const standing = this.workerBindingStanding(row.worker_binding_id, nowMs);
    if (standing !== 'CURRENT') throw new ControllerError('WORKER_BINDING_NOT_CURRENT', standing);
    const required = JSON.parse(row.required_capabilities_json);
    const available = new Set(JSON.parse(row.capabilities_json));
    if (!required.every((value) => available.has(value))) throw new ControllerError('WORKER_CAPABILITY_MISSING', 'worker binding lacks required capability');
  }

  _assertDispatchPreparationStanding(row, nowMs) {
    const live = this.db.prepare(`SELECT o.state operation_state,t.state transaction_state,o.resource_id,o.transaction_id
      FROM operations o JOIN transactions t ON t.transaction_id=o.transaction_id WHERE o.operation_id=?`).get(row.operation_id);
    if (!live || live.transaction_id !== row.transaction_id) throw new ControllerError('DISPATCH_OPERATION_MISMATCH', 'dispatch operation relation missing');
    if (live.operation_state !== 'READY') throw new ControllerError('DISPATCH_OPERATION_NOT_READY', 'dispatch effect preparation requires READY operation');
    if (!EXECUTABLE_TX.has(live.transaction_state)) throw new ControllerError('DISPATCH_TRANSACTION_NOT_EXECUTABLE', 'transaction is not executable');
    if (live.resource_id !== row.resource_id) throw new ControllerError('DISPATCH_RESOURCE_MISMATCH', 'dispatch resource differs from current operation');
    this._assertDispatchBindingCurrent(row, nowMs);
    const lease = this.db.prepare('SELECT * FROM leases WHERE lease_id=?').get(row.lease_id);
    if (!lease) throw new ControllerError('STALE_LEASE', 'live dispatch lease missing');
    this.assertWorkerLease({ leaseId: row.lease_id, generation: Number(row.generation), operationId: row.operation_id }, nowMs);
    const currentGeneration = this.db.prepare('SELECT generation FROM resource_generations WHERE resource_id=?').get(row.resource_id);
    if (!currentGeneration || Number(currentGeneration.generation) !== Number(row.generation)) throw new ControllerError('STALE_LEASE', 'dispatch lease generation is stale');
    if (lease.resource_id !== row.resource_id || lease.worker_id !== row.worker_ref) throw new ControllerError('DISPATCH_LEASE_BINDING_MISMATCH', 'lease does not match resource/worker binding');
  }

  _assertEffectMatchesDispatch(row, effect) {
    if (
      effect.transaction_id !== row.transaction_id ||
      effect.operation_id !== row.operation_id ||
      effect.provider !== expectedProvider(row) ||
      effect.effect_type !== 'controller.worker.dispatch' ||
      effect.target_key !== row.worker_binding_id ||
      effect.idempotency_key !== row.dispatch_id ||
      effect.request_digest !== row.request_digest
    ) throw new ControllerError('DISPATCH_EFFECT_MISMATCH', 'effect does not exactly match dispatch intent');
    const envelope = workerDispatchEnvelope(row);
    if (sha256(envelope) !== row.request_digest) throw new ControllerError('DISPATCH_REQUEST_DIGEST_MISMATCH', 'dispatch envelope differs from durable intent');
    return envelope;
  }

  createDispatchIntent({ operationId, contractId, workerBindingId, leaseId, nowMs = Date.now() }) {
    return this.atomic(() => {
      const op = this.db.prepare(`SELECT o.*,t.state transaction_state,t.subject_repo,t.subject_algorithm,t.subject_oid
        FROM operations o JOIN transactions t ON t.transaction_id=o.transaction_id WHERE o.operation_id=?`).get(operationId);
      if (!op) throw new ControllerError('NOT_FOUND', 'operation not found');
      if (op.state !== 'READY') throw new ControllerError('DISPATCH_OPERATION_NOT_READY', 'dispatch intent requires READY operation');
      if (!EXECUTABLE_TX.has(op.transaction_state)) throw new ControllerError('DISPATCH_TRANSACTION_NOT_EXECUTABLE', 'transaction is not executable');
      const contract = this.db.prepare('SELECT * FROM execution_contracts WHERE contract_id=?').get(contractId);
      if (!contract || contract.operation_id !== operationId || contract.transaction_id !== op.transaction_id || contract.resource_id !== op.resource_id || contract.subject_repo !== op.subject_repo || contract.subject_algorithm !== op.subject_algorithm || contract.subject_oid !== op.subject_oid) {
        throw new ControllerError('DISPATCH_CONTRACT_MISMATCH', 'execution contract does not match current operation/subject');
      }
      const binding = this.db.prepare('SELECT * FROM worker_bindings WHERE binding_id=?').get(workerBindingId);
      if (!binding) throw new ControllerError('NOT_FOUND', 'worker binding not found');
      const lease = this.db.prepare('SELECT * FROM leases WHERE lease_id=?').get(leaseId);
      if (!lease) throw new ControllerError('NOT_FOUND', 'lease not found');
      this.assertWorkerLease({ leaseId, generation: Number(lease.generation), operationId }, nowMs);
      const currentGeneration = this.db.prepare('SELECT generation FROM resource_generations WHERE resource_id=?').get(lease.resource_id);
      if (!currentGeneration || Number(currentGeneration.generation) !== Number(lease.generation)) throw new ControllerError('STALE_LEASE', 'dispatch lease generation is stale');
      if (lease.resource_id !== op.resource_id || lease.worker_id !== binding.worker_ref) throw new ControllerError('DISPATCH_LEASE_BINDING_MISMATCH', 'lease does not match resource/worker binding');
      this._assertDispatchBindingCurrent({ worker_binding_id:workerBindingId, required_capabilities_json:contract.required_capabilities_json, capabilities_json:binding.capabilities_json }, nowMs);

      const identity = { protocol:WORKER_DISPATCH_PROTOCOL, transaction_id:op.transaction_id, operation_id:operationId, contract_id:contractId, worker_binding_id:workerBindingId, lease_id:leaseId, resource_id:lease.resource_id, generation:Number(lease.generation) };
      const dispatchId = sha256(identity);
      const envelope = { protocol:WORKER_DISPATCH_ENVELOPE_PROTOCOL, dispatch_id:dispatchId, ...dispatchFields(identity) };
      const requestDigest = sha256(envelope);
      const priorLease = this.db.prepare('SELECT * FROM dispatch_intents WHERE lease_id=?').get(leaseId);
      if (priorLease) {
        if (priorLease.dispatch_id !== dispatchId || priorLease.request_digest !== requestDigest) throw new ControllerError('DISPATCH_INTENT_CONFLICT', 'lease already bound to different dispatch');
        return { dispatch_id: dispatchId, request_digest: requestDigest, duplicate: true };
      }
      const createdAt = new Date(nowMs).toISOString();
      this.db.prepare('INSERT INTO dispatch_intents(dispatch_id,transaction_id,operation_id,contract_id,worker_binding_id,lease_id,resource_id,generation,request_digest,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(dispatchId,op.transaction_id,operationId,contractId,workerBindingId,leaseId,lease.resource_id,Number(lease.generation),requestDigest,createdAt);
      this.appendEvent(`operation:${operationId}`,this.currentStreamVersion(`operation:${operationId}`),'operation.dispatch_intent_recorded',{ dispatch_id:dispatchId, ...dispatchFields({ transaction_id:op.transaction_id, operation_id:operationId, contract_id:contractId, worker_binding_id:workerBindingId, lease_id:leaseId, resource_id:lease.resource_id, generation:Number(lease.generation) }), request_digest:requestDigest },createdAt);
      return { dispatch_id: dispatchId, request_digest: requestDigest, duplicate: false };
    });
  }

  prepareWorkerDispatchEffect(dispatchId, nowMs = Date.now()) {
    const row = this._dispatchRows(dispatchId);
    if (!row) throw new ControllerError('NOT_FOUND', 'dispatch intent not found');
    this._assertDispatchPreparationStanding(row, nowMs);
    const envelope = workerDispatchEnvelope(row);
    if (sha256(envelope) !== row.request_digest) throw new ControllerError('DISPATCH_REQUEST_DIGEST_MISMATCH', 'dispatch envelope differs from durable intent');
    const result = prepareExternalEffect(this, {
      transaction_id: row.transaction_id,
      operation_id: row.operation_id,
      provider: expectedProvider(row),
      effect_type: 'controller.worker.dispatch',
      target_key: row.worker_binding_id,
      idempotency_key: row.dispatch_id,
      request: envelope,
      expected_remote_version: null
    });
    if (result.request_digest !== row.request_digest) throw new ControllerError('DISPATCH_EFFECT_DIGEST_MISMATCH', 'external effect request digest differs from dispatch intent');
    return { ...result, dispatch_id: dispatchId };
  }

  activateWorkerDispatch(dispatchId, effectId, nowMs = Date.now()) {
    const row = this._dispatchRows(dispatchId);
    if (!row) throw new ControllerError('NOT_FOUND', 'dispatch intent not found');
    this._assertDispatchBindingCurrent(row, nowMs);
    let effect = getExternalEffect(this, effectId);
    this._assertEffectMatchesDispatch(row, effect);
    const op = this.db.prepare('SELECT state FROM operations WHERE operation_id=?').get(row.operation_id);
    if (!op) throw new ControllerError('NOT_FOUND', 'operation not found');
    if (op.state === 'READY') this.startLeasedOperation({ leaseId: row.lease_id, generation: Number(row.generation), operationId: row.operation_id, nowMs });
    else if (op.state !== 'RUNNING') throw new ControllerError('DISPATCH_OPERATION_STATE_INVALID', 'dispatch activation requires READY or RUNNING operation');
    this._assertDispatchBindingCurrent(row, nowMs);
    effect = getExternalEffect(this, effectId);
    this._assertEffectMatchesDispatch(row, effect);
    return authorizeExternalEffectDispatch(this, effectId, row.lease_id, nowMs);
  }

  getWorkerDispatchPermit(dispatchId, effectId, nowMs = Date.now()) {
    const row = this._dispatchRows(dispatchId);
    if (!row) throw new ControllerError('NOT_FOUND', 'dispatch intent not found');
    this._assertDispatchBindingCurrent(row, nowMs);
    const effect = getExternalEffect(this, effectId);
    const envelope = this._assertEffectMatchesDispatch(row, effect);
    const permit = getExternalEffectDispatchPermit(this, effectId, row.lease_id, nowMs);
    return Object.freeze({ ...permit, dispatch_id:dispatchId, request_digest:row.request_digest, envelope:Object.freeze(envelope) });
  }

  restoreWorkerDispatchProjection(events = this.exportEvents()) {
    if (!Array.isArray(events)) throw new ControllerError('RECOVERY_WORKER_DISPATCH_INVALID', 'events array required');
    return this.atomic(() => {
      for (const table of ['worker_binding_revocations','dispatch_intents','execution_contracts','worker_bindings']) {
        if (Number(this.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n) !== 0) throw new ControllerError('RECOVERY_WORKER_DISPATCH_TARGET_NOT_EMPTY', 'worker dispatch recovery target must be empty');
      }
      const bindings = events.filter((e) => e.event_type === 'worker.binding_recorded');
      const revocations = events.filter((e) => e.event_type === 'worker.binding_revoked');
      const contracts = events.filter((e) => e.event_type === 'operation.execution_contract_recorded');
      const dispatches = events.filter((e) => e.event_type === 'operation.dispatch_intent_recorded');

      for (const event of bindings) {
        try {
          const d = event.data ?? {};
          const semantic = bindingSemantic({
            worker_ref:d.worker_ref,
            identity_authority:d.identity_authority,
            identity_evidence_ref:d.identity_evidence_ref,
            identity_evidence_digest:d.identity_evidence_digest,
            delegation_evidence_ref:d.delegation_evidence_ref,
            delegation_evidence_digest:d.delegation_evidence_digest,
            verifier_policy_revision:d.verifier_policy_revision,
            verifier_policy_digest:d.verifier_policy_digest,
            capabilities:d.capabilities,
            observed_at:d.observed_at,
            valid_until:d.valid_until
          });
          if (d.protocol !== WORKER_BINDING_PROTOCOL || semantic.capability_digest !== d.capability_digest || sha256(semantic) !== d.binding_id) throw new ControllerError('RECOVERY_WORKER_DISPATCH_INVALID', 'invalid worker binding event identity');
          this.db.prepare(`INSERT INTO worker_bindings(binding_id,worker_ref,identity_authority,identity_evidence_ref,identity_evidence_digest,delegation_evidence_ref,delegation_evidence_digest,verifier_policy_revision,verifier_policy_digest,capabilities_json,capability_digest,observed_at,valid_until,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(d.binding_id,semantic.worker_ref,semantic.identity_authority,semantic.identity_evidence_ref,semantic.identity_evidence_digest,semantic.delegation_evidence_ref,semantic.delegation_evidence_digest,semantic.verifier_policy_revision,semantic.verifier_policy_digest,canonicalize(semantic.capabilities),semantic.capability_digest,semantic.observed_at,semantic.valid_until,event.occurred_at);
        } catch (error) {
          if (error instanceof ControllerError && error.code === 'RECOVERY_WORKER_DISPATCH_INVALID') throw error;
          throw new ControllerError('RECOVERY_WORKER_DISPATCH_INVALID', `invalid worker binding event: ${error.message}`);
        }
      }

      for (const event of revocations) {
        try {
          const d = event.data ?? {};
          const normalized = revocationSemantic({ authority:d.authority, evidence_ref:d.evidence_ref, evidence_digest:d.evidence_digest, observed_at:d.observed_at });
          if (!this.db.prepare('SELECT 1 ok FROM worker_bindings WHERE binding_id=?').get(d.binding_id)) throw new ControllerError('RECOVERY_WORKER_DISPATCH_INVALID', 'revocation missing binding');
          const prior = this.db.prepare('SELECT * FROM worker_binding_revocations WHERE binding_id=?').get(d.binding_id);
          if (prior) {
            const actual = [prior.authority,prior.evidence_ref,prior.evidence_digest,prior.observed_at];
            const expected = [normalized.authority,normalized.evidence_ref,normalized.evidence_digest,normalized.observed_at];
            if (canonicalize(actual) !== canonicalize(expected)) throw new ControllerError('RECOVERY_WORKER_DISPATCH_INVALID', 'conflicting recovered revocation evidence');
            continue;
          }
          this.db.prepare('INSERT INTO worker_binding_revocations(binding_id,authority,evidence_ref,evidence_digest,observed_at) VALUES (?,?,?,?,?)')
            .run(d.binding_id,normalized.authority,normalized.evidence_ref,normalized.evidence_digest,normalized.observed_at);
        } catch (error) {
          if (error instanceof ControllerError && error.code === 'RECOVERY_WORKER_DISPATCH_INVALID') throw error;
          throw new ControllerError('RECOVERY_WORKER_DISPATCH_INVALID', `invalid revocation event: ${error.message}`);
        }
      }

      for (const event of contracts) {
        try {
          const d = event.data ?? {};
          const required = canonicalCapabilities(d.required_capabilities);
          requireText(d.transaction_id, 'transaction_id');
          requireText(d.operation_id, 'operation_id');
          requireText(d.subject_repo, 'subject_repo');
          requireText(d.subject_algorithm, 'subject_algorithm');
          requireText(d.subject_oid, 'subject_oid');
          requireText(d.resource_id, 'resource_id');
          requireText(d.executor_kind, 'executor_kind');
          requireText(d.protocol_version, 'protocol_version');
          requireText(d.payload_ref, 'payload_ref');
          requireDigest(d.payload_digest, 'payload_digest');
          const semantic = {
            protocol:EXECUTION_CONTRACT_PROTOCOL,
            transaction_id:d.transaction_id,
            operation_id:d.operation_id,
            subject_repo:d.subject_repo,
            subject_algorithm:d.subject_algorithm,
            subject_oid:d.subject_oid,
            resource_id:d.resource_id,
            executor_kind:d.executor_kind,
            protocol_version:d.protocol_version,
            payload_ref:d.payload_ref,
            payload_digest:d.payload_digest,
            required_capabilities:required,
            required_capability_digest:sha256(required)
          };
          if (d.protocol !== EXECUTION_CONTRACT_PROTOCOL || semantic.required_capability_digest !== d.required_capability_digest || sha256(semantic) !== d.contract_id) throw new ControllerError('RECOVERY_WORKER_DISPATCH_INVALID', 'invalid execution contract identity');
          const current = this.db.prepare(`SELECT o.transaction_id,o.resource_id,t.subject_repo,t.subject_algorithm,t.subject_oid
            FROM operations o JOIN transactions t ON t.transaction_id=o.transaction_id WHERE o.operation_id=?`).get(d.operation_id);
          if (!current || current.transaction_id !== d.transaction_id || current.resource_id !== d.resource_id || current.subject_repo !== d.subject_repo || current.subject_algorithm !== d.subject_algorithm || current.subject_oid !== d.subject_oid) throw new ControllerError('RECOVERY_WORKER_DISPATCH_INVALID', 'contract does not match recovered Controller truth');
          this.db.prepare(`INSERT INTO execution_contracts(contract_id,transaction_id,operation_id,subject_repo,subject_algorithm,subject_oid,resource_id,executor_kind,protocol_version,payload_ref,payload_digest,required_capabilities_json,required_capability_digest,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(d.contract_id,d.transaction_id,d.operation_id,d.subject_repo,d.subject_algorithm,d.subject_oid,d.resource_id,d.executor_kind,d.protocol_version,d.payload_ref,d.payload_digest,canonicalize(required),semantic.required_capability_digest,event.occurred_at);
        } catch (error) {
          if (error instanceof ControllerError && error.code === 'RECOVERY_WORKER_DISPATCH_INVALID') throw error;
          throw new ControllerError('RECOVERY_WORKER_DISPATCH_INVALID', `invalid execution contract event: ${error.message}`);
        }
      }

      for (const event of dispatches) {
        try {
          const d = event.data ?? {};
          requireText(d.transaction_id, 'transaction_id');
          requireText(d.operation_id, 'operation_id');
          requireText(d.contract_id, 'contract_id');
          requireText(d.worker_binding_id, 'worker_binding_id');
          requireText(d.lease_id, 'lease_id');
          requireText(d.resource_id, 'resource_id');
          requireDigest(d.request_digest, 'request_digest');
          if (!Number.isInteger(Number(d.generation)) || Number(d.generation) <= 0) throw new ControllerError('RECOVERY_WORKER_DISPATCH_INVALID', 'invalid generation');
          const identity = { protocol:WORKER_DISPATCH_PROTOCOL, ...dispatchFields(d) };
          const dispatchId = sha256(identity);
          const envelope = { protocol:WORKER_DISPATCH_ENVELOPE_PROTOCOL, dispatch_id:dispatchId, ...dispatchFields(d) };
          if (dispatchId !== d.dispatch_id || sha256(envelope) !== d.request_digest) throw new ControllerError('RECOVERY_WORKER_DISPATCH_INVALID', 'invalid dispatch event identity');
          const op = this.db.prepare('SELECT transaction_id,resource_id FROM operations WHERE operation_id=?').get(d.operation_id);
          const contract = this.db.prepare('SELECT transaction_id,operation_id,resource_id FROM execution_contracts WHERE contract_id=?').get(d.contract_id);
          const binding = this.db.prepare('SELECT binding_id FROM worker_bindings WHERE binding_id=?').get(d.worker_binding_id);
          if (!op || !contract || !binding || op.transaction_id !== d.transaction_id || op.resource_id !== d.resource_id || contract.transaction_id !== d.transaction_id || contract.operation_id !== d.operation_id || contract.resource_id !== d.resource_id) {
            throw new ControllerError('RECOVERY_WORKER_DISPATCH_INVALID', 'dispatch relation mismatch');
          }
          this.db.prepare('INSERT INTO dispatch_intents(dispatch_id,transaction_id,operation_id,contract_id,worker_binding_id,lease_id,resource_id,generation,request_digest,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
            .run(d.dispatch_id,d.transaction_id,d.operation_id,d.contract_id,d.worker_binding_id,d.lease_id,d.resource_id,Number(d.generation),d.request_digest,event.occurred_at);
        } catch (error) {
          if (error instanceof ControllerError && error.code === 'RECOVERY_WORKER_DISPATCH_INVALID') throw error;
          throw new ControllerError('RECOVERY_WORKER_DISPATCH_INVALID', `invalid dispatch event: ${error.message}`);
        }
      }
      return { bindings:bindings.length, revocations:revocations.length, contracts:contracts.length, dispatches:dispatches.length };
    });
  }
}

export function rebuildWorkerDispatchStore(path, durableEntries, options = {}) {
  const base = rebuildExecutionControllerStore(path, durableEntries, options);
  const checkpoint = base.recoveredJournalCheckpoint;
  const events = base.exportEvents();
  base.close();
  let kernel;
  try {
    kernel = new WorkerDispatchKernel(path);
    kernel.restoreWorkerDispatchProjection(events);
    Object.defineProperty(kernel,'recoveredJournalCheckpoint',{ value:checkpoint, writable:false, enumerable:true, configurable:false });
    return kernel;
  } catch (error) {
    if (kernel) kernel.close();
    throw error;
  }
}
