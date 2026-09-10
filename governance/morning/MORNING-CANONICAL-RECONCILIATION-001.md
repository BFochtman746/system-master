# MORNING-CANONICAL-RECONCILIATION-001

Status: PROPOSED_FOR_ADMISSION
Owner: SYSTEM_MASTER product-root governance
Schedule target: 07:15 America/New_York after Second Shift closes at 07:00
Purpose: reconcile overnight execution into live canonical owner state and publish one deterministic chat-start manifest for the new day.

## Core rule

Second Shift does not become a second source of truth. CURRENT-AUTHORITY, its selected topology, active owner controls, completion evidence and the current obligation registry remain authoritative.

## Required read set

1. current `main` and `governance/CURRENT-AUTHORITY.json`;
2. topology selected by CURRENT-AUTHORITY, currently `SYSTEM-TOPOLOGY-003.json`;
3. checkpoint, completion ledger and obligation registry selected by CURRENT-AUTHORITY;
4. expectation/reallocation and repair state;
5. Second Shift registry, every active owner file declared by `owner_files`, and corresponding event ledger;
6. live/current controls for CORE, LEARNING, BOOK and DOCUMENTS;
7. Prose retirement record as historical-owner guard;
8. recent overnight branches, runs, receipts and exact evidence referenced by the active ledgers.

## Reconciliation transaction

For each active registry-declared lane:

1. resolve live owner control head;
2. classify overnight result as ALREADY_CANONICAL, ADMISSIBLE_DELTA, CANDIDATE_ONLY, BLOCKED_HIGHER_AUTHORITY, SUPERSEDED, STALE, REWORK_REQUIRED or INVALID;
3. preserve exact historical evidence; never rewrite old receipts or transfer PASS;
4. admit only deltas allowed by current owner/canonical-writer rules;
5. update completion/obligation/repair/delegation state only when evidence supports it;
6. reconcile completed/superseded delegation and bind the next unattended-safe successor when appropriate;
7. re-resolve live owner state after canonical mutation;
8. determine the lane's daytime objective and exact next step.

Active peer/system owners are CORE, LEARNING, BOOK and DOCUMENTS. PROSE is completed/retired and has no current lane. If overnight/current data routes work to PROSE, classify it `RETIRED_OWNER_STALE_WORK`, preserve historical evidence, and close/supersede or translate genuinely required work into DOCUMENTS. Do not schedule or publish a Prose packet.

BOOK and DOCUMENTS are peers. BOOK owns canonical Book/manuscript/lifecycle/author state. DOCUMENTS owns document/prose capabilities and may provide results through explicit interfaces without taking Book canonical-write authority.

## Morning seal

Publish one append-only daily manifest at `governance/morning/daily/YYYY-MM-DD/DAILY-CHAT-BOOTSTRAP.json` and update `governance/morning/LATEST-BOOTSTRAP-POINTER.json`.

The manifest is a fast-start cache and reconciliation receipt, not authority over later repository movement.

## Required chat packets

The manifest contains four user-facing roles:

- MASTER_ROOT — SYSTEM_MASTER product-root controller;
- LEARNING — SYSTEM_MASTER/LEARNING;
- BOOK — SYSTEM_MASTER/BOOK;
- DOCUMENTS — SYSTEM_MASTER/DOCUMENTS.

There is no current PROSE packet. A historical Prose start intent redirects to DOCUMENTS and reports the retirement transition.

Each packet must contain source/reconciliation SHAs, current owner control/head/state, objective, overnight deltas, completed predecessors, current obligations/blockers, active repairs, current Second Shift standing, qualification/evidence standing, where_we_are, where_we_are_going, exact next_step_contract and chat_ready standing.

MASTER_ROOT includes summaries of all active owners and product-root sequencing but does not own a separate Second Shift worker lane. DOCUMENTS includes the current Documents admission and Prose-absorption integration standing.

## Chat-ready gate

A packet may be CHAT_READY only when owner/topology resolve, live owner control was checked, current objective comes from current owner state/obligations, overnight delta is reconciled/classified, repair/delegation state is current, no evidence mismatch is hidden, and the next step is dependency-valid or its exact blocking decision is identified.

A current PROSE-owned obligation/delegation/repair/schedule is a readiness defect until reconciled.

## New-chat execution rule

Supported short starts include System Master, Learning, Book and Documents. `Start today's Prose chat.` is a compatibility alias that opens DOCUMENTS at the retired-Prose integration boundary; it never recreates Prose as a system.

## Final safeguard

Prefer truthful NOT_READY over fabricated certainty. Never transfer historical Prose/Document PASS into changed Documents integration bytes and never synthesize human/author/private/native/external/publication/production authority.
