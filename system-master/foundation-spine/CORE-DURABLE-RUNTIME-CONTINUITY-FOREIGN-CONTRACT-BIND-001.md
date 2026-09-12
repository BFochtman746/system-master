# CORE-DURABLE-RUNTIME-CONTINUITY-FOREIGN-CONTRACT-BIND-001

**Date:** 2026-09-12  
**Lane:** Foundation / Spine — Durable Runtime / Continuity  
**Parent subject reread before mutation:** `second-shift/core-durable-runtime-continuity-recovery-001-20260912@44c1750567489a11d5856c73cba8cecb53fb1fdf`  
**Live owner/control reread before mutation:** `system-master/control-v2@54de1268b1036f966dd9235f5463e430ab1fcd19`  
**Status:** `PARTIAL_FOREIGN_CONTRACT_BIND__IDENTITY_AND_CONTRACTS_CURRENT__KEEL_DESIGN_LOCK_ONLY__LOWER_SEAMS_PENDING`

## 1. Purpose

Begin the dependency-valid foreign-contract binding required before any continuity adapter/runtime mutation. This unit binds only current, explicit Foundation authority that is already available on `system-master/control-v2`; it does not invent missing Work/Project, Orchestration, Resource Admission, Routing, Placement, Transport, Effect, Evidence, Security, or specialist interfaces.

The current Durable Runtime substrate remains the exact bounded FOUNDATION-003 backend freshly portable-qualified by the preceding recovery unit. The 42-row G-WP-008..015 continuity census remains 42/42 accounted with zero unaccounted requirements for the bounded historical-to-current mapping.

## 2. Identity / Principal / Delegation — current hosted-qualified binding

Authoritative current artifacts:

- `identity/DELEGATION-FREEZE-001.md`
- `identity/DELEGATION-BUILD-TRACEABILITY.json`
- qualification class: `HOSTED_PORTABLE_REFERENCE_AUTHORITY_MECHANICS`
- exact qualified PR head: `4974e8fcd56cbc1bcd01c7bef7a89834c65654c7`
- exact qualified tree: `e1ce51830500ad14c99f47a65bfcd55b73c29a0f`
- frozen isolated denominator: 36 cases
- bounded invariants: 16/16, `unaccounted_requirement_count = 0`.

### Interfaces relevant to continuity

| continuity need | exact current Identity interface / object | authority meaning | freshness / revocation / UNKNOWN rule | Durable Runtime use |
|---|---|---|---|---|
| stable principal validity | `PrincipalAuthority` / `RegistryPrincipalAuthority` | current principal standing | re-read before authority use; unknown fails closed | store/reference principal id; never own identity truth |
| delegated capability standing | `CapabilityUseRequest` -> `CapabilityValidationReceipt` | validates current immutable grant + mutable standing + lineage + principal state | time/unknown fail closed; revocation terminal; generation advancement invalidates stale grants | require current validation receipt at authority-sensitive boundary; receipt is not effect permission |
| grant issuance lineage | `IssueGrantRequest`, immutable `CapabilityGrant` | create-once delegated authority record | strict attenuation; parent/subject/Keel/generation binding; command replay conflict on changed payload | opaque grant/ref only; Runtime does not mint grants |
| standing mutation | `StandingChangeRequest` | suspend/revoke current grant standing | revocation terminal | Runtime observes result through Identity, never mutates standing itself |
| authority generation | `AdvanceGenerationRequest` | invalidates stale grants without destructive rewrite | consumers must reject stale generation | bind resume/recovery authorization to current generation/receipt |
| Keel ceiling evidence | `DelegationCeilingReceipt` | receipt interface proving ceiling binding only | live Keel receipt authority remains external to Identity freeze | Runtime must not reinterpret as execution/effect permission |
| external authorization evidence | `ExternalAuthorizationReceipt` | opaque external authorization receipt seam | real external validator not executed | reference only; fail closed when required receipt cannot be validated |

### Bound continuity rows

- G-RQ-023, G-RQ-044, G-RQ-057, G-RQ-058, G-RQ-059, G-RQ-061, G-RQ-070 now have a **current concrete Identity-side interface family** rather than only historical role labels.
- Their remaining blockers are not erased: real provider/credential standing, live Keel validation, Effect Authority, Security/privacy, Work/Project and external/native evidence remain separate.
- `CapabilityValidationReceipt` explicitly cannot grant Effect Authority and cannot replace Placement or Durable Runtime lease/fence truth.

## 3. Contracts & Versioning — current hosted-qualified binding

Authoritative current artifacts:

- `contracts/CONTRACTS-VERSIONING-FREEZE-001.md`
- `contracts/CONTRACTS-BUILD-TRACEABILITY.json`
- qualification class: `HOSTED_PORTABLE_REFERENCE_CONTRACT_AUTHORITY_MECHANICS`
- exact qualified PR head: `777a2937f446ca2b28424915da5034fc3d04f2e1`
- exact qualified tree: `b9bd93bd1ba56997f3fc379794d5f574a0145fae`
- frozen isolated denominator: 48 cases
- bounded invariants: 30/30, `unaccounted_requirement_count = 0`.

### Interfaces relevant to continuity

| continuity need | exact current Contracts interface / object | authority meaning | failure / UNKNOWN rule | Durable Runtime use |
|---|---|---|---|---|
| exact structural/version identity | `ContractSubjectV1`, `ContractVersionV1` | canonical contract subject/version/digest/canonicalizer identity | unknown subject/version fails closed before mutation | checkpoint/runtime envelope binds exact refs/digests |
| compatibility decision | `CompatibilityPolicyV1`, `CompatibilityDecisionReceiptV1` | directional policy-bound validator decision over exact source/target bytes | `UNKNOWN` / validator error fails closed | do not infer compatibility from version arithmetic |
| migration edge | `MigrationEdgeV1` | immutable exact from->to migration identity | conflict halts; execution is downstream | Runtime may invoke a bound migration path but cannot invent one |
| migration checkpoint | `MigrationCheckpointV1` / `verifyMigrationCheckpoint` | binds migration input, edge and implementation identity | mismatch fails closed | suitable foreign contract for continuity checkpoint migration binding; production store still unclaimed |
| lifecycle standing | `ContractLifecycleV1`, `LifecycleStanding` | ACTIVE/DEPRECATED/SUNSET separately from compatibility | stale/rejected lifecycle gates fail closed as configured | currentness check where continuity policy requires it |
| structural pre-mutation gate | `GateReceipt` | exact structural/version evidence | rejected/unknown blocks mutation | receipt cannot grant Identity/Resource/Placement/Runtime/Effect authority |
| legacy mapping | `LegacyBinding` | quarantined current-owner mapping | ambiguous or stale owner fails closed | recovery import may consume only admitted mapping; no silent ownership transfer |
| exact-subject evidence | `ExactSubjectEvidence.qualifies` | changed subject invalidates historical evidence transfer | no PASS transfer | preserves qualification fencing during migration/recovery |

### Bound continuity rows

- G-RQ-021, G-RQ-035, G-RQ-051..056, G-RQ-060, G-RQ-066, G-RQ-006 and G-RQ-069 now have concrete current Contracts-side authority objects for exact identity, compatibility, migration, lifecycle and legacy-map quarantine.
- This does **not** mean the continuity adapters are implemented. `MigrationCheckpointV1` is a contract type/verification boundary; the Contracts freeze explicitly does not claim a production migration checkpoint store or migration execution.
- Real JSON-Schema/Proto/custom validator semantics and native/production durability remain unclaimed.

## 4. Intent / Keel — design-locked, not executable-current

Current artifact:

- `keel/KEEL-DESIGN-LOCK-001.md`
- recovery census: 32/32 bounded invariants, zero unaccounted rows
- frozen pre-build denominator: 56 isolated adversarial cases
- runtime build is not established by this unit.

### Design-locked interfaces relevant to continuity

- `GovernedGoalRefV1` — exact goal revision/digest/contract/validation receipt reference for downstream Work Chain binding.
- `KeelValidationReceiptV1` — proves only structural/semantic validity of the governed intent envelope.
- `DelegationCeilingV1` — upper bound only, never a concrete grant.
- `ResourceCeilingV1` — upper bound only, never a reservation/grant/accounting truth.
- `ActionEnvelopeV1` — allowed/forbidden action classes; allowed never implies route/effect/execution permission.
- `HumanControlRequirementV1` — requirement declaration only; cannot fabricate human evidence.

### Current standing

Keel is **DESIGN-LOCKED / NOT YET A CURRENT QUALIFIED RUNTIME PROVIDER** for continuity. Therefore G-RQ-016, G-RQ-041, G-RQ-058, G-RQ-067 and other policy-ceiling consumers may bind to these interface shapes for design, but build-time runtime dependency remains fail-closed until the Keel implementation is installed and qualified on an exact subject.

## 5. Collision adjudication

No collision is admitted among these first three foreign boundaries:

1. Identity owns concrete principal/delegation grant/standing/generation validation.
2. Contracts owns structural/version/compatibility/migration/lifecycle standing.
3. Keel owns governed intent and non-expanding ceilings, but current runtime standing is design-only.
4. Durable Runtime owns job/attempt/recovery/checkpoint/timer/signal/event/outbox-inbox/idempotency/fencing runtime facts.
5. None of these three can be interpreted as Effect Authority, Resource Admission, Routing, Placement, Work/Project, Orchestration or specialist-domain truth.

## 6. Remaining foreign-contract blockers

Still unbound at the current concrete implementation boundary:

- Work/Project Control + Orchestration current authoritative handoff/reconnect interface (`BLOCKED_RECOVERY_SOURCE_AUTHORITY` remains live on control-v2);
- Resource Admission grant/reacquisition decision interface;
- Routing and Placement assignment/currentness/reassignment interface;
- Transport durable rediscovery/delivery/replay interface;
- Effect Authority commit/unknown-outcome/receipt interface;
- Evidence/Provenance/Assurance ingestion/classification/closure interface;
- Security/privacy/secret-reference policy interface;
- executable qualified Keel runtime provider.

No adapter build is authorized while those missing current boundaries could force Durable Runtime to absorb foreign truth.

## 7. Evidence / environment fences

Identity and Contracts evidence is hosted-portable exact-subject evidence only. Keel is a design lock with a frozen future denominator. This unit does not claim:

- real human identity or credentials;
- real external identity/authorization provider validity;
- live Keel runtime receipt authority;
- real schema/format-validator semantics;
- live PostgreSQL continuity integration;
- A-01;
- target-native/device behavior;
- production durability/admission;
- Book/Learning/Documents/Programming semantics.

## 8. Dependency-valid continuation

Continue **`CORE-DURABLE-RUNTIME-CONTINUITY-FOREIGN-CONTRACT-BIND-001`** without widening runtime authority:

1. recover current Work/Project and Orchestration authority status first; if still source-authority blocked, preserve that blocker and do not synthesize handoff truth;
2. bind Resource Admission separately from Placement;
3. bind Routing separately from Placement and from Transport;
4. recover Transport, Effect, Evidence and Security exact current interfaces;
5. produce a collision matrix across all ten foreign boundaries;
6. freeze the additive continuity adapter qualification denominator only after every required current provider is concrete or explicitly blocked;
7. only then authorize changed runtime/adapter implementation.

**No historical PASS transfer. No A-01. No native/device. No production. No specialist-system authority.**
