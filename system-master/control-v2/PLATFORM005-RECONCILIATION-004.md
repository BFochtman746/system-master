# PLATFORM-005 / SMR018 — Reconciliation 004

Status: LOCAL PORTABLE PASS / RESIDUAL ROUTE DEFECT CLOSED ON NEW EXACT SUBJECT / GITHUB CONTROL EVIDENCE RECORDED / GITHUB-NATIVE RUNNABLE SOURCE STILL REQUIRED
Date: 2026-09-09
Authority: `PLATFORM-005`
Packet: `SYSTEM-MASTER-REBUILD-018`

## 1. What was failing

Three different failures were encountered and must remain distinct.

### A. Product defect — raw route checked before URI pathname parsing

The SMR018 route law requires origin-relative, non-API, normalized and bounded work-surface routes.

The inherited Java `ShellRules.route` rejected raw strings equal to `/api` or beginning `/api/` **before URI parsing**. Therefore `/api?view=shell` did not match either raw-string prohibition and was admitted. Browser-side routing parsed the URL first and rejected the same route because its pathname is `/api`.

This was directly reproduced against the sealed historical Java behavior and is an objective Java/browser contract-parity defect.

### B. Qualification-launch defect — wrong working directory

A later local run reported `NoSuchFileException: 11_SOURCE/pwa/app.js`. That was not a product regression. `Platform005AuthorityTests` deliberately reads packet-relative PWA assets; the test process had been launched outside the packet root. Re-running the unfinished suites from the correct packet root passed.

### C. Candidate-lineage/evidence defect — repair applied to the wrong predecessor state

The first parsed-path repair investigation modified a historical/temporal lineage while GitHub had already preserved a later SMR018 composite. Passing tests on that parallel lineage could not supersede the later composite, because no PASS transfers to changed or dependency-stale bytes.

The exact `0ae86ee36d00d3d5749e20889dafbcf85c1dd84baecbcc4bc34c8d39ba31553c` runnable composite tree could not be recovered from ordinary GitHub source custody or the targeted saved-file Library search. `PLATFORM005-RECONCILIATION-003.md` therefore correctly blocked advancement rather than claiming equivalence.

## 2. Online research adjudication

Current authoritative/reference documentation supports the repair model used here:

- Oracle Java `java.net.URI` documentation defines hierarchical URI syntax with path and query as distinct components and exposes `getPath()` for the decoded path component. A policy governing the route path therefore belongs on the parsed pathname, not on the original string.
- The WHATWG URL Standard likewise models path and query as distinct URL components.
- OWASP input-validation guidance requires server-side syntactic/semantic validation and favors allowlisted, normalized representations at trust boundaries.
- OWASP URL/path guidance warns that URL parsing and encoded path variants require explicit validation rather than raw-string assumptions.

Research sources consulted:
- Oracle Java 21 `java.net.URI`: `https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/URI.html`
- WHATWG URL Standard: `https://url.spec.whatwg.org/`
- OWASP Input Validation Cheat Sheet: `https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html`
- OWASP Unvalidated Redirects and Forwards Cheat Sheet: `https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html`
- OWASP Path Traversal: `https://owasp.org/www-community/attacks/Path_Traversal`

The bounded correction is therefore: parse the URI, enforce non-API policy on `uri.getPath()`, preserve the existing origin/authority/fragment/traversal/encoding fail-closed checks, and test the exact query-bearing bypass.

## 3. Source-custody resolution without false identity

The exact prior composite `0ae86ee3...` was not recovered. Rather than fabricate its bytes, the workstream created a **new independently qualified superseding subject** from preserved exact local source and the durable repair streams:

- `PLATFORM005_TEMPORAL_PROJECTION_CACHE_PARITY_REPAIR_001.patch`;
- `PLATFORM005_FAIL_CLOSED_NAVIGATION_PARITY_REPAIR_001.patch`;
- `PLATFORM005_PARSED_PATH_API_ROUTE_REPAIR_002.patch`.

The assembly and identity boundary are recorded in `PLATFORM005-REDERIVED-ASSEMBLY-004.md`.

Distinct identities remain:

- historical: `66657a53d962e045d3f24baee9da4d6a107a152a404b84e3c9973b90b22b906c`;
- temporal intermediate: `baadeae45c024369e16ef718d930e93099411f32cc938f80418c254506c2126d`;
- prior qualified composite later found route-defective: `0ae86ee36d00d3d5749e20889dafbcf85c1dd84baecbcc4bc34c8d39ba31553c`;
- current independently qualified re-derived candidate: `cc67826bb608fc82459e23c59d5e0106d10422c6fe79f45f0571be60356b7d54`.

No PASS transfers between them.

## 4. Current corrected semantics

The `cc67826...` candidate simultaneously enforces:

- projection `issuedAt` / `expiresAt` validation and fail-closed expiry clearing;
- cache timestamping and conservative 24-hour maximum age;
- rejection of missing/future/stale cached shell entries;
- isolated corrected service-worker cache generation;
- `UNAVAILABLE` navigation cannot be enabled;
- `OFFLINE` / `REAUTH_REQUIRED` projections cannot carry dynamic navigation;
- browser navigation independently requires active shell state and `AVAILABLE`/`DEGRADED` standing;
- 401/403 authentication failure projects `REAUTH_REQUIRED`;
- Java and browser route handling both reject parsed pathname `/api` and `/api/...`, including `/api?view=shell`;
- JSON Schema, Java records, browser rendering and portable qualification carry matching fail-closed guards;
- fixed non-sensitive same-origin static cache allowlist, credential-omitted cache population and explicit activation/purge controls remain intact;
- PLATFORM-005 still creates no PostgreSQL state and gains no authentication, capability-routing, domain or effect authority.

## 5. Fresh qualification on the exact new subject

Exact source/test subject:

`cc67826bb608fc82459e23c59d5e0106d10422c6fe79f45f0571be60356b7d54`

Fresh qualification:

- strict Java 21 (`--release 21 -Xlint:all -Werror`): PASS, 369 main + 18 test sources;
- executable regression: 18/18 PASS;
- PLATFORM-005 focused: 120,088 PASS;
- contract parity: 6/6 PASS;
- persistence boundary: PASS, zero PostgreSQL objects;
- R022 recurrence: 13/13 PASS;
- system coherence: PASS, zero warnings;
- engineering congruence: PASS, zero exceptions;
- exact-subject gate: PASS;
- release manifest: 985/985 PASS;
- release-manifest SHA-256: `fd18c2f71a24949649012e8c8577342d016b9b604ea2ae6834ebfd6a5293fa80`;
- CURRENT-AUTHORITY SHA-256: `f66efdf741b0a04533d505df08d5a2a222dfc513987d34fcb252f4804619dfcf`;
- full local temporal-base-to-final unified diff SHA-256: `3721b21b26a2b71f762f09f2eab0ba4d1d8809909aa2d129d5960619a7672b34`.

## 6. Closure standing and remaining custody boundary

The portable SMR018 parsed-path residual is **closed** on exact subject `cc67826...`.

The complete runnable corrected source tree remains in local recovered custody rather than an ordinary GitHub-native immutable source commit. Therefore this result does **not** establish hosted exact-SHA qualification or A-01 Windows qualification. Those remain blocked on source import/hosted execution with a real completion delta.

`PC-ENDGAME-025` remains target-deferred.

## 7. Dependency-valid successor

SMR019 / CHAT-001A is now the dependency-valid next reconciliation step.

Its prior corrected subject cannot simply be promoted because it did not include the final `cc67826...` PLATFORM-005 predecessor state. Required sequence:

1. cumulatively rebase SMR019 onto exact SMR018 subject `cc67826...` while preserving the CHAT-001A `STREAM_CHECKPOINT` / `FINAL` standing repair;
2. derive a new exact SMR019 source/test subject;
3. rerun strict Java 21, all 19 executable suites, PLATFORM-005 and CHAT-001A focused/contract/recurrence gates, persistence, coherence, congruence, exact-subject and full release-manifest qualification;
4. only after that PASS may SMR020 / OPERATOR-OPS-001 unblock.

Until step 3 passes, SMR020 remains `BLOCKED — PREDECESSOR RECONCILIATION`.