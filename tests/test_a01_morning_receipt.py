from __future__ import annotations

import datetime as dt
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "control-gateway" / "python"))

from a01_morning_receipt import collect, connect_read_only, render, session_date, session_start  # noqa: E402
from a01_night_scheduler import A01NightScheduler  # noqa: E402
from tools.second_shift_supervisor_v2 import SupervisorStore  # noqa: E402

UTC = dt.timezone.utc
NOW = dt.datetime(2026, 9, 15, 10, 0, tzinfo=UTC)  # 06:00 America/New_York
HEAD = "a" * 40


class MorningReceiptTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.db = self.root / "supervisor.sqlite"
        self.state_dir = self.root / "ingress-state"
        self.store = SupervisorStore(self.db)

    def tearDown(self) -> None:
        self.store.close()
        self.tmp.cleanup()

    def register(self, lane: str = "CORE", when: dt.datetime = NOW - dt.timedelta(minutes=4)) -> None:
        self.store.register_lane(lane, f"SYSTEM_MASTER/{lane}", f"{lane.lower()}/control-v1", HEAD, now=when)

    def claim(self, suffix: str = "1", lane: str = "CORE", when: dt.datetime = NOW - dt.timedelta(minutes=3)):
        if self.store.conn.execute("SELECT 1 FROM lanes WHERE lane=?", (lane,)).fetchone() is None:
            self.register(lane, when - dt.timedelta(seconds=1))
        delegation_id = f"D-{suffix}"
        objective_id = f"O-{suffix}"
        self.store.bind_ready(lane, delegation_id, objective_id, HEAD, obligation_id=f"OB-{suffix}", now=when)
        return self.store.claim_ready(
            lane=lane,
            delegation_id=delegation_id,
            objective_id=objective_id,
            control_head=HEAD,
            idempotency_key=f"IDEM-{suffix}",
            executor_kind="A01_CONTROL_PLANE_QUALIFICATION",
            dispatch_payload={"qualification_id": "TEST"},
            lease_seconds=300,
            now=when,
            allow_outside_shift=True,
        )

    def report(self):
        return collect(self.db, now=NOW, state_dir=self.state_dir)

    def test_01_session_rollover_before_noon_matches_current_night(self):
        self.assertEqual(session_date(NOW), "2026-09-15")
        self.assertEqual(session_start(NOW), dt.datetime(2026, 9, 15, 4, 0, tzinfo=UTC))

    def test_02_session_rollover_after_noon_targets_next_night(self):
        afternoon = dt.datetime(2026, 9, 15, 18, 0, tzinfo=UTC)  # 14:00 local
        self.assertEqual(session_date(afternoon), "2026-09-16")
        self.assertEqual(session_start(afternoon), dt.datetime(2026, 9, 16, 4, 0, tzinfo=UTC))

    def test_03_missing_database_raises_instead_of_reporting_clean(self):
        missing = self.root / "missing.sqlite"
        with self.assertRaises(FileNotFoundError):
            collect(missing, now=NOW, state_dir=self.state_dir)

    def test_04_connection_refuses_writes(self):
        self.register()
        with connect_read_only(self.db) as conn:
            with self.assertRaises(sqlite3.OperationalError):
                conn.execute(
                    "INSERT INTO lanes(lane,owner_path,control_ref,control_head,state,updated_at) VALUES(?,?,?,?,?,?)",
                    ("BOOK", "SYSTEM_MASTER/BOOK", "book/control-v1", HEAD, "IDLE", "2026-09-15T10:00:00Z"),
                )

    def test_05_truly_empty_night_is_explicit_not_false_success(self):
        report = self.report()
        self.assertTrue(report["nothing_ran"])
        text = render(report)
        self.assertIn("Nothing ran", text)
        self.assertIn("Check ingress/admission state", text)

    def test_06_completed_claim_is_counted_without_attention(self):
        claim = self.claim("complete")
        self.store.terminal(claim.lease_id, claim.fencing_token, "COMPLETED", {"result": "PASS"}, now=NOW - dt.timedelta(minutes=1))
        report = self.report()
        self.assertEqual(report["counts"]["completed"], 1)
        self.assertFalse(report["attention_required"])
        self.assertEqual(report["exit_code"], 0)

    def test_07_blocked_claim_requires_attention(self):
        claim = self.claim("blocked")
        self.store.terminal(claim.lease_id, claim.fencing_token, "BLOCKED", {"reason": "TEST"}, now=NOW - dt.timedelta(minutes=1))
        report = self.report()
        self.assertEqual(report["counts"]["blocked"], 1)
        self.assertTrue(report["attention_required"])
        self.assertEqual(report["exit_code"], 1)

    def test_08_open_claim_requires_attention(self):
        self.claim("open")
        report = self.report()
        self.assertEqual(report["counts"]["open_claims"], 1)
        self.assertIn("still holding a lease", " ".join(report["decisions"]))

    def test_09_open_circuit_requires_attention(self):
        self.register()
        self.store.conn.execute(
            "INSERT INTO circuits(dependency_key,lane,state,failure_count,retry_budget,opened_at,next_probe_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
            ("dep:test", "CORE", "OPEN", 2, 3, "2026-09-15T09:50:00Z", "2026-09-15T10:05:00Z", "2026-09-15T09:50:00Z"),
        )
        report = self.report()
        self.assertEqual(report["counts"]["open_circuits"], 1)
        self.assertTrue(report["attention_required"])

    def test_10_retry_wait_dispatch_is_reported_stalled(self):
        claim = self.claim("retry")
        self.store.conn.execute(
            "UPDATE dispatch_outbox SET state='RETRY_WAIT',last_error='network',next_attempt_at=? WHERE dispatch_id=?",
            ("2026-09-15T10:05:00Z", claim.dispatch_id),
        )
        report = self.report()
        self.assertEqual(report["counts"]["stalled_dispatches"], 1)
        self.assertEqual(report["stalled_dispatches"][0]["last_error"], "network")

    def test_11_scheduler_queue_and_durable_budget_are_observed(self):
        A01NightScheduler(self.store)
        self.store.conn.execute(
            "INSERT INTO night_scheduler_night_budget(night_key,max_slots,used_slots,created_at,updated_at) VALUES(?,?,?,?,?)",
            ("2026-09-15", 8, 3, "2026-09-15T04:00:00Z", "2026-09-15T09:00:00Z"),
        )
        self.store.conn.execute(
            "INSERT INTO night_scheduler_queue(delegation_id,handoff_json,contract_json,scheduler_digest,state,enqueued_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            ("D-Q", "{}", "{}", "digest", "RECONCILE", "2026-09-15T05:00:00Z", "2026-09-15T09:00:00Z"),
        )
        report = self.report()
        self.assertEqual(report["budget"]["used_slots"], 3)
        self.assertEqual(report["counts"]["scheduler_attention"], 1)
        self.assertTrue(report["attention_required"])

    def test_12_decisions_lead_and_receipt_stays_one_scroll_with_20_completions(self):
        self.register()
        base = NOW - dt.timedelta(minutes=40)
        for i in range(20):
            claim = self.claim(str(i), when=base + dt.timedelta(seconds=i * 3))
            self.store.terminal(
                claim.lease_id,
                claim.fencing_token,
                "COMPLETED",
                {"index": i},
                now=base + dt.timedelta(seconds=i * 3 + 1),
            )
        report = self.report()
        text = render(report)
        self.assertEqual(report["counts"]["completed"], 20)
        self.assertLess(text.index("## Decisions"), text.index("## Failed / stale"))
        self.assertLess(text.index("## Decisions"), text.index("## Open circuits"))
        self.assertLess(text.index("## Decisions"), text.index("## Completed"))
        self.assertLessEqual(len(text.splitlines()), 80)

    def test_13_missing_optional_scheduler_tables_degrades_cleanly(self):
        self.register()
        report = self.report()
        self.assertEqual(report["scheduler_queue"], [])
        self.assertIsNone(report["budget"])
        self.assertIn("No durable scheduler budget row", render(report))


if __name__ == "__main__":
    unittest.main(verbosity=2)
