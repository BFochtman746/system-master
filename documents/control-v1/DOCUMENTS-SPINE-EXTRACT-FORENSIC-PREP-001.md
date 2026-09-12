# DOCUMENTS-SPINE-EXTRACT-FORENSIC-PREP-001

Status: **FORENSIC RECOVERY / LOSSLESS CAPABILITY MATRIX COMPLETE / NO RUNTIME MUTATION**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Capability: `UDM-SPINE-0006` — EXTRACT  
Live-base revalidated before mutation: `documents/control-v1@69ae54924c66f74697ea22a84c160eff46a4b771`  
Parent design lock: `DOCUMENTS-SPINE-PARSE-DESIGN-LOCK-001`  
Historical recovered source inspected: `documents/r4-current-capability-ledger-admission-007@dbea54620c6d3b6479f64d981b6ff3c8b4cdf01f`

## 1. Scope and authority

EXTRACT derives bounded content projections from an exact document source and its admitted PARSE standing. It does not replace native source authority, does not imply document understanding, and does not silently convert omitted/non-textual content into absence.

This packet analyzes recovered EXTRACT behavior without modifying recovered runtime bytes. It keeps OCR, native/external engines, semantic understanding, Book/Learning content semantics and publication authority outside generic EXTRACT unless explicitly bound by their own contracts.

## 2. Recovered execution path

The recovered universal spine currently executes:

`PARSE -> DocumentProcessingService.extractPlainText(format, sourceBytes) -> EXTRACT stage receipt -> UNDERSTAND`

The current EXTRACT stage:

- reads exact source bytes directly rather than consuming the CDG-2 graph as its sole semantic source;
- computes a plain-text result;
- hashes that text;
- records only `text-sha256` and character count in the EXTRACT stage receipt.

This is a useful portable baseline but is not loss-aware enough for the new build standard because it does not bind the PARSE receipt/semantic digest, extraction implementation identity, coverage/omission standing, source-anchor mapping or OCR/native fallback decisions.

## 3. Recovered per-format extraction behavior

### DOCX / DOCM

`DocumentProcessingService.extractPlainText` joins `DocxPackageEngine.inspect(...).paragraphs()` with blank lines.

`DocxPackageEngine.paragraphs()` enumerates `w:p` descendants of `word/document.xml` and concatenates `w:t` descendants. That means the current portable text projection is useful but can differ materially from the deeper CDG-2 surface. It does not by this path establish complete extraction of headers/footers, footnotes/endnotes, comments, text in all drawing/shape constructs, field semantics, chart data, embedded content, alternate-content choices, or every other modeled/unmodeled native feature.

Standing: **PORTABLE MAIN-DOCUMENT PARAGRAPH TEXT PROJECTION / PARTIAL DOCUMENT CONTENT EXTRACTION**.

### PPTX / PPTM

The recovered service derives text from the package inspection's slide text plus speaker notes. This is broader than title-only extraction but still does not prove complete extraction of chart semantics, SmartArt/diagram semantics, embedded spreadsheets/objects, media transcripts, animation-triggered content or unknown/custom parts.

Standing: **PORTABLE SLIDE + NOTE TEXT PROJECTION / PARTIAL PRESENTATION CONTENT EXTRACTION**.

### PDF

The dependency-free `PdfStructuralEngine` extracts up to 500 parenthesized literal strings from raw PDF bytes. This is explicitly a conservative structural fallback, not a general PDF text-layout/content-stream interpreter.

A separate local PDF CLI adapter can provide `pdftotext -layout` extraction when a qualified local engine is available, with exact engine identity/version/digest and bounded execution. The universal `extractPlainText` path does not currently select/bind that richer engine.

Standing: **LITERAL-TEXT FALLBACK IN UNIVERSAL PATH; QUALIFIED LOCAL ENGINE EXISTS AS A SEPARATE CAPABILITY**.

### MARKDOWN / PLAIN_TEXT / HTML / RTF

The text engine performs portable conversion to plain text. HTML/RTF normalization can omit scripts/styles and advanced structure by design. Standing: **SUPPORTED TEXT PROJECTION WITH FORMAT-SPECIFIC LOSS/OMISSION REQUIREMENTS**.

### ODT / EPUB / LEGACY_DOC / LEGACY_PPT / ODP / PPSX / POTX

The recovered service throws `UnsupportedOperationException` because a qualified extraction engine is pending. Standing: **UNSUPPORTED_EXTRACTOR**.

## 4. OCR / image-text boundary

A separate OCR lane exists with an explicit replaceable `OcrEnginePort`, engine identity/version/digest, capabilities, health and `networkRequired` standing. OCR results contain region text, geometry/confidence/type/facts; provider confidence is explicitly observation, not canonical truth.

A Tesseract/local implementation and OCR full-lane machinery exist historically, but the universal EXTRACT stage does not currently invoke OCR or bind an OCR receipt.

Therefore:

- scanned/image-only PDF text absence cannot be treated as proof that no text is present;
- image text in DOCX/PPTX cannot be silently omitted while claiming full extraction;
- OCR must be an explicit extraction strategy with source/render/engine identity and confidence/diagnostic evidence;
- network-required OCR is external-provider work and cannot be inferred or invoked without separate authority.

## 5. Lossless requirement / invariant matrix

| # | Requirement / invariant | Current implementation | Durable state / evidence | Interface / contract | Standing | Gap / blocker |
|---|---|---|---|---|---|---|
| 1 | exact source SHA binds extraction | text hash derived after exact source path | source + EXTRACT receipt | `extractPlainText` / spine `extract` | PARTIAL | receipt does not record source SHA independently beyond stage envelope semantics |
| 2 | exact PARSE receipt binds extraction | PARSE runs before EXTRACT | separate PARSE receipt | stage ordering | PARTIAL | EXTRACT key does not bind parse receipt/semantic digest |
| 3 | extraction implementation identity is immutable | concrete service/classes exist | code only | implementation | MISSING IN RECEIPT | extractor id/digest/version required |
| 4 | successful text extraction != full content extraction | code returns plain string only | text digest + char count | `extractPlainText` | MISSING STANDING | no complete/partial/omitted taxonomy |
| 5 | omissions are explicit | some conversion code names losses | EXTRACT does not preserve them | none reusable | MISSING | omission/loss ledger required |
| 6 | exact output digest is deterministic | text SHA recorded | EXTRACT receipt | stage receipt | COVERED | none portable |
| 7 | source anchors exist for extracted spans where possible | deeper CDG-2 has anchors | not used by plain-text extraction | none | MISSING | span/source-anchor map required for accountable extraction |
| 8 | DOCX main-body text is extracted | `w:p`/`w:t` descendants in main document | text receipt | DocxPackageEngine | COVERED FOR DECLARED FALLBACK | not complete document scope |
| 9 | DOCX non-main-part text omissions are explicit | deeper graph models more parts | none in EXTRACT | none | MISSING | headers/footers/notes/comments/etc coverage classification needed |
| 10 | DOCX drawing/shape/chart/embedded omissions are explicit | deeper projectors/mastery engines exist | none in EXTRACT | none | MISSING | feature-class omission ledger needed |
| 11 | PPTX slide text extraction | package inspection feeds slide text | text receipt | presentation extraction | COVERED FOR DECLARED SLICE | does not establish all semantic content |
| 12 | PPTX speaker notes extraction | notes appended | text receipt | presentation extraction | COVERED FOR DECLARED SLICE | source-anchor/coverage standing absent |
| 13 | PPTX chart/diagram/media/embed omissions explicit | richer native model exists | none in EXTRACT | none | MISSING | omission ledger |
| 14 | PDF universal fallback is not mislabeled complete | raw literal-string fallback implemented | text receipt | PdfStructuralEngine | MISSING STANDING | must identify `LITERAL_TEXT_FALLBACK` |
| 15 | qualified local PDF text engine can be separately bound | LocalPdfCliEnginePort exposes engine identity/version/digest | engine receipt possible in separate lane | PdfEnginePort | COVERED HISTORICALLY | not integrated into EXTRACT authority |
| 16 | image-only/scanned PDF absence is not `NO_TEXT` truth | OCR lane exists separately | none in EXTRACT | OCR port | MISSING | OCR-required/unknown standing needed |
| 17 | image text in DOCX/PPTX omission is visible | OCR lane exists separately | none in EXTRACT | OCR port | MISSING | image-text candidate inventory/handoff needed |
| 18 | OCR confidence is observational | OCR port contract says confidence not canonical truth | OCR graph/receipt | OCR port | COVERED IN OCR MODEL | not bound into EXTRACT |
| 19 | network-required OCR is external authority | OCR engine identity exposes `networkRequired` | OCR identity | OCR port | COVERED IN MODEL | EXTRACT must not auto-call external engine |
| 20 | unsupported formats fail explicitly | service throws unsupported | exception | extract API | COVERED COARSELY | immutable failure/standing receipt absent |
| 21 | malformed source differs from unsupported extractor | lower engines throw parse/IO errors | exception | lower engine | PARTIAL | stable extraction reason taxonomy absent |
| 22 | bounds exhaustion is explicit | DOCX package has bounded entries/inflation; PDF CLI bounded output/time | exception | lower engines | PARTIAL | EXTRACT-wide bounds standing absent |
| 23 | external links are not dereferenced to extract content | current portable paths do not fetch | implicit | extractor | COVERED CURRENTLY | must freeze rule explicitly |
| 24 | active content is never executed for extraction | DOCX reader does not execute; SECURE is upstream | SECURE/PARSE chain | stage chain | COVERED | retain invariant |
| 25 | native/unmodeled content remains preserved when omitted | source authority remains upstream | source + PARSE receipt | CDG-2 | COVERED UPSTREAM | EXTRACT receipt must carry omission/preservation linkage |
| 26 | extracted text cannot overwrite source/native truth | current EXTRACT produces string only | stage receipt | spine | COVERED STRUCTURALLY | freeze authority rule |
| 27 | EXTRACT PASS cannot imply UNDERSTAND PASS | separate stage | separate receipt | spine order | COVERED STRUCTURALLY | freeze semantic non-promotion |
| 28 | repeated exact extraction identity is deterministic | text SHA deterministic for portable fallback | receipt | current stage key | PARTIAL | engine/ruleset/parse identity not in key |
| 29 | raw source content does not leak to telemetry | only digest/count recorded | stage receipt | checkpoint | COVERED CURRENTLY | preserve rule |
| 30 | historical PASS does not transfer to current reconstructed subject | governance requires exact subject | governance | qualification | COVERED GOVERNANCE | R4 current source custody/qualification remains blocked |

Result: **30/30 bounded EXTRACT invariants accounted; 0 unaccounted rows.** This is a forensic accounting result, not runtime completion.

## 6. Central recovered design defect

The current portable EXTRACT stage records a text digest and character count but cannot answer, durably and machine-readably:

- what exact extractor/ruleset produced the text;
- what PARSE standing/semantic digest it consumed;
- which semantic/native feature classes were included;
- which were omitted, unsupported or OCR-required;
- whether text absence means observed absence, unsupported extraction or unobserved image text;
- what source anchors generated each extracted span;
- whether a richer qualified/native engine was required but unavailable.

The next design must fix the receipt/standing contract rather than rewrite useful existing format extractors wholesale.

## 7. Required extraction standing taxonomy

At minimum:

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

`NO_EXTRACTABLE_TEXT_OBSERVED` is valid only for the exact declared extractor slice. It is not proof that the visual artifact contains no text.

## 8. Required durable extraction product

The design-lock successor should freeze an immutable `DocumentExtractionReceipt v1` with:

- source and parse receipt identity;
- extractor implementation/ruleset identity;
- extraction strategy (`NATIVE_SEMANTIC | PORTABLE_TEXT | PDF_LITERAL_FALLBACK | QUALIFIED_LOCAL_ENGINE | OCR | OTHER_EXPLICIT`);
- exact output digest;
- normalized extracted-span count/character count;
- source-anchor coverage;
- included feature classes;
- omitted/unsupported feature classes;
- OCR/native/external requirements;
- loss/omission ledger;
- standing and diagnostics;
- no raw-content telemetry default.

The extracted payload itself may be stored as a content-addressed artifact when required, separate from telemetry/receipt metadata.

## 9. Qualification implications

Future isolated qualification must prove at least:

- source + PARSE receipt mismatch failure;
- engine/ruleset version invalidation;
- deterministic output digest;
- DOCX main-body paragraph extraction baseline;
- explicit DOCX non-main-part omission classification;
- explicit DOCX non-text/native feature omission classification;
- PPTX slide + notes baseline;
- explicit PPTX chart/diagram/media/embed omission classification;
- PDF literal fallback clearly labeled partial/fallback;
- richer local PDF engine, when available, bound to exact engine identity;
- image-only PDF yields OCR-required/unknown rather than false no-text truth;
- image text in OOXML remains explicit OCR candidate/omission;
- OCR confidence remains observation, not canonical truth;
- external/network OCR never auto-runs without authority;
- unsupported format stable failure;
- malformed source stable failure;
- bounds exhaustion stable partial/failure;
- no external dereference or active-content execution;
- no raw-content telemetry leak;
- cumulative INTAKE -> IDENTIFY -> SECURE -> FORENSICS -> PARSE -> EXTRACT source/evidence boundaries remain intact.

## 10. Current blockers and non-claims

Runtime implementation remains custody-gated with preceding spine stages. Exact R4 canonical source bytes are still not established in GitHub-native custody and fresh current-subject qualification has not run.

This packet does not claim:

- runtime implementation of a new extraction receipt;
- complete extraction of DOCX/PPTX/PDF content;
- OCR execution or OCR accuracy;
- native Office/PDF-engine evidence;
- external-provider authority;
- A-01 PASS;
- publication or production readiness.

## 11. Adjudication

Preserve and reuse the current format-specific extractors and richer OCR/PDF engine ports. The required repair is a loss-aware orchestration/receipt layer that binds PARSE identity, exact extraction strategy and engine identity, explicit omissions, source anchors and OCR/native fallbacks.

## Exact next operation

`DOCUMENTS-SPINE-EXTRACT-DESIGN-LOCK-001 — FREEZE DOCUMENT EXTRACTION RECEIPT V1 + EXTRACTION-STANDING TAXONOMY + SOURCE/PARSE BINDING + OMITTED-CONTENT LOSS LEDGER + OCR/NATIVE FALLBACK AUTHORITY + SOURCE-ANCHOR CONTRACT + ISOLATED QUALIFICATION DENOMINATOR, WITHOUT RUNTIME MUTATION.`
