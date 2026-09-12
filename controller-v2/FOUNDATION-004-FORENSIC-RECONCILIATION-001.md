# CONTROLLER-FOUNDATION-004 — FORENSIC RECONCILIATION 001

Status: **RECOVER + INVENTORY + TARGETED RESEARCH + ADJUDICATION COMPLETE / NO 004 IMPLEMENTATION CLAIM**

Current predecessor: `CONTROLLER-FOUNDATION-003J-CLOSURE-CENSUS-001` on the C1-derived JavaScript lineage.

Historical source: `controller-v2/foundation-004@bfbe868d46ed4b2c59b57fbfef11b3ab0a2ddd59`.

The historical branch is archaeology only. It diverges from C1 and was built on the older Python Foundation-003 lineage. Neither its code nor its PASS evidence is current authority.

## 1. Recovered purpose

Foundation-004 has one product-independent purpose: guarantee that exactly one cooperating Controller process owns one resolved local Controller database path and expose deterministic startup, recovery, readiness, failure and shutdown semantics before any scheduler/worker/execution layer can depend on a long-running Controller service.

The historical 13-requirement denominator is retained semantically:

1. two Controller processes targeting one resolved database cannot simultaneously own it;
2. duplicate startup fails non-blockingly with stable `CONTROLLER_ALREADY_RUNNING` classification;
3. abnormal owner termination releases ownership so a successor can recover;
4. stale diagnostic metadata never grants or denies ownership;
5. ownership capability is not accidentally inherited by spawned programs;
6. database initialization/migration occurs before restart reconciliation;
7. restart reconciliation completes before READY;
8. startup failure releases ownership and leaves non-READY FAILED diagnostics when possible;
9. graceful stop relinquishes ownership and permits a successor;
10. runtime status is atomically replaceable, parseable diagnostics bound to an instance id;
11. lifecycle contains no provider-network or GitHub mutation authority;
12. lifecycle contains no scheduler/lane/shift/queue-worker semantics;
13. exact candidate passes predecessor cumulative tests plus lifecycle tests on both Linux and Windows.

## 2. Current JavaScript inventory

The current C1 -> 002D -> 003 JavaScript Controller has **no reusable process-ownership/lifecycle boundary yet**.

Current relevant surfaces are:

- `ControllerKernel(path, options)` immediately opens Node `DatabaseSync`, enables foreign keys/WAL/FULL synchronous mode and runs schema migration;
- `ControllerKernel.close()` closes the semantic store connection;
- `reconcileRecoveredStore(kernel)` performs current portable restart reconciliation by staling orphan RUNNING/VERIFYING operations and surfacing uncertain external effects for observation;
- `rebuildControllerStore(...)` is disaster rebuild after local-store loss and is not ordinary process startup;
- the current package has no external runtime dependency and targets Node 22+;
- the current Controller Foundation workflow cumulatively qualifies the JavaScript suite on hosted Linux Node 22/24, but does not yet provide Windows lifecycle evidence.

Therefore 004 is a genuine missing current service-boundary capability. It must not be satisfied by importing the historical Python lifecycle module.

## 3. Targeted current research

### 3.1 Node core does not provide the historical Python lock APIs as one portable JavaScript contract

The current Node `fs` API provides file descriptors and atomic filesystem primitives but no cross-platform `flock`/`LockFileEx` JavaScript API matching the historical Python implementation. Adding a native addon only for locking would create a new binary/platform dependency before that dependency is proven necessary.

### 3.2 The current Controller already depends on SQLite's cross-platform OS locking

SQLite's default VFS uses operating-system advisory locks on Unix and Win32 file locking on Windows. SQLite reports contention through `SQLITE_BUSY`; Node's `DatabaseSync` exposes a busy timeout, and the current Controller already uses `node:sqlite`.

SQLite `BEGIN EXCLUSIVE` in rollback-journal mode obtains exclusive database locking for the lifetime of the transaction. A dedicated ownership database can therefore act as the cooperating-process ownership mutex without making PID/status files authoritative and without holding an uncommitted transaction open in the semantic Controller database.

Important constraint: WAL mode weakens the meaning of `BEGIN EXCLUSIVE` for this use, so the dedicated ownership database must remain in rollback-journal mode (`DELETE`) and must not be the semantic Controller database.

### 3.3 Network filesystem caveat is a deployment boundary

SQLite documents that file-lock behavior depends on the underlying VFS/filesystem and warns about broken locking on some network filesystems. Foundation-004 portable authority is therefore scoped to supported local filesystems. Network-shared Controller database/ownership paths require a later explicitly qualified distributed ownership mechanism; 004 must fail closed or remain unsupported rather than infer safe ownership.

## 4. Current ownership design adjudication

The smallest dependency-valid current design is a **dedicated SQLite ownership lock database** derived from the canonical resolved Controller database path.

Proposed authority law:

> Ownership exists only while this Controller instance holds an open `DatabaseSync` connection to the dedicated ownership database with a successfully acquired `BEGIN EXCLUSIVE` transaction in rollback-journal mode. Status/PID JSON and the mere existence of the ownership database are diagnostics only.

This has several advantages over stale lock-file heuristics:

- ownership is backed by the same cross-platform OS locking substrate already used by SQLite;
- process/connection termination releases the OS lock without needing stale-PID deletion to grant authority;
- a stale ownership file is harmless when no lock is held;
- no new npm/native dependency is required;
- contention can fail immediately and deterministically;
- the semantic Controller database remains free to commit its own transactions normally.

## 5. Required current startup law

1. Canonicalize the target Controller database path and derive one ownership DB path + status path from it.
2. Acquire ownership non-blockingly before opening/migrating the semantic Controller kernel.
3. Publish diagnostic `STARTING` while ownership is held.
4. Open the semantic `ControllerKernel`, completing schema verification/migration.
5. Publish `RECOVERING`.
6. Run current `reconcileRecoveredStore(kernel)`.
7. Publish `READY` only after reconciliation returns successfully.

If any step after lock acquisition fails, publish `FAILED` best-effort while ownership is still held, close any opened kernel, release/close ownership, and rethrow the original classified failure.

## 6. Required current shutdown law

1. While ownership is still held, publish `STOPPING` and then `STOPPED` diagnostics.
2. Close the semantic kernel.
3. Roll back/close the dedicated ownership connection, releasing the OS lock.
4. Never use status-file content as evidence that the lock is free.

## 7. Diagnostic-state boundary

Runtime diagnostics must contain at least:

- schema/version;
- instance id;
- process id;
- resolved Controller database path;
- lifecycle state;
- update timestamp;
- optional bounded recovery summary / error code.

They must be written by temporary-file + flush + atomic replace. Diagnostic write failure during startup is a startup failure because an owner must not become READY while its declared lifecycle evidence channel is broken. Stale diagnostics after abnormal termination remain non-authoritative.

## 8. Collision fences

Foundation-004 does **not** own:

- durable semantic history or checkpoints (002C);
- command ingress or command transport retries (002D);
- transaction/operation/lease state machines (002B);
- recovery semantics beyond orchestrating the already-owned `reconcileRecoveredStore` boundary (003/recovery);
- provider I/O/external-effect authority (003E);
- scheduling, workers, lanes, shift logic or Second Shift policy;
- production service-manager installation or OS ACL hardening.

## 9. Research-derived blocker classes

- **CURRENT_IMPLEMENTATION_GAP:** no JavaScript ownership/lifecycle boundary exists yet.
- **QUALIFICATION_GAP:** Windows hosted lifecycle evidence is absent on the current JavaScript lineage.
- **ENVIRONMENT_BOUNDARY:** network filesystem ownership is unsupported without separate qualification.
- **EXTERNAL_SETUP:** C1 production Controller activation remains blocked on production principal/repository/ruleset installation independent of 004.

## 10. Exact successor

`CONTROLLER-FOUNDATION-004A-PROCESS-OWNERSHIP-LIFECYCLE-DESIGN-LOCK-001` — freeze the dedicated SQLite ownership-lock contract, path identity, diagnostic schema, startup/shutdown ordering, fail-closed behavior and cross-platform acceptance denominator before JavaScript implementation.
