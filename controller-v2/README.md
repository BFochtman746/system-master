# System Master Controller 2.0

This directory is the clean-sheet rebuild of the GitHub Controller / Second Shift control system.

## Status

FOUNDATION-002 IN PROGRESS

## Boundary

Legacy governance, Second Shift, A-01, repair, qualification, and controller artifacts outside this directory are historical evidence and requirements inputs only. They are not runtime authority for Controller 2.0.

## Foundation invariants

1. Chat is never canonical controller state.
2. The System Master subject repository is never the controller database.
3. Subject SHAs are immutable identities.
4. Repair creates a new subject identity.
5. Execution, qualification, and promotion are separate state machines.
6. Workers cannot declare qualification or promotion.
7. Qualifiers cannot mutate the subject they qualify.
8. Logical commands are idempotent by caller-supplied command identity plus semantic fingerprint.
9. Mutation ownership uses a durable lease plus monotonically increasing fencing token.
10. Controller state transitions and outbox publication intent commit atomically.
11. GitHub workflow scheduling and concurrency are not correctness mechanisms.
12. Runtime controller state is transactional; GitHub receives a published projection and durable evidence.
13. Controller and policy versions are bound to every transaction.
14. Invalid state transitions are prevented by executable invariants wherever practical.

## Planned foundation layout

- `docs/` architecture decisions and contracts
- `schema/` SQLite migrations and canonical SQL schema
- `src/` controller-domain implementation
- `tests/` invariant, concurrency, recovery, and failure-injection tests

No legacy workflow, registry, or state file is automatically inherited into this architecture.
