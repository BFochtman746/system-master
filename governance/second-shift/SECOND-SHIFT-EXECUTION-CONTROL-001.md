# SECOND-SHIFT-EXECUTION-CONTROL-001

Status: PROPOSED_FOR_ADMISSION
Effective target: 2026-09-10 before the next 00:00-07:00 America/New_York shift
Scope: execution control and observability only. This contract does not transfer product, A-01, human, author, private, blind, native, external, publication or production authority.

## Owner discovery and coverage law

1. `SECOND-SHIFT-REGISTRY-001.json::owner_files` is the machine-authoritative active lane set. Controllers, watchdogs, enforcement and dispatchers enumerate it; fixed lane arrays are non-conforming.
2. `CURRENT-AUTHORITY.json::obligation_registry` selects current work authority.
3. Every READY/ACTIVE current executable system owner path must resolve to an active registry lane or explicit shared-infrastructure route.
4. The current `central_next_objective` must have an active delegation in its owning system lane unless a valid all-eight-rungs exhaustion record applies.
5. Current active worker lanes are CORE, LEARNING, BOOK and DOCUMENTS.
6. DOCUMENTS is a first-class peer system and owns a separate lane.
7. PROSE is completed/retired. Any attempted new Prose execution is `RETIRED_OWNER_STALE_WORK` and must not dispatch.
8. The temporary SYSTEM_MASTER root worker lane is retired; MASTER_ROOT remains a portfolio controller rather than a peer worker.

## Execution state machine

Each active registry-declared lane is independently governed by:

READY -> CLAIMED -> RUNNING -> {COMPLETED | BLOCKED | STALE}
COMPLETED -> RECONCILE -> SUCCESSOR_BOUND -> READY
BLOCKED -> RECONCILE -> {SUCCESSOR_BOUND -> READY | ALL_RUNGS_EXHAUSTED -> IDLE_VALID}
STALE -> RECONCILE -> {SUCCESSOR_BOUND -> READY | ALL_RUNGS_EXHAUSTED -> IDLE_VALID}

A retired lane is outside this state machine; it is not IDLE_VALID and requires no new telemetry.

## Dispatch law

- Portfolio control runs before shift and periodically during shift.
- Each active registry lane receives the configured worker cadence.
- A worker records completion/block, re-reads live authority, binds a successor and continues while safe work/capacity remains.
- READY work left undispatched across its eligible cadence without a live claim/platform explanation is `SECOND_SHIFT_SCOPE_VIOLATION`.
- Retired PROSE and SYSTEM_MASTER root-worker tasks are never considered missing dispatches.

## Documents transition law

DOCUMENTS owns current Document R4 admission and subsequent Prose capability absorption work. Historical Prose capabilities/evidence are migration inputs only. Changed integration bytes require fresh qualification; no historical PASS transfers.

BOOK and DOCUMENTS are peers. BOOK retains canonical Book/manuscript/story-bible/lifecycle/author/publication state. DOCUMENTS owns document/prose implementation and service semantics. Second Shift may not blur this boundary.

## Claim and lease law

One mutation-capable claim per active lane. Required claim fields remain: lease_id, lane, delegation_id, objective_id, control_ref, control_head_at_claim, idempotency_key, claimed_at, lease_expires_at, last_heartbeat_at, attempt and checkpoint_pointer.

Changed live owner head invalidates mutation until revalidation. Heartbeats/checkpoints evidence liveness only. Stale claims recover from durable checkpoints under the same logical idempotency identity where the effect is unchanged.

## Idempotency / retries / quarantine

Assume at-least-once invocation. State-changing effects require durable idempotency/deduplication. Failures are classified before retry. Transient dependencies receive finite retries/backoff; after exhaustion they circuit-open for that invocation and the worker selects independent safe work. Poison work is durably quarantined/dead-lettered rather than endlessly retried.

## Mandatory work-ahead ladder

1. repair/control health
2. completion/evidence census
3. authoritative research/provenance
4. architecture/contracts/state/interface/evidence specification
5. tests/benchmarks/property/concurrency/failure injection
6. bounded implementation/objective verification
7. exact-SHA qualification/A-01 preparation
8. successor build packet

An active lane is idle only with a durable all-eight-rungs exhaustion proof.

## Utilization event law

The utilization schema's active lane set must match the Second Shift registry. Current active ledgers are `CORE.json`, `LEARNING.json`, `BOOK.json`, and `DOCUMENTS.json` under the current shift date. Historical `PROSE.json` and `SYSTEM_MASTER.json` ledgers remain evidence only.

Required state events continue to include SHIFT_OPEN, READY, CLAIMED, RUNNING, HEARTBEAT, PROGRESS, COMPLETED, BLOCKED, STALE, RETRY, CIRCUIT_OPEN/CLOSED, SUCCESSOR_BOUND, ALL_RUNGS_EXHAUSTED, IDLE_VALID and SHIFT_CLOSE as applicable.

## Successor admission law

Side-branch/hosted PASS is evidence, not canonical completion. Before successor closure/admission, re-read current owner head, compare exact subject/lineage, validate peer/canonical-writer boundaries, preserve exact evidence, run reconciler/owner-coverage controls, and bind the next delegation to the resulting current owner head. No PASS transfer is permitted.

## Controller health SLOs

- 0 active current owners missing Second Shift coverage
- 0 current central objective left unbound to its active owner lane
- 0 retired Prose/root-worker dispatches
- 0 unexplained active-lane IDLE intervals
- 0 READY work left undispatched beyond eligible cadence
- 0 overlapping mutation claims
- 0 stale claims unreconciled after next eligible pass
- 100% completion/material block followed by successor selection or exhaustion proof
- 100% retrying operations classified/bounded
- 100% terminal poison work durably quarantined
- 100% canonical admissions exact-head/exact-subject/topology checked
- 100% utilization claims grounded in factual event ledgers

Safe truthful stopping remains preferable to authority violation.
