# P11 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P11 Night scheduler and claim authority · **Effective** 2026-09-15  
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`

## 1. Contract / interface

`A01NightScheduler` in `control-gateway/python/a01_night_scheduler.py` is the A-01-local scheduler and the **exclusive claim authority** for queued overnight work.

- `enqueue(handoff, contract, now)` admits an exact overnight handoff plus CG-009 coordination contract.
- `reconcile(now)` settles queue state against durable coordination/supervisor state.
- `tick(now, max_claims, lease_seconds)` orders candidates and authorizes claims.
- `request_cancel(...)` delegates cancellation to CG-009 and reconciles the queue.
- `snapshot()` exposes queue, durable night budgets, slot usage and invariant state.

GitHub may admit and persist work. It does not select or order nightly tasks. P11 owns the local clock, execution-stage barrier, priority selection, the policy-bound night-wide claim budget, and the only authorized path that may create a claim for a queued night delegation.

## 2. Ingress routes

1. `enqueue` from P12 ingress or another local producer. Admission requires the frozen gateway/coordination contracts, `execution_class == OVERNIGHT`, and `scheduling_owner == A01_SUPERVISOR`.
2. `tick` from the A-01 service loop.
3. `request_cancel` from an operator-authorized path.

The scheduler reads `qualification/a01/a01-policy.json` at construction and fails closed unless overnight scheduling is enabled, the timezone remains `America/New_York`, and `overnight.max_slots` is an integer `1..64`. Current authority sets `max_slots = 8`.

## 3. Egress routes

- Claims in the P10 supervisor store, each carrying the current fencing token.
- `dispatch_outbox` rows for executors.
- Append-only supervisor events including `night_key`, `night_slot`, and `night_slot_limit`.
- Durable scheduler queue and budget records.
- Return values from `enqueue`, `tick`, `reconcile`, and `snapshot`.

No network or external dispatch is performed by P11.

## 4. Persistence and canonical writer

All scheduler state shares the P10 SQLite database (`WAL`, `synchronous=FULL`, explicit write transactions).

P11 is sole writer of:

- `night_scheduler_queue`
- `night_scheduler_claim_authorizations`
- `night_scheduler_night_budget`
- `night_scheduler_budget_usage`

A database trigger raises `CG010_NIGHT_SCHEDULER_AUTH_REQUIRED` if queued overnight work attempts to create a claim without a transient scheduler authorization row.

The night-wide budget is durable and transactional. The first successful claim for a local night freezes the policy slot limit into `night_scheduler_night_budget`; each claim reserves exactly one numbered row in `night_scheduler_budget_usage` inside the **same `BEGIN IMMEDIATE` transaction** that creates its lease and dispatch intent. Completion, blockage, stale recovery, or restart does not refund a consumed slot. A new America/New_York local date begins a new budget. If the configured slot limit changes after that night has started, P11 fails closed instead of silently changing the active budget.

## 5. Dependencies

- **P10** supervisor store — lanes, leases, fencing, events, transactional writer.
- **P12** ingress — production producer; P11 does not depend on P12 for enforcement.
- CG-008 handoff and CG-009 coordination contracts.
- `qualification/a01/a01-policy.json` for the authoritative overnight slot ceiling.
- Python 3.12 stdlib only.

## 6. Failure semantics

**Fail closed.**

- Invalid handoff/coordination identity → `NightSchedulerError`, nothing queued.
- Non-`OVERNIGHT` or non-`A01_SUPERVISOR` scheduling owner → refused.
- Divergent re-enqueue of a delegation id → refused, never overwritten.
- Unauthorized claim path → SQLite trigger aborts the transaction.
- Dependency/resource/cancellation/head/lane mismatch → refused by CG-009/P10 checks.
- Night slot budget exhausted → claim is refused; queued work remains for a later eligible night.
- Budget accounting mismatch or mid-night policy-limit change → refused.
- Concurrent ticks serialize at the P10 `BEGIN IMMEDIATE` writer boundary, so two claimers cannot consume the same final slot or exceed the frozen limit.

## 7. Evidence target

The admission evidence is the exact combination of:

- `control-gateway/python/a01_night_scheduler.py`
- `tests/test_control_gateway_a01_night_scheduler.py`
- `qualification/a01/a01-policy.json`
- current Crosswalk 003 authority
- the registered `SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS` exact-SHA A-01 receipt
- the dedicated P11 Foundation workflow artifact

Durable runtime evidence is reconstructable from the scheduler budget tables plus the P10 append-only event ledger.

## 8. Acceptance target

Hosted prequalification must pass:

```bash
python -m py_compile control-gateway/python/a01_night_scheduler.py
python -m py_compile tests/test_control_gateway_a01_night_scheduler.py
python tests/test_control_gateway_a01_night_scheduler.py
python tests/test_second_shift_supervisor_p10_foundation.py
```

The scheduler suite must prove, with zero failures:

1. exact stage/priority/dependency/resource ordering;
2. database-enforced exclusive scheduler claim authority;
3. restart durability and concurrent tick safety;
4. the policy-bound eight-slot night-wide ceiling across successive ticks;
5. budget persistence through restart and non-refund after completion;
6. atomic contention for the final slot without overspend;
7. next-night reset by America/New_York local date;
8. fail-closed active-night policy drift; and
9. auditable budget/slot state in `snapshot()`.

Then the exact subject SHA must PASS the registered consolidated A-01 qualifier `SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS`. That qualifier already executes the real night-scheduler suite plus its P10/CG-008/CG-009 dependencies and the deterministic 20,000-transition supervisor stress. No P10 qualifier change is required.

## 9. Authority boundary

**Lane may decide alone (`agent`):** internal query shape, event payload additions, added tests, non-semantic diagnostics.

**Requires the owner (`owner`):** changing accepted execution classes; relaxing `A01_SUPERVISOR` ownership; changing the night-wide slot limit or its policy source; refunding consumed slots; removing the authorization trigger; permitting GitHub to select/order night work; weakening P10 lane/fencing semantics; adding external dispatch.

## 10. Closure status

The previously recorded scheduler-level night-budget gap is implemented by the durable policy-bound budget above. Claim-selection/contention coverage is now part of the real scheduler suite. No additional P11 implementation gap is currently known.

P11 remains `ACTIVE_GAP` in the Foundation census until the exact closure subject passes hosted and A-01 qualification, an immutable P11 PASS receipt is registered, Required Verification is green, and the census advances to P12.
