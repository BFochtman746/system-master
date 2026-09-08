# BOOK-EVAL-LEMONADE-001-REPAIR-005 Gate D — Teacher Resume Repair 001

## Original run standing

Workflow run `34255493340`, job `102160116435`, completed with overall conclusion **failure**.

The infrastructure and blind-boundary stages passed:

- runner A-01 available;
- Python 3.14.6 resolved under runner identity;
- scoring-private absent from repository and teacher persistent root;
- Lemonade `user.gpt-oss-120b-MXFP4` loaded successfully;
- teacher used no DEVELOPMENT, VISIBLE_REGRESSION, or HIDDEN_HOLDOUT gold.

The teacher generator durably committed **68 / 440** original synthetic records before a generated batch was rejected during the second `PROMPT_INJECTION_IN_MANUSCRIPT` tranche. Because the generator writes each accepted record to the persistent A-01 root before continuing, those 68 records remain admissible and resumable.

The failed run artifact `book-eval-repair005-gate-d-teacher-evidence` (artifact ID `10068179138`, digest `sha256:98bc98bed4728abb694bd70fbf992eeb9a003c320a783f70f6a561ab65698c34`) contains diagnostic logs only and is **not** a frozen teacher corpus.

## Repair

A resumable workflow was added at:

`.github/workflows/book-eval-repair-005-gate-d-teacher-resume.yml`

Commit:

`a457773259b66f00b2529910a7e160487e1b1dc4`

The resume workflow reuses the same persistent root and invokes the gold-blind teacher generator repeatedly. If a generated batch fails output/answer-leak validation, the process is restarted from durable progress rather than discarding accepted records.

Resume run:

- run ID: `34257702990`;
- job ID: `102167585376`;
- starting durable progress: at least **68 / 440**;
- no competing A-01 qualification job should be started while this run is active.

## Standing

**ACTIVE — TEACHER DISTILLATION RESUMED FROM DURABLE PARTIAL PROGRESS**

Gate D remains open. It may be closed only after a 440-record teacher corpus is frozen, privately merged with the Gate B corpus, the Gate D student is retrained, and source-held-out plus selective-escalation gates are adjudicated.
