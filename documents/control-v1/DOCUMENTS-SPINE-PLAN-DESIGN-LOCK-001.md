# DOCUMENTS-SPINE-PLAN-DESIGN-LOCK-001

Status: **DESIGN LOCK / SPECIFICATION PASS / RUNTIME BUILD NOT AUTHORIZED UNTIL CURRENT SOURCE CUSTODY**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Capability: `UDM-SPINE-0008` — PLAN  
Parent forensic packet: `DOCUMENTS-SPINE-PLAN-FORENSIC-PREP-001`  
Design-lock base: `documents/control-v1@811e01b84a4b164f061bf64970b4e56695615273`

## 1. Purpose

PLAN turns admitted document intent and exact source/UNDERSTAND evidence into a deterministic, source-accountable, capability-constrained execution plan. It resolves stable document targets, binds a `DocumentOperationContract`, carries known limitations/loss constraints and required proof gates, and records blocked prerequisites.

PLAN does not execute the operation and does not grant consequential-effect authority. A valid plan is evidence that a document operation is well-formed and semantically applicable under its exact denominator; it is not permission to mutate, publish, call an external provider, invoke a native engine, or cross an owner boundary.

The recovered `DocumentSpineExecutionPlan` and `DOC-OP-1` substrate are retained. This design lock adds the missing UNDERSTAND/capability/target-resolution/planning authority envelope.

## 2. Required input contract

A PLAN request binds at minimum:

- exact job id and document-spine mode;
- exact source artifact id and `source_sha256`;
- immutable identity receipt digest;
- immutable PARSE receipt digest and source semantic digest;
- immutable `DocumentUnderstandingReceipt v1` digest when semantic understanding contributes;
- exact operation contract / `intent_digest`, or an explicit read-only marker;
- requested target selectors/ids;
- exact Documents capability ids plus immutable descriptor/qualification refs;
- planning profile id + digest;
- planning ruleset id + digest;
- planner implementation id + immutable implementation digest/version;
- preservation/loss profile id + digest;
- proof profile id + digest;
- bounds profile id + digest;
- contract version;
- prerequisite evidence refs for any separately authorized native/external/human boundary.

Read-only plans may omit an understanding receipt only when the declared operation requires no semantic interpretation beyond already admitted source/PARSE evidence. That omission itself is part of plan identity.

Any mismatch in source, semantic projection, understanding, operation intent, capability standing, target resolution, planning profile/ruleset, proof profile, bounds, or contract version invalidates reuse.

## 3. `DocumentPlanReceipt v1`

The immutable receipt contains at minimum:

- `contract_version`
- `job_id`
- `mode`
- `source_artifact_id`
- `source_sha256`
- `identity_receipt_digest`
- `parse_receipt_digest`
- `source_semantic_sha256`
- `understanding_receipt_digest` when required
- `operation_contract_schema`
- `operation_intent_digest` or `READ_ONLY`
- `target_resolution_digest`
- `resolved_target_ids[]`
- `target_source_anchor_digest`
- `capability_bindings[]`
- `planning_profile_id`
- `planning_profile_digest`
- `planning_ruleset_id`
- `planning_ruleset_digest`
- `planner_implementation_id`
- `planner_implementation_digest`
- `planner_version`
- `preservation_profile_digest`
- `proof_profile_digest`
- `bounds_profile_digest`
- `risk_class`
- `visual_impact`
- `loss_standing`
- `expected_changed_native_parts[]`
- `declared_losses[]`
- `rollback_evidence_ref` when required
- `required_proof_gates[]`
- `blocked_prerequisites[]`
- `plan_standing`
- `effect_authorization_standing`
- `limitations[]`
- `diagnostics[]`
- `receipt_digest`

Large target/evidence payloads remain content-addressed artifacts. Raw source bytes or unbounded semantic content are not copied into plan telemetry by default.

## 4. Plan standing taxonomy

`plan_standing` is one of:

- `READY_FOR_SEPARATE_EFFECT_ADMISSION`
- `READ_ONLY_READY`
- `BLOCKED_SEMANTIC_STANDING`
- `BLOCKED_CAPABILITY_UNAVAILABLE`
- `BLOCKED_TARGET_AMBIGUITY`
- `BLOCKED_PRESERVATION_RISK`
- `BLOCKED_ROLLBACK_EVIDENCE`
- `BLOCKED_EXTERNAL_PREREQUISITE`
- `BLOCKED_NATIVE_PREREQUISITE`
- `BLOCKED_HUMAN_PREREQUISITE`
- `BOUNDS_EXCEEDED`
- `FAILED_INTEGRITY`

`READY_FOR_SEPARATE_EFFECT_ADMISSION` means only that the document-local plan is well-formed and eligible to be presented to the separately owned policy/effect boundary. It is not mutation authorization.

## 5. Effect-authorization fence

`effect_authorization_standing` is exactly:

- `NOT_REQUIRED_READ_ONLY`, or
- `REQUIRED_NOT_GRANTED_BY_PLAN`.

PLAN never emits `AUTHORIZED`.

For effectful operations:

- Core/shared policy/effect authority remains the authority source;
- any approval/decision receipt is an external prerequisite to mutation and may be referenced but not created by PLAN;
- a caller-supplied boolean, chat instruction, webhook metadata or capability id cannot become effect authority;
- passing PLAN qualification does not qualify the later mutation/effect path.

## 6. Reuse of `DocumentSpineExecutionPlan` and `DOC-OP-1`

The recovered immutable execution plan remains useful substrate and retains its existing invariants:

- effectful `MASTER` / `REBUILD` requires an operation;
- `READ` / `EXTRACT` forbids a mutation operation;
- capability ids are mandatory;
- job/mode/target/capability/limitation inputs are immutable;
- its deterministic digest remains an input to `DocumentPlanReceipt v1`.

The recovered `DocumentOperationContract` remains the canonical document-operation intent contract for this stage until explicitly versioned. Its exact source artifact/semantic binding, operation type, selectors, intended effect, parameters, risk, rollback identity, expected changed native parts, visual impact, loss declaration, final-candidate standing and proof-gate set remain intact.

The PLAN receipt wraps/rebinds these contracts; it does not weaken or silently rewrite them.

## 7. UNDERSTAND-to-PLAN binding law

When UNDERSTAND contributes, PLAN binds the exact `DocumentUnderstandingReceipt v1` and evaluates its standing/claims only for the requested operation.

Rules:

- `SOURCE_OBSERVED` and admissible deterministic-derived claims may support deterministic target/operation selection;
- `HEURISTIC_INFERRED` or `MODEL_INFERRED` claims remain inference and may support a plan only under an explicit planning profile that allows that class/risk;
- inference never becomes source/native truth because it is used by PLAN;
- material `AMBIGUOUS`, `ENGINE_DISAGREEMENT`, `REVIEW_REQUIRED`, `BOUNDS_EXCEEDED`, unsupported or provisional-unknown evidence blocks the affected operation unless the operation is demonstrably outside that uncertainty and the exclusion is durable evidence;
- upstream omissions/loss/unknown-feature limitations propagate into plan limitations;
- a new or superseding UNDERSTAND receipt invalidates plan reuse whenever it changes material operation evidence.

## 8. Target-resolution authority

PLAN must deterministically reconcile operation selectors and explicit target ids before issuing a ready receipt.

`TargetResolution v1` contains at minimum:

- exact source/PARSE/UNDERSTAND identity;
- selector set digest;
- requested target-id set digest;
- resolved target ids;
- each target's CDG/native source-anchor refs;
- resolution ruleset id/digest;
- unresolved/ambiguous selectors;
- unknown-feature intersection refs;
- resolution standing;
- resolution digest.

Rules:

- every resolved target must exist in the exact current CDG graph;
- stale ids fail;
- selectors and requested target ids must resolve consistently under the declared reconciliation rule;
- a mismatch is `BLOCKED_TARGET_AMBIGUITY`, not an arbitrary choice;
- mutable filenames, UI ordinals, chat labels or webhook fields are hints only until resolved to immutable source-bound target ids;
- an unmodeled native feature intersecting the target set remains blocked by the existing open-world loss gate unless exact qualified semantic/native support exists.

## 9. Capability binding law

Every capability entry in the plan binds:

- capability id;
- owner system id (`DOCUMENTS` for document-operation capability in this lane);
- capability descriptor digest/version;
- qualification subject/ref and standing relevant to the exact implementation class;
- environment/evidence class when relevant;
- known prerequisites/limitations.

A job's capability-id membership is necessary but not sufficient. A plan cannot self-authorize a missing, stale, wrong-owner or unqualified capability by naming its id.

Native/external adapters remain separate capability/evidence classes and cannot be represented as portable qualification.

## 10. Loss / preservation precondition law

PLAN is the final document-local pre-effect boundary for known loss/preservation analysis.

Rules:

- `lossyAllowed=false` rejects any demonstrated operation path requiring known semantic/native loss;
- `lossyAllowed=true` permits only the exact declared, policy-admissible known losses; it is not permission for unknown loss;
- unknown/unmodeled content intersecting expected mutation scope blocks unless explicitly qualified;
- expected changed native-part patterns must be the smallest justified set and retain the existing ban on blanket `*`, path escape and interior wildcards;
- upstream EXTRACT/UNDERSTAND omissions relevant to the operation must appear in plan limitations or block standing;
- required preservation evidence/round-trip gates cannot be weakened because a capability is difficult to execute;
- mutation outside the planned native-part scope is a later integrity failure, not an automatic expansion of plan scope.

## 11. Rollback law

For effectful operations, the recovered requirement for exact rollback artifact identity remains.

PLAN additionally requires evidence that the referenced rollback source/candidate is resolvable through the governed artifact boundary at planning time. A digest string alone is not proof of retrievability.

A stale/missing/mismatched rollback artifact yields `BLOCKED_ROLLBACK_EVIDENCE`. PLAN does not execute rollback.

## 12. Proof-profile law

The recovered automatic proof gates remain minimums:

- effectful operations: package + semantic + security + provenance;
- visual-impact operations: rendered proof;
- final candidates: all proof gates.

A versioned proof profile may add stricter gates but may not remove recovered mandatory gates. The exact proof-profile digest becomes part of plan identity.

Native/external/publication/A-01 proof requirements remain separately scoped and cannot be marked passed by PLAN.

## 13. External / native / human prerequisite law

PLAN may record a blocked prerequisite; it may not satisfy it by assertion.

Examples:

- native Office/PDF engine fidelity required;
- external OCR/conversion/provider required;
- human/author approval required by another owner;
- publication approval required;
- A-01/native-device qualification required.

A blocked prerequisite is an immutable typed record with owner, required evidence class and reason. No hidden provider/native call is permitted inside PLAN.

## 14. Cross-owner semantic fence

PLAN owns generic Documents operation planning only. It may consume explicit contracts from peers but cannot create their canonical truth.

Forbidden promotions include:

- Book manuscript canon, Story Bible, editorial/author/publication decisions;
- Learning curriculum/mastery/assessment/adaptation/certification decisions;
- Programming executable/code correctness or engineering authority;
- Core identity, delegation, policy/effect, routing or placement authority;
- Prose work.

A peer may request a Documents operation through an explicit service interface; the resulting Documents plan remains document-operation evidence, not peer-domain state.

## 15. Persistence, idempotency and invalidation

Receipt identity is based on:

`job_id + mode + source_sha256 + parse_receipt_digest + understanding_receipt_digest_or_explicit_none + execution_plan_digest + operation_intent_digest_or_READ_ONLY + target_resolution_digest + sorted(capability_binding_digests) + planning_profile_digest + planning_ruleset_digest + planner_implementation_digest + preservation_profile_digest + proof_profile_digest + bounds_profile_digest + contract_version`

Rules:

- exact deterministic inputs reproduce the same plan receipt digest;
- changed source/upstream receipt/operation/target/capability/ruleset/proof/bounds/contract creates a new receipt;
- prior plan receipts remain immutable evidence;
- caches are advisory until exact identity/digest verification;
- read-after-write freshness is never assumed;
- retryable failures are only separately classified transient infrastructure failures; content/semantic/policy/target errors are permanent for the exact input set;
- retry layers must not be stacked around non-idempotent later effects.

## 16. Stable reason/error classes

- `PLAN_JOB_ID_MISMATCH`
- `PLAN_MODE_MISMATCH`
- `PLAN_SOURCE_DIGEST_MISMATCH`
- `PLAN_PARSE_RECEIPT_MISMATCH`
- `PLAN_SEMANTIC_DIGEST_MISMATCH`
- `PLAN_UNDERSTAND_RECEIPT_MISMATCH`
- `PLAN_UNDERSTAND_STANDING_INCOMPATIBLE`
- `PLAN_OPERATION_REQUIRED`
- `PLAN_OPERATION_FORBIDDEN_READ_ONLY`
- `PLAN_OPERATION_INTENT_MISMATCH`
- `PLAN_TARGET_REQUIRED`
- `PLAN_TARGET_NOT_FOUND`
- `PLAN_TARGET_SELECTOR_MISMATCH`
- `PLAN_TARGET_AMBIGUOUS`
- `PLAN_UNMODELED_TARGET_BLOCKED`
- `PLAN_CAPABILITY_NOT_JOB_BOUND`
- `PLAN_CAPABILITY_OWNER_MISMATCH`
- `PLAN_CAPABILITY_QUALIFICATION_STALE`
- `PLAN_CAPABILITY_UNAVAILABLE`
- `PLAN_KNOWN_LOSS_NOT_ALLOWED`
- `PLAN_UNKNOWN_LOSS_BLOCKED`
- `PLAN_NATIVE_CHANGE_SCOPE_INVALID`
- `PLAN_ROLLBACK_EVIDENCE_MISSING`
- `PLAN_PROOF_PROFILE_WEAKENING_FORBIDDEN`
- `PLAN_EXTERNAL_PREREQUISITE_REQUIRED`
- `PLAN_NATIVE_PREREQUISITE_REQUIRED`
- `PLAN_HUMAN_PREREQUISITE_REQUIRED`
- `PLAN_EFFECT_AUTHORITY_NOT_GRANTED_BY_PLAN`
- `PLAN_CROSS_OWNER_SEMANTIC_AUTHORITY_FORBIDDEN`
- `PLAN_BOUNDS_EXCEEDED`
- `PLAN_EVIDENCE_INCOMPLETE`

## 17. Isolated qualification denominator — 44 cases

1. job id mismatch fails;
2. mode mismatch fails;
3. source digest mismatch fails;
4. stale PARSE receipt fails;
5. source semantic digest mismatch fails;
6. required UNDERSTAND receipt mismatch fails;
7. read-only path may omit UNDERSTAND only under declared sufficient-source profile;
8. material incompatible UNDERSTAND standing blocks affected operation;
9. effectful MASTER requires operation;
10. effectful REBUILD requires operation;
11. READ forbids mutation operation;
12. EXTRACT forbids mutation operation;
13. operation intent digest mismatch fails;
14. effectful plan requires target set;
15. stale target id fails;
16. selector/target exact reconciliation passes deterministically;
17. selector/target conflict yields target ambiguity, not arbitrary selection;
18. mutable UI/chat/file-name hint cannot become target authority without immutable resolution;
19. target source-anchor digest is retained;
20. unmodeled native target is blocked by open-world loss gate;
21. job-bound capability id is required;
22. wrong-owner capability fails;
23. stale capability descriptor/qualification invalidates plan reuse;
24. naming a capability id cannot grant effect authority;
25. exact deterministic inputs reproduce target-resolution digest;
26. exact deterministic inputs reproduce plan receipt digest;
27. planning ruleset change invalidates reuse;
28. planner implementation change invalidates reuse;
29. proof profile change invalidates reuse;
30. bounds profile change invalidates reuse;
31. effectful operation requires exact rollback evidence;
32. missing/unresolvable rollback evidence blocks;
33. known loss is rejected when `lossyAllowed=false`;
34. allowed lossy operation requires exact declared known losses;
35. unknown/unmodeled loss cannot be legalized by `lossyAllowed=true`;
36. blanket or unsafe native-part patterns remain forbidden;
37. mandatory recovered proof gates cannot be weakened;
38. visual impact preserves rendered-proof requirement;
39. final-candidate plan preserves all-proof requirement;
40. external/native/human prerequisite is recorded as blocked rather than executed/forged;
41. PLAN receipt for effectful work always says effect authority is required and not granted by PLAN;
42. no raw source/unbounded semantic content leaks to telemetry by default;
43. Book/Learning/Programming/Core specialist authority cannot be emitted by generic Documents PLAN;
44. cumulative INTAKE -> IDENTIFY -> SECURE -> FORENSICS -> PARSE -> EXTRACT -> UNDERSTAND -> PLAN source identity, loss/preservation, evidence and authority boundaries remain intact.

## 18. Cumulative regression/calibration gate

Future implementation must run on one exact executable subject, where dependency-valid:

- prior INTAKE/IDENTIFY/SECURE/FORENSICS/PARSE/EXTRACT/UNDERSTAND denominators;
- the 44 PLAN cases above;
- recovered `DocumentSpineExecutionPlan` invariants;
- recovered `DOC-OP-1` operation-contract invariants;
- CDG target-resolution and unknown-feature loss-gate regressions;
- capability descriptor/qualification binding regressions;
- rollback/preservation/loss/proof-profile regressions;
- no-hidden-native/external-effect tests;
- PLAN -> REBUILD/MASTER authority-nonpromotion tests;
- owner-boundary negative tests.

Historical PASS cannot be transferred to changed bytes. Native/external/A-01 evidence remains separately scoped.

## 19. Non-claims

This design lock does not establish:

- GitHub-native R4 source custody;
- runtime implementation of `DocumentPlanReceipt v1`;
- current exact-subject qualification;
- consequential-effect authorization;
- actual rollback execution;
- complete capability availability;
- native Microsoft Office/PDF fidelity;
- external provider or human authority;
- Book/Learning/Programming/Core specialist semantic authority;
- A-01 PASS;
- publication or production readiness.

## 20. Freeze decision

The recovered immutable execution-plan and `DOC-OP-1` operation-contract substrate are retained. The missing layer is a source/UNDERSTAND/capability/target-resolution-bound `DocumentPlanReceipt v1` with explicit loss/preservation prerequisites and an absolute fence between planning and effect authorization.

Runtime build remains blocked until exact R4 GitHub-native source custody and fresh current-subject baseline qualification are established.

## Exact next operations

Runtime successor, **blocked**:

`DOCUMENTS-SPINE-PLAN-IMPLEMENTATION-001 — IMPLEMENT DOCUMENT PLAN RECEIPT V1 + UNDERSTAND/CAPABILITY/TARGET-RESOLUTION BINDING + LOSS/PRESERVATION PRECONDITIONS + EFFECT-AUTHORIZATION FENCE + 44-CASE ISOLATED QUALIFICATION + CUMULATIVE SPINE REGRESSION, BLOCKED ON EXACT R4 GITHUB-NATIVE SOURCE CUSTODY AND FRESH CURRENT-SUBJECT BASELINE QUALIFICATION.`

Independent work-ahead successor, **ready**:

`DOCUMENTS-SPINE-REBUILD-FORENSIC-PREP-001 — RECOVER + INVENTORY + ANALYZE UDM-SPINE-0009 REBUILD, INCLUDING PLAN-TO-EFFECT HANDOFF, MUTATION/RECONSTRUCTION AUTHORITY, CANDIDATE PERSISTENCE, LOSS/PRESERVATION, ROLLBACK AND PROOF PRECONDITIONS, WITHOUT RUNTIME MUTATION.`
