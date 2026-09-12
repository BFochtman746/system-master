# DOCUMENTS-SPINE-REBUILD-DESIGN-LOCK-001

Status: **DESIGN LOCK / SPECIFICATION PASS / RUNTIME BUILD NOT AUTHORIZED UNTIL CURRENT SOURCE CUSTODY**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Capability: `UDM-SPINE-0009` — REBUILD  
Parent forensic packet: `DOCUMENTS-SPINE-REBUILD-FORENSIC-PREP-001`  
Design-lock base: `documents/control-v1@f6f2cd633f98ebb13f170294e51f5d38514dca73`

## 1. Purpose

REBUILD converts one separately admitted effectful `DocumentPlanReceipt v1` into one durable, source-accountable reconstructed candidate artifact. It preserves the recovered governed-mutation strengths: exact source/semantic binding, selector/target equality, open-world loss gating, independently checked result digest, independent CDG reprojection, preservation assessment, candidate-before-proof persistence and restart-safe resume.

REBUILD does not grant effect authority, final-document standing, publication authority, human/author approval, native/external qualification or A-01 standing.

## 2. Required pre-effect inputs

A REBUILD request binds at minimum:

- exact source artifact id + SHA-256;
- immutable identity receipt digest;
- current SECURE receipt digest/standing;
- current PARSE receipt digest + source semantic/native-inventory digests;
- exact `DocumentUnderstandingReceipt v1` digest when required by the plan;
- exact `DocumentPlanReceipt v1` digest;
- exact operation-intent digest;
- exact target-resolution digest;
- exact Documents capability descriptor + qualification ref;
- exact adapter/engine implementation id + digest/version;
- exact preservation profile id + digest;
- exact open-world/loss-gate profile id + digest;
- exact rollback evidence ref + standing;
- **separate effect-admission decision ref + immutable digest** from the shared Core/policy/effect authority;
- contract version.

A missing, stale, revoked, mismatched or wrong-owner effect-admission receipt blocks before adapter invocation.

## 3. `DocumentRebuildReceipt v1`

The immutable receipt contains at minimum:

- `contract_version`
- `job_id`
- `source_artifact_id`
- `source_sha256`
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
- `adapter_implementation_digest`
- `adapter_version`
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
- `resumability_key_digest`
- `diagnostics[]`
- `receipt_digest`

The receipt is committed only after the candidate is durably re-readable through governed artifact custody and all receipt-bound digests match the persisted bytes.

## 4. Candidate-state taxonomy

`candidate_state` is exactly one of:

- `BLOCKED_EFFECT_AUTHORITY`
- `BLOCKED_CAPABILITY`
- `BLOCKED_SOURCE_OR_TARGET_MISMATCH`
- `BLOCKED_LOSS_OR_PRESERVATION`
- `BLOCKED_ROLLBACK_EVIDENCE`
- `MUTATION_FAILED`
- `CANDIDATE_PERSISTENCE_FAILED`
- `CANDIDATE_PERSISTED_UNPROVEN`
- `CANDIDATE_RESUMED_REVALIDATED_UNPROVEN`
- `FAILED_INTEGRITY`

A successful REBUILD stage ends in `CANDIDATE_PERSISTED_UNPROVEN` or `CANDIDATE_RESUMED_REVALIDATED_UNPROVEN`. No REBUILD receipt may emit final/publication/proven standing.

## 5. Effect-admission law

REBUILD is the first document-local mutation boundary. Therefore:

- PLAN evidence alone is insufficient;
- a capability id is insufficient;
- a caller boolean, chat instruction, webhook field, file metadata or user-visible UI state is insufficient;
- effect admission must be an immutable separately owned decision bound to the exact source, plan/intent, principal/delegation context as applicable, policy revision, scope and expiration/revocation standing;
- REBUILD verifies/re-reads the decision but does not create, broaden or reinterpret Core policy authority;
- an expired/revoked/mismatched effect decision fails before mutation;
- downstream proof failure cannot retroactively make the pre-effect admission valid for a different candidate.

## 6. Adapter / capability law

The recovered `SemanticCdg2NativeAdapter` remains reusable substrate where exact operations are implemented and qualified.

Before invocation, REBUILD verifies:

- adapter format matches exact source format/profile;
- capability owner is Documents;
- capability descriptor/version matches the planned capability binding;
- qualification evidence applies to the exact adapter/operation/environment class;
- unsupported operations remain unsupported rather than silently falling back;
- native/external adapters are separately identified and cannot inherit portable qualification.

No adapter may promote its own candidate to final standing.

## 7. Target / source / semantic identity law

Before effect:

- exact source bytes SHA equals PARSE/source/operation source SHA;
- exact source semantic digest equals PLAN/operation semantic SHA;
- exact target-resolution digest matches the current source graph;
- NODE_ID selectors and target ids resolve consistently;
- stale source, stale target or stale semantic identity fails;
- mutable names/ordinals/chat labels remain non-authoritative hints only.

After effect:

- candidate SHA is independently computed;
- adapter-reported source/result SHAs must match independent computation;
- candidate is independently re-projected to the expected document format;
- the reprojection must bind the exact candidate SHA.

## 8. Open-world loss / preservation law

The existing `OpenWorldFeatureDiscovery` loss gate and `NativePartPreservationMap` assessment remain mandatory.

Rules:

- target/native-part patterns intersecting unmodeled content block unless exact support has been qualified;
- expected changed native parts remain the smallest justified bounded allowlist;
- blanket wildcard/path escape/interior wildcard remain forbidden;
- candidate changes outside allowed scope fail preservation;
- known loss must exactly match PLAN/effect-admitted declared loss;
- `lossyAllowed=true` never authorizes unknown/unmeasured collateral loss;
- semantic result success cannot override native-preservation failure;
- portable preservation evidence cannot be renamed native Office/PDF fidelity.

## 9. Candidate-before-proof persistence law

Mutation output is not durable authority until persisted through governed artifact intake.

The sequence is:

1. produce candidate bytes in bounded execution;
2. independently hash/reproject/preservation-check candidate;
3. submit candidate bytes plus exact declared SHA/size/source lineage/operation identity to governed artifact intake;
4. require verified intake disposition;
5. re-read/verify candidate from durable custody when necessary;
6. only then persist the immutable REBUILD receipt.

If candidate intake fails, the REBUILD stage is `CANDIDATE_PERSISTENCE_FAILED`; in-memory bytes are not restart authority.

## 10. Resume / crash-recovery law

`resumability_key_digest` binds:

`source_sha256 + plan_receipt_digest + effect_admission_digest + operation_intent_digest + target_resolution_digest + capability_binding_digest + adapter_implementation_digest + preservation_profile_digest + loss_gate_profile_digest + rollback_evidence_digest + contract_version`.

A prior candidate can be reused only when the exact key matches and the candidate remains durably re-readable.

Resume requires:

- governed verified read of persisted candidate;
- independent candidate SHA check;
- independent CDG reprojection;
- re-evaluation of preservation against the exact source and planned change scope;
- revalidation that the effect-admission identity relevant to the persisted mutation is the one originally bound; no new mutation occurs during resume;
- explicit failure if any durable evidence is missing/corrupt/mismatched.

A lost wakeup or duplicate reconcile pass must converge on the same durable candidate when identities match. It must not replay mutation solely because a transient response was lost.

## 11. Rollback evidence law

Before mutation, rollback evidence must be resolvable, digest-verified and lineage-consistent. A digest string alone is insufficient.

The receipt records rollback evidence identity/standing, but REBUILD does not claim rollback execution. Actual rollback may be byte restoration or a compensating operation and is governed separately by its exact effect/evidence contract.

The source/rollback artifact remains immutable. REBUILD never overwrites the sole recovery copy.

## 12. Active-content / external-effect fence

REBUILD binds current SECURE standing. It may not bypass a SECURE block on active content merely because an adapter can technically parse or mutate the package.

No macro, script, ActiveX, embedded package, external relationship, external converter, network OCR/VLM, native Office/PDF application or provider call may execute implicitly inside baseline REBUILD.

Any such requirement becomes an explicit separately authorized prerequisite with exact engine/provider evidence class.

## 13. Proof handoff law

A persisted REBUILD candidate is handed to later RENDER/COMPARE/VALIDATE/ACCESSIBILITY/SECURITY_PROOF/PROVE stages.

The REBUILD receipt records which proof gates remain required but does not mark them passed. Later proof must reference the exact persisted candidate digest; if candidate bytes change, proof is invalidated.

## 14. Cross-owner fence

REBUILD owns only generic document reconstruction/mutation/candidate semantics.

It must not create or mutate:

- Book manuscript canon, Story Bible, author/editorial/publication state;
- Learning learner/curriculum/mastery/assessment/adaptation/certification state;
- Programming engineering/execution authority;
- Core identity, delegation, policy/effect/routing/placement authority;
- Prose work.

Peer-domain intent may arrive through an explicit contract, but REBUILD output remains Documents-owned candidate evidence.

## 15. Stable reason/error classes

- `REBUILD_PLAN_RECEIPT_MISMATCH`
- `REBUILD_EFFECT_ADMISSION_MISSING`
- `REBUILD_EFFECT_ADMISSION_REVOKED`
- `REBUILD_EFFECT_ADMISSION_MISMATCH`
- `REBUILD_SOURCE_DIGEST_MISMATCH`
- `REBUILD_SEMANTIC_DIGEST_MISMATCH`
- `REBUILD_TARGET_RESOLUTION_MISMATCH`
- `REBUILD_CAPABILITY_OWNER_MISMATCH`
- `REBUILD_CAPABILITY_UNQUALIFIED`
- `REBUILD_ADAPTER_VERSION_MISMATCH`
- `REBUILD_UNSUPPORTED_OPERATION`
- `REBUILD_ACTIVE_CONTENT_BLOCKED`
- `REBUILD_UNMODELED_TARGET_BLOCKED`
- `REBUILD_KNOWN_LOSS_NOT_ADMITTED`
- `REBUILD_UNKNOWN_LOSS_BLOCKED`
- `REBUILD_NATIVE_CHANGE_SCOPE_VIOLATION`
- `REBUILD_ROLLBACK_EVIDENCE_MISSING`
- `REBUILD_ROLLBACK_EVIDENCE_MISMATCH`
- `REBUILD_ADAPTER_SOURCE_DIGEST_INVALID`
- `REBUILD_ADAPTER_RESULT_DIGEST_INVALID`
- `REBUILD_RESULT_REPROJECTION_MISMATCH`
- `REBUILD_PRESERVATION_FAILED`
- `REBUILD_CANDIDATE_INTAKE_FAILED`
- `REBUILD_CANDIDATE_DURABLE_READ_FAILED`
- `REBUILD_RESUME_KEY_MISMATCH`
- `REBUILD_RESUMED_CANDIDATE_INVALID`
- `REBUILD_EXTERNAL_AUTHORITY_REQUIRED`
- `REBUILD_NATIVE_AUTHORITY_REQUIRED`
- `REBUILD_CROSS_OWNER_SEMANTIC_AUTHORITY_FORBIDDEN`
- `REBUILD_EVIDENCE_INCOMPLETE`

## 16. Isolated qualification denominator — 48 cases

1. stale PLAN receipt fails;
2. missing effect-admission receipt blocks before mutation;
3. revoked effect admission blocks before mutation;
4. effect admission bound to different source fails;
5. effect admission bound to different plan/intent fails;
6. source byte digest mismatch fails;
7. source/PARSE semantic mismatch fails;
8. stale target-resolution digest fails;
9. selector/target mismatch fails;
10. empty target set fails;
11. wrong-owner capability fails;
12. stale capability qualification fails;
13. adapter/source format mismatch fails;
14. adapter implementation/version mismatch invalidates reuse;
15. unsupported operation fails without hidden fallback;
16. SECURE active-content block cannot be bypassed;
17. targeted unmodeled native feature is blocked;
18. blanket/unsafe native change scope remains forbidden;
19. known loss outside admitted declaration is blocked;
20. unknown collateral loss remains blocked despite lossy allowance;
21. missing rollback evidence blocks before mutation;
22. rollback digest mismatch blocks before mutation;
23. adapter-reported source SHA lie fails;
24. adapter-reported result SHA lie fails;
25. independent result reprojection mismatch fails;
26. independent preservation failure blocks candidate PASS;
27. candidate changes outside expected native-part scope fail;
28. verified candidate intake is required before REBUILD receipt success;
29. candidate intake rejection yields persistence failure;
30. persisted candidate receipt binds exact result SHA/size/lineage;
31. successful new candidate ends `CANDIDATE_PERSISTED_UNPROVEN`;
32. REBUILD does not mark later render/semantic/package/security/accessibility proofs passed;
33. exact resumability inputs reproduce resume-key digest;
34. changed source invalidates resume;
35. changed plan invalidates resume;
36. changed effect-admission identity invalidates resume for new mutation;
37. changed adapter qualification invalidates resume identity;
38. resumed candidate is re-read from durable custody without replaying mutation;
39. resumed candidate digest corruption fails closed;
40. resumed candidate reprojection mismatch fails closed;
41. resumed candidate preservation regression fails closed;
42. duplicate reconcile after lost response converges on persisted candidate;
43. no hidden network/external/native-provider execution occurs;
44. no active-content execution occurs;
45. portable qualification cannot be promoted to native/external evidence;
46. no raw source/unbounded semantic content leaks to telemetry by default;
47. Book/Learning/Programming/Core/Prose specialist authority cannot be emitted by REBUILD;
48. cumulative INTAKE -> IDENTIFY -> SECURE -> FORENSICS -> PARSE -> EXTRACT -> UNDERSTAND -> PLAN -> REBUILD source identity, effect authority, loss/preservation, persistence and evidence boundaries remain intact.

## 17. Cumulative regression/calibration gate

Future implementation must run on one exact executable subject, where dependency-valid:

- all prior reconstructed spine denominators;
- the 48 REBUILD cases above;
- recovered `GovernedCdg2MutationCoordinator` source/result/target/loss checks;
- recovered candidate intake/resume regressions;
- format-specific DOCX/PPTX/PDF/text-family mutation/preservation tests for implemented capabilities;
- crash/restart/duplicate-reconcile tests around candidate persistence;
- PLAN -> REBUILD effect-authority nonpromotion tests;
- REBUILD -> proof-stage candidate-identity tests;
- owner-boundary negative tests.

Historical PASS cannot be transferred to changed bytes. Native/external/A-01 evidence remains separately scoped.

## 18. Non-claims

This design lock does not establish:

- GitHub-native R4 source custody;
- runtime implementation of `DocumentRebuildReceipt v1`;
- any current mutation execution;
- current exact-subject qualification;
- a Core effect-admission implementation or PASS;
- rollback execution;
- native Microsoft Office/PDF fidelity;
- external-provider/human/author authority;
- final candidate proof;
- publication or production standing;
- A-01 PASS.

## 19. Freeze decision

Retain the recovered governed mutation coordinator, exact source/semantic/target checks, open-world loss gate, independent candidate hashing/reprojection, native-part preservation assessment, candidate-before-proof durable intake and restart-safe candidate reuse.

The missing current authority envelope is frozen as `DocumentRebuildReceipt v1` with a mandatory separately owned effect-admission binding and explicit `UNPROVEN` candidate standing.

Runtime build remains blocked until exact R4 GitHub-native source custody and fresh current-subject baseline qualification exist.

## Exact next operations

Runtime successor, **blocked**:

`DOCUMENTS-SPINE-REBUILD-IMPLEMENTATION-001 — IMPLEMENT DOCUMENT REBUILD RECEIPT V1 + EFFECT-ADMISSION BINDING + CANDIDATE-BEFORE-PROOF PERSISTENCE/RESUME + ROLLBACK/LOSS/PRESERVATION LAW + 48-CASE ISOLATED QUALIFICATION + CUMULATIVE SPINE REGRESSION, BLOCKED ON EXACT R4 GITHUB-NATIVE SOURCE CUSTODY AND FRESH CURRENT-SUBJECT BASELINE QUALIFICATION.`

Independent work-ahead successor, **ready**:

`DOCUMENTS-SPINE-MASTER-FORENSIC-PREP-001 — RECOVER + INVENTORY + ANALYZE UDM-SPINE-0010 MASTER AS THE SIBLING EFFECTFUL EXISTING-ARTIFACT MODE, REUSING THE SHARED MUTATION SUBSTRATE WHILE IDENTIFYING MASTER-SPECIFIC AUTHORITY/PROOF/FINAL-CANDIDATE DIFFERENCES, WITHOUT RUNTIME MUTATION.`
