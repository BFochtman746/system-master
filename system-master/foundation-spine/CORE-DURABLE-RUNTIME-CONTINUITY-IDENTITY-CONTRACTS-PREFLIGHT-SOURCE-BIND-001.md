# CORE Durable Runtime / Continuity Identity + Contracts Preflight Source Bind 001

**Date:** 2026-09-12  
**Lane:** Foundation / Spine — Durable Runtime / Continuity  
**Implementation branch:** `foundation/core-runtime-identity-contracts-preflight-001-20260912`  
**Base subject:** `170860ea430da7b1a26a402512b1d54fb89b5a69`  
**Standing:** `SOURCE_BOUND__BOUNDED_IMPLEMENTATION_AUTHORIZED__FULL_CONTINUITY_BUILD_BLOCKED`

## 1. Exact sources bound

### Identity / Delegation

Current branch source:

- `system-master/foundation-spine/identity/src/main/java/org/systemmaster/foundation/identity/DelegationRuntime.java`
- blob `758c130ec2d27f613ce56854ae71c5f372799761`

The bounded adapter consumes the existing `DelegationRuntime.CapabilityUseRequest`, calls the existing `DelegationRuntime.DelegationService.validateUse(...)`, and preserves the returned `DelegationRuntime.CapabilityValidationReceipt` without reinterpretation as Effect, Resource, Placement, Work, Plan, or whole-Runtime authority.

### Contracts / Versioning

Current branch source:

- `system-master/foundation-spine/contracts/src/main/java/org/systemmaster/foundation/contracts/ContractAuthorityRuntime.java`

The bounded adapter calls the existing `ContractAuthorityRuntime.resolveForMutation(subjectId, requestedVersion, requestedDigest)` and preserves the returned `GateReceipt`. `ADMITTED` means only the Contracts prerequisite is structurally/version-compatible. `MIGRATION_REQUIRED` and `REJECTED` fail closed for the bounded preflight.

### Durable Runtime base

The exact bounded F003 source custody remains the recovery unit frozen by `CORE-DURABLE-RUNTIME-PLATFORM002-CUSTODY-RECOVERY-001.md`.

The materialized carrier used during this reconstruction hashes to:

`05e272da8d6bb7c597a2719c7be5395698c5a880794631113869598bbc4f16df`

and the seven bounded F003 source/migration file hashes match the current repository recovery record. This source bind does not copy or mutate those F003 files. The new preflight is an additive boundary component.

## 2. Authority rule

The preflight is not a new semantic authority. It may only answer whether the already-bound Identity and Contracts prerequisites are current enough to continue to later gates.

An `ALLOW_CURRENT_PREREQUISITES` result never authorizes:

- Work or Project lifecycle;
- Plan or Step readiness;
- Resource admission or budget;
- Routing or Placement;
- Runtime lease/fence mutation;
- Transport delivery truth;
- external Effect permission;
- Evidence/Assurance PASS;
- Security/secret authorization;
- Book/Learning/Documents/Programming semantics.

Every later required owner must still be checked by its own current authority.

## 3. Freshness and restart rule

The adapter must call the current Identity and Contracts providers on every preflight invocation. A prior successful preflight may not be used as standing after retry, reconnect, or process restart.

A same request identity with the same semantic digest may be reconciled idempotently, but the providers are still re-read. A same request identity with a changed semantic digest is a conflict and must fail closed.

## 4. Provider-binding rule

The adapter may compare externally supplied current provider owner/version bindings against the bindings with which it was constructed. It may not invent or advance Root authority. Missing or changed binding information yields `UNKNOWN/BLOCKED` until rebound.

## 5. Qualification contract

The changed subject must satisfy the exact 26-case minimum frozen in `CORE-DURABLE-RUNTIME-CONTINUITY-QUALIFICATION-DENOMINATOR-FREEZE-001.md`, plus affected current Root, all 36 Identity / Delegation cases, all 48 Contracts / Versioning cases, and the bounded F003 portable regression.

No A-01/native/device/production, live PostgreSQL, human, credential/provider, or specialist-system evidence is claimed by this source bind.
