'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const sha = (v) => /^[0-9a-f]{40}$/i.test(String(v || ''));
const hash = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

function nyParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const o = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { date: `${o.year}-${o.month}-${o.day}`, hour: Number(o.hour), minute: Number(o.minute), second: Number(o.second) };
}

function shiftPhase(date = new Date()) {
  const p = nyParts(date);
  if (p.hour === 23 && p.minute >= 45) return 'PRE_SHIFT';
  if (p.hour >= 0 && p.hour <= 5) return 'OPEN';
  if (p.hour === 6 && p.minute < 45) return 'OPEN';
  if (p.hour === 6 && p.minute >= 45) return 'FINAL_REFILL';
  if (p.hour === 7 && p.minute === 0) return 'HANDOFF';
  return 'CLOSED';
}

const rungDispositions = new Set(['COMPLETE', 'DUPLICATE', 'DEPENDENCY_BLOCKED', 'HUMAN_AUTHOR_PRIVATE_NATIVE_EXTERNAL_BLOCKED', 'UNSAFE_WITHOUT_DECISION']);
function validExhaustion(record) {
  if (!record || !Array.isArray(record.rungs) || record.rungs.length !== 8 || record.independent_work_remaining !== false) return false;
  return record.rungs.every((r, i) => r && Number(r.rung) === i + 1 && rungDispositions.has(r.disposition) && r.evidence_or_blocker && r.independent_preparation_assessment && r.next_executable_condition);
}

function activeClaimHealthy(d, now) {
  const claim = d && d.claim;
  if (!claim || !claim.lease_expires_at || !claim.last_heartbeat_at) return false;
  const exp = new Date(claim.lease_expires_at);
  const hb = new Date(claim.last_heartbeat_at);
  if (Number.isNaN(exp.getTime()) || Number.isNaN(hb.getTime())) return false;
  return exp > now && (now.getTime() - hb.getTime()) <= 45 * 60000;
}

function sortReady(items) {
  return [...items].sort((a, b) => {
    const pa = Number.isFinite(Number(a.priority)) ? Number(a.priority) : 0;
    const pb = Number.isFinite(Number(b.priority)) ? Number(b.priority) : 0;
    if (pa !== pb) return pb - pa;
    const ta = Date.parse(a.last_revalidated_at || a.created_at || 0) || 0;
    const tb = Date.parse(b.last_revalidated_at || b.created_at || 0) || 0;
    if (ta !== tb) return ta - tb;
    return String(a.delegation_id || '').localeCompare(String(b.delegation_id || ''));
  });
}

function lanePlan(lane, owner, phase, now, currentAuthority) {
  const active = Array.isArray(owner.active_delegations) ? owner.active_delegations.filter(Boolean) : [];
  const claimed = active.filter((d) => d.state === 'CLAIMED');
  const ready = sortReady(active.filter((d) => d.state === 'READY'));
  const candidates = sortReady(active.filter((d) => d.state === 'CANDIDATE'));
  const base = {
    lane,
    owner_path: owner.owner_path,
    control_ref: owner.control_ref,
    recorded_control_head: owner.last_known_control_head,
    phase,
    active_count: active.length,
    claimed_count: claimed.length,
    ready_count: ready.length,
    candidate_count: candidates.length
  };

  if (!owner.owner_path || !owner.control_ref || !sha(owner.last_known_control_head)) {
    return { ...base, action: 'RECONCILE_REQUIRED', reason: 'INVALID_OWNER_CONTROL_BINDING' };
  }
  if (claimed.length > 1) return { ...base, action: 'BLOCKED', reason: 'OVERLAPPING_MUTATION_CLAIMS' };
  if (claimed.length === 1) {
    const d = claimed[0];
    if (activeClaimHealthy(d, now)) return { ...base, action: 'OBSERVE_RUNNING', delegation_id: d.delegation_id, objective_id: d.objective_id, reason: 'HEALTHY_CLAIM' };
    return { ...base, action: 'RECONCILE_REQUIRED', delegation_id: d.delegation_id, objective_id: d.objective_id, reason: 'STALE_CLAIM' };
  }
  if (phase === 'CLOSED' || phase === 'HANDOFF') return { ...base, action: 'NO_NEW_DISPATCH', reason: phase };
  if (ready.length) {
    const d = ready[0];
    const operationId = `second-shift:${nyParts(now).date}:${lane}:${d.delegation_id}:${d.valid_for_control_head || owner.last_known_control_head}`;
    return {
      ...base,
      action: phase === 'PRE_SHIFT' ? 'QUEUE_READY' : 'DISPATCH_READY',
      delegation_id: d.delegation_id,
      objective_id: d.objective_id,
      obligation_id: d.obligation_id || null,
      valid_for_control_ref: d.valid_for_control_ref,
      valid_for_control_head: d.valid_for_control_head,
      operation_id: operationId,
      idempotency_key: hash(operationId),
      continuation_required: true,
      central_objective_match: d.objective_id === currentAuthority.central_next_objective
    };
  }
  if (candidates.length) {
    const d = candidates[0];
    return { ...base, action: 'REVALIDATE_CANDIDATE', delegation_id: d.delegation_id, objective_id: d.objective_id, reason: 'NO_READY_DELEGATION' };
  }
  if (owner.empty_is_valid === true && validExhaustion(owner.all_rungs_exhausted)) {
    return { ...base, action: 'IDLE_VALID', reason: 'ALL_EIGHT_RUNGS_EXHAUSTED' };
  }
  return { ...base, action: 'RECONCILE_REQUIRED', reason: 'NO_READY_WORK_AND_NO_VALID_EXHAUSTION' };
}

function buildPlan(now = new Date()) {
  const authority = readJson('governance/CURRENT-AUTHORITY.json');
  const registryPath = authority.second_shift_registry || 'governance/second-shift/SECOND-SHIFT-REGISTRY-001.json';
  const registry = readJson(registryPath);
  const phase = shiftPhase(now);
  const lanes = [];
  for (const [lane, rel] of Object.entries(registry.owner_files || {})) {
    if (!exists(rel)) {
      lanes.push({ lane, action: 'BLOCKED', reason: 'OWNER_FILE_MISSING', owner_file: rel });
      continue;
    }
    const owner = readJson(rel);
    lanes.push({ owner_file: rel, ...lanePlan(lane, owner, phase, now, authority) });
  }
  const summary = {
    dispatch_ready: lanes.filter((x) => x.action === 'DISPATCH_READY').length,
    queue_ready: lanes.filter((x) => x.action === 'QUEUE_READY').length,
    running: lanes.filter((x) => x.action === 'OBSERVE_RUNNING').length,
    reconcile_required: lanes.filter((x) => x.action === 'RECONCILE_REQUIRED').length,
    blocked: lanes.filter((x) => x.action === 'BLOCKED').length,
    idle_valid: lanes.filter((x) => x.action === 'IDLE_VALID').length
  };
  return {
    plan_id: `SECOND-SHIFT-PLAN-${nyParts(now).date}-${hash(now.toISOString()).slice(0, 12)}`,
    generated_at: now.toISOString(),
    timezone: 'America/New_York',
    shift_phase: phase,
    central_objective: authority.central_next_objective,
    registry: registryPath,
    active_lane_count: Object.keys(registry.owner_files || {}).length,
    lanes,
    summary
  };
}

function expect(cond, message) { if (!cond) throw new Error(message); }
function selftest() {
  const head = 'a'.repeat(40);
  const baseOwner = {
    owner_path: 'SYSTEM_MASTER/TEST', control_ref: 'test/control-v1', last_known_control_head: head,
    active_delegations: [{ delegation_id: 'D1', objective_id: 'OBJ', state: 'READY', valid_for_control_ref: 'test/control-v1', valid_for_control_head: head, created_at: '2026-09-10T20:00:00Z' }],
    empty_is_valid: false
  };
  const authority = { central_next_objective: 'OBJ' };
  const open = new Date('2026-09-11T04:30:00Z');
  const plan = lanePlan('TEST', baseOwner, 'OPEN', open, authority);
  expect(plan.action === 'DISPATCH_READY', 'READY_NOT_DISPATCHED');
  expect(plan.continuation_required === true, 'CONTINUATION_NOT_REQUIRED');

  const claimed = JSON.parse(JSON.stringify(baseOwner));
  claimed.active_delegations[0].state = 'CLAIMED';
  claimed.active_delegations[0].claim = { lease_expires_at: '2026-09-11T05:00:00Z', last_heartbeat_at: '2026-09-11T04:20:00Z' };
  expect(lanePlan('TEST', claimed, 'OPEN', open, authority).action === 'OBSERVE_RUNNING', 'HEALTHY_CLAIM_NOT_PRESERVED');
  claimed.active_delegations[0].claim.lease_expires_at = '2026-09-11T04:00:00Z';
  expect(lanePlan('TEST', claimed, 'OPEN', open, authority).reason === 'STALE_CLAIM', 'STALE_CLAIM_NOT_RECONCILED');

  const empty = { ...baseOwner, active_delegations: [], empty_is_valid: false };
  expect(lanePlan('TEST', empty, 'OPEN', open, authority).action === 'RECONCILE_REQUIRED', 'FALSE_IDLE_ACCEPTED');
  expect(lanePlan('TEST', baseOwner, 'CLOSED', open, authority).action === 'NO_NEW_DISPATCH', 'CLOSED_SHIFT_DISPATCHED');

  expect(shiftPhase(new Date('2026-09-11T03:50:00Z')) === 'PRE_SHIFT', 'PRE_SHIFT_WINDOW');
  expect(shiftPhase(new Date('2026-09-11T04:10:00Z')) === 'OPEN', 'OPEN_WINDOW');
  expect(shiftPhase(new Date('2026-09-11T10:50:00Z')) === 'FINAL_REFILL', 'FINAL_REFILL_WINDOW');
  expect(shiftPhase(new Date('2026-09-11T11:00:00Z')) === 'HANDOFF', 'HANDOFF_WINDOW');

  console.log(JSON.stringify({ status: 'PASS', tests: {
    ready_dispatch: true, continuation_required: true, healthy_claim_preserved: true,
    stale_claim_reconciled: true, false_idle_rejected: true, closed_shift_no_dispatch: true,
    pre_shift_window: true, open_window: true, final_refill_window: true, handoff_window: true
  }}, null, 2));
}

if (require.main === module) {
  const mode = process.argv[2] || 'plan';
  if (mode === 'selftest') selftest();
  else if (mode === 'plan') {
    const now = process.env.SECOND_SHIFT_NOW ? new Date(process.env.SECOND_SHIFT_NOW) : new Date();
    const plan = buildPlan(now);
    const text = JSON.stringify(plan, null, 2);
    if (process.env.SECOND_SHIFT_PLAN_PATH) fs.writeFileSync(process.env.SECOND_SHIFT_PLAN_PATH, `${text}\n`);
    console.log(text);
  } else throw new Error(`UNKNOWN_MODE:${mode}`);
}

module.exports = { buildPlan, lanePlan, shiftPhase, validExhaustion };
