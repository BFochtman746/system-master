import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_WORK_PROTOCOL,
  CG001_MISSION_VERSION,
  finalizeActiveWorkPacket,
  startNextLegalOperation
} from '../src/active-work-state.js';
import {
  GitHubActiveWorkPublisher,
  GitHubChatReconstructionAdapter,
  GitHubActiveWorkRestTransport,
  GitHubPublicationError,
  computePublicationDigest,
  publicationRevisionPath,
  DEFAULT_ACTIVE_WORK_HEAD_PATH
} from '../src/github-active-work-publication.js';

const WORKSTREAM = 'SECOND-SHIFT-CONTROL-GATEWAY';
const REF = 'control-gateway-state/active-work/second-shift-control-gateway';
const GENESIS = 'a'.repeat(40);

function packet() {
  const receipt = {
    receipt_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-003-HOST-QUALIFICATION-34666596357',
    operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-003',
    outcome: 'SUCCEEDED',
    satisfies_dependency: true,
    subject: { algorithm: 'sha1', oid: 'd38825493805d0a9d4ac0f4ab17825badb59b6bb' }
  };
  return finalizeActiveWorkPacket({
    protocol_version: ACTIVE_WORK_PROTOCOL,
    mission_version: CG001_MISSION_VERSION,
    workstream_id: WORKSTREAM,
    authority_epoch: 1,
    authority_rebind_receipt_id: null,
    authoritative_subject: { algorithm: 'sha1', oid: 'd38825493805d0a9d4ac0f4ab17825badb59b6bb' },
    repository: 'BFochtman746/system-master',
    branch_or_ref: 'second-shift-control-gateway/cg-003-active-work-state',
    allowed_paths_or_effects: {
      paths: ['control-gateway/**', 'governance/control-gateway/**'],
      effects: ['CONTROL_GATEWAY_DEVELOPMENT_WRITE']
    },
    dependency_graph: { version: 1, edges: [] },
    qualification_state: 'PASSED',
    github_admission_state: 'NOT_REQUIRED',
    a01_state: 'NOT_REQUIRED',
    current_operation: {
      operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-003',
      state: 'TERMINAL',
      predecessor_receipt_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-002-FREEZE-887f1e49'
    },
    last_terminal_receipt: receipt,
    receipt_index: [receipt],
    successor_candidates: [{
      operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-004',
      predecessor_receipt_id: receipt.receipt_id,
      required_receipt_ids: [],
      qualification_state: 'PENDING',
      github_admission_state: 'PENDING',
      a01_state: 'NOT_REQUIRED'
    }],
    next_legal_operation: { kind: 'START_SUCCESSOR', operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-004', predecessor_receipt_id: receipt.receipt_id, reason: 'placeholder' }
  });
}

class FakeTransport {
  constructor() {
    this.refSha = GENESIS;
    this.commits = new Map([[GENESIS, { sha: GENESIS, parents: [], files: {} }]]);
    this.counter = 1;
    this.ambiguousMode = null;
    this.getRefCalls = 0;
    this.moveOnGetRefCall = null;
    this.moveToSha = 'f'.repeat(40);
  }

  async getRef() {
    this.getRefCalls += 1;
    if (this.moveOnGetRefCall === this.getRefCalls) this.refSha = this.moveToSha;
    return { sha: this.refSha };
  }

  async getCommit(sha) {
    const commit = this.commits.get(sha);
    if (!commit) throw new Error(`missing commit ${sha}`);
    return { sha: commit.sha, parents: [...commit.parents], tree_sha: 'b'.repeat(40) };
  }

  async readFile(sha, path) {
    const commit = this.commits.get(sha);
    if (!commit) throw new Error(`missing commit ${sha}`);
    return Object.hasOwn(commit.files, path) ? commit.files[path] : null;
  }

  async createCommitFromFiles({ parentSha, files }) {
    const parent = this.commits.get(parentSha);
    if (!parent) throw new Error(`missing parent ${parentSha}`);
    const sha = this.counter.toString(16).padStart(40, '0');
    this.counter += 1;
    this.commits.set(sha, { sha, parents: [parentSha], files: { ...parent.files, ...files } });
    return { sha, tree_sha: 'c'.repeat(40) };
  }

  async updateRefFastForward(_ref, sha) {
    const commit = this.commits.get(sha);
    if (!commit || commit.parents[0] !== this.refSha) throw new GitHubPublicationError('PUBLICATION_HEAD_CONFLICT', 'non-fast-forward');
    if (this.ambiguousMode === 'uncommitted') throw new GitHubPublicationError('GITHUB_NETWORK_AMBIGUOUS', 'network lost');
    this.refSha = sha;
    if (this.ambiguousMode === 'committed') throw new GitHubPublicationError('GITHUB_NETWORK_AMBIGUOUS', 'network lost after commit');
    return { sha };
  }

  rewriteFile(sha, path, content) {
    this.commits.get(sha).files[path] = content;
  }

  deleteFile(sha, path) {
    delete this.commits.get(sha).files[path];
  }
}

function publisher(transport, overrides = {}) {
  return new GitHubActiveWorkPublisher({ transport, ref: REF, workstreamId: WORKSTREAM, ...overrides });
}

async function initialPublication(transport = new FakeTransport()) {
  const p = publisher(transport);
  const result = await p.publish(packet(), { expectedHeadCommitSha: GENESIS, expectedPublicationRevision: 0, expectedPacketDigest: null });
  return { transport, p, result };
}

function parseHead(transport, sha) {
  return JSON.parse(transport.commits.get(sha).files[DEFAULT_ACTIVE_WORK_HEAD_PATH]);
}

function writeEnvelope(transport, sha, envelope) {
  const body = `${JSON.stringify(envelope)}\n`;
  transport.rewriteFile(sha, DEFAULT_ACTIVE_WORK_HEAD_PATH, body);
  transport.rewriteFile(sha, publicationRevisionPath(envelope.publication_revision, envelope.packet_digest), body);
}

test('initial publication writes exact head and immutable revision mirror', async () => {
  const { transport, result } = await initialPublication();
  assert.equal(result.idempotent, false);
  assert.equal(result.publication_revision, 1);
  const head = parseHead(transport, result.head_commit_sha);
  assert.equal(head.predecessor_commit_sha, GENESIS);
  assert.equal(head.predecessor_packet_digest, null);
  assert.ok(transport.commits.get(result.head_commit_sha).files[publicationRevisionPath(1, head.packet_digest)]);
});

test('reconstruction verifies history and exact NEXT_LEGAL_OPERATION', async () => {
  const { p, result } = await initialPublication();
  const reconstructed = await p.reconstruct();
  assert.equal(reconstructed.head_commit_sha, result.head_commit_sha);
  assert.equal(reconstructed.history.revisions_verified, 1);
  assert.equal(reconstructed.envelope.packet.next_legal_operation.kind, 'START_SUCCESSOR');
  assert.equal(reconstructed.envelope.packet.next_legal_operation.operation_id, 'SECOND-SHIFT-CONTROL-GATEWAY-CG-004');
});

test('chat reconstruction uses only verified GitHub publication state', async () => {
  const { p, result } = await initialPublication();
  const adapter = new GitHubChatReconstructionAdapter({ publisher: p });
  const state = await adapter.reconstructContinuation();
  assert.equal(state.source, 'GITHUB_DURABLE_ACTIVE_WORK');
  assert.equal(state.publication_commit_sha, result.head_commit_sha);
  assert.equal(state.workstream_id, WORKSTREAM);
  assert.equal(state.current_operation.operation_id, 'SECOND-SHIFT-CONTROL-GATEWAY-CG-003');
  assert.equal(state.next_legal_operation.operation_id, 'SECOND-SHIFT-CONTROL-GATEWAY-CG-004');
});

test('second publication creates a verified two-revision Git parent chain', async () => {
  const { p, result: first } = await initialPublication();
  const secondPacket = startNextLegalOperation(packet());
  const second = await p.publish(secondPacket, { expectedHeadCommitSha: first.head_commit_sha, expectedPublicationRevision: 1, expectedPacketDigest: first.packet_digest });
  assert.equal(second.publication_revision, 2);
  assert.equal(second.history.revisions_verified, 2);
  assert.equal(second.envelope.predecessor_commit_sha, first.head_commit_sha);
  assert.equal(second.envelope.predecessor_packet_digest, first.packet_digest);
  assert.equal(second.envelope.packet.current_operation.operation_id, 'SECOND-SHIFT-CONTROL-GATEWAY-CG-004');
});

test('identical packet publication is idempotent and creates no new commit', async () => {
  const { transport, p, result: first } = await initialPublication();
  const before = transport.counter;
  const again = await p.publish(packet(), { expectedHeadCommitSha: first.head_commit_sha, expectedPublicationRevision: 1, expectedPacketDigest: first.packet_digest });
  assert.equal(again.idempotent, true);
  assert.equal(again.head_commit_sha, first.head_commit_sha);
  assert.equal(transport.counter, before);
});

test('stale expected head fails closed before creating a publication commit', async () => {
  const { transport, p, result: first } = await initialPublication();
  await assert.rejects(
    p.publish(startNextLegalOperation(packet()), { expectedHeadCommitSha: GENESIS, expectedPublicationRevision: 1, expectedPacketDigest: first.packet_digest }),
    (error) => error.code === 'PUBLICATION_HEAD_CONFLICT'
  );
  assert.equal(transport.counter, 2);
});

test('packet tampering is detected by canonical packet digest verification', async () => {
  const { transport, p, result } = await initialPublication();
  const envelope = parseHead(transport, result.head_commit_sha);
  envelope.packet.repository = 'evil/repo';
  writeEnvelope(transport, result.head_commit_sha, envelope);
  await assert.rejects(p.reconstruct(), (error) => error.code === 'PUBLICATION_PACKET_DIGEST_MISMATCH');
});

test('forged stored NEXT_LEGAL_OPERATION is rejected even if publication digests are recomputed', async () => {
  const { transport, p, result } = await initialPublication();
  const envelope = parseHead(transport, result.head_commit_sha);
  envelope.packet.next_legal_operation.operation_id = 'UNAUTHORIZED-OP';
  envelope.packet_digest = (await import('../src/active-work-state.js')).sha256(envelope.packet);
  envelope.publication_digest = computePublicationDigest(envelope);
  writeEnvelope(transport, result.head_commit_sha, envelope);
  await assert.rejects(p.reconstruct(), (error) => error.code === 'NEXT_OPERATION_MISMATCH');
});

test('missing immutable revision mirror fails reconstruction', async () => {
  const { transport, p, result } = await initialPublication();
  const envelope = parseHead(transport, result.head_commit_sha);
  transport.deleteFile(result.head_commit_sha, publicationRevisionPath(1, envelope.packet_digest));
  await assert.rejects(p.reconstruct(), (error) => error.code === 'PUBLICATION_REVISION_MIRROR_MISSING');
});

test('Git commit parent mismatch fails reconstruction', async () => {
  const { transport, p, result } = await initialPublication();
  transport.commits.get(result.head_commit_sha).parents = ['e'.repeat(40)];
  await assert.rejects(p.reconstruct(), (error) => error.code === 'PUBLICATION_PARENT_MISMATCH');
});

test('history predecessor packet fork is detected after digest-consistent envelope tamper', async () => {
  const { transport, p, result: first } = await initialPublication();
  const second = await p.publish(startNextLegalOperation(packet()), { expectedHeadCommitSha: first.head_commit_sha, expectedPublicationRevision: 1, expectedPacketDigest: first.packet_digest });
  const envelope = parseHead(transport, second.head_commit_sha);
  envelope.predecessor_packet_digest = '0'.repeat(64);
  envelope.publication_digest = computePublicationDigest(envelope);
  writeEnvelope(transport, second.head_commit_sha, envelope);
  await assert.rejects(p.reconstruct(), (error) => error.code === 'PUBLICATION_HISTORY_PACKET_FORK');
});

test('workstream mismatch fails closed', async () => {
  const { transport } = await initialPublication();
  const wrong = publisher(transport, { workstreamId: 'OTHER-WORKSTREAM' });
  await assert.rejects(wrong.reconstruct(), (error) => error.code === 'PUBLICATION_WORKSTREAM_MISMATCH');
});

test('mission mismatch fails closed', async () => {
  const { transport } = await initialPublication();
  const wrong = publisher(transport, { missionVersion: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v2.0' });
  await assert.rejects(wrong.reconstruct(), (error) => error.code === 'PUBLICATION_MISSION_MISMATCH');
});

test('ref movement during reconstruction is detected and never silently accepted', async () => {
  const { transport, p } = await initialPublication();
  transport.moveOnGetRefCall = transport.getRefCalls + 2;
  await assert.rejects(p.reconstruct(), (error) => error.code === 'PUBLICATION_HEAD_MOVED');
});

test('ambiguous network failure after successful ref update is recovered by exact reread', async () => {
  const transport = new FakeTransport();
  transport.ambiguousMode = 'committed';
  const p = publisher(transport);
  const result = await p.publish(packet(), { expectedHeadCommitSha: GENESIS, expectedPublicationRevision: 0, expectedPacketDigest: null });
  assert.equal(result.publication_revision, 1);
  assert.notEqual(result.head_commit_sha, GENESIS);
});

test('ambiguous network failure without observed commit remains a hard failure', async () => {
  const transport = new FakeTransport();
  transport.ambiguousMode = 'uncommitted';
  const p = publisher(transport);
  await assert.rejects(
    p.publish(packet(), { expectedHeadCommitSha: GENESIS, expectedPublicationRevision: 0, expectedPacketDigest: null }),
    (error) => error.code === 'GITHUB_NETWORK_AMBIGUOUS'
  );
  assert.equal(transport.refSha, GENESIS);
});

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, async text() { return body === null ? '' : JSON.stringify(body); } };
}

test('REST transport supports read-only public reconstruction without inventing credentials', async () => {
  const calls = [];
  const transport = new GitHubActiveWorkRestTransport({
    owner: 'BFochtman746', repo: 'system-master', tokenProvider: null,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return response(200, { object: { sha: GENESIS } }); }
  });
  const ref = await transport.getRef(REF);
  assert.equal(ref.sha, GENESIS);
  assert.equal(calls[0].options.headers.Authorization, undefined);
});

test('REST transport publishes with bearer token and force=false fast-forward update', async () => {
  const calls = [];
  const transport = new GitHubActiveWorkRestTransport({
    owner: 'BFochtman746', repo: 'system-master', tokenProvider: async () => 'token',
    fetchImpl: async (url, options) => { calls.push({ url, options }); return response(200, { object: { sha: 'b'.repeat(40) } }); }
  });
  await transport.updateRefFastForward(REF, 'b'.repeat(40));
  assert.equal(calls[0].options.method, 'PATCH');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token');
  assert.deepEqual(JSON.parse(calls[0].options.body), { sha: 'b'.repeat(40), force: false });
});

test('REST transport treats content 404 as absent instead of fabricating state', async () => {
  const transport = new GitHubActiveWorkRestTransport({
    owner: 'BFochtman746', repo: 'system-master',
    fetchImpl: async () => response(404, { message: 'Not Found' })
  });
  assert.equal(await transport.readFile(GENESIS, DEFAULT_ACTIVE_WORK_HEAD_PATH), null);
});

test('REST transport classifies network uncertainty as ambiguous rather than retrying blindly', async () => {
  const transport = new GitHubActiveWorkRestTransport({
    owner: 'BFochtman746', repo: 'system-master',
    fetchImpl: async () => { throw new Error('socket reset'); }
  });
  await assert.rejects(transport.getRef(REF), (error) => error.code === 'GITHUB_NETWORK_AMBIGUOUS');
});
