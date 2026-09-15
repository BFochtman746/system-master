# P15 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P15 Observability, morning receipt and rollback · **Effective** 2026-09-15  
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json` / `CURRENT-AUTHORITY-005`

## 1. Contract / interface

P15 answers two operator questions without taking execution authority: **what happened overnight?** and **how do I return from a defective control-plane change safely?**

Canonical components:

- `control-gateway/python/a01_morning_receipt.py`
  - `python -m a01_morning_receipt [--db] [--since] [--state-dir] [--json] [--out]`
  - importable `collect()`, `render()`, `session_date()`, `session_start()` and `connect_read_only()`.
- `control-gateway/windows/run-a01-morning-receipt.ps1`
  - local read-only operational runner that preserves a timestamped JSON receipt plus `LATEST.json` and returns the P15 0/1/2 result to Windows Task Scheduler.
- `control-gateway/windows/install-a01-morning-receipt-task.ps1`
  - one-time elevated installer for `SystemMaster-A01-MorningReceipt`, running as `SYSTEM` daily at **07:15 America/New_York local machine time**.
- `governance/ROLLBACK-PROCEDURE-001.md`
  - operator decision procedure for halt/capture/lease handling/revert-or-supersede/verify/resume.

GitHub remains qualification/evidence transport only. P15 deliberately does **not** create an independent scheduled or direct self-hosted GitHub A-01 workflow. P15 is diagnostic and does not repair, cancel, release a lease, mint admission, mutate scheduler state, or create product authority.

## 2. Ingress routes

1. Morning/operator invocation against the authoritative A-01 supervisor SQLite database.
2. Programmatic `collect()` for a notifier or wrapper.
3. Local Windows Task Scheduler invocation of the P15 runner at 07:15 local time, after the 07:00 Second Shift boundary without UTC/DST drift.
4. Rollback procedure ingress is an explicit operator/owner decision; the procedure begins by engaging P12's existing kill switch and never invents a second stop authority.

The reporting window shares P12's local-noon session rollover. One overnight session therefore keeps the same identity across the midnight boundary.

## 3. Egress routes and exit semantics

- Markdown to stdout by default.
- JSON with `--json`.
- Caller-owned file with `--out`.
- Local operational runner writes a timestamped JSON receipt under `C:\SystemMaster\evidence\morning-receipts` by default and refreshes `LATEST.json`.
- Windows Task Scheduler retains the process result code for operational visibility.
- Exit `0`: readable report with no attention decision.
- Exit `1`: readable report with one or more attention decisions.
- Exit `2`: database/report source unreadable, required P10 schema missing, or input invalid.

`0`, `1`, and `2` are intentionally distinct. **Nothing ran** and **I could not tell** must never collapse into the same result.

## 4. Persistence and canonical writer

P15 has no canonical database writer.

The supervisor database is opened through SQLite URI `mode=ro` and `PRAGMA query_only=ON`. The read-only handle is explicitly closed so Windows A-01 does not retain the database after report completion. A readable SQLite file missing required P10 tables is fail-closed and exits `2`; it must not become an empty clean receipt.

P11 scheduler tables and `night_execution_results` are optional extensions. Their absence is explicitly named in `degraded_sections`; it does not fabricate observed state.

The operational receipt files are caller/local-operations-owned reporting evidence, not canonical execution state. Rollback history is append-only and event-created in `governance/ROLLBACK-LOG-001.md` when the first real rollback occurs; P15 does not fabricate a rollback log before an event exists.

## 5. Dependencies

- **P10** supervisor store: `lanes`, `delegations`, `claims`, `dispatch_outbox`, `circuits`, `events` — required.
- **P11** scheduler when present: `night_scheduler_queue`, `night_scheduler_night_budget`.
- **Execution worker** when present: `night_execution_results`.
- **P12** ingress: shared session rollover and `NIGHT-HALT` kill-switch state only; P15 does not change P12's qualified ingress bytes.
- Windows Task Scheduler on A-01 for operational morning delivery. Installation is an operations/deployment action performed once with elevation; the qualifier validates the installer/runner contract but does not mutate the machine by installing the production task.
- Python 3.12 standard library only for production reporting.

## 6. Failure semantics

The report is deliberately decision-first. It raises attention for an engaged ingress kill switch, unreleased claims, blocked/stale claims, failed/authority-lost execution results, open circuits, stalled retry/circuit/cancel-requested dispatches, or scheduler items stuck in `BINDING`/`RECONCILE`.

A truly empty night renders `Nothing ran` plus an ingress/admission check instruction; it never masquerades as successful execution. An unreadable/missing database or missing required P10 schema exits `2`. Missing optional P11/worker extensions are named as degraded sections. A readable state requiring operator action exits `1`; a readable state with no attention decision exits `0`.

Rollback failures remain fail-closed. `governance/ROLLBACK-PROCEDURE-001.md` uses the admitted P12 CLI (`--kill` / `--resume`), captures Git + supervisor state + P15 report before mutation, captures SQLite through SQLite's backup API rather than a raw copy of a live WAL database, lets P10/P11 leases finish or expire where possible, preserves CAS refs and historical evidence, calls P12 service commands with their required arguments and no unsupported flags, and forbids resume while any of all five verification gates is red.

## 7. Evidence target

Hosted evidence must prove:

- Python 3.12 syntax and all 16 acceptance tests;
- real `SupervisorStore` schema use;
- read-only connection enforcement and explicit handle closure on Windows;
- missing-database and missing-required-core-schema exit-2 semantics;
- attention vs clean exit semantics;
- P12-compatible session rollover;
- P10/P11/worker state observation and explicit optional-table degradation;
- failed/authority-lost execution-worker visibility;
- decision-first ordering and <=80-line one-scroll rendering with 20 completed claims;
- rollback procedure uses current P12 kill/resume/service interfaces and all Foundation verification gates;
- local runner invokes only the read-only P15 CLI and preserves local receipt evidence;
- local installer creates a daily 07:15 `SYSTEM` task through Windows Task Scheduler;
- no independent scheduled/direct-self-hosted GitHub A-01 workflow exists for P15;
- P12/P11/shared qualifier/policy/registry predecessor subjects are unchanged.

Authoritative A-01 evidence must execute the unchanged registered `SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS` qualifier on the exact P15 subject. The Control Gateway Node bridge `control-gateway/test/a01-morning-receipt.test.js` ensures that cumulative qualifier discovers the P15 Python suite and validates the local scheduling contract without changing predecessor qualifier/registry blobs.

## 8. Test / acceptance target

Hosted direct acceptance:

```bash
PYTHONPATH="$PWD/control-gateway/python:$PWD" python tests/test_a01_morning_receipt.py
node --test control-gateway/test/a01-morning-receipt.test.js
```

**PASS** requires all **16 tests** with zero failures/skips, local runner/installer contract validation, hosted P15 manifest upload, trusted A-01 admission, exact-subject A-01 `PASS`, `promotion_authorized=false`, A-01 control-plane enforcement PASS, and independent Required Verification.

Dedicated workflow:

`.github/workflows/p15-observability-morning-rollback-foundation-qualification.yml`

P15 is `COMPLETE_WITH_EVIDENCE` only after the exact current subject has a current immutable Foundation PASS receipt and the committed census projection advances past P15. Implementation presence, task-installer presence, or hosted-only PASS is insufficient.

## 9. Authority boundary

**Agent-owned:** diagnostic query optimization, section wording that preserves decision-first meaning, additional read-only fields, tests, local task runner/installer code, evidence manifests, and rollback documentation that does not create new authority.

**Owner/operations authority required:** installing/replacing the production Windows scheduled task on A-01; changing exit-code meanings; making unreadable state look clean; opening any write path; changing the P12/P15 session rollover; force-releasing leases; deleting/moving CAS refs; resuming with a red verification gate; or granting any new product, admission, scheduler, repair, native, private, external, publication, or production authority.
