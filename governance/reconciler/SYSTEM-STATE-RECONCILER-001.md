# SYSTEM-STATE-RECONCILER-001

Status: ACTIVE IMPLEMENTATION CONTRACT / CURRENT-AUTHORITY-005 / TOPOLOGY-007 / PROGRAM-JOB-LOCKED
Repository: BFochtman746/system-master

## Purpose

Provide one deterministic repository-native truth compiler that checks whether System Master's current authority, program jobs, product-level completion truth, topology, owner controls, completion history, open obligations, expectations, reallocations, Second Shift delegations, repair state and A-01 evidence agree.

This reconciler does not create authority. It validates and projects authority already present in repository records.

## Canonical input selection

Always begin with `governance/CURRENT-AUTHORITY.json` from current `main`. Load the records it selects rather than hard-coding versions.

Current required authority classes are:

- selected topology — `governance/SYSTEM-TOPOLOGY-007.json`;
- program job lock — `governance/SYSTEM-PROGRAM-JOB-LOCK-001.json`;
- system completion status — `governance/SYSTEM-COMPLETION-STATUS-002.json`;
- current completion ledger — `governance/COMPLETION-LEDGER-003.json`;
- current obligation registry — `governance/WORK-OBLIGATION-REGISTRY-013.json`;
- current expectation registry — `governance/EXPECTATION-REGISTRY-007.json`;
- current reallocation ledger — `governance/REALLOCATION-LEDGER-005.json`;
- current capability crosswalk — `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`;
- current Second Shift registry, execution control and every execution-ready peer owner file;
- current repair/A-01 registries selected by CURRENT-AUTHORITY;
- active census/checkpoint selected by CURRENT-AUTHORITY when present;
- live Git refs/controls for affected active peers when available;
- historical Prose control only as immutable completed-Prose provenance when Book integration/history requires it, never as a live owner control.

Prior ledgers/topologies/manifests remain historical boundary evidence and do not override current selection.

## Current completion invariant

`SYSTEM_MASTER` and all nine active peers are incomplete. Packet, phase, subsystem, branch, hosted-test or A-01 completion may remain valid evidence without becoming whole-system completion.

The active peers are exactly CORE, LEARNING, BOOK, DOCUMENTS, SPREADSHEET_DATA, MEDIA, CONNECTED_ACTIONS, RESEARCH_KNOWLEDGE and PROGRAMMING.

PROSE is historically complete and terminally retired. There is no remaining Prose product execution domain.

WEBSITE_BUILDING is C40 under PROGRAMMING and is not a peer, owner lane or independent claim domain.

## Locked job invariants

1. SYSTEM_MASTER coordinates integration of all nine active peers without taking peer product semantics.
2. CORE owns shared Foundation/Spine/runtime/data/platform/continuity/assurance/A-01 and integration infrastructure.
3. `FOUNDATION-1-0-CLOSURE-001` remains the central objective.
4. While `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001` remains selected, Programming source/custody/provenance recovery is the highest discretionary System Master support priority under CORE; it does not take Programming engineering ownership.
5. LEARNING owns Learning product/runtime/curriculum/mastery/assessment/adaptation/evidence.
6. BOOK owns canonical Book/manuscript/Story Bible/author/lifecycle/admission/versioning/publication semantics and only genuinely unfinished BOOK-owned integration of preserved completed Prose capability.
7. DOCUMENTS owns document/artifact mechanics and receives no Prose work or Book canonical authority.
8. SPREADSHEET_DATA owns spreadsheet/math/data/ledger semantics.
9. MEDIA owns audiobook/image/media/photo/video/voice semantics.
10. CONNECTED_ACTIONS owns browser/calendar/comms/plugin action policy; repository execution readiness does not grant external side-effect authority.
11. RESEARCH_KNOWLEDGE owns research/knowledge/geo retrieval/provenance semantics.
12. PROGRAMMING is an admitted peer owning software-engineering semantics, preserving prior Programming continuity, including AUTOMATION, CODE and WEBSITE_BUILDING C40.
13. PROSE is complete and terminally retired with no active owner path, child/inherited execution, repair, qualification, research, telemetry, successor or claim domain.
14. Peers communicate through explicit interfaces without ownership transfer.

## Auto-provisioning invariant

The reconciler compares the selected topology `execution_readiness.execution_ready_peer_system_ids` with `SECOND-SHIFT-REGISTRY-001.json::owner_files`, telemetry allowed lanes and the Second Shift execution-control machine contract on every run.

- Expected execution-ready peer set is exactly the nine active peers.
- If an already-declared execution-ready peer lacks coverage and owner path, control ref, live head and current obligation are machine-unambiguous, the controller may provision only that missing owner coverage.
- Missing coverage never creates a new system.
- Retired systems are never provisioned, inherited or resurrected.
- Website Building uses PROGRAMMING coverage and never creates a tenth lane.
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
- `FALSE_EXECUTION_READINESS`
- `EVIDENCE_MISMATCH`
- `UNALLOCATED`
- `REGISTERED_EXECUTABLE_MISSING`
- `DUPLICATE_ID`
- `BROKEN_REFERENCE`

## Minimum invariants

1. Product root is SYSTEM_MASTER.
2. Active peer systems are exactly CORE, LEARNING, BOOK, DOCUMENTS, SPREADSHEET_DATA, MEDIA, CONNECTED_ACTIONS, RESEARCH_KNOWLEDGE and PROGRAMMING.
3. PROSE exists only as complete terminally retired historical provenance for current execution.
4. SYSTEM_MASTER and all nine active peers remain incomplete under current product-level completion authority.
5. WEBSITE_BUILDING is C40 under PROGRAMMING and is not a peer system.
6. Every non-closed obligation has one valid current owner path and remains inside that owner's program-job lock.
7. No active obligation, owner, delegation, repair route, qualification route, research task, telemetry lane, successor or claim resolves to PROSE or `SYSTEM_MASTER/BOOK/PROSE`.
8. Historical objective names containing PROSE are allowed only when current executable owner is BOOK and the work is genuinely unfinished Book integration of preserved completed capability.
9. Completion and obligation IDs are unique inside their registries.
10. Second Shift owner files/telemetry lanes exactly match topology execution-ready peers.
11. Active delegations satisfy schema, current job lock, current obligation registry and exact live control-head binding.
12. Only one mutation-capable claim may be live per execution-ready peer lane.
13. Cross-owner work and unauthorized semantic absorption fail closed.
14. Current BOOK integration consuming preserved completed Prose capability remains Book-owned and preserves Book canonical authority.
15. When live owner heads are available, an active delegation bound to another head is `STALE_DELEGATION`.
16. A-01 workstream routing follows current topology or an explicit retired disposition selected by CURRENT-AUTHORITY, never a hard-coded prior topology.
17. Every repository-owned executable registered in A-01 exists at its registered path.
18. Historical exact-subject PASS does not transfer across changed SHA, topology, ownership, readiness, integration or qualification boundaries.
19. Human, author, private-data, external-authority, native-platform, publication, production and user-action boundaries are never broadened by reconciliation.

## Cross-manager enforcement

The System State Reconciler treats program-job-lock enforcement, current-obligation enforcement, topology/retirement validation and Second Shift owner/claim/coverage enforcement as prerequisite consistency checks. If any executes and fails semantically, reconciliation is not green.

A GitHub job with no executed steps is infrastructure-not-executed evidence, not a semantic PASS or FAIL. Runner allocation failure never authorizes a semantic conclusion.

## Closed-loop repair integration

Before automated repair is admitted, the reconciler confirms owner/workstream, exact failed subject identity, repair eligibility, attempt budget, replacement exact SHA where changed, required prequalification, preserved lineage and current job-lane authority.

There is no active Prose repair route. Current Book-owned integration failures around preserved completed Prose capability route through BOOK. Peer repairs stay in their own semantic lanes. Shared infrastructure/A-01 repairs route according to current CORE/shared-infrastructure authority.

The repair worker may prepare a replacement candidate but can never grant A-01 PASS, whole-system completion, canonical Book mutation, external side effects, publication or production authority.

## CI behavior

Reconciliation serializes under one concurrency group. Expected live-head movement is a delta requiring revalidation. Structural contradictions, job-lane violations, retired-system resurrection, false completion, stale active delegations, overlapping claims, unmapped ownership, C40 peer promotion and missing registered executables are failures.

## End state

A green reconciliation means current authority, locked jobs, retirement/completion truth, owner/delegation/repair routing, execution-ready coverage and evidence boundaries agree for the exact repository state checked. It does not claim that any incomplete active product system is finished or that unavailable human/private/native/external authority has been satisfied.
