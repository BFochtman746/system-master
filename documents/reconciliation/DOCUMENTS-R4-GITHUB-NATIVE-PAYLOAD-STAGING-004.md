# DOCUMENTS-R4-GITHUB-NATIVE-PAYLOAD-STAGING-004

Status: CLOSED / PASS — FULL TRANSPORT STAGED / NOT ARMED  
Owner: SYSTEM_MASTER/DOCUMENTS  
Predecessor: DOCUMENTS-R4-TRANSPORT-CONTRACT-RECONCILIATION-003 — CLOSED/PASS  
Date: 2026-09-11

## Objective

Commit and remotely verify the five exact canonical R4 payload chunks, reconstruct the canonical carrier from the remote Git objects, reverify the represented 225-source-file subject, and freeze a complete-but-unarmed staging state. This package must not create `READY`, transfer historical qualification PASS, or claim GitHub-native source custody admission.

## Immutable payload contract

- Carrier filename: `CR001_R4_225_SOURCE_WITH_EVIDENCE_20260910.tar.xz`
- Carrier bytes: `301008`
- Carrier SHA-256: `77a6e2288d475865622bad4b2c66647a599c26a3899c6617b33d7b2b334855bd`
- Carrier Git blob SHA-1: `c775d9687f3d176f45dc8768c5636c60a387a8b8`
- Encoded carrier bytes: `401344`
- Encoded carrier SHA-256: `67e6e82c1b713c1939ccc3aa345ca2ceb0f3b086e0f849e27725c66b254f6f4f`
- Required canonical chunks: `chunk-000.b64` through `chunk-004.b64`
- Source rows represented by carrier: `225`

## Executed transfer

The earlier bounded-text bridge failed closed because larger connector transfers did not consistently reproduce their precomputed Git object identities. No failed probe object was bound to the branch.

The successful repair used the persisted SHA-gated carrier manifest at `documents/reconciliation/DOCUMENTS-R4-CARRIER-TRANSFER-MANIFEST-004.json`:

- transfer parts: `37`
- part-size profile: 12 × 20,000 bytes; 8 × 10,000 bytes; 16 × 5,000 bytes; 1 × 1,344 bytes
- transfer manifest bytes: `6896`
- transfer manifest Git blob: `f1eb46480269222683e60deffb8ba5d1a29558f9`
- transfer manifest SHA-256: `64c826213b54660c0ffc858a44800fad683f68b6c496c15f7adbc715039ffc1c`
- transfer commit: `cf32b706e05f2b2b1927c77dd2e87e5d3b76d5aa`
- temporary carrier commit: `46ac901de294fe7609d5b4d2ea0bceaa2ed8419a`
- frozen staging commit: `9f2854deefbcb8b7600634666e9a5b1664401eac`
- assembler closure commit: `6c795d315dac668ab6d3b363e99818a15bb30b6e`
- GitHub Actions run: `34646813282` — SUCCESS

## Acceptance evidence

All acceptance conditions for this staging package passed:

1. `chunk-000.b64` — Git blob `64034670dbbe18f6b629108bd1d9b1d8d81c4ac8`
2. `chunk-001.b64` — Git blob `562ec2e184b6068e0f123c9e097d344a42c67dce`
3. `chunk-002.b64` — Git blob `7b592c67e39a998301be7e5146533b842d724db2`
4. `chunk-003.b64` — Git blob `d67f828a421b0af4c75d3c5b6a2c25b8ca2a1c20`
5. `chunk-004.b64` — Git blob `3518bf5ac92360b07f86c6107670da40f5830d1f`

Remote verification reconstructed the canonical carrier and reproduced the required carrier SHA-256. The reconstructed source subject passed `225/225` exact path + size + SHA verification.

`transport/document-r4/STAGING.json` is frozen as:

- `status = FULL_TRANSPORT_STAGED__NOT_ARMED`
- `staged_chunks = 5`
- `staged_chunk_range = 000-004`
- `staged_raw_bytes = 301008`
- `ready_marker_present = false`
- `historical_pass_transfer = false`
- `github_native_source_custody = BLOCKED`

`transport/document-r4/READY` is absent.

## Historical blocker disposition

`DOCUMENTS-R4-GITHUB-NATIVE-PAYLOAD-STAGING-BLOCKER-004.json` is retained as historical evidence of the failed pre-repair transport attempts. Its blocker condition is **superseded for staging transport only** by the successful SHA-gated carrier transfer and closure receipt. It must not be interpreted as the current standing of work package 004.

The blocker did correctly prevent an unsafe closure claim while the payload was absent. The later repair satisfied the unchanged acceptance contract rather than weakening or waiving it.

## Closure

`DOCUMENTS-R4-GITHUB-NATIVE-PAYLOAD-STAGING-004` is **CLOSED / PASS**.

Closure receipt: `documents/reconciliation/DOCUMENTS-R4-GITHUB-NATIVE-PAYLOAD-STAGING-CLOSURE-RECEIPT-004.json`

This closure establishes only that the full exact transport is staged and remotely verified. It does **not** establish any of the following:

- `READY` armed
- GitHub-native source custody admission PASS
- historical qualification transfer
- Documents module completion

## Next permitted operation

Run a separate READY arming/admission operation against the exact Git subject with fresh qualification. Do not mutate the frozen 004 staging payload.
