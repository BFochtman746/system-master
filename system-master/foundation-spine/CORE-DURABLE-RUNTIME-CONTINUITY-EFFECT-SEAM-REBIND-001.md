# CORE Durable Runtime Continuity Effect Seam Rebind 001

Status: RECOVER / INVENTORY / ANALYZE / ADJUDICATE / CONSUMER-SIDE DESIGN LOCK COMPLETE  
Current Effect Authority implementation: NOT FROZEN BY THIS UNIT  
Durable Runtime build against this seam: NOT AUTHORIZED YET  
Historical PASS/A-01 transfer: NONE

Exact live Foundation owner reread immediately before mutation remained `system-master/control-v2@54de1268b1036f966dd9235f5463e430ab1fcd19`.

Recovered donor lineage: `system-master/f-wp-012-a01@18409bb44e355bc18febe5706ccf6b2ddcd63268` plus the current G-WP continuity recovery substrate already mapped by the predecessor artifacts.

## 1. Authority lock

The System Specification is decisive: **Effect / Action Authority** owns commit-time authorization, effect identity, idempotency/conflict identity, least-privilege effect capability, immutable effect receipts, compensation metadata and unknown-commit reconciliation entry.

Durable Runtime owns execution continuity around the effect. It may persist effect intent/receipt/reconciliation references, prevent unsafe reissue, recover after lost acknowledgements and preserve UNKNOWN/RECONCILING. It may not grant effect permission, infer business success, or absorb specialist semantics.

Owner collision after adjudication: **0 for the consumer-side semantic boundary**. The provider/service implementation remains unresolved and is not invented here.

## 2. Exact F-WP path classification

| Historical path | Recovered behavior | Disposition | Current rebind |
|---|---|---|---|
| `f-wp-006/.../ExecutionGrantContracts.java` | content-bound eligibility snapshot; exact revision/target/policy/principal/action/approval/prerequisite/window/recovery binding; expiring non-transferable grant; revocation epoch | **ADAPT / CONSOLIDATE** | split bundled private standings into current owner receipts: Identity/Delegation, Security/Policy, Contracts, Resource, route/placement as applicable; retain exact-subject + expiry + non-transferability + digest mechanics for Effect Authority grant |
| `f-wp-006/.../ExecutionGrantIssuer.java` | fail-closed issue/use validation; current snapshot revalidation; principal/action/target/expiry/revocation checks | **ADAPT** | current Effect Authority may issue commit capability only after consuming fresh owner receipts; no generic F-WP authorization snapshot becomes authority |
| `f-wp-007/.../CoordinationContracts.java` | effect intent digest, effect standings, observation receipt requirement, reconciliation decision digest, command semantic identity | **ADAPT** | effect intent/observation/reconciliation shapes are strong donor semantics; private `GrantRef` and `ExecutionLease` are rebound to Identity/Effect and Runtime/Placement refs |
| `f-wp-007/.../ChangeCoordinator.java` | command idempotency, target conflict, effect intent/observation, UNKNOWN/DIVERGED reconciliation, retry-safe only after NOT_APPLIED, pause/halt/cancel | **ADAPT SEMANTICS / QUALIFIER_ONLY STORAGE** | semantic logic reusable; its `Files.writeString(...APPEND)` journal has no explicit fsync, checksum, OS lock or atomic multi-record commit and is not current durable authority; completion state also cannot replace Evidence/Completion owners |
| `f-wp-007/.../ExecutionLeaseManager.java` | monotonic execution epoch + fence token + expiry + trusted-time checks | **CONSOLIDATE** | fencing mechanic reusable, but exact authoritative fence owner must be Durable Runtime/Placement; Effect Authority consumes the current fence rather than creating a competing placement truth |
| `f-wp-007/.../ConflictDetector.java` | overlapping target conflict disposition | **ADAPT** | reusable effect-conflict input, but exact conflict identity must be Effect-owned and route/resource/work collisions remain their owners' responsibilities |
| `f-wp-008/.../ChangeVerifier.java` | executor exit insufficient; required evidence classes/authorities; unresolved evidence remains VERIFYING/FAILED or exact residual exception | **CONSOLIDATE / PROVENANCE** | verification rule is valuable, but final evidence standing and completion decision belong to Evidence/Assurance + owning domain/completion boundary; Effect Authority returns receipts rather than certifying whole Work completion |
| `f-wp-008/.../EvidencePublisher.java` | content refs only, raw evidence payload prohibited, content-bound step receipt identity | **PROVENANCE_ONLY IMPLEMENTATION / ADAPT SEMANTICS** | implementation is in-memory maps and cannot be current Evidence authority; retain no-secret/raw-payload and receipt-binding requirements through current Evidence service |
| `f-wp-008/.../IntegrityQuarantineService.java` | quarantine until current evidence-backed reconciliation | **PROVENANCE_ONLY IMPLEMENTATION / ADAPT SEMANTICS** | implementation is in-memory maps; quarantine semantics move to current durable owner/evidence/recovery contracts |
| `f-wp-009/.../RecoveryCoordinator.java` | current security/key/credential/policy/provider/release/compatibility standing dominates historical rollback target; roll-forward first-class | **ADAPT / CONSOLIDATE** | effect recovery must re-read current owner receipts; broad private eligibility snapshot decomposes into current authorities; no historical target self-authorizes rollback |
| `f-wp-009/.../RecoveryEligibilityContracts.java` | current eligibility/compatibility digest contract | **ADAPT** | replace private multi-owner standing enums with exact current receipts/digests from Identity, Contracts, Security, provider/routing and release owners |
| F-WP-012 contract/migration/crosswalk paths | explicit contract versioning, legacy crosswalk, idempotent migration, digest verification, ordered export | **CONSOLIDATE / PROVENANCE** | current Contracts & Versioning freeze already owns structural/version truth; retain donor migration/crosswalk mechanics only where current Contracts admits them |

No `REUSE AS-IS` classification is authorized for the Effect seam. Every recovered path either embeds historical multi-owner assumptions or lacks the durability/authority separation required by the current System Specification.

## 3. Consumer-side semantic contract freeze

The following semantic objects are frozen as the **minimum information Durable Runtime must consume/persist**. Names are design identifiers, not proof of an implemented external API.

### E1 — EffectIntentRef

Required semantic fields:

- immutable effect intent id;
- exact owning authority id;
- exact Work / Job / Attempt lineage refs available at the time of request;
- exact governed goal/plan-step refs where available;
- target identity/digest;
- operation/action identity;
- request/payload semantic digest;
- idempotency/conflict identity;
- current effect-authorization capability/receipt ref;
- current runtime/placement fence ref;
- created-at/logical-time evidence;
- contract version/digest.

It contains no secret values and no specialist payload semantics beyond opaque/digest-bound refs.

### E2 — EffectAuthorizationReceiptRef

Required semantics:

- exact effect intent/subject binding;
- authorization decision `ALLOW | DENY | UNKNOWN` or current equivalent;
- current principal/delegation receipt ref;
- exact allowed action/targets;
- issue/evaluation time;
- expiry;
- authorization generation/revocation binding;
- policy/security decision refs;
- required resource/route/placement refs if the effect contract declares them prerequisites;
- receipt digest/version.

`UNKNOWN`, expired, stale, revoked or subject-mismatched authorization cannot permit commit.

### E3 — EffectObservationRef

Required semantics:

- exact effect intent id;
- observation identity/digest;
- observed standing `APPLIED | NOT_APPLIED | UNKNOWN | DIVERGED | COMPENSATED` or current mapped equivalent;
- immutable provider/tool/external receipt ref when required;
- observed-at/source-authority;
- evidence refs/classification;
- contract version/digest.

Process exit, transport acknowledgement or tool-return success alone cannot be promoted to `APPLIED` unless the Effect Authority contract defines and verifies that receipt as authoritative.

### E4 — EffectReconciliationDecisionRef

Required semantics:

- exact effect intent + prior observation binding;
- resolved standing;
- explicit `retrySafe` or equivalent new-effect eligibility;
- evidence refs/digest;
- current authority/principal/policy/contract checks used for the decision;
- decision identity/digest/time;
- compensation metadata/ref if applicable.

A reconciliation decision may resolve uncertainty; it may not rewrite prior observations or claim reversal of an irreversible effect.

## 4. Commit-time sequence lock

For a consequential external mutation, Durable Runtime must follow this sequence:

1. re-read current durable Job/Attempt/fence state;
2. re-read or obtain current Effect Authority authorization bound to the exact E1 subject;
3. fail closed if Identity/Delegation, Security/Policy, Contracts, required Resource/Route/Placement standing or effect authorization is stale/unknown/denied;
4. durably persist E1 plus the exact authorization ref before issuing an unsafe external mutation where recovery requires the intent to be discoverable;
5. perform the external effect through the permitted gateway/provider boundary;
6. persist the authoritative E3 observation/receipt as soon as available;
7. if the response is lost/ambiguous, transition runtime effect state to `UNKNOWN/RECONCILING`, never to success or not-applied by guess;
8. query/reconcile through Effect Authority/provider-safe mechanisms;
9. only an authoritative `NOT_APPLIED`/equivalent disposition may make a **new** effect attempt eligible; retry is never inferred merely from timeout;
10. evidence/outbox emission is durable/replayable but does not itself change effect standing;
11. Work/Plan/Job completion consumes the Effect result and Evidence standing through their owners; Effect Authority does not close specialist/domain work.

## 5. Runtime persistence binding

The previously frozen P6 Effect Reconciliation record family SHALL persist only Runtime-owned continuity facts plus exact E1-E4 refs/digests.

Atomic TX5 remains:

- exact intent/ref precondition;
- observation digest;
- resulting runtime reconciliation state;
- external receipt ref if observed;
- observation/reconciliation idempotency receipt;
- evidence-outbox intent.

The Effect Authority receipt is foreign truth. Runtime may cache/project it but cannot edit it.

## 6. Idempotency and conflict lock

Recovered F-WP mechanics are retained:

- transport delivery identity is not effect idempotency identity;
- same idempotency identity + same semantic digest reconciles to the same logical effect result;
- same identity + different semantic digest is a conflict and must fail closed;
- effect target/operation conflicts are explicit, not silently serialized by accident;
- authorization is bound to the exact action and targets and is non-transferable;
- current authorization/revocation generation is checked at use, not only issue;
- an expired effect capability cannot be refreshed by Runtime; it requires Effect Authority reevaluation.

## 7. Fence ownership guard

Historical F-WP `ExecutionLeaseManager` and G-WP recovery claims both contain useful monotonic-fence mechanics. They cannot both become authoritative current placement/execution fence generators.

Current design rule:

- exactly one current authority owns the executor mutation fence for an Attempt;
- Effect Authority consumes that fence as a commit prerequisite where required;
- Durable Runtime stores/enforces the current fence as part of Attempt execution;
- Placement may own assignment/placement lease and may also own the fence if the final Placement contract freezes it there;
- historical change/recovery lease objects remain donor mechanics until that boundary is resolved.

Therefore `FENCED_STALE_EXECUTOR` behavior is retained as an invariant; F-WP's private epoch/token generator is not retained as current authority.

## 8. Evidence / verification guard

F-WP-008 establishes two valuable rules that are frozen here:

- executor/process exit status alone cannot establish effect or Work success;
- evidence must be current, exact-subject bound, classed and sourced from required authorities.

However `EvidencePublisher` and `IntegrityQuarantineService` are in-memory donor implementations. They are `PROVENANCE_ONLY` as durable implementations and may not be used to satisfy current Evidence/Assurance persistence.

## 9. Recovery guard

F-WP-009 recovery logic is retained only as a current-standing principle:

- current prohibition/revocation dominates historical eligibility;
- UNKNOWN critical security/provider/release/compatibility standing blocks consequential recovery;
- incompatible schema/data standing blocks rollback/restore;
- roll-forward is a first-class governed recovery action rather than an undocumented hotfix;
- the exact recovery target and eligibility snapshot/receipts are rebound at authorization time.

Current Contracts & Versioning, Identity, Security, provider/routing, Effect Authority and specialist owner receipts must replace the historical private aggregate snapshot.

## 10. Effect-seam isolated qualification denominator

A future implementation of the current Effect Authority seam plus Durable Runtime adapter must satisfy this **48-case minimum**, in addition to the non-shrinkable 80-case persistence denominator. Overlap may be cross-referenced but not used to omit a required behavior.

- exact intent/subject/target/action/digest binding: **6**
- authorization issue/use expiry/revocation/current-subject revalidation: **8**
- semantic idempotency and conflicting-key/target cases: **6**
- fence/stale executor and reassignment interaction: **4**
- APPLIED / NOT_APPLIED / UNKNOWN / DIVERGED / lost-ack reconciliation: **10**
- pause/halt/cancel/irreversibility/compensation boundaries: **4**
- current recovery/security/compatibility/provider standing changes: **4**
- evidence receipt/current-subject/class/source/minimization cases: **4**
- restart rediscovery after intent-before-effect and effect-before-local-observation crash points: **2**

Total: **48 cases**.

This is a frozen test obligation, not PASS evidence.

## 11. Remaining blockers

- `BLOCKED_EFFECT_AUTHORITY_IMPLEMENTATION_NOT_CURRENT` — the consumer-side semantic contract is frozen, but a current exact Effect Authority service/runtime is not established by this unit.
- `BLOCKED_RECOVERY_SOURCE_AUTHORITY` — Work/Project and Orchestration refs needed for full causal lineage remain unresolved.
- `BLOCKED_RESOURCE_ADMISSION_INTERFACE_NOT_BOUND` — exact current grant contract absent.
- `BLOCKED_ROUTING_PLACEMENT_INTERFACE_NOT_BOUND` — authoritative fence/assignment owner unresolved.
- `BLOCKED_TRANSPORT_REDISCOVERY_CONTRACT_NOT_BOUND` — delivery seam absent.
- `BLOCKED_EVIDENCE_ASSURANCE_INTERFACE_NOT_BOUND` — exact durable evidence ingestion/standing service absent.
- `BLOCKED_SECURITY_POLICY_BINDING_NOT_BOUND` — exact current shared security/secret interface absent.
- `BLOCKED_FRESH_QUALIFICATION_NOT_RUN` — there is no changed current implementation to qualify.
- `BLOCKED_NATIVE_A01_PRODUCTION_EVIDENCE_NOT_EXECUTED` — no such standing is claimed.

## 12. One dependency-valid successor

**`CORE-DURABLE-RUNTIME-CONTINUITY-EVIDENCE-SEAM-REBIND-001`**

Recover and bind the current/historical Evidence, Provenance & Assurance seam needed by continuity: durable evidence intent/outbox, immutable evidence identity, exact subject/digest/class/source/freshness, claim-support linkage, invalidation on material subject change, quarantine/corruption findings and qualification-class separation. Reuse F-WP-008/G-WP evidence semantics where owner-correct, but reject their in-memory/private evidence stores as current authority. Freeze the consumed continuity Evidence contract and additive qualification denominator only if owner collision = 0. Do not build until the exact durable Evidence authority interface is resolved.

If a newer live owner head or current Evidence artifact appears, re-read it before mutation.

## 13. Evidence fence

This unit freezes only the consumer-side Effect semantic boundary and test obligation. It claims no current Effect Authority implementation, no external effect execution, no provider standing, no historical PASS transfer, no A-01/native/production standing, no human evidence, and no Book/Learning/Documents/Programming correctness.