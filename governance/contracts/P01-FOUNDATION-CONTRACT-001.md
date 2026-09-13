# P01 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P01 System topology and ownership allocation · **Effective** 2026-09-13
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-001.json`

## 1. Contract / interface

Two artifacts answering "what systems exist" and "who owns what."

- `governance/SYSTEM-TOPOLOGY-006.json` — product root, eight canonical internal systems,
  each with classification, parent, control ref and `completion`.
- `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-005.json` —
  `module_ownership` (35 module→owner rows), `explicitly_deferred_modules` (5), and
  `boundary_rules` (7).

Offers: the single resolution from a module key to a canonical owner, and the boundary
rules that govern cross-lane work. `lane-brief.js` and `foundation-closure-matrix.js` both
resolve ownership here and nowhere else.

Does not offer: implementation state. A registered owner is a precondition, never an
implementation claim.

## 2. Ingress routes

Human, via pull request, gated by `a01-control-plane-enforcement`. Admission requires an
owner ratification record — `FOUNDATION-CLOSURE-OWNER-DECISION-PACK-001.md` for the
current version.

No programmatic writer.

## 3. Egress routes

Read by `lane-brief.js` (lane scope and boundary rules), `foundation-closure-matrix.js`
(ownership resolution), `scaffold-foundation-contracts.js` (which stubs to create), and
`validate-governance.js` (cross-file owner checks).

Changing an owner here silently re-scopes a lane brief the next time it is generated.
That coupling is intentional — it is what stops a brief drifting from the record — and it
is why every change needs ratification.

## 4. Persistence and canonical writer

Both files in git, superseded by number: `-005` supersedes `-004`, `-006` supersedes
`-005`. Prior versions are never edited or deleted; the `supersedes` field carries the
chain.

Canonical writer: a human through a reviewed pull request, with `CURRENT-AUTHORITY`
repointed in the same change. An allocation that is not pointed at by P00 is not in force,
regardless of its contents.

## 5. Dependencies

- **P00** — must point at both files for them to be authoritative.
- **P05** — schema-validates both on every push and pull request.

Crosses no boundary rule; it is where the boundary rules live.

## 6. Failure semantics

**Fail-closed.**

- Allocation absent or unpointed → `lane-brief.js` exits 2 (`ALLOCATION_ABSENT`); the
  closure matrix falls back to the P6 census allocation and labels its output
  `UNRATIFIED`. Degraded, clearly marked, never silently wrong.
- A malformed `owner_path` → schema validation fails the build. Enforced by pattern, not
  convention.
- An obligation owned by a path owning no modules → a validator **warning**, not a
  failure. Five are live today. These may be intentional, and turning a maybe into a hard
  failure trains people to disable the gate.
- A module in the allocation with no P6 census record → scaffolded and censused anyway.
  The allocation is authoritative for ownership; P6 is historical background.

## 7. Evidence target

Git history plus the supersession chain. `SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-005.json`
carries `ratification_record`, so the decision that produced each version is traceable
from the artifact without reading commits.

## 8. Acceptance target

```
node .github/scripts/validate-governance.js && node .github/scripts/lane-brief.js --list
```

**PASS** when validation reports `topology` and `allocation` PASS, and `--list` renders 9
lanes covering 35 modules with no module appearing twice. Verified 2026-09-13.

## 9. Authority boundary

**Lane may decide alone (`agent`):** ordering of entries, descriptive field wording.

**Requires the owner (`owner`):** any module→owner change; admitting or retiring a system;
adding, removing or amending a boundary rule; moving a module between owned and deferred;
changing a `completion` value.

## 10. Open gaps

None in the artifacts. One open decision recorded elsewhere: five obligations are owned by
paths that own no modules (`SYSTEM_MASTER`, `SYSTEM_MASTER/SHARED_INFRASTRUCTURE`,
`.../A01`). Either those are lanes and belong here, or those obligations need reassigning.
