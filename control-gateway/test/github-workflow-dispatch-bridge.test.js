import test from 'node:test';
import assert from 'node:assert/strict';
import { A01_DISPATCH_WORKFLOW, A01_GATEWAY_WORKFLOW, normalizeA01Dispatch } from '../src/github-workflow-dispatch.js';

const bookInputs = {
  qualification_id: 'BOOK-SYSTEM-E2E-AUTHORITY-GUARDS-001',
  workstream_id: 'BOOK-SYSTEM',
  subject_sha: '9b2d7e3f5fb8244c7768c4732cddb491bfd11703',
  origin_ref: 'refs/heads/book-system/control-v1',
  execution_context: 'normal',
  qualifier_timeout_minutes: 28,
  job_timeout_minutes: 30,
  repair_attempt: 0,
  max_repair_attempts: 1
};

test('dispatch bridge is the default external workflow while gateway identity remains stable', () => {
  assert.equal(A01_GATEWAY_WORKFLOW, 'a01-control-plane-gateway.yml');
  assert.equal(A01_DISPATCH_WORKFLOW, 'a01-control-plane-dispatch-bridge.yml');
  const packet = normalizeA01Dispatch({ ref: 'main', inputs: bookInputs });
  assert.equal(packet.workflow, A01_DISPATCH_WORKFLOW);
  assert.equal(packet.inputs.repair_attempt, '0');
  assert.equal(packet.inputs.max_repair_attempts, '1');
  const advanced = JSON.parse(packet.inputs.advanced_json);
  assert.equal(advanced.qualifier_timeout_minutes, 28);
  assert.equal(advanced.job_timeout_minutes, 30);
  assert.equal(advanced.notification_target, 'originating-workstream');
  assert.equal(advanced.not_before, '');
  assert.equal(advanced.not_after, '');
  assert.equal(advanced.repair_transaction_id, '');
});
