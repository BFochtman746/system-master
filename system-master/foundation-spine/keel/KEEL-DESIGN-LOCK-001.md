# CORE Intent / Keel Design Lock 001

## Standing

`CORE-KEEL-DESIGN-LOCK-001` freezes the fresh Foundation/Spine Intent / Keel contract before runtime build. It is derived from `SYSTEM-SPECIFICATION.md`, the 32/32 recovery census in `KEEL-RECOVERY-INVENTORY-001.md`, and current neighboring authority boundaries. Historical donor evidence remains provenance only.

## 1. Canonical authority objects

### `GoalIdentityV1`

Create-once immutable fields:

- `goalId` — globally unique stable intent identity;
- `ownerSystemId` — the shared Keel owner identifier, not a specialist semantic owner;
- `createdByPrincipalRef` — opaque exact Principal reference;
- `createdAtEvidenceRef` — opaque time/evidence reference;
- `subjectContractRef` — exact Contracts & Versioning subject/version/digest reference.

A `goalId` cannot be rebound to another creator, owner or contract identity.

### `GoalRevisionV1`

Immutable published revision fields:

- `goalId`;
- monotonic `revision`;
- `goalRevisionId` — content-addressed or otherwise deterministic exact revision identity;
- `parentGoalRevisionRef` — exact parent revision id + content digest, nullable only for root intent;
- `problemStatement`;
- ordered `desiredOutcomes`;
- ordered `requirements`;
- ordered `constraints`;
- ordered `successCriteria`;
- `delegationCeiling`;
- `resourceCeiling`;
- `humanControlRequirements`;
- `actionEnvelope`;
- ordered bounded opaque `references`;
- `approvedByEvidenceRef` when governance requires approval;
- `contentDigest` over the entire canonical revision payload;
- `canonicalizationId`;
- exact Contracts gate receipt ref/digest;
- `lineageEvidenceRefs`.

Once `GOVERNED`, a revision is immutable. Correction requires a new revision or new goal lineage, never in-place rewrite.

### `RequirementDeclV1`

Fields:

- `requirementId` unique within revision;
- `kind` — `MUST | SHOULD | MAY`;
- bounded declarative text or typed predicate ref;
- optional specialist owner reference;
- required evidence class/ref declarations;
- `inheritedFromRef` when inherited.

Keel stores the requirement declaration. Specialist semantic truth remains with the referenced specialist owner.

### `ConstraintDeclV1`

Fields:

- `constraintId`;
- `hardness` — `HARD | SOFT`;
- `constraintType`;
- canonical bounded value or opaque policy ref;
- comparison/refinement operator;
- `inheritedFromRef` when inherited.

A child may strengthen a hard constraint, never weaken/remove it. A soft constraint may be changed only with an explicit disposition reason and cannot be silently dropped.

### `SuccessCriterionDeclV1`

Fields:

- `criterionId`;
- declarative predicate/ref;
- required evidence class;
- required evaluator/validator ref when applicable;
- bounded threshold/tolerance declaration when applicable.

This object declares what would count as success. It cannot assert that success occurred.

## 2. Ceiling objects — upper bounds, never grants

### `DelegationCeilingV1`

Bounded declarative maximums such as permitted descendant roles/classes, max delegation depth, max risk/autonomy class, allowed target classes and explicit forbidden delegation classes. It carries no capability token, grant id, standing/revocation state or concrete assignee.

Identity/Principal/Delegation is the only owner that can mint and validate concrete grants/actor chains. A concrete grant must be proven to fit beneath the current exact Keel ceiling, but a valid Keel ceiling does not itself authorize anything.

### `ResourceCeilingV1`

Bounded maxima/constraints such as permitted resource classes, cost/time/storage/compute ceilings and policy refs. It contains no reservation id, balance, consumption ledger, fairness priority, lease, reservation standing or grant.

Resource Admission & Budgeting owns actual reservation/grant/accounting truth. A resource grant may not exceed Keel ceilings, but a Keel ceiling does not reserve capacity.

### `ActionEnvelopeV1`

Fields:

- bounded set of allowed action/effect **classes** or owner-defined opaque action refs;
- bounded set of forbidden action/effect classes/refs;
- optional risk/approval/HITL requirement refs.

Rules:

1. `forbidden` always wins;
2. a child allowed set must be a subset/refinement of the parent allowed set where parent is explicit;
3. a child forbidden set must be a superset of the parent forbidden set;
4. absence from Keel `forbidden` is not permission;
5. presence in Keel `allowed` is not route admission, Effect Authority or execution permission.

## 3. Human-control semantics

`HumanControlRequirementV1` declares **when** human review/confirmation/approval is required and what evidence class would satisfy it. It never stores a fabricated participant response or treats a requirement as evidence.

A governed revision requiring human approval may become `GOVERNED` only when an external approval/evidence receipt is supplied and bound to the exact candidate revision digest under the configured governance rule. Keel verifies receipt binding/interface shape; the external authority owns whether the human/approval evidence is real and valid.

No automation may synthesize the human response or approval receipt.

## 4. Goal lifecycle and publication

Lifecycle:

`DRAFT -> GOVERNED -> SUPERSEDED | RETIRED`

Rules:

- `DRAFT` is mutable workspace material and **not authority**; it must not be emitted as a governed goal ref.
- publication creates a new immutable `GOVERNED` revision through one durable canonical append;
- exactly one non-superseded governed revision may be the current pointer for a goal under the reference adapter;
- supersession never deletes history;
- `RETIRED` prevents creation of new descendant work from that goal lineage but cannot erase already committed work/effects/evidence;
- reopening requires a new governed revision/lineage under explicit policy, not mutation of retired history.

`approvedByEvidenceRef` is evidence binding, not principal/approval authority.

## 5. Parent -> child non-expansion validator

`ValidateGoalRefinement(parent, childCandidate)` is deterministic over immutable inputs and returns `KeelRefinementReceiptV1`.

A child is admissible only if all applicable checks pass:

- exact parent revision id + content digest match;
- parent standing is currently acceptable for descendant creation;
- all inherited hard requirements/constraints are present or provably strengthened;
- no hard constraint is weakened or removed;
- delegation ceiling is equal or narrower;
- resource ceiling is equal or narrower;
- allowed action surface is equal or narrower;
- forbidden action surface is equal or broader;
- HITL requirements are preserved or strengthened for equal/higher-risk scope;
- specialist requirement ownership references remain intact;
- child cannot reinterpret an opaque external receipt/reference into stronger authority;
- child cannot clear an unknown/error standing by omission.

When a constraint type lacks a registered deterministic refinement comparator, the result is `UNKNOWN_COMPARATOR` and the child fails closed. Free-form text comparison is never treated as proof of non-expansion.

## 6. Canonical durable reference authority

The first portable Keel implementation uses an append-only, hash-chained journal plus reconstructable projections, following the already-qualified Root/Contracts durability pattern while preserving Keel semantics.

Canonical mutating commands:

- `CreateGoalIdentity`;
- `PublishGoalRevision`;
- `SupersedeGoalRevision`;
- `RetireGoal`.

Every canonical mutation binds:

- `commandId`;
- deterministic `requestHash`;
- expected Keel registry revision;
- exact Contracts gate receipt ref/digest;
- exact principal/evidence references required by the command;
- prior event hash and event hash.

Rules:

1. validate complete request and all current-state prerequisites before append;
2. same `commandId + requestHash` returns the same semantic result;
3. same command id with different request hash fails closed;
4. acknowledgment follows forced durable append in the portable reference adapter;
5. replay reconstructs identical goal/current-revision state;
6. corrupt/truncated/hash-invalid replay fails closed;
7. caches/current pointers are projections only;
8. no bearer credential/private key/secret value may enter canonical Keel state;
9. single-host reference writer exclusion does not claim distributed/network-filesystem writer safety;
10. native sudden-power-loss and production database durability require separate environment evidence.

## 7. Contracts & Versioning integration

All governed Keel subject/receipt schemas must be registered with the fresh Contracts & Versioning authority. Publication requires a current structural/version gate receipt for the exact Keel contract subject and digest.

A Contracts gate receipt proves schema/version standing only. It cannot substitute for Keel non-expansion validation, Principal standing, human approval evidence, resource authority or effect permission.

A changed Keel schema/content digest invalidates prior exact-subject qualification/compatibility evidence under the normal evidence rules.

## 8. `GovernedGoalRefV1` and downstream Work Chain binding

Downstream systems receive a bounded immutable reference, not the entire mutable Keel projection:

- `goalId`;
- `goalRevision`;
- `goalRevisionId`;
- `goalContentDigest`;
- `keelValidationReceiptDigest`;
- exact Keel contract subject/version/digest;
- optional parent goal revision ref;
- observed Keel registry revision.

Work & Project Control owns any subsequent `workId` and work lifecycle. Planning owns plan state. Downstream work must bind the exact governed goal revision instead of a moving `latest` pointer.

A stale `GovernedGoalRefV1` may remain historical provenance but cannot be assumed current when a downstream boundary requires current intent standing; consumers must re-read/revalidate when policy requires currentness.

## 9. `KeelValidationReceiptV1`

Immutable receipt fields:

- exact `goalId/revision/revisionId/contentDigest`;
- parent ref/digest when any;
- exact contract gate receipt digest;
- exact validator id/version;
- refinement standing `VALID | INVALID | UNKNOWN`;
- ordered reason codes;
- exact compared ceiling/constraint digest set;
- Keel registry revision observed;
- deterministic receipt digest.

This receipt proves only the structural/semantic validity of the governed intent envelope under Keel rules. It cannot contain or grant:

- capability/execution grants;
- resource reservations/grants;
- route/placement decisions;
- runtime lease/fence/job/attempt authority;
- Effect Authority;
- human response truth;
- specialist-domain truth.

## 10. Bounded rejection/error taxonomy

- `UNKNOWN_GOAL`
- `GOAL_IDENTITY_CONFLICT`
- `UNKNOWN_PARENT_REVISION`
- `PARENT_DIGEST_MISMATCH`
- `PARENT_NOT_GOVERNED`
- `REVISION_CONFLICT`
- `CONTENT_DIGEST_CONFLICT`
- `CONTRACT_GATE_MISSING`
- `CONTRACT_GATE_STALE_OR_REJECTED`
- `HARD_CONSTRAINT_REMOVED`
- `HARD_CONSTRAINT_WEAKENED`
- `SOFT_CONSTRAINT_UNDISPOSITIONED`
- `DELEGATION_CEILING_EXPANDED`
- `RESOURCE_CEILING_EXPANDED`
- `ALLOWED_ACTION_EXPANDED`
- `FORBIDDEN_ACTION_REMOVED`
- `HITL_REQUIREMENT_WEAKENED`
- `SPECIALIST_OWNER_REBOUND`
- `UNKNOWN_COMPARATOR`
- `APPROVAL_EVIDENCE_REQUIRED`
- `APPROVAL_RECEIPT_BINDING_MISMATCH`
- `SECRET_FIELD_FORBIDDEN`
- `COMMAND_REPLAY_CONFLICT`
- `KEEL_REGISTRY_REVISION_CONFLICT`
- `KEEL_JOURNAL_CORRUPT`
- `GOAL_RETIRED`

Unknown critical refinement state is never converted to allow.

## 11. Isolated qualification denominator — 56 cases

Freeze before runtime build: **56 isolated adversarial cases**.

### Goal identity/revision/publication — 10

1. create goal identity;
2. exact create replay;
3. conflicting identity reuse rejects;
4. publish first governed revision;
5. exact revision replay;
6. same revision different digest rejects;
7. stale expected revision rejects without mutation;
8. rejected publication leaves canonical revision/current pointer unchanged;
9. supersession preserves immutable history;
10. retired goal rejects new descendant publication.

### Constraints / non-expansion — 12

11. child preserves hard constraint;
12. child strengthens hard constraint;
13. child removes hard constraint -> reject;
14. child weakens hard constraint -> reject;
15. soft constraint preserved;
16. changed soft constraint with explicit disposition passes when policy allows;
17. silently dropped soft constraint -> reject;
18. unknown comparator -> fail closed;
19. exact parent revision/digest required;
20. moving latest pointer cannot replace exact parent ref;
21. unknown parent standing -> fail closed;
22. child cannot clear inherited unknown/error by omission.

### Delegation/resource/action/HITL ceilings — 14

23. equal delegation ceiling passes;
24. narrower delegation ceiling passes;
25. expanded delegation ceiling rejects;
26. Keel ceiling contains no concrete grant/assignee/revocation standing;
27. equal resource ceiling passes;
28. narrower resource ceiling passes;
29. expanded resource ceiling rejects;
30. Keel resource ceiling contains no reservation/grant/accounting truth;
31. narrower allowed actions pass;
32. expanded allowed actions reject;
33. added forbidden action passes;
34. removed inherited forbidden action rejects;
35. forbidden action dominates allowed action;
36. weakened required HITL condition rejects.

### Human/evidence/specialist/ownership fences — 8

37. approval requirement without evidence receipt rejects governed publication;
38. approval receipt wrong candidate digest rejects;
39. receipt reference cannot be treated as fabricated human response;
40. success criterion declaration cannot mark itself satisfied;
41. specialist requirement owner reference is preserved through refinement;
42. child cannot rebind specialist owner to Keel;
43. Keel validation receipt cannot grant Identity/Resource/Route/Placement/Runtime/Effect authority;
44. secret-like canonical field rejects before append.

### Journal / replay / concurrency — 8

45. replay reconstructs exact current revision;
46. command replay same request returns same semantic result;
47. command id different request conflicts;
48. corrupt journal fails closed;
49. truncated journal fails closed;
50. hash-chain break fails closed;
51. concurrent same revision converges to one canonical identity;
52. concurrent conflicting revision payloads yield one canonical result plus conflict.

### Work Chain / contracts / exact evidence — 4

53. publication requires exact admitted Keel contract gate;
54. rejected/stale contract gate blocks publication without append;
55. `GovernedGoalRefV1` binds exact goal revision/digest and contains no Work/Plan/Job truth;
56. historical donor PASS cannot satisfy changed fresh Keel subject qualification.

## 12. Cumulative regression/calibration before freeze

A Keel build candidate may freeze only when the **same exact candidate SHA/tree** passes:

- all 56 Keel isolated cases;
- current System Root qualification;
- O-WP-001 identity qualification;
- O-WP-002 identity/proofing qualification;
- current Identity Delegation 36-case qualification;
- current Contracts & Versioning 48-case qualification;
- selected F-WP-002/F-WP-005 donor regression or exact equivalent tests for behavior intentionally reused;
- owner-boundary/reflection checks proving no Work/Project, Orchestration, Resource, Routing, Placement, Runtime, Effect or specialist-domain authority was introduced.

Any performance/calibration threshold must be frozen before execution. A-01/native/production evidence remains a separate class and cannot be inferred from hosted portable PASS.

## 13. Build packet and stop fences

Dependency-valid successor:

**`CORE-KEEL-BUILD-001 — DURABLE GOAL IDENTITY/REVISION + NON-EXPANDING CONSTRAINT/DELEGATION/RESOURCE/ACTION/HITL ENVELOPE + GOVERNED GOAL REF + 56-CASE ISOLATED QUALIFICATION + CUMULATIVE ROOT/IDENTITY/CONTRACTS REGRESSION`**.

Stop and emit a cross-owner dependency rather than widening Keel if implementation would require Keel to mint/own a concrete capability grant, resource reservation, work/project lifecycle, plan, route/placement decision, runtime lease/fence/job/attempt, effect permission/receipt, human response, or specialist-domain truth.
