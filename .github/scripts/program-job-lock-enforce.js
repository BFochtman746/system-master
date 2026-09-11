'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');

function fail(message) { console.error(`PROGRAM_JOB_LOCK_ENFORCEMENT_FAIL: ${message}`); process.exit(1); }
function assert(condition, message) { if (!condition) fail(message); }
function readJson(rel) {
  assert(typeof rel === 'string' && rel.length > 0, 'required authority selector is missing');
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) fail(`missing ${rel}`);
  try { return JSON.parse(fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { fail(`invalid JSON ${rel}: ${error.message}`); }
}
function readText(rel) {
  assert(typeof rel === 'string' && rel.length > 0, 'required authority selector is missing');
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) fail(`missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}
function setEq(a, b) {
  const aa = [...a].sort(), bb = [...b].sort();
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}
function sameOrDescendant(candidate, parent) {
  return candidate === parent || String(candidate || '').startsWith(`${parent}/`);
}

const authority = readJson('governance/CURRENT-AUTHORITY.json');
for (const field of [
  'topology',
  'program_job_lock',
  'system_completion_status',
  'completion_ledger',
  'obligation_registry',
  'second_shift_registry',
  'morning_bootstrap_schema',
  'chat_start_command_contract'
]) assert(authority[field], `CURRENT-AUTHORITY must select ${field}`);

const topology = readJson(authority.topology);
const lock = readJson(authority.program_job_lock);
const completion = readJson(authority.system_completion_status);
const completionLedger = readJson(authority.completion_ledger);
const obligations = readJson(authority.obligation_registry);
const secondShift = readJson(authority.second_shift_registry);
const bootstrap = readJson(authority.morning_bootstrap_schema);
const chatStart = readText(authority.chat_start_command_contract);

assert(authority.product_root === 'SYSTEM_MASTER', 'CURRENT-AUTHORITY product_root must remain SYSTEM_MASTER');
assert(topology.product_root?.product_id === 'SYSTEM_MASTER', 'selected topology must remain rooted at SYSTEM_MASTER');
assert(lock.topology === authority.topology, 'program job lock must bind authority-selected topology');
assert(completionLedger.topology === authority.topology, 'completion ledger must bind authority-selected topology');
assert(completionLedger.system_completion_status === authority.system_completion_status, 'completion ledger must bind authority-selected completion status');
if (obligations.topology) assert(obligations.topology === authority.topology, 'obligation registry must bind authority-selected topology');
if (obligations.program_job_lock) assert(obligations.program_job_lock === authority.program_job_lock, 'obligation registry must bind authority-selected program job lock');
if (obligations.system_completion_status) assert(obligations.system_completion_status === authority.system_completion_status, 'obligation registry must bind authority-selected completion status');

const peers = new Set(authority.active_peer_execution_lanes || []);
assert(peers.size > 0, 'CURRENT-AUTHORITY must declare active_peer_execution_lanes');
const topologyPeers = new Set(topology.peer_system_ids || []);
const activeSystems = new Map((topology.canonical_internal_systems || []).map((entry) => [entry.system_id, entry]));
assert(setEq(peers, topologyPeers), 'authority active peer lanes must match topology peer_system_ids');
assert(setEq(peers, new Set(activeSystems.keys())), 'authority active peer lanes must match canonical internal systems');

const completionSystems = new Map((completion.systems || []).map((entry) => [entry.system_id, entry]));
assert(completionSystems.get('SYSTEM_MASTER')?.complete === false, 'SYSTEM_MASTER must remain incomplete until explicit product completion authority');
for (const peer of peers) {
  const system = activeSystems.get(peer);
  assert(system?.parent_id === 'SYSTEM_MASTER', `${peer} must remain a direct SYSTEM_MASTER peer`);
  assert(system.control_ref && system.control_record, `${peer} must declare control_ref and control_record`);
  assert(completionSystems.get(peer)?.complete === false, `${peer} must remain incomplete until explicit product completion authority`);
  const program = lock.programs?.[peer];
  assert(program, `program job lock missing active peer ${peer}`);
  assert(program.owner_path === `SYSTEM_MASTER/${peer}`, `program job owner mismatch for ${peer}`);
  assert(program.integrates_upward_to === 'SYSTEM_MASTER', `${peer} must integrate upward into SYSTEM_MASTER`);
}

const retiredIds = new Set(authority.retired_systems || []);
const topologyRetired = new Map((topology.retired_systems || []).map((entry) => [entry.system_id, entry]));
const completionRetired = new Map((completion.retired_systems || []).map((entry) => [entry.system_id, entry]));
for (const retiredId of retiredIds) {
  assert(!peers.has(retiredId), `retired system cannot remain an active peer: ${retiredId}`);
  assert(!activeSystems.has(retiredId), `retired system cannot remain canonical active system: ${retiredId}`);
  const t = topologyRetired.get(retiredId);
  const c = completionRetired.get(retiredId);
  const j = lock.retired_systems?.[retiredId];
  assert(t, `topology must preserve retired system ${retiredId}`);
  assert(c?.complete === true && c.active === false && c.remaining_product_work === false, `completion record must preserve terminal retirement for ${retiredId}`);
  assert(j && /RETIRED/.test(String(j.standing || '')), `program job lock must preserve retired standing for ${retiredId}`);
  for (const flag of ['active_execution','active_repair','active_qualification','active_research','active_telemetry']) {
    if (Object.prototype.hasOwnProperty.call(j, flag)) assert(j[flag] === false, `${retiredId} ${flag} must remain false`);
  }
  if (Object.prototype.hasOwnProperty.call(j, 'successor_allowed')) assert(j.successor_allowed === false, `${retiredId} successor must remain forbidden`);
  assert(!(secondShift.owner_files || {})[retiredId], `Second Shift must not expose retired owner lane ${retiredId}`);
}

if (retiredIds.has('PROSE')) {
  const prose = topologyRetired.get('PROSE');
  assert(prose.lifecycle === 'RETIRED_TERMINAL' && prose.final_completion === 'COMPLETE', 'PROSE must remain complete and terminally retired');
  for (const field of ['current_execution_lane','current_repair_lane','current_qualification_lane','current_telemetry_lane','successor_system']) {
    assert(prose[field] === null, `retired PROSE ${field} must remain null`);
  }
  assert(prose.integration_owner === 'SYSTEM_MASTER/BOOK', 'any genuinely open preserved-Prose integration must remain BOOK-owned');
  assert(lock.retired_systems?.PROSE?.integration_owner_if_needed === 'SYSTEM_MASTER/BOOK', 'job lock must keep preserved-Prose integration BOOK-owned');
  assert(lock.programs?.DOCUMENTS?.forbidden?.some((value) => /Prose/i.test(value)), 'Documents job must explicitly forbid Prose work');
  assert(!(bootstrap.allowed_chat_roles || []).includes('PROSE'), 'morning bootstrap must not expose a PROSE chat role');
  assert(String(bootstrap.retired_chat_roles?.PROSE || '').includes('RETIRED'), 'morning bootstrap must classify PROSE as retired');
  assert((bootstrap.documents_rules || []).some((value) => /no Prose work/i.test(value)), 'morning bootstrap must forbid Documents Prose work');
  assert(chatStart.includes('PROSE is complete and terminally retired'), 'chat startup must preserve terminal Prose retirement');
  assert(chatStart.includes('DOCUMENTS never receives Prose work'), 'chat startup must forbid Documents Prose routing');
}

assert(obligations.central_next_objective === authority.central_next_objective, 'obligation central objective selector mismatch');
assert(obligations.highest_discretionary_objective === authority.highest_discretionary_objective, 'obligation highest-discretionary selector mismatch');
const obligationList = obligations.obligations || [];
const byId = new Map(obligationList.map((entry) => [entry.obligation_id, entry]));
assert(byId.size === obligationList.length, 'obligation registry contains duplicate obligation_id values');
const central = byId.get(authority.central_next_objective);
assert(central && ['READY','ACTIVE'].includes(central.state), 'authority-selected central objective must be READY or ACTIVE');
const highest = byId.get(authority.highest_discretionary_objective);
assert(highest, 'authority-selected highest discretionary objective must exist in current obligations');
assert(/HIGHEST_DISCRETIONARY/.test(String(highest.priority || '')), 'selected highest discretionary objective must carry highest-discretionary priority');

const validActiveOwnerRoots = new Set(['SYSTEM_MASTER','SYSTEM_MASTER/SHARED_INFRASTRUCTURE','SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01']);
for (const peer of peers) validActiveOwnerRoots.add(`SYSTEM_MASTER/${peer}`);
for (const entry of obligationList) {
  assert(entry.obligation_id && entry.owner_path && entry.state, 'every current obligation must declare obligation_id, owner_path and state');
  assert([...validActiveOwnerRoots].some((owner) => sameOrDescendant(entry.owner_path, owner)), `obligation has no active owner path: ${entry.obligation_id} -> ${entry.owner_path}`);
  for (const retiredId of retiredIds) {
    const historical = topologyRetired.get(retiredId)?.historical_owner_path;
    if (historical) assert(!sameOrDescendant(entry.owner_path, historical), `current obligation uses retired owner path: ${entry.obligation_id}`);
  }
  if (entry.owner_path === 'SYSTEM_MASTER/DOCUMENTS') assert(!/PROSE/i.test(entry.obligation_id), `Documents current obligation cannot be Prose work: ${entry.obligation_id}`);
}

const secondShiftOwners = new Set(Object.keys(secondShift.owner_files || {}));
assert(setEq(secondShiftOwners, peers), 'Second Shift owner_files must match authority active peer lanes exactly');
const ownerFiles = {};
for (const [lane, rel] of Object.entries(secondShift.owner_files || {})) ownerFiles[lane] = readJson(rel);
for (const peer of peers) {
  const snapshot = obligations.owner_head_snapshot?.[peer];
  assert(typeof snapshot === 'string' && /^[0-9a-f]{40}$/.test(snapshot), `missing or invalid owner head snapshot for ${peer}`);
  assert(ownerFiles[peer]?.last_known_control_head === snapshot, `${peer} delegation control head must match current obligation snapshot`);
  for (const delegation of ownerFiles[peer]?.active_delegations || []) {
    assert(delegation.owner_path === `SYSTEM_MASTER/${peer}`, `${peer} delegation owner mismatch: ${delegation.delegation_id || delegation.objective_id}`);
    assert(delegation.valid_for_control_head === snapshot, `${peer} delegation has stale control-head binding: ${delegation.delegation_id || delegation.objective_id}`);
    if (peer === 'BOOK') assert(delegation.active_prose_execution_owner === undefined || delegation.active_prose_execution_owner === null, `Book delegation must not create active Prose owner: ${delegation.delegation_id || delegation.objective_id}`);
    if (peer === 'DOCUMENTS') assert(!/PROSE/i.test(`${delegation.delegation_id || ''} ${delegation.objective_id || ''} ${delegation.obligation_id || ''}`), 'Documents active delegation must not be Prose work');
  }
}

if (lock.programs?.PROGRAMMING) {
  assert(!peers.has('PROGRAMMING'), 'PROGRAMMING cannot gain peer standing through the job lock alone');
  assert(String(lock.programs.PROGRAMMING.classification || '').includes('ACTIVE_WORK_PROGRAM'), 'Programming must remain an active work program');
  assert(String(lock.programs.PROGRAMMING.classification || '').includes('NOT_YET_PEER'), 'Programming must remain non-peer until explicit admission');
  if (authority.programming_work_program_lock) assert(lock.programs.PROGRAMMING.program_lock === authority.programming_work_program_lock, 'Programming work-program lock pointer mismatch');
}

console.log('PROGRAM_JOB_LOCK_ENFORCEMENT_PASS');
console.log(`topology=${topology.topology_id}`);
console.log(`active_peers=${[...peers].sort().join(',')}`);
console.log(`retired_systems=${[...retiredIds].sort().join(',') || 'NONE'}`);
console.log(`central_objective=${authority.central_next_objective}`);
console.log(`highest_discretionary=${authority.highest_discretionary_objective}`);
console.log('owner_heads=CURRENT_SNAPSHOT_MATCH');
