# CONTROLLER-FOUNDATION-002 — Research Decisions

Status: DRAFT IMPLEMENTATION BASELINE

## Purpose

Define the transactional runtime model for Controller 2.0 before any Second Shift or qualification orchestration is rebuilt.

## Accepted decisions

1. **Runtime authority is transactional, not Git-backed.** SQLite is the v1 runtime authority. GitHub receives projections/evidence; Git is not used as the locking or transaction mechanism.
2. **SQLite runs locally on one controller host.** WAL mode is permitted only with the database and all SQLite writers/readers on the same host. A network filesystem is forbidden for the live database.
3. **Durability profile is WAL + synchronous=FULL.** Controller state is more important than write throughput. Foreign-key enforcement is enabled on every connection. STRICT tables are required.
4. **Mutations use explicit write transactions.** State-changing controller operations use `BEGIN IMMEDIATE` so writer contention is detected before partial work is attempted.
5. **Commands are caller-identified and immutable.** `command_id` is caller-supplied/generated once. Retries reuse it. A semantic fingerprint is derived from RFC 8785 canonical JSON and SHA-256.
6. **Identifiers use UUIDv7 where the controller creates globally unique IDs.** Database-local monotonic ordering uses integer sequences, not UUID lexical order.
7. **Events are immutable facts.** Every accepted state mutation emits an immutable controller event in the same database transaction.
8. **External publication uses a transactional outbox.** Event creation and outbox insertion occur atomically. Delivery is at-least-once; destinations must deduplicate by event ID.
9. **CloudEvents-compatible event envelope.** Internal events carry event ID, source, type, subject, time, spec version, data schema/version, sequence, transaction ID and canonical payload digest. Full CloudEvents transport compliance is not required for v1, but field semantics stay compatible.
10. **Three independent state machines.** Execution, qualification and promotion are modeled separately. Execution success does not imply qualification; qualification does not imply promotion.
11. **One live mutation lease per protected resource.** A unique partial index enforces this structurally.
12. **Every lease has a monotonically increasing fencing token.** Stale/zombie workers cannot commit controlled side effects with an older token.
13. **Subject identity is immutable.** A transaction may bind a base subject and later one candidate subject. Once a candidate object ID is bound, it cannot be changed. Repair creates a new transaction/candidate lineage.
14. **Git object format is explicit.** Subject identity stores object format (`sha1` or `sha256`) plus OID rather than assuming 40-character SHA-1 forever.
15. **State transitions are constrained in the database.** SQL triggers reject invalid execution/qualification/promotion transitions and reject mutation of immutable identity fields.
16. **External side effects are reconciled.** An operation that times out after an uncertain remote effect must be resolved by read-after-write/reconciliation before retrying a non-idempotent side effect.
17. **No scheduler ordering assumption.** GitHub Actions concurrency may reduce overlap but never supplies controller correctness.
18. **Errors are machine-coded.** Future HTTP API errors will follow RFC 9457 Problem Details while preserving stable controller error codes.
19. **Schemas are versioned.** Command/event payloads use explicit schema versions and JSON Schema 2020-12 definitions at the API boundary.
20. **No temporary workflow files.** Workflows are stable/pinned launchers; subject and transaction identity are data.

## Rejected alternatives for v1

- Git repository files as the primary runtime database.
- GitHub Actions concurrency as a lock.
- Pure event sourcing with no materialized state tables.
- Distributed database / Kafka / Redis / Temporal before scale or availability requirements justify them.
- Multiple controller writers across machines against one SQLite/WAL file.
- Reusing a completed/failed transaction as the identity of a repaired subject.

## Legacy concepts retained only as requirements evidence

The legacy controller correctly identified exact-head binding, leases, heartbeats, idempotency, fail-closed execution, finite retries and explicit authority boundaries. Controller 2.0 reimplements those concepts as transactional invariants rather than cross-file conventions.

## Failure model assumed by the foundation

- process crash at any instruction boundary
- OS crash or sudden power loss
- duplicate command submission
- duplicate event delivery
- delayed/out-of-order worker result
- zombie worker after lease expiry
- concurrent chats submitting conflicting work
- GitHub API timeout before/after a remote effect
- runner interruption
- controller restart
- evidence publisher interruption
- stale GitHub projection
- policy/controller upgrade during outstanding work

Every later subsystem must preserve the invariants established here under those failures.
