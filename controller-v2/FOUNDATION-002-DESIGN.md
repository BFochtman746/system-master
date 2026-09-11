# CONTROLLER-FOUNDATION-002 — Transactional Data Model

Status: IMPLEMENTED PROTOTYPE / NOT YET PROMOTED

## Scope

This foundation establishes the controller's canonical runtime state model. It does not yet execute GitHub mutations or Second Shift work.

## Architecture decisions

1. Canonical runtime state is a local SQLite database owned by the controller service.
2. The database must be stored on a local filesystem on the controller host; WAL databases are not placed on a network filesystem.
3. SQLite runs with WAL journaling, synchronous=FULL, foreign_keys=ON, trusted_schema=OFF, mmap disabled, and cell-size checking enabled.
4. All state-changing controller operations use explicit BEGIN IMMEDIATE transactions.
5. Git objects are immutable identities keyed by repository + hash algorithm + digest. Source/candidate/controller/policy are roles assigned by references, not intrinsic object types.
6. Caller command IDs are immutable idempotency keys. A repeated ID with identical semantic payload returns the existing transaction; the same ID with different semantic payload fails.
7. Logical transactions and execution attempts are separate. Retries create new attempts under the same logical transaction.
8. Execution, qualification, and promotion are separate state machines.
9. One active attempt is allowed per logical transaction.
10. One active mutation lease is allowed per protected resource using a partial unique index.
11. Lease acquisition increments a persistent per-resource fencing token. Old tokens never regain authority.
12. Controller events are append-only and receive a monotonic database sequence.
13. Publishable events are inserted into the outbox in the same database transaction as their state mutation.
14. External delivery is at-least-once; consumers must deduplicate by immutable event identity/sequence.
15. Incoming deliveries are deduplicated by source + delivery ID and payload fingerprint.
16. Applied migrations are checksum-locked. Editing an already-applied migration is a controller fault.
17. Backups use SQLite's online backup API and are integrity-checked.
18. Qualification cannot make a promotion eligible until the linked qualification is QUALIFIED.
19. The subject repository is never the controller database.
20. This code currently lives under `controller-v2/` only as a bootstrap location and is intended to move to a dedicated controller repository.

## State machines

### Logical transaction

RECEIVED -> VALIDATED -> ADMITTED -> PLANNED -> EXECUTING -> SUCCEEDED

Allowed alternate outcomes are REJECTED, BLOCKED, FAILED, and CANCELLED as constrained by database triggers.

### Execution attempt

CREATED -> CLAIMABLE -> CLAIMED -> RUNNING -> VERIFYING -> SUCCEEDED

An active attempt may terminate as FAILED, ABANDONED, or CANCELLED according to the trigger-defined transition graph.

### Qualification

PENDING -> QUALIFYING -> QUALIFIED | REJECTED | INDETERMINATE

INDETERMINATE may be retried by returning to QUALIFYING. Verdict states require evidence.

### Promotion

NOT_ELIGIBLE -> ELIGIBLE -> PROMOTING -> PROMOTED

Eligibility requires a QUALIFIED qualification. Promotion may enter FAILED and be retried through ELIGIBLE.

## Failure model

- Duplicate command: collapse to existing transaction.
- Duplicate command ID with altered intent: reject as idempotency conflict.
- Competing mutation workers: database uniqueness admits at most one live lease.
- Expired/replaced worker: fencing token rejects stale authority.
- Process crash before commit: state and outbox roll back together.
- Process crash after commit but before external publication: pending outbox row remains for retry.
- Process crash after publication but before marking published: publication may repeat; destination must deduplicate.
- Database restart: commands, transactions, leases, fences, events and outbox remain durable.
- Migration file mutation: startup fails with migration drift.
- Database integrity failure: startup fails closed.

## Storage policy

The authoritative SQLite database must not live inside the System Master Git working tree, a network share, or a cloud-synchronized working directory. GitHub receives projections/checkpoints; it is not the live transaction store.

## Implementation runtime

Python >= 3.13 using only the Python standard library for the foundation. Event sequence provides authoritative ordering, so sortable UUIDs are unnecessary to controller correctness. IDs currently use cryptographically random UUIDv4 values; a later API layer may adopt UUIDv7 without changing storage semantics.

## Research basis

- SQLite isolation and BEGIN IMMEDIATE: https://www.sqlite.org/isolation.html and https://www.sqlite.org/lang_transaction.html
- SQLite WAL: https://www.sqlite.org/wal.html
- SQLite synchronous durability: https://www.sqlite.org/pragma.html#pragma_synchronous
- SQLite STRICT tables: https://www.sqlite.org/stricttables.html
- SQLite foreign keys: https://www.sqlite.org/foreignkeys.html
- SQLite partial unique indexes: https://www.sqlite.org/partialindex.html
- SQLite defensive guidance: https://www.sqlite.org/security.html
- SQLite online backup API: https://www.sqlite.org/backup.html
- Transactional outbox: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html
- Idempotent APIs/retries: https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/
- UUID standard: https://www.rfc-editor.org/rfc/rfc9562.html

## Current prototype acceptance

The local prototype has passed tests for:

- identical command retry -> one logical transaction,
- same command ID + altered semantic payload -> rejection,
- database rejection of illegal logical-transaction transitions,
- immutable Git-object identity,
- append-only controller events,
- atomic state/outbox rollback on simulated pre-commit crash,
- one live mutation lease per resource,
- stale fencing rejection after lease turnover,
- concurrent duplicate-command submission,
- concurrent lease competition,
- restart-preserved idempotency,
- inbound delivery deduplication,
- migration checksum drift detection,
- consistent online backup,
- prohibition of promotion eligibility before qualification.

No claim is made yet that Foundation-002 is production-qualified. The next gate is repository verification plus deeper fault/property testing and controller API design.
