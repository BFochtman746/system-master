# LITERARY-PROSE-ENGINE-001 STEP-A - Research Basis

Date: 2026-09-08

## Scope

This research supports architecture decisions for source admission, craft representation, voice preservation, revision evaluation, and the Book evaluator bridge. It is not itself rights evidence for ingesting any literary full text. Rights admission remains source-specific and governed by the rights ledger.

## Findings applied

1. **Computational stylistics should be feature-based, not author-target based.** Stylometry has long represented writing style through multidimensional lexical, character, syntactic and distributional features. STEP-A uses those ideas only to describe project voice and technique profiles; external author identity is explicitly excluded as an optimization target.
   - Stamatatos, *A survey of modern authorship attribution methods* (2009), DOI 10.1002/asi.21001: https://doi.org/10.1002/asi.21001
   - Eder, Rybicki, Kestemont, *Stylometry with R* (2016), DOI 10.32614/RJ-2016-007: https://doi.org/10.32614/RJ-2016-007

2. **Literary text requires narrative-domain representations.** Literary NLP research shows that events, entities, coreference, quotation attribution, character relationships, knowledge propagation, figurative language and mental-state depiction behave differently from news-domain NLP. STEP-A therefore includes narrative function, knowledge boundary, POV/distance, dialogue, event density, character goals and relationship pressure.
   - Sims, Park, Bamman, *Literary Event Detection* (ACL 2019), DOI 10.18653/v1/P19-1353: https://aclanthology.org/P19-1353/
   - Bamman, Popat, Shen, *An Annotated Dataset of Literary Entities* (NAACL 2019), DOI 10.18653/v1/N19-1220: https://aclanthology.org/N19-1220/
   - LitBank project/dataset: https://github.com/dbamman/litbank

3. **Retrieval should externalize craft knowledge and preserve provenance.** RAG demonstrates the value of explicit non-parametric memory with provenance and updateability. The prose engine will retrieve craft principles, technique profiles and only authorized exemplars rather than depend on memorized literary text.
   - Lewis et al., *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks* (NeurIPS 2020): https://papers.nips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html

4. **Revision should be closed-loop and outcome tested.** Research on automated writing feedback shows that models can give useful feedback but can miss the most important problem and can miscalibrate criticism; other work evaluates feedback by the quality of resulting revisions. STEP-A separates diagnosis, candidate generation and independent comparison, with retention of the original when improvement is not demonstrated.
   - Rashkin et al., *Help Me Write a Story: Evaluating LLMs' Ability to Generate Writing Feedback* (ACL 2025), DOI 10.18653/v1/2025.acl-long.1254: https://aclanthology.org/2025.acl-long.1254/
   - Nair et al., *Closing the Loop: Learning to Generate Writing Feedback via Language Model Simulated Student Revisions* (EMNLP 2024), DOI 10.18653/v1/2024.emnlp-main.928: https://aclanthology.org/2024.emnlp-main.928/
   - Du et al., *Read, Revise, Repeat* (In2Writing 2022): https://aclanthology.org/2022.in2writing-1.14/

5. **Professional editing practice supports preservation constraints and staged independent review.** Editors Canada requires edits to reflect audience, medium and purpose; maintain consistent voice, tone and register without altering intended meaning; and verify earlier edits did not introduce new problems. STEP-A encodes those as hard preservation checks rather than optional style preferences.
   - Editors Canada, Professional Editorial Standards 2024: https://editors.ca/publications/professional-editorial-standards/
   - Fundamentals of Editing, especially A2.5 and A13.1: https://editors.ca/publications/professional-editorial-standards/fundamentals-editing/
   - Stylistic Editing, especially C3.1: https://editors.ca/publications/professional-editorial-standards/stylistic-editing/

6. **Pairwise evaluation needs anti-bias controls.** Recent studies document position bias in LLM judges. STEP-A requires position-swapped comparisons, consistency checks, abstention/review routing, and separation of the writer's rationale from the evaluator.
   - Shi et al., *Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge* (IJCNLP-AACL 2025), DOI 10.18653/v1/2025.ijcnlp-long.18: https://aclanthology.org/2025.ijcnlp-long.18/
   - Zhang et al., *UDA: Unsupervised Debiasing Alignment for Pair-wise LLM-as-a-Judge* (AAAI 2026), DOI 10.1609/aaai.v40i41.40788: https://ojs.aaai.org/index.php/AAAI/article/view/40788

7. **Preference pairs are useful, but the target must remain conditioned and bounded.** DPO shows that pairwise preferences can directly shape model behavior. The prose engine's contrastive pairs therefore include governing context, hard negatives and tradeoff labels rather than an unconditioned better/worse notion.
   - Rafailov et al., *Direct Preference Optimization* (NeurIPS 2023): https://papers.nips.cc/paper/2023/hash/a85b405ed65c6477a4fe8302b5e06ce7-Abstract-Conference.html

8. **Overoptimizing a proxy can reduce true quality.** Reward-model research demonstrates Goodhart-style degradation under excessive optimization. STEP-A forbids a universal prose score, limits revision scope, tracks dimension/preservation deltas, uses clean controls, and periodically checks for voice homogenization.
   - Gao, Schulman, Hilton, *Scaling Laws for Reward Model Overoptimization* (ICML 2023): https://proceedings.mlr.press/v202/gao23h.html

9. **Rights evidence must be source-, edition-, jurisdiction- and use-specific.** U.S. copyright duration is not a single age rule; older works require status investigation. Project Gutenberg also warns that its U.S.-law status and its own trademark/license wrapper must be distinguished. Creative Commons licenses vary in commercial, derivative and share-alike permissions. STEP-A therefore stores evidence type, jurisdiction, terms digest, permitted uses and expiration/scope instead of a bare `public_domain=true`.
   - U.S. Copyright Office, Circular 15A (2026): https://www.copyright.gov/circs/circ15a.pdf
   - U.S. Copyright Office, Circular 22 (2026): https://www.copyright.gov/circs/circ22.pdf
   - Project Gutenberg License: https://www.gutenberg.org/policy/license
   - Creative Commons license chooser and license features: https://creativecommons.org/chooser/

10. **Human agency and ownership favor project-specific control.** Recent creative-writing research finds that writer editing and iterative control contribute to psychological ownership. STEP-A therefore treats user brief, authorized project samples and user-approved revisions as the authority for project voice, not external literary prestige.
   - Pennanen, Kanerva, Guckelsberger, *How prompting and editing shape psychological ownership in AI-assisted creative writing* (2026), DOI 10.1016/j.chbah.2026.100381.

## Resulting architectural commitments

- Rights-first admission before text persistence.
- Work/edition/source/passage identity with exact and near-duplicate controls.
- Craft annotations describe transferable mechanisms/effects with context.
- Derived artifacts are provenance-linked and nonreconstructive for analysis-only sources.
- Project voice is learned only from the user's project authority and authorized project text.
- Quality is a conditioned vector of dimensions plus hard preservation constraints, never one universal score.
- Revision acceptance is independent, pairwise, position-swapped, thresholded and allowed to choose no change.
- Literary intelligence can serve both writing and evaluation, but hidden evaluator gold remains inaccessible.
