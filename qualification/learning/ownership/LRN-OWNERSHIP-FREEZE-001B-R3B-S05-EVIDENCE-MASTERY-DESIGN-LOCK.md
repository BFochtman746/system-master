# LRN-OWNERSHIP-FREEZE-001B-R3B-S05 — Evidence Admission + Mastery Projection Design Lock

Status: **RECOVER / INVENTORY / TARGETED RESEARCH / OWNER ADJUDICATION / DESIGN LOCK COMPLETE — EXECUTABLE BUILD BLOCKED ON EXACT IMPLEMENTATION-LINEAGE MATERIALIZATION**  
Owner lane: `SYSTEM_MASTER/LEARNING`  
Date: `2026-09-12`

## 1. Controlling authority and scope

S05 continues the user-authorized Learning ownership reconstruction. It does not resume the stale Batch-07 plan and does not broaden Learning into Core evidence storage, Book, Documents, Programming, identity, generic jobs, transport, qualification, certification or external provider authority.

The active reconstruction constitution remains controlling:

- historical `110 P0 / 110 interfaces / 26 semantic objects` is preserved losslessly through explicit owner rebinding/splitting rather than hidden deletion;
- the current recovered CQEE denominator remains `112` exact interfaces;
- `MOD-LEARNING-001` owns learner-state/mastery/adaptation semantics;
- `MOD-CURRICULUM-001` owns curriculum/program/assessment-definition semantics;
- shared/Core services provide typed dependency facts/capabilities and never become Learning semantic writers;
- Learning stores external evidence/provenance by reference and owner-valid admission decision, not by silently becoming generic evidence authority.

S05 is bounded to these Learning semantic object families:

- `LRN-E012 MasteryEvidenceProfile`
- `LRN-E013 MasteryGateSet`
- `LRN-E014 MasteryStandard`
- `LRN-E015 MasteryProjection`
- `LRN-E016 MasteryExplanationSnapshot`

It consumes exact references to other owner-valid Learning/Curriculum facts such as `PracticeAttempt`, `AssessmentAttempt`, `SkillDefinition`, `Criterion`, and current policy/context versions, but does not mutate those families through S05.

## 2. Exact interface inventory

Repository-native exact binding against the current 112-row ledger recovered **18/18** S05 interfaces with no missing names and independently verified the decoded ledger SHA-256:

`4f4387956bd8189b7a65f5de94ab3c722cb34f249ebe8a94ad74b4c0d0c3cbc0`

### 2.1 Commands

- `I056 SelectMasteryEvidenceProfile`
- `I057 RecordExternalEvidenceCandidate`
- `I058 AdmitExternalEvidenceCandidate`
- `I059 RejectExternalEvidenceCandidate`
- `I060 RequestMasteryReprojection`
- `I061 ChallengeMasteryProjection`

### 2.2 Queries

- `I024 GetSkillMastery`
- `I025 ExplainMastery`
- `I088 GetMasteryEvidenceMatrix`

### 2.3 Events

- `I039 MasteryProjectionUpdated`
- `I078 MasteryGateSatisfied`
- `I079 MasteryGateLost`
- `I080 EvidenceBecameStale`

### 2.4 Typed errors

- `I044 InsufficientEvidence`
- `I051 ProjectionStale`
- `I095 EvidenceInadmissible`
- `I096 MasteryPolicyMismatch`
- `I103 ExternalEvidenceNeedsReview`

All 18 remain current owner-corrected semantic contracts. No interface is considered implemented merely because it is present in this design lock.

## 3. Targeted research disposition

Research was limited to questions capable of changing the design: whether score/evidence observations can be treated as mastery truth, whether validity is portable across intended uses, and how accommodations affect interpretation.

Current authoritative testing guidance and evidence-centered-design literature reinforce four design constraints already present in the Learning corpus:

1. assessment evidence supports an interpretation/claim; it is not the claim itself;
2. validity is tied to the proposed interpretation and intended use, not a permanent property of a raw score;
3. consequential/high-stakes interpretations require sufficient relevant evidence rather than automatic promotion from one observation;
4. accommodations/accessibility conditions must remain visible to interpretation because they may or may not affect the construct being interpreted.

Design consequence: S05 keeps evidence observations, admissibility, gate evaluation, mastery interpretation, external qualification, and certification as separate authority steps. No external psychometric standard is imported as a runtime dependency and the 112-interface denominator is unchanged.

## 4. Ownership adjudication

### 4.1 External evidence authority

Learning does **not** own canonical external evidence bytes, artifact bytes, external credential truth, scorer-provider truth, person identity truth or generic provenance infrastructure.

`I057` therefore records a Learning-owned **candidate reference + intended use + provenance references + stable candidate identity**. It does not copy or canonize the foreign source.

An evidence candidate is subordinate Learning admission state/decision history associated with the S05 semantic families; it does **not** create a 29th canonical semantic object family.

### 4.2 Evidence admission authority

Learning owns the domain decision whether a referenced observation/evidence item is admissible for a particular Learning projection under an exact current Learning policy/profile/criterion context.

`I058 AdmitExternalEvidenceCandidate` must bind at minimum:

- stable candidate identity and candidate version;
- exact skill/criterion references and versions;
- exact external evidence/provenance references and immutable subject/digest where available through shared contracts;
- intended use;
- exact `decision_policy_version`;
- criterion mappings;
- admissibility conditions, including assistance/accommodation/context conditions where relevant;
- source freshness/validity standing if required by the selected profile;
- authorization/privacy decision references where required;
- operation/idempotency identity;
- durable decision reason/evidence references.

Admission means only "eligible input for the bound Learning projection under these conditions." It does not mean source truth, mastery, retention, transfer, psychometric validity, qualification or certification.

`I059 RejectExternalEvidenceCandidate` preserves the candidate/source references and durable rejection reasons. Rejection never deletes or rewrites external source evidence.

### 4.3 Learning-generated observations

Practice and assessment observations enter S05 only through owner-valid committed Learning state/events. S05 may interpret exact committed `PracticeAttempt` / `AssessmentAttempt` references and conditions. It may not derive mastery directly from chat text, UX state, transport metadata, mutable webhook/provider labels, a generic job result, or an uncommitted score callback.

### 4.4 Curriculum boundary

Curriculum owns `SkillDefinition` and `Criterion` truth. S05 pins exact Curriculum skill/criterion versions as interpretation inputs but cannot rewrite them.

`I056 SelectMasteryEvidenceProfile` creates/updates a Learning-owned versioned association/profile for an exact Curriculum skill version. "Binds evidence profile to new skill version" means a Learning-side interpretation binding; it is **not** permission to mutate the Curriculum `SkillDefinition`.

If the referenced skill/criterion version is stale, unknown, superseded incompatibly, or otherwise not admissible for the requested projection, S05 fails closed or produces an explicit stale/insufficient standing.

## 5. Mastery policy / profile / gate design

### 5.1 Versioned policy identity

`MasteryEvidenceProfile`, `MasteryGateSet`, and `MasteryStandard` are immutable/versioned Learning policy/interpretation inputs. Every projection must bind exact versions/digests sufficient to reproduce the interpretation.

No hidden migration is allowed. If a policy/profile/standard changes, existing projections retain their original policy lineage and a new reprojection produces a successor.

### 5.2 No universal mastery threshold

S05 explicitly rejects a single universal percentage/cutoff as mastery truth. The selected profile/standard defines the applicable criteria, gates, evidence kinds, freshness/retention conditions, assistance/accommodation interpretation, uncertainty/coverage requirements, and any transfer conditions appropriate to the skill/use.

If no valid evidence profile exists for a skill/version, the result is `NOT_ASSESSED` / configuration-required or the exact current typed insufficient/configuration standing — never an invented numeric mastery value.

### 5.3 Gate semantics

Every required gate is represented explicitly with at least:

- gate identity/type;
- criterion/skill references;
- exact profile/standard/policy version;
- satisfied / unsatisfied / unknown or other exact state permitted by the recovered model;
- contributing admitted evidence references;
- freshness/recency/conditions;
- uncertainty/coverage information where applicable;
- reason codes;
- as-of/version identity.

A missing required gate cannot be silently omitted from an aggregate score.

`I078 MasteryGateSatisfied` and `I079 MasteryGateLost` are local Learning interpretation events only. Neither is an external qualification/certification fact.

## 6. Projection model

### 6.1 MasteryProjection is interpretation, not source evidence

`LRN-E015 MasteryProjection` is a versioned Learning interpretation over exact inputs. It must be reproducible from:

- exact skill/criterion versions;
- exact mastery profile/gate/standard/policy versions;
- admitted Learning/external evidence references and their conditions;
- freshness and invalidation standing;
- applicable assistance/accommodation context;
- model/algorithm version if any;
- uncertainty/coverage calculations;
- prior projection lineage where relevant.

It never rewrites source evidence.

### 6.2 Reprojection

`I060 RequestMasteryReprojection` is semantically idempotent and uses version-pinned inputs. A reprojection may be triggered by evidence admission/rejection, assessment score finalization, stale evidence, policy/profile change, curriculum version impact, invalidation/supersession, or a resolved challenge.

The eventual implementation must:

1. read current owner-valid inputs;
2. establish a stable projection-input digest;
3. reject incompatible policy versions as `I096 MasteryPolicyMismatch`;
4. fail or return explicit insufficient/unknown standing when required evidence/dependencies are unavailable;
5. compute deterministically for identical admitted input + policy versions;
6. commit the new projection/snapshot as an immutable successor;
7. atomically create operation receipt + applicable `I039/I078/I079` outbox events;
8. reconcile lost responses by operation/projection-input identity instead of computing a duplicate semantic successor.

Batch/long reprojection may use Core Durable Execution Runtime, but generic job state never becomes mastery authority.

### 6.3 Projection state machine

The recovered mastery state family includes, as applicable:

`NOT_ASSESSED`, `BUILDING`, `DEMONSTRATED`, `RETENTION_DUE`, `RETAINED`, `TRANSFER_DEMONSTRATED`, `MASTERED`, `REVALIDATION_DUE`, `INSUFFICIENT_EVIDENCE`.

This design lock does not invent additional states. Every transition must be justified by the exact active profile/gates and admitted evidence. A high score or high model confidence cannot skip required states/gates.

### 6.4 Staleness and contradiction

`I080 EvidenceBecameStale` marks a freshness/policy condition and triggers reprojection/maintenance; it never deletes historical evidence.

Contradictory evidence remains visible. A projection/explanation must identify affected gates and the rule/uncertainty used to reconcile or require more evidence. Silent averaging that erases material contradiction is prohibited.

## 7. Explanation and challenge

`I024`, `I025`, and `I088` are read-only, version/as-of bound projections.

- `GetSkillMastery` returns versioned projection + uncertainty/coverage and never a qualification decision.
- `ExplainMastery` returns contributing evidence refs, recency, conditions, model/policy version, uncertainty and gaps.
- `GetMasteryEvidenceMatrix` exposes criterion/gate/evidence/admissibility/freshness/coverage structure rather than only a single percentage.

`I061 ChallengeMasteryProjection` creates a durable reviewable challenge against an immutable projection. It cannot directly edit source evidence or mutate the challenged projection. Resolution produces explicit decision evidence and, if warranted, a new reprojection/successor.

## 8. Assessment / AI / psychometric fences

S05 freezes these hard separations:

- assessment submission is not mastery;
- assessment score is not mastery;
- practice correctness is not mastery;
- learner confidence is not competence;
- repeated same-task success is not automatically novel transfer;
- time elapsed alone is not retention evidence;
- model probability/confidence is not authoritative mastery;
- AI scoring is not mastery-admissible merely because it correlates with a human score;
- AI detector output is not sole misconduct/evidence-invalidation authority;
- standards/interoperability conformance is not psychometric validity;
- psychometric validity for one intended interpretation/use is not automatically valid for another;
- accommodation use does not automatically invalidate evidence, and absence of required accommodation cannot be silently ignored;
- no mastery projection is a certification/accreditation/eligibility decision;
- external qualification/export requires its own owner-valid authorization and evidence package contracts.

## 9. Durable state / transaction / recovery lock

Every S05 mutation must preserve:

`requirement/invariant -> exact interface/internal owner operation -> S05 semantic object/subordinate admission state -> persistence/operation receipt/outbox -> test -> evidence -> environment -> blocker`

Minimum transaction rules:

1. first valid semantic operation commits once;
2. same operation ID + same semantic payload replays the same result;
3. same operation ID + different semantic payload fails deterministically;
4. expected-version/CAS applies where the exact interface requires it;
5. immutable projections/policy versions are superseded, not overwritten;
6. owner mutation + operation receipt + owner outbox commit atomically;
7. duplicate event delivery is expected and consumers deduplicate by stable event identity;
8. restart reconstructs from durable owner state, not process memory;
9. read-after-write freshness across external/shared projections is never assumed;
10. retries apply only to classified transient dependency failures with bounded behavior and the same semantic operation identity;
11. stacked independent retry layers may not create duplicate candidate admission, reprojection or events;
12. unknown dependency/policy/freshness state remains explicit and cannot become PASS/mastery by fallback.

## 10. Frozen S05 pre-build denominator — 84 cases

These are obligations, not PASS claims.

### A. Ownership / semantic-family boundary — S05-T01..T12

1. only Learning can write the five S05 semantic families.
2. S05 cannot mutate Curriculum SkillDefinition.
3. S05 cannot mutate Curriculum Criterion.
4. Core persistence cannot decide evidence admissibility or mastery state.
5. external evidence bytes remain external authority/reference only.
6. external credential/qualification truth is not copied as Learning authority.
7. generic job state cannot write mastery.
8. Book semantics cannot enter S05 canonical state.
9. Documents semantics cannot enter S05 canonical state.
10. Programming semantics cannot enter S05 canonical state.
11. candidate/admission history does not create a new hidden canonical semantic object family.
12. no legacy compound/superseded owner can write current S05 state.

### B. Evidence candidate / admission lifecycle — S05-T13..T26

13. first valid external candidate records once with stable identity.
14. same candidate operation + same payload replays.
15. same operation identity + different payload conflicts.
16. candidate without provenance/intended use fails closed when required.
17. candidate creation causes no mastery change.
18. admission binds exact decision policy version.
19. admission binds criterion mappings/conditions.
20. admission retains external evidence references rather than copying source authority.
21. inadmissible evidence returns typed `I095` and causes no mastery update.
22. review-required evidence returns `I103`/review standing rather than silent admit/reject.
23. rejection preserves source/candidate history and reason codes.
24. stale candidate version cannot be admitted/rejected over a newer decision.
25. unauthorized/private evidence cannot become admissible merely because a reference exists.
26. duplicate/retried admission cannot produce duplicate semantic decisions/events.

### C. Profile / standard / gate binding — S05-T27..T38

27. evidence profile is bound on Learning side to exact Curriculum skill version.
28. selecting profile cannot mutate Curriculum skill definition.
29. stale skill version fails/requires explicit successor handling.
30. missing profile yields NOT_ASSESSED/configuration-required, not numeric mastery.
31. profile version is immutable after use in a projection.
32. standard version is immutable after use in a projection.
33. gate-set version is immutable after use in a projection.
34. policy/profile update creates successor interpretation lineage.
35. every required gate is represented explicitly.
36. missing required gate cannot be averaged away.
37. gate satisfaction carries contributing admitted evidence references.
38. gate event does not imply external qualification.

### D. Reprojection / concurrency / restart — S05-T39..T52

39. identical admitted inputs + exact policy versions produce deterministic projection result.
40. reprojection binds stable input digest/version set.
41. stale expected/versioned input cannot overwrite newer projection.
42. incompatible policy version returns `I096` rather than silent migration.
43. same reprojection operation + same payload replays one successor.
44. same reprojection operation + different payload conflicts.
45. concurrent equivalent reprojections converge on one semantic successor.
46. owner mutation + op receipt + I039/outbox commit atomically.
47. applicable I078/I079 events are atomically coupled to projection commit.
48. failure before commit leaves no partial successor/event.
49. lost response after commit rediscovers committed projection.
50. restart reconstructs current projection lineage deterministically.
51. generic-job retry plus owner retry cannot duplicate projection.
52. permanent semantic/policy failure is not retried as transient.

### E. Staleness / contradiction / uncertainty / explanation — S05-T53..T64

53. stale evidence creates explicit stale standing/event, not deletion.
54. staleness can remove a gate and cause revalidation/remediation without erasing history.
55. contradictory evidence remains visible in explanation.
56. contradiction identifies affected gates/reason/rule or requires more evidence.
57. sparse evidence yields low/insufficient coverage even when observed responses are all correct.
58. uncertainty is retained and surfaced.
59. GetSkillMastery is version/as-of bound.
60. ExplainMastery exposes contributing refs/conditions/versions/gaps.
61. evidence matrix exposes criteria/gates/admissibility/freshness/coverage.
62. challenge creates review state without mutating challenged projection.
63. challenge resolution that changes interpretation creates a successor projection.
64. projection stale is typed (`I051`) and never silently refreshed from unknown inputs.

### F. Mastery / retention / transfer / validity claim fences — S05-T65..T76

65. assessment submitted != mastery.
66. assessment scored != mastery.
67. practice correct != mastery.
68. learner confidence != competence.
69. one high score cannot bypass required gates.
70. repeated same-task success cannot automatically assert novel transfer.
71. passage of time alone cannot assert retention.
72. model confidence/probability cannot assert authoritative mastery.
73. AI scorer agreement alone cannot establish mastery admissibility/psychometric validity.
74. accommodation use is interpreted under exact policy/construct conditions, not auto-invalidated.
75. interoperability/conformance does not establish psychometric validity.
76. mastery projection cannot become certification/accreditation/eligibility decision.

### G. Privacy / security / cumulative discipline — S05-T77..T84

77. chat/webhook/transport metadata cannot become evidence/mastery semantic authority.
78. person/provider sensitive metadata is minimized and stored by reference when contract permits.
79. source/evidence digest/reference mismatch fails closed.
80. unknown shared dependency/policy/freshness standing remains UNKNOWN/BLOCKED, never PASS.
81. synthetic fixtures are never labeled real learner evidence/outcomes.
82. changed S05 executable bytes require fresh exact-subject qualification; no historical PASS transfer.
83. cumulative regression preserves S01/S02/S03/S04 owner fences and active 112-interface route constitution.
84. cumulative trace demonstrates the historical 110/110/26 corpus remains losslessly represented by the active owner-corrected constitution with no Book/Documents/Programming semantic import.

## 11. Build gate

S05 executable BUILD is **NOT AUTHORIZED YET** because the exact executable implementation predecessor lineage remains unavailable in repository-native build custody.

Required lineage remains bound to the admitted source and predecessor patch evidence already frozen by the reconstruction program. Audit/verification records are not replacement source bytes and no regenerated approximation is authorized.

When exact implementation custody is established, S05 build must bind the 18 exact interfaces above to the existing owner-corrected persistence/route ports, implement only the five current S05 semantic families plus subordinate decision/receipt/outbox state, execute the frozen 84-case isolated denominator, then run cumulative ownership/route regression before any S05 freeze.

## 12. Dependency-valid continuation

Blocked executable successor:

`LRN-OWNERSHIP-FREEZE-001B-R3B-S05-R2 — EXACT IMPLEMENTATION-LINEAGE MATERIALIZATION -> BIND 18 EXACT S05 CQEE CONTRACTS + EVIDENCE ADMISSION / MASTERY POLICY / PROJECTION / EXPLANATION STATE -> 84-CASE ISOLATED QUALIFICATION -> CUMULATIVE OWNERSHIP/ROUTE REGRESSION`

If exact source custody remains unavailable, continue only independent owner-local forensic/design work on the next non-overlapping Learning slice. Do not manufacture consent, participant response, mastery, retention, transfer, psychometric validity, SME approval, certification, native, A-01 or production evidence.
