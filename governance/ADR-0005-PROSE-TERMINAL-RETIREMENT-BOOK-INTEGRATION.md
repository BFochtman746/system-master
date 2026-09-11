# ADR-0005 — Prose terminal retirement with Book-owned integration

Status: ACCEPTED
Effective date: 2026-09-11
Authority: explicit user architecture instruction
Supersedes for current execution: ADR-0004-BOOK-PROSE-CHILD-RESTORATION.md and the Documents-absorption portions of ADR-0003-DOCUMENTS-PEER-SYSTEM-AND-PROSE-RETIREMENT.md
Preserves: governance/retirements/PROSE-SYSTEM-RETIREMENT-001.json and all historical Prose evidence

## Decision

1. `PROSE` is complete and retired. There is no remaining Prose product work.
2. The active first-class peer systems remain `CORE`, `LEARNING`, `BOOK`, and `DOCUMENTS` under `SYSTEM_MASTER`.
3. Prose has no active owner path, child execution path, inherited execution path, Second Shift lane, repair lane, qualification lane, research task, telemetry ledger, successor task, or independent mutation claim domain.
4. Any genuinely unfinished integration of already-completed Prose capability into the Book product is ordinary `SYSTEM_MASTER/BOOK` work owned, scheduled, repaired, qualified, and telemetered by BOOK. The integration work is not continuing Prose work and does not resurrect Prose.
5. `DOCUMENTS` receives no Prose work. Documents remains a peer system for generic document/artifact mechanics and explicit document-service interfaces only.
6. Historical records that describe Prose as active, as a Book child, as inheriting Book execution, or as a Documents capability are `STALE_ARCHITECTURE_PENDING_RECONCILIATION` for current dispatch. They remain immutable provenance and cannot dispatch work.

## Active hierarchy

- `SYSTEM_MASTER`
  - `CORE`
  - `LEARNING`
  - `BOOK`
  - `DOCUMENTS`

`PROSE` appears only in retired/historical metadata and in provenance references needed to identify completed capability evidence consumed by Book integration.

## Book integration boundary

BOOK remains the sole owner of canonical manuscript, Story Bible/canon, author-decision routing, lifecycle, admission, versioning/rollback, and publication state.

Book may build or qualify adapters, context/compiler bindings, routing, or orchestration that consume preserved completed Prose capability artifacts. Those changed Book integration bytes require fresh Book-owned evidence. No historical Prose PASS transfers to changed Book bytes.

A Book integration objective may retain a historical name containing `PROSE` when renaming would break lineage, but its current owner must be `SYSTEM_MASTER/BOOK`, it must not declare a Prose owner/specialist execution path, and its successor must remain Book-owned.

## Second Shift and telemetry

The only active peer lanes are `CORE`, `LEARNING`, `BOOK`, and `DOCUMENTS`. The controller must compare current topology peers with the Second Shift registry and provision missing coverage only for an already-declared peer when the owner/control/obligation mapping is machine-resolvable. It must never create a new system from a branch, task, chat, module, or missing lane.

Retired systems are never auto-provisioned. No new Prose telemetry is created or expected. Book-owned integration activity is recorded only as BOOK activity.

## Repair and qualification

There is no active Prose repair or qualification lane. A demonstrated defect in Book-owned integration around completed Prose artifacts is a BOOK subject/integration defect and routes to BOOK. A historical defect in an immutable Prose subject remains historical evidence unless the user explicitly reopens Prose product scope.

A-01, exact-SHA, source-custody, canonical-writer, human, author, private, native, external, publication, and production boundaries remain unchanged.

## Knowledge Recovery priority

While `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001` is selected by CURRENT-AUTHORITY, it is the highest discretionary System Master priority. CORE must prioritize the Programming proving-corpus recovery, then the remaining authorized catalog/archive recovery, after non-discretionary safety/control integrity and without taking peer-system product semantics.

## Acceptance criteria

1. CURRENT-AUTHORITY selects a topology in which the active peers are exactly CORE, LEARNING, BOOK, and DOCUMENTS and Prose is retired.
2. Second Shift owner files are exactly the active peer lanes and contain no standalone or inherited Prose execution.
3. Current obligations contain no active Prose-owned obligation; any still-open completed-Prose integration is BOOK-owned.
4. Repair routing contains no active Prose inbox or child route.
5. Telemetry permits and expects only active peer lanes; Prose is historical only.
6. Documents contains no Prose integration objective.
7. Knowledge Recovery 001 is restored as the highest discretionary priority while selected.
8. Historical Prose evidence remains discoverable and unchanged.