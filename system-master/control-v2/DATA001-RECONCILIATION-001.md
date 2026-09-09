# DATA001-RECONCILIATION-001

Status: HISTORICAL_AUTHORITY_RECOVERED / PORTABLE_BINDING_GAP_PROVEN / REPAIR_CANDIDATE_LOCAL_PASS / GITHUB_SOURCE_CUSTODY_REQUIRED / TARGET_EVIDENCE_REQUIRED
Date: 2026-09-09
Repository: BFochtman746/system-master
Control branch: system-master/control-v2

## Engineering framing

This record is a system-construction and qualification record. Historical packet labels that describe failure cases are test-taxonomy names used to challenge invariants; they are not a characterization of the System Master objective.

## Authority

Packet: SYSTEM-MASTER-REBUILD-008
Authority: DATA-001
Version: 0.9.0
Scope: Canonical PostgreSQL + Blob + Recovery + Projection Authority
Historical exact source+test subject:
`069994972b410770dca3cc9121b0f7927c3b50a458c033e51582355c9a329636`
Historical standing: SEALED_PORTABLE_PASS / HISTORICAL_SEALED
Production admitted: NO
Target gate: PC-ENDGAME-015
Next historical dependency: SYSTEM-MASTER-REBUILD-009 / PLATFORM-001

## Recovered carrier

Library carrier:
`SYSTEM_MASTER_REBUILD_008_CANONICAL_DATA_BLOB_RECOVERY_PROJECTION_FOUNDATION_20260831.zip`
Size: 37,055,613 bytes
SHA-256 independently recomputed:
`3dd2140e71285144af40010d3763f0a8787a63cf43e0a4f56c6af652f61ce9a4`

This matches the preserved provenance and verification-summary records.

Preserved historical evidence states:
- QUAL-SMR008-DATA001: PASS;
- QUAL-SMR008-CONTRACT-PARITY: PASS, 13/13;
- QUAL-SMR008-SQL-CONTRACT: PASS;
- QUAL-SMR008-R011-RECURRENCE: PASS, 20/20;
- exact source+test subject: `069994972b410770dca3cc9121b0f7927c3b50a458c033e51582355c9a329636`;
- DATA-001 focused qualification: 40,033 checks PASS;
- strict Java 21 compile: PASS;
- release manifest: 431/431 PASS;
- system coherence: PASS, 25 authorities / 315 capabilities / 122 routes;
- engineering congruence: PASS, 22 authoritative concerns / 0 exceptions;
- deterministic archive rebuild: BYTE_IDENTICAL_PASS;
- productionCertified: false;
- target proof: NOT_EXECUTED.

## Current local re-execution of recovered historical subject

Environment: OpenJDK/javac 21.0.11; local container, not A-01 and not the production target.

Historical recovered subject rerun before repair:
- strict Java 21 compile with `--release 21 -Xlint:all -Werror`: PASS;
- PortableFoundationTest: PASS, 15 checks;
- FOUNDATION-002: PASS, 8,127 assertions;
- FOUNDATION-004: PASS, 10,017 checks;
- FOUNDATION-003: PASS, 20,009 checks;
- FOUNDATION-006: PASS, 20,019 checks;
- FOUNDATION-007: PASS, 20,010 checks;
- FOUNDATION-008: PASS, 30,038 checks;
- DATA-001: PASS, 40,033 checks;
- 13-contract parity: PASS;
- SQL-contract parity: PASS;
- R011 recurrence: PASS, 20/20;
- system coherence: PASS;
- engineering congruence: PASS;
- exact subject: PASS / mutation NONE at `069994972b410770dca3cc9121b0f7927c3b50a458c033e51582355c9a329636`.

## Demonstrated backup-set / restore binding gap

The portable model requires a backup set to become VERIFIED only after a verified isolated empty-target restore. `BackupSetRecord` also carries the expected `blobManifestDigest`, and `RestoreRun` carries the observed `blobManifestDigest` from the restore.

Executable validation against the recovered historical subject:
1. create backup set `set-1` with expected blob-manifest digest `cccc...cccc`;
2. construct a VERIFIED, empty-target RestoreRun for the same backup-set ID but with blob-manifest digest `ffff...ffff`;
3. call `BackupSetRecord.verifyWith(...)`.

Historical behavior: ACCEPTED.
Probe output:
- `DATA001_MISMATCHED_BLOB_MANIFEST_ACCEPTED=true`;
- backup-set manifest = `cccc...cccc`;
- restore manifest = `ffff...ffff`.

The same incomplete binding existed in `Data001Authority.requireRecoveryProvenance(...)`.

Root cause:
- both verification entry points checked restore state, backup-set ID and empty-target standing;
- neither checked that the observed restored blob-manifest identity matched the backup set's expected blob-manifest identity.

This is a portable DATA-001 correctness/invariant gap. It is independent of the live PostgreSQL target obligations in PC-ENDGAME-015.

## Bounded repair candidate

Patch:
`system-master/control-v2/DATA001_BACKUPSET_RESTORE_BINDING_REPAIR_001.patch`

Patch SHA-256:
`f735270b88857fc5ebe3db042876900f6cc7cbc30aed129ccb7b5801bd2aefdd`

Code changes:
- `BackupSetRecord.verifyWith(...)` now requires `backupSet.blobManifestDigest == restore.blobManifestDigest`;
- `Data001Authority.requireRecoveryProvenance(...)` enforces the same identity binding;
- `Data001AuthorityTests` proves mismatched restore-manifest identity is rejected through both entry points and matching identity remains accepted.

No contract shape or schema field was changed by this bounded repair.

## Repaired-candidate qualification

All results below are local qualification of recovered bytes plus the bounded source/test repair. They are not A-01 evidence and are not target-PC evidence.

- strict Java 21 compile: PASS;
- PortableFoundationTest: PASS, 15;
- FOUNDATION-002: PASS, 8,127;
- FOUNDATION-004: PASS, 10,017;
- FOUNDATION-003: PASS, 20,009;
- FOUNDATION-006: PASS, 20,019;
- FOUNDATION-007: PASS, 20,010;
- FOUNDATION-008: PASS, 30,038;
- DATA-001: PASS, 40,036;
- DATA-001 contract parity: PASS, 13/13;
- DATA-001 SQL-contract parity: PASS;
- R011 recurrence: PASS, 20/20;
- system coherence: PASS, 25 authorities / 315 capabilities / 122 routes;
- engineering congruence: PASS, 22 authoritative concerns / 0 exceptions;
- release manifest rebound for the three changed source/test files: PASS, 431 files.

New candidate exact source+test subject:
`2df1c3ee58206e652a0a026f360a92c03b5eafedb3b712255fc39ce64b5d7c53`

Rebound candidate release-manifest SHA-256:
`fec820607e03c95110da782aa480dde270744d87ee991a3836a06789b5a01f77`

Historical-subject identity check:
- expected historical: `069994972b410770dca3cc9121b0f7927c3b50a458c033e51582355c9a329636`;
- repaired candidate: `2df1c3ee58206e652a0a026f360a92c03b5eafedb3b712255fc39ce64b5d7c53`;
- result: different identity, as required for a modified candidate.

The historical seal remains immutable and historical. The repaired candidate requires fresh qualification after GitHub-native source custody is established.

## Evidence classification

### VERIFIED_CURRENT_LOCAL_FROM_RECOVERED_BYTES
- recovered carrier SHA matches preserved provenance;
- historical exact source+test subject reproduces before repair;
- the backup-set/restore manifest-binding gap is executable and reproducible;
- the bounded repair rejects the mismatched manifest through both verification entry points;
- the complete portable regression set listed above passes on the repaired candidate;
- candidate identity is deterministic and distinct from the historical subject.

### HISTORICAL_SEALED
- SYSTEM-MASTER-REBUILD-008 historical portable PASS;
- exact source+test subject `069994972...`;
- 20/20 R011 historical recurrence disposition;
- 431/431 historical release-manifest verification;
- deterministic historical archive verification.

Historical PASS remains valid for its tested historical subject and scope. It does not qualify the repaired candidate.

### SOURCE_CUSTODY_GAP
The recovered runnable DATA-001 source/test/contract/qualification surface is durable in Library custody but is not exposed as ordinary current GitHub source. Current GitHub code search does not expose `Data001Authority` or `BackupSetRecord`.

Therefore the corrected runnable source cannot be described as already integrated current repository code. The exact patch and reconciliation evidence are preserved on `system-master/control-v2` pending source-custody import.

### CAPABILITY_GAP
`DATA001-BACKUPSET-RESTORE-BINDING-REPAIR-001`: current GitHub-native runnable DATA-001 authority must incorporate the demonstrated manifest-identity binding correction and receive fresh exact-subject qualification.

No additional portable DATA-001 implementation gap is asserted by this record without a separate executable inconsistency.

### TARGET_EVIDENCE_REQUIRED — PC-ENDGAME-015
Still requires actual target evidence including:
- exact PostgreSQL 18.6 and pgJDBC 42.7.13 runtime identity;
- migration apply/rollback/reapply behavior under interruption and restart;
- live database identity and checksum-policy evidence;
- bounded pool/connect/socket/statement/lock/idle-in-transaction behavior under contention;
- content-addressed blob destination rehash and concurrent reference behavior;
- base-backup verification plus isolated restore;
- WAL and point-in-time recovery where used;
- database+blob backup-set recovery and projection rebuild;
- disk-space, maintenance, lock, WAL and capacity observations;
- restart/reboot continuity during migration, backup, restore and projection rebuild;
- measured RPO/RTO/MTD integration with FOUNDATION-008;
- canonical export/import on isolated targets with secret-exclusion proof.

Portable contract/state qualification is not live PostgreSQL or production-target proof.

### STALE / INVALID INFERENCES
- historical `069994972...` PASS must not be relabeled as qualification of repaired candidate `2df1c3ee...`;
- Library custody must not be described as current GitHub-native runnable source custody;
- target/production certification remains false;
- no A-01 result exists for the repaired DATA-001 candidate;
- the repaired candidate must not overwrite the historical sealed packet.

## Exact successor decisions

### DATA001-CUSTODY-REPAIR-IMPORT-001
Import the exact recovered historical runnable DATA-001 surface into GitHub-native custody with a manifest proving byte identity to the recovered carrier; preserve the historical subject separately; apply `DATA001_BACKUPSET_RESTORE_BINDING_REPAIR_001.patch` as a new candidate; reproduce candidate subject `2df1c3ee...`; rerun strict hosted portable qualification.

### A01-DATA001-BACKUPSET-RESTORE-BINDING-REPAIR-001
HOLD until the GitHub-native repaired candidate exists at an exact immutable commit and hosted portable qualification passes. Central portfolio admission may then run a bounded Windows/A-01 qualifier if it adds evidence not already supplied by hosted qualification. A-01 PASS cannot substitute for PC-ENDGAME-015 target proof.

## Central-spine decision

DATA-001 reconciliation has produced a specific source-custody/correction objective. Preserve that objective in parallel and advance the dependency spine to `SYSTEM-MASTER-REBUILD-009 / PLATFORM-001`, whose historical exact source+test subject is `cd2a04b962f5a819a76c44dbd468a87f29b78c4aa19dcca191e9bed3f4a0638f`, subject to carrier verification and current-evidence reconciliation before any completeness claim.
