import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_WORK_PROTOCOL,
  CG001_MISSION_VERSION,
  finalizeActiveWorkPacket
} from '../src/active-work-state.js';
import {
  GitHubActiveWorkPublisher,
  GitHubChatReconstructionAdapter,
  GitHubActiveWorkRestTransport
} from '../src/github-active-work-publication.js';
import { GitHubMutationAuthorityAdapter } from '../src/github-mutation-authority-adapter.js';
import {
  CHAT_RECOVERY_PROTOCOL,
  ChatRecoveryError,
  GitHubChatRecoveryGate,
  computeRecoveryDigest,
  DEFAULT_GOVERNANCE_PACKET_PATH
} from '../src/chat-recovery-gate.js';

const WORKSTREAM = 'SECOND-SHIFT-CONTROL-GATEWAY';
const QUALIFIED = '6'.repeat(40);
const FREEZE = '7'.repeat(40);
const PUBLICATION = '8'.repeat(40);
const PUB_DIGEST = '9'.repeat(64);
const PACKET_DIGEST = 'a'.repeat(64);
const RECEIPT_ID = 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005-HOST-QUALIFICATION-34668105764';

function terminalPacket(overrides = {}) {
  const receipt = {
    receipt_id: RECEIPT_ID,
    operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005',
    outcome: 'SUCCEEDED',
    satisfies_dependency: true,
    subject: { algorithm: 'sha1', oid: QUALIFIED }
  };
  const base = {
    protocol_version: ACTIVE_WORK_PROTOCOL,
    mission_version: CG001_MISSION_VERSION,
    workstream_id: WORKSTREAM,
    authority_epoch: 4,
    authority_rebind_receipt_id: RECEIPT_ID,
    authoritative_subject: { algorithm: 'sha1', oid: QUALIFIED },
    repository: 'BFochtman746/system-master',
    branch_or_ref: 'second-shift-control-gateway/cg-005-github-admission',
    allowed_paths_or_effects: {
      paths: ['control-gateway/**', 'governance/control-gateway/**'],
      effects: ['CONTROL_GATEWAY_DEVELOPMENT_WRITE', 'CONTROL_GATEWAY_STATE_PUBLICATION']
    },
    dependency_graph: { version: 1, edges: [] },
    qualification_state: 'PASSED',
    github_admission_state: 'ADMITTED',
    a01_state: 'NOT_REQUIRED',
    current_operation: {
      operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005',
      state: 'TERMINAL',
      predecessor_receipt_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-004-LIVE-GITHUB-QUALIFICATION-34667378000'
    },
    last_terminal_receipt: receipt,
    receipt_index: [receipt],
    successor_candidates: [{
      operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-006',
      predecessor_receipt_id: RECEIPT_ID,
      required_receipt_ids: [],
      qualification_state: 'PENDING',
      github_admission_state: 'PENDING',
      a01_state: 'NOT_REQUIRED'
    }],
    next_legal_operation: {
      kind: 'START_SUCCESSOR',
      operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-006',
      predecessor_receipt_id: RECEIPT_ID,
      reason: 'placeholder'
    }
  };
  return finalizeActiveWorkPacket({ ...base, ...overrides });
}

function activePacket() {
  return finalizeActiveWorkPacket({
    ...terminalPacket(),
    current_operation: {
      operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-006',
      state: 'ACTIVE',
      predecessor_receipt_id: RECEIPT_ID
    },
    last_terminal_receipt: terminalPacket().last_terminal_receipt,
    successor_candidates: [],
    next_legal_operation: {
      kind: 'CONTINUE_CURRENT',
      operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-006',
      predecessor_receipt_id: RECEIPT_ID,
      reason: 'placeholder'
    }
  });
}

function publicationFor(packet, { head = PUBLICATION, packetDigest = PACKET_DIGEST, publicationDigest = PUB_DIGEST } = {}) {
  return {
    ref: 'control-gateway-state/active-work/second-shift-control-gateway-dev',
    head_commit_sha: head,
    publication_revision: 3,
    packet_digest: packetDigest,
    publication_digest: publicationDigest,
    envelope: { packet }
  };
}

class FakePublisher {
  constructor(packet) {
    this.current = publicationFor(packet);
    this.calls = 0;
    this.moveOnCall = null;
  }
  async reconstruct() {
    this.calls += 1;
    if (this.moveOnCall === this.calls) this.current = { ...this.current, head_commit_sha: 'b'.repeat(40), packet_digest: 'c'.repeat(64) };
    return structuredClone(this.current);
  }
}

class FakeAuthorityAdapter {
  constructor(publisher) { this.publisher = publisher; }
  async reconstructContinuation() {
    const p = await this.publisher.reconstruct();
    const packet = p.envelope.packet;
    return {
      source: 'GITHUB_DURABLE_ACTIVE_WORK',
      publication_ref: p.ref,
      publication_commit_sha: p.head_commit_sha,
      publication_revision: p.publication_revision,
      packet_digest: p.packet_digest,
      mission_version: packet.mission_version,
      workstream_id: packet.workstream_id,
      authoritative_subject: structuredClone(packet.authoritative_subject),
      repository: packet.repository,
      branch_or_ref: packet.branch_or_ref,
      current_operation: structuredClone(packet.current_operation),
      qualification_state: packet.qualification_state,
      github_admission_state: packet.github_admission_state,
      a01_state: packet.a01_state,
      next_legal_operation: structuredClone(packet.next_legal_operation),
      authority_epoch: packet.authority_epoch,
      allowed_paths_or_effects: structuredClone(packet.allowed_paths_or_effects),
      successor_candidates: structuredClone(packet.successor_candidates)
    };
  }
}

class FakeWorkRefTransport {
  constructor(packet) {
    this.refSha = FREEZE;
    this.getRefCalls = 0;
    this.moveOnGetRefCall = null;
    this.files = new Map([[`${FREEZE}:${DEFAULT_GOVERNANCE_PACKET_PATH}`, `${JSON.stringify(packet)}\n`]]);
    this.commits = new Map([
      [FREEZE, { sha: FREEZE, parents: [QUALIFIED] }],
      [QUALIFIED, { sha: QUALIFIED, parents: ['5'.repeat(40)] }]
    ]);
  }
  async getRef() {
    this.getRefCalls += 1;
    if (this.moveOnGetRefCall === this.getRefCalls) this.refSha = 'd'.repeat(40);
    return { sha: this.refSha };
  }
  async getCommit(sha) {
    const commit = this.commits.get(sha);
    if (!commit) return { sha, parents: [] };
    return structuredClone(commit);
  }
  async readFile(sha, path) {
    return this.files.get(`${sha}:${path}`) ?? null;
  }
}

function makeGate(packet = terminalPacket()) {
  const publisher = new FakePublisher(packet);
  const authorityAdapter = new FakeAuthorityAdapter(publisher);
  const workRefTransport = new FakeWorkRefTransport(packet);
  const gate = new GitHubChatRecoveryGate({
    authorityAdapter,
    publisher,
    workRefTransport,
    expectedWorkstreamId: WORKSTREAM
  });
  return { gate, publisher, authorityAdapter, workRefTransport };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error instanceof ChatRecoveryError && error.code === code);
}

test('fresh recovery returns exact successor, predecessor receipt and governance freeze head without chat state', async () => {
  const { gate } = makeGate();
  const contract = await gate.recoverContinue();
  assert.equal(contract.protocol_version, CHAT_RECOVERY_PROTOCOL);
  assert.equal(contract.intent, 'CONTINUE');
  assert.equal(contract.continuation.mode, 'START_SUCCESSOR');
  assert.equal(contract.continuation.operation_id, 'SECOND-SHIFT-CONTROL-GATEWAY-CG-006');
  assert.equal(contract.continuation.predecessor_receipt_id, RECEIPT_ID);
  assert.equal(contract.authority_branch_head_sha, FREEZE);
  assert.equal(contract.authority_subject_to_head_distance, 1);
  assert.equal(contract.authoritative_subject.oid, QUALIFIED);
  assert.equal(contract.mutation_admission_required, true);
  assert.equal(contract.exact_predecessor_cas_required, true);
  assert.equal(contract.recovery_digest, computeRecoveryDigest(contract));
});

test('nonterminal ACTIVE operation recovers CONTINUE_CURRENT exactly', async () => {
  const { gate } = makeGate(activePacket());
  const contract = await gate.recoverContinue();
  assert.equal(contract.continuation.mode, 'CONTINUE_CURRENT');
  assert.equal(contract.continuation.operation_id, 'SECOND-SHIFT-CONTROL-GATEWAY-CG-006');
});

test('blocked or failed standing requires reconciliation instead of guessing Continue', async () => {
  const packet = finalizeActiveWorkPacket({ ...activePacket(), qualification_state: 'FAILED' });
  const { gate } = makeGate(packet);
  await expectCode(gate.recoverContinue(), 'RECOVERY_RECONCILIATION_REQUIRED');
});

test('no dependency-valid successor fails closed', async () => {
  const packet = finalizeActiveWorkPacket({ ...terminalPacket(), successor_candidates: [], next_legal_operation: { kind: 'NO_LEGAL_SUCCESSOR', operation_id: null, predecessor_receipt_id: RECEIPT_ID, reason: 'placeholder' } });
  const { gate } = makeGate(packet);
  await expectCode(gate.recoverContinue(), 'RECOVERY_NO_LEGAL_SUCCESSOR');
});

test('multiple dependency-valid successors fail closed as ambiguous', async () => {
  const first = terminalPacket().successor_candidates[0];
  const second = { ...first, operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-006B' };
  const packet = finalizeActiveWorkPacket({ ...terminalPacket(), successor_candidates: [first, second], next_legal_operation: { kind: 'AMBIGUOUS_SUCCESSORS', operation_id: null, predecessor_receipt_id: RECEIPT_ID, reason: 'placeholder' } });
  const { gate } = makeGate(packet);
  await expectCode(gate.recoverContinue(), 'RECOVERY_AMBIGUOUS_SUCCESSORS');
});

test('work-ref governance packet must exactly match durable published packet', async () => {
  const { gate, workRefTransport } = makeGate();
  const tampered = structuredClone(terminalPacket());
  tampered.allowed_paths_or_effects.paths.push('tampered/**');
  workRefTransport.files.set(`${FREEZE}:${DEFAULT_GOVERNANCE_PACKET_PATH}`, `${JSON.stringify(finalizeActiveWorkPacket(tampered))}\n`);
  await expectCode(gate.recoverContinue(), 'RECOVERY_GOVERNANCE_PACKET_MISMATCH');
});

test('missing governance packet fails closed', async () => {
  const { gate, workRefTransport } = makeGate();
  workRefTransport.files.clear();
  await expectCode(gate.recoverContinue(), 'RECOVERY_GOVERNANCE_PACKET_MISSING');
});

test('qualified subject must be on a single-parent ancestry path to live governance head', async () => {
  const { gate, workRefTransport } = makeGate();
  workRefTransport.commits.set(FREEZE, { sha: FREEZE, parents: ['1'.repeat(40), '2'.repeat(40)] });
  await expectCode(gate.recoverContinue(), 'RECOVERY_WORK_REF_NONLINEAR');
});

test('work ref movement during recovery fails closed', async () => {
  const { gate, workRefTransport } = makeGate();
  workRefTransport.moveOnGetRefCall = 2;
  await expectCode(gate.recoverContinue(), 'RECOVERY_WORK_REF_MOVED');
});

test('durable publication movement during recovery fails closed', async () => {
  const { gate, publisher } = makeGate();
  publisher.moveOnCall = 4;
  await expectCode(gate.recoverContinue(), 'RECOVERY_AUTHORITY_MOVED');
});

test('tampered recovery contract is rejected', async () => {
  const { gate } = makeGate();
  const contract = structuredClone(await gate.recoverContinue());
  contract.continuation.operation_id = 'FORGED';
  await expectCode(gate.verifyRecoveryContractFresh(contract), 'RECOVERY_CONTRACT_TAMPERED');
});

test('previously valid recovery contract becomes stale after durable authority changes', async () => {
  const { gate, publisher } = makeGate();
  const contract = await gate.recoverContinue();
  publisher.current = { ...publisher.current, head_commit_sha: 'e'.repeat(40), packet_digest: 'f'.repeat(64) };
  await expectCode(gate.verifyRecoveryContractFresh(contract), 'RECOVERY_CONTRACT_STALE');
});

test('configured mission and workstream are mandatory recovery fences', async () => {
  const { publisher, authorityAdapter, workRefTransport } = makeGate();
  const wrongWorkstream = new GitHubChatRecoveryGate({ authorityAdapter, publisher, workRefTransport, expectedWorkstreamId: 'OTHER-WORKSTREAM' });
  await expectCode(wrongWorkstream.recoverContinue(), 'RECOVERY_WORKSTREAM_MISMATCH');
});

const liveConfigured = [
  'CG006_LIVE_REF',
  'CG006_EXPECTED_PUBLICATION_COMMIT',
  'CG006_EXPECTED_PACKET_DIGEST',
  'CG006_EXPECTED_AUTHORITY_SUBJECT',
  'CG006_EXPECTED_WORK_REF',
  'CG006_EXPECTED_WORK_REF_HEAD',
  'CG006_EXPECTED_OPERATION',
  'CG006_EXPECTED_PREDECESSOR_RECEIPT'
].every((name) => process.env[name]);

test('live GitHub recovery reconstructs exact CG-006 continuation and freeze base without prior chat state', { skip: !liveConfigured && 'CG006 live GitHub qualification environment not configured' }, async () => {
  const transport = new GitHubActiveWorkRestTransport({
    owner: 'BFochtman746',
    repo: 'system-master',
    tokenProvider: process.env.CG006_GITHUB_TOKEN ? async () => process.env.CG006_GITHUB_TOKEN : null
  });
  const publisher = new GitHubActiveWorkPublisher({
    transport,
    ref: process.env.CG006_LIVE_REF,
    workstreamId: WORKSTREAM
  });
  const chatReconstructionAdapter = new GitHubChatReconstructionAdapter({ publisher });
  const authorityAdapter = new GitHubMutationAuthorityAdapter({ chatReconstructionAdapter });
  const gate = new GitHubChatRecoveryGate({
    authorityAdapter,
    publisher,
    workRefTransport: transport,
    expectedWorkstreamId: WORKSTREAM
  });
  const contract = await gate.recoverContinue();
  assert.equal(contract.publication_commit_sha, process.env.CG006_EXPECTED_PUBLICATION_COMMIT);
  assert.equal(contract.packet_digest, process.env.CG006_EXPECTED_PACKET_DIGEST);
  assert.equal(contract.authoritative_subject.oid, process.env.CG006_EXPECTED_AUTHORITY_SUBJECT);
  assert.equal(contract.authority_branch_or_ref, process.env.CG006_EXPECTED_WORK_REF);
  assert.equal(contract.authority_branch_head_sha, process.env.CG006_EXPECTED_WORK_REF_HEAD);
  assert.equal(contract.continuation.operation_id, process.env.CG006_EXPECTED_OPERATION);
  assert.equal(contract.continuation.predecessor_receipt_id, process.env.CG006_EXPECTED_PREDECESSOR_RECEIPT);
  assert.equal(contract.continuation.mode, 'START_SUCCESSOR');
  assert.equal(contract.recovery_digest, computeRecoveryDigest(contract));
});
