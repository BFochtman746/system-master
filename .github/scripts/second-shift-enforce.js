'use strict';

const fs = require('fs');
const path = require('path');
const { validateLedger } = require('./second-shift-event-ledger');

const root = path.resolve(__dirname, '..', '..');
const args = new Set(process.argv.slice(2));
const selftest = args.has('--selftest');
const watchdog = args.has('--watchdog');
const reportArg = process.argv.find((v) => v.startsWith('--out='));
const outPath = reportArg ? path.resolve(root, reportArg.slice('--out='.length)) : null;

const LANES = ['CORE', 'LEARNING', 'BOOK', 'PROSE'];
const ACTIVE_STATES = new Set(['CANDIDATE', 'READY', 'CLAIMED']);
const RUNG_DISPOSITIONS = new Set([
  'COMPLETE',
  'DUPLICATE',
  'DEPENDENCY_BLOCKED',
  'HUMAN_AUTHOR_PRIVATE_NATIVE_EXTERNAL_BLOCKED',
  'UNSAFE_WITHOUT_DECISION'
]);
const CLAIM_FIELDS = [
  'lease_id', 'lane', 'delegation_id', 'objective_id', 'control_ref',
  'control_head_at_claim', 'idempotency_key', 'claimed_at', 'lease_expires_at',
  'last_heartbeat_at', 'attempt', 'checkpoint_pointer'
];

function readJson(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) throw new Error(`required file missing: ${rel}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function isSha(value) { return /^[0-9a-f]{40}$/i.test(String(value || '')); }
function parseDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nyParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const o = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    date: `${o.year}-${o.month}-${o.day}`,
    hour: Number(o.hour), minute: Number(o.minute), second: Number(o.second)
  };
}

function minutesSince(value, now = new Date()) {
  const d = parseDate(value);
  if (!d) return Infinity;
  return (now.getTime() - d.getTime()) / 60000;
}

function validExhaustion(record) {
  if (!record || !Array.isArray(record.rungs) || record.rungs.length !== 8) return false;
  if (record.independent_work_remaining !== false) return false;
  return record.rungs.every((r, i) =>
    r && Number(r.rung) === i + 1 && RUNG_DISPOSITIONS.has(r.disposition) &&
    typeof r.evidence_or_blocker === 'string' && r.evidence_or_blocker.length > 0 &&
    typeof r.independent_preparation_assessment === 'string' && r.independent_preparation_assessment.length > 0 &&
    typeof r.next_executable_condition === 'string' && r.next_executable_condition.length > 0
  );
}

function validClaim(claim, delegation) {
  if (!claim) return false;
  for (const field of CLAIM_FIELDS) {
    if (claim[field] === undefined || claim[field] === null || claim[field] === '') return false;
  }
  if (claim.lane !== delegation.__lane) return false;
  if (claim.delegation_id !== delegation.delegation_id) return false;
  if (claim.objective_id !== delegation.objective_id) return false;
  if (claim.control_ref !== delegation.valid_for_control_ref) return false;
  if (claim.control_head_at_claim !== delegation.valid_for_control_head) return false;
  if (!isSha(claim.control_head_at_claim)) return false;
  if (!Number.isInteger(claim.attempt) || claim.attempt < 1) return false;
  const claimed = parseDate(claim.claimed_at);
  const expires = parseDate(claim.lease_expires_at);
  const heartbeat = parseDate(claim.last_heartbeat_at);
  if (!claimed || !expires || !heartbeat) return false;
  if (expires <= claimed || heartbeat < claimed) return false;
  return true;
}

function validateOwner(data, lane, now, dynamic) {
  const findings = [];
  const add = (severity, type, message, detail = {}) => findings.push({ severity, type, lane, message, ...detail });
  const active = Array.isArray(data.active_delegations) ? data.active_delegations : [];
  const ids = new Set();
  const claimed = active.filter((d) => d && d.state === 'CLAIMED');

  if (claimed.length > 1) {
    add('ERROR', 'OVERLAPPING_MUTATION_CLAIMS', 'more than one CLAIMED delegation is present; deep READY/CANDIDATE queueing is allowed but only one mutation-capable claim may be live per lane', { claimed_count: claimed.length });
  }

  let healthyClaim = false;
  for (const d0 of active) {
    const d = { ...d0, __lane: lane };
    if (!d.delegation_id || ids.has(d.delegation_id)) add('ERROR', 'DELEGATION_ID_INVALID', 'missing or duplicate delegation_id', { delegation_id: d.delegation_id || null });
    ids.add(d.delegation_id);
    if (!ACTIVE_STATES.has(d.state)) add('ERROR', 'DELEGATION_STATE_INVALID', 'active delegation has unsupported state', { state: d.state || null });
    if (!isSha(d.valid_for_control_head)) add('ERROR', 'CONTROL_HEAD_INVALID', 'active delegation lacks a 40-character exact control SHA');

    if (d.state === 'CLAIMED') {
      const claim = d.claim || data.active_claim || null;
      if (!validClaim(claim, d)) {
        add('ERROR', 'CLAIM_INVALID', 'CLAIMED delegation lacks a valid lease/claim binding');
      } else if (dynamic) {
        const expires = parseDate(claim.lease_expires_at);
        const heartbeatAge = minutesSince(claim.last_heartbeat_at, now);
        if (expires <= now || heartbeatAge > 50) {
          add('ERROR', 'STALE_CLAIM', 'claim lease/heartbeat is stale and must be recovered', { lease_id: claim.lease_id, heartbeat_age_minutes: Math.round(heartbeatAge) });
        } else {
          healthyClaim = true;
        }
      } else {
        healthyClaim = true;
      }
    }
  }

  if (dynamic && !healthyClaim) {
    const dispatchable = active.find((d) => d && d.state === 'READY');
    if (dispatchable) {
      const age = minutesSince(dispatchable.last_revalidated_at || dispatchable.created_at, now);
      if (age > 70) {
        add('ERROR', 'READY_UNDISPATCHED', 'head READY delegation exceeded one hourly dispatch cadence without revalidation/claim', { delegation_id: dispatchable.delegation_id, age_minutes: Math.round(age) });
      }
    }
  }

  if (data.empty_is_valid === true && !validExhaustion(data.all_rungs_exhausted)) {
    add('ERROR', 'FALSE_EMPTY', 'empty_is_valid=true without a valid all-eight-rungs-exhausted proof');
  }
  if (dynamic && active.length === 0 && !validExhaustion(data.all_rungs_exhausted)) {
    add('ERROR', 'SECOND_SHIFT_SCOPE_VIOLATION', 'no active delegation during shift and no valid all-eight-rungs-exhausted proof');
  }

  return findings;
}

function makeValidLedger(now) {
  const sha = 'a'.repeat(40);
  return {
    schema_id: 'SECOND-SHIFT-UTILIZATION-EVENT-SCHEMA-001',
    shift_id: 'SECOND-SHIFT-2026-09-11',
    shift_date: '2026-09-11',
    lane: 'CORE',
    events: [
      {
        event_id: 'E1', occurred_at: '2026-09-11T04:02:00Z', event_type: 'SHIFT_OPEN', lane: 'CORE',
        control_ref: 'system-master/control-v2', control_head: sha, delegation_id: 'D1', objective_id: 'O1', evidence: 'open'
      },
      {
        event_id: 'E2', occurred_at: '2026-09-11T04:04:00Z', event_type: 'CLAIMED', lane: 'CORE',
        control_ref: 'system-master/control-v2', control_head: sha, delegation_id: 'D1', objective_id: 'O1', evidence: 'claim',
        lease_id: 'L1', idempotency_key: 'K1', lease_expires_at: '2026-09-11T04:55:00Z', attempt: 1
      },
      {
        event_id: 'E3', occurred_at: '2026-09-11T04:05:00Z', event_type: 'RUNNING', lane: 'CORE',
        control_ref: 'system-master/control-v2', control_head: sha, delegation_id: 'D1', objective_id: 'O1', evidence: 'running',
        lease_id: 'L1', idempotency_key: 'K1'
      },
      {
        event_id: 'E4', occurred_at: '2026-09-11T04:20:00Z', event_type: 'HEARTBEAT', lane: 'CORE',
        control_ref: 'system-master/control-v2', control_head: sha, delegation_id: 'D1', objective_id: 'O1', evidence: 'heartbeat',
        lease_id: 'L1', idempotency_key: 'K1', checkpoint_pointer: 'checkpoint-1'
      }
    ]
  };
}

function runSelftest() {
  const now = new Date('2026-09-11T04:30:00Z');
  const baseDelegation = {
    delegation_id: 'D1', objective_id: 'O1', state: 'READY',
    valid_for_control_ref: 'x', valid_for_control_head: 'a'.repeat(40),
    created_at: '2026-09-11T04:10:00Z', last_revalidated_at: '2026-09-11T04:10:00Z'
  };
  const validRungs = Array.from({ length: 8 }, (_, i) => ({
    rung: i + 1, disposition: 'DEPENDENCY_BLOCKED', evidence_or_blocker: `B${i + 1}`,
    independent_preparation_assessment: 'none remains', next_executable_condition: 'dependency changes'
  }));
  const healthyClaim = {
    lease_id: 'L1', lane: 'CORE', delegation_id: 'D1', objective_id: 'O1', control_ref: 'x',
    control_head_at_claim: 'a'.repeat(40), idempotency_key: 'K1',
    claimed_at: '2026-09-11T04:10:00Z', lease_expires_at: '2026-09-11T04:55:00Z',
    last_heartbeat_at: '2026-09-11T04:25:00Z', attempt: 1, checkpoint_pointer: 'checkpoint-1'
  };
  const validLedger = makeValidLedger(now);
  const duplicateIdLedger = JSON.parse(JSON.stringify(validLedger));
  duplicateIdLedger.events[3].event_id = 'E3';
  const outOfOrderLedger = JSON.parse(JSON.stringify(validLedger));
  outOfOrderLedger.events[3].occurred_at = '2026-09-11T04:03:00Z';
  const wrongLaneLedger = JSON.parse(JSON.stringify(validLedger));
  wrongLaneLedger.events[2].lane = 'BOOK';
  const idleLedger = JSON.parse(JSON.stringify(validLedger));
  idleLedger.events.push({ event_id: 'E5', occurred_at: '2026-09-11T04:25:00Z', event_type: 'IDLE_VALID', lane: 'CORE', control_ref: 'system-master/control-v2', control_head: 'a'.repeat(40), delegation_id: 'D1', objective_id: 'O1', evidence: 'idle' });
  const staleLedger = makeValidLedger(now);
  staleLedger.events = staleLedger.events.slice(0, 2);
  staleLedger.events[1].occurred_at = '2026-09-11T02:00:00Z';

  const cases = [
    ['valid_ready', validateOwner({ active_delegations: [baseDelegation], empty_is_valid: false }, 'CORE', now, true).length === 0],
    ['deep_ready_queue_allowed', validateOwner({ active_delegations: [baseDelegation, { ...baseDelegation, delegation_id: 'D2', objective_id: 'O2' }], empty_is_valid: false }, 'CORE', now, true).length === 0],
    ['false_empty_rejected', validateOwner({ active_delegations: [], empty_is_valid: true }, 'CORE', now, true).some((f) => f.type === 'FALSE_EMPTY')],
    ['valid_exhaustion', validExhaustion({ rungs: validRungs, independent_work_remaining: false })],
    ['stale_ready_rejected', validateOwner({ active_delegations: [{ ...baseDelegation, last_revalidated_at: '2026-09-11T02:00:00Z' }] }, 'CORE', now, true).some((f) => f.type === 'READY_UNDISPATCHED')],
    ['claimed_without_lease_rejected', validateOwner({ active_delegations: [{ ...baseDelegation, state: 'CLAIMED' }] }, 'CORE', now, true).some((f) => f.type === 'CLAIM_INVALID')],
    ['healthy_claim_suppresses_queued_ready_alarm', validateOwner({ active_delegations: [{ ...baseDelegation, state: 'CLAIMED', claim: healthyClaim }, { ...baseDelegation, delegation_id: 'D2', objective_id: 'O2', last_revalidated_at: '2026-09-11T02:00:00Z' }] }, 'CORE', now, true).every((f) => f.type !== 'READY_UNDISPATCHED')],
    ['overlapping_claims_rejected', validateOwner({ active_delegations: [{ ...baseDelegation, state: 'CLAIMED', claim: healthyClaim }, { ...baseDelegation, delegation_id: 'D2', objective_id: 'O2', state: 'CLAIMED', claim: { ...healthyClaim, lease_id: 'L2', delegation_id: 'D2', objective_id: 'O2', idempotency_key: 'K2' } }] }, 'CORE', now, true).some((f) => f.type === 'OVERLAPPING_MUTATION_CLAIMS')],
    ['valid_event_ledger', validateLedger(validLedger, 'CORE', '2026-09-11', now, true).length === 0],
    ['duplicate_event_id_rejected', validateLedger(duplicateIdLedger, 'CORE', '2026-09-11', now, true).some((f) => f.type === 'UTILIZATION_EVENT_ID_DUPLICATE')],
    ['out_of_order_event_rejected', validateLedger(outOfOrderLedger, 'CORE', '2026-09-11', now, true).some((f) => f.type === 'UTILIZATION_EVENT_OUT_OF_ORDER')],
    ['wrong_lane_event_rejected', validateLedger(wrongLaneLedger, 'CORE', '2026-09-11', now, true).some((f) => f.type === 'UTILIZATION_EVENT_LANE_MISMATCH')],
    ['idle_without_exhaustion_rejected', validateLedger(idleLedger, 'CORE', '2026-09-11', now, true).some((f) => f.type === 'UTILIZATION_IDLE_WITHOUT_EXHAUSTION')],
    ['stale_telemetry_rejected', validateLedger(staleLedger, 'CORE', '2026-09-11', now, true).some((f) => f.type === 'UTILIZATION_TELEMETRY_STALE')]
  ];
  let failed = 0;
  for (const [name, ok] of cases) {
    console.log(`${ok ? 'PASS' : 'FAIL'}:${name}`);
    if (!ok) failed += 1;
  }
  if (failed) process.exit(1);
  console.log('SECOND_SHIFT_ENFORCE_SELFTEST_PASS');
  process.exit(0);
}

if (selftest) runSelftest();

const now = new Date();
const ny = nyParts(now);
const inShift = ny.hour >= 0 && ny.hour < 7;
const registry = readJson('governance/second-shift/SECOND-SHIFT-REGISTRY-001.json');
const findings = [];

for (const required of [
  registry.schema,
  registry.execution_control || 'governance/second-shift/SECOND-SHIFT-EXECUTION-CONTROL-001.md',
  registry.utilization_event_schema || 'governance/second-shift/SECOND-SHIFT-UTILIZATION-EVENT-SCHEMA-001.json',
  registry.value_scorecard || 'governance/second-shift/SECOND-SHIFT-VALUE-SCORECARD-001.md',
  registry.value_measurement_schema || 'governance/second-shift/SECOND-SHIFT-VALUE-MEASUREMENT-SCHEMA-001.json'
]) {
  if (!required || !exists(required)) findings.push({ severity: 'ERROR', type: 'MISSING_CONTROL_ARTIFACT', message: `missing Second Shift control artifact: ${required || '<unset>'}` });
}

for (const lane of LANES) {
  const rel = registry.owner_files?.[lane];
  if (!rel || !exists(rel)) {
    findings.push({ severity: 'ERROR', type: 'MISSING_OWNER_FILE', lane, message: `owner delegation file missing: ${rel || '<unset>'}` });
    continue;
  }
  findings.push(...validateOwner(readJson(rel), lane, now, watchdog && inShift));

  if (watchdog && inShift && (ny.minute >= 28 || ny.hour > 0)) {
    const eventRel = `governance/second-shift/execution-events/${ny.date}/${lane}.json`;
    if (!exists(eventRel)) {
      findings.push({ severity: 'ERROR', type: 'UTILIZATION_LEDGER_MISSING', lane, message: `shift event ledger missing after first owner-worker cadence: ${eventRel}` });
    } else {
      try {
        findings.push(...validateLedger(readJson(eventRel), lane, ny.date, now, true));
      } catch (error) {
        findings.push({ severity: 'ERROR', type: 'UTILIZATION_LEDGER_PARSE_FAILURE', lane, message: `could not parse/validate shift event ledger: ${eventRel}`, detail: error.message });
      }
    }
  }
}

const errors = findings.filter((f) => f.severity === 'ERROR');
const report = {
  generated_at: now.toISOString(),
  new_york_time: ny,
  watchdog,
  in_shift_window: inShift,
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
