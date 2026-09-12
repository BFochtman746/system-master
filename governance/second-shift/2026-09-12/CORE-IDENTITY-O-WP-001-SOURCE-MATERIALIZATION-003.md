# CORE-IDENTITY-O-WP-001-SOURCE-MATERIALIZATION-003

Status: **PASS — EXACT PACKAGE + REQUIREMENT INPUTS MATERIALIZED / BUILD SUBJECT MAY BE BOUND**
Owner: `SYSTEM_MASTER/CORE`
Fresh target owner: `Identity, Principal & Delegation` inside Foundation & Spine
Live CORE head re-read before materialization: `system-master/control-v2@2e6ab006a48a5908d59642d36c567f447c66f49b`
Predecessor: `CORE-IDENTITY-PRINCIPAL-DELEGATION-REBASE-DESIGN-LOCK-002.md`

## Exact recovered source identity

Library checkpoint:
`ARCHITECTURE_1_0_CURRENT_CHECKPOINT_021O_R1_20260903.zip`

Observed outer size: `115310196` bytes
Observed outer SHA-256: `8c06557d296e7c3b72720a8afdb6adc651fdf27d57a173c14a898006f7c217f7`

The checkpoint manifest declares the embedded exact 021O package:
`SYSTEM_MASTER_REBUILD_021O_R1_BUILD_SPEC_REQUALIFIED_BACKUP_20260903.zip`

Manifest SHA-256:
`cc8d7567ee2a1f307eba7add206d5c12c25db5a6dfa4fe7d09fc8499db21cc37`

Independent byte hash after materialization:
`cc8d7567ee2a1f307eba7add206d5c12c25db5a6dfa4fe7d09fc8499db21cc37`

Result: **MATCH / EXACT PACKAGE IDENTITY ESTABLISHED**.

The checkpoint and embedded package remain architecture/build-spec evidence. Their old closure standing is not promoted to current computer implementation or qualification.

## Exact O-WP-001 package

`O-WP-001 — Principal identity, kind, aliases and lifecycle`

Prerequisites: **none** inside the historical 021O package order.

Components:
- `PrincipalRegistry`
- `PrincipalAliasRegistry`
- `PrincipalLifecycleService`

Data entities:
- `Principal`
- `PrincipalRevision`
- `PrincipalAlias`

Typed APIs:
- `RegisterPrincipal`
- `RevisePrincipal`
- `GetPrincipal`
- `GetPrincipalHistory`
- `RegisterPrincipalAlias`
- `ResolvePrincipalAlias`
- `ChangePrincipalStanding`

Required qualification families:
- unit
- schema_contract
- property_invariant
- state_failure
- security_privacy
- concurrency_idempotency
- integration
- migration_rollback
- performance_resource where applicable

Required evidence:
- exact source/build digest
- mapped requirement-to-change-to-test receipt
- contract/schema result
- authn/authz/security/adversarial result
- failure/recovery result
- unresolved residuals with explicit standing

## Exact O-WP-001 requirement set

22 atomic requirements were filtered from `021O-R1-ATOMIC-REQUIREMENTS-TRACEABILITY.jsonl` by exact `implementation_work_package == O-WP-001`:

`O-RQ-001, O-RQ-002, O-RQ-005, O-RQ-051, O-RQ-052, O-RQ-055, O-RQ-102, O-RQ-103, O-RQ-104, O-RQ-157, O-RQ-158, O-RQ-159, O-RQ-160, O-RQ-161, O-RQ-162, O-RQ-163, O-RQ-256, O-RQ-271, O-RQ-288, O-RQ-289, O-RQ-300, O-RQ-316`.

Materially controlling requirements include:
- one identity semantic authority; no duplicate identity/permission truth store;
- authentication and authorization remain independent;
- human proofing and workload/service/agent identity evidence are distinct;
- stable `PrincipalId` survives alias changes; alias values never become identity truth;
- ambiguous alias/principal collision blocks automatic merge/access and preserves candidate lineages;
- confused-deputy/privilege-escalation attempts deny and preserve exact actor/subject/resource/action evidence;
- implementation stays inside O-WP-001 scope and emits exact requirement -> change -> test evidence.

## Exact data-contract recovery

### Principal
Identity: `principal_id`
Fields: `principal_id, kind, status, created_at, current_revision, authority_refs, evidence_refs`
Versioning: monotonic revision/OCC for mutable principal registries; immutable receipts for material auth/security evidence.

### PrincipalRevision
Identity lineage: `principal_id + revision`
Fields: `principal_id, revision, display_metadata, status, parent_revision, changed_at, reason, evidence_refs`

### PrincipalAlias
Identity: `alias_id`
Fields: `alias_id, principal_id, alias_type, value_digest_or_ref, issuer_or_namespace, valid_from, valid_to, standing`

Privacy/classification is delegated to the privacy authority; identity metadata is minimum-needed and field-filtered. Retention/disposition is delegated to lifecycle authority.

## Exact API-contract recovery

Every O-WP-001 mutation/query is typed and versioned. Declared common error classes include:
`INVALID_ARGUMENT, NOT_FOUND, CONFLICT, STALE_BASE, UNAUTHENTICATED, DENIED, REAUTH_REQUIRED, REVOKED, EXPIRED, BLOCKED_DEPENDENCY, AMBIGUOUS, QUARANTINED, UNAVAILABLE`.

Historical package mutation law requires identity, current authorization as applicable, expected version/revocation standing and idempotency for commands; queries are read-only/field-filtered. The fresh O-WP-001 implementation must not invent ambient authorization to bootstrap itself: bootstrap/administrative mutation authority must be an explicit bounded adapter/fence and later authorization packages must replace or bind it before consequential production use.

## Current rebase disposition

- Current canonical architecture owner remains fresh Foundation `Identity, Principal & Delegation`.
- Historical 021O names remain requirement/build-spec IDs for lossless traceability only.
- O-WP-001 is dependency-valid as the first bounded implementation slice.
- Later O-WP packages are not pulled forward.
- Raw secrets/keys/certificates, privacy eligibility, resource grants, execution placement/leases, effect authority, domain semantics, physical persistence authority and evidence standing remain separate owners.

## Resolved blocker

Prior standing:
`BLOCKED_EXACT_SOURCE_CUSTODY / TRACEABILITY_INPUT_MISSING`

Current standing:
`RESOLVED — EXACT 021O PACKAGE + O-WP-001 REQUIREMENTS/COMPONENTS/DATA/APIS/TEST FAMILIES MATERIALIZED`

## Remaining implementation fences

1. Fresh pre-mutation CORE head re-read is still mandatory.
2. One CORE mutation claim at most; overlap must fail closed.
3. Physical persistence must be consumed through a declared store/adapter boundary; no shadow product database authority may be created.
4. Portable reference persistence may be used for isolated qualification only if explicitly classified as an adapter, not production persistence authority.
5. Current Authorization/Privacy/Crypto/Effect/Placement owners are not silently implemented inside O-WP-001.
6. No A-01/native/production standing may be inferred from portable/hosted tests.

## Exact successor

`CORE-IDENTITY-O-WP-001-BUILD-004 — BIND FRESH CORE HEAD -> IMPLEMENT PRINCIPAL REGISTRY + ALIAS REGISTRY + LIFECYCLE SERVICE AGAINST EXACT 22 O-RQ ROWS -> ISOLATED QUALIFICATION -> SYSTEM-ROOT+CANDIDATE CUMULATIVE REGRESSION -> FREEZE BOUNDED O-WP-001 OR PRESERVE EXACT BLOCKER`
