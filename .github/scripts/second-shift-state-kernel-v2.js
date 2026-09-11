'use strict';

const DEFAULT_LIMITS = Object.freeze({
  heartbeat_sla_minutes: 5,
  ready_dispatch_sla_minutes: 5,
  telemetry_freshness_sla_minutes: 10,
  max_retry_budget: 3,
  max_clock_skew_seconds: 300,
});

const TERMINAL = new Set(['COMPLETED', 'BLOCKED', 'STALE']);
const CIRCUIT = new Set(['CIRCUIT_OPEN', 'CIRCUIT_HALF_OPEN', 'CIRCUIT_CLOSED']);
const ALLOWED = new Set([
  'SHIFT_OPEN', 'READY', 'CLAIMED', 'RUNNING', 'HEARTBEAT', 'PROGRESS',
  'COMPLETED', 'BLOCKED', 'STALE', 'RETRY', 'CIRCUIT_OPEN',
  'CIRCUIT_HALF_OPEN', 'CIRCUIT_CLOSED', 'SUCCESSOR_BOUND',
  'ALL_RUNGS_EXHAUSTED', 'IDLE_VALID', 'SHIFT_CLOSE',
]);
const RUNG_DISPOSITIONS = new Set([
  'COMPLETE', 'DUPLICATE', 'DEPENDENCY_BLOCKED',
  'HUMAN_AUTHOR_PRIVATE_NATIVE_EXTERNAL_BLOCKED', 'UNSAFE_WITHOUT_DECISION',
]);

function parseTime(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function minutesBetween(a, b) { return (b.getTime() - a.getTime()) / 60000; }
function nonEmpty(v) {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
function isSha(v) { return /^[0-9a-f]{40}$/i.test(String(v || '')); }
function validRungs(e) {
  return Boolean(e && Array.isArray(e.rungs) && e.rungs.length === 8 && e.independent_work_remaining === false && nonEmpty(e.next_external_condition) &&
    e.rungs.every((r, i) => r && Number(r.rung) === i + 1 && RUNG_DISPOSITIONS.has(r.disposition) && nonEmpty(r.evidence_or_blocker) && nonEmpty(r.independent_preparation_assessment) && nonEmpty(r.next_executable_condition)));
}
function error(findings, type, message, detail = {}) { findings.push({ severity: 'ERROR', type, message, ...detail }); }
function warn(findings, type, message, detail = {}) { findings.push({ severity: 'WARN', type, message, ...detail }); }

function validateOwner(owner, lane, now = new Date(), limits = DEFAULT_LIMITS) {
  const findings = [];
  const skewMs = (limits.max_clock_skew_seconds ?? 300) * 1000;
  if (!owner || typeof owner !== 'object') {
    error(findings, 'OWNER_INVALID', 'owner record is missing or invalid', { lane });
    return findings;
  }
  if (owner.owner_system_id !== lane) error(findings, 'OWNER_LANE_MISMATCH', 'owner_system_id differs from lane', { lane });
  if (!isSha(owner.last_known_control_head)) error(findings, 'OWNER_FILE_HEAD_INVALID', 'owner has no exact control head', { lane });
  const active = Array.isArray(owner.active_delegations) ? owner.active_delegations : [];
  const ids = new Set();
  const claimed = active.filter((d) => d?.state === 'CLAIMED');
  if (claimed.length > 1) error(findings, 'OVERLAPPING_MUTATION_CLAIMS', 'more than one active claim exists', { lane, count: claimed.length });

  for (const d of active) {
    if (!d || !nonEmpty(d.delegation_id) || ids.has(d.delegation_id)) {
      error(findings, 'DELEGATION_ID_INVALID', 'delegation id is missing or duplicated', { lane, delegation_id: d?.delegation_id || null });
      continue;
    }
    ids.add(d.delegation_id);
    for (const f of ['owner_path','objective_id','state','valid_for_control_ref','valid_for_control_head','created_at','last_revalidated_at','completion_delta','stop_condition','allowed_work','forbidden_authority','on_pass','on_failure']) {
      if (!nonEmpty(d[f])) error(findings, 'DELEGATION_CONTRACT_DRIFT', `delegation missing ${f}`, { lane, delegation_id: d.delegation_id, field: f });
    }
    if (!['CANDIDATE','READY','CLAIMED'].includes(d.state)) error(findings, 'DELEGATION_STATE_INVALID', 'unsupported active delegation state', { lane, delegation_id: d.delegation_id, state: d.state });
    if (d.owner_path !== owner.owner_path) error(findings, 'DELEGATION_OWNER_MISMATCH', 'delegation owner differs from lane owner', { lane, delegation_id: d.delegation_id });
    if (d.valid_for_control_ref !== owner.control_ref) error(findings, 'CONTROL_REF_MISMATCH', 'delegation control ref differs from owner', { lane, delegation_id: d.delegation_id });
    if (d.valid_for_control_head !== owner.last_known_control_head) error(findings, 'STALE_DELEGATION', 'delegation control head differs from owner head', { lane, delegation_id: d.delegation_id });

    const rv = parseTime(d.last_revalidated_at);
    if (!rv) error(findings, 'REVALIDATION_TIME_INVALID', 'last_revalidated_at is invalid', { lane, delegation_id: d.delegation_id });
    else if (rv.getTime() > now.getTime() + skewMs) error(findings, 'FUTURE_REVALIDATION', 'delegation revalidation time is in the future', { lane, delegation_id: d.delegation_id });
    else if (d.state === 'READY' && minutesBetween(rv, now) > limits.ready_dispatch_sla_minutes) error(findings, 'READY_UNDISPATCHED', 'READY work exceeded dispatch SLA', { lane, delegation_id: d.delegation_id, age_minutes: Math.round(minutesBetween(rv, now)) });

    if (d.state === 'CLAIMED') {
      const c = d.claim || owner.active_claim;
      if (!c) { error(findings, 'CLAIM_INVALID', 'CLAIMED delegation has no claim', { lane, delegation_id: d.delegation_id }); continue; }
      for (const f of ['lease_id','lane','delegation_id','objective_id','control_ref','control_head_at_claim','idempotency_key','claimed_at','lease_expires_at','last_heartbeat_at','attempt','checkpoint_pointer']) {
        if (!nonEmpty(c[f])) error(findings, 'CLAIM_INVALID', `claim missing ${f}`, { lane, delegation_id: d.delegation_id, field: f });
      }
      if (c.lane !== lane || c.delegation_id !== d.delegation_id || c.objective_id !== d.objective_id || c.control_ref !== d.valid_for_control_ref || c.control_head_at_claim !== d.valid_for_control_head) {
        error(findings, 'CLAIM_BINDING_MISMATCH', 'claim does not exactly bind lane/delegation/objective/control', { lane, delegation_id: d.delegation_id });
      }
      const claimedAt = parseTime(c.claimed_at), expiresAt = parseTime(c.lease_expires_at), heartbeatAt = parseTime(c.last_heartbeat_at);
      if (!claimedAt || !expiresAt || !heartbeatAt || expiresAt <= claimedAt || heartbeatAt < claimedAt) error(findings, 'CLAIM_INVALID', 'claim chronology invalid', { lane, delegation_id: d.delegation_id });
      if (claimedAt && claimedAt.getTime() > now.getTime() + skewMs) error(findings, 'FUTURE_CLAIM', 'claim time is in the future', { lane, delegation_id: d.delegation_id });
      if (heartbeatAt && heartbeatAt.getTime() > now.getTime() + skewMs) error(findings, 'FUTURE_HEARTBEAT', 'heartbeat time is in the future', { lane, delegation_id: d.delegation_id });
      if (expiresAt && expiresAt <= now) error(findings, 'STALE_CLAIM', 'claim lease expired', { lane, delegation_id: d.delegation_id });
      if (heartbeatAt && heartbeatAt <= now && minutesBetween(heartbeatAt, now) > limits.heartbeat_sla_minutes) error(findings, 'STALE_CLAIM', 'claim heartbeat exceeded SLA', { lane, delegation_id: d.delegation_id, heartbeat_age_minutes: Math.round(minutesBetween(heartbeatAt, now)) });
    }
  }
  if (active.length === 0 && !validRungs(owner.all_rungs_exhausted)) error(findings, 'SECOND_SHIFT_SCOPE_VIOLATION', 'lane empty without valid eight-rung exhaustion proof', { lane });
  if (owner.empty_is_valid === true && !validRungs(owner.all_rungs_exhausted)) error(findings, 'FALSE_EMPTY', 'empty_is_valid lacks valid exhaustion proof', { lane });
  return findings;
}

function validateLedger(ledger, lane, shiftDate, owner, schema, options = {}) {
  const findings = [];
  const limits = { ...DEFAULT_LIMITS, ...(schema?.operational_limits || {}), ...(options.limits || {}) };
  const now = options.now ? new Date(options.now) : new Date();
  const dynamic = Boolean(options.dynamic);
  const skewMs = (limits.max_clock_skew_seconds ?? 300) * 1000;
  if (!ledger || typeof ledger !== 'object') { error(findings, 'UTILIZATION_LEDGER_INVALID', 'ledger missing', { lane }); return findings; }
  for (const f of schema.required_ledger_fields || []) if (!nonEmpty(ledger[f])) error(findings, 'UTILIZATION_LEDGER_INVALID', `ledger missing ${f}`, { lane });
  if (ledger.schema_id !== schema.schema_id) error(findings, 'UTILIZATION_LEDGER_SCHEMA_MISMATCH', 'schema mismatch', { lane });
  if (ledger.shift_date !== shiftDate) error(findings, 'UTILIZATION_SHIFT_DATE_MISMATCH', 'shift date mismatch', { lane });
  if (ledger.lane !== lane) error(findings, 'UTILIZATION_LANE_MISMATCH', 'ledger lane mismatch', { lane });
  if (!Array.isArray(ledger.events)) { error(findings, 'UTILIZATION_LEDGER_INVALID', 'events must be array', { lane }); return findings; }

  const ids = new Set();
  const idemClaims = new Map();
  const retryByDependency = new Map();
  const circuitByDependency = new Map();
  let lease = null;
  let lastAt = null;
  let opened = false;
  let closed = false;
  let pendingSuccessor = false;
  let exhaustion = null;

  for (let i = 0; i < ledger.events.length; i++) {
    const e = ledger.events[i] || {};
    const detail = { lane, event_id: e.event_id || null, index: i };
    for (const f of schema.required_event_fields || []) if (!nonEmpty(e[f])) error(findings, 'UTILIZATION_EVENT_INVALID', `event missing ${f}`, { ...detail, field: f });
    if (!e.event_id || ids.has(e.event_id)) error(findings, 'UTILIZATION_EVENT_DUPLICATE', 'event id duplicated or missing', detail); else ids.add(e.event_id);
    if (!ALLOWED.has(e.event_type)) error(findings, 'UTILIZATION_EVENT_TYPE_INVALID', 'event type invalid', { ...detail, event_type: e.event_type });
    if (e.lane !== lane) error(findings, 'UTILIZATION_EVENT_LANE_MISMATCH', 'event lane mismatch', detail);
    if (e.control_ref !== owner.control_ref) error(findings, 'UTILIZATION_CONTROL_REF_MISMATCH', 'event control ref mismatch', detail);
    if (!isSha(e.control_head)) error(findings, 'UTILIZATION_CONTROL_HEAD_INVALID', 'event control head invalid', detail);
    const at = parseTime(e.occurred_at);
    if (!at) error(findings, 'UTILIZATION_EVENT_TIME_INVALID', 'event time invalid', detail);
    if (at && lastAt && at < lastAt) error(findings, 'UTILIZATION_EVENT_ORDER_INVALID', 'event time moved backwards', detail);
    if (at && at.getTime() > now.getTime() + skewMs && dynamic) error(findings, 'FUTURE_EVENT', 'event time is in the future', detail);
    if (at) lastAt = at;
    if (closed) error(findings, 'EVENT_AFTER_SHIFT_CLOSE', 'event appears after SHIFT_CLOSE', detail);

    if (e.event_type === 'SHIFT_OPEN') {
      if (opened || i !== 0) error(findings, 'SHIFT_OPEN_SEQUENCE_INVALID', 'SHIFT_OPEN must occur exactly once as first event', detail);
      opened = true;
      continue;
    }
    if (!opened) error(findings, 'SHIFT_OPEN_MISSING', 'non-open event appears before SHIFT_OPEN', detail);

    if (e.event_type === 'READY') {
      if (lease) error(findings, 'READY_DURING_LIVE_CLAIM', 'READY cannot appear while claim is live', detail);
      if (pendingSuccessor) error(findings, 'SUCCESSOR_MISSING_AFTER_TERMINAL', 'READY appears before SUCCESSOR_BOUND after terminal', detail);
    } else if (e.event_type === 'CLAIMED') {
      for (const f of schema.claim_event_required_fields || []) if (!nonEmpty(e[f])) error(findings, 'CLAIM_EVENT_INVALID', `CLAIMED missing ${f}`, { ...detail, field: f });
      if (lease) error(findings, 'OVERLAPPING_MUTATION_CLAIMS', 'new claim overlaps live claim', { ...detail, prior_lease_id: lease.lease_id });
      const expires = parseTime(e.lease_expires_at);
      if (!at || !expires || expires <= at) error(findings, 'CLAIM_EVENT_INVALID', 'ledger claim has invalid lease chronology', detail);
      if (!Number.isInteger(e.attempt) || e.attempt < 1) error(findings, 'CLAIM_EVENT_INVALID', 'claim attempt invalid', detail);
      const prior = idemClaims.get(e.idempotency_key);
      const identity = `${e.delegation_id}|${e.objective_id}|${e.control_head}`;
      if (prior && prior !== identity) error(findings, 'IDEMPOTENCY_KEY_REUSE', 'idempotency key reused for distinct claim identity', detail); else if (e.idempotency_key) idemClaims.set(e.idempotency_key, identity);
      lease = { lease_id: e.lease_id, idempotency_key: e.idempotency_key, delegation_id: e.delegation_id, objective_id: e.objective_id, control_head: e.control_head, expires };
      pendingSuccessor = false;
    } else if (e.event_type === 'RUNNING' || e.event_type === 'PROGRESS') {
      if (!lease) error(findings, `${e.event_type}_WITHOUT_CLAIM`, `${e.event_type} has no live claim`, detail);
      else {
        if (e.delegation_id !== lease.delegation_id || e.objective_id !== lease.objective_id || e.control_head !== lease.control_head) error(findings, `${e.event_type}_CLAIM_IDENTITY_MISMATCH`, `${e.event_type} differs from live claim identity`, detail);
        if (e.idempotency_key !== lease.idempotency_key) error(findings, 'IDEMPOTENCY_KEY_MISMATCH', `${e.event_type} idempotency key differs from claim`, detail);
        if (nonEmpty(e.lease_id) && e.lease_id !== lease.lease_id) error(findings, 'LEASE_ID_MISMATCH', `${e.event_type} lease id differs from claim`, detail);
        if (at && lease.expires && at > lease.expires) error(findings, 'EXECUTION_AFTER_LEASE_EXPIRY', `${e.event_type} occurs after lease expiry`, detail);
      }
    } else if (e.event_type === 'HEARTBEAT') {
      for (const f of schema.heartbeat_event_required_fields || []) if (!nonEmpty(e[f])) error(findings, 'HEARTBEAT_EVENT_INVALID', `HEARTBEAT missing ${f}`, { ...detail, field: f });
      if (!lease) error(findings, 'HEARTBEAT_WITHOUT_CLAIM', 'heartbeat has no live claim', detail);
      else {
        if (e.lease_id !== lease.lease_id || e.idempotency_key !== lease.idempotency_key || e.delegation_id !== lease.delegation_id || e.objective_id !== lease.objective_id || e.control_head !== lease.control_head) error(findings, 'HEARTBEAT_CLAIM_MISMATCH', 'heartbeat differs from live claim', detail);
        if (at && lease.expires && at > lease.expires) error(findings, 'HEARTBEAT_AFTER_LEASE_EXPIRY', 'heartbeat occurs after lease expiry', detail);
      }
    } else if (TERMINAL.has(e.event_type)) {
      const reconciliationStale = e.event_type === 'STALE' && !lease && e.evidence && typeof e.evidence === 'object' && String(e.evidence.classification || '').startsWith('TELEMETRY_GAP_RECONCILED_');
      if (!lease && !reconciliationStale) error(findings, 'TERMINAL_WITHOUT_CLAIM', `${e.event_type} has no live claim`, detail);
      if (lease) {
        const matches = e.delegation_id === lease.delegation_id && e.objective_id === lease.objective_id && e.control_head === lease.control_head && e.idempotency_key === lease.idempotency_key && (!nonEmpty(e.lease_id) || e.lease_id === lease.lease_id);
        if (!matches) error(findings, 'TERMINAL_CLAIM_MISMATCH', `${e.event_type} does not exactly match live claim`, detail);
        else {
          if (at && lease.expires && at > lease.expires && e.event_type !== 'STALE') error(findings, 'TERMINAL_AFTER_LEASE_EXPIRY', `${e.event_type} occurs after lease expiry`, detail);
          lease = null;
          pendingSuccessor = true;
        }
      }
    } else if (e.event_type === 'RETRY') {
      for (const f of schema.retry_event_required_fields || []) if (!nonEmpty(e[f])) error(findings, 'RETRY_EVENT_INVALID', `RETRY missing ${f}`, { ...detail, field: f });
      if (!Number.isInteger(e.retry_budget) || e.retry_budget < 1 || e.retry_budget > limits.max_retry_budget) error(findings, 'RETRY_BUDGET_INVALID', 'retry budget outside configured bounds', detail);
      if (!Number.isInteger(e.attempt) || !Number.isInteger(e.retry_budget) || e.attempt < 1 || e.attempt > e.retry_budget) error(findings, 'RETRY_ATTEMPT_EXCEEDS_BUDGET', 'retry attempt outside declared budget', detail);
      if (nonEmpty(e.dependency_or_operation)) retryByDependency.set(e.dependency_or_operation, { attempt: e.attempt, budget: e.retry_budget });
    } else if (CIRCUIT.has(e.event_type)) {
      for (const f of schema.circuit_event_required_fields || []) if (!nonEmpty(e[f])) error(findings, 'CIRCUIT_EVENT_INVALID', `${e.event_type} missing ${f}`, { ...detail, field: f });
      const dep = e.dependency_or_operation;
      const state = circuitByDependency.get(dep) || 'CLOSED';
      if (e.event_type === 'CIRCUIT_OPEN') {
        const retry = retryByDependency.get(dep);
        if (!retry || retry.attempt !== retry.budget) error(findings, 'CIRCUIT_OPEN_BEFORE_RETRY_EXHAUSTION', 'circuit opened before retry budget exhaustion', detail);
        circuitByDependency.set(dep, 'OPEN');
      } else if (e.event_type === 'CIRCUIT_HALF_OPEN') {
        if (state !== 'OPEN') error(findings, 'CIRCUIT_SEQUENCE_INVALID', 'HALF_OPEN requires OPEN', detail);
        circuitByDependency.set(dep, 'HALF_OPEN');
      } else {
        if (state !== 'HALF_OPEN') error(findings, 'CIRCUIT_SEQUENCE_INVALID', 'CLOSED requires HALF_OPEN', detail);
        circuitByDependency.set(dep, 'CLOSED');
      }
    } else if (e.event_type === 'SUCCESSOR_BOUND') {
      if (!pendingSuccessor) error(findings, 'SUCCESSOR_SEQUENCE_INVALID', 'SUCCESSOR_BOUND requires preceding terminal event', detail);
      pendingSuccessor = false;
      exhaustion = null;
    } else if (e.event_type === 'ALL_RUNGS_EXHAUSTED') {
      if (!validRungs(e)) error(findings, 'ALL_RUNGS_EXHAUSTED_INVALID', 'invalid eight-rung exhaustion proof', detail);
      if (lease) error(findings, 'EXHAUSTION_DURING_LIVE_CLAIM', 'cannot exhaust lane with live claim', detail);
      exhaustion = e;
      pendingSuccessor = false;
    } else if (e.event_type === 'IDLE_VALID') {
      if (!exhaustion || exhaustion.control_head !== e.control_head) error(findings, 'IDLE_WITHOUT_EXHAUSTION', 'IDLE_VALID requires same-head exhaustion proof', detail);
      if (lease) error(findings, 'IDLE_DURING_LIVE_CLAIM', 'cannot idle with live claim', detail);
    } else if (e.event_type === 'SHIFT_CLOSE') {
      if (lease) error(findings, 'SHIFT_CLOSE_WITH_OPEN_CLAIM', 'SHIFT_CLOSE cannot occur with live claim', detail);
      if (pendingSuccessor) warn(findings, 'SHIFT_CLOSE_WITH_PENDING_SUCCESSOR', 'shift closed after terminal without successor bound', detail);
      closed = true;
    }
  }

  if (lease) error(findings, 'UNCLOSED_MUTATION_CLAIM', 'ledger ends with unresolved mutation claim', { lane, lease_id: lease.lease_id });
  if (dynamic && lastAt && now >= lastAt && minutesBetween(lastAt, now) > limits.telemetry_freshness_sla_minutes) error(findings, 'TELEMETRY_STALE', 'ledger telemetry exceeded freshness SLA', { lane, age_minutes: Math.round(minutesBetween(lastAt, now)) });
  if (!opened && ledger.events.length) error(findings, 'SHIFT_OPEN_MISSING', 'ledger has events but no SHIFT_OPEN', { lane });
  return findings;
}

module.exports = { DEFAULT_LIMITS, validateOwner, validateLedger, validRungs, parseTime, isSha };
