# LRN-OWNERSHIP-FREEZE-001B-R3B-S04 — Assessment Attempt / Assessment Observation Design Lock

Status: **FORENSIC CENSUS + TARGETED RESEARCH + OWNER ADJUDICATION COMPLETE / ATTEMPT LIFECYCLE DESIGN LOCKED / SCORE-COMMIT INGRESS RESIDUAL BLOCKS BUILD**  
Owner lane: `SYSTEM_MASTER/LEARNING`  
Date: `2026-09-12`

## 1. Controlling authority

This unit continues the user-authorized Learning ownership reconstruction. It does not resume the stale Batch-07 execution plan.

Live canonical Learning control was re-read as:

`learning/control-v1@e3196089f77dde376944a08eac78a697e57d1535`

The current ownership constitution remains the active atomic model descended from the historical 110 P0 / 110 interface / 26 semantic-object corpus. Curriculum remains internal to the Learning peer system where it owns program/instruction truth, but learner-state and curriculum-definition writers remain separate.

## 2. RECOVER / INVENTORY

Repository-native qualification recovered the exact 112-row current interface ledger at decoded SHA-256:

`4f4387956bd8189b7a65f5de94ab3c722cb34f249ebe8a94ad74b4c0d0c3cbc0`

A broad assessment-related census recovered 56 candidate rows for adjudication. A second exact-name binding then resolved 20 relevant semantic/shared rows. `InvalidState` and `ValidationError` appear in command failure semantics but do **not** exist as separate named rows in the current 112-row CQEE ledger; S04 therefore does not invent new interface IDs for them.

### 2.1 Learning-owned primary assessment interfaces

Commands:

- `I012 StartAssessmentAttempt`
- `I013 SaveAssessmentResponse`
- `I014 SubmitAssessmentAttempt`
- `I015 InvalidateAssessmentAttempt`
- `I065 RecordItemExposure`

Queries:

- `I028 GetAssessmentAttempt`
- `I092-L GetAssessmentAttemptOfflineEligibility`

Events:

- `I037 AssessmentSubmitted`
- `I038 AssessmentScored`

Learning-owned typed errors:

- `I047 OfflineNotAllowedForAssessmentMode`
- `I048 AssessmentIntegrityUnknown`
- `I054 OverrideNotPermitted`
- `I100 IntegrityPolicyViolation`
- `I102 UnsupportedAssessmentStakes`

### 2.2 Curriculum-owned dependencies that S04 may consume but never write

- `I091 GetAssessmentBlueprint` — immutable versioned assessment blueprint query
- `I049 AccessibilityAlternativeMissing` — Curriculum-owned failure when required accessible alternative is unavailable
- `I099 ItemExposureTooHigh` — Curriculum-owned item-selection/exposure-policy failure

Curriculum retains canonical write authority for `LRN-E009 AssessmentBlueprint` and `LRN-E010 AssessmentItemFamily`. S04 cannot create, mutate, retire, re-score, or reinterpret those definition objects.

### 2.3 Shared/Core dependency errors

Existing frozen shared contracts remain dependencies, including:

- `I045 VersionConflict`
- `I046 DuplicateOperationConflict`
- `I052 DependencyUnavailable`

Shared/Core services may carry identity, authorization, persistence, jobs, transport, reconciliation, evidence/provenance and policy facts. They do not become writers of `AssessmentAttempt`.

## 3. TARGETED RESEARCH disposition

Research was limited to the design question that could materially change S04: whether assessment content/definition, result transport and learner attempt state should be collapsed into one record/authority.

Current 1EdTech QTI material confirms that QTI 3 separately standardizes interoperable assessment item/test content and results exchange across authoring tools, item banks, delivery systems, learning platforms and scoring/analytics engines. QTI 3 also treats accessibility/accommodation support as a first-class assessment delivery concern.

Design consequence:

1. external QTI-like content/result serialization is an interoperability projection, not canonical Learning authority;
2. Curriculum definition identity/version remains distinct from learner attempt/result state;
3. accommodation/accessibility standing must be pinned/checked at attempt start and cannot be reconstructed after the fact from presentation metadata;
4. standards conformance/interoperability does not establish psychometric validity, learner mastery or certification equivalence.

Research did **not** justify importing QTI as a required runtime dependency or changing the frozen 112-interface denominator.

## 4. Owner adjudication

### 4.1 Canonical semantic writer

`LRN-E011 AssessmentAttempt` is Learning-owned and is the only canonical semantic family S04 may mutate.

Assessment responses, submission standing, score/result segments, integrity standing and item-exposure observations needed for an attempt are represented as versioned/append-oriented state **within or subordinate to the AssessmentAttempt family**. S04 must not create a new hidden canonical `AssessmentScore`, `AssessmentResponse`, `ItemExposure`, `AssessmentSession`, or generic job semantic object merely to simplify implementation.

### 4.2 Curriculum references

Every attempt must pin the exact Curriculum definition context needed to interpret it, including at minimum:

- assessment/blueprint identity;
- immutable blueprint version/revision;
- item/item-family identity and version where an item is presented;
- criterion/skill references required by the frozen blueprint;
- mode/stakes definition;
- accommodation/accessibility references admitted by current contracts.

A later Curriculum update cannot silently reinterpret an already-created AssessmentAttempt.

### 4.3 Attempt lifecycle

The implementation must recover the exact pre-existing state enumeration before code is written. S04 freezes only transitions evidenced by the exact interfaces:

- `StartAssessmentAttempt` creates a pinned attempt that is eligible for response recording under the current mode;
- `SaveAssessmentResponse` is allowed only while the attempt is in the exact writable in-progress standing;
- `SubmitAssessmentAttempt` performs one atomic transition to `SUBMITTED` and creates at most one scoring request/outbox consequence;
- a finalized score may advance the attempt's scored/result standing only through an owner-valid score commit;
- `InvalidateAssessmentAttempt` preserves the historical attempt and marks invalidation explicitly rather than deleting or rewriting history;
- integrity policy may suspend/invalidate/restart only under exact policy/version authority and with durable reason evidence.

No additional state label is invented by this lock.

### 4.4 Response history

Response persistence rules:

1. the attempt and pinned item version must already exist;
2. response mutation uses stable semantic operation identity;
3. expected-version/CAS rules apply where required by `I013`;
4. same operation ID + same semantic payload replays the same result;
5. same operation ID + different payload fails deterministically;
6. transport duplication never creates a second semantic response mutation;
7. historical submitted/scored content cannot be silently edited as if still in progress;
8. any correction after a permitted correction boundary must preserve prior lineage and exact policy authorization rather than destructive rewrite.

### 4.5 Submit and outbox atomicity

`I014 SubmitAssessmentAttempt` and `I037 AssessmentSubmitted` freeze this atomic semantic unit:

`AssessmentAttempt version -> operation/idempotency receipt -> AssessmentSubmitted outbox event`

The event is emitted only after the owner mutation is durably committed. Delivery may be at-least-once; event identity is stable; consumers deduplicate. A lost response after commit must rediscover/reconcile the existing submission rather than submit or score twice.

### 4.6 Scoring authority

`I038 AssessmentScored` proves a Learning-owned scored fact exists only **after score commit** and carries criterion results plus scorer/model versions and uncertainty. It may trigger downstream mastery reprojection, but it does not itself assert mastery.

The current exact 112-interface ledger does **not** expose a separately named inbound CQEE command that explains how an external or asynchronous scorer result becomes the authoritative score commit that precedes `I038`.

Therefore S04 freezes a fail-closed residual:

**SCORE-COMMIT INGRESS RESIDUAL** — before BUILD, recover from admitted implementation/provenance whether scoring is:

- an internal Learning owner-local function behind the existing submitted-attempt orchestration;
- an existing non-CQEE adapter/port whose result is validated and committed by Learning;
- or a genuinely missing semantic interface requiring later explicit current-authority adjudication.

S04 may not invent a new semantic command or let a generic job/provider callback directly mutate `AssessmentAttempt`.

### 4.7 Item exposure

`I065 RecordItemExposure` is Learning-owned observation of actual exposure. It may update a subordinate/derived exposure projection associated with attempt/practice history; it does not create a new canonical semantic object family.

`I099 ItemExposureTooHigh` remains Curriculum-owned because item-pool selection/exposure policy belongs to Curriculum definition/planning truth. Learning records what happened; Curriculum owns whether a future item is eligible under its policy.

### 4.8 Offline/integrity/accessibility

- `I092-L` is the only current Learning query for assessment offline eligibility; it returns `ALLOWED / DENIED / UNKNOWN` bound to as-of/version/integrity context.
- connectivity alone can never imply offline eligibility;
- `UNKNOWN` cannot be coerced to `ALLOWED`;
- `I047` preserves a local draft only where policy explicitly permits and never labels it submitted;
- `I048` treats unestablished integrity as unknown/invalid per policy rather than PASS;
- `I100` applies mode-specific integrity policy with exact policy version;
- `I102` blocks stakes outside validated product scope before attempt creation;
- `I049` is Curriculum-owned; Learning cannot synthesize a missing accessible alternative or silently downgrade the requirement.

## 5. Evidence / mastery / psychometric fences

Assessment activity is evidence input, not automatic educational truth.

S04 freezes these separations:

- a submitted attempt is not mastery;
- a score is not mastery;
- repeated high scores are not delayed retention unless the retention design actually observes the required interval/conditions;
- performance on the same or equivalent task is not automatically novel transfer;
- a scorer/model confidence value is not psychometric validity;
- QTI or other interoperability conformance is not psychometric validation;
- accessibility accommodation use does not by itself invalidate evidence and must be interpreted according to the admitted blueprint/policy;
- an invalidated attempt cannot silently contribute as valid evidence;
- evidence admission and mastery projection must remain downstream owner-valid decisions with provenance and policy bindings;
- certification/accreditation standing requires its own authority and cannot be inferred from Learning runtime qualification.

## 6. Durable state / contract trace

For every assessment attempt mutation the eventual implementation must trace:

`requirement/invariant -> I012/I013/I014/I015/I065 or internal owner operation -> AssessmentAttempt durable version/subrecord -> Learning command/query/event/error contract -> isolated tests -> cumulative tests -> exact subject evidence -> environment -> blocker`

Minimum persisted authority data includes:

- attempt identity;
- learner/principal reference permitted by privacy policy, never copied person identity truth;
- exact blueprint/version reference;
- mode/stakes and admitted accommodation/accessibility references;
- attempt version and current exact lifecycle standing;
- response/submission history with stable operation identities;
- item/item-family/version references for exposed/responded items;
- integrity standing + exact policy/version/reason references where relevant;
- score/result segment only after owner-valid commit, including scorer/model/rubric versions and uncertainty where applicable;
- invalidation/supersession lineage;
- originating operation receipts;
- stable outbox event identities;
- evidence/provenance references without copying external canonical evidence truth.

## 7. Frozen S04 pre-build test denominator — 72 cases

These are obligations, not PASS claims.

### A. Ownership / definition boundary — S04-T01..T12

1. Learning can create only `AssessmentAttempt`, not `AssessmentBlueprint`.
2. Learning cannot mutate `AssessmentItemFamily`.
3. Curriculum cannot mutate learner `AssessmentAttempt`.
4. Core persistence cannot perform semantic attempt transitions.
5. stale/mismatched blueprint owner fails closed.
6. stale/mismatched blueprint version fails closed.
7. attempt pins exact blueprint version.
8. presented item pins exact item/item-family version where required.
9. Curriculum update does not reinterpret an existing attempt.
10. `I049` remains Curriculum-owned dependency error.
11. `I099` remains Curriculum-owned dependency error.
12. no Book/Documents/Programming semantic import appears in S04 state or routes.

### B. Attempt lifecycle / responses — S04-T13..T28

13. first valid start creates exactly one pinned attempt.
14. duplicate same start operation returns same attempt.
15. conflicting duplicate start fails deterministically.
16. unsupported stakes create no attempt.
17. missing required accessibility alternative creates no attempt.
18. dependency unavailable at required precondition fails closed.
19. valid response save advances exact attempt version once.
20. stale response expected-version fails with typed version conflict.
21. same response operation/same payload replays without duplicate mutation.
22. same response operation/different payload conflicts.
23. response for unpinned item/version is rejected.
24. response after non-writable lifecycle standing is rejected.
25. response history survives restart.
26. submitted response content is not destructively rewritten.
27. authorized invalidation retains complete historical attempt.
28. unauthorized invalidation fails closed.

### C. Submit / idempotency / concurrency / recovery — S04-T29..T42

29. submit transition is atomic compare-and-set.
30. same submit op/same payload returns same result.
31. same submit op/different payload conflicts.
32. concurrent submits yield one semantic winner.
33. submit + operation receipt + outbox event commit atomically.
34. failure before commit leaves no partial submission/outbox.
35. failure after commit but before response reconciles the committed submission.
36. duplicate `AssessmentSubmitted` delivery is harmless.
37. lost wakeup is recovered by durable outbox rediscovery.
38. retry of classified transient failure uses same semantic operation identity.
39. semantic/permanent failure is not transient-retried.
40. bounded retry exhaustion preserves deterministic evidence.
41. stacked retries cannot mint a second submit/scoring request.
42. restart reconstructs current attempt + outstanding outbox deterministically.

### D. Score / evidence boundary — S04-T43..T54

43. no `AssessmentScored` event may exist without a preceding owner-valid score commit.
44. generic job/provider callback cannot directly mutate AssessmentAttempt score state.
45. score commit binds exact attempt/submission version.
46. score commit binds criterion result source/version.
47. scorer/model/rubric version is retained where applicable.
48. uncertainty is retained where applicable rather than discarded.
49. invalidated attempt score cannot silently contribute as valid evidence.
50. superseded/revised scoring retains lineage rather than destructive overwrite.
51. `AssessmentScored` alone does not set mastery.
52. high score alone does not assert delayed retention.
53. same-task score alone does not assert novel transfer.
54. score/model confidence alone does not assert psychometric validity.

### E. Integrity / offline / exposure / accessibility — S04-T55..T66

55. offline eligibility `UNKNOWN` is not treated as `ALLOWED`.
56. offline-denied mode cannot submit as if online-authoritative.
57. permitted local draft is distinguishable from submitted canonical state.
58. integrity unknown is not treated as integrity PASS.
59. integrity-policy violation binds exact policy version/reason.
60. unsupported stakes fail before attempt creation.
61. required accommodation/accessibility reference is pinned at start.
62. missing required alternative cannot be silently ignored.
63. item exposure operation is idempotent.
64. exposure observation cannot mutate Curriculum item definition.
65. item exposure alone is not mastery evidence.
66. Curriculum exposure-policy rejection is respected without Learning overriding policy.

### F. Claim / privacy / cumulative discipline — S04-T67..T72

67. raw chat/webhook/transport metadata cannot become attempt semantic authority.
68. sensitive provider/person metadata is minimized and stored only by reference where contract permits.
69. synthetic fixtures are never labeled real participant evidence.
70. qualification output denies mastery/retention/transfer/psychometric/SME/certification claims unless separately observed.
71. current ownership cumulative regression proves S01/S02/S03 boundaries remain intact and historical 110/110/26 lineage remains losslessly represented by the active atomic model.
72. changed S04 bytes require fresh exact-subject evidence; no historical PASS transfer.

## 8. Build gate

S04 runtime BUILD is **NOT AUTHORIZED YET**.

Two prerequisites remain:

1. resolve the SCORE-COMMIT INGRESS RESIDUAL without inventing an interface or transferring foreign authority;
2. materialize the exact implementation predecessor lineage required by the current reconstruction program.

The second prerequisite is the same repository/source-custody blocker currently holding S02/S03 executable work. If that blocker remains, independent non-overlapping Learning forensic/design work may continue.

## 9. Exact successor

`LRN-OWNERSHIP-FREEZE-001B-R3B-S04-R3 — SCORE-COMMIT INGRESS FORENSIC RECOVERY / IMPLEMENTATION-PROVENANCE CENSUS -> OWNER/PORT ADJUDICATION -> S04 BUILD-READINESS CLOSURE`

If exact scoring-ingress implementation provenance cannot be recovered, preserve that blocker and move to the next independent owner-local semantic slice rather than inventing a callback/command.

## 10. Evidence explicitly not claimed

No participant consent, real participant response, mastery, retention, transfer, psychometric validity, instructional effectiveness, SME approval, certification/accreditation, live PostgreSQL execution, external-provider standing, native iPhone execution, A-01 execution or production execution is claimed by S04.
