# STORYBIBLE — Foundation Contract 001

**Capability** `C31` · **Owner** `SYSTEM_MASTER/BOOK` · **Lane** `BOOK`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. Populating this contract makes the capability specification-ready; it does not claim implementation or qualification PASS. Any changed subject requires fresh evidence.

## 1. Contract / interface

Operations: `create_story_bible`, `upsert_entity`, `upsert_timeline`, `record_rule`, `check_continuity`.
Every operation uses the common request/response envelope and returns typed result, evidence reference, or typed failure. The capability does not inherit another owner's mutation authority.

## 2. Ingress routes

Book/Chat request with book id, manuscript/research refs and proposed canon change.
All ingress is admitted by the owning lane and the current CORE authority/dispatch controls; external side effects require CONNECTED_ACTIONS authorization.

## 3. Egress routes

canonical entity/timeline/rule refs, continuity findings, evidence.
Cross-owner output is by typed interface/artifact/event reference, never by direct mutation of another owner's state.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/BOOK`. BOOK StoryBible service is sole semantic writer for canonical story/world/character continuity state.
**Physical persistence:** CORE-owned shared persistence/artifact/evidence primitives may store bytes or records but do not become semantic owner. Non-owner writes are rejected and must be resubmitted through the canonical owner interface.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- MANUSCRIPT/BOOK.
- WRITING/BOOK.
- RESEARCH/RESEARCH_KNOWLEDGE.
- KNOWLEDGE/RESEARCH_KNOWLEDGE.

## 6. Failure semantics

Fail closed on authority mismatch, missing book/canon identity, stale version, contradictory timeline/rule mutation, unavailable required dependency, or rejected canonical write. Continuity findings do not mutate canon unless an explicit owner-authorized update is committed with the same `idempotency_key`.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/storybible-foundation-001.json`.
Required contents: `C31`, `STORYBIBLE`, owner `SYSTEM_MASTER/BOOK`, current authority/crosswalk identifiers, exact subject Git blobs, route coverage, canonical-writer assertion, dependency/failure/idempotency test results, acceptance command, result `PASS|FAIL`, and immutable evidence/artifact references.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js STORYBIBLE`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js STORYBIBLE`.
PASS requires the specification gate plus a current-authority evidence target with exact subject bindings and successful route, writer, dependency, failure, idempotency and owner-boundary tests.

## 9. Authority boundary

`SYSTEM_MASTER/BOOK` owns canonical story-bible/canon semantics. RESEARCH_KNOWLEDGE may supply sourced context but cannot write canon; PROSE is retired. Cross-owner contract or ownership changes require current authority/crosswalk/allocation update and fresh qualification.

## 10. Open implementation gaps

Contract specification is complete when the pre-code specification gate passes. Implementation, production, native/human/external qualification, and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
