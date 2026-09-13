'use strict';

const fs = require('fs');
const path = require('path');
const { openTransaction, finalizeTransaction } = require('./a01-repair-broker');

const root = path.resolve(__dirname, '..', '..');
function assert(condition, message) { if (!condition) throw new Error(message); }
function expectThrow(fn, fragment) {
  let thrown = false;
  try { fn(); } catch (error) { thrown = true; if (fragment && !String(error.message).includes(fragment)) throw error; }
  assert(thrown, `expected throw containing ${fragment || '<any>'}`);
}
function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8').replace(/^\uFEFF/, '')); }
function setEq(a, b) {
  const aa = [...a].sort(), bb = [...b].sort();
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}
const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
function base(overrides = {}) {
  return { receipt_id:'receipt-001', qualification_id:'BOOK-SYSTEM-VERSION-AND-ROLLBACK-001', workstream_id:'BOOK-SYSTEM', failed_subject_sha:A, receipt:{result_class:'SUBJECT_FAILURE'}, repair_attempt:0, max_repair_attempts:1, evidence_pointer:'artifact:example', created_at:'2026-09-10T21:00:00Z', ...overrides };
}

const authority = readJson('governance/CURRENT-AUTHORITY.json');
const topology = readJson(authority.topology);
const registry = readJson(authority.repair_inbox_registry);
const schema = readJson(registry.schema);
const executionReady = new Set(topology.execution_readiness?.execution_ready_peer_system_ids || topology.peer_system_ids || []);
const repairOwners = new Set(Object.keys(registry.owner_files || {}));
assert(registry.topology === authority.topology, 'repair registry must bind CURRENT-AUTHORITY topology');
assert(registry.system_completion_status === authority.system_completion_status, 'repair registry completion-status pointer must match CURRENT-AUTHORITY');
assert(setEq(repairOwners, executionReady), `repair owner set must equal execution-ready peers: ${[...executionReady].join(',')}`);
for (const id of executionReady) {
  const rel = registry.owner_files[id];
  assert(rel && fs.existsSync(path.join(root, rel)), `repair inbox missing for execution-ready peer ${id}`);
  const inbox = readJson(rel);
  assert(inbox.owner_system_id === id, `repair inbox owner mismatch for ${id}`);
  assert(inbox.owner_path === `SYSTEM_MASTER/${id}`, `repair inbox owner path mismatch for ${id}`);
}
const schemaOwners = new Set(schema.properties?.owner_system_id?.enum || []);
for (const id of executionReady) assert(schemaOwners.has(id), `repair inbox schema omits active owner ${id}`);
assert(schemaOwners.has('PROSE'), 'repair inbox schema must preserve PROSE historical-inbox readability');

const routeCases = [
  ['CORE', 'SYSTEM-MASTER', 'SYSTEM_MASTER/CORE', 'governance/repair/CORE-REPAIR-INBOX.json'],
  ['LEARNING', 'LEARNING', 'SYSTEM_MASTER/LEARNING', 'governance/repair/LEARNING-REPAIR-INBOX.json'],
  ['BOOK', 'BOOK-SYSTEM', 'SYSTEM_MASTER/BOOK', 'governance/repair/BOOK-REPAIR-INBOX.json'],
  ['DOCUMENTS', 'DOCUMENTS', 'SYSTEM_MASTER/DOCUMENTS', 'governance/repair/DOCUMENTS-REPAIR-INBOX.json'],
  ['SPREADSHEET_DATA', 'SPREADSHEET_DATA', 'SYSTEM_MASTER/SPREADSHEET_DATA', 'governance/repair/SPREADSHEET_DATA-REPAIR-INBOX.json'],
  ['MEDIA', 'MEDIA', 'SYSTEM_MASTER/MEDIA', 'governance/repair/MEDIA-REPAIR-INBOX.json'],
  ['CONNECTED_ACTIONS', 'CONNECTED_ACTIONS', 'SYSTEM_MASTER/CONNECTED_ACTIONS', 'governance/repair/CONNECTED_ACTIONS-REPAIR-INBOX.json'],
  ['RESEARCH_KNOWLEDGE', 'RESEARCH_KNOWLEDGE', 'SYSTEM_MASTER/RESEARCH_KNOWLEDGE', 'governance/repair/RESEARCH_KNOWLEDGE-REPAIR-INBOX.json'],
  ['PROGRAMMING', 'PROGRAMMING', 'SYSTEM_MASTER/PROGRAMMING', 'governance/repair/PROGRAMMING-REPAIR-INBOX.json']
];
assert(routeCases.length === executionReady.size, 'repair routing selftest must exercise every execution-ready peer');
for (const [systemId, workstreamId, ownerPath, inboxPath] of routeCases) {
  const tx = openTransaction(base({ receipt_id:`receipt-${systemId.toLowerCase()}`, qualification_id:`${systemId}-REPAIR-SELFTEST`, workstream_id:workstreamId }));
  assert(tx.transaction.state === 'REPAIR_REQUEST_READY', `${systemId} subject failure must create repair request`);
  assert(tx.transaction.owner_path === ownerPath, `${systemId} workstream must route to ${ownerPath}`);
  assert(tx.transaction.target_inbox === inboxPath, `${systemId} repair must target its registered owner inbox`);
}

const subject = openTransaction(base());
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
console.log(`active_product_repair_routes=${[...executionReady].join(',')}`);
console.log('programming_repair_route=PROGRAMMING');
console.log('book_evaluator_repair_route=BOOK');
console.log('retired_literary_prose_repair_route=REJECTED_NO_DISPATCH');
console.log('replacement_standing=A01_ELIGIBLE_ONLY');
