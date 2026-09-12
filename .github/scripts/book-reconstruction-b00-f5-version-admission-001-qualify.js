'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const vr = require('../../system-master/book-system/version-and-rollback-core.js');
const f5core = require('../../system-master/book-system/canonical-parent-v2-f5-core.js');
const rebind = require('../../system-master/book-system/version-admission-v2-rebind.js');
const { VersionAdmissionV2SqliteStore } = require('../../system-master/book-system/version-admission-v2-sqlite-store.js');

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function sha(ch) { return ch.repeat(64); }
function subject(ch = '1') { return ch.repeat(40); }
function expectCode(code, fn) {
  assert.throws(fn, err => err && err.code === code, `expected ${code}`);
}

function legacyBaseState() {
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
    author_decisions: [],
    integration_proposals: [],
    export_releases: [],
    active: {
      governing_brief_ref: 'BRIEF-001:V1', canon_manifest_ref: 'CANON-001:V1', story_bible_ref: 'BIBLE-001:V1', book_plan_ref: 'PLAN-001:V1', canonical_manuscript_ref: 'MANUSCRIPT-001:V1',
    },
  });
}

const LEGACY_META = {
  governing_briefs: ['brief_id','version'],
  canon_manifests: ['canon_manifest_id','version'],
  story_bibles: ['story_bible_id','version'],
  book_plans: ['plan_id','version'],
  manuscripts: ['manuscript_id','version_id'],
};
function canonicalFromLegacy(legacy) {
  const governed = {};
  for (const [collection, [idField, versionField]] of Object.entries(LEGACY_META)) {
    governed[collection] = legacy[collection].map(x => {
      const out = {
        object_id: String(x[idField]), version: String(x[versionField]),
        book_project_id: legacy.book_project.book_project_id,
        object_digest: vr.digest(x),
      };
      if (Object.prototype.hasOwnProperty.call(x, 'authority_state')) out.authority_state = x.authority_state;
      if (Object.prototype.hasOwnProperty.call(x, 'artifact_digest')) out.artifact_digest = x.artifact_digest;
      return out;
    });
  }
  return f5core.sealParent({
    schema_version: f5core.SCHEMA_VERSION,
    state_version: 1,
    state_digest: '0'.repeat(64),
    book_project: { book_project_id: legacy.book_project.book_project_id, book_id: legacy.book_project.book_id, status: legacy.book_project.status },
    governed_objects: governed,
    research_evidence_links: [], author_decisions: [], integration_proposals: [], rights_custody_records: [], style_profiles: [], export_releases: [],
    active: { ...clone(legacy.active), style_profile_ref: null },
    authority_metadata: { owner: 'SYSTEM_MASTER/BOOK', reconstruction: 'B00-F5' },
    mutation_head: null,
  });
}
function provenance(ch = 'b') {
  return { content_digest_sha256: sha(ch), provenance_ref: `PROVENANCE-${ch}`, source_subject_sha: subject(ch), source_current: true, created_by: 'BOOK_SYSTEM_PARENT', created_at: '2026-09-12T06:50:00Z' };
}
function planOperation() {
  return {
    operation_type: 'REGISTER_CONTENT_OBJECT_VERSION', object_type: 'BOOK_PLAN', object_id: 'PLAN-001', version_id: 'V2', parent_version_ref: 'PLAN-001:V1',
    payload: { plan_id: 'PLAN-001', version: 'V2', part_refs: [], chapter_refs: [], scene_refs: [], dependency_edges: [], purpose_and_payoff_refs: [] },
    ...provenance('b'),
  };
}
function activationOperation() { return { operation_type: 'SET_ACTIVE_CONTENT_OBJECT_VERSION', object_type: 'BOOK_PLAN', object_ref: 'PLAN-001:V2' }; }
function context() {
  const legacy = legacyBaseState();
  const v = vr.createVersionLedger(legacy);
  const specialist = rebind.createSpecialistState(v.parent_state, v.version_ledger);
  const canonical = canonicalFromLegacy(v.parent_state);
  const request = {
    mutation_id: 'F5-ADMISSION-001', created_at: '2026-09-12T06:55:00Z',
    expected_parent_state_version: canonical.state_version, expected_parent_state_digest: canonical.state_digest,
    operations: [planOperation(), activationOperation()], evidence_refs: ['EVIDENCE:F5-EXACT-SUBJECT'], author_decision_refs: [],
  };
  return { legacy: v.parent_state, specialist, canonical, request, prepared: rebind.prepareContentAdmission({ canonicalParent: canonical, specialistState: specialist, request }) };
}
function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'book-f5-'));
  return { dir, db: path.join(dir, 'book.sqlite') };
}
function seededStore(ctx, options = {}) {
  const t = tempDb();
  const store = new VersionAdmissionV2SqliteStore(t.db, options);
  store.createParent(ctx.canonical, 'F5-TEST');
  store.createVersionAdmissionState(ctx.specialist, '2026-09-12T06:54:00Z');
  return { ...t, store };
}
function cleanup(x) {
  try { x.store.close(); } catch (_) {}
  try { fs.rmSync(x.dir, { recursive: true, force: true }); } catch (_) {}
}

const tests = [];
function t(id, name, fn) { tests.push({ id, name, fn }); }

t('Q051', 'prepared specialist is not canonical completion', () => {
  const x = context();
  const before = clone(x.canonical);
  assert.strictEqual(x.prepared.disposition, 'PREPARED_FOR_PARENT');
  assert.deepStrictEqual(x.canonical, before);
  assert.strictEqual(x.prepared.legacy_candidate_parent.active.book_plan_ref, 'PLAN-001:V2');
  assert.strictEqual(x.canonical.active.book_plan_ref, 'PLAN-001:V1');
});

t('Q052', 'stale specialist identity denied before transaction', () => {
  const x = context(); const s = seededStore(x);
  try {
    const badEffect = clone(x.prepared.parent_effect);
    badEffect.expected_specialist_ledger_identity = 'a'.repeat(64);
    expectCode('SPECIALIST_EFFECT_IDENTITY_MISMATCH', () => s.store.commitEffect(badEffect, x.prepared.specialist_delta));
    assert.strictEqual(s.store.readCurrentParent('BOOK-PROJECT-001').state_version, 1);
  } finally { cleanup(s); }
});

t('Q053', 'same transaction specialist and parent atomic success', () => {
  const x = context(); const s = seededStore(x);
  try {
    const r = s.store.commitEffect(x.prepared.parent_effect, x.prepared.specialist_delta);
    assert.strictEqual(r.parent_state.active.book_plan_ref, 'PLAN-001:V2');
    assert.strictEqual(r.parent_state.state_version, 2);
    assert.strictEqual(r.specialist_receipt.disposition, 'PREPARED_FOR_PARENT');
    const specialist = s.store.readVersionAdmissionState('BOOK-PROJECT-001');
    assert.strictEqual(specialist.ledger_identity, x.prepared.specialist_delta.post_ledger_identity);
    assert.ok(r.commit_receipt.transaction_identity.startsWith('BVA-TX-'));
  } finally { cleanup(s); }
});

t('Q054', 'specialist persistence failure rolls back parent', () => {
  const x = context();
  const s = seededStore(x, { faultInjector: point => { if (point === 'after_specialist_update') throw new Error('INJECTED_SPECIALIST_WRITE_FAILURE'); } });
  const preIdentity = rebind.specialistIdentity(x.specialist);
  try {
    expectCode('STORE_SQLITE_FAILURE', () => s.store.commitEffect(x.prepared.parent_effect, x.prepared.specialist_delta));
    const p = s.store.readCurrentParent('BOOK-PROJECT-001');
    const specialist = s.store.readVersionAdmissionState('BOOK-PROJECT-001');
    assert.strictEqual(p.state_version, 1);
    assert.strictEqual(p.active.book_plan_ref, 'PLAN-001:V1');
    assert.strictEqual(specialist.ledger_identity, preIdentity);
  } finally { cleanup(s); }
});

t('Q055', 'parent validation failure rolls back specialist', () => {
  const x = context(); const s = seededStore(x);
  const preIdentity = rebind.specialistIdentity(x.specialist);
  try {
    const badEffect = clone(x.prepared.parent_effect);
    badEffect.expected_parent_state_digest = 'f'.repeat(64);
    expectCode('PARENT_STATE_DIGEST_CONFLICT', () => s.store.commitEffect(badEffect, x.prepared.specialist_delta));
    const specialist = s.store.readVersionAdmissionState('BOOK-PROJECT-001');
    assert.strictEqual(specialist.ledger_identity, preIdentity);
    assert.strictEqual(s.store.readCurrentParent('BOOK-PROJECT-001').state_version, 1);
  } finally { cleanup(s); }
});

t('Q056', 'response loss reconciles parent and specialist receipts', () => {
  const x = context();
  const s = seededStore(x, { faultInjector: point => { if (point === 'after_commit') throw new Error('INJECTED_RESPONSE_LOSS'); } });
  try {
    expectCode('STORE_SQLITE_FAILURE', () => s.store.commitEffect(x.prepared.parent_effect, x.prepared.specialist_delta));
    const reconciled = s.store.reconcileContentAdmission(x.prepared.parent_effect);
    assert.strictEqual(reconciled.committed, true);
    assert.strictEqual(reconciled.parent_state.active.book_plan_ref, 'PLAN-001:V2');
    assert.strictEqual(reconciled.specialist_receipt.receipt_id, x.prepared.specialist_delta.specialist_receipt.receipt_id);
    const replay = s.store.commitEffect(x.prepared.parent_effect, x.prepared.specialist_delta);
    assert.strictEqual(replay.replay, true);
    assert.strictEqual(replay.commit_receipt.receipt_id, reconciled.commit_receipt.receipt_id);
  } finally { cleanup(s); }
});

t('Q057', 'version snapshot never becomes current parent truth by itself', () => {
  const x = context(); const s = seededStore(x);
  try {
    assert.strictEqual(x.prepared.legacy_candidate_parent.active.book_plan_ref, 'PLAN-001:V2');
    assert.strictEqual(x.prepared.legacy_candidate_parent.state_version, x.legacy.state_version + 1);
    const current = s.store.readCurrentParent('BOOK-PROJECT-001');
    assert.strictEqual(current.active.book_plan_ref, 'PLAN-001:V1');
    assert.strictEqual(current.state_version, 1);
  } finally { cleanup(s); }
});

t('Q058', 'content admission prepares typed parent effect only', () => {
  const x = context();
  const e = x.prepared.parent_effect;
  assert.strictEqual(e.effect_type, 'COMMIT_CONTENT_ADMISSION');
  assert.strictEqual(e.expected_specialist_ledger_identity, rebind.specialistIdentity(x.specialist));
  assert.strictEqual(e.effect_payload.governed_object_versions.length, 1);
  assert.strictEqual(e.effect_payload.governed_object_versions[0].object_type, 'BOOK_PLAN');
  assert.deepStrictEqual(e.effect_payload.active_pointer_updates, [{ object_type: 'BOOK_PLAN', target_ref: 'PLAN-001:V2' }]);
  assert.strictEqual(e.specialist_receipt_refs[0], x.prepared.specialist_delta.specialist_receipt.receipt_id);
});

let passed = 0;
for (const test of tests) {
  try { test.fn(); passed += 1; console.log(`PASS ${test.id} ${test.name}`); }
  catch (err) { console.error(`FAIL ${test.id} ${test.name}: ${err.stack || err}`); process.exitCode = 1; }
}
console.log(JSON.stringify({ qualification: 'BOOK-RECONSTRUCTION-B00-F5', required: 8, observed: tests.length, passed, failed: tests.length - passed, status: passed === 8 && tests.length === 8 ? 'PASS' : 'FAIL' }));
if (tests.length !== 8 || passed !== 8) process.exit(1);
