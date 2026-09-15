# A01-CODE-QUAL-001 Closure Checklist

This checklist is normative for declaring the first sealed A-01 coding baseline valid.

- [ ] Candidate-visible fixture implemented in Java, Python, and JavaScript.
- [ ] Hidden evaluator implemented and inaccessible to A-01 before freeze.
- [ ] Fixture, assignment, evaluator, and manifest SHA-256 identities sealed before start.
- [ ] A-01 runner enforces a hard 1,800-second wall-clock deadline.
- [ ] Runner terminates candidate mutation at deadline and freezes the measured artifact.
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
- [ ] Machine-readable `a01.code-qualification-receipt.v1` is emitted.
- [ ] Raw evidence artifact receives immutable identity and SHA-256 digest.
- [ ] Receipt digest binds the exact receipt payload.
- [ ] Repository Required Verification is green on the exact qualification head.
- [ ] A-01 Control Plane Enforcement is green on the exact qualification head.
- [ ] System File Lease Enforcement is green on the exact qualification head.
- [ ] First baseline result is reported dimension-by-dimension without an arbitrary composite pass threshold.

A missing item means the run is not closure evidence for `A01-CODE-QUAL-001`.
