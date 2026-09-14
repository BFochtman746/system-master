'use strict';

const assert = require('assert');
const recovery = require('./book-semantic-recovery-profile');

const H = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const H3 = 'c'.repeat(64);
const H4 = 'd'.repeat(64);
const H5 = 'e'.repeat(64);
const H6 = 'f'.repeat(64);

function dependency(id, klass, ref, digest, owner = 'SYSTEM_MASTER/BOOK', currentness = 'CURRENT') {
  return { dependency_id: id, class: klass, owner_path: owner, ref, digest, currentness, required: true };
}

function manifestInput() {
  return {
    manifest_id: 'book-preservation-manifest-001',
    book_project_id: 'book-project-001',
    subject: {
      canonical_state_ref: 'book:canonical:v7',
      canonical_version: 7,
      canonical_digest: H,
      manuscript_ref: 'book:manuscript:v7',
      manuscript_digest: H2
    },
    scope: {
      requires_knowledge_canon: true,
      requires_research: true,
      has_publication_artifacts: false,
      has_release: false,
      has_external_receipts: false,
      has_active_workflow: true
    },
    dependencies: [
      dependency('dep-brief', 'GOVERNING_BRIEF', 'book:brief:v3', H3),
      dependency('dep-plan', 'BOOK_PLAN', 'book:plan:v5', H4),
      dependency('dep-life', 'LIFECYCLE_STATE', 'book:lifecycle:v2', H5),
      dependency('dep-evidence', 'EVIDENCE_MANIFEST', 'book:evidence:v9', H6),
      dependency('dep-canon', 'STORY_BIBLE_OR_CANON', 'book:canon:v8', H3),
      dependency('dep-research', 'RESEARCH_PROVENANCE', 'research:manifest:v4', H4, 'SYSTEM_MASTER/RESEARCH_KNOWLEDGE'),
      dependency('dep-checkpoint', 'WORKFLOW_CHECKPOINT', 'book:checkpoint:v6', H5)
    ],
    rebuild_profile: {
      recipes_disposition: 'PRESENT',
      recipes: [{ ref: 'book:rebuild-recipe:semantic-v1', version: '1', digest: H3 }],
      indexes_disposition: 'PRESENT',
      indexes: [{ ref: 'book:index-version:canon-v8', version: '8', digest: H4 }]
    },
    lineage: {
      edition_id: 'edition-001',
      parent_version_refs: ['book:canonical:v6'],
      release_id: null
    },
    policy: {
      retention_class: 'LONG_TERM',
      offline_continuity_requirement: 'FULL_LOCAL_SEMANTIC_CONTINUITY'
    },
    created_at: '2026-09-14T16:30:00Z'
  };
}

function expectCode(fn, code) {
  assert.throws(fn, error => error && error.code === code, `expected ${code}`);
}

const profile = recovery.loadProfile();
assert.strictEqual(recovery.validateProfile(profile), true);

const inputA = manifestInput();
const manifest = recovery.buildSemanticBackupManifest(inputA, profile);
assert.strictEqual(manifest.owner_path, 'SYSTEM_MASTER/BOOK');
assert.strictEqual(manifest.component_id, 'BOOK-COMP-12');
assert.strictEqual(manifest.physical_payload_included, false);
assert.strictEqual(manifest.canonical_effect_allowed, false);
assert.strictEqual(recovery.validateSemanticBackupManifest(manifest, profile), true);
assert.match(manifest.manifest_digest, /^[a-f0-9]{64}$/);

const reordered = manifestInput();
reordered.dependencies.reverse();
reordered.rebuild_profile.recipes.reverse();
reordered.rebuild_profile.indexes.reverse();
assert.strictEqual(recovery.buildSemanticBackupManifest(reordered, profile).manifest_digest, manifest.manifest_digest, 'semantic digest must ignore input list order');

const closure = recovery.verifyDependencyClosure(manifest, profile);
assert.strictEqual(closure.status, 'PASS');
assert.strictEqual(closure.semantic_backup_set_complete, true);

const missing = manifestInput();
missing.dependencies = missing.dependencies.filter(d => d.class !== 'BOOK_PLAN');
expectCode(() => recovery.buildSemanticBackupManifest(missing, profile), 'REQUIRED_DEPENDENCY_CLASS_MISSING');

const duplicate = manifestInput();
duplicate.dependencies[1].ref = duplicate.dependencies[0].ref;
expectCode(() => recovery.buildSemanticBackupManifest(duplicate, profile), 'DUPLICATE_DEPENDENCY_REF');

const prose = manifestInput();
prose.dependencies.push(dependency('dep-prose-active', 'OTHER_BOOK_SEMANTIC_DEPENDENCY', 'prose:active:v1', H6, 'SYSTEM_MASTER/PROSE', 'CURRENT'));
expectCode(() => recovery.buildSemanticBackupManifest(prose, profile), 'ACTIVE_PROSE_DEPENDENCY_FORBIDDEN');

const historicalProse = manifestInput();
historicalProse.dependencies.push(dependency('dep-prose-history', 'OTHER_BOOK_SEMANTIC_DEPENDENCY', 'prose:historical:receipt', H6, 'SYSTEM_MASTER/PROSE', 'HISTORICAL_PROVENANCE'));
assert.match(recovery.buildSemanticBackupManifest(historicalProse, profile).manifest_digest, /^[a-f0-9]{64}$/);

const badRecipe = manifestInput();
badRecipe.rebuild_profile.recipes[0].version = '';
expectCode(() => recovery.buildSemanticBackupManifest(badRecipe, profile), 'REBUILD_VERSION_REQUIRED');

expectCode(() => recovery.buildCoreDurabilityRequest({ manifest, provider_registration: null, request_id: 'req-preserve-1', requested_at: '2026-09-14T16:31:00Z' }, profile), 'CORE_DURABILITY_INTERFACE_UNAVAILABLE');

const preserveRegistration = {
  registration_state: 'REGISTERED_ACTIVE',
  provider_system: 'CORE',
  owner_path: 'SYSTEM_MASTER/CORE',
  domain: 'P03',
  kind: 'COMMAND',
  semantic_role: 'PRESERVE_PHYSICAL_SET',
  operation_id: 'CORE.P03.COMMAND.TEST_PRESERVE_PHYSICAL_SET',
  canonical_write_authority: false,
  direct_book_state_write: false
};
const restoreRegistration = {
  registration_state: 'REGISTERED_ACTIVE',
  provider_system: 'CORE',
  owner_path: 'SYSTEM_MASTER/CORE',
  domain: 'P03',
  kind: 'COMMAND',
  semantic_role: 'RESTORE_PHYSICAL_SET',
  operation_id: 'CORE.P03.COMMAND.TEST_RESTORE_PHYSICAL_SET',
  canonical_write_authority: false,
  direct_book_state_write: false
};
assert.strictEqual(recovery.validateCoreProviderRegistration(preserveRegistration, 'PRESERVE_PHYSICAL_SET'), true);
const badRegistration = { ...preserveRegistration, canonical_write_authority: true };
expectCode(() => recovery.validateCoreProviderRegistration(badRegistration, 'PRESERVE_PHYSICAL_SET'), 'CORE_PROVIDER_BOOK_WRITE_AUTHORITY_FORBIDDEN');

const preserveRequest = recovery.buildCoreDurabilityRequest({
  manifest,
  provider_registration: preserveRegistration,
  request_id: 'req-preserve-1',
  requested_at: '2026-09-14T16:31:00Z'
}, profile);
const preserveRequestReplay = recovery.buildCoreDurabilityRequest({
  manifest,
  provider_registration: preserveRegistration,
  request_id: 'req-preserve-2',
  requested_at: '2026-09-14T16:32:00Z'
}, profile);
assert.strictEqual(preserveRequest.idempotency_key, preserveRequestReplay.idempotency_key, 'idempotency must bind semantic operation/subject, not request timestamp/id');
assert.strictEqual(preserveRequest.physical_payload_included, false);
assert.strictEqual(preserveRequest.canonical_effect_allowed, false);
assert.strictEqual(preserveRequest.direct_database_access, false);

const coreDurabilityReceipt = {
  receipt_id: 'core-durability-receipt-1',
  provider_system: 'CORE',
  owner_path: 'SYSTEM_MASTER/CORE',
  operation_id: preserveRequest.operation_id,
  request_id: preserveRequest.request_id,
  status: 'DURABLE',
  semantic_manifest_digest: manifest.manifest_digest,
  canonical_digest: manifest.subject.canonical_digest,
  physical_manifest_digest: H5,
  restore_handle: 'core:restore:handle-001'
};
const wrongDurability = { ...coreDurabilityReceipt, semantic_manifest_digest: H6 };
expectCode(() => recovery.acceptCoreDurabilityReceipt({ manifest, request: preserveRequest, provider_receipt: wrongDurability }, profile), 'DURABILITY_RECEIPT_SUBJECT_MISMATCH');
const durabilityAdmission = recovery.acceptCoreDurabilityReceipt({ manifest, request: preserveRequest, provider_receipt: coreDurabilityReceipt }, profile);
assert.strictEqual(durabilityAdmission.status, 'ACCEPTED');
assert.strictEqual(durabilityAdmission.canonical_effect_allowed, false);

const restoreRequest = recovery.buildCoreRestoreRequest({
  manifest,
  durability_admission: durabilityAdmission,
  provider_registration: restoreRegistration,
  request_id: 'req-restore-1',
  requested_at: '2026-09-14T16:33:00Z'
}, profile);
assert.strictEqual(restoreRequest.destructive_test_environment_required, true);
assert.strictEqual(restoreRequest.canonical_effect_allowed, false);

const restoredDependencyDigests = Object.fromEntries(manifest.dependencies.map(d => [d.ref, d.digest]));
const coreRestoreReceipt = {
  receipt_id: 'core-restore-receipt-1',
  provider_system: 'CORE',
  owner_path: 'SYSTEM_MASTER/CORE',
  operation_id: restoreRequest.operation_id,
  request_id: restoreRequest.request_id,
  status: 'RESTORED',
  destructive_restore_executed: true,
  semantic_manifest_digest: manifest.manifest_digest,
  physical_manifest_digest: durabilityAdmission.physical_manifest_digest,
  restored_canonical_digest: manifest.subject.canonical_digest,
  restored_manuscript_digest: manifest.subject.manuscript_digest,
  reproduced_final_expression_digest: manifest.subject.manuscript_digest,
  restored_dependency_digests: restoredDependencyDigests
};

const currentSubject = { ...manifest.subject };
const restoreProof = recovery.verifyRestore({ manifest, durability_admission: durabilityAdmission, restore_request: restoreRequest, core_restore_receipt: coreRestoreReceipt, current_canonical_subject: currentSubject }, profile);
assert.strictEqual(restoreProof.status, 'PASS');
assert.strictEqual(restoreProof.classification, 'CURRENT_SUBJECT_VERIFIED');
assert.strictEqual(restoreProof.overwrite_current_allowed, false);
assert.strictEqual(restoreProof.canonical_effect_allowed, false);

const badRestore = { ...coreRestoreReceipt, reproduced_final_expression_digest: H6 };
expectCode(() => recovery.verifyRestore({ manifest, durability_admission: durabilityAdmission, restore_request: restoreRequest, core_restore_receipt: badRestore, current_canonical_subject: currentSubject }, profile), 'FINAL_EXPRESSION_REPRODUCTION_MISMATCH');

const advancedSubject = { ...manifest.subject, canonical_state_ref: 'book:canonical:v8', canonical_version: 8, canonical_digest: H6, manuscript_ref: 'book:manuscript:v8', manuscript_digest: H5 };
const historicalProof = recovery.verifyRestore({ manifest, durability_admission: durabilityAdmission, restore_request: restoreRequest, core_restore_receipt: coreRestoreReceipt, current_canonical_subject: advancedSubject }, profile);
assert.strictEqual(historicalProof.classification, 'HISTORICAL_SNAPSHOT_VERIFIED');
assert.strictEqual(historicalProof.current_subject_exact, false);
expectCode(() => recovery.evaluatePreservationGate({ manifest, dependency_closure: closure, durability_admission: durabilityAdmission, restore_proof: historicalProof, current_canonical_subject: advancedSubject }, profile), 'RESTORE_PROOF_NOT_EXACT_CURRENT');

const gate = recovery.evaluatePreservationGate({ manifest, dependency_closure: closure, durability_admission: durabilityAdmission, restore_proof: restoreProof, current_canonical_subject: currentSubject }, profile);
assert.strictEqual(gate.status, 'PASS');
assert.strictEqual(gate.gate_id, 'PRESERVATION_COMPLETE');
assert.strictEqual(gate.legacy_gate_id, 'G19');

const preservationReceipt = recovery.recordPreservationReceipt({
  manifest,
  gate_result: gate,
  durability_admission: durabilityAdmission,
  restore_proof: restoreProof,
  receipt_id: 'book-preservation-receipt-1',
  recorded_at: '2026-09-14T16:34:00Z'
}, profile);
assert.strictEqual(recovery.validatePreservationReceipt(preservationReceipt), true);
assert.strictEqual(preservationReceipt.immutable, true);
assert.strictEqual(preservationReceipt.canonical_effect_allowed, false);

const reportCurrent = recovery.generateCompletionReportAndReentry({ preservation_receipt: preservationReceipt, current_canonical_subject: currentSubject });
assert.strictEqual(reportCurrent.completion_status, 'PRESERVATION_CURRENT');
assert.strictEqual(reportCurrent.reentry_instruction, 'NO_REENTRY_REQUIRED');
const reportAdvanced = recovery.generateCompletionReportAndReentry({ preservation_receipt: preservationReceipt, current_canonical_subject: advancedSubject });
assert.strictEqual(reportAdvanced.completion_status, 'PRESERVED_SUBJECT_HISTORICAL');
assert.strictEqual(reportAdvanced.reentry_instruction, 'REENTER_PRESERVATION_FOR_CURRENT_CANONICAL_SUBJECT');
assert.strictEqual(reportAdvanced.overwrite_current_allowed, false);

assert.deepStrictEqual(recovery.evaluateOfflineOperation({ operation: 'ASSEMBLE_SEMANTIC_BACKUP_SET', online: false, local_evidence_available: true }, profile), { status: 'AVAILABLE_OFFLINE', operation: 'ASSEMBLE_SEMANTIC_BACKUP_SET' });
assert.strictEqual(recovery.evaluateOfflineOperation({ operation: 'REQUEST_CORE_DURABILITY', online: false, local_evidence_available: true }, profile).status, 'BLOCKED_PEER_REQUIRED');
assert.strictEqual(recovery.evaluateOfflineOperation({ operation: 'VERIFY_RESTORE', online: false, local_evidence_available: false }, profile).status, 'BLOCKED_LOCAL_EVIDENCE_REQUIRED');

const crashFresh = recovery.planCrashRecovery({ manifest, current_canonical_subject: currentSubject, checkpoint_ref: 'book:checkpoint:recovery-1', existing_core_receipts: [] }, profile);
assert.strictEqual(crashFresh.action, 'REQUEST_CORE_DURABILITY');
assert.strictEqual(crashFresh.dispatch_allowed, true);
const crashDedup = recovery.planCrashRecovery({ manifest, current_canonical_subject: currentSubject, checkpoint_ref: 'book:checkpoint:recovery-1', existing_core_receipts: [coreDurabilityReceipt] }, profile);
assert.strictEqual(crashDedup.action, 'RECONCILE_EXISTING_RECEIPT');
assert.strictEqual(crashDedup.dispatch_allowed, false);
const crashStale = recovery.planCrashRecovery({ manifest, current_canonical_subject: advancedSubject, checkpoint_ref: 'book:checkpoint:recovery-1', existing_core_receipts: [] }, profile);
assert.strictEqual(crashStale.action, 'REPLAN_FOR_CURRENT_SUBJECT');
assert.strictEqual(crashStale.dispatch_allowed, false);
expectCode(() => recovery.planCrashRecovery({ manifest, current_canonical_subject: currentSubject, checkpoint_ref: 'book:checkpoint:recovery-1', existing_core_receipts: [coreDurabilityReceipt, { ...coreDurabilityReceipt, receipt_id: 'core-durability-receipt-2' }] }, profile), 'AMBIGUOUS_EXISTING_CORE_RECEIPTS');

assert.strictEqual(profile.core_p03_dependency.registration_state, 'REQUIRED_PROVIDER_REGISTRATION_OPEN');
assert.strictEqual(profile.core_p03_dependency.no_operation_id_invented_by_book, true);
assert.ok(profile.non_claims.some(x => x.includes('does not implement physical storage')));

console.log('BOOK_SEMANTIC_RECOVERY_PROFILE_TESTS_PASS');
