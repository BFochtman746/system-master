# SMR019 Superseding Lineage Reconstitution 001

Date: 2026-09-09
Owner lane: `SYSTEM_MASTER/CORE`
Disposition: **FRESH LOCAL PORTABLE PASS / DETERMINISTIC FRESH-EXTRACTION PASS / DURABLE LIBRARY CUSTODY / NO HISTORICAL PASS TRANSFER**

## Authority basis

This work executes the live Core successor selected after `CORE-SOURCE-CUSTODY-DEADLOCK-REPAIR-001`. Historical exact subjects `9571b3f4...` (SMR019) and `89066e56...` (SMR020) remain immutable evidence labels only. They are not required preimages and their PASS does not transfer.

Exact superseding SMR018 predecessor:

`cf2a7e7a2fb882d72162e49d226137bea838a6912c11e84cd7b2be88fdc9d781`

## Three-way reconstruction proof

The preserved SMR018 reconstruction patch was reversed against `cf2a7e7a...` and independently reproduced historical SMR018 source/test exactly:

`66657a53d962e045d3f24baee9da4d6a107a152a404b84e3c9973b90b22b906c`

Comparison of that exact base to the preserved historical SMR019 semantic donor proved the CHAT-001A source/test delta was additive:

- 27 main Java CHAT files added;
- 1 CHAT test added;
- 0 pre-existing source/test files changed or removed.

Therefore the newer PLATFORM-005 superseding reconstruction is preserved unchanged while CHAT-001A semantics are reintroduced.

The critical CHAT standing law is preserved across Java, schemas, PostgreSQL guards, and tests:

- `STREAM_CHECKPOINT` => `DRAFT_CHECKPOINT`;
- only `FINAL` AnswerRevision content is canonical assistant answer content;
- draft checkpoints and placeholder assistant messages cannot silently become settled/context truth.

## New exact subject

Fresh superseding SMR019 source/test SHA-256:

`de94296048167fd9c544fa8ff91516650ffcfb1545984384c7f02dcfdfabba67`

Source counts:

- 396 main Java sources;
- 19 test Java sources.

## Fresh qualification

On the exact new subject:

- strict Java 21 (`--release 21 -Xlint:all -Werror`): PASS;
- executable suites: 19/19 PASS;
- CHAT-001A focused runtime: 150,078 checks PASS;
- PLATFORM-005 focused runtime: 120,085 checks PASS;
- CHAT contract parity: 8/8 PASS;
- CHAT PostgreSQL/static contract: 9/9 PASS;
- reconstructed R023 material-area recurrence: 14 PASS;
- registry-count consistency: 17/17 PASS;
- target-PC deferred aggregate: 26/26 PASS with no false target PASS;
- engineering congruence: PASS — 33 authoritative concerns / 0 exceptions;
- system coherence: PASS — 25 authorities / 315 capabilities / 122 routes / 33 programming families / 26 target-PC deferred gates / 16 hardening findings;
- release manifest: PASS — 1,048 governed files excluding manifest/current-authority;
- exact-subject verification: PASS.

Candidate release-manifest SHA-256:

`697866ac421e63dbacf32b509b196a63145f0bdbc6eaaf7f32b459e1aff0dc62`

Candidate CURRENT-AUTHORITY SHA-256:

`8fd54586b1ceb99a50940a04f59851c4ee702f4ff321370a20721159dd4d9586`

## Deterministic archive and fresh extraction

The sealed candidate was built twice with sorted paths, fixed timestamps, fixed Unix file mode, and deterministic DEFLATE settings. Both independently produced the same archive SHA-256:

`4085627df63f8403d19454bf94ab1b2337588fd3d7a8086c58f0ea583bd7948f`

Fresh extraction independently passed:

- release-manifest verification;
- system coherence;
- exact source/test subject verification;
- strict Java 21 compilation;
- all 19/19 executable suites, including CHAT-001A and the preserved PLATFORM-005 suite.

An initial fresh-suite harness invocation from the parent directory was discarded because PLATFORM-005 intentionally resolves `11_SOURCE/pwa/app.js` relative to packet root. The corrected run used packet-root working directory plus shell `pipefail`; all 19 suites then passed. No product defect was inferred from the discarded harness run.

## Durable custody

The following new artifacts were preserved without overwriting historical evidence in `/System Assurance/`:

- `SMR019_SUPERSEDING_RECONSTITUTED_PORTABLE_001.zip` — SHA-256 `4085627df63f8403d19454bf94ab1b2337588fd3d7a8086c58f0ea583bd7948f`;
- `SMR019_SUPERSEDING_RECONSTITUTION_QUALIFICATION_MIN.zip` — SHA-256 `924c6488cf7f1e212125601fcacb929d3c4395af09f2698996c7cedb183fb3b8`;
- `SMR019_SUPERSEDING_SOURCE_TEST_REBASE_001.patch` — SHA-256 `15a80dc48df54131a7eff6770f592215e2da90bf888e41fd8110929071fe104b`;
- `SMR019-SUPERSEDING-RECONSTITUTION-REPORT.md`.

The preserved archive was materialized back from Library and compared byte-for-byte with the local sealed archive. Read-back SHA-256 remained exactly `4085627d...7948f` and the comparison passed.

## Evidence boundary

This proves **local portable** and **durable Library custody** for exact subject `de942960...`.

It does not establish ordinary GitHub-native runnable-source custody, hosted exact-Git-SHA qualification, A-01/Windows empirical qualification, Apple/browser/device/accessibility proof, or production admission. `CORE-GITHUB-NATIVE-BULK-SOURCE-TRANSPORT-001` remains a parallel boundary.

## Successor

The next dependency-valid Core product step is:

`CORE-SMR020-SUPERSEDING-CUMULATIVE-REBUILD-001`

Reapply the preserved R024 `OPERATOR-OPS-001` repair/migration semantics onto exact predecessor `de94296048167fd9c544fa8ff91516650ffcfb1545984384c7f02dcfdfabba67`, create a new dependency-current SMR020 subject, run fresh cumulative qualification with no PASS transfer, preserve it durably, and only then rebind/resume the sealed SMR021 USER-EXPERIENCE execution packet on that new predecessor.
