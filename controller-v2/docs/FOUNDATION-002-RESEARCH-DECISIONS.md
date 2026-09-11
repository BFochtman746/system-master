# CONTROLLER-FOUNDATION-002 — Research Decisions

Status: ACTIVE IMPLEMENTATION BASELINE — proof-boundary hardening required before freeze

## Purpose

Define the transactional runtime model for Controller 2.0 before any Second Shift or qualification orchestration is rebuilt. Legacy Controller/Second Shift branches are requirements evidence only.

## Accepted decisions

1. **Runtime authority is transactional, not Git-backed.** SQLite is the v1 runtime authority. GitHub receives projections/evidence; Git is not the locking or transaction mechanism.
2. **SQLite runs locally on one controller host.** WAL is permitted only with the database and all SQLite writers/readers on the same host. A network filesystem is forbidden for the live database.
3. **Durability profile is WAL + synchronous=FULL.** Foreign-key enforcement is enabled on every connection. STRICT tables are required.
4. **Mutations use explicit write transactions.** State-changing operations use `BEGIN IMMEDIATE`.
5. **Commands are caller-identified and immutable.** `command_id` is reused for retries. The semantic fingerprint includes caller intent and immutable target repository/subject identity. Controller/policy runtime versions are transaction bindings, not command identity; a retry returns the originally pinned transaction.
6. **Canonical payloads use Controller Canonical JSON Profile v1.** V1 deliberately forbids floating point numbers, restricts object keys to printable ASCII, preserves UTF-8 strings, sorts keys and removes insignificant whitespace. This is a deterministic controller profile; it is **not claimed to be a general RFC 8785/JCS implementation** until conformance vectors prove that claim.
7. **Identifiers use UUIDv7 where the controller creates globally unique IDs.** Database-local monotonic ordering uses integer sequences.
8. **Events are immutable facts.** Every accepted state mutation emits an immutable controller event in the same database transaction.
9. **External publication uses a transactional outbox.** Delivery is at-least-once; destinations deduplicate by event ID. Webhooks may provide low-latency signals later but are never the sole recovery/correctness path.
10. **Three independent state machines.** Execution success does not imply qualification; qualification does not imply promotion.
11. **State assertions are proof-bound.** `SUCCEEDED`, terminal qualification verdicts and `PROMOTED` must be derivable from matching attempt/result/evidence records; generic state setters cannot manufacture proof.
12. **One live mutation lease per protected resource.** A unique partial index enforces this structurally.
13. **Every lease has a monotonically increasing fencing token.** Result acceptance checks the current resource fence as well as the lease.
14. **Expired leases are non-revivable.** A heartbeat after expiry fails even if no replacement worker has yet claimed the resource.
15. **Subject identity is immutable.** A transaction binds one base subject and at most one candidate; repair creates new lineage.
16. **Git object format is explicit.** Subjects store object format (`sha1` or `sha256`) plus OID.
17. **State transitions are constrained in the database.** SQL triggers reject invalid transitions and immutable identity mutation.
18. **Worker trust class is executable policy.** Second Shift can execute bounded mutation; qualifiers are read-only with respect to subjects; promoters are distinct authority.
19. **External side effects are reconciled.** Ambiguous timeouts become UNKNOWN/reconciliation work before unsafe retry.
20. **No scheduler ordering assumption.** GitHub Actions concurrency is not a controller lock.
21. **Schemas are append-only migrations once applied.** Migration source checksums are recorded and verified; upgrades are contiguous.
22. **No temporary workflow files.** Stable launchers receive subject/transaction identity as data.
23. **The controller must reconcile external truth.** GitHub events can be missed or duplicated, so periodic read/reconciliation remains mandatory even if webhooks are adopted.

## Runtime/language decision

Python 3.14 remains the v1 implementation language. The reason is operational simplicity for the user's single Windows controller host and the standard-library SQLite binding, not a claim that Python is intrinsically more reliable than Go/Rust. Go remains a future packaging option, but its SQLite path adds either CGO/toolchain requirements or a third-party pure-Go SQLite implementation. The reliability boundary is the database protocol, state machine, permissions and tests—not the language alone.

## Rejected for v1

Git files as the primary runtime database; GitHub Actions concurrency as a lock; pure event sourcing without materialized state; Temporal/Kafka/Redis/PostgreSQL before scale/availability requires them; multiple networked writers against one SQLite/WAL file; temporary workflow commits; webhooks as the only trigger/recovery mechanism; state transitions whose proof exists only in prose or tests.

## Failure model

The foundation must survive process crash, OS/power loss, duplicate command submission, duplicate/missed event delivery, delayed/out-of-order worker result, zombie worker after lease expiry, concurrent chats, GitHub timeout before/after a remote effect, runner interruption, controller restart, stale projection, and controller/policy upgrades during outstanding work.

## Current branch reconciliation

`controller-v2/foundation-002` is the sole active Foundation-002 integration line. `controller-v2-foundation`, `controller-v2/foundation-002-rebuild`, and `reliability/second-shift-controller-v2-20260911` are source/evidence branches until explicitly adjudicated. Useful ideas may be transplanted only with tests; their architecture is not inherited wholesale.
