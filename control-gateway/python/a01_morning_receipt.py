from __future__ import annotations

"""Read-only P15 morning receipt for the A-01 Second Shift control plane.

P15 observes P10/P11/worker state. It never repairs, schedules, cancels, releases a lease,
changes a fence, writes GitHub, or mutates the supervisor database.
"""

import argparse
import datetime as dt
import json
import os
import sqlite3
import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional
from urllib.parse import quote
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")
UTC = dt.timezone.utc
MORNING_RECEIPT_PROTOCOL = "control-gateway.a01-morning-receipt.v1"
ATTENTION_OUTBOX_STATES = {"RETRY_WAIT", "CIRCUIT_OPEN", "CANCEL_REQUESTED"}
ATTENTION_QUEUE_STATES = {"BINDING", "RECONCILE"}
REQUIRED_P10_TABLES = {"lanes", "delegations", "claims", "dispatch_outbox", "circuits", "events"}
DEFAULT_DB = r"C:\SystemMaster\a01-supervisor.db"


class MorningReceiptError(RuntimeError):
    pass


def _iso(value: dt.datetime) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timezone-aware datetime required")
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _parse_iso(value: str) -> dt.datetime:
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("timezone-aware timestamp required")
    return parsed.astimezone(UTC)


def session_date(now: Optional[dt.datetime] = None) -> str:
    """Return the P12/P15 night-session date; the session rolls at local noon."""
    now = now or dt.datetime.now(tz=UTC)
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("timezone-aware datetime required")
    local = now.astimezone(NY)
    day = local.date()
    if local.hour >= 12:
        day += dt.timedelta(days=1)
    return day.isoformat()


def session_start(now: Optional[dt.datetime] = None) -> dt.datetime:
    day = dt.date.fromisoformat(session_date(now))
    return dt.datetime.combine(day, dt.time.min, tzinfo=NY).astimezone(UTC)


@contextmanager
def connect_read_only(db_path: str | Path) -> Iterator[sqlite3.Connection]:
    """Open read-only and explicitly close the OS handle on every platform."""
    path = Path(db_path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(str(path))
    uri_path = quote(path.as_posix(), safe="/:")
    conn = sqlite3.connect(f"file:{uri_path}?mode=ro", uri=True, timeout=5)
    try:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA query_only=ON")
        yield conn
    finally:
        conn.close()


def _table_names(conn: sqlite3.Connection) -> set[str]:
    return {str(row[0]) for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}


def _require_core_schema(tables: set[str]) -> None:
    missing = sorted(REQUIRED_P10_TABLES - tables)
    if missing:
        raise MorningReceiptError("missing required P10 supervisor table(s): " + ", ".join(missing))


def _rows(conn: sqlite3.Connection, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    return [dict(row) for row in conn.execute(sql, params).fetchall()]


def _optional_rows(
    conn: sqlite3.Connection,
    tables: set[str],
    table: str,
    sql: str,
    params: tuple[Any, ...],
    degraded: list[str],
) -> list[dict[str, Any]]:
    if table not in tables:
        degraded.append(f"MISSING_OPTIONAL_TABLE:{table}")
        return []
    try:
        return _rows(conn, sql, params)
    except sqlite3.OperationalError as exc:
        degraded.append(f"OPTIONAL_TABLE_UNREADABLE:{table}:{exc}")
        return []


def _kill_switch(state_dir: str | Path | None) -> dict[str, Any]:
    if state_dir is None:
        return {"engaged": False, "reason": None}
    path = Path(state_dir) / "NIGHT-HALT"
    if not path.exists():
        return {"engaged": False, "reason": None}
    try:
        reason = path.read_text(encoding="utf-8").strip() or "HALTED"
    except OSError:
        reason = "HALTED"
    return {"engaged": True, "reason": reason}


def collect(
    db_path: str | Path,
    *,
    since: str | dt.datetime | None = None,
    now: Optional[dt.datetime] = None,
    state_dir: str | Path | None = ".a01-ingress-state",
) -> dict[str, Any]:
    now = now or dt.datetime.now(tz=UTC)
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("timezone-aware datetime required")
    if since is None:
        since_dt = session_start(now)
    elif isinstance(since, str):
        since_dt = _parse_iso(since)
    elif isinstance(since, dt.datetime):
        if since.tzinfo is None or since.utcoffset() is None:
            raise ValueError("timezone-aware since required")
        since_dt = since.astimezone(UTC)
    else:
        raise TypeError("since must be ISO string, datetime, or None")
    since_iso = _iso(since_dt)
    degraded: list[str] = []

    with connect_read_only(db_path) as conn:
        tables = _table_names(conn)
        _require_core_schema(tables)
        claims = _rows(conn, "SELECT * FROM claims WHERE claimed_at>=? ORDER BY claimed_at,lease_id", (since_iso,))
        failed_or_stale = _rows(
            conn,
            "SELECT * FROM claims WHERE status IN ('BLOCKED','STALE') AND COALESCE(released_at,claimed_at)>=? ORDER BY COALESCE(released_at,claimed_at),lease_id",
            (since_iso,),
        )
        open_claims = _rows(conn, "SELECT * FROM claims WHERE released_at IS NULL ORDER BY claimed_at,lease_id")
        blocked_delegations = _rows(
            conn,
            "SELECT delegation_id,lane,objective_id,obligation_id,state,updated_at FROM delegations WHERE state IN ('BLOCKED','STALE') ORDER BY updated_at,delegation_id",
        )
        open_circuits = _rows(conn, "SELECT * FROM circuits WHERE state<>'CLOSED' ORDER BY updated_at,dependency_key")
        stalled_dispatches = _rows(
            conn,
            "SELECT * FROM dispatch_outbox WHERE state IN ('RETRY_WAIT','CIRCUIT_OPEN','CANCEL_REQUESTED') ORDER BY updated_at,dispatch_id",
        )
        scheduler_queue = _optional_rows(
            conn, tables, "night_scheduler_queue",
            "SELECT delegation_id,state,enqueued_at,updated_at FROM night_scheduler_queue ORDER BY delegation_id",
            (), degraded,
        )
        budget_rows = _optional_rows(
            conn, tables, "night_scheduler_night_budget",
            "SELECT * FROM night_scheduler_night_budget WHERE night_key=?",
            (session_date(now),), degraded,
        )
        execution_results = _optional_rows(
            conn, tables, "night_execution_results",
            "SELECT dispatch_id,lease_id,lane,executor_kind,state,terminal_state,attempt_count,started_at,finished_at,updated_at,error_class,error_message "
            "FROM night_execution_results WHERE COALESCE(finished_at,updated_at,started_at)>=? ORDER BY COALESCE(finished_at,updated_at,started_at),dispatch_id",
            (since_iso,), degraded,
        )
        lanes = _rows(conn, "SELECT lane,state,control_head,updated_at FROM lanes ORDER BY lane")

    completed = [row for row in claims if row.get("status") == "COMPLETED"]
    blocked = [row for row in failed_or_stale if row.get("status") == "BLOCKED"]
    stale = [row for row in failed_or_stale if row.get("status") == "STALE"]
    queue_attention = [row for row in scheduler_queue if row.get("state") in ATTENTION_QUEUE_STATES]
    execution_failures = [row for row in execution_results if row.get("state") in {"FAILED", "AUTHORITY_LOST"}]
    execution_successes = [row for row in execution_results if row.get("state") == "SUCCEEDED"]
    budget = budget_rows[0] if budget_rows else None
    if budget is not None:
        budget = dict(budget)
        budget["remaining_slots"] = max(0, int(budget["max_slots"]) - int(budget["used_slots"]))
    kill_switch = _kill_switch(state_dir)

    decisions: list[str] = []
    if kill_switch["engaged"]:
        decisions.append(f"Ingress kill switch remains engaged: {kill_switch['reason']}")
    if open_claims:
        decisions.append(f"Review {len(open_claims)} claim(s) still holding a lease after the reporting boundary.")
    if failed_or_stale:
        decisions.append(f"Adjudicate {len(failed_or_stale)} blocked/stale claim(s).")
    if execution_failures:
        decisions.append(f"Adjudicate {len(execution_failures)} failed/authority-lost execution result(s).")
    if open_circuits:
        decisions.append(f"Review {len(open_circuits)} open dependency circuit(s) before new work.")
    if stalled_dispatches:
        decisions.append(f"Resolve {len(stalled_dispatches)} stalled dispatch(es).")
    if queue_attention:
        decisions.append(f"Reconcile {len(queue_attention)} scheduler queue item(s) in BINDING/RECONCILE state.")

    nothing_ran = len(claims) == 0 and len(execution_results) == 0 and (budget is None or int(budget.get("used_slots", 0)) == 0)
    return {
        "protocol_version": MORNING_RECEIPT_PROTOCOL,
        "generated_at": _iso(now),
        "session_date": session_date(now),
        "since": since_iso,
        "database": str(Path(db_path)),
        "read_only": True,
        "attention_required": bool(decisions),
        "exit_code": 1 if decisions else 0,
        "nothing_ran": nothing_ran,
        "decisions": decisions,
        "counts": {
            "claims_started": len(claims),
            "completed": len(completed),
            "blocked": len(blocked),
            "stale": len(stale),
            "blocked_delegations": len(blocked_delegations),
            "open_claims": len(open_claims),
            "open_circuits": len(open_circuits),
            "stalled_dispatches": len(stalled_dispatches),
            "scheduler_queue": len(scheduler_queue),
            "scheduler_attention": len(queue_attention),
            "execution_successes": len(execution_successes),
            "execution_failures": len(execution_failures),
        },
        "failed_or_stale": failed_or_stale,
        "blocked_delegations": blocked_delegations,
        "execution_failures": execution_failures,
        "execution_successes": execution_successes,
        "open_claims": open_claims,
        "open_circuits": open_circuits,
        "stalled_dispatches": stalled_dispatches,
        "scheduler_queue": scheduler_queue,
        "budget": budget,
        "lanes": lanes,
        "kill_switch": kill_switch,
        "degraded_sections": sorted(set(degraded)),
    }


def _short(value: Any, limit: int = 90) -> str:
    text = str(value if value is not None else "")
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _bounded(rows: list[dict[str, Any]], limit: int = 8) -> tuple[list[dict[str, Any]], int]:
    return rows[:limit], max(0, len(rows) - limit)


def _append_rows(lines: list[str], rows: list[dict[str, Any]], formatter) -> None:
    shown, extra = _bounded(rows)
    if not shown:
        lines.append("- None.")
        return
    lines.extend(f"- {formatter(row)}" for row in shown)
    if extra:
        lines.append(f"- …and {extra} more.")


def render(report: dict[str, Any]) -> str:
    lines: list[str] = [
        f"# A-01 Morning Receipt — {report['session_date']}", "",
        f"Generated: {report['generated_at']}", f"Window start: {report['since']}",
        f"Status: {'ATTENTION REQUIRED' if report['attention_required'] else 'CLEAN'}", "", "## Decisions",
    ]
    decisions = report.get("decisions") or []
    lines.extend(f"- {item}" for item in decisions[:8]) if decisions else lines.append("- None.")
    lines += ["", "## Failed / stale"]
    failures = list(report.get("execution_failures") or []) + list(report.get("failed_or_stale") or [])
    _append_rows(lines, failures, lambda row: f"{row.get('lane')}: {row.get('state') or row.get('status')} — {_short(row.get('dispatch_id') or row.get('delegation_id'))}")
    lines += ["", "## Still holding a lease"]
    _append_rows(lines, report.get("open_claims") or [], lambda row: f"{row.get('lane')}: {_short(row.get('delegation_id'))} (expires {row.get('expires_at')})")
    lines += ["", "## Open circuits"]
    _append_rows(lines, report.get("open_circuits") or [], lambda row: f"{row.get('dependency_key')}: {row.get('state')} (probe {row.get('next_probe_at')})")
    lines += ["", "## Stalled dispatches"]
    _append_rows(lines, report.get("stalled_dispatches") or [], lambda row: f"{row.get('dispatch_id')}: {row.get('state')} — {_short(row.get('last_error'))}")
    counts = report.get("counts") or {}
    lines += ["", "## Completed"]
    if report.get("nothing_ran"):
        lines.append("Nothing ran. Check ingress/admission state before treating an empty night as healthy execution.")
    else:
        lines.append(
            f"Claims started: {counts.get('claims_started', 0)}; completed: {counts.get('completed', 0)}; "
            f"worker successes: {counts.get('execution_successes', 0)}; worker failures: {counts.get('execution_failures', 0)}; "
            f"blocked: {counts.get('blocked', 0)}; stale: {counts.get('stale', 0)}."
        )
    lines += ["", "## Night budget"]
    budget = report.get("budget")
    if budget:
        lines.append(f"- {budget.get('night_key')}: {budget.get('used_slots')}/{budget.get('max_slots')} durable claim slots used; {budget.get('remaining_slots')} remained.")
    else:
        lines.append("- No durable scheduler budget row for this session.")
    lines += ["", "## Lane state"]
    lanes = report.get("lanes") or []
    lines.append("- " + ", ".join(f"{row.get('lane')}={row.get('state')}" for row in lanes[:12])) if lanes else lines.append("- No lane rows present.")
    degraded = report.get("degraded_sections") or []
    if degraded:
        lines += ["", "Degraded optional sections: " + ", ".join(f"`{item}`" for item in degraded)]
    return "\n".join(lines).rstrip() + "\n"


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only A-01 Second Shift morning receipt")
    parser.add_argument("--db", default=os.environ.get("A01_SUPERVISOR_DB", DEFAULT_DB))
    parser.add_argument("--since", default=None, help="Timezone-aware ISO timestamp; defaults to current P12/P15 session start")
    parser.add_argument("--state-dir", default=os.environ.get("A01_INGRESS_STATE_DIR", ".a01-ingress-state"))
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--out", default=None)
    args = parser.parse_args(argv)
    try:
        report = collect(args.db, since=args.since, state_dir=args.state_dir)
        output = json.dumps(report, indent=2, sort_keys=True) + "\n" if args.json else render(report)
        if args.out:
            out = Path(args.out)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(output, encoding="utf-8")
        else:
            sys.stdout.write(output)
        return int(report["exit_code"])
    except (FileNotFoundError, MorningReceiptError, sqlite3.Error, OSError, ValueError, TypeError) as exc:
        error = {"protocol_version": MORNING_RECEIPT_PROTOCOL, "status": "DATABASE_UNREADABLE", "error": str(exc)}
        if args.json:
            sys.stdout.write(json.dumps(error, indent=2, sort_keys=True) + "\n")
        else:
            print(f"A01_MORNING_RECEIPT_UNREADABLE: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
