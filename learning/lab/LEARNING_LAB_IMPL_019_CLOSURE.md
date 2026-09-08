# LEARNING-LAB-IMPL-019 — Open-Goal Runtime Entry + Fail-Closed Abstention Binding

**Status:** `PASS_PORTABLE_OPEN_GOAL_RUNTIME_BINDING`  
**Date:** 2026-09-08  
**Predecessor:** `LEARNING-LAB-IMPL-018` domain-general runtime binding  
**Qualified implementation commit:** `4c08232517417ae847d4732cf94de62583bb08e9`  
**Qualified runner:** `A-01` / Windows / X64  
**Stable execution port:** `LEARNING-EXECUTION-PORT-V1`  
**Foundation package dependency:** `NONE`

## Objective closed

Exposed the already-qualified live/replay open-goal research, model-candidate, independent-oracle, and dynamic-course compiler through the stable System Master Learning runtime without creating a second course or mastery authority.

The bounded runtime path is now:

`OPEN GOAL -> RESEARCH SUPPORT / ABSTAIN -> PINNED RESEARCH DOSSIER -> PINNED MODEL CANDIDATE -> INDEPENDENT ORACLE -> DYNAMIC COURSE -> BASELINE / TUTOR / EXISTING MASTERY-RETENTION-TRANSFER CORE`

New runtime binding:

`LEARNING-OPEN-GOAL-RUNTIME-BINDING-V1`

Bridge:

`SYSTEM-MASTER-LEARNING-BRIDGE-V3`

System Master adapter:

`SYSTEM-MASTER-LEARNING-ADAPTER-V4`

The adapter still compiles only against the Learning-owned `LEARNING-EXECUTION-PORT-V1`; it does not import moving F-WP packages.

## Bounded supported open-goal proof

Qualified goal:

`Use Python list and dictionary comprehensions to transform and filter data.`

The runtime:

- loaded the sealed normalized research capture;
- selected the previously unregistered `python-comprehensions` domain;
- pinned the recorded GPT-5.6 Sol candidate-generation trace;
- preserved the generator role as candidate-only;
- bound the independent `PYTHON_COMPREHENSION_EXPRESSION` oracle;
- generated and mechanically validated the dynamic course;
- preserved `MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED`;
- entered the same adaptive-entry journey used by registered domains.

Unsupported research goals fail closed with `LIVE_OPEN_GOAL_UNSUPPORTED_OR_INSUFFICIENT_RESEARCH`.

A goal that matches the research capture but does not match the exact pinned model-generation goal fails closed with `MODEL_TRACE_GOAL_MISMATCH`.

Claimed skills outside the generated course fail closed.

The registered-domain route remains available in the same adapter.

## Replay/recovery behavior

A fresh bridge process can now replay a completed open-goal request and rehydrate the persisted dynamic domain through the engine's existing public course-resolution path before the adapter needs its behavior oracle.

The replay does not rebuild or mutate the sealed course. Exact request replay is byte stable.

## Qualification evidence

Authoritative repaired run:

- workflow run: `34186317010`
- job: `101935244724`
- source commit: `4c08232517417ae847d4732cf94de62583bb08e9`
- result: **PASS**

Focused Python open-goal runtime suite:

- **8/8 PASS**
- runtime: **1.838 seconds**

Java isolation compile:

- **PASS**
- `IMPL019_JAVA_FOUNDATION_DEPENDENCY=NONE`

Real Java -> Python open-goal qualification:

- `IMPL019_STATUS=PASS`
- `IMPL019_ASSERTIONS=15`
- `IMPL019_BRIDGE_CALLS=5`
- `IMPL019_PORT_VERSION=LEARNING-EXECUTION-PORT-V1`
- `IMPL019_ADAPTER_VERSION=SYSTEM-MASTER-LEARNING-ADAPTER-V4`
- `IMPL019_OPEN_GOAL_DOMAIN=python-comprehensions`
- `IMPL019_FOUNDATION_PACKAGE_DEPENDENCY=NONE`

Evidence artifact:

- name: `learning-impl-019-evidence`
- artifact ID: `10040632565`
- SHA-256: `7cab9e5765ae3fd748f46c278715e6c1ca61ef1d4b545039dc760933f6c2c149`

## Fail-first evidence and repair

Initial run `34186199136` exposed two integration assumptions before Java exposure:

1. **Dynamic-domain replay rehydration gap.** A fresh `LiveReplayOpenGoalLearningEngine` could return the already-persisted course operation result while its new in-memory registry had not yet re-registered that dynamic domain. The bridge then attempted direct registry lookup and failed `UNSUPPORTED_DOMAIN`.

   Repair: after a replayed course result, the bridge invokes the engine's existing public course-resolution path when the domain is not yet registered. That path reconstructs the `DomainSpec` from the persisted sealed dossier. No Learning-core authority or course bytes were weakened or changed.

2. **Test sequencing assumption.** The test initially expected a claim on `S-PY-DICTCOMP` to force a diagnostic probe of `S-PY-LISTCOMP`. The generated Python course deliberately has no hard prerequisite edge between those two skills. Therefore the existing baseline policy conservatively routed the earlier unsatisfied list-comprehension skill to instruction. The test was corrected to the actual course graph; the course and routing policy were not changed to satisfy the test.

Intermediate run `34186287514` is superseded because it contained the corrected sequencing expectation but predated the replay-rehydration repair.

## What is proven

Within the sealed portable inputs, System Master can invoke a previously unregistered bounded learning goal through one stable Learning-owned execution port, preserve research/model/oracle provenance and human-review standing, dynamically construct the course, enter the existing adaptive Learning lifecycle, fail closed when evidence/model support is missing, and replay the same request after process restart.

## Not proven

This closure does not prove:

- autonomous live web research for arbitrary learner goals;
- arbitrary current model-provider generation without a pre-pinned trace;
- arbitrary domain-specific oracle synthesis;
- that mechanical course validation is human pedagogical approval;
- native iPhone integration/background execution;
- real learner effectiveness;
- psychometric validity/reliability or population fairness;
- certification, job readiness, accreditation, or academic credit.

## Next implementation dependency

The runtime no longer needs another canned domain. The next product gap is the acquisition boundary: turn a new supported learner goal into a newly captured, pinned, reviewable research/model input packet through controlled provider gateways, while keeping research/model generation non-authoritative and requiring independent validation before the course can enter the same runtime.
