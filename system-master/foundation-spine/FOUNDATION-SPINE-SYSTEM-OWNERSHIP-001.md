# FOUNDATION-SPINE-SYSTEM-OWNERSHIP-001

Status: CANONICAL OWNERSHIP LAW

## Ownership test

An authority may exist only when there is a canonical question for which it is the sole answer owner. If two authorities can answer the same canonical question, the design is wrong until one becomes the owner and the other becomes a projection, adapter or consumer.

| ID | Canonical question it alone answers | Explicitly does not own |
|---|---|---|
| FS-01 | What systems/authorities exist now and which version/owner is current? | domain state; runtime work state |
| FS-02 | Who/what actor is this and what authority was delegated to it? | goal; effect decision |
| FS-03 | What exact contract/schema version governs this exchange? | business meaning of the payload |
| FS-04 | What outcome did the user authorize, under what constraints? | executable plan; job state |
| FS-05 | What durable work/project are we managing over time? | low-level execution attempts |
| FS-06 | What plan revision/step graph should satisfy the goal? | user intent; resource grant; worker |
| FS-07 | May this workload consume capacity now, and what exact resources are reserved? | capability qualification; worker identity |
| FS-08 | Which qualified capability/provider route is valid for this step? | resource budget; concrete executor |
| FS-09 | Which exact executor is allowed and best placed to run this routed attempt? | route semantics; effect authority |
| FS-10 | What is the durable execution state of this job/attempt? | project semantics; planning intent |
| FS-11 | Was this command/event durably delivered/consumed/replayed? | event business truth |
| FS-12 | What authorized context was assembled for this invocation and from where? | source truth; promoted knowledge truth |
| FS-13 | What model invocation/profile/version was used and what model result returned? | effect permission; specialist correctness |
| FS-14 | What tool/connector invocation occurred and what normalized result returned? | permission to mutate external systems |
| FS-15 | Is this exact external effect authorized now and what actually committed? | planning; generic tool discovery |
| FS-16 | What exact artifact bytes/version/lineage are in shared custody? | document/book/media semantic correctness |
| FS-17 | What shared structured state transaction/version is canonical? | domain semantic ownership |
| FS-18 | What evidence supports which exact claim/subject and what standing follows? | raw telemetry ownership |
| FS-19 | What operational telemetry was observed? | proof/qualification promotion |
| FS-20 | Given a fault/uncertainty, what recovery/reconciliation action is valid? | shadow copies of source-of-truth state |
| FS-21 | What shared security/privacy/secret/crypto policy permits or blocks this operation? | goal priority; resource scheduling |
| FS-22 | What provider/dependency version/health/provenance standing is currently acceptable? | model safety standing; route decision itself |
| FS-23 | What AI/model/agent risk and safety standing applies? | generic provider health; effect approval |
| FS-24 | What rights/licensing/attribution restrictions permit this use? | privacy; artifact storage |
| FS-25 | What shared user-facing projection/control should be shown or requested? | durable work/job truth |
| FS-26 | What governed system change/release/operator action is current and approved? | product-domain truth |

## Mandatory overlap resolutions

- Keel vs Orchestrator: FS-04 owns goal; FS-06 owns plan.
- Project/Work vs Runtime: FS-05 owns long-lived work; FS-10 owns execution jobs/attempts.
- Resource vs Routing: FS-07 owns budget/capacity; FS-08 owns capability route.
- Routing vs Placement: FS-08 chooses route; FS-09 chooses executor.
- Placement vs Runtime lease: FS-09 owns assignment/placement decision; FS-10 owns runtime execution lease/fence. They must bind to each other; they may not create two competing mutation fences.
- Orchestrator vs Runtime: FS-06 plan execution records are references/projections of FS-10 state, not a second job database.
- Recovery vs source systems: FS-20 coordinates; it never becomes a replacement database for FS-10/11/15/17.
- Observability vs Evidence: FS-19 observes; FS-18 proves/adjudicates evidence standing.
- Tool vs Effect: FS-14 can invoke non-effectful tools or prepare effect requests; FS-15 alone authorizes external mutation.
- Model vs AI Safety: FS-13 executes model calls; FS-23 governs model/agent risk standing.
- Provider vs Routing: FS-22 supplies provider/dependency standing; FS-08 makes the per-step route decision.
- UX vs Work truth: FS-25 requests controls and renders projections; FS-05/10 remain truth owners.
- Creative Fabric vs specialist systems: creative standing cannot override specialist correctness or take domain truth.

## Cross-system semantic fence

Shared services may own generic mechanisms and identifiers. A specialist system owns the meaning of its domain objects. Integration never transfers semantic ownership implicitly.