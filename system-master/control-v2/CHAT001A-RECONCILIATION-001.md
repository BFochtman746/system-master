# CHAT-001A / SMR019 — Reconciliation 001

Status: LOCAL PORTABLE CANDIDATE PASS / GITHUB CONTROL EVIDENCE RECORDED / GITHUB-NATIVE CANDIDATE SOURCE STILL REQUIRED
Date: 2026-09-09
Authority: `CHAT-001A`
Packet: `SYSTEM-MASTER-REBUILD-019`

## Historical carrier

- Carrier: `SYSTEM_MASTER_REBUILD_019_CANONICAL_CONVERSATION_MESSAGE_ANSWER_REVISION_BRANCH_CHAT_STATE_FOUNDATION_20260901.zip`
- Size: `37,742,960` bytes
- Carrier SHA-256: `0b708cdb33a871988896d8a311d300f27f1dbadfe4425084b44a420c1fa5496d`
- Historical source/test subject: `f4d5915275974c3d507fb3da0c6844ee21a660eddc40d47f03d867b7b2720727`
- Historical system version: `0.20.0`
- Historical state: `SMR019_PORTABLE_PASS`
- Target-only gate: `PC-ENDGAME-026`
- Packet-declared successor: `SYSTEM-MASTER-REBUILD-020 / OPERATOR-OPS-001`

## Historical replay

The exact historical subject was independently replayed before correction:

- strict Java 21: PASS, 396 main + 19 test sources;
- executable regression: 19/19 PASS;
- CHAT-001A focused: 150,078 PASS;
- contract parity: 8/8 PASS;
- PostgreSQL static contract: 9/9 normalized objects PASS;
- R023 recurrence: 14/14 reconstructed material areas PASS;
- system coherence: PASS, zero warnings;
- engineering congruence: PASS, zero exceptions;
- exact source/test subject: PASS;
- release manifest: 1054/1054 PASS.

The historical PASS remains evidence for the historical subject only.

## Demonstrated discrepancy

SMR019 declares that durable streaming/reconnect checkpoints remain `DRAFT_CHECKPOINT` revisions and must not become FINAL canonical answers. The same boundary appears in the packet contract, R023 recurrence material area 13, and the SMR019 closure report.

Historical Java and PostgreSQL did not enforce this relation. `AnswerRevision` accepted `reason=STREAM_CHECKPOINT` together with `standing=FINAL`, and `chat001a_answer_revision` independently allowed the same combination. Downstream settled/context guards trust `FINAL`, so such a record could be admitted to FINAL-only canonical assistant answer lineage even though its semantic reason was a streaming checkpoint.

This is a revision reason/standing parity defect. It does not change CHAT-001A authority, model streaming ownership, branch semantics, context authority, authentication, tools/effects, artifact ownership, persistence ownership, or target/production standing.

## Bounded correction

The corrected candidate:

- rejects `STREAM_CHECKPOINT` unless standing is exactly `DRAFT_CHECKPOINT` in `AnswerRevision`;
- adds the matching PostgreSQL CHECK constraint;
- rebinds migration `SMR019-011` to the corrected DDL digest;
- adds a focused negative assertion proving a streaming checkpoint cannot be FINAL;
- strengthens CHAT contract parity, SQL static qualification, and R023 recurrence verification for the same invariant.

Focused patch: `system-master/control-v2/CHAT001A_STREAM_CHECKPOINT_FINAL_STANDING_REPAIR_001.patch`
Patch SHA-256: `8e2a0b5ebea3227253b02c534c51620648dbfab6305abb3bbccd1bb7ac14b9fb`
Git blob SHA: `3f48f9b3e4419d3155ce924e63c2cac703865aeb`

## Corrected candidate qualification

Exact corrected source/test subject:

`5c9f5a73855ae9a154ac4ffca6dd57d167fca80e0b3bc55d55a24c180b19eaca`

Qualification on those candidate bytes:

- strict Java 21: PASS, 396 main + 19 test sources;
- executable regression: 19/19 PASS;
- CHAT-001A focused: 150,079 PASS;
- contract parity: 8/8 PASS;
- PostgreSQL static contract: 9/9 objects PASS;
- R023 recurrence: 14/14 PASS;
- system coherence: PASS, zero warnings;
- engineering congruence: PASS, zero exceptions;
- exact source/test subject: PASS;
- release manifest: 1054/1054 PASS;
- candidate release-manifest SHA-256: `cb8cfd206d8eef534fea17f5d784300f6c52eaf90ad90ab6f4634ae454cf4461`;
- candidate CURRENT-AUTHORITY SHA-256: `25b7d15c0eec3f418c1d957dd6981fd16e14ecfa47f5a4a5b84182607bf73ad3`.

## Custody and evidence boundary

The corrected runnable candidate exists in local recovered working custody and is represented in GitHub by this reconciliation record plus the byte-identical focused repair patch. The full corrected source tree is not yet an ordinary GitHub-native immutable candidate commit, so this local PASS does not satisfy hosted/A-01 prerequisites.

Do not transfer the historical `f4d59152...` PASS to candidate `5c9f5a73...`. Portable/static qualification does not establish live PostgreSQL 18.6 contention/crash/recovery, target-device streaming/reconnect, multi-device behavior, production-scale long-history/resource behavior, production authorization, usability/accessibility certification, or A-01 completion.

## Successor

SMR019's own dependency-valid successor remains:

`SYSTEM-MASTER-REBUILD-020 / OPERATOR-OPS-001 — Governed Operations + Readiness + Commissioning + Recovery + Human Control Foundation`

Advance the central reconciliation spine to SMR020 only after preserving this candidate standing and retaining the `PC-ENDGAME-026` target boundary.