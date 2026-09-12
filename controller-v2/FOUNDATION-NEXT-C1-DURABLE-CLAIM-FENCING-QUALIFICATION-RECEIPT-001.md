# CONTROLLER FOUNDATION NEXT C1 — Durable Claim Renewal & Fencing Qualification Receipt 001

Status: **FROZEN / HOSTED-PORTABLE QUALIFIED**

Controlling design:

- `FOUNDATION-NEXT-C1-DURABLE-CLAIM-FENCING-DESIGN-LOCK-001.md`
- `FOUNDATION-NEXT-C1-DURABLE-CLAIM-FENCING-DESIGN-LOCK-ERRATUM-001.md`

Exact tested executable subject: **`4b153057b971ff1978ef4db6e47ffcf2fdd3ccbb`**

Qualified workflow: **Controller v2 Foundation run `34685512196` / run number `258`**

Authority lineage preserved:

`a2ed4205cb7674b41f09db42fd9e687cdcf8eb2d` (C1 qualified activation closure)
-> `2ad38d6c431e76748dc21db2b1d23b0851cc1f83` (C1-derived Foundation-002D)
-> frozen Foundation 003/004/005
-> Foundation-006 exact qualified subject `307edd3aa9b0e836648070421024632ea61c1988`
-> this durable-claim/fencing executable subject.

Production Controller activation remains **`BLOCKED_EXTERNAL_SETUP`**.

This receipt commit is later evidence metadata. It is not the tested executable subject. PASS standing does not transfer to changed executable bytes without fresh exact-subject qualification.

## 1. Scope frozen by this receipt

The hosted-portable Controller claim primitive now has explicit reusable runtime for:

- durable read-only claim standing;
- one-active-claim-per-resource continuity using the existing schema-v5 lease substrate;
- monotonically increasing per-resource fencing generation;
- heartbeat as a liveness observation only;
- explicit replay-stable claim renewal to a bounded desired expiry;
- explicit Controller-owned claim revocation with bounded reason evidence;
- stale-generation fencing for operation start, worker result and external-effect dispatch;
- lost-response renewal replay without a second generation or duplicate semantic authority event;
- same-database restart preservation of renewed expiry and revocation evidence.

This unit does not implement scheduler selection, worker spawning, provider I/O, domain execution, qualification/promotion semantics, distributed consensus, or specialist semantics.

## 2. Exact implementation identity

The tested subject contains:

- `controller-v2/src/durable-claim-authority.js`
- `controller-v2/test/durable-claim-authority.test.js`

The claim authority implementation reuses the already qualified Controller kernel and schema-v5 tables rather than creating a second lock system.

Portable renewal maximum horizon is **300000 ms (5 minutes)** from the explicit Controller observation time.

The renewal contract is:

`renewLease({ leaseId, generation, operationId, desiredExpiresAt, observedAt })`

The revocation contract is:

`revokeLease({ leaseId, generation, operationId, reasonCode, observedAt })`

## 3. Reconciliation law observed

The implementation preserves the controlling reconciliation method:

1. validate immutable semantic request identity;
2. read current durable lease and current resource generation;
3. classify current state;
4. return stable durable standing if the desired state is already satisfied;
5. otherwise mutate only under the Controller kernel's `BEGIN IMMEDIATE` atomic boundary with exact state/generation guards;
6. append bounded semantic evidence for a real renewal/revocation mutation;
7. commit;
8. reread durable state after commit;
9. return the reread durable standing rather than assuming read-after-write freshness.

A heartbeat remains only a hint/liveness observation. It does not extend expiry, emit semantic authority, or bypass later semantic admission/effect authority.

## 4. Renewal/fencing laws frozen

- generation is scoped to `resource_id` and never decreases;
- replacement acquisition advances generation exactly once;
- renewal never changes generation;
- heartbeat never changes generation;
- an old generation can never become current again;
- renewal requires the exact active lease, operation and current resource generation;
- an expired, released or revoked lease cannot renew;
- a mutation-producing renewal cannot extend authority from an observation older than the durable lease standing;
- desired expiry is explicit, after `observedAt`, and no more than five minutes beyond it;
- exact lost-response replay returns already-satisfied durable standing instead of minting a new generation or duplicate event;
- renewal appends one bounded `lease.renewed` event only when expiry actually advances;
- successful revocation appends one bounded `lease.revoked` event;
- changed revocation reason under an already-revoked semantic identity is an idempotency conflict;
- revoked/released/stale claims cannot start work, submit results, or authorize external-effect dispatch.

## 5. Retry law preserved

The claim-authority module contains no internal stacked retry layer and no provider/network call.

If an outer caller later retries classified transient database/transport failure, it must use finite bounded backoff, jitter, the same semantic desired state and a durable-state reread before each retry.

Stale generation, wrong operation/resource binding, expired/released/revoked standing, malformed identity/timestamp, semantic conflict, policy denial and idempotency conflict are not classified as transient claim retries.

## 6. Isolated qualification denominator

All frozen isolated cases **FCLAIM-001 through FCLAIM-040 passed** on the exact tested subject.

The denominator covers:

- schema/substrate preservation;
- one-active-resource claim and monotonic generation;
- stale-holder fencing;
- heartbeat/renewal separation;
- valid explicit renewal;
- replay-idempotent renewal;
- bounded horizon and timestamp rejection;
- expired/released/revoked/stale/wrong-operation denial;
- post-commit durable reread;
- bounded revocation and exact replay;
- revocation semantic conflict;
- operation/result/effect fencing after revocation;
- same-database restart preservation;
- acquisition and replacement race convergence;
- renewal/revocation race convergence;
- lost-response replay safety;
- source-level exclusion of scheduler/provider/network/process-spawn/peer-domain dependencies.

Isolated denominator standing: **40/40 PASS**.

## 7. Cumulative hosted qualification

Workflow run `34685512196` checked out exact subject `4b153057b971ff1978ef4db6e47ffcf2fdd3ccbb` and passed the complete required hosted matrix:

| Environment | Runtime | Result |
| --- | --- | --- |
| `ubuntu-latest` | Node 22 | **PASS** |
| `ubuntu-latest` | Node 24 | **PASS** |
| `windows-latest` | Node 22 | **PASS** |
| `windows-latest` | Node 24 | **PASS** |

The observed Ubuntu Node 22 cumulative run reported:

- tests: **425**
- pass: **425**
- fail: **0**
- cancelled: **0**
- skipped: **0**
- todo: **0**

This cumulative suite includes the complete previously frozen Controller foundation regressions plus the new 40-case durable claim denominator.

## 8. Authority separation preserved

The executable lineage covered by this receipt does not mutate CORE, LEARNING, BOOK or DOCUMENTS owner controls.

The new claim primitive is generic Controller coordination authority only. A live claim does not imply:

- semantic command authorization;
- human approval;
- delegation validity;
- permission to execute a dangerous command;
- permission to perform an external effect;
- provider credential standing;
- qualification or promotion standing.

Those remain separately owned boundaries.

Mutable chat/webhook/wakeup metadata is not durable claim authority. Wakeups and heartbeats may cause a reconcile pass but cannot establish semantic truth.

## 9. Recovery standing and explicit non-claim

Same-database process restart preservation is qualified by this unit.

However, current Controller disaster rebuild from the durable semantic journal does **not** reconstruct complete live lease rows. Existing semantic replay preserves resource-generation evidence and intentionally does not resurrect execution authority.

Therefore this receipt does **not** claim journal-only restoration of a live claim.

Explicit remaining foundation obligation:

**`BLOCKED_FOUNDATION_SUCCESSOR — LEASE EVENT PROJECTION / FRESH-STORE REBUILD CONTRACT NOT YET DESIGN-LOCKED`**

A fresh-store rebuild must not infer that an historical ACTIVE/renewed holder is still live merely because journal evidence exists. The next foundation unit must preserve the latest fencing generation and claim history while adjudicating how recovered operations become non-authorizing/stale and require a fresh fenced claim before execution.

## 10. Evidence/environment blocker classes carried forward

The following remain unclaimed:

- production Controller activation — **`BLOCKED_EXTERNAL_SETUP`**;
- real human identity or approval;
- real delegation validity/revocation standing;
- real worker/service identity and credentials;
- production provider/network authority;
- multi-host distributed-consensus correctness;
- network-filesystem SQLite semantics;
- target-native sudden-power-loss durability;
- Windows production service-account/named-pipe hardening beyond hosted portable tests;
- hostile same-user/in-process/direct-SQLite isolation;
- native iPhone/device qualification;
- A-01 execution.

No such evidence is synthesized by this freeze.

## 11. Freeze decision

- RECOVER: **PASS**
- INVENTORY: **PASS**
- ANALYZE: **PASS**
- TARGETED RESEARCH: **PASS**
- ADJUDICATE: **PASS**
- DESIGN-LOCK: **PASS**
- BUILD: **PASS**
- ISOLATED QUALIFICATION: **PASS — 40/40**
- CUMULATIVE REGRESSION/CALIBRATION: **PASS — 425/425 observed Ubuntu Node 22; Ubuntu/Windows x Node 22/24 all successful**
- FREEZE: **PASS — HOSTED PORTABLE**
- PRODUCTION ACTIVATION: **`BLOCKED_EXTERNAL_SETUP`**

The durable claim renewal/revocation/fencing unit is therefore **FROZEN_HOSTED_PORTABLE** on exact executable subject `4b153057b971ff1978ef4db6e47ffcf2fdd3ccbb`.

## 12. Exactly one dependency-valid successor

The next Controller foundation operation is:

**`CONTROLLER-FOUNDATION-NEXT-C1-LEASE-RECOVERY-PROJECTION-001 — RECOVER CURRENT EVENT/REBUILD SEMANTICS -> INVENTORY CLAIM HISTORY + GENERATION + OPERATION-RECOVERY INVARIANTS -> TARGETED RECOVERY/FENCING RESEARCH -> ADJUDICATE NON-RESURRECTION LAW -> DESIGN-LOCK FRESH-STORE CLAIM PROJECTION + TEST DENOMINATOR`**

No scheduler, worker, execution-layer or provider build is authorized until that remaining foundation boundary is resolved or explicitly adjudicated out of dependency order.