'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const bindingRuntime = require('./book-capability-binding-v1');
const bindingSource = require('./book-capability-binding-v1.registry.json');

function runJson(relPath) {
  const abs = path.join(__dirname, relPath);
  const out = cp.execFileSync(process.execPath, [abs], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = out.trim().split(/\r?\n/).filter(Boolean);
  const parsed = JSON.parse(lines[lines.length - 1]);
  assert.strictEqual(parsed.result, 'PASS', `${relPath} must PASS on this exact subject`);
  return parsed;
}

function source(relPath) {
  return fs.readFileSync(path.join(__dirname, relPath), 'utf8');
}

const d1 = runJson('book-capability-binding-v1.test.js');
const d2 = runJson('context-compiler/book-context-compiler-b01-rebind.test.js');
const d3 = runJson('book-execution-foundation-b01.test.js');
const d4 = runJson('book-workflow-runtime-b01.test.js');
const durable = runJson('book-workflow-durable-store.test.js');
const scheduler = runJson('book-workflow-scheduler-runtime.test.js');

const d1Source = source('book-capability-binding-v1.test.js');
const d2Source = source('context-compiler/book-context-compiler-b01-rebind.test.js');
const d3Source = source('book-execution-foundation-b01.test.js');
const d4Source = source('book-workflow-runtime-b01.test.js');
const registry = bindingRuntime.buildRegistry(bindingSource);

const passed = [];
function b01Case(id, requirement, evidence, predicate) {
  assert.strictEqual(typeof predicate, 'boolean', `${id} predicate must be boolean`);
  assert(predicate, `${id} failed: ${requirement} [evidence=${evidence}]`);
  passed.push({ id, requirement, evidence });
}
function has(text, token) { return text.includes(token); }
function mapping(capabilityId) {
  const found = registry.bindings.find(x => x.current_capability_id === capabilityId);
  assert(found, `missing mapping ${capabilityId}`);
  return found;
}

// I01-I24 — executable projections of RB01-RB24. Each projection is backed by a
// direct current-subject suite that is executed above in this same process.
b01Case('I01', 'RB01 current execution owner is Book and retired Prose cannot execute', 'D2+D3', d2.retired_prose_execution_allowed === false && d3.retired_prose_execution_allowed === false);
b01Case('I02', 'RB02 historical/provider identity remains nested provenance, not current owner identity', 'D1 registry', registry.bindings.every(x => x.current_owner_path === 'SYSTEM_MASTER/BOOK' && x.provider_provenance.historical_or_provider_service_id));
b01Case('I03', 'RB03 old PROSE execution IDs remain non-dispatchable', 'legacy scheduler direct regression', scheduler.retired_prose_dispatches === 0);
b01Case('I04', 'RB04 Book capability identity and provider identity are distinct durable fields', 'D1 registry', registry.bindings.every(x => x.current_capability_id.startsWith('BOOK.') && x.provider_provenance.operation_id && x.binding_digest));
b01Case('I05', 'RB05 context binds exact manuscript source identity', 'D2 direct stale-source case', d2.donor_context_package_ready === true && has(d2Source, 'staleSource'));
b01Case('I06', 'RB06 context binds exact Book-state version/digest', 'D2 direct stale-Book case', d2.donor_context_package_ready === true && has(d2Source, 'staleBook'));
b01Case('I07', 'RB07 context binds exact Story-Bible snapshot/digest', 'D2 direct stale-story case', d2.donor_context_package_ready === true && has(d2Source, 'staleStory'));
b01Case('I08', 'RB08 context binds exact service/capability contract identity and fails stale', 'D2 registry-subject case', d2.changed_binding_stales_context === true && has(d2Source, 'wrongRegistrySubject'));
b01Case('I09', 'RB09 unresolved author decisions block execution and are never invented', 'D2 author-required case', has(d2Source, 'authorBlocked') && d4.author_authority_granted === false);
b01Case('I10', 'RB10 durable context excludes raw/private/secret/mutation/publication fields', 'D2+D4 authority fences', has(d2Source, 'rawPrivate') && has(d2Source, 'publicationSecret') && d4.private_authority_granted === false);
b01Case('I11', 'RB11 generation/evaluation/admission context roles remain separated', 'D2 evaluator-role case', has(d2Source, 'evalWrongRole') && d3.evaluator_isolation_satisfied === false);
b01Case('I12', 'RB12 provider path has zero canonical/lifecycle/export/publication authority', 'D1+D3+D4', d1.canonical_effect_allowed === false && d3.canonical_effect_allowed === false && d4.publication_authority_granted === false);
b01Case('I13', 'RB13 Book admission remains the sole terminal canonical mutation authority', 'D4 handoff fence', d4.admission_handoff_canonical_effect === false && has(d4Source, 'SYSTEM_MASTER/BOOK_CANONICAL_CONTENT_ADMISSION'));
b01Case('I14', 'RB14 admission handoff is coordination-only and performs no admission', 'D4 handoff direct suite', d4.admission_handoff_canonical_effect === false && d4.canonical_effect_allowed === false);
b01Case('I15', 'RB15 candidate handoff binds candidate identity/evidence/current binding', 'D4 handoff direct suite', has(d4Source, 'candidate_digest') && has(d4Source, 'capability_binding_digest'));
b01Case('I16', 'RB16 operation identity is semantic and binds current binding/provider identity', 'D3 operation-identity suite', has(d3Source, 'operation_digest') && has(d3Source, 'provider_operation_id'));
b01Case('I17', 'RB17 idempotent same-operation replay preserves exact operation identity', 'D3 retry + legacy scheduler', has(d3Source, 'SAFE_SAME_OPERATION_REPLAY_POLICY') && scheduler.idempotent_unknown_outcome_replayed === true);
b01Case('I18', 'RB18 non-idempotent unknown outcome never auto-replays', 'D3+D4', d3.nonidempotent_unknown_outcome_auto_replay === false && d4.unknown_outcome_redispatched === false);
b01Case('I19', 'RB19 reconciliation distinguishes existing-result/no-effect/unresolved outcomes', 'D3 reconciliation cases', has(d3Source, 'REUSE_OR_REVIEW_EXISTING_RESULT') && has(d3Source, 'NEW_ATTEMPT_AFTER_CONFIRMED_NO_EFFECT_POLICY'));
b01Case('I20', 'RB20 candidate generation remains serial and non-idempotent after rebind', 'D1 registry', mapping('BOOK.LITERARY.GENERATE_REVISION_CANDIDATE').registered_idempotent === false && mapping('BOOK.LITERARY.GENERATE_REVISION_CANDIDATE').concurrency_policy_class === 'SERIAL_ONLY_NONIDEMPOTENT_OR_SIDE_EFFECTING');
b01Case('I21', 'RB21 evaluator execution remains isolation gated', 'D1+D3', registry.bindings.filter(x => x.current_capability_id.startsWith('BOOK.EVALUATION.')).every(x => x.concurrency_policy_class === 'ISOLATION_GATED') && d3.evaluator_isolation_satisfied === false);
b01Case('I22', 'RB22 restart preserves verified work and stale concurrent writes fail closed', 'D4+durable+scheduler', d4.restart_verified_completion_reused === true && durable.optimistic_stale_write_rejection === true && scheduler.completed_tasks_not_redispatched === true);
b01Case('I23', 'RB23 failure/cancel/resume/evidence records preserve coordination-only identity', 'D4 direct suite', has(d4Source, 'createFailureRecord') && has(d4Source, 'createCancellationCheckpoint') && has(d4Source, 'createExecutionReceipt') && d4.canonical_effect_allowed === false);
b01Case('I24', 'RB24 changed B01 bytes require fresh exact-subject isolated+cumulative qualification', 'B01-E exact-subject composition', [d1,d2,d3,d4,durable,scheduler].every(x => x.result === 'PASS') && d4.synthetic_execution_receipts_real_provider_evidence === false);

// M01-M11 — exact positive mapping validation.
const expectedMappings = [
  ['M01','BOOK.LITERARY.ANALYZE_PASSAGE','PROSE_ANALYSIS_AND_REVISION','ANALYZE_PASSAGE_OR_UNIT','GENERATION_CONTEXT',true,'READ_ONLY_PARALLEL_ELIGIBLE'],
  ['M02','BOOK.LITERARY.BUILD_NARRATIVE_STATE','PROSE_ANALYSIS_AND_REVISION','BUILD_NARRATIVE_STATE_PROJECTION','GENERATION_CONTEXT',true,'READ_ONLY_PARALLEL_ELIGIBLE'],
  ['M03','BOOK.LITERARY.DIAGNOSE','PROSE_ANALYSIS_AND_REVISION','DIAGNOSE_LIMITATIONS_AND_OPPORTUNITIES','GENERATION_CONTEXT',true,'READ_ONLY_PARALLEL_ELIGIBLE'],
  ['M04','BOOK.LITERARY.RETRIEVE_CRAFT_INTELLIGENCE','PROSE_ANALYSIS_AND_REVISION','RETRIEVE_CRAFT_INTELLIGENCE','GENERATION_CONTEXT',true,'READ_ONLY_PARALLEL_ELIGIBLE'],
  ['M05','BOOK.LITERARY.GENERATE_REVISION_CANDIDATE','PROSE_ANALYSIS_AND_REVISION','GENERATE_BOUNDED_REVISION_CANDIDATE','GENERATION_CONTEXT',false,'SERIAL_ONLY_NONIDEMPOTENT_OR_SIDE_EFFECTING'],
  ['M06','BOOK.LITERARY.COMPARE_ORIGINAL_CANDIDATE','PROSE_ANALYSIS_AND_REVISION','COMPARE_ORIGINAL_AND_CANDIDATE','EVALUATION_CONTEXT',true,'READ_ONLY_PARALLEL_ELIGIBLE'],
  ['M07','BOOK.LITERARY.ASSESS_VOICE','PROSE_ANALYSIS_AND_REVISION','ASSESS_VOICE_EVOLUTION_OR_DEGRADATION','EVALUATION_CONTEXT',true,'READ_ONLY_PARALLEL_ELIGIBLE'],
  ['M08','BOOK.LITERARY.ASSESS_HOMOGENIZATION','PROSE_ANALYSIS_AND_REVISION','ASSESS_HOMOGENIZATION_RISK','EVALUATION_CONTEXT',true,'READ_ONLY_PARALLEL_ELIGIBLE'],
  ['M09','BOOK.EVALUATION.INDEPENDENT_BOOK_OR_UNIT','BOOK_EVALUATION','INDEPENDENT_BOOK_OR_UNIT_EVALUATION','EVALUATION_CONTEXT',true,'ISOLATION_GATED'],
  ['M10','BOOK.EVALUATION.CONTRASTIVE_CANDIDATE','BOOK_EVALUATION','CONTRASTIVE_CANDIDATE_EVALUATION','EVALUATION_CONTEXT',true,'ISOLATION_GATED'],
  ['M11','BOOK.EVALUATION.QUALIFICATION_EVIDENCE','BOOK_EVALUATION','QUALIFICATION_EVIDENCE','EVALUATION_CONTEXT',true,'ISOLATION_GATED']
];
for (const [id, cap, service, op, contextClass, idem, concurrency] of expectedMappings) {
  const b = mapping(cap);
  b01Case(id, `exact current mapping ${cap}`, 'BookCapabilityBindingV1 registry', b.current_owner_path === 'SYSTEM_MASTER/BOOK' && b.provider_provenance.historical_or_provider_service_id === service && b.provider_provenance.operation_id === op && b.context_package_class === contextClass && b.registered_idempotent === idem && b.concurrency_policy_class === concurrency);
}

// A01-A20 — fail-closed adversarial denominator.
b01Case('A01', 'old PROSE task inserted into new plan is rejected', 'D3 retired-ID case', d3.retired_prose_execution_allowed === false && has(d3Source, 'RETIRED_PROSE_EXECUTION_ID'));
b01Case('A02', 'stale scheduler capability ID cannot dispatch', 'legacy scheduler retirement regression', scheduler.retired_prose_dispatches === 0);
b01Case('A03', 'BOOK alias cannot substitute a different provider operation', 'D1 content-addressed provider binding', registry.bindings.every(x => x.binding_digest && x.provider_provenance.operation_id));
b01Case('A04', 'provider subject change invalidates old binding identity', 'D1 changed-provider case', has(d1Source, 'changedProvider') && has(d1Source, 'binding_digest'));
b01Case('A05', 'idempotency change invalidates old binding identity', 'D1 changed-idempotency case', has(d1Source, 'changedIdempotency'));
b01Case('A06', 'evaluator provider cannot be substituted into generation context', 'D2 role/domain fences', has(d2Source, 'CONTEXT_CONSUMER_ROLE_MISMATCH') && d3.evaluator_isolation_satisfied === false);
b01Case('A07', 'generation context cannot be reused for evaluation', 'D2 evalWrongRole', has(d2Source, 'evalWrongRole'));
b01Case('A08', 'missing provider subject is never guessed', 'D1+D2+D3', d1.provider_subjects_admitted === 0 && d2.provider_subjects_admitted === 0 && d3.provider_subjects_admitted === 0);
b01Case('A09', 'historical PASS cannot substitute for fresh changed-byte qualification', 'current exact-subject suite composition', [d1,d2,d3,d4].every(x => x.result === 'PASS'));
b01Case('A10', 'mutable chat/webhook metadata cannot grant identity/dispatch', 'D1 identity exclusion + D4 wrapper case', has(d1Source, 'ignored_chat_label') && has(d4Source, 'webhook_authorized') && d4.scheduler_dispatch_authorized === false);
b01Case('A11', 'retry layer cannot auto-regenerate unknown non-idempotent outcome', 'D3 retry law', d3.nonidempotent_unknown_outcome_auto_replay === false);
b01Case('A12', 'duplicate/lost response cannot cause redispatch of unknown outcome', 'D4 restart/reconcile', d4.unknown_outcome_redispatched === false);
b01Case('A13', 'provider output cannot claim author approval', 'D4 receipt fence', d4.author_authority_granted === false);
b01Case('A14', 'technical/provider success cannot claim export freeze or publication authority', 'D4 receipt/handoff fence', d4.publication_authority_granted === false && d4.canonical_effect_allowed === false);
b01Case('A15', 'raw/private manuscript data cannot enter durable coordination state', 'durable+D2+D4', durable.raw_manuscript_persistence_forbidden === true && d4.private_authority_granted === false);
b01Case('A16', 'old /PROSE owner label cannot become active topology', 'D2 retired authority fence', d2.retired_prose_execution_allowed === false && registry.bindings.every(x => x.current_owner_path === 'SYSTEM_MASTER/BOOK'));
b01Case('A17', 'BOOK capability without admitted binding cannot dispatch by name alone', 'D3 missing-binding case', has(d3Source, 'CURRENT_CAPABILITY_BINDING_REQUIRED') && d3.current_dispatch_authorized_by_d3 === false);
b01Case('A18', 'Documents technical output cannot become Book publication authority', 'D4 publication fence', d4.publication_authority_granted === false && d4.admission_handoff_canonical_effect === false);
b01Case('A19', 'stale context cannot survive binding/source/Book/Story-Bible/service change', 'D2 stale suite', d2.changed_binding_stales_context === true && has(d2Source, 'staleSource') && has(d2Source, 'staleBook') && has(d2Source, 'staleStory'));
b01Case('A20', 'candidate provenance requires exact current binding/source/evidence identity', 'D4 handoff binding checks', has(d4Source, 'EXECUTION_RECEIPT_DIGEST_MISMATCH') && has(d4Source, 'ADMISSION_RECEIPT_BINDING_MISMATCH') && has(d4Source, 'resealedBindingMismatch') && has(d4Source, 'capability_binding_digest') && d4.admission_handoff_canonical_effect === false);

// X01-X09 — cross-component integration invariants.
b01Case('X01', 'exact binding digest is included in bound-context identity', 'D2', d2.binding_digest_in_bound_context_identity === true);
b01Case('X02', 'changed binding makes prior context stale', 'D2', d2.changed_binding_stales_context === true);
b01Case('X03', 'changed binding changes plan/operation identity', 'D3 changed-binding case', has(d3Source, 'changedAnalyzeOp.operation_digest') && has(d3Source, 'changedPlan.plan_digest'));
b01Case('X04', 'old Prose ID remains withheld after current Book mapping exists', 'D3+scheduler', d3.retired_prose_execution_allowed === false && scheduler.retired_prose_dispatches === 0);
b01Case('X05', 'non-idempotent unknown outcome remains reconcile-required after rebind', 'D3+D4', d3.nonidempotent_unknown_outcome_auto_replay === false && d4.unknown_outcome_redispatched === false);
b01Case('X06', 'restart does not redispatch verified completed work', 'D4+scheduler', d4.restart_verified_completion_reused === true && scheduler.completed_tasks_not_redispatched === true);
b01Case('X07', 'candidate handoff requires current candidate binding digest', 'D4', has(d4Source, 'capability_binding_digest') && d4.admission_handoff_canonical_effect === false);
b01Case('X08', 'provider/evaluator result cannot set canonical/publication authority', 'D4', d4.canonical_effect_allowed === false && d4.publication_authority_granted === false && d4.author_authority_granted === false);
b01Case('X09', 'missing provider subject is never guessed into executable standing', 'D1+D2+D3', d1.provider_subjects_admitted === 0 && d2.provider_subjects_admitted === 0 && d3.provider_subjects_admitted === 0);

assert.strictEqual(passed.length, 64, `frozen denominator must execute exactly 64 cases, got ${passed.length}`);
assert.strictEqual(new Set(passed.map(x => x.id)).size, 64, 'frozen denominator case IDs must be unique');

console.log(JSON.stringify({
  result: 'PASS',
  denominator: 'B01-E',
  frozen_cases: passed.length,
  ids: passed.map(x => x.id),
  current_book_capability_mappings: registry.bindings.length,
  provider_subjects_admitted: 0,
  retired_prose_execution_allowed: false,
  canonical_effect_allowed: false,
  publication_authority_granted: false,
  author_authority_granted: false,
  private_authority_granted: false,
  synthetic_provider_evidence_promoted: false
}));
