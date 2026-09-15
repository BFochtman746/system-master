# A01-CODE-QUAL-001 Closure Checklist

This checklist is normative for declaring the first sealed A-01-hosted coding baseline valid.

- [ ] Candidate-visible fixture implemented in Java, Python, and JavaScript.
- [ ] Exact hidden evaluator instance implemented and inaccessible to the measured authoring subject before freeze.
- [ ] Fixture, assignment, evaluator, and manifest SHA-256 identities sealed before start.
- [ ] Fresh eligible System Master Second Shift ChatGPT scheduled development worker is bound as the authoring subject.
- [ ] Available authoring runtime/entrypoint, instruction digest, and tool-permission profile digest are captured; unavailable platform-managed model/reasoning metadata is recorded as unavailable rather than guessed.
- [ ] Candidate-only mutation/tool boundary is technically enforced rather than requested only by prompt.
- [ ] An external control boundary enforces a hard 1,800-second wall-clock deadline rather than relying on authoring-agent self-termination.
- [ ] Candidate mutation terminates at deadline or earlier explicit submission and the measured artifact is frozen.
- [ ] A-01 host identity and freeze/timing-corroboration evidence are captured without attributing authorship to A-01.
- [ ] No human assistance is permitted during the measured window.
- [ ] Starting and final Git SHAs are captured.
- [ ] Final diff and all candidate-created tests are preserved.
- [ ] Visible tests are captured separately from hidden tests.
- [ ] Hidden evaluator runs only after artifact freeze.
- [ ] Java, Python, and JavaScript coverage are measured on the frozen artifact.
- [ ] Structural complexity and duplication are measured on the frozen artifact.
- [ ] Concurrency/idempotency/recovery results are machine-readable.
- [ ] Validation/failure-safety results are machine-readable.
- [ ] Scope discipline is checked against manifest writable paths.
- [ ] First-pass and repair-iteration evidence is captured when observable.
- [ ] Machine-readable `a01.code-qualification-receipt.v1` includes authoring identity, candidate-isolation proof, deadline proof, and A-01 host evidence.
- [ ] Raw evidence artifact receives immutable identity and SHA-256 digest.
- [ ] Receipt digest binds the exact receipt payload.
- [ ] Repository Required Verification is green on the exact qualification head.
- [ ] A-01 Control Plane Enforcement is green on the exact qualification head.
- [ ] System File Lease Enforcement is green on the exact qualification head.
- [ ] First baseline result is reported dimension-by-dimension without an arbitrary composite pass threshold.

A missing item means the run is not closure evidence for `A01-CODE-QUAL-001`.
