# LEARNING-LAB-IMPL-022 — Bounded Crash-Safe Multi-Sample Provider Acquisition

**Status:** `PASS_PORTABLE_PROVIDER_CALLABLE_BINDING`  
**Date:** 2026-09-08  
**Predecessor:** `LEARNING-LAB-IMPL-021` provider multi-candidate selection + abstention  
**Qualified implementation lineage commit:** `33d00327b3e04ea793716f2329afeb1a2538e460`  
**Canonical qualified source commit:** `cf95021c0a4da489c6f7cdd69b00e621561a7219`  
**Qualified runner:** `A-01` / Windows / X64  
**Python:** `3.13.15`  
**Acquisition version:** `OPEN-GOAL-PROVIDER-MULTI-SAMPLE-ACQUISITION-V1`  
**Batch version:** `OPEN-GOAL-PROVIDER-MULTI-SAMPLE-BATCH-V1`

## Objective closed

Added a bounded acquisition authority in front of the already-qualified IMPL-021 independent selector.

Runtime path:

`ONE RESEARCH CAPTURE -> 2..8 SAME-PROMPT MODEL SAMPLES -> SEAL EACH SAMPLE BEFORE NEXT CALL -> IMMUTABLE PACKET SET -> IMPL-021 INDEPENDENT SELECT OR ABSTAIN -> ADAPTIVE ENTRY`

The acquisition layer never ranks candidates, never marks a course verified, never mints mastery evidence, and never samples until a winner appears.

## Durability and authority behavior proven

- exactly one accepted research capture per batch;
- model sampling is explicitly bounded to 2..8 samples;
- each stochastic sample is sealed through the existing IMPL-020 packet boundary before any later sample call;
- restart after durable research does not reacquire research;
- restart after sample 1 does not resample sample 1;
- restart after sample 2 calls only the missing later sample;
- completed replay invokes no provider callable;
- changed completed operation fails before provider calls;
- duplicate model outputs fail closed and do not trigger hidden resampling;
- the same normalized research identity and prompt digest are enforced across the batch;
- SELECT hands off into the existing adaptive journey;
- a tie ABSTAINS without course or journey creation;
- IMPL-021 independent selection remains the selection authority.

## Qualification evidence

Canonical authoritative A-01 run:

- workflow run: `34232942271`
- job: `102083355081`
- source commit: `cf95021c0a4da489c6f7cdd69b00e621561a7219`
- result: **PASS**
- runner: `A-01`

Focused IMPL-022 acquisition suite:

- **10/10 PASS**
- runtime: **1.913 seconds**

IMPL-021 regression suite:

- **11/11 PASS**
- runtime: **3.466 seconds**

Evidence artifact:

- name: `learning-impl-022-evidence`
- artifact ID: `10058573142`
- size: `1603 bytes`
- SHA-256: `631765ee82bb8eb361e907a9c2ed93b72f56ff26a2e31c5ff77907dc2d2c4556`
- expires: `2026-10-08T13:36:10Z`

## What is proven

Within the bounded portable runtime, System Master can acquire one normalized research capture, invoke a replaceable model-provider callable for a fixed finite same-prompt sample set, durably seal every accepted stochastic output before proceeding, recover from crashes without silently resampling already-durable outputs, and hand the resulting packet set to the previously qualified independent selection/abstention authority.

## Not proven

This closure does not prove:

- a production external model-provider adapter or credential path;
- a production external web/search provider adapter;
- provider rate-limit, network-failure, timeout, retry, or billing semantics against a real external API;
- native iPhone integration/background execution;
- real learner effectiveness;
- psychometric validity/reliability or population fairness;
- certification or job readiness.

## Dependency-valid successor

No canonical `LEARNING-LAB-IMPL-023` existed at qualification time. The next implementation gap is therefore not named as an existing objective here. The dependency-valid next work is to bind this qualified bounded acquisition contract to an existing production/provider gateway if one already exists in System Master, or define the smallest replaceable external-provider adapter if none exists, while preserving sealed-before-next-call recovery, explicit finite budgets, and independent downstream selection.
