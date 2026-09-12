# CONTROLLER V2 — EXECUTION-001C WORKER SELECTION + DISPATCH RECONCILER RECOVERY INVENTORY 001

Status: **RECOVERED / INVENTORIED / FIRST ANALYSIS PASS COMPLETE / NO 001C BUILD AUTHORIZED**

Working lineage before this unit: `controller-v2/execution-001b-forensic-restart@2055f14f20b4b34ae0c8122e6a38d06b795fd6c8`
Frozen predecessor execution units:
- EXECUTION-001A durable work graph + dependency eligibility
- EXECUTION-001B worker evidence binding + immutable execution contract + fenced dispatch intent + Foundation-003 effect reuse
Production Controller activation: **`BLOCKED_EXTERNAL_SETUP`**
Historical PASS transfer: **0**

## 1. Scope

This unit begins the next dependency-valid boundary after EXECUTION-001B. It does not implement a scheduler timer, worker spawning, provider calls, a new queue authority, retry engine, priority policy, placement policy or specialist semantics.

The bounded question is:

> Given frozen dependency eligibility, worker bindings, execution contracts, durable claims/fencing, dispatch intents and external-effect uncertainty, what remains for one idempotent Controller-owned reconciliation loop to select a worker and converge an eligible operation toward a safely authorized dispatch without creating a second authority?

No CORE, LEARNING, BOOK or DOCUMENTS owner control or specialist semantics are in scope.

## 2. Current frozen substrate to reuse

### 2.1 Eligibility is already authoritative

EXECUTION-001A owns durable same-transaction dependency edges, success-only dependency semantics, cycle prevention, deterministic eligibility and guarded `PLANNED -> READY` transition.

Consequences for 001C:
- a queue/wakeup cannot make work eligible;
- 001C may consider only current durable `READY` work;
- priority/fairness, if later admitted, may order eligible work only;
- eligibility loss/duplication/reordering of wakeups is repaired by rereading durable state.

Disposition: **REUSE / DO NOT REIMPLEMENT**.

### 2.2 Worker identity/capability binding is already authoritative inside Controller only as verified evidence references

EXECUTION-001B owns immutable content-addressed worker bindings, revocations, current-standing classification, canonical capability sets and exact verifier-policy/evidence references.

Consequences for 001C:
- current binding standing must be reread before selection and again at dispatch authority boundaries;
- heartbeat/socket/chat/webhook presence is not worker authority;
- 001C cannot invent identity, delegation or capability truth;
- real identity/delegation/capability evidence remains external setup.

Disposition: **REUSE / EXTERNAL EVIDENCE BLOCKER PRESERVED**.

### 2.3 Execution contract is already authoritative

EXECUTION-001B owns one immutable execution contract per operation, exact-bound to transaction, operation, repository subject, resource, executor kind, protocol, payload reference/digest and required capabilities.

Consequences for 001C:
- selection must consume this exact contract rather than infer executor/capability requirements from mutable metadata;
- selection may not change the contract to fit a worker;
- specialist payload semantics remain opaque to Controller.

Disposition: **REUSE**.

### 2.4 Claim/fencing is already authoritative

Foundation claim authority owns one active claim per resource, monotonic fencing generation, renewal/revocation/release, start/result fencing and fresh-store recovery that preserves generation floor but resurrects zero live holders.

Consequences for 001C:
- no scheduler lock/claim table may be added;
- any selected worker must still win the existing claim authority;
- a stale candidate selection grants no execution authority;
- after restart, historical dispatch identity cannot resurrect a historical live holder.

Disposition: **REUSE / DO NOT REIMPLEMENT**.

### 2.5 Dispatch identity and ambiguous send are already authoritative

EXECUTION-001B owns content-addressed dispatch intents, exact live lease/fence validation, Stage-A dispatch identity, Stage-B request envelope/digest and exact effect tuple binding. Foundation-003 owns PREPARED -> UNKNOWN -> observed reconciliation semantics and the durable `SEALED` barrier before physical send.

Consequences for 001C:
- 001C must call/reconcile these authorities; it cannot add a second dispatch/effect state machine;
- lost response after claim, intent creation, effect preparation or effect authorization must converge by reread, not blind repetition;
- provider/network return is not durable Controller success.

Disposition: **REUSE / DO NOT REIMPLEMENT**.

## 3. Historical scheduling archaeology retained only as semantics/test input

The earlier EXECUTION-001 forensic inventory recovered CG-008..010 semantics as archaeology only. The surviving useful invariants for 001C are:

- one selected scheduler/reconciler authority; no competing cron/slot-chain authority;
- dependencies and minimum execution preconditions outrank ordering policy;
- priority can order only eligible work;
- concurrent scheduler passes must not double-claim one resource;
- durable truth, not queue position, determines work state;
- cancellation establishes a local durable fence before any external acknowledgement;
- restart rebuilds eligibility/dispatch standing from durable state;
- randomized race/state-machine testing is required.

Historical A-01/control-gateway implementation bytes and PASS remain **PROVENANCE_ONLY / NO PASS TRANSFER**.

## 4. Current source census and absence findings

The current Controller lineage contains reusable modules for:

- `execution-graph-kernel.js` — dependency graph + readiness;
- `durable-claim-authority.js` — lease/fence authority;
- `claim-recovery.js` — historical claim validation/generation-floor recovery;
- `worker-dispatch-kernel.js` — binding/contract/dispatch/effect integration;
- `external-effect-authority.js` — ambiguous effect truth;
- `authority-ports.js` — narrow worker-facing authority;
- durable journal/outbox and core recovery.

No dedicated current Controller scheduler/worker-selection/reconcile module has been admitted as authority in the frozen 001A/001B lineage. No authoritative durable queue, priority table, stage table, capacity score, placement score, worker liveness authority or scheduler lease is currently required or frozen.

That absence is intentional until 001C adjudicates which of those concepts are actually necessary.

## 5. Lossless first-pass requirement / invariant inventory

| ID | Requirement / invariant | Current component | Durable state | Interface / contract | Current tests/evidence | Disposition / blocker |
|---|---|---|---|---|---|---|
| SEL-R01 | only admitted/current READY work can enter selection | EXECUTION-001A + transaction/operation state | transactions, operations, dependencies | classify + guarded READY | GEL + cumulative | **REUSE** |
| SEL-R02 | execution requirements come from immutable contract | EXECUTION-001B | execution_contracts | execution contract read | WDI-021..028 | **REUSE** |
| SEL-R03 | selectable worker must have CURRENT verified binding | EXECUTION-001B | worker_bindings + revocations | current-standing read | WDI-007..020 | **REUSE** |
| SEL-R04 | worker capabilities must satisfy immutable required set | EXECUTION-001B | canonical capability sets/digests | contract/binding comparison | WDI-025,029,037 | **REUSE** |
| SEL-R05 | resource claim/fence remains sole concurrency authority | Foundation claim authority | leases + resource_generations | acquire/renew/revoke/release/fence | FCLAIM/FREC/cumulative | **REUSE** |
| SEL-R06 | selected worker cannot execute before exact durable dispatch identity exists | EXECUTION-001B | dispatch_intents | create dispatch intent | WDI-029..042 | **REUSE** |
| SEL-R07 | physical send cannot occur before UNKNOWN authorization is durably SEALED | Foundation-003 + 001B | external_effects/attempts + journal/outbox | authorize + permit | WDI-043..053 | **REUSE** |
| SEL-R08 | wakeup/heartbeat/socket/chat/webhook is hint only | predecessor architecture + 001B fences | none authoritative | reconcile trigger only | WDI-058/060 + prior tests | **MUST REMAIN INVARIANT** |
| SEL-R09 | candidate enumeration over READY work is deterministic from durable state | no dedicated current 001C component | derivable projection | **MISSING** | none isolated | **GAP** |
| SEL-R10 | candidate worker enumeration uses current bindings and exact contract requirements | no dedicated current 001C component | derivable projection | **MISSING** | pieces covered separately | **GAP** |
| SEL-R11 | ordering/tie-break among multiple eligible operations/workers is deterministic and authority-bounded | no current ordering contract | **NONE** | **MISSING** | historical semantics only | **ADJUDICATE** |
| SEL-R12 | priority, if admitted, can never create eligibility or bypass claim/fence | priority not in current schema | **NONE** | **MISSING** | historical semantics only | **ADJUDICATE / DEFAULT EXCLUDE** |
| SEL-R13 | fairness/starvation policy, if required, is explicit and replay-safe | none | **NONE** | **MISSING** | none | **ADJUDICATE** |
| SEL-R14 | placement/capacity policy cannot mutate immutable resource/execution contract | current contract/resource fields exist | current state only | **MISSING policy interface** | no 001C tests | **ADJUDICATE** |
| SEL-R15 | concurrent reconcilers converge on one claim/dispatch per resource | claim + dispatch uniqueness pieces exist | leases/generation + dispatch_intents | combined reconcile contract **MISSING** | component race tests only | **INTEGRATION GAP** |
| SEL-R16 | claim succeeds but dispatch-intent write/response is lost -> reread/reconcile, no second semantic dispatch | claim + content-addressed intent | leases + dispatch_intents | combined reconcile contract **MISSING** | WDI-041 partial | **INTEGRATION GAP** |
| SEL-R17 | durable intent but no prepared effect -> deterministic preparation only while still valid | 001B | dispatch_intents + effects | prepare effect | WDI-043..045 | **REUSE + RECONCILE GAP** |
| SEL-R18 | PREPARED effect but operation/worker/claim invalidated -> fail closed, no send | 001B/Foundation-003 | operations/bindings/leases/effects | activate | WDI-046..050,054 | **REUSE** |
| SEL-R19 | UNKNOWN effect is observed/reconciled and never blindly resent | Foundation-003/001B | effects/attempts | observe/reconcile | WDI-050..053,057 | **REUSE** |
| SEL-R20 | cancellation/revocation between selection, claim, intent, start and send cannot regain authority | component fences exist | current durable state | combined reconcile contract **MISSING** | WDI + claim tests separately | **INTEGRATION GAP** |
| SEL-R21 | restart/offline pass rediscovers READY/no-claim and all partial dispatch states from durable truth | recovery stack exists | journal + recovered projections | 001C reconcile scan **MISSING** | GEL/WDI/FREC pieces | **GAP** |
| SEL-R22 | fresh-store recovery restores zero historical live claim authority | claim recovery + 001B | generation floor + historical dispatch | recovery | FREC/WDI-056..057 | **REUSE** |
| SEL-R23 | reconciler is idempotent; no read-after-write freshness assumption | predecessor laws + component APIs | existing durable identities | 001C reconcile contract **MISSING** | component idempotency tests | **GAP** |
| SEL-R24 | transient retry classification is bounded/backoff+jitter/idempotent; no stacked retry loops | architecture law | no new retry state | 001C loop policy **MISSING** | no 001C denominator | **GAP** |
| SEL-R25 | one scheduler/reconciler authority is explicit; legacy schedulers cannot concurrently mutate | no current execution authority selection receipt found | **MISSING/EXTERNAL ACTIVATION** | ownership/activation contract **MISSING** | historical CG-010 only | **GAP / ACTIVATION BLOCKER** |
| SEL-R26 | worker port remains narrow and cannot select/claim/authorize itself | authority-ports | none additional | heartbeat/result only | WDI-059 + cumulative | **REUSE** |
| SEL-R27 | Controller does not invent identity/delegation/capability/human approval/provider standing | frozen fences | refs/digests only | external authorities | structural + WDI | **REUSE / BLOCKED_EXTERNAL_SETUP** |
| SEL-R28 | specialist success remains outside selection/reconcile truth | operation/result/completion owners | existing state/evidence | bounded result port | Foundation + cumulative | **REUSE / MUST REMAIN INVARIANT** |

Bounded first-pass inventory: **28/28 rows accounted**.

This is not yet the final 001C requirement denominator. Targeted research/adversarial analysis may add requirements before design lock.

## 6. State-convergence inventory

A single future reconcile pass must be designed around durable state classes rather than imperative workflow steps. At minimum the following classes now exist or can be derived:

1. `PLANNED + ELIGIBLE` — use existing guarded transition to READY; no worker authority yet.
2. `READY + no current claim` — candidate for selection/claim; reread contract, binding and resource truth.
3. `READY + current claim + no dispatch intent` — reconcile the same semantic claim into one deterministic dispatch intent.
4. `READY + current claim + dispatch intent + no effect` — prepare exactly one effect only if current standing still permits it.
5. `READY + prepared effect` — activation may start exact leased operation and record UNKNOWN authorization under current binding/fence.
6. `RUNNING + UNKNOWN effect` — observe/reconcile; no blind resend.
7. `RUNNING + SEALED permit available` — physical transport may consume permit; transport success is not semantic completion.
8. cancelled/revoked/stale/expired variants at any pre-send stage — no new send authority; preserve durable history.
9. recovered historical dispatch with no live claim — history only; a future attempt requires a fresh current claim/generation.

001C must not encode these as a second mutable workflow truth if they can be derived from existing durable component states.

## 7. Adversarial questions requiring targeted research/adjudication before build

- If several READY operations target the same resource, is deterministic stable ordering sufficient for v1, or is explicit priority required?
- If several CURRENT workers satisfy the same contract, what is the minimal deterministic worker-selection rule that avoids inventing a durable scheduling queue?
- Is fairness a v1 correctness requirement or a later optimization? If required, what durable fact can support fairness without making wakeup order authoritative?
- Is worker liveness ever an authorization input, or only an operational signal that may prompt claim revocation/reconciliation? Default fence: liveness is not semantic authority.
- Does capacity/placement belong in Controller v1 or in a later Resource/Placement boundary? Default fence: do not overload worker binding with dynamic capacity truth.
- How should one reconcile `READY + live claim` when the claim belongs to a worker binding that has since expired/revoked? Expected direction: revoke/release/fence locally; do not silently substitute worker under the same dispatch identity.
- How are partial states ordered when cancellation and external UNKNOWN coexist? Expected direction: preserve UNKNOWN reconciliation obligation while fencing all new send authority.
- What exact finite retry classes belong to the outer reconciler, if any, versus SQLite/IPC/provider owners? Stacked retries are prohibited.
- How is one scheduler/reconciler activation authority selected without reusing PID/socket/heartbeat presence as truth?

## 8. First analysis conclusion

The next design seam is **not** a durable priority queue and not worker spawning. The minimum viable 001C boundary is a deterministic, idempotent **selection + convergence reconciler** that consumes existing frozen authorities and adds as little new durable state as possible.

Strong default decisions for targeted adjudication:

- authoritative queue: **reject for v1 unless a requirement proves it necessary; derive candidate projections from durable state**;
- priority: **exclude by default; if later admitted, it orders already-READY candidates only**;
- worker liveness: **operational hint only, never identity/delegation/semantic authority**;
- scheduler wakeup: **hint only**;
- new claim table: **forbidden**;
- new external-effect/retry state machine: **forbidden**;
- mutable chat/webhook/provider metadata as selection authority: **forbidden**;
- selection result before claim: **advisory only; claim/fence remains the authority transition**.

## 9. Gate standing

- RECOVER: **PASS — frozen 001A/001B + Foundation + prior CG scheduling archaeology**
- INVENTORY: **PASS first bounded pass — 28 rows**
- ANALYZE: **PASS first pass**
- TARGETED RESEARCH: **REQUIRED NEXT only for ordering/fairness/liveness/placement/reconciler design questions that can change the contract**
- ADJUDICATE: **PARTIAL**
- DESIGN-LOCK: **NOT AUTHORIZED**
- BUILD: **NOT AUTHORIZED**
- ISOLATED QUALIFICATION: **NOT RUN**
- CUMULATIVE REGRESSION/CALIBRATION: **NOT RUN**
- FREEZE: **NOT AUTHORIZED**
- PRODUCTION/NATIVE/A-01: **NOT CLAIMED**

## 10. Exactly one dependency-valid successor

`CONTROLLER-EXECUTION-001C-WORKER-SELECTION-DISPATCH-RECONCILER-TARGETED-RESEARCH-ADJUDICATION-001 — RESEARCH ONLY DESIGN-CHANGING ORDERING/FAIRNESS/LIVENESS/PLACEMENT/RECONCILIATION QUESTIONS -> FREEZE MINIMAL OWNER/STATE/INTERFACE/RETRY CONTRACT -> DEFINE ADVERSARIAL TEST DENOMINATOR -> ONLY THEN AUTHORIZE BUILD.`

Hard fence: no worker spawning/provider business semantics, no durable queue/priority/fairness state until specifically adjudicated, no new lease/effect/admission authority, no trust in wakeup/heartbeat/chat/webhook metadata, no CORE/LEARNING/BOOK/DOCUMENTS semantics, and no production/native/A-01 claims.
