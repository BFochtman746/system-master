# LRN-OWNERSHIP-FREEZE-001B-R2C — Owner-Bound Persistence + CQEE + Route/Interface Design Lock

Status: **DESIGN_LOCK_COMPLETE / IMPLEMENTATION_NOT_YET_AUTHORIZED / ONE ARCHITECTURE RESIDUAL FENCED**  
Owner lane: `SYSTEM_MASTER/LEARNING`  
Current canonical Learning head re-read after R2B: `learning/control-v1@e3196089f77dde376944a08eac78a697e57d1535`  
R2C base: `learning/ownership-freeze-001b-20260912@9b6918c419bb4c1633d40809e760b5e04fce0546`

## 1. Decision scope

R2B proved the recovered 110/110/26 source denominator is losslessly represented by 113 active P0 requirements, 112 active transport-neutral interfaces and 28 active semantic objects, with seven compound historical parents superseded and non-writable. R2C binds that owner-corrected semantic set to durable-state, command/query/event/error and route/interface contracts before any current implementation mutation.

R2C does **not** resume the obsolete Batch-07 plan, does not promote historical executable evidence, and does not activate the unresolved Knowledge/competency-alignment authority.

The current Foundation constitution remains controlling:

- one truth owner per concept;
- shared infrastructure never absorbs specialist Learning/Curriculum semantics;
- architecture, implementation, qualification and production admission are distinct facts;
- evidence claims may not exceed the evidence class actually observed;
- materially changed subjects require fresh qualification.

## 2. Recovered implementation evidence used only as design input

The recovered `001D` implementation refreeze had already specified separate Learning and Curriculum ports and explicitly stated that physical production binding was then pending. Later preserved work reached a bounded portable owner-separated implementation and a production-binding readiness design with:

- separate `learning_domain` and `curriculum_domain` persistence namespaces;
- operation/idempotency receipts;
- event outbox coupling;
- no Learning/Curriculum-owned durable Job store;
- a 112-interface route manifest;
- 63 inbound command/query routes;
- a historical portable cumulative result of 575/575 with explicit live-PostgreSQL, exact-handler, native and human/psychometric exclusions.

Those results are **historical candidate substrate only**. R2C reuses the architecture where it remains compatible with current authority; it transfers no PASS to the current reconstruction subject.

## 3. Canonical semantic-state partition

All 28 active canonical semantic objects remain inside the Learning peer system but have exactly one internal truth owner.

### 3.1 `SYSTEM_MASTER/LEARNING::MOD-LEARNING-001` — 15 objects

1. `LRN-E001 LearningGoal`
2. `LRN-E007 LessonSessionProjection`
3. `LRN-E008 PracticeAttempt`
4. `LRN-E011 AssessmentAttempt`
5. `LRN-E012 MasteryEvidenceProfile`
6. `LRN-E013 MasteryGateSet`
7. `LRN-E014 MasteryStandard`
8. `LRN-E015 MasteryProjection`
9. `LRN-E016 MasteryExplanationSnapshot`
10. `LRN-E017 SelfConfidenceObservation`
11. `LRN-E018-L RemediationNeed`
12. `LRN-E019 MaintenancePlan`
13. `LRN-E020-L AdaptiveLearningPolicyVersion`
14. `LRN-E021 AdaptiveDecisionTrace`
15. `LRN-E026 QualificationEvidencePackageDescriptor`

### 3.2 `SYSTEM_MASTER/LEARNING::MOD-CURRICULUM-001` — 13 objects

1. `LRN-E002 SkillDefinition`
2. `LRN-E003 Criterion`
3. `LRN-E004 PrerequisiteGraph`
4. `LRN-E005 CurriculumVersion`
5. `LRN-E006 LessonDefinition`
6. `LRN-E009 AssessmentBlueprint`
7. `LRN-E010 AssessmentItemFamily`
8. `LRN-E018-C RemediationPlan`
9. `LRN-E020-C InstructionalPolicyVersion`
10. `LRN-E022 SourceClaimMap`
11. `LRN-E023 CourseValidationReport`
12. `LRN-E024 CourseFreshnessProjection`
13. `LRN-E025 OfflinePackageManifest`

The superseded compound parents `LRN-E018` and `LRN-E020` have no write surface and cannot be recreated as shared mutable records.

## 4. Persistence authority design lock

### 4.1 Semantic authority versus physical storage

`MOD-LEARNING-001` and `MOD-CURRICULUM-001` remain the only semantic writers for their objects. Current Core **Canonical Data & Persistence** may provide the physical durable storage/transaction substrate, but that service may not decide Learning or Curriculum lifecycle transitions, infer mastery, rewrite curriculum semantics, or become a second canonical owner.

The current logical namespaces are frozen as:

- `learning_domain` — only the 15 Learning-owned object families plus Learning operation receipts and Learning event outbox;
- `curriculum_domain` — only the 13 Curriculum-owned object families plus Curriculum operation receipts and Curriculum event outbox.

There is no domain-owned generic `jobs` table. Durable generic jobs belong to Core Durable Execution Runtime. Learning/Curriculum may persist only their domain request/reference/intent and the canonical external job reference returned through the shared contract.

### 4.2 Durable record invariants

Every canonical object write must bind at minimum:

- object type and stable object ID;
- exact semantic owner;
- current object version or immutable revision identity;
- lifecycle/state value where applicable;
- payload/body digest;
- originating semantic command/operation identity when mutation-created;
- created/updated or as-of metadata required by the object contract;
- lineage/supersedes references for versioned/immutable successor models;
- external authority references only as references/snapshots where contract permits, never copied canonical truth.

Owner identity is not caller-selectable. Repository implementations must reject foreign-owner writes before storage mutation.

### 4.3 Idempotency and atomic mutation unit

Every state-changing domain command uses a stable `client_operation_id` or equivalent semantic operation key according to its frozen interface contract.

For a mutating command, the minimum atomic unit is:

`owner object mutation/version -> operation/idempotency receipt -> zero-or-more owner event-outbox records`

Rules:

1. first valid operation creates the durable outcome;
2. replay of the same operation ID with the same semantic payload returns the same semantic result without duplicate mutation/event creation;
3. reuse of the same operation ID with a different semantic payload fails as `DuplicateOperationConflict` or the exact frozen equivalent;
4. transport retries never create a second semantic command;
5. event delivery may be at-least-once, but event identity is stable and consumers must deduplicate;
6. failed shared dependencies may not partially commit owner state unless the command contract explicitly permits a durable waiting state;
7. read-after-write freshness is never assumed across external projections.

### 4.4 Concurrency/version rules

- interfaces that require `expected_version` retain optimistic compare-and-set semantics;
- append-only observations/traces/attempt records are never overwritten in place;
- immutable/versioned policy/definition objects produce successors rather than hidden edits;
- `CurriculumVersion` is immutable once ACTIVE;
- immutable projection/snapshot objects are superseded by a new as-of record rather than rewritten;
- stale concurrent writes fail deterministically with `VersionConflict` or the exact frozen typed error;
- concurrency behavior must remain deterministic after restart/replay.

### 4.5 Migration, rollback and recovery

Current implementation must include explicit schema/data versioning. A migration may change representation but may not silently change semantic ownership or lifecycle meaning.

Before any destructive or non-reversible migration, the implementation must have an owner-valid rollback/restore strategy and evidence target. Recovery/Reconciliation owns generic reconciliation machinery; Learning/Curriculum own the semantic decision that a recovered domain state is valid for their objects.

Offline journal/reconciliation behavior remains a Core Recovery/Reconciliation contract. Learning/Curriculum consume the result and perform owner-valid state transitions; they do not implement a second generic sync authority.

## 5. CQEE interface denominator

The exact recovered interface denominator remains **112/112**:

- 45 COMMAND
- 18 QUERY
- 21 EVENT
- 28 ERROR

Current semantic ownership is:

- 59 Learning-owned interfaces;
- 39 Curriculum-owned interfaces;
- 14 shared/Core-owned interfaces.

### 5.1 Learning interface set — 59

**Commands (24):** `I001,I002,I003,I004,I008,I009,I010,I011,I012,I013,I014,I015,I016-L,I017,I018,I056,I057,I058,I059,I060,I061,I065,I076,I077`

**Queries (9):** `I023,I024,I025,I026,I028,I030,I032,I088,I092-L`

**Events (13):** `I033,I036,I037,I038,I039,I040,I042,I043,I078,I079,I080,I086,I087`

**Errors (13):** `I044,I047,I048,I051,I054,I055,I095,I096,I100,I102,I103,I104,I107`

### 5.2 Curriculum interface set — 39

**Commands (18):** `I005,I006,I007,I016-C,I019,I020,I062,I063,I064,I066,I067,I068,I069,I070,I071,I072,I073,I074`

**Queries (8):** `I027,I029,I089,I090,I091,I092-C,I093,I094`

**Events (7):** `I034,I035,I041,I081,I082,I083,I084`

**Errors (6):** `I049,I053,I097,I098,I099,I110`

### 5.3 Shared/Core interface set — 14

- Core Durable Execution Runtime: `I021 CancelLearningJob`, `I022 ResumeLearningJob`, `I031 GetLearningJobProjection`
- Core Canonical Data & Persistence: `I045 VersionConflict`
- Core Transport & Delivery: `I046 DuplicateOperationConflict`, `I108 NonDeterministicDuplicateConflict`
- Core Recovery & Reconciliation: `I075 ReconcileOfflineJournal`, `I085 OfflineJournalConflictDetected`
- Core Rights, Licensing & Attribution: `I050 RightsMetadataMissing`, `I101 RightsPolicyUnknown`
- Core Capability Registry & Routing: `I052 DependencyUnavailable`
- Core AI Safety & Model Risk: `I105 ModelNotCalibrated`
- Core Security, Privacy, Secrets & Cryptography: `I106 SensitiveDataDisclosureBlocked`
- Core Effect / Action Authority: `I109 QualificationExportNotAuthorized`

Shared ownership means the Core provider owns the shared semantic fact/error/operation. It does **not** grant Core authority to write Learning/Curriculum canonical state.

## 6. Port design lock

The recovered port split remains valid and is admitted as current design, subject to implementation reconciliation:

### Learning ports

- `LRN-CMD-PORT-001` — inbound Learning-owned state-changing commands only
- `LRN-QRY-PORT-001` — Learning-owned queries/projections only
- `LRN-EVT-PORT-001` — Learning-owned domain events
- `LRN-PERSIST-PORT-001` — persistence of the 15 Learning-owned semantic object families only
- `LRN-DEP-PORT-001` — outbound shared/other-domain dependency contracts; reference-only authority
- `LRN-EVIDENCE-PORT-001` — evidence/provenance references and owner-valid Learning admission decisions; never raw evidence authority
- `LRN-ARTIFACT-PORT-001` — artifact references; no artifact-byte ownership
- `LRN-UX-PROJECTION-PORT-001` — projection to UX; no UI truth imported into Learning
- `LRN-HEALTH-PORT-001` — Learning health/readiness projection only
- `LRN-OUTBOX-BINDING-001` — atomic Learning mutation/event-outbox coupling

### Curriculum ports

- `CUR-CMD-PORT-001` — inbound Curriculum-owned state-changing commands only
- `CUR-QRY-PORT-001` — Curriculum-owned queries/projections only
- `CUR-EVT-PORT-001` — Curriculum-owned domain events
- `CUR-PERSIST-PORT-001` — persistence of the 13 Curriculum-owned semantic object families only
- `CUR-DEP-PORT-001` — outbound shared/other-domain dependency contracts; reference-only authority
- `CUR-OUTBOX-BINDING-001` — atomic Curriculum mutation/event-outbox coupling

A Learning service cannot obtain a raw Curriculum writer through a dependency port, and a Curriculum service cannot obtain a raw Learning writer. Cross-domain reads must use typed query/reference ports. Cross-domain mutations must target the canonical owner command surface.

## 7. Route design lock

### 7.1 Complete registry

Capability Registry & Routing must carry **112 exact semantic interface registrations**, not invented replacement routes. Each entry must bind:

- interface ID and frozen semantic signature/version;
- interface type;
- canonical current owner;
- owning port family;
- route class (`DOMAIN_INBOUND`, `DOMAIN_OUTBOUND_EVENT`, `SHARED_DEPENDENCY`, `TYPED_ERROR`);
- authorization/precondition reference where applicable;
- failure semantics;
- current implementation/handler standing and evidence class.

### 7.2 Executable inbound denominator

The command/query denominator is **63 inbound routes**:

- Learning: 24 commands + 9 queries = 33;
- Curriculum: 18 commands + 8 queries = 26;
- shared/Core: `I021,I022,I031,I075` = 4.

No route is considered implemented merely because it appears in the manifest. Every implementation claim requires an exact handler bound to the frozen signature plus current-subject qualification.

### 7.3 Events

The 20 Learning/Curriculum domain events (13 Learning + 7 Curriculum) are emitted only after the corresponding owner mutation is durably committed through the domain outbox binding. Transport & Delivery carries events but does not become event semantic owner. Duplicate delivery is expected and must be safely deduplicated by event identity.

`I085 OfflineJournalConflictDetected` remains a shared Recovery/Reconciliation event and is consumed by Learning/Curriculum as a dependency fact.

### 7.4 Typed errors

Typed errors remain part of the semantic contract and cannot be collapsed into transport exceptions. Shared errors are produced by their canonical shared owner. Learning/Curriculum errors are produced by their owning domain service. Transport may serialize them but cannot reinterpret their meaning.

## 8. Shared dependency bindings

Current bindings are to logical current Foundation/Core services, not historical subsystem IDs:

- Identity/Principal/Delegation — actor/principal references and delegated authority input; Learning owns no person identity.
- Durable Execution Runtime — generic long-job lifecycle and projection; no domain-owned job store.
- Canonical Data & Persistence — physical transaction/version/idempotency primitives only.
- Capability Registry & Routing — route discovery/readiness; no Learning semantic authority.
- Transport & Delivery — message/event delivery; no semantic mutation authority.
- Evidence, Provenance & Assurance — raw evidence/provenance truth; Learning may decide whether evidence is admissible for Learning under its policy but may not rewrite source evidence.
- Artifact Gateway — artifact identity/custody references; no artifact-byte truth in Learning/Curriculum.
- Rights, Licensing & Attribution — use/rights standing.
- Recovery & Reconciliation — generic offline/replay/reconciliation mechanics.
- Security, Privacy, Secrets & Cryptography — sensitive-data/security standing and cryptographic services.
- AI Safety & Model Risk — model calibration/risk standing; generated output never self-authorizes.
- Effect / Action Authority — authority for externally consequential/export effects.
- UX / Chat / Work Control Surface — user interaction/presentation; no learner/curriculum canonical state ownership.

If a required shared dependency is unavailable or returns an unexpected owner/contract version, the domain fails closed according to the exact frozen typed semantics. It must not silently substitute local emulation as production truth.

## 9. `LRN-069` / Knowledge-alignment fence

`LRN-069 / LRN-EXT-002` remains the only unresolved current architecture owner.

R2C therefore freezes these rules:

1. no executable canonical route may claim Knowledge competency-equivalence authority;
2. no `MOD-KNOWLEDGE-001` persistence namespace/table/object may be created;
3. Learning/Curriculum may store their local skill/criterion definitions and external alignment **references** only;
4. source-domain owners remain authoritative for their source competency definitions;
5. similarity/embedding/model output is advisory and cannot mint authoritative equivalence;
6. any future activation requires explicit current architecture authority, current owner binding, contract version, tests and evidence before route admission.

This fence does not block independent Learning/Curriculum implementation that does not require authoritative cross-domain equivalence.

## 10. Qualification denominator frozen before build

R2C freezes the following minimum evidence obligations for the changed current subject. These are obligations, not claimed PASSes.

### 10.1 Static/lossless structure

- 113/113 active P0 requirements retain one owner or explicit `LRN-069` fence;
- 112/112 interfaces retain one exact owner and one current route classification;
- 28/28 semantic objects retain one writer;
- seven compound historical parents remain non-writable/non-routable;
- zero Book/Documents/Programming semantic ownership imports;
- zero second Learning/Curriculum canonical writer;
- zero active route for unresolved Knowledge equivalence.

### 10.2 Persistence/authority

At minimum one positive and one owner-bypass/negative case per 28 semantic object families, plus targeted lifecycle/version tests for every immutable/versioned/append-only/projection class.

Required adversarial classes include:

- Learning writes Curriculum object — reject;
- Curriculum writes Learning object — reject;
- Core storage provider attempts semantic transition — reject;
- stale expected-version — deterministic `VersionConflict`;
- same operation ID/same payload replay — same semantic result, no duplicate effect;
- same operation ID/different payload — deterministic duplicate conflict;
- crash between owner mutation/receipt/outbox boundaries — no split committed truth;
- duplicate event delivery — no duplicate semantic effect;
- restart/recovery — deterministic current state and outstanding outbox state;
- migration/rollback — owner and lifecycle semantics preserved.

### 10.3 CQEE/route contract

- 112/112 frozen signatures schema/owner checked;
- 63/63 inbound routes must eventually have exact handler parity before handler-complete may be claimed;
- 45/45 commands must satisfy their frozen idempotency semantics;
- 18/18 queries must remain read-only and expose freshness/version semantics where required;
- 21/21 events must preserve stable identity/owner and delivery semantics;
- 28/28 typed errors must remain distinguishable from generic transport failure;
- all 14 shared/Core interfaces require fail-closed owner/contract mismatch tests.

### 10.4 Cumulative regression/calibration

Historical 481/501/535/560/575 portable results are preserved only as prior exact-subject evidence and regression-denominator candidates. After any current implementation/rebind, the exact changed subject must freshly execute:

1. owner-boundary and route/persistence isolated tests;
2. the applicable owner-separated Learning/Curriculum behavioral regression floor;
3. deterministic replay/crash/recovery/concurrency campaigns;
4. static authority/import checks;
5. calibration/golden-vector suites only after stale historical ID traces are semantically remapped to current active requirement IDs.

No current PASS may be inferred from the historical 575 result.

## 11. R2C design decisions

- semantic owner split 15 Learning / 13 Curriculum: **LOCKED**
- physical persistence provider may be Core while semantic owners remain Learning/Curriculum: **LOCKED**
- logical persistence namespaces `learning_domain` / `curriculum_domain`: **LOCKED AS CURRENT TARGET DESIGN; IMPLEMENTATION SUBJECT NOT YET ADMITTED**
- state + operation receipt + outbox atomicity for mutating commands: **LOCKED**
- no Learning/Curriculum generic jobs table: **LOCKED**
- exact 112-interface denominator and 63 inbound denominator: **LOCKED**
- Learning/Curriculum port families and owner boundaries: **LOCKED**
- shared services are dependency providers, never substitute Learning semantic owners: **LOCKED**
- `LRN-069` executable route/persistence: **BLOCKED / FEATURE-GATED**
- current implementation build: **NOT YET AUTHORIZED**

## 12. Exact next operation

`LRN-OWNERSHIP-FREEZE-001B-R2D — CURRENT IMPLEMENTATION-SUBSTRATE CUSTODY + 575-BASELINE RECONCILIATION / DESIGN-DELTA ADJUDICATION`

R2D must recover the exact preserved owner-separated implementation/production-binding source subject and evidence package, verify byte/hash custody, and compare it to this current R2B/R2C owner/persistence/route design. It must classify each prior component as `REUSE_UNCHANGED`, `REUSE_WITH_CURRENT_CONTRACT_REBIND`, `REPAIR`, `REPLACE`, or `DO_NOT_ADMIT`.

Only after R2D proves an exact implementation base and a bounded current-design delta may BUILD begin. The obsolete Batch-07 line remains superseded. No learner/human, psychometric, SME, certification, native, live-PostgreSQL, A-01 or production evidence is created by R2C.