# IMG-INGEST — Foundation Contract 001

**Capability** `C16` · **Owner** `SYSTEM_MASTER/DOCUMENTS` · **Lane** `DOCUMENTS`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. Populating this contract makes the capability specification-ready; it does not claim implementation or qualification PASS. Any changed subject requires fresh evidence.

## 1. Contract / interface

Operations: `ingest_image`, `normalize_image`, `extract_metadata`, `segment_image`, `route_for_extraction`.
Inputs require immutable source identity; outputs are normalized refs, metadata/regions and downstream extraction routes.

## 2. Ingress routes

Photo/file attachment or owner-system ingest request with source hash and declared source type. DOCUMENTS admits ingest; native acquisition remains outside this contract until supplied as a file/photo ref.

## 3. Egress routes

Normalized image ref, metadata, page/region descriptors, OCR/media route request, and typed failure/evidence result.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/DOCUMENTS`. Image-Ingest writes ingest/normalization descriptors and source-to-derived lineage.
**Physical persistence:** CORE artifact store preserves immutable original and normalized binaries; MEDIA remains semantic owner of photo/image creation/editing state.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- FILE/DOCUMENTS.
- OCR/DOCUMENTS.
- PHOTO/MEDIA for Media-owned photo semantics.

## 6. Failure semantics

Fail closed on source-hash mismatch, decode/format ambiguity, unsupported normalization, authority mismatch, or dependency failure. Original source bytes are never mutated. Retries use the same `idempotency_key` and must reuse the prior normalized lineage for the same source/options.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/img-ingest-foundation-001.json`.
Required contents: `C16`, `IMG-INGEST`, owner `SYSTEM_MASTER/DOCUMENTS`, current authority/crosswalk identifiers, exact subject Git blobs, route coverage, source/derived lineage proof, writer/dependency/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js IMG-INGEST`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js IMG-INGEST`.
PASS requires exact-source ingest, normalization, metadata/segmentation routing, immutable-original, dependency failure and idempotency tests.

## 9. Authority boundary

`SYSTEM_MASTER/DOCUMENTS` owns ingestion/normalization/extraction-routing semantics. MEDIA owns image/photo creation and edits; CORE owns physical artifact durability. Cross-owner changes require current authority/crosswalk/allocation update and fresh qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/native/external qualification and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
