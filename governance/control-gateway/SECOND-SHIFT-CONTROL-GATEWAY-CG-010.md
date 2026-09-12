# SECOND-SHIFT-CONTROL-GATEWAY-CG-010

## Operation
NIGHT SCHEDULER / LEGACY GITHUB SCHEDULER RETIREMENT + HOST QUALIFICATION

## Final standing
`HOST_QUALIFIED_NIGHT_SCHEDULER_RETIREMENT_CLOSURE_REPAIRED_DEVELOPMENT_FROZEN`

Mission: `SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0`

Exact qualified closure-repair subject: `18d7fc000ce7d3b931f308d0a40527fadba46d6d`

Authoritative qualification receipt: `SECOND-SHIFT-CONTROL-GATEWAY-CG-010-CLOSURE-REPAIR-34673025004`

Historical earlier receipt preserved but superseded for authority progression: `SECOND-SHIFT-CONTROL-GATEWAY-CG-010-HOST-QUALIFICATION-34672767322` on subject `0c9fa4ab5915eda098ec24e81d4004dcee13b8a6`.

Exact predecessor receipt remains: `SECOND-SHIFT-CONTROL-GATEWAY-CG-009-CLOSURE-REPAIR-34672512923`.

## Qualified closure
CG-010 closes the development/controller night-scheduler cutover:

1. `.github/workflows/a01-overnight-night-shift.yml` no longer owns a cron, slot chain, ordering chain, or A-01 dispatch path. It is a manual retired/audit surface only.
2. `SecondShiftSupervisorV2` / A-01-local scheduling is the sole live scheduler authority for admitted overnight work.
3. Exact admitted handoff and coordination contracts persist in the A-01-local SQLite scheduler queue and survive restart.
4. `execution_order` is a hard stage barrier; later stages cannot run while a lower stage remains binding, queued, claimed, or reconciling.
5. Priority orders eligible tasks inside the same active stage.
6. A permanent SQLite claim guard prevents night-queued work from bypassing the A-01 night scheduler through `SupervisorCoordinationAdapter.claim` or `SupervisorStore.claim_ready`.
7. CG-009 dependency, graph-identity, resource-capacity, cancellation, lease, fencing, idempotency, dispatch-outbox, and restart invariants remain qualified.
8. Parallel scheduler ticks cannot double-claim one admitted night task.

## Host qualification
Closure-repair workflow run: `34673025004`

Both Node 22 and Node 24 completed successfully. The run proves:
- Control Gateway JS suite: 149 tests, 142 pass, 0 fail, 7 environment-dependent skips.
- CG-008 handoff regression: 11/11 pass.
- CG-009 base coordination regression: 14/14 pass.
- CG-009 authority-closure regression: 7/7 pass.
- CG-010 repaired night-scheduler suite: 16/16 pass.
- Preserved supervisor reliability suite: 28/28 pass, including 20,000 randomized invariant-checked transitions with seed `0x5EC0D5`, exact transition semantics preserved, `rigor_reduced=false`.

A-01 Control Plane Enforcement on the exact repair subject: run `34673024937`, SUCCESS.

## Durable state
Development active-work revision: 16

State commit: `db9d8b4507e2231b855a1bee435bc8304372ba99`

Packet digest: `87dbd877369d7f85590ecd95f78f658e5b515354690ae41bb4cf227c19a362c7`

Publication digest: `8565746ef7a11ba4153b6df9d82eb2c03a95e5338ee3b4accfb6ce1245f84d6e`

Head and immutable revision mirror blob: `96707c26b8a8b06e86a1b5d2116e702575f840eb`

Authority epoch: 15

CG-010 is `TERMINAL / PASSED / ADMITTED / A01 NOT_REQUIRED` for this host-only operation.

## Remaining production fences
- Actual A-01 Windows qualification remains mandatory.
- Host qualification does not equal `A01-QUALIFIED` or `PRODUCTION-ACTIVATED`.
- Production activation remains false.
- Failure/restart/idempotency qualification remains the next controller operation before later A-01 shadow/canary/cutover stages.

## Exact successor
`SECOND-SHIFT-CONTROL-GATEWAY-CG-011 — FAILURE / RESTART / IDEMPOTENCY QUALIFICATION`

Exact predecessor receipt: `SECOND-SHIFT-CONTROL-GATEWAY-CG-010-CLOSURE-REPAIR-34673025004`.
