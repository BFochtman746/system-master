'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const topologyPath = path.join(root, 'governance', 'SYSTEM-TOPOLOGY-001.json');
const registryPath = path.join(root, 'qualification', 'a01', 'registry.json');
const expected = new Set(['MASTER', 'LEARNING', 'BOOK', 'PROSE']);
const expectedParent = { MASTER: null, LEARNING: null, BOOK: null, PROSE: 'BOOK' };

function fail(message) {
  console.error(`SYSTEM_TOPOLOGY_ERROR: ${message}`);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const topology = readJson(topologyPath);
const systems = topology.systems || [];
const ids = systems.map((entry) => entry.system_id);
const idSet = new Set(ids);

if (topology.system_cardinality !== 4) fail('system_cardinality must equal 4');
if (systems.length !== 4 || idSet.size !== 4 || [...expected].some((id) => !idSet.has(id))) {
  fail(`canonical systems must be exactly MASTER, LEARNING, BOOK, PROSE; got ${ids.join(',')}`);
}

const byId = Object.fromEntries(systems.map((entry) => [entry.system_id, entry]));
for (const id of expected) {
  if (byId[id].parent_system_id !== expectedParent[id]) fail(`${id} parent is invalid`);
  if (!byId[id].control_ref || !byId[id].control_record) fail(`${id} must declare control_ref and control_record`);
}

if (topology.reserved_word !== 'SYSTEM') fail('SYSTEM must remain the reserved architecture word');

const creation = topology.system_creation_rule || {};
for (const flag of [
  'implicit_creation_forbidden',
  'branch_name_cannot_create_system',
  'workstream_id_cannot_create_system',
  'chat_or_task_title_cannot_create_system',
  'qualification_id_cannot_create_system'
]) {
  if (creation[flag] !== true) fail(`system creation guard ${flag} must remain true`);
}

const laneMap = topology.execution_lane_owner_map || {};
for (const [lane, owner] of Object.entries(laneMap)) {
  if (!expected.has(owner)) fail(`execution lane ${lane} maps to unknown system ${owner}`);
}

const registry = readJson(registryPath);
const workstreams = new Set(
  Object.values(registry.qualifications || {})
    .map((entry) => entry.workstream_id)
    .filter(Boolean)
);
const unmapped = [...workstreams].filter((id) => !laneMap[id]).sort();
if (unmapped.length) fail(`A-01 workstream IDs lack four-system ownership mapping: ${unmapped.join(', ')}`);

const explicitNonSystems = topology.explicit_non_systems || {};
for (const name of ['A-01', 'ASSURANCE', 'RECONCILIATION', 'CONTINUITY', 'BOOK EVALUATOR', 'LITERARY PROSE ENGINE', 'NIGHT SHIFT', 'QUALIFICATION', 'RUNNER']) {
  if (!Object.prototype.hasOwnProperty.call(explicitNonSystems, name)) fail(`required non-system classification missing: ${name}`);
}

console.log('SYSTEM_TOPOLOGY_PASS');
console.log('canonical_systems=MASTER,LEARNING,BOOK,PROSE');
console.log('system_cardinality=4');
console.log(`a01_workstream_ids_mapped=${workstreams.size}`);
