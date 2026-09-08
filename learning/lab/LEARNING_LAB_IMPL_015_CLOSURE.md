# LEARNING-LAB-IMPL-015 — Learner Baseline Diagnostic + Adaptive Entry / Prerequisite-Gap Routing Slice

**Status:** `PASS_PORTABLE_IMPLEMENTATION`  
**Date:** 2026-09-07  
**Baseline:** cumulative qualified `LEARNING-LAB-IMPL-014` repository bytes  
**Target-native:** NOT REQUIRED FOR THIS PORTABLE SLICE / NOT CLAIMED  
**Production System Master integration:** NOT PERFORMED

## Objective closed

Implemented the first bounded learner-entry diagnostic that can use learner declarations and direct diagnostic observations to reduce unnecessary instruction **without allowing placement logic to become a second mastery authority**.

Core flow:

`LEARNER DECLARATION -> PREREQUISITE GRAPH WALK -> SAFE DIAGNOSTIC PROBE -> OBSERVE / ABSTAIN -> TARGETED REMEDIATION OR INDEPENDENT VERIFICATION -> EXISTING MASTERY ENGINE`

The decisive rule is:

> Diagnostic evidence may change routing. Diagnostic evidence may not mint mastery.

## What changed architecturally

New module:

`learning_lab/baseline_diagnostic.py`

New public surface:

- `BASELINE_DIAGNOSTIC_VERSION = LEARNING-BASELINE-DIAGNOSTIC-V1`
- `ADAPTIVE_ENTRY_POLICY_VERSION = LEARNING-ADAPTIVE-ENTRY-POLICY-V1`
- `DiagnosticPolicyError`
- `BaselineDiagnosticDirector`

New persistent object families reuse the established immutable `Repository` object store rather than creating another learner-state database:

- `baseline_diagnostic`
- `diagnostic_probe`
- append-only versioned `diagnostic_probe_index`

No new mastery table, mastery projection table, or competing competence authority was added.

## Adaptive entry behavior

### Learner declarations

A learner may declare prior knowledge for one or more skills. Each declaration is stored with epistemic standing:

`LEARNER_DECLARED`

A declaration can cause the system to test rather than teach, but it creates no mastery attempt and no mastery projection.

### Advanced-skill claims

If a learner claims an advanced skill, the director walks hard prerequisites first.

Example from the controlled synthetic course:

`claim S-ROUTE -> probe S-STABILITY first`

Example from the real ASQ bounded module:

`claim S-ASQ-CHARTER -> probe S-ASQ-SIPOC first`

This prevents a fluent learner from skipping a hidden prerequisite merely because they self-report confidence in a downstream skill.

### Correct diagnostic result

A correct independent diagnostic result produces:

`OBSERVED_CORRECT_INDEPENDENT -> INDEPENDENT_VERIFICATION`

It may bypass the lesson, but the target is an existing independent mastery check. The diagnostic itself has:

- `routing_only = true`
- `qualifies_mastery = false`
- `mastery_attempt_written = false`
- `mastery_projection_written = false`

### Incorrect diagnostic result

An independent incorrect prerequisite probe produces:

`OBSERVED_INCORRECT_INDEPENDENT -> TARGETED_REMEDIATION`

The remediation is bound to the exact prerequisite skill rather than restarting the whole course.

### Insufficient or contaminated evidence

- blank response -> `INSUFFICIENT_EVIDENCE`
- assisted response -> `ASSISTED_NOT_INDEPENDENT`
- answer revealed before commitment -> `ASSISTED_NOT_INDEPENDENT`

The director selects a fresh practice family when available. If no fresh safe probe exists, it defaults to instruction rather than pretending uncertainty is competence.

### Existing mastery truth remains authoritative

- current mastery can skip diagnostic work for that skill;
- `RETENTION_DUE` is honored before downstream entry;
- `REVALIDATION_DUE` routes to the existing adaptive revalidation layer;
- diagnostic routing never overwrites or synthesizes mastery projections.

## Independent scoring boundary

`EXACT` diagnostic items can use the built-in deterministic exact scorer.

Non-`EXACT` items fail closed with:

`DIAGNOSTIC_SCORER_REQUIRED`

unless an independent domain scorer is injected. The real ASQ test uses `ASQDefineBehaviorOracle.score`, proving the diagnostic layer can reuse a domain oracle rather than trusting generated answer prose.

## Fail-first defects found and repaired

### 1. Immutable multi-probe index collision

Initial implementation used one immutable index object per diagnostic/skill. After an abstention, a second fresh probe would collide with the first index entry.

**Repair:** diagnostic probe indexes are now append-only, versioned objects. Historical probe order remains reconstructible.

### 2. Crash after probe indexing rejected valid replay

After a crash immediately after indexing, the next routing state had already advanced to `INDEPENDENT_VERIFICATION`. Replay of the exact interrupted probe was therefore rejected as no longer being the current diagnostic action.

**Repair:** exact existing probe identity and operation ownership are recognized before current-route authorization. New probes must still match the currently authorized action; interrupted exact replays can finish idempotently.

### 3. Qualification wrapper orchestration

The first all-in-one qualification command exceeded the host command-duration ceiling while combining the full regression suite and two 100-run campaigns.

This was an orchestration limitation, not a product failure. Campaigns were split into bounded receipts, and the final wrapper runs bounded smoke campaigns while verifying the preserved 100-run evidence.

## Qualification evidence

### Tests

- combined tests: **481/481 PASS**
- predecessor IMPL-014 behaviors preserved: **455/455**
- new IMPL-015 tests: **26/26 PASS**

The new tests cover:

- no-claim entry to instruction;
- foundational claim -> probe;
- advanced claim -> hidden prerequisite probe;
- correct diagnostic -> independent verification, not mastery;
- incorrect prerequisite -> targeted remediation;
- blank response -> abstention/fresh family;
- assisted/answer-revealed responses cannot bypass;
- direct use of a mastery item as diagnostic is rejected;
- learner declaration cannot create attempts/projections;
- existing mastery skips redundant diagnostic work;
- retention due is not bypassed;
- idempotent diagnostic creation;
- changed replay payload conflict;
- append-only second probe;
- crash recovery at diagnostic pin, probe store, and probe index;
- probe identity reuse across operations blocked;
- non-exact scorer fail-closed behavior;
- injected independent scorer path;
- real ASQ advanced-claim prerequisite routing.

### Adversarial campaign

**22/22 PASS**.

The attacks specifically attempt to make the system over-credit a learner through declarations, correct-but-diagnostic responses, assistance, answer exposure, item substitution, replay manipulation, unsupported scorers, hidden prerequisite bypass, and retention bypass.

### Crash/recovery campaign

**100/100 PASS** across:

- `DIAGNOSTIC_PINNED`: 34
- `PROBE_STORED`: 33
- `PROBE_INDEXED`: 33

Results:

- unique recovered result tuples: **1**
- mastery attempts created by diagnostic: **0 in every run**
- mastery projections created by diagnostic: **0 in every run**
- duplicate probe-index entries after recovery: **0 in every run**

### Determinism campaign

**100/100 PASS** across fresh stores.

- unique result tuples: **1**

### Compile

- Python files compiled: **67 / PASS**

Machine-readable evidence:

- `evidence/qualification_receipt_impl015.json`
- `evidence/impl015_adversarial_campaign.json`
- `evidence/impl015_recovery_campaign.json`
- `evidence/impl015_determinism_campaign.json`
- `evidence/impl015_diagnostic_demo.json`
- `evidence/impl015_full_tests.txt`
- `evidence/impl015_new_tests.txt`

## What this proves

For the bounded portable slice, Learning can now:

1. accept learner prior-knowledge declarations without treating them as truth;
2. walk prerequisite dependencies before honoring downstream claims;
3. select safe placement probes from non-mastery practice families;
4. abstain when evidence is absent or contaminated;
5. detect a prerequisite gap and route to targeted remediation;
6. allow demonstrated prior knowledge to bypass unnecessary teaching only as far as independent verification;
7. preserve the existing mastery/retention authority untouched;
8. recover deterministically from interruptions at every new persistence boundary;
9. operate on both the synthetic control domain and the real ASQ bounded-module domain through an independent scorer.

## Truth boundary / not proven

This slice does **not** prove:

- population-level diagnostic validity or reliability;
- scientifically calibrated diagnostic length;
- that one or two probes are sufficient for high-stakes placement;
- real learner learning gains;
- psychometric equivalence across demographic groups;
- target-native iPhone interaction/accessibility/background behavior;
- Windows-specific Learning behavior;
- production System Master shared-authority integration;
- certification, job readiness, or role qualification.

## Exact next objective

`LEARNING-LAB-IMPL-016 — ADAPTIVE ENTRY PLAN EXECUTION + PREREQUISITE REMEDIATION / SKIP-AHEAD CONTINUITY SLICE`

Connect the now-qualified baseline diagnostic to the existing Tutor, mastery, retention, transfer, and multi-session directors so one durable learner journey can execute:

`DIAGNOSE ENTRY -> REMEDIATE GAP OR SKIP LESSON -> INDEPENDENT VERIFY -> RETENTION/TRANSFER AS REQUIRED -> CONTINUE TO NEXT UNSATISFIED COMPETENCY`

The slice must prove that adaptive entry remains stable across sessions, remediation actually closes the diagnosed prerequisite gap, skip-ahead never bypasses independent evidence, stale evidence re-enters revalidation, and interruption/replay cannot duplicate or reorder learner progression.
