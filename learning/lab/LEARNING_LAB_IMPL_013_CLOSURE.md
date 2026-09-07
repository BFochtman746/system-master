# LEARNING-LAB-IMPL-013 — REAL EXTERNAL STANDARD INGESTION + REQUIREMENT DECOMPOSITION / MAPPING + CERTIFICATION-READINESS BLUEPRINT SLICE

**Status:** `PASS_PORTABLE_IMPLEMENTATION`

## 1. What problem this slice solves
IMPL-012 proved multi-scenario evidence against a controlled supplied requirement set. IMPL-013 replaces that artificial standard fixture with a real published professional certification target while preserving the boundary that Learning does not issue the external certification.

The bounded external target is the American Society for Quality (ASQ) Certified Six Sigma Green Belt (CSSGB) Body of Knowledge currently published by ASQ and labeled `2022 CSSGB BoK`.

Executable path:

`live authority check -> frozen structured external-standard extract -> standard validation -> 66 leaf requirements -> exact derived Learning targets -> unmapped competency plan -> certification-readiness blueprint -> standard freshness contract -> future-version update delta`

## 2. Current authoritative source captured
Observed on 2026-09-07:
- certification page: `https://www.asq.org/cert/six-sigma-green-belt`
- Body of Knowledge PDF: `https://www.asq.org/cert/resource/pdf/certification/cssgb-cert-insert.pdf`
- published label: `2022 CSSGB BoK`
- six scored-question section weights: `11 / 20 / 20 / 18 / 16 / 15` = 100
- structured leaf requirements represented in the Lab extract: 66
- cognitive levels preserved from Remember through Create
- current certification context records ASQ's three-year work-experience requirement and no educational waiver.

The portable packet freezes a structured extract and source identity. It does **not** embed or redistribute the ASQ PDF; `source_bytes_archived=false` remains explicit.

## 3. Scope-control decision
This slice deliberately stops at the official leaf requirements. It does not invent a full Six Sigma prerequisite/subskill graph and it does not generate the complete Green Belt course.

Each external leaf requirement gets one exact derived Learning target:

`external requirement -> exact derived Learning target`

but that derivation is not treated as proof of equivalence to an existing System Master competency. Deeper decomposition is `DEFERRED_TO_COURSE_COMPILER_AND_REVIEW`.

## 4. Mapping law
The mapping layer distinguishes:
- exact derivation from the external requirement;
- `UNMAPPED` local competency standing;
- `EXACT_SHARED_REF` or `OWNER_APPROVED_MAPPING_REF` for consequential equivalence;
- `AI_INFERRED_SIMILARITY` as planning-only.

AI/name/embedding similarity cannot create certification-requirement coverage.

## 5. Certification-readiness blueprint
The blueprint preserves the external cognitive level and exam weighting, then adds a System Master internal evidence profile. This internal evidence profile is explicitly **not an ASQ requirement** and may be stronger than the exam alone because System Master also wants workplace competence.

Examples:
- Remember/Understand -> independent knowledge assessment + delayed retention;
- Apply -> independent application + retention + novel transfer;
- Analyze -> scenario analysis + retention + transfer;
- Evaluate -> judgment/rationale + retention + transfer;
- Create -> authentic constructed artifact + independent defense + retention + transfer.

Current content standing remains `GAPS_REMAIN` because no Green Belt curriculum has yet been mapped to these 66 requirements. Learner evidence is `NOT_EVALUATED`. External certification status is `NOT_MADE`.

## 6. Currentness and update-training contract
A course/standard can now bind a versioned freshness contract containing:
- authority and source identity;
- exact standard digest;
- observed current time;
- bounded recheck interval (30 days in this Lab fixture, not a universal policy);
- scheduled/manual/authority-version/source-digest trigger classes;
- new-version action: immutable successor + update-training delta;
- same-version/different-content action: conflict/review;
- scheduler execution delegated to the future shared scheduler integration.

Update behavior:
- same version + same content -> `CURRENT_NO_CHANGE`;
- same version + changed content -> `SAME_VERSION_CONTENT_CONFLICT`;
- new authoritative version -> `NEW_VERSION_UPDATE_AVAILABLE`.

A synthetic future-version fixture changed one requirement and added one requirement. The generated update-training delta targeted only those two requirements and returned `retake_entire_course_required=false`.

This proves the update semantics. It does not claim ASQ has actually published that synthetic future change.

## 7. Qualification
- combined tests: **411/411 PASS**;
- preserved IMPL-001..012 behaviors: **363/363 PASS**;
- new IMPL-013 tests: **48/48 PASS**;
- Python files compile: **59 / PASS**;
- targeted adversarial campaign: **24/24 PASS**;
- external-standard crash/recovery: **100/100 PASS** across five checkpoints;
- unique recovered standard digests: 1;
- unique recovered requirement-set digests: 1;
- unique recovered blueprint digests: 1;
- unique recovered freshness-contract digests: 1;
- deterministic build campaign: **100/100 PASS**;
- update-training delta demo: **PASS**.

## 8. What adversarial testing is protecting against
The tests deliberately attack:
- standard digest tampering;
- bad exam weights;
- duplicate/missing requirement IDs;
- invalid cognitive levels;
- certification self-issuance;
- learner-evidence fabrication;
- AI similarity promoted to consequential equivalence;
- full-course retake as the default update response;
- same-version source drift;
- changed payload under the same operation ID;
- changed standard bytes under the same semantic standard identity;
- missing source-byte truth boundary;
- unknown/duplicate mapping updates;
- recovery at every checkpoint.

## 9. Truth boundary
This slice does **not** prove:
- System Master is an ASQ-approved training provider;
- ASQ certification or exam eligibility;
- full CSSGB curriculum coverage;
- a validated prerequisite/subskill graph for all 66 requirements;
- certification-exam prediction/calibration;
- human SME review of the extracted requirement decomposition;
- autonomous shared-scheduler execution of future checks;
- a real future ASQ change occurred;
- native iPhone behavior;
- production System Master integration.

## 10. Exact next objective
`LEARNING-LAB-IMPL-014 — EXTERNAL-STANDARD-ALIGNED BOUNDED MODULE COMPILER + ASSESSMENT BLUEPRINT / UPDATE-TRAINING DELTA EXECUTION SLICE`

Take a tightly bounded subset of the real ASQ CSSGB requirement set (not the whole Green Belt program), build the first standard-aligned instructional module from those exact requirement refs and cognitive levels, map lessons/practice/assessment/workplace evidence to the external requirements, prove the module meets the professional-course gates, then apply a synthetic successor-standard change and execute only the required update-training/revalidation delta without rebuilding or reteaching unaffected requirements. Preserve all 411 regressions and keep external certification status separate.
