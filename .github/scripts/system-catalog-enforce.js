'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
function fail(msg) { console.error(`SYSTEM_CATALOG_ENFORCEMENT_FAIL: ${msg}`); process.exit(1); }
function readJson(rel) {
  if (!rel) fail('missing required path');
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) fail(`missing required file: ${rel}`);
  try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); }
  catch (e) { fail(`invalid JSON ${rel}: ${e.message}`); }
}
function requireFile(rel) {
  if (!rel || !fs.existsSync(path.join(root, rel))) fail(`missing required file: ${rel || '<unset>'}`);
}
function sorted(values) { return [...values].sort(); }
function sameSet(a, b) {
  const aa = sorted(a || []), bb = sorted(b || []);
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}
function difference(a, b) {
  const right = new Set(b || []);
  return [...(a || [])].filter((value) => !right.has(value));
}

const authority = readJson('governance/CURRENT-AUTHORITY.json');
for (const field of [
  'topology',
  'expectation_registry',
  'reallocation_ledger',
  'system_catalog',
  'archive_source_registry',
  'programming_system_packet',
  'programming_work_program_lock',
  'prose_retirement_record'
]) requireFile(authority[field]);

const topology = readJson(authority.topology);
const catalog = readJson(authority.system_catalog);
const expectations = readJson(authority.expectation_registry);
const realloc = readJson(authority.reallocation_ledger);
const sources = readJson(authority.archive_source_registry);
const packet = readJson(authority.programming_system_packet);

if (topology.product_root?.product_id !== 'SYSTEM_MASTER') fail('selected topology is not rooted at SYSTEM_MASTER');
if (expectations.topology !== authority.topology) fail('selected expectation registry is not bound to current topology');
if (expectations.system_completion_status !== authority.system_completion_status) fail('selected expectation registry is not bound to current completion status');
if (realloc.topology !== authority.topology) fail('selected reallocation ledger is not bound to current topology');
if (catalog.authority_rule == null || !String(catalog.authority_rule).includes('cannot create')) fail('system catalog must explicitly deny architecture creation authority');

const architecturalPeers = topology.peer_system_ids || [];
const executionReadyPeers = topology.execution_readiness?.execution_ready_peer_system_ids || [];
const admittedNotReadyPeers = topology.execution_readiness?.admitted_not_execution_ready_peer_system_ids || [];
const authorityExecutionLanes = authority.active_peer_execution_lanes || [];

if (!architecturalPeers.length) fail('topology has no architectural peer systems');
if (!executionReadyPeers.length) fail('topology has no execution-ready peer systems');
if (!sameSet(authorityExecutionLanes, executionReadyPeers)) {
  fail(`CURRENT-AUTHORITY active peer execution lanes do not match topology execution readiness: authority=${authorityExecutionLanes.join(',')} topology=${executionReadyPeers.join(',')}`);
}
if (!sameSet(expectations.architectural_peer_system_ids || [], architecturalPeers)) fail('expectation registry architectural peers do not match topology peers');
if (!sameSet(expectations.execution_ready_peer_system_ids || [], executionReadyPeers)) fail('expectation registry execution-ready peers do not match topology readiness');
if (!sameSet(expectations.admitted_not_execution_ready_peer_system_ids || [], admittedNotReadyPeers)) fail('expectation registry admitted-not-ready peers do not match topology readiness');
if (difference(executionReadyPeers, architecturalPeers).length) fail('execution-ready peers must be architectural peers');
if (difference(admittedNotReadyPeers, architecturalPeers).length) fail('admitted-not-ready peers must be architectural peers');
if (!sameSet([...executionReadyPeers, ...admittedNotReadyPeers], architecturalPeers)) fail('topology execution-readiness partition must account for every architectural peer exactly once');

const activeTopology = new Map((topology.canonical_internal_systems || []).map(x => [x.system_id, x]));
const activeCatalog = new Map((catalog.active_peer_systems || []).map(x => [x.system_id, x]));
if (activeTopology.size !== architecturalPeers.length || activeCatalog.size !== architecturalPeers.length) fail('architectural peer system count mismatch between topology and catalog');
for (const id of architecturalPeers) {
  const t = activeTopology.get(id), c = activeCatalog.get(id);
  if (!t || !c) fail(`architectural peer missing from topology/catalog: ${id}`);
  if (c.owner_path !== `SYSTEM_MASTER/${id}`) fail(`catalog owner path mismatch for ${id}`);
  if (c.control_ref !== t.control_ref) fail(`catalog control ref mismatch for ${id}`);
  if (!String(c.lifecycle || '').startsWith('ACTIVE')) fail(`catalog lifecycle must be active for ${id}`);
  if (t.completion !== 'INCOMPLETE') fail(`topology must keep ${id} incomplete until explicit completion authority`);
  if (executionReadyPeers.includes(id) && !t.control_record) fail(`execution-ready peer ${id} must have a canonical control record`);
}
if (activeTopology.has('PROSE') || activeCatalog.has('PROSE')) fail('PROSE must not be active');

const retiredTopology = new Map((topology.retired_systems || []).map(x => [x.system_id, x]));
const retiredCatalog = new Map((catalog.retired_systems || []).map(x => [x.system_id, x]));
const proseTopology = retiredTopology.get('PROSE');
const proseCatalog = retiredCatalog.get('PROSE');
if (!proseTopology || !proseCatalog) fail('PROSE retirement must exist in topology and catalog');
if (proseTopology.current_execution_lane !== null || proseTopology.current_repair_lane !== null || proseTopology.current_qualification_lane !== null) fail('retired PROSE must have no active execution, repair, or qualification lane');
if (proseTopology.successor_system !== null) fail('retired PROSE must not have a successor system');
if (proseTopology.integration_owner !== 'SYSTEM_MASTER/BOOK') fail('any genuinely open preserved-Prose integration must remain Book-owned');
if (proseCatalog.active_execution_lane !== null || proseCatalog.active_repair_lane !== null || proseCatalog.active_qualification_lane !== null) fail('catalog must keep retired PROSE non-dispatchable');
if (proseCatalog.integration_owner_if_needed !== 'SYSTEM_MASTER/BOOK') fail('catalog must route any genuinely open preserved-Prose integration to Book only');

for (const candidate of catalog.future_system_candidates || []) {
  if (!candidate.candidate_id) fail('future system candidate missing candidate_id');
  if (candidate.architecture_authority !== false) fail(`candidate may not have architecture authority: ${candidate.candidate_id}`);
  if (activeTopology.has(candidate.candidate_id)) fail(`candidate duplicates an admitted active peer: ${candidate.candidate_id}`);
}

const programmingProgram = (catalog.active_non_peer_work_programs || []).find(x => x.program_id === 'PROGRAMMING');
if (!programmingProgram) fail('PROGRAMMING active non-peer work program is missing');
if (programmingProgram.architecture_authority !== false) fail('Programming work program may not grant architecture authority');
if (programmingProgram.peer_topology_status !== 'NOT_ADMITTED' || programmingProgram.second_shift_peer_lane !== false) fail('Programming work program must remain non-peer until explicit admission');
if (programmingProgram.work_program_lock !== authority.programming_work_program_lock) fail('Programming work-program lock mismatch');

const programmingCandidate = (catalog.future_system_candidates || []).find(x => x.candidate_id === 'PROGRAMMING');
if (!programmingCandidate) fail('PROGRAMMING peer-admission candidate is missing');
if (!String(programmingCandidate.lifecycle || '').includes('ACTIVE_WORK_PROGRAM')) fail('Programming candidate must preserve active work-program standing');
if (programmingCandidate.architecture_authority !== false) fail('Programming candidate cannot self-admit architecture authority');

if (packet.candidate_system_id !== 'PROGRAMMING' || packet.architecture_authority !== false) fail('Programming packet authority boundary invalid');
if (!String(packet.lifecycle || '').includes('ACTIVE_WORK_PROGRAM')) fail('Programming packet must preserve active work-program standing');
if (!String(packet.lifecycle || '').includes('NOT_ACTIVE_PEER')) fail('Programming packet must deny current peer-system standing');
if (packet.work_program_lock !== authority.programming_work_program_lock) fail('Programming packet work-program lock mismatch');

if (!Array.isArray(sources.sources) || sources.sources.length < 1) fail('archive source registry has no sources');
if (!String(sources.standing || '').includes('FULL_ASSET_CENSUS_PENDING')) fail('source registry must not falsely claim full archive census');
for (const s of sources.sources) {
  if (!s.source_id || !s.surface || !s.evidence_class || !s.reuse_disposition) fail(`invalid source registry row: ${s.source_id || '<missing>'}`);
}

const expText = JSON.stringify(expectations);
if (!expText.includes('DOCUMENTS') || !expText.includes('PROSE is historically complete and terminally retired')) fail('current expectation registry lacks Documents/terminal-Prose expectations');
if (!expText.includes('PROGRAMMING is an incomplete active work program')) fail('current expectation registry lacks Programming active-work-program boundary');
for (const id of admittedNotReadyPeers) {
  if (!expText.includes(id)) fail(`current expectation registry lacks admitted peer expectation for ${id}`);
}
const reallocText = JSON.stringify(realloc);
if (!reallocText.includes('LITERARY-PROSE') || !reallocText.includes('BOOK-EVAL-LEMONADE-001') || !reallocText.includes('RETIRED_NO_DISPATCH')) fail('current reallocation ledger lacks current retired-Prose/Book integration dispositions');

const systemsMd = fs.readFileSync(path.join(root, 'SYSTEMS.md'), 'utf8');
if (!systemsMd.includes('SYSTEM_MASTER/DOCUMENTS') || !systemsMd.includes('PROSE') || !systemsMd.includes('retired')) fail('SYSTEMS.md is not aligned to Documents peer / Prose retirement');
if (systemsMd.includes('Machine-readable topology: `governance/SYSTEM-TOPOLOGY-002.json`')) fail('SYSTEMS.md still points to topology 002');

console.log('SYSTEM_CATALOG_ENFORCEMENT_PASS');
console.log(`topology=${topology.topology_id}`);
console.log(`architectural_peer_systems=${architecturalPeers.join(',')}`);
console.log(`execution_ready_peer_systems=${executionReadyPeers.join(',')}`);
console.log(`admitted_not_execution_ready_peer_systems=${admittedNotReadyPeers.join(',')}`);
console.log('retired_system=PROSE_NO_DISPATCH_BOOK_INTEGRATION_ONLY');
console.log('programming=ACTIVE_NON_PEER_WORK_PROGRAM');
console.log(`future_candidates=${(catalog.future_system_candidates || []).map(x => x.candidate_id).join(',')}`);
console.log(`source_registry_seed_count=${sources.sources.length}`);
