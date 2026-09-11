'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');

function fail(message) {
  console.error(`PROGRAM_JOB_LOCK_ENFORCEMENT_FAIL: ${message}`);
  process.exit(1);
}
function readJson(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) fail(`missing ${rel}`);
  try { return JSON.parse(fs.readFileSync(abs, 'utf8')); }
  catch (error) { fail(`invalid JSON ${rel}: ${error.message}`); }
}
function readText(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) fail(`missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}
function assert(condition, message) { if (!condition) fail(message); }
function setEq(actual, expected) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  return a.length === e.length && a.every((v, i) => v === e[i]);
}

const authority = readJson('governance/CURRENT-AUTHORITY.json');
assert(authority.program_job_lock === 'governance/SYSTEM-PROGRAM-JOB-LOCK-001.json', 'CURRENT-AUTHORITY must select SYSTEM-PROGRAM-JOB-LOCK-001');
assert(authority.system_completion_status === 'governance/SYSTEM-COMPLETION-STATUS-001.json', 'CURRENT-AUTHORITY must select SYSTEM-COMPLETION-STATUS-001');
assert(authority.completion_ledger === 'governance/COMPLETION-LEDGER-002.json', 'CURRENT-AUTHORITY must select current completion ledger 002');
assert(authority.prior_completion_ledger === 'governance/COMPLETION-LEDGER-001.json', 'CURRENT-AUTHORITY must preserve prior completion ledger 001');
assert(authority.obligation_registry === 'governance/WORK-OBLIGATION-REGISTRY-008.json', 'CURRENT-AUTHORITY must select obligation registry 008');
assert(authority.expectation_registry === 'governance/EXPECTATION-REGISTRY-004.json', 'CURRENT-AUTHORITY must select expectation registry 004');
assert(authority.central_next_objective === 'SYSTEM-MASTER-INTEGRATION-COORDINATION-001', 'System Master integration coordination must be central objective');

const topology = readJson(authority.topology);
assert(topology.topology_id === 'SYSTEM-TOPOLOGY-004', `unexpected topology ${topology.topology_id}`);
assert(setEq(new Set(topology.peer_system_ids || []), new Set(['CORE','LEARNING','BOOK','DOCUMENTS'])), 'peer systems must be CORE, LEARNING, BOOK, DOCUMENTS');
const proseTopology = (topology.canonical_internal_systems || []).find((s) => s.system_id === 'PROSE');
assert(proseTopology && proseTopology.parent_id === 'BOOK' && proseTopology.owner_path === 'SYSTEM_MASTER/BOOK/PROSE', 'PROSE must be active Book child');
assert(topology.execution_lane_owner_map?.['LITERARY-PROSE'] === 'BOOK', 'LITERARY-PROSE must execute through BOOK');
assert(topology.execution_lane_owner_map?.['BOOK-EVAL-LEMONADE-001'] === 'BOOK', 'Book evaluator must execute through BOOK');

const completion = readJson(authority.system_completion_status);
const statuses = new Map((completion.systems || []).map((s) => [s.system_id, s]));
for (const id of ['SYSTEM_MASTER','CORE','LEARNING','BOOK','PROSE','DOCUMENTS']) assert(statuses.has(id), `missing completion status ${id}`);
assert(statuses.get('PROSE').complete === true, 'PROSE must be complete');
for (const id of ['SYSTEM_MASTER','CORE','LEARNING','BOOK','DOCUMENTS']) assert(statuses.get(id).complete === false, `${id} must remain incomplete`);
assert((completion.systems || []).filter((s) => s.complete === true).map((s) => s.system_id).join(',') === 'PROSE', 'PROSE must be the only complete system');

const completionLedger = readJson(authority.completion_ledger);
assert(completionLedger.topology === authority.topology, 'current completion ledger must bind current topology');
assert(completionLedger.system_completion_status === authority.system_completion_status, 'current completion ledger must bind current system completion status');
assert(completionLedger.historical_boundary_ledger === authority.prior_completion_ledger, 'current completion ledger must preserve historical boundary ledger');
const ledgerStatuses = new Map((completionLedger.system_completion_entries || []).map((s) => [s.system_id, s]));
for (const id of ['SYSTEM_MASTER','CORE','LEARNING','BOOK','PROSE','DOCUMENTS']) assert(ledgerStatuses.has(id), `current completion ledger missing ${id}`);
assert(ledgerStatuses.get('PROSE').complete === true, 'current completion ledger must mark PROSE complete');
for (const id of ['SYSTEM_MASTER','CORE','LEARNING','BOOK','DOCUMENTS']) assert(ledgerStatuses.get(id).complete === false, `current completion ledger must keep ${id} incomplete`);

const lock = readJson(authority.program_job_lock);
assert(lock.programs?.BOOK?.authorized_child === 'SYSTEM_MASTER/BOOK/PROSE', 'BOOK job must authorize PROSE child');
assert(lock.programs?.PROSE?.completion === 'COMPLETE', 'PROSE job must remain complete');
assert(lock.programs?.PROSE?.execution_lane === 'BOOK', 'PROSE must execute in BOOK lane');
assert(lock.programs?.DOCUMENTS?.integrates_upward_to === 'SYSTEM_MASTER', 'DOCUMENTS must integrate upward to System Master');
assert(lock.programs?.LEARNING?.integrates_upward_to === 'SYSTEM_MASTER', 'LEARNING must integrate upward to System Master');
assert(lock.programs?.BOOK?.integrates_upward_to === 'SYSTEM_MASTER', 'BOOK must integrate upward to System Master');
assert(lock.lane_crossing_policy?.direct_specialist_exception?.includes('BOOK <-> PROSE'), 'Book-Prose must be the sole direct specialist exception');

const obligations = readJson(authority.obligation_registry);
assert(obligations.central_next_objective === authority.central_next_objective, 'obligation central objective mismatch');
const byId = new Map((obligations.obligations || []).map((o) => [o.obligation_id, o]));
const central = byId.get('SYSTEM-MASTER-INTEGRATION-COORDINATION-001');
assert(central && central.owner_path === 'SYSTEM_MASTER/CORE' && ['READY','ACTIVE'].includes(central.state), 'central integration obligation must be active under CORE administration');
const knowledge = byId.get('SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001');
assert(knowledge && knowledge.owner_path === 'SYSTEM_MASTER/CORE', 'Knowledge Recovery must remain CORE-administered');
assert(knowledge.priority !== 'CENTRAL_NEXT_OBJECTIVE', 'Knowledge Recovery must not regain central priority');
const book = byId.get('BOOK-PROSE-PHASE-2-ORCHESTRATOR-CLOSURE-CENSUS-001');
assert(book && book.owner_path === 'SYSTEM_MASTER/BOOK' && book.specialist_owner_path === 'SYSTEM_MASTER/BOOK/PROSE', 'Book-Prose integration must remain BOOK-owned');
const learning = byId.get('LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001');
assert(learning && learning.owner_path === 'SYSTEM_MASTER/LEARNING', 'Learning compiler must remain LEARNING-owned');
const docs = byId.get('DOCUMENTS-R4-GITHUB-NATIVE-SOURCE-IMPORT-AND-EXACT-SUBJECT-QUALIFICATION-002');
assert(docs && docs.owner_path === 'SYSTEM_MASTER/DOCUMENTS', 'Documents R4 must remain DOCUMENTS-owned');
for (const o of obligations.obligations || []) {
  if (o.owner_path === 'SYSTEM_MASTER/DOCUMENTS') {
    assert(o.specialist_owner_path !== 'SYSTEM_MASTER/BOOK/PROSE', `Documents obligation cannot claim Prose specialist: ${o.obligation_id}`);
    assert(!/PROSE/i.test(String(o.obligation_id || '')), `Documents current obligation id cannot be Prose work: ${o.obligation_id}`);
  }
  if (o.owner_path === 'SYSTEM_MASTER/LEARNING') {
    assert(!/BOOK|PROSE|DOCUMENT/i.test(String(o.obligation_id || '')), `Learning current obligation id crosses product lanes: ${o.obligation_id}`);
  }
}

const secondShift = readJson(authority.second_shift_registry);
assert(setEq(new Set(Object.keys(secondShift.owner_files || {})), new Set(['CORE','LEARNING','BOOK','DOCUMENTS'])), 'Second Shift active lanes must be CORE, LEARNING, BOOK, DOCUMENTS');
assert(secondShift.coverage_routes?.['SYSTEM_MASTER/BOOK/PROSE'] === 'BOOK', 'Second Shift must route Prose child through BOOK');
assert(secondShift.program_job_lock === authority.program_job_lock, 'Second Shift must bind current job lock');
assert(secondShift.system_completion_status === authority.system_completion_status, 'Second Shift must bind current completion status');

const owners = {};
for (const [lane, rel] of Object.entries(secondShift.owner_files || {})) owners[lane] = readJson(rel);
function activeIds(owner) { return (owner.active_delegations || []).map((d) => d.obligation_id || d.objective_id); }
assert(activeIds(owners.CORE).includes('SYSTEM-MASTER-INTEGRATION-COORDINATION-001'), 'CORE Second Shift must carry central integration coordination');
assert((owners.BOOK.active_delegations || []).some((d) => d.owner_path === 'SYSTEM_MASTER/BOOK' && /BOOK-PROSE/i.test(`${d.objective_id || ''} ${d.obligation_id || ''}`)), 'BOOK Second Shift must carry Book-Prose integration');
assert((owners.LEARNING.active_delegations || []).every((d) => d.owner_path === 'SYSTEM_MASTER/LEARNING'), 'Learning delegations must stay in Learning lane');
for (const d of owners.DOCUMENTS.active_delegations || []) {
  assert(d.owner_path === 'SYSTEM_MASTER/DOCUMENTS', 'Documents delegation owner mismatch');
  assert(!/PROSE/i.test(`${d.delegation_id || ''} ${d.objective_id || ''} ${d.obligation_id || ''} ${d.parent_objective_id || ''}`), 'Documents active delegation must not be Prose work');
}

const bootstrap = readJson(authority.morning_bootstrap_schema);
assert(bootstrap.compatibility_focus_roles?.PROSE?.startsWith('BOOK@SYSTEM_MASTER/BOOK/PROSE'), 'morning bootstrap must route Prose focus through BOOK');
assert(Object.keys(bootstrap.retired_chat_roles || {}).length === 0, 'morning bootstrap must not classify active Book-child Prose as a retired chat role');
const bootstrapText = JSON.stringify(bootstrap);
assert(!bootstrapText.includes('REDIRECT_TO_DOCUMENTS'), 'morning bootstrap must not redirect Prose to Documents');
assert(!bootstrapText.includes('integrated under DOCUMENTS'), 'morning bootstrap contains stale Prose-under-Documents language');
assert((bootstrap.documents_rules || []).some((v) => /must not absorb/i.test(v)), 'morning bootstrap must forbid Documents Prose absorption');

const chatStart = readText(authority.chat_start_command_contract);
assert(chatStart.includes('system_catalog` selected by CURRENT-AUTHORITY'), 'chat startup must read authority-selected system catalog');
assert(!chatStart.includes('SYSTEM-MASTER-SYSTEM-CATALOG-001.json'), 'chat startup must not hard-code superseded catalog 001');
assert(chatStart.includes('PROSE is the only system currently complete'), 'chat startup must preserve Prose-only completion truth');
assert(chatStart.includes('Documents must not absorb'), 'chat startup must forbid Documents Prose absorption');

console.log('PROGRAM_JOB_LOCK_ENFORCEMENT_PASS');
console.log('completion=PROSE_ONLY');
console.log('central_objective=SYSTEM-MASTER-INTEGRATION-COORDINATION-001');
console.log('lanes=CORE,LEARNING,BOOK,DOCUMENTS;PROSE->BOOK');
console.log('startup=JOB_LOCKED');
