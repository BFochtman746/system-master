# PLATFORM-005 / SMR018 — Reconciliation 001

Status: REPAIR-002 LOCAL PORTABLE CANDIDATE PASS / GITHUB CONTROL EVIDENCE RECORDED / GITHUB-NATIVE CANDIDATE SOURCE STILL REQUIRED
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

## Demonstrated discrepancy — Repair-001

The packet contract and canonical PLATFORM-005 contracts declare temporal fail-closed behavior, but the browser implementation did not enforce two declared temporal bounds:

1. `PwaSessionProjection` carries `issuedAt` / `expiresAt`, and the SMR018 packet law requires expired/stale authenticated projections to clear dynamic navigation. Historical `app.js` contained no `expiresAt` handling and no expiry timer, so already-rendered navigation could remain visible beyond the server-issued projection lifetime until an unrelated network/visibility event occurred.
2. `OfflineShellPolicy` requires `maxAgeSeconds`; the conservative SMR018 policy is 24 hours. Historical `service-worker.js` had no cache-age metadata or age check, so digest-valid cached shell assets could remain serviceable indefinitely despite the declared maximum age.

This is a projection/cache temporal-parity defect. It does not grant PLATFORM-005 authentication, authorization, capability-routing, domain, effect, PostgreSQL, browser-native, or production authority.

## Bounded correction — Repair-001

The first corrected candidate:

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

## Repair-001 candidate qualification

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

Repair-001 remains preserved as the exact predecessor candidate for Repair-002.

## Demonstrated discrepancy — Repair-002

The Java route validator rejected raw `/api` and `/api/...` strings before URI parsing, while the browser-side route validator made the API exclusion decision on the parsed pathname. This left a Java-side path-shape gap: `/api?view=shell` does not equal raw `/api` and does not start with raw `/api/`, but its parsed URI path is `/api`.

A work-surface navigation descriptor must never route into the API namespace. The API exclusion therefore has to be enforced against the parsed URI path, not only against the unparsed input string.

Repair-002 is represented by:

`system-master/control-v2/PLATFORM005_PARSED_PATH_API_ROUTE_REPAIR_002.patch`

Git blob identity on the control branch:
`53027bbd431c1ed6c818d38b540e732b35b263a4`

The bounded change:

- removes only the raw-string `/api` and `/api/` decision from the pre-URI check;
- parses the route as `URI`;
- rejects when `uri.getPath()` is null, equals `/api`, or starts with `/api/`;
- preserves absolute/protocol-relative/authority/user-info/fragment, encoded traversal/separator/null, backslash and normalization guards;
- adds an executable rejection for `/api?view=shell`;
- binds `uri.getPath` into PLATFORM-005 contract-parity verification.

No authentication, authorization, capability-routing, domain, effect, PostgreSQL, service-worker, browser-native, or production authority is broadened.

## Repair-002 exact reconstruction and qualification

The exact Repair-001 source/test subject `baadeae45c024369e16ef718d930e93099411f32cc938f80418c254506c2126d` was independently reproduced first from the exact historical carrier plus Repair-001 changes. Repair-002 was then applied on top of that exact predecessor.

Repair-002 exact source/test subject:

`5cc57679256ae6907841d457989127064cbd25936493041c6521d2e57e3757b0`

Fresh complete local portable qualification on that same subject:

- strict Java 21 compile: PASS, 369 main + 18 test sources;
- all executable Java suites: 18/18 PASS;
- PLATFORM-005 focused: 120,079 PASS;
- PLATFORM-005 contract parity: 6/6 PASS;
- persistence boundary: PASS, 0 PostgreSQL objects, browser cache non-sensitive/static only;
- R022 recurrence: 13/13 PASS;
- exact source/test subject: PASS `5cc57679...`;
- full static verifier sweep: 44/44 PASS;
- system coherence: PASS, 25 authorities / 315 capabilities / 122 routes / 30 programming families / 25 target-PC deferrals / 16 hardening findings / zero warnings;
- engineering congruence: PASS, 30 authoritative concerns / 0 exceptions;
- rebound release manifest: PASS, 985/985 governed files;
- rebound candidate release-manifest SHA-256: `a9f6dc21822fc2bd9a77cde8c71e11c285876a898c53c8669cdf96102d69e7cf`;
- rebound candidate CURRENT-AUTHORITY SHA-256: `d6ac293bf4f9f04eca6886dbed5b2d16f0f8205d00d04bef8b25a9338a7d1eaa`.

The pre-rebind coherence/manifest checks failed only on the exact files intentionally changed by Repair-001/Repair-002. After rebinding those candidate artifacts, coherence and the 985-file release manifest passed. This is evidence binding functioning as intended, not transfer of the historical seal.

## Custody and evidence boundary

The Repair-002 runnable candidate exists in recovered local working custody and is represented in GitHub by this reconciliation record plus the exact Repair-001 and Repair-002 patch artifacts. The full corrected source tree is still not an ordinary GitHub-native immutable candidate commit, so this local PASS does not satisfy hosted/A-01 prerequisites.

Do not transfer the historical `66657a53...` PASS or Repair-001 `baadeae4...` standing to Repair-002 `5cc57679...`. Do not claim live Safari/PWA/service-worker/BFCache/mobile/accessibility/HTTP-header behavior, A-01 qualification, production certification, or promotion authority from this portable result.

## Current disposition

- Historical subject `66657a53...`: HISTORICAL SEALED / unchanged.
- Repair-001 `baadeae4...`: SUPERSEDED AS CURRENT LOCAL CANDIDATE by Repair-002; preserved as predecessor evidence.
- Repair-002 `5cc57679...`: LOCAL PORTABLE CANDIDATE PASS / GITHUB-NATIVE SOURCE CUSTODY REQUIRED.
- GitHub-native immutable Repair-002 candidate: BLOCKED — EXTERNAL AUTHORITY / bulk source transport.
- Repair-002 hosted qualification: BLOCKED — PREDECESSOR / immutable GitHub candidate required first.
- Repair-002 A-01 qualification: BLOCKED — PREDECESSOR / hosted exact-SHA PASS and distinct Windows evidence delta required first.
- `PC-ENDGAME-025`: BLOCKED — TARGET/NATIVE EVIDENCE, unchanged.

## Successor

SMR018's dependency-valid successor remains:

`SYSTEM-MASTER-REBUILD-019 / CHAT-001A — Canonical Conversation + Message + Answer + Revision + Branch + Chat-State Foundation`

The central reconciliation spine may continue to SMR019 while the corrected PLATFORM-005 GitHub-native source-custody import remains separately blocked. Do not consume the target-only `PC-ENDGAME-025` boundary as portable evidence.