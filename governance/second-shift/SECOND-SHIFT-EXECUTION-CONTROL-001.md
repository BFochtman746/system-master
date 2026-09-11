# SECOND-SHIFT-EXECUTION-CONTROL-001

Status: ACTIVE / TOPOLOGY-005 / PROGRAM-JOB-LOCKED
Effective date: 2026-09-11
Scope: execution control and observability only. This contract does not transfer product, work-program, canonical-writer, A-01, human, author, private, blind, native, external, publication or production authority.

## Required authority before dispatch

Every controller/worker reads current `CURRENT-AUTHORITY`, its selected topology, `program_job_lock`, `system_completion_status`, current obligation registry, Second Shift registry, repair registries, and every declared active peer owner file. It re-fetches each live owner head before mutation.

Active peer systems are CORE, LEARNING, BOOK and DOCUMENTS. PROSE is complete and terminally retired. PROGRAMMING is an incomplete active work program outside current peer topology.

## Owner discovery and auto-provisioning

1. `SYSTEM-TOPOLOGY-005.json::peer_system_ids` is the architecture source for active peers.
2. `SECOND-SHIFT-REGISTRY-001.json::owner_files` is the execution source for active lanes.
3. On every controller run, compare the two sets. They must match exactly.
4. If a topology-declared peer lacks coverage and its control ref, live owner head, owner path and current obligation are machine-unambiguous, provision the missing owner coverage automatically and bind it to that exact head.
5. Never create a new system to fill a lane. Never provision or resurrect a retired system.
6. If missing peer coverage is ambiguous, fail closed and preserve a durable blocker rather than inventing ownership.
7. The current active lane set is exactly CORE, LEARNING, BOOK and DOCUMENTS.

## Retired Prose boundary

PROSE has no standalone lane, inherited child execution, repair lane, qualification lane, research task, telemetry ledger, successor task or mutation claim domain.

Historical metadata that labels PROSE active is `STALE_ARCHITECTURE_PENDING_RECONCILIATION` and cannot dispatch. A historical objective name containing PROSE may remain for lineage only when the current executable owner is BOOK and the work is genuinely unfinished Book integration of preserved completed capability.

DOCUMENTS receives no Prose work. Book-owned completed-Prose integration is recorded only as BOOK work.

## Locked work domains

CORE: shared Foundation/Spine, runtime/data/platform/continuity/assurance/A-01 infrastructure and System-Master integration primitives. While `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001` is selected, Programming proving-corpus recovery is the highest discretionary Core/System-Master priority, followed by remaining authorized catalog/archive recovery.

LEARNING: Learning product/runtime/curriculum/mastery/assessment/adaptation/evidence and upward System-Master integration only.

BOOK: Book product, including only genuinely open BOOK-owned adapter/context/compiler/router/orchestrator integration that consumes preserved completed Prose capability evidence, with Book retaining canonical manuscript/Story Bible/author/lifecycle/admission/publication authority.

DOCUMENTS: document/artifact mechanics and upward System-Master integration only. Documents receives no Prose integration, repair, qualification, research or telemetry work.

PROGRAMMING: active software-engineering work program with its own preserved engineering evidence. Before explicit topology admission, Programming product work is outside peer Second Shift mutation lanes.

PROGRAMMING KNOWLEDGE RECOVERY: CORE-administered source/custody/provenance support. It may use owner-valid unattended-safe CORE capacity under the current priority lock but does not become the Programming product or a peer lane.

## Execution state machine

READY -> CLAIMED -> RUNNING -> {COMPLETED | BLOCKED | STALE}
COMPLETED -> RECONCILE -> SUCCESSOR_BOUND -> READY
BLOCKED -> RECONCILE -> {SUCCESSOR_BOUND -> READY | ALL_RUNGS_EXHAUSTED -> IDLE_VALID}
STALE -> RECONCILE -> {SUCCESSOR_BOUND -> READY | ALL_RUNGS_EXHAUSTED -> IDLE_VALID}

Retired systems do not enter this state machine.

## Claim and live-head law

One mutation-capable claim per active peer owner lane. Required claim fields remain: lease_id, lane, delegation_id, objective_id, control_ref, control_head_at_claim, idempotency_key, claimed_at, lease_expires_at, last_heartbeat_at, attempt and checkpoint_pointer.

Changed live owner head invalidates mutation until revalidation. PROSE has no claim or inherited claim. Programming has no peer claim domain before topology admission. A CORE claim for Knowledge Recovery authorizes only bounded custody/provenance work.

Until foreground/Second-Shift arbitration is fully machine-admitted, any detected concurrent mutation attempt fails closed, re-reads the live head and adopts/reconciles valid existing progress rather than overwriting it.

## Dispatch and successor law

- Dispatch only dependency-valid work inside the active lane's locked job.
- Repair/control health and exact owner integrity are non-discretionary gates.
- A blocker in one peer lane does not block independent safe work in another.
- After completion or material block, preserve evidence, re-read live authority and bind the next successor inside the same active lane.
- Never bind a Prose successor.
- A lane is IDLE only after durable all-eight-rungs exhaustion for its own job.
- While Knowledge Recovery 001 remains selected, CORE chooses Programming proving-corpus recovery before other discretionary System Master work, then remaining authorized catalog/archive recovery.

## Retry / idempotency / quarantine

Assume at-least-once invocation. State-changing effects require durable idempotency/deduplication. Failures are classified before finite retry/backoff. Exhausted transient dependencies circuit-open for that invocation and the worker selects independent safe work inside the same authorized job. Poison work is quarantined/dead-lettered.

## Mandatory work-ahead ladder

1. repair/control health
2. completion and evidence census
3. authoritative research and provenance
4. architecture/contracts/state/interface/evidence specification
5. tests/benchmarks/property/concurrency/failure injection
6. bounded implementation with objective verification
7. exact-SHA qualification and A-01 preparation
8. successor build packet

## Utilization and handoff

Active peer ledgers are CORE, LEARNING, BOOK and DOCUMENTS only. No new Prose telemetry is created or expected. Book-owned integration involving preserved completed Prose capability is BOOK telemetry. Programming product work has no peer utilization ledger before admission; Knowledge Recovery support is CORE telemetry.

Telemetry is factual. If ledger evidence is missing, stale or contradictory, report UNKNOWN rather than infer activity from commits, runner uptime or workflow duration.

## Safe stopping

Safe truthful stopping is preferable to authority violation. Preserve exact evidence and blockers; never synthesize system completion, peer admission, PASS, author/private/native/external/publication/production authority or retired-system resurrection.
