# EXCEL — Foundation Contract 001

**Capability** `C10` · **Owner** `SYSTEM_MASTER/SPREADSHEET_DATA` · **Lane** `SPREADSHEET_DATA`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. Populating this contract makes the capability specification-ready; it does not claim implementation or qualification PASS. Any changed subject requires fresh evidence.

## 1. Contract / interface

Operations: `create_workbook`, `edit_workbook`, `calculate_workbook`, `chart_workbook`, `export_workbook`. Inputs are workbook/data refs, formulas and format policy; outputs are workbook/artifact refs, calculations/charts, validation evidence or typed failure.

## 2. Ingress routes

Chat/Automation or DATA request with workbook/data refs and calculation intent. SPREADSHEET_DATA admits workbook mutations; external destinations require CONNECTED_ACTIONS.

## 3. Egress routes

XLSX artifact ref, calculation/chart results, workbook metadata and validation evidence.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/SPREADSHEET_DATA`. Excel service writes workbook semantic model, formula graph and version metadata.
**Physical persistence:** CORE artifact store writes immutable XLSX/render/export binaries; DOCUMENTS may transport files but does not own workbook semantics.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- DATA/SPREADSHEET_DATA.
- MATH/SPREADSHEET_DATA.
- FILE/DOCUMENTS.

## 6. Failure semantics

Fail closed on invalid formula/schema, circular dependency not explicitly permitted, unresolved data ref, calculation/export failure or rejected canonical write. Failed calculation/export does not replace prior valid workbook state. Retries reuse `idempotency_key` and recover the committed version.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/excel-foundation-001.json`.
Required contents: `C10`, `EXCEL`, owner `SYSTEM_MASTER/SPREADSHEET_DATA`, current authority/crosswalk identifiers, exact subject Git blobs, workbook/formula/chart route coverage, writer/dependency/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js EXCEL`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js EXCEL`.
PASS requires create/edit/calculate/chart/export cases, formula correctness, failed-write rollback, writer isolation and idempotent replay.

## 9. Authority boundary

`SYSTEM_MASTER/SPREADSHEET_DATA` owns workbook and spreadsheet semantics. DOCUMENTS owns generic file mechanics; CORE owns physical durability; other peers consume by interface. Cross-owner changes require current authority/crosswalk/allocation update and fresh qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/native/external qualification and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
