# SECOND-SHIFT-EXECUTION-CONTROL-001

Status: ACTIVE / TOPOLOGY-004 / PROGRAM-JOB-LOCKED
Effective date: 2026-09-10
Scope: execution control and observability only. This contract does not transfer product, canonical-writer, A-01, human, author, private, blind, native, external, publication or production authority.

## Required authority before dispatch

Every controller/worker must read current `CURRENT-AUTHORITY`, its `program_job_lock`, `system_completion_status`, selected topology, current obligation registry and Second Shift registry before dispatch.

PROSE is the only complete system. SYSTEM_MASTER, CORE, LEARNING, BOOK and DOCUMENTS remain incomplete. A packet/phase/test completion cannot be promoted to system completion.

## Owner discovery and coverage law

1. `SECOND-SHIFT-REGISTRY-001.json::owner_files` is the machine-authoritative active lane set.
2. Current peer worker lanes are CORE, LEARNING, BOOK and DOCUMENTS.
3. `SYSTEM_MASTER/BOOK/PROSE` is the completed active Book child specialist and routes through BOOK. It never gets a separate mutation lane.
4. The SYSTEM_MASTER root is portfolio controller, not a peer worker lane.
5. Every READY/CANDIDATE delegation must match the current obligation registry, exact live control head and the program job lock.
6. A job-lock or completion-status mismatch is stale/invalid and must not dispatch.

## Locked work domains

CORE: shared Foundation/Spine, runtime/data/platform/continuity/assurance/A-01 infrastructure and System-Master integration primitives only.

LEARNING: Learning product/runtime/curriculum/mastery/assessment/adaptation/evidence and upward System-Master integration only.

BOOK: Book product plus integration of the completed PROSE child through adapters and the Book Workflow Orchestrator, with Book retaining canonical manuscript/Story Bible/author/lifecycle/admission/publication authority.

PROSE: complete specialist capability source under BOOK. Integration/adapter/orchestrator work is allowed; independent peer scheduling, canonical writes and feature expansion without demonstrated defect/user direction are forbidden.

DOCUMENTS: document/artifact mechanics and upward System-Master integration only. Documents must not absorb or own Prose.

Programming/Knowledge Recovery: supporting CORE work only; it may use nonblocking capacity but may not regain product-wide priority or create a new system lane.

## Execution state machine

READY -> CLAIMED -> RUNNING -> {COMPLETED | BLOCKED | STALE}
COMPLETED -> RECONCILE -> SUCCESSOR_BOUND -> READY
BLOCKED -> RECONCILE -> {SUCCESSOR_BOUND -> READY | ALL_RUNGS_EXHAUSTED -> IDLE_VALID}
STALE -> RECONCILE -> {SUCCESSOR_BOUND -> READY | ALL_RUNGS_EXHAUSTED -> IDLE_VALID}

Child Prose work uses the BOOK state machine and claim.

## Claim and live-head law

One mutation-capable claim per active owner lane. Required claim fields remain: lease_id, lane, delegation_id, objective_id, control_ref, control_head_at_claim, idempotency_key, claimed_at, lease_expires_at, last_heartbeat_at, attempt and checkpoint_pointer.

Changed live owner head invalidates mutation until revalidation. A Book claim covers mutation-capable Prose child integration for that objective. No child claim may overlap or bypass BOOK.

Until foreground/Second-Shift arbitration is fully machine-admitted, any detected concurrent mutation attempt must fail closed, re-read the live head, and adopt/reconcile valid existing progress rather than overwrite it.

## Dispatch and successor law

- Dispatch only dependency-valid work inside the lane's locked job.
- A blocker in one peer lane does not block independent safe work in another.
- After completion or material block, preserve evidence, re-read live authority and bind the next successor inside the same locked job.
- A lane is IDLE only after durable all-eight-rungs exhaustion for its own job.
- Knowledge Recovery may run as supporting Core capacity but cannot displace the central System Master integration coordination or independent Book/Learning/Documents execution.

## Retry / idempotency / quarantine

Assume at-least-once invocation. State-changing effects require durable idempotency/deduplication. Failures are classified before finite retry/backoff. Exhausted transient dependencies circuit-open for that invocation and the worker selects independent safe work inside the same job. Poison work is quarantined/dead-lettered.

## Mandatory work-ahead ladder

1. repair/control health
2. completion/evidence census
3. authoritative research/provenance
4. architecture/contracts/state/interface/evidence specification
5. tests/benchmarks/property/concurrency/failure injection
6. bounded implementation/objective verification
7. exact-SHA qualification/A-01 preparation
8. successor build packet

## Utilization and morning handoff

Active ledgers are CORE, LEARNING, BOOK and DOCUMENTS. Prose activity is recorded under BOOK. Morning handoff must report each system's completion standing and locked job, not just its latest packet.

A Documents delegation that contains active Prose absorption, a Learning delegation that takes Book/Documents work, a Core delegation that takes peer product semantics, a separate Prose lane, or a non-Prose system-completion claim is an execution-control defect.

## Safe stopping

Safe truthful stopping is preferable to authority violation. Preserve exact evidence and blockers; never synthesize completion, PASS, author/private/native/external/publication/production authority.
