# DOCUMENTS-R4-TRANSPORT-CONTRACT-RECONCILIATION-003 — CHECKPOINT

Status: **IMPLEMENTED / LOCAL PORTABLE TRANSPORT QUALIFICATION PASS / GITHUB-NATIVE SOURCE CUSTODY STILL BLOCKED**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Base owner head: `cff6c9a1c6674fc84484fdb8207c3559499e4c2e`

## Reconciled defect

The prior staging metadata expected carrier `4fce25bc...` in 81 chunks while the admission workflow expected carrier `b6d0f8a9...` in 100 chunks. Neither derived carrier had a deterministic derivation contract from the exact recovered source handoff.

The repaired contract is now `DOCUMENTS-R4-TRANSPORT-CONTRACT-001`:

- exact handoff SHA-256: `ada701cfa15e6162b6cdf67bc6c0803540a611b08a23aeeeddd1045d8ce2d8ab`
- exact canonical-manifest SHA-256: `ed36fc9cfd38b04a8d0174efed06b03e8e25b0a45fc0adc4d47fe3457c2ee367`
- verified source rows: **225/225**
- deterministic carrier SHA-256: `166f31ae9a6b2580ab14dc43af22fcd7fc6063817427289c8686d77f2cccd07d`
- carrier bytes: **300832**
- raw chunk size: **65536**
- canonical chunk count: **5**

Two independent fresh carrier builds were byte-identical. Local fail-closed tests covered missing, duplicate, reordered, modified, extra, wrong-chunk-digest, wrong-carrier-digest and wrong-source-row cases.

## Runtime changes

- Added deterministic transport builder.
- Added repository-side canonical transport verifier.
- Added immutable `TRANSPORT-CONTRACT.json` with per-chunk and whole-carrier identities.
- Rebound `STAGING.json` to the single canonical contract and reset staged payload count to zero.
- Rebound the GitHub-native admission workflow to the canonical contract/verifier instead of hard-coded conflicting carrier constants.

## Authority boundary

This checkpoint does **not** claim GitHub-native source custody. The five exact payload chunk files are not yet present in GitHub and `READY` remains absent. The next mutation must deposit all five exact contract-listed chunks, re-read them from GitHub, reconstruct the carrier, and verify all 225 source identities before `READY` may be armed.

No historical PASS transferred. No A-01, native Microsoft Office, publication or production PASS is claimed.

## Exact next operation

`DOCUMENTS-R4-CANONICAL-PAYLOAD-DEPOSIT-004 — DEPOSIT 5 CONTRACT-LISTED CHUNKS -> GITHUB RE-READ / REASSEMBLY -> 225/225 EXACT SOURCE VERIFY -> ARM READY ONLY AFTER EXACT CUSTODY`
