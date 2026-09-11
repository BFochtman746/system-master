# SYSTEM-STATE-RECONCILER-001

Status: ACTIVE IMPLEMENTATION CONTRACT / TOPOLOGY-005 / PROGRAM-JOB-LOCKED
Repository: BFochtman746/system-master

## Purpose

Provide one deterministic repository-native truth compiler that checks whether System Master's current authority, program jobs, product-level completion truth, topology, owner controls, completion history, open obligations, expectations, reallocations, Second Shift delegations, repair state and A-01 evidence agree.

This reconciler does not create authority. It validates and projects authority already present in repository records.

## Canonical input selection

Always begin with `governance/CURRENT-AUTHORITY.json` from current `main`. Then load the records it selects rather than hard-coding superseded versions.

Current required authority classes are:

- selected topology — currently `governance/SYSTEM-TOPOLOGY-005.json`;
- program job lock — `governance/SYSTEM-PROGRAM-JOB-LOCK-001.json`;
- system completion status — `governance/SYSTEM-COMPLETION-STATUS-001.json`;
- current completion interpretation — currently `governance/COMPLETION-LEDGER-003.json`, with prior ledgers retained as historical boundary evidence;
- current obligation registry — currently `governance/WORK-OBLIGATION-REGISTRY-009.json`;
- current expectation registry — currently `governance/EXPECTATION-REGISTRY-005.json`;
- current reallocation ledger — currently `governance/REALLOCATION-LEDGER-004.json`;
- current Second Shift registry and every registry-declared active peer owner file;
- current repair/A-01 registries selected by CURRENT-AUTHORITY;
- active census/checkpoint selected by CURRENT-AUTHORITY when present;
- live Git refs for main, CORE, LEARNING, BOOK and DOCUMENTS when available;
- historical `literary-prose-engine-001` only as immutable completed-Prose provenance when Book integration/history requires it, never as a live owner control.

## Current completion invariant

SYSTEM_MASTER, CORE, LEARNING, BOOK and DOCUMENTS are active and incomplete. Packet, phase, subsystem, branch, hosted-test or A-01 completion may remain valid evidence without becoming whole-system completion.

PROSE is historically complete and terminally retired. There is no remaining Prose product work and no active Prose execution domain.

## Locked job invariants

1. SYSTEM_MASTER coordinates integration of CORE, LEARNING, BOOK and DOCUMENTS without taking peer product semantics.
2. CORE owns shared Foundation/Spine/runtime/data/platform/continuity/assurance/A-01 and integration infrastructure.
3. While `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001` remains selected, Programming proving-corpus recovery is the highest discretionary System Master priority, followed by remaining authorized catalog/archive recovery; this is custody/provenance support, not Programming engineering ownership.
4. LEARNING finishes Learning and integrates upward into System Master; it does not take Book, Documents or Programming product work.
5. BOOK finishes Book and owns any genuinely unfinished integration of preserved completed Prose capability through Book adapters/context/compiler/routing/orchestration while retaining canonical manuscript, Story Bible/canon, author, lifecycle, admission, versioning/rollback and publication authority.
6. PROSE is complete and terminally retired; it has no active owner path, child/inherited execution, repair lane, qualification lane, research task, telemetry lane, successor task or claim domain.
7. DOCUMENTS finishes document/artifact mechanics and integrates upward into System Master; it receives no Prose work and cannot take Book literary/canonical authority.
8. Peer systems communicate through explicit interfaces without ownership transfer. There is no active Book-Prose child exception.
9. PROGRAMMING remains an active non-peer work program until explicit topology admission and cannot be silently absorbed into CORE.

## Auto-provisioning invariant

The reconciler compares the selected topology `peer_system_ids` with `SECOND-SHIFT-REGISTRY-001.json::owner_files` on every run.

- Exact active peer set is CORE, LEARNING, BOOK and DOCUMENTS.
- If an already-declared peer lacks coverage and owner path, control ref, live head and current obligation are machine-unambiguous, the controller may provision the missing owner coverage.
- Missing coverage never creates a new system.
- Retired systems are never provisioned, inherited or resurrected.
- Ambiguity fails closed with an exact blocker.

## Required outputs

1. `DERIVED-CURRENT-STATE.json`
2. `SYSTEM-STATE-DRIFT-REPORT.json`
3. deterministic process exit status

The derived projection is disposable and reproducible. Source ledgers/receipts remain authority.

## Truth classes

- `AUTHORITY_CURRENT`
- `AUTHORITY_DELTA`
- `STALE_ARCHITECTURE_PENDING_RECONCILIATION`
- `RETIRED_SYSTEM_RESURRECTION`
- `JOB_LANE_VIOLATION`
- `FALSE_SYSTEM_COMPLETION`
- `STALE_DELEGATION`
- `OVERLAPPING_MUTATION_CLAIM`
- `PROGRAMMING_SCOPE_DRIFT`
- `EVIDENCE_MISMATCH`
- `UNALLOCATED`
- `REGISTERED_EXECUTABLE_MISSING`
- `DUPLICATE_ID`
- `BROKEN_REFERENCE`

## Minimum invariants

1. Product root is SYSTEM_MASTER.
2. Active peer systems are exactly CORE, LEARNING, BOOK and DOCUMENTS.
3. PROSE exists only as complete terminally retired historical system/provenance for current execution.
4. SYSTEM_MASTER, CORE, LEARNING, BOOK and DOCUMENTS remain incomplete under current product-level completion authority.
5. Every non-closed obligation has one valid current owner path and remains inside that owner's program-job lock.
6. No active obligation, specialist owner, delegation, repair route, qualification route, research task, telemetry lane, successor or claim may resolve to PROSE or `SYSTEM_MASTER/BOOK/PROSE`.
7. Historical objective names containing PROSE are allowed only when current executable owner is BOOK and the work is genuinely unfinished Book integration of preserved completed capability.
8. Completion and obligation IDs are unique inside their registries.
9. Second Shift active owner files are exactly CORE, LEARNING, BOOK and DOCUMENTS and exactly match topology peers.
10. Active delegations satisfy the delegation schema, current job lock, current obligation registry and exact live control-head binding.
11. Only one mutation-capable claim may be live per active peer lane.
12. Documents current work cannot contain Prose work; Learning cannot take Book/Documents/Programming work; Core cannot take peer product or Programming engineering semantics.
13. A current Book integration obligation that consumes preserved completed Prose capability remains Book-owned and preserves Book canonical manuscript/Story Bible/author/lifecycle/admission authority.
14. When live owner heads are available, an active delegation bound to another head is `STALE_DELEGATION`.
15. A-01 workstream routing follows the current topology or an explicit retired disposition selected by CURRENT-AUTHORITY, never a hard-coded prior topology version.
16. Every repository-owned executable registered in A-01 exists at its registered path.
17. Historical exact-subject PASS does not transfer across changed SHA, topology, ownership, integration or qualification boundaries.
18. Human, author, private-data, external-authority, native-platform, publication and production boundaries are never broadened by reconciliation.

## Cross-manager enforcement

The System State Reconciler treats program-job-lock enforcement, current-obligation enforcement, topology/retirement validation and Second Shift owner/claim/coverage enforcement as prerequisite consistency checks. If any of those execute and fail semantically, reconciliation is not green.

A GitHub job with no executed steps is infrastructure-not-executed evidence, not a semantic PASS or FAIL of these invariants. Runner allocation failure never authorizes a semantic conclusion.

## Closed-loop repair integration

Before automated repair is admitted, the reconciler confirms owner/workstream, exact failed subject identity, repair eligibility, attempt budget, replacement exact SHA where changed, required prequalification, preserved lineage and current job-lane authority.

There is no active Prose repair route. Current Book-owned integration failures around preserved completed Prose capability route through BOOK. Documents and Learning repairs stay in their own product lanes. Shared infrastructure/A-01 repairs route according to current Core/shared-infrastructure authority.

The repair worker may prepare a replacement candidate but can never grant A-01 PASS, whole-system completion, canonical Book mutation, publication or production authority.

## CI behavior

Reconciliation serializes under one concurrency group. Expected live-head movement is a delta requiring revalidation. Structural contradictions, job-lane violations, retired-system resurrection, false completion claims, stale active delegations, overlapping claims, unmapped ownership and missing registered executables are failures.

## End state

A green reconciliation means current authority, locked jobs, retirement/completion truth, owner/delegation/repair routing and evidence boundaries agree for the exact repository state checked. It does not claim that any incomplete active product system is finished or that unavailable human/private/native/external authority has been satisfied.
