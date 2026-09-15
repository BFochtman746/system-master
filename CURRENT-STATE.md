# CURRENT STATE — System Master

**Canonical session entry point.** This document is derived from `governance/CURRENT-AUTHORITY.json` (`CURRENT-AUTHORITY-005`, effective 2026-09-13). If any derived document disagrees with that authority, the derived document is stale and must be regenerated as part of the same authority transaction.

## Authority lock

- **Authority:** `CURRENT-AUTHORITY-005`
- **Selected topology:** `governance/SYSTEM-TOPOLOGY-007.json`
- **Architecture decision:** `governance/ADR-0006-PROGRAMMING-PEER-ADMISSION-WEBSITE-BUILDING.md`
- **Completion status:** `governance/SYSTEM-COMPLETION-STATUS-002.json`
- **Obligation registry:** `governance/WORK-OBLIGATION-REGISTRY-017.json`
- **Capability crosswalk:** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
- **Central objective:** `FOUNDATION-1-0-CLOSURE-001`
- **Highest discretionary objective:** `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001`

## Current product topology

`SYSTEM_MASTER` is the product root. It has exactly **nine active peer systems**, all **incomplete**:

| Peer | Canonical owner path | Control ref |
|---|---|---|
| CORE | `SYSTEM_MASTER/CORE` | `system-master/control-v2` |
| LEARNING | `SYSTEM_MASTER/LEARNING` | `learning/control-v1` |
| BOOK | `SYSTEM_MASTER/BOOK` | `book-system/control-v1` |
| DOCUMENTS | `SYSTEM_MASTER/DOCUMENTS` | `documents/control-v1` |
| SPREADSHEET_DATA | `SYSTEM_MASTER/SPREADSHEET_DATA` | `spreadsheet-data/control-v1` |
| MEDIA | `SYSTEM_MASTER/MEDIA` | `media/control-v1` |
| CONNECTED_ACTIONS | `SYSTEM_MASTER/CONNECTED_ACTIONS` | `connected-actions/control-v1` |
| RESEARCH_KNOWLEDGE | `SYSTEM_MASTER/RESEARCH_KNOWLEDGE` | `research-knowledge/control-v1` |
| PROGRAMMING | `SYSTEM_MASTER/PROGRAMMING` | `programming/control-v1` |

`PROGRAMMING` is an admitted peer and continues the preserved Programming engineering lineage; prior work-program evidence is continuity input, not work to restart.

`WEBSITE_BUILDING` is capability **C40** owned by `SYSTEM_MASTER/PROGRAMMING`. It is a first-class Programming capability, **not** a tenth peer. Browser/action side-effect authority remains with `CONNECTED_ACTIONS` and explicit user authority is still required for external side effects.

`PROSE` is historically complete and terminally retired. It has no active execution, repair, qualification, telemetry, research, or successor lane. Any genuinely unfinished integration of preserved completed Prose capability is BOOK-owned. DOCUMENTS receives no Prose work.

## Completion truth

`SYSTEM_MASTER` and all nine active peers are incomplete. A completed phase, packet, test, branch, qualification, work-package, or receipt does not make an owning system complete. Exact-SHA evidence remains bound to its original subject and is never broadened by relabeling.

## Work-selection truth

`FOUNDATION-1-0-CLOSURE-001` is the central objective. It maintains the C00-C49 / P00-P15 crosswalk and one foundation disposition for every capability. `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001` remains the highest discretionary System Master priority while selected and supports Programming custody/provenance without taking Programming semantic ownership.

## Non-negotiable execution rules

1. Re-fetch live owner/control state before mutation; sealed checkpoints are coherent snapshots, not automatically live truth.
2. At most one mutation-capable claim may exist per active peer lane.
3. Peers retain their semantic ownership and integrate upward only through explicit interfaces.
4. Repository execution readiness does not grant human, private, native, publication, production, credential, external-provider, or user-action authority.
5. Historical evidence and exact-SHA receipts remain append-only. Never relabel a receipt to clear an authority mismatch.
6. Before ending substantive work, reconcile affected obligation/delegation/repair state and bind one exact dependency-valid successor inside the same owner lane.
