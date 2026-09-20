# RESEARCH — Foundation Contract 001

**Capability** `C30` · **Owner** `SYSTEM_MASTER/RESEARCH_KNOWLEDGE` · **Lane** `RESEARCH_KNOWLEDGE`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. This does not claim implementation or qualification PASS.

## 1. Contract / interface

Operations: `plan_research`, `search_sources`, `fetch_source`, `synthesize`, `cite_sources`, `close_research_run`. Inputs declare question/scope, freshness, allowed source classes and provenance policy; outputs are source sets, synthesis/citations and run evidence.

## 2. Ingress routes

Chat/Automation or peer-system request with research question, freshness/scope and provenance requirements. RESEARCH_KNOWLEDGE admits research semantics; web/provider access routes through CONNECTED_ACTIONS.

## 3. Egress routes

Source set, synthesis, citations/provenance graph, unresolved questions, freshness metadata and research-run evidence.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/RESEARCH_KNOWLEDGE`. Research service writes research-run, source-selection and provenance state.
**Physical persistence:** CORE stores evidence/artifacts; external sources are read-only inputs and remain externally authoritative.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- BROWSER/CONNECTED_ACTIONS.
- PLUGINS/CONNECTED_ACTIONS.
- KNOWLEDGE/RESEARCH_KNOWLEDGE.
- FILE/DOCUMENTS.

## 6. Failure semantics

Fail closed on disallowed source access, missing provenance for a claimed finding, authority mismatch, dependency failure or rejected write. Incomplete research remains explicitly incomplete; unsupported claims are not promoted. Retries reuse `idempotency_key`; duplicate source acquisitions are deduplicated by identity/content hash where available.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/research-foundation-001.json`.
Required contents: `C30`, `RESEARCH`, owner `SYSTEM_MASTER/RESEARCH_KNOWLEDGE`, current authority/crosswalk identifiers, exact subject Git blobs, plan/search/fetch/synthesize/cite coverage, provenance/writer/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js RESEARCH`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js RESEARCH`.
PASS requires source-policy/freshness/provenance cases, partial-research standing, dependency failure, writer isolation and idempotent acquisition proof.

## 9. Authority boundary

`SYSTEM_MASTER/RESEARCH_KNOWLEDGE` owns research methodology, source/provenance and synthesis semantics. CONNECTED_ACTIONS owns external access/actions; consuming peers own decisions made from research; CORE owns durability.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/provider/external qualification and Foundation evidence remain open until implementation acceptance passes and a current receipt is admitted.
