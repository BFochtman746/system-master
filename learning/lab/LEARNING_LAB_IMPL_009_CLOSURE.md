# LEARNING-LAB-IMPL-009 — COURSE REFRESH + SOURCE FRESHNESS + IMMUTABLE SUCCESSOR / SEMANTIC DIFF SLICE

**Status:** `PASS_PORTABLE_IMPLEMENTATION`

## 1. What problem this slice solves

A generated course cannot be treated as timeless. Sources age, standards change, corrections appear, assessment meaning can change, and instructional material can improve. The dangerous implementation is to edit an active course in place. That destroys historical interpretability and can silently leave old mastery attached to a construct the learner was never actually assessed against.

IMPL-009 implements the opposite rule:

`ACTIVE V1 -> freshness trigger -> bounded refresh -> V2 candidate -> independent validation -> semantic diff -> learner-evidence impact plan -> explicit review -> explicit activation`

V1 remains immutable and resolvable throughout.

## 2. Why this matters for a professional-quality Learning system

A professional course must remain both current and rigorous. Refresh is therefore not allowed to mean “newer facts win.” The successor must pass the same frozen professional-quality profile as the active course. A factually refreshed but structurally shallower successor is blocked.

The internal V1 quality profile is deliberately a mechanical floor, not an accreditation claim. It currently requires:

- explicit criteria and outcome/assessment alignment;
- lessons for required skills;
- minimum worked-example and practice depth;
- multiple admitted primary sources;
- grounded material claims;
- independent practice/mastery/retention item families;
- transfer-task diversity for transfer-required skills;
- an explicit human pedagogical-review boundary.

It also explicitly records `external_recognition = NOT_CLAIMED`.

The profile is informed by the types of evidence expected in serious higher-education/professional-course review (including Quality Matters course-design dimensions, ACE faculty review for college-credit recommendations, and ANSI/ASTM E2659-style certificate-program quality expectations), but passing this Lab profile is **not** accreditation, college credit, or an externally recognized certificate.

## 3. Architecture added

### Professional quality profile

- `PROFESSIONAL-COURSE-QUALITY-V1`
- frozen profile digest;
- `evaluate_professional_quality(...)`;
- same profile required for predecessor and successor;
- quality regression blocks refresh;
- external recognition cannot be inferred from mechanical success.

### Freshness

`assess_source_freshness(...)` produces an explicit as-of decision and reason code. The current one-hour threshold is a Lab fixture only; it is not presented as a universal source-freshness policy.

### Immutable course lineage

`register_initial_active_course(...)` creates activation revision 1.

`refresh_course_job(...)` creates a new course object with predecessor lineage. It never edits the active course.

`activate_successor(...)` appends a new activation revision only after validation + explicit review gate + expected-version concurrency check.

### Semantic diff

The diff distinguishes:

- `NON_MATERIAL_SOURCE_REFRESH`;
- `NON_MASTERY_AFFECTING_INSTRUCTIONAL_CHANGE`;
- `MATERIAL_LEARNING_MEANING_CHANGE`;
- `QUALITY_REGRESSION_BLOCKED`.

It identifies exact affected skills and reason codes rather than treating the whole course as invalid whenever anything changes.

### Mastery migration/revalidation

Historical attempts and historical projections are never rewritten.

For each learner/skill, the successor plan says either:

- `PRESERVE_BY_SEMANTIC_EQUIVALENCE`, or
- `REVALIDATION_REQUIRED` -> `REVALIDATION_DUE`.

A synthetic material-change fixture changed the list-comprehension mastery task. The result was:

- `S-PY-LISTCOMP`: revalidation required;
- `S-PY-DICTCOMP`: prior mastery preserved;
- historical attempts mutated: false;
- historical projections mutated: false.

This fixture does **not** claim that Python semantics actually changed. It exists to prove the impact logic.

## 4. Fail-first defect found and repaired

The first refresh execution assumed `learner_id` was a physical column in the attempts table. The existing Lab schema stores attempt identity inside the immutable JSON body, while projections carry a learner column.

The repair did not alter the old schema. The refresh layer now discovers learners through the existing canonical persisted representation and verifies behavior through regression tests.

Why this matters: a new layer should adapt to established storage contracts rather than quietly reshaping predecessor truth to make itself easier to implement.

## 5. What the tests are proving

### Full regression — 247/247 PASS

- 220 predecessor behaviors remain valid;
- 27 new IMPL-009 refresh behaviors pass.

This answers: **Did refresh/versioning break any Learning behavior already qualified?**

### Targeted adversarial — 17/17 PASS

The suite deliberately tries to:

- pass a factually refreshed but lower-quality successor;
- imply college credit/accreditation from an internal gate;
- mutate historical course bytes;
- rewrite/copy historical attempts;
- preserve mastery after a meaning-changing assessment update;
- over-invalidate an unrelated skill;
- auto-activate a successor;
- bypass the explicit review gate;
- activate from a stale predecessor revision;
- change operation payload under the same idempotency key;
- drift research after checkpointing;
- drift model output after pinning;
- recover without required checkpoint state;
- invent mastery for an unknown learner.

A PASS means the bad behavior was caught or correctly contained.

### Refresh crash/recovery — 100/100 PASS

Injected crash points:

1. `REFRESH_TRIGGERED`
2. `REFRESH_SOURCES_ACQUIRED`
3. `REFRESH_MODEL_PINNED`
4. `REFRESH_CANDIDATE_GENERATED`
5. `SUCCESSOR_GENERATED_VALIDATED`
6. `SEMANTIC_DIFF_COMPUTED`

All runs recover to one successor course digest, one semantic-diff digest and one readiness digest. Recovery after sufficiently late checkpoints does not require live research/model providers because the exact committed inputs are already persisted.

### Activation stress — 100/100 PASS

For each run:

- explicit activation creates revision 2;
- exact replay is idempotent;
- a second activation attempt from stale revision 1 fails closed;
- all runs converge on one activation result.

### Semantic-diff determinism — 100/100 PASS

The same old/new immutable evidence always produces the same semantic-diff digest.

## 6. Final qualification

- combined tests: **247/247 PASS**;
- preserved IMPL-001..008 regressions: **220/220 PASS**;
- new IMPL-009 tests: **27/27 PASS**;
- Python files compile: **43 / PASS**;
- targeted adversarial tests: **17/17 PASS**;
- refresh crash/recovery: **100/100 PASS**;
- explicit activation stress: **100/100 PASS**;
- semantic-diff determinism: **100/100 PASS**;
- source freshness-only refresh preserves mastery: **PASS**;
- material meaning change selectively requires revalidation: **PASS**;
- historical course/evidence immutability: **PASS**;
- professional-quality successor gate: **PASS**;
- quality-regression rejection: **PASS**;
- external credit/accreditation claim: **NOT CLAIMED**.

Exact machine-readable receipt: `evidence/qualification_receipt_impl009.json`.

## 7. Truth boundary

This slice does **not** prove:

- that the one-hour Lab freshness threshold is appropriate for every subject;
- that the synthetic material-change fixture represents a real Python language change;
- independent human pedagogical review (the review receipt used here is explicitly a synthetic test fixture);
- academic-credit equivalence or accreditation;
- external professional-certificate recognition;
- assessment reliability from real populations;
- real learner effectiveness or long-term retention;
- native iPhone behavior;
- production System Master integration.

The current quality standing is an internal mechanical professional-course gate with external review still required.

## 8. Exact next objective

`LEARNING-LAB-IMPL-010 — PROFESSIONAL COURSE RIGOR + ASSESSMENT VALIDITY + EXTERNAL REVIEW-READINESS SLICE`

Move from a mechanical professional-quality floor to a versioned qualification dossier suitable for serious SME/faculty/certification review. Define and execute bounded gates for outcome level, subject completeness, prerequisite depth, assessment blueprint coverage, criterion-referenced passing standards, assessment validity/reliability evidence states, workload/depth estimates, accessibility/support completeness, capstone/transfer requirements, reviewer disagreement/abstention, and external-review packaging. Preserve the rule that System Master may declare an internal quality standing but may not award accreditation, college credit, or an externally recognized professional certificate itself.
