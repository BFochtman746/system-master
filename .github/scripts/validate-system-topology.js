'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const authorityPath = path.join(root, 'governance', 'CURRENT-AUTHORITY.json');
const registryPath = path.join(root, 'qualification', 'a01', 'registry.json');
const expectedSystems = new Set(['CORE', 'LEARNING', 'BOOK', 'DOCUMENTS']);
const expectedParent = { CORE: 'SYSTEM_MASTER', LEARNING: 'SYSTEM_MASTER', BOOK: 'SYSTEM_MASTER', DOCUMENTS: 'SYSTEM_MASTER' };

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
if (authority.topology !== 'governance/SYSTEM-TOPOLOGY-003.json') fail('CURRENT-AUTHORITY must select SYSTEM-TOPOLOGY-003.json');
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
if (systems.length !== 4 || idSet.size !== 4 || [...expectedSystems].some((id) => !idSet.has(id))) fail(`canonical internal systems must be exactly CORE,LEARNING,BOOK,DOCUMENTS; got ${ids.join(',')}`);
if (idSet.has('PROSE')) fail('PROSE is retired and cannot remain an active canonical internal system');
const byId = Object.fromEntries(systems.map((entry) => [entry.system_id, entry]));
for (const id of expectedSystems) {
  if (byId[id].parent_id !== expectedParent[id]) fail(`${id} parent is invalid; expected SYSTEM_MASTER`);
  if (!byId[id].control_ref || !byId[id].control_record) fail(`${id} must declare control_ref and control_record`);
}
const retired = Object.fromEntries((topology.retired_systems || []).map((entry) => [entry.system_id, entry]));
if (!retired.PROSE) fail('retired systems must contain PROSE');
if (retired.PROSE.successor_system_id !== 'DOCUMENTS') fail('retired PROSE successor must be DOCUMENTS');
if (!retired.PROSE.retirement_record) fail('retired PROSE must declare retirement_record');
requireFile(retired.PROSE.retirement_record);

const edges = new Set((topology.hierarchy_edges || []).map((edge) => `${edge[0]}>${edge[1]}`));
for (const edge of ['SYSTEM_MASTER>CORE','SYSTEM_MASTER>LEARNING','SYSTEM_MASTER>BOOK','SYSTEM_MASTER>DOCUMENTS']) if (!edges.has(edge)) fail(`required hierarchy edge missing: ${edge}`);
if (edges.has('BOOK>PROSE')) fail('retired BOOK>PROSE edge must not remain active');

const creation = topology.creation_rule || {};
for (const flag of ['implicit_system_creation_forbidden','branch_name_cannot_create_system','workstream_id_cannot_create_system','chat_or_task_title_cannot_create_system','qualification_id_cannot_create_system']) if (creation[flag] !== true) fail(`system creation guard ${flag} must remain true`);

const laneMap = topology.execution_lane_owner_map || {};
for (const [lane, owner] of Object.entries(laneMap)) if (!expectedSystems.has(owner)) fail(`execution lane ${lane} maps to unknown active internal system ${owner}`);
const a01 = readJson(registryPath);
const workstreams = new Set(Object.values(a01.qualifications || {}).map((entry) => entry.workstream_id).filter(Boolean));
const unmapped = [...workstreams].filter((id) => !laneMap[id]).sort();
if (unmapped.length) fail(`A-01 workstream IDs lack System Master owner mapping: ${unmapped.join(', ')}`);

const obligations = readJson(requireFile(authority.obligation_registry));
for (const item of obligations.obligations || []) {
  if (!item.obligation_id || !item.owner_path || !item.state) fail('every obligation must declare obligation_id, owner_path and state');
  if (!String(item.owner_path).startsWith('SYSTEM_MASTER')) fail(`obligation ${item.obligation_id} escapes System Master hierarchy`);
  if (String(item.owner_path).startsWith('SYSTEM_MASTER/BOOK/PROSE')) fail(`current obligation ${item.obligation_id} routes to retired PROSE owner`);
}

const secondShift = readJson(requireFile(authority.second_shift_registry));
const expectedOwnerFiles = { CORE: 'CORE-DELEGATIONS.json', LEARNING: 'LEARNING-DELEGATIONS.json', BOOK: 'BOOK-DELEGATIONS.json', DOCUMENTS: 'DOCUMENTS-DELEGATIONS.json' };
for (const id of expectedSystems) {
  const rel = (secondShift.owner_files || {})[id];
  if (!rel) fail(`Second Shift registry missing owner file for ${id}`);
  requireFile(rel);
  if (!rel.endsWith(expectedOwnerFiles[id])) fail(`unexpected Second Shift owner file for ${id}: ${rel}`);
}
if ((secondShift.owner_files || {}).PROSE) fail('Second Shift registry must not schedule retired PROSE');
if ((secondShift.owner_files || {}).SYSTEM_MASTER) fail('Second Shift registry must not schedule SYSTEM_MASTER root as a peer worker lane');

console.log('SYSTEM_TOPOLOGY_PASS');
console.log('product_root=SYSTEM_MASTER');
console.log('canonical_internal_systems=CORE,LEARNING,BOOK,DOCUMENTS');
console.log('retired_systems=PROSE->DOCUMENTS');
console.log('hierarchy=SYSTEM_MASTER>{CORE,LEARNING,BOOK,DOCUMENTS}');
console.log(`open_obligations_registered=${(obligations.obligations || []).filter((item) => item.state !== 'CLOSED' && item.state !== 'SUPERSEDED').length}`);
console.log(`a01_workstream_ids_mapped=${workstreams.size}`);
