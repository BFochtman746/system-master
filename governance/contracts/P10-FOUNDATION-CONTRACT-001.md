# P10 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P10 Second-shift supervisor: lanes, leases, fencing · **Effective** 2026-09-13
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-002.json`

## 1. Contract / interface

`tools/second_shift_supervisor_v2.py` — `SupervisorStore`, a SQLite-backed lane/lease/
fencing state machine. The strongest engineering in this estate.

- Lifecycle: `register_lane`, `bind_ready`, `claim_ready`, `mark_dispatched`,
  `dispatch_failed`, `heartbeat`, `progress`, `terminal`.
- Authority: `invalidate_head`, `recover`, `audit_invariants`.
- Introspection: `pending_dispatches`, `snapshot`, `export_audit_json`, `pragma_state`.
- Errors: `SupervisorError`, `Conflict`, `StaleWorker`.

Guarantees: at most one live claim per lane; a monotonic fencing token per lane; every
transition recorded in an append-only event log.

## 2. Ingress routes

Library only — imported, never a service. Callers: **P11** night scheduler (the production
path), the coordination adapters, and operator tooling.

Every mutating call carries `(lease_id, fencing_token)` and is checked by
`_assert_live_worker` before it takes effect. Holding a lease id is not authority; holding
the *current* fencing token is.

## 3. Egress routes

- Rows in `lanes`, `delegations`, `claims`, `dispatch_outbox`, `circuits`, `events`.
- Return values on every call.
- `export_audit_json` for an out-of-band audit copy.

No network, no subprocess, no external dispatch. The supervisor decides; something else
acts.

## 4. Persistence and canonical writer

SQLite with `journal_mode=WAL`, `synchronous=FULL`, `busy_timeout=30000`,
`foreign_keys=ON`, `isolation_level=None` with explicit transactions via `tx()`.

`SupervisorStore` is the sole writer of all six tables. Structural invariants are enforced
in the schema rather than only in code:

- `uq_active_claim_per_lane` — unique index on `claims(lane) WHERE released_at IS NULL`.
  Two live claims for one lane are impossible at the storage layer.
- `dispatch_outbox.lease_id` and `idempotency_key` are `UNIQUE`.
- Foreign keys bind claims to delegations and lanes.

Schema bootstrap takes a read-only fast path when already initialised, so reopened
processes do not all become schema writers — a real concurrency hazard, handled.

## 5. Dependencies

Python 3.12 stdlib `sqlite3` only. No packages, no network.

Consumed by **P11**, **P12** indirectly, **P15** read-only.

## 6. Failure semantics

**Fail-closed, with the database as the last line rather than the only one.**

- Stale fencing token → `StaleWorker`. A worker that slept through a lease expiry cannot
  write, even holding a valid lease id. This is the central guarantee.
- Second claim on a claimed lane → `Conflict`, and the unique index rejects it regardless.
- `claim_ready` increments `lanes.fencing_counter` and stamps the new claim with it, so
  every claim strictly supersedes its predecessor.
- `invalidate_head` on a control-head change invalidates in-flight authority — work
  qualified against an old head cannot silently continue against a new one.
- `recover(heartbeat_sla_seconds=300)` marks claims `STALE` when the lease expired **or**
  the heartbeat is stale, bumps the fencing counter, moves the lane to `RECONCILE`,
  releases the dispatch, and writes a `STALE` event with the distinguishing reason. A dead
  worker cannot hold a lane indefinitely, and a recovered lane is never silently reused.
- `dispatch_failed` drives retry with a budget and opens a circuit on exhaustion,
  recording `CIRCUIT_OPEN` with `next_probe_at`.
- `audit_invariants()` checks for multiple active claims, claimed lanes without claims,
  live claims on non-claimed lanes, fence mismatch, orphan outbox rows, and runs
  `PRAGMA integrity_check`.

Idempotency is by `idempotency_key`, unique on both claims and outbox.

## 7. Evidence target

The `events` table — append-only, monotonic `seq`, `event_id` unique, carrying lane,
type, delegation, objective, lease, dispatch, idempotency key, fencing token, control head
and payload. Every transition is reconstructable from it.

`export_audit_json` produces a portable snapshot. **P15** renders the operator view.

## 8. Acceptance target

```
cd control-gateway && node --test test/a01-supervisor-handoff.test.js
cd python && PYTHONPATH="$PWD:$(cd ../.. && pwd)" python -m unittest test_a01_morning_receipt
```

**PASS** when both pass with zero failures. The receipt suite builds a real
`SupervisorStore`, so the schema and its constraints are exercised on every CI run.

**This acceptance target is materially weaker than the implementation deserves, and that
is the finding.** It proves the schema and the handoff contract. It does not prove
`claim_ready` under contention, fencing-token supersession, `recover` at the SLA boundary,
circuit opening, or `audit_invariants` catching a seeded violation. Those behaviours are
implemented carefully and verified by nothing that runs automatically.

## 9. Authority boundary

**Lane may decide alone (`agent`):** query shape, event payload fields, added tests,
default `heartbeat_sla_seconds` within an order of magnitude.

**Requires the owner (`owner`):** removing or weakening `uq_active_claim_per_lane`;
changing fencing-token semantics; permitting a write without a current token; removing an
`audit_invariants` check; changing PRAGMA durability settings; adding any external
dispatch path.

Weakening the fencing rule would let two workers write to one lane. Every other guarantee
in this capability rests on that not being possible.

## 10. Open gaps

**Test coverage is the gap, not the code.** Five behaviours need a suite that runs in CI:

1. Concurrent `claim_ready` on one lane — one wins, one raises `Conflict`.
2. A stale token write raising `StaleWorker` after `recover`.
3. `recover` at the heartbeat SLA boundary, distinguishing `LEASE_EXPIRED` from
   `HEARTBEAT_STALE`.
4. `dispatch_failed` exhausting its budget and opening a circuit with `next_probe_at`.
5. `audit_invariants` detecting each seeded violation it claims to detect.

This is the highest-value remaining test work in the estate. The primitives are sound;
nothing currently proves they stay sound.
