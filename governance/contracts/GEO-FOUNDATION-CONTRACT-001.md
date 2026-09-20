# GEO — Foundation Contract 001

**Capability** `C14` · **Owner** `SYSTEM_MASTER/RESEARCH_KNOWLEDGE` · **Lane** `RESEARCH_KNOWLEDGE`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. This does not claim implementation or qualification PASS.

## 1. Contract / interface

Operations: `geocode`, `reverse_geocode`, `resolve_place`, `route_context`, `spatial_query`. Inputs are place/location refs, spatial constraints and provenance policy; outputs are geospatial facts/refs with source provenance or typed failure.

## 2. Ingress routes

Research/Chat request with location/place refs and provenance requirements. RESEARCH_KNOWLEDGE admits semantic geo work; provider calls route through CONNECTED_ACTIONS.

## 3. Egress routes

Coordinates/place refs, route/spatial context, provenance/source refs, confidence/ambiguity state and typed failure.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/RESEARCH_KNOWLEDGE`. Geo service writes derived geospatial knowledge/provenance records and normalized place identities.
**Physical persistence:** CORE persists records/evidence; external providers remain source authorities and are not written by GEO.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- RESEARCH/RESEARCH_KNOWLEDGE.
- BROWSER/CONNECTED_ACTIONS.
- PLUGINS/CONNECTED_ACTIONS.

## 6. Failure semantics

Fail closed on unresolved/ambiguous place identity when precision is required, stale/invalid source, provider failure, authority mismatch or rejected write. Ambiguity is surfaced rather than guessed. Retries reuse `idempotency_key`; provider reads may be repeated but durable normalized results are not duplicated.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/geo-foundation-001.json`.
Required contents: `C14`, `GEO`, owner `SYSTEM_MASTER/RESEARCH_KNOWLEDGE`, current authority/crosswalk identifiers, exact subject Git blobs, geocode/reverse/place/spatial route coverage, provenance/writer/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js GEO`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js GEO`.
PASS requires unambiguous and ambiguous cases, provider failure, provenance binding, writer isolation and idempotent replay.

## 9. Authority boundary

`SYSTEM_MASTER/RESEARCH_KNOWLEDGE` owns geospatial interpretation/provenance semantics. CONNECTED_ACTIONS owns provider access/actions; CORE owns shared durability. Cross-owner changes require fresh authority and qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/provider/external qualification and Foundation evidence remain open until implementation acceptance passes and a current receipt is admitted.
