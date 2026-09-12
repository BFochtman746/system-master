'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const core = require('../../system-master/book-system/canonical-parent-v2-f6-core.js');
const rebind = require('../../system-master/book-system/lifecycle-v2-rebind.js');
const { LifecycleV2SqliteStore } = require('../../system-master/book-system/lifecycle-v2-sqlite-store.js');

const H = value => core.sha256(String(value));
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function expectCode(code, fn) { assert.throws(fn, err => err && err.code === code, `expected ${code}`); }

function governed(objectId, version = '1') {
  return { object_id: objectId, version, book_project_id: 'BOOK-PROJECT-001', object_digest: H(`${objectId}:${version}`) };
}
function style(objectId = 'STYLE-1', version = '1') {
  return { object_id: objectId, version, book_project_id: 'BOOK-PROJECT-001', standing: 'CURRENT', profile_digest: H(`${objectId}:${version}:CURRENT`) };
}
function parentAt(status = 'CREATED', options = {}) {
  return core.sealParent({
    schema_version: core.SCHEMA_VERSION,
    state_version: options.state_version || 1,
    state_digest: '0'.repeat(64),
    book_project: { book_project_id: 'BOOK-PROJECT-001', book_id: 'BOOK-001', status },
    governed_objects: {
      governing_briefs: [governed('BRIEF-1')],
      canon_manifests: [governed('CANON-1')],
      story_bibles: [governed('BIBLE-1')],
      book_plans: [governed('PLAN-1')],
      manuscripts: [governed('MS-1')],
    },
    research_evidence_links: clone(options.research_evidence_links || []),
    author_decisions: clone(options.author_decisions || []),
    integration_proposals: clone(options.integration_proposals || []),
    rights_custody_records: [],
    style_profiles: [style()],
    export_releases: clone(options.export_releases || []),
    active: {
      governing_brief_ref: 'BRIEF-1:1', canon_manifest_ref: 'CANON-1:1', story_bible_ref: 'BIBLE-1:1',
      book_plan_ref: 'PLAN-1:1', canonical_manuscript_ref: 'MS-1:1', style_profile_ref: 'STYLE-1:1',
    },
    authority_metadata: { owner: 'SYSTEM_MASTER/BOOK', reconstruction: 'B00-F6B-QUALIFICATION-FIXTURE' },
    mutation_head: null,
  });
}

function projectRequest(parent, state, toStatus = 'BRIEFING', suffix = 'PROJECT', overrides = {}) {
  return Object.assign({
    transition_request_id: `F6B-${suffix}`,
    idempotency_key: `F6B-IDEM-${suffix}`,
    actor_class: 'PARENT_SYSTEM',
    scope: 'PROJECT',
    target_ref: parent.book_project.book_project_id,
    target_status: toStatus,
    expected_parent_state_version: parent.state_version,
    expected_parent_state_digest: parent.state_digest,
    expected_lifecycle_identity: rebind.lifecycleIdentity(state, parent),
    evidence_refs: [],
    author_decision_refs: [],
    integration_proposal_refs: [],
    cause_refs: [],
    created_at: '2026-09-12T06:30:00.000Z',
  }, overrides);
}

function unitRequest(parent, state, unitRef, toStatus, suffix, overrides = {}) {
  return Object.assign({
    transition_request_id: `F6B-${suffix}`,
    idempotency_key: `F6B-IDEM-${suffix}`,
    actor_class: 'PARENT_SYSTEM',
    scope: 'UNIT',
    target_ref: unitRef,
    target_status: toStatus,
    expected_parent_state_version: parent.state_version,
    expected_parent_state_digest: parent.state_digest,
    expected_lifecycle_identity: rebind.lifecycleIdentity(state, parent),
    evidence_refs: [],
    author_decision_refs: [],
    integration_proposal_refs: [],
    cause_refs: [],
    created_at: '2026-09-12T06:31:00.000Z',
  }, overrides);
}

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'book-f6b-'));
  return { dir, db: path.join(dir, 'book.sqlite') };
}
function seeded(parent, lifecycle, options = {}) {
  const t = tempDb();
  const store = new LifecycleV2SqliteStore(t.db, options);
  store.createParent(parent, 'F6B-QUALIFICATION-CREATE');
  store.createLifecycleState(lifecycle, '2026-09-12T06:29:00.000Z');
  return { ...t, store };
}
function cleanup(x) {
  try { x.store.close(); } catch (_) {}
  try { fs.rmSync(x.dir, { recursive: true, force: true }); } catch (_) {}
}
function count(store, table) { return Number(store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n); }

const tests = [];
function t(id, name, fn) { tests.push({ id, name, fn }); }

t('Q059', 'project transition prepares specialist first and atomically commits canonical parent plus lifecycle successor', () => {
  const parent = parentAt('CREATED');
  const lifecycle = rebind.createLifecycleSpecialistState(parent);
  const request = projectRequest(parent, lifecycle, 'BRIEFING', 'Q059');
  const prepared = rebind.prepareLifecycleTransition({ canonicalParent: parent, lifecycleState: lifecycle, request });
  assert.strictEqual(prepared.disposition, 'PREPARED_FOR_PARENT');
  assert.strictEqual(prepared.parent_effect.effect_type, 'ADVANCE_PROJECT_STATUS');
  assert.strictEqual(parent.book_project.status, 'CREATED');
  assert.strictEqual(lifecycle.lifecycle_ledger.ledger_version, 1);
  const s = seeded(parent, lifecycle);
  try {
    const result = s.store.commitPreparedLifecycle(prepared);
    assert.strictEqual(result.replay, false);
    assert.strictEqual(result.parent_state.book_project.status, 'BRIEFING');
    assert.strictEqual(result.parent_state.state_version, parent.state_version + 1);
    assert.strictEqual(result.lifecycle_state.canonical_parent_state_digest, result.parent_state.state_digest);
    assert.strictEqual(result.lifecycle_state.lifecycle_ledger.ledger_version, lifecycle.lifecycle_ledger.ledger_version + 1);
    assert.strictEqual(result.specialist_receipt.parent_commit_receipt_ref, result.commit_receipt.receipt_id);
    assert.strictEqual(count(s.store, 'parent_commit_receipt'), 1);
    assert.strictEqual(count(s.store, 'book_lifecycle_receipt'), 1);
    assert.strictEqual(count(s.store, 'parent_history'), 2);
  } finally { cleanup(s); }
});

t('Q060', 'unit lifecycle transition remains specialist truth and does not mutate canonical parent bytes', () => {
  const parent = parentAt('DRAFTING');
  const lifecycle = rebind.createLifecycleSpecialistState(parent, { unit_states: { 'CHAPTER-1': rebind.emptyUnitState('CHAPTER-1') } });
  const request = unitRequest(parent, lifecycle, 'CHAPTER-1', 'DEFERRED', 'Q060');
  const prepared = rebind.prepareLifecycleTransition({ canonicalParent: parent, lifecycleState: lifecycle, request });
  assert.strictEqual(prepared.disposition, 'PREPARED_SPECIALIST_ONLY');
  assert.strictEqual(prepared.parent_effect, null);
  const s = seeded(parent, lifecycle);
  try {
    const before = s.store.readCurrentParent('BOOK-PROJECT-001');
    const beforeJson = JSON.stringify(before);
    const result = s.store.commitPreparedLifecycle(prepared);
    const after = s.store.readCurrentParent('BOOK-PROJECT-001');
    assert.strictEqual(JSON.stringify(after), beforeJson);
    assert.strictEqual(result.lifecycle_state.lifecycle_ledger.unit_states['CHAPTER-1'].status, 'DEFERRED');
    assert.strictEqual(count(s.store, 'parent_commit_receipt'), 0);
    assert.strictEqual(count(s.store, 'parent_history'), 1);
    assert.strictEqual(count(s.store, 'book_lifecycle_receipt'), 1);
  } finally { cleanup(s); }
});

t('F6B-STALE-LIFECYCLE', 'stale lifecycle identity fails before write', () => {
  const parent = parentAt('CREATED');
  const lifecycle = rebind.createLifecycleSpecialistState(parent);
  const prepared = rebind.prepareLifecycleTransition({ canonicalParent: parent, lifecycleState: lifecycle, request: projectRequest(parent, lifecycle, 'BRIEFING', 'STALE-LIFECYCLE') });
  prepared.specialist_delta.expected_lifecycle_identity = 'a'.repeat(64);
  prepared.parent_effect.expected_specialist_ledger_identity = 'a'.repeat(64);
  const s = seeded(parent, lifecycle);
  try {
    expectCode('LIFECYCLE_IDENTITY_CONFLICT', () => s.store.commitPreparedLifecycle(prepared));
    assert.strictEqual(s.store.readCurrentParent('BOOK-PROJECT-001').book_project.status, 'CREATED');
    assert.strictEqual(s.store.readLifecycleState('BOOK-PROJECT-001').lifecycle_identity, rebind.lifecycleIdentity(lifecycle, parent));
  } finally { cleanup(s); }
});

t('F6B-STALE-PARENT', 'stale parent digest fails before specialist write', () => {
  const parent = parentAt('CREATED');
  const lifecycle = rebind.createLifecycleSpecialistState(parent);
  const prepared = rebind.prepareLifecycleTransition({ canonicalParent: parent, lifecycleState: lifecycle, request: projectRequest(parent, lifecycle, 'BRIEFING', 'STALE-PARENT') });
  prepared.parent_effect.expected_parent_state_digest = 'f'.repeat(64);
  const s = seeded(parent, lifecycle);
  try {
    expectCode('PARENT_STATE_DIGEST_CONFLICT', () => s.store.commitPreparedLifecycle(prepared));
    assert.strictEqual(s.store.readCurrentParent('BOOK-PROJECT-001').book_project.status, 'CREATED');
    assert.strictEqual(s.store.readLifecycleState('BOOK-PROJECT-001').state.lifecycle_ledger.ledger_version, 1);
  } finally { cleanup(s); }
});

t('F6B-SPECIALIST-FAILURE-ROLLBACK', 'injected lifecycle persistence failure rolls back project parent', () => {
  const parent = parentAt('CREATED');
  const lifecycle = rebind.createLifecycleSpecialistState(parent);
  const prepared = rebind.prepareLifecycleTransition({ canonicalParent: parent, lifecycleState: lifecycle, request: projectRequest(parent, lifecycle, 'BRIEFING', 'ROLLBACK') });
  const s = seeded(parent, lifecycle, { faultInjector: point => { if (point === 'after_lifecycle_update') throw new Error('INJECTED_LIFECYCLE_PERSISTENCE_FAILURE'); } });
  try {
    expectCode('STORE_SQLITE_FAILURE', () => s.store.commitPreparedLifecycle(prepared));
    assert.strictEqual(s.store.readCurrentParent('BOOK-PROJECT-001').book_project.status, 'CREATED');
    assert.strictEqual(s.store.readLifecycleState('BOOK-PROJECT-001').state.lifecycle_ledger.ledger_version, 1);
    assert.strictEqual(count(s.store, 'parent_commit_receipt'), 0);
    assert.strictEqual(count(s.store, 'book_lifecycle_receipt'), 0);
  } finally { cleanup(s); }
});

t('F6B-RESPONSE-LOSS', 'response loss reconciles immutable parent and lifecycle receipts without a second commit', () => {
  const parent = parentAt('CREATED');
  const lifecycle = rebind.createLifecycleSpecialistState(parent);
  const prepared = rebind.prepareLifecycleTransition({ canonicalParent: parent, lifecycleState: lifecycle, request: projectRequest(parent, lifecycle, 'BRIEFING', 'RESPONSE-LOSS') });
  const s = seeded(parent, lifecycle, { faultInjector: point => { if (point === 'after_commit') throw new Error('INJECTED_RESPONSE_LOSS'); } });
  try {
    expectCode('STORE_SQLITE_FAILURE', () => s.store.commitPreparedLifecycle(prepared));
    const reconciled = s.store.reconcileLifecycle(prepared);
    assert.strictEqual(reconciled.committed, true);
    assert.strictEqual(reconciled.parent_state.book_project.status, 'BRIEFING');
    assert.strictEqual(reconciled.specialist_receipt.receipt_id, prepared.specialist_delta.specialist_receipt.receipt_id);
    const replay = s.store.commitPreparedLifecycle(prepared);
    assert.strictEqual(replay.replay, true);
    assert.strictEqual(replay.specialist_receipt.receipt_id, reconciled.specialist_receipt.receipt_id);
    assert.strictEqual(count(s.store, 'parent_commit_receipt'), 1);
    assert.strictEqual(count(s.store, 'book_lifecycle_receipt'), 1);
  } finally { cleanup(s); }
});

t('F6B-IDEMPOTENCY-CONFLICT', 'same lifecycle idempotency key with different request fingerprint fails closed', () => {
  const parent = parentAt('CREATED');
  const lifecycle = rebind.createLifecycleSpecialistState(parent);
  const prepared = rebind.prepareLifecycleTransition({ canonicalParent: parent, lifecycleState: lifecycle, request: projectRequest(parent, lifecycle, 'BRIEFING', 'IDEMPOTENCY') });
  const s = seeded(parent, lifecycle);
  try {
    s.store.commitPreparedLifecycle(prepared);
    const changed = clone(prepared);
    changed.specialist_delta.specialist_receipt.request_fingerprint = 'b'.repeat(64);
    expectCode('IDEMPOTENCY_KEY_CONFLICT', () => s.store.commitPreparedLifecycle(changed));
    assert.strictEqual(count(s.store, 'parent_commit_receipt'), 1);
  } finally { cleanup(s); }
});

t('F6B-PROVIDER-AUTHORITY', 'non-parent service actor cannot invoke lifecycle transition', () => {
  const parent = parentAt('CREATED');
  const lifecycle = rebind.createLifecycleSpecialistState(parent);
  const request = projectRequest(parent, lifecycle, 'BRIEFING', 'SERVICE-ACTOR', { actor_class: 'SERVICE' });
  expectCode('TRANSITION_AUTHORITY_DENIED', () => rebind.prepareLifecycleTransition({ canonicalParent: parent, lifecycleState: lifecycle, request }));
});

t('F6B-AUTHOR-GATE', 'author-gated transition fails without a current approved author decision', () => {
  const evidence = { link_id: 'EVID-AUTHOR-REVIEW', evidence_type: 'AUTHOR_REVIEW_COMPLETE' };
  const parent = parentAt('AUTHOR_REVIEW', { research_evidence_links: [evidence] });
  const lifecycle = rebind.createLifecycleSpecialistState(parent);
  const request = projectRequest(parent, lifecycle, 'FINALIZATION', 'AUTHOR-GATE', { evidence_refs: ['EVID-AUTHOR-REVIEW'] });
  expectCode('REQUIRED_AUTHOR_DECISION_MISSING', () => rebind.prepareLifecycleTransition({ canonicalParent: parent, lifecycleState: lifecycle, request }));
});

t('F6B-PUBLICATION-GATE', 'export-frozen project cannot publish without explicit publication evidence and author authority', () => {
  const parent = parentAt('EXPORT_FROZEN');
  const lifecycle = rebind.createLifecycleSpecialistState(parent);
  const request = projectRequest(parent, lifecycle, 'PUBLISHED_OR_DELIVERED', 'PUBLICATION-GATE');
  expectCode('REQUIRED_TRANSITION_EVIDENCE_MISSING', () => rebind.prepareLifecycleTransition({ canonicalParent: parent, lifecycleState: lifecycle, request }));
});

t('F6B-STALE-EVIDENCE', 'stale projection-bound service evidence fails closed before transition', () => {
  const stale = { link_id: 'EVID-STALE', evidence_type: 'GOVERNING_BRIEF_READY', parent_projection_identity: { parent_state_version: 999, parent_state_digest: '0'.repeat(64) } };
  const parent = parentAt('BRIEFING', { research_evidence_links: [stale] });
  expectCode('STALE_CANONICAL_EVIDENCE', () => {
    const lifecycle = rebind.createLifecycleSpecialistState(parent);
    const request = projectRequest(parent, lifecycle, 'PLANNING', 'STALE-EVIDENCE', { evidence_refs: ['EVID-STALE'] });
    rebind.prepareLifecycleTransition({ canonicalParent: parent, lifecycleState: lifecycle, request });
  });
});

t('F6B-TRANSITIVE-INVALIDATION', 'unit invalidation propagates transitively and remains specialist-only', () => {
  const evidence = { link_id: 'EVID-UPSTREAM-CHANGE', evidence_type: 'UPSTREAM_CHANGE_CAUSE' };
  const parent = parentAt('DRAFTING', { research_evidence_links: [evidence] });
  const units = {
    U1: rebind.emptyUnitState('U1', 'CHAPTER', 'DRAFTED'),
    U2: rebind.emptyUnitState('U2', 'CHAPTER', 'READY_TO_DRAFT'),
    U3: rebind.emptyUnitState('U3', 'CHAPTER', 'PLANNED'),
  };
  const edges = [
    { edge_id: 'E1', upstream_ref: 'U1', downstream_ref: 'U2', dependency_class: 'PLAN' },
    { edge_id: 'E2', upstream_ref: 'U2', downstream_ref: 'U3', dependency_class: 'PLAN' },
  ];
  const lifecycle = rebind.createLifecycleSpecialistState(parent, { unit_states: units, dependency_edges: edges });
  const request = unitRequest(parent, lifecycle, 'U1', 'INVALIDATED_BY_UPSTREAM_CHANGE', 'INVALIDATE', { evidence_refs: ['EVID-UPSTREAM-CHANGE'], cause_refs: ['CAUSE-PLAN-CHANGE'] });
  const prepared = rebind.prepareLifecycleTransition({ canonicalParent: parent, lifecycleState: lifecycle, request });
  const s = seeded(parent, lifecycle);
  try {
    const before = JSON.stringify(s.store.readCurrentParent('BOOK-PROJECT-001'));
    const result = s.store.commitPreparedLifecycle(prepared);
    const ledger = result.lifecycle_state.lifecycle_ledger;
    assert.strictEqual(ledger.unit_states.U1.status, 'INVALIDATED_BY_UPSTREAM_CHANGE');
    assert.strictEqual(ledger.unit_states.U2.status, 'INVALIDATED_BY_UPSTREAM_CHANGE');
    assert.strictEqual(ledger.unit_states.U3.status, 'INVALIDATED_BY_UPSTREAM_CHANGE');
    assert.deepStrictEqual(result.specialist_receipt.invalidated_unit_refs, ['U2', 'U3']);
    assert.strictEqual(JSON.stringify(s.store.readCurrentParent('BOOK-PROJECT-001')), before);
  } finally { cleanup(s); }
});

t('F6B-RECOVERY', 'durable recovery verifies parent chain and lifecycle receipt chain after project commit', () => {
  const parent = parentAt('CREATED');
  const lifecycle = rebind.createLifecycleSpecialistState(parent);
  const prepared = rebind.prepareLifecycleTransition({ canonicalParent: parent, lifecycleState: lifecycle, request: projectRequest(parent, lifecycle, 'BRIEFING', 'RECOVERY') });
  const s = seeded(parent, lifecycle);
  try {
    s.store.commitPreparedLifecycle(prepared);
    const recovery = s.store.recoverLifecycleAndVerify('BOOK-PROJECT-001');
    assert.strictEqual(recovery.ok, true);
    assert.strictEqual(recovery.lifecycle_present, true);
    assert.strictEqual(recovery.lifecycle_receipt_count, 1);
    assert.strictEqual(recovery.parent_state.book_project.status, 'BRIEFING');
  } finally { cleanup(s); }
});

let passed = 0;
for (const test of tests) {
  try { test.fn(); passed += 1; console.log(`PASS ${test.id} ${test.name}`); }
  catch (err) { console.error(`FAIL ${test.id} ${test.name}: ${err.stack || err}`); process.exitCode = 1; }
}
console.log(JSON.stringify({ qualification: 'BOOK-RECONSTRUCTION-B00-F6B', required: tests.length, observed: tests.length, passed, failed: tests.length - passed, q059_q060: passed === tests.length ? 'PASS' : 'FAIL', status: passed === tests.length ? 'PASS' : 'FAIL' }));
if (passed !== tests.length) process.exit(1);
