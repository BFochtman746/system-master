'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const runnerTemp = process.env.RUNNER_TEMP || path.join(workspace, '.tmp-book-content-admission');
const runId = process.env.GITHUB_RUN_ID || 'local';
const evidenceDir = path.join(runnerTemp, `book-content-admission-001-${runId}`);
fs.mkdirSync(evidenceDir, { recursive: true });

const vr = require(path.join(workspace, 'system-master/book-system/version-and-rollback-core.js'));
const ca = require(path.join(workspace, 'system-master/book-system/content-object-admission.js'));

function readJson(repoPath) { return JSON.parse(fs.readFileSync(path.join(workspace, ...repoPath.split('/')), 'utf8')); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function assert(v, code, detail = '') { if (!v) { const e = new Error(detail ? `${code}:${detail}` : code); e.code = code; throw e; } }
function expectError(fn, code) {
  try { fn(); } catch (e) {
    if (e && e.code === code) return;
    const x = new Error(`WRONG_ERROR_CODE:expected=${code}:actual=${e && e.code ? e.code : String(e)}`); x.code = 'WRONG_ERROR_CODE'; throw x;
  }
  const e = new Error(`EXPECTED_ERROR_NOT_THROWN:${code}`); e.code = 'EXPECTED_ERROR_NOT_THROWN'; throw e;
}
function gitHead() {
  const r = spawnSync('git', ['-c', `safe.directory=${workspace}`, 'rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8', shell: false });
  if (r.status !== 0) throw new Error(r.stderr || 'git head failed');
  return r.stdout.trim();
}
function sha(ch) { return ch.repeat(64); }
function subject(ch = '1') { return ch.repeat(40); }
function ref(type, id, version) { return ca.unitRef(type, id, version); }

const phase2 = readJson('qualification/book-system/completion-census-002/BOOK-SYSTEM-COMPLETION-CENSUS-002-P3-BOOK-PHASE-002.json');
const state024 = readJson('qualification/book-system/BOOK-SYSTEM-RECONCILED-STATE-024.json');
const contract = readJson('qualification/book-system/content-object-admission-001/BOOK-SYSTEM-CANONICAL-CONTENT-OBJECT-ADMISSION-001.json');

function baseState() {
  return vr.sealState({
    schema_version: 1,
    state_version: 1,
    book_project: {
      book_project_id: 'BOOK-PROJECT-001', book_id: 'BOOK-001', status: 'DRAFTING',
      governing_brief_ref: 'BRIEF-001:V1', canonical_manifest_ref: 'CANON-001:V1',
    },
    governing_briefs: [{ brief_id: 'BRIEF-001', version: 'V1', author_intent: 'intent', form: 'novel', genre: 'fiction', audience: 'adult', voice_goals: [], hard_constraints: [] }],
    canon_manifests: [{ canon_manifest_id: 'CANON-001', version: 'V1', facts: [], entities: [], world_rules: [], protected_language_refs: [], intent_constraints: [], approval_state: 'APPROVED' }],
    story_bibles: [{ story_bible_id: 'BIBLE-001', version: 'V1', entity_refs: [], relationship_refs: [], timeline_refs: [], arc_refs: [], motif_theme_refs: [], open_questions: [], provenance: [] }],
    book_plans: [{ plan_id: 'PLAN-001', version: 'V1', part_refs: [], chapter_refs: [], scene_refs: [], dependency_edges: [], purpose_and_payoff_refs: [] }],
    manuscripts: [{ manuscript_id: 'MANUSCRIPT-001', version_id: 'V1', artifact_digest: sha('a'), authority_state: 'CANONICAL', parent_version_ref: null, change_set_ref: 'CHANGE-V1', created_by: 'BOOK_SYSTEM_PARENT', created_at: '2026-09-10T00:00:00Z' }],
    research_evidence_links: [],
    author_decisions: [{ decision_id: 'AUTHOR-DECISION-001', subject_ref: 'BOOK-PROJECT-001', decision_type: 'ADMISSION', options: ['APPROVE', 'REJECT'], status: 'APPROVED', author_choice: 'APPROVE', effective_version: 1 }],
    integration_proposals: [],
    export_releases: [],
    active: {
      governing_brief_ref: 'BRIEF-001:V1', canon_manifest_ref: 'CANON-001:V1', story_bible_ref: 'BIBLE-001:V1', book_plan_ref: 'PLAN-001:V1', canonical_manuscript_ref: 'MANUSCRIPT-001:V1',
    },
  });
}
function base() { return vr.createVersionLedger(baseState()); }
function provenance(ch = 'b') {
  return { content_digest_sha256: sha(ch), provenance_ref: `PROVENANCE-${ch}`, source_subject_sha: subject(ch), source_current: true, created_by: 'BOOK_SYSTEM_PARENT', created_at: '2026-09-10T02:00:00Z' };
}
function request(ctx, id, operations, patch = {}) {
  return {
    mutation_id: id,
    actor_class: patch.actor_class || 'PARENT_SYSTEM',
    expected_state_version: patch.expected_state_version ?? ctx.parent_state.state_version,
    expected_state_digest: patch.expected_state_digest || ctx.parent_state.state_digest,
    operations,
    evidence_refs: patch.evidence_refs || ['BOOK-CENSUS-P3-PHASE-002'],
    author_decision_refs: patch.author_decision_refs || [],
  };
}
function registerObject(type, id, version, parentVersionRef, payload, ch = 'b', patch = {}) {
  return { operation_type: 'REGISTER_CONTENT_OBJECT_VERSION', object_type: type, object_id: id, version_id: version, parent_version_ref: parentVersionRef, payload, ...provenance(ch), ...patch };
}
function registerUnit(type, id, version, parentVersionRef, parentObjectRef, ordinal, ch = 'c', patch = {}) {
  return { operation_type: 'REGISTER_CONTENT_UNIT_VERSION', unit_type: type, book_project_id: 'BOOK-PROJECT-001', stable_unit_id: id, version_id: version, parent_version_ref: parentVersionRef, parent_object_ref: parentObjectRef, ordinal, ...provenance(ch), ...patch };
}
function planPayload(id = 'PLAN-001', version = 'V2') { return { plan_id: id, version, part_refs: [], chapter_refs: [], scene_refs: [], dependency_edges: [], purpose_and_payoff_refs: [] }; }
function commit(ctx, req) { return ca.commitContentAdmission({ parentState: ctx.parent_state, versionLedger: ctx.version_ledger, request: req }); }
function ctxFrom(result) { return { parent_state: result.parent_state, version_ledger: result.version_ledger }; }

const tests = [];
function test(id, fn) { tests.push({ id, fn }); }

test('CA001_AUTHORITY_CONTRACT_BOUND', () => {
  assert(phase2.next_objective === 'BOOK-SYSTEM-CANONICAL-CONTENT-OBJECT-ADMISSION-001-IMPLEMENTATION-AND-HOSTED-PREQUALIFICATION', 'PHASE2_OBJECTIVE_MISMATCH');
  assert(state024.current_parent_critical_path.id === phase2.next_objective, 'STATE024_OBJECTIVE_MISMATCH');
  assert(contract.owner_path === 'SYSTEM_MASTER/BOOK' && contract.canonical_write_authority === 'PARENT_SYSTEM', 'CONTRACT_AUTHORITY_MISMATCH');
});

test('CA002_NON_PARENT_WRITE_DENIED', () => {
  const x = base();
  const op = registerObject('STORY_BIBLE', 'BIBLE-001', 'V2', 'BIBLE-001:V1', { story_bible_id: 'BIBLE-001', version: 'V2' });
  expectError(() => commit(x, request(x, 'M-002', [op], { actor_class: 'PROSE_PROJECT' })), 'CONTENT_ADMISSION_AUTHORITY_DENIED');
});

test('CA003_STALE_VERSION_DENIED', () => {
  const x = base(); const op = registerObject('STORY_BIBLE', 'BIBLE-001', 'V2', 'BIBLE-001:V1', { story_bible_id: 'BIBLE-001', version: 'V2' });
  expectError(() => commit(x, request(x, 'M-003', [op], { expected_state_version: 0 })), 'STALE_PARENT_WRITE');
});

test('CA004_STALE_DIGEST_DENIED', () => {
  const x = base(); const op = registerObject('STORY_BIBLE', 'BIBLE-001', 'V2', 'BIBLE-001:V1', { story_bible_id: 'BIBLE-001', version: 'V2' });
  expectError(() => commit(x, request(x, 'M-004', [op], { expected_state_digest: sha('f') })), 'STALE_PARENT_WRITE');
});

test('CA005_REGISTER_GOVERNING_BRIEF_VERSION', () => {
  const x = base(); const op = registerObject('GOVERNING_BRIEF', 'BRIEF-001', 'V2', 'BRIEF-001:V1', { brief_id: 'BRIEF-001', version: 'V2', author_intent: 'intent2', form: 'novel', genre: 'fiction', audience: 'adult', voice_goals: [], hard_constraints: [] });
  const y = commit(x, request(x, 'M-005', [op]));
  assert(y.parent_state.governing_briefs.length === 2 && y.parent_state.active.governing_brief_ref === 'BRIEF-001:V1', 'GOVERNING_BRIEF_REGISTER_FAILED');
});

test('CA006_REGISTER_AND_ACTIVATE_GOVERNING_BRIEF', () => {
  const x = base(); const op = registerObject('GOVERNING_BRIEF', 'BRIEF-001', 'V2', 'BRIEF-001:V1', { brief_id: 'BRIEF-001', version: 'V2', author_intent: 'intent2', form: 'novel', genre: 'fiction', audience: 'adult', voice_goals: [], hard_constraints: [] });
  const y = commit(x, request(x, 'M-006', [op, { operation_type: 'SET_ACTIVE_CONTENT_OBJECT_VERSION', object_type: 'GOVERNING_BRIEF', object_ref: 'BRIEF-001:V2' }]));
  assert(y.parent_state.active.governing_brief_ref === 'BRIEF-001:V2' && y.parent_state.book_project.governing_brief_ref === 'BRIEF-001:V2', 'GOVERNING_BRIEF_ACTIVATION_FAILED');
});

test('CA007_REGISTER_CANON_STORY_PLAN_CLASSES', () => {
  const x = base();
  const ops = [
    registerObject('CANON_MANIFEST', 'CANON-001', 'V2', 'CANON-001:V1', { canon_manifest_id: 'CANON-001', version: 'V2' }, 'b'),
    registerObject('STORY_BIBLE', 'BIBLE-001', 'V2', 'BIBLE-001:V1', { story_bible_id: 'BIBLE-001', version: 'V2' }, 'c'),
    registerObject('BOOK_PLAN', 'PLAN-001', 'V2', 'PLAN-001:V1', planPayload(), 'd'),
  ];
  const y = commit(x, request(x, 'M-007', ops));
  assert(y.parent_state.canon_manifests.length === 2 && y.parent_state.story_bibles.length === 2 && y.parent_state.book_plans.length === 2, 'OBJECT_CLASS_REGISTRATION_FAILED');
});

test('CA008_REGISTER_MANUSCRIPT_EXACT_DIGEST', () => {
  const x = base();
  const p = { manuscript_id: 'MANUSCRIPT-001', version_id: 'V2', artifact_digest: sha('e'), authority_state: 'CANONICAL', parent_version_ref: 'MANUSCRIPT-001:V1', change_set_ref: 'CHANGE-V2', created_by: 'BOOK_SYSTEM_PARENT', created_at: '2026-09-10T02:00:00Z' };
  const y = commit(x, request(x, 'M-008', [registerObject('MANUSCRIPT_MANIFEST', 'MANUSCRIPT-001', 'V2', 'MANUSCRIPT-001:V1', p, 'e')]));
  assert(y.parent_state.manuscripts.length === 2, 'MANUSCRIPT_REGISTER_FAILED');
});

test('CA009_MANUSCRIPT_DIGEST_MISMATCH_DENIED', () => {
  const x = base(); const p = { manuscript_id: 'MANUSCRIPT-001', version_id: 'V2', artifact_digest: sha('e'), authority_state: 'CANONICAL', parent_version_ref: 'MANUSCRIPT-001:V1', change_set_ref: 'CHANGE-V2', created_by: 'BOOK_SYSTEM_PARENT', created_at: '2026-09-10T02:00:00Z' };
  expectError(() => commit(x, request(x, 'M-009', [registerObject('MANUSCRIPT_MANIFEST', 'MANUSCRIPT-001', 'V2', 'MANUSCRIPT-001:V1', p, 'f')])), 'MANUSCRIPT_CONTENT_DIGEST_MISMATCH');
});

test('CA010_OBJECT_PREDECESSOR_MISMATCH_DENIED', () => {
  const x = base(); const op = registerObject('STORY_BIBLE', 'BIBLE-001', 'V2', null, { story_bible_id: 'BIBLE-001', version: 'V2' });
  expectError(() => commit(x, request(x, 'M-010', [op])), 'CONTENT_OBJECT_PREDECESSOR_MISMATCH');
});

test('CA011_DUPLICATE_OBJECT_VERSION_DENIED', () => {
  const x = base(); const op = registerObject('BOOK_PLAN', 'PLAN-001', 'V1', null, planPayload('PLAN-001', 'V1'));
  expectError(() => commit(x, request(x, 'M-011', [op])), 'DUPLICATE_CONTENT_OBJECT_VERSION');
});

test('CA012_STALE_PROVENANCE_DENIED', () => {
  const x = base(); const op = registerObject('STORY_BIBLE', 'BIBLE-001', 'V2', 'BIBLE-001:V1', { story_bible_id: 'BIBLE-001', version: 'V2' }, 'b', { source_current: false });
  expectError(() => commit(x, request(x, 'M-012', [op])), 'SOURCE_CURRENTNESS_REQUIRED');
});

test('CA013_REGISTER_CHAPTER_VERSION', () => {
  const x = base(); const op = registerUnit('CHAPTER', 'CH-001', 'V1', null, 'BOOK_PROJECT:BOOK-PROJECT-001', 1);
  const y = commit(x, request(x, 'M-013', [op]));
  assert(y.parent_state.content_unit_versions.length === 1 && y.parent_state.content_unit_versions[0].unit_type === 'CHAPTER', 'CHAPTER_REGISTER_FAILED');
});

test('CA014_REGISTER_SCENE_UNDER_CHAPTER', () => {
  const x = base(); const ch = registerUnit('CHAPTER', 'CH-001', 'V1', null, 'BOOK_PROJECT:BOOK-PROJECT-001', 1, 'c'); const sc = registerUnit('SCENE', 'SC-001', 'V1', null, ref('CHAPTER', 'CH-001', 'V1'), 1, 'd');
  const y = commit(x, request(x, 'M-014', [ch, sc]));
  assert(y.parent_state.content_unit_versions.length === 2, 'SCENE_REGISTER_FAILED');
});

test('CA015_SCENE_PARENT_MISSING_DENIED', () => {
  const x = base(); const sc = registerUnit('SCENE', 'SC-001', 'V1', null, ref('CHAPTER', 'MISSING', 'V1'), 1);
  expectError(() => commit(x, request(x, 'M-015', [sc])), 'SCENE_PARENT_CHAPTER_NOT_FOUND');
});

test('CA016_CROSS_BOOK_UNIT_DENIED', () => {
  const x = base(); const ch = registerUnit('CHAPTER', 'CH-001', 'V1', null, 'BOOK_PROJECT:OTHER', 1, 'c', { book_project_id: 'OTHER' });
  expectError(() => commit(x, request(x, 'M-016', [ch])), 'CROSS_BOOK_CONTENT_UNIT_FORBIDDEN');
});

test('CA017_SECOND_UNIT_VERSION_EXACT_PREDECESSOR', () => {
  const x = base(); const y = commit(x, request(x, 'M-017A', [registerUnit('CHAPTER', 'CH-001', 'V1', null, 'BOOK_PROJECT:BOOK-PROJECT-001', 1)]));
  const c = ctxFrom(y); const z = commit(c, request(c, 'M-017B', [registerUnit('CHAPTER', 'CH-001', 'V2', ref('CHAPTER', 'CH-001', 'V1'), 'BOOK_PROJECT:BOOK-PROJECT-001', 1, 'd')]));
  assert(z.parent_state.content_unit_versions.length === 2 && z.parent_state.content_unit_versions[1].parent_version_ref === ref('CHAPTER', 'CH-001', 'V1'), 'UNIT_PREDECESSOR_FAILED');
});

test('CA018_UNIT_PREDECESSOR_MISMATCH_DENIED', () => {
  const x = base(); const y = commit(x, request(x, 'M-018A', [registerUnit('CHAPTER', 'CH-001', 'V1', null, 'BOOK_PROJECT:BOOK-PROJECT-001', 1)])); const c = ctxFrom(y);
  expectError(() => commit(c, request(c, 'M-018B', [registerUnit('CHAPTER', 'CH-001', 'V2', null, 'BOOK_PROJECT:BOOK-PROJECT-001', 1)])), 'CONTENT_UNIT_PREDECESSOR_MISMATCH');
});

test('CA019_MULTIPLE_SAME_FAMILY_ONE_MUTATION_DENIED', () => {
  const x = base(); const a = registerUnit('CHAPTER', 'CH-001', 'V1', null, 'BOOK_PROJECT:BOOK-PROJECT-001', 1); const b = registerUnit('CHAPTER', 'CH-001', 'V2', ref('CHAPTER', 'CH-001', 'V1'), 'BOOK_PROJECT:BOOK-PROJECT-001', 1, 'd');
  expectError(() => commit(x, request(x, 'M-019', [a, b])), 'MULTIPLE_NEW_VERSIONS_SAME_FAMILY_ONE_MUTATION');
});

test('CA020_UNIT_ORDER_BOUND_TO_NEW_BOOK_PLAN_AND_ACTIVATED', () => {
  const x = base();
  const ch1 = registerUnit('CHAPTER', 'CH-001', 'V1', null, 'BOOK_PROJECT:BOOK-PROJECT-001', 1, 'b');
  const ch2 = registerUnit('CHAPTER', 'CH-002', 'V1', null, 'BOOK_PROJECT:BOOK-PROJECT-001', 2, 'c');
  const sc1 = registerUnit('SCENE', 'SC-001', 'V1', null, ref('CHAPTER', 'CH-001', 'V1'), 1, 'd');
  const plan = registerObject('BOOK_PLAN', 'PLAN-001', 'V2', 'PLAN-001:V1', planPayload(), 'e');
  const order = { operation_type: 'SET_ACTIVE_CONTENT_UNIT_ORDER', book_plan_ref: 'PLAN-001:V2', chapter_refs: [ref('CHAPTER','CH-001','V1'), ref('CHAPTER','CH-002','V1')], scene_refs: [ref('SCENE','SC-001','V1')] };
  const activate = { operation_type: 'SET_ACTIVE_CONTENT_OBJECT_VERSION', object_type: 'BOOK_PLAN', object_ref: 'PLAN-001:V2' };
  const y = commit(x, request(x, 'M-020', [ch1, ch2, sc1, plan, order, activate]));
  const p = y.parent_state.book_plans.find(v => v.plan_id === 'PLAN-001' && v.version === 'V2');
  assert(y.parent_state.active.book_plan_ref === 'PLAN-001:V2' && p.chapter_refs.length === 2 && p.scene_refs.length === 1, 'UNIT_ORDER_ACTIVATION_FAILED');
});

test('CA021_NONDETERMINISTIC_CHAPTER_ORDER_DENIED', () => {
  const x = base(); const ch1 = registerUnit('CHAPTER', 'CH-001', 'V1', null, 'BOOK_PROJECT:BOOK-PROJECT-001', 2, 'b'); const ch2 = registerUnit('CHAPTER', 'CH-002', 'V1', null, 'BOOK_PROJECT:BOOK-PROJECT-001', 1, 'c'); const plan = registerObject('BOOK_PLAN','PLAN-001','V2','PLAN-001:V1',planPayload(),'d');
  const order = { operation_type:'SET_ACTIVE_CONTENT_UNIT_ORDER', book_plan_ref:'PLAN-001:V2', chapter_refs:[ref('CHAPTER','CH-001','V1'),ref('CHAPTER','CH-002','V1')], scene_refs:[] };
  expectError(() => commit(x, request(x, 'M-021', [ch1,ch2,plan,order])), 'AMBIGUOUS_OR_NONDETERMINISTIC_CONTENT_UNIT_ORDER');
});

test('CA022_SCENE_PARENT_MUST_BE_ACTIVE_CHAPTER', () => {
  const x = base(); const ch1 = registerUnit('CHAPTER','CH-001','V1',null,'BOOK_PROJECT:BOOK-PROJECT-001',1,'b'); const ch2 = registerUnit('CHAPTER','CH-002','V1',null,'BOOK_PROJECT:BOOK-PROJECT-001',2,'c'); const sc = registerUnit('SCENE','SC-001','V1',null,ref('CHAPTER','CH-002','V1'),1,'d'); const plan = registerObject('BOOK_PLAN','PLAN-001','V2','PLAN-001:V1',planPayload(),'e');
  const order = { operation_type:'SET_ACTIVE_CONTENT_UNIT_ORDER', book_plan_ref:'PLAN-001:V2', chapter_refs:[ref('CHAPTER','CH-001','V1')], scene_refs:[ref('SCENE','SC-001','V1')] };
  expectError(() => commit(x, request(x, 'M-022', [ch1,ch2,sc,plan,order])), 'SCENE_PARENT_NOT_IN_ACTIVE_CHAPTER_ORDER');
});

test('CA023_ORDER_REQUIRES_NEW_BOOK_PLAN_VERSION', () => {
  const x = base(); const order = { operation_type:'SET_ACTIVE_CONTENT_UNIT_ORDER', book_plan_ref:'PLAN-001:V1', chapter_refs:[], scene_refs:[] };
  expectError(() => commit(x, request(x, 'M-023', [order])), 'CONTENT_UNIT_ORDER_REQUIRES_NEW_BOOK_PLAN_VERSION');
});

test('CA024_FAILED_MULTI_OPERATION_IS_ATOMIC', () => {
  const x = base(); const before = vr.stableStringify(x.parent_state); const ch = registerUnit('CHAPTER','CH-001','V1',null,'BOOK_PROJECT:BOOK-PROJECT-001',1); const bad = registerUnit('SCENE','SC-BAD','V1',null,ref('CHAPTER','MISSING','V1'),1);
  expectError(() => commit(x, request(x, 'M-024', [ch,bad])), 'SCENE_PARENT_CHAPTER_NOT_FOUND');
  assert(vr.stableStringify(x.parent_state) === before && !Object.prototype.hasOwnProperty.call(x.parent_state, 'content_unit_versions'), 'ATOMICITY_INPUT_MUTATED');
});

test('CA025_IDEMPOTENT_REPLAY', () => {
  const x = base(); const req = request(x, 'M-025', [registerUnit('CHAPTER','CH-001','V1',null,'BOOK_PROJECT:BOOK-PROJECT-001',1)]); const y = commit(x, req); const replay = ca.commitContentAdmission({ parentState:y.parent_state, versionLedger:y.version_ledger, request:req });
  assert(replay.disposition === 'REPLAY' && replay.admission_receipt.version_receipt_id === y.admission_receipt.version_receipt_id, 'IDEMPOTENT_REPLAY_FAILED');
});

test('CA026_DIVERGENT_REPLAY_DENIED', () => {
  const x = base(); const req = request(x, 'M-026', [registerUnit('CHAPTER','CH-001','V1',null,'BOOK_PROJECT:BOOK-PROJECT-001',1)]); const y = commit(x, req); const changed = clone(req); changed.operations[0].content_digest_sha256 = sha('f');
  expectError(() => ca.commitContentAdmission({ parentState:y.parent_state, versionLedger:y.version_ledger, request:changed }), 'IDEMPOTENCY_KEY_CONFLICT');
});

test('CA027_LIFECYCLE_AND_PUBLICATION_NOT_GRANTED', () => {
  const x = base(); const y = commit(x, request(x, 'M-027', [registerUnit('CHAPTER','CH-001','V1',null,'BOOK_PROJECT:BOOK-PROJECT-001',1)]));
  assert(y.parent_state.book_project.status === 'DRAFTING' && y.parent_state.export_releases.length === 0, 'UNAUTHORIZED_LIFECYCLE_OR_PUBLICATION_CHANGE');
});

test('CA028_AUTHOR_DECISION_REQUIRED_FAILS_CLOSED', () => {
  const x = base(); const op = registerUnit('CHAPTER','CH-001','V1',null,'BOOK_PROJECT:BOOK-PROJECT-001',1,'b',{requires_author_decision:true});
  expectError(() => commit(x, request(x, 'M-028', [op])), 'AUTHOR_DECISION_REQUIRED');
});

test('CA029_APPROVED_AUTHOR_DECISION_MAY_BE_RECORDED_AS_PRECONDITION', () => {
  const x = base(); const op = registerUnit('CHAPTER','CH-001','V1',null,'BOOK_PROJECT:BOOK-PROJECT-001',1,'b',{requires_author_decision:true});
  const y = commit(x, request(x, 'M-029', [op], { author_decision_refs:['AUTHOR-DECISION-001'] }));
  assert(y.parent_state.content_unit_versions.length === 1, 'APPROVED_AUTHOR_DECISION_PRECONDITION_FAILED');
});

test('CA030_VERSION_RECEIPT_BINDS_PRE_POST_DIGESTS', () => {
  const x = base(); const y = commit(x, request(x, 'M-030', [registerUnit('CHAPTER','CH-001','V1',null,'BOOK_PROJECT:BOOK-PROJECT-001',1)])); const r = y.admission_receipt;
  assert(r.pre_parent_state_digest === x.parent_state.state_digest && r.post_parent_state_digest === y.parent_state.state_digest && r.pre_parent_state_digest !== r.post_parent_state_digest, 'RECEIPT_DIGEST_BINDING_FAILED');
});

const results = [];
for (const t of tests) {
  try { t.fn(); results.push({ id:t.id, result:'PASS' }); }
  catch (e) { results.push({ id:t.id, result:'FAIL', code:e && e.code ? e.code : 'ERROR', detail:String(e && e.stack ? e.stack : e) }); }
}
const passed = results.filter(r => r.result === 'PASS').length;
const failed = results.length - passed;
const evidence = {
  qualification_id: 'BOOK-SYSTEM-CANONICAL-CONTENT-OBJECT-ADMISSION-001-HOSTED-PREQUALIFICATION',
  subject_sha: gitHead(),
  result: failed === 0 ? 'PASS' : 'FAIL',
  counts: { total: results.length, passed, failed },
  authority_inputs: {
    phase2_checkpoint: phase2.checkpoint_id,
    reconciled_state: state024.state_id,
    implementation_contract: contract.contract_id,
  },
  fixture_classes: [
    'all five existing canonical object classes', 'chapter and scene persistent unit identity', 'exact predecessor lineage', 'aggregate CAS', 'provenance/currentness', 'parent-only authority', 'author-decision precondition', 'deterministic unit ordering', 'cross-book rejection', 'atomic failure', 'idempotent replay', 'divergent replay rejection', 'lifecycle/publication non-grant', 'pre/post digest receipts'
  ],
  boundary_statement: 'Hosted deterministic evidence only. This result does not create A-01 PASS, author approval, publication authorization, Document rendering proof, Prose quality evidence, native iPhone evidence, or production readiness.',
  tests: results,
};
fs.writeFileSync(path.join(evidenceDir, 'qualification-result.json'), JSON.stringify(evidence, null, 2), 'utf8');
fs.writeFileSync(path.join(evidenceDir, 'fixture-manifest.json'), JSON.stringify({ test_ids: results.map(r => r.id), count: results.length }, null, 2), 'utf8');
console.log(JSON.stringify(evidence, null, 2));
if (failed !== 0) process.exit(1);
