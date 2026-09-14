'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROFILE_PATH = path.join(__dirname, '../../qualification/book-system/recovery/BOOK-SEMANTIC-RECOVERY-PROFILE-001.json');
const MANIFEST_SCHEMA_VERSION = 1;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_REF = /^[A-Za-z0-9._:/#@-]{1,320}$/;
const OWNER = /^SYSTEM_MASTER\/[A-Z0-9_]+$/;
const CURRENTNESS = new Set(['CURRENT', 'HISTORICAL_PROVENANCE']);
const RESTORE_ROLES = new Set(['PRESERVE_PHYSICAL_SET', 'RESTORE_PHYSICAL_SET']);

class BookSemanticRecoveryError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookSemanticRecoveryError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookSemanticRecoveryError(code, detail); }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0; }
function stableNormalize(value) {
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (isObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stableNormalize(value[key]);
    return out;
  }
  return value;
}
function stableStringify(value) { return JSON.stringify(stableNormalize(value)); }
function sha256(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex'); }
function digestWithout(value, field) {
  const copy = clone(value);
  delete copy[field];
  return sha256(stableStringify(copy));
}
function requireRef(value, label) {
  if (!nonEmpty(value) || !SAFE_REF.test(value)) fail('INVALID_REFERENCE', `${label}:${String(value)}`);
}
function requireDigest(value, label) {
  if (!SHA256.test(String(value || ''))) fail('INVALID_SHA256', label);
}
function requireOwner(value, label) {
  if (!nonEmpty(value) || !OWNER.test(value)) fail('INVALID_OWNER_PATH', `${label}:${String(value)}`);
}
function unique(values, label) {
  if (!Array.isArray(values)) fail('ARRAY_REQUIRED', label);
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail('DUPLICATE_VALUE', `${label}:${value}`);
    seen.add(value);
  }
}
function sameSubject(a, b) {
  return Boolean(a && b && a.canonical_digest === b.canonical_digest && a.manuscript_digest === b.manuscript_digest);
}

function loadProfile() {
  return JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
}

function validateProfile(profile = loadProfile()) {
  if (!isObject(profile)) fail('RECOVERY_PROFILE_REQUIRED');
  if (profile.profile_id !== 'BOOK-SEMANTIC-RECOVERY-PROFILE-001') fail('RECOVERY_PROFILE_ID_MISMATCH');
  if (profile.objective_id !== 'BOOK-ENG-009-SEMANTIC-RECOVERY-PROFILE-001') fail('RECOVERY_OBJECTIVE_MISMATCH');
  if (profile.owner_path !== 'SYSTEM_MASTER/BOOK' || profile.component_id !== 'BOOK-COMP-12') fail('RECOVERY_OWNER_MISMATCH');
  if (profile.lifecycle_phase !== 'PRESERVATION' || profile.completion_gate !== 'PRESERVATION_COMPLETE') fail('RECOVERY_GATE_MISMATCH');
  if (profile.core_p03_dependency?.provider_system !== 'CORE' || profile.core_p03_dependency?.provider_domain !== 'P03') fail('CORE_P03_BOUNDARY_MISMATCH');
  if (profile.core_p03_dependency?.registration_state !== 'REQUIRED_PROVIDER_REGISTRATION_OPEN') fail('CORE_PROVIDER_REGISTRATION_STATE_MISMATCH');
  if (profile.core_p03_dependency?.no_operation_id_invented_by_book !== true) fail('BOOK_MUST_NOT_INVENT_CORE_OPERATION');
  return true;
}

function validateSubject(subject) {
  if (!isObject(subject)) fail('SUBJECT_REQUIRED');
  for (const field of ['canonical_state_ref', 'canonical_version', 'canonical_digest', 'manuscript_ref', 'manuscript_digest']) {
    if (!Object.prototype.hasOwnProperty.call(subject, field)) fail('SUBJECT_FIELD_MISSING', field);
  }
  requireRef(subject.canonical_state_ref, 'canonical_state_ref');
  if (!(Number.isInteger(subject.canonical_version) && subject.canonical_version >= 1) && !nonEmpty(subject.canonical_version)) fail('CANONICAL_VERSION_INVALID');
  requireDigest(subject.canonical_digest, 'canonical_digest');
  requireRef(subject.manuscript_ref, 'manuscript_ref');
  requireDigest(subject.manuscript_digest, 'manuscript_digest');
  if (subject.release_ref !== undefined && subject.release_ref !== null) {
    requireRef(subject.release_ref, 'release_ref');
    requireDigest(subject.release_digest, 'release_digest');
  }
}

function validateScope(scope, profile) {
  if (!isObject(scope)) fail('RECOVERY_SCOPE_REQUIRED');
  for (const flag of profile.scope_flags || []) {
    if (typeof scope[flag] !== 'boolean') fail('RECOVERY_SCOPE_BOOLEAN_REQUIRED', flag);
  }
}

function validateDependencies(dependencies, scope, profile) {
  if (!Array.isArray(dependencies)) fail('DEPENDENCY_ARRAY_REQUIRED');
  const allowed = new Set(profile.semantic_backup_set.allowed_dependency_classes || []);
  const ids = new Set();
  const refs = new Set();
  for (const dep of dependencies) {
    if (!isObject(dep)) fail('DEPENDENCY_OBJECT_REQUIRED');
    for (const field of ['dependency_id', 'class', 'owner_path', 'ref', 'digest', 'currentness', 'required']) {
      if (!Object.prototype.hasOwnProperty.call(dep, field)) fail('DEPENDENCY_FIELD_MISSING', field);
    }
    requireRef(dep.dependency_id, 'dependency_id');
    if (!allowed.has(dep.class)) fail('DEPENDENCY_CLASS_INVALID', dep.class);
    requireOwner(dep.owner_path, 'dependency_owner_path');
    requireRef(dep.ref, 'dependency_ref');
    requireDigest(dep.digest, `dependency_digest:${dep.dependency_id}`);
    if (!CURRENTNESS.has(dep.currentness)) fail('DEPENDENCY_CURRENTNESS_INVALID', dep.dependency_id);
    if (typeof dep.required !== 'boolean') fail('DEPENDENCY_REQUIRED_BOOLEAN', dep.dependency_id);
    if (dep.owner_path === 'SYSTEM_MASTER/PROSE' && dep.currentness !== 'HISTORICAL_PROVENANCE') fail('ACTIVE_PROSE_DEPENDENCY_FORBIDDEN', dep.dependency_id);
    if (ids.has(dep.dependency_id)) fail('DUPLICATE_DEPENDENCY_ID', dep.dependency_id);
    if (refs.has(dep.ref)) fail('DUPLICATE_DEPENDENCY_REF', dep.ref);
    ids.add(dep.dependency_id);
    refs.add(dep.ref);
  }
  const currentClasses = new Set(dependencies.filter(d => d.currentness === 'CURRENT' && d.required).map(d => d.class));
  for (const requiredClass of profile.semantic_backup_set.required_dependency_classes || []) {
    if (!currentClasses.has(requiredClass)) fail('REQUIRED_DEPENDENCY_CLASS_MISSING', requiredClass);
  }
  for (const [flag, classes] of Object.entries(profile.semantic_backup_set.conditional_dependency_classes || {})) {
    if (!scope[flag]) continue;
    for (const requiredClass of classes) if (!currentClasses.has(requiredClass)) fail('CONDITIONAL_DEPENDENCY_CLASS_MISSING', `${flag}:${requiredClass}`);
  }
}

function validateVersionedRefs(entries, disposition, label) {
  if (!['PRESENT', 'NOT_APPLICABLE'].includes(disposition)) fail('REBUILD_DISPOSITION_INVALID', label);
  if (!Array.isArray(entries)) fail('REBUILD_ENTRY_ARRAY_REQUIRED', label);
  if (disposition === 'PRESENT' && entries.length === 0) fail('REBUILD_ENTRY_REQUIRED', label);
  if (disposition === 'NOT_APPLICABLE' && entries.length !== 0) fail('REBUILD_NOT_APPLICABLE_MUST_BE_EMPTY', label);
  const refs = new Set();
  for (const entry of entries) {
    if (!isObject(entry)) fail('REBUILD_ENTRY_OBJECT_REQUIRED', label);
    requireRef(entry.ref, `${label}.ref`);
    if (!nonEmpty(String(entry.version ?? ''))) fail('REBUILD_VERSION_REQUIRED', entry.ref);
    requireDigest(entry.digest, `${label}.digest:${entry.ref}`);
    if (refs.has(entry.ref)) fail('DUPLICATE_REBUILD_REF', entry.ref);
    refs.add(entry.ref);
  }
}

function validateRebuildProfile(rebuild) {
  if (!isObject(rebuild)) fail('REBUILD_PROFILE_REQUIRED');
  validateVersionedRefs(rebuild.recipes, rebuild.recipes_disposition, 'recipes');
  validateVersionedRefs(rebuild.indexes, rebuild.indexes_disposition, 'indexes');
}

function validateLineage(lineage) {
  if (!isObject(lineage)) fail('LINEAGE_REQUIRED');
  requireRef(lineage.edition_id, 'edition_id');
  if (!Array.isArray(lineage.parent_version_refs)) fail('PARENT_VERSION_REFS_REQUIRED');
  unique(lineage.parent_version_refs, 'parent_version_refs');
  for (const ref of lineage.parent_version_refs) requireRef(ref, 'parent_version_ref');
  if (lineage.release_id !== null && lineage.release_id !== undefined) requireRef(lineage.release_id, 'release_id');
}

function validatePolicy(policy, profile) {
  if (!isObject(policy)) fail('PRESERVATION_POLICY_REQUIRED');
  if (!(profile.retention_classes || []).includes(policy.retention_class)) fail('RETENTION_CLASS_INVALID', String(policy.retention_class));
  if (!(profile.offline_continuity_requirements || []).includes(policy.offline_continuity_requirement)) fail('OFFLINE_CONTINUITY_REQUIREMENT_INVALID', String(policy.offline_continuity_requirement));
}

function buildSemanticBackupManifest(input, profile = loadProfile()) {
  validateProfile(profile);
  if (!isObject(input)) fail('MANIFEST_INPUT_REQUIRED');
  requireRef(input.manifest_id, 'manifest_id');
  requireRef(input.book_project_id, 'book_project_id');
  if (!nonEmpty(input.created_at)) fail('MANIFEST_CREATED_AT_REQUIRED');
  validateSubject(input.subject);
  validateScope(input.scope, profile);
  validateDependencies(input.dependencies, input.scope, profile);
  validateRebuildProfile(input.rebuild_profile);
  validateLineage(input.lineage);
  validatePolicy(input.policy, profile);

  const dependencies = clone(input.dependencies).sort((a, b) => a.dependency_id.localeCompare(b.dependency_id));
  const rebuild = clone(input.rebuild_profile);
  rebuild.recipes.sort((a, b) => a.ref.localeCompare(b.ref));
  rebuild.indexes.sort((a, b) => a.ref.localeCompare(b.ref));
  const lineage = clone(input.lineage);
  lineage.parent_version_refs.sort();

  const manifest = {
    manifest_schema_version: MANIFEST_SCHEMA_VERSION,
    manifest_id: input.manifest_id,
    recovery_profile_id: profile.profile_id,
    objective_id: profile.objective_id,
    owner_path: 'SYSTEM_MASTER/BOOK',
    component_id: 'BOOK-COMP-12',
    book_project_id: input.book_project_id,
    subject: clone(input.subject),
    scope: clone(input.scope),
    dependencies,
    rebuild_profile: rebuild,
    lineage,
    policy: clone(input.policy),
    created_at: input.created_at,
    physical_payload_included: false,
    canonical_effect_allowed: false,
    manifest_digest: ''
  };
  manifest.manifest_digest = digestWithout(manifest, 'manifest_digest');
  validateSemanticBackupManifest(manifest, profile);
  return manifest;
}

function validateSemanticBackupManifest(manifest, profile = loadProfile()) {
  validateProfile(profile);
  if (!isObject(manifest)) fail('SEMANTIC_BACKUP_MANIFEST_REQUIRED');
  if (manifest.manifest_schema_version !== MANIFEST_SCHEMA_VERSION) fail('MANIFEST_SCHEMA_VERSION_MISMATCH');
  if (manifest.recovery_profile_id !== profile.profile_id || manifest.objective_id !== profile.objective_id) fail('MANIFEST_PROFILE_BINDING_MISMATCH');
  if (manifest.owner_path !== 'SYSTEM_MASTER/BOOK' || manifest.component_id !== 'BOOK-COMP-12') fail('MANIFEST_OWNER_MISMATCH');
  requireRef(manifest.manifest_id, 'manifest_id');
  requireRef(manifest.book_project_id, 'book_project_id');
  if (!nonEmpty(manifest.created_at)) fail('MANIFEST_CREATED_AT_REQUIRED');
  validateSubject(manifest.subject);
  validateScope(manifest.scope, profile);
  validateDependencies(manifest.dependencies, manifest.scope, profile);
  validateRebuildProfile(manifest.rebuild_profile);
  validateLineage(manifest.lineage);
  validatePolicy(manifest.policy, profile);
  if (manifest.physical_payload_included !== false) fail('BOOK_PHYSICAL_PAYLOAD_FORBIDDEN');
  if (manifest.canonical_effect_allowed !== false) fail('BOOK_RECOVERY_CANONICAL_EFFECT_FORBIDDEN');
  requireDigest(manifest.manifest_digest, 'manifest_digest');
  if (digestWithout(manifest, 'manifest_digest') !== manifest.manifest_digest) fail('MANIFEST_DIGEST_MISMATCH');
  return true;
}

function verifyDependencyClosure(manifest, profile = loadProfile()) {
  validateSemanticBackupManifest(manifest, profile);
  return {
    status: 'PASS',
    manifest_id: manifest.manifest_id,
    manifest_digest: manifest.manifest_digest,
    required_dependency_count: manifest.dependencies.filter(d => d.required).length,
    current_required_dependency_count: manifest.dependencies.filter(d => d.required && d.currentness === 'CURRENT').length,
    rebuild_recipes_disposition: manifest.rebuild_profile.recipes_disposition,
    rebuild_indexes_disposition: manifest.rebuild_profile.indexes_disposition,
    semantic_backup_set_complete: true,
    canonical_effect_allowed: false
  };
}

function validateCoreProviderRegistration(registration, semanticRole) {
  if (!isObject(registration)) fail('CORE_DURABILITY_INTERFACE_UNAVAILABLE');
  if (!RESTORE_ROLES.has(semanticRole)) fail('CORE_SEMANTIC_ROLE_INVALID', String(semanticRole));
  if (registration.registration_state !== 'REGISTERED_ACTIVE') fail('CORE_DURABILITY_INTERFACE_UNAVAILABLE', 'registration_not_active');
  if (registration.provider_system !== 'CORE' || registration.owner_path !== 'SYSTEM_MASTER/CORE') fail('CORE_PROVIDER_OWNER_MISMATCH');
  if (registration.domain !== 'P03' || registration.kind !== 'COMMAND') fail('CORE_PROVIDER_DOMAIN_KIND_MISMATCH');
  if (registration.semantic_role !== semanticRole) fail('CORE_PROVIDER_SEMANTIC_ROLE_MISMATCH');
  if (!/^CORE\.P03\.COMMAND\.[A-Z][A-Z0-9_]*$/.test(String(registration.operation_id || ''))) fail('CORE_PROVIDER_OPERATION_ID_INVALID');
  if (registration.canonical_write_authority !== false || registration.direct_book_state_write !== false) fail('CORE_PROVIDER_BOOK_WRITE_AUTHORITY_FORBIDDEN');
  return true;
}

function requestIdempotencyKey(operationId, manifest) {
  return sha256(stableStringify({
    operation_id: operationId,
    semantic_manifest_digest: manifest.manifest_digest,
    canonical_digest: manifest.subject.canonical_digest,
    retention_class: manifest.policy.retention_class
  }));
}

function buildCoreDurabilityRequest({ manifest, provider_registration, request_id, requested_at }, profile = loadProfile()) {
  verifyDependencyClosure(manifest, profile);
  validateCoreProviderRegistration(provider_registration, 'PRESERVE_PHYSICAL_SET');
  requireRef(request_id, 'request_id');
  if (!nonEmpty(requested_at)) fail('REQUESTED_AT_REQUIRED');
  return {
    request_schema_version: 1,
    request_id,
    caller_system: 'BOOK',
    caller_owner_path: 'SYSTEM_MASTER/BOOK',
    provider_system: 'CORE',
    operation_id: provider_registration.operation_id,
    semantic_role: 'PRESERVE_PHYSICAL_SET',
    book_project_id: manifest.book_project_id,
    subject: clone(manifest.subject),
    semantic_manifest_id: manifest.manifest_id,
    semantic_manifest_digest: manifest.manifest_digest,
    retention_class: manifest.policy.retention_class,
    offline_continuity_requirement: manifest.policy.offline_continuity_requirement,
    idempotency_key: requestIdempotencyKey(provider_registration.operation_id, manifest),
    requested_at,
    canonical_effect_allowed: false,
    direct_database_access: false,
    physical_payload_included: false
  };
}

function acceptCoreDurabilityReceipt({ manifest, request, provider_receipt }, profile = loadProfile()) {
  validateSemanticBackupManifest(manifest, profile);
  if (!isObject(request) || !isObject(provider_receipt)) fail('DURABILITY_REQUEST_RECEIPT_REQUIRED');
  if (request.semantic_manifest_digest !== manifest.manifest_digest || request.subject.canonical_digest !== manifest.subject.canonical_digest) fail('DURABILITY_REQUEST_MANIFEST_MISMATCH');
  if (request.canonical_effect_allowed !== false || request.direct_database_access !== false) fail('DURABILITY_REQUEST_AUTHORITY_VIOLATION');
  if (provider_receipt.provider_system !== 'CORE' || provider_receipt.owner_path !== 'SYSTEM_MASTER/CORE') fail('DURABILITY_RECEIPT_PROVIDER_MISMATCH');
  if (provider_receipt.operation_id !== request.operation_id || provider_receipt.request_id !== request.request_id) fail('DURABILITY_RECEIPT_REQUEST_MISMATCH');
  if (provider_receipt.status !== 'DURABLE') fail('DURABILITY_RECEIPT_NOT_DURABLE');
  if (provider_receipt.semantic_manifest_digest !== manifest.manifest_digest || provider_receipt.canonical_digest !== manifest.subject.canonical_digest) fail('DURABILITY_RECEIPT_SUBJECT_MISMATCH');
  requireRef(provider_receipt.receipt_id, 'core_durability_receipt_id');
  requireDigest(provider_receipt.physical_manifest_digest, 'physical_manifest_digest');
  requireRef(provider_receipt.restore_handle, 'restore_handle');
  const admission = {
    admission_schema_version: 1,
    status: 'ACCEPTED',
    book_project_id: manifest.book_project_id,
    semantic_manifest_digest: manifest.manifest_digest,
    canonical_digest: manifest.subject.canonical_digest,
    provider_receipt_id: provider_receipt.receipt_id,
    provider_operation_id: provider_receipt.operation_id,
    physical_manifest_digest: provider_receipt.physical_manifest_digest,
    restore_handle: provider_receipt.restore_handle,
    canonical_effect_allowed: false,
    admission_digest: ''
  };
  admission.admission_digest = digestWithout(admission, 'admission_digest');
  return admission;
}

function buildCoreRestoreRequest({ manifest, durability_admission, provider_registration, request_id, requested_at }, profile = loadProfile()) {
  validateSemanticBackupManifest(manifest, profile);
  validateCoreProviderRegistration(provider_registration, 'RESTORE_PHYSICAL_SET');
  if (!isObject(durability_admission) || durability_admission.status !== 'ACCEPTED') fail('DURABILITY_ADMISSION_REQUIRED');
  if (durability_admission.semantic_manifest_digest !== manifest.manifest_digest || durability_admission.canonical_digest !== manifest.subject.canonical_digest) fail('DURABILITY_ADMISSION_SUBJECT_MISMATCH');
  requireDigest(durability_admission.admission_digest, 'durability_admission_digest');
  requireRef(request_id, 'restore_request_id');
  if (!nonEmpty(requested_at)) fail('REQUESTED_AT_REQUIRED');
  return {
    request_schema_version: 1,
    request_id,
    caller_system: 'BOOK',
    provider_system: 'CORE',
    operation_id: provider_registration.operation_id,
    semantic_role: 'RESTORE_PHYSICAL_SET',
    semantic_manifest_digest: manifest.manifest_digest,
    canonical_digest: manifest.subject.canonical_digest,
    physical_manifest_digest: durability_admission.physical_manifest_digest,
    restore_handle: durability_admission.restore_handle,
    destructive_test_environment_required: true,
    idempotency_key: sha256(stableStringify({ operation_id: provider_registration.operation_id, manifest_digest: manifest.manifest_digest, restore_handle: durability_admission.restore_handle })),
    requested_at,
    canonical_effect_allowed: false,
    direct_database_access: false
  };
}

function verifyRestore({ manifest, durability_admission, restore_request, core_restore_receipt, current_canonical_subject }, profile = loadProfile()) {
  validateSemanticBackupManifest(manifest, profile);
  validateSubject(current_canonical_subject);
  if (!isObject(durability_admission) || durability_admission.status !== 'ACCEPTED') fail('DURABILITY_ADMISSION_REQUIRED');
  if (!isObject(restore_request) || !isObject(core_restore_receipt)) fail('RESTORE_REQUEST_RECEIPT_REQUIRED');
  if (durability_admission.semantic_manifest_digest !== manifest.manifest_digest) fail('DURABILITY_ADMISSION_SUBJECT_MISMATCH');
  if (restore_request.semantic_manifest_digest !== manifest.manifest_digest || restore_request.physical_manifest_digest !== durability_admission.physical_manifest_digest) fail('RESTORE_REQUEST_SUBJECT_MISMATCH');
  if (restore_request.destructive_test_environment_required !== true) fail('DESTRUCTIVE_RESTORE_NOT_REQUIRED_BY_REQUEST');
  if (core_restore_receipt.provider_system !== 'CORE' || core_restore_receipt.owner_path !== 'SYSTEM_MASTER/CORE') fail('RESTORE_RECEIPT_PROVIDER_MISMATCH');
  if (core_restore_receipt.operation_id !== restore_request.operation_id || core_restore_receipt.request_id !== restore_request.request_id) fail('RESTORE_RECEIPT_REQUEST_MISMATCH');
  if (core_restore_receipt.status !== 'RESTORED' || core_restore_receipt.destructive_restore_executed !== true) fail('DESTRUCTIVE_RESTORE_PROOF_REQUIRED');
  if (core_restore_receipt.semantic_manifest_digest !== manifest.manifest_digest || core_restore_receipt.physical_manifest_digest !== durability_admission.physical_manifest_digest) fail('RESTORE_RECEIPT_MANIFEST_MISMATCH');
  if (core_restore_receipt.restored_canonical_digest !== manifest.subject.canonical_digest || core_restore_receipt.restored_manuscript_digest !== manifest.subject.manuscript_digest) fail('RESTORED_SUBJECT_DIGEST_MISMATCH');
  if (core_restore_receipt.reproduced_final_expression_digest !== manifest.subject.manuscript_digest) fail('FINAL_EXPRESSION_REPRODUCTION_MISMATCH');
  if (!isObject(core_restore_receipt.restored_dependency_digests)) fail('RESTORED_DEPENDENCY_DIGESTS_REQUIRED');
  for (const dep of manifest.dependencies) {
    if (core_restore_receipt.restored_dependency_digests[dep.ref] !== dep.digest) fail('RESTORED_DEPENDENCY_DIGEST_MISMATCH', dep.ref);
  }
  const exactCurrent = sameSubject(manifest.subject, current_canonical_subject);
  const proof = {
    proof_schema_version: 1,
    status: 'PASS',
    classification: exactCurrent ? 'CURRENT_SUBJECT_VERIFIED' : 'HISTORICAL_SNAPSHOT_VERIFIED',
    semantic_manifest_digest: manifest.manifest_digest,
    canonical_digest: manifest.subject.canonical_digest,
    manuscript_digest: manifest.subject.manuscript_digest,
    current_subject_exact: exactCurrent,
    destructive_restore_verified: true,
    dependency_closure_reproduced: true,
    final_expression_reproduced: true,
    overwrite_current_allowed: false,
    canonical_effect_allowed: false,
    restore_receipt_id: core_restore_receipt.receipt_id,
    proof_digest: ''
  };
  requireRef(proof.restore_receipt_id, 'restore_receipt_id');
  proof.proof_digest = digestWithout(proof, 'proof_digest');
  return proof;
}

function evaluatePreservationGate({ manifest, dependency_closure, durability_admission, restore_proof, current_canonical_subject }, profile = loadProfile()) {
  validateSemanticBackupManifest(manifest, profile);
  validateSubject(current_canonical_subject);
  if (!isObject(dependency_closure) || dependency_closure.status !== 'PASS' || dependency_closure.manifest_digest !== manifest.manifest_digest || dependency_closure.semantic_backup_set_complete !== true) fail('SEMANTIC_BACKUP_SET_INCOMPLETE');
  if (!isObject(durability_admission) || durability_admission.status !== 'ACCEPTED' || durability_admission.semantic_manifest_digest !== manifest.manifest_digest) fail('DURABILITY_HANDOFF_NOT_RECEIPTED');
  if (!isObject(restore_proof) || restore_proof.status !== 'PASS' || restore_proof.semantic_manifest_digest !== manifest.manifest_digest) fail('RESTORE_ACCEPTANCE_NOT_PASSED');
  if (!sameSubject(manifest.subject, current_canonical_subject) || restore_proof.current_subject_exact !== true || restore_proof.classification !== 'CURRENT_SUBJECT_VERIFIED') fail('RESTORE_PROOF_NOT_EXACT_CURRENT');
  const gate = {
    gate_id: 'PRESERVATION_COMPLETE',
    legacy_gate_id: 'G19',
    status: 'PASS',
    subject_canonical_digest: manifest.subject.canonical_digest,
    semantic_manifest_digest: manifest.manifest_digest,
    semantic_backup_set_complete: true,
    durability_handoff_receipted: true,
    restore_acceptance_passed: true,
    preservation_receipt_required: true,
    canonical_effect_allowed: false,
    gate_digest: ''
  };
  gate.gate_digest = digestWithout(gate, 'gate_digest');
  return gate;
}

function recordPreservationReceipt({ manifest, gate_result, durability_admission, restore_proof, receipt_id, recorded_at }, profile = loadProfile()) {
  validateSemanticBackupManifest(manifest, profile);
  if (!isObject(gate_result) || gate_result.status !== 'PASS' || gate_result.gate_id !== 'PRESERVATION_COMPLETE' || gate_result.semantic_manifest_digest !== manifest.manifest_digest) fail('PRESERVATION_GATE_PASS_REQUIRED');
  if (!isObject(durability_admission) || !isObject(restore_proof)) fail('PRESERVATION_EVIDENCE_REQUIRED');
  requireRef(receipt_id, 'preservation_receipt_id');
  if (!nonEmpty(recorded_at)) fail('PRESERVATION_RECORDED_AT_REQUIRED');
  const receipt = {
    receipt_schema_version: 1,
    receipt_id,
    owner_path: 'SYSTEM_MASTER/BOOK',
    component_id: 'BOOK-COMP-12',
    phase_id: 'PRESERVATION',
    gate_id: 'PRESERVATION_COMPLETE',
    legacy_gate_id: 'G19',
    book_project_id: manifest.book_project_id,
    subject: clone(manifest.subject),
    semantic_manifest_id: manifest.manifest_id,
    semantic_manifest_digest: manifest.manifest_digest,
    core_durability_admission_digest: durability_admission.admission_digest,
    restore_proof_digest: restore_proof.proof_digest,
    status: 'PASS',
    recorded_at,
    immutable: true,
    canonical_effect_allowed: false,
    receipt_digest: ''
  };
  receipt.receipt_digest = digestWithout(receipt, 'receipt_digest');
  return receipt;
}

function validatePreservationReceipt(receipt) {
  if (!isObject(receipt) || receipt.owner_path !== 'SYSTEM_MASTER/BOOK' || receipt.component_id !== 'BOOK-COMP-12') fail('PRESERVATION_RECEIPT_INVALID');
  if (receipt.status !== 'PASS' || receipt.gate_id !== 'PRESERVATION_COMPLETE' || receipt.immutable !== true || receipt.canonical_effect_allowed !== false) fail('PRESERVATION_RECEIPT_INVALID');
  requireDigest(receipt.receipt_digest, 'preservation_receipt_digest');
  if (digestWithout(receipt, 'receipt_digest') !== receipt.receipt_digest) fail('PRESERVATION_RECEIPT_DIGEST_MISMATCH');
  validateSubject(receipt.subject);
  return true;
}

function generateCompletionReportAndReentry({ preservation_receipt, current_canonical_subject }) {
  validatePreservationReceipt(preservation_receipt);
  validateSubject(current_canonical_subject);
  const exactCurrent = sameSubject(preservation_receipt.subject, current_canonical_subject);
  const report = {
    report_schema_version: 1,
    owner_path: 'SYSTEM_MASTER/BOOK',
    component_id: 'BOOK-COMP-12',
    preservation_receipt_id: preservation_receipt.receipt_id,
    preservation_receipt_digest: preservation_receipt.receipt_digest,
    preserved_canonical_digest: preservation_receipt.subject.canonical_digest,
    current_canonical_digest: current_canonical_subject.canonical_digest,
    preserved_subject_is_current: exactCurrent,
    completion_status: exactCurrent ? 'PRESERVATION_CURRENT' : 'PRESERVED_SUBJECT_HISTORICAL',
    reentry_instruction: exactCurrent ? 'NO_REENTRY_REQUIRED' : 'REENTER_PRESERVATION_FOR_CURRENT_CANONICAL_SUBJECT',
    overwrite_current_allowed: false,
    canonical_effect_allowed: false,
    report_digest: ''
  };
  report.report_digest = digestWithout(report, 'report_digest');
  return report;
}

function evaluateOfflineOperation({ operation, online, local_evidence_available = false }, profile = loadProfile()) {
  validateProfile(profile);
  if (!nonEmpty(operation)) fail('OFFLINE_OPERATION_REQUIRED');
  if (online === true) return { status: 'AVAILABLE_ONLINE', operation };
  if ((profile.offline_continuity.peer_required_operations || []).includes(operation)) return { status: 'BLOCKED_PEER_REQUIRED', operation, blocker: 'CORE_DURABILITY_INTERFACE_UNAVAILABLE' };
  if ((profile.offline_continuity.allowed_local_operations || []).includes(operation)) {
    return local_evidence_available ? { status: 'AVAILABLE_OFFLINE', operation } : { status: 'BLOCKED_LOCAL_EVIDENCE_REQUIRED', operation };
  }
  return { status: 'BLOCKED_OPERATION_NOT_OFFLINE_ADMITTED', operation };
}

function planCrashRecovery({ manifest, current_canonical_subject, checkpoint_ref, existing_core_receipts = [] }, profile = loadProfile()) {
  validateSemanticBackupManifest(manifest, profile);
  validateSubject(current_canonical_subject);
  requireRef(checkpoint_ref, 'checkpoint_ref');
  if (!Array.isArray(existing_core_receipts)) fail('EXISTING_CORE_RECEIPTS_ARRAY_REQUIRED');
  if (!sameSubject(manifest.subject, current_canonical_subject)) {
    return { action: 'REPLAN_FOR_CURRENT_SUBJECT', dispatch_allowed: false, reason: 'PRESERVED_SUBJECT_STALE', checkpoint_ref, canonical_effect_allowed: false };
  }
  const matching = existing_core_receipts.filter(r => isObject(r) && r.provider_system === 'CORE' && r.status === 'DURABLE' && r.semantic_manifest_digest === manifest.manifest_digest && r.canonical_digest === manifest.subject.canonical_digest);
  if (matching.length > 1) fail('AMBIGUOUS_EXISTING_CORE_RECEIPTS');
  if (matching.length === 1) {
    return { action: 'RECONCILE_EXISTING_RECEIPT', dispatch_allowed: false, provider_receipt_id: matching[0].receipt_id, checkpoint_ref, canonical_effect_allowed: false };
  }
  return { action: 'REQUEST_CORE_DURABILITY', dispatch_allowed: true, manifest_digest: manifest.manifest_digest, checkpoint_ref, canonical_effect_allowed: false };
}

module.exports = {
  BookSemanticRecoveryError,
  loadProfile,
  validateProfile,
  buildSemanticBackupManifest,
  validateSemanticBackupManifest,
  verifyDependencyClosure,
  validateCoreProviderRegistration,
  buildCoreDurabilityRequest,
  acceptCoreDurabilityReceipt,
  buildCoreRestoreRequest,
  verifyRestore,
  evaluatePreservationGate,
  recordPreservationReceipt,
  validatePreservationReceipt,
  generateCompletionReportAndReentry,
  evaluateOfflineOperation,
  planCrashRecovery,
  stableStringify,
  sha256
};
