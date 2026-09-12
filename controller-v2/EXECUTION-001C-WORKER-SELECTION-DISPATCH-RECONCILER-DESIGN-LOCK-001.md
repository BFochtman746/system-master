# CONTROLLER V2 — EXECUTION-001C WORKER SELECTION + DISPATCH RECONCILER DESIGN LOCK 001

Status: **TARGETED RESEARCH COMPLETE / ADJUDICATED / DESIGN-LOCKED / BUILD AUTHORIZED / NOT YET QUALIFIED**

Working lineage before this artifact: `controller-v2/execution-001b-forensic-restart@783300185408cdc6bece920ddc05d262b423fea8`
Recovery inventory: `EXECUTION-001C-WORKER-SELECTION-DISPATCH-RECONCILER-RECOVERY-INVENTORY-001.md`
Frozen predecessors: EXECUTION-001A + EXECUTION-001B + Controller Foundation 002B..006
Production Controller activation: **`BLOCKED_EXTERNAL_SETUP`**
Historical PASS transfer: **0**

## 1. Scope

001C freezes the minimum provider-neutral Controller boundary required to converge durable eligible work toward one fenced dispatch:

- derive candidates from current durable Controller state;
- choose a compatible current worker binding deterministically;
- consume the existing claim/fencing authority;
- reconcile claim -> immutable dispatch intent -> existing external-effect boundary;
- stop at the physical-transport/provider edge;
- rediscover partial states after restart or lost wakeups.

001C does **not** own worker spawning, provider/network business semantics, specialist payload meaning, identity/delegation truth, human approval, production activation, dynamic capacity truth, preemption or a new durable queue/retry/lease/effect authority.

## 2. Targeted external research and design-changing conclusions

Research was limited to questions capable of changing the 001C contract.

### 2.1 Kubernetes Scheduling Framework

Current official reference:
`https://kubernetes.io/docs/concepts/scheduling-eviction/scheduling-framework/`

Relevant observations:
- scheduling selection and binding are separate phases;
- readiness to enter scheduling is distinct from queue ordering (`PreEnqueue` vs `QueueSort`);
- event-derived `QueueingHint` causes reconsideration rather than becoming scheduling truth;
- reservation cleanup is required to be idempotent;
- permit/binding is a distinct authority boundary after selection.

Adjudicated consequence:
- Controller candidate projection and worker preference are advisory until the existing durable claim succeeds;
- queue/wakeup order cannot create eligibility;
- selection and authority-changing binding remain separate;
- no second reservation mechanism is introduced because Controller already owns a stronger fenced claim primitive.

### 2.2 Kubernetes controller / sync-loop pattern

Current official references:
- `https://kubernetes.io/docs/concepts/architecture/controller/`
- `https://kubernetes.io/docs/reference/node/kubelet-sync-loop/`

Relevant observations:
- a control loop repeatedly compares desired/current state and converges them;
- events wake reconciliation, while the reconciler reads current state again;
- the kubelet explicitly aggregates multiple wakeup sources into a sync loop that reconciles current desired/actual state.

Adjudicated consequence:
- 001C is level-triggered over durable Controller truth;
- chat/webhook/heartbeat/outbox/provider notifications are wakeup hints only;
- one reconcile pass never assumes an earlier read is still fresh after a mutation.

### 2.3 Kubernetes Node heartbeats / Lease separation

Current official references:
- `https://kubernetes.io/docs/reference/node/node-status/`
- `https://kubernetes.io/docs/concepts/architecture/leases/`

Relevant observation:
- raw heartbeats/leases are inputs used by a control-plane owner to determine availability; they are not interchangeable with workload identity, scheduling policy or a completed binding decision.

Adjudicated consequence:
- current Controller worker heartbeat remains operational signal only;
- 001C does not promote heartbeat freshness into identity/delegation/capability truth;
- the existing Controller resource lease remains the only claim/fence authority.

### 2.4 Priority/fairness

Current official Kubernetes priority references demonstrate that priority/preemption is a separately configured policy with authorization/resource-abuse consequences rather than a prerequisite for basic scheduling correctness.

Adjudicated consequence:
- Controller v1 001C does **not** add user priority, preemption or a durable fairness queue;
- deterministic age/order is used only to make scanning reproducible;
- richer priority/fairness requires a separately versioned later policy and may never bypass eligibility, approval, claim or fence laws.

## 3. Ownership adjudication

### 001C owns

- a deterministic, read-only candidate projection over current Controller state;
- deterministic worker-binding preference among bindings already CURRENT and capability-compatible;
- a provider-neutral reconcile contract that invokes existing 001A/001B/Foundation authorities;
- bounded reconcile standing/reason codes;
- restart/offline rediscovery of locally derivable partial dispatch states;
- local classification of whether another pass, external observation, or external setup is required.

### 001C does not own

- command/admission truth;
- dependency semantics;
- worker identity/delegation/capability evidence creation;
- human approval;
- resource-claim/fence truth;
- external-effect truth;
- provider calls or provider retry;
- dynamic worker capacity/health authority;
- specialist result truth;
- qualification/promotion truth;
- CORE/LEARNING/BOOK/DOCUMENTS semantics.

## 4. No-new-durable-state design decision

001C introduces **no schema v8** and no new authoritative table.

Authoritative state already exists in:
- transactions / operations;
- operation_dependencies;
- worker_bindings / worker_binding_revocations;
- execution_contracts;
- leases / resource_generations;
- dispatch_intents;
- external_effects / external_effect_attempts;
- semantic events + outbox/journal.

Candidate lists, worker choices and reconcile standings are projections. Persisting a second scheduler queue, reservation, retry counter or worker-liveness table would duplicate existing authority and is forbidden in 001C.

## 5. Process / scheduler authority

Foundation-004 already freezes one cooperating Controller process per canonical local database path using an OS-enforced SQLite ownership transaction. PID, status files, heartbeats and chat/webhook metadata are explicitly non-authoritative.

Therefore 001C adds **no scheduler leader-election state** for the current local portable architecture.

Rules:
- only the current READY Controller runtime owner may run the mutation-capable reconcile loop;
- non-owner tools may perform read-only diagnostics only;
- restart obtains Foundation-004 ownership, completes recovery, then begins reconciliation;
- future multi-process/network deployment requires a separately qualified leader/ownership design and is not inferred from hosted evidence.

## 6. Candidate projection lock

### 6.1 Operation scan

A read-only projection may enumerate current candidate operations in deterministic order:

`operations.created_at ASC, operation_id ASC`

Eligible scan states:
- `PLANNED` — may be passed to the existing 001A guarded readiness reconciler;
- `READY` — may be considered for worker selection/claim;
- `RUNNING` only when existing dispatch/effect state requires local reconciliation/observation classification.

Terminal operations are never new-dispatch candidates.

The scan order is not semantic authority. It is only reproducibility/fairness-of-opportunity for one pass.

### 6.2 Head-of-line blocking is forbidden

A candidate that has no compatible current worker, a resource conflict, an external setup blocker or an effect awaiting observation must not stop the whole pass. The reconciler may classify it and continue scanning other independent candidates.

### 6.3 No priority/preemption in v1

No `priority`, stage, preemption or mutable queue-position field is added. Future priority may order only already eligible candidates and requires separate versioned policy.

## 7. Worker preference lock

For one exact execution contract at one `nowMs`, a worker candidate must:

1. reference a `worker_binding_id` whose standing is exactly `CURRENT`;
2. contain every required capability from the immutable execution contract;
3. bind a nonempty `worker_ref`;
4. remain external-evidence-backed; heartbeat/socket/chat/webhook state is not a candidate prerequisite.

Compatible binding projection order:

`worker_ref ASC, binding_id ASC`

The first compatible binding is the deterministic v1 preference.

This is intentionally **not** a capacity or fairness claim. 001C has no durable dynamic-capacity truth. A later placement/resource policy may replace the preference rule only under a separately versioned contract.

If no compatible CURRENT binding exists, return `WAITING_NO_CURRENT_WORKER` without mutating the operation or inventing a worker.

## 8. Reconcile contract

Implementation is authorized to expose a provider-neutral function equivalent to:

`reconcileExecutionOperation(operationId, { nowMs })`

and a bounded scanner equivalent to:

`listExecutionReconcileCandidates({ limit, nowMs })`

One call must reread current durable state and converge at most one authority-changing local step before returning. A caller can immediately schedule another pass, but the next pass must reread from durable truth.

### 8.1 PLANNED

- invoke/read 001A dependency eligibility;
- if ELIGIBLE, use existing `markOperationReadyIfEligible()` and return `PROGRESSED_READY`;
- if waiting/terminal-dependency/ineligible, return a bounded standing with no scheduler mutation.

### 8.2 READY with no current resource claim

- require exact execution contract;
- derive compatible current worker bindings;
- if none, return `WAITING_NO_CURRENT_WORKER`;
- select deterministic v1 preference;
- call existing `acquireLease(operation, resource, worker_ref, ...)`;
- return `PROGRESSED_CLAIMED` after rereading standing.

Selection before the claim is advisory. Only the durable lease/fence transition creates execution claim authority.

### 8.3 READY with a current claim for another operation

Return `WAITING_RESOURCE_CLAIMED`. Do not add a scheduler reservation or busy-loop retry.

If the existing active claim is expired, the existing claim authority may expire/replace it during the next legal acquisition; 001C does not mutate generation directly.

### 8.4 READY with a current claim for this operation and no dispatch intent

- find a CURRENT compatible worker binding whose `worker_ref` equals the claim worker;
- if none exists, do not silently substitute a different worker under the existing claim;
- if the claim is still ACTIVE/current, revoke it through the existing claim authority using bounded reason `WORKER_BINDING_NOT_CURRENT`, then return `PROGRESSED_CLAIM_REVOKED`;
- otherwise return the exact current claim standing;
- when a matching binding exists, call existing content-addressed `createDispatchIntent()` and return `PROGRESSED_DISPATCH_INTENT`.

### 8.5 dispatch intent with no effect

Use existing `prepareWorkerDispatchEffect()` only. It rereads READY + executable transaction + current binding + live fence and exact envelope digest. Return `PROGRESSED_EFFECT_PREPARED`.

### 8.6 PREPARED effect

Use existing `activateWorkerDispatch()` only. It revalidates binding/effect/envelope, starts the exact leased operation and delegates send authorization to Foundation-003, producing UNKNOWN durable effect standing. Return `PROGRESSED_DISPATCH_AUTHORIZED_UNKNOWN`.

### 8.7 UNKNOWN / RECONCILING effect

Return `NEEDS_EXTERNAL_EFFECT_OBSERVATION` with immutable effect/dispatch references. Do not resend and do not implement provider retry.

### 8.8 authorized effect awaiting durable seal

Return `WAITING_DURABILITY_BARRIER` until Foundation-003 journal/outbox standing permits `getWorkerDispatchPermit()`.

001C may expose the existing permit only after the existing permit function succeeds. The permit is capability-like send authority; 001C does not itself perform transport I/O.

### 8.9 terminal dispatch effect

- `SUCCEEDED` means the dispatch effect has terminal provider evidence; it does **not** mean specialist work succeeded. The operation remains governed by worker result/completion authority.
- `FAILED|CANCELLED` prevents new send authority. 001C returns `DISPATCH_TERMINAL_NON_SUCCESS` and does not reinterpret that as specialist failure/certification/qualification truth.
- transition of a RUNNING operation into a retry/replan policy is deferred to a separately explicit execution-recovery rule; 001C v1 does not silently redispatch under a new worker after a terminal external-effect failure.

## 9. Reconciliation and retry law

- events/wakeups only request another pass;
- every pass rereads current durable state;
- one pass performs at most one authority-changing local step;
- exact replay uses existing content-addressed/idempotent identities;
- no read-after-write freshness assumption; return values are confirmed/reread standing where existing APIs support it;
- resource conflict, no compatible worker, awaiting durability and awaiting provider observation are normal standings, not exceptions to spin on;
- schema/integrity/identity/digest/authorization conflicts are permanent/fail-closed;
- only classified transient host/database access failures may be retried by the outer runtime, finitely, with bounded backoff+jitter and the same semantic identity;
- 001C owns no provider retry loop;
- no nested scheduler + claim + IPC + provider retry stack is permitted.

## 10. Cancellation / revocation / restart laws

- transaction/operation cancellation is reread before every new authority-changing step;
- binding revocation/expiry before claim -> worker is not selectable;
- binding revocation/expiry after claim but before intent -> revoke/fence claim; do not substitute worker in-place;
- binding revocation/expiry after intent but before effect authorization -> existing 001B validation fails closed;
- revocation after UNKNOWN preserves the external-effect reconciliation obligation and prevents new permit authority;
- fresh-store recovery restores immutable history/generation floor but zero historical live holders;
- historical dispatch without a current claim cannot regain send authority;
- restart does not require replaying wakeups or rebuilding an authoritative queue.

## 11. Frozen standing / reason vocabulary

At minimum implementation must use stable bounded standings equivalent to:

- `NOOP_TERMINAL`
- `WAITING_DEPENDENCY`
- `BLOCKED_DEPENDENCY_TERMINAL`
- `INELIGIBLE_TRANSACTION`
- `PROGRESSED_READY`
- `WAITING_EXECUTION_CONTRACT`
- `WAITING_NO_CURRENT_WORKER`
- `WAITING_RESOURCE_CLAIMED`
- `PROGRESSED_CLAIMED`
- `PROGRESSED_CLAIM_REVOKED`
- `PROGRESSED_DISPATCH_INTENT`
- `PROGRESSED_EFFECT_PREPARED`
- `PROGRESSED_DISPATCH_AUTHORIZED_UNKNOWN`
- `WAITING_DURABILITY_BARRIER`
- `NEEDS_EXTERNAL_EFFECT_OBSERVATION`
- `DISPATCH_TERMINAL_SUCCESS`
- `DISPATCH_TERMINAL_NON_SUCCESS`
- `BLOCKED_EXTERNAL_SETUP`

These are Controller execution diagnostics, not specialist-domain semantic states.

## 12. Frozen isolated test denominator — SDR-001..SDR-060

### Candidate projection / ownership
1. `SDR-001` — 001C adds no schema v8/table and existing v7 opens unchanged.
2. `SDR-002` — candidate scan is deterministic by created_at then operation_id.
3. `SDR-003` — terminal operations are excluded from new-dispatch candidates.
4. `SDR-004` — READY candidate under non-executable transaction is classified/fenced, not dispatched.
5. `SDR-005` — lost/duplicate/reordered wakeups do not change candidate truth.
6. `SDR-006` — PID/status/chat/webhook/heartbeat metadata cannot create a candidate or scheduler authority.
7. `SDR-007` — head-of-line blocked candidate does not prevent independent later candidate classification.
8. `SDR-008` — current Foundation-004 owner is required for mutation-capable reconcile wrapper.
9. `SDR-009` — non-owner diagnostic scan is read-only.
10. `SDR-010` — no scheduler leader/queue/reservation durable state is created.

### Worker compatibility / deterministic preference
11. `SDR-011` — exact CURRENT capable binding is selectable.
12. `SDR-012` — revoked binding is excluded.
13. `SDR-013` — expired binding is excluded.
14. `SDR-014` — not-yet-valid binding is excluded.
15. `SDR-015` — missing required capability is excluded.
16. `SDR-016` — extra capabilities do not invalidate an otherwise compatible binding.
17. `SDR-017` — multiple compatible bindings order by worker_ref then binding_id.
18. `SDR-018` — raw heartbeat freshness does not reorder or authorize workers.
19. `SDR-019` — no compatible binding yields WAITING_NO_CURRENT_WORKER with zero claim/effect mutation.
20. `SDR-020` — worker selection cannot mutate execution contract requirements to fit a worker.

### PLANNED -> READY convergence
21. `SDR-021` — eligible PLANNED operation progresses through existing 001A readiness only.
22. `SDR-022` — waiting prerequisite remains WAITING_DEPENDENCY with no claim.
23. `SDR-023` — terminal non-success prerequisite remains BLOCKED_DEPENDENCY_TERMINAL with no claim.
24. `SDR-024` — concurrent/replayed readiness pass converges to one READY transition.
25. `SDR-025` — readiness progression grants no worker/claim/effect authority in the same pass.

### Claim convergence
26. `SDR-026` — READY + compatible worker + free resource progresses to one existing durable claim.
27. `SDR-027` — selection result alone grants no authority before claim commit.
28. `SDR-028` — resource claimed by another operation yields WAITING_RESOURCE_CLAIMED and no second active claim.
29. `SDR-029` — lost claim response is rediscovered; next pass does not mint a second current generation for the same already-satisfied claim.
30. `SDR-030` — expired resource claim is replaced only through existing claim authority/generation law.
31. `SDR-031` — current claim worker with no CURRENT compatible binding is revoked/fenced rather than silently substituted.
32. `SDR-032` — exact revocation replay is idempotent.
33. `SDR-033` — stale generation cannot advance dispatch.
34. `SDR-034` — cancellation before claim prevents claim acquisition.
35. `SDR-035` — binding revocation race before claim is observed by reread and prevents claim.

### Dispatch / effect convergence
36. `SDR-036` — current exact claim + matching binding + no intent creates one content-addressed dispatch intent.
37. `SDR-037` — lost intent response is rediscovered and exact replay creates no duplicate event.
38. `SDR-038` — current intent + no effect prepares one exact external effect.
39. `SDR-039` — lost prepare response converges to same effect.
40. `SDR-040` — effect preparation revalidation failure produces no authorization attempt.
41. `SDR-041` — PREPARED effect activation uses existing 001B/Foundation-003 authority only.
42. `SDR-042` — activation creates exactly one UNKNOWN attempt and does not physically send before durable seal.
43. `SDR-043` — duplicate activation cannot create second attempt.
44. `SDR-044` — UNKNOWN yields NEEDS_EXTERNAL_EFFECT_OBSERVATION and no blind resend.
45. `SDR-045` — pending durability yields WAITING_DURABILITY_BARRIER.
46. `SDR-046` — SEALED exact effect can expose existing bounded send permit.
47. `SDR-047` — permit cannot survive current binding/fence invalidation.
48. `SDR-048` — terminal dispatch SUCCEEDED is not interpreted as operation/specialist SUCCEEDED.
49. `SDR-049` — terminal dispatch FAILED/CANCELLED creates no automatic specialist failure/retry truth.
50. `SDR-050` — no alternate external-effect/retry state machine or provider call is introduced.

### Cancellation / restart / reconcile / retry
51. `SDR-051` — cancellation between READY and claim prevents further progression.
52. `SDR-052` — cancellation between claim and intent prevents new dispatch authority and preserves claim history.
53. `SDR-053` — binding revocation between intent and authorization fails closed through existing 001B checks.
54. `SDR-054` — revocation after UNKNOWN preserves observation obligation and blocks new permit authority.
55. `SDR-055` — fresh-store recovery with historical dispatch restores zero live holder and cannot send.
56. `SDR-056` — restart with READY/no-claim work rediscovers the candidate without replaying a wakeup queue.
57. `SDR-057` — restart with exact live local state converges from durable component rows rather than cached reconcile memory.
58. `SDR-058` — one reconcile pass performs at most one newly authorized local progression step.
59. `SDR-059` — permanent integrity/identity/auth failures are not transient-retried.
60. `SDR-060` — randomized duplicate/reordered passes converge without duplicate claim/intent/effect-attempt authority or stacked retry loops.

## 13. Qualification rule

001C cannot freeze unless one exact executable subject provides:
- SDR-001..060 = 60/60;
- complete current Controller cumulative suite on that same subject;
- Ubuntu + Windows x supported Node 22/24 matrix;
- restart/fresh-store recovery adversarial cases;
- zero denominator shrinkage;
- historical PASS transfer = 0.

Hosted portable PASS does not imply production provider identity, real delegation, real worker availability/capacity, target-native/device behavior, shared/network filesystem correctness or A-01 standing.

## 14. Gate standing

- RECOVER: **PASS**
- INVENTORY: **PASS — bounded 28-row first inventory**
- ANALYZE: **PASS**
- TARGETED RESEARCH: **PASS**
- ADJUDICATE: **PASS**
- DESIGN-LOCK: **PASS**
- BUILD: **AUTHORIZED**
- ISOLATED QUALIFICATION: **NOT RUN**
- CUMULATIVE REGRESSION/CALIBRATION: **NOT RUN for 001C**
- FREEZE: **NOT AUTHORIZED**
- PRODUCTION/NATIVE/A-01: **NOT CLAIMED**

## 15. Exactly one dependency-valid successor

`CONTROLLER-EXECUTION-001C-WORKER-SELECTION-DISPATCH-RECONCILER-BUILD-001 — IMPLEMENT THE NO-NEW-DURABLE-STATE CANDIDATE PROJECTION + PROVIDER-NEUTRAL ONE-STEP RECONCILER AGAINST FROZEN 001A/001B/FOUNDATION AUTHORITIES -> IMPLEMENT SDR-001..060 -> ISOLATED QUALIFY -> CUMULATIVE MATRIX -> FREEZE ONLY ON EXACT-SUBJECT PASS.`

Hard fence: no provider network I/O, no worker spawning, no durable priority/fairness/queue/capacity state, no second lease/effect/retry authority, no mutable wakeup/heartbeat/chat/webhook authority, no peer-owner specialist semantics.
