# SECOND-SHIFT-EXECUTION-CONTROL-001

Status: ACTIVE / TOPOLOGY-006 / EIGHT-PEER / PROGRAM-JOB-LOCKED
Effective date: 2026-09-13
Scope: execution control and observability only. This contract does not transfer product, work-program, canonical-writer, A-01, human, author, private, blind, native, external, publication or production authority.

<!-- SECOND_SHIFT_MACHINE_CONTRACT_START -->
```json
{
  "execution_control_id": "SECOND-SHIFT-EXECUTION-CONTROL-001",
  "revision": 2,
  "topology_id": "SYSTEM-TOPOLOGY-006",
  "registry_id": "SECOND-SHIFT-REGISTRY-001",
  "peer_system_ids": [
    "CORE",
    "LEARNING",
    "BOOK",
    "DOCUMENTS",
    "SPREADSHEET_DATA",
    "MEDIA",
    "CONNECTED_ACTIONS",
    "RESEARCH_KNOWLEDGE"
  ]
}
```
<!-- SECOND_SHIFT_MACHINE_CONTRACT_END -->

## Required authority before dispatch

Every controller/worker reads current `governance/CURRENT-AUTHORITY.json`, its selected topology, `program_job_lock`, `system_completion_status`, current obligation registry, Second Shift registry, repair registries, and every declared execution-ready peer owner file. It re-fetches each live owner head before mutation.

The current execution-ready peer systems are CORE, LEARNING, BOOK, DOCUMENTS, SPREADSHEET_DATA, MEDIA, CONNECTED_ACTIONS and RESEARCH_KNOWLEDGE. PROSE is complete and terminally retired. PROGRAMMING is an incomplete active work program outside the peer topology and therefore is not silently given a peer Second Shift mutation lane.

## Owner discovery and auto-provisioning

1. `CURRENT-AUTHORITY.json::topology` selects the architecture source. The current selected topology is `governance/SYSTEM-TOPOLOGY-006.json`.
2. The selected topology's `execution_readiness.execution_ready_peer_system_ids` is the authoritative unattended peer-lane set.
3. `CURRENT-AUTHORITY.json::second_shift_registry` selects the Second Shift registry. The registry's `owner_files` keys and `auto_provisioning_invariant.expected_active_peers` must match the execution-ready peer set exactly.
4. On every controller and enforcement run, compare those sets and the machine-readable contract above. Any omission, extra lane, stale topology id, stale registry id, or stale execution-control reference fails closed.
5. If a topology-declared execution-ready peer lacks coverage and its control ref, live owner head, owner path and current obligation are machine-unambiguous, provision the missing owner coverage automatically and bind it to that exact head.
6. Never create a new system to fill a lane. Never provision or resurrect a retired system.
7. If missing peer coverage is ambiguous, fail closed and preserve a durable blocker rather than inventing ownership.
8. The current active peer lane set is exactly CORE, LEARNING, BOOK, DOCUMENTS, SPREADSHEET_DATA, MEDIA, CONNECTED_ACTIONS and RESEARCH_KNOWLEDGE.

## Retired Prose boundary

PROSE has no standalone lane, inherited child execution, repair lane, qualification lane, research task, telemetry ledger, successor task or mutation claim domain.

Historical metadata that labels PROSE active is `STALE_ARCHITECTURE_PENDING_RECONCILIATION` and cannot dispatch. A historical objective name containing PROSE may remain for lineage only when the current executable owner is BOOK and the work is genuinely unfinished Book integration of preserved completed capability.

DOCUMENTS receives no Prose work. Book-owned completed-Prose integration is recorded only as BOOK work.

## Locked work domains

CORE: shared Foundation/Spine, runtime/data/platform/continuity/assurance/A-01 infrastructure and System-Master integration primitives. While `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001` is selected, Programming proving-corpus recovery is the highest discretionary Core/System-Master priority, followed by remaining authorized catalog/archive recovery.

LEARNING: Learning product/runtime/curriculum/mastery/assessment/adaptation/evidence and upward System-Master integration only.

BOOK: Book product, including only genuinely open BOOK-owned adapter/context/compiler/router/orchestrator integration that consumes preserved completed Prose capability evidence, with Book retaining canonical manuscript/Story Bible/author/lifecycle/admission/publication authority.

DOCUMENTS: document/artifact mechanics and upward System-Master integration only. Documents receives no Prose integration, repair, qualification, research or telemetry work.

SPREADSHEET_DATA: spreadsheet, math, data and ledger semantics and their admitted upward System-Master interfaces.

MEDIA: audiobook, image, media, photo, video and voice semantics and their admitted upward System-Master interfaces.

CONNECTED_ACTIONS: browser, calendar, communications and plugin integration inside repository-granted execution authority. Repository readiness never grants external side-effect authority; user/external authority gates still apply.

RESEARCH_KNOWLEDGE: research, knowledge and geo semantics and their admitted upward System-Master interfaces.

PROGRAMMING: active software-engineering work program with its own preserved engineering evidence. Programming remains non-peer unless explicit authority admits it; peer Second Shift coverage must not be synthesized for it.

WEBSITE BUILDING: no independent peer lane is admitted by the selected topology. Browser operation belongs to CONNECTED_ACTIONS; website/software construction must remain within explicitly authorized Programming/product work until a separate architecture decision assigns or admits a dedicated capability/lane.

PROGRAMMING KNOWLEDGE RECOVERY: CORE-administered source/custody/provenance support. It may use owner-valid unattended-safe CORE capacity under the current priority lock but does not become the Programming product or a peer lane.

## Execution state machine

READY -> CLAIMED -> RUNNING -> {COMPLETED | BLOCKED | STALE}
COMPLETED -> RECONCILE -> SUCCESSOR_BOUND -> READY
BLOCKED -> RECONCILE -> {SUCCESSOR_BOUND -> READY | ALL_RUNGS_EXHAUSTED -> IDLE_VALID}
STALE -> RECONCILE -> {SUCCESSOR_BOUND -> READY | ALL_RUNGS_EXHAUSTED -> IDLE_VALID}

Retired systems do not enter this state machine.

## Claim and live-head law

One mutation-capable claim per execution-ready peer owner lane. Required claim fields remain: lease_id, lane, delegation_id, objective_id, control_ref, control_head_at_claim, idempotency_key, claimed_at, lease_expires_at, last_heartbeat_at, attempt and checkpoint_pointer.

Changed live owner head invalidates mutation until revalidation. PROSE has no claim or inherited claim. Programming has no peer claim domain before explicit topology admission. A CORE claim for Knowledge Recovery authorizes only bounded custody/provenance work.

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

Active peer ledgers are CORE, LEARNING, BOOK, DOCUMENTS, SPREADSHEET_DATA, MEDIA, CONNECTED_ACTIONS and RESEARCH_KNOWLEDGE only. No new Prose telemetry is created or expected. Book-owned integration involving preserved completed Prose capability is BOOK telemetry. Programming product work has no peer utilization ledger before explicit admission; Knowledge Recovery support is CORE telemetry.

Telemetry is factual. If ledger evidence is missing, stale or contradictory, report UNKNOWN rather than infer activity from commits, runner uptime or workflow duration.

## Eight-lane qualification requirement

The Second Shift enforcement workflow must execute a deterministic, side-effect-free qualification against the repository's actual supervisor claim/dispatch state machine for every current execution-ready peer lane. Qualification must demonstrate lane registration, READY binding, fenced claim, dispatch acknowledgement, heartbeat authority and terminal completion for each lane, and must preserve a machine-readable report. Any omitted lane, extra lane, invariant violation or execution failure blocks Second Shift certification.

This qualification proves repository execution-control mechanics only. It does not synthesize external provider authority, native-device evidence, production publication authority or permission for CONNECTED_ACTIONS side effects.

## Safe stopping

Safe truthful stopping is preferable to authority violation. Preserve exact evidence and blockers; never synthesize system completion, peer admission, PASS, author/private/native/external/publication/production authority or retired-system resurrection.
