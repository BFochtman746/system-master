# System Master Repository Bootstrap

This file is the cross-chat entry point for all work in `BFochtman746/system-master`.

## Mandatory startup — read first

Before interpreting a branch, chat title, ticket, workflow, qualification, historical handoff or scheduled task as current authority, read in this order:

1. `governance/CURRENT-AUTHORITY.json`
2. `governance/SYSTEM-TOPOLOGY-002.json`
3. the live canonical control/state record for the owning system
4. `governance/COMPLETION-LEDGER-001.json` when deciding whether work is already closed
5. `governance/EXPECTATION-REGISTRY-001.json` when deciding whether scope is complete
6. the owner's Second Shift delegation file when unattended work is involved

Conversation memory is never a substitute for repository authority.

## Product hierarchy

`SYSTEM MASTER` is the product root / system-of-systems.

Current internal hierarchy:

- **SYSTEM MASTER**
  - **CORE — System Master Core / Foundation & Spine**
  - **LEARNING SYSTEM**
  - **BOOK SYSTEM**
    - **PROSE SYSTEM**

Historical `MASTER` / `MASTER SYSTEM` foundation-and-spine references map to **CORE**. `SYSTEM MASTER` is reserved for the product root.

Branches, workstreams, qualification lanes, implementation families, repair lines, chats and scheduled workers cannot create architecture identity.

## Canonical routing

### CORE — `SYSTEM_MASTER/CORE`

- control ref: `system-master/control-v2`
- control record: `system-master/control-v2/SYSTEM-MASTER-V2-CONTROL-RECORD.md`
- owns: shared foundation/data/platform/runtime, continuity/recovery, assurance/reconciliation and shared qualification/control-plane integration.

### LEARNING — `SYSTEM_MASTER/LEARNING`

- control ref: `learning/control-v1`
- control record: `learning/control-v1/LEARNING-CONTROL-RECORD.md`
- historical `learning/impl-*`, `learning/qual-*`, `learning/request-*`, `learning/pilot-*` and repair/import refs remain implementation/evidence history unless the live Learning control selects them.

### BOOK — `SYSTEM_MASTER/BOOK`

- control ref: `book-system/control-v1`
- current parent state is selected on that control ref.
- owns canonical book state, end-to-end lifecycle, orchestration/admission, author decisions, version/rollback, editorial lifecycle and publication/export.

### PROSE — `SYSTEM_MASTER/BOOK/PROSE`

- control/implementation ref: `literary-prose-engine-001`
- owns Book Evaluator/evaluation, evaluator training, prose/craft training, diagnostics, revision intelligence and preservation checks.
- may define its own critical path but may not alter BOOK canonical state without explicit BOOK admission.

## Shared infrastructure / non-system lanes

- A-01, runners and qualification workflows are shared infrastructure/evidence.
- Assurance/Reconciliation and Continuity are CORE subsystem/control lanes.
- Book Evaluator is a PROSE capability/qualification lane.
- Literary Prose Engine is a PROSE implementation family.
- Night Shift / Second Shift are execution workers, not systems.

If an object cannot be mapped through `SYSTEM-TOPOLOGY-002.json`, classify it `UNALLOCATED`. Inspection is allowed; execution, promotion and scheduling are not until ownership is assigned.

## Anti-surprise startup rule

Every worker/chat must fetch the **live owner control ref** before executing work.

Compare the live head/current state with `governance/SYSTEM-STATE-BASELINE-001.json`:

- same standing/head -> continue normally;
- changed head/state -> classify `AUTHORITY_DELTA`, read the new control/state record and reconcile only the delta before continuing;
- conflicting evidence -> classify `EVIDENCE_MISMATCH` and fail closed;
- no owner -> classify `UNALLOCATED` and stop execution.

A worker may not begin execution and later claim surprise that the repository is farther ahead or different. Resolving current standing is a prerequisite, not a cleanup step.

## Required A-01 startup

Before scheduling or adjudicating A-01 machine qualification, also read:

1. `qualification/a01/A01-OPERATING-MODE-001.md`
2. `qualification/a01/A01-OPERATING-CONTRACT.md`
3. `qualification/a01/a01-policy.json`
4. `qualification/a01/registry.json`
5. `qualification/a01/overnight/A01-OVERNIGHT-001.md` when unattended overnight capacity is requested

A-01 `workstream_id` is an execution/evidence lane. It must map through `SYSTEM-TOPOLOGY-002.json` to CORE, LEARNING, BOOK or PROSE.

Keep these evidence states separate:

1. code/evidence exists;
2. exact code builds;
3. hosted/local portable tests pass;
4. authoritative A-01 qualification passes on the exact subject;
5. production/promotion/publication authority exists.

Never promote a different SHA under another SHA's evidence.

## Workstream behavior

- Resolve owner path before acting.
- Read the live owner control/state before selecting work.
- Check the completion ledger before repeating an objective.
- Check expectations before declaring the system/tool complete.
- Build and prequalify before requesting A-01.
- Use the canonical shared A-01 gateway when applicable.
- Distinguish `SUBJECT_FAILURE` from infrastructure/control-plane failure before repair.
- A repair that changes code creates a new exact SHA and new evidence chain.
- Human, author, private-data, external-authority and native-platform boundaries remain explicit and cannot be synthesized by automation.
- A child/system may consume another system's qualified interface but may not silently take over that system's objective or canonical writes.

## Second Shift — live delegation, not stale prompts

Canonical registry:

`governance/second-shift/SECOND-SHIFT-REGISTRY-001.json`

Each owner maintains its own active delegation file:

- CORE: `governance/second-shift/CORE-DELEGATIONS.json`
- LEARNING: `governance/second-shift/LEARNING-DELEGATIONS.json`
- BOOK: `governance/second-shift/BOOK-DELEGATIONS.json`
- PROSE: `governance/second-shift/PROSE-DELEGATIONS.json`

Rules:

- The system/chat owns the delegation; the scheduler only consumes it.
- When day work completes/supersedes a delegated objective, remove it from `active_delegations` in the same work session and then re-evaluate whether a successor should be delegated.
- Every READY delegation is bound to a specific live control-head SHA.
- Control-head mismatch means `STALE_DELEGATION`: do not execute it; re-evaluate from current owner state.
- The 23:15 portfolio controller plans only from live revalidated delegations.
- Every worker revalidates again immediately before execution.
- Empty delegation is valid. Do not invent work to fill the night.
- A-01 overnight work still requires registered exact-subject qualification and policy admission.

## Historical preservation

The pre-parent-topology checkpoint is preserved at:

- archive ref: `archive/pre-parent-topology-20260909`
- manifest: `governance/snapshots/PRE-PARENT-TOPOLOGY-20260909-001.json`

Historical branches, receipts, frozen artifacts and exact-SHA evidence are never rewritten merely because ownership taxonomy changed.

## Current authority

`governance/CURRENT-AUTHORITY.json` is the only cross-chat entry point for current routing. If another file calls itself `current`, `master`, `active` or `primary` and conflicts with that pointer, it is historical/stale until explicitly selected by current authority.
