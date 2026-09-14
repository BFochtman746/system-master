'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const args = new Set(process.argv.slice(2));
const selftest = args.has('--selftest');
const watchdog = args.has('--watchdog');
const noLive = args.has('--no-live');
const reportArg = process.argv.find((v) => v.startsWith('--out='));
const outPath = reportArg ? path.resolve(root, reportArg.slice('--out='.length)) : null;

const ACTIVE_STATES = new Set(['CANDIDATE', 'READY', 'CLAIMED']);
const TERMINAL_OBLIGATION_STATES = new Set(['CLOSED', 'SUPERSEDED']);
const RUNG_DISPOSITIONS = new Set(['COMPLETE', 'DUPLICATE', 'DEPENDENCY_BLOCKED', 'HUMAN_AUTHOR_PRIVATE_NATIVE_EXTERNAL_BLOCKED', 'UNSAFE_WITHOUT_DECISION']);
const REQUIRED_DELEGATION_FIELDS = ['delegation_id', 'owner_path', 'objective_id', 'state', 'valid_for_control_ref', 'valid_for_control_head', 'created_at', 'last_revalidated_at', 'completion_delta', 'stop_condition', 'allowed_work', 'forbidden_authority', 'on_pass', 'on_failure'];
const CLAIM_FIELDS = ['lease_id', 'lane', 'delegation_id', 'objective_id', 'control_ref', 'control_head_at_claim', 'idempotency_key', 'claimed_at', 'lease_expires_at', 'last_heartbeat_at', 'attempt', 'checkpoint_pointer'];

function readJson(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) throw new Error(`required file missing: ${rel}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function nonEmpty(v) {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
function isSha(v) { return /^[0-9a-f]{40}$/i.test(String(v || '')); }
function parseDate(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function minutesSince(v, now = new Date()) {
  const d = parseDate(v);
  return d ? (now.getTime() - d.getTime()) / 60000 : Infinity;
}
function nyParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const o = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { date: `${o.year}-${o.month}-${o.day}`, hour: Number(o.hour), minute: Number(o.minute), second: Number(o.second) };
}
function branchHead(ref) {
  if (noLive) return null;
  try {
    const out = execFileSync('git', ['ls-remote', 'origin', `refs/heads/${ref}`], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    return out ? out.split(/\s+/)[0] : null;
  } catch (_) { return null; }
}
function fileBlob(rel) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${rel}`], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch (_) { return null; }
}
function resolveControl(owner) {
  const binding = owner.control_binding || { type: 'BRANCH_HEAD', ref: owner.control_ref };
  if (binding.type === 'FILE_BLOB') {
    const rel = binding.path || owner.control_ref;
    return { type: 'FILE_BLOB', ref: rel, head: fileBlob(rel) };
  }
  const ref = binding.ref || owner.control_ref;
  return { type: 'BRANCH_HEAD', ref, head: noLive ? owner.last_known_control_head : branchHead(ref) };
}
function validExhaustion(record) {
  if (!record || !Array.isArray(record.rungs) || record.rungs.length !== 8 || record.independent_work_remaining !== false) return false;
  return record.rungs.every((r, i) => r && Number(r.rung) === i + 1 && RUNG_DISPOSITIONS.has(r.disposition) && nonEmpty(r.evidence_or_blocker) && nonEmpty(r.independent_preparation_assessment) && nonEmpty(r.next_executable_condition));
}
function validClaim(claim, d, lane) {
  if (!claim) return false;
  for (const f of CLAIM_FIELDS) if (!nonEmpty(claim[f])) return false;
  if (claim.lane !== lane || claim.delegation_id !== d.delegation_id || claim.objective_id !== d.objective_id) return false;
  if (claim.control_ref !== d.valid_for_control_ref || claim.control_head_at_claim !== d.valid_for_control_head) return false;
  if (!isSha(claim.control_head_at_claim) || !Number.isInteger(claim.attempt) || claim.attempt < 1) return false;
  const c = parseDate(claim.claimed_at), x = parseDate(claim.lease_expires_at), h = parseDate(claim.last_heartbeat_at);
  return Boolean(c && x && h && x > c);
}
function obligationFor(d, obligations) {
  if (d.obligation_id) return obligations.find((o) => o && o.obligation_id === d.obligation_id) || null;
  const ids = [d.objective_id, d.parent_objective_id].filter(Boolean);
  return obligations.find((o) => o && ids.includes(o.obligation_id)) || null;
}

function validateOwner(owner, lane, now, dynamic, resolved, obligations, limits) {
  const findings = [];
  const add = (severity, type, message, detail = {}) => findings.push({ severity, type, lane, message, ...detail });
  const active = Array.isArray(owner.active_delegations) ? owner.active_delegations : [];
  const claimed = active.filter((d) => d && d.state === 'CLAIMED');
  if (claimed.length > 1) add('ERROR', 'OVERLAPPING_MUTATION_CLAIMS', 'more than one CLAIMED delegation exists', { claimed_count: claimed.length });
  if (!isSha(owner.last_known_control_head)) add('ERROR', 'OWNER_FILE_HEAD_INVALID', 'owner file lacks a valid exact control binding');
  if (resolved.head && owner.last_known_control_head !== resolved.head) add('ERROR', 'OWNER_FILE_HEAD_STALE', 'owner file does not match the resolved current owner control binding', { recorded_head: owner.last_known_control_head, current_head: resolved.head, control_type: resolved.type });

  const history = [...(owner.retired_delegations || []), ...(owner.delegation_history || [])];
  const retiredIds = new Set(history.map((x) => x && x.delegation_id).filter(Boolean));
  let healthyClaim = false;
  const seen = new Set();

  for (const d of active) {
    if (!d || !d.delegation_id || seen.has(d.delegation_id)) add('ERROR', 'DELEGATION_ID_INVALID', 'missing or duplicate delegation_id', { delegation_id: d?.delegation_id || null });
    if (!d) continue;
    seen.add(d.delegation_id);
    for (const f of REQUIRED_DELEGATION_FIELDS) if (!nonEmpty(d[f])) add('ERROR', 'DELEGATION_CONTRACT_DRIFT', `active delegation missing ${f}`, { delegation_id: d.delegation_id, field: f });
    if (!ACTIVE_STATES.has(d.state)) add('ERROR', 'DELEGATION_STATE_INVALID', 'active delegation has unsupported state', { delegation_id: d.delegation_id, state: d.state || null });
    if (d.owner_path !== owner.owner_path) add('ERROR', 'DELEGATION_OWNER_MISMATCH', 'delegation owner differs from owner file', { delegation_id: d.delegation_id });
    if (d.valid_for_control_ref !== owner.control_ref) add('ERROR', 'CONTROL_REF_MISMATCH', 'delegation control_ref differs from owner file', { delegation_id: d.delegation_id });
    if (!isSha(d.valid_for_control_head)) add('ERROR', 'CONTROL_HEAD_INVALID', 'delegation lacks a valid exact control SHA', { delegation_id: d.delegation_id });
    if (resolved.head && d.valid_for_control_head !== resolved.head) add('ERROR', 'STALE_DELEGATION', 'delegation is bound to a stale owner control binding', { delegation_id: d.delegation_id, delegated_head: d.valid_for_control_head, current_head: resolved.head });
    if (retiredIds.has(d.delegation_id)) add('ERROR', 'SEMANTIC_STALE_DELEGATION', 'active delegation_id also exists in retired history', { delegation_id: d.delegation_id });

    const obligation = obligationFor(d, obligations);
    if (d.obligation_id && !obligation) add('ERROR', 'OBJECTIVE_AUTHORITY_MISSING', 'declared obligation_id is absent from the authority-selected current obligation registry', { delegation_id: d.delegation_id, obligation_id: d.obligation_id });
    if (obligation) {
      if (obligation.owner_path !== owner.owner_path) add('ERROR', 'OBJECTIVE_OWNER_MISMATCH', 'delegated obligation belongs to another owner', { delegation_id: d.delegation_id, obligation_id: obligation.obligation_id, obligation_owner: obligation.owner_path });
      if (TERMINAL_OBLIGATION_STATES.has(obligation.state)) add('ERROR', 'SEMANTIC_STALE_DELEGATION', 'delegated obligation is terminal', { delegation_id: d.delegation_id, obligation_id: obligation.obligation_id, obligation_state: obligation.state });
    } else if (!d.obligation_id) {
      add('WARN', 'OBJECTIVE_AUTHORITY_UNBOUND', 'delegation has no explicit machine-verifiable obligation binding yet', { delegation_id: d.delegation_id });
    }

    if (d.state === 'CLAIMED') {
      const claim = d.claim || owner.active_claim || null;
      if (!validClaim(claim, d, lane)) add('ERROR', 'CLAIM_INVALID', 'CLAIMED delegation lacks a valid lease binding', { delegation_id: d.delegation_id });
      else if (dynamic) {
        const claimedAt = parseDate(claim.claimed_at);
        const exp = parseDate(claim.lease_expires_at);
        const heartbeat = parseDate(claim.last_heartbeat_at);
        const age = minutesSince(claim.last_heartbeat_at, now);
        if (heartbeat > now) add('ERROR', 'CLAIM_HEARTBEAT_IN_FUTURE', 'claim heartbeat is later than validator time', { delegation_id: d.delegation_id, lease_id: claim.lease_id, heartbeat_at: claim.last_heartbeat_at });
        else if (heartbeat < claimedAt || exp <= now || age > limits.heartbeat_sla_minutes) add('ERROR', 'STALE_CLAIM', 'claim lease or heartbeat is stale', { delegation_id: d.delegation_id, lease_id: claim.lease_id, heartbeat_age_minutes: Math.round(age) });
        else healthyClaim = true;
      } else if (parseDate(claim.last_heartbeat_at) < parseDate(claim.claimed_at)) {
        add('ERROR', 'CLAIM_INVALID', 'claim heartbeat predates claim creation', { delegation_id: d.delegation_id, lease_id: claim.lease_id });
      } else healthyClaim = true;
    }
  }

  if (dynamic && !healthyClaim) {
    const ready = active.find((d) => d && d.state === 'READY');
    if (ready) {
      const age = minutesSince(ready.last_revalidated_at || ready.created_at, now);
      if (age > limits.ready_dispatch_sla_minutes) add('ERROR', 'READY_UNDISPATCHED', 'READY work exceeded dispatch SLA without claim/revalidation', { delegation_id: ready.delegation_id, age_minutes: Math.round(age) });
    }
  }
  if (owner.empty_is_valid === true && !validExhaustion(owner.all_rungs_exhausted)) add('ERROR', 'FALSE_EMPTY', 'empty_is_valid=true without all-eight-rungs exhaustion proof');
  if (dynamic && active.length === 0 && !validExhaustion(owner.all_rungs_exhausted)) add('ERROR', 'SECOND_SHIFT_SCOPE_VIOLATION', 'lane has no active delegation and no all-eight-rungs exhaustion proof');
  return findings;
}

function validateLedger(ledger, lane, shiftDate, owner, schema, now = null) {
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
    if (e.control_ref !== owner.control_ref) add('ERROR', 'UTILIZATION_CONTROL_REF_MISMATCH', 'event control_ref differs from owner control_ref', { event_id: e.event_id });
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

function runSelftest() {
  const rungs = Array.from({ length: 8 }, (_, i) => ({ rung: i + 1, disposition: 'DEPENDENCY_BLOCKED', evidence_or_blocker: `B${i + 1}`, independent_preparation_assessment: 'none', next_executable_condition: 'dependency changes' }));
  const checks = [
    ['valid_exhaustion', validExhaustion({ rungs, independent_work_remaining: false })],
    ['short_exhaustion_rejected', !validExhaustion({ rungs: rungs.slice(0, 7), independent_work_remaining: false })],
    ['sha_validation', isSha('a'.repeat(40)) && !isSha('a'.repeat(39))]
  ];
  let failed = 0;
  for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}:${name}`); if (!ok) failed += 1; }
  if (failed) process.exit(1);
  console.log('SECOND_SHIFT_ENFORCE_SELFTEST_PASS');
  process.exit(0);
}
if (selftest) runSelftest();

const now = new Date();
const ny = nyParts(now);
const inShift = ny.hour >= 0 && ny.hour < 7;
const authority = readJson('governance/CURRENT-AUTHORITY.json');
const registryRel = authority.second_shift_registry || 'governance/second-shift/SECOND-SHIFT-REGISTRY-001.json';
const registry = readJson(registryRel);
const schemaRel = registry.utilization_event_schema || 'governance/second-shift/SECOND-SHIFT-UTILIZATION-EVENT-SCHEMA-001.json';
const schema = readJson(schemaRel);
const limits = { heartbeat_sla_minutes: 50, ready_dispatch_sla_minutes: 70, telemetry_freshness_sla_minutes: 75, max_retry_budget: 3, ...(schema.operational_limits || {}) };
const obligationRel = authority.obligation_registry;
const obligations = obligationRel && exists(obligationRel) ? (readJson(obligationRel).obligations || []) : [];
const findings = [];
const resolvedControls = {};

if (!obligationRel || !exists(obligationRel)) findings.push({ severity: 'ERROR', type: 'CURRENT_OBLIGATION_REGISTRY_MISSING', message: `authority-selected obligation registry missing: ${obligationRel || '<unset>'}` });
for (const required of [registry.schema, registry.execution_control || 'governance/second-shift/SECOND-SHIFT-EXECUTION-CONTROL-001.md', schemaRel]) {
  if (!required || !exists(required)) findings.push({ severity: 'ERROR', type: 'MISSING_CONTROL_ARTIFACT', message: `missing Second Shift control artifact: ${required || '<unset>'}` });
}

const laneEntries = Object.entries(registry.owner_files || {});
if (!laneEntries.length) findings.push({ severity: 'ERROR', type: 'SECOND_SHIFT_REGISTRY_EMPTY', message: 'Second Shift registry declares no owner lanes' });
const allowedLanes = new Set(schema.allowed_lanes || []);
for (const [lane] of laneEntries) if (!allowedLanes.has(lane)) findings.push({ severity: 'ERROR', type: 'UTILIZATION_LANE_NOT_ALLOWED', lane, message: 'registry lane is absent from utilization schema allowed_lanes' });

for (const [lane, rel] of laneEntries) {
  if (!rel || !exists(rel)) {
    findings.push({ severity: 'ERROR', type: 'MISSING_OWNER_FILE', lane, message: `owner delegation file missing: ${rel || '<unset>'}` });
    continue;
  }
  const owner = readJson(rel);
  const resolved = resolveControl(owner);
  resolvedControls[lane] = resolved;
  if (!resolved.head || !isSha(resolved.head)) findings.push({ severity: watchdog && !noLive ? 'ERROR' : 'WARN', type: 'CONTROL_BINDING_UNAVAILABLE', lane, message: `could not resolve ${resolved.type} control binding ${resolved.ref}` });
  findings.push(...validateOwner(owner, lane, now, watchdog && inShift, resolved, obligations, limits));

  if (watchdog && inShift && (ny.minute >= 28 || ny.hour > 0)) {
    const eventRel = `governance/second-shift/execution-events/${ny.date}/${lane}.json`;
    if (!exists(eventRel)) findings.push({ severity: 'ERROR', type: 'UTILIZATION_LEDGER_MISSING', lane, message: `shift event ledger missing after first owner cadence: ${eventRel}` });
    else findings.push(...validateLedger(readJson(eventRel), lane, ny.date, owner, schema, now));
  }
}

const errors = findings.filter((f) => f.severity === 'ERROR');
const report = {
  generated_at: now.toISOString(),
  new_york_time: ny,
  watchdog,
  in_shift_window: inShift,
  authority_obligation_registry: obligationRel || null,
  registry: registryRel,
  registry_declared_lanes: laneEntries.map(([lane]) => lane),
  resolved_controls: resolvedControls,
  standing: errors.length ? 'DRIFT_DETECTED' : 'PASS',
  error_count: errors.length,
  findings
};
console.log(`SECOND_SHIFT_ENFORCEMENT_${report.standing}`);
for (const f of findings) console.log(`${f.severity}:${f.type}:${f.lane || 'GLOBAL'}:${f.message}`);
if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
}
process.exit(errors.length ? 1 : 0);