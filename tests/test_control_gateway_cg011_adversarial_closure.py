from __future__ import annotations

import datetime as dt
import importlib.util
import sqlite3
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
spec = importlib.util.spec_from_file_location("cg011_failure", FAILURE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("unable to load CG-011 failure helpers")
helpers = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = helpers
spec.loader.exec_module(helpers)

IN_SHIFT = helpers.IN_SHIFT


class CG011AdversarialClosureAudit(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "supervisor.db"
        self.store = SupervisorStore(self.db)
        self.scheduler = A01NightScheduler(self.store)

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def restart(self):
        self.store.close()
        self.store = SupervisorStore(self.db)
        self.scheduler = A01NightScheduler(self.store)

    def enqueue(self, name, lane, *, resource=None, limit=1, priority=100):
        h = helpers.overnight(name, lane, priority=priority)
        c = helpers.helpers.make_coord(
            h, resource=resource or f"R-{lane}", limit=limit, graph="CG011-AUDIT"
        )
        self.scheduler.enqueue(h, c, now=IN_SHIFT)
        return h, c

    def test_no_alternative_claim_path_can_bypass_a01_scheduler_even_after_restart(self):
        h, c = self.enqueue("A", "LANE-A")
        self.restart()
        with self.assertRaisesRegex(sqlite3.IntegrityError, "CG010_NIGHT_SCHEDULER_AUTH_REQUIRED"):
            self.scheduler.coordination.claim(h, c, now=IN_SHIFT)
        with self.assertRaisesRegex(sqlite3.IntegrityError, "CG010_NIGHT_SCHEDULER_AUTH_REQUIRED"):
            self.store.claim_ready(
                lane=h["lane"], delegation_id=h["delegation_id"], objective_id=h["objective_id"],
                control_head=h["control_head"], idempotency_key=h["idempotency_key"],
                executor_kind=h["executor_kind"], now=IN_SHIFT,
            )
        self.assertEqual(self.store.conn.execute("SELECT COUNT(*) n FROM claims").fetchone()["n"], 0)

    def test_cancel_pending_does_not_release_resource_capacity_before_external_ack(self):
        self.enqueue("A", "LANE-A", resource="GPU", limit=1, priority=200)
        self.enqueue("B", "LANE-B", resource="GPU", limit=1, priority=100)
        first = self.scheduler.tick(now=IN_SHIFT, max_claims=1)["claims"][0]
        self.store.mark_dispatched(first["dispatch_id"], "RUN-A", now=IN_SHIFT + dt.timedelta(seconds=1))
        self.scheduler.request_cancel("D-A", "audit cancel", now=IN_SHIFT + dt.timedelta(seconds=2))
        self.restart()
        blocked = self.scheduler.tick(now=IN_SHIFT + dt.timedelta(seconds=3), max_claims=1)
        self.assertEqual(blocked["claims"], [])
        self.assertTrue(any("concurrency limit" in item["reason"] for item in blocked["blocked"]))
        self.scheduler.coordination.acknowledge_cancel(
            first["dispatch_id"], "RUN-A", now=IN_SHIFT + dt.timedelta(seconds=4)
        )
        self.scheduler.reconcile(now=IN_SHIFT + dt.timedelta(seconds=5))
        after = self.scheduler.tick(now=IN_SHIFT + dt.timedelta(seconds=6), max_claims=1)
        self.assertEqual([x["delegation_id"] for x in after["claims"]], ["D-B"])

    def test_ambiguous_external_dispatch_cannot_bind_two_external_runs(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(now=IN_SHIFT)["claims"][0]
        self.store.mark_dispatched(claim["dispatch_id"], "RUN-A", now=IN_SHIFT + dt.timedelta(seconds=1))
        self.restart()
        self.store.mark_dispatched(claim["dispatch_id"], "RUN-A", now=IN_SHIFT + dt.timedelta(seconds=2))
        with self.assertRaises(Conflict):
            self.store.mark_dispatched(claim["dispatch_id"], "RUN-B", now=IN_SHIFT + dt.timedelta(seconds=3))
        row = self.store.conn.execute(
            "SELECT external_run_id,attempt FROM dispatch_outbox WHERE dispatch_id=?", (claim["dispatch_id"],)
        ).fetchone()
        self.assertEqual(row["external_run_id"], "RUN-A")
        self.assertEqual(row["attempt"], 1)

    def test_exact_terminal_receipt_replay_cannot_double_terminalize(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(now=IN_SHIFT)["claims"][0]
        payload = {"receipt": "TERMINAL-A", "evidence": "sha256:abc"}
        self.store.terminal(claim["lease_id"], claim["fencing_token"], "COMPLETED", payload, IN_SHIFT + dt.timedelta(seconds=1))
        self.restart()
        self.store.terminal(claim["lease_id"], claim["fencing_token"], "COMPLETED", payload, IN_SHIFT + dt.timedelta(seconds=2))
        count = self.store.conn.execute(
            "SELECT COUNT(*) n FROM events WHERE lease_id=? AND event_type='COMPLETED'", (claim["lease_id"],)
        ).fetchone()["n"]
        self.assertEqual(count, 1)
        self.assertEqual(self.store.audit_invariants(), [])

    def test_crash_recovery_never_leaks_temporary_scheduler_claim_authority(self):
        for name in ("A", "B", "C"):
            self.enqueue(name, f"LANE-{name}")
        self.scheduler.tick(now=IN_SHIFT, max_claims=3)
        self.restart()
        leaked = self.store.conn.execute(
            "SELECT COUNT(*) n FROM night_scheduler_claim_authorizations"
        ).fetchone()["n"]
        self.assertEqual(leaked, 0)
        self.assertEqual(self.scheduler.snapshot()["coordination_problems"], [])
        self.assertEqual(self.scheduler.snapshot()["supervisor_problems"], [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
