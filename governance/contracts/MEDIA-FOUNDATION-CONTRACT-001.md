# MEDIA — Foundation Contract 001

**Capability** `C23` · **Owner** `SYSTEM_MASTER/MEDIA` · **Lane** `MEDIA`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. This does not claim implementation or qualification PASS.

## 1. Contract / interface

Operations: `create_media_project`, `compose_assets`, `render_master`, `inspect_media`, `export_media`. Inputs are asset refs, timeline/composition policy and output constraints; outputs are project/master refs, render metadata, inspection evidence or typed failure.

## 2. Ingress routes

Chat/Automation or peer-system request with asset refs, timeline and format policy. MEDIA admits composition/render mutations.

## 3. Egress routes

Media project refs, rendered master/artifact refs, inspection/evidence, progress events and typed failures.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/MEDIA`. Media orchestration service writes media-project/timeline/composition state.
**Physical persistence:** CORE artifact storage writes immutable media binaries; component capabilities retain their own semantic state.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- IMAGE/MEDIA.
- VIDEO/MEDIA.
- VOICE/MEDIA.
- AUDIOBOOK/MEDIA.
- FILE/DOCUMENTS.

## 6. Failure semantics

Fail closed on missing asset identity, invalid timeline/composition, authority failure, render error, dependency failure or rejected write. Partial renders remain partial artifacts and never replace a prior valid master. Retries reuse `idempotency_key` and recover prior committed project/render state.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/media-foundation-001.json`.
Required contents: `C23`, `MEDIA`, owner `SYSTEM_MASTER/MEDIA`, current authority/crosswalk identifiers, exact subject Git blobs, composition/render/export route coverage, writer/dependency/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js MEDIA`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js MEDIA`.
PASS requires project/compose/render/inspect/export cases, partial-render handling, writer isolation and idempotent replay.

## 9. Authority boundary

`SYSTEM_MASTER/MEDIA` owns media composition/orchestration semantics. DOCUMENTS owns generic file/document mechanics; CONNECTED_ACTIONS owns external publication effects; CORE owns shared durability. Cross-owner changes require fresh authority and qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/native/external qualification and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
