# CORE Durable Runtime Continuity Contract Rebind 001

Status: RECOVER / INVENTORY / ANALYZE / ADJUDICATE COMPLETE FOR PRESENT LIVE CONTRACTS; DESIGN LOCK BLOCKED ON UNBOUND PEER SEAMS  
Predecessor: `CORE-DURABLE-RUNTIME-CONTINUITY-RECOVERY-INVENTORY-001-R2.md`  
Runtime build: NOT AUTHORIZED BY THIS UNIT  
Fresh runtime qualification: NOT EXECUTED

## 1. Exact subjects and reread discipline

Live Foundation owner was reread immediately before this mutation and remained:

`system-master/control-v2@54de1268b1036f966dd9235f5463e430ab1fcd19`

The isolated continuity branch was reread immediately before this mutation at:

`second-shift/core-durable-runtime-continuity-recovery-001-20260912@6ebdd8cba70004feaa566344c6cd298e0d2f3a6f`

This artifact does not mutate `system-master/control-v2`. It binds only contracts actually evidenced on the live owner and fails closed where the required current seam is not yet frozen.

## 2. Constitutional rule

The controlling `SYSTEM-SPECIFICATION.md` requires one truth owner per concept, prohibits recovery from becoming a shadow job engine/database/router, preserves UNKNOWN as a real state, separates routing from placement, separates admission from routing, and requires evidence class to remain explicit.

The continuity contract therefore cannot be designed by copying the historical 021G public surface wholesale. Historical interfaces are donor mechanics until rebound to current owners.

## 3. Status bridge reconciliation

`IMPLEMENTATION-STATUS.md` is explicitly a mutable status bridge, not architecture authority. Its Keel row still says `HISTORICAL SUBSTRATE — REBIND / DESIGN LOCKED`, but the live owner now also contains `keel/KEEL-FREEZE-001.md` and `keel/KEEL-BUILD-TRACEABILITY.json`, which freeze a hosted-qualified Keel reference boundary with 32/32 bounded invariants and exact downstream references.

For this unit, later exact component freeze/traceability evidence outranks the older status-row wording without changing the constitutional architecture. No claim is made that native/A-01/production Keel standing exists.

## 4. Exact currently bindable seams

### 4.1 System Root & Authority Registry — BINDABLE OWNER IDENTITY

Current standing: `CURRENT — HOSTED QUALIFIED` in the live implementation status.

Continuity use is limited to canonical owner/system identity and version-pointer checks. System Root is not runtime state and cannot become a recovery database.

Binding result: **BOUND AS OWNER-IDENTITY DEPENDENCY**.

Remaining evidence fence: current continuity runtime adapter is not yet implemented/qualified against the live Root API.

### 4.2 Identity / Principal / Delegation — BINDABLE AUTHORITY-USE RECEIPT

Current exact authority evidence:

- `identity/DELEGATION-FREEZE-001.md`
- `identity/DELEGATION-BUILD-TRACEABILITY.json`

Current contracts usable by continuity:

- `CapabilityUseRequest`
- `CapabilityValidationReceipt`
- `DelegationCeilingReceipt`
- immutable capability grant identity/digest + separate mutable standing
- authority-generation invalidation

Required recovery rule: before authority-sensitive resume, reassignment or consequential effect continuation, continuity must re-read current principal/grant/standing/generation state through Identity. A historical attempt, cached validation or old planning receipt is insufficient. The returned Identity receipt cannot grant Effect Authority permission, Placement authority or Runtime lease/fence truth.

Binding result: **BOUND CONTRACT / ADAPTER NOT BUILT**.

Blockers: `BLOCKED_CURRENT_DURABLE_ADAPTER_NOT_BOUND`, `BLOCKED_FRESH_QUALIFICATION_NOT_RUN`; real credential/provider/native/production standing remains external.

### 4.3 Contracts & Versioning — BINDABLE STRUCTURAL COMPATIBILITY GATE

Current exact authority evidence:

- `contracts/CONTRACTS-VERSIONING-FREEZE-001.md`
- `contracts/CONTRACTS-BUILD-TRACEABILITY.json`

Current contracts usable by continuity:

- `GateReceipt`
- `CompatibilityDecisionReceiptV1`
- `MigrationEdgeV1`
- `MigrationCheckpointV1`
- lifecycle standing `ACTIVE | DEPRECATED | SUNSET`
- exact contract subject/version/digest/canonicalizer identity

Required recovery rule: checkpoint/journal/history replay or migration may proceed only under exact current structural/version compatibility evidence. Version arithmetic is never compatibility proof. A Contracts receipt is structural/version evidence only and cannot grant Identity, Resource, Placement, Runtime or Effect authority.

Binding result: **BOUND CONTRACT / ADAPTER NOT BUILT**.

Blockers: `BLOCKED_CURRENT_DURABLE_ADAPTER_NOT_BOUND`, `BLOCKED_CURRENT_PERSISTENCE_INTERFACE_NOT_BOUND`, `BLOCKED_FRESH_QUALIFICATION_NOT_RUN`; real format-validator/native/production evidence remains separate.

### 4.4 Intent / Keel — BINDABLE GOVERNED-INTENT REFERENCE

Current exact authority evidence:

- `keel/KEEL-FREEZE-001.md`
- `keel/KEEL-BUILD-TRACEABILITY.json`

Current contracts usable by continuity:

- `GovernedGoalRefV1`
- `KeelValidationReceiptV1`
- exact immutable goal revision + content digest
- delegation/resource/action/human-control ceilings as intent constraints only

Required recovery rule: a recovery episode carries the exact governed-goal reference applicable to its Work lineage and may not widen Keel ceilings. Keel never substitutes for concrete Identity grants, Resource grants, runtime fences, effect permission or human approval evidence.

Binding result: **BOUND CONTRACT / WORK-LINEAGE ATTACHMENT BLOCKED**.

Blocker: Work/Project authority required to prove the exact Goal -> Work binding is not yet recovered as a current authority.

## 5. Required seams that are not yet current-contract bindable

| Required seam | Live standing | What can be consumed now | What continuity must not invent | Rebind result / blocker |
|---|---|---|---|---|
| Work & Project Control | `CURRENT — PARTIAL`; exact semantic authority not recovered losslessly | constitutional owner boundary + current archaeology only | `WorkId`, `ProjectId`, lifecycle, Goal->Work binding, completion/progress truth | **UNBOUND** — `BLOCKED_RECOVERY_SOURCE_AUTHORITY` |
| Planning & Orchestration | `HISTORICAL SUBSTRATE — REBIND`; no fresh Plan/Step owner contract frozen | constitutional boundary + donor mechanics | Plan/Step identity, readiness, desired cancellation/replan truth | **UNBOUND** — `BLOCKED_RECOVERY_SOURCE_AUTHORITY` |
| Resource Admission & Budgeting | `CURRENT/HISTORICAL — PARTIAL` | rule that Resource owns grants/accounting and 021G adapter must only request/reacquire | resource grants, budgets, fairness, admission or fence authority | **UNBOUND** — `BLOCKED_RESOURCE_ADMISSION_INTERFACE_NOT_BOUND` |
| Capability Routing | `HISTORICAL SUBSTRATE — REBIND` | route-owner boundary only | route decision/snapshot or provider qualification | **UNBOUND** — `BLOCKED_ROUTING_PLACEMENT_INTERFACE_NOT_BOUND` |
| Execution Placement | `CURRENT — PARTIAL` | assignment/fence owner boundary + current lease/fence donor mechanics | executor eligibility/score/assignment/drain/reassignment truth | **UNBOUND** — `BLOCKED_ROUTING_PLACEMENT_INTERFACE_NOT_BOUND` |
| Transport & Delivery | `HISTORICAL SUBSTRATE — REBIND` | duplicate delivery expected; carriage is not business truth | current inbox/outbox/replay/ack contract identity | **UNBOUND** — `BLOCKED_TRANSPORT_REDISCOVERY_CONTRACT_NOT_BOUND` |
| Effect / Action Authority | `CURRENT/HISTORICAL — PARTIAL` | constitutional commit-time authority and UNKNOWN/RECONCILING rule | effect permission, commit receipt schema, compensation authority | **UNBOUND** — `BLOCKED_EFFECT_AUTHORITY_RECONCILIATION_CONTRACT_NOT_BOUND` |
| Evidence / Provenance / Assurance | `CURRENT — SUBSTANTIAL` but whole-chain current seam not frozen here | evidence-class separation and current provenance rules | a new competing evidence truth store or PASS classification | **PARTIAL** — `BLOCKED_EVIDENCE_ASSURANCE_INTERFACE_NOT_BOUND` |
| Security / Privacy / Secrets / Crypto | `HISTORICAL SUBSTRATE — REBIND` | secret references only, fail-closed policy dependency | secret values, policy standing or cryptographic authority | **UNBOUND** — `BLOCKED_SECURITY_POLICY_BINDING_NOT_BOUND` |

The absence of a fresh peer contract is a blocker, not permission to promote a historical 021G class into a new authority.

## 6. Current continuity-owned contract denominator that is safe to design later

Once the blocked peer seams above are recovered, the continuity-owned surface may be designed around the following bounded concepts without semantic takeover:

1. durable `RecoveryEpisode` identity keyed by canonical Work -> Durable Job -> Attempt lineage and current runtime fence;
2. checkpoint/journal/history references carrying exact Contracts subject/version/digest decisions;
3. restart rediscovery and reconciliation cursors;
4. runtime-local retry/timer/signal/cancellation mechanics, with Transport carriage and external authorization kept separate;
5. external-effect reconciliation references carrying explicit `UNKNOWN/RECONCILING` without effect permission;
6. non-authorizing refs to current Identity validation, Keel goal revision, Resource grant, Route, Placement and Evidence records;
7. durable continuity evidence emission into the shared evidence authority;
8. idempotent legacy migration/crosswalk receipts that never create a duplicate truth store.

These are **design inputs**, not frozen new contract names. The predecessor inventory's provisional names are not promoted to canonical API merely by appearing in archaeology documentation.

## 7. Persistence design cannot yet freeze

The historical donor contains strong checkpoint/journal/history/runtime mechanics, but the current exact persistence binding is still absent. A fresh continuity state schema cannot yet claim a canonical key for Work/Project or exact foreign-reference types for Resource/Route/Placement/Transport/Effect because those current contracts are unresolved.

Therefore this unit stops before DESIGN-LOCK and BUILD rather than inventing those schemas.

This is a material blocker, but not a full-lane blocker: persistence archaeology can proceed independently without deciding foreign semantic ownership.

## 8. Qualification denominator implications

Future continuity qualification must include, at minimum:

- all 42 recovered G-WP-008..015 requirement rows from the predecessor inventory;
- current System Root regression;
- current Identity Delegation regression and stale/revoked/generation-advanced authority cases;
- current Contracts regression and unknown/incompatible/migration cases;
- current Keel regression and non-expansion cases;
- each newly frozen Work/Project, Orchestrator, Resource, Route, Placement, Transport, Effect and Evidence seam affected by the implementation;
- restart/process-kill/corruption/idempotency/adversarial cases appropriate to the changed persistence subject;
- separate evidence labels for hosted/portable versus native/A-01/production/human/external environments.

No denominator count is frozen yet because the unresolved peer contracts can materially add required cases. Freezing a numeric denominator now would be false precision.

## 9. Dependency-valid successor

**`CORE-DURABLE-RUNTIME-CONTINUITY-PERSISTENCE-RECOVERY-001`**

Recover and inventory the strongest current/historical durable runtime persistence substrate for Job/Attempt/fence/checkpoint/journal/timer/signal/retry/cancel/handoff/recovery state. Map every recovered persistence object and writer/read path to the 42-row census; classify each as `REUSE / ADAPT / CONSOLIDATE / QUALIFIER_ONLY / PROVENANCE_ONLY / GAP`; identify transaction/atomicity/OCC/idempotency/crash-replay guarantees and exact environment evidence; and explicitly mark foreign owner fields as opaque/unbound rather than inventing Work/Resource/Route/Placement/Transport/Effect contracts.

This successor is RECOVER/INVENTORY/ANALYZE/ADJUDICATE only until the blocked peer contracts are current and collision-free.

## 10. Evidence fence

This unit claims only current-contract recovery/rebind analysis. It claims no new runtime implementation, no fresh runtime qualification, no A-01/native/production standing, no real external-provider/credential standing, no human evidence, and no Book/Learning/Documents/Programming semantic correctness.