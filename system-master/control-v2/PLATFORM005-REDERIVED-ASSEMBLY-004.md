# PLATFORM-005 / SMR018 — Re-derived Assembly 004

Status: LOCAL EXACT CANDIDATE ASSEMBLY / FULL PORTABLE PASS / GITHUB-NATIVE RUNNABLE SOURCE STILL REQUIRED
Date: 2026-09-09
Authority: `PLATFORM-005`
Packet: `SYSTEM-MASTER-REBUILD-018`

## Purpose

This record closes the source-custody dead end documented by `PLATFORM005-RECONCILIATION-003.md` without claiming that the unavailable exact `0ae86ee3...` composite bytes were recovered.

Instead, it defines and independently qualifies a **new exact superseding SMR018 subject** assembled from preserved exact local source plus the durable, already-recorded PLATFORM-005 correction streams.

No historical or intermediate PASS transfers to this candidate.

## Preserved lineage

- historical sealed subject: `66657a53d962e045d3f24baee9da4d6a107a152a404b84e3c9973b90b22b906c`
- temporal intermediate: `baadeae45c024369e16ef718d930e93099411f32cc938f80418c254506c2126d`
- prior qualified composite later found route-defective: `0ae86ee36d00d3d5749e20889dafbcf85c1dd84baecbcc4bc34c8d39ba31553c`
- new independently qualified re-derived subject: `cc67826bb608fc82459e23c59d5e0106d10422c6fe79f45f0571be60356b7d54`

The new subject is **not asserted to be byte-identical to `0ae86ee3...`**.

## Durable repair inputs

The re-derived candidate contains the semantics represented by these existing GitHub control artifacts:

1. `PLATFORM005_TEMPORAL_PROJECTION_CACHE_PARITY_REPAIR_001.patch`
   - projection `issuedAt` / `expiresAt` validation and fail-closed expiry clearing;
   - cache-entry timestamping and conservative 24-hour maximum age;
   - stale/missing/future cache timestamp rejection.
2. `PLATFORM005_FAIL_CLOSED_NAVIGATION_PARITY_REPAIR_001.patch`
   - `UNAVAILABLE` navigation cannot be enabled;
   - `OFFLINE` and `REAUTH_REQUIRED` projections cannot carry dynamic navigation;
   - browser rendering independently requires active shell state plus navigable standing;
   - 401/403 authentication failure maps to `REAUTH_REQUIRED`;
   - corrected cached shell generation isolation.
3. `PLATFORM005_PARSED_PATH_API_ROUTE_REPAIR_002.patch`
   - URI parsing precedes API-path prohibition;
   - `uri.getPath()` is rejected for exact `/api` and `/api/...`, including `/api?view=shell`;
   - the existing authority/fragment/backslash/traversal/encoded-separator/null fail-closed rules remain intact.

The re-derived assembly also carries the corresponding current-subject schema, packet-contract and portable-verifier guards so Java, JSON Schema, browser and qualification semantics are evaluated together.

A full local unified diff from the exact temporal base to the final re-derived candidate was generated during qualification.

- local full unified-diff SHA-256: `3721b21b26a2b71f762f09f2eab0ba4d1d8809909aa2d129d5960619a7672b34`

That digest is evidence metadata. This Markdown assembly record plus the three preserved GitHub component patches does not pretend that the complete runnable source tree is already GitHub-native.

## Independent portable qualification

Exact source/test subject:

`cc67826bb608fc82459e23c59d5e0106d10422c6fe79f45f0571be60356b7d54`

Fresh qualification on those exact bytes:

- strict Java 21 compile with `--release 21 -Xlint:all -Werror`: PASS, 369 main + 18 test sources;
- executable regression: 18/18 PASS;
- PLATFORM-005 focused qualification: 120,088 PASS;
- PLATFORM-005 contract parity: 6/6 PASS;
- persistence boundary: PASS, zero PostgreSQL objects;
- R022 recurrence: 13/13 reconstructed material areas PASS;
- system coherence: PASS, zero warnings;
- engineering congruence: PASS, zero exceptions;
- exact source/test subject: PASS;
- release manifest: 985/985 PASS;
- release-manifest SHA-256: `fd18c2f71a24949649012e8c8577342d016b9b604ea2ae6834ebfd6a5293fa80`;
- CURRENT-AUTHORITY SHA-256: `f66efdf741b0a04533d505df08d5a2a222dfc513987d34fcb252f4804619dfcf`.

## Boundary

This result proves a portable exact-subject SMR018 candidate only. It does not prove live Safari/PWA/service-worker/BFCache/mobile/accessibility/header delivery, Windows/A-01 qualification, production behavior or promotion authority.

The full runnable `cc67826...` source remains in local recovered custody rather than an ordinary GitHub-native immutable source commit. Hosted exact-SHA and A-01 therefore remain pending.

`PC-ENDGAME-025` remains separately deferred.

## Successor law

The dependency-valid successor remains `SYSTEM-MASTER-REBUILD-019 / CHAT-001A`, but it must be cumulatively rebased onto the exact PLATFORM-005 state represented by `cc67826...` before its own corrected CHAT-001A subject can unblock SMR020.