import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ChatSessionAdmissionGate,
  InMemoryChatSessionClaimStore
} from '../src/chat-session-admission.js';

function continuation(overrides = {}) {
  return {
    workstream_id: 'SYSTEM_MASTER/CORE',
    authority_epoch: 7,
    current_operation: {
      operation_id: 'A01-CHAT-SESSION-ADMISSION-001',
      state: 'ACTIVE',
      predecessor_receipt_id: 'STEP7-RECEIPT'
    },
    next_legal_operation: {
      kind: 'CONTINUE_CURRENT',
      operation_id: 'A01-CHAT-SESSION-ADMISSION-001',
      predecessor_receipt_id: 'STEP7-RECEIPT',
      reason: 'CURRENT_OPERATION_ACTIVE'
    },
    allowed_paths_or_effects: {
      paths: [
        'control-gateway/src/**',
        'control-gateway/test/**'
      ],
      effects: [
        'CONTROL_GATEWAY_MUTATION'
      ]
    },
    ...overrides
  };
}

function adapter(value = continuation()) {
  return {
    async reconstructContinuation() {
      return structuredClone(value);
    }
  };
}

function claim(overrides = {}) {
  return {
    session_id: 'chat-session-001',
    owner_path: 'SYSTEM_MASTER/CORE',
    workstream_id: 'SYSTEM_MASTER/CORE',
    operation_id: 'A01-CHAT-SESSION-ADMISSION-001',
    authority_epoch: 7,
    claim_scope: {
      paths: [
        'control-gateway/src/chat-session-admission.js'
      ],
      effects: [
        'CONTROL_GATEWAY_MUTATION'
      ]
    },
    ...overrides
  };
}

function gate(authority = continuation()) {
  return new ChatSessionAdmissionGate({
    reconstructionAdapter: adapter(authority),
    claimStore: new InMemoryChatSessionClaimStore()
  });
}

test('first session acquires unclaimed scope', async () => {
  const admission = gate();

  const result = await admission.acquire(claim());

  assert.equal(result.decision, 'GRANTED');
  assert.equal(result.session_id, 'chat-session-001');
  assert.equal(result.idempotent, false);
  assert.match(result.claim_digest, /^[0-9a-f]{64}$/);
});

test('same session with identical claim reacquires idempotently', async () => {
  const admission = gate();
  const request = claim();

  const first = await admission.acquire(request);
  const second = await admission.acquire(request);

  assert.equal(first.decision, 'GRANTED');
  assert.equal(first.idempotent, false);

  assert.equal(second.decision, 'GRANTED');
  assert.equal(second.idempotent, true);

  assert.equal(second.claim_digest, first.claim_digest);
});

test('second session cannot acquire the same protected lane', async () => {
  const admission = gate();

  const first = await admission.acquire(claim());

  const second = await admission.acquire(
    claim({
      session_id: 'chat-session-002'
    })
  );

  assert.equal(first.decision, 'GRANTED');

  assert.equal(
    second.decision,
    'DENIED_ALREADY_CLAIMED'
  );

  assert.equal(
    second.conflicting_claim_digest,
    first.claim_digest
  );
});

test('second session cannot acquire overlapping mutation scope', async () => {
  const admission = gate();

  const first = await admission.acquire(
    claim({
      owner_path: 'SYSTEM_MASTER/CORE/foundation',
      claim_scope: {
        paths: [
          'control-gateway/src'
        ],
        effects: []
      }
    })
  );

  const second = await admission.acquire(
    claim({
      session_id: 'chat-session-002',
      owner_path: 'SYSTEM_MASTER/CORE/chat',
      claim_scope: {
        paths: [
          'control-gateway/src/chat-session-admission.js'
        ],
        effects: []
      }
    })
  );

  assert.equal(first.decision, 'GRANTED');

  assert.equal(
    second.decision,
    'DENIED_ALREADY_CLAIMED'
  );
});

test('claim exceeding durable allowed scope fails closed', async () => {
  const admission = gate();

  await assert.rejects(
    admission.acquire(
      claim({
        claim_scope: {
          paths: [
            '.github/workflows/unauthorized.yml'
          ],
          effects: []
        }
      })
    ),
    (error) => {
      assert.equal(
        error.code,
        'SESSION_SCOPE_EXCEEDS_AUTHORITY'
      );

      return true;
    }
  );
});

test('stale authority epoch or wrong operation fails closed', async (t) => {
  await t.test(
    'stale authority epoch',
    async () => {
      const admission = gate();

      await assert.rejects(
        admission.acquire(
          claim({
            authority_epoch: 6
          })
        ),
        (error) => {
          assert.equal(
            error.code,
            'SESSION_AUTHORITY_EPOCH_MISMATCH'
          );

          return true;
        }
      );
    }
  );

  await t.test(
    'wrong operation',
    async () => {
      const admission = gate();

      await assert.rejects(
        admission.acquire(
          claim({
            operation_id: 'OTHER-OPERATION-001'
          })
        ),
        (error) => {
          assert.equal(
            error.code,
            'SESSION_OPERATION_MISMATCH'
          );

          return true;
        }
      );
    }
  );
});