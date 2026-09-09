'use strict';

const fs = require('fs');
const path = require('path');
const {
  classify,
  repairWorkerContract,
  evaluateCandidate
} = require('./a01-closed-loop-repair.js');

function assert(condition, message) { if (!condition) throw new Error(message); }
function expectThrows(fn, pattern, label) {
  let caught = null;
  try { fn(); } catch (error) { caught = error; }
  assert(caught, `${label}: expected throw`);
  assert(pattern.test(caught.message), `${label}: unexpected error ${caught.message}`);
}

const FAILED_SHA = '1111111111111111111111111111111111111111';
const CANDIDATE_SHA = '2222222222222222222222222222222222222222';
const OTHER_SHA = '3333333333333333333333333333333333333333';

function receipt(resultClass = 'SUBJECT_FAILURE', overrides = {}) {
  return {
    receipt_version: 1,
    policy_version: 6,
    registry_version: 18,
    qualification_id: 'TEST-QUALIFICATION',
    workstream_id: 'TEST-WORKSTREAM',
    gate_class: 'focused',
    subject_sha: FAILED_SHA,
    checkout_sha: FAILED_SHA,
    requested_at: '2026-09-09T00:00:00Z',
    started_at: '2026-09-09T00:00:01Z',
    completed_at: '2026-09-09T00:00:02Z',
    queue_ms: 1000,
    execution_ms: 1000,
    result_class: resultClass,
    child_exit_code: resultClass === 'PASS' ? 0 : 1,
    runner: { name: 'A-01', os: 'Windows', arch: 'X64' },
    evidence_artifact: 'TEST-EVIDENCE',
    return_ticket: {
      workstream_id: 'TEST-WORKSTREAM',
      qualification_id: 'TEST-QUALIFICATION',
      subject_sha: FAILED_SHA,
      origin_ref: 'refs/heads/test',
      resume_on_pass: 'continue',
      resume_on_failure: 'repair',
      notification_target: 'test'
    },
    promotion_authorized: resultClass === 'PASS',
    ...overrides
  };
}

function candidate(overrides = {}) {
  return {
    version: 1,
    qualification_id: 'TEST-QUALIFICATION',
    workstream_id: 'TEST-WORKSTREAM',
    failed_subject_sha: FAILED_SHA,
    candidate_sha: CANDIDATE_SHA,
    attempt: 1,
    repair_scope: 'Repair only the demonstrated test boundary.',
    blocker_class: null,
    repair_worker: {
      worker_id: 'TEST-REPAIR-WORKER',
      changed_bytes: true,
      evidence_ref: 'evidence/repair-worker.json'
    },
    prequalification: {
      status: 'PASS',
      subject_sha: CANDIDATE_SHA,
      evidence_ref: 'evidence/prequalification.json'
    },
    return_ticket: {
      origin_ref: 'refs/heads/test-repair',
      resume_on_pass: 'adjudicate new PASS',
      resume_on_failure: 'repair only new failing boundary',
      notification_target: 'test-workstream'
    },
    ...overrides
  };
}

let checks = 0;
function check(condition, message) { assert(condition, message); checks += 1; }

const pass = classify(receipt('PASS'));
check(pass.decision === 'NO_REPAIR_PASS', 'PASS must not enter repair');
check(pass.promotion_authorized === false, 'coordinator must never synthesize promotion');

const subjectFailure = classify(receipt('SUBJECT_FAILURE'));
check(subjectFailure.decision === 'REPAIR_REQUIRED', 'subject failure should enter repair');
check(subjectFailure.attempts_used === 0 && subjectFailure.max_attempts === 2, 'default repair budget');

const infra = classify(receipt('INFRA_FAILURE'));
check(infra.decision === 'ROUTE_INFRA', 'infra failure must not product-repair');
const control = classify(receipt('CONTROL_PLANE_FAILURE'));
check(control.decision === 'ROUTE_CONTROL_PLANE', 'control-plane failure must not product-repair');

const mismatch = classify(receipt('SUBJECT_FAILURE', { checkout_sha: OTHER_SHA }));
check(mismatch.decision === 'ROUTE_CONTROL_PLANE', 'checkout mismatch must not product-repair');

const exhausted = classify(receipt('SUBJECT_FAILURE'), { attemptsUsed: 2, maxAttempts: 2 });
check(exhausted.decision === 'DEAD_LETTER', 'attempt budget exhaustion must dead-letter');

const workerContract = repairWorkerContract(receipt('SUBJECT_FAILURE'), 1, 2, 'Repair focused test boundary.');
check(workerContract.candidate_must_change_sha === true, 'worker must change SHA');
check(workerContract.deterministic_prequalification_required === true, 'prequalification required');
check(workerContract.arbitrary_command_input_allowed === false, 'arbitrary commands forbidden');
check(workerContract.worker_may_authorize_a01_pass === false && workerContract.worker_may_authorize_promotion === false, 'worker has zero PASS/promotion authority');
check(workerContract.forbidden_authority_classes.includes('PRIVATE_DATA') && workerContract.forbidden_authority_classes.includes('SOURCE_CUSTODY'), 'non-automatable blockers present');

const valid = evaluateCandidate(receipt('SUBJECT_FAILURE'), candidate());
check(valid.decision === 'REPLACEMENT_REQUEST_READY', 'valid changed candidate should become replacement-ready');
check(valid.candidate_sha === CANDIDATE_SHA, 'replacement must bind candidate SHA');
check(valid.replacement_request.subject_sha === CANDIDATE_SHA, 'replacement request exact SHA');
check(valid.replacement_request.state === 'A01_ELIGIBLE', 'replacement is eligible, not passed');
check(valid.replacement_request.promotion_authorized === false, 'replacement cannot synthesize promotion');
check(valid.replacement_request.arbitrary_command_input_allowed === false, 'replacement cannot inject command');
check(valid.replacement_request.repair_lineage.original_subject_sha === FAILED_SHA, 'original receipt lineage preserved');
check(valid.replacement_request.repair_lineage.original_evidence_artifact === 'TEST-EVIDENCE', 'original evidence lineage preserved');

expectThrows(
  () => evaluateCandidate(receipt('SUBJECT_FAILURE'), candidate({ candidate_sha: FAILED_SHA, prequalification: { status: 'PASS', subject_sha: FAILED_SHA, evidence_ref: 'same' } })),
  /UNCHANGED_FAILED_SUBJECT/,
  'unchanged SHA'
); checks += 1;

expectThrows(
  () => evaluateCandidate(receipt('SUBJECT_FAILURE'), candidate({ prequalification: { status: 'PASS', subject_sha: OTHER_SHA, evidence_ref: 'wrong' } })),
  /PREQUALIFICATION_SUBJECT_MISMATCH/,
  'prequalification SHA mismatch'
); checks += 1;

expectThrows(
  () => evaluateCandidate(receipt('SUBJECT_FAILURE'), candidate({ prequalification: { status: 'FAIL', subject_sha: CANDIDATE_SHA, evidence_ref: 'failed' } })),
  /DETERMINISTIC_PREQUALIFICATION_NOT_PASS/,
  'failed prequalification'
); checks += 1;

expectThrows(
  () => evaluateCandidate(receipt('SUBJECT_FAILURE'), candidate({ qualification_id: 'CHANGED-QUAL' })),
  /QUALIFICATION_ID_CHANGED/,
  'qualification identity change'
); checks += 1;

expectThrows(
  () => evaluateCandidate(receipt('SUBJECT_FAILURE'), candidate({ workstream_id: 'CHANGED-WORKSTREAM' })),
  /WORKSTREAM_ID_CHANGED/,
  'workstream identity change'
); checks += 1;

const blocked = evaluateCandidate(receipt('SUBJECT_FAILURE'), candidate({ blocker_class: 'HUMAN_ONLY' }));
check(blocked.decision === 'OWNER_ROUTE' && blocked.reason === 'BLOCKER_HUMAN_ONLY', 'human blocker must owner-route');
check(blocked.replacement_request === null, 'blocked candidate must not create replacement');

const sourceBlocked = evaluateCandidate(receipt('SUBJECT_FAILURE'), candidate({ blocker_class: 'SOURCE_CUSTODY' }));
check(sourceBlocked.decision === 'OWNER_ROUTE', 'source custody blocker must owner-route');

const attemptTwo = evaluateCandidate(receipt('SUBJECT_FAILURE'), candidate({ attempt: 2 }), { maxAttempts: 2 });
check(attemptTwo.decision === 'REPLACEMENT_REQUEST_READY' && attemptTwo.attempts_used === 2, 'last allowed attempt may proceed');

const attemptThreeCandidate = candidate({ attempt: 3 });
const attemptThree = evaluateCandidate(receipt('SUBJECT_FAILURE'), attemptThreeCandidate, { maxAttempts: 2 });
check(attemptThree.decision === 'DEAD_LETTER', 'attempt over budget must dead-letter');

expectThrows(
  () => evaluateCandidate(receipt('SUBJECT_FAILURE'), { ...candidate(), command: 'rm -rf /' }),
  /CANDIDATE_UNKNOWN_FIELDS:command/,
  'arbitrary command field'
); checks += 1;

expectThrows(
  () => repairWorkerContract(receipt('INFRA_FAILURE')),
  /REPAIR_WORKER_NOT_AUTHORIZED:ROUTE_INFRA/,
  'infra repair worker denied'
); checks += 1;

expectThrows(
  () => repairWorkerContract(receipt('CONTROL_PLANE_FAILURE')),
  /REPAIR_WORKER_NOT_AUTHORIZED:ROUTE_CONTROL_PLANE/,
  'control repair worker denied'
); checks += 1;

const root = path.resolve(__dirname, '..', '..');
const gateway = fs.readFileSync(path.join(root, '.github/workflows/a01-control-plane-gateway.yml'), 'utf8');
check(gateway.includes('group: a01-global-r2'), 'gateway concurrency generation preserved');
check(!gateway.includes('a01-closed-loop-repair.js'), 'candidate must remain sidecar; gateway unchanged');

const contract = fs.readFileSync(path.join(root, 'qualification/a01/repair/A01-CLOSED-LOOP-REPAIR-001.md'), 'utf8');
check(contract.includes('Only an authoritative `SUBJECT_FAILURE` is eligible for product repair.'), 'contract subject-failure fence');
check(contract.includes('worker may prepare changed bytes but cannot authorize A-01 PASS'), 'contract worker authority fence');

const schema = JSON.parse(fs.readFileSync(path.join(root, 'qualification/a01/repair/repair-candidate.schema.json'), 'utf8'));
check(schema.additionalProperties === false, 'candidate schema fail-closed on extra fields');
check(schema.properties.candidate_sha.pattern === '^[0-9a-fA-F]{40}$', 'candidate schema exact SHA shape');

const evidenceDir = process.env.A01_EVIDENCE_DIR;
if (evidenceDir) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, 'a01-closed-loop-repair-selftest.txt'), `A01_CLOSED_LOOP_REPAIR_SELFTEST=PASS\nCHECKS=${checks}\n`);
}
console.log(`A01_CLOSED_LOOP_REPAIR_SELFTEST=PASS checks=${checks}`);
