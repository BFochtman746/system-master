# PLATFORM006-RECONCILIATION-001

Status: HISTORICAL_AUTHORITY_RECOVERED / HEALTH-OBSERVATION-IDENTITY PARITY GAP PROVEN / BOUNDED CANDIDATE LOCAL PASS / GITHUB SOURCE CUSTODY REQUIRED / TARGET EVIDENCE REQUIRED
Date: 2026-09-09
Repository: BFochtman746/system-master
Control branch: system-master/control-v2

## Authority

Packet: `SYSTEM-MASTER-REBUILD-013`
Authority: `PLATFORM-006`
Version: `0.14.0`
Scope: Capability Control Plane + Registry + Discovery + Routing Foundation
Historical exact source+test subject:
`114091021d6d447efd8221b09eb09c4337068210941be2394f5e336177330e1e`
Historical standing: `SEALED_PORTABLE_PASS / HISTORICAL_SEALED`
Production admitted: NO
Target gate: `PC-ENDGAME-020`
Historical successor: `SYSTEM-MASTER-REBUILD-014 / PLATFORM-008`

## Recovered carrier

Library carrier:
`SYSTEM_MASTER_REBUILD_013_CAPABILITY_CONTROL_PLANE_REGISTRY_DISCOVERY_ROUTING_FOUNDATION_20260831.zip`

Archive SHA-256 independently recomputed:
`ae1c556cebab073f70f764d8b2c75d7eaa6d54f6d1ae9facbccc585db533f64c`

The carrier digest matches preserved provenance and verification-summary evidence.

Preserved historical qualification states:
- strict Java 21: PASS, 228 production / 13 test sources;
- Java executable suites: 13/13 PASS;
- PLATFORM-006 focused campaign: 100,057 PASS;
- contract parity: 5/5 PASS;
- PostgreSQL static contract: 4 tables PASS;
- historical R017 recurrence: 9/9 PASS;
- system coherence: PASS, 25 authorities / 315 capabilities / 122 routes / 24 programming families / 20 target gates;
- engineering congruence: PASS, 24 concerns / 0 exceptions;
- exact subject: PASS;
- release manifest: 690/690 PASS;
- deterministic rebuild: BYTE_IDENTICAL_PASS;
- fresh extraction: PASS;
- productionCertified: false.

## Fresh historical replay

The recovered historical bytes were independently replayed before modification.

Results:
- strict `javac --release 21 -Xlint:all -Werror`: PASS;
- all 13 executable Java suites: PASS;
- PLATFORM-006: 100,057 PASS;
- contract parity: 5/5 PASS;
- SQL contract: 4 tables PASS;
- R017 recurrence: 9/9 PASS;
- system coherence: PASS;
- engineering congruence: PASS;
- exact subject reproduced as `11409102...`;
- release manifest: 690/690 PASS.

These are local portable results, not A-01, live-target, or production evidence.

## Demonstrated health-observation identity parity gap

The PLATFORM-006 packet contract states that duplicate health identities are idempotent only for an identical canonical object. PostgreSQL makes `observation_id` the primary identity, and the JDBC adapter checks exact observation identity before freshness ordering.

The historical in-memory registry instead retained only the latest health observation keyed by descriptor ID.

Two executable probes against the unmodified historical subject demonstrated the mismatch:

1. observe health record `H1` for descriptor A;
2. observe newer health record `H2` for descriptor A;
3. replay identical `H1`.

Historical in-memory result:
`OLDER_IDENTICAL_REPLAY=REJECTED:stale health observation`

The JDBC path would return the identical record idempotently because it checks `observation_id` first.

Second probe:
1. record `H1` for descriptor A;
2. reuse the same `observation_id` for different content bound to descriptor B.

Historical in-memory result:
`CROSS_DESCRIPTOR_ID_REUSE=ACCEPTED`

PostgreSQL/JDBC rejects this because `observation_id` is globally unique and non-identical replay conflicts.

Therefore in-memory and durable health identity semantics disagreed in both replay and cross-descriptor uniqueness.

## Bounded correction candidate

Patch:
`system-master/control-v2/PLATFORM006_HEALTH_OBSERVATION_IDENTITY_PARITY_REPAIR_001.patch`

Patch SHA-256:
`605c05dcac1fbd4873c91e3e464b77b158746c14609f77719999ab95e9989423`

Correction:
- add a global in-memory `healthById` identity map;
- check exact observation identity before descriptor freshness ordering;
- identical replay remains idempotent even after newer health exists;
- reuse of an existing observation ID for different content or another descriptor fails closed;
- preserve the existing per-descriptor latest-health map for discovery/current-health semantics;
- add focused regression assertions;
- bind the invariant into packet contract, contract parity, and R017 recurrence verification.

No public contract shape, routing algorithm, or PostgreSQL schema changed.

## Corrected-candidate qualification

Candidate exact source+test subject:
`f2d86c2d1338936135bce26aa9ee1156aabfe871f3e8b2cd8bafd1efd119deee`

Candidate release-manifest SHA-256:
`8fbedcbc8d6a3cac26cadbf809dbd5b33c118342854030dc86d50f4c46b8fadf`

Candidate CURRENT-AUTHORITY SHA-256 after exact artifact rebinding:
`2fcd572d7d53db07bc71ddc8a30ec32345d0a5e51c1f2b667ea57f8465325de6`

Fresh clean candidate replay:
- strict Java 21 compile: PASS;
- all 13 Java executable suites: PASS;
- PLATFORM-006 focused campaign: 100,059 PASS;
- PLATFORM-006 contract parity: 5/5 PASS;
- PLATFORM-006 SQL contract: 4 tables PASS;
- R017 exact historical findings: 9/9 PASS;
- system coherence: PASS, 25 authorities / 315 capabilities / 122 routes / 24 programming families / 20 target gates;
- engineering congruence: PASS, 24 concerns / 0 exceptions;
- exact candidate subject: PASS;
- release manifest: PASS, 690/690.

Historical subject `11409102...` remains immutable historical evidence and does not qualify changed candidate `f2d86c2d...`.

## Evidence classification

### COMPLETED / VERIFIED_CURRENT_LOCAL_FROM_RECOVERED_BYTES
- carrier identity verified;
- historical exact subject replayed;
- both health-observation identity mismatches reproduced;
- bounded correction prepared;
- candidate exact identity generated;
- full available portable candidate qualification passes.

### HISTORICAL SEALED
The preserved SMR013 PASS remains authoritative only for historical subject `11409102...` and its tested portable scope.

### SOURCE CUSTODY GAP
The runnable PLATFORM-006 source/test/SQL/qualification surface exists in durable Library custody but is not exposed as ordinary current GitHub source. The control branch preserves the exact correction patch and reconciliation evidence.

Exact unblock event:
- import exact recovered historical runnable source into GitHub-native custody with content identity proof;
- preserve the historical subject separately;
- apply the exact patch;
- reproduce candidate `f2d86c2d...` as an immutable Git commit;
- run fresh hosted qualification against that exact commit.

Classification: `BLOCKED — EXTERNAL AUTHORITY` for source import.

### A-01
No corrected PLATFORM-006 A-01 ticket is justified now.

Classification: `BLOCKED — PREDECESSOR`.

A future A-01 ticket requires a GitHub-native immutable corrected candidate, hosted PASS, registered qualifier, and a distinct Windows completion delta beyond the already-passing portable suite.

### TARGET EVIDENCE REQUIRED — PC-ENDGAME-020
Still separate from portable qualification:
- live PostgreSQL concurrency for descriptor/health/route identity;
- real health/discovery freshness behavior under concurrent updates;
- real routing behavior under target capacity and health churn;
- external qualification/provenance/evidence integrations;
- target process/network/runtime observations;
- production admission/certification.

## Central-spine successor

The exact dependency-valid successor is:
`SYSTEM-MASTER-REBUILD-014 / PLATFORM-008 — Artifact Intake + Transfer + Verification + Storage Gateway Foundation`

Recovered historical carrier identity:
`SYSTEM_MASTER_REBUILD_014_ARTIFACT_INTAKE_TRANSFER_VERIFICATION_STORAGE_GATEWAY_FOUNDATION_20260831.zip`

Carrier SHA-256:
`bb77685091ae3c7836c27e46c0282999bee819d9ad2b4d180bcd9907d860992f`

Historical exact source/test subject identified from preserved verification summary:
`e6171d2f3078e416c49721942c612dfc55006b19fa7ecf21762540b7ae2f68d4`

Preserved historical qualification evidence records 14/14 executable suites, PLATFORM-008 100,048 assertions, 3/3 contracts, 3 static PostgreSQL tables, and 9 R018 material recurrence areas. Those are historical evidence only until the exact SMR014 carrier is independently recovered and replayed.
