# LEARNING-LAB-IMPL-003 — TUTOR/DIRECTOR INTERACTIVE EXECUTION SLICE

**Status:** `PASS_PORTABLE_IMPLEMENTATION`  
**Standing boundary:** deterministic portable tutor/director behavior proven for the bounded real Git course; pedagogical/empirical/native/production claims remain unproven.

## Objective closed

Implemented the first executable interactive tutor/director loop on top of the real research-grounded course from `LEARNING-LAB-IMPL-002`:

`OBSERVE LEARNER RESPONSE -> ASSESS -> DIAGNOSE OR ABSTAIN -> CHOOSE TEACHING MOVE -> HINT/SCAFFOLD/REMEDIATION -> FADE SUPPORT -> FRESH RECHECK -> UPDATE TUTOR STATE -> NEXT ACTION`

The tutor is not a second mastery authority. Formative tutor turns remain separate from the Learning evidence engine; only independent Learning assessment attempts can change mastery projections.

## Implemented components

- `TutorDirector`
- `TutorContextCompiler`
- epistemic standing vocabulary:
  - `LEARNER_DECLARED`
  - `DIRECT_OBSERVATION`
  - `EVIDENCE_SUPPORTED`
  - `SYSTEM_INFERENCE`
  - `TEACHING_HYPOTHESIS`
- diagnosis states: `NO_DEFECT_OBSERVED | DIAGNOSED | ABSTAINED`
- bounded Git tutor probe families for staging/commit and branch/merge concepts
- persisted/checkpointed tutor turns
- idempotent replay and payload-conflict detection
- research-claim grounding on factual teaching moves
- hard prerequisite tutor eligibility guard
- mastery/retention assessment-integrity boundary
- bounded support levels and forced support fading
- operation-minimal context compilation with assessment answer/rationale stripping

## Defects found and repaired during implementation

1. **Research-schema mismatch** — tutor context initially expected `statement/source_ids` while the frozen dossier uses `text/source_id`. Repaired the adapter rather than mutating research evidence.
2. **False causal diagnosis risk** — the initial staging classifier could label `STAGING_OMITTED` merely because `git commit` appeared, even if `git add` was also present. Repaired to require actual absence of staging evidence.
3. **Un-grounded tutor move risk** — factual remediation initially lacked explicit research claim bindings. Factual tutor moves now fail closed on unadmitted claim refs.
4. **Prerequisite bypass** — direct tutor invocation could initially reach the branch/merge skill before staging/commit mastery. Added a hard prerequisite guard; Tutor cannot become a second progression authority.

## Final portable qualification

- Unit/behavior/negative/regression tests: **58/58 PASS**
- Python compile: **19 files / PASS**
- Deterministic tutor session across two fresh stores: **PASS**
- Adversarial/mutation campaign: **10/10 PASS**
- Crash/recovery stress: **100/100 PASS**
  - `OBSERVATION_RECORDED`: 25/25
  - `DIAGNOSIS_RECORDED`: 25/25
  - `MOVE_SELECTED`: 25/25
  - `TURN_COMPLETED_BEFORE_RETURN`: 25/25
- Idempotent tutor replay: **100/100**
- Unique recovered result digests: **1**
- All `IMPL-001` + `IMPL-002` regressions preserved: **PASS**

Exact machine-readable evidence:
- `evidence/qualification_receipt_impl003.json`
- `evidence/tutor_demo.json`
- `evidence/tutor_mutation_campaign.json`
- `evidence/tutor_stress_campaign.json`
- `evidence/test_output_impl003.txt`

## Proven behavioral boundaries

- An ambiguous incorrect response can produce `ABSTAINED` with no invented cause.
- A single recognizable pattern can be used only as a `TEACHING_HYPOTHESIS`.
- Repetition of the same probe family does not count as independent corroboration.
- A repeated structural error across distinct probe families can reach `EVIDENCE_SUPPORTED` within this bounded deterministic policy.
- Clean correct controls do not receive invented problems.
- Requested overhelping is capped.
- Supported success forces support fading before independent evidence.
- Repeated supported success can identify `INDEPENDENCE_NOT_YET_DEMONSTRATED` without personality/intelligence/medical inference.
- Mastery and retention checks refuse hint/answer assistance before commitment.
- Tutor context contains no assessment answer/rationale keys.
- Tutor turns create no mastery attempt or projection.
- Factual remediation cites admitted research claims.
- Hard prerequisites cannot be bypassed through Tutor.
- Crash/restart/replay cannot duplicate a tutor turn.

## Truth boundary / not proven

This slice does **not** prove:
- arbitrary-domain tutor diagnosis;
- a live nondeterministic LLM tutor/provider;
- general causal diagnosis validity;
- independent human pedagogical quality review;
- real learner learning gain;
- far-transfer effectiveness;
- scientifically calibrated retention timing;
- target-native iPhone interaction/accessibility/background behavior;
- production System Master shared-authority integration.

The SQLite state remains a **Lab adapter**, not a competing System Master canonical evidence/job/progression authority.

## Exact next objective

`LEARNING-LAB-IMPL-004 — MULTI-SESSION ADAPTIVE RETENTION + TRANSFER DIRECTOR SLICE`

Extend the proven real-course learner/tutor runtime across multiple sessions so the Learning Director can schedule/execute retention and novel transfer work, detect stale or insufficient evidence, preserve prerequisite/mastery authority, select maintenance/remediation/transfer actions from current evidence, and prove that completion or tutor-assisted success cannot substitute for retained/transfer competence. Add a genuinely novel Git transfer task family, durable multi-session state, interruption/replay tests, false-transfer attacks, and autonomous portable qualification before any native/device testing.
