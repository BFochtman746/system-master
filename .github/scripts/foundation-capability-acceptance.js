'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const moduleKey = (process.argv[2] || '').toUpperCase();
if (!moduleKey) {
  process.stderr.write('FOUNDATION_CAPABILITY_ACCEPTANCE=FAIL code=MODULE_REQUIRED\n');
  process.exit(2);
}
function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
function blobSha(rel) {
  const bytes = fs.readFileSync(path.join(ROOT, rel));
  return crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex');
}
function fail(code, detail) {
  process.stderr.write(`FOUNDATION_CAPABILITY_ACCEPTANCE=FAIL module=${moduleKey} code=${code}${detail ? ` detail=${detail}` : ''}\n`);
  process.exit(2);
}
const spec = spawnSync(process.execPath, [path.join(ROOT, '.github/scripts/foundation-capability-contract-spec-check.js'), moduleKey], { encoding: 'utf8' });
if (spec.status !== 0) fail('SPEC_GATE_FAILED', (spec.stderr || spec.stdout || '').trim().replace(/\s+/g, '_'));

const authority = readJson('governance/CURRENT-AUTHORITY.json');
const crosswalk = readJson(authority.capability_crosswalk);
const entry = (crosswalk.capability_entries || []).find((e) => e.module_key === moduleKey && e.owner_path);
if (!entry) fail('UNKNOWN_OR_NONPROGRAMMED_CAPABILITY');
const slug = moduleKey.toLowerCase().replaceAll('_', '-');
const evidenceRel = `qualification/foundation/${slug}-foundation-001.json`;
if (!fs.existsSync(path.join(ROOT, evidenceRel))) fail('IMPLEMENTATION_EVIDENCE_ABSENT', evidenceRel);
const evidence = readJson(evidenceRel);
if (evidence.status !== 'PASS') fail('EVIDENCE_NOT_PASS');
if (evidence.capability_id !== entry.capability_id) fail('CAPABILITY_ID_MISMATCH');
if (evidence.module_key !== moduleKey) fail('MODULE_MISMATCH');
if (evidence.owner_path !== entry.owner_path) fail('OWNER_MISMATCH');
if (evidence.authority_id !== authority.authority_id) fail('AUTHORITY_MISMATCH');
if (!Array.isArray(evidence.subjects) || !evidence.subjects.length) fail('SUBJECTS_ABSENT');
for (const subject of evidence.subjects) {
  if (!subject.path || !subject.git_blob_sha || !fs.existsSync(path.join(ROOT, subject.path))) fail('SUBJECT_ABSENT', subject.path || 'UNSET');
  if (blobSha(subject.path) !== subject.git_blob_sha) fail('SUBJECT_DRIFT', subject.path);
}
const tests = evidence.tests || {};
for (const key of ['route_coverage','canonical_writer','dependency_failure','idempotency','owner_boundary']) {
  if (tests[key] !== 'PASS') fail('REQUIRED_TEST_NOT_PASS', key);
}
process.stdout.write(`FOUNDATION_CAPABILITY_ACCEPTANCE=PASS module=${moduleKey} capability=${entry.capability_id} evidence=${evidenceRel}\n`);
