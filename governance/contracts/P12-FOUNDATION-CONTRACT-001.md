# P12 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P12 GitHub to A-01 ingress transport · **Effective** 2026-09-13
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-001.json`

## 1. Contract / interface

`a01_github_ingress` reads the governance state of record from GitHub read-only, mints a
local A-01 admission receipt, builds a frozen gateway handoff plus CG-009 coordination
contract, and enqueues through the night scheduler.

- `Ingress.run_once(now, dry_run) -> IngressResult` — one pass.
- `build_handoff(obligation, *, control_head, control_ref, not_before, not_after, execution_order, session_date, ...)`
- `build_contract(handoff, *, graph_id, ...)`
- `NightBudget`, `KillSwitch` — night-scoped ceilings and halt.
- `a01_ingress_service` owns the `SupervisorStore` lifetime and binds the real scheduler.

Does not offer: any write to GitHub, scheduling decisions, claim selection, or execution.
A-01 remains sole scheduling owner; GitHub remains `ADMISSION_TRANSPORT_EVIDENCE_ONLY`.

## 2. Ingress routes

1. **Scheduled task** (`schtasks /SC ONSTART`, `--daemon`) — the production route.
   Admitting authority is the local A-01 receipt minted per delegation.
2. **Operator CLI** (`--once`, `--dry-run`) — same admission path, manual trigger.

`a01_github_ingress.main()` constructs with `scheduler=None` and can only build and
report. The single write path into the queue is `a01_ingress_service.build_scheduler`.

## 3. Egress routes

- **Into the night queue:** `A01NightScheduler.enqueue(handoff, contract)`. The only
  state-changing egress.
- **stdout:** one JSON object per line — `PASS`, `HALTED`, `BACKOFF`, `WINDOW_CLOSED`,
  `WIRING_OK`, `WIRING_FAILED`. Scheduled tasks are read from log files, not terminals.
- **Exit code:** 0 ok, 1 pass errors, 2 wiring failure.

No egress to GitHub in any mode.

## 4. Persistence and canonical writer

Two stores, each with exactly one writer.

- **Night queue** (`night_scheduler_queue` in the supervisor SQLite): the canonical writer
  is `A01NightScheduler`, never this module. P12 supplies a validated handoff and the
  scheduler decides. A refusal is recorded as `ENQUEUE_REFUSED` and never retried around.
- **Kill switch file** (`<state>/NIGHT-HALT`): written only by `KillSwitch.engage`,
  removed only by `KillSwitch.release`. No other component writes it.

`GitHubSource` has no write method. `test_github_source_exposes_no_write_method` asserts
it never grows one — the read-only property is enforced by test, not by convention.

## 5. Dependencies

- **P00–P02** governance state of record, read over the GitHub contents API.
- **P10** supervisor store (lanes, leases, fencing).
- **P11** night scheduler — the enqueue authority.
- **P07** admission semantics, mirrored in the locally minted receipt.
- Python 3.12 stdlib only. No packages.

Crosses no boundary rule.

## 6. Failure semantics

**Fail-closed throughout. No partial enqueue exists** — a handoff either validates whole
and is offered to the scheduler, or it is skipped and recorded.

- GitHub unreachable or non-200 → `IngressError`, recorded in `result.errors`, nothing
  enqueued, exit 1. Daemon backs off and retries; the budget still bounds the night.
- Handoff or contract fails validation → that obligation is skipped as `BUILD_FAILED` and
  the pass continues. One malformed obligation must not end the night.
- Scheduler refuses → recorded as `ENQUEUE_REFUSED`, no retry. The scheduler is the
  authority; arguing with it is how duplicates are born.
- Budget exhausted → remaining obligations skipped as `NIGHT_BUDGET_EXHAUSTED`.
- Kill switch engaged → pass halts. Re-checked before **every** item, so a mid-night halt
  stops the next one.

**Idempotency.** `delegation_id` is `digest(objective_id, control_head, session_date)`,
truncated to 16 hex characters and prefixed `ING-`. Re-polling unchanged state within one
night produces the identical id, which the scheduler treats as a no-op. The session date
rolls at midday so a night spanning midnight is one night.

This is corrected behaviour: the first implementation derived identity from the poll
instant, so every re-poll forked a new delegation. `test_identity_survives_a_moving_poll_instant`
exists to keep that fixed.

## 7. Evidence target

- **Per pass:** the JSON lines on stdout, captured by the scheduled task log. Each `PASS`
  line carries counts, skips with reasons, errors, and the budget snapshot.
- **Per delegation:** the handoff and coordination contract persisted by P11 in
  `night_scheduler_queue`, with `scheduler_digest`.
- **Per night:** the P15 morning receipt, which reads the resulting claims and events.

## 8. Acceptance target

```
cd control-gateway/python && PYTHONPATH="$PWD:$(cd ../.. && pwd)" \
  python -m unittest test_a01_github_ingress
```

**PASS** when all 25 tests pass with zero skips. The suite is offline by construction —
GitHub is a fake source, the scheduler a recording double — so it needs no token, no
network, and no database. Runs as the `ingress-suite` CI job.

Wiring acceptance: `python -m a01_ingress_service --check` reports
`"scheduler": "A01NightScheduler"` against a real store.

## 9. Authority boundary

**Lane may decide alone (`agent`):** poll interval, backoff, log line wording, additional
tests, internal refactoring that preserves the handoff shape.

**Requires the owner (`owner`):** changing the `delegation_id` identity rule; raising the
default night budget; adding a GitHub write path of any kind; changing `execution_class`
away from `OVERNIGHT`; altering the admission receipt shape; removing the kill switch
check from the per-item loop.

The identity rule and the read-only property are the two things that must never change
without a written decision. Both have already failed once in this module's short history.

## 10. Open gaps

None in the module. Two operational items outside it:

- The scheduled task is not yet registered. Until it is, nothing polls, and the failure
  is silent. Registration and the post-reboot `Last Result` check are in the
  `a01_ingress_service` docstring.
- `A01_INGRESS_TOKEN` is unset. Fine for a public repo; required if it goes private.
