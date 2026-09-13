'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');

function fail(message) { console.error(`PROGRAM_JOB_LOCK_ENFORCEMENT_FAIL: ${message}`); process.exit(1); }
function assert(ok, message) { if (!ok) fail(message); }
function readJson(rel) {
  assert(typeof rel === 'string' && rel.length > 0, 'required authority selector is missing');
  const p = path.join(root, rel); assert(fs.existsSync(p), `missing ${rel}`);
  try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { fail(`invalid JSON ${rel}: ${error.message}`); }
}
function readText(rel) { const p = path.join(root, rel); assert(fs.existsSync(p), `missing ${rel}`); return fs.readFileSync(p, 'utf8'); }
function sameSet(a, b) { const aa=[...a].sort(), bb=[...b].sort(); return aa.length===bb.length && aa.every((v,i)=>v===bb[i]); }
function sameOrDescendant(candidate, parent) { return candidate===parent || String(candidate||'').startsWith(`${parent}/`); }

const authority = readJson('governance/CURRENT-AUTHORITY.json');
for (const f of ['topology','program_job_lock','system_completion_status','completion_ledger','obligation_registry','second_shift_registry','morning_bootstrap_schema','chat_start_command_contract']) assert(authority[f], `CURRENT-AUTHORITY must select ${f}`);
const topology = readJson(authority.topology);
const lock = readJson(authority.program_job_lock);
const completion = readJson(authority.system_completion_status);
const ledger = readJson(authority.completion_ledger);
const obligations = readJson(authority.obligation_registry);
const secondShift = readJson(authority.second_shift_registry);
const bootstrap = readJson(authority.morning_bootstrap_schema);
const chatStart = readText(authority.chat_start_command_contract);

assert(authority.product_root === 'SYSTEM_MASTER', 'product root must remain SYSTEM_MASTER');
assert(topology.product_root?.product_id === 'SYSTEM_MASTER', 'topology root must remain SYSTEM_MASTER');
assert(lock.topology === authority.topology, 'job lock must bind authority-selected topology');
assert(ledger.topology === authority.topology, 'completion ledger must bind authority-selected topology');
assert(ledger.system_completion_status === authority.system_completion_status, 'completion ledger must bind selected completion status');
assert(obligations.topology === authority.topology, 'obligation registry must bind selected topology');
assert(obligations.program_job_lock === authority.program_job_lock, 'obligation registry must bind selected job lock');
assert(obligations.system_completion_status === authority.system_completion_status, 'obligation registry must bind selected completion status');

const peers = new Set(authority.active_peer_execution_lanes || []);
const topologyPeers = new Set(topology.peer_system_ids || []);
const ready = new Set(topology.execution_readiness?.execution_ready_peer_system_ids || []);
const systems = new Map((topology.canonical_internal_systems || []).map(x => [x.system_id, x]));
assert(peers.size > 0 && sameSet(peers, topologyPeers) && sameSet(peers, ready) && sameSet(peers, new Set(systems.keys())), 'authority/topology/canonical/execution-ready peer sets must match');

const status = new Map((completion.systems || []).map(x => [x.system_id, x]));
assert(status.get('SYSTEM_MASTER')?.complete === false, 'SYSTEM_MASTER must remain incomplete');
for (const peer of peers) {
  const system = systems.get(peer); const program = lock.programs?.[peer];
  assert(system?.parent_id === 'SYSTEM_MASTER', `${peer} must remain a direct SYSTEM_MASTER peer`);
  assert(system.control_ref && system.control_record, `${peer} must declare control_ref and control_record`);
  assert(status.get(peer)?.complete === false, `${peer} must remain incomplete`);
  assert(program?.owner_path === `SYSTEM_MASTER/${peer}`, `program owner mismatch for ${peer}`);
  assert(program?.integrates_upward_to === 'SYSTEM_MASTER', `${peer} must integrate upward to SYSTEM_MASTER`);
}

const retired = new Set(authority.retired_systems || []);
for (const id of retired) {
  assert(!peers.has(id) && !systems.has(id), `retired system cannot be active: ${id}`);
  const t=(topology.retired_systems||[]).find(x=>x.system_id===id); const c=(completion.retired_systems||[]).find(x=>x.system_id===id); const j=lock.retired_systems?.[id];
  assert(t && c?.complete===true && c.active===false && j, `retirement records incomplete for ${id}`);
  assert(!(secondShift.owner_files||{})[id], `retired system cannot have Second Shift lane: ${id}`);
}
const prose=(topology.retired_systems||[]).find(x=>x.system_id==='PROSE');
assert(prose?.lifecycle==='RETIRED_TERMINAL' && prose.final_completion==='COMPLETE', 'PROSE retirement boundary invalid');
assert(prose.integration_owner==='SYSTEM_MASTER/BOOK', 'open preserved-Prose integration must remain BOOK-owned');
assert(chatStart.includes('PROSE is complete and terminally retired'), 'chat startup must preserve terminal Prose retirement');
assert(chatStart.includes('DOCUMENTS never receives Prose work'), 'chat startup must forbid Documents Prose routing');

const list=obligations.obligations||[]; const byId=new Map(list.map(x=>[x.obligation_id,x]));
assert(byId.size===list.length, 'duplicate obligation IDs');
assert(obligations.central_next_objective===authority.central_next_objective, 'central objective mismatch');
assert(obligations.highest_discretionary_objective===authority.highest_discretionary_objective, 'highest discretionary mismatch');
assert(['READY','ACTIVE'].includes(byId.get(authority.central_next_objective)?.state), 'central objective must be READY or ACTIVE');
assert(/HIGHEST_DISCRETIONARY/.test(String(byId.get(authority.highest_discretionary_objective)?.priority||'')), 'highest discretionary priority marker missing');

const validRoots = new Set(['SYSTEM_MASTER','SYSTEM_MASTER/SHARED_INFRASTRUCTURE','SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01']);
for (const peer of peers) validRoots.add(`SYSTEM_MASTER/${peer}`);
for (const item of list) {
  assert(item.obligation_id && item.owner_path && item.state, 'every obligation must declare id/owner/state');
  assert([...validRoots].some(r=>sameOrDescendant(item.owner_path,r)), `invalid owner path: ${item.obligation_id} -> ${item.owner_path}`);
  assert(!sameOrDescendant(item.owner_path,'SYSTEM_MASTER/BOOK/PROSE'), `retired Prose owner path used: ${item.obligation_id}`);
}

assert(sameSet(new Set(Object.keys(secondShift.owner_files||{})), peers), 'Second Shift owner_files must match active peers exactly');
for (const peer of peers) {
  const snapshot=obligations.owner_head_snapshot?.[peer]; assert(/^[0-9a-f]{40}$/.test(String(snapshot||'')), `invalid owner snapshot for ${peer}`);
  const owner=readJson(secondShift.owner_files[peer]);
  assert(owner.owner_system_id===peer && owner.owner_path===`SYSTEM_MASTER/${peer}`, `${peer} owner file identity mismatch`);
  assert(owner.last_known_control_head===snapshot, `${peer} owner file control head mismatch`);
  for (const d of owner.active_delegations||[]) assert(d.valid_for_control_head===snapshot, `${peer} delegation has stale control head`);
}

assert(peers.has('PROGRAMMING'), 'PROGRAMMING must be an admitted peer under current topology');
const programming=lock.programs?.PROGRAMMING;
assert(String(programming?.classification||'').includes('ACTIVE_PEER_SYSTEM'), 'Programming job-lock classification must be active peer');
assert(programming.owner_path==='SYSTEM_MASTER/PROGRAMMING' && programming.integrates_upward_to==='SYSTEM_MASTER', 'Programming peer owner/upward integration mismatch');
assert(programming.program_lock===authority.programming_work_program_lock, 'Programming continuity-lock pointer mismatch');
assert(authority.programming_control_record===systems.get('PROGRAMMING')?.control_record, 'Programming canonical control pointer mismatch');
assert((bootstrap.allowed_chat_roles||[]).includes('PROGRAMMING'), 'morning bootstrap must expose PROGRAMMING peer role');

console.log('PROGRAM_JOB_LOCK_ENFORCEMENT_PASS');
console.log(`topology=${topology.topology_id}`);
console.log(`active_peers=${[...peers].sort().join(',')}`);
console.log('programming=ACTIVE_PEER_SYSTEM_CONTINUITY_PRESERVED');
console.log(`central_objective=${authority.central_next_objective}`);
console.log(`highest_discretionary=${authority.highest_discretionary_objective}`);
