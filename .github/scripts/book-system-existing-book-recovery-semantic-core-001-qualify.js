'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const recovery = require(path.join(root, 'system-master/book-system/existing-book-recovery.js'));
const guard = require(path.join(root, 'system-master/book-system/author-decision-current-subject-guard.js'));
const vr = require(path.join(root, 'system-master/book-system/version-and-rollback.js'));
const corpus = JSON.parse(fs.readFileSync(path.join(root, 'qualification/book-system/existing-book-recovery-semantic-core-001/BOOK-SYSTEM-EXISTING-BOOK-RECOVERY-SEMANTIC-CORE-001-FIXTURES.json'), 'utf8'));
const vrFixtures = JSON.parse(fs.readFileSync(path.join(root, 'qualification/book-system/version-and-rollback-001/BOOK-SYSTEM-VERSION-AND-ROLLBACK-001-FIXTURES.json'), 'utf8'));

const evidenceDir = path.join(process.env.RUNNER_TEMP || root, 'book-existing-recovery-evidence');
fs.mkdirSync(evidenceDir, {recursive: true});

let assertions = 0;
const cases = [];
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function ok(value, code) { assertions += 1; if (!value) throw new Error(code); }
function same(a, b, code) { ok(recovery.stableStringify(a) === recovery.stableStringify(b), code); }
function record(caseId, detail = {}) { cases.push({case_id: caseId, result: 'PASS', ...detail}); }
function finding(out, code) { return out.recovered_book_baseline.unresolved_findings.find(f => f.finding_code === code); }
function expectCode(fn, codes, caseId) {
  assertions += 1;
  try { fn(); } catch (e) {
    if (codes.includes(e && e.code)) { record(caseId, {observed_code: e.code}); return; }
    throw new Error(`${caseId}:WRONG_ERROR:${e && e.code}:${e && e.message}`);
  }
  throw new Error(`${caseId}:EXPECTED_ERROR_NOT_THROWN`);
}
function request(id, sources, extra = {}) {
  return {recovery_request_id: id, recovery_session_id: `SESSION-${id}`, sources: clone(sources), ...clone(extra)};
}
function hex(ch) { return String(ch).repeat(64); }

// EBR-001: clean incomplete manuscript -> proposed baseline, no canonical mutation, author ratification next.
{
  const out = recovery.recoverExistingBook(request('EBR-001', [corpus.base_source]));
  const b = out.recovered_book_baseline;
  ok(b.candidate_revision_graph.proposed_selected_candidate_id === 'CANDIDATE-001', 'EBR-001_SELECTION');
  ok(b.book_maturity_profile.exact_next_gate === 'AUTHOR_RATIFICATION', 'EBR-001_NEXT_GATE');
  ok(b.canonical_book_mutation_performed === false && b.lifecycle_join_authorized === false, 'EBR-001_MUTATION_BOUNDARY');
  ok(b.author_decision_batch.decisions.some(d => d.decision_family === 'RATIFY_RECOVERED_BOOK_BASELINE'), 'EBR-001_RATIFICATION_MISSING');
  record('EBR-001');
}

// EBR-002: published accepted edition + later unratified partial revision preserve accepted authority and later candidate/open work.
{
  const out = recovery.recoverExistingBook(request('EBR-002', [corpus.published_source, corpus.later_revision_source]));
  const b = out.recovered_book_baseline;
  ok(b.candidate_revision_graph.proposed_selected_candidate_id === 'CANDIDATE-PUBLISHED', 'EBR-002_ACCEPTED_AUTHORITY_LOST');
  ok(b.candidate_revision_graph.nodes.some(n => n.candidate_id === 'CANDIDATE-REVISION'), 'EBR-002_REVISION_LOST');
  ok(finding(out, 'NEAR_DUPLICATE_CANDIDATES'), 'EBR-002_NEAR_DUPLICATE_NOT_RECORDED');
  ok(finding(out, 'EXPLICIT_OPEN_ITEMS_RECOVERED'), 'EBR-002_OPEN_ITEMS_NOT_RECORDED');
  record('EBR-002');
}

// EBR-003: exact content duplicates may share bytes later but semantic candidate identities remain distinct.
{
  const a = clone(corpus.base_source);
  const b = clone(corpus.base_source);
  b.source_id = 'SRC-DRAFT-DUP'; b.source_digest = hex('e'); b.version_candidate.candidate_id = 'CANDIDATE-DUP'; b.version_candidate.version_id = 'V1-DUP';
  const out = recovery.recoverExistingBook(request('EBR-003', [a, b]));
  const f = finding(out, 'EXACT_CONTENT_DUPLICATES');
  ok(f && f.disposition === 'SHAREABLE_STORAGE_ONLY__DO_NOT_COLLAPSE_SEMANTIC_IDENTITIES', 'EBR-003_DEDUP_BOUNDARY');
  ok(out.recovered_book_baseline.candidate_revision_graph.nodes.length === 2, 'EBR-003_IDENTITIES_COLLAPSED');
  record('EBR-003');
}

// EBR-004: near-duplicate conflicting heads stay unresolved and require author version selection.
{
  const a = clone(corpus.base_source);
  const b = clone(corpus.base_source);
  b.source_id = 'SRC-NEAR-002'; b.source_digest = hex('f'); b.version_candidate.candidate_id = 'CANDIDATE-NEAR-002'; b.version_candidate.version_id = 'V2?'; b.version_candidate.content_digest = hex('5');
  b.normalized_projection.metadata.title = 'Conflicting Synthetic Title';
  const out = recovery.recoverExistingBook(request('EBR-004', [a, b]));
  const base = out.recovered_book_baseline;
  ok(finding(out, 'NEAR_DUPLICATE_CANDIDATES'), 'EBR-004_NEAR_DUPLICATE_MISSING');
  ok(finding(out, 'VERSION_AUTHORITY_AMBIGUOUS'), 'EBR-004_VERSION_AMBIGUITY_MISSING');
  ok(finding(out, 'SEMANTIC_METADATA_CONFLICT'), 'EBR-004_METADATA_CONFLICT_MISSING');
  ok(base.book_maturity_profile.exact_next_gate === 'VERSION_GRAPH', 'EBR-004_WRONG_NEXT_GATE');
  ok(base.author_decision_batch.decisions.some(d => d.decision_family === 'SELECT_RECOVERED_MANUSCRIPT_VERSION'), 'EBR-004_AUTHOR_DECISION_MISSING');
  record('EBR-004');
}

// EBR-005: filesystem timestamps are ignored for semantic identity/selection; revision graph wins.
{
  const old = clone(corpus.published_source);
  const next = clone(corpus.later_revision_source);
  old.version_candidate.authority_signal = 'UNRATIFIED';
  old.filesystem_mtime = '2030-01-01T00:00:00Z';
  next.filesystem_mtime = '2020-01-01T00:00:00Z';
  const r1 = request('EBR-005A', [old, next]);
  r1.recovery_session_id = 'SESSION-TIMESTAMP-INDEPENDENCE';
  const out1 = recovery.recoverExistingBook(r1);
  ok(out1.recovered_book_baseline.candidate_revision_graph.proposed_selected_candidate_id === 'CANDIDATE-REVISION', 'EBR-005_TIMESTAMP_SELECTED_OLD');
  old.filesystem_mtime = '1999-01-01T00:00:00Z'; next.filesystem_mtime = '2099-01-01T00:00:00Z';
  const r2 = request('EBR-005B', [old, next]);
  r2.recovery_session_id = 'SESSION-TIMESTAMP-INDEPENDENCE';
  const out2 = recovery.recoverExistingBook(r2);
  ok(out1.recovered_book_baseline.baseline_digest === out2.recovered_book_baseline.baseline_digest, 'EBR-005_MTIME_CHANGED_BASELINE');
  record('EBR-005');
}

// EBR-006: ambiguous structure is preserved and blocks at the structure gate rather than guessed away.
{
  const s = clone(corpus.base_source);
  s.normalized_projection.structure[1].confidence = 0.40;
  s.normalized_projection.structure[1].ambiguous = true;
  const out = recovery.recoverExistingBook(request('EBR-006', [s]));
  ok(finding(out, 'STRUCTURE_BOUNDARIES_AMBIGUOUS'), 'EBR-006_AMBIGUITY_MISSING');
  ok(out.recovered_book_baseline.book_maturity_profile.exact_next_gate === 'STRUCTURE_RECONSTRUCTION', 'EBR-006_WRONG_NEXT_GATE');
  ok(out.recovered_book_baseline.reconstructed_structure.ordered_structure[1].ambiguous === true, 'EBR-006_STRUCTURE_GUESSED');
  record('EBR-006');
}

// EBR-007: comments, TODOs and tracked changes survive as explicit open items.
{
  const out = recovery.recoverExistingBook(request('EBR-007', [corpus.later_revision_source]));
  const items = out.recovered_book_baseline.proposed_semantic_state.explicit_open_items;
  ok(items.some(i => i.kind === 'TODO'), 'EBR-007_TODO_LOST');
  ok(items.some(i => i.kind === 'COMMENT_OR_EDITOR_QUERY'), 'EBR-007_COMMENT_LOST');
  ok(items.some(i => i.kind === 'TRACKED_CHANGE'), 'EBR-007_TRACKED_CHANGE_LOST');
  record('EBR-007');
}

// EBR-008: fiction extraction remains Story Bible proposal state only.
{
  const out = recovery.recoverExistingBook(request('EBR-008', [corpus.fiction_source]));
  const candidates = out.recovered_book_baseline.proposed_semantic_state.story_bible_candidates;
  ok(candidates.length === 1, 'EBR-008_STORY_CANDIDATE_MISSING');
  ok(candidates[0].standing === 'PROPOSED_NOT_CANONICAL', 'EBR-008_STORY_AUTO_CANONIZED');
  ok(out.recovery_receipt.canonical_mutation_performed === false, 'EBR-008_CANON_MUTATION');
  record('EBR-008');
}

// EBR-009: nonfiction knowledge/evidence remains proposal state and imported citation form is retained.
{
  const out = recovery.recoverExistingBook(request('EBR-009', [corpus.base_source]));
  const s = out.recovered_book_baseline.proposed_semantic_state;
  ok(s.nonfiction_knowledge_candidates.length === 1 && s.nonfiction_knowledge_candidates[0].standing === 'PROPOSED_NOT_CANONICAL', 'EBR-009_KNOWLEDGE_AUTO_ACCEPTED');
  ok(s.citations_imported.length === 1, 'EBR-009_CITATION_LOST');
  ok(s.authority_standing === 'PROPOSED_ONLY__NO_AUTOMATIC_CANON_OR_ACCEPTED_TEXT_MUTATION', 'EBR-009_AUTHORITY_BOUNDARY');
  record('EBR-009');
}

// EBR-010: integration regression - existing strict current-subject guard rejects an old manuscript version after successor creation.
{
  const initial = vr.createVersionLedger(vrFixtures.parent_state_template);
  const parent = initial.parent_state;
  const records = vr.objectRecords(parent).filter(r => r.type === 'MANUSCRIPT_MANIFEST');
  const old = records.find(r => parent.active.canonical_manuscript_ref === r.object_id || parent.active.canonical_manuscript_ref === `${r.object_id}:${r.object_version}`);
  ok(!!old, 'EBR-010_ACTIVE_MANUSCRIPT_MISSING');
  const oldRef = {object_id: old.object_id, object_version: String(old.object_version), object_digest: old.object_digest};
  const next = clone(parent); delete next.state_digest; next.state_version = parent.state_version + 1;
  next.manuscripts.push({manuscript_id: old.object_id, version_id: 'V-EBR-NEXT', artifact_digest: hex('6'), authority_state: 'CANONICAL', parent_version_ref: `${old.object_id}:${old.object_version}`, change_set_ref: 'EBR-CHANGE', created_by: 'BOOK_SYSTEM_PARENT', created_at: '2026-09-10T14:45:00Z'});
  next.active.canonical_manuscript_ref = `${old.object_id}:V-EBR-NEXT`;
  const sealed = vr.sealState(next);
  ok(guard.strictSubjectCurrent(sealed, [oldRef]) === false, 'EBR-010_STALE_SUBJECT_ACCEPTED');
  record('EBR-010');
}

// EBR-011: exact repeat is idempotent and deterministic.
{
  const req = request('EBR-011', [corpus.base_source]);
  const a = recovery.recoverExistingBook(req);
  const b = recovery.recoverExistingBook(clone(req));
  ok(a.recovered_book_baseline.baseline_digest === b.recovered_book_baseline.baseline_digest, 'EBR-011_BASELINE_NONDETERMINISTIC');
  ok(a.recovery_receipt.recovery_receipt_id === b.recovery_receipt.recovery_receipt_id, 'EBR-011_RECEIPT_NONDETERMINISTIC');
  same(a.recovered_book_baseline, b.recovered_book_baseline, 'EBR-011_OUTPUT_DIFFERS');
  record('EBR-011');
}

// EBR-012: checkpoint interruption/resume validates exact input and reproduces the same baseline.
{
  const req = request('EBR-012', [corpus.base_source]);
  const first = recovery.recoverExistingBook(req);
  const cp = first.checkpoints.find(c => c.phase === 'STRUCTURE_RECONSTRUCTION');
  ok(!!cp, 'EBR-012_CHECKPOINT_MISSING');
  const resumed = recovery.resumeExistingBookRecovery(req, cp);
  ok(resumed.recovered_book_baseline.baseline_digest === first.recovered_book_baseline.baseline_digest, 'EBR-012_RESUME_CHANGED_BASELINE');
  ok(resumed.resume_receipt.resumed_from_checkpoint_id === cp.checkpoint_id, 'EBR-012_RESUME_RECEIPT_WRONG');
  const changed = clone(req); changed.sources[0].source_digest = hex('9');
  expectCode(() => recovery.resumeExistingBookRecovery(changed, cp), ['RECOVERY_CHECKPOINT_INPUT_MISMATCH'], 'EBR-012-NEG');
  record('EBR-012');
}

// EBR-013: NEW_EDITION re-entry preserves prior edition lineage and forbids history rewrite.
{
  const out = recovery.recoverExistingBook(request('EBR-013', [corpus.later_revision_source], {
    reentry_mode: 'NEW_EDITION',
    prior_edition_ref: {edition_id: 'EDITION-1', edition_digest: hex('7')}
  }));
  const line = out.recovered_book_baseline.edition_lineage;
  ok(line.relationship === 'NEW_EDITION_OF', 'EBR-013_LINEAGE_RELATION');
  ok(line.prior_edition_ref.edition_id === 'EDITION-1', 'EBR-013_PRIOR_EDITION_LOST');
  ok(line.history_rewrite_permitted === false, 'EBR-013_HISTORY_REWRITE_ALLOWED');
  record('EBR-013');
}

// Contract-negative cases: malformed inputs fail closed without an output baseline.
expectCode(() => recovery.recoverExistingBook({recovery_session_id: 'EMPTY', sources: []}), ['RECOVERY_SOURCES_REQUIRED'], 'EBR-N01');
{
  const s = clone(corpus.base_source); s.source_digest = 'bad';
  expectCode(() => recovery.recoverExistingBook(request('N02', [s])), ['SOURCE_DIGEST_REQUIRED'], 'EBR-N02');
}
{
  const a = clone(corpus.base_source), b = clone(corpus.base_source); b.version_candidate.candidate_id = 'CANDIDATE-X';
  expectCode(() => recovery.recoverExistingBook(request('N03', [a, b])), ['DUPLICATE_SOURCE_ID'], 'EBR-N03');
}
{
  const s = clone(corpus.base_source); s.version_candidate.parent_candidate_ids = ['DOES-NOT-EXIST'];
  expectCode(() => recovery.recoverExistingBook(request('N04', [s])), ['UNKNOWN_PARENT_CANDIDATE'], 'EBR-N04');
}

const plannedPositive = new Set(cases.filter(c => /^EBR-\d{3}$/.test(c.case_id)).map(c => c.case_id));
const plannedNegative = new Set(cases.filter(c => /^EBR-N\d{2}$/.test(c.case_id)).map(c => c.case_id));
const summary = {
  qualification_id: 'BOOK-SYSTEM-EXISTING-BOOK-RECOVERY-SEMANTIC-CORE-001-DETERMINISTIC-QUALIFIER-001',
  engine_id: recovery.ENGINE_ID,
  profile_version: recovery.PROFILE_VERSION,
  result_class: plannedPositive.size === 13 && plannedNegative.size === 4 ? 'PASS' : 'FAIL',
  planned_positive_cases: 13,
  passed_positive_cases: plannedPositive.size,
  planned_negative_cases: 4,
  passed_negative_cases: plannedNegative.size,
  assertions,
  subject_sha: process.env.GITHUB_SHA || 'LOCAL',
  fixture_class: corpus.fixture_class,
  native_parser_or_provider_called: false,
  private_manuscript_used: false,
  author_decision_observed_or_created: false,
  canonical_book_mutation_performed: false,
  a01_pass_claimed: false,
  native_device_pass_claimed: false,
  production_or_publication_pass_claimed: false,
  cases
};
fs.writeFileSync(path.join(evidenceDir, 'qualification-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.result_class !== 'PASS') process.exit(1);
