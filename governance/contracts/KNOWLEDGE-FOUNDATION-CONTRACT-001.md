# KNOWLEDGE — Foundation Contract 001

**Capability** `C17` · **Owner** `SYSTEM_MASTER/RESEARCH_KNOWLEDGE` · **Lane** `RESEARCH_KNOWLEDGE`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. This does not claim implementation or qualification PASS.

## 1. Contract / interface

Operations: `ingest_fact`, `ingest_source`, `resolve_entity`, `retrieve_context`, `link_provenance`. Every admitted assertion is source-linked or explicitly marked unverified/inferred.

## 2. Ingress routes

Research result, approved file/source ingest, or peer-system knowledge query with source identity and provenance requirements.

## 3. Egress routes

Grounded context package, entity/source refs, provenance graph updates, confidence/standing metadata and typed failure.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/RESEARCH_KNOWLEDGE`. Knowledge service is sole semantic writer for knowledge/provenance graph state and entity/source linkage.
**Physical persistence:** CORE provides physical durability/evidence; source artifacts remain immutable and owned by their source/file domain.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- RESEARCH/RESEARCH_KNOWLEDGE.
- FILE/DOCUMENTS.
- BROWSER/CONNECTED_ACTIONS.
- PLUGINS/CONNECTED_ACTIONS.

## 6. Failure semantics

Fail closed on missing source identity for claims requiring provenance, conflicting canonical entity mutation without adjudication, authority mismatch, dependency failure or rejected write. Unverified data may be stored only with explicit standing. Retries reuse `idempotency_key`; duplicate source/assertion identities cannot create duplicate canonical facts.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/knowledge-foundation-001.json`.
Required contents: `C17`, `KNOWLEDGE`, owner `SYSTEM_MASTER/RESEARCH_KNOWLEDGE`, current authority/crosswalk identifiers, exact subject Git blobs, ingest/retrieve/entity/provenance coverage, writer/conflict/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js KNOWLEDGE`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js KNOWLEDGE`.
PASS requires source-bound ingest/retrieval, unverified standing, entity conflict handling, writer isolation and idempotent duplicate prevention.

## 9. Authority boundary

`SYSTEM_MASTER/RESEARCH_KNOWLEDGE` owns research knowledge/provenance semantics. BOOK/LEARNING/PROGRAMMING and other peers consume context but keep their own domain state; CONNECTED_ACTIONS owns provider access; CORE owns physical durability.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/provider/external qualification and Foundation evidence remain open until implementation acceptance passes and a current receipt is admitted.
