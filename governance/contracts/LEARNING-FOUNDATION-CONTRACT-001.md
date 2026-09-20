# LEARNING — Foundation Contract 001

**Capability** `C18` · **Owner** `SYSTEM_MASTER/LEARNING` · **Lane** `LEARNING`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. Populating this contract makes the capability specification-ready; it does not claim implementation or qualification PASS. Any changed subject requires fresh evidence.

## 1. Contract / interface

Operations: `start_learning_goal`, `tutor_turn`, `record_evidence`, `update_mastery`, `select_next_action`.
Every operation uses the common request/response envelope and returns typed result, evidence reference, or typed failure. The capability does not inherit another owner's mutation authority.

## 2. Ingress routes

Learner/Chat interaction, curriculum step, assessment result, or qualified evidence event.
All ingress is admitted by the owning lane and the current CORE authority/dispatch controls; external side effects require CONNECTED_ACTIONS authorization.

## 3. Egress routes

tutor response, mastery/evidence update, next-action recommendation, learning progress.
Cross-owner output is by typed interface/artifact/event reference, never by direct mutation of another owner's state.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/LEARNING`. LEARNING service is canonical writer for learner model, mastery, evidence and learning-session state.
**Physical persistence:** CORE-owned shared persistence/artifact/evidence primitives may store bytes or records but do not become semantic owner. Non-owner writes are rejected and must be resubmitted through the canonical owner interface.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- CURRICULUM/LEARNING.
- CHAT/CORE.
- RESEARCH/RESEARCH_KNOWLEDGE.
- MEDIA/MEDIA.

## 6. Failure semantics

Fail closed on authority mismatch, invalid input/schema, unavailable required dependency, rejected canonical write, or uncertain external-side-effect state. Mastery may not advance without admitted evidence; missing or contradictory evidence yields a typed non-mastery result rather than optimistic progress. Retries require the same `idempotency_key`; duplicate requests must return/recover the prior result or a typed conflict without duplicating durable state or external effects.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/learning-foundation-001.json`.
Required contents: `C18`, `LEARNING`, owner `SYSTEM_MASTER/LEARNING`, current authority/crosswalk identifiers, exact subject Git blobs, route coverage, canonical-writer assertion, dependency/failure/idempotency test results, acceptance command, result `PASS|FAIL`, and immutable evidence/artifact references.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js LEARNING`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js LEARNING`.
PASS requires the specification gate plus a current-authority evidence target with exact subject bindings and successful route, writer, dependency, failure, idempotency and owner-boundary tests.

## 9. Authority boundary

`SYSTEM_MASTER/LEARNING` may define and change learner-model, tutoring, mastery, evidence and next-action semantics. CORE retains shared runtime/A-01/durability infrastructure; peer-owned sources/media/actions remain peer authority. Cross-owner contract or ownership changes require current authority/crosswalk/allocation update and fresh qualification.

## 10. Open implementation gaps

Contract specification is complete when the pre-code specification gate passes. Implementation, production, native/human/psychometric/external qualification, and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
