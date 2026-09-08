# BOOK-EVAL-LEMONADE-001-REPAIR-004 — Visible Regression Result

## Standing

**FAIL_TARGETED_GATE__CONTINUE_DEVELOPMENT_REPAIR**

The first repaired single-evaluator candidate (`E4-REPAIR-004`, policy `BOOK-EVAL-LEMONADE-E4-DISCRIMINATION-REPAIR-v1`) completed all 48 VISIBLE_REGRESSION cases with frozen provider-blind outputs. Candidate fingerprint: `86c4d5e042f314b638912b1da3d754c723fde82e2d3603a63b3c8515da8ee3f5`. Output SHA-256: `62424aaad5feeec6738d12d176e63fd45267c93825130b108b58602ef4131b39`. Scoring-private material was not present during generation.

## Exact top-1 comparison

- Baseline E4 visible regression: **23/48 = 47.92%**.
- REPAIR-004 v1 visible regression: **25/48 = 52.08%**.
- Net gain: **+2 correct cases / +4.17 percentage points**.
- Paired result: 18 both correct, 5 baseline-only correct, 7 repaired-only correct, 18 both wrong.

## Family directional changes

- ROOT_CAUSE: 33.3% -> 50.0%.
- SURFACE_DIAGNOSIS: 50.0% -> 66.7%.
- SEVERITY top-1: 60.0% -> 80.0%.
- EVIDENCE: 75.0% -> 50.0%.
- CLEAN_CONTROL: 83.3% -> 50.0%.
- PRESERVATION: 80.0% -> 80.0%.
- AMBIGUITY: 25.0% -> 25.0%.
- BIAS: 25.0% -> 75.0%.
- STALENESS: 0.0% -> 50.0%.
- ORACLE_VALIDATION: 0.0% -> 0.0%.
- ADVERSARIAL: 25.0% -> 0.0%.

## Adjudication

The repaired decision ladder is directionally useful, especially for bias, staleness, severity, root-cause and surface discrimination, but it is **not remotely sufficient for a 90% candidate**. It also overcorrects and harms clean-control, evidence and adversarial behavior. The predeclared `<70%` gate therefore applies: do not construct a fresh qualification holdout yet and do not rerun the full E4+E5 campaign.

Per the contamination boundary, the detailed VISIBLE_REGRESSION answers are not used to tune the next prompt. Further repair learning remains restricted to DEVELOPMENT evidence. The next tuning cycle must address the development-derived meta-evaluation hierarchy (oracle/staleness/adversarial vs ordinary manuscript diagnosis), clean restraint, source/evidence discrimination, and pairwise tie/tradeoff/better/objective-superiority boundaries.
