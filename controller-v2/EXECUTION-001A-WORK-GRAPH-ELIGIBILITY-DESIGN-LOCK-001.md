# CONTROLLER V2 — EXECUTION-001A DURABLE WORK GRAPH + ELIGIBILITY DESIGN LOCK 001

Status: **TARGETED RESEARCH COMPLETE / ADJUDICATED / DESIGN-LOCKED / BUILD AUTHORIZED / NOT YET QUALIFIED**
Working lineage before this artifact: `controller-v2/foundation-006-c1-rebind@2e5d6151d3cec769d12ecd2f34c53f57a8777c1e`
Foundation executable qualification subject: `0c47bcc25bc5a009ccbeeec170eea5100007149a`
Foundation closure evidence: `FOUNDATION-C1-CLOSURE-CENSUS-001.md`
Execution recovery inventory: `EXECUTION-001-FORENSIC-RECOVERY-INVENTORY-001.md`
Production Controller activation: `BLOCKED_EXTERNAL_SETUP`
Historical PASS transfer: `0`

## 1. Scope

This unit freezes the first dependency-valid boundary above the hosted-portable Controller Foundation:

**durable same-transaction operation dependencies + deterministic dependency eligibility**.

It intentionally does **not** implement:

- worker process spawning;
- worker enrollment or service-principal authority;
- scheduler timers/pollers;
- provider/network calls;
- durable dispatch intent;
- claim acquisition policy;
- resource placement/scoring;
- priority policy;
- stage/barrier policy;
- qualification/promotion execution;
- CORE, LEARNING, BOOK or DOCUMENTS semantics.

The purpose is to prevent the later scheduler from becoming an accidental second workflow/admission authority by merely polling `READY` rows or sorting wakeups.

## 2. Targeted external research and design-changing conclusions

Research was intentionally limited to questions capable of changing the graph/eligibility design.

### 2.1 Kubernetes Scheduling Framework

Current official reference:

`https://kubernetes.io/docs/concepts/scheduling-eviction/scheduling-framework/`

Design-changing observations:

1. Kubernetes separates a **scheduling cycle** (selection) from a **binding cycle** (application of the decision).
2. `PreEnqueue` determines whether work is ready to enter the active queue; queue ordering is not the source of eligibility.
3. `Reserve` occurs before binding specifically to prevent races, and `Unreserve` cleanup is required to be idempotent.
4. `Permit` distinguishes approve / deny / wait rather than collapsing every non-success into retry.

Adjudicated consequence for Controller V2:

- eligibility must be derived before scheduling order;
- later selection and binding/claim/dispatch are separate boundaries;
- a future queue or priority mechanism can order only already-eligible operations;
- no current wakeup/queue position creates eligibility or execution authority.

### 2.2 Apache Airflow external dependency semantics

Current official references:

`https://airflow.apache.org/docs/apache-airflow-providers-standard/stable/sensors/external_task_sensor.html`

`https://airflow.apache.org/docs/apache-airflow-providers-standard/stable/_api/airflow/providers/standard/sensors/external_task/index.html`

Design-changing observation:

Airflow explicitly distinguishes dependency states that count as allowed/success, failed or skipped rather than assuming that any terminal upstream state satisfies a dependency.

Adjudicated consequence for Controller V2:

- v1 dependency satisfaction is **success-only**;
- terminal non-success prerequisites are a distinct deterministic blocked standing;
- this graph layer does not invent retry, skip propagation, fail propagation or automatic dependent cancellation policy.

No external system is copied as architecture authority. These references were used only to challenge separation-of-concerns and failure-state assumptions.

## 3. Ownership adjudication

### Controller EXECUTION-001A owns

- immutable dependency-edge identity between current Controller operations;
- same-transaction dependency-scope enforcement for v1;
- cycle prevention at edge admission;
- deterministic dependency eligibility derived from current durable Controller truth;
- a guarded `PLANNED -> READY` transition that re-reads authoritative state in the same mutation boundary;
- dependency events sufficient for exact replay/recovery;
- bounded dependency standing/reason codes.

### EXECUTION-001A does not own

- command or transaction admission;
- specialist workflow meaning;
- human identity/delegation/approval;
- worker identity/enrollment;
- resource placement or capacity policy;
- priority/stage policy;
- claim/lease/fencing authority;
- dispatch authority;
- provider effects;
- qualification/promotion truth.

Those remain frozen predecessor or later-layer owners.

## 4. Durable state design lock

### 4.1 Schema version

Implementation is authorized to append **schema v6** with one table:

```text
operation_dependencies(
  dependency_id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id),
  dependent_operation_id TEXT NOT NULL REFERENCES operations(operation_id),
  prerequisite_operation_id TEXT NOT NULL REFERENCES operations(operation_id),
  relation TEXT NOT NULL CHECK(relation = 'REQUIRES_SUCCESS'),
  created_at TEXT NOT NULL,
  UNIQUE(dependent_operation_id, prerequisite_operation_id)
)
```

No priority, stage, worker, resource-capacity, provider, retry or transport field is admitted into this table.

### 4.2 Dependency identity

`dependency_id` is content-addressed from canonical semantic identity:

```text
sha256({
  protocol: 'controller.operation-dependency/v1',
  transaction_id,
  dependent_operation_id,
  prerequisite_operation_id,
  relation: 'REQUIRES_SUCCESS'
})
```

Exact replay of the same semantic edge is idempotent and returns the existing identity. No caller-selected mutable edge ID becomes authority.

### 4.3 Scope

V1 dependencies are restricted to operations belonging to the **same transaction**.

Cross-transaction dependencies are not silently inferred from subjects, repositories, command relations, timestamps or specialist metadata. If later required, they need a separately versioned contract because they cross command/admission lifecycles.

### 4.4 Mutation window

A dependency may be added only while the dependent operation is exactly `PLANNED`.

Once the dependent leaves `PLANNED`, its prerequisite set is frozen. This prevents a scheduler or caller from moving the goalposts after readiness/execution has begun.

The prerequisite operation may be in any legal current operation state, but must belong to the same transaction.

### 4.5 Cycle law

Self-dependencies are rejected.

Every new edge is admitted under the same `BEGIN IMMEDIATE` Controller mutation boundary used to validate the current dependent/prerequisite rows and current dependency graph. The write is rejected if the candidate edge would create a direct or indirect cycle.

Cycle rejection commits neither the edge nor its semantic event.

## 5. Semantic event and recovery lock

A real new edge emits exactly one semantic event on the dependent operation stream:

`operation.dependency_added`

The event binds at least:

- dependency ID;
- transaction ID;
- dependent operation ID;
- prerequisite operation ID;
- relation `REQUIRES_SUCCESS`.

Exact replay emits no duplicate event.

Fresh-store recovery must reconstruct the same dependency table from globally admitted semantic events. Dependency rows are durable semantic state, not a rebuildable scheduling cache.

A scheduler-eligibility list or queue is a **projection only** and must be fully reconstructable from transactions, operations and dependency edges.

## 6. Dependency eligibility contract

EXECUTION-001A freezes a pure/read-only classification with no scheduling side effect.

For one dependent operation, the implementation must return one of:

- `ELIGIBLE`
- `WAITING_DEPENDENCY`
- `BLOCKED_DEPENDENCY_TERMINAL`
- `INELIGIBLE_TRANSACTION`
- `INELIGIBLE_OPERATION_STATE`

### 6.1 Transaction gate

Dependency eligibility can be `ELIGIBLE` only when the owning transaction is `ADMITTED` or `ACTIVE`.

`OPEN`, `WAITING`, `REJECTED`, `FAILED`, `CANCELLED`, `SUPERSEDED` and `SUCCEEDED` transactions are not scheduling-eligible through this boundary.

This layer does not reopen or reinterpret transaction admission.

### 6.2 Operation gate

The read-only dependency eligibility classifier is defined for `PLANNED` operations.

An operation already in `READY`, `RUNNING`, `VERIFYING`, `BLOCKED` or a terminal state returns `INELIGIBLE_OPERATION_STATE`; later reconciliation of those states belongs to their existing/later owners.

### 6.3 Prerequisite law

For a `PLANNED` operation under an `ADMITTED|ACTIVE` transaction:

- zero prerequisites -> `ELIGIBLE`;
- every prerequisite `SUCCEEDED` -> `ELIGIBLE`;
- any prerequisite `PLANNED|READY|RUNNING|VERIFYING|BLOCKED` -> `WAITING_DEPENDENCY` unless a terminal non-success prerequisite also exists;
- any prerequisite `FAILED|CANCELLED|STALE` -> `BLOCKED_DEPENDENCY_TERMINAL`.

`BLOCKED_DEPENDENCY_TERMINAL` outranks waiting when both are present because waiting cannot cure the already terminal non-success prerequisite under the v1 success-only relation.

No automatic `FAILED`, `CANCELLED`, `STALE` or retry transition of the dependent is authorized by this classification.

### 6.4 Reason evidence

The result may expose bounded identifiers/reason codes such as the exact prerequisite operation IDs and their current states. It must not copy specialist payloads, chat text, secrets, human evidence or mutable webhook metadata into dependency truth.

## 7. Guarded readiness transition

Implementation is authorized to add one narrow Controller method equivalent to:

`markOperationReadyIfEligible(operationId)`

It must:

1. enter the Controller's atomic mutation boundary;
2. re-read the transaction, dependent operation and complete current prerequisite set;
3. recompute dependency eligibility from durable truth;
4. require `ELIGIBLE`;
5. require the dependent still be `PLANNED`;
6. transition exactly `PLANNED -> READY` using the existing operation/event authority;
7. return the reread/current durable standing rather than relying on a prior wakeup or stale projection.

This method grants **no claim, worker, dispatch or effect authority**.

A later scheduler must consume this readiness boundary rather than use a cached eligibility result to write `READY` blindly.

## 8. Priority and stage adjudication

Historical CG-010 contained a minimum-stage barrier and priority ordering. Those are **not** promoted into the generic Controller graph contract.

Decision:

- **stage**: excluded from EXECUTION-001A;
- **priority**: excluded from EXECUTION-001A;
- later scheduling policy may introduce a versioned ordering contract if a real requirement proves it is needed;
- any future ordering rule operates only over work already eligible under this graph boundary and can never make ineligible work eligible.

This avoids hard-coding one historical night-shift policy into generic Controller execution semantics.

## 9. Reconciliation / wakeup / retry law

- wakeups, webhooks, chat events and completion notifications are hints only;
- every classification re-reads current durable state;
- exact edge replay is idempotent;
- no read-after-write freshness assumption establishes eligibility;
- eligibility projection loss is repaired by recomputation;
- schema/integrity/cycle/scope/state conflicts are permanent failures, not transient retry candidates;
- this layer performs no provider/network operation and therefore owns no transport retry loop;
- any outer transient SQLite/access retry must be finite, use the same semantic edge/operation identity, use bounded backoff/jitter, and re-read before retry;
- no stacked scheduler/claim/IPC/provider retry loop is introduced here.

## 10. Cancellation/failure adjudication

EXECUTION-001A intentionally avoids hidden cascading policy.

- prerequisite `CANCELLED`, `FAILED` or `STALE` -> dependent classification `BLOCKED_DEPENDENCY_TERMINAL`;
- the graph layer does not automatically cancel/fail/stale the dependent;
- dependency edges are immutable history and are not deleted to make the dependent eligible;
- if a user/policy later wants alternate-on-failure, retry graph rewrites, skip propagation or conditional branches, those require explicit versioned semantics rather than mutation of this v1 success-only edge.

Because a prerequisite must be `SUCCEEDED` before a dependent can become `READY`, a prerequisite cannot later move from success to cancellation/failure under the current terminal-state laws. The guarded readiness mutation therefore provides a stable success gate.

## 11. Adversarial design resolution

The recovered adversarial cases are resolved as follows:

- two reconcilers observe a dependency becoming satisfied: both may compute eligibility, but only the current atomic `PLANNED -> READY` transition may win; replay returns current standing rather than a second transition;
- two concurrent edge writes: each runs cycle/scope validation under the single-writer SQLite mutation boundary; an edge that would close a cycle fails with no partial event;
- lost response after edge admission: exact content-addressed replay returns the existing edge without duplicate event;
- wakeup loss/duplication/reordering: irrelevant to truth because the graph and states are reread;
- priority changes: not part of this layer and cannot change eligibility;
- cancellation before readiness: current durable state is observed and `ELIGIBLE` is not granted if a prerequisite is terminal non-success or the dependent is no longer PLANNED;
- cancellation after readiness: belongs to the later scheduler/cancellation integration boundary; 001A does not infer a second graph decision;
- restart/fresh-store recovery: dependency events reconstruct the graph; eligibility is recomputed; no live claim is resurrected;
- worker identity/delegation revocation: not yet relevant because 001A grants no worker/dispatch authority;
- UNKNOWN external effect: not yet relevant because 001A performs no effect;
- stacked retry: prohibited by boundary design.

## 12. Frozen isolated test denominator — GEL-001..GEL-048

### Schema / migration / recovery

1. `GEL-001` — fresh store reaches schema v6 with dependency table and required uniqueness/foreign-key constraints.
2. `GEL-002` — schema-v5 store upgrades to v6 without changing existing commands, transactions, operations, admission decisions, leases or effects.
3. `GEL-003` — failed v6 migration rolls back atomically and does not report schema v6.
4. `GEL-004` — reopening an already-v6 store is idempotent.
5. `GEL-005` — fresh-store journal recovery reconstructs admitted dependency edges exactly.
6. `GEL-006` — recovery refuses malformed/tampered dependency event identity rather than inventing an edge.

### Edge identity / scope / cycle

7. `GEL-007` — valid same-transaction PLANNED dependent edge is admitted.
8. `GEL-008` — exact semantic edge replay returns the same content-addressed dependency ID and emits no duplicate event.
9. `GEL-009` — self-dependency is rejected.
10. `GEL-010` — cross-transaction dependency is rejected.
11. `GEL-011` — unknown dependent operation is rejected.
12. `GEL-012` — unknown prerequisite operation is rejected.
13. `GEL-013` — new edge is rejected after the dependent leaves PLANNED.
14. `GEL-014` — direct two-operation cycle is rejected.
15. `GEL-015` — indirect multi-operation cycle is rejected.
16. `GEL-016` — rejected cycle commits neither dependency row nor semantic event.
17. `GEL-017` — adding an edge does not alter either operation state.
18. `GEL-018` — dependency event binds exact transaction/dependent/prerequisite/relation/identity.

### Eligibility semantics

19. `GEL-019` — PLANNED operation with zero prerequisites under ADMITTED transaction is ELIGIBLE.
20. `GEL-020` — all prerequisites SUCCEEDED is ELIGIBLE.
21. `GEL-021` — PLANNED prerequisite yields WAITING_DEPENDENCY.
22. `GEL-022` — READY prerequisite yields WAITING_DEPENDENCY.
23. `GEL-023` — RUNNING prerequisite yields WAITING_DEPENDENCY.
24. `GEL-024` — VERIFYING prerequisite yields WAITING_DEPENDENCY.
25. `GEL-025` — BLOCKED prerequisite yields WAITING_DEPENDENCY.
26. `GEL-026` — FAILED prerequisite yields BLOCKED_DEPENDENCY_TERMINAL.
27. `GEL-027` — CANCELLED prerequisite yields BLOCKED_DEPENDENCY_TERMINAL.
28. `GEL-028` — STALE prerequisite yields BLOCKED_DEPENDENCY_TERMINAL.
29. `GEL-029` — mixed SUCCEEDED + pending prerequisites yields WAITING_DEPENDENCY.
30. `GEL-030` — any terminal non-success prerequisite outranks pending and yields BLOCKED_DEPENDENCY_TERMINAL.
31. `GEL-031` — OPEN transaction cannot yield ELIGIBLE.
32. `GEL-032` — terminal/WAITING transaction cannot yield ELIGIBLE.
33. `GEL-033` — ADMITTED transaction may yield ELIGIBLE when prerequisites satisfy the success-only relation.
34. `GEL-034` — ACTIVE transaction may yield ELIGIBLE when prerequisites satisfy the success-only relation.

### Guarded READY / races / idempotency

35. `GEL-035` — guarded readiness transitions PLANNED -> READY only when current durable classification is ELIGIBLE.
36. `GEL-036` — guarded readiness re-reads state and refuses if dependent state advanced before mutation.
37. `GEL-037` — lost response after edge creation reconciles by exact replay to one edge/event.
38. `GEL-038` — concurrent identical edge admissions converge to one durable edge/event.
39. `GEL-039` — concurrent candidate edges that together would create a cycle cannot both commit.
40. `GEL-040` — eligibility result is independent of dependency insertion/enumeration order.

### Reconciliation / authority fences

41. `GEL-041` — lost wakeup does not change full-scan eligibility result.
42. `GEL-042` — duplicate/reordered wakeups do not create duplicate READY transitions.
43. `GEL-043` — priority is absent from the v1 dependency-eligibility semantic identity and cannot change classification.
44. `GEL-044` — stage/barrier metadata is absent from the v1 graph contract and cannot create eligibility.
45. `GEL-045` — graph/eligibility implementation contains no worker spawn, scheduler timer, provider network or specialist-system dependency.
46. `GEL-046` — graph/eligibility API exposes no claim acquisition/renewal/revocation, effect dispatch, admission or journal-seal authority.
47. `GEL-047` — journal rebuild yields the same graph and eligibility standing as the pre-loss durable semantic history.
48. `GEL-048` — a stale/mutated local eligibility projection cannot override current canonical transaction/operation/dependency state.

Denominator shrinkage is forbidden without reopening this design lock and recording the reason.

## 13. Cumulative qualification requirement

Before EXECUTION-001A may freeze as implemented:

1. `GEL-001..048` must pass on the exact executable subject;
2. the complete current Controller V2 cumulative Node suite must pass on that exact subject;
3. required hosted matrix remains Ubuntu/Windows x Node 22/24 unless a later explicit environment decision supersedes it;
4. migration/recovery tests must include real v5 -> v6 and fresh-store rebuild paths;
5. no historical CG-008/009/010 PASS may be counted toward the denominator;
6. no production/native/A-01 evidence is implied by hosted-portable PASS.

## 14. Traceability lock

| Requirement / invariant | Current / authorized implementation | Durable state | Interface / contract | Test denominator | Evidence / environment | Blocker |
|---|---|---|---|---|---|---|
| immutable same-tx dependency | authorized EXECUTION-001A build | `operation_dependencies` v6 + semantic event | add dependency v1 | GEL-007..018 | current C1-derived Node lineage | build not yet executed |
| cycle-free graph | authorized EXECUTION-001A build | same table | atomic edge admission | GEL-014..016,039 | SQLite hosted portable first | build not yet executed |
| success-only prerequisite | authorized EXECUTION-001A classifier | operations + dependencies | dependency standing v1 | GEL-019..034 | hosted portable first | build not yet executed |
| guarded readiness | authorized EXECUTION-001A build reusing operation authority | operations/events | `markOperationReadyIfEligible` | GEL-035..036,042 | hosted portable first | build not yet executed |
| replay/recovery | current durable journal + authorized reducer extension | dependency event -> v6 table | recovery reducer | GEL-005..006,037,047 | exact-subject cumulative required | build not yet executed |
| wakeups/projections non-authoritative | no new durable queue | none authoritative | reconcile/full-scan | GEL-041..042,048 | portable | build not yet executed |
| ordering cannot create eligibility | excluded from graph identity | none | future scheduler policy only | GEL-043..044 | design law | later scheduler design |
| no alternate claim/admission/effect authority | frozen Foundation owners | existing state only | narrow graph/eligibility API | GEL-045..046 | source + cumulative tests | must remain invariant |

## 15. Gate standing

- RECOVER: **PASS**
- INVENTORY: **PASS**
- ANALYZE: **PASS**
- TARGETED RESEARCH: **PASS — design-changing scheduler/dependency questions resolved**
- ADJUDICATE: **PASS for EXECUTION-001A v1 scope**
- DESIGN-LOCK: **PASS — 48-case denominator frozen**
- BUILD: **AUTHORIZED, NOT YET EXECUTED**
- ISOLATED QUALIFICATION: **NOT RUN**
- CUMULATIVE REGRESSION/CALIBRATION: **NOT RUN**
- FREEZE: **NOT AUTHORIZED UNTIL EXACT-SUBJECT QUALIFICATION**
- PRODUCTION/NATIVE/A-01: **NOT CLAIMED**

## 16. Exactly one dependency-valid successor

`CONTROLLER-EXECUTION-001A-WORK-GRAPH-ELIGIBILITY-IMPLEMENTATION-001 — IMPLEMENT SCHEMA V6 + CONTENT-ADDRESSED SAME-TX DEPENDENCY EDGES + CYCLE-FENCED ADMISSION + DEPENDENCY CLASSIFIER + GUARDED READY TRANSITION + RECOVERY REDUCER -> RUN GEL-001..048 -> RUN COMPLETE HOSTED CUMULATIVE MATRIX -> FREEZE ONLY ON EXACT-SUBJECT PASS`

No worker spawning, dispatch, worker enrollment, provider execution, scheduler timer/priority policy or production activation is authorized by this design lock.
