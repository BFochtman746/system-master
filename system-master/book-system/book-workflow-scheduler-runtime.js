'use strict';

const crypto = require('crypto');
const planRuntime = require('./book-workflow-execution-plan');
const routing = require('./book-capability-routing-interface');
const concurrency = require('./book-workflow-concurrency-rules');
const retry = require('./book-workflow-retry-idempotency-rules');
const durable = require('./book-workflow-durable-store');

const RUN_SCHEMA_VERSION = 1;
const SHA256 = /^[a-f0-9]{64}$/;
const RUN_STATES = new Set(['RUNNING','PAUSED','COMPLETED','PARTIAL_BLOCKED','FAILED_CLOSED']);
const TASK_STATES = new Set(['PENDING','PENDING_SERIAL','RUNNING','SUCCEEDED','FAILED','WITHHELD','BLOCKED']);
const TERMINAL_TASK_STATES = new Set(['SUCCEEDED','FAILED','WITHHELD','BLOCKED']);
const RESULT_CLASSES = new Set(['SUCCESS','PARTIAL','ABSTAIN','REJECTED','ERROR']);
const FORBIDDEN_WORKER_FIELDS = new Set([
  'manuscript_text','passage_text','candidate_text','raw_manuscript','raw_passage','raw_candidate',
  'canonical_manuscript','canonical_manuscript_state','next_canonical_manuscript_ref',
  'apply_revision_to_canonical','admit_canonical_manuscript','canonical_write_allowed',
  'lifecycle_transition_allowed','export_freeze_allowed','publication_authorized'
]);

class BookWorkflowSchedulerError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'BookWorkflowSchedulerError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new BookWorkflowSchedulerError(code, detail); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function stableNormalize(v) {
  if (Array.isArray(v)) return v.map(stableNormalize);
  if (isObject(v)) {
    const out = {};
    for (const key of Object.keys(v).sort()) out[key] = stableNormalize(v[key]);
    return out;
  }
  return v;
}
function stableStringify(v) { return JSON.stringify(stableNormalize(v)); }
function sha256(v) { return crypto.createHash('sha256').update(String(v), 'utf8').digest('hex'); }
function nowIso() { return new Date().toISOString(); }

function assertNoWorkerAuthority(value, where = 'worker_result') {
  if (Array.isArray(value)) return value.forEach((item, i) => assertNoWorkerAuthority(item, `${where}.${i}`));
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_WORKER_FIELDS.has(key)) fail('WORKER_RESULT_FORBIDDEN_AUTHORITY_FIELD', `${where}.${key}`);
    assertNoWorkerAuthority(child, `${where}.${key}`);
  }
  try {
    durable.assertCoordinationOnly(value, where);
  } catch (err) {
    fail('WORKER_RESULT_FORBIDDEN_COORDINATION_EFFECT', err.code || err.name || 'UNKNOWN');
  }
}

function runDigest(run) {
  const copy = clone(run);
  delete copy.run_digest;
  return sha256(stableStringify(copy));
}

function sealRun(run) {
  const next = clone(run);
  delete next.run_digest;
  next.run_digest = runDigest(next);
  return next;
}

function validateTaskRecord(record) {
  if (!isObject(record) || !nonEmpty(record.task_id) || !TASK_STATES.has(record.state)) fail('INVALID_TASK_RECORD', String(record && record.task_id || ''));
  if (!Number.isInteger(record.topological_layer) || record.topological_layer < 0) fail('INVALID_TASK_LAYER', record.task_id);
  if (!Array.isArray(record.required_dependency_ids) || !Array.isArray(record.optional_dependency_ids) || !Array.isArray(record.attempts) || !Array.isArray(record.evidence_refs)) fail('INVALID_TASK_RECORD_ARRAY', record.task_id);
  if (record.operation_digest !== null && !SHA256.test(String(record.operation_digest))) fail('INVALID_TASK_OPERATION_DIGEST', record.task_id);
  if (record.result_digest !== null && !SHA256.test(String(record.result_digest))) fail('INVALID_TASK_RESULT_DIGEST', record.task_id);
  if (record.registered_idempotent !== null && typeof record.registered_idempotent !== 'boolean') fail('INVALID_TASK_IDEMPOTENCY_FLAG', record.task_id);
}

function validateRunRecord(run) {
  if (!isObject(run)) fail('SCHEDULER_RUN_REQUIRED');
  try { durable.assertCoordinationOnly(run, 'scheduler_run'); } catch (err) { fail('SCHEDULER_RUN_FORBIDDEN_EFFECT', err.code || err.name || 'UNKNOWN'); }
  const required = ['run_schema_version','run_id','run_version','run_digest','plan_id','plan_digest','workflow_id','workflow_digest','source_identity','max_concurrency','max_task_attempts','run_state','task_records','events','canonical_effect_performed','created_at','updated_at'];
  for (const field of required) if (!Object.prototype.hasOwnProperty.call(run, field)) fail('SCHEDULER_RUN_FIELD_MISSING', field);
  if (run.run_schema_version !== RUN_SCHEMA_VERSION) fail('SCHEDULER_RUN_SCHEMA_MISMATCH');
  if (!nonEmpty(run.run_id) || !nonEmpty(run.plan_id) || !SHA256.test(String(run.plan_digest || '')) || !nonEmpty(run.workflow_id) || !SHA256.test(String(run.workflow_digest || ''))) fail('SCHEDULER_RUN_IDENTITY_INVALID');
  if (!Number.isInteger(run.run_version) || run.run_version < 1) fail('SCHEDULER_RUN_VERSION_INVALID');
  if (!Number.isInteger(run.max_concurrency) || run.max_concurrency < 1 || run.max_concurrency > 8) fail('MAX_CONCURRENCY_OUT_OF_RANGE');
  if (!Number.isInteger(run.max_task_attempts) || run.max_task_attempts < 1 || run.max_task_attempts > 3) fail('MAX_TASK_ATTEMPTS_OUT_OF_RANGE');
  if (!RUN_STATES.has(run.run_state)) fail('SCHEDULER_RUN_STATE_INVALID', String(run.run_state));
  if (!isObject(run.task_records) || !Array.isArray(run.events)) fail('SCHEDULER_RUN_COLLECTION_INVALID');
  if (run.canonical_effect_performed !== false) fail('SCHEDULER_CANONICAL_EFFECT_FORBIDDEN');
  for (const [taskId, record] of Object.entries(run.task_records)) {
    if (taskId !== record.task_id) fail('TASK_RECORD_KEY_MISMATCH', taskId);
    validateTaskRecord(record);
  }
  if (run.run_digest !== runDigest(run)) fail('SCHEDULER_RUN_DIGEST_MISMATCH');
  return true;
}

function createSchedulerStore(adapter) {
  if (!adapter || typeof adapter.read !== 'function' || typeof adapter.writeAtomic !== 'function') fail('SCHEDULER_DURABLE_ADAPTER_REQUIRED');
  function key(runId) { if (!nonEmpty(runId)) fail('RUN_ID_REQUIRED'); return `book-workflow-scheduler-run:${runId}`; }
  function loadRun(runId) {
    const envelope = adapter.read(key(runId));
    if (envelope === null) return null;
    if (envelope.store_schema_version !== 1 || envelope.record_type !== 'SCHEDULER_RUN' || envelope.record_id !== runId) fail('SCHEDULER_STORE_ENVELOPE_INVALID', runId);
    if (!isObject(envelope.record) || envelope.record.run_digest !== envelope.record_digest) fail('SCHEDULER_STORE_DIGEST_BINDING_MISMATCH', runId);
    validateRunRecord(envelope.record);
    return clone(envelope.record);
  }
  function saveRun(run, expectedCurrent = null) {
    validateRunRecord(run);
    const storageKey = key(run.run_id);
    const existingEnvelope = adapter.read(storageKey);
    if (existingEnvelope === null) {
      if (run.run_version !== 1) fail('INITIAL_SCHEDULER_RUN_VERSION_MUST_BE_ONE');
      if (expectedCurrent !== null) fail('INITIAL_SCHEDULER_EXPECTATION_MUST_BE_NULL');
    } else {
      const current = loadRun(run.run_id);
      if (current.run_digest === run.run_digest) return { persisted: false, idempotent: true, run_version: current.run_version, run_digest: current.run_digest };
      if (!isObject(expectedCurrent) || !Number.isInteger(expectedCurrent.run_version) || !SHA256.test(String(expectedCurrent.run_digest || ''))) fail('SCHEDULER_STALE_WRITE_EXPECTATION_REQUIRED');
      if (current.run_version !== expectedCurrent.run_version || current.run_digest !== expectedCurrent.run_digest) fail('STALE_SCHEDULER_RUN_WRITE');
      if (run.run_version !== current.run_version + 1) fail('SCHEDULER_RUN_VERSION_MUST_ADVANCE_BY_ONE');
    }
    adapter.writeAtomic(storageKey, {
      store_schema_version: 1,
      record_type: 'SCHEDULER_RUN',
      record_id: run.run_id,
      record_version: run.run_version,
      record_digest: run.run_digest,
      canonical_effect_allowed: false,
      record: clone(run)
    });
    return { persisted: true, idempotent: false, run_version: run.run_version, run_digest: run.run_digest };
  }
  return Object.freeze({ loadRun, saveRun });
}

function isRetiredProseCapability(capability) {
  return capability && (
    String(capability.owner_path || '').includes('/PROSE') ||
    String(capability.capability_id || '').startsWith('PROSE.') ||
    String(capability.service_id || '') === 'PROSE_ANALYSIS_AND_REVISION' ||
    String(capability.service_id || '') === 'BOOK_EVALUATION'
  );
}

function taskInitialDisposition(task, decision, routingRegistry) {
  if (task.task_class === 'BOOK_ADMISSION_HANDOFF') return { state: 'WITHHELD', reason: 'BOOK_ADMISSION_EXECUTION_FORBIDDEN' };
  if (task.task_class === 'AUTHORITY_WAIT') return { state: 'WITHHELD', reason: 'AUTHORITY_WAIT_NOT_DISPATCHABLE' };
  if (task.task_class === 'DECLARED_BLOCKED_CAPABILITY') return { state: 'WITHHELD', reason: 'DECLARED_CAPABILITY_NOT_CALLABLE' };
  const capability = routing.resolveCallableCapability({ capability_id: task.capability_id, required_authority_domain: task.required_authority_domain }, routingRegistry);
  if (capability.canonical_write_authority) return { state: 'WITHHELD', reason: 'CANONICAL_WRITE_CAPABILITY_FORBIDDEN' };
  if (isRetiredProseCapability(capability)) return { state: 'WITHHELD', reason: 'RETIRED_PROSE_EXECUTION_FORBIDDEN' };
  if (decision.policy_class === 'ISOLATION_GATED') return { state: 'WITHHELD', reason: 'ISOLATION_GATE_UNSATISFIED' };
  if (decision.policy_class === 'NONEXECUTABLE_BLOCKER') return { state: 'WITHHELD', reason: 'NONEXECUTABLE_POLICY_CLASS' };
  if (decision.policy_class === 'BOOK_ADMISSION_SERIAL_ONLY') return { state: 'WITHHELD', reason: 'BOOK_ADMISSION_EXECUTION_FORBIDDEN' };
  if (decision.policy_class === 'READ_ONLY_PARALLEL_ELIGIBLE') return { state: 'PENDING', reason: null };
  if (decision.policy_class === 'SERIAL_ONLY_NONIDEMPOTENT_OR_SIDE_EFFECTING') return { state: 'PENDING_SERIAL', reason: null };
  return { state: 'WITHHELD', reason: 'UNSUPPORTED_POLICY_CLASS' };
}

function makeInitialRun({ runId, plan, workflowState, concurrencyDecision, routingRegistry, maxConcurrency, maxTaskAttempts, timestamp }) {
  const decisionByTask = new Map(concurrencyDecision.task_decisions.map(d => [d.task_id, d]));
  const taskRecords = {};
  for (const task of plan.tasks) {
    const decision = decisionByTask.get(task.task_id);
    if (!decision) fail('CONCURRENCY_DECISION_TASK_MISSING', task.task_id);
    const disposition = taskInitialDisposition(task, decision, routingRegistry);
    taskRecords[task.task_id] = {
      task_id: task.task_id,
      task_class: task.task_class,
      capability_id: task.capability_id,
      required_authority_domain: task.required_authority_domain,
      required_dependency_ids: clone(task.required_dependency_ids),
      optional_dependency_ids: clone(task.optional_dependency_ids),
      topological_layer: decision.topological_layer,
      policy_class: decision.policy_class,
      state: disposition.state,
      withhold_reason: disposition.reason,
      operation_digest: null,
      idempotency_key: null,
      registered_idempotent: null,
      attempts: [],
      result_ref: null,
      result_digest: null,
      result_class: null,
      evidence_refs: []
    };
  }
  return sealRun({
    run_schema_version: RUN_SCHEMA_VERSION,
    run_id: runId,
    run_version: 1,
    run_digest: '',
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    workflow_id: workflowState.workflow_id,
    workflow_digest: workflowState.workflow_digest,
    source_identity: clone(workflowState.source_identity),
    max_concurrency: maxConcurrency,
    max_task_attempts: maxTaskAttempts,
    run_state: 'RUNNING',
    task_records: taskRecords,
    events: [{ event_type: 'SCHEDULER_RUN_CREATED', at: timestamp }],
    canonical_effect_performed: false,
    created_at: timestamp,
    updated_at: timestamp
  });
}

function assertRunBinding(run, plan, workflowState, maxConcurrency, maxTaskAttempts) {
  validateRunRecord(run);
  if (run.plan_id !== plan.plan_id || run.plan_digest !== plan.plan_digest || run.workflow_id !== workflowState.workflow_id || run.workflow_digest !== workflowState.workflow_digest) fail('RUN_BINDING_MISMATCH');
  if (stableStringify(run.source_identity) !== stableStringify(workflowState.source_identity)) fail('RUN_SOURCE_BINDING_MISMATCH');
  if (run.max_concurrency !== maxConcurrency || run.max_task_attempts !== maxTaskAttempts) fail('RUN_EXECUTION_POLICY_MISMATCH');
}

function persistMutation(store, current, mutate, clock) {
  const next = clone(current);
  mutate(next);
  next.run_version = current.run_version + 1;
  next.updated_at = clock();
  const sealed = sealRun(next);
  store.saveRun(sealed, { run_version: current.run_version, run_digest: current.run_digest });
  return sealed;
}

function validateWorkerResult(result) {
  if (!isObject(result)) fail('WORKER_RESULT_REQUIRED');
  assertNoWorkerAuthority(result);
  for (const field of ['result_ref','result_digest','result_class','evidence_refs']) if (!Object.prototype.hasOwnProperty.call(result, field)) fail('WORKER_RESULT_FIELD_MISSING', field);
  if (!nonEmpty(result.result_ref) || !SHA256.test(String(result.result_digest || '')) || !RESULT_CLASSES.has(result.result_class)) fail('WORKER_RESULT_IDENTITY_INVALID');
  if (!Array.isArray(result.evidence_refs) || result.evidence_refs.some(x => !nonEmpty(x)) || new Set(result.evidence_refs).size !== result.evidence_refs.length) fail('WORKER_RESULT_EVIDENCE_INVALID');
  return true;
}

function requiredDependencyFailure(record, taskRecords) {
  for (const depId of record.required_dependency_ids) {
    const dep = taskRecords[depId];
    if (!dep) return { depId, state: 'MISSING' };
    if (['FAILED','WITHHELD','BLOCKED'].includes(dep.state)) return { depId, state: dep.state };
  }
  return null;
}

function taskReady(record, taskRecords) {
  if (!['PENDING','PENDING_SERIAL'].includes(record.state)) return false;
  if (record.required_dependency_ids.some(id => !taskRecords[id] || taskRecords[id].state !== 'SUCCEEDED')) return false;
  if (record.optional_dependency_ids.some(id => !taskRecords[id] || !TERMINAL_TASK_STATES.has(taskRecords[id].state))) return false;
  return true;
}

function normalizeInterruptedAndBlocked(store, run, clock) {
  let changed = false;
  const next = clone(run);
  for (const record of Object.values(next.task_records)) {
    if (record.state === 'RUNNING') {
      if (record.registered_idempotent === true) {
        record.state = record.policy_class === 'SERIAL_ONLY_NONIDEMPOTENT_OR_SIDE_EFFECTING' ? 'PENDING_SERIAL' : 'PENDING';
        record.withhold_reason = null;
        next.events.push({ event_type: 'INTERRUPTED_IDEMPOTENT_TASK_REQUEUED', task_id: record.task_id, at: clock() });
      } else {
        record.state = 'BLOCKED';
        record.withhold_reason = 'INTERRUPTED_NONIDEMPOTENT_RECONCILIATION_REQUIRED';
        next.events.push({ event_type: 'INTERRUPTED_NONIDEMPOTENT_TASK_BLOCKED', task_id: record.task_id, at: clock() });
      }
      changed = true;
    }
  }
  let passChanged = true;
  while (passChanged) {
    passChanged = false;
    for (const record of Object.values(next.task_records)) {
      if (!['PENDING','PENDING_SERIAL'].includes(record.state)) continue;
      const failed = requiredDependencyFailure(record, next.task_records);
      if (failed) {
        record.state = 'BLOCKED';
        record.withhold_reason = `REQUIRED_DEPENDENCY_NOT_SATISFIED:${failed.depId}:${failed.state}`;
        next.events.push({ event_type: 'TASK_BLOCKED_BY_REQUIRED_DEPENDENCY', task_id: record.task_id, dependency_task_id: failed.depId, dependency_state: failed.state, at: clock() });
        changed = true;
        passChanged = true;
      }
    }
  }
  if (!changed) return run;
  next.run_version = run.run_version + 1;
  next.updated_at = clock();
  const sealed = sealRun(next);
  store.saveRun(sealed, { run_version: run.run_version, run_digest: run.run_digest });
  return sealed;
}

function selectBatch(run) {
  const ready = Object.values(run.task_records).filter(r => taskReady(r, run.task_records));
  if (ready.length === 0) return [];
  ready.sort((a, b) => a.topological_layer - b.topological_layer || a.task_id.localeCompare(b.task_id));
  const layer = ready[0].topological_layer;
  const sameLayer = ready.filter(r => r.topological_layer === layer);
  const parallel = sameLayer.filter(r => r.state === 'PENDING' && r.policy_class === 'READ_ONLY_PARALLEL_ELIGIBLE');
  if (parallel.length) return parallel.slice(0, run.max_concurrency);
  return [sameLayer[0]];
}

function sanitizeWorkerError(err) {
  return {
    error_code: nonEmpty(err && err.code) ? String(err.code) : 'WORKER_ERROR',
    error_message_digest: sha256(String(err && err.message || err && err.code || 'WORKER_ERROR'))
  };
}

async function executeTask(record, context) {
  const { plan, workflowState, routingRegistry, serviceRegistry, worker, maxTaskAttempts, clock } = context;
  const task = plan.tasks.find(t => t.task_id === record.task_id);
  if (!task) fail('TASK_NOT_IN_PLAN', record.task_id);
  const capability = routing.resolveCallableCapability({ capability_id: task.capability_id, required_authority_domain: task.required_authority_domain }, routingRegistry);
  if (isRetiredProseCapability(capability)) fail('RETIRED_PROSE_EXECUTION_FORBIDDEN', task.task_id);
  if (capability.canonical_write_authority) fail('WORKER_CANONICAL_WRITE_CAPABILITY_FORBIDDEN', task.task_id);
  const identity = retry.buildOperationIdentity(plan, workflowState, task.task_id, routingRegistry, serviceRegistry);
  if (!identity.provider_operation) fail('NONPROVIDER_TASK_DISPATCH_FORBIDDEN', task.task_id);

  const attempts = [];
  let result = null;
  for (let attemptNumber = 1; attemptNumber <= maxTaskAttempts; attemptNumber += 1) {
    const startedAt = clock();
    try {
      const workerResult = await worker.dispatch(Object.freeze({
        scheduler_run_id: context.runId,
        task_id: task.task_id,
        capability_id: capability.capability_id,
        required_authority_domain: capability.authority_domain,
        service_id: capability.service_id,
        operation_id: capability.operation_id,
        operation_digest: identity.operation_digest,
        idempotency_key: identity.idempotency_key,
        registered_idempotent: identity.registered_idempotent,
        input_ref_hashes: clone(task.input_ref_hashes),
        context_package_refs: clone(task.context_package_refs),
        source_identity: clone(plan.source_identity),
        plan_digest: plan.plan_digest,
        workflow_digest: plan.workflow_state_identity.workflow_digest,
        attempt_number: attemptNumber,
        canonical_effect_allowed: false
      }));
      validateWorkerResult(workerResult);
      attempts.push({ attempt_number: attemptNumber, started_at: startedAt, completed_at: clock(), outcome: 'SUCCESS_EVIDENCE_ONLY', error_code: null, error_message_digest: null, retry_decision_class: null });
      result = workerResult;
      break;
    } catch (err) {
      const sanitized = sanitizeWorkerError(err);
      let retryClass = null;
      if (identity.registered_idempotent === true && attemptNumber < maxTaskAttempts) {
        const retryDecision = retry.deriveRetryDecision({
          plan,
          workflow_state: workflowState,
          task_id: task.task_id,
          observed_outcome: 'UNKNOWN_OUTCOME',
          reconciliation_state: 'NOT_APPLICABLE',
          requested_idempotency_key: identity.idempotency_key,
          prior_operation_identity: identity,
          reconciliation_evidence_refs: []
        }, routingRegistry, serviceRegistry);
        retryClass = retryDecision.decision_class;
        if (retryClass !== 'SAFE_SAME_OPERATION_REPLAY') fail('UNSAFE_AUTOMATIC_RETRY_DECISION', retryClass);
      }
      attempts.push({ attempt_number: attemptNumber, started_at: startedAt, completed_at: clock(), outcome: 'WORKER_FAILURE', error_code: sanitized.error_code, error_message_digest: sanitized.error_message_digest, retry_decision_class: retryClass });
      if (retryClass === 'SAFE_SAME_OPERATION_REPLAY') continue;
      break;
    }
  }

  if (result) {
    return {
      state: 'SUCCEEDED',
      operation_digest: identity.operation_digest,
      idempotency_key: identity.idempotency_key,
      registered_idempotent: identity.registered_idempotent,
      attempts,
      result_ref: result.result_ref,
      result_digest: result.result_digest,
      result_class: result.result_class,
      evidence_refs: clone(result.evidence_refs),
      withhold_reason: null
    };
  }
  return {
    state: 'FAILED',
    operation_digest: identity.operation_digest,
    idempotency_key: identity.idempotency_key,
    registered_idempotent: identity.registered_idempotent,
    attempts,
    result_ref: null,
    result_digest: null,
    result_class: null,
    evidence_refs: [],
    withhold_reason: 'WORKER_EXECUTION_FAILED'
  };
}

function finalRunState(run) {
  const states = Object.values(run.task_records).map(r => r.state);
  if (states.some(s => s === 'FAILED')) return 'FAILED_CLOSED';
  if (states.some(s => ['PENDING','PENDING_SERIAL','RUNNING'].includes(s))) return null;
  if (states.some(s => ['WITHHELD','BLOCKED'].includes(s))) return 'PARTIAL_BLOCKED';
  return 'COMPLETED';
}

async function executeSchedulerRun(input) {
  if (!isObject(input)) fail('SCHEDULER_INPUT_REQUIRED');
  const plan = input.plan;
  const workflowState = input.workflow_state;
  const routingRegistry = input.routing_registry || routing.loadDefaultRegistry();
  const serviceRegistry = input.service_registry || retry.loadServiceRegistry();
  const store = input.store;
  const worker = input.worker;
  const runId = input.run_id;
  const maxConcurrency = input.max_concurrency === undefined ? 2 : input.max_concurrency;
  const maxTaskAttempts = input.max_task_attempts === undefined ? 2 : input.max_task_attempts;
  const clock = typeof input.clock === 'function' ? input.clock : nowIso;
  const shouldPause = typeof input.should_pause === 'function' ? input.should_pause : () => false;

  if (!store || typeof store.loadRun !== 'function' || typeof store.saveRun !== 'function') fail('SCHEDULER_STORE_REQUIRED');
  if (!worker || typeof worker.dispatch !== 'function') fail('SCHEDULER_WORKER_REQUIRED');
  if (!nonEmpty(runId)) fail('RUN_ID_REQUIRED');
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 8) fail('MAX_CONCURRENCY_OUT_OF_RANGE');
  if (!Number.isInteger(maxTaskAttempts) || maxTaskAttempts < 1 || maxTaskAttempts > 3) fail('MAX_TASK_ATTEMPTS_OUT_OF_RANGE');

  planRuntime.validateExecutionPlan(plan, workflowState, routingRegistry);
  const concurrencyDecision = concurrency.deriveConcurrencyDecision(plan, workflowState, routingRegistry);
  let run = store.loadRun(runId);
  if (run === null) {
    run = makeInitialRun({ runId, plan, workflowState, concurrencyDecision, routingRegistry, maxConcurrency, maxTaskAttempts, timestamp: clock() });
    store.saveRun(run);
  } else {
    assertRunBinding(run, plan, workflowState, maxConcurrency, maxTaskAttempts);
    if (['COMPLETED','PARTIAL_BLOCKED','FAILED_CLOSED'].includes(run.run_state)) return clone(run);
    if (run.run_state === 'PAUSED') {
      if (input.resume !== true) return clone(run);
      run = persistMutation(store, run, next => {
        next.run_state = 'RUNNING';
        next.events.push({ event_type: 'SCHEDULER_RUN_RESUMED', at: clock() });
      }, clock);
    }
  }

  run = normalizeInterruptedAndBlocked(store, run, clock);
  let completedBatches = 0;
  while (true) {
    run = normalizeInterruptedAndBlocked(store, run, clock);
    const terminal = finalRunState(run);
    if (terminal) {
      if (run.run_state !== terminal) {
        run = persistMutation(store, run, next => {
          next.run_state = terminal;
          next.events.push({ event_type: 'SCHEDULER_RUN_TERMINATED', terminal_state: terminal, at: clock() });
        }, clock);
      }
      return clone(run);
    }

    const batch = selectBatch(run);
    if (batch.length === 0) {
      run = persistMutation(store, run, next => {
        next.run_state = 'FAILED_CLOSED';
        next.events.push({ event_type: 'SCHEDULER_NO_PROGRESS_FAIL_CLOSED', at: clock() });
      }, clock);
      return clone(run);
    }

    const prepared = [];
    for (const record of batch) {
      const identity = retry.buildOperationIdentity(plan, workflowState, record.task_id, routingRegistry, serviceRegistry);
      prepared.push({ task_id: record.task_id, identity });
    }
    run = persistMutation(store, run, next => {
      for (const item of prepared) {
        const record = next.task_records[item.task_id];
        record.state = 'RUNNING';
        record.operation_digest = item.identity.operation_digest;
        record.idempotency_key = item.identity.idempotency_key;
        record.registered_idempotent = item.identity.registered_idempotent;
      }
      next.events.push({ event_type: 'SCHEDULER_BATCH_DISPATCHED', task_ids: prepared.map(x => x.task_id), at: clock() });
    }, clock);

    const outcomes = await Promise.all(prepared.map(item => executeTask(run.task_records[item.task_id], {
      plan,
      workflowState,
      routingRegistry,
      serviceRegistry,
      worker,
      maxTaskAttempts,
      clock,
      runId
    })));

    run = persistMutation(store, run, next => {
      for (let i = 0; i < prepared.length; i += 1) {
        const record = next.task_records[prepared[i].task_id];
        const outcome = outcomes[i];
        record.state = outcome.state;
        record.operation_digest = outcome.operation_digest;
        record.idempotency_key = outcome.idempotency_key;
        record.registered_idempotent = outcome.registered_idempotent;
        record.attempts = outcome.attempts;
        record.result_ref = outcome.result_ref;
        record.result_digest = outcome.result_digest;
        record.result_class = outcome.result_class;
        record.evidence_refs = outcome.evidence_refs;
        record.withhold_reason = outcome.withhold_reason;
      }
      next.events.push({ event_type: 'SCHEDULER_BATCH_COMPLETED', task_ids: prepared.map(x => x.task_id), at: clock() });
    }, clock);
    completedBatches += 1;

    if (shouldPause({ completed_batches: completedBatches, run: clone(run) }) === true) {
      run = persistMutation(store, run, next => {
        next.run_state = 'PAUSED';
        next.events.push({ event_type: 'SCHEDULER_RUN_PAUSED', at: clock() });
      }, clock);
      return clone(run);
    }
  }
}

module.exports = {
  RUN_SCHEMA_VERSION,
  RUN_STATES,
  TASK_STATES,
  RESULT_CLASSES,
  BookWorkflowSchedulerError,
  stableStringify,
  runDigest,
  sealRun,
  validateRunRecord,
  createSchedulerStore,
  isRetiredProseCapability,
  validateWorkerResult,
  executeSchedulerRun
};