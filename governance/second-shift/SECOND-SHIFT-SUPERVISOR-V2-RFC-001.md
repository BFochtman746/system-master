# SECOND-SHIFT-SUPERVISOR-V2-RFC-001

Status: **PROPOSED / RELIABILITY BRANCH ONLY / NOT PRODUCTION AUTHORITY**  
Date: 2026-09-11  
Product root: `SYSTEM_MASTER`

## Decision summary

Replace the current pseudo-controller model with a durable **Second Shift Supervisor v2**. Keep GitHub repository authority and independent enforcement, but stop using Git files plus periodic cron as the live lease/dispatch database.

The existing default-branch implementation does not contain a continuously operating Second Shift controller. It contains:

1. owner/delegation JSON and execution-control contracts;
2. append-style utilization ledgers committed to Git;
3. a scheduled `Second Shift Enforcement` validator/watchdog;
4. independent lane-specific and A-01 workflows;
5. a System State Reconciler that validates repository truth.

None of those components owns the full durable lifecycle `READY -> atomic claim -> dispatch -> heartbeat -> terminal -> reconcile -> successor -> immediate redispatch`.

## Evidence that forces redesign

### Overnight 2026-09-11

- A CORE mutation claim opened at 00:58 ET, its lease expired at 01:48, and no terminal event was recorded until morning reconciliation.
- LEARNING, BOOK and DOCUMENTS still had independent work, yet all four active peer lanes later exceeded the READY dispatch SLA.
- The 04:59 enforcement workflow detected `UNCLOSED_MUTATION_CLAIM` plus `READY_UNDISPATCHED`; it could detect the stall but could not repair or redispatch it.
- A-01's separate overnight fixed-plan scheduler ran successfully but scheduled zero tickets because its request discovery did not include the outstanding repair-request directory.

### Current implementation audit

The production validator is materially weaker than its own schemas/contracts. Fault injection demonstrated acceptance of multiple invalid states, including terminal events without live claims, mismatched idempotency, retry/circuit contract gaps, successor sequence violations, future timestamps, shift-close ordering problems and unused telemetry-freshness configuration.

The current delegation schema also has two design defects:

1. `READY` does not require a machine executor binding, so natural-language work can be classified READY without a safe dispatch target;
2. stale architecture text still describes PROSE as active despite Topology-005 terminal retirement.

### Platform limits

GitHub documents that scheduled workflows can be delayed under load and, at sufficiently high load, queued scheduled jobs can be dropped. Therefore GitHub schedule events are useful backup triggers/observers but are not a sufficient sole heartbeat for an unattended execution control loop.

## Target architecture

### Layer 0 — repository authority

Git remains authoritative for:

- `CURRENT-AUTHORITY` and selected topology;
- program-job and completion/retirement locks;
- owner controls and immutable exact-SHA subjects;
- obligation/expectation/reallocation records;
- executor registration policy;
- durable evidence and morning audit exports.

Git is **not** the live lock manager, queue or heartbeat database.

### Layer 1 — local durable supervisor

Run one small supervisor service on the A-01 Windows machine.

Reference implementation: `tools/second_shift_supervisor_v2.py`.

Persistence: SQLite with:

- WAL journal mode;
- `synchronous=FULL`;
- foreign keys;
- transactional claim/outbox writes;
- one-live-claim-per-lane unique constraint;
- globally unique idempotency keys;
- monotonic fencing tokens;
- append-only controller events.

Primary tables:

- `lanes`
- `delegations`
- `claims`
- `dispatch_outbox`
- `circuits`
- `events`

### Layer 2 — registered executor adapters

A delegation is not READY until it resolves to a registered executor.

Proposed executor classes:

- `LOCAL_REGISTERED_SCRIPT`
- `GITHUB_REGISTERED_WORKFLOW`
- `A01_REGISTERED_QUALIFICATION`
- optional `AGENT_REGISTERED_TASK`

No delegation may carry arbitrary shell commands, arbitrary workflow paths or unrestricted model/tool instructions.

The executor adapter receives immutable identity plus `dispatch_id`, `idempotency_key`, `lease_id` and `fencing_token`.

### Layer 3 — independent GitHub watchdog

Keep and strengthen the GitHub `Second Shift Enforcement` workflow as an **independent monitor**.

It should verify:

- supervisor heartbeat/export freshness;
- no stale/unclosed exported lease;
- exact owner coverage/topology equality;
- owner-head consistency;
- retry/circuit rules;
- morning close invariants;
- no retired-system execution.

It should not silently take mutation ownership if the supervisor disappears. A second active controller without a distributed consensus lease would create split-brain risk.

### Layer 4 — immutable audit export

The supervisor periodically exports signed/digested snapshots/events to repository evidence or workflow artifacts. Terminal transitions and morning handoff are always exported. Git evidence is audit truth, not the synchronization primitive used to decide who owns a live mutation.

## Required lifecycle

### Startup / restart

1. service starts automatically with Windows;
2. open SQLite and run integrity check;
3. load/reconcile current repository authority;
4. expire stale local leases before any new claim;
5. reconcile every unresolved dispatch intent against its immutable `dispatch_id`;
6. compare owner control heads and fence any changed-head work;
7. if local time is within 00:00-07:00 ET, immediately catch up instead of waiting for a cron tick;
8. dispatch highest-priority executable READY work per lane.

### Claim

In one database transaction:

1. revalidate current owner head/objective/authority;
2. verify registered executor and immutable subject;
3. enforce one live claim per lane;
4. increment fencing token;
5. create lease/idempotency identity;
6. persist dispatch intent.

Only after commit may the external/local execution be invoked.

### Execution

Workers must present the exact fencing token before every state-changing effect and terminal acknowledgement. Heartbeats are frequent (target 1-2 minutes; hard SLA 5 minutes), not 50-minute coarse liveness markers.

### Terminal / successor

`COMPLETED`, `BLOCKED` and `STALE` release the exact lease transactionally. The supervisor re-reads authority and binds a successor immediately. A blocked dependency opens only that dependency circuit; it does not idle the entire lane while independent work exists.

### Head change mid-run

Owner-head change increments the lane fence and terminalizes the old claim as STALE. Any late old worker is unable to report completion against the newer generation.

### Dispatch ambiguity

External APIs are presumed ambiguous/at-least-once unless an exact provider idempotency guarantee applies. Persist `dispatch_id` before the call. If the process loses the response, reconcile by that identity before redispatch. Never create a second mutation lease merely because the API response was lost.

## Timing changes

Recommended production targets after measurement:

- supervisor tick: <= 30-60 seconds;
- READY-to-claim: <= 2 minutes normally; hard alarm at 5 minutes;
- heartbeat: 60-120 seconds;
- heartbeat hard SLA: 5 minutes;
- external dispatch acknowledgement: 2 minutes;
- telemetry freshness alarm: 10 minutes;
- retry budget: maximum 3 classified attempts with bounded exponential backoff;
- GitHub watchdog: every 15-30 minutes as independent observation, not execution clock.

## Failure-mode behavior

| Failure | Required behavior |
| --- | --- |
| Supervisor process crash | Windows restarts service; SQLite recovery; resume from durable outbox/leases |
| Machine reboot/power loss | SQLite WAL/FULL recovery; service auto-start; catch up immediately |
| GitHub scheduled event delayed/dropped | No execution impact; local supervisor uses wall clock |
| GitHub API timeout after dispatch | Reconcile persistent dispatch identity before retry |
| Duplicate dispatch | Same idempotency identity; no second mutation claim/effect |
| Worker process dies | Heartbeat SLA expires; fence and STALE; reconcile successor/retry |
| Owner head changes | Fence old worker; STALE old claim; replan from new authority |
| Day shift writes concurrently | Head/fence mismatch fails old Second Shift mutation closed |
| Retry budget exhausted | Open dependency circuit; select independent same-lane work |
| SQLite corruption/integrity failure | Fail closed; do not mutate; preserve DB/WAL; alert/watchdog |
| GitHub unavailable | Continue only already-authorized local work that does not require refreshed Git authority; otherwise hold safely |
| A-01 unavailable | Keep A-01 work blocked/CANDIDATE and select independent work; do not claim PASS |
| Human/private/native boundary | Preserve blocker; never synthesize authority |
| Retired PROSE route appears | Reject as retired-system resurrection |

## Alternatives considered

### Patch current GitHub-only scheme

Not recommended as the final design. The validator must be hardened regardless, but validation does not create durable execution. Git commit races, scheduled-trigger delay/drop and absence of a true dispatcher remain.

### One long-running GitHub Actions controller

Better than periodic cron but still not recommended as sole authority. It remains hosted by the same external execution platform it is expected to supervise, and run lifecycle/availability limits become controller availability limits.

### Temporal

Architecturally excellent for durable long-running workflows, timers, retries and crash recovery. It would remove much custom orchestration logic. For this one-machine System Master deployment it adds a server/platform dependency and operational complexity. Reconsider if System Master becomes multi-machine/multi-user or needs distributed durable workflows.

### AWS Step Functions Standard

Also strong: durable, auditable, long-running and exactly-once workflow-state execution unless retries are configured. It introduces AWS account/IAM/state-transition cost and moves the control plane into cloud infrastructure. Not preferred for the current local-first setup.

### OpenAI agent orchestration

Useful as an optional **executor**, not as the lease authority. Long-horizon research/specification/engineering delegations that cannot be represented as deterministic scripts could be handled by a registered agent task with constrained tools and durable checkpoints. The deterministic supervisor must remain responsible for ownership, idempotency, fencing, retries and evidence admission.

## Cutover plan

### Phase 0 — current-system diagnosis

Complete exhaustive production-validator stress and preserve all blind spots. No production behavior change.

### Phase 1 — v2 kernel shadow validation

Run the stricter kernel against synthetic faults and existing real ledgers. Resolve schema-version compatibility without rewriting historical evidence.

### Phase 2 — supervisor simulator

Stress SQLite transactions, restart recovery, concurrent claims, stale workers, dispatch ambiguity, retries/circuits, shift boundaries and long randomized sequences on both GitHub-hosted Linux and the actual A-01 Windows runner.

### Phase 3 — shadow mode on A-01

Install the supervisor service but disable mutation dispatch. It reads current authority and computes what it *would* claim/dispatch. Compare against human/current decisions for multiple cycles. Any divergence is a blocker.

### Phase 4 — one-lane canary

Enable one low-risk lane/executor with no canonical/high-authority effects. GitHub watchdog remains independent. Require zero duplicate effects, zero stale completions and complete audit evidence.

### Phase 5 — four-lane control

Move CORE/LEARNING/BOOK/DOCUMENTS live coordination to supervisor v2. Retain GitHub watchdog and immutable exports.

### Phase 6 — retire pseudo-controller assumptions

Update current registry/schemas/contracts to point to v2 supervisor and remove language implying that periodic enforcement itself is the portfolio controller. Preserve historical v1/v2 evidence as provenance.

## Production promotion gates

Do not cut over until all are true:

- strict named fault suite passes;
- >= 10,000 deterministic state-machine fault mutations pass;
- >= 20,000 randomized supervisor transitions preserve DB/controller invariants;
- 32-way same-lane claim race yields one live mutation claim;
- 32-way same-idempotency race yields one claim/dispatch identity;
- committed transaction survives abrupt process exit;
- uncommitted transaction rolls back cleanly after abrupt exit;
- head-change stale worker cannot heartbeat/progress/complete;
- unknown dispatch outcome is recoverable without creating a second lease;
- retry/circuit behavior is bounded and machine-verifiable;
- today’s valid historical ledgers replay or are explicitly version-adapted;
- actual A-01 Windows stress passes;
- independent GitHub watchdog remains green;
- shadow/canary evidence shows no duplicate or stale effects.

## Recommendation

Proceed with Supervisor v2. Do **not** rely on the present GitHub-only pseudo-controller as the unattended execution authority for another night once a tested v2 canary is available. Until cutover, keep current enforcement fail-closed and treat it as a watchdog, not proof that work will continue automatically.
