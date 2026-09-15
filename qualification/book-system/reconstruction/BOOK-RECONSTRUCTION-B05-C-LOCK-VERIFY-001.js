'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const Q = path.join(ROOT, 'qualification/book-system/reconstruction');

function fail(message) {
  throw new Error(`B05-C LOCK VERIFY FAILED: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel));
}

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
}

function csvLines(buffer) {
  return buffer.toString('utf8').replace(/\r\n/g, '\n').trimEnd().split('\n');
}

function exactRange(prefix, count) {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);
}

const manifestPath = 'qualification/book-system/reconstruction/BOOK-RECONSTRUCTION-B05-C-LOCK-MANIFEST-001.json';
const manifest = JSON.parse(read(manifestPath).toString('utf8'));

assert(manifest.manifest_schema_version === 'BOOK_RECONSTRUCTION_B05_C_LOCK_MANIFEST_V1', 'manifest schema version mismatch');
assert(manifest.domain === 'BOOK_RECONSTRUCTION_B05', 'domain mismatch');
assert(manifest.owner === 'SYSTEM_MASTER/BOOK', 'owner mismatch');
assert(manifest.canonical_effect === false, 'canonical_effect must be false');
assert(manifest.historical_pass_transfer === 0, 'historical PASS transfer must be zero');
assert(manifest.denominator_shrinkage_allowed === false, 'denominator shrinkage must be forbidden');
assert(manifest.opportunity_hard_max === 3, 'opportunity hard max must be exactly 3');

for (const locked of [manifest.design_lock, manifest.lens_registry, manifest.qualification_denominator]) {
  const bytes = read(locked.path);
  const actual = gitBlobSha(bytes);
  assert(actual === locked.blob_sha, `${locked.path} blob mismatch: expected ${locked.blob_sha}, got ${actual}`);
}

// Exact 16-lens registry.
const lensLines = csvLines(read(manifest.lens_registry.path));
assert(lensLines[0] === 'lens_id,label,owner_class,required_owner_dependencies,output_authority,anti_abuse_rule', 'lens header mismatch');
const lensRows = lensLines.slice(1).map((line, index) => {
  const parts = line.split(',');
  assert(parts.length === 6, `lens row ${index + 1} must have exactly 6 columns`);
  assert(parts.every(Boolean), `lens row ${index + 1} has an empty field`);
  return parts;
});
assert(lensRows.length === 16, `lens count must be 16, got ${lensRows.length}`);
assert(manifest.lens_registry.count === 16, 'manifest lens count must be 16');
assert(new Set(lensRows.map(r => r[0])).size === 16, 'duplicate lens id');
assert(new Set(lensRows.map(r => r[1])).size === 16, 'duplicate lens label');
for (let i = 0; i < 16; i += 1) {
  assert(lensRows[i][0] === manifest.lens_registry.ids[i], `lens id/order mismatch at ${i + 1}`);
  assert(lensRows[i][1] === manifest.lens_registry.labels[i], `lens label/order mismatch at ${i + 1}`);
}
assert(JSON.stringify(manifest.lens_registry.ids) === JSON.stringify(exactRange('B05-LENS-', 16).map((_, i) => `B05-LENS-${String(i + 1).padStart(3, '0')}`)), 'manifest lens id sequence mismatch');

assert(Array.isArray(manifest.external_b08_seams) && manifest.external_b08_seams.length === 2, 'must preserve exactly two B08 external seams');
assert(manifest.external_b08_seams[0] === 'VOICE_PRESERVATION_EVOLUTION', 'first B08 seam mismatch');
assert(manifest.external_b08_seams[1] === 'HOMOGENIZATION_OVEROPTIMIZATION', 'second B08 seam mismatch');

// Exact 152-case denominator.
const denLines = csvLines(read(manifest.qualification_denominator.path));
assert(denLines[0] === 'case_id,group,requirement', 'denominator header mismatch');
const denRows = denLines.slice(1).map((line, index) => {
  const first = line.indexOf(',');
  const second = line.indexOf(',', first + 1);
  assert(first > 0 && second > first, `denominator row ${index + 1} malformed`);
  const id = line.slice(0, first);
  const group = line.slice(first + 1, second);
  const requirement = line.slice(second + 1).trim();
  assert(requirement.length > 0, `denominator ${id} has empty requirement`);
  return { id, group, requirement };
});
assert(denRows.length === 152, `denominator total must be 152, got ${denRows.length}`);
assert(manifest.qualification_denominator.total === 152, 'manifest denominator total must be 152');
assert(new Set(denRows.map(r => r.id)).size === 152, 'duplicate denominator case id');

const groupSpecs = [
  ['C', 24],
  ['S', 36],
  ['K', 20],
  ['O', 24],
  ['I', 24],
  ['X', 24]
];
let offset = 0;
for (const [group, count] of groupSpecs) {
  const spec = manifest.qualification_denominator.groups[group];
  assert(spec && spec.count === count, `${group} manifest count mismatch`);
  const expected = exactRange(group, count);
  const rows = denRows.slice(offset, offset + count);
  assert(rows.length === count, `${group} row count mismatch`);
  for (let i = 0; i < count; i += 1) {
    assert(rows[i].id === expected[i], `${group} id/order mismatch at ${i + 1}: got ${rows[i].id}`);
    assert(rows[i].group === group, `${rows[i].id} group mismatch: got ${rows[i].group}`);
  }
  assert(spec.first === expected[0], `${group} first id mismatch`);
  assert(spec.last === expected[expected.length - 1], `${group} last id mismatch`);
  offset += count;
}
assert(offset === 152, 'group accounting must total 152');

const expectedCommands = [
  'BuildLiteraryDiagnosticContextV1',
  'AcceptLiteraryDiagnosticObservationV1',
  'AssembleLiteraryDiagnosisV1',
  'AcceptCraftIntelligenceRecordV1',
  'AssembleLiteraryOpportunityLedgerV1',
  'ComputeLiteraryDiagnosticInvalidationV1'
];
const expectedQueries = [
  'GetLiteraryDiagnosticContextV1',
  'GetLiteraryDiagnosisV1',
  'GetLiteraryLensEvidenceV1',
  'GetLiteraryOpportunityLedgerV1',
  'RetrieveCraftIntelligenceV1',
  'GetLiteraryDiagnosticCurrentnessV1'
];
assert(JSON.stringify(manifest.command_surface) === JSON.stringify(expectedCommands), 'command surface mismatch');
assert(JSON.stringify(manifest.query_surface) === JSON.stringify(expectedQueries), 'query surface mismatch');

const expectedFences = [
  'MODEL_LITERARY_SPECIALIST_CALIBRATION_REQUIRED',
  'HUMAN_EDITOR_ALIGNMENT_REQUIRED',
  'REAL_BOOK_DIAGNOSTIC_CALIBRATION_REQUIRED',
  'CROSS_GENRE_GENERALIZATION_REQUIRED',
  'PROVIDER_SUBJECT_ADMISSION_REQUIRED',
  'PRIVATE_MANUSCRIPT_ENVIRONMENT_REQUIRED'
];
assert(JSON.stringify(manifest.external_fences) === JSON.stringify(expectedFences), 'external-fence set/order mismatch');

const lockText = read(manifest.design_lock.path).toString('utf8');
for (const required of [
  'Frozen primary lenses: **16**.',
  'Frozen external B08 seams: **2**.',
  'Frozen isolated denominator: **152**.',
  'Unresolved deterministic design decisions: **0**.',
  'B05-D1 — Diagnostic Context + Frozen Lens Registry',
  'B05-D2 — Diagnostic Observation Acceptance/Sealing + Diagnosis Assembly',
  'B05-D3 — Craft Intelligence Record Acceptance/Retrieval + Opportunity Adjudication',
  'B05-D4 — Invalidation/Currentness + Hardened Query/Runtime Reachability'
]) {
  assert(lockText.includes(required), `design lock missing required statement: ${required}`);
}

console.log('B05-C LOCK VERIFY PASS');
console.log('primary_lenses=16');
console.log('external_b08_seams=2');
console.log('denominator_total=152');
console.log('groups=C24,S36,K20,O24,I24,X24');
console.log('commands=6 queries=6 opportunity_hard_max=3');
console.log('historical_pass_transfer=0 canonical_effect=false denominator_shrinkage=false');
