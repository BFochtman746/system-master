# LRN-OWNERSHIP-FREEZE-001B-R3B-S07 — Self-Confidence Observation Design Lock

Status: **RECOVER / INVENTORY / OWNER ADJUDICATION / DESIGN LOCK COMPLETE — EXECUTABLE BUILD BLOCKED ON EXACT IMPLEMENTATION-LINEAGE MATERIALIZATION**  
Owner lane: `SYSTEM_MASTER/LEARNING`  
Date: `2026-09-12`

## 1. Scope and authority

S07 continues the current Learning ownership reconstruction and is intentionally narrow. It owns only the learner self-report observation boundary represented by:

- requirement `LRN-028 Self-confidence metric`;
- semantic object `LRN-E017 SelfConfidenceObservation`;
- command `I011 SubmitSelfConfidence`;
- implementing component `LearnerSelfAssessmentService`.

The current requirement acceptance boundary is explicit: **confidence alone cannot raise mastery past evidence policy**. Current forensic evidence also records that this requirement has no direct portable implementation evidence mapped at the prior 001D stage and that the exact production handler is still pending.

S07 does not own Curriculum definition truth, assessment scoring, mastery, evidence admissibility, psychometric validity, person identity, generic evidence storage, UI presentation state, Book, Documents, Programming, qualification/certification, or Core persistence/transport semantics.

## 2. Exact interface binding

Repository-native recovery against the current repaired 112-row CQEE ledger independently verified decoded SHA-256:

`4f4387956bd8189b7a65f5de94ab3c722cb34f249ebe8a94ad74b4c0d0c3cbc0`

Exactly one S07 semantic command was recovered:

### `I011 SubmitSelfConfidence`

- canonical owner: `MOD-LEARNING-001`;
- caller: Practice/Lesson UX;
- precondition: skill/item context exists;
- payload: `context_ref, confidence_scale_value, operation_id`;
- semantic effect: records a self-report observation;
- idempotency: required;
- concurrency: append-only semantic observation;
- typed failure: `ValidationError`;
- normative note: **never equivalent to competence evidence**;
- implementation standing: `NOT_IMPLEMENTED_BY_001C`.

No new CQEE command, query, event, or error is introduced by S07.

## 3. Owner adjudication

### 3.1 Canonical state

`LRN-E017 SelfConfidenceObservation` is a Learning-owned append-only observation. Each accepted observation must preserve enough exact context to interpret what the learner reported without turning UX metadata into semantic authority.

Minimum semantic state for eventual implementation:

- stable observation identity;
- stable semantic operation identity;
- exact `context_ref` and the owner-valid context type/version it resolves to;
- exact learner/goal reference permitted by privacy policy, by reference rather than copied identity truth;
- exact skill/item/lesson/practice context references available from the resolved context;
- reported `confidence_scale_value`;
- scale/policy interpretation identity needed to make that value meaningful;
- observation time/as-of identity from an authoritative domain clock/operation context, not mutable chat/webhook metadata;
- assistance/mode context only where the exact referenced owner state makes it relevant;
- provenance/receipt references;
- supersession/correction linkage if a later explicit correction is supported.

The CQEE payload does not itself name a scale version. Therefore the implementation must resolve the applicable scale/policy from exact current Learning context or existing owner policy during command validation and persist the resolved interpretation identity. S07 does **not** expand the public interface merely to solve this implementation detail. If the exact implementation lineage proves that no stable scale/policy identity can be recovered, that becomes a design blocker requiring explicit current-authority adjudication rather than silent numeric interpretation.

### 3.2 Append-only semantics

Self-confidence is historical learner self-report. It is not mutable current truth that can be overwritten in place.

Rules:

1. first valid semantic operation creates exactly one observation;
2. same operation ID + same semantic payload replays the same observation/result;
3. same operation ID + different semantic payload fails deterministically;
4. later reports are new observations rather than updates to earlier observations;
5. an explicit correction, if supported by recovered implementation contracts, must preserve the prior observation and correction lineage rather than destructively rewrite history;
6. transport retry, UI retry, offline replay, or duplicate webhook/chat metadata cannot create a second semantic observation.

### 3.3 Context validity

A report is accepted only when `context_ref` resolves to an owner-valid current/historical context in which self-report is semantically meaningful. A free-form transport label, display string, mutable UI object, or unverified external reference is not a valid substitute.

If the referenced skill/item/lesson/practice context is absent, mismatched, unauthorized, or too stale for the intended interpretation, S07 fails validation or returns the exact existing dependency/version failure recovered during implementation reconciliation. It must not invent a skill/item binding from the learner text or interface metadata.

## 4. Hard interpretation fences

S07 freezes the following separations:

- confidence is not competence;
- confidence is not mastery;
- low confidence is not evidence of non-mastery by itself;
- high confidence is not evidence of mastery by itself;
- confidence change is not learning gain by itself;
- confidence calibration is not psychometric validity unless a separately authorized analysis actually establishes it for the intended use;
- confidence is not retention evidence;
- confidence is not transfer evidence;
- confidence is not certification/qualification/job eligibility;
- a self-report may be used as adaptation/explanation context only under an exact Learning policy that keeps competence evidence gates intact;
- an adaptive model may not let confidence bypass prerequisites, evidence admissibility, mastery gates, assessment integrity, or safety/policy constraints;
- absence of a self-confidence report is not zero confidence and cannot be silently imputed as an observed learner fact;
- synthetic fixtures used for tests are never real participant self-reports.

## 5. Downstream use

S07 may expose the observation by owner-local read/projection paths recovered from the current Learning architecture, but it does not add a new public query in this unit.

Permitted downstream uses include, when exact policy permits:

- explanation to the learner;
- adaptation as a non-dispositive contextual signal;
- identifying possible over/under-confidence for future practice/review recommendations;
- research/analytics only under the applicable authorization/privacy contract.

Prohibited direct effects include:

- setting `MasteryProjection` state;
- admitting competence evidence solely from the report;
- changing a Curriculum skill/criterion definition;
- finalizing an assessment score;
- issuing qualification/certification standing;
- external disclosure without the exact shared authorization/privacy decision required for that use.

## 6. Durability / idempotency / recovery

The eventual owner mutation must trace:

`LRN-028 -> I011 -> LearnerSelfAssessmentService -> LRN-E017 SelfConfidenceObservation -> LRN-PERSIST-PORT-001 -> operation receipt -> tests -> exact evidence -> environment -> blockers`.

Required transaction behavior:

- semantic payload digest includes the resolved owner-valid context and reported scale value, not volatile transport metadata;
- observation + operation/idempotency receipt commit atomically;
- if an owner outbox consequence is later recovered as required, it commits in the same owner transaction with stable event identity;
- restart rediscovery uses durable observation/receipt state, never process memory;
- a lost response after commit returns/reconciles the existing observation;
- retries apply only to classified transient dependency/transport failures with bounded behavior and the same semantic operation identity;
- permanent validation/semantic conflicts are not transient-retried;
- no stacked retry layer may duplicate the observation.

## 7. Privacy and minimization

Self-confidence is learner state and may be sensitive in context. S07 stores only the semantic data needed for the Learning purpose and references shared identity/authorization truth rather than copying it.

Raw chat text, full webhook payloads, provider metadata, device telemetry, unrelated person attributes, and external identity records are not part of canonical SelfConfidenceObservation unless a separately declared current contract explicitly requires a bounded field. External disclosure remains governed by the shared authorization/privacy boundary.

## 8. Frozen S07 pre-build denominator — 36 cases

These are obligations, not PASS claims.

### A. Ownership / interface / context — S07-T01..T10

1. only Learning can create SelfConfidenceObservation.
2. I011 resolves exactly to MOD-LEARNING-001.
3. no Book/Documents/Programming semantic field enters canonical observation state.
4. Core persistence cannot create semantic self-confidence observations directly.
5. valid exact context is required.
6. missing context fails validation.
7. mismatched context fails validation.
8. mutable UI/display metadata cannot substitute for context_ref authority.
9. applicable scale/policy interpretation identity is resolved and persisted.
10. unresolved scale/policy semantics fail closed rather than interpreting an arbitrary number.

### B. Append-only / idempotency / recovery — S07-T11..T20

11. first valid operation creates exactly one observation.
12. same operation/same payload replays the original result.
13. same operation/different payload conflicts deterministically.
14. a later confidence report creates a new observation.
15. historical observation is never overwritten by a later report.
16. supported correction preserves prior lineage.
17. failure before commit leaves no partial observation/receipt.
18. lost response after commit rediscovers the committed observation.
19. restart reconstructs observation history from durable state.
20. transport/offline duplicate cannot create a second semantic observation.

### C. Interpretation / mastery fences — S07-T21..T30

21. high confidence alone cannot raise mastery.
22. low confidence alone cannot lower mastery as evidence of incompetence.
23. confidence change alone cannot assert learning gain.
24. confidence alone cannot assert retention.
25. confidence alone cannot assert transfer.
26. confidence/model score cannot bypass an evidence gate.
27. absence of report remains missing/unknown, not observed zero confidence.
28. self-report cannot finalize assessment score.
29. self-report cannot issue qualification/certification/job eligibility.
30. synthetic fixture is never labeled real participant self-report.

### D. Privacy / cumulative discipline — S07-T31..T36

31. raw chat/webhook metadata cannot become semantic authority.
32. external disclosure requires exact shared authorization/privacy standing.
33. denied disclosure leaves Learning observation/history unchanged.
34. changed S07 executable bytes require fresh exact-subject qualification; historical PASS does not transfer.
35. cumulative regression preserves S01-S06 owner fences and the current 112-interface constitution.
36. cumulative trace preserves the historical 110/110/26 corpus losslessly through the active owner-corrected model with no foreign semantic import.

## 9. Build gate

S07 executable BUILD is **BLOCKED_EXACT_IMPLEMENTATION_LINEAGE_NOT_MATERIALIZED**.

The current reconstruction still requires the admitted exact production-binding source and exact predecessor patch lineage before owner-corrected runtime changes can be made and freshly qualified. Audit summaries, historical 575-test results, or reconstructed approximations cannot substitute for those exact bytes.

## 10. Dependency-valid successor

Blocked executable successor:

`LRN-OWNERSHIP-FREEZE-001B-R3B-S07-R2 — EXACT IMPLEMENTATION-LINEAGE MATERIALIZATION -> BIND I011 + LRN-E017 SELFCONFIDENCEOBSERVATION + OPERATION RECEIPT -> 36-CASE ISOLATED QUALIFICATION -> CUMULATIVE OWNERSHIP/ROUTE REGRESSION`

While the exact source lineage remains blocked, independent owner-local forensic/design work may proceed on the next non-overlapping Learning slice. No consent, real participant self-report, mastery, retention, transfer, psychometric validity, SME approval, certification, native, A-01, or production evidence is claimed by this design lock.
