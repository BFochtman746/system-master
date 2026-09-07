# LEARNING-LAB-IMPL-002 — Real-Goal Research-Grounded Course + Lesson Generation Slice

**Standing:** `PASS_PORTABLE_IMPLEMENTATION`  
**Generated course standing:** `MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED`  
**Target-native:** NOT REQUIRED FOR THIS PORTABLE SLICE / NOT CLAIMED  
**Production System Master integration:** NOT PERFORMED

## Objective

Implement the next real Learning slice after `LEARNING-LAB-IMPL-001`: take a bounded real learning goal, ground the course in authoritative research, construct a skill/prerequisite map, generate actual lessons/practice/assessment candidates, independently validate the candidate, and then run it through the existing evidence/mastery/next-action engine.

## Real goal

`Create a Git feature branch, make and commit a change, merge it into main, and verify the result independently.`

This is intentionally one bounded supported goal. General arbitrary-goal generation remains future work.

## Research basis

The frozen dossier `sources/RESEARCH_DOSSIER_GIT_FEATURE_WORKFLOW_V1.json` contains six official Git documentation sources and seven admitted claims:

1. Git `git-status` documentation — https://git-scm.com/docs/git-status
2. Git `git-add` documentation — https://git-scm.com/docs/git-add
3. Git `git-commit` documentation — https://git-scm.com/docs/git-commit
4. Git `git-switch` documentation — https://git-scm.com/docs/git-switch
5. Git `git-merge` documentation — https://git-scm.com/docs/git-merge
6. Git `git-log` documentation — https://git-scm.com/docs/git-log

The source policy for this slice is `OFFICIAL_PRIMARY_ONLY`. Runtime generation does not perform live research; it consumes the frozen dossier so exact experiments are replayable.

## Implemented flow

`GOAL -> RESEARCH_FROZEN -> CLAIM LEDGER -> MODEL CANDIDATE -> COURSE COMPILER -> GROUNDING VALIDATOR -> INSTRUCTIONAL VALIDATOR -> GIT ORACLE -> READY_FOR_REVIEW -> LEARNER EXECUTION`

### ResearchPort

`FrozenResearchPort` returns the versioned real-source dossier only for the declared goal. Unsupported goals fail closed with `UNSUPPORTED_REAL_GOAL_FOR_SLICE`.

### ModelPort

`DeterministicModelAdapter` is a replaceable provider-neutral test adapter. It generates:

- 2 observable criteria;
- 2 prerequisite-linked skills;
- 2 full lesson definitions;
- worked examples;
- 4 practice items;
- 2 independent mastery checks;
- 2 delayed retention checks.

This proves the generation interface and validation boundary without pretending a live nondeterministic LLM is already qualified.

### Closed-world grounding

Every material lesson explanation, worked example, and item rationale is represented by an exact grounding span with admitted claim references. The validator requires:

- referenced claims exist;
- source standing is admitted;
- lesson explanations match their grounded span;
- every worked example matches a grounded span;
- every item rationale matches a grounded span;
- all seven research claims are represented in the generated instructional package.

A seeded hallucinated statement such as an unsupported automatic-push claim is rejected even when the surrounding lesson still cites valid Git sources.

### Independent behavior oracle

`GitBehaviorOracle` executes assessment answers and worked examples in isolated temporary Git repositories using the installed `git version 2.47.3`.

It independently checks:

- stage + commit sequences;
- feature-branch creation;
- commit placement on the feature branch;
- switch back to main;
- merge behavior;
- clean post-merge worktree;
- branch ancestry/history;
- representative worked examples.

Generated answer keys do not self-authorize.

### Mechanical instructional validation

The course is blocked if it lacks:

- a lesson for a required skill;
- practice, mastery check, or retention check for a required criterion;
- multiple worked examples;
- practice variation;
- independent practice/mastery families;
- independent mastery/retention families;
- protection against verbatim mastery-answer exposure in lesson content.

The mastery branch problem was changed from the lesson's `feature` example to an unseen `topic/change.txt` task to reduce teaching-assessment contamination.

## Qualification evidence

Final autonomous portable campaign:

- **37/37 tests PASS**.
- **15 Python files compile PASS**.
- Full real Git learner journey: **PASS**.
- Research source count: **6**.
- Frozen claim count: **7**.
- Generated claim coverage: **100%**.
- Closed-world material-span grounding: **PASS**.
- Instructional mechanical validation: **PASS**.
- Executable mastery/retention item oracles: **4/4 PASS**.
- Executable lesson worked-example oracles: **2/2 PASS**.
- Deterministic generation from two fresh stores: **PASS**.
- Stress campaign: **100/100 PASS**.
  - research-checkpoint crash recovery: **50/50**;
  - generation/validation-checkpoint crash recovery: **50/50**;
  - idempotent create replay: **100/100**;
  - unique course digests: **1**;
  - unique dossier digests: **1**.

Exact machine-readable receipt: `evidence/qualification_receipt.json`.

## Failure cases proven

The candidate fails closed for at least:

- unsupported real goal;
- missing required research claim;
- source not admitted;
- ungrounded lesson;
- unmapped hallucinated factual span;
- behaviorally wrong mastery key;
- broken Git command in a worked example;
- verbatim mastery-answer exposure in lesson content;
- practice/mastery item-family reuse;
- wrong learner Git workflow;
- assisted success counted as independent mastery;
- crash after research checkpoint;
- crash after generated/validated checkpoint;
- duplicate create replay.

## Important implementation correction found during this slice

A mechanically grounded course still cannot be called pedagogically verified merely because claim links and executable commands pass. The output standing was therefore deliberately changed from a generic portable-verified label to:

`MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED`

The course remains `READY_FOR_REVIEW`, not automatically ACTIVE.

## Preserved IMPL-001 regression

All original 20 `LEARNING-LAB-IMPL-001` tests remain in the suite and pass. The new real-course layer reuses the existing evidence/mastery/retention/next-action kernel instead of creating a competing Learning truth model.

## What is proven

For this bounded real Git goal, the Learning Lab can now autonomously:

1. load a frozen authoritative research dossier;
2. require the necessary research claims;
3. generate a real skill/prerequisite map and instructional course candidate through a ModelPort;
4. bind material instructional spans to research claims;
5. reject unmapped hallucinated content;
6. mechanically inspect instructional structure and assessment contamination;
7. execute worked examples and answer keys against a real domain runtime;
8. persist the course and its validation receipt only after those gates pass;
9. run learner practice/mastery/retention through the existing evidence engine;
10. recover from research/generation crashes without recomputing committed checkpoints or duplicating outputs.

## Not proven

This packet does **not** claim:

- arbitrary real-goal course generation;
- a live nondeterministic LLM/provider is qualified;
- independent human pedagogical review is complete;
- real learner effectiveness is proven;
- the current one-hour Lab retention delay is scientifically calibrated;
- far transfer is proven;
- native iPhone behavior is proven;
- System Master production integration is complete.

## Exact next objective

`LEARNING-LAB-IMPL-003 — TUTOR/DIRECTOR INTERACTIVE EXECUTION SLICE`

Build the first executable tutor loop on the real grounded course:

`OBSERVE LEARNER RESPONSE -> ASSESS EVIDENCE -> DIAGNOSE OR ABSTAIN -> CHOOSE TEACHING MOVE -> HINT/EXPLANATION/SCAFFOLD -> FADE SUPPORT -> FRESH RECHECK -> UPDATE LEARNER STATE -> NEXT ACTION`

The slice must prove the tutor does not invent misconceptions from insufficient evidence, does not give away independent-assessment answers, detects overhelping/assistance dependence, selects bounded remediation, and preserves the existing evidence/mastery semantics.
