# PLATFORM012-RECONCILIATION-001

Status: HISTORICAL_AUTHORITY_RECOVERED / NOTIFICATION-SUPPRESSION-WINDOW PARITY GAP PROVEN / BOUNDED CANDIDATE LOCAL PASS / GITHUB SOURCE CUSTODY REQUIRED / TARGET EVIDENCE REQUIRED
Date: 2026-09-09
Repository: BFochtman746/system-master
Control branch: system-master/control-v2

## Authority

Packet: `SYSTEM-MASTER-REBUILD-012`
Authority: `PLATFORM-012`
Version: `0.13.0`
Scope: Observability + Causal Trace + System Atlas + Notification Foundation
Historical exact source+test subject:
`00ce2c0a04badddb03342ea3b4c55040f8e106580fd24214ade8b517874c912d`
Historical standing: `SEALED_PORTABLE_PASS / HISTORICAL_SEALED`
Production admitted: NO
Target gate: `PC-ENDGAME-019`
Historical successor: `SYSTEM-MASTER-REBUILD-013 / PLATFORM-006`

## Recovered carrier

Library carrier:
`SYSTEM_MASTER_REBUILD_012_OBSERVABILITY_CAUSAL_TRACE_SYSTEM_ATLAS_NOTIFICATION_FOUNDATION_20260831.zip`

Size: 37,258,526 bytes
Archive SHA-256 independently recomputed:
`1b573d3f8330193431981c19f65ab40810f26edb8ff70e67e36ea52ed0953fbb`

The carrier digest matches the preserved SHA-256, provenance and verification-summary sidecars.

Preserved historical evidence states:
- strict Java 21: PASS, 207 production / 12 test sources;
- Java executable suites: 12/12 PASS;
- PLATFORM-012 focused campaign: 105,048 PASS;
- contract parity: 11/11 PASS;
- PostgreSQL static contract: 5 tables PASS;
- exact historical R016 findings: 7/7 PASS;
- deterministic archive reconstruction: BYTE_IDENTICAL_PASS;
- fresh extraction: FULL_REPLAY_PASS;
- productionCertified: false.

## Fresh historical replay

The exact recovered historical bytes were independently replayed before modification.

Results:
- strict `javac --release 21 -Xlint:all -Werror`: PASS;
- 12/12 Java executable suites PASS;
- PortableFoundationTest: 15;
- FOUNDATION-002: 8,127;
- FOUNDATION-003: 20,009;
- FOUNDATION-004: 10,017;
- FOUNDATION-006: 20,019;
- FOUNDATION-007: 20,010;
- FOUNDATION-008: 30,038;
- DATA-001: 40,033;
- PLATFORM-001: 60,042;
- PLATFORM-002: 110,034;
- PLATFORM-003: 100,043;
- PLATFORM-012: 105,048;
- PLATFORM-012 contract parity: 11/11 PASS;
- PLATFORM-012 SQL contract: 5 tables PASS;
- R016 recurrence: 7/7 PASS;
- system coherence: PASS, 25 authorities / 315 capabilities / 122 routes / 19 target deferrals;
- engineering congruence: PASS, 23 concerns / 0 exceptions;
- exact historical subject: PASS `00ce2c0a...`;
- release manifest: PASS, 643/643.

These are local portable results, not A-01, live-target, privacy certification or production evidence.

## Demonstrated notification suppression-window parity gap

The PLATFORM-012 PostgreSQL notification trigger serializes by `dedupe_key` and treats an existing row as a duplicate anchor only when that prior row has `suppressed=FALSE` and its `suppress_until` is still active.

The historical Java service asks the store for `latestNotification(dedupeKey)`. Both historical in-memory and JDBC implementations returned the newest notification regardless of whether it was already suppressed.

Executable historical probe with a 10-second duplicate window:
1. first notification at `t0`: unsuppressed, window ends at `t0+10s`;
2. duplicate at `t0+1s`: suppressed, its record carries `suppressUntil=t0+11s`;
3. third notification at `t0+10.5s`, after the original unsuppressed window expired but before the suppressed duplicate record's derived timestamp.

Observed historical Java behavior:
- first: `suppressed=false`;
- second: `suppressed=true`;
- third: `suppressed=true`.

The PostgreSQL trigger would ignore the suppressed second row and admit the third notification because the original unsuppressed window had expired. Therefore repeated suppressed duplicates could continually extend the Java-side suppression horizon and starve a notification stream beyond the configured duplicate window.

This contradicts the persistence dedupe semantics and the bounded-notification intent.

## Bounded correction candidate

Patch:
`system-master/control-v2/PLATFORM012_NOTIFICATION_SUPPRESSION_WINDOW_PARITY_REPAIR_001.patch`

Patch SHA-256:
`36ea66801c845b31ba7429c4d0e82fe39615fe9f190bf8f682db337d415ed22c`

Correction:
- in-memory `latestNotification(...)` returns only unsuppressed notification anchors;
- JDBC `latestNotification(...)` filters `suppressed=FALSE`, matching the PostgreSQL trigger;
- focused tests prove a suppressed duplicate does not extend the original unsuppressed duplicate window;
- the packet contract states that only an unsuppressed notification anchors the duplicate window;
- contract-parity and R016 recurrence verification fail if either Java store reintroduces suppressed anchors.

No PostgreSQL schema or external notification record shape changed.

## Corrected-candidate qualification

Candidate exact source+test subject:
`c84091d6c292c3d3ea5a45c2b740cc4e76bda86cd3b71882002ed422a643fb50`

Candidate release-manifest SHA-256:
`5d169a1db27d0db86c99076a1c3da5b5cc118144a0f94cd1fcead3604a938624`

Candidate CURRENT-AUTHORITY file SHA-256 after exact artifact rebinding:
`3564f2345eb28b8fd8c502648f181e4f488205f5d3412b8d88bedc35031f0d7b`

Fresh complete candidate replay:
- strict Java 21 compile: PASS, 207 production / 12 test sources;
- all 12 Java executable suites: PASS;
- PLATFORM-012 focused campaign: 105,049 PASS;
- PLATFORM-012 contract parity: 11/11 PASS;
- PLATFORM-012 SQL contract: 5 tables PASS;
- R016 exact historical findings: 7/7 PASS;
- system coherence: PASS, 25 authorities / 315 capabilities / 122 routes / 19 target deferrals;
- engineering congruence: PASS, 23 concerns / 0 exceptions;
- exact candidate subject: PASS;
- release manifest: PASS, 643/643.

Historical subject `00ce2c0a...` remains immutable historical evidence. It does not qualify changed candidate `c84091d6...`.

## Evidence classification

### COMPLETED / VERIFIED_CURRENT_LOCAL_FROM_RECOVERED_BYTES
- carrier identity verified;
- historical exact subject replayed;
- suppression-window extension reproduced;
- bounded correction prepared;
- candidate exact identity generated and complete local portable replay passes.

### HISTORICAL SEALED
The preserved SMR012 PASS remains authoritative only for historical subject `00ce2c0a...` and its tested portable scope.

### SOURCE CUSTODY GAP
The runnable PLATFORM-012 source/test/SQL/qualification surface exists in durable Library custody but is not exposed as ordinary current GitHub source. The control branch contains the reconciliation record and exact repair patch only.

Exact unblock event:
- import exact recovered historical runnable source into GitHub-native custody with content identity proof;
- preserve historical subject separately;
- apply the exact patch;
- reproduce candidate `c84091d6...` as an immutable Git commit;
- run fresh hosted qualification against that exact commit.

Classification: `BLOCKED — EXTERNAL AUTHORITY` for source import.

### A-01
No corrected PLATFORM-012 A-01 ticket is justified now.

Classification: `BLOCKED — PREDECESSOR`.

A future ticket requires a GitHub-native immutable corrected candidate, hosted PASS, registered qualifier, and a real Windows completion delta not already supplied by portable qualification.

### TARGET EVIDENCE REQUIRED — PC-ENDGAME-019
Still separate:
- live collector/exporter behavior and loss accounting;
- live PostgreSQL concurrency and notification dedupe races;
- privacy leakage/redaction evidence on real telemetry paths;
- cardinality/spool/drop pressure and retention/vacuum/index behavior;
- notification storm/usability behavior;
- restart/race and trace-continuity behavior;
- mixed-workload and long-duration target soak;
- production SLO/notification certification;
- production admission.

Native Apple observability/MetricKit or device-runtime claims remain `BLOCKED — NATIVE PLATFORM` when those claims specifically require Apple execution.

## Central-spine successor

The exact dependency-valid successor is:
`SYSTEM-MASTER-REBUILD-013 / PLATFORM-006 — Capability Control Plane + Registry + Discovery + Routing Foundation`

Exact recovered Library carrier identified:
`SYSTEM_MASTER_REBUILD_013_CAPABILITY_CONTROL_PLANE_REGISTRY_DISCOVERY_ROUTING_FOUNDATION_20260831.zip`

Carrier identity and exact historical source/test subject must be independently verified before a current completeness claim.
