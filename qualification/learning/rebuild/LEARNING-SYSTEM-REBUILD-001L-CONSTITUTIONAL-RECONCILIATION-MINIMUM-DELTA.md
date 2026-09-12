# LEARNING-SYSTEM-REBUILD-001L — Constitutional Reconciliation / Minimum Delta

Status: **CONSTITUTIONAL RECONCILIATION FROZEN / NO RUNTIME BUILD OR PASS CLAIMS YET**  
Date: 2026-09-12  
System: `SYSTEM_MASTER/LEARNING`  
Parent foundation: `LEARNING-SYSTEM-REBUILD-001K`  
Exact source: `learning/system-rebuild-001k-standards-interoperability-20260912@3ae0d12b55edcda8ca44c6fc0a5f4ab5b8ef7317`

## What this operation does

001L is the constitution-reconciliation step required by the frozen 001C rebuild plan.

The purpose is not to add another Learning feature. The purpose is to take every responsibility frozen in 001D through 001K and answer, exactly:

1. what already fits the existing Learning constitution and should be reused;
2. what existing object/interface needs a semantic extension rather than a replacement;
3. what genuinely cannot be represented losslessly and therefore needs a new constitutional row;
4. what remains outside Learning ownership;
5. what remains unresolved and fail-closed;
6. what exact runtime implementation order resumes after this freeze.

The governing rule is:

> **Reuse existing Learning/Curriculum authority first. Add a new requirement, interface or semantic object only when the frozen responsibility cannot be represented losslessly without creating ambiguity, hidden authority or a second writer.**

## Source constitution

Historical lineage remains immutable provenance:

- 110 P0 requirements;
- 110 interfaces;
- 26 semantic objects.

The admitted active baseline before this rebuild is:

- 116 active requirements;
- 112 active interfaces;
- 28 active semantic objects.

The 116-requirement count includes the later lossless atomic responsibility splits. 001L does not roll back to the older 113-requirement intermediate ledger.

## Reconciled active constitution

001L freezes the implementation target at:

- **124 active requirements**;
- **116 active interfaces**;
- **31 active semantic objects**.

Net minimum delta:

- +8 requirements;
- +4 interfaces;
- +3 semantic objects.

This is intentionally smaller than the conceptual feature count from 001D-001K. Most rebuild semantics are represented by strengthening existing authority surfaces instead of creating parallel architecture.

The machine-readable row delta is frozen in:

`qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001L-CONSTITUTIONAL-DELTA.json`

## Why eight new requirements

The 001B responsibility challenge froze exactly eight `ADD` responsibilities. 001L materializes those eight, and only those eight, as new active requirement rows:

- `LRN-151` — versioned Learner Model projection;
- `LRN-152` — self-regulation plan/monitor/evaluate/strategy observations;
- `LRN-153` — bounded intentionally supplied motivation/effort/task-value/confusion context;
- `LRN-154` — materially relevant AI/tool/help/accommodation assistance condition on evidence;
- `LRN-155` — independent-performance / support-withdrawal verification when the intended construct requires independence;
- `LRN-156` — Learning-specific educational-effectiveness evaluation contract;
- `LRN-157` — Learning-system obligation for standards/interoperability adapter mappings while preserving existing semantic owners;
- `LRN-158` — fail-closed import of non-authoritative competency-alignment proposals without closing the unresolved equivalence authority gap.

The earlier `CHANGE`, `KEEP`, `MOVE`, `REMOVE` and `DEFER` responsibility decisions do not become extra requirement rows merely because their semantics were strengthened. They are reconciled through existing rows, shared-owner bindings, explicit anti-pattern prohibitions or fail-closed residuals.

## Three new semantic objects

Only three new canonical Learning semantic objects are required.

### `LRN-E027 LearnerModelProjection`

A versioned derived projection that gives one coherent learner-state view while referencing existing owner-valid truth.

It may synthesize:

- goals;
- lesson/practice observations;
- assessment attempt standing;
- admitted evidence;
- mastery/uncertainty/coverage;
- retention and transfer standing;
- assistance/independence condition;
- remediation need;
- maintenance state;
- self-regulation observations;
- contradictions, staleness and unknowns.

It does not become a second writer of any of those source truths.

### `LRN-E028 SelfRegulationObservation`

An append-oriented Learning-owned observation for:

- planning;
- monitoring;
- evaluation/reflection;
- strategy use/change;
- help requests;
- bounded intentionally supplied learner context.

Existing `LRN-E017 SelfConfidenceObservation` remains valid. Confidence becomes one bounded signal visible to the broader learner model; it is not superseded and does not become competence.

`LRN-E028` is not a psychological profile, diagnosis, mastery writer or automated emotion-inference object.

### `LRN-E029 LearningEffectivenessEvaluationDescriptor`

A versioned Learning-owned descriptor/projection for the educational meaning of an evaluation:

- exact intervention/policy version;
- comparator/baseline;
- population/context;
- outcome family;
- time horizon;
- assistance conditions;
- evidence package references;
- result standing;
- uncertainty/limitations;
- intended use and forbidden generalization.

Shared Assurance/Analytics retains generic randomization, experiment execution, statistics, power analysis, fairness machinery and generic model-risk tooling. Generic artifacts/evidence remain shared infrastructure.

## Four new interfaces

### `I111 GetLearnerModelProjection`

Read-only version/as-of query over `LRN-E027`.

It may expose observed/derived/inferred/unknown/stale/contradicted standing, but it may not mutate source truth as a hidden query side effect.

### `I112 RecordSelfRegulationObservation`

Append-oriented, semantically idempotent command over `LRN-E028`.

It records bounded SRL/self-report context. It cannot directly set mastery, competence, retention, transfer or qualification.

### `I113 RegisterLearningEffectivenessEvaluation`

Registers the Learning-specific evaluation subject/protocol and exact version pins for `LRN-E029`.

It does not make Learning the generic experiment/statistics platform.

### `I114 GetLearningEffectivenessEvaluation`

Read-only query returning the bounded evaluation result/standing, evidence references, uncertainty, limitations and intended-use claim.

It cannot rewrite individual mastery or turn one positive result into a product-wide effectiveness claim.

## Existing authority surfaces that are extended, not replaced

### Evidence / mastery

Reuse `LRN-E012` through `LRN-E016` and their existing interfaces.

Extensions make explicit:

- evidence coverage;
- uncertainty sources;
- delayed retention;
- meaningful transfer;
- assistance condition;
- independent-performance standing;
- contradiction visibility;
- evidence diversity/correlation limits.

No second mastery object or writer is introduced.

### Confidence / metacognition

Keep `LRN-E017 SelfConfidenceObservation` and `I011 SubmitSelfConfidence`.

001L adds broader SRL observation through `LRN-E028/I112`; confidence stays a self-report signal rather than competence evidence.

### AI tutoring

Reuse and extend Curriculum-owned `LRN-E020-C InstructionalPolicyVersion` for:

- question/nudge/hint hierarchy;
- worked examples/direct explanation/direct-answer rules;
- self-explanation;
- feedback timing/level;
- productive-struggle and cognitive-load bounds;
- scaffold fading;
- accommodation-safe behavior.

There is no new AI Tutor truth owner.

### Adaptive next action

Reuse and extend:

- `LRN-E020-L AdaptiveLearningPolicyVersion`;
- `LRN-E021 AdaptiveDecisionTrace`;
- `I017 OverrideNextAction`;
- `I026 GetNextAction`;
- `I054 OverrideNotPermitted`;
- `I055 NoEligibleAction`;
- shared `I105 ModelNotCalibrated`.

Eligibility is evaluated before ranking. Durable learning, evidence gaps, retention, transfer and growing independence remain decision priorities. Short-term correctness/engagement/output quantity cannot become the optimization target by themselves.

### Assessment/model governance

Reuse the existing Curriculum `AssessmentDefinition` and Learning `AssessmentAttempt` ownership split.

Extend the attempt/result representation with:

- assistance condition;
- scorer/model/rubric version;
- score standing;
- assurance/calibration references;
- human-review/escalation lineage where applicable.

Generic calibration, bias/fairness, drift and model-risk machinery remains shared Assurance authority.

The unresolved external/asynchronous score-commit ingress remains fail-closed. 001L does not invent a new callback interface.

### Qualification evidence packaging

Keep `LRN-E026 QualificationEvidencePackageDescriptor`, `I077`, `I032`, `I086` and shared authorization error `I109`.

Interoperability profile/version/provenance references may be carried as subordinate packaging metadata. Learning still does not own certification, credential signing, hiring, licensing or eligibility decisions.

## Subordinate types that do not become canonical semantic objects

001L deliberately does not inflate the 31-object denominator with helper/value structures.

The implementation may materialize subordinate types such as:

- `EvidenceAssistanceCondition`;
- adaptive eligibility/selection reason codes;
- assessment score standing and scorer lineage;
- interoperability envelope/mapping standing.

These are fields/value types inside existing/new owner-valid records. They do not gain independent writer authority.

## Interoperability reconciliation

CASE, QTI, Caliper and CLR remain translation/adaptation surfaces.

No new canonical Learning object is created merely for standards exchange.

Rules preserved:

- CASE associations do not create authoritative competency equivalence;
- QTI content does not automatically become an admitted Curriculum assessment;
- external QTI/result payloads do not bypass the unresolved S04 score-ingress boundary;
- Caliper events are activity events, not mastery evidence by existence alone;
- CLR verification does not create System Master mastery, certification or eligibility;
- external identifiers do not become person identity;
- unknown/lossy/ambiguous mappings remain explicit;
- adapter conformance is not semantic validity.

`LRN-069 / LRN-EXT-002` remains unresolved/deny-by-default.

## Authority that remains outside Learning

001L does not re-own:

- person identity;
- generic artifact bytes/storage;
- generic jobs/runtime;
- scheduler/delivery/notifications;
- transport;
- generic evidence/provenance substrate;
- rights/licensing;
- privacy/security authorization;
- generic AI/model assurance and statistics;
- credential serialization/signing;
- certification/accreditation/licensing;
- hiring or job eligibility.

Curriculum remains an internal Learning-system truth boundary, not a new Topology peer.

## Removed / forbidden shortcuts remain removed

The reconciliation does not admit:

- completion as mastery;
- score as mastery;
- confidence as competence;
- accepted AI answer/output quality/productivity as direct mastery evidence;
- generic engagement as learning effectiveness;
- AI-assisted success as independent capability when independence matters;
- automated inferred emotion/mental-state truth from raw telemetry as a default Learning capability;
- model confidence as a substitute for evidence coverage/validity;
- external standards as canonical Learning authority.

## Deferred gaps remain fail-closed

### Cross-domain competency equivalence

`LRN-069 / LRN-EXT-002` remains unresolved. Importing an external alignment proposal does not create authoritative equivalence.

### External/asynchronous score commit ingress

The S04 score-ingress path remains unresolved until exact source/provenance recovery identifies the owner-valid mechanism. 001L does not invent a new interface to make the design look complete.

### High-stakes external decisions

Certification, licensing, hiring, job eligibility and other consequential external decisions remain owned by their authorized consumers and are not imported into Learning truth.

## Runtime implementation resume order

001L freezes the following successor slices:

1. `001M-S01` — materialize the 124/116/31 constitution and subordinate types;
2. `001M-S02` — implement Learner Model + SRL runtime;
3. `001M-S03` — implement evidence/mastery uncertainty, retention, transfer, assistance and independence expansions;
4. `001M-S04` — implement AI tutoring + adaptive next-action policy expansions;
5. `001M-S05` — implement assessment/model-governance hardening;
6. `001M-S06` — implement Learning-effectiveness evaluation surfaces over shared Assurance/Analytics;
7. `001M-S07` — implement CASE/QTI/Caliper/CLR adapters behind semantic admission fences;
8. `001M-S08` — run cumulative exact-subject qualification across the changed Learning implementation.

Each runtime slice must freeze its exact implementation subject and test denominator before claiming PASS. A historical/foundation/software result cannot be transferred to changed bytes.

## Claim discipline

This operation freezes a constitutional design target only.

It does **not** claim:

- the new rows are implemented in runtime code;
- migrations/schema changes have run;
- handlers/routes exist;
- portable/native tests pass;
- live PostgreSQL works;
- shared Foundation contracts are production-admitted;
- the learner actually learned;
- an assessment is psychometrically valid;
- the AI tutor is educationally effective;
- CASE/QTI/Caliper/CLR conformance has been certified;
- any person is qualified, certified, licensed, job-ready or eligible.

## Frozen outcome

001L freezes:

1. the historical `110/110/26` lineage;
2. the admitted pre-rebuild `116/112/28` baseline;
3. the minimum reconciled `124/116/31` implementation target;
4. exactly eight new requirement responsibilities (`LRN-151..LRN-158`);
5. exactly four new Learning interfaces (`I111..I114`);
6. exactly three new canonical semantic objects (`LRN-E027..LRN-E029`);
7. reuse/extension of existing evidence/mastery, confidence, tutoring, adaptive, assessment and qualification-package authority;
8. subordinate value types rather than needless new truth owners;
9. unchanged shared-owner boundaries;
10. unchanged fail-closed competency-equivalence and score-ingress residuals;
11. no AI Tutor peer authority;
12. no second mastery/assessment/learner-model/statistics/integration/credential writer;
13. exact dependency-safe runtime-resume slices;
14. no runtime or educational-effectiveness PASS claims by this freeze.

## Exact next operation

`LEARNING-SYSTEM-REBUILD-001M — CONSTITUTION MATERIALIZATION + RUNTIME IMPLEMENTATION RESUME -> MATERIALIZE 124/116/31 ACTIVE LEARNING CONSTITUTION -> IMPLEMENT 001M-S01..S08 IN ORDER -> RUN EXACT-SUBJECT EXECUTABLE QUALIFICATION PER SLICE -> NO PASS TRANSFER`

This is the point where the Learning rebuild leaves foundation-only work and resumes actual implementation, one bounded slice at a time, with executable qualification against the exact changed subject.
