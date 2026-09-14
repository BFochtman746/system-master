'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BLUEPRINT_PATH = 'governance/architecture/SYSTEM-MASTER-SYSTEM-INTERFACE-BLUEPRINT-001.json';
const REQUIRED_CLASSES = ['API', 'COMMAND', 'ERROR', 'EVENT', 'QUERY'];
const REQUIRED_SEAMS = [
  'CORE_PROGRAMMING_RUNTIME_VS_ENGINEERING',
  'BOOK_DOCUMENTS_SEMANTICS_VS_ARTIFACT_MECHANICS',
  'PROGRAMMING_CONNECTED_ACTIONS_BUILD_VS_SIDE_EFFECT',
  'LEARNING_CORE_DOMAIN_VS_DURABILITY',
  'BOOK_CORE_SEMANTIC_RECOVERY_VS_PHYSICAL_RECOVERY',
  'RESEARCH_KNOWLEDGE_PROGRAMMING_RESEARCH_VS_ENGINEERING'
];
const REQUIRED_FORBIDDEN = [
  'DIRECT_PEER_STORE_WRITE',
  'DIRECT_PEER_CANONICAL_STORE_READ_WITHOUT_OWNER_PROJECTION_CONTRACT',
  'SHARED_SEMANTIC_TABLE_DUAL_WRITER',
  'CALLER_OWNED_REMOTE_TRANSACTION',
  'CROSS_PEER_DISTRIBUTED_DATABASE_ROLLBACK',
  'EVENT_AS_HIDDEN_COMMAND',
  'QUERY_WITH_DOMAIN_MUTATION_OR_EXTERNAL_SIDE_EFFECT',
  'API_TRANSPORT_IMPLIES_SEMANTIC_OWNERSHIP',
  'ERROR_CODE_REBRANDING_WITHOUT_ORIGIN',
  'CACHE_OR_PROJECTION_AS_CANONICAL_SOURCE',
  'CROSS_PEER_SCHEMA_MUTATION',
  'SEMANTIC_OWNER_BYPASS_THROUGH_LOW_LEVEL_API',
  'TWO_PEERS_REGISTER_SAME_MUTATION_OPERATION',
  'SILENT_FALLBACK_TO_HISTORICAL_P6_OR_MODULE_ALLOCATION',
  'RETIRED_PROSE_OPERATION_NAMESPACE_RESURRECTION'
];

const errors = [];
function fail(message) { errors.push(message); }
function readJson(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) throw new Error(`missing file: ${rel}`);
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}
function setEq(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
function sorted(values) { return [...values].sort(); }
function capKey(c) { return `${c.capability_id}|${c.module_key}`; }

function main() {
  let authority, topology, allocation, crosswalk, blueprint;
  try {
    authority = readJson('governance/CURRENT-AUTHORITY.json');
    topology = readJson(authority.topology);
    allocation = readJson(authority.headless_tool_owner_allocation);
    crosswalk = readJson(authority.capability_crosswalk);
    blueprint = readJson(BLUEPRINT_PATH);
  } catch (error) {
    process.stderr.write(`SYSTEM_INTERFACE_BLUEPRINT_CHECK=FAIL ${error.message}\n`);
    process.exit(2);
  }

  const binding = blueprint.authority_binding || {};
  if (binding.authority_id !== authority.authority_id) fail(`authority id drift: blueprint=${binding.authority_id} live=${authority.authority_id}`);
  if (binding.topology !== authority.topology) fail(`topology pointer drift: blueprint=${binding.topology} live=${authority.topology}`);
  if (binding.allocation !== authority.headless_tool_owner_allocation) fail(`allocation pointer drift: blueprint=${binding.allocation} live=${authority.headless_tool_owner_allocation}`);
  if (binding.capability_crosswalk !== authority.capability_crosswalk) fail(`crosswalk pointer drift: blueprint=${binding.capability_crosswalk} live=${authority.capability_crosswalk}`);
  if (binding.topology_id !== topology.topology_id) fail(`topology id drift: blueprint=${binding.topology_id} live=${topology.topology_id}`);
  if (binding.allocation_id !== allocation.allocation_id) fail(`allocation id drift: blueprint=${binding.allocation_id} live=${allocation.allocation_id}`);
  if (binding.crosswalk_id !== crosswalk.crosswalk_id) fail(`crosswalk id drift: blueprint=${binding.crosswalk_id} live=${crosswalk.crosswalk_id}`);
  if (binding.inventory_authority !== 'CURRENT_AUTHORITY_SELECTED_CAPABILITY_CROSSWALK') fail('inventory authority must be current-authority-selected capability crosswalk');
  if (binding.historical_inventory_fallback !== false) fail('historical inventory fallback must be false');

  const classes = Object.keys(blueprint.interface_classes || {}).sort();
  if (JSON.stringify(classes) !== JSON.stringify(REQUIRED_CLASSES)) fail(`interface classes must be exactly ${REQUIRED_CLASSES.join(',')}; observed=${classes.join(',')}`);

  const topologyPeers = new Set(topology.peer_system_ids || []);
  const blueprintPeersArray = blueprint.peer_systems || [];
  const blueprintPeers = new Set(blueprintPeersArray.map(p => p.system_id));
  if (topologyPeers.size !== 9) fail(`current topology must contain exactly nine peers; observed=${topologyPeers.size}`);
  if (!setEq(topologyPeers, blueprintPeers)) fail(`peer-set drift: topology=${sorted(topologyPeers).join(',')} blueprint=${sorted(blueprintPeers).join(',')}`);
  if (blueprintPeers.has('PROSE')) fail('retired PROSE cannot appear as an active interface peer');
  if ((topology.retired_systems || []).find(r => r.system_id === 'PROSE')?.lifecycle !== 'RETIRED_TERMINAL') fail('Topology must preserve PROSE as RETIRED_TERMINAL');

  const peerByOwner = new Map();
  const opNamespaces = new Set();
  const errorNamespaces = new Set();
  for (const peer of blueprintPeersArray) {
    const expectedOwner = `SYSTEM_MASTER/${peer.system_id}`;
    if (peer.owner_path !== expectedOwner) fail(`owner_path mismatch for ${peer.system_id}: ${peer.owner_path} != ${expectedOwner}`);
    if (peer.canonical_semantic_write_authority !== true) fail(`${peer.system_id} must retain canonical semantic write authority for its owned domain`);
    if (!peer.operation_namespace || opNamespaces.has(peer.operation_namespace)) fail(`missing/duplicate operation namespace for ${peer.system_id}: ${peer.operation_namespace}`);
    if (!peer.error_namespace || errorNamespaces.has(peer.error_namespace)) fail(`missing/duplicate error namespace for ${peer.system_id}: ${peer.error_namespace}`);
    opNamespaces.add(peer.operation_namespace);
    errorNamespaces.add(peer.error_namespace);
    peerByOwner.set(peer.owner_path, peer);
  }

  const expectedByOwner = new Map();
  const ownedCrosswalk = (crosswalk.capability_entries || []).filter(c => c.owner_path && c.module_key);
  for (const cap of ownedCrosswalk) {
    if (!expectedByOwner.has(cap.owner_path)) expectedByOwner.set(cap.owner_path, []);
    expectedByOwner.get(cap.owner_path).push({ capability_id: cap.capability_id, module_key: cap.module_key });
  }

  const observedCapabilityIds = new Set();
  for (const [owner, expectedCaps] of expectedByOwner.entries()) {
    const peer = peerByOwner.get(owner);
    if (!peer) {
      fail(`current crosswalk owner has no blueprint peer: ${owner}`);
      continue;
    }
    const expected = expectedCaps.map(capKey).sort();
    const observed = (peer.owned_capabilities || []).map(capKey).sort();
    if (JSON.stringify(expected) !== JSON.stringify(observed)) fail(`capability projection drift for ${peer.system_id}: expected=${expected.join(',')} observed=${observed.join(',')}`);
    for (const cap of peer.owned_capabilities || []) {
      if (observedCapabilityIds.has(cap.capability_id)) fail(`capability assigned to multiple blueprint peers: ${cap.capability_id}`);
      observedCapabilityIds.add(cap.capability_id);
    }
  }
  for (const peer of blueprintPeersArray) {
    if (!expectedByOwner.has(peer.owner_path) && (peer.owned_capabilities || []).length) fail(`blueprint peer ${peer.system_id} owns capabilities absent from current crosswalk`);
  }
  if (observedCapabilityIds.size !== ownedCrosswalk.length) fail(`owned capability count drift: blueprint=${observedCapabilityIds.size} crosswalk=${ownedCrosswalk.length}`);

  const allocationByModule = new Map((allocation.module_ownership || []).map(m => [m.module_key, m.owner_path]));
  const crosswalkByModule = new Map(ownedCrosswalk.map(c => [c.module_key, c.owner_path]));
  for (const [moduleKey, owner] of crosswalkByModule.entries()) {
    if (allocationByModule.get(moduleKey) !== owner) fail(`allocation/crosswalk owner mismatch for ${moduleKey}: allocation=${allocationByModule.get(moduleKey)} crosswalk=${owner}`);
  }
  for (const [moduleKey, owner] of allocationByModule.entries()) {
    if (crosswalkByModule.get(moduleKey) !== owner) fail(`allocation module absent or differently owned in current crosswalk: ${moduleKey}`);
  }

  const website = (crosswalk.capability_entries || []).find(c => c.capability_id === 'C40');
  if (!website || website.module_key !== 'WEBSITE_BUILDING' || website.owner_path !== 'SYSTEM_MASTER/PROGRAMMING') fail('C40 WEBSITE_BUILDING must remain PROGRAMMING-owned');
  if (topologyPeers.has('WEBSITE_BUILDING')) fail('WEBSITE_BUILDING cannot be a peer system');

  const dbAuthorities = blueprint.system_database_authority || [];
  const dbPeerSet = new Set(dbAuthorities.map(x => x.system_id));
  if (!setEq(dbPeerSet, topologyPeers)) fail('database-authority records must cover exactly all nine active peers');
  for (const entry of dbAuthorities) {
    if (entry.may_write_other_peer_semantic_state !== false) fail(`${entry.system_id} must explicitly forbid writes to another peer's semantic state`);
  }

  const pair = blueprint.peer_pair_default_policy || {};
  if (pair.scope !== 'ALL_ORDERED_PAIRS_OF_DISTINCT_ACTIVE_PEERS') fail('peer-pair policy must apply to all ordered pairs of distinct active peers');
  const pairClasses = [...(pair.allowed_interface_classes || [])].sort();
  if (JSON.stringify(pairClasses) !== JSON.stringify(REQUIRED_CLASSES)) fail(`peer-pair classes must be exactly ${REQUIRED_CLASSES.join(',')}`);
  for (const key of ['direct_store_read','direct_store_write','shared_semantic_table_dual_writer','cross_peer_transaction','query_side_effects','event_as_hidden_command','semantic_authority_transfer']) {
    if (pair[key] !== false) fail(`peer-pair policy must set ${key}=false`);
  }
  if (pair.origin_error_identity_preserved !== true) fail('peer-pair policy must preserve originating error identity');
  const expectedPairCount = topologyPeers.size * (topologyPeers.size - 1);
  const coverage = blueprint.peer_pair_coverage || {};
  if (coverage.mode !== 'COMPLETE_CARTESIAN_DEFAULT_PLUS_NAMED_SEAMS') fail('peer-pair coverage must be complete cartesian default plus named seams');
  if (coverage.ordered_pair_count !== expectedPairCount) fail(`peer-pair coverage count drift: blueprint=${coverage.ordered_pair_count} expected=${expectedPairCount}`);
  if (coverage.self_pairs_excluded !== true) fail('peer-pair coverage must exclude self pairs');

  const seamIds = new Set((blueprint.known_seams || []).map(s => s.seam_id));
  for (const seam of REQUIRED_SEAMS) if (!seamIds.has(seam)) fail(`required ownership seam missing: ${seam}`);
  for (const seam of blueprint.known_seams || []) {
    const systems = seam.systems || [];
    if (systems.length !== 2 || systems.some(s => !topologyPeers.has(s))) fail(`invalid seam peer membership: ${seam.seam_id}`);
  }

  const forbidden = new Set(blueprint.forbidden_behaviors || []);
  for (const behavior of REQUIRED_FORBIDDEN) if (!forbidden.has(behavior)) fail(`required forbidden behavior missing: ${behavior}`);

  const fields = blueprint.operation_contract_required_fields || {};
  for (const required of ['operation_id','interface_class','semantic_owner_system','contract_version']) if (!(fields.all || []).includes(required)) fail(`operation contract missing required all-field: ${required}`);
  if (!(fields.cross_peer || []).includes('correlation_id')) fail('cross-peer operation contracts must require correlation_id');
  if (!(fields.command || []).includes('idempotency_identity')) fail('cross-peer commands must require idempotency identity');
  for (const required of ['event_id','origin_system','owner_version_or_sequence','correlation_id','causation_id']) if (!(fields.event || []).includes(required)) fail(`event contract missing required field: ${required}`);
  for (const required of ['origin_system','error_code','category','retryability','correlation_id']) if (!(fields.error || []).includes(required)) fail(`error contract missing required field: ${required}`);

  const compatibility = blueprint.existing_contract_compatibility || [];
  for (const item of compatibility) {
    if (!item.contract_ref || !fs.existsSync(path.join(ROOT, item.contract_ref))) fail(`declared compatibility contract missing: ${item.contract_ref}`);
  }

  if (errors.length) {
    process.stderr.write('SYSTEM_INTERFACE_BLUEPRINT_CHECK=FAIL\n');
    for (const error of errors) process.stderr.write(`- ${error}\n`);
    process.exit(1);
  }

  process.stdout.write(`SYSTEM_INTERFACE_BLUEPRINT_CHECK=PASS peers=${topologyPeers.size} owned_capabilities=${ownedCrosswalk.length} ordered_pairs=${expectedPairCount} classes=${REQUIRED_CLASSES.join(',')} crosswalk=${crosswalk.crosswalk_id}\n`);
}

main();
