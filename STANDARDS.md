# Programming Standards — System Master

Binding standards for all work in this repository. Enforced by
`.github/scripts/assurance-standards-check.js` in CI.

This file is short on purpose. A standard nobody reads is not a standard.

---

## S-01 — No design lock without a runtime and a test

A PR may not add a `*DESIGN-LOCK*`, `*FREEZE*`, or `*RECONCILIATION*` record for a
capability unless the same PR also adds or modifies:

- at least one production source file, **and**
- at least one test that exercises it.

**Rationale.** This is the single defect that produced 502 branches, twelve work packages
with one test each, a keel runtime with zero tests, and nine document stages frozen at
`RUNTIME_IMPLEMENTATION_CUSTODY_GATED`. Design capacity outran runtime capacity for months.
This rule is the correction.

## S-02 — Every runtime module has a runnable test

No production module ships without a test that can be run by a single command with no
hidden setup. Tests requiring fixtures must document their arguments in a header comment
(see `Fwp001QualificationTest`, which needs a reconstructed traceability CSV plus a
baseline binding, and silently fails usage without them).

## S-03 — A capability is not "done" until it executes end to end

"Qualified", "sealed", "frozen", and "adjudicated" are not done. Done means a real input
enters the system and a real output leaves it, demonstrated by a test. Coordination
without execution is not a feature.

## S-04 — Work lands on the trunk

Work merges to `main` or it does not exist. Long-lived side branches holding the only copy
of a subsystem are prohibited. If a branch cannot merge, that is a defect to fix now, not
a state to preserve.

## S-05 — Every subsystem is registered in SYSTEM-MAP.md

New subsystem, new row in `SYSTEM-MAP.md`: what it is, where it lives, its test count, its
owner, where it logs. A subsystem absent from the map is unfindable and therefore unowned.

## S-06 — Claims require evidence

A status claim in any record must cite the command that produced it and that command's
result. "Verified" without a reproducible command is not verified.

## S-07 — Fix root causes, and write the lesson down

Every non-trivial defect fixed adds an entry to `LESSONS.md`. The list is meant to grow so
the same mistake stops recurring. This is the learning loop; skipping the write-up is
skipping the point.

## S-08 — A verification signal must be able to fail

A check that cannot go red proves nothing. Concretely:

- A test phase may never pass while executing zero tests. Suites assert a floor on how many
  tests they discovered, and **that floor is never lowered to make a build pass** (`mvn test`
  once printed BUILD SUCCESS while running none of 22 test classes — see `L-010`).
- A new or repaired check is demonstrated in both directions: break something on purpose,
  confirm red, restore, confirm green. Record both results.
- Never relabel an identifier, lower a threshold, or widen an exclusion to clear a gate.

## S-09 — Verification runs on a developer machine, not only in CI

`./verify.sh` is the single entry point and must work on a clean checkout with no CI
variables set. Therefore:

- A CI-injected variable (`RUNNER_TEMP`, `GITHUB_*`) is defaulted, never hard-required. One
  script's strict check must not cascade through its callers (`L-011`).
- A gate that genuinely cannot apply locally prints `SKIP <name> reason=CI_ONLY_GATE` with its
  override documented and exits 0. Cryptic failures train developers to ignore red.
- Skips are reported as skips. They never count toward a pass.

---

## Naming and layout

| Thing | Convention |
|---|---|
| Java production | `system-master/<area>/src/main/java/org/systemmaster/...` |
| Java tests | `.../src/test/java/...`, class name ends `Test` |
| Python runtime | `tools/<module>.py` |
| CI scripts | `.github/scripts/<subject>-<verb>.{js,py}` |
| Governance records | `governance/<area>/<RECORD-ID>.json` |
| Qualification inputs | `qualification/<subsystem>/...` |

## Build and test commands

```
./verify.sh                                     # THE command: build + all tests + all qualifiers
./verify.sh --ci-only                           # also force the two CI-only gates

mvn -B compile                                  # compile all Java (foundation-spine + f-wp-001..012)
mvn -B test                                     # run all 22 qualification tests via the JUnit bridge
java -cp target/classes <TestClass>             # run one qualification test directly
node .github/scripts/assurance-standards-check.js   # enforce these standards
```

`./verify.sh` exits 0 only when everything that ran passed. Skips are reported as skips and
never inflate a pass.
