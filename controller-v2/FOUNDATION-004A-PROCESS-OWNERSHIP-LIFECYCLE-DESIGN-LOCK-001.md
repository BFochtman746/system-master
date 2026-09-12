# CONTROLLER-FOUNDATION-004A — PROCESS OWNERSHIP + LIFECYCLE DESIGN LOCK 001

Status: **DESIGN-LOCKED / BUILD AUTHORIZED**

Parent: `CONTROLLER-FOUNDATION-004-FORENSIC-RECONCILIATION-001`.

## Authority model

One cooperating Controller process may own one resolved local Controller database path at a time.

The sole 004 ownership authority is an open dedicated SQLite ownership connection holding a successful `BEGIN EXCLUSIVE` transaction in rollback-journal mode. The ownership database path is derived deterministically from the canonical resolved semantic database path.

The following are explicitly **not authority**:

- PID;
- process-name lookup;
- status JSON;
- owner JSON;
- existence or age of the ownership database file;
- wall clock / heartbeat freshness;
- webhook, Actions or chat metadata.

No stale-file deletion algorithm may grant ownership.

## Path identity

For a file-backed Controller database:

1. resolve the absolute path;
2. canonicalize the existing parent directory through the host filesystem;
3. if the database already exists, canonicalize the database path itself;
4. derive sibling paths from that canonical identity:
   - ownership DB: `<database>.controller-owner.sqlite`;
   - status: `<database>.controller-status.json`.

`:memory:` is not eligible for long-running process ownership because independent processes cannot refer to one common semantic store. Lifecycle construction for `:memory:` must fail with a stable classification.

Network/shared-filesystem use is outside the current portable contract unless separately qualified. The build may expose this as an environment/deployment restriction rather than attempting unreliable filesystem detection.

## Ownership acquisition

`ControllerProcessOwnership.acquire()` must:

1. reject re-acquire by the same object;
2. open the dedicated owner DB with zero lock wait;
3. force rollback-journal mode (`PRAGMA journal_mode=DELETE`);
4. force normal connection locking mode before acquisition so the transaction itself is the authority;
5. ensure the tiny ownership schema exists without making its contents authority;
6. execute `BEGIN EXCLUSIVE`;
7. classify SQLite lock contention as `CONTROLLER_ALREADY_RUNNING`;
8. retain the open connection + transaction until explicit release or process death;
9. expose only bounded immutable identity information; never expose a method that lets lifecycle callers commit the ownership transaction.

A merely existing owner DB after a crash must not block a successor once no OS lock remains.

## Ownership release

`release()` must be idempotent. When ownership is held it must roll back the ownership transaction best-effort and close the ownership connection. Closing the connection is mandatory even when rollback reports an error.

Normal release is not evidence that an earlier process ended cleanly; it only ends current ownership.

## Runtime lifecycle states

Diagnostic lifecycle states are:

`CREATED -> STARTING -> RECOVERING -> READY -> STOPPING -> STOPPED`

Failure from STARTING/RECOVERING produces diagnostic `FAILED` when possible, followed by ownership release. Ownership contention produces in-memory `CONTENDED` for the rejected runtime and must not overwrite the actual owner's status file.

Diagnostic state is never semantic Controller history and does not emit Controller events solely for lifecycle bookkeeping.

## Startup order

`ControllerRuntime.start()` must execute exactly this authority order:

1. acquire process ownership;
2. publish STARTING diagnostic;
3. create/open `ControllerKernel` so migration/verification completes;
4. publish RECOVERING diagnostic;
5. invoke the already-owned `reconcileRecoveredStore(kernel)` boundary;
6. only after successful reconciliation publish READY;
7. expose `ready === true` only while state is READY **and** ownership is still held.

A caller may inject a kernel factory/reconcile function for deterministic failure tests, but production defaults must be the current `ControllerKernel` and `reconcileRecoveredStore`.

## Failure order

After successful ownership acquisition, any startup failure must:

1. retain the original error/classification;
2. set in-memory state FAILED;
3. publish FAILED best-effort while ownership is still held;
4. close any opened semantic kernel best-effort;
5. release process ownership in a finally-equivalent path;
6. rethrow the original startup failure rather than replacing it with diagnostic cleanup noise.

If STARTING diagnostic publication itself fails, the runtime must not proceed to open/migrate the Controller database.

## Shutdown order

A READY/RECOVERING/STARTING owner stopped through the public lifecycle boundary must:

1. publish STOPPING while ownership is held;
2. publish STOPPED while ownership is held;
3. close the semantic kernel;
4. release ownership;
5. end with `ready === false`.

Calling stop when ownership is not held is idempotent/no-op with respect to authority.

## Diagnostic file contract

Status JSON v1 fields:

- `schema: "controller.runtime-status.v1"`;
- `instance_id` (UUIDv7);
- `pid`;
- `database_path` canonical absolute string;
- `state`;
- `updated_at` RFC3339 UTC;
- optional `recovery` bounded JSON-compatible summary;
- optional `error_code`.

Writes must use a unique sibling temporary file, fsync the temporary file, atomically rename/replace the target, and clean temporary files best-effort. Directory-fsync differences are evidence-classified rather than silently treated as portable power-loss proof.

Only the current owner may publish STARTING/RECOVERING/READY/STOPPING/STOPPED/FAILED. A contending process must not write CONTENDED into the shared owner status path.

## Non-responsibilities

004 must contain no:

- provider/GitHub network call;
- external-effect apply;
- scheduler or worker dispatch;
- Second Shift policy;
- command authentication/semantic authorization;
- new durable semantic journal;
- competing recovery state machine;
- production service-manager/daemon installation.

## Acceptance denominator

The implementation must provide at least these current cases:

- `LC-T001` first owner acquires one resolved DB identity;
- `LC-T002` second owner of same DB fails immediately with `CONTROLLER_ALREADY_RUNNING`;
- `LC-T003` different DB paths may be owned independently;
- `LC-T004` stale owner/status files without an OS lock do not deny ownership;
- `LC-T005` release permits a successor owner;
- `LC-T006` abnormal child-process termination releases ownership and successor acquires;
- `LC-T007` diagnostics are valid v1 JSON bound to exact instance/database identity;
- `LC-T008` stale diagnostics never grant ownership;
- `LC-T009` semantic kernel migration/open occurs only after ownership acquisition;
- `LC-T010` reconcile occurs after kernel open and before READY;
- `LC-T011` reconciliation failure yields FAILED diagnostic and releases ownership;
- `LC-T012` kernel-open/migration failure yields FAILED diagnostic and releases ownership;
- `LC-T013` STARTING diagnostic failure prevents semantic kernel creation and releases ownership;
- `LC-T014` graceful stop publishes STOPPING/STOPPED before releasing ownership and allows successor;
- `LC-T015` `ready` requires both READY state and live ownership;
- `LC-T016` contender cannot overwrite the owner's status file;
- `LC-T017` lifecycle/ownership source imports no provider transport and exposes no scheduler/worker semantics;
- `LC-T018` owner-db lock contention does not rely on retry loops, PID probing or wall-clock stale heuristics;
- `LC-T019` full inherited Controller suite remains green on hosted Linux;
- `LC-T020` lifecycle denominator and inherited portable suite are exercised on hosted Windows before 004 freeze.

## Qualification rule

Foundation-004 cannot freeze from Linux-only evidence. The exact executable candidate must run the cumulative Controller suite on supported Node runtimes on Linux and must obtain hosted Windows lifecycle/cumulative evidence on the same executable subject. Any platform-specific failure is a current 004 qualification blocker, not permission to weaken ownership semantics.

No A-01, production service installation, network filesystem, or target-native power-loss claim is implied by hosted Linux/Windows PASS.

## Exact successor

`CONTROLLER-FOUNDATION-004B-PROCESS-OWNERSHIP-LIFECYCLE-BUILD-001` — implement the current JavaScript ownership/lifecycle boundary and LC-T001..020 denominator without importing the historical Python runtime.
