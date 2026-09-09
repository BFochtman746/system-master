# BOOK-EVAL-LEMONADE-001 REPAIR-005 — Second-Shift Evaluator Reliability Findings — 2026-09-09

Status: ACTIVE / GATE-D BLOCKED ON TWO DISTINCT BOUNDARIES

## Executive finding

The intended Gate-D sequence remains valid, but two previously conflated blockers are now separated:

1. **Teacher freeze boundary:** Teacher v3 generation reached 440/440 unique `teacher_record_id` values, with frozen raw SHA-256 `bb7d3b2c7e455dce271e8098fbbfd19325607b34d4c4aab10f5e5d894a0209be`, while using neither DEVELOPMENT/VISIBLE/HIDDEN gold. The v3 workflow then failed its physical JSONL line-count check. The repository already contains `freeze-repair005-gate-d-teacher.py`, which can canonicalize only exact duplicate payloads and fails closed on divergent duplicates. A new teacher-only A-01 qualification wrapper and hosted prequalification were added so this boundary can be proved independently of private student inputs.
2. **Private-authority boundary:** canonical A-01 private-gold recovery run `34292412264`, exact subject `815dce7883986d5a62c6d7c63f63b9d82acea2fe`, executed the registered recovery wrapper and returned `SUBJECT_FAILURE`. Exact frozen `BASE_TRAINING` and `DEVELOPMENT_GOLD` remain unavailable. `PROVIDER` and `REPAIRED_OUTPUT` were recovered, but they cannot substitute for the missing scoring-private roles.

Therefore the dependency-valid order is:

`VERIFY/CANONICALIZE TEACHER v3 440/440 -> RESTORE EXACT PRIVATE BASE_TRAINING + DEVELOPMENT_GOLD AUTHORITY -> INGEST FROZEN TEACHER -> BUILD EXACT 1,052-RECORD STUDENT CORPUS -> RETRAIN HIERARCHICAL STUDENT -> 5-FOLD SOURCE-HELD-OUT QUALIFICATION -> SELECTIVE 120B ESCALATION + PAIRWISE SWAP AUDIT -> ONLY THEN VISIBLE_REGRESSION`

No student training, selective 120B adjudication, visible regression, or hidden/fresh holdout is authorized while either prerequisite remains unresolved.

## Repository authority / source custody

Authoritative active Book branch discovered despite its historical-looking name:

- branch: `book-eval-lemonade-001-blind-resume-003-adapter-repair`
- current pre-second-shift head: `815dce7883986d5a62c6d7c63f63b9d82acea2fe`
- product-logic parent: `f9f5d1d48fb0bdf7cb702eeb3017fa506e42ccb5`
- current head adds the canonical control-plane private-gold recovery transport; it does not replace the frozen REPAIR-005 logic lineage.

The branch contains the full Gate-D implementation: teacher v3 generation/resume, teacher freeze/validation, private recovery, 1,052-record compilation, hierarchical student training, source-held-out evaluation, selective 120B adjudication, pairwise swap audit, and student freeze workflow.

### Current private authority

Canonical A-01 recovery evidence proves:

- `BASE_TRAINING`: MISSING exact frozen authority
- `DEVELOPMENT_GOLD`: MISSING exact frozen authority
- `PROVIDER`: RECOVERED
- `REPAIRED_OUTPUT`: RECOVERED
- exact-hash binding of all required Gate-D private roles: FALSE
- hidden holdout used: FALSE
- visible regression used: FALSE
- raw private content persisted in control-plane evidence: FALSE

This is a **SOURCE_CUSTODY / PRIVATE_AUTHORITY blocker**, not evidence that the Gate-D architecture is absent.

## Teacher v3 standing

Teacher v3 run `34279247006` reached 440/440 unique IDs and wrote final status `TEACHER_SYNTHETIC_FROZEN`. The semantic corpus generation is therefore complete in unique-ID space. The run failed later because the raw JSONL physical line count was not exactly 440.

The generator uses an append-only JSONL plus a `done` set keyed by `teacher_record_id`. This makes `completed_records=440` compatible with more than 440 physical rows after interrupted/resumed generation. The correct repair is not regeneration. It is integrity-preserving canonicalization under the frozen raw hash:

- require the raw SHA-256 to match the v3 evidence;
- require the status to prove 440/440 and zero forbidden gold use;
- derive all 440 expected IDs from the frozen taxonomy;
- preserve the raw corpus unchanged;
- collapse a duplicate only when all payloads for that ID are byte/canonical-JSON identical;
- fail closed if any duplicate ID has divergent payloads;
- emit only hashes/counts/conflict IDs into evidence, not the teacher corpus itself.

The existing `freeze-repair005-gate-d-teacher.py` already implements those semantics. This shift added `.github/scripts/book-eval-repair005-gate-d-teacher-freeze-qualify.js` to isolate that proof from private student inputs and added a hosted 440-record synthetic self-test. Hosted run `34315559004` passed all checks: unique 440, exact-duplicate canonicalization, divergent-duplicate fail-closed, Python compilation, and Node wrapper syntax.

## Current Gate-D architecture classification

| Capability | Standing | Evidence / implication |
|---|---|---|
| Blind/sequestered evaluation | COVERED | Private gold is excluded from provider/teacher prompts; Gate D freezes the contract before scoring and delays visible/fresh holdout use. Current execution is blocked by custody, not design. |
| Train/dev/test contamination controls | COVERED/PARTIAL | Strong source-role boundaries and 5-fold source-held-out filtering exist. Add explicit cross-role ID/digest overlap reports to make contamination evidence easier to audit. |
| Rubric / construct validity | PARTIAL | Frozen 55-leaf hierarchical taxonomy, contrastive curriculum, hard gates, and task modes provide construct structure; no independent human/expert construct-validation study is present in current Gate-D evidence. |
| Calibration | PARTIAL | Student margins drive selective escalation, but margin quality is not the same as probability calibration. Add risk-coverage and confidence-error diagnostics before treating confidence as calibrated. |
| Inter-rater / judge disagreement | PARTIAL/MISSING | Pairwise swap symmetry is tested, but current Gate-D does not estimate multi-judge agreement, chance-corrected agreement, test-retest stability, or disagreement strata. |
| Error taxonomy | COVERED | Frozen hierarchical specialist taxonomy and contrastive curriculum explicitly define semantic boundaries and hard negatives. |
| Selective prediction / escalation | COVERED IN DESIGN, UNEXECUTED CURRENTLY | Bottom-35% confidence escalation, automatic coverage/accuracy gates, combined accuracy gate, and pairwise swap symmetry are implemented. Private prerequisites block execution. |
| Confidence / abstention | PARTIAL | `REVIEW_REQUIRED`/selective escalation semantics exist; add empirical risk-coverage curve and calibration diagnostics rather than assuming raw SVM/LLM confidence is reliable. |
| Source-held-out evaluation | COVERED IN DESIGN, UNEXECUTED CURRENTLY | Deterministic 5-fold exclusion of records derived from each held-out DEVELOPMENT source is implemented. |
| Hierarchical teacher/student distillation | PARTIAL | Teacher unique generation reached 440/440; teacher canonical freeze remains to be proven; student retraining is blocked by missing BASE_TRAINING and DEVELOPMENT_GOLD. |
| Task qualification | COVERED IN DESIGN | Router >=85%, oracle leaf >=80%, end-to-end >=70%, zero missing specialist, clean >=95%, evidence precision >=95%, zero hard violations, then selective gates. |
| Reproducibility | PARTIAL/STRONG | Fixed taxonomy, frozen hashes, deterministic folds/random state, checkpoint/resume, evidence manifests. Teacher append/resume exposed a physical-row integrity failure now isolated by canonicalization. |
| Hidden-holdout governance | COVERED | Retired hidden holdout is forbidden during Gate D; Gate D PASS only authorizes one visible regression and still requires a newly created unseen sealed holdout for a production/90% claim. |
| Dataset leakage controls | PARTIAL/STRONG | Scoring-private boundary and source-held-out folds are strong; add explicit train/eval source-ID and normalized-content digest overlap audits. |
| Robustness | PARTIAL | Clean controls, prohibited hard gates, source-held-out folds and A/B swaps exist; more perturbation and boundary-neighbor robustness can be added after the present frozen path is qualified. |
| Judge reliability | PARTIAL | A/B position-swap symmetry is explicit. Add repeated-judgment stability and transitivity/consistency metrics for 120B fallback if evaluation cost permits. |
| Efficient benchmark design | PARTIAL/STRONG | Student-first + <=35% selective 120B escalation is cost-aware and source-held-out. Add risk-coverage frontier reporting so the chosen escalation rate is evidence-backed, not only threshold-backed. |

## Current external research provenance and implications

### NIST AI Technology Evaluation (AITE), July/August 2026

Source: https://ai-challenges.nist.gov/aite and https://www.nist.gov/news-events/news/2026/07/announcing-nists-artificial-intelligence-technology-evaluation-aite

NIST's current AITE design uses blind data in a sequestered environment specifically to mitigate train/test contamination and provides common data, metrics, and scoring. Gate D's private gold boundary and delayed unseen-holdout design are directionally aligned. Implementation implication: preserve scoring-private custody and produce explicit contamination/overlap evidence rather than treating a public or development benchmark as production proof.

### NIST TEVV-Athlon initial public draft, August 7, 2026

Source: https://www.nist.gov/artificial-intelligence/ai-research/tevv-athlon-framework-evaluating-ai-systems

NIST AI 200-2 proposes a four-stage, customizable TEVV process built around explicit measurement concepts, events, tools, and evidence. Gate D already has frozen objectives/gates, but should make the mapping between construct -> metric -> event/test -> acceptance decision more explicit in future evaluator versions. Do not expand the frozen Gate-D contract merely to conform to a new draft; apply the structure to successor design.

### NIST ARIA Pilot Evaluation Report, November 13, 2025

Source: https://www.nist.gov/publications/assessing-risks-and-impacts-ai-aria-pilot-evaluation-report

ARIA combines model testing, red teaming, and field testing and uses measurement trees for validity. Implication: Book Evaluator production standing should eventually distinguish model-level benchmark performance from system-level/editorial field validity rather than collapsing them into one score.

### OpenAI weak-to-strong generalization, December 14, 2023

Source: https://openai.com/index/weak-to-strong-generalization/

Weak-to-strong results show that stronger models can generalize beyond weaker supervision in some settings, but the result is a proof of concept with important limitations. Implication: teacher/student distillation must remain empirically source-held-out and cannot assume teacher quality transfers automatically to the student. Gate D's held-out gates are therefore necessary.

### LLM-as-a-judge reliability literature

Sources:
- https://arxiv.org/abs/2406.07791 — position bias / repetition stability / position consistency / preference fairness.
- https://arxiv.org/abs/2509.21117 — score-comparison and pairwise transitivity inconsistencies.
- https://arxiv.org/abs/2602.16610 — judge-aware comparative aggregation and judge reliability.

Implication: Gate D's A/B swap requirement is valuable and should remain a hard gate. A future successor should add test-retest stability and cycle/transitivity checks rather than treating one deterministic-seeming judge pass as full reliability evidence.

### Calibration / selective prediction literature

Sources:
- https://arxiv.org/abs/2505.23854 — uncertainty calibration and selective classification across LLMs.
- https://arxiv.org/abs/2502.06884 — adaptive/conformal abstention and risk/coverage tradeoffs.

Implication: high accuracy is not sufficient evidence of calibrated uncertainty. Gate D should report empirical risk-versus-coverage across the source-held-out student confidence ordering. The frozen <=35% escalation rule can stay unchanged for this Gate D run; successor work can compare it to calibrated/adaptive policies without tuning on hidden/visible holdouts.

### Contamination literature

Sources:
- https://arxiv.org/abs/2508.13180 — search-time contamination can expose benchmark questions/answers through retrieval.
- https://arxiv.org/abs/2502.14425 — survey of data contamination and prevention approaches.

Implication: when future evaluator tasks allow web/search tools, sequestering answer labels alone is insufficient; retrieval paths and benchmark/source identifiers also need contamination controls. Current Gate D provider execution is local and bounded, but successor evaluator architecture should preserve this distinction.

## Candidate acceptance tests / benchmarks

### AT-D-TEACHER-001 — Frozen raw identity

PASS only if persistent Teacher raw SHA-256 equals `bb7d3b2c7e455dce271e8098fbbfd19325607b34d4c4aab10f5e5d894a0209be`, status proves `TEACHER_SYNTHETIC_FROZEN`, completed=expected=440, taxonomy hash matches, and all gold-use flags are false.

### AT-D-TEACHER-002 — Canonical duplicate integrity

PASS if the 440 expected taxonomy/serial IDs are all present. Exact duplicate payloads may collapse. Divergent payloads for one ID must fail closed with only ID/count/hash evidence. Raw Teacher data must remain unchanged and must not be uploaded as A-01 evidence.

### AT-D-PRIVATE-001 — Exact private role binding

PASS only if `BASE_TRAINING`, `PROVIDER`, and `DEVELOPMENT_GOLD` all bind to the frozen SHA-256 values in the existing Gate-D workflow. Near matches, reconstructed files, provider copies, repaired output, or historical metadata cannot substitute.

### AT-D-INGEST-001 — 1,052-record corpus

PASS only if base=612, teacher=440, combined=1,052, all specialists are covered, teacher source/rights/gold flags pass, IDs are unique, and combined manifest binds exact hashes. The compiler already enforces these cardinalities and taxonomy/source checks.

### AT-D-SOURCEHELDOUT-001 — Student advancement

Preserve the frozen 5-fold DEVELOPMENT source-held-out gates: router >=85%; oracle-specialist leaf >=80%; end-to-end >=70%; missing-specialist=0; clean >=95%; evidence precision >=95%; hard violations=0.

### AT-D-SELECTIVE-001 — Selective escalation

Preserve automatic accuracy >=90%, automatic coverage >=65%, escalation <=35%, hybrid end-to-end >=85%, clean >=95%, hard violations=0, pairwise A/B swap symmetry=100% for tested pairwise cases.

### AT-D-CALIBRATION-001 — Risk/coverage diagnostic (successor, non-promotion-changing)

From frozen source-held-out prediction rows, report accuracy/error rate at every unique student-confidence cutoff plus area-under-risk-coverage. This is diagnostic only for the current frozen Gate D; it must not retroactively tune Gate-D thresholds.

### AT-D-JUDGE-RELIABILITY-001 — Repetition/transitivity diagnostic (successor)

On a separately designated non-hidden diagnostic subset, repeat 120B judgments and construct reversible A/B and three-way cycles where task semantics permit. Report test-retest agreement, position consistency, and cycle/transitivity violations. Do not use hidden/visible gold to select prompts or tune the judge.

### AT-D-CONTAMINATION-001 — Cross-role overlap report (successor)

Before a future fresh sealed holdout, produce only safe source IDs/digests to prove disjointness between adaptive training sources, DEVELOPMENT-derived sources, visible regression, and the fresh sealed holdout. Do not export private text.

## Prioritized build packets

### P0 — TEACHER-FREEZE-QUALIFICATION-001 — IMPLEMENTED / HOSTED-PREQUALIFIED

Artifacts added:

- `.github/scripts/book-eval-repair005-gate-d-teacher-freeze-qualify.js`
- `qualification/book-eval-lemonade-001/scripts/test-repair005-gate-d-teacher-freeze.py`
- `.github/workflows/book-eval-repair-005-gate-d-teacher-freeze-hosted-prequal.yml`

Hosted prequalification run: `34315559004` — PASS.

This wrapper intentionally uses no base training, development gold, visible regression, hidden holdout, student training, or selective 120B. It emits only freeze manifest/validation/summary evidence, not the Teacher corpus.

### P1 — PRIVATE-AUTHORITY-RECOVERY-002 — BLOCKED / DO NOT SYNTHESIZE

Recover the exact frozen `BASE_TRAINING` and `DEVELOPMENT_GOLD` files by their existing Gate-D SHA-256 identities. Re-run only the registered private recovery qualification through the central A-01 control plane. If either remains absent, preserve SUBJECT_FAILURE and stop downstream private work.

### P2 — STUDENT-1052-QUALIFICATION — READY BY CODE, BLOCKED BY P1

Once P0 Teacher freeze PASS and P1 exact private authority PASS both exist, compile 612+440=1,052 and run the frozen hierarchical student/source-held-out gates unchanged.

### P3 — SELECTIVE-120B-QUALIFICATION — DEPENDS ON P2 PASS

Judge exactly the bottom <=35% source-held-out student-confidence cases with the 120B fallback and run the existing pairwise swap audit. Do not run if student advancement fails.

### P4 — EVALUATOR-RELIABILITY-DIAGNOSTICS — PREPARE_NEXT

Add risk/coverage, repeatability/transitivity, and explicit contamination-overlap evidence as non-promotion-changing diagnostics first. Only after evidence demonstrates value should a future contract revision make any of them promotion gates.

## Exact stop conditions

- Do not regenerate Teacher rows while frozen raw SHA/status remain available.
- Do not choose among divergent duplicate Teacher payloads automatically; fail closed.
- Do not retrain the student until exact `BASE_TRAINING` and `DEVELOPMENT_GOLD` authority is restored.
- Do not invoke selective 120B until student advancement PASS.
- Do not run VISIBLE_REGRESSION until full Gate-D PASS.
- Do not claim production or 90% from Gate-D/visible regression; a new unseen sealed holdout remains required.

## Highest-value next objective

`BOOK-EVAL-REPAIR-005-GATE-D-TEACHER-FREEZE-A01-001` — register and centrally schedule the new teacher-only freeze qualifier on the exact hosted-prequalified Book subject; adjudicate whether the frozen raw Teacher canonicalizes to an unambiguous 440-row corpus. In parallel, continue exact-hash source-custody recovery for `BASE_TRAINING` and `DEVELOPMENT_GOLD`. Only when both boundaries PASS may the 1,052-record student path resume.
