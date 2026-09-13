'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const AUTHORITY = 'governance/CURRENT-AUTHORITY.json';
const REGISTRY = 'governance/census/FOUNDATION-CLOSURE-EVIDENCE-REGISTRY-001.json';
const GOVERNANCE_VALIDATOR = '.github/scripts/validate-governance.js';
const GOVERNANCE_SCHEMA_DEPENDENCIES = [
  'governance/schemas/CURRENT-AUTHORITY-001.schema.json',
  'governance/schemas/WORK-OBLIGATION-REGISTRY-001.schema.json',
  'governance/schemas/SYSTEM-TOPOLOGY-001.schema.json',
  'governance/schemas/TOOL-OWNER-ALLOCATION-001.schema.json'
];

function abs(rel) { return path.join(ROOT, rel); }
function readJson(rel) { return JSON.parse(fs.readFileSync(abs(rel), 'utf8')); }
function exists(rel) { return Boolean(rel) && fs.existsSync(abs(rel)); }
function workingBlob(rel) {
  const body = fs.readFileSync(abs(rel));
  const header = Buffer.from(`blob ${body.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([header, body])).digest('hex');
}
function gitText(args, code) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${code} detail=${(result.stderr || '').trim()}`);
  return result.stdout;
}
function historicalBlob(subjectSha, rel) {
  return gitText(['rev-parse', `${subjectSha}:${rel}`], `SUBJECT_HISTORY_UNRESOLVED sha=${subjectSha} path=${rel}`).trim();
}
function historicalJson(subjectSha, rel) {
  return JSON.parse(gitText(['show', `${subjectSha}:${rel}`], `SUBJECT_JSON_UNRESOLVED sha=${subjectSha} path=${rel}`));
}
function requireField(object, key, id) {
  if (object[key] === undefined || object[key] === null || object[key] === '') throw new Error(`EVIDENCE_FIELD_ABSENT id=${id} field=${key}`);
}
function verifyTransitiveValidatorDependencies(entry) {
  if (!(entry.subjects || []).some((subject) => subject.path === GOVERNANCE_VALIDATOR)) return;
  const historicalAuthority = historicalJson(entry.subject_sha, AUTHORITY);
  const dependencies = [
    ...GOVERNANCE_SCHEMA_DEPENDENCIES,
    historicalAuthority.obligation_registry,
    historicalAuthority.topology,
    historicalAuthority.headless_tool_owner_allocation
  ].filter(Boolean);
  for (const rel of [...new Set(dependencies)]) {
    if (!exists(rel)) throw new Error(`TRANSITIVE_SUBJECT_ABSENT id=${entry.requirement_or_capability_id} path=${rel}`);
    const historical = historicalBlob(entry.subject_sha, rel);
    const current = workingBlob(rel);
    if (current !== historical) throw new Error(`CURRENT_TRANSITIVE_SUBJECT_DRIFT id=${entry.requirement_or_capability_id} path=${rel} qualified=${historical} current=${current}`);
  }
}

function main() {
  const authority = readJson(AUTHORITY);
  const registry = readJson(REGISTRY);
  if (registry.authority_id !== authority.authority_id) throw new Error(`REGISTRY_AUTHORITY_MISMATCH expected=${authority.authority_id} actual=${registry.authority_id}`);
  if (registry.crosswalk !== authority.capability_crosswalk) throw new Error(`REGISTRY_CROSSWALK_MISMATCH expected=${authority.capability_crosswalk} actual=${registry.crosswalk}`);
  if (registry.allocation !== authority.headless_tool_owner_allocation) throw new Error(`REGISTRY_ALLOCATION_MISMATCH expected=${authority.headless_tool_owner_allocation} actual=${registry.allocation}`);
  if (registry.topology !== authority.topology) throw new Error(`REGISTRY_TOPOLOGY_MISMATCH expected=${authority.topology} actual=${registry.topology}`);

  const seen = new Set();
  let pass = 0;
  let blocked = 0;
  for (const entry of registry.entries || []) {
    const id = entry.requirement_or_capability_id;
    requireField(entry, 'requirement_or_capability_id', id || 'UNKNOWN');
    if (seen.has(id)) throw new Error(`DUPLICATE_EVIDENCE_ENTRY id=${id}`);
    seen.add(id);
    for (const field of ['owner_path','authority_id','status','subject_sha']) requireField(entry, field, id);
    if (entry.authority_id !== authority.authority_id) throw new Error(`ENTRY_AUTHORITY_MISMATCH id=${id}`);
    if (!/^[0-9a-f]{40}$/.test(entry.subject_sha)) throw new Error(`SUBJECT_SHA_INVALID id=${id} sha=${entry.subject_sha}`);
    if (!Array.isArray(entry.subjects) || entry.subjects.length === 0) throw new Error(`SUBJECTS_ABSENT id=${id}`);
    if (!Array.isArray(entry.evidence_refs) || entry.evidence_refs.length === 0) throw new Error(`EVIDENCE_REFS_ABSENT id=${id}`);

    for (const subject of entry.subjects) {
      if (!subject.path || !subject.git_blob_sha) throw new Error(`SUBJECT_BINDING_INCOMPLETE id=${id}`);
      if (!exists(subject.path)) throw new Error(`SUBJECT_PATH_ABSENT id=${id} path=${subject.path}`);
      if (!/^[0-9a-f]{40}$/.test(subject.git_blob_sha)) throw new Error(`SUBJECT_BLOB_INVALID id=${id} path=${subject.path}`);
      const current = workingBlob(subject.path);
      if (current !== subject.git_blob_sha) throw new Error(`CURRENT_SUBJECT_DRIFT id=${id} path=${subject.path} expected=${subject.git_blob_sha} actual=${current}`);
      const historical = historicalBlob(entry.subject_sha, subject.path);
      if (historical !== subject.git_blob_sha) throw new Error(`QUALIFIED_SUBJECT_MISMATCH id=${id} path=${subject.path} expected=${subject.git_blob_sha} at_subject=${historical}`);
    }
    verifyTransitiveValidatorDependencies(entry);

    if (entry.status === 'PASS') {
      const q = entry.qualification || {};
      for (const field of ['workflow_run_id','workflow_name','artifact_id','artifact_name','artifact_digest','head_sha','conclusion']) requireField(q, field, id);
      if (q.head_sha !== entry.subject_sha) throw new Error(`QUALIFICATION_HEAD_MISMATCH id=${id} expected=${entry.subject_sha} actual=${q.head_sha}`);
      if (q.conclusion !== 'success') throw new Error(`QUALIFICATION_NOT_SUCCESS id=${id} conclusion=${q.conclusion}`);
      if (!Number.isInteger(q.workflow_run_id) || q.workflow_run_id <= 0) throw new Error(`WORKFLOW_RUN_ID_INVALID id=${id}`);
      if (!Number.isInteger(q.artifact_id) || q.artifact_id <= 0) throw new Error(`ARTIFACT_ID_INVALID id=${id}`);
      if (!/^sha256:[0-9a-f]{64}$/.test(q.artifact_digest)) throw new Error(`ARTIFACT_DIGEST_INVALID id=${id}`);
      pass += 1;
    } else if (entry.status === 'BLOCKED_EXTERNAL_HUMAN_PRIVATE_NATIVE') {
      blocked += 1;
    } else {
      throw new Error(`EVIDENCE_STATUS_INVALID id=${id} status=${entry.status}`);
    }
  }
  process.stdout.write(`${JSON.stringify({registry_id:registry.registry_id,authority_id:registry.authority_id,entries:seen.size,pass,blocked,result:'PASS'},null,2)}\n`);
}

try { main(); }
catch (error) { process.stderr.write(`FOUNDATION_EVIDENCE_VERIFY=FAIL ${error.message}\n`); process.exit(2); }
