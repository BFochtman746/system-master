# PLATFORM008-RECONCILIATION-001

Status: HISTORICAL_AUTHORITY_RECOVERED / ARTIFACT-TRANSFER-IDENTITY PARITY GAPS PROVEN / BOUNDED CANDIDATE LOCAL PASS / GITHUB SOURCE CUSTODY REQUIRED / TARGET EVIDENCE REQUIRED
Date: 2026-09-09
Repository: BFochtman746/system-master
Control branch: system-master/control-v2

## Authority

Packet: `SYSTEM-MASTER-REBUILD-014`
Authority: `PLATFORM-008`
Version: `0.15.0`
Scope: Artifact Intake + Transfer + Verification + Storage Gateway Foundation
Historical exact source+test subject:
`e6171d2f3078e416c49721942c612dfc55006b19fa7ecf21762540b7ae2f68d4`
Historical standing: `SEALED_PORTABLE_PASS / HISTORICAL_SEALED`
Production admitted: NO
Target gate: `PC-ENDGAME-021`
Historical successor: `SYSTEM-MASTER-REBUILD-015 / PLATFORM-009`

## Recovered carrier

Library carrier:
`SYSTEM_MASTER_REBUILD_014_ARTIFACT_INTAKE_TRANSFER_VERIFICATION_STORAGE_GATEWAY_FOUNDATION_20260831.zip`

Archive SHA-256 independently recomputed:
`bb77685091ae3c7836c27e46c0282999bee819d9ad2b4d180bcd9907d860992f`

The carrier digest matches preserved SHA/provenance/verification evidence.

## Fresh historical replay

The exact historical source was replayed before candidate modification.

Results:
- strict Java 21 compile: PASS, 246 production / 14 test sources;
- 14/14 executable Java suites: PASS;
- PLATFORM-008 focused campaign: 100,048 PASS;
- contract parity: 3/3 PASS;
- PostgreSQL static contract: 3 tables PASS;
- R018 reconstructed recurrence: 9/9 PASS;
- system coherence: PASS;
- engineering congruence: PASS;
- exact historical subject: PASS `e6171d2f...`;
- release manifest: PASS 727/727.

Historical evidence remains local portable/historical evidence only. It is not A-01, live-target or production authority.

## Demonstrated identity-consistency gaps

The PostgreSQL schema makes artifact `request_id` globally unique and makes `(request_id, artifact_id, expected_sha256, expected_bytes)` unique for transfer sessions. Its transfer update guard also makes request/artifact/work/expected identity immutable after transfer creation.

The historical in-memory repository and transfer manager did not preserve all of those durable identity rules.

Executable probes against unmodified historical bytes demonstrated:

- `REQUEST_ID_REUSE=ACCEPTED` — the same artifact request ID could bind a second, different artifact receipt in memory, while PostgreSQL rejects that identity reuse.
- `TRANSFER_COMPOSITE_REUSE=ACCEPTED` — the same request/artifact/digest/size transfer identity could bind a second transfer ID in memory, while PostgreSQL's unique constraint rejects it.
- `BEGIN_EXPECTED_BINDING=ACCEPTED` — transfer begin parameters could disagree with request-declared expected size/digest.
- `COMPLETE_REQUEST_SUBSTITUTION=ACCEPTED` — a transfer begun under one request/work identity could complete using a substitute request; the resulting receipt could bind the substitute while the transfer session remained bound to the original request.
- `TRANSFER_IDENTITY_MUTATION=ACCEPTED` — an existing in-memory transfer ID could change its bound request identity, while the PostgreSQL update guard rejects transfer identity mutation.

These are implementation/persistence consistency gaps at the canonical artifact admission boundary.

## Bounded correction candidate

Patch:
`system-master/control-v2/PLATFORM008_ARTIFACT_TRANSFER_IDENTITY_PARITY_REPAIR_001.patch`

Patch SHA-256:
`d2c55d117260c241bfc8211fc8f01e9e30e7e8dde665292a5f4fcc32cbc36291`

Correction:
- maintain a global in-memory request-ID binding for artifact receipts;
- reject non-identical reuse of an artifact request ID;
- maintain one transfer ID per durable transfer-identity tuple;
- reject transfer composite identity reuse under a different transfer ID;
- enforce request/artifact/work/expected size/digest/created-at immutability on in-memory session updates;
- require transfer begin parameters to agree with request-declared expected size/digest when supplied;
- require completion to use the request/artifact/work/expected identity bound when the transfer began;
- add focused regression assertions and bind the controls into contract-parity/R018 recurrence verification.

No public contract schema, PostgreSQL schema, content-address layout, media detector, package inspector or verification standing semantics were broadened.

## Corrected-candidate qualification

Candidate exact source+test subject:
`f894a7dccc65b218bc4172ed7f2f4d79e2aaa0700778d8ba910696bfa7bec07b`

Candidate release-manifest SHA-256:
`6330c5af2225ffd12e33ab92bdb2c67e994aef2e0c97738822a36967d35ba0d8`

Candidate CURRENT-AUTHORITY SHA-256 after exact artifact rebinding:
`08cbc8131891203593d37a76fb2cb56933c6cfbafbd060dcc607eb4cc9997117`

Fresh candidate qualification:
- strict Java 21 compile: PASS;
- all 14 executable Java suites: PASS;
- PLATFORM-008 focused campaign: 100,054 PASS;
- PLATFORM-008 contract parity: 3/3 PASS;
- PLATFORM-008 SQL contract: 3 tables PASS;
- R018 recurrence: 9/9 PASS;
- system coherence: PASS, 25 authorities / 315 capabilities / 122 routes / 24 programming families / 21 target gates;
- engineering congruence: PASS, 24 concerns / 0 exceptions;
- exact candidate subject: PASS;
- release manifest: PASS, 727/727.

The execution timeout occurred only after ten of fourteen Java suites had already passed; the four unexecuted suites were then run without repeating completed suites and all passed. The final static/exact/manifest gates passed on the same rebound candidate identity.

Historical subject `e6171d2f...` remains immutable historical evidence and does not qualify candidate `f894a7dc...`.

## Evidence classification

### COMPLETED / VERIFIED_CURRENT_LOCAL_FROM_RECOVERED_BYTES
- carrier identity verified;
- historical exact subject replayed;
- artifact/transfer identity inconsistencies reproduced;
- bounded correction prepared;
- exact candidate identity produced;
- full available portable candidate qualification passes.

### HISTORICAL SEALED
The preserved SMR014 PASS remains valid only for historical subject `e6171d2f...` and its tested portable scope.

### SOURCE CUSTODY GAP
The runnable PLATFORM-008 source/test/SQL/qualification tree exists in durable Library custody but is not ordinary current GitHub source. The control branch preserves the exact patch and evidence record.

Exact unblock event:
- import exact recovered historical runnable source into GitHub-native custody with content identity proof;
- preserve the historical subject separately;
- apply the exact correction;
- reproduce candidate `f894a7dc...` as an immutable Git commit;
- run fresh hosted qualification against that exact commit.

Classification: `BLOCKED — EXTERNAL AUTHORITY` for source import.

### A-01
No corrected PLATFORM-008 A-01 ticket is justified now.

Classification: `BLOCKED — PREDECESSOR`.

A future A-01 ticket requires a GitHub-native immutable corrected candidate, hosted PASS, registered qualifier, and a real Windows/target completion delta not already supplied by the portable suite.

### TARGET EVIDENCE REQUIRED — PC-ENDGAME-021
Still separate:
- exact target filesystem and content-address storage behavior;
- live PostgreSQL concurrency/unique-identity races;
- large/multi-GB resumable transfer behavior;
- crash/restart windows around chunk/file/session persistence;
- disk-full/storage-pressure behavior;
- real archive corpus/package behavior;
- target transfer/orphan reconciliation;
- production admission/certification.

## Central-spine successor

The dependency-valid successor is:
`SYSTEM-MASTER-REBUILD-015 / PLATFORM-009 — Model Registry + Inference Routing + Prompt Policy Foundation`

Recovered historical carrier:
`SYSTEM_MASTER_REBUILD_015_MODEL_REGISTRY_INFERENCE_ROUTING_PROMPT_POLICY_FOUNDATION_20260831.zip`

Preserved carrier SHA-256:
`c83f2f8791750bb1479bdfc24c7fab456f3ec4fa0fecbee5345b3e9cb8d3221c`

Historical exact source/test subject:
`b4b117d998daf3382de65be5ca37b591317f2f8a7098dd472d350a8293e07e65`

Preserved historical evidence records strict Java 21 273/15, 15/15 executable suites, PLATFORM-009 120,055 assertions, 8 contract-parity contracts, 8 PostgreSQL durable objects, 10 R019 recurrence material areas, coherence/congruence, deterministic rebuild and fresh extraction PASS. These are historical evidence only until the exact SMR015 carrier is independently recovered/replayed.
