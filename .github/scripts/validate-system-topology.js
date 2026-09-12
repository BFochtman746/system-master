'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const authorityPath = path.join(root, 'governance', 'CURRENT-AUTHORITY.json');
const registryPath = path.join(root, 'qualification', 'a01', 'registry.json');
const externalInfrastructurePath = path.join(root, 'governance', 'control-gateway', 'A01-EXTERNAL-INFRASTRUCTURE-WORKSTREAMS.json');
const expectedPeers = new Set(['CORE', 'LEARNING', 'BOOK', 'DOCUMENTS']);

function fail(message) { console.error(`SYSTEM_TOPOLOGY_ERROR: ${message}`); process.exit(1); }
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`cannot read ${path.relative(root, file)}: ${error.message}`); }
}
function requireFile(relative) {
  const file = path.join(root, ...relative.split('/'));
  if (!fs.existsSync(file)) fail(`required authority file missing: ${relative}`);
  return file;
}
function ownerPath(system) { return system.owner_path || `SYSTEM_MASTER/${system.system_id}`; }
function sameOrDescendant(candidate, parent) { return candidate === parent || String(candidate || '').startsWith(`${parent}/`); }
function setEq(a, b) {
  const aa = [...a].sort(), bb = [...b].sort();
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}

const authority = readJson(authorityPath);
if (authority.product_root !== 'SYSTEM_MASTER') fail('CURRENT-AUTHORITY product_root must be SYSTEM_MASTER');
if (authority.topology !== 'governance/SYSTEM-TOPOLOGY-005.json') fail('CURRENT-AUTHORITY must select SYSTEM-TOPOLOGY-005.json');
for (const field of ['program_job_lock', 'system_completion_status', 'completion_ledger', 'obligation_registry', 'expectation_registry', 'reallocation_ledger', 'second_shift_registry']) {
  if (!authority[field]) fail(`CURRENT-AUTHORITY missing ${field}`);
  requireFile(authority[field]);
}

const topology = readJson(requireFile(authority.topology));
if ((topology.product_root || {}).product_id !== 'SYSTEM_MASTER') fail('topology product root must be SYSTEM_MASTER');
if ((topology.product_root || {}).classification !== 'PRODUCT_ROOT__SYSTEM_OF_SYSTEMS') fail('SYSTEM_MASTER must remain PRODUCT_ROOT__SYSTEM_OF_SYSTEMS');
const systems = topology.canonical_internal_systems || [];
const ids = systems.map((entry) => entry.system_id);
if (new Set(ids).size !== systems.length) fail('canonical internal systems contain duplicate system IDs');
if (!setEq(new Set(ids), expectedPeers)) fail('canonical internal systems must be exactly CORE, LEARNING, BOOK, DOCUMENTS');

const byId = Object.fromEntries(systems.map((entry) => [entry.system_id, entry]));
for (const id of expectedPeers) {
  if (byId[id].parent_id !== 'SYSTEM_MASTER') fail(`${id} parent is invalid; expected SYSTEM_MASTER`);
  if (!byId[id].control_ref || !byId[id].control_record) fail(`${id} must declare control_ref and control_record`);
}

const peerIds = new Set(topology.peer_system_ids || []);
if (!setEq(peerIds, expectedPeers)) fail('peer_system_ids must be exactly CORE,LEARNING,BOOK,DOCUMENTS');
if (!Array.isArray(topology.child_system_ids) || topology.child_system_ids.length !== 0) fail('child_system_ids must be empty under terminal Prose retirement');

const retired = topology.retired_systems || [];
const prose = retired.find((entry) => entry.system_id === 'PROSE');
if (!prose) fail('retired_systems must preserve PROSE');
if (prose.lifecycle !== 'RETIRED_TERMINAL' || prose.final_completion !== 'COMPLETE') fail('PROSE must be complete and terminally retired');
if (prose.historical_owner_path !== 'SYSTEM_MASTER/BOOK/PROSE') fail('historical Prose owner path must remain preserved');
for (const field of ['current_execution_lane', 'current_repair_lane', 'current_qualification_lane', 'current_telemetry_lane', 'successor_system']) {
  if (prose[field] !== null) fail(`retired PROSE ${field} must be null`);
}
if (prose.integration_owner !== 'SYSTEM_MASTER/BOOK') fail('any genuinely open completed-Prose integration must be BOOK-owned');
if (systems.some((s) => s.system_id === 'PROSE')) fail('PROSE must not remain an active canonical internal system');

const history = topology.historical_records || {};
if (!history.prose_retirement) fail('Prose retirement record pointer must be preserved');
requireFile(history.prose_retirement);
if (history.prose_child_restoration_current_effect !== 'SUPERSEDED_BY_ADR_0005') fail('ADR-0004 restoration must be superseded by ADR-0005');
if (history.documents_absorption_current_effect !== 'SUPERSEDED_BY_ADR_0005') fail('Documents absorption must be superseded by ADR-0005');

const edges = new Set((topology.hierarchy_edges || []).map((edge) => `${edge[0]}>${edge[1]}`));
for (const edge of ['SYSTEM_MASTER>CORE', 'SYSTEM_MASTER>LEARNING', 'SYSTEM_MASTER>BOOK', 'SYSTEM_MASTER>DOCUMENTS']) if (!edges.has(edge)) fail(`required hierarchy edge missing: ${edge}`);
if ([...edges].some((edge) => edge.endsWith('>PROSE') || edge.startsWith('PROSE>'))) fail('active hierarchy must not contain PROSE');

const creation = topology.creation_rule || {};
for (const flag of ['implicit_system_creation_forbidden', 'branch_name_cannot_create_system', 'workstream_id_cannot_create_system', 'chat_or_task_title_cannot_create_system', 'qualification_id_cannot_create_system', 'new_first_class_system_requires_explicit_user_instruction', 'retired_system_cannot_be_auto_provisioned']) if (creation[flag] !== true) fail(`system creation/retirement guard ${flag} must remain true`);

const laneMap = topology.execution_lane_owner_map || {};
for (const [lane, owner] of Object.entries(laneMap)) if (!expectedPeers.has(owner)) fail(`execution lane ${lane} maps to non-peer owner ${owner}`);
if (laneMap['LITERARY-PROSE']) fail('LITERARY-PROSE must not remain an active execution lane mapping');
if (laneMap['BOOK-EVAL-LEMONADE-001'] !== 'BOOK') fail('BOOK-EVAL historical/current Book work must map to BOOK');
if (!String(topology.legacy_route_dispositions?.['LITERARY-PROSE'] || '').startsWith('RETIRED_NO_DISPATCH')) fail('LITERARY-PROSE must be explicitly retired/no-dispatch');

const externalInfrastructure = readJson(externalInfrastructurePath);
if (externalInfrastructure.schema !== 'control-gateway.a01-external-infrastructure-workstreams.v1') fail('external A-01 infrastructure registry schema mismatch');
if (externalInfrastructure.mission_version !== 'SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0') fail('external A-01 infrastructure registry mission mismatch');
const externalInfrastructureEntries = externalInfrastructure.entries || {};
for (const [workstreamId, entry] of Object.entries(externalInfrastructureEntries)) {
  if (!workstreamId || !entry || typeof entry !== 'object' || Array.isArray(entry)) fail(`external A-01 infrastructure entry ${workstreamId || '<empty>'} is invalid`);
  if (laneMap[workstreamId]) fail(`external A-01 infrastructure ${workstreamId} must not also be a product execution lane`);
  if (expectedPeers.has(workstreamId)) fail(`external A-01 infrastructure ${workstreamId} collides with a canonical product system`);
  if (entry.classification !== 'STANDALONE_EXTERNAL_CONTROL_PLANE_INFRASTRUCTURE') fail(`external A-01 infrastructure ${workstreamId} classification is invalid`);
  if (entry.product_system_owner !== null) fail(`external A-01 infrastructure ${workstreamId} must not claim a System Master product owner`);
  if (entry.a01_qualification_allowed !== true) fail(`external A-01 infrastructure ${workstreamId} must explicitly permit A-01 qualification`);
  if (entry.may_create_product_system !== false || entry.may_inherit_product_execution_lane !== false) fail(`external A-01 infrastructure ${workstreamId} must not create or inherit product-system authority`);
  if (!entry.authority_record || !String(entry.authority_record).startsWith('governance/control-gateway/')) fail(`external A-01 infrastructure ${workstreamId} authority record must stay under governance/control-gateway`);
  requireFile(entry.authority_record);
}

const a01 = readJson(registryPath);
const workstreams = new Set(Object.values(a01.qualifications || {}).map((entry) => entry.workstream_id).filter(Boolean));
const unmapped = [...workstreams].filter((id) => !laneMap[id]
  && !(id === 'LITERARY-PROSE' && String(topology.legacy_route_dispositions?.['LITERARY-PROSE'] || '').startsWith('RETIRED_NO_DISPATCH'))
  && externalInfrastructureEntries[id]?.a01_qualification_allowed !== true).sort();
if (unmapped.length) fail(`A-01 workstream IDs lack current owner mapping, retired disposition, or explicit external-infrastructure authority: ${unmapped.join(', ')}`);

const activeOwnerPaths = new Set(['SYSTEM_MASTER', 'SYSTEM_MASTER/SHARED_INFRASTRUCTURE', 'SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01']);
for (const id of expectedPeers) activeOwnerPaths.add(ownerPath(byId[id]));
const obligations = readJson(requireFile(authority.obligation_registry));
for (const item of obligations.obligations || []) {
  if (!item.obligation_id || !item.owner_path || !item.state) fail('every obligation must declare obligation_id, owner_path and state');
  if (!String(item.owner_path).startsWith('SYSTEM_MASTER')) fail(`obligation ${item.obligation_id} escapes System Master hierarchy`);
  if (sameOrDescendant(item.owner_path, 'SYSTEM_MASTER/BOOK/PROSE')) fail(`current obligation ${item.obligation_id} attempts to use retired PROSE owner path`);
  if (![...activeOwnerPaths].some((p) => sameOrDescendant(item.owner_path, p))) fail(`obligation ${item.obligation_id} has no active topology owner path: ${item.owner_path}`);
  if (item.owner_path === 'SYSTEM_MASTER/DOCUMENTS' && /PROSE/i.test(item.obligation_id)) fail(`Documents obligation cannot be Prose work: ${item.obligation_id}`);
}

const secondShift = readJson(requireFile(authority.second_shift_registry));
const ownerLanes = new Set(Object.keys(secondShift.owner_files || {}));
if (!setEq(ownerLanes, expectedPeers)) fail('Second Shift owner_files must match topology peers exactly');
if ((secondShift.owner_files || {}).PROSE) fail('Second Shift must not schedule a retired PROSE lane');
if ((secondShift.owner_files || {}).SYSTEM_MASTER) fail('Second Shift must not schedule SYSTEM_MASTER root as a peer worker lane');
if (Object.keys(secondShift.coverage_routes || {}).some((prefix) => sameOrDescendant(prefix, 'SYSTEM_MASTER/BOOK/PROSE'))) fail('Second Shift must not route retired Prose through an active lane');
if (secondShift.retired_routes?.PROSE?.dispatchable !== false || secondShift.retired_routes?.PROSE?.auto_provisionable !== false || secondShift.retired_routes?.PROSE?.inherited_execution !== false) fail('Second Shift must preserve retired Prose non-dispatch/non-provision/non-inheritance');

const secondShiftRoot = path.join(root, 'governance', 'second-shift');
const retiredProseActiveSurfaceArtifacts = fs.readdirSync(secondShiftRoot)
  .filter((name) => /^PROSE-.*\.json$/i.test(name));
if (retiredProseActiveSurfaceArtifacts.length) {
  fail(`retired PROSE artifacts must not remain on the active Second Shift control surface; archive them as historical evidence instead: ${retiredProseActiveSurfaceArtifacts.join(', ')}`);
}

const schema = readJson(requireFile(secondShift.utilization_event_schema));
if (!setEq(new Set(schema.allowed_lanes || []), expectedPeers)) fail('telemetry allowed_lanes must match active peers exactly');
if ((schema.allowed_lanes || []).includes('PROSE')) fail('PROSE must not be an active telemetry lane');

const eventRoot = path.join(secondShiftRoot, 'execution-events');
const authorityEffectiveDate = String(authority.effective_date || '');
if (fs.existsSync(eventRoot)) {
  for (const entry of fs.readdirSync(eventRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(entry.name)) continue;
    if (authorityEffectiveDate && entry.name < authorityEffectiveDate) continue;
    if (fs.existsSync(path.join(eventRoot, entry.name, 'PROSE.json'))) {
      fail(`retired PROSE telemetry is forbidden on or after current authority effective date: governance/second-shift/execution-events/${entry.name}/PROSE.json`);
    }
  }
}

console.log('SYSTEM_TOPOLOGY_PASS');
console.log('product_root=SYSTEM_MASTER');
console.log('peer_systems=CORE,LEARNING,BOOK,DOCUMENTS');
console.log('prose_status=COMPLETE_RETIRED_TERMINAL');
console.log('prose_execution=NONE');
console.log('prose_integration_owner_if_open=BOOK');
console.log(`open_obligations_registered=${(obligations.obligations || []).filter((item) => item.state !== 'CLOSED' && item.state !== 'SUPERSEDED').length}`);
console.log(`a01_workstream_ids_adjudicated=${workstreams.size}`);
console.log(`a01_external_infrastructure_workstreams=${Object.keys(externalInfrastructureEntries).length}`);
