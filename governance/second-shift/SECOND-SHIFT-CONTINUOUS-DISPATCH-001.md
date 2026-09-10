# SECOND-SHIFT-CONTINUOUS-DISPATCH-001

Status: PROPOSED_FOR_ADMISSION
Effective target: 2026-09-10
Window: 23:45 pre-shift reconciliation; 00:00-07:00 America/New_York execution; 06:45 final refill; 07:00 shift close/handoff.

## Purpose

Turn the existing Second Shift rules into a durable execution loop. Existing enforcement/watchdog workflows remain independent safety controls and are not replaced.

## Controller/worker separation

The portfolio controller decides which registry-declared lane and objective is eligible. The GitHub reliability control plane governs dispatch, leases, idempotency, retry, rate budget and repository mutation. A worker executes one bounded claimed unit and cannot select a different owner or redefine the central objective.

## Active-lane discovery

Active lanes are always enumerated from `SECOND-SHIFT-REGISTRY-001.json::owner_files`. No dispatcher may compile a fixed list of owner names. Retired lanes are never scheduled.

## Shift loop

At 23:45:
1. Read current authority, topology, current obligation registry and Second Shift registry.
2. Resolve every active owner control head.
3. Reconcile stale/expired claims, repairs and delegations.
4. Ensure every active lane has READY work or a durable all-eight-rungs exhaustion proof.
5. Queue dependency-valid unattended-safe work without mutating canonical refs.

From 00:00 until 07:00:
1. Select the highest-priority eligible READY operation for each lane subject to global traffic budgets.
2. Claim the lane lease and dispatch a bounded worker.
3. Worker revalidates owner/control/objective immediately before execution.
4. Worker records RUNNING/HEARTBEAT/PROGRESS checkpoints.
5. Worker terminates the unit as COMPLETED, BLOCKED or STALE with exact evidence.
6. Terminal state emits an explicit continuation event.
7. Controller consumes that event, rereads live authority, closes/releases the claim, binds the next dependency-valid successor and dispatches again while the shift remains open.
8. A single completed project never ends the shift.

## Continuation-event law

Primary continuation is event-first. The dispatcher must not rely on a source push accidentally triggering a successor workflow. Terminal worker state causes an explicit control-plane continuation dispatch such as `repository_dispatch` or an equivalent reusable-workflow/controller call with operation and lane identity.

The continuation event is idempotent. Duplicate delivery may cause repeated evaluation but may not create a duplicate mutation or second live claim.

## Watchdog recovery

The existing Second Shift enforcement schedule remains a watchdog/reconciliation path. It detects READY work left undispatched, stale claims, false idle, owner-coverage gaps and invalid delegations. If the primary event path is lost, durable state is sufficient for the controller to reconstruct the next eligible action.

Scheduled watchdog activity is insurance, not the authoritative semantic queue.

## Idle law

An active lane may enter IDLE_VALID only when all eight work-ahead rungs have durable disposition evidence and `independent_work_remaining=false`. A dependency blocker at one rung never implies whole-lane idle when safe independent work exists.

## Failure/retry law

- SUBJECT_FAILURE routes to the current owner repair path.
- STALE_CONTROL or STALE_BASE releases mutation authority and requires fresh revalidation.
- TRANSIENT_GITHUB or TRANSIENT_RUNNER uses the single central bounded retry budget with backoff and jitter.
- POISON/REPEATED_FAILURE is quarantined rather than retried forever.
- A circuit-open dependency causes selection of independent safe work when available.
- Human, author, private, native, external, publication and production authority boundaries remain fail-closed.

## 06:45 final refill

At 06:45 the controller performs a final refill. It may start only work that is bounded or checkpointable and can leave exact durable state at 07:00. It does not declare the shift complete merely because a lane just finished an item.

## 07:00 close

At 07:00:
- do not admit new normal Second Shift units;
- allow already-running bounded work to write an exact safe checkpoint/terminal state according to its contract;
- preserve current claim/delegation/operation standing;
- emit morning handoff with completed work, blocked work, active repairs, remaining READY successors, exact heads and any controller health violations.

## Success criteria

- 0 active owners missing coverage.
- 0 READY work left undispatched beyond its configured SLA without a documented platform reason.
- 0 unexplained active-lane idle intervals.
- 100% COMPLETED/BLOCKED/STALE events followed by successor evaluation while shift remains open.
- duplicate continuation events create 0 duplicate side effects.
- lost primary continuation events are recovered by watchdog reconciliation.
- 0 overlapping mutation-capable claims per lane.
- 0 concurrent unfenced canonical writers.
- all utilization claims are grounded in append-only factual events.
