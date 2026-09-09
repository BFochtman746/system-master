# PLATFORM002-RECONCILIATION-001

Status: HISTORICAL_AUTHORITY_RECOVERED / ORDINARY-CLAIM-RECONCILIATION BINDING GAP PROVEN / BOUNDED CANDIDATE LOCAL PASS / GITHUB SOURCE CUSTODY REQUIRED / TARGET EVIDENCE REQUIRED
Date: 2026-09-09
Repository: BFochtman746/system-master
Control branch: system-master/control-v2

## Engineering framing

This is a system-construction and qualification record. The objective is durable work correctness: ordinary execution, uncertain external outcomes, recovery backlog, fences, attempts, persistence and telemetry must express compatible state semantics. Historical defect/failure labels remain qualification taxonomy and are not the purpose or characterization of System Master.

## Authority

Packet: SYSTEM-MASTER-REBUILD-010
Authority: PLATFORM-002
Version: 0.11.0
Scope: Durable Persistence + Work Runtime Authority
Historical exact source+test subject:
`161d66c3b7179fa365472b28f59841effcbba4a7151cce75c0711c4dad7abe3e`
Historical standing: SEALED_PORTABLE_PASS / HISTORICAL_SEALED
Production admitted: NO
Target gate: PC-ENDGAME-017
Historical successor: SYSTEM-MASTER-REBUILD-011 / PLATFORM-003

## Recovered carrier

Library carrier:
`SYSTEM_MASTER_REBUILD_010_DURABLE_PERSISTENCE_WORK_RUNTIME_FOUNDATION_20260831.zip`
Size: 37,142,832 bytes
SHA-256 independently recomputed:
`9b1284e08c3c5ede747ebe23f4f6778ce304de4d7c76811b2ca55c5ac0ebda9d`

The recomputed digest matches the preserved provenance and verification sidecars. The ZIP integrity test reports no compressed-data errors.

Preserved historical evidence states:
- strict Java 21 compile: PASS, 159 production / 10 test sources;
- Java executable suites: 10/10 PASS;
- PLATFORM-002 focused campaign: 110,034 checks PASS;
- contract parity: 10/10 PASS;
- PostgreSQL static contract: 8 durable objects PASS;
- reconstructed R014 material areas: 7/7 PASS;
- system coherence: 25 authorities / 315 capabilities / 122 routes / 17 target deferrals PASS;
- engineering congruence: 22 authoritative concerns / 0 exceptions PASS;
- release manifest: 537/537 PASS;
- deterministic archive reconstruction: BYTE_IDENTICAL_PASS;
- fresh extraction: FULL_REPLAY_PASS;
- production certification: false.

## Historical subject replay

The recovered historical bytes were replayed locally before modification using OpenJDK/javac 21.0.11.

Results:
- strict `javac --release 21 -Xlint:all -Werror`: PASS;
- PortableFoundationTest: PASS, 15;
- FOUNDATION-002: PASS, 8,127;
- FOUNDATION-003: PASS, 20,009;
- FOUNDATION-004: PASS, 10,017;
- FOUNDATION-006: PASS, 20,019;
- FOUNDATION-007: PASS, 20,010;
- FOUNDATION-008: PASS, 30,038;
- DATA-001: PASS, 40,033;
- PLATFORM-001: PASS, 60,042;
- PLATFORM-002: PASS, 110,034;
- PLATFORM-002 contract parity: 10/10 PASS;
- PLATFORM-002 SQL contract: 8/8 PASS;
- R014 reconstructed recurrence: 7/7 PASS;
- exact historical source+test digest independently reproduced as `161d66c3b7179fa365472b28f59841effcbba4a7151cce75c0711c4dad7abe3e`.

## Demonstrated ordinary-claim / reconciliation-backlog inconsistency

The architecture distinguishes an uncertain external outcome from a normal retry. `Platform002Authority.unknownCommit(...)` moves a RUNNING item to `RECONCILING`, invalidates the prior fence, and `recoveryDecision(...)` returns `RECONCILE` with the reason `unknown commit requires evidence-based reconciliation`.

Current repository authority also states that an UNKNOWN external effect is not equivalent to NOT_APPLIED and ordinary retry is blocked until reconciliation establishes a safe disposition (`F-RQ-028` in `system-master/f-wp-007/control/REQUIREMENTS.json`).

The recovered PLATFORM-002 historical implementation nevertheless placed `RECONCILING` in the ordinary claim set in all of these places:
- `DurableWorkRecord.claimableAt(...)`;
- `InMemoryDurableRuntimeStore.claimNext(...)` through `claimableAt(...)`;
- `JdbcDurableRuntimeStore.claimNext(...)` SQL;
- PostgreSQL ordinary-claim index;
- PostgreSQL transition guard allowed `RECONCILING -> RUNNING`;
- queue-depth / oldest-queue telemetry counted reconciliation backlog as ordinary claimable queue.

Executable probe against the unmodified historical subject:
1. submit a SIDE_EFFECT work item;
2. ordinarily claim it as attempt 1 / fence 1;
3. mark the external outcome unknown, producing `RECONCILING` / fence 2;
4. call ordinary `claimNext(...)` again.

Observed historical behavior:
- state after unknown: `RECONCILING`;
- ordinary claim after unknown: PRESENT;
- resulting state: `RUNNING`;
- attempts: 2;
- fence: 3.

Therefore an item explicitly routed to reconciliation could immediately re-enter the normal execution queue without a separate reconciliation disposition. That collapses two different system states and can permit repeated execution where the prior external outcome is still unknown.

## Bounded correction candidate

Patch:
`system-master/control-v2/PLATFORM002_RECONCILING_ORDINARY_CLAIM_REPAIR_001.patch`

Patch SHA-256:
`a868ff69d16857054ec708c1ab868e3a709726bb8385eda25e11590d1131b138`

Correction:
- ordinary `claimableAt(...)` now includes only QUEUED and WAITING;
- JDBC ordinary claim selects only QUEUED and WAITING;
- the PostgreSQL ordinary-claim index excludes RECONCILING;
- the SQL state guard no longer permits RECONCILING -> RUNNING through the ordinary execution transition;
- RECONCILING remains separately visible as `recovery_backlog` and is removed from ordinary queue depth/oldest-queue-age metrics;
- the packet contract now states the distinction explicitly;
- focused tests prove a RECONCILING item cannot be reclaimed by ordinary execution and remains represented in recovery backlog;
- SQL and recurrence qualification scripts now fail if the separation regresses;
- the DATA-001 migration manifest is rebound to the candidate SQL digest.

This bounded correction does not claim that live external-outcome reconciliation has been target-qualified. It establishes the portable state separation required before that target exercise.

## Corrected-candidate qualification

All results below are local qualification of recovered bytes plus the bounded candidate correction. They are not A-01 evidence and are not target-PC evidence.

- strict Java 21 compile: PASS;
- PortableFoundationTest: PASS, 15;
- FOUNDATION-002: PASS, 8,127;
- FOUNDATION-003: PASS, 20,009;
- FOUNDATION-004: PASS, 10,017;
- FOUNDATION-006: PASS, 20,019;
- FOUNDATION-007: PASS, 20,010;
- FOUNDATION-008: PASS, 30,038;
- DATA-001: PASS, 40,033;
- PLATFORM-001: PASS, 60,042;
- PLATFORM-002: PASS, 110,036;
- PLATFORM-002 contract parity: PASS, 10/10;
- PLATFORM-002 SQL contract: PASS, 8 durable objects;
- R014 reconstructed material areas: PASS, 7/7;
- exact candidate source+test identity: PASS;
- system coherence: PASS, 25 authorities / 315 capabilities / 122 routes / 17 target deferrals;
- engineering congruence: PASS, 22 authoritative concerns / 0 exceptions;
- candidate release manifest: PASS, 537/537 entries.

New candidate exact source+test subject:
`1f0dc131b2599c94766a691a9f519eabde435fba6979274c7197497005cdb5f5`

Candidate release-manifest SHA-256 after local rebinding:
`74aec5b165f20fa332c65d9df02862f9048da265e677933b07ce8d935f6e1875`

Candidate CURRENT-AUTHORITY file SHA-256 after local candidate-artifact rebinding:
`356e895d77ebd76a779eb4ff4ab28110d8be49ef320d09501e657d5e08811474`

The historical subject remains `161d66c3...` and remains immutable historical evidence. It must not be used as qualification authority for changed candidate `1f0dc131...`.

## Evidence classification

### VERIFIED_CURRENT_LOCAL_FROM_RECOVERED_BYTES
- carrier digest and ZIP integrity verified;
- historical exact subject and historical portable suite reproduced before correction;
- ordinary reclaim of RECONCILING work reproduced executably;
- correction separates ordinary execution queue from reconciliation backlog in Java, JDBC SQL, PostgreSQL transition/index semantics and telemetry;
- corrected candidate passes the full available portable regression/parity/coherence/congruence set;
- candidate identity is deterministic and distinct from the historical subject.

### HISTORICAL_SEALED
- historical SYSTEM-MASTER-REBUILD-010 portable PASS;
- exact subject `161d66c3...`;
- 110,034 historical PLATFORM-002 focused checks;
- 10/10 contract parity;
- 8-object SQL contract;
- 7/7 reconstructed R014 material-area recurrence;
- 537/537 historical release manifest;
- deterministic packaged-byte replay.

Historical PASS remains valid for its tested historical subject and scope. It does not qualify the corrected candidate.

### SOURCE_CUSTODY_GAP
The runnable PLATFORM-002 source/test/SQL/qualification surface is durable in Library custody but is not exposed as ordinary current GitHub source. Current repository code search does not expose `Platform002Authority`.

Therefore the corrected runnable implementation cannot be described as already integrated current repository code. The exact patch and reconciliation evidence are preserved on `system-master/control-v2` pending source-custody import.

### CAPABILITY / INTEGRATION OBLIGATION
`PLATFORM002-RECONCILIATION-QUEUE-SEPARATION-001`: import the recovered runnable source into GitHub-native custody, apply the exact candidate correction, reproduce `1f0dc131...`, and run fresh hosted qualification.

A separate evidence-backed reconciliation disposition remains distinct from ordinary execution claim. This record intentionally does not invent a live external-effect result or relabel a retry as reconciliation.

### TARGET EVIDENCE REQUIRED — PC-ENDGAME-017
Still requires actual target evidence including:
- exact PostgreSQL 18.6 + pgJDBC 42.7.13 + target Java runtime identity;
- live concurrent deterministic `FOR UPDATE SKIP LOCKED` claims;
- database-clock lease/fence behavior under races;
- bounded JDBC pool/connect/socket/statement/lock/idle-in-transaction behavior;
- process kill/restart while claiming, heartbeating, checkpointing, dispatching and reconciling;
- transactional outbox ordering/inbox dedupe under commit/rollback/crash windows;
- checkpoint recovery across restart;
- timer/signal recovery across restart;
- unknown external-commit reconciliation without duplicate effect;
- poison/exhausted work operator recovery;
- DB/provider saturation and mixed-workload boundedness/fairness;
- watchdog/cancellation/lease cleanup for hung work/provider calls;
- measured queue/claim/checkpoint/retry/dead-letter/pool/recovery telemetry;
- Windows reboot continuation for representative long work;
- virtual-thread behavior if adopted;
- production admission only after its actual gates pass.

Portable state/contract qualification is not live target execution or production qualification.

## Exact successor decisions

### PLATFORM002-CUSTODY-REPAIR-IMPORT-001
Import the exact recovered historical runnable PLATFORM-002 surface into GitHub-native custody with a manifest proving byte identity to the recovered carrier; preserve historical subject `161d66c3...`; apply `PLATFORM002_RECONCILING_ORDINARY_CLAIM_REPAIR_001.patch` as a new candidate; reproduce candidate subject `1f0dc131...`; rerun strict hosted portable qualification and package/release-manifest verification.

### A01-PLATFORM002-RECONCILIATION-QUEUE-SEPARATION-001
HOLD until a GitHub-native corrected candidate exists at an exact immutable commit and hosted portable qualification passes. Admit A-01 only when Windows execution adds distinct evidence. A Windows/A-01 PASS cannot substitute for PC-ENDGAME-017 live PostgreSQL/restart/unknown-external-effect qualification.

## Central-spine decision

The demonstrated PLATFORM-002 portable state-separation correction is preserved as an exact parallel import/qualification obligation. Continue the dependency spine to:

`SYSTEM-MASTER-REBUILD-011 / PLATFORM-003 — Transport + Session Continuity + Resume Foundation`

Historical exact source+test subject identified from the canonical spine ledger:
`02e2ac07f24270ab0165b7d7f88e9915530d463ea6cd460a011f59b85371680b`

Carrier identity and current executable evidence must be verified before any current completeness claim.
