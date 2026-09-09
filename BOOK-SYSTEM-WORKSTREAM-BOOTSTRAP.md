# Book System Workstream Bootstrap

This branch is the parent control surface for the **BOOK SYSTEM** project inside `BFochtman746/system-master`.

## Canonical hierarchy

1. **BOOK SYSTEM** — parent project. Owns the end-to-end book-authoring system, architecture, integration/admission decisions, project-level roadmap, and Book-System-wide next-step selection.
2. **PROSE PROJECT** — child project built for the Book System. Active implementation branch: `literary-prose-engine-001`. Its implementation family is the Literary Prose Engine.

The Prose Project is a real project/workstream, not merely a feature label, but it is subordinate to the Book System and may define only its own branch/project critical path. It cannot redefine the Book System project identity or automatically make a Prose blocker the Book System's primary blocker.

Book Evaluator / qualification work is a Book System capability/qualification lane, not a third active project identity under this two-project control model.

## Startup rule

For Book System control work, read:

- `qualification/book-system/BOOK-SYSTEM-PROJECT-HIERARCHY-001.json`
- `qualification/book-system/BOOK-SYSTEM-ACTIVE-PROJECT-REGISTRY-001.json`
- `qualification/book-system/BOOK-SYSTEM-PROSE-HIERARCHY-FORENSIC-AUDIT-001.json`

Then inspect the live child branch before routing work into the Prose Project.

For Prose Project work, use branch `literary-prose-engine-001` and its latest consolidated state. The Prose state chain is subordinate evidence and control for Prose only.

## Authority separation

- Chat titles are not repository authority.
- A branch/workstream calling itself `PRIMARY` means primary only within its declared project scope.
- Exact-SHA qualification evidence never transfers to another SHA.
- Hosted CI PASS, A-01 PASS, human evidence, author decisions, integration admission, and production/promotion authority remain distinct.
- Integration of Prose outputs into the Book System requires Book System authority; Prose qualification alone does not grant parent-system admission.

## Historical naming

Historical artifacts may use `BOOK_WRITING_SYSTEM`, `BOOK-WRITING-SYSTEM-LITERARY-LANE`, `LITERARY PROSE SYSTEM`, or `LITERARY PROSE ENGINE`. Those names remain valid historical/implementation identifiers. They do not create additional active parent projects. The canonical current parent project name is **BOOK SYSTEM** and the canonical child project name is **PROSE PROJECT**.
