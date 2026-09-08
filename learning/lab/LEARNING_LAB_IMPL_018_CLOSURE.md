# LEARNING-LAB-IMPL-018 — Domain-General Runtime Course Selection + Adaptive Entry Binding

**Status:** `PASS_PORTABLE_RUNTIME_BINDING`  
**Date:** 2026-09-08  
**Predecessor:** `LEARNING-LAB-IMPL-017` stable Learning execution port  
**Qualified implementation commit:** `967ad8d419d18d9b635dce822bcedefb6f90f629`  
**Qualified runner:** `A-01` / Windows / X64  
**Stable execution port:** `LEARNING-EXECUTION-PORT-V1`  
**Foundation package dependency:** `NONE`

## Objective closed

Removed the Git-only runtime bottleneck from the System Master Learning bridge without creating another mastery authority or rebinding Learning to moving System Master foundation work packages.

The runtime boundary now accepts a registered `domain_key`, constructs the selected grounded course through `DomainGeneralLearningEngine`, validates claimed skills against the actual selected course, and reuses the existing adaptive-entry lifecycle:

`COURSE SELECT -> CLAIM VALIDATION -> BASELINE DIAGNOSTIC -> TUTOR / INDEPENDENT EVIDENCE -> EXISTING MASTERY / RETENTION / TRANSFER AUTHORITY`

New runtime binding version:

`LEARNING-DOMAIN-RUNTIME-BINDING-V1`

Bridge version:

`SYSTEM-MASTER-LEARNING-BRIDGE-V2`

System Master adapter version:

`SYSTEM-MASTER-LEARNING-ADAPTER-V3`

The legacy `START_GIT_ADAPTIVE_ENTRY` operation remains supported by normalization into the generic `START_ADAPTIVE_ENTRY` contract.

## Qualified registered domains

A-01 executed the same runtime path for both existing registry domains:

- `git-feature-branch-workflow`
- `fractions-unlike-denominators`

The Git downstream claim `S-GIT-BRANCH-MERGE` correctly routes first to hidden prerequisite `S-GIT-STAGE-COMMIT`.

The fractions downstream claim `S-FRAC-ADD-SUB` correctly routes first to hidden prerequisite `S-FRAC-EQUIV-LCD`.

Unknown domains fail closed. Claimed skills outside the selected course fail closed. Duplicate claims fail closed. Exact request replay is stable. Two registered domains can coexist in one runtime repository.

## Qualification evidence

Authoritative repaired run:

- workflow run: `34185882814`
- job: `101933993197`
- source commit: `967ad8d419d18d9b635dce822bcedefb6f90f629`
- result: **PASS**

Focused Python domain-runtime suite:

- **10/10 PASS**
- runtime: **21.007 seconds**

Java isolation compile:

- **PASS**
- `IMPL018_JAVA_FOUNDATION_DEPENDENCY=NONE`

Real Java -> Python cross-domain qualification:

- `IMPL018_STATUS=PASS`
- `IMPL018_ASSERTIONS=14`
- `IMPL018_BRIDGE_CALLS=5`
- `IMPL018_PORT_VERSION=LEARNING-EXECUTION-PORT-V1`
- `IMPL018_ADAPTER_VERSION=SYSTEM-MASTER-LEARNING-ADAPTER-V3`
- `IMPL018_DOMAINS=git-feature-branch-workflow,fractions-unlike-denominators`
- `IMPL018_FOUNDATION_PACKAGE_DEPENDENCY=NONE`

Evidence artifact:

- name: `learning-impl-018-evidence`
- artifact ID: `10040486927`
- SHA-256: `9a3d3e27526469cb981156444d0782f4c667fd32c94897269cb1520f10d9c949`

## Fail-first evidence and repair

Initial run `34185765098` executed all ten new Python cases and produced **9/10 PASS**. The only failure was a test expectation mismatch: cross-domain reuse of the same request identity was rejected earlier by the repository operation-idempotency authority as `IDEMPOTENCY_DIGEST_MISMATCH`, while the test expected the later `ADAPTIVE_ENTRY_JOURNEY_ID_REUSE` guard.

No product weakening was required. The test was corrected to bind to the actual earlier fail-closed authority. The repaired run then passed all gates.

## What is proven

For the bounded portable runtime, System Master can select either currently registered Learning domain through one stable Learning-owned execution port, create the correct grounded course, scope claimed skills to that course, preserve prerequisite-safe adaptive entry, and keep Learning decoupled from moving F-WP package numbers.

## Not proven

This closure does not prove:

- arbitrary or previously unregistered learner goals can enter the runtime;
- live autonomous research quality for arbitrary goals;
- native iPhone integration or background execution;
- real learner effectiveness;
- psychometric validity/reliability or population fairness;
- certification or job readiness.

The next implementation dependency is the first item above: route an arbitrary bounded learner goal through the already-existing open-goal research/course compiler into this same stable adaptive-entry runtime without creating a second course or mastery authority.
