# PHOTO — Foundation Contract 001

**Capability** `C26` · **Owner** `SYSTEM_MASTER/MEDIA` · **Lane** `MEDIA`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. This does not claim implementation or qualification PASS.

## 1. Contract / interface

Operations: `import_photo`, `normalize_photo`, `edit_photo`, `inspect_photo`, `export_photo`. Inputs are native/file source refs and edit policy; outputs are photo refs, edit recipe, inspection metadata or typed failure.

## 2. Ingress routes

User/native capture or FILE/MEDIA request with immutable source identity and edit policy. Native capture permission is an upstream authority prerequisite, not implied by this contract.

## 3. Egress routes

Photo asset refs, edit recipe, metadata, inspection/evidence and export refs.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/MEDIA`. Photo service writes photo-asset/edit semantic state.
**Physical persistence:** CORE artifact storage writes immutable original/derived photo binaries; DOCUMENTS Image-Ingest may normalize file representations without becoming photo semantic owner.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- IMG-INGEST/DOCUMENTS.
- FILE/DOCUMENTS.
- IMAGE/MEDIA.

## 6. Failure semantics

Fail closed on missing native/user authority, source-hash mismatch, unsupported edit, dependency failure or rejected write. Originals remain immutable. Retries reuse `idempotency_key` and must recover the same edit lineage for identical source/options.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/photo-foundation-001.json`.
Required contents: `C26`, `PHOTO`, owner `SYSTEM_MASTER/MEDIA`, current authority/crosswalk identifiers, exact subject Git blobs, import/edit/inspect/export coverage, original-preservation, writer/dependency/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js PHOTO`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js PHOTO`.
PASS requires source identity, original immutability, edit/export routes, permission failure, writer isolation and idempotent replay proof.

## 9. Authority boundary

`SYSTEM_MASTER/MEDIA` owns photo asset/edit semantics. DOCUMENTS owns generic ingest/file mechanics; CORE owns physical durability; native permission remains explicit platform/user authority. Cross-owner changes require fresh authority and qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Native/production/external qualification and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
