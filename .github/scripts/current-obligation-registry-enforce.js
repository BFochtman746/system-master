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
function systemOwnerPath(system) {
  return system?.owner_path || (system?.system_id ? `SYSTEM_MASTER/${system.system_id}` : null);
}
function sameOrDescendant(candidate, parent) {
  return candidate === parent || String(candidate || '').startsWith(`${parent}/`);
}

const authority = readJson('governance/CURRENT-AUTHORITY.json');
const topology = readJson(authority.topology);
const registry = readJson(authority.obligation_registry);
const obligations = Array.isArray(registry.obligations) ? registry.obligations : fail('selected registry obligations must be an array');
const systems = topology.canonical_internal_systems || [];
const byOwnerPath = new Map(systems.map((s) => [systemOwnerPath(s), s]).filter(([p]) => Boolean(p)));
const peerSystems = new Set(topology.peer_system_ids || []);
const activeOwnerPaths = new Set(['SYSTEM_MASTER', ...byOwnerPath.keys()]);

function validOwner(ownerPath) {
  if (typeof ownerPath !== 'string') return false;
  if (ownerPath.startsWith('SYSTEM_MASTER/SHARED_INFRASTRUCTURE')) return true;
  return [...activeOwnerPaths].some((p) => sameOrDescendant(ownerPath, p));
}
function resolveSystemForOwner(ownerPath) {
  return [...byOwnerPath.entries()]
    .filter(([p]) => sameOrDescendant(ownerPath, p))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[1] || null;
}

if (!registry.registry_id) fail('selected registry missing registry_id');
if (registry.product_root !== 'SYSTEM_MASTER') fail(`selected registry product_root must be SYSTEM_MASTER, got ${registry.product_root}`);
if (registry.topology && registry.topology !== authority.topology) fail(`selected registry topology mismatch: authority=${authority.topology} registry=${registry.topology}`);
if (!authority.central_next_objective) fail('CURRENT-AUTHORITY central_next_objective is missing');
if (registry.central_next_objective !== authority.central_next_objective) fail(`central objective mismatch: authority=${authority.central_next_objective} registry=${registry.central_next_objective || '<missing>'}`);

const seen = new Set();
for (const entry of obligations) {
  if (!entry || typeof entry !== 'object') fail('obligation entry must be an object');
  if (!entry.obligation_id) fail('obligation entry missing obligation_id');
  if (seen.has(entry.obligation_id)) fail(`duplicate obligation_id: ${entry.obligation_id}`);
  seen.add(entry.obligation_id);
  if (!validOwner(entry.owner_path)) fail(`invalid owner_path for ${entry.obligation_id}: ${entry.owner_path || '<missing>'}`);
  if (!entry.state) fail(`missing state for ${entry.obligation_id}`);
  if (!['CLOSED','SUPERSEDED'].includes(entry.state) && !entry.objective) fail(`open obligation missing objective: ${entry.obligation_id}`);
  if (entry.owner_path === 'SYSTEM_MASTER/BOOK/PROSE' || entry.owner_path?.startsWith('SYSTEM_MASTER/BOOK/PROSE/')) {
    const prose = systems.find((s) => s.system_id === 'PROSE');
    if (!prose || prose.parent_id !== 'BOOK' || systemOwnerPath(prose) !== 'SYSTEM_MASTER/BOOK/PROSE') fail(`Book Prose child obligation lacks active topology authority: ${entry.obligation_id}`);
  }
}

const next = obligations.find((entry) => entry.obligation_id === authority.central_next_objective);
if (!next) fail(`central_next_objective is not present in selected registry: ${authority.central_next_objective}`);
if (!['READY','ACTIVE'].includes(next.state)) fail(`central_next_objective must be READY or ACTIVE, got ${next.state}`);
if (!validOwner(next.owner_path) || next.owner_path === 'SYSTEM_MASTER') fail(`central_next_objective must be assigned to an active executable owner, got ${next.owner_path}`);

const nextSystem = resolveSystemForOwner(next.owner_path);
if (!nextSystem && !next.owner_path.startsWith('SYSTEM_MASTER/SHARED_INFRASTRUCTURE')) fail(`central_next_objective owner is not an active topology system: ${next.owner_path}`);
if (nextSystem?.system_id === 'PROSE' && !peerSystems.has('BOOK')) fail('Prose child cannot execute without active BOOK peer owner');

const transitionRows = [
  ...(Array.isArray(registry.closed_at_transition) ? registry.closed_at_transition : []),
  ...(Array.isArray(registry.superseded_at_transition) ? registry.superseded_at_transition : [])
];
const transitionIds = new Set();
for (const row of transitionRows) {
  if (!row?.obligation_id) fail('transition entry missing obligation_id');
  if (transitionIds.has(row.obligation_id)) fail(`duplicate transition obligation_id: ${row.obligation_id}`);
  transitionIds.add(row.obligation_id);
  if (seen.has(row.obligation_id)) fail(`obligation appears both current and transition history: ${row.obligation_id}`);
}

console.log(`CURRENT_OBLIGATION_REGISTRY_ENFORCEMENT_PASS registry=${registry.registry_id} topology=${topology.topology_id} obligations=${obligations.length} next=${authority.central_next_objective} owner=${next.owner_path}`);
