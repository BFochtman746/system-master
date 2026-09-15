'use strict';

const { openTransaction, finalizeTransaction } = require('./a01-repair-broker');

function assert(condition, message) { if (!condition) throw new Error(message); }
function expectThrow(fn, fragment) {
  let thrown = false;
  try { fn(); } catch (error) { thrown = true; if (fragment && !String(error.message).includes(fragment)) throw error; }
  assert(thrown, `expected throw containing ${fragment || '<any>'}`);
}
const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
function base(overrides = {}) {
  return { receipt_id:'receipt-001', qualification_id:'BOOK-SYSTEM-VERSION-AND-ROLLBACK-001', workstream_id:'BOOK-SYSTEM', failed_subject_sha:A, receipt:{result_class:'SUBJECT_FAILURE'}, repair_attempt:0, max_repair_attempts:1, evidence_pointer:'artifact:example', created_at:'2026-09-10T21:00:00Z', ...overrides };
}

const subject = openTransaction(base());
assert(subject.transaction.state === 'REPAIR_REQUEST_READY', 'subject failure must create repair request');
assert(subject.transaction.classification === 'REPAIRABLE_SUBJECT', 'subject failure classification must remain repairable-subject only');
assert(subject.transaction.owner_path === 'SYSTEM_MASTER/BOOK', 'Book workstream must route to Book');
assert(subject.transaction.target_inbox === 'governance/repair/BOOK-REPAIR-INBOX.json', 'Book transaction must target Book inbox');

const finalized = finalizeTransaction({ transaction: subject.transaction, candidate: { replacement_subject_sha:B, repair_branch:'book/repair-example', prequalification:{ result:'PASS', subject_sha:B, qualification_id:'BOOK-SYSTEM-VERSION-AND-ROLLBACK-001', workstream_id:'BOOK-SYSTEM', evidence_pointer:'hosted:prequal-example' } }, finalized_at:'2026-09-10T21:01:00Z' });
assert(finalized.transaction.state === 'A01_REQUEUE_READY', 'changed candidate must become A01_REQUEUE_READY');
assert(finalized.transaction.replacement_request.subject_sha === B, 'replacement must bind changed SHA');
assert(finalized.transaction.authoritative_pass === false, 'broker cannot emit authoritative pass');

const bookEvaluator = openTransaction(base({ receipt_id:'receipt-book-evaluator', workstream_id:'BOOK-EVAL-LEMONADE-001', qualification_id:'BOOK-EVAL-EXAMPLE', receipt:{result_class:'DEPENDENCY_BLOCKED'} }));
assert(bookEvaluator.transaction.state === 'WAIT_FOR_PREDECESSOR', 'dependency block must wait');
assert(bookEvaluator.transaction.owner_path === 'SYSTEM_MASTER/BOOK', 'Book evaluator workstream must remain Book-owned');
assert(bookEvaluator.transaction.target_inbox === 'governance/repair/BOOK-REPAIR-INBOX.json', 'Book evaluator repair must target Book inbox');

expectThrow(
  () => openTransaction(base({ receipt_id:'receipt-literary-retired', workstream_id:'LITERARY-PROSE', qualification_id:'LITERARY-EXAMPLE', receipt:{result_class:'SUBJECT_FAILURE'} })),
  'UNALLOCATED_WORKSTREAM:LITERARY-PROSE'
);

const documents = openTransaction(base({ receipt_id:'receipt-documents', workstream_id:'DOCUMENTS', qualification_id:'DOCUMENTS-EXAMPLE', receipt:{result_class:'SUBJECT_FAILURE'} }));
assert(documents.transaction.owner_path === 'SYSTEM_MASTER/DOCUMENTS', 'Documents workstream must remain Documents-owned');
assert(documents.transaction.target_inbox === 'governance/repair/DOCUMENTS-REPAIR-INBOX.json', 'Documents repair must target Documents inbox');

const infra = openTransaction(base({ receipt_id:'receipt-infra', workstream_id:'LEARNING', qualification_id:'LEARNING-EXAMPLE', receipt:{result_class:'INFRA_FAILURE'} }));
assert(infra.transaction.classification === 'RETRYABLE_INFRA', 'infrastructure failure must not be classified as product repair');
assert(infra.transaction.state === 'RETRY_REQUEST_READY', 'first infra failure should allow bounded same-SHA retry');
assert(infra.transaction.route === 'RETRY_SAME_SHA', 'infra failure route must remain same-SHA retry');
assert(infra.transaction.owner_path === 'SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01', 'infra retry must route to shared A01 infrastructure');
assert(infra.transaction.target_inbox === 'governance/repair/CORE-REPAIR-INBOX.json', 'shared infra route must use Core inbox');
assert(infra.transaction.replacement_request && infra.transaction.replacement_request.subject_sha === A, 'infra retry may only retain the failed exact SHA');
expectThrow(
  () => finalizeTransaction({ transaction:infra.transaction, candidate:{ replacement_subject_sha:B, prequalification:{result:'PASS',subject_sha:B} } }),
  'transaction state not eligible for product repair finalization'
);

const human = openTransaction(base({ receipt_id:'receipt-human', workstream_id:'LEARNING', qualification_id:'LEARNING-HUMAN', receipt:{result_class:'HUMAN_ONLY'} }));
assert(human.transaction.owner_path === 'SYSTEM_MASTER/LEARNING', 'human boundary remains with product owner');

const control = openTransaction(base({ receipt_id:'receipt-control', workstream_id:'SYSTEM-MASTER', qualification_id:'A01-CONTROL-EXAMPLE', receipt:{result_class:'CONTROL_PLANE_FAILURE'} }));
assert(control.transaction.classification === 'CONTROL_PLANE_OWNER_ROUTE', 'control-plane failure must retain control-plane classification');
assert(control.transaction.owner_path === 'SYSTEM_MASTER/CORE', 'control-plane failure must route to Core');
assert(control.transaction.state === 'OWNER_ACTION_REQUIRED', 'control-plane failure must require Core owner action');
assert(control.transaction.route === 'CORE_CONTROL_PLANE_REPAIR', 'control-plane failure must never route to product repair');
assert(!control.transaction.replacement_request, 'control-plane failure must not emit a replacement subject request');
expectThrow(
  () => finalizeTransaction({ transaction:control.transaction, candidate:{ replacement_subject_sha:B, prequalification:{result:'PASS',subject_sha:B} } }),
  'transaction state not eligible for product repair finalization'
);

expectThrow(() => openTransaction(base({ workstream_id:'UNMAPPED-WORKSTREAM' })), 'UNALLOCATED_WORKSTREAM');
expectThrow(() => finalizeTransaction({ transaction:subject.transaction, candidate:{ replacement_subject_sha:A, prequalification:{result:'PASS',subject_sha:A} } }), 'new exact SHA');
expectThrow(() => finalizeTransaction({ transaction:subject.transaction, candidate:{ replacement_subject_sha:B, prequalification:{result:'FAIL',subject_sha:B} } }), 'prequalification PASS');

console.log('A01_REPAIR_BROKER_SELFTEST_PASS');
console.log('subject_failure_route=CHANGED_SHA_PRODUCT_REPAIR_ONLY');
console.log('infra_failure_route=BOUNDED_SAME_SHA_SHARED_INFRA_ONLY');
console.log('control_plane_failure_route=CORE_OWNER_ACTION_ONLY');
console.log('active_product_repair_routes=CORE,LEARNING,BOOK,DOCUMENTS');
console.log('book_evaluator_repair_route=BOOK');
console.log('retired_literary_prose_repair_route=REJECTED_NO_DISPATCH');
console.log('documents_repair_route=DOCUMENTS_ONLY');
console.log('replacement_standing=A01_ELIGIBLE_ONLY');