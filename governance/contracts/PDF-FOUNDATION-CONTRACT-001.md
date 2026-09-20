# PDF — Foundation Contract 001

**Capability** `C25` · **Owner** `SYSTEM_MASTER/DOCUMENTS` · **Lane** `DOCUMENTS`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. Populating this contract makes the capability specification-ready; it does not claim implementation or qualification PASS. Any changed subject requires fresh evidence.

## 1. Contract / interface

Operations: `create_pdf`, `render_pdf`, `merge_pdf`, `split_pdf`, `inspect_pdf`, `export_pdf`.
Inputs are document/artifact refs and deterministic operation policy; outputs are PDF/page/render refs, inspection metadata or typed failure.

## 2. Ingress routes

Chat/Automation or owner-system request with document/content/artifact refs. DOCUMENTS admits PDF mutations; external destinations require CONNECTED_ACTIONS.

## 3. Egress routes

PDF artifact ref, render/inspection result, page/metadata refs, extraction routes and evidence.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/DOCUMENTS`. PDF service writes PDF document/export manifest and page/version metadata.
**Physical persistence:** CORE artifact store writes immutable PDF/render binaries; source-owner semantic content remains outside PDF ownership.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- FILE/DOCUMENTS.
- IMAGE/MEDIA for supplied image assets.
- OCR/DOCUMENTS for extraction from rendered/imported PDFs.

## 6. Failure semantics

Fail closed on malformed PDF/source, unresolved page/assets, authority failure, unsupported operation, render/inspection failure or rejected write. Failed merge/split/export never replaces prior valid artifacts. Retries reuse `idempotency_key` and do not create duplicate artifacts for the same exact operation.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/pdf-foundation-001.json`.
Required contents: `C25`, `PDF`, owner `SYSTEM_MASTER/DOCUMENTS`, current authority/crosswalk identifiers, exact subject Git blobs, route coverage, writer/artifact identity, dependency/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js PDF`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js PDF`.
PASS requires create/render/merge/split/inspect/export cases, writer isolation, failed-operation rollback and idempotent replay.

## 9. Authority boundary

`SYSTEM_MASTER/DOCUMENTS` owns generic PDF mechanics. BOOK owns Book semantics, MEDIA owns media semantics, CORE owns physical artifact/evidence durability. Cross-owner changes require current authority/crosswalk/allocation update and fresh qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/native/external qualification and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
