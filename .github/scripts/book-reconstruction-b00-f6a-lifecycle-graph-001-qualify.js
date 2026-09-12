'use strict';

const assert = require('assert');
const f6 = require('../../system-master/book-system/canonical-parent-v2-f6-core.js');

const H = value => f6.sha256(String(value));
const LEDGER_ID = H('F6-LIFECYCLE-LEDGER-V1');

function governed(objectId, version = '1') {
  return { object_id: objectId, version, book_project_id: 'BOOK-PROJECT-001', object_digest: H(`${objectId}:${version}`) };
}

function style(objectId = 'STYLE-1', version = '1', standing = 'CURRENT') {
  return { object_id: objectId, version, book_project_id: 'BOOK-PROJECT-001', standing, profile_digest: H(`${objectId}:${version}:${standing}`) };
}

function parentAt(status = 'PLANNING') {
  return f6.sealParent({
    schema_version: f6.SCHEMA_VERSION,
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
      governing_brief_ref: 'BRIEF-1:1',
      canon_manifest_ref: 'CANON-1:1',
      story_bible_ref: 'BIBLE-1:1',
      book_plan_ref: 'PLAN-1:1',
      canonical_manuscript_ref: 'MS-1:1',
      style_profile_ref: 'STYLE-1:1',
    },
    authority_metadata: { owner: 'SYSTEM_MASTER/BOOK', reconstruction: 'B00-F6A' },
    mutation_head: null,
  });
}

function lifecycleEffect(parent, toStatus, suffix = `${parent.book_project.status}-${toStatus}`, overrides = {}) {
  const payload = { to_status: toStatus };
  const effect = {
    effect_schema_version: f6.EFFECT_SCHEMA_VERSION,
    effect_request_id: `F6A-REQ-${suffix}`,
    idempotency_key: `F6A-IDEM-${suffix}`,
    actor_class: 'SYSTEM',
    authority_ref: null,
    expected_parent_state_version: parent.state_version,
    expected_parent_state_digest: parent.state_digest,
    effect_type: 'ADVANCE_PROJECT_STATUS',
    effect_payload: payload,
    effect_payload_digest: f6.effectPayloadDigest(payload),
    subject_identity_refs: ['BOOK-PROJECT-001'],
    evidence_refs: [`EVIDENCE:F6A:${suffix}`],
    specialist_receipt_refs: [`LIFECYCLE-PREPARED:${suffix}`],
    created_at: '2026-09-12T07:00:00.000Z',
    expected_specialist_ledger_identity: LEDGER_ID,
  };
  return Object.assign(effect, overrides);
}

function pointerEffect(parent, suffix = 'POINTER') {
  const payload = { target_ref: 'PLAN-1:1' };
  return {
    effect_schema_version: f6.EFFECT_SCHEMA_VERSION,
    effect_request_id: `F6A-REQ-${suffix}`,
    idempotency_key: `F6A-IDEM-${suffix}`,
    actor_class: 'SYSTEM',
    authority_ref: null,
    expected_parent_state_version: parent.state_version,
    expected_parent_state_digest: parent.state_digest,
    effect_type: 'SET_ACTIVE_BOOK_PLAN',
    effect_payload: payload,
    effect_payload_digest: f6.effectPayloadDigest(payload),
    subject_identity_refs: ['PLAN-1:1'],
    evidence_refs: ['EVIDENCE:F6A:NON-LIFECYCLE'],
    specialist_receipt_refs: [],
    created_at: '2026-09-12T07:00:00.000Z',
    expected_specialist_ledger_identity: null,
  };
}

function contentAdmissionEffect(parent) {
  const payload = {
    governed_object_versions: [{
      object_type: 'BOOK_PLAN',
      object_id: 'PLAN-1',
      version: '2',
      book_project_id: 'BOOK-PROJECT-001',
      object_digest: H('PLAN-1:2'),
    }],
    active_pointer_updates: [{ object_type: 'BOOK_PLAN', target_ref: 'PLAN-1:2' }],
    specialist_delta_digest: H('F6A-CONTENT-DELTA'),
  };
  return {
    effect_schema_version: f6.EFFECT_SCHEMA_VERSION,
    effect_request_id: 'F6A-REQ-CONTENT-ADMISSION',
    idempotency_key: 'F6A-IDEM-CONTENT-ADMISSION',
    actor_class: 'SYSTEM',
    authority_ref: null,
    expected_parent_state_version: parent.state_version,
    expected_parent_state_digest: parent.state_digest,
    effect_type: f6.F5_EFFECT_TYPE,
    effect_payload: payload,
    effect_payload_digest: f6.effectPayloadDigest(payload),
    subject_identity_refs: ['BOOK-PROJECT-001', 'PLAN-1:2'],
    evidence_refs: ['EVIDENCE:F6A:CONTENT-ADMISSION'],
    specialist_receipt_refs: ['BVA-PREPARED:F6A'],
    created_at: '2026-09-12T07:00:00.000Z',
    expected_specialist_ledger_identity: H('F6A-CONTENT-LEDGER'),
  };
}

function expectCode(code, fn) {
  assert.throws(fn, err => err && err.code === code, `expected ${code}`);
}

const tests = [];
function t(id, name, fn) { tests.push({ id, name, fn }); }

for (const status of f6.PROJECT_STATUSES) {
  t(`STATUS-${status}`, `accept recovered canonical status ${status}`, () => {
    const p = parentAt(status);
    assert.strictEqual(f6.validateParent(p), true);
  });
}

for (const status of ['RESEARCH', 'REVISING', 'MAGIC']) {
  t(`REJECT-STATUS-${status}`, `reject non-canonical project status ${status}`, () => {
    const p = parentAt(status);
    expectCode('INVALID_PROJECT_STATUS', () => f6.validateParent(p));
  });
}

for (const from of f6.PROJECT_STATUSES) {
  const allowed = new Set(f6.PROJECT_TRANSITIONS[from]);
  for (const to of f6.PROJECT_STATUSES) {
    if (from === to) continue;
    if (allowed.has(to)) {
      t(`EDGE-${from}-${to}`, `accept recovered lifecycle edge ${from}->${to}`, () => {
        assert.strictEqual(f6.legalProjectTransition(from, to), true);
        const p = parentAt(from);
        const effect = lifecycleEffect(p, to);
        const result = f6.applyEffect(p, effect);
        assert.strictEqual(result.replay, false);
        assert.strictEqual(result.parent_state.book_project.status, to);
        assert.strictEqual(result.parent_state.state_version, p.state_version + 1);
        assert.strictEqual(result.commit_receipt.pre_parent_state_digest, p.state_digest);
        assert.strictEqual(result.commit_receipt.post_parent_state_digest, result.parent_state.state_digest);
        assert.deepStrictEqual(result.commit_receipt.specialist_receipt_refs, effect.specialist_receipt_refs);
      });
    } else {
      t(`NONEDGE-${from}-${to}`, `reject non-edge ${from}->${to}`, () => {
        assert.strictEqual(f6.legalProjectTransition(from, to), false);
        const p = parentAt(from);
        expectCode('ILLEGAL_PROJECT_TRANSITION', () => f6.applyEffect(p, lifecycleEffect(p, to)));
      });
    }
  }
}

t('SPECIALIST-BINDING-RECEIPT', 'project transition requires lifecycle specialist receipt', () => {
  const p = parentAt('CREATED');
  const effect = lifecycleEffect(p, 'BRIEFING');
  effect.specialist_receipt_refs = [];
  expectCode('LIFECYCLE_SPECIALIST_RECEIPT_REQUIRED', () => f6.applyEffect(p, effect));
});

t('SPECIALIST-BINDING-LEDGER', 'project transition requires exact lifecycle ledger identity', () => {
  const p = parentAt('CREATED');
  const effect = lifecycleEffect(p, 'BRIEFING');
  effect.expected_specialist_ledger_identity = null;
  expectCode('LIFECYCLE_SPECIALIST_LEDGER_IDENTITY_REQUIRED', () => f6.applyEffect(p, effect));
});

t('STALE-VERSION', 'stale parent version denied before lifecycle mutation', () => {
  const p = parentAt('CREATED');
  const effect = lifecycleEffect(p, 'BRIEFING');
  effect.expected_parent_state_version += 1;
  expectCode('PARENT_STATE_VERSION_CONFLICT', () => f6.applyEffect(p, effect));
});

t('STALE-DIGEST', 'stale parent digest denied before lifecycle mutation', () => {
  const p = parentAt('CREATED');
  const effect = lifecycleEffect(p, 'BRIEFING');
  effect.expected_parent_state_digest = 'f'.repeat(64);
  expectCode('PARENT_STATE_DIGEST_CONFLICT', () => f6.applyEffect(p, effect));
});

t('REPLAY', 'exact lifecycle replay returns the same receipt and successor', () => {
  const p = parentAt('CREATED');
  const effect = lifecycleEffect(p, 'BRIEFING', 'REPLAY');
  const first = f6.applyEffect(p, effect);
  const replay = f6.applyEffect(p, effect, { prior_receipt: first.commit_receipt, prior_parent_state: first.parent_state });
  assert.strictEqual(replay.replay, true);
  assert.strictEqual(replay.commit_receipt.receipt_id, first.commit_receipt.receipt_id);
  assert.strictEqual(replay.parent_state.state_digest, first.parent_state.state_digest);
  assert.strictEqual(replay.parent_state.state_version, first.parent_state.state_version);
});

t('IDEMPOTENCY-CONFLICT', 'same lifecycle idempotency key with changed request fails closed', () => {
  const p = parentAt('CREATED');
  const effect = lifecycleEffect(p, 'BRIEFING', 'CONFLICT');
  const first = f6.applyEffect(p, effect);
  const changed = lifecycleEffect(p, 'BRIEFING', 'CONFLICT', { created_at: '2026-09-12T07:00:01.000Z' });
  expectCode('IDEMPOTENCY_KEY_CONFLICT', () => f6.applyEffect(p, changed, { prior_receipt: first.commit_receipt, prior_parent_state: first.parent_state }));
});

t('NON-LIFECYCLE-PRESERVES-DETAILED-STATUS', 'ordinary parent effect preserves AUTHOR_REVIEW status', () => {
  const p = parentAt('AUTHOR_REVIEW');
  const result = f6.applyEffect(p, pointerEffect(p));
  assert.strictEqual(result.parent_state.book_project.status, 'AUTHOR_REVIEW');
  assert.strictEqual(result.parent_state.state_version, p.state_version + 1);
  assert.strictEqual(result.parent_state.active.book_plan_ref, 'PLAN-1:1');
});

t('F5-CONTENT-ADMISSION-PRESERVES-DETAILED-STATUS', 'F5 content admission survives F6 wrapper and preserves FINALIZATION status', () => {
  const p = parentAt('FINALIZATION');
  const result = f6.applyEffect(p, contentAdmissionEffect(p));
  assert.strictEqual(result.parent_state.book_project.status, 'FINALIZATION');
  assert.strictEqual(result.parent_state.active.book_plan_ref, 'PLAN-1:2');
  assert.strictEqual(result.parent_state.governed_objects.book_plans.length, 2);
  assert.strictEqual(result.parent_state.state_version, p.state_version + 1);
});

let passed = 0;
for (const test of tests) {
  try {
    test.fn();
    passed += 1;
    console.log(`PASS ${test.id} ${test.name}`);
  } catch (err) {
    console.error(`FAIL ${test.id} ${test.name}: ${err.stack || err}`);
    process.exitCode = 1;
  }
}

const statusCount = f6.PROJECT_STATUSES.length;
const edgeCount = Object.values(f6.PROJECT_TRANSITIONS).reduce((n, xs) => n + xs.length, 0);
const nonEdgeCount = statusCount * (statusCount - 1) - edgeCount;
const expected = statusCount + 3 + edgeCount + nonEdgeCount + 8;
const summary = {
  qualification: 'BOOK-RECONSTRUCTION-B00-F6A',
  statuses: statusCount,
  legal_edges: edgeCount,
  rejected_nonedges: nonEdgeCount,
  required: expected,
  observed: tests.length,
  passed,
  failed: tests.length - passed,
  status: passed === expected && tests.length === expected ? 'PASS' : 'FAIL',
};
console.log(JSON.stringify(summary));
if (tests.length !== expected || passed !== expected) process.exit(1);
