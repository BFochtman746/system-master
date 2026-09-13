# AUDIOBOOK — Foundation Contract 001

**Capability** `C00` · **Owner** `SYSTEM_MASTER/MEDIA` · **Lane** MEDIA · **Effective** 2026-09-13
**Authority** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Crosswalk** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Foundation implementation** `AUDIOBOOK-FOUNDATION-1.0`

> Foundation 1.0 establishes a deterministic local audiobook package assembly and verification substrate for caller-supplied narration audio. It does not synthesize narration, certify acoustic quality, play or stream audio, contact providers, use credentials, publish, distribute, or promote production artifacts.

## 1. Contract / interface

C00 provides a headless local package builder and verifier:

- implementation: `tools/audiobook_builder.py`
- project descriptor: `audiobook.json` with schema `AUDIOBOOK-PROJECT-1.0`
- build: `python3 tools/audiobook_builder.py build <project> <output>`
- verify: `python3 tools/audiobook_builder.py verify <output>`
- qualification: `python3 .github/scripts/audiobook-foundation-qualify.py`
- representative corpus: `qualification/audiobook/corpus/local-basic`
- CI: `.github/workflows/audiobook-foundation-qualification.yml`

A project supplies title/author metadata and an ordered non-empty chapter list. Every chapter must identify a transcript/source text file and a caller-supplied narration audio file. Foundation 1.0 admits local `.wav`, `.mp3`, `.m4a`, `.m4b`, `.aac`, `.flac`, and `.ogg` byte assets but does not decode, transcode, generate, normalize, or acoustically certify them.

The builder copies admitted source files byte-for-byte into a fresh local package and emits `audiobook-build-manifest.json` with chapter order, file roles, SHA-256 hashes, aggregate artifact identity, C00 ownership, and explicit authority denials.

Not offered by Foundation 1.0: speech synthesis, voice cloning, TTS provider invocation, audio recording, codec generation/transcoding, loudness/mastering certification, playback, streaming, DRM, store/provider upload, credentials, publication, distribution, production promotion, or network access.

## 2. Ingress routes

- A Chat/System Master or background-work request admitted to `SYSTEM_MASTER/MEDIA`.
- A local project directory containing `audiobook.json`.
- Caller-supplied local transcript/source files referenced by the project descriptor.
- Caller-supplied local narration audio files referenced by the project descriptor.
- BOOK/DOCUMENTS may supply manuscript or transcript artifacts through their owned interfaces; supplying content does not transfer Audiobook assembly ownership away from MEDIA.

No network URL, provider token, credential, microphone, playback device, browser action, or publication request is an admitted Foundation 1.0 ingress.

## 3. Egress routes

- A new caller-selected local audiobook package directory.
- Byte-preserved transcript/source files and caller-supplied narration audio.
- Deterministic `audiobook-build-manifest.json`.
- Machine-readable qualification evidence at `qualification-output/audiobook-foundation-1.0.json`.
- CI artifact `audiobook-foundation-1.0-evidence`.

Foundation 1.0 emits no provider request, stream, upload, publication, external notification, credential operation, production promotion, or network side effect.

## 4. Persistence and canonical writer

`SYSTEM_MASTER/MEDIA` is canonical semantic owner/writer for C00 Audiobook assembly state and package semantics. BOOK may remain canonical writer for manuscript semantics; DOCUMENTS/CORE may supply shared artifact storage without acquiring Audiobook semantic ownership.

The Foundation implementation writes only to a caller-selected fresh local output directory and the qualification evidence path. It refuses an existing output path rather than deleting or replacing it. Project and output roots must be disjoint. Source artifacts are read-only and copied byte-for-byte.

The deterministic build manifest is the canonical package receipt for a Foundation 1.0 build. It contains no wall-clock timestamp and is reproducible from identical admitted inputs.

## 5. Dependencies

- `SYSTEM_MASTER/MEDIA`: C00 owner and audiobook package semantics.
- `SYSTEM_MASTER/BOOK`: optional upstream manuscript/chapter content through an owned interface.
- `SYSTEM_MASTER/DOCUMENTS`: optional upstream generic transcript/file artifacts and shared artifact services.
- `SYSTEM_MASTER/CORE`: shared runtime/evidence/storage infrastructure; service consumption does not transfer C00 ownership.
- Python 3 standard library only for Foundation 1.0 execution and qualification.
- Local filesystem only.

There is no runtime dependency on a TTS provider, voice model, browser, network, credential store, playback engine, distribution service, package manager, or external codec/transcoding binary.

## 6. Failure semantics

Foundation 1.0 fails closed and returns a non-zero CLI status for invalid or absent project metadata, empty chapter sets, duplicate chapter IDs, missing transcript/audio assets, unsafe/absolute/traversal paths, source symlinks, non-regular referenced inputs, unsupported audio extensions, project/output overlap, existing output paths, output symlinks, copy divergence, malformed build manifests, identity mismatch, chapter-metadata divergence, added/removed artifacts, file-size/hash mismatch, aggregate digest mismatch, artifact symlinks, execution-boundary drift, or attempted authority expansion.

A failed build never replaces a pre-existing output tree. Staging data is removed on failure. The operation is content-deterministic rather than retry-stateful: the same admitted input bytes produce the same manifest bytes and aggregate identity in a fresh output path.

External actions are not retried because Foundation 1.0 has no external-action implementation.

## 7. Evidence target

Qualification must write `qualification-output/audiobook-foundation-1.0.json` and CI must preserve that exact file as artifact `audiobook-foundation-1.0-evidence`.

Evidence contains at least:

- source identity,
- `AUDIOBOOK-FOUNDATION-1.0` contract and C00/MEDIA identity,
- representative corpus path,
- aggregate artifact SHA-256,
- build-manifest SHA-256,
- chapter count,
- deterministic repeat-build PASS,
- narration-audio tamper-detection PASS,
- `CALLER_SUPPLIED_AUDIO_ONLY` execution boundary,
- network/external-side-effect denial,
- explicit denials for speech synthesis, playback, publication, distribution, and production promotion.

A log line alone is not acceptance evidence.

## 8. Acceptance target

Foundation 1.0 is accepted only when all of the following pass for the same repository source identity:

1. `python3 -m unittest tests.test_audiobook_builder`
2. `python3 .github/scripts/audiobook-foundation-qualify.py`
3. Two independent builds of the representative corpus emit byte-identical build manifests and identical aggregate artifact SHA-256.
4. Verification detects narration-audio tampering and build-manifest metadata tampering.
5. Missing narration audio, unsafe paths, symlinks, source/output overlap, existing output paths, and unsupported audio extensions fail closed.
6. The CLI exposes only `build` and `verify`; synthesis, playback/streaming, upload, publication, and deployment commands are absent.
7. The emitted build manifest denies network, speech-synthesis, playback, credential, publication, distribution, and production-promotion authority.
8. `.github/workflows/audiobook-foundation-qualification.yml` executes tests and qualification, preserves machine-readable evidence, and confirms the committed Foundation disposition matrix matches the canonical generator.

Passing this target closes the C00 deterministic local package assembly/verification substrate gap. It does not prove narration generation, listening quality, playback behavior, provider interoperability, or production distribution.

## 9. Authority boundary

MEDIA may decide deterministic Audiobook package structure, chapter ordering representation, local assembly, package verification, and C00 qualification semantics inside the admitted repository/local-filesystem boundary.

Foundation 1.0 does **not** grant authority to:

- synthesize or clone voices,
- invoke external TTS or audio providers,
- access microphones or private media,
- play or stream audio,
- transcode or certify codec/acoustic quality,
- use credentials,
- charge/bill external services,
- upload to stores or distribution providers,
- publish or distribute content,
- perform DRM operations,
- promote artifacts to production,
- access the network.

Any such capability requires its own admitted implementation, authority boundary, evidence, and qualification. Human/user rights and approvals for voice identity, copyrighted material, publication, provider accounts, billing, and distribution remain external to this Foundation.

## 10. Remaining gaps after Foundation 1.0

- Narration synthesis/TTS and voice selection are not implemented or qualified.
- Acoustic/listening quality, pronunciation, pacing, loudness, mastering, and accessibility quality are not certified.
- Audio transcoding, concatenation, chapter-marker generation inside container formats, and production M4B/MP3 mastering are not implemented.
- Playback, streaming, device integration, background audio, and interruption behavior are not qualified.
- Provider credentials, paid services, publication, distribution stores, DRM, rights clearance, and production promotion remain explicitly ungranted.
