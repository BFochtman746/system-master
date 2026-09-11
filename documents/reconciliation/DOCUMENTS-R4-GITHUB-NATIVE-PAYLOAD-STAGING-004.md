# DOCUMENTS-R4-GITHUB-NATIVE-PAYLOAD-STAGING-004

Status: CLOSED / PASS — FULL TRANSPORT STAGED / NOT ARMED
Owner: SYSTEM_MASTER/DOCUMENTS
Predecessor: DOCUMENTS-R4-TRANSPORT-CONTRACT-RECONCILIATION-003 — CLOSED/PASS
Date: 2026-09-11

## Objective

Commit the five exact base64 payload chunks already derived from the canonical R4 carrier, verify their remote GitHub bytes against `CHUNK-MANIFEST.json`, and freeze a complete-but-unarmed staging state. Do not create `READY` and do not claim GitHub-native source custody in this package.

## Immutable payload contract

- Carrier SHA-256: `77a6e2288d475865622bad4b2c66647a599c26a3899c6617b33d7b2b334855bd`
- Carrier bytes: `301008`
- Full raw chunk bytes: `65536`
- Required chunks: `chunk-000.b64` through `chunk-004.b64`
- Chunk count: `5`
- Chunk manifest SHA-256: `daa71c58fbcb38e3a8daf1b146531d80147825a1efc15a95928dbca3ffbcd108`
- Source rows represented by carrier: `225`

## Execution contract

1. Use only the five locally derived chunk files whose byte hashes match the frozen chunk manifest.
2. Commit each chunk under `transport/document-r4/` on the Documents reconciliation branch.
3. After every write, fetch the remote file and verify the exact file bytes/digest against the manifest; do not rely only on successful API response.
4. Require the remote directory to contain exactly the five chunk payload files plus control metadata, with no unexpected `chunk-*` file.
5. Reconstruct the carrier from remote-confirmed chunk bytes and require the canonical carrier digest.
6. Reverify 225/225 source rows from the reconstructed carrier.
7. Update `STAGING.json` to `FULL_TRANSPORT_STAGED__NOT_ARMED`, `staged_chunks=5`, `staged_chunk_range=000-004`, `staged_raw_bytes=301008`, and keep `ready_marker_present=false`.
8. Do not create `READY` in this package.
9. Do not transfer historical qualification PASS.
10. Preserve source custody standing as BLOCKED until the separate admission/arming operation runs on its exact Git subject.

## Current adjudication

The acceptance contract cannot be satisfied with the GitHub transport exposed in this execution environment.

Evidence established during the 004 attempt:

- the exact local source remains verified 225/225 and the canonical five-chunk carrier remains intact;
- `transport/document-r4/STAGING.json` remains at 0/5 payload chunks, not armed, READY absent;
- the surviving September 10 R4 final-admission/import/staging/binary-transport branches contain no complete committed payload;
- the September 10 zip-transport branch contains probe/planning records, not the source tree or a complete carrier;
- the September 11 Second Shift checkpoint independently records `github_native_source_tree_committed=false` and the same file-capable-transport blocker;
- an attempted bounded UTF-8 segment bridge was rejected fail-closed because not every transferred segment reproduced its precomputed Git content-addressed object identity;
- no canonical payload chunk from that bridge was attached to the branch tree;
- the temporary bridge workflow and segment manifest were removed.

The durable blocker record is:
`documents/reconciliation/DOCUMENTS-R4-GITHUB-NATIVE-PAYLOAD-STAGING-BLOCKER-004.json`.

## Acceptance

PASS still requires 5/5 remote chunk files exact, canonical carrier reconstruction PASS, 225/225 source identity PASS, staging metadata exact, and READY absent.

Current result: **BLOCKED**. None of those requirements are waived or weakened.

## Required unblock

Use a file-capable GitHub transport or an already-authorized runner-visible source capable of transferring the exact local carrier/source bytes without manual transcription. Then rerun this package from the frozen contract and require remote exact-byte verification before PASS.

## Independent continuation rule

This transport-only blocker does not prevent continuing Documents build-readiness organization and bounded pre-build packet preparation. It does prevent any claim that recovered R4 source is in Git-native custody or that fresh qualification is bound to an exact Git source subject.

## Next safe Documents operation

`DOCUMENTS-SPINE-IDENTIFY-PROFILE-COMPLETION-001A — REQUIREMENT / SOURCE / CONTRACT / TEST / DEPENDENCY PREBUILD FREEZE`

This successor prepares the earliest partially complete Documents spine stage for future implementation without modifying or qualifying absent Git-native R4 source bytes.

## Closure resolution
- Closure receipt: `DOCUMENTS-R4-GITHUB-NATIVE-PAYLOAD-STAGING-CLOSURE-RECEIPT-004.json`
- Staging commit: `9f2854deefbcb8b7600634666e9a5b1664401eac`
- Remote canonical chunk Git blobs: 5/5 verified.
- Remote carrier SHA-256: `77a6e2288d475865622bad4b2c66647a599c26a3899c6617b33d7b2b334855bd`.
- Exact source reconstruction: 225/225 verified.
- `READY`: absent.
- Historical PASS transfer: false.
- GitHub-native source custody remains pending the separate arming/admission operation.
