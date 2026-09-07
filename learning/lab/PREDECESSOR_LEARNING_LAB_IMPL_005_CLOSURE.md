# LEARNING-LAB-IMPL-005 — SECOND REAL DOMAIN + DOMAIN-GENERAL LEARNING PIPELINE SLICE

**Status:** `PASS_PORTABLE_IMPLEMENTATION`  
**Date:** 2026-09-07  
**Native/device qualification:** `NOT_RUN`  
**Production System Master integration:** `NOT_RUN`

## Objective

Prove that the executable Learning Lab developed through IMPL-001..004 is not merely a Git-specific tutor by adding a materially different real domain and extracting a reusable domain-general runtime path:

`GOAL -> RESEARCH -> SKILL/PREQ MAP -> COURSE -> LESSON -> PRACTICE -> TUTOR -> ASSESSMENT -> RETENTION -> TRANSFER`

while preserving all prior behavioral, evidence, recovery and integrity guarantees.

## Second real domain

The new real domain is fraction arithmetic:

`Add and subtract fractions with unlike denominators, simplify results, and solve a simple quantity-change word problem.`

The frozen research dossier contains three admitted OpenStax Prealgebra 2e sources and six claim records covering:

- LCD as the LCM of denominators;
- equivalent-fraction transformation;
- conversion to a common denominator before addition/subtraction;
- the full add/subtract procedure;
- simplification;
- the prohibition against directly combining unlike denominators.

The dossier is stored at `sources/RESEARCH_DOSSIER_FRACTIONS_UNLIKE_DENOMINATORS_V1.json` and is also emitted as qualification evidence.

## Domain-general implementation

New implementation units:

- `learning_lab/fraction_domain.py`
  - bounded fraction source dossier;
  - course/lesson/practice/assessment generator;
  - independent fraction behavior oracle;
  - maintenance and transfer task families;
  - fraction-specific Tutor probes and diagnosis/remediation policy.
- `learning_lab/domain_general.py`
  - `DomainSpec`;
  - `DomainRegistry`;
  - registry-backed ResearchPort and ModelPort;
  - domain-bound behavior-oracle routing;
  - `DomainGeneralLearningEngine`;
  - `DomainGeneralTutorDirector`.

The previously qualified mastery/retention/transfer state machine and `MultiSessionDirector` are reused rather than reimplemented.

## Major implementation corrections found during this slice

### 1. Candidate answer keys cannot validate themselves

The first fraction oracle implementation compared learner responses to the stored answer key. That is insufficient because an incorrect stored key could validate itself.

Repair: `FractionBehaviorOracle` now derives expected results independently from the problem statement/structure. Deliberately corrupting `M-FRAC-ADD-1` from `19/12` to `17/12` blocks course creation with `DOMAIN_BEHAVIOR_ORACLE_FAILED`.

### 2. Tutor probe gold leaked into generalized context

The first generalized Tutor context copied the formative probe structure including its answer field.

Repair: Tutor context now includes only probe ID, skill, family, prompt and admitted claim references. Answer/diagnostic gold fields are excluded structurally.

### 3. Runtime scoring was partly type-dispatched

The first generalization could dispatch scoring from scoring-type names. That can become ambiguous as more domains reuse scoring labels.

Repair: all learner, maintenance and transfer scoring is now bound to the exact course's registered domain oracle. A deliberately replaced dispatcher cannot force an incorrect fraction response to pass.

### 4. Cross-domain task IDs could silently collide

The Lab repository's immutable object insert is intentionally insert-if-absent. Without an explicit guard, two domains using the same task ID with different meanings could leave the first object silently in place.

Repair: course activation of maintenance/transfer task catalogs compares existing object digests and fails closed with `DOMAIN_TASK_ID_COLLISION` on semantic collision.

### 5. Domain task IDs were removed from core next-action logic

`DomainGeneralLearningEngine.next_action()` contains no Git or fraction maintenance/transfer task IDs. Task selection comes from the registered domain catalog.

## Fraction course behavior proven

The second course has:

- 2 skills;
- 2 prerequisite-linked criteria;
- 2 lessons;
- 4 practice items;
- 2 mastery checks;
- 2 delayed retention checks;
- 2 fresh maintenance tasks;
- 2 novel-context transfer tasks.

The complete fraction lifecycle reaches:

`LCD/equivalence mastery -> delayed retention -> add/subtract lesson/Tutor -> independent mastery -> delayed retention -> RETAINED -> novel word-problem transfer -> MASTERED -> COURSE_COMPLETE`

The transfer tasks change the surface context from symbolic exercises to distance and tank-capacity word problems while preserving the underlying fraction-addition/subtraction construct.

## Tutor/diagnosis behavior proven in the second domain

- arbitrary wrong response -> `ABSTAINED`, not invented misconception;
- one add-denominators pattern -> `TEACHING_HYPOTHESIS`;
- the same pattern across a second distinct probe family -> `EVIDENCE_SUPPORTED`;
- repeating the same probe family does not count as corroboration;
- excessive help request is capped;
- supported performance is followed by support fading/fresh unaided recheck;
- mastery/retention/transfer answers remain unavailable during independent assessment;
- Tutor cannot bypass the prerequisite skill.

## Final qualification

- complete test suite: **108/108 PASS**;
- inherited IMPL-001..004 regressions: **79 preserved**;
- new IMPL-005 domain-general tests: **29/29 PASS**;
- Python files compiled: **27 / PASS**;
- domain-general fraction end-to-end demonstration: **PASS**;
- Git end-to-end flow through the same `DomainGeneralLearningEngine`: **PASS**;
- deterministic course generation for both domains: **PASS**;
- independent fraction-oracle checks: **6/6 PASS**;
- adversarial/mutation campaign: **15/15 PASS**;
- fraction course crash/recovery campaign: **100/100 PASS**;
  - research checkpoint: 50/50;
  - generated/validated checkpoint: 50/50;
  - unique recovered course digests: 1;
  - unique recovered dossier digests: 1;
- generalized Tutor crash/recovery campaign: **100/100 PASS**;
  - OBSERVED: 34;
  - DIAGNOSED: 33;
  - MOVE_SELECTED: 33;
  - unique recovered result digests: 1.
- predecessor IMPL-004 qualification rerun after the changes: **PASS**, including its 100/100 Director recovery campaign.

Exact machine-readable receipt: `evidence/qualification_receipt_impl005.json`.

## Architecture result

The Learning Lab now has one executable Learning control path used by two materially different domains:

- Git procedural/tool workflow;
- fraction conceptual/procedural mathematics.

The variable domain layer supplies research dossier, generation content, behavior oracle, Tutor probes/policy, maintenance tasks and transfer tasks. The Learning core continues to own the semantic mechanics for prerequisite eligibility, evidence admission, mastery, retention, transfer and next-action selection.

This is stronger than simply creating a second bespoke course because the same `DomainGeneralLearningEngine`, `DomainGeneralTutorDirector`, persistence model and multi-session director execute both domains.

## Truth boundary

This slice does **not** prove:

- arbitrary open-ended domains are supported;
- a live nondeterministic model/provider is qualified;
- autonomous live web research is yet the runtime source path;
- the generated lessons have completed independent human pedagogical review;
- real learners gain or retain knowledge because of this system;
- far transfer;
- the one-hour/one-day Lab retention policies are scientifically calibrated;
- target iPhone behavior;
- production System Master integration.

The course standing remains `MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED`.

## Exact next objective

`LEARNING-LAB-IMPL-006 — BOUNDED OPEN-GOAL RESEARCH + GENERATIVE COURSE COMPILER SLICE`

Replace the two hard-bound goal selectors with an executable bounded open-goal compiler that can accept a new supported learning goal, produce a research plan, acquire/normalize source evidence through a live/replayable ResearchPort, generate a candidate skill/prerequisite map, curriculum, lessons, practice and assessment through a replaceable generative ModelPort, bind every material instructional claim to admitted evidence, independently validate mechanically decidable outputs, and route uncertain/pedagogical claims to review instead of fabricating validation. Prove the pipeline on at least one previously unseen third-domain goal while preserving all IMPL-001..005 regressions and autonomous crash/retry/idempotency behavior.
