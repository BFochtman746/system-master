# Decision Rights — 001

**Effective** 2026-09-13 · **Authority** `governance/CURRENT-AUTHORITY.json`

Adapted from the design-time governance build spec, bound to the ratified ownership
model in `SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-005.json`. The original spec's split
between *what* and *how* is sound and is preserved. What changed is the anchor: a lane's
authority is now defined by the modules it owns, not by a hand-written list that drifts.

Every lane classifies each decision into exactly one of four types before acting, and
names the type in its response block.

---

## `process` — the spec already decided

Execute and report. No discretion claimed, no approval needed.

- A step explicitly written in the obligation or an existing contract.
- Re-running a declared acceptance target.
- Applying a boundary rule already recorded in the allocation registry.

## `agent` — the lane decides *how*

Do it, then report the choice and the reason in one line. Reversible, non-behavioral,
inside the lane's owned modules.

- File organization inside the lane's own directories.
- Naming, code style, test structure and test naming.
- Implementation details that do not change observable behavior.
- Step ordering where the obligation allows flexibility.

## `owner` — Brian decides *what*

**Stop. Ask. Wait.** Do not proceed on a stated assumption.

- Feature scope, priority, and definition of done.
- Architecture, API shape, data model, schema.
- Anything that changes a module's owner, or crosses a boundary rule.
- Admitting a system, retiring one, or changing the topology.
- Any change to an obligation, the census scope, or an acceptance target.
- Tradeoffs: speed against quality, scope against deadline.
- What gets tested and what gets skipped.

## `escalate` — the lane cannot classify it

Stop and say so plainly. An unclassifiable decision is a governance finding, not a
failure. Report it, name what makes it ambiguous, and wait.

- The obligation is ambiguous or silent.
- Two boundary rules conflict.
- Discovery during the work invalidates the plan.
- The lane cannot tell whether a decision is *what* or *how*.

---

## Worked examples

| Situation | Type | Reason |
|---|---|---|
| Rename a helper inside an owned module | `agent` | Non-behavioral, inside scope. |
| Add a field to a persisted schema | `owner` | Data model is owner authority. |
| Re-run `node --test` after an edit | `process` | Declared acceptance target. |
| MEDIA lane needs a DOCUMENTS artifact routine | `owner` | Crosses a boundary rule. |
| Pick a test file name | `agent` | Structure is lane discretion. |
| Decide whether AIINCOME becomes a system | `owner` | Explicitly deferred by ratification. |
| Obligation says "harden the gateway" with no acceptance target | `escalate` | No definition of done. |
| CONNECTED_ACTIONS module ready for production authority | `owner` | Standing rule blocks it before Foundation 1.0. |

## Amending this file

When a lane misclassifies, the fix is to add the example to the table above, not to
argue with the lane. The table is the training set. Adding to it is `process`;
changing a category definition is `owner`.

## The one rule that overrides the rest

A lane never makes an `owner` decision alone, and never converts an `owner` decision
into an `agent` decision by narrowing it. "I'll just pick a reasonable default for now"
is the failure this document exists to prevent.
