# BROWSER — Foundation Contract 001

**Capability** `C02` · **Owner** `SYSTEM_MASTER/CONNECTED_ACTIONS` · **Lane** `CONNECTED_ACTIONS`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. This does not claim implementation or qualification PASS.

## 1. Contract / interface

Operations: `navigate`, `read_page`, `submit_form`, `download`, `capture_page`. Inputs include URL/target, intended action, user authority and data payload when applicable; outputs include page/content refs, downloads/screenshots and action receipts.

## 2. Ingress routes

User-authorized Chat/Automation request or approved connector workflow. CONNECTED_ACTIONS admits every external navigation/action; no dependent capability inherits browser mutation authority.

## 3. Egress routes

Page content/metadata, download refs, screenshots, typed action receipts, redirects and failures. External mutations are reported as proposed/authorized/committed/unknown.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/CONNECTED_ACTIONS`. Browser service writes browser session/action/consent ledger state.
**Physical persistence:** CORE stores evidence/artifacts; external websites remain canonical writers for remote state. Local evidence never substitutes for provider state.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- PLUGINS/CONNECTED_ACTIONS.
- FILE/DOCUMENTS for downloads/uploads.
- RESEARCH/RESEARCH_KNOWLEDGE for read-only research consumers.

## 6. Failure semantics

Fail closed on missing user authority, ambiguous target, authentication/permission failure, navigation/form uncertainty, dependency failure or unknown side-effect outcome. Retries reuse `idempotency_key`; mutations are not replayed when commit state is unknown until reconciled.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/browser-foundation-001.json`.
Required contents: `C02`, `BROWSER`, owner `SYSTEM_MASTER/CONNECTED_ACTIONS`, current authority/crosswalk identifiers, exact subject Git blobs, read/write route coverage, consent/side-effect/writer/dependency/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js BROWSER`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js BROWSER`.
PASS requires read-only and mutating routes, permission rejection, unknown-commit reconciliation, download/artifact routing and idempotent replay proof.

## 9. Authority boundary

`SYSTEM_MASTER/CONNECTED_ACTIONS` owns browser/action policy and external side-effect authority. PROGRAMMING Website Building may consume browser interfaces but cannot inherit that authority; CORE owns shared runtime/evidence only. Cross-owner changes require fresh authority and qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/provider/user-auth qualification and Foundation evidence remain open until implementation acceptance passes and a current receipt is admitted.
