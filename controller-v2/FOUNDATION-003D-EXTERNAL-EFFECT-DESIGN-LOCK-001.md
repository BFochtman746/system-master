# CONTROLLER-FOUNDATION-003D — EXTERNAL EFFECT AUTHORITY DESIGN LOCK

Status: **DESIGN-LOCK COMPLETE FOR PORTABLE V1 — BUILD AUTHORIZED ONLY ON CURRENT C1 -> 002D -> 003A LINEAGE**

Predecessor: `CONTROLLER-FOUNDATION-003C-EXTERNAL-EFFECT-OWNERSHIP-AND-CONTRACT-CENSUS-001`.

This design lock is intentionally narrower than historical Foundation-003. It adds one missing provider-neutral semantic authority and does not transplant the old Python recovery subsystem, retry engine, projection table, or promotion implementation.

## 1. Locked ownership

`ExternalEffectAuthority` owns durable Controller truth for **generic non-promotion external mutations** initiated by a Controller operation.

Excluded from this v1 boundary:

- 002D command ingress;
- 002C durable-journal publication and checkpoint anchoring;
- existing promotion state/adapter semantics;
- provider credentials and provider-specific authorization;
- network clients;
- scheduler/worker selection;
- domain semantics owned by CORE/LEARNING/BOOK/DOCUMENTS/Programming.

No migration of existing promotion rows into the generic effect authority is authorized in this unit.

## 2. Dispatch representation decision

**There is no durable `DISPATCHING` state.**

Instead, granting permission to cross the external send boundary is itself a durable semantic transition:

`PREPARED -> UNKNOWN`

in the same SQLite transaction that appends an immutable dispatch-attempt record and semantic event.

Rationale: after the caller receives dispatch permission, a crash can occur at any instruction between local return, network send, provider commit, and acknowledgement. Therefore the only safe post-authorization assumption is that the outcome may be unknown. On restart the Controller must observe before reapply.

A crash after dispatch authorization but before the network request may conservatively cause an observation cycle, but it cannot cause a duplicate external mutation. Safety is preferred over guessing that no send occurred.

## 3. Durable schema v4

The bounded implementation may append schema version 4 with exactly these new semantic tables.

### `external_effects`

Required columns:

- `effect_id TEXT PRIMARY KEY`
- `transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id)`
- `operation_id TEXT NOT NULL REFERENCES operations(operation_id)`
- `provider TEXT NOT NULL`
- `effect_type TEXT NOT NULL`
- `target_key TEXT NOT NULL`
- `idempotency_key TEXT NOT NULL`
- `request_digest TEXT NOT NULL`
- `expected_remote_version TEXT`
- `state TEXT NOT NULL CHECK(state IN ('PREPARED','UNKNOWN','RECONCILING','SUCCEEDED','FAILED','CANCELLED'))`
- `terminal_evidence_json TEXT`
- `last_error_code TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Uniqueness:

- `UNIQUE(provider,idempotency_key)`.

The semantic fingerprint for idempotent reuse is the tuple:

`transaction_id, operation_id, provider, effect_type, target_key, request_digest, expected_remote_version`.

Same provider/key + same tuple returns the existing effect. Same provider/key + any changed member raises `IDEMPOTENCY_CONFLICT`.

### `external_effect_attempts`

Append-only authorization evidence:

- `attempt_id TEXT PRIMARY KEY`
- `effect_id TEXT NOT NULL REFERENCES external_effects(effect_id)`
- `attempt_number INTEGER NOT NULL CHECK(attempt_number > 0)`
- `lease_id TEXT NOT NULL REFERENCES leases(lease_id)`
- `resource_id TEXT NOT NULL`
- `generation INTEGER NOT NULL CHECK(generation > 0)`
- `authorized_at TEXT NOT NULL`
- `UNIQUE(effect_id,attempt_number)`.

No attempt row is updated after insertion.

## 4. Fencing and concurrency law

A dispatch attempt may be authorized only when all are true in the same transaction:

1. effect state is `PREPARED`;
2. referenced operation is `RUNNING` or `VERIFYING` only if current operation law permits effect dispatch at that phase; portable v1 locks this to `RUNNING`;
3. supplied lease is `ACTIVE` and belongs to the effect operation;
4. lease has not expired;
5. lease generation equals the current `resource_generations` value for the same resource;
6. there is no prior attempt for the effect.

Portable v1 permits **one physical dispatch attempt per semantic effect**. If that attempt becomes uncertain, the same effect must reconcile; it may not issue a second physical mutation. Retryable provider operations that require another physical call are deferred to a later extension that can prove provider-specific safe-retry identity. This intentionally prevents a generic retry engine from duplicating side effects.

## 5. Event contract

Authoritative transitions use existing `controller.event.v1` streams with stream id `external-effect:<effect_id>`.

Required event types:

- `external-effect.prepared`
- `external-effect.dispatch-authorized`
- `external-effect.reconciliation-started`
- `external-effect.succeeded`
- `external-effect.failed`
- `external-effect.cancelled`

Event payload requirements:

### prepared

Includes complete rebuild material: effect id, transaction id, operation id, provider, effect type, target key, idempotency key, request digest, expected remote version, state.

### dispatch-authorized

Includes attempt id, effect id, attempt number, lease id, resource id, generation, and state `UNKNOWN`.

### reconciliation-started

Includes effect id and state `RECONCILING`.

### terminal events

Include effect id, state, immutable structured evidence, and optional classified error code.

No raw secret, credential, full request payload, access token, or provider response body is stored in the semantic event. Only bounded canonical evidence references/digests and required nonsecret identifiers are permitted.

## 6. API contract

Portable semantic API:

- `prepareExternalEffect(kernel, spec)`
- `getExternalEffect(kernel, effectId)`
- `authorizeExternalEffectDispatch(kernel, effectId, leaseId)`
- `beginExternalEffectReconciliation(kernel, effectId)`
- `resolveExternalEffect(kernel, effectId, outcome)`
- `cancelExternalEffect(kernel, effectId, reason)`

No API in this module performs network I/O, sleeps, retries, fetches credentials, or calls a provider SDK.

### `prepareExternalEffect`

- validates bounded nonempty provider/effect/target/idempotency fields;
- canonicalizes and hashes `request` but does not persist the raw request;
- requires existing transaction + operation relationship;
- returns `{effect_id, duplicate, request_digest}`.

### `authorizeExternalEffectDispatch`

- enforces fencing law;
- writes immutable attempt row;
- moves effect to `UNKNOWN`;
- appends `dispatch-authorized` event;
- returns the immutable attempt descriptor.

The caller may make the physical provider call only after this function commits successfully.

### `beginExternalEffectReconciliation`

- only `UNKNOWN -> RECONCILING`;
- idempotent if already `RECONCILING`.

### `resolveExternalEffect`

Allowed only from `RECONCILING`:

- `SUCCEEDED` requires evidence with bounded `kind`, `reference` and optional `digest`/`observed_version`;
- `FAILED` requires evidence plus a classified permanent error code;
- `UNKNOWN` returns the effect to `UNKNOWN` with bounded uncertainty evidence, not terminal completion.

There is no `RECONCILING -> PREPARED` transition in portable v1 because v1 allows no second physical dispatch.

### `cancelExternalEffect`

Allowed only from `PREPARED`; cancellation after dispatch authorization is illegal because physical reality may already diverge.

## 7. Reconciliation adapter port

Provider adapters are outside semantic authority and implement two capabilities:

- `observe(effectDescriptor) -> SATISFIED | ABSENT | CONFLICT | UNKNOWN` with bounded evidence;
- `apply(effectDescriptor, attemptDescriptor) -> provider transport result`.

Controller law for v1:

1. prepare effect;
2. **observe before apply**;
3. if SATISFIED, begin reconciliation and resolve success without dispatch;
4. if CONFLICT, begin reconciliation and resolve failure with evidence;
5. if UNKNOWN, defer; do not send;
6. if ABSENT, authorize dispatch using current lease/fence;
7. caller performs at most one `apply`;
8. regardless of transport response class, observe again before terminal resolution unless the provider-specific contract has independently qualified that the returned response is authoritative observation evidence;
9. if post-apply observation is UNKNOWN, effect remains UNKNOWN/RECONCILING and no generic redispatch occurs.

This preserves wakeups as hints and makes desired/current-state convergence the correctness mechanism.

## 8. Recovery/rebuild contract

`reduceSemanticEvents` must add `external_effects` and `external_effect_attempts` collections and reject:

- transition event before `prepared`;
- duplicate/mismatched immutable fields;
- dispatch attempt before preparation;
- multiple dispatch-attempt events for portable v1;
- terminal event without evidence;
- event transition forbidden by the locked state machine.

`rebuildControllerStore` must recreate both tables from verified durable events. Rebuild may not infer terminal truth from a missing event.

`reconcileRecoveredStore` must not automatically redispatch `UNKNOWN`/`RECONCILING` effects. It may report them as requiring observation.

## 9. Test denominator — 32 locked cases

### schema / preparation
1. v3 -> v4 append-only migration preserves predecessor rows;
2. new store reaches schema v4;
3. prepare effect writes PREPARED + semantic event;
4. raw request payload is not persisted;
5. duplicate same semantic tuple returns same effect;
6. changed request under same provider/key conflicts;
7. changed target conflicts;
8. changed expected version conflicts;
9. changed operation conflicts;
10. missing transaction/operation relationship fails closed.

### fence / dispatch
11. active current lease authorizes exactly one attempt;
12. lease for another operation rejected;
13. expired lease rejected;
14. released/revoked lease rejected;
15. stale resource generation rejected;
16. effect not PREPARED rejected for dispatch;
17. concurrent/duplicate dispatch authorization creates one attempt only;
18. successful dispatch authorization sets effect UNKNOWN before caller network work;
19. attempt row is immutable/append-only by API contract;
20. second physical attempt is rejected in portable v1.

### reconciliation / outcomes
21. UNKNOWN -> RECONCILING;
22. repeated begin reconciliation is idempotent;
23. success without evidence rejected;
24. failure without evidence/error code rejected;
25. RECONCILING -> SUCCEEDED with evidence;
26. RECONCILING -> FAILED with evidence;
27. RECONCILING -> UNKNOWN preserves uncertainty;
28. cancellation before dispatch succeeds;
29. cancellation after dispatch rejected.

### recovery / ownership / regression
30. effect + attempt rebuild exactly from semantic events after fresh-store recovery;
31. recovered UNKNOWN/RECONCILING effect is reported for observation and never auto-redispatched;
32. source scan/proof demonstrates no network/provider SDK import in External Effect Authority and full predecessor cumulative Controller suite remains green.

Any new behavior discovered during implementation expands this denominator; it may not shrink it.

## 10. Environment/evidence law

Portable Node/SQLite qualification can prove schema/state/idempotency/fencing/rebuild semantics. It cannot prove:

- real provider credentials;
- provider-side idempotency implementation;
- production GitHub rulesets/principals;
- native OS power-loss durability;
- A-01 subject qualification;
- production execution authorization.

Those remain separate evidence classes.

## 11. Build successor

`CONTROLLER-FOUNDATION-003E-EXTERNAL-EFFECT-AUTHORITY-BUILD-001` — implement schema v4 + provider-neutral semantic authority + reducer/rebuild support + the locked isolated tests, then run the full cumulative Controller suite. No provider network adapter is included in 003E.
