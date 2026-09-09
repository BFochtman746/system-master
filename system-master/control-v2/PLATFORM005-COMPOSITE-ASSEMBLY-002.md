# PLATFORM-005 / SMR018 — Composite Assembly 002

Status: LOCAL EXACT CANDIDATE ASSEMBLY / COMPONENT PATCHES PRESERVED / FULL GITHUB-NATIVE SOURCE IMPORT STILL REQUIRED
Date: 2026-09-09
Authority: `PLATFORM-005`
Packet: `SYSTEM-MASTER-REBUILD-018`

## Purpose

This record binds the two independently demonstrated SMR018 repair streams into one exact candidate. It does not replace the preserved component evidence and it is not a substitute for importing the full corrected source tree into GitHub.

## Preserved component evidence

1. Temporal projection/cache repair:
   - reconciliation: `PLATFORM005-RECONCILIATION-001.md`
   - patch: `PLATFORM005_TEMPORAL_PROJECTION_CACHE_PARITY_REPAIR_001.patch`
   - qualified intermediate subject: `baadeae45c024369e16ef718d930e93099411f32cc938f80418c254506c2126d`
2. Fail-closed navigation repair:
   - patch: `PLATFORM005_FAIL_CLOSED_NAVIGATION_PARITY_REPAIR_001.patch`
   - qualified component subject: `37e904e4666b99af6a5d5a458702104ffb591e3fa0f0d591effc269ae0c2dc3d`

Neither intermediate subject is the current corrected SMR018 candidate after this assembly.

## Composite merge law

The composite candidate contains both repair sets simultaneously:

- browser projection `issuedAt` / `expiresAt` validation and a fail-closed expiry timer;
- service-worker cache timestamps and the conservative 24-hour max-age boundary;
- `UNAVAILABLE` navigation cannot be enabled in Java/JSON/browser semantics;
- `OFFLINE` and `REAUTH_REQUIRED` projections cannot carry dynamic navigation;
- browser rendering independently requires an active shell state plus `AVAILABLE`/`DEGRADED` standing before navigation remains enabled;
- 401/403 projects `REAUTH_REQUIRED` rather than a generic degraded state;
- cached-shell generation advances to `smr018-shell-v2`, so an installing corrective worker cannot mutate the active worker's old cache before explicit activation;
- all static shell assets remain fixed, digest/size bound, non-sensitive, same-origin and credential-omitted for cache population;
- PLATFORM-005 still owns no PostgreSQL state and gains no authentication, routing, effect, domain, target-browser or production authority.

## Exact composite identity

- source/test subject: `0ae86ee36d00d3d5749e20889dafbcf85c1dd84baecbcc4bc34c8d39ba31553c`
- strict Java 21: PASS, 369 main + 18 test Java sources
- executable suites: 18/18 PASS
- PLATFORM-005 focused: 120,087 PASS
- contracts: 6/6 PASS
- persistence boundary: PASS, 0 PostgreSQL objects
- R022 recurrence: 13/13 PASS
- system coherence: PASS, zero warnings
- engineering congruence: PASS, zero exceptions
- exact-subject gate: PASS
- release manifest: 985/985 PASS
- release-manifest SHA-256: `deaa4aa74339d0c9b56ef6051308354dd43e3c5069b774f3eb23cff5d0f7eea1`
- CURRENT-AUTHORITY SHA-256: `5a8f3356a40a094fc5e4b35c2a458b8636c950983202fad4a1ba3ff543109a7b`

A full historical-to-composite local unified diff was generated during qualification and had SHA-256 `f1508803b9ccd7df0ca88606e8f62bfe6eec8afc3e759c0605f60bd97040a0aa`. Because the complete corrected source tree is not yet ordinary GitHub-native source, that local-diff digest is evidence metadata only; the two preserved GitHub component patches plus this assembly record define the bounded merge until exact source import.

## Boundary

Historical subject `66657a53d962e045d3f24baee9da4d6a107a152a404b84e3c9973b90b22b906c`, temporal intermediate `baadeae4...`, fail-closed intermediate `37e904e4...`, and composite `0ae86ee3...` are four distinct identities. Their qualification evidence must not be interchanged.

`PC-ENDGAME-025` remains deferred. No live Safari/PWA/service-worker/BFCache/mobile/accessibility/header-delivery, A-01, production or promotion claim is created by this portable assembly.