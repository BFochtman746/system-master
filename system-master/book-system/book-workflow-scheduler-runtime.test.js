'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const stateModel = require('./book-workflow-state-model');
const planRuntime = require('./book-workflow-execution-plan');
const routing = require('./book-capability-routing-interface');
const durable = require('./book-workflow-durable-store');
const scheduler = require('./book-workflow-scheduler-runtime');

function h(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function makeClock() {
  let tick = 0;
  const base = Date.parse('2026-09-11T18:30:00-04:00');
  return () => new Date(base + (tick++ * 1000)).toISOString();
}
function sourceIdentity() {
  return {
    book_state_version: 1,
    book_state_digest: h('book-state-scheduler'),
    canonical_manuscript_ref: 'book://canonical/scheduler-001',
    manuscript_version_id: 'mv-scheduler-001',
    manuscript_digest_sha256: h('manuscript-identity-only')
  };
}
function makeWorkflow(id) {
  let state = stateModel.createWorkflowState({
    workflow_id: id,
    book_project_id: 'book-scheduler-001',
    objective: 'execute bounded Book coordination work without canonical effect',
    target_section_ref: 'section://scheduler-fixture',
    source_identity: sourceIdentity(),
    input_hashes: { 'input-ref': h(`input:${id}`) },
    created_at: '2026-09-11T18:30:00-04:00'
  });
  state = stateModel.advanceWorkflowState(state, { workflow_status: 'PLANNING' });
  state = stateModel.advanceWorkflowState(state, { workflow_status: 'READY' });
  return state;
}
function task(id, capabilityId, authorityDomain, requiredDeps = [], required = true) {
  return {
    task_id: id,
    task_class: 'SPECIALIST_SERVICE_TASK',
    capability_id: capabilityId,
    required_authority_domain: authorityDomain,
    authority_wait_owner: null,
    required_dependency_ids: requiredDeps,
    optional_dependency_ids: [],
    input_ref_hashes: { [`ref:${id}`]: h(`ref:${id}`) },
    context_package_refs: [],
    required_for_plan_success: required
  };
}
function makePlan(state, id, tasks) {
  return planRuntime.createExecutionPlan({
    plan_id: id,
    book_project_id: state.book_project_id,
    objective_ref: `objective://${id}`,
    objective_hash_sha256: h(`objective:${id}`),
    tasks,
    created_at: '2026-09-11T18:31:00-04:00'
  }, state, routing.loadDefaultRegistry());
}
function resultFor(req) {
  return {
    result_ref: `evidence://${req.scheduler_run_id}/${req.task_id}/${req.attempt_number}`,
    result_digest: h(`${req.scheduler_run_id}:${req.task_id}:${req.attempt_number}`),
    result_class: 'SUCCESS',
    evidence_refs: [`evidence://${req.task_id}/receipt`]
  };
}

let checks = 0;
function ok(value, message) { assert(value, message); checks += 1; }
function eq(actual, expected, message) { assert.strictEqual(actual, expected, message); checks += 1; }
function deep(actual, expected, message) { assert.deepStrictEqual(actual, expected, message); checks += 1; }
async function rejectsCode(fn, code) {
  let caught = null;
  try { await fn(); } catch (err) { caught = err; }
  ok(caught, `expected error ${code}`);
  eq(caught.code, code, `expected code ${code}`);
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'book-scheduler-runtime-'));
  try {
    const adapter = durable.createFileSystemAdapter(root);

    // 1. Bounded execution: two independent Research tasks run together, a dependent task waits,
    // and one transient unknown outcome is replayed only because the registered operation is idempotent.
    const state = makeWorkflow('wf-scheduler-main');
    const plan = makePlan(state, 'plan-scheduler-main', [
      task('research-a', 'RESEARCH.ACQUIRE_BOUNDED_EVIDENCE', 'EXTERNAL_EVIDENCE_TRUTH'),
      task('research-b', 'RESEARCH.ACQUIRE_BOUNDED_EVIDENCE', 'EXTERNAL_EVIDENCE_TRUTH'),
      task('research-c', 'RESEARCH.REVALIDATE_EVIDENCE_FRESHNESS', 'EXTERNAL_EVIDENCE_TRUTH', ['research-a','research-b'])
    ]);
    let active = 0;
    let maxActive = 0;
    const calls = [];
    const worker = {
      async dispatch(req) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        calls.push({ task_id: req.task_id, attempt_number: req.attempt_number, idempotency_key: req.idempotency_key });
        try {
          await delay(15);
          if (req.task_id === 'research-b' && req.attempt_number === 1) {
            const err = new Error('synthetic transient unknown outcome');
            err.code = 'SYNTHETIC_TRANSIENT_UNKNOWN';
            throw err;
          }
          return resultFor(req);
        } finally {
          active -= 1;
        }
      }
    };
    const store = scheduler.createSchedulerStore(adapter);
    const run = await scheduler.executeSchedulerRun({
      run_id: 'run-main',
      plan,
      workflow_state: state,
      store,
      worker,
      max_concurrency: 2,
      max_task_attempts: 2,
      clock: makeClock()
    });
    eq(run.run_state, 'COMPLETED');
    eq(run.canonical_effect_performed, false);
    eq(run.task_records['research-a'].state, 'SUCCEEDED');
    eq(run.task_records['research-b'].state, 'SUCCEEDED');
    eq(run.task_records['research-c'].state, 'SUCCEEDED');
    eq(run.task_records['research-b'].attempts.length, 2);
    eq(run.task_records['research-b'].attempts[0].retry_decision_class, 'SAFE_SAME_OPERATION_REPLAY');
    eq(run.task_records['research-b'].idempotency_key, calls.filter(x => x.task_id === 'research-b')[0].idempotency_key);
    eq(calls.filter(x => x.task_id === 'research-b')[0].idempotency_key, calls.filter(x => x.task_id === 'research-b')[1].idempotency_key);
    eq(maxActive, 2);
    ok(calls.findIndex(x => x.task_id === 'research-c') > calls.findIndex(x => x.task_id === 'research-b'), 'dependent research-c must dispatch after research-b starts/completes its batch');
    deep(scheduler.createSchedulerStore(durable.createFileSystemAdapter(root)).loadRun('run-main'), run);

    // 2. Durable pause/resume: completed work is not replayed after a new store instance resumes.
    const pauseState = makeWorkflow('wf-scheduler-pause');
    const pausePlan = makePlan(pauseState, 'plan-scheduler-pause', [
      task('pause-a', 'RESEARCH.ACQUIRE_BOUNDED_EVIDENCE', 'EXTERNAL_EVIDENCE_TRUTH'),
      task('pause-b', 'RESEARCH.ACQUIRE_BOUNDED_EVIDENCE', 'EXTERNAL_EVIDENCE_TRUTH'),
      task('pause-c', 'RESEARCH.REVALIDATE_EVIDENCE_FRESHNESS', 'EXTERNAL_EVIDENCE_TRUTH', ['pause-a','pause-b'])
    ]);
    const pauseCalls = [];
    const pauseWorker = {
      async dispatch(req) {
        pauseCalls.push(req.task_id);
        await delay(5);
        return resultFor(req);
      }
    };
    const paused = await scheduler.executeSchedulerRun({
      run_id: 'run-pause', plan: pausePlan, workflow_state: pauseState,
      store: scheduler.createSchedulerStore(adapter), worker: pauseWorker,
      max_concurrency: 2, max_task_attempts: 2, clock: makeClock(),
      should_pause: ({ completed_batches }) => completed_batches === 1
    });
    eq(paused.run_state, 'PAUSED');
    eq(paused.task_records['pause-a'].state, 'SUCCEEDED');
    eq(paused.task_records['pause-b'].state, 'SUCCEEDED');
    eq(paused.task_records['pause-c'].state, 'PENDING');
    const callsBeforeResume = pauseCalls.length;
    const resumed = await scheduler.executeSchedulerRun({
      run_id: 'run-pause', plan: pausePlan, workflow_state: pauseState,
      store: scheduler.createSchedulerStore(durable.createFileSystemAdapter(root)), worker: pauseWorker,
      max_concurrency: 2, max_task_attempts: 2, clock: makeClock(), resume: true
    });
    eq(resumed.run_state, 'COMPLETED');
    eq(pauseCalls.length, callsBeforeResume + 1);
    eq(pauseCalls.filter(x => x === 'pause-a').length, 1);
    eq(pauseCalls.filter(x => x === 'pause-b').length, 1);
    eq(pauseCalls.filter(x => x === 'pause-c').length, 1);

    // 3. Authority fences: retired Prose/evaluator execution, authority waits, blocked interfaces,
    // and Book admission are all represented but never dispatched.
    const fenceState = makeWorkflow('wf-scheduler-fences');
    const fenceTasks = [
      task('retired-prose', 'PROSE.ANALYZE_PASSAGE', 'LITERARY_DIAGNOSIS', [], false),
      task('retired-evaluator', 'EVALUATION.INDEPENDENT_BOOK_OR_UNIT', 'LITERARY_EVALUATION_EVIDENCE', [], false),
      {
        task_id: 'canon-blocked', task_class: 'DECLARED_BLOCKED_CAPABILITY', capability_id: 'CANON.CONSISTENCY_CHECK', required_authority_domain: 'CANON_TRUTH', authority_wait_owner: null,
        required_dependency_ids: [], optional_dependency_ids: [], input_ref_hashes: { 'ref:canon': h('canon') }, context_package_refs: [], required_for_plan_success: false
      },
      {
        task_id: 'author-wait', task_class: 'AUTHORITY_WAIT', capability_id: null, required_authority_domain: null, authority_wait_owner: 'AUTHOR',
        required_dependency_ids: [], optional_dependency_ids: [], input_ref_hashes: { 'ref:author': h('author') }, context_package_refs: [], required_for_plan_success: false
      },
      {
        task_id: 'book-admission', task_class: 'BOOK_ADMISSION_HANDOFF', capability_id: 'BOOK.CANONICAL_MANUSCRIPT_ADMISSION', required_authority_domain: 'CANONICAL_MANUSCRIPT_MUTATION', authority_wait_owner: null,
        required_dependency_ids: [], optional_dependency_ids: [], input_ref_hashes: { 'ref:admission': h('admission') }, context_package_refs: [], required_for_plan_success: false
      }
    ];
    const fencePlan = makePlan(fenceState, 'plan-scheduler-fences', fenceTasks);
    let forbiddenDispatches = 0;
    const fenceRun = await scheduler.executeSchedulerRun({
      run_id: 'run-fences', plan: fencePlan, workflow_state: fenceState,
      store: scheduler.createSchedulerStore(adapter),
      worker: { async dispatch() { forbiddenDispatches += 1; throw new Error('must not dispatch'); } },
      max_concurrency: 2, max_task_attempts: 2, clock: makeClock()
    });
    eq(fenceRun.run_state, 'PARTIAL_BLOCKED');
    eq(forbiddenDispatches, 0);
    eq(fenceRun.task_records['retired-prose'].withhold_reason, 'RETIRED_PROSE_EXECUTION_FORBIDDEN');
    eq(fenceRun.task_records['retired-evaluator'].withhold_reason, 'RETIRED_PROSE_EXECUTION_FORBIDDEN');
    eq(fenceRun.task_records['canon-blocked'].withhold_reason, 'DECLARED_CAPABILITY_NOT_CALLABLE');
    eq(fenceRun.task_records['author-wait'].withhold_reason, 'AUTHORITY_WAIT_NOT_DISPATCHABLE');
    eq(fenceRun.task_records['book-admission'].withhold_reason, 'BOOK_ADMISSION_EXECUTION_FORBIDDEN');

    // 4. Worker output cannot smuggle raw/canonical authority; the scheduler retries only with
    // the same idempotency key, then fails closed with hashed error evidence.
    const effectState = makeWorkflow('wf-scheduler-effect-fence');
    const effectPlan = makePlan(effectState, 'plan-scheduler-effect-fence', [task('effect-task', 'RESEARCH.ACQUIRE_BOUNDED_EVIDENCE', 'EXTERNAL_EVIDENCE_TRUTH')]);
    const effectKeys = [];
    const effectRun = await scheduler.executeSchedulerRun({
      run_id: 'run-effect-fence', plan: effectPlan, workflow_state: effectState,
      store: scheduler.createSchedulerStore(adapter),
      worker: { async dispatch(req) {
        effectKeys.push(req.idempotency_key);
        return { ...resultFor(req), canonical_manuscript_state: { changed: true } };
      } },
      max_concurrency: 1, max_task_attempts: 2, clock: makeClock()
    });
    eq(effectRun.run_state, 'FAILED_CLOSED');
    eq(effectRun.task_records['effect-task'].state, 'FAILED');
    eq(effectRun.task_records['effect-task'].attempts.length, 2);
    eq(effectRun.task_records['effect-task'].attempts[0].error_code, 'WORKER_RESULT_FORBIDDEN_AUTHORITY_FIELD');
    eq(effectKeys.length, 2);
    eq(effectKeys[0], effectKeys[1]);
    eq(effectRun.canonical_effect_performed, false);

    // 5. Exact-subject binding is immutable: same run ID cannot be replayed against another plan,
    // and execution limits are hard-bounded.
    const changedPlan = makePlan(state, 'plan-scheduler-changed', [task('research-z', 'RESEARCH.ACQUIRE_BOUNDED_EVIDENCE', 'EXTERNAL_EVIDENCE_TRUTH')]);
    await rejectsCode(() => scheduler.executeSchedulerRun({
      run_id: 'run-main', plan: changedPlan, workflow_state: state, store, worker,
      max_concurrency: 2, max_task_attempts: 2, clock: makeClock()
    }), 'RUN_BINDING_MISMATCH');
    await rejectsCode(() => scheduler.executeSchedulerRun({
      run_id: 'run-invalid-limit', plan, workflow_state: state, store, worker,
      max_concurrency: 9, max_task_attempts: 2, clock: makeClock()
    }), 'MAX_CONCURRENCY_OUT_OF_RANGE');

    console.log(JSON.stringify({
      result: 'PASS',
      cases: checks,
      max_parallel_workers_observed: maxActive,
      idempotent_unknown_outcome_replayed: true,
      durable_pause_resume: true,
      completed_tasks_not_redispatched: true,
      retired_prose_dispatches: forbiddenDispatches,
      book_admission_dispatches: forbiddenDispatches,
      canonical_effect_performed: false
    }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(err => {
  console.error(err && err.stack || err);
  process.exit(1);
});