# Canonical Work Chain Recovery Inventory 001

## Standing

Operation: `CORE-WORK-CHAIN-RECOVERY-INVENTORY-001`

Base live owner subject re-read before mutation: `system-master/control-v2@8308c2861e0bc9a95f7cae9531a68b365f4014c2`.

This artifact is **RECOVERY / INVENTORY / ANALYSIS / ADJUDICATION evidence only**. It does not create Work, Plan, Resource, Route, Placement, Runtime, Transport, Effect, Artifact, Evidence or Recovery authority. Historical F-WP qualification is donor provenance and is not transferred to any changed/fresh subject.

The fresh Keel predecessor is now hosted-qualified and frozen. The downstream Work Chain is not yet design-locked because the current branch does not yet contain a lossless fresh authority for Work/Project, Plan/Step, Route, Placement, Durable Job/Attempt, Context/Invocation or Effect commit truth.

## Method checkpoint

- **RECOVER:** current-lineage F-WP-001 through F-WP-012 control requirements, source-slice manifests and qualification surfaces re-read from the exact owner base.
- **INVENTORY:** all sixty historical `F-RQ-001..F-RQ-060` identities are accounted. F-RQ-001..058 have direct package requirement declarations; F-RQ-059/060 are package-owned by F-WP-001 and are enforced by the recovered qualification test/traceability fixture.
- **ANALYZE:** F-WP is predominantly change-governance substrate. It contains valuable generic mechanics, but it is not permission to rename Change truth into Work/Project, Orchestration, Resource, Runtime or Effect truth.
- **TARGETED RESEARCH:** no external research is triggered for this unit. The material question is repository authority/ownership, for which the constitutional specification, fresh Foundation freezes and exact recovered code/control artifacts are higher-authority evidence than external design literature.
- **ADJUDICATE:** reuse is allowed only at the mechanism/contract level after fresh owner rebinding. Historical semantic authority remains historical until a target owner is explicitly frozen.
- **DESIGN-LOCK / BUILD:** intentionally not entered for downstream systems in this unit because path-level owner/state/contract recovery is not yet lossless.

## Constitutional owner rule

The canonical chain remains:

`Governed Goal/Intent -> Work/Project -> Plan/Step -> Policy Decision Set -> Provisional Admission -> Capability Route -> Resource Grant -> Assignment -> Durable Job -> Attempt/Fence -> Context -> Invocation -> Effect Receipt -> Resulting State/Artifact -> Evidence -> Completion/Recovery`.

No stage may silently own the next stage. A reference to downstream authority is not the authority itself. In particular:

- Keel owns governed intent and ceilings, not Work/Project or execution authority.
- Identity owns concrete principal/delegation standing, not Keel ceilings or effects.
- Contracts owns structural compatibility/admission, not semantic/effect authorization.
- Resource admission/grants do not imply routing, placement or effect permission.
- routing does not imply placement; placement does not imply runtime lease/fence; runtime authority does not imply external-effect permission.
- evidence records observed/proven facts; it does not retroactively authorize an effect.
- Book, Learning, Documents and Programming specialist truth remains outside Foundation/Spine.

## Canonical path-level recovery map

| Chain stage | Current/recovered substrate | Durable state / contract evidence | Current adjudication | Blocking gap before fresh design/build |
|---|---|---|---|---|
| Governed Goal / Intent | Fresh `KeelAuthorityRuntime` | immutable goal revisions, append-only Keel journal, `GovernedGoalRefV1`, `KeelValidationReceiptV1` | **CURRENT — HOSTED QUALIFIED** | native/A-01/production evidence remains separate |
| Work / Project | F-WP ChangeRegistry is change-governance truth, not generic Work truth | durable ChangeRecord/ChangeEvent patterns, OCC, stable identity | **DONOR MECHANICS ONLY** | recover long-lived Work/Project authority and project/work lifecycle without duplicating job truth |
| Plan / Step | F-WP-004 recovery/verification plans; F-WP-007 change coordinator | exact recovery/verification plan binding and append-durable change progress | **QUALIFIER/DONOR ONLY** | recover generic Orchestrator Plan/Step lineage and eliminate duplicate runtime/checkpoint truth |
| Policy Decision Set | F-WP-003 assessment/policy + F-WP-005 approval/authorization | risk/context snapshots, approval bindings, emergency/break-glass refs | **DONOR / CROSS-OWNER** | bind fresh policy-decision receipt boundary; Identity/Keel/Effect owners remain distinct |
| Provisional Admission | F-WP-006 execution eligibility | exact qualified snapshot, fail-closed unknown prerequisites | **DONOR MECHANICS** | fresh Resource Admission owner/model not yet recovered losslessly |
| Capability Route | no current F-WP package owns generic capability routing | none authoritative in this current-lineage pass | **OPEN** | recover capability registry/routing substrate and exact route snapshot contract |
| Resource Grant | F-WP-006 `ExecutionGrantContracts` / `ExecutionGrantIssuer` | scoped/expiring/non-transferable change execution grant | **DONOR MECHANICS** | fresh route-bound resource grant/accounting/budget authority required |
| Assignment / Placement | F-WP-007 lease/fence is coordination, not executor placement | epoch/fence/lease coordination state | **DONOR MECHANICS** | recover executor eligibility/filter/score/assignment/drain/reassignment authority |
| Durable Job | F-WP-007 durable change progress is not generic Job truth | reconstructable change execution progress | **DONOR MECHANICS** | recover sole durable Job authority; Orchestrator must reference rather than duplicate it |
| Attempt / Fence | F-WP-007 `ExecutionLeaseManager` | current execution epoch + fence token and trusted-time dependency | **STRONG DONOR MECHANIC** | bind fresh Job/Attempt identity to placement, resource grant and current fence |
| Context | no F-WP current authority | only references/assessment inputs | **OPEN** | recover shared Context/Memory/Retrieval authority and source/freshness/privacy receipt |
| Invocation | F-WP-007 cross-system reconciliation and idempotency patterns | durable intent/observation/reconciliation; no distributed ACID claim | **DONOR MECHANICS** | recover model/tool invocation identity and contract without importing effect authority |
| Effect Receipt | F-WP-008 `EvidencePublisher` records change-step receipts | content-bound append-only consequential-step receipt | **EVIDENCE DONOR ONLY** | recover separate commit-time Effect/Action Authority and UNKNOWN_COMMIT reconciliation |
| Resulting State / Artifact | no generic F-WP Artifact authority | change target/evidence references only | **OPEN** | recover Artifact Gateway and canonical state lineage; specialist artifact semantics stay external |
| Evidence | F-WP-008 verifier/evidence/quarantine | verification criteria, append-only evidence refs, quarantine | **STRONG DONOR SUBSTRATE** | bind whole-chain evidence freshness/trust/checkpoint semantics to fresh causal IDs |
| Completion | F-WP-008 verifier + F-WP-011 query projection | verification-gated success and projection from durable truth | **DONOR MECHANICS** | define Work completion as evidence-backed projection without UI/query authority |
| Recovery | F-WP-004 + F-WP-009 | exact immutable recovery target, compatibility/security/provider/release re-evaluation, roll-forward plan | **STRONG DONOR SUBSTRATE** | recover integrated Work/Runtime/Transport/Effect/Resource/Data recovery classification |
| Transport / Delivery | F-WP-007 cross-system durable intent/observation/reconciliation only | no distributed ACID; idempotent coordination pattern | **PARTIAL DONOR** | recover inbox/outbox/dedup/replay delivery mechanics as non-domain authority |

## Lossless historical F-WP requirement census

Environment notation below is deliberately conservative: `HISTORICAL_HOSTED/LOCAL` means the recovered package has executable/local/hosted evidence in its own lineage; it does not imply fresh-subject, A-01, native or production standing.

| Requirement | Recovered component | Durable state | Interface / contract | Tests / evidence | Environment | Fresh disposition / blocker |
|---|---|---|---|---|---|---|
| F-RQ-001 | ChangeRegistry | immutable ChangeId | ChangeRegistry identity API | F-WP-002 qualification | HISTORICAL_HOSTED/LOCAL | reuse stable-ID mechanic only; Work identity needs fresh owner |
| F-RQ-002 | governance classification | ChangeType + RiskClass assessment | GovernanceContracts / policy path | F-WP-003 qualification | HISTORICAL_HOSTED/LOCAL | change semantic; generic policy receipt still open |
| F-RQ-003 | ChangeRegistry | exact target snapshot + digest | ChangeRegistry scope binding | F-WP-002 qualification | HISTORICAL_HOSTED/LOCAL | useful exact-subject mechanic; target semantics remain owner-specific |
| F-RQ-004 | ChangeRegistry | monotonic revision + content digest | ChangeRegistry revision API | F-WP-002 qualification | HISTORICAL_HOSTED/LOCAL | reuse OCC/version mechanic only |
| F-RQ-005 | AuthorityResolver | semantic owner reference | authority resolution contract | F-WP-003 qualification | HISTORICAL_HOSTED/LOCAL | preserve one-owner rule; fresh topology owner mapping governs |
| F-RQ-006 | ImpactAssessmentService | versioned impact assessment | assessment contract | F-WP-003 qualification | HISTORICAL_HOSTED/LOCAL | Change-only assessment; cannot become generic Work truth |
| F-RQ-007 | ImpactAssessmentService / policy | security/privacy impact standing | assessment/policy contract | F-WP-003 qualification | HISTORICAL_HOSTED/LOCAL | fail-closed mechanic reusable; Security/Privacy remains separate owner |
| F-RQ-008 | ChangePolicyEngine | exact risk/context policy snapshot | policy decision contract | F-WP-003 qualification | HISTORICAL_HOSTED/LOCAL | donor for policy-decision receipt, not authority transfer |
| F-RQ-009 | StandardChangeCatalog | versioned standard-change model | catalog match contract | F-WP-004 qualification | HISTORICAL_HOSTED/LOCAL | Change Governance only |
| F-RQ-010 | EmergencyChangeAuthority | bounded emergency scope/time/target/review | emergency authority contract | F-WP-005 qualification | HISTORICAL_HOSTED/LOCAL | donor mechanics; concrete authority must bind current Identity/Effect policy |
| F-RQ-011 | ApprovalOrchestrator | approval obligations + actor separation refs | approval contract | F-WP-005 qualification | HISTORICAL_HOSTED/LOCAL | human/identity evidence external; no fabricated approval |
| F-RQ-012 | ApprovalOrchestrator | exact revision/target/assessment/recovery-plan binding | approval receipt contract | F-WP-005 qualification | HISTORICAL_HOSTED/LOCAL | donor exact-binding mechanic |
| F-RQ-013 | ExecutionGrantIssuer | exact qualified prerequisite snapshot | execution eligibility/grant contract | F-WP-006 qualification | HISTORICAL_HOSTED/LOCAL | donor admission mechanic; fresh Resource/Effect ownership open |
| F-RQ-014 | ExecutionGrantIssuer | scoped expiring non-transferable grant | ExecutionGrantContracts | F-WP-006 qualification | HISTORICAL_HOSTED/LOCAL | donor capability/grant mechanics; current Identity/Resource/Effect split required |
| F-RQ-015 | ChangeCoordinator | idempotency key + request identity | execute command contract | F-WP-007 qualification | HISTORICAL_HOSTED/LOCAL | reusable command idempotency; generic invocation authority open |
| F-RQ-016 | ExecutionLeaseManager | execution epoch + fence token | lease/fence contract | F-WP-007 qualification | HISTORICAL_HOSTED/LOCAL | strong donor for Durable Runtime; fresh attempt binding open |
| F-RQ-017 | ConflictDetector | active target overlap disposition | conflict contract | F-WP-007 qualification | HISTORICAL_HOSTED/LOCAL | donor concurrency mechanic; route/placement conflict semantics open |
| F-RQ-018 | RecoveryPlanRegistry | recovery strategy + rationale | recovery plan contract | F-WP-004 qualification | HISTORICAL_HOSTED/LOCAL | donor recovery plan; not generic Plan/Step authority |
| F-RQ-019 | RecoveryPlanRegistry | exact immutable rollback target + compatibility identity | rollback target contract | F-WP-004 qualification | HISTORICAL_HOSTED/LOCAL | strong recovery donor |
| F-RQ-020 | RecoveryPlanRegistry | irreversible-step / point-of-no-return declaration | recovery contract | F-WP-004 qualification | HISTORICAL_HOSTED/LOCAL | donor; Effect Authority must govern consequential commit |
| F-RQ-021 | MaintenanceWindowService | timezone/start/end/action/target/override refs | maintenance-window contract | F-WP-004 qualification | HISTORICAL_HOSTED/LOCAL | donor time-policy mechanic; trusted-time owner external |
| F-RQ-022 | TimePolicyAdapter | trusted time evidence + skew | time-policy contract | F-WP-007 qualification | HISTORICAL_HOSTED/LOCAL | donor only; Runtime trusted-time policy requires fresh binding |
| F-RQ-023 | VerificationPlanService | versioned criteria bound to exact change revision | verification-plan contract | F-WP-004 qualification | HISTORICAL_HOSTED/LOCAL | donor success-criteria mechanic; generic plan authority open |
| F-RQ-024 | ChangeVerifier | authoritative changed-domain + observation evidence | verify contract | F-WP-008 qualification | HISTORICAL_HOSTED/LOCAL | strong Evidence donor; specialist truth stays with specialist owner |
| F-RQ-025 | ChangeVerifier | verification standing | verification outcome contract | F-WP-008 qualification | HISTORICAL_HOSTED/LOCAL | success requires all required criteria; reusable evidence rule |
| F-RQ-026 | ChangeCoordinator | append-durable execution progress | coordinator progress API | F-WP-007 qualification | HISTORICAL_HOSTED/LOCAL | donor runtime persistence, not generic Job truth |
| F-RQ-027 | EvidencePublisher | append-only content-bound consequential-step receipt | evidence publication contract | F-WP-008 qualification | HISTORICAL_HOSTED/LOCAL | evidence receipt is not effect authorization |
| F-RQ-028 | ChangeCoordinator | UNKNOWN external effect standing | reconciliation/retry contract | F-WP-007 qualification | HISTORICAL_HOSTED/LOCAL | strong donor for Effect reconciliation; generic Effect owner still open |
| F-RQ-029 | ChangeCoordinator | PAUSE/HALT standing + durable history | coordinator control contract | F-WP-007 qualification | HISTORICAL_HOSTED/LOCAL | donor Work/Runtime control mechanic; owner split unresolved |
| F-RQ-030 | ChangeCoordinator | cancellation standing + committed-effect history | cancel contract | F-WP-007 qualification | HISTORICAL_HOSTED/LOCAL | donor; cancel never means reversal |
| F-RQ-031 | RecoveryCoordinator | current security/data/provider/release eligibility refs | recovery initiation contract | F-WP-009 qualification | HISTORICAL_HOSTED/LOCAL | strong Recovery donor; current external standing required |
| F-RQ-032 | RecoveryCoordinator | exact roll-forward plan/scope/authority/evidence/target/migration refs | roll-forward contract | F-WP-009 qualification | HISTORICAL_HOSTED/LOCAL | strong Recovery donor |
| F-RQ-033 | CrossDomainContracts / ChangeCoordinatorAdapter | exact deployment binding ref | cross-domain deployment contract | F-WP-010 qualification | HISTORICAL_HOSTED/LOCAL | preserves deployment-owner boundary; no deployment mechanics imported |
| F-RQ-034 | CrossDomainContracts / ChangeCoordinatorAdapter | containment/freeze/quarantine command refs | cross-domain control contract | F-WP-010 qualification | HISTORICAL_HOSTED/LOCAL | Incident/containment authority remains external |
| F-RQ-035 | ChangeIncidentCorrelator | exact change revision + timeline correlation | correlation contract | F-WP-010 qualification | HISTORICAL_HOSTED/LOCAL | correlation only, never causal inference |
| F-RQ-036 | ChangeRegistry | append-only material event timeline | event append contract | F-WP-002 qualification | HISTORICAL_HOSTED/LOCAL | strong event-history donor |
| F-RQ-037 | ChangeQueryService | current projection from authoritative durable state/events | query contract | F-WP-011 qualification | HISTORICAL_HOSTED/LOCAL | projection cannot mutate/own authority |
| F-RQ-038 | ChangeQueryService | explicit current revision/risk/approval/execution/recovery/evidence freshness projection | query contract | F-WP-011 qualification | HISTORICAL_HOSTED/LOCAL | donor query semantics; fresh Work projection open |
| F-RQ-039 | GovernanceAuthorizationContracts | separately authorizable create/approve/execute/emergency/recovery/close actions | authorization contract | F-WP-005 qualification | HISTORICAL_HOSTED/LOCAL | donor action decomposition; current Identity/Effect binding required |
| F-RQ-040 | EvidencePublisher | classified sensitive evidence refs | evidence publication contract | F-WP-008 qualification | HISTORICAL_HOSTED/LOCAL | raw payload/secret dumping prohibited; Security owner external |
| F-RQ-041 | SecretReferenceValidator | opaque secret references | secret-reference contract | F-WP-005 qualification | HISTORICAL_HOSTED/LOCAL | donor validation; Secrets/Crypto owner external |
| F-RQ-042 | RecoveryEligibilityContracts | schema/state compatibility + migration obligations | recovery eligibility contract | F-WP-009 qualification | HISTORICAL_HOSTED/LOCAL | UNKNOWN/INCOMPATIBLE fail closed; current Contracts gate required |
| F-RQ-043 | CrossDomainContracts | provider standing + exit/concentration refs | provider-impact contract | F-WP-010 qualification | HISTORICAL_HOSTED/LOCAL | Provider Governance remains external |
| F-RQ-044 | CrossDomainContracts | current unexpired admission/capacity decision ref | resource-admission consumer contract | F-WP-010 qualification | HISTORICAL_HOSTED/LOCAL | strong dependency rule; fresh Resource Admission owner open |
| F-RQ-045 | ChangeQueryService | durable milestone-derived progress | progress query contract | F-WP-011 qualification | HISTORICAL_HOSTED/LOCAL | no fabricated percentage/completion; donor UX projection rule |
| F-RQ-046 | ChangeMetricsAdapter | versioned lead/execution/failure/recovery/rework observations | telemetry adapter contract | F-WP-010 qualification | HISTORICAL_HOSTED/LOCAL | Observability owns metrics; correlation is not causation |
| F-RQ-047 | CrossDomainContracts / adapter | durable review/corrective-action linkage | governance integration contract | F-WP-010 qualification | HISTORICAL_HOSTED/LOCAL | post-change review remains operator/governance authority |
| F-RQ-048 | RecoveryCoordinator | current prohibited/revoked security/key/credential/policy/provider/release standing | recovery currentness contract | F-WP-009 qualification | HISTORICAL_HOSTED/LOCAL | historical state cannot resurrect currently prohibited subject |
| F-RQ-049 | EmergencyChangeAuthority | principal/scope/reason/time/review refs | break-glass contract | F-WP-005 qualification | HISTORICAL_HOSTED/LOCAL | real principal and review evidence external |
| F-RQ-050 | ExecutionGrantIssuer | critical-currentness snapshot | grant eligibility contract | F-WP-006 qualification | HISTORICAL_HOSTED/LOCAL | UNKNOWN fails closed; donor admission/effect rule |
| F-RQ-051 | ChangeRegistry | expected-revision OCC state | mutation contract | F-WP-002 qualification | HISTORICAL_HOSTED/LOCAL | reusable concurrency mechanic |
| F-RQ-052 | ChangeRegistry | ChangeRecord + ChangeEvent atomic local transaction | mutation transaction contract | F-WP-002 qualification | HISTORICAL_HOSTED/LOCAL | donor atomicity mechanic; no distributed ACID inference |
| F-RQ-053 | ChangeCoordinator | durable intent/observation/reconciliation | cross-system action contract | F-WP-007 qualification | HISTORICAL_HOSTED/LOCAL | Transport/effect donor; explicitly no distributed ACID |
| F-RQ-054 | ContractRegistry | explicit logical contract versions | contract registry API | F-WP-012 qualification + fresh Contracts successor | HISTORICAL_HOSTED/LOCAL | **superseded by fresh Contracts authority for current contract truth** |
| F-RQ-055 | LegacyCrosswalkService | explicit legacy crosswalk + ambiguity quarantine | crosswalk contract | F-WP-012 qualification | HISTORICAL_HOSTED/LOCAL | donor migration mechanic; no legacy semantic owner transfer |
| F-RQ-056 | MigrationService | idempotent/resumable digest-verified migration + reconciliation report | migration contract | F-WP-012 qualification | HISTORICAL_HOSTED/LOCAL | donor migration mechanic; target owner contract required |
| F-RQ-057 | PortabilityService | ordered portable identity/version/evidence refs | export contract | F-WP-012 qualification | HISTORICAL_HOSTED/LOCAL | donor portability mechanic; secrets prohibited |
| F-RQ-058 | IntegrityQuarantineService | durable quarantine standing + reconciliation evidence refs | quarantine contract | F-WP-008 qualification | HISTORICAL_HOSTED/LOCAL | strong Assurance/Recovery donor; authority must bind fresh owner |
| F-RQ-059 | TraceabilityRegistry | 60-row bidirectional requirement trace graph | `ValidateTraceability` | F-WP-001 12-case qualification; exact component/API asserted by recovered test | HISTORICAL_HOSTED/LOCAL | **mechanic reused by fresh census; original source wording is fixture-bound, not separately declared in REQUIREMENTS.json** |
| F-RQ-060 | RebuildGovernance | independent architecture/implementation/qualification/production closure standings + evidence classes | `CloseArchitecturePacket` | F-WP-001 12-case qualification; false-claim rejection tests | HISTORICAL_HOSTED/LOCAL | **constitutional evidence-separation donor; original source wording is fixture-bound, not separately declared in REQUIREMENTS.json** |

### Census result

- Historical F-WP requirement identities expected: **60**.
- Accounted requirement identities: **60/60**.
- Duplicate IDs: **0**.
- Unaccounted historical F-WP IDs: **0**.
- Requirements authorized for direct semantic owner transfer to a fresh Foundation component: **0**.
- Requirements useful as donor mechanics/contracts/evidence patterns: **many, as explicitly dispositioned above**.

The historical F-WP census is therefore lossless **for the recovered F-WP requirement set**, but the **canonical Work Chain itself is not yet lossless** because current/recovered authority for several target stages has not yet been re-read and rebound.

## Missing Work Chain authority/evidence inventory

The following are blockers, not implicit design choices:

1. Long-lived Work/Project semantic authority and lifecycle.
2. Generic Plan/Step and Orchestrator persistence/lifecycle lineage.
3. Fresh policy-decision receipt composition across Identity/Keel/security/resource/effect boundaries.
4. Hierarchical Resource Admission/Budgeting and exact route-bound grants/accounting.
5. Capability Registry/Route snapshot authority.
6. Execution Placement eligibility/filter/score/assignment/drain/reassignment authority.
7. Sole Durable Job/Attempt/checkpoint/timer/signal/retry/cancel/outbox authority.
8. Transport inbox/outbox/dedup/replay as delivery-only truth.
9. Context/Memory/Retrieval receipt authority.
10. Invocation identity across model/tool gateways without effect authorization collapse.
11. Commit-time Effect/Action Authority and UNKNOWN_COMMIT reconciliation.
12. Artifact/canonical-state lineage and integrated evidence/completion/recovery closure.

None of those gaps authorizes inventing new semantics. Each must be recovered from current/recovered repository evidence first, owner-adjudicated against the constitutional target, then design-locked before changed-subject build.

## Evidence classes preserved

Historical package-local/hosted PASS remains historical donor evidence. This inventory claims no A-01 target execution, native behavior, production admission, real provider behavior, real human/author response, specialist semantic validity or publication evidence.

## Dependency-valid successor

Exactly one successor is bound:

**`CORE-WORK-PROJECT-RECOVERY-INVENTORY-001 — LONG-LIVED WORK/PROJECT AUTHORITY + ORCHESTRATOR LINEAGE RECOVERY -> OWNER/STATE/CONTRACT COLLISION ADJUDICATION`**

Scope of that successor is recovery/inventory only: locate the strongest Work/Project and Orchestrator substrate; map lifecycle, persistence, plan/step, checkpoint and downstream job references; prove which truth belongs above Durable Runtime; and identify duplicate execution/checkpoint authority. Do not design-lock Work/Project until those collisions are losslessly resolved. If that source lineage is unavailable, remain blocked on that seam and move to another independent Work Chain recovery seam rather than inventing it.
