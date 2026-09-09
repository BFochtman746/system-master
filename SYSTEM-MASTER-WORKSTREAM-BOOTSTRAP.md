# System Master Repository Bootstrap

This file is the cross-chat entry point for all work in `BFochtman746/system-master`.

## Mandatory topology startup — read first

Before interpreting a branch name, chat title, ticket, workflow, qualification or historical handoff as project authority, read:

1. `governance/SYSTEM-TOPOLOGY-001.json`
2. `governance/ADR-0001-FOUR-SYSTEM-TOPOLOGY.md`

The repository has exactly four canonical systems:

- **MASTER SYSTEM** — foundation and spine.
- **LEARNING SYSTEM** — learning system development and operation.
- **BOOK SYSTEM** — parent end-to-end book lifecycle/orchestration.
- **PROSE SYSTEM** — child of Book System; evaluation, evaluator training, prose/craft training, diagnostics and preservation-aware prose optimization.

`SYSTEM` is a reserved architecture term. No branch, workstream, qualification, repair line, chat, scheduled worker, implementation engine or evidence lane creates another system. If a label conflicts with the topology registry, the topology registry controls.

Assurance/reconciliation and continuity belong to MASTER. A-01 is shared qualification/control infrastructure, administratively owned under MASTER. Book Evaluator belongs to PROSE. Literary Prose Engine is the current PROSE implementation family. Night/Second Shift is execution infrastructure.

A fifth system requires explicit user intent plus a superseding topology ADR and registry update. Generic continuation, a new branch or a new qualification is not sufficient authority.

## Canonical system routing

### MASTER SYSTEM

- control branch: `system-master/control-v2`
- control record: `system-master/control-v2/SYSTEM-MASTER-V2-CONTROL-RECORD.md`
- scope: foundation/spine, shared platform/data architecture, continuity/recovery, assurance/reconciliation and shared integration/control-plane concerns.

For MASTER engineering priority, the live `system-master/control-v2` record controls over historical reset/handoff documents on `main`.

### LEARNING SYSTEM

- control branch: `learning/control-v1`
- control record: `learning/control-v1/LEARNING-CONTROL-RECORD.md`
- historical implementation, qualification, request and pilot branches are evidence/execution history unless the control record explicitly selects one.

### BOOK SYSTEM

- control branch: `book-system/control-v1`
- control record: `qualification/book-system/BOOK-SYSTEM-PROJECT-HIERARCHY-002.json`
- scope: canonical book state, end-to-end lifecycle, orchestration/admission, author decisions, version/rollback and publication/export lifecycle.

### PROSE SYSTEM

- implementation/control branch: `literary-prose-engine-001`
- parent binding: `qualification/literary-prose-engine-001/PROSE-SYSTEM-PARENT-BINDING-002.json`
- current state: latest `LITERARY-PROSE-CONSOLIDATED-WORKSTREAM-STATE-*` selected under that binding.
- scope: Book Evaluator, literary/prose evaluation, evaluator/judge training, prose/craft training, diagnostics, revision intelligence and preservation checks.
- parent relationship: PROSE may define its own critical path but may not alter BOOK canonical state or define BOOK's parent critical path without explicit BOOK admission.

## Authority order

When records disagree, use:

`four-system topology -> canonical system control record -> system-owned workstream/capability state -> qualification/evidence -> branch/workflow label -> chat/task title`.

Conversation memory is never a substitute for repository authority.

## Required A-01 startup

Before any system schedules or adjudicates A-01 machine qualification, read:

1. `qualification/a01/A01-OPERATING-MODE-001.md`
2. `qualification/a01/A01-OPERATING-CONTRACT.md`
3. `qualification/a01/a01-policy.json`
4. `qualification/a01/registry.json`
5. `qualification/a01/overnight/A01-OVERNIGHT-001.md` when requesting unattended overnight capacity

A-01 `workstream_id` identifies an execution/evidence lane, not a fifth system. Every current A-01 workstream must map through `SYSTEM-TOPOLOGY-001.json` to MASTER, LEARNING, BOOK or PROSE.

These repository artifacts, not conversation memory, are authoritative for A-01 usage.

## Current A-01 standing

A01-MIGRATION-001 is closed. A01-CONTROL-PLANE-001 is the normal qualification path. A01-OVERNIGHT-001 is the canonical scheduling extension for unattended 00:00–07:00 America/New_York capacity.

Do not start another A-01 infrastructure objective merely because a system has a failing subject, missing artifact, time-window refusal, product regression or ordinary queue delay. Adjudicate the receipt first. `SUBJECT_FAILURE` belongs to the owning system. Reopen A-01 infrastructure only when evidence demonstrates `INFRA_FAILURE`, `CONTROL_PLANE_FAILURE`, a material platform/security change, or a genuinely new qualification capability that cannot safely use the existing registered gateway model.

## Workstream behavior

- Resolve the owning canonical system before acting.
- Build and prequalify before requesting A-01.
- Use a registered qualification through `.github/workflows/a01-control-plane-gateway.yml` when available.
- Do not create an independent A-01 scheduling policy for a new workstream.
- Continue dependency-valid work while a qualification is queued or running.
- Never promote a different SHA under another SHA's evidence.
- Treat only a conforming control-plane receipt as A-01 authority.
- On failure, distinguish subject failure from infrastructure/control-plane failure before repair.
- When adding a new A-01 qualification, add a constrained repository-owned wrapper under `.github/scripts/`, register it in `qualification/a01/registry.json`, and map its `workstream_id` to one of the four systems in `SYSTEM-TOPOLOGY-001.json`.
- Do not modify the proven gateway, global admission generation or receipt semantics as part of ordinary product work.
- A new branch/workstream/capability must remain subordinate to its owning system unless the user explicitly changes the four-system topology.

## Overnight behavior

- The central workflow `.github/workflows/a01-overnight-night-shift.yml` exclusively owns canonical overnight scheduling.
- Do not add or retain an independent workstream overnight `schedule:` trigger for A-01. Convert the desired work into an overnight ticket instead.
- Follow active `qualification/a01/a01-policy.json` limits for READY tickets and dependency chains.
- Re-evaluate the owning system before ticketing. Choose the highest-value A-01-executable work that reduces that system's critical path.
- Every READY second-shift ticket must carry a real completion delta and stop condition. Never create work merely to keep A-01 utilized.
- Work above 180 minutes must be checkpoint-capable with checkpoints no farther than 30 minutes apart.
- Do not spend overnight capacity on a blocker that cannot change without new human, author, private-data, external or native-platform authority.
- A-01 is not an autonomous ChatGPT reasoning session. Open-ended reasoning occurs in chat/authorized agent work; A-01 work must be executable and evidence-producing.
- Disruptive reboot qualifications remain excluded from overnight scheduling unless current policy explicitly changes that rule.

## Return routing

Every request supplies a return ticket: workstream, origin ref, pass continuation, failure continuation and notification target. The return ticket routes to the owning system defined by the topology registry even when another chat observes the run first.

## Normal operating mode

The frozen normal-mode baseline and A-01 change-control rule are defined in `qualification/a01/A01-OPERATING-MODE-001.md`.

Historical migration evidence is preserved in `qualification/a01/A01-MIGRATION-001-CLOSURE.md`. Do not continue migration work after that closure unless new evidence invalidates it.
