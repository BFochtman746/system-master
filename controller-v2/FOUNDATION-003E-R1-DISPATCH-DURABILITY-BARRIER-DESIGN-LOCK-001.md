# CONTROLLER-FOUNDATION-003E-R1 — DISPATCH DURABILITY BARRIER DESIGN LOCK 001

Status: **DESIGN-LOCKED NARROW REPAIR — BUILD AUTHORIZED**

Predecessor: `CONTROLLER-FOUNDATION-003F-RESTART-TAXONOMY-CLOSURE-001`.

This repair changes only the boundary between local dispatch authorization and physical provider apply. It does not change the generic effect identity, state machine, one-attempt rule, provider adapter ownership, 002C journal ownership, ingress retry policy, promotion path, or any Topology-005 owner.

## 1. Defect statement

A locally committed `external-effect.dispatch-authorized` event is not yet disaster-recovery authority until its outbox row has been durably published and marked `SEALED` by the existing 002C publication mechanism.

Therefore `authorizeExternalEffectDispatch(...)` must be treated as **local preparation of a dispatch attempt**, not permission to call a provider.

## 2. Locked two-barrier protocol

### Barrier A — local dispatch authorization

`authorizeExternalEffectDispatch(kernel,effectId,leaseId)` continues to atomically:

- validate PREPARED effect;
- validate RUNNING operation and live fenced lease;
- create exactly one immutable dispatch-attempt record;
- move effect to `UNKNOWN`;
- append `external-effect.dispatch-authorized` and its PENDING outbox row.

Its returned descriptor is **not a provider-call permit**.

### Barrier B — durable dispatch permit

A new API `getExternalEffectDispatchPermit(kernel,effectId,leaseId,nowMs)` is the only portable-v1 semantic API that can authorize the caller to invoke the provider adapter.

It must require in one read/adjudication boundary:

1. effect exists and is `UNKNOWN`;
2. exactly one immutable attempt exists for the effect;
3. supplied `leaseId` equals the attempt's authorizing lease id;
4. the live lease still exists, remains `ACTIVE`, belongs to the effect operation, is unexpired, and its generation still equals the current resource generation;
5. the exact semantic event `external-effect.dispatch-authorized` exists for the same effect + attempt identity;
6. the event's outbox row is `SEALED`;
7. event payload attempt/lease/resource/generation exactly equals the immutable attempt row;
8. no terminal effect outcome exists.

If any requirement is not met, no provider-call permit is returned.

The permit is a bounded immutable value containing only:

- `effect_id`
- `attempt_id`
- `lease_id`
- `resource_id`
- `generation`
- `dispatch_event_id`
- `durability_status: SEALED`

It contains no credential and no provider request body.

## 3. Lease expiry/replacement decision

Portable v1 fails closed if the authorizing lease becomes stale before a durable dispatch permit is obtained.

A replacement worker may observe/reconcile the effect but may **not** receive a new physical-dispatch permit for the existing attempt and may not create a second attempt. This can strand an effect in `UNKNOWN` when the provider observation proves absence, but it cannot duplicate an irreversible external mutation.

A later provider-specific safe-redrive extension may relax this only with separately qualified provider idempotency evidence. Generic Foundation-003 does not assume that evidence.

## 4. Disaster-recovery law

After total local-store loss:

- if dispatch authorization was not SEALED, it is absent from authoritative durable history and cannot be reconstructed as dispatch authority;
- if dispatch authorization was SEALED, the effect + attempt reconstruct, but **no live lease reconstructs**, so no provider-call permit is automatically available;
- recovered UNKNOWN/RECONCILING effects remain observation-only until an explicit later policy safely resolves them;
- no disaster-recovery path may infer that a missing local row means an external provider mutation did not happen.

## 5. API and caller contract

Provider-calling code must use this exact order:

1. observe provider state;
2. if ABSENT, call `authorizeExternalEffectDispatch`;
3. publish/seal pending semantic events through existing 002C durability barrier;
4. call `getExternalEffectDispatchPermit` with the same live fenced lease;
5. only after a permit is returned may caller invoke provider `apply` once;
6. observe provider state again before terminal semantic resolution unless provider-specific response evidence is separately qualified as authoritative observation.

A direct call from `authorizeExternalEffectDispatch` result to provider `apply` is forbidden by contract and test denominator.

## 6. Expanded qualification denominator

Keep EE-T001..EE-T032 and add at least:

- **EE-T033** PENDING dispatch event cannot yield provider-call permit;
- **EE-T034** exact SEALED dispatch event + same current live fenced lease yields permit with exact event/attempt/fence identity;
- **EE-T035** released/expired/replaced/stale authorizing lease cannot yield permit even when event is SEALED;
- **EE-T036** durable rebuild of SEALED UNKNOWN effect restores attempt but no live lease; permit is impossible and restart report requires observation.

Cumulative Controller qualification remains mandatory on supported Node 22 and Node 24 hosted runtimes.

## 7. Non-claims

This repair still does not prove real provider mutation, real provider idempotency, A-01/native durability, production credentials/rulesets/principal installation, or production Controller activation.

## 8. Build successor

`CONTROLLER-FOUNDATION-003E-R1-DISPATCH-DURABILITY-BARRIER-BUILD-001` — implement the permit barrier and EE-T033..EE-T036, rerun complete cumulative qualification, preserve an exact-subject receipt, then resume 003F restart closure.
