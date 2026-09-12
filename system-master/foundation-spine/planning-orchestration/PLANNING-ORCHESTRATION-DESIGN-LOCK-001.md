# PLANNING-ORCHESTRATION-DESIGN-LOCK-001

Date: 2026-09-12
Owner: `SYSTEM_MASTER/FOUNDATION_SPINE`
Predecessor recovery inventory commit: `6c702e6127c39fe7d528bcd1fec6b0912f13ac30`
Upstream Work/Project freeze commit: `f53da2bd85b764bdefcd6e61949c1656f1dd1091`
Upstream exact Work/Project implementation subject: `d1efd34515e2685ee950e7e2783c3ff7ec4e5a85`
Status: **DESIGN LOCKED / IMPLEMENTATION NOT YET CLAIMED / FRESH EXACT-SUBJECT QUALIFICATION REQUIRED**

## 1. Purpose

Freeze the smallest sufficient canonical **Planning & Orchestration** authority immediately downstream of frozen Work & Project Control.

This design creates one truth owner for executable Plan revisions and Plan-Step graph/readiness semantics. It does not revive historical Engineering Planning as runtime authority, does not reinterpret historical `021I` worker orchestration as plan orchestration, and does not absorb Resource Admission, Routing, Placement, Durable Runtime, Effect, Evidence, Recovery or specialist truth.

Historical implementation and qualification evidence are donor evidence only. No historical PASS transfers to the fresh Planning subject.

## 2. Canonical question

**What exact Plan revision and Step graph should satisfy the active governed goal for this Work?**

Planning & Orchestration owns that answer and only that answer.

Constitutional rule: **planning is not permission**.

A Plan may declare what needs to happen. It cannot grant capacity, choose a currently qualified provider route, place a concrete executor, mint a runtime lease/fence, authorize an external effect, certify specialist correctness, manufacture evidence or authorize recovery.

## 3. Authority boundary

### 3.1 Owns

Planning owns:

- durable Plan identity;
- immutable/revisioned Plan content and current-revision pointer;
- exact binding of every Plan revision to one Work and one exact governed Goal revision;
- Plan-Step identity and immutable Step specification per Plan revision;
- DAG edges, dependency semantics, conditional branches and joins;
- deterministic Plan-level readiness;
- bounded Plan-level parallelism declarations;
- human-wait representation as an external-decision reference;
- Plan-level `UNKNOWN`, partial-success and blocked semantics;
- replanning and Plan revision supersession within current upstream authority;
- Plan-level checkpoints/reconstruction state;
- completion predicates that can establish only `COMPLETION_READY` for the Plan;
- immutable downstream Step-readiness handoff references;
- read models/projections of Plan/Step standing with explicit freshness;
- Planning journal/event history, revisions, idempotency and stale-writer rejection.

### 3.2 Does not own

Planning does not own:

- user intent, outcome, scope, constraints, success criteria, cancellation or supersession truth — Intent / Keel owns them;
- Work/Project identity, hierarchy, milestones or management lifecycle — Work & Project Control owns them;
- principal identity or concrete delegation grants — Identity, Principal & Delegation owns them;
- schema/contract compatibility standing — Contracts & Versioning owns it;
- policy/privacy/rights/safety authorization — their canonical owners own it;
- resource budgets, queueing, admission, reservations, grants or accounting — Resource Admission & Budgeting owns them;
- capability/provider registry or route decisions — Capability Registry & Routing owns them;
- concrete executor eligibility/scoring/assignment — Execution Placement owns it;
- job/attempt lifecycle, runtime retry/timer/heartbeat/lease/fence/checkpoint truth — Durable Execution Runtime owns it;
- transport delivery truth — Transport & Delivery owns it;
- model/tool/provider/specialist invocation truth — gateways/specialist owners own it;
- external-effect authorization or commit receipts — Effect / Action Authority owns them;
- artifact bytes/version truth — Artifact Gateway owns it;
- qualification/completion evidence truth — Evidence, Provenance & Assurance owns it;
- recovery authorization/reconciliation truth — Recovery & Reconciliation coordinates current owners;
- UI/chat/telemetry projections as canonical truth;
- specialist semantic correctness.

Any implementation that introduces one of those competing authorities violates this lock.

## 4. Exact upstream binding

Planning accepts only an immutable `WorkPlanningRefV1` from frozen Work & Project Control. It must bind field-for-field:

- `workId`;
- current Work `entityRevision`;
- exact active `GovernedGoalRefV1`;
- `projectId` if present;
- `parentWorkId` if present;
- Work lifecycle standing;
- relevant management blocker references;
- Work/Project `registryRevision`;
- canonical `WorkPlanningRefV1` digest.

Rules:

1. Planning never edits or reconstructs the Work or Goal identity.
2. Plan activation requires a structurally valid exact `WorkPlanningRefV1` and an exact admitted Planning contract subject/version/digest.
3. New actionable planning is forbidden for Work standing `CLOSING` or `CLOSED`.
4. `OPEN`, `ACTIVE`, `PAUSED` and `BLOCKED` Work may be planned; Work blockers remain references and cannot be cleared by Planning.
5. Planning may dereference the exact `GovernedGoalRefV1` through Keel to read the immutable governed `GoalRevisionV1` or a digest-identical bounded Keel projection. Any local copy is a cache/projection, never Goal authority.
6. A replan within the same Goal revision is permitted when all current hard constraints remain satisfied.
7. A replan against a newer revision of the same `goalId` is permitted only when Work & Project has already produced a new exact `WorkPlanningRefV1` binding that revision.
8. A different `goalId` cannot be rebound to the existing Work or Plan lineage; it requires upstream creation of a new Work identity.
9. A stale or no-longer-current Work/Goal binding may remain historical provenance but cannot emit new Step-readiness handoffs.

## 5. Canonical identity and revision model

### 5.1 `PlanIdentityV1`

Create-once fields:

- `planId` — globally unique stable Plan-lineage identity;
- `workId`;
- `createdByPrincipalRef`;
- `createdAt`;
- exact Planning contract subject/version/digest;
- identity digest.

A `planId` cannot move to another `workId`.

A Work may have multiple historical Plan lineages, but **at most one actionable current Plan revision across all Plan lineages for that Work**. A second concurrent actionable Plan is rejected in V1. Historical terminal Plan lineages remain immutable.

### 5.2 `PlanRevisionV1`

Immutable published revision fields:

- `planId`;
- monotonic `planRevision` beginning at `1`;
- deterministic/content-bound `planRevisionId`;
- `parentPlanRevisionRef`, nullable only for first revision;
- exact embedded/bound `WorkPlanningRefV1` plus its digest;
- exact `workId`;
- exact active `GovernedGoalRefV1` plus goal revision/content digest;
- `standing`;
- ordered Step-spec digest set;
- ordered edge digest set;
- Plan completion-predicate digest;
- Plan requirement/constraint digest;
- `createdByPrincipalRef`;
- `createdAt`;
- Planning `registryRevision` observed at commit;
- prior Planning event digest;
- canonical `planContentDigest` over the full immutable revision payload.

Published revisions are immutable. Any material graph, Step, condition, requirement, completion-predicate or upstream-binding change creates a new Plan revision.

### 5.3 Plan revision standing

Locked standings:

- `DRAFT` — mutable candidate only; not actionable authority and cannot emit downstream readiness;
- `ACTIVE` — current actionable revision;
- `BLOCKED` — current revision cannot advance until an exact blocking basis changes;
- `REPLAN_REQUIRED` — current revision cannot emit new readiness; successor revision required or Plan cancelled;
- `COMPLETION_READY` — all Plan-owned completion predicates are satisfied; no new Step handoffs; this is **not** Work/Goal completion;
- `SUPERSEDED` — terminal historical revision replaced by a newer activated revision;
- `CANCELLED` — terminal Planning standing; does not assert downstream work/effects were cancelled.

Legal transitions:

- candidate creation -> `DRAFT`;
- `DRAFT -> ACTIVE | CANCELLED`;
- `ACTIVE -> BLOCKED | REPLAN_REQUIRED | COMPLETION_READY | CANCELLED | SUPERSEDED`;
- `BLOCKED -> ACTIVE | REPLAN_REQUIRED | CANCELLED | SUPERSEDED`;
- `REPLAN_REQUIRED -> SUPERSEDED | CANCELLED`;
- `COMPLETION_READY -> REPLAN_REQUIRED | SUPERSEDED | CANCELLED` when external completion adjudication or new upstream truth requires more planning;
- `SUPERSEDED` and `CANCELLED` are terminal.

Activating a successor revision and superseding the prior actionable revision occur in one canonical transaction. Failed successor activation leaves the prior revision unchanged.

## 6. Step model

### 6.1 `PlanStepSpecV1`

Required fields:

- `planRevisionId`;
- `stepId` — stable logical Step identity within a Plan lineage;
- monotonic `stepRevision` when the logical Step is retained but materially changed;
- `kind`;
- `completionRole`;
- exact `requirementsDigest`;
- optional `conditionSpecRef`;
- optional `humanWaitSpecRef`;
- optional `completionPredicateRef`;
- canonical `stepContentDigest`.

Locked `kind` values:

- `EXECUTION` — declares bounded downstream work requirements only;
- `HUMAN_WAIT` — waits for an externally owned human/control decision reference;
- `CONDITION` — deterministic bounded predicate evaluation;
- `JOIN` — graph synchronization only.

Locked `completionRole` values:

- `REQUIRED`;
- `OPTIONAL`;
- `CONDITIONAL`.

A Step specification contains no concrete route, provider selection, resource grant, executor assignment, job/attempt identity, effect authorization or evidence standing.

### 6.2 Planning-owned Step standing

Locked standings:

- `NOT_READY`;
- `READY`;
- `WAITING_EXTERNAL`;
- `SATISFIED`;
- `FAILED`;
- `SKIPPED`;
- `BLOCKED`;
- `UNKNOWN`.

Rules:

- Planning owns only the orchestration interpretation of those standings.
- `READY` means graph/condition prerequisites are met; it does not mean policy/resource/route/execution permission exists.
- `WAITING_EXTERNAL` means an immutable downstream or human-wait association exists; it does not assert that a worker is running.
- `SATISFIED`, `FAILED` or `SKIPPED` requires an exact basis reference/evaluation under the Step completion contract.
- Runtime exit `0`, a log message, UI progress or provider success cannot alone make a Step `SATISFIED` unless the locked completion predicate explicitly accepts an exact owner-issued basis.
- `UNKNOWN` remains unknown and never becomes success by default.

## 7. DAG, branch and join lock

### 7.1 `PlanEdgeV1`

Required fields:

- `edgeId`;
- `planRevisionId`;
- `fromStepId`;
- `toStepId`;
- `gate`;
- canonical edge digest.

Locked gates:

- `ON_SATISFIED`;
- `ON_FAILED`;
- `ON_SKIPPED`;
- `ON_CONDITION_TRUE`;
- `ON_CONDITION_FALSE`;
- `ON_TERMINAL`.

Edges always point between Steps in the same immutable Plan revision. Self-edges, missing endpoints and cycles reject the whole candidate revision before publication.

### 7.2 Join semantics

Each Step with multiple applicable incoming dependency edges declares exactly one `JoinSpecV1`:

- `ALL` — every applicable incoming edge gate must be satisfied;
- `ANY` — at least one applicable incoming edge gate must be satisfied and no unresolved condition is allowed to masquerade as false;
- `AT_LEAST_N` — exactly one positive integer `n`, `1 <= n <= incoming-edge-count`.

An unresolved/`UNKNOWN` predecessor cannot satisfy a gate. A join may become definitively impossible and therefore `BLOCKED`, but it may not invent success.

### 7.3 Structural safety ceilings

V1 absolute Planning safety ceilings are:

- maximum Steps per Plan revision: **1024**;
- maximum edges per Plan revision: **8192**;
- maximum DAG depth: **64**;
- maximum direct predecessors per Step: **64**;
- maximum direct successors per Step: **64**;
- maximum simultaneously `READY` Steps produced by one readiness evaluation: **64**;
- maximum Plan revisions per Plan lineage before explicit lineage rollover review: **256**.

The effective ceiling is the minimum of these Planning safety ceilings and any stricter current Keel hard constraint. A descendant may never use the Planning cap to widen a stricter Keel bound.

Changing an absolute safety ceiling is a material design/qualification change.

## 8. Condition semantics

### 8.1 `ConditionSpecV1`

Conditions use versioned declarative language `SM_PREDICATE_V1`. No arbitrary code, model call, tool call, network call, random value or wall-clock read may occur inside predicate evaluation.

Allowed AST operators:

- `CONST`;
- exact immutable/reference-bound `REF`;
- `EQ`, `NE`, `LT`, `LTE`, `GT`, `GTE`;
- `IN`;
- `EXISTS`;
- `NOT`;
- `ALL`;
- `ANY`.

Limits:

- maximum AST nodes: **128**;
- maximum AST depth: **16**.

Every non-constant input binds exact owner/ref/version-or-digest metadata. Unknown/missing/incompatible referenced values produce `UNKNOWN`, never guessed boolean truth.

Time waits, external approvals and asynchronous decisions are represented as externally owned wait/basis references; Planning does not implement hidden sleeps or poll external systems from predicate evaluation.

### 8.2 `ConditionEvaluationReceiptV1`

Fields:

- `conditionId`;
- exact `planRevisionId` and `stepId`;
- evaluator id/version = `SM_PREDICATE_V1`;
- ordered exact input refs/digests;
- result `TRUE | FALSE | UNKNOWN | INVALID`;
- reason codes;
- evaluation timestamp/evidence ref;
- deterministic receipt digest.

Same expression + exact inputs must produce the same logical result.

## 9. Human wait semantics

`HumanWaitSpecV1` contains only:

- exact external decision/approval requirement ref;
- owner authority ref;
- required subject binding/digest;
- required accepted standing classes;
- wait-spec digest.

Planning cannot synthesize a human response or approval receipt. A human wait becomes satisfied only from an exact externally owned basis that matches the required subject and accepted standing.

## 10. Declarative Step requirements — needs, not grants

### `PlanStepRequirementsV1`

A Step may declare:

- ordered opaque required capability/contract class refs;
- bounded declared resource-demand items (`dimension`, `amount-or-range`, `unit`, `hardness`);
- deadline/not-before refs where inherited/authorized;
- required policy/privacy/rights/safety decision-class refs;
- data/locality/isolation requirement refs;
- specialist owner/interface refs where applicable;
- inherited Keel constraint/ref set;
- canonical requirements digest.

Rules:

1. These are requirements, never admission/grant/route/placement/effect authority.
2. Planning may narrow demand or requirements when replanning but may not widen Keel ceilings or drop inherited hard constraints.
3. A requirement that Planning cannot compare/refine safely is `UNKNOWN` and blocks activation/handoff rather than being treated as compatible.
4. Concrete provider identity, concrete route choice, reservation/grant id and executor id are forbidden fields in this record.

## 11. Immutable downstream readiness handoff

### `PlanStepReadinessHandoffV1`

When a Step is `READY`, Planning may emit one immutable handoff containing:

- exact `WorkPlanningRefV1` digest;
- exact `GovernedGoalRefV1`;
- `PlanRefV1`;
- `PlanStepRefV1`;
- exact `PlanStepRequirementsV1` plus digest;
- readiness receipt/ref digest;
- Planning `registryRevision`;
- exact Planning contract subject/version/digest;
- canonical handoff digest.

This handoff enters the downstream policy/privacy/rights/safety and Resource Admission chain. It is **not** permission to execute.

Forbidden in the handoff as Planning-owned truth:

- resource reservation/grant;
- route/provider decision;
- executor assignment;
- job/attempt/lease/fence;
- effect permission/receipt;
- evidence/qualification standing.

### `PlanRefV1`

Minimum fields:

- `planId`;
- `planRevision`;
- `planRevisionId`;
- exact `workId`;
- exact governed Goal revision id/content digest;
- `WorkPlanningRefV1` digest;
- Plan content/graph digests;
- current Plan revision standing;
- Planning `registryRevision`;
- canonical Plan-ref digest.

### `PlanStepRefV1`

Minimum fields:

- exact `PlanRefV1` digest;
- `stepId`;
- `stepRevision`;
- `stepContentDigest`;
- `requirementsDigest`;
- readiness standing/receipt digest;
- canonical Step-ref digest.

## 12. Downstream association references

Planning may record immutable `StepAssociationV1` pointers for returned downstream facts:

- `POLICY_DECISION`;
- `ADMISSION`;
- `ROUTE`;
- `RESOURCE_GRANT`;
- `ASSIGNMENT`;
- `JOB`;
- `ATTEMPT`;
- `EFFECT`;
- `ARTIFACT`;
- `EVIDENCE`;
- `COMPLETION_BASIS`;
- `RECOVERY_EPISODE`.

Each association binds exact owner authority, external ref, version/digest where available and recording time. It never transfers external truth ownership into Planning.

## 13. Replanning and invalidation

### 13.1 Replanning

`CreatePlanRevision`:

- retains the same `planId` and `workId`;
- increments `planRevision` by exactly one;
- binds exact current `WorkPlanningRefV1`;
- preserves same `goalId`;
- may use the same goal revision for structural/recovery replanning;
- may use a strictly newer same-`goalId` revision only after Work & Project has explicitly rebound and emitted the matching new `WorkPlanningRefV1`;
- cannot bind an older goal revision;
- cannot bind a different `goalId`;
- cannot widen inherited hard constraints, delegation/resource/action ceilings or privacy/human-control restrictions;
- cannot silently reuse stale downstream route/grant/assignment/job authority from the prior revision.

Activation of the successor and supersession of the prior actionable revision is atomic.

### 13.2 Invalidation / replan-required triggers

At minimum:

- upstream Work revision/digest no longer current where currentness is required;
- exact Goal revision is superseded/retired or Work has rebound to a newer Goal revision;
- a current owner reports a hard policy/privacy/rights/safety incompatibility requiring plan change;
- Resource Admission or Routing reports the declarative Step requirements cannot be satisfied and requests replan rather than ordinary queue/retry;
- exact required contract incompatibility;
- Plan journal corruption/ambiguity;
- external completion adjudication rejects `COMPLETION_READY` and requires additional plan work.

Provider health fluctuation, queue delay, resource pressure or ordinary retry does **not** by itself authorize Planning to rewrite the Plan. The downstream owner decides whether to queue/retry/re-route/reassign within its authority or return a bounded replan requirement.

### 13.3 Supersession and in-flight work

Plan supersession stops new handoffs from the old revision. It does not claim that already admitted/routed/running/effectful work was cancelled.

When cancellation of old downstream work is required, Planning emits an immutable cancellation intent/reference through the downstream owner contract. Durable Runtime/Effect/Recovery owners establish what actually stopped or committed.

## 14. Completion and partial-success lock

### `PlanCompletionPredicateV1`

A Plan completion predicate is deterministic over exact Planning Step standings and exact externally owned basis references. It may establish only whether the Plan is `COMPLETION_READY`.

Rules:

- all `REQUIRED` Steps must be `SATISFIED` unless an exact current partial-success policy/criterion reference explicitly permits another standing;
- `OPTIONAL` Steps may be `SATISFIED`, `SKIPPED` or failed only when the locked predicate allows it;
- `CONDITIONAL` Steps are required only on the selected condition branch;
- any required `UNKNOWN`, unresolved wait or incompatible basis blocks completion readiness;
- job/attempt success alone is not a completion basis;
- specialist result existence alone is not specialist correctness;
- `COMPLETION_READY` does not close Work, satisfy the Goal or promote qualification standing;
- final Work/Goal completion remains an external owner/evidence decision referenced back into Planning/Work as appropriate.

Partial success without an exact upstream/policy basis is not success.

## 15. Plan-level checkpoint and reconstruction

### `PlanningCheckpointV1`

Fields:

- exact `planRevisionId` and Plan content/graph digests;
- checkpoint sequence;
- Planning `registryRevision` / journal position digest;
- current Planning-owned Step standings with exact basis refs/digests;
- condition-evaluation receipt digests;
- join/readiness state;
- outstanding external/human wait refs;
- prior checkpoint digest;
- created-at evidence ref;
- checkpoint digest.

A Planning checkpoint contains **no** worker memory, runtime job/attempt state, route/grant/assignment authority or external-effect truth.

Resume is allowed only when the checkpoint exactly matches the current Plan revision and required contract/upstream identities. A checkpoint from a superseded/incompatible revision is historical evidence only and cannot resume current planning.

## 16. Canonical persistence, idempotency and concurrency

Planning uses an append-only hash-chained journal or transactionally equivalent Canonical Data primitive.

Every mutating command binds:

- `commandId`;
- `idempotencyKey`;
- actor/principal ref;
- expected Planning `registryRevision`;
- expected Plan/Step entity revision where applicable;
- exact request payload digest;
- exact Planning contract subject/version/digest;
- prior event/transaction digest.

Rules:

1. validate the complete command and current-state prerequisites before durable mutation;
2. success acknowledgement follows durable commit;
3. same idempotency key + same request digest returns the same semantic committed result;
4. same idempotency key + different request digest fails closed as `IDEMPOTENCY_CONFLICT`;
5. stale expected revision fails before mutation;
6. successful entity mutation increments exactly once;
7. global Planning `registryRevision` is monotonic;
8. replay validates framing, hashes, revision monotonicity and parent digest continuity;
9. corrupt/truncated/reordered/gapped history fails closed;
10. query indexes/current pointers are reconstructable projections;
11. crash before commit cannot expose success;
12. crash after commit replays the exact mutation without duplication;
13. no last-writer-wins mutation is allowed for authoritative Planning state.

## 17. Command boundary

Minimum semantic commands:

1. `CreatePlan`;
2. `CreatePlanRevision`;
3. `ActivatePlanRevision`;
4. `RecordStepAssociation`;
5. `RecordStepBasis`;
6. `RecordConditionEvaluation`;
7. `RecordHumanWaitBasis`;
8. `MarkPlanBlocked`;
9. `MarkPlanReplanRequired`;
10. `EvaluatePlanCompletion`;
11. `CancelPlanRevision`;
12. `RecordPlanningCheckpoint`.

The implementation may combine internal methods, but externally observable semantics must remain equivalent. No command may directly mutate Work/Goal, resource, route, placement, job/attempt, effect, artifact, evidence or specialist-owner state.

## 18. Query boundary

Minimum queries:

- `GetPlan(planId, revision?)`;
- `GetCurrentPlanForWork(workId)`;
- `GetPlanStep(planRevisionId, stepId)`;
- `GetPlanGraph(planRevisionId)`;
- `GetStepReadiness(planRevisionId, stepId)`;
- `ListReadySteps(planRevisionId)`;
- `ListStepAssociations(planRevisionId, stepId, kind?)`;
- `GetPlanningCheckpoint(planRevisionId)`;
- `GetPlanTimeline(planId, cursor)`.

Read models include:

- authoritative Planning revision/registry revision;
- projection timestamp;
- freshness `CURRENT | STALE | UNKNOWN | DEGRADED`.

Read models never become Planning authority.

## 19. Bounded rejection/error taxonomy

At minimum:

- `UNKNOWN_WORK_REF`;
- `WORK_REF_DIGEST_MISMATCH`;
- `WORK_NOT_ACTIONABLE`;
- `WORK_REVISION_STALE`;
- `GOAL_REF_INVALID`;
- `GOAL_REVISION_STALE`;
- `CROSS_WORK_PLAN_REBIND`;
- `CROSS_GOAL_PLAN_REBIND`;
- `PLAN_IDENTITY_CONFLICT`;
- `PLAN_REVISION_CONFLICT`;
- `PLAN_CURRENT_POINTER_CONFLICT`;
- `PLAN_LIMIT_EXCEEDED`;
- `STEP_IDENTITY_CONFLICT`;
- `MISSING_STEP_DEPENDENCY`;
- `DAG_SELF_EDGE`;
- `DAG_CYCLE`;
- `DAG_DEPTH_EXCEEDED`;
- `FAN_IN_OUT_EXCEEDED`;
- `PARALLEL_READINESS_EXCEEDED`;
- `JOIN_INVALID`;
- `CONDITION_INVALID`;
- `CONDITION_UNKNOWN_INPUT`;
- `HUMAN_BASIS_MISSING_OR_MISMATCHED`;
- `HARD_REQUIREMENT_WIDENED`;
- `UNKNOWN_REFINEMENT_COMPARATOR`;
- `STEP_NOT_READY`;
- `STALE_PLAN_HANDOFF`;
- `COMPLETION_BASIS_MISSING`;
- `REQUIRED_STEP_UNKNOWN_OR_FAILED`;
- `IDEMPOTENCY_CONFLICT`;
- `PLANNING_REGISTRY_REVISION_CONFLICT`;
- `PLANNING_JOURNAL_CORRUPT`;
- `CHECKPOINT_INCOMPATIBLE`;
- `DOWNSTREAM_AUTHORITY_FIELD_FORBIDDEN`.

Unknown critical standing never becomes allow/success.

## 20. Isolated qualification denominator — 80 cases

A fresh implementation must pass **80 isolated adversarial cases on the same exact implementation subject** before any Planning freeze claim.

### A. Identity and exact upstream binding — 10

1. create Plan identity from exact valid `WorkPlanningRefV1`;
2. duplicate Plan identity rejects;
3. malformed Plan identity rejects with zero mutation;
4. unknown Work ref rejects;
5. Work-ref digest mismatch rejects;
6. stale Work entity revision rejects new actionable Plan activation;
7. exact governed Goal ref persists field-for-field in Plan revision;
8. cross-Work Plan rebinding rejects;
9. different `goalId` replan rejects;
10. strictly newer same-`goalId` revision is accepted only through the matching new exact `WorkPlanningRefV1`.

### B. Plan revision/current-pointer discipline — 10

11. first published Plan revision is `1`;
12. exact command replay returns exact logical result;
13. idempotency key + different request conflicts;
14. stale expected Planning registry revision rejects without mutation;
15. successor revision increments exactly one;
16. same next revision with different content digest rejects fork conflict;
17. activating successor atomically supersedes prior actionable revision;
18. failed successor activation leaves prior current revision unchanged;
19. superseded revision cannot emit new Step handoff;
20. V1 rejects a second concurrent actionable Plan for the same Work.

### C. DAG and structural limits — 14

21. valid linear DAG publishes;
22. valid parallel DAG with deterministic join publishes;
23. self-edge rejects;
24. direct two-node cycle rejects;
25. multi-node cycle rejects;
26. edge to missing Step rejects;
27. duplicate Step id with conflicting content rejects;
28. conflicting duplicate edge identity rejects;
29. exactly 1024 Steps is structurally admissible when all other limits pass;
30. 1025 Steps rejects;
31. exactly 8192 edges is structurally admissible when all other limits pass;
32. 8193 edges rejects;
33. depth 64 is admissible and depth 65 rejects in the same bounded case family;
34. fan-in/fan-out, ready-width or malformed `AT_LEAST_N` beyond the locked bounds rejects.

### D. Readiness, conditions, joins and human waits — 14

35. active root execution Step becomes `READY`;
36. Draft/Blocked/Replan-required Plan cannot emit ready handoff;
37. required predecessor `SATISFIED` can unlock dependent Step;
38. required predecessor `UNKNOWN` cannot unlock dependent Step;
39. failed required predecessor blocks ordinary required path;
40. `ALL` join requires every applicable gate;
41. `ANY` join requires at least one resolved satisfied gate without treating unknown as false proof;
42. valid `AT_LEAST_N` join unlocks only at threshold;
43. unknown predicate language/version rejects or yields invalid, never allow;
44. same `SM_PREDICATE_V1` expression + exact inputs is deterministic;
45. mutable/unversioned external condition input rejects;
46. true/false condition branches activate only the matching edge set;
47. human wait without matching external basis remains `WAITING_EXTERNAL`;
48. exact matching external human/control basis can satisfy the wait; Planning cannot synthesize the basis.

### E. Downstream handoff and negative ownership — 10

49. `PlanStepReadinessHandoffV1` binds exact Work/Goal/Plan/Step/requirements/readiness digests;
50. Step requirements can declare resource demand but contain no resource grant/reservation truth;
51. Planning cannot mint/select a capability/provider route;
52. Planning cannot mint/select a concrete executor assignment;
53. Planning cannot mint job/attempt/lease/fence truth;
54. Planning cannot mint external-effect permission/receipt;
55. Planning cannot mint evidence/qualification standing;
56. incompatible/unknown requirement refinement blocks handoff rather than widening authority;
57. downstream grant/route/assignment/job results may be stored only as external association refs;
58. stale/superseded Plan revision handoff rejects even when an old downstream grant still exists.

### F. Persistence, replay, checkpoint and concurrency — 10

59. successful mutation is acknowledged only after durable commit;
60. full replay reconstructs identical current Plan/Step state;
61. corrupt journal fails closed;
62. truncated journal fails closed;
63. event/hash-chain discontinuity fails closed;
64. compatible Planning checkpoint accelerates reconstruction without changing truth;
65. checkpoint from wrong Plan revision/content/graph digest rejects;
66. concurrent exact duplicate mutation converges to exact replay result;
67. concurrent conflicting mutations yield one canonical commit and stale/conflict result for the other;
68. crash after durable commit replays exactly once with no duplicate mutation.

### G. Replan, partial success, completion and cancellation — 12

69. all required Step completion predicates satisfied can produce `COMPLETION_READY`;
70. required failed Step without exact partial-success policy prevents completion readiness;
71. optional failed/skipped Step is accepted only when the locked completion predicate allows it;
72. required `UNKNOWN` Step blocks completion readiness;
73. runtime/job exit success without accepted exact Step basis cannot satisfy the Step;
74. specialist result existence without owner/evidence basis cannot satisfy specialist criterion;
75. `COMPLETION_READY` does not close Work or satisfy Goal;
76. replan within same Work and same governed Goal revision may create successor revision;
77. replan cannot widen/drop inherited hard Keel constraints or ceilings;
78. Plan supersession stops new old-revision handoffs but does not assert downstream cancellation success;
79. upstream Work/Goal cancellation/supersession stops new handoffs and records only bounded cancellation/replan intent until downstream owners reconcile;
80. historical donor/021/F-WP/Engineering-Planning PASS cannot satisfy qualification of the fresh Planning implementation subject.

## 21. Cumulative qualification/calibration before freeze

The **same exact Planning implementation SHA/tree** may freeze only when it passes:

- all 80 isolated Planning cases;
- current System Root qualification;
- current Identity / Principal / Delegation qualification;
- current Contracts & Versioning qualification;
- current Intent / Keel qualification;
- current Work & Project Control 64-case qualification;
- all locked Planning structural/ownership checks;
- selected donor regression only for behaviors actually reused, never as transferred standing;
- cumulative causal-binding checks proving exact `Work -> Goal -> Plan -> Step` identities survive persistence/replay;
- negative-authority checks proving Planning cannot mint Resource, Route, Assignment, Runtime, Effect or Evidence authority.

Step-level implementation must follow the adopted continuous qualification loop: implement one dependency-creating step, run every runnable compile/static/functional/negative/fault/invariant gate, preserve evidence, then permit the next dependent step.

A-01, native/device/provider-live, endurance, human and production evidence remain separate classes. Hosted portable PASS cannot silently promote them.

## 22. Build packet and stop fences

Dependency-valid successor:

**`CORE-PLANNING-ORCHESTRATION-BUILD-001 — DURABLE PLAN IDENTITY/REVISION + PLAN STEP DAG/READINESS/CONDITIONS/JOINS + REPLAN/INVALIDATION + PLAN-LEVEL CHECKPOINT + IMMUTABLE DOWNSTREAM READINESS HANDOFF + 80-CASE ISOLATED QUALIFICATION + CUMULATIVE ROOT/IDENTITY/CONTRACTS/KEEL/WORK REGRESSION`**

Implementation stop fences:

- if exact Work/Goal currentness cannot be validated without inventing Work/Keel authority, stop and emit the cross-owner dependency;
- if a Step cannot be represented without minting a Resource grant, Route, Assignment, Job/Attempt/Fence, Effect permission, Evidence standing or specialist truth, stop and emit that owner dependency;
- if a required policy/privacy/rights/safety or capability contract is not available, preserve the Plan as blocked/replan-required rather than synthesizing a permissive decision;
- if the build requires widening one of the locked safety ceilings or authority boundaries, return to design review and fresh qualification rather than changing tests to fit implementation.

No code mutation is authorized outside this locked boundary.
