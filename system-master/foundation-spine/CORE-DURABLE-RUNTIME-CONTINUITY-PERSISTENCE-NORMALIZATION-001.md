# CORE Durable Runtime Continuity Persistence Normalization 001

Status: OWNER-LOCAL DESIGN LOCK FROZEN; CROSS-OWNER DESIGN LOCK REMAINS BLOCKED  
Build authorization: NO  
Fresh implementation qualification: NOT APPLICABLE YET

Predecessors:

- `CORE-DURABLE-RUNTIME-CONTINUITY-RECOVERY-INVENTORY-001-R2.md`
- `CORE-DURABLE-RUNTIME-CONTINUITY-CONTRACT-REBIND-001.md`
- `CORE-DURABLE-RUNTIME-CONTINUITY-PERSISTENCE-RECOVERY-001.md`

Exact live owner reread before this design unit remained `system-master/control-v2@54de1268b1036f966dd9235f5463e430ab1fcd19`. The isolated branch predecessor was `second-shift/core-durable-runtime-continuity-recovery-001-20260912@858e18111387915d9a36adf81948e926452b16f9`.

## 1. Design-lock scope

This unit freezes only persistence semantics that are owned by Durable Runtime Continuity and can be established without inventing peer contracts.

It does **not** freeze the concrete Work/Project, Plan/Step, Resource grant, Route, Placement, Transport, Effect Authority, Evidence/Assurance or Security/Privacy schemas. Those remain opaque foreign references until their current owners are recovered and frozen.

No specialist Book, Learning, Documents or Programming semantics enter this design.

## 2. Persistence architecture lock

Durable Runtime Continuity SHALL expose one logical persistence port rather than package-local store authority:

`ContinuityPersistencePort`

The name above is an internal design identifier, not an external System Master service contract.

The port SHALL support atomic mutation of one declared transaction group at a time, exact optimistic concurrency/fence preconditions, semantic idempotency receipts, durable append/history where required, and deterministic restart reconstruction.

The port SHALL NOT imply one physical database technology. Local-file journals are allowed as a hosted qualification adapter; production/native correctness requires environment-specific evidence.

## 3. Owner-local record families

### P1 — Recovery Episode / Event

Owned facts:

- stable runtime `RecoveryEpisodeId`;
- opaque exact Work/Job/Attempt lineage refs supplied by their owners;
- recovery epoch;
- recovery-local state and version;
- interruption observation ref;
- opaque classification/plan/checkpoint/claim refs;
- explicit external-effect uncertainty state;
- blocker reason codes;
- recovery event sequence;
- semantic command/idempotency receipts.

Forbidden facts: Work lifecycle truth, project lifecycle truth, canonical Plan/Step truth, effect permission.

### P2 — Checkpoint / Journal / History

Owned facts:

- content digest and durable payload ref;
- checkpoint sequence and parent checkpoint ref;
- exact structural/version compatibility receipt ref;
- source attempt/fence ref;
- runtime decision/effect watermarks;
- quarantine state and integrity findings;
- history segment/compaction lineage.

Forbidden facts: independent compatibility truth, retention/legal authority, specialist-domain snapshot interpretation.

### P3 — Runtime Claim / Fence

Owned facts, subject to later Placement/Resource boundary confirmation:

- recovery-local execution claim id;
- claim epoch;
- runtime fence generation;
- lease-validity observation used by Durable Runtime;
- renew/release/revoke lineage;
- semantic request receipts.

Forbidden facts: provider qualification, resource grant truth, placement score/assignment truth. If Placement ultimately owns the authoritative fence, this record becomes an exact consumed fence ref/projection rather than an independent generator.

### P4 — Execution Attempt / Deterministic Decision / Outcome

Owned facts:

- runtime attempt identity tied to exact foreign Work/Job/Plan refs;
- attempt number and current fence ref;
- deterministic start key;
- runtime decision inputs/results/digests;
- runtime outcome/evidence digest refs;
- semantic replay receipts.

Forbidden facts: Plan authority, resource admission, identity delegation, final business completion.

### P5 — Signal / Timer / Cancel Reconciliation Cursor

Owned facts:

- durable observation/cursor identity;
- dedupe/idempotency identity;
- runtime-consumed logical timer/signal/cancel state;
- reconciliation watermark;
- explicit UNKNOWN/gap state.

Forbidden facts: Transport delivery truth or cancellation authority itself. Transport and Work/Orchestration supply the authoritative external refs.

### P6 — External Effect Reconciliation

Owned facts:

- effect intent ref/digest from Effect Authority;
- provider/operation ref sufficient for reconciliation;
- idempotency key ref;
- observed state `PENDING | UNKNOWN | CONFIRMED_APPLIED | CONFIRMED_NOT_APPLIED | DIVERGED` or equivalent current Effect-authority mapping;
- external receipt ref;
- reconciliation observation digest/time;
- runtime evidence refs.

Forbidden facts: permission to execute the effect, publication authority, specialist semantics, or unilateral interpretation of a provider receipt as business completion.

### P7 — Continuity Evidence Outbox

Owned facts:

- immutable evidence-intent id;
- exact continuity subject ref;
- event/evidence type;
- source semantic state version/fence;
- payload digest/ref;
- delivery status/cursor for the shared Evidence interface.

Forbidden facts: a competing evidence ledger, qualification classification authority, or PASS standing.

### P8 — Migration / Crosswalk Receipt

Owned facts:

- immutable legacy source subject/digest;
- mapping version;
- exact target record ids/refs;
- migration status/cursor;
- quarantine/manual-binding reason;
- idempotency receipt.

Forbidden facts: copied legacy authority or a second Work/Plan truth store.

## 4. Foreign-reference rule

Until current peer schemas are frozen, every foreign semantic reference SHALL be represented internally as an opaque immutable reference envelope containing only fields that can be validated without taking ownership:

- owner/system identifier;
- subject/ref identifier;
- optional exact version/generation;
- optional content/receipt digest;
- observed-at / validated-at metadata when required;
- explicit freshness/standing `CURRENT | STALE | UNKNOWN` as an observation, never as the foreign owner's truth.

A missing version/digest is not filled in by inference. If the consuming operation requires one and it is unavailable, the operation blocks.

## 5. Atomic transaction groups

The following atomic groups are frozen because splitting them would break owner-local correctness.

### TX1 — Recovery mutation

Atomically persist:

- expected recovery version check;
- next recovery-local state/version;
- exactly one ordered recovery event;
- semantic command receipt;
- required P7 evidence-outbox intent if the transition is evidence-bearing.

A crash may expose either the complete group or none of it; never state without its idempotency receipt/event.

### TX2 — Claim/fence mutation

Atomically persist:

- expected current claim/fence precondition;
- claim/renew/revoke/release record;
- monotonic claim/fence generation state owned by the final current authority boundary;
- semantic request receipt;
- required evidence-outbox intent.

If current Placement owns the fence generation after future rebind, the continuity transaction stores only the consumed authoritative fence ref and runtime-local claim lineage; it must not duplicate generation authority.

### TX3 — Attempt start

Atomically persist:

- deterministic start key uniqueness;
- exact attempt identity;
- attempt number/version;
- exact fence ref;
- start request digest/receipt;
- evidence-outbox intent where required.

A lost response after TX3 is reconciled by the start key; it is not a reason to create a second attempt.

### TX4 — Attempt outcome

Atomically persist:

- expected attempt/fence precondition;
- monotonic outcome sequence;
- outcome digest/ref;
- semantic request receipt;
- evidence-outbox intent.

Business completion remains outside this transaction unless its current owner explicitly binds an atomic service contract.

### TX5 — Effect reconciliation observation

Atomically persist:

- exact Effect Authority intent/ref;
- observation digest;
- resulting runtime reconciliation state;
- external receipt ref if observed;
- observation idempotency receipt;
- evidence-outbox intent.

It may never create effect permission.

### TX6 — Signal/timer/cancel cursor advance

Atomically persist:

- input delivery/owner ref;
- dedupe identity;
- previous cursor/version precondition;
- next runtime reconciliation cursor/state;
- semantic receipt.

Duplicate or reordered delivery must replay to the same result or block on a semantic collision.

### TX7 — Migration mapping

Atomically persist:

- immutable source digest;
- mapping-version precondition;
- target mapping refs;
- migration status/cursor;
- receipt or quarantine/manual-binding result.

## 6. Checkpoint two-phase durability lock

Checkpoint payload bytes and checkpoint manifest deliberately use a bounded two-phase pattern rather than requiring one physical transaction:

1. write payload to a temporary object/file;
2. durably flush it;
3. publish it under its content digest using create-once/atomic publication semantics where the backend supports them;
4. verify the published digest/length;
5. atomically commit the checkpoint manifest + evidence intent as the authoritative visibility boundary;
6. only manifests make payloads eligible for resume;
7. orphan payloads are harmless and may be garbage-collected only under current retention authority after a safety window.

Crash before step 5 leaves an orphan, never an authoritative checkpoint. Crash after step 5 must leave a resolvable digest-bound payload or the checkpoint is quarantined/blocked.

## 7. OCC, fence and idempotency lock

Every mutation SHALL carry the smallest sufficient current precondition rather than relying on last-write-wins:

- recovery mutation: exact recovery version;
- checkpoint manifest: exact Work/runtime lineage + monotonic sequence + prior/parent ref as applicable;
- claim/fence: exact current generation/claim standing;
- attempt: exact current fence + deterministic start key;
- signal/timer/cancel cursor: exact previous cursor/version;
- effect reconciliation: exact intent/ref + observation digest + current reconciliation version;
- migration: exact source digest + mapping version.

Idempotency identity and payload/semantic digest are separate. Reusing the same idempotency identity with different semantics is a conflict, not a duplicate success.

## 8. Crash and restart reconciliation matrix

| Crash point | Required restart result |
|---|---|
| before any transaction commit | no authoritative state change |
| after state bytes written but before durable commit | backend recovery either rolls back or does not expose the mutation |
| after durable TX1 state/event/receipt commit but before response | retry/reconnect reads same semantic receipt and returns/reconciles existing result |
| after checkpoint payload publication before manifest commit | payload remains orphan/non-authoritative; no resume pointer may reference it |
| after checkpoint manifest commit | digest-bound payload must be readable and valid or checkpoint becomes quarantined/blocked |
| after external provider may have acted before Effect receipt is durably known | state is `UNKNOWN/RECONCILING`; do not reissue until Effect Authority/provider reconciliation resolves it |
| after claim/attempt commit before wakeup delivery | restart rediscovery from durable state resumes processing; wakeup loss cannot lose work |
| after wakeup delivery before durable claim/attempt commit | duplicate wakeup is harmless; no authority exists until durable transaction commits |
| during evidence delivery after semantic commit | P7 durable outbox redispatches; lack of delivery cannot erase semantic state or invent evidence PASS |
| corrupted/truncated tail or invalid checksum | fail closed/quarantine affected record family according to backend recovery design; do not silently skip authoritative corruption |

## 9. Retry lock

Retries are permitted only after failure classification.

- semantic conflicts, stale fences, authorization/resource denials, corruption, incompatible contracts and unknown effect outcomes are **not** transient retry candidates;
- local storage/provider operations classified transient may use bounded backoff/jitter only when the attempted operation is idempotent or protected by a semantic receipt;
- only one layer owns retry for a given operation boundary; stacked retry layers are forbidden because they multiply load and obscure causality;
- after every transient retry or reconnect, current durable state is re-read before deciding the next action.

## 10. Integrity and quarantine lock

A current persistence adapter must provide:

- exact frame/record integrity validation before replay;
- monotonic sequence/version validation;
- unique-key/semantic-digest collision detection;
- explicit corruption location/reason evidence;
- no mutation based on a partially replayed corrupt authoritative aggregate;
- quarantine/isolation mechanics that preserve immutable evidence and unaffected aggregates where safely separable;
- migration under current Contracts & Versioning rather than ad hoc reader fallback.

Historical checksum schemes are reusable mechanics, not proof that SHA-256 line checksums alone are sufficient for every production backend.

## 11. Internal interface behavior lock

The logical persistence port SHALL provide equivalent semantics for:

- `read current aggregate by durable id`;
- `list/recover runnable or reconcilable runtime work by durable state`;
- `commit atomic transaction group with expected version/fence and semantic receipt`;
- `append immutable event/history record`;
- `put/get content-addressed payload`;
- `quarantine/corruption finding`;
- `scan durable outbox`;
- `replay/migrate from exact version under Contracts decision`.

Method names and wire schemas are intentionally not frozen here. The behavior is frozen; naming waits for the current interface blueprint and peer contract binding.

## 12. Isolated qualification denominator — owner-local minimum

The owner-local persistence implementation may not begin until the following **80-case minimum isolated denominator** is preserved. Peer-contract rebinds may add cases but may not remove these.

- TX1 recovery atomicity/version/idempotency: **10**
- TX2 claim/fence atomicity/stale-fence/restart: **10**
- TX3/TX4 attempt start/outcome semantic replay: **10**
- checkpoint payload/manifest/orphan/quarantine durability: **12**
- signal/timer/cancel dedupe/reorder/cursor restart: **8**
- effect reconciliation UNKNOWN/divergence/idempotency: **10**
- evidence outbox semantic coupling/restart/dedup: **8**
- corruption/truncation/checksum/version migration: **8**
- migration/crosswalk idempotency/quarantine: **4**

Total frozen minimum: **80 cases**.

This count is a design obligation, not PASS evidence.

## 13. Cumulative regression / calibration floor

Before freeze of an implementation, cumulative qualification must include:

- all **42/42** recovered G-WP-008..015 requirement rows;
- the **80-case** owner-local persistence denominator above;
- current System Root regression affected by durable owner refs;
- current Identity Delegation regression affected by resume/claim/effect authorization use;
- current Contracts & Versioning regression affected by persisted version/migration receipts;
- current Keel regression affected by Goal/ceiling references;
- every subsequently recovered Work/Project, Orchestrator, Resource, Route, Placement, Transport, Effect, Evidence and Security contract case touched by the implementation;
- exact environment labels separating hosted/portable from native/A-01/production/human/external evidence.

The final cumulative numeric total therefore remains open until the foreign seams are frozen. The non-shrinkable floor is the 42 recovered requirements plus 80 owner-local persistence cases, with overlaps documented rather than double-counted as evidence claims.

## 14. Build gate

Implementation remains **BLOCKED**. Build may begin only after:

1. current Work/Project identity/lifecycle refs needed by persistence are recovered;
2. current Orchestration Plan/Step refs needed by runtime attempts are recovered;
3. Resource Admission and Placement/fence ownership are resolved;
4. Transport rediscovery/delivery contract is bound;
5. Effect Authority reconciliation/receipt contract is bound;
6. Evidence outbox/ingestion contract is bound;
7. Security/Privacy/Secrets/retention constraints are bound;
8. the concrete persistence adapter/backend and its atomic/CAS guarantees are selected for the environment under qualification.

No donor wrapper may be promoted merely to satisfy this gate.

## 15. One dependency-valid successor

**`CORE-DURABLE-RUNTIME-CONTINUITY-FOREIGN-SEAM-CENSUS-001`**

Re-read the live Foundation owner and recover current/historical source for the exact foreign seams required by the frozen persistence design: Work/Project, Orchestration, Resource Admission, Routing, Placement, Transport, Effect Authority, Evidence/Assurance and Security/Privacy/Secrets. For each seam, bind requirement -> current owner -> durable truth -> exact consumed receipt/ref -> freshness/revalidation rule -> runtime test obligation -> evidence/environment -> blocker. Do not design or build any specialist semantics and do not promote a historical authority wrapper without current owner adjudication.

After every recovered seam, re-evaluate whether the 80-case owner-local denominator requires an additive cross-owner case; never shrink it.

## 16. Evidence fence

This unit freezes owner-local persistence design obligations only. It claims no executable implementation, no current PASS, no A-01/native/production standing, no distributed-filesystem correctness, no real external credential/provider authority, no human evidence, and no specialist-system correctness.