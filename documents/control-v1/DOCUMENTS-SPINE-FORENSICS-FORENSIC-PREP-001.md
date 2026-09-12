# DOCUMENTS-SPINE-FORENSICS-FORENSIC-PREP-001

Status: **FORENSIC RECOVERY + INVENTORY + ANALYSIS COMPLETE / DESIGN-LOCK SUCCESSOR READY / RUNTIME MUTATION STILL SOURCE-CUSTODY GATED**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Capability: `UDM-SPINE-0004` — FORENSICS  
Parent checkpoint: `DOCUMENTS-SPINE-SECURE-DESIGN-LOCK-001`  
Forensic base: `documents/control-v1@3938e225ecf53478c09ac858ea38ad1027f372eb`

## 1. Method and boundary

This unit executes:

`RECOVER -> INVENTORY -> ANALYZE -> ADJUDICATE -> DESIGN-LOCK successor`

No runtime BUILD is authorized because the exact R4 source remains outside GitHub-native custody. Historical and Library-recovered implementation/evidence is used only to reconstruct current design truth; no historical PASS is transferred.

FORENSICS is a Documents-owned read/inventory stage. It identifies native package structure, corruption signals, unknown/custom parts, assets, relationships and recoverability evidence. It does **not** silently repair the source, mutate unknown content, grant artifact/security authority, or claim that a damaged artifact is recoverable merely because some bytes can be parsed.

## 2. Recovered current standing

The recovered capability ledger records `UDM-SPINE-0004` as `PARTIAL_VERIFIED / OPEN_PARTIAL`.

Recovered implementation/evidence references include:

- `UniversalDocumentSpine` FORENSICS stage;
- `DocumentProcessingService.inspect`;
- CDG-2/native package inventory surfaces;
- historical exact-subject portable spine receipt under `13_DOCUMENT_SPINE_002A/evidence/qualification/portable/receipts/DOCUMENT-SPINE-002A-PORTABLE.json`;
- later `DOCUMENT-WORLD-CLASS-001C` evidence.

Demonstrated standing: current native/current-feature inventory exists.  
Open standing: exhaustive corruption, assets, relationships, unknown/custom parts and recoverability are not closed across supported formats.

The immediately downstream `PARSE`, `EXTRACT` and `UNDERSTAND` stages are also partial. Therefore FORENSICS must not collapse into CDG-2 semantic mastery or treat low-level package reachability as complete understanding.

## 3. Controlling forensic invariants

The recovered corpus and permanent defect memory imply these invariants:

1. Exact source bytes and source digest are immutable inputs to a forensic result.
2. FORENSICS consumes frozen IDENTIFY and SECURE receipts; it does not re-decide their truth without explicit invalidation.
3. Native/package inventory is distinct from semantic extraction/mastery.
4. Unknown/custom native parts are inventoried and preserved by the generic Documents path when safe; semantic create/edit ownership remains extension-specific unless explicitly delegated.
5. Missing semantic ownership does not permit deletion or normalization of an unknown part.
6. Corruption is evidence-scoped. A parser warning, malformed relationship, missing part, inconsistent content type, orphan part, broken reference or failed native reopen is recorded explicitly rather than converted to a generic `CORRUPT` boolean.
7. Recoverability is not repair. A recoverability assessment states what can be preserved/reconstructed and what would be lost; any actual repair requires a separate immutable operation plan, authorization and loss ledger.
8. Unknown native features that intersect a requested mutation target must fail closed before mutation.
9. Shared native parts cannot be assumed to have a single semantic owner. Owner-scoped mutation requires copy-on-write/detachment where aliases exist.
10. Successful package round-trip alone does not prove semantic preservation of unknown/rich content.
11. A stage PASS receipt may describe only that stage and its prerequisites; it cannot absorb not-yet-run downstream proof or repair claims.
12. Native/external oracle absence is recorded as an evidence limit, not inferred PASS or FAIL.

## 4. Recovered open-world / unknown-part evidence

Recovered DOCX residuals explicitly classify unknown/custom OOXML behavior as partial low-level inventory/preservation:

- reading/inventory of unknown/custom OOXML parts exists at low-level/partial standing;
- generic engine ownership is safe inventory/preservation only;
- semantic ownership is extension-specific;
- preserve/round-trip is the allowed generic behavior;
- CREATE/EDIT requires an explicit extension owner;
- open-world policy closure remains an unpromoted residual.

This is the correct FORENSICS boundary: unknown content is observable and preservable without pretending the generic spine semantically understands it.

A prior critical open-world defect also proved that package-part targeting cannot rely only on CDG semantic anchors. Native-part selectors and expected changed-part patterns must participate in unknown-feature intersection checks before later mutation.

## 5. Corruption and recoverability census

### DOCX / DOCM

Recovered standing includes:

- native/container structure inventory and embedded-content extraction as partial current lane capabilities;
- unknown/custom OOXML preserve-or-block behavior declared portable but requiring depth audit/current requalification;
- interrupted edit/save recovery declared portable but requiring depth audit;
- damaged-DOCX reconstruction from recoverable native parts is explicitly `PARTIAL`, with OOXML package repair primitives and a required explicit loss ledger;
- generic recovery/diff/merge materialization remains a future repair packet rather than complete FORENSICS truth.

Permanent defect lessons relevant to FORENSICS:

- rich/open-world content must not be rebuilt wholesale just because a simpler semantic model can represent a subset;
- shared native parts require owner-aware alias detection before any later mutation;
- datastore/shared native identity changes must fail closed unless all owners are rebound through an explicit operation.

FORENSICS therefore needs source-bound facts for package entries, content types, relationships, aliases, unknown extensions, orphan/missing relationships, shared ownership indicators and recoverability/loss classes.

### PPTX / PPTM

Recovered capability declarations include:

- presentation/package inspection;
- shapes, masters/layouts, sections, comments/authors, metadata, media, charts and relationship inventory;
- external relationship inventory;
- unknown/custom XML preservation;
- package content-type and relationship repair primitives;
- package diff and deterministic round-trip verification;
- compatibility diagnosis and troubleshooting for corrupted/malformed presentations.

These declarations are `PORTABLE_IMPLEMENTED` but explicitly require atomic depth audit/current-subject requalification. FORENSICS may treat them as recovered implementation candidates, not current qualified completeness.

Native PowerPoint interpretation/render/playback remains a separate external/native oracle boundary.

### PDF

The recovered PDF program includes large parser/renderer/malicious-corpus qualification plans, but the current evidence reviewed in this unit does not prove a complete reusable PDF corruption/recoverability authority.

Therefore PDF FORENSICS must distinguish at minimum:

- source byte identity;
- parser structural findings;
- xref/object/page-tree/stream/embedded-file/annotation/action relationship findings when supported by the admitted parser;
- malformed or unsupported constructs;
- recoverability evidence supplied by a qualified parser/repair engine;
- engine disagreement/uncertainty;
- any proposed repair losses.

Where current source/engine depth is not proven, standing is `UNKNOWN/PARTIAL`, not `RECOVERABLE`.

### Other recognized formats

Text/HTML/RTF/ODF/EPUB/legacy families remain subject to exact implementation depth. Recognition alone cannot produce exhaustive native-forensics standing. Missing format-specific evidence remains explicit.

## 6. Assets and relationships

FORENSICS inventories document-owned structural relationships without dereferencing external effects.

For package-based formats, the inventory should preserve at least:

- native part/object identity;
- content type / media type where deterministically known;
- byte digest/size where available;
- internal/external relationship type and source/target identity;
- alias/share count where multiple semantic owners reference one physical part;
- embedded asset class;
- unknown/custom extension classification;
- parser/inspection diagnostics;
- source anchor suitable for later CDG projection;
- preservation standing.

Assets include images, audio/video, embedded packages, charts/data, fonts or other contract-listed native resources. Inventory does not grant semantic edit ownership.

## 7. Recoverability taxonomy

The design-lock successor should freeze a recoverability taxonomy no stronger than the evidence permits:

- `INTACT_OBSERVED` — required structural checks for this profile completed without a material integrity finding;
- `DEGRADED_READABLE` — source is partially readable but one or more structural/semantic deficits are known;
- `RECOVERABLE_WITHOUT_DECLARED_LOSS` — only when a deterministic repair path can prove preservation for the contract-listed scope;
- `RECOVERABLE_WITH_DECLARED_LOSS` — a deterministic repair candidate exists but requires an explicit predeclared loss ledger;
- `RECOVERY_ENGINE_REQUIRED` — assessment depends on a separately qualified repair engine/oracle;
- `UNKNOWN_RECOVERABILITY` — evidence is insufficient, ambiguous, bounds-limited or engine support is absent;
- `UNRECOVERABLE_UNDER_CURRENT_CONTRACT` — the current admitted methods cannot produce a valid result without violating required preservation/integrity constraints.

FORENSICS itself does not apply the repair.

## 8. Loss ledger requirements

Any proposed later repair must be bound to a pre-operation loss forecast and post-operation loss receipt.

Loss classes must be explicit and may include:

- missing/unrecoverable native parts;
- dropped unknown extension content;
- broken relationships;
- unsupported active content;
- unsupported semantic structures;
- visual/layout degradation;
- accessibility/review/provenance loss;
- signature/protection invalidation;
- metadata/hidden-data changes.

An empty loss ledger is not assumed from successful serialization/reopen.

## 9. Requirement/invariant -> implementation -> evidence matrix

| Requirement / invariant | Recovered component / state | Contract / durable state | Tests / evidence | Environment | Blocker / residual |
| --- | --- | --- | --- | --- | --- |
| UDM-SPINE-0004 FORENSICS | `UniversalDocumentSpine` forensics + `DocumentProcessingService.inspect` + CDG-2; partial verified | stage receipt/inventory | historical spine portable receipt | historical portable exact subject | exhaustive corruption/assets/relationships/recoverability incomplete |
| exact source binding | governed artifact/spine digest boundaries | source SHA + identity/security receipt references | existing digest/receipt regressions | portable | current R4 source custody pending |
| unknown/custom part inventory | DOCX/PPTX package inventory paths; partial | open-world inventory/preservation facts | historical native mastery tests | portable historical subjects | current depth audit/requalification; extension ownership gaps |
| unknown-part preservation | generic safe preservation only | native preservation/loss facts | round-trip/preservation regressions | portable | semantic edit/create delegated/unsupported |
| corruption findings | package/parser diagnostics; partial | structured finding list | format-specific tests vary | portable + engine-specific | denominator incomplete across formats |
| relationship inventory | OOXML relationship/package inspectors | relationship facts with source/target/type | DOCX/PPTX recovered tests | portable | complete PDF/other-format evidence varies |
| shared native-part aliases | owner-aware native engines | alias/share facts | header/footer/chart shared-part regressions | portable | generalization/current requalification required |
| assets inventory | DOCX/PPTX media/embedded content paths; partial | asset facts + digests/source anchors | format matrices/historical tests | portable | exhaustive cross-format inventory incomplete |
| damaged DOCX recoverability | OOXML repair primitives; partial | recoverability + explicit loss ledger required | residual not promoted | portable candidate | implementation closure/current qualification pending |
| PPTX repair/troubleshoot | declared portable implementation | package diff/repair/roundtrip facts | atomic depth audit required | portable candidate | current exact-subject proof missing |
| PDF recoverability | evidence reviewed is incomplete | parser/engine-specific forensic facts | malicious/parser corpus rows source-status-review | portable/external engines | reusable current recovery authority not proven |
| loss accounting | foundation loss/preservation contracts + damaged-doc residual | forecast + post-operation loss ledger | current complete denominator not proven | portable | design/runtime completion pending |
| native oracle evidence | external/native engines | separate receipt | not transferred | native/external | no native PASS claimed |

## 10. Ownership adjudication

DOCUMENTS owns:

- document/package structural forensics;
- document native-part, asset, relationship and unknown/custom-part facts;
- document corruption findings and recoverability semantics;
- document repair/loss-ledger semantics;
- source anchors used by later Documents semantic projection.

DOCUMENTS does not own:

- generic artifact storage/custody authority;
- global security/effect policy;
- Book canonical/manuscript semantics;
- Learning semantics;
- Programming semantics;
- spreadsheet semantic ownership for embedded workbooks beyond bounded document-container evidence;
- retired Prose work;
- native Office/external oracle truth.

A DOCX/PPTX container may preserve an embedded workbook as an asset and record bounded document-container facts without claiming spreadsheet semantic mastery.

## 11. Adversarial cases the design lock must cover

At minimum:

1. exact source digest mismatch;
2. stale IDENTIFY receipt;
3. stale SECURE receipt;
4. malformed package central directory/content-type table;
5. missing required native part;
6. orphan relationship;
7. relationship target missing;
8. duplicate/native alias target;
9. unknown/custom part retained as unknown rather than dropped;
10. unknown part intersects proposed mutation target -> later mutation blocked;
11. shared physical part referenced by multiple semantic owners;
12. asset digest mismatch;
13. unsupported embedded object retained as evidence without semantic promotion;
14. parser warning preserved, not swallowed;
15. partial parser success cannot become intact standing;
16. bounds exhaustion -> unknown/partial forensics;
17. repair-engine unavailable -> recovery unknown/engine-required;
18. serializer reopen success does not prove unknown-part preservation;
19. repair proposal with undeclared loss is invalid;
20. repair proposal with unknown preservation impact remains blocked;
21. DOCX damaged-package partial recovery with explicit loss ledger;
22. DOCX rich/open-world content cannot be wholesale rebuilt by generic repair;
23. shared DOCX native part requires alias-aware repair plan;
24. PPTX stale/missing safe part repair requires preconditions;
25. PPTX unknown/custom part round-trip preservation;
26. PPTX malformed package diagnostic remains separate from actual repair;
27. PDF malformed/unsupported object with parser partial result -> partial/unknown;
28. PDF repair claim cannot exceed qualified engine evidence;
29. native/external oracle unavailable is not PASS;
30. FORENSICS receipt contains stage-local facts only, not downstream PARSE/EXTRACT/repair PASS;
31. repeated exact input/inspector/profile yields deterministic receipt digest;
32. inspector/profile change invalidates reuse;
33. no external dereference/effect occurs during relationship inventory;
34. no raw document content leaks to telemetry by default;
35. no Book/Learning/Programming/spreadsheet/Prose semantic truth is absorbed;
36. cumulative INTAKE -> IDENTIFY -> SECURE -> FORENSICS stage ownership remains non-overlapping and fail closed.

## 12. Forensic conclusion

FORENSICS has substantial reusable substrate and should not be rewritten wholesale. Its current weakness is not absence of package inspection; it is the lack of one frozen, source-bound, format-aware contract that separates:

- structural observation from semantic understanding;
- unknown-part preservation from semantic ownership;
- corruption findings from repair authority;
- recoverability assessment from actual repair;
- package reopen from preservation proof;
- portable evidence from native/external oracle evidence.

The recovered evidence is sufficient to freeze that contract next. It is not sufficient to claim current implementation completion, exact-current-subject qualification, complete PDF recovery, native Office fidelity, A-01, publication or production readiness.

## Exact successor

`DOCUMENTS-SPINE-FORENSICS-DESIGN-LOCK-001 — FREEZE DocumentForensicsReceipt v1 + STRUCTURE/CORRUPTION/UNKNOWN-PART/ASSET/RELATIONSHIP/RECOVERABILITY TAXONOMY + LOSS-LEDGER FENCE + 36-CASE QUALIFICATION DENOMINATOR, WITHOUT RUNTIME MUTATION.`
