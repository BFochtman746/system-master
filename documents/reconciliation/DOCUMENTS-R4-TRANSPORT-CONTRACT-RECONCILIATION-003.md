# DOCUMENTS-R4-TRANSPORT-CONTRACT-RECONCILIATION-003

Status: CLOSED / PASS
Owner: SYSTEM_MASTER/DOCUMENTS
Parent reconciliation: DOCUMENTS-FULL-BUILD-READINESS-RECONCILIATION-001
Date: 2026-09-11
Closure receipt: `DOCUMENTS-R4-TRANSPORT-CONTRACT-CLOSURE-RECEIPT-003.json`

## Objective

Remove the demonstrated R4 source-admission ambiguity before exact source transfer by deriving one deterministic transport contract from the exact recovered R4 handoff and its 225-row canonical source manifest.

## Immutable inputs verified

- Exact source handoff: `CR001_R4_EXACT_225_SOURCE_HANDOFF_20260910.zip`
- Source handoff SHA-256: `ada701cfa15e6162b6cdf67bc6c0803540a611b08a23aeeeddd1045d8ce2d8ab`
- Canonical source manifest SHA-256: `ed36fc9cfd38b04a8d0174efed06b03e8e25b0a45fc0adc4d47fe3457c2ee367`
- Canonical Java source/test rows: `225`
- Verification result: `225/225 path + byte-size + SHA-256 PASS`

## Closed defect

The predecessor authorities disagreed:

- prior `STAGING.json`: carrier `4fce25bc...`, 81 chunks;
- prior workflow: carrier `b6d0f8a9...`, 100 chunks;
- predecessor metadata also claimed 10 staged chunks although no chunk payload files were present on the reconciliation branch.

Those values are superseded by one versioned transport contract and one exact chunk manifest.

## Canonical deterministic carrier

- Contract: `transport/document-r4/TRANSPORT-CONTRACT.json`
- Contract SHA-256: `80509f1f2ddaa7ad2d46f9e94e88400758e40634c44243e1136c28f4c2ae7ba1`
- Deterministic TAR SHA-256: `e05167645dda63ae4d33ad66f08fa9cc5e53ab03369ec50c4ec5cb811d025267`
- Deterministic TAR bytes: `2,754,560`
- Canonical TAR.XZ SHA-256: `77a6e2288d475865622bad4b2c66647a599c26a3899c6617b33d7b2b334855bd`
- Canonical TAR.XZ bytes: `301,008`
- Two independent builds: byte-identical TAR PASS; byte-identical carrier PASS; byte-identical chunk manifest PASS.

Normalized recipe:
- GNU tar format;
- lexicographically ordered ASCII member names;
- regular files only;
- mode 0644;
- uid/gid 0;
- empty uname/gname;
- mtime 0;
- source files under `source/`;
- canonical manifest and reconstruction receipt at carrier root;
- `xz -9e --threads=1 --check=crc64 --stdout`;
- qualified builder environment recorded as XZ Utils 5.8.1.

## Canonical chunk contract

- Manifest: `transport/document-r4/CHUNK-MANIFEST.json`
- Manifest SHA-256: `daa71c58fbcb38e3a8daf1b146531d80147825a1efc15a95928dbca3ffbcd108`
- Encoding: RFC 4648 base64, one unwrapped line plus final LF;
- Full raw chunk bytes: `65,536`;
- Required chunks: `5`;
- Names: `chunk-000.b64` through `chunk-004.b64`;
- Final raw chunk bytes: `38,864`.

## Adversarial qualification

Baseline reconstruction PASS. Twelve required failure cases all failed closed:

1. missing chunk;
2. unexpected extra chunk;
3. duplicate payload as extra chunk;
4. reordered name/payload mapping;
5. modified chunk byte;
6. wrong chunk count;
7. wrong chunk digest;
8. wrong carrier digest;
9. wrong chunk ordinal;
10. wrong chunk filename/order;
11. wrong chunk-manifest binding;
12. wrong source-manifest binding.

A simulated fully staged/armed state passed the admission preflight, reconstructed the canonical carrier, and reverified all `225/225` source rows.

## Admission workflow closure

`.github/workflows/document-r4-github-native-admission.yml` now:

- consumes `TRANSPORT-CONTRACT.json` and `CHUNK-MANIFEST.json` rather than embedding an independent carrier digest/chunk count;
- requires an explicit `FULL_TRANSPORT_STAGED__ARMED` state;
- requires `READY` and STAGING acknowledgement of READY;
- validates contract and chunk-manifest SHA-256 against STAGING;
- requires staged chunk count to equal expected count;
- invokes the shared verifier/extractor;
- preserves fresh strict Java 21, portable, T13 and T14 qualification after exact source admission;
- still transfers no historical PASS.

## Current repository standing after closure

- Payload chunks committed: `0/5`
- `READY`: absent
- `STAGING.status`: `CANONICAL_TRANSPORT_CONTRACT_FROZEN__PAYLOAD_NOT_STAGED__NOT_ARMED`
- GitHub-native R4 source custody: `BLOCKED`
- Historical R4/T14 PASS transferred: `NO`
- Documents production certification: `NO`

This is intentional. Contract closure does not equal source-custody admission.

## Exact successor

`DOCUMENTS-R4-GITHUB-NATIVE-PAYLOAD-STAGING-004 — COMMIT 5 EXACT CHUNKS / REMOTE BYTE VERIFICATION / FULL-STAGING FREEZE`

The queued feature candidate `DOCUMENTS-SPINE-IDENTIFY-PROFILE-COMPLETION-001` remains unpromoted until source custody/current exact-subject qualification is established.
