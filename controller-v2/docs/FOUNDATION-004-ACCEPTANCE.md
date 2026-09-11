# Controller Foundation-004 — Process Ownership and Lifecycle

Status: ACTIVE / TEST-FIRST
Predecessor: Foundation-003 frozen at `ec2fcbf188acfad20dd640cf14c2dbb5bf79c0dd`.

## Purpose

Foundation-004 establishes one logical Controller owner for one resolved controller database path and defines deterministic startup, recovery, readiness, failure, and shutdown semantics. It does not add scheduling, GitHub mutation, worker dispatch, command authentication, or Second Shift behavior.

## Ownership model

The operating-system file lock is authority. PID files, owner JSON, and runtime status JSON are diagnostics only and MUST NOT be used to infer that ownership is free. The lock file is derived from the resolved database path so independent Controller processes contend on the same resource.

On Windows, Foundation-004 uses non-blocking `msvcrt.locking(..., LK_NBLCK, 1)` over byte zero of the ownership file. Python 3.14 documents that failure to acquire a non-blocking region lock raises `OSError`. Microsoft documents that locked regions are released when the owning process closes the handle or terminates, although explicit unlock on normal shutdown remains required.

On POSIX systems, Foundation-004 uses `fcntl.flock(..., LOCK_EX | LOCK_NB)` and treats `EACCES`/`EAGAIN` as ownership contention.

## Required startup order

1. Resolve database and ownership paths.
2. Acquire the exclusive non-blocking process-ownership lock.
3. Publish STARTING diagnostic state.
4. Initialize/verify the database schema and migrations.
5. Publish RECOVERING diagnostic state.
6. Run Foundation-003 restart reconciliation.
7. Publish READY only after reconciliation succeeds.

If any step after ownership acquisition fails, the runtime MUST publish FAILED when possible, explicitly release ownership, and remain not ready.

## Required shutdown order

1. Transition out of READY.
2. Publish STOPPING/STOPPED diagnostic state while ownership is still held.
3. Explicitly unlock the ownership region.
4. Close the ownership handle.

Diagnostic status is never authority and may be stale after abnormal termination.

## Acceptance denominator

- F004-001 — Two Controller processes targeting the same resolved database cannot simultaneously own it.
- F004-002 — Duplicate startup is non-blocking and returns a stable `CONTROLLER_ALREADY_RUNNING` failure.
- F004-003 — Abnormal owner-process termination releases OS ownership so a successor can recover.
- F004-004 — Stale diagnostic metadata never grants or denies ownership.
- F004-005 — The ownership descriptor/handle is non-inheritable across spawned programs.
- F004-006 — Database initialization/migration occurs before restart reconciliation.
- F004-007 — Restart reconciliation completes before READY is published.
- F004-008 — Startup failure releases ownership and leaves a non-READY FAILED state.
- F004-009 — Graceful stop relinquishes ownership and permits a clean successor start.
- F004-010 — Runtime status files are atomically replaceable, parseable diagnostics bound to an instance id.
- F004-011 — Foundation-004 contains no provider network client or GitHub mutation path.
- F004-012 — Foundation-004 introduces no scheduler, lane, shift, queue-worker, or Second Shift task semantics.
- F004-013 — The exact candidate SHA passes the inherited suite plus lifecycle tests on both Ubuntu and Windows under Python 3.14.

## Threat boundary

This stage prevents cooperating Controller runtimes from becoming concurrent authorities. It does not claim to stop a hostile local process with direct filesystem permission from bypassing the Controller and editing SQLite. Filesystem ACL/service-account isolation belongs to deployment hardening after the service boundary exists.

## Research basis

- Python 3.14 `msvcrt.locking` documents immediate failure for `LK_NBLCK` when the region cannot be locked.
- Python 3.14 `fcntl.flock` documents exclusive non-blocking locking and portable contention errors.
- Microsoft Win32 file-locking documentation states that file locks are released when a process terminates or the locking handle closes, while recommending explicit unlock on normal termination.
