# SECOND-SHIFT-EXECUTION-CONTROL-001

Status: ACTIVE / TOPOLOGY-004-RECONCILED
Effective date: 2026-09-10
Scope: execution control and observability only. This contract does not transfer product, canonical-writer, A-01, human, author, private, blind, native, external, publication or production authority.

## Owner discovery and coverage law

1. `SECOND-SHIFT-REGISTRY-001.json::owner_files` is the machine-authoritative active lane set. Controllers, watchdogs, enforcement and dispatchers enumerate it; fixed lane arrays are non-conforming.
2. `CURRENT-AUTHORITY.json::obligation_registry` selects current work authority.
3. Every READY/ACTIVE current executable owner path must resolve to an active registry lane or explicit coverage route.
4. The current `central_next_objective` must have an active delegation in its owning/routed lane unless a valid all-eight-rungs exhaustion record applies.
5. Current active peer worker lanes are CORE, LEARNING, BOOK and DOCUMENTS.
6. `SYSTEM_MASTER/BOOK/PROSE` is an active Book child specialist and routes through the BOOK lane. It does not receive a separate Second Shift mutation lane.
7. The historical standalone PROSE lane remains retired provenance only; retirement of that lane does not retire the current Book child subsystem.
8. The temporary SYSTEM_MASTER root worker lane remains retired; MASTER_ROOT remains portfolio controller rather than a peer worker.

## Execution state machine

Each active registry-declared lane is independently governed by:

READY -> CLAIMED -> RUNNING -> {COMPLETED | BLOCKED | STALE}
COMPLETED -> RECONCILE -> SUCCESSOR_BOUND -> READY
BLOCKED -> RECONCILE -> {SUCCESSOR_BOUND -> READY | ALL_RUNGS_EXHAUSTED -> IDLE_VALID}
STALE -> RECONCILE -> {SUCCESSOR_BOUND -> READY | ALL_RUNGS_EXHAUSTED -> IDLE_VALID}

Child specialist work, including Prose, uses its parent BOOK lane's state machine and claim. A historical standalone lane is outside this state machine.

## Dispatch law

- Portfolio control runs before shift and periodically during shift.
- Each active registry lane receives the configured worker cadence.
- A worker records completion/block, re-reads live authority, binds a successor and continues while safe work/capacity remains.
- READY work left undispatched across its eligible cadence without a live claim/platform explanation is `SECOND_SHIFT_SCOPE_VIOLATION`.
- Historical standalone PROSE and SYSTEM_MASTER root-worker lanes are never considered missing dispatches.

## Book / Prose / Documents authority law

BOOK and DOCUMENTS are peers. BOOK retains canonical Book/manuscript/Story-Bible/lifecycle/author/publication state and owns the active `SYSTEM_MASTER/BOOK/PROSE` literary-specialist child. DOCUMENTS owns document/artifact mechanics and generic document services.

Prose may diagnose, evaluate and generate controlled revision candidates under Book contracts, but it has zero canonical manuscript-write authority. Prose outputs are evidence/candidates only and canonical manuscript effects remain exclusively Book admission effects.

Documents does not own Book-specific Prose craft/evaluation authority and cannot mutate Book canonical state. Book may consume admitted Documents document services without transferring Book or Prose authority.

## Claim and lease law

One mutation-capable claim per active owner lane. Required claim fields remain: lease_id, lane, delegation_id, objective_id, control_ref, control_head_at_claim, idempotency_key, claimed_at, lease_expires_at, last_heartbeat_at, attempt and checkpoint_pointer.

A Book claim covers Book child Prose mutation-capable execution for that objective; no child claim may overlap or bypass the BOOK claim.

Changed live owner head invalidates mutation until revalidation. Heartbeats/checkpoints evidence liveness only. Stale claims recover from durable checkpoints under the same logical idempotency identity where the effect is unchanged.

Cross-mode foreground-chat versus Second-Shift arbitration is a required successor hardening: both modes must consult one lane-wide mutation claim before writing. Until that hardening is admitted, any detected concurrent foreground/Second-Shift mutation attempt must fail closed and revalidate the live owner head before continuing.

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
8. next successor build packet

An active lane is idle only with a durable all-eight-rungs exhaustion proof.

## Utilization event law

The utilization schema's active lane set must match the Second Shift registry. Current peer worker ledgers are `CORE.json`, `LEARNING.json`, `BOOK.json`, and `DOCUMENTS.json`. Active Prose child work is recorded in the BOOK lane ledger; historical `PROSE.json` and `SYSTEM_MASTER.json` ledgers remain evidence only.

Required state events continue to include SHIFT_OPEN, READY, CLAIMED, RUNNING, HEARTBEAT, PROGRESS, COMPLETED, BLOCKED, STALE, RETRY, CIRCUIT_OPEN/CLOSED, SUCCESSOR_BOUND, ALL_RUNGS_EXHAUSTED, IDLE_VALID and SHIFT_CLOSE as applicable.

## Successor admission law

Side-branch/hosted PASS is evidence, not canonical completion. Before successor closure/admission, re-read current owner head, compare exact subject/lineage, validate peer/child/canonical-writer boundaries, preserve exact evidence, run reconciler/owner-coverage controls, and bind the next delegation to the resulting current owner head. No PASS transfer is permitted.

## Controller health SLOs

- 0 active current owners missing Second Shift coverage
- 0 current central objective left unbound to its active/routed owner lane
- 0 separate Prose child mutation lanes
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
