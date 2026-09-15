# P10 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P10 Second-shift supervisor: lanes, leases, fencing · **Effective** 2026-09-15  
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`

## 1. Contract / interface

`tools/second_shift_supervisor_v2.py` defines the SQLite-backed `SupervisorStore` state machine for Second Shift lane ownership, durable delegations, claims, leases, fencing, dispatch intent, recovery and audit.

Primary lifecycle operations are `register_lane`, `bind_ready`, `claim_ready`, `mark_dispatched`, `dispatch_failed`, `heartbeat`, `progress`, `terminal`, `invalidate_head`, `recover`, `pending_dispatches`, `audit_invariants`, `snapshot`, and `export_audit_json`.

The central invariant is one live mutation claim per lane. Each accepted claim receives the lane's monotonically increasing fencing token. Worker writes are valid only while their lease is live, their token equals both the claim token and current lane fence, and their control head remains current.

## 2. Ingress routes

P10 is a library/state kernel, not a network service. Its production caller is P11's A-01 night scheduler, with coordination adapters and operator tooling as bounded callers.

`claim_ready` admits exact READY delegation identity and an idempotency key. Worker mutation routes (`heartbeat`, `progress`, terminalization) carry `lease_id` plus `fencing_token` and fail closed through live-worker validation. P11 owns night-wide ordering and claim authorization; P10 owns lane-local claim/fence truth.

## 3. Egress routes

P10 persists and returns state through `lanes`, `delegations`, `claims`, `dispatch_outbox`, `circuits`, and append-only `events`. It emits durable dispatch intent but performs no network dispatch itself.

`pending_dispatches`, `snapshot`, and `export_audit_json` expose reconstructable control state. P15 may consume this state read-only for operator/morning reporting.

## 4. Persistence and canonical writer

SQLite is configured with `journal_mode=WAL`, `synchronous=FULL`, `busy_timeout=30000`, `foreign_keys=ON`, and explicit transactions.

Storage-level controls include `uq_active_claim_per_lane` on unreleased claims, unique dispatch/idempotency identities, and foreign-key lineage between lanes, delegations, claims and dispatch intent. Schema bootstrap uses a read-only fast path after initialization to avoid competing schema writers on restart.

For the six P10 state tables, `SupervisorStore` is the canonical mutation boundary. P11 adds scheduler-owned tables in the same coordination database but does not replace P10's lane/lease/fencing authority.

## 5. Dependencies

Runtime dependency is Python stdlib `sqlite3`; no package, network, or subprocess dependency is required by `SupervisorStore` itself.

P10 depends on current System Master ownership/control-head identity. P11 consumes P10 directly; P12 depends on it indirectly through ingress/scheduling; P15 is read-only. The registered exact-subject A-01 qualification is `SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS`.

## 6. Failure semantics

P10 fails closed:

- concurrent second live claim -> `Conflict`, reinforced by the partial unique index;
- wrong or superseded fence -> `StaleWorker`;
- expired lease -> `StaleWorker`;
- changed control head -> active authority becomes STALE, lane fence increments and lane moves to `RECONCILE`;
- `recover` treats `expires_at <= now` as `LEASE_EXPIRED`, while heartbeat age becomes `HEARTBEAT_STALE` only when age is strictly greater than the configured SLA;
- recovery releases the claim, advances the lane fence, moves the lane to `RECONCILE`, and records the reason in append-only evidence;
- dispatch failures are idempotent by `failure_id`, bounded to retry budget 1..3, then open a circuit with a durable `next_probe_at`;
- `audit_invariants` detects multiple active claims, claimed lanes without claims, live claims on non-CLAIMED lanes, fence mismatch, orphan dispatch rows, and—when deep—SQLite integrity failure.

## 7. Evidence target

The primary runtime evidence is the append-only `events` table with monotonic sequence, unique event identity, lane/delegation/lease/dispatch/idempotency/fence/control-head bindings, timestamps and payload.

Foundation qualification evidence additionally includes the targeted P10 invariant suite, the deterministic 20,000-transition supervisor stress report, cumulative CG-008 through CG-011 qualification stages, and the exact-subject A-01 receipt/artifact from `SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS`.

## 8. Acceptance target

Hosted acceptance must run:

```text
python tests/test_second_shift_supervisor_p10_foundation.py
python tests/run_second_shift_supervisor_v2_optimized.py
```

The targeted suite proves: exactly one winner under 32-way contention; recovery fences subsequent stale-worker writes; exact lease/heartbeat boundary and reason semantics; retry-budget circuit opening with exact `next_probe_at`; and every logical corruption class claimed by `audit_invariants`.

The optimized suite independently exercises crash/restart, idempotency, multi-lane behavior and deterministic 20,000-transition invariant stress with a final deep SQLite integrity check.

Foundation closure additionally requires live exact-SHA A-01 PASS from `SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS`; hosted PASS alone is not Foundation evidence closure.

## 9. Authority boundary

P10 may determine lane-local claim/lease/fence state, reject stale workers, recover abandoned authority, maintain dispatch intent/retry circuits, and produce audit evidence.

P10 may not choose the night-wide work order or global dispatch budget; that authority belongs to P11. It may not grant product promotion, publication, external-action, or human authority. Weakening the one-live-claim rule, fencing-token semantics, SQLite durability, recovery fail-closed behavior, or invariant checks requires owner-level authority.

## 10. Open gaps

The implementation gap identified by the earlier contract was test/CI proof, not a missing state-machine primitive. The dedicated P10 targeted acceptance suite and A-01 qualifier binding now encode those previously missing checks.

P10 remains an `ACTIVE_GAP` until the exact closure subject passes hosted acceptance and the registered A-01 stress qualification, the immutable receipt is admitted to the Foundation evidence registry, the committed census is reconciled, and Required Verification is green. No implementation-level gap is asserted closed merely by this contract update.
