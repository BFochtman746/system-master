'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const authorityPath = path.join(root, 'governance', 'CURRENT-AUTHORITY.json');
const topologyPath = path.join(root, 'governance', 'SYSTEM-TOPOLOGY-002.json');
const registryPath = path.join(root, 'qualification', 'a01', 'registry.json');
const expectedSystems = new Set(['CORE', 'LEARNING', 'BOOK', 'PROSE']);
const expectedParent = { CORE: 'SYSTEM_MASTER', LEARNING: 'SYSTEM_MASTER', BOOK: 'SYSTEM_MASTER', PROSE: 'BOOK' };

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

const authority = readJson(authorityPath);
if (authority.product_root !== 'SYSTEM_MASTER') fail('CURRENT-AUTHORITY product_root must be SYSTEM_MASTER');
if (authority.topology !== 'governance/SYSTEM-TOPOLOGY-002.json') fail('CURRENT-AUTHORITY must select SYSTEM-TOPOLOGY-002.json');
for (const field of ['last_sealed_state_checkpoint', 'completion_ledger', 'expectation_registry', 'reallocation_ledger', 'second_shift_registry']) {
  if (!authority[field]) fail(`CURRENT-AUTHORITY missing ${field}`);
  requireFile(authority[field]);
}

const topology = readJson(topologyPath);
if ((topology.product_root || {}).product_id !== 'SYSTEM_MASTER') fail('topology product root must be SYSTEM_MASTER');
if ((topology.product_root || {}).classification !== 'PRODUCT_ROOT__SYSTEM_OF_SYSTEMS') fail('SYSTEM_MASTER must remain PRODUCT_ROOT__SYSTEM_OF_SYSTEMS');

const systems = topology.canonical_internal_systems || [];
const ids = systems.map((entry) => entry.system_id);
const idSet = new Set(ids);
if (systems.length !== 4 || idSet.size !== 4 || [...expectedSystems].some((id) => !idSet.has(id))) {
  fail(`canonical internal systems must be exactly CORE,LEARNING,BOOK,PROSE; got ${ids.join(',')}`);
}

const byId = Object.fromEntries(systems.map((entry) => [entry.system_id, entry]));
for (const id of expectedSystems) {
  if (byId[id].parent_id !== expectedParent[id]) fail(`${id} parent is invalid; expected ${expectedParent[id]}`);
  if (!byId[id].control_ref || !byId[id].control_record) fail(`${id} must declare control_ref and control_record`);
}

const edges = new Set((topology.hierarchy_edges || []).map((edge) => `${edge[0]}>${edge[1]}`));
for (const edge of ['SYSTEM_MASTER>CORE', 'SYSTEM_MASTER>LEARNING', 'SYSTEM_MASTER>BOOK', 'BOOK>PROSE']) {
  if (!edges.has(edge)) fail(`required hierarchy edge missing: ${edge}`);
}

const creation = topology.creation_rule || {};
for (const flag of [
  'implicit_system_creation_forbidden',
  'branch_name_cannot_create_system',
  'workstream_id_cannot_create_system',
  'chat_or_task_title_cannot_create_system',
  'qualification_id_cannot_create_system'
]) {
  if (creation[flag] !== true) fail(`system creation guard ${flag} must remain true`);
}

const laneMap = topology.execution_lane_owner_map || {};
for (const [lane, owner] of Object.entries(laneMap)) {
  if (!expectedSystems.has(owner)) fail(`execution lane ${lane} maps to unknown internal system ${owner}`);
}

const a01 = readJson(registryPath);
const workstreams = new Set(Object.values(a01.qualifications || {}).map((entry) => entry.workstream_id).filter(Boolean));
const unmapped = [...workstreams].filter((id) => !laneMap[id]).sort();
if (unmapped.length) fail(`A-01 workstream IDs lack System Master owner mapping: ${unmapped.join(', ')}`);

const explicitNonSystems = topology.explicit_non_systems || {};
for (const name of ['A-01', 'ASSURANCE', 'RECONCILIATION', 'CONTINUITY', 'BOOK EVALUATOR', 'LITERARY PROSE ENGINE', 'NIGHT SHIFT', 'SECOND SHIFT', 'QUALIFICATION', 'RUNNER', 'CHAT']) {
  if (!Object.prototype.hasOwnProperty.call(explicitNonSystems, name)) fail(`required non-system classification missing: ${name}`);
}

const secondShift = readJson(requireFile(authority.second_shift_registry));
const expectedOwnerFiles = { CORE: 'CORE-DELEGATIONS.json', LEARNING: 'LEARNING-DELEGATIONS.json', BOOK: 'BOOK-DELEGATIONS.json', PROSE: 'PROSE-DELEGATIONS.json' };
for (const id of expectedSystems) {
  const rel = (secondShift.owner_files || {})[id];
  if (!rel) fail(`Second Shift registry missing owner file for ${id}`);
  requireFile(rel);
  if (!rel.endsWith(expectedOwnerFiles[id])) fail(`unexpected Second Shift owner file for ${id}: ${rel}`);
}

console.log('SYSTEM_TOPOLOGY_PASS');
console.log('product_root=SYSTEM_MASTER');
console.log('canonical_internal_systems=CORE,LEARNING,BOOK,PROSE');
console.log('hierarchy=SYSTEM_MASTER>{CORE,LEARNING,BOOK};BOOK>PROSE');
console.log(`a01_workstream_ids_mapped=${workstreams.size}`);
