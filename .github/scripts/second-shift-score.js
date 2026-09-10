'use strict';

const fs = require('fs');
const path = require('path');
const { validateLedger } = require('./second-shift-event-ledger');

const root = path.resolve(__dirname, '..', '..');
const LANES = ['CORE', 'LEARNING', 'BOOK', 'PROSE'];
const dateArg = process.argv.find((v) => v.startsWith('--date='));
const outArg = process.argv.find((v) => v.startsWith('--out='));
const selftest = process.argv.includes('--selftest');
const outPath = outArg ? path.resolve(root, outArg.slice('--out='.length)) : null;

function nyDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const o = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${o.year}-${o.month}-${o.day}`;
}
function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function median(values) {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function percentile(values, p) {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  const pos = (a.length - 1) * p;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (pos - lo);
}
function round(n, d = 2) { return Number.isFinite(n) ? Number(n.toFixed(d)) : n; }
function minutes(a, b) { return (new Date(b).getTime() - new Date(a).getTime()) / 60000; }
function calibrationKey(unit) { return `${unit.work_class}|${unit.complexity_band}`; }

function analyzeLane(ledger, shiftDate, now) {
  const validation = validateLedger(ledger, ledger.lane, shiftDate, now, false);
  const errors = validation.filter((x) => x.severity === 'ERROR');
  const completed = ledger.events.filter((e) => e.event_type === 'COMPLETED' && e.value_work_unit).map((e) => ({ event: e, unit: e.value_work_unit }));
  const terminal = ledger.events.filter((e) => ['COMPLETED','BLOCKED','STALE'].includes(e.event_type));
  const successors = ledger.events.filter((e) => e.event_type === 'SUCCESSOR_BOUND');
  const readyLatencies = [];
  const blockedLatencies = [];
  let readyUndispatched = 0;
  let telemetryUnknown = 0;
  let staleClaims = 0;
  const staleRecovery = [];

  for (let i = 0; i < ledger.events.length; i += 1) {
    const e = ledger.events[i];
    const next = ledger.events[i + 1];
    if (next) {
      const gap = minutes(e.occurred_at, next.occurred_at);
      if (gap > 70) telemetryUnknown += gap - 70;
    }
    if (e.event_type === 'READY') {
      const claim = ledger.events.slice(i + 1).find((x) => x.event_type === 'CLAIMED' && x.delegation_id === e.delegation_id);
      if (claim) {
        const latency = minutes(e.occurred_at, claim.occurred_at);
        readyLatencies.push(latency);
        readyUndispatched += Math.max(0, latency - 70);
      }
    }
    if (e.event_type === 'BLOCKED') {
      const successor = ledger.events.slice(i + 1).find((x) => x.event_type === 'SUCCESSOR_BOUND');
      if (successor) blockedLatencies.push(minutes(e.occurred_at, successor.occurred_at));
    }
    if (e.event_type === 'STALE') {
      staleClaims += 1;
      const recovery = ledger.events.slice(i + 1).find((x) => ['SUCCESSOR_BOUND','CLAIMED','READY'].includes(x.event_type));
      if (recovery) staleRecovery.push(minutes(e.occurred_at, recovery.occurred_at));
    }
  }

  const autoSuccessors = successors.filter((e) => e.autonomous_transition === true);
  const turnsAvoided = successors.filter((e) => e.autonomous_transition === true && e.manual_turn_would_be_required === true).length;
  let continuedWithinCadence = 0;
  for (const t of terminal) {
    const s = successors.find((x) => new Date(x.occurred_at) >= new Date(t.occurred_at));
    if (s && minutes(t.occurred_at, s.occurred_at) <= 70) continuedWithinCadence += 1;
  }
  const hasExhaustion = ledger.events.some((e) => e.event_type === 'ALL_RUNGS_EXHAUSTED');
  const hasIdle = ledger.events.some((e) => e.event_type === 'IDLE_VALID');
  const retries = ledger.events.filter((e) => e.event_type === 'RETRY');
  const circuits = ledger.events.filter((e) => e.event_type === 'CIRCUIT_OPEN');
  let circuitFallbackSuccess = 0;
  for (const c of circuits) {
    if (ledger.events.some((e) => new Date(e.occurred_at) > new Date(c.occurred_at) && ['SUCCESSOR_BOUND','PROGRESS','COMPLETED'].includes(e.event_type))) circuitFallbackSuccess += 1;
  }

  const candidateVpu = completed.reduce((s, x) => s + Number(x.unit.vpu || 0), 0);
  const acceptedVpu = completed.reduce((s, x) => s + Number(x.unit.accepted_vpu || 0), 0);
  const reworkVpu = completed.filter((x) => ['REWORK_REQUIRED','INVALIDATED'].includes(x.unit.rework_status)).reduce((s, x) => s + Number(x.unit.vpu || 0), 0);

  return {
    lane: ledger.lane,
    errors,
    candidate_vpu: round(candidateVpu),
    accepted_vpu: round(acceptedVpu),
    completed_work_units: completed.map((x) => x.unit),
    terminal_work_events: terminal.length,
    autonomous_continuations: autoSuccessors.length,
    minimum_interactive_turns_avoided: turnsAvoided,
    continued_within_cadence: continuedWithinCadence,
    eligible_for_outcome_denominator: !(hasExhaustion && acceptedVpu === 0),
    evidence_acceptance_yield: candidateVpu > 0 ? round(acceptedVpu / candidateVpu, 4) : 1,
    rework_vpu: round(reworkVpu),
    rework_instability_rate: candidateVpu > 0 ? round(reworkVpu / candidateVpu, 4) : 0,
    flow: {
      ready_to_claim_median_minutes: round(median(readyLatencies)),
      ready_to_claim_max_minutes: readyLatencies.length ? round(Math.max(...readyLatencies)) : null,
      ready_undispatched_minutes: round(readyUndispatched),
      unjustified_idle_minutes: hasIdle && !hasExhaustion ? 'UNKNOWN_INVALID_IDLE' : 0,
      stale_claim_count: staleClaims,
      stale_claim_recovery_median_minutes: round(median(staleRecovery)),
      blocked_to_successor_median_minutes: round(median(blockedLatencies)),
      retry_attempt_count: retries.length,
      retry_waste_count: retries.filter((e) => Number(e.attempt) > 1).length,
      circuit_open_count: circuits.length,
      circuit_fallback_success_count: circuitFallbackSuccess,
      telemetry_unknown_minutes: round(telemetryUnknown)
    }
  };
}

function calibrationFor(samples, unit) {
  const matching = samples.filter((s) => s.work_class === unit.work_class && s.complexity_band === unit.complexity_band && Number(s.verified_progress_units) > 0);
  if (matching.length < 5) return { calibrated: false, count: matching.length };
  const turns = matching.map((s) => Number(s.user_execution_turns) / Number(s.verified_progress_units)).filter(Number.isFinite);
  const elapsed = matching.filter((s) => Number.isFinite(Number(s.elapsed_chat_minutes))).map((s) => Number(s.elapsed_chat_minutes) / Number(s.verified_progress_units));
  const active = matching.filter((s) => Number.isFinite(Number(s.active_user_minutes))).map((s) => Number(s.active_user_minutes) / Number(s.verified_progress_units));
  return {
    calibrated: true,
    count: matching.length,
    turns_per_vpu_median: median(turns),
    turns_per_vpu_iqr: turns.length ? [percentile(turns, .25), percentile(turns, .75)] : null,
    elapsed_minutes_per_vpu_median: elapsed.length >= 5 ? median(elapsed) : null,
    elapsed_minutes_per_vpu_iqr: elapsed.length >= 5 ? [percentile(elapsed, .25), percentile(elapsed, .75)] : null,
    active_minutes_per_vpu_median: active.length >= 5 ? median(active) : null
  };
}

function scoreShift(shiftDate, now = new Date()) {
  const laneResults = [];
  const missingLanes = [];
  for (const lane of LANES) {
    const rel = `governance/second-shift/execution-events/${shiftDate}/${lane}.json`;
    if (!exists(rel)) { missingLanes.push(lane); continue; }
    laneResults.push(analyzeLane(readJson(rel), shiftDate, now));
  }

  const candidate = laneResults.reduce((s, l) => s + l.candidate_vpu, 0);
  const accepted = laneResults.reduce((s, l) => s + l.accepted_vpu, 0);
  const eay = candidate > 0 ? accepted / candidate : 1;
  const workUnits = laneResults.flatMap((l) => l.completed_work_units);
  const terminals = laneResults.reduce((s, l) => s + l.terminal_work_events, 0);
  const ac = laneResults.reduce((s, l) => s + l.autonomous_continuations, 0);
  const mita = laneResults.reduce((s, l) => s + l.minimum_interactive_turns_avoided, 0);
  const withinCadence = laneResults.reduce((s, l) => s + l.continued_within_cadence, 0);
  const eligible = laneResults.filter((l) => l.eligible_for_outcome_denominator);
  const outcome = eligible.length ? 35 * eligible.reduce((s, l) => s + Math.min(l.accepted_vpu, 1), 0) / eligible.length : 0;
  const evidence = 20 * Math.max(0, Math.min(1, eay));
  const autoRatio = terminals ? Math.min(1, ac / terminals) : 1;
  const cadenceRatio = terminals ? Math.min(1, withinCadence / terminals) : 1;
  const leverage = 10 * autoRatio + 5 * cadenceRatio;

  const flowTotals = laneResults.reduce((o, l) => {
    o.ready += Number(l.flow.ready_undispatched_minutes || 0);
    o.stale += Number(l.flow.stale_claim_count || 0);
    o.retryWaste += Number(l.flow.retry_waste_count || 0);
    o.unknown += Number(l.flow.telemetry_unknown_minutes || 0);
    return o;
  }, { ready: 0, stale: 0, retryWaste: 0, unknown: 0 });
  const flowDeduction = Math.min(5, flowTotals.ready / 15) + Math.min(4, flowTotals.stale * 2) + Math.min(3, flowTotals.unknown / 30) + Math.min(3, flowTotals.retryWaste * 0.5);
  const flowScore = Math.max(0, 15 - flowDeduction);
  const reworkVpu = laneResults.reduce((s, l) => s + l.rework_vpu, 0);
  const rir = candidate > 0 ? reworkVpu / candidate : 0;
  const stability = 15 * (1 - Math.max(0, Math.min(1, rir)));
  const validationErrors = laneResults.flatMap((l) => l.errors);

  const baselineRel = 'governance/second-shift/calibration/DAYTIME-BASELINE-001.json';
  const samples = exists(baselineRel) ? (readJson(baselineRel).samples || []) : [];
  let dte = 0, ccetaMinutes = 0, activeMinutes = 0;
  let dteCalibrated = true, ccetaCalibrated = true, activeCalibrated = true;
  const calibration = {};
  for (const unit of workUnits.filter((u) => Number(u.accepted_vpu) > 0)) {
    const key = calibrationKey(unit);
    const c = calibration[key] || calibrationFor(samples, unit);
    calibration[key] = c;
    if (!c.calibrated) { dteCalibrated = false; ccetaCalibrated = false; activeCalibrated = false; continue; }
    dte += c.turns_per_vpu_median * Number(unit.accepted_vpu);
    if (c.elapsed_minutes_per_vpu_median == null) ccetaCalibrated = false;
    else ccetaMinutes += c.elapsed_minutes_per_vpu_median * Number(unit.accepted_vpu);
    if (c.active_minutes_per_vpu_median == null) activeCalibrated = false;
    else activeMinutes += c.active_minutes_per_vpu_median * Number(unit.accepted_vpu);
  }
  if (!workUnits.some((u) => Number(u.accepted_vpu) > 0)) { dteCalibrated = false; ccetaCalibrated = false; activeCalibrated = false; }

  const telemetryUnknown = flowTotals.unknown;
  let confidence = 'HIGH';
  if (missingLanes.length || validationErrors.length) confidence = 'UNSCORABLE';
  else if (telemetryUnknown > 336) confidence = 'LOW';
  else if (telemetryUnknown > 84 || !dteCalibrated) confidence = 'MEDIUM';
  const preliminary = outcome + evidence + leverage + flowScore + stability;
  const ssvi = confidence === 'UNSCORABLE' ? 'UNSCORABLE' : round(Math.max(0, Math.min(100, preliminary)), 1);
  const pendingRework = workUnits.some((u) => u.rework_status === 'PENDING_OBSERVATION');

  return {
    schema_id: 'SECOND-SHIFT-VALUE-MEASUREMENT-SCHEMA-001',
    shift_id: `SECOND-SHIFT-${shiftDate}`,
    shift_date: shiftDate,
    score_status: pendingRework ? 'PROVISIONAL_PENDING_REWORK_OBSERVATION' : 'FINAL_IF_NO_LATER_REWORK',
    measurement_confidence: confidence,
    missing_lanes: missingLanes,
    validation_error_count: validationErrors.length,
    validation_errors: validationErrors,
    accepted_vpu_total: round(accepted),
    delivered_candidate_vpu_total: round(candidate),
    evidence_acceptance_yield: round(eay, 4),
    autonomous_continuations: ac,
    minimum_interactive_turns_avoided: mita,
    daytime_turn_equivalent: dteCalibrated ? round(dte, 1) : 'UNCALIBRATED',
    counterfactual_chat_elapsed_hours: ccetaCalibrated ? round(ccetaMinutes / 60, 2) : 'UNCALIBRATED',
    human_attention_saved_minutes: activeCalibrated ? round(activeMinutes, 1) : 'UNKNOWN',
    calibration,
    rework_instability_rate: round(rir, 4),
    flow_health: { ...flowTotals, lanes: laneResults.map((l) => ({ lane: l.lane, ...l.flow })) },
    ssvi_components: {
      outcome_advancement: round(outcome, 1),
      evidence_acceptance_quality: round(evidence, 1),
      autonomous_leverage: round(leverage, 1),
      flow_reliability: round(flowScore, 1),
      stability_rework: round(stability, 1)
    },
    ssvi,
    lanes: laneResults,
    interpretation: {
      time_saved_rule: 'MITA is the current hard lower bound. DTE/CCETA remain UNCALIBRATED until at least five observed comparable daytime samples exist for each used work-class/complexity band.',
      activity_rule: 'Runner uptime, workflow minutes, commits, tokens, files and artifact counts do not earn value credit.',
      rework_rule: 'The morning score is provisional while completed work units remain PENDING_OBSERVATION; later defect rework must reduce the finalized stability score.'
    }
  };
}

function runSelftest() {
  const samples = [1, 2, 3, 4, 100];
  const checks = [
    ['median', median(samples) === 3],
    ['p25', percentile([1,2,3,4,5], .25) === 2],
    ['round', round(1.234, 2) === 1.23]
  ];
  let failed = 0;
  for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}:${name}`); if (!ok) failed += 1; }
  if (failed) process.exit(1);
  console.log('SECOND_SHIFT_SCORE_SELFTEST_PASS');
  process.exit(0);
}

if (selftest) runSelftest();
const shiftDate = dateArg ? dateArg.slice('--date='.length) : nyDate();
const result = scoreShift(shiftDate);
console.log(JSON.stringify(result, null, 2));
if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
}
if (result.measurement_confidence === 'UNSCORABLE') process.exitCode = 1;
