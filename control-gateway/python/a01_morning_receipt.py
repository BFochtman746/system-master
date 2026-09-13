"""A-01 morning receipt — one page for what the night actually did.

The night produces work; nothing produced a readable account of it. Without one
you reconstruct state every morning from Actions history and four chat windows,
which is the same cost as not having run the night at all.

This reads the supervisor SQLite read-only and answers four questions in order of
how much they cost you: what needs your decision, what is stuck, what ran, and
what the night was allowed to spend. Decisions come first because they are the
only section that blocks the next night.

Read-only by construction: the database is opened with mode=ro and there is no
write path in this module. A reporting tool that can mutate the thing it reports
on is a reporting tool you cannot trust at 6am.

    python -m a01_morning_receipt
    python -m a01_morning_receipt --json
    python -m a01_morning_receipt --out receipt.md --since 2026-09-14

Exit codes: 0 clean night, 1 attention required, 2 database unreadable.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sqlite3
import sys
from typing import Any, Optional

TERMINAL_OK = {"COMPLETED", "SUCCEEDED", "PASSED"}
TERMINAL_BAD = {"FAILED", "EXPIRED", "ABANDONED", "CANCELLED", "TIMED_OUT"}
DECISION_EVENTS = {
    "OWNER_DECISION_REQUIRED", "ESCALATED", "AMBIGUOUS_FAILURE",
    "BUDGET_EXHAUSTED", "REPAIR_BUDGET_EXHAUSTED", "HALTED",
}


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def default_db() -> str:
    explicit = os.environ.get("A01_SUPERVISOR_DB")
    if explicit:
        return explicit
    state = os.environ.get("A01_INGRESS_STATE_DIR") or os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "state"
    )
    return os.path.join(state, "supervisor.sqlite")


def session_start(now: Optional[dt.datetime] = None, rollover_hour: int = 12) -> str:
    """Matches the ingress session rule so the receipt covers exactly one night."""
    moment = now or utcnow()
    anchor = moment if moment.hour >= rollover_hour else moment - dt.timedelta(days=1)
    anchor = anchor.replace(hour=rollover_hour, minute=0, second=0, microsecond=0)
    return anchor.isoformat().replace("+00:00", "Z")


def connect_readonly(db_path: str) -> sqlite3.Connection:
    if not os.path.exists(db_path):
        raise FileNotFoundError(db_path)
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=15)
    conn.row_factory = sqlite3.Row
    return conn


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone()
    return row is not None


def _rows(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    try:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]
    except sqlite3.Error:
        return []


def collect(db_path: str, since: str, halt_path: Optional[str] = None) -> dict[str, Any]:
    conn = connect_readonly(db_path)
    try:
        claims = _rows(conn, "SELECT * FROM claims WHERE claimed_at >= ? ORDER BY claimed_at", (since,))
        events = _rows(
            conn,
            "SELECT * FROM events WHERE occurred_at >= ? ORDER BY seq DESC LIMIT 500",
            (since,),
        )
        circuits = _rows(conn, "SELECT * FROM circuits WHERE state != 'CLOSED'")
        lanes = _rows(conn, "SELECT * FROM lanes ORDER BY lane")
        queued = (
            _rows(conn, "SELECT * FROM night_scheduler_queue WHERE state NOT IN ('DONE','CANCELLED')")
            if _table_exists(conn, "night_scheduler_queue") else []
        )
        stalled = _rows(
            conn,
            "SELECT * FROM dispatch_outbox WHERE state NOT IN ('DELIVERED','DONE') AND attempt > 0 ORDER BY attempt DESC",
        )
    finally:
        conn.close()

    completed = [c for c in claims if (c.get("status") or "") in TERMINAL_OK]
    failed = [c for c in claims if (c.get("status") or "") in TERMINAL_BAD]
    open_claims = [c for c in claims if not c.get("released_at")]
    decisions = [e for e in events if (e.get("event_type") or "") in DECISION_EVENTS]

    halted = bool(halt_path and os.path.exists(halt_path))
    halt_reason = ""
    if halted:
        try:
            with open(halt_path, "r", encoding="utf-8") as handle:
                halt_reason = handle.read().strip()
        except OSError:
            halt_reason = "halt file unreadable"

    attention = bool(decisions or failed or circuits or stalled or halted)

    return {
        "generated_at": utcnow().isoformat().replace("+00:00", "Z"),
        "session_since": since,
        "database": db_path,
        "halted": halted,
        "halt_reason": halt_reason,
        "counts": {
            "claimed": len(claims),
            "completed": len(completed),
            "failed": len(failed),
            "still_open": len(open_claims),
            "queued_remaining": len(queued),
            "open_circuits": len(circuits),
            "stalled_dispatches": len(stalled),
            "decisions_required": len(decisions),
        },
        "decisions": decisions,
        "failed": failed,
        "open_claims": open_claims,
        "completed": completed,
        "circuits": circuits,
        "stalled": stalled,
        "queued": queued,
        "lanes": lanes,
        "attention_required": attention,
    }


def render(r: dict[str, Any]) -> str:
    c = r["counts"]
    L: list[str] = []
    L.append("# A-01 Morning Receipt")
    L.append("")
    L.append(f"Night of {r['session_since'][:10]} · generated {r['generated_at']}")
    L.append("")

    verdict = "ATTENTION REQUIRED" if r["attention_required"] else "CLEAN"
    L.append(f"## {verdict}")
    L.append("")
    L.append(
        f"{c['completed']} completed · {c['failed']} failed · {c['still_open']} still open · "
        f"{c['queued_remaining']} queued · {c['decisions_required']} decisions"
    )
    L.append("")

    if r["halted"]:
        L.append("> **The night was halted.** " + (r["halt_reason"] or "no reason recorded"))
        L.append("> Nothing further was admitted after this point. Release with")
        L.append("> `python -m a01_github_ingress --resume` once the cause is addressed.")
        L.append("")

    if r["decisions"]:
        L.append("## Needs your decision")
        L.append("")
        for e in r["decisions"]:
            L.append(f"- **{e.get('event_type')}** · {e.get('lane', '?')} · `{e.get('objective_id') or e.get('delegation_id') or '?'}`")
            payload = e.get("payload_json")
            if payload:
                L.append(f"  - {str(payload)[:240]}")
        L.append("")

    if r["failed"]:
        L.append("## Failed")
        L.append("")
        for f in r["failed"]:
            L.append(f"- `{f.get('objective_id')}` ({f.get('lane')}) — {f.get('status')}: {f.get('terminal_reason') or 'no reason recorded'}")
        L.append("")

    if r["open_claims"]:
        L.append("## Still holding a lease")
        L.append("")
        L.append("Claimed and never released. Either still running, or the worker died and")
        L.append("recovery has not reclaimed the lane yet.")
        L.append("")
        for o in r["open_claims"]:
            L.append(f"- `{o.get('objective_id')}` ({o.get('lane')}) — last heartbeat {o.get('heartbeat_at')}, expires {o.get('expires_at')}")
        L.append("")

    if r["circuits"]:
        L.append("## Open circuits")
        L.append("")
        for ci in r["circuits"]:
            L.append(f"- `{ci.get('dependency_key')}` ({ci.get('lane')}) — {ci.get('state')}, {ci.get('failure_count')} failures, next probe {ci.get('next_probe_at')}")
        L.append("")

    if r["stalled"]:
        L.append("## Stalled dispatches")
        L.append("")
        for s in r["stalled"]:
            L.append(f"- `{s.get('dispatch_id')}` ({s.get('lane')}) — attempt {s.get('attempt')}, {s.get('last_error') or 'no error recorded'}")
        L.append("")

    if r["completed"]:
        L.append("## Completed")
        L.append("")
        for done in r["completed"]:
            L.append(f"- `{done.get('objective_id')}` ({done.get('lane')})")
        L.append("")

    if r["queued"]:
        L.append(f"## Still queued ({len(r['queued'])})")
        L.append("")
        for q in r["queued"][:10]:
            L.append(f"- `{q.get('delegation_id')}` — {q.get('state')}")
        if len(r["queued"]) > 10:
            L.append(f"- …and {len(r['queued']) - 10} more")
        L.append("")

    if not r["attention_required"] and not r["completed"]:
        L.append("Nothing ran. If work was queued, check that the ingress service is")
        L.append("registered and that its last run exited 0.")
        L.append("")

    return "\n".join(L)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="A-01 morning receipt")
    parser.add_argument("--db", default=None)
    parser.add_argument("--since", default=None, help="ISO timestamp; defaults to the last night session")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--out", default=None)
    args = parser.parse_args(argv)

    db_path = args.db or default_db()
    since = args.since or session_start()
    if len(since) == 10:  # a bare date
        since = f"{since}T00:00:00Z"
    halt_path = os.path.join(os.path.dirname(os.path.abspath(db_path)), "NIGHT-HALT")

    try:
        report = collect(db_path, since, halt_path=halt_path)
    except FileNotFoundError:
        sys.stderr.write(
            f"MORNING_RECEIPT=FAIL code=DB_ABSENT path={db_path}\n"
            "The supervisor database does not exist. Either the night never ran or "
            "A01_SUPERVISOR_DB points elsewhere.\n"
        )
        return 2
    except sqlite3.Error as error:
        sys.stderr.write(f"MORNING_RECEIPT=FAIL code=DB_UNREADABLE detail={error}\n")
        return 2

    text = json.dumps(report, indent=2) if args.json else render(report)
    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(f"{text}\n")
        sys.stderr.write(f"MORNING_RECEIPT=WROTE path={args.out}\n")
    else:
        sys.stdout.write(f"{text}\n")

    return 1 if report["attention_required"] else 0


if __name__ == "__main__":
    sys.exit(main())
