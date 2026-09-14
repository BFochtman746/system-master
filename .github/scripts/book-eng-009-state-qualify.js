'use strict';

const fs = require('fs');

const controlPath = 'qualification/book-system/BOOK-SYSTEM-CONTROL-RECORD-016.json';
const statePath = 'qualification/book-system/BOOK-SYSTEM-RECONCILED-STATE-046.json';
const authorityPath = 'governance/CURRENT-AUTHORITY.json';
const requiredEvidence = [
  'qualification/book-system/lifecycle/BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-002.json',
  'qualification/book-system/recovery/BOOK-SEMANTIC-RECOVERY-PROFILE-001.json',
  'qualification/book-system/recovery/BOOK-SEMANTIC-OFFLINE-CONTINUITY-001.json',
  'qualification/book-system/recovery/BOOK-ENG-009-CONCURRENT-IMPLEMENTATION-RECONCILIATION-001.json',
  'system-master/book-system/book-semantic-recovery-profile.js',
  'system-master/book-system/book-semantic-recovery-profile.test.js',
  'system-master/book-system/book-semantic-offline-continuity.js',
  'system-master/book-system/book-semantic-offline-continuity.test.js'
];

function fail(message) { process.stderr.write(`BOOK_ENG_009_STATE_QUALIFY_FAIL: ${message}\n`); process.exit(1); }
function assert(condition, message) { if (!condition) fail(message); }
function readJson(path) { try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch (error) { fail(`cannot read ${path}: ${error.message}`); } }

for (const path of [controlPath, statePath, authorityPath, ...requiredEvidence]) assert(fs.existsSync(path), `missing ${path}`);
const control = readJson(controlPath);
const state = readJson(statePath);
const authority = readJson(authorityPath);
const binding = readJson('qualification/book-system/lifecycle/BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-002.json');
const profile = readJson('qualification/book-system/recovery/BOOK-SEMANTIC-RECOVERY-PROFILE-001.json');

assert(control.control_record_id === 'BOOK-SYSTEM-CONTROL-RECORD-016', 'control id drift');
assert(state.state_id === 'BOOK-SYSTEM-RECONCILED-STATE-046', 'state id drift');
assert(state.control_record === controlPath, 'state/control mismatch');
assert(control.current_authority_id === 'CURRENT-AUTHORITY-005' && authority.authority_id === 'CURRENT-AUTHORITY-005', 'authority id drift');
assert(authority.book_control_record === 'qualification/book-system/BOOK-SYSTEM-CONTROL-RECORD-015.json', 'global selector unexpectedly changed Book control');
assert(authority.book_current_state_record === 'qualification/book-system/BOOK-SYSTEM-RECONCILED-STATE-045.json', 'global selector unexpectedly changed Book state');
assert(control.global_selector_status === 'NOT_SELECTED_BY_CURRENT_AUTHORITY__COORDINATED_PROMOTION_DEFERRED', 'control selector standing drift');
assert(state.selector_promotion?.performed === false, 'state must not claim selector promotion');
assert(control.completion_truth?.book_complete === false, 'false Book completion');
assert(control.completion_truth?.book_eng_009_whole_objective_complete === false, 'false ENG-009 completion');
assert(state.completion_truth?.BOOK === 'INCOMPLETE', 'Book state completion drift');
assert(state.completion_truth?.PROSE === 'COMPLETE_RETIRED_TERMINAL', 'PROSE retirement drift');
assert(control.book_eng_009_state?.state === 'BLOCKED_ON_CORE_P03_PUBLIC_DURABILITY_OPERATION_REGISTRATION', 'ENG-009 blocker drift');
assert(control.book_eng_009_state?.book_owned_work_status === 'QUALIFIED', 'Book-owned ENG-009 work not qualified');
assert(profile.core_p03_dependency?.registration_state === 'REQUIRED_PROVIDER_REGISTRATION_OPEN', 'CORE provider blocker no longer open or drifted');
assert(profile.core_p03_dependency?.no_operation_id_invented_by_book === true, 'Book may not invent CORE operation');
assert(binding.effective_summary?.overall?.IMPLEMENTED === 3, 'implemented count drift');
assert(binding.effective_summary?.overall?.PARTIAL === 51, 'partial count drift');
assert(binding.effective_summary?.overall?.UNIMPLEMENTED === 117, 'unimplemented count drift');
assert(binding.effective_summary?.overall?.PEER_DEPENDENCY === 37, 'peer count drift');
assert(binding.effective_summary?.overall?.['HUMAN/EXTERNAL'] === 19, 'human/external count drift');
assert(binding.effective_summary?.preservation_phase?.UNIMPLEMENTED === 0, 'P19 Book-owned unimplemented residual unexpectedly present');
assert(binding.effective_summary?.preservation_phase?.PEER_DEPENDENCY === 4, 'P19 CORE peer dependency count drift');
assert(control.exact_qualification_evidence?.qualified_head_sha === 'bc0b529fdf4fe9ac1a7d14d7d2900a9dcce89d25', 'qualified head drift');
assert(control.exact_qualification_evidence?.required_verification_run_id === 34870407643, 'required verification run drift');
assert(control.exact_qualification_evidence?.required_verification_job_id === 104065042606, 'required verification job drift');
assert(control.exact_qualification_evidence?.conclusion === 'success', 'qualification conclusion drift');
assert(control.exact_qualification_evidence?.verify_summary?.pass === 32 && control.exact_qualification_evidence?.verify_summary?.fail === 0 && control.exact_qualification_evidence?.verify_summary?.skip === 1, 'verification summary drift');
assert(state.next_dependency_valid_action?.owner === 'SYSTEM_MASTER/CORE', 'next dependency owner drift');
assert(/registered public COMMAND/i.test(state.next_dependency_valid_action?.dependency || ''), 'registered CORE COMMAND dependency missing');
assert((control.non_claims || []).some(x => /not whole-objective complete/i.test(x)), 'ENG-009 non-closure claim missing');
assert((control.non_claims || []).some(x => /not selected by CURRENT-AUTHORITY/i.test(x)), 'selector non-claim missing');

console.log(JSON.stringify({
  status:'PASS',
  qualifier:'BOOK-ENG-009-STATE-001',
  control:control.control_record_id,
  state:state.state_id,
  book_complete:false,
  eng009:'BOOK_OWNED_SCOPE_QUALIFIED__CORE_P03_PROVIDER_BLOCKED',
  global_selector:'UNCHANGED_015_045',
  sentinel:'BOOK_ENG_009_STATE_QUALIFY_PASS'
}));
console.log('BOOK_ENG_009_STATE_QUALIFY_PASS');
