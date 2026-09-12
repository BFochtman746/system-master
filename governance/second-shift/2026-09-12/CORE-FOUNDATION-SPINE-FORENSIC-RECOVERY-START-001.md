# CORE FOUNDATION & SPINE — FORENSIC RECOVERY START 001

Status: **RECOVER / INVENTORY ACTIVE — NO CLOSURE CLAIM**  
Owner lane: `SYSTEM_MASTER/CORE`  
Exact live owner head at recovery start: `system-master/control-v2@2e6ab006a48a5908d59642d36c567f447c66f49b`  
Target architecture blob: `system-master/foundation-spine/SYSTEM-SPECIFICATION.md@8a03c8a80f02e1c153e7bba6874f6f65366f422d`  
Implementation-status blob: `system-master/foundation-spine/IMPLEMENTATION-STATUS.md@f68b84b1a7bdace7968af104a71188e17fd89509`  
Predecessor standing: System Root & Authority Registry is current/hosted-qualified for its present boundary; A-01 target execution remains unexecuted because the environment is unavailable.

## 1. Why this is the dependency-valid start

The fresh Foundation specification requires one durable causal Work Chain and one truth owner per concept. The implementation-status record identifies the highest-value convergence work as locking that chain and explicitly states that Foundation/Spine cannot be declared complete until every logical system receives this traceability:

`requirement/invariant -> current component -> durable state -> interface/contract -> tests -> evidence -> environment -> remaining blocker`

The first logical boundary after the now-hosted-qualified System Root is **Identity, Principal & Delegation**. Its current standing is `CURRENT — PARTIAL`, so tonight begins by recovering and inventorying the exact implementation/evidence surfaces before any design/build decision.

## 2. Target Identity / Principal / Delegation responsibility inventory

From the fresh System Specification, this boundary must own:

1. user identity;
2. device identity;
3. session identity;
4. service identity;
5. workload identity;
6. actor chains;
7. delegated authority;
8. capability grants;
9. expiry;
10. revocation;
11. actor attribution;
12. short-lived workload identity;
13. least-privilege delegation.

Explicit non-ownership:

- user goals / governed intent;
- executable plans;
- effect/action authorization decisions;
- resource scheduling/admission.

The constitutional constraints most directly governing this boundary are: one truth owner per concept; descendants cannot expand authority; stale actors lose authority; secrets are references/capabilities rather than prompt/log content; AI cannot self-grant capability/credential/budget/right/release/effect permission; material subject change narrows or invalidates evidence; and shared infrastructure may not absorb specialist semantics.

## 3. Current/recovered implementation candidates found on the exact live CORE tree

### F-WP-005 — strongest current authorization/principal evidence

Candidate source surfaces:

- `system-master/f-wp-005/src/main/java/org/systemmaster/core/GovernanceAuthorizationContracts.java`
- `system-master/f-wp-005/src/main/java/org/systemmaster/core/AuthorizationAdapter.java`
- `system-master/f-wp-005/src/main/java/org/systemmaster/core/ApprovalOrchestrator.java`
- `system-master/f-wp-005/src/main/java/org/systemmaster/core/EmergencyChangeAuthority.java`
- `system-master/f-wp-005/src/main/java/org/systemmaster/core/SecretReferenceValidator.java`
- `system-master/f-wp-005/src/test/java/org/systemmaster/core/Fwp005QualificationTest.java`
- `system-master/f-wp-005/control/REQUIREMENTS.json`

Directly observed semantics include:

- `AuthorizationEvidence` bound to principal, action, resource, policy version, revocation epoch, standing, evaluation time and expiry;
- `PrincipalLineage` with logical-principal equivalence, roles and attributes;
- secret references rather than plaintext secret values;
- explicit emergency scope and time bounds;
- separation-of-duties requirements;
- exact revision/target/policy bindings;
- fail-closed principal/action/resource mismatch, stale revocation epoch and expiry checks.

Forensic classification: **CURRENT REUSABLE AUTHORIZATION/PRINCIPAL SUBSTRATE — NOT YET PROVEN AS THE COMPLETE FRESH IDENTITY AUTHORITY.**

Reason: this package is change-governance scoped and does not by itself prove device/session/service/workload identity lifecycle, actor-chain durability, delegated capability issuance/revocation, or descendant delegation ceilings as one current Foundation authority.

### F-WP-003 — semantic-owner resolution evidence

Candidate source:

- `system-master/f-wp-003/src/main/java/org/systemmaster/core/AuthorityResolver.java`

Observed semantic: semantic owner is taken from the immutable change revision; executor/provider identity is explicitly not ownership.

Forensic classification: **KEEP AS OWNERSHIP-SEPARATION EVIDENCE / DO NOT MERGE SEMANTIC OWNERSHIP INTO PRINCIPAL IDENTITY.**

This is an important anti-collision rule: who/what an actor is and who semantically owns a domain fact are separate concepts.

### F-WP-006 — execution-grant adjacent evidence

Candidate sources:

- `system-master/f-wp-006/src/main/java/org/systemmaster/core/ExecutionGrantContracts.java`
- `system-master/f-wp-006/src/main/java/org/systemmaster/core/ExecutionGrantIssuer.java`

Forensic classification: **ADJACENT / OWNERSHIP REVIEW REQUIRED.** Execution/resource grants may consume principal/delegation evidence but must not silently become the Identity truth owner or collapse Resource Admission / Effect Authority boundaries.

### F-WP-007 — execution lease/fence adjacent evidence

Candidate sources:

- `system-master/f-wp-007/src/main/java/org/systemmaster/core/ExecutionLeaseManager.java`
- `system-master/f-wp-007/src/main/java/org/systemmaster/core/CoordinationContracts.java`

Forensic classification: **ADJACENT / KEEP SEPARATE UNTIL CONTRACT MAPPING.** A lease/fence establishes current execution authority, not identity itself.

### Current SMR021 authorization-context research

`system-master/control-v2/SMR021-AUTHORIZATION-CONTEXT-BINDING-RESEARCH-DELTA-001.md` already establishes a useful current invariant: authorization must be checked at the enforcement boundary for the exact principal/session + work/resource + capability/descriptor + action + admission context, with anti-swapping integrity and fail-closed behavior. It explicitly rejects importing a generic authorization platform as a substitute for System Master ownership.

Forensic classification: **CURRENT RESEARCH EVIDENCE / INVARIANT INPUT — NOT INSTALLATION PROOF.**

## 4. First forensic gap finding

No dedicated fresh `system-master/foundation-spine/identity-*` runtime subtree is materialized at the live CORE head. The fresh Foundation subtree currently materializes the System Root implementation, while Identity-related behavior remains distributed across F-WP and current control/research artifacts.

Therefore the implementation-status classification `CURRENT — PARTIAL` is supported by the code census. The next step is not to write a new identity system from scratch. It is to losslessly classify and bind existing behaviors, identify semantic collisions, and determine the minimum fresh runtime boundary required.

## 5. Collision risks that must be adjudicated before design-lock

1. **Identity vs semantic ownership:** `AuthorityResolver` ownership semantics must not become actor identity.
2. **Delegation vs approval:** change approval obligations are a consumer/domain of delegated authority, not necessarily the canonical delegation store.
3. **Delegation vs resource grant:** an execution/resource grant must not mint broader identity authority.
4. **Delegation vs lease/fence:** current-executor fencing must not substitute for actor/workload identity or delegation lineage.
5. **Identity vs effect authority:** authentication/delegation cannot itself authorize a changed external mutation; Effect Authority remains commit-time.
6. **Principal equivalence risk:** `equivalentPrincipalRefs` must not allow unbounded privilege inheritance; exact lifecycle/issuer/revocation semantics need current proof.
7. **Expiry/revocation durability:** F-WP-005 exposes epochs/expiry but the fresh durable owner and restart behavior are not yet established.
8. **Workload identity gap:** no complete fresh short-lived workload-identity issuance/rotation/revocation implementation has yet been demonstrated in this pass.
9. **Actor-chain gap:** durable parent/delegator/delegatee lineage and ceiling propagation are not yet demonstrated as one current model.
10. **Cross-system semantics:** Book author authority, Learning learner semantics, Documents semantics and Programming correctness remain outside this Foundation boundary.

## 6. Evidence standing

- Architecture: **CURRENT / FRESH SPECIFICATION**
- System Root predecessor: **HOSTED QUALIFIED FOR PRESENT BOUNDARY**
- Identity current implementation: **PARTIAL / DISTRIBUTED REUSABLE SUBSTRATE**
- Identity fresh design-lock: **NOT YET REACHED**
- Identity isolated qualification: **NOT YET EXECUTED AS A FRESH CUMULATIVE SUBJECT**
- A-01 target qualification: **NOT EXECUTED — ENVIRONMENT UNAVAILABLE**
- Native/production admission: **NOT CLAIMED**

## 7. Exact next recovery actions

1. Inventory F-WP-005 requirements, contracts, tests and durable-state assumptions against all 13 Identity/Principal/Delegation responsibilities.
2. Inventory F-WP-003 owner-resolution semantics solely to establish the ownership/identity fence.
3. Inspect F-WP-006 grants and F-WP-007 leases only for consumed identity/delegation fields and explicitly preserve their separate truth ownership.
4. Recover any historical identity/security/workload-identity implementation that materially fills the actor-chain, workload identity, issuance, revocation or delegation-ceiling gaps.
5. Produce the first atomic mapping table: requirement/invariant -> candidate implementation -> canonical durable owner -> interface -> tests/evidence -> gap/collision disposition.
6. Only after that inventory is lossless, advance to ANALYZE/ADJUDICATE and decide KEEP / REFACTOR / MIGRATE / MERGE / REPLACE / BUILD / DELEGATE / REMOVE.

No Foundation owner code is mutated by this recovery packet. It is a bounded forensic checkpoint that leaves the lane safe for the specialized Foundation worker to continue without replaying discovery or inventing architecture.
