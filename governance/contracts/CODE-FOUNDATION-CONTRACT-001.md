# CODE — Foundation Contract 001

**Capability** `C05` · **Owner** `SYSTEM_MASTER/PROGRAMMING` · **Lane** `PROGRAMMING`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. This does not claim implementation or qualification PASS.

## 1. Contract / interface

Operations: `inspect_source`, `plan_change`, `apply_patch`, `build`, `test`, `package`. Inputs include repository/project ref, exact target revision, allowed mutation scope and acceptance criteria; outputs are source diff, build/test/package results, artifact/evidence refs or typed failure.

## 2. Ingress routes

Chat/Automation/PROGRAMMING work item with repository/project ref, authority scope and acceptance target. Repository writes require owner-authorized mutation scope.

## 3. Egress routes

Source diff/commit candidate, build/test result, package/artifact ref, diagnostics, evidence and typed failure. External repository/provider mutations route through their authorized control interface.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/PROGRAMMING`. Code service writes programming work-item state and authorized source mutation lineage; the target repository/file owner remains canonical writer for accepted source state.
**Physical persistence:** CORE stores execution/evidence/artifacts; FILE/DOCUMENTS supplies file transport without owning code semantics.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- PROJECTS/CORE.
- FILE/DOCUMENTS.
- AUTOMATION/PROGRAMMING.
- RESEARCH/RESEARCH_KNOWLEDGE.

## 6. Failure semantics

Fail closed on revision drift, mutation outside scope, build/test failure, authority mismatch, dependency failure or rejected source write. A failing build/test never promotes a patch as accepted. Retries reuse `idempotency_key` and exact base revision; drift requires re-plan/requalification rather than replay against changed source.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/code-foundation-001.json`.
Required contents: `C05`, `CODE`, owner `SYSTEM_MASTER/PROGRAMMING`, current authority/crosswalk identifiers, exact subject Git blobs, inspect/patch/build/test/package coverage, revision/writer/dependency/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js CODE`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js CODE`.
PASS requires exact-base patching, mutation-scope rejection, real build/test execution, failed-test nonpromotion, writer isolation and revision-drift/idempotent replay proof.

## 9. Authority boundary

`SYSTEM_MASTER/PROGRAMMING` owns software-engineering semantics. CORE owns shared runtime/A-01/durability; CONNECTED_ACTIONS owns external side effects; repository/project owners retain authority over accepted target state. Cross-owner changes require fresh authority and qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/provider/external qualification and Foundation evidence remain open until implementation acceptance passes and a current receipt is admitted.
