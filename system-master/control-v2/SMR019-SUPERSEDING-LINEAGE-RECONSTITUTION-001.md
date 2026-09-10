# SMR019 Superseding Lineage Reconstitution 001 — Parallel Candidate Evidence

Date: 2026-09-09
Owner lane: `SYSTEM_MASTER/CORE`
Disposition: **PARALLEL UNSELECTED / FRESH LOCAL PORTABLE PASS / DURABLE LIBRARY CUSTODY / NO AUTHORITY TRANSFER**

## Reconciliation notice

This candidate was built and qualified while the live Core control head was concurrently advancing. Before any promotion/update of the Core control record, GitHub rejected a stale control-record write with HTTP 409. A mandatory refetch then showed that the live Core authority had already selected and sealed a different superseding SMR019 subject:

`306bbd9c18e041945c6b3dd187b1268816d123d01cff3d17926734cf603a2df4`

Therefore the candidate documented here is **not current authority, not the SMR020 predecessor, and not eligible to transfer PASS**. It is preserved only as independently qualified parallel/different-lineage evidence.

The live `SYSTEM-MASTER-CORE-CONTROL-RECORD-001.md` remains authoritative and selects `CORE-SMR020-SUPERSEDING-CUMULATIVE-REBUILD-001` on exact predecessor `306bbd9c...`.

## Parallel candidate identity

Exact base used:

`cf2a7e7a2fb882d72162e49d226137bea838a6912c11e84cd7b2be88fdc9d781`

Parallel candidate source/test SHA-256:

`de94296048167fd9c544fa8ff91516650ffcfb1545984384c7f02dcfdfabba67`

Historical hashes `9571b3f4...` and `89066e56...` were used only as semantic/history references; no PASS was transferred.

## Reconstruction proof

Reversing the preserved SMR018 reconstruction patch against `cf2a7e7a...` independently reproduced historical SMR018 source/test:

`66657a53d962e045d3f24baee9da4d6a107a152a404b84e3c9973b90b22b906c`

Comparison of that exact base to the preserved historical SMR019 semantic donor showed an additive CHAT-001A source/test delta:

- 27 main Java CHAT files added;
- 1 CHAT test added;
- zero pre-existing source/test files changed or removed.

The candidate preserved the critical CHAT standing law: `STREAM_CHECKPOINT -> DRAFT_CHECKPOINT`; only `FINAL` AnswerRevision content is canonical assistant answer content and admissible to settled/context lineage.

## Independent qualification of unselected candidate

On exact `de942960...`:

- strict Java 21: PASS — 396 main / 19 test;
- executable suites: 19/19 PASS;
- CHAT-001A focused: 150,078 checks PASS;
- PLATFORM-005 focused: 120,085 checks PASS;
- CHAT contract parity: 8/8 PASS;
- CHAT PostgreSQL/static contract: 9/9 PASS;
- R023 reconstructed material-area recurrence: 14 PASS;
- registry-count consistency: 17/17 PASS;
- target-PC deferred aggregate: 26/26 PASS;
- engineering congruence: PASS — 33 authoritative concerns / 0 exceptions;
- system coherence: PASS — zero errors/warnings;
- release manifest: PASS — 1,048 governed files excluding manifest/current-authority;
- exact-subject verification: PASS.

Candidate release-manifest SHA-256: `697866ac421e63dbacf32b509b196a63145f0bdbc6eaaf7f32b459e1aff0dc62`.

Candidate CURRENT-AUTHORITY file SHA-256 (candidate-internal only; never promoted): `8fd54586b1ceb99a50940a04f59851c4ee702f4ff321370a20721159dd4d9586`.

## Deterministic archive / fresh extraction

Deterministic candidate archive SHA-256:

`4085627df63f8403d19454bf94ab1b2337588fd3d7a8086c58f0ea583bd7948f`

Two independent builds were byte-identical. Fresh extraction reproduced `de942960...`, passed strict Java 21, release-manifest/coherence/exact-subject verification, and all 19/19 executable suites when run from packet root with shell `pipefail`.

An earlier fresh-suite harness invocation from the parent directory was discarded because PLATFORM-005 intentionally resolves `11_SOURCE/pwa/app.js` relative to packet root. It was a harness working-directory error, not a product finding.

## Preserved custody

The unselected lineage remains preserved, without overwriting the selected `306bbd9c...` lineage or any historical evidence, under `/System Assurance/`:

- `SMR019_SUPERSEDING_RECONSTITUTED_PORTABLE_001.zip` — SHA-256 `4085627df63f8403d19454bf94ab1b2337588fd3d7a8086c58f0ea583bd7948f`;
- `SMR019_SUPERSEDING_RECONSTITUTION_QUALIFICATION_MIN.zip` — SHA-256 `924c6488cf7f1e212125601fcacb929d3c4395af09f2698996c7cedb183fb3b8`;
- `SMR019_SUPERSEDING_SOURCE_TEST_REBASE_001.patch` — SHA-256 `15a80dc48df54131a7eff6770f592215e2da90bf888e41fd8110929071fe104b`;
- `SMR019-SUPERSEDING-RECONSTITUTION-REPORT.md`.

Library read-back of the candidate archive was byte-identical at `4085627d...7948f`.

## Authority fence

This record transfers **no PASS and no successor authority**. All future Core execution must use the live selected lineage from `SYSTEM-MASTER-CORE-CONTROL-RECORD-001.md`, currently exact SMR019 `306bbd9c...` and successor `CORE-SMR020-SUPERSEDING-CUMULATIVE-REBUILD-001`.
