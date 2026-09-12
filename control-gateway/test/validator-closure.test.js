import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ValidatorClosureGate,
  ValidatorClosureError,
  VALIDATOR_REQUEST_PROTOCOL,
  validateValidatorReceipt,
  validatorRequestDigest
} from '../src/validator-closure.js';

const PUB = 'a'.repeat(40);
const PACKET = 'b'.repeat(64);
const PUBDIGEST = 'c'.repeat(64);
const RECOVERY = 'd'.repeat(64);
const PRED = 'SECOND-SHIFT-CONTROL-GATEWAY-CG-006-HOST-QUALIFICATION-34669313253';
const CODE_DIGEST = '1'.repeat(64);
const WORKFLOW_DIGEST = '2'.repeat(64);
const SCHEMA_DIGEST = '3'.repeat(64);
const GOV_DIGEST = '4'.repeat(64);

function recovery(overrides = {}) {
  return {
    mission_version: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0',
    workstream_id: 'SECOND-SHIFT-CONTROL-GATEWAY',
    authority_epoch: 6,
    recovery_digest: RECOVERY,
    publication_commit_sha: PUB,
    packet_digest: PACKET,
    publication_digest: PUBDIGEST,
    repository: 'BFochtman746/system-master',
    github_admission_state: 'PENDING',
    allowed_paths_or_effects: {
      paths: ['.github/workflows/second-shift-control-gateway-cg-007.yml', 'control-gateway/**', 'governance/control-gateway/**'],
      effects: ['CONTROL_GATEWAY_DEVELOPMENT_WRITE']
    },
    continuation: {
      mode: 'CONTINUE_CURRENT',
      operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-007',
      predecessor_receipt_id: PRED
    },
    ...overrides
  };
}

function publication(overrides = {}) {
  return {
    head_commit_sha: PUB,
    packet_digest: PACKET,
    publication_digest: PUBDIGEST,
    envelope: {
      packet: {
        receipt_index: [
          {
            receipt_id: PRED,
            operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-006',
            outcome: 'SUCCEEDED',
            satisfies_dependency: true,
            subject: { algorithm: 'sha1', oid: 'e'.repeat(40) }
          }
        ]
      }
    },
    ...overrides
  };
}

function request(overrides = {}) {
  const value = {
    protocol_version: VALIDATOR_REQUEST_PROTOCOL,
    validation_id: 'CG007-VALIDATION-001',
    mission_version: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0',
    workstream_id: 'SECOND-SHIFT-CONTROL-GATEWAY',
    authority_epoch: 6,
    recovery_digest: RECOVERY,
    authority_publication_commit_sha: PUB,
    authority_packet_digest: PACKET,
    repository: 'BFochtman746/system-master',
    operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-007',
    predecessor_receipt_id: PRED,
    artifacts: [
      { path: 'control-gateway/src/validator-closure.js', digest: CODE_DIGEST, kind: 'CODE', families: ['CODE'] },
      { path: '.github/workflows/second-shift-control-gateway-cg-007.yml', digest: WORKFLOW_DIGEST, kind: 'WORKFLOW', families: ['CODE', 'ROUTING'] },
      { path: 'control-gateway/contracts/validator-request.v1.json', digest: SCHEMA_DIGEST, kind: 'SCHEMA', families: ['SCHEMA', 'CONTRACT'] },
      { path: 'governance/control-gateway/SECOND-SHIFT-CONTROL-GATEWAY-ACTIVE-WORK-PACKET.json', digest: GOV_DIGEST, kind: 'GOVERNANCE', families: ['DEPENDENCY'] }
    ],
    code_evidence: [
      { artifact_path: 'control-gateway/src/validator-closure.js', artifact_digest: CODE_DIGEST, syntax: 'PASS', static_analysis: 'PASS', tests: 'PASS' },
      { artifact_path: '.github/workflows/second-shift-control-gateway-cg-007.yml', artifact_digest: WORKFLOW_DIGEST, syntax: 'PASS', static_analysis: 'PASS', tests: 'PASS' }
    ],
    routes: [
      {
        route_id: 'CG007-HOST-QUALIFICATION',
        artifact_path: '.github/workflows/second-shift-control-gateway-cg-007.yml',
        artifact_digest: WORKFLOW_DIGEST,
        execution_class: 'HOST_QUALIFICATION',
        source: 'CONTROL_GATEWAY',
        destination: 'GITHUB_ACTIONS',
        control_authority: 'CONTROL_GATEWAY',
        execution_owner: 'GITHUB_ACTIONS',
        scheduler_owner: 'GITHUB_ACTIONS',
        gateway_enforced: true,
        direct_bypass: false
      }
    ],
    schemas: [
      {
        schema_id: 'control-gateway.validator-request.v1',
        artifact_path: 'control-gateway/contracts/validator-request.v1.json',
        artifact_digest: SCHEMA_DIGEST,
        version: 'v1',
        strict: true,
        unknown_fields: 'REJECT',
        validation: 'PASS'
      }
    ],
    contracts: [
      {
        contract_id: 'CG007-VALIDATOR-CONTRACT',
        artifact_path: 'control-gateway/contracts/validator-request.v1.json',
        artifact_digest: SCHEMA_DIGEST,
        version: 'v1',
        producer: 'CONTROL_GATEWAY',
        consumer: 'GITHUB_ADMISSION',
        schema_ids: ['control-gateway.validator-request.v1'],
        route_ids: ['CG007-HOST-QUALIFICATION'],
        required_fields: ['operation_id', 'predecessor_receipt_id'],
        compatibility: 'PASS'
      }
    ],
    dependencies: [
      {
        dependency_id: 'CG007-PREDECESSOR',
        artifact_path: 'governance/control-gateway/SECOND-SHIFT-CONTROL-GATEWAY-ACTIVE-WORK-PACKET.json',
        receipt_id: PRED,
        operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-006',
        state: 'SATISFIED'
      }
    ]
  };
  return { ...value, ...overrides };
}

class RecoveryGate {
  constructor(values) { this.values = Array.isArray(values) ? values : [values]; this.i = 0; }
  async recoverContinue() { return structuredClone(this.values[Math.min(this.i++, this.values.length - 1)]); }
  async verifyRecoveryContractFresh(contract) {
    const current = this.values.at(-1);
    if (contract.recovery_digest !== current.recovery_digest) throw new Error('stale');
    return true;
  }
}

class Publisher {
  constructor(values) { this.values = Array.isArray(values) ? values : [values]; this.i = 0; }
  async reconstruct() { return structuredClone(this.values[Math.min(this.i++, this.values.length - 1)]); }
}

async function expectCode(code, fn) {
  await assert.rejects(fn, (error) => error instanceof ValidatorClosureError && error.code === code);
}

function gate({ recoveries = recovery(), publications = publication() } = {}) {
  return new ValidatorClosureGate({ recoveryGate: new RecoveryGate(recoveries), publisher: new Publisher(publications) });
}

test('all five validator families produce deterministic granted receipt', async () => {
  const req = request();
  const receipt = await gate().validate(req);
  assert.equal(validateValidatorReceipt(receipt), true);
  assert.equal(receipt.validated_artifact_count, 4);
  assert.deepEqual(receipt.family_counts, { CODE: 2, ROUTING: 1, SCHEMA: 1, CONTRACT: 1, DEPENDENCY: 1 });
  assert.equal(receipt.request_digest, validatorRequestDigest(req));
});

test('artifact order and family order do not change request digest', () => {
  const a = request();
  const b = structuredClone(a);
  b.artifacts.reverse();
  for (const artifact of b.artifacts) artifact.families.reverse();
  b.code_evidence.reverse();
  assert.equal(validatorRequestDigest(a), validatorRequestDigest(b));
});

test('code evidence must pass syntax, static analysis and tests', async () => {
  const bad = request(); bad.code_evidence[0].syntax = 'FAIL';
  await expectCode('VALIDATOR_CODE_FAILED', () => gate().validate(bad));
});

test('workflow routing cannot bypass the control gateway', async () => {
  const bad = request(); bad.routes[0].direct_bypass = true;
  await expectCode('VALIDATOR_ROUTE_BYPASS', () => gate().validate(bad));
});

test('A-01 route ownership requires the A-01 supervisor as execution and scheduler owner', async () => {
  const bad = request();
  bad.routes[0] = { ...bad.routes[0], execution_class: 'A01_EXECUTION', execution_owner: 'GITHUB_ACTIONS', scheduler_owner: 'GITHUB_ACTIONS' };
  await expectCode('VALIDATOR_ROUTE_OWNER_INVALID', () => gate().validate(bad));
});

test('schema evidence must be strict and reject unknown fields', async () => {
  const bad = request(); bad.schemas[0].unknown_fields = 'ALLOW';
  await expectCode('VALIDATOR_SCHEMA_EVIDENCE_FAILED', () => gate().validate(bad));
});

test('contract cannot reference a schema that was not validated', async () => {
  const bad = request(); bad.contracts[0].schema_ids = ['missing.schema.v1'];
  await expectCode('VALIDATOR_CONTRACT_SCHEMA_MISSING', () => gate().validate(bad));
});

test('contract cannot reference a route that was not validated', async () => {
  const bad = request(); bad.contracts[0].route_ids = ['missing-route'];
  await expectCode('VALIDATOR_CONTRACT_ROUTE_MISSING', () => gate().validate(bad));
});

test('dependency evidence must be backed by successful durable receipt', async () => {
  const bad = request(); bad.dependencies[0].receipt_id = 'MISSING-RECEIPT';
  await expectCode('VALIDATOR_DEPENDENCY_RECEIPT_INVALID', () => gate().validate(bad));
});

test('changed path outside durable authority fails closed', async () => {
  const bad = request();
  bad.artifacts[0].path = 'unowned/file.js';
  bad.code_evidence[0].artifact_path = 'unowned/file.js';
  await expectCode('VALIDATOR_PATH_OUT_OF_SCOPE', () => gate().validate(bad));
});

test('artifact family cannot omit the minimum required for its kind', async () => {
  const bad = request(); bad.artifacts[1].families = ['CODE'];
  await expectCode('VALIDATOR_FAMILY_MISSING', () => gate().validate(bad));
});

test('family evidence must bind the exact artifact digest', async () => {
  const bad = request(); bad.code_evidence[0].artifact_digest = '9'.repeat(64);
  await expectCode('VALIDATOR_EVIDENCE_DIGEST_MISMATCH', () => gate().validate(bad));
});

test('orphan evidence for undeclared artifact fails closed', async () => {
  const bad = request();
  bad.code_evidence.push({ artifact_path: 'control-gateway/src/orphan.js', artifact_digest: '8'.repeat(64), syntax: 'PASS', static_analysis: 'PASS', tests: 'PASS' });
  await expectCode('VALIDATOR_ORPHAN_EVIDENCE', () => gate().validate(bad));
});

test('request must bind exact recovered operation and predecessor', async () => {
  await expectCode('VALIDATOR_OPERATION_MISMATCH', () => gate().validate(request({ operation_id: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-008' })));
});

test('durable authority movement during validation fails closed', async () => {
  const moved = publication({ head_commit_sha: 'f'.repeat(40) });
  await expectCode('VALIDATOR_AUTHORITY_MOVED', () => gate({ publications: [publication(), moved] }).validate(request()));
});
