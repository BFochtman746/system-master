'use strict';

const fs = require('fs');
const path = require('path');

function fail(message) {
  throw new Error(`ROOT_REGISTRY_LEGACY_MIGRATION_FAIL:${message}`);
}

function readJson(root, rel) {
  const full = path.join(root, ...rel.split('/'));
  if (!fs.existsSync(full)) fail(`missing ${rel}`);
  return JSON.parse(fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, ''));
}

function enc(value) {
  if (value === null || value === undefined) fail('cannot encode null field');
  return Buffer.from(String(value), 'utf8').toString('base64url');
}

function row(type, ...fields) {
  return [type, ...fields.map(enc)].join('\t');
}

if (process.argv.length !== 6) {
  fail('usage: <legacy-repo-root> <output-manifest> <component-version> <component-control-ref>');
}

const legacyRoot = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const componentVersion = process.argv[4];
const componentControlRef = process.argv[5];
const authority = readJson(legacyRoot, 'governance/CURRENT-AUTHORITY.json');
const topology = readJson(legacyRoot, authority.topology);
const catalog = readJson(legacyRoot, authority.system_catalog);

if (authority.product_root !== 'SYSTEM_MASTER') fail('current authority product root is not SYSTEM_MASTER');
if (topology.product_root?.product_id !== authority.product_root) fail('topology product root mismatch');
if (!Array.isArray(authority.active_peer_execution_lanes)) fail('missing active_peer_execution_lanes');
if (!Array.isArray(authority.retired_systems)) fail('missing retired_systems');

const active = new Map((topology.canonical_internal_systems || []).map(s => [s.system_id, s]));
const activeIds = [...active.keys()].sort();
const expectedActive = [...authority.active_peer_execution_lanes].sort();
if (JSON.stringify(activeIds) !== JSON.stringify(expectedActive)) fail(`active peer mismatch:${activeIds.join(',')}:${expectedActive.join(',')}`);

const retired = new Map((topology.retired_systems || []).map(s => [s.system_id, s]));
const retiredIds = [...retired.keys()].sort();
const expectedRetired = [...authority.retired_systems].sort();
if (JSON.stringify(retiredIds) !== JSON.stringify(expectedRetired)) fail(`retired system mismatch:${retiredIds.join(',')}:${expectedRetired.join(',')}`);

const catalogActive = new Map((catalog.active_peer_systems || []).map(s => [s.system_id, s]));
for (const id of expectedActive) {
  const t = active.get(id);
  const c = catalogActive.get(id);
  if (!c) fail(`catalog missing active peer ${id}`);
  if (c.owner_path !== `${authority.product_root}/${id}`) fail(`catalog owner path mismatch ${id}`);
  if (c.control_ref !== t.control_ref) fail(`catalog control ref mismatch ${id}`);
}

const lines = ['# SYSTEM MASTER Root Authority Registry bootstrap manifest v1'];
lines.push(row('ROOT', topology.product_root.product_id, topology.product_root.canonical_name, topology.topology_id));
for (const id of expectedActive) {
  const s = active.get(id);
  lines.push(row('SYSTEM', s.system_id, s.canonical_name, s.classification, s.parent_id,
    s.control_record || s.control_ref, s.control_ref, 'ACTIVE'));
  lines.push(row('EXPECT_ACTIVE_PEER', id));
}

for (const id of expectedRetired) {
  const s = retired.get(id);
  const ownerParts = String(s.historical_owner_path || '').split('/').filter(Boolean);
  if (ownerParts.length < 3 || ownerParts.at(-1) !== id || ownerParts[0] !== authority.product_root) {
    fail(`invalid historical owner path for ${id}`);
  }
  const parentId = ownerParts.at(-2);
  if (!active.has(parentId)) fail(`retired parent is not an active admitted system:${id}:${parentId}`);
  lines.push(row('SYSTEM', id, `${id} SYSTEM`, 'HISTORICAL_RETIRED_SYSTEM', parentId,
    s.retirement_record, s.historical_control_ref, 'RETIRED_TERMINAL'));
  lines.push(row('EXPECT_RETIRED', id));
}

const rootSystemId = 'ROOT_AUTHORITY_REGISTRY';
if (!active.has('CORE')) fail('CORE is required to own Root Authority Registry component');
lines.push(row('SYSTEM', rootSystemId, 'SYSTEM ROOT & AUTHORITY REGISTRY', 'FOUNDATION_SPINE_SHARED_SYSTEM',
  'CORE', componentVersion, componentControlRef, 'ACTIVE'));
lines.push(row('AUTHORITY', 'PRODUCT-AUTHORITY-SELECTOR', 'Product authority selector', rootSystemId,
  'governance/CURRENT-AUTHORITY.json', 'ACTIVE'));
lines.push(row('AUTHORITY', 'SYSTEM-TOPOLOGY', 'System topology authority', rootSystemId,
  authority.topology, 'ACTIVE'));

for (const candidate of catalog.future_system_candidates || []) {
  if (active.has(candidate.candidate_id) || retired.has(candidate.candidate_id)) {
    fail(`catalog candidate collides with admitted or retired system:${candidate.candidate_id}`);
  }
  lines.push(row('EXPECT_NOT_ADMITTED', candidate.candidate_id));
}
for (const program of catalog.active_non_peer_work_programs || []) {
  if (program.peer_topology_status === 'NOT_ADMITTED') lines.push(row('EXPECT_NOT_ADMITTED', program.program_id));
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${lines.join('\n')}\n`, 'utf8');
console.log('ROOT_REGISTRY_LEGACY_MIGRATION_MANIFEST_PASS');
console.log(`topology=${topology.topology_id}`);
console.log(`active_peers=${expectedActive.join(',')}`);
console.log(`retired=${expectedRetired.join(',')}`);
console.log(`output=${output}`);
