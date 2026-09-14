# Lessons — System Master

Append-only. Every non-trivial defect fixed gets an entry (STANDARDS.md S-07). The point is
that the list grows and the same mistake stops recurring. Newest last.

Format: **L-nnn — one-line summary** / Symptom / Root cause / Fix / Rule it produced.

---

## L-001 — Nested API envelopes: read the returned shape, don't assume it

- **Symptom.** A CI polling helper read `workflow_runs` and got `undefined`; the run appeared
  to have no results when it plainly had them.
- **Root cause.** The field sat one level deeper than assumed — `data["data"]["workflow_runs"]`,
  not `data["workflow_runs"]`.
- **Fix.** Inspected the actual returned object before indexing it.
- **Rule.** Parse external responses at the boundary and fail loudly on a missing field.
  Never index a nested path you have not printed once.

## L-002 — Workflow guards must run after checkout

- **Symptom.** The Book Durable Persistence workflow failed immediately, reporting missing
  files that existed in the repository.
- **Root cause.** The guard step was ordered before `actions/checkout`, so it inspected an
  empty workspace.
- **Fix.** Moved the guard after checkout.
- **Rule.** Any workflow step that reads repository files must come after checkout. Check
  step ordering before debugging the step's logic.

## L-003 — Manifest-derived file lists must resolve paths from a fixed root

- **Symptom.** A manifest-derived Java source list silently included dependency tests,
  inflating the compile set and diverging from the hand-maintained list.
- **Root cause.** Manifest entries were resolved as relative paths against the current
  working directory instead of the package root.
- **Fix.** Resolved every entry against an explicit package root; the derived list then
  matched the hand-maintained one exactly.
- **Rule.** Resolve manifest paths against an explicit root, never against cwd. When
  replacing a hand-maintained list with a derived one, diff them and require equality.

## L-004 — Distinguish policy refusal from missing permission

- **Symptom.** Branch creation returned HTTP 422 while push and tag creation worked. Read as
  an absent write scope.
- **Root cause.** An all-branches production-mutation ruleset was refusing the create. The
  credential had full authority the whole time.
- **Fix.** Added a narrow `recovery/**` ruleset exclusion.
- **Rule.** On a write failure, read the error body before concluding a scope is missing.
  Selective failure (one verb blocked, others fine) indicates policy, not credentials.

## L-005 — A qualification harness proves nothing while its input is unpopulated

- **Symptom.** `foundation-closure-matrix.js` reported `FAIL CROSSWALK_ABSENT
  path=UNPOPULATED`, and four of six other-system qualify scripts failed with
  `current authority does not name capability_crosswalk`. Five failures, one cause.
- **Root cause.** Two layers. `CURRENT-AUTHORITY-003` on main did not carry a
  `capability_crosswalk` key at all — the harness message was literal, not a broken path. And
  the crosswalk itself was never absent: `SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json` plus
  its `TOOL-OWNER-ALLOCATION-006.json` were stranded on `apply-updates-008`. Main carried
  `ALLOCATION-004`, a different schema with **zero** ownership rows.
- **Fix.** Recovered the crosswalk and allocation-006 by path, named the crosswalk in the
  authority record, and recovered the six qualification corpora that the next gate needed.
  All six other-system qualifications went from 0/6 to **6/6 PASS**.
- **Correction to the original entry.** This lesson first stated the crosswalk "was never
  populated." That was wrong — it existed and was authored correctly, on another branch. The
  earlier claim was inference from its absence on main.
- **Rule.** Before treating a qualification failure as a code defect, confirm its inputs
  exist **across all branches**, not just the current one. Report harness failures with the
  missing input named, not as "system broken." When an error says a record "does not name" a
  key, check whether the key is literally absent before hunting for a bad path.

## L-006 — Naming collisions between architecture and paperwork cost a whole investigation

- **Symptom.** Asked about the app's "foundation and spine," a search returned a foundation
  *census document* and a DOCUMENTS *spine sub-capability*, and a full report was written
  against the wrong subject.
- **Root cause.** Governance artifacts had been named with the same words as core
  architectural components, and filename matching was treated as identification.
- **Fix.** Re-investigated by branch namespace and package structure rather than filename,
  which located `system-master/foundation-spine/` and keel.
- **Rule.** Identify architecture by package and directory structure, not filename keyword
  match. When a search hit is a `.md` governance record, it is paperwork about the thing,
  not the thing.

## L-007 — Test failure is not always defect: check the invocation contract first

- **Symptom.** `Fwp001QualificationTest` failed with exit 1 in the consolidated run, the only
  failure among 21.
- **Root cause.** It requires two arguments — a reconstructed traceability CSV and a baseline
  binding. Run bare, it threw a usage error. It failed identically on clean `main`, so the
  consolidation had not broken it.
- **Fix.** Reconstructed the CSV from its five base64 transport parts (sha256 verified
  against `SOURCE-SLICE-MANIFEST.json`) and passed both arguments. Result: `PASS F-WP-001
  tests=12 requirements=60`.
- **Rule.** Before diagnosing a failing test, run it against the unchanged baseline to
  separate pre-existing conditions from regressions, and check whether it needs arguments.

## L-008 — A directory-only listing produced a false "exists nowhere" claim

- **Symptom.** The audiobook and website-building qualification inputs were reported as
  "absent on every branch." They were present on `apply-updates-008` the whole time, and once
  recovered both subsystems qualified PASS immediately.
- **Root cause.** The search used `git ls-tree -d` (directories only) with an exact anchored
  match on one path depth. It could not match the real nested files. A search shape that
  cannot see the thing was read as proof the thing does not exist.
- **Fix.** Re-searched with a recursive file listing across all branches, which found every
  corpus at once.
- **Rule.** A negative search result is only evidence when the search could have found a
  positive. State the search shape alongside any "does not exist" claim, and never escalate
  absence-on-one-branch to absence-everywhere. Given this repository's established stranding
  pattern, assume a missing artifact is on another branch until a recursive all-branch search
  says otherwise.

## L-009 — Authority version divergence: do not forge a receipt to clear a gate

- **Symptom.** With the crosswalk recovered, `foundation-closure-matrix.js` advanced to
  `EVIDENCE_REGISTRY_AUTHORITY_MISMATCH registry=CURRENT-AUTHORITY-005
  authority=CURRENT-AUTHORITY-003`.
- **Root cause.** The evidence registry was authored under authority `-005`; main's authority
  record is `-003`. The registry's receipts carry exact subject blob bindings tied to the
  state at `-005`, so the two chains are genuinely different vintages.
- **Fix.** None applied, deliberately. Editing `authority_id` to `-003` would clear the gate
  while making every receipt a false statement about what was verified under which authority.
  Recorded as an authority-reconciliation decision for the owner: either promote main to `-005`
  with its supporting records, or re-issue receipts under `-003`.
- **Rule.** Never edit an identifier for the purpose of satisfying a check. A gate that goes
  green because its evidence was relabelled is worse than a gate that fails honestly. When
  clearing one requires asserting something unverified, stop and surface the decision.
