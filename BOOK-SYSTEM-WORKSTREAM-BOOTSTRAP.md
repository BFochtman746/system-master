# Book System Workstream Bootstrap

This branch is the parent control surface for the **BOOK SYSTEM** project inside `BFochtman746/system-master`.

## Canonical hierarchy

1. **BOOK SYSTEM** — parent project. Owns the end-to-end book-authoring system, architecture, integration/admission decisions, project-level roadmap, and Book-System-wide next-step selection.
2. **PROSE PROJECT** — child project built for the Book System. Active implementation branch: `literary-prose-engine-001`. Its implementation family is the Literary Prose Engine.

The Prose Project is a real project/workstream, not merely a feature label, but it is subordinate to the Book System and may define only its own branch/project critical path. It cannot redefine the Book System project identity or automatically make a Prose blocker the Book System's primary blocker.

Book Evaluator / qualification work is a Book System capability/qualification lane, not a third active project identity under this two-project control model.

## Startup rule

For Book System control work, read in this order:

1. `qualification/book-system/BOOK-SYSTEM-PROJECT-HIERARCHY-001.json`
2. `qualification/book-system/BOOK-SYSTEM-ACTIVE-PROJECT-REGISTRY-001.json`
3. `qualification/book-system/BOOK-SYSTEM-PARENT-INTEGRATION-BOUNDARY-001.json`
4. `qualification/book-system/BOOK-SYSTEM-BOOK-INTELLIGENCE-UNIFICATION-BINDING-001.json`
5. `qualification/book-system/BOOK-SYSTEM-AUTHORING-LIFECYCLE-CONTRACT-001.json`
6. the highest-numbered `qualification/book-system/BOOK-SYSTEM-RECONCILED-STATE-*.json`

`BOOK-SYSTEM-RECONCILED-STATE-004` is the current parent control state as of 2026-09-09. Earlier reconciled states remain historical evidence and may preserve facts that were true at their time, but they do not override a later parent control/next-step state.

Then inspect the live child branch before routing work into the Prose Project.

For Prose Project work, use branch `literary-prose-engine-001` and its latest consolidated state. The Prose state chain is subordinate evidence and control for Prose only.

## Recovered Book Intelligence architecture

The Book System parent explicitly binds the recovered Book Intelligence unification rather than redesigning it from scratch:

- **Creative Excellence 012–019** supplies granular prose/reader evidence and whole-book multi-resolution assurance architecture, including the recovered 56-dimension prose-craft system, 64-dimension reader-experience system, and 017 whole-book integration/qualification architecture.
- **Literary Prose A–L** supplies the governed analysis -> diagnosis -> retrieval -> bounded revision -> independent evaluation -> learning -> homogenization-defense execution loop through the Prose Project.

Neither lineage replaces the other. Book System owns canonical lifecycle state and admission; Prose and evaluator services return bounded evidence/proposals and do not receive automatic parent canonical-write authority.

## Qualified parent foundation

`BOOK-SYSTEM-CANONICAL-BOOK-STATE-MODEL-001` is closed on exact subject SHA `b6938fcfc5c2c24ac23b558de6dfc7f75c382312` through the registered canonical A-01 gateway.

`BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-001` is closed on exact subject SHA `9245cf9ce56f15020369eb490d9e562480825158` through the registered canonical A-01 gateway. It qualifies four parent-safe service families and seventeen operations without transferring canonical-write authority to providers.

Closure receipts:

- `qualification/book-system/BOOK-SYSTEM-CANONICAL-BOOK-STATE-MODEL-001-CLOSURE.json`
- `qualification/book-system/BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-001-CLOSURE.json`

Exact-SHA qualification never transfers automatically to later commits and grants no publication/production authority beyond the bounded proof recorded in each receipt.

## Current parent next-step rule

A generic **Continue** in Book System control follows the `current_parent_critical_path.id` in the highest-numbered reconciled parent state unless newer parent-authoritative evidence changes the dependency graph.

As of `BOOK-SYSTEM-RECONCILED-STATE-004`, the parent critical path is:

`BOOK-SYSTEM-LIFECYCLE-TRANSITION-ENGINE-001`

Do not route generic Book System continuation to the most recently changed Prose or Book Evaluator lane merely because that subordinate work changed later.

## Authority separation

- Chat titles are not repository authority.
- A branch/workstream calling itself `PRIMARY` means primary only within its declared project scope.
- Exact-SHA qualification evidence never transfers to another SHA.
- Hosted CI PASS, A-01 PASS, human evidence, author decisions, integration admission, and production/promotion authority remain distinct.
- Integration of Prose outputs into the Book System requires Book System authority; Prose qualification alone does not grant parent-system admission.
- Recovered architecture admission does not equal runtime qualification or publication authority.

## Historical naming

Historical artifacts may use `BOOK_WRITING_SYSTEM`, `BOOK-WRITING-SYSTEM-LITERARY-LANE`, `LITERARY PROSE SYSTEM`, or `LITERARY PROSE ENGINE`. Those names remain valid historical/implementation identifiers. They do not create additional active parent projects. The canonical current parent project name is **BOOK SYSTEM** and the canonical child project name is **PROSE PROJECT**.
