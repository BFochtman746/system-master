from pathlib import Path

path = Path('.github/scripts/second-shift-enforce.js')
source = path.read_text(encoding='utf-8')

old_valid_claim = "return Boolean(c && x && h && x > c && h >= c);"
new_valid_claim = "return Boolean(c && x && h && x > c);"
if source.count(old_valid_claim) != 1:
    raise SystemExit(f'expected exactly one validClaim return, found {source.count(old_valid_claim)}')
source = source.replace(old_valid_claim, new_valid_claim, 1)

old_dynamic = """        const exp = parseDate(claim.lease_expires_at);\n        const age = minutesSince(claim.last_heartbeat_at, now);\n        if (exp <= now || age > limits.heartbeat_sla_minutes) add('ERROR', 'STALE_CLAIM', 'claim lease or heartbeat is stale', { delegation_id: d.delegation_id, lease_id: claim.lease_id, heartbeat_age_minutes: Math.round(age) });\n        else healthyClaim = true;\n"""
new_dynamic = """        const exp = parseDate(claim.lease_expires_at);\n        const heartbeat = parseDate(claim.last_heartbeat_at);\n        const age = minutesSince(claim.last_heartbeat_at, now);\n        if (heartbeat > now) add('ERROR', 'CLAIM_HEARTBEAT_IN_FUTURE', 'claim heartbeat is later than validator time', { delegation_id: d.delegation_id, lease_id: claim.lease_id, heartbeat_at: claim.last_heartbeat_at });\n        else if (exp <= now || age > limits.heartbeat_sla_minutes) add('ERROR', 'STALE_CLAIM', 'claim lease or heartbeat is stale', { delegation_id: d.delegation_id, lease_id: claim.lease_id, heartbeat_age_minutes: Math.round(age) });\n        else healthyClaim = true;\n"""
if source.count(old_dynamic) != 1:
    raise SystemExit(f'expected exactly one owner dynamic block, found {source.count(old_dynamic)}')
source = source.replace(old_dynamic, new_dynamic, 1)

start = source.index('function validateLedger(')
end = source.index('\nfunction runSelftest()', start)
new_validate_ledger = r'''function validateLedger(ledger, lane, shiftDate, owner, schema, now = null) {
  const findings = [];
  const add = (severity, type, message, detail = {}) => findings.push({ severity, type, lane, message, ...detail });
  const limits = { max_retry_budget: 3, telemetry_freshness_sla_minutes: 75, ...(schema.operational_limits || {}) };
  for (const f of schema.required_ledger_fields || []) if (!nonEmpty(ledger[f])) add('ERROR', 'UTILIZATION_LEDGER_INVALID', `ledger missing ${f}`);
  if (ledger.schema_id !== schema.schema_id) add('ERROR', 'UTILIZATION_LEDGER_SCHEMA_MISMATCH', 'ledger schema_id differs from current schema');
  if (ledger.shift_date !== shiftDate) add('ERROR', 'UTILIZATION_SHIFT_DATE_MISMATCH', 'ledger shift_date differs from current shift date');
  if (ledger.lane !== lane) add('ERROR', 'UTILIZATION_LANE_MISMATCH', 'ledger lane differs from file lane');
  if (!Array.isArray(ledger.events)) return [...findings, { severity: 'ERROR', type: 'UTILIZATION_LEDGER_INVALID', lane, message: 'events must be an array' }];

  const allowed = new Set(schema.allowed_event_types || []);
  const ids = new Set();
  const idempotencyClaims = new Map();
  let lastTime = null;
  let latestTelemetryAt = null;
  let lease = null;
  let exhaustion = null;
  let shiftOpen = false;
  let shiftClosed = false;
  let terminalTransitionSeen = false;

  const leaseMatches = (e) => Boolean(
    lease &&
    lease.lease_id === e.lease_id &&
    lease.idempotency_key === e.idempotency_key &&
    lease.delegation_id === e.delegation_id &&
    lease.objective_id === e.objective_id &&
    lease.control_ref === e.control_ref &&
    lease.control_head === e.control_head
  );

  for (const e of ledger.events) {
    for (const f of schema.required_event_fields || []) if (!nonEmpty(e[f])) add('ERROR', 'UTILIZATION_EVENT_INVALID', `event missing ${f}`, { event_id: e.event_id || null });
    if (!e.event_id || ids.has(e.event_id)) add('ERROR', 'UTILIZATION_EVENT_DUPLICATE', 'event_id missing or duplicated', { event_id: e.event_id || null });
    ids.add(e.event_id);
    const t = parseDate(e.occurred_at);
    if (!t) add('ERROR', 'UTILIZATION_EVENT_TIME_INVALID', 'event occurred_at is invalid', { event_id: e.event_id || null });
    else if (lastTime && t < lastTime) add('ERROR', 'UTILIZATION_EVENT_ORDER_INVALID', 'event timestamps are not monotonic', { event_id: e.event_id });
    if (t) {
      lastTime = t;
      latestTelemetryAt = t;
    }
    if (!allowed.has(e.event_type)) add('ERROR', 'UTILIZATION_EVENT_TYPE_INVALID', 'event_type is not allowed', { event_id: e.event_id, event_type: e.event_type });
    if (e.lane !== lane) add('ERROR', 'UTILIZATION_EVENT_LANE_MISMATCH', 'event lane differs from ledger lane', { event_id: e.event_id });
    if (e.control_ref !== owner.control_ref) add('ERROR', 'UTILIZATION_CONTROL_REF_MISMATCH', 'event control_ref differs from owner.control_ref', { event_id: e.event_id });
    if (!isSha(e.control_head)) add('ERROR', 'UTILIZATION_CONTROL_HEAD_INVALID', 'event control_head is not an exact SHA', { event_id: e.event_id });

    if (shiftClosed) add('ERROR', 'EVENT_AFTER_SHIFT_CLOSE', 'event appears after SHIFT_CLOSE', { event_id: e.event_id, event_type: e.event_type });
    if (e.event_type === 'SHIFT_OPEN') {
      if (shiftOpen) add('ERROR', 'DUPLICATE_SHIFT_OPEN', 'SHIFT_OPEN may occur only once', { event_id: e.event_id });
      shiftOpen = true;
    } else if (!shiftOpen) {
      add('ERROR', 'EVENT_BEFORE_SHIFT_OPEN', 'event appears before SHIFT_OPEN', { event_id: e.event_id, event_type: e.event_type });
    }

    if (e.event_type === 'CLAIMED') {
      for (const f of schema.claim_event_required_fields || []) if (!nonEmpty(e[f])) add('ERROR', 'CLAIM_EVENT_INVALID', `CLAIMED event missing ${f}`, { event_id: e.event_id });
      const identity = [e.lease_id, e.delegation_id, e.objective_id, e.control_ref, e.control_head].join('|');
      const priorIdentity = idempotencyClaims.get(e.idempotency_key);
      if (priorIdentity && priorIdentity !== identity) add('ERROR', 'IDEMPOTENCY_KEY_REUSED', 'idempotency key was reused for a distinct claim identity', { event_id: e.event_id, idempotency_key: e.idempotency_key });
      else if (nonEmpty(e.idempotency_key)) idempotencyClaims.set(e.idempotency_key, identity);
      if (lease) {
        add('ERROR', 'OVERLAPPING_MUTATION_CLAIMS', 'CLAIMED event overlaps an unresolved lease', { event_id: e.event_id, prior_lease_id: lease.lease_id });
      } else {
        lease = {
          lease_id: e.lease_id,
          idempotency_key: e.idempotency_key,
          delegation_id: e.delegation_id,
          objective_id: e.objective_id,
          control_ref: e.control_ref,
          control_head: e.control_head,
        };
      }
    } else if (e.event_type === 'RUNNING' || e.event_type === 'PROGRESS') {
      if (!leaseMatches(e)) add('ERROR', `${e.event_type}_WITHOUT_CLAIM`, `${e.event_type} lacks the exact live claim identity`, { event_id: e.event_id });
    } else if (e.event_type === 'HEARTBEAT') {
      for (const f of schema.heartbeat_event_required_fields || []) if (!nonEmpty(e[f])) add('ERROR', 'HEARTBEAT_EVENT_INVALID', `HEARTBEAT event missing ${f}`, { event_id: e.event_id });
      if (!leaseMatches(e)) add('ERROR', 'HEARTBEAT_WITHOUT_CLAIM', 'HEARTBEAT does not match the exact live lease identity', { event_id: e.event_id });
    } else if (['COMPLETED', 'BLOCKED', 'STALE'].includes(e.event_type)) {
      if (!leaseMatches(e)) {
        add('ERROR', 'TERMINAL_WITHOUT_CLAIM', `${e.event_type} cannot release a lease without exact claim identity`, { event_id: e.event_id });
      } else {
        lease = null;
        terminalTransitionSeen = true;
      }
    } else if (e.event_type === 'RETRY') {
      for (const f of schema.retry_event_required_fields || []) if (!nonEmpty(e[f])) add('ERROR', 'RETRY_EVENT_INVALID', `RETRY event missing ${f}`, { event_id: e.event_id });
      const attempt = e.attempt;
      const budget = e.retry_budget;
      if (!Number.isInteger(attempt) || attempt < 1 || !Number.isInteger(budget) || budget < 1) add('ERROR', 'RETRY_CONTRACT_INVALID', 'RETRY attempt and retry_budget must be positive integers', { event_id: e.event_id, attempt, retry_budget: budget });
      if (Number.isInteger(attempt) && Number.isInteger(budget) && attempt > budget) add('ERROR', 'RETRY_ATTEMPT_EXCEEDS_BUDGET', 'RETRY attempt exceeds retry_budget', { event_id: e.event_id, attempt, retry_budget: budget });
      if (Number.isInteger(budget) && budget > limits.max_retry_budget) add('ERROR', 'RETRY_BUDGET_EXCEEDS_MAX', 'RETRY retry_budget exceeds max_retry_budget', { event_id: e.event_id, retry_budget: budget, max_retry_budget: limits.max_retry_budget });
    } else if (['CIRCUIT_OPEN', 'CIRCUIT_HALF_OPEN', 'CIRCUIT_CLOSED'].includes(e.event_type)) {
      for (const f of schema.circuit_event_required_fields || []) if (!nonEmpty(e[f])) add('ERROR', 'CIRCUIT_EVENT_INVALID', `${e.event_type} event missing ${f}`, { event_id: e.event_id });
    } else if (e.event_type === 'ALL_RUNGS_EXHAUSTED') {
      exhaustion = e;
      for (const f of schema.all_rungs_exhausted_required_fields || []) if (!nonEmpty(e[f])) add('ERROR', 'ALL_RUNGS_EXHAUSTED_INVALID', `ALL_RUNGS_EXHAUSTED event missing ${f}`, { event_id: e.event_id });
      if (!validExhaustion(e)) add('ERROR', 'ALL_RUNGS_EXHAUSTED_INVALID', 'ALL_RUNGS_EXHAUSTED event lacks valid eight-rung proof', { event_id: e.event_id });
    } else if (e.event_type === 'IDLE_VALID') {
      if (!exhaustion || exhaustion.control_head !== e.control_head) add('ERROR', 'IDLE_WITHOUT_EXHAUSTION', 'IDLE_VALID lacks preceding same-control exhaustion proof', { event_id: e.event_id });
    } else if (e.event_type === 'SUCCESSOR_BOUND') {
      if (!terminalTransitionSeen) add('ERROR', 'SUCCESSOR_BEFORE_TERMINAL', 'SUCCESSOR_BOUND requires a preceding valid terminal transition', { event_id: e.event_id });
    } else if (e.event_type === 'SHIFT_CLOSE') {
      if (lease) add('ERROR', 'UNCLOSED_MUTATION_CLAIM', 'SHIFT_CLOSE is invalid while a mutation claim remains unresolved', { event_id: e.event_id, lease_id: lease.lease_id });
      shiftClosed = true;
    }
  }

  if (lease) add('ERROR', 'UNCLOSED_MUTATION_CLAIM', 'shift ledger ends with unresolved mutation claim', { lease_id: lease.lease_id });
  if (now && !shiftClosed && latestTelemetryAt && minutesSince(latestTelemetryAt, now) > limits.telemetry_freshness_sla_minutes) {
    add('ERROR', 'TELEMETRY_STALE', 'latest utilization telemetry exceeds freshness SLA', {
      telemetry_age_minutes: Math.round(minutesSince(latestTelemetryAt, now)),
      telemetry_freshness_sla_minutes: limits.telemetry_freshness_sla_minutes,
    });
  }
  return findings;
}
'''
source = source[:start] + new_validate_ledger + source[end:]

old_call = "else findings.push(...validateLedger(readJson(eventRel), lane, ny.date, owner, schema));"
new_call = "else findings.push(...validateLedger(readJson(eventRel), lane, ny.date, owner, schema, now));"
if source.count(old_call) != 1:
    raise SystemExit(f'expected exactly one watchdog validateLedger call, found {source.count(old_call)}')
source = source.replace(old_call, new_call, 1)

path.write_text(source, encoding='utf-8')
print('patched', path)
