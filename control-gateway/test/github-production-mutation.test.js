import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '../src/active-work-state.js';
import {
  GitHubMutationAdmissionGate,
  GITHUB_MUTATION_REQUEST_PROTOCOL
} from '../src/github-mutation-admission.js';
import {
  GITHUB_PRODUCTION_MUTATION_PLAN_PROTOCOL,
  GitHubProductionMutationGate,
  GitHubReceiptConsumingCasWriter,
  GitHubProductionMutationError,
  productionMutationPlanDigest,
  validateProductionMutationExecutionReceipt
} from '../src/github-production-mutation.js';

const REPO = 'BFochtman746/system-master';
const WORKSTREAM = 'SECOND-SHIFT-CONTROL-GATEWAY';
const MISSION = 'SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0';
const TARGET_REF = 'second-shift-control-gateway/cg-005-production-writer-test';
const STATE_REF = 'control-gateway-state/active-work/second-shift-control-gateway-dev';
const PUBLICATION_SHA = '1'.repeat(40);
const PACKET_DIGEST = '2'.repeat(64);
const SUBJECT_SHA = '3'.repeat(40);
const PREDECESSOR_SHA = '4'.repeat(40);
const RESULT_TREE_SHA = '5'.repeat(40);
const RESULT_COMMIT_SHA = '6'.repeat(40);
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
    branch_or_ref: TARGET_REF,
    allowed_paths_or_effects: {
      paths: ['control-gateway/**'],
      effects: ['CONTROL_GATEWAY_DEVELOPMENT_WRITE']
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
    mutation_id: 'CG005-PRODUCTION-MUTATION-001',
    mission_version: MISSION,
    workstream_id: WORKSTREAM,
    authority_epoch: 3,
    authority_publication_commit_sha: PUBLICATION_SHA,
    authority_packet_digest: PACKET_DIGEST,
    authoritative_subject: { algorithm: 'sha1', oid: SUBJECT_SHA },
    repository: REPO,
    target_kind: 'WORK_REF',
    target_ref: TARGET_REF,
    expected_predecessor_sha: PREDECESSOR_SHA,
    operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005',
    predecessor_receipt_id: PREDECESSOR_RECEIPT,
    paths: ['control-gateway/example.txt'],
    effects: ['CONTROL_GATEWAY_DEVELOPMENT_WRITE'],
    ...overrides
  };
}

function plan(content = 'hello\n', overrides = {}) {
  return {
    protocol_version: GITHUB_PRODUCTION_MUTATION_PLAN_PROTOCOL,
    mutation_id: 'CG005-PRODUCTION-MUTATION-001',
    repository: REPO,
    target_kind: 'WORK_REF',
    target_ref: TARGET_REF,
    expected_predecessor_sha: PREDECESSOR_SHA,
    commit_message: 'control-gateway: apply admitted production mutation',
    writes: [{ path: 'control-gateway/example.txt', content_utf8: content, content_sha256: sha256(content) }],
    deletes: [],
    ...overrides
  };
}

class FakeAdapter {
  constructor(value = continuation()) { this.value = value; }
  async reconstructContinuation() { return structuredClone(this.value); }
}

class FakeAdmissionTransport {
  constructor() {
    this.owner = 'BFochtman746';
    this.repo = 'system-master';
    this.sha = PREDECESSOR_SHA;
  }
  async getRef() { return { sha: this.sha }; }
}

async function productionGrant({ req = request(), mutationPlan = plan(), adapter = new FakeAdapter(), transport = new FakeAdmissionTransport() } = {}) {
  const admissionGate = new GitHubMutationAdmissionGate({ reconstructionAdapter: adapter, mutationTransport: transport });
  const receipt = await admissionGate.admit(req);
  const gate = new GitHubProductionMutationGate({ admissionGate });
  const grant = await gate.authorize({ receipt, request: req, plan: mutationPlan });
  return { receipt, grant, admissionGate, transport };
}

class FakeWriterTransport {
  constructor() {
    this.owner = 'BFochtman746';
    this.repo = 'system-master';
    this.refSha = PREDECESSOR_SHA;
    this.parentTree = '7'.repeat(40);
    this.resultTree = RESULT_TREE_SHA;
    this.createdCommit = null;
    this.updateCalls = 0;
    this.ambiguousAfterApply = false;
    this.moveBeforeUpdate = false;
  }
  async getRef() { return { sha: this.refSha }; }
  async getCommit(sha) {
    if (sha === PREDECESSOR_SHA) return { sha, tree_sha: this.parentTree, parents: ['8'.repeat(40)], message: 'parent' };
    if (this.createdCommit && sha === this.createdCommit.sha) return structuredClone(this.createdCommit);
    return null;
  }
  async createTreeFromPlan() { return { sha: this.resultTree }; }
  async createCommit({ parentSha, treeSha, message }) {
    this.createdCommit = { sha: RESULT_COMMIT_SHA, tree_sha: treeSha, parents: [parentSha], message };
    return { sha: RESULT_COMMIT_SHA };
  }
  async updateRefFastForward(ref, sha) {
    this.updateCalls += 1;
    if (this.moveBeforeUpdate) {
      this.refSha = '9'.repeat(40);
      const error = new GitHubProductionMutationError('GITHUB_REF_CONFLICT', 'moved');
      throw error;
    }
    this.refSha = sha;
    if (this.ambiguousAfterApply) {
      const error = new GitHubProductionMutationError('GITHUB_NETWORK_AMBIGUOUS', 'ambiguous');
      throw error;
    }
    return { sha };
  }
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error instanceof GitHubProductionMutationError && error.code === code);
}

test('production plan digest is byte-bound', () => {
  assert.notEqual(productionMutationPlanDigest(plan('alpha\n')), productionMutationPlanDigest(plan('beta\n')));
});

test('production gate requires exact admitted path set and binds plan digest', async () => {
  const { grant } = await productionGrant();
  assert.equal(grant.plan_digest, productionMutationPlanDigest(plan()));
  await rejectsCode(productionGrant({ mutationPlan: plan('hello\n', {
    writes: [{ path: 'control-gateway/other.txt', content_utf8: 'hello\n', content_sha256: sha256('hello\n') }]
  }) }), 'PRODUCTION_MUTATION_PATH_SET_MISMATCH');
});



test('production grant preserves a null predecessor for an active operation and remains executable', async () => {
  const active = continuation({
    current_operation: { operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005', state: 'ACTIVE', predecessor_receipt_id: null },
    next_legal_operation: { kind: 'CONTINUE_CURRENT', operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-005', predecessor_receipt_id: null, reason: 'CURRENT_OPERATION_NONTERMINAL' }
  });
  const req = request({ predecessor_receipt_id: null });
  const { grant } = await productionGrant({ req, adapter: new FakeAdapter(active) });
  assert.equal(grant.predecessor_receipt_id, null);
  const transport = new FakeWriterTransport();
  const receipt = await new GitHubReceiptConsumingCasWriter({ transport }).execute({ grant, plan: plan() });
  assert.equal(receipt.result_commit_sha, RESULT_COMMIT_SHA);
  assert.equal(validateProductionMutationExecutionReceipt(receipt), true);
});

test('receipt-consuming writer applies exact predecessor CAS and emits verifiable receipt', async () => {
  const { grant } = await productionGrant();
  const transport = new FakeWriterTransport();
  const writer = new GitHubReceiptConsumingCasWriter({ transport });
  const receipt = await writer.execute({ grant, plan: plan() });
  assert.equal(receipt.result_commit_sha, RESULT_COMMIT_SHA);
  assert.equal(receipt.result_tree_sha, RESULT_TREE_SHA);
  assert.equal(receipt.predecessor_sha, PREDECESSOR_SHA);
  assert.equal(receipt.idempotent_replay, false);
  assert.equal(transport.refSha, RESULT_COMMIT_SHA);
  assert.equal(transport.updateCalls, 1);
  assert.equal(validateProductionMutationExecutionReceipt(receipt), true);
});

test('arbitrary moved descendant is rejected rather than treated as replay', async () => {
  const { grant } = await productionGrant();
  const transport = new FakeWriterTransport();
  transport.refSha = 'a'.repeat(40);
  await rejectsCode(new GitHubReceiptConsumingCasWriter({ transport }).execute({ grant, plan: plan() }), 'PRODUCTION_MUTATION_PREDECESSOR_MISMATCH');
});

test('ambiguous update is recovered by exact reread and exact replay is idempotent', async () => {
  const { grant } = await productionGrant();
  const transport = new FakeWriterTransport();
  transport.ambiguousAfterApply = true;
  const writer = new GitHubReceiptConsumingCasWriter({ transport });
  const first = await writer.execute({ grant, plan: plan() });
  assert.equal(first.idempotent_replay, false);
  transport.ambiguousAfterApply = false;
  const replay = await writer.execute({ grant, plan: plan() });
  assert.equal(replay.idempotent_replay, true);
  assert.equal(replay.result_commit_sha, RESULT_COMMIT_SHA);
  assert.equal(transport.updateCalls, 1);
});

test('changed bytes after grant are rejected before ref mutation', async () => {
  const original = plan('alpha\n');
  const { grant } = await productionGrant({ mutationPlan: original });
  const transport = new FakeWriterTransport();
  await rejectsCode(new GitHubReceiptConsumingCasWriter({ transport }).execute({ grant, plan: plan('beta\n') }), 'PRODUCTION_MUTATION_PLAN_CHANGED');
  assert.equal(transport.updateCalls, 0);
});

test('CAS race before ref update fails closed', async () => {
  const { grant } = await productionGrant();
  const transport = new FakeWriterTransport();
  let calls = 0;
  transport.getRef = async () => {
    calls += 1;
    if (calls === 1) return { sha: PREDECESSOR_SHA };
    return { sha: 'b'.repeat(40) };
  };
  await rejectsCode(new GitHubReceiptConsumingCasWriter({ transport }).execute({ grant, plan: plan() }), 'PRODUCTION_MUTATION_CAS_LOST');
  assert.equal(transport.updateCalls, 0);
});

test('legacy admission receipt is not itself a production execution grant', async () => {
  const { receipt } = await productionGrant();
  const transport = new FakeWriterTransport();
  await rejectsCode(Promise.resolve().then(() => new GitHubReceiptConsumingCasWriter({ transport }).execute({ grant: receipt, plan: plan() })), 'PRODUCTION_MUTATION_SCHEMA_UNKNOWN_FIELD');
});
