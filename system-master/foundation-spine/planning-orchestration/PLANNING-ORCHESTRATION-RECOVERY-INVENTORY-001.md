# PLANNING-ORCHESTRATION-RECOVERY-INVENTORY-001

Date: 2026-09-12
Owner: `SYSTEM_MASTER/FOUNDATION_SPINE`
Parent frozen Work/Project commit: `f53da2bd85b764bdefcd6e61949c1656f1dd1091`
Upstream exact Work/Project implementation subject: `d1efd34515e2685ee950e7e2783c3ff7ec4e5a85`
Branch: `foundation/planning-orchestration-recovery-001-20260912`
Status: **RECOVERY INVENTORY CLOSED / DONOR OWNERSHIP CHALLENGED / NO PLANNING IMPLEMENTATION OR FREEZE CLAIM / DESIGN LOCK NEXT**

## Purpose

Recover and ownership-challenge predecessor material that can safely inform the rebuilt canonical **Planning & Orchestration** authority immediately downstream of frozen Work & Project Control.

This packet is an architecture recovery inventory only. It does not promote historical planning code, historical `021I` worker-orchestration semantics, the Engineering Planning capability ledger, or old F-WP behavior into current implementation authority. No historical PASS transfers to a future Planning subject.

## Controlling canonical authority

The current Foundation & Spine System Specification asks Planning & Orchestration one question:

> What plan revision and step graph should satisfy the active goal?

The current specification gives Planning ownership of:

- executable plan identity and immutable plan revisions;
- exact binding to the current Work identity and governed Keel goal revision;
- plan-step identity and step graph/DAG structure;
- step dependencies;
- conditional branches and joins;
- plan-step readiness semantics;
- bounded parallelism declarations at the plan level;
- human-wait representation;
- partial-success handling at the plan level;
- replanning decisions within the unchanged governed goal constraints;
- plan-level orchestration state and restart-reconstructable checkpoints;
- completion predicates that determine when the plan may request completion adjudication.

The constitutional rule remains: **planning is not permission**. A plan cannot grant resource capacity, select a currently qualified provider route, assign an executor, authorize an external effect, certify specialist correctness, manufacture evidence, or authorize recovery.

The current causal chain remains:

`User Intent -> Governed Goal Revision -> Work / Project -> Plan Revision -> Plan Step -> Policy / Privacy / Rights / Safety Decision Set -> Provisional Resource Admission -> Capability Route -> Exact Resource Grant -> Executor Assignment -> Durable Job -> Execution Attempt + Fence -> Invocation -> Effects -> State/Artifact -> Evidence -> Completion Decision -> Terminal State/Recovery`

## Exact upstream handoff: Work/Project -> Planning

The frozen Work/Project design exposes immutable `WorkPlanningRefV1`.

Minimum fields are:

- `workId`
- current Work `entityRevision`
- exact active `GovernedGoalRefV1`
- `projectId` if present
- `parentWorkId` if present
- Work lifecycle standing
- relevant management blocker references
- Work/Project `registryRevision`
- canonical digest of the reference

Planning must consume and bind that exact reference. It may not rewrite Work identity, Project membership, Work lifecycle truth, or the Keel-owned governed goal.

Every Plan revision must bind at minimum the exact `workId`, exact governed `goalId` + goal revision identity/digest, and exact upstream `WorkPlanningRefV1` digest that it planned against.

If Work or goal standing changes in a way that invalidates the bound reference, Planning must become stale/replan-required or fail closed. It may not silently reinterpret the old plan as current.

## Recovery finding 1: no current Planning implementation authority exists

The live recovery branch begins at the frozen Work/Project subject and contains no separate current Planning implementation tree, design lock, qualification workflow, qualification receipt or freeze artifact.

Therefore this inventory does not select an existing implementation for promotion. Planning must receive a fresh design lock and fresh exact-subject implementation/qualification lineage.

## Recovery finding 2: historical Engineering Planning is donor material, not runtime authority

Historical Programming/Engineering Planning ledgers contain useful concepts such as:

- plan lineage and invalidation;
- replan scoping;
- plan requirement/source change propagation;
- plan execution feedback;
- cancellation semantics;
- plan traceability and auditability;
- orchestration handoff;
- execution-resource requirement projection;
- workspace/security/specialist handoff records;
- quality-gate and validation metadata.

Those artifacts explicitly describe planning evidence/results and deny delegated orchestration/security/assurance authority. They are therefore **donor patterns only**.

Adjudication:

| Historical concern | Current Planning disposition |
|---|---|
| plan lineage / plan invalidation | **KEEP AS DONOR PATTERN** for immutable revision lineage and stale-plan invalidation |
| replan scope | **KEEP AS DONOR PATTERN** but replan remains bounded by exact current Keel constraints |
| source/requirement change propagation | **KEEP AS INVALIDATION INPUT PATTERN**; source authorities remain canonical owners |
| execution feedback | **KEEP AS INPUT/REFERENCE PATTERN ONLY**; Planning does not own runtime/effect/evidence truth |
| plan cancellation semantics | **KEEP AS PLAN-STATE CONCERN** but Work/Keel cancellation truth remains upstream and runtime cancellation mechanics remain downstream |
| plan traceability / auditability | **KEEP AS PROVENANCE REQUIREMENT**; Evidence/Assurance remains evidence owner |
| orchestration handoff | **KEEP CONCEPT, REDESIGN CONTRACT** against current Work/Resource/Routing/Runtime boundaries |
| execution resource requirement | **KEEP AS DECLARATIVE STEP DEMAND ONLY**; Resource Admission owns budgets, reservations and grants |
| workspace/security/specialist handoffs | **REFERENCE ONLY**; specialist/security owners retain truth |

## Recovery finding 3: historical `021I` orchestration is a terminology collision

Historical `SYSTEM-MASTER-REBUILD-021I-R1` used “worker/agent orchestration” for concrete executor eligibility, placement, assignment, execution leases, heartbeats, fencing, isolation, drain and reassignment.

Under the rebuilt Foundation & Spine, those semantics belong to **Execution Placement** and **Durable Execution Runtime**, not Planning & Orchestration.

Planning may specify a step and its execution requirements. It cannot:

- choose a concrete executor;
- mint or renew a runtime lease/fence;
- claim worker heartbeat truth;
- perform placement reassignment;
- substitute a provider route;
- treat runtime execution state as plan authority.

The word “orchestration” in the current Planning boundary means **plan graph/revision/readiness orchestration**, not worker/process placement orchestration.

## Recovery finding 4: Resource Admission and Placement boundaries are already explicit

Current historical architecture evidence for 021H and 021I remains useful as negative ownership evidence:

- Resource Admission owns admission, multidimensional budgets, reservations/grants, queue/fairness/backpressure and safe preemption selection.
- Execution Placement owns concrete executor eligibility, scoring, assignment, lease/fence realization, drain and reassignment.

Planning may declare resource/capability requirements for a step. It does not decide whether capacity is available now and does not convert requirements into a grant or assignment.

## Recovery finding 5: old F-WP behavior cannot be restored wholesale into Planning

The predecessor F-WP family mixed change governance, persistence, grants, coordination, evidence, recovery and projections. Only bounded implementation patterns may be reused.

For Planning:

- durable revision/digest/replay patterns from F-WP-002 are useful implementation donors;
- coordination/lease concepts from F-WP-007 must be split: plan-level dependency/readiness may inform Planning, but execution leases/fences belong downstream;
- evidence publication/verification from F-WP-008 remains outside Planning;
- rollback/recovery authority from F-WP-009 remains outside Planning;
- projection freshness patterns from F-WP-011 are useful for read models only;
- contract/version/migration patterns from F-WP-012 remain owned by Contracts & Versioning / migration authority.

No F-WP subject is promoted as the current Planning implementation.

## Smallest sufficient Planning authority for the fresh design lock

The next design lock should resolve a minimal authoritative model around the following responsibilities.

1. **Plan identity** — one durable `planId` with immutable/revisioned plan content.
2. **Exact upstream binding** — every Plan revision binds exact `WorkPlanningRefV1`, `workId`, and governed goal revision/digest.
3. **Plan revision lineage** — immutable parent/supersession relationships; stale revisions cannot regain current authority silently.
4. **Step identity** — stable step identity within a plan lineage with exact step revision/content digest where required.
5. **DAG structure** — explicit dependency edges, cycle rejection, joins and bounded fan-out/depth.
6. **Step kinds / waits** — bounded executable, human-wait, conditional/join and other necessary orchestration forms without embedding specialist implementation semantics.
7. **Readiness** — deterministic plan-level readiness from predecessor/condition standings; readiness never implies resource/effect permission.
8. **Conditions** — deterministic, versioned condition/predicate semantics with fail-closed behavior for unknown/incompatible expressions.
9. **Partial success** — explicit branch/step standing that does not falsely collapse mixed or unknown outcomes to success.
10. **Replanning** — creates a new Plan revision, preserves lineage, remains within the same current governed goal revision unless an explicit newer upstream binding is supplied.
11. **Plan-level checkpoint/reconstruction** — enough durable orchestration state to rebuild which revision/steps/joins/waits are current without becoming a job/attempt checkpoint store.
12. **Completion predicates** — plan-owned predicate evaluation may determine “plan criteria ready for completion adjudication,” but Evidence/Completion owners decide supported success claims.
13. **Downstream step handoff** — immutable requirement/reference packet for policy/resource/routing/runtime chain; Planning does not issue grants/routes/assignments/jobs itself.
14. **Concurrency/idempotency** — stale Plan mutations and conflicting duplicate commands fail closed; exact retries replay the committed logical result.
15. **Read models** — Plan/Step status projections expose explicit freshness and never replace canonical plan state.

## Negative ownership boundary

Planning & Orchestration must not absorb:

- user intent, outcome/constraint/success-criteria truth — Intent / Keel;
- durable Work/Project identity, management lifecycle, milestones or project records — Work & Project Control;
- identity/delegation grants — Identity, Principal & Delegation;
- contract compatibility authority — Contracts & Versioning;
- security/privacy/rights/safety authorization — their canonical policy owners;
- resource budgets, admission, queueing, reservations or grants — Resource Admission & Budgeting;
- capability/provider registry or route decisions — Capability Registry & Routing;
- concrete executor scoring/placement/assignment — Execution Placement;
- job/attempt/retry/timer/heartbeat/lease/fence truth — Durable Execution Runtime;
- transport delivery standing — Transport & Delivery;
- tool/model/provider invocation truth — gateways/specialist owners;
- external-effect permission or commit receipts — Effect / Action Authority;
- artifact byte/version truth — Artifact Gateway;
- evidence/qualification standing — Evidence, Provenance & Assurance;
- specialist semantic correctness — specialist systems;
- recovery authorization or reconciliation truth — Recovery & Reconciliation;
- UI/chat progress as canonical truth.

Any future design or implementation that duplicates one of those authorities fails the ownership review.

## Required downstream handoff questions for the design lock

The inventory intentionally does not invent the final downstream contract. `PLANNING-ORCHESTRATION-DESIGN-LOCK-001` must freeze it.

At minimum it must decide:

- exact `PlanRefV1` and `PlanStepRefV1` fields and canonical digests;
- exact Plan and Step lifecycle/standing enums;
- legal revision/supersession/replan transitions;
- exact DAG edge and join semantics;
- cycle, depth, fan-out and parallelism ceilings;
- condition/predicate representation and compatibility rules;
- human-wait/approval reference semantics without stealing approval authority;
- partial-success and `UNKNOWN` semantics;
- exact upstream invalidation rules when Work/Goal revisions change;
- exact declarative capability/resource requirement fields supplied downstream;
- policy/privacy/rights/safety decision-set binding point;
- provisional-admission handoff and re-admission triggers;
- route/grant/assignment/job association references returned to Planning;
- cancellation/supersession propagation without owning runtime cancellation mechanics;
- plan checkpoint/reconstruction format;
- canonical persistence/event journal boundary;
- idempotency keys and optimistic-concurrency rules;
- completion-predicate semantics versus external completion adjudication;
- query/projection freshness semantics;
- migration/compatibility rules;
- adversarial isolated qualification denominator;
- cumulative Foundation regression gate through Work/Project.

## Failure classes the design lock must cover

At minimum:

- malformed or incompatible upstream `WorkPlanningRefV1`;
- stale Work entity revision;
- stale/superseded governed goal revision;
- cross-Work or cross-goal Plan rebinding;
- duplicate Plan/Step identity;
- Plan revision fork conflict;
- DAG self-edge/cycle;
- missing dependency;
- invalid join/conditional edge;
- unknown condition evaluator/version;
- impossible or contradictory hard requirements;
- readiness claimed while dependency standing is `UNKNOWN`;
- stale Plan Step attempting new downstream admission;
- replan that widens Keel scope/authority/budget/privacy restrictions;
- retry that duplicates a Plan mutation;
- stale concurrent Plan mutation;
- partial branch failure incorrectly promoted to success;
- runtime success incorrectly treated as specialist or goal completion;
- recovery/checkpoint state from an incompatible Plan revision;
- corrupted plan journal/digest lineage;
- downstream route/grant/assignment facts being mutated by Planning.

## Evidence and qualification rule

Historical design, portable, hosted, A-01 or other standings do not transfer to the fresh Planning subject.

A future Planning implementation must earn exact-subject evidence appropriate to its claims. At minimum the design lock must define:

- isolated contract/state/DAG/replan/adversarial tests;
- persistence/replay/crash reconstruction tests;
- concurrency/idempotency tests;
- stale upstream/downstream reference tests;
- negative ownership tests proving no resource/route/placement/effect/evidence authority is minted;
- cumulative Foundation regression through System Root, Identity, Contracts, Keel and Work/Project;
- target/native/A-01 gates separately where actually applicable.

No implementation, qualification, A-01, native, production, endurance or human standing is claimed by this recovery inventory.

## Rejected reconstruction shortcuts

1. Promote historical Engineering Planning ledgers as the current Planning runtime.
2. Treat historical 021I worker orchestration as current plan orchestration.
3. Restore F-WP-007 coordination wholesale and let Planning own execution leases.
4. Let a Plan rewrite Work or Keel-owned goal fields.
5. Let planning resource requirements become resource grants.
6. Let Planning choose provider routes or concrete executors.
7. Treat a job/attempt success as Plan, specialist or Goal success without the required owner decisions/evidence.
8. Resume a checkpoint from an older/incompatible Plan revision.
9. Transfer historical qualification standings to a fresh implementation subject.
10. Build code before the exact schemas, lifecycles, failure behavior, handoffs and qualification denominator are design-locked.

## Recovery inventory disposition

**CLOSED.**

The current System Specification, exact frozen Work/Project handoff and recovered historical donor material are sufficient to proceed to a fresh Planning & Orchestration design lock. No current repository artifact should be promoted wholesale as the canonical Planning authority.

Architecture direction:

**recover donor patterns -> freeze minimal executable-plan ownership -> build fresh exact subject -> isolated/adversarial qualification -> cumulative Foundation regression -> freeze -> continue to Resource Admission & Budgeting.**

## Exact next operation

`PLANNING-ORCHESTRATION-DESIGN-LOCK-001`

The next packet must freeze the exact Plan/PlanRevision/PlanStep schemas, graph and readiness semantics, replan/invalidation rules, persistence/replay behavior, command/query contracts, exact Work/Goal input binding, downstream requirement/handoff contracts, negative authority boundaries, failure behavior and qualification matrix **before implementation begins**.
