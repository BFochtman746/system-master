import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeA01Dispatch, GitHubWorkflowDispatchError } from '../src/github-workflow-dispatch.js';

const SUBJECT = '9b2d7e3f5fb8244c7768c4732cddb491bfd11703';

function base(overrides = {}) {
  return {
    qualification_id: 'BOOK-SYSTEM-E2E-AUTHORITY-GUARDS-001',
    workstream_id: 'BOOK-SYSTEM',
    subject_sha: SUBJECT,
    origin_ref: 'refs/heads/book-system/control-v1',
    resume_on_pass: 'Adjudicate PASS and continue.',
    resume_on_failure: 'Adjudicate evidence and repair.',
    execution_context: 'normal',
    qualifier_timeout_minutes: 28,
    job_timeout_minutes: 30,
    repair_attempt: 0,
    max_repair_attempts: 1,
    ...overrides
  };
}

function codeOf(fn) {
  try { fn(); } catch (error) {
    assert.ok(error instanceof GitHubWorkflowDispatchError, `expected dispatch error, received ${error}`);
    return error.code;
  }
  assert.fail('expected normalization to fail closed');
}

test('every registered field survives normalization', () => {
  const packet = normalizeA01Dispatch({ ref: 'main', inputs: base() });
  assert.deepEqual(Object.keys(packet.inputs).sort(), [
    'execution_context',
    'job_timeout_minutes',
    'max_repair_attempts',
    'not_after',
    'not_before',
    'notification_target',
    'origin_ref',
    'qualification_id',
    'qualifier_timeout_minutes',
    'repair_attempt',
    'repair_transaction_id',
    'resume_on_failure',
    'resume_on_pass',
    'subject_sha',
    'workstream_id'
  ]);
});

test('overnight admission window is carried, not dropped', () => {
  const packet = normalizeA01Dispatch({
    ref: 'main',
    inputs: base({
      execution_context: 'overnight',
      not_before: '2026-09-14T22:00:00-04:00',
      not_after: '2026-09-15T05:00:00-04:00'
    })
  });
  assert.equal(packet.inputs.not_before, '2026-09-14T22:00:00-04:00');
  assert.equal(packet.inputs.not_after, '2026-09-15T05:00:00-04:00');
  assert.equal(packet.inputs.execution_context, 'overnight');
});

test('repair transaction id is carried, not dropped', () => {
  const packet = normalizeA01Dispatch({
    ref: 'main',
    inputs: base({ repair_attempt: 1, max_repair_attempts: 2, repair_transaction_id: 'RT-BOOK-SYSTEM-0007' })
  });
  assert.equal(packet.inputs.repair_transaction_id, 'RT-BOOK-SYSTEM-0007');
  assert.equal(packet.inputs.repair_attempt, '1');
});

test('notification target defaults rather than vanishing', () => {
  assert.equal(normalizeA01Dispatch({ ref: 'main', inputs: base() }).inputs.notification_target, 'originating-workstream');
  assert.equal(
    normalizeA01Dispatch({ ref: 'main', inputs: base({ notification_target: 'second-shift-supervisor' }) }).inputs.notification_target,
    'second-shift-supervisor'
  );
});

test('overnight without a window fails closed', () => {
  assert.equal(
    codeOf(() => normalizeA01Dispatch({ ref: 'main', inputs: base({ execution_context: 'overnight' }) })),
    'DISPATCH_WINDOW_INVALID'
  );
});

test('window outside overnight fails closed', () => {
  assert.equal(
    codeOf(() => normalizeA01Dispatch({ ref: 'main', inputs: base({ not_before: '2026-09-14T22:00:00-04:00' }) })),
    'DISPATCH_WINDOW_INVALID'
  );
});

test('inverted window fails closed', () => {
  assert.equal(
    codeOf(() => normalizeA01Dispatch({
      ref: 'main',
      inputs: base({
        execution_context: 'overnight',
        not_before: '2026-09-15T05:00:00-04:00',
        not_after: '2026-09-14T22:00:00-04:00'
      })
    })),
    'DISPATCH_WINDOW_INVALID'
  );
});

test('naive timestamp without offset fails closed', () => {
  assert.equal(
    codeOf(() => normalizeA01Dispatch({
      ref: 'main',
      inputs: base({ execution_context: 'overnight', not_before: '2026-09-14 22:00', not_after: '2026-09-15T05:00:00-04:00' })
    })),
    'DISPATCH_WINDOW_INVALID'
  );
});

test('continued repair lineage without a transaction id fails closed', () => {
  assert.equal(
    codeOf(() => normalizeA01Dispatch({ ref: 'main', inputs: base({ repair_attempt: 1, max_repair_attempts: 2 }) })),
    'DISPATCH_INPUT_INVALID'
  );
});

test('malformed repair transaction id fails closed', () => {
  assert.equal(
    codeOf(() => normalizeA01Dispatch({ ref: 'main', inputs: base({ repair_transaction_id: 'RT 0007/../etc' }) })),
    'DISPATCH_INPUT_INVALID'
  );
});

test('job budget must exceed qualifier budget', () => {
  assert.equal(
    codeOf(() => normalizeA01Dispatch({ ref: 'main', inputs: base({ qualifier_timeout_minutes: 30, job_timeout_minutes: 30 }) })),
    'DISPATCH_INPUT_INVALID'
  );
});

test('unregistered execution context fails closed', () => {
  assert.equal(
    codeOf(() => normalizeA01Dispatch({ ref: 'main', inputs: base({ execution_context: 'midnight' }) })),
    'DISPATCH_INPUT_INVALID'
  );
});
