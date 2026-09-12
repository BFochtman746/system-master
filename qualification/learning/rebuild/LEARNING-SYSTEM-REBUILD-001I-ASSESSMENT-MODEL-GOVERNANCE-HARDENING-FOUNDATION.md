# LEARNING-SYSTEM-REBUILD-001I — Assessment + Model-Governance Hardening

Status: **FOUNDATION DESIGN FROZEN / NO RUNTIME BUILD OR PASS CLAIMS YET**  
Date: 2026-09-12  
System: `SYSTEM_MASTER/LEARNING`  
Learning owner: `SYSTEM_MASTER/LEARNING::MOD-LEARNING-001`  
Curriculum definition owner: `SYSTEM_MASTER/LEARNING::MOD-CURRICULUM-001`  
Shared model-governance dependency: `SYSTEM_MASTER/ASSURANCE`  
Parent: `LEARNING-SYSTEM-REBUILD-001H`

## What this capability does

This capability defines when an assessment result is trustworthy enough to become Learning evidence.

It answers questions such as:

- What is the difference between an assessment definition, an assessment attempt, a submitted response, a score, and mastery?
- When may an AI model participate in scoring?
- What model version, rubric version, policy version, and evidence must be preserved?
- When is human review required?
- What happens when a scoring model is uncalibrated, drifting, out-of-scope, unavailable, or disagrees materially with another trusted scorer?
- How are fairness and subgroup effects governed?
- How are permitted tools, AI assistance, accommodations, and assessment-integrity conditions preserved?
- When is a score final rather than provisional or pending review?
- What happens when an external scorer returns a result asynchronously but the authoritative ingress contract is unresolved?
- What may mastery and adaptation consume from assessment state?

The intended outcome is **trustworthy, explainable assessment evidence**, not maximum scoring automation.

## Research direction

Current assessment and responsible-AI guidance supports a stricter governance stance for AI-assisted measurement than for ordinary low-consequence content generation.

The foundation adopts these research-backed principles:

1. validity and reliability are tied to the intended score interpretation and use; a model that performs well in one context is not automatically valid in another;
2. fairness and subgroup performance require empirical evaluation rather than assumption;
3. AI-assisted scoring needs traceable model/version identity, documented intended use, monitoring, and change control;
4. human accountability remains necessary for consequential or disputed uses even when automation performs part of the workflow;
5. ongoing monitoring matters because model behavior, populations, prompts, rubrics, providers, and input distributions can change;
6. assessment design must explicitly account for GenAI/tool availability rather than pretending assistance conditions do not exist;
7. AI-detection output is not sufficiently authoritative by itself to prove misconduct or invalidate evidence.

Research informs the policy boundary. It does not create a new runtime authority and does not prove that any particular model is valid, fair, calibrated, or effective for System Master.

## Existing authority preserved

001I strengthens the existing assessment/evidence architecture rather than replacing it.

### Curriculum remains the assessment-definition authority

Curriculum owns the instructional/measurement definition of the assessment, including the exact versioned definition of:

- the construct or skill/criterion being assessed;
- assessment items/tasks or item-selection policy where applicable;
- rubric/criterion definitions;
- permitted assessment mode;
- allowed or prohibited tools/help/AI conditions when part of the assessment definition;
- scoring meaning and interpretation constraints tied to the Curriculum construct;
- prerequisites and content/version relationships.

Learning cannot silently rewrite these definitions for one learner attempt.

### Learning remains the learner-attempt authority

Learning owns the learner-specific `AssessmentAttempt` history and its exact attempt/result standing.

This includes:

- attempt identity;
- learner/goal context permitted by privacy policy;
- exact assessment-definition/rubric/criterion versions;
- start/submission/finalization lineage;
- assistance/tool/accommodation conditions actually present when known through owner-valid evidence;
- assessment-integrity standing relevant to interpretation;
- scorer/model/human-review references needed to explain the result;
- score/result state after an owner-valid scoring outcome is admitted;
- regrade/correction/supersession lineage.

### Shared Assurance remains model-governance authority

Learning does not become the generic owner of:

- model calibration;
- generic fairness/subgroup evaluation;
- drift/model-risk standing;
- model approval/restriction standing;
- benchmark/model-card/evaluation truth;
- provider/model lifecycle risk governance.

Learning consumes exact current Assurance standing and fails closed, falls back, or requests review according to assessment policy.

### Shared runtime/integration remains transport authority

Learning does not own:

- raw model-provider payloads;
- generic webhook transport;
- external scorer connectivity;
- provider retry infrastructure;
- generic model execution;
- generic job/runtime truth.

A provider response is not canonical Learning score truth merely because it arrived successfully.

## Core semantic separation

001I freezes the following non-equivalences:

`AssessmentDefinition != AssessmentAttempt != Submission != ScoringObservation != FinalizedScore != Mastery`

Therefore:

- an assessment being defined does not mean it was attempted;
- an attempt being submitted does not mean it was scored;
- a scorer producing output does not mean the score is finalized;
- a finalized score does not by itself mean mastery;
- a mastery projection remains a separate Learning interpretation under the evidence/mastery policy from 001G.

## Assessment-attempt version binding

Every consequential assessment attempt must bind enough immutable/versioned context to reproduce what was actually assessed.

At minimum, where applicable, the attempt must bind:

- exact assessment-definition version;
- exact skill/criterion versions;
- exact rubric/scoring-policy version;
- assessment mode;
- permitted tool/AI/help conditions;
- relevant accommodation conditions;
- attempt identity and operation identity;
- submission identity/version;
- timing/as-of context needed for interpretation;
- integrity/authorization policy version where consequential.

A later Curriculum or rubric change cannot silently reinterpret a historical attempt. Regrading under a newer policy must be explicit and preserve both original and successor lineage.

## Score standing

001I requires score/result standing to be explicit rather than a single unlabeled number.

A future implementation must represent the exact current standing needed by the assessment contract, including distinctions such as:

- pending scoring;
- provisional/model-assisted result;
- human-review required;
- finalized;
- rejected/invalid for the intended interpretation;
- superseded by correction/regrade;
- unavailable/failed.

The constitution-delta pass will choose the smallest representation compatible with the existing assessment family; 001I does not invent active enum/interface IDs here.

## Score finalization rule

A score may become owner-valid finalized Learning assessment evidence only when all required conditions for the exact intended use are satisfied.

Depending on assessment policy, those conditions can include:

1. exact attempt/submission identity;
2. exact definition/rubric/scoring-policy versions;
3. successful scorer outcome from an allowed scoring path;
4. exact scorer/model identity and version when automation is used;
5. current required Assurance standing;
6. required human review or adjudication completed;
7. no unresolved integrity condition that blocks interpretation;
8. permitted assistance/accommodation conditions established sufficiently for the intended interpretation;
9. scorer output is within its approved domain/use;
10. operation/idempotency/concurrency checks succeed.

Unknown required conditions do not become favorable by default.

## AI-assisted scoring policy

AI may participate in scoring only through an exact assessment/scoring policy that defines its permitted role.

Permitted roles may include, depending on policy and stakes:

- advisory scoring for human review;
- one scorer within a multi-scorer process;
- bounded automated scoring where exact validation/Assurance standing permits it;
- feedback generation that is explicitly separated from authoritative score finalization.

AI participation must preserve:

- exact model/provider/model-version identity;
- exact prompt/scoring configuration version where material;
- rubric/scoring-policy version;
- input/submission identity or immutable digest/reference;
- output identity;
- confidence/uncertainty only as advisory metadata unless a validated policy gives it defined meaning;
- applicable Assurance evaluation/calibration standing;
- human-review disposition where required;
- finalization reason codes.

A model's self-reported confidence, token probability, or provider confidence score is never sufficient by itself to authorize a consequential score.

## Calibration / validity / approved-use fence

A scoring model must not be treated as universally calibrated or valid.

The assessment policy must identify the relevant intended use and the Assurance standing required for that use.

Examples of conditions that can matter include:

- response type;
- language;
- domain/subject;
- scoring scale;
- learner population represented by the evaluation;
- rubric version;
- stakes/consequence level;
- accommodation/tool condition;
- known input-distribution bounds;
- model/configuration version.

If required calibration/validation standing is absent, stale, incompatible, or unknown, the consequential model-dependent path must fail closed, degrade to an approved deterministic/non-model process, or require human review according to policy.

## Fairness and subgroup evaluation

001I does not permit the statement `model is fair` merely because an average accuracy metric is acceptable.

Shared Assurance owns generic fairness evaluation. The scoring policy consumes exact relevant standing that may include:

- subgroup performance differences;
- error/disagreement patterns;
- accessibility impacts;
- language/dialect effects where relevant;
- false-positive/false-negative or score-distribution effects appropriate to the use;
- coverage/representation limitations;
- unresolved fairness blockers.

Learning must not copy sensitive attributes into canonical learner state merely to make the scorer work. Privacy minimization and owner-valid evaluation contracts remain mandatory.

An unresolved fairness blocker for the intended consequential use cannot be overridden by a high overall model score.

## Drift / change management

A previously qualified model is not permanently qualified.

A material change to any of the following can require renewed Assurance evaluation or assessment-policy review:

- model version;
- provider/model configuration;
- prompt/scoring configuration;
- rubric/criterion version;
- input distribution or learner population;
- supported language/domain;
- scoring scale;
- material post-processing;
- detected performance or subgroup drift.

When required standing expires or becomes stale, new consequential score finalization must follow the current policy's fail-closed/fallback/review behavior.

Historical finalized scores keep their exact lineage and are not silently rewritten merely because a model later drifts.

## Human review

Human review is a governed scoring/adjudication state, not an informal escape hatch.

Policy can require human review for cases such as:

- high-consequence score use;
- low-confidence or insufficient-evidence model output;
- out-of-domain or unsupported input;
- material scorer disagreement;
- unusual/ambiguous response;
- integrity concern;
- accessibility/accommodation interpretation issue;
- learner challenge/appeal;
- fairness or drift blocker;
- unavailable or stale required Assurance standing.

Human review must bind reviewer/adjudication identity according to privacy/authorization policy, exact evidence reviewed, exact rubric/policy version, disposition, and reason codes sufficient for auditability.

The human decision does not erase the original model/scorer output. Both remain in lineage where policy permits retention.

## Model disagreement

If two scorers or a model and human materially disagree beyond the tolerance permitted by policy:

- the system must not silently average the disagreement away;
- the disagreement remains explicit;
- policy determines adjudication/review;
- downstream mastery/adaptation cannot consume a final score until the required resolution is complete.

No scorer wins merely because it has a higher self-reported confidence.

## Assessment-integrity boundary

Assessment integrity is interpretation context, not a shortcut to misconduct judgment.

001I freezes these rules:

- permitted assistance/tool/AI conditions must be established by the exact assessment policy/definition;
- the system records relevant assistance conditions actually known for the attempt;
- prohibited assistance can block or qualify score interpretation only through owner-valid integrity policy/evidence;
- raw suspicion is not a final misconduct fact;
- AI-detector output cannot be the sole authority for misconduct or evidence invalidation;
- chat/provider telemetry alone cannot silently invalidate an assessment attempt;
- integrity investigation/adjudication must preserve evidence and reason lineage.

## Assistance, AI use, tools, and independent performance

001I preserves 001G's assistance-condition model.

The meaning of assistance depends on the construct being assessed.

Examples:

- if the skill is independent mental calculation, calculator/AI use may be incompatible with the intended construct;
- if the skill is professional data analysis with approved software, tool use may be part of valid performance;
- if the skill includes responsible AI collaboration, approved AI use may be part of the construct rather than disqualifying evidence.

The attempt/result must therefore preserve applicable tool/help/AI conditions rather than reducing them to `cheated` / `did not cheat`.

## Accommodation and accessibility

Authorized accommodations are not automatically assistance that invalidates evidence.

Assessment interpretation must distinguish:

- an accommodation that preserves access to the intended construct;
- instructional scaffolding that may alter independent-performance interpretation;
- ordinary permitted tools;
- prohibited assistance;
- unknown/unverified conditions.

The exact assessment policy and construct determine the interpretation. Learning does not invent a universal rule that accommodated performance is weaker evidence.

## External/asynchronous score ingress — unresolved and fail-closed

The current reconstruction still lacks an owner-authoritative exact contract for the external/asynchronous score-return path associated with the historical S04 assessment flow.

001I **does not invent one**.

Until constitutional reconciliation and exact implementation-lineage materialization recover or define an owner-valid ingress contract:

1. no new public callback/interface is invented in this foundation;
2. a raw provider callback/payload cannot become canonical Learning score truth;
3. successful transport delivery is not score finalization;
4. an external scorer result may remain pending/review-required/uncommitted according to the future exact implementation contract;
5. no mastery or adaptive decision may consume a provider payload as if it were a finalized score;
6. retries/deduplication cannot manufacture multiple semantic score outcomes;
7. the unresolved path remains an explicit blocker for the exact external score-finalization runtime slice.

This is a deliberate fail-closed boundary, not missing documentation to be guessed away.

## Regrade, correction, and challenge

Assessment score history is append-oriented.

Rules:

- finalized score/result records are not destructively rewritten;
- correction/regrade produces explicit successor/disposition lineage;
- the original assessment definition/rubric/model/scoring context remains recoverable;
- a learner challenge/appeal cannot directly edit the historical score;
- successful review can authorize a successor score/result under exact policy;
- downstream mastery projections triggered by a corrected score create their own successor lineage rather than rewriting history.

## Failure handling

The scoring system must fail explicitly rather than guess.

Examples:

- model unavailable -> approved fallback/review/pending state, not synthetic score;
- provider timeout -> reconcile/retry under stable semantic identity, not second attempt/score;
- malformed scorer result -> reject/quarantine/review under policy;
- unsupported response -> review or fail according to policy;
- stale model standing -> fail closed/fallback/review;
- missing rubric/policy -> no authoritative score;
- unresolved external ingress -> no canonical finalization;
- partial transaction -> no partial finalized score plus missing receipt/event.

## Transaction, idempotency, and recovery discipline

Every assessment mutation must preserve exact lineage from attempt through score standing.

Minimum rules:

1. same semantic operation + same payload replays the same committed result;
2. same operation identity + different payload conflicts deterministically;
3. expected-version/CAS applies where the exact contract requires it;
4. attempt/result mutation + operation receipt + owner outbox commit atomically;
5. duplicate external/provider delivery is expected and deduplicated by stable semantic identity;
6. restart reconstructs from durable state, not process memory;
7. lost response after commit is reconciled rather than creating a second score;
8. only classified transient failures are retried;
9. stacked provider/runtime/Learning retries cannot create duplicate finalized scores;
10. unknown scorer/policy/Assurance standing remains explicit and never becomes finalized by fallback guess.

## Downstream evidence / mastery / adaptation boundary

Mastery and next-action policy may consume only owner-valid assessment evidence according to their own policies.

They may consume:

- finalized score/result identity;
- exact attempt/definition/rubric versions;
- assistance/accommodation/integrity conditions relevant to interpretation;
- scorer/model/human-review lineage needed by evidence policy;
- finalization standing and reason codes.

They may not consume as authoritative mastery evidence:

- raw LLM text;
- raw provider callback;
- provisional model output where finalization is required;
- model self-confidence;
- unreviewed result when review is required;
- an assessment submission without score finalization;
- AI-detector suspicion by itself.

A valid finalized score is still only an evidence input. 001G remains the mastery authority.

## Explainability for consequential use

For any consequential assessment result, the system must be able to explain at least:

- what assessment/criterion version was used;
- what response/attempt was scored;
- what scoring policy/rubric version applied;
- whether automation participated;
- the exact model/scorer identity/version where applicable;
- whether required Assurance standing was current;
- whether human review occurred or was required;
- what assistance/accommodation/integrity conditions affected interpretation;
- why the result is finalized, pending, review-required, rejected, or superseded;
- what remains uncertain or unresolved.

This explanation is not a model chain-of-thought requirement. It is structured decision/evidence provenance.

## No psychometric overclaim

001I separates three different kinds of evidence:

1. **software qualification** — the implementation behaves according to its contract;
2. **measurement validity/reliability/fairness** — the assessment/scoring interpretation is supported for the intended use;
3. **educational effectiveness** — using the assessment system improves learning or decisions in practice.

Passing software tests proves only the first unless separate evidence supports the others.

Likewise, a calibrated model is not automatically a valid assessment, and a valid assessment is not automatically educationally beneficial.

## Constitution decision

001I freezes responsibility and semantic hardening without assigning new active requirement IDs, public interface IDs, or canonical semantic-object IDs yet.

The final constitution-delta pass should prefer the smallest lossless change:

1. preserve Curriculum `AssessmentDefinition` authority;
2. preserve Learning `AssessmentAttempt` authority;
3. extend existing attempt/result semantics to preserve score standing, assistance conditions, scorer/model/review lineage where possible;
4. preserve shared Assurance as calibration/fairness/drift/model-risk authority;
5. add only minimum subordinate score-finalization/review representation if the active model cannot preserve these semantics losslessly;
6. do not create a second assessment, score, mastery, or model-governance writer;
7. keep external/asynchronous score ingress explicitly unresolved until exact constitutional/implementation reconciliation provides an owner-valid contract.

## Pre-build acceptance denominator

A separate **84-case 001I pre-build acceptance contract** is frozen with this operation.

Those cases are future executable obligations, not PASS claims. Runtime execution remains deferred until the rebuild foundation is constitutionally reconciled and the exact implementation slice is materialized.

## Frozen outcome

001I freezes these product capabilities:

1. explicit assessment-definition / attempt / submission / score / mastery separation;
2. exact version binding for consequential assessment attempts;
3. explicit score standing and controlled finalization;
4. bounded AI-assisted scoring roles;
5. exact model/scoring-policy/audit lineage;
6. intended-use calibration/validation fence;
7. fairness/subgroup governance dependency;
8. drift/change-management fence;
9. governed human review and disagreement handling;
10. assessment-integrity evidence without detector-as-judge behavior;
11. explicit assistance/tool/AI conditions;
12. accommodation/accessibility distinction;
13. fail-closed unresolved external score ingress;
14. append-oriented regrade/correction/challenge lineage;
15. explicit failure/recovery/idempotency discipline;
16. downstream mastery/adaptation consumption only from owner-valid finalized assessment evidence;
17. structured consequential-use explanation;
18. strict separation between software PASS, psychometric validity, and educational effectiveness.

No runtime build, psychometric-validity claim, model-fairness claim, or educational-effectiveness claim is admitted by this freeze.

## Exact next operation

`LEARNING-SYSTEM-REBUILD-001J — LEARNING-EFFECTIVENESS EVALUATION -> DEFINE OUTCOME FAMILIES -> BASELINES / COMPARATORS -> DELAYED RETENTION + TRANSFER + INDEPENDENCE OUTCOMES -> TUTORING / ADAPTATION EFFECTS -> BURDEN / ADVERSE EFFECTS -> SUBGROUP / FAIRNESS ANALYSIS -> REPRODUCIBLE EVALUATION PACKAGE -> SEPARATE SOFTWARE PASS FROM EDUCATIONAL EFFECTIVENESS -> FREEZE WITHOUT BUILD`

Reason: after assessment evidence and model-assisted scoring are governed, the rebuild can define how System Master will eventually demonstrate whether its tutoring, adaptation, self-regulation support, and assessment choices actually improve durable learning rather than merely functioning correctly.