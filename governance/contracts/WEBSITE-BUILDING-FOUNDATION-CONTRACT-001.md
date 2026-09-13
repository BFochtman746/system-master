# WEBSITE_BUILDING — Foundation Contract 001

**Capability** `C40` · **Owner** `SYSTEM_MASTER/PROGRAMMING` · **Lane** PROGRAMMING · **Effective** 2026-09-13
**Authority** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Architecture decision** `governance/ADR-0006-PROGRAMMING-PEER-ADMISSION-WEBSITE-BUILDING.md`
**Foundation implementation** `WEBSITE-BUILDING-FOUNDATION-1.0`

> **Foundation 1.0 implementation accepted for deterministic local static website artifacts.** Architecture ownership remains unchanged: Website Building is C40 inside PROGRAMMING, not a tenth peer. This acceptance proves a deterministic build/verify/qualification substrate only; it does not grant browser, credential, publication, provider, domain/DNS or production-deployment authority.

## Known from the architecture decision

- Website Building is a first-class Programming capability, not a separate peer system.
- It owns website/web-application construction and engineering semantics.
- It consumes browser/action interfaces from CONNECTED_ACTIONS without inheriting side-effect authority.
- Production hosting, credentials, domain/DNS changes, publication and external-provider actions require explicit authority.

## 1. Contract / interface

Provide headless website/web-application engineering operations for architecture, scaffold/construction, source transformation, dependency/build configuration, test preparation/execution, deployment preparation and maintenance/repair inside PROGRAMMING authority.

Foundation 1.0 admits a dependency-free deterministic static package builder as the first executable substrate:

- implementation: `tools/website_builder.py`
- build: `python3 tools/website_builder.py build <project> <output>`
- verify: `python3 tools/website_builder.py verify <output>`
- qualification: `python3 .github/scripts/website-building-foundation-qualify.py`
- representative corpus: `qualification/website-building/corpus/static-basic`
- CI: `.github/workflows/website-building-foundation-qualification.yml`

The builder requires a root `index.html`, copies regular files byte-for-byte in normalized sorted path order, rejects source/output overlap and symlinks, emits `website-build-manifest.json`, and verifies the artifact file set and SHA-256 hashes. The manifest contains no timestamp and binds C40 ownership plus explicit authority denials.

Not offered by this foundation: framework-specific compilation, dependency installation, browser rendering proof, browser launch, network serving, user-authorized external side effects, credential authority, browser policy ownership, production publication authority, canonical research/media/document ownership or shared Core runtime ownership.

## 2. Ingress routes

- Chat/System Master request admitted to PROGRAMMING.
- Programming-owned project/build packets and current obligations.
- Explicit cross-system inputs from MEDIA, DOCUMENTS and RESEARCH_KNOWLEDGE.
- CONNECTED_ACTIONS browser interface only when action authority is separately admitted.

## 3. Egress routes

- Source code and deterministic local project artifacts.
- `website-build-manifest.json` with per-file SHA-256 and aggregate artifact identity.
- Build/test/qualification evidence.
- Deployment packages/configuration proposals.
- Repair findings and successor packets.
- External deployment/browser actions only through separately authorized CONNECTED_ACTIONS/provider boundaries.

## 4. Persistence and canonical writer

Programming is canonical writer for Website Building engineering/project state. Shared artifact storage may be supplied by CORE/DOCUMENTS but service consumption does not transfer semantic ownership. Foundation 1.0 writes only caller-selected local artifact/evidence paths; it has no network or publication path.

## 5. Dependencies

- CORE: shared runtime/storage/model/A-01/evidence infrastructure.
- CONNECTED_ACTIONS: browser/action interfaces.
- RESEARCH_KNOWLEDGE: research/provenance services.
- MEDIA: media assets.
- DOCUMENTS: generic artifact/document services.
- Foundation 1.0 runtime: Python standard library only; no package-manager or network dependency.

## 6. Failure semantics

Fail closed on owner/control-head drift, missing dependency authority, credential/provider requirements, conflicting canonical writes or ambiguous production/publication authority. Foundation 1.0 additionally fails closed on missing root `index.html`, source symlinks, non-regular source entries, source/output overlap, pre-existing output paths, reserved manifest collision, malformed manifests and artifact/hash mismatch. State-changing external effects require idempotency and explicit action authority and are not implemented by Foundation 1.0.

## 7. Evidence target

Programming-owned exact-subject project/build/test/qualification evidence bound to current source identity. Logs alone are insufficient. The qualification command writes `qualification-output/website-building-foundation-1.0.json`, and CI uploads that exact JSON as the `website-building-foundation-1.0-evidence` artifact. Evidence includes source identity, corpus, artifact SHA-256, manifest SHA-256, deterministic-repeat-build result, tamper-detection result and explicit publication/deployment authority denials.

## 8. Acceptance target

Architecture acceptance requires Topology 007, owner allocation 006, capability crosswalk 003, Programming control record, Programming Second Shift coverage and current enforcement to agree.

Foundation 1.0 implementation acceptance requires all of the following:

1. `python3 -m unittest tests.test_website_builder` passes.
2. `python3 .github/scripts/website-building-foundation-qualify.py` passes against `qualification/website-building/corpus/static-basic`.
3. Two independent builds produce byte-identical manifests and the same aggregate artifact SHA-256.
4. Verification detects artifact tampering.
5. Unsafe source/output topology and source symlinks fail closed.
6. The CLI exposes no deploy/publish command.
7. The emitted manifest denies network, browser-action, credential, publication and production-deployment authority.
8. `.github/workflows/website-building-foundation-qualification.yml` executes tests and qualification and preserves machine-readable evidence.

Passing Foundation 1.0 closes the previously open deterministic-build/qualification substrate gap for C40. It does not make PROGRAMMING as a whole complete.

## 9. Authority boundary

Programming may decide engineering implementation details within the admitted owner boundary. Human/user/external-provider decisions remain required for credentials, domains/DNS, billing, publication, production deployment and side effects beyond repository execution authority. Browser interaction remains a CONNECTED_ACTIONS responsibility when separately admitted.

## 10. Remaining gaps after Foundation 1.0

- Framework-specific adapters/build pipelines (for example package-manager-backed web applications) require separate admitted implementations and qualification corpora.
- Browser rendering/interaction proof remains outside this local artifact builder and must use an admitted CONNECTED_ACTIONS interface when required.
- Production deployment providers, credential transport, domains/DNS, billing, publication and production promotion remain explicitly ungranted.
