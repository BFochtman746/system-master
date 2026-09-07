# LEARNING-LAB-IMPL-011 — AUTHENTIC WORKPLACE PERFORMANCE + CAPABILITY EVIDENCE DOSSIER / PORTFOLIO HANDOFF SLICE

**Status:** `PASS_PORTABLE_IMPLEMENTATION`

## 1. What problem this slice solves

Course completion, quiz scores, and even mastery projections do not by themselves prove that a learner can use a skill in a realistic work situation. IMPL-011 therefore adds a separate evidence layer:

`prior Learning evidence -> new authentic workplace scenario -> artifact-producing performance -> independent mechanical verification where possible -> written-defense review boundary -> learner-specific capability dossier -> read-only Living Portfolio handoff`

The governing rule is:

> **Learning owns capability evidence and its claim ceiling. Portfolio may present that evidence but may not rewrite competence truth or promote it into job readiness, certification, licensure, or role qualification.**

## 2. Bounded workplace scenario

The first executable scenario is `WP-PY-OPS-TRIAGE-V1`.

Role context: junior operations analyst supporting a fulfillment team.

The learner receives a raw order dataset and must independently produce:

1. a priority worklist of late orders at or above the declared amount threshold using a Python list comprehension;
2. a late-order amount mapping using a Python dictionary comprehension;
3. a written defense explaining the representation choice and identifying a realistic duplicate-key/data-quality risk.

The scenario is intentionally bounded. It is authentic enough to require the learner to turn raw business data into a usable work artifact, but it is not treated as proof of an entire occupation.

## 3. Independent artifact verification

The workplace artifact is not scored by comparing the learner response to a stored answer string.

The verifier:

- parses the submitted expressions with a restricted Python AST;
- requires an actual list comprehension for the worklist;
- requires an actual dictionary comprehension for the mapping;
- rejects arbitrary calls, unknown names, imports and unsafe nodes;
- executes the expressions only against the scenario's immutable data;
- independently derives the expected business outputs from the scenario rules;
- compares executed outputs with independently derived outputs;
- checks that any learner-declared outputs match the actual executed artifact.

This prevents hard-coded answer literals from masquerading as demonstrated comprehension skill and prevents the evaluation path from becoming an arbitrary-code execution surface.

## 4. Criterion-level workplace rubric

Rubric version: `WORKPLACE-CRITERION-RUBRIC-V1`.

The demonstration result is:

- `WP-PY-01` — list-comprehension implementation: `VERIFIED`;
- `WP-PY-02` — dictionary-comprehension implementation: `VERIFIED`;
- `WP-PY-03` — business-rule output correctness: `VERIFIED`;
- `WP-PY-04` — professional explanation / data-quality judgment: `HUMAN_REVIEW_REQUIRED`.

This distinction is intentional. Deterministic mechanics can prove the code and outputs. They cannot yet prove that a written professional defense shows sound judgment merely because it contains text.

Therefore the bounded demonstration standing is:

`MECHANICALLY_VERIFIED_DEFENSE_REVIEW_REQUIRED`

not a fully human-reviewed workplace-performance claim.

## 5. Independence and contamination rules

The workplace evidence is inadmissible as independent capability evidence if:

- the learner received assistance;
- an answer was revealed before commit;
- the learner had already seen the exact scenario before the purported independent attempt.

The service also binds the submission to the exact learner, course and scenario-skill set. A submission cannot be rebound to another learner/course after the fact.

## 6. Capability evidence dossier

New version: `LEARNING-CAPABILITY-EVIDENCE-DOSSIER-V1`.

The dossier combines, without merging their meanings:

- exact learner/course identity;
- exact workplace scenario and evaluation digests;
- resolvable workplace submission/evaluation refs;
- artifact ref + artifact digest;
- criterion-level workplace verification results;
- independent/assistance/exposure conditions;
- prior Learning mastery projections;
- canonical counted assessment-attempt refs;
- retention/transfer gate states carried by those projections;
- defense-review standing;
- explicit limitations;
- maximum evidence-backed claim ceiling.

For the synthetic demonstration learner, both bounded Python skills already have `MASTERED` projections. The new workplace artifact is independently and mechanically verified, but the defense review uses a synthetic workflow fixture rather than a real human reviewer.

The resulting claim ceiling is therefore:

`AUTHENTIC_WORKPLACE_ARTIFACT_MECHANICALLY_DEMONSTRATED_DEFENSE_REVIEW_PENDING`

A state-machine fixture with an actual `REAL_HUMAN_REVIEW` evidence class can demonstrate that the workflow would allow:

`AUTHENTIC_WORKPLACE_TASK_DEMONSTRATED_WITHIN_DECLARED_SCENARIO`

but **no real human workplace-defense review was executed in this Lab slice**.

## 7. Living Portfolio handoff

New handoff version: `LEARNING-TO-PORTFOLIO-EVIDENCE-HANDOFF-V2`.

The handoff is explicitly read-only and carries:

- capability-dossier digest;
- claim ceiling;
- exact workplace evidence refs;
- artifact ref + artifact digest;
- allowed presentation operations;
- forbidden external claims;
- `portfolio_may_rewrite_competence_truth = false`.

Portfolio may present, summarize and link the evidence at or below the Learning claim ceiling. It cannot promote the evidence into:

- `JOB_READY`;
- `QUALIFIED_FOR_ROLE`;
- `CERTIFIED`;
- `LICENSED`;
- `ACCREDITED`;
- `COLLEGE_CREDIT_AWARDED`;
- `SUBJECT_MATTER_EXPERT`.

Those meanings require the appropriate external authority/evidence standard.

## 8. Defects found and repaired during implementation

### A. Literal-answer substitution

The initial AST allowlist rejected literal list/dictionary submissions before reaching the intended form-specific guard. The verifier was adjusted so safe literals can be parsed and then explicitly rejected because they are not the required comprehension form. The quality standard was not weakened.

### B. Recovery scenario drift

The first service version did not compare the checkpointed job payload with the caller's scenario on resume. A crash followed by a changed scenario could therefore have mixed old and new evidence lineage.

Repair:

- exact job payload is digest-pinned;
- exact scenario digest is persisted;
- resume checks both payload and persisted scenario;
- changed scenario after checkpoint fails closed.

### C. Learner/course rebinding

The first service version did not explicitly verify that the submission's learner/course IDs matched the service subject. Explicit identity guards were added before evidence admission.

### D. Employer evidence discoverability

The first dossier draft carried an artifact digest but no explicit resolvable evidence/artifact refs. The final dossier/handoff carries immutable workplace submission/evaluation refs plus an artifact sub-reference so a later Portfolio/employer viewer can inspect the evidence without becoming a second evidence authority.

## 9. Qualification — what the tests mean

### Regression

- predecessor IMPL-001..010: **285/285 PASS**;
- combined IMPL-001..011: **323/323 PASS**;
- new IMPL-011 tests: **38/38 PASS**.

This proves the new workplace/portfolio layer did not break prior research, course generation, Tutor, mastery, retention, transfer, open-goal, multi-candidate, refresh or professional-rigor behavior.

### Adversarial campaign

**25/25 PASS**.

The campaign deliberately attacks:

- wrong business rules;
- hard-coded list/dictionary answers;
- unsafe Python calls;
- unknown-name access;
- declared-output tampering;
- assisted performance;
- answer exposure;
- reused scenario contamination;
- structurally incomplete defense;
- mechanical promotion of defense quality;
- synthetic review masquerading as human review;
- duplicate reviewers;
- workplace success without prior mastery;
- failed/assisted workplace work producing success claims;
- Portfolio promotion to `JOB_READY`;
- capability-dossier tampering;
- workplace execution mutating prior Learning attempts/projections;
- changed payload under same operation;
- same submission identity with changed content;
- scenario drift after crash;
- scenario/course skill mismatch;
- learner identity rebinding;
- course identity rebinding.

A PASS means the defect was caught or bounded.

### Crash/recovery

**100/100 PASS** across five checkpoints:

- `SCENARIO_BOUND`: 20/20;
- `SUBMISSION_RECORDED`: 20/20;
- `ARTIFACT_VERIFIED`: 20/20;
- `DOSSIER_BUILT`: 20/20;
- `HANDOFF_BUILT`: 20/20.

Every recovered run converged on:

- one workplace-evaluation digest;
- one capability-dossier digest;
- one Portfolio-handoff digest;
- one claim ceiling.

### Determinism

**100/100 PASS**:

- unique evaluation digests: 1;
- unique dossier digests: 1;
- unique handoff digests: 1.

### Compile

**51 Python files compile PASS**.

## 10. Truth boundary

This slice does **not** prove:

- job readiness for an occupation;
- qualification for a specific employer role;
- real employer acceptance of the dossier;
- real human review of the workplace defense;
- full Python competence;
- external certification/licensure/accreditation/college credit;
- SME standing;
- broad workplace validity across many task families;
- predictive validity for job performance;
- production Living Portfolio integration;
- target iPhone/native behavior.

The demonstration uses a synthetic learner fixture and one bounded operations scenario.

## 11. Exact next objective

`LEARNING-LAB-IMPL-012 — MULTI-SCENARIO ROLE-COMPETENCY PERFORMANCE + REQUIREMENT-COVERAGE / GAP EVIDENCE SLICE`

Move from one bounded workplace proof to a versioned set of externally supplied role/certification competency requirements and multiple independent workplace scenarios. Map only exact/approved requirement refs to Learning criteria, require enough diverse authentic performance evidence per requirement, preserve unsupported/partial/stale states, compute requirement coverage and evidence gaps without declaring job readiness, and produce a multi-scenario capability package for Living Portfolio / external reviewer consumption. Prove one strong scenario cannot be generalized into an entire role, weak/missing requirements remain visible, repeated near-copy scenarios do not count as diverse workplace evidence, and Portfolio cannot inflate requirement coverage into employment qualification.
