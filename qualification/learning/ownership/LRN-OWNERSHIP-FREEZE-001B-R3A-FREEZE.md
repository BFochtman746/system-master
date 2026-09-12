# LRN-OWNERSHIP-FREEZE-001B-R3A — Current Route/Shared-Authority Rebind Freeze

Status: **FROZEN_FOR_LOCAL_LEARNING_CURRICULUM_ROUTE_AUTHORITY / SHARED-CORE-EXECUTION_FAIL-CLOSED**  
Owner lane: `SYSTEM_MASTER/LEARNING`  
Date: `2026-09-12`

## Exact authority re-read

- Canonical Learning authority observed before this freeze: `learning/control-v1@e3196089f77dde376944a08eac78a697e57d1535`.
- Reconstruction subject immediately before this freeze: `learning/ownership-freeze-001b-20260912@438048ca62b64ff1eae16617930808deacf458ff`.
- Current Foundation/Spine authority observed during R3A adjudication: `system-master/control-v2@38c80514298fd1b1509f9fb55bd817b95a5f9f0b`.
- The canonical Learning branch remains intentionally unchanged by this reconstruction unit.

## Frozen source and ownership denominator

This freeze inherits the already-admitted, hash-verified reconstruction chain R2B -> R2C -> R2D and does not reopen the recovered ownership adjudication without a material-delta reason.

- Historical source denominator: `110 P0 requirements / 110 interfaces / 26 semantic objects`.
- Lossless active denominator: `113 requirements / 112 interfaces / 28 semantic objects`.
- Historical source coverage: `110/110 requirements`, `110/110 interfaces`, `26/26 semantic objects`.
- Active canonical semantic objects: `15 Learning-owned + 13 Curriculum-owned`.
- Active interface ownership: `59 Learning-owned + 39 Curriculum-owned + 14 current shared/Core-owned`.
- Inbound command/query denominator: `63`.
- Knowledge-alignment residual `LRN-069 / LRN-EXT-002` remains `DENY_BY_DEFAULT`; no Knowledge owner, store or canonical route is activated.

Curriculum remains an internal Learning-system truth boundary, not a new Topology-005 peer. Learning owns learner state, evidence admission/interpretation, mastery, retention, transfer, learner-specific remediation/maintenance need, adaptive decisions and next-learning-action truth. Curriculum owns skill/criterion/prerequisite/curriculum/course/lesson/practice/assessment/instructional-policy/program-validation/freshness/remedial-instruction truth. Book, Documents, Core generic infrastructure and Programming specialist semantics remain outside these owners.

## Exact recovered implementation subject

Admitted current source package:

- `LRN_CUR_PRODUCTION_BINDING_001_REBOUND_SOURCE.zip`
- SHA-256: `28e3317e5494c9df7df2f8aefb7f83f7c69fbc9d0ababfb696700542c831edc3`
- Source tree manifest standing inherited from R2D: `378/378` verified.
- Historical source checksum file remains quarantined because it no longer identifies the exact admitted source; no stale checksum is promoted.

R3A regenerated the current route manifest from this exact admitted source plus the current owner rebind:

- route count: `112`
- Learning-owned routes: `59`
- Curriculum-owned routes: `39`
- shared/Core-owned routes: `14`
- route manifest SHA-256: `bc96772c1a0e81fa12f22b2af7f15d6c0d30f374e985f422ac73a3519b58c978`
- route manifest bytes: `90,448`
- all shared routes executable while contract unresolved: `0`

## Qualification frozen by this unit

The exact R3A qualification receipt is `LRN-OWNERSHIP-FREEZE-001B-R3A-QUALIFICATION.json`.

Fresh exact-subject portable evidence preserved by that receipt:

- R3A route/shared-authority/Knowledge-fence qualification: `10/10 PASS`.
- exact-source production-binding floor: `15/15 PASS`.
- exact-source REBIND-001: `20/20 PASS`.
- exact-source REBIND-002: `34/34 PASS`.
- exact-source IMPL016 Learning/Curriculum owner-separated seam: `25/25 PASS`.
- cumulative exact tests observed by the R3A receipt: `104/104 PASS`, `0 failures`.

This freeze does **not** convert historical 481/481 or historical/current-audit 575/575 results into R3A exact-subject qualification. It preserves them as provenance only unless rerun on the exact changed subject.

## Shared-authority blocker classification

The 14 shared interfaces have a frozen logical truth owner but do not yet have current exact admitted contract IDs/versions sufficient for Learning to execute them as production authority. Current Foundation progress does not justify inventing those contract identities.

Blocker class: `EXTERNAL_FOUNDATION_CONTRACT_ADMISSION`.

Rules:

1. Learning/Curriculum may bind the logical dependency owner and local adapter boundary.
2. Learning/Curriculum must not mint a replacement Core contract ID/version.
3. A missing, stale, wrong-owner or unadmitted exact shared contract is a fail-closed dependency result, never an implicit fallback.
4. Transport/edge authorization and semantic/domain authorization remain separate checks; mutable chat/webhook/provider metadata never becomes semantic authority.
5. Domain-local handlers may be implemented and isolated-qualified behind a non-executable boundary when their semantic mutation can be proven without pretending a shared contract is live.
6. Public/shared route activation remains blocked until exact current Foundation contracts are admitted and then freshly integrated-qualified.

## R3A closure decision

R3A is complete for the subject it owns: current owner/route rebinding, shared-owner logical classification, fail-closed unresolved shared-contract behavior, and the Knowledge residual fence.

R3A does **not** claim:

- 63 exact inbound handlers are complete (`0/63` remains the recovered production-binding standing before R3B materialization),
- live PostgreSQL execution,
- deployed Master Core transport,
- current shared-Core production integration,
- native iPhone execution,
- participant consent or actual learner responses,
- real mastery, delayed retention or novel transfer,
- instructional-effectiveness or psychometric validity,
- SME approval, certification/accreditation,
- A-01/private/external/production evidence.

## R3B admission rule

`LRN-OWNERSHIP-FREEZE-001B-R3B` is now admitted only as a bounded exact-handler materialization program over the frozen 113/112/28 ownership and R2C persistence/port contract. It must not reopen feature scope.

R3B shall proceed in dependency-safe slices. Every slice must bind:

`interface -> canonical owner -> exact handler component -> durable state -> operation/idempotency receipt -> event/outbox effects -> typed errors -> shared dependency receipts -> tests -> exact source/evidence -> environment/blocker`.

A slice may BUILD only after its slice design lock freezes its handler semantics and denominator. Any route depending on an unresolved shared contract remains non-executable even if its domain-local handler exists.

## Exact next operation

`LRN-OWNERSHIP-FREEZE-001B-R3B-S01 — LEARNING GOAL HANDLER SLICE DESIGN-LOCK (I001-I004 + I033) -> ATOMIC PERSISTENCE/IDEMPOTENCY/EXPECTED-VERSION/OUTBOX TEST DENOMINATOR`

The first slice is selected because the recovered 001D control and forensic interface ledger bind I001-I004 to one Learning-owned component (`LearningGoalController`) and one Learning-owned persistence port, while I033 is the directly corresponding post-commit domain event. The slice must preserve external authorization as a boundary receipt/precondition rather than fabricating an admitted Core authorization contract.