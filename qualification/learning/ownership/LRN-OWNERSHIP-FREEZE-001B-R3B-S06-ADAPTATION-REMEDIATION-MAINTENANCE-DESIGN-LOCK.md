# LRN-OWNERSHIP-FREEZE-001B-R3B-S06 — Adaptation / Remediation / Maintenance Design Lock

Status: **RECOVER / INVENTORY / OWNER ADJUDICATION / DESIGN LOCK COMPLETE — EXECUTABLE BUILD BLOCKED ON EXACT IMPLEMENTATION-LINEAGE MATERIALIZATION**  
Owner lane: `SYSTEM_MASTER/LEARNING`  
Date: `2026-09-12`

## 1. Scope and authority

S06 continues the current Learning ownership reconstruction. It does not revive the stale Batch-07 execution plan and does not transfer Curriculum, scheduler/automation, Core, Assurance, Book, Documents or Programming authority into Learning.

S06 is bounded to these current Learning semantic object families:

- `LRN-E018-L RemediationNeed`
- `LRN-E019 MaintenancePlan`
- `LRN-E020-L AdaptiveLearningPolicyVersion`
- `LRN-E021 AdaptiveDecisionTrace`

It consumes but never writes:

- `LRN-E018-C RemediationPlan` — Curriculum-owned;
- `LRN-E020-C InstructionalPolicyVersion` — Curriculum-owned;
- shared scheduler/automation delivery truth;
- shared Assurance/model-calibration truth;
- shared/Core persistence, transport, reconciliation and generic execution truth.

## 2. Exact interface inventory

Repository-native binding against the current 112-row repaired ledger recovered **12/12** selected S06 contracts, with the ledger SHA-256 independently verified as:

`4f4387956bd8189b7a65f5de94ab3c722cb34f249ebe8a94ad74b4c0d0c3cbc0`

Learning-owned commands:

- `I016-L CreateRemediationNeed`
- `I017 OverrideNextAction`
- `I018 RequestMaintenancePlan`

Learning-owned queries:

- `I026 GetNextAction`
- `I030 GetMaintenanceQueue`

Learning-owned events:

- `I040 MaintenanceDueIntentCreated`
- `I042 RemediationRecommended`

Learning-owned typed errors:

- `I054 OverrideNotPermitted`
- `I055 NoEligibleAction`
- `I104 MaintenancePolicyUnavailable`

Owner-external dependencies included in the bound slice:

- `I016-C RequestRemediationPlan` — **Curriculum-owned**, split from the historical compound I016;
- `I105 ModelNotCalibrated` — **shared Assurance/Core-owned**, consumed fail-closed by Learning.

This exact split is constitutional: historical `RequestRemediationPlan` may not be reassembled into one Learning writer.

## 3. Research adjudication

No new external research is required to change the S06 authority design before implementation. The recovered current owner corpus already contains the material research-sensitive constraints:

- identical versioned inputs must produce the same deterministic v1 next action and reason codes;
- every recommendation must carry an eligibility trace and an ineligible action cannot win because of a model score;
- learner override is preference/action context and never competence evidence by itself;
- remediation must cite trigger evidence and exit/recheck conditions and must not let same-item memorization satisfy the mastery gate;
- maintenance output is an earliest/target/latest due window plus rationale, not a magic fixed schedule presented as scientific truth;
- when a retention horizon is absent, the system must use a labeled default or ask for intent rather than claiming an optimized schedule;
- an uncalibrated predictive model must fall back to deterministic policy or reject consequential use.

Additional spacing/retention research can inform later policy calibration/empirical validation, but it cannot authorize stronger effectiveness/optimization claims without observed learner evidence. Therefore external literature is not used to broaden S06 runtime authority in this unit.

## 4. Adaptive policy and decision trace

### 4.1 AdaptiveLearningPolicyVersion

`LRN-E020-L AdaptiveLearningPolicyVersion` is immutable/versioned Learning policy for:

- eligibility filters;
- learner-state adaptive priorities;
- remediation/maintenance priority;
- override rules;
- tie-breaking;
- deterministic fallback behavior;
- optional model-use policy when exact calibration/assurance standing permits it.

It does not own instructional strategy/content truth such as retrieval/scaffolding/feedback modality rules that belong to Curriculum `InstructionalPolicyVersion`.

### 4.2 Deterministic v1 recommendation

For identical exact versioned inputs, the deterministic v1 evaluator must return the same:

- eligible candidate set;
- rejected/ineligible candidate set with reasons;
- selected action;
- alternatives;
- reason codes;
- override policy;
- policy version;
- input/version digest.

No ineligible candidate may win because an ML/model score is high.

### 4.3 AdaptiveDecisionTrace

`LRN-E021 AdaptiveDecisionTrace` is append-only decision evidence. Every durable recommendation must record at minimum:

- decision/trace identity;
- exact goal/learner-state references permitted by privacy policy;
- input/version digest;
- exact adaptive policy version;
- exact relevant mastery/remediation/maintenance/curriculum references;
- eligible candidates and eligibility reasons;
- rejected candidates and blocker reasons;
- selected action and deterministic tie-break reason;
- model reference/calibration decision when a model was consulted;
- alternatives;
- override standing;
- creation time/as-of identity.

The original trace is never destructively rewritten. Later accepted/overridden/expired standing is represented through explicit successor/disposition history associated with the immutable trace.

### 4.4 `I026 GetNextAction` is read-only

`I026` is a query and must not silently create canonical state. It returns the current owner-valid recommendation/trace projection or an explicitly non-canonical deterministic preview according to the bound service contract.

If current architecture requires a new durable `AdaptiveDecisionTrace`, an owner-local evaluation operation triggered by an admitted state/policy change must persist it before the query exposes it. This internal operation is not a new public CQEE interface and must be recovered/bound during implementation reconciliation rather than invented as a transport command.

### 4.5 Model path

A predictive model is optional advisory input only where exact current Assurance/calibration standing permits the intended use.

`I105 ModelNotCalibrated` is shared authority. On that result S06 must either:

- use the frozen deterministic policy path if policy permits; or
- reject/degrade the consequential model-dependent action.

It may never convert a model probability into mastery truth or bypass an eligibility/prerequisite/policy gate.

## 5. Learner override

`I017 OverrideNextAction` records an authorized user-selected alternative against an exact recommendation/trace/policy version.

Rules:

1. the referenced recommendation must exist and be current enough for the requested override;
2. selected action must be within the exact override-eligible set or independently revalidated;
3. locked assessment/integrity/safety/policy restrictions may deny override using `I054 OverrideNotPermitted` with policy reason/version;
4. same operation identity + same semantic payload replays the same result;
5. same operation identity + different payload conflicts;
6. override creates append-only decision/disposition evidence, never rewrites the original recommendation trace;
7. override is learner preference/action context only and cannot count as evidence of competence/mastery.

## 6. Remediation boundary

### 6.1 Learning diagnosis

`I016-L CreateRemediationNeed` is the Learning-side diagnosis command. `RemediationNeed` must identify:

- learner/goal reference permitted by privacy policy;
- affected skill/criterion refs and exact versions;
- current evidence references;
- diagnosis/error/evidence-gap reason codes;
- current mastery/projection references where relevant;
- entry condition;
- exit/recheck condition;
- policy/version identity;
- operation/idempotency identity;
- supersession/resolution lineage.

Learning may diagnose a need from current owner-valid learner evidence/state. It does **not** choose or own canonical instructional content.

### 6.2 Curriculum instructional response

`I016-C RequestRemediationPlan` is Curriculum-owned. Learning may request a plan through the declared Curriculum port using a current RemediationNeed reference plus compatible Curriculum/criterion versions and constraints.

Curriculum owns the resulting `RemediationPlan`. Learning stores/references the plan identity/version needed for recommendation/projection only.

A stale RemediationNeed, mismatched CurriculumVersion, unknown criterion, invalid plan, or unavailable dependency fails explicitly. Learning cannot synthesize a Curriculum plan locally to bypass the dependency.

### 6.3 Remediation recommendation

`I042 RemediationRecommended` is emitted only from a current owner-valid Learning remediation/adaptive decision that references an eligible Curriculum plan and exact trigger evidence/skill/reason context.

The recommendation does not assert that remediation worked. Exit requires fresh owner-valid evidence satisfying the bound recheck conditions. Repetition/memorization of the same item cannot automatically satisfy a gate requiring fresh/generalized evidence.

## 7. Maintenance boundary

### 7.1 MaintenancePlan semantics

`LRN-E019 MaintenancePlan` is Learning-owned learner maintenance/revalidation due-state and intent. It does not own review/remediation content and does not own notification delivery.

A plan binds:

- exact goal/skill/mastery projection/version;
- exact retention horizon or explicit labeled default/intent source;
- exact maintenance/adaptive policy version;
- earliest / target / latest due window;
- rationale/reason codes;
- maintenance/revalidation state;
- supersession/pause/completion lineage;
- operation identity;
- scheduler intent references only after event publication.

### 7.2 No pseudo-scientific timing

S06 may calculate policy windows but cannot claim an empirically optimized interval unless such effectiveness/retention evidence has actually been established for the intended use/population/context.

If no valid policy exists for a required skill/horizon, return `I104 MaintenancePolicyUnavailable`. Do not generate a precise-looking schedule and label it optimal.

### 7.3 Scheduler separation

`I040 MaintenanceDueIntentCreated` is the Learning semantic due intent. The shared scheduler/automation authority owns actual notification/delivery scheduling.

Learning does not create a local generic scheduler. Scheduler outage leaves the Learning intent durably pending/retryable; it does not erase the due state. Duplicate delivery/event handling must be idempotent by stable intent/event identity.

`I030 GetMaintenanceQueue` is a Learning read projection over due/soon/overdue maintenance intents and reasons. It does not claim that notifications were actually delivered.

## 8. State / transaction / recovery discipline

Every S06 mutation must trace:

`requirement/invariant -> exact owner operation/interface -> Learning semantic state -> operation receipt -> outbox/interface consequence -> tests -> exact evidence -> environment -> blocker`

Rules:

- expected-version/CAS applies to mutable/successor state where the exact contract requires it;
- same semantic operation + same payload replays;
- same operation + different payload conflicts;
- owner mutation + operation receipt + owner outbox commit atomically;
- restart reconstructs from durable owner state;
- no read-after-write freshness assumption for Curriculum/Core/Assurance/scheduler projections;
- retries are only for classified transient failures, bounded, and reuse semantic identity;
- stacked retries across Learning and external scheduler/job/model layers cannot duplicate recommendation/remediation/maintenance effects;
- unknown dependency/policy/calibration standing remains explicit and never becomes PASS/eligible by fallback.

## 9. Frozen S06 pre-build denominator — 72 cases

These are obligations, not PASS claims.

### A. Ownership / split authority — S06-T01..T12

1. Learning writes RemediationNeed, not RemediationPlan.
2. Curriculum writes RemediationPlan, not learner RemediationNeed.
3. historical compound I016 cannot accept new writes.
4. Learning cannot write Curriculum InstructionalPolicyVersion.
5. Learning owns AdaptiveLearningPolicyVersion only.
6. Learning owns AdaptiveDecisionTrace only.
7. shared scheduler owns delivery, not MaintenancePlan semantics.
8. shared Assurance owns model calibration standing.
9. Core persistence cannot select next action.
10. Book semantics cannot enter S06 canonical state.
11. Documents semantics cannot enter S06 canonical state.
12. Programming semantics cannot enter S06 canonical state.

### B. Adaptive eligibility / determinism / model fence — S06-T13..T28

13. identical exact versioned inputs yield identical eligible candidate set.
14. identical exact inputs yield identical selected action/reason codes.
15. stale input/policy version cannot silently reuse prior recommendation.
16. every recommendation includes eligibility trace.
17. every ineligible candidate has blocker/reason evidence.
18. ineligible candidate cannot win because model score is high.
19. missing prerequisites yield I055 or blocked alternative, not silent fallback.
20. deterministic tie-break is stable and recorded.
21. uncalibrated model returns I105 dependency standing.
22. policy-permitted deterministic fallback works without treating model as authority.
23. policy-forbidden model-dependent action fails closed when calibration unavailable.
24. model confidence never becomes mastery.
25. GetNextAction does not mutate canonical state.
26. query returns exact policy/recommendation version.
27. stale recommendation query is marked stale/blocked rather than silently freshened from unknown inputs.
28. external model/provider/chat metadata cannot become eligibility authority.

### C. Decision trace / override — S06-T29..T40

29. durable recommendation has immutable trace identity.
30. trace binds exact input digest and policy version.
31. original trace is never destructively rewritten.
32. override references exact recommendation/policy version.
33. valid allowed override records once.
34. duplicate same override operation replays.
35. conflicting duplicate override operation fails.
36. disallowed override returns I054 with reason/version.
37. stale override cannot modify superseded recommendation.
38. override disposition is append-only/successor evidence.
39. override cannot count as competence evidence.
40. restart reconstructs recommendation/override lineage.

### D. Remediation — S06-T41..T54

41. current evidence gap can create one RemediationNeed.
42. insufficient/untraceable evidence cannot create a confident diagnosis.
43. RemediationNeed binds affected skill/criterion versions.
44. RemediationNeed binds trigger evidence refs and reason codes.
45. RemediationNeed includes explicit recheck/exit condition.
46. duplicate same remediation operation replays once.
47. conflicting duplicate remediation operation fails.
48. stale need cannot request current Curriculum plan without reconciliation.
49. Learning cannot synthesize Curriculum RemediationPlan when I016-C dependency is unavailable.
50. Curriculum plan ref/version is pinned before recommendation.
51. I042 is emitted only for owner-valid eligible plan/need context.
52. recommendation does not assert remediation success.
53. same-item memorization cannot satisfy a gate requiring fresh evidence.
54. remediation exit preserves need/plan/evidence lineage.

### E. Maintenance / scheduler separation — S06-T55..T66

55. valid request creates/version-updates Learning MaintenancePlan once.
56. plan binds exact mastery projection/version.
57. plan binds retention horizon or explicitly labeled default/intent source.
58. plan records earliest/target/latest window and rationale.
59. missing policy returns I104 rather than fabricated precision.
60. plan never labels timing empirically optimal without actual evidence.
61. due transition creates one stable I040 intent/event.
62. scheduler outage preserves durable due intent for retry/reconciliation.
63. duplicate I040 delivery cannot duplicate semantic due intent.
64. scheduler delivery truth is not copied into Learning without contract evidence.
65. GetMaintenanceQueue returns due/soon/overdue reasons but not delivery claim.
66. superseded/paused/completed maintenance lineage is preserved.

### F. Recovery / claim / cumulative discipline — S06-T67..T72

67. mutation + receipt + outbox are atomic.
68. lost response after commit is reconciled, not replayed as a second semantic action.
69. only classified transient failures are retried with bounded behavior and stable semantic identity.
70. synthetic fixtures cannot be labeled real learner effectiveness/retention evidence.
71. changed S06 executable bytes require fresh exact-subject qualification; historical PASS does not transfer.
72. cumulative regression preserves S01-S05 owner fences, current 112-interface route constitution, and lossless historical 110/110/26 trace with no Book/Documents/Programming semantic import.

## 10. Build gate and successor

S06 executable BUILD is **BLOCKED_EXACT_IMPLEMENTATION_LINEAGE_NOT_MATERIALIZED**, the same reconstruction source-custody boundary currently blocking S02-S05 executable work. Historical aggregate portable evidence is not a substitute for fresh exact-subject qualification after owner-corrected implementation changes.

Blocked executable successor:

`LRN-OWNERSHIP-FREEZE-001B-R3B-S06-R2 — EXACT IMPLEMENTATION-LINEAGE MATERIALIZATION -> BIND I016-L/I017/I018/I026/I030/I040/I042/I054/I055/I104 + CURRICULUM I016-C PORT + SHARED I105 ASSURANCE DEPENDENCY -> 72-CASE ISOLATED QUALIFICATION -> CUMULATIVE OWNERSHIP/ROUTE REGRESSION`

No participant consent, real learner response, mastery, retention, transfer, psychometric validity, instructional effectiveness, SME approval, certification/accreditation, native, A-01 or production standing is claimed by this design lock.
