# DOCUMENTS-SPINE-SECURE-DESIGN-LOCK-001

Status: **DESIGN LOCK / SPECIFICATION PASS / RUNTIME BUILD NOT AUTHORIZED UNTIL CURRENT SOURCE CUSTODY**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Capability: `UDM-SPINE-0003` — SECURE  
Parent forensic packet: `DOCUMENTS-SPINE-SECURE-FORENSIC-PREP-001`  
Design-lock base: `documents/control-v1@99b8c9f275f87eb1714287fb3957a5ebbb49c15f`

## 1. Contract purpose

SECURE answers one Documents-owned question:

**Given an exact source artifact and its immutable Documents identity receipt, what document-specific security facts are deterministically observable without executing active content or dereferencing external effects, and do those facts permit only bounded non-effecting Documents analysis or require quarantine/block/shared-policy adjudication?**

SECURE does not grant effect authority, network authority, credential authority, malware-clean certification, native Office trust, publication authority, A-01 standing or production standing.

The stage must be fail-closed. Missing, ambiguous, bounds-limited or unavailable evidence is an explicit result, never a silent PASS.

## 2. Truth ownership

DOCUMENTS owns:

- document-package security inventory facts;
- macro/VBA, ActiveX, OLE, embedded-package, script/action and comparable document-specific active-content facts;
- document external-relationship inventory facts;
- document hidden-data/privacy indicators;
- document encryption/protection/signature-state observations;
- redaction/sanitization evidence and post-operation absence-proof semantics;
- deterministic Documents processing standing for bounded non-effecting analysis;
- the immutable `DocumentSecurityAssessmentReceipt` semantics.

Shared System Master security/effect authority owns:

- permission to execute code/macros/scripts/actions;
- network access and external dereference permission;
- credential/secret use;
- global risk acceptance and policy override;
- effect authorization outside bounded Documents analysis;
- production/native environment admission.

Documents cannot mint any of those shared authorities. Shared infrastructure cannot rewrite Documents-owned semantic facts.

## 3. Required input contract

SECURE requires:

1. exact `source_artifact_ref`;
2. exact `source_sha256`;
3. immutable `DocumentIdentityReceipt v1` whose source digest matches the requested source;
4. `security_inspector_implementation_id` and digest;
5. `documents_security_profile_id` and digest for the deterministic Documents-local classification rules;
6. explicit inspection bounds;
7. optional shared-policy decision reference only when one already exists.

A digest mismatch, unsupported identity contract, ambiguous/unknown source identity where stronger standing is required, or stale inspector/profile binding fails before any promotion.

## 4. Versioned output contract

`DocumentSecurityAssessmentReceipt v1` contains at minimum:

- `contract_version`
- `source_artifact_id`
- `source_sha256`
- `identity_receipt_digest`
- `security_inspector_implementation_id`
- `security_inspector_implementation_digest`
- `documents_security_profile_id`
- `documents_security_profile_digest`
- `inspection_bounds`
- `inspection_standing` — `COMPLETE | PARTIAL | UNKNOWN | AMBIGUOUS | BOUNDS_EXCEEDED`
- `active_content_facts[]`
- `external_relationship_facts[]`
- `embedded_object_facts[]`
- `hidden_data_facts[]`
- `protection_encryption_facts[]`
- `signature_state_facts[]`
- `redaction_sanitization_facts[]`
- `unknown_or_unclassified_parts[]`
- `parser_security_facts[]`
- `network_effect_facts[]`
- `path_safety_facts[]`
- `documents_processing_standing` — `BOUNDED_NON_EFFECTING_ANALYSIS_ELIGIBLE | QUARANTINE_REQUIRED | BLOCKED_UNKNOWN | SHARED_POLICY_REQUIRED`
- `effect_authorization` — fixed value `NOT_GRANTED_BY_DOCUMENTS`
- `shared_policy_decision_ref` — optional evidence reference only; never synthesized
- `diagnostics[]`
- `receipt_digest`

`receipt_digest` is the digest of canonical serialization excluding itself.

## 5. Facts are not permissions

Every security observation is a fact with source evidence, not an authorization.

Examples:

- `MACRO_PROJECT_PRESENT` does not mean executable or approved.
- `EXTERNAL_RELATIONSHIP_PRESENT` does not authorize dereference.
- `ENCRYPTED_OR_PROTECTED` does not authorize credential use or bypass.
- `SIGNATURE_PRESENT` does not prove signature validity.
- `NO_KNOWN_ACTIVE_CONTENT_FOUND` does not mean globally malware-free.
- `BOUNDED_NON_EFFECTING_ANALYSIS_ELIGIBLE` means only that the contract-listed deterministic checks completed sufficiently for bounded read/inventory/forensic work under the current Documents profile. It does not grant external effects or production admission.

## 6. Fail-closed processing law

SECURE applies these deterministic laws:

1. Active content is inventoried without execution.
2. External relationships are inventoried without dereference.
3. Network access is denied by default.
4. XML parsing disables DTDs, external entities, XInclude and external stylesheet/DTD resolution.
5. Archive/container inspection enforces entry count, per-entry bytes, total inflated bytes, recursion/nesting, duplicate-entry and traversal limits.
6. Path handling normalizes and proves containment under the authorized root.
7. Encrypted/protected artifacts are blocked unless an already-authorized credential/policy route is supplied through the proper shared authority.
8. Unknown, ambiguous, malformed, incomplete or bounds-limited inspection cannot yield bounded-analysis eligibility when the missing evidence could change security standing.
9. Recognition does not imply processing-engine qualification or security PASS.
10. Historical qualification never transfers to changed source, inspector, profile or contract digests.

## 7. Active-content classification law

`active_content_facts[]` must identify the evidence class and exact source reference without executing content.

Contract-listed classes include at least:

- VBA/macro project;
- ActiveX control/content;
- OLE object;
- embedded package/object;
- script-capable content;
- launch/action/effect instruction;
- external executable relationship;
- effectful/macrolike document field/instruction;
- unknown embedded executable-capable content.

`DocumentIdentityReceipt.active_content_posture=INERT` is a prerequisite fact, not a substitute for SECURE where deeper hidden/external/protection checks are required.

## 8. Narrow inert-exception law

A known prior Documents defect proved that both extremes are unsafe:

- treating every embedded package as automatically dangerous can block valid deterministic document behavior;
- broadly exempting a container type can create a security bypass.

Therefore an embedded object may receive a narrow inert classification only when all required predicates for that exact contract-listed use case are proven.

For the recovered DOCX chart-data case, inert standing requires at minimum:

- the embedding is relationship-bound to the chart data use case;
- expected static workbook structure is present;
- formulas are absent where the narrow profile forbids them;
- macro/VBA content is absent;
- ActiveX/OLE unsafe embedding indicators are absent;
- external-link parts are absent;
- external relationships are absent;
- inspection completed within bounds.

Failure of any predicate yields active/unknown/quarantine standing rather than a broader allowlist.

## 9. External relationships and network law

SECURE inventories external targets as data only.

It must record at least:

- relationship source part/object;
- relationship type/class;
- target string in safely encoded/normalized evidence form;
- whether target is internal or external;
- whether the target implies network/effect behavior;
- whether the target class is known, unknown or malformed.

SECURE never dereferences an external URI to decide whether it is safe. Any actual dereference requires separate shared effect/network authorization and must occur outside the SECURE fact-gathering contract.

## 10. Format-specific minimum facts

### DOCX / DOCM

At minimum inspect for:

- macro/VBA projects;
- ActiveX and OLE objects;
- arbitrary embedded packages;
- external package relationships/hyperlinks;
- effectful/macrolike field instructions;
- custom/unknown package parts relevant to security standing;
- comments/revisions/custom properties or comparable hidden-data/privacy indicators where supported;
- encryption/protection/signature-state observations where exposed by current source/engine.

Internal bookmark links and safe deterministic fields remain distinct from external/effectful content. No link is dereferenced.

### PPTX / PPTM

At minimum inspect for:

- macro/VBA indicators;
- ActiveX/OLE/embedded packages;
- external relationship targets and hyperlinks;
- media/external media relationships;
- launch/action/effect instructions where exposed;
- notes/comments/hidden-slide or comparable privacy indicators where exposed;
- unknown/custom package parts;
- encryption/protection/signature-state observations where exposed.

Animation/timing presence alone is not authority to execute/play it.

### PDF

At minimum inspect where the admitted parser can deterministically expose evidence for:

- JavaScript/script actions;
- Launch/action dictionaries;
- external URI/effect targets;
- embedded files/attachments;
- forms/XFA or comparable interactive/action-bearing structures;
- encryption/protection;
- signature objects/state indicators;
- annotations/layers/metadata/hidden representations relevant to privacy and redaction proof.

Unsupported parser depth is `UNKNOWN`, not a negative finding.

### Text / HTML / RTF / ODF / EPUB / legacy families

Only contract-listed, deterministically implemented checks may contribute positive/negative security facts. Missing format depth remains explicit `UNKNOWN`/`PARTIAL`; recognition cannot be promoted to complete security standing.

## 11. Hidden data / privacy law

Hidden-data facts are format-specific and evidence-scoped. They may include comments, revisions, speaker notes, hidden slides, metadata/custom properties, embedded objects, attachments, optional content, hidden representations or other contract-listed content.

A privacy/sanitization operation cannot claim success simply because the visible rendering no longer shows the target. Post-operation proof must inspect all required target and hidden representations for the requested sanitization contract.

## 12. Redaction / sanitization law

SECURE itself does not perform arbitrary redaction mutation. It records current state and proof obligations.

For a later redaction/sanitization operation:

- target scope is explicit and digest-bound;
- mutation is separately authorized and versioned;
- visual concealment alone is insufficient;
- post-operation absence proof is mandatory for targeted and hidden representations;
- unsupported proof depth results in incomplete/unknown, not PASS;
- the proof receipt is exact-subject and does not transfer to subsequent bytes.

## 13. Encryption, protection and signatures

- Encrypted/protected artifacts fail closed without an already-authorized credential route.
- SECURE never invents, retrieves or reuses credentials on its own authority.
- Presence of a digital signature is an observed fact only.
- A mutation that can invalidate a signature/protection state must preserve that consequence explicitly.
- No mutation may claim a signature remains valid without qualified verification of the exact result.

## 14. Commands, queries, events and errors

### Command

`AssessDocumentSecurity(source_artifact_ref, source_sha256, identity_receipt_digest, inspector_digest, documents_security_profile_digest, inspection_bounds, shared_policy_decision_ref?) -> DocumentSecurityAssessmentReceipt`

The command is non-effecting with respect to external systems and active content. It may perform bounded local parsing/inventory only.

### Query

`GetDocumentSecurityAssessment(source_sha256, identity_receipt_digest, inspector_digest, security_profile_digest) -> receipt | NOT_FOUND`

A cache/projection may answer only when the full source/identity/inspector/profile key matches.

### Events

- `DocumentSecurityAssessmentCompleted`
- `DocumentSecurityQuarantineRequired`
- `DocumentSecurityBlockedUnknown`
- `DocumentSecuritySharedPolicyRequired`

Events carry receipt identity/reference and bounded diagnostics, not raw document bytes.

### Stable error classes

- `SOURCE_DIGEST_MISMATCH`
- `IDENTITY_RECEIPT_MISMATCH`
- `IDENTITY_STANDING_INSUFFICIENT`
- `MALFORMED_CONTAINER`
- `ARCHIVE_BOUNDS_EXCEEDED`
- `DUPLICATE_PACKAGE_ENTRY`
- `PATH_TRAVERSAL_DETECTED`
- `XML_EXTERNAL_RESOURCE_FORBIDDEN`
- `ACTIVE_CONTENT_PRESENT`
- `EXTERNAL_RELATIONSHIP_PRESENT`
- `UNCLASSIFIED_EMBEDDED_CONTENT`
- `ENCRYPTED_OR_PROTECTED`
- `CREDENTIAL_AUTHORITY_REQUIRED`
- `INSPECTION_INCOMPLETE`
- `SECURITY_EVIDENCE_AMBIGUOUS`
- `SECURITY_INSPECTOR_UNAVAILABLE`
- `SECURITY_CONTRACT_VERSION_UNSUPPORTED`
- `SHARED_POLICY_DECISION_REQUIRED`
- `REDACTION_ABSENCE_PROOF_REQUIRED`
- `SANITIZATION_ABSENCE_PROOF_REQUIRED`

Errors that represent durable source facts are not retried as transient failures.

## 15. Persistence / idempotency / invalidation

Assessment identity is content-addressed by:

`source_sha256 + identity_receipt_digest + security_inspector_implementation_digest + documents_security_profile_digest + contract_version + canonical inspection_bounds`

Rules:

- same exact inputs produce the same semantic assessment and digest;
- a source-byte change requires fresh IDENTIFY and SECURE receipts;
- an identity-classifier change invalidates downstream SECURE reuse through the changed identity digest;
- an inspector/profile/contract change creates a new immutable assessment;
- prior receipts remain evidence and are never silently rewritten;
- a retry after interruption may resume from durable bounded inventory checkpoints only when source/identity/inspector/profile/bounds still match;
- a permanent unsafe-content or malformed-input result is not a transient retry candidate;
- no stacked retry layers are authorized inside SECURE.

## 16. Interface with shared effect authority

When SECURE detects an effect-bearing condition, it may emit `SHARED_POLICY_REQUIRED` plus immutable facts. It may not call that an approval.

Any later effect command must independently bind:

- exact security receipt digest;
- requested effect;
- current shared-policy decision/authorization;
- user/actor authority as required by the shared system;
- environment/credential authority where applicable.

A stale or absent shared-policy decision blocks the effect while leaving the Documents security facts intact.

## 17. Isolated qualification denominator — 40 cases

The implementation gate must prove at least:

1. exact source digest mismatch fails before assessment;
2. identity receipt digest mismatch fails;
3. UNKNOWN identity fails closed;
4. AMBIGUOUS identity fails closed;
5. package entry-count bound exhaustion fails closed;
6. per-entry size bound exhaustion fails closed;
7. total inflated-size bound exhaustion fails closed;
8. duplicate package entry fails/ambiguous;
9. traversal attempt fails;
10. nested/recursive container bound exhaustion fails;
11. XXE/DTD/XInclude/external resource attempt fails;
12. DOCM macro project inventoried without execution;
13. arbitrary DOCX embedded binary yields active/quarantine fact;
14. narrowly verified chart-owned static XLSX may be inert only when every predicate passes;
15. formula-bearing chart workbook cannot receive inert standing;
16. chart workbook with external relationship cannot receive inert standing;
17. ActiveX/OLE evidence yields present/quarantine fact;
18. unsafe/effectful document field is rejected/classified;
19. safe deterministic field remains representable without execution;
20. DOCX external hyperlink is inventoried without dereference;
21. missing internal bookmark target fails closed in the appropriate document semantic boundary;
22. PPTM macro evidence is inventoried without execution;
23. PPTX OLE/ActiveX/embedded package inventory is preserved;
24. PPTX external relationship is inventoried without dereference;
25. presentation launch/action/effect evidence cannot grant execution;
26. PDF JavaScript/action evidence is inventoried when supported;
27. PDF external URI/Launch evidence is inventoried without dereference/execution;
28. PDF embedded-file evidence is inventoried;
29. encrypted/protected source without authorized credential route is blocked;
30. signature presence is not equated to verified validity;
31. visual redaction without absence proof cannot become sanitized PASS;
32. hidden-data sanitization without absence proof cannot become complete;
33. unknown hidden-data inspection leaves security proof incomplete;
34. telemetry/receipt path contains no raw document content by default;
35. recognized format / engine availability does not grant security PASS;
36. same source + identity + inspector + profile + bounds reproduces same assessment digest;
37. inspector/profile version change cannot reuse stale assessment;
38. shared effect-policy refusal/absence cannot be overridden by Documents;
39. no Book/Learning/Programming/spreadsheet/Prose semantic ownership enters the receipt;
40. cumulative INTAKE -> IDENTIFY -> SECURE regression preserves existing fail-closed behavior and one truth owner per fact.

## 18. Cumulative regression/calibration gate

A future SECURE implementation is not frozen by isolated tests alone. It must also rerun, on the same executable subject where dependency-valid:

- bounded INTAKE regressions;
- IDENTIFY identity/subtype/profile/active-content regressions;
- existing spine portable regressions;
- recovered DOCX/PPTX security-specific regressions affected by the implementation;
- security-proof/finalization regressions that consume SECURE facts;
- deterministic restart/idempotency tests;
- no-content-leak telemetry assertions.

External/native oracles are separate evidence classes and are not prerequisites to claim the bounded portable semantics they do not govern; conversely portable PASS cannot claim native Office or external-provider security behavior.

## 19. Closure / non-claims

This packet freezes the SECURE semantic contract and qualification denominator only.

It does not establish:

- R4 GitHub-native source custody;
- implementation of this contract in the recovered runtime;
- current exact-subject portable qualification;
- A-01 PASS;
- Microsoft Office native behavior;
- external provider behavior;
- signature-validity authority;
- publication approval;
- production admission.

Historical and Library-recovered evidence remains exact-source provenance, not current PASS.

## Exact next operations

Runtime successor, **blocked**:

`DOCUMENTS-SPINE-SECURE-IMPLEMENTATION-001 — BLOCKED ON R4 GITHUB-NATIVE EXACT SOURCE CUSTODY AND FRESH CURRENT-SUBJECT BASELINE QUALIFICATION.`

Independent work-ahead successor, **ready for forensic/specification-only work**:

`DOCUMENTS-SPINE-FORENSICS-FORENSIC-PREP-001 — RECOVER + INVENTORY + ANALYZE UDM-SPINE-0004 NATIVE STRUCTURE / CORRUPTION / UNKNOWN PARTS / ASSETS / RELATIONSHIPS / RECOVERABILITY EVIDENCE, WITHOUT RUNTIME MUTATION.`
