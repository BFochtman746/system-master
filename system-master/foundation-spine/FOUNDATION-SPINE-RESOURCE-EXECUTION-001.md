# FOUNDATION-SPINE-RESOURCE-EXECUTION-001

Status: CANONICAL EXECUTION CONTROL DESIGN

## Required sequence

1. Orchestrator produces a ready Step bound to Keel and Work identity.
2. Resource Authority performs preliminary admission against parent ceilings, protected capacity, policy, queue and current capacity.
3. Capability Routing filters to currently qualified/healthy compatible routes and selects a route.
4. Resource Authority calculates the exact route-specific reservation and issues a short-lived ResourceGrant.
5. Execution Placement performs hard executor feasibility filtering, then preference scoring, then assignment/bind.
6. Durable Runtime creates/activates the Job/Attempt, runtime lease and fence bound to the assignment.
7. Executor receives only the capability, credentials, network/filesystem/tool access and budget needed for that attempt.
8. Heartbeats/resource usage update operational state. Resource overruns throttle, checkpoint, pause, preempt or fail according to policy; they do not silently expand the budget.
9. Completion/failure/drain/fence evidence allows safe reservation release/reclaim.

## Resource dimensions

At minimum the Resource Authority must support CPU, memory/commit, GPU/NPU/accelerator capacity, storage, database capacity, network, provider quota, model tokens/context, tool-call limits, money/cost, artifact growth, wall-clock/deadline and concurrency. On local devices it must also support thermal/power constraints where material.

## Hierarchical budget law

A parent allocates a bounded envelope. Descendants reserve from remaining parent capacity. Delegation cannot create new capacity or money. Replanning can rebalance remaining budget only within the governing GoalRevision unless separately authorized.

## Queue and fairness law

Interactive/control/recovery lanes may have protected capacity. Long autonomous work must not starve the user interface or safety/recovery work. Fairness, aging/starvation prevention, priority and bounded preemption are explicit policies rather than accidental thread scheduling.

## Placement law

Hard constraints are never offset by a high soft score. Feasibility includes resource fit, OS/runtime/hardware, contract compatibility, isolation, policy, location/data constraints, current health, lease/fence capability and required secrets/connectivity.

Only feasible executors enter scoring. Scoring may consider locality, warm state, latency, cost, fragmentation, energy/thermal state, reliability and workload interference.

## Routing/placement separation

Routing chooses the qualified capability/provider path. Placement chooses a concrete executor for that path. A placement engine may not substitute a different route. A route change returns to FS-08 and normally requires a new route-bound resource grant.

## Lease/fence separation

Placement Assignment and Runtime Lease are related but distinct. Assignment answers who should run. Runtime lease/fence answers who may currently mutate execution state. There must be exactly one effective stale-writer barrier for an attempt.

## Long-job profiles

The runtime must support seconds-to-days work with configurable heartbeat, checkpoint cadence, retry budget, deadline, inactivity/stall detection, resumability, cancellation and operator escalation. A fixed five-minute default is not an acceptable universal long-job policy.

## No silent fallback

Resource pressure, unavailable local models or provider outages cannot silently move work to a more privileged, more expensive, less private or otherwise different route. Any fallback must satisfy the governing goal, route policy, security/privacy, rights and budget constraints and must be recorded.