# System Master Foundation & Spine — System Specification

## Purpose

The Foundation & Spine is the shared operating substrate of System Master. It turns an authorized user intention into governed, durable, resource-bounded, recoverable work that can run across local and remote executors, models, tools, connectors and specialist systems without losing intent, authority, state, evidence or user control.

It is not a specialist product domain. It does not own Book semantics, Learning semantics, document semantics, programming correctness, media correctness, research truth, spreadsheet truth or any future specialist-system truth merely because those systems use the shared substrate.

This specification is rebuilt from first principles. Historical designs are input evidence, not automatic authority. A historical concept is retained only when it improves the final system.

## The outcome this architecture must guarantee

For every consequential piece of work, System Master must be able to answer:

- What exactly did the user authorize?
- Which goal revision and constraints governed the work?
- What long-lived work/project did it belong to?
- What plan revision and step caused the execution?
- What policy, privacy, rights and safety decisions applied?
- Why was the work admitted and what resource/cost ceiling applied?
- Which capability/provider route was selected and why?
- Which exact resources were reserved?
- Which executor was assigned and which fence made it current?
- What job and attempt actually ran?
- What context, model, tool, connector or specialist system participated?
- What external effects actually committed?
- What canonical state or artifact bytes were produced?
- What evidence supports the claimed result?
- Were the user's success criteria actually satisfied?
- What happened after any crash, retry, outage, cancellation or recovery?

If the system cannot answer those questions from durable records, the Foundation & Spine is incomplete.

## Constitutional laws

1. **One truth owner per concept.** A fact may have caches, read models and projections, but never competing authoritative stores.
2. **Intent is revisioned, never silently rewritten.** Replanning may change the plan. Material changes to outcome, constraints, scope, privacy, authority, budget or success criteria require a new governed goal revision.
3. **Descendants cannot expand authority.** Child work inherits ceilings for permissions, privacy purpose, rights, scope, cost, resources, deadlines and delegation.
4. **Planning is not permission.** A plan or model proposal cannot grant resource capacity, executor authority or permission for an external effect.
5. **Hard constraints precede optimization.** Ineligible routes and executors are rejected before scoring preferences.
6. **Durability begins before asynchronous execution.** Once meaningful work is admitted, its identity and accepted state must survive process/device interruption.
7. **Stale actors lose authority.** Lease/fence generations are monotonic or equivalently protected; an old executor cannot continue mutation after reassignment.
8. **Exactly-once external effects are never assumed.** Use idempotency, conflict identity, commit receipts, reconciliation and compensation as appropriate.
9. **Unknown is a real state.** Uncertain commits, stale evidence, missing acknowledgements and ambiguous recovery are not guessed into success or failure.
10. **UI and telemetry are projections, not business truth.** Chat, dashboards, logs and metrics cannot become the canonical job database or certify completion by themselves.
11. **Evidence claims cannot exceed their evidence class.** Design, static, portable, hosted, A-01, native, human, external and production evidence are distinct.
12. **Artifact identity is digest-bound.** Mutation creates a new artifact/version; historical byte identity is not rewritten.
13. **Secrets are references/capabilities, not prompt or log content.**
14. **Effect authority is commit-time authority.** Old planning approval does not authorize a changed external mutation.
15. **Routing and placement are different.** Routing chooses a qualified capability/provider path; placement chooses a concrete executor.
16. **Provisional admission and final reservation are different.** Early admission determines whether bounded work may proceed; the final grant is bound to the selected route and placement-relevant needs.
17. **Recovery coordinates existing truth owners.** It never becomes a shadow job engine, shadow database or shadow router.
18. **Shared infrastructure never absorbs specialist semantics.** Integration is not ownership transfer.
19. **AI cannot self-grant capabilities, credentials, budget, rights, release standing or external-effect permission.**
20. **Material subject change invalidates or narrows evidence.** Changed code, schema, route, model, dependency, policy, target or ownership requires evidence appropriate to that change.
21. **Architecture, implementation, qualification and production admission are separate facts.**
22. **A-01 is a qualification environment, not architecture authority.** If it is unavailable, target qualification is unexecuted, not failed.

## Canonical work chain

Every non-trivial work item uses one causal lineage:

**User Intent**
→ **Governed Goal Revision**
→ **Work / Project**
→ **Plan Revision**
→ **Plan Step**
→ **Policy / Privacy / Rights / Safety Decision Set**
→ **Provisional Resource Admission**
→ **Capability Route**
→ **Exact Resource Grant**
→ **Executor Assignment**
→ **Durable Job**
→ **Execution Attempt + Fence**
→ **Context Assembly**
→ **Model / Tool / Connector / Specialist Invocation**
→ **External Effect Receipt, if any**
→ **Canonical State and/or Artifact Result**
→ **Evidence Set**
→ **Completion Decision**
→ **Terminal State or Recovery Episode**

Every descendant carries the relevant Work identity and governed Goal revision. A plan may be revised without revising the goal; a material goal change cannot be disguised as replanning.

## Required logical systems

These are logical ownership boundaries, not a mandate for microservices. Several may run in the same process or database so long as their truth ownership and contracts remain explicit.

### System Root & Authority Registry

**Canonical question:** What shared systems/authorities exist now, which version is current, who owns each one and which systems are admitted or retired?

Owns current topology, owner mapping, authority identities, canonical version pointers, system admission/retirement and product-root integration rules.

It does not own specialist data, runtime job state or user intent.

### Identity, Principal & Delegation

**Canonical question:** Who or what actor is this, and what authority was delegated to it?

Owns user/device/session/service/workload identity, actor chains, delegated authority, capability grants, expiry/revocation and actor attribution.

It must support short-lived workload identity and least-privilege delegation. It does not own goals, plans, effect decisions or resource scheduling.

### Contracts & Versioning

**Canonical question:** What exact schema/protocol/contract version governs this exchange?

Owns versioned schemas, command/API/event contracts, semantic compatibility rules, contract digests, migration compatibility and deprecation metadata.

Unknown or incompatible contracts fail before mutation. It does not own business meaning or policy.

### Intent / Keel

**Canonical question:** What outcome did the user authorize, under what constraints?

Keel owns the governed goal contract: outcome, requirements, constraints, exclusions, assumptions, success criteria, scope, priority, deadline/time horizon, delegation ceiling, resource/cost ceiling, privacy purpose/data-use restrictions, approval requirements and cancellation/supersession state.

Keel must:
- create immutable goal revisions;
- require explicit revision for material intent changes;
- propagate inherited limits to descendants;
- bound DAG depth, fan-out, recursion, child count and autonomous delegation;
- detect duplicate/cyclic work where relevant;
- make cancellation and supersession explicit.

Keel does not own the executable plan, route, resource grant, executor or job state.

### Work & Project Control

**Canonical question:** What durable work/project are we managing over time?

Owns long-lived Work/Project identity, hierarchy, milestones, progress rollup, risks/issues/changes, project-memory references and the relationship between a goal and its ongoing work.

It may span many plans and jobs. It is not a second workflow engine and does not own low-level attempts, leases or worker execution state.

### Planning & Orchestration

**Canonical question:** What plan revision and step graph should satisfy the active goal?

Owns executable plan revisions, DAG/step dependencies, conditional branches, joins, readiness, replanning decisions, plan-level checkpoints and completion predicates.

The Orchestrator must:
- bind every plan to an exact Keel revision;
- keep hard constraints separate from optimization preferences;
- support parallelism, joins, human waits and partial-success handling;
- replan only within current Keel constraints;
- map executable steps to the durable runtime rather than creating a second job database;
- persist enough plan state for restart recovery.

It does not own user intent, resource grants, capability health, concrete worker placement, effect permission or specialist correctness.

### Resource Admission & Budgeting

**Canonical question:** May this workload consume capacity now, and what exact resources are reserved for it?

Owns multidimensional budgets, queue/admission decisions, priorities, fairness, starvation prevention, protected capacity, backpressure, reservations, grants, accounting, release/reclaim and bounded preemption selection.

Resource dimensions include CPU, memory/commit, GPU/NPU/accelerator capacity, storage, database capacity, network, provider quota, model tokens/context, tool-call count, monetary cost, artifact growth, wall-clock/deadline, concurrency and local power/thermal limits where relevant.

Resource Control must:
- perform provisional admission before routing when work is clearly forbidden or unaffordable;
- issue the final grant only after concrete route requirements are known;
- bind grants to exact work, route, quantity, expiry and relevant fence/assignment identity;
- inherit/decrement parent budgets rather than mint new child budgets;
- protect capacity for user control, cancellation, health, fencing and recovery;
- use explicit fairness/aging/priority/backpressure rather than accidental thread scheduling;
- persist or deterministically reconstruct reservations/accounting needed after restart.

It does not choose a capability route or concrete executor.

### Capability Registry & Routing

**Canonical question:** Which qualified capability/provider path is valid for this plan step?

Owns capability descriptors, contract compatibility, candidate implementations/providers, qualification and health inputs consumed by routing, deterministic route decisions and route snapshots.

Routing must filter hard requirements before scoring. Eligibility can include contract compatibility, current qualification, policy, safety, rights, privacy/locality, provider/dependency standing, health and resource feasibility.

A route change creates a new route decision and normally requires a new route-bound resource grant.

Routing does not allocate resources, place a worker or authorize an external side effect.

### Execution Placement

**Canonical question:** Which exact executor is eligible and should run this routed attempt?

Owns executor eligibility, hard feasibility filtering, scoring, assignment, placement lease/assignment state, drain and safe reassignment.

Feasibility includes route compatibility, resource fit, OS/runtime/hardware, isolation capability, policy/location/data constraints, health, fencing support and required connectivity/secret access.

Only feasible executors may be scored. Soft scoring can consider locality, warm state, latency, cost, fragmentation, power/thermal state, reliability and workload interference.

Placement consumes a route and resource grant. It may not self-route, self-admit or self-authorize effects.

### Durable Execution Runtime

**Canonical question:** What is the durable execution state of this job/attempt right now?

Owns durable job/attempt lifecycle, queues, claim/start, timers, signals, cancellation mechanics, retries/backoff, checkpoints, heartbeats, runtime lease/fence, idempotency primitives, compensation hooks and restart-safe execution state.

It must:
- survive process/machine restart without losing accepted work;
- enforce deadlines, heartbeat/stall detection, bounded retries and poison-job quarantine;
- support seconds-to-days jobs without unbounded history or memory growth;
- make terminal transitions explicit;
- assume retryable activities/effects may execute more than once and require idempotency or reconciliation at unsafe boundaries.

The runtime does not own project semantics, user intent, planning or route choice.

### Transport & Delivery

**Canonical question:** Was this command/event durably delivered, consumed, replayed or quarantined?

Owns durable command/event delivery mechanics: outbox/inbox, delivery attempts, deduplication, declared ordering scopes, replay, acknowledgement and dead-letter/quarantine.

Duplicate delivery is expected and must be safe. Transport owns delivery mechanics, not event business meaning or workflow completion.

### Context, Memory & Retrieval Broker

**Canonical question:** What authorized context was assembled for this invocation and from where?

Owns bounded context assembly across conversation, files, durable memory, project state and knowledge/retrieval sources, including source identity, freshness, trust labels, purpose/privacy filtering and context-assembly receipts.

It must distinguish canonical facts from summaries/derived context, bound context size, prevent stale context from silently overriding current authority and make consequential context snapshots reconstructable.

It does not own source truth, promoted domain knowledge or user intent simply because content was placed in context.

### Model Gateway

**Canonical question:** What model invocation/profile/version ran, under what limits, and what result returned?

Owns model/provider invocation contracts, model capability metadata, role/profile selection, model-version binding, prompt/template/config package identity, structured-output validation, provider runtime limits/health consumption, bounded fallback and inference receipts.

Every inference binds work, attempt, context, model and prompt/config versions. It enforces token, cost, latency, privacy and safety constraints.

Model availability is not model safety standing and does not grant effect permission.

### Tool & Connector Gateway

**Canonical question:** What tool/connector invocation occurred and what normalized result returned?

Owns tool/connector discovery, schema validation, invocation transport, sandbox/interface boundary and result normalization.

Tool availability never grants permission to invoke it, and invocation eligibility never grants permission for an external mutation.

External tool descriptions/results are untrusted inputs subject to contract, policy and prompt-injection defenses.

### Effect / Action Authority

**Canonical question:** Is this exact external mutation authorized now, and what actually committed?

Owns effect preflight/commit-time authorization, effect identity, idempotency/conflict identity, least-privilege effect capability, immutable effect receipts, compensation metadata and unknown-commit reconciliation entry.

Reads and preparatory tool calls may use the Tool Gateway. Consequential mutations must pass this authority at commit time.

An ambiguous effect enters UNKNOWN/RECONCILING. The system may not blindly repeat an irreversible mutation because an acknowledgement was lost.

### Artifact Gateway

**Canonical question:** What exact artifact bytes/version/lineage are in shared custody?

Owns shared binary/file custody, digest identity, immutable versions/lineage, storage references, transfer state/integrity, quarantine and retention/deletion enforcement hooks.

It must stream large artifacts, support resumable transfer, defend against path traversal/archive/parser bombs and preserve producer/work/provenance references.

Specialist systems retain semantic ownership of manuscript, document, media, spreadsheet, code or other artifact content.

### Canonical Data & Persistence

**Canonical question:** What shared structured-state transaction/version is canonical?

Owns shared structured-state persistence primitives, transactions, concurrency semantics, migrations, backup/PITR interfaces, history where required, idempotent mutation contracts and projections/caches derived from canonical state.

Domain owners retain domain-data meaning. Search indexes, caches and UI read models are reconstructable projections, not independent truth.

### Evidence, Provenance & Assurance

**Canonical question:** What evidence supports which exact claim/subject, and what standing follows?

Owns evidence objects, causal links, provenance records, immutable receipts, qualification evidence, evidence freshness/validity/invalidation and claim-support relationships.

It distinguishes observation, decision, execution receipt, automated test, human attestation and external/private authority. Logs do not become proof merely because they contain a success message.

High-consequence standing should support independent integrity verification through digest chaining, signed checkpoints/attestation or independent custody/witness where appropriate.

### Observability & Telemetry

**Canonical question:** What operational telemetry was observed?

Owns standardized traces, metrics, logs, profiles, health signals, SLOs and alerts. Material signals carry applicable work/job/attempt/service/correlation identity while avoiding secrets and unnecessary sensitive data.

It should expose queue age, lease health, retry pressure, resource saturation, provider health, artifact throughput, recovery progress and user-control responsiveness.

Telemetry is non-authoritative for completion unless deliberately converted into a governed evidence object.

### Recovery & Reconciliation

**Canonical question:** Given this fault, interruption, ambiguity or divergence, what recovery action is valid?

Recovery is a coordination authority, not a shadow database.

It covers distinct recovery classes:
- work continuity after app/process/device interruption;
- executor failure, fencing, drain and safe reassignment;
- durable transport replay/deduplication;
- unknown external-effect reconciliation;
- resource reclaim after safe fence/reconciliation;
- cross-owner state/data reconciliation;
- compensation/saga recovery;
- backup/PITR/disaster recovery and verified re-entry.

A checkpoint is resumable only when compatible with the current Work, Goal, Plan, Step, Job/Attempt and required contract/model/tool/artifact identities. Superseded or unsafe checkpoints cannot be resumed automatically.

### Security, Privacy, Secrets & Cryptography

**Canonical question:** What shared security/privacy/secret/cryptographic policy permits or blocks this operation?

Owns shared authorization-policy enforcement, purpose/data controls, trust boundaries, sandbox policy, secret/key/certificate custody interfaces and cryptographic verification requirements.

No actor, tool, model, worker or provider is trusted merely because it is local, internal or previously used. Retrieved text, files, webpages and peer-agent messages are data, not authority.

Executors receive short-lived task-bounded capabilities. Secrets are referenced by opaque identity/capability rather than copied into prompts, logs or ordinary evidence.

### Provider & Dependency Governance

**Canonical question:** What provider/dependency/build/model/tool version and provenance standing is currently acceptable?

Owns provider/dependency identity, approved versions, quota/capability profiles, health observations, deprecation, dependency risk and software-supply-chain provenance/attestation requirements.

Release/promotion cannot trust an artifact solely because it came from the project's repository. Critical build/dependency/model/tool identities are digest/version bound where feasible.

This system supplies standing to routing and release; it does not make the per-step route decision.

### AI Safety & Model Risk

**Canonical question:** What AI/model/agent risk standing and autonomy limit applies?

Owns risk tiering, autonomy ceilings, required evaluations/red-team profiles, human-oversight requirements, behavior-drift monitoring, model-risk exceptions, safety-case standing and AI release constraints.

A healthy/available model may still be disallowed by safety standing. A model cannot widen its own autonomy or tool permissions.

### Rights, Licensing & Attribution

**Canonical question:** What rights/licensing/permission/attribution constraints permit this source or output to be used in this way?

Owns operational rights standing, source/use restrictions, attribution obligations and commercial/publication constraints.

Rights are separate from privacy and security authorization. Unresolved legal interpretation becomes an explicit human-review requirement; this system is not a substitute for legal advice.

### UX / Chat / Work Control Surface

**Canonical question:** What truthful user-facing projection/control should be shown or requested?

Owns shared interaction, progress/control projections, pause/cancel/resume requests, approvals, offline behavior, blocker/uncertainty presentation and artifact navigation.

The UI may issue governed control commands but never becomes job/work/evidence truth. Closing the app must not destroy admitted background work.

### Change, Migration, Release & Operator Governance

**Canonical question:** What governed system change/release/operator action is current and approved?

Owns system-change registration, impact assessment, approvals, maintenance windows, migration/verification plans, release candidate identity, promotion/rollback/withdrawal, emergency/operator intervention and durable change receipts.

Emergency authority is narrow, attributable, auditable and followed by reconciliation. It is not a permanent bypass.

## Required shared overlay: Creative Fabric

Creative Fabric is required as a federated cross-system capability, but it is deliberately not a spine control authority.

It owns creative participation profiles, creative work-graph specifications, creative/design context, creative quality profiles, coherence evaluation and bounded creative coordination.

Every applicable capability is classified as:
- **REQUIRED** — creative participation is necessary;
- **ASSISTED** — creative participation may improve the result;
- **OBSERVED** — Creative Fabric evaluates/coheres without controlling specialist execution;
- **BYPASS** — creative mediation is intentionally absent from the critical path.

Creative Fabric must preserve specialist correctness and sovereignty. Executable creative work enters the normal Keel → Orchestrator → Resource → Routing → Placement → Durable Runtime path. It cannot own routing, durable job truth, resources, effect permission, artifact-byte truth, evidence truth, rights truth or specialist correctness.

## Mandatory operating sequence

1. An ingress surface captures the user's instruction and binds principal/session/correlation identity.
2. Security/Policy establishes the current authority context.
3. Keel creates or revises the governed goal contract.
4. Work/Project Control binds the goal into durable ongoing work where appropriate.
5. Context/Memory assembles an authorized source-labeled context snapshot.
6. The Orchestrator produces a versioned plan DAG bound to the exact goal revision.
7. Policy, Privacy, Rights and Safety preflight the steps that require those decisions.
8. Resource Control performs provisional admission and queues/rejects unaffordable or unsafe work.
9. Capability Routing selects a qualified compatible route.
10. Resource Control issues the final route-bound resource grant.
11. Execution Placement selects an eligible executor and records the assignment.
12. Durable Runtime activates the job/attempt with current lease/fence.
13. The executor invokes models, tools, connectors, Creative Fabric and/or specialist systems as specified.
14. Consequential external mutations pass commit-time Effect Authority.
15. Structured state and artifacts are written through their canonical owners.
16. Durable Transport carries commands/events without becoming workflow truth.
17. Evidence/Provenance records receipts and causal relationships.
18. Observability emits non-authoritative operational signals throughout.
19. Assurance evaluates actual result/evidence against the step and Keel success criteria.
20. Any ambiguity/failure/divergence enters the correct Recovery/Reconciliation class before mutation authority resumes.
21. UX/Chat receives a projection and may issue governed pause/cancel/approval/revision commands.

## Required boundary contracts

The implementation must expose explicit versioned contracts for at least:

- ingress → Keel;
- Keel → Work/Project Control;
- Keel → Orchestrator;
- parent → descendant constraint/budget/delegation inheritance;
- Context Assembly → model/tool/specialist invocation;
- Orchestrator → durable job creation;
- Orchestrator → Resource provisional request;
- Resource → Router feasibility context;
- Router → Resource exact route requirements;
- Resource → Placement grant;
- Router → Placement route snapshot;
- Placement → Runtime assignment/lease/fence;
- Runtime → model/tool/specialist invocation;
- Tool Gateway → Effect Authority for consequential mutation;
- execution → Canonical Data / Artifact owners;
- consequential action/result → Evidence/Provenance;
- evidence/result → completion adjudication;
- ambiguous terminal transition → Recovery/Reconciliation;
- all systems → Observability;
- Human/Operator control → each governed control point.

An undocumented shared-database write is not a substitute for a boundary contract.

## Duplicate authorities that are forbidden

The final system may not contain:

- a second user-intent truth inside a plan, model memory or UI;
- a second work/job database inside the Orchestrator when Work/Project and Durable Runtime already own those truths;
- a second scheduler inside Placement when Resource Control owns admission/fairness/priorities;
- a second capability registry inside executors/providers;
- two effective stale-writer fences for the same attempt;
- a second effect-authorization path hidden inside a tool adapter;
- a second artifact truth inside Chat, Creative Fabric or a specialist adapter;
- a second evidence truth inside logs/observability;
- a rights or safety policy engine hidden inside individual providers that can override shared standing;
- a Creative Fabric execution route that bypasses normal spine controls;
- an external agent/protocol that grants itself internal authority;
- a Recovery service that independently overwrites owner truth just to make records agree.

## Long-running work requirements

The Foundation & Spine must support work lasting seconds, hours, days or longer.

It must provide:
- durable progress and checkpoints;
- exact pause/cancel/resume semantics;
- bounded history/event growth;
- heartbeat/stall monitoring;
- deadlines and bounded retry budgets;
- resumable large-artifact transfer;
- resource/cost budget continuity across restart;
- safe provider failover without privacy/rights/cost widening;
- human approval waits without consuming active compute;
- partial-result preservation;
- app/device disconnect without job loss;
- truthful blockers and uncertainty;
- maintenance/restart handoff without duplicate effects.

Interactive/user-control/recovery functions receive protected capacity and cannot be starved by background autonomous work.

## Failure conditions that must be first-class

At minimum the architecture and implementation must handle:

- CPU/RAM/GPU saturation;
- low/full storage;
- database pressure/restart;
- network partition/outage;
- provider quota/outage;
- worker/process crash;
- host reboot;
- duplicate/delayed/out-of-order messages;
- stale executor continuing after reassignment;
- expired/revoked credentials or grants;
- unknown external side-effect commit;
- corrupted/incomplete artifact or checkpoint;
- stale/corrupt evidence;
- clock skew;
- recursive/fan-out explosions;
- retry storms;
- cancellation during execution or commit;
- partial cross-system completion;
- migration/rollback failure;
- malicious or misleading retrieved/tool/peer-agent content.

## Research basis retained in this design

Internal archival material contributed durable runtime, Keel, routing, artifact/data, evidence and recovery lessons, but no historical packet is preserved merely because it was once canonical.

The design intentionally adopts mature external patterns without depending on a specific vendor implementation:

- **Durable workflows:** restart-safe workflow state, durable timers/signals, retries and idempotent/reconcilable activities, consistent with mature systems such as Temporal.
- **Scheduling/placement:** explicit queue/filter/reserve/permit/score/bind concepts and hard feasibility before scoring, consistent with Kubernetes scheduling principles.
- **Zero trust:** no implicit trust from network location or ownership; explicit identity and authorization at resource boundaries, consistent with NIST SP 800-207/207A.
- **Workload identity:** short-lived service/workload identities and mutual authentication patterns consistent with SPIFFE/SVID concepts.
- **Policy separation:** policy decision separated from enforcement, consistent with OPA-style architecture.
- **Observability:** correlated traces/metrics/logs/profiles and common semantic conventions, consistent with OpenTelemetry.
- **Software provenance:** digest-bound source/build provenance and trusted-builder identity, consistent with SLSA principles.
- **AI risk/agency:** explicit autonomy limits, evaluations and minimized tool/permission scope, consistent with NIST AI RMF and OWASP agentic/LLM safety guidance.

Research may change this architecture later, but a new finding must identify what existing responsibility is wrong or missing, which owner changes, and what text is superseded. Research is not appended as another permanent authority by default.

## Architecture lock condition

The target Foundation & Spine is architecturally locked when:

- every consequential shared responsibility has exactly one owner above;
- every mandatory boundary has a versioned contract;
- no required capability depends on undocumented duplicate authority;
- all descendant work is traceable through the canonical work chain;
- resources, authority, privacy, rights and safety remain bounded through retries/delegation;
- all external effects remain separately authorized;
- every completion claim is evidence-bounded;
- failure/recovery ownership is unambiguous;
- specialist systems retain semantic sovereignty;
- implementation can be mapped to this design without relying on historical naming as architecture authority.

Changes to these ownership boundaries require a direct revision of this specification. Do not create a parallel design document to avoid resolving a contradiction.
