# CORE-DURABLE-RUNTIME-PLATFORM002-CUSTODY-RECOVERY-001

**Date:** 2026-09-12  
**Lane:** Foundation / Spine — Durable Runtime / Continuity  
**Parent branch subject reread before mutation:** `second-shift/core-durable-runtime-continuity-recovery-001-20260912@7d4501bdca25d7bb3b9734077cf567e888db97d4`  
**Live owner/control reread before mutation:** `system-master/control-v2@54de1268b1036f966dd9235f5463e430ab1fcd19`  
**Status:** `BOUNDED_CURRENT_RUNTIME_CUSTODY_RECOVERED_AND_PORTABLE_REQUALIFIED__NO_NATIVE_A01_PRODUCTION`

## 1. Purpose

Close the material Durable Runtime backend source-custody uncertainty raised by `CORE-DURABLE-RUNTIME-CONTINUITY-RESOURCE-PLACEMENT-FENCE-REBIND-001` without promoting historical PLATFORM-002 proof, without claiming latest-original-source standing, and without taking Resource Admission, Placement, Transport, Effect, Evidence, Security, Work/Project, Orchestration, Book, Learning, Documents, or Programming semantic authority.

Historical PLATFORM-002 remains donor/provenance evidence. This unit asks a narrower current question: do we possess exact executable Durable Runtime bytes that are demonstrably the same bytes carried by the admitted bounded BUILD-FREEZE recovery baseline, and can those bytes be freshly portable-qualified?

## 2. RECOVER — admitted custody carrier

Recovered from the persistent evidence library:

- carrier: `SYSTEM_MASTER_HANDOFF_UAF_FOUNDATION003_A_CUSTODY_20260903.zip`
- carrier SHA-256 observed this unit: `05e272c840922c79a2e1010245736018ffed6f1038fbb60724968906ba0761f5`
- handoff package identity: `UAF-S1-FOUNDATION003-A-CUSTODY-001`
- handoff source subject: `eae0ebe3be9be02a3df47c88aa83daed55dd893eb302a44a964f5a76e8ef5d5c`
- payload files: `427`
- handoff instruction: verify manifest/version lock and F003 parity; do not execute live PostgreSQL/A-01 from a portable environment.

This carrier is not promoted to latest-original-source standing. The higher source-custody evidence still records the later FI-02D identity as known while its exact archive bytes are absent, so this remains a bounded recovery/rebase subject.

## 3. INVENTORY — exact Durable Runtime subjects

The carrier contains the current FOUNDATION-003 durable-runtime implementation, portable test surfaces, and SQL contract. The following exact subjects were independently hashed from the recovered bytes and then compared against `BUILD-FREEZE-BASELINE-000-CANDIDATE-WORKTREE-MANIFEST.json`:

| path | recovered SHA-256 | size | bounded BUILD-FREEZE identity |
|---|---|---:|---|
| `src/main/java/org/systemmaster/core/DurableRuntime.java` | `b65709daae808a7931c27e5782bb87cd19bf1b095b0b3fa6e47c6cfaf0d0bba7` | 13745 | exact match |
| `src/main/java/org/systemmaster/core/JdbcDurableRuntime.java` | `33e28b10b64e6ada6dcdbadd5fa3b5706d4141ebcf0e3fa0a87e68e3b335fdd9` | 102447 | exact match |
| `src/test/java/org/systemmaster/core/Foundation003AuthorityTests.java` | `af5935857c88ae59656f7764478c9504af131fe7cb1eef2412624f34e7cbcfa0` | 15717 | exact match |
| `src/test/java/org/systemmaster/core/Foundation003JdbcContractPortableTests.java` | `74482c3967c86aed3700c7d9201e64d6214a86114526b2788fef06c79ee787e4` | 11118 | exact match |
| `src/test/java/org/systemmaster/core/Foundation003JdbcQualification.java` | `e4559619530e274f6698a302e2afc14081f94dbb00da578620615e0014b7e266` | 8984 | exact match |
| `07_DATABASE/migrations/035_foundation_003_durable_semantics.up.sql` | `aaaec78a0478972beac57ed7a3a7b48aded1e748f934499acdab60b4c6de3bb8` | 15297 | exact match |
| `07_DATABASE/migrations/035_foundation_003_durable_semantics.down.sql` | `61474e8c3c0ae9a5c25d47f2a32888e2ad0eb350893dfaff8c18b55788292873` | 6946 | exact match |

The bounded BUILD-FREEZE manifest also identifies `src/test/java/org/systemmaster/core/Platform002AuthorityTests.java` as SHA-256 `61c512876c20c07a739803463b74b77516c09e5838182be58f2a838b7f28e9cf`, size `2236`; that exact file is not present in this FOUNDATION-003 scoped carrier. Its historical PLATFORM-002 test-byte custody therefore remains an explicit provenance residual, not a blocker to the newly demonstrated current FOUNDATION-003 portable qualification below.

## 4. ANALYZE / ADJUDICATE — historical PLATFORM-002 defect versus current bounded runtime

The earlier PLATFORM-002 reconciliation finding stated that an unknown-effect `RECONCILING` job could be treated as ordinary runnable work. That finding remains valid historical defect evidence and is retained as a recurrence requirement.

Direct inspection of the recovered current bounded `JdbcDurableRuntime` shows that the ordinary `claim(...)` candidate query now requires:

- `state='PENDING'`
- `recovery_required=false`
- availability and attempt bounds
- row locking with `FOR UPDATE SKIP LOCKED`
- fencing token increment on successful claim.

Therefore **the current bounded FOUNDATION-003 runtime bytes do not reproduce the historical PLATFORM-002 ordinary-claim defect**. `RECONCILING` work is not selected by the ordinary claim query. Recovery resolution is handled through the explicit recovery path. The historical defect is classified `PROVENANCE_ONLY / RECURRENCE_GUARD_INPUT` for the current backend rather than a reason to manufacture a new correction to already-correct bytes.

This materially changes the prior blocker interpretation: current Durable Runtime backend source custody is now closed for the exact FOUNDATION-003 runtime/test/SQL surface listed above, bounded to the recovery baseline. It does **not** close latest-source custody, live PostgreSQL qualification, current Resource/Placement provider contracts, or historical PLATFORM-001/002 byte archaeology.

## 5. DESIGN-LOCK — current ownership and safety boundary

The following remains frozen:

1. Durable Runtime owns durable Job/Attempt/recovery/checkpoint/timer/signal/event-outbox-inbox/idempotency runtime facts and runtime fencing.
2. Resource Admission owns capacity/grant/accounting truth. Current `JdbcResourceLedger` is reusable historical/current substrate but cannot absorb Resource Admission policy authority.
3. Placement owns executor eligibility/assignment/drain/reassignment. Runtime may validate a placement reference but may not create placement truth.
4. Routing, Transport, Effect Authority, Evidence/Provenance, Security/Delegation, Work/Project, and Orchestration remain separate owners.
5. `RECONCILING` is an explicit unknown-outcome state and is excluded from ordinary runnable claiming until authoritative recovery resolves it.
6. A lease expiry never proves an external effect did not commit and never resets/reuses fencing authority.
7. Historical PASS does not transfer to changed subjects or to target/native/A-01/production environments.

## 6. ISOLATED PORTABLE QUALIFICATION — fresh execution on recovered exact bytes

Environment observed:

- Linux `6.18.35` x86_64
- OpenJDK / `javac` `21.0.11`
- Python `3.13.5`
- no live PostgreSQL target invoked
- no A-01, device/native, production, external-provider, or human evidence invoked

Fresh results:

1. `python3 tools/verify_foundation003_contract_parity.py` — **PASS** all emitted FOUNDATION-003 parity gates, including implementation refs, declared capabilities, unknown-after-lease-expiry, bounded retry, live-unknown-outcome path contract, runtime durability markers, typed signal predicate, concurrency fencing, resource binding, DB contract/rollback, schemas/bindings, qualification registry, recurrence coverage, and inherited-promise reconciliation.
2. Strict Java 21 compilation of the exact FOUNDATION-003 declared Java implementation refs plus the two portable suites using `-Xlint:all -Werror` — **PASS**.
3. `org.systemmaster.core.Foundation003AuthorityTests` — **PASS, 24,253 assertions**.
4. `org.systemmaster.core.Foundation003JdbcContractPortableTests` — **PASS, 95 assertions**.

An intentionally over-broad compile attempt that included unrelated scoped `AgentAiGateway` / `JobAiGateway` sources failed because this bounded FOUNDATION-003 carrier does not include their external AI/model-gateway dependencies. That is a carrier-scope/dependency-selection failure, not a FOUNDATION-003 runtime test failure. Qualification was rerun against the declared FOUNDATION-003 implementation refs from `02_FOUNDATION/specs/FOUNDATION-003.json`, which is the correct isolated subject boundary.

No `Foundation003JdbcQualification` live database execution was performed; its target PostgreSQL/pgJDBC standing remains pending.

## 7. Lossless trace update for the recovered boundary

| requirement / invariant | current component | durable state | interface / contract | fresh test/evidence | environment | blocker |
|---|---|---|---|---|---|---|
| unknown effect outcome must not become ordinary runnable work | `JdbcDurableRuntime.claim` + recovery methods | `core_job.state`, `recovery_required`, `core_job_recovery` | `DurableRuntime.claim` + recovery API | current source inspection; F003 parity PASS; Authority 24,253 PASS; JDBC-contract 95 PASS | hosted/local portable Java 21 | live PostgreSQL/native/A-01 not executed |
| stale/expired execution cannot silently regain authority | `JdbcDurableRuntime` + `JobStateMachine` | lease owner/until + fencing token + attempt/recovery rows | claim/start/heartbeat/recovery contracts | same fresh portable evidence | portable Java 21 | current Placement/Resource foreign-provider binding not yet installed |
| checkpoint/recovery history is durable and fenced | `JdbcDurableRuntime` | `core_checkpoint`, `core_job_recovery` | checkpoint + recovery contracts | same fresh portable evidence + exact migration bytes | portable/static SQL contract | live PostgreSQL concurrency/restart proof pending |
| event/outbox and inbox/idempotency durability remain explicit | `JdbcDurableRuntime` | event/outbox/inbox/idempotency tables | durable event/outbox/inbox/idempotency APIs | parity + JDBC-contract PASS | portable/static | live DB crash/restart proof pending |
| historical PLATFORM-002 defect must not recur | current F003 claim path; recurrence registry | PENDING versus RECONCILING state distinction | ordinary claim vs recovery resolution | direct current-byte inspection + recurrence gate PASS | portable | historical original PLATFORM-002 test bytes remain provenance residual |

## 8. Cumulative standing / blockers

**Closed in this unit:**

- bounded current Durable Runtime backend source custody for the exact FOUNDATION-003 implementation/test/SQL surface above;
- exact byte identity of that surface against the admitted BUILD-FREEZE recovery baseline;
- fresh portable contract parity;
- fresh strict Java 21 compile of declared F003 implementation refs;
- fresh 24,253-authority and 95-JDBC-contract portable suites;
- direct adjudication that the historical PLATFORM-002 `RECONCILING` ordinary-claim defect is not present in the current bounded `JdbcDurableRuntime` bytes.

**Still open / fail closed:**

- latest-original-source claim: blocked by absent later FI-02D archive bytes;
- live PostgreSQL concurrency/restart/transaction qualification;
- target-native/device/A-01/production standing;
- concrete current Resource Admission and Placement provider schemas/adapters;
- current Effect/Evidence/Transport/Security integration implementation;
- Work/Project and Orchestration current-source authority recovery;
- exact historical PLATFORM-002 authority-test byte custody and PLATFORM-001 corrected-fence carrier custody, if needed for provenance closure.

No Book, Learning, Documents, Programming, or other specialist semantics were taken.

## 9. One dependency-valid successor

`CORE-DURABLE-RUNTIME-CONTINUITY-CURRENT-BACKEND-REBIND-001` — rebind the now byte-verified and freshly portable-qualified FOUNDATION-003 Durable Runtime substrate into the recovered 42-row G-WP-008..015 continuity census and current seam locks; classify every continuity row against current component/durable-state/interface/test/evidence/environment/blocker; preserve historical PLATFORM-001/002 findings as provenance/recurrence inputs; recover only the missing exact carrier bytes that materially affect a current binding; and do not begin runtime mutation until concrete current Resource Admission/Placement foreign contracts and the affected cumulative qualification denominator are frozen.

**No historical PASS transfer. No A-01. No native/device. No production. No external-provider standing.**
