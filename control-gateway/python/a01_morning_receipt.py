from __future__ import annotations

import argparse
import datetime as dt
import json
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
    """Open a supervisor database read-only and always release the OS handle.

    sqlite3.Connection's own context-manager protocol commits/rolls back but does not
    close the connection. P15 must explicitly close it so Windows A-01 never retains a
    handle after a morning report or test completes.
    """
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


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone() is not None


def _rows(conn: sqlite3.Connection, table: str, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    if not _table_exists(conn, table):
        return []
    return [dict(row) for row in conn.execute(sql, params).fetchall()]


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

    with connect_read_only(db_path) as conn:
        claims = _rows(
            conn,
            "claims",
            "SELECT * FROM claims WHERE claimed_at>=? ORDER BY claimed_at,lease_id",
            (since_iso,),
        )
        failed_or_stale = _rows(
            conn,
            "claims",
            "SELECT * FROM claims WHERE status IN ('BLOCKED','STALE') AND COALESCE(released_at,claimed_at)>=? ORDER BY COALESCE(released_at,claimed_at),lease_id",
            (since_iso,),
        )
        open_claims = _rows(
            conn,
            "claims",
            "SELECT * FROM claims WHERE released_at IS NULL ORDER BY claimed_at,lease_id",
        )
        open_circuits = _rows(
            conn,
            "circuits",
            "SELECT * FROM circuits WHERE state<>'CLOSED' ORDER BY updated_at,dependency_key",
        )
        stalled_dispatches = _rows(
            conn,
            "dispatch_outbox",
            "SELECT * FROM dispatch_outbox WHERE state IN ('RETRY_WAIT','CIRCUIT_OPEN','CANCEL_REQUESTED') ORDER BY updated_at,dispatch_id",
        )
        scheduler_queue = _rows(
            conn,
            "night_scheduler_queue",
            "SELECT delegation_id,state,enqueued_at,updated_at FROM night_scheduler_queue ORDER BY delegation_id",
        )
        budget_rows = _rows(
            conn,
            "night_scheduler_night_budget",
            "SELECT * FROM night_scheduler_night_budget WHERE night_key=?",
            (session_date(now),),
        )
        lanes = _rows(conn, "lanes", "SELECT lane,state,control_head,updated_at FROM lanes ORDER BY lane")

    completed = [row for row in claims if row.get("status") == "COMPLETED"]
    blocked = [row for row in failed_or_stale if row.get("status") == "BLOCKED"]
    stale = [row for row in failed_or_stale if row.get("status") == "STALE"]
    queue_attention = [row for row in scheduler_queue if row.get("state") in ATTENTION_QUEUE_STATES]
    budget = budget_rows[0] if budget_rows else None
    kill_switch = _kill_switch(state_dir)

    decisions: list[str] = []
    if kill_switch["engaged"]:
        decisions.append(f"Ingress kill switch remains engaged: {kill_switch['reason']}")
    if open_claims:
        decisions.append(f"Review {len(open_claims)} claim(s) still holding a lease after the reporting boundary.")
    if failed_or_stale:
        decisions.append(f"Adjudicate {len(failed_or_stale)} blocked/stale claim(s).")
    if open_circuits:
        decisions.append(f"Review {len(open_circuits)} open dependency circuit(s) before new work.")
    if stalled_dispatches:
        decisions.append(f"Resolve {len(stalled_dispatches)} stalled dispatch(es).")
    if queue_attention:
        decisions.append(f"Reconcile {len(queue_attention)} scheduler queue item(s) in BINDING/RECONCILE state.")

    report = {
        "protocol_version": MORNING_RECEIPT_PROTOCOL,
        "generated_at": _iso(now),
        "session_date": session_date(now),
        "since": since_iso,
        "attention_required": bool(decisions),
        "exit_code": 1 if decisions else 0,
        "nothing_ran": len(claims) == 0,
        "decisions": decisions,
        "counts": {
            "claims_started": len(claims),
            "completed": len(completed),
            "blocked": len(blocked),
            "stale": len(stale),
            "open_claims": len(open_claims),
            "open_circuits": len(open_circuits),
            "stalled_dispatches": len(stalled_dispatches),
            "scheduler_queue": len(scheduler_queue),
            "scheduler_attention": len(queue_attention),
        },
        "failed_or_stale": failed_or_stale,
        "open_claims": open_claims,
        "open_circuits": open_circuits,
        "stalled_dispatches": stalled_dispatches,
        "scheduler_queue": scheduler_queue,
        "budget": budget,
        "lanes": lanes,
        "kill_switch": kill_switch,
    }
    return report


def _short(value: Any, limit: int = 90) -> str:
    text = str(value if value is not None else "")
    return text if len(text) <= limit else text[: limit - 1] + "…"


def render(report: dict[str, Any]) -> str:
    lines: list[str] = [
        f"# A-01 Morning Receipt — {report['session_date']}",
        "",
        f"Generated: {report['generated_at']}",
        f"Window start: {report['since']}",
        f"Status: {'ATTENTION REQUIRED' if report['attention_required'] else 'CLEAN'}",
        "",
        "## Decisions",
    ]
    decisions = report.get("decisions") or []
    if decisions:
        lines.extend(f"- {item}" for item in decisions[:8])
    else:
        lines.append("- None.")

    lines += ["", "## Failed / stale"]
    failed = report.get("failed_or_stale") or []
    if failed:
        for row in failed[:8]:
            lines.append(f"- {row.get('lane')}: {row.get('status')} — {_short(row.get('delegation_id'))}")
    else:
        lines.append("- None.")

    lines += ["", "## Still holding a lease"]
    open_claims = report.get("open_claims") or []
    if open_claims:
        for row in open_claims[:8]:
            lines.append(f"- {row.get('lane')}: {_short(row.get('delegation_id'))} (expires {row.get('expires_at')})")
    else:
        lines.append("- None.")

    lines += ["", "## Open circuits"]
    circuits = report.get("open_circuits") or []
    if circuits:
        for row in circuits[:8]:
            lines.append(f"- {row.get('dependency_key')}: {row.get('state')} (probe {row.get('next_probe_at')})")
    else:
        lines.append("- None.")

    lines += ["", "## Stalled dispatches"]
    stalled = report.get("stalled_dispatches") or []
    if stalled:
        for row in stalled[:8]:
            lines.append(f"- {row.get('dispatch_id')}: {row.get('state')} — {_short(row.get('last_error'))}")
    else:
        lines.append("- None.")

    counts = report.get("counts") or {}
    lines += ["", "## Completed"]
    if report.get("nothing_ran"):
        lines.append("Nothing ran. Check ingress/admission state before treating an empty night as healthy execution.")
    else:
        lines.append(
            f"Claims started: {counts.get('claims_started', 0)}; completed: {counts.get('completed', 0)}; "
            f"blocked: {counts.get('blocked', 0)}; stale: {counts.get('stale', 0)}."
        )

    lines += ["", "## Night budget"]
    budget = report.get("budget")
    if budget:
        lines.append(
            f"- {budget.get('night_key')}: {budget.get('used_slots')}/{budget.get('max_slots')} durable claim slots used."
        )
    else:
        lines.append("- No durable scheduler budget row for this session.")

    lines += ["", "## Lane state"]
    lanes = report.get("lanes") or []
    if lanes:
        summary = ", ".join(f"{row.get('lane')}={row.get('state')}" for row in lanes[:12])
        lines.append(f"- {summary}")
    else:
        lines.append("- No lane rows present.")

    return "\n".join(lines).rstrip() + "\n"


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only A-01 Second Shift morning receipt")
    parser.add_argument("--db", default="control-gateway/state/supervisor.sqlite")
    parser.add_argument("--since", default=None, help="Timezone-aware ISO timestamp; defaults to current P12/P15 session start")
    parser.add_argument("--state-dir", default=".a01-ingress-state")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--out", default=None)
    args = parser.parse_args(argv)
    try:
        report = collect(args.db, since=args.since, state_dir=args.state_dir)
        output = json.dumps(report, indent=2, sort_keys=True) + "\n" if args.json else render(report)
        if args.out:
            Path(args.out).write_text(output, encoding="utf-8")
        else:
            sys.stdout.write(output)
        return int(report["exit_code"])
    except (FileNotFoundError, sqlite3.Error, OSError, ValueError, TypeError) as exc:
        print(f"A01_MORNING_RECEIPT_UNREADABLE: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
