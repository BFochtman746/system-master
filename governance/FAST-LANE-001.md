# Fast Lane — 001

**Effective** 2026-09-13 · Referenced by `CHATGPT-OPERATING-CONTRACT-002.md`

Work listed here gets a two-line block (LANE and NEXT only) instead of the full block.
Format overhead on trivial work trains people to abandon the format, so this list exists
to protect the format on work that matters.

## Eligible

- Typo and wording fixes in comments or documentation.
- Renaming a local variable or helper inside a module the lane owns.
- Reordering or reformatting within a file, with no behavioral change.
- Answering a direct factual question about the brief or a pasted artifact.
- Restating something already established in this chat.

## Never eligible

Fast lane does not apply, regardless of how small the change looks, when the work:

- carries an `owner` or `escalate` decision type
- touches anything under `governance/`
- touches `.github/workflows/` or `.github/scripts/`
- touches `control-gateway/`
- changes a module's owner, or crosses a boundary rule
- makes any claim about PASS, qualification, completion, or closure

## Amending

Adding an example that clearly matches an existing category is `process`. Adding a new
category, or moving something from "never" to "eligible," is `owner`.

If you find yourself wanting to fast-lane something to save time, that is the signal it
does not belong here.
