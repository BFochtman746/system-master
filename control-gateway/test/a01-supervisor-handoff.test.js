import test from 'node:test';
import assert from 'node:assert/strict';
import {
  A01_ADMISSION_REQUEST_PROTOCOL,
  admitA01Execution,
  buildA01SupervisorHandoff,
  validateA01AdmissionReceipt,
  validateA01SupervisorHandoff,
  A01SupervisorHandoffError
} from '../src/a01-supervisor-handoff.js';
import { CG001_MISSION_VERSION, sha256 } from '../src/active-work-state.js';

const PUB = 'a'.repeat(40);
const PACKET = 'b'.repeat(64);
const SUBJECT = 'c'.repeat(40);
const HEAD = 'd'.repeat(40);
const PREDECESSOR = 'RECEIPT-CG008-PREDECESSOR';
const DEP = 'RECEIPT-DEPENDENCY-001';

function authority(overrides = {}) {
  return {
    mission_version: CG001_MISSION_VERSION,
    workstream_id: 'SECOND-SHIFT-CONTROL-GATEWAY',
    authority_epoch: 9,
    publication_commit_sha: PUB,
    packet_digest: PACKET,
    authoritative_subject: { algorithm: 'sha1', oid: SUBJECT },
    repository: 'BFochtman746/system-master',
    branch_or_ref: 'second-shift-control-gateway/cg-009-dependency-ordering',
    qualification_state: 'PASSED',
    github_admission_state: 'ADMITTED',
    a01_state: 'PENDING',
    current_operation: { operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-009', predecessor_receipt_id: PREDECESSOR, state: 'ACTIVE' },
    receipt_index: [{ receipt_id: DEP, operation_id: 'DEP', outcome: 'SUCCEEDED', satisfies_dependency: true, subject: { algorithm: 'sha1', oid: SUBJECT } }],
    ...overrides
  };
}

function payload() { return { qualification_id: 'SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS', exact_subject: SUBJECT }; }

function request(overrides = {}) {
  const body = payload();
  return {
    protocol_version: A01_ADMISSION_REQUEST_PROTOCOL,
    admission_id: 'A01-ADMISSION-001',
    mission_version: CG001_MISSION_VERSION,
    workstream_id: 'SECOND-SHIFT-CONTROL-GATEWAY',
    authority_epoch: 9,
    authority_publication_commit_sha: PUB,
    authority_packet_digest: PACKET,
    authoritative_subject: { algorithm: 'sha1', oid: SUBJECT },
    repository: 'BFochtman746/system-master',
    authority_ref: 'second-shift-control-gateway/cg-009-dependency-ordering',
    authority_ref_head_sha: SUBJECT,
    operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-009',
    predecessor_receipt_id: PREDECESSOR,
    command_id: 'CMD-001',
    task_id: 'TASK-001',
    idempotency_key: 'IDEM-001',
    execution_class: 'OVERNIGHT',
    execution_order: 7,
    priority: 100,
    not_before: '2026-09-12T04:00:00.000Z',
    not_after: '2026-09-12T10:00:00.000Z',
    lane: 'CONTROL_GATEWAY',
    owner_path: 'CONTROL_GATEWAY/A01',
    delegation_id: 'DELEGATION-001',
    objective_id: 'OBJECTIVE-001',
    control_ref: 'second-shift-control-gateway/cg-009-dependency-ordering',
    control_head: HEAD,
    executor_kind: 'A01_CONTROL_PLANE_QUALIFICATION',
    payload_digest: sha256(body),
    dependency_receipt_ids: [DEP],
    ...overrides
  };
}

async function expectCode(code, fn) {
  await assert.rejects(fn, (error) => error instanceof A01SupervisorHandoffError && error.code === code);
}

test('exact durable authority and dependencies grant deterministic A-01 admission', () => {
  const first = admitA01Execution({ request: request(), authority: authority() });
  const second = admitA01Execution({ request: request(), authority: authority() });
  assert.equal(first.decision, 'GRANTED');
  assert.equal(first.scheduling_owner, 'A01_SUPERVISOR');
  assert.equal(first.github_role, 'ADMISSION_TRANSPORT_EVIDENCE_ONLY');
  assert.equal(first.admission_digest, second.admission_digest);
  assert.equal(validateA01AdmissionReceipt(first), true);
});

test('stale publication head fails closed', async () => {
  await expectCode('A01_AUTHORITY_HEAD_MISMATCH', async () => admitA01Execution({ request: request({ authority_publication_commit_sha: 'e'.repeat(40) }), authority: authority() }));
});

test('wrong predecessor receipt fails closed', async () => {
  await expectCode('A01_OPERATION_MISMATCH', async () => admitA01Execution({ request: request({ predecessor_receipt_id: 'WRONG' }), authority: authority() }));
});

test('GitHub admission must be admitted before A-01 release', async () => {
  await expectCode('A01_GITHUB_ADMISSION_REQUIRED', async () => admitA01Execution({ request: request(), authority: authority({ github_admission_state: 'PENDING' }) }));
});

test('blocked A-01 standing fails closed', async () => {
  await expectCode('A01_STANDING_INVALID', async () => admitA01Execution({ request: request(), authority: authority({ a01_state: 'BLOCKED' }) }));
});

test('non-qualification work requires qualified authority', async () => {
  await expectCode('A01_QUALIFICATION_REQUIRED', async () => admitA01Execution({ request: request(), authority: authority({ qualification_state: 'PENDING' }) }));
});

test('A-01 qualification work may execute while qualification itself is pending', () => {
  const req = request({ execution_class: 'A01_QUALIFICATION', not_before: null, not_after: null });
  const receipt = admitA01Execution({ request: req, authority: authority({ qualification_state: 'PENDING' }) });
  assert.equal(receipt.decision, 'GRANTED');
});

test('missing durable dependency receipt fails closed', async () => {
  await expectCode('A01_DEPENDENCY_UNSATISFIED', async () => admitA01Execution({ request: request({ dependency_receipt_ids: ['MISSING'] }), authority: authority() }));
});

test('supervisor handoff binds exact admitted payload and leaves scheduling ownership on A-01', () => {
  const req = request();
  const receipt = admitA01Execution({ request: req, authority: authority() });
  const handoff = buildA01SupervisorHandoff({ request: req, admissionReceipt: receipt, payload: payload() });
  assert.equal(handoff.scheduling_owner, 'A01_SUPERVISOR');
  assert.equal(handoff.github_role, 'ADMISSION_TRANSPORT_EVIDENCE_ONLY');
  assert.equal(validateA01SupervisorHandoff(handoff), true);
});

test('tampered payload is rejected before handoff', async () => {
  const req = request(); const receipt = admitA01Execution({ request: req, authority: authority() });
  await expectCode('A01_HANDOFF_PAYLOAD_MISMATCH', async () => buildA01SupervisorHandoff({ request: req, admissionReceipt: receipt, payload: { qualification_id: 'TAMPERED' } }));
});

test('tampered admission receipt is rejected', async () => {
  const receipt = structuredClone(admitA01Execution({ request: request(), authority: authority() }));
  receipt.execution_order += 1;
  await expectCode('A01_RECEIPT_REQUEST_DIGEST_MISMATCH', async () => validateA01AdmissionReceipt(receipt));
});

test('tampered supervisor scheduling owner is rejected', async () => {
  const req = request(); const receipt = admitA01Execution({ request: req, authority: authority() });
  const handoff = structuredClone(buildA01SupervisorHandoff({ request: req, admissionReceipt: receipt, payload: payload() }));
  handoff.scheduling_owner = 'GITHUB_ACTIONS';
  await expectCode('A01_SCHEDULER_AUTHORITY_INVALID', async () => validateA01SupervisorHandoff(handoff));
});

test('owner control head is independently carried from the authority ref head', () => {
  const receipt = admitA01Execution({ request: request({ control_head: 'f'.repeat(40) }), authority: authority() });
  assert.equal(receipt.authority_ref_head_sha, SUBJECT);
  assert.equal(receipt.control_head, 'f'.repeat(40));
});

test('stale authority ref head fails closed', async () => {
  await expectCode('A01_AUTHORITY_REF_HEAD_MISMATCH', async () => admitA01Execution({ request: request({ authority_ref_head_sha: HEAD }), authority: authority() }));
});
