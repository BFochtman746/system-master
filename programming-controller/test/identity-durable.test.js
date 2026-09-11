'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { IdentityError } = require('../src/identity');
const {
  DurableIdentityCommandExecutor,
  IdentityConsistencyPort,
  IdentityEvidenceEmitter,
  IdentityPolicyPort,
  IdentityStorePortContract,
  assertOpaqueCanonicalId
} = require('../src/identity-durable');

const A = '018bcfe5-6800-7000-8000-000000000001';

class TestStore {
  constructor() {
    this.receipts = new Map();
    this.versions = new Map();
    this.records = new Map();
    this.outbox = new Map();
    this.delivered = new Map();
    this.commitCount = 0;
    this.failMode = null;
    this.lastTransaction = null;
  }

  getCommandReceipt(commandId) { return this.receipts.get(commandId) || null; }
  getLogicalVersion(key) { return this.versions.get(key) || 0; }
  getPendingIdentityEvents(limit) { return [...this.outbox.values()].filter((event) => !this.delivered.has(event.event_id)).slice(0, limit); }
  markIdentityEventDelivered(eventId, evidenceRef) {
    if (!this.outbox.has(eventId)) throw new Error('event missing');
    const prior = this.delivered.get(eventId);
    if (prior && prior !== evidenceRef) throw new Error('ack conflict');
    this.delivered.set(eventId, evidenceRef);
    return { event_id: eventId, evidence_ref: evidenceRef };
  }

  commitIdentityMutation(transaction) {
    this.commitCount += 1;
    this.lastTransaction = transaction;
    if (this.failMode === 'UNKNOWN_BEFORE_COMMIT') {
      const error = new Error('transport lost before commit');
      error.code = 'UNKNOWN_WRITE_OUTCOME';
      throw error;
    }
    for (const [key, expected] of Object.entries(transaction.expected_versions || {})) {
      const actual = this.getLogicalVersion(key);
      if (actual !== expected) {
        const error = new Error('stale');
        error.code = 'STALE_BASE';
        error.details = { key, expected, actual };
        throw error;
      }
    }
    for (const write of transaction.writes) {
      this.records.set(write.logical_key, JSON.parse(JSON.stringify(write.value)));
      this.versions.set(write.logical_key, this.getLogicalVersion(write.logical_key) + 1);
    }
    this.receipts.set(transaction.command_id, transaction.receipt);
    this.outbox.set(transaction.outbox_event.event_id, transaction.outbox_event);
    if (this.failMode === 'UNKNOWN_AFTER_COMMIT') {
      const error = new Error('response lost after commit');
      error.code = 'UNKNOWN_WRITE_OUTCOME';
      throw error;
    }
    return transaction.receipt;
  }
}

function fixture({ allow = true, failMode = null } = {}) {
  const store = new TestStore();
  store.failMode = failMode;
  const policy = new IdentityPolicyPort({
    authorize: () => allow ? { allowed: true, decision_ref: '001Q:AUTH-1' } : { allowed: false, reason: 'DENIED' },
    classifyForStorage: ({ data_classification }) => ({ approved: true, storage_profile_ref: `001P:STORE:${data_classification}`, redaction_profile_ref: `001Q:REDACT:${data_classification}` })
  });
  const consistency = new IdentityConsistencyPort({
    validateExpectedVersions: ({ expected_versions }) => {
      const conflicts = Object.entries(expected_versions || {}).filter(([key, expected]) => store.getLogicalVersion(key) !== expected);
      return conflicts.length ? { valid: false, reason: 'VERSION_MISMATCH', conflicts } : { valid: true };
    },
    reconcileCommand: ({ command_id }) => ({ standing: store.getCommandReceipt(command_id) ? 'COMMITTED' : 'NOT_COMMITTED' })
  });
  const executor = new DurableIdentityCommandExecutor({ storePort: store, policyPort: policy, consistencyPort: consistency, clock: () => Date.parse('2026-09-11T23:10:00.000Z') });
  return { store, policy, consistency, executor };
}

function command(executor, overrides = {}) {
  return executor.execute({
    command_id: overrides.command_id || 'CMD-1',
    actor_ref: overrides.actor_ref || 'USER:BF',
    operation: overrides.operation || 'REGISTER_IDENTITY',
    subject_refs: overrides.subject_refs || [A],
    expected_versions: overrides.expected_versions || { [`identity:${A}`]: 0 },
    request: overrides.request || { entity_id: A, entity_kind: 'PROJECT' },
    record_kind: overrides.record_kind || 'EntityIdentity',
    data_classification: overrides.data_classification || 'INTERNAL',
    sensitive: overrides.sensitive || false,
    planMutation: overrides.planMutation || (() => ({
      writes: [{ logical_key: `identity:${A}`, record_kind: 'EntityIdentity', entity_id: A, value: { entity_id: A, entity_kind: 'PROJECT' } }],
      result: { entity_id: A },
      result_refs: [A],
      event_type: 'IDENTITY_ALLOCATED'
    }))
  });
}

test('IdentityStorePort is logical and fails closed when required 001P transaction methods are absent', () => {
  assert.throws(() => new IdentityStorePortContract({ getCommandReceipt() {} }), (error) => error instanceof IdentityError && error.code === 'STORE_UNAVAILABLE');
});

test('same command plus same semantics returns durable prior receipt and cannot duplicate identity effects', () => {
  const { store, executor } = fixture();
  const first = command(executor);
  const second = command(executor);
  assert.deepEqual(second, first);
  assert.equal(store.commitCount, 1);
  assert.equal(store.records.size, 1);
  assert.equal(store.getLogicalVersion(`identity:${A}`), 1);
});

test('reusing command_id with different semantic request is rejected as DUPLICATE_COMMAND', () => {
  const { executor } = fixture();
  command(executor);
  assert.throws(() => command(executor, { request: { entity_id: A, entity_kind: 'DIFFERENT' } }), (error) => error instanceof IdentityError && error.code === 'DUPLICATE_COMMAND');
});

test('expected-version mismatch is rejected before durable write and prevents lost update', () => {
  const { store, executor } = fixture();
  store.versions.set(`identity:${A}`, 4);
  assert.throws(() => command(executor, { expected_versions: { [`identity:${A}`]: 3 } }), (error) => error instanceof IdentityError && error.code === 'STALE_BASE');
  assert.equal(store.commitCount, 0);
});

test('unknown outcome after commit is reconciled by command identity and returns the committed receipt', () => {
  const { store, executor } = fixture({ failMode: 'UNKNOWN_AFTER_COMMIT' });
  const receipt = command(executor);
  assert.equal(receipt.command_id, 'CMD-1');
  assert.equal(store.getCommandReceipt('CMD-1').command_id, 'CMD-1');
  assert.equal(store.records.get(`identity:${A}`).entity_id, A);
});

test('unknown outcome before commit is never converted into retry-as-new', () => {
  const { store, executor } = fixture({ failMode: 'UNKNOWN_BEFORE_COMMIT' });
  assert.throws(() => command(executor), (error) => error instanceof IdentityError && error.code === 'PARTIAL_WRITE' && error.details.retry_same_command_id === true);
  assert.equal(store.getCommandReceipt('CMD-1'), null);
  assert.equal(store.records.size, 0);
});

test('001Q denial prevents protected identity mutation; possession of EntityId is never authorization', () => {
  const { store, executor } = fixture({ allow: false });
  assert.throws(() => command(executor), (error) => error instanceof IdentityError && error.code === 'OWNER_REQUIRED');
  assert.equal(store.commitCount, 0);
});

test('001Q provider failure is POLICY_UNAVAILABLE and never falls back to local allow-by-id', () => {
  const store = new TestStore();
  const policy = new IdentityPolicyPort({ authorize: () => { throw new Error('auth down'); }, classifyForStorage: () => ({ approved: true, storage_profile_ref: 'S', redaction_profile_ref: 'R' }) });
  const consistency = new IdentityConsistencyPort({ validateExpectedVersions: () => true, reconcileCommand: () => ({ standing: 'NOT_COMMITTED' }) });
  const executor = new DurableIdentityCommandExecutor({ storePort: store, policyPort: policy, consistencyPort: consistency });
  assert.throws(() => command(executor), (error) => error instanceof IdentityError && error.code === 'POLICY_UNAVAILABLE');
  assert.equal(store.commitCount, 0);
});

test('sensitive external identity persistence requires explicit classification and approved protected representation', () => {
  const { store, executor } = fixture();
  assert.throws(() => command(executor, {
    operation: 'BIND_EXTERNAL_IDENTITY',
    record_kind: 'ExternalIdentityBinding',
    data_classification: '',
    sensitive: true,
    request: { external_value: 'provider-secret-123' },
    planMutation: () => ({ writes: [{ logical_key: 'external:1', record_kind: 'ExternalIdentityBinding', entity_id: A, sensitive: true, value: { external_value: 'provider-secret-123' } }] })
  }), (error) => error instanceof IdentityError && error.code === 'PRIVACY_CLASSIFICATION_MISSING');
  assert.equal(store.commitCount, 0);
});

test('classified sensitive mutation records protected store profile and redacted evidence only', () => {
  const { store, executor } = fixture();
  const secret = 'provider-secret-123';
  const receipt = command(executor, {
    operation: 'BIND_EXTERNAL_IDENTITY',
    record_kind: 'ExternalIdentityBinding',
    data_classification: 'RESTRICTED',
    sensitive: true,
    request: { external_value: secret },
    expected_versions: { 'external:1': 0 },
    planMutation: () => ({
      writes: [{ logical_key: 'external:1', record_kind: 'ExternalIdentityBinding', entity_id: A, sensitive: true, data_classification: 'RESTRICTED', value: { entity_id: A, external_value: secret } }],
      result: { binding_id: 'B1' },
      result_refs: ['B1'],
      event_type: 'EXTERNAL_IDENTITY_BOUND'
    })
  });
  assert.equal(receipt.storage_profile_ref, '001P:STORE:RESTRICTED');
  const event = store.outbox.get('identity-event:CMD-1');
  assert.equal(event.evidence_payload.raw_sensitive_values_included, false);
  assert.equal(JSON.stringify(event).includes(secret), false);
  assert.match(event.evidence_payload.payload_digest_sha256, /^[0-9a-f]{64}$/);
});

test('atomic 001P transaction binds writes receipt and outbox event while physical implementation remains external', () => {
  const { store, executor } = fixture();
  command(executor);
  const tx = store.lastTransaction;
  assert.equal(tx.logical_atomicity_required, true);
  assert.equal(tx.physical_store_owner, 'PROGRAMMING-FOUNDATION-001P');
  assert.equal(tx.receipt.command_id, 'CMD-1');
  assert.equal(tx.outbox_event.command_id, 'CMD-1');
  assert.equal(tx.writes.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(tx, 'database'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(tx, 'encryption_key'), false);
});

test('001S evidence delivery is a projection: acknowledgement does not become a second identity truth store', () => {
  const { store, executor } = fixture();
  command(executor);
  const port = new IdentityStorePortContract(store);
  const emitter = new IdentityEvidenceEmitter({ storePort: port, emitEvidence: (event) => ({ evidence_ref: `001S:${event.event_id}` }) });
  const delivered = emitter.deliverPending();
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].evidence_ref, '001S:identity-event:CMD-1');
  assert.equal(store.records.get(`identity:${A}`).entity_id, A);
  assert.equal(store.delivered.get('identity-event:CMD-1'), '001S:identity-event:CMD-1');
  assert.equal(store.outbox.get('identity-event:CMD-1').authoritative_identity_truth, false);
});

test('001S outage leaves committed identity truth and pending durable event intact for retry', () => {
  const { store, executor } = fixture();
  command(executor);
  const emitter = new IdentityEvidenceEmitter({ storePort: new IdentityStorePortContract(store), emitEvidence: () => { throw new Error('sink down'); } });
  assert.throws(() => emitter.deliverPending(), (error) => error instanceof IdentityError && error.code === 'EVIDENCE_SINK_UNAVAILABLE');
  assert.equal(store.records.get(`identity:${A}`).entity_id, A);
  assert.equal(store.getPendingIdentityEvents(10).length, 1);
});

test('canonical opaque identifier validator rejects business strings instead of promoting PII or paths to EntityId', () => {
  assert.equal(assertOpaqueCanonicalId(A), A);
  for (const bad of ['user@example.com', 'tenant/acme/project', 'runner-host-1']) {
    assert.throws(() => assertOpaqueCanonicalId(bad), (error) => error instanceof IdentityError && error.code === 'INVALID_CANONICAL_ID');
  }
});
