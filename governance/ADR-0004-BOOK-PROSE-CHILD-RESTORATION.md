# ADR-0004 — Restore Prose as a Book-owned specialist child subsystem

Status: ACCEPTED
Effective date: 2026-09-10
Supersedes for current authority: ADR-0003-DOCUMENTS-PEER-SYSTEM-AND-PROSE-RETIREMENT.md only where ADR-0003 retired or reassigned Prose capability ownership.
Historical preservation: ADR-0003, PROSE-SYSTEM-RETIREMENT-001, their commits, receipts and lineage remain immutable historical evidence.

## Decision

Prose is active as a specialist literary-intelligence child subsystem beneath Book at `SYSTEM_MASTER/BOOK/PROSE`.

Book remains the canonical manuscript owner and the sole semantic owner of canonical manuscript state. Prose has no canonical manuscript-write authority, no Book-admission authority, no author authority and no independent peer-system status.

Documents remains a first-class peer system at `SYSTEM_MASTER/DOCUMENTS`, but its ownership is limited to document/artifact mechanics and generic document semantics. Documents does not own Book literary-quality authority, Book-specific Prose craft/evaluation authority, Story Bible/canon authority or canonical manuscript state.

The historical standalone Prose Second Shift lane remains retired. Active Prose work inherits the Book owner lane; no separate Prose mutation lane is created.

## Required topology

`SYSTEM_MASTER -> BOOK -> PROSE`

Book may coordinate Prose through the Book Workflow Orchestrator and Book capability routing. Prose outputs are candidates/evidence only. Canonical manuscript mutation remains possible only through the Book admission path.

## Authority boundaries

- `SYSTEM_MASTER/BOOK`: canonical manuscript, Book lifecycle, Book orchestration, author-decision routing, Book admission, Book-specific literary workflow authority.
- `SYSTEM_MASTER/BOOK/PROSE`: literary diagnosis, controlled revision candidates, literary evaluation support, voice/preservation/homogenization defenses and preference-learning behavior under Book contracts.
- `SYSTEM_MASTER/DOCUMENTS`: DOCX/PDF/PPTX/file/document artifact semantics, conversion, rendering, validation, preservation and generic document services.
- Story Bible/Canon remains Book-owned canon truth.
- Research remains external-evidence truth and never becomes canon automatically.
- Author remains final creative/semantic authority where required.

## Historical retirement record

`governance/retirements/PROSE-SYSTEM-RETIREMENT-001.json` is not deleted. It records a prior authority decision that is now superseded for current execution by this ADR. Historical exact-SHA Prose evidence remains valid only for its exact tested boundary; no PASS transfers to changed integration subjects.

## Execution-lane consequence

Prose does not receive a separate Second Shift owner file. `SYSTEM_MASTER/BOOK/PROSE` routes to the active `BOOK` lane for scheduling and execution-control purposes. This routing does not broaden Book canonical-write authority to Prose.

## Acceptance criteria

1. Current topology lists Prose as an active child of Book, not a retired successor of Documents.
2. Current authority no longer classifies `SYSTEM_MASTER/BOOK/PROSE` as retired stale work.
3. Documents ownership no longer includes Prose craft/evaluator/revision authority.
4. Second Shift preserves the historical Prose lane as retired while routing the active child path to BOOK.
5. Historical retirement artifacts remain preserved and discoverable.
6. No authority or qualification is inferred beyond exact existing evidence.
