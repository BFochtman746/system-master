# PROSE-REAL-LIMITATION-BLIND-EVALUATOR-STARTUP-001

Status: ISOLATED EVALUATOR WORKER STARTUP — NOT A CANONICAL OWNER CHAT
Owner lane: SYSTEM_MASTER/BOOK/PROSE
Objective: PROSE-REAL-LIMITATION-BLIND-MODEL-SCORING-001
Blind branch: literary-prose-blind-eval-001
Supervising owner control ref: literary-prose-engine-001
Supervising owner control head revalidated: 9d360ac20839d06765b1b3a68d5c1ebedb2eba50
Owner admission standing: REVALIDATED__OBJECTIVE_UNCHANGED__BLIND_SCORING_REMAINS_NEXT_CRITICAL_PATH
Source/reconstruction repair: PROSE-BLIND-EXECUTION-FORENSIC-REPAIR-001

## Eligibility

Use this startup only in a fresh evaluator context that has not read any author labels, author adjudication commentary, labeled ground-truth packet, or labeled Prose state for PROSE-LGT-001 through PROSE-LGT-006.

This evaluator is an isolated scoring worker, not the canonical Prose owner chat. It may write only blind prediction evidence on `literary-prose-blind-eval-001` before the prediction seal. It may not redefine Prose control, Book state, product topology, obligations, completion ledgers, Second Shift state, revision authority, publication authority, or canonical manuscript state.

Owner admission has been revalidated against the supervising owner head recorded above. The evaluator must not inspect labeled owner state to repeat that revalidation. If the recorded supervising owner head is no longer current when execution begins, stop and return `BLIND_ADMISSION_REVALIDATION_REQUIRED`.

## Before prediction seal — permitted reads only

1. This file.
2. `qualification/literary-prose-engine-001/step-f/PROSE-REAL-LIMITATION-BLIND-EVALUATION-CONTRACT-001.json` from this blind branch.
3. The unlabeled ground-truth author packet from this blind branch only.
4. ChatGPT Files Library solely to locate the three exact source filenames named in the blind contract and materialize candidate raw bytes into an ephemeral working directory.
5. The three admitted private source manuscripts only after each materialized file matches its exact source-package SHA256.
6. `qualification/literary-prose-engine-001/step-f/prose_blind_source_custody_preflight.py` and non-ground-truth qualification fixtures from this blind branch.
7. Qualified semantic evidence validator, semantic-to-diagnostic adapter, Passage Intelligence, Step-F code, and non-ground-truth fixtures already present on this blind branch.

Do not read `literary-prose-engine-001` at or after the ground-truth freeze commit named in the blind contract. Do not read current main completion/obligation records, current labeled Prose state, author commentary, or any artifact containing author labels before the prediction seal.

## Source retrieval and preflight

1. Search ChatGPT Files Library by exact title for each of these filenames:
   - `Volume I - THE VOICE FROM THE BUSH - Clean.docx`
   - `Unhindered_Book_3.docx`
   - `Unhindered-Book_4.docx`
2. Materialize the raw files into an ephemeral working directory. Do not upload them to GitHub and do not persist raw manuscript text in repository evidence.
3. If more than one exact-title candidate exists, hash candidates and use only the one whose SHA256 exactly matches the blind contract. Library file IDs are not authority.
4. Run `prose_blind_source_custody_preflight.py` or perform its exact equivalent. PASS requires 3/3 source-package SHA256 matches and 6/6 reconstructed passage SHA256 matches.
5. Reconstruct from `NONEMPTY_DOCX_PARAGRAPHS` using this exact rule: concatenate descendant `w:t` text inside each `w:p`, strip outer whitespace, drop empty paragraphs, use **0-based inclusive** `source_paragraph_start` through `source_paragraph_end`, join selected paragraphs with one ASCII space, then SHA256 the UTF-8 passage.
6. Passage digest equality is authoritative. Word counts are advisory only and must never override an exact digest match.
7. Any missing source, source digest mismatch, passage digest mismatch, or contract-semantic mismatch stops execution before scoring.

## Execution sequence

1. Verify the blind packet remains `labels_authoritative=false`, `labels_recorded=0`, and revision authority count 0.
2. Complete the source retrieval/preflight above.
3. Verify every reconstructed passage SHA256 exactly against the blind contract before scoring.
4. Run the already-qualified semantic -> Passage Intelligence -> Step-F path on each case without author ground truth.
5. Produce exactly one prediction record per case with:
   - `case_id`
   - `passage_sha256`
   - `semantic_disposition`
   - `step_f_finding_class`
   - `confidence`
   - `abstention_or_downgrade_reason`
   - `diagnosis_allowed`
   - `revision_allowed`
6. Require `revision_allowed=false` for all six cases. Generate no candidate prose and mutate no manuscript.
7. Create, do not overwrite, this prediction artifact on the blind branch:
   `qualification/literary-prose-engine-001/step-f/blind-evaluation-001/PROSE-REAL-LIMITATION-BLIND-PREDICTION-SEAL-001.json`
8. The Git commit containing that newly created artifact is the immutable prediction seal. Capture its exact commit SHA.
9. If the prediction artifact cannot be committed, stop `PREDICTION_SEAL_WRITE_BLOCKED`. Do not read ground truth.
10. Only after the prediction-seal commit exists may the evaluator read the frozen author ground truth identified by the blind contract.
11. Compare the sealed predictions against ground truth and measure:
    - REAL_LIMITATION identification;
    - downgrade behavior;
    - abstention behavior;
    - WORKING_AS_INTENDED preservation;
    - NEUTRAL_OBSERVATION retention;
    - false-positive limitation rate.
12. Create, do not overwrite, the comparison receipt at:
    `qualification/literary-prose-engine-001/step-f/blind-evaluation-001/PROSE-REAL-LIMITATION-BLIND-COMPARISON-RECEIPT-001.json`
    The receipt must reference the exact prediction-seal commit and frozen ground-truth commit while preserving revision authority at zero.
13. Stop. Return the prediction-seal SHA, comparison-receipt SHA, comparison result, and exact next step to the canonical Prose owner chat.

## Failure rules

- Missing Library source or no exact SHA256 match -> stop `SOURCE_CUSTODY_BLOCKED`; do not reconstruct or substitute text.
- Source-package or passage digest mismatch -> stop `EVIDENCE_MISMATCH`; do not score.
- Any accidental author-label exposure before the prediction seal -> stop `BLINDNESS_CONTAMINATED`; discard unsealed predictions and require another fresh evaluator context.
- Prediction write failure -> stop `PREDICTION_SEAL_WRITE_BLOCKED`; do not read ground truth.
- Pipeline failure -> record the exact failing boundary; do not weaken tests or alter author ground truth.
- No result may authorize revision, candidate superiority, manuscript mutation, canon replacement, or publication.

## PASS proves

PASS proves only that a fresh, ground-truth-blind evaluator retrieved the exact admitted source bytes, reproduced all six frozen passage digests under the repaired reconstruction contract, produced and immutably sealed six-case predictions, and compared those sealed predictions against frozen author ground truth while revision authority remained zero. It does not by itself prove production-grade literary accuracy or authorize manuscript changes.
