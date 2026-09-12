# SECOND-SHIFT-CONTROL-GATEWAY-CG-009 — DEPENDENCY DAG / CONCURRENCY / CANCELLATION + HOST QUALIFICATION

Status: HOST_QUALIFIED_DEPENDENCY_CONCURRENCY_CANCELLATION_DEVELOPMENT_FROZEN

Mission: SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0

## Exact authority

- Predecessor freeze: `54d20108311f4f5930017720b11794b3d3196731`
- Exact qualified implementation: `c0ff180607624c27a6b5158e7c0f3ee00e08fddf`
- Host qualification run: `34672012219`
- Qualification receipt: `SECOND-SHIFT-CONTROL-GATEWAY-CG-009-HOST-QUALIFICATION-34672012219`
- Durable terminal publication revision: `11`
- Durable terminal publication commit: `ef3721bb69f6a1eff4c61210d8298b21ff50e99e`
- Authority epoch: `11`

## Closed scope

CG-009 adds `control-gateway.a01-supervisor-coordination.v1` as a strict digest-bound coordination layer on the frozen CG-008 A-01 supervisor handoff. The CG-008 handoff protocol is not redefined.

The coordination contract freezes:
- exact CG-008 `handoff_digest` binding;
- graph identity and version;
- canonical dependency IDs;
- resource identity and durable concurrency limit;
- cancellation policy and coordination digest.

Dependency readiness is evaluated transactionally. A dependency unlocks a successor only when its durable supervisor delegation state is exactly `COMPLETED`. Missing, `BLOCKED`, `STALE`, or `CANCELLED` dependencies do not unlock downstream work. Cycles are rejected transactionally.

Resource concurrency is evaluated inside the same SQLite `BEGIN IMMEDIATE` transaction that creates the supervisor lease and dispatch-outbox intent. Resource policy cannot silently drift, and concurrent claim races cannot over-allocate the admitted resource limit.

Cancellation is durable and permission-fencing is immediate. Cancelling live work releases the local claim, increments the lane fence, and makes late worker updates stale. A pending dispatch becomes `CANCELLED`; an already-dispatched external run becomes `CANCEL_REQUESTED` until explicit external cancellation acknowledgement. Optional dependency-descendant cascade is supported. A legacy CG-008 direct claim cannot bypass a registered coordination task.

Coordination state survives supervisor restart in the same SQLite coordination database.

## Host qualification

Run `34672012219` succeeded on Node 22 and Node 24 against exact subject `c0ff180607624c27a6b5158e7c0f3ee00e08fddf`.

Each runtime proved:
- Control Gateway Node suite: 146 tests / 142 pass / 0 fail / 4 inherited environment skips; the live CG-009 durable-authority test passed.
- CG-008 handoff regression: 11 / 11 pass.
- CG-009 dependency/concurrency/cancellation suite: 14 / 14 pass.
- Preserved supervisor reliability suite: 28 / 28 pass.
- Randomized supervisor stress: 20,000 transitions, seed `0x5EC0D5`, per-transition logical invariant checks, final full snapshot and SQLite integrity gate, `rigor_reduced=false`.

A-01 Control Plane Enforcement also passed on the exact implementation subject.

## Frozen invariants

1. Runtime dependency DAG state is separate from the Control Gateway operation-lineage DAG.
2. CG-008 handoff remains immutable; CG-009 coordination binds to its exact digest.
3. Missing or non-success dependencies fail closed.
4. Dependency cycles fail closed transactionally.
5. Resource capacity and claim creation share one SQLite write transaction.
6. Resource concurrency policy cannot silently drift.
7. Coordinated work cannot use the legacy CG-008 direct claim path.
8. Cancellation fences local execution authority immediately.
9. An external process that has already been dispatched may require external cancellation acknowledgement, but it cannot commit a late result after local cancellation/fence advancement.
10. Host qualification does not substitute for actual A-01 Windows qualification.
11. CG-009 does not perform the legacy GitHub overnight scheduler cutover.
12. Production activation remains false.

## Explicit nonclaims / open production gates

- Actual A-01 Windows execution and adjudication of the registered controller qualification remains mandatory before production activation.
- `.github/workflows/a01-overnight-night-shift.yml` remains a legacy GitHub cron/slot-chain scheduling authority and must be retired or demoted before single-scheduler production cutover.
- Host testing proves permission fencing and cancellation state-machine behavior; it does not claim guaranteed physical termination of an already-running external Windows process before A-01 cancellation qualification.

## Durable successor

The sole dependency-valid successor is:

`SECOND-SHIFT-CONTROL-GATEWAY-CG-010 — NIGHT SCHEDULER / LEGACY GITHUB SCHEDULER RETIREMENT + HOST QUALIFICATION`

It is bound to predecessor receipt:

`SECOND-SHIFT-CONTROL-GATEWAY-CG-009-HOST-QUALIFICATION-34672012219`
