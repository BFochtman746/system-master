# SYSTEM-STATE-RECONCILER-001

Status: ACTIVE IMPLEMENTATION CONTRACT / TOPOLOGY-004 / PROGRAM-JOB-LOCKED
Repository: BFochtman746/system-master

## Purpose

Provide one deterministic repository-native truth compiler that continuously checks whether System Master's current authority, program jobs, product-level completion truth, topology, owner controls, completion history, open obligations, expectations, reallocations, Second Shift delegations and A-01/repair state agree.

This reconciler does not create authority. It validates and projects authority already present in repository records.

## Canonical input selection

Always begin with `governance/CURRENT-AUTHORITY.json` from current `main`. Then load the records it selects rather than hard-coding superseded versions.

Current required authority classes are:

- topology — currently `governance/SYSTEM-TOPOLOGY-004.json`;
- program job lock — `governance/SYSTEM-PROGRAM-JOB-LOCK-001.json`;
- system completion status — `governance/SYSTEM-COMPLETION-STATUS-001.json`;
- current completion interpretation — currently `governance/COMPLETION-LEDGER-002.json`, with the prior ledger retained as historical boundary evidence;
- current obligation registry — currently `governance/WORK-OBLIGATION-REGISTRY-008.json`;
- current expectation registry — currently `governance/EXPECTATION-REGISTRY-004.json`;
- current reallocation ledger — currently `governance/REALLOCATION-LEDGER-003.json`;
- current Second Shift registry and its registry-declared owner files;
- current repair/A-01 registries selected by CURRENT-AUTHORITY;
- active census/checkpoint selected by CURRENT-AUTHORITY when present;
- live Git refs for main, CORE, LEARNING, BOOK and DOCUMENTS when available;
- `literary-prose-engine-001` only as the completed Book child specialist control when Book-Prose integration requires it, never as a separate peer owner lane.

## Current completion invariant

PROSE is the only complete system.

SYSTEM_MASTER, CORE, LEARNING, BOOK and DOCUMENTS are incomplete and active. Packet, phase, subsystem, branch, hosted-test or A-01 completion may remain valid evidence without becoming whole-system completion.

## Locked job invariants

1. SYSTEM_MASTER coordinates integration of CORE, LEARNING, BOOK and DOCUMENTS without taking peer product semantics.
2. CORE owns shared Foundation/Spine/runtime/data/platform/continuity/assurance/A-01 and integration infrastructure.
3. LEARNING finishes Learning and integrates upward into System Master; it does not take Book, Prose or Documents work.
4. BOOK finishes Book, including integration of completed PROSE through adapters and the Book Workflow Orchestrator, then integrates Book upward into System Master.
5. PROSE is complete at `SYSTEM_MASTER/BOOK/PROSE`, executes through BOOK, and has zero canonical manuscript-write authority and no separate peer/Second Shift lane.
6. DOCUMENTS finishes document/artifact mechanics and integrates upward into System Master; it must not absorb Prose or take Book literary/canonical authority.
7. Book <-> Prose is the only direct specialist parent/child exception. Other cross-system dependencies use explicit interfaces without ownership transfer.
8. Knowledge Recovery/Programming is supporting CORE work and cannot redefine peer jobs or product completion.

## Required outputs

1. `DERIVED-CURRENT-STATE.json`
2. `SYSTEM-STATE-DRIFT-REPORT.json`
3. deterministic process exit status

The derived projection is disposable and reproducible. Source ledgers/receipts remain authority.

## Truth classes

- `AUTHORITY_CURRENT`
- `AUTHORITY_DELTA`
- `JOB_LANE_VIOLATION`
- `FALSE_SYSTEM_COMPLETION`
- `PROSE_SCOPE_REOPEN`
- `STALE_DELEGATION`
- `EVIDENCE_MISMATCH`
- `UNALLOCATED`
- `REGISTERED_EXECUTABLE_MISSING`
- `DUPLICATE_ID`
- `BROKEN_REFERENCE`

## Minimum invariants

1. Product root is SYSTEM_MASTER.
2. Active peer systems are CORE, LEARNING, BOOK and DOCUMENTS; PROSE is the completed Book child at `SYSTEM_MASTER/BOOK/PROSE`.
3. Only PROSE is whole-system complete under the current completion record.
4. Every non-closed obligation has one valid current owner path and remains inside that owner's program-job lock.
5. Every completion/evidence record preserves its exact boundary; historical packet completion cannot promote whole-system completion.
6. Completion and obligation IDs are unique inside their registries.
7. Second Shift active owner files are CORE, LEARNING, BOOK and DOCUMENTS; Prose child coverage routes through BOOK.
8. Active delegations satisfy the delegation schema, current job lock, current obligation registry and exact control-head binding.
9. Documents current work cannot absorb/own Prose; Learning cannot take Book/Prose/Documents product work; Core cannot take peer product semantics.
10. A Book-Prose integration obligation remains Book-owned and preserves Book canonical manuscript/Story Bible/author/lifecycle/admission authority.
11. When live owner heads are available, an active delegation bound to another head is `STALE_DELEGATION`.
12. A-01 workstream routing follows the topology selected by CURRENT-AUTHORITY, never a hard-coded prior topology version.
13. Every repository-owned executable registered in A-01 exists at its registered path.
14. Human, author, private-data, external-authority, native-platform, publication and production boundaries are never broadened by reconciliation.

## Cross-manager enforcement

The System State Reconciler must treat the program-job-lock gate, current-obligation enforcement and Second Shift owner/claim enforcement as prerequisite consistency checks. If any of those fail semantically, reconciliation is not green.

A GitHub job with `runner_id: 0` and zero executed steps is infrastructure-not-executed evidence, not a semantic PASS or FAIL of these invariants.

## Closed-loop repair integration

Before an automated repair attempt is admitted, the reconciler must confirm owner/workstream, exact failed subject identity, repair eligibility, attempt budget, replacement exact SHA where changed, required prequalification, preserved lineage and current job-lane authority.

Book/Prose repair work routes through BOOK. Documents and Learning repairs stay in their own product lanes. Shared infrastructure/A-01 repairs route according to current Core/shared-infrastructure authority.

The repair worker may prepare a replacement candidate but can never grant A-01 PASS, whole-system completion, canonical Book mutation, publication or production authority.

## CI behavior

Reconciliation must serialize under one concurrency group. Expected live-head movement is a delta requiring revalidation. Structural contradictions, job-lane violations, false completion claims, stale active delegations, unmapped ownership and missing registered executables are failures.

## End state

A green reconciliation means current authority, locked jobs, completion truth, owner/delegation routing and evidence boundaries agree for the exact repository state checked. It does not claim that any incomplete product system is finished or that unavailable human/private/native/external authority has been satisfied.
