'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
function fail(msg) { console.error(`SYSTEM_CATALOG_ENFORCEMENT_FAIL: ${msg}`); process.exit(1); }
function readJson(rel) {
  if (!rel) fail('missing required path');
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) fail(`missing required file: ${rel}`);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { fail(`invalid JSON ${rel}: ${e.message}`); }
}
function requireFile(rel) {
  if (!rel || !fs.existsSync(path.join(root, rel))) fail(`missing required file: ${rel || '<unset>'}`);
}

const authority = readJson('governance/CURRENT-AUTHORITY.json');
for (const field of ['topology','expectation_registry','reallocation_ledger','system_catalog','archive_source_registry','knowledge_reuse_design']) requireFile(authority[field]);

const topology = readJson(authority.topology);
const catalog = readJson(authority.system_catalog);
const expectations = readJson(authority.expectation_registry);
const realloc = readJson(authority.reallocation_ledger);
const sources = readJson(authority.archive_source_registry);

if (topology.topology_id !== 'SYSTEM-TOPOLOGY-003') fail(`current topology must be SYSTEM-TOPOLOGY-003, got ${topology.topology_id}`);
if (expectations.topology !== authority.topology) fail('selected expectation registry is not bound to current topology');
if (realloc.topology !== authority.topology) fail('selected reallocation ledger is not bound to current topology');
if (catalog.authority_rule == null || !String(catalog.authority_rule).includes('cannot create')) fail('system catalog must explicitly deny architecture creation authority');

const activeTopology = new Map((topology.canonical_internal_systems || []).map(x => [x.system_id, x]));
const activeCatalog = new Map((catalog.active_systems || []).map(x => [x.system_id, x]));
const expectedActive = ['CORE','LEARNING','BOOK','DOCUMENTS'];
if (activeTopology.size !== expectedActive.length || activeCatalog.size !== expectedActive.length) fail('active system count mismatch');
for (const id of expectedActive) {
  const t = activeTopology.get(id), c = activeCatalog.get(id);
  if (!t || !c) fail(`active system missing from topology/catalog: ${id}`);
  if (c.owner_path !== `SYSTEM_MASTER/${id}`) fail(`catalog owner path mismatch for ${id}`);
  if (c.control_ref !== t.control_ref) fail(`catalog control ref mismatch for ${id}`);
  if (c.lifecycle !== 'ACTIVE') fail(`catalog lifecycle must be ACTIVE for ${id}`);
}
if (activeTopology.has('PROSE') || activeCatalog.has('PROSE')) fail('PROSE must not be active');

const retiredTopology = new Map((topology.retired_systems || []).map(x => [x.system_id, x]));
const retiredCatalog = new Map((catalog.retired_systems || []).map(x => [x.system_id, x]));
if (!retiredTopology.has('PROSE') || !retiredCatalog.has('PROSE')) fail('PROSE retirement must exist in topology and catalog');
if (retiredTopology.get('PROSE').successor_system_id !== 'DOCUMENTS' || retiredCatalog.get('PROSE').successor_system_id !== 'DOCUMENTS') fail('PROSE successor must be DOCUMENTS');

for (const candidate of catalog.future_system_candidates || []) {
  if (!candidate.candidate_id) fail('future system candidate missing candidate_id');
  if (candidate.architecture_authority !== false) fail(`candidate may not have architecture authority: ${candidate.candidate_id}`);
  if (activeTopology.has(candidate.candidate_id)) fail(`candidate duplicates active system: ${candidate.candidate_id}`);
}
const programming = (catalog.future_system_candidates || []).find(x => x.candidate_id === 'PROGRAMMING');
if (!programming) fail('PROGRAMMING future-system candidate is missing');
requireFile(authority.programming_system_packet);
const packet = readJson(authority.programming_system_packet);
if (packet.candidate_system_id !== 'PROGRAMMING' || packet.architecture_authority !== false) fail('Programming packet authority boundary invalid');
if (!String(packet.lifecycle || '').includes('PLANNED_CANDIDATE')) fail('Programming packet must remain planned candidate until explicit admission');

if (!Array.isArray(sources.sources) || sources.sources.length < 1) fail('archive source registry has no sources');
if (!String(sources.standing || '').includes('FULL_ASSET_CENSUS_PENDING')) fail('source registry must not falsely claim full archive census');
for (const s of sources.sources) {
  if (!s.source_id || !s.surface || !s.evidence_class || !s.reuse_disposition) fail(`invalid source registry row: ${s.source_id || '<missing>'}`);
}

const expText = JSON.stringify(expectations);
if (!expText.includes('DOCUMENTS') || !expText.includes('PROSE is completed/retired')) fail('current expectation registry lacks Documents/Prose retirement expectations');
const reallocText = JSON.stringify(realloc);
if (!reallocText.includes('LITERARY-PROSE') || !reallocText.includes('BOOK-EVAL-LEMONADE-001') || !reallocText.includes('DOCUMENTS')) fail('current reallocation ledger lacks historical Prose workstream -> Documents resolution');

const systemsMd = fs.readFileSync(path.join(root, 'SYSTEMS.md'), 'utf8');
if (!systemsMd.includes('SYSTEM_MASTER/DOCUMENTS') || !systemsMd.includes('PROSE') || !systemsMd.includes('completed and retired')) fail('SYSTEMS.md is not aligned to Documents peer / Prose retirement');
if (systemsMd.includes('Machine-readable topology: `governance/SYSTEM-TOPOLOGY-002.json`')) fail('SYSTEMS.md still points to topology 002');

console.log('SYSTEM_CATALOG_ENFORCEMENT_PASS');
console.log(`active_systems=${expectedActive.join(',')}`);
console.log('retired_system=PROSE->DOCUMENTS');
console.log(`future_candidates=${(catalog.future_system_candidates || []).map(x => x.candidate_id).join(',')}`);
console.log(`source_registry_seed_count=${sources.sources.length}`);
