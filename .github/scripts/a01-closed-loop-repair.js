'use strict';

const fs = require('fs');

const RESULT_CLASSES = new Set(['PASS', 'SUBJECT_FAILURE', 'INFRA_FAILURE', 'CONTROL_PLANE_FAILURE']);
const BLOCKER_CLASSES = new Set([
  'HUMAN_ONLY', 'AUTHOR_ONLY', 'PRIVATE_DATA', 'NATIVE_PLATFORM',
  'EXTERNAL_AUTHORITY', 'SOURCE_CUSTODY', 'UNSAFE_TO_AUTOREPAIR'
]);
const DEFAULT_MAX_ATTEMPTS = 2;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function isSha(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{40}$/.test(value);
}
function sameSha(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function exactKeys(obj, allowed, label) {
  assert(obj && typeof obj === 'object' && !Array.isArray(obj), `${label}_MUST_BE_OBJECT`);
  const unknown = Object.keys(obj).filter(k => !allowed.includes(k));
  assert(unknown.length === 0, `${label}_UNKNOWN_FIELDS:${unknown.join(',')}`);
}
function positiveInt(value, label) {
  assert(Number.isInteger(value) && value > 0, `${label}_MUST_BE_POSITIVE_INTEGER`);
  return value;
}

function validateReceipt(receipt) {
  exactKeys(receipt, [
    'receipt_version', 'policy_version', 'registry_version', 'qualification_id', 'workstream_id',
    'gate_class', 'subject_sha', 'checkout_sha', 'requested_at', 'started_at', 'completed_at',
    'queue_ms', 'execution_ms', 'result_class', 'child_exit_code', 'runner', 'evidence_artifact',
    'return_ticket', 'promotion_authorized'
  ], 'RECEIPT');
  assert(typeof receipt.qualification_id === 'string' && receipt.qualification_id.length > 0, 'RECEIPT_QUALIFICATION_REQUIRED');
  assert(typeof receipt.workstream_id === 'string' && receipt.workstream_id.length > 0, 'RECEIPT_WORKSTREAM_REQUIRED');
  assert(isSha(receipt.subject_sha), 'RECEIPT_SUBJECT_SHA_INVALID');
  assert(isSha(receipt.checkout_sha), 'RECEIPT_CHECKOUT_SHA_INVALID');
  assert(RESULT_CLASSES.has(receipt.result_class), 'RECEIPT_RESULT_CLASS_INVALID');
  if (receipt.result_class !== 'PASS') assert(receipt.promotion_authorized !== true, 'FAILED_RECEIPT_CANNOT_AUTHORIZE_PROMOTION');
  return receipt;
}

function baseState(receipt, attemptsUsed, maxAttempts, decision, reason = null) {
  return {
    version: 1,
    qualification_id: receipt.qualification_id,
    workstream_id: receipt.workstream_id,
    original_subject_sha: receipt.subject_sha,
    original_result_class: receipt.result_class,
    original_evidence_artifact: receipt.evidence_artifact || null,
    attempts_used: attemptsUsed,
    max_attempts: maxAttempts,
    decision,
    reason,
    candidate_sha: null,
    replacement_request: null,
    promotion_authorized: false,
    original_receipt_retained: true
  };
}

function classify(receiptInput, options = {}) {
  const receipt = validateReceipt(receiptInput);
  const attemptsUsed = options.attemptsUsed === undefined ? 0 : options.attemptsUsed;
  const maxAttempts = options.maxAttempts === undefined ? DEFAULT_MAX_ATTEMPTS : options.maxAttempts;
  assert(Number.isInteger(attemptsUsed) && attemptsUsed >= 0, 'ATTEMPTS_USED_INVALID');
  positiveInt(maxAttempts, 'MAX_ATTEMPTS');

  if (!sameSha(receipt.subject_sha, receipt.checkout_sha)) {
    return baseState(receipt, attemptsUsed, maxAttempts, 'ROUTE_CONTROL_PLANE', 'SUBJECT_CHECKOUT_MISMATCH');
  }
  if (receipt.result_class === 'PASS') {
    return baseState(receipt, attemptsUsed, maxAttempts, 'NO_REPAIR_PASS', 'AUTHORITATIVE_PASS_REQUIRES_NO_REPAIR');
  }
  if (receipt.result_class === 'INFRA_FAILURE') {
    return baseState(receipt, attemptsUsed, maxAttempts, 'ROUTE_INFRA', 'INFRA_FAILURE_IS_NOT_PRODUCT_REPAIR');
  }
  if (receipt.result_class === 'CONTROL_PLANE_FAILURE') {
    return baseState(receipt, attemptsUsed, maxAttempts, 'ROUTE_CONTROL_PLANE', 'CONTROL_PLANE_FAILURE_IS_NOT_PRODUCT_REPAIR');
  }
  if (attemptsUsed >= maxAttempts) {
    return baseState(receipt, attemptsUsed, maxAttempts, 'DEAD_LETTER', 'REPAIR_ATTEMPT_BUDGET_EXHAUSTED');
  }
  return baseState(receipt, attemptsUsed, maxAttempts, 'REPAIR_REQUIRED', 'SUBJECT_FAILURE_RETURNED_TO_OWNER');
}

function validateReturnTicket(ticket) {
  exactKeys(ticket, ['origin_ref', 'resume_on_pass', 'resume_on_failure', 'notification_target'], 'RETURN_TICKET');
  for (const key of ['origin_ref', 'resume_on_pass', 'resume_on_failure', 'notification_target']) {
    assert(typeof ticket[key] === 'string' && ticket[key].trim().length > 0, `RETURN_TICKET_${key.toUpperCase()}_REQUIRED`);
  }
}

function validateCandidate(candidate) {
  exactKeys(candidate, [
    'version', 'qualification_id', 'workstream_id', 'failed_subject_sha', 'candidate_sha',
    'attempt', 'repair_scope', 'blocker_class', 'repair_worker', 'prequalification', 'return_ticket'
  ], 'CANDIDATE');
  assert(candidate.version === 1, 'CANDIDATE_VERSION_INVALID');
  assert(typeof candidate.qualification_id === 'string' && candidate.qualification_id.length > 0, 'CANDIDATE_QUALIFICATION_REQUIRED');
  assert(typeof candidate.workstream_id === 'string' && candidate.workstream_id.length > 0, 'CANDIDATE_WORKSTREAM_REQUIRED');
  assert(isSha(candidate.failed_subject_sha), 'CANDIDATE_FAILED_SHA_INVALID');
  assert(isSha(candidate.candidate_sha), 'CANDIDATE_SHA_INVALID');
  positiveInt(candidate.attempt, 'CANDIDATE_ATTEMPT');
  assert(typeof candidate.repair_scope === 'string' && candidate.repair_scope.trim().length > 0 && candidate.repair_scope.length <= 2000, 'CANDIDATE_REPAIR_SCOPE_INVALID');
  if (candidate.blocker_class !== undefined && candidate.blocker_class !== null) assert(BLOCKER_CLASSES.has(candidate.blocker_class), 'CANDIDATE_BLOCKER_CLASS_INVALID');

  exactKeys(candidate.repair_worker, ['worker_id', 'changed_bytes', 'evidence_ref'], 'REPAIR_WORKER');
  assert(typeof candidate.repair_worker.worker_id === 'string' && candidate.repair_worker.worker_id.length > 0, 'REPAIR_WORKER_ID_REQUIRED');
  assert(candidate.repair_worker.changed_bytes === true, 'REPAIR_WORKER_MUST_ATTEST_CHANGED_BYTES');
  assert(typeof candidate.repair_worker.evidence_ref === 'string' && candidate.repair_worker.evidence_ref.length > 0, 'REPAIR_WORKER_EVIDENCE_REQUIRED');

  exactKeys(candidate.prequalification, ['status', 'subject_sha', 'evidence_ref'], 'PREQUALIFICATION');
  assert(['PASS', 'FAIL'].includes(candidate.prequalification.status), 'PREQUALIFICATION_STATUS_INVALID');
  assert(isSha(candidate.prequalification.subject_sha), 'PREQUALIFICATION_SHA_INVALID');
  assert(typeof candidate.prequalification.evidence_ref === 'string' && candidate.prequalification.evidence_ref.length > 0, 'PREQUALIFICATION_EVIDENCE_REQUIRED');
  validateReturnTicket(candidate.return_ticket);
  return candidate;
}

function repairWorkerContract(receiptInput, attempt = 1, maxAttempts = DEFAULT_MAX_ATTEMPTS, repairScope = 'Repair only the proven SUBJECT_FAILURE boundary.') {
  const receipt = validateReceipt(receiptInput);
  positiveInt(attempt, 'ATTEMPT');
  positiveInt(maxAttempts, 'MAX_ATTEMPTS');
  const state = classify(receipt, { attemptsUsed: attempt - 1, maxAttempts });
  assert(state.decision === 'REPAIR_REQUIRED', `REPAIR_WORKER_NOT_AUTHORIZED:${state.decision}`);
  return {
    contract_version: 1,
    qualification_id: receipt.qualification_id,
    workstream_id: receipt.workstream_id,
    failed_subject_sha: receipt.subject_sha,
    original_evidence_artifact: receipt.evidence_artifact || null,
    attempt,
    max_attempts: maxAttempts,
    repair_scope: repairScope,
    required_output: 'A01_REPAIR_CANDIDATE_V1',
    candidate_must_change_sha: true,
    deterministic_prequalification_required: true,
    arbitrary_command_input_allowed: false,
    worker_may_authorize_a01_pass: false,
    worker_may_authorize_promotion: false,
    forbidden_authority_classes: Array.from(BLOCKER_CLASSES).sort()
  };
}

function evaluateCandidate(receiptInput, candidateInput, options = {}) {
  const receipt = validateReceipt(receiptInput);
  const candidate = validateCandidate(candidateInput);
  const maxAttempts = options.maxAttempts === undefined ? DEFAULT_MAX_ATTEMPTS : options.maxAttempts;
  positiveInt(maxAttempts, 'MAX_ATTEMPTS');

  const before = classify(receipt, { attemptsUsed: candidate.attempt - 1, maxAttempts });
  if (before.decision !== 'REPAIR_REQUIRED') return before;

  assert(candidate.qualification_id === receipt.qualification_id, 'QUALIFICATION_ID_CHANGED_ACROSS_REPAIR');
  assert(candidate.workstream_id === receipt.workstream_id, 'WORKSTREAM_ID_CHANGED_ACROSS_REPAIR');
  assert(sameSha(candidate.failed_subject_sha, receipt.subject_sha), 'FAILED_SUBJECT_LINEAGE_MISMATCH');

  if (candidate.blocker_class) {
    return baseState(receipt, candidate.attempt, maxAttempts, 'OWNER_ROUTE', `BLOCKER_${candidate.blocker_class}`);
  }
  if (candidate.attempt > maxAttempts) {
    return baseState(receipt, candidate.attempt, maxAttempts, 'DEAD_LETTER', 'REPAIR_ATTEMPT_BUDGET_EXHAUSTED');
  }
  assert(!sameSha(candidate.candidate_sha, receipt.subject_sha), 'UNCHANGED_FAILED_SUBJECT_CANNOT_BE_REPLACEMENT');
  assert(candidate.prequalification.status === 'PASS', 'DETERMINISTIC_PREQUALIFICATION_NOT_PASS');
  assert(sameSha(candidate.prequalification.subject_sha, candidate.candidate_sha), 'PREQUALIFICATION_SUBJECT_MISMATCH');

  const replacementRequest = {
    request_version: 1,
    state: 'A01_ELIGIBLE',
    qualification_id: receipt.qualification_id,
    workstream_id: receipt.workstream_id,
    subject_sha: candidate.candidate_sha,
    origin_ref: candidate.return_ticket.origin_ref,
    resume_on_pass: candidate.return_ticket.resume_on_pass,
    resume_on_failure: candidate.return_ticket.resume_on_failure,
    notification_target: candidate.return_ticket.notification_target,
    repair_lineage: {
      original_subject_sha: receipt.subject_sha,
      original_result_class: receipt.result_class,
      original_evidence_artifact: receipt.evidence_artifact || null,
      repair_attempt: candidate.attempt,
      repair_worker_evidence_ref: candidate.repair_worker.evidence_ref,
      prequalification_evidence_ref: candidate.prequalification.evidence_ref
    },
    arbitrary_command_input_allowed: false,
    promotion_authorized: false
  };
  const state = baseState(receipt, candidate.attempt, maxAttempts, 'REPLACEMENT_REQUEST_READY', 'CHANGED_CANDIDATE_PREQUALIFIED');
  state.candidate_sha = candidate.candidate_sha;
  state.replacement_request = replacementRequest;
  return state;
}

function cli(argv) {
  const command = argv[2];
  if (command === 'classify') {
    const receipt = readJson(argv[3]);
    const attemptsUsed = argv[4] === undefined ? 0 : Number(argv[4]);
    const maxAttempts = argv[5] === undefined ? DEFAULT_MAX_ATTEMPTS : Number(argv[5]);
    process.stdout.write(JSON.stringify(classify(receipt, { attemptsUsed, maxAttempts }), null, 2) + '\n');
    return;
  }
  if (command === 'worker-contract') {
    const receipt = readJson(argv[3]);
    const attempt = argv[4] === undefined ? 1 : Number(argv[4]);
    const maxAttempts = argv[5] === undefined ? DEFAULT_MAX_ATTEMPTS : Number(argv[5]);
    const repairScope = argv[6] || 'Repair only the proven SUBJECT_FAILURE boundary.';
    process.stdout.write(JSON.stringify(repairWorkerContract(receipt, attempt, maxAttempts, repairScope), null, 2) + '\n');
    return;
  }
  if (command === 'evaluate') {
    const receipt = readJson(argv[3]);
    const candidate = readJson(argv[4]);
    const maxAttempts = argv[5] === undefined ? DEFAULT_MAX_ATTEMPTS : Number(argv[5]);
    process.stdout.write(JSON.stringify(evaluateCandidate(receipt, candidate, { maxAttempts }), null, 2) + '\n');
    return;
  }
  throw new Error('usage: node a01-closed-loop-repair.js classify <receipt.json> [attempts_used] [max_attempts] | worker-contract <receipt.json> [attempt] [max_attempts] [repair_scope] | evaluate <receipt.json> <candidate.json> [max_attempts]');
}

module.exports = {
  DEFAULT_MAX_ATTEMPTS,
  BLOCKER_CLASSES,
  validateReceipt,
  validateCandidate,
  classify,
  repairWorkerContract,
  evaluateCandidate
};

if (require.main === module) {
  try { cli(process.argv); }
  catch (error) { console.error(error.message); process.exit(1); }
}
