# ADR-0001 — Four-System Topology and Reserved Vocabulary

Status: **ACCEPTED / LOCKED**  
Effective date: 2026-09-09

## Context

System Master accumulated many legitimate branches, qualification lanes, evidence lanes, repair lines and scheduled workers. Over time, labels such as workstream, project, engine, qualification lane, branch and chat were sometimes treated as though they were peer product systems. Repository history already records this failure as control-plane scope conflation. The result was routing confusion even when underlying code and exact-SHA qualification evidence remained intact.

The user has defined the intended product architecture unambiguously: there are four systems being built.

## Decision

The canonical system landscape is exactly:

1. **MASTER SYSTEM** — foundation and spine.
2. **LEARNING SYSTEM** — learning development and operation.
3. **BOOK SYSTEM** — end-to-end book lifecycle and parent orchestration.
4. **PROSE SYSTEM** — child of Book System; owns evaluation, evaluator training, prose/craft training, diagnostics and preservation-aware prose optimization.

The machine-readable authority is `governance/SYSTEM-TOPOLOGY-001.json`.

`SYSTEM` is a reserved architecture term. A branch, chat, ticket, workflow, qualification ID, implementation family or workstream can never become a new system merely by being named or operated independently.

Assurance/reconciliation and continuity are Master subsystems/functions. A-01 is shared qualification/control infrastructure. Book Evaluator is a Prose System capability/qualification lane. Literary Prose Engine is the current Prose implementation family. Night/Second Shift is an execution mechanism.

## Authority rule

When labels conflict, authority resolves in this order:

`SYSTEM-TOPOLOGY registry -> canonical system control record -> system-owned workstream/capability record -> qualification/evidence -> branch/workflow name -> chat/task title`.

Chats never create architecture authority.

## Change control

A fifth system is forbidden unless the user explicitly intends a new top-level system and a new ADR supersedes this one. The superseding change must update the machine-readable topology and its validator together.

Accepted ADRs are historical records. They are not silently edited to change the decision; a later decision supersedes them.

## Consequences

- Portfolio reports must have exactly four system headings.
- Subsystems and workstreams are nested beneath their owning system.
- A-01 registry workstream IDs retain historical/execution identity but are mapped to one of the four system owners.
- Scheduled second-shift workers mirror the four-system landscape; portfolio controller and morning handoff remain shared infrastructure/control surfaces, not systems.
- Exact-SHA qualification remains unchanged; this ADR changes control taxonomy only.
