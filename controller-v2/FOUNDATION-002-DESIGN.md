# CONTROLLER-FOUNDATION-002 — Transactional Data Model

Status: HOSTED TESTED PROTOTYPE BASELINE / PRODUCTION AUTHORITY NOT GRANTED

## Scope

This foundation establishes the controller's canonical runtime state model. It does not yet execute GitHub mutations or Second Shift work.

## Architecture decisions

1. Canonical runtime state is a local SQLite database owned by the controller service.
2. The database must be stored on a local filesystem on the controller host; WAL databases are not placed on a network filesystem.
3. SQLite runs with WAL journaling, synchronous=FULL, foreign_keys=ON, trusted_schema=OFF, mmap disabled, and cell-size checking enabled.
4. All state-changing ControllerStore operations use explicit BEGIN IMMEDIATE transactions.
5. Git objects are immutable identities keyed by repository + hash algorithm + digest. Source/candidate/controller/policy are roles assigned by references, not intrinsic object types.
6. Caller command IDs are immutable idempotency keys. The semantic fingerprint binds caller, command type, canonical payload, base subject, controller subject, and policy subject.
7. A repeated command ID with the same semantic envelope returns the existing transaction; the same ID with a different envelope fails closed.
8. Logical transactions and execution attempts are separate. Retries create new attempts under the same logical transaction.
9. Execution, qualification, and promotion are separate state machines.
10. One active attempt is allowed per logical transaction.
11. One active mutation lease is allowed per protected resource using a partial unique index.
12. Lease authority is `(authority_epoch, fencing_token)`, not a fencing number alone.
13. Lease acquisition increments a persistent per-resource fencing token. Old tokens never regain authority inside an authority epoch.
14. Restored state begins a new authority epoch above the remote high-water and revokes all restored live leases.
15. Controller events are append-only and receive a monotonic database sequence plus authority epoch.
16. Publishable events are inserted into the outbox in the same database transaction as the ControllerStore state mutation that produced them.
17. External delivery is at-least-once; consumers must deduplicate by immutable event identity and authority position.
18. Incoming deliveries are deduplicated by source + delivery ID and payload fingerprint.
19. Applied migrations are append-only and checksum locked. Editing an already-applied migration is a controller fault.
20. Backups use SQLite's online backup API and are integrity checked.
21. Qualification cannot make a promotion eligible until the linked qualification is QUALIFIED.
22. Direct database inserts cannot start transactions, attempts, leases, qualifications, promotions, inbox items, or outbox items in later states.
23. Attempt, lease, qualification, promotion, transaction, subject, command, event, migration, inbox, and fencing identities are protected against prohibited rewrites.
24. Candidate binding is one-way and may occur only while a logical transaction is EXECUTING.
25. An execution attempt cannot become CLAIMED/RUNNING/VERIFYING/SUCCEEDED/FAILED without the required active lease relationship.
26. The subject repository is never the controller database.
27. A fencing token is useful only when the protected resource gateway enforces it; workers therefore may not receive canonical/shared-ref write authority.
28. This code currently lives under `controller-v2/` only as a bootstrap location and is intended to move to a dedicated controller repository.

## State machines

### Logical transaction

RECEIVED -> VALIDATED -> ADMITTED -> PLANNED -> EXECUTING -> SUCCEEDED

Allowed alternate outcomes are REJECTED, BLOCKED, FAILED, and CANCELLED as constrained by database triggers.

### Execution attempt

CREATED -> CLAIMABLE -> CLAIMED -> RUNNING -> VERIFYING -> SUCCEEDED

An active attempt may terminate as FAILED, ABANDONED, or CANCELLED according to the trigger-defined transition graph. Lease expiry or authority recovery abandons the affected live attempt before replacement work can proceed.

### Qualification

PENDING -> QUALIFYING -> QUALIFIED | REJECTED | INDETERMINATE

INDETERMINATE may be retried by returning to QUALIFYING. Verdict states require evidence.

### Promotion

NOT_ELIGIBLE -> ELIGIBLE -> PROMOTING -> PROMOTED

Eligibility requires a QUALIFIED qualification. Promotion may enter FAILED and be retried through ELIGIBLE.

## Failure model

- Duplicate command: collapse to existing transaction.
- Duplicate command ID with altered caller, subject, controller, policy, command type, or payload: reject as idempotency conflict.
- Competing mutation workers: database uniqueness admits at most one live lease.
- Expired/replaced worker: authority epoch + fencing token rejects stale authority.
- Expired lease: associated active attempt becomes ABANDONED before replacement claim proceeds.
- Process crash before commit: state and outbox roll back together.
- Process crash after commit but before external publication: pending outbox row remains for retry.
- Process crash after publication but before local acknowledgement: publication may repeat; destination must deduplicate.
- Database restart: commands, transactions, leases, fences, events and outbox remain durable.
- Restore from an older backup: compare with remote high-water, revoke live leases, advance authority epoch, then republish from the new epoch.
- Migration file mutation: startup fails with migration drift.
- Database integrity failure: startup fails closed.
- GitHub scheduling/reordering: must not determine controller correctness.
- GitHub ref conflict: must become reconciliation, never force overwrite.

## Storage policy

The authoritative SQLite database must not live inside the System Master Git working tree, a network share, or a cloud-synchronized working directory. GitHub receives projections/checkpoints; it is not the live transaction store.

## Implementation runtime

Python >= 3.13 using only the Python standard library for the foundation. Event sequence provides authoritative ordering inside an epoch, so sortable UUIDs are unnecessary to controller correctness. IDs currently use random UUIDv4 values; a later API layer may adopt UUIDv7 without changing storage semantics.

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
- Git reference non-force advancement: https://docs.github.com/en/rest/git/refs
- GitHub rulesets: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
- GitHub App installation tokens: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- Self-hosted runner security: https://docs.github.com/en/actions/reference/runners/self-hosted-runners

## Hosted prototype acceptance

The prototype was executed against the PR merge context on GitHub-hosted Ubuntu 24.04 with read-only repository permissions and checkout credential persistence disabled.

- CPython 3.13: 35/35 tests PASS.
- CPython 3.14: 35/35 tests PASS.
- Compile gate: PASS in both lanes.
- Pinned `actions/checkout`: PASS.
- Pinned `actions/setup-python`: PASS.

The suite covers command idempotency and conflict detection, immutable identities, illegal state-transition rejection, atomic state/outbox rollback, concurrent command collapse, concurrent lease competition, lease expiry, authority-epoch recovery, stale-fence rejection, migration drift, backup integrity, inbox deduplication, qualification/promotion separation, initial-state enforcement, and outbox single-transition acknowledgement.

Draft PR #52 was closed unmerged after qualification because the legacy System Master repository also launched old A-01 workflows on the PR. The branch remains the Controller 2.0 bootstrap workspace; main remains unchanged.

See `FOUNDATION-002-RED-TEAM.md` for the failure analysis and explicit residual obligations.

## Disposition

Foundation-002 is accepted as a **prototype dependency baseline** for Foundation-003.

It is not production-qualified, does not replace the legacy controller, and does not authorize Second Shift or canonical GitHub mutation. Those permissions cannot be granted until the external command/projection/write-gateway boundary is implemented and qualified.
