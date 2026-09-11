# MORNING-CANONICAL-RECONCILIATION-001

Status: ACTIVE / TOPOLOGY-004 / PROGRAM-JOB-LOCKED
Owner: SYSTEM_MASTER product-root governance
Schedule target: 07:15 America/New_York after Second Shift closes at 07:00
Purpose: reconcile overnight execution into live canonical owner state and publish one deterministic chat-start manifest for the new day.

## Core rule

Second Shift does not become a second source of truth. `CURRENT-AUTHORITY`, its selected topology, `SYSTEM-PROGRAM-JOB-LOCK-001`, `SYSTEM-COMPLETION-STATUS-001`, live owner controls, exact completion evidence and the current obligation registry remain authoritative.

PROSE is the only system currently complete. SYSTEM_MASTER, CORE, LEARNING, BOOK and DOCUMENTS remain incomplete until future explicit product-level completion authority says otherwise.

## Required read set

1. current `main` and `governance/CURRENT-AUTHORITY.json`;
2. `program_job_lock` and `system_completion_status` selected by CURRENT-AUTHORITY;
3. selected topology, obligation registry and expectation registry;
4. completion ledger, repair/reallocation state and current product-root integration objective;
5. Second Shift registry, every active owner file and corresponding event ledger;
6. live/current controls for CORE, LEARNING, BOOK and DOCUMENTS;
7. live Prose control `literary-prose-engine-001` when Book-Prose integration is active;
8. overnight branches/runs/receipts/evidence referenced by active ledgers.

## Reconciliation transaction

For each active peer lane:

1. resolve the exact live owner control head;
2. verify the delegation/objective conforms to the program job lock and completion status;
3. classify overnight result as ALREADY_CANONICAL, ADMISSIBLE_DELTA, CANDIDATE_ONLY, BLOCKED_HIGHER_AUTHORITY, SUPERSEDED, STALE, REWORK_REQUIRED or INVALID;
4. preserve exact historical evidence; never rewrite old receipts or transfer PASS;
5. reject cross-lane product work and false system-completion claims;
6. admit only deltas allowed by current owner/canonical-writer rules;
7. update completion/obligation/repair/delegation state only when evidence supports it;
8. bind the next dependency-valid successor inside the same locked system job;
9. re-resolve live owner state after mutation.

## Locked lane jobs

CORE: finish shared Foundation/Spine and System Master integration primitives; do not take peer-system product semantics.

LEARNING: finish Learning and integrate it upward into System Master; do not cross into Book/Prose/Documents work.

BOOK: finish Book, including bringing the completed Prose child in through adapters and the Book Workflow Orchestrator, then integrate Book upward into System Master while preserving Book canonical authority.

PROSE: complete system, active Book child specialist for integration only. It has no independent peer/Second Shift lane and no canonical manuscript-write/admission/author/publication authority.

DOCUMENTS: finish Documents and integrate it upward into System Master. Do not absorb Prose or take Book-specific literary authority.

Programming/Knowledge Recovery: supporting CORE work only; it must not override the System Master integration priority or block independent peer-lane progress.

## Morning seal

Publish one append-only daily manifest at `governance/morning/daily/YYYY-MM-DD/DAILY-CHAT-BOOTSTRAP.json` and update `governance/morning/LATEST-BOOTSTRAP-POINTER.json`.

The manifest is a fast-start cache and reconciliation receipt, not authority over later repository movement.

## Required chat packets

- MASTER_ROOT — SYSTEM_MASTER product-root integration controller;
- LEARNING — SYSTEM_MASTER/LEARNING;
- BOOK — SYSTEM_MASTER/BOOK, including completed child `SYSTEM_MASTER/BOOK/PROSE` integration state;
- DOCUMENTS — SYSTEM_MASTER/DOCUMENTS.

PROSE does not receive a separate peer owner packet. A Prose-focused start opens BOOK at the Prose child boundary.

Each packet must include: live control/head, system completion standing, locked job, current objective, overnight delta, completed predecessors, obligations/blockers, repair state, Second Shift standing, qualification/evidence standing, where_we_are, where_we_are_going and one exact next-step contract.

## Chat-ready gate

A packet is CHAT_READY only when:

- current authority/topology resolve;
- job lock and completion status were read;
- live owner head was checked;
- current objective belongs to that owner's locked job;
- overnight delta is reconciled;
- repair/delegation state is current;
- no false completion or cross-lane ownership claim remains;
- the next step is dependency-valid or its exact blocker is identified.

Any current Documents delegation that attempts Prose absorption is NOT_READY/STALE. Any attempt to describe Book, Learning, Documents, Core or System Master as complete is NOT_READY unless the completion-status authority has changed.

## Final safeguard

Prefer truthful NOT_READY over fabricated certainty. Never transfer historical PASS into changed integration bytes, never move product ownership across peer lanes, and never synthesize human/author/private/native/external/publication/production authority.
