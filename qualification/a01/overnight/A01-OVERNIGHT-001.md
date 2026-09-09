# A01-OVERNIGHT-001 — Night Shift Scheduler

Status: IMPLEMENTING / QUALIFICATION REQUIRED
Timezone: America/New_York
Operating window: 00:00–07:00 local

## Purpose

Use otherwise-idle A-01 capacity while the user sleeps without creating independent per-chat cron schedules or weakening the canonical A-01 control plane.

A01-OVERNIGHT-001 is an additive scheduling capability. It does not create a second qualification authority. Every selected ticket still executes a registered qualifier through `.github/workflows/a01-control-plane-gateway.yml`, against an exact subject SHA, and must produce the normal receipt and evidence.

## Research-driven design decisions

1. One central nightly scheduler owns the 00:00–07:00 window. Workstreams MUST NOT create independent overnight cron schedules.
2. Scheduler kickoff is 23:57 local rather than exactly on the hour. GitHub documents that scheduled workflows may be delayed during high load, especially near the start of an hour.
3. The scheduler plans a sequence once, then executes bounded reusable-gateway slots. It does not continuously poll GitHub and does not depend on `workflow_run` chaining.
4. Capacity is not divided into fixed chat blocks. Reserved windows are protected; otherwise unused capacity is backfilled by work that safely fits before the next reservation.
5. One READY ticket per workstream per night is allowed in v1. This gives each active chat a fair opportunity while keeping the existing outstanding-request rule intelligible.
6. A ticket may request more than the historic 30-minute normal gateway envelope. Overnight qualifier budgets may be up to 300 minutes, subject to the qualification's registry cap.
7. Any ticket above 180 minutes must use a registry-declared checkpoint-capable qualifier and declare checkpoints no farther than 30 minutes apart.
8. No ticket starts unless its declared maximum runtime plus transition buffer fits inside its allowed end window and the global 07:00 stop-admission boundary.
9. Disruptive post-actions such as Windows reboot are excluded from overnight v1. Reboot qualification remains available through the normal control plane.
10. A workstream subject failure preserves evidence and does not invalidate unrelated overnight tickets. The next slot may still run. Each ticket is independently fail-closed.

## What A-01 can do overnight

Appropriate unattended work includes repository tests, long regression suites, training/evaluation scripts, benchmarks, static/dynamic analysis, corpus harvesting through explicitly implemented APIs, deterministic data processing, source qualification, and other registered executable workloads.

A-01 is not an autonomous ChatGPT reasoning session. Open-ended model reasoning requires a separately authorized API-agent layer, credentials, budget controls, and evidence rules. A workstream that wants "exhaustive research" overnight must first turn that research into a bounded executable acquisition/analysis workflow or do the reasoning in-chat and use A-01 for the large executable portion.

## Ticket ownership

Tickets live under `qualification/a01/overnight/requests/` as separate JSON files. A workstream owns its own file and must not edit another workstream's ticket.

A READY ticket binds:

- one night date
- one workstream
- one registered qualification ID
- one exact subject SHA
- estimated and maximum runtime
- priority
- admission window
- optional exclusive reservation
- checkpoint declaration when required
- normal pass/failure return routing

`HOLD` and `SUPERSEDED` tickets are never scheduled.

## Scheduling policy

The planner first validates tickets against policy and registry. Invalid or ineligible tickets are rejected into the plan evidence rather than silently altered.

Exclusive reservations are scheduled first at their earliest allowed start. Remaining tickets are backfilled conservatively into gaps only when their declared maximum runtime plus transition buffer cannot delay a reservation. Outside reserved windows, candidate selection favors lower already-allocated workstream minutes, then higher priority, older submission, and shorter declared maximum runtime when needed to fill a gap.

The planner emits at most eight slots in v1. Additional valid tickets are deferred and reported.

## Runtime authority

Normal gateway callers retain a 30-minute job envelope and a 28-minute qualifier budget by default.

Overnight callers may request a larger budget only when all of the following are true:

- execution context is `overnight`
- the qualification is registry-marked `overnight_eligible`
- requested budget is no greater than both the policy maximum and the qualification's registry maximum
- the admission window is valid
- required checkpoint capability is present for very long tickets
- the qualification has no registered disruptive post-action

The control-plane process, not only the GitHub job timeout, enforces the qualifier runtime. A budget timeout is recorded as a `SUBJECT_FAILURE` with exit code 124 so receipt/evidence generation can still occur before the outer job cleanup margin expires.

## Machine availability

A-01 must remain powered, network-connected, and awake while plugged in. The scheduler does not silently change Windows power policy because restoring that policy safely after a crash or reboot is a separate host-administration concern. The owner should configure plugged-in sleep so the machine remains awake through the night shift.

## Morning standing

The night-shift workflow produces a plan artifact and a final job summary. Each individual gateway slot also preserves its ordinary receipt/evidence artifact. The existing completion watcher can report newly completed A-01 receipts; workstreams resume from their own return tickets.

## Change-control boundary

The overnight scheduler may evolve independently of the frozen normal-mode execution semantics, but it may not weaken exact-SHA binding, registered-wrapper enforcement, receipt authority, evidence preservation, failure classification, or global A-01 serialization.
