# P11 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P11 Night scheduler and claim authority · **Effective** 2026-09-13
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-001.json`

## 1. Contract / interface

`A01NightScheduler` in `control-gateway/python/a01_night_scheduler.py` is the A-01-local
scheduler and the **exclusive claim authority** for queued night work.

- `enqueue(handoff, contract, now)` — admit an exact handoff plus CG-009 coordination
  contract.
- `reconcile(now)` — settle queue state against coordination authority.
- `tick(now)` — select and authorize claims.
- `request_cancel(...)`, `snapshot()`.

GitHub may admit and persist work. It does not select or order nightly tasks. This
scheduler owns the local clock, the execution-stage barrier, priority selection, and the
only authorized path that may create a claim for a queued delegation.

## 2. Ingress routes

1. **`enqueue`** from P12 ingress, or any local producer. Admission requires
   `validate_coordination_contract`, `execution_class == OVERNIGHT`, and
   `scheduling_owner == A01_SUPERVISOR`.
2. **`tick`** from the service loop — internal, drives claim authorization.
3. **`request_cancel`** from an operator.

Work not carrying a valid A-01 admission receipt cannot enter. GitHub is
`ADMISSION_TRANSPORT_EVIDENCE_ONLY` and is checked as a literal field value, not assumed.

## 3. Egress routes

- Claims created in the supervisor store, each with a fencing token.
- `dispatch_outbox` rows for executors.
- Events in the supervisor event log.
- Return values from `enqueue`, `tick`, `reconcile`.

No egress to GitHub. The scheduler never dispatches externally.

## 4. Persistence and canonical writer

Supervisor SQLite, WAL, `synchronous=FULL`, `busy_timeout=30000`.

- `night_scheduler_queue` and `night_scheduler_claim_authorizations` — canonical writer is
  this scheduler. A trigger raises `CG010_NIGHT_SCHEDULER_AUTH_REQUIRED` on an
  unauthorized claim path, so the rule is enforced in the database rather than only in
  application code.
- `claims`, `lanes`, `delegations` — written through P10 supervisor primitives.
  `uq_active_claim_per_lane` enforces at most one unreleased claim per lane as a unique
  index, not a check.

Identity is enforced on re-enqueue: a delegation id arriving with a different
`handoff_json`, `contract_json`, or `scheduler_digest` raises
`night scheduler delegation identity collision` rather than overwriting. Re-enqueuing the
identical packet is a no-op.

## 5. Dependencies

- **P10** supervisor store — lanes, leases, fencing, events.
- **P12** ingress — the production producer.
- CG-008 handoff and CG-009 coordination contracts, validated on every enqueue.
- Python 3.12 stdlib `sqlite3`.

## 6. Failure semantics

**Fail-closed, with the database as the last line rather than the only one.**

- Handoff or contract invalid → `NightSchedulerError`, nothing queued.
- Not `OVERNIGHT`, or scheduling owner not `A01_SUPERVISOR` → refused. This scheduler
  admits night work only, and only when A-01 retains scheduling authority.
- Delegation id collision with differing content → refused, never overwritten. This is
  what makes P12's idempotent delegation ids safe: identical re-poll is a no-op,
  divergent re-poll is an error.
- Unauthorized claim creation → SQLite trigger aborts the transaction.
- Two claims for one lane → unique index rejects the second.
- Coordination authority (CG-009) remains authoritative for dependency identity, resource
  capacity, cancellation, lease and fence. The scheduler defers rather than duplicating
  those decisions.

`isolation_level=None` with explicit transactions: a partially applied enqueue does not
exist.

## 7. Evidence target

- `night_scheduler_queue` rows, each carrying `scheduler_digest` over the exact handoff and
  contract.
- The supervisor event log, queryable by lane, delegation and time.
- The P15 morning receipt, which reads the resulting claims, circuits and events.

## 8. Acceptance target

```
cd control-gateway && node --test test/a01-supervisor-handoff.test.js
cd python && PYTHONPATH="$PWD:$(cd ../.. && pwd)" python -m unittest test_a01_github_ingress
```

**PASS** when both suites pass with zero failures. The ingress suite exercises this
scheduler's admission contract through a recording double that runs the real
`validate_gateway_handoff` and `validate_coordination_contract`, so a change to either
frozen contract fails there immediately.

**This acceptance target is weaker than it should be.** It proves the admission contract,
not `tick`, `reconcile`, or claim selection under contention. Recorded as a gap below
rather than presented as coverage.

## 9. Authority boundary

**Lane may decide alone (`agent`):** internal query shape, log wording, added tests.

**Requires the owner (`owner`):** changing accepted `execution_class` values; relaxing the
`A01_SUPERVISOR` scheduling-owner requirement; changing the identity-collision rule;
removing the authorization trigger or the per-lane unique index; adding any external
dispatch path.

Any change that lets GitHub select or order night work inverts the authority model this
capability exists to protect.

## 10. Open gaps

- **Claim-selection coverage.** No test exercises `tick` and `reconcile` under contention —
  concurrent claims, expired leases, fencing-token advance, cancellation cascade. The
  primitives are well built; they are not proven by a suite that runs in CI.
- **No scheduler-level night budget.** P12 bounds what it enqueues, but a producer writing
  directly to `enqueue` bypasses that ceiling.
