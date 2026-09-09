'use strict';

const assert = require('assert');
const { classifyReceipt, planRepair } = require('./a01-closed-loop-repair');

const failed = '1111111111111111111111111111111111111111';
const repaired = '2222222222222222222222222222222222222222';

function base(resultClass = 'SUBJECT_FAILURE') {
  return {
    receipt_id: 'receipt-001',
    qualification_id: 'BOOK-SYSTEM-INTEGRATION-PROPOSAL-RUNTIME-002',
    workstream_id: 'BOOK-SYSTEM',
    owner_path: 'SYSTEM_MASTER/BOOK',
    failed_subject_sha: failed,
    receipt: { result_class: resultClass },
    repair_attempt: 0,
    max_repair_attempts: 1
  };
}

assert.strictEqual(classifyReceipt({ result_class: 'SUBJECT_FAILURE' }), 'REPAIRABLE_SUBJECT');
assert.strictEqual(classifyReceipt({ result_class: 'INFRA_FAILURE' }), 'RETRYABLE_INFRA');
assert.strictEqual(classifyReceipt({ result_class: 'CONTROL_PLANE_FAILURE' }), 'CONTROL_PLANE_OWNER_ROUTE');
assert.strictEqual(classifyReceipt({ result_class: 'HUMAN_ONLY' }), 'NON_AUTOMATABLE');
assert.strictEqual(classifyReceipt({ result_class: 'AUTHOR_ONLY' }), 'NON_AUTOMATABLE');
assert.strictEqual(classifyReceipt({ result_class: 'PRIVATE_DATA_REQUIRED' }), 'NON_AUTOMATABLE');
assert.strictEqual(classifyReceipt({ result_class: 'APPLE_NATIVE_REQUIRED' }), 'NON_AUTOMATABLE');
assert.strictEqual(classifyReceipt({ result_class: 'OVERNIGHT_WINDOW_EXPIRED' }), 'ADMISSION_ONLY');
assert.strictEqual(classifyReceipt({ result_class: 'PREDECESSOR_FAILURE' }), 'DEPENDENCY_ONLY');

const subjectPlan = planRepair({
  ...base(),
  replacement_subject_sha: repaired,
  repair_branch: 'repair/book-runtime-002-attempt-1',
  prequalification: {
    result: 'PASS',
    subject_sha: repaired,
    qualification_id: 'BOOK-SYSTEM-INTEGRATION-PROPOSAL-RUNTIME-002',
    workstream_id: 'BOOK-SYSTEM',
    evidence_pointer: 'evidence/prequal.json'
  }
});
assert.strictEqual(subjectPlan.route, 'REQUEUE_CHANGED_SHA');
assert.strictEqual(subjectPlan.standing, 'A01_ELIGIBLE');
assert.strictEqual(subjectPlan.replacement_request.subject_sha, repaired);
assert.strictEqual(subjectPlan.replacement_request.replacement_of_subject_sha, failed);
assert.strictEqual(subjectPlan.replacement_request.parent_receipt_id, 'receipt-001');
assert.strictEqual(subjectPlan.replacement_request.promotion_authorized, false);
assert.strictEqual(subjectPlan.authoritative_pass, false);

assert.throws(() => planRepair({
  ...base(),
  replacement_subject_sha: failed,
  prequalification: { result: 'PASS', subject_sha: failed }
}), /new exact SHA/);

assert.throws(() => planRepair({
  ...base(),
  replacement_subject_sha: repaired,
  prequalification: { result: 'FAIL', subject_sha: repaired }
}), /prequalification PASS/);

assert.throws(() => planRepair({
  ...base(),
  replacement_subject_sha: repaired,
  prequalification: { result: 'PASS', subject_sha: failed }
}), /must equal replacement subject SHA/);

assert.throws(() => planRepair({ ...base(), promotion_authorized: true }), /cannot set promotion_authorized/);
assert.throws(() => planRepair({ ...base(), result_class: 'PASS' }), /cannot emit result_class=PASS/);
assert.throws(() => planRepair({ ...base(), command: 'rm -rf /' }), /arbitrary command execution is forbidden/);

const infra = planRepair(base('INFRA_FAILURE'));
assert.strictEqual(infra.route, 'RETRY_SAME_SHA');
assert.strictEqual(infra.replacement_request.subject_sha, failed);
assert.strictEqual(infra.standing, 'A01_ELIGIBLE');

const infraExhausted = planRepair({ ...base('INFRA_FAILURE'), repair_attempt: 1, max_repair_attempts: 1 });
assert.strictEqual(infraExhausted.route, 'DEAD_LETTER');
assert.strictEqual(infraExhausted.standing, 'INFRA_RETRY_BUDGET_EXHAUSTED');

const subjectExhausted = planRepair({ ...base(), repair_attempt: 1, max_repair_attempts: 1 });
assert.strictEqual(subjectExhausted.route, 'DEAD_LETTER');
assert.strictEqual(subjectExhausted.standing, 'REPAIR_BUDGET_EXHAUSTED');

assert.strictEqual(planRepair(base('HUMAN_ONLY')).route, 'OWNER_AUTHORITY_REQUIRED');
assert.strictEqual(planRepair(base('AUTHOR_ONLY')).route, 'OWNER_AUTHORITY_REQUIRED');
assert.strictEqual(planRepair(base('OVERNIGHT_WINDOW_EXPIRED')).route, 'REPLAN_ADMISSION');
assert.strictEqual(planRepair(base('PREDECESSOR_FAILURE')).route, 'WAIT_FOR_PREDECESSOR');
assert.strictEqual(planRepair(base('CONTROL_PLANE_FAILURE')).route, 'CORE_CONTROL_PLANE_REPAIR');
assert.strictEqual(planRepair(base('SOMETHING_UNKNOWN')).route, 'DEAD_LETTER');

console.log('A01_CLOSED_LOOP_REPAIR_SELFTEST_PASS');
console.log('repair_worker_authority=ZERO');
console.log('replacement_standing=A01_ELIGIBLE_ONLY');
