# Controller Foundation-004B-R1 — Cross-Platform Qualification Receipt 001

Status: FROZEN / HOSTED-PORTABLE QUALIFIED
Stage: CONTROLLER-FOUNDATION-004
Tested exact subject: `2b87514935948603f3fd6e322852038aa56ea12c`
Qualified workflow: `Controller v2 Foundation` run `34679978453` / run number `234`
Lineage: C1-derived `controller-v2/foundation-004-c1-rebind`

## Scope

This receipt records observational qualification of the exact source subject above. It does not make this receipt commit part of the tested subject and does not transfer evidence to later bytes.

Foundation-004B-R1 repaired two cross-platform defects discovered by the first C1-derived lifecycle implementation:

1. Process ownership now uses a dedicated sibling SQLite ownership database, rollback journal mode, `BEGIN IMMEDIATE`, and a deterministic write to the single ownership row. The transaction and connection remain held for the entire ownership lifetime. PID files, status files, timestamps, stale-file deletion, retries, and heartbeat leases are not ownership authority.
2. Backup durability verification opens the completed temporary SQLite backup with a writable file handle before `fsync`, preserving the existing integrity verification, byte digest/size evidence, immutable destination rule, and atomic publication path.

## Diagnostic repair evidence

The intermediate subject `254c90ab1afe4ee12d283af3a1a12249f02158dd` contained the ownership repair but not the backup-handle repair. On hosted Windows, all lifecycle ownership tests, including cross-process contention/abnormal-termination `LC-T006`, passed. The only observed failures were storage-maintenance cases `SM-T001`, `SM-T002`, `SM-T003`, and `SM-T005`, each failing at the inherited backup `fsyncSync()` call with `EPERM`. This localized the remaining Windows defect to backup flush handling rather than process ownership.

## Exact-subject cumulative matrix

Workflow run `34679978453` checked out exact subject `2b87514935948603f3fd6e322852038aa56ea12c` and ran the cumulative Controller v2 Node test suite.

| Environment | Runtime | Result |
| --- | --- | --- |
| `ubuntu-latest` | Node 22 | PASS |
| `ubuntu-latest` | Node 24 | PASS |
| `windows-latest` | Node 22 | PASS |
| `windows-latest` | Node 24 | PASS |

The workflow conclusion is `success` and all four matrix jobs completed successfully.

## Standing

Foundation-004 is frozen at **HOSTED-PORTABLE QUALIFIED** standing for the tested exact subject.

This evidence supports the bounded claims exercised by the cumulative suite, including:

- single live Controller process ownership for one resolved database identity on hosted Ubuntu and Windows;
- immediate contender rejection under the tested SQLite/file-system environments;
- release after graceful stop and tested abnormal child-process termination;
- readiness/status diagnostics remaining non-authoritative;
- no PID-probing, stale-time lease heuristic, or ownership retry loop;
- backup integrity verification, point-in-time behavior, immutable destination behavior, exact byte identity, cleanup, and Windows-capable flush handling under the hosted environments;
- inherited C1, durable command inbox/ingress, journal, recovery, projection, effect, lease/fence, and portability regression remaining green on the tested matrix.

## Evidence boundaries

The following are **not** claimed by this receipt:

- production Controller activation; standing remains `BLOCKED_EXTERNAL_SETUP`;
- A-01 execution;
- native device qualification;
- real-provider or production GitHub authority;
- real sudden-power-loss durability;
- network-filesystem, SMB/NFS, container-volume, or multi-host SQLite ownership semantics;
- deployment account/ACL hardening;
- qualification of any later commit, including this receipt commit itself.

## Dependency-valid successor

Do not port historical Foundation-005 Python implementation wholesale. Recover its requirements and threat model as archaeology, then re-adjudicate authenticated local command intake against the current C1-derived Node lineage before implementation.

Next operation: `CONTROLLER-FOUNDATION-005-C1-RECOVER-ANALYZE-001`.
