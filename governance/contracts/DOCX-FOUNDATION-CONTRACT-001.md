# DOCX — Foundation Contract 001

**Capability** `C09` · **Owner** `SYSTEM_MASTER/DOCUMENTS` · **Lane** `DOCUMENTS`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. Populating this contract makes the capability specification-ready; it does not claim implementation or qualification PASS. Any changed subject requires fresh evidence.

## 1. Contract / interface

Operations: `create_docx`, `edit_docx`, `render_docx`, `inspect_docx`, `export_docx`.
Inputs are structured document/content refs plus layout/export policy; outputs are DOCX artifact refs, render/inspection results, metadata, evidence, or typed failure. Authored-text semantics remain with the source owner.

## 2. Ingress routes

Chat/Automation or owner-system request with document model/content refs. All ingress is admitted by DOCUMENTS through current CORE dispatch controls; external file destinations require CONNECTED_ACTIONS authority.

## 3. Egress routes

DOCX artifact ref, render/inspection report, document metadata, and typed completion/failure event. Cross-owner output is by artifact/interface reference rather than direct mutation.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/DOCUMENTS`. DOCUMENTS DOCX service writes document model/export manifest and version metadata; source-domain content remains owned by its originating system.
**Physical persistence:** CORE artifact storage is sole physical writer for immutable DOCX/render binaries. Non-owner semantic writes are rejected.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- FILE/DOCUMENTS for file identity/versioning.
- IMAGE/MEDIA for supplied visual assets.
- WRITING/BOOK only when Book-owned authored prose semantics are requested.

## 6. Failure semantics

Fail closed on authority mismatch, malformed document model, unresolved asset ref, unsafe/unsupported mutation, render failure, or rejected canonical write. A failed export never replaces the prior valid artifact. Retries reuse `idempotency_key` and must return the existing committed artifact or a typed conflict without duplicate versions.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/docx-foundation-001.json`.
Required contents: `C09`, `DOCX`, owner `SYSTEM_MASTER/DOCUMENTS`, current authority/crosswalk identifiers, exact subject Git blobs, route coverage, canonical-writer assertion, dependency/failure/idempotency test results, acceptance command, result `PASS|FAIL`, and immutable artifact/evidence refs.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js DOCX`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js DOCX`.
PASS requires current-subject evidence proving create/edit/render/inspect/export routes, writer isolation, deterministic artifact identity where applicable, dependency failures and idempotent retries.

## 9. Authority boundary

`SYSTEM_MASTER/DOCUMENTS` owns generic DOCX/document mechanics. BOOK owns Book text/manuscript semantics; MEDIA owns image/media semantics; CORE owns shared storage/evidence primitives. Cross-owner contract changes require authority/crosswalk/allocation update and fresh qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/native/external qualification and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
