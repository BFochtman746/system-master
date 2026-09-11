# MORNING-CANONICAL-RECONCILIATION-001

Status: PROPOSED_FOR_ADMISSION / TOPOLOGY-004-RECONCILED
Owner: SYSTEM_MASTER product-root governance
Schedule target: 07:15 America/New_York after Second Shift closes at 07:00
Purpose: reconcile overnight execution into live canonical owner state and publish one deterministic chat-start manifest for the new day.

## Core rule

Second Shift does not become a second source of truth. CURRENT-AUTHORITY, its selected topology, active owner controls, completion evidence and the current obligation registry remain authoritative.

## Required read set

1. current `main` and `governance/CURRENT-AUTHORITY.json`;
2. topology selected by CURRENT-AUTHORITY, currently `SYSTEM-TOPOLOGY-004.json`;
3. checkpoint, completion ledger and obligation registry selected by CURRENT-AUTHORITY;
4. expectation/reallocation and repair state;
5. Second Shift registry, every active owner file declared by `owner_files`, and corresponding event ledger;
6. live/current controls for CORE, LEARNING, BOOK and DOCUMENTS;
7. live Prose specialist control `literary-prose-engine-001` when Book-Prose work is active, plus the historical Prose retirement record as preserved provenance;
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

Active peer/system owner lanes are CORE, LEARNING, BOOK and DOCUMENTS. PROSE is an active Book child specialist at `SYSTEM_MASTER/BOOK/PROSE` and inherits the BOOK lane. A separate standalone Prose lane is stale topology and must not dispatch.

BOOK and DOCUMENTS are peers. BOOK owns canonical Book/manuscript/lifecycle/author state, Book admission and the Prose literary-specialist child. DOCUMENTS owns document/artifact mechanics and generic document services. Neither Documents nor Prose receives canonical Book write authority.

## Morning seal

Publish one append-only daily manifest at `governance/morning/daily/YYYY-MM-DD/DAILY-CHAT-BOOTSTRAP.json` and update `governance/morning/LATEST-BOOTSTRAP-POINTER.json`.

The manifest is a fast-start cache and reconciliation receipt, not authority over later repository movement.

## Required chat packets

The manifest contains four user-facing owner roles:

- MASTER_ROOT — SYSTEM_MASTER product-root controller;
- LEARNING — SYSTEM_MASTER/LEARNING;
- BOOK — SYSTEM_MASTER/BOOK, including active child `SYSTEM_MASTER/BOOK/PROSE` when relevant;
- DOCUMENTS — SYSTEM_MASTER/DOCUMENTS.

PROSE does not receive a separate peer owner packet. A Prose-focused start opens the BOOK role at the Prose child boundary.

Each packet must contain source/reconciliation SHAs, current owner control/head/state, objective, overnight deltas, completed predecessors, current obligations/blockers, active repairs, current Second Shift standing, qualification/evidence standing, where_we_are, where_we_are_going, exact next_step_contract and chat_ready standing.

MASTER_ROOT includes summaries of all active owners and product-root sequencing but does not own a separate Second Shift worker lane. BOOK includes its active Prose child integration standing; DOCUMENTS includes document/artifact standing.

## Chat-ready gate

A packet may be CHAT_READY only when owner/topology resolve, live owner control was checked, current objective comes from current owner state/obligations, overnight delta is reconciled/classified, repair/delegation state is current, no evidence mismatch is hidden, and the next step is dependency-valid or its exact blocking decision is identified.

A separate Prose peer lane/delegation is a readiness defect. Book-owned Prose child work is valid when it routes through BOOK and preserves zero Prose canonical-write authority.

## New-chat execution rule

Supported short starts include System Master, Learning, Book, Prose and Documents. `Start today's Prose chat.` is a compatibility focus command that opens BOOK at `SYSTEM_MASTER/BOOK/PROSE`; it never creates a separate Prose peer or mutation lane.

## Final safeguard

Prefer truthful NOT_READY over fabricated certainty. Never transfer historical Prose/Document PASS into changed Book-Prose integration bytes and never synthesize human/author/private/native/external/publication/production authority.
