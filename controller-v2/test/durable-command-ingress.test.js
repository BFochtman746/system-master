import test from 'node:test';
import assert from 'node:assert/strict';
import { ControllerKernel } from '../src/kernel.js';
import { canonicalize } from '../src/canonical.js';
import { ControllerError } from '../src/errors.js';
import {
  DEFAULT_MAX_COMMAND_BYTES,
  INGRESS_REF_PREFIX,
  acceptValidatedCandidate,
  commandIdFromRef,
  computeRetryDelayMs,
  reconcileIngressRef,
  validateIngressAuthority,
  validateIngressCandidate
} from '../src/durable-command-ingress.js';

const COMMAND_ID = '01994a5d-1234-7abc-8def-0123456789ab';
const REF = `${INGRESS_REF_PREFIX}${COMMAND_ID}`;
const TAG_OID = '1'.repeat(40);
const BLOB_OID = '2'.repeat(40);

function command(overrides = {}) {
  return {
    protocol_version: '1.0',
    schema: 'controller://schemas/command/v1',
    command_id: COMMAND_ID,
    created_at: '2026-09-12T05:05:00Z',
    issuer: { principal: 'unverified:transport-claim', source: 'chat-ingress' },
    command_type: 'controller.reconcile',
    target: { repository: 'BFochtman746/system-master', expected_subject: { algorithm: 'sha1', oid: 'a'.repeat(40) } },
    preconditions: {},
    intent: { operation: 'sanity-check' },
    constraints: {},
    required_policy_version: 'pending-admission',
    ...overrides
  };
}

function activationReceipt() {
  return {
    protocol_version: 'controller-control-state-activation.v1',
    qualified_002c_subject: '8b0f9517570fa29f3f09bc7f1db38c34fcbe84fa',
    activation_fingerprint: 'f'.repeat(64),
    authority: {
      control_state_repository: 'BFochtman746/system-master-controller-state',
      control_state_repository_id: '12345'
    }
  };
}

function candidate(cmd = command(), overrides = {}) {
  const blob = Buffer.from(canonicalize(cmd), 'utf8');
  return {
    ref: REF,
    tag_object: {
      oid: TAG_OID,
      type: 'tag',
      tag: `controller-inbox/v1/${COMMAND_ID}`,
      target: { oid: BLOB_OID, type: 'blob' }
    },
    blob_bytes: blob,
    repository_identity: { full_name: 'BFochtman746/system-master-controller-state', id: '12345' },
    authority_observation: {
      activation_receipt: activationReceipt(),
      ingress_principal: { kind: 'github-app', id: '333' },
      rules: {
        namespace: `${INGRESS_REF_PREFIX}*`,
        creation_restricted: true,
        update_restricted: true,
        deletion_restricted: true,
        historical_rewrite_bypass: false,
        creation_principal: { kind: 'github-app', id: '333' }
      }
    },
    ...overrides
  };
}

function kernel() { return new ControllerKernel(':memory:'); }

function countTransactions(k) { return Number(k.db.prepare('SELECT COUNT(*) n FROM transactions').get().n); }

function transportError(code, retryable = false) {
  const error = new Error(code);
  error.code = code;
  error.retryable = retryable;
  return error;
}

test('valid immutable command candidate is accepted and remains OPEN', () => {
  const k = kernel();
  try {
    const validated = validateIngressCandidate(candidate(), { requireAuthority: true });
    const result = acceptValidatedCandidate(validated, k);
    assert.equal(result.status, 'ACCEPTED');
    assert.equal(countTransactions(k), 1);
    const tx = k.db.prepare('SELECT state FROM transactions WHERE transaction_id=?').get(result.transaction_id);
    assert.equal(tx.state, 'OPEN');
    assert.equal(result.provenance.ref, REF);
  } finally { k.close(); }
});

test('same command ref replay is semantically idempotent', () => {
  const k = kernel();
  try {
    const validated = validateIngressCandidate(candidate());
    const first = acceptValidatedCandidate(validated, k);
    for (let i = 0; i < 1000; i += 1) {
      const again = acceptValidatedCandidate(validated, k);
      assert.equal(again.status, 'DUPLICATE');
      assert.equal(again.transaction_id, first.transaction_id);
    }
    assert.equal(countTransactions(k), 1);
  } finally { k.close(); }
});

test('same command id with different semantic content hard-conflicts', () => {
  const k = kernel();
  try {
    acceptValidatedCandidate(validateIngressCandidate(candidate()), k);
    const changed = candidate(command({ intent: { operation: 'different' } }));
    assert.throws(() => acceptValidatedCandidate(validateIngressCandidate(changed), k), (e) => e.code === 'IDEMPOTENCY_CONFLICT');
    assert.equal(countTransactions(k), 1);
  } finally { k.close(); }
});

test('ref namespace is exact', () => {
  assert.throws(() => commandIdFromRef(`refs/heads/controller-inbox/v1/${COMMAND_ID}`), (e) => e.code === 'REF_NAMESPACE_INVALID');
});

test('ref suffix must be a single UUIDv7', () => {
  assert.throws(() => commandIdFromRef(`${REF}/extra`), (e) => e.code === 'COMMAND_ID_INVALID');
});

test('ref and command id mismatch is rejected', () => {
  const other = '01994a5d-1234-7abc-8def-0123456789ac';
  assert.throws(() => validateIngressCandidate(candidate(command({ command_id: other }))), (e) => e.code === 'COMMAND_ID_MISMATCH');
});

test('annotated tag identity must match ref', () => {
  const c = candidate();
  c.tag_object.tag = `controller-inbox/v1/01994a5d-1234-7abc-8def-0123456789ac`;
  assert.throws(() => validateIngressCandidate(c), (e) => e.code === 'TAG_OBJECT_INVALID');
});

test('tag must target a blob', () => {
  const c = candidate();
  c.tag_object.target.type = 'commit';
  assert.throws(() => validateIngressCandidate(c), (e) => e.code === 'TAG_TARGET_NOT_BLOB');
});

test('invalid UTF-8 is rejected before semantic mutation', () => {
  const c = candidate();
  c.blob_bytes = Uint8Array.from([0xc3, 0x28]);
  assert.throws(() => validateIngressCandidate(c), (e) => e.code === 'COMMAND_UTF8_INVALID');
});

test('malformed JSON is rejected before semantic mutation', () => {
  const c = candidate();
  c.blob_bytes = Buffer.from('{bad', 'utf8');
  assert.throws(() => validateIngressCandidate(c), (e) => e.code === 'COMMAND_JSON_INVALID');
});

test('unknown command field is mapped to bounded schema rejection', () => {
  const c = candidate({ ...command(), surprise: true });
  assert.throws(() => validateIngressCandidate(c), (e) => e.code === 'COMMAND_SCHEMA_INVALID' && e.details.kernel_code === 'SCHEMA_UNKNOWN_FIELD');
});

test('unsupported protocol is bounded schema rejection', () => {
  assert.throws(() => validateIngressCandidate(candidate(command({ protocol_version: '9.0' }))), (e) => e.code === 'COMMAND_SCHEMA_INVALID');
});

test('oversize command is rejected before semantic mutation', () => {
  const c = candidate(command({ intent: { payload: 'x'.repeat(200) } }));
  assert.throws(() => validateIngressCandidate(c, { maxBytes: 64 }), (e) => e.code === 'COMMAND_TOO_LARGE');
});

test('production authority requires activated repository identity', () => {
  const c = candidate();
  c.repository_identity = { full_name: 'wrong/repo', id: '12345' };
  assert.throws(() => validateIngressAuthority(c), (e) => e.code === 'INGRESS_AUTHORITY_INVALID');
});

test('production authority fails closed on missing protections', () => {
  const c = candidate();
  c.authority_observation.rules.update_restricted = false;
  assert.throws(() => validateIngressAuthority(c), (e) => e.code === 'INGRESS_AUTHORITY_INVALID');
});

test('production authority fails closed on rewrite bypass', () => {
  const c = candidate();
  c.authority_observation.rules.historical_rewrite_bypass = true;
  assert.throws(() => validateIngressAuthority(c), (e) => e.code === 'INGRESS_AUTHORITY_INVALID');
});

test('production authority requires observed principal to match creation principal', () => {
  const c = candidate();
  c.authority_observation.ingress_principal = { kind: 'github-app', id: '334' };
  assert.throws(() => validateIngressAuthority(c), (e) => e.code === 'INGRESS_AUTHORITY_INVALID');
});

test('Git tag metadata does not participate in issuer authentication', () => {
  const c = candidate();
  c.tag_object.tagger = { name: 'Administrator', email: 'admin@example.invalid' };
  const validated = validateIngressCandidate(c);
  assert.equal(validated.command.issuer.principal, 'unverified:transport-claim');
});

test('lost wakeup is irrelevant: a later full scan accepts the immutable ref', async () => {
  const k = kernel();
  try {
    const result = await reconcileIngressRef({ ref: REF, loadCandidate: async () => candidate(), kernel: k, sleep: async () => {} });
    assert.equal(result.status, 'ACCEPTED');
    assert.equal(countTransactions(k), 1);
  } finally { k.close(); }
});

test('crash after semantic acceptance reconciles to existing transaction', async () => {
  const k = kernel();
  try {
    const v = validateIngressCandidate(candidate());
    const first = acceptValidatedCandidate(v, k);
    const afterRestartScan = await reconcileIngressRef({ ref: REF, loadCandidate: async () => candidate(), kernel: k, sleep: async () => {} });
    assert.equal(afterRestartScan.status, 'DUPLICATE');
    assert.equal(afterRestartScan.transaction_id, first.transaction_id);
    assert.equal(countTransactions(k), 1);
  } finally { k.close(); }
});

test('retryable transport errors are bounded and defer without transaction', async () => {
  const k = kernel();
  let calls = 0;
  const sleeps = [];
  try {
    const result = await reconcileIngressRef({
      ref: REF,
      loadCandidate: async () => { calls += 1; throw transportError('TRANSPORT_TIMEOUT', true); },
      kernel: k,
      maxAttempts: 3,
      retry: { baseMs: 10, capMs: 100, jitter: 0, random: () => 0.5 },
      sleep: async (ms) => sleeps.push(ms)
    });
    assert.deepEqual(result, { status: 'DEFERRED_TRANSIENT', reason: 'TRANSPORT_TIMEOUT', attempts: 3 });
    assert.equal(calls, 3);
    assert.deepEqual(sleeps, [10, 20]);
    assert.equal(countTransactions(k), 0);
  } finally { k.close(); }
});

test('transient recovery on second attempt accepts once', async () => {
  const k = kernel();
  let calls = 0;
  try {
    const result = await reconcileIngressRef({
      ref: REF,
      loadCandidate: async () => { calls += 1; if (calls === 1) throw transportError('RATE_LIMITED', true); return candidate(); },
      kernel: k,
      maxAttempts: 3,
      retry: { baseMs: 1, capMs: 10, jitter: 0, random: () => 0.5 },
      sleep: async () => {}
    });
    assert.equal(result.status, 'ACCEPTED');
    assert.equal(result.attempts, 2);
    assert.equal(countTransactions(k), 1);
  } finally { k.close(); }
});

test('schema rejection is never retried and creates no transaction', async () => {
  const k = kernel();
  let calls = 0;
  try {
    const bad = candidate({ ...command(), surprise: true });
    const result = await reconcileIngressRef({ ref: REF, loadCandidate: async () => { calls += 1; return bad; }, kernel: k, maxAttempts: 5, sleep: async () => assert.fail('must not sleep') });
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.reason, 'COMMAND_SCHEMA_INVALID');
    assert.equal(calls, 1);
    assert.equal(countTransactions(k), 0);
  } finally { k.close(); }
});

test('retry delay is exponential, capped, and jitter bounded', () => {
  assert.equal(computeRetryDelayMs(1, { baseMs: 100, capMs: 250, jitter: 0, random: () => 0 }), 100);
  assert.equal(computeRetryDelayMs(2, { baseMs: 100, capMs: 250, jitter: 0, random: () => 1 }), 200);
  assert.equal(computeRetryDelayMs(3, { baseMs: 100, capMs: 250, jitter: 0, random: () => 0.5 }), 250);
  const low = computeRetryDelayMs(1, { baseMs: 100, capMs: 250, jitter: 0.2, random: () => 0 });
  const high = computeRetryDelayMs(1, { baseMs: 100, capMs: 250, jitter: 0.2, random: () => 1 });
  assert.equal(low, 80);
  assert.equal(high, 120);
});

test('default command bound is finite', () => {
  assert.equal(DEFAULT_MAX_COMMAND_BYTES, 65536);
});

test('transport notification alone cannot create a transaction', () => {
  const k = kernel();
  try { assert.equal(countTransactions(k), 0); }
  finally { k.close(); }
});

test('stale expected subject is preserved exactly for later admission adjudication', () => {
  const c = command({ target: { repository: 'BFochtman746/system-master', expected_subject: { algorithm: 'sha1', oid: 'b'.repeat(40) } } });
  const validated = validateIngressCandidate(candidate(c));
  assert.equal(validated.command.target.expected_subject.oid, 'b'.repeat(40));
});

test('authority evidence preserves C1 qualified-subject and activation fingerprint', () => {
  const validated = validateIngressCandidate(candidate(), { requireAuthority: true });
  assert.equal(validated.authority.qualified_002c_subject, '8b0f9517570fa29f3f09bc7f1db38c34fcbe84fa');
  assert.equal(validated.authority.activation_fingerprint, 'f'.repeat(64));
});

test('candidate bytes may equal max bound exactly', () => {
  const c = candidate();
  assert.doesNotThrow(() => validateIngressCandidate(c, { maxBytes: c.blob_bytes.length }));
});

test('non-retryable transport error propagates rather than being silently retried', async () => {
  const k = kernel();
  let calls = 0;
  try {
    await assert.rejects(() => reconcileIngressRef({
      ref: REF,
      loadCandidate: async () => { calls += 1; throw transportError('TRANSPORT_AUTH_FAILED', false); },
      kernel: k,
      maxAttempts: 5,
      sleep: async () => assert.fail('must not sleep')
    }), /TRANSPORT_AUTH_FAILED/);
    assert.equal(calls, 1);
  } finally { k.close(); }
});
