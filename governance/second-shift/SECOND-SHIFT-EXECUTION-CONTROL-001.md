# SECOND-SHIFT-EXECUTION-CONTROL-001

Status: PROPOSED_FOR_ADMISSION
Effective target: 2026-09-10 before the next 00:00-07:00 America/New_York shift
Scope: execution control and observability only. This contract does not transfer product, A-01, human, author, private, blind, native, external, publication or production authority.

## Problem closed by this contract

SECOND-SHIFT-OPERATING-MODE-002 already requires work-ahead, immediate successor selection, and an all-rungs-exhausted proof before idle. The 2026-09-10 morning audit proved continuation defects because the policy had no durable dispatcher/lease/heartbeat/utilization enforcement. A later product-root audit also proved an owner-discovery defect: the execution code compiled a fixed CORE/LEARNING/BOOK/PROSE lane list, so a valid SYSTEM_MASTER-owned headless portfolio such as Documents could be omitted entirely. This contract now requires registry-driven owner discovery and current-authority obligation selection.

## Owner discovery and coverage law

1. `governance/second-shift/SECOND-SHIFT-REGISTRY-001.json::owner_files` is the machine-authoritative lane set. Controllers, watchdogs, enforcement and future dispatchers must enumerate it; a fixed lane-name array is non-conforming.
2. `governance/CURRENT-AUTHORITY.json::obligation_registry` selects the current obligation registry. Historical hard-coded registries may be read as evidence but never used as the current work selector.
3. Every READY/ACTIVE current obligation owner path must resolve to a registry-declared owner lane or an explicit registry coverage route.
4. A READY/ACTIVE `central_next_objective` must have an active current delegation in its resolved Second Shift owner lane unless a valid all-eight-rungs exhaustion record proves no unattended-safe work is available.
5. SYSTEM_MASTER-owned non-system headless capability portfolios share the SYSTEM_MASTER root lane. Creating Documents, Spreadsheet, Code, Research, Connected Actions, Media or another root-owned tool portfolio does not create a new peer system or require a per-tool Second Shift lane.
6. A genuinely new first-class owner system requires explicit topology/ownership admission and must add its owner file to `owner_files` in the same change.

## Execution state machine

Each registry-declared owner lane is governed independently by:

READY -> CLAIMED -> RUNNING -> {COMPLETED | BLOCKED | STALE}
COMPLETED -> RECONCILE -> SUCCESSOR_BOUND -> READY
BLOCKED -> RECONCILE -> {SUCCESSOR_BOUND -> READY | ALL_RUNGS_EXHAUSTED -> IDLE_VALID}
STALE -> RECONCILE -> {SUCCESSOR_BOUND -> READY | ALL_RUNGS_EXHAUSTED -> IDLE_VALID}

IDLE_VALID is not a delegation state. It is a shift disposition that exists only with a current durable all-eight-rungs-exhausted record.

## Dispatch law

1. The portfolio controller runs before the shift and once per hour during the shift.
2. Each registry-declared owner worker is re-invoked once per hour during 00:00-07:00 at an off-hour minute or other configured stagger that preserves the same cadence.
3. Within one invocation, a worker does not stop after one completed item while safe work remains. It records the completion, re-reads live authority, binds the successor, and continues until a true execution/tool boundary is reached.
4. A READY delegation that remains undispatched across the next eligible owner-worker invocation is SECOND_SHIFT_SCOPE_VIOLATION unless a live claim/lease or a durable platform-execution delay explains the interval.
5. The 06:45 controller pass is the final refill/reconciliation pass. The shift freezes at 07:00. The definitive handoff runs only after 07:00.

## Queue-depth and starvation law

The pre-shift controller should enter the night with an oversupplied owner-valid queue rather than one brittle task whenever current authority permits it.

- Target per lane: one highest-value primary READY item plus at least two dependency-diverse READY or CANDIDATE fallback items.
- Fallback items are preparation/dispatch options, not pre-granted mutation authority. They must be revalidated against the current owner control binding before claim.
- Only one mutation-capable item may be CLAIMED at a time per lane.
- Queue order follows owner priority and the mandatory work-ahead ladder, but an item repeatedly bypassed for transient reasons receives an age/attention marker so it cannot starve indefinitely.
- Independent fallback candidates should not share the same single external dependency when a genuinely independent rung exists.
- If owner evidence cannot support three truthful candidates, record the exact reason; do not manufacture queue depth.
- P3-P9 of SYSTEM-MASTER-COMPLETION-CENSUS-002 and active Foundation Closure census gaps are permitted fallback reservoirs only when the work maps to the same canonical owner and does not supersede a higher-priority active repair.

## Claim and lease law

Mutation-capable work requires one logical claim per registry-declared owner lane.

Required claim fields:
- lease_id: globally unique within the shift
- lane: one key currently declared by `SECOND-SHIFT-REGISTRY-001.json::owner_files`
- delegation_id
- objective_id
- control_ref
- control_head_at_claim
- idempotency_key
- claimed_at
- lease_expires_at
- last_heartbeat_at
- attempt
- checkpoint_pointer

Rules:
- A second mutation worker must not start while a non-expired claim for the same lane is making progress.
- A changed current owner control binding invalidates the claim for mutation. Preserve evidence and re-plan against current authority.
- Heartbeat/progress checkpoints extend evidence of liveness; they never extend product authority.
- A stale claim is recoverable from the last durable checkpoint. Recovery uses the same logical idempotency key for the same effect or a new key for a changed exact subject/effect.
- Claim release and successor binding should occur in the same reconciliation transaction whenever possible.

Owner control binding is normally the exact live owner branch head. For the SYSTEM_MASTER product-root lane it may be the exact Git blob SHA of an authority file explicitly declared by the root selector; this prevents the delegation file's own commit from self-invalidating the root lane while still invalidating it whenever root authority changes.

Default operational values for the ChatGPT hourly dispatcher layer:
- owner-worker recurrence: once per hour during 00:00-06:59
- portfolio watchdog recurrence: once per hour, plus pre-shift launch
- target maximum READY-undispatched interval: one owner-worker cadence
- soft claim lease: 50 minutes
- heartbeat on each meaningful durable progress checkpoint
- stale claim recovery: next eligible worker/controller pass after expiry and authority revalidation

## Idempotency and duplicate-delivery law

Assume at-least-once invocation. Any state-changing operation must be safe if the scheduler, network, connector or GitHub retries it.

An idempotency key binds at minimum:
`shift_id + lane + objective_id + delegation_generation + exact_subject_or_effect_identity`.

The worker must check durable evidence before repeating a mutation, workflow dispatch, promotion, receipt ingestion, artifact publication or canonical pointer advancement. Duplicate delivery may repeat read-only verification but must not duplicate effects. Idempotency must propagate through downstream mutations when the same logical effect crosses more than one component.

## Retry, circuit-breaker and quarantine law

Failures are classified before retry:
- TRANSIENT_DEPENDENCY: bounded retry with exponential backoff; then open circuit and switch to independent safe work.
- SUBJECT_FAILURE: preserve exact failed subject/evidence; repair only under owner/repair rules.
- AUTHORITY_OR_DEPENDENCY_BLOCK: do not retry blindly; move to independent ladder rungs.
- CONTROL_PLANE_FAILURE: preserve boundary and use the canonical repair path.
- PERMANENT_INPUT_OR_POLICY_FAILURE: no automatic retry until the invalid input/policy state changes.

Default transient retry budget per dependency per worker invocation: 3 attempts, no more than one immediate retry. After budget exhaustion the dependency is CIRCUIT_OPEN for the remainder of that invocation and the lane must consume independent safe work if available.

A task that repeatedly reaches its terminal retry/policy boundary is moved to a durable quarantine/dead-letter disposition with its exact subject/effect identity, attempts, failure classifications, evidence pointers and unblock condition. Quarantine removes the poison item from the hot dispatch path but does not erase the obligation or grant completion.

## Mandatory work-ahead ladder

The existing eight-rung ladder remains authoritative:
1. current repair/control health
2. completion and evidence census
3. authoritative research and provenance
4. architecture/contracts/state/interface/evidence specification
5. tests/benchmarks/property/concurrency/failure injection
6. bounded implementation with objective verification
7. exact-SHA qualification and A-01 preparation
8. next successor build packet

A blocker at one rung blocks only work that actually depends on it.

## All-rungs-exhausted proof

IDLE is valid only when a durable record contains all eight rungs. Every rung must have:
- disposition: COMPLETE | DUPLICATE | DEPENDENCY_BLOCKED | HUMAN_AUTHOR_PRIVATE_NATIVE_EXTERNAL_BLOCKED | UNSAFE_WITHOUT_DECISION
- exact blocker/evidence pointer
- independent-preparation assessment
- next condition that would make the rung executable

Missing/stale delegation, unavailable A-01, unavailable runner, one blocked critical path, completed assignment, or empty active_delegations is never itself an exhaustion proof.

## Utilization event ledger

Commit timestamps and workflow duration are evidence checkpoints, not productivity telemetry. Each registry-declared lane therefore writes an append-only per-shift event ledger conforming to SECOND-SHIFT-UTILIZATION-EVENT-SCHEMA-001.json.

Required event classes include:
SHIFT_OPEN, READY, CLAIMED, RUNNING, HEARTBEAT, PROGRESS, COMPLETED, BLOCKED, STALE, RETRY, CIRCUIT_OPEN, CIRCUIT_HALF_OPEN, CIRCUIT_CLOSED, SUCCESSOR_BOUND, ALL_RUNGS_EXHAUSTED, IDLE_VALID, SHIFT_CLOSE.

The morning audit derives time in READY/RUNNING/BLOCKED/STALE/IDLE only from these state events. Missing telemetry is reported as UNKNOWN, never inferred from commit spacing or runner uptime. Process uptime, CPU use and GitHub job duration may be diagnostic signals but are not substitutes for useful-work state.

## Successor admission law

A side-branch or hosted PASS is evidence, not canonical completion. Before a successor is called closed/admitted:
- re-read current owner authority/control binding
- compare the candidate base/subject to current owner lineage
- validate parent/child topology and canonical-writer boundaries
- preserve exact subject/workflow/artifact evidence
- run the applicable control-drift/state-reconciler/owner-coverage checks
- then bind the next delegation to the resulting current owner binding

No PASS transfer is permitted.

## Controller health SLOs

For each shift:
- 0 READY/ACTIVE current owner paths missing a registry-declared Second Shift route
- 0 current central objectives left unbound to their routed owner lane
- 0 unexplained IDLE intervals
- 0 READY head items left undispatched across an eligible owner-worker cadence
- 0 overlapping mutation claims per lane
- 0 stale claims left unreconciled after the next eligible controller/worker pass
- 100% completed/materially blocked items followed by successor selection or all-rungs-exhausted proof
- 100% retrying operations classified and bounded
- 100% terminal poison work preserved in durable quarantine rather than endlessly retried
- 100% canonical admissions exact-head/exact-subject/topology checked
- 100% time-state claims grounded in the utilization event ledger
- pre-shift queue target of primary plus two dependency-diverse fallbacks per lane when truthful owner-valid candidates exist

These are controller SLOs, not a command to manufacture busywork. Safe truthful stopping remains preferable to violating an authority boundary.

## Research basis

This control adopts established durable-work principles from queue/orchestration systems: visibility/claim leases and heartbeats for long work, explicit task timeout and heartbeat failure detection, classified retry/catch paths, idempotency for at-least-once delivery, circuit breaking after repeated transient failures, durable quarantine/dead-letter handling for poison work, serialized concurrency where conflicting effects exist, queue depth/fairness safeguards and explicit processing telemetry. The implementation deliberately keeps those mechanics separate from System Master product authority.
