# CONTROLLER FOUNDATION NEXT C1 — Lease Recovery Projection Design Lock 001

Status: **RECOVERED / INVENTORIED / ANALYZED / RESEARCHED / ADJUDICATED / DESIGN-LOCKED — BUILD AUTHORIZED**

Predecessor freeze: `FOUNDATION-NEXT-C1-DURABLE-CLAIM-FENCING-QUALIFICATION-RECEIPT-001.md`

Predecessor exact executable subject: `4b153057b971ff1978ef4db6e47ffcf2fdd3ccbb`

Current authority lineage remains rooted in qualified C1 `a2ed4205cb7674b41f09db42fd9e687cdcf8eb2d`. Production activation remains **`BLOCKED_EXTERNAL_SETUP`**.

This is supplemental Controller foundation work only. It does not mutate CORE, LEARNING, BOOK or DOCUMENTS owner controls.

## 1. Recovered current behavior

Fresh-store disaster recovery currently does the following:

- verifies the committed durable journal before semantic replay;
- reduces semantic command, transaction, operation, qualification, promotion and external-effect events;
- preserves `resource_generations` from `lease.granted` events;
- intentionally creates **no lease rows** in the recovered SQLite store;
- marks recovered RUNNING/VERIFYING operations with no live lease row as STALE;
- requires ambiguous external effects to be observed/reconciled before terminal standing;
- keeps rebuilt journal events sealed instead of treating the rebuild itself as new semantic work.

Existing `RC-T003` already locks the most important recovery law: preserve fencing generation, never resurrect the old lease, stale orphaned running work, and require a replacement acquisition with the next generation.

However the semantic reducer currently understands only `lease.granted` enough to take a max generation. It silently ignores `lease.renewed`, `lease.revoked`, and `lease.released`. That means a tampered or semantically impossible claim-history event can survive cryptographic stream verification without being semantically adjudicated, even though it cannot recreate live authority.

The newly qualified claim primitive now emits immutable `lease.renewed` and `lease.revoked` evidence, so this recovery gap has become dependency-valid foundation work.

## 2. Targeted research and design effect

### Kubernetes Lease / leader election

Kubernetes models a lease with holder identity, acquisition time, renewal time, lease duration and transition count. Candidates repeatedly read the shared Lease and use optimistic concurrency when acquiring or renewing. If renewal stops and the lease expires, another candidate may acquire. The material design lesson is that **last-known lease evidence is not timeless authority**: validity is tied to current renewal/expiry standing and current shared-state observation.

References:

- https://kubernetes.io/docs/concepts/architecture/leases/
- https://kubernetes.io/docs/reference/kubernetes-api/coordination/lease-v1/
- https://kubernetes.io/docs/concepts/cluster-administration/coordinated-leader-election/

### etcd fencing

etcd documents leases as liveness primitives and explains that a lock alone cannot protect an external resource; the protected resource needs version/fencing validation. The material design lesson is that fresh-store recovery must preserve the latest fencing generation even when it refuses to recreate a live lease.

Reference:

- https://etcd.io/docs/v3.8/learning/why/

### Adjudicated result

The Controller will distinguish two recovery cases:

1. **same-database process restart** — the authoritative SQLite lease row survives and can be reread normally; its expiry/current generation still govern;
2. **fresh-store disaster rebuild from durable journal** — historical claim evidence and the highest fencing generation are reconstructed, but **no ACTIVE claim authority is resurrected**.

This is a deliberate fail-closed availability tradeoff. A fresh worker/holder must acquire a new claim, advancing the generation, before execution can continue.

## 3. Ownership and authority fence

This unit owns only generic Controller recovery/projection of Controller claim evidence.

It does not own:

- worker scheduling or placement;
- worker liveness determination outside the local durable lease row;
- semantic command authorization;
- provider credentials/network observation;
- domain work semantics;
- qualification/promotion authority;
- peer-owner semantics.

The durable journal proves what the Controller previously committed. It does **not** prove that the historical worker process is still alive after a fresh-store disaster rebuild.

## 4. Canonical recovered claim-history projection

Semantic replay adds a non-authorizing `claim_history` projection keyed by `lease_id`.

A recovered history record has exactly:

- `lease_id`;
- `operation_id`;
- `resource_id`;
- opaque `worker_id`;
- positive integer `generation`;
- `issued_at` from the `lease.granted` event occurrence time;
- current projected `expires_at` after any valid renewals;
- `last_observed_at` from grant/renewal/revocation/release evidence;
- `terminal_status`: `null | RELEASED | REVOKED`;
- optional `revocation_reason_code`;
- optional `superseded_by_generation` when a higher generation exists for the same resource.

This projection is **evidence/history only**. It is never inserted as an ACTIVE row into `leases` during fresh-store rebuild.

## 5. Semantic validation laws

### `lease.granted`

Replay must fail closed unless:

- lease, operation, resource and worker identifiers are present and bounded;
- generation is a positive safe integer;
- `expires_at` is a valid Controller timestamp later than event occurrence;
- referenced operation already exists in the operation stream and its planned resource equals the lease resource;
- `lease_id` has not been reused;
- `(resource_id,generation)` is unique.

Post-reduction, generations for each resource must be contiguous beginning at 1. A gap means the supposedly complete recovery journal is missing claim history and cannot establish the fencing floor safely.

### `lease.renewed`

Replay must fail closed unless:

- referenced lease history exists;
- operation/resource/generation exactly match the immutable grant;
- the claim has not been explicitly RELEASED or REVOKED;
- `previous_expires_at` exactly equals projected current expiry;
- new `expires_at` is strictly later;
- `observed_at` is a valid timestamp not before issuance or the previous observed claim evidence;
- new expiry is after `observed_at`.

A second semantically different renewal cannot overwrite history silently.

### `lease.revoked`

Replay must fail closed unless:

- referenced lease exists;
- immutable operation/resource/generation binding matches;
- claim is not already RELEASED/REVOKED;
- reason code is bounded/nonsecret;
- observation timestamp is valid and not before prior claim evidence.

Then projection becomes `REVOKED`.

### `lease.released`

Replay must fail closed unless:

- referenced lease exists;
- immutable operation/resource/generation binding matches;
- claim is not already terminal;
- release event occurrence is not before prior claim evidence.

Then projection becomes `RELEASED`.

### cross-generation adjudication

After all streams are verified and reduced:

- highest generation per resource becomes `resource_generations[resource_id]`;
- every lower generation gets `superseded_by_generation = highest_generation`;
- explicit RELEASED/REVOKED status is preserved as historical fact;
- an unterminated historical latest claim remains history only and is **not** promoted to ACTIVE.

## 6. Fresh-store rebuild law

`rebuildControllerStore` must continue to create **zero lease rows** from journal-only recovery.

It must durably restore:

- the verified/sealed event journal;
- exact highest `resource_generations` fencing floors;
- all other already-supported semantic projections.

Claim history remains reconstructible from the sealed events through `reduceSemanticEvents`; duplicating that history into an ACTIVE lease table is forbidden.

This design intentionally avoids a schema migration for an evidence-only projection.

## 7. Reconciliation law after fresh-store rebuild

`reconcileRecoveredStore` continues to:

- mark RUNNING/VERIFYING operations without a live lease row STALE;
- require uncertain external effects to be observed before any reapply.

It will additionally report bounded recovery facts derived from the verified local event journal:

- `historical_claim_count`;
- `historical_current_generation_by_resource`;
- `nonresurrected_unterminated_claims` as lease IDs only.

These are diagnostics/reconciliation inputs, not execution authority.

READY operations may remain READY: no external work has been proven started merely by the existence of an historical lease grant. Any later execution requires a new claim against the preserved fencing floor.

## 8. Reconciliation and no-read-after-write law

Fresh-store reconstruction is a pure function of verified durable journal evidence plus a fresh empty target store.

No wakeup, worker message, chat/webhook field, mutable cache, or provider response can augment claim authority during rebuild.

After rebuild, later acquisition must reread current durable `resource_generations` and lease state under the normal Controller atomic boundary. It never assumes the replayed history itself is a live claim.

## 9. Retry law

Journal verification or semantic replay failure is not retried as a claim mutation.

A caller may retry only classified transient filesystem/database access failure, with bounded backoff/jitter and the same immutable journal checkpoint. Integrity failure, event gap, impossible claim history, generation gap, binding conflict or semantic contradiction is permanent until authoritative evidence changes.

No stacked retry loop is added.

## 10. Lossless traceability census

| Requirement / invariant | Current component | Durable state | Interface / contract | Tests/evidence | Environment | Standing / blocker |
| --- | --- | --- | --- | --- | --- | --- |
| verified journal before rebuild | `journal-integrity.js` / `recovery.js` | sealed events/checkpoint | `rebuildControllerStore` | RC-T004/009 + integrity suite | hosted Node/SQLite | reusable |
| preserve highest fence | reducer/rebuild | `resource_generations` | semantic replay | RC-T003 | hosted Node/SQLite | reusable |
| never resurrect ACTIVE lease | rebuild | empty `leases` on fresh rebuild | recovery contract | RC-T003 | hosted Node/SQLite | reusable / strengthen |
| stale orphaned running work | `reconcileRecoveredStore` | operation STALE event/state | recovery reconcile | RC-T003 | hosted Node/SQLite | reusable |
| ambiguous effects observed | recovery/effect authority | effect state/evidence | recovery reconcile | external-effect recovery tests | hosted Node/SQLite | reusable |
| validate grant identity/binding | reducer currently partial | journal event | semantic replay | partial | hosted Node | BUILD REQUIRED |
| validate renewal chain | reducer ignores event | journal event | semantic replay | none | hosted Node | BUILD REQUIRED |
| validate revocation chain | reducer ignores event | journal event | semantic replay | none | hosted Node | BUILD REQUIRED |
| validate release chain | reducer ignores event | journal event | semantic replay | indirect | hosted Node | BUILD REQUIRED |
| reject generation gaps/duplicates | reducer currently max-only | journal event | semantic replay | none | hosted Node | BUILD REQUIRED |
| bounded recovery diagnostics | absent | derived from sealed events | reconcile result | none | hosted Node | BUILD REQUIRED |
| same-DB restart live-row reread | claim authority/kernel | `leases` | normal reopen | FCLAIM-034/035 | hosted Node/SQLite | QUALIFIED |
| journal-only live-holder liveness proof | impossible from journal alone | none | forbidden | n/a | disaster recovery | INTENTIONALLY NOT CLAIMED |
| target-native sudden-power-loss recovery | no evidence | n/a | n/a | none | target native | BLOCKED_EXTERNAL_EVIDENCE |
| multi-host consensus/network-FS claim authority | out of portable scope | n/a | n/a | none | production distributed | BLOCKED_EXTERNAL_SETUP |

Unaccounted bounded requirements after this design adjudication: **0**.

## 11. Frozen isolated qualification denominator — 36 cases

The build denominator may expand but may not shrink.

### grant projection/integrity (1-9)
1. valid grant creates one historical claim record;
2. grant projects exact operation/resource/worker/generation/expiry;
3. grant issued time comes from event occurrence;
4. grant preserves planned resource binding;
5. missing referenced operation fails closed;
6. resource mismatch fails closed;
7. duplicate lease id fails closed;
8. duplicate `(resource,generation)` fails closed;
9. invalid/nonfuture grant expiry fails closed.

### generation floor (10-14)
10. one resource generation 1 projects floor 1;
11. generations 1 then 2 project floor 2 regardless stream grouping order;
12. lower generation is marked superseded by highest generation;
13. generation gap fails closed;
14. generation zero/noninteger fails closed.

### renewal replay (15-22)
15. valid renewal advances projected expiry;
16. renewal preserves generation and immutable binding;
17. renewal before grant fails closed;
18. wrong operation/resource/generation fails closed;
19. previous-expiry mismatch fails closed;
20. non-increasing expiry fails closed;
21. stale/out-of-order observation fails closed;
22. renewal after explicit terminal claim fails closed.

### revocation/release (23-28)
23. valid revocation projects REVOKED and bounded reason;
24. revocation wrong binding fails closed;
25. revocation after terminal claim fails closed;
26. valid release projects RELEASED;
27. release wrong binding fails closed;
28. release after terminal claim fails closed.

### fresh-store non-resurrection/reconcile (29-34)
29. rebuild from grant-only journal creates zero lease rows;
30. rebuild from renewed latest claim creates zero lease rows but preserves latest generation;
31. rebuild from revoked history creates zero lease rows and preserves evidence;
32. recovered RUNNING operation becomes STALE;
33. READY historical claim remains READY but cannot execute without a fresh claim;
34. replacement fresh claim advances preserved generation and old lease id is not found as authority.

### diagnostics/cumulative isolation (35-36)
35. recovery diagnostics report only bounded claim IDs/generation/count and cannot confer authority;
36. full inherited Controller cumulative suite remains green on required Ubuntu/Windows x Node 22/24 matrix.

## 12. Build successor

Exactly one dependency-valid successor is authorized:

**`CONTROLLER-FOUNDATION-NEXT-C1-LEASE-RECOVERY-PROJECTION-BUILD-001 — SEMANTIC CLAIM-HISTORY REDUCER + GENERATION-INTEGRITY VALIDATION + NON-RESURRECTING FRESH-STORE RECOVERY DIAGNOSTICS -> 36-CASE ISOLATED QUALIFICATION -> FULL HOSTED CUMULATIVE MATRIX -> FREEZE`**

Build constraints:

- preserve `RC-T003` non-resurrection semantics;
- do not insert journal-recovered leases as ACTIVE;
- no schema migration unless an isolated test proves it necessary;
- no scheduler/worker selection/spawn;
- no provider/network I/O;
- no peer owner-control mutation;
- no production/native/A-01 evidence synthesis.