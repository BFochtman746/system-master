'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const core = require('../../system-master/book-system/canonical-parent-v2-f6-core.js');
const recovered = require('../../system-master/book-system/integration-proposal-runtime-v2-core.js');
const rebind = require('../../system-master/book-system/integration-proposal-v2-rebind.js');
const { IntegrationProposalV2SqliteStore } = require('../../system-master/book-system/integration-proposal-v2-sqlite-store.js');

const H = value => core.sha256(String(value));
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function expectCode(code, fn) { assert.throws(fn, err => err && err.code === code, `expected ${code}`); }

function governed(objectId, version = '1') {
  return { object_id: objectId, version, book_project_id: 'BOOK-PROJECT-001', object_digest: H(`${objectId}:${version}`) };
}
function style(objectId = 'STYLE-1', version = '1') {
  return { object_id: objectId, version, book_project_id: 'BOOK-PROJECT-001', standing: 'CURRENT', profile_digest: H(`${objectId}:${version}:CURRENT`) };
}
function parentAt(options = {}) {
  return core.sealParent({
    schema_version: core.SCHEMA_VERSION,
    state_version: 8,
    state_digest: '0'.repeat(64),
    book_project: { book_project_id: 'BOOK-PROJECT-001', book_id: 'BOOK-001', status: 'AUTHOR_REVIEW' },
    governed_objects: {
      governing_briefs: [governed('BRIEF-1')],
      canon_manifests: [governed('CANON-1')],
      story_bibles: [governed('BIBLE-1')],
      book_plans: [governed('PLAN-1')],
      manuscripts: [governed('MS-1')],
    },
    research_evidence_links: [],
    author_decisions: clone(options.author_decisions || []),
    integration_proposals: [],
    rights_custody_records: [],
    style_profiles: [style()],
    export_releases: [],
    active: {
      governing_brief_ref: 'BRIEF-1:1', canon_manifest_ref: 'CANON-1:1', story_bible_ref: 'BIBLE-1:1',
      book_plan_ref: 'PLAN-1:1', canonical_manuscript_ref: 'MS-1:1', style_profile_ref: 'STYLE-1:1',
    },
    authority_metadata: { owner: 'SYSTEM_MASTER/BOOK', reconstruction: 'B00-F8-QUALIFICATION-FIXTURE' },
    mutation_head: null,
  });
}

function proposalLedger(parent, options = {}) {
  const source = { object_id: 'BRIEF-1', object_version: '1', object_digest: H('BRIEF-1:1') };
  const ledger = recovered.createLedger(parent, { source_identity_refs: [source] });
  const family = 'PF-F8-001';
  const proposalId = options.proposal_id || `${family}-V4`;
  const snapshot = {
    proposal_id: proposalId,
    proposal_family_id: family,
    proposal_version: 4,
    predecessor_proposal_id: `${family}-V3`,
    source_project_or_lane: options.source_project_or_lane || 'SYSTEM_MASTER/BOOK/PROSE',
    source_subject_sha: H('historical-provider-subject'),
    service_id: 'BOOK_PROSE_SERVICE',
    operation_id: 'PROPOSE_INTEGRATION',
    capability_id: 'BOOK_PROSE_SERVICE.PROPOSE_INTEGRATION',
    admission_state: options.admission_state || 'ADMITTED',
    source_request_id: 'REQ-F8-001',
    source_response_id: 'RESP-F8-001',
    source_result_class: 'SUCCESS',
    source_parent_projection_identity: { parent_state_version: parent.state_version, parent_state_digest: parent.state_digest },
    source_object_refs_and_digests: [source],
    evidence_refs: ['EVIDENCE-F8-001'],
    artifact_refs_and_digests: [],
    artifact_currentness: 'CURRENT',
    provenance_projection_refs_and_currentness: [],
    editorial_stage_context: null,
    editorial_gate_evidence_refs: [],
    editorial_gate_state: 'NOT_SCOPED',
    target_medium_context: null,
    technical_export_state: 'NONE',
    abstentions: [],
    warnings: [],
    disagreement_state: null,
    rights_boundary: options.rights_boundary || 'DECLARED_BOOK_SCOPE_ONLY',
    privacy_boundary: options.privacy_boundary || 'NO_PRIVATE_PAYLOAD_IN_PARENT',
    author_decision_required: options.author_decision_required === true,
    author_decision_refs: clone(options.author_decision_refs || []),
    publication_authorized: options.publication_authorized === true,
    last_revalidated_parent_state_version: parent.state_version,
    last_revalidated_parent_state_digest: parent.state_digest,
    created_by: 'BOOK_SYSTEM_PARENT_RUNTIME_V2',
  };
  ledger.proposal_snapshots.push(snapshot);
  ledger.proposal_families[family] = { proposal_family_id: family, latest_version: 4, latest_snapshot_id: proposalId, admission_state: snapshot.admission_state };
  ledger.ledger_version += 1;
  return ledger;
}

function stateFor(parent, options = {}) {
  return rebind.createIntegrationProposalSpecialistState(parent, { proposal_ledger: proposalLedger(parent, options) });
}

function registrationRequest(parent, state, options = {}) {
  return Object.assign({
    registration_request_id: 'F8-REGISTER-001',
    idempotency_key: 'F8-IDEM-001',
    authority_ref: 'BOOK-INTEGRATION-AUTHORITY-REF-001',
    expected_parent_state_version: parent.state_version,
    expected_parent_state_digest: parent.state_digest,
    expected_integration_proposal_identity: rebind.integrationProposalIdentity(state, parent),
    proposal_id: 'PF-F8-001-V4',
    created_at: '2026-09-12T07:31:00.000Z',
  }, options);
}

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'book-f8-'));
  return { dir, db: path.join(dir, 'book.sqlite') };
}
function seeded(parent, state, options = {}) {
  const t = tempDb();
  const store = new IntegrationProposalV2SqliteStore(t.db, options);
  store.createParent(parent, 'F8-QUALIFICATION-CREATE');
  store.createIntegrationProposalState(state, '2026-09-12T07:30:30.000Z');
  return { ...t, store };
}
function cleanup(x) {
  try { x.store.close(); } catch (_) {}
  try { fs.rmSync(x.dir, { recursive: true, force: true }); } catch (_) {}
}
function count(store, table) { return Number(store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n); }

const tests = [];
function t(id, name, fn) { tests.push({ id, name, fn }); }

t('Q063', 'integration proposal specialist cannot directly mutate canonical parent and only admitted proposal commits through typed parent effect', () => {
  const parent = parentAt();
  const state = stateFor(parent);
  const request = registrationRequest(parent, state);
  const parentBefore = JSON.stringify(parent);
  const stateBefore = JSON.stringify(state);
  const prepared = rebind.prepareAdmittedIntegrationProposalRegistration({ canonicalParent: parent, integrationProposalState: state, request });
  assert.strictEqual(prepared.disposition, 'PREPARED_FOR_PARENT');
  assert.strictEqual(prepared.parent_effect.effect_type, 'REGISTER_ADMITTED_INTEGRATION_PROPOSAL');
  assert.strictEqual(prepared.parent_effect.actor_class, 'SYSTEM');
  assert.strictEqual(parent.integration_proposals.length, 0);
  assert.strictEqual(JSON.stringify(parent), parentBefore);
  assert.strictEqual(JSON.stringify(state), stateBefore);
  const record = prepared.parent_effect.effect_payload.record;
  assert.strictEqual(record.source_project_or_lane, 'SYSTEM_MASTER/BOOK');
  assert.strictEqual(record.provenance_source_project_or_lane, 'SYSTEM_MASTER/BOOK/PROSE');
  assert.strictEqual(record.publication_authorized, false);
  const s = seeded(parent, state);
  try {
    const committed = s.store.commitPreparedIntegrationProposal(prepared);
    assert.strictEqual(committed.replay, false);
    assert.strictEqual(committed.parent_state.integration_proposals.length, 1);
    assert.strictEqual(committed.parent_state.integration_proposals[0].proposal_id, 'PF-F8-001-V4');
    assert.strictEqual(count(s.store, 'parent_commit_receipt'), 1);
    assert.strictEqual(count(s.store, 'book_integration_proposal_receipt'), 1);
  } finally { cleanup(s); }
});

t('F8-NON-ADMITTED', 'non-admitted specialist proposal cannot become canonical Book truth', () => {
  const parent = parentAt(); const state = stateFor(parent, { admission_state: 'PARENT_PREQUALIFIED' });
  expectCode('PROPOSAL_NOT_ADMITTED', () => rebind.prepareAdmittedIntegrationProposalRegistration({ canonicalParent: parent, integrationProposalState: state, request: registrationRequest(parent, state) }));
  assert.strictEqual(parent.integration_proposals.length, 0);
});

t('F8-STALE-PARENT', 'stale canonical parent identity blocks registration', () => {
  const parent = parentAt(); const state = stateFor(parent);
  const request = registrationRequest(parent, state, { expected_parent_state_digest: 'f'.repeat(64) });
  expectCode('STALE_PARENT_WRITE', () => rebind.prepareAdmittedIntegrationProposalRegistration({ canonicalParent: parent, integrationProposalState: state, request }));
});

t('F8-STALE-SOURCE', 'stale source identity blocks registration even when proposal says admitted', () => {
  const parent = parentAt(); const state = stateFor(parent);
  state.proposal_ledger.source_identity_index['BRIEF-1'].current = false;
  const request = registrationRequest(parent, state, { expected_integration_proposal_identity: rebind.integrationProposalIdentity(state, parent) });
  expectCode('STALE_SOURCE_IDENTITY', () => rebind.prepareAdmittedIntegrationProposalRegistration({ canonicalParent: parent, integrationProposalState: state, request }));
});

t('F8-PUBLICATION-FENCE', 'proposal cannot import publication authority into canonical parent', () => {
  const parent = parentAt(); const state = stateFor(parent, { publication_authorized: true });
  expectCode('PROPOSAL_PUBLICATION_AUTHORITY_FORBIDDEN', () => rebind.prepareAdmittedIntegrationProposalRegistration({ canonicalParent: parent, integrationProposalState: state, request: registrationRequest(parent, state) }));
});

t('F8-AUTHOR-ABSENCE', 'author-gated proposal remains blocked when no real author decision evidence is present', () => {
  const parent = parentAt(); const state = stateFor(parent, { author_decision_required: true });
  expectCode('AUTHOR_DECISION_REQUIRED', () => rebind.prepareAdmittedIntegrationProposalRegistration({ canonicalParent: parent, integrationProposalState: state, request: registrationRequest(parent, state) }));
});

t('F8-AUTHOR-FIXTURE-FENCE', 'machine-side approved author-decision fixture may bind only by current canonical decision id', () => {
  const parent = parentAt({ author_decisions: [{ decision_id: 'AUTHORDECISION-FIXTURE-001', status: 'APPROVED', subject_ref: 'PF-F8-001-V4', author_choice_identity: 'OPTION:APPROVE' }] });
  const state = stateFor(parent, { author_decision_required: true, author_decision_refs: ['AUTHORDECISION-FIXTURE-001'] });
  const prepared = rebind.prepareAdmittedIntegrationProposalRegistration({ canonicalParent: parent, integrationProposalState: state, request: registrationRequest(parent, state) });
  assert.deepStrictEqual(prepared.parent_effect.effect_payload.record.author_decision_refs, ['AUTHORDECISION-FIXTURE-001']);
});

t('F8-SPECIALIST-ROLLBACK', 'specialist persistence failure rolls back canonical parent atomically', () => {
  const parent = parentAt(); const state = stateFor(parent);
  const prepared = rebind.prepareAdmittedIntegrationProposalRegistration({ canonicalParent: parent, integrationProposalState: state, request: registrationRequest(parent, state) });
  const s = seeded(parent, state, { faultInjector: point => { if (point === 'after_integration_proposal_update') throw new Error('INJECTED_INTEGRATION_PROPOSAL_FAILURE'); } });
  try {
    expectCode('STORE_SQLITE_FAILURE', () => s.store.commitPreparedIntegrationProposal(prepared));
    assert.strictEqual(s.store.readCurrentParent('BOOK-PROJECT-001').integration_proposals.length, 0);
    assert.strictEqual(count(s.store, 'parent_commit_receipt'), 0);
    assert.strictEqual(count(s.store, 'book_integration_proposal_receipt'), 0);
  } finally { cleanup(s); }
});

t('F8-RESPONSE-LOSS', 'response loss reconciles one immutable proposal commit without duplicate mutation', () => {
  const parent = parentAt(); const state = stateFor(parent);
  const prepared = rebind.prepareAdmittedIntegrationProposalRegistration({ canonicalParent: parent, integrationProposalState: state, request: registrationRequest(parent, state) });
  const s = seeded(parent, state, { faultInjector: point => { if (point === 'after_commit') throw new Error('INJECTED_RESPONSE_LOSS'); } });
  try {
    expectCode('STORE_SQLITE_FAILURE', () => s.store.commitPreparedIntegrationProposal(prepared));
    const reconciled = s.store.reconcileIntegrationProposal(prepared);
    assert.strictEqual(reconciled.committed, true);
    assert.strictEqual(reconciled.parent_state.integration_proposals.length, 1);
    const replay = s.store.commitPreparedIntegrationProposal(prepared);
    assert.strictEqual(replay.replay, true);
    assert.strictEqual(count(s.store, 'parent_commit_receipt'), 1);
    assert.strictEqual(count(s.store, 'book_integration_proposal_receipt'), 1);
  } finally { cleanup(s); }
});

t('F8-IDEMPOTENCY-CONFLICT', 'same specialist idempotency key with changed semantic request fails closed', () => {
  const parent = parentAt(); const state = stateFor(parent);
  const prepared = rebind.prepareAdmittedIntegrationProposalRegistration({ canonicalParent: parent, integrationProposalState: state, request: registrationRequest(parent, state) });
  const s = seeded(parent, state);
  try {
    s.store.commitPreparedIntegrationProposal(prepared);
    const changed = clone(prepared);
    changed.specialist_delta.specialist_receipt.request_fingerprint = 'b'.repeat(64);
    expectCode('IDEMPOTENCY_KEY_CONFLICT', () => s.store.commitPreparedIntegrationProposal(changed));
    assert.strictEqual(count(s.store, 'parent_commit_receipt'), 1);
  } finally { cleanup(s); }
});

t('F8-RECOVERY', 'reopen and recovery preserve parent/proposal receipt linkage', () => {
  const parent = parentAt(); const state = stateFor(parent);
  const prepared = rebind.prepareAdmittedIntegrationProposalRegistration({ canonicalParent: parent, integrationProposalState: state, request: registrationRequest(parent, state) });
  const tdb = tempDb();
  let store = new IntegrationProposalV2SqliteStore(tdb.db);
  try {
    store.createParent(parent, 'F8-RECOVERY-CREATE');
    store.createIntegrationProposalState(state, '2026-09-12T07:30:30.000Z');
    const committed = store.commitPreparedIntegrationProposal(prepared);
    const receiptId = committed.specialist_receipt.receipt_id;
    store.close();
    store = new IntegrationProposalV2SqliteStore(tdb.db);
    const recoveredState = store.recoverAndVerifyIntegrationProposal('BOOK-PROJECT-001');
    assert.strictEqual(recoveredState.integration_proposal_receipt_count, 1);
    assert.strictEqual(store.readIntegrationProposalReceipt(receiptId).receipt_id, receiptId);
    assert.strictEqual(store.readCurrentParent('BOOK-PROJECT-001').integration_proposals.length, 1);
  } finally {
    try { store.close(); } catch (_) {}
    try { fs.rmSync(tdb.dir, { recursive: true, force: true }); } catch (_) {}
  }
});

t('F8-PROSE-RETIRED', 'historical Prose source survives only as provenance while canonical authority remains Book-owned', () => {
  const parent = parentAt(); const state = stateFor(parent, { source_project_or_lane: 'PROSE_SYSTEM' });
  const prepared = rebind.prepareAdmittedIntegrationProposalRegistration({ canonicalParent: parent, integrationProposalState: state, request: registrationRequest(parent, state) });
  const record = prepared.parent_effect.effect_payload.record;
  assert.strictEqual(record.source_project_or_lane, 'SYSTEM_MASTER/BOOK');
  assert.strictEqual(record.provenance_source_project_or_lane, 'PROSE_SYSTEM');
  assert.ok(!JSON.stringify(record).includes('canonical_write_allowed'));
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
console.log(JSON.stringify({ qualification_id: 'BOOK-RECONSTRUCTION-B00-F8-INTEGRATION-PROPOSAL-REBIND-001', result_class: 'PASS', case_count: tests.length, pass_count: passed, fail_count: 0 }, null, 2));
