# AUDIOBOOK — Foundation Contract 001

**Capability** `C00` · **Owner** `SYSTEM_MASTER/MEDIA` · **Lane** `MEDIA`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. This does not claim implementation or qualification PASS.

## 1. Contract / interface

Operations: `compile_book_audio`, `synthesize_chapter`, `assemble_master`, `inspect_audiobook`, `export_audiobook`. Inputs are manuscript/chapter refs, voice/render policy and output constraints; outputs are segment/master audio refs, inspection evidence or typed failure.

## 2. Ingress routes

Chat/Automation or BOOK/MEDIA request with canonical manuscript/chapter refs and rendering policy. MEDIA admits production; external distribution requires CONNECTED_ACTIONS authority.

## 3. Egress routes

Audio segment refs, chapter/master audiobook artifacts, timing/quality metadata, progress/evidence events and typed failures.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/MEDIA`. Audiobook service writes audiobook project, chapter-render and master-assembly state.
**Physical persistence:** CORE artifact storage is sole physical writer for immutable audio binaries; BOOK remains owner of manuscript semantics.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- MANUSCRIPT/BOOK.
- VOICE/MEDIA.
- FILE/DOCUMENTS.

## 6. Failure semantics

Fail closed on missing manuscript/version, voice-policy mismatch, render/assembly failure, authority error or rejected write. Failed renders never replace prior valid audio. Retries reuse `idempotency_key` and exact source/render policy; duplicates recover the prior committed artifact.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/audiobook-foundation-001.json`.
Required contents: `C00`, `AUDIOBOOK`, owner `SYSTEM_MASTER/MEDIA`, current authority/crosswalk identifiers, exact subject Git blobs, route/render/assembly coverage, writer/dependency/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js AUDIOBOOK`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js AUDIOBOOK`.
PASS requires chapter/master assembly, source-version binding, failed-render rollback, writer isolation and idempotent replay proof.

## 9. Authority boundary

`SYSTEM_MASTER/MEDIA` owns audiobook production semantics. BOOK owns manuscript content; CONNECTED_ACTIONS owns external publication/distribution effects; CORE owns physical durability. Cross-owner changes require current authority/crosswalk/allocation update and fresh qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/native/human/external qualification and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
