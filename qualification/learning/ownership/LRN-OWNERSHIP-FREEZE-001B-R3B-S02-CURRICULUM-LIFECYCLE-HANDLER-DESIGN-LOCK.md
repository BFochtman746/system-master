# LRN-OWNERSHIP-FREEZE-001B-R3B-S02 — Curriculum Lifecycle Handler Design Lock

Status: **DESIGN_LOCK_COMPLETE / OWNER-LOCAL BUILD AUTHORIZED AGAINST EXACT ADMITTED SOURCE / CANONICAL REPO-NATIVE APPLICATION BLOCKED_SOURCE_CUSTODY / SHARED DEPENDENCIES FAIL-CLOSED**  
Owner lane: `SYSTEM_MASTER/LEARNING`  
Internal semantic owner: `SYSTEM_MASTER/LEARNING::MOD-CURRICULUM-001`  
Date: `2026-09-12`

## 1. Controlling parent and pre-mutation re-read

This unit continues the user-authorized Learning ownership reconstruction. It does not resume the obsolete Batch-07-only plan and it does not mutate the older `learning/control-v1` line.

Exact reconstruction head re-read immediately before this unit:

- branch: `learning/ownership-freeze-001b-20260912`
- parent commit: `5298146027c2a0babde4d266fdbb88d8e60ec240`
- parent tree: `84399c804afc94cf536e57e0b376eb66a6208aa4`
- parent unit: `LRN-OWNERSHIP-FREEZE-001B-R3B-S01C-CANONICAL-SOURCE-RECONCILIATION`
- S01C standing: canonical repo-native application is `BLOCKED_SOURCE_CUSTODY__CANONICAL_REPO_NATIVE_TARGET_UNADMITTED`; independent owner-local forensics/design/build against the exact admitted source remain permitted.

The reconstruction constitution remains frozen at the lossless historical denominator `110 P0 requirements / 110 interfaces / 26 semantic objects`, represented by the current `113 / 112 / 28` active split model. Curriculum remains an internal Learning-system truth owner, not a separate Topology peer.

## 2. RECOVER — exact source ledgers and prior design locks

S02 selection was recovered from the exact preserved 001C row ledgers rather than inferred from names or ordinal convenience:

- `LRN_OWNERSHIP_FREEZE_001C_REQUIREMENTS.csv`
- `LRN_OWNERSHIP_FREEZE_001C_INTERFACES.csv`
- `LRN_OWNERSHIP_FREEZE_001C_OBJECTS.csv`
- `LRN_OWNERSHIP_FREEZE_001C_TEST_OBLIGATIONS.csv`
- `LRN_OWNERSHIP_FREEZE_001D_REFREEZE.md`

The current R2C persistence/route design lock is controlling and is not reopened here. In particular:

- Curriculum semantic state remains in `curriculum_domain`;
- Core persistence may supply physical durability but cannot become a Curriculum semantic writer;
- the minimum mutating atomic unit is owner-state mutation/version + operation/idempotency receipt + zero-or-more owner event-outbox records;
- transport retries cannot create a second semantic command;
- `CurriculumVersion` is immutable once ACTIVE;
- generic durable job truth remains Core-owned; Curriculum may hold only its domain request/reference/intent and the external canonical job reference;
- Curriculum events are emitted only after durable owner-state commit through the Curriculum outbox binding;
- unresolved shared contracts fail closed rather than being locally emulated as production truth.

Exact admitted bounded source substrate remains:

- `LRN_CUR_PRODUCTION_BINDING_001_REBOUND_SOURCE.zip`
- SHA-256 `28e3317e5494c9df7df2f8aefb7f83f7c69fbc9d0ababfb696700542c831edc3`
- source-tree manifest standing: `378/378 PASS`

S01B established that owner-local patching/qualification against this exact source can create changed-subject evidence without pretending canonical repo-native activation. That evidence boundary is preserved for S02.

## 3. INVENTORY — exact S02 semantic slice

### 3.1 Primary interfaces

S02 is the first Curriculum lifecycle vertical slice downstream of the LearningGoal slice and is frozen to exactly seven owner interfaces:

| Interface | Type | Frozen responsibility |
|---|---|---|
| `I005 RequestCurriculumGeneration` | COMMAND | From a valid versioned LearningGoal/reference and readiness preflight, create an idempotent Curriculum domain generation request and obtain/reference generic job execution without owning job lifecycle. |
| `I006 ActivateCurriculumVersion` | COMMAND | Explicitly activate one READY_FOR_ACTIVATION immutable CurriculumVersion under expected-goal/version and readiness gates; never silently edit the active version. |
| `I007 RequestCourseRefresh` | COMMAND | From an active CurriculumVersion and freshness trigger, create/deduplicate a refresh request that may produce a candidate successor; never mutate the active version in place. |
| `I027 GetCurriculum` | QUERY | Return immutable/version-pinned CurriculumVersion metadata/graph references; artifact bytes remain external. |
| `I029 GetCourseFreshness` | QUERY | Return version-pinned freshness state, stale claims/sections and recommended action; UNKNOWN may not be reported as FRESH. |
| `I034 CurriculumDraftReady` | EVENT | After durable draft state exists, announce that a Curriculum draft is reviewable; it is not activation. |
| `I035 CurriculumActivated` | EVENT | After activation commits, announce the newly active immutable CurriculumVersion; prior versions remain historical references. |

No Practice, AssessmentAttempt, mastery, retention, transfer, learner-evidence, Book, Documents, Programming or generic Core semantics enter this slice.

### 3.2 Primary canonical state

The primary owner object is:

- `LRN-E005 CurriculumVersion` — owner `MOD-CURRICULUM-001`, `IMMUTABLE_WHEN_ACTIVE`, lifecycle `DRAFT -> VALIDATING -> READY_FOR_REVIEW -> READY_FOR_ACTIVATION -> ACTIVE -> SUPERSEDED | RETIRED | ARCHIVED`, with `REJECTED` side terminal. ACTIVE bytes/semantics are never edited in place.

S02 may reference or create version-bound Curriculum children/projections only according to their already frozen owner contracts, including:

- `LRN-E002 SkillDefinition`;
- `LRN-E003 Criterion`;
- `LRN-E004 PrerequisiteGraph`;
- `LRN-E006 LessonDefinition`;
- `LRN-E022 SourceClaimMap`;
- `LRN-E023 CourseValidationReport`;
- `LRN-E024 CourseFreshnessProjection`.

This design lock does not create a new canonical `CurriculumGenerationJob` object. Generation/refresh request bookkeeping is a supporting owner-local request/operation record; generic job authority remains external/Core-owned.

### 3.3 Core requirement set for this slice

The recovered requirement ledger binds S02 directly to these Curriculum truths:

- `LRN-002` versioned observable skill/criterion decomposition;
- `LRN-003` typed prerequisite graph with cycle validation;
- `LRN-005` curriculum blueprint mapping skills to lessons/practice/assessment/remediation/maintenance;
- `LRN-006` immutable activated Curriculum versions with supersedes lineage;
- `LRN-007` durable autonomous research-to-course work producing dossier/draft while generic job authority owns generic execution truth;
- `LRN-008` collaborative Chat construction using the same domain objects;
- `LRN-009` explicit source/freshness state;
- `LRN-095..LRN-100` source plan, source quality, claim provenance, contradiction gating, curriculum coverage and content-risk classification;
- `LRN-104` explicit user activation gate after reviewable validation/major changes;
- `LRN-105` semantic refresh diff before activation;
- `LRN-106` immutable activated course/lesson/assessment versions;
- `LRN-107` rights/offline fail-closed preflight;
- `LRN-108` accessible-alternate completeness gate;
- `LRN-110` unresolved material content conflict -> WAITING_FOR_REVIEW/BLOCKED rather than fabricated certainty;
- `LRN-138` immutable decision trace for consequential Curriculum activation;
- `LRN-140` no silent fallback when required authority/dependency/readiness facts are unavailable.

Shared requirements remain dependency facts, not Curriculum ownership transfers.

## 4. ANALYZE — material collision and failure surfaces

### 4.1 LearningGoal / Curriculum boundary

`LearningGoal` remains Learning-owned. Curriculum receives only a typed, version-bound goal reference/context sufficient for curriculum work. Curriculum cannot:

- rewrite goal title/objective/horizon/priority;
- pause/resume/complete the LearningGoal;
- synthesize identity or authorization standing;
- treat a stale goal version as current.

Activation may require an `expected_goal_version` or equivalent bound context solely as a precondition/fence. That does not confer LearningGoal write authority.

### 4.2 Generic job boundary

I005 and I007 can request long-running work, but Curriculum does not own:

- generic job lifecycle/state;
- generic scheduling/placement;
- generic checkpoint/cancel/resume authority;
- generic job progress truth.

A durable Curriculum request can be committed with an outbox/dispatch intent before external job acceptance. If a dispatch response is lost, reconciliation must rediscover the already-created semantic request by stable operation/request identity and may not create a second Curriculum request or assume read-after-write freshness.

### 4.3 Source / artifact / rights / accessibility boundary

Curriculum owns the interpretation that a course is READY/BLOCKED for Curriculum purposes, but it may not invent external source custody, artifact bytes, rights standing, accessibility truth, model qualification or generic evidence/provenance truth.

Required external facts enter through typed references/receipts. Missing, stale, unknown or mismatched standing fails closed into an explicit typed state/error. `UNKNOWN` never aliases `PASS`, `FRESH`, `AUTHORIZED` or `ACCESSIBLE`.

### 4.4 Activation authority

The recovered requirement set requires explicit user activation in v1 after validation results and material changes are reviewable. S02 therefore freezes:

- no implicit activation when generation finishes;
- no implicit activation when validation passes;
- no activation from mutable chat/webhook metadata;
- no invented consent/approval bit;
- activation command must carry/reference an admissible current approval/authorization context and the exact CurriculumVersion/validation standing;
- stale approval or a version mismatch fails closed;
- the ACTIVE transition and `I035` outbox record commit atomically with the Curriculum owner mutation.

This design does not claim that a human approval was actually obtained in qualification.

## 5. TARGETED RESEARCH decision

No new external research is required for S02 before design lock. The material design questions for this slice are already resolved by the current user-authorized owner constitution, exact recovered 001C ledgers, R2C persistence/CQEE/route lock and the exact-source S01 pattern. External educational research could not legitimately change the owner, idempotency, versioning, source-custody or fail-closed authority rules being locked here.

Research is deferred until a later slice exposes a genuinely unresolved instructional/psychometric/content-design question whose answer could change architecture. This avoids research theater and preserves the user's rule that exhaustive research be used only where it can materially alter design.

## 6. ADJUDICATE — why S02 is this slice

S02 is selected as the dependency-valid next handler slice because:

1. S01 established versioned LearningGoal command authority and its post-commit event;
2. `I005-I007` are the first Curriculum commands that consume goal/version state and establish Curriculum lifecycle work;
3. `I027/I029` provide the corresponding owner-valid read surfaces needed to observe Curriculum/freshness without importing generic job truth;
4. `I034/I035` provide the corresponding post-commit domain events;
5. this vertical slice can be designed and owner-locally qualified while unresolved shared contracts remain fail-closed;
6. it advances Curriculum explicitly, as required by current user authority, without prematurely entering Practice/Assessment/mastery semantics.

No owner collision is admitted by this slice.

## 7. DESIGN LOCK — command, persistence and event semantics

### 7.1 Common command envelope

Each state-changing S02 command binds:

- exact interface/version;
- canonical owner `MOD-CURRICULUM-001`;
- actor/principal/delegation reference as externally validated input where required;
- `client_operation_id` or equivalent stable semantic operation key;
- semantic payload digest;
- exact referenced LearningGoal/CurriculumVersion revisions;
- required policy/readiness receipt versions;
- correlation/causation references;
- explicit typed failure semantics.

Caller-supplied owner, readiness PASS, rights PASS, accessibility PASS, source-freshness PASS, job completion or approval standing is non-authoritative unless validated through its canonical contract.

### 7.2 I005 RequestCurriculumGeneration

A valid first invocation must:

1. validate the exact referenced LearningGoal version/context without obtaining Learning write authority;
2. perform the frozen readiness preflight using current typed dependency receipts;
3. create exactly one owner-local generation request/operation outcome for one semantic operation identity;
4. stage any generic-job request in the same durable semantic unit through outbox/dispatch intent rather than dual-writing remote job truth;
5. return/reconcile the stable Curriculum request and external job reference when available.

Same operation ID + same semantic payload returns the same semantic result. Same operation ID + different semantic payload fails with the frozen duplicate-conflict semantics. A provider/job timeout or lost response does not justify a second semantic request.

### 7.3 I006 ActivateCurriculumVersion

Activation requires all of the following to be true for the exact target version:

- target exists and is owner-valid;
- lifecycle is `READY_FOR_ACTIVATION`;
- target version is immutable for activation;
- validation report is current and non-blocking for the intended activation;
- material source contradiction state is resolved or explicitly non-blocking under the frozen policy;
- source/freshness standing meets the target policy;
- required rights metadata is known/permitted;
- required accessible alternates are complete for the declared scope;
- expected LearningGoal/current-active-Curriculum fence versions match;
- required approval/authorization context is current and admissible.

The commit atomically:

1. transitions the exact target to ACTIVE;
2. marks the previously active CurriculumVersion SUPERSEDED where applicable without rewriting it;
3. records the operation/decision trace and version lineage;
4. stages `I035 CurriculumActivated` with stable event identity.

Any stale/missing/unknown blocker leaves the previous active version intact.

### 7.4 I007 RequestCourseRefresh

Refresh is a candidate-successor workflow:

- active source CurriculumVersion is pinned;
- freshness trigger/reason and source-policy revision are bound;
- equivalent active refresh request is deduplicated by semantic identity;
- generic job execution remains external;
- output is a candidate/draft successor and semantic diff path, never an in-place mutation of the active CurriculumVersion;
- no candidate becomes ACTIVE without the explicit I006 activation gate.

### 7.5 Queries

`I027 GetCurriculum` returns version-pinned owner state and references. Omitted version means a deterministic current selector under the owner contract, not an arbitrary storage latest row. Artifact/media bytes remain external.

`I029 GetCourseFreshness` returns an as-of/version-bound freshness projection. Stale dependency evidence or unavailable source state yields `UNKNOWN`, `STALE`, a typed dependency failure, or equivalent frozen standing; it may never be coerced to FRESH.

### 7.6 Events

`I034 CurriculumDraftReady` and `I035 CurriculumActivated` are durable owner events staged only after the corresponding owner state is committed. Delivery is at-least-once compatible; event identity is stable; consumers deduplicate. Transport does not become event semantic owner.

I034 means reviewable draft only. It never implies validation PASS, approval, activation, mastery or learning effectiveness.

I035 means the Curriculum ACTIVE transition committed. It never implies learner mastery, retention, transfer, certification or external publication.

## 8. Explicit typed dependency/failure binding

At minimum the S02 implementation must preserve these current typed failure relationships rather than raw provider exceptions:

- version/concurrency conflict -> canonical `VersionConflict` contract;
- semantic duplicate conflict -> canonical `DuplicateOperationConflict` contract;
- shared service unavailable -> canonical `DependencyUnavailable` contract;
- missing accessibility alternative -> `I049 AccessibilityAlternativeMissing`;
- insufficient source freshness -> `I053 SourceFreshnessInsufficient`;
- unresolved source contradiction -> `I097 SourceContradictionUnresolved`;
- activation blocker -> `I098 CourseActivationBlocked`;
- rights unknown/missing -> current shared rights contract(s), never a Curriculum-invented rights PASS.

These typed contracts can be serialized by transport but their ownership/meaning cannot be silently rewritten.

## 9. Formal isolated qualification denominator — 52 cases

S02 freezes **52 isolated changed-subject cases** before owner-local build. These are obligations, not PASS claims.

| Case range | Count | Required coverage |
|---|---:|---|
| `S02-Q001..Q007` | 7 | One exact signature/route/semantic-contract case for each of I005/I006/I007/I027/I029/I034/I035. |
| `S02-Q008..Q015` | 8 | Owner/no-bypass fences: Curriculum cannot write LearningGoal/mastery/job/artifact/rights truth; Core/transport/caller cannot write Curriculum state; ACTIVE cannot be edited in place; event transport cannot become semantic owner. |
| `S02-Q016..Q023` | 8 | Idempotency/replay: same-key same-payload replay; same-key different-payload rejection; duplicate generation/refresh suppression; activation replay convergence; lost dispatch response rediscovery; duplicate event delivery; restart replay; no stacked semantic retry. |
| `S02-Q024..Q032` | 9 | Version/concurrency/lifecycle: stale goal version; stale Curriculum expected version; invalid activation state; prior ACTIVE preserved on failed activation; ACTIVE immutability; supersedes lineage; concurrent activation conflict; stale refresh base; deterministic restart outcome. |
| `S02-Q033..Q042` | 10 | Fail-closed readiness/source/rights/accessibility: unknown rights, denied rights, missing alternate, stale source, unknown freshness, unresolved contradiction, outdated validation report, blocked validation, stale approval context, unavailable shared dependency. |
| `S02-Q043..Q048` | 6 | Job/outbox/recovery: request + outbox atomicity, no generic job table ownership, job timeout leaves recoverable durable request, lost wakeup/restart rediscovery, no duplicate job semantic request after ambiguous response, event only after owner commit. |
| `S02-Q049..Q052` | 4 | Query/event consistency: I027 exact version, I029 UNKNOWN-not-FRESH behavior, I034 draft-not-active semantics, I035 active-with-prior-lineage semantics. |

Acceptance is zero unexpected owner writes, zero silent fallback, zero duplicate semantic effects, deterministic typed failure, and exact-subject evidence for all 52 cases.

## 10. Cumulative qualification / calibration gate

After S02 build on the exact admitted source subject:

1. run all 52 S02 isolated cases;
2. rerun the current inherited owner/route/persistence cumulative floor represented by the S01B `142/142` exact-patched-subject suite, adapted only where the same exact changed source requires a new merged denominator;
3. rerun the deterministic owner-seam campaign, including the prior 100-run/700-check no-owner-bypass class where applicable;
4. compile/static-check every changed surface;
5. record the exact source ZIP digest, reconstructed patch digest, changed-file digests, test command/environment and blocker classes;
6. do not promote historical 481/575 labels unless those exact tests are actually recovered and rerun on the exact S02 changed subject.

No arithmetic aggregate is claimed before the harness produces a deduplicated actual executed denominator.

## 11. Build authorization and blockers

### Authorized now

`LRN-OWNERSHIP-FREEZE-001B-R3B-S02A — CURRICULUM LIFECYCLE OWNER-LOCAL BUILD PATCH AGAINST EXACT ADMITTED SOURCE + 52-CASE ISOLATED QUALIFICATION`

S02A may mutate only an owner-local reconstruction of the exact admitted source ZIP and produce a reproducible patch/carrier plus exact changed-subject evidence. It may not activate unresolved shared/Core routes as if real external contracts were present.

### Still blocked

Canonical repository-native application remains:

`BLOCKED_SOURCE_CUSTODY__CANONICAL_REPO_NATIVE_TARGET_UNADMITTED`

Shared service activation remains:

`BLOCKED_EXTERNAL_FOUNDATION_CONTRACT_ADMISSION`

A successful owner-local S02A therefore proves the exact owner-local changed subject only. It does not establish canonical repository application, live PostgreSQL, real generic job provider, real source/artifact/rights provider, native-device, production or human-use standing.

## 12. Freeze decision

S02 is **DESIGN_LOCK_COMPLETE** with:

- exact seven-interface slice selected from the frozen 112-interface registry;
- Curriculum ownership preserved without creating a new peer;
- LearningGoal, generic job, artifact, source/provenance, rights/accessibility and Core boundaries explicit;
- immutable Curriculum activation and refresh-successor semantics frozen;
- source/rights/accessibility/approval uncertainty fail-closed;
- 52-case isolated denominator frozen before build;
- cumulative regression/calibration gate defined;
- one dependency-valid successor bound: `LRN-OWNERSHIP-FREEZE-001B-R3B-S02A`.

## 13. Evidence explicitly not claimed

This design lock creates no participant consent, learner response, mastery, retention, transfer, psychometric validity, instructional effectiveness, SME approval, certification/accreditation, author approval, real user approval, live PostgreSQL, real external job/source/artifact/rights/provider, native iPhone, A-01 or production evidence.