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

const LANES = ['CORE', 'LEARNING', 'BOOK', 'PROSE'];
const ACTIVE_STATES = new Set(['CANDIDATE', 'READY', 'CLAIMED']);
const TERMINAL_OBLIGATION_STATES = new Set(['CLOSED', 'SUPERSEDED']);
const CURRENT_EVENT_TYPES = new Set(['READY', 'CLAIMED', 'RUNNING', 'HEARTBEAT', 'PROGRESS', 'SUCCESSOR_BOUND', 'IDLE_VALID']);
const RUNG_DISPOSITIONS = new Set(['COMPLETE', 'DUPLICATE', 'DEPENDENCY_BLOCKED', 'HUMAN_AUTHOR_PRIVATE_NATIVE_EXTERNAL_BLOCKED', 'UNSAFE_WITHOUT_DECISION']);
const REQUIRED_DELEGATION_FIELDS = ['delegation_id', 'owner_path', 'objective_id', 'state', 'valid_for_control_ref', 'valid_for_control_head', 'created_at', 'last_revalidated_at', 'completion_delta', 'stop_condition', 'allowed_work', 'forbidden_authority', 'on_pass', 'on_failure'];
const CLAIM_FIELDS = ['lease_id', 'lane', 'delegation_id', 'objective_id', 'control_ref', 'control_head_at_claim', 'idempotency_key', 'claimed_at', 'lease_expires_at', 'last_heartbeat_at', 'attempt', 'checkpoint_pointer'];

function readJson(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) throw new Error(`required file missing: ${rel}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function isSha(v) { return /^[0-9a-f]{40}$/i.test(String(v || '')); }
function nonEmpty(v) {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
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
function liveHead(ref) {
  if (noLive) return null;
  try {
    const out = execFileSync('git', ['ls-remote', 'origin', `refs/heads/${ref}`], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    return out ? out.split(/\s+/)[0] : null;
  } catch (_) {
    return null;
  }
}
function validExhaustion(record) {
  if (!record || !Array.isArray(record.rungs) || record.rungs.length !== 8 || record.independent_work_remaining !== false) return false;
  return record.rungs.every((r, i) => r && Number(r.rung) === i + 1 && RUNG_DISPOSITIONS.has(r.disposition) && nonEmpty(r.evidence_or_blocker) && nonEmpty(r.independent_preparation_assessment) && nonEmpty(r.next_executable_condition));
}
function validClaim(claim, d) {
  if (!claim) return false;
  for (const f of CLAIM_FIELDS) if (!nonEmpty(claim[f])) return false;
  if (claim.lane !== d.__lane || claim.delegation_id !== d.delegation_id || claim.objective_id !== d.objective_id) return false;
  if (claim.control_ref !== d.valid_for_control_ref || claim.control_head_at_claim !== d.valid_for_control_head) return false;
  if (!isSha(claim.control_head_at_claim) || !Number.isInteger(claim.attempt) || claim.attempt < 1) return false;
  const c = parseDate(claim.claimed_at), x = parseDate(claim.lease_expires_at), h = parseDate(claim.last_heartbeat_at);
  return Boolean(c && x && h && x > c && h >= c);
}

function obligationFor(d, obligations) {
  if (d.obligation_id) return obligations.find((o) => o.obligation_id === d.obligation_id) || null;
  const ids = [d.objective_id, d.parent_objective_id].filter(Boolean);
  return obligations.find((o) => ids.includes(o.obligation_id)) || null;
}

function validateOwner(data, lane, now, dynamic, remoteHead, obligations, limits) {
  const findings = [];
  const add = (severity, type, message, detail = {}) => findings.push({ severity, type, lane, message, ...detail });
  const active = Array.isArray(data.active_delegations) ? data.active_delegations : [];
  const ids = new Set();
  const claimed = active.filter((d) => d && d.state === 'CLAIMED');
  if (claimed.length > 1) add('ERROR', 'OVERLAPPING_MUTATION_CLAIMS', 'more than one CLAIMED delegation exists', { claimed_count: claimed.length });
  if (!isSha(data.last_known_control_head)) add('ERROR', 'OWNER_FILE_HEAD_INVALID', 'owner file lacks a valid exact control head');
  if (remoteHead && data.last_known_control_head !== remoteHead) add('ERROR', 'OWNER_FILE_HEAD_STALE', 'owner file does not match the live remote owner head', { recorded_head: data.last_known_control_head, live_head: remoteHead });

  const history = [...(data.retired_delegations || []), ...(data.delegation_history || [])];
  const retiredDelegationIds = new Set(history.map((x) => x && x.delegation_id).filter(Boolean));
  let healthyClaim = false;

  for (const d0 of active) {
    const d = { ...d0, __lane: lane };
    if (!d.delegation_id || ids.has(d.delegation_id)) add('ERROR', 'DELEGATION_ID_INVALID', 'missing or duplicate delegation_id', { delegation_id: d.delegation_id || null });
    ids.add(d.delegation_id);
    for (const f of REQUIRED_DELEGATION_FIELDS) if (!nonEmpty(d[f])) add('ERROR', 'DELEGATION_CONTRACT_DRIFT', `active delegation missing ${f}`, { delegation_id: d.delegation_id || null, field: f });
    if (!ACTIVE_STATES.has(d.state)) add('ERROR', 'DELEGATION_STATE_INVALID', 'active delegation has unsupported state', { state: d.state || null });
    if (d.owner_path !== data.owner_path) add('ERROR', 'DELEGATION_OWNER_MISMATCH', 'delegation owner differs from owner file');
    if (d.valid_for_control_ref !== data.control_ref) add('ERROR', 'CONTROL_REF_MISMATCH', 'delegation control_ref differs from owner file');
    if (!isSha(d.valid_for_control_head)) add('ERROR', 'CONTROL_HEAD_INVALID', 'delegation lacks a valid exact control SHA');
    if (remoteHead && d.valid_for_control_head !== remoteHead) add('ERROR', 'STALE_DELEGATION', 'delegation is bound to a stale remote owner head', { delegation_id: d.delegation_id, delegated_head: d.valid_for_control_head, live_head: remoteHead });
    if (retiredDelegationIds.has(d.delegation_id)) add('ERROR', 'SEMANTIC_STALE_DELEGATION', 'active delegation_id also exists in retired history', { delegation_id: d.delegation_id });

    const obligation = obligationFor(d, obligations);
    if (d.obligation_id && !obligation) add('ERROR', 'OBJECTIVE_AUTHORITY_MISSING', 'declared obligation_id is not present in the current obligation registry', { obligation_id: d.obligation_id });
    if (obligation) {
      if (obligation.owner_path !== data.owner_path) add('ERROR', 'OBJECTIVE_OWNER_MISMATCH', 'delegated obligation belongs to another owner', { obligation_id: obligation.obligation_id, obligation_owner: obligation.owner_path });
      if (TERMINAL_OBLIGATION_STATES.has(obligation.state)) add('ERROR', 'SEMANTIC_STALE_DELEGATION', 'delegated obligation is terminal', { obligation_id: obligation.obligation_id, obligation_state: obligation.state });
    } else {
      add('WARN', 'OBJECTIVE_AUTHORITY_UNBOUND', 'delegation has no explicit machine-verifiable obligation binding yet', { delegation_id: d.delegation_id });
    }

    if (d.state === 'CLAIMED') {
      const claim = d.claim || data.active_claim || null;
      if (!validClaim(claim, d)) add('ERROR', 'CLAIM_INVALID', 'CLAIMED delegation lacks a valid lease binding');
      else if (dynamic) {
        const exp = parseDate(claim.lease_expires_at);
        const heartbeatAge = minutesSince(claim.last_heartbeat_at, now);
        if (exp <= now || heartbeatAge > limits.heartbeat_sla_minutes) add('ERROR', 'STALE_CLAIM', 'claim lease or heartbeat is stale', { lease_id: claim.lease_id, heartbeat_age_minutes: Math.round(heartbeatAge) });
        else healthyClaim = true;
      } else healthyClaim = true;
    }
  }

  if (dynamic && !healthyClaim) {
    const d = active.find((x) => x && x.state === 'READY');
    if (d) {
      const age = minutesSince(d.last_revalidated_at || d.created_at, now);
      if (age > limits.ready_dispatch_sla_minutes) add('ERROR', 'READY_UNDISPATCHED', 'READY work exceeded the dispatch SLA without claim/revalidation', { delegation_id: d.delegation_id, age_minutes: Math.round(age) });
    }
  }
  if (data.empty_is_valid === true && !validExhaustion(data.all_rungs_exhausted)) add('ERROR', 'FALSE_EMPTY', 'empty_is_valid=true without all-eight-rungs exhaustion proof');
  if (dynamic && active.length === 0 && !validExhaustion(data.all_rungs_exhausted)) add('ERROR', 'SECOND_SHIFT_SCOPE_VIOLATION', 'lane has no active delegation and no all-eight-rungs exhaustion proof');
  return findings;
}

function validateLedger(ledger, lane, shiftDate, ownerData, now, dynamic, schema, limits) {
  const findings = [];
  const add = (severity, type, message, detail = {}) => findings.push({ severity, type, lane, message, ...detail });
  const requiredLedger = schema.required_ledger_fields || [];
  const requiredEvent = schema.required_event_fields || [];
  for (const f of requiredLedger) if (!nonEmpty(ledger[f])) add('ERROR', 'UTILIZATION_LEDGER_INVALID', `ledger missing ${f}`);
  if (ledger.schema_id !== schema.schema_id) add('ERROR', 'UTILIZATION_LEDGER_SCHEMA_MISMATCH', 'ledger schema_id differs from current schema');
  if (ledger.shift_date !== shiftDate) add('ERROR', 'UTILIZATION_SHIFT_DATE_MISMATCH', 'ledger shift_date differs from the current shift date');
  if (ledger.lane !== lane) add('ERROR', 'UTILIZATION_LANE_MISMATCH', 'ledger lane differs from file lane');
  if (!Array.isArray(ledger.events)) return [...findings, { severity: 'ERROR', type: 'UTILIZATION_LEDGER_INVALID', lane, message: 'events must be an array' }];

  const allowed = new Set(schema.allowed_event_types || []);
  const eventIds = new Set();
  let lastTime = null;
  let activeLease = null;
  let lastExhaustion = null;
  let activeDelegationObserved = false;
  const activeDelegation = (ownerData.active_delegations || [])[0] || null;

  for (const e of ledger.events) {
    for (const f of requiredEvent) if (!nonEmpty(e[f])) add('ERROR', 'UTILIZATION_EVENT_INVALID', `event missing ${f}`, { event_id: e.event_id || null });
    if (!e.event_id || eventIds.has(e.event_id)) add('ERROR', 'UTILIZATION_EVENT_DUPLICATE', 'event_id missing or duplicated', { event_id: e.event_id || null });
    eventIds.add(e.event_id);
    const t = parseDate(e.occurred_at);
    if (!t) add('ERROR', 'UTILIZATION_EVENT_TIME_INVALID', 'event occurred_at is invalid', { event_id: e.event_id || null });
    else if (lastTime && t < lastTime) add('ERROR', 'UTILIZATION_EVENT_ORDER_INVALID', 'event timestamps are not monotonic', { event_id: e.event_id });
    if (t) lastTime = t;
    if (!allowed.has(e.event_type)) add('ERROR', 'UTILIZATION_EVENT_TYPE_INVALID', 'event_type is not allowed', { event_id: e.event_id, event_type: e.event_type });
    if (e.lane !== lane) add('ERROR', 'UTILIZATION_EVENT_LANE_MISMATCH', 'event lane differs from ledger lane', { event_id: e.event_id });
    if (e.control_ref !== ownerData.control_ref) add('ERROR', 'UTILIZATION_CONTROL_REF_MISMATCH', 'event control_ref differs from owner control_ref', { event_id: e.event_id });
    if (!isSha(e.control_head)) add('ERROR', 'UTILIZATION_CONTROL_HEAD_INVALID', 'event control_head is not an exact SHA', { event_id: e.event_id });
    if (activeDelegation && e.delegation_id === activeDelegation.delegation_id) activeDelegationObserved = true;

    if (e.event_type === 'CLAIMED') {
      for (const f of schema.claim_event_required_fields || []) if (!nonEmpty(e[f])) add('ERROR', 'CLAIM_EVENT_INVALID', `CLAIMED event missing ${f}`, { event_id: e.event_id });
      const exp = parseDate(e.lease_expires_at);
      if (activeLease && (!lastTime || parseDate(activeLease.lease_expires_at) > t)) add('ERROR', 'OVERLAPPING_MUTATION_CLAIMS', 'CLAIMED event overlaps an unresolved lease', { event_id: e.event_id, prior_lease_id: activeLease.lease_id });
      if (!exp || (t && exp <= t) || !Number.isInteger(e.attempt) || e.attempt < 1) add('ERROR', 'CLAIM_EVENT_INVALID', 'CLAIMED event has invalid lease expiry/attempt', { event_id: e.event_id });
      activeLease = { lease_id: e.lease_id, idempotency_key: e.idempotency_key, delegation_id: e.delegation_id, control_head: e.control_head, lease_expires_at: e.lease_expires_at };
    } else if (e.event_type === 'RUNNING' || e.event_type === 'PROGRESS') {
      if (!activeLease || activeLease.delegation_id !== e.delegation_id || activeLease.control_head !== e.control_head) add('ERROR', e.event_type === 'RUNNING' ? 'RUNNING_WITHOUT_CLAIM' : 'PROGRESS_WITHOUT_CLAIM', `${e.event_type} lacks a matching live claim`, { event_id: e.event_id });
    } else if (e.event_type === 'HEARTBEAT') {
      for (const f of schema.heartbeat_event_required_fields || []) if (!nonEmpty(e[f])) add('ERROR', 'HEARTBEAT_EVENT_INVALID', `HEARTBEAT event missing ${f}`, { event_id: e.event_id });
      if (!activeLease || activeLease.lease_id !== e.lease_id || activeLease.idempotency_key !== e.idempotency_key) add('ERROR', 'HEARTBEAT_WITHOUT_CLAIM', 'HEARTBEAT does not match the live lease', { event_id: e.event_id });
    } else if (['COMPLETED', 'BLOCKED', 'STALE'].includes(e.event_type)) {
      if (activeLease && activeLease.delegation_id === e.delegation_id) activeLease = null;
    } else if (e.event_type === 'RETRY') {
      for (const f of schema.retry_event_required_fields || []) if (!nonEmpty(e[f])) add('ERROR', 'RETRY_EVENT_INVALID', `RETRY event missing ${f}`, { event_id: e.event_id });
      if (!Number.isInteger(e.retry_budget) || e.retry_budget < 1 || e.retry_budget > limits.max_retry_budget || !Number.isInteger(e.attempt) || e.attempt < 1 || e.attempt > e.retry_budget) add('ERROR', 'RETRY_BUDGET_INVALID', 'retry attempt/budget violates bounded retry policy', { event_id: e.event_id });
    } else if (e.event_type.startsWith('CIRCUIT_')) {
      for (const f of schema.circuit_event_required_fields || []) if (!nonEmpty(e[f])) add('ERROR', 'CIRCUIT_EVENT_INVALID', `${e.event_type} missing ${f}`, { event_id: e.event_id });
    } else if (e.event_type === 'ALL_RUNGS_EXHAUSTED') {
      if (!validExhaustion({ rungs: e.rungs, independent_work_remaining: e.independent_work_remaining })) add('ERROR', 'ALL_RUNGS_EXHAUSTED_INVALID', 'ALL_RUNGS_EXHAUSTED lacks exact eight-rung evidence', { event_id: e.event_id });
      if (!nonEmpty(e.next_external_condition)) add('ERROR', 'ALL_RUNGS_EXHAUSTED_INVALID', 'ALL_RUNGS_EXHAUSTED lacks next_external_condition', { event_id: e.event_id });
      lastExhaustion = e;
    } else if (e.event_type === 'IDLE_VALID') {
      if (!lastExhaustion || lastExhaustion.control_head !== e.control_head) add('ERROR', 'IDLE_WITHOUT_EXHAUSTION', 'IDLE_VALID lacks preceding same-head exhaustion evidence', { event_id: e.event_id });
      if (activeLease) add('ERROR', 'IDLE_WITH_ACTIVE_CLAIM', 'IDLE_VALID conflicts with an active claim', { event_id: e.event_id });
    } else if (e.event_type === 'SHIFT_CLOSE' && activeLease) {
      add('ERROR', 'SHIFT_CLOSE_WITH_ACTIVE_CLAIM', 'SHIFT_CLOSE leaves an active lease unresolved', { event_id: e.event_id, lease_id: activeLease.lease_id });
    }
  }

  if (dynamic && ledger.events.length) {
    const latest = ledger.events[ledger.events.length - 1];
    const age = minutesSince(latest.occurred_at, now);
    if (age > limits.telemetry_freshness_sla_minutes) add('ERROR', 'UTILIZATION_LEDGER_STALE', 'latest event exceeds telemetry freshness SLA', { event_id: latest.event_id, age_minutes: Math.round(age) });
    if (CURRENT_EVENT_TYPES.has(latest.event_type) && latest.control_head !== ownerData.last_known_control_head) add('ERROR', 'UTILIZATION_LATEST_HEAD_STALE', 'latest current-state event does not match owner head', { event_id: latest.event_id, event_head: latest.control_head, owner_head: ownerData.last_known_control_head });
    if (activeDelegation && !activeDelegationObserved) add('ERROR', 'ACTIVE_DELEGATION_UNTELEMETRIED', 'current active delegation is absent from shift ledger', { delegation_id: activeDelegation.delegation_id });
  }
  return findings;
}

function runSelftest() {
  const now = new Date('2026-09-11T04:30:00Z');
  const limits = { heartbeat_sla_minutes: 50, ready_dispatch_sla_minutes: 70, telemetry_freshness_sla_minutes: 75, max_retry_budget: 3 };
  const base = { delegation_id: 'D1', owner_path: 'SYSTEM_MASTER/CORE', objective_id: 'O1', state: 'READY', valid_for_control_ref: 'x', valid_for_control_head: 'a'.repeat(40), created_at: '2026-09-11T04:10:00Z', last_revalidated_at: '2026-09-11T04:10:00Z', completion_delta: 'delta', stop_condition: 'stop', allowed_work: ['safe'], forbidden_authority: ['none'], on_pass: 'continue', on_failure: 'classify' };
  const owner = { owner_path: 'SYSTEM_MASTER/CORE', control_ref: 'x', last_known_control_head: 'a'.repeat(40), active_delegations: [base] };
  const claim = { lease_id: 'L1', lane: 'CORE', delegation_id: 'D1', objective_id: 'O1', control_ref: 'x', control_head_at_claim: 'a'.repeat(40), idempotency_key: 'K1', claimed_at: '2026-09-11T04:10:00Z', lease_expires_at: '2026-09-11T05:00:00Z', last_heartbeat_at: '2026-09-11T04:25:00Z', attempt: 1, checkpoint_pointer: 'c1' };
  const schema = { schema_id: 'S', allowed_event_types: ['READY','CLAIMED','RUNNING','HEARTBEAT','PROGRESS','COMPLETED','BLOCKED','STALE','RETRY','CIRCUIT_OPEN','SUCCESSOR_BOUND','ALL_RUNGS_EXHAUSTED','IDLE_VALID','SHIFT_CLOSE'], required_ledger_fields: ['schema_id','shift_id','shift_date','lane','events'], required_event_fields: ['event_id','occurred_at','event_type','lane','control_ref','control_head','delegation_id','objective_id','evidence'], claim_event_required_fields: ['lease_id','idempotency_key','lease_expires_at','attempt'], heartbeat_event_required_fields: ['lease_id','idempotency_key','checkpoint_pointer'], retry_event_required_fields: ['dependency_or_operation','failure_class','attempt','retry_budget','next_action'], circuit_event_required_fields: ['dependency_or_operation','failure_class','next_probe_at_or_condition','fallback_successor_or_rung'] };
  const eb = { lane: 'CORE', control_ref: 'x', control_head: 'a'.repeat(40), delegation_id: 'D1', objective_id: 'O1', evidence: 'test' };
  const ledger = { schema_id: 'S', shift_id: '2026-09-11', shift_date: '2026-09-11', lane: 'CORE', events: [
    { ...eb, event_id: 'E1', occurred_at: '2026-09-11T04:10:00Z', event_type: 'READY' },
    { ...eb, event_id: 'E2', occurred_at: '2026-09-11T04:11:00Z', event_type: 'CLAIMED', lease_id: 'L1', idempotency_key: 'K1', lease_expires_at: '2026-09-11T05:00:00Z', attempt: 1 },
    { ...eb, event_id: 'E3', occurred_at: '2026-09-11T04:12:00Z', event_type: 'RUNNING' },
    { ...eb, event_id: 'E4', occurred_at: '2026-09-11T04:25:00Z', event_type: 'HEARTBEAT', lease_id: 'L1', idempotency_key: 'K1', checkpoint_pointer: 'c1' }
  ] };
  const rungs = Array.from({ length: 8 }, (_, i) => ({ rung: i + 1, disposition: 'DEPENDENCY_BLOCKED', evidence_or_blocker: `B${i}`, independent_preparation_assessment: 'none', next_executable_condition: 'change' }));
  const tests = [
    ['valid_ready', validateOwner(owner, 'CORE', now, true, 'a'.repeat(40), [], limits).every((f) => f.severity !== 'ERROR')],
    ['remote_stale_head_rejected', validateOwner(owner, 'CORE', now, false, 'b'.repeat(40), [], limits).some((f) => f.type === 'STALE_DELEGATION')],
    ['missing_contract_field_rejected', validateOwner({ ...owner, active_delegations: [{ ...base, on_pass: undefined }] }, 'CORE', now, false, 'a'.repeat(40), [], limits).some((f) => f.type === 'DELEGATION_CONTRACT_DRIFT')],
    ['healthy_claim_valid', validateOwner({ ...owner, active_delegations: [{ ...base, state: 'CLAIMED', claim }] }, 'CORE', now, true, 'a'.repeat(40), [], limits).every((f) => !['CLAIM_INVALID','STALE_CLAIM'].includes(f.type))],
    ['valid_ledger', validateLedger(ledger, 'CORE', '2026-09-11', owner, now, true, schema, limits).length === 0],
    ['duplicate_event_rejected', validateLedger({ ...ledger, events: [...ledger.events, { ...ledger.events[3] }] }, 'CORE', '2026-09-11', owner, now, false, schema, limits).some((f) => f.type === 'UTILIZATION_EVENT_DUPLICATE')],
    ['running_without_claim_rejected', validateLedger({ ...ledger, events: [{ ...eb, event_id: 'R1', occurred_at: '2026-09-11T04:12:00Z', event_type: 'RUNNING' }] }, 'CORE', '2026-09-11', owner, now, false, schema, limits).some((f) => f.type === 'RUNNING_WITHOUT_CLAIM')],
    ['overlapping_claim_rejected', validateLedger({ ...ledger, events: [...ledger.events.slice(0,2), { ...ledger.events[1], event_id: 'E2B', occurred_at: '2026-09-11T04:11:30Z', lease_id: 'L2', idempotency_key: 'K2' }] }, 'CORE', '2026-09-11', owner, now, false, schema, limits).some((f) => f.type === 'OVERLAPPING_MUTATION_CLAIMS')],
    ['idle_without_exhaustion_rejected', validateLedger({ ...ledger, events: [{ ...eb, event_id: 'I1', occurred_at: '2026-09-11T04:12:00Z', event_type: 'IDLE_VALID' }] }, 'CORE', '2026-09-11', owner, now, false, schema, limits).some((f) => f.type === 'IDLE_WITHOUT_EXHAUSTION')],
    ['valid_exhaustion', validExhaustion({ rungs, independent_work_remaining: false })]
  ];
  let failed = 0;
  for (const [name, ok] of tests) { console.log(`${ok ? 'PASS' : 'FAIL'}:${name}`); if (!ok) failed += 1; }
  if (failed) process.exit(1);
  console.log('SECOND_SHIFT_ENFORCE_SELFTEST_PASS');
  process.exit(0);
}

if (selftest) runSelftest();

const now = new Date();
const ny = nyParts(now);
const inShift = ny.hour >= 0 && ny.hour < 7;
const registry = readJson('governance/second-shift/SECOND-SHIFT-REGISTRY-001.json');
const schemaRel = registry.utilization_event_schema || 'governance/second-shift/SECOND-SHIFT-UTILIZATION-EVENT-SCHEMA-001.json';
const schema = readJson(schemaRel);
const limits = { heartbeat_sla_minutes: 50, ready_dispatch_sla_minutes: 70, telemetry_freshness_sla_minutes: 75, max_retry_budget: 3, ...(schema.operational_limits || {}) };
const obligations = readJson('governance/WORK-OBLIGATION-REGISTRY-001.json').obligations || [];
const findings = [];
const liveHeads = {};

for (const required of [registry.schema, registry.execution_control || 'governance/second-shift/SECOND-SHIFT-EXECUTION-CONTROL-001.md', schemaRel]) {
  if (!required || !exists(required)) findings.push({ severity: 'ERROR', type: 'MISSING_CONTROL_ARTIFACT', message: `missing Second Shift control artifact: ${required || '<unset>'}` });
}
for (const lane of LANES) {
  const rel = registry.owner_files?.[lane];
  if (!rel || !exists(rel)) { findings.push({ severity: 'ERROR', type: 'MISSING_OWNER_FILE', lane, message: `owner delegation file missing: ${rel || '<unset>'}` }); continue; }
  const owner = readJson(rel);
  const remote = liveHead(owner.control_ref);
  liveHeads[lane] = remote;
  if (!noLive && !remote) findings.push({ severity: watchdog ? 'ERROR' : 'WARN', type: 'LIVE_HEAD_UNAVAILABLE', lane, message: `could not resolve live head for ${owner.control_ref}` });
  findings.push(...validateOwner(owner, lane, now, watchdog && inShift, remote, obligations, limits));
  if (watchdog && inShift && (ny.minute >= 28 || ny.hour > 0)) {
    const eventRel = `governance/second-shift/execution-events/${ny.date}/${lane}.json`;
    if (!exists(eventRel)) findings.push({ severity: 'ERROR', type: 'UTILIZATION_LEDGER_MISSING', lane, message: `shift event ledger missing after first owner cadence: ${eventRel}` });
    else findings.push(...validateLedger(readJson(eventRel), lane, ny.date, owner, now, true, schema, limits));
  }
}

const errors = findings.filter((f) => f.severity === 'ERROR');
const report = { generated_at: now.toISOString(), new_york_time: ny, watchdog, in_shift_window: inShift, live_heads: liveHeads, standing: errors.length ? 'DRIFT_DETECTED' : 'PASS', error_count: errors.length, findings };
console.log(`SECOND_SHIFT_ENFORCEMENT_${report.standing}`);
for (const f of findings) console.log(`${f.severity}:${f.type}:${f.lane || 'GLOBAL'}:${f.message}`);
if (outPath) { fs.mkdirSync(path.dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n'); }
process.exit(errors.length ? 1 : 0);
