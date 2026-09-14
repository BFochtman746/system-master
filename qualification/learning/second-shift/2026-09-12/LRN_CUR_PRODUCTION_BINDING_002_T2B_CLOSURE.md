# LRN-CUR-PRODUCTION-BINDING-002-T2B — I016-C Exact Handler + Atomic Curriculum UoW

**Standing:** CANDIDATE BUILD PASS / PORTABLE QUALIFICATION PASS / NOT PRODUCTION INSTALLED

## Authority and scope

T2B continues from T2A commit `77a34e3bc40417a2cae3de32ba7d40462a1cff0f` and the exact PB001 recovered source SHA-256 `28e3317e5494c9df7df2f8aefb7f83f7c69fbc9d0ababfb696700542c831edc3`. The 001C semantic signature remains controlling. No new public interface, semantic owner, or cross-domain store is introduced.

## Implemented

- Preserved candidate handlers `I001`, `I016-L`, and `I027` and added exact `I016-C RequestRemediationPlan`.
- Added internal `OwnerValueResolverAdapter` bound to a Learning-owned immutable value port. Curriculum receives an ephemeral verified `RemediationNeed` snapshot, never a Learning repository handle.
- Resolver verifies owner, kind, object identity, version, and digest and fails closed on missing/stale/tampered references.
- `I016-C` accepts exactly `remediation_need_ref`, `curriculum_version_ref`, `criterion_refs`, `instructional_constraints`, and `client_operation_id`; old abbreviated/full-value payloads are rejected.
- Curriculum validates its own pinned CurriculumVersion and criterion refs, creates only Curriculum-owned `RemediationPlan` truth, and returns a versioned plan reference/digest.
- On a DATA-001 atomic backend, plan state + operation receipt + `RemediationPlanCreated` outbox stage execute through one owner-checked `atomic_mutation`.
- Curriculum cannot read `remediation_need` from its repository; negative foreign-store qualification passes.

## Failure law preserved

- resolver unavailable -> `DependencyUnavailable`
- stale/tampered need ref -> `RemediationNeedStale`
- curriculum version/digest mismatch -> `CurriculumVersionMismatch`
- unknown criterion -> `CriterionUnknown`
- invalid/changed conflicting payload -> `ValidationError`

No new externally visible I016-C error class was invented.

## Qualification

- PB002-T2B new tests: **11/11 PASS**
- Production Binding baseline: **15/15 PASS**
- REBIND-001: **20/20 PASS**
- REBIND-002: **34/34 PASS**
- owner-separated IMPL016: **25/25 PASS**
- historical full suite: **481/481 PASS**
- combined executed tests: **586/586 PASS**
- compileall changed packages/tests: **PASS**

## Coverage truth

Candidate exact inbound handler materialization is now **4/63**: `I001`, `I016-L`, `I016-C`, `I027`. That leaves **55** domain routes plus **4** shared-owner routes, **59 total inbound routes remaining**. This is candidate source qualification only.

## Truth boundary

No live PostgreSQL 18.6 run, deployed Master Core transport, production authorization/shared-gateway fixture, iPhone/native accessibility qualification, real learner evidence, psychometric validity, SME approval, certification, external-provider success, or A-01 execution is claimed.

## Exact next operation

`LRN-CUR-PRODUCTION-BINDING-002-T3 — CONTINUE EXACT OWNER-VALID HANDLER MATERIALIZATION FROM 4/63, PRIORITIZING SAME-OWNER LOW-CROSS-DOMAIN COMMAND/QUERY ROUTES; PRESERVE ATOMIC UOW/OUTBOX AND FAIL-CLOSED SHARED-OWNER BOUNDARIES`
