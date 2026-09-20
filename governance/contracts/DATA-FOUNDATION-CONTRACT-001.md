# DATA — Foundation Contract 001

**Capability** `C08` · **Owner** `SYSTEM_MASTER/SPREADSHEET_DATA` · **Lane** `SPREADSHEET_DATA`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. Populating this contract makes the capability specification-ready; it does not claim implementation or qualification PASS. Any changed subject requires fresh evidence.

## 1. Contract / interface

Operations: `ingest_dataset`, `profile_dataset`, `query_dataset`, `transform_dataset`, `export_dataset`. Inputs are dataset/file refs, schema and transformation intent; outputs are typed datasets/tables, lineage, export refs, evidence, or typed failure.

## 2. Ingress routes

Chat/Automation or Spreadsheet/Data work item with dataset/file refs and schema intent. SPREADSHEET_DATA admits semantic data work; remote acquisition/export routes through CONNECTED_ACTIONS.

## 3. Egress routes

Typed tables/datasets, transformation results, lineage, export refs and evidence. Cross-owner consumers receive typed refs/results rather than direct data-store mutation.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/SPREADSHEET_DATA`. DATA writes dataset metadata, schema and transformation lineage.
**Physical persistence:** CORE shared persistence/artifact storage writes immutable payloads and durable records without owning data-analysis semantics.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- FILE/DOCUMENTS.
- MATH/SPREADSHEET_DATA.
- LEDGER/SPREADSHEET_DATA.
- EXCEL/SPREADSHEET_DATA.

## 6. Failure semantics

Fail closed on authority/schema mismatch, unresolved source identity, unsafe transformation, required-dependency failure or rejected canonical write. Transformations are versioned; retries reuse `idempotency_key` and never duplicate committed lineage or overwrite a prior valid dataset silently.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/data-foundation-001.json`.
Required contents: `C08`, `DATA`, owner `SYSTEM_MASTER/SPREADSHEET_DATA`, current authority/crosswalk identifiers, exact subject Git blobs, route/schema/lineage coverage, writer/dependency/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js DATA`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js DATA`.
PASS requires ingest/profile/query/transform/export cases plus writer isolation, schema failure, dependency failure and idempotent replay proof.

## 9. Authority boundary

`SYSTEM_MASTER/SPREADSHEET_DATA` owns product data-analysis semantics. DOCUMENTS owns file mechanics; CORE owns shared persistence/runtime; CONNECTED_ACTIONS owns external side effects. Cross-owner changes require current authority/crosswalk/allocation update and fresh qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/native/external qualification and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
