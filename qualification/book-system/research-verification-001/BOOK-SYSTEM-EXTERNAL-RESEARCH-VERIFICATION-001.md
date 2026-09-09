# BOOK-SYSTEM-EXTERNAL-RESEARCH-VERIFICATION-001

Date: 2026-09-09  
Owner: BOOK SYSTEM  
Control branch: `book-system/control-v1`  
Standing: `COMPLETE__PREIMPLEMENTATION_RESEARCH_VERIFICATION__REMEDIATION_REQUIRED_BEFORE_MORE_RUNTIME_IMPLEMENTATION`

## Purpose

Before implementing additional Book System parent runtime, verify the recovered architecture against current external evidence rather than assuming the internal design is sufficient. This review tests what should be kept, what should be refined or added before coding, and what should explicitly not be added because it would duplicate or weaken existing authority.

This review does **not** transfer external claims into Book System authority by citation alone. It informs parent architecture. Existing exact-SHA A-01 qualification remains exact to its tested subject SHAs.

## Internal architecture reviewed

- `BOOK-SYSTEM-BOOK-INTELLIGENCE-UNIFICATION-BINDING-001`
- `BOOK-SYSTEM-AUTHORING-LIFECYCLE-CONTRACT-001`
- `BOOK-SYSTEM-CANONICAL-BOOK-STATE-MODEL-001`
- `BOOK-SYSTEM-SERVICE-INTERFACE-REGISTRY-001`
- `BOOK-SYSTEM-LIFECYCLE-TRANSITION-ENGINE-001`
- `BOOK-SYSTEM-INTEGRATION-PROPOSAL-RUNTIME-001` contract (implementation not yet qualified)
- Creative Excellence 012-019 recovered lineage
- Literary Prose A-L / Prose Project recovered lineage

## External evidence set

### Professional and academic writing / editing practice

1. University of Iowa Writers' Workshop / 2026-27 Creative Writing catalog and undergraduate workshop pages. Current curriculum explicitly includes workshop critique, close reading of published work, advanced fiction, sentence-level craft, revision, form of fiction, novel writing and manuscript-based feedback.
   - https://catalog.registrar.uiowa.edu/liberal-arts-sciences/creative-writing-iowa-writers-workshop/
   - https://catalog.registrar.uiowa.edu/courses/cw/
   - https://writersworkshop.uiowa.edu/undergraduate
2. Editors Canada, *Professional Editorial Standards 2024*. The professional workflow distinguishes structural editing, stylistic editing, copy editing and proofreading, with fiction-, audience-, legal-, ethical-, accessibility- and production-aware responsibilities.
   - https://editors.ca/publications/professional-editorial-standards/
   - https://editors.ca/publications/professional-editorial-standards/fundamentals-editing/
   - https://editors.ca/publications/professional-editorial-standards/structural-editing/
   - https://editors.ca/publications/professional-editorial-standards/stylistic-editing/
   - https://editors.ca/publications/professional-editorial-standards/copy-editing/
   - https://editors.ca/publications/professional-editorial-standards/proofreading/
3. Chartered Institute of Editing and Proofreading (CIEP), publishing workflow. It separates author-final-draft, copy/line editing, layout, proofreading and publication, and recognizes later-edition change handling.
   - https://www.ciep.uk/learn-and-develop/the-ciep-competency-framework/the-publishing-workflow.html

### Long-form narrative and computational-literary research

4. Wang et al., NAACL 2025, *Generating Long-form Story Using Dynamic Hierarchical Outlining with Memory-Enhancement*. Long-form quality improves when hierarchical planning is dynamic and coupled to persistent memory / temporal knowledge and conflict analysis rather than relying on a flat rigid outline.
   - https://aclanthology.org/2025.naacl-long.63/
5. Li et al., Findings of ACL 2026, *Lost in Stories: Consistency Bugs in Long Story Generation by LLMs*. Long narratives remain vulnerable to contradictions in facts, traits and world rules; the paper introduces a consistency benchmark and evidence-grounded contradiction checking.
   - https://aclanthology.org/2026.findings-acl.410/
6. Bae & Kim, EMNLP 2024, *Collective Critics for Creative Story Generation*. Multi-stage planning/generation plus multiple critics improves long-form creativity and expressiveness beyond coherence-only optimization.
   - https://aclanthology.org/2024.emnlp-main.1046/
7. BookNLP and LitBank. Book-scale literary analysis benefits from explicit entities, character clustering/coreference, events, quotations and speaker attribution; accurate book-length coreference remains imperfect and should retain uncertainty / evidence rather than silently canonize model output.
   - https://github.com/booknlp/booknlp
   - https://github.com/dbamman/litbank

### Evaluation reliability and AI-writing risk

8. Shi et al., IJCNLP/AACL 2025, *Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge*. Pairwise/listwise LLM judging exhibits measurable position bias; repetition stability and position consistency matter.
   - https://aclanthology.org/2025.ijcnlp-long.18/
9. Li et al., ACL 2025, *CalibraEval*. LLM pairwise judging can show selection bias under option/token swapping; evaluation should not assume a single ordering or judge is authoritative.
   - https://aclanthology.org/2025.acl-long.808/
10. Doshi & Hauser, *Science Advances* 2024. Generative-AI assistance can increase individual short-story quality while reducing collective novelty/diversity.
    - DOI: 10.1126/sciadv.adn5290
11. Sourati et al. / Nature Human Behaviour 2026 reporting on large-scale linguistic diversity. AI writing assistance is associated with reduced linguistic diversity and shifts in identity signals while preserving much of the semantic content.
    - https://www.nature.com/articles/s41562-026-02549-7
12. *Computers in Human Behavior: Artificial Humans* 2025, preregistered evidence of AI-related creative homogenization across thousands of essays.
    - https://www.sciencedirect.com/science/article/pii/S294988212500091X

### Provenance / publication interoperability

13. W3C PROV-O Recommendation. Provenance can be represented as interoperable entities, activities, agents and derivations rather than as unstructured notes.
    - https://www.w3.org/TR/prov-o/
14. C2PA Content Credentials 2.4. Current provenance standards preserve an asset's change history and can add cryptographically verifiable provenance / attestations. This is useful at export/distribution boundaries, but should not replace the Book System's parent ledger.
    - https://spec.c2pa.org/specifications/
15. W3C EPUB 3.3 Recommendation (2026) and EPUB Accessibility guidance. EPUB 3.3 is the current W3C digital-publication format; accessibility is tied to EPUB Accessibility 1.1 / WCAG-based requirements.
    - https://www.w3.org/TR/epub-33/
    - https://www.w3.org/publishing/epub3/
16. ONIX for Books 3.1 / current 3.1.2 guidance. ONIX is the international book-supply-chain metadata format for identifiers, contributors, descriptions, subjects, pricing and availability.
    - https://www.loc.gov/preservation/digital/formats/fdd/fdd000488.shtml
    - https://bic.org.uk/resources/onix-for-books/

## Findings

### KEEP — externally reinforced

1. **Federated Book Intelligence architecture.** Keep Creative Excellence granular/whole-book evidence separate from the Prose Project execution loop. External evidence favors distinct planning, memory, analysis, critic and revision roles rather than one undifferentiated generator.
2. **Macro / meso / micro planning and narrative state.** Keep book -> chapter/scene -> passage analysis, with dynamic plan revision rather than a frozen outline.
3. **Persistent canon/story-bible and conflict detection.** Keep explicit character, world, event, relationship, setup/payoff and temporal state with evidence-grounded contradiction detection.
4. **Uncertainty-preserving narrative extraction.** Keep source-heldout calibration, abstention and human adjudication for difficult extraction. BookNLP itself acknowledges that book-length coreference remains imperfect.
5. **Independent evaluator / comparator.** Keep writer and evaluator separated. Keep pairwise swap, repetition stability, disagreement preservation and abstention. Do not promote a single LLM judge to authority.
6. **Voice / intent / protected-language preservation.** Keep project-specific voice and protected-language constraints as first-class authority.
7. **Anti-homogenization defense.** Keep and strengthen it. 2024-2026 evidence makes this a central design requirement, not an optional stylistic preference.
8. **Immutable provenance, exact versions and rollback.** Keep the parent ledger, exact digests, immutable proposal snapshots and rollback identities.
9. **Provider SUCCESS != admission.** Keep the parent admission boundary. External reliability evidence strengthens the case for evidence/proposal handoff instead of automatic canonical mutation.
10. **Rights-aware reference corpus.** Keep rights/provenance gating and avoid unrestricted copyrighted full-text acquisition or named-author imitation.

### ADD / REFINE — required before more parent runtime implementation

#### R1 — Explicit professional editorial-stage architecture

The Book System currently has powerful evaluation and prose revision capability, but the parent lifecycle does not explicitly distinguish the professional stages recognized by contemporary editorial standards.

Add parent-visible stages/capabilities for:

- `STRUCTURAL_EDIT_REVIEW`
- `STYLISTIC_OR_LINE_EDIT_REVIEW`
- `COPY_EDIT_REVIEW`
- `POST_LAYOUT_PROOFREAD_REVIEW`

Rules:

- These are responsibility/stage boundaries, not four new projects.
- Existing Creative Excellence / Prose / Book Evaluator capabilities should be crosswalked into these stages before new implementation is created.
- A later stage must verify that required prior-stage edits were applied and that new errors were not introduced.
- Proofreading must be performed against the intended rendered medium whenever possible; it must not silently reopen structural editing unless authorized.
- Fiction exceptions, author intent, style-sheet authority, audience, legal/ethical, copyright/permissions and accessibility checks must be preserved.

#### R2 — Author workshop / craft-calibration evidence mode

Do not create another generic writing rubric. Extend the existing Craft Academy / author-review model with a bounded evidence mode that can support:

- close reading of authorized/public-domain exemplars from a writer's standpoint;
- manuscript critique tied to specific craft objectives;
- revision rationale (what changed, why, intended reader effect);
- sentence-level and form-level practice;
- author acceptance/rejection plus preference learning without overwriting voice.

This is a refinement of Prose/Craft Academy and author review, not a new parent project or automatic canonical mutation path.

#### R3 — Publication/export standards profile

Before `BOOK-SYSTEM-EXPORT-FREEZE-001`, define a versioned Book System publication profile that supports at minimum:

- EPUB 3.3 conformance for digital-book export where EPUB is requested;
- EPUB Accessibility 1.1 / applicable WCAG-derived checks and required accessibility metadata;
- ONIX 3.1-compatible product metadata projection when distribution metadata is needed;
- medium-specific final proof after layout/rendering;
- deterministic artifact digest and exact source-manuscript version binding.

Print/PDF/DOCX can remain supported outputs, but they should have their own target-medium verification rather than inheriting EPUB assumptions.

#### R4 — Provenance interoperability projection

Keep the existing Book System ledger as canonical internal authority. Add an optional interoperable projection:

- W3C PROV-compatible mapping for entity/activity/agent/derivation relationships;
- optional C2PA/Content Credentials attachment for exported assets where format/tooling support is appropriate.

Do **not** make C2PA a required internal authoring-state dependency; it is an export/provenance interoperability option, not a replacement ledger.

#### R5 — Consistency-regression gate

Before an accepted manuscript revision can become canonical at chapter/book scope, require regression across affected narrative dependencies:

- facts/world rules;
- character identity/traits/knowledge state;
- events/temporal order;
- relationships;
- setup/payoff/open questions;
- quotations/speaker attribution where relevant;
- downstream chapters/scenes invalidated by the change.

The existing transition engine already supports transitive invalidation; this research finding requires the narrative consistency checks to be explicitly bound to that invalidation path.

#### R6 — Research-before-implementation control rule

For major Book System architecture or capability additions, the parent plan must perform an external research/standards verification pass before executable implementation unless the change is strictly a repair of already-qualified behavior. The pass must classify evidence as KEEP, ADD/REFINE, DO-NOT-ADD and unresolved; it must not treat popularity or a single source as authority.

### DO NOT ADD

1. Do not build another universal prose score or one-dimensional quality scalar.
2. Do not create a second whole-book evaluator when recovered Creative Excellence owns that architecture.
3. Do not create another generic prose rubric when Creative Excellence 012 + current Prose specialists already own the detailed craft space.
4. Do not use a single LLM judge or a single candidate ordering as authoritative.
5. Do not optimize toward generic model-preferred style; preserve author/project voice and measure homogenization risk.
6. Do not auto-rewrite canon from evaluator/provider output.
7. Do not replace parent provenance/version authority with C2PA, ONIX, EPUB metadata or any external interchange format.
8. Do not store unauthorized copyrighted reference corpora merely because an external training source is pedagogically useful.
9. Do not conflate copy editing/proofreading with developmental or structural editing; later-stage corrections must remain bounded.

## Net assessment

The core Book System architecture is **substantially validated**, not disproved. Its strongest design decisions — hierarchical narrative state, explicit canon, federated analysis/execution, independent evaluation, abstention/disagreement preservation, author authority, anti-homogenization, immutable provenance, exact-SHA qualification and no provider-to-canon path — are consistent with current external evidence.

The principal missing architecture is **professional editorial/production staging and standards-aware publication closure**, plus an explicit narrative-consistency regression binding and an author-workshop/craft-calibration refinement. These are targeted additions to the parent lifecycle; they do not justify rebuilding Creative Excellence, Prose, Book Evaluator, or the qualified state/transition foundation.

## Implementation effect

`BOOK-SYSTEM-INTEGRATION-PROPOSAL-RUNTIME-001` executable implementation is **PAUSED** until the parent architecture remediation created from R1-R6 is complete. The existing runtime contract remains preserved as design evidence and should be amended only where the remediation changes its required interfaces.

## Exact next objective

`BOOK-SYSTEM-RESEARCH-VERIFIED-ARCHITECTURE-REMEDIATION-001`

Required closure:

1. Crosswalk existing Creative Excellence, Prose and Book Evaluator capabilities to the four professional editorial stages before creating new capability.
2. Amend parent authoring lifecycle / successor roadmap with explicit editorial-stage and consistency-regression gates.
3. Define publication/export standards profile (EPUB 3.3, accessibility, ONIX projection, medium-specific proof).
4. Define provenance interoperability projection without replacing the internal ledger.
5. Bind the research-before-implementation rule into parent control routing.
6. Re-evaluate `BOOK-SYSTEM-INTEGRATION-PROPOSAL-RUNTIME-001` contract against the amended lifecycle and update it only if an interface change is necessary.
7. Only then resume executable integration-runtime implementation and A-01 qualification.
