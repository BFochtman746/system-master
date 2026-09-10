# System Master — Canonical Product/System Map

`SYSTEM MASTER` is the product root and system-of-systems.

## Current active hierarchy

| Owner path | Role | Canonical control |
|---|---|---|
| **SYSTEM_MASTER** | Product-root governance/orchestration. It is not a peer worker system. | `governance/CURRENT-AUTHORITY.json` |
| **SYSTEM_MASTER/CORE** | Shared Foundation & Spine: authority/data/platform/runtime foundations, continuity/recovery, assurance/reconciliation and shared A-01/control integration. | `system-master/control-v2` |
| **SYSTEM_MASTER/LEARNING** | Learning System: learning architecture/runtime, mastery/assessment/adaptive sequencing, retention/transfer, curriculum and Learning qualification. | `learning/control-v1` |
| **SYSTEM_MASTER/BOOK** | Book System: canonical book/manuscript/story-bible state and end-to-end lifecycle, author decisions, version/rollback, editorial lifecycle and publication/export. | `book-system/control-v1` |
| **SYSTEM_MASTER/DOCUMENTS** | Documents System: document/content artifact semantics and implementation, DOCX/PDF/PPTX/OCR/file/writing capabilities, plus the completed Prose evaluator/craft/diagnostic/revision/preservation capability family as it is absorbed and freshly integrated. | `documents/control-v1` |

## Retired system

**PROSE** is completed and retired. Its historical path was `SYSTEM_MASTER/BOOK/PROSE`; its successor for still-useful capability implementation is **DOCUMENTS**. Historical Prose branches, qualification IDs, exact-SHA receipts, private/blind/author evidence and implementation lineage remain immutable provenance. They do not create a current Prose owner and their PASS does not transfer to changed Documents subjects.

BOOK and DOCUMENTS are peers. BOOK retains canonical book/manuscript/lifecycle/author state. DOCUMENTS supplies admitted document/prose capabilities and may not silently mutate BOOK canonical state.

Historical `MASTER` / `MASTER SYSTEM` foundation-and-spine references map to **CORE**. They do not name a peer product alongside System Master.

## Infrastructure, capabilities and historical identities — not active peer systems

A-01, Assurance, Reconciliation, Continuity, Foundation, Platform, qualification lanes, runners, Night/Second Shift workers, branches, chats and evidence artifacts are not additional product systems. `Book Evaluator`, `Literary Prose Engine`, `LITERARY-PROSE`, and `BOOK-EVAL-LEMONADE-001` are historical capability/workstream/implementation identities whose current owner resolution is DOCUMENTS when new work is actually authorized.

The historical 40-module/vault inventory is discovery and reuse evidence, not present topology. Future system candidates may be cataloged without becoming active systems.

## Current authority

Single startup pointer: `governance/CURRENT-AUTHORITY.json`  
Machine-readable topology: `governance/SYSTEM-TOPOLOGY-003.json`  
Architecture decision: `governance/ADR-0003-DOCUMENTS-PEER-SYSTEM-AND-PROSE-RETIREMENT.md`  
Prose retirement: `governance/retirements/PROSE-SYSTEM-RETIREMENT-001.json`  
Cross-chat bootstrap: `SYSTEM-MASTER-WORKSTREAM-BOOTSTRAP.md`

When records disagree, resolve authority through the startup pointer and live owner control before execution.

A future first-class system or parent relationship cannot be created implicitly by a branch, archive, module name, catalog entry, A-01 qualification, chat or scheduled task. It requires explicit user intent plus a superseding topology/ADR/registry transaction. Cataloging a future system is discovery metadata only.
