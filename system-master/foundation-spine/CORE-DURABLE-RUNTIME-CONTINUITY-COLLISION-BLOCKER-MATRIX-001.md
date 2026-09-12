# CORE Durable Runtime / Continuity Collision + Blocker Matrix 001

**Date:** 2026-09-12  
**Lane:** Foundation / Spine — Durable Runtime / Continuity  
**Active branch reread before mutation:** `second-shift/core-durable-runtime-continuity-recovery-001-20260912@559dc2c982e1ac7fb96ef5064912014efcda79d0`  
**Live Foundation owner reread before mutation:** `system-master/control-v2@54de1268b1036f966dd9235f5463e430ab1fcd19`  
**Parent operation:** `CORE-DURABLE-RUNTIME-CONTINUITY-FOREIGN-CONTRACT-BIND-001`  
**Standing:** `COLLISION_MATRIX_FROZEN__ZERO_ADMITTED_SEMANTIC_OWNER_COLLISIONS__PROVIDER_BLOCKERS_EXPLICIT__RUNTIME_ADAPTER_BUILD_NOT_AUTHORIZED`

## 1. Purpose

Consolidate the recovered Durable Runtime / Continuity branch into one authoritative boundary view before any changed adapter or runtime implementation is authorized.

This matrix reconciles the current backend rebind, Identity/Contracts/Keel bindings, Work/Project recovery result, Resource/Placement/Fence rebind, Transport recovery, Effect rebind, Evidence rebind, Security rebind, and the authority correction in `CORE-DURABLE-RUNTIME-CONTINUITY-AUTHORITY-RECONCILIATION-002.md`.

The controlling rule remains one truth owner per concept. Durable Runtime may consume foreign references and receipts, but it may not become a shadow Work controller, Orchestrator, Resource authority, Router, Placement authority, Transport service, Effect authority, Evidence authority, Security authority, or specialist system.

## 2. Consolidated boundary matrix

| Boundary | Semantic owner | Current provider standing on this exact reconstruction | Runtime consumes / owns | Freshness / UNKNOWN rule | Runtime must not infer or own | Current blocker | Collision result |
|---|---|---|---|---|---|---|---|
| System Root / Authority Registry | System Root / Authority Registry | Current hosted-qualified owner identity available on live Foundation owner | canonical owner/system identity and version-pointer checks | current owner/version must be re-read when authority identity matters; unresolved owner identity fails closed | runtime state, Work truth, or business completion from registry identity | no provider blocker for bounded hosted use; affected adapter regression still required | **0** |
| Identity / Principal / Delegation | Identity / Principal / Delegation | Current hosted-qualified frozen boundary: `DELEGATION-FREEZE-001.md` + traceability | `CapabilityUseRequest`, `CapabilityValidationReceipt`, `DelegationCeilingReceipt`, opaque grant/principal refs | stale, revoked, expired, generation-advanced, subject-mismatched or UNKNOWN standing fails closed; revalidate at authority-sensitive use | effect permission, resource grant, route, placement, runtime fence, human truth | `BLOCKED_CURRENT_DURABLE_ADAPTER_NOT_BOUND`; full continuity qualification not run | **0** |
| Contracts / Versioning | Contracts & Versioning | Current hosted-qualified frozen boundary: `CONTRACTS-VERSIONING-FREEZE-001.md` + traceability | `GateReceipt`, `CompatibilityDecisionReceiptV1`, `MigrationEdgeV1`, `MigrationCheckpointV1`, exact subject/version/digest refs | UNKNOWN/incompatible/validator failure fails closed; version arithmetic is not compatibility proof | identity, effect, resource, placement or runtime authority from structural compatibility | continuity adapter not bound; full changed-subject qualification not run | **0** |
| Intent / Keel | Intent / Keel | **Current hosted-qualified reference authority**: `KEEL-FREEZE-001.md` + traceability; stale design-only classification retired by reconciliation 002 | `GovernedGoalRefV1`, `KeelValidationReceiptV1`, non-expanding intent ceilings | exact goal revision/digest must be current for the lineage; ceiling uncertainty cannot widen authority | Work lifecycle, executable plan, resource grant, placement, fence, effect permission, human response, completion | exact Goal -> Work lineage attachment blocked by Work/Project authority | **0** |
| Work / Project Control | Work & Project Control | Current semantic authority **not recovered losslessly**; live owner explicitly preserves source-authority blocker | no new canonical Work/Project contract may be invented; historical refs remain donor provenance/opaque archaeology only | missing or ambiguous current Work/Project authority remains UNKNOWN and blocks dependent lineage claims | `WorkId`, `ProjectId`, lifecycle, progress/completion, Goal -> Work binding | `BLOCKED_RECOVERY_SOURCE_AUTHORITY` | **0 if blocked; collision would exist if Runtime synthesized this truth** |
| Planning / Orchestration | Planning & Orchestration | No freshly frozen current Plan/Step owner contract; historical substrate remains donor mechanics | no canonical Plan/Step/readiness/cancel/replan contract may be minted by Runtime | missing current orchestration standing fails closed | plan identity, step readiness, dependency truth, desired cancel/replan truth | `BLOCKED_RECOVERY_SOURCE_AUTHORITY` | **0 if blocked** |
| Resource Admission / Budgeting | Resource Admission & Budgeting | Consumer boundary design-locked; exact current provider implementation/schema not frozen | foreign `ResourceGrantRef`-equivalent only; Runtime may store exact ref/digest | deferred, rejected, revoked, expired, stale or UNKNOWN grant cannot authorize start/resume | budgets, capacity, fairness, admission, accounting, reclaim truth | `BLOCKED_RESOURCE_ADMISSION_PROVIDER_NOT_CURRENT` | **0** |
| Capability Routing | Capability Routing | Current exact route provider/interface not frozen | exact route/qualified-provider ref only when owner contract exists | stale/unknown/unqualified route fails closed | capability/provider selection, routing policy, provider qualification | `BLOCKED_ROUTING_INTERFACE_NOT_BOUND` | **0 if blocked** |
| Execution Placement | Execution Placement | Consumer boundary design-locked; exact current provider implementation/schema not frozen | foreign `PlacementAssignmentRef`-equivalent; Runtime validates assignment/executor binding | stale/drained/reassigned/expired/UNKNOWN assignment fails closed | executor scoring, eligibility, assignment, drain/reassignment decisions | `BLOCKED_PLACEMENT_PROVIDER_NOT_CURRENT` | **0** |
| Durable Runtime claim/fence | Durable Execution Runtime | **Current bounded FOUNDATION-003 substrate byte-verified and freshly portable-qualified** | Runtime owns Job/Attempt/recovery/checkpoint/timer/signal/retry/cancel/idempotency facts plus monotonic `RuntimeFence` and `RuntimeClaim` | stale/expired/revoked fence fails closed; fence generation never regresses or reuses after expiry/restart/reassignment | Resource grant, Placement assignment, Work/Plan truth, Effect permission | bounded source-custody blocker **retired**; live PostgreSQL + full continuity adapter qualification + native/A-01/production remain open | **0** |
| Transport / Delivery | Transport & Delivery | Consumer semantics recovered; generic current provider/source custody not recovered | `DeliveryEnvelopeRef`, `DeliveryStandingRef`, `InboxConsumptionRef`, `ReplayCursorRef`-equivalent carriage refs | duplicate/lost/reordered delivery expected within contract; UNKNOWN/gap/corrupt delivery fails closed/reconciles | Job/Attempt/effect/evidence business truth from ACK/wakeup/delivery count | `BLOCKED_TRANSPORT_PROVIDER_SOURCE_CUSTODY`; `BLOCKED_TRANSPORT_REDISCOVERY_CONTRACT_NOT_BOUND` | **0** |
| Effect / Action Authority | Effect / Action Authority | Consumer-side design lock complete; exact current provider implementation not frozen | `EffectIntentRef`, authorization/observation/reconciliation receipt refs; Runtime preserves UNKNOWN/RECONCILING | stale/expired/revoked/UNKNOWN auth cannot commit; timeout/lost ACK never implies NOT_APPLIED; only authoritative reconciliation may permit retry | exact external-effect permission, APPLIED truth, compensation authority, business success | `BLOCKED_EFFECT_AUTHORITY_IMPLEMENTATION_NOT_CURRENT` | **0** |
| Evidence / Provenance / Assurance | Evidence, Provenance & Assurance | Consumer-side design lock complete; exact durable provider interface/integration not freshly frozen/qualified | Runtime-owned durable evidence intent/outbox + foreign evidence/standing/quarantine/qualification refs | missing/stale/corrupt/UNKNOWN required evidence fails closed; material subject change invalidates support | canonical evidence identity, PASS/qualification class, specialist verification, human truth | `BLOCKED_EVIDENCE_ASSURANCE_INTERFACE_NOT_BOUND`; `BLOCKED_EVIDENCE_DURABLE_PROVIDER_NOT_QUALIFIED` | **0** |
| Security / Privacy / Secrets / Cryptography | Security / Privacy / Secrets / Cryptography | Consumer-side design lock complete; exact shared current provider interfaces not freshly frozen | policy/privacy/secret-capability/crypto-verification/restriction refs; opaque secret refs only | DENY/REVOKED/EXPIRED/INVALID/UNKNOWN at required gate fails closed; revalidate on material policy/principal/secret/provider change | secret values, principal truth, effect permission, policy truth | `BLOCKED_SECURITY_PROVIDER_INTERFACE_NOT_BOUND`; real secret-provider production standing unclaimed | **0** |

## 3. Reconciled collision decisions

### Resource vs Placement vs Runtime fence

No collision is admitted:

- Resource owns capacity/admission/grant/accounting truth.
- Placement owns executor eligibility/assignment/drain/reassignment truth.
- Durable Runtime owns the monotonic execution claim/fence that prevents stale mutation of Runtime-governed Attempt state.

A Resource grant is not a Placement assignment. A Placement assignment is not a Runtime fence. Runtime fence expiry never resets historical fence generation.

### Identity vs Security vs Effect

No collision is admitted:

- Identity proves principal/delegated-capability standing.
- Security proves shared policy/privacy/secret/crypto standing where required.
- Effect Authority proves exact commit-time permission and external-effect reconciliation standing.

No single receipt is promoted into all three authorities.

### Runtime outbox vs Transport vs Evidence

No collision is admitted:

- Runtime owns durable semantic state and durable evidence/delivery intent where coupled to its transaction.
- Transport owns carriage, dedupe, replay, acknowledgement and delivery standing.
- Evidence owns canonical evidence objects, evidence standing, assurance classification and quarantine.

A Transport ACK is not Evidence acceptance and is never Work/Job/effect completion truth.

### Keel vs Work / Plan / Execution

No collision is admitted:

- Keel owns governed intent and non-expanding ceilings.
- Work/Project owns durable work/project lifecycle and Goal -> Work binding once its current authority is recovered.
- Orchestration owns executable plan/step readiness once its current authority is recovered.
- Runtime owns execution continuity only.

Keel validation never creates a Work item, Plan step, Resource grant, Placement assignment, Runtime fence or Effect authorization.

## 4. Stale or narrowed blocker reconciliation

The following older blocker statements are no longer carried forward unchanged:

1. **Keel executable/current provider missing** — **RETIRED for the hosted-portable Foundation reference boundary**. Keel is current hosted-qualified on the exact branch lineage. A-01/native/production/external/human/specialist evidence remains unclaimed.
2. **Current Durable Runtime backend source custody missing** — **RETIRED for the exact bounded FOUNDATION-003 substrate** recovered and byte-verified on this branch. Latest-original-source, live PostgreSQL, native/A-01/production standing remain separate.
3. **Current persistence interface absent** — narrowed to `CURRENT_F003_PERSISTENCE_PRESENT__CONTINUITY_ADAPTER_NOT_BOUND` for rows served by the recovered F003 backend.
4. **Fresh qualification not run** — narrowed for the F003 base: fresh portable F003 parity, strict Java compilation, 24,253 authority assertions and 95 JDBC-contract assertions passed. The **full changed continuity/adapters denominator remains unexecuted**.

No Work/Project, Orchestration, Resource, Routing, Placement, Transport, Effect, Evidence, or Security provider blocker is retired by this matrix.

## 5. Provider-readiness classification

### Concrete enough for bounded hosted adapter consumption

- System Root / Authority Registry;
- Identity / Principal / Delegation;
- Contracts / Versioning;
- Intent / Keel;
- Durable Runtime owner-local FOUNDATION-003 substrate.

These are not equivalent evidence classes: each remains bounded by its exact freeze/qualification environment.

### Explicitly blocked provider boundary

- Work / Project Control;
- Planning / Orchestration;
- Resource Admission / Budgeting;
- Capability Routing;
- Execution Placement;
- Transport / Delivery;
- Effect / Action Authority;
- Evidence / Provenance / Assurance;
- Security / Privacy / Secrets / Cryptography.

The blocker is not permission for Runtime to implement those owners privately.

## 6. Qualification obligations preserved

The additive continuity obligations remain non-shrinkable and may overlap behaviorally:

- 42 recovered G-WP-008..015 continuity requirements;
- 80 owner-local continuity persistence cases;
- 48 Effect-seam cases;
- 40 Evidence-seam cases;
- 36 Transport consumer-seam cases;
- 40 Security-seam cases;
- 52 Resource / Placement / Runtime-fence cases;
- current System Root, Identity, Contracts and Keel regression obligations;
- any Work/Project, Orchestration, Routing or provider-adapter cases introduced when those exact contracts become concrete.

These numbers **must not be added and reported as independent PASS counts** because cases can overlap. The next denominator artifact must preserve every obligation and cross-reference overlap explicitly.

## 7. Build decision

**Changed Durable Runtime / Continuity adapter implementation remains NOT AUTHORIZED.**

Reason: owner-local Runtime substrate is sufficiently strong, but nine foreign provider boundaries are still source/contract/integration blocked. Building adapters now would require guessing at current schemas, receipts, identities or authority semantics and would create shadow ownership.

The correct state is therefore:

`RUNTIME_SUBSTRATE_READY_FOR_BOUNDED_REUSE__FOREIGN_PROVIDER_CONTRACTS_PARTIALLY_READY__CHANGED_ADAPTER_BUILD_BLOCKED`

## 8. Exact next operation

Advance the parent operation to:

**`CORE-DURABLE-RUNTIME-CONTINUITY-QUALIFICATION-DENOMINATOR-FREEZE-001`**

Freeze one non-shrinkable, overlap-aware qualification denominator for the future changed continuity subject using the exact collision/blocker matrix above. The denominator must:

1. preserve every already-frozen obligation without summing overlapping cases as independent proof;
2. classify each case as executable now, provider-blocked, live-PostgreSQL-blocked, native/A-01/production-blocked, human/external-provider-blocked, or specialist-external;
3. bind each case to the current owner and exact evidence class;
4. keep Work/Project and Orchestration source-authority blockers explicit rather than inventing test doubles as authority;
5. preserve the current F003 portable PASS as base regression evidence only, not changed-adapter PASS;
6. identify the smallest next executable adapter slice that depends only on already-concrete providers and does not prejudge blocked provider schemas;
7. keep changed runtime/adapter build unauthorized unless that slice has a complete current contract set and an exact frozen denominator.

If no adapter slice can be executed without a blocked provider contract, the denominator freeze must say so and bind the next dependency-valid recovery operation rather than fabricate an implementation.

## 9. Evidence fence

This matrix claims owner-boundary reconciliation and blocker classification only. It claims no new adapter implementation, no full continuity PASS, no live PostgreSQL result, no A-01/native/device/production standing, no real external-provider/credential standing, no human truth, and no Book/Learning/Documents/Programming specialist correctness.
