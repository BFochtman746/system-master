# DOCUMENTS-SPINE-IDENTIFY-PROFILE-FORENSIC-PREP-001

Status: **FORENSIC PREP COMPLETE / SPECIFICATION SUCCESSOR READY / RUNTIME BUILD STILL SOURCE-CUSTODY GATED**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Parent capability: `UDM-SPINE-0002` — IDENTIFY exact format/subtype/profile and active-content posture.  
Current owner base for this prep: `documents/control-v1@6a43895dea7b373798e0772f45497b765f3f1260`

## Why this is the next independent work-ahead unit

The canonical R4 transport contract is reconciled, but exact payload deposition into GitHub remains blocked. The recovered 2,935-capability build index identifies IDENTIFY as the first partial Documents-spine stage after verified INTAKE and the first feature candidate after source admission. This packet performs only forensic/specification preparation; it does not mutate the recovered runtime or claim current-source qualification.

## Recovered current implementation

The exact recovered R4 source shows three relevant layers:

1. `ArtifactMediaDetector` — generic byte/package sniffing with OOXML package inspection and bounded UTF-8/text detection.
2. `DocumentFormatDetector` — combines byte truth with declared media type and filename hints.
3. `UniversalDocumentSpine.identify` — records the detected `DocumentFormat` and media type, fails closed on UNKNOWN, and enforces requested-target mismatch rules before SECURE.

Current enum coverage includes DOCX/DOCM, PDF, PPTX/PPTM, Markdown/plain text/HTML/RTF plus recognized-but-not-portable ODT/EPUB/legacy DOC/PPT/ODP/PPSX/POTX.

## Forensic gaps demonstrated

### G1 — subtype/profile identity is incomplete

The current byte detector distinguishes DOCX/DOCM and PPTX/PPTM but does not establish exhaustive OOXML subtype/profile identity. `PPSX` and `POTX` exist in the enum yet the generic OOXML detector recognizes the presentation main part and can collapse package variants into PPTX/PPTM semantics unless additional package/content-type evidence is added.

### G2 — ZIP-family recognition can rely too heavily on filename hints

ODT, ODP and EPUB are ZIP-based families. When byte-level package classification does not resolve them, `DocumentFormatDetector` may return a non-portable format from the filename hint. A filename is useful provenance, not sufficient native identity. Package-internal evidence must establish these subtypes before they receive exact/native identification standing.

### G3 — PDF version/profile is not part of IDENTIFY output

The byte detector establishes PDF from `%PDF-`; deeper PDF inspection can discover version/features later, but the IDENTIFY receipt currently records only `format=PDF` and media type. PDF version/profile/conformance identity therefore is not represented at the stage whose requirement explicitly includes profile.

### G4 — active-content posture is split out of the required IDENTIFY contract

The atomic requirement says IDENTIFY must establish active-content posture. Current IDENTIFY records format/media type only. Macro/ActiveX/external-relationship and related document-specific posture is discovered in `inspect` and enforced by the subsequent SECURE stage. The stage split may remain operationally useful, but the contract must either (a) make IDENTIFY return a document identity envelope containing deterministic active-content posture, or (b) explicitly narrow UDM-SPINE-0002 and move posture ownership to SECURE through a current adjudication. Silent mismatch is not acceptable.

### G5 — declaration/name conflicts need explicit evidence semantics

For text families, declared media type and filename hints can refine plain-text byte detection. The current result does not preserve which evidence source won or whether hints conflicted. Exact identity should preserve byte/package evidence, declaration evidence and name evidence separately and fail closed or mark ambiguity where they materially disagree.

### G6 — format recognition and engine availability are distinct facts

The system already recognizes formats for which qualified processing engines are pending. IDENTIFY must not imply parse/edit/render support merely because a format identity is recognized. Capability/engine standing remains a separate routing/admission fact.

## Ownership adjudication for design lock

- DOCUMENTS owns document-specific format, subtype, profile and active-content semantic classification.
- CORE may provide generic artifact/media sniffing and bounded intake mechanics; consuming that service does not transfer Documents semantic ownership.
- DOCUMENTS must not absorb spreadsheet semantics merely because generic OOXML detection can recognize XLSX/XLSM.
- Security policy/effect permission remains separately governed; document-specific active-content facts are Documents evidence consumed by that policy.
- No Book, Learning, Programming or retired Prose semantics enter this package.

## Required design-lock output

Define one versioned `DocumentIdentity` contract (name may change during design lock) containing at minimum:

- top-level document family;
- exact subtype where deterministically established;
- applicable profile/version/conformance indicators;
- canonical media type;
- container/package evidence;
- byte-signature evidence;
- declaration/name evidence preserved separately;
- conflict/ambiguity status;
- document-specific active-content posture and evidence references;
- recognized-format standing independent of qualified-engine availability;
- exact source artifact digest and classifier contract version.

The design must specify deterministic precedence and fail-closed behavior. No confidence score may substitute for unresolved contradictory evidence.

## Initial qualification denominator

1. DOCX vs DOCM exact package differentiation.
2. PPTX vs PPTM exact package differentiation.
3. PPSX/POTX and other presentation subtypes cannot collapse silently into PPTX.
4. Renamed OOXML files: bytes/package identity outranks extension.
5. Declared-media mismatch is preserved and classified.
6. ODT/ODP/EPUB require package-internal identity; extension alone cannot grant native standing.
7. PDF version/profile indicators are captured or explicitly UNKNOWN, never guessed.
8. Markdown/plain text/HTML/RTF hint refinement preserves evidence provenance.
9. Macro project, ActiveX/embedded objects, external relationships and comparable active-content evidence are reflected in the identity/posture contract or explicitly delegated to SECURE by adjudication.
10. Malformed/ambiguous ZIP and malformed PDF fail closed without subtype promotion.
11. UNKNOWN remains a real result.
12. Recognition does not imply parse/edit/render engine qualification.
13. Same bytes + same classifier contract produce the same identity digest.
14. Filename/declaration-only change cannot silently rewrite byte-established identity.
15. Current INTAKE/SECURE/FORENSICS contracts regress cleanly against the new identity envelope.

## Runtime-build gate

No runtime implementation from this packet is promoted while R4 exact source is not GitHub-native and freshly qualified. Design/specification work may continue because it is source/evidence based and does not transfer historical PASS.

## Exact successor

`DOCUMENTS-SPINE-IDENTIFY-PROFILE-DESIGN-LOCK-001 — FREEZE DOCUMENT IDENTITY / SUBTYPE / PROFILE / ACTIVE-CONTENT CONTRACT + COMMAND/QUERY/EVENT/ERROR/TEST BOUNDARIES, WITHOUT RUNTIME MUTATION`
