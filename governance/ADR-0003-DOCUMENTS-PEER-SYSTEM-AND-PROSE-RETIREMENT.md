# ADR-0003 — Documents Peer System and Prose Retirement

Status: ACCEPTED
Effective date: 2026-09-10
Supersedes: the Document/Prose portions of ADR-0002 and SYSTEM-TOPOLOGY-002
Authority: explicit user architecture instruction

## Decision

1. `DOCUMENTS` is a first-class peer tool system directly under `SYSTEM_MASTER`.
2. `PROSE` is complete and retired as an independently owned/scheduled system.
3. The completed Prose capability family is absorbed into `DOCUMENTS` as an integrated capability family with historical provenance preserved.
4. `BOOK` and `DOCUMENTS` are peers. BOOK owns canonical book/manuscript/lifecycle state; DOCUMENTS supplies document/prose capabilities through explicit admitted interfaces.
5. No active Prose chat role, Second Shift lane, current obligation lane or repair lane remains after transition.
6. DOCUMENTS receives its own control ref, current obligations, Second Shift delegation, utilization ledger and scheduled worker.

## Why

The prior topology incorrectly treated Documents as a non-system headless portfolio and Prose as a live child under Book. That no longer matches the intended product architecture or current implementation state. Documents is one of the main tools in System Master and must participate in the same first-class lifecycle, authority, scheduling and evidence controls as Learning and Book. Prose has reached completion and continuing to operate it as a separate owner creates duplicate scheduling, stale obligations and an incorrect parent boundary.

## New active hierarchy

- SYSTEM_MASTER
  - CORE
  - LEARNING
  - BOOK
  - DOCUMENTS

`PROSE` is retained only in historical/retirement metadata.

## Documents ownership

DOCUMENTS owns:

- DOCX/PDF/PPTX/document artifact semantics, structure, conversion, preservation, rendering and export behavior;
- generic reusable writing/content artifact semantics outside another system's canonical state;
- the completed Prose evaluator, prose/craft intelligence, diagnostics, calibration, revision-intelligence and preservation capability family after migration;
- Documents-specific qualification, current state, obligations and Second Shift work;
- service interfaces exposing document/prose capabilities to BOOK and other peer systems.

DOCUMENTS does not silently acquire BOOK canonical manuscript, author-decision, lifecycle or publication state. BOOK remains canonical writer for those objects.

## Prose retirement semantics

Historical Prose exact-SHA evidence remains valid only for the exact historical subject and boundary it proved. It is never rewritten as Documents evidence and never transferred to changed integration bytes. Any still-useful Prose limitation, test, fixture, model, rubric, evaluator or preservation contract is migrated as an input to DOCUMENTS and freshly qualified when integration changes executable bytes or semantics.

Any current Prose obligation discovered after this ADR is stale current-state metadata. It must be closed/superseded or translated into a DOCUMENTS-owned integration obligation without resurrecting Prose as an owner.

## Second Shift

Active owner lanes become `SYSTEM_MASTER`, `CORE`, `LEARNING`, `BOOK`, and `DOCUMENTS`. `PROSE` is removed from the active owner registry. The prior Prose delegation file remains historical evidence only. The Prose scheduled worker is disabled; a Documents worker takes its place.

## Migration rule

The transition is complete only when topology, current authority, current obligation selection, Second Shift owner registry, chat/bootstrap contracts, controller/handoff automation and state-reconciliation validation all agree on the new hierarchy.
