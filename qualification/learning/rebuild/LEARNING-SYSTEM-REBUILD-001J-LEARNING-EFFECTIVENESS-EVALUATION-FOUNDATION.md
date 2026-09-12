# LEARNING-SYSTEM-REBUILD-001J — Learning-Effectiveness Evaluation

Status: **FOUNDATION DESIGN FROZEN / NO RUNTIME BUILD OR EFFECTIVENESS CLAIMS YET**  
Date: 2026-09-12  
System: `SYSTEM_MASTER/LEARNING`  
Learning owner: `SYSTEM_MASTER/LEARNING::MOD-LEARNING-001`  
Curriculum definition owner: `SYSTEM_MASTER/LEARNING::MOD-CURRICULUM-001`  
Shared experiment/statistics dependency: `SYSTEM_MASTER/ASSURANCE` + shared Analytics/Evidence substrate  
Parent: `LEARNING-SYSTEM-REBUILD-001I`

## What this capability does

This capability defines how System Master will determine whether a tutoring, instructional, adaptive, assessment, maintenance, or self-regulation policy actually improves learning.

It prevents the system from claiming educational effectiveness merely because:

- software tests pass;
- the learner completed a lesson;
- the learner answered correctly while help was present;
- an AI response looked good;
- immediate post-test performance improved;
- the learner reported liking the experience;
- engagement increased;
- the system reached a mastery threshold faster;
- a model predicted that the intervention should work.

The intended outcome is a reproducible, evidence-backed answer to questions such as:

- Did the learner improve compared with an appropriate baseline or comparator?
- Did the improvement persist after a meaningful delay?
- Did the learner transfer the skill to materially different situations?
- Could the learner perform under the assistance conditions that actually matter?
- Did the intervention improve learning efficiency without weakening durable learning?
- Did tutoring or adaptation create unnecessary dependency?
- Did the intervention create burden or adverse effects?
- Were effects materially different across relevant groups or contexts?
- Is the result strong enough to support the intended claim, or is it only suggestive?

## Why this capability exists

Current evidence on educational AI requires a strict separation between task performance and durable learning.

The 2026 OECD Digital Education Outlook reports that general-purpose GenAI can improve task output without producing learning gains when it replaces cognitive effort, while educational uses tied to explicit pedagogical intent can improve learning. The 2025 randomized controlled trial by Kestin et al. found strong immediate learning gains from a research-designed AI tutor in an undergraduate physics setting, but that result is tied to a specific intervention, population, subject, duration, and outcome design. A 2025 systematic review of AI-driven intelligent tutoring systems found generally positive results while also calling for longer interventions, larger and more diverse samples, and stronger evaluation. The U.S. What Works Clearinghouse current standards emphasize design quality, baseline equivalence, attrition, outcome quality, and protection against confounding when making effectiveness claims.

Research references:

- OECD (2026), *Digital Education Outlook 2026: Exploring Effective Uses of Generative AI in Education*, https://doi.org/10.1787/062a7394-en
- Kestin, Miller, Klales, Milbourne & Ponti (2025), *AI tutoring outperforms in-class active learning: an RCT introducing a novel research-based design in an authentic educational setting*, Scientific Reports, https://doi.org/10.1038/s41598-025-97652-6
- Létourneau et al. (2025), *A systematic review of AI-driven intelligent tutoring systems (ITS) in K-12 education*, npj Science of Learning, https://doi.org/10.1038/s41539-025-00320-7
- What Works Clearinghouse (2022, revised 2022), *Procedures and Standards Handbook, Version 5.0*, https://ies.ed.gov/ncee/wwc/Handbooks

Research informs this evaluation boundary. It does not prove that System Master is effective, and it does not authorize any runtime effectiveness claim.

## Core separation: software qualification is not educational effectiveness

System Master must preserve four different claim classes.

### 1. Software qualification

Answers whether the implementation behaves according to its frozen contract.

Examples:

- deterministic policy selection;
- idempotent writes;
- correct version binding;
- fail-closed behavior;
- correct ownership enforcement;
- correct replay/recovery.

A PASS here means the software does what it was specified to do. It says nothing by itself about whether the intervention improves learning.

### 2. Measurement validity

Answers whether an assessment or outcome measure supports the interpretation being made from it.

This depends on the assessment/model-governance rules frozen in 001I and any required shared Assurance evidence.

A valid software implementation cannot make an invalid measure educationally meaningful.

### 3. Educational effectiveness

Answers whether the intervention caused or is credibly associated with improved learning outcomes for a defined population, context, time window, and intended use.

This requires an evaluation design with a suitable baseline/comparator, outcome definitions, uncertainty, and design-quality standing.

### 4. Generalization

Answers whether an effect demonstrated in one context can reasonably be expected elsewhere.

A positive result in one subject, learner type, model version, curriculum version, or assistance condition cannot automatically be generalized to another.

## Ownership boundaries

### Learning owns the educational evaluation questions

Learning owns the meaning of the learning-effectiveness question and the interpretation boundaries needed for Learning policy.

This includes:

- which Learning intervention or policy is being evaluated;
- which learner-facing outcome families matter;
- the intended educational use of the result;
- the distinction among immediate performance, retention, transfer, and independence;
- the Learning-specific assistance conditions needed for interpretation;
- whether a result is sufficient to justify a Learning-policy change;
- the Learning-facing explanation of what is known, unknown, uncertain, or not generalizable.

### Curriculum owns instructional definitions

Curriculum remains authoritative for the exact versioned instructional definitions being evaluated, including:

- skill/criterion/prerequisite definitions;
- lesson/practice/assessment definitions;
- instructional policy;
- tutoring policy;
- scaffold/fading policy;
- remediation content/policy;
- source/freshness/program validation.

An evaluation cannot silently redefine the intervention after the fact.

### Learning source systems remain authoritative for learner state

The evaluation capability consumes owner-valid source state. It does not become a second writer of:

- goals;
- lesson/practice observations;
- assessment attempts/scores;
- admitted evidence;
- mastery;
- retention;
- transfer;
- self-regulation observations;
- remediation need;
- maintenance plans;
- learner-model source facts;
- adaptive decision history.

Evaluation outputs are evaluation evidence. They cannot rewrite historical learner truth.

### Shared Assurance / Analytics own generic evaluation machinery

Shared services retain authority for generic machinery such as:

- experiment assignment/randomization infrastructure;
- statistical estimation libraries;
- power/sample-size analysis;
- confidence intervals/credible intervals as applicable;
- multiple-comparison procedures;
- generic fairness/subgroup analytical machinery;
- model-risk evaluation infrastructure;
- generic drift/change-detection methods;
- reproducibility execution;
- generic analytics computation and aggregation.

Learning may request and interpret these capabilities, but it must not create a duplicate statistics or experiment platform.

### Shared Evidence / Artifact infrastructure owns generic storage mechanics

Generic raw datasets, logs, artifacts, reports, hashes, provenance envelopes, and immutable evidence packages remain shared infrastructure responsibilities.

Learning owns the educational semantics of the evaluation package, not generic file storage or signing.

## Evaluation unit

Every effectiveness evaluation must identify an exact evaluation subject.

A subject may be:

- an instructional-policy version;
- an AI-tutoring-policy version;
- an adaptive-next-action policy version;
- a scaffold/fading strategy;
- a remediation policy;
- a maintenance/review policy;
- an assessment strategy;
- a self-regulation support policy;
- a bounded bundle whose components are all pinned.

The evaluation subject must not be labeled only as “AI,” “the tutor,” or “System Master.”

The exact relevant versions must be frozen so a later model, prompt, curriculum, rubric, policy, or configuration change cannot silently inherit the earlier result.

## Required evaluation protocol

Before an evaluation result can support an effectiveness claim, the protocol must preserve at minimum:

- evaluation identity;
- exact intervention identity and versions;
- comparator/baseline definition;
- target population/context;
- inclusion/exclusion rules when applicable;
- outcome families;
- primary and secondary outcomes;
- measurement instruments and versions;
- assistance/accommodation conditions relevant to interpretation;
- observation windows and follow-up windows;
- assignment design;
- analysis plan;
- missing-data/attrition policy;
- contamination/crossover policy;
- stopping rules if any;
- subgroup analyses planned in advance when consequential;
- statistical uncertainty method;
- multiplicity policy when multiple confirmatory outcomes are tested;
- data provenance requirements;
- privacy/minimization requirements;
- adverse-effect monitoring;
- version-change invalidation/revalidation rules;
- intended claim and forbidden overclaims.

A retrospective exploratory analysis may still be useful, but it must be labeled exploratory and cannot masquerade as a prospectively governed confirmatory evaluation.

## Outcome families

### A. Immediate performance

Measures what the learner can do during or immediately after the intervention.

Examples include:

- immediate post-assessment performance;
- error reduction;
- criterion attainment immediately after instruction;
- time to complete a bounded task.

Immediate performance is important but is never sufficient by itself to establish durable learning.

### B. Delayed retention

Measures whether the learner can still demonstrate the relevant capability after a meaningful delay.

The delay must be defined by the evaluation protocol and the intended use. There is no universal magic interval.

Retention evidence should distinguish:

- exact-repeat memory;
- near-repeat performance;
- delayed reconstruction/application;
- current assistance conditions.

### C. Transfer

Measures whether learning applies to materially different tasks, contexts, representations, or problem forms.

Transfer tasks must not merely repackage the same item with cosmetic changes.

The protocol must specify why the transfer distance is educationally meaningful.

### D. Independent performance / assistance withdrawal

Measures whether the learner can perform under the conditions the target capability actually requires.

Where independent performance is the intended target, evaluation may compare:

- full tutoring/support;
- reduced scaffolding;
- no instructional AI assistance;
- authorized ordinary tools;
- authorized accommodations.

Authorized assistive technology or accommodation is not automatically considered illegitimate assistance.

### E. Learning efficiency

Measures whether the intervention changes the resources required to reach a defined learning outcome.

Possible measures include:

- time to a valid outcome;
- number of instructional attempts;
- amount of prompting/scaffolding;
- practice burden;
- tutor/model interaction burden.

Faster is not automatically better if retention, transfer, independence, or safety worsens.

### F. Self-regulation / learner independence

Where relevant, measures whether the learner becomes better able to plan, monitor, evaluate, select strategies, and continue with less unnecessary regulation from the system.

These measures remain distinct from mastery.

### G. Engagement / learner experience

May include bounded self-report measures such as:

- engagement;
- perceived usefulness;
- perceived clarity;
- perceived cognitive burden;
- willingness to continue;
- perceived helpfulness.

These are meaningful experience outcomes but are not competence outcomes.

### H. Burden and adverse effects

Every consequential evaluation must consider potential harms or costs appropriate to the intervention.

Examples include:

- excessive prompting/interruption;
- increased time without learning benefit;
- dependency on assistance;
- reduced independent performance;
- increased confusion reported by the learner;
- accessibility regression;
- systematic failure for particular contexts;
- degraded retention or transfer despite better immediate performance;
- inappropriate direct-answer behavior that weakens cognitive effort;
- increased assessment-integrity risk.

Absence of a reported adverse effect is not proof that no adverse effect exists.

### I. Fairness / subgroup effects

When the data and intended use support it, the evaluation must examine whether effects differ materially across relevant groups or contexts.

Generic subgroup/fairness computation belongs to shared Assurance/Analytics. Learning defines which educationally relevant questions matter and what decisions the result may support.

Sensitive attributes must not be collected merely because subgroup analysis is possible. Privacy, authorization, necessity, minimum sample protection, and validity constraints still apply.

## Baseline and comparator rules

An effectiveness claim requires a meaningful reference condition.

Possible comparators include:

- prior owner-valid baseline performance;
- standard instructional policy;
- prior policy version;
- alternate qualified instructional strategy;
- randomized control/comparison condition;
- within-learner counterbalanced condition where design assumptions are met;
- repeated-measures/single-case baseline where appropriate.

The comparator must be defined before interpreting the effect.

The system must not compare an intervention against an artificially weak straw-man baseline and label the result general effectiveness.

## Causal-claim discipline

The strength of the claim must match the design.

### Randomized designs

Random assignment may support stronger causal inference when assignment integrity, attrition, contamination, outcome measurement, and analysis requirements are satisfied.

### Quasi-experimental designs

May support bounded causal inference only when their identifying assumptions and design quality are explicit and owner-valid.

### Observational analyses

May establish association, trend, or hypothesis-generating evidence but cannot be relabeled as randomized causal evidence.

### Single-user / N-of-1 evaluation

System Master is currently centered on a single-user product foundation. Within-person repeated or counterbalanced designs can provide useful evidence for that learner when period effects, learning carryover, treatment carryover, outcome timing, and intervention reversibility are considered.

A single-user effect does not establish population-level effectiveness.

## Baseline equivalence, attrition, and contamination

The evaluation must explicitly address design threats appropriate to the chosen design.

### Baseline imbalance

Groups or periods that differ materially before the intervention cannot be treated as interchangeable without an owner-valid adjustment strategy and appropriately limited interpretation.

### Attrition / missing outcomes

The evaluation must report:

- what data are missing;
- why missingness is known or suspected;
- whether missingness differs by condition;
- what analysis method was used;
- how the missingness changes confidence in the result.

Dropping unsuccessful or incomplete participants/periods is not an acceptable hidden repair.

### Contamination / crossover

The evaluation must identify material exposure to the other condition, outside tutoring, answer leakage, model/tool differences, or other contamination when it affects interpretation.

## Outcome-measure independence and leakage

An outcome must not simply test whether the learner memorized the exact tutor conversation, worked example, assessment item, or answer pattern.

Where practical, confirmatory evaluation should use outcome material that was not exposed to the learner during the intervention and was not used to tailor the exact intervention response.

The protocol must record material item overlap or leakage when it exists.

## Assistance-condition visibility

The evaluation must preserve the assistance conditions that materially affect outcome meaning.

Relevant dimensions may include:

- AI tutor present/absent;
- hints present/absent;
- worked examples present/absent;
- direct answers permitted/prohibited;
- calculator/software tools;
- reference materials;
- human help;
- authorized accommodation/assistive technology;
- time limits;
- open-resource versus closed-resource condition.

A result under one assistance condition cannot silently stand in for another.

## Intervention versioning and change control

Effectiveness attaches to a versioned intervention, not an eternal product name.

Material changes may require fresh evaluation or bounded revalidation, including changes to:

- foundation/model provider or model version;
- system prompt or tutoring policy;
- curriculum content;
- assessment definition;
- adaptive policy;
- scaffold/fading rules;
- tool access;
- retrieval sources;
- safety policy that changes instructional behavior;
- learner population/context;
- outcome measure.

Shared Assurance may own generic change-risk machinery, but Learning must decide whether the educational effectiveness claim still covers the changed intervention.

## Statistical reporting requirements

A valid evaluation package must not reduce the result to “better” or “worse.”

Where statistically applicable it should preserve:

- sample/observation count;
- design unit and analysis unit;
- point estimate;
- effect-size definition;
- uncertainty interval;
- baseline/comparator result;
- missingness/attrition standing;
- design-quality limitations;
- subgroup results if authorized and adequately supported;
- multiplicity handling where relevant;
- sensitivity analyses where required;
- exact analysis-code/version evidence through shared infrastructure.

Statistical significance alone is not educational importance.

A large point estimate with wide uncertainty cannot be reported as precise.

No universal effect-size threshold is frozen here. Practical importance depends on the learning goal, burden, risks, comparator, duration, and intended use.

## Effectiveness-result standing

Every Learning-facing evaluation result must carry an explicit standing.

Minimum standing vocabulary:

- `PLANNED`
- `IN_PROGRESS`
- `EXPLORATORY`
- `INCONCLUSIVE`
- `SUPPORTIVE`
- `ADVERSE_SIGNAL`
- `SUPERSEDED`
- `NOT_GENERALIZABLE`

A future constitution reconciliation may map these to existing objects or refine naming without weakening the semantics.

`SUPPORTIVE` does not mean universally proven.

The result must state exactly what claim it supports and under what conditions.

## Claim structure

A Learning-effectiveness claim must identify:

1. intervention/version;
2. comparator/baseline;
3. target learner/population/context;
4. outcome family;
5. time horizon;
6. assistance conditions;
7. effect estimate/standing;
8. uncertainty/limitations;
9. evidence package reference;
10. intended decision/use;
11. forbidden generalizations.

Example shape:

> Under intervention version X, compared with comparator Y, for context Z, delayed-retention outcome R showed a supportive effect with the recorded uncertainty and limitations. This result does not establish transfer, independence, or effectiveness for other curricula/model versions.

## Relationship to mastery

Effectiveness evaluation does not create mastery.

Individual learner mastery continues to be determined through owner-valid evidence and the Evidence/Mastery rules.

An intervention can be effective on average while a particular learner has not mastered the skill.

A learner can master a skill even if the intervention used has not yet accumulated population-level effectiveness evidence.

The two questions are related but not interchangeable.

## Relationship to adaptation

The adaptive system may consume an effectiveness standing when policy permits, but it cannot silently optimize on an unqualified metric.

For example:

- a policy that improves immediate correctness but harms independence must not be labeled globally superior;
- a policy with promising but exploratory evidence must remain bounded accordingly;
- a policy with an adverse signal may be restricted or escalated through owner-valid governance;
- local learner preference may be considered without turning preference into educational effectiveness.

Adaptive-policy changes driven by evaluation results must preserve decision trace and exact evaluation evidence reference.

## Relationship to learner model

The Learner Model may project evaluation context relevant to explaining recommendations, but it does not absorb population-level effectiveness evidence as if it were a learner fact.

It must not convert:

- “this intervention helped a study population” into “this learner has mastered the skill”;
- “this learner liked the intervention” into “the intervention is effective”;
- “this policy usually works” into certainty that it will work for this learner.

## Relationship to self-regulation and independence

001J explicitly treats reduced unnecessary support and preserved independent capability as outcomes worth measuring.

This protects against a failure mode where the tutor becomes so helpful that the learner performs well only while the tutor is present.

Scaffold fading and AI-withdrawal evaluation must remain reversible, policy-governed, and compatible with authorized accommodations.

## Fairness and privacy

Learning-effectiveness evaluation must not become a justification for unrestricted learner surveillance.

Hard rules:

- collect only data required for the authorized evaluation;
- use existing owner-valid learner state where suitable rather than duplicating data;
- do not infer sensitive traits from raw chat/device/voice/camera/physiological data as a shortcut to subgroup analysis;
- do not publish or surface subgroup results that create re-identification risk;
- do not treat small subgroup estimates as precise;
- preserve authorization, consent, and privacy constraints;
- keep generic fairness-model machinery in shared Assurance.

## Adverse-signal handling

A credible adverse signal must not be suppressed because the primary performance metric improved.

Examples:

- delayed retention declines;
- transfer declines;
- independent performance declines;
- burden rises materially;
- accessibility worsens;
- subgroup harm appears;
- learner challenge rate or failure pattern reveals a systematic problem;
- the intervention depends on answer leakage or disallowed assistance.

The exact operational response remains a later implementation concern, but the semantic requirement is frozen: adverse evidence remains visible and decision-relevant.

## Reproducible evaluation package

A Learning-effectiveness evaluation must be reconstructable from durable evidence.

The package must reference, as applicable:

- protocol version;
- intervention versions;
- comparator versions;
- Curriculum definitions;
- learner-state source versions/snapshots or durable references;
- assignment record;
- measurement instrument versions;
- raw/derived dataset provenance;
- analysis code/environment version;
- statistical outputs;
- exclusions and missingness handling;
- adverse signals;
- subgroup analyses;
- human review/adjudication where applicable;
- final claim text and standing;
- successor/supersession lineage.

Generic storage/signing belongs outside Learning.

## History and correction

Evaluation history is append-oriented.

Corrections must preserve:

- original result;
- reason for correction;
- corrected/successor result;
- changed data/analysis/protocol reference;
- reviewer/authority where applicable;
- downstream policy decisions that consumed the earlier result.

A later reanalysis cannot silently overwrite an earlier claim.

## No automatic product-wide claim

The system must never convert one successful evaluation into “System Master is proven effective.”

Effectiveness claims are bounded to the intervention, context, learner/population, outcomes, time horizon, versions, and design actually evaluated.

## Constitution reconciliation rule

001J freezes semantics and ownership boundaries only.

It does **not** create or renumber active requirement IDs, interface IDs, or semantic-object IDs yet.

During the later constitution-delta pass:

1. reuse existing evidence/provenance/evaluation structures where they preserve the semantics losslessly;
2. preserve Learning as owner of educational evaluation meaning and intended use;
3. preserve shared Assurance/Analytics as owner of generic experiment/statistical machinery;
4. add the smallest possible subordinate Learning evaluation projection/package descriptor if current 116/112/28 representation cannot preserve the semantics losslessly;
5. do not create a second mastery, assessment, learner-model, analytics, statistics, or model-governance authority;
6. do not create generic artifact/file/signing ownership inside Learning.

## Pre-build acceptance denominator

A separate **96-case 001J pre-build acceptance contract** is frozen with this operation.

Those cases are future executable obligations, not PASS claims. Runtime execution remains deferred until the rebuild foundation is constitutionally reconciled and the exact implementation slice is materialized.

## Frozen outcome

001J freezes these product capabilities:

1. strict separation of software qualification, measurement validity, educational effectiveness, and generalization;
2. versioned intervention/evaluation subjects;
3. prospectively governed evaluation protocol for confirmatory claims;
4. immediate-performance outcomes;
5. delayed-retention outcomes;
6. transfer outcomes;
7. independent-performance / assistance-withdrawal outcomes;
8. learning-efficiency outcomes;
9. self-regulation / learner-independence outcomes;
10. bounded engagement/experience outcomes;
11. burden/adverse-effect outcomes;
12. fairness/subgroup evaluation boundary;
13. comparator/baseline discipline;
14. causal-claim discipline matched to study design;
15. single-user/N-of-1 evaluation boundary;
16. baseline-equivalence, attrition, contamination, and leakage controls;
17. assistance-condition visibility;
18. intervention-version change control;
19. uncertainty/effect-size reporting without fake precision;
20. explicit evaluation-result standing;
21. bounded claim structure and forbidden overgeneralization;
22. no mastery mutation from evaluation results;
23. controlled use of effectiveness evidence by adaptation;
24. no population evidence masquerading as learner-model truth;
25. adverse-signal preservation;
26. privacy/minimization boundary;
27. reproducible evaluation package;
28. append-oriented correction/supersession lineage;
29. no automatic product-wide effectiveness claim;
30. strict separation between future runtime PASS and future educational-effectiveness evidence.

No runtime build, causal-effect claim, psychometric-validity claim, subgroup-fairness claim, or educational-effectiveness claim is admitted by this freeze.

## Exact next operation

`LEARNING-SYSTEM-REBUILD-001K — STANDARDS + INTEROPERABILITY ADAPTERS -> CASE COMPETENCY/CURRICULUM MAPPING -> QTI ASSESSMENT EXCHANGE -> CALIPER LEARNING-EVENT EXCHANGE -> CLR QUALIFICATION/ACHIEVEMENT EXCHANGE -> IMPORT/EXPORT PROVENANCE -> EXTERNAL-ID NAMESPACE + VERSION RULES -> NON-AUTHORITATIVE MAPPING/ALIGNMENT BOUNDARY -> NO EXTERNAL STANDARD BECOMES CANONICAL LEARNING TRUTH -> FREEZE WITHOUT BUILD`

Reason: Learning-effectiveness evaluation is the last new cross-cutting foundation capability in the frozen 001C build order. The next and final foundation capability before constitutional reconciliation is the standards/interoperability adapter layer.