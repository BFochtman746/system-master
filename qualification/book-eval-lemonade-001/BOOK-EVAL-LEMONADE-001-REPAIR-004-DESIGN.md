# BOOK-EVAL-LEMONADE-001-REPAIR-004 — Post-Score Failure Decomposition + Task-Mode Evaluator Repair / Targeted Requalification Design

## Objective

Repair the cheaper E4-style single evaluator where the scored evidence proves it fails, then validate the repaired candidate on the already-designated VISIBLE_REGRESSION split before authorizing any new full blind qualification.

## Baseline

- DEVELOPMENT: 33/80 = 41.25% top-1.
- VISIBLE_REGRESSION: 23/48 = 47.92% top-1.
- retired HIDDEN_HOLDOUT evidence: 12/32 = 37.50% top-1.
- E5 is not the default repair target because its 3.15× call cost did not yield a persuasive quality gain and it regressed on the hidden holdout.

## Failure decomposition

The DEVELOPMENT failures are dominated by near-neighbor ontology discrimination rather than malformed outputs. Highest-repeat confusions:

1. `LEGITIMATE_TRADEOFF` → `CANDIDATE_A_BETTER` / `CANDIDATE_B_BETTER`: 6 cases.
2. `IDENTITY_ATTRIBUTE_CONTRADICTION` → `FACT_CONTRADICTION`: 2 cases.
3. `MISSING_ARGUMENT_MECHANISM` → `MISSING_CAUSAL_MOTIVATION_BRIDGE`: 2 cases.
4. Remaining errors are mostly one-off but cluster around the same boundaries: adversarial/control vs ordinary manuscript diagnosis; factual contradiction vs factual/source-support error; oracle validity; stale binding; timeline/state specificity; safe edit vs preservation damage; tie/tradeoff/preference/objective superiority.

The aggregate DEVELOPMENT confusion matrix is stored at `repair004/REPAIR-004-DEVELOPMENT-CONFUSION.csv`.

## Repair architecture

Candidate: `E4-REPAIR-004`.

Policy version: `BOOK-EVAL-LEMONADE-E4-DISCRIMINATION-REPAIR-v1`.

The repair keeps one evaluator call per case and changes the decision procedure rather than adding a permanent panel. The prompt now requires a task-mode decision ladder and the most-specific-supported-token rule:

- MANUSCRIPT_DIAGNOSIS: control/binding/oracle → state/continuity → fact/source/support → structural/causal → surface → clean restraint.
- PAIRWISE_COMPARISON: distinguish semantic tie, legitimate tradeoff, subjective-but-supported preference, and objective superiority caused by a concrete violation.
- REVISION_ASSESSMENT: distinguish safe edit from specific meaning/voice/canon/intent/protected-language preservation damage.
- Severity, evidence, clean control, and preservation dimensions stay independent from primary-label selection.

The repaired policy contains no case IDs, hidden split labels, hidden answers, or scoring-private artifacts. Strict compile and policy tests passed 20/20 before real-model validation.

## Contamination boundary

The v2 gold corpus has now been opened for post-freeze scoring. Therefore the old 32-case HIDDEN_HOLDOUT is retired as future unseen qualification evidence. It may support historical adjudication but MUST NOT be used to tune REPAIR-004 or to claim a fresh 90% qualification.

Repair learning is restricted to DEVELOPMENT. The existing VISIBLE_REGRESSION split may be used for targeted post-repair validation. If the repaired candidate becomes strong enough to advance, the final qualification MUST use a newly constructed and sealed holdout whose gold is unavailable to the provider and unavailable to repair authors until new outputs are frozen.

## Targeted requalification

Current targeted run: exactly 48 VISIBLE_REGRESSION cases, provider-blind, one repaired E4 call per case, local Lemonade `user.gpt-oss-120b-MXFP4`, temperature 0, exact frozen corpus/ontology/execution identities. Gold is not present on A-01 during generation.

Gate interpretation before a fresh holdout is authorized:

- **<70% visible top-1:** repair remains materially inadequate; continue focused failure repair.
- **70–84%:** meaningful improvement but not credible 90% candidate; continue targeted repair/validation.
- **≥85%:** eligible to construct a fresh sealed holdout, provided clean-control, pairwise ambiguity/bias, preservation, and hard-gate behavior also improve without material regression.
- **90%+ production/qualification claim:** never inferred from VISIBLE_REGRESSION alone; must be demonstrated on the new sealed holdout with the formal family/hard-gate requirements.

## No-repeat rule

Do not rerun the 160-case E4+E5 campaign as a debugging loop. Full blind qualification is permitted only after the targeted gate demonstrates that the repaired single-evaluator candidate is plausibly near the required threshold.
