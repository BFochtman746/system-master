# CONTROLLER-FOUNDATION-003-FORENSIC-RECOVERY-001 — Reliability / Recovery / External-Effect Control

Status: **RECOVER + INVENTORY + FIRST ANALYZE PASS COMPLETE / NO 003 IMPLEMENTATION CLAIM**

Current predecessor lineage for this recovery:

- C1 base: `a2ed4205cb7674b41f09db42fd9e687cdcf8eb2d`
- C1-derived 002D portable implementation tested head: `3ee6edbaf13c7f0de7acb65f1b8f580ec0a1952c`
- 002D portable qualification receipt predecessor: `2ad38d6c431e76748dc21db2b1d23b0851cc1f83`

Historical evidence inputs only:

- Python-era Foundation-003 candidate: `controller-v2/foundation-003@ec2fcbf188acfad20dd640cf14c2dbb5bf79c0dd`
- JavaScript rebind archaeology: `controller-v2/foundation-003-rebind@77fe9cf79f15aa3299030c2cc7da6daa65487b58`

Neither historical branch is an implementation ancestor for this current stage. No wholesale merge/cherry-pick is authorized by this artifact.

## 1. Recovered purpose

The historical Foundation-003 work had one coherent product-independent purpose: make Controller recovery, backup publication, external side-effect uncertainty and published projections deterministic before worker/scheduler/execution layers are allowed to depend on them.

The historical acceptance contract contained 19 requirements centered on:

1. cumulative predecessor regression;
2. online SQLite backup + independent integrity/foreign-key verification;
3. atomic backup publication + exact digest/size identity;
4. idempotent external-effect preparation with semantic-conflict detection;
5. exactly-once accounting of each attempted send, not an exactly-once remote-effect assumption;
6. evidence-bound SUCCEEDED/FAILED/UNKNOWN outcomes;
7. mandatory reconciliation of UNKNOWN effects before retry or success;
8. restart conversion of ambiguous INFLIGHT effects to UNKNOWN;
9. restart fencing/finalization for dead leases and interrupted attempts;
10. active transactions without live current fences entering recovery;
11. stranded outbox publication returning to retry without rewriting immutable events;
12. monotonic projection cursors bound to real events;
13. immutable projection identity/destination with explicit STALE/ERROR state;
14. projection advancement not creating self-referential controller events;
15. no real provider mutation in the reliability layer;
16. no webhook/Actions ordering dependency for correctness;
17. append-only/checksum-stable migrations;
18. one authoritative successor line;
19. exact-subject hosted CI.

These are recovered requirements, not automatic current completion claims.

## 2. Current C1/002D implementation inventory

| Recovered responsibility | Current C1/002D evidence | Classification | Current disposition |
|---|---|---|---|
| SQLite online backup | `src/storage-maintenance.js` uses Node SQLite backup and then verifies integrity / foreign keys | CURRENT PARTIAL | KEEP-BUT-HARDEN. Current destination publication is not atomic/content-addressed and can overwrite an existing path. |
| Disaster rebuild from durable semantic journal | `src/recovery.js` verifies durable journal, rebuilds a fresh store and refuses non-empty targets | CURRENT SUBSTANTIAL | KEEP. Must remain separate from ordinary restart reconciliation. |
| Orphaned operation reconciliation | `reconcileRecoveredStore` marks RUNNING/VERIFYING operations without an active lease STALE | CURRENT PARTIAL | KEEP-BUT-EXPAND only if requirements prove additional restart classes belong here. |
| Durable event publication / lost acknowledgement | 002C journal/publisher already carries strong idempotency, unknown-ack and ordered publication semantics | CURRENT SUBSTANTIAL / QUALIFIED PREDECESSOR | DO NOT DUPLICATE in 003. 003 may consume these truths. |
| External-effect state machine | no dedicated reusable 003 external-effect module is present in the current C1-derived JavaScript source inventory | GAP / HISTORICAL SEMANTICS | RECOVER/REDESIGN against current kernel before BUILD. Do not transplant Python tables/state machine blindly. |
| Projection cursor / projection identity authority | current Controller has projections/recovery evidence, but the historical 003 monotonic real-event cursor and immutable-destination contract is not yet proven as one current reusable 003 boundary | PARTIAL / NEEDS EXACT MAP | RECOVER current code and tests before deciding build vs reuse. |
| Provider network mutation | current lower layers contain GitHub control-state transport for 002C and candidate ingress transport design for 002D | SEPARATE AUTHORITY LAYERS | 003 reliability logic must remain provider-neutral; it may describe effects but must not become another GitHub network client. |

## 3. Important collision findings

### 3.1 003 must not become a second durable journal

002C already owns durable Controller authority/event evidence. Reliability recovery may read/verify/reconcile that truth but cannot create another canonical event history or a competing outbox truth.

### 3.2 003 must not become a second retry engine

002D owns bounded transport retries for ingress reads. 002C adapters own their own classified provider transport behavior. The 003 external-effect state machine must own uncertainty/reconciliation semantics for a committed effect intent, not stack an unbounded retry loop underneath or above other adapters.

### 3.3 UNKNOWN is not FAILED and not RETRY

The historical design correctly treated a request with an ambiguous remote outcome as `UNKNOWN`. That invariant remains required: observation/reconciliation must determine remote truth before another externally mutating attempt is authorized.

### 3.4 External-effect intent and provider execution are different truths

A Controller external-effect record may own the stable effect identity, request digest, idempotency key, expected remote version, attempt accounting and outcome standing. Provider adapters own the mechanical API call. Policy/effect authority remains a separate higher decision and cannot be minted by the reliability record.

### 3.5 Projection state is a projection

Projection freshness cannot certify Controller semantic completion. A projection cursor must refer to real canonical events and may become STALE/ERROR, but its own bookkeeping must not create recursive semantic events merely to say the projection advanced.

## 4. Historical implementation reuse adjudication

### Python Foundation-003 (`ec2fcbf...`)

Disposition: **SEMANTIC / TEST ARCHAEOLOGY, NOT CODE BASE**.

Useful recovered semantics include external-effect PREPARED/INFLIGHT/UNKNOWN/SUCCEEDED discipline, restart recovery classifications, projection cursor binding and acceptance criteria. The Python storage/schema implementation belongs to an older Controller line and is not copied into the current JavaScript kernel by default.

### JavaScript Foundation-003 rebind (`77fe9cf...`)

Disposition: **TARGETED CODE ARCHAEOLOGY**.

Its `storage-maintenance.js` change addresses a demonstrated current gap by:

- rejecting overwrite of an existing immutable backup destination;
- writing backup bytes to a unique temporary path;
- independently verifying the temporary database;
- fsyncing the completed backup bytes;
- calculating exact byte count and SHA-256 identity;
- renaming the verified temporary file into its final path only after verification;
- cleaning temporary files after failure.

This design is compatible with the current JavaScript C1-derived storage-maintenance boundary, but it is not adopted merely because the old branch contains it. It requires a current 003 design-lock and cumulative test on the current predecessor.

## 5. Current gap list

1. **Backup atomic publication gap** — current C1 `backupControllerStore` writes directly to the destination and returns no byte digest. This is a concrete dependency-valid 003 hardening target.
2. **External-effect truth model gap** — current C1-derived source does not yet demonstrate one reusable provider-neutral external-effect record/state machine satisfying the historical uncertainty/reconciliation invariants.
3. **Projection authority gap** — exact ownership of projection identity, real-event cursor binding, monotonicity and STALE/ERROR semantics must be mapped to current JavaScript code before build.
4. **Restart taxonomy gap** — current disaster rebuild and orphan-operation reconciliation exist, but the complete current map for dead leases, in-flight outbox work, ambiguous effects and active transactions without current fences is not yet frozen as 003.
5. **Migration/evidence gap** — any new 003 durable state requires an append-only migration and cumulative replay/recovery evidence; historical migration-004 cannot simply be imported if the current schema differs.

## 6. Build order adjudication

The current safest 003 order is:

1. **003-A Backup Publication Hardening** — narrow change to current `storage-maintenance.js`; atomic immutable publication, digest/size evidence, failure cleanup and cumulative regression.
2. **003-B Current Recovery Taxonomy Map** — losslessly map existing recovery, leases, attempts, outbox and Controller events before adding state.
3. **003-C External-Effect Contract Design-Lock** — define identity, state machine, evidence requirements, idempotency, expected-remote-version and UNKNOWN reconciliation without provider-specific networking.
4. **003-D Projection Contract Design-Lock** — bind monotonic cursor to canonical events, immutable projection identity and explicit stale/error semantics.
5. **003-E Durable schema/migration + implementation** only after B-D prove the current gaps and ownership.
6. **003-F Isolated + cumulative qualification** against the exact current 002B/002C/C1/002D predecessor stack.

A blocker in production 002D GitHub activation does not prevent portable 003 recovery/hardening that does not pretend the absent external control-state installation exists.

## 7. Traceability seed

| Requirement / invariant | Current implementation | Durable state | Interface / contract | Existing proof | Remaining blocker |
|---|---|---|---|---|---|
| online consistent backup | `storage-maintenance.js` | backup SQLite file | `backupControllerStore` | current SM-T001..003 predecessor tests | atomic publish + digest current proof missing |
| disaster rebuild | `recovery.js` | verified durable journal -> fresh SQLite store | `rebuildControllerStore` | predecessor recovery suite | not all restart classes are disaster rebuild |
| no duplicate event authority | 002C durable journal | 002C GitHub journal/anchor | 002C publisher / verification | cumulative 198-test PASS in 002D PR subject | 003 must consume, not duplicate |
| remote effect uncertainty | not yet one current reusable JS boundary | TBD | TBD after 003-C | historical Python evidence only | current design-lock required |
| projection freshness | partial existing projection/recovery substrate | projection/read model state | TBD after exact map | historical tests + current stale-projection evidence | current ownership/interface census required |

## 8. Exact next operation

`CONTROLLER-FOUNDATION-003A-BACKUP-PUBLICATION-DESIGN-LOCK-001` — re-read the current 002D-qualified predecessor head; freeze atomic immutable backup publication requirements against current Node SQLite behavior; add current tests for no-overwrite, failure cleanup, digest/size identity and independent restore; only then transplant/adapt the narrow JavaScript implementation.
