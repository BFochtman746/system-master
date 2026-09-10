# SECOND-SHIFT-PORTFOLIO-2026-09-10-0000-0700

Status: **PREPARED / LIVE-AUTHORITY-BOUND / STALE-FAIL-CLOSED / REPAIR-AWARE**  
Execution window: **2026-09-10 00:00-07:00 America/New_York**  
Product root: `SYSTEM_MASTER`

This portfolio is a durable planning artifact, not independent execution or qualification authority. Every admitted item must repeat live authority, owner-head, objective, dependency, repair-inbox, exact-subject and remaining-window checks immediately before execution. A later head/objective/dependency mismatch invalidates the item rather than silently rebinding it.

## Authority basis

Prepared from current canonical `main` authority and the owner-control hierarchy required by:

- `governance/CURRENT-AUTHORITY.json`
- `governance/SYSTEM-TOPOLOGY-002.json`
- `SYSTEM-MASTER-WORKSTREAM-BOOTSTRAP.md`
- `governance/repair/REPAIR-INBOX-REGISTRY-001.json`
- all four owner repair inboxes
- `governance/second-shift/SECOND-SHIFT-OPERATING-MODE-002.md`
- `governance/second-shift/SECOND-SHIFT-REGISTRY-001.json`
- all four owner delegation files

Pre-write authority snapshot:

| Surface | Live ref/head | Standing used for portfolio |
|---|---|---|
| canonical main | `f38c6ab6a6edae9017534c35b4384454758341f7` | current canonical control plane before this portfolio commit |
| CORE | `system-master/control-v2` @ `568f324d52485a8d010dc99c3eb7f637216044fb` | current objective `SMR021-ADMISSION-BINDING-TOMORROW-READINESS-001`; SMR020 superseding dependency-current portable closure is sealed |
| LEARNING | `learning/control-v1` @ `8d14642dfed242adb3eea4b33125272a8d3d657a` | current Full-Standard Curriculum Compiler 001A research/graph phase |
| BOOK | `book-system/control-v1` @ `f7acc6d32072b266017236aa6efea4e91aeba2b0` | State-023 selects `SYSTEM-MASTER-COMPLETION-CENSUS-002-P3-BOOK` after exact E2E A-01 closure |
| PROSE | `literary-prose-engine-001` @ `23dcc5c82816fba4bdc571a8019e13fba4be4b95` | blind passage reconstruction semantics adjudicated; fresh blind evaluator restart authorized with revision authority zero |

## Current System State Reconciler standing

The latest completed revalidation before portfolio publication was workflow run `34432881978`, rerun job `102733120541`.

- repair-control syntax/selftests: PASS
- durable repair ledger reconciliation: PASS, 0 errors, 0 warnings, 2 total transactions
- active repair transactions: 1
- repository state reconciler: **DRIFT DETECTED**
- errors: 2 — `STALE_DELEGATION:CORE` and `STALE_DELEGATION:PROSE`
- warnings: 5 — `AUTHORITY_DELTA` for main, CORE, LEARNING, BOOK and PROSE versus the older census watermark

The red reconciler is treated as a control signal. It does not invalidate completed exact-SHA evidence; it requires the stale delegations to be excluded and the live owner states to govern this portfolio.

# CORE — SYSTEM_MASTER/CORE

## Repair lane — ADMIT FIRST

**Transaction:** `A01-REPAIR-a01-run-34431764843-A01-CONTROL-PLANE-SELFTEST-A1`  
**State:** `REPAIR_REQUEST_READY`  
**Owner:** `SYSTEM_MASTER/CORE`  
**Parent receipt:** `a01-run-34431764843-A01-CONTROL-PLANE-SELFTEST`  
**Qualification:** `A01-CONTROL-PLANE-SELFTEST`  
**Workstream:** `SYSTEM-MASTER`  
**Failed exact subject:** `3a8004813e18d7defbf1f9ebc47f5bd8fcd30fb9`  
**Dispatch:** `OWNER_WORKER_READY` via `governance/repair/agent-dispatch/A01-REPAIR-a01-run-34431764843-A01-CONTROL-PLANE-SELFTEST-A1.json`

This is the only active repair transaction and remains a repairable subject/control-workflow defect under CORE ownership. It outranks unrelated CORE build-ahead for this portfolio.

Permitted Second Shift action: reproduce the exact failed boundary, minimally repair only the proven repository-owned direct-call/self-hosted control-plane selftest defect, preserve the original failed receipt and subject lineage, and deterministically prequalify any changed candidate on its own exact SHA.

**A-01 admission is NOT currently authorized by the repair lane.** The durable transaction event chain contains only transaction-opened and owner-dispatch-ready events. If repair changes bytes, the worker must create a new exact SHA, obtain deterministic prequalification PASS on that same SHA, and have the Repair Broker persist `A01_REQUEUE_READY` before canonical A-01 admission. `A01_REQUEUE_READY` is eligibility only, never PASS.

If reproduction instead proves infrastructure, admission/window, dependency, control-plane-outside-subject, human/author/private/native/external/publication/production, or other non-product boundary, retain that truthful classification and route it to its owner. Do not convert it into product repair.

## Normal CORE delegation — REJECT STALE

`SECOND-SHIFT-CORE-SMR019-SUPERSEDING-CUMULATIVE-001` is excluded. It is bound to obsolete CORE head `6adb23ba1d4836026c1c4aa9bde9c33eba29e52c`; live CORE is `568f324d52485a8d010dc99c3eb7f637216044fb`, and the live control record has already sealed the superseding SMR020 closure and advanced to SMR021 readiness.

No controller-created normal CORE replacement is issued while the current repair transaction is active. After the repair boundary is durably resolved or reclassified, CORE must re-read the then-live head before any SMR021 unattended work is admitted.

# LEARNING — SYSTEM_MASTER/LEARNING

## Normal delegation — ADMIT

**Delegation:** `SECOND-SHIFT-LEARNING-FULL-STANDARD-CURRICULUM-001A`  
**Live control head:** `8d14642dfed242adb3eea4b33125272a8d3d657a`  
**Delegation-bound head:** `8d14642dfed242adb3eea4b33125272a8d3d657a`  
**Objective:** `LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001A-RESEARCH-GRAPH-SPEC`

The delegation is current and dependency-valid. Execute only its source-bound curriculum/dependency-graph and assessment-blueprint research phase: revalidate the external-standard source/version, disposition all 66 frozen requirements, define provisional prerequisite/subskill/module sequencing, bind intended assessment/workplace/mastery/retention/transfer evidence profiles, and define successor-standard update/revalidation behavior.

Do not fabricate participant consent, learner responses, retention, transfer or effectiveness results; do not claim psychometric validity, SME/external certification, native-platform, production or A-01 authority; do not repeat closed Learning runtime/provider/adaptive/Tutor/fresh-evidence/pilot-study boundaries.

On completion, retire this delegation, preserve the source-bound research/graph artifact, re-fetch the live Learning head, and admit a successor only if that current owner state selects one.

# BOOK — SYSTEM_MASTER/BOOK

## Current state — NO SECOND SHIFT DELEGATION ADMITTED

Live Book head `f7acc6d32072b266017236aa6efea4e91aeba2b0` selects `BOOK-SYSTEM-RECONCILED-STATE-023` and current parent objective `SYSTEM-MASTER-COMPLETION-CENSUS-002-P3-BOOK`.

The preceding `BOOK-SYSTEM-END-TO-END-AUTHORING-QUALIFICATION-001` is already closed by authoritative A-01 on exact subject `50a81c3cd3575fe45465584347711d3a7c74413a`, 48/48, run `34432910119`, job `102732003392`, evidence artifact `10135132377`. That PASS is synthetic-composition qualification only and `promotion_authorized=false`; it does not prove real author consent/decisions, publication/delivery, Document System implementation, production readiness, literary quality/factual correctness, total Book completion, or changed-SHA promotion authority.

`governance/second-shift/BOOK-DELEGATIONS.json` has no active delegation. The live Book selector explicitly requires a durable Book census checkpoint to identify useful remaining Book-owned work before a new unattended delegation is rebound. Therefore this controller does **not** invent a Book job for utilization.

Book remains empty until the P3 Book census produces the required evidence-backed capability matrix/checkpoint and then selects a concrete, dependency-valid Book-owned gap. PROSE child work, Document System implementation, real author/human/publication and external/native boundaries must remain with their truthful owners/classifications.

# PROSE — SYSTEM_MASTER/BOOK/PROSE

## Existing Teacher-freeze delegation — REJECT STALE

`SECOND-SHIFT-PROSE-BOOK-EVAL-TEACHER-FREEZE-001` is excluded. It is bound to obsolete Prose head `9d360ac20839d06765b1b3a68d5c1ebedb2eba50`; live Prose is `23dcc5c82816fba4bdc571a8019e13fba4be4b95`. The System State Reconciler independently flags the Prose delegation as stale.

The underlying overnight request `BOOK-EVAL-REPAIR-005-GATE-D-TEACHER-FREEZE-2026-09-10` remains a separately registered READY request on exact subject `e3b771dc36800c5f056ff2fd5ab6622f3e014f41`, but Second Shift may not execute it through a stale owner delegation. No silent head rebind is allowed.

The live Prose head has meanwhile adjudicated the blind passage-reconstruction semantics: all 3 source digests and all 6 passage digests match under the corrected zero-based-inclusive interpretation; a fresh blind evaluator restart is authorized; author labels/commentary were not used for reconstruction; raw/candidate prose was not persisted; revision authority remains zero. That current blind objective is separate from Teacher-freeze and requires its own fresh-context/owner-valid execution path.

No controller-created Prose replacement is issued in this portfolio. A fresh owner re-evaluation must decide whether Teacher-freeze, the fresh blind evaluator restart, or another current Prose obligation is the dependency-valid unattended action and bind any new delegation to the then-live Prose head.

Private-gold recovery and student-selective training remain HOLD unless their independent prerequisites are actually satisfied. Private-data, author, blind-label, manuscript-custody, revision/publication and production boundaries must not be converted into repair or inferred authority.

# Shared infrastructure / control

1. The repair ledger and repair-control selftests are healthy, but repository-wide state is red because CORE and PROSE active delegation files are stale. Those stale items are rejected here rather than rebound.
2. A-01 itself is shared qualification/control infrastructure. The successful Book exact-SHA A-01 run demonstrates the runner/gateway can presently execute a registered qualification, but it does not close or reclassify the independent CORE repair transaction and does not create `A01_REQUEUE_READY` for that transaction.
3. No repair worker, hosted test, portfolio controller or owner chat may grant authoritative A-01 PASS. Only a canonical A-01 exact-subject receipt can do so. Existing A-01 PASS is cited only where it already occurred.
4. No same-SHA infrastructure retry or changed-SHA product rerun is admitted unless the durable repair transaction is in the exact state required by current repair policy.
5. No workload is added merely to keep A-01, hosted runners or owner lanes busy.

# Execution order and final fail-closed gate

Priority for the 00:00-07:00 window:

1. **CORE repair transaction** `A01-REPAIR-a01-run-34431764843-A01-CONTROL-PLANE-SELFTEST-A1` — reproduce/minimally repair/prequalify only; do not A-01 requeue unless the durable broker state becomes `A01_REQUEUE_READY`.
2. **LEARNING delegation** `SECOND-SHIFT-LEARNING-FULL-STANDARD-CURRICULUM-001A` — execute the current research/graph specification within its declared authority boundary.
3. **BOOK** — no admitted job until the current P3 census produces the required durable checkpoint and a new owner-valid delegation.
4. **PROSE** — no admitted job from the stale Teacher-freeze delegation; require fresh owner re-evaluation/delegation before any unattended Prose execution.

Immediately before each item begins, re-fetch `main`, the owner control ref, the owner repair inbox and delegation file, and re-check objective/dependencies/exact subject/current policy/window. If anything material changed, do not execute this snapshot. Replan from current authority. Empty remains valid.

No PASS, promotion, publication, production, human, author, private-data, native-platform or external authority is created by this portfolio.