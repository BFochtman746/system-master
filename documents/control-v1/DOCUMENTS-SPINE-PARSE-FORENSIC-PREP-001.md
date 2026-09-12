# DOCUMENTS-SPINE-PARSE-FORENSIC-PREP-001

Status: **FORENSIC RECOVERY / LOSSLESS CAPABILITY MATRIX COMPLETE / NO RUNTIME MUTATION**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Capability: `UDM-SPINE-0005` — PARSE  
Live-base revalidated before mutation: `documents/control-v1@3d3de02bb9a3b79b70e2cae35c7cbbea55825b23`  
Parent design lock: `DOCUMENTS-SPINE-FORENSICS-DESIGN-LOCK-001`  
Historical recovered source inspected: `documents/r4-current-capability-ledger-admission-007@dbea54620c6d3b6479f64d981b6ff3c8b4cdf01f`

## 1. Scope and authority

This packet recovers and analyzes the current/historical PARSE implementation without changing recovered runtime bytes. It separates four facts that prior code can otherwise blur together:

1. native package/object reachability;
2. successful construction of a CDG-2 graph;
3. semantic coverage of a particular native feature;
4. safe edit/rebuild authority for that feature.

A PASS at an earlier layer never promotes a later layer. Unknown native content remains source-authoritative and preservable; it is not disposable and is not silently granted semantic mastery.

Documents remains inside document/artifact semantics. This packet takes no Book, Learning, Programming, spreadsheet or retired-Prose ownership and grants no A-01, native-application, external, publication or production authority.

## 2. Recovered implementation path

The recovered execution path is:

`UniversalDocumentSpine.executeExisting -> PARSE -> DocumentProcessingService.projectCanonicalGraphV2 -> CanonicalDocumentGraphV2Projector -> CanonicalDocumentGraphV2`

Current recovered PARSE behavior:

- calls the CDG-2 projector for the detected format;
- requires the resulting graph `sourceSha256` to equal the exact source digest;
- keys the stage checkpoint with the graph semantic digest;
- records schema version, semantic digest, element count and native-part count;
- returns the in-memory graph to EXTRACT/UNDERSTAND/PLAN;
- treats PARSE as non-effectful.

The stage checkpoint store is durable, but the full graph is not independently persisted as a canonical PARSE artifact by this path. Restart therefore depends on exact source-byte custody plus deterministic reprojection unless a later contract explicitly persists a graph snapshot.

## 3. Recovered CDG-2 contract

`CanonicalDocumentGraphV2` already provides strong loss-aware primitives:

- exact `sourceSha256` binding;
- semantic `elements[]` with stable native anchors;
- `assets[]` with exact digests and native part identity;
- internal/external `references[]`;
- `unknownNativeFeatures[]`;
- exact native-part inventory with per-part digests;
- provenance metadata;
- deterministic `semanticDigest()`;
- deterministic `nativeInventoryDigest()`;
- explicit unknown dispositions: `PRESERVE_UNMODELED`, `BLOCK_IF_TARGETED`, `ESCALATE_FOR_SEMANTIC_ADAPTER`.

The model states the key authority rule correctly: native bytes remain authoritative for features that are not yet represented semantically.

## 4. Recovered projector coverage

The recovered `CanonicalDocumentGraphV2Projector` is explicitly a first deep projector slice, not universal semantic mastery.

### Supported portable projection families

The projector currently admits:

- DOCX / DOCM;
- PPTX / PPTM;
- PDF;
- MARKDOWN / PLAIN_TEXT / HTML / RTF.

### Recognized but not CDG-2-projectable by this implementation

`DocumentProcessingService` recognizes additional formats whose qualified engines remain pending, including:

- ODT;
- EPUB;
- legacy DOC;
- legacy PPT;
- ODP;
- PPSX;
- POTX.

These must remain `UNSUPPORTED_PROJECTOR` or equivalent under the current implementation. Recognition is not parse support.

### DOCX evidence

The recovered DOCX projector demonstrates meaningful semantic depth: package relationships, content types, metadata, assets, styles, numbering, themes, settings, paragraphs/runs, tables, sections, headers/footers, footnotes/endnotes, charts, SmartArt, structured metadata, markup compatibility, conformance profile, hyperlinks, fields, comments/revisions and source anchors. It also inventories unmodeled native parts as unknown features.

Strict DOCX may be converted to a derived transitional representation for semantic projection, but the graph remains bound to the original source SHA and native source authority. Derived normalization therefore cannot replace or rewrite source authority.

## 5. Lossless requirement / invariant matrix

| # | Requirement / invariant | Current implementation | Durable state / evidence | Interface / contract | Current standing | Blocker / gap |
|---|---|---|---|---|---|---|
| 1 | Exact source identity binds every parse | graph source SHA checked against input SHA | source bytes + PARSE stage receipt | `projectCanonicalGraphV2` / `parse` | COVERED | none portable |
| 2 | PARSE is read-only | stage is non-effectful; projector reads bytes | stage receipt | spine stage order | COVERED | none |
| 3 | Format recognition != projector support | detector/service recognizes more formats than projector | diagnostics only | format + projector dispatch | PARTIAL | no reusable parse standing receipt |
| 4 | Native reachability != semantic mastery | CDG-2 keeps native inventory + unknown features | graph in memory | CDG-2 | COVERED IN MODEL | stage PASS does not report coverage class |
| 5 | Unknown native content is preserved conceptually | unknown feature dispositions exist | graph in memory | CDG-2 unknown features | COVERED IN MODEL | receipt does not expose unknown count/dispositions |
| 6 | Unknown targeted content must fail closed later | `BLOCK_IF_TARGETED` disposition exists | graph in memory | CDG-2 / mutation adapter | PARTIAL | PARSE receipt does not surface downstream block prerequisite |
| 7 | Semantic projection is deterministic | semantic canonical text + digest | PARSE receipt stores semantic digest | `semanticDigest()` | COVERED | projector/ruleset digest not bound |
| 8 | Native inventory is deterministic | native inventory digest implemented | graph in memory | `nativeInventoryDigest()` | COVERED IN MODEL | digest absent from PARSE stage receipt |
| 9 | Every modeled semantic object retains source anchor | `NativeAnchor` on elements | graph in memory | CDG-2 element contract | COVERED IN MODEL | no stage-level coverage assertion |
| 10 | Assets remain source-bound | asset native part, SHA, length | graph in memory | CDG-2 asset contract | COVERED IN MODEL | stage receipt does not summarize asset standing |
| 11 | References distinguish internal/external | explicit reference model | graph in memory | CDG-2 reference contract | COVERED IN MODEL | external dereference policy not represented in parse receipt |
| 12 | Original bytes remain authority for unmodeled semantics | explicit CDG-2 law | source artifact custody | CDG-2 | COVERED IN MODEL | depends on source custody |
| 13 | Derived normalization cannot replace source identity | DOCX strict conversion keeps original source SHA | graph provenance | DOCX projector | COVERED IN MODEL | derived transform identity not separately receipt-bound |
| 14 | Projector implementation/version must bind claims | provenance names projector and slice | graph provenance | projector | PARTIAL | executable digest/version not in stage key/receipt |
| 15 | Projection slice must be explicit | DOCX provenance exposes `projectionSlice` | graph provenance | projector | PARTIAL | not uniformly surfaced in PARSE stage receipt |
| 16 | Unsupported format is distinct from malformed input | projector throws unsupported; parsing may throw IO/structure errors | exception only | projector | PARTIAL | stable reason taxonomy absent |
| 17 | Malformed package is fail-closed | required DOCX part / XML errors fail | exception only | projector | PARTIAL | no immutable parse-failure receipt taxonomy |
| 18 | Partial parse must never become complete parse PASS | no first-class partial standing | none | none | MISSING | explicit `PARTIAL` standing needed |
| 19 | Bounds-limited parse must remain explicit | no PARSE-specific bounds receipt found | none | none | MISSING | bounded parsing contract needed |
| 20 | Parser/projector disagreement must remain visible | no multi-engine disagreement contract in PARSE | none | none | MISSING | explicit disagreement class needed when multiple engines used |
| 21 | Semantic graph validation is fail-closed | CDG-2 validates roots/ids/refs/assets/native parts | graph constructor | CDG-2 | COVERED | no stage-level validation receipt detail |
| 22 | Restart cannot trust stale graph state | stage key binds source + semantic digest | checkpoint receipt | spine checkpoint contract | PARTIAL | full graph not persisted; projector version not key-bound |
| 23 | Exact source bytes must remain available for deterministic reprojection | current path reprojects from source | governed artifact store | artifact gateway | COVERED IF CUSTODY EXISTS | R4 canonical current-source custody remains blocked |
| 24 | PARSE -> EXTRACT must not imply extraction completeness | separate stage exists | separate stage receipt | spine ordering | COVERED STRUCTURALLY | no parse coverage object handed to EXTRACT |
| 25 | PARSE -> UNDERSTAND must preserve open-world unknowns | UNDERSTAND discovers provisional unknown-native features | stage receipt | open-world discovery | PARTIAL | unknown parse standing not carried as immutable contract |
| 26 | PARSE cannot grant edit authority | mutation happens later through governed coordinator | separate stages | spine/mutation coordinator | COVERED | none |
| 27 | Per-format semantic coverage must be inspectable | deep format-specific projector code exists | code only | projector | PARTIAL | no machine-readable coverage manifest |
| 28 | Historical PASS cannot transfer to reconstructed current subject | current authority requires fresh exact-subject evidence | governance | qualification policy | COVERED GOVERNANCE | current R4 custody/qualification unresolved |
| 29 | PARSE diagnostics must not leak raw document content by default | current stage evidence is aggregate only | stage receipt | checkpoint record | COVERED CURRENTLY | future receipt must preserve this rule |
| 30 | Same exact source + projector contract yields same semantic receipt | semantic digest deterministic | current checkpoint | current stage key | PARTIAL | no immutable content-addressed PARSE receipt contract yet |

Result: **30/30 bounded PARSE invariants accounted; 0 unaccounted rows.** This is an accounting result, not a runtime-completion claim.

## 6. Main design defects / missing authority surfaces

The recovered code is materially useful, but current `PARSE` stage PASS is too coarse for the new build standard. A successful projector call plus source-digest match currently allows a PASS receipt that omits several facts needed to distinguish reachability from semantic completeness.

The next design must explicitly bind at least:

- projector implementation id and immutable digest/version;
- projection ruleset/slice id;
- source SHA-256;
- format/profile;
- parse standing (`COMPLETE_FOR_DECLARED_SLICE | PARTIAL | UNSUPPORTED | MALFORMED | BOUNDS_EXCEEDED | AMBIGUOUS | ENGINE_DISAGREEMENT`);
- semantic digest;
- native inventory digest;
- element/asset/reference counts;
- unknown-native feature count and dispositions;
- source-anchor coverage standing;
- external-reference presence without dereference;
- diagnostics/reason classes;
- explicit downstream preservation/block prerequisites.

A `COMPLETE_FOR_DECLARED_SLICE` standing must mean only that the admitted projector slice completed its declared denominator. It must never mean full native application fidelity or universal semantic mastery.

## 7. Durable-state finding

The recovered durable checkpoint proves that a PARSE stage ran for an exact idempotency key, but the full CDG-2 graph is returned in memory rather than admitted as a standalone canonical durable graph object by this path.

That is acceptable only if the contract freezes one of two strategies:

1. **deterministic reprojection** — exact source bytes plus exact projector/ruleset identity are durable and sufficient to reproduce the graph; or
2. **content-addressed graph snapshot** — persist a canonical serialized CDG-2 snapshot bound to source + projector + ruleset digests.

The current code is closest to strategy 1 but is incomplete because projector/ruleset identity is not fully bound into the PARSE checkpoint identity.

## 8. Per-format forensic standing

### DOCX / DOCM

Deep semantic projection exists for a substantial but finite native surface. Unknown/unmodeled parts are preserved as unknown features. Standing: `PARTIAL_BUT_DEEP_PROJECTOR`; no universal DOCX semantic mastery claim.

### PPTX / PPTM

A dedicated projector path exists and native package/open-world machinery is present. Standing: `PARTIAL_PROJECTOR`; complete presentation fidelity requires its own denominator and native evidence.

### PDF

A portable structural projector path exists. Standing: `PARTIAL_PROJECTOR`; parser reachability and literal/structural extraction cannot be promoted to complete PDF semantic or native-reader fidelity.

### MARKDOWN / PLAIN_TEXT / HTML / RTF

Portable text-family projection exists. Standing: `SUPPORTED_DECLARED_SLICE`; HTML/RTF source semantics beyond the implemented text/document model must remain explicit losses/unknowns rather than silently normalized to mastery.

### ODT / EPUB / LEGACY_DOC / LEGACY_PPT / ODP / PPSX / POTX

Recognized by Documents but no admitted CDG-2 projector in the recovered implementation. Standing: `UNSUPPORTED_PROJECTOR` until a qualified engine is admitted.

## 9. Required error / reason taxonomy for design lock

At minimum:

- `PARSE_SOURCE_DIGEST_MISMATCH`
- `PARSE_IDENTITY_RECEIPT_MISMATCH`
- `PARSE_FORENSICS_RECEIPT_MISMATCH`
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

Permanent document facts are not transient retry classes.

## 10. Qualification implications

The future isolated denominator must prove, without runtime mutation:

- exact source binding and digest mismatch failure;
- deterministic semantic and native-inventory digests;
- modeled elements retain exact source anchors;
- assets/references remain source-bound;
- unknown content is represented/preserved and never promoted to semantic mastery;
- unknown targeted content yields a later mutation prerequisite/block;
- unsupported formats are not mislabeled malformed;
- malformed inputs are not mislabeled unsupported;
- partial/bounds-limited parses cannot produce complete standing;
- projector version/ruleset changes invalidate receipt reuse;
- strict-DOCX derived projection cannot replace original source authority;
- restart/reprojection is deterministic for exact source/projector/ruleset identity;
- no external dereference during parse;
- no raw-content telemetry leakage by default;
- cumulative INTAKE -> IDENTIFY -> SECURE -> FORENSICS -> PARSE boundaries remain intact.

## 11. Current blockers and non-claims

Runtime implementation of a stronger PARSE receipt remains **custody-gated** with IDENTIFY/SECURE/FORENSICS runtime work. Current exact R4 canonical source bytes are not yet established in GitHub-native custody and fresh current-subject qualification has not run.

This packet does not claim:

- runtime implementation of a new PARSE receipt;
- exact-current-subject PARSE qualification;
- complete DOCX/PPTX/PDF semantic mastery;
- native Microsoft Office or native PDF-reader fidelity;
- external engine authority;
- A-01 PASS;
- publication or production readiness.

## 12. Adjudication

The recovered CDG-2 model and projector are worth preserving and adapting; rewrite is not justified. The correct repair is **contract hardening around standing, provenance, version binding, open-world coverage and durable/reproducible receipt identity**, followed later by bounded implementation on the exact admitted source.

## Exact next operation

`DOCUMENTS-SPINE-PARSE-DESIGN-LOCK-001 — FREEZE IMMUTABLE DOCUMENT PARSE RECEIPT + PROJECTOR/RULESET IDENTITY + PER-FORMAT COVERAGE STANDING + OPEN-WORLD PRESERVATION + REPROJECTION/PERSISTENCE CONTRACT + ISOLATED QUALIFICATION DENOMINATOR, WITHOUT RUNTIME MUTATION.`
