# CORE-IDENTITY-PRINCIPAL-DELEGATION-REBASE-DESIGN-LOCK-002

Status: **RECOVERED / INVENTORIED / ANALYZED / TARGETED-RESEARCHED / ADJUDICATED / BOUNDARY-DESIGN-LOCKED / BUILD BLOCKED ON EXACT PACKAGE MATERIALIZATION**
Owner: `SYSTEM_MASTER/CORE`
Live owner subject re-verified immediately before this write: `system-master/control-v2@2e6ab006a48a5908d59642d36c567f447c66f49b`
Predecessor: `CORE-IDENTITY-PRINCIPAL-DELEGATION-ATOMIC-MAPPING-001.md`
Fresh architecture authority: `system-master/foundation-spine/SYSTEM-SPECIFICATION.md`
Fresh implementation truth bridge: `system-master/foundation-spine/IMPLEMENTATION-STATUS.md`
Historical semantic blueprint: `SYSTEM-MASTER-REBUILD-021O-R1` / `021O-R1-BUILD-INSTRUCTIONS.md`
Historical boundary reconciliation: `021O-R1-AUTHORITY-BOUNDARY-RECONCILIATION.json`

## 1. Decision

The fresh Foundation logical boundary **Identity, Principal & Delegation** is the current canonical architectural owner for actor identity and delegated-authority semantics.

Historical `021O` is preserved as a strong, lossless semantic/build-spec lineage for that boundary. It is **not** restored as a separate current system, peer lane, database, execution owner or competing authority. Its recovered architecture is reused by rebase/adaptation under the fresh Foundation specification.

The rebase is justified because:

- the fresh Foundation specification requires stable user/device/session/service/workload identity, actor chains, delegated authority, capability grants, expiry/revocation, attribution, short-lived workload identity and least-privilege delegation;
- the recovered 021O architecture/build spec is closed with zero material architecture residuals and already separates identity/authentication/authorization/delegation from crypto, privacy, execution placement, effects, domain semantics, physical persistence and evidence authorities;
- the current CORE tree has no fresh installed Identity runtime, so historical architecture is evidence/reuse input rather than duplicate implementation;
- current F-WP-003/005/006/007 code contains valuable consumer/invariant substrate but does not establish canonical Identity ownership;
- external NIST/SPIFFE/IETF research supports the same fundamental boundary properties: service/workload identity independent of network location, short-lived workload credentials, and explicit actor/delegation lineage rather than ambient impersonation.

No historical PASS, architecture closure or recovery artifact is promoted to current implementation or qualification standing.

## 2. Frozen ownership boundary

### Identity, Principal & Delegation OWNS

- stable principal identity and principal kind;
- canonical principal aliases and lifecycle standing;
- actor identity and actor-chain/delegation-chain references;
- generic delegated-authority semantics, including parent/child narrowing, scope/constraint inheritance, expiry and revocation;
- identity/authentication credential **references/binding/standing**, not raw secrets or keys;
- authentication/authenticator standing and assurance semantics when later Identity packages are admitted;
- role/attribute/permission registry and authorization-decision semantics when later packages are admitted;
- authenticated session/token/federation identity standing when later packages are admitted;
- delegation versus explicit impersonation semantics;
- privileged identity/step-up/approval binding semantics when later packages are admitted;
- revocation registry/propagation semantics when later packages are admitted;
- workload/agent principal identity adapters when their prerequisites are complete.

### Identity, Principal & Delegation DOES NOT OWN

- System Root topology/system identities/admission/retirement;
- raw reusable secrets, private keys, certificates, cryptographic trust roots, signing/encryption or cryptographic attestation material;
- privacy/data-use/disclosure eligibility;
- Keel goal/intent semantics;
- planning/orchestration semantics;
- resource budgets, reservations or execution admission grants;
- executor placement, execution leases or fencing;
- consequential external-effect authorization/execution/receipt;
- Book/Learning/Documents/Programming semantic truth;
- physical database/persistence authority;
- evidence/qualification standing;
- UI/session/cache projections as business truth.

These exclusions are hard collision fences, not convenience boundaries.

## 3. Preserved hard laws

1. Authentication never implies authorization.
2. Identity never implies specialist/domain semantic authority.
3. Unknown protected identity/authentication/authorization/delegation/revocation state fails closed.
4. Roles and attributes are policy inputs, not ambient privilege.
5. Authorization is exact-subject bound: principal + action + resource + policy/currentness/revocation context.
6. Delegation may narrow but never widen proven authority.
7. Generic delegation preserves subject + actor lineage; impersonation is explicit, bounded, visible and separately authorized.
8. Raw secrets/keys/certificates remain outside Identity records; store references/standing only.
9. Privacy and effect authority are independent conjunctive gates; Identity allow cannot override either.
10. Revocation invalidates stale sessions/tokens/grants/delegations/caches before consequential reuse.
11. Agent/system/service/local identities receive no automatic trust from type, host, network, session possession or locality.
12. Workload identity is short-lived/rotatable/verifiable and cannot depend on embedded long-lived reusable credentials.
13. Delegation chains are bounded, acyclic and fully attributable.
14. Descendants cannot expand permissions, purpose, scope, privacy/rights ceilings, cost/resource ceilings or time bounds granted by their parent authority.
15. Identity/delegation state is durable; projections and caches are reconstructable and never become canonical authority.
16. Downstream grants/effects preserve immutable references to the exact current identity/delegation/revocation evidence they consumed.
17. Semantic-owner identity is never inferred from executor/provider/actor identity.
18. Evidence class cannot exceed the environment actually executed.

## 4. Reuse/adjudication lock

| Source | Current disposition |
|---|---|
| Fresh Foundation `Identity, Principal & Delegation` specification | **CANONICAL CURRENT ARCHITECTURE OWNER** |
| Historical `SYSTEM-MASTER-REBUILD-021O-R1` | **REUSE/ADAPT AS ENGINEER-BUILDABLE SEMANTIC BLUEPRINT**; no separate current system |
| Historical 021O authority-boundary reconciliation | **KEEP AS BOUNDARY CROSSWALK** where consistent with fresh Foundation laws |
| F-WP-005 bounded authorization/SoD/revocation-epoch semantics | **KEEP-BUT-ADAPT AS CONSUMER/INVARIANT SUBSTRATE**; not canonical Identity store |
| F-WP-003 semantic-owner/executor separation | **KEEP AS HARD CROSS-BOUNDARY INVARIANT** |
| F-WP-006 exact execution grants | **KEEP IN RESOURCE/EXECUTION AUTHORITY**; consume Identity evidence |
| F-WP-007 leases/fences | **KEEP IN PLACEMENT/DURABLE-RUNTIME AUTHORITY**; consume principal refs only |
| PLATFORM003 recovered session terminal/revocation semantics | **REBIND/MIGRATION CANDIDATE** after exact runnable source custody and fresh tests |
| Historical SECURITY delegation/authorization rules | **KEEP AS REQUIREMENT EVIDENCE**; rebase only through current contracts |
| Raw crypto/secret material | **EXCLUDED FROM IDENTITY** |
| Ambient role/network/locality/session trust | **REJECTED** |

No REMOVE decision erases historical evidence.

## 5. Dependency-valid implementation entry point

The recovered 021O package order identifies the first bounded package as:

`O-WP-001 — Principal identity, kind, aliases and lifecycle`

Historical dependency graph records **no hard package predecessor** for O-WP-001. Historical readiness marked it conditional `READY_AFTER_BUILD_FREEZE_BASELINE`; subsequent O-WP packages depend on it.

For current Foundation rebase purposes, O-WP-001 is therefore the first candidate implementation slice once its exact package inputs are materialized and reconciled to the fresh target.

This does **not** authorize blindly copying old code or inventing missing O-RQ rows.

## 6. O-WP-001 current scope lock

Until the exact recovered package rows are materialized, only the following coarse scope is frozen:

- canonical principal identity;
- principal kind/type;
- alias registration/resolution without duplicate canonical authority;
- principal lifecycle/current standing;
- immutable identity/history and current-version semantics required by the recovered package;
- typed command/query contracts only;
- persistence through admitted Canonical Data & Persistence interfaces rather than a private shadow database;
- evidence references through admitted evidence interfaces;
- no authenticator, authorization-policy, session, token, delegation, impersonation, privileged-access, revocation-propagation or workload-adapter implementation is pulled forward from later O-WPs.

The exact components, data entities, APIs, O-RQ identifiers, failure rules and test families remain package-bound and may not be guessed.

## 7. Exact implementation blocker

Current `021O-R1-BUILD-INSTRUCTIONS.md` requires, before implementation:

1. exact 021O package ZIP and SHA-256;
2. filtered `021O-R1-ATOMIC-REQUIREMENTS-TRACEABILITY` rows for the assigned O-WP;
3. authority-boundary reconciliation;
4. referenced component/data/API/failure/security/qualification artifacts;
5. exact current authority + implementation-authorization fence;
6. current target provider/profile only where target-dependent.

This run recovered items 3 and 5, plus architecture/build instructions, closure receipts, build-order/dependency evidence and substantial historical requirement evidence. It did **not** recover a separately verifiable exact 021O package ZIP+SHA nor the exact filtered O-WP-001 O-RQ rows/components/data/APIs as materialized inputs.

The portable master backup receipt proves an archived master existed and passed ZIP testing, but that is not a substitute for exact O-WP-001 package materialization and requirement filtering.

Therefore current build standing is:

`BLOCKED_EXACT_SOURCE_CUSTODY / TRACEABILITY_INPUT_MISSING`

This is a build-input blocker, not an architecture-design failure and not an A-01 failure.

## 8. Why implementation is not started in this unit

Starting O-WP-001 from inferred names alone would violate tonight's new method and the recovered build instructions because it would break exact `requirement -> component -> state -> API -> invariant -> test -> evidence` traceability before the first line of code.

The correct fail-closed behavior is to preserve the now-locked ownership/reuse boundary, recover the exact package inputs, then build the first bounded slice without semantic drift.

## 9. Qualification contract for O-WP-001 after materialization

At minimum, exact mapped requirements must cover and test:

- stable principal identity and collision rejection;
- supported principal-kind semantics without type-based ambient trust;
- alias create/resolve/retire rules and duplicate-canonical prevention;
- lifecycle transition legality/currentness;
- immutable history / revision or OCC semantics as the exact recovered contract requires;
- restart/replay/reconstruction of canonical principal state;
- idempotent same-command replay versus same identity/different bytes conflict;
- concurrent create/alias/lifecycle races;
- unknown/stale/corrupt state fail closed;
- semantic-owner takeover attempts rejected;
- no raw reusable secret/private-key/certificate payload in ordinary identity records;
- System Root + O-WP-001 cumulative regression;
- compatibility with representative downstream F-WP principal-reference consumers without transferring their authority into Identity.

Exact O-RQ/test-family mapping takes precedence once recovered.

## 10. Evidence standing

- Fresh System Root: current hosted-qualified at `2e6ab006...`; A-01 target execution remains unexecuted/unavailable as previously recorded.
- Identity architecture/rebase boundary: **LOCKED by this packet**.
- Historical 021O architecture/build spec: **CLOSED historical evidence / reused blueprint**.
- Current Identity implementation: **NOT STARTED**.
- Current Identity executable qualification: **NOT STARTED**.
- A-01/native/production Identity standing: **NOT CLAIMED**.

## 11. Exact safe successor

`CORE-IDENTITY-O-WP-001-SOURCE-MATERIALIZATION-003 — RECOVER EXACT 021O PACKAGE IDENTITY + SHA -> MATERIALIZE/FILTER ALL O-WP-001 O-RQ ROWS + REFERENCED COMPONENT/DATA/API/FAILURE/SECURITY/QUALIFICATION ARTIFACTS -> VERIFY AGAINST CURRENT FOUNDATION BOUNDARY -> BIND BOUNDED O-WP-001 BUILD SUBJECT`

Only after that successor passes may the lane enter **BUILD** for O-WP-001. Build must occur on a fresh exact subject rooted in the then-live `system-master/control-v2` head, with a fresh pre-mutation head check and no overlapping CORE mutation claim.
