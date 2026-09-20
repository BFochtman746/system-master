# LEDGER — Foundation Contract 001

**Capability** `C19` · **Owner** `SYSTEM_MASTER/SPREADSHEET_DATA` · **Lane** `SPREADSHEET_DATA`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. Populating this contract makes the capability specification-ready; it does not claim implementation or qualification PASS. Any changed subject requires fresh evidence.

## 1. Contract / interface

Operations: `append_entry`, `read_ledger`, `reconcile_ledger`, `derive_balance`, `export_ledger`. Appends require ledger id, immutable event id, schema/version and idempotency identity.

## 2. Ingress routes

Owner-system append/query/reconcile request through current dispatch controls. No peer may write ledger storage directly.

## 3. Egress routes

Append receipt, query/reconciliation result, derived balance, export ref and typed failure/evidence.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/SPREADSHEET_DATA`. Ledger service is sole semantic writer for ledger entries and reconciliation state.
**Physical persistence:** CORE persistence writes the physical durable record under append-only/content-addressed/CAS rules; non-ledger direct writes are rejected.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- DATA/SPREADSHEET_DATA.
- MATH/SPREADSHEET_DATA.

## 6. Failure semantics

Fail closed on duplicate event identity with divergent payload, schema mismatch, sequence/CAS conflict, dependency failure or rejected write. Append is atomic. Retries reuse `idempotency_key`; exact duplicates return the original receipt, while conflicting duplicates return a typed conflict.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/ledger-foundation-001.json`.
Required contents: `C19`, `LEDGER`, owner `SYSTEM_MASTER/SPREADSHEET_DATA`, current authority/crosswalk identifiers, exact subject Git blobs, append/query/reconcile route coverage, writer/CAS/idempotency/failure tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js LEDGER`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js LEDGER`.
PASS requires atomic append, duplicate replay, divergent duplicate rejection, reconcile/read/export, writer isolation and recovery proof.

## 9. Authority boundary

`SYSTEM_MASTER/SPREADSHEET_DATA` owns ledger semantics; CORE owns shared physical durability and transaction primitives only. Cross-owner changes require current authority/crosswalk/allocation update and fresh qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/native/external qualification and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
