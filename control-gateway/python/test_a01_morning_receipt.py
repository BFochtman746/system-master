"""Tests for the A-01 morning receipt.

Builds a real SupervisorStore so the queries run against the actual schema rather
than a hand-written fixture that could drift from it.

    cd control-gateway/python && python -m unittest test_a01_morning_receipt -v
"""

from __future__ import annotations

import datetime as dt
import os
import sqlite3
import tempfile
import unittest

from a01_morning_receipt import collect, connect_readonly, render, session_start
from tools.second_shift_supervisor_v2 import SupervisorStore

SINCE = "2026-09-14T12:00:00Z"
LATER = "2026-09-14T23:00:00Z"


def fresh_db() -> str:
    path = os.path.join(tempfile.mkdtemp(), "supervisor.sqlite")
    SupervisorStore(path).close()
    return path


def seed(path, *, claims=(), events=(), circuits=(), lanes=(("CORE", "SYSTEM_MASTER/CORE"),)):
    conn = sqlite3.connect(path)
    for lane, owner in lanes:
        conn.execute(
            "INSERT OR IGNORE INTO lanes(lane,owner_path,control_ref,control_head,state,updated_at)"
            " VALUES(?,?,?,?,?,?)",
            (lane, owner, "main", "a" * 40, "IDLE", LATER),
        )
    for i, c in enumerate(claims):
        conn.execute(
            "INSERT INTO delegations(delegation_id,lane,objective_id,control_head,state,payload_json,updated_at)"
            " VALUES(?,?,?,?,?,?,?)",
            (f"D-{i}", c["lane"], c["objective_id"], "a" * 40, "QUEUED", "{}", LATER),
        )
        conn.execute(
            "INSERT INTO claims(lease_id,lane,delegation_id,objective_id,control_head,idempotency_key,"
            "fencing_token,claimed_at,expires_at,heartbeat_at,status,released_at,terminal_reason,dispatch_id)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                f"L-{i}", c["lane"], f"D-{i}", c["objective_id"], "a" * 40, f"K-{i}", 1,
                c.get("claimed_at", LATER), LATER, LATER, c["status"],
                c.get("released_at"), c.get("terminal_reason"), f"DX-{i}",
            ),
        )
    for i, e in enumerate(events):
        conn.execute(
            "INSERT INTO events(event_id,occurred_at,lane,event_type,objective_id,payload_json)"
            " VALUES(?,?,?,?,?,?)",
            (f"E-{i}", e.get("occurred_at", LATER), e.get("lane", "CORE"), e["event_type"],
             e.get("objective_id", "OB-1"), e.get("payload_json", "{}")),
        )
    for ci in circuits:
        conn.execute(
            "INSERT INTO circuits(dependency_key,lane,state,failure_count,retry_budget,updated_at)"
            " VALUES(?,?,?,?,?,?)",
            (ci["dependency_key"], ci.get("lane", "CORE"), ci["state"], ci.get("failure_count", 3), 5, LATER),
        )
    conn.commit()
    conn.close()
    return path


class TestSessionWindow(unittest.TestCase):
    def test_evening_belongs_to_that_days_night(self):
        moment = dt.datetime(2026, 9, 14, 22, 30, tzinfo=dt.timezone.utc)
        self.assertTrue(session_start(moment).startswith("2026-09-14"))

    def test_after_midnight_still_belongs_to_the_previous_night(self):
        moment = dt.datetime(2026, 9, 15, 3, 15, tzinfo=dt.timezone.utc)
        self.assertTrue(session_start(moment).startswith("2026-09-14"))


class TestReadOnly(unittest.TestCase):
    def test_connection_refuses_writes(self):
        conn = connect_readonly(fresh_db())
        with self.assertRaises(sqlite3.OperationalError):
            conn.execute("INSERT INTO supervisor_meta(key,value) VALUES('x','y')")
        conn.close()

    def test_missing_database_raises_rather_than_reporting_a_clean_night(self):
        with self.assertRaises(FileNotFoundError):
            collect("/nonexistent/supervisor.sqlite", SINCE)


class TestReceipt(unittest.TestCase):
    def test_clean_night_needs_no_attention(self):
        path = seed(fresh_db(), claims=[
            {"lane": "CORE", "objective_id": "OB-1", "status": "COMPLETED", "released_at": LATER},
        ])
        report = collect(path, SINCE)
        self.assertFalse(report["attention_required"])
        self.assertEqual(report["counts"]["completed"], 1)

    def test_failure_raises_attention(self):
        path = seed(fresh_db(), claims=[
            {"lane": "CORE", "objective_id": "OB-1", "status": "FAILED",
             "released_at": LATER, "terminal_reason": "acceptance target returned FAIL"},
        ])
        report = collect(path, SINCE)
        self.assertTrue(report["attention_required"])
        self.assertIn("acceptance target returned FAIL", render(report))

    def test_unreleased_claim_is_reported_as_still_holding_a_lease(self):
        path = seed(fresh_db(), claims=[
            {"lane": "CORE", "objective_id": "OB-1", "status": "RUNNING", "released_at": None},
        ])
        report = collect(path, SINCE)
        self.assertEqual(report["counts"]["still_open"], 1)
        self.assertIn("Still holding a lease", render(report))

    def test_decision_events_lead_the_receipt(self):
        """Decisions outrank every other section: they are what blocks the next night."""
        path = seed(
            fresh_db(),
            claims=[
                {"lane": "CORE", "objective_id": "OB-OK", "status": "COMPLETED", "released_at": LATER},
                {"lane": "CORE", "objective_id": "OB-BAD", "status": "FAILED",
                 "released_at": LATER, "terminal_reason": "boom"},
            ],
            events=[{"event_type": "OWNER_DECISION_REQUIRED"}],
            circuits=[{"dependency_key": "lemonade", "state": "OPEN"}],
        )
        report = collect(path, SINCE)
        text = render(report)
        self.assertTrue(report["attention_required"])
        for later_section in ("## Failed", "## Open circuits", "## Completed"):
            self.assertLess(
                text.index("## Needs your decision"),
                text.index(later_section),
                f"decisions must precede {later_section}",
            )

    def test_open_circuit_raises_attention(self):
        path = seed(fresh_db(), circuits=[{"dependency_key": "lemonade", "state": "OPEN"}])
        report = collect(path, SINCE)
        self.assertTrue(report["attention_required"])
        self.assertIn("Open circuits", render(report))

    def test_events_before_the_window_are_excluded(self):
        path = seed(fresh_db(), events=[
            {"event_type": "OWNER_DECISION_REQUIRED", "occurred_at": "2026-09-10T01:00:00Z"},
        ])
        self.assertEqual(collect(path, SINCE)["counts"]["decisions_required"], 0)

    def test_empty_night_says_nothing_ran(self):
        report = collect(seed(fresh_db()), SINCE)
        self.assertFalse(report["attention_required"])
        self.assertIn("Nothing ran", render(report))

    def test_halt_file_is_surfaced_at_the_top(self):
        path = seed(fresh_db())
        halt = os.path.join(os.path.dirname(path), "NIGHT-HALT")
        with open(halt, "w", encoding="utf-8") as handle:
            handle.write("2026-09-14T23:10:00Z operator halt during deploy\n")
        report = collect(path, SINCE, halt_path=halt)
        self.assertTrue(report["halted"])
        self.assertTrue(report["attention_required"])
        self.assertIn("operator halt during deploy", render(report))

    def test_receipt_stays_one_page(self):
        claims = [
            {"lane": "CORE", "objective_id": f"OB-{i}", "status": "COMPLETED", "released_at": LATER}
            for i in range(20)
        ]
        lines = render(collect(seed(fresh_db(), claims=claims), SINCE)).splitlines()
        self.assertLess(len(lines), 80, "receipt must stay readable in one screen scroll")


if __name__ == "__main__":
    unittest.main(verbosity=2)
