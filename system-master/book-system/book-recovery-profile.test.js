'use strict';

const assert = require('assert');
const recovery = require('./book-recovery-profile');

function h(value) { return recovery.sha256(value); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function expectCode(fn, code) {
  let caught = null;
  try { fn(); } catch (err) { caught = err; }
  assert(caught, `expected ${code}`);
  assert.strictEqual(caught.code, code, caught.stack);
}

function makeReleaseManifest() {
  return recovery.createReleaseManifest({
    book_project_id: 'book-001',
    release_candidate_id: 'rc-007',
    accepted_text_digest_sha256: h('accepted-text-v7'),
    metadata_digest_sha256: h('metadata-v3'),
    build_config_digest_sha256: h('build-config-v2'),
    identifier_state_digest_sha256: h('identifier-state-v1'),
    rights_state_digest_sha256: h('rights-state-v4'),
    approvals_digest_sha256: h('approvals-v2'),
    receipt_chain_digest_sha256: h('receipt-chain-v9'),
    created_at: '2026-09-14T12:20:00-04:00'
  });
}

function makeBackupSet(overrides = {}) {
  const manifest = makeReleaseManifest();
  const input = {
    book_project_id: 'book-001',
    source_identity: {
      book_state_version: 42,
      book_state_digest: h('book-state-42'),
      canonical_manuscript_ref: 'book://book-001/manuscript/current',
      manuscript_version_id: 'manuscript-v42',
      manuscript_digest_sha256: h('manuscript-v42')
    },
    components: {
      active_book_state: { ref: 'book://book-001/state/42', digest_sha256: h('book-state-42') },
      canon_knowledge: { ref: 'book://book-001/canon/13', digest_sha256: h('canon-13') },
      research_evidence: { ref: 'book://book-001/research/8', digest_sha256: h('research-8') },
      plan_architecture: { ref: 'book://book-001/plan/5', digest_sha256: h('plan-5') },
      accepted_text: { ref: 'book://book-001/text/v42', digest_sha256: h('accepted-text-v7') },
      release_state: { ref: 'book://book-001/release/rc-007', digest_sha256: manifest.release_manifest_digest_sha256 },
      evidence_receipts: { ref: 'book://book-001/receipts/9', digest_sha256: h('receipt-chain-v9') }
    },
    lineage: {
      release_manifest_ref: `book-release://book-001/${manifest.release_manifest_digest_sha256}`,
      lifecycle_version: 'lifecycle-v12',
      release_candidate_id: 'rc-007'
    },
    created_at: '2026-09-14T12:21:00-04:00'
  };
  const merged = { ...input, ...overrides };
  if (overrides.source_identity) merged.source_identity = { ...input.source_identity, ...overrides.source_identity };
  if (overrides.components) merged.components = { ...input.components, ...overrides.components };
  if (overrides.lineage) merged.lineage = { ...input.lineage, ...overrides.lineage };
  return recovery.createSemanticBackupSet(merged);
}

function makeCoreReceipt(operation, semanticSetDigest, overrides = {}) {
  return {
    owner: 'CORE',
    operation,
    status: 'SUCCEEDED',
    semantic_set_digest_sha256: semanticSetDigest,
    physical_receipt_ref: `core-durability://receipt/${operation.toLowerCase()}-001`,
    physical_manifest_digest_sha256: h(`physical-${operation}-001`),
    completed_at: '2026-09-14T12:22:00-04:00',
    ...overrides
  };
}

function makeRetentionPolicy(overrides = {}) {
  return {
    policy_id: 'book-retention-v1',
    core_physical_policy_ref: 'core-durability://policy/book-default-v1',
    retained_semantic_classes: [
      'semantic_backup_set',
      'release_manifest',
      'preservation_receipts',
      'release_archive_lineage'
    ],
    retrievability_verification_required: true,
    destructive_restore_drill_required: true,
    retain_release_lineage: true,
    ...overrides
  };
}

// P19-01: Book can deterministically freeze release semantics without performing persistence.
const manifest = makeReleaseManifest();
assert.strictEqual(recovery.validateReleaseManifest(manifest), true);
assert.strictEqual(manifest.release_manifest_digest_sha256, makeReleaseManifest().release_manifest_digest_sha256);
const tamperedManifest = clone(manifest);
tamperedManifest.rights_state_digest_sha256 = h('different-rights');
expectCode(() => recovery.validateReleaseManifest(tamperedManifest), 'BACKUP_SET_DIGEST_MISMATCH');

// P19-02: exact semantic backup-set composition is executable and tamper evident.
const backup = makeBackupSet();
assert.strictEqual(recovery.validateBackupSet(backup), true);
assert.strictEqual(backup.semantic_set_digest_sha256, makeBackupSet().semantic_set_digest_sha256);
const missing = clone(backup);
delete missing.components.canon_knowledge;
expectCode(() => recovery.createSemanticBackupSet(missing), 'BACKUP_SET_COMPONENT_MISSING');
const tampered = clone(backup);
tampered.components.accepted_text.digest_sha256 = h('tampered-text');
expectCode(() => recovery.validateBackupSet(tampered), 'BACKUP_SET_DIGEST_MISMATCH');

// Restore invariants are exact, sealed, and compare all Book semantic components.
const invariants = recovery.defineRestoreInvariants(backup);
assert.strictEqual(invariants.semantic_set_digest_sha256, backup.semantic_set_digest_sha256);
const restoreReceipt = makeCoreReceipt('RESTORE', backup.semantic_set_digest_sha256, { destructive_drill: true });
const restorePass = recovery.verifyRestoredState({
  restored_backup_set: backup,
  restore_invariants: invariants,
  core_restore_receipt: restoreReceipt
});
assert.strictEqual(restorePass.verified, true);
assert.strictEqual(restorePass.destructive_drill_verified, true);

// P19-05: Book cannot self-certify destructive restore; CORE proof is mandatory and exact.
expectCode(() => recovery.verifyRestoredState({ restored_backup_set: backup, restore_invariants: invariants }), 'CORE_DURABILITY_RECEIPT_REQUIRED');
expectCode(() => recovery.verifyRestoredState({
  restored_backup_set: backup,
  restore_invariants: invariants,
  core_restore_receipt: makeCoreReceipt('RESTORE', backup.semantic_set_digest_sha256, { destructive_drill: false })
}), 'DESTRUCTIVE_RESTORE_PROOF_REQUIRED');
expectCode(() => recovery.verifyRestoredState({
  restored_backup_set: backup,
  restore_invariants: invariants,
  core_restore_receipt: makeCoreReceipt('RESTORE', h('different-set'), { destructive_drill: true })
}), 'CORE_DURABILITY_SEMANTIC_SET_MISMATCH');
expectCode(() => recovery.verifyRestoredState({
  restored_backup_set: backup,
  restore_invariants: invariants,
  core_restore_receipt: makeCoreReceipt('RESTORE', backup.semantic_set_digest_sha256, { destructive_drill: true, owner: 'BOOK' })
}), 'CORE_DURABILITY_RECEIPT_INVALID');

const changedAcceptedText = makeBackupSet({
  source_identity: {
    book_state_version: 43,
    book_state_digest: h('book-state-43'),
    manuscript_version_id: 'manuscript-v43',
    manuscript_digest_sha256: h('manuscript-v43')
  },
  components: {
    active_book_state: { ref: 'book://book-001/state/43', digest_sha256: h('book-state-43') },
    accepted_text: { ref: 'book://book-001/text/v43', digest_sha256: h('accepted-text-v8') }
  }
});
expectCode(() => recovery.verifyRestoredState({
  restored_backup_set: changedAcceptedText,
  restore_invariants: invariants,
  core_restore_receipt: restoreReceipt
}), 'RESTORE_INVARIANT_MISMATCH');

// P19-06: reconnect handling is deterministic and never silently merges or directly canonicalizes.
const offline = recovery.createOfflineSession(backup, {
  session_id: 'offline-session-001',
  opened_at: '2026-09-14T12:23:00-04:00'
});
const safeReconnect = recovery.verifyOfflineContinuity({
  baseline_backup_set: backup,
  offline_session: offline,
  reconnect_state: {
    book_project_id: 'book-001',
    current_semantic_set_digest_sha256: backup.semantic_set_digest_sha256
  }
});
assert.strictEqual(safeReconnect.disposition, 'SAFE_TO_ADMIT_OFFLINE_DELTA');
assert.strictEqual(safeReconnect.normal_admission_allowed, true);
assert.strictEqual(safeReconnect.auto_apply_allowed, false);
const divergentReconnect = recovery.verifyOfflineContinuity({
  baseline_backup_set: backup,
  offline_session: offline,
  reconnect_state: {
    book_project_id: 'book-001',
    current_semantic_set_digest_sha256: changedAcceptedText.semantic_set_digest_sha256
  }
});
assert.strictEqual(divergentReconnect.disposition, 'RECONCILIATION_REQUIRED');
assert.strictEqual(divergentReconnect.normal_admission_allowed, false);
assert.strictEqual(divergentReconnect.auto_apply_allowed, false);
const wrongSession = clone(offline);
wrongSession.base_semantic_set_digest_sha256 = h('wrong-base');
expectCode(() => recovery.verifyOfflineContinuity({
  baseline_backup_set: backup,
  offline_session: wrongSession,
  reconnect_state: { book_project_id: 'book-001', current_semantic_set_digest_sha256: backup.semantic_set_digest_sha256 }
}), 'OFFLINE_BASE_MISMATCH');

// P19-07: Book defines retention semantics but the physical policy remains a CORE reference.
assert.strictEqual(recovery.validateRetentionPolicy(makeRetentionPolicy()), true);
expectCode(() => recovery.validateRetentionPolicy(makeRetentionPolicy({ core_physical_policy_ref: '' })), 'RETENTION_POLICY_INVALID');
expectCode(() => recovery.validateRetentionPolicy(makeRetentionPolicy({ retained_semantic_classes: ['semantic_backup_set'] })), 'RETENTION_POLICY_INVALID');

// P19-04: preservation admission requires the CORE VERIFY_BACKUP receipt for this exact set.
const coreVerify = makeCoreReceipt('VERIFY_BACKUP', backup.semantic_set_digest_sha256);
const preservation = recovery.createPreservationReceipt({
  backup_set: backup,
  core_backup_verification_receipt: coreVerify,
  retention_policy: makeRetentionPolicy(),
  admitted_at: '2026-09-14T12:24:00-04:00'
});
assert.strictEqual(recovery.validatePreservationReceipt(preservation, backup.semantic_set_digest_sha256), true);
expectCode(() => recovery.createPreservationReceipt({
  backup_set: backup,
  core_backup_verification_receipt: makeCoreReceipt('CREATE_BACKUP', backup.semantic_set_digest_sha256),
  retention_policy: makeRetentionPolicy(),
  admitted_at: '2026-09-14T12:24:00-04:00'
}), 'CORE_DURABILITY_RECEIPT_INVALID');
const tamperedPreservation = clone(preservation);
tamperedPreservation.core_physical_receipt_ref = 'core-durability://receipt/other';
expectCode(() => recovery.validatePreservationReceipt(tamperedPreservation, backup.semantic_set_digest_sha256), 'PRESERVATION_RECEIPT_MISMATCH');

// P19-08: Book closes semantic lineage with explicit continuation/reentry anchors.
const lineage = recovery.closePreservationLineage({
  backup_set: backup,
  preservation_receipt: preservation,
  continuation_anchor: 'book://book-001/continuation/release-rc-007',
  reentry_anchor: 'book://book-001/reentry/new-edition-from-rc-007',
  closed_at: '2026-09-14T12:25:00-04:00'
});
assert.strictEqual(lineage.semantic_set_digest_sha256, backup.semantic_set_digest_sha256);
assert.strictEqual(lineage.release_manifest_ref, backup.lineage.release_manifest_ref);
assert(/^[a-f0-9]{64}$/.test(lineage.lineage_closure_digest_sha256));

// Split ownership sentinel: Book exports semantic validators/builders, not physical durability execution.
for (const forbidden of ['createPhysicalBackup', 'writeBackup', 'restorePhysicalBackup', 'deleteBackup', 'syncTransport']) {
  assert.strictEqual(Object.prototype.hasOwnProperty.call(recovery, forbidden), false, forbidden);
}

console.log('BOOK_RECOVERY_BACKUP_RESTORE_PROFILE_001_TESTS_PASS');
console.log(JSON.stringify({
  result: 'PASS',
  profile_id: recovery.PROFILE_ID,
  semantic_backup_components: recovery.REQUIRED_COMPONENTS.length,
  core_physical_provider_claimed: false,
  destructive_restore_requires_core_receipt: true,
  offline_divergence_requires_reconciliation: true,
  physical_backup_execution_performed: false
}));
