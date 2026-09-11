# DOCUMENTS-R4-GITHUB-NATIVE-PAYLOAD-STAGING-004

Status: SELECTED / READY_FOR_EXECUTION
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

## Acceptance

PASS requires 5/5 remote chunk files exact, canonical carrier reconstruction PASS, 225/225 source identity PASS, staging metadata exact, and READY absent.

## Downstream

Only after this package closes may the admission/arming operation create READY and invoke fresh GitHub-native exact-subject qualification.
