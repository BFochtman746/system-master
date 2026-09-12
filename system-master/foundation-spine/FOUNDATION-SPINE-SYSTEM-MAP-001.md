# FOUNDATION-SPINE-SYSTEM-MAP-001

Status: CANONICAL TARGET MAP

## The path of one piece of work

USER INTENT
-> FS-04 INTENT / KEEL
-> FS-05 WORK & PROJECT CONTROL
-> FS-06 PLANNING & ORCHESTRATION
-> FS-07 RESOURCE ADMISSION & BUDGETING
-> FS-08 CAPABILITY REGISTRY & ROUTING
-> FS-07 FINAL RESOURCE RESERVATION / GRANT
-> FS-09 EXECUTION PLACEMENT
-> FS-10 DURABLE EXECUTION RUNTIME
-> FS-12 CONTEXT + FS-13 MODEL + FS-14 TOOLS/CONNECTORS + SPECIALIST SYSTEMS
-> FS-15 EFFECT AUTHORITY when external mutation is proposed
-> FS-16 ARTIFACTS and/or FS-17 CANONICAL DATA
-> FS-18 EVIDENCE / PROVENANCE / ASSURANCE
-> completion adjudication
-> success OR FS-20 RECOVERY / RECONCILIATION

FS-01, FS-02, FS-03, FS-19, FS-21, FS-22, FS-23, FS-24, FS-25 and FS-26 constrain or observe the path across multiple stages.

## Mandatory authorities

### FS-01 — System Root & Authority Registry
Owns current topology, authority identities, owner mapping, canonical version pointers, system admission/retirement and product-root integration rules.

### FS-02 — Identity, Principal & Delegation
Owns principal/device/session identity, actor chains, delegated authority, capability grants, expiry/revocation and actor attribution.

### FS-03 — Contracts & Versioning
Owns versioned schemas, protocol contracts, compatibility rules, contract digests and migration compatibility declarations.

### FS-04 — Intent / Keel
Owns the governed goal contract: requested outcome, requirements, constraints, exclusions, assumptions, success criteria, priority, deadline, resource/cost ceiling, privacy/authority limits and explicit revisions.

### FS-05 — Work & Project Control
Owns long-lived work/project identity, hierarchy, milestones, progress rollup, risks/issues/changes, project memory references and the relationship between one goal and its ongoing work. It is not a second worker engine.

### FS-06 — Planning & Orchestration
Owns versioned executable plan graphs, step dependencies, branch/join logic, replanning decisions, readiness and completion logic. It references Keel; it cannot alter Keel silently.

### FS-07 — Resource Admission & Budgeting
Owns multidimensional budgets, queue/admission decisions, fairness, starvation prevention, protected capacity, backpressure, reservations, grants, release/reclaim and bounded preemption selection.

### FS-08 — Capability Registry & Routing
Owns capability descriptors, contract compatibility, qualification/health eligibility and deterministic route decisions. It chooses what qualified path can perform a step, not the concrete worker.

### FS-09 — Execution Placement
Owns executor eligibility, hard feasibility filtering, scoring, assignment, placement lease, drain and safe reassignment. It consumes a route and resource grant; it cannot self-admit or self-route.

### FS-10 — Durable Execution Runtime
Owns durable job/attempt lifecycle, queue/claim/start, leases/fencing, heartbeats, checkpoints, timers/signals, retries, cancellation, idempotency primitives and execution terminal state.

### FS-11 — Transport & Delivery
Owns durable command/event delivery mechanics: outbox/inbox, delivery attempts, deduplication, ordering where promised, replay, dead-letter/quarantine and delivery receipts. It does not own domain event meaning.

### FS-12 — Context, Memory & Retrieval Broker
Owns safe context assembly and retrieval policy across conversation, files, memory and knowledge sources. It owns retrieval/assembly metadata and privacy filtering, not promoted domain knowledge truth.

### FS-13 — Model Gateway
Owns model/provider invocation contracts, role/profile selection, model-version binding, prompt/template policy, structured output validation, fallback/degradation rules, token/context limits and model-call receipts.

### FS-14 — Tool & Connector Gateway
Owns tool/connector discovery, schema validation, invocation transport, sandbox/interface boundaries and result normalization. Merely exposing a tool does not grant permission to use it.

### FS-15 — Effect / Action Authority
Owns authorization of externally mutating actions, commit-time reauthorization, effect identity, idempotency/conflict identity, least privilege, effect receipts, compensation metadata and unknown-commit reconciliation entry.

### FS-16 — Artifact Gateway
Owns shared binary/file custody, immutable digest identity, versions/lineage, storage references, transfer integrity, retention/deletion enforcement and artifact provenance. Specialist systems retain semantic ownership of their artifact content.

### FS-17 — Canonical Data & Persistence
Owns shared structured-state persistence primitives, transactions, concurrency semantics, migrations, backups/PITR interfaces and canonical storage contracts. Domain owners retain ownership of domain data semantics.

### FS-18 — Evidence, Provenance & Assurance
Owns evidence objects, causal binding, qualification receipts, provenance, standing, evidence invalidation and claim-scope rules. It cannot manufacture evidence from logs.

### FS-19 — Observability & Telemetry
Owns standardized traces, metrics, logs, profiles, health observations and operational alerts. Telemetry is non-authoritative unless explicitly converted into an evidence object under FS-18 rules.

### FS-20 — Recovery & Reconciliation
Owns recovery coordination and policy across work continuity, executor failure, transport recovery, uncertain effects, resource reclaim and disaster recovery. It references the real source-of-truth owners rather than creating shadow truth.

### FS-21 — Security, Privacy, Secrets & Cryptography
Owns shared authorization policy enforcement, privacy purpose/data controls, secret/key/certificate custody interfaces, trust boundaries, sandbox policy, cryptographic verification and security incident constraints.

### FS-22 — Provider & Dependency Governance
Owns provider/dependency identity, approved versions, health/availability observations, quota/capability profiles, supply-chain provenance/attestation requirements, deprecation and dependency-risk standing.

### FS-23 — AI Safety & Model Risk
Owns model/agent risk tiering, autonomy ceilings, required eval/red-team profiles, safety cases, behavior-drift monitoring, model-risk exceptions and AI release standing.

### FS-24 — Rights, Licensing & Attribution
Owns operational rights/licensing/permission/attribution decisions, source/use restrictions, commercial/publication constraints and rights evidence. It does not own privacy or creative quality.

### FS-25 — UX / Chat / Work Control Surface
Owns shared interaction, progress/control projections, pause/cancel/resume requests, approvals, offline behavior, user-visible status/uncertainty and artifact navigation. It does not own job truth.

### FS-26 — Change, Migration, Release & Operator Governance
Owns governed system change, change impact, approval, maintenance windows, migrations, verification, release candidate identity, promotion/rollback/withdrawal, emergency/operator intervention and durable change receipts.

## Specialist-system relationship

Learning, Book and Documents are current semantic peers. Programming remains a distinct active work program until explicitly admitted as a peer. Future systems such as Research/Knowledge, Spreadsheet/Data, Media, AI Income and Living Portfolio may be admitted separately. All consume the spine through versioned contracts. Foundation & Spine does not acquire their domain semantics through integration.