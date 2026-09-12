# CORE Durable Runtime Continuity Persistence Recovery 001

Status: RECOVER / INVENTORY / ANALYZE / ADJUDICATE COMPLETE FOR RECOVERED PERSISTENCE SUBSTRATE  
Design lock: NOT YET AUTHORIZED  
Build: NOT STARTED BY THIS UNIT  
Fresh current-subject qualification: NOT EXECUTED

## 1. Exact authority and donor subjects

Live Foundation owner reread immediately before mutation:

- `system-master/control-v2@54de1268b1036f966dd9235f5463e430ab1fcd19`

Isolated continuity branch immediately before mutation:

- `second-shift/core-durable-runtime-continuity-recovery-001-20260912@f55375092ce2faf1c5d9692d48247c8259ad15f2`

Recovered persistence donor:

- `system-master/g-wp-007-a01@1e3354a0ceadb808fab54dcbb287a183d81d53d7`

The donor branch name contains `a01`, but this recovery unit treats it solely as repository provenance/source custody. It does **not** claim that A-01, native, target-device, production, human or external-provider evidence was executed or passed in this unit.

Controlling predecessors:

- `CORE-DURABLE-RUNTIME-CONTINUITY-RECOVERY-INVENTORY-001-R2.md` — recovered 42/42 G-WP-008..015 continuity requirements with `unaccounted_requirements = 0` for that bounded denominator.
- `CORE-DURABLE-RUNTIME-CONTINUITY-CONTRACT-REBIND-001.md` — binds currently frozen Root / Identity / Contracts / Keel dependencies and fails closed on unresolved Work/Orchestration/Resource/Route/Placement/Transport/Effect/Evidence/Security seams.

## 2. Persistence archaeology result

The strongest recovered pre-G-WP-008 continuity substrate is not one coherent modern database contract. It is a sequence of package-local durable stores and coordinators with increasingly strong crash/replay, integrity, idempotency and fencing mechanics.

That is useful substrate, but the current Foundation must **consolidate mechanics without promoting historical package-local semantic authority**.

The recovered persistence mechanisms are:

1. `ContinuityJournal` / `RecoveryRegistry` — identity + recovery-state/event journal.
2. `Gwp003Store` — interruption observation, classification and recovery-plan journal.
3. `CheckpointStore` — content-addressed checkpoint payloads, manifest journal and quarantine journal.
4. `RecoveryClaimStore` — claim/renew/release journal with claim and fence epochs.
5. `ResumeStore` — recorded decisions, execution attempts and outcome journal.
6. `Gwp007Store` — external-effect recovery item and reconciliation-receipt journal.

These are donor implementations. The current target may reuse/adapt their storage techniques, but Work, Plan, Resource grant, Placement, Transport delivery, Effect authorization, Evidence authority and Identity authority remain owned by their current Foundation owners.

## 3. Store-level lossless inventory

| Store / path | Historical durable facts | Physical durability / concurrency | Integrity / idempotency | Crash / replay behavior | Current owner disposition | Principal blockers |
|---|---|---|---|---|---|---|
| `g-wp-002/.../ContinuityJournal.java` | durable-work-identity frames; recovery open/transition frames; recovery events; active recovery by work; max recovery epoch; command receipts | single `continuity.journal`; process-local fair `ReentrantLock` plus OS `FileLock`; append frame then `FileChannel.force(true)` | frame magic + bounded length + SHA-256 payload hash; immutable identity check; monotonic recovery version/event sequence; command-id/digest collision rejection | full deterministic replay on every transaction/snapshot; any truncated/bad-magic/bad-hash/nonmonotonic frame fails as corrupt | **ADAPT / CONSOLIDATE** mechanics; do not retain historical `DurableWorkIdentity` as current Work truth | current Work authority/ID contract; current persistence boundary; fresh qualification |
| `g-wp-002/.../RecoveryRegistry.java` | recovery lifecycle state, recovery epoch, interruption ref, checkpoint/claim refs, external-effect uncertainty, blockers, evidence refs | delegates all mutations to journal transaction | expected-version OCC; legal state transition table; command semantic digest; one active recovery per work | restart reconstructs from journal; local retry is only for explicitly classified `TransientLocalTransactionException`; duplicate commands reconcile by digest | **ADAPT** as Durable Runtime recovery-state mechanics; remove any shadow Work lifecycle interpretation | Work/Orchestration contract; Evidence contract; current persistence schema |
| `g-wp-003/.../Gwp003Store.java` | interruption observations, recovery classifications, recovery-plan versions | append-only `gwp003-recovery-planning.journal`; synchronized JVM methods; append + `force(true)` | SHA-256 frame checksum; observation dedupe key/digest; plan input-state idempotency and monotonic plan version | constructor replays full file and rejects malformed frames/checksum mismatch/version gaps | **CONSOLIDATE / PARTLY PROVENANCE_ONLY**; observation/runtime classification may be reusable, but `RecoveryPlan` is not current Orchestrator authority | Orchestration authority unrecovered; current Work identity; persistence consolidation |
| `g-wp-004/.../CheckpointStore.java` | checkpoint payload bytes; checkpoint manifests; lineage/latest pointer; quarantine | content-addressed payload files; temp + fsync + atomic move when supported + directory force attempt; append manifest/quarantine journals with `force(true)`; process `ReentrantLock` | SHA-256 content address; existing-payload digest verification; monotonic checkpoint sequence; identical manifest idempotency; conflicting same sequence rejected | load reconstructs manifests/quarantine; corrupt manifest frame fails; latest quarantined checkpoint is excluded from resume pointer | **REUSE/ADAPT** low-level payload + lineage mechanics; compatibility truth moves behind current Contracts & Versioning; retention authority remains external | current persistence boundary; Contracts adapter; Security/retention policy; fresh crash qualification |
| `g-wp-005/.../RecoveryClaimStore.java` | recovery claim identity, claimant executor ref, claim epoch, lease expiry, fence epoch, renew/release state, semantic receipts | append `recovery-claims.log`; JVM lock plus separate OS-locked lockfile around load/decision/append; append + `force(true)` | per-frame SHA-256 checksum; max claim/fence epoch reconstruction; request receipt digests; coordinator enforces one current claim and current-fence assertions | complete journal replay reconstructs active/current claim and max epochs; corruption/checksum mismatch fails closed | **ADAPT / CONSOLIDATE** fencing and semantic-idempotency mechanics; historical executor/resource eligibility wrappers cannot become current Placement/Resource authority | Resource Admission and Placement contracts; Runtime lease contract; current persistence boundary |
| `g-wp-006/.../ResumeStore.java` | recorded decisions, execution attempts, deterministic start keys, outcomes, semantic receipts, max attempt | append `resume.log`; JVM lock + OS lockfile transaction; append + `force(true)` | SHA-256 frame checksum; decision/start/outcome receipt digests; coordinator binds current recovery, plan digest, fence and attempt identity | replay reconstructs all decisions/attempts/outcomes; coordinator reconciles repeated starts/results rather than blindly redispatching | **ADAPT / CONSOLIDATE** execution-attempt/idempotency mechanics; historical Plan/Resource/Verification/Transition authorities remain external | Orchestrator, Resource Admission, Evidence/Assurance, runtime placement/fence contracts |
| `g-wp-007/.../Gwp007Store.java` | external-effect recovery items, idempotency-key index, reconciliation receipts and observed result state | single locked `gwp007-effects.journal`; OS `FileLock` over read/decision/append; append + `force(true)` | SHA-256 line checksum; effect id/idempotency semantics enforced by coordinator; receipt keyed by effect + observation digest | full replay on transaction; truncated/checksum/unknown frame fails closed; UNKNOWN/PENDING/DIVERGED remain blocking states | **ADAPT / CONSOLIDATE** effect-reconciliation mechanics only; current Effect Authority owns permission/commit semantics | exact Effect Authority contract; Transport/provider query contract; Evidence contract; fresh qualification |

## 4. Strong reusable mechanics

The recovered substrate contains several mechanics that should be preserved unless current-contract evidence gives a reason to replace them:

- append-before-return with `FileChannel.force(true)` for authoritative journal frames;
- checksum/digest verification before replaying durable frames;
- deterministic full replay that rebuilds derived maps rather than trusting mutable caches;
- expected-version or monotonic-sequence checks for concurrent semantic mutation;
- semantic idempotency keyed by command/request/start/effect identity plus digest, with same-key/different-payload conflict rejection;
- explicit fence epochs and current-fence checks around runtime execution claims;
- content-addressed checkpoint payload bytes with temp-write/fsync/move before manifest commitment;
- quarantine rather than silent acceptance of corrupt checkpoint state;
- explicit UNKNOWN/PENDING/DIVERGED external-effect states and reconcile-before-reissue;
- restart rediscovery from durable state rather than relying on in-memory wakeups.

These mechanics align with the current constitutional rules: durable state outranks transport hints, UNKNOWN is real state, authority cannot be inferred from a prior attempt, and duplicate delivery/execution attempts must reconcile idempotently.

## 5. Mechanics that are insufficient as current production contracts

Recovery also found important limitations that must not be hidden by the historical qualification lineage:

- `Gwp003Store` uses Java `synchronized` only and no OS file lock; it is not evidence of safe multi-process coordination.
- The several package-local journals do not form one atomic transaction across recovery state, checkpoint state, claim/fence state, resume state and effect-reconciliation state.
- Most append-only stores validate individual frames/lines but do not prove a single cross-store commit protocol.
- The donor uses local filesystem durability semantics; this unit has not executed sudden-power-loss, network/distributed filesystem, target-device or production storage qualification.
- Checkpoint directory forcing is best-effort (`forceDir` swallows exceptions), so native filesystem durability must be qualified separately rather than inferred.
- File locks establish host/filesystem-local exclusion only; they are not evidence of distributed lease authority.
- Historical authority wrappers (`RecoveryAuthority`, `ClaimAuthorities`, `ResumeAuthorities`, effect `Authorizer`, retention authority, compatibility authority) predate the current owner map and cannot be promoted wholesale.
- Historical `DurableWorkIdentity` and recovery-plan records contain fields that now belong to Work/Project and Orchestration; they must become opaque foreign references or owner-issued receipts, not duplicate truth.

## 6. Requirement traceability impact

This persistence recovery strengthens the 42-row inventory without changing its denominator.

Direct persistence support exists for these later-recovered clusters:

- checkpoint compatibility/history/integrity: `G-RQ-021, G-RQ-024, G-RQ-035, G-RQ-051..061` where applicable to checkpoint/recovery integrity and authorization;
- recovery/evidence/reconnect: `G-RQ-014, G-RQ-015, G-RQ-049, G-RQ-050, G-RQ-062..064` through durable recovery state, attempt history and reconcile-before-recommand mechanics;
- retry/resource/fencing continuity: `G-RQ-041, G-RQ-042, G-RQ-044, G-RQ-057..061, G-RQ-065..068` through runtime retry/claim/fence mechanics, while actual resource/placement authority remains external;
- qualification/evidence classification: `G-RQ-071..074` remains qualification/traceability work and receives **no PASS transfer** from these donor stores.

The earlier G-WP-001..007 requirement files also contain requirements outside the 42-row later-package denominator. They are additional archaeology evidence and will be reconciled against the full Foundation census before any claim that the entire historical continuity requirement space is lossless. This artifact therefore deliberately does **not** claim `G-RQ-001..076 = 76/76`.

## 7. Writer/read-path adjudication

The current design must reduce historical semantic writers, not multiply them.

- Recovery lifecycle writes may be owned internally by Durable Runtime only for **runtime recovery state**, not Work/Project lifecycle.
- Interruption observations may be stored as runtime observations; recovery planning must consume current Orchestrator decisions rather than create a parallel Plan authority.
- Checkpoint bytes/manifests may be continuity-owned runtime state, but structural compatibility decisions come from Contracts & Versioning and security/retention rules come from their owners.
- Claim/fence state may be continuity/runtime execution state only after exact boundary with Placement and Resource Admission is frozen.
- Attempt and deterministic-decision history may be continuity-owned execution state; Plan identity, resource admission, actor authority and verification truth are foreign owner refs.
- Effect reconciliation state may record runtime knowledge of an external effect, but Effect Authority owns whether the effect is permitted and what constitutes an authoritative commit/result receipt.

## 8. Current persistence target — adjudicated shape, not design lock

A safe current normalization target is one **Durable Runtime Continuity persistence boundary** with separate appendable record families under one explicit durability/concurrency contract:

- recovery episode/event records;
- checkpoint manifest/payload refs;
- runtime claim/fence records;
- execution attempt/decision/outcome records;
- signal/timer/cancel reconciliation cursors;
- external-effect reconciliation records;
- continuity evidence-outbox refs;
- legacy migration receipts.

Foreign semantics must be stored as immutable/opaque exact refs with owner/digest/version/freshness where available:

- Work/Project and Goal/Keel refs;
- Identity/Delegation validation refs;
- Orchestrator Plan/Step refs;
- Resource grant/budget refs;
- Route and Placement refs;
- Transport delivery refs;
- Effect Authority intent/commit refs;
- Evidence/Assurance refs.

This is an **adjudicated normalization direction**, not a frozen physical schema. The unresolved current owner contracts prevent exact foreign-key schemas, atomic transaction groups and retention/security classifications from being finalized.

## 9. Transaction / crash-safety questions that remain open before design lock

The next design unit must explicitly answer, using current authority rather than donor assumptions:

1. which record families must commit atomically together and which may be eventually reconciled by durable outbox/inbox;
2. what the single current OCC/CAS primitive is and which version/fence protects each mutation;
3. whether the current authoritative backend remains local-file based or is an abstract durable-state port with local-file qualification adapter;
4. what a crash between checkpoint payload persistence and manifest commit means, and how orphan cleanup is authorized;
5. what a crash between external effect and local receipt persistence means, preserving `UNKNOWN/RECONCILING` until Effect Authority resolves it;
6. how claim/fence recovery avoids resurrecting an old executor after restart;
7. how corrupted/truncated records are quarantined while preserving unaffected immutable history;
8. how evidence/outbox writes are coupled to semantic state without creating a second business truth store;
9. how schema/version migration remains bound to current Contracts receipts;
10. which filesystem/database/native properties require environment-specific qualification rather than portable inference.

## 10. Blocker ledger

- `BLOCKED_RECOVERY_SOURCE_AUTHORITY` — Work/Project and Orchestration current semantic contracts are not yet recovered/frozen.
- `BLOCKED_RESOURCE_ADMISSION_INTERFACE_NOT_BOUND` — recovered resource adapters cannot mint current grants.
- `BLOCKED_ROUTING_PLACEMENT_INTERFACE_NOT_BOUND` — recovered claim/fence mechanics cannot define current assignment truth.
- `BLOCKED_TRANSPORT_REDISCOVERY_CONTRACT_NOT_BOUND` — no current exact Transport inbox/outbox/replay contract frozen for this runtime.
- `BLOCKED_EFFECT_AUTHORITY_RECONCILIATION_CONTRACT_NOT_BOUND` — effect reconciliation mechanics cannot authorize effects.
- `BLOCKED_EVIDENCE_ASSURANCE_INTERFACE_NOT_BOUND` — current evidence writer/outbox/qualification contract needs exact binding.
- `BLOCKED_SECURITY_POLICY_BINDING_NOT_BOUND` — exact current secret/privacy/crypto/retention constraints are not frozen here.
- `BLOCKED_CURRENT_PERSISTENCE_INTERFACE_NOT_BOUND` — physical backend/port/transaction grouping not design-locked.
- `BLOCKED_FRESH_QUALIFICATION_NOT_RUN` — no changed current-subject runtime exists to qualify.
- `BLOCKED_NATIVE_A01_PRODUCTION_EVIDENCE_NOT_EXECUTED` — no such evidence is claimed.

## 11. Dependency-valid successor

**`CORE-DURABLE-RUNTIME-CONTINUITY-PERSISTENCE-NORMALIZATION-001`**

Adjudicate the current internal continuity persistence model from the recovered stores without building it yet. Define record-family ownership, immutable keys, opaque foreign refs, atomic transaction boundaries, OCC/fence primitives, idempotency receipts, corruption/quarantine semantics, crash points, durable outbox coupling and migration/version gates. Re-read the live owner and all newly available peer contracts first. Freeze only those portions whose current owners are available; leave Work/Orchestration/Resource/Route/Placement/Transport/Effect/Evidence/Security foreign fields explicitly unbound rather than inventing them. Produce a precise isolated + cumulative qualification denominator before implementation.

If a newer Work/Project or other peer contract has appeared, it must be rebound before this successor freezes its corresponding field/interface.

## 12. Evidence fence

This artifact is repository archaeology and current ownership adjudication only. It claims no new runtime implementation, no current runtime PASS, no historical PASS transfer, no A-01/native/production standing, no target-device result, no real credential/provider authority, no human evidence, and no Book/Learning/Documents/Programming specialist semantics.