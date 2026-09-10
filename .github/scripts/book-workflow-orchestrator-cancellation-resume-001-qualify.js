'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const stateModel = require('../../system-master/book-system/book-workflow-state-model');
const routing = require('../../system-master/book-system/book-capability-routing-interface');
const planRuntime = require('../../system-master/book-system/book-workflow-execution-plan');
const control = require('../../system-master/book-system/book-workflow-cancellation-resume');

const results = [];
function h(v) { return crypto.createHash('sha256').update(String(v), 'utf8').digest('hex'); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function pass(case_id, extra = {}) { results.push({ case_id, result: 'PASS', ...extra }); }
function expectError(case_id, fn, code) {
  try { fn(); throw new Error(`EXPECTED_ERROR_NOT_THROWN:${code}`); }
  catch (err) {
    if (err.message === `EXPECTED_ERROR_NOT_THROWN:${code}`) throw err;
    if (err.code !== code) throw new Error(`${case_id}:EXPECTED_${code}:GOT_${err.code || err.message}`);
    pass(case_id, { observed: err.code });
  }
}
function task(id, cls, cap, domain, deps = [], opts = {}) {
  return {
    task_id: id,
    task_class: cls,
    capability_id: cap,
    required_authority_domain: domain,
    authority_wait_owner: opts.authority_wait_owner === undefined ? null : opts.authority_wait_owner,
    required_dependency_ids: deps,
    optional_dependency_ids: opts.optional_dependency_ids || [],
    input_ref_hashes: { source: h(`source:${id}`) },
    context_package_refs: opts.context_package_refs || [],
    required_for_plan_success: opts.required_for_plan_success === undefined ? true : opts.required_for_plan_success
  };
}
function source() {
  return {
    book_state_version: 12,
    book_state_digest: h('book-state-12'),
    canonical_manuscript_ref: 'MANUSCRIPT-CANONICAL-001',
    manuscript_version_id: 'MANUSCRIPT-V012',
    manuscript_digest_sha256: h('manuscript-v12')
  };
}
function buildWorkflow(tasks, statuses, id = 'WF-2H-001') {
  let w = stateModel.createWorkflowState({
    workflow_id: id,
    book_project_id: 'BOOK-PROJECT-001',
    objective: 'Pause or cancel safely and resume only from verified coordination state.',
    target_section_ref: 'chapter-12:scene-1',
    source_identity: source(),
    input_hashes: { objective: h('2h-objective') },
    created_at: '2026-09-10T12:40:00-04:00'
  });
  const planned = tasks.map(t => t.task_id);
  const initialStatuses = Object.fromEntries(planned.map(id2 => [id2, 'PLANNED']));
  w = stateModel.advanceWorkflowState(w, { workflow_status: 'PLANNING', planned_task_refs: planned, task_statuses: initialStatuses });
  w = stateModel.advanceWorkflowState(w, { workflow_status: 'READY' });
  w = stateModel.advanceWorkflowState(w, { workflow_status: 'RUNNING', task_statuses: clone(statuses), started_at: '2026-09-10T12:41:00-04:00' });
  return w;
}
function makePlan(tasks, w, id = 'PLAN-2H-001') {
  return planRuntime.createExecutionPlan({
    plan_id: id,
    book_project_id: w.book_project_id,
    objective_ref: 'OBJ-2H',
    objective_hash_sha256: h('Pause or cancel safely and resume only from verified coordination state.'),
    tasks,
    created_at: '2026-09-10T12:41:30-04:00'
  }, w, routing.loadDefaultRegistry());
}
function receipt(taskId, w, plan) {
  return {
    receipt_ref: `RECEIPT-${taskId}`,
    workflow_digest: w.workflow_digest,
    plan_digest: plan.plan_digest,
    source_identity_digest: control.sourceIdentityDigest(plan.source_identity)
  };
}
function pauseInput(w, p, receipts = {}, checkpointId = 'CHECKPOINT-PAUSE-001') {
  return {
    workflow_state: w,
    plan: p,
    checkpoint_id: checkpointId,
    checkpoint_created_at: '2026-09-10T12:42:00-04:00',
    verified_task_receipts: receipts,
    current_source_identity: clone(w.source_identity)
  };
}

const idemTasks = [
  task('T-DONE','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS'),
  task('T-RUN','SPECIALIST_SERVICE_TASK','PROSE.ASSESS_VOICE','VOICE_EVIDENCE')
];
const idemW = buildWorkflow(idemTasks, { 'T-DONE':'COMPLETED', 'T-RUN':'RUNNING' }, 'WF-2H-IDEM');
const idemPlan = makePlan(idemTasks, idemW, 'PLAN-2H-IDEM');
const idemPause = control.pauseWorkflow(pauseInput(idemW, idemPlan, { 'T-DONE': receipt('T-DONE', idemW, idemPlan) }, 'CHECKPOINT-IDEM'));

if (idemPause.workflow_state.workflow_status !== 'PAUSED') throw new Error('PAUSE_STATUS_WRONG');
pass('OCR2H-001-PAUSE-CREATES-PAUSED-STATE');
if (idemPause.workflow_state.task_statuses['T-RUN'] === 'RUNNING') throw new Error('RUNNING_TASK_SURVIVED_PAUSE');
pass('OCR2H-002-RUNNING-TASK-NOT-LEFT-RUNNING');
if (idemPause.workflow_state.task_statuses['T-DONE'] !== 'COMPLETED' || !idemPause.checkpoint.completed_verified_task_ids.includes('T-DONE')) throw new Error('VERIFIED_COMPLETION_NOT_PRESERVED');
pass('OCR2H-003-VERIFIED-COMPLETION-PRESERVED');
if (idemPause.checkpoint.interrupted_task_records.length !== 1 || !idemPause.checkpoint.interrupted_task_records[0].operation_identity) throw new Error('INTERRUPTED_OPERATION_IDENTITY_MISSING');
pass('OCR2H-004-INTERRUPTED-PROVIDER-IDENTITY-CHECKPOINTED');
if (idemPause.checkpoint.interrupted_task_records[0].operation_identity.registered_idempotent !== true) throw new Error('IDEMPOTENT_CLASSIFICATION_WRONG');
pass('OCR2H-005-IDEMPOTENT-INTERRUPTED-OPERATION-PRESERVED');
if (idemPause.original_manuscript_preserved !== true || idemPause.canonical_effect_allowed !== false) throw new Error('PAUSE_CANONICAL_EFFECT');
pass('OCR2H-006-PAUSE-PRESERVES-ORIGINAL-NO-CANONICAL-EFFECT');

const idemResumeDecision = control.deriveResumeDecision({
  workflow_state: idemPause.workflow_state,
  checkpoint: idemPause.checkpoint,
  plan: idemPlan,
  current_source_identity: clone(idemW.source_identity),
  decision_id: 'RESUME-IDEM-DECISION',
  decided_at: '2026-09-10T12:43:00-04:00'
});
if (!idemResumeDecision.resume_allowed || idemResumeDecision.disposition_class !== 'READY_FOR_LATER_SCHEDULING') throw new Error('IDEMPOTENT_RESUME_NOT_READY');
if (idemResumeDecision.interrupted_task_actions[0].action !== undefined) throw new Error('UNEXPECTED_ACTION_FIELD_SHAPE');
pass('OCR2H-007-IDEMPOTENT-RESUME-CLASSIFIED-READY');
const idemAction = idemResumeDecision.interrupted_task_actions.find(a => a.task_id === 'T-RUN');
if (!idemAction || idemAction.disposition !== 'READY_FOR_LATER_SCHEDULING' || idemAction.next_task_status !== 'READY') throw new Error('IDEMPOTENT_TASK_NOT_REPLAY_ELIGIBLE');
pass('OCR2H-008-IDEMPOTENT-TASK-BECOMES-REPLAY-ELIGIBLE-NOT-EXECUTED');
const idemResumed = control.resumeWorkflow({ workflow_state: idemPause.workflow_state, checkpoint: idemPause.checkpoint, plan: idemPlan, current_source_identity: clone(idemW.source_identity), decision_id: 'RESUME-IDEM-APPLY', decided_at: '2026-09-10T12:43:01-04:00' });
if (idemResumed.workflow_state.workflow_status !== 'READY' || idemResumed.workflow_state.task_statuses['T-DONE'] !== 'COMPLETED' || idemResumed.workflow_state.task_statuses['T-RUN'] !== 'READY') throw new Error('SAFE_RESUME_STATE_WRONG');
pass('OCR2H-009-SAFE-RESUME-PRESERVES-COMPLETED-AND-READIES-INTERRUPTED');

const genTasks = [task('T-GEN','SPECIALIST_SERVICE_TASK','PROSE.GENERATE_REVISION_CANDIDATE','LITERARY_CANDIDATE_GENERATION')];
const genW = buildWorkflow(genTasks, { 'T-GEN':'RUNNING' }, 'WF-2H-GEN');
const genPlan = makePlan(genTasks, genW, 'PLAN-2H-GEN');
const genPause = control.pauseWorkflow(pauseInput(genW, genPlan, {}, 'CHECKPOINT-GEN'));
if (genPause.checkpoint.interrupted_task_records[0].operation_identity.registered_idempotent !== false) throw new Error('GENERATION_IDEMPOTENCY_WIDENED');
pass('OCR2H-010-NONIDEMPOTENT-PROSE-GENERATION-PRESERVED');
const genDecision = control.deriveResumeDecision({ workflow_state: genPause.workflow_state, checkpoint: genPause.checkpoint, plan: genPlan, current_source_identity: clone(genW.source_identity), decision_id: 'RESUME-GEN', decided_at: '2026-09-10T12:44:00-04:00' });
if (!genDecision.resume_allowed || genDecision.disposition_class !== 'WAITING_FOR_RECONCILIATION' || genDecision.task_statuses['T-GEN'] !== 'BLOCKED') throw new Error('GENERATION_AUTO_RETRIED');
pass('OCR2H-011-NONIDEMPOTENT-INTERRUPTION-REQUIRES-RECONCILIATION');
const genResumed = control.resumeWorkflow({ workflow_state: genPause.workflow_state, checkpoint: genPause.checkpoint, plan: genPlan, current_source_identity: clone(genW.source_identity), decision_id: 'RESUME-GEN-APPLY', decided_at: '2026-09-10T12:44:01-04:00' });
if (genResumed.workflow_state.workflow_status !== 'WAITING_EVIDENCE' || genResumed.workflow_state.task_statuses['T-GEN'] !== 'BLOCKED') throw new Error('GENERATION_RECONCILIATION_WAIT_WRONG');
pass('OCR2H-012-RESUME-CONTROL-WAITS-FOR-RECONCILIATION-WITHOUT-REGENERATION');

const staleSource = clone(idemW.source_identity); staleSource.manuscript_digest_sha256 = h('changed-manuscript');
const staleDecision = control.deriveResumeDecision({ workflow_state: idemPause.workflow_state, checkpoint: idemPause.checkpoint, plan: idemPlan, current_source_identity: staleSource, decision_id: 'RESUME-STALE', decided_at: '2026-09-10T12:45:00-04:00' });
if (staleDecision.resume_allowed || staleDecision.disposition_class !== 'NEW_WORKFLOW_REQUIRED_STALE_SOURCE') throw new Error('STALE_SOURCE_RESUME_ALLOWED');
pass('OCR2H-013-STALE-SOURCE-REQUIRES-NEW-WORKFLOW');
expectError('OCR2H-014-STALE-SOURCE-RESUME-APPLICATION-REJECTED', () => control.resumeWorkflow({ workflow_state: idemPause.workflow_state, checkpoint: idemPause.checkpoint, plan: idemPlan, current_source_identity: staleSource, decision_id: 'RESUME-STALE-APPLY', decided_at: '2026-09-10T12:45:01-04:00' }), 'RESUME_NOT_ALLOWED');

const cancelTasks = [
  task('T-COMPLETE','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS'),
  task('T-ACTIVE','SPECIALIST_SERVICE_TASK','RESEARCH.ACQUIRE_BOUNDED_EVIDENCE','EXTERNAL_EVIDENCE_TRUTH')
];
const cancelW = buildWorkflow(cancelTasks, { 'T-COMPLETE':'COMPLETED', 'T-ACTIVE':'RUNNING' }, 'WF-2H-CANCEL');
const cancelPlan = makePlan(cancelTasks, cancelW, 'PLAN-2H-CANCEL');
const cancelled = control.cancelWorkflow({ workflow_state: cancelW, plan: cancelPlan, checkpoint_id: 'CHECKPOINT-CANCEL', checkpoint_created_at: '2026-09-10T12:46:00-04:00', cancelled_at: '2026-09-10T12:46:01-04:00', verified_task_receipts: { 'T-COMPLETE': receipt('T-COMPLETE', cancelW, cancelPlan) }, current_source_identity: clone(cancelW.source_identity) });
if (cancelled.workflow_state.workflow_status !== 'CANCELLED' || cancelled.workflow_state.task_statuses['T-COMPLETE'] !== 'COMPLETED' || cancelled.workflow_state.task_statuses['T-ACTIVE'] !== 'CANCELLED') throw new Error('CANCEL_STATE_WRONG');
pass('OCR2H-015-CANCEL-TERMINAL-PRESERVES-VERIFIED-COMPLETION');
if (cancelled.resume_disposition !== 'NEW_WORKFLOW_REQUIRED_CANCELLED_TERMINAL') throw new Error('CANCEL_RESUME_DISPOSITION_WRONG');
pass('OCR2H-016-CANCELLED-WORKFLOW-REQUIRES-NEW-WORKFLOW');
const cancelledDecision = control.deriveResumeDecision({ workflow_state: cancelled.workflow_state, checkpoint: cancelled.checkpoint, plan: cancelPlan, current_source_identity: clone(cancelW.source_identity), decision_id: 'RESUME-CANCELLED', decided_at: '2026-09-10T12:47:00-04:00' });
if (cancelledDecision.resume_allowed || cancelledDecision.disposition_class !== 'NEW_WORKFLOW_REQUIRED_CANCELLED_TERMINAL') throw new Error('CANCELLED_WORKFLOW_RESUMABLE');
pass('OCR2H-017-CANCELLED-WORKFLOW-CANNOT-RESUME-IN-PLACE');
expectError('OCR2H-018-CANCELLED-RESUME-APPLICATION-REJECTED', () => control.resumeWorkflow({ workflow_state: cancelled.workflow_state, checkpoint: cancelled.checkpoint, plan: cancelPlan, current_source_identity: clone(cancelW.source_identity), decision_id: 'RESUME-CANCELLED-APPLY', decided_at: '2026-09-10T12:47:01-04:00' }), 'RESUME_NOT_ALLOWED');

const unverifiedW = buildWorkflow([task('T-U','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS')], { 'T-U':'COMPLETED' }, 'WF-2H-UNVERIFIED');
const unverifiedPlan = makePlan([task('T-U','SPECIALIST_SERVICE_TASK','PROSE.ANALYZE_PASSAGE','LITERARY_DIAGNOSIS')], unverifiedW, 'PLAN-2H-UNVERIFIED');
const unverifiedPause = control.pauseWorkflow(pauseInput(unverifiedW, unverifiedPlan, {}, 'CHECKPOINT-UNVERIFIED'));
if (unverifiedPause.workflow_state.task_statuses['T-U'] !== 'BLOCKED' || unverifiedPause.checkpoint.completed_verified_task_ids.length !== 0) throw new Error('UNVERIFIED_COMPLETION_PRESERVED_AS_VERIFIED');
pass('OCR2H-019-UNVERIFIED-COMPLETION-NOT-TRUSTED');

const authorTasks = [task('T-AUTH','AUTHORITY_WAIT',null,null,[],{authority_wait_owner:'AUTHOR'})];
const authorW = buildWorkflow(authorTasks, { 'T-AUTH':'RUNNING' }, 'WF-2H-AUTHOR');
const authorPlan = makePlan(authorTasks, authorW, 'PLAN-2H-AUTHOR');
const authorPause = control.pauseWorkflow(pauseInput(authorW, authorPlan, {}, 'CHECKPOINT-AUTHOR'));
const authorDecision = control.deriveResumeDecision({ workflow_state: authorPause.workflow_state, checkpoint: authorPause.checkpoint, plan: authorPlan, current_source_identity: clone(authorW.source_identity), decision_id: 'RESUME-AUTHOR', decided_at: '2026-09-10T12:48:00-04:00' });
if (authorDecision.disposition_class !== 'WAITING_FOR_REQUIRED_AUTHORITY' || authorDecision.task_statuses['T-AUTH'] !== 'BLOCKED') throw new Error('AUTHOR_WAIT_BYPASSED');
pass('OCR2H-020-AUTHOR-WAIT-NOT-BYPASSED');

const canonTasks = [task('T-CANON','DECLARED_BLOCKED_CAPABILITY','CANON.CONSISTENCY_CHECK','CANON_TRUTH')];
const canonW = buildWorkflow(canonTasks, { 'T-CANON':'RUNNING' }, 'WF-2H-CANON');
const canonPlan = makePlan(canonTasks, canonW, 'PLAN-2H-CANON');
const canonPause = control.pauseWorkflow(pauseInput(canonW, canonPlan, {}, 'CHECKPOINT-CANON'));
const canonDecision = control.deriveResumeDecision({ workflow_state: canonPause.workflow_state, checkpoint: canonPause.checkpoint, plan: canonPlan, current_source_identity: clone(canonW.source_identity), decision_id: 'RESUME-CANON', decided_at: '2026-09-10T12:49:00-04:00' });
if (canonDecision.disposition_class !== 'BLOCKED_DECLARED_INTERFACE' || canonDecision.task_statuses['T-CANON'] !== 'BLOCKED') throw new Error('CANON_INTERFACE_GUESSED');
pass('OCR2H-021-DECLARED-INTERFACE-BLOCKER-NOT-GUESSED');

const admissionTask = task('T-ADMIT','BOOK_ADMISSION_HANDOFF','BOOK.CANONICAL_MANUSCRIPT_ADMISSION','CANONICAL_MANUSCRIPT_MUTATION');
let admissionW = buildWorkflow([admissionTask], { 'T-ADMIT':'READY' }, 'WF-2H-ADMISSION');
admissionW = stateModel.advanceWorkflowState(admissionW, { workflow_status: 'READY_FOR_ADMISSION_HANDOFF' });
admissionW = stateModel.advanceWorkflowState(admissionW, { workflow_status: 'ADMISSION_PENDING' });
const admissionPlan = makePlan([admissionTask], admissionW, 'PLAN-2H-ADMISSION');
expectError('OCR2H-022-ADMISSION-PENDING-PAUSE-REJECTED', () => control.pauseWorkflow({ workflow_state: admissionW, plan: admissionPlan, checkpoint_id: 'CP-ADMIT-P', checkpoint_created_at: '2026-09-10T12:50:00-04:00', verified_task_receipts: {}, current_source_identity: clone(admissionW.source_identity) }), 'ADMISSION_PENDING_OUTSIDE_CANCELLATION_AUTHORITY');
expectError('OCR2H-023-ADMISSION-PENDING-CANCEL-REJECTED', () => control.cancelWorkflow({ workflow_state: admissionW, plan: admissionPlan, checkpoint_id: 'CP-ADMIT-C', checkpoint_created_at: '2026-09-10T12:50:00-04:00', cancelled_at: '2026-09-10T12:50:01-04:00', verified_task_receipts: {}, current_source_identity: clone(admissionW.source_identity) }), 'ADMISSION_PENDING_OUTSIDE_CANCELLATION_AUTHORITY');

const tamperedCheckpoint = clone(idemPause.checkpoint);
tamperedCheckpoint.interrupted_task_records[0].operation_identity.registered_idempotent = false;
tamperedCheckpoint.checkpoint_digest = control.checkpointDigest(tamperedCheckpoint);
expectError('OCR2H-024-INTERRUPTED-IDEMPOTENCY-TAMPER-REJECTED', () => control.validateCheckpoint(tamperedCheckpoint, idemPause.workflow_state, idemPlan), 'INTERRUPTED_OPERATION_IDEMPOTENCY_MISMATCH');

const tamperedPlanBind = clone(idemPause.checkpoint);
tamperedPlanBind.pre_transition_workflow_digest = h('wrong-pre-digest');
tamperedPlanBind.checkpoint_digest = control.checkpointDigest(tamperedPlanBind);
expectError('OCR2H-025-PRE-PAUSE-PLAN-BINDING-TAMPER-REJECTED', () => control.validateCheckpoint(tamperedPlanBind, idemPause.workflow_state, idemPlan), 'CHECKPOINT_PRE_WORKFLOW_BINDING_MISMATCH');

const badCheckpointDigest = clone(idemPause.checkpoint); badCheckpointDigest.checkpoint_digest = h('tamper');
expectError('OCR2H-026-CHECKPOINT-DIGEST-TAMPER-REJECTED', () => control.validateCheckpoint(badCheckpointDigest, idemPause.workflow_state, idemPlan), 'CHECKPOINT_DIGEST_MISMATCH');

expectError('OCR2H-027-RAW-MANUSCRIPT-CONTROL-INPUT-REJECTED', () => control.pauseWorkflow({ ...pauseInput(idemW, idemPlan, { 'T-DONE': receipt('T-DONE', idemW, idemPlan) }, 'CP-RAW'), manuscript_text: 'forbidden' }), 'RAW_MANUSCRIPT_CONTENT_FORBIDDEN');

const badDecision = clone(idemResumeDecision); badDecision.canonical_effect_allowed = true; badDecision.decision_digest = control.resumeDecisionDigest(badDecision);
expectError('OCR2H-028-RESUME-CANONICAL-EFFECT-TAMPER-REJECTED', () => control.validateResumeDecision(badDecision, idemPause.workflow_state, idemPause.checkpoint, idemPlan), 'RESUME_EFFECT_AUTHORITY_FORBIDDEN');

const secondDecision = control.deriveResumeDecision({ workflow_state: idemPause.workflow_state, checkpoint: idemPause.checkpoint, plan: idemPlan, current_source_identity: clone(idemW.source_identity), decision_id: 'RESUME-IDEM-DECISION', decided_at: '2026-09-10T12:43:00-04:00' });
if (secondDecision.decision_digest !== idemResumeDecision.decision_digest) throw new Error('RESUME_DECISION_NOT_DETERMINISTIC');
pass('OCR2H-029-DETERMINISTIC-RESUME-DECISION');

const exportedNames = Object.keys(control);
if (exportedNames.some(name => /dispatch|schedule|worker|executeProvider|retryProvider|reconcileProvider|writeCanonical|admitCanonical/i.test(name))) throw new Error(`UNAUTHORIZED_EXECUTION_API:${exportedNames.join(',')}`);
if (idemResumeDecision.provider_execution_performed !== false || idemResumeDecision.retry_executed !== false || idemResumeDecision.reconciliation_executed !== false || idemResumeDecision.book_admission_executed !== false) throw new Error('EXECUTION_FALSE_FLAGS_BROKEN');
pass('OCR2H-030-NO-PROVIDER-SCHEDULER-RETRY-RECONCILIATION-OR-ADMISSION-EXECUTION');

const summary = {
  qualification_id: 'BOOK-WORKFLOW-ORCHESTRATOR-CANCELLATION-RESUME-001-QUALIFICATION',
  result: 'PASS',
  subject_sha: process.env.GITHUB_SHA || null,
  fixture_class: 'SYNTHETIC_NON_PRIVATE_CANCELLATION_RESUME_COORDINATION',
  planned_cases: 30,
  passed_cases: results.length,
  assertions: results.length,
  pause_resume_state_transition_executed: true,
  cancellation_state_transition_executed: true,
  provider_execution_performed: false,
  retry_executed: false,
  reconciliation_executed: false,
  canonical_manuscript_mutated: false,
  book_admission_executed: false,
  prose_runtime_mutated: false,
  fresh_blind_scoring_executed: false,
  durable_persistence_proven: false,
  a01_pass_claimed_for_this_subject: false,
  native_private_publication_production_claimed: false,
  results
};
if (results.length !== 30) throw new Error(`CASE_COUNT_MISMATCH:${results.length}`);
const out = path.join(process.env.RUNNER_TEMP || '/tmp', 'book-workflow-orchestrator-cancellation-resume-001-summary.json');
fs.writeFileSync(out, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
