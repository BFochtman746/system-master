# LEARNING-LAB-IMPL-007 — LIVE/REPLAYABLE RESEARCH + MODEL-BACKED OPEN-GOAL GENERATION + PLUGGABLE ORACLE SLICE

**Status:** `PASS_PORTABLE_IMPLEMENTATION`

## 1. What we built

This slice turns the bounded open-goal compiler from IMPL-006 into a research/model/verification pipeline whose major external inputs are explicitly separated and replayable.

The executable path is:

`NEW GOAL -> LIVE/REPLAY RESEARCH -> PINNED RESEARCH DOSSIER -> MODEL INVOCATION PIN -> MODEL-GENERATED CANDIDATE -> PLUGGABLE INDEPENDENT ORACLE -> MECHANICAL VALIDATION -> HUMAN-REVIEW BOUNDARY -> TUTOR -> MASTERY -> RETENTION -> TRANSFER`

The fourth previously unregistered goal is:

> Use Python list and dictionary comprehensions to transform and filter data.

The runtime begins without `python-comprehensions` registered. The domain is created only after the research and model pipeline runs.

## 2. Why this slice exists

IMPL-006 proved that Learning could construct a new domain from a runtime research bundle, but three important pieces were still artificial:

1. research was supplied as a curated bundle rather than a live/replayable research capture;
2. generation was deterministic compiler data rather than a model-generated candidate with explicit model provenance;
3. the open-goal compiler still had a SQLite-specific verifier branch.

IMPL-007 attacks those boundaries. The goal is not merely to generate a fourth course. The goal is to prove that research, generation and verification are replaceable ports with separate authority.

## 3. What changed architecturally

### 3.1 ResearchPort: current external evidence becomes a frozen replayable input

The current Python documentation was researched externally and normalized into:

`sources/LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V1.json`

The capture records:

- capture identity and timestamp;
- source URL/title/authority/version;
- admitted claim IDs;
- retrieval mode;
- normalized evidence digest.

The packet intentionally stores normalized claims rather than full copyrighted source bodies.

Important environment boundary: the hosted portable container could not directly resolve public internet hosts. Therefore the public Python research was retrieved through the session's web capability and frozen into the capture. The executable HTTP capture/replay mechanism itself is qualified portably against a local HTTP server. This packet does **not** claim that the container directly fetched docs.python.org.

### 3.2 ModelPort: generation is an input, not an authority

`sources/MODEL_GENERATION_PYTHON_COMPREHENSIONS_V1.json` is a recorded current-chat model generation trace.

It preserves:

- model ID: `GPT-5.6 Sol`;
- model role: `CANDIDATE_GENERATOR_ONLY`;
- exact generation prompt digest;
- research evidence digest supplied to the generator;
- exact candidate-output digest;
- complete trace digest.

The generator is prohibited from writing its own validation status. Pedagogical judgments in the output remain `MODEL_PROPOSAL_HUMAN_REVIEW_REQUIRED`.

### 3.3 Model-invocation pin

A new durable checkpoint pins the exact model invocation **before** generation is accepted:

`model identity + prompt digest + output/trace identity`

Why this matters: if the process crashes after research but before generation, retry must not silently choose a different model output and call that a continuation of the same job.

If the model trace changes after `MODEL_PINNED`, recovery fails closed with `MODEL_TRACE_PIN_DRIFT`.

### 3.4 OracleProviderRegistry

The open-goal engine no longer chooses a verifier with a direct SQLite-specific branch.

`OracleProviderRegistry` maps a declared oracle type to an independently supplied verifier factory.

Current registered examples include:

- `SQLITE_SELECT_QUERY`
- `PYTHON_COMPREHENSION_EXPRESSION`

The model may request an oracle type, but it cannot inject executable oracle code or declare itself verified. An unregistered oracle type is blocked.

### 3.5 PythonComprehensionOracle

The Python oracle independently executes a deliberately restricted Python expression subset for the bounded comprehensions domain.

It checks generated answer keys and learner answers by behavior rather than exact string equality, while rejecting unsafe constructs and unapproved attribute access.

This allows a behaviorally equivalent answer such as a different but equivalent `range(...)` expression to pass while code-execution escape attempts fail.

## 4. What the testing is doing — and why

Testing in this project is not just "does the code run?". Each test family tries to disprove a specific safety or learning claim.

| Test family | What we deliberately challenge | What a failure would mean |
|---|---|---|
| Regression | Run all earlier Learning behavior after adding IMPL-007 | The new architecture broke something that previously worked |
| Research integrity | Modify captured claims/digests or swap evidence during recovery | A course could silently be built from different evidence than its provenance claims |
| Model integrity | Modify prompt/output/trace after it is pinned | Crash/retry could silently change what the model generated |
| Generator independence | Let the model assert `PASS`/self-approval | The same component creating content could approve its own work |
| Oracle independence | Seed a wrong answer key or false worked example | The validator could merely echo the generator instead of independently checking it |
| Oracle safety | Supply import/system/attribute-escape expressions | The verifier could become an arbitrary code-execution path |
| Tutor integrity | Ask for help during mastery or inspect compiled Tutor context | Tutoring could leak answers and invalidate independent evidence |
| Transfer integrity | Submit assisted transfer | Assistance could masquerade as transferable competence |
| Idempotency | Replay operations or change payload under same operation ID | Retries could duplicate or mutate durable effects |
| Crash/recovery | Inject crashes at every research/model/oracle/course boundary | Recovery could restart the task rather than continue the same exact lineage |
| Replay transport | Change captured HTTP bytes | "Replay" could return content different from what was originally captured |
| Human-review boundary | Ask whether model-proposed pedagogy is mechanically proven | Mechanical correctness could be overstated as pedagogical validation |

## 5. Fail-first evidence — defects/testing discoveries

### 5.1 Generated lesson failed an existing instructional gate

The first IMPL-007 course candidate failed with:

`INSTRUCTIONAL_VALIDATION_FAILED:INSUFFICIENT_WORKED_EXAMPLES:L-PY-DICTCOMP`

The dictionary-comprehension lesson contained only one worked example while the already-existing validator requires at least two.

The repair was to improve the generated candidate by adding a second grounded, executable worked example. The validator was **not weakened**.

That is important evidence that prior standards constrained the new model output rather than being rewritten to make it pass.

### 5.2 Recovery design exposed model drift risk

Architecture review identified a second defect before sealing: a pinned research dossier alone did not guarantee that a retry would use the same model result.

The `MODEL_PINNED` checkpoint was added so exact model trace identity is fixed before generation is committed.

A same-job retry with a changed model trace is now rejected.

### 5.3 Qualification harness exceeded one execution window

The initial monolithic qualification command combined the full regression suite, predecessor rerun, adversarial cases and 200 stress trials and exceeded the host execution timeout.

That was classified correctly as a **qualification-harness scheduling problem**, not a product failure. The campaign was split into bounded receipts without reducing proof depth. The final one-command qualifier was then simplified to avoid redundantly rerunning the predecessor suite separately; the complete 178-test suite already contains all 143 predecessor tests.

## 6. Final qualification

### Functional/regression

- combined IMPL-001..007 suite: **178/178 PASS**
- predecessor behaviors included in current suite: **143/143**
- new IMPL-007 tests: **35/35 PASS**
- previous sealed IMPL-006 receipt: **PASS / 143 tests**
- Python files compile: **33 / PASS**

### Adversarial campaign

- targeted research/model/oracle/Tutor/recovery cases: **21/21 PASS**

The campaign includes:

- unsupported goal abstention;
- research digest tampering;
- prompt tampering;
- model-output tampering;
- generator self-verification attempt;
- wrong generated answer key;
- false generated worked example;
- invented claim reference;
- model pedagogical self-approval;
- arbitrary-code escape attempt;
- unapproved attribute access;
- assisted-transfer exclusion;
- Tutor answer/oracle-gold stripping;
- mastery-help blocking;
- idempotency payload conflict;
- research drift after checkpoint;
- model drift after model pin;
- HTTP replay-byte drift;
- post-generation recovery without live inputs;
- dynamic-domain restart/rehydration;
- behaviorally equivalent answer acceptance.

### Crash/recovery

Open-goal build campaign: **100/100 PASS** across seven injected crash boundaries:

- `GOAL_INTERPRETED`
- `RESEARCH_PLANNED`
- `SOURCES_ACQUIRED`
- `MODEL_PINNED`
- `MODEL_GENERATED`
- `ORACLE_BOUND`
- `LIVE_OPEN_GOAL_COURSE_GENERATED`

Across all 100 recovered builds:

- unique course digests: **1**
- unique research-evidence digests: **1**
- unique model-output digests: **1**

Tutor recovery campaign: **100/100 PASS** across:

- `OBSERVED`
- `DIAGNOSED`
- `MOVE_SELECTED`

Unique recovered Tutor-result digests: **1**.

### Live/replay and model/replay mechanisms

- local HTTP capture + exact replay: **PASS**
- replay-byte tamper detection: **PASS**
- callable model-output capture + exact replay: **PASS**
- deterministic reconstruction from three fresh stores: **PASS**

### Fourth-domain learning lifecycle

The Python-comprehensions course executes through:

`course -> Tutor hypothesis -> distinct-family corroboration -> list mastery/retention -> dict mastery/retention -> novel transfer -> COURSE_COMPLETE`

Final generated-course standing remains:

`MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED`

## 7. What this proves

Within this bounded slice, Learning can now:

1. consume current externally researched evidence through a replayable ResearchPort;
2. pin the exact research evidence used for generation;
3. consume a recorded model-generated course candidate with exact prompt/output/model provenance;
4. pin the exact model invocation across crashes;
5. reject generator self-approval;
6. select an independent verifier through a pluggable oracle registry;
7. independently reject wrong generated keys and worked examples;
8. reject unsafe verifier inputs;
9. dynamically register a previously absent fourth domain;
10. use the existing Tutor/mastery/retention/transfer core unchanged;
11. recover deterministically without silently changing research or model lineage.

## 8. Truth boundary

This slice does **not** prove:

- that the portable container itself has public-network access;
- a production live model-provider gateway/API is qualified;
- stochastic model quality across repeated independent generations;
- arbitrary topics will always have a mechanically executable oracle;
- model-proposed pedagogy is human-verified;
- real learner learning gain, retention or far transfer;
- target iPhone behavior;
- production System Master shared-authority integration.

The current live research was genuinely retrieved during this session, then normalized and frozen for portable replay. The current model candidate is genuinely a recorded current-chat model output, then frozen for replay. Those are stronger than synthetic fixtures, but they are not yet equivalent to a production runtime calling live research/model providers itself.

## 9. Exact next objective

`LEARNING-LAB-IMPL-008 — STOCHASTIC MULTI-CANDIDATE GENERATION + INDEPENDENT SELECTION / ABSTENTION SLICE`

Run multiple independently generated candidates for the same new learning goal through the frozen research evidence and independent verification system, measure generation variance, prevent the generator from selecting itself, compare candidates using mechanically valid signals plus explicit human-review dimensions, preserve rejected candidates and reasons, and prove the system can choose a mechanically superior candidate or abstain when no candidate safely clears the gates.

Preserve all 178 current regressions and all research/model/oracle crash/replay guarantees.
