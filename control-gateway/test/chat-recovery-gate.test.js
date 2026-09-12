import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVE_WORK_PROTOCOL, CG001_MISSION_VERSION, finalizeActiveWorkPacket } from '../src/active-work-state.js';
import { GitHubActiveWorkPublisher, GitHubChatReconstructionAdapter, GitHubActiveWorkRestTransport } from '../src/github-active-work-publication.js';
import { GitHubMutationAuthorityAdapter } from '../src/github-mutation-authority-adapter.js';
import { CHAT_RECOVERY_PROTOCOL, ChatRecoveryError, GitHubChatRecoveryGate, computeRecoveryDigest, DEFAULT_GOVERNANCE_PACKET_PATH } from '../src/chat-recovery-gate.js';

const W = 'SECOND-SHIFT-CONTROL-GATEWAY';
const Q = '6'.repeat(40);
const H = '7'.repeat(40);
const P = '8'.repeat(40);
const R = 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005-HOST-QUALIFICATION-34668105764';

function packet({ active = false, successors = 'one', qualification = 'PASSED' } = {}) {
  const receipt = { receipt_id: R, operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005', outcome: 'SUCCEEDED', satisfies_dependency: true, subject: { algorithm: 'sha1', oid: Q } };
  const one = { operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-006', predecessor_receipt_id: R, required_receipt_ids: [], qualification_state: 'PENDING', github_admission_state: 'PENDING', a01_state: 'NOT_REQUIRED' };
  const candidates = successors === 'none' ? [] : successors === 'two' ? [one, { ...one, operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-006B' }] : [one];
  return finalizeActiveWorkPacket({
    protocol_version: ACTIVE_WORK_PROTOCOL,
    mission_version: CG001_MISSION_VERSION,
    workstream_id: W,
    authority_epoch: 4,
    authority_rebind_receipt_id: R,
    authoritative_subject: { algorithm: 'sha1', oid: Q },
    repository: 'BFochtman746/system-master',
    branch_or_ref: 'second-shift-control-gateway/cg-005-github-admission',
    allowed_paths_or_effects: { paths: ['control-gateway/**', 'governance/control-gateway/**'], effects: ['CONTROL_GATEWAY_DEVELOPMENT_WRITE', 'CONTROL_GATEWAY_STATE_PUBLICATION'] },
    dependency_graph: { version: 1, edges: [] },
    qualification_state: qualification,
    github_admission_state: 'ADMITTED',
    a01_state: 'NOT_REQUIRED',
    current_operation: active ? { operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-006', state: 'ACTIVE', predecessor_receipt_id: R } : { operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005', state: 'TERMINAL', predecessor_receipt_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-004-LIVE-GITHUB-QUALIFICATION-34667378000' },
    last_terminal_receipt: receipt,
    receipt_index: [receipt],
    successor_candidates: active ? [] : candidates,
    next_legal_operation: { kind: 'NO_LEGAL_SUCCESSOR', operation_id: null, predecessor_receipt_id: R, reason: 'placeholder' }
  });
}

function pubFor(pkt) {
  return { ref: 'control-gateway-state/active-work/second-shift-control-gateway-dev', head_commit_sha: P, publication_revision: 3, packet_digest: 'a'.repeat(64), publication_digest: '9'.repeat(64), envelope: { packet: pkt } };
}

class Publisher {
  constructor(pkt) { this.current = pubFor(pkt); this.calls = 0; this.moveOnCall = null; }
  async reconstruct() {
    this.calls += 1;
    if (this.moveOnCall === this.calls) this.current = { ...this.current, head_commit_sha: 'b'.repeat(40), packet_digest: 'c'.repeat(64) };
    return structuredClone(this.current);
  }
}
class Authority {
  constructor(p) { this.p = p; }
  async reconstructContinuation() {
    const x = await this.p.reconstruct(); const p = x.envelope.packet;
    return { publication_ref: x.ref, publication_commit_sha: x.head_commit_sha, publication_revision: x.publication_revision, packet_digest: x.packet_digest, mission_version: p.mission_version, workstream_id: p.workstream_id, authoritative_subject: structuredClone(p.authoritative_subject), repository: p.repository, branch_or_ref: p.branch_or_ref, current_operation: structuredClone(p.current_operation), qualification_state: p.qualification_state, github_admission_state: p.github_admission_state, a01_state: p.a01_state, next_legal_operation: structuredClone(p.next_legal_operation), authority_epoch: p.authority_epoch, allowed_paths_or_effects: structuredClone(p.allowed_paths_or_effects), successor_candidates: structuredClone(p.successor_candidates) };
  }
}
class WorkRef {
  constructor(pkt) {
    this.refSha = H; this.calls = 0; this.moveOnCall = null;
    this.files = new Map([[`${H}:${DEFAULT_GOVERNANCE_PACKET_PATH}`, `${JSON.stringify(pkt)}\n`]]);
    this.commits = new Map([[H, { sha: H, parents: [Q] }], [Q, { sha: Q, parents: ['5'.repeat(40)] }]]);
  }
  async getRef() { this.calls += 1; if (this.moveOnCall === this.calls) this.refSha = 'd'.repeat(40); return { sha: this.refSha }; }
  async getCommit(sha) { return structuredClone(this.commits.get(sha) ?? { sha, parents: [] }); }
  async readFile(sha, path) { return this.files.get(`${sha}:${path}`) ?? null; }
}
function rig(pkt = packet()) {
  const publisher = new Publisher(pkt); const authorityAdapter = new Authority(publisher); const workRefTransport = new WorkRef(pkt);
  const gate = new GitHubChatRecoveryGate({ authorityAdapter, publisher, workRefTransport, expectedWorkstreamId: W });
  return { gate, publisher, workRefTransport };
}
async function rejects(p, code) { await assert.rejects(p, e => e instanceof ChatRecoveryError && e.code === code); }

test('fresh restart recovers exact successor and governance freeze base without chat state', async () => {
  const c = await rig().gate.recoverContinue();
  assert.equal(c.protocol_version, CHAT_RECOVERY_PROTOCOL); assert.equal(c.continuation.mode, 'START_SUCCESSOR');
  assert.equal(c.continuation.operation_id, 'SECOND-SHIFT-CONTROL-GATEWAY-CG-006'); assert.equal(c.continuation.predecessor_receipt_id, R);
  assert.equal(c.authority_branch_head_sha, H); assert.equal(c.authority_subject_to_head_distance, 1); assert.equal(c.authoritative_subject.oid, Q);
  assert.equal(c.recovery_digest, computeRecoveryDigest(c)); assert.equal(c.mutation_admission_required, true); assert.equal(c.exact_predecessor_cas_required, true);
});
test('ACTIVE operation recovers CONTINUE_CURRENT', async () => { const c = await rig(packet({ active: true })).gate.recoverContinue(); assert.equal(c.continuation.mode, 'CONTINUE_CURRENT'); });
test('failed standing requires reconciliation', async () => { await rejects(rig(packet({ active: true, qualification: 'FAILED' })).gate.recoverContinue(), 'RECOVERY_RECONCILIATION_REQUIRED'); });
test('no successor fails closed', async () => { await rejects(rig(packet({ successors: 'none' })).gate.recoverContinue(), 'RECOVERY_NO_LEGAL_SUCCESSOR'); });
test('multiple successors fail closed as ambiguous', async () => { await rejects(rig(packet({ successors: 'two' })).gate.recoverContinue(), 'RECOVERY_AMBIGUOUS_SUCCESSORS'); });
test('governance packet must match durable publication exactly', async () => { const x = rig(); x.workRefTransport.files.set(`${H}:${DEFAULT_GOVERNANCE_PACKET_PATH}`, `${JSON.stringify(packet({ active: true }))}\n`); await rejects(x.gate.recoverContinue(), 'RECOVERY_GOVERNANCE_PACKET_MISMATCH'); });
test('missing governance packet fails closed', async () => { const x = rig(); x.workRefTransport.files.clear(); await rejects(x.gate.recoverContinue(), 'RECOVERY_GOVERNANCE_PACKET_MISSING'); });
test('governance head must have single-parent ancestry to qualified subject', async () => { const x = rig(); x.workRefTransport.commits.set(H, { sha: H, parents: ['1'.repeat(40), '2'.repeat(40)] }); await rejects(x.gate.recoverContinue(), 'RECOVERY_WORK_REF_NONLINEAR'); });
test('work-ref movement during recovery fails closed', async () => { const x = rig(); x.workRefTransport.moveOnCall = 2; await rejects(x.gate.recoverContinue(), 'RECOVERY_WORK_REF_MOVED'); });
test('durable publication movement on final authority recheck fails closed', async () => { const x = rig(); x.publisher.moveOnCall = 3; await rejects(x.gate.recoverContinue(), 'RECOVERY_AUTHORITY_MOVED'); });
test('tampered recovery contract is rejected', async () => { const x = rig(); const c = structuredClone(await x.gate.recoverContinue()); c.continuation.operation_id = 'FORGED'; await rejects(x.gate.verifyRecoveryContractFresh(c), 'RECOVERY_CONTRACT_TAMPERED'); });
test('valid recovery contract becomes stale after authority moves', async () => { const x = rig(); const c = await x.gate.recoverContinue(); x.publisher.current = { ...x.publisher.current, head_commit_sha: 'e'.repeat(40), packet_digest: 'f'.repeat(64) }; await rejects(x.gate.verifyRecoveryContractFresh(c), 'RECOVERY_CONTRACT_STALE'); });
test('configured workstream fence prevents cross-chat workstream drift', async () => { const x = rig(); const bad = new GitHubChatRecoveryGate({ authorityAdapter: new Authority(x.publisher), publisher: x.publisher, workRefTransport: x.workRefTransport, expectedWorkstreamId: 'OTHER-WORKSTREAM' }); await rejects(bad.recoverContinue(), 'RECOVERY_WORKSTREAM_MISMATCH'); });

const live = ['CG006_LIVE_REF','CG006_EXPECTED_PUBLICATION_COMMIT','CG006_EXPECTED_PACKET_DIGEST','CG006_EXPECTED_AUTHORITY_SUBJECT','CG006_EXPECTED_WORK_REF','CG006_EXPECTED_WORK_REF_HEAD','CG006_EXPECTED_OPERATION','CG006_EXPECTED_PREDECESSOR_RECEIPT'].every(n => process.env[n]);
test('live GitHub recovery reconstructs exact CG-006 continuation and freeze base without prior chat state', { skip: !live && 'CG006 live GitHub qualification environment not configured' }, async () => {
  const transport = new GitHubActiveWorkRestTransport({ owner: 'BFochtman746', repo: 'system-master', tokenProvider: process.env.CG006_GITHUB_TOKEN ? async () => process.env.CG006_GITHUB_TOKEN : null });
  const publisher = new GitHubActiveWorkPublisher({ transport, ref: process.env.CG006_LIVE_REF, workstreamId: W });
  const chat = new GitHubChatReconstructionAdapter({ publisher }); const authorityAdapter = new GitHubMutationAuthorityAdapter({ chatReconstructionAdapter: chat });
  const gate = new GitHubChatRecoveryGate({ authorityAdapter, publisher, workRefTransport: transport, expectedWorkstreamId: W });
  const c = await gate.recoverContinue();
  assert.equal(c.publication_commit_sha, process.env.CG006_EXPECTED_PUBLICATION_COMMIT); assert.equal(c.packet_digest, process.env.CG006_EXPECTED_PACKET_DIGEST);
  assert.equal(c.authoritative_subject.oid, process.env.CG006_EXPECTED_AUTHORITY_SUBJECT); assert.equal(c.authority_branch_or_ref, process.env.CG006_EXPECTED_WORK_REF);
  assert.equal(c.authority_branch_head_sha, process.env.CG006_EXPECTED_WORK_REF_HEAD); assert.equal(c.continuation.operation_id, process.env.CG006_EXPECTED_OPERATION);
  assert.equal(c.continuation.predecessor_receipt_id, process.env.CG006_EXPECTED_PREDECESSOR_RECEIPT); assert.equal(c.continuation.mode, 'START_SUCCESSOR');
});
