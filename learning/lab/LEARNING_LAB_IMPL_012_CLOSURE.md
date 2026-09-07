# LEARNING-LAB-IMPL-012 — MULTI-SCENARIO ROLE-COMPETENCY PERFORMANCE + REQUIREMENT-COVERAGE / GAP EVIDENCE SLICE

**Status:** `PASS_PORTABLE_IMPLEMENTATION`

## 1. What problem this slice solves

IMPL-011 proved one bounded authentic workplace task. That is stronger than course completion, but one task cannot defensibly establish broad role or certification coverage.

IMPL-012 adds a reusable, versioned requirement-set layer and asks a narrower question:

`What exact declared requirements are supported by this learner's current admitted evidence, which are only partially supported, which are stale/missing/inadmissible, and what additional evidence is required?`

It deliberately does **not** answer `Is this person job-ready?` or `Should this employer hire them?`.

## 2. Architecture added

### Reusable external/supplied requirement set

The bounded fixture `ROLE-PY-OPS-CAPABILITY-V1` is subject-independent. Learner identity is not stored in the role standard. Requirements carry versioned owner references and consequential mapping standing.

Only `EXACT_SHARED_REF` and `OWNER_APPROVED_MAPPING_REF` are admissible for consequential requirement coverage. AI-inferred/name/embedding similarity cannot establish equivalence.

### Multi-scenario workplace evidence

A second materially different workplace scenario was added:

- fulfillment order triage (`FULFILLMENT_ORDER_TRIAGE` / independence group A);
- service-ticket escalation (`SERVICE_TICKET_ESCALATION` / independence group B).

The workplace evaluator was generalized to derive expected outputs from scenario field bindings rather than hard-coded order-field names.

Each capability dossier now binds the **exact workplace scenario digest**. Later catalog changes therefore cannot reinterpret historical evidence.

### Scenario-to-requirement binding

Using the same Python skill is not enough. Each workplace scenario carries explicit requirement bindings. An unrelated scenario cannot count toward a requirement merely because it exercises a similarly named skill.

### Requirement coverage engine

Per requirement, the engine can return:

`SUPPORTED | PARTIALLY_SUPPORTED | NOT_SUPPORTED | STALE | INADMISSIBLE_FOR_USE | MAPPING_UNVERIFIED | AUTHORIZATION_BLOCKED | UNKNOWN`

This slice executes the first six states that are relevant to the bounded fixture; authorization remains an integration boundary.

Coverage evaluates:

- exact/owner-approved mapping standing;
- learner identity;
- dossier integrity;
- scenario digest integrity;
- scenario-to-requirement binding;
- underlying Learning mastery state;
- workplace criterion verification;
- independent-human-defense requirement when declared;
- evidence freshness;
- distinct scenario-family count;
- distinct independence-group count.

### Gap plan

Every unsupported/partial/stale condition produces an explicit recommended next evidence action, such as:

- assign a distinct workplace scenario family;
- obtain independent human defense review;
- run fresh workplace revalidation;
- repair an unverified requirement mapping.

The gap plan is planning-only and cannot create competence.

### Immutable subject/time coverage snapshots

A role standard is reusable. A coverage evaluation is learner/time/evidence-specific.

Coverage, gap-plan and Portfolio-handoff identities are therefore keyed by the exact requirement-set digest + learner + as-of time + evidence set. Later reevaluation creates another immutable snapshot instead of colliding with or rewriting the old one.

### Read-only Living Portfolio handoff

Learning emits exact per-requirement coverage status and resolvable capability-dossier refs. Portfolio may present those facts but cannot rewrite them or promote them to `JOB_READY`, `QUALIFIED_FOR_ROLE`, `CERTIFIED`, `LICENSED`, `SUBJECT_MATTER_EXPERT`, or another externally owned meaning.

## 3. Bounded demonstration result

With two current independent workplace scenarios and synthetic review fixtures:

- `REQ-PY-OPS-01` list-comprehension operations work: `SUPPORTED`;
- `REQ-PY-OPS-02` dictionary-comprehension operations work: `SUPPORTED`;
- `REQ-PY-OPS-03` application across distinct operational contexts: `SUPPORTED`;
- `REQ-PY-OPS-04` professional explanation/data-quality judgment: `PARTIALLY_SUPPORTED` because no real independent human defense review was supplied.

Overall:

`DECLARED_REQUIREMENT_SET_PARTIALLY_SUPPORTED`

External eligibility decision:

`NOT_MADE`

This is the desired behavior. Three requirements have strong bounded evidence; the fourth remains visibly incomplete rather than being averaged into a fake overall qualification.

## 4. Defects/weaknesses found and repaired during implementation

1. The initial role requirement object incorrectly carried learner identity. Repaired so the standard is reusable and learner identity exists only on coverage evaluations.
2. A freshness test initially staled only one of two evidence records; the engine correctly retained partial current support. The fixture was corrected rather than changing the engine.
3. Capability dossiers originally referenced scenario ID but not exact scenario digest. Repaired to prevent later scenario metadata from reinterpreting historical evidence.
4. Scenario relevance originally depended only on common skills/criteria. Repaired with explicit scenario-to-requirement bindings so irrelevant work cannot count.
5. Initial coverage object identity used only the requirement-set ID. Repaired to immutable subject/time/evidence-specific snapshot identity, preventing collisions across learners or reevaluation times.
6. Dossier ordering could differ across retry. Evidence is now canonicalized by dossier digest so semantically identical evidence sets recover identically regardless of input order.

## 5. Qualification

- combined IMPL-001..012 tests: **363/363 PASS**;
- exact predecessor IMPL-001..011 module set: **323/323 PASS**;
- new IMPL-012 tests: **40/40 PASS**;
- Python files compile: **55 / PASS**;
- targeted adversarial cases: **26/26 PASS**;
- role-coverage crash/recovery: **100/100 PASS** across five checkpoints;
- coverage/gap/handoff determinism: **100/100 PASS**;
- unique recovered coverage digests: **1**;
- unique recovered gap-plan digests: **1**;
- unique recovered Portfolio-handoff digests: **1**;
- unique recovered coverage standings: **1**.

Exact machine-readable receipt: `evidence/qualification_receipt_impl012.json`.

## 6. What the testing means

Regression tests answer: did role coverage break any already-qualified Learning behavior?

Adversarial tests try to make weak or misleading evidence count: one scenario, duplicate scenario families, same independence group, stale evidence, wrong learner, AI-inferred mapping, corrupted dossier, failed/assisted work, synthetic human-review substitution, Portfolio claim inflation, tampering, requirement-set drift, scenario drift, evidence drift and as-of drift.

Crash tests kill the role-coverage job after requirement binding, evidence binding, coverage computation, gap planning and handoff construction. Recovery must continue the same exact evidence/standard snapshot.

Determinism tests reverse dossier arrival order. The result must not change.

## 7. Truth boundary

This slice does **not** prove:

- this bounded requirement fixture is an official employer or certification standard;
- the learner is job-ready or qualified for an occupation;
- the learner is certified, licensed or an SME;
- synthetic defense-review fixtures are human review;
- two scenarios are sufficient for all professional roles;
- the one-day evidence-freshness fixture is universally appropriate;
- external competency equivalence from AI similarity;
- production Living Portfolio integration;
- native iPhone behavior.

The strong claim available here is narrower:

> Learning can compute an immutable, evidence-linked, gap-explicit coverage matrix against a supplied versioned requirement set across multiple independent workplace scenarios without converting coverage into external qualification.

## 8. Exact next objective

`LEARNING-LAB-IMPL-013 — REAL EXTERNAL STANDARD INGESTION + REQUIREMENT DECOMPOSITION / MAPPING + CERTIFICATION-READINESS BLUEPRINT SLICE`

Replace the bounded supplied role fixture with at least one real externally published professional/certification standard. Ingest and freeze the exact standard/version; decompose it into requirement objects without silently changing meaning; bind Learning competencies only through explicit exact/approved mappings; generate the assessment/workplace-scenario blueprint needed to cover each requirement; identify unsupported requirements and evidence gaps; and prove that content coverage, learner evidence coverage and external certification status remain separate. Preserve all 363 current regressions, multi-scenario diversity laws, immutable evidence lineage and external-authority claim boundaries.
