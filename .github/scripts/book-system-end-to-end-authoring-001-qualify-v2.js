'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const evidenceDir = process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || workspace, 'book-system-e2e-authoring-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const SOURCE = '.github/scripts/book-system-end-to-end-authoring-001-qualify.js';
const AMENDMENT = 'qualification/book-system/end-to-end-authoring-001/BOOK-SYSTEM-END-TO-END-AUTHORING-QUALIFICATION-001-REPAIR-AMENDMENT-001.json';
const STATE = 'qualification/book-system/BOOK-SYSTEM-RECONCILED-STATE-022.json';
const AUTHOR_GUARD = 'system-master/book-system/author-decision-current-subject-guard.js';
const FREEZE_GUARD = 'system-master/book-system/export-freeze-parent-admission-guard.js';
const QUALIFIED_GUARD_SUBJECT = 'a119ccdf77b61011b1093006b55367fc3e5a65c2';
const QUALIFICATION_ID = 'BOOK-SYSTEM-END-TO-END-AUTHORING-QUALIFICATION-001';

function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(workspace, rel), 'utf8')); }
function sha256(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function shaFile(rel) { return sha256(fs.readFileSync(path.join(workspace, rel))); }
function assert(ok, code, detail = '') { if (!ok) throw Object.assign(new Error(detail ? `${code}:${detail}` : code), { code }); }
function git(args, encoding = 'utf8') {
  return spawnSync('git', ['-c', `safe.directory=${workspace}`, ...args], { cwd: workspace, encoding, windowsHide: true, shell: false });
}
function gitHead() { const r = git(['rev-parse', 'HEAD']); assert(r.status === 0, 'GIT_HEAD_FAILED', r.stderr || ''); return r.stdout.trim(); }
function sameHistoricalBytes(subjectSha, rel) {
  const historical = git(['show', `${subjectSha}:${rel}`], null);
  const current = git(['show', `HEAD:${rel}`], null);
  assert(historical.status === 0 && current.status === 0, 'GIT_SHOW_FAILED', rel);
  return Buffer.compare(historical.stdout || Buffer.alloc(0), current.stdout || Buffer.alloc(0)) === 0;
}
function replaceOnce(source, before, after, id) {
  const first = source.indexOf(before);
  assert(first >= 0, 'PATCH_MARKER_NOT_FOUND', id);
  assert(source.indexOf(before, first + before.length) < 0, 'PATCH_MARKER_NOT_UNIQUE', id);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const amendment = readJson(AMENDMENT);
const state = readJson(STATE);
assert(amendment.parent_qualification === QUALIFICATION_ID, 'AMENDMENT_QUALIFICATION_MISMATCH');
assert(amendment.qualified_guard_dependency.subject_sha === QUALIFIED_GUARD_SUBJECT, 'AMENDMENT_GUARD_SUBJECT_MISMATCH');
assert(amendment.qualified_guard_dependency.a01_result === 'PASS', 'AMENDMENT_GUARD_NOT_A01_PASS');
assert(state.current_parent_critical_path.parent_objective === QUALIFICATION_ID, 'STATE_OBJECTIVE_MISMATCH');
assert(state.closed_repair.qualified_subject_sha === QUALIFIED_GUARD_SUBJECT, 'STATE_GUARD_SUBJECT_MISMATCH');
assert(state.closed_repair.a01_result === 'PASS__24_OF_24', 'STATE_GUARD_A01_RESULT_MISMATCH');
assert(sameHistoricalBytes(QUALIFIED_GUARD_SUBJECT, AUTHOR_GUARD), 'AUTHOR_GUARD_BYTES_DRIFTED_FROM_A01_SUBJECT');
assert(sameHistoricalBytes(QUALIFIED_GUARD_SUBJECT, FREEZE_GUARD), 'FREEZE_GUARD_BYTES_DRIFTED_FROM_A01_SUBJECT');

const head = gitHead();
assert(head !== QUALIFIED_GUARD_SUBJECT, 'E2E_SUBJECT_MUST_NOT_EQUAL_GUARD_SUBJECT');

let source = fs.readFileSync(path.join(workspace, SOURCE), 'utf8');
const sourceSha = sha256(source);
source = replaceOnce(
  source,
  "const adq = require(path.join(workspace, rel.author));",
  "const adq = require(path.join(workspace, 'system-master/book-system/author-decision-current-subject-guard.js'));",
  'AUTHOR_SURFACE_ROUTE'
);
source = replaceOnce(
  source,
  "const ef = require(path.join(workspace, rel.exportFreeze));",
  "const ef = require(path.join(workspace, 'system-master/book-system/export-freeze-parent-admission-guard.js'));",
  'EXPORT_FREEZE_SURFACE_ROUTE'
);
source = replaceOnce(
  source,
  "assert(snap.queue_state==='STALE','CHANGED_SUBJECT_DID_NOT_STALE_AUTHOR_REQUEST');",
  "assert(adq.effectiveDecisionState(reval.queue_ledger,currentId)==='STALE','CHANGED_SUBJECT_DID_NOT_STALE_AUTHOR_REQUEST');",
  'E2E019_EFFECTIVE_STALE_ASSERTION'
);

const generatedPath = path.join(evidenceDir, 'book-system-end-to-end-authoring-001-generated-v2.js');
fs.writeFileSync(generatedPath, source, 'utf8');
const generatedSha = sha256(source);

const child = spawnSync(process.execPath, [generatedPath], {
  cwd: workspace,
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
  shell: false,
});
assert(child.error == null, 'E2E_CHILD_EXECUTION_ERROR', child.error && child.error.message || '');

const summaryPath = path.join(evidenceDir, 'summary.json');
assert(fs.existsSync(summaryPath), 'E2E_SUMMARY_MISSING');
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
summary.repair_amendment = {
  amendment_id: amendment.amendment_id,
  amendment_sha256: shaFile(AMENDMENT),
  state_id: state.state_id,
  state_sha256: shaFile(STATE),
  guard_qualification_id: amendment.qualified_guard_dependency.qualification_id,
  guard_subject_sha: QUALIFIED_GUARD_SUBJECT,
  guard_a01_run_id: amendment.qualified_guard_dependency.a01_run_id,
  guard_a01_registry_version: amendment.qualified_guard_dependency.a01_registry_version,
  guard_a01_evidence_artifact_id: amendment.qualified_guard_dependency.a01_evidence_artifact_id,
  author_guard_sha256: shaFile(AUTHOR_GUARD),
  freeze_guard_sha256: shaFile(FREEZE_GUARD),
};
summary.qualifier_surface = {
  source_v1_path: SOURCE,
  source_v1_sha256: sourceSha,
  successor_v2_path: '.github/scripts/book-system-end-to-end-authoring-001-qualify-v2.js',
  successor_v2_sha256: shaFile('.github/scripts/book-system-end-to-end-authoring-001-qualify-v2.js'),
  generated_runtime_sha256: generatedSha,
  transformations: [
    'AUTHOR_SURFACE_ROUTE_TO_EXACT_A01_QUALIFIED_CURRENT_SUBJECT_GUARD',
    'EXPORT_FREEZE_SURFACE_ROUTE_TO_EXACT_A01_QUALIFIED_PARENT_ADMISSION_GUARD',
    'E2E019_ASSERTS_EFFECTIVE_GUARDED_STALENESS_WITHOUT_REWRITING_BASE_HISTORY'
  ]
};
summary.authority = Object.assign({}, summary.authority || {}, {
  guard_qualification_transfer: false,
  real_author_authority: false,
  production_publication_authority: false,
  promotion_authority: false,
});
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
fs.writeFileSync(path.join(evidenceDir, 'repair-amendment.json'), JSON.stringify(summary.repair_amendment, null, 2), 'utf8');
fs.writeFileSync(path.join(evidenceDir, 'qualifier-surface.json'), JSON.stringify(summary.qualifier_surface, null, 2), 'utf8');

assert(child.status === 0, 'E2E_48_CASE_CHILD_FAILED', `exit=${child.status}`);
assert(summary.qualification_id === QUALIFICATION_ID, 'E2E_QUALIFICATION_ID_MISMATCH');
assert(summary.subject_sha === head, 'E2E_SUBJECT_SHA_MISMATCH');
assert(summary.case_count === 48 && summary.pass_count === 48 && summary.fail_count === 0 && summary.result_class === 'PASS', 'E2E_NOT_48_OF_48_PASS');
assert(summary.repair_amendment.guard_subject_sha === QUALIFIED_GUARD_SUBJECT, 'E2E_GUARD_BINDING_LOST');

fs.writeFileSync(path.join(evidenceDir, 'result.txt'), `result=PASS\npass_count=48\nfail_count=0\nsubject_sha=${head}\nguard_subject_sha=${QUALIFIED_GUARD_SUBJECT}\n`, 'utf8');
console.log(JSON.stringify({
  qualification_id: QUALIFICATION_ID,
  subject_sha: head,
  case_count: 48,
  pass_count: 48,
  fail_count: 0,
  result_class: 'PASS',
  guard_subject_sha: QUALIFIED_GUARD_SUBJECT,
  amendment_id: amendment.amendment_id,
  authority: summary.authority,
}, null, 2));
