# P09 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P09 Repair broker and durable repair lineage · **Effective** 2026-09-15  
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`

## 1. Contract / interface

P09 is the canonical repair-classification and durable-lineage layer behind failed A-01 qualification. Its canonical state writer is `.github/scripts/a01-repair-ledger.js`; `.github/scripts/a01-repair-broker.js` is the classification/owner-routing companion.

P09 does not decide whether a qualification passed. It consumes truthful P08 result classes and preserves every repair/retry decision in the same failed-receipt lineage.

The core routing invariant is:

| P08 result | P09 classification | Permitted repair effect |
|---|---|---|
| `SUBJECT_FAILURE` | `REPAIRABLE_SUBJECT` | Product-owner repair may produce a **changed exact SHA** after deterministic prequalification PASS. |
| `INFRA_FAILURE` | `RETRYABLE_INFRA` | Shared A-01/Core may perform the bounded **same-SHA** infrastructure retry only. It never becomes changed-SHA product repair. |
| `CONTROL_PLANE_FAILURE` | `CONTROL_PLANE_OWNER_ROUTE` | Core owner action only. It never emits a product replacement ticket. |
| `PASS` | `PASS` | No repair is opened. |

Human/author/private/native/external, admission-only, dependency-only and unclassified outcomes keep their truthful non-product-repair routes.

## 2. Durable transaction model

One `transaction_id` represents one failed-receipt lineage. A changed repaired subject remains in that transaction; P09 never creates a disconnected second transaction for the same lineage.

Canonical durable state is represented by:

- owner repair inbox projections under `governance/repair/*-REPAIR-INBOX.json`;
- append-only events under `governance/repair/events/`;
- exact replacement/retry tickets under `qualification/a01/repair-requests/`;
- the routing and lineage law in `governance/repair/REPAIR-LEDGER-REGISTRY-001.json`.

Important states include `REPAIR_REQUEST_READY`, `A01_REQUEUE_READY`, `RETRY_REQUEST_READY`, `OWNER_ACTION_REQUIRED`, `OWNER_AUTHORITY_REQUIRED`, `WAIT_FOR_PREDECESSOR`, `REPLAN_ADMISSION`, `DEAD_LETTER`, and terminal `CLOSED`.

Historical events are append-only. Current projections may be reconstructed from the event/ticket lineage; history is never rewritten to make a later result look cleaner.

## 3. Changed-SHA subject repair

Only `REPAIRABLE_SUBJECT` may enter product repair finalization.

A replacement subject must:

1. be a valid 40-hex Git SHA;
2. differ from the exact failed repair-base SHA;
3. have deterministic prequalification `PASS` on that same replacement SHA;
4. preserve `qualification_id`, `workstream_id`, root failed receipt, immediate failed receipt and repair transaction identity;
5. remain `A01_ELIGIBLE` only until a fresh authoritative A-01 receipt exists.

A repair worker has zero authority to synthesize PASS, promotion, publication or production standing.

## 4. Same-SHA infrastructure retry

`INFRA_FAILURE` is not product code repair. P09 routes it to shared A-01/Core and permits at most one same-SHA infrastructure retry in the transaction lineage.

The retry ticket must preserve the exact subject SHA, qualification, workstream and transaction identity. The infrastructure retry does not consume a product repair attempt. Repeated infrastructure failure is dead-lettered for owner review.

## 5. Control-plane failure

`CONTROL_PLANE_FAILURE` routes to `SYSTEM_MASTER/CORE` as `CORE_CONTROL_PLANE_REPAIR`. It may remain in durable lineage for audit/reconciliation, but it cannot be finalized as product repair, cannot emit a changed-SHA replacement request and cannot inherit product-owner mutation authority.

## 6. Per-lineage repair budgets

Product repair attempts are bounded by each transaction's `max_repair_attempts`; repair intake rejects invalid budgets and the ledger dead-letters an exhausted lineage. Same-SHA infrastructure retry count is separately bounded to one.

P09 deliberately does **not** own an aggregate overnight scheduler budget. `P11` owns night scheduling and claim authority, including the night-wide dispatch budget. P09 supplies the exact transaction, workstream, qualification, subject and attempt metadata P11 needs and may not bypass P11 for overnight execution. This prevents two independent schedulers from competing for A-01.

## 7. Rerun and adjudication

`.github/workflows/a01-repair-rerun.yml` resolves the existing durable transaction and forwards `repair_transaction_id` through the canonical A-01 gateway. The exact rerun subject comes from the transaction's current replacement or retry ticket.

Adjudication stays in the same transaction:

- authoritative exact-subject `PASS` closes it;
- replacement `SUBJECT_FAILURE` consumes the current product repair attempt and either redispatches the same lineage or dead-letters it when exhausted;
- `INFRA_FAILURE` may produce only the bounded same-SHA retry;
- `CONTROL_PLANE_FAILURE`, admission/dependency and non-automatable outcomes keep truthful owner states instead of masquerading as product failure.

Receipt-less rerun attempts may be recorded only for infrastructure/control-plane failures and are never treated as authoritative A-01 receipts.

## 8. Reconciliation / fail-closed behavior

`.github/scripts/a01-repair-ledger-reconcile.js` fails closed on broken durable lineage, including duplicate transactions, missing open/terminal events, ticket identity mismatches, missing dispatch/ticket events, orphan events/tickets and inconsistent terminal receipts.

Reconciliation is already enforced in CI by `.github/workflows/a01-repair-ledger-selftest.yml`; it is not an open P09 implementation gap.

## 9. Dependencies and authority boundaries

P09 depends on:

- **P08** for truthful `PASS` / `SUBJECT_FAILURE` / `INFRA_FAILURE` / `CONTROL_PLANE_FAILURE` semantics;
- **P06/P07** for the canonical gateway and admission barrier;
- **P03** for evidence retention;
- **P11** for overnight scheduling/claim authority and aggregate night dispatch budget.

P09 owns repair routing and lineage only. It does not gain another peer's product semantics, cannot authorize external/human/private/native effects, and cannot grant promotion or production authority.

## 10. Foundation acceptance target

Canonical P09 qualification:

```text
.github/workflows/p09-repair-broker-lineage-foundation-qualification.yml
```

Hosted prequalification must prove:

1. `SUBJECT_FAILURE` is the only changed-SHA product-repair route;
2. `INFRA_FAILURE` is bounded same-SHA shared-infrastructure retry only;
3. `CONTROL_PLANE_FAILURE` is Core owner action only;
4. product finalization rejects infra/control transactions;
5. replacement tickets bind exact changed SHA plus deterministic prequalification PASS;
6. reruns preserve the original `repair_transaction_id`;
7. product and infrastructure budgets remain distinct and bounded;
8. durable event/ticket/inbox reconciliation passes;
9. reconciliation is wired into CI;
10. P11—not P09—owns aggregate overnight dispatch scheduling/budget.

The same exact subject must then execute the already-registered `A01-CLOSED-LOOP-REPAIR-SELFTEST` through the canonical A-01 gateway and return:

```text
admission_state = ADMITTED
result_class = PASS
promotion_authorized = false
checkout_sha = subject_sha = requested exact subject SHA
```

`promotion_authorized=false` is required because the registered P09 repair probe is a focused gate. Its PASS is exact-subject repair-control evidence, not promotion authority.

Foundation completion requires registration of the successful exact-subject workflow run/artifact in `governance/census/FOUNDATION-CLOSURE-EVIDENCE-REGISTRY-001.json` and a current committed Foundation matrix.

## 11. Open gaps

No P09-internal implementation gap remains once the canonical qualification above passes on the closure-ready exact subject. Aggregate night-wide dispatch budgeting remains a **P11 acceptance obligation**, not a second P09 scheduler.
