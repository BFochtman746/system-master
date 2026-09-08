# LEARNING-LAB-IMPL-006 — BOUNDED OPEN-GOAL RESEARCH + GENERATIVE COURSE COMPILER SLICE

**Status:** `PASS_PORTABLE_IMPLEMENTATION`  
**Date:** 2026-09-07  
**Native/device qualification:** `NOT_RUN`  
**Production System Master integration:** `NOT_RUN`

## Objective

Move the Learning Lab from a registry of prebuilt domains to the first executable bounded open-goal path:

`NEW GOAL -> INTERPRET/BOUND -> RESEARCH PLAN -> SOURCE ACQUISITION -> CLAIM DOSSIER -> DYNAMIC DOMAIN SPEC -> SKILL/PREQ MAP -> COURSE -> LESSON/PRACTICE/ASSESSMENT -> INDEPENDENT VALIDATION -> TUTOR -> RETENTION -> TRANSFER`

The proof requirement was that the engine must start without the third domain registered, receive new research data at runtime, compile a course/domain from that data, and then use the same Learning evidence/Tutor/retention/transfer core already qualified through IMPL-005.

## Previously unseen third-domain proof

Qualification goal:

`Query a SQLite tasks table with SELECT, filter rows with WHERE, and sort results with ORDER BY.`

At engine startup the domain registry contains only:

- `fractions-unlike-denominators`
- `git-feature-branch-workflow`

Adding the SQLite research bundle to `RuntimeResearchCorpus` does **not** mutate the domain registry. `sqlite-query-fundamentals` appears only after the open-goal interpreter selects the runtime evidence, the research planner/source acquirer produce a pinned dossier, and the open-goal compiler constructs and registers a `DomainSpec`.

## Research evidence

The portable third-domain source bundle is frozen from current official SQLite documentation:

- `https://www.sqlite.org/lang_select.html`
- `https://www.sqlite.org/lang_expr.html`

The admitted claims cover:

- SELECT result-column behavior;
- WHERE row filtering;
- comparison expressions used by WHERE;
- undefined multi-row output order without ORDER BY;
- ASC/DESC ordering;
- multi-key ORDER BY tie breaking.

`evidence/sqlite_source_acquisition_receipt.json` records the acquisition boundary. The portable runtime replays this bounded research corpus; it does **not** claim live web research at runtime.

## New implementation units

### `learning_lab/open_goal.py`

Implements:

- `RuntimeResearchCorpus`
- `BoundedGoalInterpreter`
- `OpenGoalResearchPlanner`
- `OpenGoalSourceAcquirer`
- `DeclarativeSQLiteOracle`
- data-driven `compile_course_from_dossier`
- dynamic Tutor policy construction
- `domain_spec_from_dossier`
- `OpenGoalLearningEngine`
- `OpenGoalTutorDirector`

### Dynamic registry support

`DomainRegistry` now supports safe runtime registration/outcome aliases while preserving a single domain owner and rejecting semantic outcome collisions.

The built-in registry remains Git + Fractions only.

## Open-goal persistence/recovery model

The open-goal job persists these checkpoints:

1. `GOAL_INTERPRETED`
2. `RESEARCH_PLANNED`
3. `SOURCES_ACQUIRED`
4. `DYNAMIC_DOMAIN_BOUND`
5. `COURSE_GENERATED`
6. `COMPLETE`

The child course-generation path retains its existing research/generation validation checkpoints.

Persisted state includes:

- goal interpretation;
- exact runtime bundle ID/version/**digest**;
- research plan;
- acquired research dossier;
- generated course;
- validation receipt;
- dynamic domain metadata recoverable from the dossier.

After `SOURCES_ACQUIRED`, a restart can rebuild the dynamic domain from persisted evidence even if the runtime research corpus is unavailable.

## Important implementation correction — bundle digest pinning

An initial recovery design pinned only the runtime bundle version string. That would allow changed bundle bytes under the same version to alter the evidence base after a crash.

Repair:

- interpretation pins exact `bundle_digest`;
- research plan carries the same digest;
- pre-acquisition recovery checks both version and digest;
- same-version/different-content restart fails closed with `OPEN_GOAL_BUNDLE_DIGEST_DRIFT`.

## Independent SQLite behavior oracle

The third-domain validator does not judge SQL by string equality.

`DeclarativeSQLiteOracle`:

- creates an isolated in-memory SQLite fixture;
- allows SELECT-only execution;
- executes learner/generated SQL;
- independently computes expected rows from a declarative semantic specification;
- verifies returned columns and rows/order;
- permits behaviorally equivalent SQL formulations;
- rejects mutation/non-SELECT statements;
- verifies generated answer keys;
- executes and verifies lesson worked examples.

A deliberately corrupted mastery answer key is rejected even though it is the stored/generated key. This prevents candidate keys from validating themselves.

## Generated third-domain course

The open-goal compiler produces from the acquired dossier:

- 2 skills;
- 2 criteria;
- a hard prerequisite from SELECT/WHERE to ORDER BY;
- 2 lessons;
- 4 practice items;
- 2 mastery checks;
- 2 delayed retention checks;
- 2 fresh maintenance tasks;
- 2 novel transfer tasks;
- data-driven Tutor probes/remediation.

Lesson explanations are assembled from the admitted claim text and receive closed-world grounding spans. Worked examples and assessment answers are checked against the executable SQLite oracle.

## Learning behavior proven for the open-generated domain

The third domain reaches:

`LESSON -> TUTOR HYPOTHESIS -> DISTINCT-FAMILY CORROBORATION -> INDEPENDENT CHECK -> DELAYED RETENTION -> PREREQUISITE UNLOCK -> ORDERING SKILL -> RETAINED -> NOVEL TRANSFER -> MASTERED -> COURSE_COMPLETE`

The existing Learning invariants remain intact:

- Tutor assistance does not become mastery evidence;
- retention does not equal transfer;
- assisted transfer is excluded;
- a failed/exposed transfer family cannot later qualify by reuse;
- stale prerequisite evidence blocks downstream progression;
- Tutor abstains when cause is unknown;
- one error family remains a `TEACHING_HYPOTHESIS`;
- distinct-family corroboration is required before `EVIDENCE_SUPPORTED` diagnosis;
- assessment answers are withheld from Tutor context.

## Final qualification

- combined IMPL-001..006 test suite: **143/143 PASS**;
- preserved IMPL-001..005 regressions: **108/108 PASS**;
- new IMPL-006 open-goal tests: **35/35 PASS**;
- Python files compiled: **30 / PASS**;
- open-goal end-to-end SQLite demonstration: **PASS**;
- dynamic registry transition: **PASS**;
- source/claim acquisition: **2 sources / 6 claims / PASS**;
- course grounding: **PASS**;
- independent item behavior oracle: **PASS**;
- independent lesson worked-example oracle: **PASS**;
- targeted adversarial/mutation campaign: **21/21 PASS**;
- open-goal crash/recovery campaign: **100/100 PASS** across six checkpoints;
- unique recovered course digests: **1**;
- unique recovered dossier digests: **1**;
- unique recovered research-plan IDs: **1**;
- open-goal Tutor crash/recovery campaign: **100/100 PASS**;
- unique recovered Tutor-result digests: **1**;
- deterministic open-goal generation on three fresh stores: **PASS**;
- predecessor IMPL-005 exact qualification rerun in isolation: **108/108 PASS**, including its prior mutation/recovery campaigns.

Exact machine-readable receipt: `evidence/qualification_receipt_impl006.json`.

## Architecture result

The executable Learning Lab has crossed a meaningful boundary.

Before IMPL-006:

`goal -> choose a domain already registered in code -> generate/run course`

After IMPL-006:

`goal -> inspect runtime research corpus -> abstain or bind supported evidence -> plan/acquire sources -> compile a domain spec from data -> register it -> run the same Learning core`

The SQLite course did not exist in the engine's domain registry when the engine instance started.

This is the first executable open-goal path, but it is deliberately **bounded**.

## Truth boundary

This slice does **not** prove:

- arbitrary internet topics can be researched and compiled automatically;
- runtime live-web research is implemented;
- arbitrary domain-specific behavior oracles can be synthesized;
- a live nondeterministic LLM/provider is qualified;
- source claims automatically prove pedagogical appropriateness;
- independent human pedagogical review is complete;
- real learner learning gain/retention/transfer is proven;
- far transfer;
- target iPhone behavior;
- production System Master integration.

The generated course standing remains:

`MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED`

## Exact next objective

`LEARNING-LAB-IMPL-007 — LIVE/REPLAYABLE RESEARCH + MODEL-BACKED OPEN-GOAL GENERATION + PLUGGABLE ORACLE SLICE`

Replace the curated runtime research-bundle dependency with a governed live/replayable ResearchPort and a replaceable model-backed compiler while preserving deterministic replay evidence. Introduce an oracle-provider registry so the open-goal engine does not contain a SQLite-specific oracle branch. Prove a fourth previously unregistered goal can be researched, compiled, grounded, independently validated where mechanically decidable, routed to review where not decidable, tutored, retained and transferred while preserving all 143 current regressions and crash/retry/idempotency guarantees.
