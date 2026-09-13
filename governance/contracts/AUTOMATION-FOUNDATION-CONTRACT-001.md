# AUTOMATION — Foundation Contract 001

**Capability** `C01` · **Owner** `SYSTEM_MASTER/PROGRAMMING` · **Lane** PROGRAMMING · **Effective** 2026-09-13
**Authority** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Foundation implementation** `AUTOMATION-FOUNDATION-1.0`

> **Foundation 1.0 implementation accepted for deterministic automation-plan compilation and verification only.** C01 owns automation engineering semantics. It does not own the runtime clock, queued-job claim authority, shell execution, connector/browser action authority, credentials, network side effects, or external publication. OVERNIGHT plans explicitly preserve P11/CORE as the scheduling and claim boundary.

## 1. Contract / interface

Provide a headless PROGRAMMING-owned compiler/verifier for declarative automation graphs:

- implementation: `tools/automation_plan.py`
- build: `python3 tools/automation_plan.py build <automation.json> <output>`
- verify: `python3 tools/automation_plan.py verify <output>`
- input schema: `AUTOMATION-SPEC-1.0`
- output: `automation-plan.json`, schema `AUTOMATION-PLAN-1.0`
- qualification: `python3 .github/scripts/automation-foundation-qualify.py`
- representative corpus: `qualification/automation/corpus/basic/automation.json`
- CI: `.github/workflows/automation-foundation-qualification.yml`

An automation declares an id, name, execution class (`ON_DEMAND` or `OVERNIGHT`), and an ordered dependency graph of steps. Each step names an allocated C00-C49 capability, operation identifier, effect class, and dependencies. The compiler binds every target to the owner recorded by the current authority-selected capability crosswalk, validates the graph, calculates a deterministic topological order, and emits a SHA-256-bound plan with no timestamp.

Foundation 1.0 does not execute steps. The CLI intentionally exposes only `build` and `verify`.

## 2. Ingress routes

- Chat/System Master or a Programming-owned build packet may supply a local `automation.json` specification.
- `build` admits the specification only when `CURRENT-AUTHORITY.json` resolves a readable canonical capability crosswalk.
- Every target capability must be currently allocated/owned; reserved and authority-deferred C identifiers fail closed.
- Step ids must be unique, dependencies must reference existing steps, self-dependencies and cycles are rejected, and schema/operation/effect values must be admitted by Foundation 1.0.

`OVERNIGHT` is a planning classification only. It does not admit work to P11 or create an A-01 claim.

## 3. Egress routes

- A caller-selected local directory containing only `automation-plan.json`.
- The plan carries deterministic graph order, current authority/crosswalk hashes, target owners, per-step authority requirements, and a plan SHA-256.
- Qualification writes `qualification-output/automation-foundation-1.0.json` and CI preserves it as `automation-foundation-1.0-evidence`.
- A future admitted adapter may translate an `OVERNIGHT` plan into P11-compatible handoff/coordination contracts, but Foundation 1.0 has no such dispatch path.

There is no shell, connector, browser, provider, credential, network, scheduler, claim, publication, or external-side-effect egress.

## 4. Persistence and canonical writer

`tools/automation_plan.py` is the canonical writer for the Foundation 1.0 local plan artifact. It writes only to a caller-selected path that does not already exist, stages output in a sibling temporary directory, then promotes the completed plan by filesystem rename. Existing output is never overwritten or deleted.

C01/PROGRAMMING is canonical owner of automation-definition and plan semantics. P11/CORE remains canonical owner of the night scheduler queue, local clock, and claim authorization. CONNECTED_ACTIONS remains owner of connector/browser action execution.

## 5. Dependencies

- `governance/CURRENT-AUTHORITY.json` — selects the current capability crosswalk.
- Current capability crosswalk — supplies target capability allocation and owner binding.
- Python 3 standard library only for Foundation 1.0 compilation/verification.
- **P11 Night scheduler and claim authority** — required downstream for actual `OVERNIGHT` scheduling; not invoked by Foundation 1.0.
- **CONNECTED_ACTIONS** — required downstream for any connector/browser/external side effect; not invoked by Foundation 1.0.

Foundation 1.0 has no network, shell, package-manager, credential, provider, browser, connector, or device dependency.

## 6. Failure semantics

Fail closed on malformed JSON, unknown schema fields, unsupported execution/effect classes, invalid identifiers, duplicate step ids, duplicate/unknown/self dependencies, dependency cycles, unallocated/reserved/deferred capability targets, stale target ownership, stale authority/crosswalk hashes, plan-body hash mismatch, plan authority-boundary drift, plan schema drift, or any attempt to mark a step executable by Foundation 1.0.

External-side-effect intents are never executable here; they are labeled `SEPARATE_CONNECTED_ACTIONS_AND_USER_AUTHORITY_REQUIRED`. Local/read-only intents still require a separately admitted downstream executor. `OVERNIGHT` plans are labeled `SYSTEM_MASTER/CORE/P11_REQUIRED` and never acquire clock or claim authority.

Repeated compilation of the same specification against byte-identical authority/crosswalk inputs produces byte-identical plans and the same `plan_sha256`.

## 7. Evidence target

The qualification command writes `qualification-output/automation-foundation-1.0.json`. Evidence includes source identity, corpus path, deterministic-repeat result, plan SHA-256, plan-file SHA-256, dependency-graph validation, tamper detection, current-authority binding, and explicit denials for step execution, clock authority, claim authority, shell execution, network access, connector action authority, and browser action authority.

Each compiled `automation-plan.json` separately binds `CURRENT-AUTHORITY.json` and the selected capability crosswalk by id/path/SHA-256, records the owner of every target capability, and carries `plan_sha256` over the complete plan body.

## 8. Acceptance target

Foundation 1.0 implementation acceptance requires all of the following:

1. `python3 -m unittest tests.test_automation_plan` passes.
2. `python3 .github/scripts/automation-foundation-qualify.py` passes against `qualification/automation/corpus/basic/automation.json`.
3. Two independent compiles produce byte-identical `automation-plan.json` files and the same `plan_sha256`.
4. Dependency cycles, unknown dependencies, reserved/deferred targets and destructive output replacement fail closed.
5. Verification detects plan tampering and also rejects a re-hashed plan that attempts to relax a step's authority requirement.
6. Target capability owners are derived from the current authority-selected crosswalk rather than caller assertions.
7. `OVERNIGHT` output states `SYSTEM_MASTER/CORE/P11_REQUIRED`, while clock and claim authority remain `NOT_GRANTED`.
8. External-side-effect intents remain non-executable and state `SEPARATE_CONNECTED_ACTIONS_AND_USER_AUTHORITY_REQUIRED`.
9. The CLI exposes no run, execute, schedule, shell, dispatch or publish command.
10. `.github/workflows/automation-foundation-qualification.yml` executes unit tests, qualification, canonical census verification and evidence preservation.

Passing these checks closes the C01 deterministic automation-plan engineering substrate gap. It does not make the execution runtime, P11 adapter, CONNECTED_ACTIONS targets, credentials, or production automation complete.

## 9. Authority boundary

PROGRAMMING/C01 may define declarative automation graph semantics, deterministic planning, dependency validation, target-owner binding, and local plan verification. It may not own or emulate CORE's clock/claim authority, execute arbitrary shell commands, bypass A-01 admission, acquire credentials, invoke connectors/browser actions, perform external side effects, publish, or promote production jobs.

P11 remains the exclusive scheduling/claim boundary for queued night work. CONNECTED_ACTIONS and the relevant capability owner remain required for external actions, with user/human authority where applicable.

## 10. Remaining gaps after Foundation 1.0

- A separately admitted C01-to-P11 handoff adapter is still required before deterministic plans can become queued night work.
- Runtime executor adapters and typed operation payload schemas remain outside Foundation 1.0.
- Retry/backoff, resumability, checkpoints and long-job execution semantics remain execution-runtime concerns unless separately admitted.
- Browser/connector/provider actions, credentials, user authorization and external side effects remain outside C01 Foundation 1.0.
- P11's own contract records remaining claim-selection/contention coverage and scheduler-level night-budget gaps; C01 does not inherit or close them.
