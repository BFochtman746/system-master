# CONTROLLER V2 — EXECUTION-001 FORENSIC RECOVERY / INVENTORY 001

Status: **RECOVERED / INVENTORIED / FIRST ANALYSIS PASS COMPLETE / NO EXECUTION BUILD AUTHORIZED**
Working lineage: `controller-v2/foundation-006-c1-rebind`
Foundation closure evidence head: `0e2b2926d1c968660e9eb292e45403d405d314d5`
Foundation executable qualification subject: `0c47bcc25bc5a009ccbeeec170eea5100007149a`
Production Controller activation: `BLOCKED_EXTERNAL_SETUP`
Historical PASS transfer: `0`

## 1. Scope

This is the first recovery/inventory unit above the now-closed hosted-portable Controller Foundation. It does **not** start scheduler, worker, dispatch or provider implementation.

The bounded question is:

> What worker/scheduler/execution responsibilities already have current Controller substrate, what historical semantics are reusable only as archaeology, and what is the first dependency-valid design seam that can be built without creating a second command/admission/claim/effect authority?

No CORE, LEARNING, BOOK or DOCUMENTS specialist semantics are in scope.

## 2. Current frozen Controller substrate that the execution layer must consume

### 2.1 Semantic admission is already owned

Foundation-006 owns the durable ALLOW/DENY decision and legal transition of a command transaction. Execution-layer code may consume durable admitted state; it may not reinterpret transport provenance, command bytes, chat/webhook metadata or worker claims as semantic authorization.

### 2.2 Work/operation state already exists

The frozen kernel provides:

- transaction states including `ADMITTED`, `ACTIVE`, `WAITING` and terminal states;
- operation states `PLANNED`, `READY`, `RUNNING`, `VERIFYING`, `SUCCEEDED`, `FAILED`, `BLOCKED`, `CANCELLED`, `STALE`;
- `createOperation()` restricted to `ADMITTED` or `ACTIVE` transactions;
- `transitionOperation()` with direct `RUNNING` forbidden because a lease is required;
- direct operation `SUCCEEDED` forbidden because a fenced worker result is required.

These are reusable execution-state primitives, not a scheduler.

### 2.3 Claim/fencing authority already exists

Current frozen substrate includes:

- one ACTIVE lease per resource;
- monotonic resource fencing generation;
- `acquireLease()` only for a `READY` operation and its exact planned resource;
- explicit renewal/revocation/release;
- `startLeasedOperation()` requiring the exact current claim;
- stale/revoked/replaced generations fenced from start/result/effect mutation;
- fresh-store recovery that preserves the generation floor but resurrects zero live holders.

A scheduler must consume this authority. It may not invent a second lock/lease table.

### 2.4 Worker authority is intentionally narrow

`createWorkerPort()` currently exposes only:

- `heartbeat()`;
- `submitResult()`.

It explicitly withholds database, outbox-seal, transaction-transition, qualification, promotion, policy-mutation and subject-mutation authority.

This is reusable worker capability containment, not worker enrollment or dispatch.

### 2.5 External-effect uncertainty is already owned

Foundation-003 owns PREPARED/UNKNOWN/reconciliation-style external-effect truth and requires observation before a possibly ambiguous effect is reapplied. Execution code may request/use that boundary but may not equate a provider call return with durable Controller success.

### 2.6 Lifecycle/runtime ownership is already owned

Foundation-004 owns the single cooperating Controller process and READY lifecycle. Scheduler/worker orchestration must not use PID/status files, heartbeats or socket existence as semantic work authority.

## 3. Historical execution/scheduler archaeology recovered

Historical `second-shift-control-gateway` CG-008 through CG-010 is **not Controller V2 ancestry** and none of its PASS standing transfers. It is semantic/test archaeology only.

### CG-008 — supervisor integration / handoff

Useful recovered intent:

- separate durable admission/control-gateway intent from live execution mechanics;
- keep GitHub transport/admission from becoming execution-order truth;
- hand live timing/claim/lease/fence/retry/dispatch/restart responsibilities to one execution supervisor rather than many competing schedulers.

Rejected as current authority:

- A-01 supervisor identity as an automatic Controller V2 execution owner;
- old control-gateway active-work state as Controller V2 durable truth;
- historical A-01/host PASS as qualification for the current Controller lineage.

### CG-009 — dependency / concurrency / cancellation

Useful recovered invariants:

- dependencies are satisfied only by exact durable completion, not by a wakeup or cached projection;
- dependency cycles fail closed;
- resource concurrency is adjudicated atomically with claim/dispatch intent rather than by optimistic parallel launch;
- cancellation is a durable local fence first; any external cancellation acknowledgement is separate evidence;
- registered coordinated work may not bypass the coordination authority;
- randomized transition/stress testing is valuable for race/state-machine qualification.

Rejected as current implementation authority:

- historical Python/supervisor storage and control-state schema;
- historical claim/lease implementation where the current Controller Foundation already owns stronger fencing semantics;
- historical host/A-01 qualification transfer.

### CG-010 — night scheduler retirement

Useful recovered invariants:

- no competing cron/slot-chain scheduler may remain authoritative after one scheduler is selected;
- a durable queue must be restart-reconstructable;
- minimum-stage/dependency barriers must outrank simple priority;
- priority may order only already-eligible work;
- parallel scheduler ticks must not double-claim one resource;
- scheduler retirement/authority transfer must itself be explicit rather than implicit.

Rejected as current authority:

- historical `A01_SUPERVISOR_ONLY` scheduling ownership;
- legacy GitHub night-scheduler state or workflow as Controller V2 scheduler truth;
- old control-gateway queue bytes as a current Controller queue.

## 4. Current gap inventory

| ID | Requirement / invariant | Current implementation | Durable state | Interface / contract | Current evidence | Blocker / gap |
|---|---|---|---|---|---|---|
| EXE-R01 | only semantically admitted work may become schedulable | transaction admission + operation creation guard | transactions/operations | Foundation-006 + `createOperation()` | current cumulative Foundation suite | **REUSE** |
| EXE-R02 | durable operation lifecycle and terminal result fences | kernel operation state machine | operations/events | transition/start/result contracts | current Foundation suite | **REUSE** |
| EXE-R03 | one current claim/resource + monotonic fencing | durable claim authority | leases/resource_generations/events | acquire/renew/revoke/release/fence contracts | FCLAIM + FREC qualified | **REUSE** |
| EXE-R04 | worker receives bounded authority only | `createWorkerPort()` | none additional | heartbeat/result port | frozen 002B/current cumulative suite | **REUSE** |
| EXE-R05 | UNKNOWN provider result observed before reapply | external-effect authority | external_effects/attempts | prepare/dispatch/observe/reconcile | Foundation-003 closure | **REUSE** |
| EXE-R06 | operation dependency graph is durable and cycle-fenced | no current V2 dependency relation was found in the recovered kernel | **MISSING** | **MISSING** | historical CG-009 semantics only | **GAP** |
| EXE-R07 | eligibility derives from admitted/current durable state + completed dependencies, never wakeup order | no dedicated current scheduler eligibility projector | **MISSING/DERIVABLE** | **MISSING** | historical CG-009/010 semantics only | **GAP** |
| EXE-R08 | stage/barrier semantics, if retained, have explicit meaning before priority | no current V2 stage field/contract recovered | **MISSING** | **MISSING** | historical CG-010 only | **ADJUDICATE: retain, generalize or reject** |
| EXE-R09 | priority orders eligible work only and cannot bypass dependency/admission/fence | no current V2 priority contract recovered | **MISSING** | **MISSING** | historical CG-010 only | **ADJUDICATE** |
| EXE-R10 | scheduler selection and claim acquisition do not double-dispatch under concurrent ticks | claim primitive exists; no current scheduler selection/dispatch-intent atomic contract | lease state exists, dispatch intent **MISSING** | **MISSING** | claim race tests exist; scheduler race tests do not | **GAP** |
| EXE-R11 | cancellation fences future local execution before external cancellation observation | transaction/operation cancellation primitives exist | transaction/operation state | cancellation transition APIs | kernel regression | cross-layer cancellation/claim/effect ordering **NOT FROZEN** |
| EXE-R12 | restart/offline rediscovery reconstructs eligible work from durable truth | Foundation recovery exists | journal + rebuilt store | recovery/reconcile | FREC/cumulative | scheduler eligibility rebuild **NOT YET DEFINED** |
| EXE-R13 | worker identity/enrollment/capability standing is mechanically bound, not inferred from mutable metadata | lease stores `worker_id`; no current Controller V2 worker registry/enrollment contract recovered | **MISSING** | **MISSING** | negative authority fences only | **GAP / external identity dependency** |
| EXE-R14 | dispatch binds exact operation, claim generation, worker capability and execution contract | operation/lease pieces exist; no one durable dispatch-intent record recovered | **MISSING** | **MISSING** | no current isolated denominator | **GAP** |
| EXE-R15 | worker result cannot create specialist truth or bypass qualification/completion contract | bounded worker port + completion contract | operation/result/events | `submitWorkerResult()` + completion logic | Foundation regression | **REUSE; later integration proof required** |
| EXE-R16 | scheduler/worker layer has no alternate command/admission/effect/journal authority | architectural fences exist | existing authorities | narrow ports required | source-level/current tests | **MUST REMAIN INVARIANT** |

Recovered bounded rows: **16/16 inventoried**.
Current execution-layer gaps requiring design/adjudication: **EXE-R06, R07, R08, R09, R10, R11 cross-layer ordering, R12 scheduler projection, R13, R14**.

No claim is made that this 16-row denominator is final; targeted research/adversarial analysis may add requirements before design lock.

## 5. Dependency analysis

A worker runtime cannot safely be dispatched merely because a worker ID can be inserted into a lease. The current Foundation deliberately does not prove worker enrollment, capability, delegation or execution-contract standing.

A scheduler also cannot be implemented first as a polling loop over `READY` rows, because current V2 has no frozen dependency graph/eligibility contract. Doing so would recreate historical scheduler semantics by accident and could let priority/wakeup order bypass dependencies.

Therefore the first dependency-valid design seam is **durable work graph + eligibility**, not process spawning or provider execution.

The intended sequencing emerging from this first analysis pass is:

1. durable operation dependency representation + cycle/identity law;
2. deterministic eligibility projection from authoritative transaction/operation/dependency state;
3. scheduler selection + durable dispatch-intent/claim atomicity;
4. worker enrollment/capability binding using external identity/delegation evidence without owning that truth;
5. dispatch/start/heartbeat/result/cancellation integration;
6. provider/effect reconciliation integration;
7. restart/stress/cumulative qualification;
8. only then any production/shadow/canary activation.

This is a provisional dependency analysis, not a design lock.

## 6. Adversarial questions that must be resolved before build

- dependency A completes while two scheduler reconcilers select dependent B concurrently;
- one dependency is cancelled, failed, superseded or stale: does B become BLOCKED, CANCELLED or remain ineligible, and who decides?;
- a cycle is introduced after some nodes exist but before any run;
- priority changes while work is eligible;
- cancellation races with claim acquisition;
- cancellation races with `startLeasedOperation()`;
- revocation races with dispatch acknowledgement;
- claim succeeds but durable dispatch intent publication fails or response is lost;
- dispatch intent is durable but worker never receives it;
- worker receives dispatch, Controller restarts, and the old live worker later submits a result;
- fresh-store recovery preserves the fencing floor but no live claim: how is dispatch intent projected?;
- worker capability or delegation is revoked after selection but before start;
- UNKNOWN external effect exists when cancellation arrives;
- scheduler projection is stale while canonical state has advanced;
- two independent wakeups race; result must be independent of wakeup order;
- no scheduler retry loop may stack with claim, IPC or provider retry loops.

## 7. Historical substrate disposition

- `second-shift-control-gateway/cg-008-supervisor-integration`: **SEMANTIC / STRESS ARCHAEOLOGY ONLY**
- `second-shift-control-gateway/cg-009-dependency-concurrency-cancellation`: **SEMANTIC / TEST ARCHAEOLOGY ONLY**
- `second-shift-control-gateway/cg-010-night-scheduler-retirement`: **SEMANTIC / TEST ARCHAEOLOGY ONLY**
- historical host/A-01 PASS: **PROVENANCE_ONLY / NO PASS TRANSFER**
- current Controller Foundation kernel/ports/claim/effect/recovery substrate: **REUSE / DO NOT REWRITE WITHOUT CAUSE**

## 8. Gate standing

- RECOVER: **PASS — current Foundation + CG-008..010 archaeology**
- INVENTORY: **PASS — 16 bounded rows inventoried**
- ANALYZE: **PASS first pass**
- TARGETED RESEARCH: **REQUIRED NEXT only for design-changing dependency/eligibility/dispatch questions**
- ADJUDICATE: **PARTIAL — first seam selected; detailed graph/eligibility contract unresolved**
- DESIGN-LOCK: **NOT AUTHORIZED**
- BUILD: **NOT AUTHORIZED**
- ISOLATED QUALIFICATION: **NOT RUN**
- CUMULATIVE REGRESSION/CALIBRATION: **NOT RUN**
- FREEZE: **NOT AUTHORIZED**

## 9. Exactly one dependency-valid successor

`CONTROLLER-EXECUTION-001A-WORK-GRAPH-ELIGIBILITY-TARGETED-RESEARCH-ADJUDICATION — RESEARCH ONLY QUESTIONS THAT CAN CHANGE THE DURABLE GRAPH/ELIGIBILITY DESIGN -> FREEZE OWNER/STATE/IDENTITY/CYCLE/CANCELLATION/FAILURE/PRIORITY RULES -> DEFINE LOSSLESS TEST DENOMINATOR -> ONLY THEN AUTHORIZE BUILD`

Hard fence: this successor may not implement worker spawning, provider calls, scheduler timers, or new lease/admission/effect authority before the durable graph/eligibility boundary is design-locked.
