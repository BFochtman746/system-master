# LRN-CUR-PRODUCTION-BINDING-002 — Tranche A Closure

**Date:** 2026-09-14  
**Standing:** `PASS_PORTABLE_TRANCHE_A / 4_OF_63_BOUND / LIVE_POSTGRES_AND_LIVE_MASTER_CORE_SHARED_GATEWAYS_PENDING`

## Authority

This tranche continues from the frozen September 11 Learning forensic baseline and the immutable `MASTER_CORE_ROUTE_MANIFEST_001.json`. It does not redesign the Learning/Curriculum ownership split, mastery/adaptive policy, curriculum compiler lifecycle, peer boundaries, or shared-system ownership.

## Exact scope completed

The first coherent production-handler tranche materializes the `LearningGoalController` routes:

- `I001` — `CreateLearningGoal`
- `I002` — `UpdateLearningGoal`
- `I003` — `PauseLearningGoal`
- `I004` — `ResumeLearningGoal`

All four are bound through `LRN-CMD-PORT-001` semantics and remain owned by `MOD-LEARNING-001`.

## Production mechanics added

`PostgresDomainRepository.atomic_versioned_mutation` now provides the versioned production UoW required by these handlers:

1. lock/check operation idempotency receipt;
2. reject changed-payload replay;
3. lock/check latest object version;
4. reject stale expected version or duplicate create;
5. append the immutable object version;
6. record the operation receipt;
7. optionally stage the frozen domain event in the outbox;
8. commit once, or roll back the complete unit.

Authorization and external subject identity are injected from CORE context providers rather than added to the frozen semantic payload. I001 stages only the frozen `LearningGoalCreated` event. I002-I004 do not invent unregistered goal events.

## Handler denominator

`HANDLER_BINDING_MANIFEST_002_TRANCHE_A.json` preserves the exact inbound denominator:

- inbound COMMAND/QUERY routes: **63**
- exact handlers bound in this tranche: **4**
- explicit external-dependency blockers: **4** (`I021`, `I022`, `I031`, `I075`)
- domain handlers still pending implementation: **55**

No 63/63 or production-complete claim is made.

## Fresh qualification

Freshly executed on the modified source:

- historical portable suite: **481/481 PASS**
- REBIND-001: **20/20 PASS**
- REBIND-002: **34/34 PASS**
- Learning/Curriculum IMPL-016 seam: **25/25 PASS**
- production-binding suite including Tranche A: **27/27 PASS**
- combined executable denominator: **587/587 PASS**
- Python compile: **130/130 PASS**

The original source baseline SHA-256 was independently rechecked as:
`28e3317e5494c9df7df2f8aefb7f83f7c69fbc9d0ababfb696700542c831edc3`.

## Truth boundary

This is portable implementation evidence only. It does **not** prove live PostgreSQL 18.6 behavior, live Master Core transport, live shared-authority gateways, target-native iPhone behavior, psychometric validity, or real-learner effectiveness.

## Exact continuation

Continue `LRN-CUR-PRODUCTION-BINDING-002` from this manifest. Materialize the next exact routes only against their frozen signatures; where a route depends on a shared owner, bind the typed dependency and fail closed rather than creating a duplicate local authority.
