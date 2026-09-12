# CORE-RESOURCE-ADMISSION-H-RQ-082-IDENTITY-AUTHORIZATION-SUFFICIENCY-ADJUDICATION-001

**Date:** 2026-09-12  
**Parent:** `CORE-RESOURCE-ADMISSION-H-WP-001-DENOMINATOR-FREEZE-001`  
**Owner lane:** CORE / Foundation-Spine  
**Operation:** `CORE-RESOURCE-ADMISSION-H-WP-001 — H-RQ-082 CURRENT IDENTITY AUTHORIZATION SUFFICIENCY ADJUDICATION`  
**Disposition:** `INSUFFICIENT_AS_COMPLETE_H_RQ_082_AUTHORIZATION_PROVIDER__SUFFICIENT_AS_CURRENT_IDENTITY_ENFORCEMENT_PRIMITIVE`

## 1. Question adjudicated

Can the current hosted-qualified Identity / Principal / Delegation provider, without recovering any additional authorization/PDP boundary, fully satisfy H-RQ-082 for Resource Admission administrative resource-policy and pressure overrides?

H-RQ-082 requires such overrides to be:

- scope-bound;
- time-bound;
- principal-bound;
- auditable; and
- incapable of erasing prior budget history.

The answer is **no for the complete authorization source**, but **yes for the current identity/delegation enforcement primitive**.

## 2. Current Identity capabilities proved sufficient

The current `DelegationRuntime.CapabilityUseRequest` binds:

- exact grant id + digest;
- exact actor/delegation chain;
- presented current actor principal;
- requested action;
- requested resource;
- purpose;
- audience;
- target; and
- evaluation time.

`DelegationService.validateUse(...)` re-reads canonical delegation state and fails closed when:

- the grant is unknown or its digest is stale;
- grant standing is suspended/revoked;
- the grant generation is stale;
- the grant is not yet valid or is expired;
- subject/delegator/delegate/current actor principal standing is no longer current;
- the presented actor does not match the canonical actor chain;
- the actor chain is not canonical for the grant; or
- action/resource/purpose/audience/target is outside the immutable grant scope.

The returned `CapabilityValidationReceipt` is bound to the grant, grant digest, actor-chain digest, authority generation and evaluation time.

Therefore current Identity is sufficient to provide the **use-time principal + delegation + scope + time + revocation validation primitive** required by an H-RQ-082 Resource override adapter.

## 3. Why current Identity is not the complete H-RQ-082 authorization provider

Identity intentionally does not self-authorize root capability creation.

`DelegationService.issue(...)` requires `validateReceipts(...)`, and root issuance consumes an exact `ExternalAuthorizationReceipt` through `ReceiptAuthority.externalAuthorization(...)`. The external receipt must be CURRENT, unexpired and bound to the proposed immutable grant digest. Identity also consumes a Keel ceiling receipt, but neither external policy authorization nor Keel policy truth is owned by Identity.

The current Identity freeze explicitly qualifies **receipt-only Keel/external authorization seams** while withholding claims of real external-provider validity.

Therefore:

1. Identity can prove that a presented already-issued capability is current and exactly scoped.
2. Identity does **not** prove that the resource-policy override capability was legitimately authorized for issuance in the first place.
3. Treating the Identity test fixture, a permissive stub, a hard-coded administrator, or Resource Admission itself as that external authorization provider would violate the owner fence and create circular self-authorization.

That missing issue-time policy decision boundary is the remaining blocker.

## 4. H-RQ-082 ownership split now locked

### Identity / Principal / Delegation owns

- canonical principal currentness;
- actor-chain/delegation lineage;
- immutable capability grant scope;
- grant not-before / expiry;
- suspension/revocation/generation invalidation;
- use-time scope validation;
- bounded capability validation receipt.

### Authorization / PDP boundary must own

- the policy decision that authorizes issuance of the exact administrative override capability;
- CURRENT / DENIED / UNKNOWN standing;
- exact proposed-grant/request digest binding;
- decision evaluation/expiry window;
- policy/evidence references sufficient to audit why the capability could be issued.

### Resource Admission owns

- definition of the resource-policy override action and canonical resource/target identifiers;
- application of the authorized override only within the validated capability scope;
- immutable owner-local override command/evidence receipt;
- non-erasing policy/budget-history semantics;
- idempotency/conflict handling for the Resource mutation;
- fail-closed handling when either Identity validation or PDP standing is missing/stale/mismatched/unknown.

Resource Admission must not become the Identity owner or the general PDP owner.

## 5. Minimal H-RQ-082 adapter contract

The eventual Resource override path shall require both of these independently current inputs:

1. **Identity capability-use validation**
   - `action = <canonical Resource override action>`
   - `resourceRef = <exact governed resource-policy identity>`
   - `targetRef = <exact override target>`
   - exact actor/delegation chain
   - exact evaluation time
   - no wildcard/pattern broadening.

2. **Issue-time external authorization provenance**
   - the consumed capability must originate from a grant whose root issuance was admitted by a real current external policy/PDP receipt bound to that grant digest;
   - UNKNOWN / absent / expired / stale/mismatched authorization fails closed.

The Resource mutation then appends its own immutable audit/budget-history event; Identity/PDP receipts are referenced as authorization evidence and do not become Resource state authority.

## 6. Current blocker narrowed

Previous blocker wording:

`BLOCKED_CURRENT_SECURITY_AUTHORITY_NOT_BOUND`

Replacement blocker wording:

`BLOCKED_MISSING_CURRENT_EXTERNAL_POLICY_AUTHORIZATION_RECEIPT_PROVIDER`

This is materially narrower than a general Security implementation gap.

No full 021Q/Security rebuild is authorized by this adjudication.

## 7. H-WP-001 consequence

H-WP-001 remains **not complete** because H-RQ-082 is not yet fully executable against a real current authorization/PDP receipt provider.

However, the following are now authorized as bounded candidate work:

- Resource-to-Identity capability-use adapter contract;
- exact canonical Resource override action/resource/target identities;
- fail-closed Identity validation integration;
- immutable Resource override audit/event schema;
- non-erasing budget/policy-history rules;
- tests for wrong principal/scope, expiry, revocation, generation invalidation, stale actor chain, absent/unknown PDP provenance, and replay conflict.

These remain unpromoted until the external authorization receipt provider is recovered and bound.

## 8. Required next recovery scope

Recover only the smallest missing authorization/PDP decision boundary capable of supplying Identity's existing `ExternalAuthorizationReceipt` contract for administrative Resource override capability issuance.

Historical `021O` / authorization-engine material may be used as donor architecture, but the recovery must:

- reuse current Identity for canonical principals, delegation chains, capability grants and use validation;
- avoid rebuilding Identity/O-WP-001 semantics already current;
- avoid absorbing Resource policy semantics into the PDP;
- avoid opening all of Security/021Q;
- produce a current exact decision interface with ALLOW/DENY/UNKNOWN, exact request/grant-digest binding, expiry/freshness and evidence refs;
- fail closed when policy authority is unavailable or ambiguous.

## 9. Adjudication result

`CORE-RESOURCE-ADMISSION-H-RQ-082-IDENTITY-AUTHORIZATION-SUFFICIENCY-ADJUDICATION-001 = PASS_ADJUDICATED__IDENTITY_USE_VALIDATION_SUFFICIENT__COMPLETE_AUTHORIZATION_INSUFFICIENT__EXTERNAL_PDP_RECEIPT_GAP_ISOLATED`

**H-RQ-082:** `BLOCKED_NARROW_EXTERNAL_PDP_GAP`  
**H-WP-001 completion:** `BLOCKED`  
**Resource↔Identity adapter preparation:** `AUTHORIZED_BOUNDED_FAIL_CLOSED`  
**Full Security rebuild:** `NOT_AUTHORIZED`  
**Product promotion:** `NOT_AUTHORIZED`

## 10. Exact successor

`CORE-AUTHORIZATION-PDP-DECISION-BOUNDARY-RECOVERY-001`

Objective: recover/admit the minimum current external policy authorization receipt provider required by Identity root capability issuance, specifically for bounded administrative Resource override authorization, without rebuilding Identity or opening a general Security implementation lane.
