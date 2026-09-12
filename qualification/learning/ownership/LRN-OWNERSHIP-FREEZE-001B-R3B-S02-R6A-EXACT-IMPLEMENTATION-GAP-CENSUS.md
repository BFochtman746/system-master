# LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R6A — Exact Implementation Gap Census

Status: **FORENSIC IMPLEMENTATION CENSUS COMPLETE / NO BUILD PASS CLAIM / CANONICAL TARGET STILL BLOCKED**  
Owner lane: `SYSTEM_MASTER/LEARNING`  
Semantic owner: `SYSTEM_MASTER/LEARNING::MOD-CURRICULUM-001`  
Date: `2026-09-12`

## 1. Controlling state

Immediately before this unit the reconstruction head was re-read as:

- `learning/ownership-freeze-001b-20260912@5b7b6fb137683fdf329d3b325eba915b05f33b49`.

The exact recovered implementation base is:

- `LRN_CUR_PRODUCTION_BINDING_001_REBOUND_SOURCE.zip`;
- SHA-256 `28e3317e5494c9df7df2f8aefb7f83f7c69fbc9d0ababfb696700542c831edc3`;
- current source manifest `378/378` verified;
- fresh unchanged-source portable baseline `575/575` PASS;
- compile `128/128` PASS.

Those baseline results do not qualify changed S02 bytes.

The controlling current constitution remains **116 requirements / 112 interfaces / 28 semantic objects**, preserving the historical **110/110/26** corpus losslessly.

## 2. Purpose

This unit converts the S02 design lock into the required implementation trace before code mutation:

`requirement/invariant -> current component -> durable state -> interface/contract -> tests -> evidence -> environment -> blocker`.

It uses the exact recovered source rather than inferred or rewritten substrate.

## 3. Exact S02 route census

All eight S02 surfaces exist in the recovered 112-route manifest and are owned by `MOD-CURRICULUM-001`, but every row truthfully reports `source_implementation_status = NOT_IMPLEMENTED_BY_001C`.

| Interface | Type | Current route/port | Exact-source implementation standing |
|---|---|---|---|
| I005 `RequestCurriculumGeneration` | COMMAND | `DOMAIN_PORT / CUR-CMD-PORT-001` | declared route; exact handler absent |
| I068 `ApproveCourseActivation` | COMMAND | `DOMAIN_PORT / CUR-CMD-PORT-001` | declared route; exact handler absent |
| I006 `ActivateCurriculumVersion` | COMMAND | `DOMAIN_PORT / CUR-CMD-PORT-001` | declared route; exact handler absent |
| I007 `RequestCourseRefresh` | COMMAND | `DOMAIN_PORT / CUR-CMD-PORT-001` | declared route; exact handler absent |
| I027 `GetCurriculum` | QUERY | `DOMAIN_PORT / CUR-QRY-PORT-001` | declared route; exact handler absent |
| I029 `GetCourseFreshness` | QUERY | `DOMAIN_PORT / CUR-QRY-PORT-001` | declared route; exact handler absent |
| I034 `CurriculumDraftReady` | EVENT | `DOMAIN_PORT / CUR-EVT-PORT-001` | contract declared; owner event implementation absent |
| I035 `CurriculumActivated` | EVENT | `DOMAIN_PORT / CUR-EVT-PORT-001` | contract declared; owner event implementation absent |

This confirms that a manifest row is not a handler and prevents false completion counting.

## 4. Current reusable component substrate

### 4.1 `curriculum_runtime/service.py`

Current owner-local implementation contains:

- `CurriculumQueryPort.get_course`;
- `CurriculumQueryPort.get_remediation_plan`;
- `CurriculumQueryPort.get_task`;
- `CurriculumCommandPort.request_remediation_plan`;
- `CurriculumService.create_controlled_course`;
- `CurriculumService.request_remediation_plan`.

Adjudication:

- the service/repository ownership split is **REUSE_WITH_CURRENT_CONTRACT_REBIND**;
- `get_course` is useful substrate for I027 but is not yet the exact I027 handler/contract;
- `create_controlled_course` is useful generation behavior substrate but **must not be counted as I005** because its input/output contract does not match the frozen I005 high-level generation-intent semantics;
- no current method implements I068, I006, I007 or I029 exactly;
- no current method may be interpreted as implicit approval or activation authority.

### 4.2 `curriculum_core/models.py`

Current `Course` is immutable dataclass-style Curriculum content with version/state/source metadata. It is reusable content/version substrate, but the S02 lifecycle requires explicit durable request/decision/pointer/lineage records rather than overloading `Course.state` as every workflow truth.

### 4.3 `curriculum_core/refresh.py`

Current refresh core already separates source-freshness diff, semantic course diff, affected-skill calculation and immutable-successor reasoning from learner-state writes.

Adjudication: **REUSE** for S02 freshness/query/refresh analysis, but do not allow it to activate a candidate or mutate Learning mastery. I007 remains workflow intent only; I072 remains a later decision seam; I006 remains sole activation authority.

## 5. Persistence census

The recovered PostgreSQL adapter provides separate `learning_domain` and `curriculum_domain` schemas and these relevant primitives:

- versioned `objects` rows;
- durable `operations` idempotency receipts;
- owner `event_outbox`;
- `put_object` / `get_object` / latest-version reads;
- `append_object_version_checked` with expected-version checking;
- `operation_result` / `record_operation`;
- stable content-derived event identity and `emit`;
- `atomic_mutation`, which can insert one object + operation receipt + optional outbox event in one transaction.

The migration physically creates separate Curriculum tables for objects, operations and event outbox. Physical persistence remains infrastructure; Curriculum remains semantic owner.

### Critical forensic finding

`CurriculumService.create_controlled_course` currently executes:

1. `put_object`;
2. `record_operation`;
3. `emit`;

as separate repository calls/transactions.

That is **not sufficient** for the current S02 atomicity invariant requiring semantic state/version mutation + operation receipt + zero-or-more owner outbox records in one atomic owner unit.

Likewise, `append_object_version_checked` and `atomic_mutation` are individually useful but the exact activation transition may need a stronger composed unit for:

- expected-version/fencing of the active pointer;
- immutable successor activation state;
- supersession lineage;
- approval/validation/readiness references;
- operation receipt;
- exactly one stable I035 outbox event;
- all within one atomic commit.

Therefore these persistence primitives are **REUSE_WITH_REPAIR**, not proof that S02 atomic activation already exists.

## 6. Requirement/invariant -> implementation trace

### `LRN-064-C` — Curriculum readiness preflight

- current component substrate: Curriculum service + shared dependency adapters + refresh/source-quality substrate;
- durable state needed: version-pinned generation/activation request and explicit readiness standing references;
- contracts: I005/I006/I007 plus external rights/accessibility/source/dependency references;
- test binding: S02-Q034..Q043 plus launch/readiness owner-fence cases;
- current evidence: exact source + R3 design lock;
- environment: portable Python only;
- blocker: exact shared-provider/live contract execution not admitted; fail closed.

### `LRN-138-C` — immutable consequential decision trace

- current component substrate: operations table + versioned objects + outbox;
- durable state needed: generation request, approval decision receipt, activation decision/lineage, refresh intent;
- contracts: I005/I068/I006/I007/I034/I035;
- tests: S02-Q017..Q024, Q044..Q049, Q054..Q060;
- blocker: exact S02 handlers and owner atomic unit not built.

### `LRN-140-C` — fail-closed Curriculum semantics

- current component substrate: typed service errors/shared authority adapter concepts;
- durable state needed: explicit UNKNOWN/BLOCKED/DEGRADED standing or typed rejection evidence where policy requires;
- contracts: I005/I006/I007/I029 plus shared dependencies;
- tests: S02-Q034..Q043;
- blocker: current exact handler/error mapping not built; external dependencies remain unproven.

## 7. Interface-specific build classification

### I005 — `BUILD_FROM_REUSABLE_GENERATION_SUBSTRATE`

Required new exact handler must create/dedupe one durable high-level Curriculum generation request with stable semantic operation identity, pinned LearningGoal/source/accessibility constraints and restart rediscovery state. It may reference/request generic execution but must not own generic job lifecycle or impersonate I066.

### I068 — `BUILD_NEW_OWNER_DECISION_RECEIPT`

No exact current implementation exists. Build immutable approval/non-approval decision receipt only. It must have **zero activation side effect**. Actor/authorization truth remains external/shared. Synthetic fixtures may test contract behavior but cannot become evidence of real approval.

### I006 — `BUILD_NEW_SOLE_ACTIVATION_TRANSITION`

No exact current implementation exists. This is the only S02 operation allowed to move the active CurriculumVersion pointer/state. It must consume exact I068 approval plus current validation/readiness/source/rights/accessibility/dependency standing and atomically stage I035 after successful commit.

### I007 — `BUILD_FROM_REFRESH_SUBSTRATE`

Current refresh core is reusable. The exact handler must persist/dedupe refresh workflow intent against a pinned active version and must never mutate the active version or activate a candidate.

### I027 — `REBIND_QUERY`

`CurriculumQueryPort.get_course` is useful but requires exact I027 version/as-of/owner contract behavior and explicit artifact-reference boundary.

### I029 — `BUILD_QUERY_FROM_REFRESH/FRESHNESS_SUBSTRATE`

Exact query absent. Must return explicit version-pinned FRESH/STALE/UNKNOWN or typed dependency standing; missing evidence cannot silently become FRESH.

### I034 — `BUILD_STABLE_OWNER_OUTBOX_EVENT`

Must be staged only after the corresponding durable draft state commits. Draft-ready is not validation PASS, approval or activation.

### I035 — `BUILD_STABLE_OWNER_OUTBOX_EVENT`

Must be staged only by successful I006 atomic activation commit. No I068/I072/transport shortcut may emit authoritative activation.

## 8. Negative/collision boundaries retained

The exact build must preserve all repaired R2/R3 collision rules:

- I068 cannot activate;
- I072 cannot activate;
- I005 cannot become I066;
- I007 cannot own generic job truth;
- only I006 changes active Curriculum state;
- only successful I006 can stage I035;
- no transport/chat/webhook field can become approval, rights, freshness or activation authority;
- no Book/Documents/Programming specialist semantic writer may enter this path;
- shared/Core service references remain dependencies, not local duplicate canonical stores.

## 9. Qualification denominator

The frozen S02 denominator remains **60 cases** and is not reduced by this census.

Current standing:

- exact recovered unchanged-source baseline: 575/575 PASS;
- S02 changed-subject cases executed: **0/60**;
- current S02 build PASS claims: **none**;
- live PostgreSQL concurrency/restart: **not executed**;
- shared provider execution: **not executed**;
- native/A-01/production: **not executed**.

## 10. Freeze / blocker result

This implementation census is frozen with:

- S02 exact interface surfaces accounted: **8/8**;
- exact route rows recovered: **8/8**;
- exact handlers currently materialized: **0/8**;
- reusable owner-local component substrate identified: **PASS**;
- persistence primitives identified: **PASS_WITH_REPAIR_REQUIRED**;
- atomic activation implementation: **GAP**;
- canonical repo-native target: **BLOCKED_SOURCE_CUSTODY__CANONICAL_REPO_NATIVE_TARGET_UNADMITTED**;
- changed-subject qualification: **NOT YET EXECUTED**.

## 11. One dependency-valid successor

`LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R6B — RECONSTRUCT EXACT S01B PATCH ON VERIFIED 28e3317e SOURCE -> MATERIALIZE S02 OWNER-LOCAL PATCH AGAINST THE ARCHIVE-NATIVE MODULE LAYOUT -> RUN 60/60 ISOLATED S02 + FRESH 575-BASE CUMULATIVE OWNER/ROUTE/ATOMIC REGRESSION -> PRESERVE PATCH/DIGEST/EVIDENCE; DO NOT PROMOTE TO CANONICAL REPO TARGET UNTIL TARGET ADMISSION IS RESOLVED`

This successor is intentionally owner-local and isolated. It must not invent a canonical repository destination or claim external/shared/native/production evidence.

## 12. Evidence not claimed

No consent, participant response, real user approval, mastery, retention, transfer, psychometric validity, instructional efficacy, SME approval, certification/accreditation, live PostgreSQL, real shared-provider behavior, native iPhone, A-01 or production evidence is claimed.
