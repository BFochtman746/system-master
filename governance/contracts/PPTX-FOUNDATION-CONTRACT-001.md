# PPTX — Foundation Contract 001

**Capability** `C28` · **Owner** `SYSTEM_MASTER/DOCUMENTS` · **Lane** `DOCUMENTS`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. Populating this contract makes the capability specification-ready; it does not claim implementation or qualification PASS. Any changed subject requires fresh evidence.

## 1. Contract / interface

Operations: `create_presentation`, `edit_slide`, `render_presentation`, `inspect_presentation`, `export_presentation`.
Inputs are slide/content/asset refs and presentation policy; outputs are presentation/artifact/render refs, inspection evidence or typed failure.

## 2. Ingress routes

Chat/Automation or owner-system request with slide/content/asset refs. DOCUMENTS admits presentation mutation; external publishing requires CONNECTED_ACTIONS.

## 3. Egress routes

PPTX artifact ref, rendered slide refs, presentation metadata, inspection/evidence report.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/DOCUMENTS`. PPTX service writes presentation semantic model/export manifest and slide/version metadata.
**Physical persistence:** CORE artifact store writes immutable PPTX/render binaries; upstream data/media semantics remain with their owners.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- FILE/DOCUMENTS.
- IMAGE/MEDIA.
- DATA/SPREADSHEET_DATA for supplied structured data/charts.

## 6. Failure semantics

Fail closed on invalid slide graph, missing asset/data ref, authority failure, render/export error or rejected canonical write. Failed export cannot replace the prior valid artifact. Retries reuse `idempotency_key` and must recover the prior committed presentation version.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/pptx-foundation-001.json`.
Required contents: `C28`, `PPTX`, owner `SYSTEM_MASTER/DOCUMENTS`, current authority/crosswalk identifiers, exact subject Git blobs, route/render coverage, canonical-writer, dependency/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js PPTX`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js PPTX`.
PASS requires create/edit/render/inspect/export cases, asset/data dependency behavior, writer isolation, rollback and idempotent replay.

## 9. Authority boundary

`SYSTEM_MASTER/DOCUMENTS` owns generic presentation mechanics. MEDIA owns media generation, SPREADSHEET_DATA owns data semantics, CORE owns physical artifact/evidence durability. Cross-owner changes require current authority/crosswalk/allocation update and fresh qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/native/external qualification and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
