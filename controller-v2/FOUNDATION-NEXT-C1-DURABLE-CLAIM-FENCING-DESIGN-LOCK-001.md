# CONTROLLER FOUNDATION NEXT C1 — Durable Claim Renewal & Fencing Design Lock 001

Status: **RECOVERED / INVENTORIED / RESEARCHED / ADJUDICATED / DESIGN-LOCKED — BUILD NOT YET CLAIMED**

Current authority lineage at lock time:

`a2ed4205cb7674b41f09db42fd9e687cdcf8eb2d` (C1 qualified activation-closure)
-> `2ad38d6c431e76748dc21db2b1d23b0851cc1f83` (C1-derived Foundation-002D)
-> frozen Foundations 003/004/005
-> Foundation-006 exact executable subject `307edd3aa9b0e836648070421024632ea61c1988`
-> Foundation-006 qualification receipt commit `823eb87cd6c07fde8d7ad1963b7b29681039a8fd`.

Production activation remains **`BLOCKED_EXTERNAL_SETUP`**.

This unit is supplemental Controller foundation work. It does not create or mutate CORE, LEARNING, BOOK, or DOCUMENTS owner control.

## 1. Recovery decision

No evidence-supported `FOUNDATION-007` authority exists on the current C1-derived lineage. Therefore this lock does **not** invent a numeric successor.

The current Node/SQLite kernel already contains a substantial claim/fencing substrate:

- `operations.resource_id`;
- `resource_generations(resource_id,generation)`;
- `leases(lease_id,operation_id,resource_id,worker_id,generation,status,issued_at,expires_at,last_heartbeat_at)`;
- one-active-lease-per-resource uniqueness;
- `acquireLease`;
- `assertWorkerLease`;
- `startLeasedOperation`;
- `heartbeatLease`;
- `releaseLease`;
- fenced `submitWorkerResult`;
- Foundation-003 external-effect attempts bound to `lease_id`, `resource_id`, and `generation`.

Current cumulative tests already prove basic mutual exclusion, generation fencing, stale-result rejection, nonsemantic heartbeat recording, direct-RUNNING prohibition, resource binding, and external-effect dispatch fencing.

This means the remaining boundary is **not a greenfield lease system**. It is a forensic repair/formalization of qualifier-era claim behavior that is already embedded in the kernel.

## 2. Historical substrate classification

Historical branch `controller-v2-foundation@9d13b462ff1425f69517059bf2e9a16bdd3a1089` is archaeology/research evidence only. It is not an authority parent and no Python implementation is authorized for transplantation.

Reusable historical invariants:

1. claim/lease state is Controller-owned durable coordination state;
2. every successful replacement claim advances a fencing token/generation;
3. stale or revoked owners cannot submit completion or effect acknowledgement;
4. lease renewal extends the same current claim rather than minting a new authority identity;
5. renewal is accepted only for the active/current fencing token;
6. SQLite mutation uses an immediate single-writer transaction;
7. retry is bounded and only for classified transient contention/transport failures;
8. a worker never owns promotion, policy, qualification, or arbitrary database authority.

Historical behavior specifically included `renew_lease`, which updated both heartbeat time and expiry monotonically (`max(existing_expiry, now + ttl)`). Current C1-derived Node `heartbeatLease` updates `last_heartbeat_at` but does **not** extend `expires_at`. That difference is a recovered design gap, not evidence that renewal is intentionally forbidden.

## 3. Current defect / missing authority seam

The current portable kernel can issue an expiring claim and fence stale owners, but it lacks a first-class durable **renewal** contract.

Consequences if left unresolved:

- a valid long-running operation expires after its original TTL even while the current holder is healthy;
- callers may be tempted to treat heartbeat metadata as implicit authority even though heartbeat does not renew the claim;
- a later scheduler/worker layer would have no explicit idempotent reconciliation contract for extending a current claim;
- retry ownership and renewal semantics would remain implicit;
- the distinction between liveness hint and durable claim authority would be under-specified.

The existing `heartbeatLease` behavior is retained as a liveness observation only. It must not silently become semantic renewal authority.

## 4. Targeted research that materially changes the design

### Kubernetes Lease model

Current Kubernetes Lease/leader-election documentation models durable holder identity plus `acquireTime`, `renewTime`, `leaseDurationSeconds`, and transition count. Competing candidates use optimistic concurrency on the durable Lease object rather than trusting an in-memory heartbeat. This supports the split between holder/liveness observation and a durable lease update, and it reinforces compare-current-state-before-renew/acquire behavior.

References:

- https://kubernetes.io/docs/concepts/architecture/leases/
- https://kubernetes.io/docs/reference/kubernetes-api/coordination/lease-v1/
- https://kubernetes.io/docs/concepts/cluster-administration/coordinated-leader-election/

### etcd lease/lock guarantees

etcd documents leases as liveness primitives and explicitly warns that a lock alone cannot protect an external resource: the protected external resource needs version validation/fencing semantics. This directly supports retaining the Controller generation token as the effect/result fence even when a lease is current.

References:

- https://etcd.io/docs/v3.5/learning/api_guarantees/
- https://etcd.io/docs/v3.5/learning/why/
- https://etcd.io/docs/v3.6/learning/api/

### SQLite single-writer law

SQLite WAL still serializes writers. `BEGIN IMMEDIATE` obtains write intent before a read-then-write mutation and avoids relying on stale read state. Current Controller `atomic()` already uses this pattern. The claim/renew/revoke transitions therefore remain bounded local SQLite transactions rather than introducing a second distributed lock system.

Reference:

- https://sqlite.org/hctree/doc/begin-concurrent/doc/begin_concurrent.md

## 5. Adjudicated ownership

This foundation boundary owns only generic Controller coordination authority:

- durable resource claim identity;
- holder identity as an opaque Controller execution identity;
- fencing generation;
- expiry and liveness timestamps;
- renewal/revocation/release transitions;
- stale-holder validation used by later execution/effect ports;
- restart rediscovery and reconciliation of claim standing.

It explicitly does **not** own:

- scheduler choice or priority;
- worker process lifecycle/spawn;
- domain work semantics;
- policy/admission decisions;
- provider credentials or network calls;
- qualification/promotion semantics;
- CORE, LEARNING, BOOK, DOCUMENTS, or Programming semantics.

A claim means only “this execution identity currently holds the bounded Controller resource claim.” It is not semantic authorization to perform a dangerous command or external effect.

## 6. Locked state model

Existing lease statuses remain:

`ACTIVE | RELEASED | EXPIRED | REVOKED`

Only `ACTIVE` can authorize start/result/effect fencing checks.

Generation law:

- generation is scoped to `resource_id`;
- every successful acquisition after no valid current holder increments generation exactly once;
- renewal never changes generation;
- heartbeat never changes generation;
- release/revoke never decreases generation;
- an old generation can never become current again.

Expiry law:

- `expires_at` is a liveness deadline, not an external-effect fence by itself;
- once local current time is at/after `expires_at`, the holder cannot start work, submit results, or obtain an effect dispatch permit;
- replacement acquisition advances generation, permanently fencing the old holder even if the old process later resumes;
- wall-clock anomalies may reduce availability, but cannot authorize an old generation after a newer generation exists.

## 7. Heartbeat versus renewal

These are separate contracts.

### `heartbeatLease`

Purpose: bounded liveness observation only.

- requires the exact active lease + current generation;
- fails after expiry;
- updates only `last_heartbeat_at`;
- does not extend `expires_at`;
- emits no semantic event;
- cannot confer execution/effect authority.

### new `renewLease`

Purpose: durable extension of the same current claim.

Proposed portable signature:

`renewLease({ leaseId, generation, operationId, desiredExpiresAt, observedAt })`

Locked rules:

1. all identifiers/timestamps are validated before mutation;
2. lease must be ACTIVE;
3. operation id, generation, and current `resource_generations` must match exactly;
4. current lease must not already be expired at `observedAt`;
5. `desiredExpiresAt` must be strictly after `observedAt`;
6. requested extension must be within a bounded portable maximum horizon;
7. mutation is monotonic: `expires_at = max(current_expires_at, desiredExpiresAt)`;
8. repeating the exact request is idempotent and returns the same-or-later durable standing without minting a new generation;
9. no scheduler/worker/provider call is performed inside the SQLite transaction;
10. response is returned only after rereading the durable updated row.

Using an explicit desired expiry rather than “now + ttl” makes the semantic renewal request stable across lost-response replay.

## 8. Revocation contract

Schema already admits `REVOKED` but no current public kernel method owns it. The build must add a bounded Controller-owned revoke transition:

`revokeLease({ leaseId, generation, operationId, reasonCode, observedAt })`

Rules:

- exact active/current generation required;
- bounded reason code only; no raw private/operator text in semantic evidence;
- revocation is terminal for that lease;
- repeat of the same revocation is idempotent;
- revocation never grants another holder by itself;
- later acquisition must reread current durable state and then advance generation;
- a stale/noncurrent generation cannot revoke a newer lease.

Revocation authority is a Controller coordination primitive. Who is allowed to request revocation remains a later policy/execution integration concern and cannot be inferred from mutable chat/webhook metadata.

## 9. Reconciliation law

Every acquisition/renewal/revocation/release pass follows:

1. read current durable row(s);
2. classify current standing;
3. compare desired state with current state;
4. if already satisfied, return stable standing;
5. otherwise mutate under `BEGIN IMMEDIATE` with exact generation/state guards;
6. commit;
7. reread durable state;
8. return observed durable standing.

No method assumes read-after-write freshness from a cache, wakeup, worker message, or transport response.

Wakeups/heartbeats may trigger a reconcile pass, but they are hints only.

## 10. Retry law

Claim methods contain no stacked retry loops.

Retry is allowed only for classified transient database contention or transient outer transport failure, with:

- finite attempt cap;
- bounded exponential backoff;
- jitter;
- the same semantic request identity/desired state;
- current durable-state reread before every retry.

The following are not retryable as transient claim failures:

- stale generation;
- wrong operation/resource binding;
- expired claim renewal;
- revoked/released claim renewal;
- malformed timestamp/identifier;
- semantic conflict;
- authorization/policy denial.

## 11. Lossless traceability census

| Requirement / invariant | Current implementation | Durable state | Contract/interface | Current tests/evidence | Environment | Standing / blocker |
| --- | --- | --- | --- | --- | --- | --- |
| one current claim per resource | partial reusable runtime | unique active lease index | `acquireLease` | CF-T004 | hosted Node/SQLite | reusable |
| monotonic fence | reusable runtime | `resource_generations` | `acquireLease`, `assertWorkerLease` | CF-T005, CF-T022 | hosted Node/SQLite | reusable |
| stale result rejection | reusable runtime | lease + generation | `submitWorkerResult` | CF-T005/022 | hosted Node/SQLite | reusable |
| direct RUNNING requires claim | reusable runtime | operation state | `startLeasedOperation` | existing extras | hosted Node/SQLite | reusable |
| effect dispatch fenced | reusable runtime | effect attempt lease/generation | ExternalEffectAuthority | F003 isolated/cumulative | hosted Node/SQLite | reusable |
| liveness heartbeat separated from semantics | reusable runtime | `last_heartbeat_at` | `heartbeatLease` | CF-T007 | hosted Node/SQLite | reusable |
| durable claim renewal | **missing** | `expires_at` exists | **no current renewal API** | no current denominator | hosted Node/SQLite | BUILD REQUIRED |
| replay-stable renewal desired state | **missing** | `expires_at` | proposed `renewLease` | none | hosted Node/SQLite | BUILD REQUIRED |
| explicit revocation API | **missing** | REVOKED schema value exists | proposed `revokeLease` | none | hosted Node/SQLite | BUILD REQUIRED |
| restart rediscovery of claim standing | partial | leases/resource generations | recovery/census path | cumulative recovery proves store reopen, not renewal-specific | hosted Node/SQLite | qualification expansion required |
| multi-host/network-FS lease correctness | absent by design | n/a | n/a | none | production/distributed | BLOCKED / OUT OF PORTABLE SCOPE |
| target-native sudden-power-loss durability | absent evidence | n/a | n/a | none | target native | BLOCKED_EXTERNAL_EVIDENCE |
| production worker identity/credential standing | external | opaque `worker_id` only | later integration | none | production | BLOCKED_EXTERNAL_SETUP |

Current unaccounted bounded design rows after this adjudication: **0**. Missing behaviors are explicitly classified as build-required or externally blocked rather than silently omitted.

## 12. Locked isolated test denominator — 40 cases

The build denominator may expand but may not shrink.

### schema/current-substrate regression (1-8)
1. existing schema-v5 store opens without destructive migration;
2. existing lease rows survive repair unchanged;
3. one ACTIVE lease per resource remains enforced;
4. acquire on READY/current planned resource succeeds;
5. conflicting live claim fails closed;
6. expired claim can be replaced only through acquisition reconcile;
7. replacement increments generation exactly once;
8. old generation remains permanently fenced.

### heartbeat separation (9-13)
9. heartbeat updates liveness observation only;
10. heartbeat does not extend expiry;
11. heartbeat emits no semantic authority event;
12. expired lease heartbeat rejected;
13. stale-generation heartbeat rejected.

### renewal (14-25)
14. exact current active lease renews to explicit desired expiry;
15. renewal does not change generation;
16. exact replay is idempotent;
17. desired expiry earlier than current expiry is a no-op success;
18. desired expiry at/before observed time rejected;
19. extension beyond portable max horizon rejected;
20. expired lease cannot renew;
21. released lease cannot renew;
22. revoked lease cannot renew;
23. stale generation cannot renew;
24. wrong operation binding cannot renew;
25. renewal rereads and returns durable post-commit standing.

### revocation/release (26-32)
26. current active lease can be revoked with bounded reason code;
27. exact revocation replay is idempotent;
28. stale generation cannot revoke current holder;
29. revoked lease cannot start operation;
30. revoked lease cannot submit result;
31. revoked lease cannot obtain external-effect dispatch permit;
32. release remains terminal and cannot reactivate.

### recovery/concurrency/adversarial (33-40)
33. restart preserves renewed expiry;
34. restart preserves revocation;
35. simultaneous acquire attempts produce one current holder/generation;
36. renewal racing replacement cannot resurrect old generation;
37. renewal racing revocation converges to one legal terminal/current standing;
38. lost-response renewal replay cannot mint a new generation or duplicate authority;
39. source scan proves claim module/kernel contains no scheduler/provider/domain execution path;
40. full inherited Controller suite remains green across required hosted matrix.

## 13. Evidence/environment limits

Portable qualification can establish local Node/SQLite state, fencing, renewal, revocation, restart and deterministic concurrency semantics.

It cannot establish:

- multi-host distributed consensus;
- correctness on a network filesystem;
- real worker/service identity;
- real human/delegation/approval standing;
- production secrets/provider credentials;
- target-native sudden-power-loss durability;
- production activation;
- A-01 standing.

Those remain explicit blocker/evidence classes.

## 14. Build successor

Exactly one dependency-valid successor is bound:

`CONTROLLER-FOUNDATION-NEXT-C1-DURABLE-CLAIM-FENCING-BUILD-001 — ADD EXPLICIT REPLAY-STABLE RENEWAL + CONTROLLER-OWNED REVOCATION -> 40-CASE ISOLATED DENOMINATOR -> FULL HOSTED CUMULATIVE MATRIX -> FREEZE`

Build constraints:

- reuse current schema and fencing substrate unless a test proves a schema change is required;
- do not transplant historical Python runtime;
- do not implement scheduler/worker selection/spawn;
- do not add provider/network I/O;
- do not alter Foundation-002B/002C/C1/002D frozen evidence;
- do not mutate CORE/LEARNING/BOOK/DOCUMENTS owner controls;
- preserve exact-subject qualification and all blocker classes.
