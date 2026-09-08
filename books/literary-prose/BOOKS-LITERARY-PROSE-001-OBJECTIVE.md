# BOOKS-LITERARY-PROSE-001 — Rights-Safe Literary Intelligence + Prose Optimization System

## Purpose

Build the System Master literary intelligence layer that can improve both prose creation/revision and Book-evaluator evidence construction without optimizing toward imitation of a named author.

This is a separate build thread/branch from `BOOK-EVAL-LEMONADE-001` qualification. It may reuse shared contracts but must not import scoring-private gold, retired hidden-holdout answers, or evaluator-private qualification material.

## Shared authority

Primary shared contract:

`qualification/book-eval-lemonade-001/repair005/LITERARY-REFERENCE-CORPUS-CONTRACT-v1.json`

Handoff note:

`qualification/book-eval-lemonade-001/repair005/PROSE-SYSTEM-HANDOFF-NOTE.md`

## Required architecture

The system must support:

1. rights/provenance-enforced literary reference ingestion;
2. full-text storage only for verified public-domain, licensed, or user-owned/authorized sources;
3. analysis/metadata/abstract-technique representations when full-text rights are insufficient;
4. craft-principle extraction independent of named-author identity;
5. technique profiles across sentence rhythm, syntax, paragraph movement, narrative distance, POV fidelity, interiority, sensory specificity, imagery, metaphor, dialogue, exposition, information release, tension, setup/payoff, transitions, pacing, clarity, ambiguity, emotional progression, motifs, openings/endings, repetition, voice consistency, register and rhetorical structure;
6. contrastive pairs, hard negatives, revision transforms and failure-mode examples;
7. project-specific voice/canon/intent/protected-language profiles;
8. logically separated Writer, Critic and Revision Comparator roles;
9. retrieve -> diagnose -> propose -> revise -> preserve -> independently compare -> accept-or-reject loop;
10. retention of the original prose whenever a proposed revision does not demonstrate measurable improvement;
11. genre/form/audience/passage-function conditioning rather than a single universal prose score;
12. reusable literary reference state for evaluator evidence construction without exposing evaluator gold.

## Non-goals / guardrails

- Do not build a corpus whose purpose is copying or imitating a named living author.
- Do not persist unauthorized copyrighted full text.
- Do not use evaluator scoring-private or hidden-holdout gold as prose-training material.
- Do not create a second disconnected Books architecture if an existing System Master writing/book component can be extended.
- Do not tune models before rights, provenance, representation, retrieval, evaluation and acceptance contracts are specified.

## Exact next objective

**`BOOKS-LITERARY-PROSE-001-FOUNDATION-001 — EXISTING WRITING/BOOK COMPONENT FORENSIC INVENTORY + RIGHTS-SAFE REFERENCE CORPUS / PROSE OPTIMIZER ARCHITECTURE BIND`**

Execution requirements:

- inspect the repository for all existing Books, writing, story-bible, research/evidence, artifact, retrieval, embedding/indexing and generation components;
- identify what is reusable, missing, overlapping or conflicting;
- bind the Literary Reference Corpus Contract into the existing System Master architecture rather than creating parallel authority;
- define the source/rights/provenance record, derived craft-artifact record, technique-profile record, project-voice profile, retrieval contract, Writer/Critic/Comparator interfaces and improvement acceptance contract;
- define build order and qualification gates;
- then implement the smallest dependency-valid foundation slice;
- preserve all work on branch `books-literary-prose-001`.

## Initial standing

**ACTIVE / BOOTSTRAPPED — READY FOR FOUNDATION-001**
