'use strict';

const fs = require('fs');
const path = require('path');
const root = process.env.GITHUB_WORKSPACE || process.cwd();
const recovery = require(path.join(root, 'system-master/book-system/existing-book-recovery.js'));
const guard = require(path.join(root, 'system-master/book-system/author-decision-current-subject-guard.js'));
const vr = require(path.join(root, 'system-master/book-system/version-and-rollback.js'));
const corpus = JSON.parse(fs.readFileSync(path.join(root, 'qualification/book-system/existing-book-recovery-semantic-core-001/BOOK-SYSTEM-EXISTING-BOOK-RECOVERY-SEMANTIC-CORE-001-FIXTURES.json'), 'utf8'));
const vrFixtures = JSON.parse(fs.readFileSync(path.join(root, 'qualification/book-system/version-and-rollback-001/BOOK-SYSTEM-VERSION-AND-ROLLBACK-001-FIXTURES.json'), 'utf8'));
const evidenceDir = path.join(process.env.RUNNER_TEMP || root, 'book-existing-recovery-evidence');
fs.mkdirSync(evidenceDir, {recursive: true});

let assertions = 0;
const results = [];
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function hex(ch) { return String(ch).repeat(64); }
function ok(v, code) { assertions += 1; if (!v) { const e = new Error(code); e.code = code; throw e; } }
function req(id, sources, extra = {}) { return {recovery_request_id:id, recovery_session_id:`SESSION-${id}`, sources:clone(sources), ...clone(extra)}; }
function finding(out, code) { return out.recovered_book_baseline.unresolved_findings.find(f => f.finding_code === code); }
function run(id, fn) {
  try { fn(); results.push({case_id:id, result:'PASS'}); }
  catch (e) { results.push({case_id:id, result:'FAIL', observed_code:e && e.code || null, detail:e && e.message || String(e)}); }
}
function expectError(id, expected, fn) {
  run(id, () => {
    let observed = null;
    try { fn(); } catch (e) { observed = e && e.code; }
    ok(expected.includes(observed), `${id}:EXPECTED_${expected.join('_OR_')}_GOT_${observed || 'NO_ERROR'}`);
  });
}
function standaloneRevision() {
  const s = clone(corpus.later_revision_source);
  s.version_candidate.parent_candidate_ids = [];
  return s;
}

run('EBR-001', () => {
  const out = recovery.recoverExistingBook(req('EBR-001', [corpus.base_source]));
  const b = out.recovered_book_baseline;
  ok(b.candidate_revision_graph.proposed_selected_candidate_id === 'CANDIDATE-001', 'CLEAN_SELECTION');
  ok(b.book_maturity_profile.exact_next_gate === 'AUTHOR_RATIFICATION', 'CLEAN_NEXT_GATE');
  ok(!b.canonical_book_mutation_performed && !b.lifecycle_join_authorized, 'CANONICAL_MUTATION_BOUNDARY');
  ok(b.author_decision_batch.decisions.some(d => d.decision_family === 'RATIFY_RECOVERED_BOOK_BASELINE'), 'RATIFICATION_DECISION');
});

run('EBR-002', () => {
  const out = recovery.recoverExistingBook(req('EBR-002', [corpus.published_source, corpus.later_revision_source]));
  const b = out.recovered_book_baseline;
  ok(b.candidate_revision_graph.proposed_selected_candidate_id === 'CANDIDATE-PUBLISHED', 'ACCEPTED_AUTHORITY_LOST');
  ok(b.candidate_revision_graph.nodes.some(n => n.candidate_id === 'CANDIDATE-REVISION'), 'LATER_REVISION_LOST');
  ok(!!finding(out, 'NEAR_DUPLICATE_CANDIDATES'), 'NEAR_DUPLICATE_MISSING');
  ok(!!finding(out, 'EXPLICIT_OPEN_ITEMS_RECOVERED'), 'OPEN_ITEMS_MISSING');
});

run('EBR-003', () => {
  const a = clone(corpus.base_source), b = clone(corpus.base_source);
  b.source_id='SRC-DRAFT-DUP'; b.source_digest=hex('e'); b.version_candidate.candidate_id='CANDIDATE-DUP'; b.version_candidate.version_id='V1-DUP';
  const out = recovery.recoverExistingBook(req('EBR-003', [a,b]));
  const f = finding(out, 'EXACT_CONTENT_DUPLICATES');
  ok(!!f, 'EXACT_DUPLICATE_MISSING');
  ok(f.disposition === 'SHAREABLE_STORAGE_ONLY__DO_NOT_COLLAPSE_SEMANTIC_IDENTITIES', 'DEDUP_AUTHORITY');
  ok(out.recovered_book_baseline.candidate_revision_graph.nodes.length === 2, 'SEMANTIC_IDENTITIES_COLLAPSED');
});

run('EBR-004', () => {
  const a=clone(corpus.base_source), b=clone(corpus.base_source);
  b.source_id='SRC-NEAR-002'; b.source_digest=hex('f'); b.version_candidate.candidate_id='CANDIDATE-NEAR-002'; b.version_candidate.version_id='V2?'; b.version_candidate.content_digest=hex('5');
  b.normalized_projection.metadata.title='Conflicting Synthetic Title';
  const out = recovery.recoverExistingBook(req('EBR-004',[a,b]));
  const rb = out.recovered_book_baseline;
  ok(!!finding(out,'NEAR_DUPLICATE_CANDIDATES'),'NEAR_DUPLICATE');
  ok(!!finding(out,'VERSION_AUTHORITY_AMBIGUOUS'),'VERSION_AMBIGUITY');
  ok(!!finding(out,'SEMANTIC_METADATA_CONFLICT'),'METADATA_CONFLICT');
  ok(rb.book_maturity_profile.exact_next_gate==='VERSION_GRAPH','VERSION_NEXT_GATE');
  ok(rb.author_decision_batch.decisions.some(d=>d.decision_family==='SELECT_RECOVERED_MANUSCRIPT_VERSION'),'VERSION_AUTHOR_DECISION');
});

run('EBR-005', () => {
  const old=clone(corpus.published_source), next=clone(corpus.later_revision_source);
  old.version_candidate.authority_signal='UNRATIFIED'; old.filesystem_mtime='2030-01-01T00:00:00Z'; next.filesystem_mtime='2020-01-01T00:00:00Z';
  const a=req('EBR-005A',[old,next]); a.recovery_session_id='SESSION-TIMESTAMP-INDEPENDENCE';
  const out1=recovery.recoverExistingBook(a);
  ok(out1.recovered_book_baseline.candidate_revision_graph.proposed_selected_candidate_id==='CANDIDATE-REVISION','TIMESTAMP_SELECTED_OLD');
  old.filesystem_mtime='1999-01-01T00:00:00Z'; next.filesystem_mtime='2099-01-01T00:00:00Z';
  const b=req('EBR-005B',[old,next]); b.recovery_session_id='SESSION-TIMESTAMP-INDEPENDENCE';
  const out2=recovery.recoverExistingBook(b);
  ok(out1.recovered_book_baseline.baseline_digest===out2.recovered_book_baseline.baseline_digest,'MTIME_CHANGED_BASELINE');
});

run('EBR-006', () => {
  const s=clone(corpus.base_source); s.normalized_projection.structure[1].confidence=0.4; s.normalized_projection.structure[1].ambiguous=true;
  const out=recovery.recoverExistingBook(req('EBR-006',[s]));
  ok(!!finding(out,'STRUCTURE_BOUNDARIES_AMBIGUOUS'),'STRUCTURE_AMBIGUITY');
  ok(out.recovered_book_baseline.book_maturity_profile.exact_next_gate==='STRUCTURE_RECONSTRUCTION','STRUCTURE_NEXT_GATE');
  ok(out.recovered_book_baseline.reconstructed_structure.ordered_structure[1].ambiguous===true,'STRUCTURE_GUESSED');
});

run('EBR-007', () => {
  const out=recovery.recoverExistingBook(req('EBR-007',[standaloneRevision()]));
  const items=out.recovered_book_baseline.proposed_semantic_state.explicit_open_items;
  ok(items.some(i=>i.kind==='TODO'),'TODO_LOST');
  ok(items.some(i=>i.kind==='COMMENT_OR_EDITOR_QUERY'),'COMMENT_LOST');
  ok(items.some(i=>i.kind==='TRACKED_CHANGE'),'TRACKED_CHANGE_LOST');
});

run('EBR-008', () => {
  const out=recovery.recoverExistingBook(req('EBR-008',[corpus.fiction_source]));
  const c=out.recovered_book_baseline.proposed_semantic_state.story_bible_candidates;
  ok(c.length===1 && c[0].standing==='PROPOSED_NOT_CANONICAL','STORY_AUTO_CANONIZED');
  ok(out.recovery_receipt.canonical_mutation_performed===false,'STORY_CANON_MUTATION');
});

run('EBR-009', () => {
  const out=recovery.recoverExistingBook(req('EBR-009',[corpus.base_source]));
  const s=out.recovered_book_baseline.proposed_semantic_state;
  ok(s.nonfiction_knowledge_candidates.length===1 && s.nonfiction_knowledge_candidates[0].standing==='PROPOSED_NOT_CANONICAL','KNOWLEDGE_AUTO_ACCEPTED');
  ok(s.citations_imported.length===1,'CITATION_LOST');
  ok(s.authority_standing==='PROPOSED_ONLY__NO_AUTOMATIC_CANON_OR_ACCEPTED_TEXT_MUTATION','SEMANTIC_AUTHORITY');
});

run('EBR-010', () => {
  const initial=vr.createVersionLedger(vrFixtures.parent_state_template), parent=initial.parent_state;
  const records=vr.objectRecords(parent).filter(r=>r.type==='MANUSCRIPT_MANIFEST');
  const old=records.find(r=>parent.active.canonical_manuscript_ref===r.object_id || parent.active.canonical_manuscript_ref===`${r.object_id}:${r.object_version}`);
  ok(!!old,'ACTIVE_MANUSCRIPT_MISSING');
  const oldRef={object_id:old.object_id,object_version:String(old.object_version),object_digest:old.object_digest};
  const next=clone(parent); delete next.state_digest; next.state_version=parent.state_version+1;
  next.manuscripts.push({manuscript_id:old.object_id,version_id:'V-EBR-NEXT',artifact_digest:hex('6'),authority_state:'CANONICAL',parent_version_ref:`${old.object_id}:${old.object_version}`,change_set_ref:'EBR-CHANGE',created_by:'BOOK_SYSTEM_PARENT',created_at:'2026-09-10T14:45:00Z'});
  next.active.canonical_manuscript_ref=`${old.object_id}:V-EBR-NEXT`;
  ok(guard.strictSubjectCurrent(vr.sealState(next),[oldRef])===false,'STALE_SUBJECT_ACCEPTED');
});

run('EBR-011', () => {
  const r=req('EBR-011',[corpus.base_source]), a=recovery.recoverExistingBook(r), b=recovery.recoverExistingBook(clone(r));
  ok(a.recovered_book_baseline.baseline_digest===b.recovered_book_baseline.baseline_digest,'NONDETERMINISTIC_BASELINE');
  ok(a.recovery_receipt.recovery_receipt_id===b.recovery_receipt.recovery_receipt_id,'NONDETERMINISTIC_RECEIPT');
  ok(recovery.stableStringify(a.recovered_book_baseline)===recovery.stableStringify(b.recovered_book_baseline),'NONDETERMINISTIC_OUTPUT');
});

run('EBR-012', () => {
  const r=req('EBR-012',[corpus.base_source]), first=recovery.recoverExistingBook(r), cp=first.checkpoints.find(c=>c.phase==='STRUCTURE_RECONSTRUCTION');
  ok(!!cp,'CHECKPOINT_MISSING');
  const resumed=recovery.resumeExistingBookRecovery(r,cp);
  ok(resumed.recovered_book_baseline.baseline_digest===first.recovered_book_baseline.baseline_digest,'RESUME_CHANGED_BASELINE');
  ok(resumed.resume_receipt.resumed_from_checkpoint_id===cp.checkpoint_id,'RESUME_RECEIPT');
  const changed=clone(r); changed.sources[0].source_digest=hex('9');
  let code=null; try { recovery.resumeExistingBookRecovery(changed,cp); } catch(e) { code=e&&e.code; }
  ok(code==='RECOVERY_CHECKPOINT_INPUT_MISMATCH','CHECKPOINT_MISMATCH_NOT_REJECTED');
});

run('EBR-013', () => {
  const out=recovery.recoverExistingBook(req('EBR-013',[corpus.published_source,corpus.later_revision_source],{reentry_mode:'NEW_EDITION',prior_edition_ref:{edition_id:'EDITION-1',edition_digest:hex('7')}}));
  const line=out.recovered_book_baseline.edition_lineage;
  ok(line.relationship==='NEW_EDITION_OF','NEW_EDITION_RELATION');
  ok(line.prior_edition_ref.edition_id==='EDITION-1','PRIOR_EDITION_LOST');
  ok(line.history_rewrite_permitted===false,'HISTORY_REWRITE_ALLOWED');
});

expectError('EBR-N01',['RECOVERY_SOURCES_REQUIRED'],()=>recovery.recoverExistingBook({recovery_session_id:'EMPTY',sources:[]}));
expectError('EBR-N02',['SOURCE_DIGEST_REQUIRED'],()=>{const s=clone(corpus.base_source);s.source_digest='bad';recovery.recoverExistingBook(req('N02',[s]));});
expectError('EBR-N03',['DUPLICATE_SOURCE_ID'],()=>{const a=clone(corpus.base_source),b=clone(corpus.base_source);b.version_candidate.candidate_id='CANDIDATE-X';recovery.recoverExistingBook(req('N03',[a,b]));});
expectError('EBR-N04',['UNKNOWN_PARENT_CANDIDATE'],()=>{const s=clone(corpus.base_source);s.version_candidate.parent_candidate_ids=['DOES-NOT-EXIST'];recovery.recoverExistingBook(req('N04',[s]));});

const positives=results.filter(r=>/^EBR-\d{3}$/.test(r.case_id));
const negatives=results.filter(r=>/^EBR-N\d{2}$/.test(r.case_id));
const failures=results.filter(r=>r.result!=='PASS');
const summary={
  qualification_id:'BOOK-SYSTEM-EXISTING-BOOK-RECOVERY-SEMANTIC-CORE-001-DETERMINISTIC-QUALIFIER-002',
  repairs:'QUALIFIER_V1_FIXTURE_COMPOSITION_ONLY__ENGINE_INVARIANTS_UNCHANGED',
  predecessor_failed_run_id:34490821256,
  engine_id:recovery.ENGINE_ID,
  profile_version:recovery.PROFILE_VERSION,
  result_class:positives.length===13&&negatives.length===4&&failures.length===0?'PASS':'FAIL',
  planned_positive_cases:13,
  passed_positive_cases:positives.filter(r=>r.result==='PASS').length,
  planned_negative_cases:4,
  passed_negative_cases:negatives.filter(r=>r.result==='PASS').length,
  assertions,
  subject_sha:process.env.GITHUB_SHA||'LOCAL',
  fixture_class:corpus.fixture_class,
  native_parser_or_provider_called:false,
  private_manuscript_used:false,
  author_decision_observed_or_created:false,
  canonical_book_mutation_performed:false,
  a01_pass_claimed:false,
  native_device_pass_claimed:false,
  production_or_publication_pass_claimed:false,
  results
};
fs.writeFileSync(path.join(evidenceDir,'qualification-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
if(summary.result_class!=='PASS') process.exit(1);
