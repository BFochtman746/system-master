# LEARNING-LAB-IMPL-010 — PROFESSIONAL COURSE RIGOR + ASSESSMENT VALIDITY + EXTERNAL REVIEW-READINESS SLICE

**Status:** `PASS_PORTABLE_IMPLEMENTATION`

## 1. What problem this slice solves

AI can produce many plausible courses from the same goal. That variability is acceptable only if the qualification standard is stable. IMPL-010 therefore separates **course generation** from a versioned **professional review-readiness standard** and from actual external recognition.

Governing rule:

> **Generation may vary; qualification standards must not.**

The slice also formalizes the Learning -> Living Portfolio handoff: Learning owns the competence-evidence semantics; Portfolio owns presentation. A certificate or course-completion record is not the capability proof.

## 2. Employer-facing capability proof boundary

The intended future employer-facing object is a verifiable capability dossier containing exact competency/criterion scope, canonical evidence references, assessment conditions, independence/assistance, freshness, retention, transfer, provenance, uncertainty and limitations.

`LEARNING-CAPABILITY-EVIDENCE-HANDOFF-V1` now freezes the handoff shape:

- `DEMONSTRATED` -> demonstrated-skill claim within exact scope;
- `RETAINED` -> retained-skill claim while current;
- `TRANSFER_DEMONSTRATED` -> transfer claim for the declared context;
- `MASTERED` -> mastery claim within the exact Learning policy/scope;
- `JOB_READY`, `QUALIFIED_FOR_ROLE`, `ACCREDITED`, `COLLEGE_CREDIT_AWARDED`, `EXTERNALLY_CERTIFIED` remain forbidden without the proper external authority.

Course completion alone is explicitly not competence.

## 3. Professional review-readiness profile

New profile: `PROFESSIONAL-COURSE-REVIEW-READINESS-V2`.

The profile is informed by current external quality/review frameworks, used only as reference classes and not as claimed certification:

- Quality Matters Higher Education Rubric, Seventh Edition v2.0;
- Quality Matters Continuing and Professional Education Rubric, Third Edition;
- ACE Learning Evaluations;
- ANAB Certificate Accreditation / ANSI-ASTM E2659-24;
- AERA/APA/NCME Standards for Educational and Psychological Testing (2014 current edition while revision work is underway).

## 4. Executable gates added

### Outcome level and scope

- every criterion requires an explicit outcome-level declaration;
- the bounded professional floor requires application/explanation or higher, not recall-only;
- subject completeness must be scoped and must preserve an external-SME confirmation boundary;
- the current Python-comprehensions course is recognized only as a bounded professional module, not complete Python expertise.

### Prerequisite depth

Entry prerequisites must be explicitly documented and typed as entry requirements instead of being silently assumed.

### Assessment blueprint

Every criterion must have the modes required by its declared assessment blueprint. Required transfer cannot disappear merely because mastery/retention items exist.

### Criterion-referenced passing standard

The passing rule requires every mandatory independent mastery gate plus current retention and required transfer. Failed mandatory criteria cannot be averaged away by a high aggregate percentage. Uncalibrated pass-probability claims are forbidden.

### Assessment validity/reliability evidence states

Mechanical correctness is kept distinct from full assessment validity. The current bounded state records:

- content alignment: structurally mapped / external SME review required;
- mechanical scoring correctness: supported where an independent oracle passes;
- response-process evidence: not established;
- population reliability/internal structure: not established without real learners;
- relationships to other measures: not established;
- fairness/consequence evidence: not established without appropriate external/empirical review;
- automated scoring: bounded mechanical oracle only.

The system therefore cannot infer assessment reliability from deterministic code tests.

### Workload/depth

A workload estimate is required, but the Lab may not translate its own estimate into academic credit hours. Credit-hour equivalence remains externally unestablished.

### Learner support and accessibility

The profile requires tutor/support availability, support fading before independent mastery, answer-reveal protection, technical support documentation, text-equivalent content and a non-pointer/keyboard path requirement. Actual assistive-technology conformance remains target-native review pending.

### Capstone/transfer

The bounded professional module requires an independent novel transfer/capstone-style task.

## 5. Independent review state machine

Review is no longer a generic boolean.

States include:

- `PENDING_INDEPENDENT_REVIEW`;
- `SYNTHETIC_REVIEW_LOGIC_APPROVED_NOT_HUMAN_EVIDENCE`;
- `INDEPENDENT_REVIEW_APPROVED`;
- `REVISIONS_REQUIRED`;
- `DISAGREEMENT_REQUIRES_ADJUDICATION`;
- `ABSTAINED_REQUIRES_ADJUDICATION`.

Rules:

- at least two distinct reviewer identities are required for approval logic;
- reviewer roles must include subject-matter expertise plus faculty/assessment coverage;
- the same reviewer cannot be counted twice;
- non-independent reviewers do not satisfy the gate;
- synthetic fixtures can prove the workflow but cannot satisfy the human-review evidence requirement;
- disagreement and abstention remain explicit rather than being averaged away.

No independent human review was executed in this Lab slice.

## 6. Important qualification result

The current Python-comprehensions course is:

- `READY_TO_SUBMIT_FOR_INDEPENDENT_REVIEW` as a **bounded professional module review package**;
- `NOT_SUPPORTED_BY_BOUNDED_MODULE_SCOPE` for a standalone certificate or college-credit claim;
- `NOT_CLAIMED` for external recognition.

This is intentional. A short, high-quality module must not be inflated into a certificate/credit-equivalent program.

## 7. Testing — what the numbers mean

### Regression

- predecessor IMPL-001..009: **247/247 PASS**;
- combined IMPL-001..010: **285/285 PASS**;
- new IMPL-010 tests: **38/38 PASS**.

This proves the new quality/review layer did not break prior research, generation, Tutor, mastery, retention, transfer, multi-candidate selection, refresh or versioning behavior.

### Adversarial quality/review campaign

**22/22 PASS**. Bad cases include missing mastery/transfer coverage, compensatory averaging, fake 94%-style probability, recall-only outcomes, missing prerequisites, missing capstone, undocumented workload, self-declared credit-hour equivalency, missing SME boundary, permanent scaffolding, assessment answer leakage, accessibility gaps, failed mechanical oracle, insufficient/duplicate/non-independent reviewers, reviewer disagreement/abstention, external-recognition inflation and job-ready/certified claim inflation.

A PASS means the defect was caught or bounded.

### Determinism

**100/100 PASS**:

- unique review-dossier digests: 1;
- unique review-adjudication digests: 1;
- unique capability-handoff digests: 1.

### Compile

**47 Python files compile PASS**.

## 8. External review truth boundary

This slice does not prove:

- external accreditation;
- college credit;
- an externally recognized professional certificate;
- job readiness or qualification for a specific role;
- independent SME/faculty review completion;
- population-level assessment reliability;
- psychometric validity for consequential use;
- real learner workplace performance;
- target-native accessibility conformance;
- production System Master integration.

## 9. Exact next objective

`LEARNING-LAB-IMPL-011 — AUTHENTIC WORKPLACE PERFORMANCE + CAPABILITY EVIDENCE DOSSIER / PORTFOLIO HANDOFF SLICE`

Move from proving that the **course** is professionally structured to proving what a **specific learner can actually do**. Build a bounded authentic workplace scenario/capstone, require independent artifact-producing performance and oral/written defense where appropriate, preserve exact evidence/provenance/assistance conditions, score against a criterion-level workplace rubric with independent verification where possible, and generate an immutable Learning capability-evidence dossier whose claims are capped by the evidence. Produce a read-only handoff to `MOD-PORTFOLIO-001` for employer-facing presentation without letting Portfolio become a second competence authority or letting Learning claim `JOB_READY`/`QUALIFIED_FOR_ROLE` without an external owner.
