# PROPOSED LEARNING-LAB-IMPL-032

Objective: Fresh Evidence Candidate Acquisition + Provider-Sealed Admission Pipeline.

Status: PROPOSED / NOT YET QUALIFIED.

## Purpose

Close the IMPL-031 truth-boundary gap for external acquisition of fresh maintenance and transfer candidates without allowing any research/model provider to grant itself evidence standing, mastery authority, or runtime eligibility.

## Required flow

`BLOCKER REQUIRES FRESH EVIDENCE -> FREEZE REQUEST INTENT -> ACQUIRE PROVIDER CANDIDATE -> DURABLY SEAL UNVERIFIED CANDIDATE -> INDEPENDENT IMPL-031 ADMISSION -> RUNTIME OVERLAY -> EXISTING UNIFIED PREPARE_TURN`

## Authority boundaries

- Provider/model is candidate-generation authority only.
- Provider/model output is never an admission receipt.
- Provider/model cannot mark a task verified, admitted, fresh, correct, mastery-bearing, or runtime-eligible.
- `FreshEvidenceTaskAdmissionService` from IMPL-031 remains the sole admission boundary for provider-generated fresh evidence tasks.
- Independent domain oracle must still validate the candidate/reference answer.
- Learning engine remains mastery authority.
- Frozen course and research dossier remain immutable.
- Existing provider acquisition/checkpoint patterns must be reused where possible; no parallel provider trust model.

## Durability / replay requirements

- Freeze request identity and task scope before the first stochastic provider call.
- Persist the first accepted provider response before downstream admission.
- Exact replay after a durable capture must reuse the captured candidate and must not silently resample.
- Reusing an acquisition identity with different course/kind/skill/criterion/provider semantics must fail closed.
- Crash recovery must be qualified after request freeze, provider capture, and admission completion.

## Candidate packet requirements

At minimum bind:

- acquisition/request ID
- course ID
- evidence kind (`maintenance` or `transfer`)
- skill ID
- criterion ID
- provider/model identity
- prompt/request version
- frozen course digest
- frozen research dossier digest
- admitted-claim scope
- known/banned family IDs at request time
- provider raw-output digest
- normalized candidate digest
- standing proving the packet is sealed but unverified

## Fail-closed requirements

Reject before IMPL-031 admission when:

- provider output attempts to assert verification/admission/mastery standing
- provider output changes requested course/skill/criterion/kind scope
- provider output omits required task fields
- provider output references claims outside the frozen admitted research scope
- candidate family is already known at acquisition time
- provider replay/resampling would replace a durable captured candidate
- capture provenance or digest drifts

IMPL-031 must still reject independently invalid reference answers, non-fresh families, invalid transfer novelty, unsupported self-keyed exact scoring, or any other admission violation.

## Milestone proof target

A coherent A-01 milestone must prove at least:

1. provider candidate is durably sealed before admission;
2. exact crash replay does not resample;
3. provider self-approval fields are rejected/ignored fail-closed;
4. a valid provider-produced fractions maintenance candidate passes the independent fractions oracle and IMPL-031 admission;
5. a provider-produced wrong reference answer is rejected by the independent oracle;
6. a provider-produced reused family is rejected;
7. an admitted provider candidate recovers a real exhausted-family blocker and surfaces through the existing unified turn path answer-withheld;
8. IMPL-031, IMPL-030, IMPL-027, and provider runtime regressions remain green.

## Truth boundary

Even if IMPL-032 passes, it will not prove provider/model factual reliability in general, psychometric validity, real-learner effectiveness, population validity, or native iPhone deployment/runtime behavior.
