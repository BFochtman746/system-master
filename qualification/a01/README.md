# A-01 Coding Qualification

`A01-CODE-QUAL-*` measures A-01's own code-authoring performance on controlled benchmark work.

It is intentionally separate from Programming Quality Framework (PQF) measurements. PQF can measure the health of the whole System Master repository regardless of who authored the code; A-01 coding qualification measures only work produced by A-01 inside a sealed benchmark window.

## A01-CODE-QUAL-001

The first qualification is a 30-minute sealed, multi-language coding stress baseline. The first valid run is descriptive baseline evidence only. Thresholds may be derived later from repeated evidence; they are not chosen in advance.

A valid run requires:

- an unseen, frozen benchmark subject and assignment;
- a hidden evaluator unavailable to A-01 during the measured window;
- a hard 30-minute wall-clock boundary with no human assistance;
- exact starting/final Git identities and SHA-256 evidence identities;
- immutable capture of the final diff, logs, visible/hidden tests, and post-run quality reports;
- no post-deadline mutation in the measured artifact;
- a machine-readable `a01.code-qualification-receipt.v1` receipt.

The benchmark must exercise feature implementation, bug diagnosis, Java/Python/JavaScript integration, concurrency/idempotency, persistence/recovery, validation/failure safety, test authoring, debugging, and scope discipline.
