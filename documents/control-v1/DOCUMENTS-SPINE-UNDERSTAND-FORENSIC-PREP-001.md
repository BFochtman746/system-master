# DOCUMENTS-SPINE-UNDERSTAND-FORENSIC-PREP-001

Status: **FORENSIC RECOVERY / LOSSLESS CAPABILITY MATRIX COMPLETE / NO RUNTIME MUTATION**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Capability: `UDM-SPINE-0007` — UNDERSTAND  
Live-base revalidated before mutation: `documents/control-v1@6be5ca1073bf8d119d9841e8cce1a6eb9e2ac7d3`  
Parent design lock: `DOCUMENTS-SPINE-EXTRACT-DESIGN-LOCK-001`  
Historical recovered source inspected: `documents/r4-current-capability-ledger-admission-007@dbea54620c6d3b6479f64d981b6ff3c8b4cdf01f`

## 1. Scope and authority

UNDERSTAND is the document-local semantic interpretation boundary between evidence-bearing PARSE/EXTRACT outputs and later planning. It may derive document-semantic claims from exact admitted source evidence, but it may not promote inference, model output, confidence, or absence from a bounded extractor into native/source fact.

This packet performs recovery, inventory, analysis and adjudication only. It does not modify recovered runtime bytes and does not claim current exact-subject qualification.

Documents owns generic document/artifact interpretation semantics such as document structure, source-anchored content meaning, feature-role interpretation, relationships, layout/content context and provisional unknown-feature meaning. It does not acquire:

- Book authorship, Story Bible, editorial/literary or publication truth;
- Learning learner/curriculum/mastery/assessment/adaptation semantics;
- Programming execution/code semantics;
- Core identity, policy, effect, routing or global security authority;
- Prose work, which remains retired from Documents.

## 2. Recovered execution path

The recovered universal spine executes:

`PARSE -> EXTRACT -> UNDERSTAND -> PLAN`

The recovered `UniversalDocumentSpine.understand(...)` currently receives only the CDG-2 `sourceGraph` and source SHA. It does **not** consume the `extractedText` returned by the immediately preceding EXTRACT stage.

Current UNDERSTAND behavior is:

1. call `OpenWorldFeatureDiscovery.discover(sourceGraph)`;
2. compute stage-key material from `sourceGraph.semanticDigest()` plus the count of provisional unknown-native capabilities;
3. record evidence containing the graph semantic digest, unknown-native-feature count, and one `provisional=<id>:<nativePart>` entry per discovered unknown feature;
4. mark the generic stage receipt PASS.

This is useful open-world inventory, but it is not a complete document-understanding contract. The stage name currently overstates what the implementation proves.

## 3. Recovered open-world behavior

`OpenWorldFeatureDiscovery` converts each CDG-2 `UnknownNativeFeature` into a deterministic `ProvisionalCapability` carrying:

- stable provisional id;
- document format;
- native part;
- feature kind;
- native SHA-256;
- required disposition;
- proof requirements (`semantic-adapter-test`, `round-trip-preservation`, `native-oracle-when-applicable`).

It also provides a loss gate that blocks targeting of unmodeled native features. This is strong preservation-oriented substrate and should be retained.

However, a provisional capability is not semantic truth about the unknown feature. It is an evidence-bearing statement that an unmodeled feature exists and needs proof before stronger support is claimed.

## 4. Recovered semantic substrate outside current UNDERSTAND stage

The historical source contains richer document-semantic substrate, but it is not currently bound into the generic UNDERSTAND receipt:

- CDG-2 carries modeled elements, native anchors, native parts, unknown-native features and a semantic digest;
- `SemanticCdg2NativeAdapter` exposes deterministic format operations backed by first-class document APIs and explicitly leaves unsupported native features pending rather than pretending support;
- DOCX mastery engines model paragraph, page/section, table/image, drawing/chart, advanced semantic, structured-metadata and review/protection mechanics;
- review tooling includes semantic document diff and three-way semantic merge;
- vision/OCR tooling can produce provenance-bearing perceptual evidence.

These capabilities are useful evidence sources or later consumers, not permission to collapse their outputs into one unqualified UNDERSTAND truth.

## 5. Vision / OCR / model inference boundary

The recovered `DocumentVisionPerceptionService` preserves a useful fail-closed inference pattern:

- exact raster-to-ensemble evidence binding is checked;
- OCR engine agreement can be accepted as an observation;
- a local VLM is eligible only when healthy, locally cached, network-free at inference, and qualified for the exact capability;
- the VLM may select only among supplied OCR candidates or abstain;
- below-gate confidence, abstention, non-candidate output or unavailable/unqualified VLM becomes `REVIEW_REQUIRED`;
- the selected result retains source/raster/region provenance and decision authority.

This pattern must inform UNDERSTAND, but model confidence remains evidence about an inference process, not source/native authority. Any future model-assisted document interpretation must remain separately identified and provenance-bound.

## 6. Evidence vs inference authority classes

A future UNDERSTAND contract needs explicit claim classes. At minimum:

- `SOURCE_OBSERVED` — directly established by exact source/PARSE/EXTRACT evidence under a declared denominator;
- `DETERMINISTIC_DERIVED` — mechanically derived from source-bound evidence by an exact ruleset/implementation;
- `HEURISTIC_INFERRED` — heuristic interpretation with explicit method/version and uncertainty;
- `MODEL_INFERRED` — model-assisted interpretation with exact model/adapter/config identity and provenance;
- `PROVISIONAL_UNKNOWN_FEATURE` — known existence of an unmodeled feature without certified semantic meaning;
- `AMBIGUOUS` — competing meanings remain unresolved;
- `UNSUPPORTED` — no admitted interpreter exists for the required meaning;
- `BOUNDS_EXCEEDED` — interpretation denominator was not completed within admitted bounds;
- `ENGINE_DISAGREEMENT` — qualified interpreters materially disagree;
- `REVIEW_REQUIRED` — machine evidence is insufficient for stronger standing.

Authority class and confidence are orthogonal. A high-confidence inference is still inference. A low-confidence source observation may still be source evidence with diagnostics.

## 7. Required source-accountability law

Every semantic claim admitted by UNDERSTAND must be traceable to exact upstream evidence. Depending on claim type, that includes:

- source artifact id and SHA-256;
- `DocumentIdentityReceipt v1` digest;
- `DocumentParseReceipt v1` digest and semantic/native-inventory digests;
- `DocumentExtractionReceipt v1` digest when extracted spans contribute;
- source/native/CDG/span/page/slide/paragraph/run/region anchors;
- exact interpretation ruleset/implementation identity;
- exact engine/model identity when any non-deterministic or model-assisted path contributes;
- omission/loss/unknown-feature context that materially limits the claim.

No semantic claim may outlive invalidation of one of its authority-bearing inputs.

## 8. EXTRACT-to-UNDERSTAND handoff defect

The recovered stage ordering says EXTRACT precedes UNDERSTAND, but current `understand(...)` ignores the extracted text entirely. Therefore the current stage cannot durably answer:

- which extracted spans support a semantic claim;
- whether omitted or OCR-required content could change the interpretation;
- whether a claim derives from native/CDG evidence versus plain-text projection;
- which extraction strategy/engine/ruleset contributed;
- whether source-anchor coverage is sufficient for the claim;
- whether a richer extraction receipt superseded an earlier fallback.

The new UNDERSTAND contract must bind EXTRACT evidence when EXTRACT contributes, without making EXTRACT mandatory for claims that can be established entirely from PARSE/native evidence.

## 9. Unknown-feature semantic law

Unknown/native-unmodeled content is open-world evidence, not an error to erase.

Rules:

- discovery of an unknown feature must survive into UNDERSTAND standing;
- provisional ids remain deterministic for the exact source/feature identity;
- provisional meaning must not be promoted to certified feature semantics merely because a label or model guess exists;
- unsupported/unknown features relevant to a requested interpretation must lower or qualify standing;
- a later certified semantic adapter creates new evidence; it does not rewrite the historical provisional record;
- targeting an unmodeled feature remains loss-gated by the existing open-world preservation logic.

## 10. Format-specific interpretation boundaries

### DOCX / DOCM

UNDERSTAND may interpret modeled document-local semantics such as paragraph/run hierarchy, styles, sections, tables, drawings/charts, structured metadata, review/protection constructs and source/native relationships only to the extent the exact PARSE/native evidence denominator supports them.

Main-body text extraction alone cannot prove complete document meaning when headers/footers, notes, comments/revisions, fields, drawings, charts, embeds, alternate content, image text or unknown parts remain omitted/unobserved.

### PPTX / PPTM

UNDERSTAND may reason about slide/note structure, text, relationships, visibility/context and modeled presentation elements when source-bound evidence exists. It may not flatten hidden states, animation-triggered content, charts/diagrams, media, embedded objects or image text into an unqualified transcript-derived meaning when those surfaces are outside the admitted denominator.

### PDF

Literal-string fallback cannot support claims that require complete reading order, layout, rendering, image text, optional content, forms or font/encoding semantics. Richer local/native/OCR evidence may be consumed only through its exact admitted receipt/engine identity. PDF semantic interpretation must retain page/region/render provenance where visual evidence matters.

### Text-family formats

Plain text/Markdown/HTML/RTF interpretation must preserve format-specific normalization/omission limits. Sanitized or normalized text is derived evidence, not automatically the full source semantics.

## 11. Lossless requirement / invariant matrix

| # | Requirement / invariant | Current implementation / recovered substrate | Durable state / evidence | Interface / contract | Standing | Gap / blocker |
|---|---|---|---|---|---|---|
| 1 | exact source SHA binds understanding | stage receives source SHA | generic stage receipt | `understand(job, sourceGraph, sourceSha)` | PARTIAL | source binding not sufficient for semantic claim-level provenance |
| 2 | exact PARSE receipt binds understanding | sourceGraph exists before stage | semantic digest recorded | stage ordering | PARTIAL | PARSE receipt identity/version not explicit in UNDERSTAND product |
| 3 | EXTRACT evidence binds claims when used | EXTRACT runs first | separate EXTRACT receipt historically | no handoff | MISSING | current UNDERSTAND ignores extracted text/receipt |
| 4 | semantic claims are durable objects, not free-form evidence strings | evidence strings only | stage receipt | generic stage receipt | MISSING | immutable claim/understanding receipt required |
| 5 | source-observed fact differs from derived/inferred meaning | no taxonomy | none | none | MISSING | authority-class taxonomy required |
| 6 | confidence does not imply authority | vision lane preserves confidence separately | vision result only | vision service | COVERED IN SUBSTRATE | must freeze generic UNDERSTAND law |
| 7 | deterministic derivation binds exact ruleset/implementation | semantic digest exists | code/provenance only | scattered | PARTIAL | ruleset/implementation identity absent from UNDERSTAND receipt |
| 8 | model inference binds exact model/config/adapter identity | local VLM identity exists in vision lane | page perception | VLM port | PARTIAL | not bound to generic UNDERSTAND |
| 9 | model/network inference cannot silently run | local VLM path requires network-free inference | local vision contract | vision service | COVERED IN SUBSTRATE | generic UNDERSTAND must forbid hidden external calls |
| 10 | model may abstain/review rather than fabricate certainty | vision path supports `REVIEW_REQUIRED` | page perception | vision service | COVERED IN SUBSTRATE | generic semantic standing absent |
| 11 | every claim retains source anchors where available | CDG-2/native anchors and EXTRACT source-anchor law exist | upstream receipts | CDG/EXTRACT | PARTIAL | claim-level anchor set absent |
| 12 | omissions/loss can limit interpretation | EXTRACT design carries omission/loss ledger | upstream design receipt | EXTRACT contract | DESIGNED UPSTREAM | UNDERSTAND must consume limitation context |
| 13 | unknown native features remain visible | OpenWorldFeatureDiscovery enumerates them | provisional evidence strings | discovery API | COVERED COARSELY | no semantic-standing impact contract |
| 14 | provisional unknown meaning is not certified meaning | proof requirements exist | provisional capability | discovery API | PARTIAL | no explicit non-promotion law in stage receipt |
| 15 | later semantic support does not erase prior provisional evidence | immutable historical receipts intended | checkpoint history | open-world design | PARTIAL | successor/supersession contract absent |
| 16 | unsupported semantics fail/qualify explicitly | unsupported operations exist elsewhere | exceptions/diagnostics | scattered | PARTIAL | stable UNDERSTAND standing/reason taxonomy absent |
| 17 | ambiguity is represented, not silently resolved | vision can require review | vision result | vision service | PARTIAL | generic ambiguity standing absent |
| 18 | engine disagreement is explicit | EXTRACT design recognizes disagreement | upstream design | EXTRACT contract | DESIGNED UPSTREAM | UNDERSTAND disagreement contract absent |
| 19 | bounds exhaustion is explicit | upstream stages have bounds concepts | upstream diagnostics | scattered | PARTIAL | UNDERSTAND-wide bounds profile absent |
| 20 | exact-input deterministic interpretation is reproducible | semantic digest/open-world IDs deterministic | code behavior | current stage key | PARTIAL | ruleset + upstream receipt set not in reusable identity |
| 21 | cache reuse requires exact semantic identity | checkpoint key uses graph semantic digest + unknown count | checkpoint receipt | generic checkpoint | PARTIAL | count-only unknown material can miss meaning-relevant identity detail |
| 22 | source/native truth cannot be overwritten by interpretation | no mutation in current UNDERSTAND | source remains upstream | stage separation | COVERED STRUCTURALLY | freeze law explicitly |
| 23 | understanding cannot authorize mutation by itself | PLAN follows UNDERSTAND | stage order | spine | COVERED STRUCTURALLY | later policy/effect authority remains separate |
| 24 | Book literary/editorial meaning stays outside generic Documents authority | no generic cross-peer contract | governance only | owner boundary | PARTIAL | freeze service/output fence |
| 25 | Learning learner/curriculum/mastery semantics stay outside Documents | no generic cross-peer contract | governance only | owner boundary | PARTIAL | freeze service/output fence |
| 26 | Programming execution/code semantics stay outside Documents | no generic cross-peer contract | governance only | owner boundary | PARTIAL | freeze service/output fence |
| 27 | Core identity/policy/effect authority stays outside Documents | spine consumes governed infrastructure | governance/upstream | owner boundary | PARTIAL | freeze non-authority law |
| 28 | no raw source/content leakage to telemetry by default | current stage stores digest/provisional refs only | receipt evidence | checkpoint | COVERED CURRENTLY | future claims need privacy-minimized evidence payload |
| 29 | historical PASS does not transfer to reconstructed subject | exact-subject governance applies | governance | qualification | COVERED GOVERNANCE | current source custody still blocked |
| 30 | UNDERSTAND PASS cannot imply human/author/native/external/publication truth | current stage has no such proof | none | none | MISSING EXPLICIT LAW | must be frozen in design |

Result: **30/30 bounded UNDERSTAND invariants accounted; 0 unaccounted rows.** This is forensic accounting, not runtime completion or qualification.

## 12. Central recovered design defects

The recovered UNDERSTAND stage has five material defects under the new build standard:

1. **Stage overstatement:** it records graph digest + unknown-feature inventory, but performs no general semantic-claim construction.
2. **Broken EXTRACT handoff:** extracted text/receipt is not consumed, so text-derived meaning cannot be source-accounted through the stage.
3. **No authority taxonomy:** observed, deterministic-derived, heuristic/model-inferred and provisional-unknown meaning are not distinguishable in durable output.
4. **Insufficient reusable identity:** stage key material uses semantic digest plus unknown-feature count; it does not bind exact interpretation ruleset, engine/model/config or the full relevant upstream receipt set.
5. **No explicit semantic standing:** ambiguity, unsupported meaning, bounds exhaustion, engine disagreement and review-required states have no UNDERSTAND-specific durable taxonomy.

The repair should add a source-accountable interpretation receipt and service boundary, not rewrite useful CDG-2/open-world/vision substrate without cause.

## 13. Required durable product

The design-lock successor should freeze an immutable `DocumentUnderstandingReceipt v1` containing at minimum:

- contract version;
- source artifact id + SHA-256;
- identity receipt digest;
- parse receipt digest + semantic/native-inventory digests;
- extraction receipt digest(s) when extraction contributes;
- interpretation profile/ruleset id + digest;
- interpreter implementation id + digest/version;
- model/engine identities only when actually used;
- semantic standing;
- claim count;
- immutable semantic claim records;
- per-claim authority class;
- per-claim source anchors/evidence refs;
- confidence only where applicable and never as authority class;
- omitted/unsupported/unknown-feature limitations;
- ambiguity/disagreement/review-required diagnostics;
- bounds profile id + digest;
- receipt digest.

Raw source/content should remain outside telemetry/receipt diagnostics by default. Large semantic payloads should be content-addressed artifacts referenced by digest.

## 14. Required semantic standing taxonomy

At minimum:

- `COMPLETE_FOR_DECLARED_SLICE`
- `PARTIAL`
- `PROVISIONAL_UNKNOWN_FEATURES_PRESENT`
- `UNSUPPORTED_INTERPRETATION`
- `AMBIGUOUS`
- `BOUNDS_EXCEEDED`
- `ENGINE_DISAGREEMENT`
- `REVIEW_REQUIRED`
- `FAILED_INTEGRITY`

`COMPLETE_FOR_DECLARED_SLICE` is scoped only to the exact interpretation denominator. It never means complete human understanding of the document.

## 15. Qualification implications

A future isolated denominator must prove, at minimum:

- source/PARSE/EXTRACT receipt mismatch failure;
- deterministic ruleset/implementation invalidation;
- exact-input reproducibility for deterministic claims;
- claim-level source-anchor retention;
- EXTRACT omission/loss limits propagate into semantic standing;
- extraction-free claims can be admitted only when PARSE/native evidence is sufficient;
- text-derived claims cannot ignore the exact extraction receipt;
- high confidence cannot promote inference to source fact;
- model output is model-identified and may abstain/review;
- no network/model/native assist runs silently;
- unknown native features remain provisional and cannot be certified by label alone;
- ambiguity and engine disagreement fail closed into explicit standing;
- bounds exhaustion is explicit;
- stale/replaced upstream receipts invalidate reuse;
- no interpretation overwrites source/native truth;
- UNDERSTAND output alone cannot authorize mutation;
- no cross-peer Book/Learning/Programming/Core semantic authority is created;
- no raw source/content telemetry leakage by default;
- cumulative INTAKE -> IDENTIFY -> SECURE -> FORENSICS -> PARSE -> EXTRACT -> UNDERSTAND evidence boundaries remain intact.

The exact case count must be frozen only after the design-lock test denominator is enumerated case-by-case.

## 16. Current blockers and non-claims

Runtime implementation remains custody-gated with the preceding reconstructed spine. Exact R4 canonical source bytes are still not established in current GitHub-native custody, and no fresh changed-subject baseline qualification has run.

This packet does not claim:

- runtime implementation of `DocumentUnderstandingReceipt v1`;
- current exact-subject PASS;
- complete human-level document understanding;
- correctness of heuristic/model interpretations;
- OCR/native Office/PDF fidelity or accuracy;
- real external-provider authority;
- human/author/SME approval;
- A-01 PASS;
- publication or production readiness.

## 17. Adjudication

Preserve the recovered CDG-2 semantic model, open-world feature discovery, format mastery engines, review semantics and provenance-bearing vision/OCR substrate. Repair UNDERSTAND by adding an immutable source-accountable semantic-claim receipt and strict evidence-vs-inference authority classes, while keeping optional model/native/external assists behind explicit qualified ports.

No recovered substrate justifies making model inference, confidence, plain-text output, or an unknown-feature label canonical document truth.

## Exact next operation

`DOCUMENTS-SPINE-UNDERSTAND-DESIGN-LOCK-001 — FREEZE DOCUMENT UNDERSTANDING RECEIPT V1 + CLAIM AUTHORITY TAXONOMY + PARSE/EXTRACT EVIDENCE BINDING + SOURCE-ANCHOR PROVENANCE + UNKNOWN/AMBIGUITY/MODEL-INFERENCE FENCES + EXPLICIT ISOLATED QUALIFICATION DENOMINATOR, WITHOUT RUNTIME MUTATION.`
