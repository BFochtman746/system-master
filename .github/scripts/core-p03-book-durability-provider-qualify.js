'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

const reservedPath = 'governance/contracts/CORE-P03-PUBLIC-DURABILITY-OPERATIONS-001.json';
const activePath = 'governance/contracts/CORE-P03-PUBLIC-DURABILITY-OPERATIONS-002.json';
const implementationPath = 'control-gateway/python/a01_book_durability_provider.py';
const testPath = 'control-gateway/python/test_a01_book_durability_provider.py';
const crosswalkPath = 'governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json';
const blueprintPath = 'governance/architecture/SYSTEM-MASTER-SYSTEM-INTERFACE-BLUEPRINT-001.json';
const bookProfilePath = 'qualification/book-system/recovery/BOOK-SEMANTIC-RECOVERY-PROFILE-001.json';
const bookRuntimePath = 'system-master/book-system/book-semantic-recovery-profile.js';

function fail(message) {
  process.stderr.write(`CORE_P03_BOOK_DURABILITY_PROVIDER_QUALIFY_FAIL: ${message}\n`);
  process.exit(1);
}
function assert(condition, message) { if (!condition) fail(message); }
function readJson(path) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); }
  catch (error) { fail(`cannot read ${path}: ${error.message}`); }
}
function oneByRole(registry, role) {
  const matches = (registry.operations || []).filter(op => op.semantic_role === role);
  assert(matches.length === 1, `${registry.registry_id} must contain exactly one ${role}`);
  return matches[0];
}

for (const path of [reservedPath, activePath, implementationPath, testPath, crosswalkPath, blueprintPath, bookProfilePath, bookRuntimePath]) {
  assert(fs.existsSync(path), `missing ${path}`);
}

const reserved = readJson(reservedPath);
const active = readJson(activePath);
const crosswalk = readJson(crosswalkPath);
const blueprint = readJson(blueprintPath);
const bookProfile = readJson(bookProfilePath);
const bookRuntime = fs.readFileSync(bookRuntimePath, 'utf8');
const implementation = fs.readFileSync(implementationPath, 'utf8');

assert(reserved.registry_id === 'CORE-P03-PUBLIC-DURABILITY-OPERATIONS-001', 'reserved registry id drift');
assert(active.registry_id === 'CORE-P03-PUBLIC-DURABILITY-OPERATIONS-002', 'active registry id drift');
assert(active.supersedes === reservedPath, 'active registry predecessor drift');
assert(active.authority_id === 'CURRENT-AUTHORITY-005', 'authority drift');
assert(active.provider_system === 'CORE' && active.owner_path === 'SYSTEM_MASTER/CORE', 'CORE owner drift');
assert(active.domain === 'P03', 'P03 domain drift');

const p03 = (crosswalk.platform_requirements || []).find(row => row.platform_id === 'P03');
assert(p03, 'current crosswalk missing P03');
assert(p03.owner_path === 'SYSTEM_MASTER/CORE', 'current crosswalk P03 owner is not CORE');
assert(/Evidence store and retention/i.test(p03.requirement || ''), 'current crosswalk P03 meaning drift');
assert(blueprint.operation_identity?.unregistered_cross_peer_operation === 'FORBIDDEN', 'unregistered operation prohibition drift');
assert(blueprint.database_and_state_ownership?.physical_persistence_mechanics_owner === 'CORE', 'physical persistence owner drift');
assert(blueprint.database_and_state_ownership?.physical_persistence_does_not_transfer_semantic_ownership === true, 'semantic ownership fence drift');
assert(/CORE may provide generic physical backup\/restore mechanics/i.test(blueprint.database_and_state_ownership?.backup_restore_rule || ''), 'backup/restore rule drift');

const roles = ['PRESERVE_PHYSICAL_SET', 'RESTORE_PHYSICAL_SET'];
const operationIds = new Set();
for (const role of roles) {
  const r0 = oneByRole(reserved, role);
  const r1 = oneByRole(active, role);
  assert(r0.registration_state === 'REGISTERED_RESERVED', `${role} predecessor was not reserved before activation`);
  assert(r0.operation_id === r1.operation_id, `${role} operation identity changed across activation`);
  assert(r1.registration_state === 'REGISTERED_ACTIVE', `${role} is not REGISTERED_ACTIVE`);
  assert(r1.provider_system === 'CORE' && r1.owner_path === 'SYSTEM_MASTER/CORE', `${role} owner drift`);
  assert(r1.domain === 'P03' && r1.kind === 'COMMAND', `${role} domain/kind drift`);
  assert(/^CORE\.P03\.COMMAND\.[A-Z][A-Z0-9_]*$/.test(r1.operation_id), `${role} operation id invalid`);
  assert(r1.canonical_write_authority === false && r1.direct_book_state_write === false, `${role} grants forbidden Book write authority`);
  assert(!operationIds.has(r1.operation_id), `duplicate operation id ${r1.operation_id}`);
  operationIds.add(r1.operation_id);
  assert(implementation.includes(r1.operation_id), `${role} operation id missing from CORE implementation`);
}
assert(operationIds.size === 2, 'expected exactly two unique public operation ids');

assert(active.implementation === implementationPath, 'implementation pointer drift');
assert(active.focused_tests === testPath, 'focused test pointer drift');
assert(active.runtime_contract?.canonical_effect_allowed === false, 'runtime canonical effect fence missing');
assert(active.runtime_contract?.direct_cross_peer_database_access === false, 'runtime direct DB fence missing');
assert(active.runtime_contract?.preserve_idempotency === 'EXACT_EXISTING_PHYSICAL_MANIFEST_RECONCILED_BEFORE_SOURCE_RETOUCH', 'preserve retry reconciliation contract missing');
assert(active.runtime_contract?.restore_idempotency === 'EXACT_EXISTING_RESTORE_RECEIPT_RECONCILED_BEFORE_DUPLICATE_DESTRUCTIVE_SIDE_EFFECT', 'restore retry reconciliation contract missing');
assert(active.runtime_contract?.destructive_restore_scope === 'CORE_DERIVED_TEST_TARGET_ONLY__CALLER_CANNOT_SELECT_DELETE_PATH', 'restore delete-path authority fence missing');

assert(bookProfile.owner_path === 'SYSTEM_MASTER/BOOK' && bookProfile.component_id === 'BOOK-COMP-12', 'Book semantic owner drift');
assert((bookProfile.ownership_boundary?.core_owns || []).some(x => /physical persistence mechanics/i.test(x)), 'Book profile no longer delegates physical persistence to CORE');
assert((bookProfile.ownership_boundary?.forbidden || []).some(x => /BOOK implementing a second physical backup/i.test(x)), 'Book second-backup-platform prohibition missing');
assert(bookProfile.core_p03_dependency?.provider_domain === 'P03', 'Book CORE provider domain drift');
assert((bookProfile.core_p03_dependency?.required_semantic_roles || []).includes('PRESERVE_PHYSICAL_SET'), 'Book preserve role drift');
assert((bookProfile.core_p03_dependency?.required_semantic_roles || []).includes('RESTORE_PHYSICAL_SET'), 'Book restore role drift');
assert(bookRuntime.includes("registration.registration_state !== 'REGISTERED_ACTIVE'"), 'Book runtime no longer requires active provider registration');
assert(bookRuntime.includes('/^CORE\\.P03\\.COMMAND\\.[A-Z][A-Z0-9_]*$/'), 'Book runtime CORE/P03 operation identity fence drift');

const python = process.env.PYTHON || process.env.PYTHON3 || 'python3';
const testResult = spawnSync(python, ['-m', 'unittest', '-v', 'test_a01_book_durability_provider.py'], {
  cwd: 'control-gateway/python',
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe']
});
if (testResult.status !== 0) {
  process.stderr.write(testResult.stdout || '');
  process.stderr.write(testResult.stderr || '');
  process.exit(testResult.status || 1);
}
const testLog = `${testResult.stdout || ''}\n${testResult.stderr || ''}`;
assert(/Ran 14 tests/.test(testLog), 'focused test count must be exactly 14');
assert(/\nOK\s*$/.test(testLog), 'focused Python tests did not finish OK');

console.log(JSON.stringify({
  status: 'PASS',
  qualifier: 'CORE-P03-PUBLIC-DURABILITY-OPERATIONS-002',
  provider: 'CORE',
  domain: 'P03',
  operations: Array.from(operationIds).sort(),
  focused_tests: 14,
  book_physical_backup_implementation: false,
  book_consumer_binding: 'OPEN',
  sentinel: 'CORE_P03_BOOK_DURABILITY_PROVIDER_QUALIFY_PASS'
}));
