# System Master Repository Bootstrap

This file is the cross-chat entry point for all work in `BFochtman746/system-master`.

## Mandatory startup — read first

Before interpreting a branch, chat title, ticket, workflow, qualification, historical handoff or scheduled task as current authority, read in this order:

1. `governance/CURRENT-AUTHORITY.json` from current `main`;
2. the `program_job_lock` and `system_completion_status` selected by CURRENT-AUTHORITY;
3. the current morning bootstrap pointer/manifest when present;
4. the topology selected by CURRENT-AUTHORITY — currently `governance/SYSTEM-TOPOLOGY-004.json`;
5. the `system_catalog` selected by CURRENT-AUTHORITY for active/historical/future-system discovery; the catalog never overrides topology authority;
6. the live canonical control ref/head for the active owning system;
7. the current completion ledger, obligation registry and expectation registry selected by CURRENT-AUTHORITY;
8. expectation/reallocation/repair state relevant to the active owner;
9. archive/source/evidence records when historical reuse is relevant;
10. the registry-declared Second Shift delegation and current shift ledger when unattended work is involved.

Conversation memory, morning packets, branch names, catalog entries and historical handoffs never override current repository authority.

## Current completion truth

`PROSE` is the **only complete system**.

`SYSTEM_MASTER`, `CORE`, `LEARNING`, `BOOK` and `DOCUMENTS` are incomplete and active. A completed packet, phase, branch, subsystem, hosted test or A-01 qualification does not make an owning system complete unless the authority-selected system completion record explicitly says so.

## Active product hierarchy

`SYSTEM_MASTER` is the product root / system-of-systems.

- **SYSTEM MASTER** — incomplete product root / integration controller
  - **CORE — System Master Core / Foundation & Spine** — incomplete
  - **LEARNING SYSTEM** — incomplete
  - **BOOK SYSTEM** — incomplete
    - **PROSE SYSTEM** — complete Book child specialist
  - **DOCUMENTS SYSTEM** — incomplete

Current architecture authority is `governance/SYSTEM-TOPOLOGY-004.json` plus `governance/ADR-0004-BOOK-PROSE-CHILD-RESTORATION.md`.

The historical Prose retirement/Documents-reallocation records remain provenance only. They do not control current execution and must not redirect active Book-Prose work to Documents.

## Locked program jobs

### SYSTEM MASTER

Integrate CORE, LEARNING, BOOK and DOCUMENTS into one coherent product through explicit interfaces and shared infrastructure. The product root coordinates integration but does not take peer-system product semantics or create a separate root worker lane.

### CORE — `SYSTEM_MASTER/CORE`

Finish shared Foundation/Spine, runtime, data/platform, continuity/recovery, assurance/reconciliation, shared connector/model/artifact infrastructure and A-01/control-plane integration. CORE administers shared System Master integration infrastructure but does not implement Learning, Book/Prose or Documents product semantics.

### LEARNING — `SYSTEM_MASTER/LEARNING`

Finish the Learning system: product/runtime, curriculum, learner/mastery model, assessment/adaptation, retention/transfer and Learning evidence/qualification. Then integrate Learning upward into System Master through explicit interfaces. Do not cross into Book, Prose or Documents product work.

### BOOK — `SYSTEM_MASTER/BOOK`

Finish the Book system. This specifically includes bringing the already-complete PROSE child into Book through the required adapters and the Book Workflow Orchestrator, then completing the remaining Book lifecycle/orchestration/context/routing/admission work and integrating Book upward into System Master.

BOOK remains the sole canonical owner of Book/manuscript, Story Bible/canon, author decisions, lifecycle, admission and publication state.

### PROSE — `SYSTEM_MASTER/BOOK/PROSE`

PROSE is complete and remains the Book literary-specialist child. It supplies literary diagnosis, controlled revision candidates, evaluation support, voice/protected-language preservation, homogenization defense and Book-scoped preference-learning behavior.

PROSE has zero direct canonical manuscript-write authority, no Book-admission authority, no author authority and no separate peer/Second Shift mutation lane. Integration adapters/orchestration around completed Prose are BOOK work. Do not restart or expand Prose feature scope absent a demonstrated defect or explicit user direction.

### DOCUMENTS — `SYSTEM_MASTER/DOCUMENTS`

Finish Documents document/artifact mechanics: DOCX, PDF, PPTX and general document intake, structure, conversion, preservation, rendering/export and generic reusable non-Book document/writing artifact behavior. Then integrate Documents upward into System Master through explicit interfaces.

DOCUMENTS must not absorb, schedule, repair or claim Book-specific PROSE literary work and may not mutate Book canonical state.

### Knowledge Recovery / Programming

Knowledge Recovery is a supporting CORE-administered source/custody/provenance program. It is not a peer system and is not the product-wide priority. It may proceed when dependency-valid without blocking the independent Book, Learning or Documents lanes or redefining their jobs.

## Sole direct specialist exception

The only direct specialist parent/child lane exception is:

`BOOK <-> PROSE`

All other active systems remain inside their own product lanes and integrate upward into System Master or communicate through explicit admitted interfaces. A service call never transfers ownership with it.

## Supported chat roles

- `MASTER_ROOT` — SYSTEM_MASTER product-root controller.
- `LEARNING` — `SYSTEM_MASTER/LEARNING`.
- `BOOK` — `SYSTEM_MASTER/BOOK`.
- `PROSE` compatibility focus — opens BOOK focused at `SYSTEM_MASTER/BOOK/PROSE`; it is not a separate owner lane.
- `DOCUMENTS` — `SYSTEM_MASTER/DOCUMENTS`.

Every new chat must re-fetch current `main`, CURRENT-AUTHORITY, job/completion locks and its live owner control head before current-state claims or writes.

## Current work selection

The authority-selected current obligation registry controls current work. The current product-root coordination objective is `SYSTEM-MASTER-INTEGRATION-COORDINATION-001` under CORE administrative execution, while BOOK, LEARNING and DOCUMENTS continue independently inside their locked jobs.

Book’s current lane continues Book-Prose integration from the completed Prose system through adapters/orchestration. Learning continues Learning-only product completion/integration. Documents continues Documents-only completion/integration. A blocker in one peer lane does not stop dependency-valid safe work in another.

## Second Shift

`governance/second-shift/SECOND-SHIFT-REGISTRY-001.json::owner_files` is the machine-authoritative active worker-lane set. Current active peer worker lanes are:

- CORE
- LEARNING
- BOOK
- DOCUMENTS

PROSE work inherits the BOOK lane and BOOK mutation claim. There is no separate active Prose worker lane. SYSTEM_MASTER root remains portfolio controller rather than a peer worker.

Before dispatch, every controller/worker must read CURRENT-AUTHORITY, the current job lock, completion status, topology, obligation registry and its exact live owner head. Cross-lane work, false non-Prose system completion, stale head bindings and overlapping mutation claims fail closed.

## Completion and evidence discipline

The current completion interpretation is selected by CURRENT-AUTHORITY. Older completion ledgers remain append-only historical/boundary evidence.

Keep separate:

1. historical code/evidence exists;
2. a packet/phase/subsystem is complete;
3. exact current code builds/tests;
4. hosted/local qualification passes;
5. exact-subject A-01 qualification passes;
6. whole-system product completion;
7. human/author/private/native/external/publication/production authority.

No PASS transfers across changed SHA, changed integration subject, changed ownership boundary or different qualification class.

## Book / Prose authority rule

Book may orchestrate Prose analysis, evaluation and controlled candidate generation through adapters. Prose output remains evidence/candidate material until Book admission. Only BOOK may create canonical manuscript effects.

Documents may provide document/artifact services to Book through explicit interfaces, but that does not make Documents owner of Prose, Book literary semantics or canonical Book state.

## Future-system / historical-reuse startup

The System Catalog is a discovery/reuse index, not architecture authority. A catalog candidate does not become a system automatically.

When the user asks to build/resume a cataloged future system:

1. resolve CURRENT-AUTHORITY and the authority-selected System Catalog;
2. load its system packet and archive/source registry before broad rediscovery;
3. recover and reconcile existing research/spec/code/test/qualification material;
4. apply only current material-delta research to historically closed research unless a real reopen trigger exists;
5. explicitly admit a new first-class system only with user-authorized topology/ADR/owner changes;
6. begin implementation at the first genuinely unclosed evidence-backed work package.

## Repair discipline

Repair routing follows current topology and program jobs. Book-Prose repairs route through BOOK. Documents repairs stay Documents-owned. Learning repairs stay Learning-owned. Shared infrastructure/A-01 failures route through CORE/shared infrastructure as defined by current repair controls.

Historical standalone Prose repair/delegation records are provenance only and cannot create a separate active lane.

## Anti-surprise rule

At every chat/work start:

`LIVE MAIN -> CURRENT AUTHORITY -> JOB/COMPLETION LOCK -> LIVE OWNER HEAD -> OBLIGATION/DELEGATION -> DELTA CLASSIFICATION -> RECONCILE -> CURRENT OBJECTIVE -> EXECUTE/NEXT STEP`

Do not ask the user to reconstruct architecture, program jobs, completion truth, archive history or prior research that current repository authority can resolve.

## End-of-work rule

Before ending substantive work:

1. re-read the live owner head;
2. classify/reconcile any delta;
3. preserve exact evidence;
4. update current obligation/repair/Second Shift state if materially changed;
5. bind one dependency-valid successor inside the same locked job.

## Current authority

`governance/CURRENT-AUTHORITY.json` is the cross-chat current-routing selector. Any file, chat, task, branch, historical retirement record or generated packet that conflicts with current authority, the selected program job lock or the selected system completion status is stale for current execution until explicitly reconciled.
