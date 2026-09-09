'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const POLICY_PATH = path.join(ROOT, 'qualification', 'a01', 'a01-policy.json');
const REGISTRY_PATH = path.join(ROOT, 'qualification', 'a01', 'registry.json');
const REQUEST_DIR = path.join(ROOT, 'qualification', 'a01', 'overnight', 'requests');

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function pad(n) { return String(n).padStart(2, '0'); }
function localDateString(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addLocalDays(dateText, days) {
  const [y, m, d] = dateText.split('-').map(Number);
  const x = new Date(y, m - 1, d + days, 12, 0, 0, 0);
  return localDateString(x);
}
function localDateTime(dateText, hhmm) {
  const [y, m, d] = dateText.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}
function targetNightDate(now, endLocal) {
  const today = localDateString(now);
  const [endH, endM] = endLocal.split(':').map(Number);
  const beforeEnd = now.getHours() < endH || (now.getHours() === endH && now.getMinutes() < endM);
  return beforeEnd ? today : addLocalDays(today, 1);
}
function safeInt(v) { return Number.isInteger(v) ? v : NaN; }
function validTime(v) { return typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v); }
function validSha(v) { return typeof v === 'string' && /^[0-9a-fA-F]{40}$/.test(v); }
function requiredString(v) { return typeof v === 'string' && v.trim().length > 0; }
function minDate(...values) { return new Date(Math.min(...values.map(v => v.getTime()))); }
function loadTickets(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(n => n.endsWith('.json')).sort().map(name => {
    const file = path.join(dir, name);
    try { return { file: name, ticket: readJson(file), parse_error: null }; }
    catch (e) { return { file: name, ticket: null, parse_error: e.message }; }
  });
}

function validateTicket(raw, file, nightDate, policy, registry) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { ok: false, file, errors: ['INVALID_JSON_OBJECT'] };
  const required = ['ticket_id','state','night_date','submitted_at','workstream_id','qualification_id','subject_sha','origin_ref','estimated_minutes','max_runtime_minutes','priority','earliest_start_local','latest_start_local','window_end_local','exclusive_window','resume_on_pass','resume_on_failure','notification_target'];
  for (const key of required) if (raw[key] === undefined || raw[key] === null || raw[key] === '') errors.push(`MISSING:${key}`);
  if (raw.ticket_version !== 1) errors.push('TICKET_VERSION');
  if (!['READY','HOLD','SUPERSEDED'].includes(raw.state)) errors.push('STATE');
  if (raw.night_date !== nightDate) errors.push('NIGHT_DATE_MISMATCH');
  if (!validSha(raw.subject_sha)) errors.push('SUBJECT_SHA');
  if (!validTime(raw.earliest_start_local) || !validTime(raw.latest_start_local) || !validTime(raw.window_end_local)) errors.push('TIME_FORMAT');
  if (!requiredString(raw.ticket_id) || !requiredString(raw.workstream_id) || !requiredString(raw.qualification_id) || !requiredString(raw.origin_ref)) errors.push('IDENTITY');
  if (!requiredString(raw.resume_on_pass) || !requiredString(raw.resume_on_failure) || !requiredString(raw.notification_target)) errors.push('RETURN_TICKET');
  if (raw.depends_on_ticket_id !== undefined && raw.depends_on_ticket_id !== null && !requiredString(raw.depends_on_ticket_id)) errors.push('DEPENDENCY_ID');

  const secondShift = policy.overnight && policy.overnight.second_shift;
  if (raw.state === 'READY' && secondShift && secondShift.enabled === true) {
    if (!Array.isArray(secondShift.lanes) || !secondShift.lanes.includes(raw.overnight_lane)) errors.push('SECOND_SHIFT_LANE');
    if (secondShift.require_completion_delta_for_ready === true) {
      const d = raw.completion_delta;
      if (!d || typeof d !== 'object' || !requiredString(d.before) || !requiredString(d.evidence) || !requiredString(d.after_pass) || !requiredString(d.unlocks)) errors.push('COMPLETION_DELTA_REQUIRED');
    }
    if (secondShift.require_stop_condition_for_ready === true && !requiredString(raw.stop_condition)) errors.push('STOP_CONDITION_REQUIRED');
  }

  const est = safeInt(raw.estimated_minutes); const max = safeInt(raw.max_runtime_minutes); const pri = safeInt(raw.priority);
  if (!(est >= 1 && est <= policy.overnight.max_ticket_runtime_minutes)) errors.push('ESTIMATED_MINUTES');
  if (!(max >= 1 && max <= policy.overnight.max_ticket_runtime_minutes && max >= est)) errors.push('MAX_RUNTIME_MINUTES');
  if (!(pri >= 1 && pri <= 100)) errors.push('PRIORITY');
  const entry = registry.qualifications[raw.qualification_id];
  if (!entry) errors.push('UNREGISTERED_QUALIFICATION');
  else {
    if (entry.workstream_id !== raw.workstream_id) errors.push('WORKSTREAM_MISMATCH');
    if (entry.overnight_eligible !== true) errors.push('NOT_OVERNIGHT_ELIGIBLE');
    if (!Number.isInteger(entry.overnight_max_runtime_minutes) || max > entry.overnight_max_runtime_minutes) errors.push('REGISTRY_RUNTIME_CAP');
    if ((entry.allowed_post_actions || []).length) errors.push('DISRUPTIVE_POST_ACTION_NOT_ALLOWED_OVERNIGHT');
    if (max > policy.overnight.checkpoint_required_above_minutes) {
      if (entry.checkpoint_capable !== true) errors.push('CHECKPOINT_CAPABILITY_REQUIRED');
      if (!Number.isInteger(raw.checkpoint_interval_minutes) || raw.checkpoint_interval_minutes < 1 || raw.checkpoint_interval_minutes > policy.overnight.max_checkpoint_interval_minutes) errors.push('CHECKPOINT_INTERVAL_REQUIRED');
    }
  }
  let earliest = null, latest = null, end = null;
  if (validTime(raw.earliest_start_local) && validTime(raw.latest_start_local) && validTime(raw.window_end_local)) {
    earliest = localDateTime(nightDate, raw.earliest_start_local);
    latest = localDateTime(nightDate, raw.latest_start_local);
    end = localDateTime(nightDate, raw.window_end_local);
    if (!(earliest <= latest && latest < end)) errors.push('INVALID_ADMISSION_WINDOW');
  }
  return { ok: errors.length === 0, file, errors, raw, entry, earliest, latest, end, max_minutes: max, estimated_minutes: est, priority: pri };
}

function chooseCandidate(candidates, cursor, boundary, allocated, bufferMs) {
  const fit = candidates.filter(c => {
    const start = new Date(Math.max(cursor.getTime(), c.earliest.getTime()));
    const finish = new Date(start.getTime() + c.max_minutes * 60000);
    return start <= c.latest && finish <= c.end && finish.getTime() + bufferMs <= boundary.getTime();
  });
  fit.sort((a,b) => {
    const aa = allocated.get(a.raw.workstream_id) || 0;
    const bb = allocated.get(b.raw.workstream_id) || 0;
    if (aa !== bb) return aa - bb;
    if (a.priority !== b.priority) return b.priority - a.priority;
    const ac = Number.isInteger(a.raw.critical_path_rank) ? a.raw.critical_path_rank : 99;
    const bc = Number.isInteger(b.raw.critical_path_rank) ? b.raw.critical_path_rank : 99;
    if (ac !== bc) return ac - bc;
    const as = Date.parse(a.raw.submitted_at) || 0; const bs = Date.parse(b.raw.submitted_at) || 0;
    if (as !== bs) return as - bs;
    return a.max_minutes - b.max_minutes;
  });
  return fit[0] || null;
}

function dependencyValidate(valid, policy, rejected) {
  const invalid = new Set();
  const byId = new Map();
  for (const v of valid) {
    if (byId.has(v.raw.ticket_id)) {
      invalid.add(v); invalid.add(byId.get(v.raw.ticket_id));
    } else byId.set(v.raw.ticket_id, v);
  }
  for (const v of invalid) rejected.push({ file: v.file, ticket_id: v.raw.ticket_id, reasons: ['DUPLICATE_TICKET_ID'] });

  const perWorkstream = new Map();
  for (const v of valid) {
    if (invalid.has(v)) continue;
    const list = perWorkstream.get(v.raw.workstream_id) || [];
    list.push(v); perWorkstream.set(v.raw.workstream_id, list);
  }
  const cap = policy.overnight.max_ready_tickets_per_workstream_per_night || policy.admission.max_outstanding_per_workstream || 1;
  for (const [workstream, list] of perWorkstream.entries()) {
    if (list.length > cap) {
      for (const v of list) {
        invalid.add(v);
        rejected.push({ file: v.file, ticket_id: v.raw.ticket_id, reasons: [`READY_TICKET_CAP_EXCEEDED:${workstream}:${cap}`] });
      }
    }
  }

  const activeById = new Map(valid.filter(v => !invalid.has(v)).map(v => [v.raw.ticket_id, v]));
  const children = new Map();
  for (const v of valid) {
    if (invalid.has(v)) continue;
    const depId = v.raw.depends_on_ticket_id;
    if (!depId) continue;
    const dep = activeById.get(depId);
    const reasons = [];
    if (depId === v.raw.ticket_id) reasons.push('SELF_DEPENDENCY');
    if (!dep) reasons.push('DEPENDENCY_NOT_READY');
    if (dep && policy.overnight.dependency_chains.same_workstream_only === true && dep.raw.workstream_id !== v.raw.workstream_id) reasons.push('CROSS_WORKSTREAM_DEPENDENCY_NOT_SUPPORTED');
    if (v.raw.exclusive_window === true) reasons.push('DEPENDENT_EXCLUSIVE_WINDOW_NOT_SUPPORTED');
    if (reasons.length) {
      invalid.add(v);
      rejected.push({ file: v.file, ticket_id: v.raw.ticket_id, reasons });
      continue;
    }
    const list = children.get(depId) || [];
    list.push(v); children.set(depId, list);
  }

  for (const [parentId, list] of children.entries()) {
    const live = list.filter(v => !invalid.has(v));
    if (live.length > 1) {
      for (const v of live) {
        invalid.add(v);
        rejected.push({ file: v.file, ticket_id: v.raw.ticket_id, reasons: [`MULTIPLE_PASS_DEPENDENTS_UNSUPPORTED:${parentId}`] });
      }
    }
  }

  const liveById = new Map(valid.filter(v => !invalid.has(v)).map(v => [v.raw.ticket_id, v]));
  const maxChain = policy.overnight.dependency_chains.max_chain_length || 4;
  for (const v of liveById.values()) {
    const seen = new Set();
    let current = v;
    let length = 1;
    while (current.raw.depends_on_ticket_id) {
      if (seen.has(current.raw.ticket_id)) {
        invalid.add(v);
        rejected.push({ file: v.file, ticket_id: v.raw.ticket_id, reasons: ['DEPENDENCY_CYCLE'] });
        break;
      }
      seen.add(current.raw.ticket_id);
      const parent = liveById.get(current.raw.depends_on_ticket_id);
      if (!parent) break;
      current = parent;
      length += 1;
      if (length > maxChain) {
        invalid.add(v);
        rejected.push({ file: v.file, ticket_id: v.raw.ticket_id, reasons: [`DEPENDENCY_CHAIN_TOO_LONG:${maxChain}`] });
        break;
      }
    }
  }

  const clean = valid.filter(v => !invalid.has(v));
  const cleanById = new Map(clean.map(v => [v.raw.ticket_id, v]));
  const childByParent = new Map();
  for (const v of clean) {
    const depId = v.raw.depends_on_ticket_id;
    if (depId && cleanById.has(depId)) childByParent.set(depId, v);
  }
  return { valid: clean, childByParent };
}

function buildPlan({ now = new Date(), policy, registry, ticketRecords, nightDate }) {
  process.env.TZ = policy.overnight.timezone;
  const target = nightDate || targetNightDate(now, policy.overnight.window_end_local);
  const globalStart = localDateTime(target, policy.overnight.window_start_local);
  const globalEnd = localDateTime(target, policy.overnight.window_end_local);
  const bufferMs = policy.overnight.transition_buffer_minutes * 60000;
  const rejected = [];
  let valid = [];
  for (const record of ticketRecords) {
    if (record.parse_error) { rejected.push({ file: record.file, reasons: [`JSON_PARSE:${record.parse_error}`] }); continue; }
    if (record.ticket && record.ticket.state !== 'READY') continue;
    const v = validateTicket(record.ticket, record.file, target, policy, registry);
    if (!v.ok) rejected.push({ file: record.file, ticket_id: record.ticket && record.ticket.ticket_id, reasons: v.errors });
    else valid.push(v);
  }

  valid = valid.filter(v => {
    if (v.earliest < globalStart || v.end > globalEnd) {
      rejected.push({ file: v.file, ticket_id: v.raw.ticket_id, reasons: ['WINDOW_OUTSIDE_GLOBAL_NIGHT_SHIFT'] }); return false;
    }
    return true;
  });

  const depChecked = dependencyValidate(valid, policy, rejected);
  valid = depChecked.valid;
  const childByParent = depChecked.childByParent;

  const reservations = valid.filter(v => v.raw.exclusive_window === true).sort((a,b) => a.earliest - b.earliest);
  const rootNormal = valid.filter(v => v.raw.exclusive_window !== true && !v.raw.depends_on_ticket_id);
  const dependent = valid.filter(v => !!v.raw.depends_on_ticket_id);
  const remainingRoots = new Set(rootNormal);
  const remainingDependents = new Set(dependent);
  const scheduled = [];
  const allocated = new Map();
  let cursor = new Date(globalStart);

  function fits(v, start, boundary) {
    const finish = new Date(start.getTime() + v.max_minutes * 60000);
    return start <= v.latest && finish <= v.end && finish.getTime() + bufferMs <= boundary.getTime();
  }

  function place(v, start, gapBoundary) {
    const finish = new Date(start.getTime() + v.max_minutes * 60000);
    const latestBudgetEnd = new Date(v.latest.getTime() + v.max_minutes * 60000);
    const gapEnd = gapBoundary || v.end;
    const admissionEnd = minDate(v.end, latestBudgetEnd, gapEnd);
    const admissionStart = v.raw.exclusive_window === true ? new Date(start) : new Date(Math.max(globalStart.getTime(), v.earliest.getTime()));
    scheduled.push({ ticket: v, start, finish, admissionStart, admissionEnd });
    allocated.set(v.raw.workstream_id, (allocated.get(v.raw.workstream_id) || 0) + v.max_minutes);
    cursor = new Date(finish.getTime() + bufferMs);
    remainingRoots.delete(v);
    remainingDependents.delete(v);
  }

  function placeSuccessors(parent, boundary) {
    let current = parent;
    while (scheduled.length < policy.overnight.max_slots) {
      const child = childByParent.get(current.raw.ticket_id);
      if (!child || !remainingDependents.has(child)) return;
      const start = new Date(Math.max(cursor.getTime(), child.earliest.getTime()));
      if (!fits(child, start, boundary)) return;
      place(child, start, new Date(boundary.getTime() - bufferMs));
      current = child;
    }
  }

  function fillUntil(boundary) {
    while (scheduled.length < policy.overnight.max_slots && cursor < boundary) {
      const candidates = [...remainingRoots];
      const choice = chooseCandidate(candidates, cursor, boundary, allocated, bufferMs);
      if (choice) {
        const start = new Date(Math.max(cursor.getTime(), choice.earliest.getTime()));
        place(choice, start, new Date(boundary.getTime() - bufferMs));
        placeSuccessors(choice, boundary);
        continue;
      }
      const future = candidates.map(c => c.earliest).filter(d => d > cursor && d < boundary).sort((a,b) => a-b)[0];
      if (future) { cursor = new Date(future); continue; }
      break;
    }
  }

  for (const r of reservations) {
    if (scheduled.length >= policy.overnight.max_slots) break;
    fillUntil(r.earliest);
    const start = new Date(Math.max(cursor.getTime(), r.earliest.getTime()));
    const finish = new Date(start.getTime() + r.max_minutes * 60000);
    if (start > r.latest || finish > r.end || finish > globalEnd) {
      rejected.push({ file: r.file, ticket_id: r.raw.ticket_id, reasons: ['RESERVATION_CONFLICT_OR_INSUFFICIENT_WINDOW'] });
      continue;
    }
    place(r, start, r.end);
    placeSuccessors(r, globalEnd);
  }
  fillUntil(globalEnd);

  for (const v of remainingRoots) rejected.push({ file: v.file, ticket_id: v.raw.ticket_id, reasons: ['DEFERRED_NO_SAFE_FIT'] });
  for (const v of remainingDependents) rejected.push({ file: v.file, ticket_id: v.raw.ticket_id, reasons: ['DEPENDENCY_NOT_SCHEDULED_OR_NO_SAFE_FIT'] });
  if (scheduled.length >= policy.overnight.max_slots) {
    for (const r of reservations) if (!scheduled.some(s => s.ticket === r) && !rejected.some(x => x.file === r.file)) rejected.push({ file: r.file, ticket_id: r.raw.ticket_id, reasons: ['DEFERRED_SLOT_LIMIT'] });
  }

  const slots = scheduled.map((s, i) => ({
    enabled: true,
    slot: i + 1,
    ticket_id: s.ticket.raw.ticket_id,
    workstream_id: s.ticket.raw.workstream_id,
    qualification_id: s.ticket.raw.qualification_id,
    subject_sha: s.ticket.raw.subject_sha,
    origin_ref: s.ticket.raw.origin_ref,
    depends_on_ticket_id: s.ticket.raw.depends_on_ticket_id || null,
    requires_previous_pass: !!s.ticket.raw.depends_on_ticket_id,
    overnight_lane: s.ticket.raw.overnight_lane || null,
    value_class: s.ticket.raw.value_class || null,
    critical_path_rank: Number.isInteger(s.ticket.raw.critical_path_rank) ? s.ticket.raw.critical_path_rank : null,
    qualifier_timeout_minutes: s.ticket.max_minutes,
    job_timeout_minutes: Math.min(policy.runtime.max_job_timeout_minutes, s.ticket.max_minutes + policy.runtime.cleanup_margin_minutes),
    planned_start: s.start.toISOString(),
    not_before: s.admissionStart.toISOString(),
    not_after: s.admissionEnd.toISOString(),
    resume_on_pass: s.ticket.raw.resume_on_pass,
    resume_on_failure: s.ticket.raw.resume_on_failure,
    notification_target: s.ticket.raw.notification_target
  }));
  while (slots.length < policy.overnight.max_slots) slots.push({ enabled: false, slot: slots.length + 1, ticket_id: '', workstream_id: '', qualification_id: 'A01-CONTROL-PLANE-SELFTEST', subject_sha: '0000000000000000000000000000000000000000', origin_ref: 'refs/heads/main', depends_on_ticket_id: null, requires_previous_pass: false, overnight_lane: null, value_class: null, critical_path_rank: null, qualifier_timeout_minutes: policy.runtime.normal_qualifier_timeout_minutes, job_timeout_minutes: policy.runtime.normal_job_timeout_minutes, planned_start: globalStart.toISOString(), not_before: globalStart.toISOString(), not_after: globalEnd.toISOString(), resume_on_pass: 'No slot.', resume_on_failure: 'No slot.', notification_target: 'none' });
  return { plan_version: 4, policy_version: policy.policy_version, registry_version: registry.registry_version, night_date: target, timezone: policy.overnight.timezone, window_start: globalStart.toISOString(), window_end: globalEnd.toISOString(), generated_at: now.toISOString(), scheduled_count: scheduled.length, rejected, slots };
}

function emit(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function main() {
  const policy = readJson(POLICY_PATH);
  process.env.TZ = policy.overnight.timezone;
  const registry = readJson(REGISTRY_PATH);
  const records = loadTickets(REQUEST_DIR);
  const plan = buildPlan({ now: new Date(), policy, registry, ticketRecords: records, nightDate: process.env.A01_NIGHT_DATE || undefined });
  const out = process.env.A01_PLAN_PATH || path.join(process.env.RUNNER_TEMP || ROOT, `a01-overnight-plan-${plan.night_date}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(plan, null, 2) + '\n');
  emit('night_date', plan.night_date);
  emit('scheduled_count', String(plan.scheduled_count));
  for (let i = 0; i < plan.slots.length; i++) {
    const n = String(i + 1).padStart(2, '0');
    emit(`slot_${n}`, JSON.stringify(plan.slots[i]));
    emit(`slot_${n}_enabled`, String(plan.slots[i].enabled));
  }
  console.log(`A01_OVERNIGHT_PLAN=${JSON.stringify({ night_date: plan.night_date, scheduled_count: plan.scheduled_count, rejected: plan.rejected.length })}`);
}

module.exports = { buildPlan, validateTicket, targetNightDate, localDateTime };
if (require.main === module) main();
