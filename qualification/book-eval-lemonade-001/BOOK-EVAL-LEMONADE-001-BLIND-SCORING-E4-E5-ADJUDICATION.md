# BOOK-EVAL-LEMONADE-001 — Blind Scoring + E4↔E5 Adjudication

## Standing

**CLOSED — BOTH CANDIDATES BLOCKED; E5 NOT JUSTIFIED AS DEFAULT; E4 RETAINED ONLY AS CHEAPER REPAIR BASELINE**

## Authority and integrity

- Blind state: `BLIND_OUTPUTS_FROZEN`.
- E4 frozen cases: **160/160**.
- E5 repaired frozen cases: **160/160**.
- E4 candidate fingerprint: `7e7e7588138081f9ac3eaca75229934c137307927ac5ea0529ea800d601e03fc`.
- E5 candidate fingerprint: `3d275e96b5b231fdc2ab08eac70486cb7d4f858e25143fd404a5e039c431f598`.
- Scoring-private package SHA-256: `1091d409b5167463325ff85764bdd9b62c0e96cf9a9bef5f03445616c6b81940` — exact sealed authority verified before unsealing.
- Gold corpus SHA-256: `51cd4790ddd89d067a6e85ee6c6f3092ec3a6fba94faac8e77e31041277da91a`.
- Provider/task-mode contract audit: **E4 0/160 invalid; E5 0/160 invalid**.

## Scorer compatibility repair

The original post-freeze scorer initially failed before scoring because `BookQualityEvaluationRuntime.validateResponseConsistency()` imposed a generic invariant that is not part of the v2 provider/task-mode response contract. In particular, it required every non-clean `primary_finding` to be duplicated in `findings[]`, and required every `no_material_problem=true` response to use `NO_MATERIAL_PROBLEM`; v2 pairwise outcomes legitimately use task-mode tokens such as `TIE`, `LEGITIMATE_TRADEOFF`, or candidate-preference tokens.

No frozen candidate output and no gold/oracle data were changed. Scoring used the original v2.2 metric formulas, hard gates, family thresholds, and standing rules, with only the obsolete generic precondition bypassed after an independent task-mode ontology audit proved all 320 frozen candidate responses provider-contract-valid. A second implementation reproduced all 22 family rows and every pass/block decision.

## Primary result

| Measure | E4 Specialist | E5 Panel | E5 − E4 |
|---|---:|---:|---:|
| Overall top-1 | **42.50% (68/160)** | **44.38% (71/160)** | **+1.88 pp** |
| Development top-1 | 41.25% | 47.50% | +6.25 pp |
| Visible regression top-1 | 47.92% | 52.08% | +4.17 pp |
| Hidden holdout top-1 | **37.50%** | **25.00%** | **−12.50 pp** |
| Objective families qualified | 0 | 0 | — |
| Expert-pending families provisional | 0 | 0 | — |
| Families blocked | **11/11** | **11/11** | — |

The paired top-1 comparison has 60 both-correct cases, 8 E4-only correct cases, 11 E5-only correct cases, and 81 both-wrong cases. Exact paired McNemar/binomial p ≈ **0.648**, so the +1.88-point overall difference is not persuasive evidence of a true E5 accuracy gain. On hidden holdout, the candidates differed on four cases and **all four favored E4**.

## Architecture adjudication

E5 requires **504 logical member calls** for the 160-case corpus versus **160 calls for E4** — **3.15×** the evaluator-call workload. That extra 344 calls produced only three net additional top-1 correct cases overall, did not qualify a single family, and coincided with materially worse hidden-holdout performance.

**Decision:** do not adopt E5 as the default Book evaluator architecture. Preserve E5 as an experimental pairwise/ensemble branch only. Preserve E4 as the cheaper baseline for repair work, but do not promote E4 to production or Assurance standing because it also blocks all 11 families.

## What E5 did improve

- Pairwise-comparison top-1: **50.0% vs 33.3%** for E4.
- Bias-family top-1: **75.0% vs 50.0%**, but E5 position stability is **91.7%**, below the required **95%** gate.
- Evidence-family top-1: **50.0% vs 43.8%**.
- Several severity measurements improved materially, but the underlying diagnosis accuracy remained far below the 90% qualification thresholds.

These gains are insufficient to compensate for E5's compute cost, hidden-holdout regression, clean-control regression, and universal family blocking.

## Dominant failure modes

1. **Exact diagnosis selection is the primary bottleneck.** Both candidates frequently choose semantically adjacent but wrong ontology labels.
2. **Oracle validation is unqualified at 0% top-1 for both candidates.**
3. **Staleness handling is weak:** E4 12.5%, E5 25.0%; both emit prohibited binding diagnoses on two cases.
4. **Adversarial robustness is weak:** 25.0% top-1 for both.
5. **Clean-control false positives remain material:** E4 90% clean accuracy / 10% FPR but has two prohibited-diagnosis gates; E5 85% / 15% with one gate failure.
6. **Preservation-state calibration is poor in the dedicated preservation family:** E4 43.75%, E5 42.50%, despite both reaching 75% primary top-1 there.
7. **Ambiguity/tradeoff recognition is poor:** E4 16.7%, E5 25.0% against a 90% requirement.

## Exact next objective

`BOOK-EVAL-LEMONADE-001-REPAIR-004 — POST-SCORE FAILURE DECOMPOSITION + TASK-MODE EVALUATOR REPAIR / TARGETED REQUALIFICATION DESIGN`

Repair the evaluator where the scored evidence says it fails—exact ontology discrimination, oracle/staleness/adversarial routing, clean-control suppression, preservation calibration, and pairwise ambiguity/bias handling—without rerunning the full 160-case campaign until focused regression tests demonstrate threshold-level improvement.
