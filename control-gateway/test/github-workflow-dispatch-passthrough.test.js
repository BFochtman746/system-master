import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeA01Dispatch, GitHubWorkflowDispatchError } from '../src/github-workflow-dispatch.js';

const sha = '0123456789abcdef0123456789abcdef01234567';
const base = {
  qualification_id: 'P06-QUALIFICATION',
  workstream_id: 'SYSTEM-MASTER',
  subject_sha: sha,
  origin_ref: 'refs/heads/recovery/foundation-p06-current-requalification-001',
  resume_on_pass: 'continue',
  resume_on_failure: 'repair',
  execution_context: 'normal',
  qualifier_timeout_minutes: 28,
  job_timeout_minutes: 30,
  repair_attempt: 0,
  max_repair_attempts: 1
};

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof GitHubWorkflowDispatchError);
    assert.equal(error.code, code);
    return true;
  });
}

test('1 full fifteen-field overnight packet survives the ten-input GitHub envelope and workflow route', () => {
  const packet = normalizeA01Dispatch({
    ref: 'main',
    inputs: {
      ...base,
      execution_context: 'overnight',
      notification_target: 'foundation-owner',
      not_before: '2026-09-15T03:00:00Z',
      not_after: '2026-09-15T05:00:00+00:00',
      repair_attempt: 1,
      max_repair_attempts: 2,
      repair_transaction_id: 'repair-p06-001'
    }
  });
  assert.equal(Object.keys(packet.inputs).length, 10);
  const advanced = JSON.parse(packet.inputs.advanced_json);
  assert.deepEqual(advanced, {
    notification_target: 'foundation-owner',
    qualifier_timeout_minutes: 28,
    job_timeout_minutes: 30,
    not_before: '2026-09-15T03:00:00Z',
    not_after: '2026-09-15T05:00:00+00:00',
    repair_transaction_id: 'repair-p06-001'
  });
  assert.equal(packet.inputs.repair_attempt, '1');
  assert.equal(packet.inputs.max_repair_attempts, '2');

  const bridge = fs.readFileSync(new URL('../../.github/workflows/a01-control-plane-dispatch-bridge.yml', import.meta.url), 'utf8');
  const gateway = fs.readFileSync(new URL('../../.github/workflows/a01-control-plane-gateway.yml', import.meta.url), 'utf8');
  for (const field of ['notification_target', 'qualifier_timeout_minutes', 'job_timeout_minutes', 'not_before', 'not_after', 'repair_transaction_id']) {
    assert.ok(bridge.includes(`${field}:`), `bridge must forward ${field}`);
    assert.ok(gateway.includes(`${field}:`), `gateway must accept/forward ${field}`);
  }
});

test('2 normal packet applies stable defaults without a window or repair lineage', () => {
  const packet = normalizeA01Dispatch({ ref: 'main', inputs: base });
  const advanced = JSON.parse(packet.inputs.advanced_json);
  assert.equal(advanced.notification_target, 'originating-workstream');
  assert.equal(advanced.qualifier_timeout_minutes, 28);
  assert.equal(advanced.job_timeout_minutes, 30);
  assert.equal(advanced.not_before, '');
  assert.equal(advanced.not_after, '');
  assert.equal(advanced.repair_transaction_id, '');
});

test('3 invalid subject sha fails closed with DISPATCH_INPUT_INVALID', () => {
  expectCode(() => normalizeA01Dispatch({ ref: 'main', inputs: { ...base, subject_sha: 'ABC' } }), 'DISPATCH_INPUT_INVALID');
});

test('4 traversal in origin_ref fails closed with DISPATCH_INPUT_INVALID', () => {
  expectCode(() => normalizeA01Dispatch({ ref: 'main', inputs: { ...base, origin_ref: 'refs/heads/../main' } }), 'DISPATCH_INPUT_INVALID');
});

test('5 unregistered execution context fails closed with DISPATCH_INPUT_INVALID', () => {
  expectCode(() => normalizeA01Dispatch({ ref: 'main', inputs: { ...base, execution_context: 'unbounded' } }), 'DISPATCH_INPUT_INVALID');
});

test('6 timeout outside 1..360 fails closed with DISPATCH_BUDGET_INVALID', () => {
  expectCode(() => normalizeA01Dispatch({ ref: 'main', inputs: { ...base, qualifier_timeout_minutes: 0 } }), 'DISPATCH_BUDGET_INVALID');
});

test('7 outer job budget must exceed qualifier budget', () => {
  expectCode(() => normalizeA01Dispatch({ ref: 'main', inputs: { ...base, qualifier_timeout_minutes: 30, job_timeout_minutes: 30 } }), 'DISPATCH_BUDGET_INVALID');
});

test('8 overnight execution requires both window bounds', () => {
  expectCode(() => normalizeA01Dispatch({ ref: 'main', inputs: { ...base, execution_context: 'overnight', not_before: '2026-09-15T03:00:00Z' } }), 'DISPATCH_WINDOW_INVALID');
});

test('9 overnight bounds require explicit timezone offsets', () => {
  expectCode(() => normalizeA01Dispatch({ ref: 'main', inputs: { ...base, execution_context: 'overnight', not_before: '2026-09-15T03:00:00', not_after: '2026-09-15T05:00:00Z' } }), 'DISPATCH_WINDOW_INVALID');
});

test('10 overnight not_before must be strictly before not_after', () => {
  expectCode(() => normalizeA01Dispatch({ ref: 'main', inputs: { ...base, execution_context: 'overnight', not_before: '2026-09-15T05:00:00Z', not_after: '2026-09-15T03:00:00Z' } }), 'DISPATCH_WINDOW_INVALID');
});

test('11 non-overnight execution rejects supplied windows instead of ignoring them', () => {
  expectCode(() => normalizeA01Dispatch({ ref: 'main', inputs: { ...base, not_before: '2026-09-15T03:00:00Z', not_after: '2026-09-15T05:00:00Z' } }), 'DISPATCH_WINDOW_INVALID');
});

test('12 repair attempts above zero require a repair transaction id', () => {
  expectCode(() => normalizeA01Dispatch({ ref: 'main', inputs: { ...base, execution_context: 'repair', repair_attempt: 1, max_repair_attempts: 2 } }), 'DISPATCH_LINEAGE_INVALID');
});
