# CURRICULUM — Foundation Contract 001

**Capability** `C07` · **Owner** `SYSTEM_MASTER/LEARNING` · **Lane** `LEARNING`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. Populating this contract makes the capability specification-ready; it does not claim implementation or qualification PASS. Any changed subject requires fresh evidence.

## 1. Contract / interface

Operations: `define_goal`, `compile_curriculum`, `plan_lesson`, `plan_assessment`, `revise_sequence`.
Every operation uses the common request/response envelope and returns typed result, evidence reference, or typed failure. The capability does not inherit another owner's mutation authority.

## 2. Ingress routes

Learning/Chat request with learner goal, constraints, standards/evidence refs.
All ingress is admitted by the owning lane and the current CORE authority/dispatch controls; external side effects require CONNECTED_ACTIONS authorization.

## 3. Egress routes

curriculum graph, lesson/assessment plans, prerequisite/dependency records.
Cross-owner output is by typed interface/artifact/event reference, never by direct mutation of another owner's state.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/LEARNING`. LEARNING Curriculum service is canonical writer for curriculum/sequence state; CORE supplies physical persistence/evidence.
**Physical persistence:** CORE-owned shared persistence/artifact/evidence primitives may store bytes or records but do not become semantic owner. Non-owner writes are rejected and must be resubmitted through the canonical owner interface.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- LEARNING/LEARNING.
- RESEARCH/RESEARCH_KNOWLEDGE.
- MEDIA/MEDIA.
- DOCUMENTS/DOCUMENTS.

## 6. Failure semantics

Fail closed on authority mismatch, invalid input/schema, unavailable required dependency, rejected canonical write, or uncertain external-side-effect state. Curriculum changes that lack learner/goal identity, prerequisite consistency, or evidence linkage remain draft-only. Retries require the same `idempotency_key`; duplicate requests must return/recover the prior result or a typed conflict without duplicating durable state or external effects. Cancellation must preserve already-committed evidence and expose whether any irreversible effect occurred.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/curriculum-foundation-001.json`.
Required contents: `C07`, `CURRICULUM`, owner `SYSTEM_MASTER/LEARNING`, current authority/crosswalk identifiers, exact subject Git blobs, route coverage, canonical-writer assertion, dependency/failure/idempotency test results, acceptance command, result `PASS|FAIL`, and immutable evidence/artifact references.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js CURRICULUM`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js CURRICULUM`.
PASS requires the specification gate plus a current-authority evidence target with exact subject bindings and successful route, writer, dependency, failure, idempotency and owner-boundary tests.

## 9. Authority boundary

`SYSTEM_MASTER/LEARNING` may define and change this capability's domain semantics and internal implementation within the current contract. CORE retains shared runtime/A-01/durability infrastructure; RESEARCH_KNOWLEDGE retains source/provenance semantics; other peers retain their own domain state. Cross-owner contract or ownership changes require current authority/crosswalk/allocation update and fresh qualification.

## 10. Open implementation gaps

Contract specification is complete when the pre-code specification gate passes. Implementation, production, native/human/external qualification, and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
