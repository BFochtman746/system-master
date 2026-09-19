import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GitHubMutationAdmissionGate,
  GitHubMutationAdmissionError,
  GITHUB_MUTATION_REQUEST_PROTOCOL,
  GITHUB_MUTATION_ADMISSION_PROTOCOL,
  mutationRequestDigest,
  validateAdmissionReceipt
} from '../src/github-mutation-admission.js';
import { GitHubMutationAuthorityAdapter } from '../src/github-mutation-authority-adapter.js';
import {
  GitHubActiveWorkPublisher,
  GitHubChatReconstructionAdapter,
  GitHubActiveWorkRestTransport
} from '../src/github-active-work-publication.js';

const REPO = 'BFochtman746/system-master';
const WORKSTREAM = 'SECOND-SHIFT-CONTROL-GATEWAY';
const MISSION = 'SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0';
const BRANCH = 'second-shift-control-gateway/cg-004-github-publication';
const STATE_REF = 'control-gateway-state/active-work/second-shift-control-gateway-dev';
const PUBLICATION_SHA = '1'.repeat(40);
const PACKET_DIGEST = '2'.repeat(64);
const SUBJECT_SHA = '3'.repeat(40);
const TARGET_SHA = '4'.repeat(40);
const PREDECESSOR_RECEIPT = 'SECOND-SHIFT-CONTROL-GATEWAY-CG-004-LIVE-GITHUB-QUALIFICATION-34667378000';

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

function request(overrides = {}) {
  return {
    protocol_version: GITHUB_MUTATION_REQUEST_PROTOCOL,
    mutation_id: 'CG005-TEST-MUTATION-001',
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
    paths: ['control-gateway/src/github-mutation-admission.js'],
    effects: ['CONTROL_GATEWAY_DEVELOPMENT_WRITE'],
    ...overrides
  };
}

class FakeAdapter {
  constructor(first = continuation(), second = null) {
    this.first = first;
    this.second = second;
    this.calls = 0;
  }
  async reconstructContinuation() {
    this.calls += 1;
    return structuredClone(this.calls > 1 && this.second ? this.second : this.first);
  }
}

class FakeTransport {
  constructor(sha = TARGET_SHA) {
    this.owner = 'BFochtman746';
    this.repo = 'system-master';
    this.sha = sha;
    this.calls = 0;
    this.moveOnCall = null;
    this.moveTo = '5'.repeat(40);
  }
  async getRef() {
    this.calls += 1;
    if (this.moveOnCall === this.calls) this.sha = this.moveTo;
    return { sha: this.sha };
  }
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error instanceof GitHubMutationAdmissionError && error.code === code);
}

function gate(adapter = new FakeAdapter(), transport = new FakeTransport()) {
  return new GitHubMutationAdmissionGate({ reconstructionAdapter: adapter, mutationTransport: transport });
}

test('exact successor work-ref mutation receives deterministic predecessor-bound admission receipt', async () => {
  const g = gate();
  const req = request();
  const receipt = await g.admit(req);
  assert.equal(receipt.protocol_version, GITHUB_MUTATION_ADMISSION_PROTOCOL);
  assert.equal(receipt.decision, 'GRANTED');
  assert.equal(receipt.observed_predecessor_sha, TARGET_SHA);
  assert.equal(receipt.request_digest, mutationRequestDigest(req));
  assert.equal(receipt.executor_requirement, 'EXACT_PREDECESSOR_CAS_REQUIRED');
  assert.equal(validateAdmissionReceipt(receipt), true);
  assert.equal(await g.verifyGrantFresh(receipt, req), true);
});

test('request collection ordering is canonical for admission digest binding', async () => {
  const a = request({ paths: ['governance/control-gateway/a.json', 'control-gateway/a.js'], effects: ['CONTROL_GATEWAY_STATE_PUBLICATION', 'CONTROL_GATEWAY_DEVELOPMENT_WRITE'] });
  const b = request({ paths: [...a.paths].reverse(), effects: [...a.effects].reverse() });
  assert.equal(mutationRequestDigest(a), mutationRequestDigest(b));
});

test('wrong repository fails closed', async () => {
  await rejectsCode(gate().admit(request({ repository: 'BFochtman746/other' })), 'MUTATION_REPOSITORY_MISMATCH');
});

test('transport repository mismatch fails closed even when request claims correct repository', async () => {
  const transport = new FakeTransport();
  transport.repo = 'other';
  await rejectsCode(gate(new FakeAdapter(), transport).admit(request()), 'MUTATION_TRANSPORT_REPOSITORY_MISMATCH');
});

test('wrong work ref fails closed', async () => {
  await rejectsCode(gate().admit(request({ target_ref: 'main' })), 'MUTATION_REF_MISMATCH');
});

test('wrong predecessor SHA fails closed', async () => {
  await rejectsCode(gate().admit(request({ expected_predecessor_sha: '6'.repeat(40) })), 'MUTATION_PREDECESSOR_MISMATCH');
});

test('target movement during admission fails closed', async () => {
  const transport = new FakeTransport();
  transport.moveOnCall = 2;
  await rejectsCode(gate(new FakeAdapter(), transport).admit(request()), 'MUTATION_TARGET_MOVED');
});

test('durable authority movement during admission fails closed', async () => {
  const moved = continuation({ publication_commit_sha: '7'.repeat(40), packet_digest: '8'.repeat(64) });
  await rejectsCode(gate(new FakeAdapter(continuation(), moved)).admit(request()), 'MUTATION_AUTHORITY_MOVED');
});

test('authority publication expectation mismatch fails closed', async () => {
  await rejectsCode(gate().admit(request({ authority_publication_commit_sha: '9'.repeat(40) })), 'MUTATION_AUTHORITY_HEAD_MISMATCH');
});

test('authority packet digest expectation mismatch fails closed', async () => {
  await rejectsCode(gate().admit(request({ authority_packet_digest: 'a'.repeat(64) })), 'MUTATION_AUTHORITY_PACKET_MISMATCH');
});

test('authority epoch mismatch fails closed', async () => {
  await rejectsCode(gate().admit(request({ authority_epoch: 2 })), 'MUTATION_AUTHORITY_EPOCH_MISMATCH');
});

test('authoritative subject mismatch fails closed', async () => {
  await rejectsCode(gate().admit(request({ authoritative_subject: { algorithm: 'sha1', oid: 'b'.repeat(40) } })), 'MUTATION_AUTHORITY_SUBJECT_MISMATCH');
});

test('mission and workstream mismatches fail closed', async () => {
  await rejectsCode(gate().admit(request({ mission_version: 'OTHER/v1' })), 'MUTATION_MISSION_MISMATCH');
  await rejectsCode(gate().admit(request({ workstream_id: 'OTHER-WORKSTREAM' })), 'MUTATION_WORKSTREAM_MISMATCH');
});

test('unqualified authority fails closed', async () => {
  await rejectsCode(gate(new FakeAdapter(continuation({ qualification_state: 'FAILED' }))).admit(request()), 'MUTATION_QUALIFICATION_REQUIRED');
});

test('denied or stale GitHub standing fails closed', async () => {
  await rejectsCode(gate(new FakeAdapter(continuation({ github_admission_state: 'DENIED' }))).admit(request()), 'MUTATION_GITHUB_STANDING_INVALID');
  await rejectsCode(gate(new FakeAdapter(continuation({ github_admission_state: 'STALE' }))).admit(request()), 'MUTATION_GITHUB_STANDING_INVALID');
});

test('blocked current operation cannot mutate GitHub', async () => {
  const c = continuation({
    current_operation: { operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005', state: 'BLOCKED', predecessor_receipt_id: PREDECESSOR_RECEIPT },
    next_legal_operation: { kind: 'RECONCILE_CURRENT', operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005', predecessor_receipt_id: PREDECESSOR_RECEIPT, reason: 'BLOCKED' }
  });
  await rejectsCode(gate(new FakeAdapter(c)).admit(request()), 'MUTATION_OPERATION_BLOCKED');
});

test('active current operation may mutate only when operation and predecessor receipt match exactly', async () => {
  const c = continuation({
    current_operation: { operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005', state: 'ACTIVE', predecessor_receipt_id: PREDECESSOR_RECEIPT },
    next_legal_operation: { kind: 'CONTINUE_CURRENT', operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005', predecessor_receipt_id: PREDECESSOR_RECEIPT, reason: 'CURRENT_OPERATION_NONTERMINAL' }
  });
  const receipt = await gate(new FakeAdapter(c)).admit(request());
  assert.equal(receipt.operation_id, 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005');
  await rejectsCode(gate(new FakeAdapter(c)).admit(request({ predecessor_receipt_id: 'WRONG-RECEIPT' })), 'MUTATION_OPERATION_MISMATCH');
});



test('active operation with null predecessor admits null and rejects a non-null mismatch', async () => {
  const c = continuation({
    current_operation: { operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005', state: 'ACTIVE', predecessor_receipt_id: null },
    next_legal_operation: { kind: 'CONTINUE_CURRENT', operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005', predecessor_receipt_id: null, reason: 'CURRENT_OPERATION_NONTERMINAL' }
  });
  const receipt = await gate(new FakeAdapter(c)).admit(request({ predecessor_receipt_id: null }));
  assert.equal(receipt.predecessor_receipt_id, null);
  await rejectsCode(gate(new FakeAdapter(c)).admit(request({ predecessor_receipt_id: PREDECESSOR_RECEIPT })), 'MUTATION_OPERATION_MISMATCH');
});

test('terminal authority refuses any operation other than the exact single legal successor', async () => {
  await rejectsCode(gate().admit(request({ operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-006' })), 'MUTATION_OPERATION_MISMATCH');
  const ambiguous = continuation({ next_legal_operation: { kind: 'AMBIGUOUS_SUCCESSORS', operation_id: null, predecessor_receipt_id: PREDECESSOR_RECEIPT, reason: 'MULTIPLE' } });
  await rejectsCode(gate(new FakeAdapter(ambiguous)).admit(request()), 'MUTATION_OPERATION_MISMATCH');
});

test('successor candidate denied/stale standing cannot receive mutation admission', async () => {
  for (const state of ['DENIED', 'STALE']) {
    const c = continuation();
    c.successor_candidates[0].github_admission_state = state;
    await rejectsCode(gate(new FakeAdapter(c)).admit(request()), 'MUTATION_GITHUB_STANDING_INVALID');
  }
});

test('path outside durable authority fails closed', async () => {
  await rejectsCode(gate().admit(request({ paths: ['tools/unsafe.js'] })), 'MUTATION_PATH_OUT_OF_SCOPE');
});

test('unsafe, wildcard, duplicate and empty mutation scopes are rejected before authority evaluation', async () => {
  await rejectsCode(gate().admit(request({ paths: ['../escape'] })), 'MUTATION_PATH_INVALID');
  await rejectsCode(gate().admit(request({ paths: ['control-gateway/**'] })), 'MUTATION_PATH_INVALID');
  await rejectsCode(gate().admit(request({ paths: ['control-gateway/a.js', 'control-gateway/a.js'] })), 'MUTATION_SCHEMA_INVALID');
  await rejectsCode(gate().admit(request({ paths: [], effects: [] })), 'MUTATION_SCOPE_EMPTY');
});

test('effect outside durable authority fails closed', async () => {
  await rejectsCode(gate().admit(request({ effects: ['DELETE_REPOSITORY'] })), 'MUTATION_EFFECT_OUT_OF_SCOPE');
});

test('authority-state publication requires exact state ref, reserved paths, and dedicated effect', async () => {
  const transport = new FakeTransport(PUBLICATION_SHA);
  const req = request({
    target_kind: 'AUTHORITY_STATE_REF',
    target_ref: STATE_REF,
    expected_predecessor_sha: PUBLICATION_SHA,
    paths: ['control-gateway-state/active-work/head.json', 'control-gateway-state/active-work/revisions/000000000003-deadbeef.json'],
    effects: ['CONTROL_GATEWAY_STATE_PUBLICATION']
  });
  const receipt = await gate(new FakeAdapter(), transport).admit(req);
  assert.equal(receipt.target_kind, 'AUTHORITY_STATE_REF');
  await rejectsCode(gate(new FakeAdapter(), transport).admit({ ...req, target_ref: BRANCH }), 'MUTATION_REF_MISMATCH');
  await rejectsCode(gate(new FakeAdapter(), transport).admit({ ...req, paths: ['control-gateway-state/other.json'] }), 'MUTATION_PATH_OUT_OF_SCOPE');
  await rejectsCode(gate(new FakeAdapter(), transport).admit({ ...req, effects: ['CONTROL_GATEWAY_DEVELOPMENT_WRITE'] }), 'MUTATION_EFFECT_OUT_OF_SCOPE');
});

test('tampered admission receipt is rejected', async () => {
  const receipt = await gate().admit(request());
  const tampered = structuredClone(receipt);
  tampered.paths = ['control-gateway/src/other.js'];
  await rejectsCode(Promise.resolve().then(() => validateAdmissionReceipt(tampered)), 'ADMISSION_RECEIPT_DIGEST_MISMATCH');
});

test('grant becomes stale when authority or target predecessor moves', async () => {
  const adapter = new FakeAdapter();
  const transport = new FakeTransport();
  const g = gate(adapter, transport);
  const req = request();
  const receipt = await g.admit(req);
  transport.sha = 'c'.repeat(40);
  await rejectsCode(g.verifyGrantFresh(receipt, req), 'ADMISSION_STALE');

  const g2adapter = new FakeAdapter();
  const g2 = gate(g2adapter, new FakeTransport());
  const receipt2 = await g2.admit(req);
  g2adapter.first = continuation({ publication_commit_sha: 'd'.repeat(40), packet_digest: 'e'.repeat(64) });
  await rejectsCode(g2.verifyGrantFresh(receipt2, req), 'ADMISSION_STALE');
});

test('CG-005 authority adapter enriches and cross-checks the CG-004 chat reconstruction', async () => {
  const packet = continuation();
  const publisher = {
    async reconstruct() {
      return {
        ref: packet.publication_ref,
        head_commit_sha: packet.publication_commit_sha,
        packet_digest: packet.packet_digest,
        envelope: { packet: {
          mission_version: packet.mission_version,
          workstream_id: packet.workstream_id,
          authority_epoch: packet.authority_epoch,
          authoritative_subject: packet.authoritative_subject,
          repository: packet.repository,
          branch_or_ref: packet.branch_or_ref,
          allowed_paths_or_effects: packet.allowed_paths_or_effects,
          successor_candidates: packet.successor_candidates
        } }
      };
    }
  };
  const chat = {
    publisher,
    async reconstructContinuation() {
      const { authority_epoch, allowed_paths_or_effects, successor_candidates, ...summary } = packet;
      return summary;
    }
  };
  const enriched = await new GitHubMutationAuthorityAdapter({ chatReconstructionAdapter: chat }).reconstructContinuation();
  assert.equal(enriched.authority_epoch, 3);
  assert.deepEqual(enriched.allowed_paths_or_effects, packet.allowed_paths_or_effects);
  assert.deepEqual(enriched.successor_candidates, packet.successor_candidates);
});

test('live CG-004 GitHub authority admits the exact CG-005 development mutation without chat memory', { skip: !process.env.CG005_LIVE_REF }, async () => {
  const transport = new GitHubActiveWorkRestTransport({
    owner: 'BFochtman746',
    repo: 'system-master',
    tokenProvider: process.env.CG005_GITHUB_TOKEN ? async () => process.env.CG005_GITHUB_TOKEN : null
  });
  const publisher = new GitHubActiveWorkPublisher({
    transport,
    ref: process.env.CG005_LIVE_REF,
    workstreamId: WORKSTREAM,
    missionVersion: MISSION
  });
  const chatAdapter = new GitHubChatReconstructionAdapter({ publisher });
  const authorityAdapter = new GitHubMutationAuthorityAdapter({ chatReconstructionAdapter: chatAdapter });
  const g = new GitHubMutationAdmissionGate({ reconstructionAdapter: authorityAdapter, mutationTransport: transport });
  const req = request({
    mutation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005-LIVE-PREFLIGHT',
    authority_publication_commit_sha: process.env.CG005_EXPECTED_PUBLICATION_COMMIT,
    authority_packet_digest: process.env.CG005_EXPECTED_PACKET_DIGEST,
    authoritative_subject: { algorithm: 'sha1', oid: process.env.CG005_EXPECTED_AUTHORITY_SUBJECT },
    expected_predecessor_sha: process.env.CG005_EXPECTED_TARGET_PREDECESSOR
  });
  const receipt = await g.admit(req);
  assert.equal(receipt.decision, 'GRANTED');
  assert.equal(receipt.authority_publication_commit_sha, process.env.CG005_EXPECTED_PUBLICATION_COMMIT);
  assert.equal(receipt.observed_predecessor_sha, process.env.CG005_EXPECTED_TARGET_PREDECESSOR);
  assert.equal(await g.verifyGrantFresh(receipt, req), true);
});
