# Decision Rights — 001

**Effective** 2026-09-13 · **Current authority** `governance/CURRENT-AUTHORITY.json` · **Current ownership allocation** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`

Adapted from the design-time governance build spec and bound to the ownership model selected by `CURRENT-AUTHORITY-005` / `SYSTEM-TOPOLOGY-007`. The original spec's split between *what* and *how* is preserved. A lane's authority is defined by the current modules/capabilities it owns, not by a hand-written list that may drift.

Historical allocation 005 remains provenance for the pre-Programming-admission boundary. Allocation 006 supersedes it for current ownership, admits PROGRAMMING as the ninth peer and binds WEBSITE_BUILDING C40 to PROGRAMMING. Historical receipts and decisions are not relabeled by this current anchor.

Every active peer lane classifies each decision into exactly one of four types before acting and names the type in its response block.

---

## `process` — the spec already decided

Execute and report. No discretion claimed, no approval needed.

- A step explicitly written in the current obligation or an existing current contract.
- Re-running a declared acceptance target against its authorized subject.
- Applying a boundary rule already recorded in the current allocation/authority set.
- Reconciling a derived projection to machine-readable current authority without changing architecture.

## `agent` — the lane decides *how*

Do it, then report the choice and reason in one line. Reversible, non-behavioral and inside the lane's owned semantics.

- File organization inside the lane's own directories.
- Naming, code style, test structure and test naming.
- Implementation details that do not change externally observable behavior or authority boundaries.
- Step ordering where the obligation allows flexibility.

## `owner` — Brian decides *what*

**Stop and ask for the smallest exact decision required.** Do not silently proceed on a stated assumption.

- Feature scope, priority and definition of done when current authority does not already resolve them.
- Architecture, API shape, data model or schema changes that are not already admitted by a current contract.
- Anything that changes a module/capability owner or crosses a semantic boundary rule.
- Admitting a system, retiring one or changing the topology.
- Changing the canonical capability allocation, including promoting WEBSITE_BUILDING out of PROGRAMMING.
- Any change to an obligation/census scope/acceptance target that is not already authorized by current governance.
- Tradeoffs such as speed against quality or scope against deadline.
- What gets tested or intentionally skipped when not already fixed by an acceptance contract.
- Granting external-provider, credential, publication, production, user-action, human, author, private or native authority.

## `escalate` — the lane cannot classify it

Stop and report the ambiguity. An unclassifiable decision is a governance finding, not a license to guess.

- The current obligation is ambiguous or silent.
- Two current boundary rules conflict.
- Discovery during the work invalidates the plan.
- The lane cannot tell whether a decision is *what* or *how*.
- Current authority pointers disagree or a selected current record is missing.

---

## Current ownership examples

| Situation | Type | Reason |
|---|---|---|
| Rename a helper inside an owned module | `agent` | Non-behavioral, inside scope. |
| Add a field to a persisted canonical schema | `owner` | Data model is owner authority unless already admitted by contract. |
| Re-run an existing acceptance command after an edit | `process` | Declared acceptance target. |
| MEDIA needs a DOCUMENTS artifact routine | `owner` when no admitted interface exists | Crosses a semantic boundary. |
| Pick a test file name | `agent` | Local structure discretion. |
| Decide whether AIINCOME becomes a system | `owner` | Explicitly deferred by current authority. |
| Obligation says "harden the gateway" with no acceptance target | `escalate` | No definition of done. |
| CONNECTED_ACTIONS implementation is repository-ready and wants real external effects | `owner` | Repository readiness does not grant user/external side-effect authority. |
| WEBSITE_BUILDING needs a browser action | `process` only when a separately admitted CONNECTED_ACTIONS interface/authority already exists; otherwise `owner`/`escalate` | C40 stays PROGRAMMING-owned but does not inherit browser side-effect authority. |
| Create WEBSITE_BUILDING as a tenth peer | `owner` | Current Authority explicitly forbids implicit system creation and binds C40 to PROGRAMMING. |
| Rewrite an old receipt to call it Topology-007 evidence | `escalate` and reject mutation | Historical exact-subject evidence is append-only and cannot be relabeled. |

## Current architecture boundary

The active peer set is exactly CORE, LEARNING, BOOK, DOCUMENTS, SPREADSHEET_DATA, MEDIA, CONNECTED_ACTIONS, RESEARCH_KNOWLEDGE and PROGRAMMING.

PROSE is historically complete and terminally retired. Any genuinely unfinished integration of preserved completed Prose capability is BOOK-owned; DOCUMENTS receives no Prose work.

PROGRAMMING owns AUTOMATION, CODE and WEBSITE_BUILDING C40. Website Building is not a peer and does not inherit CONNECTED_ACTIONS browser/action policy or external side-effect authority.

A lane never uses `agent` discretion to alter these boundaries.

## Amending this file

Adding an example that clearly applies an existing category is `process`. Changing a category definition, ownership boundary or architecture rule is `owner` unless a newer explicit authority transaction already made that change and this file is merely being reconciled to it.

## The one rule that overrides the rest

A lane never makes an unresolved `owner` decision alone and never converts an `owner` decision into an `agent` decision by narrowing it. Equally, a lane must not ask the owner to re-decide something already fixed by current authority: in that case reconciliation to current authority is `process`.
