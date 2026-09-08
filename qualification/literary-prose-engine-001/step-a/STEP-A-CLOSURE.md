# LITERARY-PROSE-ENGINE-001-STEP-A - Closure

## Standing

**PASS_CONTRACT_AND_STATIC_QUALIFICATION__NO_CORPUS_INGESTION_STARTED**

STEP-A establishes the rights-first architecture required before System Master acquires or derives a Literary Reference Corpus. No bulk books were downloaded and no evaluator qualification history was modified.

## What STEP-A closes

1. **Admissible sources and rights evidence** - four source classes are retained from the evaluator's Literary Reference Corpus authority, but admission is now machine-addressable through a rights/provenance ledger schema. Public-domain status must be jurisdiction/use verified; licenses and user authorization are scope-bound; ambiguous rights do not default to admission.
2. **Identity and deduplication** - work, edition, source and passage are distinct identity layers. Exact duplicates share payloads without multiplying weight; near duplicates require deterministic confirmation; translations/revisions remain distinct; overlap groups cannot leak across generalization splits.
3. **Craft ontology** - technique annotations span micro-language, paragraph flow, POV/distance, description/image, dialogue/character, scene/narrative, exposition/argument and preservation. Annotations encode mechanisms and effects under context rather than prestige or author identity.
4. **Derived literary intelligence** - schemas exist for CRAFT_PRINCIPLE, CONTRASTIVE_PAIR, TECHNIQUE_PROFILE, REVISION_TRANSFORM, HARD_NEGATIVE and REFERENCE_STATE, all provenance- and digest-bound. Analysis-only derivations must be nonreconstructive.
5. **Conditioning** - genre, form, audience, POV, narrative distance, scene function, pacing target, project voice, canon, intent and protected language are first-class conditions.
6. **Project voice** - voice is represented from the user's brief, authorized project samples and user-approved revisions. Named-author or nearest-author targeting is hard-disabled.
7. **Quality** - there is no universal `great prose` scalar. Improvement is multi-objective and conditional, with preservation hard gates and explicit tradeoffs.
8. **Anti-overoptimization** - bounded edit scope, dimension deltas, clean controls, hard negatives, baseline drift checks, position-swapped comparisons and `RETAIN_ORIGINAL` on uncertainty are required.
9. **Ingestion boundaries** - public-domain/licensed/user-authorized sources may persist only within evidence scope. Analysis-only works may contribute metadata and nonreconstructive craft analysis but no persistent raw full text/passages.
10. **Qualification gates** - unauthorized persistence, author imitation, universal-score optimization, writer/evaluator collapse, hidden-holdout use and premature bulk acquisition are hard failures/blocks.
11. **Book evaluator bridge** - the Literary Reference Engine may later supply authorized craft/reference artifacts to generation/revision and the independent evaluator; hidden scoring gold remains isolated and evaluator history is not rewritten.

## Validation

`validate_step_a.py` is a zero-dependency static validator that checks JSON readability and the cross-contract invariants above. STEP-A does not require A-01 execution. The shared runner was occupied by the authoritative Book evaluator Gate D teacher-distillation run while this step was executed, so no competing job was started.

## Boundary

This closure qualifies contracts and static invariants only. It does **not** qualify a real corpus, an ingestion service, a retrieval index, a prose generator, a revision model, or evaluator performance. Those remain downstream objectives.

## Exact dependency-valid next objective

**LITERARY-PROSE-ENGINE-001-STEP-B - ADMISSION CONTROLLER + REFERENCE INGESTION / DERIVATION PIPELINE QUALIFICATION**

STEP-B should implement source-by-source admission, evidence verification hooks, transient-vs-persistent text handling, dedup/overlap enforcement, derived-only redaction/nonreconstructive checks, and small fixture-based qualification using only synthetic/user-authorized or clearly reusable test fixtures. It must still avoid bulk book acquisition.
