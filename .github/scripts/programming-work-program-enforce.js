'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');

function fail(message) {
  console.error(`PROGRAMMING_WORK_PROGRAM_ENFORCEMENT_FAIL: ${message}`);
  process.exit(1);
}
function readJson(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) fail(`missing ${rel}`);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (error) { fail(`invalid JSON ${rel}: ${error.message}`); }
}
function readText(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) fail(`missing ${rel}`);
  return fs.readFileSync(p, 'utf8');
}
function assert(condition, message) { if (!condition) fail(message); }

const authority = readJson('governance/CURRENT-AUTHORITY.json');
assert(authority.programming_work_program_lock === 'governance/programs/PROGRAMMING-WORK-PROGRAM-LOCK-001.json', 'CURRENT-AUTHORITY must select Programming work-program lock');
assert(authority.programming_system_packet === 'governance/catalog/system-packets/PROGRAMMING.json', 'CURRENT-AUTHORITY must select Programming system packet');

const topology = readJson(authority.topology);
assert(topology.topology_id === 'SYSTEM-TOPOLOGY-004', 'Programming work program must not replace Topology 004');
assert(!(topology.peer_system_ids || []).includes('PROGRAMMING'), 'Programming must not be silently promoted to peer topology');
assert(!(topology.child_system_ids || []).includes('PROGRAMMING'), 'Programming must not be silently created as a child system');

const lock = readJson(authority.program_job_lock);
const programming = lock.programs?.PROGRAMMING;
assert(programming, 'program job lock missing PROGRAMMING');
assert(programming.classification === 'ACTIVE_WORK_PROGRAM__NOT_YET_PEER_TOPOLOGY', 'Programming classification drift');
assert(programming.program_lock === authority.programming_work_program_lock, 'Programming program-lock pointer mismatch');
assert(/preserved/i.test(programming.job || ''), 'Programming job must preserve prior engineering evidence');
assert(/not yet.*peer|peer topology/i.test(`${programming.classification} ${programming.job} ${(programming.forbidden || []).join(' ')}`), 'Programming peer-admission boundary missing');

const programLock = readJson(authority.programming_work_program_lock);
assert(programLock.program_id === 'PROGRAMMING', 'Programming work-program ID mismatch');
assert(programLock.classification === 'ACTIVE_WORK_PROGRAM__CANDIDATE_SYSTEM_BOUNDARY__NOT_YET_PEER_TOPOLOGY', 'Programming work-program classification mismatch');
assert(programLock.topology_effect === 'NONE__TOPOLOGY_004_UNCHANGED', 'Programming lock must have zero topology effect');
assert(programLock.execution_lane?.separate_peer_second_shift_lane === false, 'Programming must not have a peer Second Shift lane before admission');
assert(Array.isArray(programLock.preserve_and_reuse) && programLock.preserve_and_reuse.some((v) => /PROGRAMMING-FOUNDATION-002A/i.test(v)), 'Programming foundation preservation lineage missing');

const completion = readJson(authority.system_completion_status);
const programStatus = (completion.non_system_programs || []).find((x) => x.program_id === 'PROGRAMMING');
assert(programStatus && programStatus.complete === false, 'Programming must be recorded as incomplete work program');
assert((completion.systems || []).filter((x) => x.complete === true).map((x) => x.system_id).join(',') === 'PROSE', 'Prose must remain the only complete system');

const obligations = readJson(authority.obligation_registry);
const current = (obligations.obligations || []).find((x) => x.obligation_id === 'PROGRAMMING-WORK-PROGRAM-CONTINUATION-001');
assert(current && current.state === 'READY', 'Programming continuation obligation must be READY');
assert(current.program_id === 'PROGRAMMING', 'Programming continuation program_id mismatch');
assert(current.program_lock === authority.programming_work_program_lock, 'Programming continuation lock mismatch');
const knowledge = (obligations.obligations || []).find((x) => x.obligation_id === 'SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001');
assert(knowledge && knowledge.priority === 'SUPPORTING_PROGRAM', 'Knowledge Recovery must remain supporting only');
assert(knowledge.parent_program_id === 'PROGRAMMING', 'Knowledge Recovery must be subordinate to Programming work program');

const secondShift = readJson(authority.second_shift_registry);
assert(!(secondShift.owner_files || {}).PROGRAMMING, 'Programming must not have peer Second Shift owner file before admission');

const bootstrap = readJson(authority.morning_bootstrap_schema);
assert((bootstrap.allowed_chat_roles || []).includes('PROGRAMMING_WORK_PROGRAM'), 'Morning bootstrap missing Programming work-program role');
assert(bootstrap.non_peer_work_program_roles?.PROGRAMMING_WORK_PROGRAM === authority.programming_work_program_lock, 'Programming bootstrap role must bind exact work-program lock');

const start = readText(authority.chat_start_command_contract);
assert(start.includes("Start today's Programming chat."), 'Programming start command missing');
assert(start.includes('PROGRAMMING_WORK_PROGRAM'), 'Programming start role missing');
assert(start.includes('Knowledge Recovery is a supporting'), 'Chat startup must keep Knowledge Recovery subordinate');

console.log('PROGRAMMING_WORK_PROGRAM_ENFORCEMENT_PASS');
console.log('programming=ACTIVE_WORK_PROGRAM_NOT_PEER');
console.log('programming_continuation=READY');
console.log('knowledge_recovery=SUPPORTING_SUBPROGRAM');
console.log('peer_topology_unchanged=CORE,LEARNING,BOOK,DOCUMENTS');
console.log('only_complete_system=PROSE');
