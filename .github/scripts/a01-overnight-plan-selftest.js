'use strict';

const fs = require('fs');
const path = require('path');
const planner = require('./a01-overnight-plan.js');

const root = path.resolve(__dirname, '..', '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'qualification', 'a01', 'a01-policy.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(root, 'qualification', 'a01', 'registry.json'), 'utf8'));
function assert(x, m) { if (!x) throw new Error(m); }
function record(ticket, file) { return { ticket, file, parse_error: null }; }
function base(id, workstream, qid, overrides = {}) {
  return {
    ticket_version: 1,
    ticket_id: id,
    state: 'READY',
    night_date: '2026-09-09',
    submitted_at: '2026-09-08T20:00:00-04:00',
    workstream_id: workstream,
    qualification_id: qid,
    subject_sha: '1111111111111111111111111111111111111111',
    origin_ref: 'refs/heads/test',
    estimated_minutes: 20,
    max_runtime_minutes: 20,
    priority: 50,
    earliest_start_local: '00:00',
    latest_start_local: '06:00',
    window_end_local: '07:00',
    exclusive_window: false,
    resource_class: 'mixed',
    resume_on_pass: 'continue',
    resume_on_failure: 'repair',
    notification_target: 'test',
    ...overrides
  };
}

const r = JSON.parse(JSON.stringify(registry));
r.qualifications['TEST-NORMAL'] = { workstream_id: 'TEST-A', gate_class: 'focused', source: 'subject', executable: 'node', args: ['.github/scripts/test.js'], evidence_artifact: 'test', overnight_eligible: true, overnight_max_runtime_minutes: 120, checkpoint_capable: false };
r.qualifications['TEST-RESERVED'] = { workstream_id: 'TEST-B', gate_class: 'focused', source: 'subject', executable: 'node', args: ['.github/scripts/test.js'], evidence_artifact: 'test', overnight_eligible: true, overnight_max_runtime_minutes: 60, checkpoint_capable: false };
r.qualifications['TEST-LONG'] = { workstream_id: 'TEST-C', gate_class: 'focused', source: 'subject', executable: 'node', args: ['.github/scripts/test.js'], evidence_artifact: 'test', overnight_eligible: true, overnight_max_runtime_minutes: 300, checkpoint_capable: true };

const tickets = [
  record(base('normal', 'TEST-A', 'TEST-NORMAL', { estimated_minutes: 40, max_runtime_minutes: 40, priority: 20 }), 'normal.json'),
  record(base('reserved', 'TEST-B', 'TEST-RESERVED', { estimated_minutes: 30, max_runtime_minutes: 30, priority: 100, earliest_start_local: '01:00', latest_start_local: '01:05', window_end_local: '01:30', exclusive_window: true }), 'reserved.json'),
  record(base('long', 'TEST-C', 'TEST-LONG', { estimated_minutes: 200, max_runtime_minutes: 200, checkpoint_interval_minutes: 30, priority: 10 }), 'long.json')
];
const plan = planner.buildPlan({ now: new Date('2026-09-08T23:57:00-04:00'), policy, registry: r, ticketRecords: tickets, nightDate: '2026-09-09' });
assert(plan.plan_version === 2, 'planner v2 required');
assert(plan.scheduled_count === 3, `expected 3 slots, got ${plan.scheduled_count}`);
assert(plan.slots[0].ticket_id === 'normal', 'safe backfill should run before reservation');
assert(plan.slots[0].not_before === '2026-09-09T04:00:00.000Z', 'normal slot should be allowed to compress to its own earliest start');
assert(plan.slots[0].not_after === '2026-09-09T04:58:00.000Z', 'pre-reservation slot must fail closed before reservation buffer');
assert(plan.slots[1].ticket_id === 'reserved', 'reserved window must be protected');
assert(plan.slots[1].not_before === '2026-09-09T05:00:00.000Z', 'reservation must bind 01:00 New York');
assert(plan.slots[1].not_after === '2026-09-09T05:30:00.000Z', 'reservation admission end must remain protected');
assert(plan.slots[2].ticket_id === 'long', 'long checkpointable work should use remaining capacity');
assert(plan.slots[2].qualifier_timeout_minutes === 200, 'long runtime budget must survive planning');
assert(plan.slots[2].not_before === '2026-09-09T04:00:00.000Z', 'post-reservation normal work should be eligible immediately after dependency completion');
assert(plan.slots[2].planned_start === '2026-09-09T05:32:00.000Z', 'planned start should retain conservative audit schedule');

const badLongRegistry = JSON.parse(JSON.stringify(r));
badLongRegistry.qualifications['TEST-LONG'].checkpoint_capable = false;
const bad = planner.buildPlan({ now: new Date('2026-09-08T23:57:00-04:00'), policy, registry: badLongRegistry, ticketRecords: [tickets[2]], nightDate: '2026-09-09' });
assert(bad.scheduled_count === 0 && bad.rejected.some(x => x.reasons.includes('CHECKPOINT_CAPABILITY_REQUIRED')), 'long non-checkpointable ticket must fail closed');

const duplicate = planner.buildPlan({ now: new Date('2026-09-08T23:57:00-04:00'), policy, registry: r, ticketRecords: [tickets[0], record(base('normal-2', 'TEST-A', 'TEST-NORMAL'), 'normal-2.json')], nightDate: '2026-09-09' });
assert(duplicate.scheduled_count === 0 && duplicate.rejected.length === 2, 'multiple READY tickets per workstream must be rejected');

console.log('A01_OVERNIGHT_PLAN_SELFTEST=PASS');
