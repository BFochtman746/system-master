# System Master Foundation & Spine — Completion & Qualification Standard

## Purpose

This document defines what **architecturally complete**, **implemented**, **qualified**, **production-admitted**, and **complete** mean for the Foundation & Spine.

Those are separate facts. A design document cannot promote implementation. Existing code cannot promote qualification. A passing portable test cannot promote target/native standing. A target pass cannot grant production admission by itself.

## Architecturally complete

A logical system is architecturally complete only when:

- its canonical responsibility is explicit;
- its negative ownership boundary is explicit;
- its required inputs/outputs and versioned contracts are defined;
- its authoritative state and persistence owner are defined;
- its concurrency, duplicate/replay, cancellation and failure behavior are defined;
- its resource/security/privacy/rights/safety dependencies are explicit where applicable;
- its recovery behavior is defined;
- no competing authority exists for the same truth;
- required qualification classes are known.

Architecture completion says what must exist. It does not assert that current code satisfies it.

## Implemented

A logical system is implemented only when the current specification is represented by executable production-path code and the required durable schemas/configuration.

Interfaces, stubs, fixtures, design packets and historical predecessor code are not sufficient by themselves.

Implementation includes:

- mandatory success-path behavior;
- mandatory negative/failure behavior;
- durable persistence where required;
- schema/version/migration handling;
- authorization, resource and evidence integration required by the specification;
- concurrency/idempotency/fencing behavior where applicable;
- automated tests that exercise the implementation rather than only document structure.

A historical implementation can be a reuse substrate, but it becomes current only when mapped/rebound to the current specification and its current contracts.

## Qualified

Qualification is evidence that an exact implemented subject behaves correctly under a defined environment and test scope.

Every qualification result identifies:

- exact code/build/artifact subject or digest;
- relevant schema/contract/configuration versions;
- dependency/model/tool/provider versions where material;
- test/evaluation suite and acceptance criteria;
- environment identity/fingerprint where material;
- raw result and final decision separately;
- failures, skips, unavailable dependencies and unknowns explicitly;
- a claim scope no broader than the evidence.

### Qualification evidence classes

At minimum, standing distinguishes:

- **DESIGN / RESEARCH** — architecture/research evidence only;
- **STATIC / STRUCTURAL** — compile, schema, lint, static analysis, contract or structural validation;
- **PORTABLE** — executable evidence in a portable/non-target environment;
- **HOSTED / CI** — executable hosted-run evidence;
- **A-01 TARGET** — exact required execution in A-01 when A-01 is the relevant target environment;
- **NATIVE** — exact OS/device/provider/database/environment behavior where native characteristics matter;
- **HUMAN / AUTHOR / OPERATOR** — required human acceptance or decision;
- **EXTERNAL / PRIVATE AUTHORITY** — required evidence controlled outside the repository/runtime;
- **PRODUCTION** — evidence from or required for the admitted production environment.

Evidence from one class cannot silently promote another.

## A-01 semantics

A-01 is a qualification environment. It is not architecture authority and is not required to define whether a system is well designed or implemented.

Use these meanings:

- **PASS** — the exact subject executed the required A-01 test and passed.
- **FAIL** — the exact subject executed the required A-01 test and failed an acceptance criterion.
- **NOT EXECUTED — ENVIRONMENT UNAVAILABLE** — A-01 was disconnected, unavailable or not connected to the qualification path; no target result exists.
- **NOT EXECUTED — PREREQUISITE BLOCKED** — an actual required predecessor was not ready, so target execution would not be meaningful.
- **NOT APPLICABLE** — the specific A-01 gate genuinely does not apply to that subject.

**NOT EXECUTED — ENVIRONMENT UNAVAILABLE is an evidence gap only. It must never be summarized as an A-01 failure, implementation failure or architecture failure.**

When A-01 later becomes available, test the current exact subject. Do not redesign the architecture merely because an earlier target test could not run.

## Production-admitted

Production admission is a separate decision after implementation and required qualification.

It requires, as applicable:

- required portable/hosted/native/target gates satisfied;
- current security/privacy/rights/safety standing;
- release/build provenance and exact candidate identity;
- rollback/recovery readiness;
- operational observability/alerting;
- capacity/resource policies configured;
- operator/emergency controls available;
- no unresolved blocker capable of false success, uncontrolled side effects, data loss, authority expansion or unrecoverable work.

A qualified system is not automatically production-admitted.

## Complete

A logical Foundation & Spine system is complete when:

- its architecture is complete;
- current implementation covers all mandatory behavior;
- required qualification classes have acceptable results or are explicitly inapplicable;
- required external/human decisions are satisfied;
- intended production admission has been granted if the system is expected to operate in production.

The entire Foundation & Spine is complete only when every mandatory logical system in the System Specification is complete **and the integrated end-to-end spine passes its system-level closure tests.**

Component completion can never substitute for whole-spine completion.

## Required qualification families

Not every logical system requires every family, but the integrated Foundation & Spine must cover every applicable family below.

### Contract, schema and compatibility

- current and supported-prior schema/API compatibility;
- malformed/unknown-version rejection;
- migration compatibility;
- stale-client/stale-worker behavior;
- deterministic descriptor/digest identity;
- no mutation through an incompatible contract.

### State machine and lifecycle

- all legal transitions;
- illegal-transition rejection;
- terminal-state monotonicity where designed;
- cancellation and supersession;
- pause/resume;
- partial success and inconclusive/unknown states;
- project/plan/job/attempt truth separation.

### Persistence and reconstruction

- round-trip persistence;
- missing/corrupt-field rejection;
- process/host restart reconstruction;
- migration from supported versions;
- stale-write/concurrency rejection;
- backup/restore identity where applicable;
- projection/cache/search rebuild from canonical truth.

### Concurrency, lease and fencing

- optimistic/pessimistic conflict handling;
- lease expiry;
- stale-worker mutation rejection;
- monotonic fence generation/equivalent stale-writer protection;
- concurrent cancellation/reassignment;
- duplicate submission;
- no double-spend of resource reservations during uncertain ownership.

### Durable execution

- process crash;
- worker crash;
- host reboot;
- long wait/timer;
- signal delivery;
- checkpoint/resume;
- bounded retry/backoff;
- poison-job quarantine;
- event/history growth controls;
- seconds-to-days jobs.

### Resource governance

- CPU, memory, accelerator, storage, database and network pressure;
- provider quota and monetary-cost exhaustion;
- token/tool-call/concurrency limits;
- fairness and starvation prevention;
- protected user-control/recovery capacity;
- backpressure propagation;
- admission rejection/queueing;
- route-bound reservation/grant expiry;
- safe preemption/reclaim;
- recursive/fan-out parent budget enforcement;
- local power/thermal pressure where material.

### Routing and placement

- hard eligibility filtering before scoring;
- route snapshot identity;
- unhealthy/unqualified/incompatible candidate rejection;
- privacy/security/rights/safety/locality constraints;
- exact route → resource grant → assignment binding;
- drain, fence and safe reassignment;
- no placement-side route substitution.

### Security, privacy, secrets and authorization

- least privilege;
- expired/revoked credentials and grants;
- stale approval;
- privilege escalation attempts;
- workload identity verification;
- sandbox/network/filesystem/process restrictions;
- secret leakage prevention;
- retrieved/tool/peer-agent prompt-injection attempts;
- privacy-purpose/locality enforcement;
- delegation cannot widen parent authority.

### Models, tools, connectors and effects

- structured-output validation;
- token/cost/runtime/context limits;
- provider outage/quota behavior;
- local/private versus remote data constraints;
- tool timeout, malformed result and hostile content handling;
- effect commit-time authorization;
- effect idempotency/conflict identity;
- lost acknowledgement/unknown commit reconciliation;
- compensation where supported;
- model/tool availability cannot widen authorization.

### Artifact and data integrity

- content-digest verification;
- interrupted/resumed transfer;
- large-file streaming;
- path traversal/archive/parser-bomb defense;
- low/full-disk behavior;
- transactional state update;
- migration/rollback integrity;
- artifact lineage across retries/recovery.

### Evidence and provenance

- exact-subject binding;
- stale-evidence invalidation;
- causal chain reconstruction from result back to user intent;
- forged/missing/incorrect receipt rejection;
- trusted checkpoint/signature/attestation verification where required;
- telemetry/evidence separation;
- claim scope cannot exceed evidence class.

### Recovery and reconciliation

- checkpoint validity and resume;
- partial-child recovery;
- duplicate/delayed/out-of-order delivery;
- stale executor after partition;
- expired resource grant;
- unknown external side effect;
- compensation/saga recovery;
- provider/network outage;
- database restart;
- destructive restore rehearsal where applicable;
- recovery after storage/resource exhaustion;
- re-entry gate proves consistency before normal mutation resumes.

### Observability and operations

- correlation across traces/logs/metrics/events;
- secret/redaction verification;
- health/stall detection;
- actionable alerts;
- queue/resource/provider/recovery visibility;
- pause/cancel/kill/reconcile paths;
- telemetry cardinality and retention controls;
- telemetry cannot directly promote business completion.

### Rights and AI safety

- missing/incompatible rights standing;
- attribution/use obligations;
- commercial/publication restrictions;
- model/agent risk-tier escalation;
- autonomy-ceiling enforcement;
- required human-review enforcement;
- behavior/model drift invalidating prior standing;
- provider/model health cannot override safety standing.

### Change, migration, release and supply chain

- change impact and stale-base conflict;
- dependency/model/tool/provider version drift;
- provenance/attestation verification;
- migration forward/rollback behavior;
- release candidate exact identity;
- withdrawal/rollback;
- operator emergency intervention and subsequent reconciliation.

## Required end-to-end system campaigns

Representative work must traverse the full chain:

**user intent → Keel → Work/Project → context → plan → policy/privacy/rights/safety → resource admission → route → exact resource grant → executor assignment → durable execution → model/tool/connector/specialist work → effect control → state/artifact → evidence → completion → recovery when injected**.

The integrated qualification suite includes at minimum:

- normal interactive work;
- long-running autonomous/background work;
- large-artifact work;
- parallel DAG with joins;
- nested child work under inherited limits;
- human approval wait;
- cancellation before admission, while queued, during execution and around effect commit;
- worker crash and reassignment;
- host and database restart;
- provider outage and allowed/not-allowed fallback;
- CPU/memory/storage pressure;
- duplicate messages and duplicate effect attempts;
- unknown external commit;
- corrupt checkpoint/artifact/evidence;
- stale route, revoked authorization or expired grant;
- starvation/fairness/preemption;
- cross-specialist partial success;
- Creative Fabric REQUIRED, ASSISTED, OBSERVED and BYPASS cases;
- hostile/untrusted external agent/tool content;
- recovery to a provably consistent terminal state.

## Endurance testing

The Foundation & Spine is explicitly intended for long-running work and must prove that property.

Progressive endurance campaigns should include approximately 8-hour, 24-hour, 48-hour and 72-hour runs, with interactive/control traffic operating while background work continues.

Monitor at minimum:

- memory growth/leaks;
- thread/process/handle leakage;
- queue age/starvation;
- retry storms;
- lease/fence churn;
- database/storage/event-history growth;
- artifact accumulation;
- provider/token/cost accounting drift;
- telemetry cardinality;
- checkpoint/recovery correctness;
- resource backpressure;
- responsiveness of pause/cancel/operator controls.

A timeout or interrupted campaign is not a pass. If the interruption occurred solely because an external target environment such as A-01 was unavailable, record it as unexecuted/incomplete evidence, not as an implementation failure.

## Evidence freshness and invalidation

Prior qualification remains reusable only when a changed subject cannot affect the supported claim.

Fresh evidence is required when materially relevant implementation bytes, schema/contract semantics, policy/safety rules, route/capability definition, model/tool/provider version, critical dependency, target/runtime environment, ownership boundary or acceptance criteria change.

A documentation-only clarification that does not change required behavior does not automatically invalidate implementation evidence.

## Completion questions for every logical system

Before any logical system is marked complete, we must be able to answer:

1. What exact truth does it own?
2. What does it explicitly not own?
3. What are its current versioned contracts?
4. What durable state does it own, if any?
5. How does it handle duplicate/replayed input?
6. How does it handle concurrency and stale actors?
7. How is access/authority controlled?
8. What resources can it consume or allocate?
9. What evidence does it emit or consume?
10. What happens on process/host restart?
11. What happens when a dependency is unavailable?
12. How are cancellation/revocation/supersession handled?
13. What portable tests prove it?
14. What target/native tests are required?
15. What remains environment-dependent?
16. What production controls/alerts are required?
17. Which exact current implementation satisfies the specification?

If a mandatory answer is missing, the system is not complete.

## Whole-spine closure

The Foundation & Spine may be declared complete only when:

- one canonical work chain exists end to end;
- no duplicate intent, work, job, plan, route, resource, effect, artifact or evidence authority remains;
- Keel constraints survive descendants, retries and replanning;
- route, grant, assignment, job, attempt, effect, artifact and evidence identities remain causally linked;
- stale workers cannot mutate after reassignment;
- retries cannot duplicate consequential effects without detection/reconciliation;
- resource pressure cannot starve user control or recovery;
- provider/model/tool failures cannot silently widen privacy, rights, safety, authority or cost boundaries;
- Recovery distinguishes retry, resume, replan, reconcile, compensate, restore and fail-stop cases;
- completion is adjudicated from explicit success criteria and evidence rather than worker exit status;
- required target/native qualification has actually executed where the environment is available;
- unavailable target gates are recorded honestly as unexecuted rather than falsely passed or failed;
- production admission is explicit for the intended deployment profile.

## Documentation discipline

Do not create another canonical design file to record a repair. Change the System Specification or this standard directly and let Git history preserve the old version.

Implementation notes, logs, qualification receipts, test outputs, routing records, incidents and forensic evidence may accumulate elsewhere, but they do not become competing architecture documents.
