'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');

function fail(message) { console.error(`PROGRAM_JOB_LOCK_ENFORCEMENT_FAIL: ${message}`); process.exit(1); }
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
function setEq(a, b) {
  const aa = [...a].sort(), bb = [...b].sort();
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}

const authority = readJson('governance/CURRENT-AUTHORITY.json');
assert(authority.program_job_lock === 'governance/SYSTEM-PROGRAM-JOB-LOCK-001.json', 'CURRENT-AUTHORITY must select SYSTEM-PROGRAM-JOB-LOCK-001');
assert(authority.system_completion_status === 'governance/SYSTEM-COMPLETION-STATUS-001.json', 'CURRENT-AUTHORITY must select SYSTEM-COMPLETION-STATUS-001');
assert(authority.topology === 'governance/SYSTEM-TOPOLOGY-005.json', 'CURRENT-AUTHORITY must select SYSTEM-TOPOLOGY-005.json');
assert(authority.completion_ledger === 'governance/COMPLETION-LEDGER-003.json', 'CURRENT-AUTHORITY must select completion ledger 003');
assert(authority.obligation_registry === 'governance/WORK-OBLIGATION-REGISTRY-009.json', 'CURRENT-AUTHORITY must select obligation registry 009');
assert(authority.expectation_registry === 'governance/EXPECTATION-REGISTRY-005.json', 'CURRENT-AUTHORITY must select expectation registry 005');
assert(authority.reallocation_ledger === 'governance/REALLOCATION-LEDGER-004.json', 'CURRENT-AUTHORITY must select reallocation ledger 004');
assert(authority.central_next_objective === 'SYSTEM-MASTER-INTEGRATION-COORDINATION-001', 'System Master integration coordination must remain central objective');
assert(authority.highest_discretionary_objective === 'SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001', 'Knowledge Recovery 001 must be highest discretionary objective');
assert(authority.knowledge_recovery_control === 'governance/knowledge-recovery/SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001.md', 'CURRENT-AUTHORITY must select Knowledge Recovery 001');
assert(authority.core_control_record === 'system-master/control-v2/SYSTEM-MASTER-CORE-CONTROL-RECORD-003.md', 'CURRENT-AUTHORITY must select Core Control 003');
assert(authority.learning_control_record === 'learning/control-v1/LEARNING-CONTROL-RECORD-v4.md', 'CURRENT-AUTHORITY must select Learning Control v4');
assert(authority.book_control_record === 'qualification/book-system/BOOK-SYSTEM-CONTROL-RECORD-011.json', 'CURRENT-AUTHORITY must select Book Control 011');
assert(authority.book_current_state_record === 'qualification/book-system/BOOK-SYSTEM-RECONCILED-STATE-041.json', 'CURRENT-AUTHORITY must select Book State 041');
assert(authority.documents_control_record === 'documents/control-v1/DOCUMENTS-CONTROL-RECORD-002.md', 'CURRENT-AUTHORITY must select Documents Control 002');
assert(authority.prose_active_control_ref === null, 'PROSE must have no active control ref');

const topology = readJson(authority.topology);
const peers = new Set(['CORE', 'LEARNING', 'BOOK', 'DOCUMENTS']);
assert(topology.topology_id === 'SYSTEM-TOPOLOGY-005', `unexpected topology ${topology.topology_id}`);
assert(setEq(new Set(topology.peer_system_ids || []), peers), 'peer systems must be exactly CORE, LEARNING, BOOK, DOCUMENTS');
assert(Array.isArray(topology.child_system_ids) && topology.child_system_ids.length === 0, 'current topology must have no child execution systems');
assert(!(topology.canonical_internal_systems || []).some((s) => s.system_id === 'PROSE'), 'PROSE must not be an active canonical internal system');
const retiredProse = (topology.retired_systems || []).find((s) => s.system_id === 'PROSE');
assert(retiredProse && retiredProse.lifecycle === 'RETIRED_TERMINAL', 'PROSE must be terminally retired');
assert(retiredProse.current_execution_lane === null && retiredProse.current_repair_lane === null && retiredProse.current_qualification_lane === null && retiredProse.current_telemetry_lane === null && retiredProse.successor_system === null, 'PROSE must have no active execution/repair/qualification/telemetry/successor lane');
assert(retiredProse.integration_owner === 'SYSTEM_MASTER/BOOK', 'any genuinely open completed-Prose integration must be BOOK-owned');
assert(topology.legacy_route_dispositions?.['LITERARY-PROSE']?.startsWith('RETIRED_NO_DISPATCH'), 'LITERARY-PROSE must be a retired no-dispatch route');

const completion = readJson(authority.system_completion_status);
const statuses = new Map((completion.systems || []).map((s) => [s.system_id, s]));
for (const id of ['SYSTEM_MASTER', 'CORE', 'LEARNING', 'BOOK', 'DOCUMENTS']) {
  assert(statuses.has(id), `missing active completion status ${id}`);
  assert(statuses.get(id).complete === false, `${id} must remain incomplete`);
}
assert(!statuses.has('PROSE'), 'PROSE must not appear in active completion systems');
const retiredCompletion = (completion.retired_systems || []).find((s) => s.system_id === 'PROSE');
assert(retiredCompletion && retiredCompletion.complete === true && retiredCompletion.active === false, 'completion status must mark PROSE complete and inactive');
assert(retiredCompletion.remaining_product_work === false, 'PROSE must have no remaining product work');

const completionLedger = readJson(authority.completion_ledger);
assert(completionLedger.topology === authority.topology, 'completion ledger must bind current topology');
assert(completionLedger.system_completion_status === authority.system_completion_status, 'completion ledger must bind current completion status');
assert((completionLedger.retired_system_entries || []).some((s) => s.system_id === 'PROSE' && s.complete === true && s.active === false), 'completion ledger must preserve terminal Prose retirement');

const lock = readJson(authority.program_job_lock);
assert(lock.programs?.BOOK?.integrates_upward_to === 'SYSTEM_MASTER', 'BOOK must integrate upward to System Master');
assert(lock.programs?.DOCUMENTS?.integrates_upward_to === 'SYSTEM_MASTER', 'DOCUMENTS must integrate upward to System Master');
assert(lock.programs?.LEARNING?.integrates_upward_to === 'SYSTEM_MASTER', 'LEARNING must integrate upward to System Master');
assert(lock.programs?.CORE?.discretionary_priority?.includes('SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001'), 'CORE job must preserve Knowledge Recovery 001 priority');
assert(lock.retired_systems?.PROSE?.standing === 'RETIRED_TERMINAL', 'job lock must classify PROSE as retired terminal');
assert(lock.retired_systems?.PROSE?.active_execution === false && lock.retired_systems?.PROSE?.active_repair === false && lock.retired_systems?.PROSE?.active_qualification === false && lock.retired_systems?.PROSE?.active_research === false && lock.retired_systems?.PROSE?.active_telemetry === false && lock.retired_systems?.PROSE?.successor_allowed === false, 'job lock must forbid all active Prose lanes/tasks');
assert(lock.programs?.DOCUMENTS?.forbidden?.some((v) => /Prose/i.test(v)), 'Documents job must forbid Prose work');

const obligations = readJson(authority.obligation_registry);
assert(obligations.central_next_objective === authority.central_next_objective, 'obligation central objective mismatch');
assert(obligations.highest_discretionary_objective === authority.highest_discretionary_objective, 'obligation highest discretionary objective mismatch');
const byId = new Map((obligations.obligations || []).map((o) => [o.obligation_id, o]));
const central = byId.get('SYSTEM-MASTER-INTEGRATION-COORDINATION-001');
assert(central && central.owner_path === 'SYSTEM_MASTER/CORE' && ['READY', 'ACTIVE'].includes(central.state), 'central integration obligation must be active under CORE administration');
const knowledge = byId.get('SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001');
assert(knowledge && knowledge.owner_path === 'SYSTEM_MASTER/CORE' && knowledge.priority === 'HIGHEST_DISCRETIONARY_SYSTEM_MASTER_PRIORITY', 'Knowledge Recovery 001 must be CORE-administered highest discretionary priority');
const book = byId.get('BOOK-PROSE-PHASE-2-ORCHESTRATOR-CLOSURE-CENSUS-001');
assert(book && book.owner_path === 'SYSTEM_MASTER/BOOK' && book.active_prose_owner === null, 'Book-Prose lineage must be BOOK-owned with no active Prose owner');
const docs = byId.get('DOCUMENTS-R4-GITHUB-NATIVE-SOURCE-IMPORT-AND-EXACT-SUBJECT-QUALIFICATION-002');
assert(docs && docs.owner_path === 'SYSTEM_MASTER/DOCUMENTS', 'Documents R4 must remain DOCUMENTS-owned');
for (const o of obligations.obligations || []) {
  assert(!String(o.owner_path || '').startsWith('SYSTEM_MASTER/BOOK/PROSE'), `active registry cannot own work under retired Prose path: ${o.obligation_id}`);
  if (o.owner_path === 'SYSTEM_MASTER/DOCUMENTS') assert(!/PROSE/i.test(String(o.obligation_id || '')), `Documents current obligation id cannot be Prose work: ${o.obligation_id}`);
}

const secondShift = readJson(authority.second_shift_registry);
assert(setEq(new Set(Object.keys(secondShift.owner_files || {})), peers), 'Second Shift active lanes must be exactly CORE, LEARNING, BOOK, DOCUMENTS');
assert(!Object.keys(secondShift.coverage_routes || {}).some((k) => k.startsWith('SYSTEM_MASTER/BOOK/PROSE')), 'Second Shift must not route retired Prose through any active lane');
assert(secondShift.retired_routes?.PROSE?.dispatchable === false && secondShift.retired_routes?.PROSE?.inherited_execution === false, 'Second Shift must classify Prose retired/non-dispatchable/non-inherited');
assert(secondShift.auto_provisioning_invariant?.current_coverage_complete === true, 'Second Shift current peer coverage must be complete');

const owners = {};
for (const [lane, rel] of Object.entries(secondShift.owner_files || {})) owners[lane] = readJson(rel);
function activeIds(owner) { return (owner.active_delegations || []).map((d) => d.obligation_id || d.objective_id); }
assert(activeIds(owners.CORE).includes('SYSTEM-MASTER-INTEGRATION-COORDINATION-001'), 'CORE Second Shift must carry central integration coordination');
const kr = (owners.CORE.active_delegations || []).find((d) => d.obligation_id === 'SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001');
assert(kr && kr.state === 'READY' && kr.priority === 'HIGHEST_DISCRETIONARY_SYSTEM_MASTER_PRIORITY', 'CORE Second Shift must expose Knowledge Recovery as READY highest discretionary work');
assert((owners.BOOK.active_delegations || []).some((d) => d.owner_path === 'SYSTEM_MASTER/BOOK' && d.active_prose_execution_owner === null), 'BOOK Second Shift must carry Book-owned integration with no active Prose owner');
for (const d of owners.DOCUMENTS.active_delegations || []) {
  assert(d.owner_path === 'SYSTEM_MASTER/DOCUMENTS', 'Documents delegation owner mismatch');
  assert(!/PROSE/i.test(`${d.delegation_id || ''} ${d.objective_id || ''} ${d.obligation_id || ''} ${d.parent_objective_id || ''}`), 'Documents active delegation must not be Prose work');
}
for (const lane of peers) {
  const snapshot = obligations.owner_head_snapshot?.[lane];
  assert(typeof snapshot === 'string' && /^[0-9a-f]{40}$/.test(snapshot), `missing/invalid owner snapshot ${lane}`);
  assert(owners[lane].last_known_control_head === snapshot, `${lane} delegation head must equal obligation snapshot`);
  for (const d of owners[lane].active_delegations || []) assert(d.valid_for_control_head === snapshot, `${lane} delegation ${d.delegation_id} must bind snapshot head`);
}
assert(!obligations.owner_head_snapshot?.PROSE && !obligations.owner_head_snapshot?.PROSE_CHILD, 'current obligation snapshot must not create an active Prose head');

const bootstrap = readJson(authority.morning_bootstrap_schema);
assert(bootstrap.retired_chat_roles?.PROSE?.includes('RETIRED'), 'morning bootstrap must classify PROSE as retired');
assert(!bootstrap.allowed_chat_roles?.includes('PROSE'), 'morning bootstrap must not allow a PROSE chat role');
assert((bootstrap.documents_rules || []).some((v) => /no Prose work/i.test(v)), 'morning bootstrap must forbid Documents Prose work');

const chatStart = readText(authority.chat_start_command_contract);
assert(chatStart.includes('PROSE is complete and terminally retired'), 'chat startup must preserve terminal Prose retirement');
assert(chatStart.includes('DOCUMENTS never receives Prose work'), 'chat startup must forbid Documents Prose routing');

console.log('PROGRAM_JOB_LOCK_ENFORCEMENT_PASS');
console.log('topology=SYSTEM-TOPOLOGY-005');
console.log('active_peers=CORE,LEARNING,BOOK,DOCUMENTS');
console.log('prose=COMPLETE_RETIRED_TERMINAL_NO_DISPATCH');
console.log('knowledge_recovery=HIGHEST_DISCRETIONARY');
console.log('heads=OWNER_SNAPSHOT_MATCH');
