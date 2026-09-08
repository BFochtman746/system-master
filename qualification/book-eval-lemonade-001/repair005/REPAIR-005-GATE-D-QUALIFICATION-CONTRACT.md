# BOOK-EVAL-LEMONADE-001-REPAIR-005 — Gate D Qualification Contract

## Objective

**`BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D — SEMANTIC DISTILLATION + SOURCE-HELD-OUT GENERALIZATION / SELECTIVE 120B ESCALATION QUALIFICATION`**

This contract is frozen before scoring the Gate D teacher-distilled student.

## Authority and contamination boundary

Allowed adaptive-training sources:

- Gate B DEVELOPMENT-derived contrastive corpus;
- deterministic original synthetic cases;
- Gate D 120B teacher-generated original synthetic cases produced from ontology/curriculum definitions only;
- provider-visible DEVELOPMENT case text only when a fold is not holding that source case out.

Forbidden during Gate D training/tuning:

- VISIBLE_REGRESSION gold;
- retired HIDDEN_HOLDOUT gold;
- any new sealed holdout;
- scoring-private rows in provider-facing prompts;
- unauthorized copyrighted literary full text.

The 120B teacher may know the target ontology token for a synthetic generation request. It must not receive any gold answer for a real DEVELOPMENT, VISIBLE_REGRESSION, or HIDDEN_HOLDOUT case.

## Source-held-out protocol

Use deterministic 5-fold source-held-out qualification over the 80 DEVELOPMENT cases.

For each fold:

1. every training record derived from a held-out DEVELOPMENT source case is excluded;
2. independently generated synthetic records may remain in training;
3. no held-out case label/text derivative may be used to tune that fold's student;
4. task mode is provider-visible and may be used deterministically;
5. output must preserve per-case router, leaf, confidence/margin, abstention, and evidence-reference decisions.

## Baseline to beat

Gate C source-held-out diagnostic:

- router accuracy: **63.75%**;
- oracle-specialist leaf accuracy: **53.75%**;
- end-to-end exact accuracy: **33.75%**;
- missing-specialist held-out cases: **2**.

## Gate D student advancement gates

The distilled student may advance to selective-escalation qualification only if all are true:

- source-held-out specialist router accuracy **>= 85%**;
- source-held-out leaf accuracy with oracle specialist **>= 80%**;
- source-held-out end-to-end exact accuracy **>= 70%**;
- held-out missing-specialist cases **= 0**;
- clean-control accuracy **>= 95%**;
- evidence precision **>= 95%**;
- prohibited hard-gate violations **= 0**.

A result below any threshold remains developmental and must not trigger VISIBLE_REGRESSION or fresh-holdout qualification.

## Selective 120B escalation gate

After the student clears the advancement gates, qualify a selective escalation policy on source-held-out DEVELOPMENT predictions.

Requirements:

- low-confidence router or leaf cases may emit `REVIEW_REQUIRED` and escalate;
- 120B must not be the default flat evaluator;
- automatic student decisions must achieve **>= 90% exact accuracy**;
- automatic student coverage must be **>= 65%**;
- total 120B escalation rate must be **<= 35%**;
- combined student + escalation end-to-end exact accuracy must be **>= 85%** on the source-held-out DEVELOPMENT diagnostic;
- pairwise A/B position-swap behavior must remain symmetric after escalation;
- clean control must remain **>= 95%**;
- prohibited hard-gate violations must remain **0**.

If these gates fail, Gate D remains open and the next repair must improve semantic representation/training diversity rather than rerun VISIBLE_REGRESSION.

## Promotion rule

Passing Gate D does **not** establish production qualification. It only permits one explicit VISIBLE_REGRESSION revalidation. A production/90% claim still requires a newly created unseen sealed holdout because the original hidden holdout is retired.
