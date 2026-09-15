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

## L-010 — `mvn test` reported BUILD SUCCESS while running zero tests

- **Symptom.** `mvn test` exited 0 with BUILD SUCCESS on every commit. Twenty-two
  qualification test classes existed and **none of them ran**. "The build passes" was a
  statement with no content, and it had been relied on as evidence.
- **Root cause.** The qualification classes are plain `main(String[])` entry points, not JUnit
  suites, and nothing bound them to the test phase. There was no surefire plugin and no
  `testSourceDirectory`, so surefire found zero test sources and reported success — the
  correct behaviour for "no tests," indistinguishable from "all tests passed." The pom's own
  description had recorded this as a design decision ("There is no surefire phase to bind them
  to") rather than as the defect it was.
- **Fix.** Added surefire 3.2.5 + junit-jupiter 5.10.2 and `QualificationBridgeTest`, which
  discovers every compiled `*Test` class exposing a `main(String[])` and runs it as a JUnit
  dynamic test. `Fwp001QualificationTest` gets a dedicated case that rebuilds its base64
  fixture and digest-checks it before invoking. `mvn test` now runs **22 tests**.
- **Verification.** Proven in both directions, because a green never observed failing is not
  evidence: removing three compiled test classes reduced discovery from 22 to 19 and tripped
  the discovery floor (`discovered only 19 qualification classes`); corrupting
  `Fwp002QualificationTest.class` produced `ClassFormatError: Truncated class file` with a
  nonzero exit. Restored state returns 22/22.
- **Rule.** A test phase that can pass while executing nothing is a false instrument. Every
  suite must assert a floor on how many tests it discovered, and that floor is never lowered
  to make a build pass. Before trusting any green signal, break something on purpose and
  confirm it goes red.

## L-011 — A CI-only environment variable made 12 of 21 qualifiers unrunnable locally

- **Symptom.** On a clean checkout, 14 of 21 qualify scripts failed. Twelve died on
  `RUNNER_TEMP_NOT_SET`, two on cryptic identity errors. Verification was effectively
  CI-exclusive, so local work could not be checked before pushing.
- **Root cause.** One file. `fwp001-qualify.js` hard-threw when `RUNNER_TEMP` (injected only
  by GitHub Actions) was absent, while every *other* `fwp*-qualify.js` already defaulted it.
  Because `fwp002-qualify.js` shells out to `fwp001-qualify.js` and the chain continues
  through `012`, that single throw cascaded into twelve failures. Separately, two gates are
  legitimately CI-shaped (one requires HEAD to *be* a recorded two-parent merge, one requires
  a CI-supplied subject SHA equal to HEAD) and failed loudly instead of declining politely.
- **Fix.** Defaulted `RUNNER_TEMP` to an OS temp dir, matching the sibling scripts. Made the
  two CI-only gates print an explicit `SKIP ... reason=CI_ONLY_GATE` with the override
  documented, exit 0, and keep their CI behaviour byte-identical. Off-CI result went from
  7/21 passing to **19 pass + 2 explicit skips, 0 failures**.
- **Rule.** A missing CI variable is an absence, not an error: default it or skip explicitly.
  Never let one script's strict environment check cascade through a chain of callers. A gate
  that cannot apply in the current context says so by name and skips — a cryptic failure
  teaches developers to ignore red, which is the expensive outcome.

## L-012 — A stale local cache reported a failure that did not exist in the source

- **Symptom.** Immediately after `L-010`/`L-011` were fixed, a verification run reported
  `fwp003-qualify.js` failing with `ClassFormatError: Truncated class file`. The source was
  fine and `mvn test` was green on all 22 tests. A later run moved the failure to
  `fwp005-qualify.js`. A defect that changes identity between runs is not a defect.
- **Root cause.** Second-order consequence of the `L-011` fix. With `RUNNER_TEMP` now
  defaulting locally, the qualify scripts write to `workspace/.tmp/` — and they cache
  *compiled classes* there. A deliberately corrupted class, created to prove the new test
  binding could actually go red, was picked up from that cache by a later run long after the
  source had been restored. The cache outlived the condition that produced it.
- **Fix.** `verify.sh` purges `.tmp/` and `qualification-output/` before every run, so
  verification always starts from nothing. Both directories, plus `target/`, are now
  gitignored — there was no `.gitignore` entry for build output, leaving the repository one
  careless `git add .` away from committing 375 class files.
- **Rule.** Verification state is derived, never authoritative: purge it at the start of a
  run rather than trusting it to be current. Treat a failure that moves between runs as
  evidence of a stale-state bug, not a flaky test. And when a fix introduces a new cache,
  own its invalidation in the same change — this defect was created by the previous fix.

## L-013 — Register a new runtime directory before asking CI to qualify it

- **Symptom.** The first Learning I001–I004 handler tranche compiled and its repository tests
  passed, but `Required Verification` remained red at `ASSURANCE-STANDARDS-1.0`.
- **Root cause.** The tranche introduced `system-master/learning-handler-binding-001/` as a
  new runtime directory without registering that implementation subsystem in `SYSTEM-MAP.md`,
  violating S-05. The failure was governance discovery, not a handler compile/test defect.
- **Fix.** Registered the directory in the implementation-subsystem map with its purpose,
  path, test count, LEARNING owner and evidence/log location, while explicitly preserving the
  nine-peer topology and Master Core/DATA authority boundaries.
- **Rule.** Before the first commit that creates `system-master/<area>/`, preflight S-05 and
  land the corresponding `SYSTEM-MAP.md` registration in the same change. A runtime package
  registration is not a new peer and must say so when its name could be misread as topology.

## L-014 — Durable state integrity validates the whole document, not selected fields

- **Symptom.** The durable claim-state reader rejected missing required fields and unsupported
  schema versions, but could still accept a record containing all expected fields plus
  trailing bytes, duplicate fields, unknown fields, or alternate whitespace.
- **Root cause.** The lightweight parser extracted known fields with regular expressions and
  validated the reconstructed record, but never proved that those fields represented the
  entire persisted document. Partial field validation is not corruption detection.
- **Fix.** After parsing and constructing the record, require its canonical serialization to
  equal the persisted bytes exactly. Added qualification for trailing bytes, duplicate and
  unknown fields, and noncanonical formatting.
- **Rule.** Security- or durability-sensitive state must validate the complete persisted
  representation. If the authoritative writer emits canonical bytes, readers fail closed on
  every byte sequence that is not exactly canonical; never ignore unrecognized residue.

## L-015 — A fail-closed control must preserve failure evidence before it exits

- **Symptom.** The protected authority bootstrap correctly refused a missing expected writer
  identity, but the following immutable-evidence upload also failed because the bootstrap
  exited before creating its evidence directory.
- **Root cause.** Evidence creation happened only after successful execution, so the exact
  failures most in need of diagnosis left no immutable artifact.
- **Fix.** Persist the sanitized bootstrap request before validation, write a machine-readable
  `bootstrap-failure.json` from the top-level failure handler, classify local preflight
  failures with stable codes, and qualify that the writer token is never persisted.
- **Rule.** Failure evidence is part of the control contract. Create the evidence path before
  any expected validation boundary can fail, sanitize secrets, and prove the failure path in
  qualification instead of relying on success-path artifacts.
