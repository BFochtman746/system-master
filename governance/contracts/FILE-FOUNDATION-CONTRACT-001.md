# FILE — Foundation Contract 001

**Capability** `C13` · **Owner** `SYSTEM_MASTER/DOCUMENTS` · **Lane** `DOCUMENTS`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. Populating this contract makes the capability specification-ready; it does not claim implementation or qualification PASS. Any changed subject requires fresh evidence.

## 1. Contract / interface

Operations: `import_file`, `read_file`, `version_file`, `export_file`, `resolve_file_ref`.
The interface owns stable logical file/version identity and metadata, not another system's domain semantics.

## 2. Ingress routes

User import, Chat attachment, owner-system artifact handoff, or approved external download. DOCUMENTS admits the file operation; remote acquisition/export is authorized by CONNECTED_ACTIONS when applicable.

## 3. Egress routes

Stable file/version refs, metadata, content-addressed byte refs, export package refs, and typed failures.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/DOCUMENTS`. DOCUMENTS File service writes file descriptors, logical version lineage and format metadata.
**Physical persistence:** CORE artifact store is sole physical writer for immutable file bytes/content hashes. Direct byte replacement that bypasses version lineage is rejected.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- IMG-INGEST/DOCUMENTS for image normalization.
- OCR/DOCUMENTS for text extraction.
- PLUGINS/CONNECTED_ACTIONS for remote import/export.

## 6. Failure semantics

Fail closed on missing authority, path/ref ambiguity, content-hash mismatch, unsupported mutation, dependency failure, or rejected canonical write. Imports are content-addressed; retries use the same `idempotency_key` and cannot create duplicate logical versions from identical committed content.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/file-foundation-001.json`.
Required contents: `C13`, `FILE`, owner `SYSTEM_MASTER/DOCUMENTS`, current authority/crosswalk identifiers, exact subject Git blobs, route coverage, canonical-writer assertion, content-address/idempotency/dependency-failure tests, acceptance command, result `PASS|FAIL`, and immutable evidence refs.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js FILE`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js FILE`.
PASS requires import/read/version/export/resolve route tests plus content-hash, writer-isolation, failed-write and idempotent-retry proof.

## 9. Authority boundary

`SYSTEM_MASTER/DOCUMENTS` owns file descriptor/version semantics. CORE owns physical artifact durability; CONNECTED_ACTIONS owns remote side-effect authority; peer systems own the meaning of content they place in files. Cross-owner changes require fresh authority and qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/native/external qualification and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
