'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const recovery = require('../../system-master/book-system/book-semantic-recovery-profile');

const registryPath = 'governance/contracts/CORE-P03-PUBLIC-DURABILITY-OPERATIONS-002.json';
const providerPath = 'control-gateway/python/a01_book_durability_provider.py';
const profilePath = 'qualification/book-system/recovery/BOOK-SEMANTIC-RECOVERY-PROFILE-001.json';

function fail(message) {
  process.stderr.write(`BOOK_CORE_P03_END_TO_END_QUALIFY_FAIL: ${message}\n`);
  process.exit(1);
}
function assert(condition, message) { if (!condition) fail(message); }
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { fail(`cannot read ${file}: ${error.message}`); } }
function sha256Bytes(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function sha256File(file) { return sha256Bytes(fs.readFileSync(file)); }
function writePhysical(root, ref, content) {
  const target = path.join(root, ref);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return sha256File(target);
}
function operationByRole(registry, role) {
  const matches = (registry.operations || []).filter(op => op.semantic_role === role && op.registration_state === 'REGISTERED_ACTIVE');
  assert(matches.length === 1, `expected exactly one active ${role} provider`);
  return matches[0];
}
function runPython(code, args) {
  const python = process.env.PYTHON || process.env.PYTHON3 || 'python3';
  const result = spawnSync(python, ['-c', code, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`CORE provider subprocess failed with status ${result.status}`);
  }
  try { return JSON.parse(String(result.stdout || '').trim()); }
  catch (error) { fail(`CORE provider returned non-JSON output: ${error.message}: ${String(result.stdout || '').slice(0, 400)}`); }
}

for (const file of [registryPath, providerPath, profilePath]) assert(fs.existsSync(file), `missing ${file}`);
const registry = readJson(registryPath);
const profile = readJson(profilePath);
assert(registry.registry_id === 'CORE-P03-PUBLIC-DURABILITY-OPERATIONS-002', 'provider registry id drift');
assert(registry.authority_id === 'CURRENT-AUTHORITY-005', 'provider authority drift');
assert(registry.provider_system === 'CORE' && registry.owner_path === 'SYSTEM_MASTER/CORE' && registry.domain === 'P03', 'provider ownership drift');
assert(registry.qualification_rule && /exact-subject preserve plus destructive-restore acceptance/i.test(registry.qualification_rule), 'provider registry no longer requires Book exact-subject acceptance');
assert(profile.profile_id === 'BOOK-SEMANTIC-RECOVERY-PROFILE-001', 'Book recovery profile drift');
assert(profile.owner_path === 'SYSTEM_MASTER/BOOK', 'Book semantic owner drift');

const preserveRegistration = operationByRole(registry, 'PRESERVE_PHYSICAL_SET');
const restoreRegistration = operationByRole(registry, 'RESTORE_PHYSICAL_SET');
recovery.validateCoreProviderRegistration(preserveRegistration, 'PRESERVE_PHYSICAL_SET');
recovery.validateCoreProviderRegistration(restoreRegistration, 'RESTORE_PHYSICAL_SET');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'system-master-book-core-p03-e2e-'));
try {
  const sourceRoot = path.join(tempRoot, 'core-owned-source');
  const archiveRoot = path.join(tempRoot, 'core-owned-archive');
  const restoreParent = path.join(tempRoot, 'core-owned-restore-tests');
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.mkdirSync(archiveRoot, { recursive: true });
  fs.mkdirSync(restoreParent, { recursive: true });

  const refs = {
    canonical: 'canonical-state.json',
    manuscript: 'manuscript.md',
    brief: 'deps/governing-brief.json',
    plan: 'deps/book-plan.json',
    lifecycle: 'deps/lifecycle-state.json',
    evidence: 'deps/evidence-manifest.json'
  };
  const digests = {
    canonical: writePhysical(sourceRoot, refs.canonical, Buffer.from('{"canonical":"book-core-p03-e2e","version":1}\n')),
    manuscript: writePhysical(sourceRoot, refs.manuscript, Buffer.from('# Book CORE P03 E2E\nExact final expression.\n')),
    brief: writePhysical(sourceRoot, refs.brief, Buffer.from('{"brief":"governing"}\n')),
    plan: writePhysical(sourceRoot, refs.plan, Buffer.from('{"plan":"book"}\n')),
    lifecycle: writePhysical(sourceRoot, refs.lifecycle, Buffer.from('{"phase":"PRESERVATION"}\n')),
    evidence: writePhysical(sourceRoot, refs.evidence, Buffer.from('{"evidence":"exact-current"}\n'))
  };

  const now = new Date().toISOString();
  const manifest = recovery.buildSemanticBackupManifest({
    manifest_id: 'book-core-p03-e2e-manifest-001',
    book_project_id: 'book-core-p03-e2e-project-001',
    subject: {
      canonical_state_ref: refs.canonical,
      canonical_version: 1,
      canonical_digest: digests.canonical,
      manuscript_ref: refs.manuscript,
      manuscript_digest: digests.manuscript
    },
    scope: {
      requires_knowledge_canon: false,
      requires_research: false,
      has_publication_artifacts: false,
      has_release: false,
      has_external_receipts: false,
      has_active_workflow: false
    },
    dependencies: [
      { dependency_id: 'dep-brief', class: 'GOVERNING_BRIEF', owner_path: 'SYSTEM_MASTER/BOOK', ref: refs.brief, digest: digests.brief, currentness: 'CURRENT', required: true },
      { dependency_id: 'dep-plan', class: 'BOOK_PLAN', owner_path: 'SYSTEM_MASTER/BOOK', ref: refs.plan, digest: digests.plan, currentness: 'CURRENT', required: true },
      { dependency_id: 'dep-lifecycle', class: 'LIFECYCLE_STATE', owner_path: 'SYSTEM_MASTER/BOOK', ref: refs.lifecycle, digest: digests.lifecycle, currentness: 'CURRENT', required: true },
      { dependency_id: 'dep-evidence', class: 'EVIDENCE_MANIFEST', owner_path: 'SYSTEM_MASTER/BOOK', ref: refs.evidence, digest: digests.evidence, currentness: 'CURRENT', required: true }
    ],
    rebuild_profile: {
      recipes_disposition: 'NOT_APPLICABLE', recipes: [],
      indexes_disposition: 'NOT_APPLICABLE', indexes: []
    },
    lineage: { edition_id: 'book-core-p03-e2e-edition-001', parent_version_refs: [], release_id: null },
    policy: { retention_class: 'LONG_TERM', offline_continuity_requirement: 'NONE' },
    created_at: now
  }, profile);
  const dependencyClosure = recovery.verifyDependencyClosure(manifest, profile);
  assert(dependencyClosure.status === 'PASS', 'Book semantic dependency closure failed');

  const preserveRequest = recovery.buildCoreDurabilityRequest({
    manifest,
    provider_registration: preserveRegistration,
    request_id: 'book-core-p03-e2e-preserve-001',
    requested_at: now
  }, profile);
  const requestPath = path.join(tempRoot, 'preserve-request.json');
  const manifestPath = path.join(tempRoot, 'semantic-manifest.json');
  fs.writeFileSync(requestPath, JSON.stringify(preserveRequest));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const providerDir = path.resolve('control-gateway/python');

  const preserveDriver = [
    'import json,sys',
    'sys.path.insert(0, sys.argv[5])',
    'import a01_book_durability_provider as p',
    'request=json.load(open(sys.argv[1], encoding="utf-8"))',
    'manifest=json.load(open(sys.argv[2], encoding="utf-8"))',
    'receipt=p.preserve_physical_set(request, manifest, p.filesystem_resolver(sys.argv[3]), sys.argv[4])',
    'print(json.dumps(receipt, sort_keys=True))'
  ].join(';');
  const durabilityReceipt = runPython(preserveDriver, [requestPath, manifestPath, sourceRoot, archiveRoot, providerDir]);
  assert(durabilityReceipt.status === 'DURABLE', 'real CORE preserve did not return DURABLE');
  assert(durabilityReceipt.operation_id === preserveRegistration.operation_id, 'real CORE preserve operation id drift');
  assert(durabilityReceipt.semantic_manifest_digest === manifest.manifest_digest, 'real CORE preserve manifest digest mismatch');

  const durabilityReplay = runPython(preserveDriver, [requestPath, manifestPath, sourceRoot, archiveRoot, providerDir]);
  assert(JSON.stringify(durabilityReplay) === JSON.stringify(durabilityReceipt), 'real CORE preserve replay was not idempotent');

  const durabilityAdmission = recovery.acceptCoreDurabilityReceipt({ manifest, request: preserveRequest, provider_receipt: durabilityReceipt }, profile);
  assert(durabilityAdmission.status === 'ACCEPTED', 'Book rejected real CORE durability receipt');

  const restoreRequest = recovery.buildCoreRestoreRequest({
    manifest,
    durability_admission: durabilityAdmission,
    provider_registration: restoreRegistration,
    request_id: 'book-core-p03-e2e-restore-001',
    requested_at: new Date().toISOString()
  }, profile);
  const restoreRequestPath = path.join(tempRoot, 'restore-request.json');
  fs.writeFileSync(restoreRequestPath, JSON.stringify(restoreRequest));
  const restoreDriver = [
    'import json,sys',
    'sys.path.insert(0, sys.argv[4])',
    'import a01_book_durability_provider as p',
    'request=json.load(open(sys.argv[1], encoding="utf-8"))',
    'receipt=p.restore_physical_set(request, sys.argv[2], sys.argv[3])',
    'print(json.dumps(receipt, sort_keys=True))'
  ].join(';');
  const restoreReceipt = runPython(restoreDriver, [restoreRequestPath, archiveRoot, restoreParent, providerDir]);
  assert(restoreReceipt.status === 'RESTORED', 'real CORE restore did not return RESTORED');
  assert(restoreReceipt.destructive_restore_executed === true, 'real CORE restore did not prove destructive execution');
  assert(restoreReceipt.operation_id === restoreRegistration.operation_id, 'real CORE restore operation id drift');

  const restoreReplay = runPython(restoreDriver, [restoreRequestPath, archiveRoot, restoreParent, providerDir]);
  assert(JSON.stringify(restoreReplay) === JSON.stringify(restoreReceipt), 'real CORE restore replay was not idempotent');

  const restoredPayloadDir = path.join(restoreParent, restoreReceipt.restore_test_target_ref, 'payloads');
  assert(fs.existsSync(restoredPayloadDir), 'real CORE restore payload directory missing');
  for (const digest of Object.values(digests)) {
    const restored = path.join(restoredPayloadDir, digest);
    assert(fs.isFileSync(restored), `restored physical object missing: ${digest}`);
    assert(sha256File(restored) === digest, `restored physical object digest mismatch: ${digest}`);
  }

  const restoreProof = recovery.verifyRestore({
    manifest,
    durability_admission: durabilityAdmission,
    restore_request: restoreRequest,
    core_restore_receipt: restoreReceipt,
    current_canonical_subject: manifest.subject
  }, profile);
  assert(restoreProof.status === 'PASS' && restoreProof.classification === 'CURRENT_SUBJECT_VERIFIED', 'Book exact-current restore verification failed');
  assert(restoreProof.dependency_closure_reproduced === true && restoreProof.final_expression_reproduced === true, 'Book restore reproduction proof incomplete');

  const gate = recovery.evaluatePreservationGate({
    manifest,
    dependency_closure: dependencyClosure,
    durability_admission: durabilityAdmission,
    restore_proof: restoreProof,
    current_canonical_subject: manifest.subject
  }, profile);
  assert(gate.status === 'PASS' && gate.gate_id === 'PRESERVATION_COMPLETE', 'Book PRESERVATION/G19 gate did not pass');

  const preservationReceipt = recovery.recordPreservationReceipt({
    manifest,
    gate_result: gate,
    durability_admission: durabilityAdmission,
    restore_proof: restoreProof,
    receipt_id: 'book-core-p03-e2e-preservation-receipt-001',
    recorded_at: new Date().toISOString()
  }, profile);
  assert(recovery.validatePreservationReceipt(preservationReceipt) === true, 'Book preservation receipt validation failed');
  const report = recovery.generateCompletionReportAndReentry({ preservation_receipt: preservationReceipt, current_canonical_subject: manifest.subject });
  assert(report.completion_status === 'PRESERVATION_CURRENT' && report.reentry_instruction === 'NO_REENTRY_REQUIRED', 'Book preservation completion/reentry result drift');

  for (const value of [preserveRequest, durabilityAdmission, restoreRequest, restoreProof, gate, preservationReceipt, report]) {
    assert(value.canonical_effect_allowed === false, 'cross-peer qualification granted canonical mutation authority');
  }

  console.log(JSON.stringify({
    status: 'PASS',
    qualifier: 'BOOK-CORE-P03-END-TO-END-001',
    provider_registry: registry.registry_id,
    preserve_operation: preserveRegistration.operation_id,
    restore_operation: restoreRegistration.operation_id,
    semantic_manifest_digest: manifest.manifest_digest,
    physical_manifest_digest: durabilityReceipt.physical_manifest_digest,
    destructive_restore_executed: restoreReceipt.destructive_restore_executed,
    restore_classification: restoreProof.classification,
    preservation_gate: gate.status,
    preserve_replay_idempotent: true,
    restore_replay_idempotent: true,
    canonical_effect_allowed: false,
    sentinel: 'BOOK_CORE_P03_END_TO_END_ACCEPTANCE_PASS'
  }));
  console.log('BOOK_CORE_P03_END_TO_END_ACCEPTANCE_PASS');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
