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

## Where the runtime actually lives — read before building anything

Sessions cannot see each other's work, so the rational move on not finding a component is to build it. That has produced repeated duplicate implementations of the same thing. **Before writing any component, check `SYSTEM-MAP.md` — "Enforcement subsystem directories", "Session admission", and "Bootstrap / authority bootstrap — inventory before you write another one" — and search the branch landscape, not only `main`.** Content existing nowhere but a single branch is common here.

| Concern | Where it is | Honest status |
|---|---|---|
| Bootstrap / authority bootstrap controller | `control-gateway/src/github-authority-bootstrap.js` (library, 169 lines) + `.github/scripts/control-gateway-authority-bootstrap.js` (CI wrapper, 67 lines) | **Exists, tested, gated — do not rewrite.** ONE two-layer implementation, not duplicates: the wrapper imports the library. 21/21 tests pass. Now also in the local suite. Full inventory and off-`main` dispositions in `SYSTEM-MAP.md`. |
| Java authority registry bootstrap | `FoundationAuthorityBootstrap.java` (`foundation-spine/system-root/`) | **A distinct component, deliberately not merged** with the above — in-process Java registry, not a GitHub authority write. Tested by 2 Java tests. Registry is in-memory only. |
| Single-writer admission for governed files | `system-master/control-gateway-lock` | Real and tested. Enforced on every PR by two required checks. |
| Claim lifecycle `READY → CLAIMED → DONE/FAILED` | `system-master/execution-claims` | Real and tested **within one run**. Ledger is in-memory — no cross-run recovery. |
| Unattended driver + Actions dispatch | `system-master/execution-driver` | Real and tested, both ceilings mutation-proofed. For the **scheduled** driver `DONE` still attests Actions **accepted** the work, **not** that the run finished — it constructs a bare `ActionsDispatch`. |
| Run completion polling | `ActionsRunPoller` (`system-master/execution-driver`) | **On `main`, 47 checks passing, four bounds + correlation mutation-proofed — do not rewrite.** Decorator at the `Dispatch` seam; wrapped, `DONE` means the run concluded `success`. **Not wired into `ClaimDriverMain` yet.** Precondition 1 (run title correlation) is **closed** — `claim-work.yml` now sets `run-name: Claim Work [<claim id>]`, proved against the real matcher by `ClaimWorkCorrelationTest`. Precondition 2 is **closed** — `ActionsRuns` (45 checks) is the real GitHub-API-backed `Runs`, with a load-bearing created-at floor because run history already contains old runs titled with claim ids. Still open: the wiring — `ClaimDriverMain` still constructs a bare `ActionsDispatch`, and no end-to-end Actions run has proved `DONE`-after-completion in production. |
| Chat session admission | `control-gateway/src/` + `control-gateway/test/` | On `main`, 6 cases passing. Consolidated 2026-09-17; an orphan duplicate was deleted. |
| A-01 local inference topology | `governance/A01-LOCAL-INFERENCE-TOPOLOGY-001.md` | **Verified by measurement 2026-09-18** (Actions run `35302276922` on runner `A-01`). Lemonade Server answers OpenAI-compatible on `http://localhost:13305/api/v1` with 8 models loaded; Ollama not live, consistent with doctrine. **The port is 13305, not the documented 8000** — every default was actively refused. Loopback on that box only, so `ModelDispatch` must run on `[self-hosted, Windows, X64]`. The control plane still performs no inference; this records topology, not a capability. |
| Control-gateway suite locally gated | `verify.sh` section 6 | **Gated as of 2026-09-17.** 33 tests (31 node + 2 python) under `control-gateway/test/` were referenced by 21 CI workflows and run by no local section; plain `verify.sh` now runs them all behind a discovery floor so an emptied suite refuses instead of passing. All 33 already passed — this closed an observability gap, not a defect backlog. Suite count 41 → 42. |
| Truth of these two documents | `.github/scripts/document-truth-qualify.py` | **Gated as of 2026-09-17.** Fails the suite when this document or `SYSTEM-MAP.md` names a file the tree does not contain — the defect behind PR #238 and #240. Lines that explicitly describe something as absent are exempt, so "Known absent" stays sayable. Runs six negative self-proofs before every check, so it cannot pass by inspecting nothing. Current: 54 path assertions checked, 8 documented-absent, 0 contradicted. |
| Durable claim ledger, registry persistence | — | **Absent from `main`.** Registry persistence exists off-`main` on `foundation-root-authority-registry` (sole custodian — do not delete). See "Known absent" in `SYSTEM-MAP.md` before assuming otherwise. |

Two mechanical traps that have each cost a session: operation identity comes from the **PR event payload**, so re-running a workflow run can never pick up an edited title or body — make a new commit instead; and a `System-File-Lease` trailer is required only under `governance/`, while operation identity is required for all of `control-gateway/**`.

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
