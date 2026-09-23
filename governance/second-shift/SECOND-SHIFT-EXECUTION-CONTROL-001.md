# SECOND-SHIFT-EXECUTION-CONTROL-001

Status: ACTIVE / TOPOLOGY-007 / NINE-PEER / PROGRAM-JOB-LOCKED
Effective date: 2026-09-13
Scope: execution control and observability only. This contract does not transfer product, canonical-writer, A-01, human, author, private, native, external, publication or production authority.

<!-- SECOND_SHIFT_MACHINE_CONTRACT_START -->
```json
{
  "execution_control_id": "SECOND-SHIFT-EXECUTION-CONTROL-001",
  "revision": 4,
  "topology_id": "SYSTEM-TOPOLOGY-007",
  "registry_id": "SECOND-SHIFT-REGISTRY-001",
  "peer_system_ids": [
    "CORE",
    "LEARNING",
    "BOOK",
    "DOCUMENTS",
    "SPREADSHEET_DATA",
    "MEDIA",
    "CONNECTED_ACTIONS",
    "RESEARCH_KNOWLEDGE",
    "PROGRAMMING"
  ]
}
```
<!-- SECOND_SHIFT_MACHINE_CONTRACT_END -->

## Required authority before dispatch

Every controller/worker reads current `governance/CURRENT-AUTHORITY.json`, its selected topology, `program_job_lock`, `system_completion_status`, current obligation registry, Second Shift registry, repair registries and every declared execution-ready peer owner file. It re-fetches each live owner head before mutation.

The current execution-ready peer systems are CORE, LEARNING, BOOK, DOCUMENTS, SPREADSHEET_DATA, MEDIA, CONNECTED_ACTIONS, RESEARCH_KNOWLEDGE and PROGRAMMING. PROSE is complete and terminally retired.

## Owner discovery and auto-provisioning

1. `CURRENT-AUTHORITY.json::topology` selects the architecture source. The current selected topology is `governance/SYSTEM-TOPOLOGY-007.json`.
2. The selected topology's `execution_readiness.execution_ready_peer_system_ids` is the authoritative unattended peer-lane set.
3. `CURRENT-AUTHORITY.json::second_shift_registry` selects the Second Shift registry. The registry's `owner_files` keys and `auto_provisioning_invariant.expected_active_peers` must match the execution-ready peer set exactly.
4. On every controller and enforcement run, compare those sets and the machine-readable contract above. Any omission, extra lane, stale topology id, stale registry id or stale execution-control reference fails closed.
5. If an execution-ready peer lacks coverage and its control ref/live owner head/owner path/current obligation are machine-unambiguous, provision missing coverage only for that already-declared peer.
6. Never create a new system merely to fill a lane. Never provision or resurrect a retired system.
7. If coverage is ambiguous, fail closed and preserve a durable blocker.

## Retired Prose boundary

PROSE has no standalone lane, inherited child execution, repair lane, qualification lane, research task, telemetry ledger, successor task or mutation claim domain. Historical metadata that labels PROSE active is stale and non-dispatchable. Any genuinely open integration of preserved completed Prose capability is ordinary BOOK work.

## Locked work domains

CORE: shared Foundation/Spine, runtime/data/platform/continuity/assurance/A-01 infrastructure and System-Master integration primitives. Programming Knowledge Recovery remains Core-administered support.

LEARNING: Learning product/runtime/curriculum/mastery/assessment/adaptation/evidence and upward integration only.

BOOK: canonical Book/manuscript/Story Bible/author/lifecycle/admission/publication semantics plus any genuinely unfinished Book-owned integration of preserved completed Prose capability.

DOCUMENTS: document/artifact mechanics and upward System-Master integration only. Documents receives no Prose work.

SPREADSHEET_DATA: spreadsheet, math, data and ledger semantics.

MEDIA: audiobook, image, media, photo, video and voice semantics.

CONNECTED_ACTIONS: browser, calendar, communications and plugin/action policy. Repository execution readiness never grants external side-effect authority.

RESEARCH_KNOWLEDGE: research, knowledge and geo semantics.

PROGRAMMING: software-engineering semantics from preserved Programming continuity, including Automation, Code and Website Building C40. Programming does not own Core shared runtime/A-01 authority or Connected Actions browser side-effect policy.

WEBSITE BUILDING: C40 under PROGRAMMING. It is not a peer lane. Website construction/build/test/deployment-preparation work dispatches through PROGRAMMING. Browser side effects dispatch only through separately authorized CONNECTED_ACTIONS interfaces.

## Execution state machine

READY -> CLAIMED -> RUNNING -> {VALIDATING | BLOCKED | STALE}
VALIDATING -> {COMPLETED | BLOCKED | STALE}
COMPLETED -> RECONCILE -> SUCCESSOR_BOUND -> READY
BLOCKED -> RECONCILE -> {SUCCESSOR_BOUND -> READY | ALL_RUNGS_EXHAUSTED -> IDLE_VALID}
STALE -> RECONCILE -> {SUCCESSOR_BOUND -> READY | ALL_RUNGS_EXHAUSTED -> IDLE_VALID}

Retired systems do not enter this state machine.

## Claim, evaluation and live-head law

One mutation-capable claim per execution-ready peer owner lane. Changed live owner head invalidates mutation until revalidation. PROSE has no claim domain. Website Building uses the PROGRAMMING claim domain and cannot create a tenth claim domain.

A mutation candidate marked `independent_evaluation_required` cannot enter COMPLETED directly from RUNNING. The worker must hand off an exact candidate digest into durable VALIDATING state; the same lane cannot bind a successor until an independent evaluator records PASS, BLOCKED, REWORK or DRIFT. Authority change or evaluation timeout fences the candidate. Other owner lanes remain independently dispatchable when their own authority and dependencies are valid.

## Dispatch and successor law

- Dispatch only dependency-valid work inside the active lane's locked job.
- Repair/control health and exact owner integrity are non-discretionary gates.
- A blocker in one peer lane does not block independent safe work in another.
- After completion or material block, preserve evidence, re-read live authority and bind the next successor inside the same active lane.
- Never bind a Prose successor.
- A lane is IDLE only after durable all-eight-rungs exhaustion for its own job.

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

Active peer ledgers are CORE, LEARNING, BOOK, DOCUMENTS, SPREADSHEET_DATA, MEDIA, CONNECTED_ACTIONS, RESEARCH_KNOWLEDGE and PROGRAMMING. Programming Website Building work is PROGRAMMING telemetry. Programming Knowledge Recovery support is CORE telemetry. Missing telemetry is UNKNOWN, never inferred.

## Current-lane qualification requirement

Second Shift enforcement must execute a deterministic, side-effect-free qualification against the repository's actual supervisor claim/dispatch state machine for every current execution-ready peer lane. Qualification must demonstrate lane registration, READY binding, fenced claim, dispatch acknowledgement, heartbeat authority and terminal completion for each lane and preserve a machine-readable report. Any omitted lane, extra lane, invariant violation or execution failure blocks Second Shift certification.

This qualification proves repository execution-control mechanics only. It does not synthesize external provider authority, credentials, native-device evidence, production publication authority or permission for CONNECTED_ACTIONS side effects.

## Safe stopping

Safe truthful stopping is preferable to authority violation. Preserve exact evidence and blockers; never synthesize system completion, PASS, author/private/native/external/publication/production authority or retired-system resurrection.
