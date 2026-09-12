# SECOND-SHIFT-CONTROL-GATEWAY-CG-002 — LINEAGE REBIND / OWNERSHIP / INTERFACE / DISPOSITION FREEZE

Status: **FROZEN — LINEAGE / OWNERSHIP / INTERFACE / DISPOSITION v1.0**  
Operation: `SECOND-SHIFT-CONTROL-GATEWAY-CG-002`  
Mission authority: `SECOND-SHIFT-CONTROL-GATEWAY-CG-001`  
Exact predecessor: `14d87b02ac33198c9780ef80ffc8689d2da5dbe8`  
Preserved Second-Shift/A-01 subject: `6d0602660c8544bfd15f07f19752f9b51d04c55e`  
Qualified GitHub/control-plane component candidate: `8ba81e2fba9da87f95675dd868dd34d1d264d7a3`  
Premature 002D documentation freeze: `38b9b815ceba96fc6acce98b3f286625292b0744`  
Quarantined derivative Foundation-003 subject: `77fe9cf79f15aa3299030c2cc7da6daa65487b58`

## 1. Freeze purpose

CG-002 does not redesign the CG-001 mission. It converts the two diverged controller lineages and the already-existing A-01 GitHub control-plane mechanisms into one lossless ownership/interface/disposition model.

The frozen result is:

`ChatGPT proposer -> GitHub durable control gateway -> validated/admitted operation -> A-01 SecondShiftSupervisorV2 scheduling/execution owner -> registered executor/qualification adapter -> durable result/evidence/terminal receipt -> GitHub controller state -> later ChatGPT reconstruction`.

No existing lineage is wholesale canonical. Components are selectively retained only where their authority and interface match CG-001.

## 2. Forensic lineage standing

The two implementation lines diverged at merge base `ebf4caece051fe94b7428e218c2d0d2e56db70a9`.

- The preserved Second-Shift line contributes the A-01-local supervisor, SQLite/WAL state, live claims, fencing, dispatch outbox, retry/circuit mechanics, executor registration concepts, state validation, A-01 stress harnesses and shift behavior.
- The newer `controller-v2` line contributes deterministic command/transaction identity, bounded worker authority, GitHub durable journal/checkpoint/anchor, GitHub App trust binding, immutable command ingress, semantic replay/recovery, qualification/promotion identity and failure-closed GitHub authority preflight.
- The newer line also contains unrelated workload/product changes and therefore must not be wholesale merged into the control gateway.
- `38b9b815...` adds only the premature 002D freeze document above the qualified `8ba81e2...` code subject; its component evidence survives but its integrated-architecture freeze claim does not.
- `77fe9cf...` adds only a derivative `storage-maintenance.js` change above `38b9b815...`; it remains evidence/quarantined input, not a canonical successor.

## 3. Canonical authority ownership

### ChatGPT

ChatGPT is a proposer/operator only. It may submit intent, code/artifacts, requested routing, constraints, approvals and queries. It does not own durable current state, repository structure, branch/path authority, execution order, A-01 scheduling or terminal truth.

### GitHub Control Gateway

The GitHub-side control plane owns:

- immutable command intake and semantic identity;
- transaction/admission state;
- workstream/current-operation/predecessor authority;
- repository/ref/path/effect validation;
- policy/routing/dependency/qualification admission checks;
- durable journal/checkpoint/receipts/evidence index;
- active-work reconstruction and `NEXT_LEGAL_OPERATION`;
- machine identity and GitHub protection preflight.

### A-01 SecondShiftSupervisorV2

A-01 owns the live local scheduling/execution loop after gateway admission:

- `not_before`, dependency-ready and overnight timing;
- local queue/claim/lease/process ownership;
- fencing and stale-worker exclusion;
- dispatch outbox and ambiguous-dispatch reconciliation;
- retries/circuits within admitted budgets;
- concurrency/resource enforcement;
- restart/power-loss recovery;
- registered executor invocation;
- local execution lifecycle and return of bounded results/evidence.

There is exactly one live scheduler/execution authority for a task. GitHub Actions schedules, cron, notifications and wake events may observe/wake/reconcile but may not independently become a second scheduler for the same admitted operation.

### Registered executors / A-01 qualification gateway

Executors perform bounded mechanics only. They do not gain admission, scheduling, policy, repository-structure or promotion authority. The existing A-01 GitHub control-plane gateway/admission-broker/executor path is retained as a registered exact-subject execution/qualification adapter where applicable.

## 4. Concrete routing collision discovered during CG-002

On exact CG-001 subject `14d87b02...`, the current `A-01 Control Plane Enforcement` run `34664013476` failed because:

` .github/workflows/second-shift-supervisor-v2-a01-windows-stress.yml: DIRECT_SELF_HOSTED_WORKFLOW_NOT_REGISTERED; use .github/workflows/a01-control-plane-gateway.yml `

This is a real architecture collision, not a reason to weaken enforcement.

Frozen disposition:

1. The old direct self-hosted A-01 supervisor stress invocation is **DROP-AS-AUTHORITATIVE-ROUTE / PRESERVE-AS-TEST-INTENT**.
2. Its Windows stress payload must be exposed through a registered controller qualification/adapter and invoked through the canonical A-01 gateway/admission/executor path.
3. The current A-01 gateway/executor remains an execution adapter; it does not become the new control-gateway scheduler authority.
4. The current central GitHub night scheduler remains legacy-operational only until supervisor cutover; its scheduler authority is retired/demoted when the local supervisor becomes authoritative.

## 5. 32-subject lossless adjudication matrix

| ID | Subject | Frozen owner | Existing source | Disposition | Canonical contract / required closure | Cutover proof |
|---:|---|---|---|---|---|---|
| 01 | ChatGPT command submission/identity | GitHub Gateway | `durable-command-inbox.js`, kernel command envelope | **REUSE** | Chat submits canonical immutable command; chat never becomes authority | duplicate/conflict/offline rediscovery tests |
| 02 | GitHub durable inbox format | GitHub Gateway | immutable `controller-inbox/v1/<command-id>` tag -> blob | **REUSE** | create-once canonical bytes; ref/tag/blob identity re-read | live protection + immutable-ref proof |
| 03 | Command fingerprint / idempotency | GitHub Gateway, bridged to A-01 | kernel fingerprint + supervisor idempotency/dispatch IDs | **REPAIR** | one identity chain: `command_id -> transaction_id -> operation_id -> admission_receipt -> dispatch_id/idempotency_key` | replay/race/changed-bytes tests |
| 04 | GitHub authority/journal/checkpoint | GitHub Gateway | 002C durable journal + checkpoint/anchor | **REUSE** | dedicated control-state authority, CAS, hash-linked semantic journal | live external installation + replay proof |
| 05 | GitHub machine identity | GitHub Gateway | GitHub App token/provider/preflight/C1 | **REUSE** | exact repo ID, expected App principal, least privilege, protected refs | real App/ruleset preflight |
| 06 | A-01 discovery/claim | A-01 Supervisor | `second_shift_supervisor_v2.py` + delegation concepts | **REPAIR** | supervisor claims only controller-admitted operations, not free-standing workload lane files | gateway->supervisor claim E2E |
| 07 | Wake hints vs authority | GitHub Gateway | `command-wake-hint.js`; full scan correctness path | **REUSE** | wake only causes authoritative re-read; lost/duplicate/forged wake cannot create work | missing/duplicate/forged wake tests |
| 08 | `not_before` / overnight timing | A-01 Supervisor | supervisor shift clock + current gateway `not_before/not_after` | **REPAIR** | local durable timers/order are authoritative; GitHub timing is hint/fallback | reboot/offline/not-before/night tests |
| 09 | Exactly one scheduler authority | A-01 Supervisor | RFC supervisor model conflicts with current GitHub night scheduler | **REPAIR** | one live scheduler: supervisor; GitHub night workflow loses authority at cutover | split-brain negative tests + cutover receipt |
| 10 | Local lease/process ownership | A-01 Supervisor | SQLite WAL/FULL claims, unique live claim, fencing | **REUSE** | atomic claim + fence + durable dispatch intent before external effect | same-lane race/A-01 stress |
| 11 | Duplicate delivery | Gateway + Supervisor | command idempotency + claim idempotency | **REPAIR** | duplicate ingress and duplicate dispatch collapse across the bridge | 32-way duplicate/race proof |
| 12 | Crash before dispatch | Gateway + Supervisor | transactional outboxes/journal + supervisor dispatch outbox | **REPAIR** | committed intent survives; uncommitted work disappears; no phantom dispatch | forced-exit matrix |
| 13 | Crash during execution | A-01 Supervisor | heartbeat, lease expiry, fencing, recover | **REPAIR** | restart reconciles exact dispatch/worker before retry; stale worker cannot complete | kill/restart/stale-worker proof |
| 14 | GitHub unavailable while A-01 runs | Gateway policy + Supervisor | RFC policy only; partial mechanics | **BUILD** | continue only already-admitted work not requiring refreshed Git authority; otherwise HOLD | network isolation tests |
| 15 | A-01 offline while commands accumulate | GitHub Gateway + Supervisor | durable inbox exists; bridge absent | **BUILD** | GitHub queues immutable intent; restart discovers/admits/claims in dependency order | offline accumulation + catch-up |
| 16 | Retry ownership/budgets | A-01 Supervisor within Gateway contract | supervisor max 3 + circuits | **REPAIR** | gateway admits retry policy; supervisor alone executes bounded retries; no competing GitHub retries | retry/circuit exhaustion proof |
| 17 | Repository/branch/path/workload allowlists | GitHub Gateway | existing target repo + workload-specific controls | **BUILD** | gateway-neutral admitted repository/ref/path/effect allowlist bound into receipt | wrong repo/ref/path/effect rejection |
| 18 | Executor capability registry | A-01 Supervisor/Gateway | Second-Shift executor registry + existing A-01 registry | **REPAIR** | registered capabilities only; no arbitrary shell/workflow/prompt; adapters versioned | unknown/changed executor rejection |
| 19 | Secrets/credential boundaries | GitHub Gateway + A-01 host | GitHub App design + A-01 runner credentials | **REPAIR** | short-lived/least-privilege GitHub tokens; local secrets never in command/journal/evidence | secret-leak/permission negative tests |
| 20 | Cancellation | Gateway decision; Supervisor enforcement | kernel cancel exists, integrated supervisor path absent | **BUILD** | cancellation receipt fences/cancels queued/live work safely; terminalized once | queued/running/race cancellation tests |
| 21 | Pause/resume | Gateway decision; Supervisor enforcement | kernel WAITING/resume; supervisor bridge absent | **BUILD** | durable pause prevents new effect; resume requires same/revalidated authority | restart-through-pause tests |
| 22 | Dependency ordering | Gateway plan + Supervisor execution | fixed slot chain / same-lane successor are insufficient | **BUILD** | durable DAG; only dependency-ready nodes claim; failure blocks only dependents | fan-in/fan-out/failure DAG tests |
| 23 | Concurrency/resource controls | Supervisor | leases/fencing + current A-01 global concurrency | **REPAIR** | controller resource keys/policies become canonical; executor concurrency cannot contradict them | parallel independent + conflicting race tests |
| 24 | Task timeout | Gateway policy + Supervisor | executor timeout fields + GitHub job timeouts | **REPAIR** | admitted timeout budget propagated end-to-end; expiry fences late completion | timeout/late-result tests |
| 25 | Result/evidence publication | Gateway journal | supervisor event/export + A-01 artifacts + controller journal | **REPAIR** | bounded result/evidence digest/pointer returns to durable controller state | lost-artifact/replay/integrity tests |
| 26 | Terminal receipt | GitHub Gateway | pieces exist, integrated receipt absent | **BUILD** | machine-verifiable terminal receipt binds command/operation/subject/admission/dispatch/result/evidence/next state | receipt schema + tamper tests |
| 27 | Readiness/health | Supervisor + Gateway | supervisor invariant audit + A-01 runner guard | **REPAIR** | explicit controller and A-01 readiness; unhealthy state blocks mutation | degraded/unhealthy/recovery tests |
| 28 | Restart recovery | Gateway + Supervisor | controller replay/recovery + supervisor `recover()` | **REPAIR** | reconstruct controller state, fence active workers, reconcile dispatch ambiguity, resume legal work | process kill + machine reboot + store recovery |
| 29 | Later-chat status reconstruction | GitHub Gateway | CG-001 requirement; durable active-work packet absent | **BUILD** | durable `ACTIVE_WORK_PACKET` includes current/last operation, SHA, branch/ref, dependencies, queue, qualification, receipts, `NEXT_LEGAL_OPERATION` | new-chat reconstruction without chat history |
| 30 | Nightly batch start/end | Supervisor | RFC shift semantics + old GitHub fixed-slot night scheduler | **REPAIR** | durable batch/shift open-close object, catch-up after restart, morning digest from controller truth | full overnight rehearsal + morning reconstruction |
| 31 | Manual/emergency override | Gateway | no CG-001-compliant override exists | **BUILD** | explicit authenticated, reasoned, predecessor-bound, audited override; never silent bypass | unauthorized override rejection + authorized audit proof |
| 32 | Qualification/cutover proof | Gateway + A-01 | 002B/C/D host evidence + Second-Shift stress plans | **REPAIR** | integrated DAG: host qualification -> actual A-01 shadow/stress -> canary -> production activation | exact-subject evidence; A-01 mandatory |

Primary subject disposition count: **REUSE 6 / REPAIR 17 / BUILD 9 / DROP 0 / DEFER 0 = 32/32 adjudicated**. `DROP`/`DEFER` decisions below apply to obsolete routes or external activation, not to deletion of a mission requirement.

## 6. Component carry / retire / quarantine freeze

### Selectively carry from `controller-v2`

Carry as candidates, preserving their exact evidence lineage:

- deterministic command/transaction kernel and canonical command fingerprinting;
- bounded worker authority port concept;
- semantic events/outbox/replay/recovery semantics;
- GitHub durable journal/checkpoint/anchor;
- Git transport and GitHub App token/provider;
- authority/ruleset preflight and C1 activation-closure model;
- durable command inbox, immutable tag/blob transport, ingress audit and wake hints;
- qualification/promotion exact-subject separation.

Do **not** wholesale merge the branch. Any unrelated product/workload changes are outside this control-gateway rebind.

### Preserve from Second-Shift/A-01 lineage

- `tools/second_shift_supervisor_v2.py` mechanics as the live supervisor candidate;
- SQLite WAL/FULL, claims, fences, dispatch outbox, circuits, events, recovery/invariant audit;
- registered executor concepts;
- A-01/host stress test intent and state-kernel validation logic;
- shift/restart/failure-mode semantics from the RFC.

System-Master-specific peer-lane/topology policy remains workload-specific. It is not imported into the gateway core mission.

### Existing A-01 control-plane components

- **REUSE/REPAIR** `.github/workflows/a01-control-plane-gateway.yml` as registered A-01 admission/execution adapter.
- **REUSE/REPAIR** admission broker and `.github/workflows/a01-control-plane-executor.yml` as exact-SHA registered execution path.
- **REUSE/REPAIR** `qualification/a01/registry.json` mechanics; controller qualification must be explicitly registered.
- Because the current A-01 registry accepts registered Node wrappers, the supervisor/A-01 qualification must be reached through a registered wrapper/adapter rather than an ungoverned direct Python/self-hosted workflow.
- **DROP-AS-AUTHORITATIVE-ROUTE** direct invocation of `second-shift-supervisor-v2-a01-windows-stress.yml`; preserve the stress semantics/tests.
- **RETIRE-SCHEDULER-AUTHORITY-AT-CUTOVER** `.github/workflows/a01-overnight-night-shift.yml`. Until cutover it remains legacy operation; after cutover it may remain only as observer/wake/fallback if it cannot independently dispatch the same task.

### Quarantine / non-authority

- `38b9b815...` is not integrated architecture authority.
- `77fe9cf...` remains quarantined evidence; its storage change may be re-adjudicated when the canonical implementation reaches storage maintenance.
- No Foundation-003 progression is resumed by CG-002.

## 7. Canonical interfaces frozen by CG-002

### Interface A — `CommandEnvelope`

Required identity: mission version, `command_id`, issuer/source, target repository, expected subject, requested operation/workstream, constraints and semantic fingerprint. Immutable ingress bytes are authoritative input evidence, not admission.

### Interface B — `ActiveWorkPacket`

Must bind at minimum:

`mission_version, workstream_id, current_operation_id, predecessor_receipt_id, authoritative_subject, repository, branch_or_ref, allowed_paths_or_effects, dependency_graph/version, qualification_state, github_admission_state, a01_state, last_terminal_receipt, NEXT_LEGAL_OPERATION`.

This interface is the future-chat recovery authority.

### Interface C — `AdmissionReceipt`

Separate receipts exist for GitHub mutation and A-01 execution. Each binds the exact command/transaction/operation, predecessor, subject, repository/ref/effects, validated routing/dependencies, qualification obligations, execution policy, decision, policy version and receipt digest/identity.

No receipt means no state-changing effect.

### Interface D — `DispatchContract`

Maps exactly one admitted operation to A-01:

`operation_id, admission_receipt_id, dispatch_id, idempotency_key, subject, executor_id/capability, dependencies, not_before/not_after, timeout, retry budget, resource/concurrency key, evidence requirements`.

A-01 may not broaden this contract.

### Interface E — `WorkerPort`

Worker/executor authority is bounded to heartbeat/progress where allowed and typed terminal result/evidence. No worker receives controller DB, admission, policy, qualification/promotion, repository-structure or arbitrary mutation authority.

### Interface F — `TerminalReceipt`

Binds the full identity chain, exact result, evidence digest/pointers, retries, timestamps, execution subject, final controller transition and resulting `NEXT_LEGAL_OPERATION` or explicit blocker.

## 8. CG-001 17/17 mission traceability

- `CG1-001` -> subjects 01, 02, 06.
- `CG1-002` -> subjects 03, 26, 29.
- `CG1-003` -> subject 17.
- `CG1-004` -> subjects 17, 18, 22, 24, 32.
- `CG1-005` -> subjects 04, 26 and Interface C.
- `CG1-006` -> subjects 06, 26 and Interface C/D.
- `CG1-007` -> subjects 07, 09, 30.
- `CG1-008` -> subjects 08, 22, 30.
- `CG1-009` -> subjects 04, 28, 29.
- `CG1-010` -> subject 29 and Interface B.
- `CG1-011` -> subjects 05, 12-19, 27-28.
- `CG1-012` -> subjects 03, 11-13.
- `CG1-013` -> subjects 25, 26, 29.
- `CG1-014` -> subject 32.
- `CG1-015` -> subject 32.
- `CG1-016` -> component/non-scope freeze in this document.
- `CG1-017` -> CG-001 mission remains unchanged; CG-002 cannot alter it.

Traceability: **17/17 mission requirements bound; 32/32 detailed control subjects adjudicated.**

## 9. Qualification/cutover DAG frozen

Production activation cannot be inferred from implementation or hosted tests. Required order:

1. build integrated gateway-neutral contracts/components;
2. host-qualify command identity, journal, admission, DAG, receipts, cancellation/pause, timeout/retry and restart behavior;
3. provision/verify real protected GitHub control-state authority and machine identities;
4. register the control-gateway/A-01 supervisor qualification through the canonical A-01 gateway;
5. run actual A-01 Windows stress/fault qualification;
6. run A-01 shadow mode against real incoming work with mutation disabled;
7. run bounded canary with exact admitted effects;
8. prove overnight scheduling/restart/morning reconstruction;
9. explicitly retire/demote competing GitHub scheduler authority;
10. issue production activation/cutover receipt.

Any failure leaves the integrated controller below `PRODUCTION-ACTIVATED`.

## 10. External blockers distinguished from implementation gaps

External setup remains required for production GitHub authority: dedicated control-state repository, journal/anchor/inbox protection, GitHub Apps/credentials/rulesets and real preflight evidence. These are **activation blockers**, not permission to weaken the design or use `system-master` as production controller-state authority.

Actual A-01 qualification is also an activation blocker until the integrated registered route passes on the real machine.

## 11. Freeze rule

CG-002 freezes ownership, interfaces and component dispositions. Subsequent implementation may change internal code organization but may not:

- create a second scheduler/execution authority;
- restore direct chat -> GitHub/A-01 bypass;
- make a worker/executor authoritative for admission;
- replace predecessor-bound durable state with chat history;
- reclassify hosted tests as A-01 qualification;
- wholesale merge either old lineage as canonical;
- import System Master product/module ownership into the gateway core;
- weaken any CG-001 requirement.

Any such change is a mission/architecture change and requires explicit reopening under the CG-001 change-control rule.

## 12. Exact successor

`SECOND-SHIFT-CONTROL-GATEWAY-CG-003 — DURABLE ACTIVE-WORK STATE / NEXT-LEGAL-OPERATION IMPLEMENTATION + HOST QUALIFICATION`

CG-003 must implement the gateway-neutral `ActiveWorkPacket` and deterministic recovery/transition rules on the exact CG-002 authority subject. Its purpose is to deliver the first immediate productivity protection: a new/later chat must be able to retrieve the exact current workstream, predecessor, repository/ref/effects and one legal next transition without guessing from chat history.
