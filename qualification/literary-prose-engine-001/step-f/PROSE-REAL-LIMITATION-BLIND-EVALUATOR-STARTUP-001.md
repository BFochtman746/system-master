# PROSE-REAL-LIMITATION-BLIND-EVALUATOR-STARTUP-001

Status: ISOLATED EVALUATOR WORKER STARTUP — NOT A CANONICAL OWNER CHAT
Owner lane: SYSTEM_MASTER/BOOK/PROSE
Objective: PROSE-REAL-LIMITATION-BLIND-MODEL-SCORING-001
Blind branch: literary-prose-blind-eval-001
Supervising owner control ref: literary-prose-engine-001
Supervising owner control head at preparation: 70cf75fa094ae408389f82c14b48bd43281fa298

## Eligibility

Use this startup only in a fresh evaluator context that has not read any author labels, author adjudication commentary, labeled ground-truth packet, or labeled Prose state for PROSE-LGT-001 through PROSE-LGT-006.

This evaluator is an isolated scoring worker, not the canonical Prose owner chat. It may write only blind prediction evidence on `literary-prose-blind-eval-001` before the prediction seal. It may not redefine Prose control, Book state, product topology, obligations, completion ledgers, Second Shift state, revision authority, publication authority, or canonical manuscript state.

If the supervising owner has not confirmed that the prepared owner-control head remains current, stop and return `BLIND_ADMISSION_REVALIDATION_REQUIRED`. Do not inspect the labeled owner state yourself to resolve that question.

## Before prediction seal — permitted reads only

1. This file.
2. `qualification/literary-prose-engine-001/step-f/PROSE-REAL-LIMITATION-BLIND-EVALUATION-CONTRACT-001.json` from this blind branch.
3. The unlabeled ground-truth author packet from this blind branch only.
4. The three admitted private source manuscripts after verifying the exact source-package SHA256 values in the blind contract.
5. Qualified semantic evidence validator, semantic-to-diagnostic adapter, Passage Intelligence, Step-F code, and non-ground-truth fixtures already present on this blind branch.

Do not read `literary-prose-engine-001` at or after the ground-truth freeze commit named in the blind contract. Do not read current main completion/obligation records, current labeled Prose state, author commentary, or any artifact containing author labels before the prediction seal.

## Execution sequence

1. Verify the blind packet remains `labels_authoritative=false`, `labels_recorded=0`, and revision authority count 0.
2. Verify all three source-package SHA256 values exactly.
3. Reconstruct all six passages using the blind contract's `NONEMPTY_DOCX_PARAGRAPHS`, 1-based indexing, single-ASCII-space join rule.
4. Verify every reconstructed passage SHA256 exactly against the blind contract before scoring.
5. Run the already-qualified semantic -> Passage Intelligence -> Step-F path on each case without author ground truth.
6. Produce exactly one prediction record per case with:
   - `case_id`
   - `passage_sha256`
   - `semantic_disposition`
   - `step_f_finding_class`
   - `confidence`
   - `abstention_or_downgrade_reason`
   - `diagnosis_allowed`
   - `revision_allowed`
7. Require `revision_allowed=false` for all six cases. Generate no candidate prose and mutate no manuscript.
8. Commit the six prediction records to this blind branch. The commit SHA is the prediction seal.
9. Only after the prediction-seal commit exists may the evaluator read the frozen author ground truth identified by the blind contract.
10. Compare sealed predictions against ground truth and measure:
    - REAL_LIMITATION identification;
    - downgrade behavior;
    - abstention behavior;
    - WORKING_AS_INTENDED preservation;
    - NEUTRAL_OBSERVATION retention;
    - false-positive limitation rate.
11. Commit a comparison receipt that references both the prediction-seal commit and the frozen ground-truth commit while preserving revision authority at zero.
12. Stop. Return the two new commit SHAs and comparison result to the canonical Prose owner chat for admission/reconciliation.

## Failure rules

- Source-package or passage digest mismatch -> stop with `EVIDENCE_MISMATCH`; do not score.
- Any accidental author-label exposure before the prediction seal -> stop with `BLINDNESS_CONTAMINATED`; discard unsealed predictions and require another fresh evaluator context.
- Missing private source -> stop with `SOURCE_CUSTODY_BLOCKED`; do not reconstruct or substitute text.
- Pipeline failure -> record the exact failing boundary; do not weaken tests or alter author ground truth.
- No result may authorize revision, candidate superiority, manuscript mutation, canon replacement, or publication.

## PASS proves

PASS proves only that a fresh, ground-truth-blind evaluator produced sealed six-case dispositions and that those sealed predictions can be compared against frozen author ground truth with revision authority remaining zero. It does not by itself prove production-grade literary accuracy or authorize manuscript changes.
