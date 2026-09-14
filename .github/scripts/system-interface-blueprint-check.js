'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BLUEPRINT_PATH = 'governance/architecture/SYSTEM-MASTER-SYSTEM-INTERFACE-BLUEPRINT-001.json';
const AUTHORITY_PATH = 'governance/CURRENT-AUTHORITY.json';
const INTERFACE_KINDS = ['COMMAND', 'QUERY', 'API', 'EVENT', 'ERROR'];

function readJson(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) fail(`missing ${rel}`);
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (error) {
    fail(`invalid JSON ${rel}: ${error.message}`);
  }
}

function fail(message) {
  process.stderr.write(`SYSTEM_INTERFACE_BLUEPRINT_CHECK=FAIL ${message}\n`);
  process.exit(2);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sorted(values) {
  return [...values].sort();
}

function sameSet(a, b) {
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

function ownerSystem(ownerPath) {
  const prefix = 'SYSTEM_MASTER/';
  assert(typeof ownerPath === 'string' && ownerPath.startsWith(prefix), `invalid owner path ${ownerPath}`);
  return ownerPath.slice(prefix.length);
}

function main() {
  const blueprint = readJson(BLUEPRINT_PATH);
  const authority = readJson(AUTHORITY_PATH);

  assert(blueprint.blueprint_id === 'SYSTEM-MASTER-SYSTEM-INTERFACE-BLUEPRINT-001', 'unexpected blueprint id');
  assert(blueprint.standing === 'CANONICAL_CURRENT_AUTHORITY_COMMAND_QUERY_API_EVENT_ERROR_BOUNDARY_CONTRACT', 'blueprint not canonical');
  assert(authority.authority_id === blueprint.authority_binding.authority_id, 'authority id drift');
  assert(authority.topology === blueprint.authority_binding.topology, 'topology pointer drift');
  assert(authority.headless_tool_owner_allocation === blueprint.authority_binding.allocation, 'allocation pointer drift');
  assert(authority.capability_crosswalk === blueprint.authority_binding.capability_crosswalk, 'crosswalk pointer drift');

  const topology = readJson(authority.topology);
  const allocation = readJson(authority.headless_tool_owner_allocation);
  const crosswalk = readJson(authority.capability_crosswalk);

  assert(topology.topology_id === blueprint.authority_binding.topology_id, 'topology id drift');
  assert(allocation.allocation_id === blueprint.authority_binding.allocation_id, 'allocation id drift');
  assert(crosswalk.crosswalk_id === blueprint.authority_binding.crosswalk_id, 'crosswalk id drift');
  assert(allocation.topology === authority.topology, 'allocation does not bind selected topology');
  assert(crosswalk.allocation === authority.headless_tool_owner_allocation, 'crosswalk does not bind selected allocation');

  const peers = topology.peer_system_ids || [];
  assert(peers.length === 9, `expected exactly 9 peers, got ${peers.length}`);
  assert(new Set(peers).size === peers.length, 'duplicate topology peer');
  assert(!peers.includes('PROSE'), 'retired PROSE appears as peer');
  assert(sameSet(peers, blueprint.peer_systems || []), 'blueprint peer inventory differs from selected topology');
  assert((blueprint.peer_systems || []).length === 9, 'blueprint must declare exactly 9 peers');

  const coverage = blueprint.pair_boundary_coverage || {};
  const directedBoundaryCount = peers.length * (peers.length - 1);
  assert(coverage.mode === 'COMPLETE_DIRECTED_GRAPH', 'pair coverage must be COMPLETE_DIRECTED_GRAPH');
  assert(coverage.peer_count === peers.length, 'pair coverage peer count drift');
  assert(coverage.expected_directed_boundaries === directedBoundaryCount, `directed boundary count must be ${directedBoundaryCount}`);
  assert(coverage.default_boundary?.direct_database_access === false, 'direct cross-peer database access must be forbidden');
  assert(coverage.default_boundary?.semantic_write_rule === 'PROVIDER_OWNED_STATE_ONLY', 'cross-peer write rule must retain provider ownership');
  assert(coverage.default_boundary?.authority_transfer === false, 'interface calls may not transfer authority');
  assert(sameSet(coverage.default_boundary?.allowed_interface_kinds || [], INTERFACE_KINDS), 'all five interface kinds must be classified');

  const kinds = blueprint.interface_kinds || {};
  assert(sameSet(Object.keys(kinds), INTERFACE_KINDS), 'interface kind set must be COMMAND/QUERY/API/EVENT/ERROR exactly');
  assert(kinds.COMMAND.mutation === true, 'COMMAND must be mutating');
  assert(kinds.QUERY.mutation === false, 'QUERY must be read-only');
  assert(kinds.API.mutation === 'DERIVED', 'API mutation semantics must derive from COMMAND/QUERY');
  assert(kinds.EVENT.mutation === false, 'EVENT must be a fact, not a mutation request');
  assert(kinds.ERROR.mutation === false, 'ERROR must not mutate state');

  const db = blueprint.database_and_state_ownership || {};
  assert(db.semantic_store_owner_count === 1, 'every semantic store must have exactly one owner');
  assert(db.direct_cross_peer_database_access === false, 'direct cross-peer database access enabled');
  assert(db.cross_peer_foreign_writes === false, 'foreign writes enabled');
  assert(db.cross_peer_private_schema_reads === false, 'private peer schema reads enabled');
  assert(db.physical_persistence_mechanics_owner === 'CORE', 'CORE must remain generic physical persistence mechanics owner');
  assert(db.physical_persistence_does_not_transfer_semantic_ownership === true, 'physical persistence must not transfer semantic ownership');

  const profiles = blueprint.system_profiles || [];
  assert(profiles.length === peers.length, `expected ${peers.length} system profiles, got ${profiles.length}`);
  assert(new Set(profiles.map((p) => p.system_id)).size === profiles.length, 'duplicate system profile');
  assert(sameSet(profiles.map((p) => p.system_id), peers), 'system profiles do not cover exact peer set');

  for (const profile of profiles) {
    const id = profile.system_id;
    assert(profile.owner_path === `SYSTEM_MASTER/${id}`, `${id} owner path mismatch`);
    assert(profile.operation_namespace === `${id}.`, `${id} operation namespace mismatch`);
    assert(profile.error_namespace === `${id}.ERROR.`, `${id} error namespace mismatch`);
    assert(profile.semantic_database_namespace === `${id.toLowerCase()}.*`, `${id} database namespace mismatch`);
    assert(profile.capability_authority === 'CURRENT_CROSSWALK', `${id} capability authority must be CURRENT_CROSSWALK`);
  }

  const allocationByModule = new Map();
  for (const row of allocation.module_ownership || []) {
    assert(!allocationByModule.has(row.module_key), `duplicate allocation module ${row.module_key}`);
    allocationByModule.set(row.module_key, row.owner_path);
  }

  const ownedCapabilities = (crosswalk.capability_entries || []).filter((row) => row.owner_path);
  const crosswalkByModule = new Map();
  const capabilityIds = new Set();
  for (const row of ownedCapabilities) {
    assert(!crosswalkByModule.has(row.module_key), `duplicate crosswalk module ${row.module_key}`);
    assert(!capabilityIds.has(row.capability_id), `duplicate crosswalk capability id ${row.capability_id}`);
    crosswalkByModule.set(row.module_key, row.owner_path);
    capabilityIds.add(row.capability_id);
    assert(peers.includes(ownerSystem(row.owner_path)), `capability ${row.module_key} owned outside current peer set`);
    assert(allocationByModule.get(row.module_key) === row.owner_path, `allocation/crosswalk owner mismatch for ${row.module_key}`);
  }
  for (const [moduleKey, ownerPath] of allocationByModule.entries()) {
    assert(crosswalkByModule.get(moduleKey) === ownerPath, `allocation module ${moduleKey} missing or mismatched in current crosswalk`);
  }

  const ownedModulesBySystem = new Map(peers.map((peer) => [peer, []]));
  for (const row of ownedCapabilities) ownedModulesBySystem.get(ownerSystem(row.owner_path)).push(row.module_key);
  for (const peer of peers) {
    assert((ownedModulesBySystem.get(peer) || []).length > 0, `peer ${peer} has no current owned capability`);
  }

  const ownerFor = (moduleKey) => crosswalkByModule.get(moduleKey);
  assert(ownerFor('CURRICULUM') === 'SYSTEM_MASTER/LEARNING', 'CURRICULUM must remain LEARNING-owned');
  assert(ownerFor('LEARNING') === 'SYSTEM_MASTER/LEARNING', 'LEARNING capability must remain LEARNING-owned');
  assert(ownerFor('MANUSCRIPT') === 'SYSTEM_MASTER/BOOK', 'MANUSCRIPT must remain BOOK-owned');
  assert(ownerFor('STORYBIBLE') === 'SYSTEM_MASTER/BOOK', 'STORYBIBLE must remain BOOK-owned');
  assert(ownerFor('WRITING') === 'SYSTEM_MASTER/BOOK', 'WRITING must remain BOOK-owned');
  for (const key of ['DOCX', 'PDF', 'PPTX', 'OCR', 'FILE', 'IMG-INGEST']) assert(ownerFor(key) === 'SYSTEM_MASTER/DOCUMENTS', `${key} must remain DOCUMENTS-owned`);
  assert(ownerFor('WEBSITE_BUILDING') === 'SYSTEM_MASTER/PROGRAMMING', 'Website Building must remain PROGRAMMING-owned');
  assert(ownerFor('BROWSER') === 'SYSTEM_MASTER/CONNECTED_ACTIONS', 'BROWSER must remain CONNECTED_ACTIONS-owned');
  assert(ownerFor('RESEARCH') === 'SYSTEM_MASTER/RESEARCH_KNOWLEDGE', 'RESEARCH must remain RESEARCH_KNOWLEDGE-owned');

  const frozen = blueprint.frozen_high_risk_boundaries || {};
  const learning = frozen.learning_curriculum_experience_shared || {};
  assert(learning.peer_owner === 'LEARNING', 'Learning/Curriculum peer owner drift');
  assert(learning.curriculum_internal_owner === 'CURRICULUM', 'Curriculum internal owner drift');
  assert(learning.learning_internal_owner === 'LEARNING', 'Learning internal owner drift');
  assert(learning.presentation_owner === 'CORE/EXPERIENCE', 'Experience presentation owner drift');
  assert(learning.shared_mechanics_owner === 'CORE', 'Learning shared mechanics owner drift');
  assert(learning.learning_may_create_qualification_evidence === true, 'Learning qualification evidence authority lost');
  assert(learning.learning_may_decide_employment_eligibility === false, 'Learning must never decide employment eligibility');

  assert(frozen.book_documents?.semantic_content_owner === 'BOOK', 'Book semantic content owner drift');
  assert(frozen.book_documents?.generic_document_mechanics_owner === 'DOCUMENTS', 'Documents mechanics owner drift');
  assert(frozen.programming_connected_actions?.software_owner === 'PROGRAMMING', 'Programming owner drift');
  assert(frozen.programming_connected_actions?.external_action_owner === 'CONNECTED_ACTIONS', 'Connected Actions side-effect owner drift');
  assert(frozen.research_core?.research_semantics_owner === 'RESEARCH_KNOWLEDGE', 'Research semantics owner drift');
  assert(frozen.research_core?.generic_research_infrastructure_owner === 'CORE', 'Research infrastructure owner drift');
  assert(frozen.core_peer_persistence?.physical_mechanics_owner === 'CORE', 'CORE persistence mechanics owner drift');
  assert(frozen.core_peer_persistence?.semantic_owner === 'EACH_PEER_FOR_ITS_OWN_STATE', 'peer semantic persistence owner drift');
  assert(frozen.prose_retirement?.active_peer === false, 'PROSE cannot become active peer');
  assert(frozen.prose_retirement?.active_interface_provider === false, 'PROSE cannot provide current interfaces');
  assert(frozen.prose_retirement?.active_interface_consumer === false, 'PROSE cannot consume current interfaces');
  assert(frozen.website_building?.capability_id === 'C40', 'Website Building capability id drift');
  assert(frozen.website_building?.semantic_owner === 'PROGRAMMING', 'Website Building semantic owner drift');
  assert(frozen.website_building?.peer_system === false, 'Website Building cannot become a peer');

  const connected = profiles.find((p) => p.system_id === 'CONNECTED_ACTIONS');
  assert(connected.explicit_user_authority_required_for_external_side_effects === true, 'Connected Actions external side effects must require explicit user authority');

  const op = blueprint.operation_identity || {};
  assert(op.format === '<PROVIDER>.<DOMAIN>.<KIND>.<OPERATION_NAME>', 'operation identity format drift');
  assert(op.unregistered_cross_peer_operation === 'FORBIDDEN', 'unregistered cross-peer operations must be forbidden');

  process.stdout.write(
    `SYSTEM_INTERFACE_BLUEPRINT_CHECK=PASS peers=${peers.length} directed_boundaries=${directedBoundaryCount} ` +
    `capabilities=${ownedCapabilities.length} kinds=${INTERFACE_KINDS.join(',')} crosswalk=${crosswalk.crosswalk_id}\n`
  );
}

main();
