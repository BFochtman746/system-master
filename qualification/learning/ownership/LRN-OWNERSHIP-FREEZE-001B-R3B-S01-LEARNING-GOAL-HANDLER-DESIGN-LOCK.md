# LRN-OWNERSHIP-FREEZE-001B-R3B-S01 — Learning Goal Handler Slice Design Lock

Status: **DESIGN_LOCK_COMPLETE / BUILD_ADMITTED_ONLY_ON_EXACT_SOURCE_CUSTODY / PUBLIC_SHARED_ACTIVATION_BLOCKED**  
Date: `2026-09-12`  
Parent freeze: `LRN-OWNERSHIP-FREEZE-001B-R3A`  
Pre-mutation reconstruction head re-read: `621a805b0e425724a808e77cffa88436eb7667d7`

## 1. Slice purpose

Materialize the first bounded exact inbound Learning handler slice without reopening Learning scope or weakening the frozen 113/112/28 ownership model.

This slice owns only:

- `I001 CreateLearningGoal`
- `I002 UpdateLearningGoal`
- `I003 PauseLearningGoal`
- `I004 ResumeLearningGoal`
- directly corresponding declared post-commit event `I033 LearningGoalCreated`
- canonical object `LRN-E001 LearningGoal`
- canonical component `LearningGoalController`
- Learning ports `LRN-CMD-PORT-001`, `LRN-EVT-PORT-001`, `LRN-PERSIST-PORT-001`

It does not create Curriculum, Book, Documents, Programming, generic job, generic authorization, identity, sync, rights, artifact, model-assurance or transport truth.

## 2. Recovered authority binding

The recovered/refrozen sources agree on the following current semantics:

| Surface | Frozen binding |
|---|---|
| canonical owner | `MOD-LEARNING-001` |
| object | `LRN-E001 LearningGoal` |
| component | `LearningGoalController` |
| persistence class | `VERSIONED_DOMAIN_ENTITY` |
| logical persistence port | `LRN-PERSIST-PORT-001` |
| write authority | `MOD-LEARNING-001` |
| physical backend | `UNSELECTED_PRODUCTION_BACKEND` until admitted binding |
| lifecycle | `DRAFT -> ACTIVE <-> PAUSED -> COMPLETED | ARCHIVED` |
| object invariant | goal intent/constraints/version; may point to active curriculum; owns no identity truth |
| migration rule | reuse semantics, preserve IDs/digests/history, do not treat historical Learning Lab SQLite as production authority |

`LRN-001` acceptance requires a stable goal ID, outcome, horizon, status, timestamps and an external user reference. `LRN-076` additionally requires goal creation/update to reject or explicitly leave unresolved material ambiguity that would change the learning construct or intended use.

## 3. Command contracts

### I001 CreateLearningGoal

Input: `client_operation_id, title, objective, horizon, priority` plus a separately admitted caller/actor context supplied by the route boundary.

Required behavior:

1. Validate the Learning-owned semantic fields without deriving identity/authorization truth from mutable transport/chat metadata.
2. Allocate or deterministically bind the stable `goal_id` according to the implementation's admitted ID policy.
3. Create immutable LearningGoal version `1` with a valid initial lifecycle state. The exact initial state must remain consistent with the canonical lifecycle; no implementation may skip an approval/state rule merely to simplify routing.
4. Persist the object version and immutable operation/idempotency receipt in one owner-scoped atomic unit.
5. Stage `I033 LearningGoalCreated` in the same atomic unit when creation commits.
6. Return the committed mutation receipt/result directly. Do not require a read-after-write projection read to establish success.

Idempotency:

- semantic key: `client_operation_id` scoped to the Learning command authority;
- same key + same semantic payload -> same durable result/receipt;
- same key + different semantic payload -> `DuplicateOperationConflict`;
- a transport redelivery or wakeup never creates a second goal or second event.

Declared errors: `DuplicateOperationConflict`, `ValidationError`, `DependencyUnavailable`.

### I002 UpdateLearningGoal

Input: `goal_id, expected_version, patch, client_operation_id`.

Required behavior:

1. Resolve canonical current LearningGoal authority from owner state, not a stale projection.
2. Require `expected_version` to equal the authoritative current version.
3. Validate that the patch changes only LearningGoal-owned fields and does not smuggle Curriculum/identity/shared authority into the object.
4. Create the next immutable object version; never overwrite the prior version in place.
5. Persist next version + operation receipt atomically.
6. Do not invent an undeclared domain event merely because implementation is event-capable. A later admitted event contract may add one through a separately governed change.

Idempotency/concurrency:

- replay semantics are the same as I001;
- stale expected version -> `VersionConflict`;
- no silent last-write-wins and no retry that hides a semantic conflict.

Declared errors: `VersionConflict`, `ValidationError`.

### I003 PauseLearningGoal

Input: `goal_id, expected_version, client_operation_id`.

Required behavior:

- expected-version CAS is mandatory;
- only a lifecycle state for which `PAUSED` is a legal successor may transition;
- persist a new LearningGoal version, preserving all prior versions/history;
- pausing does not delete Curriculum, evidence, mastery, attempts or other owned state;
- `LRN-EXT-001` remains an external binding and must not be recreated locally.

Declared errors: `VersionConflict`, `InvalidState`.

### I004 ResumeLearningGoal

Input: `goal_id, expected_version, client_operation_id`.

Required behavior:

- expected-version CAS is mandatory;
- only a valid paused state may resume to `ACTIVE`;
- persist a new LearningGoal version, preserving history;
- any stale downstream next-action/mastery/curriculum projection is reconciled separately and cannot be assumed fresh merely because the goal mutation committed.

Declared errors: `VersionConflict`, `InvalidState`.

## 4. I033 event contract

`I033 LearningGoalCreated` is a post-commit fact owned by `MOD-LEARNING-001` and emitted via `LRN-EVT-PORT-001`.

Minimum declared payload: `goal_id, version, timestamp`.

Frozen event invariants:

- event identity is stable across retries/redelivery;
- object version, operation receipt and outbox event belong to the same committed semantic transaction;
- event delivery may retry at least once but may not become a second semantic creation;
- event consumers must deduplicate by stable event identity;
- wakeups/notifications are hints only; durable owner state and outbox are authority;
- a lost wakeup cannot lose the committed goal or the durable pending event;
- restart/offline recovery scans durable operation/outbox state and does not depend on mutable transport metadata.

## 5. Atomic persistence contract

Every accepted mutation in this slice uses this order inside one owner transaction:

`load/reconcile authoritative state -> validate owner + semantic authorization context -> check operation receipt -> check expected version/lifecycle -> write immutable next object version -> write immutable operation receipt -> stage admitted outbox event(s) -> commit`

Rules:

1. No direct foreign-store writes.
2. No split commit where the object succeeds but its required receipt/outbox is absent.
3. A crash before commit leaves none of the candidate semantic effects authoritative.
4. A crash after durable commit is rediscovered from durable state; a retry reconciles and returns/re-drives the existing result rather than duplicating it.
5. Reads after mutation may be stale at projection/caching layers; the command result is bound to the commit receipt, not assumed projection freshness.
6. Retry only a classified transient infrastructure failure and only when the operation is idempotently reconcilable. Semantic validation, version conflicts, duplicate-payload conflicts and invalid lifecycle state are not transient retry classes.
7. Do not stack retry layers. The owner handler has one bounded retry policy boundary at most; external transport/runtime retry remains independently governed.

## 6. Authorization and trust fence

Transport authorization and semantic/domain authorization are separate concerns.

Until an exact current Foundation authorization/capability contract is admitted:

- public/shared route activation for this handler slice is **BLOCKED_EXTERNAL_FOUNDATION_CONTRACT_ADMISSION**;
- isolated handler tests may use an explicit synthetic authority fixture only to exercise local allow/deny behavior; such fixtures are not production evidence;
- unknown, absent, stale, wrong-subject or wrong-owner authority context fails closed;
- chat fields, webhook headers, mutable display names, caller-provided owner strings and other transport metadata never become semantic authorization authority;
- the handler may retain only an admitted opaque authority decision/reference needed for traceability; it may not create generic authorization truth.

## 7. LearningGoal state schema floor

The build must preserve, at minimum, the semantics already frozen by `LRN-E001`, `LRN-001` and `LRN-076`:

- stable `goal_id`;
- immutable object `version`;
- normalized objective/outcome intent;
- horizon;
- priority/constraints needed by the admitted interface;
- lifecycle/status;
- creation/update timestamps or equivalent durable temporal facts;
- external user/principal reference only as a reference, never locally owned identity truth;
- optional active Curriculum reference only as a reference to Curriculum-owned truth;
- owner identity `MOD-LEARNING-001` and integrity/digest metadata required by the admitted repository contract.

The implementation may not silently make a legacy `goal` storage row the new canonical schema. It must explicitly adapt/migrate the recovered runtime representation to `LRN-E001 LearningGoal` while preserving stable IDs, history and digest/integrity semantics.

## 8. Reuse/adaptation decision

Historical `LearningRuntime.register_goal` is useful substrate because it already demonstrates:

- operation-key lookup;
- Learning owner-scoped persistence;
- create-once goal semantics;
- deterministic digest/result construction;
- operation-result recording;
- owner-boundary tests that block Learning/Curriculum cross-writes.

It is **not** adopted unchanged because the recovered implementation is narrower than the frozen current contract: it lacks the full I001 payload, I002/I003/I004 exact handlers, versioned LearningGoal lifecycle, exact production unit-of-work/outbox binding, current shared authorization admission, and current handler traceability. R3B therefore adapts and completes the substrate rather than rewriting the learner kernel wholesale.

## 9. Isolated qualification denominator — 32 cases

No BUILD may claim S01 qualification until all 32 exact-subject cases execute and pass on the changed source.

### I001 creation / idempotency — 8
1. valid create produces LearningGoal v1 and receipt;
2. required semantic fields validated;
3. same operation + same payload returns exact prior result;
4. same operation + different payload -> DuplicateOperationConflict;
5. unauthorized/unknown authority context fails closed with no write;
6. mutable transport/chat metadata cannot authorize create;
7. create stages exactly one I033 event in the same commit;
8. failed create leaves no object/receipt/outbox orphan.

### I002 update / CAS — 7
9. valid update creates next immutable version;
10. stale expected version -> VersionConflict;
11. historical version remains intact;
12. same operation + same payload is replay-safe;
13. same operation + different payload conflicts;
14. foreign-owner/identity/curriculum field injection rejected;
15. failed validation leaves no partial state.

### I003 pause — 5
16. valid ACTIVE -> PAUSED creates next version;
17. stale expected version conflicts;
18. invalid lifecycle transition -> InvalidState;
19. replay is idempotent;
20. pause does not delete/change Curriculum/evidence/mastery authority.

### I004 resume — 5
21. valid PAUSED -> ACTIVE creates next version;
22. stale expected version conflicts;
23. invalid lifecycle transition -> InvalidState;
24. replay is idempotent;
25. stale downstream projection is not falsely reported fresh.

### crash/reconcile/ownership/event invariants — 7
26. crash/failure before commit leaves zero semantic effects;
27. crash/ambiguous return after durable commit reconciles to one result;
28. restart rediscovery recovers pending outbox without wakeup trust;
29. duplicate event dispatch preserves one semantic creation and stable event identity;
30. Learning cannot write Curriculum-owned state through this handler;
31. Curriculum/foreign owner cannot write LearningGoal through the owner repository boundary;
32. command success is evidenced by durable commit receipt without requiring read-after-write projection freshness.

## 10. Cumulative qualification rule

After the 32-case isolated S01 suite passes, rerun all still-applicable predecessor suites on the exact changed source. The presently frozen exact predecessor denominator is 104 tests (R3A 10 + production-binding 15 + REBIND-001 20 + REBIND-002 34 + IMPL016 25). If all remain applicable and rerun on the changed subject, the immediate cumulative target is `136/136`.

Any predecessor suite that is not rerun on the exact changed bytes remains historical/provenance evidence and is not counted toward current cumulative PASS.

No live PostgreSQL, deployed Master Core, native iPhone, real-human, psychometric, SME, certification, A-01 or production standing follows from portable S01 qualification.

## 11. Build admission gate

BUILD is admitted only when the exact recovered source subject is materially available for mutation and verified against:

`LRN_CUR_PRODUCTION_BINDING_001_REBOUND_SOURCE.zip@28e3317e5494c9df7df2f8aefb7f83f7c69fbc9d0ababfb696700542c831edc3`.

A forensic report path naming that source is evidence of identity/provenance, not by itself mutable source custody. If exact bytes cannot be materialized into the current build workspace, this slice remains design-locked and the lane must continue with independent traceability/test-denominator work rather than inventing implementation evidence.

## 12. Exact next operation

`LRN-OWNERSHIP-FREEZE-001B-R3B-S01-SOURCE-CUSTODY-AND-BUILD-ADMISSION-001 — MATERIALIZE/VERIFY EXACT 28e331… SOURCE -> MAP LEGACY GOAL SUBSTRATE TO LRN-E001 -> BUILD ONLY IF EXACT CUSTODY HOLDS; OTHERWISE FREEZE BLOCKER AND ADVANCE INDEPENDENT S02 DESIGN FORENSICS`.
