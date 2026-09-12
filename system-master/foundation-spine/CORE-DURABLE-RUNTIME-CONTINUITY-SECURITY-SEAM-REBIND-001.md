# CORE Durable Runtime Continuity Security Seam Rebind 001

Status: RECOVER / INVENTORY / ANALYZE / ADJUDICATE / CONSUMER-SIDE DESIGN LOCK COMPLETE  
Current shared Security / Privacy / Secrets / Cryptography provider integration: NOT FROZEN BY THIS UNIT  
Durable Runtime build: NOT AUTHORIZED YET

Exact live Foundation owner reread immediately before mutation:

- `system-master/control-v2@54de1268b1036f966dd9235f5463e430ab1fcd19`
- isolated predecessor: `second-shift/core-durable-runtime-continuity-recovery-001-20260912@ac5420a61bd56d266b437f18cf1d51559971bc8a`

## 1. Constitutional authority

`SYSTEM-SPECIFICATION.md` assigns shared authorization-policy enforcement, purpose/data controls, trust boundaries, sandbox policy, secret/key/certificate custody interfaces and cryptographic verification requirements to **Security, Privacy, Secrets & Cryptography**. It also requires secrets to remain references/capabilities rather than prompt/log/evidence content and rejects trust merely because an actor/tool/provider is local or previously used.

Identity / Principal / Delegation remains the owner of actor identity and delegated capability standing. Effect Authority remains the owner of exact commit-time external-effect permission. Security is therefore a separate consumed authority, not a substitute for either one.

Owner collision after adjudication: **0 for the continuity consumer boundary**.

## 2. Exact recovered substrate

### Current F-WP secret-reference behavior

The exact live `SecretReferenceValidator`:

- accepts only opaque `secretref://...` references;
- requires secret standing `CURRENT`;
- requires secret class, provider ref and version ref;
- rejects common plaintext password/API-key/token/private-key patterns.

This is strong reusable guard behavior, but the F-WP `SecretRef` record and validator are historical/change-bound substrate. They are not sufficient proof of a current shared secret-broker provider.

### Current F-WP authorization evidence shape

`GovernanceAuthorizationContracts.AuthorizationEvidence` carries principal, action, resource, policy version, revocation epoch, standing, evaluation time and expiry. These fields are useful historical evidence for use-time revalidation but overlap current Identity/Delegation and future shared policy authority. The current Identity frozen contracts outrank this private F-WP shape for principal/delegation truth.

### PLATFORM-011 provider/secret boundary

`PLATFORM011-RECONCILIATION-001.md` recovers a bounded Search/Retrieval/Connector/Secret-Broker/External Communication foundation. Its parity repair deliberately persists only a non-secret credential prefix while retaining secret material outside ordinary durable provider descriptors. It explicitly does not broaden effect authority, provider eligibility law or secret-material persistence.

That is evidence for the correct boundary: provider/connector transport may consume secret references and non-secret formatting metadata, but secret values remain in the secret authority. PLATFORM-011 source/provider production standing is still separately blocked and is not promoted here.

## 3. Ownership lock

**Security / Privacy / Secrets / Cryptography owns:**

- shared authorization-policy decisions not owned by Identity or Effect Authority;
- purpose/data-use/privacy decisions and restrictions;
- trust-boundary and sandbox-policy standing;
- secret/key/certificate custody and lease/revocation interfaces;
- opaque secret capability/ref standing;
- cryptographic verification policy and key/certificate trust requirements;
- security-sensitive data classification/minimization requirements;
- owner-issued security/privacy reason codes and expiry/revocation generations.

**Identity / Delegation owns:** actor/principal identity, grants, delegation ceilings and authority generations.

**Effect Authority owns:** whether the exact consequential external mutation is authorized at commit time.

**Durable Runtime Continuity owns only:**

- exact foreign security/privacy/secret/crypto receipt refs required by the current runtime operation;
- fail-closed runtime state when required standing is DENY/REVOKED/STALE/UNKNOWN;
- runtime-local knowledge that a referenced secret/policy dependency is unavailable;
- non-secret evidence/outbox facts describing the block/reconciliation;
- revalidation/reconciliation cursors where needed for restart.

Runtime does not own secret values, policy truth, principal truth or effect permission.

## 4. Consumer semantic contract freeze

Names below are design identifiers, not claims of an implemented provider API.

### S1 — SecurityPolicyDecisionRef

Required semantics:

- immutable decision id;
- exact policy/version/digest;
- exact subject/action/resource/purpose binding;
- decision `ALLOW | DENY | UNKNOWN` or current equivalent;
- evaluated-at and expiry;
- revocation/generation binding where applicable;
- source authority;
- evidence/reason refs;
- decision digest/version.

UNKNOWN cannot authorize consequential work.

### S2 — PrivacyPurposeDecisionRef

Required semantics:

- exact data/purpose/work subject binding;
- allowed/forbidden data classes and purpose/use limits;
- locality/retention/disclosure constraints where applicable;
- decision standing and expiry;
- policy/authority digest/version.

A prior decision cannot silently authorize materially changed purpose/data scope.

### S3 — SecretCapabilityRef

Required semantics:

- opaque reference only; no secret value;
- secret class;
- provider/vault authority ref;
- version/key/certificate generation ref;
- exact allowed consumer/action/scope where the capability model supports it;
- issue/expiry/revocation standing;
- capability digest/version.

Runtime stores S3, never the resolved secret value.

### S4 — CryptographicVerificationRef

Required semantics:

- exact subject/content digest;
- verification type/algorithm/profile;
- key/certificate/trust-root reference;
- verification result `VALID | INVALID | UNKNOWN` or current equivalent;
- evaluation time/freshness;
- authority and receipt digest/version.

Runtime cannot convert missing verification into VALID.

### S5 — SecurityRestrictionRef

Used when a runtime operation is blocked/restricted:

- exact subject/action;
- restriction class/reason code;
- source authority;
- evaluated-at/expiry;
- required remediation/revalidation class if supplied;
- immutable receipt digest/version.

Runtime persists this as a foreign authority ref and uses it to block/reconcile, not to reinterpret policy.

## 5. Use-time revalidation lock

At every consequential resume/start/effect/reconciliation boundary, Runtime must re-read current security-sensitive state when the operation depends on it.

At minimum, revalidation is required after:

- process/machine restart when prior decision freshness is not guaranteed;
- Identity/delegation generation or principal change;
- policy/security/privacy version change;
- secret/key/certificate version, expiry or revocation change;
- provider/route/placement change that changes trust/data locality/secret reachability;
- target/action/payload/purpose/data-class change;
- contract migration affecting security-relevant fields;
- new integrity/quarantine finding;
- explicit owner-issued invalidation/supersession.

Old successful use is not evidence of current authorization.

## 6. Secret handling lock

Continuity persistence, logs, evidence intents, Transport envelopes and dead-letter/quarantine payloads SHALL NOT persist resolved secret material as ordinary fields.

Required behavior:

1. persist only S3 opaque refs/capabilities and non-secret metadata;
2. resolve a secret as late as possible in the authorized connector/tool/provider boundary;
3. bound resolution to exact current principal/workload/action/target/purpose where the provider supports it;
4. never copy a resolved secret into prompt/context, ordinary telemetry or ordinary evidence;
5. treat missing/revoked/expired/UNKNOWN secret standing as a blocker, not a transient semantic retry;
6. after restart, reacquire/revalidate secret standing rather than trusting an in-memory credential;
7. redact/quarantine accidental plaintext-secret material according to the current security owner without rewriting the immutable incident/evidence trail;
8. do not infer provider authorization from possession of a secret reference.

The historical plaintext-pattern detector is defense-in-depth only; it is not proof that arbitrary secret detection is complete.

## 7. Security / Effect / Identity separation lock

A consequential external effect may proceed only when all independent gates required by the current operation are satisfied:

- current Identity/Delegation principal capability;
- current S1/S2 security/privacy standing where applicable;
- current Contracts compatibility;
- current Resource/Route/Placement standing where required;
- current S3 secret capability if the provider needs one;
- current Effect Authority exact commit authorization;
- current runtime Attempt/fence.

No one receipt subsumes all others unless a future explicit authority contract delegates and proves that composition. Runtime cannot manufacture composite authority from cached booleans.

## 8. Cryptographic verification lock

Where current policy requires cryptographic integrity/authenticity, Runtime must consume S4 from the proper authority or verification boundary.

- content digest equality is necessary but is not automatically identity/authenticity proof;
- certificate/key/trust-root standing is separately versioned/revocable;
- UNKNOWN trust/verification fails closed at a gate requiring verification;
- algorithm/profile migration is governed by Contracts/Security, not local Runtime preference;
- evidence records reference verification receipts rather than embedding private key material;
- historical checksum/hash validation remains integrity mechanics, not proof of signer identity.

## 9. Retry and outage lock

Security/secret/provider outages are classified before retry:

- DENY/REVOKED/EXPIRED/INVALID/subject-mismatch are semantic failures and are not transient retries;
- UNKNOWN because a security/secret provider is temporarily unavailable may enter WAIT/BLOCKED and use bounded revalidation according to the owner contract;
- retries must be bounded and idempotent and must re-read current durable Runtime state first;
- no stacked retry loop may resolve secrets/security decisions repeatedly underneath a separate provider retry layer without an explicit owner boundary;
- secret-provider availability never grants Effect permission.

## 10. Security-seam isolated qualification denominator

A current Security/Secrets seam plus Runtime adapter must satisfy this **40-case minimum** in addition to prior denominators. This is an obligation, not PASS evidence.

- exact policy subject/action/resource/purpose/version binding: **6**
- DENY/UNKNOWN/stale/expired/revoked fail-closed behavior: **6**
- current Identity generation/principal/delegation revalidation interaction: **4**
- opaque secret ref validation / no plaintext persistence/log/evidence/transport leakage: **8**
- secret expiry/revocation/provider-unavailable restart behavior: **4**
- privacy/data-class/purpose material-change invalidation: **4**
- crypto valid/invalid/unknown/key-generation/trust-root revalidation: **4**
- Effect-seam separation where security allow does not equal effect authorization: **2**
- transient-only bounded revalidation / no stacked retry: **2**

Total: **40 cases**.

Previously frozen minimum obligations remain 80 continuity persistence + 48 Effect + 40 Evidence + 36 Transport consumer seam + the recovered 42-row G-WP denominator and current/cross-owner regression. Overlapping cases must be cross-referenced rather than counted as independent PASS evidence.

## 11. Remaining blockers

- `BLOCKED_SECURITY_PROVIDER_INTERFACE_NOT_BOUND` — exact shared current policy/privacy/secret/crypto provider interfaces are not freshly frozen here.
- `BLOCKED_SECRET_PROVIDER_PRODUCTION_STANDING` — no real secret store/provider credential lifecycle was executed or claimed.
- `BLOCKED_TRANSPORT_PROVIDER_SOURCE_CUSTODY` — generic Transport provider remains unresolved.
- `BLOCKED_EFFECT_AUTHORITY_IMPLEMENTATION_NOT_CURRENT` — exact Effect provider/service remains unresolved.
- `BLOCKED_RECOVERY_SOURCE_AUTHORITY` — Work/Project and Orchestration exact refs remain unresolved.
- `BLOCKED_FRESH_QUALIFICATION_NOT_RUN` — no current implementation was built against this seam.
- `BLOCKED_NATIVE_A01_PRODUCTION_EVIDENCE_NOT_EXECUTED` — explicitly unclaimed.

## 12. Build gate standing

Durable Runtime implementation is still **not authorized**. The owner-local persistence semantics are frozen, and consumer boundaries for Effect/Evidence/Transport/Security are substantially specified, but Work/Project, Orchestration, Resource Admission, Routing/Placement and exact provider contracts remain materially unresolved. Building now would force invented foreign schemas or private historical authority wrappers into the current design.

## 13. One dependency-valid successor

**`CORE-DURABLE-RUNTIME-CONTINUITY-RESOURCE-PLACEMENT-FENCE-REBIND-001`**

Recover and adjudicate the exact Resource Admission + Execution Placement boundary required by Durable Runtime claims/fences. Reuse G-WP `RecoveryClaimStore/Coordinator`, F-WP `ExecutionLeaseManager`, F-WP resource-admission requirements and any current PLATFORM placement/resource evidence as substrate. Determine exactly one authoritative current executor fence generator; bind Resource grant/expiry/reclaim separately from Placement assignment/lease/fence and Runtime claim/attempt state; map requirements -> durable truth -> consumed refs -> revalidation -> tests -> evidence/environment -> blockers. Do not let Runtime mint resources or Placement self-admit. Freeze the boundary and additive qualification denominator only if owner collision = 0.

If live Work/Project or Orchestrator authority appears first, rebind it before freezing foreign references that depend on it.

## 14. Evidence fence

This unit freezes only continuity's consumed Security/Privacy/Secrets/Cryptography semantics. It claims no current shared security provider implementation, no real secret retrieval, no external-provider authorization, no current PASS, no historical PASS transfer, no A-01/native/production standing, no human/private/publication evidence and no specialist-system correctness.