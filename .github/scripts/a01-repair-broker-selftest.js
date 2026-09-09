'use strict';

const { openTransaction, finalizeTransaction } = require('./a01-repair-broker');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectThrow(fn, fragment) {
  let thrown = false;
  try { fn(); }
  catch (error) {
    thrown = true;
    if (fragment && !String(error.message).includes(fragment)) throw error;
  }
  assert(thrown, `expected throw containing ${fragment || '<any>'}`);
}

const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function base(overrides = {}) {
  return {
    receipt_id: 'receipt-001',
    qualification_id: 'BOOK-SYSTEM-VERSION-AND-ROLLBACK-001',
    workstream_id: 'BOOK-SYSTEM',
    failed_subject_sha: A,
    receipt: { result_class: 'SUBJECT_FAILURE' },
    repair_attempt: 0,
    max_repair_attempts: 1,
    evidence_pointer: 'artifact:example',
    created_at: '2026-09-09T23:40:00Z',
    ...overrides
  };
}

const subject = openTransaction(base());
assert(subject.transaction.state === 'REPAIR_REQUEST_READY', 'subject failure must create repair request');
assert(subject.transaction.owner_path === 'SYSTEM_MASTER/BOOK', 'Book workstream must route to Book');
assert(subject.transaction.target_inbox === 'governance/repair/BOOK-REPAIR-INBOX.json', 'Book transaction must target Book inbox');
assert(subject.transaction.promotion_authorized === false, 'broker cannot authorize promotion');

const finalized = finalizeTransaction({
  transaction: subject.transaction,
  candidate: {
    replacement_subject_sha: B,
    repair_branch: 'book/repair-example',
    prequalification: {
      result: 'PASS',
      subject_sha: B,
      qualification_id: 'BOOK-SYSTEM-VERSION-AND-ROLLBACK-001',
      workstream_id: 'BOOK-SYSTEM',
      evidence_pointer: 'hosted:prequal-example'
    }
  },
  finalized_at: '2026-09-09T23:41:00Z'
});
assert(finalized.transaction.state === 'A01_REQUEUE_READY', 'prequalified changed candidate must become A01_REQUEUE_READY');
assert(finalized.transaction.replacement_request.subject_sha === B, 'replacement request must bind changed SHA');
assert(finalized.transaction.replacement_request.parent_receipt_id === 'receipt-001', 'replacement must retain parent receipt');
assert(finalized.transaction.authoritative_pass === false, 'broker cannot emit authoritative pass');

const infra = openTransaction(base({
  receipt_id: 'receipt-infra',
  workstream_id: 'LEARNING',
  qualification_id: 'LEARNING-EXAMPLE',
  receipt: { result_class: 'INFRA_FAILURE' }
}));
assert(infra.transaction.state === 'RETRY_REQUEST_READY', 'first infra failure should allow bounded same-SHA retry');
assert(infra.transaction.owner_path === 'SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01', 'infra retry must route to shared A01 infrastructure');
assert(infra.transaction.target_inbox === 'governance/repair/CORE-REPAIR-INBOX.json', 'shared infra route must use Core administrative inbox');
assert(infra.transaction.replacement_request.subject_sha === A, 'infra retry must preserve same SHA');

const stale = openTransaction(base({
  receipt_id: 'receipt-stale',
  receipt: { result_class: 'STALE_DELEGATION' }
}));
assert(stale.transaction.state === 'REPLAN_ADMISSION', 'stale delegation must replan admission');
assert(stale.transaction.classification === 'ADMISSION_ONLY', 'stale delegation must not become subject failure');

const human = openTransaction(base({
  receipt_id: 'receipt-human',
  workstream_id: 'LEARNING',
  qualification_id: 'LEARNING-HUMAN',
  receipt: { result_class: 'HUMAN_ONLY' }
}));
assert(human.transaction.state === 'OWNER_AUTHORITY_REQUIRED', 'human-only boundary must not auto-repair');
assert(human.transaction.owner_path === 'SYSTEM_MASTER/LEARNING', 'human boundary remains with product owner');

const dependency = openTransaction(base({
  receipt_id: 'receipt-dep',
  workstream_id: 'BOOK-EVAL-LEMONADE-001',
  qualification_id: 'BOOK-EVAL-EXAMPLE',
  receipt: { result_class: 'DEPENDENCY_BLOCKED' }
}));
assert(dependency.transaction.state === 'WAIT_FOR_PREDECESSOR', 'dependency block must wait');
assert(dependency.transaction.owner_path === 'SYSTEM_MASTER/BOOK/PROSE', 'Book Eval must remain Prose-owned');

const control = openTransaction(base({
  receipt_id: 'receipt-control',
  workstream_id: 'SYSTEM-MASTER',
  qualification_id: 'A01-CONTROL-EXAMPLE',
  receipt: { result_class: 'CONTROL_PLANE_FAILURE' }
}));
assert(control.transaction.state === 'OWNER_ACTION_REQUIRED', 'control-plane failure must route to owner action');
assert(control.transaction.owner_path === 'SYSTEM_MASTER/CORE', 'control-plane failure must route to Core');

const passed = openTransaction(base({
  receipt_id: 'receipt-pass',
  receipt: { result_class: 'PASS' }
}));
assert(passed.transaction.state === 'NO_ACTION', 'PASS must not create repair work');

const exhausted = openTransaction(base({
  receipt_id: 'receipt-exhausted',
  repair_attempt: 1,
  max_repair_attempts: 1
}));
assert(exhausted.transaction.state === 'DEAD_LETTER', 'exhausted subject repair budget must dead-letter');

expectThrow(() => openTransaction(base({ workstream_id: 'UNMAPPED-WORKSTREAM' })), 'UNALLOCATED_WORKSTREAM');
expectThrow(() => finalizeTransaction({
  transaction: subject.transaction,
  candidate: {
    replacement_subject_sha: A,
    prequalification: { result: 'PASS', subject_sha: A }
  }
}), 'new exact SHA');
expectThrow(() => finalizeTransaction({
  transaction: subject.transaction,
  candidate: {
    replacement_subject_sha: B,
    prequalification: { result: 'FAIL', subject_sha: B }
  }
}), 'prequalification PASS');

console.log('A01_REPAIR_BROKER_SELFTEST_PASS');
console.log('product_repair_route=OWNER_LANE');
console.log('replacement_standing=A01_ELIGIBLE_ONLY');
console.log('nonrepairable_routes=FAIL_CLOSED');
