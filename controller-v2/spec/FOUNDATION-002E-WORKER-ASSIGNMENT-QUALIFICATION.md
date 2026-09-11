# CONTROLLER-FOUNDATION-002E — Immutable Second Shift Worker Assignment

Status: QUALIFIED REFERENCE CONTRACT

Qualified branch: `controller-v2/foundation-002b`
Qualified implementation head: `2fa7107b671073285791e78004ad3375c00245f5`
Hosted denominator: 208/208 PASS on Node 22 and Node 24.

## Frozen assignment invariants

1. Every Second Shift assignment is immutable and digest-bound.
2. The assignment binds exact transaction, operation, lease ID, fencing generation, resource, worker, subject repository, exact SubjectRef, controller version, and policy version.
3. Assignment expiration is enforced; expired packages cannot start or resume work.
4. Candidate workspace identity and candidate ref are explicit.
5. Allowed worker actions are closed-set and bounded.
6. Promotion, qualification, controller-state mutation, outbox sealing, policy mutation, journal mutation, subject-main mutation, work assignment, and authority acquisition cannot be delegated to Second Shift.
7. Every dangerous action is explicitly present in the forbidden-action set.
8. A stale fencing generation cannot reuse an otherwise valid assignment.
9. A different exact subject cannot inherit an assignment.
10. Unknown assignment fields fail closed.
11. The worker assignment is not authority by itself; it is valid only while it matches current controller lease/state authority.
12. The worker remains limited to heartbeat and typed-result submission through its controller port.

## Next operation

`CONTROLLER-FOUNDATION-002F — LEASE-BOUND SECOND SHIFT DISPATCHER + REPLAY/STALE-ASSIGNMENT REJECTION`

The dispatcher must acquire or consume an authoritative lease, construct the exact assignment from controller state, dispatch it once-or-more safely, start work only after lease/assignment validation, and reconcile ambiguous dispatch delivery without creating duplicate logical execution authority.
