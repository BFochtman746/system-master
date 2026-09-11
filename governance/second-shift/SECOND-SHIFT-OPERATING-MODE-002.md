# SECOND-SHIFT-OPERATING-MODE-002

Status: **ACTIVE / OWNER-DRIVEN / REGISTRY-DRIVEN / STALE-FAIL-CLOSED / REPAIR-AWARE / TOPOLOGY-004-RECONCILED**
Product root: `SYSTEM_MASTER`

## Core rule

Second Shift does not own a backlog. Each active owner lane declared by `governance/second-shift/SECOND-SHIFT-REGISTRY-001.json::owner_files` owns a live delegation list and applicable repair inbox. Controllers/workers enumerate the registry; historical standalone lanes are provenance only.

Current active peer worker lanes:

- `SYSTEM_MASTER/CORE` -> `CORE-DELEGATIONS.json`
- `SYSTEM_MASTER/LEARNING` -> `LEARNING-DELEGATIONS.json`
- `SYSTEM_MASTER/BOOK` -> `BOOK-DELEGATIONS.json`
- `SYSTEM_MASTER/DOCUMENTS` -> `DOCUMENTS-DELEGATIONS.json`

`SYSTEM_MASTER/BOOK/PROSE` is an active child specialist of BOOK. It inherits BOOK scheduling, claim and telemetry rather than receiving a separate Prose owner lane. The historical standalone Prose lane remains retired evidence only.

DOCUMENTS is a first-class peer system that owns document/artifact mechanics and generic document services. BOOK owns canonical Book state and the Prose literary-specialist child. Documents does not own Book-specific Prose craft/evaluation/revision authority and cannot write canonical Book state.

## Day-shift lifecycle

Whenever an active owner materially changes its current objective:

1. resolve live owner control;
2. inspect current repair state;
3. inspect the registry-declared delegation;
4. retire completed/superseded/stale work while preserving history;
5. reconcile current obligation/evidence state;
6. select the highest-value dependency-valid unattended-safe successor when one exists;
7. bind it to the exact live owner head;
8. leave empty only with a valid all-eight-rungs exhaustion proof.

For Book, objective movement by Book or its Prose child must reconcile `BOOK-DELEGATIONS.json` in the same working session. A separate standalone Prose delegation is stale execution topology, not an active child requirement.

## Repair precedence

Current repairable subject failures normally outrank unrelated speculative build-ahead when they remain relevant. Repair ownership comes from current topology/repair registry. Historical standalone Prose failures do not create a separate Prose lane; a still-current Book-Prose repair routes through BOOK. Changed bytes require a new exact SHA and deterministic qualification before any higher-gate claim.

## Portfolio preparation and execution

Before and during the shift, the portfolio controller:

1. reads CURRENT-AUTHORITY and its selected topology/current obligation registry;
2. enumerates active owner files from the Second Shift registry;
3. resolves each live owner head;
4. checks current repair/delegation/claim state and System State Reconciler standing;
5. rejects stale delegation/control/objective bindings;
6. admits current READY work or selects a successor through the mandatory work-ahead ladder;
7. routes active child paths through the registry coverage map rather than creating another worker lane;
8. leaves an active lane empty only with a durable exhaustion proof.

Each worker repeats owner/head/objective/dependency checks immediately before execution. Completion or material block is followed by evidence preservation, delegation retirement/reconciliation and successor selection while shift time remains.

## Mandatory work-ahead ladder

1. current repair/control health;
2. completion/evidence census and capability matrix;
3. authoritative research and provenance;
4. architecture/contracts/state/interface/evidence specification;
5. tests/benchmarks/property/concurrency/failure injection;
6. bounded implementation with objective verification;
7. exact-SHA qualification and A-01 preparation;
8. next successor build packet.

A blocker at one rung blocks only dependent work. An active owner may be IDLE only after all eight rungs are durably exhausted with exact evidence/blockers and `independent_work_remaining=false`.

## Book / Prose / Documents rule

- Active Book-specific literary diagnosis, evaluation, craft, controlled revision, preservation, voice and homogenization work belongs to the Book child path `SYSTEM_MASTER/BOOK/PROSE` and executes through BOOK.
- Historical Prose exact-SHA, blind/private/author and qualification evidence remains historical evidence and is never relabeled or generalized.
- Changed Book-Prose integration bytes receive fresh qualification.
- No worker/controller may create a separate PROSE peer lane, independent Prose mutation claim or Prose utilization ledger.
- Documents remains the owner of document/artifact mechanics, not Book-specific literary-specialist authority.
- Book remains the sole canonical manuscript owner; Prose candidates/evidence cannot self-admit.

## Claim, retry and telemetry rules

Only one mutation-capable claim may be live per active lane. Book child Prose execution shares the BOOK claim. At-least-once delivery requires idempotency. Transient retries are finite and classified; exhausted dependencies circuit-open and independent work is selected when possible.

Until cross-mode foreground/Second-Shift arbitration is admitted, any detected concurrent mutation attempt against the same owner lane must fail closed, re-read the live owner head, and adopt/reconcile already-written valid work rather than overwrite it.

Active lane telemetry is written only for registry lanes `CORE`, `LEARNING`, `BOOK`, and `DOCUMENTS`. Prose child activity belongs in BOOK telemetry. Commit spacing, workflow duration or runner uptime never substitute for factual shift events.

## Failure classification

- SUBJECT_FAILURE -> current active product owner repair route;
- infrastructure/control-plane -> shared CORE/A-01 route;
- human/author/private/native/external/publication/production -> truthful authority boundary;
- changed head/objective -> stale delegation;
- separate Prose peer/lane route -> `RETIRED_PROSE_PEER_LANE_STALE_WORK`, preserve history and route active child work through BOOK;
- unknown -> fail closed until classified.

## Morning handoff

Report current product hierarchy and active execution owners:

1. SYSTEM_MASTER product-root governance;
2. CORE;
3. LEARNING;
4. BOOK, including active child `BOOK/PROSE`;
5. DOCUMENTS;
6. shared infrastructure/control.

PROSE is reported as an active Book child specialist but never as a separate peer worker lane. Historical standalone Prose retirement remains provenance when relevant.
