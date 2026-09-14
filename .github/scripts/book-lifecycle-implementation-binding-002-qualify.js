'use strict';

const fs = require('fs');

const basePath = 'qualification/book-system/lifecycle/BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-001.json';
const nextPath = 'qualification/book-system/lifecycle/BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-002.json';
const lifecyclePath = 'qualification/book-system/lifecycle/BOOK-LIFECYCLE-STATE-MACHINE-001.json';
const profilePath = 'qualification/book-system/recovery/BOOK-SEMANTIC-RECOVERY-PROFILE-001.json';
const ALLOWED = ['IMPLEMENTED','PARTIAL','UNIMPLEMENTED','PEER_DEPENDENCY','HUMAN/EXTERNAL'];
const EXPECTED_TRANSITIONS = {
  'P19-02': ['UNIMPLEMENTED','PARTIAL'],
  'P19-06': ['UNIMPLEMENTED','PARTIAL'],
  'P19-07': ['UNIMPLEMENTED','IMPLEMENTED'],
  'P19-08': ['PARTIAL','IMPLEMENTED']
};

function fail(message) { process.stderr.write(`BOOK_LIFECYCLE_IMPLEMENTATION_BINDING_002_QUALIFY_FAIL: ${message}\n`); process.exit(1); }
function assert(condition, message) { if (!condition) fail(message); }
function readJson(path) { try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch (error) { fail(`cannot read ${path}: ${error.message}`); } }

const base = readJson(basePath);
const next = readJson(nextPath);
const lifecycle = readJson(lifecyclePath);
const profile = readJson(profilePath);

assert(base.binding_id === 'BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-001', 'base binding id drift');
assert(next.binding_id === 'BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-002', 'successor binding id drift');
assert(next.supersedes === basePath, 'supersession path mismatch');
assert(next.superseded_binding_blob_sha === '97d4aa14281d1f426fd23890f10f23bacd9493f2', 'base blob binding drift');
assert(next.qualified_implementation_subject_sha === 'fe42e8526a7a73ddc19fa7d9671dcb5c7165ad9c', 'qualified COMP-12 subject drift');
assert(next.source_ledger_identity?.atomic_operation_count === 227, '227 denominator missing');
assert(next.source_ledger_identity?.sha256 === base.source_ledger_identity?.sha256, 'source ledger identity drift');
assert(profile.profile_id === 'BOOK-SEMANTIC-RECOVERY-PROFILE-001', 'recovery profile missing');
assert(profile.core_p03_dependency?.registration_state === 'REQUIRED_PROVIDER_REGISTRATION_OPEN', 'binding must not imply CORE provider registration');
assert(profile.core_p03_dependency?.no_operation_id_invented_by_book === true, 'BOOK must not invent CORE operation id');

const statusById = new Map();
for (const status of ALLOWED) {
  const ids = base.status_bindings?.[status];
  assert(Array.isArray(ids), `base status missing ${status}`);
  for (const id of ids) {
    assert(!statusById.has(id), `duplicate base disposition ${id}`);
    statusById.set(id, status);
  }
}
assert(statusById.size === 227, `base denominator ${statusById.size}`);

const overrides = next.status_overrides || [];
assert(overrides.length === 4, `expected exactly 4 overrides, got ${overrides.length}`);
assert(new Set(overrides.map(x => x.source_id)).size === 4, 'duplicate override source id');
for (const override of overrides) {
  const expected = EXPECTED_TRANSITIONS[override.source_id];
  assert(expected, `unexpected override ${override.source_id}`);
  assert(override.phase === 'PRESERVATION' && override.component === 'BOOK-COMP-12', `override boundary drift ${override.source_id}`);
  assert(override.from === expected[0] && override.to === expected[1], `unexpected transition ${override.source_id}:${override.from}->${override.to}`);
  assert(statusById.get(override.source_id) === override.from, `base status mismatch ${override.source_id}`);
  assert(Array.isArray(override.evidence) && override.evidence.length > 0, `evidence missing ${override.source_id}`);
  for (const path of override.evidence) assert(fs.existsSync(path), `evidence path missing ${override.source_id}:${path}`);
  statusById.set(override.source_id, override.to);
}
assert(Object.keys(EXPECTED_TRANSITIONS).every(id => overrides.some(x => x.source_id === id)), 'required P19 transition omitted');
assert(statusById.size === 227, 'effective denominator changed');

const actual = Object.fromEntries(ALLOWED.map(status => [status, [...statusById.values()].filter(x => x === status).length]));
for (const status of ALLOWED) assert(actual[status] === next.effective_summary.overall[status], `overall summary mismatch ${status}`);
assert(Object.values(actual).reduce((a,b) => a+b,0) === 227, 'effective total not 227');
assert(next.effective_summary.unchanged_operation_count === 223, 'unchanged operation count must be 223');

const projection = lifecycle.legacy_227_projection;
const p19Ids = [];
for (const group of projection.projection_groups || []) {
  if (group.legacy === 'P19') for (let i = 1; i <= group.count; i += 1) p19Ids.push(`P19-${String(i).padStart(2,'0')}`);
}
assert(p19Ids.length === 8, 'P19 denominator drift');
const p19 = Object.fromEntries(ALLOWED.map(status => [status, p19Ids.filter(id => statusById.get(id) === status).length]));
for (const status of ALLOWED) assert(p19[status] === next.effective_summary.preservation_phase[status], `P19 summary mismatch ${status}`);
assert(next.effective_summary.preservation_phase.total === 8, 'P19 total drift');
assert(p19.PEER_DEPENDENCY === 4 && ['P19-01','P19-03','P19-04','P19-05'].every(id => statusById.get(id) === 'PEER_DEPENDENCY'), 'physical CORE P19 rows must remain peer dependencies');
assert(p19.UNIMPLEMENTED === 0, 'Book-owned P19 semantics should have no remaining UNIMPLEMENTED row after this qualified slice');

assert(next.book_comp_12_standing?.core_public_operation_registration === 'OPEN_BLOCKER', 'CORE registration blocker must stay explicit');
assert(next.book_comp_12_standing?.physical_backup_restore_mechanics === 'CORE_OWNED_NOT_ABSORBED', 'physical ownership drift');
assert((next.non_claims || []).some(x => /test-only/i.test(x)), 'test fixture registration non-claim missing');
assert((next.non_claims || []).some(x => /Book remains incomplete/i.test(x)), 'Book completion non-claim missing');

console.log(JSON.stringify({
  status: 'PASS',
  qualifier: 'BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-002',
  atomic_operations: 227,
  dispositions: actual,
  preservation: p19,
  unchanged_operations: 223,
  core_provider_registration: 'OPEN_BLOCKER',
  sentinel: 'BOOK_LIFECYCLE_IMPLEMENTATION_BINDING_002_QUALIFY_PASS'
}));
console.log('BOOK_LIFECYCLE_IMPLEMENTATION_BINDING_002_QUALIFY_PASS');
