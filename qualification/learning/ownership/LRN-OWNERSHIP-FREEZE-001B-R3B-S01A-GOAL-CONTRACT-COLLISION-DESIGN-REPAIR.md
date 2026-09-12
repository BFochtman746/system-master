# LRN-OWNERSHIP-FREEZE-001B-R3B-S01A — Learning Goal Contract Collision Adjudication + Design Repair

Status: **DESIGN_REPAIR_FROZEN / BUILD_ADMITTED_ON_EXACT_SOURCE / PUBLIC_ROUTE_ACTIVATION_STILL_BLOCKED**  
Date: `2026-09-12`  
Supersedes only the conflicting portions of: `LRN-OWNERSHIP-FREEZE-001B-R3B-S01-LEARNING-GOAL-HANDLER-DESIGN-LOCK.md`  
Pre-mutation reconstruction head re-read: `a8ad1c3fe8fdc34d68301eebfce388e7f6cc2e2d`  
Canonical Learning head re-read: `learning/control-v1@e3196089f77dde376944a08eac78a697e57d1535`

## 1. Why repair was required before BUILD

Targeted archaeology after the initial S01 lock exposed two specification collisions that materially affect executable semantics:

1. `I001 CreateLearningGoal` freezes the semantic payload as `client_operation_id, title, objective, horizon, priority`, while the canonical `LearningGoal` semantic model requires additional state including `subject_ref`, `intended_use`, Learning-local `constraints`, lifecycle `status`, `active_curriculum_ref`, timestamps and `policy_context_refs`.
2. The canonical LearningGoal lifecycle begins at `DRAFT` and includes `DRAFT -> ACTIVE <-> PAUSED -> COMPLETED -> ARCHIVED`, but there is no separate `ActivateLearningGoal` interface. `I002 UpdateLearningGoal` is explicitly defined to create the next goal version/state.

Building the first handler slice without adjudicating those collisions would either fabricate required semantic values or create an ungoverned activation path. That is prohibited.

No external web research was required for this repair because the recovered authoritative Learning artifacts directly answer the design question. Historical numeric-ID-only qualification links remain quarantined and were not used as authority.

## 2. Authority facts preserved

- `LRN-E001 LearningGoal` owner: `MOD-LEARNING-001`.
- Component: `LearningGoalController`.
- Persistence port: `LRN-PERSIST-PORT-001`.
- `LRN-001` acceptance floor: stable ID, outcome, horizon, status, timestamps, external user reference.
- `LRN-076` requirement: goal creation refuses or explicitly leaves unresolved material ambiguity that would change the learning construct or intended use.
- `I001` precondition includes **valid goal intent** and an authorized user; transport metadata is not semantic authorization.
- `I002` produces the next goal version/state with optimistic expected-version checking.
- `I003` requires an active goal and produces `PAUSED`.
- `I004` requires a paused goal and produces `ACTIVE`.
- `I033 LearningGoalCreated` is emitted only after CreateLearningGoal commits.
- `LRN-EXT-001` is the external **Assessment evidence representability** binding owned by Foundation evidence authority; it is not a generic authorization contract and does not give I003 permission to invent evidence/authorization semantics.

## 3. Frozen resolution: preserve I001 wire signature; require a validated domain context envelope

The refrozen 001C I001 semantic payload is not widened in this slice. Instead the handler receives two separately typed inputs:

### 3.1 I001 semantic payload — unchanged

`client_operation_id, title, objective, horizon, priority`

These fields participate in the semantic operation digest.

### 3.2 LearningGoalContextV1 — precondition/context, not transport authority

The route/boundary adapter must supply a validated immutable context object before `LearningGoalController` may execute:

- `subject_ref` — opaque external principal/person reference from an admitted identity context; Learning never owns the identity record.
- `intended_use` — exactly one of `PERSONAL_LEARNING | SKILL_REFRESH | QUALIFICATION_PREP | OTHER_DECLARED`.
- `constraints` — Learning-local session/modality/pacing constraints only; may be an empty canonical collection.
- `policy_context_refs` — admitted immutable policy references applicable to the goal; may be an empty canonical collection when no additional policy ref is required.
- `authority_decision_ref` — opaque admitted semantic-authorization decision reference when/where required by Foundation; absent/unknown public authority fails closed. It is not stored as generic authorization truth.
- `context_version` and `context_digest` — bind exactly what precondition context was evaluated.

`active_curriculum_ref` is initialized to `null` because Curriculum has not yet produced/activated a version. `created_at`/`updated_at` come from the admitted monotonic/wall-clock boundary used by the repository transaction and are bound into the object/receipt; callers may not assert authoritative timestamps through mutable chat/webhook metadata.

The semantic operation digest for I001 binds both the frozen I001 payload and the Learning-owned semantic portions of `LearningGoalContextV1` (`subject_ref`, intended use, Learning-local constraints, policy refs, context version/digest). Mutable transport metadata is excluded.

## 4. Goal-intent normalization rule

`LearningGoalContextV1` may be produced only when the goal intent is materially unambiguous for the requested operation.

- `intended_use` may **not** be guessed, defaulted from UI location, inferred from a job title, or derived solely from mutable chat metadata.
- If the user intent is materially ambiguous such that intended use/construct would change, I001 returns a bounded `ValidationError` with a reason code equivalent to `GOAL_INTENT_REQUIRES_CLARIFICATION` and performs **zero writes**.
- A context may normalize syntactic equivalents (for example an explicit “refresh this skill” request to `SKILL_REFRESH`) only when that mapping is deterministic and evidence-backed by the admitted request context.
- `OTHER_DECLARED` requires a declared intended-use description/reference; it is not a catch-all default.
- This normalization is Learning-owned semantic work. It does not create identity, privacy, authorization, Book, Documents, Programming or Curriculum truth.

## 5. Initial lifecycle and activation adjudication

### 5.1 I001 always creates `DRAFT`

`CreateLearningGoal` creates `LearningGoal v1` in `DRAFT` state. This is the only lossless fail-closed choice supported by the canonical lifecycle because creation evidence does not itself establish that every later activation/readiness condition is satisfied.

`I033 LearningGoalCreated` means **goal record created**, not activated, mastered, approved or curriculum-ready.

### 5.2 I002 owns the existing generic version/state transition surface

Within S01, `UpdateLearningGoal` may apply LearningGoal-owned field patches and these lifecycle transitions only:

- `DRAFT -> ACTIVE` when the normalized goal-intent context remains valid and all Learning-local required fields are complete;
- `ACTIVE -> COMPLETED` when an explicit admitted user/product-policy decision requests completion;
- `COMPLETED -> ARCHIVED` when an explicit admitted archive decision exists;
- non-state field updates that preserve the current legal lifecycle state.

The handler must reject direct I002 attempts to perform `ACTIVE -> PAUSED` or `PAUSED -> ACTIVE`; those remain dedicated I003/I004 semantics. It must also reject `DRAFT -> PAUSED`, `DRAFT -> COMPLETED`, `PAUSED -> COMPLETED` and any transition not explicitly admitted above in this slice. Reopening a completed goal is preserved as a known canonical semantic possibility but remains outside S01 until a separate exact policy/interface adjudication defines it; it may not be guessed into the implementation.

This does not create a new interface or silently widen I002: 001C already defines I002 as producing the next goal version/state.

## 6. I003 / LRN-EXT-001 repair

The `LRN-EXT-001` reference on I003 is not a permission for pause to mutate shared evidence. It is a boundary dependency indicating that Learning may have evidence-related downstream implications while shared evidence authority remains canonical.

For the S01 local handler:

- pausing the LearningGoal is a Learning-owned atomic state transition only;
- no shared evidence write is performed;
- no mastery/evidence state is deleted or rewritten;
- any later evidence/projection reaction is separately reconciled by admitted contracts/events;
- absence of the external evidence fixture cannot cause the local goal object to fabricate evidence standing.

Public/shared integration involving LRN-EXT-001 remains feature-gated by its existing Foundation evidence fixture obligations.

## 7. Repository/event boundary repair required before handler BUILD

The recovered source exposes two implementation gaps that are now part of S01 BUILD rather than hidden assumptions:

1. The owner event allow-list must explicitly admit `LearningGoalCreated` for `MOD-LEARNING-001` before I033 can be staged through the owner-scoped boundary.
2. Versioned updates (I002/I003/I004) require a repository primitive equivalent to `atomic_versioned_mutation` that performs, in one transaction:

`operation replay/conflict check -> authoritative current-version lock/read -> expected-version + lifecycle validation -> immutable next object version insert -> immutable operation receipt -> admitted outbox event(s) if any -> commit`.

A read followed by a separate append followed by a separate receipt write is not sufficient.

The primitive must return/reconcile the committed result directly and never rely on projection read-after-write freshness.

## 8. Revised S01 object floor

Every persisted `LearningGoal` version in S01 must contain or deterministically bind:

- `goal_id`;
- `version`;
- external `subject_ref`;
- `title`;
- `objective`;
- explicit `intended_use`;
- normalized `target_retention_horizon` from I001/I002 horizon semantics;
- `priority`;
- Learning-local `constraints`;
- lifecycle `status`;
- nullable `active_curriculum_ref` (reference only; Curriculum remains owner);
- `created_at`, `updated_at`;
- `policy_context_refs`;
- `context_version/context_digest` sufficient to reproduce the admitted semantic precondition;
- owner/integrity metadata required by the repository contract.

Goal completion remains distinct from mastery. No status transition may imply mastery, retention, transfer, qualification, certification or curriculum approval.

## 9. Revised isolated denominator — 38 cases

The prior S01 32-case denominator is superseded by 38 cases. All original cases remain, with these additions/repairs:

### Goal-context / normalization additions
33. missing `subject_ref` fails closed with zero writes;
34. missing/ambiguous `intended_use` fails with bounded clarification reason and zero writes;
35. `OTHER_DECLARED` without declared-use detail/reference fails validation;
36. caller/chat/webhook metadata cannot override the immutable validated context;
37. I001 creates `DRAFT`, never silently `ACTIVE`;
38. I002 allows only the explicitly admitted S01 lifecycle transitions; dedicated pause/resume transitions cannot be smuggled through a generic patch.

The prior cases that test owner bypass, idempotency, CAS, crash reconciliation, outbox, stale projections and no partial state remain mandatory.

If the frozen 104-test predecessor denominator remains applicable and is rerun on the exact changed source, immediate portable cumulative target becomes `142/142`.

## 10. Build admission standing

Exact mutable source custody has now been independently materialized for this run from Library:

- source: `LRN_CUR_PRODUCTION_BINDING_001_REBOUND_SOURCE.zip`
- required SHA-256: `28e3317e5494c9df7df2f8aefb7f83f7c69fbc9d0ababfb696700542c831edc3`
- locally verified SHA-256: exact match

This closes the **local source-custody** blocker for S01 BUILD. It does not create repository-native source authority, production deployment, live PostgreSQL, Master Core activation, native iPhone or external/human evidence.

## 11. Exact next operation

`LRN-OWNERSHIP-FREEZE-001B-R3B-S01B — EXACT-SOURCE LEARNING GOAL BUILD: OWNER EVENT ALLOW-LIST + ATOMIC VERSIONED MUTATION + LEARNING GOAL CONTROLLER I001-I004/I033 + 38-CASE ISOLATED QUALIFICATION`.

Public/shared route activation remains `BLOCKED_EXTERNAL_FOUNDATION_CONTRACT_ADMISSION`; BUILD may proceed as owner-local portable implementation and exact-subject qualification without pretending that blocker is resolved.