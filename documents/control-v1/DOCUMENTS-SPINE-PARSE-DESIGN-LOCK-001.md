# DOCUMENTS-SPINE-PARSE-DESIGN-LOCK-001

Status: **DESIGN LOCK / SPECIFICATION PASS / RUNTIME BUILD NOT AUTHORIZED UNTIL CURRENT SOURCE CUSTODY**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Capability: `UDM-SPINE-0005` — PARSE  
Parent forensic packet: `DOCUMENTS-SPINE-PARSE-FORENSIC-PREP-001`  
Design-lock base: `documents/control-v1@387844991e8e1cf65e194c3727c0043cf4114d3f`

## 1. Purpose

PARSE converts exact admitted document bytes into a deterministic, loss-aware canonical/native graph while preserving native source authority for every feature that is not fully represented by the admitted semantic projector.

PARSE is read-only. It does not perform extraction, understanding, repair, mutation, rebuild, publication or native-application validation. Successful PARSE means only that the exact declared projector slice completed under this contract; it never means universal semantic mastery or native fidelity.

## 2. Required input contract

PARSE requires:

- exact source artifact id/reference;
- exact `source_sha256`;
- immutable `DocumentIdentityReceipt v1` digest;
- immutable `DocumentForensicsReceipt v1` digest;
- admitted document format/profile;
- projector implementation id + immutable implementation digest;
- projector/ruleset/slice id + digest;
- parse bounds profile id + digest;
- contract version.

A mismatch between source, identity, forensics, projector, ruleset or bounds fails before a reusable PASS receipt is issued.

SECURE evidence is consumed through the bound FORENSICS receipt chain; PARSE does not independently broaden security authority.

## 3. `DocumentParseReceipt v1`

The immutable receipt contains at minimum:

- `contract_version`
- `source_artifact_id`
- `source_sha256`
- `identity_receipt_digest`
- `forensics_receipt_digest`
- `format`
- `profile`
- `projector_implementation_id`
- `projector_implementation_digest`
- `projection_ruleset_id`
- `projection_ruleset_digest`
- `projection_slice_id`
- `bounds_profile_id`
- `bounds_profile_digest`
- `parse_standing`
- `semantic_digest`
- `native_inventory_digest`
- `element_count`
- `asset_count`
- `reference_count`
- `external_reference_count`
- `native_part_count`
- `unknown_native_feature_count`
- `unknown_disposition_counts`
- `source_anchor_coverage`
- `unsupported_or_partial_feature_classes[]`
- `preservation_prerequisites[]`
- `downstream_block_prerequisites[]`
- `diagnostics[]`
- `receipt_digest`

Raw document content is not duplicated into the receipt, logs or telemetry by default.

## 4. Parse standing taxonomy

`parse_standing` is exactly one of:

- `COMPLETE_FOR_DECLARED_SLICE`
- `PARTIAL`
- `UNSUPPORTED_PROJECTOR`
- `MALFORMED`
- `BOUNDS_EXCEEDED`
- `AMBIGUOUS`
- `ENGINE_DISAGREEMENT`
- `FAILED_INTEGRITY`

`COMPLETE_FOR_DECLARED_SLICE` means all contract-listed checks for the exact projector slice completed. It does **not** mean:

- all native features have semantic models;
- all unknown features are understood;
- the artifact can be safely edited;
- native Microsoft Office/PDF-reader fidelity is established;
- extraction/understanding is complete.

Unknown features may coexist with `COMPLETE_FOR_DECLARED_SLICE` only when they are explicitly inventoried, source-bound and assigned an admitted fail-closed disposition.

## 5. Native authority and semantic projection law

For every source artifact:

1. exact native bytes remain authority for unmodeled or partially modeled features;
2. a semantic element must retain an exact native anchor when the format supplies one;
3. a projected semantic digest is not a substitute for the exact source digest;
4. a native-inventory digest is not a substitute for semantic coverage;
5. successful package/XML/object parsing is not semantic mastery;
6. a missing projector is `UNSUPPORTED_PROJECTOR`, not a guessed empty document;
7. a malformed source is `MALFORMED`, not `UNSUPPORTED_PROJECTOR`;
8. bounds exhaustion is `BOUNDS_EXCEEDED`, not a partial silent PASS.

## 6. Open-world preservation law

Every native feature not fully modeled by the admitted slice must be represented by one of:

- an exact `UnknownNativeFeature`-equivalent record with source anchor/digest;
- an exact native-part inventory entry covered by a declared preservation rule;
- a stable unsupported/partial feature class linked to exact source evidence.

Allowed unknown dispositions:

- `PRESERVE_UNMODELED`
- `BLOCK_IF_TARGETED`
- `ESCALATE_FOR_SEMANTIC_ADAPTER`

Unknown never means disposable.

A later mutation that intersects `BLOCK_IF_TARGETED`, an unresolved shared owner, an unanchored feature or an unverifiable preservation dependency must fail before mutation.

## 7. Projector identity and versioning

Every reusable parse claim is bound to exact projector identity:

`source_sha256 + identity_receipt_digest + forensics_receipt_digest + projector_implementation_digest + projection_ruleset_digest + projection_slice_id + bounds_profile_digest + contract_version`

Rules:

- implementation or ruleset change invalidates reuse;
- projection-slice expansion creates a new receipt even when source bytes are unchanged;
- historical semantic digests remain evidence for their exact projector identity only;
- no PASS transfers across projector, ruleset, slice, bounds or contract changes.

## 8. Determinism and durable-state strategy

The admitted default is **deterministic reprojection**.

A durable PARSE checkpoint must persist the full receipt above. The exact source bytes remain in governed artifact custody. On restart, the system may reuse a prior receipt only if the complete receipt key matches current inputs.

If the in-memory CDG-2 graph is needed after restart, it is reprojected from exact source bytes using the exact receipt-bound projector/ruleset/bounds identity. Reprojection must reproduce:

- semantic digest;
- native inventory digest;
- element/asset/reference counts;
- unknown-feature count/dispositions;
- source-anchor coverage standing.

Any mismatch yields `PARSE_REPROJECTION_MISMATCH` and invalidates reuse.

A future content-addressed serialized graph snapshot may be added, but it is cache/evidence material only unless separately admitted. It cannot override exact source bytes or current receipt identity.

## 9. Derived-normalization law

A projector may use a deterministic derived representation to interpret a supported source profile only when:

- original `source_sha256` remains the receipt authority;
- the transform implementation/version is bound through projector/ruleset identity;
- native inventory remains based on original source bytes unless explicitly documented otherwise;
- source anchors remain traceable to original native source;
- the derived representation is never published or substituted as the original source artifact by PARSE.

This rule covers the recovered strict-DOCX-to-transitional semantic projection strategy.

## 10. Per-format admitted standing

### DOCX / DOCM

Admit the recovered deep CDG-2 slice only. It may model package metadata, relationships, styles, numbering, themes, settings, paragraphs/runs, lists, tables, sections, headers/footers, notes, hyperlinks, fields, comments/revisions, charts/diagrams and other explicitly implemented features. Unmodeled OOXML parts/extensions remain unknown/preserved.

### PPTX / PPTM

Admit only the implemented CDG-2 presentation slice. Slide/package reachability does not imply full animation/theme/media/embedded-object/native behavior mastery. Unknown/custom parts remain preserved or blocking as appropriate.

### PDF

Admit only the implemented portable structural/semantic slice. PDF object/page/text reachability does not establish complete rendering, forms/actions, incremental-update, encryption, font, accessibility or native-reader fidelity unless explicitly represented and qualified.

### MARKDOWN / PLAIN_TEXT / HTML / RTF

Admit the implemented text-document slice. HTML/RTF constructs outside that slice remain explicit unsupported/partial semantics and may not be silently treated as lossless normalized text.

### ODT / EPUB / LEGACY_DOC / LEGACY_PPT / ODP / PPSX / POTX

Current standing is `UNSUPPORTED_PROJECTOR` under the recovered implementation. Format recognition alone cannot emit a PARSE PASS.

## 11. FORENSICS -> PARSE contract

PARSE consumes the exact bound `DocumentForensicsReceipt v1` and verifies:

- source digest equality;
- identity chain equality;
- format/profile consistency;
- no forensics finding already classifies the source as unavailable/unreadable beyond the admitted parse contract;
- bounds are compatible with or stricter than current approved limits.

PARSE may refine semantic standing but may not erase or downgrade a FORENSICS corruption, ambiguity, unknown-part, shared-owner or recoverability finding.

## 12. PARSE -> EXTRACT / UNDERSTAND contract

Downstream stages receive:

- exact `DocumentParseReceipt v1` digest;
- source SHA;
- graph semantic digest;
- native inventory digest;
- parse standing;
- unknown/partial feature classes;
- preservation/block prerequisites.

EXTRACT may derive text/content only from admitted parse/native paths and must report its own omissions/losses. UNDERSTAND may add provisional semantic interpretation, but cannot rewrite PARSE standing or native source authority.

## 13. External-reference law

PARSE may identify and classify external relationship/reference targets but does not dereference them. External bytes, network state or provider truth require separate authority and evidence.

The receipt records counts/classes/anchors, not fetched external content.

## 14. Stable error classes

- `PARSE_SOURCE_DIGEST_MISMATCH`
- `PARSE_IDENTITY_RECEIPT_MISMATCH`
- `PARSE_FORENSICS_RECEIPT_MISMATCH`
- `PARSE_FORMAT_PROFILE_MISMATCH`
- `PARSE_UNSUPPORTED_PROJECTOR`
- `PARSE_MALFORMED_PACKAGE`
- `PARSE_REQUIRED_PART_MISSING`
- `PARSE_MALFORMED_NATIVE_STRUCTURE`
- `PARSE_BOUNDS_EXCEEDED`
- `PARSE_PARTIAL_SEMANTIC_COVERAGE`
- `PARSE_UNKNOWN_NATIVE_FEATURES_PRESENT`
- `PARSE_SOURCE_ANCHOR_INCOMPLETE`
- `PARSE_ENGINE_DISAGREEMENT`
- `PARSE_PROJECTOR_VERSION_MISMATCH`
- `PARSE_NATIVE_INVENTORY_MISMATCH`
- `PARSE_GRAPH_VALIDATION_FAILURE`
- `PARSE_REPROJECTION_MISMATCH`
- `PARSE_EXTERNAL_DEREFERENCE_FORBIDDEN`
- `PARSE_EVIDENCE_INCOMPLETE`

Permanent source facts are not transient retry classes.

## 15. Idempotency, cache and invalidation

Receipt identity is content-addressed from the full exact input key defined in section 7.

Rules:

- same exact input identity must produce the same semantic receipt digest;
- a cache hit is advisory until its receipt key and digests are verified;
- source, identity, forensics, projector, ruleset, slice, bounds or contract changes invalidate reuse;
- parser failures are stored as immutable evidence for that attempt/identity but do not become reusable PASS receipts;
- stale read-after-write assumptions are forbidden; persisted receipt/source state is re-read before dependent advancement.

## 16. Isolated qualification denominator — 42 cases

1. exact source digest mismatch fails;
2. stale identity receipt fails;
3. stale forensics receipt fails;
4. format/profile mismatch fails;
5. supported DOCX fixture yields exact source binding;
6. supported PPTX fixture yields exact source binding;
7. supported PDF fixture yields exact source binding;
8. supported text-family fixture yields exact source binding;
9. recognized but unsupported format yields `UNSUPPORTED_PROJECTOR`;
10. unsupported format cannot yield empty-graph PASS;
11. malformed package yields `MALFORMED`/stable failure class;
12. missing required package part yields stable failure class;
13. malformed native XML/structure yields stable failure class;
14. bounds exhaustion yields `BOUNDS_EXCEEDED`;
15. partial semantic coverage cannot yield silent complete standing;
16. same exact inputs reproduce semantic digest;
17. same exact inputs reproduce native-inventory digest;
18. projector implementation change invalidates reuse;
19. ruleset change invalidates reuse;
20. projection-slice change invalidates reuse;
21. bounds-profile change invalidates reuse;
22. every modeled element requiring a native anchor has one;
23. asset ids/digests are source-bound;
24. relationship ids/targets are source-bound;
25. external relationships are classified without dereference;
26. unknown native feature is inventoried;
27. unknown native feature retains exact digest/source anchor;
28. `PRESERVE_UNMODELED` remains preservable and unmodeled;
29. `BLOCK_IF_TARGETED` creates downstream block prerequisite;
30. `ESCALATE_FOR_SEMANTIC_ADAPTER` does not grant edit ownership;
31. strict-DOCX derived projection keeps original source SHA authority;
32. derived normalization cannot replace original artifact bytes;
33. graph validation rejects missing parent/asset/reference integrity;
34. graph validation rejects duplicate element/native-part identities;
35. deterministic restart reprojection reproduces receipt-bound digests;
36. reprojection mismatch invalidates reuse;
37. PARSE PASS does not imply EXTRACT PASS;
38. PARSE PASS does not imply UNDERSTAND/mastery PASS;
39. PARSE PASS does not authorize mutation/rebuild;
40. no raw-content leak into parse receipt/telemetry by default;
41. native/external fidelity remains explicitly unclaimed;
42. cumulative INTAKE -> IDENTIFY -> SECURE -> FORENSICS -> PARSE ownership, source identity and fail-closed behavior remain intact.

## 17. Cumulative regression/calibration gate

Future implementation must run on one exact executable subject, where dependency-valid:

- existing portable intake regressions;
- IDENTIFY denominator;
- SECURE denominator;
- FORENSICS denominator;
- 42 PARSE cases above;
- CDG-2 graph validation/determinism regressions;
- open-world unknown-part preservation regressions;
- relevant DOCX/PPTX/PDF/text projector regressions;
- restart/idempotency/cache invalidation tests;
- parser error taxonomy tests;
- no-external-dereference tests;
- downstream EXTRACT/UNDERSTAND boundary tests.

Historical PASS cannot be transferred. Native/external/A-01 evidence remains separately scoped.

## 18. Non-claims

This design lock does not establish:

- GitHub-native R4 canonical source custody;
- runtime implementation of `DocumentParseReceipt v1`;
- current exact-subject qualification;
- complete DOCX/PPTX/PDF semantic or native fidelity;
- qualified engines for ODT/EPUB/legacy Office/ODP/PPSX/POTX;
- native Microsoft Office or external PDF-engine evidence;
- A-01 PASS;
- publication or production readiness.

## 19. Freeze decision

The recovered CDG-2 model/projector is retained as the implementation substrate. The design defect is not lack of a graph model; it is insufficient reusable stage-level standing/provenance/version/open-world/reprojection authority around that graph.

The design is frozen for later implementation as `DocumentParseReceipt v1` plus the identity/invalidation rules above. Runtime mutation remains blocked until exact R4 GitHub-native source custody and fresh current-subject baseline qualification are established.

## Exact next operations

Runtime successor, **blocked**:

`DOCUMENTS-SPINE-PARSE-IMPLEMENTATION-001 — IMPLEMENT DOCUMENT PARSE RECEIPT V1 + PROJECTOR/RULESET BINDING + 42-CASE ISOLATED QUALIFICATION + CUMULATIVE SPINE REGRESSION, BLOCKED ON EXACT R4 GITHUB-NATIVE SOURCE CUSTODY AND FRESH CURRENT-SUBJECT BASELINE QUALIFICATION.`

Independent work-ahead successor, **ready**:

`DOCUMENTS-SPINE-EXTRACT-FORENSIC-PREP-001 — RECOVER + INVENTORY + ANALYZE UDM-SPINE-0006 EXTRACT SEMANTICS, OMISSION/LOSS ACCOUNTING, SOURCE ANCHORS, OCR/FALLBACK BOUNDARIES AND PARSE-TO-EXTRACT EVIDENCE HANDOFF, WITHOUT RUNTIME MUTATION.`
