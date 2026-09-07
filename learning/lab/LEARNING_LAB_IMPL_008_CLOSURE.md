# LEARNING-LAB-IMPL-008 — STOCHASTIC MULTI-CANDIDATE GENERATION + INDEPENDENT SELECTION / ABSTENTION SLICE

**Status:** `PASS_PORTABLE_IMPLEMENTATION`

## 1. What we built

IMPL-007 proved one recorded model-generated course candidate could pass through frozen research, provenance, independent mechanical verification, Tutor, mastery, retention and transfer.

IMPL-008 adds the next control layer: the same goal + same research + same model/prompt can yield multiple candidate course packages. The system now pins the exact candidate set, independently hard-gates each candidate, applies predeclared selection-evidence targets, selects only when the evidence warrants it, and otherwise produces a durable `ABSTAIN` result.

Runtime path:

`GOAL -> FROZEN RESEARCH -> PIN CANDIDATE SET -> GENERATE/PERSIST CANDIDATES -> INDEPENDENT HARD GATES -> SELECTION ELIGIBILITY -> PARETO SELECTION OR ABSTAIN -> BUILD ONLY SELECTED COURSE -> EXISTING LEARNING RUNTIME`

The model is `CANDIDATE_GENERATOR_ONLY`. It cannot rank, score or select its own outputs.

## 2. Why this slice exists

A production generative model is not deterministic. Repeating the same request can produce different skill maps, examples, assessments and transfer tasks. If the system simply accepts the first output or asks the same generator which of its own outputs is best, autonomy becomes ungrounded.

This slice creates the control boundary between generation and promotion.

## 3. Candidate-set qualification fixture

Four same-prompt / same-research / same-model recorded candidate outputs are used:

- Candidate A — mechanically valid and meets the declared transfer-diversity selection target.
- Candidate B — mechanically valid but below the declared selection-evidence target.
- Candidate C — deliberately defective; independent answer-key/oracle validation rejects it.
- Candidate D — mechanically tied with A for the abstention test.

Truth boundary: these are multiple recorded same-prompt candidate outputs plus an executable repeated-call capture-port abstraction. This does **not** claim a live external provider was independently sampled four times in the portable environment.

## 4. Selection semantics

Selection is non-compensatory:

1. Hard gates run first.
2. Rejected candidates cannot participate in selection.
3. Hard-gate PASS alone is not enough: all predeclared selection-evidence targets must be met.
4. Only independently verifiable metrics can influence mechanical selection.
5. No scalar quality score is used.
6. Model-provided ranking/quality fields are forbidden.
7. If no candidate clears selection targets -> `ABSTAIN`.
8. If multiple eligible candidates are tied/incomparable -> `ABSTAIN`.
9. Only an independently selected candidate may enter the existing course-build authority path.

Current bounded selection metric:

- `validated_transfer_task_diversity`, target = 2.

This is deliberately narrow. It does not claim to measure overall pedagogical quality.

## 5. What testing found and why it mattered

### Repair A — weak-survivor default-win bug

Initial policy treated every hard-gate-passing candidate as selectable. That meant a valid but below-target candidate could become the winner merely because stronger candidates were rejected.

That was wrong: "best remaining" is not equivalent to "sufficiently evidenced."

Repair:

`HARD_GATE_PASS -> SELECTION_TARGET_ATTAINMENT -> ELIGIBLE`

A valid candidate below target now yields `NO_SELECTION_ELIGIBLE_CANDIDATES` if no stronger eligible candidate remains.

### Repair B — silent object identity collision

The Lab repository used `INSERT OR IGNORE` for immutable objects. A repeated semantic object ID with different content could therefore silently preserve the older body.

Repair:

- same object ID/version + same digest -> idempotent;
- same object ID/version + different digest -> `OBJECT_IDENTITY_COLLISION`;
- every object read verifies its stored digest -> `OBJECT_DIGEST_MISMATCH` on corruption.

A direct persisted candidate-evaluation tamper test now proves corruption is detected before selection can consume it.

## 6. How to understand the tests

### Regression tests

Question: did multi-candidate generation break anything already proven?

Result: **220/220 total PASS**, consisting of **178 prior IMPL-001..007 behaviors + 42 new IMPL-008 behaviors**.

### Candidate hard-gate tests

Question: can a wrong key, bad oracle result, unsupported content or self-ranking model output remain selectable?

Result: defective candidates are rejected before comparison.

### Abstention tests

Question: will the selector invent a winner when evidence is insufficient?

Proven cases:

- all candidates invalid -> `ABSTAIN`;
- candidates valid but below selection target -> `ABSTAIN`;
- multiple eligible candidates tied -> `ABSTAIN`.

### Anti-gaming tests

Question: can a generator inflate its apparent quality cheaply?

Proven protections:

- duplicate output cannot count as two stochastic candidates;
- renaming the same transfer task does not increase diversity;
- model-supplied ranking/quality fields are forbidden;
- scalar opaque score is not used;
- a defective candidate cannot compensate for a failed hard gate with high coverage.

### Persistence/integrity tests

Question: can retries or stored-state corruption silently change the selection?

Proven protections:

- changed candidate set under same operation conflicts;
- same semantic goal ID cannot silently bind a different candidate set under a new job;
- stored candidate-evaluation tampering is detected;
- only the selected candidate becomes a course;
- replay does not duplicate course/candidate effects.

### Crash/recovery tests

Question: after a crash, does the system continue the exact same selection lineage?

100 recovery runs across eight checkpoints:

- GOAL_INTERPRETED
- RESEARCH_PLANNED
- SOURCES_ACQUIRED
- CANDIDATE_SET_PINNED
- CANDIDATES_GENERATED
- CANDIDATES_EVALUATED
- SELECTION_DECIDED
- SELECTED_COURSE_BUILT

Result: **100/100 PASS**, with:

- unique candidate-set digests: 1;
- unique selection-decision digests: 1;
- unique final course digests: 1.

### Ordering tests

Question: can candidate ordering change the answer?

- selection ordering stress: **100/100**, one result;
- tie ordering stress: **100/100**, one abstention result.

## 7. Final qualification

- combined tests: **220/220 PASS**;
- preserved IMPL-001..007 regression suite: **178/178 PASS**;
- new IMPL-008 tests: **42/42 PASS**;
- Python files compile: **36 / PASS**;
- targeted adversarial campaign: **23/23 PASS**;
- crash/recovery campaign: **100/100 PASS**;
- candidate-order determinism: **100/100 PASS**;
- abstention-order determinism: **100/100 PASS**;
- generated course standing remains `MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED`.

## 8. What this proves

Within the bounded Python-comprehensions candidate set, the Learning Lab can now:

- preserve multiple same-prompt candidate identities;
- prevent candidate-set drift during recovery;
- independently evaluate every candidate;
- reject hard-gate failures;
- distinguish mechanical validity from selection sufficiency;
- select only on predeclared independently verifiable evidence;
- abstain instead of inventing a winner;
- prevent generator self-ranking;
- persist selection provenance into the selected course;
- recover without changing the candidate set, selection or final course;
- preserve all earlier Learning behavior.

## 9. What this does not prove

This slice does **not** prove:

- a live external model provider was sampled repeatedly in this portable environment;
- the current transfer-diversity metric captures overall course quality;
- mechanically selected means pedagogically superior;
- an AI evaluator is qualified for pedagogical judgment;
- independent human pedagogical review is complete;
- real learner effectiveness, long-term retention or far transfer;
- native iPhone behavior;
- production System Master integration.

## 10. Exact next objective

`LEARNING-LAB-IMPL-009 — COURSE REFRESH + SOURCE FRESHNESS + IMMUTABLE SUCCESSOR / SEMANTIC DIFF SLICE`

Take an already generated/selected course whose source evidence later changes or becomes stale. Detect the freshness trigger, research a successor evidence set, generate and independently validate a successor course candidate, compute an explicit semantic diff, preserve the active course immutably, migrate only allowed learner-state references, invalidate/reassess affected mastery evidence where necessary, and activate the successor only through explicit gates. Prove source change cannot silently rewrite an active course or preserve mastery whose evidentiary basis is no longer valid.
