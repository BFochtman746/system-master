# LRN-OWNERSHIP-FREEZE-001B-R3B-S03 — Lesson / Practice Observation Forensic Census + Design Lock

Status: **DESIGN_LOCK_COMPLETE_FOR_OWNER_SEMANTICS / PRE-BUILD_DENOMINATOR_FROZEN / EXACT IMPLEMENTATION LINEAGE AND EXACT ROW-MATERIALIZATION REQUIRED BEFORE BUILD**  
Owner lane: `SYSTEM_MASTER/LEARNING`  
Internal semantic owner for mutable learner-side truth: `SYSTEM_MASTER/LEARNING::MOD-LEARNING-001`  
Date: `2026-09-12`

## 1. Authority re-read before mutation

This unit follows the user-authorized reconstruction path, not the stale Batch-07 selector.

Exact authority observed immediately before mutation:

- canonical Learning control: `learning/control-v1@e3196089f77dde376944a08eac78a697e57d1535`;
- reconstruction parent: `learning/ownership-freeze-001b-20260912@1ef8179a0f22af23c899185b6c848bafe362d87c`;
- parent unit: `LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R4-MATERIALIZATION-BLOCK`;
- current authority: `CURRENT-AUTHORITY-003` / `SYSTEM-TOPOLOGY-005`;
- Learning repair inbox: zero active repair transactions;
- central Learning Second Shift Batch-07 delegation remains older-plan evidence and is not controlling this reconstruction branch.

The frozen ownership constitution is retained losslessly:

- historical denominator: **110 P0 requirements / 110 interfaces / 26 semantic objects**;
- current atomic representation: **116 requirements / 112 interfaces / 28 semantic objects**;
- canonical semantic objects: **15 Learning-owned + 13 Curriculum-owned**;
- Curriculum remains an internal Learning-system semantic owner, not a Topology peer;
- Book, Documents, Core/shared Foundation and Programming semantics remain outside Learning/Curriculum ownership.

S02 implementation remains independently blocked on exact predecessor-byte materialization. That block does not authorize approximation and does not block this owner-local specification/evidence unit.

## 2. RECOVER / INVENTORY — exact S03 semantic responsibility

S03 owns the learner-side observation boundary immediately downstream of Curriculum lesson definition. It does **not** reopen Curriculum lifecycle authority.

Primary canonical Learning objects already frozen by R2C:

1. `LRN-E007 LessonSessionProjection` — Learning-owned learner/session progress truth for one exact learner + curriculum/lesson revision context.
2. `LRN-E008 PracticeAttempt` — Learning-owned immutable/append-oriented record of one observed practice attempt and its Learning interpretation at the time admitted.

Referenced but not writable by S03:

- `LRN-E006 LessonDefinition` — Curriculum-owned immutable/versioned lesson-definition truth;
- `LRN-E005 CurriculumVersion` — Curriculum-owned immutable active/version truth;
- `LRN-E002 SkillDefinition`, `LRN-E003 Criterion`, `LRN-E004 PrerequisiteGraph` — Curriculum-owned instructional-definition references;
- `LRN-E012 MasteryEvidenceProfile`, `LRN-E015 MasteryProjection`, retention/transfer state and adaptive-decision objects — Learning-owned downstream truth that S03 may feed through typed evidence/observation references but may not mutate by side effect.

### 2.1 Atomic responsibility adjudication

S03 freezes these one-owner rules:

- Curriculum owns what a lesson/practice definition *is* and which version is current/eligible.
- Learning owns what was *observed for this learner* during an admitted lesson/practice interaction.
- Learning owns whether an observation is admissible as Learning evidence, but observation admission is not mastery.
- Core Identity/Principal/Delegation owns platform actor/principal/delegation truth. S03 stores only typed references/snapshots permitted by the contract.
- Core Evidence/Provenance owns generic source-evidence/provenance substrate. S03 owns only Learning interpretation/admission facts and references.
- Core Transport/Recovery/Execution owns generic delivery/replay/offline/job mechanics. S03 owns no generic job truth.
- Documents owns artifact/file/rendering mechanics. A displayed worksheet/media/document does not become Learning-owned artifact-byte truth.
- Book and Programming canonical state are never writable through lesson/practice observations.

No second authoritative writer is admitted for `LessonSessionProjection` or `PracticeAttempt`.

## 3. ANALYZE — collision and adversarial surfaces

The following failure/collision surfaces are design-significant and must be defended before build:

1. **Lesson-definition collision:** mutable session input must never rewrite or silently fork Curriculum `LessonDefinition` truth.
2. **Observation/mastery collision:** completion, correctness, score, confidence, time-on-task or repeated success cannot directly set mastery/retention/transfer state.
3. **Principal/learner collision:** authenticated principal identity is not the learner educational profile. The mapping is a typed precondition/reference, not an ownership transfer.
4. **Transport/semantic collision:** chat/webhook/message metadata and delivery success cannot become semantic observation authority.
5. **Duplicate/lost-response collision:** a retried observation must converge on one semantic attempt; payload-conflicting reuse of an operation/attempt identity fails closed.
6. **Read-after-write assumption:** callers may not assume an external projection is fresh immediately after mutation; authoritative reread/reconcile is required where state is needed.
7. **Curriculum-version drift:** a session/attempt cannot silently rebind from one lesson/curriculum revision to another.
8. **Correction collision:** an observed attempt cannot be destructively rewritten to improve history. Corrections/supersession must preserve the prior record and reason.
9. **Offline replay ordering:** late/offline observations may be admitted only with deterministic ordering/context rules; replay cannot synthesize a current lesson state from stale metadata.
10. **Evidence inflation:** artifact availability, telemetry presence, model confidence, synthetic fixture success or scorer execution cannot be promoted to real learner mastery/retention/transfer.
11. **Privacy leakage:** raw provider/chat metadata is not canonical observation payload merely because it is available at ingress.
12. **Stacked retries:** semantic ingestion has one idempotency authority; external retry layers may retry only classified transient failures and cannot each mint new semantic operation identities.

## 4. TARGETED RESEARCH — material design delta only

Targeted external research was performed because the observation-history/correction design could materially affect the durable-state contract.

Official references consulted:

- 1EdTech Caliper Analytics: https://www.1edtech.org/standards/caliper — models learning activities/events with domain-specific profiles and treats captured activity data as an analytics/event substrate.
- ADL Experience API v1.0.1: https://adlnet.gov/assets/uploads/xAPI_v1.0.1-2013-10-01.pdf — explicitly relies on statement immutability and uses a separate voiding statement rather than silently changing/deleting an issued statement.

Design effect admitted from that research:

- practice/session observations are durable historical observations, not mutable mastery truth;
- correction is represented by explicit supersession/void/correction lineage rather than destructive overwrite;
- event/observation identity must remain stable enough for replay/deduplication;
- external interoperability formats are adapters only and do not become System Master Learning authority.

No claim of Caliper/xAPI conformance or certification is made, and no external standard is allowed to override the frozen System Master ownership constitution.

## 5. DESIGN LOCK — durable S03 contract

### 5.1 `PracticeAttempt` invariants

Every admitted `PracticeAttempt` must bind at minimum:

- stable `practice_attempt_id`;
- stable semantic `client_operation_id` / ingestion operation identity;
- Learning learner/profile reference;
- exact `CurriculumVersion` reference;
- exact `LessonDefinition` revision/reference;
- exact practice/criterion reference where present;
- observation type and bounded normalized observation payload;
- source/evidence/provenance reference(s), never invented source authority;
- observed-at and admitted-at metadata with explicit distinction;
- canonical payload digest;
- correction/supersedes reference when applicable;
- interpretation/result facts that were actually observed or deterministically computed by an admitted scorer contract;
- operation/idempotency receipt and event-outbox identity.

`PracticeAttempt` is append-only after admission except for separately persisted lifecycle metadata that does not rewrite the observation body. A correction creates an explicit successor/correction record; the old attempt remains historically addressable.

### 5.2 `LessonSessionProjection` invariants

`LessonSessionProjection` is a Learning-owned durable projection over exact learner + curriculum/lesson revision context. It must:

- pin the exact lesson/curriculum revision;
- use optimistic expected-version/CAS semantics for mutable projection state;
- be recomputable from admitted Learning observations/owner state plus versioned Curriculum references;
- record the last applied observation/event identity needed for deterministic replay;
- never mutate Curriculum definitions;
- never assert mastery/retention/transfer merely because the session completed;
- treat missing/stale dependency state as typed UNKNOWN/BLOCKED/DEPENDENCY_UNAVAILABLE rather than silently succeeding.

### 5.3 Idempotency and reconciliation

For every mutating S03 operation:

`owner mutation/append -> operation receipt -> zero-or-more owner outbox records`

must be atomic within the Learning persistence boundary.

Rules:

1. same operation ID + same semantic payload => same semantic result, no duplicate attempt/event;
2. same operation ID + different semantic payload => deterministic `DuplicateOperationConflict` (or exact frozen equivalent);
3. same stable attempt identity + conflicting digest => fail closed;
4. lost response => reconcile by stable operation/attempt identity before any re-create;
5. duplicate wakeup/delivery => harmless hint; wakeups are never authority;
6. restart/offline rediscovery => scan/reconcile durable Learning state rather than trusting mutable transport state;
7. retries only for classified transient failures, bounded backoff/jitter, and only around an idempotent operation boundary;
8. nested retry layers must not each reinterpret semantic failure as transient.

### 5.4 Observation -> evidence -> mastery fence

S03 freezes a three-stage separation:

`OBSERVED INTERACTION -> LEARNING EVIDENCE ADMISSION/INTERPRETATION -> DOWNSTREAM MASTERY/RETENTION/TRANSFER DECISION`

A practice attempt may produce or reference candidate Learning evidence. It cannot itself:

- set a `MasteryProjection`;
- satisfy a mastery gate by side effect;
- assert delayed retention;
- assert novel transfer;
- certify competency;
- manufacture psychometric validity or instructional effectiveness.

Those claims require their separately owned policies, evidence denominators and actual observed evidence.

### 5.5 Authorization and trust

Transport authorization and semantic authorization remain separate. S03 must not trust mutable chat/webhook/provider metadata as learner identity, permission, lesson version or observation truth. Any consequential or dangerous operation requiring later policy/approval remains gated by the appropriate external decision receipt; S03 does not invent that approval.

## 6. Exact interface binding fence

The current 112-interface owner constitution remains authoritative, but this execution environment does not expose the admitted compressed row ledger as independently decoded row bytes suitable for exact handler-signature materialization. Therefore S03 does **not** invent interface names, signatures or IDs from ordinal proximity.

Before BUILD, the exact recovered interface rows whose responsibilities touch `LRN-E007 LessonSessionProjection` and `LRN-E008 PracticeAttempt` must be independently materialized from the admitted ledger, hash-verified, and bound as:

`interface ID/signature -> canonical owner -> handler -> durable object(s) -> idempotency receipt -> outbox/event(s) -> typed errors -> shared dependency receipts -> tests`.

Any candidate row that actually owns Curriculum lesson-definition mutation, generic artifact/media mechanics, generic identity/authorization/job state, assessment/mastery decisions, Book state, Documents state or Programming state is excluded from S03 even if its name contains “lesson”, “practice”, “attempt” or “session”.

Blocker class for implementation binding: `EXACT_SOURCE_CUSTODY / EXACT_INTERFACE_ROW_MATERIALIZATION`.

This is not a blocker to freezing the owner semantics and pre-build denominator below.

## 7. PRE-BUILD TEST DENOMINATOR — 60 cases

The following **60-case isolated denominator** is frozen before S03 implementation. These are obligations, not PASS claims.

### A. Ownership / authority — S03-T01..T10 (10)

- T01 Learning is sole writer of `PracticeAttempt`.
- T02 Learning is sole writer of `LessonSessionProjection`.
- T03 S03 cannot mutate `LessonDefinition`.
- T04 S03 cannot mutate `CurriculumVersion`.
- T05 Core principal reference does not become learner-profile writer authority.
- T06 generic evidence substrate does not become Learning interpretation writer.
- T07 document/artifact bytes remain external references.
- T08 Book state cannot be mutated through observation ingress.
- T09 Programming state cannot be mutated through observation ingress.
- T10 mutable transport metadata cannot supply semantic authority.

### B. Lesson-session projection — S03-T11..T20 (10)

- T11 create projection pinned to exact curriculum/lesson revision.
- T12 stale lesson revision fails closed.
- T13 expected-version success updates projection once.
- T14 stale expected-version yields deterministic version conflict.
- T15 replay of already-applied observation is a no-op semantic replay.
- T16 out-of-order observation follows frozen deterministic ordering rule.
- T17 missing dependency standing yields typed blocked/unknown result.
- T18 session completion does not create mastery.
- T19 projection recomputation produces equivalent owner state for same admitted history.
- T20 restart rediscovery does not require mutable transport state.

### C. Practice observation / correction — S03-T21..T36 (16)

- T21 first valid attempt appends exactly once.
- T22 same operation + same payload returns same semantic result.
- T23 same operation + different payload fails conflict.
- T24 same attempt ID + conflicting digest fails conflict.
- T25 duplicate transport delivery creates no duplicate attempt.
- T26 lost response reconciles existing attempt before retry-create.
- T27 observation preserves observed-at separately from admitted-at.
- T28 exact CurriculumVersion reference is persisted.
- T29 exact LessonDefinition revision is persisted.
- T30 criterion/practice reference is version-bound when present.
- T31 source/evidence reference is retained without copying external authority.
- T32 correction creates explicit successor/correction lineage.
- T33 correction does not destructively overwrite prior observation.
- T34 unauthorized correction fails closed.
- T35 unknown/missing required source standing is not converted to PASS.
- T36 payload normalization is deterministic and digest-stable.

### D. Idempotency / concurrency / recovery — S03-T37..T46 (10)

- T37 mutation + operation receipt + outbox commit atomically.
- T38 injected failure before commit leaves no partial semantic attempt.
- T39 injected failure after durable commit but before response reconciles without duplicate.
- T40 duplicate wakeup is harmless.
- T41 lost wakeup is recovered by durable rediscovery/reconciliation.
- T42 concurrent projection updates yield one valid CAS winner and typed conflict for stale writer.
- T43 transient retry uses same semantic operation identity.
- T44 permanent/semantic failure is not retried as transient.
- T45 bounded retry exhaustion preserves deterministic failure evidence.
- T46 no stacked retry layer can mint a second semantic operation.

### E. Evidence / mastery separation — S03-T47..T54 (8)

- T47 correct practice result alone does not set mastery.
- T48 repeated correct attempts alone do not assert delayed retention.
- T49 immediate practice alone does not assert novel transfer.
- T50 confidence/self-report cannot self-authorize mastery.
- T51 telemetry/session duration cannot self-authorize mastery.
- T52 artifact/render success cannot self-authorize educational success.
- T53 candidate evidence retains source/provenance references before downstream admission.
- T54 downstream mastery consumer receives typed observation/evidence reference, not hidden mutation.

### F. Boundary / privacy / claim discipline — S03-T55..T60 (6)

- T55 raw chat/webhook metadata is rejected as canonical observation authority.
- T56 sensitive provider metadata is minimized/excluded unless explicitly required by admitted contract.
- T57 unresolved shared contract fails closed rather than local-emulated production truth.
- T58 no Knowledge-equivalence route is activated through S03.
- T59 synthetic fixtures cannot be labeled real learner evidence.
- T60 qualification output explicitly denies participant consent, mastery, retention, transfer, psychometric, SME, certification, native, A-01 and production claims unless actually observed separately.

## 8. Cumulative regression / calibration obligations

Any future S03 changed-subject qualification must also rerun or otherwise freshly bind the current exact-subject owner constitution checks sufficient to prove:

- lossless historical 110/110/26 coverage remains represented by the active atomic model;
- current 116/112/28 owner constitution remains collision-free;
- S01 LearningGoal ownership and idempotency boundaries remain intact;
- S02 Curriculum approval/activation separation remains intact;
- `I082` approval-event semantics cannot collapse into activation;
- `I007` does not acquire generic job truth;
- Knowledge alignment remains fail-closed;
- Book/Documents/Programming semantic imports remain zero;
- shared/Core contracts remain dependencies, not Learning writers.

Historical PASS may be used only as provenance. Changed bytes require fresh exact-subject evidence.

## 9. Freeze decision

S03 is **frozen at owner-semantic/design-lock standing only**. No runtime build or qualification PASS is claimed.

What is now closed for this slice:

- canonical semantic responsibility of lesson-session/practice observation;
- Curriculum/Learning ownership boundary;
- append-only/correction lineage rule;
- idempotency/replay/restart semantics;
- observation/evidence/mastery separation;
- external/shared authority fences;
- 60-case isolated pre-build denominator;
- cumulative regression obligations.

What remains blocked before BUILD:

1. independently materialize and hash-verify exact interface rows for this slice from admitted custody;
2. bind those exact rows/signatures to S03 handlers and typed errors without inventing route identities;
3. reconstruct the exact current implementation lineage (admitted source + exact predecessor patches) or obtain an equivalent exact repository-native source-custody path;
4. then build and execute the 60-case denominator plus cumulative regression on the exact changed subject.

## 10. Exact next operation

`LRN-OWNERSHIP-FREEZE-001B-R3B-S03-R1 — EXACT LESSON/PRACTICE INTERFACE-ROW MATERIALIZATION + HASH VERIFICATION -> HANDLER/STATE/OUTBOX/ERROR BINDING -> BUILD-READINESS ADJUDICATION`

If the exact row/source bytes remain unavailable, S03-R1 must fail closed and preserve the blocker; independent owner-local forensic/design work may continue only on a different non-overlapping semantic slice. It may not approximate interface identities or promote historical PASS.

## 11. Evidence explicitly not claimed

No participant consent, real participant response, real learner mastery, delayed retention, novel transfer, psychometric validity, instructional effectiveness, SME approval, certification/accreditation, live PostgreSQL execution, external-provider standing, native iPhone execution, A-01 execution or production execution is claimed by this artifact.
