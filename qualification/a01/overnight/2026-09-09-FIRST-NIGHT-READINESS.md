# A01-OVERNIGHT-002 — First-Night Readiness Baseline

Status: READY FOR FIRST CENTRAL NIGHT SHIFT
Night: 2026-09-09
Timezone: America/New_York
Canonical scheduler window: 00:00–07:00 local
Scheduler kickoff: 23:57 local
Audit baseline main SHA: `d6cb4b8025504ea0fd9f28c5c4f1fa115c5dd714`

## READY tickets

1. `SYSTEM-MASTER-ASSURANCE-RECON` — `ASSURANCE-RECON-001B-OVERNIGHT-DEEP-CENSUS`
   - subject: `5ae9dfbeff56cc05883d7ba3e9f7a4f0da43191c`
   - estimated: 60 minutes
   - maximum: 150 minutes
   - priority: 90
   - no exclusive reservation

2. `LEARNING` — `LEARNING-PILOT-001-RUN-001-CLOSED-LOOP`
   - subject: `f262893ac413a6d933c7ec703b4d6ef5d6137939`
   - estimated: 15 minutes
   - maximum: 60 minutes
   - priority: 80
   - no exclusive reservation
   - predecessor execution-prep ticket is `SUPERSEDED`

3. `LITERARY-PROSE` — `LITERARY-PROSE-OVERNIGHT-RESEARCH-REGRESSION-SWEEP`
   - subject: `0caabd63861041dbfe0d1e057a729139533a1a8a`
   - estimated: 135 minutes
   - maximum: 180 minutes
   - priority: 75
   - no exclusive reservation

Declared maximum runner time is 390 minutes. Even allowing up to six minutes of two-minute transition buffers, the current three-ticket set requires no more than 396 minutes of the 420-minute operating window, leaving at least 24 minutes of nominal scheduling margin. The central planner remains authoritative for actual ordering and start times.

## Book Evaluation standing

No READY Book Evaluation ticket is intentionally present.

The active Book branch remains at `815dce7883986d5a62c6d7c63f63b9d82acea2fe`, the same subject whose canonical migration-equivalence run correctly failed closed because frozen private authority was missing. No evidence observed in this audit indicates that the missing `BASE_TRAINING` and `DEVELOPMENT_GOLD` inputs have become available. Re-running the same recovery boundary overnight would consume A-01 capacity without a dependency change, so the correct first-night disposition is no Book ticket.

Do not run Teacher verification, student training, selective 120B, visible-regression, or hidden-holdout work merely to fill overnight capacity.

## Control-plane readiness

- Canonical registry version observed: 11.
- All three READY qualification IDs are registered and `overnight_eligible`.
- Each requested maximum runtime is at or below its registry-specific cap.
- No ticket exceeds the >180-minute checkpoint threshold.
- No READY ticket requests a disruptive post-action.
- The old Literary scheduled workflow is manual-only; its independent cron has been removed.
- Latest canonical enforcement on the current pre-audit main head passed.
- At readiness inspection there were zero in-progress workflow runs and zero queued workflow runs.
- Exact subject commits for all three READY tickets resolve in the repository.

## First-night adjudication rule

Do not modify A01-OVERNIGHT-001 during the night merely because a workstream subject fails. Preserve each slot receipt/evidence independently and continue unrelated eligible slots. Tomorrow, compare the actual immutable plan, queue/start/finish times, receipt classes, artifacts, runtime utilization, idle time, any rejected/deferred ticket, and final digest against this readiness baseline.

Only change the overnight scheduler if the first real shift produces evidence of a scheduler/control-plane defect or a material utilization problem not already explained by the declared ticket constraints.
