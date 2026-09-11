# CONTROLLER-FOUNDATION-002B — Reference Transaction Engine

Status: PROVISIONAL IMPLEMENTATION / NOT FROZEN
Branch: `controller-v2/foundation-002b`
Base subject: `cf331c362c1bfbf1cb41c2a298eb4853f541efc1`

## Purpose

Build and test the smallest executable Controller 2.0 kernel before any Second Shift integration or System Master mutation is admitted.

## Implemented

- strict command-envelope validation
- deterministic canonical JSON hashing primitive
- UUIDv7 identity generation
- SQLite transactional execution store behind the kernel boundary
- one-command/one-transaction uniqueness
- operation state-transition guards
- one-active-lease-per-resource constraint
- lease generation/fencing
- typed worker result submission; no raw database access for workers
- semantic event streams with per-stream optimistic concurrency
- hash-linked event integrity checks
- transactional outbox records
- durable promotion-authorization barrier
- promotion ambiguity/reconciliation path
- exact-subject qualification-to-promotion binding
- projection/replay from semantic events
- fail-closed handling of unsupported event schemas

## Runtime topology invariant discovered during failure injection

Controller 2.0 v1 has exactly one writable controller service/process per transactional state store. Second Shift workers never open the SQLite database. They communicate through a bounded controller API/IPC surface and submit typed results only.

A replacement controller process may open the store only after the prior controller instance is stopped or declared dead by the later deployment/service-manager ownership mechanism. Multi-controller high availability is not implied by SQLite and is explicitly outside Foundation 002B; admitting multiple controller writers later requires a separately designed distributed leader/lease protocol.

The command-contention failure test therefore initializes the database under the single bootstrap owner before launching separate contending clients. Simultaneous first-time schema bootstrap is a separate deployment concern and is not used as a proxy for command-idempotency correctness.

## Test denominator and results

`controller-v2/test/kernel.test.js` defines CF-T001 through CF-T030 plus five additional state/security guards.

`controller-v2/test/failure-injection.test.js` adds seven destructive/concurrency tests:

- FI-T001 abrupt process death during an uncommitted write; reopen + rollback + integrity check
- FI-T002 real separate-process lease contention; exactly one active lease
- FI-T003 duplicate command contention after controlled bootstrap; one transaction identity
- FI-T004 RFC 8785 canonicalization sample
- FI-T005 RFC 8785/ECMAScript numeric edge serialization
- FI-T006 100,000 UUIDv7 uniqueness/version stress
- FI-T007 file-backed restart and migration idempotency

Current executable denominator: **42 tests**.

Hosted GitHub Actions verification on exact branch subject `d4d5b45f71f8f75e0b29b23dc9b9fa525c710de9`:

- Node.js 22: **PASS**
- Node.js 24: **PASS**
- both jobs executed the complete Controller v2 kernel/failure-injection suite successfully

Node 22 continues to emit Node's ExperimentalWarning for `node:sqlite`. The intended production compatibility target remains Node.js 24 LTS, where `node:sqlite` is release-candidate status. The storage adapter remains provisional and replaceable until storage-driver qualification is complete.

## Defects caught before publication/freeze

1. Initial transaction INSERT contained ten placeholders for a nine-column table. Tests failed and the statement was corrected.
2. Initial worker mutation API exposed the raw SQLite database through a callback. This violated the Second Shift authority boundary. It was removed and replaced by typed `submitWorkerResult` handling controlled entirely by the kernel.
3. Initial failure-injection helper scripts were placed below `test/`, causing Node's test discovery to execute helpers as tests. They were moved to `test-support/`.
4. Initial FI-T003 conflated first-time schema bootstrap with duplicate-command contention. Hosted Node 22 exposed the race while Node 24 happened to pass. The test was repaired to use the declared single-bootstrap-owner topology and now isolates command contention. Both hosted runtimes pass.
5. Adding the Controller v2 CI workflow caused the legacy A-01 Control Plane Enforcement workflow to execute because the legacy workflow watches all `.github/workflows/**` changes. This proves branch isolation alone is insufficient. Final Controller 2.0 code/qualification must have workflow-trigger isolation, preferably through its own repository, before it becomes authoritative.

## Explicit non-authority

This branch does not replace the current controller, does not modify `main`, does not dispatch Second Shift, does not write System Master product state, and does not grant qualification or promotion authority.

## Remaining gates before 002B may freeze

- formal database backup/restore and journal-rebuild strategy
- deeper WAL/database recovery tests including backup during concurrent read/write activity
- controller-instance single-owner enforcement at deployment/runtime boundary
- canonicalization conformance beyond the current RFC 8785 vectors or adoption/qualification of a maintained JCS implementation
- migration forward/rollback/compatibility strategy beyond idempotent v1 bootstrap
- durable transport/journal adapter failure injection
- evidence/artifact durability and integrity adapter qualification
- independent security review of SQL, file/path, process, IPC and trust boundaries
- Windows qualification on the intended Second Shift host environment
- isolation from legacy A-01 workflow triggers

No later controller layer may rely on this kernel as authoritative until the required gates pass.
