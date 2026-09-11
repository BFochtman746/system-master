# CONTROLLER-FOUNDATION-002B — Deterministic Transaction Kernel

Status: **FOUNDATION CONTRACT FROZEN / QUALIFIED REFERENCE IMPLEMENTATION / NON-AUTHORITATIVE**

Incubator branch: `controller-v2/foundation-002b`
Original base subject: `cf331c362c1bfbf1cb41c2a298eb4853f541efc1`
Qualified code subject: `f15a5e7bfd910ed2239af954ee29ad42e9b866d7`
Hosted qualification run: `34652911433`

## Freeze meaning

Foundation 002B freezes the controller's transaction, fencing, semantic-event, durability-interface, recovery, identity, and worker-authority contracts. Later layers may implement transport, deployment, authentication, GitHub persistence, and Second Shift integration, but they may not weaken or reinterpret these invariants without explicitly reopening the foundation version.

This does **not** activate Controller 2.0, replace the legacy controller, modify `main`, dispatch Second Shift, mutate System Master product state, or grant qualification/promotion authority.

## Frozen invariants

1. One command identity maps to at most one logical transaction. Reuse with changed semantic contents fails closed.
2. Transaction success is controlled by an admission-time completion contract, never by a worker simply reporting success.
3. Operations use explicit legal state transitions. Direct controller-side success is forbidden when a typed worker result is required.
4. A READY operation must hold a live lease before RUNNING.
5. A lease is bound to the exact planned resource and carries a monotonically increasing fencing generation.
6. A stale, released, expired, replaced, or old-generation worker cannot mutate operation state.
7. Worker terminal result and lease release are one atomic controller transaction.
8. Second Shift workers receive a frozen bounded port exposing only heartbeat and typed result submission. They receive no database, transaction, journal-seal, qualification, promotion, policy, or subject-mutation authority.
9. Subject identity is `SubjectRef { algorithm, oid }`, not a hard-coded 40-character SHA field. Foundation supports canonical lowercase Git SHA-1 and SHA-256 identities.
10. Qualification and promotion bind to the exact SubjectRef. PASS for one subject cannot authorize another subject.
11. Qualification is observational. Promotion is a separately authorized external mutation.
12. Promotion cannot execute until its authorization event has crossed the durable-journal barrier.
13. Ambiguous external mutation is reconciled by observation before any reapply.
14. A restart from local `EXECUTING` promotion state observes external reality before applying again.
15. Semantic events are immutable, schema-versioned, canonically hashed, per-stream versioned, and predecessor-linked.
16. The durable journal additionally forms one controller-wide monotonically positioned SHA-256 hash chain.
17. Journal append uses compare-and-swap checkpoint semantics `{size, head_digest}` so stale writers cannot silently fork history.
18. Journal admission verifies the semantic event bytes, per-stream predecessor/version, and global predecessor before granting durability.
19. Pending outbox publication follows local transactional append order, never wall-clock timestamps. Clock rollback cannot reorder history.
20. Lost journal acknowledgement is resolved by observing the immutable event before retrying.
21. Whole-stream omission/middle deletion is detected by the global journal chain. Tail truncation is detected when compared with an independently anchored checkpoint.
22. Disaster recovery accepts globally committed journal entries, not an arbitrary bag of local events.
23. Recovery reconstructs executable controller state, not only a dashboard projection.
24. Active leases are never resurrected after store loss. Fencing generations survive; orphaned RUNNING/VERIFYING work is staled and replaced under a new operation identity.
25. SQLite backups are point-in-time copies and are independently integrity-checked. A backup is a recovery accelerator, not the semantic authority.
26. Database migrations are versioned and transactional. Legacy v1 data is migrated through v2/v3 without SubjectRef loss; failed migration rolls back rather than leaving a partially migrated store.
27. Controller timestamps use a deterministic UTC ingress profile with explicit calendar/time validation.
28. Controller v1 has one writable controller process per transactional state store. Multi-controller HA requires a separate distributed-leadership design and is not implied by SQLite.
29. The trusted controller process is the authority boundary. Internal kernel/database maintenance hooks are not Second Shift interfaces and must never cross the process/service boundary.
30. No qualification/evidence write is permitted to mutate the subject being qualified; the real durable journal and checkpoint live outside the System Master subject repository.

## Reference implementation

The incubator implementation uses Node.js and `node:sqlite` with WAL, foreign keys, full synchronization, transactional migrations, transactional outbox, semantic replay, verified backup, and a transport-neutral durable-journal interface.

Node 22 still labels `node:sqlite` experimental. Node 24 is the intended baseline for the next layer; the storage adapter remains replaceable and is not elevated into a protocol requirement.

## Qualification denominator

The final qualified subject executes **89 tests** covering:

- AP: bounded Second Shift worker authority port
- DJ: durable-journal publication, idempotency, outage/lost-ack handling, semantic admission, and clock rollback
- FI: SIGKILL/WAL rollback, separate-process contention, RFC 8785 vectors, UUIDv7 stress, restart/migration
- JI: whole-journal continuity, omitted-stream detection, tail checkpoint detection, stale-head/fork rejection, lost acknowledgement
- CF: transaction/operation/lease/fencing/outbox/qualification/promotion/replay authority rules
- MG: lossless legacy migration and atomic failed-migration rollback
- PP: deterministic timestamps and SHA-1/SHA-256 SubjectRef validation
- RC: executable disaster rebuild, promotion restart reconciliation, fencing recovery, SHA-256 recovery, rejection of uncommitted event bags
- SM: verified point-in-time backup and restore behavior

Hosted GitHub Actions result on exact qualified subject `f15a5e7bfd910ed2239af954ee29ad42e9b866d7`:

- Node.js 22: **89/89 PASS**
- Node.js 24: **test step PASS on the same exact subject**
- CI workflow permissions: `contents: read`
- checkout/setup-node actions pinned to immutable commit SHAs

## Defects found and corrected during 002B

The build was intentionally allowed to fail under adversarial testing. Defects found included SQL placeholder mismatches, raw database exposure through the original worker callback, helper-test auto-discovery, first-bootstrap contention conflated with command idempotency, worker-result replay drift, promotion restart ambiguity, unreleased terminal leases, missing reconciliation events, recovery insert arity, completion-contract loss on recovery, hard-coded SHA-1 identity, wall-clock outbox ordering, per-stream-only omission blindness, and semantic events being accepted into the journal without admission-time digest verification.

Each defect was repaired at the invariant or architecture level and then regression-tested; none was solved by weakening its failing test.

## Explicit 002B exclusions / successor obligations

The following are **not defects left inside the frozen 002B contract**. They are separate layers that must be completed before Controller 2.0 becomes authoritative:

### CONTROLLER-FOUNDATION-002C — GitHub Durable Journal + External Checkpoint Anchor

Research, design, implement and qualify the real remote DurableJournal adapter. It must preserve 002B's CAS head, immutable event identity, whole-journal chain, idempotent lost-ack recovery, and external checkpoint semantics without writing into the System Master subject repository.

### Later layers

- dedicated Controller repository/workflow isolation from legacy A-01 triggers
- protected journal/checkpoint refs and explicit no-bypass/force-push/delete policy
- authenticated controller service/API/IPC boundary
- Second Shift transport and worker enrollment
- controller process ownership/supervision and crash restart
- repository subject adapter, qualifier adapter, and promotion adapter
- Windows qualification on the intended Second Shift host
- secrets/credential lifecycle and least-privilege GitHub App permissions
- operational observability, backup scheduling, restore drills, upgrade/rollback packaging
- independent security review and threat-model qualification

## Freeze rule

002B may only be reopened by a versioned architecture change with a named incompatibility and new qualification denominator. 002C and later work must consume these contracts rather than editing Foundation 002B ad hoc.

**Exact next operation:** `CONTROLLER-FOUNDATION-002C — GITHUB DURABLE JOURNAL / CHECKPOINT ANCHOR EXHAUSTIVE RESEARCH → THREAT MODEL → DESIGN DECISION → FAILURE DENOMINATOR → IMPLEMENTATION`.
