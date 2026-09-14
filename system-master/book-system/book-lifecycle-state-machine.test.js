'use strict';

const assert = require('assert');
const lifecycle = require('./book-lifecycle-state-machine');

const contract = lifecycle.loadContract();
const SOURCE_A = 'a'.repeat(64);
const T0 = '2026-09-14T15:30:00-04:00';
let tick = 0;
function at() { tick += 1; return `2026-09-14T15:${String(30 + Math.floor(tick / 60)).padStart(2, '0')}:${String(tick % 60).padStart(2, '0')}-04:00`; }

function profile(overrides = {}) {
  return {
    project_mode: 'NEW_BOOK',
    exit_target: 'PRIVATE_COMPLETE',
    requires_research: false,
    requires_knowledge_canon: false,
    requires_draft: false,
    requires_macro_revision: false,
    requires_developmental: false,
    requires_line_style: false,
    requires_copy: false,
    requires_fact_citation: false,
    requires_rights: false,
    requires_proof: false,
    requires_publication_build: false,
    requires_release: false,
    requires_distribution: false,
    requires_reentry_edition: false,
    requires_submission_handoff: false,
    ...overrides
  };
}

function create(overrides = {}) {
  return lifecycle.createLifecycleState({
    lifecycle_id: overrides.lifecycle_id || `lc-${tick + 1}`,
    book_project_id: overrides.book_project_id || 'book-1',
    source_identity_digest: overrides.source_identity_digest || SOURCE_A,
    profile: overrides.profile || profile(),
    created_at: T0
  }, contract);
}

function satisfyAndComplete(state, phaseId) {
  const phase = contract.phases.find(p => p.phase_id === phaseId);
  state = lifecycle.recordPhaseProgress(state, phaseId, {
    satisfied_inputs: phase.required_inputs,
    resolved_decisions: phase.required_decisions
  }, at(), contract);
  if (state.phase_states[phaseId].status === 'READY') state = lifecycle.startPhase(state, phaseId, at(), contract);
  return lifecycle.completePhase(state, phaseId, `receipt:${phaseId}:${state.lifecycle_version}`, at(), contract);
}

function expectCode(fn, code) {
  assert.throws(fn, err => err && err.code === code, `expected ${code}`);
}

// Frozen contract shape and exact macro vocabulary.
lifecycle.validateContract(contract);
assert.deepStrictEqual(contract.phase_order, [
  'INTAKE','INTENT','RESEARCH','KNOWLEDGE_CANON','ARCHITECTURE','UNIT_DESIGN','DRAFT','MACRO_REVISION','DEVELOPMENTAL','LINE_STYLE',
  'COPY','FACT_CITATION','RIGHTS','PROOF','PUBLICATION_BUILD','RELEASE','DISTRIBUTION','PRESERVATION','REENTRY_EDITION','SUBMISSION_HANDOFF'
]);
assert.strictEqual(contract.phases.length, 20);
assert.strictEqual(contract.legacy_227_projection.source_atomic_step_count, 227);
assert.strictEqual(Object.values(contract.legacy_227_projection.target_step_counts).reduce((a, b) => a + b, 0), 227);
for (const phase of contract.phases) {
  for (const field of ['entry_state','required_inputs','required_decisions','allowed_operations','completion_gate','blocked_state','stale_state','reopen_rules','cancellation','recovery','next_step_calculation','applicability']) {
    assert.ok(Object.prototype.hasOwnProperty.call(phase, field), `${phase.phase_id} missing ${field}`);
  }
}

// Applicability: optional phases are true NOT_APPLICABLE, never fake COMPLETE.
let state = create();
assert.strictEqual(state.phase_states.INTAKE.status, 'READY');
assert.strictEqual(state.phase_states.RESEARCH.status, 'NOT_APPLICABLE');
assert.strictEqual(state.phase_states.PRESERVATION.applicable, true);
assert.strictEqual(state.phase_states.SUBMISSION_HANDOFF.status, 'NOT_APPLICABLE');
assert.strictEqual(lifecycle.calculateNextStep(state, contract).action, 'PROVIDE_INPUT');
assert.strictEqual(lifecycle.calculateNextStep(state, contract).phase_id, 'INTAKE');

// Profile constraints fail closed.
expectCode(() => lifecycle.validateProfile(profile({ requires_distribution: true }), contract), 'DISTRIBUTION_REQUIRES_RELEASE');
expectCode(() => lifecycle.validateProfile(profile({ requires_release: true }), contract), 'RELEASE_REQUIRES_PUBLICATION_BUILD');
expectCode(() => lifecycle.validateProfile(profile({ exit_target: 'SELF_PUBLISH_RELEASE' }), contract), 'SELF_PUBLISH_EXIT_REQUIRES_BUILD_RELEASE_DISTRIBUTION');
expectCode(() => lifecycle.validateProfile(profile({ exit_target: 'AGENT_OR_PUBLISHER_SUBMISSION' }), contract), 'SUBMISSION_EXIT_REQUIRES_SUBMISSION_HANDOFF');

// Exact-next: inputs, decisions, start, then operation.
const intake = contract.phases.find(p => p.phase_id === 'INTAKE');
state = lifecycle.recordPhaseProgress(state, 'INTAKE', { satisfied_inputs: intake.required_inputs }, at(), contract);
let next = lifecycle.calculateNextStep(state, contract);
assert.strictEqual(next.action, 'RESOLVE_DECISION');
assert.strictEqual(next.decision_id, intake.required_decisions[0]);
state = lifecycle.recordPhaseProgress(state, 'INTAKE', { resolved_decisions: intake.required_decisions }, at(), contract);
next = lifecycle.calculateNextStep(state, contract);
assert.deepStrictEqual(next, { action: 'START_PHASE', phase_id: 'INTAKE' });
state = lifecycle.startPhase(state, 'INTAKE', at(), contract);
next = lifecycle.calculateNextStep(state, contract);
assert.strictEqual(next.action, 'EXECUTE_OPERATION');
assert.strictEqual(next.operation_id, intake.allowed_operations[0]);
state = lifecycle.completePhase(state, 'INTAKE', 'receipt:intake', at(), contract);
assert.strictEqual(state.phase_states.INTENT.status, 'READY');
assert.strictEqual(lifecycle.calculateNextStep(state, contract).phase_id, 'INTENT');

// Blocked state dominates progression and requires explicit unblock.
let blocked = create({ lifecycle_id: 'blocked' });
blocked = lifecycle.blockPhase(blocked, 'INTAKE', ['blocker:missing-source'], at(), contract);
next = lifecycle.calculateNextStep(blocked, contract);
assert.strictEqual(next.action, 'RESOLVE_BLOCKER');
assert.deepStrictEqual(next.blocker_refs, ['blocker:missing-source']);
blocked = lifecycle.unblockPhase(blocked, 'INTAKE', at(), contract);
assert.strictEqual(blocked.phase_states.INTAKE.status, 'READY');

// Cancellation preserves a checkpoint and recovery restores READY only against current source.
let cancelled = create({ lifecycle_id: 'cancelled' });
cancelled = lifecycle.cancelPhase(cancelled, 'INTAKE', 'checkpoint:intake:1', at(), contract);
assert.strictEqual(cancelled.phase_states.INTAKE.status, 'CANCELLED');
assert.strictEqual(lifecycle.calculateNextStep(cancelled, contract).action, 'RECOVER_PHASE');
expectCode(() => lifecycle.recoverPhase(cancelled, 'INTAKE', 'b'.repeat(64), 'checkpoint:intake:1', at(), contract), 'RECOVERY_SOURCE_NOT_CURRENT');
cancelled = lifecycle.recoverPhase(cancelled, 'INTAKE', SOURCE_A, 'checkpoint:intake:1', at(), contract);
assert.strictEqual(cancelled.phase_states.INTAKE.status, 'READY');

// Reprofile: adding an earlier applicable phase inserts it and stales later completed dependencies.
let repro = create({ lifecycle_id: 'reprofile' });
repro = satisfyAndComplete(repro, 'INTAKE');
repro = satisfyAndComplete(repro, 'INTENT');
repro = satisfyAndComplete(repro, 'ARCHITECTURE');
repro = satisfyAndComplete(repro, 'UNIT_DESIGN');
assert.strictEqual(repro.phase_states.ARCHITECTURE.status, 'COMPLETE');
repro = lifecycle.reprofileLifecycle(repro, profile({ requires_research: true }), at(), contract);
assert.strictEqual(repro.phase_states.RESEARCH.applicable, true);
assert.strictEqual(repro.phase_states.RESEARCH.status, 'READY');
assert.strictEqual(repro.phase_states.ARCHITECTURE.status, 'STALE');
next = lifecycle.calculateNextStep(repro, contract);
assert.strictEqual(next.phase_id, 'RESEARCH');

// User-requested COPY -> FACT/CITATION ordering is safe: a fact correction stales COPY backward and downstream evidence.
let correction = create({ lifecycle_id: 'fact-correction', profile: profile({ requires_copy: true, requires_fact_citation: true }) });
correction = satisfyAndComplete(correction, 'INTAKE');
correction = satisfyAndComplete(correction, 'INTENT');
correction = satisfyAndComplete(correction, 'ARCHITECTURE');
correction = satisfyAndComplete(correction, 'UNIT_DESIGN');
correction = satisfyAndComplete(correction, 'COPY');
correction = satisfyAndComplete(correction, 'FACT_CITATION');
assert.strictEqual(correction.phase_states.COPY.status, 'COMPLETE');
assert.strictEqual(correction.phase_states.FACT_CITATION.status, 'COMPLETE');
correction = lifecycle.applyInvalidationEvent(correction, 'FACT_CORRECTION_ADMITTED', at(), contract);
assert.strictEqual(correction.phase_states.COPY.status, 'STALE');
assert.strictEqual(correction.phase_states.FACT_CITATION.status, 'STALE');
assert.ok(correction.phase_states.COPY.superseded_completion_receipt_refs.length === 1);
next = lifecycle.calculateNextStep(correction, contract);
assert.strictEqual(next.action, 'REVALIDATE_OR_REOPEN');
assert.strictEqual(next.phase_id, 'COPY');

// Reopen keeps historical completion receipt as superseded provenance and invalidates downstream completion.
let reopened = create({ lifecycle_id: 'reopen' });
reopened = satisfyAndComplete(reopened, 'INTAKE');
reopened = satisfyAndComplete(reopened, 'INTENT');
const oldReceipt = reopened.phase_states.INTENT.completion_receipt_ref;
reopened = lifecycle.reopenPhase(reopened, 'INTENT', at(), contract);
assert.strictEqual(reopened.phase_states.INTENT.status, 'READY');
assert.ok(reopened.phase_states.INTENT.superseded_completion_receipt_refs.includes(oldReceipt));
assert.strictEqual(reopened.phase_states.INTENT.completion_receipt_ref, null);

// Minimal valid Book uses only mandatory phases; no optional phase is falsely completed.
let minimal = create({ lifecycle_id: 'minimal' });
for (const phaseId of ['INTAKE','INTENT','ARCHITECTURE','UNIT_DESIGN','PRESERVATION']) minimal = satisfyAndComplete(minimal, phaseId);
assert.strictEqual(minimal.lifecycle_status, 'COMPLETE');
assert.deepStrictEqual(lifecycle.calculateNextStep(minimal, contract), { action: 'LIFECYCLE_COMPLETE', phase_id: null });
assert.strictEqual(minimal.phase_states.DRAFT.status, 'NOT_APPLICABLE');
assert.strictEqual(minimal.phase_states.RELEASE.status, 'NOT_APPLICABLE');

console.log('BOOK_LIFECYCLE_STATE_MACHINE_TESTS_PASS');
