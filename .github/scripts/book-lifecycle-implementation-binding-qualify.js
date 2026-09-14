'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const bindingPath = 'qualification/book-system/lifecycle/BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-001.json';
const lifecyclePath = 'qualification/book-system/lifecycle/BOOK-LIFECYCLE-STATE-MACHINE-001.json';
const architecturePath = 'qualification/book-system/BOOK-COMPONENT-ARCHITECTURE-001.json';
const ALLOWED = ['IMPLEMENTED','PARTIAL','UNIMPLEMENTED','PEER_DEPENDENCY','HUMAN/EXTERNAL'];

function fail(message) {
  process.stderr.write(`BOOK_LIFECYCLE_IMPLEMENTATION_BINDING_QUALIFY_FAIL: ${message}\n`);
  process.exit(1);
}
function assert(condition, message) { if (!condition) fail(message); }
function readJson(rel) {
  const abs = path.join(ROOT, rel);
  assert(fs.existsSync(abs), `missing required file ${rel}`);
  try { return JSON.parse(fs.readFileSync(abs, 'utf8')); }
  catch (error) { fail(`invalid JSON ${rel}: ${error.message}`); }
}
function addExpected(map, sid, phase) {
  assert(!map.has(sid), `duplicate projected source id ${sid}`);
  map.set(sid, phase);
}

const binding = readJson(bindingPath);
const lifecycle = readJson(lifecyclePath);
readJson(architecturePath);

assert(binding.binding_id === 'BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-001', 'binding id drift');
assert(binding.authority_id === 'CURRENT-AUTHORITY-005', 'authority drift');
assert(binding.lifecycle_contract_ref === lifecyclePath, 'lifecycle ref drift');
assert(binding.lifecycle_contract_id === lifecycle.contract_id, 'lifecycle id mismatch');
assert(binding.component_architecture_ref === architecturePath, 'component architecture ref drift');
assert(/^[0-9a-f]{40}$/.test(binding.bound_repository_base_sha || ''), 'base SHA must be exact 40-hex commit');
assert(binding.source_ledger_identity && binding.source_ledger_identity.atomic_operation_count === 227, 'source ledger denominator drift');
assert(/^[0-9a-f]{64}$/.test(binding.source_ledger_identity.sha256 || ''), 'source ledger SHA-256 missing');
assert(lifecycle.macro_phase_count === 20 && Array.isArray(lifecycle.phase_order) && lifecycle.phase_order.length === 20, 'frozen lifecycle must remain 20 phases');

const projection = lifecycle.legacy_227_projection;
assert(projection && projection.source_atomic_step_count === 227, 'frozen 227 projection missing');
assert(projection.projected_once === 227 && projection.unmapped === 0 && projection.multiply_mapped === 0, 'frozen projection integrity failed');
const expected = new Map();
for (const group of projection.projection_groups || []) {
  assert(/^P\d{2}$/.test(group.legacy || ''), `invalid legacy phase ${group.legacy}`);
  if (group.target) {
    for (let i = 1; i <= group.count; i += 1) addExpected(expected, `${group.legacy}-${String(i).padStart(2,'0')}`, group.target);
  } else if (group.split) {
    let splitCount = 0;
    for (const [phase, ids] of Object.entries(group.split)) {
      for (const sid of ids) { addExpected(expected, sid, phase); splitCount += 1; }
    }
    assert(splitCount === group.count, `split count mismatch ${group.legacy}`);
  } else fail(`projection group lacks target/split ${group.legacy}`);
}
assert(expected.size === 227, `projection reconstructed ${expected.size}, expected 227`);

const phaseById = new Map((lifecycle.phases || []).map(p => [p.phase_id, p]));
assert(phaseById.size === 20, 'phase definitions are not exactly 20');
for (const [sid, phase] of expected) {
  const def = phaseById.get(phase);
  assert(def && def.completion_gate && def.completion_gate.gate_id, `completion gate missing for ${sid} -> ${phase}`);
}

assert(binding.status_bindings && typeof binding.status_bindings === 'object', 'status bindings missing');
const classified = new Map();
for (const status of ALLOWED) {
  const ids = binding.status_bindings[status];
  assert(Array.isArray(ids), `missing status list ${status}`);
  for (const sid of ids) {
    assert(expected.has(sid), `${status} contains unknown source id ${sid}`);
    assert(!classified.has(sid), `source id classified more than once ${sid}`);
    classified.set(sid, status);
  }
}
assert(classified.size === 227, `status union is ${classified.size}, expected 227`);
for (const sid of expected.keys()) assert(classified.has(sid), `unclassified source id ${sid}`);
assert(Object.keys(binding.status_bindings).every(k => ALLOWED.includes(k)), 'unexpected disposition list present');

const componentIds = new Set();
const ca = binding.component_assignment || {};
for (const value of Object.values(ca.legacy_phase_defaults || {})) componentIds.add(value);
for (const value of Object.values(ca.operation_overrides || {})) componentIds.add(value);
for (const value of Object.values(ca.frozen_phase_defaults || {})) componentIds.add(value);
for (const id of componentIds) assert(/^BOOK-COMP-(0[1-9]|1[0-3])$/.test(id), `invalid component assignment ${id}`);
for (const sid of expected.keys()) {
  const legacy = sid.slice(0,3);
  const phase = expected.get(sid);
  const component = (ca.operation_overrides || {})[sid] || (ca.legacy_phase_defaults || {})[legacy] || (ca.frozen_phase_defaults || {})[phase];
  assert(component, `no component assignment resolves for ${sid}`);
}

const surfaces = binding.current_implementation_surfaces || {};
const evidenceBindings = binding.evidence_bindings || {};
const evidenceByOperation = new Map();
for (const [surfaceId, ids] of Object.entries(evidenceBindings)) {
  const surface = surfaces[surfaceId];
  assert(surface && Array.isArray(surface.paths) && surface.paths.length > 0, `evidence surface missing/empty ${surfaceId}`);
  for (const rel of surface.paths) {
    assert(typeof rel === 'string' && rel.length > 0, `blank path in surface ${surfaceId}`);
    assert(!path.isAbsolute(rel) && !rel.split(/[\\/]/).includes('..'), `unsafe evidence path ${rel}`);
    assert(!/PROSE/i.test(rel), `retired PROSE current-evidence path forbidden ${rel}`);
    assert(!/005A|BOOKS_.*\.xlsx|\.xlsx$/i.test(rel), `historical evidence cannot be current implementation path ${rel}`);
    assert(fs.existsSync(path.join(ROOT, rel)), `current evidence path does not exist ${rel}`);
  }
  assert(Array.isArray(ids), `evidence binding list malformed ${surfaceId}`);
  for (const sid of ids) {
    assert(expected.has(sid), `evidence surface ${surfaceId} references unknown ${sid}`);
    const list = evidenceByOperation.get(sid) || [];
    list.push(surfaceId); evidenceByOperation.set(sid, list);
  }
}
for (const [sid, status] of classified) {
  const count = (evidenceByOperation.get(sid) || []).length;
  if (status === 'IMPLEMENTED' || status === 'PARTIAL') assert(count > 0, `${status} lacks current evidence ${sid}`);
  else assert(count === 0, `${status} must not carry current implementation evidence ${sid}`);
}
for (const sid of binding.status_bindings.IMPLEMENTED) {
  const surfaceIds = evidenceByOperation.get(sid) || [];
  const paths = surfaceIds.flatMap(id => surfaces[id].paths || []);
  assert(paths.some(p => p.endsWith('.test.js')), `IMPLEMENTED lacks focused test evidence ${sid}`);
}

const peerBindings = binding.peer_dependency_bindings || {};
const peerCovered = new Set();
for (const [peer, ids] of Object.entries(peerBindings)) {
  assert(['CORE','LEARNING','BOOK','DOCUMENTS','SPREADSHEET_DATA','MEDIA','CONNECTED_ACTIONS','RESEARCH_KNOWLEDGE','PROGRAMMING'].includes(peer), `unknown peer ${peer}`);
  assert(Array.isArray(ids), `peer binding malformed ${peer}`);
  for (const sid of ids) {
    assert(classified.get(sid) === 'PEER_DEPENDENCY', `peer binding ${peer} references non-peer row ${sid}`);
    peerCovered.add(sid);
  }
}
for (const sid of binding.status_bindings.PEER_DEPENDENCY) assert(peerCovered.has(sid), `PEER_DEPENDENCY lacks named peer ${sid}`);

const actualOverall = Object.fromEntries(ALLOWED.map(s => [s, binding.status_bindings[s].length]));
assert(Object.values(actualOverall).reduce((a,b)=>a+b,0) === 227, 'disposition counts do not sum to 227');
for (const status of ALLOWED) assert(binding.summary.overall[status] === actualOverall[status], `summary mismatch ${status}`);
for (const phase of lifecycle.phase_order) {
  const expectedCount = projection.target_step_counts[phase];
  const actualCount = [...expected.entries()].filter(([,p]) => p === phase).length;
  assert(actualCount === expectedCount, `phase projection count mismatch ${phase}`);
  assert(binding.summary.by_phase[phase].total === expectedCount, `summary phase total mismatch ${phase}`);
}

assert(Array.isArray(binding.non_claims) && binding.non_claims.some(x => /does not claim all 227 operations are implemented/i.test(x)), '227 non-claim missing');
assert(binding.non_claims.some(x => /Lifecycle state-machine control coverage is not substantive Book-operation implementation/i.test(x)), 'control-plane non-claim missing');
assert(binding.non_claims.some(x => /PROSE retirement/i.test(x)), 'PROSE retirement non-claim missing');

console.log(JSON.stringify({
  status:'PASS',
  qualifier:'BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-001',
  atomic_operations:227,
  phase_count:20,
  dispositions:actualOverall,
  source_ledger_sha256:binding.source_ledger_identity.sha256,
  base_sha:binding.bound_repository_base_sha,
  sentinel:'BOOK_LIFECYCLE_IMPLEMENTATION_BINDING_QUALIFY_PASS'
}));
console.log('BOOK_LIFECYCLE_IMPLEMENTATION_BINDING_QUALIFY_PASS');
