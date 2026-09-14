# CORE Identity / Principal / Delegation — Design Lock 001

Status: **DESIGN-LOCKED FOR BOUNDED BUILD**.

Base owner subject: `system-master/control-v2@862074c80abd43444cf0d0e76d4167e176cb633d`.

This lock consumes `DELEGATION-RECOVERY-INVENTORY-001.md` and preserves the fresh Foundation `SYSTEM-SPECIFICATION.md` as architecture authority. It does not grant production admission, real credential standing, external-provider validity, A-01 standing or native evidence.

## 1. Ownership lock

Identity / Principal / Delegation owns:

- stable user/device/session/service/workload principal identity;
- immutable actor-chain attribution;
- concrete delegated capability grants;
- grant standing, expiry and revocation generation;
- monotonic parent→child authority attenuation;
- capability-use validation against current canonical identity/grant state;
- workload-identity-to-principal binding metadata and evidence references.

It does **not** own:

- governed goal/delegation ceilings or material intent changes — Keel owns those;
- executable plans — Orchestration owns those;
- admission, resource budgets or resource grants — Resource Control owns those;
- executor assignment, runtime lease or fence — Placement/Durable Runtime own those;
- external-effect permission — Effect Authority owns commit-time permission;
- secret/key/token bytes — Security/Secrets owns custody;
- evidence truth merely because a reference is carried — Evidence/Assurance owns claim support.

No shared or specialist owner is absorbed by this design.

## 2. Canonical value objects

### 2.1 `ActorChainV1`

Immutable fields:

- `subjectPrincipalId` — the principal on whose behalf the chain acts;
- `currentActorPrincipalId` — the principal currently presenting delegated authority;
- `hops[]` — ordered oldest→newest `DelegationHopV1` records;
- `chainDigest` — SHA-256 over canonical serialization.

`DelegationHopV1` fields:

- `grantId`;
- `grantDigest`;
- `delegatorPrincipalId`;
- `delegatePrincipalId`.

Structural invariants:

1. Empty `hops` is valid only when `subjectPrincipalId == currentActorPrincipalId`.
2. For a non-empty chain, first hop `delegatorPrincipalId == subjectPrincipalId`.
3. For every adjacent pair, prior `delegatePrincipalId == next.delegatorPrincipalId`.
4. Final hop `delegatePrincipalId == currentActorPrincipalId`.
5. Every referenced grant must exist canonically and its immutable identity/digest must match the hop.
6. A principal may not recur in the same chain; cycles fail closed.
7. Hard platform chain depth is **16 hops**. Keel or a parent grant may impose a lower ceiling.
8. The chain contains references and principal identities only; no bearer credentials, secret material, raw tokens or copied policy payloads.
9. `chainDigest = sha256("SM-ACTOR-CHAIN-V1|subject=...|actor=...|hops=<canonical ordered rows>")`.

The chain is attribution/authority lineage, not a UI trace and not an OAuth/JWT/SVID schema. External actor/token representations are adapters.

### 2.2 `CapabilityGrantV1`

A grant is immutable once issued. Standing changes are separate journal events.

Immutable grant fields:

- `grantId`;
- `subjectPrincipalId`;
- `delegatorPrincipalId`;
- `delegatePrincipalId`;
- optional `parentGrantId` and `parentGrantDigest`;
- `actorChainDigest` for the actor chain *before* this grant is exercised;
- sorted unique `allowedActions`;
- sorted unique `resourceRefs`;
- sorted unique `purposeRefs`;
- sorted unique `audienceRefs`;
- sorted unique `targetRefs`;
- `notBefore`;
- `expiresAt`;
- `maySubdelegate`;
- `remainingSubdelegationDepth`;
- `authorityGeneration`;
- `keelCeilingRef` and `keelCeilingDigest`;
- `authorityEvidenceRefs`;
- `issuedAt`;
- `grantDigest`.

Validation invariants:

1. `notBefore < expiresAt`; expired/not-yet-valid grants never authorize consequential work.
2. `remainingSubdelegationDepth` is in `0..16`.
3. `delegatorPrincipalId != delegatePrincipalId` for a delegated grant.
4. `subjectPrincipalId`, delegator and delegate must resolve to current canonical principals whose standing permits the operation.
5. Grant scopes are sets of opaque canonical identifiers; wildcards/pattern matching are forbidden in v1. A broader semantic scope requires an explicit canonical resource/capability identifier from its owning system.
6. Grant digest canonicalizes sorted sets and exact timestamps; field-order or input-order differences cannot change meaning.
7. `grantDigest = sha256("SM-CAPABILITY-GRANT-V1|<canonical immutable fields>")`.
8. Raw credentials/tokens/secrets are forbidden. Only bounded digest/reference identities are stored.
9. A grant is authorization input only. It never certifies plan correctness, resource admission, executor placement, runtime-fence ownership or external-effect permission.

### 2.3 `GrantStandingV1`

Standing is canonical mutable state separate from immutable grant bytes:

- `ACTIVE`;
- `SUSPENDED`;
- `REVOKED`.

`REVOKED` is terminal. Reactivation after revocation requires a new grant identity.

Standing state fields:

- `grantId`;
- `standingRevision` (monotonic, starts at 1);
- `standing`;
- `authorityGeneration`;
- `changedAt`;
- `reasonRef`;
- `evidenceRefs`.

An authority-generation increase invalidates all grants issued under an older generation for the affected authority lineage. Descendant validation rechecks parent/current generation; stale descendants fail closed without requiring destructive rewrites of immutable historical grant records.

## 3. Root issuance and parent→child attenuation

### 3.1 Root grant

A root grant has no parent grant. It may issue only when all of the following are current:

- exact delegator principal standing;
- exact delegate principal standing;
- external policy/authorization validation receipt;
- exact Keel delegation-ceiling validation receipt bound to `keelCeilingRef` + `keelCeilingDigest`;
- requested scope and time window accepted by that ceiling validator;
- caller actor identity matches the authorized delegator path.

Identity stores the ceiling reference/digest and validation evidence. It does not copy or reinterpret the governed goal.

### 3.2 Child grant

For child grant `C` from parent `P`, issuance is allowed only when every predicate is true:

- `P.standing == ACTIVE` and `P` is currently valid;
- `P.delegatePrincipalId == C.delegatorPrincipalId`;
- `P.subjectPrincipalId == C.subjectPrincipalId`;
- exact `parentGrantId` and `parentGrantDigest` match canonical `P`;
- `P.maySubdelegate == true`;
- `P.remainingSubdelegationDepth > 0`;
- `C.remainingSubdelegationDepth <= P.remainingSubdelegationDepth - 1`;
- `C.allowedActions ⊆ P.allowedActions`;
- `C.resourceRefs ⊆ P.resourceRefs`;
- `C.purposeRefs ⊆ P.purposeRefs`;
- `C.audienceRefs ⊆ P.audienceRefs`;
- `C.targetRefs ⊆ P.targetRefs`;
- `C.notBefore >= P.notBefore`;
- `C.expiresAt <= P.expiresAt`;
- `C.authorityGeneration == P.authorityGeneration == current authority generation`;
- `C.keelCeilingRef == P.keelCeilingRef` and `C.keelCeilingDigest == P.keelCeilingDigest`;
- the supplied actor chain is canonical for `P.delegatePrincipalId` and extending it by `C` remains acyclic and within the lower of platform/Keel/parent depth ceilings.

There is no “equivalent”, “compatible enough”, implicit role expansion or wildcard inheritance path in v1. Any unknown parent/ceiling/principal/generation standing fails closed.

A material Keel ceiling change creates a new governed ceiling identity/digest and therefore requires a new root delegation lineage rather than silently editing descendants.

## 4. Durable state and write contract

Canonical implementation target: `DelegationJournalStore`, following the proven O-WP-001/O-WP-002 append-only journal pattern rather than inventing a parallel database style.

The journal must provide:

- process/file writer lock for the portable reference adapter;
- canonical replay with hash-chain integrity;
- fail-closed truncated/corrupt replay;
- append + durable flush before mutation acknowledgement;
- deterministic reconstruction of immutable grants, grant standing revisions, authority generation and command-idempotency state;
- bounded record schema with no secret/raw-token fields;
- explicit optimistic revision/generation checks;
- no dependence on in-memory caches for authority truth.

Journal event types v1:

- `GRANT_ISSUED`;
- `GRANT_SUSPENDED`;
- `GRANT_REVOKED`;
- `AUTHORITY_GENERATION_ADVANCED`.

A revoke does not erase a grant. Historical grant bytes remain immutable evidence/provenance.

## 5. Mutation APIs

### `IssueCapabilityGrant`

Input binds:

- `MutationContext`/command id;
- requested immutable grant body excluding digest;
- exact parent id/digest when child;
- exact actor-chain digest;
- exact external authorization receipt ref;
- exact Keel-ceiling validation receipt ref;
- expected authority generation.

Same command id + byte-equivalent semantic request returns the same logical grant. Same command id + changed semantic payload fails `CONFLICT`.

### `SuspendCapabilityGrant`

Requires exact grant id, expected standing revision, reason/evidence refs and current mutation authority. Suspension blocks use and child issuance. Resume is not provided in v1; issue a new grant after adjudication if authority should change.

### `RevokeCapabilityGrant`

Requires exact grant id, expected standing revision, reason/evidence refs and current mutation authority. Revocation is terminal.

### `AdvanceAuthorityGeneration`

Advances the canonical generation for a bounded delegation authority lineage after a material revocation/security event. Old-generation grants fail validation without rewriting each historical grant.

### `GetCapabilityGrant` / `GetGrantStanding`

Read canonical grant bytes and current standing only. Projections may cache but cannot become authority.

### `ValidateCapabilityUse`

Inputs:

- grant id + digest;
- exact current `ActorChainV1`;
- presented current actor principal id;
- requested action/resource/purpose/audience/target identities;
- current time;
- optional current assignment/fence refs as *non-authoritative cross-owner constraints* when the caller requires them.

It re-reads canonical grant/standing/parent lineage/current authority generation and principal standing. It fails closed on unknown/stale/mismatch and returns a bounded validation receipt/reference for downstream policy/effect gates. It does not execute the action.

## 6. Keel and cross-owner contracts

`DelegationCeilingValidationReceiptV1` is an **external receipt interface**, not Identity-owned goal state. Required fields exposed to Identity:

- `receiptRef`;
- `keelCeilingRef`;
- `keelCeilingDigest`;
- `requestedGrantDigestOrRequestDigest`;
- `standing` = `CURRENT | DENIED | UNKNOWN`;
- `evaluatedAt`;
- `expiresAt`.

Identity requires `CURRENT` and a non-expired exact request binding. It does not parse goal requirements, budgets, privacy policy or plan semantics from the receipt.

Effect Authority, Resource Control, Placement and Durable Runtime may consume a validated capability receipt/reference, but each retains its own canonical decision and must revalidate at its consequential boundary where required.

## 7. Workload identity adapter seam

`WorkloadIdentityBindingV1` binds external workload authentication material to a canonical workload/service principal without storing bearer material:

- `principalId`;
- `issuerRef`;
- `credentialIdentityRef` or digest;
- `notBefore` / `expiresAt`;
- `validationEvidenceRef`;
- `bindingDigest`.

External adapters may validate SPIFFE SVIDs, OAuth/OIDC tokens, platform identities or future mechanisms. These formats are never the canonical delegation store schema. Authentication establishes the principal; `CapabilityGrantV1` establishes bounded delegated authority.

## 8. Error and unknown-state semantics

Use the existing Identity error vocabulary where applicable:

- `NOT_FOUND` — referenced canonical identity/grant absent;
- `CONFLICT` — command id reused with changed payload / incompatible concurrent write;
- `STALE_BASE` — parent digest, standing revision, ceiling digest or generation changed;
- `UNAUTHENTICATED` — workload/user actor could not be authenticated by the external seam;
- `DENIED` — scope/attenuation/policy/actor mismatch;
- `REAUTH_REQUIRED` — current authentication freshness required by policy;
- `REVOKED` — principal/grant/generation invalidated;
- `EXPIRED` — grant/receipt outside its validity window;
- `BLOCKED_DEPENDENCY` — required current Keel/policy/security validation unavailable;
- `AMBIGUOUS` — more than one canonical resolution exists;
- `QUARANTINED` — canonical state or evidence requires isolation;
- `UNAVAILABLE` — canonical store/adaptor unavailable;
- `CORRUPT_STATE` — journal/hash/replay integrity failure.

UNKNOWN is never promoted to CURRENT/ACTIVE by timeout, cache hit, log line or retry.

## 9. Isolated adversarial qualification denominator

The bounded build is not eligible for freeze unless all **36** cases pass on the exact subject:

1. root grant issues from current canonical principals + current exact ceiling receipt;
2. root grant replay is idempotent;
3. same command id with changed semantic payload conflicts;
4. action set widening against parent is denied;
5. resource set widening is denied;
6. purpose set widening is denied;
7. audience set widening is denied;
8. target set widening is denied;
9. child start before parent `notBefore` is denied;
10. child expiry after parent expiry is denied;
11. subdelegation when parent forbids it is denied;
12. subdelegation depth increase is denied;
13. parent id/digest mismatch is stale-base failure;
14. parent delegate != child delegator is denied;
15. subject changes inside a lineage are denied;
16. Keel ceiling ref/digest changes inside child lineage are stale-base failure;
17. stale authority generation is revoked/stale failure;
18. parent suspension blocks child issue/use;
19. parent revocation blocks descendant use without rewriting descendant bytes;
20. expired grant fails use validation;
21. not-yet-valid grant fails use validation;
22. disabled/retired/quarantined actor principal fails closed;
23. caller-supplied forged actor-chain digest is rejected;
24. non-contiguous actor chain is rejected;
25. actor-chain cycle is rejected;
26. chain deeper than hard/effective ceiling is rejected;
27. current actor not equal final hop delegate is rejected;
28. missing/unknown grant in a hop fails closed;
29. wrong grant digest in a hop fails closed;
30. restart replay reconstructs identical grant/standing/generation state;
31. truncated journal fails closed;
32. hash-corrupt journal fails closed;
33. concurrent same-parent issuance cannot bypass generation/revision checks;
34. stored journal/evidence contains no raw credential/token/secret payload from workload adapter inputs;
35. capability validation alone cannot satisfy external-effect commit permission;
36. capability grant cannot replace or mutate Runtime/Placement lease/fence truth.

Performance/calibration for the reference store must also demonstrate bounded validation/replay cost at a defined synthetic corpus before freeze; the build packet must set the exact corpus and thresholds before qualification execution rather than invent a post-hoc passing threshold.

## 10. Cumulative regression denominator

Every delegation build candidate must rerun, at minimum:

- System Root hosted qualification;
- O-WP-001 principal identity isolated/performance qualification;
- O-WP-002 proofing/enrollment including evidence-authority adversarial cases;
- delegation isolated 36-case denominator;
- compile with Java 21 and warnings-as-errors for the fresh identity package.

Historical F-WP-005/006/007 PASS is provenance/reuse evidence only. If their code is copied/changed into the fresh delegation package, the changed bytes require fresh current qualification; historical PASS does not transfer.

## 11. Freeze conditions

The bounded delegation unit may freeze only when:

- all 16 inventory invariants are mapped to the built implementation or an explicit external boundary;
- `unaccounted_requirement_count = 0`;
- all 36 isolated cases pass on the exact candidate subject;
- cumulative Foundation regressions pass;
- exact source/evidence digests and environment are preserved;
- no caller-controlled assertion becomes canonical grant/actor authority;
- no duplicate Keel, Effect, Resource, Placement or Runtime truth is introduced;
- real credential/provider/A-01/native/production claims remain separate unless actually executed.

## Exact next operation

`CORE-IDENTITY-DELEGATION-BUILD-001 — ACTOR CHAIN + CAPABILITY GRANT + ATTENUATION + JOURNAL + 36-CASE ISOLATED QUALIFICATION + CUMULATIVE FOUNDATION REGRESSION`

Build starts only from the then-live `system-master/control-v2` head after re-reading authority and this lock. If concurrent owner work advances the live head, rebase/reconcile rather than applying this design blindly.
