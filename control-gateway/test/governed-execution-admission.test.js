import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVELOPMENT_RESPONSE_CLASSES,
  DevelopmentResponseGovernorError,
  issueDevelopmentResponseReceipt
} from '../src/development-response-governor.js';
import {
  GovernedGitHubMutationAdmissionGate,
  admitGovernedA01Execution,
  buildGovernedA01SupervisorHandoff,
  buildGitHubDevelopmentResponseAuthorityContext,
  buildA01DevelopmentResponseAuthorityContext
} from '../src/governed-execution-admission.js';
import { GITHUB_MUTATION_REQUEST_PROTOCOL } from '../src/github-mutation-admission.js';
import { A01_ADMISSION_REQUEST_PROTOCOL } from '../src/a01-supervisor-handoff.js';
import { CG001_MISSION_VERSION, sha256 } from '../src/active-work-state.js';

const REPO = 'BFochtman746/system-master';
const WORKSTREAM = 'SECOND-SHIFT-CONTROL-GATEWAY';
const MISSION = CG001_MISSION_VERSION;
const BRANCH = 'second-shift-control-gateway/cg-004-github-publication';
const STATE_REF = 'control-gateway-state/active-work/second-shift-control-gateway-dev';
const PUBLICATION_SHA = '1'.repeat(40);
const PACKET_DIGEST = '2'.repeat(64);
const SUBJECT_SHA = '3'.repeat(40);
const TARGET_SHA = '4'.repeat(40);
const PREDECESSOR_RECEIPT = 'SECOND-SHIFT-CONTROL-GATEWAY-CG-004-LIVE-GITHUB-QUALIFICATION-34667378000';
const DEP = 'RECEIPT-DEPENDENCY-001';

const CONTINUATION_RESPONSE = `## STATUS\nWORKING\n\n## WORK COMPLETED\nBound the development response receipt to the governed controller admission path.\n\n## EVIDENCE / RESULT\nExecutable qualification covers both compliant and malformed response cases.\n\n## CURRENT BLOCKER\nNONE\n\n## EXACT NEXT STEP\nObjective: Preserve fail-closed response governance.\nFirst action: Require the governed admission wrapper before GitHub or A-01 authorization.\nPASS boundary: Missing, malformed, stale, or tampered response evidence is rejected before raw authorization.`;

function continuation(overrides = {}) {
  return {
    source: 'GITHUB_DURABLE_ACTIVE_WORK',
    publication_ref: STATE_REF,
    publication_commit_sha: PUBLICATION_SHA,
    publication_revision: 2,
    packet_digest: PACKET_DIGEST,
    mission_version: MISSION,
    workstream_id: WORKSTREAM,
    authority_epoch: 3,
    authoritative_subject: { algorithm: 'sha1', oid: SUBJECT_SHA },
    repository: REPO,
    branch_or_ref: BRANCH,
    allowed_paths_or_effects: {
      paths: ['.github/workflows/second-shift-control-gateway-cg-004.yml', 'control-gateway/**', 'governance/control-gateway/**'],
      effects: ['CONTROL_GATEWAY_DEVELOPMENT_WRITE', 'CONTROL_GATEWAY_STATE_PUBLICATION']
    },
    current_operation: {
      operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-004',
      state: 'TERMINAL',
      predecessor_receipt_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-003-HOST-QUALIFICATION-34666596357'
    },
    qualification_state: 'PASSED',
    github_admission_state: 'NOT_REQUIRED',
    a01_state: 'NOT_REQUIRED',
    successor_candidates: [{
      operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005',
      predecessor_receipt_id: PREDECESSOR_RECEIPT,
      required_receipt_ids: [],
      qualification_state: 'PENDING',
      github_admission_state: 'PENDING',
      a01_state: 'NOT_REQUIRED'
    }],
    next_legal_operation: {
      kind: 'START_SUCCESSOR',
      operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005',
      predecessor_receipt_id: PREDECESSOR_RECEIPT,
      reason: 'EXACTLY_ONE_DEPENDENCY_VALID_SUCCESSOR'
    },
    ...overrides
  };
}

function githubRequest(overrides = {}) {
  return {
    protocol_version: GITHUB_MUTATION_REQUEST_PROTOCOL,
    mutation_id: 'C04-GOVERNOR-TEST-001',
    mission_version: MISSION,
    workstream_id: WORKSTREAM,
    authority_epoch: 3,
    authority_publication_commit_sha: PUBLICATION_SHA,
    authority_packet_digest: PACKET_DIGEST,
    authoritative_subject: { algorithm: 'sha1', oid: SUBJECT_SHA },
    repository: REPO,
    target_kind: 'WORK_REF',
    target_ref: BRANCH,
    expected_predecessor_sha: TARGET_SHA,
    operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005',
    predecessor_receipt_id: PREDECESSOR_RECEIPT,
    paths: ['control-gateway/src/development-response-governor.js'],
    effects: ['CONTROL_GATEWAY_DEVELOPMENT_WRITE'],
    ...overrides
  };
}

class FakeAdapter {
  constructor(packet = continuation()) { this.packet = packet; this.calls = 0; }
  async reconstructContinuation() { this.calls += 1; return structuredClone(this.packet); }
}

class FakeTransport {
  constructor() { this.owner = 'BFochtman746'; this.repo = 'system-master'; this.calls = 0; }
  async getRef() { this.calls += 1; return { sha: TARGET_SHA }; }
}

function a01Authority(overrides = {}) {
  return {
    mission_version: MISSION,
    workstream_id: WORKSTREAM,
    authority_epoch: 9,
    publication_commit_sha: 'a'.repeat(40),
    packet_digest: 'b'.repeat(64),
    authoritative_subject: { algorithm: 'sha1', oid: 'c'.repeat(40) },
    repository: REPO,
    branch_or_ref: 'second-shift-control-gateway/cg-009-dependency-ordering',
    qualification_state: 'PASSED',
    github_admission_state: 'ADMITTED',
    a01_state: 'PENDING',
    current_operation: { operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-009', predecessor_receipt_id: 'RECEIPT-CG008-PREDECESSOR', state: 'ACTIVE' },
    receipt_index: [{ receipt_id: DEP, operation_id: 'DEP', outcome: 'SUCCEEDED', satisfies_dependency: true, subject: { algorithm: 'sha1', oid: 'c'.repeat(40) } }],
    ...overrides
  };
}

function a01Payload() { return { qualification_id: 'C04-RESPONSE-GOVERNOR-A01', exact_subject: 'c'.repeat(40) }; }

function a01Request(overrides = {}) {
  const body = a01Payload();
  return {
    protocol_version: A01_ADMISSION_REQUEST_PROTOCOL,
    admission_id: 'C04-A01-ADMISSION-001',
    mission_version: MISSION,
    workstream_id: WORKSTREAM,
    authority_epoch: 9,
    authority_publication_commit_sha: 'a'.repeat(40),
    authority_packet_digest: 'b'.repeat(64),
    authoritative_subject: { algorithm: 'sha1', oid: 'c'.repeat(40) },
    repository: REPO,
    authority_ref: 'second-shift-control-gateway/cg-009-dependency-ordering',
    authority_ref_head_sha: 'd'.repeat(40),
    operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-009',
    predecessor_receipt_id: 'RECEIPT-CG008-PREDECESSOR',
    command_id: 'CMD-C04-001',
    task_id: 'TASK-C04-001',
    idempotency_key: 'IDEM-C04-001',
    execution_class: 'OVERNIGHT',
    execution_order: 7,
    priority: 100,
    not_before: '2026-09-12T04:00:00.000Z',
    not_after: '2026-09-12T10:00:00.000Z',
    lane: 'CONTROL_GATEWAY',
    owner_path: 'SYSTEM_MASTER/CORE',
    delegation_id: 'SECOND-SHIFT-CORE-FOUNDATION-1-0-CLOSURE-001',
    objective_id: 'FOUNDATION-1-0-CLOSURE-001',
    control_ref: 'second-shift-control-gateway/cg-009-dependency-ordering',
    control_head: 'd'.repeat(40),
    executor_kind: 'A01_CONTROL_PLANE_QUALIFICATION',
    payload_digest: sha256(body),
    dependency_receipt_ids: [DEP],
    ...overrides
  };
}

test('malformed ChatGPT prose cannot reach raw GitHub mutation admission', async () => {
  const adapter = new FakeAdapter();
  const transport = new FakeTransport();
  const raw = { calls: 0, async admit() { this.calls += 1; throw new Error('RAW_GATE_MUST_NOT_RUN'); }, async verifyGrantFresh() { return true; } };
  const gate = new GovernedGitHubMutationAdmissionGate({ reconstructionAdapter: adapter, mutationTransport: transport, rawAdmissionGate: raw });
  await assert.rejects(
    gate.admit(githubRequest(), { responseText: 'Done. I updated the files.', responseReceipt: null }),
    (error) => error instanceof DevelopmentResponseGovernorError && error.code === 'RESPONSE_RECEIPT_REQUIRED'
  );
  assert.equal(raw.calls, 0);
  assert.equal(transport.calls, 0);
});

test('compliant CONTINUATION response receives governed GitHub admission', async () => {
  const packet = continuation();
  const adapter = new FakeAdapter(packet);
  const transport = new FakeTransport();
  const request = githubRequest();
  const responseReceipt = issueDevelopmentResponseReceipt({
    responseText: CONTINUATION_RESPONSE,
    responseClass: DEVELOPMENT_RESPONSE_CLASSES.CONTINUATION,
    authorityContext: buildGitHubDevelopmentResponseAuthorityContext(request, packet)
  });
  const gate = new GovernedGitHubMutationAdmissionGate({ reconstructionAdapter: adapter, mutationTransport: transport });
  const envelope = await gate.admit(request, { responseText: CONTINUATION_RESPONSE, responseReceipt });
  assert.equal(envelope.protocol_version, 'control-gateway.governed-github-admission.v1');
  assert.equal(envelope.response_receipt.compliance, 'PASS');
  assert.equal(envelope.admission_receipt.decision, 'GRANTED');
});

test('A-01 authorization rejects missing response receipt before raw admission', () => {
  assert.throws(
    () => admitGovernedA01Execution({ request: a01Request(), authority: a01Authority(), responseText: 'Done.', responseReceipt: null }),
    (error) => error instanceof DevelopmentResponseGovernorError && error.code === 'RESPONSE_RECEIPT_REQUIRED'
  );
});

test('compliant response receipt remains bound through A-01 supervisor handoff', () => {
  const authority = a01Authority();
  const request = a01Request();
  const payload = a01Payload();
  const responseReceipt = issueDevelopmentResponseReceipt({
    responseText: CONTINUATION_RESPONSE,
    responseClass: DEVELOPMENT_RESPONSE_CLASSES.CONTINUATION,
    authorityContext: buildA01DevelopmentResponseAuthorityContext(request, authority)
  });
  const admission = admitGovernedA01Execution({ request, authority, responseText: CONTINUATION_RESPONSE, responseReceipt });
  const handoff = buildGovernedA01SupervisorHandoff({ request, authority, governedAdmission: admission, responseText: CONTINUATION_RESPONSE, payload });
  assert.equal(admission.protocol_version, 'control-gateway.governed-a01-admission.v1');
  assert.equal(handoff.protocol_version, 'control-gateway.governed-a01-supervisor-handoff.v1');
  assert.equal(handoff.response_receipt_digest, admission.response_receipt_digest);
});
