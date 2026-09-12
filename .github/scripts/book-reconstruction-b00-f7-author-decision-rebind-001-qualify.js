'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const core = require('../../system-master/book-system/canonical-parent-v2-f6-core.js');
const queue = require('../../system-master/book-system/author-decision-queue-core.js');
const rebind = require('../../system-master/book-system/author-decision-v2-rebind.js');
const { AuthorDecisionV2SqliteStore } = require('../../system-master/book-system/author-decision-v2-sqlite-store.js');

const H = value => core.sha256(String(value));
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function expectCode(code, fn) { assert.throws(fn, err => err && err.code === code, `expected ${code}`); }

function governed(objectId, version = '1') {
  return { object_id: objectId, version, book_project_id: 'BOOK-PROJECT-001', object_digest: H(`${objectId}:${version}`) };
}
function style(objectId = 'STYLE-1', version = '1') {
  return { object_id: objectId, version, book_project_id: 'BOOK-PROJECT-001', standing: 'CURRENT', profile_digest: H(`${objectId}:${version}:CURRENT`) };
}
function parentAt(status = 'AUTHOR_REVIEW') {
  return core.sealParent({
    schema_version: core.SCHEMA_VERSION,
    state_version: 7,
    state_digest: '0'.repeat(64),
    book_project: { book_project_id: 'BOOK-PROJECT-001', book_id: 'BOOK-001', status },
    governed_objects: {
      governing_briefs: [governed('BRIEF-1')],
      canon_manifests: [governed('CANON-1')],
      story_bibles: [governed('BIBLE-1')],
      book_plans: [governed('PLAN-1')],
      manuscripts: [governed('MS-1')],
    },
    research_evidence_links: [],
    author_decisions: [],
    integration_proposals: [],
    rights_custody_records: [],
    style_profiles: [style()],
    export_releases: [],
    active: {
      governing_brief_ref: 'BRIEF-1:1', canon_manifest_ref: 'CANON-1:1', story_bible_ref: 'BIBLE-1:1',
      book_plan_ref: 'PLAN-1:1', canonical_manuscript_ref: 'MS-1:1', style_profile_ref: 'STYLE-1:1',
    },
    authority_metadata: { owner: 'SYSTEM_MASTER/BOOK', reconstruction: 'B00-F7-QUALIFICATION-FIXTURE' },
    mutation_head: null,
  });
}

function authorState(parent, overrides = {}) {
  const options = clone(overrides.options || [
    { option_id: 'APPROVE', label: 'Approve', effect: 'Accept the proposed Book change', consequence_class: 'MATERIAL_REVISION', canonical_decision_status: 'APPROVED' },
    { option_id: 'REJECT', label: 'Reject', effect: 'Reject the proposed Book change', consequence_class: 'MATERIAL_REVISION', canonical_decision_status: 'REJECTED' },
  ]);
  const familyId = 'ADFAM-F7-001';
  const requestId = 'ADREQ-F7-001';
  const snapshot = {
    decision_family_id: familyId,
    decision_request_id: requestId,
    decision_request_version: 1,
    predecessor_decision_request_id: null,
    book_project_id: parent.book_project.book_project_id,
    book_id: parent.book_project.book_id,
    decision_type: 'FINALIZATION_DIRECTION',
    authority_class: 'AUTHOR_ONLY',
    subject_ref: 'BRIEF-1:1',
    subject_identity_refs: [{ object_id: 'BRIEF-1', object_version: '1', object_digest: H('BRIEF-1:1') }],
    bound_parent_state_version: parent.state_version,
    bound_parent_state_digest: parent.state_digest,
    source_authority_kind: 'PARENT_DIRECT_AUTHOR_QUERY',
    source_handoff_refs: ['HANDOFF-F7-001'],
    options,
    option_set_digest: queue.digest(options),
    custom_option_allowed: overrides.custom_option_allowed === true,
    evidence_refs: ['EVID-F7-CONTEXT'],
    disagreement_refs: [],
    consequence_summary: 'Author choice required before finalization.',
    confirmation_policy: overrides.confirmation_policy || 'NONE',
    queue_state: overrides.queue_state || 'PENDING',
    presentation_state: 'NOT_PRESENTED',
    staleness_reason: null,
    supersedes_request_id: null,
    created_at: '2026-09-12T07:20:00.000Z',
    created_by: 'BOOK_SYSTEM_PARENT',
  };
  const ledger = rebind.emptyQueueLedger(parent);
  ledger.decision_families[familyId] = { decision_family_id: familyId, first_request_id: requestId };
  ledger.decision_request_snapshots[requestId] = snapshot;
  ledger.current_request_index[familyId] = requestId;
  ledger.source_handoff_index['HANDOFF-F7-001'] = familyId;
  return rebind.createAuthorDecisionSpecialistState(parent, { queue_ledger: ledger });
}

function resolutionRequest(parent, state, overrides = {}) {
  const snapshot = state.queue_ledger.decision_request_snapshots['ADREQ-F7-001'];
  return Object.assign({
    resolution_request_id: 'F7-RESOLVE-001',
    idempotency_key: 'F7-IDEM-001',
    author_actor_ref: 'AUTHOR-EVIDENCE-ACTOR-REF-001',
    author_authority_proof_ref: 'AUTHOR-AUTHORITY-EVIDENCE-REF-001',
    expected_parent_state_version: parent.state_version,
    expected_parent_state_digest: parent.state_digest,
    expected_author_decision_identity: rebind.authorDecisionIdentity(state, parent),
    decision_request_id: snapshot.decision_request_id,
    expected_decision_request_version: snapshot.decision_request_version,
    expected_decision_request_digest: queue.digestDecisionRequest(snapshot),
    selected_option_id: 'APPROVE',
    custom_author_choice: null,
    confirmation_evidence: null,
    rationale_ref: null,
    created_at: '2026-09-12T07:21:00.000Z',
  }, overrides);
}

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'book-f7-'));
  return { dir, db: path.join(dir, 'book.sqlite') };
}
function seeded(parent, state, options = {}) {
  const t = tempDb();
  const store = new AuthorDecisionV2SqliteStore(t.db, options);
  store.createParent(parent, 'F7-QUALIFICATION-CREATE');
  store.createAuthorDecisionState(state, '2026-09-12T07:20:30.000Z');
  return { ...t, store };
}
function cleanup(x) {
  try { x.store.close(); } catch (_) {}
  try { fs.rmSync(x.dir, { recursive: true, force: true }); } catch (_) {}
}
function count(store, table) { return Number(store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n); }

const tests = [];
function t(id, name, fn) { tests.push({ id, name, fn }); }

t('Q061', 'author queue resolution is prepare-only until canonical parent and specialist state commit atomically', () => {
  const parent = parentAt();
  const state = authorState(parent);
  const request = resolutionRequest(parent, state);
  const parentBefore = JSON.stringify(parent);
  const stateBefore = JSON.stringify(state);
  const prepared = rebind.prepareAuthorDecisionResolution({ canonicalParent: parent, authorDecisionState: state, request });
  assert.strictEqual(prepared.disposition, 'PREPARED_FOR_PARENT');
  assert.strictEqual(prepared.parent_effect.effect_type, 'REGISTER_FINAL_AUTHOR_DECISION');
  assert.strictEqual(prepared.parent_effect.actor_class, 'AUTHOR');
  assert.strictEqual(prepared.parent_effect.authority_ref, request.author_authority_proof_ref);
  assert.strictEqual(JSON.stringify(parent), parentBefore);
  assert.strictEqual(JSON.stringify(state), stateBefore);
  assert.strictEqual(parent.author_decisions.length, 0);
  const s = seeded(parent, state);
  try {
    const result = s.store.commitPreparedAuthorDecision(prepared);
    assert.strictEqual(result.replay, false);
    assert.strictEqual(result.parent_state.author_decisions.length, 1);
    assert.strictEqual(result.parent_state.author_decisions[0].decision_id, prepared.specialist_delta.specialist_receipt.decision_id);
    assert.strictEqual(result.author_decision_state.queue_ledger.decision_request_snapshots[result.author_decision_state.queue_ledger.current_request_index['ADFAM-F7-001']].queue_state, 'RESOLVED');
    assert.strictEqual(result.specialist_receipt.parent_commit_receipt_ref, result.commit_receipt.receipt_id);
    assert.strictEqual(count(s.store, 'parent_commit_receipt'), 1);
    assert.strictEqual(count(s.store, 'book_author_decision_receipt'), 1);
    assert.strictEqual(count(s.store, 'parent_history'), 2);
  } finally { cleanup(s); }
});

t('Q062', 'absence of explicit author authority or explicit author choice remains blocked before any parent effect exists', () => {
  const parent = parentAt();
  const state = authorState(parent);
  const noAuthority = resolutionRequest(parent, state, { author_actor_ref: '', author_authority_proof_ref: '' });
  expectCode('AUTHOR_AUTHORITY_PROOF_REQUIRED', () => rebind.prepareAuthorDecisionResolution({ canonicalParent: parent, authorDecisionState: state, request: noAuthority }));
  const noChoice = resolutionRequest(parent, state, { selected_option_id: null, custom_author_choice: null });
  expectCode('EXACTLY_ONE_AUTHOR_CHOICE_REQUIRED', () => rebind.prepareAuthorDecisionResolution({ canonicalParent: parent, authorDecisionState: state, request: noChoice }));
  assert.strictEqual(parent.author_decisions.length, 0);
});

t('F7-STALE-SPECIALIST', 'stale author-decision specialist identity fails closed before write', () => {
  const parent = parentAt(); const state = authorState(parent);
  const request = resolutionRequest(parent, state, { expected_author_decision_identity: 'a'.repeat(64) });
  expectCode('AUTHOR_DECISION_IDENTITY_MISMATCH', () => rebind.prepareAuthorDecisionResolution({ canonicalParent: parent, authorDecisionState: state, request }));
});

t('F7-STALE-PARENT', 'stale canonical parent identity fails closed before queue resolution', () => {
  const parent = parentAt(); const state = authorState(parent);
  const request = resolutionRequest(parent, state, { expected_parent_state_digest: 'f'.repeat(64) });
  expectCode('STALE_PARENT_WRITE', () => rebind.prepareAuthorDecisionResolution({ canonicalParent: parent, authorDecisionState: state, request }));
});

t('F7-STALE-SUBJECT', 'author resolution cannot bind a stale or foreign subject identity', () => {
  const parent = parentAt(); const state = authorState(parent);
  state.queue_ledger.decision_request_snapshots['ADREQ-F7-001'].subject_identity_refs[0].object_digest = 'a'.repeat(64);
  state.queue_ledger.decision_request_snapshots['ADREQ-F7-001'].option_set_digest = queue.digest(state.queue_ledger.decision_request_snapshots['ADREQ-F7-001'].options);
  const request = resolutionRequest(parent, state);
  expectCode('SUBJECT_IDENTITY_NOT_CURRENT', () => rebind.prepareAuthorDecisionResolution({ canonicalParent: parent, authorDecisionState: state, request }));
});

t('F7-TERMINAL-QUEUE', 'withdrawn or already terminal queue state cannot resolve again', () => {
  const parent = parentAt(); const state = authorState(parent, { queue_state: 'WITHDRAWN' });
  const request = resolutionRequest(parent, state);
  expectCode('DECISION_REQUEST_NOT_RESOLVABLE', () => rebind.prepareAuthorDecisionResolution({ canonicalParent: parent, authorDecisionState: state, request }));
});

t('F7-CONFIRMATION', 'material author choice requiring confirmation fails without exact confirmation evidence', () => {
  const parent = parentAt(); const state = authorState(parent, { confirmation_policy: 'REVIEW_SELECTED_CHOICE_AND_CONSEQUENCE' });
  const request = resolutionRequest(parent, state);
  expectCode('AUTHOR_CONFIRMATION_REQUIRED', () => rebind.prepareAuthorDecisionResolution({ canonicalParent: parent, authorDecisionState: state, request }));
  const snapshot = state.queue_ledger.decision_request_snapshots['ADREQ-F7-001'];
  const confirmed = resolutionRequest(parent, state, {
    confirmation_evidence: {
      confirmed: true,
      decision_request_digest: queue.digestDecisionRequest(snapshot),
      selected_option_identity: 'OPTION:APPROVE',
      consequence_reviewed: true,
      confirmation_evidence_ref: 'AUTHOR-CONFIRMATION-EVIDENCE-REF-001',
    },
  });
  const prepared = rebind.prepareAuthorDecisionResolution({ canonicalParent: parent, authorDecisionState: state, request: confirmed });
  assert.strictEqual(prepared.specialist_delta.specialist_receipt.confirmation_evidence_ref, 'AUTHOR-CONFIRMATION-EVIDENCE-REF-001');
});

t('F7-CUSTOM-PRIVACY', 'custom choice is digest-bound in canonical parent and raw custom text does not enter parent history', () => {
  const parent = parentAt(); const state = authorState(parent, { custom_option_allowed: true });
  const raw = 'private custom author wording fixture';
  const request = resolutionRequest(parent, state, { selected_option_id: null, custom_author_choice: raw });
  const prepared = rebind.prepareAuthorDecisionResolution({ canonicalParent: parent, authorDecisionState: state, request });
  const serialized = JSON.stringify(prepared.anticipated_parent_state);
  assert.ok(!serialized.includes(raw));
  assert.ok(serialized.includes(`CUSTOM_DIGEST:${core.sha256(raw)}`));
});

t('F7-SPECIALIST-FAILURE-ROLLBACK', 'injected author-decision persistence failure rolls back canonical parent', () => {
  const parent = parentAt(); const state = authorState(parent);
  const prepared = rebind.prepareAuthorDecisionResolution({ canonicalParent: parent, authorDecisionState: state, request: resolutionRequest(parent, state) });
  const s = seeded(parent, state, { faultInjector: point => { if (point === 'after_author_decision_update') throw new Error('INJECTED_AUTHOR_DECISION_PERSISTENCE_FAILURE'); } });
  try {
    expectCode('STORE_SQLITE_FAILURE', () => s.store.commitPreparedAuthorDecision(prepared));
    assert.strictEqual(s.store.readCurrentParent('BOOK-PROJECT-001').author_decisions.length, 0);
    assert.strictEqual(s.store.readAuthorDecisionState('BOOK-PROJECT-001').author_decision_identity, rebind.authorDecisionIdentity(state, parent));
    assert.strictEqual(count(s.store, 'parent_commit_receipt'), 0);
    assert.strictEqual(count(s.store, 'book_author_decision_receipt'), 0);
  } finally { cleanup(s); }
});

t('F7-RESPONSE-LOSS', 'response loss reconciles immutable parent and author-decision receipts without a second commit', () => {
  const parent = parentAt(); const state = authorState(parent);
  const prepared = rebind.prepareAuthorDecisionResolution({ canonicalParent: parent, authorDecisionState: state, request: resolutionRequest(parent, state) });
  const s = seeded(parent, state, { faultInjector: point => { if (point === 'after_commit') throw new Error('INJECTED_RESPONSE_LOSS'); } });
  try {
    expectCode('STORE_SQLITE_FAILURE', () => s.store.commitPreparedAuthorDecision(prepared));
    const reconciled = s.store.reconcileAuthorDecision(prepared);
    assert.strictEqual(reconciled.committed, true);
    assert.strictEqual(reconciled.parent_state.author_decisions.length, 1);
    const replay = s.store.commitPreparedAuthorDecision(prepared);
    assert.strictEqual(replay.replay, true);
    assert.strictEqual(replay.specialist_receipt.receipt_id, reconciled.specialist_receipt.receipt_id);
    assert.strictEqual(count(s.store, 'parent_commit_receipt'), 1);
    assert.strictEqual(count(s.store, 'book_author_decision_receipt'), 1);
  } finally { cleanup(s); }
});

t('F7-IDEMPOTENCY-CONFLICT', 'same specialist idempotency key with different semantic request fails closed', () => {
  const parent = parentAt(); const state = authorState(parent);
  const prepared = rebind.prepareAuthorDecisionResolution({ canonicalParent: parent, authorDecisionState: state, request: resolutionRequest(parent, state) });
  const s = seeded(parent, state);
  try {
    s.store.commitPreparedAuthorDecision(prepared);
    const changed = clone(prepared);
    changed.specialist_delta.specialist_receipt.request_fingerprint = 'b'.repeat(64);
    expectCode('IDEMPOTENCY_KEY_CONFLICT', () => s.store.commitPreparedAuthorDecision(changed));
    assert.strictEqual(count(s.store, 'parent_commit_receipt'), 1);
  } finally { cleanup(s); }
});

t('F7-RECOVERY', 'reopen and recovery preserve parent/author specialist receipt linkage', () => {
  const parent = parentAt(); const state = authorState(parent);
  const prepared = rebind.prepareAuthorDecisionResolution({ canonicalParent: parent, authorDecisionState: state, request: resolutionRequest(parent, state) });
  const tdb = tempDb();
  let store = new AuthorDecisionV2SqliteStore(tdb.db);
  try {
    store.createParent(parent, 'F7-RECOVERY-CREATE');
    store.createAuthorDecisionState(state, '2026-09-12T07:20:30.000Z');
    const committed = store.commitPreparedAuthorDecision(prepared);
    const expectedReceipt = committed.specialist_receipt.receipt_id;
    store.close();
    store = new AuthorDecisionV2SqliteStore(tdb.db);
    const recovered = store.recoverAndVerifyAuthorDecision('BOOK-PROJECT-001');
    assert.strictEqual(recovered.author_decision_receipt_count, 1);
    assert.strictEqual(store.readAuthorDecisionReceipt(expectedReceipt).receipt_id, expectedReceipt);
    assert.strictEqual(store.readCurrentParent('BOOK-PROJECT-001').author_decisions.length, 1);
  } finally {
    try { store.close(); } catch (_) {}
    try { fs.rmSync(tdb.dir, { recursive: true, force: true }); } catch (_) {}
  }
});

let passed = 0;
for (const test of tests) {
  try {
    test.fn();
    passed += 1;
    console.log(`PASS ${test.id} ${test.name}`);
  } catch (err) {
    console.error(`FAIL ${test.id} ${test.name}`);
    console.error(err && err.stack || err);
    process.exitCode = 1;
  }
}
if (passed !== tests.length) process.exit(1);
console.log(JSON.stringify({ qualification_id: 'BOOK-RECONSTRUCTION-B00-F7-AUTHOR-DECISION-REBIND-001', result_class: 'PASS', case_count: tests.length, pass_count: passed, fail_count: 0 }, null, 2));