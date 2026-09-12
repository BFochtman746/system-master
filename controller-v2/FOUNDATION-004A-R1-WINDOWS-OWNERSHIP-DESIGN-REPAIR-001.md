# CONTROLLER-FOUNDATION-004A-R1 — WINDOWS OWNERSHIP DESIGN REPAIR 001

Status: **DESIGN REPAIR LOCKED / IMPLEMENTATION REPAIR AUTHORIZED**

Parent design lock: `CONTROLLER-FOUNDATION-004A-PROCESS-OWNERSHIP-LIFECYCLE-DESIGN-LOCK-001`.

Triggering exact subject: `2d493ff317656e0c17e1dd16e6a254f1a7619597`.
Triggering hosted run: `34678929079`.

## Qualification finding

The first cross-platform exact-subject qualification demonstrated that the original ownership primitive was not portable enough as specified. On hosted Windows Server 2025 / Node 24, `LC-T006` observed that a second process could pass the acquisition path while the child process remained alive after reporting ownership. The test therefore correctly failed because the expected `CONTROLLER_ALREADY_RUNNING` classification was absent.

This is a **PRODUCT OWNERSHIP PRIMITIVE FAILURE**, not a test-cleanup issue. Foundation-004 must fail closed and repair the authority primitive before freeze.

The same run also exposed an inherited Foundation-003A Windows portability defect: `fsyncSync()` on the read-only backup evidence handle returns `EPERM`. The durability law remains unchanged; the Windows-capable repair is to open the already-created temporary backup through a writable `r+` handle solely for flush/evidence, then close it before immutable rename. No durability assertion is weakened.

## Ownership-law repair

Replace the original `BEGIN EXCLUSIVE`-only acquisition with a dedicated SQLite **single-writer ownership transaction**:

1. keep the dedicated sibling ownership database and rollback-journal (`DELETE`) mode;
2. acquire with `BEGIN IMMEDIATE`, which requests SQLite's write reservation up front;
3. while the transaction is open, execute a deterministic write to the single ownership row, binding the transaction to the current `instance_id` for diagnostic inspection only;
4. retain the open transaction/connection for the complete ownership lifetime;
5. a competing Controller must fail at `BEGIN IMMEDIATE` or the ownership-row write with `SQLITE_BUSY` / `SQLITE_LOCKED`, classified only as `CONTROLLER_ALREADY_RUNNING`;
6. rollback + close remains the release mechanism; the row content after rollback is not authority;
7. PID, row content, status JSON, lock-file existence and wall-clock staleness remain non-authoritative.

The authority being protected is **single Controller writer ownership**, not denial of read-only access to the tiny ownership database. Therefore `BEGIN IMMEDIATE` is a better contract than relying on platform interpretation of an EXCLUSIVE read lock.

## New adversarial requirement

`LC-T006` remains mandatory on both Windows and Linux and must use a genuinely separate child process. A PASS requires:

- child announces ownership only after the transaction and authority-row write are live;
- parent contender receives `CONTROLLER_ALREADY_RUNNING` while child is alive;
- after forced child termination, a successor acquires without consulting stale diagnostics or wall clock.

No retry loop, PID probing, heartbeat lease or stale-file deletion may be added to make the test pass.

## Inherited 003A repair boundary

The backup durability repair may change only the file-handle access mode used for `fsyncSync` from read-only to read/write. It must not remove `fsyncSync`, weaken immutable publication, change digest/size evidence, or treat Windows hosted PASS as sudden-power-loss proof.

## Exact successor

`CONTROLLER-FOUNDATION-004B-R1-CROSS-PLATFORM-AUTHORITY-REPAIR-001` — implement the single-writer ownership transaction plus Windows-capable backup flush handle and rerun the complete Linux/Windows Node 22/24 cumulative matrix on one exact subject.
