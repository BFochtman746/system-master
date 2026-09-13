# P02 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P02 Work obligation registry · **Effective** 2026-09-13
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-001.json`

## 1. Contract / interface

`governance/WORK-OBLIGATION-REGISTRY-013.json` is the build plan. It carries
`registry_id`, `effective_date`, `central_next_objective`,
`highest_discretionary_objective`, and an `obligations` array.

Each obligation carries `obligation_id`, a `state` from
`ACTIVE | READY | BLOCKED | HOLD | CLOSED | RETIRED`, and optionally `owner_path`,
`title`, `objective`, `evidence_target`, `acceptance_target`.

Offers: the answer to "what is being worked on, by whom, and what is next." It is the only
artifact that names a single next objective for the whole estate.

Does not offer: scheduling, ordering within a night, or progress. A registry entry is a
commitment, not a status.

## 2. Ingress routes

1. **Human, via pull request**, gated by `a01-control-plane-enforcement`. The only write
   route.
2. **Read by the ingress** (P12) over the GitHub contents API, which enqueues obligations
   in state `READY` and no other state.

State is what makes an obligation eligible for the night. `READY` is therefore a
deliberate act, not a default — an obligation left in `ACTIVE` is never picked up.

## 3. Egress routes

- `system-brief.js` — renders the central objective and work in flight.
- `lane-brief.js` — selects a lane's obligation for a chat session.
- `a01_github_ingress` — builds one delegation per `READY` obligation.
- `validate-governance.js` — schema and cross-file owner checks.

Marking an obligation `READY` causes work to be enqueued on the next ingress pass. That is
the intended coupling and the reason the state vocabulary is closed by schema enum.

## 4. Persistence and canonical writer

In git, superseded by number: `-013` supersedes `-012`, with `supersedes_current_selection`
naming the prior file. Prior registries are retained unedited.

Canonical writer: a human through a reviewed pull request. **No process writes this file** —
notably the ingress reads it and never marks anything done. Letting the executor write the
plan would let a night rewrite its own obligations.

Completion is recorded in evidence (P15 receipt, A-01 qualification artifacts) and reflected
here by a human in the next successor.

## 5. Dependencies

- **P00** — must point at it.
- **P01** — supplies the owner paths obligations are checked against.
- **P05** — validates it on every push and pull request.
- **P12** consumes it; **P11** schedules what P12 enqueues.

## 6. Failure semantics

**Fail-closed.**

- Absent or unpointed → the brief reports the registry unreadable and degrades rather than
  inventing; ingress records the error and enqueues nothing.
- Invalid `state` value → schema failure, build red. The enum is closed precisely because
  an unrecognised state would be silently skipped by the ingress filter.
- `owner_path` absent on an obligation → ingress skips it as `BUILD_FAILED` and continues.
  An unowned obligation cannot be assigned to a lane, so enqueuing it would create work
  nobody owns.
- Empty `obligations` array → schema requires at least one. An empty build plan is far
  more likely to be an accident than a statement.

Idempotency is downstream: re-reading an unchanged registry produces identical delegation
ids for the same night.

## 7. Evidence target

Git history plus the supersession chain. `WORK-OBLIGATION-REGISTRY-013.json` carries
`ratification_record` and `prior_central_next_objective`, so the sequence of objectives is
reconstructable from the artifacts alone.

## 8. Acceptance target

```
node .github/scripts/validate-governance.js && node .github/scripts/system-brief.js
```

**PASS** when validation reports `obligations` PASS and the brief renders a
`central_next_objective` with a non-zero obligation count. Verified 2026-09-13 at
`WORK-OBLIGATION-REGISTRY-013`, central objective `FOUNDATION-1-0-CLOSURE-001`.

## 9. Authority boundary

**Lane may decide alone (`agent`):** wording of `title` and `objective` for an obligation
the lane already owns.

**Requires the owner (`owner`):** adding or removing an obligation; any state change,
including to `READY`, because that dispatches work; changing `owner_path`; changing the
central or highest-discretionary objective; changing an `acceptance_target`.

Moving an obligation to `READY` is the single highest-consequence edit in this estate: it
is the act that puts work into the night.

## 10. Open gaps

None in the artifact. Five obligations carry owner paths that own no modules in P01 — a
live validator warning and an open P01 decision, not a defect here.
