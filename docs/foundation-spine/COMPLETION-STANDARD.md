# Foundation & Spine Completion Standard

## Purpose

This document defines what the words **designed**, **implemented**, **qualified**, **production-admitted**, and **complete** mean for the Foundation & Spine.

These words are intentionally separate. No artifact, packet, test, commit, or environment may silently promote one standing into another.

## The five standings

### Architecturally complete

A system is architecturally complete only when:
- its owned responsibilities are explicit;
- its negative boundaries are explicit;
- its required inputs/outputs are explicit;
- its state model and failure model are defined;
- persistence ownership is defined;
- security, resource, rights, safety, and evidence dependencies are defined where applicable;
- versioned boundary contracts are specified;
- no competing authority exists for the same truth;
- required qualification classes are known.

Architecture completion says what must exist. It says nothing about whether the code exists.

### Implemented

A system is implemented only when the current architecture is represented by executable code and required durable schemas/configuration, not merely interfaces, stubs, fixtures, design packets, or historical predecessor code.

Implementation must include:
- production-path logic for mandatory behaviors;
- durable persistence where the architecture requires it;
- migrations/version handling;
- negative/failure paths;
- authorization/resource/evidence hooks required by the architecture;
- automated tests that exercise the implementation rather than only validate document structure.

Implementation completion says current code exists. It does not claim the code has passed every environment-specific qualification.

### Qualified

Qualification is evidence that an exact implemented subject behaves correctly under a defined environment and test scope.

Qualification must identify:
- exact source/build subject or digest;
- environment identity;
- configuration/toolchain/provider versions relevant to the result;
- test/evaluation suite identity;
- raw results and final decision separately;
- failures, skips, unavailable dependencies, and unknowns explicitly;
- claim scope that does not exceed the evidence.

Qualification classes are cumulative only when their evidence remains valid for the exact subject.

### Production-admitted

Production admission is a separate decision made after implementation and required qualification.

Production admission requires:
- required portable and target/native gates satisfied;
- current security/risk/rights standing;
- rollback/recovery readiness;
- operational observability and alerting;
- release/build provenance;
- capacity/resource policy configured;
- operator controls available;
- no unresolved blocker that can cause false success, uncontrolled side effect, data loss, or unrecoverable work.

A qualified system is not automatically production-admitted.

### Complete

A Foundation & Spine system is complete when its architecture is complete, current implementation covers all mandatory behavior, all required qualification classes have acceptable results or are explicitly inapplicable, and any required production admission has been granted for the intended use.

The whole Foundation & Spine is complete only when every mandatory logical system in the canonical specification is complete **and** the integrated end-to-end spine passes its system-level closure tests.

## A-01 and target qualification

A-01 is one possible target qualification environment. It is not a design authority and it is not a required source of architecture truth.

Use these exact interpretations:

- `PASS` — the exact subject executed the required target test and passed.
- `FAIL` — the exact subject executed the required target test and failed an acceptance criterion.
- `NOT EXECUTED — ENVIRONMENT UNAVAILABLE` — the required environment was unavailable/disconnected, so no result exists.
- `NOT EXECUTED — PREREQUISITE BLOCKED` — a required predecessor was not ready, so execution would not be meaningful.
- `NOT APPLICABLE` — the specific target gate genuinely does not apply to the subject.

`NOT EXECUTED — ENVIRONMENT UNAVAILABLE` must never be summarized as failed, incomplete implementation, or bad architecture. It is an evidence gap only.

When A-01 later becomes available, the current exact subject is tested. Old unexecuted gates do not require architectural redesign unless the target test exposes a real defect.

## Required qualification classes

Not every logical system requires every class, but the Foundation & Spine as a whole must cover all applicable classes below.

### Contract and compatibility
- schema/API compatibility;
- malformed/unknown-version rejection;
- migration compatibility;
- stale-client/stale-worker behavior;
- deterministic descriptor/digest identity.

### State machine and lifecycle
- legal transitions;
- illegal-transition rejection;
- terminal-state monotonicity;
- cancellation/supersession;
- partial success and inconclusive states.

### Persistence and reconstruction
- round-trip persistence;
- missing/corrupt-field rejection;
- restart reconstruction;
- migration from supported prior versions;
- stale-write/concurrency rejection;
- backup/restore identity where applicable.

### Concurrency and fencing
- optimistic/pessimistic conflict handling;
- lease expiry;
- stale worker mutation rejection;
- monotonic fence generation;
- concurrent cancellation/reassignment;
- duplicate submission.

### Durable execution
- process crash;
- worker crash;
- host reboot;
- long wait/timer;
- signal delivery;
- bounded retry/backoff;
- poison-job quarantine;
- history/event growth controls.

### Resource governance
- CPU/RAM/GPU/storage/database/network pressure;
- provider quota/cost exhaustion;
- fairness and starvation prevention;
- protected control/recovery capacity;
- backpressure propagation;
- admission rejection and queueing;
- reservation/grant expiry;
- safe preemption and reclaim;
- recursive/fan-out budget enforcement.

### Security and authorization
- least privilege;
- expired/revoked credentials;
- stale approval;
- privilege escalation attempts;
- cross-tenant/context isolation if applicable;
- secret leakage prevention;
- network/filesystem/process sandbox restrictions;
- workload identity verification.

### Routing and placement
- hard feasibility filter before scoring;
- route snapshot immutability;
- unhealthy/unqualified candidate rejection;
- privacy/security class constraints;
- exact route-to-resource-to-executor binding;
- drain/fence/reassignment behavior.

### Models and tools
- structured-output validation;
- token/cost/runtime limits;
- provider outage/quota behavior;
- local/private versus remote data rules;
- tool timeout and malformed result handling;
- effect idempotency;
- unknown commit reconciliation;
- commit-time authorization.

### Artifact and data integrity
- content hash verification;
- interrupted/resumed transfer;
- large-file streaming;
- archive/parser bomb defense;
- low/full disk behavior;
- transactional state updates;
- projection/cache rebuild from canonical state.

### Evidence and provenance
- exact subject binding;
- stale-evidence invalidation;
- causal chain reconstruction;
- forged/missing receipt rejection;
- trusted checkpoint/signature verification where required;
- separation of telemetry from evidence.

### Recovery and reconciliation
- checkpoint resume;
- partial-child recovery;
- duplicated/delayed/out-of-order delivery;
- stale executor after partition;
- unknown external side effect;
- compensation/saga recovery;
- database restart;
- destructive restore rehearsal where applicable;
- recovery after low disk/resource exhaustion.

### Observability and operations
- correlation across traces/logs/metrics/events;
- secret/redaction verification;
- health/stall detection;
- actionable alerts;
- queue/resource/provider visibility;
- operator pause/cancel/kill/reconcile paths.

### Rights and safety
- missing/incompatible rights standing;
- attribution/usage obligations;
- risk-tier escalation;
- autonomy-limit enforcement;
- required human-review enforcement;
- model/behavior drift invalidating prior standing.

### End-to-end system tests

The integrated Foundation & Spine must execute representative work through the full chain:

user intent → Keel → context → plan → policy/rights/safety → resource admission → route → exact grant → executor assignment → durable execution → model/tool/specialist work → state/artifact → evidence → completion → recovery where injected.

At least the following system campaigns are required:
- normal interactive work;
- long-running background work;
- large artifact work;
- parallel DAG with join;
- human approval wait;
- cancellation at multiple phases;
- worker crash and reassignment;
- host/database restart;
- provider outage/failover;
- low-memory/low-disk pressure;
- duplicate message/effect attempt;
- unknown external commit;
- corrupted artifact/evidence;
- stale route or revoked authorization;
- resource starvation/fairness;
- cross-system partial success;
- Creative Fabric REQUIRED, ASSISTED, OBSERVED, and BYPASS examples;
- external interoperability peer treated as untrusted;
- recovery to a provably consistent terminal state.

## Endurance testing

The Foundation & Spine is specifically intended for long-running work and must prove it.

Progressive endurance testing should include 8-hour, 24-hour, 48-hour, and 72-hour campaigns for the integrated spine, with workload mixes that include interactive traffic while background work is active.

The campaign must watch at minimum:
- memory growth;
- handle/thread/process leakage;
- queue age and starvation;
- retry storms;
- lease/fence churn;
- database/storage growth;
- event/history growth;
- artifact accumulation;
- provider/token/cost accounting drift;
- telemetry cardinality;
- checkpoint/recovery correctness;
- responsiveness of pause/cancel/operator controls.

A timeout or interrupted campaign is not a pass, but if interruption is caused solely by an unavailable external test environment it must be classified as not executed/incomplete evidence rather than an implementation failure.

## Evidence freshness and invalidation

A prior qualification result remains usable only if the changed subject cannot affect the claim it supports.

Fresh qualification is required when any materially relevant item changes, including:
- implementation bytes;
- schema/contract semantics;
- policy or safety rules;
- route/capability definition;
- model/tool/provider version where material;
- critical dependency version;
- target/runtime environment where the claim depends on it;
- test/evaluation acceptance criteria.

A documentation-only clarification that does not change required behavior does not automatically invalidate implementation qualification.

## Completion gates for each logical system

For each system in `FOUNDATION-SPINE-SPECIFICATION.md`, completion requires an explicit answer to all of these questions:

1. What exact truth does this system own?
2. What truth does it explicitly not own?
3. What are its versioned input/output contracts?
4. What durable state does it own, if any?
5. How does it handle duplicate/replayed input?
6. How does it handle concurrency and stale actors?
7. How is it authorized?
8. What resources can it consume or allocate?
9. What evidence does it emit or consume?
10. What happens on crash/restart?
11. What happens when a dependency is unavailable?
12. How is cancellation/revocation handled?
13. What portable tests prove it?
14. What target/native tests are required?
15. What remains environment-dependent?
16. What production controls/alerts are required?
17. Which exact current implementation satisfies the architecture?

If any mandatory question has no answer, the system is not complete.

## Whole-spine closure rules

The Foundation & Spine may be declared complete only when:
- one canonical work chain exists end to end;
- no duplicate job, plan, route, resource, effect, artifact, evidence, or intent authority remains;
- Keel constraints survive every descendant and retry;
- route, grant, assignment, job, attempt, effect, artifact, and evidence identities remain causally linked;
- stale workers cannot mutate after reassignment;
- retries cannot duplicate consequential effects without detection/reconciliation;
- resource pressure cannot starve user control or recovery;
- model/tool/provider failures cannot silently widen privacy, rights, safety, or cost boundaries;
- recovery can distinguish retry, resume, reconcile, compensate, restore, and fail-stop cases;
- completion is adjudicated from evidence and success criteria rather than worker exit status;
- integrated target/native qualification has run where the environment is available;
- any unavailable target gate is recorded honestly as not executed rather than falsely passed or failed;
- production admission is explicit for the intended deployment profile.

## Documentation discipline after this reset

Do not create a new design document for every repair or conversation.

Future architecture changes should normally update the canonical specification and this completion standard directly, with normal source-control history preserving what changed.

Execution logs, test evidence, routing records, receipts, runbooks, incident records, implementation notes, and qualification outputs may live elsewhere, but they must not become competing architecture documents.

The objective is a small, readable design authority backed by rich evidence—not a growing pile of overlapping design packets.
