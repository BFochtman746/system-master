# MANUSCRIPT — Foundation Contract 001

**Capability** `C21` · **Owner** `SYSTEM_MASTER/BOOK` · **Lane** `BOOK`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. Populating this contract makes the capability specification-ready; it does not claim implementation or qualification PASS. Any changed subject requires fresh evidence.

## 1. Contract / interface

Operations: `create_manuscript`, `edit_section`, `assemble_chapter`, `version_manuscript`, `export_manuscript_model`.
Every operation uses the common request/response envelope and returns typed result, evidence reference, or typed failure. The capability does not inherit another owner's mutation authority.

## 2. Ingress routes

Book/Chat request with book id, section target, writing/story-bible/research refs.
All ingress is admitted by the owning lane and the current CORE authority/dispatch controls; external side effects require CONNECTED_ACTIONS authorization.

## 3. Egress routes

canonical manuscript/version refs, chapter/section content, change evidence.
Cross-owner output is by typed interface/artifact/event reference, never by direct mutation of another owner's state.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/BOOK`. BOOK Manuscript service is sole semantic writer for canonical manuscript state; DOCUMENTS only renders generic document artifacts.
**Physical persistence:** CORE-owned shared persistence/artifact/evidence primitives may store bytes or records but do not become semantic owner. Non-owner writes are rejected and must be resubmitted through the canonical owner interface.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- WRITING/BOOK.
- STORYBIBLE/BOOK.
- RESEARCH/RESEARCH_KNOWLEDGE.
- DOCX/DOCUMENTS.
- PDF/DOCUMENTS.

## 6. Failure semantics

Fail closed on authority mismatch, invalid book/section identity, stale version, unavailable required dependency, or rejected canonical write. Conflicting manuscript edits return a typed version conflict and never last-write-win silently. Retries require the same `idempotency_key`; duplicate mutations recover the prior committed version.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/manuscript-foundation-001.json`.
Required contents: `C21`, `MANUSCRIPT`, owner `SYSTEM_MASTER/BOOK`, current authority/crosswalk identifiers, exact subject Git blobs, route coverage, canonical-writer assertion, dependency/failure/idempotency test results, acceptance command, result `PASS|FAIL`, and immutable evidence/artifact references.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js MANUSCRIPT`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js MANUSCRIPT`.
PASS requires the specification gate plus a current-authority evidence target with exact subject bindings and successful route, writer, dependency, failure, idempotency and owner-boundary tests.

## 9. Authority boundary

`SYSTEM_MASTER/BOOK` owns canonical Book/manuscript semantics. DOCUMENTS owns generic document mechanics; RESEARCH_KNOWLEDGE owns source/provenance semantics; PROSE is retired and receives no active write path. Cross-owner contract or ownership changes require current authority/crosswalk/allocation update and fresh qualification.

## 10. Open implementation gaps

Contract specification is complete when the pre-code specification gate passes. Implementation, production, native/human/external qualification, and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
