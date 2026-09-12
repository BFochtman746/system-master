import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SuccessorRefAdmissionGate,
  SuccessorRefAdmissionError,
  SUCCESSOR_REF_REQUEST_PROTOCOL,
  SUCCESSOR_REF_EFFECT,
  validateSuccessorRefAdmissionReceipt,
  validateSuccessorRefExecutionReceipt
} from '../src/successor-ref-admission.js';

const PUB = '1'.repeat(40);
const PACKET = '2'.repeat(64);
const RECOVERY = '3'.repeat(64);
const BASE = '4'.repeat(40);
const PRED = 'SECOND-SHIFT-CONTROL-GATEWAY-CG-006-HOST-QUALIFICATION-34669313253';

function contract(overrides = {}) {
  return {
    mission_version: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0',
    workstream_id: 'SECOND-SHIFT-CONTROL-GATEWAY',
    authority_epoch: 5,
    recovery_digest: RECOVERY,
    publication_commit_sha: PUB,
    packet_digest: PACKET,
    repository: 'BFochtman746/system-master',
    qualification_state: 'PASSED',
    github_admission_state: 'PENDING',
    authority_branch_head_sha: BASE,
    continuation: {
      mode: 'START_SUCCESSOR',
      operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-007',
      predecessor_receipt_id: PRED,
      successor_standing: { qualification_state: 'PENDING', github_admission_state: 'PENDING', a01_state: 'NOT_REQUIRED' }
    },
    ...overrides
  };
}

function request(overrides = {}) {
  return {
    protocol_version: SUCCESSOR_REF_REQUEST_PROTOCOL,
    mutation_id: 'CG007-BRANCH-CREATE-001',
    mission_version: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0',
    workstream_id: 'SECOND-SHIFT-CONTROL-GATEWAY',
    authority_epoch: 5,
    recovery_digest: RECOVERY,
    authority_publication_commit_sha: PUB,
    authority_packet_digest: PACKET,
    repository: 'BFochtman746/system-master',
    operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-007',
    predecessor_receipt_id: PRED,
    target_ref: 'second-shift-control-gateway/cg-007-validator-closure',
    base_sha: BASE,
    effect: SUCCESSOR_REF_EFFECT,
    ...overrides
  };
}

class Recovery {
  constructor(contracts) { this.contracts = Array.isArray(contracts) ? contracts : [contracts]; this.i = 0; }
  async recoverContinue() { return structuredClone(this.contracts[Math.min(this.i++, this.contracts.length - 1)]); }
  async verifyRecoveryContractFresh(value) {
    const current = this.contracts.at(-1);
    if (value.recovery_digest !== current.recovery_digest) throw new Error('stale');
    return true;
  }
}

class Refs {
  constructor() { this.owner = 'BFochtman746'; this.repo = 'system-master'; this.refs = new Map(); this.ambiguous = false; this.ambiguousSha = null; }
  async getRef(name) { return this.refs.has(name) ? { sha: this.refs.get(name) } : null; }
  async createRef(name, sha) {
    if (this.refs.has(name)) throw new Error('exists');
    if (this.ambiguous) {
      this.refs.set(name, this.ambiguousSha ?? sha);
      throw new Error('network uncertain');
    }
    this.refs.set(name, sha);
  }
}

async function expectCode(code, fn) {
  await assert.rejects(fn, (error) => error instanceof SuccessorRefAdmissionError && error.code === code);
}

test('exact recovered successor receives create-only admission and execution receipt', async () => {
  const refs = new Refs();
  const gate = new SuccessorRefAdmissionGate({ recoveryGate: new Recovery(contract()), refTransport: refs });
  const req = request();
  const admission = await gate.admit(req);
  assert.equal(validateSuccessorRefAdmissionReceipt(admission), true);
  const execution = await gate.executeGrant(admission, req);
  assert.equal(validateSuccessorRefExecutionReceipt(execution), true);
  assert.equal(execution.created_sha, BASE);
  assert.equal(execution.recovered_after_ambiguous_create, false);
});

test('target ref must be deterministic for the recovered operation', async () => {
  const gate = new SuccessorRefAdmissionGate({ recoveryGate: new Recovery(contract()), refTransport: new Refs() });
  await expectCode('SUCCESSOR_REF_TARGET_INVALID', () => gate.admit(request({ target_ref: 'feature/arbitrary' })));
});

test('existing target ref fails closed before admission', async () => {
  const refs = new Refs(); refs.refs.set(request().target_ref, BASE);
  const gate = new SuccessorRefAdmissionGate({ recoveryGate: new Recovery(contract()), refTransport: refs });
  await expectCode('SUCCESSOR_REF_ALREADY_EXISTS', () => gate.admit(request()));
});

test('base SHA must equal exact recovered governance head', async () => {
  const gate = new SuccessorRefAdmissionGate({ recoveryGate: new Recovery(contract()), refTransport: new Refs() });
  await expectCode('SUCCESSOR_REF_BASE_MISMATCH', () => gate.admit(request({ base_sha: '5'.repeat(40) })));
});

test('wrong repository fails closed', async () => {
  const gate = new SuccessorRefAdmissionGate({ recoveryGate: new Recovery(contract()), refTransport: new Refs() });
  await expectCode('SUCCESSOR_REF_REPOSITORY_MISMATCH', () => gate.admit(request({ repository: 'BFochtman746/other' })));
});

test('denied successor standing fails closed', async () => {
  const bad = contract(); bad.continuation.successor_standing.github_admission_state = 'DENIED';
  const gate = new SuccessorRefAdmissionGate({ recoveryGate: new Recovery(bad), refTransport: new Refs() });
  await expectCode('SUCCESSOR_REF_GITHUB_STANDING_INVALID', () => gate.admit(request()));
});

test('admission requires START_SUCCESSOR recovery mode', async () => {
  const bad = contract({ continuation: { mode: 'CONTINUE_CURRENT', operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-007', predecessor_receipt_id: PRED } });
  const gate = new SuccessorRefAdmissionGate({ recoveryGate: new Recovery(bad), refTransport: new Refs() });
  await expectCode('SUCCESSOR_REF_NOT_STARTABLE', () => gate.admit(request()));
});

test('authority movement during admission fails closed', async () => {
  const moved = contract({ recovery_digest: '9'.repeat(64) });
  const gate = new SuccessorRefAdmissionGate({ recoveryGate: new Recovery([contract(), moved]), refTransport: new Refs() });
  await expectCode('SUCCESSOR_REF_AUTHORITY_MOVED', () => gate.admit(request()));
});

test('grant becomes stale if target appears before execution', async () => {
  const refs = new Refs();
  const gate = new SuccessorRefAdmissionGate({ recoveryGate: new Recovery(contract()), refTransport: refs });
  const req = request();
  const admission = await gate.admit(req);
  refs.refs.set(req.target_ref, BASE);
  await expectCode('SUCCESSOR_REF_ADMISSION_STALE', () => gate.verifyGrantFresh(admission, req));
});

test('ambiguous create is recovered only when exact admitted ref is observed', async () => {
  const refs = new Refs(); refs.ambiguous = true;
  const gate = new SuccessorRefAdmissionGate({ recoveryGate: new Recovery(contract()), refTransport: refs });
  const req = request();
  const admission = await gate.admit(req);
  const execution = await gate.executeGrant(admission, req);
  assert.equal(execution.recovered_after_ambiguous_create, true);
  assert.equal(execution.created_sha, BASE);
});

test('ambiguous create to wrong SHA remains failure', async () => {
  const refs = new Refs(); refs.ambiguous = true; refs.ambiguousSha = '6'.repeat(40);
  const gate = new SuccessorRefAdmissionGate({ recoveryGate: new Recovery(contract()), refTransport: refs });
  const req = request();
  const admission = await gate.admit(req);
  await assert.rejects(() => gate.executeGrant(admission, req), /network uncertain/);
});

test('tampered admission receipt is rejected', async () => {
  const refs = new Refs();
  const gate = new SuccessorRefAdmissionGate({ recoveryGate: new Recovery(contract()), refTransport: refs });
  const admission = structuredClone(await gate.admit(request()));
  admission.base_sha = '7'.repeat(40);
  await expectCode('SUCCESSOR_REF_ADMISSION_DIGEST_MISMATCH', async () => validateSuccessorRefAdmissionReceipt(admission));
});
