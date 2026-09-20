# IMAGE — Foundation Contract 001

**Capability** `C15` · **Owner** `SYSTEM_MASTER/MEDIA` · **Lane** `MEDIA`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. This does not claim implementation or qualification PASS.

## 1. Contract / interface

Operations: `generate_image`, `transform_image`, `compose_image`, `inspect_image`, `export_image`. Inputs are prompts/source refs, transformation constraints and rights/policy metadata; outputs are image refs, edit metadata, inspection evidence or typed failure.

## 2. Ingress routes

Chat/Automation or owner-system media request with prompt/source refs and rights constraints. MEDIA admits generation/edit work; external provider actions route through CONNECTED_ACTIONS when required.

## 3. Egress routes

Image artifact refs, generation/edit metadata, inspection evidence and typed failure. Cross-owner consumers receive immutable refs rather than direct state mutation.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/MEDIA`. Image service writes generation/edit job and asset-semantic state.
**Physical persistence:** CORE artifact storage writes immutable source/derived image binaries; DOCUMENTS may ingest file representations but does not own image-generation semantics.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- FILE/DOCUMENTS.
- PHOTO/MEDIA.
- RESEARCH/RESEARCH_KNOWLEDGE when grounding/source provenance is required.

## 6. Failure semantics

Fail closed on authority/policy failure, unresolved source identity, unsupported transform, provider/runtime failure or rejected write. Failed transforms never replace prior valid assets. Retries reuse `idempotency_key`; exact duplicate source/prompt/policy requests recover prior committed output when deterministic identity is available.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/image-foundation-001.json`.
Required contents: `C15`, `IMAGE`, owner `SYSTEM_MASTER/MEDIA`, current authority/crosswalk identifiers, exact subject Git blobs, generation/transform/inspect/export coverage, writer/dependency/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js IMAGE`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js IMAGE`.
PASS requires route coverage, source identity, policy/provider failure behavior, writer isolation and idempotent replay proof.

## 9. Authority boundary

`SYSTEM_MASTER/MEDIA` owns image generation/edit semantics. DOCUMENTS owns generic file mechanics, RESEARCH_KNOWLEDGE owns provenance facts, CONNECTED_ACTIONS owns external side effects, and CORE owns physical durability. Cross-owner changes require fresh authority and qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/native/external qualification and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
