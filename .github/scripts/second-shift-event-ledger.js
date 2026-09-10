'use strict';

const ALLOWED_EVENT_TYPES = new Set([
  'SHIFT_OPEN', 'READY', 'CLAIMED', 'RUNNING', 'HEARTBEAT', 'PROGRESS',
  'COMPLETED', 'BLOCKED', 'STALE', 'RETRY', 'CIRCUIT_OPEN',
  'CIRCUIT_HALF_OPEN', 'CIRCUIT_CLOSED', 'SUCCESSOR_BOUND',
  'ALL_RUNGS_EXHAUSTED', 'IDLE_VALID', 'SHIFT_CLOSE'
]);
const RUNG_DISPOSITIONS = new Set([
  'COMPLETE', 'DUPLICATE', 'DEPENDENCY_BLOCKED',
  'HUMAN_AUTHOR_PRIVATE_NATIVE_EXTERNAL_BLOCKED', 'UNSAFE_WITHOUT_DECISION'
]);
const COMMON_FIELDS = [
  'event_id', 'occurred_at', 'event_type', 'lane', 'control_ref',
  'control_head', 'delegation_id', 'objective_id', 'evidence'
];
const CLAIM_FIELDS = ['lease_id', 'idempotency_key', 'lease_expires_at', 'attempt'];
const HEARTBEAT_FIELDS = ['lease_id', 'idempotency_key', 'checkpoint_pointer'];
const RETRY_FIELDS = ['dependency_or_operation', 'failure_class', 'attempt', 'retry_budget', 'next_action'];
const CIRCUIT_FIELDS = ['dependency_or_operation', 'failure_class', 'next_probe_at_or_condition', 'fallback_successor_or_rung'];
const EXHAUSTION_FIELDS = ['rungs', 'independent_work_remaining', 'next_external_condition'];

function isSha(value) { return /^[0-9a-f]{40}$/i.test(String(value || '')); }
function parseDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function missing(value) {
  return value === undefined || value === null || value === '';
}
function validExhaustionEvent(event) {
  for (const field of EXHAUSTION_FIELDS) if (missing(event[field])) return false;
  if (!Array.isArray(event.rungs) || event.rungs.length !== 8) return false;
  if (event.independent_work_remaining !== false) return false;
  return event.rungs.every((r, i) => r && Number(r.rung) === i + 1 &&
    RUNG_DISPOSITIONS.has(r.disposition) &&
    typeof r.evidence_or_blocker === 'string' && r.evidence_or_blocker.length > 0 &&
    typeof r.independent_preparation_assessment === 'string' && r.independent_preparation_assessment.length > 0 &&
    typeof r.next_executable_condition === 'string' && r.next_executable_condition.length > 0);
}

function validateLedger(ledger, lane, shiftDate, now = new Date(), dynamic = false) {
  const findings = [];
  const add = (severity, type, message, detail = {}) => findings.push({ severity, type, lane, message, ...detail });

  if (!ledger || typeof ledger !== 'object') {
    add('ERROR', 'UTILIZATION_LEDGER_INVALID', 'ledger is not an object');
    return findings;
  }
  if (ledger.schema_id !== 'SECOND-SHIFT-UTILIZATION-EVENT-SCHEMA-001') add('ERROR', 'UTILIZATION_SCHEMA_MISMATCH', 'ledger schema_id is not the current utilization schema');
  if (ledger.lane !== lane) add('ERROR', 'UTILIZATION_LANE_MISMATCH', 'ledger lane does not match file lane', { declared_lane: ledger.lane || null });
  if (ledger.shift_date !== shiftDate) add('ERROR', 'UTILIZATION_SHIFT_DATE_MISMATCH', 'ledger shift_date does not match active New York shift date', { declared_shift_date: ledger.shift_date || null, expected_shift_date: shiftDate });
  if (typeof ledger.shift_id !== 'string' || !ledger.shift_id) add('ERROR', 'UTILIZATION_SHIFT_ID_MISSING', 'ledger shift_id is missing');
  if (!Array.isArray(ledger.events) || ledger.events.length === 0) {
    add('ERROR', 'UTILIZATION_EVENTS_MISSING', 'ledger must contain at least one event');
    return findings;
  }

  const ids = new Set();
  let previousTime = null;
  let latestTime = null;
  let latestMeaningfulTime = null;
  let lastValidExhaustion = null;
  const liveClaims = new Map();
  const meaningful = new Set(['READY','CLAIMED','RUNNING','HEARTBEAT','PROGRESS','COMPLETED','BLOCKED','STALE','RETRY','CIRCUIT_OPEN','CIRCUIT_HALF_OPEN','CIRCUIT_CLOSED','SUCCESSOR_BOUND','ALL_RUNGS_EXHAUSTED','IDLE_VALID']);

  for (let i = 0; i < ledger.events.length; i += 1) {
    const event = ledger.events[i];
    if (!event || typeof event !== 'object') {
      add('ERROR', 'UTILIZATION_EVENT_INVALID', 'event is not an object', { index: i });
      continue;
    }
    for (const field of COMMON_FIELDS) if (missing(event[field])) add('ERROR', 'UTILIZATION_EVENT_FIELD_MISSING', `event missing ${field}`, { index: i, event_id: event.event_id || null });
    if (event.event_id && ids.has(event.event_id)) add('ERROR', 'UTILIZATION_EVENT_ID_DUPLICATE', 'duplicate event_id', { event_id: event.event_id });
    if (event.event_id) ids.add(event.event_id);
    if (!ALLOWED_EVENT_TYPES.has(event.event_type)) add('ERROR', 'UTILIZATION_EVENT_TYPE_INVALID', 'event_type is not allowed', { event_id: event.event_id || null, event_type: event.event_type || null });
    if (event.lane !== lane) add('ERROR', 'UTILIZATION_EVENT_LANE_MISMATCH', 'event lane does not match ledger lane', { event_id: event.event_id || null, event_lane: event.lane || null });
    if (typeof event.control_ref !== 'string' || !event.control_ref) add('ERROR', 'UTILIZATION_CONTROL_REF_INVALID', 'event control_ref is missing', { event_id: event.event_id || null });
    if (!isSha(event.control_head)) add('ERROR', 'UTILIZATION_CONTROL_HEAD_INVALID', 'event control_head must be an exact 40-character SHA', { event_id: event.event_id || null });

    const occurred = parseDate(event.occurred_at);
    if (!occurred) {
      add('ERROR', 'UTILIZATION_TIMESTAMP_INVALID', 'event occurred_at is invalid', { event_id: event.event_id || null });
    } else {
      if (previousTime && occurred < previousTime) add('ERROR', 'UTILIZATION_EVENT_OUT_OF_ORDER', 'event timestamps are not chronological', { event_id: event.event_id || null });
      if (occurred.getTime() > now.getTime() + 5 * 60000) add('ERROR', 'UTILIZATION_EVENT_IN_FUTURE', 'event timestamp exceeds five-minute clock-skew allowance', { event_id: event.event_id || null });
      previousTime = occurred;
      latestTime = occurred;
      if (meaningful.has(event.event_type)) latestMeaningfulTime = occurred;
    }

    if (event.event_type === 'CLAIMED') {
      for (const field of CLAIM_FIELDS) if (missing(event[field])) add('ERROR', 'UTILIZATION_CLAIM_FIELD_MISSING', `CLAIMED event missing ${field}`, { event_id: event.event_id || null });
      if (!Number.isInteger(event.attempt) || event.attempt < 1) add('ERROR', 'UTILIZATION_CLAIM_ATTEMPT_INVALID', 'CLAIMED attempt must be an integer >= 1', { event_id: event.event_id || null });
      const expires = parseDate(event.lease_expires_at);
      if (!expires || (occurred && expires <= occurred)) add('ERROR', 'UTILIZATION_LEASE_INVALID', 'CLAIMED lease_expires_at must be after occurred_at', { event_id: event.event_id || null });
      if (event.lease_id) liveClaims.set(event.lease_id, { ...event, occurred });
    }

    if (event.event_type === 'HEARTBEAT') {
      for (const field of HEARTBEAT_FIELDS) if (missing(event[field])) add('ERROR', 'UTILIZATION_HEARTBEAT_FIELD_MISSING', `HEARTBEAT event missing ${field}`, { event_id: event.event_id || null });
      const claim = event.lease_id ? liveClaims.get(event.lease_id) : null;
      if (!claim) add('ERROR', 'UTILIZATION_HEARTBEAT_WITHOUT_CLAIM', 'HEARTBEAT does not reference a preceding CLAIMED lease in this ledger', { event_id: event.event_id || null, lease_id: event.lease_id || null });
      else if (event.idempotency_key !== claim.idempotency_key) add('ERROR', 'UTILIZATION_IDEMPOTENCY_MISMATCH', 'HEARTBEAT idempotency key differs from claim', { event_id: event.event_id || null, lease_id: event.lease_id });
    }

    if (event.event_type === 'RUNNING') {
      if (missing(event.lease_id) || missing(event.idempotency_key)) add('ERROR', 'UTILIZATION_RUNNING_CLAIM_BINDING_MISSING', 'RUNNING must identify lease_id and idempotency_key', { event_id: event.event_id || null });
      else {
        const claim = liveClaims.get(event.lease_id);
        if (!claim) add('ERROR', 'UTILIZATION_RUNNING_WITHOUT_CLAIM', 'RUNNING does not reference a preceding CLAIMED lease', { event_id: event.event_id || null, lease_id: event.lease_id });
        else if (event.idempotency_key !== claim.idempotency_key) add('ERROR', 'UTILIZATION_IDEMPOTENCY_MISMATCH', 'RUNNING idempotency key differs from claim', { event_id: event.event_id || null, lease_id: event.lease_id });
      }
    }

    if (event.event_type === 'RETRY') {
      for (const field of RETRY_FIELDS) if (missing(event[field])) add('ERROR', 'UTILIZATION_RETRY_FIELD_MISSING', `RETRY event missing ${field}`, { event_id: event.event_id || null });
      if (!Number.isInteger(event.attempt) || event.attempt < 1 || !Number.isInteger(event.retry_budget) || event.retry_budget < 1 || event.attempt > event.retry_budget) add('ERROR', 'UTILIZATION_RETRY_BUDGET_INVALID', 'RETRY attempt/budget is invalid', { event_id: event.event_id || null });
    }

    if (['CIRCUIT_OPEN','CIRCUIT_HALF_OPEN','CIRCUIT_CLOSED'].includes(event.event_type)) {
      for (const field of CIRCUIT_FIELDS) if (missing(event[field])) add('ERROR', 'UTILIZATION_CIRCUIT_FIELD_MISSING', `${event.event_type} event missing ${field}`, { event_id: event.event_id || null });
    }

    if (event.event_type === 'ALL_RUNGS_EXHAUSTED') {
      if (!validExhaustionEvent(event)) add('ERROR', 'UTILIZATION_EXHAUSTION_INVALID', 'ALL_RUNGS_EXHAUSTED does not contain a valid eight-rung proof', { event_id: event.event_id || null });
      else lastValidExhaustion = event;
    }

    if (event.event_type === 'IDLE_VALID') {
      if (!lastValidExhaustion) add('ERROR', 'UTILIZATION_IDLE_WITHOUT_EXHAUSTION', 'IDLE_VALID has no preceding valid ALL_RUNGS_EXHAUSTED event', { event_id: event.event_id || null });
      else if (lastValidExhaustion.control_head !== event.control_head) add('ERROR', 'UTILIZATION_IDLE_HEAD_MISMATCH', 'IDLE_VALID control head differs from preceding exhaustion proof', { event_id: event.event_id || null });
    }
  }

  if (ledger.events[0]?.event_type !== 'SHIFT_OPEN') add('ERROR', 'UTILIZATION_SHIFT_OPEN_MISSING', 'first ledger event must be SHIFT_OPEN');
  if (dynamic && latestMeaningfulTime) {
    const ageMinutes = (now.getTime() - latestMeaningfulTime.getTime()) / 60000;
    if (ageMinutes > 70) add('ERROR', 'UTILIZATION_TELEMETRY_STALE', 'latest meaningful execution event is older than one owner-worker cadence plus allowance', { age_minutes: Math.round(ageMinutes) });
  }
  if (dynamic && !latestTime) add('ERROR', 'UTILIZATION_TELEMETRY_UNKNOWN', 'no parseable event timestamp exists');

  return findings;
}

module.exports = { validateLedger, validExhaustionEvent, ALLOWED_EVENT_TYPES };
