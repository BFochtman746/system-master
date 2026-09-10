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
assert(subject.transaction.owner_path === 'SYSTEM_MASTER/BOOK', 'Book workstream must route to Book');
assert(subject.transaction.target_inbox === 'governance/repair/BOOK-REPAIR-INBOX.json', 'Book transaction must target Book inbox');

const finalized = finalizeTransaction({ transaction: subject.transaction, candidate: { replacement_subject_sha:B, repair_branch:'book/repair-example', prequalification:{ result:'PASS', subject_sha:B, qualification_id:'BOOK-SYSTEM-VERSION-AND-ROLLBACK-001', workstream_id:'BOOK-SYSTEM', evidence_pointer:'hosted:prequal-example' } }, finalized_at:'2026-09-10T21:01:00Z' });
assert(finalized.transaction.state === 'A01_REQUEUE_READY', 'changed candidate must become A01_REQUEUE_READY');
assert(finalized.transaction.replacement_request.subject_sha === B, 'replacement must bind changed SHA');
assert(finalized.transaction.authoritative_pass === false, 'broker cannot emit authoritative pass');

const proseSuccessor = openTransaction(base({ receipt_id:'receipt-prose-successor', workstream_id:'BOOK-EVAL-LEMONADE-001', qualification_id:'BOOK-EVAL-EXAMPLE', receipt:{result_class:'DEPENDENCY_BLOCKED'} }));
assert(proseSuccessor.transaction.state === 'WAIT_FOR_PREDECESSOR', 'dependency block must wait');
assert(proseSuccessor.transaction.owner_path === 'SYSTEM_MASTER/DOCUMENTS', 'retired Prose-family workstream must route to Documents');
assert(proseSuccessor.transaction.target_inbox === 'governance/repair/DOCUMENTS-REPAIR-INBOX.json', 'retired Prose-family repair must target Documents inbox');

const literary = openTransaction(base({ receipt_id:'receipt-literary', workstream_id:'LITERARY-PROSE', qualification_id:'LITERARY-EXAMPLE', receipt:{result_class:'SUBJECT_FAILURE'} }));
assert(literary.transaction.owner_path === 'SYSTEM_MASTER/DOCUMENTS', 'LITERARY-PROSE must route to Documents after Prose retirement');
assert(literary.transaction.target_inbox === 'governance/repair/DOCUMENTS-REPAIR-INBOX.json', 'LITERARY-PROSE repair must target Documents');

const infra = openTransaction(base({ receipt_id:'receipt-infra', workstream_id:'LEARNING', qualification_id:'LEARNING-EXAMPLE', receipt:{result_class:'INFRA_FAILURE'} }));
assert(infra.transaction.state === 'RETRY_REQUEST_READY', 'first infra failure should allow bounded same-SHA retry');
assert(infra.transaction.owner_path === 'SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01', 'infra retry must route to shared A01 infrastructure');
assert(infra.transaction.target_inbox === 'governance/repair/CORE-REPAIR-INBOX.json', 'shared infra route must use Core inbox');

const human = openTransaction(base({ receipt_id:'receipt-human', workstream_id:'LEARNING', qualification_id:'LEARNING-HUMAN', receipt:{result_class:'HUMAN_ONLY'} }));
assert(human.transaction.owner_path === 'SYSTEM_MASTER/LEARNING', 'human boundary remains with product owner');

const control = openTransaction(base({ receipt_id:'receipt-control', workstream_id:'SYSTEM-MASTER', qualification_id:'A01-CONTROL-EXAMPLE', receipt:{result_class:'CONTROL_PLANE_FAILURE'} }));
assert(control.transaction.owner_path === 'SYSTEM_MASTER/CORE', 'control-plane failure must route to Core');

expectThrow(() => openTransaction(base({ workstream_id:'UNMAPPED-WORKSTREAM' })), 'UNALLOCATED_WORKSTREAM');
expectThrow(() => finalizeTransaction({ transaction:subject.transaction, candidate:{ replacement_subject_sha:A, prequalification:{result:'PASS',subject_sha:A} } }), 'new exact SHA');
expectThrow(() => finalizeTransaction({ transaction:subject.transaction, candidate:{ replacement_subject_sha:B, prequalification:{result:'FAIL',subject_sha:B} } }), 'prequalification PASS');

console.log('A01_REPAIR_BROKER_SELFTEST_PASS');
console.log('active_product_repair_routes=CORE,LEARNING,BOOK,DOCUMENTS');
console.log('retired_prose_successor=DOCUMENTS');
console.log('replacement_standing=A01_ELIGIBLE_ONLY');
