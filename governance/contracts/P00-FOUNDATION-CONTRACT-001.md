# P00 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P00 Authority pointer of record · **Effective** 2026-09-13
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-001.json`

## 1. Contract / interface

`governance/CURRENT-AUTHORITY.json` is the single entry point to the estate. Every
consumer resolves state by reading this file and following its pointers. It carries
`authority_id`, `effective_date`, `standing`, `supersedes`, and one named pointer per
canonical artifact.

Offers: a stable resolution path that survives artifact renumbering, because consumers
name the *role* (`obligation_registry`) not the file (`WORK-OBLIGATION-REGISTRY-013.json`).

Does not offer: content. It holds no facts about the estate, only where the facts live.
Any fact stated here rather than pointed at is a defect.

## 2. Ingress routes

Writes are human, via pull request, gated by `a01-control-plane-enforcement`. There is no
programmatic writer and there must not be one — a pointer of record that a process can
repoint can silently redirect the whole estate.

Reads: `system-brief.js`, `lane-brief.js`, `foundation-closure-matrix.js`,
`validate-governance.js`, `scaffold-foundation-contracts.js`, and `a01_github_ingress`.

## 3. Egress routes

Consumed by read only. No process emits from it. A change propagates the next time any
consumer runs — there is no cache and no invalidation step.

## 4. Persistence and canonical writer

The file itself, at `governance/CURRENT-AUTHORITY.json`, in git. Git history is the
supersession record; the `supersedes` field names the prior `authority_id`.

Canonical writer: a human, through a reviewed pull request. This is the only artifact in
the estate whose writer is deliberately a person rather than a process.

Unlike every other governance artifact, this file is **overwritten in place** rather than
superseded by a new numbered file. That is intentional: a pointer whose path changed would
need a pointer to find it.

## 5. Dependencies

None. P00 is the root — everything depends on it and it depends on nothing. It must remain
readable with no tooling, no network, and no other artifact present.

Its pointers reach P01, P02, P05, and the generators. Those are references, not
dependencies: P00 is valid whether or not its targets currently resolve, which is what lets
the validator report a broken pointer instead of failing to start.

## 6. Failure semantics

**Fail-closed, and loudly.**

- Absent → `system-brief.js` exits 2, `validate-governance.js` exits 2, ingress reports
  `AUTHORITY_ABSENT` and enqueues nothing. Nothing degrades to a default.
- Malformed JSON → same, exit 2. No partial parse, no repair attempt.
- A pointer naming a missing file → the estate still resolves for every other pointer;
  the validator reports it as an error and the brief lists it under pointer integrity.
  One broken pointer must not black out the rest.
- A pointer naming a file on another ref (the five control records) → reported as
  `ABSENT_ON_THIS_REF`, not as corruption. This is a known federation condition.

No idempotency concern: reads are pure.

## 7. Evidence target

Git history of the file. Each change carries a commit, and `authority_id` plus
`supersedes` reconstructs the chain without reading commits. The `validate-governance`
CI log records the validated state at each commit.

## 8. Acceptance target

```
node .github/scripts/validate-governance.js && node .github/scripts/system-brief.js
```

**PASS** when validation reports `authority` PASS and the brief renders with the expected
`authority_id`. Verified 2026-09-13 at `CURRENT-AUTHORITY-004`.

## 9. Authority boundary

**Lane may decide alone (`agent`):** nothing. Every change to this file is an `owner`
decision, because every change redirects the estate.

**Requires the owner (`owner`):** adding, removing, or repointing any pointer; changing
`standing`; superseding the authority id.

This is the only contract in the estate with an empty `agent` column, and that is the
correct shape for a root pointer.

## 10. Open gaps

None in the artifact. One known condition, recorded not resolved: five declared pointers
name control records resident on other branches, so no single checkout resolves the full
estate. That is the branch-federation decision, tracked outside P00.
