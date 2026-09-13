# System Master — Canonical Product/System Map

`SYSTEM_MASTER` is the product root and system-of-systems. It is not a peer worker lane.

## Current active hierarchy

| Owner path | Role | Canonical control |
|---|---|---|
| **SYSTEM_MASTER** | Product-root governance, sequencing, integration and acceptance. | `governance/CURRENT-AUTHORITY.json` |
| **SYSTEM_MASTER/CORE** | Shared Foundation & Spine: runtime, data/platform primitives, continuity/recovery, assurance/reconciliation and shared A-01/control integration. | `system-master/control-v2` |
| **SYSTEM_MASTER/LEARNING** | Learning architecture/runtime, curriculum, mastery, assessment, adaptive sequencing, retention/transfer and Learning qualification. | `learning/control-v1` |
| **SYSTEM_MASTER/BOOK** | Canonical book/manuscript/Story Bible state and end-to-end Book lifecycle, author decisions, version/rollback and publication. | `book-system/control-v1` |
| **SYSTEM_MASTER/DOCUMENTS** | DOCX/PDF/PPTX/OCR/file/document artifact structure, conversion, preservation, rendering and export. | `documents/control-v1` |
| **SYSTEM_MASTER/SPREADSHEET_DATA** | Spreadsheet, math, user-data analysis, BI and ledger product semantics over Core shared data/execution primitives. | `spreadsheet-data/control-v1` |
| **SYSTEM_MASTER/MEDIA** | Image, photo, video, voice, audiobook and general media product semantics over Core shared storage/runtime. | `media/control-v1` |
| **SYSTEM_MASTER/CONNECTED_ACTIONS** | Browser, communications, calendar and plugin/action policy over Core shared connector runtime. | `connected-actions/control-v1` |
| **SYSTEM_MASTER/RESEARCH_KNOWLEDGE** | Research, knowledge and geospatial retrieval/provenance semantics; consumes admitted browser capability from Connected Actions. | `research-knowledge/control-v1` |

All eight peer systems are active and incomplete. Each remains semantically isolated and integrates upward into System Master through explicit interfaces. Shared implementation primitives remain Core-owned unless a current authority record says otherwise.

## Retired system

**PROSE** is historically complete and terminally retired. Its historical path is `SYSTEM_MASTER/BOOK/PROSE`. It has no active execution, repair, qualification, research, telemetry, mutation-claim or successor lane.

Any genuinely unfinished integration of preserved completed Prose capability is ordinary **BOOK-owned** work. **DOCUMENTS never receives Prose work.** Historical Prose branches, qualification IDs, exact-SHA receipts, private/blind/author evidence and implementation lineage remain immutable provenance; their PASS never transfers to changed current subjects.

BOOK and DOCUMENTS remain peers. BOOK retains canonical manuscript/Story Bible/lifecycle/author state. DOCUMENTS supplies admitted generic document/artifact services and may not silently mutate Book canonical state.

## Active non-peer work program

**PROGRAMMING** remains an incomplete active work program with preserved engineering semantics and evidence continuity. It is not an admitted peer system and has no peer Second Shift lane until an explicit future authority transaction admits it. Knowledge Recovery may support custody/provenance but does not replace Programming engineering work.

## Infrastructure, capabilities and historical identities — not additional systems

A-01, Assurance, Reconciliation, Continuity, Foundation, Platform, qualification lanes, runners, Night/Second Shift workers, branches, chats and evidence artifacts are infrastructure or working surfaces, not additional product systems. `Book Evaluator`, `Literary Prose Engine`, `LITERARY-PROSE`, and `BOOK-EVAL-LEMONADE-001` are historical capability/workstream identities and do not create a current Prose owner.

The historical module/vault inventory is discovery and reuse evidence, not topology. A future first-class system or parent relationship cannot be created implicitly by a branch, archive, module name, catalog entry, A-01 qualification, chat or scheduled task. It requires explicit user intent plus a superseding topology/authority transaction.

## Current authority

Single startup pointer: `governance/CURRENT-AUTHORITY.json`  
Machine-readable topology: `governance/SYSTEM-TOPOLOGY-006.json`  
Architecture decision: `governance/ADR-0005-PROSE-TERMINAL-RETIREMENT-BOOK-INTEGRATION.md`  
Prose retirement: `governance/retirements/PROSE-SYSTEM-RETIREMENT-001.json`  
Cross-chat bootstrap: `SYSTEM-MASTER-WORKSTREAM-BOOTSTRAP.md`

When records disagree, resolve authority through the startup pointer, selected topology/job/completion records and live owner control before execution.
