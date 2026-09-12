# LEARNING-SYSTEM-REBUILD-001G — Evidence / Mastery Uncertainty + Retention / Transfer / Independence Expansion

Status: **FOUNDATION DESIGN FROZEN / NO RUNTIME BUILD OR PASS CLAIMS YET**
Date: 2026-09-12
System: `SYSTEM_MASTER/LEARNING`
Owner: `SYSTEM_MASTER/LEARNING::MOD-LEARNING-001`
Parent: `LEARNING-SYSTEM-REBUILD-001F`

## What this capability does

This capability defines how System Master decides what learner evidence actually supports.

It prevents the Learning System from collapsing very different claims into one number or one vague label.

The capability distinguishes at least these questions:

1. **Current demonstration:** Has the learner shown the skill under the required present conditions?
2. **Uncertainty / evidence coverage:** How complete, current, consistent and interpretable is the evidence behind that claim?
3. **Retention:** Does the learner still demonstrate the skill after a meaningful delay?
4. **Transfer:** Can the learner apply the learning in a materially new situation rather than only repeat a familiar pattern?
5. **Independent performance:** Can the learner perform under the assistance conditions that the intended skill actually requires?

The intended outcome is **truthful, explainable learner standing**, not a prettier progress percentage.

## Why this expansion is necessary

The existing S05 evidence/mastery foundation is strong. It already separates evidence, admissibility, mastery projection, staleness, contradiction, explanation and challenge. It also already rejects direct promotion from score, practice correctness, confidence, elapsed time, model confidence or repeated same-task success into mastery.

The rebuild research identified four areas that need stronger first-class semantics before adaptation is expanded:

- uncertainty and evidence coverage must be mandatory rather than optional metadata;
- delayed retention must be based on delayed evidence, not time passage alone;
- transfer must require evidence in a genuinely new application context appropriate to the construct;
- AI/tool/support conditions must remain visible so assisted success is not automatically treated as independent capability.

001G strengthens the existing S05 families. It does not create a second mastery authority.

## Current research direction

The foundation adopts these evidence-backed principles:

1. Immediate task performance and durable learning are separable outcomes.
2. Delayed retrieval provides materially stronger evidence of retention than immediate success or rereading alone.
3. Transfer requires application beyond the exact practiced item or surface form; repeated near-identical success is not enough by itself.
4. AI assistance can improve immediate performance while weakening later unassisted performance or persistence in some contexts, so assistance conditions must be preserved when interpreting evidence.
5. Retrieval practice can support both retention and transfer, especially when learning is measured after a delay and learners receive appropriate feedback.
6. No one study, interval, score or threshold is universal across skills, learners or intended uses.

Research informs the evidence design but does not become a runtime authority or create an automatic educational-effectiveness claim.

## Existing authority that remains unchanged

001G preserves the S05 semantic families and interfaces as the current evidence/mastery authority:

- `LRN-E012 MasteryEvidenceProfile`
- `LRN-E013 MasteryGateSet`
- `LRN-E014 MasteryStandard`
- `LRN-E015 MasteryProjection`
- `LRN-E016 MasteryExplanationSnapshot`

Existing evidence admission, reprojection, explanation, challenge, staleness and gate semantics remain valid.

No new source-evidence authority is created. Learning continues to consume owner-valid observations and external evidence references rather than copying foreign evidence truth.

## Core interpretation rule

Every consequential mastery statement must be read as:

> **A learner has demonstrated a defined capability, under defined conditions, with defined evidence, as of a defined time, under a defined policy, with explicit uncertainty and coverage.**

A statement that omits the conditions, evidence standing or uncertainty must not be treated as an authoritative mastery claim.

## 1. Evidence coverage is mandatory

A `MasteryProjection` cannot be represented as only a score or state.

For every projection, the system must be able to explain the evidence denominator expected by the applicable profile and how much of that denominator is actually supported.

Coverage includes, where applicable:

- which required criteria have evidence;
- which required criteria remain missing;
- which evidence types are present or absent;
- whether required retention evidence exists;
- whether required transfer evidence exists;
- whether required independent-performance evidence exists;
- whether freshness requirements are satisfied;
- whether evidence conditions match the intended use;
- whether contradictions remain unresolved;
- whether required source/provenance/authorization standing is available.

A high result on a narrow subset of the required evidence cannot silently represent complete coverage.

## 2. Uncertainty is first-class

Uncertainty is not a single magic confidence percentage.

The system must preserve the sources of uncertainty that matter to interpretation. These can include:

- insufficient evidence quantity;
- incomplete criterion coverage;
- weak or indirect evidence;
- stale evidence;
- contradictory evidence;
- uncertain scorer/model standing;
- uncertain source/provenance standing;
- assistance conditions that do not match the target performance condition;
- missing delayed evidence;
- missing transfer evidence;
- policy/version mismatch;
- unresolved challenge/review state.

### Uncertainty rule

A model probability or statistical confidence value may be one bounded input when valid for the intended use, but it cannot replace the evidence-coverage explanation.

The system must be able to say:

- `we do not have enough evidence`;
- `we have evidence, but not for all required criteria`;
- `the evidence is stale`;
- `the evidence conflicts`;
- `the learner demonstrated this only with substantial instructional support`;
- `retention has not been checked yet`;
- `transfer has not been checked yet`;
- `independent performance has not been checked yet`.

Unknown is not zero. Missing evidence is not failure. Uncertainty is not non-mastery unless the applicable profile says the missing gate prevents a stronger state.

## 3. Mastery remains profile-bound

There is no universal mastery percentage.

The exact active `MasteryEvidenceProfile`, `MasteryGateSet` and `MasteryStandard` define what evidence is required for the skill and intended use.

The profile may require combinations such as:

- criterion coverage;
- one or more assessment/practice evidence kinds;
- freshness;
- minimum evidence diversity;
- delayed retention;
- transfer;
- independent performance;
- particular assistance/accommodation conditions;
- human review or external validation where required.

The system cannot skip a required gate because an aggregate score is high.

## 4. Retention is delayed evidence, not elapsed time

Retention means the learner demonstrates relevant capability again after a meaningful delay under the applicable profile.

Time passing by itself does not prove retention or forgetting.

### Retention evidence requires

Where retention is required, the projection must preserve:

- the prior demonstrated capability and evidence reference;
- the applicable retention policy/profile version;
- the delay/window or revalidation condition expected by that policy;
- the delayed evidence item(s);
- the performance conditions of the delayed evidence;
- whether the delayed evidence covers the relevant criterion/skill;
- uncertainty and coverage of the retention claim;
- the as-of time and freshness standing.

### No fake universal spacing precision

001G does not define one universal delay such as `7 days`, `30 days` or `90 days` as proof of retention.

The appropriate interval depends on the intended skill/use and policy. If no valid retention horizon exists, the system must keep retention as unknown/not-yet-validated or use an explicitly labeled policy default; it must not claim scientific optimization.

### Retention standing

A learner can be currently demonstrated while retention remains unknown or due.

A retention check can strengthen the standing to `RETAINED` where the existing state model and gates permit it.

Failure or weak performance at a later check does not delete historical demonstration. It changes current interpretation and may trigger remediation/revalidation/maintenance according to policy.

## 5. Transfer requires a materially new application

Transfer is not repeated performance on the same item or superficial variants.

Transfer evidence must be defined against the intended construct and must establish that the learner can apply relevant knowledge/skill in a new context that is meaningfully different from the training context.

Potential dimensions of novelty include, where appropriate:

- new problem instance;
- new surface features;
- new data;
- new scenario/domain context;
- different representation;
- different combination of component skills;
- different constraints;
- less direct cueing;
- need to select the applicable concept rather than being told which one to use.

The profile decides which dimensions matter. The system must not invent novelty merely because the item identifier changed.

### Near vs broader transfer

Where the skill requires it, the evidence policy may distinguish:

- **near transfer** — application to a meaningfully changed but structurally similar situation;
- **broader/farther transfer** — application under more substantially different surface/context conditions.

No universal far-transfer requirement is imposed on every skill. The required transfer distance must match the intended capability.

### Transfer non-claims

- same-item memorization is not transfer;
- repeated template following is not automatically transfer;
- changing numbers/names only is not automatically transfer;
- model-generated answer quality is not learner transfer;
- the tutor recognizing the correct concept is not learner transfer;
- one novel success does not automatically establish broad generalization unless the profile permits it.

## 6. Assistance condition is part of evidence meaning

Every evidence item whose interpretation could materially depend on support must preserve the relevant assistance condition.

The foundation distinguishes at least these conceptual conditions:

- `INDEPENDENT` — no disallowed instructional assistance for the target construct;
- `INSTRUCTIONAL_SCAFFOLD` — hints, prompts, worked steps or tutoring support materially assisted performance;
- `AI_ASSISTED` — generative/model assistance materially contributed to the learner's performance;
- `COLLABORATIVE` — another person/system collaborated where collaboration affects the intended interpretation;
- `AUTHORIZED_ACCOMMODATION` — assistive/accommodation support permitted as part of the valid performance condition;
- `TOOL_PERMITTED` — tools are allowed by the construct and do not by themselves invalidate independent standing;
- `UNKNOWN_ASSISTANCE` — assistance standing cannot be established reliably.

These are foundation semantics, not yet final active enum/object/interface IDs.

### Assistance interpretation rule

Assistance is not universally bad.

The applicable mastery profile must define which support is:

- permitted;
- required;
- neutral to the construct;
- instructional and expected to fade;
- incompatible with an independent-performance claim;
- unknown/insufficient for the intended interpretation.

A calculator, screen reader, IDE, reference manual, AI assistant or human collaborator can be legitimate or illegitimate depending on the actual skill being evaluated.

Therefore **independence means independence from disallowed support for the intended construct**, not absence of every tool.

## 7. Independent performance is explicit when required

If the intended skill is `can perform independently`, then independent-performance evidence is a required gate before the system can make that stronger claim.

A learner can have valid states such as:

- demonstrated with guidance;
- demonstrated with AI assistance;
- demonstrated with an authorized accommodation;
- independent standing unknown;
- independent performance demonstrated.

The system must not collapse these into one undifferentiated success label.

### AI-withdrawal / support-reduction verification

Where policy requires independent performance, the system may deliberately reduce or remove instructional/AI assistance and observe a new attempt.

Rules:

1. the withdrawal condition must be appropriate to the construct;
2. authorized accommodations must not be withdrawn merely to manufacture independence;
3. the learner must know when an activity is an independent-performance check where transparency is appropriate;
4. the resulting evidence remains a new observation, not a rewrite of prior assisted evidence;
5. failure under reduced support does not erase earlier assisted learning history;
6. assistance may be restored afterward according to tutoring/remediation policy.

## 8. Independence is not required for every target skill

Some real-world capabilities are inherently tool-assisted or collaborative.

Examples can include:

- effective use of an AI assistant;
- programming with an IDE;
- data analysis with computational tools;
- accessible performance with assistive technology;
- team-based professional work.

For these skills, the profile must define the legitimate tool/collaboration conditions. System Master must not impose an artificial closed-book/no-tool standard when that is not the intended capability.

## 9. Accommodation fence

Authorized accommodation is not automatically instructional help and is not automatically evidence contamination.

The system must preserve accommodation standing where interpretation depends on it and defer to the applicable accessibility/authorization contract.

It must not:

- downgrade mastery merely because an accommodation was used;
- withdraw a required accommodation for an independence check;
- treat missing required accommodation as equivalent to valid independent performance;
- infer disability/diagnosis from accommodation use;
- copy unrelated sensitive identity/medical data into Learning evidence.

## 10. Contradiction remains visible

Conflicting evidence cannot be silently averaged away.

Examples:

- strong immediate performance but weak delayed retention;
- strong guided performance but weak independent performance;
- good repeated-item performance but weak transfer;
- different assessment forms yielding materially inconsistent results;
- learner evidence that conflicts with stale prior mastery.

The projection/explanation must show which dimensions conflict and what policy response applies: more evidence, revalidation, remediation, lower standing, or unresolved uncertainty.

Historical evidence remains historically true as an observation even when current interpretation changes.

## 11. Evidence diversity and independence of evidence

The profile may require evidence diversity so that multiple observations do not falsely appear independent when they share the same underlying source.

The system must be able to recognize, where relevant:

- repeated attempts on the same item;
- minor variants generated from one template;
- multiple scores derived from one source response;
- repeated AI-assisted attempts using the same answer path;
- duplicated/imported external evidence pointing to the same underlying artifact/event.

Evidence count is not automatically evidence diversity.

## 12. Learner Model integration

The Learner Model from 001D remains a projection/synthesis layer.

It may expose statements such as:

- current mastery is demonstrated with moderate evidence coverage;
- retention has not yet been checked;
- transfer is demonstrated for near-transfer contexts but broader transfer remains unknown;
- the learner succeeds with hints but independent performance is not yet established;
- evidence is contradictory or stale;
- an independent-performance check is due.

The Learner Model cannot manufacture these states. It must cite the exact mastery/evidence projection and preserve `OBSERVED`, `DERIVED`, `INFERRED`, `UNKNOWN`, `STALE` or `CONTRADICTED` standing as applicable.

## 13. AI Tutor integration

The AI tutor from 001F consumes evidence standing but does not write mastery.

Examples:

- if mastery evidence is weak, it may continue instruction/practice rather than declaring success;
- if retention is due, it may present retrieval/revalidation practice under policy;
- if transfer is missing, it may present a novel application task;
- if independent performance is required but unknown, it may reduce tutoring support for a bounded check;
- if uncertainty is high, it may explain the gap and gather more evidence rather than overstate confidence.

The tutor's own subjective judgment cannot become evidence unless it enters through an authorized assessment/evidence mechanism with the required scorer/model governance.

## 14. Adaptive policy integration

001G produces stronger inputs for the later Adaptive Next-Action expansion.

Adaptation may distinguish:

- `needs more criterion coverage`;
- `needs delayed retention check`;
- `needs transfer opportunity`;
- `needs independent-performance check`;
- `needs remediation because new evidence weakened a gate`;
- `evidence conflict requires clarification/reassessment`;
- `mastery standing is strong enough to progress under the active profile`.

No next-action policy may convert missing evidence into mastery just to keep the learner moving.

## 15. Explanation to the learner

The learner-facing explanation should answer, in plain language where possible:

- What do you currently appear to know or be able to do?
- What evidence supports that?
- How much of the required evidence do we have?
- What is uncertain or missing?
- Has this been checked after a delay?
- Has this been applied in a new situation?
- Was the performance independent, assisted, accommodated or tool-permitted?
- What evidence would strengthen or change the conclusion?

The user should not be forced to interpret an opaque probability or hidden rubric.

## 16. Challenge and correction

Existing mastery challenge semantics remain intact.

A learner can challenge a projection/explanation. The challenge cannot edit historical source evidence or the frozen projection in place.

Resolution may:

- correct an invalid evidence binding;
- change admissibility standing;
- correct assistance/context classification;
- identify a policy/version error;
- require additional evidence;
- produce a successor reprojection.

Every correction preserves lineage.

## 17. No educational-effectiveness overclaim

Passing the future software tests for 001G will show that System Master follows these evidence rules.

It will not prove that:

- a particular mastery model is psychometrically valid for every skill;
- a particular retention interval is optimal;
- a transfer task measures broad real-world transfer;
- removing AI always improves learning;
- a tutoring strategy causes long-term learning gains.

Those claims require separate Learning Effectiveness / Responsible AI evaluation and, where appropriate, psychometric validation.

## 18. Constitution decision

001G freezes the responsibility and semantic expansion without assigning new active requirement IDs, public interface IDs or canonical object IDs yet.

The final constitution-delta pass should prefer the smallest lossless change:

1. extend existing mastery/evidence projections and explanation semantics where possible;
2. make uncertainty/coverage fields mandatory where the existing model already has compatible structure;
3. represent retention/transfer/independence as explicit gates/conditions using the existing mastery policy/projection families where lossless;
4. add only the minimum new subordinate evidence-condition representation if existing S05 objects cannot preserve assistance/independence semantics without ambiguity;
5. do not create a second mastery writer, second learner model, or separate AI-generated mastery authority.

## Pre-build acceptance denominator

A separate **72-case 001G pre-build acceptance contract** is frozen with this operation.

Those cases are future executable obligations, not PASS claims. Runtime execution remains deferred until the rebuild foundation is constitutionally reconciled and the exact implementation slice is materialized.

## Frozen outcome

001G freezes these product capabilities:

1. mandatory evidence coverage;
2. explicit multi-source uncertainty;
3. no universal mastery percentage;
4. delayed retention evidence;
5. meaningful transfer evidence;
6. explicit assistance conditions;
7. independent-performance verification when the intended skill requires it;
8. accommodation/tool-permission distinction;
9. contradiction preservation;
10. evidence-diversity protection;
11. learner-facing explanation of what is known, unknown and still unproven;
12. clean integration with Learner Model, AI Tutor and later adaptation without adding a second mastery authority.

No runtime build or educational-effectiveness claim is admitted by this freeze.

## Exact next operation

`LEARNING-SYSTEM-REBUILD-001H — ADAPTIVE NEXT-ACTION POLICY EXPANSION -> CONSUME LEARNER MODEL + SELF-REGULATION + INSTRUCTIONAL POLICY + MASTERY/UNCERTAINTY/RETENTION/TRANSFER/INDEPENDENCE -> ELIGIBILITY BEFORE RANKING -> DURABLE-LEARNING PRIORITIES -> LEARNER CHOICE / OVERRIDE -> EXPLAINABLE REASON CODES -> DETERMINISTIC FALLBACK -> FREEZE WITHOUT BUILD`

Reason: after the system can truthfully distinguish what is demonstrated, uncertain, retained, transferred and independent, the adaptive policy can safely choose what the learner should do next without optimizing only for short-term correctness or completion.
