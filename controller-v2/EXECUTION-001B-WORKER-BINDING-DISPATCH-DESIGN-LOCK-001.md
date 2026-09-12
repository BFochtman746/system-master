# CONTROLLER V2 — EXECUTION-001B WORKER BINDING + DISPATCH INTENT DESIGN LOCK 001

Status: **TARGETED RESEARCH COMPLETE / ADJUDICATED / DESIGN-LOCKED / BUILD AUTHORIZED / NOT YET QUALIFIED**
Working lineage before this artifact: `controller-v2/foundation-006-c1-rebind@41de8916cd765ab6bf34a0fa880122c112ae82b0`
Recovery inventory: `EXECUTION-001B-WORKER-CAPABILITY-DISPATCH-RECOVERY-INVENTORY-001.md`
Qualified execution-graph subject: `0991aeb39a1de71d1755ed6e5f5039ae6f3a7a05`
Foundation executable predecessor: `0c47bcc25bc5a009ccbeeec170eea5100007149a`
Production Controller activation: `BLOCKED_EXTERNAL_SETUP`
Historical PASS transfer: `0`

## 1. Scope

EXECUTION-001B freezes the provider-neutral boundary required between a READY Controller operation and any external worker transport:

1. immutable **worker evidence binding** snapshots that consume, but do not own, identity/delegation truth;
2. immutable **execution contracts** that bind one Controller operation to opaque executable input/capability requirements without taking specialist semantics;
3. immutable **dispatch intents** bound to the exact active lease/fencing generation, worker binding and execution contract;
4. reuse of the already-qualified Foundation-003 external-effect authority for the actual ambiguous dispatch send;
5. fail-closed reconciliation across expiry, revocation, cancellation, restart, lost acknowledgement and unknown send outcome.

This design does **not** select workers, rank READY work, spawn a process, call a real provider, mint identity, decide delegation, grant human approval, or take CORE/LEARNING/BOOK/DOCUMENTS semantics.

## 2. Targeted research conclusions

Official SPIFFE workload-identity research establishes a useful provider-neutral constraint: a workload can prove identity using short-lived verifiable identity documents issued/attested by an external identity authority, and those identity documents can rotate or expire. Controller V2 therefore must not treat a mutable worker name, heartbeat, socket peer, webhook/chat field, cached token or historical identity document as timeless execution authority.

References:

- `https://spiffe.io/docs/latest/deploying/svids/`
- `https://spiffe.io/docs/latest/spiffe-specs/spiffe_workload_api/`
- `https://spiffe.io/docs/latest/deploying/registering/`

SPIFFE/SPIRE is **not mandated** by this design. It is one admissible future identity source. The frozen Controller contract is evidence-provider-neutral.

Historical CG-008/009 and `second_shift_supervisor_v2.py` remain semantic/adversarial archaeology only. Their useful lesson is that dispatch intent must be exact-bound to the current claim/fence and that external acknowledgement is observation, not claim authority. Historical A-01/supervisor PASS transfers: **0**.

## 3. Ownership lock

### Controller owns

- immutable content-addressed binding of already-verified worker identity/delegation/capability evidence;
- immutable content-addressed execution-contract identity;
- immutable content-addressed dispatch-intent identity;
- validation that a current binding is unexpired/unrevoked at Controller authorization points;
- capability-set containment checks;
- exact binding of dispatch to current lease and fencing generation;
- durable semantic events for those bindings;
- reconciliation/projection of Controller-owned binding/intent state.

### External identity / delegation / policy owners own

- whether a worker principal is real;
- attestation of a workload/service identity;
- delegation validity and revocation truth;
- whether a human approved something;
- organization policy correctness;
- credential issuance, rotation and secret custody.

Controller may persist exact references/digests/verifier-policy facts returned by those authorities, but may not synthesize them.

### Frozen predecessor owners remain unchanged

- command/transaction semantic admission: Foundation-006;
- dependency eligibility/readiness: EXECUTION-001A;
- claim/lease/fencing: durable claim authority;
- ambiguous external send/effect: Foundation-003;
- local transport authentication: Foundation-005;
- journal/event authority: Foundation-002C/C1 lineage.

## 4. Schema v7 design lock

The implementation is authorized to extend `ExecutionGraphKernel` append-only to schema v7 with four Controller-owned tables.

### 4.1 `worker_bindings`

```text
worker_bindings(
  binding_id TEXT PRIMARY KEY,
  worker_ref TEXT NOT NULL,
  identity_authority TEXT NOT NULL,
  identity_evidence_ref TEXT NOT NULL,
  identity_evidence_digest TEXT NOT NULL,
  delegation_evidence_ref TEXT NOT NULL,
  delegation_evidence_digest TEXT NOT NULL,
  verifier_policy_revision TEXT NOT NULL,
  verifier_policy_digest TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  capability_digest TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  created_at TEXT NOT NULL
)
```

Rules:

- no private key, bearer token, SVID bytes, raw credential, chat payload or webhook metadata is persisted in this table;
- capability names are canonicalized, sorted, unique strings before digesting;
- `binding_id` is SHA-256 of the full canonical semantic snapshot under protocol `controller.worker-binding/v1`;
- exact snapshot replay is idempotent;
- changed evidence/revision/capabilities/validity produces a new binding, never an in-place rewrite;
- `valid_until` must be later than `observed_at`;
- portable code validates shape/identity but does **not** claim that production evidence is genuine merely because a test fixture satisfies the schema.

### 4.2 `worker_binding_revocations`

```text
worker_binding_revocations(
  binding_id TEXT PRIMARY KEY REFERENCES worker_bindings(binding_id),
  authority TEXT NOT NULL,
  evidence_ref TEXT NOT NULL,
  evidence_digest TEXT NOT NULL,
  observed_at TEXT NOT NULL
)
```

Rules:

- revocation is append-only external evidence observation;
- Controller does not invent revocation truth;
- once a revocation row exists, that binding can never authorize a **new** dispatch intent;
- historical dispatch records keep the exact binding ID that was used; revocation does not rewrite history;
- exact revocation replay is idempotent; conflicting revocation evidence for the same binding fails closed unless a future version explicitly defines multi-observation semantics.

### 4.3 `execution_contracts`

```text
execution_contracts(
  contract_id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id),
  operation_id TEXT NOT NULL UNIQUE REFERENCES operations(operation_id),
  subject_repo TEXT NOT NULL,
  subject_algorithm TEXT NOT NULL,
  subject_oid TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  executor_kind TEXT NOT NULL,
  protocol_version TEXT NOT NULL,
  payload_ref TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  required_capabilities_json TEXT NOT NULL,
  required_capability_digest TEXT NOT NULL,
  created_at TEXT NOT NULL
)
```

Rules:

- one immutable v1 execution contract per operation;
- transaction/subject/resource are reread from current durable Controller truth at contract creation and must exact-match;
- `payload_ref` is an opaque locator and `payload_digest` is its immutable semantic-content binding; Controller does not interpret specialist payload meaning;
- raw specialist payload bytes are not required in Controller execution state;
- `executor_kind` selects a technical execution adapter only and may not become specialist semantic authority;
- required capabilities are canonical sorted unique strings;
- `contract_id` is SHA-256 of protocol `controller.execution-contract/v1` plus all semantic fields;
- changing subject/resource/payload/capability/executor/protocol after contract creation requires a new operation, not contract mutation.

### 4.4 `dispatch_intents`

```text
dispatch_intents(
  dispatch_id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id),
  operation_id TEXT NOT NULL REFERENCES operations(operation_id),
  contract_id TEXT NOT NULL REFERENCES execution_contracts(contract_id),
  worker_binding_id TEXT NOT NULL REFERENCES worker_bindings(binding_id),
  lease_id TEXT NOT NULL UNIQUE REFERENCES leases(lease_id),
  resource_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK(generation > 0),
  request_digest TEXT NOT NULL,
  created_at TEXT NOT NULL
)
```

Rules:

- `dispatch_id` is SHA-256 under protocol `controller.worker-dispatch/v1` over exact transaction/operation/contract/binding/lease/resource/generation and canonical dispatch-envelope digest;
- one v1 dispatch intent per lease; a replacement claim receives a new lease/generation and therefore a new dispatch identity;
- dispatch intent is immutable semantic history, not a mutable queue row;
- no `SENT`, `ACKED`, retry-count or provider-result column is added here because those would duplicate the Foundation-003 external-effect authority;
- exact replay is idempotent; semantic change under the same identity fails closed.

## 5. Worker evidence binding admission contract

A future trusted identity/delegation verifier adapter may call a narrow Controller registrar port with a **verification receipt**, not a worker self-assertion.

The portable Controller method may validate/canonicalize/persist the receipt, but production activation must keep this registrar inaccessible to the worker-facing port and must mechanically bind it to the configured verifier/identity authority.

A receipt must contain at least:

- worker reference;
- identity authority name/reference;
- identity evidence reference + SHA-256 digest;
- delegation evidence reference + SHA-256 digest;
- verifier policy revision + digest;
- canonical capability set;
- observation time;
- validity deadline.

Presence of a receipt in portable tests is **structural evidence only**, not proof that a human, identity provider or organization actually authorized the worker.

## 6. Current-binding predicate

`workerBindingStanding(bindingId, now)` is a read-only Controller classification:

- `CURRENT` only if the binding exists, has no revocation row, and `observed_at <= now < valid_until`;
- `EXPIRED` when `now >= valid_until`;
- `REVOKED` when a revocation row exists;
- `NOT_YET_VALID` when `now < observed_at`;
- `NOT_FOUND` otherwise.

No heartbeat extends `valid_until`. A refreshed external identity/delegation decision creates a new binding ID.

## 7. Capability rule

An execution contract's required capability set must be a subset of the selected current worker binding's capability set when a dispatch intent is created and again immediately before the external dispatch effect is authorized.

Capability matching is exact string set containment in v1. No fuzzy role inference, wildcard expansion, chat-derived skill claim or historical success creates capability authority.

## 8. Claim and dispatch-intent sequencing

Historical CG-009 made claim + dispatch intent one transaction. Controller V2 does **not** copy that coupling because current claim/fencing authority is already frozen and independently qualified.

V1 freezes this reconciliation-safe sequence instead:

1. operation is READY through EXECUTION-001A;
2. immutable execution contract exists;
3. Controller selects a currently valid worker binding in a later scheduler/selection boundary;
4. current claim authority acquires a lease using `worker_ref` as the opaque `worker_id`;
5. `createDispatchIntent()` rereads the lease, operation, binding and contract and persists the immutable intent;
6. if the process crashes after claim but before intent, **no external send is authorized**; reconciliation may create the exact deterministic intent while the claim is still valid or allow the claim to expire/revoke;
7. a claimed-without-intent state is therefore explicit and recoverable, not unrepresented corruption.

This preserves the qualified claim authority instead of rewriting it solely to remove a safe reconciliation window.

## 9. `createDispatchIntent()` preconditions

The method must execute under the Controller mutation boundary and fail closed unless all are true on a fresh reread:

- operation exists and is exactly `READY`;
- transaction remains `ADMITTED` or `ACTIVE`;
- execution contract belongs to exactly that transaction/operation and still matches current subject/resource facts;
- lease exists, is ACTIVE, unexpired, belongs to the exact operation/resource, and its generation equals the current resource fencing generation;
- lease `worker_id` equals worker binding `worker_ref`;
- worker binding standing is `CURRENT`;
- contract required capabilities are contained in binding capabilities;
- no different dispatch intent already exists for the lease.

The method grants no send/network/provider authority. It only makes the intent durable.

## 10. Dispatch send reuses Foundation-003 external-effect authority

There will be **no second generic dispatch-effect state machine**.

For one durable dispatch intent, the Controller prepares the existing external-effect authority with:

- `provider`: the technical worker-transport adapter identity, e.g. `worker-transport:<adapter>`;
- `effect_type`: `controller.worker.dispatch`;
- `target_key`: the exact `worker_binding_id` or provider-specific target bound by the adapter contract;
- `idempotency_key`: exact `dispatch_id`;
- `request`: canonical dispatch envelope containing only the required immutable contract/binding/lease/generation references and digests;
- `expected_remote_version`: optional provider precondition when a provider supports one.

The external-effect table persists only the request digest, preserving its existing secret-minimization rule.

The `dispatch_intents` row does not need to own the generated effect ID. Reconciliation locates/prepares the effect idempotently by provider + dispatch id and verifies its operation/request identity.

## 11. Dispatch authorization sequence and RUNNING semantics

Foundation-003 requires an external effect attempt to be fenced by a current live lease and a RUNNING operation. V1 therefore freezes:

1. prepare the dispatch external effect while the operation is still READY;
2. revalidate current worker binding + capability containment + live lease/fence;
3. call the frozen `startLeasedOperation()` boundary, which changes Controller execution standing to RUNNING under the current claim;
4. immediately revalidate binding + live lease/fence through the EXECUTION-001B wrapper;
5. authorize the external-effect dispatch attempt; Foundation-003 moves the effect to UNKNOWN **before network work**;
6. only then may the transport adapter perform the send.

Clarification: Controller `RUNNING` means a fenced execution claim has been activated. It is **not proof that remote worker bytes have started**. Remote acknowledgement/observation remains evidence and the effect may be UNKNOWN.

If the process crashes after RUNNING but before effect authorization, reconciliation may authorize the still-PREPARED dispatch effect only after all current binding/lease/fence checks pass again.

## 12. Lost acknowledgement, duplicate send and retries

Foundation-003 already freezes the critical rule: once a dispatch attempt has been authorized, the effect is UNKNOWN and portable v1 does not return it to PREPARED for blind redispatch.

Therefore:

- network timeout/lost acknowledgement -> observe/reconcile first;
- exact provider observation proving dispatch acceptance may resolve the effect SUCCEEDED with bounded evidence, including an external execution/run reference if available;
- evidence proving permanent rejection may resolve FAILED with a classified error;
- unresolved observation remains UNKNOWN and grants no second send attempt;
- conflicting provider observations fail closed through the effect/reconciliation boundary;
- EXECUTION-001B owns **no retry counter** for an already-authorized ambiguous send;
- retries before effect authorization are limited to classified transient local/transport-preparation failures, same semantic identity, bounded backoff/jitter and fresh reread;
- no scheduler + IPC + worker adapter stacked retry loops are allowed.

## 13. Revocation / expiry / cancellation races

### Before dispatch effect authorization

If worker binding expires/revokes, claim expires/revokes/replaces, operation cancels/stales, or transaction loses executable standing, the dispatch send is not authorized.

### After dispatch effect authorization

Once the external effect is UNKNOWN, identity revocation or local cancellation cannot prove the remote send did not happen. Controller must:

- immediately preserve local cancellation/revocation/fencing truth;
- reject stale worker result/effect mutation through the frozen generation fence;
- reconcile the UNKNOWN dispatch effect by provider observation;
- never treat a remote cancellation acknowledgement as retroactive proof that the original send was impossible.

This intentionally mirrors the frozen external-effect uncertainty law.

## 14. Restart / fresh-store recovery

Recovery must reconstruct immutable worker bindings, revocation observations, execution contracts and dispatch intents from admitted semantic events.

FREC remains controlling for claims: fresh-store recovery restores **zero ACTIVE leases** while preserving the fencing floor.

Consequences:

- historical dispatch intent never resurrects a worker claim;
- a recovered PREPARED dispatch effect with no live lease cannot be authorized until a current valid claim exists for the exact current execution path;
- a recovered UNKNOWN dispatch effect must be observed/reconciled, never blindly resent;
- historical binding/contract/intent rows remain forensic truth even if the binding is now expired/revoked;
- no heartbeat, cached worker registry or external run ID recreates claim authority.

## 15. Semantic events

New event types are authorized:

- `worker.binding_recorded`
- `worker.binding_revoked`
- `operation.execution_contract_recorded`
- `operation.dispatch_intent_recorded`

Each event carries bounded IDs/digests/references only. It must not contain raw credentials, private keys, bearer tokens, raw specialist payloads or mutable chat/webhook metadata.

Exact replay emits no duplicate event.

## 16. Port exposure lock

The existing worker-facing port remains bounded to worker observation/result behavior and **must not** expose:

- binding registration/revocation;
- execution-contract creation;
- dispatch-intent creation;
- claim acquisition/renewal/revocation;
- semantic admission;
- effect authorization;
- journal sealing;
- policy/human approval mutation.

A later scheduler/controller-internal port may consume the EXECUTION-001B functions. Production identity-verifier integration receives a distinct registrar port whose authority is mechanically narrower than the full kernel.

## 17. Frozen isolated denominator — WDI-001..WDI-060

### Schema / migration / history

1. `WDI-001` — v6 store upgrades append-only to v7 with all four tables.
2. `WDI-002` — existing commands/transactions/operations/dependencies/leases/effects remain byte-semantically unchanged through migration.
3. `WDI-003` — failed v7 migration rolls back without reporting v7.
4. `WDI-004` — reopening v7 is idempotent.
5. `WDI-005` — recovery reconstructs worker binding, execution contract and dispatch intent exactly.
6. `WDI-006` — recovery rejects tampered content-addressed binding/contract/dispatch identities.

### Worker binding

7. `WDI-007` — canonical verified-evidence receipt records one binding.
8. `WDI-008` — exact binding replay is idempotent with one event.
9. `WDI-009` — changed evidence digest creates a different binding ID.
10. `WDI-010` — changed capability set creates a different binding ID.
11. `WDI-011` — duplicate/unsorted capabilities canonicalize deterministically.
12. `WDI-012` — invalid digest/reference/time shape is rejected.
13. `WDI-013` — `valid_until <= observed_at` is rejected.
14. `WDI-014` — raw credential/token/private-key fields are rejected by strict schema.
15. `WDI-015` — CURRENT standing requires observed <= now < valid-until and no revocation.
16. `WDI-016` — expired binding is EXPIRED and cannot authorize new intent.
17. `WDI-017` — not-yet-valid binding is NOT_YET_VALID and cannot authorize new intent.
18. `WDI-018` — exact revocation evidence is append-only/idempotent.
19. `WDI-019` — conflicting revocation evidence for same binding fails closed.
20. `WDI-020` — revoked binding cannot authorize new intent but historical rows remain unchanged.

### Execution contract

21. `WDI-021` — contract exact-binds current transaction/operation/subject/resource.
22. `WDI-022` — same contract replay returns one content-addressed ID/event.
23. `WDI-023` — changed payload digest under same operation conflicts rather than mutating contract.
24. `WDI-024` — changed executor/protocol/capability requirement under same operation conflicts.
25. `WDI-025` — required capabilities canonicalize deterministically.
26. `WDI-026` — contract for mismatched transaction/operation is rejected.
27. `WDI-027` — contract subject/resource mismatch against current Controller truth is rejected.
28. `WDI-028` — raw specialist payload is not persisted in contract row/event.

### Dispatch intent / claim binding

29. `WDI-029` — current READY operation + exact contract + CURRENT capable worker + ACTIVE current lease creates one dispatch intent.
30. `WDI-030` — exact dispatch-intent replay is idempotent with one event.
31. `WDI-031` — lease worker_ref mismatch rejects intent.
32. `WDI-032` — lease operation/resource mismatch rejects intent.
33. `WDI-033` — stale generation rejects intent.
34. `WDI-034` — expired/released/revoked lease rejects intent.
35. `WDI-035` — non-READY operation rejects new intent.
36. `WDI-036` — transaction outside ADMITTED/ACTIVE rejects new intent.
37. `WDI-037` — missing required capability rejects intent.
38. `WDI-038` — expired binding rejects intent.
39. `WDI-039` — revoked binding rejects intent.
40. `WDI-040` — one lease cannot bind two semantic dispatch intents.
41. `WDI-041` — crash-equivalent claim-without-intent state has no external-send authority and reconciles deterministically while claim remains valid.
42. `WDI-042` — same operation under replacement lease/generation receives a distinct dispatch ID.

### Foundation-003 effect reuse / uncertainty

43. `WDI-043` — dispatch intent prepares exactly one external effect using idempotency key = dispatch ID.
44. `WDI-044` — prepared effect request digest exact-binds contract/binding/lease/generation dispatch envelope without persisting raw payload/credential bytes.
45. `WDI-045` — duplicate effect preparation converges to the same effect.
46. `WDI-046` — external dispatch cannot be authorized before operation is RUNNING.
47. `WDI-047` — start + effect authorization succeeds only under current lease/fence and current worker binding.
48. `WDI-048` — binding expiry/revocation before effect authorization prevents send authorization.
49. `WDI-049` — effect authorization moves dispatch effect to UNKNOWN before transport send.
50. `WDI-050` — lost acknowledgement leaves UNKNOWN and grants no blind redispatch.
51. `WDI-051` — bounded provider observation can reconcile success with exact external execution reference evidence.
52. `WDI-052` — classified provider rejection can reconcile permanent failure.
53. `WDI-053` — unresolved observation remains UNKNOWN with one authorized attempt.

### Cancellation / restart / authority fences

54. `WDI-054` — cancellation/revocation before effect authorization prevents new send.
55. `WDI-055` — cancellation/revocation after UNKNOWN preserves effect reconciliation obligation and stale worker result fencing.
56. `WDI-056` — fresh-store recovery reconstructs dispatch history but restores zero live claim authority.
57. `WDI-057` — recovered UNKNOWN dispatch is observed/reconciled, never blindly resent.
58. `WDI-058` — heartbeat/socket/chat/webhook metadata cannot create/extend worker binding, capability or dispatch authority.
59. `WDI-059` — worker-facing port exposes none of registrar/contract/intent/claim/effect/admission/journal-seal authorities.
60. `WDI-060` — full cumulative race test proves duplicate/reordered wakeups and concurrent reconcilers converge without double intent, double effect attempt or fence bypass.

Denominator shrinkage is forbidden without reopening this design lock and preserving the reason.

## 18. Cumulative qualification requirement

Before EXECUTION-001B may freeze as implemented:

- WDI-001..060: **60/60** on the exact executable subject;
- complete current Controller cumulative Node suite on the same exact subject;
- hosted matrix: Ubuntu/Windows x Node 22/24 unless superseded by explicit environment authority;
- fresh v6 -> v7 migration, restart and fresh-store journal recovery included;
- failure injection must cover claim-without-intent, intent-before-start, RUNNING-before-effect-authorization, UNKNOWN-after-send and revocation/cancellation races;
- historical CG/A-01 results count as **0** toward PASS;
- hosted PASS implies no production/native/device/A-01 standing.

## 19. Traceability lock

| Requirement | Implementation authorized | Durable state | Interface/contract | Tests | Evidence/environment | Blocker |
|---|---|---|---|---|---|---|
| verified worker evidence binding | v7 worker binding registry | binding + revocation tables/events | registrar port / current-standing read | WDI-007..020 | hosted structural first | real identity/delegation evidence external |
| immutable execution contract | v7 contract registry | execution_contracts/event | record/get contract | WDI-021..028 | hosted portable | real specialist payload/provider outside Controller semantics |
| fenced dispatch intent | v7 dispatch registry | dispatch_intents/event | create/get/reconcile intent | WDI-029..042 | hosted portable | worker selection later |
| ambiguous dispatch send | **reuse Foundation-003** | external_effects/attempts | prepare/authorize/reconcile effect | WDI-043..053 + predecessor EE tests | hosted portable first | real provider behavior external |
| cancellation/restart/fence | reuse tx/op/lease/FREC + v7 projections | current durable state/history | reconcile | WDI-054..060 | hosted portable first | production/native evidence external |
| no identity/delegation invention | external owner; Controller stores refs/digests only | immutable evidence binding | registrar is not worker port | WDI-014..020,058..059 | structural only | `BLOCKED_EXTERNAL_SETUP` for production |

## 20. Gate standing

- RECOVER: **PASS**
- INVENTORY: **PASS**
- ANALYZE: **PASS**
- TARGETED RESEARCH: **PASS — worker identity/attestation design question resolved provider-neutrally**
- ADJUDICATE: **PASS for EXECUTION-001B v1**
- DESIGN-LOCK: **PASS — 60-case denominator frozen**
- BUILD: **AUTHORIZED, NOT YET EXECUTED**
- ISOLATED QUALIFICATION: **NOT RUN**
- CUMULATIVE REGRESSION/CALIBRATION: **NOT RUN**
- FREEZE: **NOT AUTHORIZED UNTIL EXACT-SUBJECT PASS**
- PRODUCTION/NATIVE/A-01: **NOT CLAIMED**

## 21. Exactly one dependency-valid successor

`CONTROLLER-EXECUTION-001B-WORKER-BINDING-DISPATCH-IMPLEMENTATION-001 — IMPLEMENT SCHEMA V7 + IMMUTABLE WORKER BINDING/REVOCATION + EXECUTION CONTRACT + DISPATCH INTENT + FOUNDATION-003 DISPATCH EFFECT REUSE + RECOVERY REDUCERS -> RUN WDI-001..060 -> RUN COMPLETE HOSTED CUMULATIVE MATRIX -> FREEZE ONLY ON EXACT-SUBJECT PASS`

Hard fence: this successor may not implement worker selection/priority, worker spawning, provider business semantics, production identity issuance, or CORE/LEARNING/BOOK/DOCUMENTS semantics.
