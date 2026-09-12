# SECOND-SHIFT-CONTROL-GATEWAY-CG-001 — MISSION / AUTHORITY / NON-SCOPE / CHANGE-CONTROL FREEZE

Status: **FROZEN — MISSION v1.0**  
Operation: `SECOND-SHIFT-CONTROL-GATEWAY-CG-001`  
Authority date: 2026-09-11 America/New_York  
Base Second-Shift lineage subject: `6d0602660c8544bfd15f07f19752f9b51d04c55e`  
External qualified ingress candidate retained for CG-002 rebind: `8ba81e2fba9da87f95675dd868dd34d1d264d7a3`

## 1. Frozen mission

The Second-Shift Control Gateway is the authoritative control boundary between ChatGPT and all ChatGPT-originated work/data intended for GitHub or A-01 execution.

Its purpose is to prevent a conversation from independently inventing repository structure, losing workstream state, selecting the wrong branch/path/SHA, sending incomplete or incorrectly routed work to A-01, duplicating work after a chat crash, or executing work in the wrong order.

All outbound work that can create durable GitHub state or cause A-01 execution must pass through the gateway. The gateway reconstructs authoritative state, validates the proposed operation, verifies predecessor/ownership/routing/dependencies/qualification, orders the work, records the decision durably, and only then admits the work to GitHub or A-01.

A chat is an operator and proposer. It is never the durable source of controller authority.

## 2. Authority domains

The gateway permanently owns these six authority domains:

1. **State authority** — workstream, current operation, predecessor, authoritative SHA, repository, branch, allowed paths, dependency state, qualification state and next legal operation.
2. **GitHub admission authority** — no chat-originated state-changing GitHub operation is valid until the gateway grants admission.
3. **Validation authority** — code, schemas, routing, interfaces, ownership, architecture contracts, dependencies, artifacts and qualification requirements are checked before release beyond the gateway.
4. **A-01 admission authority** — no A-01 execution is valid unless the gateway has admitted the exact operation and payload.
5. **Execution-order authority** — the controller owns dependency order, priority, concurrency, cancellation, immediate/delayed execution and overnight scheduling. A-01 SecondShiftSupervisorV2 is the local execution/scheduling authority that enforces this admitted plan; GitHub triggers/watchdogs are not a competing scheduler.
6. **Recovery authority** — durable reconstruction after chat crash, duplicate conversation, process restart, power loss, ambiguous dispatch, retry or partial operation.

## 3. Mandatory mission requirements

`CG1-001` — All ChatGPT-originated outbound work/data intended to create or change GitHub state or cause A-01 execution must cross this gateway.

`CG1-002` — Every admitted operation must bind a durable workstream ID, operation ID, exact predecessor, authoritative subject, repository and route.

`CG1-003` — GitHub mutation must be constrained to the admitted repository, branch/ref and allowed paths/effects.

`CG1-004` — The gateway must validate code/routing/contracts/schemas/dependencies/qualification obligations before release beyond the gate.

`CG1-005` — A state-changing GitHub operation requires a durable predecessor-bound GitHub admission receipt.

`CG1-006` — A-01 execution requires a durable predecessor-bound A-01 admission receipt.

`CG1-007` — Exactly one authoritative scheduling/execution owner exists for the same task. GitHub may persist intent/evidence and emit wake hints but may not independently schedule the same work.

`CG1-008` — Immediate, delayed, dependency-gated and overnight work must use one durable dependency/order model.

`CG1-009` — Controller state must survive chat termination and allow a later conversation to reconstruct the exact authoritative state without guessing from chat history.

`CG1-010` — Bare `Continue` means: retrieve `NEXT_LEGAL_OPERATION`, verify its exact predecessor and authority, then perform only that transition. Missing/ambiguous/stale state forbids mutation.

`CG1-011` — Ambiguous authority, SHA mismatch, stale state, invalid route, missing prerequisite, conflicting command identity or unverifiable protection must fail closed or defer explicitly; none may be converted into success.

`CG1-012` — Duplicate delivery/replay must be idempotent; command identity and external-effect identity must prevent duplicate semantic mutations.

`CG1-013` — Execution results, qualification evidence, failures and terminal receipts must return to durable controller state so status can be reconstructed independently of the originating chat.

`CG1-014` — Actual A-01 Windows qualification is mandatory before production activation.

`CG1-015` — Unit tests, simulation, GitHub-hosted tests or other host qualification may qualify components, but may not substitute for actual A-01 qualification of the integrated controller.

`CG1-016` — The controller is infrastructure/control-plane orchestration for ChatGPT ↔ GitHub ↔ A-01. It is not part of System Master product/runtime architecture. System Master may be a workload/repository operated through the gateway.

`CG1-017` — This mission may not be reinterpreted by a future chat. Mission-level change requires explicit user-authorized operation `CONTROL-GATEWAY-MISSION-V2-CHANGE` or a later explicitly numbered mission-change operation.

Requirement denominator: **17 / 17 mission requirements**.

## 4. Admission boundary

The gateway must produce machine-verifiable admission decisions. At minimum, an admitted operation binds:

- `mission_version`
- `workstream_id`
- `operation_id`
- `command_id` / semantic idempotency identity
- `authoritative_subject_sha`
- `predecessor_receipt`
- `repository`
- `branch_or_ref`
- `allowed_paths_or_effects`
- `routing_contract`
- `dependency_set`
- `qualification_requirements`
- `execution_class`
- `execution_order`
- `retry_timeout_policy`
- `admission_decision`
- `admission_receipt_id`

No prose statement from a chat can substitute for this durable authority.

## 5. Chat recovery rule

A later conversation must be able to retrieve, at minimum:

- current workstream;
- current operation;
- last accepted/terminal operation;
- authoritative subject SHA;
- active repository/branch/ref;
- allowed paths/effects;
- completed/open dependencies;
- GitHub admission state;
- A-01 queue/execution state;
- qualification state;
- terminal receipts/evidence;
- `NEXT_LEGAL_OPERATION`.

If the packet is absent, ambiguous, stale or predecessor-mismatched, the conversation is restricted to read-only reconciliation until authority is restored.

## 6. A-01 production gate

The integrated gateway is not production-activated until actual A-01 qualification proves the required behaviors, including service/restart recovery, ordered execution, duplicate suppression, crash-before/during/after dispatch recovery, stale-SHA fencing, wrong-route rejection, GitHub outage behavior, A-01 outage accumulation/recovery, retries/timeouts, cancellation/pause/resume, dependency gating, overnight scheduling and morning/new-chat reconstruction.

Required lifecycle:

`IMPLEMENTED → HOST-QUALIFIED → A01-QUALIFIED → PRODUCTION-ACTIVATED`

Skipping `A01-QUALIFIED` is prohibited.

## 7. Non-scope

CG-001 does not:

- define System Master product/module architecture;
- authorize direct chat bypasses to mutate GitHub or dispatch A-01 work;
- make GitHub Actions a second scheduler authority;
- make a passing unit/hosted test suite equivalent to production activation;
- declare either pre-existing controller lineage wholly canonical;
- merge/cherry-pick the controller-v2 lineage;
- resume Foundation-003;
- alter `main`.

Read-only inspection may occur for discovery/reconciliation, but read-only observations do not manufacture mutation or execution authority.

## 8. Existing-lineage disposition at CG-001

- `reliability/second-shift-controller-v2-20260911` remains the preserved Second-Shift/A-01 domain lineage and the base for this mission freeze.
- Qualified ingress code subject `8ba81e2fba9da87f95675dd868dd34d1d264d7a3` remains a qualified GitHub-control-plane component candidate, not a complete controller architecture freeze.
- `controller-v2/foundation-002d-rebuild` documentation freeze is not authoritative for the integrated control-gateway mission.
- `controller-v2/foundation-003-rebind` remains quarantined pending CG-002.

No destructive rollback is authorized by CG-001.

## 9. Change control

Mission v1.0 is frozen.

Implementation details may evolve only when they preserve all 17 mission requirements. Any proposal that removes, weakens, transfers or materially redefines one of the six authority domains is a mission change and requires explicit user authorization under `CONTROL-GATEWAY-MISSION-V2-CHANGE` (or a later explicit mission-change operation).

A future chat may not silently infer, reinterpret or broaden this mission from neighboring workstreams.

## 10. Exact successor

`SECOND-SHIFT-CONTROL-GATEWAY-CG-002 — LINEAGE REBIND / OWNERSHIP / INTERFACE / DISPOSITION FREEZE`

CG-002 must adjudicate the preserved Second-Shift/A-01 lineage and the newer `controller-v2` qualified candidates against all 17 CG-001 requirements and the existing detailed controller obligations. Every overlapping component must receive an explicit `REUSE / REPAIR / BUILD / DROP / DEFER` disposition before implementation progression resumes.
