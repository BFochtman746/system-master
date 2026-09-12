# CONTROLLER V2 — LEASE RECOVERY PROJECTION QUALIFICATION RECEIPT 001

Status: FROZEN / HOSTED-PORTABLE QUALIFIED
Working lineage: `controller-v2/foundation-006-c1-rebind`
Design lock: `FOUNDATION-NEXT-C1-LEASE-RECOVERY-PROJECTION-DESIGN-LOCK-001.md`
Exact executable subject qualified: `0c47bcc25bc5a009ccbeeec170eea5100007149a`
Predecessor durable-claim qualification subject: `4b153057b971ff1978ef4db6e47ffcf2fdd3ccbb`
C1 qualified activation-closure root: `a2ed4205cb7674b41f09db42fd9e687cdcf8eb2d`
Production Controller activation: `BLOCKED_EXTERNAL_SETUP`
Historical PASS transfer: `0`

## 1. Exact-subject hosted qualification

GitHub Actions workflow run `34685929533` checked out exact subject `0c47bcc25bc5a009ccbeeec170eea5100007149a` and completed successfully across the full configured hosted matrix:

- `windows-latest / Node 22` — PASS
- `windows-latest / Node 24` — PASS
- `ubuntu-latest / Node 22` — PASS
- `ubuntu-latest / Node 24` — PASS

The observed Ubuntu Node 22 job ran the current cumulative Controller v2 `node --test` suite and reported:

- tests: `461`
- pass: `461`
- fail: `0`
- cancelled: `0`
- skipped: `0`
- todo: `0`

This is hosted-portable evidence only. It is not production, target-native, device, distributed-filesystem, external-provider, human/delegation, or A-01 evidence.

## 2. Frozen isolated denominator

The exact run contains the frozen Lease Recovery Projection denominator `FREC-001` through `FREC-036`, all passing: **36/36**.

The qualified denominator proves the bounded design-lock obligations, including:

1. exact historical claim projection from durable `lease.granted` evidence;
2. immutable operation/resource/worker/generation binding;
3. contiguous resource generations with gap/duplicate rejection;
4. renewal ordering and previous-expiry validation;
5. renewal cannot change fencing generation or immutable claim identity;
6. revocation/release are terminal and mutually contradictory histories fail closed;
7. fresh-store disaster recovery creates **zero live lease rows**;
8. recovery preserves the fencing-generation floor without resurrecting a historical worker claim;
9. recovered RUNNING work becomes stale/reconcilable rather than silently ACTIVE;
10. replacement claims must be freshly acquired and advance the preserved generation;
11. recovery diagnostics expose bounded identity/fence facts only and never create execution authority;
12. the rebuilt durable journal remains sealed while live lease authority remains empty.

## 3. Reconciliation / retry law preserved

The frozen boundary continues the Controller reconciliation law:

- re-read durable current state on each reconciliation pass;
- converge desired and current state rather than assuming a remembered wakeup is truth;
- exact replay is idempotent;
- no read-after-write freshness assumption is required for authority;
- wakeups, worker liveness observations, chat/webhook metadata, caches and provider responses are hints/observations only;
- retries are allowed only for classified transient I/O/access failures, bounded by the owning layer with backoff/jitter and idempotency;
- integrity contradictions, generation gaps and semantic conflicts are permanent fail-closed outcomes, not retry candidates;
- no stacked semantic retry loop is introduced.

## 4. Authority fence

This freeze does not create or assume:

- scheduler-selection authority;
- worker identity or service-principal standing;
- delegation validity;
- human approval truth;
- provider execution authority;
- production GitHub control-state provisioning;
- native/device evidence;
- A-01 evidence;
- any CORE, LEARNING, BOOK or DOCUMENTS owner-control mutation.

Historical claim evidence is evidence. It can restore continuity facts and the fencing floor; it cannot prove a historical execution holder is still live.

## 5. Gate standing

- RECOVER: PASS
- INVENTORY: PASS
- ANALYZE: PASS
- TARGETED RESEARCH: PASS / design-changing questions resolved in predecessor design lock
- ADJUDICATE: PASS
- DESIGN-LOCK: PASS
- BUILD: PASS
- ISOLATED QUALIFICATION: PASS — `36/36`
- CUMULATIVE REGRESSION/CALIBRATION: PASS — full four-job hosted matrix; observed Ubuntu Node 22 `461/461`
- FREEZE: PASS

## 6. Dependency-valid successor

Do **not** enter scheduler/worker/execution implementation merely because lease recovery is qualified.

Exact next operation:

`CONTROLLER-FOUNDATION-C1-CLOSURE-CENSUS-001 — RECOVER + INVENTORY ALL REMAINING CONTROLLER FOUNDATION OBLIGATIONS ON THE C1-DERIVED LINEAGE -> REQUIREMENT/INVARIANT -> IMPLEMENTATION -> DURABLE STATE -> INTERFACE/CONTRACT -> TEST -> EVIDENCE -> ENVIRONMENT -> BLOCKER -> ADJUDICATE WHETHER FOUNDATION IS ACTUALLY CLOSED BEFORE ANY WORKER/SCHEDULER/EXECUTION BUILD`

If the census finds a real Foundation gap, bind that gap in dependency order. If and only if the census reaches unaccounted Foundation obligations = 0 with exact evidence, freeze the Foundation boundary and then admit the first worker/scheduler/execution recovery unit.
