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

## Test denominator

`controller-v2/test/kernel.test.js` defines CF-T001 through CF-T030 plus five extra guards.

Local reference execution result: 35/35 PASS under Node.js 22.16.0 using `node:sqlite`.

The run also emitted Node's ExperimentalWarning for `node:sqlite` on Node 22.16.0. The intended compatibility target is Node.js 24 LTS, where `node:sqlite` is release-candidate status. The storage adapter therefore remains provisional and replaceable until compatibility/driver qualification is complete.

## Defects caught before publication

1. Initial transaction INSERT contained ten placeholders for a nine-column table. Tests failed and the statement was corrected.
2. Initial worker mutation API exposed the raw SQLite database through a callback. This violated the Second Shift authority boundary. It was removed and replaced by typed `submitWorkerResult` handling controlled entirely by the kernel.

## Explicit non-authority

This branch does not replace the current controller, does not modify `main`, does not dispatch Second Shift, does not write System Master product state, and does not grant qualification or promotion authority.

## Remaining gates before 002B may freeze

- repository-side execution on the intended Node.js 24 LTS baseline
- process-kill/restart tests with a file-backed database
- WAL/database recovery tests
- real concurrent-process lease/command contention tests
- canonicalization conformance tests against RFC 8785 vectors or a qualified implementation
- UUIDv7 conformance/uniqueness stress tests
- migration forward/rollback strategy tests
- transport adapter failure injection
- durable journal adapter qualification
- independent security review of SQL/data boundaries

No later controller layer may rely on this kernel as authoritative until those gates pass.
