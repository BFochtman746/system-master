# LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R3 — Repaired Curriculum Lifecycle Design Lock

Status: **DESIGN_LOCK_COMPLETE / 60-CASE DENOMINATOR FROZEN / OWNER-LOCAL BUILD AUTHORIZED**  
Owner lane: `SYSTEM_MASTER/LEARNING`  
Semantic owner: `SYSTEM_MASTER/LEARNING::MOD-CURRICULUM-001`  
Date: `2026-09-12`

## 1. Exact controlling parent

Pre-mutation live head was re-read as:

- branch `learning/ownership-freeze-001b-20260912`
- parent `d9ecfd1b297462fc4542e77dbe8f160d5ffc610f`
- parent tree `c612773bcd328065187e51c509902ad78da80a81`
- parent standing: `R3B-S02-R2` atomic responsibility repair `QUALIFIED_AND_FROZEN`.

The current Learning ownership constitution is therefore:

- historical source universe: **110 requirements / 110 interfaces / 26 semantic objects**;
- active lossless atomic representation: **116 requirements / 112 interfaces / 28 semantic objects**.

This design lock does not reopen owner attribution. It repairs the S02 implementation/test denominator to conform to the frozen R2 collision elimination.

## 2. S02 exact implementation slice

S02 now contains eight owner surfaces:

1. `I005 RequestCurriculumGeneration` — high-level Curriculum generation workflow intent;
2. `I068 ApproveCourseActivation` — explicit user approval decision receipt only;
3. `I006 ActivateCurriculumVersion` — sole active-version state transition;
4. `I007 RequestCourseRefresh` — refresh workflow intent;
5. `I027 GetCurriculum` — immutable/version-pinned Curriculum read;
6. `I029 GetCourseFreshness` — version-pinned freshness read with explicit UNKNOWN/STALE semantics;
7. `I034 CurriculumDraftReady` — post-durable-state draft-ready event;
8. `I035 CurriculumActivated` — post-I006-commit activation event.

`I066 RequestCourseCompilation` is not implemented by S02. Its repaired semantic contract is nevertheless a mandatory negative boundary for I005: S02 may create the high-level generation request and dispatch intent/reference, but it may not implement or impersonate the downstream compiler-stage owner surface.

`I070`, `I071` and `I072` likewise remain downstream refresh/refresh-diff surfaces. S02 may not create a direct refresh-accept-to-activation shortcut; any later I072 acceptance must flow through I068 then I006.

## 3. Canonical responsibility chain

The frozen Curriculum lifecycle is:

`I005 generation intent -> I066 compiler-stage request -> I067 validation -> [I070 diff + I072 refresh decision when refresh] -> I068 approval decision -> I006 activation transition -> I035 activation event`.

For initial generation, I034 may announce a durable reviewable draft before validation/approval/activation. I034 never means approved or active.

Only I006 may change the active CurriculumVersion pointer/state. Neither I005, I007, I034, I068, I070, I072 nor transport metadata may activate.

## 4. Durable state / contract lock

S02 implementation must remain compatible with the already frozen R2C persistence/CQEE rules:

- semantic state belongs to `curriculum_domain`;
- physical persistence may be supplied by Core but cannot become Curriculum semantic owner;
- every mutating command binds stable semantic operation identity + semantic payload digest;
- same operation identity + same semantic payload converges on the same semantic result;
- same operation identity + different semantic payload returns the canonical duplicate-operation conflict;
- state/version mutation, operation receipt and zero-or-more owner outbox records form one owner atomic unit;
- remote job/source/artifact/rights/authorization calls are never dual-written as if local rows were their canonical truth;
- ambiguous/lost remote responses are reconciled from durable local intent/reference state; they do not justify minting a second semantic request;
- caller-supplied PASS/approval/rights/freshness/accessibility/job-completion assertions are non-authoritative unless admitted by their canonical contracts;
- no read-after-write freshness assumption is permitted across an external/shared boundary.

## 5. Command semantics

### I005 RequestCurriculumGeneration

Required input binding:

- exact LearningGoal ID + version/reference;
- generation constraints;
- source policy reference/version;
- accessibility needs/reference as applicable;
- stable `client_operation_id`;
- current readiness/dependency receipts required by policy.

Durable result:

- exactly one Curriculum-owned high-level generation request identity for one semantic operation;
- owner-local request state sufficient for restart/offline rediscovery;
- optional outbox/dispatch intent to generic job/compiler integration;
- external generic job reference only when returned/admitted.

I005 does not own generic job lifecycle and does not substitute for I066 compilation.

### I068 ApproveCourseActivation

I068 records an immutable approval decision receipt only. The receipt binds at minimum:

- exact CurriculumVersion identity/version;
- exact validation-report reference/revision;
- exact expected LearningGoal version/reference;
- approval decision (`APPROVE` or explicit non-approval disposition);
- policy/input version references and reason code(s);
- stable operation identity;
- externally validated actor/authorization reference where required.

I068 has **no Curriculum ACTIVE transition side effect** and emits no authoritative `CurriculumActivated` event.

Qualification may use synthetic test fixtures to exercise the API contract, but synthetic approval fixtures are not evidence that any real user approved anything.

### I006 ActivateCurriculumVersion

I006 is the sole activation transition. It requires an exact current admissible I068 approval receipt plus exact current readiness facts for the same target version.

At minimum activation fails closed on:

- missing approval receipt;
- approval receipt for a different CurriculumVersion/version;
- stale/mismatched expected LearningGoal version;
- stale/mismatched validation report;
- non-`READY_FOR_ACTIVATION` lifecycle;
- unresolved material source contradiction;
- insufficient/unknown source freshness when policy requires it;
- unknown/denied required rights standing;
- missing required accessible alternative;
- unavailable required external dependency;
- version/concurrency conflict.

A successful atomic commit:

1. pins target CurriculumVersion ACTIVE;
2. supersedes the prior active pointer/version where applicable without editing prior immutable bytes;
3. records exact operation/decision trace and lineage;
4. stages exactly one stable `I035 CurriculumActivated` outbox event.

### I007 RequestCourseRefresh

I007 creates/deduplicates one Curriculum refresh workflow intent against a pinned active CurriculumVersion plus refresh trigger/source policy. It never edits the active version in place and never activates a candidate.

### I027 / I029

`I027 GetCurriculum` returns immutable/version-pinned owner state and external artifact/media references; it does not return external artifact bytes as Curriculum-owned data.

`I029 GetCourseFreshness` returns the exact as-of/version-pinned freshness projection. Missing/stale source evidence yields `UNKNOWN`, `STALE`, a typed dependency failure or equivalent explicit standing; it never silently becomes `FRESH`.

### I034 / I035

Both are stable-identity, at-least-once-delivery-compatible owner events staged only after the corresponding owner state commits.

- I034 means a durable draft is reviewable; it is not validation PASS, approval, activation or learner outcome.
- I035 means I006 committed the active-version transition; it is not learner mastery, retention, transfer, certification or publication.

## 6. Atomic requirement bindings

S02 explicitly binds the repaired Curriculum children:

- `LRN-064-C` — Curriculum readiness preflight;
- `LRN-138-C` — Curriculum consequential-decision trace;
- `LRN-140-C` — Curriculum fail-closed UNKNOWN/BLOCKED/DEGRADED behavior.

The sibling `-L` rows remain Learning-owned and are not implemented by this Curriculum slice.

Other Curriculum requirements used by this slice include the already frozen curriculum/version/source/activation/refresh/readiness semantics such as LRN-002, LRN-003, LRN-005..009, LRN-095..100, LRN-104..108 and LRN-110. Shared truth owners remain external dependencies.

## 7. Targeted research adjudication

No new external research is warranted before this build. The design-changing uncertainty was an internal authority collision, and it has been resolved from exact current owner ledgers and frozen System Master durability/idempotency contracts. External pedagogy/psychometrics research cannot legitimately decide which command owns a state transition or whether an approval receipt may be fabricated.

Research remains available for later instructional/assessment policy questions only when it can materially alter a Learning/Curriculum design decision.

## 8. Repaired isolated qualification denominator — 60 cases

The prior 52-case denominator is superseded by the following **60-case** exact-subject denominator. No case is PASS until executed on the changed subject.

| Range | Count | Required evidence |
|---|---:|---|
| `S02-Q001..Q008` | 8 | Exact surface/signature/owner/route semantics for I005, I068, I006, I007, I027, I029, I034, I035. |
| `S02-Q009..Q016` | 8 | Owner/no-bypass fences: Curriculum cannot write LearningGoal/mastery/generic-job/artifact/rights truth; callers/Core/transport cannot write Curriculum state; ACTIVE bytes immutable; transport cannot become event owner. |
| `S02-Q017..Q024` | 8 | Semantic idempotency/replay: same-key same-payload convergence, same-key different-payload conflict, generation/refresh dedupe, approval replay, activation replay, duplicate event delivery, restart replay, no stacked semantic retry. |
| `S02-Q025..Q033` | 9 | Version/concurrency/lifecycle: stale goal version, stale Curriculum expected version, invalid activation state, failed activation preserves prior active, ACTIVE immutability, supersedes lineage, concurrent activation conflict, stale refresh base, deterministic restart result. |
| `S02-Q034..Q043` | 10 | Fail-closed readiness/source/rights/accessibility: unknown/denied rights, missing alternate, stale/unknown freshness, unresolved contradiction, outdated/blocking validation, stale approval context, unavailable shared dependency. |
| `S02-Q044..Q049` | 6 | Job/outbox/recovery: semantic request + outbox atomicity, no generic job ownership, timeout leaves recoverable intent, lost wakeup/restart rediscovery, ambiguous response cannot duplicate request, event only after owner commit. |
| `S02-Q050..Q053` | 4 | Query/event consistency: I027 exact version, I029 UNKNOWN-not-FRESH, I034 draft-not-active, I035 exact active lineage. |
| `S02-Q054..Q060` | 7 | Collision-repair adversarial cases: I068 cannot activate; I006 rejects missing approval; I006 rejects mismatched target/version approval; I006 rejects stale validation/goal binding in approval; I072 accept cannot route direct activation; I005 semantic request identity cannot be reused as I066 compiler-stage identity; only successful I006 commit may stage I035. |

The repaired count is 60 because the former 52-case plan replaced one seven-surface signature group with eight surfaces (+1) and adds seven explicit collision-repair adversarial cases (+7).

## 9. Cumulative regression / calibration gate

After the owner-local S02 build is created on the exact admitted source lineage, qualification must:

1. run all `60/60` S02 cases;
2. rerun the inherited S01 exact-source cumulative floor rather than transferring its result by label;
3. rerun owner-boundary and owner-extraction regressions on the changed subject;
4. rerun current R2 atomic-responsibility invariants against the implementation route table/handlers;
5. rerun the deterministic no-owner-bypass campaign with the repaired activation seam included;
6. compile/static-check all changed surfaces;
7. preserve exact source, prior patch, new patch and changed-file digests plus executed commands/environment;
8. keep live PostgreSQL/shared-provider/native/A-01/production standing separate unless actually executed.

No historical 481/575 aggregate may be promoted without exact recovery and rerun on the changed subject.

## 10. Source-custody boundary

Owner-local build authority remains bound to exact admitted source:

- `LRN_CUR_PRODUCTION_BINDING_001_REBOUND_SOURCE.zip`
- SHA-256 `28e3317e5494c9df7df2f8aefb7f83f7c69fbc9d0ababfb696700542c831edc3`

The S01B patch must be deterministically reconstructed/applied first so S02 extends the current qualified owner-local lineage rather than silently rebuilding from an older source state.

Canonical repository-native application remains:

`BLOCKED_SOURCE_CUSTODY__CANONICAL_REPO_NATIVE_TARGET_UNADMITTED`.

Shared/Core activation remains:

`BLOCKED_EXTERNAL_FOUNDATION_CONTRACT_ADMISSION`.

## 11. Build authorization

One successor is READY:

`LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R4 — RECONSTRUCT S01B EXACT PATCH -> BUILD S02 CURRICULUM LIFECYCLE OWNER-LOCAL PATCH -> 60-CASE ISOLATED QUALIFICATION -> CUMULATIVE OWNER/ROUTE/ATOMIC-RESPONSIBILITY REGRESSION`

R4 may modify only an owner-local reconstruction of the exact admitted source plus exact S01B qualified patch lineage. It must produce a reproducible S02 patch/carrier and exact changed-subject evidence. It may not invent a canonical repo-native runtime location or promote unresolved external/shared routes.

## 12. Evidence explicitly not claimed

No participant consent, real user approval, learner response, mastery, retention, transfer, psychometric validity, instructional effectiveness, SME approval, certification/accreditation, live PostgreSQL, real external provider, native iPhone, A-01 or production evidence is claimed by this design lock.