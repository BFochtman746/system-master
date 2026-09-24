# Runner Requirements

The A01-CODE-QUAL-001 runner is responsible for enforcement, not scoring policy.

Required sequence:

1. Verify the sealed assignment, manifest, candidate fixture, hidden evaluator, and runner digests.
2. Create an isolated writable candidate workspace from the sealed candidate fixture.
3. Record `starting_git_sha` and UTC start time.
4. Expose only the candidate assignment, manifest, candidate workspace, and permitted toolchain to A-01.
5. Arm a hard 1,800-second deadline.
6. Capture runner-visible command/test events when available without exposing hidden evaluator data.
7. On explicit submission or deadline, terminate candidate mutation and freeze the workspace.
8. Record UTC stop time, elapsed seconds, final Git SHA, and exact diff.
9. Only after freeze, make the hidden evaluator available to the evaluation process.
10. Run visible/hidden tests and post-run quality tools against the frozen artifact.
11. Check writable-path scope against the benchmark manifest.
12. Emit `a01.code-qualification-receipt.v1` and raw evidence.
13. Hash the receipt payload and evidence bundle and preserve immutable artifact identity.

Fail closed to `INVALID_RUN` if hidden material becomes visible before freeze, the deadline is not enforced, post-deadline mutation is admitted, required identities are missing, or evidence preservation fails.
