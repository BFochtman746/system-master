# BOOK-EVAL-LEMONADE-001-REPAIR-005 — Gate C Closure

## Standing

**PASS_DEVELOPMENT_GATES__UNSEEN_GENERALIZATION_NOT_QUALIFIED**

Gate C trained a private hierarchical router + specialist leaf-classifier stack from the 612-record Gate B private corpus and qualified it on the 80-case DEVELOPMENT adaptive-training lane.

## DEVELOPMENT qualification

Predeclared advancement gates all pass:

- router accuracy: **80/80 = 100%** (gate >=95%);
- leaf exact accuracy with abstention counted as not exact: **76/80 = 95%** (gate >=85%);
- automatic decision coverage: **76/80 = 95%**;
- accuracy among automatic decisions: **76/76 = 100%**;
- REVIEW_REQUIRED abstentions: **4/80 = 5%**;
- clean control: **100%** (gate >=95%);
- evidence precision: **180 TP / 0 FP = 100%** (gate >=95%);
- prohibited hard-gate violations: **0**.

The calibrated abstention margin is `0.00008`. The low-margin pairwise direction cases are routed to REVIEW_REQUIRED rather than emitted as confident wrong A/B decisions.

## Architecture

The trained private stack uses:

1. character n-gram TF-IDF representation;
2. balanced LinearSVC hierarchical specialist router;
3. one balanced LinearSVC leaf classifier per multi-label specialist;
4. constant deterministic leaf outputs for single-label specialists;
5. confidence-margin abstention to REVIEW_REQUIRED;
6. deterministic evidence-reference extraction that excludes `DECOY*` labels.

The 120B general judge is not the default classifier in this Gate C model.

## Private trained model

Private ZIP SHA-256:
`c6c171adac749757b004a8c24e336ba968769776b3f2065e4eee8a053ecdbb6b`

Contained model hashes:

- `vectorizer.joblib`: `1c91132a61f5dd100e69bce508ab4ff86fc7287330b95194e14ec288d4ab87fb`;
- `router.joblib`: `cb43dd7cc41490ee74ccaba1fb0db5f841b813dcfb6e57edabc74dedb0a33295`;
- `leaf-models.joblib`: `5e08794fc04cd793dabdd2d840d1db77a1fd3edcff166fe68e5ebb9ba4d0c69b`.

The private model package excludes raw training records, gold rows, provider corpus rows, and per-case scoring-private material.

Reproducible trainer:
`qualification/book-eval-lemonade-001/scripts/train-repair005-gate-c.py`

Trainer commit:
`30c37ff0e98827cfcc302fad210d978ea446eda7`

## Mandatory generalization diagnostic

A stricter 5-fold source-held-out diagnostic was also run, keeping every contrast derived from a held-out DEVELOPMENT source case out of that fold's training data while allowing independently generated synthetic records.

Results:

- source-held-out router accuracy: **51/80 = 63.75%**;
- source-held-out leaf accuracy with oracle specialist: **43/80 = 53.75%**;
- source-held-out end-to-end accuracy: **27/80 = 33.75%**;
- held-out cases whose specialist had no training examples in that fold: **2**.

These results mean Gate C has learned the DEVELOPMENT lane but **has not demonstrated unseen-source generalization**. The DEVELOPMENT gate therefore passes exactly as declared, but this model must not be promoted to visible-regression, fresh-holdout, or production qualification yet.

## Dependency-valid successor

**`BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D — SEMANTIC DISTILLATION + SOURCE-HELD-OUT GENERALIZATION / SELECTIVE 120B ESCALATION QUALIFICATION`**

Gate D must increase semantic diversity without using visible-regression or hidden-holdout gold. The preferred architecture is offline teacher-assisted distillation: use the 120B model only to create/verify DEVELOPMENT-authorized paraphrastic and semantic decision-fingerprint training variants, retrain the small hierarchical student, and qualify with source-held-out folds. Low-confidence cases may selectively escalate to the 120B judge, but the 120B model must not become the default flat evaluator. Gate D must close the missing-specialist coverage gaps and demonstrate materially stronger unseen-source routing/leaf performance before any visible-regression rerun is allowed.
