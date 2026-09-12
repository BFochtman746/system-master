# BOOK SYSTEM RECONSTRUCTION BLUEPRINT 001

Effective date: 2026-09-11
Owner: SYSTEM_MASTER/BOOK
Control ref: book-system/control-v1
Standing: ACTIVE CONTROLLING RECONSTRUCTION METHOD

## Purpose

Reconstruct the Book System by capability domain in dependency order, using current Book code, preserved historical literary code/evidence, qualification code, tests, workflows, research and design as evidence. Historical documents are archaeological evidence only; they do not decide current ownership, optionality, completion, installation or architecture.

The active product model contains one Book System. Historical names such as Prose, Literary Prose Engine, Book Evaluator and Creative Excellence may remain in immutable provenance, filenames or historical receipts, but they do not define separate current systems. Recovered capabilities from those lineages are adjudicated as Book System capabilities.

No recovered Book capability is discarded merely because an older document called it optional, deferred, child-owned or future work. Capability removal requires an explicit current rationalization decision and recorded rationale.

## Dependency-ordered capability domains

| ID | Domain | Responsibility |
|---|---|---|
| B00 | Book Foundation & Authority | identity, canonical state, object model, authority, provenance, rights, versioning, rollback, admission, immutable history |
| B01 | Execution Foundation | capability contracts, context compilation, routing, workflow state, dependency/execution planning, scheduler, persistence, concurrency, retry/idempotency, failures, cancellation, evidence |
| B02 | Source Intake & Existing-Book Recovery | import, custody, structural recovery, chapter/scene reconstruction, edition/version lineage, comments/revisions and semantic extraction inputs |
| B03 | Canonical Book Knowledge Model | Story Bible, entities, events, chronology, causal graph, knowledge states, relationships, arcs, promises, setup/payoff, motifs, themes and open questions |
| B04 | Book Understanding & Reader Intelligence | passage/scene/chapter purpose, narrative state, character state, reader state, information release, perspective, pacing, attention, tension and comprehension |
| B05 | Literary & Craft Intelligence | craft dimensions, specialists, diagnostics, Craft Academy, reference intelligence, contrastive craft and opportunity ranking |
| B06 | Writing & Revision Intelligence | drafting, scene/chapter generation, bounded revision, ambition levels, candidate generation and preservation constraints |
| B07 | Independent Evaluation & Calibration | original-vs-candidate evaluation, blind evaluation, calibration, abstention, regression detection, human alignment and empirical quality validation |
| B08 | Voice, Preference & Identity Learning | author/project/book/character voice, preference learning, voice evolution, rejected-direction memory and anti-homogenization |
| B09 | Whole-Book & Long-Form Intelligence | cross-chapter arcs, distant dependencies, coherence, synthesis, contradiction/debt detection, hard gates and adversarial evaluation |
| B10 | Authoring & Editorial Lifecycle | planning, drafting, structural review, line/style review, author decisions, copy edit, style sheet, invalidation/reopening and proof acceptance |
| B11 | Output, Freeze & Publication | exact manuscript freeze, Documents integration, rendering/proof handoff, export identity, release state and publication/delivery authority |

## Mandatory closure cycle for every domain

Each domain executes the following sequence. Later stages may not silently bypass earlier decisions.

1. RECOVER — gather all relevant current runtime, historical implementation, qualification code, tests, workflows, research and design evidence.
2. INVENTORY — produce a lossless atomic capability and artifact inventory.
3. ANALYZE — identify gaps, duplicates, weak implementations, incorrect placement, stale assumptions and unresolved ownership/interface boundaries.
4. RESEARCH — research only decisions for which external evidence can materially change the design, then compare alternatives against System Master constraints.
5. ADJUDICATE — classify each item as KEEP-AS-IS, KEEP-BUT-REFACTOR, MIGRATE-INTO-BOOK, MERGE, REPLACE, BUILD, DELEGATE or REMOVE. REMOVE requires written rationale and may not erase historical evidence.
6. DESIGN-LOCK — freeze responsibilities, non-responsibilities, data/state ownership, invariants, interfaces, commands, queries, events, errors, transactions, authority boundaries, persistence rules, dependencies and proof criteria.
7. BUILD — prefer reuse -> adapt -> consolidate -> fill gaps -> rewrite only when justified.
8. QUALIFY-AND-CALIBRATE — prove the changed domain in isolation and in the cumulative Book stack through the current domain.
9. FREEZE — freeze only after required qualification/calibration succeeds or an exact blocker is explicitly preserved. A blocked external/human/native/private/publication/A-01 fence is not converted into a synthetic PASS.

## Implementation truth classes

Every recovered implementation is classified as one of:

- MAIN-INSTALLED — executable implementation is materialized in the canonical integrated system.
- BOOK-BRANCH-BUILT — real executable Book code exists on the authoritative Book owner branch but is not yet proven installed upward.
- HISTORICAL-BOOK-CODE — real executable code exists only in preserved historical Book/literary lineage and must be migrated/adapted before current use.
- QUALIFIER-ONLY — behavior exists only in a test/qualification script or harness and is not a reusable production Book implementation.
- DESIGNED-NOT-INSTALLED — required design/capability exists but reusable reachable implementation is not proven.
- EXTERNAL-REQUIRED — Book owns the requirement/acceptance contract but execution depends on an explicitly owned external/shared provider or authority.

A registry entry, design document, historical PASS, test harness or `callable=true` declaration does not by itself prove a capability is installed.

## Installation proof rule

A capability is considered installed only when the evidence chain demonstrates:

requirement -> current executable implementation or admitted adapter -> reachable Book runtime call path -> execution evidence -> qualification evidence.

Where quality is empirical rather than purely deterministic, the chain additionally includes the relevant calibration evidence.

## Continuous testing and calibration rule

Testing and calibration are continuous, not a final clean-up stage.

For domain Bnn, closure requires both:

1. ISOLATED QUALIFICATION — tests and calibrates the changed domain against its locked contract.
2. CUMULATIVE REGRESSION QUALIFICATION — tests all completed domains B00 through Bnn together against prior frozen invariants and new integration behavior.

Required cumulative sequence:

- B00: B00 isolated + B00 cumulative baseline.
- B01: B01 isolated + B00-B01 cumulative.
- B02: B02 isolated + B00-B02 cumulative.
- B03: B03 isolated + B00-B03 cumulative.
- B04: B04 isolated + B00-B04 cumulative.
- B05: B05 isolated + B00-B05 cumulative.
- B06: B06 isolated + B00-B06 cumulative.
- B07: B07 isolated + B00-B07 cumulative.
- B08: B08 isolated + B00-B08 cumulative.
- B09: B09 isolated + B00-B09 cumulative.
- B10: B10 isolated + B00-B10 cumulative.
- B11: B11 isolated + B00-B11 full-system Book qualification.

Any later domain that invalidates a frozen earlier invariant automatically reopens the affected earlier domain for exact-scope analysis, repair and fresh cumulative qualification. Prior PASS does not transfer across changed subject bytes or changed semantics.

## Calibration classes

Deterministic validation and empirical literary-quality calibration are different evidence classes.

- DETERMINISTIC: schemas, identity, state transitions, permissions, invariants, persistence, concurrency, idempotency, routing, exact digests and reproducibility.
- MODEL/BEHAVIORAL: extraction accuracy, classification reliability, diagnostic precision/recall, evaluator robustness, abstention behavior and regression detection.
- BLIND/PAIRWISE: position-swapped or otherwise controlled literary comparison where bias must be measured.
- REAL-BOOK/LONG-FORM: distant dependency, arc, continuity and whole-book behavior on real admissible material.
- HUMAN/AUTHOR: preference, usefulness, voice fidelity, quality alignment and final creative authority where machine evidence cannot substitute.
- NATIVE/EXTERNAL/PUBLICATION: device/platform/provider/render/distribution evidence that must remain blocked until the real authority is available.

Synthetic fixtures can prove mechanics; they cannot be promoted to claims of real literary quality, human alignment or external/native/publication success.

## Traceability and closure ledger

Every domain closure ledger must report at minimum:

- atomic requirements discovered;
- requirements kept, refactored, migrated, merged, replaced, built, delegated and removed;
- installed implementations;
- reachable runtime paths;
- tests planned/passed/failed/blocked;
- calibration planned/passed/failed/blocked by evidence class;
- cumulative regressions planned/passed/failed/blocked;
- unresolved authority fences;
- unaccounted requirements.

A domain cannot be declared closed while `unaccounted requirements > 0`.

## Current selected domain

BOOK-RECONSTRUCTION-B00 — FOUNDATION-AND-AUTHORITY

Subphases:
- B00-A forensic inventory
- B00-B missing/duplicate/weak/incorrect analysis
- B00-C targeted external research and architecture comparison
- B00-D keep/refactor/migrate/merge/replace/build/delegate/remove adjudication
- B00-E final Foundation design
- B00-F implementation
- B00-G isolated + cumulative qualification/calibration and freeze

B00 scope includes Book/project/work identity; canonical Book aggregate; governing brief; canonical manuscript and unit identity; parts/chapters/scenes; Story Bible relationship to canonical state; Book plan; canon manifest; author decisions; research/evidence references; provenance; rights; source identity; immutable versions; canonical pointers; change sets; rollback/restoration; admission; concurrency/version preconditions; authority classes; protected language; exact-subject/currentness; invalidation; audit/history; proposal-vs-canonical state; and external/human/author/private/native/publication authority boundaries.

## Freeze rule

The blueprint itself remains controlling until explicitly superseded by a later Book reconstruction blueprint or higher current System Master authority. Historical Book documents remain evidence inputs, not competing current design authority.
