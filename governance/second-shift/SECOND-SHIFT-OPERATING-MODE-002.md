# SECOND-SHIFT-OPERATING-MODE-002

Status: **ACTIVE / OWNER-DRIVEN / REGISTRY-DRIVEN / STALE-FAIL-CLOSED / REPAIR-AWARE / CURRENT-AUTHORITY-005 / TOPOLOGY-007**
Product root: `SYSTEM_MASTER`

## Core rule

Second Shift does not own a backlog. Each execution-ready peer lane declared by the selected topology and `governance/second-shift/SECOND-SHIFT-REGISTRY-001.json::owner_files` owns its current delegation list and applicable repair inbox. Controllers/workers resolve CURRENT-AUTHORITY on every run and require exact agreement among topology execution readiness, registry owner files, telemetry lanes and execution control.

Current execution-ready peer worker lanes are exactly:

- `SYSTEM_MASTER/CORE`
- `SYSTEM_MASTER/LEARNING`
- `SYSTEM_MASTER/BOOK`
- `SYSTEM_MASTER/DOCUMENTS`
- `SYSTEM_MASTER/SPREADSHEET_DATA`
- `SYSTEM_MASTER/MEDIA`
- `SYSTEM_MASTER/CONNECTED_ACTIONS`
- `SYSTEM_MASTER/RESEARCH_KNOWLEDGE`
- `SYSTEM_MASTER/PROGRAMMING`

`PROSE` is complete and terminally retired. It has no standalone lane, inherited child execution, repair lane, qualification lane, research task, telemetry lane, successor task or mutation claim domain. Historical Prose records remain immutable provenance only.

`WEBSITE_BUILDING` is C40 under PROGRAMMING and uses PROGRAMMING claim/delegation/telemetry authority. It is not a tenth peer lane.

## Auto-provisioning invariant

At startup and every reconciliation:

1. read CURRENT-AUTHORITY and its selected topology;
2. use the selected topology's `execution_readiness.execution_ready_peer_system_ids` as the unattended peer-lane set;
3. compare that set with Second Shift registry `owner_files`, telemetry allowed lanes and the machine-readable execution-control contract;
4. require exact set equality after any allowed repair;
5. if an already-declared execution-ready peer lacks coverage and its owner path, control ref, live head and current obligation are machine-unambiguous, provision only that missing coverage;
6. never create a new system because a lane is missing;
7. never provision, restore or inherit execution for a retired system;
8. if owner resolution is ambiguous, fail closed and preserve the exact blocker.

Current expected coverage is 9/9: CORE, LEARNING, BOOK, DOCUMENTS, SPREADSHEET_DATA, MEDIA, CONNECTED_ACTIONS, RESEARCH_KNOWLEDGE and PROGRAMMING.

## Day-shift lifecycle

Whenever an active peer owner materially changes its current objective:

1. resolve live owner control;
2. inspect current repair state;
3. inspect the registry-declared delegation;
4. retire completed/superseded/stale work while preserving history;
5. reconcile current obligation/evidence state;
6. select the highest-value dependency-valid unattended-safe successor when one exists;
7. bind it to the exact live owner head;
8. leave empty only with a valid all-eight-rungs exhaustion proof.

Historical objective identifiers may remain for lineage only when current executable ownership is valid and they do not create a retired or unauthorized execution domain.

## Repair precedence

Current repairable subject failures normally outrank unrelated speculative build-ahead when they remain relevant. Repair ownership comes from current topology and repair registry.

There is no active Prose repair route. A current BOOK-owned integration subject consuming preserved completed Prose capability routes to BOOK. Changed bytes require fresh exact-subject evidence; historical Prose PASS does not transfer.

## Portfolio preparation and execution

Before and during the shift, the portfolio controller:

1. reads CURRENT-AUTHORITY, selected topology, program-job lock, system-completion status, current obligation registry and expectation registry;
2. enumerates execution-ready owners from topology and registry and requires exact agreement;
3. resolves each live active-owner head;
4. checks repair, delegation and claim state plus System State Reconciler standing;
5. rejects stale delegation/control/objective bindings, cross-lane work, retired-system resurrection, Website Building peer promotion and overlapping mutation claims;
6. admits current READY work or selects a successor through the mandatory work-ahead ladder;
7. provisions missing coverage only for an already-declared execution-ready peer when machine-resolvable;
8. leaves an active lane empty only with durable exhaustion proof.

Each worker repeats owner/head/objective/dependency checks immediately before mutation. Completion or material block is followed by exact evidence preservation, delegation retirement/reconciliation and successor selection while safe same-lane work remains.

## Priority lock

`FOUNDATION-1-0-CLOSURE-001` remains the central objective. While `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001` is selected, it is the highest discretionary System Master support priority under CORE.

After non-discretionary safety, current-authority integrity and active repair/control obligations, CORE discretionary capacity proceeds through Programming source/custody/provenance recovery and remaining authorized catalog/archive recovery. This priority does not take Programming engineering semantics or block independent work in any other peer lane.

PROGRAMMING product work executes in the PROGRAMMING peer lane from preserved continuity. Knowledge Recovery is support only and does not create a second Programming mutation domain.

## Mandatory work-ahead ladder

1. current repair/control health;
2. completion/evidence census and capability matrix;
3. authoritative research and provenance;
4. architecture/contracts/state/interface/evidence specification;
5. tests/benchmarks/property/concurrency/failure injection;
6. bounded implementation with objective verification;
7. exact-SHA qualification and A-01 preparation;
8. next successor build packet.

A blocker at one rung blocks only dependent work. An active peer may be IDLE only after all eight rungs are durably exhausted with exact evidence/blockers and `independent_work_remaining=false`.

## Ownership rules

- CORE owns shared Foundation/Spine/runtime/platform/continuity/assurance/A-01 and integration infrastructure.
- LEARNING owns Learning semantics.
- BOOK owns canonical Book/manuscript/Story Bible/author/lifecycle/admission/publication semantics and any genuinely open completed-Prose integration.
- DOCUMENTS owns generic document/artifact mechanics and receives no Prose work.
- SPREADSHEET_DATA owns spreadsheet/math/data/ledger semantics.
- MEDIA owns audiobook/image/media/photo/video/voice semantics.
- CONNECTED_ACTIONS owns browser/calendar/comms/plugin action policy; repository readiness does not grant external side effects.
- RESEARCH_KNOWLEDGE owns research/knowledge/geo retrieval and provenance semantics.
- PROGRAMMING owns software-engineering semantics, including AUTOMATION, CODE and WEBSITE_BUILDING C40.
- PROSE is retired and non-dispatchable.

## Claim, retry and telemetry rules

Only one mutation-capable claim may be live per execution-ready peer lane. PROSE has no claim domain. Website Building uses PROGRAMMING's claim domain. At-least-once delivery requires idempotency. Transient retries are finite and classified; exhausted dependencies circuit-open and independent same-lane work is selected when possible.

Active lane telemetry is written only for the nine registry lanes. Knowledge Recovery support is CORE telemetry; Website Building is PROGRAMMING telemetry. Missing telemetry is UNKNOWN and is never inferred from workflow duration, runner uptime or commit spacing.

## Failure classification

- current peer `SUBJECT_FAILURE` -> that peer's repair route;
- current Book integration failure around preserved completed Prose capability -> BOOK repair route;
- infrastructure/control-plane -> shared CORE/A-01 route;
- human/author/private/native/external/publication/production -> truthful authority boundary;
- changed head/objective -> stale delegation;
- active/inherited Prose route -> `RETIRED_SYSTEM_RESURRECTION`;
- Website Building independent-peer route -> `PROGRAMMING_SCOPE_DRIFT`;
- cross-owner work -> `JOB_LANE_VIOLATION`;
- unknown -> fail closed until classified.

## Morning handoff

Report SYSTEM_MASTER product-root governance plus all nine active peer execution owners. PROSE is reported only as complete/retired historical capability provenance. Website Building is reported inside PROGRAMMING, never as a peer. No historical receipt or PASS is relabeled during handoff.
