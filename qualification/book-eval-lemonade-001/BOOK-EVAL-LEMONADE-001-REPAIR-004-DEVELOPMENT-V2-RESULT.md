# BOOK-EVAL-LEMONADE-001-REPAIR-004 — Development v2 Result

## Standing

**CLOSED_REPAIR_004__65_PERCENT__ADVANCE_TO_REPAIR_005_ARCHITECTURE**

Run `34240829339` completed successfully on A-01 with 80/80 DEVELOPMENT outputs frozen for candidate `E4-REPAIR-004-DEV-V2`, policy `BOOK-EVAL-LEMONADE-E4-DISCRIMINATION-REPAIR-v2`. Generation remained provider-blind and did not access scoring-private material.

## Exact primary top-1

- Original E4 DEVELOPMENT: **33/80 = 41.25%**.
- REPAIR-004 v2 DEVELOPMENT: **52/80 = 65.00%**.
- Net improvement: **+19 correct cases / +23.75 percentage points**.

This is a major capability gain but remains below the predeclared 70% continuation threshold and far below the eventual 90% qualification target.

## Family results

- ROOT_CAUSE: 6/10 = 60.0%.
- SURFACE_DIAGNOSIS: 5/10 = 50.0%.
- SEVERITY family primary top-1: 3/8 = 37.5%.
- EVIDENCE: 5/8 = 62.5%.
- CLEAN_CONTROL: 10/10 = **100.0%**.
- PRESERVATION: 6/8 = 75.0%.
- AMBIGUITY: 2/6 = 33.33%.
- BIAS: 4/6 = 66.67%.
- STALENESS: 4/4 = **100.0%**.
- ORACLE_VALIDATION: 4/4 = **100.0%**.
- ADVERSARIAL: 3/6 = 50.0%.

By broad task mode:

- MANUSCRIPT_DIAGNOSIS: 40/60 = 66.67%.
- REVISION_ASSESSMENT: 6/8 = 75.0%.
- PAIRWISE_COMPARISON: 6/12 = 50.0%.

## Safety / evidence behavior

- Prohibited-finding hard-gate violations: **0**.
- Evidence micro precision against required/acceptable labels: **100%**.
- Evidence micro recall: **81.41%**.
- Clean controls: **10/10 correct**.

## Remaining recurring error boundaries

The remaining errors are dominated by near-neighbor distinctions rather than malformed output:

- `LEGITIMATE_TRADEOFF` -> `CANDIDATE_A_BETTER` / `CANDIDATE_B_BETTER`: 4 cases.
- `MISSING_CAUSAL_MOTIVATION_BRIDGE` / `MISSING_ARGUMENT_MECHANISM` / `UNRESOLVED_GOAL_CONFLICT` / `MISSING_PAYOFF`: structural-neighbor confusions.
- `TIMELINE_CONTINUITY_CONTRADICTION` / `OBJECT_STATE_CONTRADICTION` / `FACT_CONTRADICTION` / `TIMELINE_CONTRADICTION`: continuity-neighbor confusions.
- `KNOWLEDGE_STATE_CONTRADICTION` / `POV_KNOWLEDGE_LEAK`: epistemic-neighbor confusions.
- `FACTUAL_CLAIM_ERROR` / `SOURCE_SUPPORT_CONFLICT` / `FACT_CONTRADICTION`: evidence-source-neighbor confusions.
- `INTENT_PRESERVATION_DAMAGE` / `MEANING_PRESERVATION_DAMAGE`: preservation-neighbor confusion.

## Adjudication

REPAIR-004 proved that explicit decision structure can unlock substantial additional capability from the current model, but the residual errors are concentrated where a flat one-pass classifier must discriminate among semantically adjacent literary concepts. Continue with hierarchical routing, specialist label sets, contrastive training examples, reference construction, independent dimension graders, and calibrated abstention/selective escalation.

Do not launch another full 160-case blind campaign from this standing. The next objective is `BOOK-EVAL-LEMONADE-001-REPAIR-005`.