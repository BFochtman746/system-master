# A01-CODE-QUAL-001 Execution Architecture

The measured authoring subject is the fresh System Master Second Shift ChatGPT scheduled development worker. A-01 is the controlled Windows/X64 host used for execution corroboration, timing evidence, artifact freeze, and qualification support; A-01 itself is not credited as the code author.

The benchmark uses separated stages so the authoring worker never receives the exact hidden evaluator instance before its measured artifact is frozen.

## Stage 1 — SEAL (hosted, non-authoring)

A trusted non-candidate stage creates one exact benchmark instance immediately before the run.

It must:

- generate the exact candidate fixture instance;
- generate randomized hidden evaluator cases using run-local cryptographic randomness;
- emit candidate assignment and writable manifest;
- compute SHA-256 identities for assignment, candidate fixture, hidden evaluator, and runner inputs;
- preserve candidate package and hidden evaluator as separate evidence objects;
- expose only candidate-package identity plus deadline metadata to the authoring bridge.

The exact hidden artifact must never be supplied to the authoring worker.

## Stage 2 — CODE (fresh Second Shift ChatGPT authoring worker)

A fresh scheduled ChatGPT development task is the measured authoring subject. It must not be the development session that built or inspected the hidden evaluator.

It receives only:

- the sealed candidate package;
- the candidate-visible assignment;
- the writable-path manifest;
- the tools required to inspect, edit, and test that isolated candidate package;
- the exact 1,800-second deadline.

The authoring bridge must record the available subject identity before coding begins, including provider/runtime, authoring entrypoint, project/system instruction digest, tool-permission profile digest, and model/reasoning metadata when the platform exposes them. Unavailable platform-managed metadata is recorded as unavailable rather than guessed.

The bridge must enforce two controls rather than relying only on prompt compliance:

1. **hard deadline control** — candidate mutation stops at 1,800 wall-clock seconds or explicit earlier submission; and
2. **candidate-only isolation** — the authoring worker cannot inspect the hidden evaluator instance or mutate live System Master production paths.

At start, the bridge records candidate identity and UTC time. At submission/deadline it prevents further candidate mutation and hands the exact authoring output to the freeze stage.

Current ChatGPT scheduled-task automation proves a callable authoring entrypoint exists, but it does not yet expose an external hard-kill primitive or a technically enforced candidate-only tool/filesystem sandbox. Until both controls are proven, the first sealed run remains blocked rather than downgraded to prompt-only isolation.

## Stage 3 — FREEZE / HOST CORROBORATION (A-01)

A-01 receives only the candidate-visible starting identity and the completed authoring output; it does not receive the hidden evaluator instance before freeze.

A-01 must:

- verify the expected candidate starting identity;
- record A-01 runner, OS, architecture, and toolchain identity;
- verify the authoring bridge start/stop evidence and deadline result;
- materialize the final candidate into the isolated benchmark workspace;
- capture final Git identity/diff/logs available from the authoring bridge;
- freeze the candidate bytes and compute the immutable candidate digest;
- reject late/post-deadline mutations from the measured artifact.

A-01 qualification/execution evidence corroborates the measured artifact and boundary. It is not evidence that A-01 authored the code.

## Stage 4 — EVALUATE (hosted, non-authoring)

Only after the candidate artifact is frozen does the evaluator receive:

- the frozen candidate artifact;
- the separately preserved exact hidden evaluator instance;
- seal metadata;
- authoring-identity evidence;
- A-01 freeze/timing evidence.

It executes visible and hidden tests, concurrency/recovery/failure-safety probes, coverage, complexity, duplication, and scope-discipline analysis against the immutable frozen result. It then emits the machine-readable `a01.code-qualification-receipt.v1` and raw evidence bundle.

## Sealing consequence

The generator implementation may be versioned in the repository, but the **exact benchmark instance and hidden cases are generated at run time** with run-local randomness. The exact hidden inputs/outputs therefore do not exist before the run. The measured authoring subject receives no exact hidden instance.

## Invalidating conditions

The run is invalid if any of the following occurs:

- the measured authoring session has previously inspected the hidden evaluator implementation or the exact hidden run material;
- the authoring bridge exposes the exact hidden evaluator instance before freeze;
- the authoring worker can mutate live System Master production paths during the measured run;
- the 1,800-second deadline is merely requested rather than externally enforced;
- the candidate artifact continues mutating after freeze/deadline;
- the evaluator operates on bytes different from the frozen artifact digest;
- exact seal, authoring, A-01 freeze, and final identities cannot be reconciled;
- human assistance occurs during CODE;
- A-01 execution is mislabeled as A-01 code authorship.
