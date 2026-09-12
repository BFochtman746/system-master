# CONTROLLER V2 — EXECUTION-001A WORK GRAPH + ELIGIBILITY QUALIFICATION RECEIPT 001

Status: **FROZEN / HOSTED-PORTABLE QUALIFIED**
Working lineage: `controller-v2/foundation-006-c1-rebind`
Design lock: `EXECUTION-001A-WORK-GRAPH-ELIGIBILITY-DESIGN-LOCK-001.md`
Exact executable subject qualified: `0991aeb39a1de71d1755ed6e5f5039ae6f3a7a05`
Foundation executable predecessor: `0c47bcc25bc5a009ccbeeec170eea5100007149a`
Foundation closure evidence: `FOUNDATION-C1-CLOSURE-CENSUS-001.md`
C1 qualified activation-closure root: `a2ed4205cb7674b41f09db42fd9e687cdcf8eb2d`
Production Controller activation: `BLOCKED_EXTERNAL_SETUP`
Historical PASS transfer: `0`

## 1. Exact-subject qualification

GitHub Actions workflow run `34688287774` checked out exact subject `0991aeb39a1de71d1755ed6e5f5039ae6f3a7a05` and completed successfully across the required hosted matrix:

- `ubuntu-latest / Node 22` — PASS
- `ubuntu-latest / Node 24` — PASS
- `windows-latest / Node 22` — PASS
- `windows-latest / Node 24` — PASS

The exact subject contains the frozen GEL denominator plus the predecessor Controller suite. The resulting cumulative denominator is **509/509 passing** on the qualified subject: predecessor cumulative `461` plus GEL `48`, with zero denominator shrinkage.

This is hosted-portable evidence only. It is not production, target-native, device, real distributed-filesystem, external-provider, human/delegation, or A-01 evidence.

## 2. Frozen isolated denominator

`GEL-001` through `GEL-048`: **48/48 PASS**.

The exact-subject denominator proves the design-lock obligations for:

- schema-v5 -> schema-v6 migration and rollback behavior;
- durable same-transaction dependency edges;
- content-addressed dependency identity and exact replay;
- dependency mutation-window freezing;
- self/direct/indirect cycle rejection with no partial commit;
- deterministic success-only dependency eligibility;
- explicit waiting versus terminal-blocked dependency standing;
- guarded `PLANNED -> READY` transition using a fresh durable reread;
- lost/duplicate wakeup tolerance;
- exact event binding and fresh-store graph reconstruction;
- projection non-authority;
- deliberate exclusion of priority/stage semantics from eligibility identity;
- no worker spawn, scheduler timer, provider call, specialist-system dependency, alternate claim authority, alternate admission authority, alternate effect authority, or journal-seal authority in the graph layer.

## 3. Qualification-attempt history retained, not hidden

Two earlier exact subjects were intentionally **not** promoted to PASS:

### Attempt A — `cdf5e4485ff9b8cbfbdded8db528eaacf4f62cab`

Workflow run `34688117106` exposed two qualification-fixture defects while predecessor runtime tests remained healthy:

1. GEL-040 compared randomly generated operation identities across separately created graphs rather than checking deterministic ordering within each graph;
2. GEL-047 mutated a prerequisite row directly to `SUCCEEDED`, so journal recovery correctly lacked a semantic success event and restored the predecessor state instead of the fixture's direct-SQL shortcut.

Those fixture defects were repaired without weakening runtime requirements.

### Attempt B — `d72b19ecf852fb4cbf71b26d9d7742f794c95392`

Workflow run `34688182925` reached logical test success, including **509 passing / 0 failing** in the affected Windows test process, but the Windows jobs exited nonzero because the deliberate migration-failure fixture left a file-backed SQLite handle unreachable after constructor failure, and test cleanup then hit a Windows `EPERM` resource lock.

The migration rollback test was repaired to exercise the same failure/rollback semantics on an already-open in-memory predecessor kernel. This removed the test-mechanism resource leak; it did not relax migration atomicity, integrity or rollback requirements.

Only the later exact subject `0991aeb39a1de71d1755ed6e5f5039ae6f3a7a05` with workflow run `34688287774` is promoted by this receipt.

## 4. Frozen execution-graph authority boundary

EXECUTION-001A owns only:

- immutable same-transaction operation dependency identity;
- cycle-fenced dependency admission;
- success-only prerequisite standing;
- deterministic dependency eligibility from current durable truth;
- guarded readiness transition;
- dependency semantic-event/recovery projection.

It does **not** own:

- semantic command admission;
- transport authorization;
- human/principal/delegation truth;
- worker enrollment or service-principal standing;
- priority/stage policy;
- resource placement/capacity policy;
- claim/lease/fencing authority;
- dispatch authority;
- provider effects;
- specialist-system semantics;
- qualification/promotion truth.

Those remain frozen predecessor or later-layer owners.

## 5. Reconciliation law preserved

The qualified boundary preserves the controlling reconciliation discipline:

1. reread current durable state before deciding eligibility or committing READY;
2. converge desired/current state instead of trusting wakeup order;
3. content-addressed exact edge replay is idempotent;
4. no read-after-write freshness assumption establishes authority;
5. wakeups/chat/webhook metadata/caches/projections are hints only;
6. integrity, scope, cycle, state and identity contradictions fail closed;
7. retries are permitted only for classified transient infrastructure failures, use the same semantic identity, remain finite/bounded with backoff/jitter, and reread before retry;
8. no stacked scheduler/claim/IPC/provider retry layer is introduced by this boundary.

## 6. Gate standing

- RECOVER: **PASS**
- INVENTORY: **PASS**
- ANALYZE: **PASS**
- TARGETED RESEARCH: **PASS — design-changing dependency/eligibility questions resolved before build**
- ADJUDICATE: **PASS**
- DESIGN-LOCK: **PASS — GEL-001..048 frozen before implementation**
- BUILD: **PASS**
- ISOLATED QUALIFICATION: **PASS — 48/48**
- CUMULATIVE REGRESSION/CALIBRATION: **PASS — 509/509; Ubuntu/Windows x Node 22/24**
- FREEZE: **PASS — HOSTED PORTABLE**
- PRODUCTION/NATIVE/A-01: **NOT CLAIMED**

## 7. Blockers explicitly carried forward

The following remain external/later-layer evidence rather than silently synthesized authority:

- mechanically authoritative worker/service identity and enrollment;
- delegation validity/revocation;
- real human approval/consent;
- production policy correctness;
- provider credentials and real provider execution/observation behavior;
- production secret custody/rotation;
- network/shared-filesystem or distributed multi-controller correctness;
- target-native sudden-power-loss/filesystem behavior;
- Windows production service-account hardening beyond hosted qualification;
- iPhone/device-native qualification;
- production activation;
- A-01 evidence.

## 8. Exactly one dependency-valid successor

The graph/eligibility boundary does **not** authorize a polling scheduler or worker runtime by inference.

Exact next operation:

`CONTROLLER-EXECUTION-001B-WORKER-CAPABILITY-DISPATCH-DEPENDENCY-RECOVERY-INVENTORY — RECOVER CURRENT + HISTORICAL WORKER ENROLLMENT/CAPABILITY/DELEGATION-INPUT AND DISPATCH-INTENT REQUIREMENTS -> KEEP IDENTITY/DELEGATION AS EXTERNAL EVIDENCE -> INVENTORY CONTROLLER-OWNED OPAQUE BINDING/FENCING/RECONCILIATION CONTRACTS -> REQUIREMENT/INVARIANT -> IMPLEMENTATION -> DURABLE STATE -> INTERFACE/CONTRACT -> TEST -> EVIDENCE -> ENVIRONMENT -> BLOCKER -> TARGETED RESEARCH/ADJUDICATION -> BIND AT MOST ONE FIRST DESIGN UNIT`

Hard fences for the successor:

- no worker spawning/provider execution before identity/capability/dispatch dependencies are design-locked;
- no mutable chat/webhook/heartbeat metadata may become worker semantic authority;
- no alternate admission, claim, fence, effect or journal authority;
- no scheduler ordering may make ineligible work eligible;
- no CORE/LEARNING/BOOK/DOCUMENTS specialist semantics;
- no historical A-01/supervisor PASS transfer.
