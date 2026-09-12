# LEARNING-SYSTEM-REBUILD-001F — AI Tutoring / Instructional Policy Expansion

Status: **FOUNDATION DESIGN FROZEN / NO RUNTIME BUILD OR PASS CLAIMS YET**
Date: 2026-09-12
System: `SYSTEM_MASTER/LEARNING`
Instructional-policy owner: `SYSTEM_MASTER/LEARNING::MOD-CURRICULUM-001`
Learner-state consumer/adapter: `SYSTEM_MASTER/LEARNING::MOD-LEARNING-001`
Parent: `LEARNING-SYSTEM-REBUILD-001E`

## What this capability does

This capability defines **how System Master is allowed to teach** when an AI tutor is participating in a Learning experience.

It answers questions such as:

- Should the tutor ask a question or explain directly?
- When should it give a nudge, hint, clue, partial worked step, or full worked example?
- When should it ask the learner to explain their reasoning?
- What kind of feedback should it give, and when?
- How much productive struggle is useful before more help is appropriate?
- How should explanations be chunked so the tutor does not overload the learner?
- When should scaffolding be reduced as the learner becomes more independent?
- When is a direct answer appropriate or required?
- What changes during assessment or independent-performance verification?
- What happens if the AI model is uncertain, ungrounded, unavailable, or outside the allowed teaching policy?

The intended outcome is **better learning and increasing independence**, not longer conversations, higher model output quality, faster task completion, or maximum use of AI.

## Current research direction

The foundation adopts the following evidence-backed principles:

1. General-purpose GenAI can improve task output without producing durable learning; tutoring must therefore use explicit pedagogical intent.
2. Research-based AI tutoring can improve learning when it deliberately uses active learning, scaffolding, cognitive-load management, accurate/timely feedback, and self-pacing.
3. Questioning, nudging, strategy shifts and scaffolded dialogue are useful AI-tutoring patterns, but they must remain subordinate to the educational objective.
4. “Least help first” is a strong default: begin with lighter support and increase help when needed rather than immediately taking over the task.
5. Learner independence is a first-class outcome. The tutor should not permanently do the planning, reasoning, monitoring or explaining that the learner is supposed to learn to do.

No single study or external product is treated as universal proof that an AI tutor will work for every learner, subject, age, task or context.

## Constitutional ownership boundary

### Curriculum owns instructional-policy truth

The existing Curriculum-owned `LRN-E020-C InstructionalPolicyVersion` remains the correct semantic owner for the meaning and allowed use of instructional strategies.

001F expands that responsibility to cover at minimum:

- question / prompt policy;
- nudge policy;
- hint policy;
- clue / partial-support policy;
- worked-example policy;
- self-explanation policy;
- retrieval-practice prompting policy;
- feedback level and timing policy;
- misconception/error-response policy;
- productive-struggle bounds;
- cognitive-load / chunking bounds;
- scaffold-fading policy;
- direct-explanation policy;
- direct-answer policy;
- assessment / independent-performance tutoring restrictions;
- accessibility/accommodation instructional constraints;
- source/grounding requirements where factual accuracy depends on authoritative material;
- model-use restrictions and fallback behavior.

Curriculum defines what these strategies mean and where they are allowed. A model prompt, chat template, provider setting, or UI component is not the authority for instructional policy.

### Learning owns learner-specific state and decisions

Learning continues to own the learner-specific state that may be used to select among Curriculum-allowed instructional strategies, including:

- Learner Model state from 001D;
- self-regulation / metacognition state from 001E;
- goal state;
- lesson/practice observations;
- assessment attempt state;
- evidence/mastery/retention/transfer standing;
- remediation needs;
- maintenance needs;
- current adaptive decision trace;
- assistance/independence conditions.

Learning may select or recommend among **eligible** teaching strategies under the exact Curriculum policy. It cannot invent a new instructional strategy or silently redefine Curriculum policy because the model prefers a different behavior.

### The AI tutor is not a third semantic owner

The AI model/runtime is an execution mechanism, not an owner of Learning or Curriculum truth.

It cannot independently:

- set mastery;
- change a Curriculum definition;
- authorize a hint during a locked assessment;
- redefine a teaching strategy;
- mark remediation complete;
- decide that its own explanation was effective;
- convert conversation fluency into evidence of learning;
- turn provider/model confidence into educational validity;
- write raw chat/provider metadata into learner semantic state.

Any durable learner observation or state change must still use the appropriate Learning-owned path.

## Instructional support ladder

001F freezes a **default least-help-first support ladder**. It is a policy-controlled ladder, not a mandatory linear script.

A typical progression is:

1. **ORIENT / ACTIVATE** — clarify the goal, activate relevant prior knowledge, or restate the task.
2. **QUESTION / PROMPT** — ask the learner to retrieve, reason, predict, identify, compare, or choose a next step.
3. **NUDGE** — lightly redirect attention without supplying the key reasoning.
4. **HINT** — provide a more specific cue toward the needed concept or operation.
5. **CLUE / PARTIAL STRUCTURE** — expose part of the structure, relationship, or next step.
6. **PARTIAL WORKED STEP** — model one bounded step while leaving meaningful work to the learner.
7. **WORKED EXAMPLE / DIRECT EXPLANATION** — demonstrate the process or explain the concept explicitly.
8. **DIRECT ANSWER** — provide the answer when policy permits or requires it, preferably with enough reasoning/context to support learning rather than merely supplying output.

The tutor does not have to begin at level 1 every time. The exact Curriculum policy may enter at a different level based on task type, prior knowledge, accessibility, current learner state, time/safety constraints, learner request, prior failed support, or the instructional objective.

## Questioning and Socratic-style tutoring

Questioning is useful when it requires the learner to perform relevant cognitive work rather than merely guess what the tutor wants.

Allowed question purposes include:

- activate prior knowledge;
- elicit reasoning;
- retrieve a concept;
- predict an outcome;
- compare alternatives;
- diagnose a misconception without treating the response as formal assessment unless the assessment contract says so;
- ask the learner to choose/explain a strategy;
- prompt monitoring or reflection at a meaningful point;
- check whether an explanation was understood.

Questioning must not become artificial withholding. The tutor must not repeatedly respond to every legitimate request with another question merely to appear Socratic.

## Nudge / hint / clue policy

The policy must make support levels distinguishable enough that assistance conditions can later be interpreted.

At minimum:

- **nudge** = redirects attention without revealing the key move;
- **hint** = supplies a targeted conceptual/procedural cue;
- **clue/partial structure** = exposes a meaningful part of the solution structure;
- **partial worked step** = demonstrates one step or transformation;
- **worked example** = demonstrates a substantial or complete analogous process.

Assistance level may be recorded in learner/practice context when it materially changes the interpretation of performance.

## Worked examples

Worked examples are permitted when policy indicates that explicit modelling is more useful than continued unguided struggle.

The policy may specify:

- analogous versus same-problem examples;
- full versus partial examples;
- whether the learner must complete missing steps;
- when example-to-problem fading is appropriate;
- whether a self-explanation prompt follows the example;
- how example complexity is bounded for cognitive load.

A worked example is instructional support. Success immediately after seeing one is not automatically independent-performance evidence.

## Self-explanation

The tutor may ask the learner to explain:

- why a step works;
- why an answer is plausible;
- how two concepts relate;
- why a strategy was selected;
- what changed after feedback;
- how an example maps to a new problem.

Self-explanation is a learning strategy, not mastery by itself. Fluent explanation text can be AI-assisted or superficial and must not bypass evidence policy.

## Feedback policy

Feedback must be tied to the instructional objective and the learner’s actual attempt/context.

001F admits the following feedback levels:

- **task/result feedback** — what is correct/incorrect or incomplete;
- **process feedback** — what reasoning, method, representation, or step can improve;
- **strategy/self-regulation feedback** — how the learner planned, monitored, checked, or changed approach;
- **next-step feedback** — what useful action should happen next under the eligible Learning/Curriculum policy.

The tutor should avoid unsupported global person judgments such as “you are bad at this,” “you are naturally gifted,” or psychological labels.

Timing is policy-controlled. Immediate feedback may be appropriate for misconceptions, unsafe errors, or early practice; delayed feedback may be useful when retrieval, checking, or independent completion is part of the learning objective.

A feedback message is not evidence that the learner understood it.

## Productive struggle

Productive struggle is permitted only while it remains educationally useful.

The tutor may withhold stronger help for a bounded period when the task is appropriately challenging and the learner has a viable path to progress.

The policy must define escalation triggers such as:

- repeated unproductive attempts;
- recurring misconception;
- learner-declared confusion;
- evidence of excessive cognitive load;
- learner request for more help;
- time/resource bounds;
- accessibility/accommodation needs;
- safety-critical error;
- task state showing that additional unguided struggle is unlikely to be useful.

The tutor must not use frustration as proof of rigor and must not withhold a needed explanation indefinitely.

## Cognitive-load and chunking bounds

The AI tutor must not treat maximum detail as maximum teaching quality.

Policy may constrain:

- number of concepts introduced at once;
- number of steps exposed at once;
- explanation length;
- notation density;
- amount of optional detail;
- number of simultaneous questions;
- switching between representations;
- frequency of metacognitive prompts;
- when to summarize before continuing.

The default should favor a **small coherent next instructional unit** over an unnecessary information dump.

When the learner requests more depth, the tutor may expand within policy.

## Scaffold fading

001F consumes the 001E self-regulation/independence capability and the 001D Learner Model.

Instructional scaffolding may be reduced when owner-valid learner state and policy support it.

Potential fading actions include:

- moving from worked example to partial example;
- moving from hint to nudge;
- asking the learner to select the strategy;
- delaying prompts to let the learner monitor independently;
- asking the learner to check their own work before feedback;
- increasing novelty or independence conditions when appropriate.

Fading is reversible. New evidence, confusion, changed task demands, or learner request may justify restoring support.

Authorized accommodations and assistive technology are not scaffolds that must be faded merely because the learner becomes more capable.

## Direct-answer policy

Direct answers are **not forbidden**. They are policy-governed.

A direct answer or direct explanation may be appropriate when:

- the learner explicitly requests it and the current activity permits it;
- lighter supports have been exhausted or are clearly unproductive;
- the learning objective is conceptual clarification rather than independent answer production;
- the answer is prerequisite factual information needed to continue;
- withholding it would add cognitive burden without useful learning;
- a safety-critical or consequential misunderstanding should be corrected promptly;
- accessibility/accommodation requires a more direct form of support;
- the task is not being used as independent-performance or assessment evidence.

A direct answer must be blocked or constrained when:

- an active assessment/integrity policy forbids it;
- the intended evidence requires independent performance and revealing the answer would invalidate that evidence;
- the Curriculum policy explicitly requires a retrieval/attempt condition before reveal and that condition remains valid;
- the model cannot produce a sufficiently grounded/authorized answer for the intended use.

The system must never trap the learner in endless hints simply to preserve a tutoring persona.

## Accuracy, uncertainty and grounding

The tutor must distinguish between:

- exact Curriculum/source-backed instructional content;
- deterministic transformations/calculations;
- model-generated explanation or example;
- uncertainty/unknown standing;
- learner-generated content;
- external information whose authority belongs outside Learning.

When an explanation requires authoritative/current source material, the applicable policy must require an admitted source or the tutor must explicitly degrade/decline rather than fabricate.

Model fluency is not evidence of factual correctness.

A model-generated explanation, example or answer does not become a Curriculum definition merely because it was shown to the learner.

## Assessment and independent-performance fence

Tutoring behavior must change when the current activity is an assessment or independent-performance verification.

The exact assessment policy may:

- disable hints;
- restrict examples;
- restrict direct answers;
- permit only clarification of instructions;
- permit declared accommodations;
- record assistance conditions;
- terminate or invalidate the evidence attempt if forbidden assistance occurred.

The AI tutor may not decide on its own that a locked assessment can be converted into ordinary tutoring.

## Learner agency

Where policy permits, the learner may:

- ask for more or less help;
- ask for a direct explanation;
- ask for an example;
- ask why the tutor chose a strategy;
- choose among eligible explanation/strategy options;
- skip a non-mandatory reflective prompt;
- request an independent attempt;
- challenge a tutoring recommendation.

Learner preference influences eligible teaching behavior but cannot waive assessment integrity, safety, authorization, or other hard policy constraints.

## Accessibility and accommodation

Instructional policy must be compatible with the current accessibility/accommodation context.

Examples include:

- alternate representation;
- reduced linguistic complexity without changing the intended construct;
- stepwise presentation;
- additional processing time;
- assistive-technology compatible interaction;
- alternate response modality where allowed.

Accommodation must not be mislabeled as cheating, excessive scaffolding, or lack of independence.

## Model/provider boundary

A model/provider may generate tutoring language only inside the selected policy envelope.

The runtime must preserve enough exact context to determine:

- Curriculum instructional-policy version;
- learner-state snapshot/version used;
- selected instructional strategy/support level;
- model/prompt/runtime version where it materially affects reproducibility or evaluation;
- source/grounding context when required;
- assessment/integrity mode;
- accessibility/accommodation mode;
- relevant assistance condition.

Raw provider metadata is not canonical instructional truth.

Model failure, refusal, outage, unavailability or unapproved model standing must follow explicit fallback/degrade/fail-closed policy rather than silently changing teaching authority.

## Relationship to Adaptive Next Action

001F does not replace the Learning-owned adaptive next-action capability.

The split is:

- **Learning adaptation** decides what eligible learning action should happen next for this learner.
- **Curriculum instructional policy** defines how an eligible instructional action may be taught/scaffolded.
- **AI tutor runtime** realizes the selected strategy within those constraints.

A model score cannot make an ineligible action or forbidden teaching strategy eligible.

## Relationship to the Learner Model and self-regulation

The tutor may consume the versioned Learner Model and self-regulation context to choose an allowed level/type of support.

Examples:

- known evidence gap -> use a prerequisite explanation or targeted hint;
- repeated heavy-hint dependence -> consider modelling followed by scaffold fading;
- learner demonstrates independent planning -> reduce unnecessary prompts;
- learner reports confusion -> increase clarification/help if policy permits;
- learner asks to try independently -> reduce scaffolding while preserving assessment/safety constraints.

The tutor cannot write the desired learner state back into the Learner Model to justify its own behavior.

## Assistance and evidence interpretation

When tutoring assistance materially affects what a learner performance means, the resulting Learning observation/evidence path must preserve the relevant assistance condition.

Examples:

- independent;
- ordinary prompt;
- nudge;
- hint;
- partial worked step;
- full worked example;
- direct answer/explanation;
- ordinary AI/tool assistance;
- authorized accommodation/assistive technology.

No support category automatically makes evidence valid or invalid; the intended construct and evidence policy determine interpretation.

## Privacy and minimization

The tutor may consume only learner information needed for the current educational decision.

It must not broaden tutoring into:

- personality profiling;
- mental-health inference;
- generalized motivation labels;
- unrelated behavioral tracking;
- protected-attribute personalization by default;
- raw chat/provider telemetry as learner truth.

## Educational-effectiveness non-claim

A correctly functioning AI tutoring policy does not prove that it improves learning.

Later Learning Effectiveness evaluation must separately test outcomes such as:

- immediate learning performance;
- delayed retention;
- transfer;
- independent performance;
- learner self-regulation/independence;
- engagement and burden;
- fairness/subgroup effects;
- adverse effects such as over-help, dependence, frustration, hallucinated guidance, or excessive interruption.

Software PASS is not educational-effectiveness PASS.

## Constitution decision

001F freezes the **expanded responsibility and behavioral boundaries** of Curriculum `InstructionalPolicyVersion` and its use by Learning/AI tutoring.

It does not yet create or renumber active requirements, interfaces, or semantic-object IDs.

The final constitution-delta pass must:

1. reuse `LRN-E020-C InstructionalPolicyVersion` as the primary policy owner unless exact reconciliation proves a missing atomic object;
2. reuse current Learning learner-state, lesson/practice, adaptation and evidence paths rather than creating a second tutoring-state authority;
3. add only the smallest new query/operation/object surface needed to select and record an instructional strategy if the existing 116/112/28 constitution cannot represent it losslessly;
4. preserve the historical 110/110/26 lineage;
5. prohibit chat transport, model provider, prompt template or UI configuration from becoming the instructional authority.

## Pre-build acceptance denominator

A separate 60-case 001F pre-build acceptance contract is frozen with this operation.

Those cases are **future executable obligations, not PASS claims**. Runtime build/test remains deferred by the controlling rebuild plan until the foundation capabilities are reconciled into the smallest constitutional delta and implementation slices resume.

## Frozen outcome

001F establishes one coherent AI-tutoring foundation:

1. Curriculum-owned versioned instructional policy.
2. Least-help-first support ladder with policy-controlled exceptions.
3. Clear question/nudge/hint/clue/worked-example/direct-answer semantics.
4. Self-explanation and retrieval-support policy.
5. Feedback level and timing rules.
6. Bounded productive struggle.
7. Cognitive-load/chunking limits.
8. Reversible scaffold fading toward learner independence.
9. Explicit direct-answer policy rather than blanket refusal or answer dumping.
10. Assessment and independent-performance restrictions.
11. Accessibility/accommodation integration.
12. Source/accuracy/uncertainty/model-provider fences.
13. Learner agency within hard policy constraints.
14. Assistance-context preservation for later evidence interpretation.
15. No new AI Tutor semantic authority.

No runtime implementation, real-learner effectiveness, mastery, retention, transfer or production claim is admitted by this freeze.

## Exact next operation

`LEARNING-SYSTEM-REBUILD-001G — EVIDENCE / MASTERY UNCERTAINTY + RETENTION / TRANSFER / INDEPENDENCE EXPANSION -> MAKE EVIDENCE COVERAGE + UNCERTAINTY FIRST-CLASS -> DEFINE DELAYED RETENTION PROTOCOLS -> DEFINE MATERIALLY-NOVEL TRANSFER PROTOCOLS -> PRESERVE AI-ASSISTANCE / INDEPENDENT-PERFORMANCE CONDITIONS -> PREVENT SCORE / COMPLETION / TUTOR FLUENCY FROM BECOMING MASTERY -> FREEZE WITHOUT BUILD`

Reason: after the system knows the learner, supports self-regulation, and has a bounded teaching policy, the next capability must harden what counts as evidence that learning actually occurred, lasted, transferred, and can be performed under the required level of independence.