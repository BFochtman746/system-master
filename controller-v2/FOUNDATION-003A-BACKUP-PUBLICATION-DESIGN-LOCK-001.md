# CONTROLLER-FOUNDATION-003A-BACKUP-PUBLICATION-DESIGN-LOCK-001

Status: **DESIGN-LOCKED / BUILD AUTHORIZED**

Parent recovery: `CONTROLLER-FOUNDATION-003-FORENSIC-RECOVERY-001`

## Purpose

Harden the existing current JavaScript `backupControllerStore` boundary without changing Controller semantic truth ownership. A backup is evidence/recovery material, not a second Controller database authority while the live Controller is running.

## Current evidence

The current C1-derived implementation already uses Node's SQLite online backup API and independently runs SQLite `integrity_check` and `foreign_key_check` against the produced database. SQLite documents the online backup API as producing a consistent snapshot while allowing a live source database to continue operating between backup steps.

The current implementation gap is publication: it writes directly to the requested final destination, allows replacement behavior at that destination, and does not return exact backup byte identity.

## Locked requirements

1. Use the existing SQLite online backup API; never copy live database/WAL/SHM files as the backup mechanism.
2. The caller supplies a new final destination. If that path already exists, fail closed; never overwrite a prior known-good immutable backup.
3. Create the backup in a unique temporary file in the **same directory** as the final destination so final publication can use one filesystem rename boundary.
4. Run `integrity_check` and `foreign_key_check` on the temporary backup before publication.
5. Close the verification database before computing/publishing final byte identity.
6. Flush the completed temporary backup file before publication.
7. Compute and return exact byte count and SHA-256 digest over the bytes that are about to be published.
8. Publish only after successful backup + verification + byte flush + digest calculation, using rename from the same-directory temporary path to the previously non-existent final path.
9. On any failure before successful publication, remove the temporary backup best-effort and preserve the original failure.
10. A published backup must remain independently restorable after the source database/WAL/SHM are gone.
11. Backup creation must not mutate semantic Controller events merely because a backup was taken.
12. No claim is made that a filesystem rename alone proves power-loss durability of directory metadata on every target OS/filesystem. Target/native crash-durability qualification remains a separate evidence class.

## Non-responsibilities

003A does not own:

- durable Controller event authority (002C owns that);
- command ingress or command idempotency (002D/002B);
- effect authorization or provider execution;
- backup scheduling/retention policy;
- remote backup upload/replication;
- production disaster-recovery admission.

## Required tests

- existing independent integrity verification remains green;
- existing point-in-time semantics remain green;
- existing restore-after-source-loss remains green;
- existing final destination causes fail-closed rejection and prior bytes remain unchanged;
- successful publication returns byte count and SHA-256 matching the final file;
- success leaves no temporary backup file;
- a backup failure cleans any temporary file best-effort and does not create the final destination;
- cumulative Controller suite remains green on supported hosted Node runtimes.

## Qualification rule

The implementation SHA must pass hosted cumulative tests after this design lock. Historical `controller-v2/foundation-003-rebind` code is archaeological input only; current qualification must cover the current C1 -> 002D -> 003A lineage.
