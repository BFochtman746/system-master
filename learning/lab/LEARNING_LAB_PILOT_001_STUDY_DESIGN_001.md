# LEARNING-LAB-PILOT-001-STUDY-DESIGN-001

Status: BUILDING

## Objective

Define a prospective, fail-closed study-design contract that prevents System Master from upgrading descriptive PILOT-001 human records into stronger effectiveness claims without the design authority needed to support those claims.

This contract governs study design readiness only. A design that passes this contract does **not** prove an effect. Results require a separate executed-study adjudication boundary.

## External methodological basis

This contract is informed by, but does not claim automatic compliance with, the following external standards and guidance:

1. What Works Clearinghouse Procedures and Standards Handbook, Version 5.0 (U.S. Department of Education, Institute of Education Sciences; August 2022, revised December 2022), together with the current Study Review Protocol. Relevant design concerns include random assignment/integrity, attrition, baseline equivalence, confounding, outcome reliability, validity, and intervention overalignment.
2. SPIRIT 2025, which emphasizes a prospectively specified and transparent randomized-trial protocol covering population, interventions/comparators, outcomes, analysis, governance, open-science practices, and amendments.
3. CONSORT 2025, which emphasizes transparent reporting of allocation, participant flow, analysis, and results for randomized trials.
4. CONSORT extension for randomized pilot and feasibility trials (2016), which distinguishes feasibility objectives from definitive effectiveness testing and recommends that pilot sample size be justified by feasibility objectives rather than used as an underpowered effectiveness test.
5. Standards for Educational and Psychological Testing (AERA/APA/NCME, 2014; still the published edition while revision is underway), under which validity pertains to evidence supporting a score interpretation for a specified use rather than an unqualified property of a test.

These sources are methodological references, not imported certification authority. System Master must not say a study “meets WWC,” “is CONSORT compliant,” “is psychometrically valid,” or similar unless a separate qualified review establishes that claim.

## Claim classes

### FEASIBILITY

Purpose: determine whether a future definitive study can be conducted, should be conducted, and how it should be conducted.

Allowed design standing:

`DESIGN_READY_FOR_FEASIBILITY_STUDY`

Prohibited inference from a feasibility result alone:

- learning effectiveness proven
- causal effect proven
- population generalization proven
- psychometric validity proven

A feasibility study may collect outcome measurements and descriptive estimates for planning, but it must not silently become an underpowered definitive effectiveness test.

### CAUSAL_EFFECTIVENESS

Purpose: prospectively evaluate whether a frozen System Master Learning intervention causes a prespecified difference in a prespecified educational outcome relative to a prespecified comparator.

V1 deliberately requires randomized assignment. Strong quasi-experimental designs may be supported by a future contract, but they are not silently treated as equivalent to randomization here.

Allowed design standing:

`DESIGN_READY_FOR_RANDOMIZED_EFFECTIVENESS_STUDY`

This standing means only that the prospective design contains the required safeguards. It does not imply that the future study will pass, that an effect exists, or that the effect generalizes.

### POPULATION_GENERALIZATION

Not granted by this design validator. Generalization requires executed evidence about the actual recruited population, sites, attrition, heterogeneity, measurement behavior, and external validity. It belongs to a later result/synthesis boundary.

## Mandatory prospective fields

Every study plan must freeze:

- immutable study ID and contract version
- frozen intervention/runtime version
- frozen protocol version
- claim target
- population and recruitment frame
- inclusion/exclusion criteria
- assignment unit and analysis unit
- sample-size rationale tied to the study objective
- prespecified primary outcome and timepoint
- outcome construct, measure/scoring versions, validity-use evidence, reliability/scoring evidence, and overalignment review
- attrition denominator and missing-data strategy
- baseline covariates and adjustment strategy
- participant uniqueness authority separated from minimized analysis evidence
- contamination/assistance controls
- analysis estimand, effect measure, uncertainty reporting, multiplicity/subgroup policy, and cluster handling when applicable
- stopping/peeking rule
- protocol and analysis-plan digests/timestamps
- governance/ethics authority status without self-invented approval
- privacy/data-retention boundary
- participant-flow and deviation reporting plan

## Sample-size rule

There is no universal hard-coded participant count that upgrades evidence.

- FEASIBILITY requires an explicit rationale tied to feasibility objectives and progression criteria.
- CAUSAL_EFFECTIVENESS requires a prospectively documented power or precision basis tied to the primary estimand/outcome and its assumptions.
- The validator verifies the presence and timing of the rationale; it does not pretend to independently prove that a statistical calculation is scientifically adequate.

## Outcome rule

A primary outcome must have an explicit intended interpretation/use and evidence relevant to that use. For causal effectiveness, the outcome also requires reliability/scoring evidence and an overalignment review so the intervention is not advantaged merely because the assessment reproduces intervention-specific content.

## Attrition and exclusions

The denominator begins from all assigned/enrolled units required by the design. Withdrawals, missing outcomes, protocol deviations, contamination, and exclusions must remain visible. A result pipeline may not define its denominator after observing outcomes.

## Human-governance boundary

Repository code cannot create institutional approval, exemption, informed consent, legal authority, or ethics authority. The plan must record the external governance status as supplied by the actual responsible authority. `PENDING` or `UNKNOWN` cannot be promoted to `APPROVED` by software.

## Analysis freeze

For a causal-effectiveness study, the protocol and primary analysis plan must be frozen before outcome access that could influence the analysis. Any amendment must be versioned, timestamped, and reported; post-outcome amendments cannot be relabeled as prospectively specified.

## Privacy and identity separation

The unique-human registry/authority, if required, must remain separate from minimized outcome-analysis packets. The analysis layer receives pseudonymous subject keys and evidence digests, not direct PII. A privacy-minimized record count is not automatically a verified unique-human count.

## Result boundary

Passing this design contract never sets any of the following to true:

- `learning_effectiveness_proven`
- `causal_effect_proven`
- `population_generalization_proven`
- `psychometric_validity_proven`

Those belong to a later executed-study adjudication objective.
