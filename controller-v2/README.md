# System Master Controller 2.0

This directory is a bootstrap workspace for the clean-sheet GitHub Controller / Second Shift rebuild.

## Boundary

- This code is **controller infrastructure**, not System Master product code.
- The current repository is being used temporarily as a bootstrap host until the controller is moved to its own repository.
- Nothing under `controller-v2/` is authoritative over the existing product repository unless explicitly promoted by a later migration step.
- Legacy controller, A-01, Second Shift, governance, repair, and qualification files are requirements/evidence sources only.

## Foundation invariants

1. Chat is never canonical controller state.
2. The subject repository is never the controller database.
3. Every command has an immutable caller-generated identity and semantic fingerprint.
4. Retries are idempotent.
5. Subject SHAs are immutable; repair creates a new subject.
6. Execution, qualification, and promotion are distinct state machines.
7. Workers cannot declare qualification or promotion.
8. Qualifiers cannot mutate the subject they qualify.
9. One active mutation lease exists per protected resource, enforced transactionally.
10. Every lease carries a monotonically increasing fencing token.
11. State mutation and outbox publication intent commit atomically.
12. Published projections carry monotonic sequence and freshness metadata.
13. Invalid state transitions are rejected, not merely detected later.

## Foundation-002

`CONTROLLER-FOUNDATION-002` defines and implements:

- the SQLite canonical runtime state store,
- command idempotency,
- immutable subjects,
- logical transactions and execution attempts,
- lease/fencing semantics,
- append-only controller event log,
- transactional outbox,
- inbox deduplication,
- qualification and promotion state separation,
- forward-only schema migrations,
- crash/restart and integrity rules.
