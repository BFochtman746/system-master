# LEARNING-SYSTEM-REBUILD-001C — Human Capability Map

Status: **FROZEN CAPABILITY MAP / NO RUNTIME BUILD YET**
Date: 2026-09-12
Owner: `SYSTEM_MASTER/LEARNING`
Parent: `LEARNING-SYSTEM-REBUILD-001B`

## What this module is

The Learning System is the part of System Master that helps a person learn something, determines what they have actually demonstrated, decides what learning action should come next, and checks whether the learning lasts and transfers to new situations.

It must not confuse task completion, AI-assisted output, confidence, a score, or a finished lesson with actual learning.

## Capability map

### 1. Learning Goals & Learning Plan — KEEP / STRENGTHEN

What it does: captures what the learner wants or needs to learn and keeps the learning journey tied to that goal.

Current foundation: strong goal ownership already exists.

Rebuild change: connect goals to planning, strategy choices, progress explanations, and learner-controlled adjustments without making the goal object own every other learner state.

### 2. Curriculum & Course Design — KEEP / STRENGTHEN

What it does: defines skills, prerequisites, lessons, practice, assessments, remediation content, source freshness, and instructional policy.

Current foundation: strong and correctly separated from learner-state truth.

Rebuild change: add a first-class AI tutoring policy covering hints, questioning, worked examples, feedback, self-explanation, scaffolding, fading, productive struggle, cognitive-load limits, and when a direct answer is appropriate.

### 3. Lesson & Practice Experience — KEEP / STRENGTHEN

What it does: records what the learner actually did during lessons and practice without turning those observations directly into mastery.

Current foundation: strong append-only observation history and correction lineage.

Rebuild change: add plan-monitor-evaluate checkpoints, reflection/strategy support, and assistance-level context when AI or another tool materially changes what the evidence means.

### 4. Assessment — KEEP / STRENGTHEN

What it does: runs assessment attempts against exact assessment definitions and preserves score, integrity, accessibility, and version context.

Current foundation: strong assessment-definition versus learner-attempt separation.

Rebuild change: strengthen model/scorer governance, fairness, drift/revalidation, uncertainty, human-review rules, and preserve the unresolved score-ingress path until exact authority is recovered.

### 5. Evidence & Mastery — KEEP / STRENGTHEN

What it does: decides which observations count as evidence and produces explainable mastery, retention, and transfer judgments.

Current foundation: one of the strongest parts of the current design.

Rebuild change: make uncertainty and evidence coverage mandatory, not optional; define explicit delayed-retention and real-transfer evidence plans; preserve assistance/accommodation context where interpretation depends on it.

### 6. Learner Model — NEW FOUNDATION CAPABILITY

What it does: gives the rest of the Learning System one coherent, versioned view of the learner: what is observed, what is inferred, what is unknown, how certain the system is, what evidence supports it, and what is stale or contradictory.

Important boundary: this is a projection/synthesis layer, not a second writer of goals, mastery, assessment, or curriculum truth.

This is a missing architectural capability and should be built before more advanced adaptation.

### 7. Adaptive Tutor / What-To-Do-Next — KEEP / MAJOR STRENGTHENING

What it does: chooses the next useful learning action from the learner's current state while respecting prerequisites, evidence gaps, remediation needs, retention needs, learner choice, and instructional policy.

Current foundation: strong deterministic/fail-closed decision trace and clear separation between learner diagnosis and curriculum remediation content.

Rebuild change: stop optimizing primarily for immediate correctness or completion. The policy must protect long-term learning, independent capability, retention, transfer, and the learner's own ability to regulate their learning.

### 8. Self-Regulated Learning / Metacognition — NEW FOUNDATION CAPABILITY

What it does: helps the learner plan, monitor, evaluate, reflect, choose strategies, and progressively become less dependent on the system.

Current foundation: self-confidence, override, challenge, and explanations exist, but they are too narrow and fragmented.

Rebuild change: keep self-confidence as one observation, then add planning, monitoring, evaluation, strategy-use, bounded learner-declared effort/task-value/confusion context, and scaffold fading toward independence.

Hard boundary: learner self-report is context, not proof of competence.

### 9. Retention, Maintenance & Independent Performance — KEEP / STRENGTHEN

What it does: checks whether learning lasts, schedules revalidation/review windows, and verifies the learner can perform under the conditions that matter.

Current foundation: good distinction between maintenance intent and scheduler/delivery infrastructure, plus strong no-fake-precision rules.

Rebuild change: calibrate timing from real delayed evidence where available, preserve uncertainty, and add independent-performance or AI-withdrawal checks when the intended skill is independent performance.

Assistive technology or an authorized accommodation is not automatically treated as illegitimate assistance.

### 10. Qualification Evidence Package — KEEP

What it does: packages versioned Learning evidence for an authorized external consumer without deciding hiring, certification, licensing, or job eligibility itself.

Current foundation: strong boundary and should remain.

Rebuild change: keep Learning semantics; move credential serialization, signing, artifact bytes, and generic delivery mechanics to shared/integration owners.

### 11. Learning Effectiveness & Responsible AI Evaluation — NEW CROSS-CUTTING CAPABILITY

What it does: proves whether a tutoring/adaptive policy actually improves learning, not just software behavior or task output.

Measures must be separated into immediate performance, delayed retention, transfer, independent performance, engagement, fairness/subgroup effects, and adverse effects.

Learning owns the educational questions and intended use. Shared Assurance/Analytics owns generic experiment/model-governance machinery.

### 12. Standards & Interoperability Adapters — NEW INTEGRATION CAPABILITY

What it does: maps System Master Learning to/from external standards such as CASE, QTI, Caliper, and CLR.

These adapters are useful for exchange only. They do not become the canonical source of mastery, learner identity, competency equivalence, psychometric validity, certification, or eligibility.

## Things intentionally outside the Learning module

The Learning System does not own generic jobs, scheduler/notification delivery, artifact/file storage, person identity, rights/licensing, generic transport, generic model-risk infrastructure, credential signing, hiring decisions, certification decisions, or job eligibility.

The system may consume those capabilities through explicit contracts, but it must not duplicate their truth inside Learning.

## Capabilities explicitly rejected

- Treating task completion, accepted AI answers, output quality, or generic productivity success as direct mastery evidence.
- Automatically declaring a learner's emotion or mental state from raw chat, camera, physiological, or behavioral telemetry as a default canonical learner fact.

## Deferred decisions

- Authoritative cross-domain competency equivalence remains unresolved until an explicit owner exists.
- External/asynchronous assessment score-commit ingress remains unresolved until its real implementation authority is recovered.
- High-stakes certification/licensing/hiring/eligibility stays outside Learning.
- Peer/cohort/classroom orchestration is not required for the current single-user System Master foundation.
- Automated affect inference stays out unless a future bounded use case has explicit consent, validity, privacy, and authority rules.

## Foundation build order

The rebuild should now proceed in this order:

1. Learner Model foundation.
2. Self-Regulated Learning / metacognition foundation.
3. AI Tutoring / Instructional Policy expansion.
4. Evidence/Mastery uncertainty + retention/transfer/independence rules.
5. Adaptive next-action policy expansion.
6. Assessment/model-governance hardening.
7. Learning-effectiveness evaluation.
8. Standards/interoperability adapters.
9. Reconcile all of the above back into the existing Learning interfaces/objects with the smallest possible constitutional delta.
10. Only then resume executable implementation slices and qualification.

## Exact next operation

`LEARNING-SYSTEM-REBUILD-001D — LEARNER MODEL FOUNDATION -> DEFINE WHAT THE SYSTEM KNOWS / INFERS / DOES NOT KNOW ABOUT THE LEARNER -> SOURCE/UNCERTAINTY/STALE/CONTRADICTION RULES -> BIND TO GOALS, OBSERVATIONS, ASSESSMENT, MASTERY, SELF-REGULATION, ADAPTATION AND MAINTENANCE -> FREEZE WITHOUT BUILD`

Reason for selecting this next: the Learner Model is the missing organizing capability that every later adaptive decision depends on. Building tutoring/adaptation changes before this would force those capabilities to invent their own inconsistent view of the learner.