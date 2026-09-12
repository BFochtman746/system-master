# DOCUMENTS-SPINE-EXTRACT-DESIGN-LOCK-001

Status: **DESIGN LOCK / SPECIFICATION PASS / RUNTIME BUILD NOT AUTHORIZED UNTIL CURRENT SOURCE CUSTODY**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Capability: `UDM-SPINE-0006` — EXTRACT  
Parent forensic packet: `DOCUMENTS-SPINE-EXTRACT-FORENSIC-PREP-001`  
Design-lock base: `documents/control-v1@fe136c16805ba31e393e1ffe58051fe3e049398f`

## 1. Purpose

EXTRACT produces a bounded, source-accountable content projection from an exact admitted document and exact PARSE standing. It must preserve what was observed, what was omitted, what could not be extracted, which engine observed it, and whether OCR/native/external evidence is still required.

EXTRACT is not document understanding. Plain-text success is not semantic mastery, and absence from an extracted projection is not proof of absence from native/visual source content unless the exact declared extraction denominator proves that fact.

## 2. Required input contract

EXTRACT requires:

- exact source artifact id/reference;
- exact `source_sha256`;
- immutable `DocumentIdentityReceipt v1` digest;
- immutable `DocumentParseReceipt v1` digest;
- parse semantic digest + native-inventory digest;
- extraction strategy id;
- extractor implementation id + immutable implementation digest/version;
- extraction ruleset id + digest;
- extraction bounds profile id + digest;
- contract version.

An extractor may consume native bytes, CDG-2, or an admitted derivative only as declared by its strategy. Any source/parse/engine/ruleset mismatch fails before a reusable extraction receipt is issued.

## 3. `DocumentExtractionReceipt v1`

The immutable receipt contains at minimum:

- `contract_version`
- `source_artifact_id`
- `source_sha256`
- `identity_receipt_digest`
- `parse_receipt_digest`
- `parse_semantic_digest`
- `native_inventory_digest`
- `format`
- `profile`
- `extraction_strategy`
- `extractor_implementation_id`
- `extractor_implementation_digest`
- `extractor_version`
- `extraction_ruleset_id`
- `extraction_ruleset_digest`
- `bounds_profile_id`
- `bounds_profile_digest`
- `extraction_standing`
- `payload_artifact_digest` when a durable extracted payload is admitted
- `extracted_payload_digest`
- `span_count`
- `character_count`
- `source_anchor_coverage`
- `included_feature_classes[]`
- `omitted_feature_classes[]`
- `unsupported_feature_classes[]`
- `ocr_candidate_classes[]`
- `native_engine_requirements[]`
- `external_engine_requirements[]`
- `loss_ledger[]`
- `diagnostics[]`
- `receipt_digest`

Raw source or extracted content is not duplicated into telemetry or receipt diagnostics by default.

## 4. Extraction strategy taxonomy

Every extraction is exactly one declared strategy:

- `NATIVE_SEMANTIC`
- `CDG_SEMANTIC`
- `PORTABLE_TEXT`
- `PDF_LITERAL_FALLBACK`
- `QUALIFIED_LOCAL_ENGINE`
- `OCR_LOCAL`
- `OCR_EXTERNAL_AUTHORIZED`
- `OTHER_EXPLICIT`

A strategy name is part of receipt identity. A fallback cannot be silently relabeled as native/semantic extraction.

## 5. Extraction standing taxonomy

`extraction_standing` is one of:

- `COMPLETE_FOR_DECLARED_SLICE`
- `PARTIAL`
- `NO_EXTRACTABLE_TEXT_OBSERVED`
- `OCR_REQUIRED`
- `NATIVE_ENGINE_REQUIRED`
- `UNSUPPORTED_EXTRACTOR`
- `MALFORMED_SOURCE`
- `BOUNDS_EXCEEDED`
- `AMBIGUOUS`
- `ENGINE_DISAGREEMENT`
- `FAILED_INTEGRITY`

`NO_EXTRACTABLE_TEXT_OBSERVED` means only that the declared extractor found no extractable text under its exact denominator. It never means the visual/native artifact contains no text unless all relevant image/render/OCR/native surfaces were explicitly in-denominator and passed.

## 6. Loss and omission law

Every material content class in the bound PARSE receipt must be classified by EXTRACT as one of:

- included in the extracted projection;
- intentionally excluded by declared scope;
- omitted because the current extractor lacks semantic support;
- OCR candidate;
- native-engine-required;
- external-engine-required;
- preserved native/unmodeled content not represented in the extracted payload.

No class may disappear from evidence merely because it contributes no text.

The `loss_ledger[]` is an evidence ledger for the extraction projection, not a mutation-loss ledger. It records projection omissions and normalization losses while leaving source bytes unchanged.

## 7. Source-anchor law

Where native/CDG source anchors exist, extracted spans must retain source attribution at the finest deterministic level supported by the extractor.

An extracted span may record:

- source native part/object/path;
- CDG element id;
- page/slide/paragraph/run/region coordinate;
- relationship/asset id where relevant;
- source range or stable locator;
- extraction engine evidence id.

If reliable span-level source attribution is unavailable, `source_anchor_coverage` must state the coarser level or `UNAVAILABLE`. It may not silently claim complete anchoring.

## 8. DOCX / DOCM contract

The recovered main-document paragraph-text extractor remains admissible as a `PORTABLE_TEXT` fallback, not as complete DOCX extraction.

A receipt using that fallback must explicitly classify, when present or potentially present under the bound PARSE inventory:

- headers/footers;
- footnotes/endnotes;
- comments/revisions;
- drawing/shape text;
- chart/diagram data/text;
- text boxes/embedded objects;
- fields and field-result semantics;
- content controls/custom XML;
- alternate/versioned content;
- image text;
- unknown/unmodeled parts.

A richer CDG/native semantic extractor may later include these only when its exact denominator is qualified.

## 9. PPTX / PPTM contract

The recovered slide-text + speaker-note projection is admissible as a declared portable slice.

The receipt must separately account for, where present:

- slide text;
- speaker notes;
- master/layout/theme text or metadata when in scope;
- chart/diagram data/text;
- media captions/transcripts;
- embedded objects/files;
- image text;
- comments/review data;
- animations/triggers that change visible content;
- unknown/custom parts.

Text from hidden/non-visible or alternate presentation states must retain visibility/context evidence rather than being flattened into an unqualified transcript.

## 10. PDF contract

The recovered dependency-free literal-string extraction is admitted only as `PDF_LITERAL_FALLBACK` and is always loss-limited unless a specific fixture denominator proves otherwise.

It cannot establish complete PDF text because raw literal strings do not model all content streams, encodings, fonts, ToUnicode maps, object streams, forms, optional content, rendering order or scanned/image text.

A qualified local `pdftotext`-style engine may be admitted as `QUALIFIED_LOCAL_ENGINE` only with exact engine id/version/digest, bounded argv-only execution, source SHA binding and its own evidence denominator.

Scanned/image-only or text-poor PDF must become `OCR_REQUIRED`, `NATIVE_ENGINE_REQUIRED`, `PARTIAL` or other exact standing—not false `NO_EXTRACTABLE_TEXT_OBSERVED` when visual text is unobserved.

## 11. OCR authority boundary

OCR is a separate explicit strategy. It requires:

- exact source or rendered-image artifact digest;
- page/region/render identity;
- OCR engine id/version/digest;
- capability/action id;
- `networkRequired` standing;
- regions + geometry + confidence + diagnostics;
- OCR receipt digest.

Provider confidence is observation, not canonical truth.

Local OCR and external/network OCR are distinct authority classes. Network-required OCR cannot execute merely because EXTRACT needs more text; it requires separately admitted external-effect/provider authority.

OCR text is provenance-bearing derived evidence and cannot overwrite native source text/semantics silently.

## 12. Engine selection law

Extractor selection is deterministic from an admitted policy/ruleset and cannot be opportunistically upgraded without changing receipt identity.

A higher-fidelity engine may supersede a fallback only by producing a new receipt. Both receipts remain immutable evidence.

If two qualified engines materially disagree beyond the declared tolerance, standing is `ENGINE_DISAGREEMENT` or `AMBIGUOUS`; neither result is silently chosen as truth.

## 13. External-reference and active-content law

EXTRACT may report text/metadata already present in source bytes but does not dereference external links, load remote media, execute macros/scripts/ActiveX/OLE, or activate embedded packages to obtain content.

Such requirements remain explicit `external_engine_requirements` / `native_engine_requirements` / blocked prerequisites.

## 14. Persistence, idempotency and invalidation

Receipt identity is based on:

`source_sha256 + identity_receipt_digest + parse_receipt_digest + extraction_strategy + extractor_implementation_digest + extraction_ruleset_digest + bounds_profile_digest + contract_version`

Rules:

- same exact inputs and deterministic strategy reproduce the same extracted-payload digest and semantic receipt digest;
- source, PARSE receipt, strategy, engine, ruleset, bounds or contract changes create a new receipt;
- durable extracted payloads are content-addressed and separate from metadata receipts;
- caches are advisory until receipt key + payload digest are verified;
- stale read-after-write assumptions are forbidden;
- prior fallback receipts remain evidence when a richer engine is later admitted.

## 15. Stable error / reason classes

- `EXTRACT_SOURCE_DIGEST_MISMATCH`
- `EXTRACT_IDENTITY_RECEIPT_MISMATCH`
- `EXTRACT_PARSE_RECEIPT_MISMATCH`
- `EXTRACT_PARSE_STANDING_INCOMPATIBLE`
- `EXTRACT_UNSUPPORTED_EXTRACTOR`
- `EXTRACT_MALFORMED_SOURCE`
- `EXTRACT_BOUNDS_EXCEEDED`
- `EXTRACT_PARTIAL_COVERAGE`
- `EXTRACT_SOURCE_ANCHOR_INCOMPLETE`
- `EXTRACT_OCR_REQUIRED`
- `EXTRACT_NATIVE_ENGINE_REQUIRED`
- `EXTRACT_EXTERNAL_ENGINE_REQUIRED`
- `EXTRACT_ENGINE_UNAVAILABLE`
- `EXTRACT_ENGINE_VERSION_MISMATCH`
- `EXTRACT_ENGINE_DISAGREEMENT`
- `EXTRACT_REPROJECTION_MISMATCH`
- `EXTRACT_EXTERNAL_DEREFERENCE_FORBIDDEN`
- `EXTRACT_ACTIVE_EXECUTION_FORBIDDEN`
- `EXTRACT_EVIDENCE_INCOMPLETE`

Permanent content/format facts are not transient retry classes.

## 16. Isolated qualification denominator — 44 cases

1. source digest mismatch fails;
2. stale identity receipt fails;
3. stale PARSE receipt fails;
4. incompatible PARSE standing fails or yields explicit partial standing;
5. extraction strategy is receipt-bound;
6. extractor implementation change invalidates reuse;
7. ruleset change invalidates reuse;
8. bounds change invalidates reuse;
9. exact inputs reproduce extracted payload digest;
10. exact inputs reproduce receipt digest;
11. DOCX main-body paragraph fallback extracts declared baseline;
12. DOCX header/footer presence is accounted when fallback omits it;
13. DOCX note/comment/revision presence is accounted when omitted;
14. DOCX drawing/shape/image text is not silently treated as absent;
15. DOCX chart/diagram/embed content is explicit omission/requirement;
16. DOCX unknown native content remains preserved/unmodeled;
17. PPTX slide text baseline extracts declared content;
18. PPTX speaker notes baseline extracts declared content;
19. PPTX chart/diagram/embed/media omissions remain explicit;
20. PPTX image text becomes OCR candidate/omission, not false absence;
21. PDF literal fallback is labeled `PDF_LITERAL_FALLBACK`;
22. PDF literal fallback cannot claim complete text extraction;
23. qualified local PDF engine receipt binds exact version/digest when used;
24. unavailable local PDF engine yields explicit engine-required standing;
25. scanned/image-only PDF yields OCR-required/partial standing;
26. text-poor PDF cannot silently become no-text truth;
27. supported text-family extraction produces deterministic projection;
28. HTML script/style/non-text omissions are explicitly accounted;
29. RTF unsupported advanced structure is explicitly accounted;
30. recognized unsupported format yields `UNSUPPORTED_EXTRACTOR`;
31. malformed source differs from unsupported extractor;
32. bounds exhaustion yields `BOUNDS_EXCEEDED`;
33. source-anchor coverage is measured and cannot be overstated;
34. no external relationship is dereferenced;
35. no macro/script/ActiveX/OLE is executed;
36. OCR engine identity/version/digest is mandatory when OCR is used;
37. OCR confidence remains observational evidence;
38. external/network OCR cannot execute without separate authority;
39. engine disagreement yields explicit disagreement standing;
40. EXTRACT receipt carries omitted/unsupported feature classes from bound PARSE inventory;
41. EXTRACT PASS does not imply UNDERSTAND/mastery PASS;
42. EXTRACT output cannot overwrite native source authority;
43. no raw source/extracted content leaks to telemetry by default;
44. cumulative INTAKE -> IDENTIFY -> SECURE -> FORENSICS -> PARSE -> EXTRACT source identity, ownership, fail-closed and evidence boundaries remain intact.

## 17. Cumulative regression/calibration gate

Future implementation must run on one exact executable subject, where dependency-valid:

- prior INTAKE/IDENTIFY/SECURE/FORENSICS/PARSE denominators;
- 44 EXTRACT cases above;
- DOCX/PPTX/PDF/text-family extraction regressions;
- CDG/native source-anchor tests;
- omission/loss-ledger tests;
- qualified-local-PDF adapter exact-engine tests;
- OCR local/external authority-fence tests;
- no-external-dereference and no-active-execution tests;
- persistence/idempotency/cache invalidation tests;
- EXTRACT -> UNDERSTAND non-promotion tests.

Historical PASS cannot be transferred to changed bytes. Native/external/A-01 evidence remains separately scoped.

## 18. Non-claims

This design lock does not establish:

- GitHub-native R4 source custody;
- runtime implementation of `DocumentExtractionReceipt v1`;
- current exact-subject qualification;
- complete DOCX/PPTX/PDF extraction;
- OCR execution or OCR accuracy;
- availability/qualification of local PDF/OCR binaries in the current environment;
- native Microsoft Office/PDF-reader fidelity;
- external provider authority;
- A-01 PASS;
- publication or production readiness.

## 19. Freeze decision

The recovered format extractors, local PDF adapter and OCR ports are retained as useful substrate. The missing layer is a source/PARSE-bound, loss-aware extraction receipt and deterministic strategy authority.

Runtime build remains blocked until exact R4 GitHub-native source custody and fresh current-subject baseline qualification are established.

## Exact next operations

Runtime successor, **blocked**:

`DOCUMENTS-SPINE-EXTRACT-IMPLEMENTATION-001 — IMPLEMENT DOCUMENT EXTRACTION RECEIPT V1 + LOSS/OMISSION LEDGER + SOURCE-ANCHOR BINDING + OCR/NATIVE FALLBACK FENCES + 44-CASE ISOLATED QUALIFICATION + CUMULATIVE SPINE REGRESSION, BLOCKED ON EXACT R4 GITHUB-NATIVE SOURCE CUSTODY AND FRESH CURRENT-SUBJECT BASELINE QUALIFICATION.`

Independent work-ahead successor, **ready**:

`DOCUMENTS-SPINE-UNDERSTAND-FORENSIC-PREP-001 — RECOVER + INVENTORY + ANALYZE UDM-SPINE-0007 DOCUMENT UNDERSTANDING/SEMANTIC-INTERPRETATION CONTRACT, EVIDENCE VS INFERENCE BOUNDARIES, PROVISIONAL UNKNOWN-FEATURE SEMANTICS AND EXTRACT-TO-UNDERSTAND HANDOFF, WITHOUT RUNTIME MUTATION.`
