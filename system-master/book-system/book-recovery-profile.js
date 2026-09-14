'use strict';

const crypto = require('crypto');

const PROFILE_ID = 'BOOK-RECOVERY-BACKUP-RESTORE-PROFILE-001';
const SCHEMA_VERSION = 1;
const REQUIRED_COMPONENTS = Object.freeze([
  'active_book_state',
  'canon_knowledge',
  'research_evidence',
  'plan_architecture',
  'accepted_text',
  'release_state',
  'evidence_receipts'
]);
const REQUIRED_RETENTION_CLASSES = Object.freeze([
  'semantic_backup_set',
  'release_manifest',
  'preservation_receipts',
  'release_archive_lineage'
]);
const CORE_OPERATIONS = Object.freeze(['CREATE_BACKUP', 'VERIFY_BACKUP', 'RESTORE', 'VERIFY_RETRIEVABILITY']);

function fail(code, message, details) {
  const err = new Error(message || code);
  err.code = code;
  if (details !== undefined) err.details = details;
  throw err;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
    return out;
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function digestObject(value) {
  return sha256(canonicalJson(value));
}

function assertObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_RECOVERY_INPUT', `${field} must be an object`);
  }
}

function assertString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('INVALID_RECOVERY_INPUT', `${field} must be a non-empty string`);
  }
}

function assertPositiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    fail('INVALID_RECOVERY_INPUT', `${field} must be a positive integer`);
  }
}

function assertSha256(value, field) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('INVALID_SHA256', `${field} must be a lowercase SHA-256 digest`);
  }
}

function validateSourceIdentity(sourceIdentity) {
  assertObject(sourceIdentity, 'source_identity');
  assertPositiveInteger(sourceIdentity.book_state_version, 'source_identity.book_state_version');
  assertSha256(sourceIdentity.book_state_digest, 'source_identity.book_state_digest');
  assertString(sourceIdentity.canonical_manuscript_ref, 'source_identity.canonical_manuscript_ref');
  assertString(sourceIdentity.manuscript_version_id, 'source_identity.manuscript_version_id');
  assertSha256(sourceIdentity.manuscript_digest_sha256, 'source_identity.manuscript_digest_sha256');
  return true;
}

function validateComponent(component, field) {
  assertObject(component, field);
  assertString(component.ref, `${field}.ref`);
  assertSha256(component.digest_sha256, `${field}.digest_sha256`);
  return true;
}

function releaseManifestPayload(input) {
  assertObject(input, 'release_manifest_input');
  const fields = [
    'book_project_id',
    'release_candidate_id',
    'created_at'
  ];
  for (const field of fields) assertString(input[field], field);
  const digestFields = [
    'accepted_text_digest_sha256',
    'metadata_digest_sha256',
    'build_config_digest_sha256',
    'identifier_state_digest_sha256',
    'rights_state_digest_sha256',
    'approvals_digest_sha256',
    'receipt_chain_digest_sha256'
  ];
  for (const field of digestFields) assertSha256(input[field], field);
  return {
    profile_id: PROFILE_ID,
    schema_version: SCHEMA_VERSION,
    book_project_id: input.book_project_id,
    release_candidate_id: input.release_candidate_id,
    accepted_text_digest_sha256: input.accepted_text_digest_sha256,
    metadata_digest_sha256: input.metadata_digest_sha256,
    build_config_digest_sha256: input.build_config_digest_sha256,
    identifier_state_digest_sha256: input.identifier_state_digest_sha256,
    rights_state_digest_sha256: input.rights_state_digest_sha256,
    approvals_digest_sha256: input.approvals_digest_sha256,
    receipt_chain_digest_sha256: input.receipt_chain_digest_sha256,
    created_at: input.created_at
  };
}

function createReleaseManifest(input) {
  const manifest = releaseManifestPayload(input);
  return Object.freeze({
    ...manifest,
    release_manifest_digest_sha256: digestObject(manifest)
  });
}

function validateReleaseManifest(manifest) {
  assertObject(manifest, 'release_manifest');
  const expected = createReleaseManifest(manifest);
  assertSha256(manifest.release_manifest_digest_sha256, 'release_manifest.release_manifest_digest_sha256');
  if (manifest.release_manifest_digest_sha256 !== expected.release_manifest_digest_sha256) {
    fail('BACKUP_SET_DIGEST_MISMATCH', 'release manifest digest does not match its semantic content');
  }
  return true;
}

function semanticBackupPayload(input) {
  assertObject(input, 'semantic_backup_set_input');
  assertString(input.book_project_id, 'book_project_id');
  assertString(input.created_at, 'created_at');
  validateSourceIdentity(input.source_identity);
  assertObject(input.components, 'components');
  for (const name of REQUIRED_COMPONENTS) {
    if (!Object.prototype.hasOwnProperty.call(input.components, name)) {
      fail('BACKUP_SET_COMPONENT_MISSING', `missing semantic backup component: ${name}`);
    }
    validateComponent(input.components[name], `components.${name}`);
  }
  const extras = Object.keys(input.components).filter(name => !REQUIRED_COMPONENTS.includes(name));
  if (extras.length) fail('INVALID_RECOVERY_INPUT', `unexpected semantic backup components: ${extras.join(',')}`);
  assertObject(input.lineage, 'lineage');
  assertString(input.lineage.release_manifest_ref, 'lineage.release_manifest_ref');
  assertString(input.lineage.lifecycle_version, 'lineage.lifecycle_version');
  assertString(input.lineage.release_candidate_id, 'lineage.release_candidate_id');
  return {
    profile_id: PROFILE_ID,
    schema_version: SCHEMA_VERSION,
    book_project_id: input.book_project_id,
    source_identity: clone(input.source_identity),
    components: clone(input.components),
    lineage: {
      release_manifest_ref: input.lineage.release_manifest_ref,
      lifecycle_version: input.lineage.lifecycle_version,
      release_candidate_id: input.lineage.release_candidate_id
    },
    created_at: input.created_at
  };
}

function createSemanticBackupSet(input) {
  const payload = semanticBackupPayload(input);
  return Object.freeze({
    ...payload,
    semantic_set_digest_sha256: digestObject(payload)
  });
}

function validateBackupSet(backupSet) {
  assertObject(backupSet, 'backup_set');
  assertSha256(backupSet.semantic_set_digest_sha256, 'semantic_set_digest_sha256');
  const expected = createSemanticBackupSet(backupSet);
  if (backupSet.semantic_set_digest_sha256 !== expected.semantic_set_digest_sha256) {
    fail('BACKUP_SET_DIGEST_MISMATCH', 'semantic backup set digest does not match its content');
  }
  return true;
}

function defineRestoreInvariants(backupSet) {
  validateBackupSet(backupSet);
  const invariantPayload = {
    profile_id: PROFILE_ID,
    book_project_id: backupSet.book_project_id,
    semantic_set_digest_sha256: backupSet.semantic_set_digest_sha256,
    source_identity: clone(backupSet.source_identity),
    component_bindings: Object.fromEntries(REQUIRED_COMPONENTS.map(name => [name, clone(backupSet.components[name])])),
    lineage: clone(backupSet.lineage)
  };
  return Object.freeze({
    ...invariantPayload,
    invariant_digest_sha256: digestObject(invariantPayload)
  });
}

function validateCoreDurabilityReceipt(receipt, expectedSemanticSetDigest, requiredOperation) {
  if (!receipt) fail('CORE_DURABILITY_RECEIPT_REQUIRED', 'CORE durability receipt is required');
  assertObject(receipt, 'core_receipt');
  if (receipt.owner !== 'CORE') fail('CORE_DURABILITY_RECEIPT_INVALID', 'physical durability receipt owner must be CORE');
  if (!CORE_OPERATIONS.includes(receipt.operation)) fail('CORE_DURABILITY_RECEIPT_INVALID', 'unsupported CORE durability operation');
  if (requiredOperation && receipt.operation !== requiredOperation) {
    fail('CORE_DURABILITY_RECEIPT_INVALID', `expected CORE ${requiredOperation} receipt`);
  }
  if (receipt.status !== 'SUCCEEDED') fail('CORE_DURABILITY_RECEIPT_INVALID', 'CORE durability operation did not succeed');
  assertSha256(receipt.semantic_set_digest_sha256, 'core_receipt.semantic_set_digest_sha256');
  assertString(receipt.physical_receipt_ref, 'core_receipt.physical_receipt_ref');
  assertSha256(receipt.physical_manifest_digest_sha256, 'core_receipt.physical_manifest_digest_sha256');
  assertString(receipt.completed_at, 'core_receipt.completed_at');
  if (expectedSemanticSetDigest && receipt.semantic_set_digest_sha256 !== expectedSemanticSetDigest) {
    fail('CORE_DURABILITY_SEMANTIC_SET_MISMATCH', 'CORE receipt refers to a different semantic backup set');
  }
  return true;
}

function compareRestoreInvariants(restoredSet, invariants) {
  validateBackupSet(restoredSet);
  assertObject(invariants, 'restore_invariants');
  assertSha256(invariants.invariant_digest_sha256, 'restore_invariants.invariant_digest_sha256');
  const invariantPayload = {
    profile_id: invariants.profile_id,
    book_project_id: invariants.book_project_id,
    semantic_set_digest_sha256: invariants.semantic_set_digest_sha256,
    source_identity: clone(invariants.source_identity),
    component_bindings: clone(invariants.component_bindings),
    lineage: clone(invariants.lineage)
  };
  if (digestObject(invariantPayload) !== invariants.invariant_digest_sha256) {
    fail('RESTORE_INVARIANT_MISMATCH', 'restore invariant record was modified');
  }
  const actual = defineRestoreInvariants(restoredSet);
  const expectedComparable = clone(invariantPayload);
  const actualComparable = {
    profile_id: actual.profile_id,
    book_project_id: actual.book_project_id,
    semantic_set_digest_sha256: actual.semantic_set_digest_sha256,
    source_identity: actual.source_identity,
    component_bindings: actual.component_bindings,
    lineage: actual.lineage
  };
  if (canonicalJson(actualComparable) !== canonicalJson(expectedComparable)) {
    fail('RESTORE_INVARIANT_MISMATCH', 'restored Book state does not equal the frozen semantic invariants');
  }
  return true;
}

function verifyRestoredState({ restored_backup_set, restore_invariants, core_restore_receipt, require_destructive_drill = true }) {
  compareRestoreInvariants(restored_backup_set, restore_invariants);
  validateCoreDurabilityReceipt(core_restore_receipt, restore_invariants.semantic_set_digest_sha256, 'RESTORE');
  if (require_destructive_drill && core_restore_receipt.destructive_drill !== true) {
    fail('DESTRUCTIVE_RESTORE_PROOF_REQUIRED', 'destructive restore proof is required');
  }
  return Object.freeze({
    verified: true,
    semantic_set_digest_sha256: restore_invariants.semantic_set_digest_sha256,
    invariant_digest_sha256: restore_invariants.invariant_digest_sha256,
    core_physical_receipt_ref: core_restore_receipt.physical_receipt_ref,
    destructive_drill_verified: core_restore_receipt.destructive_drill === true
  });
}

function createOfflineSession(backupSet, { session_id, opened_at }) {
  validateBackupSet(backupSet);
  assertString(session_id, 'session_id');
  assertString(opened_at, 'opened_at');
  const payload = {
    profile_id: PROFILE_ID,
    session_id,
    book_project_id: backupSet.book_project_id,
    base_semantic_set_digest_sha256: backupSet.semantic_set_digest_sha256,
    base_source_identity: clone(backupSet.source_identity),
    opened_at
  };
  return Object.freeze({ ...payload, offline_session_digest_sha256: digestObject(payload) });
}

function validateOfflineSession(session) {
  assertObject(session, 'offline_session');
  assertSha256(session.offline_session_digest_sha256, 'offline_session.offline_session_digest_sha256');
  const payload = {
    profile_id: session.profile_id,
    session_id: session.session_id,
    book_project_id: session.book_project_id,
    base_semantic_set_digest_sha256: session.base_semantic_set_digest_sha256,
    base_source_identity: clone(session.base_source_identity),
    opened_at: session.opened_at
  };
  assertString(payload.session_id, 'offline_session.session_id');
  assertString(payload.book_project_id, 'offline_session.book_project_id');
  assertSha256(payload.base_semantic_set_digest_sha256, 'offline_session.base_semantic_set_digest_sha256');
  validateSourceIdentity(payload.base_source_identity);
  assertString(payload.opened_at, 'offline_session.opened_at');
  if (digestObject(payload) !== session.offline_session_digest_sha256) {
    fail('OFFLINE_BASE_MISMATCH', 'offline session anchor was modified');
  }
  return true;
}

function verifyOfflineContinuity({ baseline_backup_set, offline_session, reconnect_state }) {
  validateBackupSet(baseline_backup_set);
  validateOfflineSession(offline_session);
  assertObject(reconnect_state, 'reconnect_state');
  assertString(reconnect_state.book_project_id, 'reconnect_state.book_project_id');
  assertSha256(reconnect_state.current_semantic_set_digest_sha256, 'reconnect_state.current_semantic_set_digest_sha256');
  if (baseline_backup_set.book_project_id !== offline_session.book_project_id || baseline_backup_set.book_project_id !== reconnect_state.book_project_id) {
    fail('OFFLINE_BASE_MISMATCH', 'offline continuity project identity mismatch');
  }
  if (offline_session.base_semantic_set_digest_sha256 !== baseline_backup_set.semantic_set_digest_sha256 || canonicalJson(offline_session.base_source_identity) !== canonicalJson(baseline_backup_set.source_identity)) {
    fail('OFFLINE_BASE_MISMATCH', 'offline session does not anchor to the supplied baseline backup set');
  }
  const sameBase = reconnect_state.current_semantic_set_digest_sha256 === baseline_backup_set.semantic_set_digest_sha256;
  const disposition = sameBase ? 'SAFE_TO_ADMIT_OFFLINE_DELTA' : 'RECONCILIATION_REQUIRED';
  return Object.freeze({
    disposition,
    auto_apply_allowed: false,
    normal_admission_allowed: sameBase,
    baseline_semantic_set_digest_sha256: baseline_backup_set.semantic_set_digest_sha256,
    reconnect_semantic_set_digest_sha256: reconnect_state.current_semantic_set_digest_sha256,
    reconciliation_key_sha256: sha256(`${baseline_backup_set.book_project_id}:${offline_session.session_id}:${baseline_backup_set.semantic_set_digest_sha256}:${reconnect_state.current_semantic_set_digest_sha256}`)
  });
}

function validateRetentionPolicy(policy) {
  try {
    assertObject(policy, 'retention_policy');
    assertString(policy.policy_id, 'retention_policy.policy_id');
    assertString(policy.core_physical_policy_ref, 'retention_policy.core_physical_policy_ref');
    if (!Array.isArray(policy.retained_semantic_classes)) throw new Error('retained_semantic_classes');
    const retained = new Set(policy.retained_semantic_classes);
    for (const name of REQUIRED_RETENTION_CLASSES) if (!retained.has(name)) throw new Error(`missing ${name}`);
    if (policy.retrievability_verification_required !== true) throw new Error('retrievability verification must be required');
    if (policy.destructive_restore_drill_required !== true) throw new Error('destructive restore drill must be required');
    if (policy.retain_release_lineage !== true) throw new Error('release lineage must be retained');
  } catch (err) {
    if (err && err.code) throw err;
    fail('RETENTION_POLICY_INVALID', err.message);
  }
  return true;
}

function createPreservationReceipt({ backup_set, core_backup_verification_receipt, retention_policy, admitted_at }) {
  validateBackupSet(backup_set);
  validateCoreDurabilityReceipt(core_backup_verification_receipt, backup_set.semantic_set_digest_sha256, 'VERIFY_BACKUP');
  validateRetentionPolicy(retention_policy);
  assertString(admitted_at, 'admitted_at');
  const payload = {
    profile_id: PROFILE_ID,
    book_project_id: backup_set.book_project_id,
    semantic_set_digest_sha256: backup_set.semantic_set_digest_sha256,
    core_physical_receipt_ref: core_backup_verification_receipt.physical_receipt_ref,
    core_physical_manifest_digest_sha256: core_backup_verification_receipt.physical_manifest_digest_sha256,
    retention_policy_id: retention_policy.policy_id,
    core_physical_policy_ref: retention_policy.core_physical_policy_ref,
    admitted_at
  };
  return Object.freeze({
    ...payload,
    preservation_receipt_ref: `book-preservation://${backup_set.book_project_id}/${digestObject(payload)}`,
    preservation_receipt_digest_sha256: digestObject(payload)
  });
}

function validatePreservationReceipt(receipt, expectedSemanticSetDigest) {
  assertObject(receipt, 'preservation_receipt');
  assertString(receipt.book_project_id, 'preservation_receipt.book_project_id');
  assertSha256(receipt.semantic_set_digest_sha256, 'preservation_receipt.semantic_set_digest_sha256');
  assertString(receipt.core_physical_receipt_ref, 'preservation_receipt.core_physical_receipt_ref');
  assertSha256(receipt.core_physical_manifest_digest_sha256, 'preservation_receipt.core_physical_manifest_digest_sha256');
  assertString(receipt.retention_policy_id, 'preservation_receipt.retention_policy_id');
  assertString(receipt.core_physical_policy_ref, 'preservation_receipt.core_physical_policy_ref');
  assertString(receipt.admitted_at, 'preservation_receipt.admitted_at');
  assertString(receipt.preservation_receipt_ref, 'preservation_receipt.preservation_receipt_ref');
  assertSha256(receipt.preservation_receipt_digest_sha256, 'preservation_receipt.preservation_receipt_digest_sha256');
  const payload = {
    profile_id: receipt.profile_id,
    book_project_id: receipt.book_project_id,
    semantic_set_digest_sha256: receipt.semantic_set_digest_sha256,
    core_physical_receipt_ref: receipt.core_physical_receipt_ref,
    core_physical_manifest_digest_sha256: receipt.core_physical_manifest_digest_sha256,
    retention_policy_id: receipt.retention_policy_id,
    core_physical_policy_ref: receipt.core_physical_policy_ref,
    admitted_at: receipt.admitted_at
  };
  const digest = digestObject(payload);
  if (receipt.preservation_receipt_digest_sha256 !== digest || receipt.preservation_receipt_ref !== `book-preservation://${receipt.book_project_id}/${digest}`) {
    fail('PRESERVATION_RECEIPT_MISMATCH', 'preservation receipt content does not match its sealed identity');
  }
  if (expectedSemanticSetDigest && receipt.semantic_set_digest_sha256 !== expectedSemanticSetDigest) {
    fail('PRESERVATION_RECEIPT_MISMATCH', 'preservation receipt refers to a different semantic backup set');
  }
  return true;
}

function closePreservationLineage({ backup_set, preservation_receipt, continuation_anchor, reentry_anchor, closed_at }) {
  validateBackupSet(backup_set);
  validatePreservationReceipt(preservation_receipt, backup_set.semantic_set_digest_sha256);
  assertString(continuation_anchor, 'continuation_anchor');
  assertString(reentry_anchor, 'reentry_anchor');
  assertString(closed_at, 'closed_at');
  const payload = {
    profile_id: PROFILE_ID,
    book_project_id: backup_set.book_project_id,
    semantic_set_digest_sha256: backup_set.semantic_set_digest_sha256,
    preservation_receipt_ref: preservation_receipt.preservation_receipt_ref,
    release_manifest_ref: backup_set.lineage.release_manifest_ref,
    continuation_anchor,
    reentry_anchor,
    closed_at
  };
  return Object.freeze({ ...payload, lineage_closure_digest_sha256: digestObject(payload) });
}

module.exports = Object.freeze({
  PROFILE_ID,
  SCHEMA_VERSION,
  REQUIRED_COMPONENTS,
  REQUIRED_RETENTION_CLASSES,
  CORE_OPERATIONS,
  sha256,
  digestObject,
  createReleaseManifest,
  validateReleaseManifest,
  createSemanticBackupSet,
  validateBackupSet,
  defineRestoreInvariants,
  validateCoreDurabilityReceipt,
  verifyRestoredState,
  createOfflineSession,
  verifyOfflineContinuity,
  validateRetentionPolicy,
  createPreservationReceipt,
  validatePreservationReceipt,
  closePreservationLineage
});
