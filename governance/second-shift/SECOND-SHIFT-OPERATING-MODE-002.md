# SECOND-SHIFT-OPERATING-MODE-002

Status: **ACTIVE / OWNER-DRIVEN / REGISTRY-DRIVEN / STALE-FAIL-CLOSED / REPAIR-AWARE**
Product root: `SYSTEM_MASTER`

## Core rule

Second Shift does not own a backlog. Each active owner lane declared by `governance/second-shift/SECOND-SHIFT-REGISTRY-001.json::owner_files` owns a live delegation list and applicable repair inbox. Controllers/workers enumerate the registry; retired lanes are historical evidence only.

Current active lanes:

- `SYSTEM_MASTER/CORE` -> `CORE-DELEGATIONS.json`
- `SYSTEM_MASTER/LEARNING` -> `LEARNING-DELEGATIONS.json`
- `SYSTEM_MASTER/BOOK` -> `BOOK-DELEGATIONS.json`
- `SYSTEM_MASTER/DOCUMENTS` -> `DOCUMENTS-DELEGATIONS.json`

PROSE is completed and retired. The temporary SYSTEM_MASTER root worker lane is also retired. Neither receives new Second Shift execution. Historical files/ledgers remain provenance.

DOCUMENTS is a first-class peer system. Completed Prose capabilities are integrated under Documents and current prose-related work routes to Documents without transferring historical PASS. BOOK and DOCUMENTS are peers: BOOK owns canonical Book state; DOCUMENTS owns document/prose capability implementation.

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

For Documents, objective movement must reconcile `DOCUMENTS-DELEGATIONS.json` in the same working session. A current item pointing to retired PROSE is `RETIRED_OWNER_STALE_WORK`, not executable work.

## Repair precedence

Current repairable subject failures normally outrank unrelated speculative build-ahead when they remain relevant. Repair ownership comes from current topology/repair registry. Historical Prose failures do not reopen Prose; still-required prose/document repair routes to DOCUMENTS. Changed bytes require a new exact SHA and new deterministic prequalification before A-01 requeue.

## Portfolio preparation and execution

Before and during the shift, the portfolio controller:

1. reads CURRENT-AUTHORITY and its selected topology/current obligation registry;
2. enumerates active owner files from the Second Shift registry;
3. resolves each live owner head;
4. checks current repair/delegation/claim state and System State Reconciler standing;
5. rejects stale delegation/control/objective bindings;
6. admits current READY work or selects a successor through the mandatory work-ahead ladder;
7. never schedules a retired lane;
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

## Documents / Prose transition rule

- New current prose/evaluator/craft/diagnostic/revision/preservation work belongs to DOCUMENTS.
- Historical Prose exact-SHA, blind/private/author and qualification evidence remains historical and is never relabeled.
- Changed Documents integration bytes receive fresh qualification.
- No worker/controller may create a new PROSE delegation, repair owner, active obligation, chat role or utilization ledger.
- A historical Prose branch may be inspected as evidence without becoming an active owner.

## Claim, retry and telemetry rules

Only one mutation-capable claim may be live per active lane. At-least-once delivery requires idempotency. Transient retries are finite and classified; exhausted dependencies circuit-open and independent work is selected when possible.

Active lane telemetry is written only for lanes declared by the registry, currently `CORE`, `LEARNING`, `BOOK`, and `DOCUMENTS`. Commit spacing, workflow duration or runner uptime never substitute for factual shift events.

## Failure classification

- SUBJECT_FAILURE -> current active product owner repair route;
- infrastructure/control-plane -> shared CORE/A-01 route;
- human/author/private/native/external/publication/production -> truthful authority boundary;
- changed head/objective -> stale delegation;
- retired Prose route -> `RETIRED_OWNER_STALE_WORK`, preserve history and route current work to DOCUMENTS or close/supersede it;
- unknown -> fail closed until classified.

## Morning handoff

Report current product hierarchy and active execution owners:

1. SYSTEM_MASTER product-root governance;
2. CORE;
3. LEARNING;
4. BOOK;
5. DOCUMENTS;
6. shared infrastructure/control.

PROSE is reported only as retired historical provenance when relevant to Documents integration, never as an active lane.
