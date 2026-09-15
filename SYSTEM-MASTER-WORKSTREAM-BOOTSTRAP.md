# System Master Repository Bootstrap

This file is the cross-chat entry point for all work in `BFochtman746/system-master`. It is authority-derived from `governance/CURRENT-AUTHORITY.json` and must never override that machine-readable authority.

## Mandatory startup — read first

Before interpreting a branch, chat title, ticket, workflow, qualification, historical handoff or scheduled task as current authority, read in this order:

1. `governance/CURRENT-AUTHORITY.json` from current `main`;
2. selected topology, `program_job_lock` and `system_completion_status`;
3. `CURRENT-STATE.md` as the human-readable authority projection;
4. current morning bootstrap pointer/manifest when present, as cache only;
5. selected system catalog and capability crosswalk;
6. live canonical control ref/head for the active owning peer;
7. current completion ledger, obligation registry, expectation registry and reallocation ledger;
8. repair state and registry-declared Second Shift owner/claim state;
9. archive/source/evidence records when historical reuse is relevant.

Conversation memory, morning packets, branch names, catalog entries, historical manifests and handoffs never override current repository authority.

## Current authority lock

Current authority is `CURRENT-AUTHORITY-005`, selecting:

- `governance/SYSTEM-TOPOLOGY-007.json`;
- `governance/ADR-0006-PROGRAMMING-PEER-ADMISSION-WEBSITE-BUILDING.md`;
- `governance/SYSTEM-PROGRAM-JOB-LOCK-001.json`;
- `governance/SYSTEM-COMPLETION-STATUS-002.json`;
- `governance/WORK-OBLIGATION-REGISTRY-013.json`;
- `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`.

There are exactly **nine active peer systems** under `SYSTEM_MASTER`:

- `CORE`
- `LEARNING`
- `BOOK`
- `DOCUMENTS`
- `SPREADSHEET_DATA`
- `MEDIA`
- `CONNECTED_ACTIONS`
- `RESEARCH_KNOWLEDGE`
- `PROGRAMMING`

All nine peers and `SYSTEM_MASTER` are incomplete at product level.

`WEBSITE_BUILDING` is capability **C40** owned by `SYSTEM_MASTER/PROGRAMMING`. It is not a tenth peer. `PROSE` is historically complete and terminally retired with no current execution, repair, qualification, research, telemetry or successor lane.

## Active product hierarchy

`SYSTEM_MASTER` is the incomplete product root / system-of-systems. Its direct active peers are:

- **CORE — System Master Core / Foundation & Spine**
- **LEARNING SYSTEM**
- **BOOK SYSTEM**
- **DOCUMENTS SYSTEM**
- **SPREADSHEET / MATH / DATA SYSTEM**
- **MEDIA SYSTEM**
- **CONNECTED ACTIONS SYSTEM**
- **RESEARCH / KNOWLEDGE SYSTEM**
- **PROGRAMMING / SOFTWARE ENGINEERING SYSTEM**

A new first-class system requires explicit user-authorized architecture change. A branch name, workstream, qualification, catalog entry, chat title or capability ID cannot create a peer.

## Locked peer jobs

### SYSTEM MASTER / CORE — `SYSTEM_MASTER/CORE`

Coordinate product integration and finish shared Foundation/Spine, runtime, platform, continuity/recovery, assurance/reconciliation, shared storage/model/A-01/control-plane infrastructure and explicit peer interfaces. CORE does not take another peer's product semantics.

`FOUNDATION-1-0-CLOSURE-001` remains the central objective. While selected, `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001` remains the highest discretionary System Master priority and is CORE-administered source/custody/provenance support for Programming. It does not replace the Programming peer lane or Programming canonical state.

### LEARNING — `SYSTEM_MASTER/LEARNING`

Own Learning architecture/runtime, curriculum, learner/mastery, assessment/adaptation, retention/transfer and Learning evidence/qualification, then integrate upward through explicit System Master interfaces.

### BOOK — `SYSTEM_MASTER/BOOK`

Own canonical Book/manuscript/Story Bible state, lifecycle, author decisions, admission, versioning/rollback and publication state. Any genuinely unfinished integration of preserved completed Prose capability is ordinary BOOK-owned work. Historical Prose evidence remains provenance and does not create a Prose lane.

### DOCUMENTS — `SYSTEM_MASTER/DOCUMENTS`

Own DOCX, PDF, PPTX, OCR, file/document artifact mechanics, conversion, preservation, rendering/export and generic reusable document services. DOCUMENTS receives no Prose work and may not mutate canonical Book state.

### SPREADSHEET_DATA — `SYSTEM_MASTER/SPREADSHEET_DATA`

Own spreadsheet, math, data-analysis and ledger semantics, including `EXCEL`, `MATH`, `DATA` and `LEDGER`, over shared Core execution/data primitives.

### MEDIA — `SYSTEM_MASTER/MEDIA`

Own audiobook, image, media, photo, video and voice semantics over shared Core runtime and artifact interfaces.

### CONNECTED_ACTIONS — `SYSTEM_MASTER/CONNECTED_ACTIONS`

Own browser, calendar, communications and plugin/action policy. Repository readiness does not grant external side-effect authority; user-authorized external actions, credentials and provider effects remain separately gated.

### RESEARCH_KNOWLEDGE — `SYSTEM_MASTER/RESEARCH_KNOWLEDGE`

Own research, knowledge and geospatial retrieval/provenance semantics and integrate through explicit interfaces without taking another peer's canonical state.

### PROGRAMMING — `SYSTEM_MASTER/PROGRAMMING`

Own software-engineering semantics and continue the preserved Programming engineering lineage without restarting completed work. Programming owns `AUTOMATION`, `CODE` and `WEBSITE_BUILDING` C40.

Website Building is a first-class Programming capability, not a peer. It may consume CONNECTED_ACTIONS browser/action interfaces without inheriting external side-effect authority. Its deterministic local static Foundation 1.0 evidence does not grant framework/browser/provider/credential/publication/production authority.

### PROSE — retired historical system

PROSE is complete and terminally retired. It has no active owner path, child/inherited execution, repair lane, qualification lane, research task, telemetry lane, successor task or mutation claim domain.

Preserved completed Prose capability artifacts and exact historical evidence may be consumed by BOOK only as integration inputs. Changed Book integration bytes require fresh Book-owned evidence. Historical Prose PASS does not transfer.

## Supported chat / execution roles

Current peer roles follow Topology 007:

- `CORE`
- `LEARNING`
- `BOOK`
- `DOCUMENTS`
- `SPREADSHEET_DATA`
- `MEDIA`
- `CONNECTED_ACTIONS`
- `RESEARCH_KNOWLEDGE`
- `PROGRAMMING`

`MASTER_ROOT` remains the SYSTEM_MASTER product-root coordination role, not an additional peer. `WEBSITE_BUILDING` routes through PROGRAMMING. PROSE is not an active role.

Every new chat re-fetches current `main`, CURRENT-AUTHORITY, topology/job/completion locks and the live owner control head before current-state claims or writes.

## Current work selection

The authority-selected obligation registry controls current work. Product-root integration coordination is mandatory. `FOUNDATION-1-0-CLOSURE-001` is the central objective. While selected, `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001` is the highest discretionary System Master priority for missing Programming source/custody/provenance only.

Each peer continues dependency-valid work inside its own semantic lane. A blocker in one peer does not stop safe work in another. Programming product work executes in the PROGRAMMING lane; Knowledge Recovery support executes under CORE and cannot become a second Programming mutation domain.

## Second Shift

`governance/second-shift/SECOND-SHIFT-REGISTRY-001.json::owner_files` is the machine execution-lane set. It must match the topology's current execution-ready peer set.

A-01 overnight execution authority is defined by `qualification/a01/overnight/A01-OVERNIGHT-001.md`; Second Shift integration with that control plane remains bounded by the current A-01 policy, registry, admission barrier and exact-subject evidence rules.

Current execution-ready peer lanes are exactly:

- CORE
- LEARNING
- BOOK
- DOCUMENTS
- SPREADSHEET_DATA
- MEDIA
- CONNECTED_ACTIONS
- RESEARCH_KNOWLEDGE
- PROGRAMMING

On every run, compare current topology execution-ready peers to registry owner coverage. If an already-declared execution-ready peer lacks coverage and owner path, control ref, live head and current obligation are machine-unambiguous, missing coverage may be provisioned. Missing coverage never creates a new system. Retired systems are never provisioned or resurrected.

At most one mutation-capable claim may be live per peer lane. Before dispatch, every controller/worker reads current authority, job/completion/retirement locks, topology, obligation registry and exact live owner head. Cross-lane work, retired-system resurrection, false completion, stale head bindings and overlapping mutation claims fail closed.

A-01 and other repository execution mechanisms remain infrastructure, not peers. Their readiness never synthesizes human, private, native, credential, publication, production, external-provider or user-action authority.

## Completion and evidence discipline

Keep separate:

1. historical code/evidence exists;
2. a packet/phase/subsystem is complete;
3. exact current code builds/tests;
4. hosted/local qualification passes;
5. exact-subject A-01 qualification passes;
6. whole-system product completion or retirement standing;
7. human/author/private/native/external/publication/production authority.

No PASS transfers across changed SHA, topology, integration subject, ownership boundary, readiness boundary or qualification class. Historical receipts and exact-SHA evidence are append-only and remain bound to their original subjects; never relabel them to clear a current-authority mismatch.

## Capability and ownership rules

Capabilities C00-C49 are capability entries, not systems. Platform requirements P00-P15 are shared dependencies, not peers. Reserved capability IDs remain reserved and are not renumbered.

`WEBSITE_BUILDING` is C40 under PROGRAMMING. `AIINCOME`, `CAD`, `PHONEOPS`, `PHYSICALAI` and `PORTFOLIO` retain their explicit deferred/out-of-scope dispositions in the canonical crosswalk until authority changes them.

Only BOOK may create canonical Book/manuscript effects. Documents may provide document/artifact services through explicit interfaces but receives no Prose work and gains no Book literary/canonical authority.

## Historical reuse and Knowledge Recovery

The System Catalog and recovery manifests are discovery/reuse/provenance inputs, not architecture authority. Historical Topology-004 / Manifest-002 Knowledge Recovery PASS remains bound to its exact subject. Manifest 003 remains an immutable Topology-005 historical predecessor with no PASS transfer.

Any fresh Topology-007 qualification subject must be an append-only successor; do not rewrite or relabel historical manifests or receipts.

When historical Programming assets are needed, recover exact source/custody/provenance only where missing and continue from the first genuinely unclosed Programming package. Do not restart preserved completed Programming foundation work merely because Programming is now an admitted peer.

## Repair discipline

Repair routing follows current Topology 007 and current program jobs. Book repairs stay BOOK-owned; Documents repairs stay DOCUMENTS-owned; Learning repairs stay LEARNING-owned; Spreadsheet/Data, Media, Connected Actions, Research/Knowledge and Programming repairs remain in their own peer lanes; shared infrastructure/A-01 failures route through CORE/shared infrastructure as current controls define.

PROSE has no active repair route. Historical Prose repair records are provenance only.

## Anti-surprise rule

At every chat/work start:

`LIVE MAIN -> CURRENT AUTHORITY -> TOPOLOGY/JOB/COMPLETION/RETIREMENT LOCK -> CURRENT-STATE -> LIVE OWNER HEAD -> OBLIGATION/DELEGATION/REPAIR -> PEER-COVERAGE CHECK -> DELTA CLASSIFICATION -> RECONCILE -> CURRENT OBJECTIVE -> EXECUTE/NEXT STEP`

Do not ask the user to reconstruct architecture, program jobs, completion truth, Prose retirement, Programming admission, C40 ownership, archive history or prior research that current repository authority can resolve.

## End-of-work rule

Before ending substantive work, re-read live authority and affected owner heads, classify/reconcile any delta, preserve exact evidence, update current obligation/repair/Second Shift state if materially changed, and bind one exact dependency-valid successor inside the same active owner lane. Never bind a Prose successor.

## Current authority

`governance/CURRENT-AUTHORITY.json` is the cross-chat current-routing selector. Any file, chat, task, branch, historical record or generated packet that conflicts with current authority, selected topology, program job lock or completion/retirement standing is stale for current execution until reconciled.
