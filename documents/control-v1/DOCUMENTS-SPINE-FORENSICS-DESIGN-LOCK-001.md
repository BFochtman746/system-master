# DOCUMENTS-SPINE-FORENSICS-DESIGN-LOCK-001

Status: **DESIGN LOCK / SPECIFICATION PASS / RUNTIME BUILD NOT AUTHORIZED UNTIL CURRENT SOURCE CUSTODY**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Capability: `UDM-SPINE-0004` — FORENSICS  
Parent forensic packet: `DOCUMENTS-SPINE-FORENSICS-FORENSIC-PREP-001`  
Design-lock base: `documents/control-v1@c6724d0f5e919defb8b5e584c78ba0a3dd98523e`

## 1. Purpose

FORENSICS produces a deterministic, source-bound inventory of document-native structure, corruption findings, unknown/custom parts, assets, relationships and recoverability evidence without mutating the source.

It does not perform repair, does not infer semantic mastery from package reachability, and does not claim recovery where the available evidence is partial, ambiguous, bounds-limited or dependent on an unavailable native/external engine.

## 2. Required input contract

FORENSICS requires:

- exact source artifact reference and SHA-256;
- immutable `DocumentIdentityReceipt v1`;
- immutable `DocumentSecurityAssessmentReceipt v1` when SECURE applies;
- forensic inspector implementation id/digest;
- format/profile-specific forensic ruleset id/digest;
- canonical inspection bounds.

Any source/receipt mismatch or stale inspector/ruleset binding fails before a reusable forensic receipt is issued.

## 3. `DocumentForensicsReceipt v1`

The receipt contains at minimum:

- `contract_version`
- `source_artifact_id`
- `source_sha256`
- `identity_receipt_digest`
- `security_receipt_digest`
- `forensic_inspector_implementation_id`
- `forensic_inspector_implementation_digest`
- `forensic_ruleset_id`
- `forensic_ruleset_digest`
- `inspection_bounds`
- `inspection_standing` — `COMPLETE | PARTIAL | UNKNOWN | AMBIGUOUS | BOUNDS_EXCEEDED`
- `native_structure_facts[]`
- `content_type_facts[]`
- `relationship_facts[]`
- `asset_facts[]`
- `unknown_custom_part_facts[]`
- `alias_ownership_facts[]`
- `corruption_findings[]`
- `parser_engine_findings[]`
- `preservation_findings[]`
- `recoverability_assessment`
- `repair_prerequisites[]`
- `loss_forecast[]`
- `external_native_evidence_requirements[]`
- `diagnostics[]`
- `receipt_digest`

The receipt is immutable and content-addressed. Raw document content is not duplicated into telemetry or diagnostics by default.

## 4. Structural fact law

A structural fact is bound to an exact source anchor and evidence method. It may describe:

- native part/object path or identifier;
- content type/profile role;
- byte digest and size where available;
- internal/external relationships;
- object/part aliases and shared physical ownership;
- embedded asset type;
- unknown/custom extension status;
- required-vs-optional part status;
- parser warning/error state.

A low-level structural fact does not prove the semantic meaning of the object. PARSE/EXTRACT own later semantic projection.

## 5. Unknown/custom-part law

Generic Documents forensics may:

- identify an unknown/custom part;
- preserve its exact bytes/relationships when safe and required;
- record its content type, source anchor, digest and relationship context;
- block later mutation when the unknown part intersects the requested mutation target or preservation cannot be proven.

Generic FORENSICS may not invent semantic CREATE/EDIT ownership for an extension-specific part. Extension semantic ownership must be explicit.

Unknown does not mean disposable.

## 6. Corruption finding taxonomy

`corruption_findings[]` uses stable evidence classes, not one coarse boolean. Classes include at minimum:

- `MISSING_REQUIRED_PART`
- `MISSING_RELATIONSHIP_TARGET`
- `ORPHAN_PART`
- `ORPHAN_RELATIONSHIP`
- `DUPLICATE_OR_CONFLICTING_ENTRY`
- `INVALID_CONTENT_TYPE_BINDING`
- `MALFORMED_NATIVE_XML_OR_STRUCTURE`
- `BROKEN_INTERNAL_REFERENCE`
- `SHARED_OWNER_ALIAS_RISK`
- `TRUNCATED_OR_UNREADABLE_CONTENT`
- `ENGINE_PARSE_DISAGREEMENT`
- `UNSUPPORTED_NATIVE_FEATURE`
- `UNKNOWN_EXTENSION_SEMANTICS`
- `INTEGRITY_CHECK_FAILURE`
- `NATIVE_REOPEN_OR_VALIDATION_FAILURE`

Each finding records severity/classification evidence and exact anchors where available. A warning is not silently converted to success.

## 7. Recoverability taxonomy

`recoverability_assessment` is one of:

- `INTACT_OBSERVED`
- `DEGRADED_READABLE`
- `RECOVERABLE_WITHOUT_DECLARED_LOSS`
- `RECOVERABLE_WITH_DECLARED_LOSS`
- `RECOVERY_ENGINE_REQUIRED`
- `UNKNOWN_RECOVERABILITY`
- `UNRECOVERABLE_UNDER_CURRENT_CONTRACT`

Rules:

- `INTACT_OBSERVED` applies only to the contract-listed checks actually completed; it is not a native-application fidelity certification.
- `RECOVERABLE_WITHOUT_DECLARED_LOSS` requires deterministic evidence that all required preservation invariants for the repair scope can be maintained.
- `RECOVERABLE_WITH_DECLARED_LOSS` requires a complete pre-operation loss forecast.
- missing engine/oracle support is `RECOVERY_ENGINE_REQUIRED` or `UNKNOWN_RECOVERABILITY`, never guessed recovery.
- FORENSICS itself never applies the repair.

## 8. Repair and loss-ledger fence

A later repair operation must bind:

- exact forensic receipt digest;
- exact source digest;
- immutable repair plan;
- declared target scope;
- preservation requirements;
- pre-operation `loss_forecast`;
- required security/effect authority;
- rollback/version source;
- post-operation validation and `actual_loss_ledger`.

The actual loss ledger records every known dropped, changed, unsupported or invalidated feature. Successful serialization or reopen does not prove an empty loss ledger.

## 9. Shared-part / alias law

When two or more semantic owners reference the same physical native part/object, FORENSICS records the alias/share relation.

Later owner-scoped mutation must not modify the shared physical object in place unless the operation explicitly owns all affected owners. Otherwise the mutation path must use a proven detach/copy-on-write strategy that preserves sidecar relationships and unaffected owners.

This rule generalizes recovered DOCX header/footer and chart alias defect lessons.

## 10. Package reachability is not semantic mastery

The following are explicitly distinct:

1. part/object can be enumerated;
2. bytes can be read;
3. relationships can be inventoried;
4. structure is syntactically valid;
5. the semantic owner is known;
6. the semantic feature can be losslessly projected;
7. the feature can be safely edited;
8. native/external application fidelity is proven.

FORENSICS may establish 1-4 and some ownership evidence. It cannot promote 5-8 without their own contracts/evidence.

## 11. Per-format minimum inventory

### DOCX / DOCM

At minimum inventory, when the admitted implementation supports it:

- package entries/content types;
- main document, styles, numbering, settings, sections/header/footer parts;
- comments/revisions/notes/bookmarks/content controls/custom XML;
- relationships and shared-part aliases;
- media/charts/embedded packages;
- unknown/custom parts/extensions;
- required/missing/orphan parts;
- security-active parts already surfaced by SECURE;
- parser/round-trip/reopen findings;
- preservation and damaged-package recovery evidence.

### PPTX / PPTM

At minimum inventory:

- presentation/slides/masters/layouts/themes;
- notes/comments/sections;
- media/charts/embedded objects;
- relationship graph and external relationship facts;
- content types and unknown/custom parts;
- shared package-part aliases;
- stale/missing safe part findings;
- package-diff/round-trip/troubleshooting evidence;
- parser/native-oracle evidence gaps.

### PDF

At minimum record only facts the admitted parser/engine can prove, including where supported:

- object/xref/page-tree structure;
- streams/resources/fonts/images;
- annotations/forms/attachments/actions;
- metadata/optional content;
- parser integrity/malformed findings;
- engine disagreement;
- repair-engine capability and exact version;
- recovery/loss evidence.

Unsupported depth remains explicit; no generic PDF recoverability PASS is inferred.

### Other formats

Recognized formats receive only contract-listed implemented forensics. Missing native-depth evidence is `PARTIAL/UNKNOWN`.

## 12. Command/query contract

### Command

`InspectDocumentForensics(source_ref, source_sha256, identity_receipt_digest, security_receipt_digest, inspector_digest, ruleset_digest, bounds) -> DocumentForensicsReceipt`

The command is read-only with respect to the source artifact and external effects.

### Query

`GetDocumentForensics(source_sha256, identity_receipt_digest, security_receipt_digest, inspector_digest, ruleset_digest, bounds_digest) -> receipt | NOT_FOUND`

Reuse requires the entire key to match.

## 13. Stable error classes

- `FORENSICS_SOURCE_DIGEST_MISMATCH`
- `FORENSICS_IDENTITY_RECEIPT_MISMATCH`
- `FORENSICS_SECURITY_RECEIPT_MISMATCH`
- `FORENSICS_MALFORMED_PACKAGE`
- `FORENSICS_BOUNDS_EXCEEDED`
- `FORENSICS_REQUIRED_PART_MISSING`
- `FORENSICS_RELATIONSHIP_TARGET_MISSING`
- `FORENSICS_UNKNOWN_EXTENSION`
- `FORENSICS_ENGINE_UNAVAILABLE`
- `FORENSICS_ENGINE_DISAGREEMENT`
- `FORENSICS_EVIDENCE_INCOMPLETE`
- `FORENSICS_RECOVERABILITY_UNKNOWN`
- `FORENSICS_REPAIR_ENGINE_REQUIRED`
- `FORENSICS_UNDECLARED_LOSS`
- `FORENSICS_NATIVE_ORACLE_REQUIRED`

Permanent source facts are not retried as transient infrastructure failures.

## 14. Persistence, idempotency and invalidation

Receipt identity is based on:

`source_sha256 + identity_receipt_digest + security_receipt_digest + inspector_digest + ruleset_digest + bounds_digest + contract_version`

Rules:

- same exact inputs produce the same semantic receipt digest;
- a source, identity, security, inspector, ruleset, bounds or contract change requires a new receipt;
- prior receipts remain immutable evidence;
- restart may resume only source-bound inventory checkpoints with an exact matching key;
- cache/projection state cannot override current exact receipt identity;
- parser/engine upgrades invalidate claims that depend on the old implementation.

## 15. Isolated qualification denominator — 36 cases

1. source digest mismatch fails;
2. stale identity receipt fails;
3. stale security receipt fails;
4. malformed package recorded/fails appropriately;
5. missing required part finding;
6. missing relationship target finding;
7. orphan part finding;
8. orphan relationship finding;
9. duplicate/conflicting package entry finding;
10. invalid content-type binding finding;
11. malformed native XML/structure finding;
12. broken internal reference finding;
13. unknown/custom part is inventoried and preserved as unknown;
14. unknown part is not granted semantic edit ownership;
15. unknown part intersecting later target creates a block prerequisite;
16. shared native part produces alias/share facts;
17. asset digest/identity facts are source-bound;
18. unsupported embedded asset remains evidence without semantic promotion;
19. partial parser success cannot yield `INTACT_OBSERVED` when material checks are incomplete;
20. bounds exhaustion yields partial/unknown standing;
21. unavailable repair engine yields engine-required/unknown recovery;
22. deterministic DOCX damaged-package recovery candidate carries explicit loss forecast;
23. DOCX rich/open-world content cannot be wholesale reconstructed generically;
24. shared DOCX owner-scoped repair requires detach/copy-on-write plan;
25. PPTX unknown/custom parts retain preservation facts;
26. PPTX missing/stale part repair is only a candidate with preconditions;
27. PPTX package reopen alone does not prove semantic preservation;
28. PDF parser partial result cannot grant general recoverability;
29. PDF repair claim cannot exceed qualified engine evidence;
30. undeclared loss invalidates a repair candidate;
31. native/external oracle missing remains explicit;
32. stage receipt cannot claim downstream PARSE/EXTRACT/repair PASS;
33. repeated exact inputs reproduce receipt digest;
34. inspector/ruleset version change invalidates reuse;
35. no raw content leak to telemetry by default;
36. cumulative INTAKE -> IDENTIFY -> SECURE -> FORENSICS ownership and fail-closed behavior remains intact.

## 16. Cumulative regression/calibration gate

Future implementation must rerun on one exact executable subject, where dependency-valid:

- bounded intake tests;
- IDENTIFY contract tests;
- SECURE 40-case denominator and affected security regressions;
- existing spine portable regressions;
- open-world/unknown-part preservation regressions;
- shared-part alias/copy-on-write prerequisites;
- relevant DOCX/PPTX format regressions;
- parser/engine exact-version checks;
- deterministic resume/idempotency tests;
- stage-local receipt diagnostics tests.

Native/external evidence remains separate and cannot be synthesized from portable PASS.

## 17. Non-claims

This design lock does not establish:

- GitHub-native R4 source custody;
- implementation of `DocumentForensicsReceipt v1` in the recovered runtime;
- current exact-subject qualification;
- complete DOCX/PPTX/PDF recovery;
- native Office fidelity;
- external engine/provider authority;
- A-01 PASS;
- publication or production readiness.

## Exact next operations

Runtime successor, **blocked**:

`DOCUMENTS-SPINE-FORENSICS-IMPLEMENTATION-001 — BLOCKED ON R4 GITHUB-NATIVE EXACT SOURCE CUSTODY AND FRESH CURRENT-SUBJECT BASELINE QUALIFICATION.`

Independent work-ahead successor, **ready**:

`DOCUMENTS-SPINE-PARSE-FORENSIC-PREP-001 — RECOVER + INVENTORY + ANALYZE UDM-SPINE-0005 LOSS-AWARE NATIVE/CDG-2 PARSE CONTRACT, SEMANTIC COVERAGE GAPS, OPEN-WORLD PRESERVATION HANDOFF AND PARSER ERROR/UNKNOWN SEMANTICS, WITHOUT RUNTIME MUTATION.`
