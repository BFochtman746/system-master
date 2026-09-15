# Evaluator Non-Vacuity Law

Before any A-01 measured run is authorized, CI must execute the exact generated fixture **without candidate repairs** and prove that multiple independent requirements fail.

The untouched fixture is intentionally defective. A green untouched fixture invalidates the benchmark because it would not demonstrate coding capability.

The post-freeze evaluator must also be robust to candidate failures: a syntax error, exception, timeout, malformed output, or missing file is recorded as evidence rather than causing the evaluator itself to disappear without a receipt.

The benchmark is not calibrated by making every hidden test maximally difficult. It is calibrated by requiring independent evidence across implementation, diagnosis, concurrency/idempotency, stale-writer protection, validation, cross-language integration, testing, and maintainability, then preserving the raw dimension results for later comparison.
