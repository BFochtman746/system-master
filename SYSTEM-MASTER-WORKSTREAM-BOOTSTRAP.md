# System Master Repository Bootstrap

This file is the cross-chat entry point for all work in `BFochtman746/system-master`.

## Mandatory startup — read first

Before interpreting a branch, chat title, ticket, workflow, qualification, historical handoff or scheduled task as current authority, read in this order:

1. `governance/CURRENT-AUTHORITY.json`
2. `governance/SYSTEM-TOPOLOGY-002.json`
3. fetch the **live** canonical control ref for the owning system and read the selected current control/state record
4. `governance/COMPLETION-LEDGER-001.json` — what is evidence-backed as done
5. `governance/WORK-OBLIGATION-REGISTRY-001.json` — what is still owed, blocked, held, deferred or awaiting owner selection
6. `governance/EXPECTATION-REGISTRY-001.json` — what System Master is expected eventually to contain/prove
7. the owner's Second Shift delegation file when unattended work is involved

Conversation memory is never a substitute for repository authority.

## Product hierarchy

`SYSTEM MASTER` is the product root / system-of-systems.

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
- selected control: `system-master/control-v2/SYSTEM-MASTER-CORE-CONTROL-RECORD-001.md`
- owns shared foundation/data/platform/runtime, continuity/recovery, assurance/reconciliation and shared qualification/control-plane integration.

### LEARNING — `SYSTEM_MASTER/LEARNING`

- control ref: `learning/control-v1`
- selected control: `learning/control-v1/LEARNING-CONTROL-RECORD-v2.md`
- historical `learning/impl-*`, `learning/qual-*`, `learning/request-*`, `learning/pilot-*` and repair/import refs remain implementation/evidence history unless current Learning control selects them.

### BOOK — `SYSTEM_MASTER/BOOK`

- control ref: `book-system/control-v1`
- selected control: `qualification/book-system/BOOK-SYSTEM-PRODUCT-PARENT-BINDING-006.json`
- owns canonical book state, end-to-end lifecycle, orchestration/admission, author decisions, version/rollback, editorial lifecycle and publication/export.

### PROSE — `SYSTEM_MASTER/BOOK/PROSE`

- control ref: `literary-prose-engine-001`
- selected control: `qualification/literary-prose-engine-001/PROSE-SYSTEM-PRODUCT-PARENT-BINDING-003.json`
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

Compare the live head/current state with `governance/SYSTEM-STATE-BASELINE-002.json`:

- same standing/head -> `AUTHORITY_CURRENT`;
- changed head/state -> `AUTHORITY_DELTA`: read the new owner control/state and reconcile only the delta before continuing;
- conflicting evidence -> `EVIDENCE_MISMATCH` and fail closed;
- no owner -> `UNALLOCATED` and stop execution.

A worker may not begin execution and later claim surprise that the repository is farther ahead or different. Resolving current standing is a prerequisite, not a cleanup step.

## Completion / obligation / expectation discipline

- **Completion ledger** answers: *What has actually been completed, and what evidence proves it?*
- **Obligation registry** answers: *What is still owed, who owns it, and what blocks/unlocks it?*
- **Expectation registry** answers: *What is the product/system ultimately expected to cover or prove?*
- **Reallocation ledger** answers: *Where did historical labels/workstreams move under the current hierarchy?*

Do not use one of these as a substitute for another. A completed exact-SHA gate does not imply an entire expectation is complete; an expected capability does not imply implementation; an open obligation does not invalidate predecessor evidence.

When an obligation closes, preserve/verify its evidence, append the completion ledger, close/supersede the obligation, update current owner state, and reconcile any active Second Shift delegation in the same work session.

## Required A-01 startup

Before scheduling or adjudicating A-01 machine qualification, also read:

1. `qualification/a01/A01-OPERATING-MODE-001.md`
2. `qualification/a01/A01-OPERATING-CONTRACT.md`
3. `qualification/a01/a01-policy.json`
4. `qualification/a01/registry.json`
5. `qualification/a01/overnight/A01-OVERNIGHT-001.md` when unattended overnight capacity is requested

A-01 `workstream_id` is an execution/evidence lane. It must map through `SYSTEM-TOPOLOGY-002.json` to CORE, LEARNING, BOOK or PROSE.

Keep separate:

1. code/evidence exists;
2. exact code builds;
3. hosted/local portable tests pass;
4. authoritative A-01 qualification passes on the exact subject;
5. production/promotion/publication authority exists.

Never promote a different SHA under another SHA's evidence.

## Workstream behavior

- Resolve owner path before acting.
- Read live owner control/state before selecting work.
- Check completion before repeating work.
- Check obligations before choosing what remains.
- Check expectations before declaring a tool/system complete.
- Build and prequalify before requesting A-01.
- Use the canonical shared A-01 gateway when applicable.
- Distinguish subject failure from infrastructure/control-plane/admission failure before repair.
- A repair that changes code creates a new exact SHA and evidence chain.
- Human, author, private-data, external-authority and native-platform boundaries remain explicit and cannot be synthesized by automation.
- A child/system may consume another system's qualified interface but may not silently take over that system's objective or canonical writes.

## Second Shift — live delegation, not stale prompts

Canonical registry: `governance/second-shift/SECOND-SHIFT-REGISTRY-001.json`  
Operating mode: `governance/second-shift/SECOND-SHIFT-OPERATING-MODE-002.md`

Owner files:

- CORE: `governance/second-shift/CORE-DELEGATIONS.json`
- LEARNING: `governance/second-shift/LEARNING-DELEGATIONS.json`
- BOOK: `governance/second-shift/BOOK-DELEGATIONS.json`
- PROSE: `governance/second-shift/PROSE-DELEGATIONS.json`

Rules:

- The owner system/chat owns the delegation; the scheduler only consumes it.
- Delegation must correspond to an open owner obligation/current objective.
- If daytime work completes/supersedes it, remove it from `active_delegations` in that same work session, preserve history, then re-evaluate a successor.
- READY delegation binds to an exact live owner-control head.
- Head/objective/dependency mismatch = `STALE_DELEGATION`; do not execute it.
- The 23:15 controller revalidates before planning; each worker revalidates again immediately before execution.
- Empty delegation is valid only after the mandatory work-ahead ladder and all-rungs-exhausted test in `SECOND-SHIFT-OPERATING-MODE-002.md` prove that no dependency-valid unattended-safe research, census, specification, test-design, bounded implementation, qualification-preparation or successor-packet work remains. A stale/missing delegation or blocked critical path is not sufficient.
- Do not invent work solely for utilization; do not leave a materially incomplete system idle while independent work-ahead can reduce tomorrow's discovery or build time.
- A completed night item may be followed by another only after owner-state re-evaluation and a new/revalidated delegation.
- A-01 work still requires registered exact-subject qualification and central policy admission.

## Historical preservation

Pre-parent-topology checkpoint:

- archive ref: `archive/pre-parent-topology-20260909`
- manifest: `governance/snapshots/PRE-PARENT-TOPOLOGY-20260909-001.json`

Historical branches, receipts, frozen artifacts and exact-SHA evidence are never rewritten merely because ownership taxonomy changed.

## Current authority

`governance/CURRENT-AUTHORITY.json` is the only cross-chat entry point for current routing. If another file calls itself `current`, `master`, `active` or `primary` and conflicts with that pointer, it is historical/stale until explicitly selected by current authority.
