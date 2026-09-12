# DOCUMENTS-SPINE-MASTER-DESIGN-LOCK-001

Status: **DESIGN LOCK / SPECIFICATION PASS / RUNTIME BUILD AUTHORIZED ON CURRENT QUALIFIED SOURCE LINEAGE**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Capability: `UDM-SPINE-0010` — MASTER  
Parent forensic packet: `DOCUMENTS-SPINE-MASTER-FORENSIC-PREP-001`  
Design-lock base: `documents/control-v1@30330081b63edb8f00979e88596aa7eb66a5d42b`  
Qualified source subject: `f8d869388676c367766b7ea1e0205faae8db5cec`

## 1. Purpose

MASTER applies one admitted same-format document operation to one exact existing source artifact and produces one durable, independently verified, persisted-but-unproven candidate. MASTER reuses the same governed effect executor as REBUILD but emits a mode-specific immutable authority receipt.

MASTER does not grant human/author approval, final-document standing, version promotion, publication/release authorization, native Office/PDF fidelity, production standing or A-01 standing.

## 2. Same-format MASTER law

MASTER is valid only when the exact identified source format equals the requested target format and the admitted operation is supported for that exact format/capability binding.

Cross-format existing-artifact transformation is REBUILD, not MASTER. No adapter fallback, filename extension, media-type hint, chat instruction or caller label may silently convert MASTER into cross-format work.

## 3. Required pre-effect inputs

A MASTER effect request binds at minimum:

- exact source artifact id and SHA-256;
- exact identified document format;
- immutable identity receipt digest;
- current SECURE receipt digest/standing;
- current PARSE receipt digest plus source semantic/native-inventory digests;
- exact `DocumentUnderstandingReceipt v1` digest when required;
- exact `DocumentPlanReceipt v1` digest;
- exact operation-intent and target-resolution digests;
- exact Documents capability descriptor and qualification ref;
- exact adapter/engine implementation id/version/digest;
- exact preservation and open-world/loss-gate profile digests;
- resolvable rollback evidence ref/digest/standing;
- separate immutable effect-admission decision ref/digest from the shared Core/policy/effect authority;
- contract version.

A missing, stale, revoked, mismatched, wrong-owner or wrong-subject effect decision blocks before adapter invocation.

## 4. `DocumentMasterReceipt v1`

The immutable receipt contains at minimum:

- `contract_version`
- `job_id`
- `mode = MASTER`
- `source_artifact_id`
- `source_sha256`
- `source_format`
- `target_format`
- `identity_receipt_digest`
- `secure_receipt_digest`
- `parse_receipt_digest`
- `source_semantic_digest`
- `source_native_inventory_digest`
- `understanding_receipt_digest` when applicable
- `plan_receipt_digest`
- `operation_intent_digest`
- `target_resolution_digest`
- `effect_admission_ref`
- `effect_admission_digest`
- `capability_binding_digest`
- `adapter_id`
- `adapter_version`
- `adapter_implementation_digest`
- `preservation_profile_digest`
- `loss_gate_profile_digest`
- `rollback_evidence_ref`
- `rollback_evidence_digest`
- `source_to_candidate_lineage_digest`
- `candidate_artifact_id`
- `candidate_sha256`
- `candidate_size_bytes`
- `candidate_intake_receipt_digest`
- `candidate_semantic_digest`
- `candidate_native_inventory_digest`
- `changed_native_parts[]`
- `preservation_assessment_digest`
- `loss_gate_result_digest`
- `known_loss_refs[]`
- `candidate_state`
- `remaining_proof_prerequisites[]`
- `final_candidate_requested`
- `publication_class_requested`
- `resumability_key_digest`
- `diagnostics[]`
- `receipt_digest`

`final_candidate_requested` and `publication_class_requested` are descriptive request facts only. They must never be interpreted as final/publication authority.

## 5. Candidate-state taxonomy

`candidate_state` is exactly one of:

- `BLOCKED_EFFECT_AUTHORITY`
- `BLOCKED_CAPABILITY`
- `BLOCKED_FORMAT_MISMATCH`
- `BLOCKED_SOURCE_OR_TARGET_MISMATCH`
- `BLOCKED_LOSS_OR_PRESERVATION`
- `BLOCKED_ROLLBACK_EVIDENCE`
- `MUTATION_FAILED`
- `CANDIDATE_PERSISTENCE_FAILED`
- `MASTER_CANDIDATE_PERSISTED_UNPROVEN`
- `MASTER_CANDIDATE_RESUMED_REVALIDATED_UNPROVEN`
- `FAILED_INTEGRITY`

A successful MASTER stage ends only in one of the two `UNPROVEN` candidate states.

## 6. Shared effect-executor law

REBUILD and MASTER must reuse one governed existing-artifact effect execution primitive for common integrity behavior:

- source/semantic/target verification;
- effect-admission verification;
- capability/adapter qualification binding;
- open-world loss gate;
- adapter invocation;
- independent result hashing;
- independent candidate reprojection;
- native-part preservation assessment;
- candidate durable intake;
- restart/resume convergence.

Mode-specific policy remains outside the common primitive:

- REBUILD may admit explicit cross-format work;
- MASTER requires same-format identity;
- each emits its own receipt type and stable reason classes.

No duplicate mutation engine is authorized.

## 7. Effect-admission law

PLAN, capability membership, `finalCandidate`, `publicationClass`, `author`, `producerRef`, UI state, chat/webhook metadata and artifact filenames are insufficient effect authority.

MASTER must verify the separately owned immutable effect-admission decision before mutation. Documents consumes that decision through an explicit contract but does not create or broaden Core identity/delegation/policy authority.

## 8. Source / target / format identity law

Before mutation:

- source bytes SHA equals the admitted source/PARSE/operation SHA;
- source semantic digest equals the admitted operation/PLAN semantic digest;
- source format equals target format for MASTER;
- target-resolution digest matches the current source graph;
- target/selector sets are exact and nonempty where required;
- stale/mutable display names, ordinals and labels are non-authoritative hints only.

After mutation:

- candidate SHA is independently computed;
- adapter source/result digests are distrusted until independently verified;
- candidate is independently re-projected as the same format;
- preservation is independently assessed against the exact source and allowed native-part change set.

## 9. Loss / preservation / rollback law

MASTER inherits the frozen REBUILD open-world and preservation law:

- unmodeled targeted native content blocks unless exact support is qualified;
- expected changed parts are a smallest-justified allowlist;
- blanket wildcard/path-escape/interior-wildcard change scopes remain forbidden;
- known loss must be exactly admitted;
- unknown collateral loss is never authorized by a generic lossy flag;
- semantic success cannot override preservation failure;
- rollback evidence must be digest-verified and resolvable before effect;
- source/rollback authority remains immutable and is not overwritten by MASTER.

## 10. Candidate-before-proof persistence law

A mutation result is not restart authority until governed candidate intake verifies exact SHA, size and lineage. Only after durable verified intake may `DocumentMasterReceipt v1` record `MASTER_CANDIDATE_PERSISTED_UNPROVEN`.

A lost response, duplicate reconcile pass or restart must converge on that persisted candidate when the complete authority identity matches; it must not replay mutation merely because an earlier response was lost.

## 11. Resume identity

`resumability_key_digest` binds:

`MASTER + source_sha256 + source_format + plan_receipt_digest + effect_admission_digest + operation_intent_digest + target_resolution_digest + capability_binding_digest + adapter_implementation_digest + preservation_profile_digest + loss_gate_profile_digest + rollback_evidence_digest + contract_version`.

Resume requires a verified durable candidate read, independent candidate hash, same-format reprojection and renewed preservation assessment. Any authority-bearing mismatch invalidates reuse.

## 12. Final-candidate nonpromotion law

`DocumentOperationContract.finalCandidate()` means only that the operation requests a candidate intended to be eligible for downstream final-proof treatment.

It does not prove:

- human/author approval;
- final proof completion;
- publication authorization;
- release authorization;
- native fidelity;
- production standing.

MASTER stores the requested fact but emits no stronger authority.

## 13. Publication-authority fence

`DocumentSpinePublicationClass` remains a requested downstream treatment (`NONE`, `VERIFIED_DRAFT`, `FINAL`). It is not itself publication authorization.

The PUBLISH stage must remain separate from MASTER. If publication/release is consequential, PUBLISH must bind an exact separately owned release/publication decision appropriate to the caller/domain. Documents may verify technical document proof eligibility and persist artifacts, but it cannot manufacture Book author/editorial/publication truth or generic human consent.

A MASTER candidate can be perfectly proved as a document artifact and still be unauthorized for publication.

## 14. Metadata trust fence

`DocumentSpineJob.author` and `producerRef` are provenance/routing metadata only. They are included in immutable job identity for traceability but cannot be interpreted as identity proof, delegation, consent, authorship adjudication or approval.

No mutable chat/webhook/file metadata can substitute for an authority receipt.

## 15. Proof / version / publish handoff

After MASTER candidate persistence:

- RENDER/COMPARE/VALIDATE/ACCESSIBILITY/SECURITY_PROOF/PROVE bind the exact candidate digest;
- VERSION may commit only after the applicable proof contract succeeds;
- PUBLISH is a later separately authorized consequential action;
- changed candidate bytes invalidate downstream proof/version/release evidence;
- no later stage may regenerate candidate bytes by replaying MASTER merely to recover state.

## 16. Cross-owner fence

MASTER owns generic document mastering mechanics only. It cannot create or mutate Book manuscript canon, Story Bible, author/editorial/publication state; Learning learner/curriculum/mastery/certification state; Programming engineering authority; Core identity/delegation/policy/routing/placement authority; or any Prose lane.

## 17. Stable reason classes

- `MASTER_PLAN_RECEIPT_MISMATCH`
- `MASTER_EFFECT_ADMISSION_MISSING`
- `MASTER_EFFECT_ADMISSION_REVOKED`
- `MASTER_EFFECT_ADMISSION_MISMATCH`
- `MASTER_FORMAT_MISMATCH`
- `MASTER_SOURCE_DIGEST_MISMATCH`
- `MASTER_SEMANTIC_DIGEST_MISMATCH`
- `MASTER_TARGET_RESOLUTION_MISMATCH`
- `MASTER_CAPABILITY_OWNER_MISMATCH`
- `MASTER_CAPABILITY_UNQUALIFIED`
- `MASTER_ADAPTER_VERSION_MISMATCH`
- `MASTER_UNSUPPORTED_OPERATION`
- `MASTER_ACTIVE_CONTENT_BLOCKED`
- `MASTER_UNMODELED_TARGET_BLOCKED`
- `MASTER_KNOWN_LOSS_NOT_ADMITTED`
- `MASTER_UNKNOWN_LOSS_BLOCKED`
- `MASTER_NATIVE_CHANGE_SCOPE_VIOLATION`
- `MASTER_ROLLBACK_EVIDENCE_MISSING`
- `MASTER_ROLLBACK_EVIDENCE_MISMATCH`
- `MASTER_ADAPTER_SOURCE_DIGEST_INVALID`
- `MASTER_ADAPTER_RESULT_DIGEST_INVALID`
- `MASTER_RESULT_REPROJECTION_MISMATCH`
- `MASTER_PRESERVATION_FAILED`
- `MASTER_CANDIDATE_INTAKE_FAILED`
- `MASTER_CANDIDATE_DURABLE_READ_FAILED`
- `MASTER_RESUME_KEY_MISMATCH`
- `MASTER_RESUMED_CANDIDATE_INVALID`
- `MASTER_FINALCANDIDATE_AUTHORITY_NONPROMOTION`
- `MASTER_PUBLICATION_CLASS_AUTHORITY_NONPROMOTION`
- `MASTER_AUTHOR_METADATA_AUTHORITY_NONPROMOTION`
- `MASTER_RELEASE_AUTHORITY_REQUIRED`
- `MASTER_EXTERNAL_AUTHORITY_REQUIRED`
- `MASTER_NATIVE_AUTHORITY_REQUIRED`
- `MASTER_CROSS_OWNER_SEMANTIC_AUTHORITY_FORBIDDEN`
- `MASTER_EVIDENCE_INCOMPLETE`

## 18. Isolated qualification denominator — 44 cases

1. MASTER job/plan mode mismatch fails;
2. missing operation fails;
3. same-format DOCX MASTER is admitted when other authority inputs match;
4. same-format PPTX MASTER is admitted when other authority inputs match;
5. MASTER cross-format request fails and does not fall back to REBUILD;
6. stale PLAN receipt fails;
7. missing effect admission blocks before adapter invocation;
8. revoked effect admission blocks before adapter invocation;
9. effect admission bound to different source fails;
10. effect admission bound to different operation/plan fails;
11. source byte digest mismatch fails;
12. source semantic mismatch fails;
13. stale target-resolution digest fails;
14. selector/target mismatch fails;
15. empty required target set fails;
16. wrong-owner capability fails;
17. stale capability qualification fails;
18. adapter format/version mismatch fails;
19. unsupported operation fails without hidden fallback;
20. active-content SECURE block cannot be bypassed;
21. targeted unmodeled native feature is blocked;
22. unsafe native change scope is rejected;
23. known loss outside admission is blocked;
24. unknown collateral loss remains blocked;
25. missing rollback evidence blocks before mutation;
26. rollback evidence mismatch blocks before mutation;
27. adapter source-SHA lie fails;
28. adapter result-SHA lie fails;
29. independent same-format reprojection mismatch fails;
30. preservation failure blocks candidate success;
31. verified candidate intake is required before receipt success;
32. candidate intake rejection fails closed;
33. successful fresh MASTER ends `MASTER_CANDIDATE_PERSISTED_UNPROVEN`;
34. resume re-reads candidate without replaying mutation;
35. changed source/plan/effect/capability identity invalidates resume;
36. resumed candidate corruption/reprojection/preservation regression fails closed;
37. duplicate reconcile after lost response converges on the persisted candidate;
38. `finalCandidate=true` does not emit final/publication authority;
39. `publicationClass=FINAL` does not emit publication authority from MASTER;
40. job `author`/`producerRef` metadata does not emit consent/delegation/approval authority;
41. proof/version/publish remain downstream of MASTER candidate identity;
42. no hidden network/native/external provider execution occurs in baseline MASTER;
43. Book/Learning/Core/Programming/Prose specialist authority cannot be emitted;
44. cumulative INTAKE -> IDENTIFY -> SECURE -> FORENSICS -> PARSE -> EXTRACT -> UNDERSTAND -> PLAN -> MASTER source/effect/format/loss/persistence/evidence boundaries remain intact.

## 19. Cumulative regression/calibration gate

Implementation must run on one exact executable subject:

- all prior reconstructed spine denominators applicable to the changed bytes;
- 48 frozen REBUILD cases where the shared effect executor is changed;
- all 44 MASTER cases;
- recovered `GovernedCdg2MutationCoordinator` source/result/target/loss checks;
- recovered format-specific portable mutation/preservation suites;
- crash/restart/lost-response duplicate-reconcile tests around candidate persistence;
- proof/version/publish nonpromotion tests;
- owner-boundary negative tests.

Any changed executable subject requires fresh evidence. Historical PASS does not transfer.

## 20. Environment/evidence boundaries

The current source lineage has fresh GitHub-native 225/225 custody, strict Java 21 compile, 31 portable test-class PASS and bounded hosted T13/T14 LibreOffice/Poppler PASS.

Those results do not establish native Microsoft Office fidelity, native target-device behavior, production standing or A-01 PASS. Any implementation change invalidates direct PASS transfer and requires fresh exact-subject qualification.

## 21. Freeze decision

Freeze `DocumentMasterReceipt v1`, same-format MASTER semantics, shared REBUILD/MASTER effect-executor reuse, separate effect admission, candidate-before-proof persistence, exact resume identity, finalCandidate/publication-class/author-metadata nonpromotion and the 44-case isolated denominator.

The prior R4 source-custody blocker is closed, so runtime implementation may now proceed on the current lineage if it preserves these laws and the frozen REBUILD specification.

## Exact next operation

`DOCUMENTS-SPINE-EFFECT-RUNTIME-IMPLEMENTATION-001 — IMPLEMENT ONE SHARED GOVERNED EXISTING-ARTIFACT EFFECT EXECUTOR FOR REBUILD + MASTER, EMITTING DOCUMENTREBUILDRECEIPT V1 / DOCUMENTMASTERRECEIPT V1, WITH SEPARATE EFFECT ADMISSION, SAME-FORMAT MASTER FENCE, CANDIDATE-BEFORE-PROOF PERSISTENCE/RESUME, FINALCANDIDATE/PUBLICATION/AUTHOR-METADATA NONPROMOTION, THEN RUN REBUILD-48 + MASTER-44 ISOLATED CASES AND CUMULATIVE DOCUMENT SPINE REGRESSION ON ONE EXACT SUBJECT.`
