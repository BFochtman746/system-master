# BOOK-RECONSTRUCTION-B01-B — EXECUTION FOUNDATION ANALYSIS / REBIND OPTION ADJUDICATION 001

Date: 2026-09-12
Owner: SYSTEM_MASTER/BOOK
Parent head: `ce18dc5161028bf45ae1e7238d60049c3e230e1c`
Precondition: B01-A bounded execution-foundation archaeology complete, 13/13 path categories and 24/24 rebind invariants accounted, unaccounted archaeology requirements=0.
Standing: `ANALYSIS_COMPLETE__OPTION_3_ADJUDICATED__DESIGN_LOCK_NOT_YET_APPLIED`
Canonical effect: NONE

## Problem statement

The B01 execution foundation contains useful, already-recovered workflow machinery, but its older routing/service taxonomy conflates two identities that current authority requires to be separate:

1. **current execution ownership** — must be `SYSTEM_MASTER/BOOK`; and
2. **historical/provider provenance identity** — may truthfully identify completed historical Prose capability/service/operation evidence, but cannot recreate a Prose topology lane or owner.

The scheduler already fails closed on old `PROSE.*`, `/PROSE`, `PROSE_ANALYSIS_AND_REVISION` and `BOOK_EVALUATION` dispatch identities. This safety behavior must remain permanent. The reconstruction therefore needs a current Book-owned execution identity that can carry immutable provider provenance without making that provenance an owner.

## Targeted research decision

No external research is admitted for this decision. The contested question is System Master ownership and exact repository compatibility, which is governed by CURRENT-AUTHORITY-003, Topology-005 and the recovered Book contracts. External sources cannot authorize a System Master owner or overturn the retirement fence. Adding generic orchestration research here would increase design surface without resolving the actual authority collision.

Targeted research remains required later only if an underdetermined implementation mechanism (for example durable queue semantics, isolation mechanism, or provider protocol) can materially change the design. No such underdetermination is needed to choose the identity architecture.

## Options analyzed

### Option 1 — destructive rename/rewrite of historical identities

Rewrite `PROSE.*`, `PROSE_ANALYSIS_AND_REVISION`, `PROSE_SYSTEM` and `/PROSE` in historical contracts/evidence to new Book names.

**Rejected.**

Failure modes:

- destroys exact historical provider/evidence identity;
- makes old receipts/contracts ambiguous or falsely current;
- can create apparent PASS transfer because changed semantics look like the old qualified subject;
- loses the distinction between who currently owns integration and what historical/provider implementation produced evidence;
- breaks the reconstruction rule to reuse/rebind recovered substrate without cause.

### Option 2 — compatibility aliases that let old `PROSE.*` task IDs dispatch

Keep old IDs and teach the scheduler/router that `PROSE.*` now means Book-owned integration.

**Rejected.**

Failure modes:

- turns a retired owner namespace into a live execution namespace;
- makes stale scheduler/delegation artifacts accidentally executable;
- weakens the scheduler's current fail-closed retirement test;
- makes it impossible to prove from a task record whether an old historical Prose task or a new Book integration task was intended;
- increases the chance that historical closure evidence is treated as current qualification.

### Option 3 — explicit Book-owned integration capability identity + immutable nested provider provenance

Create new `BOOK.*` execution capability IDs owned by `SYSTEM_MASTER/BOOK`. Route/schedule/retry/concurrency/evidence/admission operate on those current IDs. If a current Book-owned adapter uses preserved completed capability or an external provider, the exact provider/service/operation/subject identity is recorded as nested provenance and never becomes an owner.

**ADJUDICATED: REQUIRED DESIGN DIRECTION.**

This option preserves all B01-A invariants while keeping old Prose dispatch permanently blocked.

## Current Book-owned capability namespace

The design lock should reserve the following current execution identities. These IDs are current coordination identities, not claims that any external provider is presently available or qualified.

| Current Book capability | Historical/provider operation provenance class | Context class | Concurrency/idempotency law |
|---|---|---|---|
| `BOOK.LITERARY.ANALYZE_PASSAGE` | `PROSE_ANALYSIS_AND_REVISION/ANALYZE_PASSAGE_OR_UNIT` | GENERATION_CONTEXT or bounded analysis projection | read-only parallel eligible; registered operation idempotent |
| `BOOK.LITERARY.BUILD_NARRATIVE_STATE` | `PROSE_ANALYSIS_AND_REVISION/BUILD_NARRATIVE_STATE_PROJECTION` | GENERATION_CONTEXT | read-only parallel eligible; idempotent |
| `BOOK.LITERARY.DIAGNOSE` | `PROSE_ANALYSIS_AND_REVISION/DIAGNOSE_LIMITATIONS_AND_OPPORTUNITIES` | GENERATION_CONTEXT | read-only parallel eligible; idempotent |
| `BOOK.LITERARY.RETRIEVE_CRAFT_INTELLIGENCE` | `PROSE_ANALYSIS_AND_REVISION/RETRIEVE_CRAFT_INTELLIGENCE` | GENERATION_CONTEXT | read-only parallel eligible; idempotent |
| `BOOK.LITERARY.GENERATE_REVISION_CANDIDATE` | `PROSE_ANALYSIS_AND_REVISION/GENERATE_BOUNDED_REVISION_CANDIDATE` | GENERATION_CONTEXT | SERIAL_ONLY; non-idempotent; unknown outcome requires reconciliation |
| `BOOK.LITERARY.COMPARE_ORIGINAL_CANDIDATE` | `PROSE_ANALYSIS_AND_REVISION/COMPARE_ORIGINAL_AND_CANDIDATE` | EVALUATION_CONTEXT or explicitly bounded comparison context | read-only parallel eligible; idempotent |
| `BOOK.LITERARY.ASSESS_VOICE` | `PROSE_ANALYSIS_AND_REVISION/ASSESS_VOICE_EVOLUTION_OR_DEGRADATION` | EVALUATION_CONTEXT | read-only parallel eligible; idempotent |
| `BOOK.LITERARY.ASSESS_HOMOGENIZATION` | `PROSE_ANALYSIS_AND_REVISION/ASSESS_HOMOGENIZATION_RISK` | EVALUATION_CONTEXT | read-only parallel eligible; idempotent |
| `BOOK.EVALUATION.INDEPENDENT_BOOK_OR_UNIT` | `BOOK_EVALUATION/INDEPENDENT_BOOK_OR_UNIT_EVALUATION` | EVALUATION_CONTEXT | isolation-gated; idempotent |
| `BOOK.EVALUATION.CONTRASTIVE_CANDIDATE` | `BOOK_EVALUATION/CONTRASTIVE_CANDIDATE_EVALUATION` | EVALUATION_CONTEXT | isolation-gated; idempotent |
| `BOOK.EVALUATION.QUALIFICATION_EVIDENCE` | `BOOK_EVALUATION/QUALIFICATION_EVIDENCE` | EVALUATION_CONTEXT | isolation-gated; idempotent |

`RESEARCH.*` remains an external-evidence service class with no Book canonical authority and does not need a Prose-retirement rename. Documents/artifact capabilities remain peer-service boundaries and are not absorbed into Book.

## Proposed dual-identity contract

A later design lock should define a content-addressed `BookCapabilityBindingV1` with at least:

- `binding_schema_version`
- `binding_id`
- `binding_digest`
- `current_capability_id`
- `current_owner_path` = `SYSTEM_MASTER/BOOK`
- `adapter_id`
- `adapter_version`
- `authority_domain`
- `context_package_class`
- `registered_idempotent`
- `concurrency_policy_class`
- `provider_provenance`
  - `historical_or_provider_service_id`
  - `operation_id`
  - `provider_class`
  - `provider_subject_ref` (nullable until exact provider/subject is admitted; absence means unavailable, never guessed)
  - `service_registry_id`
  - `service_registry_subject_or_digest`
- `canonical_write_authority=false`
- `lifecycle_transition_authority=false`
- `export_freeze_authority=false`
- `publication_authority=false`
- `author_decision_authority=false`
- `private_data_authority` explicitly bounded, never inferred

The binding digest must cover all authority-bearing and provider-operation fields. Mutable chat/webhook labels, timestamps, retry counters, scheduler attempt IDs and human-readable aliases must not define semantic binding identity.

## Routing rule

A task may become callable only when all are true:

1. task capability is one of the current Book-owned IDs;
2. exact current `BookCapabilityBindingV1` is admitted and digest-valid;
3. required Context Compiler package is current and exact-source bound;
4. adapter implementation identity matches the binding;
5. provider/service/operation contract required by the binding is present and exact;
6. provider availability/standing required for the operation is actually observed, or execution remains unavailable/blocked;
7. required isolation, author, rights/private-data and other authority gates are satisfied by evidence, not inferred;
8. scheduler still rejects every retired `PROSE.*` execution ID.

A binding is routing metadata and authority fencing. It never means a provider response may mutate canonical Book state.

## Retry / reconciliation rule

Retry identity must include the **current Book capability binding digest** plus the exact provider service/operation identity. This prevents a provider substitution, adapter change, service-registry change or capability-policy change from being treated as the same logical operation.

For `BOOK.LITERARY.GENERATE_REVISION_CANDIDATE`, the existing non-idempotent law is preserved exactly:

- unknown outcome -> `RECONCILE_REQUIRED`;
- confirmed existing result -> reuse/review existing result;
- confirmed no effect -> a new attempt may be considered under a new/authorized attempt path;
- unresolved/contradictory -> fail closed;
- no stacked automatic retry layer around non-idempotent generation.

## Admission rule

The admission handoff must bind candidate provenance to the **current Book capability ID and binding digest**. Historical/provider provenance is nested evidence. Book admission still independently verifies candidate digest/current parent/evidence/author-decision applicability and remains the only canonical mutation path.

Old `PROSE.GENERATE_REVISION_CANDIDATE` may appear in historical receipt provenance, but can never satisfy the current execution-plan capability field by itself.

## Adversarial analysis

The design lock must explicitly fail the following attacks:

1. old `PROSE.*` task inserted into a new plan;
2. stale delegation replays old scheduler capability ID;
3. caller supplies `BOOK.*` alias but provider operation differs from binding;
4. provider subject changes while old binding digest is reused;
5. service registry changes idempotency from true to false or vice versa;
6. attacker substitutes an evaluator provider into generation context;
7. generation context is reused for evaluation;
8. caller omits provider subject and system guesses one;
9. historical PASS is attached to changed Book adapter bytes;
10. mutable chat/webhook metadata claims owner/provider identity;
11. retry layer auto-regenerates after unknown non-idempotent outcome;
12. duplicate/lost scheduler response causes second canonical or provider effect;
13. Book adapter claims author approval from provider output;
14. provider technical success claims export freeze/publication authorization;
15. raw/private manuscript data leaks into durable workflow/binding/evidence state;
16. old `/PROSE` canonical-owner label is treated as active topology;
17. current `BOOK.*` task has no admitted binding but is dispatched by name alone;
18. Documents technical output is interpreted as Book publication authority;
19. a stale context package survives Book/Story-Bible/service-binding change;
20. candidate provenance is accepted without exact binding/current source/evidence identity.

## Decision

Option 3 is the sole admissible architecture for B01 reconstruction.

The preferred architecture is an anti-corruption boundary: current Book execution identity on the outside, immutable provider/historical provenance on the inside, with no old Prose dispatch alias and no authority widening.

## Exactly one successor

`BOOK-RECONSTRUCTION-B01-C — BOOK CAPABILITY BINDING + CONTEXT/RUNTIME REBIND DESIGN LOCK`

B01-C must freeze:

- `BookCapabilityBindingV1` schema and digest law;
- exact mapping for all 11 current Book integration capabilities;
- Context Compiler current-lineage materialization requirements;
- routing/concurrency/retry/evidence/admission compatibility rules;
- permanent retired-ID deny set;
- isolated test denominator covering all 24 B01-A invariants plus the 20 attacks above;
- cumulative regression composition including B00 Q001-Q096 + PRE01-PRE21, recovered Context Compiler semantics, durable-store and scheduler regressions;
- exact evidence boundaries and blocker classes.

No build is admitted until B01-C freezes that denominator. No provider availability, author decision, private access, native execution, publication standing, production standing or A-01 standing is claimed here.
