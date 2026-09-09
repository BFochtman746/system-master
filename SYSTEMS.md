# System Master — Canonical Four-System Map

There are **exactly four systems** in this repository.

| System | Role | Parent | Canonical control |
|---|---|---|---|
| **MASTER SYSTEM** | Foundation and spine: shared platform/data, execution foundations, continuity/recovery, assurance/reconciliation, operator/runtime foundations and shared integration/control-plane concerns | — | `system-master/control-v2` |
| **LEARNING SYSTEM** | Learning architecture, runtime, mastery/assessment/adaptive sequencing, retention/transfer design, learner/pilot software and learning qualification | — | `learning/control-v1` |
| **BOOK SYSTEM** | Parent end-to-end book lifecycle: canonical book state, planning/orchestration, admission, author decisions, version/rollback, publication/export | — | `book-system/control-v1` |
| **PROSE SYSTEM** | Book/prose evaluation, Book Evaluator, evaluator/judge training, prose/craft training, diagnostics, revision intelligence and preservation-aware prose optimization | BOOK SYSTEM | `literary-prose-engine-001` |

## Not systems

A-01, Assurance, Reconciliation, Continuity, Foundation, Platform, Book Evaluator, Literary Prose Engine, qualification lanes, runners, Night/Second Shift workers, branches, chats and evidence artifacts are **not additional systems**. They are infrastructure, subsystems, capabilities, workstreams, implementation families, control surfaces or evidence owned by one of the four systems.

## Authority

Machine-readable topology: `governance/SYSTEM-TOPOLOGY-001.json`  
Architecture decision: `governance/ADR-0001-FOUR-SYSTEM-TOPOLOGY.md`  
Cross-chat bootstrap: `SYSTEM-MASTER-WORKSTREAM-BOOTSTRAP.md`

When names conflict, resolve authority in this order:

`SYSTEM-TOPOLOGY -> canonical system control -> system-owned workstream/capability state -> qualification/evidence -> branch/workflow label -> chat/task title`.

A fifth system cannot be created implicitly. It requires explicit user intent and a superseding topology ADR + registry/validator update.
