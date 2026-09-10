'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const stateModel = require('../../system-master/book-system/book-workflow-state-model');
const routing = require('../../system-master/book-system/book-capability-routing-interface');
const planRuntime = require('../../system-master/book-system/book-workflow-execution-plan');
const retry = require('../../system-master/book-system/book-workflow-retry-idempotency-rules');

const results = [];
function h(v) { return crypto.createHash('sha256').update(String(v), 'utf8').digest('hex'); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function pass(case_id, extra = {}) { results.push({ case_id, result:'PASS', ...extra }); }
function expectError(case_id, fn, code) {
  try { fn(); throw new Error(`EXPECTED_ERROR_NOT_THROWN:${code}`); }
  catch (err) {
    if (err.message === `EXPECTED_ERROR_NOT_THROWN:${code}`) throw err;
    if (err.code !== code) throw new Error(`${case_id}:EXPECTED_${code}:GOT_${err.code || err.message}`);
    pass(case_id,{observed:err.code});
  }
}
function workflow() {
  return stateModel.createWorkflowState({
    workflow_id:'WF-2F-001', book_project_id:'BOOK-PROJECT-001', objective:'Retry safely without duplicate literary or canonical effects.', target_section_ref:'chapter-9',
    source_identity:{book_state_version:9,book_state_digest:h('bs9'),canonical_manuscript_ref:'MANUSCRIPT-CANONICAL-001',manuscript_version_id:'MANUSCRIPT-V009',manuscript_digest_sha256:h('mv9')},
    input_hashes:{objective:h('obj2f')}, created_at:'2026-09-10T12:20:00-04:00'
  });
}
function task(id, cls, cap, domain, deps=[], opts={}) {
  return {task_id:id,task_class:cls,capability_id:cap,required_authority_domain:domain,authority_wait_owner:opts.authority_wait_owner===undefined?null:opts.authority_wait_owner,required_dependency_ids:deps,optional_dependency_ids:opts.optional_dependency_ids||[],input_ref_hashes:opts.input_ref_hashes||{source:h(id)},context_package_refs:opts.context_package_refs||[],required_for_plan_success:opts.required_for_plan_success===undefined?true:opts.required_for_plan_success};
}
function makePlan(tasks, wf=workflow(), id='PLAN-2F-001') {
  return planRuntime.createExecutionPlan({plan_id:id,book_project_id:wf.book_project_id,objective_ref:'OBJ-2F',objective_hash_sha256:h('Retry safely without duplicate literary or canonical effects.'),tasks,created_at:'2026-09-10T12:21:00-04:00'},wf,routing.loadDefaultRegistry());
}
function idempotentPlan(wf=workflow(), opts={}) {
  return makePlan([task('T-ANALYZE','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS',[],opts)],wf,opts.plan_id||'PLAN-IDEMPOTENT');
}
function generatorPlan(wf=workflow(), opts={}) {
  return makePlan([task('T-GEN','SPECIALIST_SERVICE_TASK','PROSE.GENERATE_REVISION_CANDIDATE','LITERARY_CANDIDATE_GENERATION',[],opts)],wf,opts.plan_id||'PLAN-GENERATOR');
}

const wf = workflow();
const idemPlan = idempotentPlan(wf);
const idemIdentity1 = retry.buildOperationIdentity(idemPlan,wf,'T-ANALYZE');
const idemIdentity2 = retry.buildOperationIdentity(idemPlan,wf,'T-ANALYZE');
if (idemIdentity1.operation_digest!==idemIdentity2.operation_digest || idemIdentity1.idempotency_key!==idemIdentity2.idempotency_key) throw new Error('UNSTABLE_OPERATION_IDENTITY');
pass('ORI-001-STABLE-IDENTICAL-OPERATION-IDENTITY');

if (idemIdentity1.registered_idempotent!==true) throw new Error('ANALYZE_NOT_REGISTERED_IDEMPOTENT');
pass('ORI-002-IDEMPOTENT-FLAG-READ-FROM-REGISTRY');

const genPlan=generatorPlan(wf);
const genIdentity=retry.buildOperationIdentity(genPlan,wf,'T-GEN');
if (genIdentity.registered_idempotent!==false) throw new Error('GENERATOR_FALSELY_IDEMPOTENT');
pass('ORI-003-PROSE-GENERATOR-REGISTERED-NONIDEMPOTENT');

const safeReplay=retry.deriveRetryDecision({plan:idemPlan,workflow_state:wf,task_id:'T-ANALYZE',observed_outcome:'UNKNOWN_OUTCOME',reconciliation_state:'NOT_APPLICABLE',requested_idempotency_key:idemIdentity1.idempotency_key});
if(safeReplay.decision_class!=='SAFE_SAME_OPERATION_REPLAY') throw new Error('IDEMPOTENT_UNKNOWN_NOT_SAFE_REPLAY');
pass('ORI-004-IDEMPOTENT-UNKNOWN-OUTCOME-SAME-OP-REPLAY');

const safeFailureReplay=retry.deriveRetryDecision({plan:idemPlan,workflow_state:wf,task_id:'T-ANALYZE',observed_outcome:'CONFIRMED_FAILURE_NO_EFFECT',reconciliation_state:'NOT_APPLICABLE'});
if(safeFailureReplay.decision_class!=='SAFE_SAME_OPERATION_REPLAY') throw new Error('IDEMPOTENT_FAILURE_NOT_SAFE_REPLAY');
pass('ORI-005-IDEMPOTENT-CONFIRMED-FAILURE-SAME-OP-REPLAY');

const reuseIdem=retry.deriveRetryDecision({plan:idemPlan,workflow_state:wf,task_id:'T-ANALYZE',observed_outcome:'CONFIRMED_SUCCESS',reconciliation_state:'NOT_APPLICABLE'});
if(reuseIdem.decision_class!=='REUSE_OR_REVIEW_EXISTING_RESULT') throw new Error('IDEMPOTENT_SUCCESS_NOT_REUSED');
pass('ORI-006-IDEMPOTENT-SUCCESS-REUSED-NOT-DUPLICATED');

const changedPlan=idempotentPlan(wf,{input_ref_hashes:{source:h('changed-source-ref')},plan_id:'PLAN-IDEMPOTENT-CHANGED'});
const changedIdentity=retry.buildOperationIdentity(changedPlan,wf,'T-ANALYZE');
if(changedIdentity.operation_digest===idemIdentity1.operation_digest) throw new Error('CHANGED_INPUT_SAME_OPERATION_ID');
pass('ORI-007-CHANGED-INPUT-NEW-OPERATION-IDENTITY');

const changedDecision=retry.deriveRetryDecision({plan:changedPlan,workflow_state:wf,task_id:'T-ANALYZE',observed_outcome:'UNKNOWN_OUTCOME',reconciliation_state:'NOT_APPLICABLE',prior_operation_identity:idemIdentity1});
if(changedDecision.decision_class!=='NEW_OPERATION_REQUIRED_CHANGED_INPUTS') throw new Error('CHANGED_INPUT_FALSELY_RETRIED');
pass('ORI-008-CHANGED-INPUT-CLASSIFIED-NEW-OPERATION');

expectError('ORI-009-OLD-IDEMPOTENCY-KEY-WITH-CHANGED-INPUT-REJECTED',()=>retry.deriveRetryDecision({plan:changedPlan,workflow_state:wf,task_id:'T-ANALYZE',observed_outcome:'UNKNOWN_OUTCOME',reconciliation_state:'NOT_APPLICABLE',requested_idempotency_key:idemIdentity1.idempotency_key}),'IDEMPOTENCY_KEY_CONFLICT');

const genUnknown=retry.deriveRetryDecision({plan:genPlan,workflow_state:wf,task_id:'T-GEN',observed_outcome:'UNKNOWN_OUTCOME',reconciliation_state:'NOT_PERFORMED'});
if(genUnknown.decision_class!=='RECONCILE_REQUIRED') throw new Error('GENERATOR_UNKNOWN_AUTO_RETRIED');
pass('ORI-010-NONIDEMPOTENT-UNKNOWN-OUTCOME-RECONCILE-REQUIRED');

const genNoEffect=retry.deriveRetryDecision({plan:genPlan,workflow_state:wf,task_id:'T-GEN',observed_outcome:'UNKNOWN_OUTCOME',reconciliation_state:'CONFIRMED_NO_EFFECT',reconciliation_evidence_refs:['RECON-001']});
if(genNoEffect.decision_class!=='NEW_ATTEMPT_AFTER_CONFIRMED_NO_EFFECT') throw new Error('NO_EFFECT_NOT_NEW_ATTEMPT');
pass('ORI-011-NONIDEMPOTENT-CONFIRMED-NO-EFFECT-NEW-ATTEMPT-ONLY');

const genExisting=retry.deriveRetryDecision({plan:genPlan,workflow_state:wf,task_id:'T-GEN',observed_outcome:'UNKNOWN_OUTCOME',reconciliation_state:'CONFIRMED_EXISTING_RESULT',reconciliation_evidence_refs:['RECON-002']});
if(genExisting.decision_class!=='REUSE_OR_REVIEW_EXISTING_RESULT') throw new Error('EXISTING_RESULT_DUPLICATED');
pass('ORI-012-NONIDEMPOTENT-EXISTING-RESULT-REUSED');

const genSuccess=retry.deriveRetryDecision({plan:genPlan,workflow_state:wf,task_id:'T-GEN',observed_outcome:'CONFIRMED_SUCCESS',reconciliation_state:'NOT_PERFORMED'});
if(genSuccess.decision_class!=='REUSE_OR_REVIEW_EXISTING_RESULT') throw new Error('SUCCESSFUL_GENERATION_DUPLICATED');
pass('ORI-013-NONIDEMPOTENT-CONFIRMED-SUCCESS-REUSED');

const genUnresolved=retry.deriveRetryDecision({plan:genPlan,workflow_state:wf,task_id:'T-GEN',observed_outcome:'UNKNOWN_OUTCOME',reconciliation_state:'UNRESOLVED',reconciliation_evidence_refs:['RECON-003']});
if(genUnresolved.decision_class!=='RECONCILE_REQUIRED') throw new Error('UNRESOLVED_NOT_CLOSED');
pass('ORI-014-NONIDEMPOTENT-UNRESOLVED-FAILS-CLOSED');

const genContradictory=retry.deriveRetryDecision({plan:genPlan,workflow_state:wf,task_id:'T-GEN',observed_outcome:'UNKNOWN_OUTCOME',reconciliation_state:'CONTRADICTORY',reconciliation_evidence_refs:['RECON-004']});
if(genContradictory.decision_class!=='RECONCILE_REQUIRED') throw new Error('CONTRADICTORY_NOT_CLOSED');
pass('ORI-015-NONIDEMPOTENT-CONTRADICTORY-FAILS-CLOSED');

expectError('ORI-016-RECONCILIATION-EVIDENCE-REQUIRED',()=>retry.deriveRetryDecision({plan:genPlan,workflow_state:wf,task_id:'T-GEN',observed_outcome:'UNKNOWN_OUTCOME',reconciliation_state:'CONFIRMED_NO_EFFECT'}),'RECONCILIATION_EVIDENCE_REQUIRED');

const authorPlan=makePlan([task('T-AUTHOR','AUTHORITY_WAIT',null,null,[],{authority_wait_owner:'AUTHOR'})],wf,'PLAN-AUTHOR');
const authorRetry=retry.deriveRetryDecision({plan:authorPlan,workflow_state:wf,task_id:'T-AUTHOR',observed_outcome:'UNKNOWN_OUTCOME',reconciliation_state:'NOT_APPLICABLE'});
if(authorRetry.decision_class!=='NOT_EXECUTABLE_BY_RETRY_POLICY' || authorRetry.operation_identity.idempotency_key!==null) throw new Error('AUTHOR_WAIT_RETRYABLE');
pass('ORI-017-AUTHOR-WAIT-NOT-RETRYABLE');

const canonPlan=makePlan([task('T-CANON','DECLARED_BLOCKED_CAPABILITY','CANON.CONSISTENCY_CHECK','CANON_TRUTH')],wf,'PLAN-CANON');
const canonRetry=retry.deriveRetryDecision({plan:canonPlan,workflow_state:wf,task_id:'T-CANON',observed_outcome:'UNKNOWN_OUTCOME',reconciliation_state:'NOT_APPLICABLE'});
if(canonRetry.decision_class!=='NOT_EXECUTABLE_BY_RETRY_POLICY') throw new Error('BLOCKED_CANON_RETRYABLE');
pass('ORI-018-NONCALLABLE-CANON-NOT-RETRYABLE');

const admitPlan=makePlan([task('T-ADMIT','BOOK_ADMISSION_HANDOFF','BOOK.CANONICAL_MANUSCRIPT_ADMISSION','CANONICAL_MANUSCRIPT_MUTATION')],wf,'PLAN-ADMIT');
const admitRetry=retry.deriveRetryDecision({plan:admitPlan,workflow_state:wf,task_id:'T-ADMIT',observed_outcome:'UNKNOWN_OUTCOME',reconciliation_state:'NOT_APPLICABLE'});
if(admitRetry.decision_class!=='BOOK_ADMISSION_RETRY_NOT_AUTHORIZED') throw new Error('BOOK_ADMISSION_PROVIDER_RETRY_AUTHORIZED');
pass('ORI-019-BOOK-ADMISSION-NOT-PROVIDER-RETRIED');

expectError('ORI-020-IDEMPOTENCY-KEY-FORBIDDEN-FOR-AUTHORITY-TASK',()=>retry.deriveRetryDecision({plan:authorPlan,workflow_state:wf,task_id:'T-AUTHOR',observed_outcome:'UNKNOWN_OUTCOME',reconciliation_state:'NOT_APPLICABLE',requested_idempotency_key:'book-op-'+h('fake')}),'IDEMPOTENCY_KEY_NOT_ALLOWED_FOR_NONPROVIDER_TASK');

const staleDecision=clone(safeReplay); staleDecision.plan_digest=h('stale'); staleDecision.decision_digest=retry.decisionDigest(staleDecision);
expectError('ORI-021-STALE-PLAN-BINDING-REJECTED',()=>retry.validateRetryDecision(staleDecision,idemPlan,wf),'STALE_RETRY_PLAN_BINDING');

const staleWorkflowDecision=clone(safeReplay); staleWorkflowDecision.workflow_digest=h('stale-workflow'); staleWorkflowDecision.decision_digest=retry.decisionDigest(staleWorkflowDecision);
expectError('ORI-022-STALE-WORKFLOW-BINDING-REJECTED',()=>retry.validateRetryDecision(staleWorkflowDecision,idemPlan,wf),'STALE_RETRY_WORKFLOW_BINDING');

const staleSourceDecision=clone(safeReplay); staleSourceDecision.source_identity.manuscript_digest_sha256=h('stale-source'); staleSourceDecision.decision_digest=retry.decisionDigest(staleSourceDecision);
expectError('ORI-023-STALE-SOURCE-BINDING-REJECTED',()=>retry.validateRetryDecision(staleSourceDecision,idemPlan,wf),'STALE_RETRY_SOURCE_BINDING');

const identityTamper=clone(safeReplay); identityTamper.operation_identity.projection.input_ref_hashes.source=h('tampered'); identityTamper.decision_digest=retry.decisionDigest(identityTamper);
expectError('ORI-024-OPERATION-IDENTITY-TAMPER-REJECTED',()=>retry.validateRetryDecision(identityTamper,idemPlan,wf),'STALE_OPERATION_IDENTITY');

const decisionTamper=clone(safeReplay); decisionTamper.decision_digest=h('tampered-decision');
expectError('ORI-025-DECISION-DIGEST-TAMPER-REJECTED',()=>retry.validateRetryDecision(decisionTamper,idemPlan,wf),'RETRY_DECISION_DIGEST_MISMATCH');

expectError('ORI-026-RAW-MANUSCRIPT-IN-RETRY-INPUT-REJECTED',()=>retry.deriveRetryDecision({plan:idemPlan,workflow_state:wf,task_id:'T-ANALYZE',observed_outcome:'UNKNOWN_OUTCOME',reconciliation_state:'NOT_APPLICABLE',manuscript_text:'forbidden'}),'RAW_MANUSCRIPT_CONTENT_FORBIDDEN');

const badServiceRegistry=clone(retry.loadServiceRegistry()); badServiceRegistry.services.PROSE_ANALYSIS_AND_REVISION.operations.ANALYZE_PASSAGE_OR_UNIT.idempotent='yes';
expectError('ORI-027-REGISTERED-IDEMPOTENCY-FLAG-MUST-BE-BOOLEAN',()=>retry.buildOperationIdentity(idemPlan,wf,'T-ANALYZE',routing.loadDefaultRegistry(),badServiceRegistry),'REGISTERED_IDEMPOTENCY_FLAG_MISSING');

const exportedNames=Object.keys(retry);
if(exportedNames.some(name=>/dispatch|execute|sendRetry|callProvider|admit|writePreference|schedule|worker/i.test(name))) throw new Error(`UNAUTHORIZED_RETRY_EXECUTION_API:${exportedNames.join(',')}`);
pass('ORI-028-NO-PROVIDER-EXECUTION-ADMISSION-PREFERENCE-OR-WORKER-API');

const sameDecision2=retry.deriveRetryDecision({plan:idemPlan,workflow_state:wf,task_id:'T-ANALYZE',observed_outcome:'UNKNOWN_OUTCOME',reconciliation_state:'NOT_APPLICABLE',requested_idempotency_key:idemIdentity1.idempotency_key});
if(safeReplay.decision_digest!==sameDecision2.decision_digest) throw new Error('NONDETERMINISTIC_RETRY_DECISION');
pass('ORI-029-DETERMINISTIC-RETRY-DECISION-DIGEST');

if(genUnknown.decision_class==='SAFE_SAME_OPERATION_REPLAY' || admitRetry.decision_class==='SAFE_SAME_OPERATION_REPLAY') throw new Error('UNAUTHORIZED_REPLAY_CLASS');
pass('ORI-030-NO-DUPLICATE-CANONICAL-OR-NONIDEMPOTENT-EFFECT-PATH');

const summary={
  qualification_id:'BOOK-WORKFLOW-ORCHESTRATOR-RETRY-IDEMPOTENCY-RULES-001-QUALIFICATION',result:'PASS',subject_sha:process.env.GITHUB_SHA||null,
  fixture_class:'SYNTHETIC_NON_PRIVATE_RETRY_IDEMPOTENCY_DECISIONS',planned_cases:30,passed_cases:results.length,assertions:results.length,
  provider_retry_executed:false,provider_reconciliation_executed:false,canonical_manuscript_mutated:false,book_admission_executed:false,preference_event_written:false,prose_runtime_mutated:false,
  cache_used:false,cancellation_resume_executed:false,fresh_blind_scoring_executed:false,a01_pass_claimed_for_this_subject:false,native_private_publication_production_claimed:false,
  results
};
if(results.length!==30) throw new Error(`CASE_COUNT_MISMATCH:${results.length}`);
const out=path.join(process.env.RUNNER_TEMP||'/tmp','book-workflow-orchestrator-retry-idempotency-rules-001-summary.json');
fs.writeFileSync(out,JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
