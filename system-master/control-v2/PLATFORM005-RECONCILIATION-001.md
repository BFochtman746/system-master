# PLATFORM-005 / SMR018 — Reconciliation 001

Status: LOCAL PORTABLE CANDIDATE PASS / GITHUB CONTROL EVIDENCE RECORDED / GITHUB-NATIVE CANDIDATE SOURCE STILL REQUIRED
Date: 2026-09-09
Authority: `PLATFORM-005`
Packet: `SYSTEM-MASTER-REBUILD-018`

## Historical carrier

- Carrier: `SYSTEM_MASTER_REBUILD_018_AUTHENTICATED_PWA_APPLICATION_SHELL_CAPABILITY_NAVIGATION_FOUNDATION_20260901.zip`
- Size: `37,646,843` bytes
- Carrier SHA-256: `b2258a93cc85680e92adea36e8777308e4d1714c00ec94fc9e508768b18aae4d`
- Historical source/test subject: `66657a53d962e045d3f24baee9da4d6a107a152a404b84e3c9973b90b22b906c`
- Historical state: `SMR018_PORTABLE_PASS`
- Target-only gate: `PC-ENDGAME-025`
- Historical packet successor: `SYSTEM-MASTER-REBUILD-019 / CHAT-001A`

## Historical replay

The exact historical subject was independently replayed before correction:

- strict Java 21: PASS, 369 main + 18 test sources;
- executable regression: 18/18 PASS;
- PLATFORM-005 focused: 120,075 PASS;
- contract parity: 6/6 PASS;
- persistence boundary: PASS, 0 PostgreSQL objects, browser cache non-sensitive/static only;
- R022 recurrence: 13/13 reconstructed material areas PASS;
- system coherence: PASS, zero warnings;
- engineering congruence: PASS, zero exceptions;
- exact source/test subject: PASS;
- release manifest: 985/985 PASS.

The historical PASS remains evidence for the historical subject only.

## Demonstrated discrepancy

The packet contract and canonical PLATFORM-005 contracts declare temporal fail-closed behavior, but the browser implementation did not enforce two declared temporal bounds:

1. `PwaSessionProjection` carries `issuedAt` / `expiresAt`, and the SMR018 packet law requires expired/stale authenticated projections to clear dynamic navigation. Historical `app.js` contained no `expiresAt` handling and no expiry timer, so already-rendered navigation could remain visible beyond the server-issued projection lifetime until an unrelated network/visibility event occurred.
2. `OfflineShellPolicy` requires `maxAgeSeconds`; the conservative SMR018 policy is 24 hours. Historical `service-worker.js` had no cache-age metadata or age check, so digest-valid cached shell assets could remain serviceable indefinitely despite the declared maximum age.

This is a projection/cache temporal-parity defect. It does not grant PLATFORM-005 authentication, authorization, capability-routing, domain, effect, PostgreSQL, browser-native, or production authority.

## Bounded correction

The corrected candidate:

- validates browser projection `issuedAt` / `expiresAt` before render;
- schedules fail-closed dynamic-navigation clearing at `expiresAt` even if no other browser event occurs;
- stamps verified static cache responses with `X-System-Master-Cached-At`;
- rejects/deletes missing, future-dated, or older-than-24-hour cache entries;
- refreshes allowlisted static assets only through the existing digest/size/same-origin/credential-omitted verification path;
- refuses an expired offline fallback with a non-cached 503 response;
- preserves the fixed non-sensitive allowlist, API exclusion, explicit service-worker activation, purge kill switch, and no-PostgreSQL boundary;
- strengthens PLATFORM-005 focused/static/recurrence qualification so the temporal controls cannot silently regress.

Focused patch: `system-master/control-v2/PLATFORM005_TEMPORAL_PROJECTION_CACHE_PARITY_REPAIR_001.patch`
Patch SHA-256: `dbf8425d651373a647f74e715c832972ba882495546f9a5c739726e412f1d2d8`

## Corrected candidate qualification

Exact corrected source/test subject:

`baadeae45c024369e16ef718d930e93099411f32cc938f80418c254506c2126d`

Qualification on those candidate bytes:

- strict Java 21: PASS, 369 main + 18 test sources;
- executable regression: 18/18 PASS;
- PLATFORM-005 focused: 120,078 PASS;
- contract parity: 6/6 PASS;
- persistence boundary: PASS, 0 PostgreSQL objects;
- R022 recurrence: 13/13 PASS;
- system coherence: PASS, zero warnings;
- engineering congruence: PASS, zero exceptions;
- exact source/test subject: PASS;
- release manifest: 985/985 PASS;
- candidate release-manifest SHA-256: `b7d5ccd4c1b4f937cb93ae6a173c436e30623ccd26e3ab1a58fec5ce24f5863d`;
- candidate CURRENT-AUTHORITY SHA-256: `5270e8ada0c07dcf269838f0a6934fb8c8b2379019c632ad011342638eafbc52`.

## Custody and evidence boundary

The corrected runnable candidate exists in local recovered working custody and is represented in GitHub by this reconciliation record plus the focused repair patch. The full corrected source tree is not yet an ordinary GitHub-native immutable candidate commit, so this local PASS does not satisfy the hosted/A-01 prerequisites.

Do not transfer the historical `66657a53...` PASS to candidate `baadeae4...`. Do not claim live Safari/PWA/service-worker/BFCache/mobile/accessibility/HTTP-header behavior, A-01 qualification, production certification, or promotion authority from this portable result.

## Successor

SMR018's own dependency-valid successor remains:

`SYSTEM-MASTER-REBUILD-019 / CHAT-001A — Canonical Conversation + Message + Answer + Revision + Branch + Chat-State Foundation`

Advance the central reconciliation spine to SMR019 only after recording this SMR018 candidate standing and preserving the target-only `PC-ENDGAME-025` boundary.