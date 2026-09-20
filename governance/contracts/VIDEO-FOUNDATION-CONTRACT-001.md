# VIDEO — Foundation Contract 001

**Capability** `C32` · **Owner** `SYSTEM_MASTER/MEDIA` · **Lane** `MEDIA`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. This does not claim implementation or qualification PASS.

## 1. Contract / interface

Operations: `generate_video`, `edit_video`, `compose_video`, `render_video`, `inspect_video`, `export_video`. Inputs are source/timeline refs and generation/render policy; outputs are video refs, timeline/render metadata, inspection evidence or typed failure.

## 2. Ingress routes

Chat/Automation or peer-system media request with source/timeline refs and render policy. MEDIA admits generation/edit/render mutations.

## 3. Egress routes

Video artifact refs, timeline/render metadata, inspection/evidence, progress events and export refs.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/MEDIA`. Video service writes video-project/timeline/edit state.
**Physical persistence:** CORE artifact storage writes immutable source/derived video binaries and evidence records.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- IMAGE/MEDIA.
- VOICE/MEDIA.
- FILE/DOCUMENTS.
- MEDIA/MEDIA orchestration.

## 6. Failure semantics

Fail closed on authority/policy error, missing source, invalid timeline, render failure, dependency failure or rejected write. Partial renders stay partial and never replace a valid master. Retries reuse `idempotency_key` and recover prior committed render state.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/video-foundation-001.json`.
Required contents: `C32`, `VIDEO`, owner `SYSTEM_MASTER/MEDIA`, current authority/crosswalk identifiers, exact subject Git blobs, generate/edit/compose/render/inspect/export coverage, writer/dependency/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js VIDEO`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js VIDEO`.
PASS requires all primary routes, partial-render behavior, source identity, writer isolation, dependency failure and idempotent replay.

## 9. Authority boundary

`SYSTEM_MASTER/MEDIA` owns video generation/edit/render semantics. DOCUMENTS owns generic files; CONNECTED_ACTIONS owns external publication/deployment effects; CORE owns shared durability. Cross-owner changes require fresh authority and qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/native/external qualification and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
