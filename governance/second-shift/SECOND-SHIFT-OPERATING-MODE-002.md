# SECOND-SHIFT-OPERATING-MODE-002

Status: **ACTIVE / OWNER-DRIVEN / STALE-FAIL-CLOSED**  
Product root: `SYSTEM_MASTER`

## Core rule

Second Shift does not own a backlog. Each canonical owner system owns a live delegation list. The scheduler may consume only currently valid delegated work.

Owner files:

- `SYSTEM_MASTER/CORE` -> `governance/second-shift/CORE-DELEGATIONS.json`
- `SYSTEM_MASTER/LEARNING` -> `governance/second-shift/LEARNING-DELEGATIONS.json`
- `SYSTEM_MASTER/BOOK` -> `governance/second-shift/BOOK-DELEGATIONS.json`
- `SYSTEM_MASTER/BOOK/PROSE` -> `governance/second-shift/PROSE-DELEGATIONS.json`

## Day-shift lifecycle

Whenever the owner chat materially changes its current objective:

1. fetch the live owner control head;
2. inspect the active delegation file;
3. if a delegation is already completed, superseded, blocked or no longer highest-value, remove it from `active_delegations`;
4. preserve its result/supersession in durable completion/state/evidence history;
5. re-evaluate the owner's current critical path;
6. create a new delegation only if unattended work has a concrete completion delta, stop condition and truthful authority boundary;
7. bind the new delegation to the exact live owner control head.

Day Shift does not need to wait until 23:15 to clean stale work.

## Portfolio-prep lifecycle

At approximately 23:15 America/New_York, the portfolio controller:

1. reads `governance/CURRENT-AUTHORITY.json`;
2. reads the current topology and all four owner delegation files;
3. fetches each live owner control head;
4. rejects any delegation whose `valid_for_control_head` no longer matches;
5. verifies that the objective is still open and dependencies are still valid;
6. verifies A-01 registration/exact subject only for A-01 work;
7. admits only current `READY` work;
8. leaves an owner empty when no useful unattended work exists.

A head mismatch is `STALE_DELEGATION`, not `SUBJECT_FAILURE`.

## Execution-time lifecycle

Immediately before a worker begins its selected item it repeats the authority/head/objective/dependency checks. If state changed after portfolio prep, the old item is not executed. The worker re-evaluates from current owner state and either writes a replacement delegation or performs no work.

## Completion lifecycle

On PASS/completion:

- record evidence/receipt/result;
- remove the delegation from active state;
- re-evaluate the owner system immediately;
- if another safe dependency-valid unattended objective is justified and time remains, create a successor delegation bound to the new current owner head/state;
- otherwise stop cleanly.

This allows multiple useful tasks in one night without preserving stale work.

## Failure lifecycle

- genuine subject/code failure -> bounded diagnosis/repair route when authorized; changed code means new exact SHA and replacement delegation;
- infrastructure failure -> classify separately and retry unchanged subject only when policy permits;
- human/author/private/external/native-platform requirement -> block without fabrication and re-evaluate independent safe work;
- changed owner state/head -> stale delegation, not failure;
- predecessor failure -> dependent delegation does not execute.

## Anti-loop rules

- no infinite repair/retry loop;
- no work invented for utilization;
- no test/evidence weakening merely to obtain PASS;
- no automatic human/author/private/native evidence;
- no old delegation silently rebound to a new exact subject;
- no worker may redefine system ownership.

## Morning handoff

Morning handoff reports the hierarchy:

1. System Master / Core
2. Learning
3. Book
4. Prose (under Book)
5. shared infrastructure/control

It reports only deltas that actually occurred and removes completed/superseded delegation from future active planning.
