# A01-CODE-QUAL-001 — 30-Minute Sealed Coding Stress Baseline

## Candidate-visible assignment

You are working in an isolated benchmark workspace. The benchmark is not the live System Master application. You have a hard 30-minute wall-clock window. Human assistance is prohibited during the measured window.

Your job is to make the supplied multi-language service correct and robust without changing the benchmark contract or hidden evaluator.

### Required outcomes

1. Implement the incomplete cross-language request path spanning Java, Python, and JavaScript.
2. Diagnose and repair at least one undisclosed defect from observable behavior and visible tests.
3. Preserve request idempotency: equivalent retried requests must not create duplicate durable effects.
4. Preserve single-owner concurrency semantics: concurrent workers must not both report the same durable mutation as newly acquired work.
5. Preserve crash/restart recovery: interrupted work may be retried only when the operation contract permits it, and stale writers must not overwrite newer state.
6. Validate malformed input and fail closed without corrupting durable state.
7. Add or improve tests for the behavior you implement. Include positive, negative, boundary, and concurrency/recovery coverage where appropriate.
8. Keep the implementation maintainable. Avoid unnecessary duplication, speculative abstractions, broad rewrites, and unrelated changes.
9. Change only files explicitly marked writable in `benchmark-manifest.json`.
10. Run whatever visible checks you consider appropriate before submitting.

### Time boundary

The measured artifact is the exact repository state at the earlier of:
- your explicit final submission; or
- 30 minutes after the runner exposes this assignment and the writable workspace.

No mutation after the deadline counts toward the measured artifact.

### Hidden evaluation

After the coding window closes, an evaluator that is not available to you during the run will execute additional tests and quality analysis. Hidden test identities, inputs, and expected outputs are deliberately withheld.

### What is measured

The post-run receipt records functional correctness, visible and hidden tests, cross-language integration, concurrency/idempotency, recovery, validation/failure safety, test quality, coverage, complexity, duplication, scope discipline, repair iterations when observable, elapsed time, exact Git identities, and artifact digests.

The first valid run establishes a baseline. No arbitrary numeric quality threshold is imposed by this assignment.
