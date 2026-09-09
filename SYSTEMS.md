# System Master — Canonical Product/System Map

`SYSTEM MASTER` is the product root and system-of-systems.

## Current hierarchy

| Owner path | Role | Canonical control |
|---|---|---|
| **SYSTEM_MASTER** | Complete product root. Owns overall architecture and contains all first-class tools, child systems, shared infrastructure and evidence lanes. | `governance/CURRENT-AUTHORITY.json` |
| **SYSTEM_MASTER/CORE** | Shared Foundation & Spine: authority/data/platform/runtime foundations, continuity/recovery, assurance/reconciliation and shared A-01/control integration. | `system-master/control-v2` |
| **SYSTEM_MASTER/LEARNING** | Learning System: learning architecture/runtime, mastery/assessment/adaptive sequencing, retention/transfer, curriculum and learning qualification. | `learning/control-v1` |
| **SYSTEM_MASTER/BOOK** | Book System: canonical book state and end-to-end book lifecycle, orchestration, author decisions, version/rollback, editorial lifecycle and publication/export. | `book-system/control-v1` |
| **SYSTEM_MASTER/BOOK/PROSE** | Prose System: Book Evaluator/evaluation, evaluator training, prose/craft training, diagnostics, revision intelligence and preservation-aware prose optimization. | `literary-prose-engine-001` |

Historical `MASTER` / `MASTER SYSTEM` foundation-and-spine references map to **CORE**. They do not name a peer product alongside System Master.

## Not systems

A-01, Assurance, Reconciliation, Continuity, Foundation, Platform, Book Evaluator, Literary Prose Engine, qualification lanes, runners, Night/Second Shift workers, branches, chats and evidence artifacts are not additional product systems. They are infrastructure, subsystems, capabilities, workstreams, implementation families, control surfaces or evidence under the hierarchy above.

## Current authority

Single startup pointer: `governance/CURRENT-AUTHORITY.json`  
Machine-readable topology: `governance/SYSTEM-TOPOLOGY-002.json`  
Architecture decision: `governance/ADR-0002-SYSTEM-MASTER-PARENT-HIERARCHY.md`  
Cross-chat bootstrap: `SYSTEM-MASTER-WORKSTREAM-BOOTSTRAP.md`

When records disagree, resolve authority through the startup pointer and live owner control before execution.

A new first-class system or parent relationship cannot be created implicitly. It requires explicit user intent plus a superseding ADR, registry change and validator update.
