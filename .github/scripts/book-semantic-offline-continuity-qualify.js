'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

const contractPath = 'qualification/book-system/recovery/BOOK-SEMANTIC-OFFLINE-CONTINUITY-001.json';
const profilePath = 'qualification/book-system/recovery/BOOK-SEMANTIC-RECOVERY-PROFILE-001.json';
const reconciliationPath = 'qualification/book-system/recovery/BOOK-ENG-009-CONCURRENT-IMPLEMENTATION-RECONCILIATION-001.json';
const runtimePath = 'system-master/book-system/book-semantic-offline-continuity.js';
const testPath = 'system-master/book-system/book-semantic-offline-continuity.test.js';

function fail(message) { process.stderr.write(`BOOK_SEMANTIC_OFFLINE_CONTINUITY_QUALIFY_FAIL: ${message}\n`); process.exit(1); }
function assert(condition, message) { if (!condition) fail(message); }
function readJson(path) { try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch (error) { fail(`cannot read ${path}: ${error.message}`); } }

for (const file of [contractPath, profilePath, reconciliationPath, runtimePath, testPath]) assert(fs.existsSync(file), `missing ${file}`);
const contract = readJson(contractPath);
const profile = readJson(profilePath);
const reconciliation = readJson(reconciliationPath);

assert(contract.contract_id === 'BOOK-SEMANTIC-OFFLINE-CONTINUITY-001', 'contract id drift');
assert(contract.owner_path === 'SYSTEM_MASTER/BOOK' && contract.component_id === 'BOOK-COMP-12', 'owner/component drift');
assert(contract.objective_id === 'BOOK-ENG-009-SEMANTIC-RECOVERY-PROFILE-001', 'objective drift');
assert(contract.extends_profile === profilePath && profile.profile_id === 'BOOK-SEMANTIC-RECOVERY-PROFILE-001', 'canonical profile extension drift');
assert(contract.reconciliation_ref === reconciliationPath, 'reconciliation reference drift');
assert(reconciliation.divergent_branch?.head_sha === '6e7b7f8b7679812060a51baded7cf8de076f1fee', 'reviewed branch subject drift');
assert(reconciliation.divergent_branch?.status === 'NON_CURRENT_ALTERNATIVE__DO_NOT_MERGE_AS_CANONICAL', 'divergent branch standing drift');
assert((reconciliation.rejected_or_not_admitted || []).some(x => x.item === 'CORE.DURABILITY.BOOK_RECOVERY.v1'), 'stale conceptual CORE namespace rejection missing');
assert(profile.core_p03_dependency?.provider_domain === 'P03', 'canonical CORE/P03 boundary drift');
assert(profile.core_p03_dependency?.registration_state === 'REQUIRED_PROVIDER_REGISTRATION_OPEN', 'CORE provider blocker must remain open');
assert(profile.core_p03_dependency?.no_operation_id_invented_by_book === true, 'Book must not invent CORE operation');
assert((contract.offline_session_invariants || []).some(x => /never auto-applied/i.test(x)), 'no-auto-apply invariant missing');
assert((contract.offline_session_invariants || []).some(x => /RECONCILIATION_REQUIRED/i.test(x)), 'divergent reconnect rule missing');
assert((contract.retention_invariants || []).some(x => /CORE owns physical retention/i.test(x)), 'CORE physical retention ownership missing');
assert((contract.lineage_reentry_invariants || []).some(x => /do not grant release, distribution or canonical mutation authority/i.test(x)), 'lineage authority fence missing');
assert((contract.non_claims || []).some(x => /does not close the four CORE-owned P19 physical dependencies/i.test(x)), 'CORE P19 non-claim missing');

const result = spawnSync(process.execPath, [testPath], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
if (result.status !== 0) {
  process.stderr.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  process.exit(result.status || 1);
}
if (!String(result.stdout || '').includes('BOOK_SEMANTIC_OFFLINE_CONTINUITY_TESTS_PASS')) fail('test sentinel missing');

console.log(JSON.stringify({
  status:'PASS',
  qualifier:'BOOK-SEMANTIC-OFFLINE-CONTINUITY-001',
  objective:contract.objective_id,
  component:contract.component_id,
  divergent_branch_disposition:reconciliation.divergent_branch.status,
  core_provider_registration:profile.core_p03_dependency.registration_state,
  sentinel:'BOOK_SEMANTIC_OFFLINE_CONTINUITY_TESTS_PASS'
}));
