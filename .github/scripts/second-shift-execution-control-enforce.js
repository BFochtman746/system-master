#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function fail(message) {
  throw new Error(`SECOND_SHIFT_EXECUTION_CONTROL_DRIFT: ${message}`);
}

function exactSet(label, actual, expected) {
  if (!Array.isArray(actual)) fail(`${label} must be an array`);
  const a = [...new Set(actual)].sort();
  const e = [...new Set(expected)].sort();
  if (a.length !== actual.length) fail(`${label} contains duplicate lanes`);
  if (JSON.stringify(a) !== JSON.stringify(e)) {
    fail(`${label} mismatch; expected=${JSON.stringify(e)} actual=${JSON.stringify(a)}`);
  }
}

function extractMachineContract(text) {
  const match = text.match(/<!-- SECOND_SHIFT_MACHINE_CONTRACT_START -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- SECOND_SHIFT_MACHINE_CONTRACT_END -->/);
  if (!match) fail('execution-control machine contract block is missing');
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    fail(`execution-control machine contract is invalid JSON: ${error.message}`);
  }
}

function main() {
  const authority = readJson('governance/CURRENT-AUTHORITY.json');
  if (!authority.topology) fail('CURRENT-AUTHORITY.topology is missing');
  if (!authority.second_shift_registry) fail('CURRENT-AUTHORITY.second_shift_registry is missing');
  if (!authority.second_shift_execution_control) fail('CURRENT-AUTHORITY.second_shift_execution_control is missing');

  const topology = readJson(authority.topology);
  const registry = readJson(authority.second_shift_registry);
  const controlText = readText(authority.second_shift_execution_control);
  const contract = extractMachineContract(controlText);

  const ready = topology.execution_readiness && topology.execution_readiness.execution_ready_peer_system_ids;
  if (!Array.isArray(ready) || ready.length === 0) fail('selected topology has no execution-ready peer set');
  if (ready.length !== 8) fail(`current closure requires exactly eight execution-ready peers; found ${ready.length}`);

  exactSet('topology.peer_system_ids', topology.peer_system_ids, ready);
  exactSet('CURRENT-AUTHORITY.active_peer_execution_lanes', authority.active_peer_execution_lanes, ready);
  exactSet('topology.second_shift_autoprovision_rule.active_peer_set', topology.second_shift_autoprovision_rule && topology.second_shift_autoprovision_rule.active_peer_set, ready);

  if (registry.topology !== authority.topology) {
    fail(`registry topology ${registry.topology} != authority topology ${authority.topology}`);
  }
  if (registry.execution_control !== authority.second_shift_execution_control) {
    fail('registry execution_control does not equal CURRENT-AUTHORITY.second_shift_execution_control');
  }

  const ownerFiles = registry.owner_files || {};
  exactSet('registry.owner_files keys', Object.keys(ownerFiles), ready);
  for (const lane of ready) {
    const ownerPath = ownerFiles[lane];
    if (typeof ownerPath !== 'string' || ownerPath.trim() === '') fail(`owner file is missing for ${lane}`);
    if (!fs.existsSync(path.join(ROOT, ownerPath))) fail(`owner file does not exist for ${lane}: ${ownerPath}`);
  }

  const expectedPeers = registry.auto_provisioning_invariant && registry.auto_provisioning_invariant.expected_active_peers;
  exactSet('registry.auto_provisioning_invariant.expected_active_peers', expectedPeers, ready);

  if (contract.execution_control_id !== 'SECOND-SHIFT-EXECUTION-CONTROL-001') {
    fail(`unexpected execution_control_id ${contract.execution_control_id}`);
  }
  if (contract.topology_id !== topology.topology_id) {
    fail(`contract topology_id ${contract.topology_id} != selected ${topology.topology_id}`);
  }
  if (contract.registry_id !== registry.registry_id) {
    fail(`contract registry_id ${contract.registry_id} != selected ${registry.registry_id}`);
  }
  exactSet('contract.peer_system_ids', contract.peer_system_ids, ready);

  const staleTokens = [
    '4-System Architecture',
    'exactly four peer systems',
    'current active lane set is exactly CORE, LEARNING, BOOK and DOCUMENTS',
    'Active peer ledgers are CORE, LEARNING, BOOK and DOCUMENTS only',
    'SYSTEM-TOPOLOGY-005.json::peer_system_ids'
  ];
  for (const token of staleTokens) {
    if (controlText.includes(token)) fail(`stale four-peer contract token remains: ${token}`);
  }

  const report = {
    status: 'PASS',
    authority_id: authority.authority_id,
    topology_id: topology.topology_id,
    registry_id: registry.registry_id,
    execution_control_id: contract.execution_control_id,
    execution_control_revision: contract.revision,
    execution_ready_peer_system_ids: ready,
    checks: {
      authority_lane_set_matches_topology: true,
      registry_owner_files_match_topology: true,
      registry_expected_peers_match_topology: true,
      owner_files_exist: true,
      machine_contract_matches_topology: true,
      stale_four_peer_tokens_absent: true
    }
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
