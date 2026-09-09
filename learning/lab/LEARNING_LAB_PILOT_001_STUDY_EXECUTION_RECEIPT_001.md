# LEARNING-LAB-PILOT-001-STUDY-EXECUTION-RECEIPT-001

Status: BUILDING

## Objective

Create a fail-closed, privacy-separated pre-analysis receipt for an actually executed Learning effectiveness study. The receipt binds the executed evidence to the frozen study-design authority before any inferential result calculation is allowed.

This objective does not execute a human study, does not calculate an intervention effect, and does not promote an effectiveness claim.

## Required binding

The receipt must bind:

- study ID and study-design contract version
- canonical digest of the frozen study plan
- frozen intervention subject SHA and runtime-binding digest
- frozen protocol digest and analysis-plan digest
- execution start/completion timestamps
- first primary-outcome access timestamp
- enrollment and randomized/allocation flow
- per-group observed/missing primary outcomes
- attrition reason accounting
- privacy-separated unique-human authority attestation digest
- randomization/allocation audit digest when causal
- primary-outcome dataset digest
- scoring implementation/version digest
- participant-flow evidence digest
- protocol-deviation evidence digest
- amendment ledger and timing
- contamination/assistance incident count
- external governance authority reference without participant identity

## Fail-closed rules

- Execution cannot start before the protocol/analysis plan is frozen.
- The receipt study ID, intervention SHA/runtime binding, protocol digest, and analysis-plan digest must exactly match the frozen study plan.
- Direct PII, participant keys, learner IDs, raw responses, names, emails, phone numbers, or addresses are forbidden in the receipt.
- For randomized causal studies, allocation counts must exactly sum to the assigned denominator and an allocation audit digest is required.
- Per-group observed + missing primary outcomes must equal assigned group count.
- Overall observed + missing must equal the assigned denominator.
- Attrition/missing reasons must account for every missing primary outcome rather than silently dropping records.
- Unique-human authority must be represented only by a privacy-separated attestation/digest; the receipt itself must not contain identities.
- A primary analysis-plan amendment after first primary-outcome access invalidates prospective inferential standing. Such a study may still be preserved descriptively but cannot be labeled prospectively analyzed.
- Protocol deviations and contamination incidents are preserved; they cannot be hidden to manufacture a clean cohort.
- The receipt does not self-certify scientific adequacy, governance, psychometric validity, or external-standard compliance.

## Allowed standing

For FEASIBILITY designs:

`EXECUTION_RECEIPT_READY_FOR_FEASIBILITY_ANALYSIS`

For randomized CAUSAL_EFFECTIVENESS designs with intact prospective analysis:

`EXECUTION_RECEIPT_READY_FOR_PRESPECIFIED_CAUSAL_ANALYSIS`

If a primary analysis-plan amendment occurs after first primary-outcome access:

`EXECUTION_RECEIPT_POST_OUTCOME_ANALYSIS_CHANGE_DESCRIPTIVE_ONLY`

No standing above means that an effect exists.

## Human boundary

All unit/integration tests for this objective use synthetic study-flow fixtures. They are not real participant evidence and must never be relabeled as such.
