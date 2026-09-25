# PROGRAMMING-CORPUS-CENSUS-002

Status: **CANDIDATE — SUPERVISED PRE-STAGE ONLY**  
Knowledge Recovery: `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001`  
Programming lifecycle: `PLANNED_CANDIDATE__NOT_ACTIVE_ARCHITECTURE`  
Second Shift eligibility: **NO**

## Purpose

This record captures the first supervised expansion of the Programming proving corpus after the first A-01 request failed before executor admission. It is evidence preparation only. It does not activate Programming, alter topology, transfer any historical PASS, or claim A-01 verification.

## First supervised execution adjudication

GitHub Actions run `34546333043` failed at the GitHub-hosted admission boundary before A-01 began. The admission job was created without a runner assignment or executable step records; all downstream private A-01 work was skipped. One bounded retry of the same exact run produced the same pre-executor behavior.

Classification: `INFRA_FAILURE__GITHUB_HOSTED_RUNNER_NOT_ASSIGNED`.

This is not a Programming subject failure and not a Knowledge Recovery pipeline failure. A-01 must not be bypassed by directly invoking the private executor while the canonical admission boundary remains unresolved.

## Corpus finding

The initial Programming ingest manifest is a valid seed, but it is not an exhaustive corpus census.

A focused Library retrieval identified 69 high-confidence Programming records: 64 `PROGRAMMING_APP_ATOMIC_CAPABILITY_LEDGER_002Y...` locators, four `PROGRAMMING-FOUNDATION-001L`/contract locators, and the `R5AJ_BASELINE` locator. The atomic family spans build execution, test execution, coverage, mutation effectiveness, static analysis, dynamic analysis, fuzzing/generative testing, application security, performance/scalability, compatibility, reliability, diagnosis/repair, validation, release/signing, deployment/rollback, operations/observability, maintenance/EOL, documentation, UI/UX/accessibility, autonomous engineering, semantic code intelligence, architecture/design, planning, threat modeling, environment, evidence, state consistency, crosscut closure and final readiness.

This does not imply 69 unique content objects. Multiple Library locators use `(1)` copies and must be deduplicated by content digest, not by filename.

## Exact pre-stage byte observations

Fifteen Library locators have now been materialized into the supervised working environment. They resolve to 13 unique SHA-256 content identities because two duplicate pairs were proven byte-identical.

The two proven duplicate groups are:

- UI/UX ledger: the base locator and `(1)` locator are both 5,754,840 bytes and hash to `b284ad2a22d272f546753fac3ef310c6d32223aaee99621ddbd4dbfac56c7b16`.
- Application Security ledger: the base locator and `(1)` locator are both 3,644,705 bytes and hash to `0446686be7f839356f222251d3cba9eb33305db2fb02a17c97a65a0355e6dbb3`.

The required provenance representation is therefore **two source locators → one content identity**, with both locators retained. Duplicate discovery never authorizes deleting historical provenance.

All hashes in this phase have standing `CHATGPT_PRESTAGE_OBSERVED__NOT_A01_VERIFIED` until A-01 reads the same exact bytes through the admitted pipeline.

## Important classification corrections

### `PROGRAM-VAULT` is system-wide provenance, not Programming ownership

The System Assurance Library contains a `PROGRAM-VAULT` index lineage observed from v2.0.13 through v2.0.26. Inspection shows that these indexes track cumulative whole-System-Master application releases and changing authorities such as Platform and Interop. The latest observed v2.0.26 index identifies `INTEROP-001` as current authority and `MOD-DOCX-001` as next authority.

Therefore `PROGRAM-VAULT` means the cumulative **program/System Master** vault. It must be ingested into the system-wide provenance layer and linked to Programming only where content-level relations justify it. It must not be mislabeled as Programming-owned evidence.

### Numeric adjacency is not system affinity

`021AA-*` is explicitly Risk Management (`SYSTEM-MASTER-REBUILD-021AA`), not Programming. It is excluded from Programming ownership unless a specific artifact establishes a cross-system relation.

This proves that filename prefix, sequence adjacency and archival co-location are insufficient classification evidence.

## Newly identified manifest delta candidates

Three exact Programming artifacts should be considered for the expanded ingest manifest after reconciliation:

1. `PROGRAMMING-FOUNDATION-001L_P4_R6_REGRESSION_HELD.json` — a later 001L state/regression snapshot.
2. `PROGRAMMING-FOUNDATION-001L_P3_R4_V33_SPECIFIED.json` — an earlier 001L state snapshot needed to preserve lineage.
3. `001L_contract_v6.json` — explicitly declares `PROGRAMMING-FOUNDATION-001L-CONTRACT-V6` and the Programming architecture/traceability service contracts.

Their inclusion does not make them current authority; currentness and reuse disposition must be adjudicated separately.

## Required graph model

The first usable System Master Knowledge Recovery graph must distinguish at least:

- source locator identity,
- byte/content identity,
- artifact/version identity,
- system/capability affinity,
- semantic ownership,
- historical versus current authority,
- qualification/evidence standing,
- supersession lineage,
- duplicate relations,
- derivation/dependency relations,
- quarantine/conflict standing.

That separation is what prevents a historical copy, duplicate file, old PASS or nearby system record from silently becoming current truth.

## Next supervised sequence

1. Continue exact-byte recovery for the focused Programming corpus and content-hash all duplicate candidates.
2. Reconcile the expanded corpus into the Programming ingest manifest while preserving historical locator identities.
3. Generate the candidate content-identity/source-locator graph and check it for dangling references, duplicate collapse errors and ownership leakage.
4. Do not modify A-01 security/admission policy in this branch.
5. Wait for canonical disposition of the GitHub reliability/admission control-plane repair.
6. When admission is canonically available, create a fresh supervised request pinned to the then-current approved subject and expanded manifest.
7. Require a clean A-01 receipt and a deterministic repeat producing the same normalized catalog/graph digests before proposing Second Shift eligibility.

Until those gates pass, `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001` remains supervised and **not Second Shift eligible**.
