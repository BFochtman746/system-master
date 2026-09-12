# DOCUMENTS-SPINE-SECURE-FORENSIC-PREP-001

Status: **FORENSIC RECOVERY + INVENTORY + ANALYSIS COMPLETE / DESIGN-LOCK SUCCESSOR READY / RUNTIME MUTATION STILL SOURCE-CUSTODY GATED**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Capability: `UDM-SPINE-0003` — SECURE: apply document security posture and quarantine/block unsafe document-processing paths.  
Parent contract: `DOCUMENTS-SPINE-IDENTIFY-PROFILE-DESIGN-LOCK-001`  
Forensic base: `documents/control-v1@3e7c21045bf52ba3eee6b89a88e38f25542c0906`  
Current R4 transport carrier: SHA-256 `166f31ae9a6b2580ab14dc43af22fcd7fc6063817427289c8686d77f2cccd07d`, 300832 bytes, five canonical raw chunks.  
Runtime-build gate: exact R4 payload bytes remain outside GitHub-native custody; this packet performs no recovered-runtime mutation and transfers no historical PASS.

## 1. Method applied

This unit follows the current Documents reconstruction discipline:

`RECOVER -> INVENTORY -> ANALYZE -> TARGETED RESEARCH -> ADJUDICATE -> DESIGN-LOCK successor`

BUILD, isolated qualification, cumulative regression/calibration and FREEZE are intentionally not crossed because the current exact recovered R4 source has not yet been deposited into and re-read from GitHub.

No generalized external research was reopened in this unit. The current requirement ledger, recovered source/evidence index, closed defect lessons, current IDENTIFY contract and current System Master ownership rules are sufficient to resolve the SECURE semantic boundary. New external research would not remove the present source-custody gate or change the demonstrated security requirements.

## 2. Recovered controlling requirements and invariants

The current recovered Documents requirement corpus establishes these security invariants:

- `CS-SEC-001` — untrusted artifacts enter through bounded intake with detection, digest, size limits and quarantine posture.
- `CS-SEC-002` — archive/container parsing is bounded by entry count, per-entry size, total inflated size, traversal, duplicate-entry and recursion limits.
- `CS-SEC-003` — XML processing disables DTDs, external entities, XInclude and external stylesheet/DTD access.
- `CS-SEC-004` — macros, ActiveX, OLE, scripts, launch actions and embedded executables are inventoried but never executed during read/extract/rebuild/proof.
- `CS-SEC-005` — network access is denied by default; any network dependency requires explicit System Master authority and receipt.
- `CS-SEC-006` — external relationships are inventoried and policy-checked before any dereference.
- `CS-SEC-007` — path operations normalize and remain within the authorized root.
- `CS-SEC-008` — encrypted/protected artifacts fail closed unless an explicitly authorized credential/policy route exists.
- `CS-SEC-009` — redaction/sanitization requires post-operation absence proof for targeted content and hidden representations; visual concealment is not proof.
- `CS-SEC-010` — telemetry/logs do not contain document content by default; identifiers, digests and bounded metrics are preferred.

The user-outcome contract is consistent with those invariants: document active content is detected/inventoried without automatic execution; macro/ActiveX/OLE/external-link handling is safe; redaction is semantic rather than visual cover; metadata/privacy sanitization is explicit; password/encryption handling uses approved mechanisms; and signatures/protection are not falsely represented as valid after mutation.

## 3. Current implementation/evidence inventory

### 3.1 Spine-level SECURE standing

Recovered capability index standing for `UDM-SPINE-0003` is `PARTIAL_VERIFIED` / `OPEN_PARTIAL`.

Current recovered implementation/evidence points to:

- `UniversalDocumentSpine` SECURE stage;
- `ArtifactIntakePolicy`;
- the historical exact-subject portable spine qualification receipt under `13_DOCUMENT_SPINE_002A/evidence/qualification/portable/receipts/DOCUMENT-SPINE-002A-PORTABLE.json`.

Demonstrated behavior: executable/active-content paths fail closed. Open boundary: complete per-format security posture remains ongoing.

### 3.2 Security-proof standing

`UDM-SPINE-0016` — SECURITY_PROOF — remains `PARTIAL_VERIFIED` / `OPEN_PARTIAL`.

Demonstrated: an active-content recheck exists.  
Not yet closed: complete external-link, hidden-data, redaction and sanitization proof across supported formats.

`UDM-FOUNDATION-0082` likewise records a partial current security posture through `DocumentSpineProofService.securityProof` plus `ArtifactIntakePolicy`; hidden-data/link/redaction policy remains format-dependent.

### 3.3 IDENTIFY handoff

The frozen `DocumentIdentityReceipt v1` makes active-content posture a Documents-owned evidence fact and requires:

- `PRESENT` when deterministic evidence finds contract-listed active content;
- `INERT` only after the complete subtype-specific check set ran and found none;
- `UNKNOWN` when identity is ambiguous, inspection is incomplete, bounds prevent examination, or a required classifier is unavailable.

SECURE therefore must consume the immutable identity receipt and deeper inspection facts. It must not silently re-identify the source or let a filename/media hint weaken exact package evidence.

## 4. Per-format recovered capability census

### DOCX / DOCM / OOXML Word

Recovered evidence demonstrates meaningful portable security behavior but not a complete current per-format proof:

- known effectful/external/macrolike field commands are rejected before semantic promotion; deterministic safe fields such as PAGE/NUMPAGES/REF/SEQ/AUTHOR remain available;
- external links are represented without dereference; safe URI schemes and internal bookmark resolution are separately validated;
- a prior critical defect showed that classifying every `word/embeddings/*` entry as active content is too coarse;
- the repaired behavior permits only a narrowly proven chart-owned static-data XLSX embedding to be treated as inert, after verifying the chart relationship and rejecting formulas, macros, ActiveX/OLE embeddings, external-link parts and external relationships;
- all other embeddings remain active-content evidence.

Design lesson: SECURE may neither use a coarse `embedded == unsafe` shortcut nor introduce a broad embedded-XLSX allowlist. Any inert exception must be relationship-, purpose- and content-bounded, deterministic and regression-tested.

Open DOCX security depth includes complete hidden-data/privacy inventory, document-wide external relationship classification, redaction/sanitization absence proof and current exact-subject requalification.

### PPTX / PPTM / OOXML Presentation

Recovered capability matrices declare portable implementation for:

- package/security inspection;
- macros/VBA indicators;
- OLE/ActiveX/embedded-package inventory;
- external relationship target inventory;
- hyperlink/media inventory;
- adversarial scanning for dangerous active content and unsafe relationships;
- package diff/roundtrip verification and unknown-part preservation.

These declarations require atomic depth audit and current-subject requalification before being promoted as current complete truth. Native PowerPoint rendering/playback, Office.js execution and VBA execution remain external/native boundaries and are not part of SECURE PASS.

Open PPTX security depth includes hidden-slide/notes/comment/privacy semantics where applicable, launch/action/timing effect classification, sanitization/redaction proof and exact current-subject evidence.

### PDF

Recovered PDF capability inventory includes planned/partial redaction and sanitization capabilities such as:

- redaction target selection/preview;
- visible-content redaction apply;
- hidden-data sanitization;
- redaction absence proof;
- sanitization absence proof.

Those rows remain source-status-review / engine-orchestration dependent and cannot be claimed complete. SECURE must inventory document-level action/effect facts such as JavaScript/launch/external URI/embedded-file behavior where supported by current source, but must not execute them. Encryption/protection remains fail-closed without an authorized route. Signature validity after mutation is never inferred.

### Text / HTML / RTF / ODF / EPUB / legacy formats

Current evidence depth is not sufficient to claim an exhaustive security posture for every recognized family. SECURE must therefore use explicit `EVIDENCE_DEPTH_UNKNOWN` / bounded-inspection outcomes rather than silently mapping recognition to safety. Recognition, parser availability, processing-engine qualification and security standing remain distinct facts.

## 5. Lossless requirement-to-evidence matrix

| Requirement / invariant | Current component / state | Interface or contract | Test / evidence standing | Environment | Current blocker / residual |
| --- | --- | --- | --- | --- | --- |
| UDM-SPINE-0003 SECURE | `UniversalDocumentSpine` SECURE + `ArtifactIntakePolicy`; partial verified | IDENTIFY receipt -> SECURE facts/policy boundary | historical portable spine receipt | portable historical exact subject | per-format depth incomplete; current source not GitHub-native |
| CS-SEC-001 bounded intake | governed intake / quarantine posture | intake receipt + source digest | recovered verified intake evidence | portable historical exact subject | current requalification required |
| CS-SEC-002 archive bounds | bounded container inspection | explicit inspection limits | adversarial archive/container tests required | portable | current exact-source regression pending |
| CS-SEC-003 secure XML | secure parser configuration | parser policy contract | XXE/DTD/XInclude/external-resource negatives required | portable | per-engine/current-source verification pending |
| CS-SEC-004 active content no execution | identity + inspect + SECURE | document security facts | DOCX/PPTX recovered evidence; complete cross-format denominator missing | portable + format engines | depth audit/current requalification |
| CS-SEC-005 no network by default | processing runtime boundary | shared authority required for network effect | negative network/dereference tests required | portable | shared effect authority is external to Documents |
| CS-SEC-006 external relationships | format inspectors | relationship inventory facts -> shared policy | PPTX/DOCX recovered behavior | portable | full PDF/format coverage + current requalification |
| CS-SEC-007 path confinement | package/intake helpers | authorized-root contract | traversal/path negatives required | portable | current-source regression pending |
| CS-SEC-008 encryption/protection | format/security inspection | authorized credential/policy route | fail-closed encrypted/protected cases required | portable + external/native when needed | credential/native authority external |
| CS-SEC-009 redaction/sanitization proof | PDF/document proof path partial | mutation receipt + absence-proof receipt | PDF rows source-status review; security-proof spine partial | portable + validator/engine where required | complete absence proof not current-qualified |
| CS-SEC-010 privacy-safe telemetry | receipts/logging boundary | identifiers/digests/metrics only | content-leak regression required | portable | current exact-source verification pending |
| UDM-SPINE-0016 SECURITY_PROOF | `DocumentSpineProofService.securityProof`; partial | final proof gate | active-content recheck exists | historical portable exact subject | external-link/hidden-data/redaction/sanitization proof incomplete |
| IDENTIFY -> SECURE truth handoff | `DocumentIdentityReceipt v1` design lock | immutable source/classifier-bound receipt | 30-case IDENTIFY denominator frozen, runtime unbuilt | specification only | current exact source custody |

No row is promoted from historical evidence to current PASS merely because a predecessor receipt exists.

## 6. Ownership adjudication

DOCUMENTS owns:

- document-specific active-content facts;
- document package/relationship/security inventory facts;
- document-specific hidden-data/privacy indicators;
- document-level redaction/sanitization evidence and absence-proof semantics;
- the SECURE-stage assessment receipt and deterministic document-processing eligibility facts.

DOCUMENTS does **not** own:

- global security policy;
- user/system effect authorization;
- network permission;
- credential authority;
- malware verdict authority outside admitted document evidence;
- native Office trust decisions;
- publication authority;
- Book, Learning, Programming, spreadsheet or retired Prose semantics.

Shared security/effect authority decides whether an effect is permitted. SECURE supplies immutable, source-bound facts and may fail closed for Documents processing when those facts are unsafe, incomplete, ambiguous or bounds-limited.

## 7. Adversarial analysis and design constraints

The design-lock successor must preserve these constraints:

1. No active content is executed to classify it.
2. No external relationship is dereferenced during SECURE.
3. Network remains unavailable by default.
4. `UNKNOWN`, `AMBIGUOUS`, malformed, bounds-exceeded, incomplete-inspection and unavailable-classifier states cannot become PASS.
5. `INERT` requires a complete subtype-specific inspection set, not absence of one known marker.
6. Stronger package/byte evidence cannot be weakened by filename, declaration or extension.
7. Unknown/native parts are preserved as evidence; lack of semantic ownership does not imply safe execution.
8. Narrow inert exceptions require deterministic relationship + purpose + content evidence; broad allowlists are forbidden.
9. Encryption/protection/signature state is evidence, not authority to bypass protection or claim signature validity.
10. Redaction/sanitization is not complete until targeted and hidden representations have post-operation absence proof.
11. Security receipts contain references/digests and bounded facts, not raw document content by default.
12. A native renderer, Office host, external provider or A-01 result is not synthesized from portable evidence.
13. SECURE cannot take shared effect-policy truth from Core, nor can shared infrastructure absorb Documents semantic classification.
14. Restart/retry must reproduce the same semantic assessment for the same exact source + inspector/policy-input versions; retries cannot reclassify a permanent security failure as transient success.

## 8. Design-lock denominator to freeze next

The successor should freeze at least these isolated cases before any build:

1. exact source digest mismatch fails before security assessment;
2. UNKNOWN identity -> fail-closed security standing;
3. AMBIGUOUS identity -> fail-closed security standing;
4. package entry-count bound exhaustion;
5. per-entry size bound exhaustion;
6. total inflated-size bound exhaustion;
7. duplicate-entry rejection/ambiguity;
8. traversal attempt rejection;
9. nested/recursive container bound exhaustion;
10. XXE/DTD/XInclude/external-resource XML attempts rejected;
11. DOCM macro inventory without execution;
12. DOCX arbitrary embedded binary -> active/quarantine fact;
13. narrowly verified chart-owned static XLSX -> inert only when all exclusion checks pass;
14. formula-bearing chart workbook -> active/unknown, never inert;
15. embedded workbook with external relationship -> active/unknown;
16. ActiveX/OLE indicator -> PRESENT/quarantine fact;
17. unsafe/effectful field command rejected;
18. safe deterministic field remains representable without execution;
19. DOCX external hyperlink inventoried but not dereferenced;
20. missing internal bookmark target fails closed;
21. PPTM macro inventory without execution;
22. PPTX OLE/ActiveX/embedded package inventory;
23. PPTX external relationship inventory without dereference;
24. presentation launch/action/effect unknown -> policy required / fail closed;
25. PDF JavaScript/action indicator inventory when parser evidence supports it;
26. PDF external URI/launch fact inventory without dereference/execution;
27. PDF embedded-file fact inventory;
28. encrypted/protected document without authorized route -> blocked;
29. signature/protection state is not called valid after mutation without proof;
30. redaction visual cover without absence proof -> not sanitized;
31. hidden-data sanitization without absence proof -> not complete;
32. hidden-data evidence unknown -> final security proof incomplete;
33. content-free telemetry/log assertion;
34. recognition/engine availability cannot grant security PASS;
35. same source + same inspector + same contract reproduces same assessment digest;
36. inspector/version change invalidates stale assessment reuse;
37. shared effect-policy refusal remains refusal; Documents cannot override it;
38. no Book/Learning/Programming/spreadsheet/Prose semantics enter the receipt;
39. current INTAKE -> IDENTIFY -> SECURE -> FORENSICS stage handoff retains one truth owner per fact;
40. cumulative fail-closed regression preserves existing bounded intake, identity and active-content behavior.

## 9. Forensic conclusion

The SECURE boundary is not missing wholesale. A meaningful recovered fail-closed substrate exists and should be reused rather than rewritten. The unclosed work is the **semantic and evidence completion of per-format security posture**, especially external relationships, hidden data/privacy, redaction/sanitization absence proof, encryption/protection behavior and bounded unknown/ambiguous handling under the newly frozen IDENTIFY receipt.

The present evidence is sufficient to proceed to specification/design lock without runtime mutation. It is not sufficient to claim current implementation completion, current exact-subject qualification, native Office security standing, external authority, publication authority, A-01 PASS or production readiness.

## Exact successor

`DOCUMENTS-SPINE-SECURE-DESIGN-LOCK-001 — FREEZE DOCUMENT SECURITY FACTS / ASSESSMENT RECEIPT + IDENTIFY->SECURE HANDOFF + SHARED EFFECT-AUTHORITY FENCE + 40-CASE QUALIFICATION DENOMINATOR, WITHOUT RUNTIME MUTATION`
