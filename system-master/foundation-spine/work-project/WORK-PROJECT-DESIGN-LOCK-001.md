# WORK-PROJECT-DESIGN-LOCK-001

Date: 2026-09-12
Owner: `SYSTEM_MASTER/FOUNDATION_SPINE`
Predecessor inventory commit: `d308e367520bd758b34bde5aa7e2d6e3aa9d143a`
Upstream Keel freeze commit: `40cf431fd2ad4857e126a95715a449b7325515de`
Status: **DESIGN LOCKED / IMPLEMENTATION NOT YET CLAIMED / FRESH QUALIFICATION REQUIRED**

## 1. Purpose

Freeze the smallest sufficient canonical **Work & Project Control** authority immediately downstream of Intent / Keel.

This design creates one durable owner for long-lived Work and Project identity without reviving the old F-WP mega-boundary and without absorbing planning, routing, resources, execution, effects, evidence, recovery or specialist truth.

Historical F-WP code is donor evidence only. No historical qualification standing transfers to the new subject.

## 2. Canonical question

**What durable work/project are we managing over time?**

Work & Project Control owns the answer to that question and only that question.

## 3. Locked authority boundary

### 3.1 Owns

The authority owns:

- durable `workId` identity;
- durable `projectId` identity;
- Work-to-Project membership;
- Work-to-Work and Project-to-Project hierarchy;
- the exact relationship between Work and a governed Keel goal revision;
- high-level Work/Project lifecycle for management purposes;
- project-management milestones;
- progress rollup derived from authoritative milestone standings;
- project-level risks, issues and governed change records;
- project-memory references;
- typed references from Work/Project to plans, jobs, attempts, artifacts, evidence, incidents and recovery episodes;
- authoritative Work/Project event history and entity revisions;
- Work/Project read-model freshness metadata.

### 3.2 Does not own

It does not own:

- goal meaning, requirements, constraints, success criteria, cancellation or supersession truth — Keel owns those;
- executable plan DAGs or replanning — Planning & Orchestration owns those;
- budgets, admission, reservations or resource grants — Resource Admission & Budgeting owns those;
- route selection or capability descriptors — Capability Registry & Routing owns those;
- executor placement, lease or fence truth — Execution Placement / Durable Runtime own those;
- low-level job/attempt state, retries, timers or heartbeats — Durable Execution Runtime owns those;
- effect authorization or commit receipts — Effect / Action Authority owns those;
- artifact byte/version truth — Artifact Gateway owns it;
- completion/qualification evidence truth — Evidence, Provenance & Assurance owns it;
- recovery authorization — Recovery & Reconciliation coordinates current truth owners;
- UI/chat projection state — UX owns the projection only;
- specialist correctness.

Any implementation that introduces one of those duplicate authorities violates this lock.

## 4. Exact upstream contract: Keel -> Work/Project

The only admissible governed-goal input is the exact frozen Keel reference contract:

`GovernedGoalRefV1`

with:

- `goalId`
- `goalRevision`
- `goalRevisionId`
- `goalContentDigest`
- `keelValidationReceiptDigest`
- `contractSubjectId`
- `contractSubjectVersion`
- `contractSubjectDigest`
- `parentGoalRevisionRef`
- `observedKeelRegistryRevision`

The Work authority stores this reference as a bound value. It never edits or reconstructs the governed goal.

Unknown, malformed, stale-without-explicit-rebind, contract-incompatible or integrity-invalid Keel references fail closed before Work mutation.

## 5. Identity and cardinality lock

### 5.1 Work

A Work item has exactly one durable `workId` for its lifetime.

A Work item:

- binds exactly one active governed-goal reference at a time;
- may acquire a newer revision of the **same `goalId`** only through an explicit goal-rebind event;
- may not be rebound to a different `goalId`;
- may have zero or one parent Work;
- may have zero or one Project membership;
- may have many child Work items;
- may have many downstream typed references.

If the intended outcome changes to a different governed `goalId`, a new Work identity is required. The old Work may reference the successor but is not repurposed.

### 5.2 Project

A Project has exactly one durable `projectId` for its lifetime.

A Project:

- may have zero or one parent Project;
- may contain many Work items;
- may contain many child Projects;
- may span multiple governed goals because goals bind to Work, not to the Project as a mutable intent store.

A Project may summarize Work but may not change the meaning of any Work-bound goal.

### 5.3 Cycles

Self-parenting and cycles in Work or Project hierarchy are forbidden. Cycle detection is mandatory before durable mutation.

## 6. Canonical records

The fresh implementation SHALL expose semantically equivalent immutable records to the following V1 shapes. Language-level names may vary only if the contract meaning remains exact.

### 6.1 `WorkRecordV1`

Required fields:

- `workId`
- `entityRevision`
- `projectId` nullable
- `parentWorkId` nullable
- `activeGovernedGoalRef`
- `lifecycle`
- `createdByPrincipalRef`
- `createdAt`
- `updatedAt`
- `registryRevision`
- `latestEventDigest`

No mutable copy of goal outcome, constraints, budget, privacy purpose or success criteria is permitted in this record.

### 6.2 `ProjectRecordV1`

Required fields:

- `projectId`
- `entityRevision`
- `parentProjectId` nullable
- `title`
- `lifecycle`
- `createdByPrincipalRef`
- `createdAt`
- `updatedAt`
- `registryRevision`
- `latestEventDigest`

### 6.3 `GoalBindingV1`

Required fields:

- `workId`
- `bindingRevision`
- complete `GovernedGoalRefV1`
- `priorBindingDigest` nullable for first binding
- `reasonRef`
- `boundByPrincipalRef`
- `boundAt`
- `bindingDigest`

A rebind must have the same `goalId`, a strictly higher `goalRevision`, and an exact valid successor Keel reference. Equal, lower or cross-goal rebind fails closed.

### 6.4 `MilestoneRecordV1`

Required fields:

- `milestoneId`
- exactly one owner: `workId` or `projectId`
- `title`
- positive `weightUnits`
- `standing`
- `standingBasisRef` nullable while unresolved
- `createdAt`
- `updatedAt`
- `entityRevision`

Locked milestone standings:

- `OPEN`
- `BLOCKED`
- `SATISFIED`
- `UNKNOWN`

`SATISFIED` requires an explicit basis reference or attributable user/operator attestation. Runtime success by itself is not milestone satisfaction.

### 6.5 `ManagementRecordV1`

Project-management risks, issues and changes use one bounded record family with:

- `recordId`
- owner `workId` or `projectId`
- `kind` = `RISK | ISSUE | CHANGE`
- `title`
- `standing`
- `ownerRef`
- `sourceRef` nullable
- `createdAt`
- `updatedAt`
- `entityRevision`

A `CHANGE` record documents project/work-management change. It cannot alter the governed goal; material intent change still requires Keel revision.

### 6.6 `ProjectMemoryRefV1`

Required fields:

- owner `workId` or `projectId`
- `memoryRef`
- `memoryOwnerAuthority`
- `purposeRef`
- `addedAt`

Only the reference is owned here. Referenced memory content remains with its canonical source owner.

### 6.7 `WorkAssociationV1`

Required fields:

- `associationId`
- `workId`
- `kind`
- `externalRef`
- `externalOwnerAuthority`
- `externalVersionOrDigest` where available
- `createdAt`

Locked association kinds:

- `PLAN`
- `PLAN_STEP`
- `JOB`
- `ATTEMPT`
- `ARTIFACT`
- `EVIDENCE`
- `INCIDENT`
- `RECOVERY_EPISODE`
- `SUCCESSOR_WORK`

An association is a pointer, never a transfer of truth ownership.

## 7. High-level lifecycle lock

### 7.1 Work lifecycle

Locked states:

- `OPEN`
- `ACTIVE`
- `PAUSED`
- `BLOCKED`
- `CLOSING`
- `CLOSED`

Legal transitions:

- creation -> `OPEN`
- `OPEN -> ACTIVE | PAUSED | BLOCKED | CLOSING`
- `ACTIVE -> PAUSED | BLOCKED | CLOSING`
- `PAUSED -> ACTIVE | BLOCKED | CLOSING`
- `BLOCKED -> ACTIVE | PAUSED | CLOSING`
- `CLOSING -> CLOSED | ACTIVE | BLOCKED`
- `CLOSED` is terminal

`CLOSING -> CLOSED` requires a `ClosureBasisV1`. A job/attempt terminal state is insufficient by itself.

### 7.2 Project lifecycle

Locked states:

- `OPEN`
- `ACTIVE`
- `PAUSED`
- `CLOSED`

A Project cannot close while it has non-terminal child Projects or Work unless an explicit governed override basis is recorded. Closing a Project does not silently cancel its Work.

### 7.3 `ClosureBasisV1`

Required fields:

- `workId`
- `disposition`
- `authorityRef`
- `decisionOrReceiptRef`
- `subjectDigest` where supplied by the owner
- `recordedAt`

Locked dispositions:

- `SATISFIED`
- `CANCELLED`
- `SUPERSEDED`
- `ABANDONED`
- `UNSATISFIED_TERMINAL`

`SATISFIED` requires a completion/assurance decision reference. `CANCELLED` and `SUPERSEDED` require matching current Keel standing or another explicitly authorized control receipt. The Work authority records the terminal management fact but does not manufacture the underlying decision.

## 8. Progress lock

Progress is a management projection, not proof of completion.

For an owner with no durable milestones, progress standing is `UNKNOWN` and no percentage is asserted.

For an owner with durable milestones:

- denominator = sum of positive `weightUnits` for current milestones;
- numerator = sum of `weightUnits` for `SATISFIED` milestones;
- `BLOCKED`, `OPEN` and `UNKNOWN` contribute zero to numerator;
- percentage = floor(`numerator * 100 / denominator`);
- `100%` progress does not close Work and does not certify the goal.

Project rollup may aggregate child Work milestone projections, but freshness and unknown-child standing must be explicit. A stale/degraded projection cannot be presented as authoritative current progress.

## 9. Command boundary

Every mutating command must carry:

- `commandId`
- `idempotencyKey`
- actor/principal reference
- expected entity revision where an entity already exists
- exact command payload digest
- applicable contract subject/version/digest

Minimum command families:

1. `CreateProject`
2. `CreateWork`
3. `RebindWorkGoal`
4. `AssignWorkToProject`
5. `ReparentWork`
6. `ReparentProject`
7. `TransitionWorkLifecycle`
8. `TransitionProjectLifecycle`
9. `UpsertMilestone`
10. `RecordManagementRecord`
11. `AddProjectMemoryRef`
12. `AssociateExternalRef`
13. `CloseWork`

No command may mutate plan/job/attempt/resource/route/effect/evidence owner state directly.

## 10. Query boundary

Minimum queries:

- `GetWork(workId)`
- `GetProject(projectId)`
- `GetActiveGoalBinding(workId)`
- `GetWorkTimeline(workId, cursor)`
- `GetProjectTimeline(projectId, cursor)`
- `ListChildWork(parentWorkId)`
- `ListProjectWork(projectId)`
- `ListChildProjects(parentProjectId)`
- `GetProgress(ownerRef)`
- `ListManagementRecords(ownerRef, kind)`
- `ListAssociations(workId, kind)`

Read models carry:

- authoritative entity/registry revision;
- projection timestamp;
- freshness = `CURRENT | STALE | UNKNOWN | DEGRADED`.

Queries and indexes are rebuildable projections. They never replace the authoritative journal.

## 11. Idempotency and concurrency lock

### Idempotency

- First successful `idempotencyKey` commit binds the key to the exact command digest and committed result digest.
- Repeating the same key + same command digest returns the exact committed logical result without new mutation.
- Same key + different command digest fails closed as `IDEMPOTENCY_CONFLICT`.
- Idempotency survives restart/replay.

### Optimistic concurrency

- Every existing-entity mutation supplies `expectedEntityRevision`.
- A mismatch fails before durable mutation.
- Successful mutation increments exactly once.
- Global `registryRevision` is monotonic across committed authority mutations.

No last-writer-wins mutation is allowed for authoritative state.

## 12. Persistence, replay and corruption lock

The fresh authority uses a durable append journal or transactionally equivalent canonical persistence with these properties:

- mutation is durable before success acknowledgement;
- each committed event binds entity identity, entity revision, registry revision, prior event/transaction digest and current payload digest;
- replay validates framing, hashes, revision monotonicity and parent digest continuity;
- truncated, reordered, duplicated-with-different-content, tampered or revision-gapped authority history fails closed;
- in-memory indexes and query projections rebuild from canonical history;
- checkpoints may accelerate replay but are digest-bound to the journal position and never replace authoritative history unless governed by the Canonical Data owner;
- a crash before durable commit cannot expose a successful mutation;
- a crash after durable commit must replay the exact committed mutation without duplication.

The implementation may consume shared Canonical Data primitives instead of implementing its own storage engine when such primitives exist and satisfy these guarantees. It may not create a competing database authority.

## 13. Keel binding invariants

1. Work creation requires an exact valid `GovernedGoalRefV1`.
2. The stored binding equals the supplied Keel ref field-for-field.
3. Work does not contain mutable copies of Keel-owned goal fields.
4. Rebind requires the same `goalId` and strictly greater `goalRevision`.
5. A child-goal Work whose Keel reference carries `parentGoalRevisionRef` must preserve that exact parent-goal lineage; Work hierarchy cannot contradict the governed parent lineage where both are asserted.
6. A different `goalId` requires a new Work identity.
7. Keel cancellation/supersession is never converted into silent goal mutation.
8. Every downstream association retains the relevant `workId`; downstream descendants continue to carry their exact governed goal revision as required by the canonical chain.

## 14. Planning handoff lock

Work/Project -> Planning exposes an immutable `WorkPlanningRefV1` containing at minimum:

- `workId`
- current Work `entityRevision`
- exact active `GovernedGoalRefV1`
- `projectId` if present
- `parentWorkId` if present
- Work lifecycle standing
- relevant management blocker references
- `registryRevision`
- canonical digest of the reference

Planning may consume this reference. Planning cannot rewrite Work or goal identity. A plan must bind its own exact goal revision and Work identity under Planning authority.

## 15. Failure behavior

The authority fails closed on at least:

- unknown Work/Project;
- malformed or incompatible contract subject;
- invalid Keel reference;
- stale entity revision;
- idempotency conflict;
- cross-goal rebind;
- same/older goal revision rebind;
- Work/Project hierarchy cycle;
- unknown lifecycle transition;
- closure without valid basis;
- milestone satisfaction without required basis;
- association with malformed owner/ref identity;
- journal corruption or digest discontinuity;
- replay ambiguity.

`UNKNOWN` is preserved when current authoritative standing cannot be established. It is never guessed into success, completion or safety.

## 16. Qualification lock: 64-case isolated gate

The fresh implementation must pass **64 isolated adversarial cases** on the exact implementation subject before any Work/Project freeze claim.

### A. Identity and creation — 8

1. create standalone Work with exact governed goal ref;
2. create Project;
3. create Work inside Project;
4. duplicate Work identity fails;
5. duplicate Project identity fails;
6. malformed Work identity fails;
7. malformed Project identity fails;
8. creation preserves exact actor/time/registry identity.

### B. Keel binding and revision discipline — 10

9. exact Keel ref persists field-for-field;
10. invalid/malformed Keel ref fails with zero mutation;
11. same-goal higher revision explicit rebind passes;
12. equal goal revision rebind fails;
13. lower goal revision rebind fails;
14. different goalId rebind fails;
15. binding digest substitution fails;
16. contract subject digest substitution fails;
17. child-goal parent lineage mismatch fails;
18. Work stores no mutable goal-copy authority.

### C. Hierarchy and membership — 8

19. assign Work to Project;
20. move Work between Projects under expected revision;
21. parent Work link passes;
22. Work self-parent fails;
23. Work cycle fails;
24. Project parent link passes;
25. Project self-parent fails;
26. Project cycle fails.

### D. Lifecycle and closure — 10

27. valid Work transition passes;
28. invalid Work transition fails;
29. valid Project transition passes;
30. invalid Project transition fails;
31. close Work with valid assurance basis passes;
32. job/attempt success alone cannot close Work;
33. satisfied close without completion decision ref fails;
34. cancelled close without governing basis fails;
35. CLOSED Work cannot reopen;
36. Project close with active children fails absent explicit governed override.

### E. Milestones/progress/management — 8

37. no milestones => progress UNKNOWN;
38. weighted progress calculation is deterministic;
39. blocked milestone contributes zero completion weight;
40. unknown milestone does not fabricate completion;
41. SATISFIED without basis fails;
42. 100% progress does not auto-close Work;
43. management CHANGE cannot mutate goal binding;
44. memory reference does not copy or become source-memory truth.

### F. Idempotency/concurrency/durability — 12

45. same key + same digest replays exact result;
46. same key + different digest fails;
47. idempotency survives restart;
48. stale entity revision fails;
49. one successful mutation increments entity revision exactly once;
50. registry revision is monotonic;
51. crash before durable commit has zero accepted mutation;
52. crash after durable commit replays exactly once;
53. truncated journal fails closed;
54. tampered payload fails closed;
55. parent-digest discontinuity/reorder fails closed;
56. revision gap fails closed.

### G. Boundaries/projections/handoff — 8

57. association records external reference without importing external truth;
58. exact workId survives Plan association;
59. exact workId survives Job/Attempt association;
60. exact workId survives Artifact/Evidence association;
61. query projection exposes CURRENT freshness when caught up;
62. stale/degraded/unknown projection cannot claim current completion;
63. `WorkPlanningRefV1` binds exact Work revision + governed goal ref;
64. implementation exposes no route/resource/attempt/effect/recovery authorization API.

## 17. Cumulative Foundation regression gate

The exact Work/Project implementation subject must also run the current hosted-portable regression campaigns for:

- System Root & Authority Registry;
- Identity / Principal / Delegation;
- Contracts & Versioning;
- Intent / Keel.

A fresh Work/Project PASS cannot override a regression in any upstream frozen authority.

## 18. Evidence class lock

The first eligible freeze is **hosted-portable** unless stronger evidence is actually executed on the exact subject.

Do not claim:

- native/device PASS;
- A-01 PASS;
- human/usability/accessibility PASS;
- external/private-authority PASS;
- production admission;
- endurance completion;

unless separately executed and evidenced for the exact subject.

## 19. Build stop conditions

Stop implementation and return to design if any required behavior would force Work/Project to:

- mint or alter Keel authority;
- execute plans or jobs;
- grant resources or route capabilities;
- authorize effects;
- certify specialist correctness;
- decide recovery eligibility;
- make UI/telemetry authoritative;
- create a competing persistence owner.

## 20. Exact next operation

`WORK-PROJECT-BUILD-001`

Build the smallest fresh runtime/contracts/test subject satisfying this lock, implement the 64-case isolated adversarial gate, run cumulative Foundation regression, and only then evaluate `WORK-PROJECT-FREEZE-001`.
