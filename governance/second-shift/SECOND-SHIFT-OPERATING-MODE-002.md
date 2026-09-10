# SECOND-SHIFT-OPERATING-MODE-002

Status: **ACTIVE / OWNER-DRIVEN / REGISTRY-DRIVEN / STALE-FAIL-CLOSED / REPAIR-AWARE**  
Product root: `SYSTEM_MASTER`

## Core rule

Second Shift does not own a backlog. Each registry-declared canonical owner lane owns a live delegation list **and**, where applicable, a repair inbox. The scheduler may consume only currently valid delegated work and may not lose or silently reinterpret an authoritative failure.

Canonical owner delegation files are discovered from `governance/second-shift/SECOND-SHIFT-REGISTRY-001.json`; implementations must not compile a fixed lane list. Current lanes are:

- `SYSTEM_MASTER` -> `governance/second-shift/SYSTEM-MASTER-DELEGATIONS.json`
- `SYSTEM_MASTER/CORE` -> `governance/second-shift/CORE-DELEGATIONS.json`
- `SYSTEM_MASTER/LEARNING` -> `governance/second-shift/LEARNING-DELEGATIONS.json`
- `SYSTEM_MASTER/BOOK` -> `governance/second-shift/BOOK-DELEGATIONS.json`
- `SYSTEM_MASTER/BOOK/PROSE` -> `governance/second-shift/PROSE-DELEGATIONS.json`

The SYSTEM_MASTER lane is the reusable lane for product-root-owned **non-system headless capability portfolios**. Content & Document Artifacts uses that lane; future root-owned headless tool portfolios inherit it automatically. Do not create a DOCUMENT peer system or per-tool Second Shift lane merely because a tool branch exists.

Repair inboxes are selected through `governance/repair/REPAIR-INBOX-REGISTRY-001.json`.

## Day-shift lifecycle

Whenever an owner chat, including MASTER_ROOT for SYSTEM_MASTER-owned work, materially changes its current objective:

1. resolve the current owner control binding;
2. inspect the owner repair inbox first when one applies and revalidate active repair transactions against current state;
3. inspect the registry-declared active delegation file;
4. if a delegation is already completed, superseded, blocked or no longer highest-value, remove it from `active_delegations`;
5. preserve its result/supersession in durable completion/state/evidence history;
6. close/supersede any repair transaction whose failed objective is no longer current, preserving receipt/lineage history;
7. re-evaluate the owner's current critical path;
8. create a new delegation only if unattended work has a concrete completion delta, stop condition and truthful authority boundary;
9. bind the new delegation to the exact current owner control binding.

For SYSTEM_MASTER, a READY/ACTIVE change to `central_next_objective` and root Second Shift reconciliation are one governance operation. The root working session may not declare the product root ready while its delegation remains bound to a prior central objective.

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
2. reads current topology, current headless-tool owner allocation, repair registry/inboxes and **all owner delegation files declared by the Second Shift registry**;
3. resolves each current owner control binding;
4. runs/consults the current System State Reconciler and Second Shift owner-coverage standing;
5. rejects any delegation whose `valid_for_control_head` no longer matches its resolved binding;
6. validates each active repair transaction against canonical owner/workstream and current objective;
7. verifies that the objective is still open in the obligation registry selected by CURRENT-AUTHORITY and dependencies are still valid;
8. verifies A-01 registration/exact subject only for A-01 work;
9. admits current `READY` work or explicitly delegated current repair work;
10. when a delegation is absent, stale, completed or blocked, requires the owner/controller to select and bind the highest-value dependency-valid unattended-safe successor from the work-ahead ladder below;
11. leaves an owner empty only after the all-rungs-exhausted test is durably satisfied.

A control-binding mismatch is `STALE_DELEGATION`, not `SUBJECT_FAILURE`. An admission/window condition is not a product defect. A dependency block is not a product defect.

## Mandatory work-ahead ladder

A blocked or unavailable critical-path action does not make the owner lane idle. The controller and worker must evaluate these rungs in order and select the highest-value dependency-valid unattended-safe action:

1. current repairable failure or control-health defect;
2. incomplete completion/evidence census and capability matrix;
3. current authoritative research and source/provenance closure;
4. architecture, contracts, state models, interface and evidence-boundary specification;
5. deterministic test, benchmark, property, concurrency and failure-injection design;
6. bounded implementation with objective hosted/portable verification;
7. exact-SHA qualification wrapper, registry and A-01 request preparation without fabricating target evidence;
8. next dependency-valid successor build packet and risk-reduction work.

Each selected project must state its current owner-control binding, objective, before/after completion delta, evidence target, stop condition, allowed work, forbidden authority and continuation rule. When it completes and time remains, the worker must re-read live authority and select the next safe successor. Completion of one item is not the end of the shift.

### All-rungs-exhausted test

An owner may be idle only when a durable record shows, for every rung above: `COMPLETED`, `DUPLICATE`, `DEPENDENCY_BLOCKED`, `HUMAN_ONLY`, `AUTHOR_ONLY`, `PRIVATE_DATA_REQUIRED`, `NATIVE_TARGET_REQUIRED`, `EXTERNAL_AUTHORITY_REQUIRED`, or `UNSAFE_WITHOUT_DECISION`; identifies the exact evidence or blocker; and confirms no independent preparation, research, specification, test design or bounded implementation can reduce tomorrow's work. A stale/missing delegation, blocked critical path, unavailable A-01 slot, or idle runner is never by itself sufficient.

## Execution-time lifecycle

Immediately before a worker begins its selected item it repeats the authority/control-binding/objective/dependency and repair-inbox checks. If state changed after portfolio prep, the old item is not executed. The worker re-evaluates from current owner state and either writes a replacement delegation or performs no work.

If a repair transaction appeared after portfolio prep and is current, the owner worker evaluates whether it should supersede unrelated build-ahead. The scheduler never repairs merely because a transaction exists; superseded or irrelevant failures are closed truthfully.

## Completion lifecycle

On PASS/completion:

- record evidence/receipt/result;
- remove the delegation from active state;
- close/supersede the related repair transaction if its boundary is resolved;
- re-evaluate the owner immediately;
- if another safe dependency-valid unattended objective is justified and time remains, create a successor delegation bound to the new current owner binding/state;
- otherwise apply the all-rungs-exhausted test and stop only with a durable evidence-backed blocker record.

This allows multiple useful tasks in one night without preserving stale work.

## Failure lifecycle

- authoritative `SUBJECT_FAILURE` -> Repair Broker creates a durable owner-lane repair transaction; owner reproduces and minimally repairs; changed bytes require new exact SHA + deterministic prequalification + A-01 requeue;
- infrastructure failure -> shared A-01 route; one bounded same-SHA retry only when policy permits;
- control-plane failure -> CORE/A-01 owner route, not product repair;
- human/author/private/external/native/publication/production authority -> owner-authority route without fabrication;
- changed owner state/control binding -> stale delegation, not failure;
- stale/window/admission outcome -> replan admission, not subject repair;
- predecessor/dependency failure -> wait for predecessor; dependent delegation does not execute;
- unknown/unmapped failure -> fail closed/dead-letter until classified.

## Anti-loop rules

- no infinite repair/retry loop;
- no repair transaction may exist only in chat memory;
- no work invented solely for utilization, but useful dependency-valid work-ahead must not be suppressed merely because the current critical path is blocked;
- no test/evidence weakening merely to obtain PASS;
- no automatic human/author/private/native evidence;
- no old delegation silently rebound to a new exact subject;
- no failed subject silently replaced without parent receipt lineage;
- no repair worker, broker, hosted test or chat may grant A-01 PASS, promotion, publication or production authority;
- no worker may redefine system ownership;
- no tool branch may create a new Second Shift owner lane unless architecture authority creates a new first-class owner system.

## Morning handoff

Morning handoff reports the hierarchy:

1. System Master product root / root-owned headless portfolios
2. System Master / Core
3. Learning
4. Book
5. Prose (under Book)
6. shared infrastructure/control

For each registry-declared owner it reports:

- current control binding and authority delta;
- completed work;
- open obligations/blockers;
- active/closed repair transactions where applicable;
- current Second Shift delegation status;
- exact next action.

It reports only deltas that actually occurred and removes completed/superseded delegation or repair work from future active planning.
