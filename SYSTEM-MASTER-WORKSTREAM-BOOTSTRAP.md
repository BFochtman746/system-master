# System Master Repository Bootstrap

This file is the cross-chat entry point for all work in `BFochtman746/system-master`.

## Mandatory startup — read first

Before interpreting a branch, chat title, ticket, workflow, qualification, historical handoff or scheduled task as current authority, read in this order:

1. `governance/CURRENT-AUTHORITY.json` from current `main`;
2. selected topology, `program_job_lock` and `system_completion_status`;
3. current morning bootstrap pointer/manifest when present, as cache only;
4. selected system catalog for active/historical/future-system discovery;
5. live canonical control ref/head for the active owning system;
6. current completion ledger, obligation registry, expectation registry and reallocation ledger;
7. repair state and registry-declared Second Shift owner/claim state;
8. archive/source/evidence records when historical reuse is relevant.

Conversation memory, morning packets, branch names, catalog entries and historical handoffs never override current repository authority.

## Current completion truth

`SYSTEM_MASTER`, `CORE`, `LEARNING`, `BOOK` and `DOCUMENTS` are incomplete and active. A completed packet, phase, branch, subsystem, hosted test or A-01 qualification does not make an owning active system complete unless current product-level completion authority explicitly says so.

`PROSE` is historically complete and terminally retired. There is no remaining Prose product work.

## Active product hierarchy

`SYSTEM_MASTER` is the product root / system-of-systems.

- **SYSTEM MASTER** — incomplete product root / integration controller
  - **CORE — System Master Core / Foundation & Spine** — incomplete
  - **LEARNING SYSTEM** — incomplete
  - **BOOK SYSTEM** — incomplete
  - **DOCUMENTS SYSTEM** — incomplete

Current architecture authority is the topology/ADR selected by `CURRENT-AUTHORITY`, currently `governance/SYSTEM-TOPOLOGY-005.json` and `governance/ADR-0005-PROSE-TERMINAL-RETIREMENT-BOOK-INTEGRATION.md`.

PROSE is not in the active hierarchy. Historical Prose branches, exact SHAs, receipts and retirement/restoration records remain provenance only. Any metadata that still labels PROSE active is `STALE_ARCHITECTURE_PENDING_RECONCILIATION` and cannot dispatch.

## Locked program jobs

### SYSTEM MASTER

Integrate CORE, LEARNING, BOOK and DOCUMENTS into one coherent product through explicit interfaces and shared infrastructure. Product-root coordination does not take peer-system product semantics or create a separate root worker lane.

### CORE — `SYSTEM_MASTER/CORE`

Finish shared Foundation/Spine, runtime, data/platform, continuity/recovery, assurance/reconciliation, shared connector/model/artifact infrastructure and A-01/control-plane integration. CORE administers shared System Master integration infrastructure but does not implement Learning, Book, Documents or Programming product semantics.

While `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001` is selected, the highest discretionary System Master/CORE priority is Programming proving-corpus source/custody/provenance recovery, followed by remaining authorized catalog/archive recovery. This does not create a Programming peer lane or replace Programming engineering work.

### LEARNING — `SYSTEM_MASTER/LEARNING`

Finish Learning product/runtime, curriculum, learner/mastery, assessment/adaptation, retention/transfer and Learning evidence/qualification, then integrate upward into System Master. Do not cross into Book, Documents or Programming product work.

### BOOK — `SYSTEM_MASTER/BOOK`

Finish Book. Any genuinely unfinished integration of preserved completed Prose capability is ordinary BOOK-owned adapter/context/compiler/routing/orchestrator work. BOOK remains sole canonical owner of manuscript, Story Bible/canon, author decisions, lifecycle, admission, versioning/rollback and publication state. Then integrate Book upward into System Master.

### DOCUMENTS — `SYSTEM_MASTER/DOCUMENTS`

Finish Documents document/artifact mechanics: DOCX, PDF, PPTX and general document intake, structure, conversion, preservation, rendering/export and generic reusable non-Book document/writing artifact behavior. Then integrate Documents upward into System Master through explicit interfaces.

DOCUMENTS receives no Prose work and may not mutate Book canonical state.

### PROSE — retired historical system

PROSE is complete and terminally retired. It has no active owner path, child/inherited execution, repair lane, qualification lane, research task, telemetry lane, successor task or mutation claim domain.

Preserved completed Prose capability artifacts and exact historical evidence may be consumed by BOOK only as integration inputs. Changed Book integration bytes require fresh Book-owned evidence. Historical Prose PASS does not transfer.

### PROGRAMMING work program

PROGRAMMING remains an incomplete active engineering work program outside current peer topology. Continue from preserved Programming foundation/capability/build/test/assurance/source-code/Genesis evidence, recover only missing exact source/custody information, perform warranted current deltas and continue from the first genuinely unclosed package.

Programming is not generic Core work and does not receive a peer control/repair/Second Shift lane before explicit topology admission.

## Supported chat roles

- `MASTER_ROOT` — SYSTEM_MASTER product-root controller.
- `LEARNING` — `SYSTEM_MASTER/LEARNING`.
- `BOOK` — `SYSTEM_MASTER/BOOK`.
- `DOCUMENTS` — `SYSTEM_MASTER/DOCUMENTS`.
- `PROGRAMMING_WORK_PROGRAM` — named non-peer Programming work program.

PROSE is not an active chat role. Prose history is read as provenance; genuinely open completed-capability integration resolves to BOOK.

Every new chat re-fetches current `main`, CURRENT-AUTHORITY, job/completion locks and the live active owner control head before current-state claims or writes.

## Current work selection

The authority-selected current obligation registry controls current work. Product-root integration coordination remains mandatory. While Knowledge Recovery 001 remains selected, Programming proving-corpus recovery is the highest discretionary System Master priority and remaining authorized catalog/archive recovery follows it.

Book continues only genuinely open Book-owned completed-Prose integration lineage and subsequent Book product completion. Learning continues Learning-only completion/integration. Documents continues Documents-only completion/integration. A blocker in one active peer lane does not stop dependency-valid safe work in another.

## Second Shift

`governance/second-shift/SECOND-SHIFT-REGISTRY-001.json::owner_files` is the machine execution-lane set. It must match the topology `peer_system_ids` set.

A-01 overnight execution authority is defined by `qualification/a01/overnight/A01-OVERNIGHT-001.md`; Second Shift integration with that control plane remains bounded by the current A-01 policy, registry, admission barrier and exact-subject evidence rules.

Current active peer worker lanes are exactly:

- CORE
- LEARNING
- BOOK
- DOCUMENTS

On every run, compare topology peers to registry owner coverage. If an already-declared peer lacks coverage and owner path, control ref, live head and current obligation are machine-unambiguous, provision the missing coverage. Missing coverage never creates a new system. Retired systems are never provisioned or resurrected.

PROSE has no standalone or inherited worker lane and no telemetry. Any Book integration around preserved completed Prose capability is BOOK work and BOOK telemetry.

Before dispatch, every controller/worker reads current authority, job/completion/retirement locks, topology, obligation registry and exact live owner head. Cross-lane work, retired-system resurrection, false active-system completion, stale head bindings and overlapping mutation claims fail closed.

## Completion and evidence discipline

Keep separate:

1. historical code/evidence exists;
2. a packet/phase/subsystem is complete;
3. exact current code builds/tests;
4. hosted/local qualification passes;
5. exact-subject A-01 qualification passes;
6. whole-system product completion or retirement standing;
7. human/author/private/native/external/publication/production authority.

No PASS transfers across changed SHA, topology, integration subject, owner boundary or qualification class.

## Book / Documents / retired Prose authority rule

Only BOOK may create canonical Book/manuscript effects. Documents may provide document/artifact services through explicit interfaces but receives no Prose work and gains no Book literary/canonical authority.

Retired Prose evidence may inform Book integration without reopening Prose or transferring PASS to changed Book integration subjects.

## Future-system / historical-reuse startup

The System Catalog is a discovery/reuse index, not architecture authority. A catalog candidate does not become a system automatically.

When the user asks to build/resume a cataloged future system, resolve current authority/catalog, load its packet/source registry, reconcile existing work/evidence, apply only current material-delta research to historically closed research, explicitly admit a new first-class system only with user-authorized topology/ADR/owner changes, and begin implementation at the first genuinely unclosed evidence-backed work package.

## Repair discipline

Repair routing follows current topology and program jobs. Current Book integration defects route through BOOK. Documents repairs stay Documents-owned. Learning repairs stay Learning-owned. Shared infrastructure/A-01 failures route through CORE/shared infrastructure as current controls define.

PROSE has no active repair route. Historical Prose repair records are provenance only.

## Anti-surprise rule

At every chat/work start:

`LIVE MAIN -> CURRENT AUTHORITY -> TOPOLOGY/JOB/COMPLETION/RETIREMENT LOCK -> LIVE OWNER HEAD -> OBLIGATION/DELEGATION/REPAIR -> PEER-COVERAGE CHECK -> DELTA CLASSIFICATION -> RECONCILE -> CURRENT OBJECTIVE -> EXECUTE/NEXT STEP`

Do not ask the user to reconstruct architecture, program jobs, completion truth, Prose retirement, archive history or prior research that current repository authority can resolve.

## End-of-work rule

Before ending substantive work, re-read the live owner head, classify/reconcile any delta, preserve exact evidence, update current obligation/repair/Second Shift state if materially changed and bind one dependency-valid successor inside the same active job. Never bind a Prose successor.

## Current authority

`governance/CURRENT-AUTHORITY.json` is the cross-chat current-routing selector. Any file, chat, task, branch, historical record or generated packet that conflicts with current authority, selected topology, program job lock or completion/retirement standing is stale for current execution until reconciled.
