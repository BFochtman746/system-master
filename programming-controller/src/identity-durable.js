'use strict';

const crypto = require('crypto');
const { IdentityError, uuidVersion } = require('./identity');

const freeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
};
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const req = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) throw new IdentityError('INCOMPLETE_INPUT', `${field} must be a non-empty string`, { field });
  return value;
};
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonicalId = (value, field = 'entity_id') => {
  const id = req(value, field).toLowerCase();
  try { uuidVersion(id); } catch (_) { throw new IdentityError('INVALID_CANONICAL_ID', `${field} must be opaque canonical UUID`, { field }); }
  return id;
};

const REQUIRED_STORE_METHODS = Object.freeze([
  'getCommandReceipt',
  'getLogicalVersion',
  'commitIdentityMutation',
  'getPendingIdentityEvents',
  'markIdentityEventDelivered'
]);

class IdentityStorePortContract {
  constructor(store) {
    if (!store || typeof store !== 'object') throw new IdentityError('STORE_UNAVAILABLE', '001P IdentityStorePort is required');
    for (const method of REQUIRED_STORE_METHODS) {
      if (typeof store[method] !== 'function') throw new IdentityError('STORE_UNAVAILABLE', `001P IdentityStorePort missing ${method}`, { method });
    }
    this.store = store;
  }

  getCommandReceipt(commandId) {
    try { return this.store.getCommandReceipt(commandId); }
    catch (error) { throw new IdentityError('STORE_UNAVAILABLE', '001P receipt lookup failed', { command_id: commandId, cause: error?.message || String(error) }); }
  }

  getLogicalVersion(key) {
    try { return this.store.getLogicalVersion(key); }
    catch (error) { throw new IdentityError('STORE_UNAVAILABLE', '001P logical version lookup failed', { key, cause: error?.message || String(error) }); }
  }

  commit(transaction) {
    try { return this.store.commitIdentityMutation(transaction); }
    catch (error) {
      if (error?.code === 'UNKNOWN_WRITE_OUTCOME') throw error;
      if (error?.code === 'STALE_BASE') throw new IdentityError('STALE_BASE', '001P rejected stale identity mutation', clone(error.details || {}));
      if (error?.code === 'CORRUPTION_DETECTED') throw new IdentityError('CORRUPTION_DETECTED', '001P detected identity-store corruption', clone(error.details || {}));
      throw new IdentityError('STORE_UNAVAILABLE', '001P identity transaction failed', { cause: error?.message || String(error) });
    }
  }

  pendingEvents(limit) {
    try { return this.store.getPendingIdentityEvents(limit); }
    catch (error) { throw new IdentityError('STORE_UNAVAILABLE', '001P outbox lookup failed', { cause: error?.message || String(error) }); }
  }

  markDelivered(eventId, evidenceRef) {
    try { return this.store.markIdentityEventDelivered(eventId, evidenceRef); }
    catch (error) { throw new IdentityError('STORE_UNAVAILABLE', '001P outbox acknowledgement failed', { event_id: eventId, cause: error?.message || String(error) }); }
  }
}

class IdentityPolicyPort {
  constructor({ authorize, classifyForStorage } = {}) {
    if (typeof authorize !== 'function') throw new IdentityError('POLICY_UNAVAILABLE', '001Q authorize port is required');
    if (typeof classifyForStorage !== 'function') throw new IdentityError('POLICY_UNAVAILABLE', '001Q classifyForStorage port is required');
    this.authorizeFn = authorize;
    this.classifyFn = classifyForStorage;
  }

  authorize(request) {
    let decision;
    try { decision = this.authorizeFn(clone(request)); }
    catch (error) { throw new IdentityError('POLICY_UNAVAILABLE', '001Q authorization unavailable', { cause: error?.message || String(error) }); }
    if (!(decision === true || decision?.allowed === true)) throw new IdentityError('OWNER_REQUIRED', '001Q denied protected identity operation', { reason: decision?.reason || null });
    return freeze(decision === true ? { allowed: true } : clone(decision));
  }

  classify({ record_kind, data_classification, purpose, fields = [] }) {
    if (!data_classification) throw new IdentityError('PRIVACY_CLASSIFICATION_MISSING', 'Sensitive/external identity persistence requires data classification', { record_kind });
    let decision;
    try { decision = this.classifyFn({ record_kind, data_classification, purpose, fields: clone(fields) }); }
    catch (error) { throw new IdentityError('POLICY_UNAVAILABLE', '001Q storage classification unavailable', { cause: error?.message || String(error) }); }
    if (!decision || decision.approved !== true || typeof decision.storage_profile_ref !== 'string' || typeof decision.redaction_profile_ref !== 'string') {
      throw new IdentityError('PRIVACY_CLASSIFICATION_MISSING', '001Q did not approve protected storage/redaction representation', { record_kind, data_classification });
    }
    return freeze(clone(decision));
  }
}

class IdentityConsistencyPort {
  constructor({ validateExpectedVersions, reconcileCommand } = {}) {
    if (typeof validateExpectedVersions !== 'function' || typeof reconcileCommand !== 'function') throw new IdentityError('CONSISTENCY_PORT_REQUIRED', '001R identity consistency ports are required');
    this.validateFn = validateExpectedVersions;
    this.reconcileFn = reconcileCommand;
  }

  validate(request) {
    let result;
    try { result = this.validateFn(clone(request)); }
    catch (error) { throw new IdentityError('CONSISTENCY_UNAVAILABLE', '001R expected-version validation unavailable', { cause: error?.message || String(error) }); }
    if (!(result === true || result?.valid === true)) throw new IdentityError('STALE_BASE', '001R rejected stale identity mutation base', { reason: result?.reason || null, conflicts: clone(result?.conflicts || []) });
    return true;
  }

  reconcile(request) {
    let result;
    try { result = this.reconcileFn(clone(request)); }
    catch (error) { throw new IdentityError('PARTIAL_WRITE', '001R could not reconcile unknown identity write outcome', { cause: error?.message || String(error) }); }
    if (!result || !['COMMITTED', 'NOT_COMMITTED', 'UNKNOWN'].includes(result.standing)) throw new IdentityError('PARTIAL_WRITE', '001R returned invalid reconciliation standing');
    return freeze(clone(result));
  }
}

class IdentityEvidenceEmitter {
  constructor({ storePort, emitEvidence } = {}) {
    if (!storePort) throw new IdentityError('STORE_UNAVAILABLE', 'IdentityStorePort required for evidence outbox');
    if (typeof emitEvidence !== 'function') throw new IdentityError('EVIDENCE_SINK_UNAVAILABLE', '001S evidence sink is required');
    this.store = storePort;
    this.emitFn = emitEvidence;
  }

  deliverPending({ limit = 100 } = {}) {
    if (!Number.isInteger(limit) || limit <= 0) throw new IdentityError('INVALID_CONFIGURATION', 'evidence delivery limit must be positive integer');
    const events = this.store.pendingEvents(limit);
    const delivered = [];
    for (const event of events) {
      let evidence;
      try { evidence = this.emitFn(clone(event)); }
      catch (error) { throw new IdentityError('EVIDENCE_SINK_UNAVAILABLE', '001S evidence delivery failed', { event_id: event.event_id, cause: error?.message || String(error) }); }
      if (!evidence || typeof evidence.evidence_ref !== 'string' || !evidence.evidence_ref) throw new IdentityError('EVIDENCE_SINK_UNAVAILABLE', '001S must return evidence_ref', { event_id: event.event_id });
      this.store.markDelivered(event.event_id, evidence.evidence_ref);
      delivered.push(freeze({ event_id: event.event_id, evidence_ref: evidence.evidence_ref }));
    }
    return freeze(delivered);
  }
}

function assertOpaqueCanonicalId(value) {
  const id = canonicalId(value);
  if (/[@/\\]/.test(id)) throw new IdentityError('PRIVACY_CLASSIFICATION_MISSING', 'Canonical identity must not embed names, emails, tenants, hosts or paths');
  return id;
}

function redactEventPayload(payload, redactionProfileRef) {
  const sensitiveDigest = hash(payload);
  return freeze({ redaction_profile_ref: redactionProfileRef, payload_digest_sha256: sensitiveDigest, raw_sensitive_values_included: false });
}

class DurableIdentityCommandExecutor {
  constructor({ storePort, policyPort, consistencyPort, clock = () => Date.now() } = {}) {
    this.store = storePort instanceof IdentityStorePortContract ? storePort : new IdentityStorePortContract(storePort);
    this.policy = policyPort instanceof IdentityPolicyPort ? policyPort : new IdentityPolicyPort(policyPort);
    this.consistency = consistencyPort instanceof IdentityConsistencyPort ? consistencyPort : new IdentityConsistencyPort(consistencyPort);
    this.clock = clock;
  }

  #fingerprint(input) {
    return hash(input);
  }

  #prior(commandId, fingerprint) {
    const prior = this.store.getCommandReceipt(commandId);
    if (!prior) return null;
    if (prior.request_fingerprint !== fingerprint) throw new IdentityError('DUPLICATE_COMMAND', 'command_id was already used with different semantics', { command_id: commandId });
    return freeze(clone(prior));
  }

  execute({ command_id, actor_ref, operation, subject_refs = [], expected_versions = {}, request, record_kind = 'IDENTITY', data_classification = 'INTERNAL', sensitive = false, planMutation }) {
    const commandId = req(command_id, 'command_id');
    const actor = req(actor_ref, 'actor_ref');
    const op = req(operation, 'operation');
    if (typeof planMutation !== 'function') throw new IdentityError('INVALID_PORT', 'planMutation must be function');
    const expected = clone(expected_versions || {});
    const fingerprint = this.#fingerprint({ operation: op, subject_refs, expected_versions: expected, request: clone(request), record_kind, data_classification, sensitive });
    const prior = this.#prior(commandId, fingerprint);
    if (prior) return prior;

    const auth = this.policy.authorize({ actor_ref: actor, operation: op, subject_refs: clone(subject_refs), command_id: commandId, data_classification });
    const storage = sensitive || ['SENSITIVE', 'RESTRICTED', 'CONFIDENTIAL'].includes(data_classification)
      ? this.policy.classify({ record_kind, data_classification, purpose: op, fields: Object.keys(request || {}) })
      : freeze({ approved: true, storage_profile_ref: '001P:DEFAULT', redaction_profile_ref: '001Q:DEFAULT_REDACT' });

    this.consistency.validate({ command_id: commandId, operation: op, expected_versions: expected, subject_refs: clone(subject_refs) });
    const plan = planMutation({ command_id: commandId, actor_ref: actor, authorization: auth, storage_policy: storage });
    if (!plan || !Array.isArray(plan.writes) || plan.writes.length === 0) throw new IdentityError('INCOMPLETE_INPUT', 'identity mutation plan must contain writes');
    for (const write of plan.writes) {
      req(write.logical_key, 'write.logical_key');
      req(write.record_kind, 'write.record_kind');
      if (write.entity_id) assertOpaqueCanonicalId(write.entity_id);
      if (write.sensitive === true && !write.data_classification) throw new IdentityError('PRIVACY_CLASSIFICATION_MISSING', 'sensitive identity write requires data classification', { logical_key: write.logical_key });
    }

    const eventPayload = {
      operation: op,
      subject_refs: clone(subject_refs),
      result_refs: clone(plan.result_refs || []),
      writes: plan.writes.map((write) => ({ logical_key: write.logical_key, record_kind: write.record_kind, entity_id: write.entity_id || null, expected_version: expected[write.logical_key] ?? null, data_classification: write.data_classification || data_classification }))
    };
    const event = freeze({
      event_id: `identity-event:${commandId}`,
      event_type: plan.event_type || `IDENTITY_${op}`,
      command_id: commandId,
      actor_ref: actor,
      occurred_at: new Date(this.clock()).toISOString(),
      subject_refs: clone(subject_refs),
      result_refs: clone(plan.result_refs || []),
      evidence_payload: redactEventPayload(eventPayload, storage.redaction_profile_ref),
      standing: 'PENDING_001S',
      authoritative_identity_truth: false
    });
    const receipt = freeze({
      command_id: commandId,
      request_fingerprint: fingerprint,
      operation: op,
      actor_ref: actor,
      status: 'COMMITTED',
      result: clone(plan.result || null),
      result_refs: clone(plan.result_refs || []),
      expected_versions: expected,
      storage_profile_ref: storage.storage_profile_ref,
      policy_decision_ref: auth.decision_ref || auth.decision_id || null,
      committed_at: event.occurred_at
    });
    const transaction = freeze({
      command_id: commandId,
      request_fingerprint: fingerprint,
      expected_versions: expected,
      writes: clone(plan.writes),
      receipt,
      outbox_event: event,
      logical_atomicity_required: true,
      physical_store_owner: 'PROGRAMMING-FOUNDATION-001P'
    });

    try {
      const committed = this.store.commit(transaction);
      if (!committed || committed.command_id !== commandId) throw new IdentityError('CORRUPTION_DETECTED', '001P returned a mismatched identity mutation receipt', { command_id: commandId });
      return freeze(clone(committed));
    } catch (error) {
      if (error?.code !== 'UNKNOWN_WRITE_OUTCOME') throw error;
      const reconciled = this.consistency.reconcile({ command_id: commandId, request_fingerprint: fingerprint, operation: op });
      if (reconciled.standing === 'COMMITTED') {
        const recovered = this.#prior(commandId, fingerprint);
        if (!recovered) throw new IdentityError('PARTIAL_WRITE', '001R says committed but durable receipt is unavailable', { command_id: commandId });
        return recovered;
      }
      if (reconciled.standing === 'NOT_COMMITTED') throw new IdentityError('PARTIAL_WRITE', 'Unknown write outcome reconciled as not committed; caller must retry with the same command_id', { command_id: commandId, retry_same_command_id: true });
      throw new IdentityError('PARTIAL_WRITE', 'Identity write outcome remains unknown; retry-as-new is forbidden', { command_id: commandId, retry_as_new_forbidden: true });
    }
  }

  reconcileCommand({ command_id, request }) {
    const commandId = req(command_id, 'command_id');
    const fingerprint = this.#fingerprint(clone(request));
    const prior = this.#prior(commandId, fingerprint);
    if (prior) return freeze({ standing: 'COMMITTED', receipt: prior });
    const result = this.consistency.reconcile({ command_id: commandId, request_fingerprint: fingerprint });
    return freeze({ standing: result.standing, receipt: result.standing === 'COMMITTED' ? this.store.getCommandReceipt(commandId) : null });
  }
}

module.exports = {
  DurableIdentityCommandExecutor,
  IdentityConsistencyPort,
  IdentityEvidenceEmitter,
  IdentityPolicyPort,
  IdentityStorePortContract,
  REQUIRED_STORE_METHODS,
  assertOpaqueCanonicalId,
  redactEventPayload
};
