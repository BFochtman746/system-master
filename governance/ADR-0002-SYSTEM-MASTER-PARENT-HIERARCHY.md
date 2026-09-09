# ADR-0002 — System Master Parent Hierarchy

Status: **ACCEPTED**  
Date: 2026-09-09  
Supersedes for current topology: `ADR-0001-FOUR-SYSTEM-TOPOLOGY.md`

## Decision

`SYSTEM MASTER` is the product root and system-of-systems. The current internal hierarchy is:

- `SYSTEM MASTER`
  - `CORE` — System Master Core / Foundation & Spine
  - `LEARNING` — Learning System
  - `BOOK` — Book System
    - `PROSE` — Prose System

The prior four-peer-system model was a useful anti-drift repair but one abstraction level too flat. The August 31 Foundation & Spine forensic audit already described Learning, manuscript/book, curriculum and the other product capabilities as workloads the common System Master spine must carry. The corrected hierarchy therefore makes System Master the parent product, treats Foundation & Spine as its shared Core, places Learning and Book inside System Master, and keeps Prose as a child of Book.

## Why

The previous topology solved branch/workstream/chat conflation but incorrectly made `MASTER`, `LEARNING`, `BOOK` and `PROSE` look like peers. That contradicted the intended product architecture: Learning and Book are first-class tools inside System Master and depend on the shared System Master foundation/spine. Prose is a specialized child system of Book.

This ADR also prevents `MASTER SYSTEM` from being used ambiguously. Historical uses of `MASTER` / `MASTER SYSTEM` now map to `CORE`; `SYSTEM MASTER` is reserved for the product root.

## Ownership consequences

- Core owns shared foundation/data/platform/runtime, continuity/recovery, assurance/reconciliation and shared qualification/control integration.
- Learning owns Learning product behavior, learner/mastery state, adaptive/assessment logic and Learning evidence/qualification.
- Book owns canonical book state and the end-to-end book lifecycle.
- Prose owns Book Evaluator/evaluation, evaluator training and prose/craft intelligence, but cannot self-write Book canonical state without Book admission.
- A-01, runners, scheduled workers and qualification artifacts are infrastructure/evidence, not product systems.

## Reallocation rule

Existing branches, commits, receipts and artifacts are not renamed or rewritten. Their ownership is reclassified through `SYSTEM-TOPOLOGY-002.json` and the reallocation ledger. Reallocation changes control taxonomy only; exact-SHA qualification and historical provenance remain bound to the original subjects.

## Anti-surprise rule

No chat, branch, workstream, ticket, workflow or new artifact may become current authority merely because it is newer. Every working surface must resolve through `governance/CURRENT-AUTHORITY.json` to the product topology, the owning system control record, the current state registry and the evidence/obligation/delegation ledgers.

## Supersession

This ADR is immutable after acceptance. A future architecture change requires a new ADR that explicitly supersedes this one; do not silently edit the meaning of this decision.
