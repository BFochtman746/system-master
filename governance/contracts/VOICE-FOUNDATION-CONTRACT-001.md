# VOICE — Foundation Contract 001

**Capability** `C33` · **Owner** `SYSTEM_MASTER/MEDIA` · **Lane** `MEDIA`
**Authority selector** `governance/CURRENT-AUTHORITY.json`
**Capability inventory** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Owner consistency** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Common envelope** `governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md`

> Specification only. This does not claim implementation or qualification PASS.

## 1. Contract / interface

Operations: `transcribe_audio`, `synthesize_speech`, `transform_voice`, `inspect_audio`, `export_audio`. Inputs are audio/text refs, voice policy and provider/local-execution constraints; outputs are transcript/audio refs, timing/quality metadata, evidence or typed failure.

## 2. Ingress routes

Chat/MEDIA/LEARNING request with audio/text refs and voice policy. MEDIA admits local voice work; external model/provider calls require CONNECTED_ACTIONS authority.

## 3. Egress routes

Transcript, synthesized/derived audio refs, timing/quality metadata, inspection evidence and typed failures.

## 4. Persistence and canonical writer

**Canonical semantic writer:** `SYSTEM_MASTER/MEDIA`. Voice service writes voice-job/asset metadata and transform lineage.
**Physical persistence:** CORE artifact storage writes immutable audio binaries and evidence; external providers remain authoritative only for their remote state.

## 5. Dependencies

Baseline platform dependencies are P00–P12 and P15 as selected by current authority.
- FILE/DOCUMENTS.
- LOCALAI/CORE for approved local inference.
- PLUGINS/CONNECTED_ACTIONS for authorized external providers.

## 6. Failure semantics

Fail closed on missing authority/consent, unsupported voice policy, provider/runtime failure, source mismatch or rejected write. No silent local-to-remote fallback is allowed. Retries reuse `idempotency_key`; committed outputs are not duplicated on replay.

## 7. Evidence target

Future evidence target (currently absent until implementation qualification): `qualification/foundation/voice-foundation-001.json`.
Required contents: `C33`, `VOICE`, owner `SYSTEM_MASTER/MEDIA`, current authority/crosswalk identifiers, exact subject Git blobs, transcription/synthesis/transform/inspect/export coverage, provider-boundary/writer/failure/idempotency tests, acceptance command and `PASS|FAIL`.

## 8. Acceptance target

Pre-code specification gate: `node .github/scripts/foundation-capability-contract-spec-check.js VOICE`.
Implementation acceptance gate: `node .github/scripts/foundation-capability-acceptance.js VOICE`.
PASS requires local/provider route proof, no-silent-fallback behavior, source identity, writer isolation, dependency failure and idempotent replay.

## 9. Authority boundary

`SYSTEM_MASTER/MEDIA` owns voice/audio semantics. CORE owns approved local inference runtime and shared durability; CONNECTED_ACTIONS owns external-provider side-effect/permission policy. Cross-owner changes require fresh authority and qualification.

## 10. Open implementation gaps

Specification-ready does not mean implemented. Production/native/external qualification and Foundation evidence remain open until the implementation acceptance gate passes and a current receipt is admitted.
