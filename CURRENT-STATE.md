# CURRENT STATE — System Master

**This file is the single authoritative entry point for any chat session or agent
working in `BFochtman746/system-master`. Read this file. Do not read the governance
corpus on entry.**

Everything below is derived from `governance/CURRENT-AUTHORITY.json`
(`CURRENT-AUTHORITY-003`, effective 2026-09-12). If this file and that file ever
disagree, `CURRENT-AUTHORITY.json` wins and this file is stale — regenerate it.

- **Authority:** `CURRENT-AUTHORITY-003`, effective `2026-09-12`
- **Selected topology:** `governance/SYSTEM-TOPOLOGY-005.json`
- **Base commit for this state:** `49c28f7d5f9ebd9878f9bd88a243363d87570bed`

---

## Active systems

`SYSTEM_MASTER` is the product root. All four peers are **active and incomplete**:

| Lane | Control ref | Status |
|---|---|---|
| CORE | `system-master/control-v2` | incomplete |
| LEARNING | `learning/control-v1` | incomplete |
| BOOK | `book-system/control-v1` | incomplete |
| DOCUMENTS | `documents/control-v1` | incomplete |

**PROSE is historically complete and terminally retired.** It is not an active child,
repair lane, qualification lane, or claim domain. Any metadata still labelling PROSE
active is `STALE_ARCHITECTURE_PENDING_RECONCILIATION` and cannot dispatch.

**PROGRAMMING** is an active non-peer engineering work program. It is not a peer lane.

---

## What to work on

- **Central next objective:** `SYSTEM-MASTER-INTEGRATION-COORDINATION-001`
- **Highest discretionary objective:** `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001`
  (while selected, CORE prioritises Programming proving-corpus recovery first)

---

## The selected record set

These are the **only** governance documents that currently hold authority. Superseded
versions live in `governance/archive/superseded/` — they are historical evidence, never
a source of current state.

| Role | Selected file |
|---|---|
| Topology | `governance/SYSTEM-TOPOLOGY-005.json` |
| Architecture decision | `governance/ADR-0005-PROSE-TERMINAL-RETIREMENT-BOOK-INTEGRATION.md` |
| Program job lock | `governance/SYSTEM-PROGRAM-JOB-LOCK-001.json` |
| Completion status | `governance/SYSTEM-COMPLETION-STATUS-001.json` |
| Sealed checkpoint | `governance/SYSTEM-STATE-BASELINE-006.json` |
| Completion ledger | `governance/COMPLETION-LEDGER-003.json` |
| Obligation registry | `governance/WORK-OBLIGATION-REGISTRY-012.json` |
| Expectation registry | `governance/EXPECTATION-REGISTRY-005.json` |
| Reallocation ledger | `governance/REALLOCATION-LEDGER-004.json` |
| System catalog | `governance/catalog/SYSTEM-MASTER-SYSTEM-CATALOG-003.json` |
| Owner chat contract | `governance/CHAT-LANE-OPERATING-PROMPT-002.md` |
| Second Shift registry | `governance/second-shift/SECOND-SHIFT-REGISTRY-001.json` |

---

## The five rules that actually matter

Condensed from the 20-step startup sequence. The full sequence remains in
`CURRENT-AUTHORITY.json` for when a specific edge case needs adjudicating.

1. **Live state beats records.** Re-fetch live active-owner heads before executing.
   The sealed checkpoint is the latest *coherent* snapshot, not current truth.
2. **One mutation claim per lane, at most.** Overlap or a stale head binding fails
   closed and must be reconciled before any mutation.
3. **Lanes don't cross.** No peer takes another peer's product semantics outside an
   admitted interface. CORE owns shared infrastructure only.
4. **Completion is product-level only.** A green packet, phase, branch, test, or
   qualification never makes an owning system complete.
5. **Evidence must match its exact subject.** No PASS transfers across a changed SHA,
   topology, subject, or ownership boundary. Missing ledgers are UNKNOWN, never inferred.

Before ending substantive work: reconcile affected obligation/delegation/repair state
and bind exactly one dependency-valid successor inside the same active system.

---

## Control-plane health

**Repaired on branch `recovery/control-plane-repair-001`** (audit: BLOCKER 20 → 0,
HIGH 28 → 1, MEDIUM 10 → 1; verifier 9/9; 109 tests green):

- Six workflows GitHub rejected before running (invalid `queue:` concurrency key,
  `workflow_dispatch` input overflow) now parse.
- Reusable-workflow call chains brought within GitHub's 4-level limit.
- CI no longer monkey-patches `SupervisorStore.audit_invariants` or rewrites tests at
  runtime — the shipped class is what gets exercised.
- The quadratic 20,000-transition stress loop is now indexed with a shallow per-step
  audit; the committed supervisor suite runs green in ~18s instead of erroring.
- Every runnable job has `timeout-minutes`, so nothing can wedge the self-hosted runner.
- The two governance gates (`second-shift-owner-coverage.js` and the reconciler) return
  the same verdict on identical input; the reconciler no longer overrides child severity.
- `--no-live` offline mode no longer compares a value to itself.
- stdin-reading repair scripts fail fast instead of blocking forever.
- Mutable action tags pinned to commit SHAs.
- `validate-system-control-branch.js` now resolves its topology from
  `CURRENT-AUTHORITY.json` instead of hardcoding a version. It had been enforcing
  retired topology 002, which **rejected the active DOCUMENTS lane** and accepted
  retired PROSE. Both now behave correctly.
- `system-state-reconciler-legacy.js` deleted (zero references repo-wide; it read five
  superseded records).

**Still open — needs content that cannot be synthesised:**

- `book-workflow-durable-store.test.js` is missing from the repository, so
  `book-durable-persistence-hosted-qualification.yml` cannot produce evidence. The job
  now fails with a named cause instead of an opaque error. Commit the test subject.
- 51 Java sources with no `pom.xml` or `build.gradle`; every qualifier hand-types its
  own `javac` source list. Add a build definition, or accept the drift risk.

---

## Unmerged work — decision pending

`origin/apply-updates-008` is **66 commits ahead of `main`, 0 behind**, never merged.
It adds real capability — audiobook builder, automation/browser/calendar/chat plan
modules, website builder, with tests and qualification corpora (193 files, +18,593 lines).

It fixes **none** of the 20 blockers, and audits worse than `main` did
(HIGH 28 → 34, MEDIUM 10 → 34). It has not been merged, rebased, or retired.

Decide explicitly. Leaving it unmerged while continuing to branch from `main` is how the
divergence reached this size.
