from __future__ import annotations

import datetime as dt
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "control-gateway" / "python"))

from a01_night_scheduler import A01NightScheduler  # noqa: E402
from tools.second_shift_supervisor_v2 import Conflict, SupervisorStore  # noqa: E402

FAILURE_PATH = ROOT / "tests" / "test_control_gateway_failure_restart_idempotency.py"
spec = importlib.util.spec_from_file_location("cg011_failure_replay_helpers", FAILURE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("unable to load CG-011 failure helpers")
helpers = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = helpers
spec.loader.exec_module(helpers)

IN_SHIFT = helpers.IN_SHIFT


class CG011DispatchFailureReplayTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "supervisor.db"
        self.store = SupervisorStore(self.db)
        self.scheduler = A01NightScheduler(self.store)
        handoff = helpers.overnight("A", "LANE-A")
        coordination = helpers.helpers.make_coord(
            handoff, resource="R-LANE-A", limit=1, graph="CG011-DISPATCH-FAILURE-REPLAY"
        )
        self.scheduler.enqueue(handoff, coordination, now=IN_SHIFT)
        self.claim = self.scheduler.tick(now=IN_SHIFT)["claims"][0]

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def restart(self):
        self.store.close()
        self.store = SupervisorStore(self.db)
        self.scheduler = A01NightScheduler(self.store)

    def test_failure_delivery_id_is_mandatory(self):
        with self.assertRaisesRegex(ValueError, "failure_id is required"):
            self.store.dispatch_failed(
                self.claim["dispatch_id"],
                "transport timeout",
                retry_budget=3,
                now=IN_SHIFT + dt.timedelta(seconds=1),
            )
        row = self.store.conn.execute(
            "SELECT state,attempt FROM dispatch_outbox WHERE dispatch_id=?",
            (self.claim["dispatch_id"],),
        ).fetchone()
        self.assertEqual((row["state"], row["attempt"]), ("PENDING", 0))

    def test_exact_failure_replay_after_restart_does_not_consume_retry_budget_twice(self):
        first = self.store.dispatch_failed(
            self.claim["dispatch_id"],
            "transport timeout",
            retry_budget=3,
            now=IN_SHIFT + dt.timedelta(seconds=1),
            failure_id="FAILURE-DELIVERY-1",
        )
        self.assertEqual((first["state"], first["attempt"]), ("RETRY_WAIT", 1))
        self.restart()
        replay = self.store.dispatch_failed(
            self.claim["dispatch_id"],
            "transport timeout",
            retry_budget=3,
            now=IN_SHIFT + dt.timedelta(minutes=30),
            failure_id="FAILURE-DELIVERY-1",
        )
        self.assertEqual(replay, first)
        row = self.store.conn.execute(
            "SELECT state,attempt FROM dispatch_outbox WHERE dispatch_id=?",
            (self.claim["dispatch_id"],),
        ).fetchone()
        self.assertEqual((row["state"], row["attempt"]), ("RETRY_WAIT", 1))
        count = self.store.conn.execute(
            "SELECT COUNT(*) n FROM events WHERE dispatch_id=? AND event_type='RETRY'",
            (self.claim["dispatch_id"],),
        ).fetchone()["n"]
        self.assertEqual(count, 1)

    def test_failure_id_collision_fails_closed_and_unique_failures_advance_once(self):
        first = self.store.dispatch_failed(
            self.claim["dispatch_id"],
            "transport timeout",
            retry_budget=3,
            now=IN_SHIFT + dt.timedelta(seconds=1),
            failure_id="FAILURE-DELIVERY-1",
        )
        self.assertEqual(first["attempt"], 1)
        with self.assertRaisesRegex(Conflict, "failure id collision"):
            self.store.dispatch_failed(
                self.claim["dispatch_id"],
                "different failure",
                retry_budget=3,
                now=IN_SHIFT + dt.timedelta(seconds=2),
                failure_id="FAILURE-DELIVERY-1",
            )

        second = self.store.dispatch_failed(
            self.claim["dispatch_id"],
            "transport timeout",
            retry_budget=3,
            now=IN_SHIFT + dt.timedelta(seconds=20),
            failure_id="FAILURE-DELIVERY-2",
        )
        self.assertEqual((second["state"], second["attempt"]), ("RETRY_WAIT", 2))
        self.restart()
        second_replay = self.store.dispatch_failed(
            self.claim["dispatch_id"],
            "transport timeout",
            retry_budget=3,
            now=IN_SHIFT + dt.timedelta(minutes=40),
            failure_id="FAILURE-DELIVERY-2",
        )
        self.assertEqual(second_replay, second)

        third = self.store.dispatch_failed(
            self.claim["dispatch_id"],
            "transport timeout",
            retry_budget=3,
            now=IN_SHIFT + dt.timedelta(seconds=40),
            failure_id="FAILURE-DELIVERY-3",
        )
        self.assertEqual((third["state"], third["attempt"]), ("CIRCUIT_OPEN", 3))
        self.restart()
        third_replay = self.store.dispatch_failed(
            self.claim["dispatch_id"],
            "transport timeout",
            retry_budget=3,
            now=IN_SHIFT + dt.timedelta(hours=1),
            failure_id="FAILURE-DELIVERY-3",
        )
        self.assertEqual(third_replay, third)
        row = self.store.conn.execute(
            "SELECT state,attempt FROM dispatch_outbox WHERE dispatch_id=?",
            (self.claim["dispatch_id"],),
        ).fetchone()
        self.assertEqual((row["state"], row["attempt"]), ("CIRCUIT_OPEN", 3))
        retry_events = self.store.conn.execute(
            "SELECT COUNT(*) n FROM events WHERE dispatch_id=? AND event_type='RETRY'",
            (self.claim["dispatch_id"],),
        ).fetchone()["n"]
        circuit_events = self.store.conn.execute(
            "SELECT COUNT(*) n FROM events WHERE dispatch_id=? AND event_type='CIRCUIT_OPEN'",
            (self.claim["dispatch_id"],),
        ).fetchone()["n"]
        self.assertEqual((retry_events, circuit_events), (2, 1))

    def test_new_failure_after_external_dispatch_ack_fails_closed_without_reopening(self):
        self.store.mark_dispatched(
            self.claim["dispatch_id"],
            "RUN-1",
            now=IN_SHIFT + dt.timedelta(seconds=1),
        )
        with self.assertRaisesRegex(Conflict, "non-retryable"):
            self.store.dispatch_failed(
                self.claim["dispatch_id"],
                "late transport timeout",
                retry_budget=3,
                now=IN_SHIFT + dt.timedelta(seconds=2),
                failure_id="LATE-FAILURE-AFTER-DISPATCH",
            )
        row = self.store.conn.execute(
            "SELECT state,attempt,external_run_id FROM dispatch_outbox WHERE dispatch_id=?",
            (self.claim["dispatch_id"],),
        ).fetchone()
        self.assertEqual((row["state"], row["attempt"], row["external_run_id"]), ("DISPATCHED", 1, "RUN-1"))
        self.assertEqual(self.store.pending_dispatches(IN_SHIFT + dt.timedelta(hours=1)), [])

    def test_new_failure_after_cancelled_dispatch_fails_closed_without_resurrection(self):
        self.scheduler.request_cancel("D-A", "operator cancel", now=IN_SHIFT + dt.timedelta(seconds=1))
        row = self.store.conn.execute(
            "SELECT state FROM dispatch_outbox WHERE dispatch_id=?", (self.claim["dispatch_id"],)
        ).fetchone()
        self.assertEqual(row["state"], "CANCELLED")
        with self.assertRaisesRegex(Conflict, "non-retryable"):
            self.store.dispatch_failed(
                self.claim["dispatch_id"],
                "late transport timeout",
                retry_budget=3,
                now=IN_SHIFT + dt.timedelta(seconds=2),
                failure_id="LATE-FAILURE-AFTER-CANCEL",
            )
        row = self.store.conn.execute(
            "SELECT state,attempt FROM dispatch_outbox WHERE dispatch_id=?", (self.claim["dispatch_id"],)
        ).fetchone()
        self.assertEqual((row["state"], row["attempt"]), ("CANCELLED", 0))
        self.assertEqual(self.store.pending_dispatches(IN_SHIFT + dt.timedelta(hours=1)), [])

    def test_new_failure_after_circuit_open_cannot_spend_beyond_budget(self):
        for index, seconds in enumerate((1, 20, 40), start=1):
            self.store.dispatch_failed(
                self.claim["dispatch_id"],
                "transport timeout",
                retry_budget=3,
                now=IN_SHIFT + dt.timedelta(seconds=seconds),
                failure_id=f"CIRCUIT-FAILURE-{index}",
            )
        with self.assertRaisesRegex(Conflict, "non-retryable"):
            self.store.dispatch_failed(
                self.claim["dispatch_id"],
                "another late failure",
                retry_budget=3,
                now=IN_SHIFT + dt.timedelta(minutes=10),
                failure_id="CIRCUIT-FAILURE-4",
            )
        row = self.store.conn.execute(
            "SELECT state,attempt FROM dispatch_outbox WHERE dispatch_id=?", (self.claim["dispatch_id"],)
        ).fetchone()
        self.assertEqual((row["state"], row["attempt"]), ("CIRCUIT_OPEN", 3))


if __name__ == "__main__":
    unittest.main(verbosity=2)
