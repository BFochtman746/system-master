# LEARNING-SYSTEM-REBUILD-001D — Learner Model Foundation

Status: **FOUNDATION DESIGN FROZEN / NO RUNTIME BUILD YET**
Date: 2026-09-12
Owner: `SYSTEM_MASTER/LEARNING`
Parent: `LEARNING-SYSTEM-REBUILD-001C`

## What this capability does

The Learner Model gives the Learning System one coherent answer to:

- What is the learner trying to learn?
- What have they actually done?
- What evidence has been admitted?
- What appears demonstrated?
- What is still uncertain?
- What has become stale or needs rechecking?
- What has been retained over time?
- What has transferred to a meaningfully different situation?
- How much help or AI assistance was present when the evidence was produced?
- What learning gaps, contradictions, remediation needs, and maintenance needs currently exist?
- What does the system not know yet?

It is the organizing intelligence layer used by later adaptation and tutoring decisions.

## Critical boundary

The Learner Model is **not a new source of truth**.

It is a versioned projection assembled from the existing canonical Learning and Curriculum state. It cannot silently rewrite:

- Learning goals;
- practice observations;
- assessment attempts/scores;
- admitted evidence;
- mastery/retention/transfer state;
- curriculum definitions;
- remediation plans;
- self-reports;
- authorization/privacy truth;
- model-calibration truth.

If its source data changes, a new projection is produced. Historical projections remain reproducible.

## What feeds the Learner Model

The projection may synthesize exact versioned references to:

1. **Learning goals** — what the learner intends or is required to learn.
2. **Lesson/practice observations** — what actually happened during learning activity.
3. **Assessment attempts** — exact learner assessment state/results and conditions.
4. **Evidence/mastery projections** — admitted evidence, gates, mastery, retention and transfer standing.
5. **Self-confidence observations** — learner self-report context, never competence truth.
6. **Remediation needs** — diagnosed evidence/skill gaps.
7. **Maintenance plans** — due/revalidation state.
8. **Adaptive decision traces** — what the system previously recommended and why.
9. **Curriculum skill/criterion/prerequisite versions** — the exact definitions the learner state refers to.
10. **Future self-regulation observations** — planning, monitoring, evaluation and strategy-use context once that capability is frozen.
11. **Assistance/provenance conditions** — AI/tool/hint/support context only when it materially changes interpretation.

## Required output structure

Every meaningful learner-model statement must identify its standing as one of the following kinds:

- **OBSERVED** — directly recorded from an owner-valid learner interaction or self-report.
- **DERIVED** — deterministically computed from owner-valid inputs and a versioned policy.
- **INFERRED** — model-based or probabilistic interpretation with exact model/policy version and uncertainty.
- **UNKNOWN** — the system does not have sufficient evidence.
- **STALE** — evidence or interpretation is no longer current enough for the intended use.
- **CONTRADICTED** — material owner-valid evidence disagrees and the conflict is not yet resolved.
- **NOT_APPLICABLE** — the question does not apply under the current goal/skill/policy context.

`UNKNOWN`, `STALE`, and `CONTRADICTED` must remain visible. They may never be silently converted into a positive learner state.

## Required information on each projected claim

Where applicable, a projected learner claim must retain:

- learner-model projection version;
- exact subject/skill/criterion/goal reference;
- standing type from the list above;
- exact source reference(s) and source versions;
- observed/derived/inferred as-of time;
- evidence cutoff;
- policy version;
- model/algorithm/scorer version when an inference is involved;
- uncertainty/confidence interval/probability or bounded qualitative uncertainty when appropriate;
- evidence coverage/sufficiency;
- freshness/staleness standing;
- contradiction standing and affected sources;
- assistance/accommodation context where interpretation depends on it;
- limitations/non-claims.

A bare percentage with no source, version, uncertainty, or meaning is not an acceptable learner-model claim.

## Learner Model sections

### A. Goal state

Shows active goal(s), exact goal versions, target skills/criteria, and unresolved goal gaps.

The Learner Model can summarize goals but cannot edit them.

### B. Skill/evidence state

For each relevant skill/criterion, shows:

- evidence available;
- evidence admitted/not admitted;
- coverage gaps;
- mastery standing;
- uncertainty;
- retention standing;
- transfer standing;
- revalidation due state;
- contradictory evidence;
- important conditions such as assistance/accommodation.

### C. Learning-history state

Summarizes recent owner-valid lesson/practice/assessment activity needed for adaptation without turning raw telemetry into learner truth.

Generic clickstream/activity analytics remain outside canonical Learning authority.

### D. Assistance/independence state

When evidence interpretation requires it, indicates whether performance was:

- independent;
- completed with ordinary instructional scaffolding;
- completed with substantial hints/worked support;
- completed with AI/tool assistance;
- completed with an authorized accommodation/assistive technology;
- unknown with respect to assistance.

No assistance category automatically invalidates evidence. The applicable evidence/assessment policy determines what the condition means for the intended construct.

### E. Remediation and maintenance state

Shows current remediation needs, unresolved gaps, maintenance/revalidation windows, and evidence still required to exit those states.

The Learner Model does not generate Curriculum remediation content or own scheduler delivery.

### F. Learner-control / self-regulation state

Initially contains the current bounded inputs already available such as confidence, challenge/override history, and explanation interactions where owner-valid.

After the next rebuild capability is frozen, this expands to planning, monitoring, evaluation and strategy-use observations.

Self-regulation state cannot directly set mastery.

### G. Adaptation readiness

Summarizes what the adaptive decision capability may safely use when selecting a next action:

- eligible learner-state facts;
- known evidence gaps;
- retention/transfer needs;
- remediation needs;
- current learner goal;
- current Curriculum prerequisites;
- self-regulation support need;
- model/assurance availability;
- unknown/blocked dependencies.

This section does not itself choose the next action.

## Projection lifecycle

The learner model is versioned and immutable after publication.

A new projection may be created when material source state changes, including:

- new practice/assessment evidence;
- evidence admission/rejection;
- mastery reprojection;
- retention/transfer evidence;
- goal change;
- Curriculum version impact;
- remediation state change;
- maintenance/revalidation state change;
- self-regulation observation;
- contradiction resolution;
- source becoming stale;
- model/policy version change where that changes interpretation.

Identical exact inputs + exact policy/model versions must produce the same semantic projection.

## Contradiction rules

The system must not erase conflicting evidence by averaging it into a single reassuring number.

When material evidence conflicts:

1. preserve both source references;
2. mark the affected claim `CONTRADICTED` or the exact downstream state required by policy;
3. explain why the evidence conflicts if known;
4. identify what additional evidence/recheck could resolve it;
5. prevent a consequential adaptive/mastery decision from pretending the contradiction does not exist.

## Uncertainty rules

Uncertainty is first-class.

- No evidence means unknown, not zero mastery.
- Weak evidence means insufficient/uncertain, not precise mastery.
- Model confidence is not measurement validity.
- A score is not automatically mastery.
- Confidence self-report is not competence.
- Task completion is not learning.
- AI-assisted success is not automatically independent capability.
- Repeated near-identical performance is not automatically transfer.

## Privacy / minimization

The Learner Model should contain only data needed for learning decisions.

It must not become a general psychological profile.

Not admitted by this foundation:

- inferred mental-health status;
- personality labels presented as fact;
- emotion truth inferred from raw camera/chat/physiology/behavior by default;
- unrelated identity/person attributes;
- raw provider/chat/webhook payloads;
- generic browsing/device telemetry merely because it is available.

Bounded learner-declared context may be used later under the Self-Regulated Learning capability and its privacy rules.

## How other capabilities use it

### Adaptive Tutor

Uses the Learner Model as an input snapshot. It cannot mutate the Learner Model to justify its own recommendation.

### AI Tutor / Curriculum instructional policy

Uses the current learner-state projection to choose among allowed instructional strategies, but Curriculum remains owner of what those strategies mean.

### Assessment

May use permitted learner context for eligibility/accommodation decisions, but assessment results still write through AssessmentAttempt and evidence/mastery paths, not through the Learner Model.

### Maintenance

Uses exact retention/revalidation standing. Delivery remains with the scheduler/notification owner.

### Qualification packaging

May reference an exact learner-model/evidence cutoff for explanation, but qualification packaging remains evidence packaging rather than an eligibility decision.

## Foundation acceptance rules

This capability is considered correctly designed only if:

1. it has no independent writer for source learner truths;
2. every material claim can be traced back to exact owner-valid sources;
3. observed, derived, inferred, unknown, stale and contradicted facts remain distinguishable;
4. uncertainty/coverage is not optional for consequential learner interpretations;
5. historical projections are reproducible;
6. stale/conflicting evidence cannot silently become current mastery;
7. assistance conditions remain visible when interpretation depends on them;
8. raw telemetry cannot become semantic learner truth merely by ingestion;
9. downstream adaptation cannot write its desired answer back into the model;
10. changing model/policy versions cannot silently rewrite prior learner history.

## Constitution decision

This operation freezes the **responsibility** for a versioned Learner Model projection, but does not yet assign a new requirement ID, semantic-object ID, or public interface ID.

The next constitution-delta pass must determine whether the existing projection/read-model families can represent it losslessly or whether one minimal new semantic projection object/query is required.

No new writer authority is granted by this operation.

## Exact next operation

`LEARNING-SYSTEM-REBUILD-001E — SELF-REGULATED LEARNING / METACOGNITION FOUNDATION -> PLAN / MONITOR / EVALUATE / STRATEGY-USE / LEARNER-DECLARED CONTEXT / SCAFFOLD-FADING -> BIND INTO LEARNER MODEL WITHOUT ALLOWING SELF-REPORT TO BECOME MASTERY -> FREEZE WITHOUT BUILD`

Reason: once the Learner Model can represent known/unknown/inferred learner state correctly, the next missing capability is helping the learner become better at directing their own learning rather than making the adaptive system do all regulation for them.