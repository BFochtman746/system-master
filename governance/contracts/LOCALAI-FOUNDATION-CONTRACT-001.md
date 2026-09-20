# LOCALAI — Foundation Contract 001

**Capability** `C20` · **Owner** `SYSTEM_MASTER/CORE` · **Lane** `CORE`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. Populating this contract makes the capability specification-ready; it does not claim implementation or qualification PASS. Any changed subject requires fresh evidence.

## 1. Contract / interface

Operations: `list_models`, `select_model`, `run_inference`, `cancel_inference`, `inspect_runtime`.
Every operation uses the common request/response envelope and returns typed result, evidence reference, or typed failure. The capability does not inherit another owner's mutation authority.

## 2. Ingress routes

Internal capability request with model requirements, privacy/resource policy and input refs.
All ingress is admitted by the owning lane and the current CORE authority/dispatch controls; external side effects require CONNECTED_ACTIONS authorization.

## 3. Egress routes

model selection, inference result/stream, resource/evidence metrics.
Cross-owner output is by typed interface/artifact/event reference, never by direct mutation of another owner's state.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/CORE`. CORE LocalAI runtime writes local model/runtime/cache state; caller owner remains writer for domain results.
**Physical persistence:** CORE-owned shared persistence/artifact/evidence primitives may store bytes or records but do not become semantic owner. Non-owner writes are rejected and must be resubmitted through the canonical owner interface.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- FILE/DOCUMENTS for model/input artifacts.
- DATA/SPREADSHEET_DATA for structured inputs when needed.

## 6. Failure semantics

Fail closed on authority mismatch, invalid input/schema, unavailable required dependency, rejected canonical write, or uncertain external-side-effect state. No partial success may be promoted as completion. Retries require the same `idempotency_key`; duplicate requests must return/recover the prior result or a typed conflict without duplicating durable state or external effects. Cancellation must preserve already-committed evidence and expose whether any irreversible effect occurred.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/localai-foundation-001.json`.
Required contents: `C20`, `LOCALAI`, owner `SYSTEM_MASTER/CORE`, current authority/crosswalk identifiers, exact subject Git blobs, route coverage, canonical-writer assertion, dependency/failure/idempotency test results, acceptance command, result `PASS|FAIL`, and immutable evidence/artifact references.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js LOCALAI`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js LOCALAI`.
PASS requires the specification gate plus a current-authority evidence target with exact subject bindings and successful route, writer, dependency, failure, idempotency and owner-boundary tests.

## 9. Authority boundary

`SYSTEM_MASTER/CORE` may define and change this capability's domain semantics and internal implementation within the current contract. CORE retains shared runtime/A-01/durability infrastructure; CONNECTED_ACTIONS retains user-authorized external side-effect policy; other peers retain their own domain state. Cross-owner contract or ownership changes require current authority/crosswalk/allocation update and fresh qualification.

## 10. Open implementation gaps

Contract specification is complete when the pre-code specification gate passes. Implementation, production, native/human/external qualification, and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
