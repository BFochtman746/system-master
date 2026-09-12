# CONTROLLER-FOUNDATION-003B-CURRENT-RECOVERY-TAXONOMY-001

Status: **RECOVER / INVENTORY / COLLISION ANALYSIS COMPLETE FIRST PASS — NO NEW DURABLE STATE AUTHORIZED**

Qualified predecessor evidence:

- 003A exact hosted subject: `367d6628371eea6f3888853c4afcb2466b67c0d0`
- hosted run: `34675145650`
- Node 22: `201/201 PASS`
- Node 24: `201/201 PASS`

This taxonomy is created after that exact test subject and therefore is not itself covered by the recorded 003A PASS.

## Purpose

Before importing historical Foundation-003 recovery tables or states, enumerate what the current C1 -> 002D -> 003A Controller already owns. The objective is to prevent a second recovery engine, second retry engine, second outbox, second projection truth or duplicate external-effect model.

## 1. Current recovery classes

| Recovery class | Current truth / implementation | Trigger | Current behavior | Owner / collision rule |
|---|---|---|---|---|
| Command transport rediscovery | 002D immutable command-ref reconciliation | lost wakeup, controller offline, local observation loss | full/ref rescan, strict candidate validation, frozen 002B semantic replay/idempotency | 002D. 003 must not add a competing command retry queue. |
| Semantic command duplicate after uncertain local acknowledgement | frozen 002B `acceptCommand` | crash after semantic accept before observation persistence | same command ID + same semantic fingerprint returns the existing transaction | 002B. Never reimplement semantic idempotency in 003. |
| Durable journal publication lost acknowledgement | frozen 002C durable journal/publisher | remote write may have committed but response was lost | observe exact immutable event/digest and seal without duplicate publication | 002C. 003 consumes this evidence; it does not create a second journal/outbox authority. |
| Journal race / stale transport head | frozen 002C Git transport + publisher | competing writer / stale transport revision | fail/leave local batch pending; later work cannot bypass ordered predecessor | 002C. No 003 retry may reorder committed semantic events. |
| Journal integrity / truncation / tamper | 002C integrity + anchor verification | replay, startup, recovery | fail closed on gaps, digest mismatch, missing predecessor, rollback below anchor | 002C. 003 disaster recovery begins only after journal verification. |
| Disaster rebuild after local DB loss | `rebuildControllerStore` | local Controller SQLite lost/unusable and verified durable history is available | require a fresh empty target, verify committed journal/checkpoint, reduce semantic events, reconstruct current semantic state | Recovery module. This is disaster rebuild, not ordinary process restart. |
| Orphaned operation after rebuild | `reconcileRecoveredStore` | recovered RUNNING/VERIFYING operation has no active lease | transition operation to `STALE` | Recovery module. Any extension must preserve fencing semantics and current state-machine law. |
| Lease/fence stale worker | frozen kernel lease/resource-generation logic | replacement lease/new generation, late result, expired/non-current claim | stale generation cannot mutate; released lease cannot reactivate | 002B kernel. 003 may coordinate cleanup but cannot mint another fence truth. |
| Ambiguous promotion/external mutation | current kernel promotion/reconciliation semantics proven by `CF-T018`, `CF-T028`, `RC-T006`, `RC-T007` | mutation may have applied but response/process state is uncertain | observe remote/current truth before reapply; when absence is proven, return to an authorized recoverable path | Existing promotion boundary. Historical generic external-effect design must not duplicate this path. |
| Projection regeneration | current event-backed projection semantics, proven by `CF-T024` | projection absent/rebuild requested | regenerate from canonical Controller event history | Projection/read-model boundary. Projection is not semantic truth. |
| Projection freshness uncertainty | current projection status, proven by `CF-T025` | cursor/freshness does not match current event truth | report `STALE`, never guess currentness | Projection/read-model boundary. |
| Backup recovery material | 003A `backupControllerStore` | point-in-time recovery/custody need | create verified immutable SQLite snapshot with digest/size and independent restore capability | 003A maintenance boundary. Backup file is recovery evidence/material, not a concurrent semantic truth owner. |
| Ingress transient provider failure | 002D reconcile loop | timeout/rate limit/retryable server transport | finite retry/backoff/jitter then `DEFERRED_TRANSIENT`; no transaction on exhausted pre-accept transport failure | 002D. 003 must not stack another retry loop around ingress. |

## 2. Historical Foundation-003 requirements already satisfied or narrowed by current code

The old Foundation-003 requirements must be reclassified rather than replayed wholesale:

### Already represented in current predecessor semantics

- lost remote acknowledgement must be observed before reapply;
- durable journal/outbox survives publication failure and duplicate sealing is idempotent;
- stale lease generations cannot regain authority;
- semantic state is rebuildable from verified durable history;
- projection can regenerate from event history and explicitly report stale standing;
- webhooks/notifications are not correctness authority;
- backup uses the SQLite online backup API and is independently integrity checked;
- after 003A, backup publication is immutable, content-identified and temporary-file-clean on failure.

### Still materially open

1. **Generic external-effect record authority:** the current code proves promotion-specific unknown-outcome reconciliation and provider-specific 002C behavior, but a reusable provider-neutral effect-intent/effect-outcome model for future arbitrary external actions is not yet demonstrated as one current boundary.
2. **Complete ordinary-restart taxonomy:** disaster rebuild and specific promotion/lease cases are proven, but one explicit census must still show whether process restart needs additional cleanup for all active operation/attempt/lease states without importing obsolete historical state names.
3. **Projection identity/cursor storage contract:** functional stale/regenerate behavior exists, but the exact current durable representation and whether additional monotonic/immutable guards are needed must be read from current schema before any migration is proposed.
4. **Backup target-native crash durability:** hosted tests prove portable file behavior, not every filesystem/OS power-loss durability property.

## 3. State-addition prohibition until gap proof

No historical `external_effects`, projection migration or restart state transition is to be transplanted into the current schema until the corresponding current requirement is shown to be absent from existing semantic events/kernel state.

In particular:

- do not create `RECOVERING`, `UNKNOWN`, `INFLIGHT`, `RETRY`, `STALE` or similar new persistent states solely because an old branch used those words;
- first prove the concept's truth owner and whether current state machines already encode the equivalent semantic fact;
- any new durable state requires an append-only migration, semantic-event/rebuild treatment where authoritative, transition invariants, failure injection, and exact cumulative qualification.

## 4. Recovery decision law

For each uncertain condition, use this order:

1. identify the current canonical truth owner;
2. verify exact durable evidence before mutation;
3. distinguish `unknown outcome` from `known failure`;
4. reconcile remote/current truth where the effect could already have committed;
5. preserve existing idempotency/fence identity;
6. retry only at the one layer designated to own retry for that operation;
7. never convert missing evidence into success/failure;
8. emit or update semantic Controller history only when the existing authority contract requires a semantic transition, not for read-model/telemetry bookkeeping.

## 5. Traceability update

| Requirement | Existing current proof | Residual decision |
|---|---|---|
| command loss/restart safety | 002D lost-wake/crash/idempotency tests | production GitHub adapter still external-blocked |
| journal unknown acknowledgement | 002C publisher/journal tests | no 003 duplication |
| stale lease/fence safety | kernel + failure-injection + recovery tests | map ordinary restart expiration handling before extension |
| ambiguous mutation | current promotion reconciliation tests | decide whether future non-promotion effects need generic effect authority |
| local DB disaster recovery | verified-journal rebuild tests | preserve distinction from ordinary restart |
| projection reconstruction/freshness | `CF-T024`, `CF-T025` | inspect current durable cursor schema/guards before migration |
| backup recovery material | `SM-T001..006` on Node 22/24 | native crash durability remains separate |

## 6. Exact successor

`CONTROLLER-FOUNDATION-003C-EXTERNAL-EFFECT-OWNERSHIP-AND-CONTRACT-CENSUS-001` — compare current promotion, 002C provider mutation, future connected-action needs and historical Foundation-003 external-effect semantics; determine whether a generic provider-neutral external-effect truth owner is genuinely missing, and design-lock it only if no current owner already satisfies the requirement.
