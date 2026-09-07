# LEARNING-LAB-IMPL-004 — MULTI-SESSION ADAPTIVE RETENTION + TRANSFER DIRECTOR SLICE

**Status:** `PASS_PORTABLE_IMPLEMENTATION`

## Implemented scope

This slice extends the executable Learning Lab with a successor `AdaptiveLearningEngine` and `MultiSessionDirector` while preserving the qualified IMPL-001/002/003 runtime paths for regression.

Implemented behavior:

- durable Learning session records across multiple sessions;
- checkpointed/idempotent adaptive director decisions;
- as-of-now mastery projection rather than trusting stale stored status;
- explicit `REVALIDATION_DUE` when qualifying retention evidence exceeds the Lab freshness policy;
- `RETENTION_WAIT` before the configured delayed-evidence interval is met;
- fresh-family maintenance/revalidation tasks;
- same-family retention repetition cannot refresh stale competence;
- branch/merge skill requires explicit transfer evidence after retention;
- two novel-context transfer task families using non-`main` base branches;
- independent executable Git scoring for transfer tasks;
- assisted transfer cannot satisfy transfer evidence;
- a failed/assisted transfer family becomes compromised and cannot later be recycled as qualifying transfer evidence;
- after retention revalidation, older transfer evidence that predates the new current retention evidence no longer satisfies the current transfer gate;
- Tutor respects adaptive stale prerequisites and cannot bypass them;
- Tutor blocks hints/answers during transfer and maintenance checks;
- current `COURSE_COMPLETE` is revoked when required retained evidence becomes stale.

## Concrete transfer proof

The learned course teaches a feature-branch workflow rooted in `main`. IMPL-004 transfer tasks change construct-irrelevant surface/context details while preserving the target skill:

1. current base branch `release` -> create/switch `urgent` -> stage/commit `hotfix.txt` -> return to `release` -> merge `urgent`;
2. current base branch `integration` -> create/switch `docs` -> stage/commit `guide.txt` -> return to `integration` -> merge `docs`.

Both reference only admitted frozen Git claims and both reference answers execute successfully in a real temporary Git repository.

## Final portable qualification

- Unit/behavior/negative tests: **79/79 PASS**.
- Prior IMPL-001/002/003 regressions: **58/58 preserved inside the 79-test suite**.
- Python compile: **23 files / PASS**.
- Multi-session end-to-end demonstration: **PASS**.
- Deterministic multi-session decision across fresh stores: **PASS**.
- Targeted retention/transfer/director mutation campaign: **13/13 PASS**.
- Transfer executable oracles: **2/2 PASS**.
- Fresh maintenance executable oracles: **2/2 PASS**.
- Crash/recovery/idempotent replay stress: **100/100 PASS**.
  - `SESSION_BOUND`: 25/25;
  - `PROJECTION_SNAPSHOTTED`: 25/25;
  - `ACTION_SELECTED`: 25/25;
  - `DECISION_COMPLETED_BEFORE_RETURN`: 25/25.
- Unique recovered director result digests: **1**.

Machine-readable receipt: `evidence/qualification_receipt_impl004.json`.

## Failure cases proven

The slice fails closed or refuses promotion for at least:

- transfer attempted before current retention evidence exists;
- retention-only evidence presented as transfer;
- Tutor-assisted transfer presented as independent transfer;
- answer/help request during transfer assessment;
- failed transfer family retried with the now-exposed same family;
- stale retention left represented as current mastery;
- same stale retention family repeated to manufacture freshness;
- assisted maintenance attempt presented as independent revalidation;
- Tutor attempting to enter a downstream skill when its prerequisite has become stale;
- director execution without a durable active Learning session;
- changed payload under the same director operation ID;
- crash at any director checkpoint followed by replay;
- current course-complete claim remaining active after retention evidence becomes stale.

## Important implementation corrections found during this slice

1. **Tutor stale-prerequisite bypass:** Tutor originally used the last persisted prerequisite projection. IMPL-004 changes Tutor to use the adaptive as-of-now projection when the engine provides one, preventing a historically mastered but now stale prerequisite from remaining silently eligible.
2. **Stress-harness overwork:** the initial 100-run director stress campaign regenerated/revalidated the whole course every iteration. The harness was repaired to seed one already-qualified database and clone it for each recovery trial, isolating the actual director durability behavior under test.
3. **Freshness is not repetition:** reusing the same retention family after it has become stale is explicitly excluded. Revalidation requires a fresh task family.
4. **Transfer is not retained repetition:** transfer is a separate gate and requires a novel-context family executed after current retention evidence.

## Truth boundary

This slice proves a bounded portable implementation for the declared Git course. It does **not** prove:

- the one-hour retention delay or one-day freshness horizon is scientifically calibrated; both are explicit Lab policy fixtures;
- far transfer to a substantially different domain;
- arbitrary-domain transfer-task generation;
- real learner retention or learning gain;
- live LLM adaptive decision quality;
- independent human pedagogical review;
- native iPhone behavior;
- production System Master integration.

`PASS_PORTABLE_IMPLEMENTATION` therefore means the declared software behaviors are executable and qualified in the portable Lab, not that general learning efficacy has been established.

## Exact next objective

`LEARNING-LAB-IMPL-005 — SECOND REAL DOMAIN + DOMAIN-GENERAL LEARNING PIPELINE SLICE`

Take the now-working goal/research/course/lesson/practice/assessment/tutor/retention/transfer pipeline into a materially different second real learning domain and remove Git-specific assumptions from the generalized contracts. Prove the same core can compile, teach, diagnose/abstain, assess, retain and test transfer without creating a second domain-specific Learning engine; preserve all 79 current regressions and continue portable-first qualification.
