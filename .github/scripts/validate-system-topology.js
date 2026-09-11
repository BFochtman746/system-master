'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const authorityPath = path.join(root, 'governance', 'CURRENT-AUTHORITY.json');
const registryPath = path.join(root, 'qualification', 'a01', 'registry.json');
const expectedPeers = new Set(['CORE', 'LEARNING', 'BOOK', 'DOCUMENTS']);
const expectedPeerParent = { CORE: 'SYSTEM_MASTER', LEARNING: 'SYSTEM_MASTER', BOOK: 'SYSTEM_MASTER', DOCUMENTS: 'SYSTEM_MASTER' };

function fail(message) {
  console.error(`SYSTEM_TOPOLOGY_ERROR: ${message}`);
  process.exit(1);
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`cannot read ${path.relative(root, file)}: ${error.message}`); }
}
function requireFile(relative) {
  const file = path.join(root, ...relative.split('/'));
  if (!fs.existsSync(file)) fail(`required authority file missing: ${relative}`);
  return file;
}
function ownerPath(system) {
  return system.owner_path || `SYSTEM_MASTER/${system.system_id}`;
}
function sameOrDescendant(candidate, parent) {
  return candidate === parent || String(candidate || '').startsWith(`${parent}/`);
}

const authority = readJson(authorityPath);
if (authority.product_root !== 'SYSTEM_MASTER') fail('CURRENT-AUTHORITY product_root must be SYSTEM_MASTER');
if (authority.topology !== 'governance/SYSTEM-TOPOLOGY-004.json') fail('CURRENT-AUTHORITY must select SYSTEM-TOPOLOGY-004.json');
for (const field of ['last_sealed_state_checkpoint','completion_ledger','obligation_registry','expectation_registry','reallocation_ledger','second_shift_registry']) {
  if (!authority[field]) fail(`CURRENT-AUTHORITY missing ${field}`);
  requireFile(authority[field]);
}

const topology = readJson(requireFile(authority.topology));
if ((topology.product_root || {}).product_id !== 'SYSTEM_MASTER') fail('topology product root must be SYSTEM_MASTER');
if ((topology.product_root || {}).classification !== 'PRODUCT_ROOT__SYSTEM_OF_SYSTEMS') fail('SYSTEM_MASTER must remain PRODUCT_ROOT__SYSTEM_OF_SYSTEMS');
const systems = topology.canonical_internal_systems || [];
const ids = systems.map((entry) => entry.system_id);
const idSet = new Set(ids);
if (idSet.size !== systems.length) fail('canonical internal systems contain duplicate system IDs');
for (const id of [...expectedPeers, 'PROSE']) if (!idSet.has(id)) fail(`canonical internal system missing: ${id}`);

const byId = Object.fromEntries(systems.map((entry) => [entry.system_id, entry]));
for (const id of expectedPeers) {
  if (byId[id].parent_id !== expectedPeerParent[id]) fail(`${id} parent is invalid; expected SYSTEM_MASTER`);
  if (!byId[id].control_ref || !byId[id].control_record) fail(`${id} must declare control_ref and control_record`);
}
if (byId.PROSE.parent_id !== 'BOOK') fail('completed PROSE must remain the Book child specialist');
if (ownerPath(byId.PROSE) !== 'SYSTEM_MASTER/BOOK/PROSE') fail('PROSE owner_path must remain SYSTEM_MASTER/BOOK/PROSE');
if (byId.PROSE.classification !== 'COMPLETED_CHILD_SPECIALIST_SYSTEM__AVAILABLE_FOR_BOOK_INTEGRATION') fail('PROSE must be classified complete and available for Book integration');
if (byId.PROSE.completion !== 'COMPLETE') fail('PROSE completion must remain COMPLETE');
if (byId.PROSE.execution_lane !== 'BOOK') fail('PROSE integration execution must inherit the BOOK lane');

const peerIds = new Set(topology.peer_system_ids || []);
if (peerIds.size !== 4 || [...expectedPeers].some((id) => !peerIds.has(id)) || peerIds.has('PROSE')) fail('peer_system_ids must be exactly CORE,LEARNING,BOOK,DOCUMENTS');
const childIds = new Set(topology.child_system_ids || []);
if (!childIds.has('PROSE')) fail('child_system_ids must contain completed Book child PROSE');

const history = topology.historical_records || {};
if (!history.prose_retirement_attempt) fail('historical Prose retirement record pointer must be preserved');
requireFile(history.prose_retirement_attempt);
if (history.prose_retirement_current_effect !== 'SUPERSEDED_BY_ADR_0004') fail('historical Prose retirement current effect must remain superseded by ADR-0004');

const edges = new Set((topology.hierarchy_edges || []).map((edge) => `${edge[0]}>${edge[1]}`));
for (const edge of ['SYSTEM_MASTER>CORE','SYSTEM_MASTER>LEARNING','SYSTEM_MASTER>BOOK','BOOK>PROSE','SYSTEM_MASTER>DOCUMENTS']) if (!edges.has(edge)) fail(`required hierarchy edge missing: ${edge}`);

const creation = topology.creation_rule || {};
for (const flag of ['implicit_system_creation_forbidden','branch_name_cannot_create_system','workstream_id_cannot_create_system','chat_or_task_title_cannot_create_system','qualification_id_cannot_create_system']) if (creation[flag] !== true) fail(`system creation guard ${flag} must remain true`);

const laneMap = topology.execution_lane_owner_map || {};
for (const [lane, owner] of Object.entries(laneMap)) if (!expectedPeers.has(owner)) fail(`execution lane ${lane} maps to non-peer owner ${owner}`);
if (laneMap['LITERARY-PROSE'] !== 'BOOK') fail('LITERARY-PROSE qualification/integration work must map to BOOK, never an independent PROSE lane');
if (laneMap['BOOK-EVAL-LEMONADE-001'] !== 'BOOK') fail('BOOK-EVAL qualification/integration work must map to BOOK');
const a01 = readJson(registryPath);
const workstreams = new Set(Object.values(a01.qualifications || {}).map((entry) => entry.workstream_id).filter(Boolean));
const unmapped = [...workstreams].filter((id) => !laneMap[id]).sort();
if (unmapped.length) fail(`A-01 workstream IDs lack System Master owner mapping: ${unmapped.join(', ')}`);

const activeOwnerPaths = new Set(['SYSTEM_MASTER', 'SYSTEM_MASTER/SHARED_INFRASTRUCTURE', 'SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01']);
for (const id of expectedPeers) activeOwnerPaths.add(ownerPath(byId[id]));
const obligations = readJson(requireFile(authority.obligation_registry));
for (const item of obligations.obligations || []) {
  if (!item.obligation_id || !item.owner_path || !item.state) fail('every obligation must declare obligation_id, owner_path and state');
  if (!String(item.owner_path).startsWith('SYSTEM_MASTER')) fail(`obligation ${item.obligation_id} escapes System Master hierarchy`);
  if (!['CLOSED','SUPERSEDED'].includes(item.state) && sameOrDescendant(item.owner_path, 'SYSTEM_MASTER/BOOK/PROSE')) fail(`open obligation ${item.obligation_id} attempts to create an independent PROSE owner path; active integration work must be BOOK-owned`);
  if (![...activeOwnerPaths].some((p) => sameOrDescendant(item.owner_path, p)) && !sameOrDescendant(item.owner_path, 'SYSTEM_MASTER/BOOK/PROSE')) fail(`obligation ${item.obligation_id} has no active topology owner path: ${item.owner_path}`);
}

const secondShift = readJson(requireFile(authority.second_shift_registry));
const expectedOwnerFiles = { CORE: 'CORE-DELEGATIONS.json', LEARNING: 'LEARNING-DELEGATIONS.json', BOOK: 'BOOK-DELEGATIONS.json', DOCUMENTS: 'DOCUMENTS-DELEGATIONS.json' };
for (const id of expectedPeers) {
  const rel = (secondShift.owner_files || {})[id];
  if (!rel) fail(`Second Shift registry missing owner file for ${id}`);
  requireFile(rel);
  if (!rel.endsWith(expectedOwnerFiles[id])) fail(`unexpected Second Shift owner file for ${id}: ${rel}`);
}
if ((secondShift.owner_files || {}).PROSE) fail('Second Shift registry must not schedule a separate PROSE lane');
if ((secondShift.owner_files || {}).SYSTEM_MASTER) fail('Second Shift registry must not schedule SYSTEM_MASTER root as a peer worker lane');
if ((secondShift.coverage_routes || {})['SYSTEM_MASTER/BOOK/PROSE'] !== 'BOOK') fail('Second Shift must route completed Prose child integration through BOOK');

console.log('SYSTEM_TOPOLOGY_PASS');
console.log('product_root=SYSTEM_MASTER');
console.log('peer_systems=CORE,LEARNING,BOOK,DOCUMENTS');
console.log('prose_status=COMPLETE_BOOK_CHILD');
console.log('prose_independent_execution=FORBIDDEN');
console.log('prose_integration_execution=BOOK_CONTROLLED');
console.log('book_integration_owner=BOOK');
console.log(`open_obligations_registered=${(obligations.obligations || []).filter((item) => item.state !== 'CLOSED' && item.state !== 'SUPERSEDED').length}`);
console.log(`a01_workstream_ids_mapped=${workstreams.size}`);
