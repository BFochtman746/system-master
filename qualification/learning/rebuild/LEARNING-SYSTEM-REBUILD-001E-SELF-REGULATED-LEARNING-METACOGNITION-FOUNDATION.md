# LEARNING-SYSTEM-REBUILD-001E — Self-Regulated Learning / Metacognition Foundation

Status: **FOUNDATION DESIGN FROZEN / NO RUNTIME BUILD OR PASS CLAIMS YET**
Date: 2026-09-12
Owner: `SYSTEM_MASTER/LEARNING`
Parent: `LEARNING-SYSTEM-REBUILD-001D`

## What this capability does

This capability helps the learner become better at directing their own learning instead of making System Master do all of the regulation for them.

It gives Learning a bounded way to support and remember:

- how the learner plans to approach a learning task;
- whether they understand what they are doing and why;
- whether the chosen strategy appears to be working;
- when the learner recognizes confusion or a knowledge gap;
- how the learner evaluates what worked after an attempt;
- which learning strategies were tried or selected;
- whether support should remain, increase, change, or gradually fade;
- whether the learner can increasingly perform the regulation themselves.

The intended outcome is **greater learner independence**, not simply faster task completion.

## Why this belongs in the Learning System

The existing Learning design already has:

- goals;
- lesson/practice observations;
- assessment attempts;
- evidence/mastery/retention/transfer state;
- self-confidence observations;
- learner override/challenge/explanation behavior;
- adaptive decisions;
- remediation and maintenance.

What is missing is a coherent capability for the learner's own planning, monitoring, evaluation, strategy use, and progressive independence.

This capability extends the existing Learning state. It does **not** create a separate psychological-profile system or a second mastery system.

## Research-backed foundation

Current evidence supports the following design direction:

1. Metacognition/self-regulation is strongest when learners are explicitly supported to **plan, monitor, and evaluate** their learning.
2. Strategies should be taught and modeled rather than assuming the learner already knows how to self-regulate.
3. Scaffolding should support increasing independence and be reducible over time when appropriate.
4. Digital prompts can help, but their effect depends strongly on timing, specificity, learner context, and cognitive load; prompting is not universally beneficial.
5. Digital systems should complement learner regulation rather than permanently replacing it.
6. Motivation/effort/task-value/confusion can matter as learner context, but these states must not be converted into competence claims.

The design therefore optimizes for **learning-to-learn**, not just compliance with system prompts.

## Existing state that remains authoritative

### Self-confidence remains intact

`LRN-E017 SelfConfidenceObservation` and `I011 SubmitSelfConfidence` remain valid and narrowly scoped.

Self-confidence becomes one signal inside the broader self-regulation capability. It is not replaced, reinterpreted as mastery, or silently expanded into psychological truth.

Existing fences remain:

- high confidence does not prove mastery;
- low confidence does not prove non-mastery;
- confidence change does not prove learning gain;
- missing confidence is unknown, not zero;
- confidence cannot bypass evidence gates.

### Lesson/practice observations remain intact

Lesson/practice history remains Learning-owned observation history.

Self-regulation observations can be linked to an exact lesson/practice/assessment context, but they cannot rewrite the underlying attempt or lesson definition.

### Adaptive decisions remain intact

The adaptive system may use owner-valid self-regulation state as one input to a next-action decision, but it may not use that state to bypass prerequisites, evidence gates, assessment integrity, safety, or Curriculum policy.

## Frozen responsibility model

### Learning owns

Learning owns the learner-specific history and projection of self-regulation state, including bounded observations of:

- planning;
- monitoring;
- evaluation/reflection;
- strategy selection/use;
- confidence;
- learner-declared confusion;
- learner-declared effort;
- learner-declared task value/relevance;
- learner requests for more/less support;
- whether a strategy was learner-selected, system-suggested, or modeled;
- scaffold/support conditions actually present;
- learner-control/override/challenge actions already owned by Learning;
- independence-related observations that are valid under the applicable Learning/Curriculum policy.

Learning also owns the learner-specific decision about whether self-regulation support is currently needed as an input to adaptation.

### Curriculum owns

Curriculum owns the instructional meaning and allowed use of learning strategies and tutoring methods, including:

- strategy definitions when instructional/content-specific;
- modeling rules;
- question/nudge/hint rules;
- worked-example policy;
- self-explanation prompts;
- feedback strategy;
- productive-struggle policy;
- cognitive-load bounds;
- scaffold-fading policy;
- direct-answer policy.

Those rules are expanded in the next AI Tutoring / Instructional Policy capability.

### Shared systems retain their authority

Learning does not take ownership of:

- identity;
- privacy/authorization;
- raw chat or provider payloads;
- generic analytics/telemetry;
- model-risk/calibration infrastructure;
- generic scheduler/jobs/notifications;
- artifact storage;
- accessibility authority outside exact Learning/Curriculum use;
- clinical/mental-health interpretation.

## Core self-regulation cycle

The capability freezes four primary learner-regulation phases.

### 1. PLAN

The learner may establish or express:

- what they think the task requires;
- how they intend to approach it;
- which strategy they plan to use;
- what prior knowledge they think is relevant;
- where they expect difficulty;
- what success would look like for this learning step.

A plan is learner context, not a promise and not competence evidence.

### 2. MONITOR

During learning the system may support the learner in noticing:

- whether the current approach is working;
- whether they understand the current concept;
- whether they are stuck or confused;
- whether they are relying heavily on hints/AI/support;
- whether they should continue, change strategy, ask for clarification, or pause.

Monitoring observations remain bounded and contextual. They do not become mastery state.

### 3. EVALUATE

After a meaningful learning attempt the learner may reflect on:

- what worked;
- what did not work;
- why they think that happened;
- what they would change next time;
- whether the selected strategy should be reused;
- whether more evidence/practice is needed.

Reflection quality itself is not competence evidence.

### 4. STRATEGY USE

The system may remember which strategy was:

- learner-selected;
- system-suggested;
- explicitly modeled;
- used with substantial support;
- used independently;
- abandoned or replaced.

This history can help future adaptation choose how much instruction or prompting to provide.

## Bounded learner-declared context

The capability admits a minimal learner-declared context family for factors that can affect learning decisions without becoming psychological diagnosis.

Permitted bounded examples:

- `CONFUSION` / clarity self-report;
- `EFFORT` self-report;
- `TASK_VALUE` / perceived relevance self-report;
- help preference/request;
- readiness to try independently;
- learner-declared strategy preference in the current learning context.

Rules:

1. learner-declared context must be intentionally supplied or explicitly confirmed;
2. missing context is `UNKNOWN`, not negative;
3. low effort is not non-mastery;
4. high effort is not mastery;
5. confusion is not incompetence;
6. high task value is not learning gain;
7. the system must not infer mental-health status, personality, motivation trait, or emotional truth from these observations;
8. raw chat, camera, physiological, device, clickstream, or provider telemetry is not canonical learner-declared context merely because it can be observed;
9. a model-extracted value from free text must preserve its extraction/confirmation standing rather than being mislabeled as direct learner declaration;
10. privacy minimization applies to every field.

## Scaffold fading and learner independence

Scaffold fading is a first-class goal, but it must be safe and reversible.

### Fading rules

Support may be reduced only under an exact instructional/adaptive policy and current learner context.

Potential inputs include:

- repeated successful use of the strategy under appropriate conditions;
- evidence that the learner can plan/monitor/evaluate with less prompting;
- independent-performance evidence where required by the construct;
- learner request for less support;
- absence/presence of current remediation or evidence gaps;
- exact accessibility/accommodation standing.

No single self-report can force a consequential reduction in support.

### Reversibility

If a learner becomes stuck, requests help, or new evidence shows the support level is inappropriate, the system may restore or change scaffolding under policy.

Fading is not a one-way progression and is not a status badge.

### Accessibility / accommodation fence

Authorized assistive technology or accommodation must not be treated as a scaffold that should automatically be withdrawn.

The system must distinguish:

- instructional scaffolding intended to fade;
- assistive/accommodation support that may be part of the valid performance condition;
- ordinary tool/AI assistance whose interpretation depends on the intended construct.

## Prompting discipline

The system must not turn metacognition into constant interruption.

Prompting should be:

- tied to meaningful planning/monitoring/evaluation moments;
- policy-controlled;
- concise enough to avoid unnecessary cognitive load;
- reducible when the learner demonstrates increasing self-regulation;
- adaptable when the learner repeatedly ignores or is hindered by a prompt pattern;
- explainable when it materially changes the learning path.

Repeatedly asking the learner to reflect after every small action is not the default foundation behavior.

## Learner Model integration

The Learner Model from 001D may project self-regulation state, but remains a read/synthesis layer.

It may show, for example:

- learner has explicitly selected a strategy for the current task;
- learner has repeatedly requested substantial hints in similar contexts;
- learner reports confusion on a particular criterion;
- learner can evaluate and change strategy with less prompting;
- self-regulation standing is unknown because no reliable observations exist.

Each projected claim must preserve the 001D standing model such as `OBSERVED`, `DERIVED`, `INFERRED`, `UNKNOWN`, `STALE`, or `CONTRADICTED` as applicable.

The Learner Model may not convert self-regulation observations into mastery truth.

## Adaptation integration

Self-regulation state can influence what the adaptive system recommends.

Examples of eligible consequences under policy:

- recommend a planning checkpoint before a difficult task;
- ask for a self-explanation;
- suggest trying a different strategy;
- offer a worked example or stronger scaffold;
- invite the learner to attempt the next step with less support;
- recommend reflection after a meaningful failure/success pattern;
- give the learner a bounded choice among eligible approaches.

But self-regulation context cannot:

- make an ineligible learning action eligible;
- bypass prerequisites;
- create mastery;
- waive assessment integrity;
- certify capability;
- override safety or authorization policy.

## Learner agency

The learner should not be trapped by the system's regulation strategy.

Where policy permits, the learner can:

- request more explanation;
- request less prompting;
- choose among eligible strategies/actions;
- challenge why a prompt or recommendation was made;
- correct a learner-declared observation;
- skip a non-mandatory reflection prompt;
- ask to try independently.

A learner decision is recorded as context/decision history; it is not competence evidence by itself.

## Correction / history rules

Self-regulation observations are historical observations.

They must use the same append-oriented discipline as the existing confidence/lesson-practice design:

- later observations do not destructively overwrite earlier ones;
- an explicit correction preserves prior value and correction/supersession lineage;
- duplicate semantic operations are idempotent;
- conflicting reuse of an operation identity fails deterministically;
- transport retries cannot create duplicate semantic observations;
- model re-interpretation cannot silently rewrite what the learner previously declared.

## Data minimization / anti-psychological-profile rule

The capability exists to improve learning decisions, not to build a general profile of the person.

Not admitted as default canonical Learning truth:

- personality typing;
- inferred motivation traits;
- inferred emotional state from camera/voice/chat/physiology;
- mental-health diagnosis or risk classification;
- unrelated browsing/device behavior;
- protected/sensitive attribute personalization by default;
- generalized claims such as `this learner is lazy`, `anxious`, `unmotivated`, or `a visual learner`.

The system may store bounded context only when it has a declared Learning purpose and owner-valid privacy standing.

## Effectiveness / non-claim discipline

A functioning self-regulation feature does not prove it improves learning.

Later Learning Effectiveness qualification must separately evaluate outcomes such as:

- learner independence;
- reduced unnecessary scaffolding;
- appropriate strategy transfer;
- delayed retention;
- transfer;
- engagement burden;
- subgroup/fairness effects;
- adverse effects such as interruption or over-prompting.

Software PASS must never be presented as evidence that metacognitive support is educationally effective.

## Constitution decision

001E freezes the **responsibility and semantic boundaries** for self-regulated learning/metacognition.

It does not yet create or renumber active requirement IDs, public interfaces, or semantic-object IDs.

The final constitution-delta pass must determine the smallest lossless representation, with these preferences:

1. preserve `LRN-E017 SelfConfidenceObservation` and `I011 SubmitSelfConfidence` unchanged unless exact reconciliation proves a required compatible extension;
2. reuse existing lesson/practice/adaptive/learner-model projections where they can represent the state without dual writers;
3. add the minimum new append-oriented self-regulation observation/projection family only where the existing 116/112/28 model cannot represent the responsibility losslessly;
4. do not create a second mastery, learner-profile, psychology, or tutoring authority.

## Pre-build acceptance denominator

A separate 50-case 001E pre-build acceptance contract is frozen with this operation.

Those cases are **future executable obligations, not test PASS claims**. Runtime execution remains deferred by the controlling rebuild plan until the foundation capabilities are reconciled back into the smallest constitutional delta and executable implementation slices resume.

## Frozen outcome

001E admits the following foundation capabilities:

1. PLAN observations/support.
2. MONITOR observations/support.
3. EVALUATE/reflection observations/support.
4. STRATEGY-USE observations/history.
5. bounded learner-declared confusion/effort/task-value/help context.
6. scaffold-fading/independence state and policy consumption.
7. learner control over eligible prompting/support choices.
8. integration into Learner Model and adaptation without turning self-report into mastery.
9. append-only/correctable/idempotent history.
10. strong anti-psychological-profile/privacy fences.

No runtime implementation or effectiveness claim is admitted by this freeze.

## Exact next operation

`LEARNING-SYSTEM-REBUILD-001F — AI TUTORING / INSTRUCTIONAL POLICY EXPANSION -> QUESTION / NUDGE / HINT HIERARCHY -> WORKED EXAMPLES -> SELF-EXPLANATION -> FEEDBACK LEVEL + TIMING -> PRODUCTIVE STRUGGLE -> COGNITIVE-LOAD BOUNDS -> SCAFFOLD FADING -> DIRECT-ANSWER POLICY -> BIND TO LEARNER MODEL + SELF-REGULATION WITHOUT MAKING THE MODEL OR CHAT TRANSPORT THE INSTRUCTIONAL AUTHORITY -> FREEZE WITHOUT BUILD`

Reason: after the Learner Model and self-regulation foundation exist, Curriculum can define exactly how the AI tutor is allowed to teach and scaffold before the adaptive next-action policy is strengthened.