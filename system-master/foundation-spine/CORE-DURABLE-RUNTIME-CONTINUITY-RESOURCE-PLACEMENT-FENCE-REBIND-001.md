# CORE Durable Runtime Continuity Resource / Placement / Fence Rebind 001

Status: RECOVER / INVENTORY / ANALYZE / ADJUDICATE / CONSUMER-SIDE DESIGN LOCK COMPLETE  
Resource Admission provider implementation: NOT FROZEN BY THIS UNIT  
Execution Placement provider implementation: NOT FROZEN BY THIS UNIT  
Durable Runtime fence ownership: DESIGN-LOCKED TO CURRENT SYSTEM SPECIFICATION  
Build: NOT AUTHORIZED YET  
Fresh current-subject qualification: NOT EXECUTED

Exact live Foundation owner reread immediately before mutation:

- `system-master/control-v2@54de1268b1036f966dd9235f5463e430ab1fcd19`
- isolated predecessor: `second-shift/core-durable-runtime-continuity-recovery-001-20260912@622f0b5e488f6994cc35ce7534b85a90148a820f`

## 1. Constitutional adjudication

The current `SYSTEM-SPECIFICATION.md` gives three separate authorities:

- **Resource Admission & Budgeting** owns budgets, admission, reservations, grants, accounting, release/reclaim, fairness/backpressure and bounded preemption selection. Final grants bind exact work, route, quantity, expiry and relevant fence/assignment identity.
- **Execution Placement** owns executor eligibility, feasibility, scoring, assignment, placement lease/assignment state, drain and safe reassignment. Placement consumes a route and resource grant and may not self-route, self-admit or self-authorize effects.
- **Durable Execution Runtime** owns durable Job/Attempt lifecycle, claim/start, timers/signals/cancellation/retries/checkpoints/heartbeats and the **runtime lease/fence** that prevents stale execution after reassignment/recovery.

Therefore the executor mutation fence for a running Attempt is not a Resource grant and is not an F-WP Change-private lease. The current architecture places runtime lease/fence truth in Durable Runtime. Placement owns which executor is assigned; Resource owns what capacity is granted; Runtime owns the monotonically fenced attempt authority that makes a current execution holder able to mutate Runtime-governed state.

Owner collision after this adjudication: **0 for Resource vs Placement vs Runtime fence semantics**.

## 2. Recovered substrate and current evidence

### G-WP RecoveryClaimStore

Recovered `g-wp-005` persistence carries strong reusable runtime mechanics:

- durable claim id, recovery id, work-unit id, claim epoch, claimant executor, lease expiry, fence epoch, renew/release lineage and semantic receipts;
- JVM lock plus OS lock-file exclusion for local hosted storage;
- checksum-verified append journal with `FileChannel.force(true)`;
- deterministic replay of max claim epoch and max fence epoch;
- semantic request receipts for claim/renew/release.

Disposition: **ADAPT / CONSOLIDATE** into the current Durable Runtime claim/fence state. Historical `workUnitId`, resource/placement assumptions and local-file locking do not become current Work/Placement/production contracts.

### F-WP ExecutionLeaseManager

Current F-WP source carries a monotonic epoch/fence-token mechanic, lease expiry, trusted-time gate and stale-executor rejection.

Disposition: **CONSOLIDATE / PROVENANCE FOR CURRENT FENCE AUTHORITY**. The mechanic is useful; the Change-private lease owner is not current architecture authority because Runtime now owns runtime lease/fence.

### PLATFORM-001 reconciliation

The current reconciliation record demonstrated an important monotonicity defect in historical runtime fencing: same/lower epoch became acceptable after the prior fence expired, while the persistence contract required strict monotonic increase. Its bounded candidate correction requires a candidate epoch to remain strictly greater than historical/current epoch even after lease expiry.

This invariant is adopted into the current design:

> **Lease expiry removes current usability; it never resets or permits reuse/regression of the fence generation.**

The PLATFORM-001 repaired candidate has local/portable evidence only and remains GitHub source-custody/target-evidence blocked. Its PASS is not transferred.

### PLATFORM-002 reconciliation

The current reconciliation record demonstrated a second critical distinction: an item in `RECONCILING` after an unknown external outcome was historically ordinary-claimable and could return to `RUNNING`, advancing attempt/fence before the prior effect was reconciled. The bounded candidate removed `RECONCILING` from ordinary claim paths and kept it in a distinct recovery backlog.

This invariant is adopted:

> **Unknown external-effect reconciliation is not an ordinary execution retry. `RECONCILING` cannot be claimed through the normal runnable queue until the authoritative reconciliation disposition permits a new attempt.**

Again, the local historical/candidate evidence is provenance and design evidence only, not current runtime PASS.

### F-WP resource-admission cross-domain ref

Current F-WP `CrossDomainContracts.ResourceAdmission` preserves useful foreign-ref semantics: admission identity, standing `ADMITTED | DEFERRED | REJECTED | UNKNOWN`, workload digest, capacity digest and expiry. F-WP requirements also require current, unexpired admission for system-impacting execution.

Disposition: **ADAPT SEMANTICS / PROVENANCE CONTRACT**. Resource Admission owns the eventual current grant schema; Runtime cannot promote the historical F-WP record into current grant authority.

## 3. Boundary design lock

### R1 — ResourceGrantRef (foreign Resource truth)

Minimum semantics Runtime may consume:

- immutable grant/reservation id;
- exact Resource authority id;
- Work/Job/route/assignment bindings required by the Resource contract;
- resource dimensions/quantity or opaque capacity digest/ref;
- issue/validity/expiry;
- current standing `GRANTED/ADMITTED | DEFERRED | REJECTED | REVOKED | EXPIRED | UNKNOWN` or current equivalent;
- grant generation/version/digest;
- relevant accounting/reclaim ref.

Runtime stores the exact foreign ref/digest. It does not alter budget, capacity, fairness or accounting truth.

### P1 — PlacementAssignmentRef (foreign Placement truth)

Minimum semantics Runtime may consume:

- immutable assignment id;
- exact executor identity/ref;
- exact route ref;
- exact Resource grant ref;
- exact Job/Attempt eligibility subject;
- placement lease/assignment standing and expiry if the Placement contract uses one;
- drain/reassignment generation;
- placement decision digest/version.

Runtime cannot select or score an executor merely because an old executor can still contact the system.

### F1 — RuntimeFence (Durable Runtime truth)

Owner-local semantics frozen:

- exact Job/Attempt lineage;
- strictly monotonic fence generation for that mutation authority lineage;
- current holder/claim binding;
- issue/acquire time;
- lease-until or current-use validity where a runtime lease is used;
- current/revoked/released standing;
- exact Placement assignment ref and Resource grant ref consumed at issuance where required;
- semantic receipt/version/digest.

**Monotonicity law:** once generation `n` has existed for the lineage, no future current fence may use `<= n`, even if the old lease expired, the process crashed, a record was restored from backup or the executor was reassigned.

### C1 — RuntimeClaim

Owner-local claim semantics:

- immutable claim id;
- exact Job/Attempt/RecoveryEpisode ref;
- exact current F1 fence;
- holder/executor ref matching current P1;
- lease-until/renew/release/revoke lineage;
- claim epoch/version;
- semantic idempotency receipt.

C1 proves only current Runtime claim standing. It does not prove Resource capacity, Placement eligibility, Identity authority or Effect permission.

## 4. Admission -> placement -> runtime claim sequence lock

For ordinary execution:

1. current Work/Plan step is ready through its owner;
2. Resource performs provisional/final admission as required and issues current R1;
3. Routing supplies the qualified route;
4. Placement consumes route + R1 and issues current P1;
5. Runtime re-reads current durable Job state and validates exact R1/P1/current Identity/Contracts/Keel prerequisites;
6. Runtime atomically issues/advances F1 and creates C1 for the exact Attempt;
7. executor mutation is accepted only with exact current C1/F1 and all required owner refs still valid at the boundary being exercised;
8. stale holder/fence fails closed;
9. Effect Authority independently authorizes consequential external effects at commit time.

No step grants the authority of a later/different step.

## 5. Reassignment and stale-actor lock

A placement reassignment must never let both old and new executors remain mutation-capable.

Required sequence semantics:

- old assignment is drained/revoked/superseded by Placement according to its contract;
- Runtime advances F1 monotonically before the replacement executor may mutate Runtime-governed Attempt state;
- the old executor's claim/fence remains permanently stale even if it returns after expiry/restart/network partition;
- the replacement executor receives a current P1 and current F1/C1;
- any late write/checkpoint/outcome/effect-observation carrying the old fence is rejected or quarantined as stale;
- a resource grant bound to the old assignment/fence cannot be silently rebound; Resource issues/revalidates according to its owner contract;
- external effects with ambiguous prior outcome remain under Effect reconciliation and cannot be made safe merely by assigning a new executor.

## 6. Resource expiry/reclaim lock

Resource standing and runtime fence standing are independent.

- R1 expiry/revocation removes resource authorization/capacity but does not reset F1 history;
- F1 expiry/release removes runtime mutation standing but does not itself reclaim Resource capacity;
- Resource reclaim after executor failure must respect the stale-fence boundary and any Effect/Recovery constraints needed to avoid duplicate unsafe mutation;
- UNKNOWN/deferred/rejected/stale resource standing cannot authorize ordinary start/resume;
- Runtime may request/reacquire capacity but cannot self-admit or mint a new grant;
- current Resource accounting remains external truth even if Runtime stores a ref/projection.

## 7. `RECONCILING` separation lock

When an Attempt reaches an unknown external-effect outcome:

- the Attempt/effect boundary enters `UNKNOWN/RECONCILING` according to the Runtime/Effect contract;
- ordinary runnable claim selection excludes that semantic state;
- the previous execution holder cannot use an ordinary renew/reclaim path to re-execute the effect;
- the current Runtime fence may be revoked/advanced as required to prevent stale mutation, but fence advancement alone does not resolve the effect;
- Effect Authority/provider reconciliation must produce the authoritative disposition;
- only an exact safe disposition such as confirmed-not-applied, plus current authorization/resource/placement standing, may make a **new** execution attempt eligible;
- reconciliation backlog telemetry remains distinct from ordinary queue depth.

## 8. Claim renewal / restart lock

For C1/F1 renewal and restart:

- renewal keeps the same fence generation only while the same exact claim/holder remains current and the current contract permits renewal;
- renewal never decreases or recreates a historical generation;
- release/revoke terminates the claim; reacquisition after termination uses a new monotonic fence generation when mutation authority changes/reacquires as required by the Runtime contract;
- after process restart, authoritative claim/fence history is reconstructed from durable state before any executor is considered current;
- a historical active-looking lease record is not sufficient if its current standing/expiry cannot be proven;
- local wall clock alone is not assumed trustworthy where the authoritative backend/lease contract requires a database/trusted-time source;
- a wakeup/heartbeat cannot resurrect an expired/revoked claim.

## 9. Persistence binding impact

The previously frozen TX2 Claim/Fence transaction is refined:

Atomically persist, under the selected current persistence backend:

- expected current claim/fence generation;
- next F1 generation/standing or same-generation valid renewal;
- C1 claim/renew/release/revoke record;
- exact consumed P1/R1 refs/digests where required;
- semantic request receipt;
- continuity evidence-intent where evidence-bearing.

TX3 Attempt Start must reject any mismatch among exact Attempt, P1 executor/assignment, R1 required capacity binding and current F1/C1.

The exact physical database/CAS/clock mechanism remains unbuilt and requires current backend/source custody and fresh qualification.

## 10. Qualification denominator

A current Resource/Placement/Runtime-fence integration must satisfy this **52-case minimum**, additive to the previously frozen obligations. This is a design/test obligation, not PASS evidence.

- Resource grant exact binding/current/unexpired/deferred/rejected/unknown/revoked behavior: **8**
- Placement assignment exact executor/route/grant binding and stale/drain/reassignment behavior: **6**
- Runtime fence strict monotonicity across expiry/release/restart/reassignment/restore: **10**
- claim acquire/renew/release/revoke/idempotency/restart: **8**
- old/new executor race and stale-write/checkpoint/outcome rejection: **8**
- `RECONCILING` excluded from ordinary claim/retry; safe disposition required: **6**
- resource reclaim only after safe fence/reconciliation boundaries: **4**
- authority separation: Resource does not place; Placement does not admit; Runtime does not self-route/self-admit; security/effect permission remain separate: **2**

Total: **52 cases**.

Non-shrinkable existing obligations remain:

- 80 continuity persistence cases;
- 48 Effect seam cases;
- 40 Evidence seam cases;
- 36 Transport consumer-seam cases;
- 40 Security seam cases;
- 42 recovered G-WP-008..015 requirement rows;
- all current Root/Identity/Contracts/Keel and later owner regressions.

Behavioral overlap must be cross-referenced, not misreported as independent evidence counts.

## 11. Current blocker ledger

- `BLOCKED_RESOURCE_ADMISSION_PROVIDER_NOT_CURRENT` — exact current Resource service/runtime schema is not freshly frozen here.
- `BLOCKED_PLACEMENT_PROVIDER_NOT_CURRENT` — exact current Placement service/runtime schema is not freshly frozen here.
- `BLOCKED_CURRENT_RUNTIME_BACKEND_SOURCE_CUSTODY` — PLATFORM-001/002 runnable corrected candidates remain source-custody obligations, not current GitHub-native implementation authority.
- `BLOCKED_RECOVERY_SOURCE_AUTHORITY` — Work/Project and Orchestration current semantic source/contract remains unresolved.
- `BLOCKED_ROUTING_INTERFACE_NOT_BOUND` — exact current Route receipt/service is unresolved.
- `BLOCKED_TRANSPORT_PROVIDER_SOURCE_CUSTODY` — generic Transport provider unresolved.
- `BLOCKED_EFFECT_AUTHORITY_IMPLEMENTATION_NOT_CURRENT` — current Effect provider unresolved.
- `BLOCKED_EVIDENCE_ASSURANCE_INTERFACE_NOT_BOUND` — current Evidence provider unresolved.
- `BLOCKED_SECURITY_PROVIDER_INTERFACE_NOT_BOUND` — current Security/Secrets provider unresolved.
- `BLOCKED_FRESH_QUALIFICATION_NOT_RUN` — no current implementation built against this design.
- `BLOCKED_NATIVE_A01_PRODUCTION_EVIDENCE_NOT_EXECUTED` — explicitly unclaimed.

## 12. Build gate

The owner boundary and F1/C1 semantics are now frozen enough to prevent an authority collision, but Runtime implementation remains **BLOCKED**. Building now would still require inventing concrete Resource/Placement/Route/Work/Plan/Transport/Effect/Evidence/Security foreign schemas and selecting a persistence backend whose live source is not yet in current GitHub-native custody.

Historical/local candidate PASS cannot substitute for those current contracts or target evidence.

## 13. One dependency-valid successor

**`CORE-DURABLE-RUNTIME-PLATFORM002-CUSTODY-RECOVERY-001`**

Recover the exact runnable PLATFORM-002 Durable Persistence + Work Runtime source/test/SQL surface into GitHub-native custody from its admitted carrier/provenance, preserving the immutable historical subject separately. Verify byte identity before applying any correction. Rebind the demonstrated `RECONCILING` ordinary-claim separation candidate as a new exact subject, then run fresh hosted qualification only after exact source custody is established. Do not claim target/A-01/production standing. In parallel evidence, recover PLATFORM-001 corrected fence-monotonicity source custody because Runtime fence correctness depends on the same non-regression law.

If Work/Project or Orchestration current authority appears before custody work begins, reread and reconcile it first because it can materially change Job/Attempt foreign-reference binding.

## 14. Evidence fence

This unit freezes the Resource/Placement/Runtime-fence owner boundary, monotonic fence invariant, `RECONCILING` separation and their qualification obligations. It claims no current Resource/Placement provider implementation, no current Runtime code change, no fresh PASS, no historical PASS transfer, no A-01/native/production evidence, no real provider/credential standing, no human/private/publication evidence and no specialist-system correctness.