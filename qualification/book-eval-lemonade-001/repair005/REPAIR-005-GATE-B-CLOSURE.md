# BOOK-EVAL-LEMONADE-001-REPAIR-005 — Gate B Closure

## Standing

**PASS_GATE_B_PRIVATE_CONTRASTIVE_CORPUS**

Gate B compiled and qualified the first private hierarchical/contrastive training corpus from DEVELOPMENT-only authority plus deterministic original synthetic boundary cases.

## Qualified private corpus

- DEVELOPMENT source cases: **80**.
- Total training records: **612**.
- DEVELOPMENT_ORIGINAL contrasts: **451**.
- DEVELOPMENT_DERIVED position-swapped records: **39**.
- Original SYNTHETIC boundary records: **122**.
- Training corpus SHA-256: `0e3d237405340ae1abf0706c88c39275360c8c9380388b4f53d73275f4f38473`.
- Sealed private ZIP SHA-256: `598a73178167f9b46e57899e7c35696241bb20f282fc8dc48995a4bdfc24d1f6`.

The private JSONL corpus and its sealed ZIP are deliberately **not committed to GitHub**. GitHub contains only the reproducible compiler, rights manifest, curriculum/schema/taxonomy contracts, and aggregate non-sensitive qualification evidence.

## Quality gates

- schema-valid records: **612/612 = 100%**;
- schema-invalid records: **0**;
- hard-negative present: **100%**;
- counterfactual present: **100%**;
- rights/provenance present: **100%**;
- pairwise position-swap coverage: **100%**;
- hidden-holdout IDs present: **0**;
- visible-regression IDs present: **0**;
- hidden-holdout gold used: **false**;
- scoring-private raw rows persisted into training corpus: **false**;
- provider-facing: **false**.

## Curriculum coverage

All predeclared minimums are satisfied:

- EPISTEMIC-KNOWLEDGE-POV: **24 / 24**;
- TIME-CONTINUITY: **30 / 30**;
- OBJECT-LOCATION-STATE: **30 / 30**;
- FACT-SOURCE-SUPPORT: **50 / 50**;
- STRUCTURAL-CAUSE-GOAL-PAYOFF: **60 / 60**;
- REVISION-MEANING-INTENT-SAFE: **36 / 36**;
- PAIR-PREFERENCE-OBJECTIVE: **32 / 32**;
- PAIR-TRADEOFF-PREFERENCE: **46 / 36**.

The 122 synthetic records were generated only to close measured curriculum deficits. They are deterministic original System Master examples and contain no external literary text.

## Rights/provenance standing

The canonical BOOK-EVAL v2 corpus is bound as `USER_OWNED_OR_AUTHORIZED` for DEVELOPMENT contrastive training and deterministic derivation. Gate B introduces **no masterpiece/full-text literary corpus** and no unauthorized copyrighted prose.

The Literary Reference Corpus Contract remains authoritative for later reference-corpus ingestion: public-domain, licensed, or user-authorized full text may be stored; otherwise only analysis/metadata/abstract craft representations may persist.

## Reproducibility

Compiler:
`qualification/book-eval-lemonade-001/scripts/compile-repair005-gate-b.py`

Compiler commit:
`24990324203bbd31fbdc14fa3d87c111b3b917f8`

Rights manifest:
`qualification/book-eval-lemonade-001/repair005/TRAINING-SOURCE-RIGHTS-MANIFEST-v1.json`

Aggregate manifest:
`qualification/book-eval-lemonade-001/repair005/BOOK-EVAL-REPAIR-005-GATE-B-AGGREGATE-MANIFEST.json`

Private source bindings:

- scoring-private package SHA-256: `1091d409b5167463325ff85764bdd9b62c0e96cf9a9bef5f03445616c6b81940`;
- gold corpus SHA-256: `51cd4790ddd89d067a6e85ee6c6f3092ec3a6fba94faac8e77e31041277da91a`;
- provider corpus SHA-256: `30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53`;
- repaired DEVELOPMENT v2 output SHA-256: `b445acb8764661eea8c0969a7a52c4d73e86bc5bfb7b4ad082125fed875e4ce8`.

## Dependency-valid successor

**`BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-C — HIERARCHICAL ROUTER + SPECIALIST LEAF CLASSIFIER TRAINING / DEVELOPMENT QUALIFICATION`**

Gate C must train or otherwise adapt the router and specialist leaf classifiers using the Gate B private corpus, then qualify on DEVELOPMENT with the predeclared advancement gates: router accuracy >=95%, leaf accuracy >=85%, clean control >=95%, evidence precision >=95%, and zero prohibited hard-gate violations. The 120B general judge should remain an escalation/fallback path rather than the default flat classifier.
