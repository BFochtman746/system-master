# WEBSITE_BUILDING — Foundation Contract 001

**Capability** `C40` · **Owner** `SYSTEM_MASTER/PROGRAMMING` · **Lane** `PROGRAMMING`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. Website Building is a Programming-owned capability, not a tenth peer system, and this contract does not claim implementation or qualification PASS.

## 1. Contract / interface

Operations: `scaffold_site`, `edit_site`, `build_site`, `preview_site`, `test_site`, `package_site`, `request_deploy`. Inputs include project/repository ref, requirements, target stack and deployment authority; outputs are source diff, build/test/preview/package results, deployment request/evidence or typed failure.

## 2. Ingress routes

Chat/Automation/PROGRAMMING request with project/repository ref, requirements and target/deployment constraints. PROGRAMMING admits site engineering; external deploy or browser mutation requires CONNECTED_ACTIONS authorization.

## 3. Egress routes

Source diff, build/test/preview results, package artifact, diagnostics, evidence and optional CONNECTED_ACTIONS deployment request.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/PROGRAMMING`. Website-Building service writes site project/source/build configuration and packaging state; accepted repository state remains under authorized repository mutation rules.
**Physical persistence:** CORE stores execution/evidence/build artifacts; CONNECTED_ACTIONS controls external deployment/provider state.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- CODE/PROGRAMMING.
- AUTOMATION/PROGRAMMING.
- BROWSER/CONNECTED_ACTIONS for preview/browser verification.
- FILE/DOCUMENTS for assets/packages.

## 6. Failure semantics

Fail closed on invalid requirements/target, revision drift, build/test failure, missing deployment authority, dependency failure or unknown deployment state. Failed builds never replace a known-good package. Retries reuse `idempotency_key`; deployment retries require provider-state reconciliation when outcome is uncertain.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/website-building-foundation-001.json`.
Required contents: `C40`, `WEBSITE_BUILDING`, owner `SYSTEM_MASTER/PROGRAMMING`, current authority/crosswalk identifiers, exact subject Git blobs, scaffold/edit/build/preview/test/package/deploy-boundary coverage, writer/dependency/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js WEBSITE_BUILDING`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js WEBSITE_BUILDING`.
PASS requires deterministic build/test/package, browser-preview boundary, deployment authorization/reconciliation, revision-drift handling, writer isolation and idempotent replay proof.

## 9. Authority boundary

`SYSTEM_MASTER/PROGRAMMING` owns Website Building C40 software-engineering semantics. It does not become a peer system and does not inherit CONNECTED_ACTIONS browser/deployment side-effect authority. CORE owns shared runtime/evidence. Cross-owner changes require current authority/crosswalk/allocation update and fresh qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Framework/browser/deployment-provider, production/external qualification and Foundation evidence remain open until implementation acceptance passes and a current receipt is admitted.
