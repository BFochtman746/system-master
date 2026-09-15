'use strict';

const fs = require('fs');

const authorityPath = 'governance/CURRENT-AUTHORITY.json';
const controlPath = 'qualification/book-system/BOOK-SYSTEM-CONTROL-RECORD-017.json';
const statePath = 'qualification/book-system/BOOK-SYSTEM-RECONCILED-STATE-047.json';
const priorControlPath = 'qualification/book-system/BOOK-SYSTEM-CONTROL-RECORD-015.json';
const bindingPath = 'qualification/book-system/lifecycle/BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-003.json';
const registryPath = 'governance/contracts/CORE-P03-PUBLIC-DURABILITY-OPERATIONS-002.json';
const e2eQualifierPath = '.github/scripts/book-core-p03-end-to-end-qualify.js';
const providerQualifierPath = '.github/scripts/core-p03-book-durability-provider-qualify.js';

function fail(message) { process.stderr.write(`BOOK_ENG_009_STATE_QUALIFY_FAIL: ${message}\n`); process.exit(1); }
function assert(condition, message) { if (!condition) fail(message); }
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { fail(`cannot read ${file}: ${error.message}`); } }

for (const file of [authorityPath, controlPath, statePath, priorControlPath, bindingPath, registryPath, e2eQualifierPath, providerQualifierPath]) {
  assert(fs.existsSync(file), `missing ${file}`);
}

const authority = readJson(authorityPath);
const control = readJson(controlPath);
const state = readJson(statePath);
const priorControl = readJson(priorControlPath);
const binding = readJson(bindingPath);
const registry = readJson(registryPath);

assert(authority.authority_id === 'CURRENT-AUTHORITY-005', 'authority id drift');
assert(authority.book_control_record === 'qualification/book-system/BOOK-SYSTEM-CONTROL-RECORD-015.json', 'global Book control selector unexpectedly changed');
assert(authority.book_current_state_record === 'qualification/book-system/BOOK-SYSTEM-RECONCILED-STATE-045.json', 'global Book state selector unexpectedly changed');

assert(control.control_record_id === 'BOOK-SYSTEM-CONTROL-RECORD-017', 'control id drift');
assert(state.state_id === 'BOOK-SYSTEM-RECONCILED-STATE-047', 'state id drift');
assert(state.control_record === controlPath, 'state/control mismatch');
assert(control.current_authority_id === authority.authority_id, 'control authority drift');
assert(state.current_authority_id === authority.authority_id, 'state authority drift');
assert(control.global_selector_status === 'NOT_SELECTED_BY_CURRENT_AUTHORITY__COORDINATED_PROMOTION_DEFERRED', 'control selector standing drift');
assert(state.selector_promotion?.performed === false, 'state must not claim selector promotion');
assert(state.selector_promotion?.current_global_control_remains === authority.book_control_record, 'state global control selector drift');
assert(state.selector_promotion?.current_global_state_remains === authority.book_current_state_record, 'state global state selector drift');

assert(control.completion_truth?.book_complete === false, 'false Book completion');
assert(control.completion_truth?.book_eng_009_whole_objective_complete === true, 'ENG-009 closure missing from control');
assert(state.completion_truth?.BOOK === 'INCOMPLETE', 'Book state completion drift');
assert(state.completion_truth?.PROSE === 'COMPLETE_RETIRED_TERMINAL', 'PROSE retirement drift');
assert(state.completion_truth?.BOOK_ENG_009 === 'COMPLETE_WITH_EXACT_CURRENT_END_TO_END_PROVIDER_EVIDENCE', 'ENG-009 state completion drift');
assert(control.book_eng_009_state?.state === 'COMPLETE_WITH_EXACT_CURRENT_END_TO_END_PROVIDER_EVIDENCE', 'ENG-009 control state drift');
assert(control.book_eng_009_state?.external_dependency_status === 'SATISFIED_BY_CURRENT_CORE_P03_PROVIDER', 'CORE provider blocker not satisfied');
assert(control.book_eng_009_state?.preserve_operation_id === 'CORE.P03.COMMAND.PRESERVE_PHYSICAL_SET', 'bound preserve operation drift');
assert(control.book_eng_009_state?.restore_operation_id === 'CORE.P03.COMMAND.RESTORE_PHYSICAL_SET', 'bound restore operation drift');
assert(/CORE retains physical durability mechanics/i.test(control.book_eng_009_state?.ownership_rule || ''), 'CORE durability ownership fence missing');

assert(binding.binding_id === 'BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-003', 'implementation binding id drift');
assert(binding.qualified_implementation_subject_sha === 'c760dc0c22ba329499ccd0ccb0b60c35b6ab2ed3', 'binding qualification subject drift');
assert(binding.provider_registry === registryPath, 'binding provider registry drift');
assert(binding.provider_binding?.provider_system === 'CORE' && binding.provider_binding?.owner_path === 'SYSTEM_MASTER/CORE' && binding.provider_binding?.domain === 'P03', 'provider binding owner/domain drift');
assert(binding.provider_binding?.preserve_operation?.operation_id === 'CORE.P03.COMMAND.PRESERVE_PHYSICAL_SET', 'binding preserve operation drift');
assert(binding.provider_binding?.restore_operation?.operation_id === 'CORE.P03.COMMAND.RESTORE_PHYSICAL_SET', 'binding restore operation drift');
assert(binding.provider_binding?.preserve_operation?.registration_state === 'REGISTERED_ACTIVE', 'preserve operation is not registered active');
assert(binding.provider_binding?.restore_operation?.registration_state === 'REGISTERED_ACTIVE', 'restore operation is not registered active');
assert(binding.provider_binding?.book_canonical_write_authority_transferred === false, 'binding transferred Book canonical authority');
assert(binding.provider_binding?.core_book_canonical_write_authority === false, 'CORE gained Book canonical write authority');
assert(binding.preservation_peer_dependencies?.['P19-01']?.provider_satisfaction === 'QUALIFIED_CURRENT', 'P19-01 provider satisfaction missing');
assert(binding.preservation_peer_dependencies?.['P19-03']?.provider_satisfaction === 'QUALIFIED_CURRENT', 'P19-03 provider satisfaction missing');
assert(binding.preservation_peer_dependencies?.['P19-04']?.provider_satisfaction === 'QUALIFIED_CURRENT', 'P19-04 provider satisfaction missing');
assert(binding.preservation_peer_dependencies?.['P19-05']?.provider_satisfaction === 'QUALIFIED_CURRENT', 'P19-05 provider satisfaction missing');
assert(binding.book_comp_12_standing?.whole_component_end_to_end_provider_qualification === 'PASS', 'Book COMP-12 end-to-end provider qualification missing');

assert(registry.registry_id === 'CORE-P03-PUBLIC-DURABILITY-OPERATIONS-002', 'CORE P03 registry id drift');
assert(registry.authority_id === authority.authority_id, 'CORE P03 registry authority drift');
const preserve = (registry.operations || []).filter(x => x.operation_id === 'CORE.P03.COMMAND.PRESERVE_PHYSICAL_SET' && x.semantic_role === 'PRESERVE_PHYSICAL_SET' && x.registration_state === 'REGISTERED_ACTIVE');
const restore = (registry.operations || []).filter(x => x.operation_id === 'CORE.P03.COMMAND.RESTORE_PHYSICAL_SET' && x.semantic_role === 'RESTORE_PHYSICAL_SET' && x.registration_state === 'REGISTERED_ACTIVE');
assert(preserve.length === 1, 'active preserve operation missing or ambiguous');
assert(restore.length === 1, 'active restore operation missing or ambiguous');

const evidence = binding.exact_qualification_evidence || {};
assert(evidence.qualified_head_sha === 'c760dc0c22ba329499ccd0ccb0b60c35b6ab2ed3', 'evidence subject drift');
assert(evidence.required_verification_run_id === 34882444676, 'Required Verification run drift');
assert(evidence.required_verification_job_id === 104104774721, 'Required Verification job drift');
assert(evidence.conclusion === 'success', 'qualification conclusion drift');
assert(evidence.verify_summary?.pass === 35 && evidence.verify_summary?.fail === 0 && evidence.verify_summary?.skip === 1, 'repository verification summary drift');
assert(evidence.non_vacuous === 'PASS', 'non-vacuous evidence missing');
assert(evidence.required_qualifiers?.['core-p03-book-durability-provider-qualify.js'] === 'PASS', 'CORE provider qualifier evidence missing');
assert(evidence.required_qualifiers?.['book-core-p03-end-to-end-qualify.js'] === 'PASS', 'Book/CORE end-to-end qualifier evidence missing');

assert(binding.effective_summary?.overall?.IMPLEMENTED === 3, 'implemented count drift');
assert(binding.effective_summary?.overall?.PARTIAL === 51, 'partial count drift');
assert(binding.effective_summary?.overall?.UNIMPLEMENTED === 117, 'unimplemented count drift');
assert(binding.effective_summary?.overall?.PEER_DEPENDENCY === 37, 'peer dependency count drift');
assert(binding.effective_summary?.overall?.['HUMAN/EXTERNAL'] === 19, 'human/external count drift');
assert(binding.effective_summary?.preservation_phase?.UNIMPLEMENTED === 0, 'P19 unimplemented residual unexpectedly present');
assert(binding.effective_summary?.preservation_phase?.PEER_DEPENDENCY === 4, 'P19 CORE ownership classification drift');

const next = state.next_dependency_valid_action || {};
assert(next.objective_id === null, 'ungrounded successor objective id was invented');
assert(next.residual === 'whole-source build graph/shared Core integration dependencies', 'next preserved residual drift');
assert(Array.isArray(priorControl.preserved_open_residuals) && priorControl.preserved_open_residuals[1] === next.residual, 'next residual is not the next preserved post-ENG-009 residual');
assert(control.next_dependency_valid_action?.residual === next.residual, 'control/state next residual mismatch');
assert(control.next_dependency_valid_action?.objective_id === null, 'control invented successor objective id');
assert(next.later_bounded_qualification_profile === 'BOOK-COMP-13', 'bounded Book qualification profile was lost');
assert(next.forbidden_revival === 'PERMANENT_BOOK_ENG_010_MEGA_COMPARISON_PROGRAM', 'BOOK-ENG-010 no-revival fence missing');
assert((control.non_claims || []).some(x => /BOOK-COMP-13 is not advanced ahead/i.test(x)), 'dependency-order non-claim missing');
assert((control.non_claims || []).some(x => /BOOK-ENG-010 is not revived/i.test(x)), 'BOOK-ENG-010 no-revival non-claim missing');

console.log(JSON.stringify({
  status: 'PASS',
  qualifier: 'BOOK-ENG-009-STATE-002',
  control: control.control_record_id,
  state: state.state_id,
  book_complete: false,
  eng009: 'COMPLETE_WITH_EXACT_CURRENT_END_TO_END_PROVIDER_EVIDENCE',
  core_p03_binding: binding.binding_id,
  global_selector: 'UNCHANGED_015_045',
  next_residual: next.residual,
  sentinel: 'BOOK_ENG_009_STATE_QUALIFY_PASS'
}));
console.log('BOOK_ENG_009_STATE_QUALIFY_PASS');
