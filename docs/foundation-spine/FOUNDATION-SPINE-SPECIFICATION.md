# System Master Foundation & Spine Specification

## Purpose

The Foundation & Spine is the shared operating substrate of System Master. It is responsible for turning a user's intent into governed, durable, resource-bounded, authorized work that can run across local and remote executors, models, tools, specialist systems, and long-running workflows without losing intent, authority, state, evidence, or user control.

It is not a specialist product system. It does not own Book semantics, Learning semantics, document-format semantics, programming semantics, or other domain truth. It provides the common machinery those systems use.

This specification is intentionally rebuilt from first principles. Historical System Master material is source material, not automatic authority. Concepts are kept only when they improve the final system.

## Design objective

The finished Foundation & Spine must make this statement true:

> For any consequential piece of work, System Master can explain exactly what the user asked for, which governed goal revision was active, how the plan was derived, what policy and resource limits applied, which capability and executor were chosen, what actually executed, which external effects occurred, which artifacts and state were produced, what evidence supports the result, whether the success criteria were satisfied, and how the system recovered from any failure or uncertainty.

## Architectural principles

1. **One owner for every kind of truth.** Two systems may observe the same fact, but only one may be authoritative for it.
2. **Intent cannot be silently rewritten.** Planning, replanning, model output, recovery, or routing may not mutate the user's governed goal without an explicit goal revision.
3. **Planning is not permission.** A plan, route, resource grant, or model recommendation never grants external-effect authority by itself.
4. **Durability begins at admission.** Meaningful work is durably identified before execution starts; it is not reconstructed from UI state or model memory.
5. **Every execution is bounded.** Time, money, tokens, CPU, RAM, GPU, storage, network, tool calls, concurrency, recursion, fan-out, and child-work count are bounded and inherited.
6. **At-least-once execution is assumed at unsafe boundaries.** Effectful operations require idempotency, conflict detection, commit reconciliation, or compensation.
7. **Stale workers lose authority.** Lease/fence generation must prevent a dead or partitioned executor from continuing mutation after reassignment.
8. **Telemetry is not truth.** Logs, traces, metrics, and health signals help operate the system but cannot certify completion or override canonical state.
9. **Evidence is not the same as observation.** Claims must bind to exact work, versions, inputs, outputs, actors, and decisions.
10. **The UI is a projection.** Chat and other interfaces show and control work but do not become the canonical job database.
11. **Creative assistance is federated.** Creative Fabric may shape, critique, or coordinate creative work but cannot bypass specialist correctness, routing, resources, authorization, or effect control.
12. **External systems are untrusted until proven otherwise.** Tool descriptions, agent claims, provider metadata, external results, and protocol messages are inputs subject to validation and policy.
13. **Failure and uncertainty are explicit states.** Unknown commit, partial success, stale evidence, degraded service, unavailable provider, blocked policy, and insufficient resources are never collapsed into success.
14. **Architecture, implementation, qualification, and production admission are separate facts.** A system may be well designed but not implemented; implemented but not target-tested; target-tested but not production-admitted.
15. **A-01 is a qualification environment.** A-01 unavailability means target qualification was not executed. It does not mean design or implementation failed.

## The canonical work chain

Every non-trivial piece of work must be traceable through one causal lineage:

**User Intent**
→ **Governed Goal Revision**
→ **Work Object**
→ **Plan Revision**
→ **Plan Step**
→ **Policy / Rights / Safety Decision Set**
→ **Provisional Resource Admission**
→ **Capability Route**
→ **Exact Resource Grant**
→ **Executor Assignment**
→ **Durable Job**
→ **Execution Attempt**
→ **Model / Tool / Specialist Invocation**
→ **External Effect Receipt, if any**
→ **Canonical State / Artifact Result**
→ **Evidence Set**
→ **Completion Decision**
→ **Terminal or Recovery State**

No system may create a second competing lineage for the same work.

## Required logical systems

These are logical authorities. They may be implemented as modules within the same process or as separate services. The architecture does not require microservices; it requires unambiguous ownership.

### Identity, Time & Causality

**Owns:** principal identity, service/workload identity, session identity, actor identity, correlation ID, causation ID, monotonic ordering metadata, trusted time sources, and identity binding used by downstream systems.

**Must do:**
- distinguish user, service, model, tool, worker, and external-agent identities;
- bind requests and receipts to an authenticated actor where applicable;
- issue globally unique work/correlation identities;
- provide monotonic/fenced sequence values where wall-clock ordering is unsafe;
- support workload identity and short-lived credentials rather than long-lived shared secrets.

**Must not own:** permissions, work goals, job lifecycle, or domain semantics.

### Contract & Versioning

**Owns:** schemas, API/command/event contracts, semantic versions, compatibility rules, feature/capability descriptor versions, migration compatibility, and deprecation metadata.

**Must do:**
- reject incompatible messages before mutation;
- preserve exact version/digest identity for consequential decisions;
- distinguish backward compatibility from migration completion;
- make schema evolution explicit and testable.

**Must not own:** business policy or routing decisions.

### Security, Policy & Authorization

**Owns:** authentication policy consumption, authorization decisions, delegation rules, approval requirements, data-access policy, secret-reference policy, network/filesystem/tool access policy, and enforcement decisions.

**Must do:**
- use zero-trust principles: no implicit trust from network location or ownership;
- make authorization contextual and short-lived;
- propagate delegation ceilings into descendants;
- support human approval gates and revocation;
- separate policy decision from enforcement point;
- fail closed on unknown or stale authorization.

**Must not own:** user goals, resource scheduling, capability choice, or external-effect execution.

### Software Integrity & Supply Chain

**Owns:** trusted source/build identity, dependency provenance, artifact/build attestations, runtime binary/image identity, integrity verification policy, approved builders, and software-supply-chain standing.

**Must do:**
- cryptographically bind deployable artifacts to source/build provenance;
- verify trusted builder identity and build inputs before promotion;
- distinguish development builds from production-admissible builds;
- preserve immutable digests for binaries, packages, models, prompts/configuration bundles, and critical dependencies where feasible.

**Must not own:** runtime work evidence or user-facing artifact provenance.

### Canonical State & Data

**Owns:** authoritative structured state that is not owned by a specialist system, transactional persistence primitives, versioned records, migrations, backup/PITR metadata, consistency primitives, and projections derived from canonical state.

**Must do:**
- use transactional writes and optimistic/pessimistic concurrency as appropriate;
- preserve history where rollback/audit requires it;
- expose idempotent mutation contracts;
- support exact backup/restore identity and recovery-point reasoning;
- separate canonical state from caches/search indexes/read models.

**Must not own:** binary artifact bytes that belong in the Artifact Gateway or specialist-domain truth.

### Artifact Gateway

**Owns:** governed binary/file artifact bytes, content hashes, artifact identity, transfer state, immutable versions, quarantine, retention hooks, and artifact-to-work references.

**Must do:**
- stream large artifacts rather than assume in-memory materialization;
- protect against archive/parser bombs and path traversal;
- preserve byte-level identity and provenance links;
- support resumable transfer and integrity verification;
- quarantine untrusted or failed-validation inputs.

**Must not own:** semantic meaning of a manuscript, spreadsheet, presentation, codebase, or other specialist artifact.

### Durable Command & Event Transport

**Owns:** durable command/event delivery, outbox/inbox, deduplication, retry delivery, replay position, consumer acknowledgement, poison-message handling, and delivery ordering guarantees.

**Must do:**
- survive process restart without losing accepted messages;
- tolerate duplicate delivery;
- expose explicit ordering scope;
- bound retries and dead-letter/quarantine irrecoverable messages;
- preserve message contract/version and causal lineage.

**Must not own:** workflow state, plan semantics, or job completion.

### Evidence & Provenance

**Owns:** evidence objects, causal evidence links, provenance records, immutable receipts, claim-support relationships, evidence freshness/validity, invalidation, and trusted evidence heads/checkpoints.

**Must do:**
- bind evidence to exact subject/version/context;
- distinguish observation, decision, execution receipt, test result, and human attestation;
- make stale or superseded evidence explicit;
- prevent logs alone from being promoted to proof;
- support independently verifiable or signed checkpoints for high-trust claims.

**Must not own:** operational telemetry or the final policy of whether a claim is sufficient.

### Observability & Operations

**Owns:** metrics, traces, logs, health signals, SLOs, alerts, operational dashboards, service diagnostics, capacity signals, and operational incident views.

**Must do:**
- use consistent correlation/causation/resource attributes across signals;
- expose queue age, lease health, retry pressure, resource saturation, provider health, artifact throughput, and recovery progress;
- preserve enough diagnostics to explain failures without exposing secrets;
- keep telemetry explicitly non-authoritative for completion.

**Must not own:** evidence standing or business state transitions.

### Keel — Governed Work Contract

**Owns:** what the user wants and the limits under which the system may pursue it.

**The Keel record contains:**
- goal;
- requirements;
- constraints;
- exclusions;
- assumptions;
- success criteria;
- scope;
- priority;
- deadline/time horizon;
- delegation ceiling;
- resource/cost ceiling;
- privacy purpose and data-use constraints;
- approval requirements;
- cancellation/supersession state.

**Must do:**
- snapshot a goal revision immutably;
- require explicit revision when material intent changes;
- propagate inherited constraints to every descendant;
- bound DAG depth, fan-out, recursion, child count, and autonomous delegation;
- detect duplicate/cyclic work;
- make cancellation and supersession explicit.

**Must not own:** how the work is planned, routed, scheduled, or executed.

### Context & Memory Projection

**Owns:** construction of bounded execution context from authorized source material, conversation state, durable memory, user/project context, retrieved knowledge, and current work state.

**Must do:**
- retrieve only context authorized for the current purpose;
- carry source, freshness, trust, and scope labels;
- distinguish canonical facts from derived summaries;
- bound context size and prevent stale context from silently overriding current authority;
- support deterministic or reconstructable context snapshots for consequential attempts.

**Must not own:** source truth, user goal, permanent domain state, or model-generated facts simply because they appeared in context.

### Orchestrator

**Owns:** the executable plan for satisfying a Keel goal: plan revisions, work DAG, step dependencies, branching, join conditions, checkpoints at the plan level, replanning decisions, and plan-to-job mapping.

**Must do:**
- derive a versioned plan from the active Keel revision;
- keep hard constraints separate from optimization preferences;
- support parallelism, joins, conditional branches, partial success, and human-in-the-loop waits;
- replan only within Keel constraints;
- map every executable step to one durable job identity rather than creating competing job truth;
- persist enough plan state to recover after restart.

**Must not own:** durable attempt mechanics, resource admission, capability health, concrete executor placement, effect authorization, or specialist correctness.

### Resource Control

**Owns:** admission, multidimensional budgets, queues, priorities, fairness, starvation prevention, backpressure, reservations, grants, resource accounting, safe preemption selection, protected control/interactive capacity, and resource reclamation policy.

**Resources include:** CPU, RAM, GPU/VRAM, storage, database capacity, network, provider/API quota, model tokens, monetary cost, tool-call count, concurrency, power/thermal budget where relevant, and wall-clock budget.

**Must do:**
- issue provisional admission before routing when work is clearly unaffordable or forbidden;
- issue the final resource grant only after the concrete route/executor requirements are known;
- bind final grants to exact work, route, executor class, quantity, expiry, and fence generation;
- inherit and decrement parent budgets rather than mint child budgets;
- reserve protected capacity for user control, cancellation, recovery, and health functions;
- use fair scheduling and bounded priority/preemption;
- durably persist or deterministically reconstruct reservations/accounting needed after restart.

**Must not own:** capability selection, worker placement, or effect permission.

### Capability Registry & Router

**Owns:** capability descriptors, implementation/provider candidates, qualification standing consumed by routing, health/availability inputs, compatibility filtering, deterministic route decisions, and route snapshots.

**Must do:**
- filter by hard requirements before scoring candidates;
- account for contract compatibility, policy, safety, rights, health, resource feasibility, locality, privacy class, and current qualification standing;
- record why a route was selected;
- bind a route snapshot to an attempt;
- require re-routing when a material route property changes.

**Must not own:** resource allocation, concrete process placement, permission to create side effects, or domain correctness.

### Execution Placement & Control

**Owns:** eligible executor set, placement filtering/scoring, worker/agent assignment, execution lease, heartbeat, fencing generation, process/container isolation requirements, drain, reassignment, and enforcement of already-authorized delegation at the executor boundary.

**Must do:**
- choose only executors compatible with the route and resource grant;
- separate hard eligibility filtering from soft placement scoring;
- bind each assignment to exact work/attempt/route/resource grant;
- fence stale workers before reassignment becomes authoritative;
- support graceful drain and bounded forced termination;
- issue least-privilege credentials and environment access for the assigned attempt.

**Must not own:** user intent, capability routing, resource admission, or effect authorization.

### Durable Execution Runtime

**Owns:** durable job and attempt lifecycle, task queues, timers, signals, cancellation mechanics, retries, backoff, checkpoints, leases/fencing primitives consumed by execution control, idempotency support, compensation hooks, long-running waits, and restart-safe execution state.

**Must do:**
- survive process/machine restart without losing accepted work;
- separate deterministic workflow/control logic from non-deterministic activities where needed;
- assume activities/effects may be retried and require idempotency or reconciliation;
- enforce deadlines, heartbeat/stall detection, bounded retries, poison-job quarantine, and cancellation;
- support jobs lasting seconds to days without unbounded history or memory growth;
- make terminal state transitions explicit and monotonic where possible.

**Must not own:** the user's goal, plan semantics, route choice, or final claim that the user's success criteria were met.

### Recovery & Reconciliation

**Owns:** recovery classification and cross-system coordination when normal execution is interrupted, ambiguous, divergent, partially committed, or requires restoration.

**Must cover distinct cases:**
- work continuity after process/device restart;
- checkpoint validity and resume/handoff;
- stale worker fencing and safe reassignment;
- unknown external commit reconciliation;
- message replay/deduplication coordination;
- resource reclamation after safe fence/drain;
- compensation/saga reconciliation;
- state divergence repair;
- canonical-data disaster recovery and restore validation.

**Must do:**
- choose recovery strategy based on exact failure class;
- never retry an ambiguous side effect blindly;
- preserve partial-success truth;
- prove recovered state before reopening mutation authority;
- keep disaster recovery distinct from ordinary workflow retry.

**Must not become:** a second job engine, second database, or second router.

### Model Gateway

**Owns:** model/provider registry, model capability metadata, inference execution interface, prompt/configuration package identity, structured-output enforcement, provider quotas and runtime health consumption, model fallback within an authorized route family, and inference receipts.

**Must do:**
- bind every inference to work/attempt/context/model/prompt/config versions;
- enforce token, cost, latency, privacy, and safety limits;
- validate structured outputs before downstream use;
- distinguish local/private from remote/provider execution classes;
- handle provider failure without silently widening data exposure or permissions.

**Must not own:** the user's goal, durable workflow state, final authorization, or domain truth.

### Tool & Effect Gateway

**Owns:** tool invocation boundary and all external side effects, including effect preflight, commit-time authorization, idempotency/conflict identity, sandbox admission, effect receipt, compensation metadata, and unknown-commit state.

**Must do:**
- treat read-only tools differently from mutating tools;
- reauthorize consequential mutations at commit time;
- issue immutable receipts for effects;
- require idempotency or reconciliation for retryable writes;
- sandbox filesystem/network/process/tool access by least privilege;
- block effects when authority is stale, revoked, unknown, or insufficient.

**Must not own:** resource admission, route selection, or work planning.

### Creative Fabric

**Owns:** cross-system creative participation, creative work-graph specifications, design/creative context projections, creative quality profiles, coherence evaluation, creative degradation/failure policy, and bounded creative coordination.

**Every capability uses one mode:**
- `REQUIRED` — creative participation is necessary;
- `ASSISTED` — creative participation may improve the result;
- `OBSERVED` — Creative Fabric evaluates/coheres but does not control specialist execution;
- `BYPASS` — creative mediation is intentionally absent from the critical path.

**Must do:**
- preserve specialist correctness and sovereignty;
- submit executable creative plans to the normal Orchestrator/Resource/Router/Execution chain;
- isolate branch-level creative failure where safe;
- make quality profile and creative standing explicit.

**Must not own:** routing, durable jobs, resources, effect permission, artifact bytes, evidence truth, rights truth, or specialist correctness.

### Interoperability Gateway

**Owns:** translation/adapters for external protocols and agent/tool ecosystems such as MCP, agent-to-agent protocols, webhooks, CloudEvents-like envelopes, external job systems, and telemetry adapters.

**Must do:**
- authenticate peers and bind external identity to internal identity;
- validate contracts, payload sizes, callbacks, fan-out, and rate limits;
- treat remote descriptions/results as untrusted content;
- preserve provenance from external calls;
- map external operations into internal Keel/Policy/Router/Effect boundaries rather than bypassing them.

**Must not allow:** an external agent or tool to mint internal authority simply by advertising a capability.

### Human & Operator Control

**Owns:** human approvals, intervention requests, pause/resume/cancel/kill controls, emergency stop, operational override workflows, commissioning controls, break-glass procedures, and operator-facing reconciliation actions.

**Must do:**
- require explicit identity and reason for privileged intervention;
- preserve an audit/evidence receipt for consequential overrides;
- distinguish user cancellation from operator termination and system preemption;
- keep emergency paths bounded, observable, and revocable.

**Must not silently rewrite:** Keel intent, evidence, or policy history.

### Rights & Usage

**Owns:** machine-actionable rights/licensing/permission/attribution/usage constraints for source material, generated content, assets, models, datasets, and publication/commercial use.

**Must do:**
- attach rights standing to relevant inputs/outputs;
- block or constrain routes/effects when rights are absent or incompatible;
- preserve attribution/usage obligations where required;
- distinguish technical permission from legal advice; unresolved legal questions become explicit human-review requirements.

**Must not own:** security authorization or creative quality.

### Safety & Risk

**Owns:** cross-cutting risk classification, model/agent autonomy tier, evaluation/red-team requirements, unsafe-action classes, residual-risk standing, risk acceptance/escalation, and release/operation safety constraints.

**Must do:**
- classify consequential work before high-autonomy execution;
- bind required safeguards/evaluations to risk tier;
- detect behavior/model drift that invalidates prior safety standing;
- force human review when residual risk exceeds configured tolerance.

**Must not own:** evidence bytes, policy enforcement mechanism, or domain correctness.

### Assurance & Completion

**Owns:** the decision logic that determines whether a step, job, goal, system, or release has sufficient evidence to claim a defined outcome.

**Must do:**
- evaluate Keel success criteria against specialist result standing, effects, artifacts, evidence, rights, safety, and required human decisions;
- distinguish worker completion from task success;
- support partial success, blocked, inconclusive, cancelled, superseded, failed, recovered, and complete outcomes;
- prevent a positive claim when required evidence is stale, missing, invalidated, or out of scope;
- make the exact claim boundary explicit.

**Must not create:** specialist truth or evidence it did not receive.

## End-to-end operating sequence

A normal work item follows this sequence:

1. An ingress surface captures the user's instruction and binds principal/session/correlation identity.
2. Security/Policy establishes the current authority context.
3. Keel creates or revises the governed goal contract.
4. Context & Memory Projection assembles a bounded, source-labeled context snapshot.
5. The Orchestrator produces a versioned plan DAG bound to the exact Keel revision.
6. Rights, Safety/Risk, and Policy preflight the plan/steps that require those decisions.
7. Resource Control performs provisional admission and rejects or queues clearly unaffordable work.
8. Capability Routing chooses a qualified compatible route for each executable step.
9. Resource Control issues the final route-bound reservation/grant.
10. Execution Placement selects an eligible executor and creates the fenced assignment.
11. Durable Execution activates the job/attempt and persists lifecycle state.
12. The executor invokes models, tools, specialist systems, or Creative Fabric as specified by the route and plan.
13. Consequential external effects pass through Tool & Effect Gateway commit-time authorization.
14. Structured state and artifacts are written through their canonical owners.
15. Durable Transport carries commands/events without becoming workflow truth.
16. Evidence & Provenance records receipts and causal relationships.
17. Observability emits non-authoritative operational signals throughout.
18. Assurance & Completion decides whether the step/goal satisfies its declared success criteria.
19. If any layer reports ambiguity/failure/divergence, Recovery & Reconciliation selects the correct recovery path before mutation authority resumes.
20. UX/Chat receives a projection of current state and can issue governed pause/cancel/approval/revision commands.

## Required boundary contracts

The implementation must define explicit versioned contracts for these seams:

- ingress → Keel;
- Keel → Orchestrator;
- Keel → descendant budget/delegation inheritance;
- context projection → model/specialist invocation;
- Orchestrator → durable job creation;
- Orchestrator → Resource Control provisional request;
- Resource Control → Router feasibility context;
- Router → Resource Control exact route requirements;
- Resource Control → Execution Placement grant;
- Router → Execution Placement route snapshot;
- Execution Placement → Durable Runtime assignment/lease/fence;
- Durable Runtime → Tool/Model/Specialist invocation;
- Tool Gateway → Policy commit authorization;
- execution → State/Artifact owners;
- every consequential action → Evidence/Provenance;
- evidence/result → Assurance & Completion;
- any ambiguous terminal transition → Recovery & Reconciliation;
- all systems → Observability;
- Human/Operator Control → all governed control points.

No implementation may substitute an undocumented shared database write for one of these contracts.

## Duplicate authorities that are forbidden

The following architecture patterns are explicitly prohibited:

- a second work/job database inside the Orchestrator when Durable Execution already owns job/attempt lifecycle;
- a second scheduler inside Execution Placement when Resource Control owns admission/fairness/priorities;
- a second capability registry inside the executor layer;
- a second effect-authorization path inside a tool adapter;
- a second artifact truth inside Chat, Creative Fabric, or a specialist adapter;
- a second evidence truth inside observability/logging;
- a second user-intent truth inside model memory or plan state;
- a second rights or safety policy engine hidden inside individual providers;
- a Creative Fabric route that bypasses normal resource, routing, execution, and effect controls;
- an external-agent protocol that directly grants internal authority;
- a recovery service that independently mutates state without the owning system's reconciliation contract.

## Long-running work requirements

The Foundation & Spine must support work lasting seconds, hours, days, or longer.

For long work it must provide:
- durable progress and checkpoints;
- exact pause/cancel/resume semantics;
- bounded event/history growth;
- deadline and heartbeat monitoring;
- resumable large artifact transfer;
- resource/cost budget continuity across restarts;
- safe provider failover without privacy/rights widening;
- human approval waits that do not consume active compute;
- partial-result preservation;
- device/app disconnect without job loss;
- user-visible blockers and uncertainty;
- maintenance/restart handoff without duplicate effects.

## Resource and failure requirements

The system must remain controllable under pressure. User control, cancellation, health, fencing, recovery, and evidence persistence receive protected capacity and may not be starved by background work.

The implementation must handle at minimum:
- CPU/RAM/GPU saturation;
- low disk / full disk;
- database pressure/restart;
- network partition/outage;
- provider quota/outage;
- worker process crash;
- machine reboot;
- duplicate/delayed/out-of-order messages;
- stale executor continuing after reassignment;
- unknown external side-effect commit;
- corrupted or incomplete artifact;
- corrupted/stale evidence;
- lost credentials / revocation;
- clock skew;
- large fan-out and retry storms;
- recursive agent/tool loops;
- cancellation during execution or effect commit;
- partial cross-system completion.

## Research-informed design choices

This architecture deliberately adopts mature industry patterns rather than inventing weaker substitutes:

- **Durable execution:** deterministic/replayable workflow state, durable timers/signals, retries, idempotent activities, and restart-safe long-running work, consistent with mature durable-workflow systems such as Temporal.
- **Scheduling and placement:** hard feasibility filtering before scoring/binding, explicit reservation/permit stages, priority/preemption with protected critical capacity, consistent with modern scheduler design such as Kubernetes.
- **Zero trust:** no implicit trust from location; authenticate and authorize subjects/workloads before resource access, consistent with NIST SP 800-207/207A.
- **Workload identity:** short-lived workload identities and mutual authentication patterns consistent with SPIFFE/SVID concepts.
- **Policy separation:** policy decision separated from enforcement, consistent with OPA-style architecture.
- **Observability:** correlated traces, metrics, logs, events, and resource identity using common semantic conventions, consistent with OpenTelemetry.
- **Software provenance:** cryptographically bound build/source provenance and trusted builder identity, consistent with SLSA provenance principles.

These references guide design; System Master does not depend on using any one external product.

## What is deliberately not a separate system

The architecture does not create standalone authorities for concepts that are better owned elsewhere:

- **Agent memory** is not truth; durable memory is canonical state plus Context & Memory Projection.
- **A generic 'AI agent authority'** does not exist; agents operate within Keel, policy, resources, routing, placement, durable runtime, tool/effect, and safety boundaries.
- **A second workflow engine** does not exist inside Creative Fabric or specialist systems.
- **A universal creative executor** does not exist.
- **A universal semantic database** does not exist; specialist systems retain domain truth.
- **A separate cost scheduler** does not exist; cost is a resource dimension, while financial reporting may be a separate product concern.
- **A-01** is not a runtime system; it is a qualification environment.

## Architecture lock

The Foundation & Spine is considered architecturally defined by this specification when:

- every consequential shared responsibility maps to exactly one logical owner above;
- every boundary has a versioned contract;
- no required capability depends on an undocumented duplicate authority;
- all descendant work can be traced through the canonical work chain;
- all external effects remain separately authorized;
- all resource use remains bounded and attributable;
- every completion claim is evidence-bounded;
- failure and recovery ownership is unambiguous.

Changes to these ownership boundaries require an explicit revision to this specification. Implementation detail may evolve freely inside a boundary so long as its contracts and invariants remain satisfied.
