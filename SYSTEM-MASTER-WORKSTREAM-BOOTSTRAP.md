# System Master Repository Bootstrap

This file is the cross-chat entry point for all work in `BFochtman746/system-master`.

## Mandatory startup — read first

Before interpreting a branch, chat title, ticket, workflow, qualification, historical handoff or scheduled task as current authority, read in this order:

1. `governance/CURRENT-AUTHORITY.json`
2. `governance/morning/LATEST-BOOTSTRAP-POINTER.json` when present; if it selects a manifest for the current America/New_York date, read the requested chat-role packet as a fast-start cache
3. `governance/SYSTEM-TOPOLOGY-002.json`
4. resolve the current control binding for the owning lane: live canonical control ref for child/system owners, or the exact root authority-file binding declared by the SYSTEM_MASTER Second Shift owner selector for product-root work
5. the sealed state checkpoint currently selected by CURRENT-AUTHORITY
6. the completion ledger currently selected by CURRENT-AUTHORITY — what is evidence-backed as done
7. the obligation registry currently selected by CURRENT-AUTHORITY — what is still owed, blocked, held, deferred or awaiting owner selection
8. the expectation and reallocation registries selected by CURRENT-AUTHORITY
9. repair registry/inbox state relevant to the owner
10. the registry-declared Second Shift delegation and current shift ledger when unattended work is involved

Conversation memory, a morning manifest, a chat title and a historical handoff are never substitutes for live repository authority.

## Fast-start / morning reconciliation

Canonical contract: `governance/morning/MORNING-CANONICAL-RECONCILIATION-001.md`  
Chat command contract: `governance/morning/CHAT-START-COMMAND-CONTRACT-001.md`

After the 00:00-07:00 Second Shift window, the 07:15 morning reconciliation consumes overnight execution/evidence as inputs, reconciles admissible deltas into live owner state, and publishes one daily chat bootstrap manifest. That manifest records where each chat role is, where it is going, what changed overnight, and one exact next-step contract.

The daily manifest is a fast-start cache and reconciliation receipt only. At every chat start, current `main` and each relevant live owner head/control binding are resolved again. Any movement after the morning seal is `AUTHORITY_DELTA` and is reconciled before execution without asking the user to rediscover the project.

Supported chat roles:

- `MASTER_ROOT` — SYSTEM_MASTER product-root controller. It reads all four child/system owner lanes, the SYSTEM_MASTER root Second Shift lane and shared infrastructure and includes CORE state, but is not a fifth peer system and does not silently take child canonical-writer authority.
- `LEARNING` — SYSTEM_MASTER/LEARNING.
- `BOOK` — SYSTEM_MASTER/BOOK.
- `PROSE` — SYSTEM_MASTER/BOOK/PROSE.

A new chat is a new working surface, not a new project state.

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

Resolve the current routing records from `governance/SYSTEM-TOPOLOGY-002.json` and the headless-tool owner allocation selected by CURRENT-AUTHORITY. The current topology defines child/system owner paths and live control refs; do not duplicate live head SHAs here.

### SYSTEM_MASTER product root

Owns product-root governance/orchestration and any non-system headless capability portfolio explicitly allocated to `SYSTEM_MASTER`, including Content & Document Artifacts. These portfolios share the reusable `SYSTEM_MASTER` Second Shift lane when unattended work is appropriate. Creating a tool/branch does not create a peer system or a new Second Shift lane.

### CORE — `SYSTEM_MASTER/CORE`

Owns shared foundation/data/platform/runtime, continuity/recovery, assurance/reconciliation and shared qualification/control-plane integration.

### LEARNING — `SYSTEM_MASTER/LEARNING`

Owns Learning product architecture/runtime, curriculum, assessment, mastery/adaptation, retention/transfer and Learning-specific qualification/evidence.

### BOOK — `SYSTEM_MASTER/BOOK`

Owns canonical book state, end-to-end lifecycle, orchestration/admission, author decisions, version/rollback, editorial lifecycle and publication/export.

### PROSE — `SYSTEM_MASTER/BOOK/PROSE`

Owns Book Evaluator/evaluation, evaluator training, prose/craft training, diagnostics, revision intelligence and preservation checks. It may define its own critical path but may not alter BOOK canonical state without explicit BOOK admission.

## Shared infrastructure / non-system lanes

- A-01, runners and qualification workflows are shared infrastructure/evidence.
- Assurance/Reconciliation and Continuity are CORE subsystem/control lanes.
- Book Evaluator is a PROSE capability/qualification lane.
- Literary Prose Engine is a PROSE implementation family.
- Content & Document Artifacts and the other headless tool portfolios selected by the current owner-allocation record are non-system capability portfolios; when owned by SYSTEM_MASTER they inherit the product-root Second Shift lane.
- Night Shift / Second Shift are execution workers, not systems.

If an object cannot be mapped through current topology/owner-allocation authority, classify it `UNALLOCATED`. Inspection is allowed; execution, promotion and scheduling are not until ownership is assigned.

## Anti-surprise startup rule

Every worker/chat must resolve the current owner control binding before executing work.

Compare the live/current binding and state with the sealed checkpoint selected by `governance/CURRENT-AUTHORITY.json`:

- same standing/head/binding -> `AUTHORITY_CURRENT`;
- changed head/state/binding -> `AUTHORITY_DELTA`: read the new owner control/state and reconcile only the delta before continuing;
- conflicting evidence -> `EVIDENCE_MISMATCH` and fail closed;
- no owner -> `UNALLOCATED` and stop execution.

Do not say the repository state is surprising, confusing or unknown after execution begins. Resolve standing first. If state moved, report the classified delta and the resulting current objective.

Do not ask the user to restate System Master architecture, prior work, repository identity, lane purpose or overnight history when canonical lookup can resolve it. If a genuine non-machine-resolvable authority decision remains, ask only that exact decision.

## Completion / obligation / expectation discipline

- **Completion ledger** answers: *What has actually been completed, and what evidence proves it?*
- **Obligation registry** answers: *What is still owed, who owns it, and what blocks/unlocks it?*
- **Expectation registry** answers: *What is the product/system ultimately expected to cover or prove?*
- **Reallocation ledger** answers: *Where did historical labels/workstreams move under the current hierarchy?*

Always use the files selected by CURRENT-AUTHORITY for current routing. Historical registries remain evidence/provenance and may not override current selectors.

Do not use one registry as a substitute for another. A completed exact-SHA gate does not imply an entire expectation is complete; an expected capability does not imply implementation; an open obligation does not invalidate predecessor evidence.

When an obligation closes, preserve/verify its evidence, append the completion ledger, close/supersede the obligation, update current owner state, and reconcile the registry-declared Second Shift delegation in the same work session.

When `central_next_objective` changes to another READY/ACTIVE SYSTEM_MASTER-owned objective, the same product-root working session must reconcile `governance/second-shift/SYSTEM-MASTER-DELEGATIONS.json`. This prevents a new headless tool from being started without inheriting overnight governance.

## Required A-01 startup

Before scheduling or adjudicating A-01 machine qualification, read the current A-01 operating mode, operating contract, policy, registry and overnight contract selected by current repository authority.

A-01 `workstream_id` is an execution/evidence lane. It must map through current ownership authority to SYSTEM_MASTER, CORE, LEARNING, BOOK or PROSE as appropriate without creating architecture identity.

Keep separate:

1. code/evidence exists;
2. exact code builds;
3. hosted/local portable tests pass;
4. authoritative A-01 qualification passes on the exact subject;
5. production/promotion/publication authority exists.

Never promote a different SHA under another SHA's evidence.

## Workstream behavior

- Resolve owner path before acting.
- Read live/current owner control binding/state before selecting work.
- Check completion before repeating work.
- Check the current obligation registry selected by CURRENT-AUTHORITY before choosing what remains.
- Check expectations before declaring a tool/system complete.
- Build and prequalify before requesting A-01.
- Use the canonical shared A-01 gateway when applicable.
- Distinguish subject failure from infrastructure/control-plane/admission failure before repair.
- A repair that changes code creates a new exact SHA and evidence chain.
- Human, author, private-data, external-authority and native-platform boundaries remain explicit and cannot be synthesized by automation.
- A child/system may consume another system's qualified interface but may not silently take over that system's objective or canonical writes.
- A new SYSTEM_MASTER-owned headless tool inherits the existing root Second Shift lane; do not create bespoke overnight governance for each tool.
- A genuinely new first-class owner system must add its owner file to the Second Shift registry in the same topology/ownership admission change.

## Second Shift — live delegation, not stale prompts

Read the Second Shift registry, operating mode and execution-control files selected by CURRENT-AUTHORITY.

Rules:

- `owner_files` in the Second Shift registry is the machine-authoritative lane set; controllers/enforcement must enumerate it rather than compile a fixed list.
- The owner system/root chat owns its delegation; the scheduler consumes it.
- SYSTEM_MASTER-owned non-system headless capability portfolios share `governance/second-shift/SYSTEM-MASTER-DELEGATIONS.json`.
- Delegation must correspond to an open obligation/current objective in the obligation registry selected by CURRENT-AUTHORITY; a historical hard-coded registry is not current selection authority.
- If daytime work completes/supersedes or materially changes it, reconcile active delegation in the same working session and preserve history.
- READY delegation binds to the exact current owner control binding.
- Head/binding/objective/dependency mismatch = `STALE_DELEGATION`; do not execute it.
- The owner-coverage enforcement gate must fail a READY/ACTIVE owner path that has no registry-declared Second Shift route and must fail a current central objective that is not bound in its routed lane.
- The portfolio controller performs its pre-shift revalidation at the currently configured pre-shift cadence (presently 23:45 America/New_York); every worker revalidates again immediately before execution.
- Empty delegation is valid only after the current mandatory work-ahead ladder and all-rungs-exhausted proof show no dependency-valid unattended-safe work remains.
- Do not invent work solely for utilization; do not leave a materially incomplete lane idle while independent work-ahead can reduce tomorrow's discovery/build time.
- Completion/material block is followed by current-state re-evaluation and successor binding while the shift remains open.
- A-01 work still requires registered exact-subject qualification and central policy admission.

## Historical preservation

Historical branches, receipts, frozen artifacts and exact-SHA evidence are never rewritten merely because ownership taxonomy, current objectives or chat surfaces changed.

## Current authority

`governance/CURRENT-AUTHORITY.json` is the only cross-chat entry point for current routing. If another file calls itself `current`, `master`, `active` or `primary` and conflicts with that pointer, it is historical/stale until explicitly selected by current authority.
