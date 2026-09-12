# CONTROLLER V2 — EXECUTION-001B WORKER CAPABILITY + DISPATCH DEPENDENCY RECOVERY / INVENTORY 001

Status: **RECOVERED / INVENTORIED / ANALYZED / TARGETED RESEARCH FIRST PASS COMPLETE / DESIGN NOT LOCKED / BUILD NOT AUTHORIZED**
Working lineage before this artifact: `controller-v2/foundation-006-c1-rebind@b73e6eadffe0cbff9afd1390c8f4a9b71407a560`
Qualified execution-graph subject: `0991aeb39a1de71d1755ed6e5f5039ae6f3a7a05`
Execution-graph qualification: `EXECUTION-001A-WORK-GRAPH-ELIGIBILITY-QUALIFICATION-RECEIPT-001.md`
Foundation executable predecessor: `0c47bcc25bc5a009ccbeeec170eea5100007149a`
C1 qualified activation-closure root: `a2ed4205cb7674b41f09db42fd9e687cdcf8eb2d`
Production Controller activation: `BLOCKED_EXTERNAL_SETUP`
Historical PASS transfer: `0`

## 1. Scope

This unit recovers the dependencies that must be closed before Controller V2 may dispatch an eligible operation to any worker.

It is deliberately narrower than a scheduler or worker runtime. It inventories:

- worker identity/enrollment input;
- capability evidence/binding;
- delegation input;
- execution-contract identity;
- durable dispatch intent;
- exact claim/fencing integration;
- dispatch acknowledgement and uncertainty;
- cancellation/revocation/restart reconciliation;
- retry ownership.

It does **not** spawn workers, call providers, select a worker, create scheduling timers, install production credentials, or take CORE/LEARNING/BOOK/DOCUMENTS specialist semantics.

## 2. Current Controller substrate recovered

### 2.1 Eligibility is already frozen

EXECUTION-001A now owns same-transaction dependency identity, cycle-fenced graph admission, success-only prerequisite standing, deterministic eligibility and guarded `PLANNED -> READY` transition. A dispatch layer may consume only a current READY operation produced under that boundary; queue position, wakeup order and priority cannot manufacture eligibility.

### 2.2 Claim/fence authority is already frozen

The current Foundation owns:

- exact READY-operation/resource claim acquisition;
- one ACTIVE claim per resource;
- monotonic fencing generation;
- exact worker-id field binding inside a lease;
- explicit renewal/revocation/release;
- stale-generation fencing of start/result/effect paths;
- fresh-store recovery that preserves the fencing floor but restores **zero live claims**.

The `worker_id` field is therefore an existing opaque claim attribute. It is **not**, by itself, evidence that the named worker exists, is enrolled, is delegated, has required capabilities, or remains authorized.

### 2.3 Worker authority is already intentionally bounded

The current worker-facing port exposes liveness/result submission capability rather than Controller database, admission, policy, journal, qualification or promotion authority. Heartbeats remain liveness observations and cannot become semantic identity, admission or delegation truth.

### 2.4 External-effect uncertainty is already frozen

Foundation-003 already owns durable PREPARED/UNKNOWN/reconciliation semantics for ambiguous external effects and requires observation before reapply. EXECUTION-001B must not create a competing generic effect authority merely because dispatch crosses a process/provider boundary.

### 2.5 Semantic admission and transport authorization are already separate

Foundation-006 owns semantic ALLOW/DENY admission. Foundation-005 owns authenticated local transport without promoting transport authentication into command or worker semantic authorization. Worker transport authentication therefore cannot silently become worker enrollment, capability, delegation or permission-to-execute truth.

## 3. Historical archaeology recovered — provenance only

Historical Second Shift Control Gateway / Supervisor artifacts are not Controller V2 ancestry and transfer **zero PASS standing**.

### 3.1 CG-008 supervisor integration

Recovered historical intent:

- durable admission/control intent and live execution mechanics were intended to remain separate;
- a live execution supervisor historically owned order/timing/claim/lease/fence/retry/dispatch/recovery while GitHub remained transport/admission/evidence.

Disposition:

- the old A-01 supervisor is **not** the current Controller V2 worker/scheduler authority;
- its host/A-01 evidence does not qualify the current lineage;
- only separation-of-authority lessons may be reused.

### 3.2 CG-009 dependency/concurrency/cancellation

Recovered historical intent that remains useful as adversarial archaeology:

- resource concurrency was expected to be atomic with lease and dispatch intent;
- cancellation established a durable local fence before any external acknowledgement;
- registered coordinated work could not bypass the coordinator;
- stress/randomized transition testing was used to challenge races.

Disposition:

- current Controller claim/fencing supersedes the old lease implementation;
- current EXECUTION-001A supersedes the old dependency-DAG implementation;
- cancellation/dispatch race scenarios remain reusable test archaeology.

### 3.3 `tools/second_shift_supervisor_v2.py`

Recovered historical prototype concepts:

- claim identity included exact objective/control-head/idempotency/fencing/dispatch binding;
- one active claim per lane;
- durable `dispatch_outbox` carried dispatch ID, lease ID, semantic idempotency key, fence, executor kind, payload, state, attempt, next-attempt time, external run ID and last error;
- claim and `DISPATCH_INTENT` were written in one SQLite mutation boundary;
- exact dispatch acknowledgement replay converged when the same external run ID was observed and rejected conflicting external run IDs;
- dispatch failure used bounded attempt/circuit semantics.

Disposition:

- **SEMANTIC / ADVERSARIAL / TEST ARCHAEOLOGY ONLY**;
- Second-Shift-specific lane/delegation/window policy is not promoted into generic Controller execution;
- the historical dispatch outbox is not copied as a second effect/claim authority;
- historical retry counts/circuit timings are not promoted without current design adjudication.

## 4. Targeted external research first pass

Research was limited to worker-identity questions that can materially change the design.

### 4.1 SPIFFE workload identity / SVID model

Official references:

- `https://spiffe.io/docs/latest/deploying/svids/`
- `https://spiffe.io/docs/latest/spiffe-specs/spiffe_workload_api/`
- `https://spiffe.io/docs/latest/deploying/registering/`

Design-changing observations:

1. Workload identity can be supplied as a cryptographically verifiable, short-lived SVID rather than a mutable worker-name string.
2. Identity issuance/entitlement and workload attestation belong to an identity authority/agent, not to the consuming application.
3. Workload identity may rotate/expire; the application must not assume a previously observed identity document remains current forever.
4. A workload can be entitled to one or more identities; selection/authorization remains a separate concern from transport possession of an identity document.

Adjudicated implication for this inventory:

- Controller V2 must **consume** mechanically verified identity/delegation evidence; it must not mint or infer worker identity;
- a future Controller-owned worker binding should bind exact evidence references/digests and validity/revision facts as opaque inputs rather than turning `worker_id`, socket identity, heartbeat metadata or chat/webhook fields into identity authority;
- transport authentication remains necessary but insufficient for permission to execute a specific Controller operation.

No decision is made here that production must use SPIFFE/SPIRE specifically. The research is used to preserve the identity-authority boundary and short-lived-evidence problem.

## 5. Lossless dependency inventory

| ID | Requirement / invariant | Current component | Durable state | Interface / contract | Tests / evidence | Environment | Standing / blocker |
|---|---|---|---|---|---|---|---|
| WCD-R01 | operation must be semantically admitted and dependency-eligible before dispatch | Foundation-006 + EXECUTION-001A | transactions + operations + dependency graph | admission + guarded READY | exact hosted qualification through `0991aeb...` | hosted portable | **REUSE** |
| WCD-R02 | current claim/fence is the only Controller execution claim authority | durable claim authority | leases + resource generation | acquire/renew/revoke/release/fence | FCLAIM/FREC + cumulative | hosted portable | **REUSE** |
| WCD-R03 | `worker_id` on a claim is a binding field, not proof of worker identity | current lease schema | leases | claim contract | source + negative authority fences | all | **REUSE FIELD / IDENTITY PROOF GAP** |
| WCD-R04 | worker/service identity must come from mechanically verified external evidence | no current enrollment authority | **MISSING binding snapshot** | external identity evidence input | SPIFFE research + current negative fences | production integration external | **GAP / EXTERNAL AUTHORITY INPUT** |
| WCD-R05 | delegation/authorization-to-act for a worker must not be synthesized by Controller | no current worker-delegation binding | **MISSING binding snapshot** | external delegation decision/reference | current policy fences | external human/identity/policy authority | **GAP / EXTERNAL AUTHORITY INPUT** |
| WCD-R06 | worker capability set/version must be exact-bound before dispatch | no current capability registry recovered | **MISSING** | capability evidence/snapshot | none current | portable design possible; real evidence external | **GAP** |
| WCD-R07 | capability evidence may expire/revoke/change without mutating historical dispatch truth | no current binding record | **MISSING** | versioned/immutable snapshot needed | none current | portable design possible | **GAP** |
| WCD-R08 | execution contract must exact-bind operation, subject/input, required capability and protocol/version | operation plan is too small for full dispatch identity | **MISSING** | immutable execution-contract identity | none current | portable design possible | **GAP** |
| WCD-R09 | dispatch intent must be durable before/with any external send | no current V2 dispatch-intent record recovered | **MISSING** | durable dispatch intent | historical supervisor archaeology only | portable design possible | **GAP** |
| WCD-R10 | dispatch intent must bind exact operation + lease + generation + worker binding + execution contract | claim pieces exist separately | **MISSING joined truth** | content-addressed dispatch identity candidate | historical archaeology only | portable design possible | **GAP** |
| WCD-R11 | no dispatch may survive claim revocation/replacement as executable authority | lease fence exists | leases/generation | fence validation | FCLAIM/FREC | hosted portable | **REUSE; integration proof needed** |
| WCD-R12 | duplicate/lost dispatch response must reconcile by exact semantic identity | generic reconciliation law exists | no dispatch ack state | exact ack/reconcile contract | historical supervisor archaeology | portable design possible | **GAP** |
| WCD-R13 | conflicting external dispatch acknowledgement must fail closed | no current dispatch ack contract | **MISSING** | exact external execution observation | historical prototype only | provider/worker adapter later | **GAP** |
| WCD-R14 | restart/offline recovery must rediscover durable pending dispatch truth | Foundation recovery exists | journal/store | recovery/reconcile | current recovery suite | dispatch projection absent | **GAP** |
| WCD-R15 | fresh-store recovery must never resurrect a historical worker or claim from dispatch evidence | FREC already restores zero live claims | generation floor + nonauthorizing claim history | FREC contract | FREC 36/36 | hosted portable | **REUSE HARD FENCE** |
| WCD-R16 | heartbeat/liveness is observation only | bounded worker port + claim authority | lease heartbeat observation | heartbeat | predecessor tests | hosted portable | **REUSE HARD FENCE** |
| WCD-R17 | cancellation/revocation must fence local execution before relying on remote cancellation acknowledgement | operation/transaction cancellation + revocation exist | operation/tx/lease | cancellation + revoke | predecessor tests + historical CG-009 race cases | portable design needed | **PARTIAL / CROSS-LAYER ORDERING GAP** |
| WCD-R18 | result submission remains fenced and cannot create specialist truth | worker result + completion contract | operation/events | `submitWorkerResult` | predecessor cumulative suite | hosted portable | **REUSE; integration proof needed** |
| WCD-R19 | dispatch retry may cover only classified transient transport failure using same intent identity and bounded backoff/jitter | global retry law frozen; no dispatch retry owner | **MISSING dispatch retry state/owner** | reconcile/retry | historical circuit archaeology only | adapter later | **GAP / MUST AVOID STACKED RETRIES** |
| WCD-R20 | ambiguous external dispatch/send outcome must be observed before blind re-send | Foundation-003 effect uncertainty exists | external effect state | PREPARED/UNKNOWN/reconcile | Foundation-003 qualification | dispatch/effect relationship unresolved | **ADJUDICATE REUSE VS SPECIALIZED PROJECTION** |
| WCD-R21 | worker selection/placement/order cannot create eligibility | EXECUTION-001A | graph/operation state | eligibility | GEL 48/48 | hosted portable | **REUSE HARD FENCE** |
| WCD-R22 | scheduler selection policy/priority/placement is later than worker-binding/dispatch contract | no scheduler policy authorized | none | later layer | none | later | **DEFERRED BY DEPENDENCY** |
| WCD-R23 | worker dispatch layer may not create alternate command/admission/claim/effect/journal authority | frozen Foundation authorities | existing durable authorities | narrow ports only | cumulative source/tests | all | **MUST REMAIN INVARIANT** |
| WCD-R24 | production worker identity/delegation/provider credentials/native behavior/A-01 are evidence classes, not inferred PASS | none current | none | external evidence only | none claimed | production/native external | **BLOCKED_EXTERNAL_EVIDENCE / NOT A PORTABLE IMPLEMENTATION GAP** |

Recovered bounded rows: **24/24 inventoried**.
Portable design gaps remain; therefore EXECUTION-001B is not design-locked and no implementation is authorized by this artifact.

## 6. Key adjudications already safe to freeze at inventory level

The following ownership decisions do not require a provider choice:

1. **Controller does not own worker identity truth.** It may verify/record an exact identity-evidence binding supplied by an authorized identity system.
2. **Controller does not own delegation truth.** It may consume an exact delegation/policy decision/reference and bind it to a dispatch decision.
3. **Heartbeat does not prove identity, delegation or capability.** It is liveness evidence only.
4. **`worker_id` is not enough.** It remains an opaque claim binding unless accompanied by admitted evidence.
5. **Claim/fence authority is not reopened.** EXECUTION-001B must use the frozen lease/generation model.
6. **Eligibility is not reopened.** Worker selection/priority can only consider work already READY under EXECUTION-001A.
7. **Historical A-01 supervisor ownership is retired provenance.** It does not become Controller V2 worker authority by name similarity.
8. **Dispatch uncertainty must reconcile rather than blindly retry.** Whether the existing generic external-effect authority is reused directly or wrapped by a dispatch-specific projection remains a design question; a second generic effect authority is forbidden.

## 7. Design-changing questions still open

These questions must be resolved before a formal EXECUTION-001B design lock:

1. What is the minimal provider-neutral **worker evidence binding** that can accept SPIFFE/SVID, local service identity, GitHub App/runner or another future identity source without Controller owning those identity systems?
2. Does the Controller persist the complete verified identity document, only a digest/reference + verifier/policy revision + validity interval, or a bounded combination that preserves offline forensic traceability without unnecessary credential/secret retention?
3. How is capability evidence represented so the historical dispatch remains immutable while current capability/delegation can expire or revoke?
4. What fields define the content-addressed execution contract and dispatch intent?
5. Must claim acquisition and dispatch-intent creation be one Controller SQLite mutation boundary, or may dispatch intent be reconciled deterministically immediately after claim acquisition without creating an unrepresented claimed-but-undispatchable state?
6. Can Foundation-003 external-effect authority carry the actual dispatch-send uncertainty directly, or should EXECUTION-001B add only a dispatch-specific semantic projection that references one Foundation-003 effect identity?
7. How are cancellation/revocation ordered against PREPARED/UNKNOWN dispatch send, external acknowledgement and worker start?
8. On fresh-store recovery with zero live claims, which historical dispatch states are retained as forensic/reconciliation evidence and which must be forced non-authorizing?
9. Which layer owns transient dispatch transport retries so no scheduler, IPC adapter and provider adapter stack retries for the same send?
10. What exact adversarial/stress denominator proves no double-dispatch across duplicate wakeups, lost acknowledgements, concurrent reconcilers and restart?

## 8. Gate standing

- RECOVER: **PASS — current Controller + historical CG-008/009/supervisor archaeology**
- INVENTORY: **PASS — 24 bounded rows inventoried**
- ANALYZE: **PASS first pass**
- TARGETED RESEARCH: **PASS first identity-boundary pass; additional research only for the open design-changing questions above**
- ADJUDICATE: **PARTIAL — authority ownership fences frozen; persistence/dispatch contract unresolved**
- DESIGN-LOCK: **NOT AUTHORIZED**
- BUILD: **NOT AUTHORIZED**
- ISOLATED QUALIFICATION: **NOT RUN**
- CUMULATIVE REGRESSION/CALIBRATION: **NOT RUN**
- FREEZE: **NOT AUTHORIZED**
- PRODUCTION/NATIVE/A-01: **NOT CLAIMED**

## 9. Exactly one dependency-valid successor

`CONTROLLER-EXECUTION-001B-WORKER-BINDING-DISPATCH-TARGETED-RESEARCH-ADJUDICATION-001 — RESOLVE PROVIDER-NEUTRAL WORKER-EVIDENCE SNAPSHOT + CAPABILITY VERSION/EXPIRY/REVOCATION BINDING + EXECUTION-CONTRACT/DISPATCH-INTENT IDENTITY + CLAIM/INTENT ATOMICITY + FOUNDATION-003 DISPATCH-UNCERTAINTY REUSE + CANCELLATION/RECOVERY/RETRY OWNERSHIP -> FREEZE FORMAL SPECIFICATION + ADVERSARIAL TEST DENOMINATOR -> ONLY THEN AUTHORIZE BUILD`

Hard fence: no worker spawning, scheduler selection, provider execution or production activation may be implemented from this recovery inventory alone.
