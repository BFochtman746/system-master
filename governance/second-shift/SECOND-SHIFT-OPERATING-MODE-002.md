# SECOND-SHIFT-OPERATING-MODE-002

Status: **ACTIVE / OWNER-DRIVEN / STALE-FAIL-CLOSED / REPAIR-AWARE**  
Product root: `SYSTEM_MASTER`

## Core rule

Second Shift does not own a backlog. Each canonical owner system owns a live delegation list **and** a repair inbox. The scheduler may consume only currently valid delegated work and may not lose or silently reinterpret an authoritative failure.

Owner delegation files:

- `SYSTEM_MASTER/CORE` -> `governance/second-shift/CORE-DELEGATIONS.json`
- `SYSTEM_MASTER/LEARNING` -> `governance/second-shift/LEARNING-DELEGATIONS.json`
- `SYSTEM_MASTER/BOOK` -> `governance/second-shift/BOOK-DELEGATIONS.json`
- `SYSTEM_MASTER/BOOK/PROSE` -> `governance/second-shift/PROSE-DELEGATIONS.json`

Repair inboxes are selected through `governance/repair/REPAIR-INBOX-REGISTRY-001.json`.

## Day-shift lifecycle

Whenever the owner chat materially changes its current objective:

1. fetch the live owner control head;
2. inspect the owner repair inbox first and revalidate active repair transactions against current state;
3. inspect the active delegation file;
4. if a delegation is already completed, superseded, blocked or no longer highest-value, remove it from `active_delegations`;
5. preserve its result/supersession in durable completion/state/evidence history;
6. close/supersede any repair transaction whose failed objective is no longer current, preserving receipt/lineage history;
7. re-evaluate the owner's current critical path;
8. create a new delegation only if unattended work has a concrete completion delta, stop condition and truthful authority boundary;
9. bind the new delegation to the exact live owner control head.

Day Shift does not need to wait until 23:15 to clean stale work.

## Repair transaction precedence

A current `REPAIR_REQUEST_READY` transaction normally outranks unrelated speculative build-ahead because it shortens an already-failed critical path. It does not automatically outrank a safety, authority or higher-value dependency boundary.

Before delegating a repair transaction, prove:

- canonical owner/workstream still matches;
- failed objective is still current/relevant;
- exact failed subject and parent receipt are preserved;
- failure class is genuinely repairable subject/code/qualifier failure;
- human/author/private/native/external/publication/production authority is not being disguised as code repair;
- the repair can be performed unattended within the permitted authority boundary.

Changed repair bytes create a new exact SHA. The worker must deterministically prequalify that same SHA before the Repair Broker may mark it `A01_REQUEUE_READY`. That standing is A-01-eligible only; it is not PASS.

## Portfolio-prep lifecycle

At approximately 23:15 America/New_York, the portfolio controller:

1. reads `governance/CURRENT-AUTHORITY.json`;
2. reads current topology, repair registry/inboxes and all four owner delegation files;
3. fetches each live owner control head;
4. runs/consults the current System State Reconciler standing;
5. rejects any delegation whose `valid_for_control_head` no longer matches;
6. validates each active repair transaction against canonical owner/workstream and current objective;
7. verifies that the objective is still open and dependencies are still valid;
8. verifies A-01 registration/exact subject only for A-01 work;
9. admits only current `READY` work or explicitly delegated current repair work;
10. leaves an owner empty when no useful unattended work exists.

A head mismatch is `STALE_DELEGATION`, not `SUBJECT_FAILURE`. An admission/window condition is not a product defect. A dependency block is not a product defect.

## Execution-time lifecycle

Immediately before a worker begins its selected item it repeats the authority/head/objective/dependency and repair-inbox checks. If state changed after portfolio prep, the old item is not executed. The worker re-evaluates from current owner state and either writes a replacement delegation or performs no work.

If a repair transaction appeared after portfolio prep and is current, the owner worker evaluates whether it should supersede unrelated build-ahead. The scheduler never repairs merely because a transaction exists; superseded or irrelevant failures are closed truthfully.

## Completion lifecycle

On PASS/completion:

- record evidence/receipt/result;
- remove the delegation from active state;
- close/supersede the related repair transaction if its boundary is resolved;
- re-evaluate the owner system immediately;
- if another safe dependency-valid unattended objective is justified and time remains, create a successor delegation bound to the new current owner head/state;
- otherwise stop cleanly.

This allows multiple useful tasks in one night without preserving stale work.

## Failure lifecycle

- authoritative `SUBJECT_FAILURE` -> Repair Broker creates a durable owner-lane repair transaction; owner reproduces and minimally repairs; changed bytes require new exact SHA + deterministic prequalification + A-01 requeue;
- infrastructure failure -> shared A-01 route; one bounded same-SHA retry only when policy permits;
- control-plane failure -> CORE/A-01 owner route, not product repair;
- human/author/private/external/native/publication/production authority -> owner-authority route without fabrication;
- changed owner state/head -> stale delegation, not failure;
- stale/window/admission outcome -> replan admission, not subject repair;
- predecessor/dependency failure -> wait for predecessor; dependent delegation does not execute;
- unknown/unmapped failure -> fail closed/dead-letter until classified.

## Anti-loop rules

- no infinite repair/retry loop;
- no repair transaction may exist only in chat memory;
- no work invented for utilization;
- no test/evidence weakening merely to obtain PASS;
- no automatic human/author/private/native evidence;
- no old delegation silently rebound to a new exact subject;
- no failed subject silently replaced without parent receipt lineage;
- no repair worker, broker, hosted test or chat may grant A-01 PASS, promotion, publication or production authority;
- no worker may redefine system ownership.

## Morning handoff

Morning handoff reports the hierarchy:

1. System Master / Core
2. Learning
3. Book
4. Prose (under Book)
5. shared infrastructure/control

For each owner it reports:

- live control head and authority delta;
- completed work;
- open obligations/blockers;
- active/closed repair transactions;
- current Second Shift delegation status;
- exact next action.

It reports only deltas that actually occurred and removes completed/superseded delegation or repair work from future active planning.
