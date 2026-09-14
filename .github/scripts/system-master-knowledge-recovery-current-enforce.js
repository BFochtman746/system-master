'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(path.join(__dirname, '..', '..'));
const EVIDENCE_DIR = path.resolve(process.env.A01_EVIDENCE_DIR || path.join(ROOT, 'build', 'evidence', 'knowledge-recovery-current-authority'));

const EXPECTED_PEERS = [
  'CORE',
  'LEARNING',
  'BOOK',
  'DOCUMENTS',
  'SPREADSHEET_DATA',
  'MEDIA',
  'CONNECTED_ACTIONS',
  'RESEARCH_KNOWLEDGE',
  'PROGRAMMING'
].sort();

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
function readText(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function sameMembers(actual, expected) {
  const a = [...actual].sort();
  const b = [...expected].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function writeJson(name, value) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIR, name), `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const authority = readJson('governance/CURRENT-AUTHORITY.json');
  assert(authority.authority_id === 'CURRENT-AUTHORITY-005', 'EXPECTED_CURRENT_AUTHORITY_005');
  assert(authority.topology === 'governance/SYSTEM-TOPOLOGY-007.json', 'EXPECTED_TOPOLOGY_007_POINTER');
  assert(authority.knowledge_recovery_control === 'governance/knowledge-recovery/SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001.md', 'EXPECTED_CURRENT_KNOWLEDGE_RECOVERY_CONTROL');
  assert(authority.knowledge_recovery_prior_control === 'governance/knowledge-recovery/SYSTEM-MASTER-KNOWLEDGE-RECOVERY-002.md', 'EXPECTED_PRIOR_KNOWLEDGE_RECOVERY_CONTROL');
  assert(authority.knowledge_recovery_prior_control_current_effect === 'SUPERSEDED_FOR_PRIORITY_AND_TOPOLOGY_BY_CURRENT_AUTHORITY_005', 'EXPECTED_PRIOR_CONTROL_SUPERSESSION');
  assert(authority.highest_discretionary_objective === 'SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001', 'EXPECTED_KNOWLEDGE_RECOVERY_PRIORITY');

  const topology = readJson(authority.topology);
  assert(topology.topology_id === 'SYSTEM-TOPOLOGY-007', 'EXPECTED_TOPOLOGY_007');
  assert(sameMembers(topology.peer_system_ids || [], EXPECTED_PEERS), 'EXPECTED_NINE_PEER_SET');
  assert(sameMembers((topology.execution_readiness || {}).execution_ready_peer_system_ids || [], EXPECTED_PEERS), 'EXPECTED_NINE_EXECUTION_READY_PEERS');
  assert((topology.child_system_ids || []).length === 0, 'ACTIVE_CHILD_SYSTEMS_FORBIDDEN');

  const bySystem = Object.fromEntries((topology.canonical_internal_systems || []).map((system) => [system.system_id, system]));
  assert(bySystem.PROGRAMMING, 'PROGRAMMING_ACTIVE_PEER_REQUIRED');
  assert(bySystem.PROGRAMMING.parent_id === 'SYSTEM_MASTER', 'PROGRAMMING_PARENT');
  assert(bySystem.PROGRAMMING.completion === 'INCOMPLETE', 'PROGRAMMING_INCOMPLETE');
  assert((bySystem.PROGRAMMING.owns_modules || []).includes('WEBSITE_BUILDING'), 'PROGRAMMING_MUST_OWN_WEBSITE_BUILDING');
  assert(!bySystem.PROSE, 'PROSE_MUST_NOT_BE_ACTIVE_SYSTEM');
  assert((topology.explicit_non_systems || {}).WEBSITE_BUILDING === 'PROGRAMMING_CAPABILITY_NOT_PEER_SYSTEM', 'WEBSITE_BUILDING_MUST_NOT_BE_PEER');

  const retiredProse = (topology.retired_systems || []).find((system) => system.system_id === 'PROSE');
  assert(retiredProse && retiredProse.lifecycle === 'RETIRED_TERMINAL', 'PROSE_TERMINAL_RETIREMENT_REQUIRED');
  assert(retiredProse.current_execution_lane === null, 'PROSE_EXECUTION_LANE_FORBIDDEN');
  assert(retiredProse.current_qualification_lane === null, 'PROSE_QUALIFICATION_LANE_FORBIDDEN');
  assert(retiredProse.successor_system === null, 'PROSE_SUCCESSOR_FORBIDDEN');

  const completion = readJson(authority.system_completion_status);
  const programmingCompletion = (completion.systems || []).find((system) => system.system_id === 'PROGRAMMING');
  assert(programmingCompletion && programmingCompletion.complete === false, 'PROGRAMMING_COMPLETION_TRUTH');
  const completionProse = (completion.retired_systems || []).find((system) => system.system_id === 'PROSE');
  assert(completionProse && completionProse.active === false && completionProse.complete === true, 'PROSE_COMPLETION_TRUTH');

  const obligations = readJson(authority.obligation_registry);
  assert(obligations.topology === authority.topology, 'OBLIGATION_TOPOLOGY_POINTER');
  const knowledgeRecovery = (obligations.obligations || []).find((item) => item.obligation_id === 'SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001');
  assert(knowledgeRecovery && knowledgeRecovery.owner_path === 'SYSTEM_MASTER/CORE', 'KNOWLEDGE_RECOVERY_CORE_SUPPORT_OWNER');
  const programmingContinuation = (obligations.obligations || []).find((item) => item.obligation_id === 'PROGRAMMING-WORK-PROGRAM-CONTINUATION-001');
  assert(programmingContinuation && programmingContinuation.owner_path === 'SYSTEM_MASTER/PROGRAMMING', 'PROGRAMMING_CONTINUATION_OWNER');

  const crosswalk = readJson(authority.capability_crosswalk);
  const c40 = (crosswalk.capability_entries || []).find((entry) => entry.capability_id === 'C40');
  assert(c40 && c40.module_key === 'WEBSITE_BUILDING', 'C40_WEBSITE_BUILDING_REQUIRED');
  assert(c40.owner_path === 'SYSTEM_MASTER/PROGRAMMING', 'C40_PROGRAMMING_OWNER_REQUIRED');
  assert(String(c40.disposition || '').includes('NOT_PEER_SYSTEM'), 'C40_MUST_NOT_BE_PEER');

  const packet = readJson(authority.programming_system_packet);
  assert(packet.system_id === 'PROGRAMMING', 'PROGRAMMING_PACKET_SYSTEM_ID');
  assert(packet.architecture_authority === true, 'PROGRAMMING_PACKET_CURRENT_AUTHORITY');
  assert(String(packet.lifecycle || '').startsWith('ACTIVE_INCOMPLETE_PEER_SYSTEM'), 'PROGRAMMING_PACKET_ACTIVE_LIFECYCLE');
  const packetC40 = (packet.owned_capabilities || []).find((entry) => entry.capability_id === 'C40');
  assert(packetC40 && packetC40.module_key === 'WEBSITE_BUILDING', 'PROGRAMMING_PACKET_C40');

  const controlText = readText(authority.knowledge_recovery_control);
  assert(controlText.includes('SYSTEM-TOPOLOGY-007'), 'KNOWLEDGE_RECOVERY_CONTROL_TOPOLOGY_007');
  assert(controlText.includes('nine active peer systems'), 'KNOWLEDGE_RECOVERY_CONTROL_NINE_PEERS');
  assert(controlText.includes('PROGRAMMING') && controlText.includes('admitted peer'), 'KNOWLEDGE_RECOVERY_CONTROL_PROGRAMMING_ADMISSION');
  assert(controlText.includes('Manifest 003') && controlText.includes('historical predecessor'), 'KNOWLEDGE_RECOVERY_CONTROL_MANIFEST_003_LINEAGE');

  const acceptance = readJson(authority.knowledge_recovery_supervised_acceptance);
  assert(acceptance.subject && acceptance.subject.sha === '4a2d4f7168f48728ef67d187ff43afb97c9568d9', 'HISTORICAL_ACCEPTANCE_SUBJECT_SHA');
  assert(acceptance.subject.manifest_id === 'PROGRAMMING-INGEST-MANIFEST-002', 'HISTORICAL_ACCEPTANCE_MANIFEST_002');
  assert(acceptance.subject.topology_id === 'SYSTEM-TOPOLOGY-004', 'HISTORICAL_ACCEPTANCE_TOPOLOGY_004');
  assert(acceptance.programming_system_promoted === false, 'HISTORICAL_ACCEPTANCE_NO_PROGRAMMING_PROMOTION');
  assert(acceptance.architecture_authority === false, 'HISTORICAL_ACCEPTANCE_NO_ARCHITECTURE_AUTHORITY');

  const manifest3 = readJson('governance/catalog/ingest/programming/PROGRAMMING-INGEST-MANIFEST-003.json');
  assert(manifest3.manifest_id === 'PROGRAMMING-INGEST-MANIFEST-003', 'MANIFEST_003_ID');
  assert(manifest3.extends_manifest === 'governance/catalog/ingest/programming/PROGRAMMING-INGEST-MANIFEST-002.json', 'MANIFEST_003_EXTENDS_002');
  assert((manifest3.preserves_historical_manifests || []).includes('governance/catalog/ingest/programming/PROGRAMMING-INGEST-MANIFEST-001.json'), 'MANIFEST_003_PRESERVES_001');
  assert((manifest3.preserves_historical_manifests || []).includes('governance/catalog/ingest/programming/PROGRAMMING-INGEST-MANIFEST-002.json'), 'MANIFEST_003_PRESERVES_002');
  assert(manifest3.lineage && manifest3.lineage.pass_transfer_to_manifest_003 === false, 'MANIFEST_003_PASS_TRANSFER_FORBIDDEN');
  assert(manifest3.architecture_authority === false, 'MANIFEST_003_NO_ARCHITECTURE_AUTHORITY');

  const report = {
    report_id: 'SYSTEM-MASTER-KNOWLEDGE-RECOVERY-CURRENT-AUTHORITY-001',
    authority_id: authority.authority_id,
    topology_id: topology.topology_id,
    active_peer_system_ids: [...EXPECTED_PEERS],
    programming: {
      standing: 'ACTIVE_INCOMPLETE_PEER_SYSTEM',
      continuation_owner: 'SYSTEM_MASTER/PROGRAMMING',
      c40: {
        capability_id: 'C40',
        module_key: 'WEBSITE_BUILDING',
        owner_path: c40.owner_path,
        peer_system: false
      }
    },
    knowledge_recovery: {
      objective_id: 'SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001',
      support_owner: knowledgeRecovery.owner_path,
      semantic_effect: 'SOURCE_CUSTODY_AND_PROVENANCE_SUPPORT_ONLY__NO_PROGRAMMING_OWNERSHIP_TRANSFER'
    },
    historical_evidence_lineage: {
      acceptance_subject_sha: acceptance.subject.sha,
      acceptance_manifest_id: acceptance.subject.manifest_id,
      acceptance_topology_id: acceptance.subject.topology_id,
      manifest_003_state: 'HISTORICAL_PREDECESSOR__NO_PASS_TRANSFER__TOPOLOGY_007_SUCCESSOR_REQUIRED_FOR_FRESH_QUALIFICATION'
    },
    prose: {
      standing: 'COMPLETE_RETIRED_TERMINAL',
      active_lane: false
    },
    result: 'PASS'
  };

  writeJson('knowledge-recovery-current-authority.json', report);
  console.log(`SYSTEM_MASTER_KNOWLEDGE_RECOVERY_CURRENT_AUTHORITY=PASS authority=${authority.authority_id} topology=${topology.topology_id} peers=${EXPECTED_PEERS.length}`);
  console.log('WEBSITE_BUILDING=C40 owner=SYSTEM_MASTER/PROGRAMMING peer=false');
  console.log('HISTORICAL_RECEIPT_RELABELING=false');
}

try {
  main();
} catch (error) {
  console.error(`SYSTEM_MASTER_KNOWLEDGE_RECOVERY_CURRENT_AUTHORITY=FAIL ${error.stack || error.message}`);
  process.exit(1);
}
