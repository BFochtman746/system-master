'use strict';

const fs = require('fs');

const authorityPath = 'governance/CURRENT-AUTHORITY.json';
const controlPath = 'qualification/book-system/BOOK-SYSTEM-CONTROL-RECORD-017.json';
const statePath = 'qualification/book-system/BOOK-SYSTEM-RECONCILED-STATE-047.json';
const bindingPath = 'qualification/book-system/lifecycle/BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-003.json';
const providerPath = 'governance/contracts/CORE-P03-PUBLIC-DURABILITY-OPERATIONS-002.json';
const higherLedgerPath = 'qualification/book-system/BOOK-HIGHER-LEDGER-008-010-DISPOSITION-001.json';
const endToEndQualifierPath = '.github/scripts/book-core-p03-end-to-end-qualify.js';

function fail(message) { process.stderr.write(`BOOK_ENG_009_CLOSURE_STATE_QUALIFY_FAIL: ${message}\n`); process.exit(1); }
function assert(condition, message) { if (!condition) fail(message); }
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { fail(`cannot read ${file}: ${error.message}`); } }

for (const file of [authorityPath, controlPath, statePath, bindingPath, providerPath, higherLedgerPath, endToEndQualifierPath]) {
  assert(fs.existsSync(file), `missing ${file}`);
}

const authority = readJson(authorityPath);
const control = readJson(controlPath);
const state = readJson(statePath);
const binding = readJson(bindingPath);
const provider = readJson(providerPath);
const higher = readJson(higherLedgerPath);

assert(authority.authority_id === 'CURRENT-AUTHORITY-005', 'authority drift');
assert(authority.book_control_record === 'qualification/book-system/BOOK-SYSTEM-CONTROL-RECORD-015.json', 'global Book control selector unexpectedly changed');
assert(authority.book_current_state_record === 'qualification/book-system/BOOK-SYSTEM-RECONCILED-STATE-045.json', 'global Book state selector unexpectedly changed');
assert(control.control_record_id === 'BOOK-SYSTEM-CONTROL-RECORD-017', 'control id drift');
assert(state.state_id === 'BOOK-SYSTEM-RECONCILED-STATE-047', 'state id drift');
assert(state.control_record === controlPath, 'state/control mismatch');
assert(binding.binding_id === 'BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-003', 'binding id drift');
assert(control.implementation_binding === bindingPath, 'control/binding mismatch');
assert(control.completion_truth?.book_complete === false, 'false Book completion');
assert(control.completion_truth?.book_eng_009_whole_objective_complete === true, 'ENG-009 not closed in control');
assert(state.completion_truth?.BOOK === 'INCOMPLETE', 'Book state falsely complete');
assert(state.completion_truth?.BOOK_ENG_009 === 'COMPLETE_WITH_EXACT_CURRENT_END_TO_END_PROVIDER_EVIDENCE', 'ENG-009 state closure drift');
assert(state.completion_truth?.PRODUCTION_CERTIFICATION === 'NO', 'false production certification');
assert(binding.exact_qualification_evidence?.qualified_head_sha === 'c760dc0c22ba329499ccd0ccb0b60c35b6ab2ed3', 'qualified subject drift');
assert(binding.exact_qualification_evidence?.required_verification_run_id === 34882444676, 'Required Verification run drift');
assert(binding.exact_qualification_evidence?.required_verification_job_id === 104104774721, 'Required Verification job drift');
assert(binding.exact_qualification_evidence?.conclusion === 'success', 'qualification conclusion drift');
assert(binding.exact_qualification_evidence?.verify_summary?.pass === 35 && binding.exact_qualification_evidence?.verify_summary?.fail === 0 && binding.exact_qualification_evidence?.verify_summary?.skip === 1, 'verification summary drift');
assert(binding.exact_qualification_evidence?.non_vacuous === 'PASS', 'non-vacuous evidence missing');

assert(provider.registry_id === 'CORE-P03-PUBLIC-DURABILITY-OPERATIONS-002', 'provider registry drift');
assert(provider.provider_system === 'CORE' && provider.owner_path === 'SYSTEM_MASTER/CORE' && provider.domain === 'P03', 'provider ownership drift');
const preserve = (provider.operations || []).filter(x => x.semantic_role === 'PRESERVE_PHYSICAL_SET');
const restore = (provider.operations || []).filter(x => x.semantic_role === 'RESTORE_PHYSICAL_SET');
assert(preserve.length === 1 && preserve[0].operation_id === 'CORE.P03.COMMAND.PRESERVE_PHYSICAL_SET' && preserve[0].kind === 'COMMAND' && preserve[0].registration_state === 'REGISTERED_ACTIVE', 'preserve provider registration drift');
assert(restore.length === 1 && restore[0].operation_id === 'CORE.P03.COMMAND.RESTORE_PHYSICAL_SET' && restore[0].kind === 'COMMAND' && restore[0].registration_state === 'REGISTERED_ACTIVE', 'restore provider registration drift');
assert(preserve[0].canonical_write_authority === false && restore[0].canonical_write_authority === false, 'CORE provider gained Book canonical write authority');

const overall = binding.effective_summary?.overall || {};
assert(overall.IMPLEMENTED === 3 && overall.PARTIAL === 51 && overall.UNIMPLEMENTED === 117 && overall.PEER_DEPENDENCY === 37 && overall['HUMAN/EXTERNAL'] === 19 && overall.total === 227, '227 binding classification drift');
const p = binding.effective_summary?.preservation_phase || {};
assert(p.IMPLEMENTED === 2 && p.PARTIAL === 2 && p.UNIMPLEMENTED === 0 && p.PEER_DEPENDENCY === 4 && p['HUMAN/EXTERNAL'] === 0 && p.total === 8, 'P19 classification drift');
for (const id of ['P19-01','P19-03','P19-04','P19-05']) {
  assert(binding.preservation_peer_dependencies?.[id]?.status === 'PEER_DEPENDENCY', `${id} ownership classification drift`);
  assert(binding.preservation_peer_dependencies?.[id]?.provider === 'CORE', `${id} provider drift`);
  assert(binding.preservation_peer_dependencies?.[id]?.provider_satisfaction === 'QUALIFIED_CURRENT', `${id} provider satisfaction missing`);
}

assert(control.next_dependency_valid_action?.owner === 'SYSTEM_MASTER/BOOK', 'next owner drift');
assert(control.next_dependency_valid_action?.component_id === 'BOOK-COMP-13', 'next component drift');
assert(state.next_dependency_valid_action?.component_id === 'BOOK-COMP-13', 'state next component drift');
const eng010 = (higher.dispositions || []).find(x => x.id === 'BOOK-ENG-010');
assert(eng010?.current_disposition === 'REMOVE_FROM_CRITICAL_PATH_AND_REPLACE', 'BOOK-ENG-010 disposition drift');
assert(eng010?.canonical_component === 'BOOK-COMP-13', 'BOOK-ENG-010 replacement component drift');
assert(control.next_dependency_valid_action?.forbidden_revival === 'PERMANENT_BOOK_ENG_010_MEGA_COMPARISON_PROGRAM', 'mega-comparison revival fence missing');

console.log(JSON.stringify({
  status: 'PASS',
  qualifier: 'BOOK-ENG-009-CLOSURE-STATE-001',
  control: control.control_record_id,
  state: state.state_id,
  binding: binding.binding_id,
  book_complete: false,
  eng009: 'COMPLETE_WITH_EXACT_CURRENT_END_TO_END_PROVIDER_EVIDENCE',
  next_component: 'BOOK-COMP-13',
  global_selector: 'UNCHANGED_015_045',
  sentinel: 'BOOK_ENG_009_CLOSURE_STATE_QUALIFY_PASS'
}));
console.log('BOOK_ENG_009_CLOSURE_STATE_QUALIFY_PASS');
