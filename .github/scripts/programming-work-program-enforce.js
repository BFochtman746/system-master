'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');

function fail(message) {
  console.error(`PROGRAMMING_WORK_PROGRAM_ENFORCEMENT_FAIL: ${message}`);
  process.exit(1);
}
function readJson(rel) {
  if (!rel || typeof rel !== 'string') fail('required authority selector is missing');
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) fail(`missing ${rel}`);
  try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { fail(`invalid JSON ${rel}: ${error.message}`); }
}
function readText(rel) {
  if (!rel || typeof rel !== 'string') fail('required authority selector is missing');
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) fail(`missing ${rel}`);
  return fs.readFileSync(p, 'utf8');
}
function assert(condition, message) { if (!condition) fail(message); }
function topologyToken(topologyId) {
  return String(topologyId || '').replace(/^SYSTEM-/, '').replace(/-/g, '_');
}

const authority = readJson('governance/CURRENT-AUTHORITY.json');
for (const field of [
  'topology',
  'program_job_lock',
  'programming_work_program_lock',
  'programming_system_packet',
  'system_completion_status',
  'obligation_registry',
  'second_shift_registry',
  'morning_bootstrap_schema',
  'chat_start_command_contract'
]) assert(authority[field], `CURRENT-AUTHORITY must select ${field}`);

const topology = readJson(authority.topology);
const programLock = readJson(authority.programming_work_program_lock);
const packet = readJson(authority.programming_system_packet);
const jobLock = readJson(authority.program_job_lock);
const completion = readJson(authority.system_completion_status);
const obligations = readJson(authority.obligation_registry);
const secondShift = readJson(authority.second_shift_registry);
const bootstrap = readJson(authority.morning_bootstrap_schema);
const start = readText(authority.chat_start_command_contract);

assert(programLock.program_id === 'PROGRAMMING', 'Programming work-program ID mismatch');
assert(programLock.current_topology === authority.topology, `Programming work-program topology binding is stale: lock=${programLock.current_topology} authority=${authority.topology}`);
assert(programLock.system_packet === authority.programming_system_packet, 'Programming work-program system packet pointer mismatch');
assert(programLock.classification === 'ACTIVE_WORK_PROGRAM__CANDIDATE_SYSTEM_BOUNDARY__NOT_YET_PEER_TOPOLOGY', 'Programming work-program classification mismatch');
assert(String(programLock.topology_effect || '').startsWith('NONE__'), 'Programming lock must declare zero topology effect');
assert(String(programLock.topology_effect || '').includes(topologyToken(topology.topology_id)), `Programming topology effect must bind ${topology.topology_id}`);
assert(programLock.execution_lane?.separate_peer_second_shift_lane === false, 'Programming must not have a peer Second Shift lane before admission');
assert(Array.isArray(programLock.preserve_and_reuse) && programLock.preserve_and_reuse.length > 0, 'Programming preservation lineage is missing');

const activeTopologyIds = new Set((topology.canonical_internal_systems || []).map((entry) => entry.system_id));
assert(!activeTopologyIds.has('PROGRAMMING'), 'Programming must not be silently promoted to canonical peer topology');
assert(!(topology.peer_system_ids || []).includes('PROGRAMMING'), 'Programming must not be silently promoted to peer topology');
assert(!(topology.child_system_ids || []).includes('PROGRAMMING'), 'Programming must not be silently created as a child system');

const programming = jobLock.programs?.PROGRAMMING;
assert(programming, 'program job lock missing PROGRAMMING');
assert(String(programming.classification || '').includes('ACTIVE_WORK_PROGRAM'), 'Programming job-lock classification must remain active work program');
assert(String(programming.classification || '').includes('NOT_YET_PEER'), 'Programming job-lock classification must preserve non-peer boundary');
assert(programming.program_lock === authority.programming_work_program_lock, 'Programming job-lock program pointer mismatch');
assert(programming.system_packet === authority.programming_system_packet, 'Programming job-lock packet pointer mismatch');
assert(/preserved/i.test(programming.job || ''), 'Programming job must preserve prior engineering evidence');

assert(packet.candidate_system_id === 'PROGRAMMING', 'Programming packet candidate_system_id mismatch');
assert(packet.architecture_authority === false, 'Programming packet may not self-grant architecture authority');
assert(packet.work_program_lock === authority.programming_work_program_lock, 'Programming packet work-program pointer mismatch');
assert(String(packet.lifecycle || '').includes('ACTIVE_WORK_PROGRAM'), 'Programming packet must preserve active work-program standing');
assert(String(packet.lifecycle || '').includes('NOT_ACTIVE_PEER'), 'Programming packet must preserve non-peer standing');

const programStatus = (completion.non_system_programs || []).find((entry) => entry.program_id === 'PROGRAMMING');
assert(programStatus && programStatus.complete === false, 'Programming must be recorded as an incomplete non-system work program');
assert(!(completion.systems || []).some((entry) => entry.system_id === 'PROGRAMMING'), 'Programming must not appear in active system completion records before admission');
const retiredProse = (completion.retired_systems || []).find((entry) => entry.system_id === 'PROSE');
assert(retiredProse && retiredProse.complete === true && retiredProse.active === false && retiredProse.remaining_product_work === false, 'retired Prose completion boundary must remain intact');

const current = (obligations.obligations || []).find((entry) => entry.obligation_id === 'PROGRAMMING-WORK-PROGRAM-CONTINUATION-001');
assert(current && current.state === 'READY', 'Programming continuation obligation must be READY');
assert(current.program_id === 'PROGRAMMING', 'Programming continuation program_id mismatch');
assert(current.program_lock === authority.programming_work_program_lock, 'Programming continuation lock mismatch');
assert(current.second_shift_state === 'NO_PEER_LANE_BEFORE_TOPOLOGY_ADMISSION', 'Programming continuation must deny peer Second Shift execution before admission');

assert(obligations.highest_discretionary_objective === authority.highest_discretionary_objective, 'obligation registry highest-discretionary selector mismatch');
const support = (obligations.obligations || []).find((entry) => entry.obligation_id === authority.highest_discretionary_objective);
assert(support, `selected highest discretionary objective is missing: ${authority.highest_discretionary_objective}`);
assert(support.parent_program_id === 'PROGRAMMING', 'selected Programming support objective must remain subordinate to Programming');
assert(support.owner_path === 'SYSTEM_MASTER/CORE', 'Programming knowledge/source recovery support must remain Core-administered');

assert(!(secondShift.owner_files || {}).PROGRAMMING, 'Programming must not have a peer Second Shift owner file before admission');
assert((bootstrap.allowed_chat_roles || []).includes('PROGRAMMING_WORK_PROGRAM'), 'Morning bootstrap missing Programming work-program role');
assert(bootstrap.non_peer_work_program_roles?.PROGRAMMING_WORK_PROGRAM === authority.programming_work_program_lock, 'Programming bootstrap role must bind authority-selected work-program lock');
assert(start.includes("Start today's Programming chat."), 'Programming start command missing');
assert(start.includes('PROGRAMMING_WORK_PROGRAM'), 'Programming start role missing');

console.log('PROGRAMMING_WORK_PROGRAM_ENFORCEMENT_PASS');
console.log(`topology=${topology.topology_id}`);
console.log('programming=ACTIVE_WORK_PROGRAM_NOT_PEER');
console.log('programming_continuation=READY');
console.log(`support_objective=${authority.highest_discretionary_objective}`);
console.log('peer_topology_effect=NONE');
