# DOCUMENTS-SPINE-UNDERSTAND-DESIGN-LOCK-001

Status: **DESIGN LOCK / SPECIFICATION PASS / RUNTIME BUILD NOT AUTHORIZED UNTIL CURRENT SOURCE CUSTODY**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Capability: `UDM-SPINE-0007` — UNDERSTAND  
Parent forensic packet: `DOCUMENTS-SPINE-UNDERSTAND-FORENSIC-PREP-001`  
Design-lock base: `documents/control-v1@0026fdc88def5bb18c5d7bc376d5a7c933cce520`

## 1. Purpose

UNDERSTAND produces source-accountable document-semantic claims from exact admitted PARSE/EXTRACT/native evidence. It must distinguish what the source proves from what deterministic rules derive, what heuristics/models infer, what remains unknown, and what requires review.

UNDERSTAND is not human comprehension, author intent, Book editorial truth, Learning mastery/curriculum truth, Programming execution semantics, Core policy/effect authority, or publication authority.

The recovered stage currently records only a CDG-2 semantic digest plus provisional unknown-native-feature inventory. This design lock preserves that useful open-world substrate and adds the missing durable semantic-claim authority envelope.

## 2. Targeted research disposition

Targeted provenance research was used only where it materially sharpened this contract. W3C PROV-DM models provenance through entities, activities, agents and derivations; this supports keeping source evidence, interpretation activity and resulting semantic claims distinguishable rather than collapsing them into one assertion. The W3C Web Annotation model also reinforces independently addressable targets/selectors for source anchoring. These standards inform the provenance shape but are not runtime dependencies and do not transfer external conformance claims into System Master.

## 3. Required input contract

An UNDERSTAND request binds:

- exact source artifact id/reference;
- exact `source_sha256`;
- immutable `DocumentIdentityReceipt v1` digest;
- immutable `DocumentParseReceipt v1` digest;
- parse semantic digest;
- native-inventory digest;
- zero or more immutable `DocumentExtractionReceipt v1` digests, only when their evidence contributes;
- interpretation profile id + digest;
- interpretation ruleset id + digest;
- interpreter implementation id + immutable implementation digest/version;
- bounds profile id + digest;
- contract version;
- optional explicitly admitted engine/model descriptors when non-deterministic or model-assisted interpretation is requested.

A claim may be PARSE/native-only when its evidence is fully established without EXTRACT. A claim that uses extracted spans must bind the exact extraction receipt that produced those spans.

Any source, upstream-receipt, ruleset, implementation, model/engine, bounds or contract mismatch fails before a reusable UNDERSTAND receipt is issued.

## 4. `DocumentUnderstandingReceipt v1`

The immutable receipt contains at minimum:

- `contract_version`
- `source_artifact_id`
- `source_sha256`
- `identity_receipt_digest`
- `parse_receipt_digest`
- `parse_semantic_digest`
- `native_inventory_digest`
- `extraction_receipt_digests[]`
- `interpretation_profile_id`
- `interpretation_profile_digest`
- `interpretation_ruleset_id`
- `interpretation_ruleset_digest`
- `interpreter_implementation_id`
- `interpreter_implementation_digest`
- `interpreter_version`
- `bounds_profile_id`
- `bounds_profile_digest`
- `understanding_standing`
- `claim_set_digest`
- `claim_count`
- `semantic_claim_refs[]` or an inline bounded claim set
- `unknown_feature_refs[]`
- `omitted_or_unobserved_feature_classes[]`
- `engine_model_evidence_refs[]`
- `ambiguity_refs[]`
- `diagnostics[]`
- `receipt_digest`

Large claim sets are content-addressed durable artifacts. Raw source content and full extracted text are not duplicated into receipt diagnostics or telemetry by default.

## 5. `DocumentSemanticClaim v1`

Every semantic claim is immutable and contains at minimum:

- `claim_id`
- `claim_type`
- `claim_value_digest` or bounded typed value
- `authority_class`
- `source_anchor_refs[]`
- `evidence_refs[]`
- `derivation_ref` when derived/inferred
- `confidence` only when applicable
- `confidence_method_ref` when confidence is present
- `limitation_refs[]`
- `standing`
- `claim_digest`

Claim ids are content-derived or otherwise deterministic for exact claim identity. A semantic claim must not be addressable only by mutable array position.

## 6. Claim authority taxonomy

`authority_class` is exactly one of:

- `SOURCE_OBSERVED`
- `DETERMINISTIC_DERIVED`
- `HEURISTIC_INFERRED`
- `MODEL_INFERRED`
- `PROVISIONAL_UNKNOWN_FEATURE`

The authority class is not a confidence level. No numeric confidence threshold may convert `HEURISTIC_INFERRED` or `MODEL_INFERRED` into `SOURCE_OBSERVED`.

### `SOURCE_OBSERVED`

Requires source-bound PARSE/native/EXTRACT evidence establishing the claim under the exact declared denominator. The receipt must preserve the denominator and source anchors needed to interpret the scope of observation.

### `DETERMINISTIC_DERIVED`

Requires exact source evidence plus exact deterministic ruleset and implementation identity. Exact inputs must reproduce the same claim value and claim digest.

### `HEURISTIC_INFERRED`

Requires exact heuristic identity/version/configuration, source evidence and explicit uncertainty/limitations. It cannot be reused as source fact by downstream stages.

### `MODEL_INFERRED`

Requires exact model/adapter/version/configuration identity, exact source evidence and explicit inference provenance. Model output cannot become canonical source/native truth and may be rejected or sent to review.

### `PROVISIONAL_UNKNOWN_FEATURE`

Means the existence and identity of an unmodeled native feature are observed, while its semantic support remains unqualified. The label/feature kind is not certification of full meaning.

## 7. Understanding standing taxonomy

`understanding_standing` is exactly one of:

- `COMPLETE_FOR_DECLARED_SLICE`
- `PARTIAL`
- `PROVISIONAL_UNKNOWN_FEATURES_PRESENT`
- `UNSUPPORTED_INTERPRETATION`
- `AMBIGUOUS`
- `BOUNDS_EXCEEDED`
- `ENGINE_DISAGREEMENT`
- `REVIEW_REQUIRED`
- `FAILED_INTEGRITY`

`COMPLETE_FOR_DECLARED_SLICE` refers only to the exact interpretation profile and evidence denominator. It never claims complete human understanding, author intent, subject-matter correctness or external truth.

Claim-level standing may be narrower than receipt standing. Receipt standing cannot be stronger than material claim/evidence limitations permit.

## 8. Source-anchor provenance law

Each claim must retain the finest deterministic source anchor supported by its evidence. Examples include:

- native package part/object/path;
- CDG element id;
- page/slide/paragraph/run/region coordinate;
- relationship/asset id;
- extracted-span id/range;
- render/page/region provenance when visual evidence contributes;
- engine evidence id.

A claim with only coarse anchoring must declare that limitation. Missing fine-grained anchors cannot be represented as complete span-level provenance.

Derivation provenance must keep source entities/evidence, interpretation activity/ruleset/engine and derived claim distinct. A generated claim is never evidence of its own source truth.

## 9. PARSE / EXTRACT evidence law

PARSE/native evidence remains authoritative for modeled source structure and native inventory under its exact denominator. EXTRACT provides bounded projections and must never silently replace PARSE/native authority.

Rules:

- text-derived semantic claims bind the exact `DocumentExtractionReceipt v1`;
- EXTRACT omissions, loss ledger, unsupported classes, OCR/native/external requirements and source-anchor coverage propagate into UNDERSTAND limitations;
- `NO_EXTRACTABLE_TEXT_OBSERVED` cannot become a semantic claim that the visual/native artifact contains no text unless the relevant visual/native surfaces were actually in-denominator;
- a richer later extraction creates a new UNDERSTAND receipt when it changes admissible evidence;
- PARSE/native-only claims need not fabricate an extraction dependency.

## 10. Unknown-feature and open-world law

Recovered `OpenWorldFeatureDiscovery` remains valid substrate.

For each unknown native feature:

- exact source/native identity and native SHA remain evidence;
- deterministic provisional id is preserved;
- required disposition and proof requirements remain explicit;
- the feature contributes a `PROVISIONAL_UNKNOWN_FEATURE` claim or referenced limitation;
- semantic support is not certified by a guessed name, extension, relationship type, heuristic or model;
- targeting an unmodeled feature remains loss-gated by the existing open-world targeting logic;
- later certified support supersedes the semantic standing through new evidence and a new receipt; historical provisional evidence remains immutable.

## 11. Heuristic / model / vision authority fence

Model-assisted interpretation is optional and cannot be hidden inside the baseline deterministic interpreter.

Any model/vision path must expose:

- engine/model id;
- model/engine version or immutable digest;
- adapter/runner identity;
- configuration/prompt-template/ruleset digest when materially relevant;
- source/render/crop/span evidence identity;
- network-required standing;
- diagnostics;
- confidence/calibration method when confidence is emitted;
- abstention/review standing.

A model may select, classify or infer only within the scope admitted by its capability contract. It may abstain. Unsupported output, non-admitted free generation, below-gate confidence or evidence mismatch yields `REVIEW_REQUIRED`, `AMBIGUOUS`, `UNSUPPORTED_INTERPRETATION` or another exact fail-closed standing.

Baseline UNDERSTAND performs no network I/O. Network-required model/provider use requires separate external-effect/provider authority and a new evidence-bearing receipt. No external provider is authorized by this design lock.

## 12. Confidence law

Confidence is metadata about an observation/inference process, not truth authority.

Rules:

- confidence is optional and meaningful only with an exact confidence/calibration method;
- uncalibrated provider scores must be labeled as such;
- confidence cannot change `authority_class`;
- low confidence may force `REVIEW_REQUIRED` or `AMBIGUOUS` under an admitted policy;
- high confidence cannot erase contradictory source evidence, engine disagreement, omitted evidence, unknown native features or bounds exhaustion.

## 13. Ambiguity and disagreement law

If two admitted interpretations materially conflict beyond the declared tolerance:

- preserve both evidence-bearing candidate claims/results;
- emit `ENGINE_DISAGREEMENT` or `AMBIGUOUS`;
- do not silently select one as source truth;
- downstream PLAN receives the explicit standing and may proceed only if its contract allows that standing.

A deterministic tie-break may choose a workflow path but cannot rewrite evidence history or authority class.

## 14. Format-specific interpretation contracts

### DOCX / DOCM

UNDERSTAND may admit document-local semantics for modeled paragraph/run hierarchy, styles, sections, tables, drawings/charts, structured metadata, fields, review/protection constructs and other qualified CDG/native features only when exact source evidence supports them.

Portable main-document text alone is insufficient for complete document-level semantic standing when headers/footers, notes, comments/revisions, field semantics, drawing/shape text, charts/diagrams, embeds, alternate content, image text or unknown parts remain outside the denominator.

### PPTX / PPTM

Slide and note text may contribute to interpretation with exact context/visibility/source anchors. Hidden states, layout/master inheritance, chart/diagram data, media, embeds, image text, comments/review state and animation-triggered visibility cannot be flattened into unqualified meaning unless specifically observed and bound.

### PDF

Literal-string fallback can support only claims justified by that bounded evidence. Claims depending on reading order, layout, rendering, image text, forms, optional content, fonts/encodings or page-region relationships require the corresponding admitted local/native/render/OCR evidence.

### Text-family formats

Normalization and script/style omission are explicit evidence transformations. Derived semantic claims must be scoped to the exact normalized projection when the full source semantics are not represented.

## 15. Cross-system ownership fence

UNDERSTAND owns generic document/artifact semantic interpretation only.

It must not issue canonical claims for:

- Book manuscript canon, Story Bible, literary intent, author decisions, editorial acceptance, publication status;
- Learning learner state, curriculum authority, mastery, assessment validity, adaptation or certification;
- Programming executable/code correctness or runtime behavior;
- Core identity, principal/delegation, policy approval, effect authorization, routing, placement or global security truth;
- Prose work.

Documents may provide source-accountable document evidence to those systems through explicit interfaces. Consumer systems own their specialist interpretation/authority.

## 16. Service interface

The eventual explicit service boundary should have the semantic shape:

`understand(DocumentUnderstandRequest) -> DocumentUnderstandingReceipt`

The request carries only admitted ids/digests/profiles/engine descriptors and bounded interpretation intent. The service resolves content through governed artifact/evidence interfaces rather than trusting caller-supplied semantic truth.

The service must:

- re-read and verify upstream receipts before interpretation;
- reject digest/profile/version mismatches;
- never trust mutable chat/webhook/file-name metadata as semantic authority;
- avoid hidden external/native/model invocation;
- preserve stable reason classes;
- make retry semantics explicit and idempotent for deterministic work.

## 17. Persistence, idempotency and invalidation

Deterministic receipt identity is based on:

`source_sha256 + identity_receipt_digest + parse_receipt_digest + sorted(extraction_receipt_digests) + interpretation_profile_digest + interpretation_ruleset_digest + interpreter_implementation_digest + bounds_profile_digest + admitted_engine_model_identity_set + contract_version`

Rules:

- same exact deterministic inputs reproduce the same deterministic claim-set digest and receipt digest;
- source/upstream receipt/ruleset/implementation/bounds/model/config/contract changes create a new receipt;
- caches are advisory until exact identity and payload digest are verified;
- stale read-after-write assumptions are forbidden;
- prior receipts remain immutable evidence when richer evidence becomes available;
- non-deterministic/model-assisted outputs require their exact evidence identity and may not masquerade as deterministic replay.

## 18. Stable reason/error classes

- `UNDERSTAND_SOURCE_DIGEST_MISMATCH`
- `UNDERSTAND_IDENTITY_RECEIPT_MISMATCH`
- `UNDERSTAND_PARSE_RECEIPT_MISMATCH`
- `UNDERSTAND_EXTRACTION_RECEIPT_MISMATCH`
- `UNDERSTAND_UPSTREAM_STANDING_INCOMPATIBLE`
- `UNDERSTAND_RULESET_VERSION_MISMATCH`
- `UNDERSTAND_IMPLEMENTATION_VERSION_MISMATCH`
- `UNDERSTAND_BOUNDS_EXCEEDED`
- `UNDERSTAND_UNSUPPORTED_INTERPRETATION`
- `UNDERSTAND_PROVISIONAL_UNKNOWN_FEATURE`
- `UNDERSTAND_SOURCE_ANCHOR_INCOMPLETE`
- `UNDERSTAND_AMBIGUOUS`
- `UNDERSTAND_ENGINE_DISAGREEMENT`
- `UNDERSTAND_MODEL_UNAVAILABLE`
- `UNDERSTAND_MODEL_UNQUALIFIED`
- `UNDERSTAND_MODEL_NETWORK_AUTHORITY_REQUIRED`
- `UNDERSTAND_MODEL_ABSTAINED`
- `UNDERSTAND_CONFIDENCE_BELOW_GATE`
- `UNDERSTAND_NON_ADMITTED_MODEL_OUTPUT`
- `UNDERSTAND_REVIEW_REQUIRED`
- `UNDERSTAND_REPROJECTION_MISMATCH`
- `UNDERSTAND_EXTERNAL_DEREFERENCE_FORBIDDEN`
- `UNDERSTAND_ACTIVE_EXECUTION_FORBIDDEN`
- `UNDERSTAND_CROSS_OWNER_SEMANTIC_AUTHORITY_FORBIDDEN`
- `UNDERSTAND_EVIDENCE_INCOMPLETE`

Permanent semantic/evidence facts are not transient retry classes.

## 19. Isolated qualification denominator — 48 cases

1. source digest mismatch fails;
2. stale identity receipt fails;
3. stale PARSE receipt fails;
4. stale bound EXTRACT receipt fails;
5. PARSE-only claim succeeds without fabricated EXTRACT dependency when sufficient;
6. text-derived claim must bind its exact EXTRACT receipt;
7. interpretation profile change invalidates reuse;
8. ruleset change invalidates reuse;
9. interpreter implementation change invalidates reuse;
10. bounds profile change invalidates reuse;
11. exact deterministic inputs reproduce claim-set digest;
12. exact deterministic inputs reproduce receipt digest;
13. source-observed claim remains `SOURCE_OBSERVED` only with admitted source evidence;
14. deterministic derivation binds exact ruleset/implementation;
15. heuristic inference cannot become source fact;
16. model inference cannot become source fact regardless of confidence;
17. confidence is absent or method-bound when present;
18. high confidence cannot erase a material limitation;
19. low-confidence admitted inference can become `REVIEW_REQUIRED`;
20. claim-level source anchors survive into durable claim evidence;
21. coarse-only source anchors are labeled incomplete/coarse;
22. EXTRACT omission/loss ledger limits semantic standing when material;
23. `NO_EXTRACTABLE_TEXT_OBSERVED` cannot prove visual/native no-text outside denominator;
24. richer extraction evidence produces a new understanding identity when claims change;
25. unknown native feature produces provisional evidence, not certified semantics;
26. deterministic provisional id is stable for exact feature identity;
27. later certified support does not erase prior provisional evidence;
28. targeting unmodeled native feature remains loss-gated;
29. ambiguity produces explicit `AMBIGUOUS` standing;
30. material engine disagreement produces explicit `ENGINE_DISAGREEMENT`;
31. bounds exhaustion produces `BOUNDS_EXCEEDED`;
32. unsupported interpretation differs from ambiguity and bounds exhaustion;
33. local model path exposes exact model/adapter/config identity;
34. unqualified/unhealthy model cannot contribute accepted model claim;
35. network-required model/provider cannot run without separate authority;
36. model abstention produces explicit review/unsupported standing;
37. non-admitted model free generation cannot be promoted into a claim;
38. vision/OCR-derived claim retains source/render/region provenance;
39. OCR/model confidence remains observational/inference evidence;
40. DOCX omitted non-main content prevents overclaiming complete document semantics when material;
41. PPTX hidden/alternate/visual surfaces are not flattened into unqualified meaning;
42. PDF literal fallback cannot support layout/visual semantics it did not observe;
43. no external relationship is dereferenced to infer meaning;
44. no macro/script/ActiveX/OLE or embedded package is executed for understanding;
45. no raw source/full extracted content leaks to telemetry by default;
46. UNDERSTAND receipt cannot authorize mutation or consequential effect by itself;
47. Book/Learning/Programming/Core specialist authority cannot be emitted by generic Documents UNDERSTAND;
48. cumulative INTAKE -> IDENTIFY -> SECURE -> FORENSICS -> PARSE -> EXTRACT -> UNDERSTAND source identity, preservation, evidence, fail-closed and ownership boundaries remain intact.

## 20. Cumulative regression/calibration gate

Future implementation must run on one exact executable subject, where dependency-valid:

- prior INTAKE/IDENTIFY/SECURE/FORENSICS/PARSE/EXTRACT denominators;
- the 48 UNDERSTAND cases above;
- deterministic CDG/source-anchor/provisional-feature regressions;
- format-specific DOCX/PPTX/PDF/text-family semantic-scope regressions;
- OCR/vision/model provenance and abstention fences;
- omission/loss propagation tests;
- persistence/idempotency/cache invalidation tests;
- UNDERSTAND -> PLAN authority-nonpromotion tests;
- owner-boundary negative tests.

Historical PASS cannot be transferred to changed bytes. Native/external/A-01 evidence remains separately scoped.

## 21. Non-claims

This design lock does not establish:

- GitHub-native R4 source custody;
- runtime implementation of `DocumentUnderstandingReceipt v1`;
- current exact-subject qualification;
- complete document semantics for DOCX/PPTX/PDF;
- human/author/SME intent or approval;
- correctness or calibration of any unexecuted heuristic/model path;
- OCR accuracy;
- native Microsoft Office/PDF-reader fidelity;
- external provider authority;
- Book/Learning/Programming/Core specialist semantic authority;
- A-01 PASS;
- publication or production readiness.

## 22. Freeze decision

The recovered CDG-2 model, open-world discovery, format mastery, review and provenance-bearing vision/OCR substrate are retained. The missing layer is an immutable source-accountable semantic-claim receipt with explicit evidence-vs-inference authority and fail-closed unknown/ambiguity/model boundaries.

Runtime build remains blocked until exact R4 GitHub-native source custody and fresh current-subject baseline qualification are established.

## Exact next operations

Runtime successor, **blocked**:

`DOCUMENTS-SPINE-UNDERSTAND-IMPLEMENTATION-001 — IMPLEMENT DOCUMENT UNDERSTANDING RECEIPT V1 + SEMANTIC CLAIM AUTHORITY + SOURCE-ANCHOR PROVENANCE + PARSE/EXTRACT BINDING + UNKNOWN/MODEL/AMBIGUITY FENCES + 48-CASE ISOLATED QUALIFICATION + CUMULATIVE SPINE REGRESSION, BLOCKED ON EXACT R4 GITHUB-NATIVE SOURCE CUSTODY AND FRESH CURRENT-SUBJECT BASELINE QUALIFICATION.`

Independent work-ahead successor, **ready**:

`DOCUMENTS-SPINE-PLAN-FORENSIC-PREP-001 — RECOVER + INVENTORY + ANALYZE UDM-SPINE-0008 PLAN, INCLUDING INTENT/OPERATION BINDING, TARGET SELECTION, CAPABILITY/OWNER FENCES, LOSS-AWARE PRECONDITIONS AND UNDERSTAND-TO-PLAN AUTHORITY HANDOFF, WITHOUT RUNTIME MUTATION.`
