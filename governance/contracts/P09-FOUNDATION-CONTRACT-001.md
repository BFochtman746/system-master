# P09 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P09 Repair broker and durable repair lineage · **Effective** 2026-09-13
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-002.json`

## 1. Contract / interface

The repair broker turns a qualification failure into a durable, auditable repair
transaction, and reconciles that ledger against its own append-only event lineage.

- `.github/scripts/a01-repair-ledger.js` — ledger operations.
- `.github/scripts/a01-repair-ledger-reconcile.js` (177 lines) — the integrity checker.
- `.github/scripts/a01-repair-ledger-selftest.js`.
- `a01-repair-ledger-ingest.yml`, `a01-repair-ledger-selftest.yml`.
- `a01-repair-receipt-ingest.yml` and `a01-repair-rerun-adjudicate.yml`, both
  `workflow_run` triggered off the gateway.

A transaction carries `transaction_id`, `classification` (e.g. `REPAIRABLE_SUBJECT`),
`state` (`REPAIR_REQUEST_READY`, `CLAIMED`, `CANDIDATE_PREQUAL_REQUIRED`,
`A01_REQUEUE_READY`, `RETRY_REQUEST_READY`, terminal), `qualification_id`,
`workstream_id`, and the subject SHA lineage.

Two repair shapes, deliberately distinct: **replacement** (a new subject SHA, via
`A01_REQUEUE_READY` and a replacement ticket) and **same-SHA retry** (via
`RETRY_REQUEST_READY` and a retry ticket).

## 2. Ingress routes

1. **`workflow_run` from the gateway** — receipt ingest on completion.
2. **Rerun adjudication** — `workflow_run` from the gateway, repair rerun, and the 001C
   live proof.
3. **Ledger ingest and reconcile**, scheduled or manual.

`repair_transaction_id` arrives on a dispatch through **P06** and binds a new run to an
existing lineage. It was silently dropped by the bridge until 2026-09-13, which forked
the ledger; that is the defect this contract's §6 exists to prevent recurring.

## 3. Egress routes

- Ledger entries: active transactions and transaction history.
- Append-only repair events per transaction.
- Durable agent dispatch packets for repairable transactions.
- Replacement and retry tickets, each bound to an exact subject SHA.
- Reconcile output: structured errors and warnings.

## 4. Persistence and canonical writer

The ledger lives in the repository under `qualification/a01/repair-requests/` and related
paths, written by the ledger workflows running with `contents: write` — the only part of
the control plane that writes governance-adjacent state from a workflow.

**Every transaction has an append-only event lineage, and the reconciler treats a missing
lineage as an error rather than an absence.** A transaction with no events is
`REPAIR_EVENT_LINEAGE_MISSING`; one without `TRANSACTION_OPENED` is the same error. State
is not trusted on its own — it must be reconstructable from events.

Tickets are the canonical statement of what will be re-qualified, and their subject SHA,
qualification id and workstream must all match the transaction, or `REPAIR_LINEAGE_MISMATCH`.

## 5. Dependencies

- **P08** qualification — produces the failures. The `SUBJECT_FAILURE` classification is
  what makes a failure repairable; infra and control-plane failures must not enter here.
- **P06** gateway — carries `repair_transaction_id` and `repair_attempt`.
- **P03** retention — `qualification/` is a never-prune prefix, so repair evidence is
  protected at any age.

## 6. Failure semantics

**Fail-closed on lineage. The reconciler's whole job is to refuse to believe state that
events do not support.**

Detected conditions, each a named error:

- `REPAIR_TRANSACTION_DUPLICATE` — a transaction appearing twice, including once active
  and once in history. A transaction has exactly one home.
- `REPAIR_EVENT_LINEAGE_MISSING` — no events, no `TRANSACTION_OPENED`, no
  `AGENT_DISPATCH_READY` on a repairable active transaction, no `CANDIDATE_PREQUALIFIED`
  or `A01_REPLACEMENT_TICKET_EMITTED` on `A01_REQUEUE_READY`, no `A01_RETRY_TICKET_EMITTED`
  on `RETRY_REQUEST_READY`.
- `REPAIR_EVENT_LINEAGE_MISMATCH` — an event whose `transaction_id` differs from its
  transaction.
- `REPAIR_AGENT_DISPATCH_MISSING` — an active repairable transaction with no current
  durable dispatch packet.
- `REPAIR_REPLACEMENT_TICKET_MISSING` / `REPAIR_RETRY_TICKET_MISSING`.
- `REPAIR_LINEAGE_MISMATCH` — ticket subject SHA, qualification or workstream differing
  from the transaction.
- `REPAIR_TERMINAL_EVENT_MISSING` — a historical transaction with no terminal event.

The invariant underneath all of these: **a repair lineage is one transaction, one event
chain, one ticket per state, and one terminal event.** Bounded attempts are carried by
`repair_attempt` and `max_repair_attempts` on the dispatch, and P06 now refuses a non-zero
attempt with no transaction id.

## 7. Evidence target

The ledger itself plus the per-transaction event files — append-only and reconstructable.
`a01-repair-ledger-reconcile.js` output is the integrity evidence, and a clean reconcile is
the claim that the ledger means what it says.

## 8. Acceptance target

```
node .github/scripts/a01-repair-ledger-selftest.js
node .github/scripts/a01-repair-ledger-reconcile.js
```

**PASS** when the selftest passes and reconcile reports zero errors. Warnings are
advisory. Reconcile is the stronger of the two: it runs against the real ledger rather
than fixtures.

## 9. Authority boundary

**Lane may decide alone (`agent`):** error detail wording, additional reconcile checks,
report formatting.

**Requires the owner (`owner`):** adding or removing a transaction state; changing the
repair attempt ceiling; permitting a transaction without event lineage; permitting a
ticket whose subject SHA differs from its transaction; changing which result classes are
repairable; granting any workflow here broader than `contents: write` on ledger paths.

Allowing a transaction to exist without its event chain would end this capability. State
without lineage is a claim, not a record.

## 10. Open gaps

- **No global repair budget.** `max_repair_attempts` bounds one lineage. Nothing bounds
  total repair attempts across a night — P12's night budget bounds *ingress*, not repair
  reruns triggered by `workflow_run`. A repair loop across a dozen transactions can still
  consume a window.
- **Result-class routing is unproven.** Nothing automated asserts that `INFRA_FAILURE` and
  `CONTROL_PLANE_FAILURE` never open a repair transaction. This is the highest-risk
  untested path here: an infra fault consuming repair attempts against a healthy subject
  would look exactly like a failing subject.
- **Reconcile is not wired into CI.** It runs on demand. The ledger can drift between runs
  with nothing noticing.
