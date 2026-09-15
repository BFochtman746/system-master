# A01-CODE-QUAL-001 Execution Architecture

The benchmark uses separated jobs so A-01 never receives the hidden evaluator before its measured artifact is frozen.

## Job 1 — SEAL (hosted, non-A-01)

A hosted runner creates one exact benchmark instance immediately before the run.

It must:

- generate the exact candidate fixture instance;
- generate randomized hidden evaluator cases using run-local cryptographic randomness;
- emit candidate assignment and writable manifest;
- compute SHA-256 identities for assignment, candidate fixture, hidden evaluator, and runner inputs;
- upload the candidate package and hidden evaluator as **separate** artifacts;
- pass only candidate-package identity plus deadline metadata to the A-01 job.

The exact hidden artifact must never be downloaded by the A-01 job.

## Job 2 — CODE (A-01 self-hosted)

The A-01 job must not checkout the System Master repository.

It receives only:

- the sealed candidate package;
- the candidate-visible assignment;
- the writable-path manifest;
- toolchain/runtime dependencies required for coding;
- the exact 1,800-second deadline.

At start it records the workspace Git identity and UTC timestamp. A-01 may inspect and mutate only the candidate workspace. On explicit submission or deadline, the runner terminates candidate mutation, freezes the workspace, captures final Git identity/diff/logs, hashes the frozen result, and uploads one final candidate artifact.

The workflow must not download, mount, print, or otherwise expose the hidden evaluator artifact in this job.

## Job 3 — EVALUATE (hosted, non-A-01)

Only after the CODE job has frozen and uploaded its result, a hosted evaluator downloads:

- the frozen candidate artifact;
- the separately preserved hidden evaluator artifact;
- the seal metadata.

It executes visible and hidden tests, concurrency/recovery/failure-safety probes, coverage, complexity, duplication, and scope-discipline analysis against the immutable frozen result. It then emits the machine-readable `a01.code-qualification-receipt.v1` and the raw evidence bundle.

## Sealing consequence

The generator implementation may be versioned in the repository, but the **exact benchmark instance and hidden cases are generated at run time** with run-local randomness. The exact hidden inputs/outputs therefore do not exist in the public repository before the run. Only their digest is exposed to the measured run.

## Invalidating conditions

The run is invalid if any of the following occurs:

- the A-01 job checks out or downloads the hidden evaluator artifact;
- exact hidden-case contents appear in CODE logs;
- the candidate artifact continues mutating after freeze/deadline;
- the evaluator operates on bytes different from the frozen artifact digest;
- exact seal/final identities cannot be reconciled;
- human assistance occurs during CODE.
