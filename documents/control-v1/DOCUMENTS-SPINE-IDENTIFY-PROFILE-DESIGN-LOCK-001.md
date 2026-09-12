# DOCUMENTS-SPINE-IDENTIFY-PROFILE-DESIGN-LOCK-001

Status: **DESIGN LOCK / SPECIFICATION PASS / RUNTIME BUILD NOT AUTHORIZED UNTIL CURRENT SOURCE CUSTODY**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Capability: `UDM-SPINE-0002`  
Parent forensic packet: `DOCUMENTS-SPINE-IDENTIFY-PROFILE-FORENSIC-PREP-001`  
Design-lock base: `documents/control-v1@3e1336f8f4a1285b19fb8dd76ea903412be07cd9`

## 1. Contract purpose

IDENTIFY answers one Documents-owned question: **what document artifact is this, exactly enough for later routing, security, parsing, proof and preservation decisions, and what deterministic evidence supports that identity?**

IDENTIFY does not authorize execution, grant processing-engine standing, approve external effects, certify accessibility/conformance, or replace SECURE. It produces an immutable evidence-bearing identity receipt for the exact source bytes and classifier contract version.

## 2. Truth ownership

DOCUMENTS owns:

- document family, subtype and document-profile identity;
- document-specific package/container identity evidence;
- document-specific active-content facts/posture;
- conflicts among byte/package evidence, declared media type and filename hints;
- the resulting `DocumentIdentityReceipt` semantics.

CORE may own generic artifact intake, bounded byte acquisition and generic media sniffing. Those services are inputs only. Generic recognition of XLSX/XLSM or another peer-owned artifact never transfers that peer's semantics to DOCUMENTS.

Security/effect policy is a separate authority. IDENTIFY supplies document-specific facts; policy decides what operations are permitted.

## 3. Versioned data contract

`DocumentIdentityReceipt v1` contains at minimum:

- `contract_version`
- `source_artifact_id`
- `source_sha256`
- `source_bytes`
- `classifier_implementation_id`
- `classifier_implementation_digest`
- `family`
- `subtype`
- `canonical_media_type`
- `format_version` — exact when deterministically established, otherwise explicit `UNKNOWN`
- `profile_indicators[]` — evidence indicators only unless a qualified conformance validator proves a profile
- `identity_standing` — `EXACT | PARTIAL | AMBIGUOUS | UNKNOWN`
- `byte_signature_evidence[]`
- `package_evidence[]`
- `declared_media_type_evidence`
- `filename_hint_evidence`
- `conflicts[]`
- `active_content_posture` — `INERT | PRESENT | UNKNOWN | NOT_APPLICABLE`
- `active_content_evidence[]`
- `recognized_processing_support` — descriptive only: `SUPPORTED | RECOGNIZED_ENGINE_PENDING | OUTSIDE_DOCUMENTS | UNKNOWN`; this field cannot grant engine qualification
- `receipt_digest`

`receipt_digest` is the digest of canonical serialization excluding itself. Same source bytes plus the same classifier implementation/contract must reproduce the same receipt digest.

## 4. Evidence precedence and conflict law

1. Exact byte/container/package evidence outranks declaration and filename hints.
2. Internal package content-type / required-part evidence outranks the outer file extension.
3. Declared media type and filename hints are preserved separately and may refine only when stronger evidence is genuinely non-discriminating.
4. A declaration or filename may never silently override contradictory exact byte/package evidence.
5. Material contradictory strong evidence yields `AMBIGUOUS` and blocks subtype promotion.
6. Missing evidence yields `UNKNOWN` rather than guessed specificity.
7. Recognition and processing-engine qualification are separate facts.
8. No probabilistic confidence score converts unresolved contradiction into authority.

## 5. Family/subtype rules required for v1

### OOXML Word

At minimum distinguish package-internally:

- DOCX document;
- DOCM macro-enabled document;
- template/macro-template variants when represented in current requirement coverage.

The detector must use `[Content_Types].xml` / package evidence and macro payload evidence. A `.docx` filename cannot make a macro-enabled package non-macro.

### OOXML Presentation

At minimum distinguish package-internally:

- PPTX presentation;
- PPTM macro-enabled presentation;
- PPSX slideshow;
- POTX template;
- any macro-enabled slideshow/template subtype admitted by the requirement ledger.

A package containing `ppt/presentation.xml` is not automatically PPTX. Main content-type semantics are required.

### PDF

- `%PDF-` establishes the PDF family.
- The header may establish a syntactic PDF version.
- PDF/A, PDF/X, PDF/UA or other conformance profiles are not claimed from metadata strings alone. They remain `UNKNOWN` or indicator-only until a qualified profile validator proves them.

### ODF / EPUB and other ZIP families

ODT/ODP/EPUB exact identity requires package-internal evidence such as the required MIME/package structure. Filename extension alone gives only hint standing and cannot yield `EXACT` native identity.

### Text families

Plain text, Markdown, HTML and RTF may use deterministic text signatures plus declared/name hints where byte evidence is inherently non-unique. The receipt must preserve which evidence produced the result and any conflict.

### Outside Documents

If generic artifact sniffing identifies a peer-owned family such as spreadsheet semantics, IDENTIFY records `OUTSIDE_DOCUMENTS` and fails closed for Documents processing rather than absorbing the capability.

## 6. Active-content posture

UDM-SPINE-0002 explicitly includes active-content posture, so v1 resolves the prior stage mismatch as follows:

- IDENTIFY performs bounded, non-executing package inspection sufficient to classify known document-specific active-content facts.
- `PRESENT` is used when deterministic evidence finds macros, ActiveX, embedded executable/OLE content, external executable relationships or another contract-listed active-content class.
- `INERT` is used only when all required checks for that admitted subtype ran and found none.
- `UNKNOWN` is required when the subtype is ambiguous, inspection is incomplete, bounds prevent full examination, or a required classifier is unavailable.
- SECURE consumes the identity receipt plus deeper inspection facts and applies policy. IDENTIFY does not decide whether a requested operation is permitted.

This preserves the operational SECURE stage while making IDENTIFY satisfy its atomic evidence contract.

## 7. Commands, queries, events and errors

### Command

`IdentifyDocument(source_artifact_ref, source_sha256, declared_media_type?, filename_hint?) -> DocumentIdentityReceipt`

The command is pure with respect to canonical document content: no artifact mutation, no external effect and no processing-engine invocation beyond bounded classifier inspection.

### Query

`GetDocumentIdentity(source_sha256, classifier_implementation_digest) -> receipt | NOT_FOUND`

A cache/projection may answer this query, but source digest + classifier digest are part of the key; stale classifier output cannot silently masquerade as current identity.

### Events

- `DocumentIdentityEstablished`
- `DocumentIdentityAmbiguous`
- `DocumentIdentityUnknown`

Events carry receipt identity/reference, not raw document bytes.

### Error classes

- `MALFORMED_CONTAINER`
- `CONTRADICTORY_STRONG_EVIDENCE`
- `DECLARATION_CONFLICT`
- `UNSUPPORTED_OR_OUTSIDE_DOCUMENTS_FAMILY`
- `CLASSIFIER_BOUNDS_EXCEEDED`
- `REQUIRED_PACKAGE_EVIDENCE_MISSING`
- `IDENTITY_CONTRACT_VERSION_UNSUPPORTED`
- `SOURCE_DIGEST_MISMATCH`

Errors are fail-closed for any downstream operation requiring stronger identity standing.

## 8. Persistence / idempotency / invalidation

- Receipt identity is content-addressed by exact source digest + classifier implementation digest + contract version.
- Repeating the exact command with the exact inputs returns the same semantic receipt.
- A classifier change creates a new classifier digest and therefore a new receipt; prior receipts remain immutable evidence.
- A source-byte change creates a new source digest and requires fresh identity.
- Filename/declaration changes do not rewrite a prior receipt; they create a separately attributable evaluation if those fields are part of the requested evidence set.
- No identity cache is canonical without source/classifier/version binding.

## 9. Bounded inspection requirements

Classifier inspection must enforce explicit limits for package entry count, compressed/uncompressed bytes read, individual entry size, nesting/recursion and parser time where applicable. Exceeding bounds yields `CLASSIFIER_BOUNDS_EXCEEDED` / `UNKNOWN`, never a guessed subtype.

## 10. Qualification denominator

At minimum the isolated suite must prove:

1. DOCX exact package -> DOCX EXACT.
2. DOCM exact package -> DOCM EXACT + active-content PRESENT when macro payload exists.
3. PPTX -> PPTX EXACT.
4. PPTM -> PPTM EXACT + macro evidence.
5. PPSX does not collapse into PPTX.
6. POTX does not collapse into PPTX.
7. admitted macro slideshow/template variants do not collapse into non-macro variants.
8. renamed OOXML file: package identity outranks extension.
9. declared-media conflict is recorded and cannot override package identity.
10. ODT exact identity requires package evidence.
11. ODP exact identity requires package evidence.
12. EPUB exact identity requires package evidence.
13. extension-only ODT/ODP/EPUB cannot receive EXACT standing.
14. PDF header version captured deterministically.
15. PDF/A/X/UA profile is not claimed without qualified validation evidence.
16. Markdown/plain-text ambiguity preserves hint provenance.
17. HTML/RTF strong text signatures outrank misleading text extension hints.
18. malformed OOXML ZIP fails closed.
19. duplicate/contradictory OOXML content-type evidence yields AMBIGUOUS/ERROR.
20. package inspection bound exhaustion yields UNKNOWN/BOUNDS error.
21. macro/ActiveX/embedded/external active-content evidence maps to PRESENT.
22. INERT requires the complete subtype-specific active-content check set.
23. outside-Documents XLSX/XLSM recognition does not become Documents semantic support.
24. recognized-engine-pending format identity remains separate from engine qualification.
25. same bytes/classifier/version reproduce same receipt digest.
26. source digest mismatch fails before identity promotion.
27. classifier version/digest change does not reuse stale receipt.
28. current INTAKE -> IDENTIFY -> SECURE integration consumes the receipt without duplicate truth ownership.
29. existing current portable format behavior does not regress for DOCX/PDF/PPTX/text families.
30. cumulative Documents spine tests preserve fail-closed UNKNOWN/AMBIGUOUS behavior.

## 11. Closure / non-claims

This design lock closes the missing semantic contract only. It does not establish that the recovered runtime implements v1, does not transfer historical qualification, and does not establish R4 GitHub-native source custody, A-01, native Microsoft Office, publication or production standing.

## Exact next operation

`DOCUMENTS-SPINE-IDENTIFY-PROFILE-IMPLEMENTATION-001 — BLOCKED ON R4 GITHUB-NATIVE EXACT SOURCE CUSTODY FOR RUNTIME MUTATION; WHILE BLOCKED, CONTINUE DOCUMENTS-SPINE-SECURE-FORENSIC-PREP-001 AS INDEPENDENT WORK-AHEAD.`
