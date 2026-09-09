# PLATFORM-005 / SMR018 — Reconciliation 002

Status: LOCAL PORTABLE COMPOSITE CANDIDATE PASS / GITHUB CONTROL EVIDENCE RECORDED / GITHUB-NATIVE CANDIDATE SOURCE STILL REQUIRED
Date: 2026-09-09
Authority: `PLATFORM-005`
Packet: `SYSTEM-MASTER-REBUILD-018`

## Supersession

This record supersedes `PLATFORM005-RECONCILIATION-001.md` only for the identity of the current corrected SMR018 candidate. Reconciliation 001 remains valid evidence for its independently qualified temporal intermediate candidate and must not be deleted or rewritten.

Distinct preserved identities:

- historical sealed subject: `66657a53d962e045d3f24baee9da4d6a107a152a404b84e3c9973b90b22b906c`;
- temporal intermediate candidate: `baadeae45c024369e16ef718d930e93099411f32cc938f80418c254506c2126d`;
- fail-closed-navigation component candidate: `37e904e4666b99af6a5d5a458702104ffb591e3fa0f0d591effc269ae0c2dc3d`;
- superseding composite corrected candidate: `0ae86ee36d00d3d5749e20889dafbcf85c1dd84baecbcc4bc34c8d39ba31553c`.

No PASS transfers between these identities.

## Historical carrier and replay

Carrier: `SYSTEM_MASTER_REBUILD_018_AUTHENTICATED_PWA_APPLICATION_SHELL_CAPABILITY_NAVIGATION_FOUNDATION_20260901.zip`

- bytes: `37,646,843`;
- carrier SHA-256: `b2258a93cc85680e92adea36e8777308e4d1714c00ec94fc9e508768b18aae4d`;
- historical source/test subject: `66657a53d962e045d3f24baee9da4d6a107a152a404b84e3c9973b90b22b906c`;
- target-only gate: `PC-ENDGAME-025`;
- packet-declared successor: `SYSTEM-MASTER-REBUILD-019 / CHAT-001A`.

Independent historical replay before correction: strict Java 21 PASS (369 main + 18 test), 18/18 executable suites, PLATFORM-005 120,075, 6/6 contracts, persistence boundary PASS with zero PostgreSQL objects, 13/13 R022, coherence zero warnings, congruence zero exceptions, exact subject PASS and 985/985 release manifest PASS.

## Demonstrated discrepancies

### A. Temporal projection/cache parity

Reconciliation 001 demonstrated that the browser did not enforce projection `issuedAt` / `expiresAt` lifetime or clear already-rendered navigation at expiry without another browser event, and the service worker did not enforce the conservative 24-hour offline-shell cache maximum age.

### B. Fail-closed navigation parity

A subsequent replay demonstrated that canonical Java rejected `UNAVAILABLE + enabled=true` navigation while JSON Schema admitted it; canonical session projection admitted non-empty navigation for `OFFLINE` or `REAUTH_REQUIRED`; browser rendering trusted `item.enabled` without independently requiring active shell state plus `AVAILABLE`/`DEGRADED`; and 401/403 was not projected as `REAUTH_REQUIRED`. Because `app.js` is cached, the corrective browser update also required a new cache generation to preserve explicit activation isolation.

## Composite bounded correction

The superseding candidate contains both repair sets simultaneously:

- projection `issuedAt` / `expiresAt` validation and fail-closed expiry timer;
- verified-cache timestamps and 24-hour max-age rejection of missing/future/stale cache entries;
- non-cached 503 when the offline fallback itself is expired;
- cache generation `smr018-shell-v2` to isolate installing and active workers until explicit activation;
- Java invariant forbidding navigation in `OFFLINE` / `REAUTH_REQUIRED` projections;
- JSON Schema invariants forbidding `UNAVAILABLE + enabled=true` and navigation in inactive shell states;
- browser validation requiring active `ONLINE`/`DEGRADED` plus `AVAILABLE`/`DEGRADED` before enabling a navigation link and mapping 401/403 to `REAUTH_REQUIRED`;
- exact static-asset digest/size/service-worker integrity rebind;
- qualification guards for both discrepancy classes;
- preserved fixed non-sensitive cache allowlist, API exclusion, credential omission, no PostgreSQL ownership, and all PLATFORM-005 non-ownership boundaries.

Preserved component evidence:
- `PLATFORM005_TEMPORAL_PROJECTION_CACHE_PARITY_REPAIR_001.patch`;
- `PLATFORM005_FAIL_CLOSED_NAVIGATION_PARITY_REPAIR_001.patch`;
- `PLATFORM005-COMPOSITE-ASSEMBLY-002.md`.

## Superseding composite qualification

Exact corrected source/test subject:
`0ae86ee36d00d3d5749e20889dafbcf85c1dd84baecbcc4bc34c8d39ba31553c`

Fresh qualification on those exact bytes:
- strict Java 21: PASS, 369 main + 18 test sources;
- executable regression: 18/18 PASS;
- PLATFORM-005 focused: 120,087 PASS;
- contract parity: 6/6 PASS;
- persistence boundary: PASS, zero PostgreSQL objects;
- R022 recurrence: 13/13 PASS;
- system coherence: PASS, zero warnings;
- engineering congruence: PASS, zero exceptions;
- exact source/test subject: PASS;
- release manifest: 985/985 PASS;
- release-manifest SHA-256: `deaa4aa74339d0c9b56ef6051308354dd43e3c5069b774f3eb23cff5d0f7eea1`;
- CURRENT-AUTHORITY SHA-256: `5a8f3356a40a094fc5e4b35c2a458b8636c950983202fad4a1ba3ff543109a7b`.

## Custody and successor boundary

The complete corrected source tree is still local recovered custody rather than an ordinary GitHub-native immutable source commit, so hosted exact-SHA and A-01 qualification remain pending. `PC-ENDGAME-025` remains target-deferred.

The central workstream must not roll backward from CHAT-001A because SMR018's own successor is SMR019. Update only the predecessor-train identity to this composite candidate, preserve any newer CHAT-001A reconciliation that has already landed, and continue from the latest dependency-valid control state.