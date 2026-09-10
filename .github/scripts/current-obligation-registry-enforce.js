'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');

function fail(message) { console.error(`CURRENT_OBLIGATION_REGISTRY_ENFORCEMENT_FAIL: ${message}`); process.exit(1); }
function readJson(rel) {
  if (!rel || typeof rel !== 'string') fail('registry path is missing');
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) fail(`selected registry does not exist: ${rel}`);
  try { return JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (error) { fail(`invalid JSON ${rel}: ${error.message}`); }
}

const authority = readJson('governance/CURRENT-AUTHORITY.json');
const topology = readJson(authority.topology);
const registry = readJson(authority.obligation_registry);
const obligations = Array.isArray(registry.obligations) ? registry.obligations : fail('selected registry obligations must be an array');
const activeSystems = new Set((topology.canonical_internal_systems || []).map((s) => s.system_id));
const retiredSystems = new Set((topology.retired_systems || []).map((s) => s.system_id));
const activeOwnerPaths = new Set(['SYSTEM_MASTER', ...[...activeSystems].map((id) => `SYSTEM_MASTER/${id}`)]);

function validOwner(ownerPath) {
  if (activeOwnerPaths.has(ownerPath)) return true;
  if (typeof ownerPath === 'string' && ownerPath.startsWith('SYSTEM_MASTER/SHARED_INFRASTRUCTURE')) return true;
  return false;
}

if (!registry.registry_id) fail('selected registry missing registry_id');
if (registry.product_root !== 'SYSTEM_MASTER') fail(`selected registry product_root must be SYSTEM_MASTER, got ${registry.product_root}`);
if (!authority.central_next_objective) fail('CURRENT-AUTHORITY central_next_objective is missing');
if (registry.central_next_objective !== authority.central_next_objective) fail(`central objective mismatch: authority=${authority.central_next_objective} registry=${registry.central_next_objective || '<missing>'}`);

const seen = new Set();
for (const entry of obligations) {
  if (!entry || typeof entry !== 'object') fail('obligation entry must be an object');
  if (!entry.obligation_id) fail('obligation entry missing obligation_id');
  if (seen.has(entry.obligation_id)) fail(`duplicate obligation_id: ${entry.obligation_id}`);
  seen.add(entry.obligation_id);
  if (!validOwner(entry.owner_path)) fail(`invalid or retired owner_path for ${entry.obligation_id}: ${entry.owner_path || '<missing>'}`);
  if (entry.owner_path === 'SYSTEM_MASTER/BOOK/PROSE' || entry.owner_path?.startsWith('SYSTEM_MASTER/BOOK/PROSE/')) fail(`retired PROSE owner used by current obligation: ${entry.obligation_id}`);
  if (!entry.state) fail(`missing state for ${entry.obligation_id}`);
  if (!['CLOSED','SUPERSEDED'].includes(entry.state) && !entry.objective) fail(`open obligation missing objective: ${entry.obligation_id}`);
}

const next = obligations.find((entry) => entry.obligation_id === authority.central_next_objective);
if (!next) fail(`central_next_objective is not present in selected registry: ${authority.central_next_objective}`);
if (!['READY','ACTIVE'].includes(next.state)) fail(`central_next_objective must be READY or ACTIVE, got ${next.state}`);
if (!validOwner(next.owner_path) || next.owner_path === 'SYSTEM_MASTER') fail(`central_next_objective must be assigned to an active executable system owner, got ${next.owner_path}`);

const ownerSystem = String(next.owner_path).split('/')[1];
if (!activeSystems.has(ownerSystem)) fail(`central_next_objective owner is not an active canonical system: ${next.owner_path}`);
if (retiredSystems.has(ownerSystem)) fail(`central_next_objective owner is retired: ${ownerSystem}`);

const closedAtTransition = Array.isArray(registry.closed_at_transition) ? registry.closed_at_transition : [];
const closedIds = new Set();
for (const row of closedAtTransition) {
  if (!row?.obligation_id) fail('closed_at_transition entry missing obligation_id');
  if (closedIds.has(row.obligation_id)) fail(`duplicate closed_at_transition obligation_id: ${row.obligation_id}`);
  closedIds.add(row.obligation_id);
  if (seen.has(row.obligation_id)) fail(`obligation appears both current and closed_at_transition: ${row.obligation_id}`);
}

console.log(`CURRENT_OBLIGATION_REGISTRY_ENFORCEMENT_PASS registry=${registry.registry_id} topology=${topology.topology_id} obligations=${obligations.length} next=${authority.central_next_objective} owner=${next.owner_path}`);
