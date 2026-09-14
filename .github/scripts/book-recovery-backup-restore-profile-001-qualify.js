'use strict';

const assert = require('assert');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CONTRACT_PATH = path.join(ROOT, 'qualification/book-system/recovery/BOOK-RECOVERY-BACKUP-RESTORE-PROFILE-001.json');
const MODULE_PATH = path.join(ROOT, 'system-master/book-system/book-recovery-profile.js');
const TEST_PATH = path.join(ROOT, 'system-master/book-system/book-recovery-profile.test.js');
const COMPONENT_ARCH_PATH = path.join(ROOT, 'qualification/book-system/BOOK-COMPONENT-ARCHITECTURE-001.json');
const HIGHER_LEDGER_PATH = path.join(ROOT, 'qualification/book-system/BOOK-HIGHER-LEDGER-008-010-DISPOSITION-001.json');
const LIFECYCLE_BINDING_PATH = path.join(ROOT, 'qualification/book-system/lifecycle/BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-001.json');

function fail(message) {
  console.error(`BOOK_RECOVERY_BACKUP_RESTORE_PROFILE_001_QUALIFY_FAIL ${message}`);
  process.exit(1);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

for (const file of [CONTRACT_PATH, MODULE_PATH, TEST_PATH, COMPONENT_ARCH_PATH, HIGHER_LEDGER_PATH, LIFECYCLE_BINDING_PATH]) {
  expect(fs.existsSync(file), `missing ${path.relative(ROOT, file)}`);
}

const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const architecture = JSON.parse(fs.readFileSync(COMPONENT_ARCH_PATH, 'utf8'));
const higherLedger = JSON.parse(fs.readFileSync(HIGHER_LEDGER_PATH, 'utf8'));
const lifecycleBinding = JSON.parse(fs.readFileSync(LIFECYCLE_BINDING_PATH, 'utf8'));
const source = fs.readFileSync(MODULE_PATH, 'utf8');
const recovery = require(MODULE_PATH);

expect(contract.profile_id === 'BOOK-RECOVERY-BACKUP-RESTORE-PROFILE-001', 'profile id');
expect(contract.authority_id === 'CURRENT-AUTHORITY-005', 'authority');
expect(contract.owner_path === 'SYSTEM_MASTER/BOOK', 'owner');
expect(contract.component_id === 'BOOK-COMP-12', 'component');
expect(contract.objective_id === 'BOOK-ENG-009-SEMANTIC-RECOVERY-PROFILE-001', 'objective');
expect(contract.standing === 'FROZEN_BOOK_SEMANTIC_RECOVERY_PROFILE__CORE_PHYSICAL_DURABILITY_PORT_REQUIRED__WHOLE_OBJECTIVE_NOT_CLOSED', 'standing');
expect(JSON.stringify(contract.bound_lifecycle_operations) === JSON.stringify(['P19-01','P19-02','P19-03','P19-04','P19-05','P19-06','P19-07','P19-08']), 'P19 operation binding');
expect(contract.core_durability_port?.port_id === 'CORE.DURABILITY.BOOK_RECOVERY.v1', 'CORE port id');
expect(contract.core_durability_port?.current_binding_status === 'UNBOUND_REQUIRED_DEPENDENCY', 'CORE port must remain explicitly unbound');
expect(contract.completion_boundary?.Book_semantic_layer_can_be_qualified_by_this_profile === true, 'Book semantic qualification boundary');
expect(contract.completion_boundary?.BOOK_ENG_009_whole_objective_complete === false, 'ENG-009 must remain incomplete');
expect(contract.completion_boundary?.whole_app_continuity_complete === false, 'whole-app continuity must remain incomplete');
expect(contract.ownership_split?.CORE?.includes('physical backup creation'), 'CORE physical backup ownership');
expect(contract.ownership_split?.CORE?.includes('physical restore and rollback execution'), 'CORE physical restore ownership');
expect(contract.ownership_split?.BOOK?.includes('semantic backup-set completeness and digest'), 'Book semantic set ownership');
expect(contract.offline_continuity?.no_silent_merge === true, 'offline no-silent-merge rule');
expect(contract.offline_continuity?.physical_local_storage_owner === 'CORE', 'offline physical storage owner');
expect(contract.restore_invariants?.destructive_restore_rule?.includes('CORE RESTORE receipt'), 'destructive restore receipt rule');

const requiredInterfaces = [
  'validateBackupSet',
  'defineRestoreInvariants',
  'verifyOfflineContinuity',
  'verifyRestoredState'
];
for (const name of requiredInterfaces) expect(typeof recovery[name] === 'function', `missing runtime interface ${name}`);
for (const name of ['createReleaseManifest','createSemanticBackupSet','validateCoreDurabilityReceipt','createOfflineSession','validateRetentionPolicy','createPreservationReceipt','validatePreservationReceipt','closePreservationLineage']) {
  expect(typeof recovery[name] === 'function', `missing runtime support ${name}`);
}
expect(recovery.REQUIRED_COMPONENTS.length === 7, 'semantic component count');
expect(JSON.stringify(recovery.REQUIRED_COMPONENTS) === JSON.stringify(contract.semantic_backup_set.required_components), 'runtime/contract semantic component drift');

// The Book module must stay pure semantic logic. Physical durability is a CORE port.
for (const forbidden of [
  "require('fs')",
  'require("fs")',
  "require('child_process')",
  'require("child_process")',
  'writeFile',
  'mkdir',
  'unlink',
  'rmSync',
  'createPhysicalBackup',
  'restorePhysicalBackup',
  'syncTransport'
]) {
  expect(!source.includes(forbidden), `Book recovery module contains forbidden physical operation surface: ${forbidden}`);
}
expect(!source.includes('PROSE'), 'retired PROSE must not enter recovery profile');

// Confirm the canonical component architecture still assigns recovery semantics to COMP-12.
const comp12 = (architecture.components || []).find(c => c.component_id === 'BOOK-COMP-12');
expect(Boolean(comp12), 'BOOK-COMP-12 missing from component architecture');
expect(String(comp12.component_name || comp12.name || '').includes('RECOVERY') || JSON.stringify(comp12).includes('recovery'), 'COMP-12 recovery purpose');
expect(JSON.stringify(comp12).includes('CORE'), 'COMP-12 CORE delegation');

// Confirm higher-ledger ENG-009 remains split-owned rather than being silently closed.
const eng009 = JSON.stringify(higherLedger).includes('BOOK-ENG-009-SEMANTIC-RECOVERY-PROFILE-001') || JSON.stringify(higherLedger).includes('ENG-009');
expect(eng009, 'higher-ledger ENG-009 binding');
expect(JSON.stringify(higherLedger).includes('PROMOTED_SHARED_CRITICAL_WITH_SPLIT_OWNERSHIP'), 'ENG-009 split-ownership standing');

// Existing 227 binding must still preserve P19 physical peer dependencies and selected objective non-claim.
const peerRows = lifecycleBinding.status_bindings?.PEER_DEPENDENCY || [];
for (const id of ['P19-01','P19-03','P19-04','P19-05']) expect(peerRows.includes(id), `canonical P19 CORE peer dependency drift: ${id}`);
expect(JSON.stringify(lifecycleBinding).includes('BOOK-ENG-009'), 'lifecycle binding selected-objective preservation');

let output;
try {
  output = cp.execFileSync(process.execPath, [TEST_PATH], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (err) {
  const stderr = err.stderr ? String(err.stderr) : '';
  const stdout = err.stdout ? String(err.stdout) : '';
  fail(`focused test failed\n${stdout}\n${stderr}`);
}
expect(output.includes('BOOK_RECOVERY_BACKUP_RESTORE_PROFILE_001_TESTS_PASS'), 'focused test sentinel missing');

console.log('BOOK_RECOVERY_BACKUP_RESTORE_PROFILE_001_QUALIFY_PASS');
console.log(JSON.stringify({
  result: 'PASS',
  objective_id: contract.objective_id,
  component_id: contract.component_id,
  p19_operations_bound: contract.bound_lifecycle_operations.length,
  book_semantic_layer_qualified: true,
  core_physical_provider_bound: false,
  whole_objective_complete: false,
  physical_backup_restore_implemented_in_book: false
}));
