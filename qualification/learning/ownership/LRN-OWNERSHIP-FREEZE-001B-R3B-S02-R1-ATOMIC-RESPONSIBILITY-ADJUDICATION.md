# LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R1 — Residual Atomic Responsibility Adjudication

Status: **MATERIAL COLLISIONS CONFIRMED / S02 BUILD PAUSED / LOSSLESS REPAIR DESIGN-LOCKED**  
Owner lane: `SYSTEM_MASTER/LEARNING`  
Date: `2026-09-12`

## Authority and exact parent

This unit supersedes the build authorization portion of `R3B-S02` without discarding its forensic inventory. The exact parent re-read immediately before mutation was:

- `learning/ownership-freeze-001b-20260912@aeab5e37de8a6cec319f21a24f607f4b56924757`
- tree `8e49cc292dfe7bb3f71947ac46254bfda127eb76`

The historical source denominator remains exactly `110 P0 requirements / 110 interfaces / 26 semantic objects`. The current active reconstruction before this repair remains `113 requirements / 112 interfaces / 28 semantic objects`. This unit found residual **atomic responsibility collisions** inside that already lossless attribution model. Attribution completeness therefore must not be mistaken for atomic collision freedom.

## RECOVER / INVENTORY evidence

The exact preserved 001C ledgers were re-read as row authority:

- `LRN_OWNERSHIP_FREEZE_001C_REQUIREMENTS.csv`
- `LRN_OWNERSHIP_FREEZE_001C_INTERFACES.csv`
- `LRN_OWNERSHIP_FREEZE_001C_OBJECTS.csv`
- `LRN_OWNERSHIP_FREEZE_001C_TEST_OBLIGATIONS.csv`

The exact admitted owner-local source was independently recovered from Library and hash-checked again:

- `LRN_CUR_PRODUCTION_BINDING_001_REBOUND_SOURCE.zip`
- observed SHA-256 `28e3317e5494c9df7df2f8aefb7f83f7c69fbc9d0ababfb696700542c831edc3`
- this matches the R2D admitted source identity.

No runtime mutation is authorized by merely recovering these bytes.

## ANALYZE — confirmed residual collisions

### C-001 — duplicate Curriculum activation authority

001C currently defines both:

- `I006 ActivateCurriculumVersion` -> `Pins active immutable curriculum version`; and
- `I068 ApproveCourseActivation` -> `Activates version and supersedes prior active version`.

Both are `MOD-CURRICULUM-001` commands and both can be read as authoritative activation mutations. That violates the requested atomic responsibility rule even though the semantic owner is the same.

### C-002 — generation/compilation stage ambiguity

001C currently defines:

- `I005 RequestCurriculumGeneration` -> creates the Curriculum generation request and generic-job reference; and
- `I066 RequestCourseCompilation` -> creates a background course-compilation request.

Without an explicit stage/ref boundary, a caller can interpret either command as the authoritative way to start the same work, undermining semantic idempotency and durable request identity.

### C-003 — refresh path contains an activation escape hatch

The refresh family is otherwise separable:

- `I071` marks source/claim freshness changes;
- `I007` starts refresh work;
- `I070` produces the semantic refresh diff;
- `I072` records accept/postpone/reject.

However 001C currently says I072 activation is separate **unless accept policy explicitly bundles**. That conditional bundle leaves a second possible activation path outside the explicit activation responsibility and conflicts with `LRN-104`'s explicit v1 user activation gate.

### C-004 — compound requirement LRN-138 crosses Learning and Curriculum authority

`LRN-138` is currently owned by `MOD-LEARNING-001` but its single normative sentence covers both:

- Curriculum activation decision trace; and
- Learning mastery/adaptation/evidence-admission/qualification-package decision trace.

It is lossless but not atomic.

### C-005 — compound requirement LRN-140 crosses Learning and Curriculum fail-closed semantics

`LRN-140` is currently Learning-owned but combines dependency/evidence/integrity failures with rights/accessibility/source-quality failures that drive Curriculum readiness and activation. Shared authorities still own their own truth; each Learning-system semantic owner must own its own fail-closed interpretation/output.

### C-006 — compound readiness requirement LRN-064 crosses launch authorities

`LRN-064` currently says course/assessment/job launch SHALL preflight versions, artifacts, rights, accessibility and dependencies while assigning the requirement to Learning. It combines learner/assessment launch semantics, Curriculum course-generation/activation readiness, and external generic-job readiness. A single Learning semantic owner is too broad.

## ADJUDICATE — exact lossless repair

### Interface responsibility repair

The 112-interface denominator is retained. No interface is deleted and no new interface is invented.

1. **I005 RequestCurriculumGeneration** owns the high-level Curriculum generation workflow intent only. It creates/deduplicates one durable Curriculum generation request from a versioned LearningGoal reference plus source/accessibility constraints. It may request generic job execution by stable external reference but never owns job lifecycle or compilation output.
2. **I066 RequestCourseCompilation** owns the downstream compiler-stage request only. It MUST consume an admitted `generation_request_ref` and versioned `source_plan_ref`/compiler policy. It cannot independently mint a second high-level generation intent from the same goal.
3. **I068 ApproveCourseActivation** owns the explicit v1 user approval decision only. It records an immutable approval/rejection decision receipt bound to the exact CurriculumVersion, validation report, goal version and policy/input versions. **It has no activation side effect.** No human approval is fabricated by tests.
4. **I006 ActivateCurriculumVersion** is the sole Curriculum state-transition authority that pins an ACTIVE immutable CurriculumVersion and supersedes the prior active pointer. It requires the exact admissible I068 approval receipt plus current validation/readiness/rights/accessibility/source standing. It cannot infer approval from chat/webhook metadata.
5. **I072 AcknowledgeCourseRefresh** records accept/postpone/reject of an immutable refresh diff. In v1 it **never activates**. Accept may make a candidate eligible for I068 review, after which I006 remains the only activation transition.
6. `I035 CurriculumActivated` remains the only frozen activation event and is staged only after I006 commits the active-version transition.

This creates one canonical chain:

`generation request (I005) -> compiler-stage request (I066) -> validation (I067) -> diff when refresh (I070) -> refresh decision when applicable (I072) -> explicit approval decision (I068) -> activation transition (I006) -> post-commit activation event (I035)`.

### Requirement responsibility repair

The historical source denominator remains unchanged; three compound active rows are superseded losslessly by six atomic children. The provisional active requirement denominator therefore becomes **116**, pending generated-delta qualification/refreeze.

- `LRN-064-L` (source parent `LRN-064`, owner `MOD-LEARNING-001`): learner/assessment action launch preflight for Learning-owned state; external facts remain references.
- `LRN-064-C` (source parent `LRN-064`, owner `MOD-CURRICULUM-001`): Curriculum generation/validation/activation/offline readiness preflight; generic job readiness remains external.
- `LRN-138-L` (source parent `LRN-138`, owner `MOD-LEARNING-001`): immutable decision traces for mastery change, adaptive recommendation, evidence admission/rejection and qualification-package formation.
- `LRN-138-C` (source parent `LRN-138`, owner `MOD-CURRICULUM-001`): immutable decision traces for consequential Curriculum generation/validation/refresh approval/activation decisions.
- `LRN-140-L` (source parent `LRN-140`, owner `MOD-LEARNING-001`): Learning-owned actions expose UNKNOWN/BLOCKED/DEGRADED for missing learner evidence/integrity/dependency truth; no weaker silent fallback.
- `LRN-140-C` (source parent `LRN-140`, owner `MOD-CURRICULUM-001`): Curriculum-owned generation/validation/refresh/activation exposes UNKNOWN/BLOCKED/DEGRADED for missing source/rights/accessibility/dependency truth; no weaker silent fallback.

The three superseded parents remain provenance records; no normative sentence is dropped.

## DESIGN LOCK

The previous `R3B-S02` build authorization is **paused** until the above delta is machine-applied and qualified against the preserved 001C ledgers. S02's seven-interface inventory remains useful, but activation implementation must additionally bind the repaired I068 approval seam before I006 can be safely materialized.

The next unit is:

`LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R2 — MACHINE-APPLIED ATOMIC OWNER DELTA + 116/112/28 LOSSLESS/COLLISION QUALIFICATION + S02 DENOMINATOR REPAIR`

R2 must prove at minimum:

- original 110/110/26 historical source identities remain represented;
- active requirements become exactly 116 with three superseded parent rows and six atomic children;
- active interfaces remain exactly 112 IDs;
- active semantic objects remain exactly 28;
- no command other than I006 owns the Curriculum activation transition;
- I068 is approval-decision-only;
- I072 cannot activate;
- I005 and I066 have distinct workflow-stage identities;
- no Book/Documents/Programming/Core semantic authority is imported;
- shared rights/job/artifact/identity/authorization truth remains external/fail-closed.

Only after R2 passes may the repaired S02 build denominator be frozen and implementation resume.

## Evidence not claimed

No consent, approval response, participant response, mastery, retention, transfer, psychometric validity, instructional efficacy, SME approval, certification, live PostgreSQL, external provider, native iPhone, A-01 or production evidence is claimed.