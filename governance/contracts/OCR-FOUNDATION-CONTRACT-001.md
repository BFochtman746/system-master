# OCR — Foundation Contract 001

**Capability** `C24` · **Owner** `SYSTEM_MASTER/DOCUMENTS` · **Lane** `DOCUMENTS`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. Populating this contract makes the capability specification-ready; it does not claim implementation or qualification PASS. Any changed subject requires fresh evidence.

## 1. Contract / interface

Operations: `extract_text`, `extract_layout`, `extract_tables`, `ocr_region`, `validate_extraction`.
Inputs are immutable image/PDF source refs plus extraction policy; outputs are source-bound extraction records with confidence/provenance.

## 2. Ingress routes

IMG-INGEST/PDF/File request with immutable source ref, region/page scope and extraction policy.

## 3. Egress routes

Text/layout/table extraction record, confidence/evidence, derived artifact refs, and typed unsupported/low-confidence results.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/DOCUMENTS`. OCR writes extraction records tied to immutable source hashes and extraction version.
**Physical persistence:** CORE persists extraction/evidence records and immutable source/derived artifacts; OCR never mutates source binaries.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- IMG-INGEST/DOCUMENTS.
- PDF/DOCUMENTS.
- FILE/DOCUMENTS.

## 6. Failure semantics

Fail closed on missing/mismatched source identity, unsupported content, authority/schema failure, unavailable required dependency, or rejected extraction write. Low confidence is a typed result, not a fabricated success. Retries reuse `idempotency_key` and source/extractor version.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/ocr-foundation-001.json`.
Required contents: `C24`, `OCR`, owner `SYSTEM_MASTER/DOCUMENTS`, current authority/crosswalk identifiers, exact subject Git blobs, route/source-binding coverage, canonical-writer, confidence/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js OCR`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js OCR`.
PASS requires text/layout/table extraction cases, source-hash binding, unsupported/low-confidence behavior, dependency failure and idempotent replay proof.

## 9. Authority boundary

`SYSTEM_MASTER/DOCUMENTS` owns OCR/extraction semantics. Source-domain meaning remains with the source owner; CORE owns physical durability only. Cross-owner changes require current authority/crosswalk/allocation update and fresh qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/native/external qualification and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
