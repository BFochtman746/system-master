# CORE Identity / Principal / Delegation — Recovery Inventory 001

Status: RECOVER + INVENTORY + ANALYZE + TARGETED RESEARCH + ADJUDICATE complete for the next delegation slice. BUILD is not authorized by this artifact.

Current owner baseline: `system-master/control-v2@f1c43abad0ea4e0ed5703e92ef0cbba4c08b380b`.

## Authority basis

The fresh Foundation `SYSTEM-SPECIFICATION.md` remains architecture authority. Identity / Principal / Delegation owns user, device, session, service and workload identity; actor chains; delegated authority; capability grants; expiry/revocation; and actor attribution. It must support short-lived workload identity and least-privilege delegation without absorbing Keel goals, plan semantics, effect permission, placement, resource scheduling or durable-runtime lease truth.

Constitutional constraints that directly govern this slice:

1. one truth owner per concept;
2. descendants cannot expand authority;
3. planning is not permission;
4. stale actors lose authority;
5. evidence claims cannot exceed evidence class;
6. secrets are references/capabilities, not payload content;
7. AI cannot self-grant capabilities, credentials, budget, rights, release standing or effect permission;
8. material subject change narrows/invalidates evidence;
9. architecture, implementation, qualification and production admission are separate facts.

The canonical Work Chain is preserved. Delegation authority is a causal input to work, not a replacement Work/Plan/Job truth.

## Recovered current substrate

### O-WP-001 — stable principal identity and lifecycle

Reusable current components:

- `IdentityContracts.Principal`, `PrincipalRevision`, `PrincipalAlias`, `MutationContext`;
- `PrincipalRegistry`;
- `IdentityJournalStore`;
- `IdentityMutationGate`.

Useful facts:

- durable stable principal identity and lifecycle exist;
- principal kinds are typed syntactically but the target USER/DEVICE/SESSION/SERVICE/WORKLOAD taxonomy is not yet enforced as one fresh contract;
- mutation context currently carries one `actorPrincipalRef` plus authority-evidence references, not an immutable actor/delegation chain;
- the mutation gate is deliberately an external authorization seam and never self-grants authority.

Standing: CURRENT reusable substrate; does not by itself close actor-chain or delegation semantics.

### O-WP-002 — proofing/enrollment

Current proofing/enrollment mechanics plus the evidence-authority seam are reusable. The public completion path requires an explicit evidence validator; transport assertions are not proofing truth. This strengthens the separation between authentication/proofing and authorization/delegation.

Hosted qualification for the reconciled candidate covered the existing 17 O-WP-002 cases, six evidence-authority adversarial cases, O-WP-001 predecessor regression, and System Root cumulative regression. The tested PR merge ref was `3bdb0475e8c309b0dd6a97661e9c965572d2921c`; the live merge is `f1c43abad0ea4e0ed5703e92ef0cbba4c08b380b`; both have tree `e055e0d52d6024e087e9c07d205cdde1394ae484`. Real human/provider validity, A-01, native and production standing remain unclaimed.

Standing: CURRENT hosted portable mechanics/evidence-authority substrate; not a capability/delegation authority.

### F-WP-005 — change-governance authorization/approval substrate

Reusable concepts:

- `AuthorizationEvidence` binds principal, action, resource, policy version, revocation epoch, standing and expiry;
- `PrincipalLineage` recognizes logical-principal equivalence for separation-of-duty checks;
- `EmergencyScope` binds targets, actions, time window, reason and post-event review;
- `AuthorizationAdapter` fails closed on principal/action/resource mismatch, stale revocation epoch, non-current standing and expiry.

Historical exact-subject evidence preserved by the F-WP-006 predecessor binding:

- qualified commit `9d5773603ee7469e4fb0203e9c5b9bfe3a6d7080`;
- workflow run `34179282695`;
- evidence artifact `10038336918`;
- evidence SHA-256 `52b65f167db0bcd666cd5cc6a290e48d09eb781836e2390dcf892a2b0e70ea98`;
- sentinel `PASS F-WP-005 tests=44 requirements=6`.

Adjudication: REUSE the scoped/expiring/revocable authorization semantics. DO NOT promote F-WP-005 change-governance authorization into the general Identity capability-grant truth without a fresh contract and qualification.

### F-WP-006 — execution-grant substrate

Reusable concepts:

- exact qualified eligibility snapshot;
- executor principal binding;
- action and target scope;
- authorization revocation epoch;
- bounded TTL;
- non-transferability;
- fail-closed current-use revalidation;
- digest-bound grant identity.

Historical exact-subject evidence preserved by the F-WP-007 predecessor binding:

- qualified commit `b285d292baa66651672e21324f841d0d9422d0ca`;
- workflow run `34184337694`;
- evidence artifact `10039980418`;
- evidence SHA-256 `a13c094b5b378cac6f98582df785c485f38d4a5faaa697cc1f7f5c1860ce8448`;
- sentinel `PASS F-WP-006 tests=33 requirements=3`.

Adjudication: REUSE grant attenuation/expiry/non-transferability/revocation patterns. KEEP execution permission separate from generic delegation/capability authority and from commit-time external-effect authority.

### F-WP-007 — coordination/lease/fence substrate

Reusable boundary evidence:

- idempotency-key conflict rejection;
- highest execution epoch / fence token wins;
- overlap detection;
- trusted-time requirement;
- durable progress/restart reconstruction;
- UNKNOWN effect reconciliation.

Historical exact-subject evidence preserved by the F-WP-008 predecessor binding:

- qualified commit `2bf878a012b5e0ad2bb3ba3602996d57104f8d34`;
- workflow run `34184777087`;
- evidence artifact `10040119363`;
- evidence SHA-256 `cf91480f8ec693e238111a30632ff16b1d3ffcfff97ce1dc938a11ca9679ef9f`;
- sentinel `PASS F-WP-007 tests=46 requirements=9`.

Adjudication: this is Durable Runtime / execution coordination truth, not Identity delegation truth. Identity may reference current fences/assignments where required but must not create a second lease/fence authority.

### F-WP-004 correction

The recovered `system-master/f-wp-004` package is maintenance/recovery/change-verification substrate (`MaintenanceWindowService`, `RecoveryPlanRegistry`, `StandardChangeCatalog`, `VerificationPlanService`). It is NOT the missing principal-delegation implementation and must not be rebound as such merely because older forensic notes associated F-WP-004 with delegation.

### Second Shift delegation controls

Second Shift delegation/lease state is execution-governance for overnight owner work. It is not product Identity capability authority and must not become the runtime delegation model.

## Target delegation census

| ID | Target invariant | Current/historical implementation | Durable state | Interface/contract | Tests/evidence | Environment | Standing / blocker |
|---|---|---|---|---|---|---|---|
| IDD-001 | User/device/session/service/workload identities are distinguishable | O-WP-001 generic `PrincipalKind` | Identity journal | `Principal`, `PrincipalKind` | O-WP-001 hosted | hosted portable | PARTIAL: generic kind exists; fresh governed taxonomy/lifecycle rules missing |
| IDD-002 | Authentication/proofing and authorization/delegation are separate | O-WP-001 mutation gate + O-WP-002 validator seam + F-WP-005 auth | identity/proofing journals; external auth evidence | `IdentityMutationGate`, `EnrollmentEvidenceValidator`, `AuthorizationEvidence` | O-WP-001/002 + historical F-WP-005 | hosted portable + historical exact-subject | SUBSTANTIAL: one unified fresh boundary contract still missing |
| IDD-003 | Every consequential delegated action retains current actor plus delegation history | only one current actor ref in `MutationContext`; RFC 8693 actor-chain research is design evidence | none for generic actor chain | none fresh | none current | unexecuted | MISSING |
| IDD-004 | Delegated capability is explicit and least privilege: action/resource/purpose/scope | F-WP-005 action/resource authorization and F-WP-006 action/target grants are change-specific | no generic grant store | historical change contracts | historical F-WP-005/006 evidence | historical exact-subject | PARTIAL / REBIND |
| IDD-005 | Descendants cannot expand parent authority | no generic parent grant / attenuation relation | none | none | none | unexecuted | MISSING |
| IDD-006 | Grants have not-before/expiry and fail closed when expired | F-WP-005 evidence + F-WP-006 grant TTL | change-specific evidence/grant objects | historical contracts | historical qualified evidence | historical exact-subject | REUSABLE PATTERN; generic delegation contract missing |
| IDD-007 | Revocation invalidates affected authority and stale descendants | F-WP-005/006 revocation epochs | change-specific auth snapshot | historical contracts | historical qualified evidence | historical exact-subject | PARTIAL: no generic delegation lineage/revocation propagation |
| IDD-008 | Delegated authority is non-transferable unless an explicit subdelegation policy allows attenuation | F-WP-006 execution grants are non-transferable | change-specific grant | `ExecutionGrant` | F-WP-006 historical qualified evidence | historical exact-subject | PARTIAL: subdelegation contract missing |
| IDD-009 | Workload identities are short lived and task bounded | no fresh workload-identity issuer/binding; SPIFFE pattern is research input only | none | none | none | unexecuted | MISSING |
| IDD-010 | Session/device/service/workload identity cannot silently impersonate a user | distinct generic principal IDs exist; no fresh subject/actor chain contract | identity journal only | current principal contracts | O-WP-001 | hosted portable | PARTIAL |
| IDD-011 | Actor attribution survives service/tool/model hops | no fresh actor-chain carrier across Work Chain | none | none | none | unexecuted | MISSING |
| IDD-012 | Delegation cannot grant effect permission merely because a tool/plan can run | fresh System Specification owner fence; F-WP-006 is execution-only | separate current/historical authorities | owner contracts not yet fully rebound | architecture + historical tests | design/historical | ARCHITECTURE LOCKED; integration proof missing |
| IDD-013 | Unknown/stale delegation state fails closed | F-WP-005/006 unknown/non-current/epoch checks | change-specific | historical contracts | historical qualified evidence | historical exact-subject | REUSABLE PATTERN; generic store missing |
| IDD-014 | Delegation mutations are idempotent, revisioned, restart-reconstructable and corrupt-state fail closed | O-WP-001/O-WP-002 journal patterns exist; no delegation journal | none generic | none | identity journal tests only | hosted portable | MISSING GENERIC DELEGATION STATE |
| IDD-015 | Capability/credential material is referenced, not copied into ordinary state/logs | current Foundation law + F-WP-005 secret refs | secret references only in historical change path | `SecretRef`; fresh generic capability ref missing | historical F-WP-005 | historical exact-subject | PARTIAL / REBIND |
| IDD-016 | Identity delegation does not duplicate runtime lease/fence truth | F-WP-007 owns execution epoch/fence behavior | runtime/coordination substrate | F-WP-007 contracts | historical qualified evidence | historical exact-subject | OWNER FENCE CONFIRMED |

Unaccounted target invariants in this bounded census: **0**. Invariants marked MISSING are accounted blockers, not missing rows.

## Targeted research adjudication

The existing fresh specification cites zero-trust and workload-identity patterns. A bounded external check was performed only where it can change this design:

1. NIST SP 800-207A reinforces separate identity-tier policies for users/services/resources and explicit authentication/authorization rather than implicit trust from locality or ownership.
2. SPIFFE SVID guidance supports workload identity as short-lived verifiable identity material delivered through a workload API; it is authentication/provenance material, not a reason to collapse authorization into identity.
3. OAuth 2.0 Token Exchange RFC 8693 explicitly distinguishes delegation from impersonation and defines an `act` actor representation whose nesting can retain delegation history. For policy, prior actors are history; current authorization still evaluates current subject/current actor and current policy.

Design consequence: the fresh System Master contract should preserve a durable internal `ActorChain`/delegation lineage while keeping externally issued workload credentials or token formats behind adapters. Do not make JWT, SPIFFE or any provider token format the canonical database schema.

## Adjudicated design locks for the next unit

The next design unit may proceed with these locked boundaries:

1. `ActorChain` is an immutable value object containing subject/on-behalf-of identity, current actor and ordered prior delegation hops; each hop is principal-ID bound and digestible.
2. `CapabilityGrant` is a canonical internal authority record, not an OAuth/JWT/SVID token. External credentials/tokens are evidence/adapters referenced by digest/ref.
3. A child grant MUST be a monotonic attenuation of its parent: no new action, resource, purpose, target, audience, time horizon or subdelegation depth beyond the parent ceiling.
4. Grant use revalidates current principal standing, grant standing, expiry and revocation generation at consequential boundaries.
5. Workload/service credentials authenticate an actor; capability grants authorize bounded action. Neither alone grants external-effect permission.
6. Generic capability-grant state must be durable, revisioned, idempotent and restart-reconstructable using the proven identity-journal pattern or an equally strong canonical store.
7. Runtime leases/fences remain owned by Durable Runtime/Placement; a capability grant may reference them but never replaces them.
8. Keel owns delegation ceilings as user-intent constraints; Identity owns the concrete delegated authority record. A child capability grant cannot exceed the Keel ceiling or its parent grant.
9. Effect Authority remains the commit-time owner of consequential external mutation permission.
10. No public API may accept a caller-asserted grant/actor chain and persist it as authority without validation against canonical parent/current authority.

## BUILD gate

BUILD remains intentionally closed until the next unit freezes:

- exact `ActorChain` schema and digest rules;
- exact `CapabilityGrant` schema and standing/revocation model;
- attenuation algorithm;
- durable-state writer and idempotency contract;
- Keel-ceiling reference contract without importing Keel semantics;
- workload-identity adapter seam;
- isolated adversarial denominator;
- cumulative O-WP-001/O-WP-002/System Root regression denominator.

## Exact next operation

`CORE-IDENTITY-DELEGATION-DESIGN-LOCK-001 — ACTOR CHAIN + CAPABILITY GRANT + ATTENUATION + DURABLE-STATE CONTRACT + ADVERSARIAL TEST DENOMINATOR`

The successor must start from the then-live `system-master/control-v2` head, re-read authority before mutation, preserve O-WP-001/O-WP-002 evidence boundaries, and must not claim real credentials, real external providers, A-01, native or production admission without execution evidence.
