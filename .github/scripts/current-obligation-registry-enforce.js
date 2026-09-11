'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');

function fail(message) { console.error(`CURRENT_OBLIGATION_REGISTRY_ENFORCEMENT_FAIL: ${message}`); process.exit(1); }
function assert(condition, message) { if (!condition) fail(message); }
function readJson(rel) {
  if (!rel || typeof rel !== 'string') fail('registry path is missing');
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) fail(`selected registry does not exist: ${rel}`);
  try { return JSON.parse(fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { fail(`invalid JSON ${rel}: ${error.message}`); }
}
function systemOwnerPath(system) { return system?.owner_path || (system?.system_id ? `SYSTEM_MASTER/${system.system_id}` : null); }
function sameOrDescendant(candidate, parent) { return candidate === parent || String(candidate || '').startsWith(`${parent}/`); }
function setEq(a, b) {
  const aa = [...a].sort(), bb = [...b].sort();
  return aa.length === bb.length && aa.every((value, index) => value === bb[index]);
}

const authority = readJson('governance/CURRENT-AUTHORITY.json');
for (const field of ['topology', 'program_job_lock', 'system_completion_status', 'obligation_registry']) {
  assert(authority[field], `CURRENT-AUTHORITY must select ${field}`);
}

const topology = readJson(authority.topology);
const jobLock = readJson(authority.program_job_lock);
const completion = readJson(authority.system_completion_status);
const registry = readJson(authority.obligation_registry);
const obligations = Array.isArray(registry.obligations) ? registry.obligations : fail('selected registry obligations must be an array');

const systems = topology.canonical_internal_systems || [];
const byOwnerPath = new Map(systems.map((system) => [systemOwnerPath(system), system]).filter(([owner]) => Boolean(owner)));
const peerSystems = new Set(topology.peer_system_ids || []);
const authorityPeers = new Set(authority.active_peer_execution_lanes || []);
const retiredSystems = topology.retired_systems || [];
const retiredIds = new Set(authority.retired_systems || retiredSystems.map((entry) => entry.system_id));
const retiredPaths = retiredSystems.map((entry) => entry.historical_owner_path).filter(Boolean);
const activeOwnerPaths = new Set(['SYSTEM_MASTER', ...byOwnerPath.keys()]);

assert(authority.product_root === 'SYSTEM_MASTER', 'CURRENT-AUTHORITY product_root must remain SYSTEM_MASTER');
assert(topology.product_root?.product_id === 'SYSTEM_MASTER', 'selected topology must remain rooted at SYSTEM_MASTER');
assert(setEq(peerSystems, authorityPeers), 'authority active peer lanes must match topology peer_system_ids');
assert(setEq(peerSystems, new Set(systems.map((entry) => entry.system_id))), 'topology peer_system_ids must match canonical internal systems');
assert(jobLock.topology === authority.topology, 'program job lock must bind authority-selected topology');

function validOwner(ownerPath) {
  if (typeof ownerPath !== 'string') return false;
  if (ownerPath === 'SYSTEM_MASTER' || ownerPath.startsWith('SYSTEM_MASTER/SHARED_INFRASTRUCTURE')) return true;
  if (retiredPaths.some((retired) => sameOrDescendant(ownerPath, retired))) return false;
  return [...activeOwnerPaths].some((active) => sameOrDescendant(ownerPath, active));
}
function resolveSystemForOwner(ownerPath) {
  return [...byOwnerPath.entries()]
    .filter(([candidate]) => sameOrDescendant(ownerPath, candidate))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[1] || null;
}

const activeStatuses = new Map((completion.systems || []).map((entry) => [entry.system_id, entry]));
assert(activeStatuses.get('SYSTEM_MASTER')?.complete === false, 'SYSTEM_MASTER must remain incomplete until explicit product completion authority');
for (const id of authorityPeers) {
  const status = activeStatuses.get(id);
  assert(status, `active completion status missing ${id}`);
  assert(status.complete === false, `${id} must remain incomplete until explicit product completion authority`);
  assert(jobLock.programs?.[id], `program job lock missing active peer ${id}`);
  assert(jobLock.programs[id].owner_path === `SYSTEM_MASTER/${id}`, `program job owner mismatch for ${id}`);
  assert(jobLock.programs[id].integrates_upward_to === 'SYSTEM_MASTER', `${id} must integrate upward into System Master`);
}
for (const retiredId of retiredIds) {
  assert(!activeStatuses.has(retiredId), `${retiredId} must not remain in active completion systems`);
  const retired = (completion.retired_systems || []).find((entry) => entry.system_id === retiredId);
  assert(retired?.complete === true && retired.active === false && retired.remaining_product_work === false, `${retiredId} must be complete, inactive and retired with no remaining product work`);
  assert(jobLock.retired_systems?.[retiredId], `program job lock missing retired system ${retiredId}`);
}

assert(registry.registry_id, 'selected registry missing registry_id');
assert(registry.product_root === 'SYSTEM_MASTER', `selected registry product_root must be SYSTEM_MASTER, got ${registry.product_root}`);
if (registry.topology) assert(registry.topology === authority.topology, `selected registry topology mismatch: authority=${authority.topology} registry=${registry.topology}`);
if (registry.program_job_lock) assert(registry.program_job_lock === authority.program_job_lock, 'selected registry job-lock mismatch');
if (registry.system_completion_status) assert(registry.system_completion_status === authority.system_completion_status, 'selected registry completion-status mismatch');
assert(authority.central_next_objective, 'CURRENT-AUTHORITY central_next_objective is missing');
assert(registry.central_next_objective === authority.central_next_objective, `central objective mismatch: authority=${authority.central_next_objective} registry=${registry.central_next_objective || '<missing>'}`);
assert(authority.highest_discretionary_objective, 'CURRENT-AUTHORITY highest_discretionary_objective is missing');
assert(registry.highest_discretionary_objective === authority.highest_discretionary_objective, 'highest discretionary objective selector mismatch');

const seen = new Set();
for (const entry of obligations) {
  assert(entry && typeof entry === 'object', 'obligation entry must be an object');
  assert(entry.obligation_id, 'obligation entry missing obligation_id');
  assert(!seen.has(entry.obligation_id), `duplicate obligation_id: ${entry.obligation_id}`);
  seen.add(entry.obligation_id);
  assert(validOwner(entry.owner_path), `invalid or retired owner_path for ${entry.obligation_id}: ${entry.owner_path || '<missing>'}`);
  assert(entry.state, `missing state for ${entry.obligation_id}`);
  if (!['CLOSED', 'SUPERSEDED'].includes(entry.state)) assert(entry.objective, `open obligation missing objective: ${entry.obligation_id}`);
  assert(!retiredPaths.some((retired) => sameOrDescendant(entry.owner_path, retired)), `active registry contains retired owner path: ${entry.obligation_id}`);
  if (entry.specialist_owner_path) assert(!retiredPaths.some((retired) => sameOrDescendant(entry.specialist_owner_path, retired)), `active registry contains retired specialist owner: ${entry.obligation_id}`);
}

if (retiredIds.has('PROSE')) {
  const proseLock = jobLock.retired_systems?.PROSE;
  assert(proseLock?.standing === 'RETIRED_TERMINAL' && proseLock.active_execution === false, 'job lock must keep PROSE terminally retired and non-executable');
  assert(proseLock.integration_owner_if_needed === 'SYSTEM_MASTER/BOOK', 'any genuinely open completed-Prose integration must be BOOK-owned');
  for (const entry of obligations) {
    assert(!sameOrDescendant(entry.owner_path, 'SYSTEM_MASTER/PROSE'), `active registry contains retired Prose owner: ${entry.obligation_id}`);
    if (entry.owner_path === 'SYSTEM_MASTER/DOCUMENTS') assert(!/PROSE/i.test(entry.obligation_id), `Documents obligation crosses into Prose: ${entry.obligation_id}`);
  }
  const historicalBookProse = obligations.find((entry) => entry.obligation_id === 'BOOK-PROSE-PHASE-2-ORCHESTRATOR-CLOSURE-CENSUS-001');
  if (historicalBookProse) {
    assert(historicalBookProse.owner_path === 'SYSTEM_MASTER/BOOK', 'Book-Prose historical integration lineage must remain BOOK-owned');
    assert(historicalBookProse.active_prose_owner === null, 'Book-Prose historical integration lineage must not create an active Prose owner');
    assert(historicalBookProse.historical_lineage_name_contains_retired_system === true, 'Book-Prose historical integration lineage must be marked historical');
  }
}

const highest = obligations.find((entry) => entry.obligation_id === authority.highest_discretionary_objective);
assert(highest, `highest_discretionary_objective is not present in selected registry: ${authority.highest_discretionary_objective}`);
assert(/HIGHEST_DISCRETIONARY/.test(String(highest.priority || '')), 'selected highest discretionary objective must carry highest-discretionary priority');
assert(validOwner(highest.owner_path), `highest discretionary objective has invalid owner: ${highest.owner_path}`);

const next = obligations.find((entry) => entry.obligation_id === authority.central_next_objective);
assert(next, `central_next_objective is not present in selected registry: ${authority.central_next_objective}`);
assert(['READY', 'ACTIVE'].includes(next.state), `central_next_objective must be READY or ACTIVE, got ${next.state}`);
assert(validOwner(next.owner_path) && next.owner_path !== 'SYSTEM_MASTER', `central_next_objective must be assigned to an active executable owner, got ${next.owner_path}`);
const nextSystem = resolveSystemForOwner(next.owner_path);
if (!next.owner_path.startsWith('SYSTEM_MASTER/SHARED_INFRASTRUCTURE')) {
  assert(nextSystem, `central_next_objective owner is not an active topology system: ${next.owner_path}`);
  assert(peerSystems.has(nextSystem.system_id), `central_next_objective must resolve to an active peer system: ${next.owner_path}`);
}

const transitionRows = [
  ...(Array.isArray(registry.closed_at_transition) ? registry.closed_at_transition : []),
  ...(Array.isArray(registry.superseded_at_transition) ? registry.superseded_at_transition : [])
];
const transitionIds = new Set();
for (const row of transitionRows) {
  assert(row?.obligation_id, 'transition entry missing obligation_id');
  assert(!transitionIds.has(row.obligation_id), `duplicate transition obligation_id: ${row.obligation_id}`);
  transitionIds.add(row.obligation_id);
  assert(!seen.has(row.obligation_id), `obligation appears both current and transition history: ${row.obligation_id}`);
}

console.log(`CURRENT_OBLIGATION_REGISTRY_ENFORCEMENT_PASS registry=${registry.registry_id} topology=${topology.topology_id} obligations=${obligations.length} next=${authority.central_next_objective} owner=${next.owner_path} highest_discretionary=${authority.highest_discretionary_objective} retired=${[...retiredIds].sort().join(',') || 'NONE'}`);
