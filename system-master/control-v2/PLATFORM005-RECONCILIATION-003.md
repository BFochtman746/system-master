# PLATFORM-005 / SMR018 — Reconciliation 003

Status: RESIDUAL DEFECT PROVEN / FOCUSED REPAIR RECORDED / EXACT COMPOSITE+ROUTE CANDIDATE REQUALIFICATION PENDING
Date: 2026-09-09
Authority: `PLATFORM-005`
Packet: `SYSTEM-MASTER-REBUILD-018`

## 1. Preserved authority lineage

This record does not rewrite or invalidate the independently qualified subjects preserved by earlier SMR018 records.

- historical sealed subject: `66657a53d962e045d3f24baee9da4d6a107a152a404b84e3c9973b90b22b906c`;
- temporal intermediate: `baadeae45c024369e16ef718d930e93099411f32cc938f80418c254506c2126d`;
- fail-closed-navigation component: `37e904e4666b99af6a5d5a458702104ffb591e3fa0f0d591effc269ae0c2dc3d`;
- last fully qualified composite: `0ae86ee36d00d3d5749e20889dafbcf85c1dd84baecbcc4bc34c8d39ba31553c`.

`PLATFORM005-RECONCILIATION-002.md` and `PLATFORM005-COMPOSITE-ASSEMBLY-002.md` remain authoritative for the `0ae86ee3...` composite qualification. No PASS transfers from that subject to any later changed candidate.

## 2. Demonstrated residual route defect

SMR018's route law requires work-surface routes to be origin-relative, non-API, normalized and bounded.

The inherited Java `ShellRules.route` implementation prohibited raw strings equal to `/api` or beginning `/api/` before URI parsing. A route such as:

`/api?view=shell`

therefore did not match either raw-string prohibition and was accepted by the Java work-surface descriptor path. The browser-side route validator parses the URL first and rejects the same value because its pathname is `/api`.

The discrepancy was reproduced directly against the inherited Java behavior: `/api?view=shell` was accepted as a work-surface route while browser pathname classification rejected it as API navigation.

This is an objective Java/browser route-law parity defect, not a preference or speculative hardening item.

## 3. Why the defect survives the qualified composite

The exact composite assembly defines `0ae86ee3...` as the merge of the temporal projection/cache repair and the fail-closed navigation/schema/browser repair.

The preserved temporal patch does not modify `ShellRules.java`. The preserved fail-closed navigation patch does not modify `ShellRules.java` either; it changes projection-state semantics, schemas, browser link enablement, authentication-state projection, cache generation and related integrity bindings.

Therefore the defined composite merge leaves the inherited `ShellRules.route` API-path logic unchanged. The residual `/api?...` bypass is consequently not repaired by the `0ae86ee3...` composite qualification.

## 4. Focused repair recorded

Durable focused patch:

`system-master/control-v2/PLATFORM005_PARSED_PATH_API_ROUTE_REPAIR_002.patch`

Patch SHA-256:

`7367644687ddb866a10fd4cee8b8fa8ed9a026d684ef29505c73c63ff7053f9e`

GitHub create commit:

`8d2cb9fb69a2adf832f03a49ea05370f1bf47a90`

The repair:

- parses the route URI before enforcing the API-path prohibition;
- validates `uri.getPath()` and rejects pathname `/api` or `/api/...` even when query text is present;
- preserves the existing absolute/protocol-relative/credential/fragment/backslash/traversal/encoded-separator/null fail-closed rules;
- adds a focused regression for `/api?view=shell`;
- strengthens PLATFORM-005 contract-parity verification to require parsed-path enforcement.

## 5. Qualification standing

No new exact composite+route candidate identity is claimed by this record.

A locally qualified temporal+route candidate was produced during investigation, but it did not contain the later fail-closed-navigation component that defines the current `0ae86ee3...` composite. It is therefore not the dependency-current SMR018 candidate and must not supersede the composite.

The complete exact `0ae86ee3...` runnable source tree is not presently available in ordinary GitHub-native source custody in this control workstream. The focused component patches are insufficient to reconstruct that exact subject because the recorded fail-closed component identity includes additional source/test candidate bytes beyond the focused GitHub patch.

Required completion sequence:

1. recover or import the exact `0ae86ee3...` composite source tree;
2. independently reproduce exact subject `0ae86ee3...` before modification;
3. apply `PLATFORM005_PARSED_PATH_API_ROUTE_REPAIR_002.patch` to those exact bytes;
4. derive a new source/test subject;
5. rerun strict Java 21, all 18 executable suites, PLATFORM-005 focused qualification, 6/6 contract parity, persistence boundary, R022, coherence, congruence, exact-subject and 985/985 release-manifest gates;
6. preserve the resulting exact candidate identity and evidence before downstream rebase.

Until that sequence is complete, `0ae86ee3...` remains the last fully qualified SMR018 composite subject but carries a proven unresolved route defect. It is not appropriate to claim a later defect-free SMR018 candidate.

## 6. Downstream dependency consequence

The previously recorded SMR019 candidate `5c9f5a73855ae9a154ac4ffca6dd57d167fca80e0b3bc55d55a24c180b19eaca` was independently reconstructed from the historical SMR019 carrier plus only the CHAT-001A standing repair. That exact reconstruction still contained pre-correction PLATFORM-005 browser/source bytes and therefore did not cumulatively absorb the corrected SMR018 predecessor state.

SMR019 must be rebased and requalified only after SMR018 has a final exact composite+route corrected subject. SMR020 is consequently blocked by predecessor reconciliation; it must not advance on the stale SMR019 candidate.

## 7. Evidence boundary

This record establishes a portable source-level discrepancy and a bounded repair specification. It does not establish:

- a new exact corrected composite identity;
- fresh hosted qualification;
- A-01 Windows qualification;
- live Safari/PWA/service-worker/BFCache behavior;
- production HTTP-header delivery;
- target-device qualification;
- production certification or promotion authority.

`PC-ENDGAME-025` remains separately deferred.