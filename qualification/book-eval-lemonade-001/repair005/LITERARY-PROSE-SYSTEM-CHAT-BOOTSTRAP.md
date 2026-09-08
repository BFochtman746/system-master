# LITERARY PROSE SYSTEM — New-Chat Bootstrap

## Objective

Start a separate System Master Books workstream:

**`LITERARY-PROSE-ENGINE-001 — LITERARY REFERENCE CORPUS + CRAFT INTELLIGENCE / PROSE OPTIMIZATION ARCHITECTURE`**

The goal is to build a first-class prose intelligence system that helps System Master draft, diagnose, revise, compare, and optimize prose while preserving the project's own voice, canon, intent, protected language, genre, audience, and scene/chapter purpose.

This is NOT an author-imitation system and NOT merely an evaluator. It should become shared Books infrastructure used by both writing and evaluation.

## Repository and source authority

Repository: `BFochtman746/system-master`

Read these existing artifacts first from branch `book-eval-lemonade-001-blind-resume-003-adapter-repair`:

1. `qualification/book-eval-lemonade-001/repair005/LITERARY-REFERENCE-CORPUS-CONTRACT-v1.json`
2. `qualification/book-eval-lemonade-001/repair005/CONTRASTIVE-JUDGE-TRAINING-RECORD-SCHEMA-v1.json`
3. `qualification/book-eval-lemonade-001/repair005/CONTRASTIVE-CURRICULUM-v1.json`
4. `qualification/book-eval-lemonade-001/repair005/BOOK-EVAL-HIERARCHICAL-SPECIALIST-TAXONOMY-v1.json`
5. `qualification/book-eval-lemonade-001/repair005/REPAIR-005-GATE-C-CLOSURE.md`

Create a separate prose-engine branch before writing implementation artifacts. Do not rewrite Book evaluator qualification history.

## Core design intent

Build a reusable Literary Reference + Craft Intelligence layer from:

- verified public-domain full text;
- properly licensed full text;
- user-owned or explicitly authorized material;
- analysis-only representations for works where full-text storage/use is not authorized;
- high-quality craft instruction and editorial principles with provenance;
- original synthetic contrasts and before/after revision examples;
- project-specific successful prose and user-approved revisions.

The system must learn transferable craft decisions and effects rather than memorizing or copying named authors.

## Required capability families

At minimum design for:

- sentence rhythm and length variation;
- syntax and paragraph movement;
- narrative distance and POV fidelity;
- interiority;
- sensory/concrete detail;
- imagery and metaphor coherence;
- dialogue subtext and character distinctiveness;
- exposition and information release;
- scene tension and conflict progression;
- setup/payoff;
- pacing and compression;
- clarity and controlled ambiguity;
- emotional progression;
- character goal pressure;
- motif/repetition control;
- openings/endings/transitions;
- voice consistency and register;
- rhetorical/argument structure for nonfiction.

## Architecture rule

Do not create one universal 'great prose' score.

Optimization must be conditional on:

- genre;
- form;
- audience;
- project voice profile;
- POV and narrative distance;
- scene/chapter function;
- pacing target;
- canon state;
- authorial intent;
- protected language.

A thriller, literary novel, memoir, children's book, romance, historical novel, and nonfiction argument should not converge toward one prose style.

## Required pipeline

Design toward:

`draft -> analyze -> retrieve relevant craft principles/abstract exemplars -> identify targeted opportunities -> generate revision candidates -> verify voice/canon/intent/protected language -> independent original-vs-revision comparison -> accept only measurable improvement or retain original`

Writer and evaluator roles must be logically separated.

## Reference representation

Prefer derived, voice-independent artifacts such as:

- CRAFT_PRINCIPLE;
- CONTRASTIVE_PAIR;
- TECHNIQUE_PROFILE;
- REVISION_TRANSFORM;
- HARD_NEGATIVE;
- REFERENCE_STATE.

Each reference record must include rights/provenance and a content digest.

## Copyright / rights boundary

Full text may be persisted only when the source is:

- verified public domain for the applicable use;
- licensed for the intended use;
- user-owned or explicitly authorized.

Otherwise persist only permitted bibliographic metadata, abstract craft analysis, technique descriptors, human-authored commentary, or other non-full-text representations. Do not create a corpus whose purpose is to imitate a living or named author.

## Evaluation relationship

The Book evaluator workstream is currently in:

**`BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D — SEMANTIC DISTILLATION + SOURCE-HELD-OUT GENERALIZATION / SELECTIVE 120B ESCALATION QUALIFICATION`**

Do not consume or expose scoring-private hidden-holdout gold. The prose-engine workstream may reuse public contracts and later contribute authorized craft/reference artifacts, but evaluator qualification evidence remains isolated.

## Execution behavior

Do the work through GitHub when possible. The user is not a programmer and should not be given manual terminal work unless unavoidable.

A-01 is a self-hosted Windows GitHub Actions runner. Treat it as an execution environment/milestone gate, not a per-turn test. Before starting a long A-01 job, check that no other authoritative System Master job is already using it.

## First dependency-valid objective

**`LITERARY-PROSE-ENGINE-001-STEP-A — CORPUS SOURCE TAXONOMY + RIGHTS/PROVENANCE LEDGER / CRAFT-ANNOTATION ONTOLOGY`**

STEP-A should define:

1. admissible source classes and rights evidence;
2. source/work/edition/passage identity and deduplication;
3. craft-technique annotation ontology;
4. derived-artifact schema;
5. genre/form/audience/scene-function conditioning dimensions;
6. project voice-profile schema;
7. prose quality dimensions and anti-overoptimization safeguards;
8. ingestion/analysis boundaries for public-domain, licensed, user-owned, and analysis-only works;
9. qualification gates proving no unauthorized full-text persistence and no author-imitation objective.

Do not begin by bulk-downloading books. Close STEP-A contracts and rights/provenance gates first.
