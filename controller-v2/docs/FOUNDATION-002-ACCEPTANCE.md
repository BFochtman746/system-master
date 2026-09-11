# CONTROLLER-FOUNDATION-002 — Acceptance Criteria

Foundation-002 is acceptable only when every criterion below is demonstrated by executable tests and the exact candidate commit passes CI. A green test run cannot waive or weaken an invariant.

1. Runtime authority is transactional SQLite, not Git files or chat history.
2. SQLite uses foreign keys, WAL, FULL synchronous durability and explicit write transactions on a local controller host.
3. Commands are immutable and idempotent by command ID plus semantic target fingerprint.
4. Duplicate replay creates one logical transaction; retargeting the same command ID is rejected.
5. Repository identity collisions fail rather than being silently ignored.
6. Subject identity is immutable and includes explicit Git object format plus OID; candidate identity is write-once.
7. Repair/rebase/successor work creates explicit new transaction/subject lineage.
8. Execution, qualification and promotion are separate state machines.
9. A transaction cannot become `SUCCEEDED` without a successful execution attempt and matching `CANDIDATE_READY` result from the exact lease/fence.
10. An execution attempt cannot be inserted directly in a terminal success state.
11. A qualification terminal verdict cannot exist without a matching exact-candidate/exact-policy attempt and immutable qualification evidence receipt.
12. A transaction cannot become `QUALIFIED`, `REJECTED` or `INDETERMINATE` merely through a state setter.
13. Promotion cannot become eligible before proof-backed qualification and cannot become `PROMOTED` without a matching promotion attempt whose resulting target OID equals the qualified subject OID.
14. Exactly one active mutation lease may exist per protected resource.
15. Every lease has a monotonically increasing fencing token; result acceptance checks the current resource fence.
16. Expired leases cannot be renewed or revived, including before another worker acquires the resource.
17. A released/expired/superseded worker cannot submit an accepted result.
18. State mutation, controller event and required publication intent commit atomically.
19. Controller events, subjects, commands and evidence receipts are append-only/immutable.
20. Outbox publication is at-least-once and published records cannot silently reopen.
21. External side effects have durable PREPARED/INFLIGHT/UNKNOWN/reconciliation semantics.
22. Projection sequence cannot regress; stale projections are explicitly detectable.
23. Transaction row versions are monotonic and state transitions are database-guarded.
24. Concurrent command replay converges to one transaction; concurrent lease acquisition has one winner.
25. Crash-before-COMMIT rolls back; crash-after-COMMIT preserves state.
26. Applied migration source is checksum-pinned, contiguous and immutable; integrity and foreign-key checks pass after migration.
27. Worker kind/trust-class mismatches are rejected by the database.
28. No legacy Controller/Second Shift/A-01 file is runtime authority for Controller 2.0.
29. No GitHub scheduler ordering or webhook delivery guarantee is relied upon for correctness.
30. `controller-v2/foundation-002` is the sole active Foundation-002 integration line; competing branches remain evidence only.
31. CI runs against the exact commit on the canonical Foundation-002 branch and has read-only repository contents permission.
32. The true expired-worker test remains present; replacing expiry with graceful release is not equivalent coverage.

Passing these criteria freezes only the transactional kernel. It does not authorize Second Shift execution against production branches, GitHub promotion, or replacement of the legacy controller.
