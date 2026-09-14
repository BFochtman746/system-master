'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

const profilePath = 'qualification/book-system/recovery/BOOK-SEMANTIC-RECOVERY-PROFILE-001.json';
const runtimePath = 'system-master/book-system/book-semantic-recovery-profile.js';
const testPath = 'system-master/book-system/book-semantic-recovery-profile.test.js';

function fail(message) {
  process.stderr.write(`BOOK_SEMANTIC_RECOVERY_PROFILE_QUALIFY_FAIL: ${message}\n`);
  process.exit(1);
}
function assert(condition, message) { if (!condition) fail(message); }
function readJson(path) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); }
  catch (error) { fail(`cannot read ${path}: ${error.message}`); }
}

for (const file of [profilePath, runtimePath, testPath]) assert(fs.existsSync(file), `missing ${file}`);
const profile = readJson(profilePath);
assert(profile.profile_id === 'BOOK-SEMANTIC-RECOVERY-PROFILE-001', 'profile id drift');
assert(profile.objective_id === 'BOOK-ENG-009-SEMANTIC-RECOVERY-PROFILE-001', 'objective id drift');
assert(profile.owner_path === 'SYSTEM_MASTER/BOOK' && profile.component_id === 'BOOK-COMP-12', 'owner/component drift');
assert(profile.lifecycle_phase === 'PRESERVATION' && profile.completion_gate === 'PRESERVATION_COMPLETE', 'lifecycle binding drift');
assert(profile.core_p03_dependency?.provider_system === 'CORE', 'CORE provider drift');
assert(profile.core_p03_dependency?.provider_domain === 'P03', 'CORE/P03 domain drift');
assert(profile.core_p03_dependency?.registration_state === 'REQUIRED_PROVIDER_REGISTRATION_OPEN', 'must not claim nonexistent CORE registration');
assert(profile.core_p03_dependency?.no_operation_id_invented_by_book === true, 'BOOK may not invent CORE public operation id');
assert((profile.ownership_boundary?.forbidden || []).some(x => /second physical backup/i.test(x)), 'second backup platform prohibition missing');
assert((profile.ownership_boundary?.forbidden || []).some(x => /directly reading or writing CORE-private/i.test(x)), 'direct CORE storage access prohibition missing');
assert((profile.ownership_boundary?.forbidden || []).some(x => /active PROSE/i.test(x)), 'PROSE retirement fence missing');
assert((profile.restore_acceptance_invariants || []).some(x => /may not satisfy the current PRESERVATION gate or overwrite current state/i.test(x)), 'historical restore currentness fence missing');
assert(profile.p19_binding?.['P19-01']?.startsWith('PEER_DEPENDENCY__CORE'), 'P19-01 physical ownership drift');
assert(profile.p19_binding?.['P19-03']?.startsWith('PEER_DEPENDENCY__CORE'), 'P19-03 physical ownership drift');
assert(profile.p19_binding?.['P19-04']?.startsWith('PEER_DEPENDENCY__CORE'), 'P19-04 physical ownership drift');
assert(profile.p19_binding?.['P19-05']?.startsWith('PEER_DEPENDENCY__CORE'), 'P19-05 physical ownership drift');
assert((profile.non_claims || []).some(x => /does not implement physical storage/i.test(x)), 'physical-mechanics non-claim missing');
assert((profile.non_claims || []).some(x => /does not make Book complete/i.test(x)), 'Book completion non-claim missing');

const result = spawnSync(process.execPath, [testPath], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
if (result.status !== 0) {
  process.stderr.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  process.exit(result.status || 1);
}
if (!String(result.stdout || '').includes('BOOK_SEMANTIC_RECOVERY_PROFILE_TESTS_PASS')) fail('test pass sentinel missing');

console.log(JSON.stringify({
  status: 'PASS',
  qualifier: 'BOOK-SEMANTIC-RECOVERY-PROFILE-001',
  objective: profile.objective_id,
  component: profile.component_id,
  phase: profile.lifecycle_phase,
  gate: profile.completion_gate,
  core_provider_registration: profile.core_p03_dependency.registration_state,
  sentinel: 'BOOK_SEMANTIC_RECOVERY_PROFILE_TESTS_PASS'
}));
