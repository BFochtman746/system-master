# P15 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P15 Observability, morning receipt and rollback · **Effective** 2026-09-15  
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json` / `CURRENT-AUTHORITY-005`

## 1. Contract / interface

P15 answers two operator questions without taking execution authority: **what happened overnight?** and **how do I return from a defective control-plane change safely?**

Canonical components:

- `control-gateway/python/a01_morning_receipt.py`
  - `python -m a01_morning_receipt [--db] [--since] [--state-dir] [--json] [--out]`
  - importable `collect()`, `render()`, `session_date()`, `session_start()` and `connect_read_only()`.
- `governance/ROLLBACK-PROCEDURE-001.md`
  - operator decision procedure for halt/capture/lease handling/revert-or-supersede/verify/resume.

P15 is diagnostic. It does **not** repair, cancel, release a lease, mint admission, mutate scheduler state, or create product authority.

## 2. Ingress routes

1. Morning/operator invocation against the authoritative A-01 supervisor SQLite database.
2. Programmatic `collect()` for a notifier or scheduled wrapper.
3. Rollback procedure ingress is an explicit operator/owner decision; the procedure begins by engaging P12's existing kill switch and never invents a second stop authority.

The reporting window shares P12's local-noon session rollover. One overnight session therefore keeps the same identity across the midnight boundary.

## 3. Egress routes and exit semantics

- Markdown to stdout by default.
- JSON with `--json`.
- Caller-owned file with `--out`.
- Exit `0`: readable report with no attention decision.
- Exit `1`: readable report with one or more attention decisions.
- Exit `2`: database/report source unreadable or invalid.

`0`, `1`, and `2` are intentionally distinct. **Nothing ran** and **I could not tell** must never collapse into the same result.

## 4. Persistence and canonical writer

P15 has no canonical database writer.

The supervisor database is opened through SQLite URI `mode=ro` and `PRAGMA query_only=ON`. `test_04_connection_refuses_writes` proves a valid INSERT is rejected by SQLite itself.

The optional output file is caller-owned reporting output, not canonical execution state. Rollback history is append-only and event-created in `governance/ROLLBACK-LOG-001.md` when the first real rollback occurs; P15 does not fabricate a rollback log before an event exists.

## 5. Dependencies

- **P10** supervisor store: `lanes`, `delegations`, `claims`, `dispatch_outbox`, `circuits`, `events`.
- **P11** scheduler when present: `night_scheduler_queue`, `night_scheduler_night_budget`.
- **P12** ingress: shared session rollover and `NIGHT-HALT` kill-switch state only; P15 does not change P12's qualified ingress bytes.
- Python 3.12 standard library only for production reporting.

Optional scheduler tables degrade to an empty section so an older/readable database can still produce partial evidence. A missing database does not degrade; it exits 2.

## 6. Report semantics

The report is deliberately glanceable and decision-first:

1. Decisions requiring attention.
2. Blocked/stale claims.
3. Claims still holding leases.
4. Open circuits.
5. Stalled dispatches.
6. Completed/run summary.
7. Durable night-budget usage.
8. Lane state.

Attention is raised for an engaged ingress kill switch, unreleased claims, blocked/stale claims, open circuits, stalled retry/circuit/cancel-requested dispatches, or scheduler items stuck in `BINDING`/`RECONCILE`.

A truly empty night renders `Nothing ran` plus an ingress/admission check instruction. It does not masquerade as successful execution.

## 7. Rollback semantics

`governance/ROLLBACK-PROCEDURE-001.md` is current to the admitted P12 CLI:

- engage with `a01_github_ingress --kill`, not obsolete `--halt`/`--status` commands;
- capture Git + supervisor DB + P15 report before change;
- let P10/P11 leases finish or expire where possible;
- use Git revert for code and successor governance for append-only governance history;
- never force-push or delete/move CAS authority refs;
- run all five verification gates before `--resume`;
- preserve the first post-rollback morning receipt before declaring operational health.

Rollback never grants authority to mutate P12 admission, P10/P11 fencing, or historical evidence.

## 8. Evidence target

Hosted evidence must prove:

- Python 3.12 syntax and all 13 acceptance tests;
- real `SupervisorStore` schema use;
- read-only connection enforcement;
- missing-database exit-2 semantics;
- attention vs clean exit semantics;
- P12-compatible session rollover;
- P10/P11 state observation and optional-table degradation;
- decision-first ordering and <=80-line one-scroll rendering with 20 completed claims;
- rollback procedure uses current P12 kill/resume interface and Foundation verification.

Authoritative A-01 evidence must execute the unchanged registered `SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS` qualifier on the exact P15 subject. The Control Gateway Node bridge `control-gateway/test/a01-morning-receipt.test.js` ensures that cumulative qualifier discovers the P15 Python suite without changing predecessor qualifier/registry blobs.

## 9. Acceptance target

Hosted direct acceptance:

```bash
PYTHONPATH="$PWD/control-gateway/python:$PWD" python tests/test_a01_morning_receipt.py
node --test control-gateway/test/a01-morning-receipt.test.js
```

**PASS** requires all **13 tests** with zero failures/skips, hosted P15 manifest upload, trusted A-01 admission, exact-subject A-01 `PASS`, `promotion_authorized=false`, and independent Required Verification.

Dedicated workflow:

`.github/workflows/p15-observability-morning-rollback-foundation-qualification.yml`

## 10. Authority boundary

**Agent-owned:** diagnostic query optimization, section wording that preserves decision-first meaning, additional read-only fields, tests, and evidence manifests.

**Owner decision required:** changing exit-code meanings; making unreadable state look clean; opening any write path; changing the P12/P15 session rollover; force-releasing leases; deleting/moving CAS refs; resuming with a red verification gate.

## 11. Closure rule

P15 is `COMPLETE_WITH_EVIDENCE` only after the exact current subject has a current immutable Foundation PASS receipt and the committed census projection advances past P15. Implementation presence or hosted-only PASS is insufficient.
