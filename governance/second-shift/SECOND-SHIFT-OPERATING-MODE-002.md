# SECOND-SHIFT-OPERATING-MODE-002

Status: **ACTIVE / OWNER-DRIVEN / REGISTRY-DRIVEN / STALE-FAIL-CLOSED / REPAIR-AWARE / TOPOLOGY-005-RECONCILED**
Product root: `SYSTEM_MASTER`

## Core rule

Second Shift does not own a backlog. Each active peer lane declared by `governance/second-shift/SECOND-SHIFT-REGISTRY-001.json::owner_files` owns its current delegation list and applicable repair inbox. Controllers/workers enumerate that registry and compare it with the peer set selected by CURRENT-AUTHORITY topology on every run.

Current active peer worker lanes are exactly:

- `SYSTEM_MASTER/CORE` -> `CORE-DELEGATIONS.json`
- `SYSTEM_MASTER/LEARNING` -> `LEARNING-DELEGATIONS.json`
- `SYSTEM_MASTER/BOOK` -> `BOOK-DELEGATIONS.json`
- `SYSTEM_MASTER/DOCUMENTS` -> `DOCUMENTS-DELEGATIONS.json`

`PROSE` is complete and terminally retired. It has no standalone lane, inherited child execution, repair lane, qualification lane, research task, telemetry lane, successor task or mutation claim domain. Historical Prose records remain immutable provenance only.

Any genuinely unfinished integration of preserved completed Prose capability is ordinary BOOK-owned work. `DOCUMENTS` receives no Prose work.

## Auto-provisioning invariant

At startup and every reconciliation:

1. read CURRENT-AUTHORITY and its selected topology;
2. compare topology `peer_system_ids` with Second Shift registry `owner_files`;
3. require exact set equality after any allowed repair;
4. if an already-declared active peer lacks coverage and its canonical owner path, control ref, live control head and current obligation are machine-unambiguous, provision that missing owner coverage automatically;
5. never create a new system because a lane is missing;
6. never provision, restore or inherit execution for a retired system;
7. if owner resolution is ambiguous, fail closed and preserve the exact blocker.

Current coverage is 4/4: CORE, LEARNING, BOOK and DOCUMENTS. No Prose coverage is expected.

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

A historical objective identifier containing `PROSE` may remain for lineage only when its executable owner is BOOK and it does not create a Prose execution domain.

## Repair precedence

Current repairable subject failures normally outrank unrelated speculative build-ahead when they remain relevant. Repair ownership comes from current topology and repair registry.

There is no active Prose repair route. If a current Book-owned integration subject consuming preserved completed Prose capability fails, that defect is a BOOK integration defect and routes to BOOK. Historical Prose failures remain historical evidence unless explicit future user authority reopens Prose product scope.

Changed bytes require a new exact SHA and deterministic qualification before any higher-gate claim.

## Portfolio preparation and execution

Before and during the shift, the portfolio controller:

1. reads CURRENT-AUTHORITY, selected topology, program-job lock, system-completion status, current obligation registry and expectation registry;
2. enumerates active owner files from the Second Shift registry and compares them with topology peers;
3. resolves each live active-owner head;
4. checks repair, delegation and claim state plus System State Reconciler standing;
5. rejects stale delegation/control/objective bindings, cross-lane product work, retired-system resurrection and overlapping mutation claims;
6. admits current READY work or selects a successor through the mandatory work-ahead ladder;
7. provisions missing coverage only for an already-declared peer when machine-resolvable;
8. leaves an active lane empty only with durable exhaustion proof.

Each worker repeats owner/head/objective/dependency checks immediately before mutation. Completion or material block is followed by exact evidence preservation, delegation retirement/reconciliation and successor selection while safe same-lane work remains.

## Priority lock

While `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001` is selected by CURRENT-AUTHORITY, it is the highest discretionary System Master priority.

After non-discretionary safety, current-authority integrity and active repair/control obligations, CORE discretionary capacity proceeds in this order:

1. Programming proving-corpus source/custody/provenance recovery;
2. remaining authorized catalog/archive recovery;
3. lower-priority discretionary Core work.

This priority does not create a Programming peer lane, transfer Programming engineering semantics to CORE or block independent LEARNING, BOOK or DOCUMENTS work.

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

## Book / retired Prose / Documents rule

- PROSE is complete and terminally retired; there is no active Prose product work.
- Historical Prose exact-SHA, blind/private/author and qualification evidence remains historical evidence and is never relabeled or generalized.
- Any genuinely open integration of preserved completed Prose capability is BOOK-owned adapter/context/compiler/routing/orchestrator work.
- Changed Book integration bytes receive fresh Book-owned qualification; historical Prose PASS does not transfer.
- No worker/controller may create a Prose lane, inherited Book child claim, Prose utilization ledger, repair lane, qualification lane, research task or successor.
- DOCUMENTS owns generic document/artifact mechanics and services and receives no Prose work.
- BOOK remains sole canonical manuscript/Story-Bible/author/lifecycle/admission/publication owner.

## Claim, retry and telemetry rules

Only one mutation-capable claim may be live per active peer lane. PROSE has no claim domain. At-least-once delivery requires idempotency. Transient retries are finite and classified; exhausted dependencies circuit-open and independent same-lane work is selected when possible.

Until cross-mode foreground/Second-Shift arbitration is fully admitted, any detected concurrent mutation attempt against the same active owner lane fails closed, re-reads the live owner head and adopts/reconciles valid already-written progress rather than overwriting it.

Active lane telemetry is written only for registry lanes `CORE`, `LEARNING`, `BOOK` and `DOCUMENTS`. No new Prose telemetry is created or expected. Book-owned integration that consumes preserved completed Prose capability is BOOK telemetry. Commit spacing, workflow duration or runner uptime never substitute for factual shift events; missing telemetry is UNKNOWN.

## Failure classification

- current peer `SUBJECT_FAILURE` -> that peer's repair route;
- current Book integration failure around preserved completed Prose capability -> BOOK repair route;
- infrastructure/control-plane -> shared CORE/A-01 route;
- human/author/private/native/external/publication/production -> truthful authority boundary;
- changed head/objective -> stale delegation;
- active or inherited Prose route -> `RETIRED_SYSTEM_RESURRECTION`, preserve history and do not dispatch;
- Documents receiving Prose work -> `JOB_LANE_VIOLATION`;
- unknown -> fail closed until classified.

## Morning handoff

Report current product hierarchy and active execution owners:

1. SYSTEM_MASTER product-root governance;
2. CORE;
3. LEARNING;
4. BOOK;
5. DOCUMENTS;
6. shared infrastructure/control;
7. PROGRAMMING as a named active non-peer work program when relevant.

PROSE is reported only as complete/retired historical capability provenance. No Prose owner packet, execution lane, telemetry expectation or successor is emitted.
