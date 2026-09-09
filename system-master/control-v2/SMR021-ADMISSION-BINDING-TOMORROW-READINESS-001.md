# SMR021 Admission-Binding Tomorrow Readiness 001

Date: 2026-09-09
Owner lane: `SYSTEM_MASTER/CORE`
Status: **PREPARE_NEXT PHASE CLOSED / IMPLEMENTATION-READY CONTRACT SEALED / EXECUTION STILL SOURCE-CUSTODY BLOCKED**
Control head reviewed before preparation: `18d0b8eeb9d1a1cd875583cce1cea478f110ef68`

## Purpose

Preserve completed SMR021 research/reconciliation and convert the first known dependency-current implementation defect into a bounded, executable repair packet that can begin immediately after exact SMR020 runnable predecessor custody is restored.

This checkpoint does not repeat the already-completed broad source-custody search and does not manufacture missing bytes.

## 1. Current prerequisite and resume gate

The dependency-current SMR021 rebuild may execute only from the exact runnable SMR020 source/test predecessor whose independently recomputed digest equals:

`89066e5662554b1810691473e0ed9bf49d8cc2fd4964444043b878461ed75477`

`SMR020-DEPENDENCY-CURRENT-SOURCE-CUSTODY-RECOVERY-001.md` already records the GitHub + Library recovery audit, including the September 9 ZIP census. Do not restart that audit unless a genuinely new custody surface becomes available.

Immediately after candidate predecessor bytes are recovered:

1. recompute the source/test digest before any mutation;
2. require exact `89066e56...` equality;
3. snapshot/preserve the recovered predecessor unchanged;
4. only then enter the repair sequence below.

Different bytes are a new candidate lineage and cannot inherit SMR020 PASS.

## 2. Evidence lineage that must remain separate

### Historical semantic carrier

`SYSTEM_MASTER_OFFICIAL_SPINE_v2.0.24_USER-EXPERIENCE-001-REVIEWED_A01-PENDING.zip`

- historical carrier SHA-256: `408e8aaeddad67d983568a05263303ef5e0106f9af62e314d40dda2b738b9ced`
- historical replay: portable PASS on immutable historical bytes
- use: semantic and file-layout evidence only
- prohibition: never use this carrier as the dependency-current product base

### Corrected historical R025 candidate

The bounded database-parity repair in `USEREXPERIENCE001_R025_DB_PARITY_REPAIR_001.patch` passed its separate historical-candidate portable campaign. Its PASS does not transfer to the dependency-current rebuild.

### Failed dependency-current overlay

A prior dependency-current overlay was assembled from exact SMR020 lineage and independently identified as:

`ca2c9348040936a7b11d5367d16aed1251abc3e92dd5ec7b62326ff5c1f7aef8`

That subject is **FAILED / NON-CLOSABLE** because an admission/work-binding bypass was reproduced. It is defect evidence only and must not be sealed or promoted.

### Future candidate

The repaired dependency-current SMR021 subject does not exist until exact SMR020 custody is restored and the bounded repair below is applied. It must receive a new exact source/test identity and independent qualification.

## 3. Reproduced defect to close

The failed `ca2c9348...` overlay allowed a command for `work-B` to be accepted using PLATFORM-006 admission evidence routed for `work-A`.

Root cause preserved by `USEREXPERIENCE001-ADVERSARIAL-RECONCILIATION-001.md`:

- the admission projection discarded route `workId`;
- admitted actions could be supplied as a free `Set<String>` rather than being immutably bound to the selected descriptor/admission evidence;
- submit-time checks therefore could not prove that the command work and action were the work/action actually admitted by the route decision.

Observed proof:

`ADMISSION_BYPASS_REPRODUCED work=work-B action=APPROVE routed_work=work-A routed_capability=CAP-UNRELATED-QUALIFIED`

This is a classic authority-binding failure: a valid admission for one work/capability must not become authority for another work or for caller-injected actions.

## 4. Historical file-layout evidence

The recovered immutable v2.0.24 carrier confirms the relevant historical touchpoints:

- `src/main/java/org/systemmaster/core/ExperienceAdmission.java`
- `src/main/java/org/systemmaster/core/UserExperienceService.java`
- `src/main/java/org/systemmaster/core/CapabilityRouteDecision.java`
- `src/main/java/org/systemmaster/core/CapabilityDescriptor.java`
- `src/main/java/org/systemmaster/core/CapabilityDescriptorDigests.java`
- `src/test/java/org/systemmaster/core/UserExperiencePortableTests.java`
- `07_DATABASE/migrations/051_user_experience_001_hardening.up.sql`
- `07_DATABASE/migrations/051_user_experience_001_hardening.down.sql`
- `tools/verify_userexperience001_authority.py`
- USER-EXPERIENCE JSON Schema contracts under `02_FOUNDATION/schemas/`

Historical `CapabilityRouteDecision` already contains `descriptorDigest` and `workId`. Historical `CapabilityDescriptorDigests.sha256(...)` canonically binds descriptor content. Historical `ExperienceAdmission`, however, contains principal/session/free `admittedActions`/evidence reference and no work identity or descriptor identity/digest. Historical `UserExperienceService.submit(...)` checks action membership and admission evidence but has no admission work identity to compare with `proposed.workId()`.

These historical paths are evidence of the semantic shape only. After exact SMR020 recovery, map them to the dependency-current files before changing code.

## 5. Mandatory pre-mutation cross-owner gate

Before implementing action binding, inspect the recovered exact SMR020 PLATFORM-006 descriptor/admission contract and answer one question with executable evidence:

**Where is the immutable descriptor-owned action grant represented?**

Allowed dispositions:

1. `EXISTING_DESCRIPTOR_ACTION_GRANT` — exact current descriptor content already exposes an immutable action set/contract that is included in the route-bound descriptor digest. USER-EXPERIENCE may project that already-authorized set.
2. `DERIVABLE_FROM_EXISTING_DESCRIPTOR_CONTRACT` — a deterministic, repository-defined mapping from immutable descriptor fields/contracts to USER-EXPERIENCE actions already exists and is covered by PLATFORM-006 evidence. USER-EXPERIENCE may consume that mapping without minting new authority.
3. `NO_DESCRIPTOR_ACTION_GRANT` — no such current owner-defined representation exists. **STOP.** Do not invent a UX-local action allowlist and do not silently extend PLATFORM-006 from the USER-EXPERIENCE repair. Record a cross-owner contract dependency for the canonical PLATFORM-006 owner.

`protocolBindings`, semantic tags, purpose text, capability names, or other generic metadata must not be interpreted as action authority unless the recovered current PLATFORM-006 contract explicitly defines that interpretation.

## 6. Minimum dependency-current repair contract

If and only if the pre-mutation gate returns disposition 1 or 2, implement the minimum repair on the exact recovered SMR020 lineage.

### A. Admission projection binding

The dependency-current equivalent of `ExperienceAdmission` must preserve enough immutable route/descriptor evidence to verify at submit time:

- admitted `workId` from the exact PLATFORM-006 route decision;
- selected capability/descriptor identity required by the current contract;
- route-bound descriptor digest;
- principal/session binding already required by current control;
- admitted action projection derived only from the current owner-defined descriptor action grant, never from a free caller-supplied set;
- admission evidence reference/identity required by the current contract.

Do not duplicate PLATFORM-006 admission logic or mint capability authority inside USER-EXPERIENCE.

### B. Submit-time fail-closed checks

The dependency-current equivalent of `UserExperienceService.submit(...)` must reject before durable append when any of these is false:

1. command work version equals the authoritative work version;
2. command `workId` exactly equals admission/route `workId`;
3. command principal and session exactly equal the admitted principal/session;
4. command action belongs to the descriptor-bound admitted action grant;
5. selected descriptor identity and digest still match the route-bound evidence under the current PLATFORM-006 contract;
6. selected descriptor remains `QUALIFIED` where current admission semantics require it;
7. USER-EXPERIENCE remains permitted by the current descriptor caller allowlist;
8. command admission reference equals the bound admission evidence reference;
9. target authority is not `USER-EXPERIENCE-001`;
10. approval/control actions retain their approval-reference requirement;
11. no effect execution occurs inside USER-EXPERIENCE.

No failed authorization attempt may append a durable intent row or mutate attention state as a side effect.

### C. R025 database-parity transplant

Transplant the semantic controls already proven by `USEREXPERIENCE001_R025_DB_PARITY_REPAIR_001.patch` into the dependency-current migration/schema/verifier shape, without assuming historical migration numbering:

- reject persisted `target_authority = USER-EXPERIENCE-001`;
- globally bound nullable `approval_ref` length while keeping approval-action presence as a separate rule;
- globally bound nullable attention `action_capability_id` length;
- globally bound nullable attention `evidence_ref` length while keeping CRITICAL evidence presence separate;
- provide symmetric down/rollback migration behavior where the current migration system requires it;
- make all added database controls qualification-visible.

## 7. Focused adversarial micro-gate — run first

Before the full campaign, the changed candidate must prove all of these on deterministic independent fixtures:

1. `SAME_WORK_ALLOWED_ACTION_PASS` — valid current route + exact work + descriptor-authorized action records intent.
2. `CROSS_WORK_REJECT` — route for `work-A` cannot authorize command for `work-B`.
3. `FREE_ACTION_INJECTION_REJECT` — caller cannot add an action absent from descriptor-bound authorization.
4. `DESCRIPTOR_DIGEST_MISMATCH_REJECT` — changed/stale descriptor content cannot reuse old route evidence.
5. `DESCRIPTOR_IDENTITY_MISMATCH_REJECT` — unrelated qualified descriptor cannot substitute for the selected descriptor.
6. `UNQUALIFIED_DESCRIPTOR_REJECT` — non-qualified descriptor cannot authorize when qualification is required.
7. `CALLER_ALLOWLIST_REJECT` — descriptor that does not admit USER-EXPERIENCE fails closed.
8. `PRINCIPAL_MISMATCH_REJECT`.
9. `SESSION_MISMATCH_REJECT`.
10. `ADMISSION_EVIDENCE_MISMATCH_REJECT`.
11. `STALE_WORK_VERSION_REJECT`.
12. `SELF_EFFECT_AUTHORITY_REJECT`.
13. `APPROVAL_REFERENCE_REQUIRED`.
14. `NO_FAILED_ATTEMPT_PERSISTENCE` — every rejected authorization case leaves command persistence unchanged.
15. `NO_EFFECT_EXECUTION` — USER-EXPERIENCE still cannot execute the requested effect.

The old reproduced `work-A -> work-B` bypass must be included as an exact regression fixture.

A failure in this micro-gate blocks every later dependent qualification step.

## 8. Full portable qualification order

After the focused adversarial micro-gate passes on the changed exact subject, execute in this order and checkpoint each dependency-creating step:

1. strict Java 21 compile with `--release 21 -Xlint:all -Werror`;
2. focused USER-EXPERIENCE runtime/admission tests;
3. all repository executable predecessor/cumulative regression suites applicable to the recovered SMR020 lineage;
4. Java <-> JSON Schema contract parity;
5. Java/schema <-> PostgreSQL constraint parity;
6. explicit R025 database-parity recurrence, including all four repaired residual classes;
7. work-version freshness and idempotency conflict tests;
8. attention identity/dedupe/lifecycle/CAS-concurrency tests;
9. offline/cached-state vs server-confirmed-state truthfulness checks already required by current R025 semantics;
10. accessibility semantic/static contracts runnable in the portable environment, without converting them into device/screen-reader claims;
11. system coherence;
12. engineering congruence;
13. exact source/test subject recomputation and mutation check;
14. release-manifest regeneration + independent size/SHA verification;
15. deterministic release rebuild only if the dependency-current rebuild contract still requires it.

Record the new exact source/test subject and every changed file before any closure claim.

## 9. Hosted and A-01 boundary

Portable PASS is not hosted PASS.

After the exact changed dependency-current subject is placed in ordinary GitHub-native immutable custody:

1. run the repository-owned hosted exact-SHA prequalification on that same subject if such a gate is defined/required;
2. preserve checkout identity and evidence artifact references;
3. only then evaluate whether a distinct registered A-01 qualification has a justified evidence delta.

Do not modify the frozen A-01 control plane to solve a USER-EXPERIENCE subject defect. Do not queue A-01 merely because the Windows runner is available.

## 10. Evidence fences

This repair/qualification may not claim any of the following without their own evidence:

- physical iPhone/iPad/Android/desktop behavior;
- VoiceOver, TalkBack, screen-reader or full-keyboard behavior;
- browser matrix, zoom, dynamic type, orientation, safe-area or measured touch-target behavior;
- usability-study results or human preference evidence;
- cross-device production continuity;
- live target PostgreSQL execution when not actually executed;
- A-01 PASS;
- production certification/promotion.

## 11. Exact resume point

Current first incomplete executable action:

`RECOVER EXACT SMR020 RUNNABLE PREDECESSOR -> RECOMPUTE 89066e56... BEFORE MUTATION -> VERIFY CURRENT PLATFORM-006 DESCRIPTOR ACTION-GRANT CONTRACT -> IF OWNER-DEFINED ACTION GRANT EXISTS, APPLY MINIMUM WORK/DESCRIPTOR/ACTION BINDING + R025 DB-PARITY TRANSPLANT -> RUN 15-CASE FOCUSED ADVERSARIAL MICRO-GATE -> RUN FULL PORTABLE CAMPAIGN -> GENERATE NEW EXACT SMR021 SUBJECT.`

If exact source custody remains unavailable, this packet is the durable day/Second-Shift handoff. Resume here; do not restart broad recovery research, historical R025 replay, database-parity discovery, or admission-bypass discovery.
