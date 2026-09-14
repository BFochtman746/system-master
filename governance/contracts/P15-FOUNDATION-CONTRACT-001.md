# P15 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P15 Observability, morning receipt and rollback · **Effective** 2026-09-13
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-001.json`

## 1. Contract / interface

Two components answering "what happened" and "how do I undo it."

- `a01_morning_receipt` — `python -m a01_morning_receipt [--db] [--since] [--json] [--out]`.
  Emits one page: what needs a decision, what is stuck, what ran, what the night spent.
- `governance/ROLLBACK-PROCEDURE-001.md` — the procedure for reverting a control-plane
  change safely, including in-flight leases.

Also offers `collect()`, `render()`, `session_start()` as importable functions for a
notification wrapper.

Does not offer: repair, cancellation, lease release, or any write. Diagnosis only.

## 2. Ingress routes

1. **Operator, each morning** — the primary route, by design. A receipt nobody reads is
   not observability.
2. **Scheduled task after the window closes**, writing `--out`.
3. **Programmatic** — `collect()` from a notifier.

The rollback procedure's ingress is human judgement, gated on its own decision table.

## 3. Egress routes

- stdout or `--out`: markdown, or JSON with `--json`.
- Exit code: 0 clean night, 1 attention required, 2 database unreadable. The exit code is
  what lets a notification fire without parsing prose.
- No side effects.

## 4. Persistence and canonical writer

None. P15 writes no durable state.

The supervisor SQLite is opened `file:<path>?mode=ro` via URI.
`test_connection_refuses_writes` asserts an INSERT raises `sqlite3.OperationalError`. A
reporting tool that can mutate what it reports on is one you cannot trust at 6am, so this
is enforced at the connection, not by discipline.

The optional `--out` file is caller-named and owned by the caller.

## 5. Dependencies

- **P10** supervisor store — `claims`, `delegations`, `events`, `circuits`, `lanes`,
  `dispatch_outbox`.
- **P11** night scheduler — `night_scheduler_queue`, read if present.
- **P12** ingress — shares the midday session-rollover rule so both cover one night.
- Python 3.12 stdlib only.

Crosses no boundary rule.

## 6. Failure semantics

**Fail-closed on ambiguity.** The governing rule: *"nothing ran" and "I could not tell"
must never look alike.*

- Database absent → `FileNotFoundError`, exit 2, no report. Never a clean receipt.
  `test_missing_database_raises_rather_than_reporting_a_clean_night` enforces this.
- Database unreadable or locked → exit 2 with the SQLite error.
- A table missing (older schema) → that section is empty, the rest renders. Degrades
  rather than dying, because a partial receipt beats none.
- A truly empty night → renders "Nothing ran" with the specific thing to check, rather
  than an empty page that reads like success.

Read-only and idempotent. Any number of runs is identical to one.

Rollback failure semantics: the procedure requires all five verification checks green
before resuming. Resuming into a red gate is how a rollback becomes an outage.

## 7. Evidence target

- `--out receipt.md` per night, retained alongside the task log.
- `--json` for archival, carrying counts, decisions, failures, open claims, circuits,
  stalled dispatches and lane state.
- Rollbacks append to `governance/ROLLBACK-LOG-001.md`, one entry each, ending with the
  gate that should have caught the problem.

## 8. Acceptance target

```
cd control-gateway/python && PYTHONPATH="$PWD:$(cd ../.. && pwd)" \
  python -m unittest test_a01_morning_receipt
```

**PASS** when all 13 tests pass with zero skips. The suite builds a real `SupervisorStore`
so queries run against the actual schema rather than a fixture that could drift from it.

Three tests encode contract terms rather than behaviour: the read-only connection refuses
writes; the decisions section precedes Failed, Open circuits and Completed; and the
rendered receipt stays under 80 lines with 20 completed claims, so it remains one scroll.

Runs as the `ingress-suite` CI job.

## 9. Authority boundary

**Lane may decide alone (`agent`):** section wording, additional diagnostic fields, query
optimisation, more tests.

**Requires the owner (`owner`):** changing the exit-code meanings; making a missing
database non-fatal; reordering sections so decisions do not lead; opening any write path;
changing the session rollover rule, which must stay aligned with P12.

## 10. Open gaps

None in either component. Two adoption items outside them:

- The receipt is not yet scheduled to run automatically, so it currently depends on
  remembering. Register it after the ingress task.
- `ROLLBACK-LOG-001.md` does not exist yet; it is created by the first rollback.
