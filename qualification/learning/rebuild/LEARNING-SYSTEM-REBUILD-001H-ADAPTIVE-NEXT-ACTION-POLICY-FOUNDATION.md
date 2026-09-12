# LEARNING-SYSTEM-REBUILD-001H — Adaptive Next-Action Policy Expansion

Status: **FOUNDATION DESIGN FROZEN / NO RUNTIME BUILD OR PASS CLAIMS YET**
Date: 2026-09-12
System: `SYSTEM_MASTER/LEARNING`
Owner: `SYSTEM_MASTER/LEARNING::MOD-LEARNING-001`
Curriculum policy dependency: `SYSTEM_MASTER/LEARNING::MOD-CURRICULUM-001`
Parent: `LEARNING-SYSTEM-REBUILD-001G`

## What this capability does

This capability defines how System Master chooses the learner's **next learning action**.

It answers questions such as:

- Should the learner continue, practice, review, remediate, recheck retention, attempt transfer, try independently, reflect, or be assessed?
- Which actions are currently allowed?
- Which allowed action best supports durable learning rather than just the next correct answer?
- How should uncertainty, stale evidence, remediation need, maintenance need, self-regulation state, learner preference and instructional policy affect the choice?
- When should the system abstain because there is no safe/valid next action?
- When can a model help rank choices, and what happens if the model is unavailable or uncalibrated?
- How does the learner understand, challenge, or override the recommendation where policy permits?

The intended outcome is **safe, explainable progression toward durable, transferable and increasingly independent capability**.

## Research direction

Current 2025–2026 reviews of intelligent tutoring and adaptive education support personalization but also identify unresolved issues around pedagogical alignment, explainability, learner agency, fairness, privacy, reproducibility and generalizability. The research does not justify a universal black-box policy claimed to be optimal for all learners, subjects or contexts.

001H therefore adopts these principles:

1. **Eligibility before ranking.** An action that violates prerequisites, assessment integrity, instructional policy, safety, authorization or required evidence conditions is never rescued by a high model score.
2. **Durable-learning priorities.** Ranking may consider retention, transfer, independence, remediation, evidence gaps and self-regulation—not only immediate correctness, speed, engagement or completion.
3. **Deterministic safe fallback.** The system must remain functional without a predictive model where the frozen deterministic policy permits it.
4. **Explainability.** Every durable recommendation records why the selected action was eligible and preferred and why blocked actions were blocked.
5. **Learner agency.** Where multiple actions are policy-eligible, the learner may be offered meaningful choice or an authorized override.
6. **No false optimization claim.** Software behavior is not proof that a sequencing policy improves learning outcomes.

## Existing authority preserved

001H strengthens the existing S06 adaptive family rather than creating a second adaptation authority:

- `LRN-E020-L AdaptiveLearningPolicyVersion`
- `LRN-E021 AdaptiveDecisionTrace`
- `I017 OverrideNextAction`
- `I026 GetNextAction`
- `I054 OverrideNotPermitted`
- `I055 NoEligibleAction`
- shared `I105 ModelNotCalibrated`

Existing rules remain:

- identical exact versioned deterministic inputs produce the same eligible set, selected action and reason codes;
- `GetNextAction` is read-only;
- ineligible actions cannot win because of model score;
- learner override is preference/action context, not competence evidence;
- Curriculum owns `InstructionalPolicyVersion` and remediation instructional-plan truth;
- shared Assurance owns model calibration standing;
- generic runtime/scheduler/transport remain outside Learning semantic authority.

## Inputs to a next-action decision

A durable decision may consume exact current references to:

1. learner goal and current learning-plan context;
2. Learner Model projection and its claim standings;
3. current mastery projection, evidence coverage and uncertainty;
4. retention standing and maintenance/revalidation state;
5. transfer standing;
6. independent-performance standing and assistance conditions;
7. current remediation need and eligible Curriculum remediation plan references;
8. self-regulation state, learner-declared help/context and learner-control preferences;
9. exact Curriculum prerequisite, criterion, lesson/practice/assessment and instructional-policy versions;
10. assessment integrity/lock conditions;
11. accessibility/accommodation conditions relevant to the intended construct;
12. exact adaptive policy version;
13. current authorization/safety/dependency standing required by the action.

Unknown or stale critical inputs remain explicit. They are not silently converted into favorable eligibility.

## Candidate action families

001H permits policy-defined candidate families such as:

- continue current learning step;
- targeted practice;
- varied practice;
- retrieval/review;
- remediation;
- retention/revalidation check;
- transfer/generalization task;
- reduced-support or independent attempt;
- self-regulation checkpoint;
- learner-choice point among equivalent eligible paths;
- formative assessment;
- owner-valid summative/locked assessment entry where separate assessment policy permits;
- maintenance/recheck action;
- pause/clarify/reconcile because required state is unknown or inconsistent.

This list does not create new public interfaces. Final constitutional reconciliation decides the smallest lossless representation.

## Eligibility comes first

Before any ranking, each candidate receives an exact eligibility standing.

Examples of blockers include:

- unmet prerequisite;
- incompatible Curriculum version;
- required evidence unavailable or too stale;
- assessment integrity restriction;
- remediation required before advancement;
- retention/revalidation required before a consequential claim;
- transfer requirement not yet eligible;
- independent-performance check inappropriate because the construct legitimately permits tools/support;
- accessibility/accommodation conflict;
- authorization/privacy/safety denial;
- required external dependency unavailable;
- instructional policy forbids the proposed tutoring/support mode.

Every rejected candidate preserves blocker reason codes and exact policy/input versions.

No ranking function—heuristic, statistical, ML or LLM-based—may convert an ineligible action to eligible.

## Durable-learning ranking priorities

Among eligible actions, policy may prioritize based on the learning objective and current evidence.

Relevant priorities may include:

- close a consequential evidence gap;
- restore or verify retention;
- produce genuinely new transfer evidence;
- reduce unnecessary support where independent performance is an intended outcome;
- remediate a diagnosed misconception/evidence gap;
- strengthen evidence diversity rather than repeating near-identical items;
- support a PLAN/MONITOR/EVALUATE self-regulation need;
- honor a meaningful learner preference among pedagogically valid alternatives;
- avoid unnecessary cognitive load or over-prompting;
- preserve required assessment integrity;
- avoid repeatedly selecting the easiest action solely because it maximizes short-term success.

The default objective is not maximum correctness, session length, click-through, content consumption, streaks, model confidence or completion speed.

## Uncertainty-aware adaptation

The system must adapt to uncertainty without pretending uncertainty is failure.

Examples:

- high mastery claim + weak evidence coverage may trigger additional evidence rather than immediate advancement;
- contradictory evidence may trigger clarification/reassessment rather than silent averaging;
- stale retention evidence may trigger revalidation;
- demonstrated current performance without transfer evidence may trigger transfer practice;
- supported success without independent evidence may trigger a reduced-support attempt only when policy says independence matters;
- insufficient evidence may produce an information-gathering action rather than a low-mastery label.

## Interaction with AI tutoring policy

001H chooses **what learning action should happen next**. 001F Curriculum instructional policy governs **how the tutor is allowed to teach within that action**.

Therefore:

- 001H may choose `targeted practice` or `self-explanation checkpoint`;
- 001F controls question/nudge/hint/worked-example/direct-answer behavior inside that experience;
- 001H cannot bypass 001F direct-answer or assessment restrictions;
- Chat transport or an LLM response cannot become instructional-policy authority merely because it generated the interaction.

## Learner Model integration

The Learner Model is a read/synthesis input, not a decision writer.

001H may consume learner-model claims marked `OBSERVED`, `DERIVED`, `INFERRED`, `UNKNOWN`, `STALE`, `CONTRADICTED` or other frozen standings, but it must preserve those distinctions.

An inferred learner-model claim cannot silently become authoritative mastery, prerequisite completion, eligibility or diagnosis.

## Self-regulation integration

Self-regulation context may affect how and when eligible actions are offered.

Examples:

- recommend a planning checkpoint before a complex task;
- allow a learner to choose among eligible strategies;
- reduce prompting when the learner is regulating effectively;
- restore support after the learner reports being stuck;
- propose reflection after a meaningful attempt pattern.

Confidence, effort, confusion, task value or reflection quality remain context—not competence evidence.

## Learner agency and override

Where policy permits, a learner may:

- choose among multiple eligible actions;
- request more or less support;
- ask why an action was recommended;
- challenge a recommendation;
- request an alternative;
- override to another validated eligible action.

Override rules:

1. the original recommendation remains immutable;
2. the alternative must be override-eligible or freshly revalidated;
3. assessment, prerequisite, safety and authorization locks remain enforceable;
4. the override creates append-oriented disposition history;
5. override is not evidence of mastery or non-mastery;
6. repeated learner preference may influence future eligible ranking only under policy and never erase educational requirements.

## Model-assisted ranking

A predictive or generative model may be advisory only after deterministic eligibility is established.

If used, the decision trace records:

- model identity/version;
- exact approved use;
- calibration/Assurance standing where required;
- model inputs permitted by privacy policy;
- model contribution to ranking;
- deterministic gates that constrained the model;
- fallback behavior.

If `I105 ModelNotCalibrated` or equivalent standing applies, the system must either use the frozen deterministic fallback when allowed or fail/degrade the model-dependent action.

A model may not:

- write mastery;
- invent prerequisites;
- bypass Curriculum policy;
- infer sensitive psychological truth as adaptation authority;
- promote an ineligible action;
- make an unreviewed high-stakes certification/hiring/eligibility decision.

## Deterministic fallback

The deterministic policy must define stable ordering/tie-break behavior for model-free operation.

A safe fallback may prioritize, subject to exact policy:

1. hard remediation/integrity/safety obligations;
2. required revalidation/retention obligations;
3. unresolved evidence gaps necessary for the learner goal;
4. transfer or independence checks required by the applicable standard;
5. next prerequisite-valid instructional step;
6. bounded learner preference among equivalent eligible alternatives.

This ordering is a policy framework, not a universal educational law. Exact Curriculum/Learning policy versions determine the concrete order for a skill/use.

## No-eligible-action behavior

If no valid candidate remains, the system must return explicit `I055 NoEligibleAction` or the exact reconciled equivalent with reason evidence.

It must not fabricate an action simply to keep the session moving.

Valid recovery paths may include:

- reconcile stale/missing state;
- request required Curriculum definition/policy;
- wait for assessment score finalization;
- resolve remediation-plan dependency;
- ask the learner for missing bounded intent/context;
- surface a configuration/authorization blocker.

## Decision trace and explanation

Every durable recommendation must preserve enough information to answer:

- What did the system know at the time?
- What was unknown/stale/contradictory?
- Which candidates were considered?
- Which were ineligible and why?
- Which were eligible?
- Why was this action selected?
- Which policy versions controlled the choice?
- Was a model used?
- What alternatives were available?
- Could the learner override?
- What later disposition occurred?

The trace is immutable historical evidence. Later acceptance, override, expiry or supersession is appended rather than rewriting the original decision.

## Anti-gaming / anti-perverse-objective rules

The adaptive policy must not optimize by default for proxies that can look successful while weakening learning.

Specifically, it may not treat these as the primary objective without explicit validated policy and effectiveness evidence:

- fastest completion;
- highest immediate correctness;
- maximum hint use;
- minimum hint use;
- longest session;
- most clicks/messages;
- content volume consumed;
- learner praise/satisfaction alone;
- model confidence;
- streak maintenance;
- task/output quality when the intended construct is learner capability.

The system must be capable of recommending a harder, delayed, varied or lower-support action when that action is justified by durable-learning requirements.

## Fairness, accessibility and privacy

Adaptive ranking may not use protected/sensitive attributes by default merely because they improve prediction.

Accessibility/accommodation is not a penalty and is not automatically evidence of dependence.

The system distinguishes:

- instructional scaffolding intended to fade;
- authorized accommodation/assistive technology;
- ordinary tools legitimately part of the target skill;
- AI/support whose presence changes the intended construct.

Only the minimum learner data necessary for the declared decision purpose should be consumed.

## Effectiveness / non-claim discipline

A correctly functioning next-action engine does not prove that its sequencing improves learning.

Later Learning Effectiveness qualification must separately evaluate, where appropriate:

- delayed retention;
- transfer;
- independent performance;
- time-to-learning rather than time-to-completion;
- remediation success;
- learner agency and burden;
- subgroup/fairness outcomes;
- over-scaffolding/under-scaffolding;
- harmful oscillation or excessive adaptation;
- comparison against simpler deterministic baselines.

Software PASS and model calibration PASS must not be presented as educational-effectiveness PASS.

## Constitution decision

001H freezes the responsibility and semantic expansion without assigning new active requirement IDs, interfaces or canonical object IDs yet.

The final constitution-delta pass should prefer the smallest lossless change:

1. preserve `AdaptiveLearningPolicyVersion` and `AdaptiveDecisionTrace` as the sole Learning adaptive policy/decision families;
2. extend their semantics to consume the 001D–001G foundations rather than creating a second recommender;
3. preserve Curriculum `InstructionalPolicyVersion` as instructional-method authority;
4. preserve learner override/challenge interfaces where sufficient;
5. add only minimum subordinate reason/eligibility representations if the existing objects cannot represent 001H losslessly;
6. do not create an LLM-owned, Chat-owned, Analytics-owned or Core-owned next-action authority.

## Pre-build acceptance denominator

A separate **72-case 001H pre-build acceptance contract** is frozen with this operation.

Those cases are future executable obligations, not PASS claims. Runtime execution remains deferred until the rebuild foundation is constitutionally reconciled and the exact implementation slice is materialized.

## Frozen outcome

001H freezes these product capabilities:

1. eligibility-before-ranking;
2. uncertainty-aware next-action selection;
3. durable-learning priorities including retention, transfer and independence;
4. integration of Learner Model and self-regulation without promoting them to decision authority;
5. clean separation between Learning next-action policy and Curriculum instructional policy;
6. explainable eligibility/rejection/selection reason codes;
7. learner choice and bounded override;
8. deterministic model-free fallback;
9. fail-closed no-eligible-action behavior;
10. model-assisted ranking only inside deterministic policy fences;
11. anti-gaming rules against short-term proxy optimization;
12. fairness/accessibility/privacy boundaries;
13. append-oriented immutable decision trace;
14. explicit separation between software qualification and educational effectiveness.

No runtime build or educational-effectiveness claim is admitted by this freeze.

## Exact next operation

`LEARNING-SYSTEM-REBUILD-001I — ASSESSMENT + MODEL-GOVERNANCE HARDENING -> ASSESSMENT DEFINITION / ATTEMPT / SCORE BOUNDARIES -> AI-ASSISTED SCORING POLICY -> CALIBRATION / FAIRNESS / DRIFT / HUMAN-REVIEW REQUIREMENTS -> SCORE FINALIZATION / EXTERNAL INGRESS FENCE -> ASSESSMENT-INTEGRITY / ASSISTANCE CONDITIONS -> EXPLAINABLE CONSEQUENTIAL USE -> FREEZE WITHOUT BUILD`

Reason: after the system can choose the next learning action safely, the next foundation step is to harden assessment and model-assisted scoring so assessment evidence entering the learner model/mastery/adaptation path is trustworthy and governed before runtime implementation resumes.