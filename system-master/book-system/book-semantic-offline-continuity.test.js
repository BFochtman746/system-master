'use strict';

const assert = require('assert');
const continuity = require('./book-semantic-offline-continuity');

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);

function anchor(overrides = {}) {
  return {
    book_project_id: 'book-project-001',
    semantic_manifest_id: 'book-semantic-manifest-001',
    semantic_manifest_digest: A,
    subject: {
      canonical_state_ref: 'book:canonical:v7',
      canonical_digest: B,
      manuscript_ref: 'book:manuscript:v7',
      manuscript_digest: C
    },
    ...overrides
  };
}
function expectCode(fn, code) {
  assert.throws(fn, error => error && error.code === code, `expected ${code}`);
}

const base = anchor();
assert.strictEqual(continuity.validateSemanticAnchor(base), true);
const session = continuity.createOfflineSession({
  session_id: 'offline-session-001',
  semantic_anchor: base,
  opened_at: '2026-09-14T16:45:00Z',
  local_checkpoint_ref: 'book:checkpoint:offline-001'
});
assert.strictEqual(continuity.validateOfflineSession(session), true);
assert.strictEqual(session.auto_apply_allowed, false);
assert.strictEqual(session.canonical_effect_allowed, false);

const unchanged = continuity.reconcileOfflineSession({
  session,
  reconnect_anchor: base,
  offline_delta_digest: D
});
assert.strictEqual(unchanged.disposition, 'ELIGIBLE_FOR_NORMAL_ADMISSION');
assert.strictEqual(unchanged.normal_admission_allowed, true);
assert.strictEqual(unchanged.auto_apply_allowed, false);
assert.strictEqual(unchanged.canonical_effect_allowed, false);

const changedManifest = continuity.reconcileOfflineSession({
  session,
  reconnect_anchor: anchor({ semantic_manifest_digest: D }),
  offline_delta_digest: D
});
assert.strictEqual(changedManifest.disposition, 'RECONCILIATION_REQUIRED');
assert.strictEqual(changedManifest.normal_admission_allowed, false);
assert.strictEqual(changedManifest.auto_apply_allowed, false);

const changedSubjectAnchor = anchor();
changedSubjectAnchor.subject = { ...changedSubjectAnchor.subject, canonical_state_ref: 'book:canonical:v8', canonical_digest: D };
const changedSubject = continuity.reconcileOfflineSession({
  session,
  reconnect_anchor: changedSubjectAnchor,
  offline_delta_digest: D
});
assert.strictEqual(changedSubject.disposition, 'RECONCILIATION_REQUIRED');
assert.strictEqual(changedSubject.exact_manifest_base, true);
assert.strictEqual(changedSubject.exact_subject_base, false);

expectCode(() => continuity.reconcileOfflineSession({
  session,
  reconnect_anchor: anchor({ book_project_id: 'book-project-002' }),
  offline_delta_digest: D
}), 'OFFLINE_PROJECT_IDENTITY_MISMATCH');

const tampered = JSON.parse(JSON.stringify(session));
tampered.base_semantic_manifest_digest = D;
expectCode(() => continuity.validateOfflineSession(tampered), 'OFFLINE_SESSION_DIGEST_MISMATCH');

const policy = {
  policy_id: 'retention-policy-001',
  core_physical_policy_ref: 'core:p03:retention-policy:book-long-term',
  retained_semantic_classes: ['SEMANTIC_BACKUP_SET','PRESERVATION_RECEIPTS','BOOK_LINEAGE'],
  retrievability_verification_required: true,
  destructive_restore_drill_required: true,
  retain_book_lineage: true,
  core_executes_physical_retention: true,
  book_executes_physical_retention: false
};
assert.strictEqual(continuity.validateRetentionPolicy(policy), true);
expectCode(() => continuity.validateRetentionPolicy({ ...policy, retained_semantic_classes: ['SEMANTIC_BACKUP_SET','PRESERVATION_RECEIPTS'] }), 'RETAINED_SEMANTIC_CLASS_MISSING');
expectCode(() => continuity.validateRetentionPolicy({ ...policy, retrievability_verification_required: false }), 'RETRIEVABILITY_VERIFICATION_REQUIRED');
expectCode(() => continuity.validateRetentionPolicy({ ...policy, book_executes_physical_retention: true }), 'BOOK_PHYSICAL_RETENTION_FORBIDDEN');

const lineage = continuity.createLineageReentryAnchor({
  semantic_anchor: base,
  preservation_receipt_ref: 'book:preservation:receipt-001',
  continuation_anchor: 'book:continue:v7',
  reentry_anchor: 'book:reentry:v7',
  created_at: '2026-09-14T16:46:00Z'
});
assert.match(lineage.anchor_digest, /^[a-f0-9]{64}$/);
assert.strictEqual(lineage.release_authority_granted, false);
assert.strictEqual(lineage.distribution_authority_granted, false);
assert.strictEqual(lineage.canonical_effect_allowed, false);

console.log('BOOK_SEMANTIC_OFFLINE_CONTINUITY_TESTS_PASS');
