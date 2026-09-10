# System Master Repository Bootstrap

This file is the cross-chat entry point for all work in `BFochtman746/system-master`.

## Mandatory startup — read first

Before interpreting a branch, chat title, ticket, workflow, qualification, historical handoff or scheduled task as current authority, read in this order:

1. `governance/CURRENT-AUTHORITY.json`
2. the current morning bootstrap pointer/manifest when present
3. the topology selected by CURRENT-AUTHORITY — currently `governance/SYSTEM-TOPOLOGY-003.json`
4. `governance/catalog/SYSTEM-MASTER-SYSTEM-CATALOG-001.json` for active/retired/future-system discovery; the catalog never overrides topology authority
5. when the user asks to build/resume a cataloged future system or reuse historical work, load its system packet before broad archive research — currently `governance/catalog/system-packets/PROGRAMMING.json` for Programming
6. the live canonical control ref for the active owning system, if one exists; cataloged future candidates have no active owner/control until explicitly admitted
7. the sealed checkpoint, completion ledger and current obligation registry selected by CURRENT-AUTHORITY
8. expectation/reallocation/repair state relevant to the active owner
9. `governance/catalog/SYSTEM-MASTER-ARCHIVE-SOURCE-REGISTRY-001.json` and exact source/evidence records when historical reuse is relevant
10. the registry-declared Second Shift delegation and current shift ledger when unattended work is involved

Conversation memory, morning packets, branch names, catalog entries and historical handoffs never override current repository authority.

## Active product hierarchy

`SYSTEM_MASTER` is the product root / system-of-systems.

- **SYSTEM MASTER**
  - **CORE — System Master Core / Foundation & Spine**
  - **LEARNING SYSTEM**
  - **BOOK SYSTEM**
  - **DOCUMENTS SYSTEM**

`PROSE SYSTEM` is **completed and retired**. It is not an active owner. Historical Prose branches, receipts, exact SHAs, qualification evidence and census records remain immutable provenance; its completed capability family is being integrated into DOCUMENTS.

Architecture authority: `governance/ADR-0003-DOCUMENTS-PEER-SYSTEM-AND-PROSE-RETIREMENT.md`  
Retirement authority: `governance/retirements/PROSE-SYSTEM-RETIREMENT-001.json`

## Supported chat roles

- `MASTER_ROOT` — SYSTEM_MASTER product-root controller; reads all active peer systems and shared infrastructure but is not another peer system.
- `LEARNING` — `SYSTEM_MASTER/LEARNING`.
- `BOOK` — `SYSTEM_MASTER/BOOK`.
- `DOCUMENTS` — `SYSTEM_MASTER/DOCUMENTS`.

There is no current `PROSE` owner chat role. A historical Prose chat may be used to inspect provenance, but it may not create current Prose-owned work. Any still-needed work routes to DOCUMENTS or, for Book canonical state, BOOK.

## Future-system / historical-reuse startup

The System Catalog is the durable discovery index for future-system candidates and archived capability families. It is intentionally non-authoritative: cataloging a candidate does not create a peer system.

When the user says something such as **“let’s build the Programming System”**:

1. resolve CURRENT-AUTHORITY and the System Catalog;
2. load `governance/catalog/system-packets/PROGRAMMING.json` before generic research;
3. load the Archive Source Registry and exact referenced source/evidence records;
4. recover and reconcile existing research/specification/code/test/qualification material before proposing new work;
5. apply only the current material-delta research gate to historically closed research unless evidence triggers a real reopen;
6. explicitly admit Programming into topology only if the user intends it to become a first-class peer; catalog presence alone is not admission;
7. after admission, create the full system control package atomically: topology/ADR, canonical control, current obligations, repair inbox, Second Shift delegation/worker/telemetry, morning/chat startup, and validator coverage;
8. begin at the first genuinely unclosed evidence-backed work package rather than rediscovering the domain.

The same pattern applies to every future system packet added later.

## Canonical routing

### CORE — `SYSTEM_MASTER/CORE`

Owns shared foundation/data/platform/runtime, continuity/recovery, assurance/reconciliation and shared qualification/control-plane integration.

### LEARNING — `SYSTEM_MASTER/LEARNING`

Owns Learning product architecture/runtime, curriculum, assessment, mastery/adaptation, retention/transfer and Learning-specific qualification/evidence.

### BOOK — `SYSTEM_MASTER/BOOK`

Owns canonical Book state, manuscript/story-bible/lifecycle orchestration, author decisions, version/rollback, editorial lifecycle and publication state. BOOK consumes document/prose capabilities from DOCUMENTS through explicit admitted interfaces and does not become the Documents implementation owner.

### DOCUMENTS — `SYSTEM_MASTER/DOCUMENTS`

DOCUMENTS is a first-class peer tool system with control ref `documents/control-v1`. It owns document/content artifact semantics including DOCX/PDF/PPTX, structure/conversion/preservation/render/export behavior, generic reusable writing/content artifact semantics, and the completed Prose evaluator/craft/diagnostic/revision/preservation capability family after evidence-preserving migration.

DOCUMENTS does not silently write BOOK canonical state. Historical Prose evidence remains historical exact-subject evidence and is not relabeled or transferred to changed Documents integration bytes.

## Retired Prose handling

If any current artifact tries to route an obligation, delegation, repair transaction, scheduled worker or new canonical write to `SYSTEM_MASTER/BOOK/PROSE`, classify it `RETIRED_OWNER_STALE_WORK`.

Then:

1. preserve the historical evidence unchanged;
2. close/supersede the stale Prose current-state item;
3. translate genuinely unfinished capability integration into `SYSTEM_MASTER/DOCUMENTS`;
4. route any Book canonical-state decision to `SYSTEM_MASTER/BOOK`;
5. never create a new active Prose lane merely because a historical branch/qualification still exists.

## Completion / obligation discipline

The completion ledger remains append-only historical evidence. Current work selection comes from the obligation registry selected by CURRENT-AUTHORITY — currently `WORK-OBLIGATION-REGISTRY-004.json`.

The current Documents objective is owned by `SYSTEM_MASTER/DOCUMENTS`, not the product root. When Documents closes, supersedes or materially changes its current objective, update Documents current state and `governance/second-shift/DOCUMENTS-DELEGATIONS.json` in the same working session.

The current Prose completion is not undone by integration. Integration is a new Documents-owned boundary and changed integration bytes require fresh exact-subject qualification.

## Historical evidence / catalog discipline

The Archive Source Registry and generated system packets are discovery/reuse indexes. Exact source bytes, Git refs/SHAs, Library file/version IDs, receipts and qualification artifacts remain the evidence layer.

A reusable asset must preserve:

- source locator and exact digest/identity when available;
- lifecycle/evidence class;
- system/capability affinity;
- research, implementation and qualification standing as separate dimensions;
- provenance/dependency relations;
- reuse disposition such as `REUSE_AS_IS`, `REUSE_WITH_REQUALIFICATION`, `REFERENCE_ONLY`, `MIGRATION_INPUT`, `DELTA_RESEARCH_REQUIRED`, `QUARANTINE_CONFLICT` or `IDENTITY_UNPROVEN`.

A-01 may deterministically inventory/hash/validate/extract/catalog presented evidence and emit receipts/attestations, but it may not create a system, assign semantic ownership or transfer historical PASS to a changed subject.

## Required A-01 / evidence rule

Keep separate:

1. historical code/evidence exists;
2. exact current code builds;
3. hosted/local portable tests pass;
4. authoritative A-01 qualification passes on the exact current subject;
5. production/publication/native/human/private authority exists.

Historical Prose or Document PASS never transfers to changed Documents integration subjects. Historical Programming research/build-spec evidence likewise does not imply current implementation or target qualification.

## Second Shift

Read `SECOND-SHIFT-REGISTRY-001.json::owner_files` as the machine-authoritative active lane set. Active lanes are currently:

- CORE
- LEARNING
- BOOK
- DOCUMENTS

`PROSE` is retired and must not run. The temporary `SYSTEM_MASTER` root worker lane is also retired; SYSTEM_MASTER remains the portfolio controller/orchestrator, not a peer execution lane.

Every active lane owns a delegation file and factual utilization ledger. For Documents these are:

- `governance/second-shift/DOCUMENTS-DELEGATIONS.json`
- `governance/second-shift/execution-events/YYYY-MM-DD/DOCUMENTS.json`

A stale/missing delegation, blocked critical path or completed item does not justify idle while dependency-valid independent owner work remains. Retired lanes, however, are not idle lanes and require no future events.

## Anti-surprise rule

At every chat/work start:

`LIVE LOOKUP -> OWNER/TOPOLOGY RESOLUTION -> CATALOG/PACKET RESOLUTION -> DELTA CLASSIFICATION -> RECONCILE -> CURRENT STATE -> NEXT STEP`

Do not ask the user to reconstruct architecture, archive history or previous research that current authority/catalog/source evidence can resolve. A new chat is a new working surface, not a new project state.

## Historical preservation

Historical branches, receipts, frozen artifacts, exact-SHA evidence and prior topology records are never rewritten because ownership changed. `SYSTEM-TOPOLOGY-002` and pre-retirement Prose records remain provenance; `SYSTEM-TOPOLOGY-003` controls current execution.

The historical 40-module/vault inventory is retained as discovery/reuse evidence. Its historical research status never by itself creates active topology or current implementation authority.

## Current authority

`governance/CURRENT-AUTHORITY.json` is the cross-chat current-routing selector. Any file, chat, task or branch that conflicts with it is historical/stale until explicitly admitted by current authority.
