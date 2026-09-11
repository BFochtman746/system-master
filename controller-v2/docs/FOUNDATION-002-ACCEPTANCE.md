# CONTROLLER-FOUNDATION-002 — Acceptance Criteria

Foundation-002 is acceptable only when all of the following are true:

1. Runtime state is stored transactionally in SQLite, not inferred from Git files or chat history.
2. SQLite is configured with foreign keys enabled, WAL journal mode, FULL synchronous durability, and explicit write transactions.
3. Commands are immutable and idempotent by command ID plus semantic fingerprint.
4. Duplicate replay of the same command produces one logical transaction.
5. Reuse of a command ID with changed semantics is rejected.
6. Subject identity is immutable and includes explicit Git object format plus object ID.
7. Candidate identity is write-once for a transaction.
8. Repair/rebase/successor work creates explicit transaction lineage rather than rewriting an earlier transaction.
9. Execution, qualification, and promotion use independent state machines.
10. Qualification cannot start before a successful immutable candidate exists.
11. Promotion cannot become eligible before execution succeeds and qualification is QUALIFIED.
12. Exactly one active mutation lease may exist per protected resource.
13. Every lease is assigned a monotonically increasing fencing token.
14. CLAIMED/RUNNING/VERIFYING states require a live lease.
15. A stale or zombie worker cannot submit an accepted result after a newer fence exists.
16. State mutation and its controller event plus publication intent are committed in one SQLite transaction.
17. Controller events, subjects, commands, and evidence receipts are append-only/immutable.
18. Outbox delivery is at-least-once and has an irreversible PUBLISHED terminal state.
19. External side effects have durable PREPARED/INFLIGHT/UNKNOWN/reconciliation states.
20. Projection sequence cannot move backward.
21. Database transaction row versions cannot regress or skip their required increment on mutation.
22. Concurrent command replay converges to one transaction.
23. Concurrent lease acquisition has exactly one winner.
24. A process crash before COMMIT rolls back; a process crash after COMMIT preserves state.
25. Database integrity and foreign-key checks are clean after the full test suite.
26. No existing legacy controller/Second Shift/A-01 file is used as Controller 2.0 runtime authority.
27. No GitHub Actions workflow or branch scheduling behavior is relied upon for correctness.
28. The Foundation-002 code is isolated on `controller-v2-foundation`; `main` remains unchanged.

Passing these criteria freezes the data/transaction primitive layer only. It does not yet authorize Second Shift execution, qualification, GitHub promotion, or replacement of the legacy controller.
