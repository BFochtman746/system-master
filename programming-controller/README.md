# System Master Programming Controller

This directory is the **external development control plane** used to coordinate Programming/GitHub work while System Master is being built. It is not linked into the System Master iPhone product runtime and does not replace the existing shared A-01 control plane.

## Current implementation authority

`WP-001M / SYSTEM-MODEL-001` is being implemented in dependency order from the R5AY Programming Controller Build Handoff.

### Implemented candidate slices

`IMPL-001M-01` — core metamodel and hard structural validation:

- typed model entity and relationship registries;
- explicit unknown-type / missing-endpoint failures;
- per-relationship cycle policy and rejected-edge rollback;
- explicit 001N identity-validation port.

`IMPL-001M-02` — responsibility / authority / boundary graph:

- stable responsibility records;
- exactly-one active canonical owner enforcement;
- explicit delegation without ownership transfer;
- deterministic owner resolution and missing-owner detection;
- bounded dependency/impact traversal with explicit truncation.

`IMPL-001M-03` — immutable snapshots and change-set consistency core:

- content-addressed immutable model snapshots;
- exact-base draft change sets and revision compare-and-set;
- stale-base rejection;
- idempotent command receipts and semantic replay conflict detection;
- atomic persistence-port commit of snapshot, active pointer, change set, receipt, and evidence outbox record;
- responsibility/authority/boundary state included in the digest-covered canonical snapshot instead of living as restart-volatile side state;
- snapshot-keyed query cache;
- explicit command-outcome recovery plus integrity/restart recovery.

`IMPL-001M-04` — engineer views and canonical import/export projections:

- seven required engineer viewpoints bound to immutable snapshot identity;
- explicit unsupported-semantics reporting instead of inference;
- deterministic canonical JSON model envelope;
- validated imports remain non-authoritative candidates;
- explicit LOSSLESS/LOSSY projection manifests;
- lossy projection import is fail-closed;
- declared lossless adapters support explicit round-trip import.

`IMPL-001M-05` — conformance, guards, evidence, integrity and migration:

- hard/soft conformance constraints with `CANNOT_DETERMINE` fail-closed standing;
- 001Q authorization wrappers with publication-time recheck;
- explicit traversal/import/projection/migration resource budgets;
- 001S evidence-outbox acknowledgement adapter;
- snapshot-integrity inspection;
- copy-on-write schema migration, stale-plan rejection, atomic activation and history-preserving rollback.

`IMPL-001M-06` — downstream authority integration and qualification contract:

- explicit bindings to 001L, 001N, 001O, 001P, 001Q, 001R, 001S, 001W and REPAIR-002;
- startup fails on missing/invalid delegated-authority bindings rather than silently reimplementing them;
- no binding transfers canonical ownership to 001M;
- integrated mutation path consumes 001R consistency validation and 001Q authorization;
- 001S evidence, 001W durable scheduling and REPAIR-002 observed architecture remain delegated calls;
- machine-readable `QualificationProfile001M` binds all 32/32 build-spec requirements to implementation packages and test families.

## Qualification standing

Historical prior-head evidence: exact head `97ab2bac56c55a195e20897c15902e15ae6d648e` passed Programming Controller Portable Qualification with 48/48 Node tests and passed existing A-01 Control Plane Enforcement.

The branch has since changed to repair the canonical `IMPL-001M-03` snapshot boundary. **Qualification does not transfer across heads.** The current exact head must pass its own hosted Programming Controller Portable Qualification and A-01 Control Plane Enforcement before the candidate is requalified.

Even after 001M-owned code qualifies, real production provider bindings remain separately evidenced: durable persistence backend, live 001Q authorization provider, 001S evidence transport, 001W durable scheduler, exact project-architecture source and other downstream provider/runtime facts are not proven merely by 001M contract tests.

This PR remains a draft candidate and is not a merge or production claim.

## Test

```sh
npm test
```
