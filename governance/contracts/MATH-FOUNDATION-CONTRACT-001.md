# MATH — Foundation Contract 001

**Capability** `C22` · **Owner** `SYSTEM_MASTER/SPREADSHEET_DATA` · **Lane** `SPREADSHEET_DATA`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. Populating this contract makes the capability specification-ready; it does not claim implementation or qualification PASS. Any changed subject requires fresh evidence.

## 1. Contract / interface

Operations: `evaluate_expression`, `compute_statistics`, `optimize`, `validate_formula`, `explain_calculation`. Inputs must carry units/types and method/precision constraints where relevant.

## 2. Ingress routes

Chat/DATA/EXCEL request with typed numeric inputs, units, method and precision constraints.

## 3. Egress routes

Numeric/statistical/optimization result, derivation/method metadata, validation evidence or typed failure.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/SPREADSHEET_DATA`. MATH is stateless by default; when persisted, the SPREADSHEET_DATA calculation workspace is canonical semantic writer.
**Physical persistence:** CORE writes durable calculation/evidence records and artifacts when persistence is requested.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- DATA/SPREADSHEET_DATA.
- EXCEL/SPREADSHEET_DATA.

## 6. Failure semantics

Fail closed on invalid units/types, undefined/non-convergent operation, precision violation, dependency failure or unsafe optimization constraints. Approximation/uncertainty must be explicit. Retries use the same `idempotency_key`; deterministic inputs/method/version must produce or recover the same committed result.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/math-foundation-001.json`.
Required contents: `C22`, `MATH`, owner `SYSTEM_MASTER/SPREADSHEET_DATA`, current authority/crosswalk identifiers, exact subject Git blobs, operation/precision/unit coverage, writer/dependency/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js MATH`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js MATH`.
PASS requires deterministic reference cases, unit/type errors, non-convergence/precision behavior, persistence-writer isolation and idempotent replay.

## 9. Authority boundary

`SYSTEM_MASTER/SPREADSHEET_DATA` owns calculation/statistical/optimization semantics. CORE owns shared runtime/durability; caller systems own the domain meaning of supplied inputs/results. Cross-owner changes require current authority/crosswalk/allocation update and fresh qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/native/external qualification and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
