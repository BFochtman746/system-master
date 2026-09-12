from __future__ import annotations

import concurrent.futures
import datetime as dt
import importlib.util
import sqlite3
import sys
import tempfile
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "control-gateway" / "python"))

from a01_night_scheduler import A01NightScheduler, NightSchedulerError, NIGHT_SCHEDULER_PROTOCOL  # noqa: E402
from tools.second_shift_supervisor_v2 import SupervisorStore  # noqa: E402

HELPERS_PATH = ROOT / "tests" / "test_control_gateway_a01_supervisor_coordination.py"
spec = importlib.util.spec_from_file_location("cg009_helpers", HELPERS_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("unable to load CG-009 helpers")
helpers = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = helpers
spec.loader.exec_module(helpers)

UTC = dt.timezone.utc
IN_SHIFT = dt.datetime(2026, 9, 12, 5, 0, tzinfo=UTC)
OUT_SHIFT = dt.datetime(2026, 9, 12, 12, 0, tzinfo=UTC)


def overnight(name, lane, *, order=1, priority=100, not_before=None, not_after=None):
    h = helpers.make_handoff(name, lane, execution_class="OVERNIGHT")
    for target in (h["admission_receipt"], h):
        target["execution_order"] = order
        target["priority"] = priority
        target["not_before"] = not_before
        target["not_after"] = not_after
    receipt = h["admission_receipt"]
    receipt_body = dict(receipt)
    receipt_body.pop("admission_digest")
    receipt["admission_digest"] = helpers.digest(receipt_body)
    h["admission_receipt"] = receipt
    body = dict(h)
    body.pop("handoff_digest")
    h["handoff_digest"] = helpers.digest(body)
    return h


class NightSchedulerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "supervisor.db"
        self.store = SupervisorStore(self.db)
        self.scheduler = A01NightScheduler(self.store)

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def enqueue(self, name, lane, *, order=1, priority=100, deps=None, resource=None, limit=1,
                not_before=None, not_after=None):
        h = overnight(
            name, lane, order=order, priority=priority,
            not_before=not_before, not_after=not_after,
        )
        c = helpers.make_coord(
            h,
            deps=deps or [],
            resource=resource or f"RESOURCE-{lane}",
            limit=limit,
            graph="NIGHT-GRAPH",
        )
        self.scheduler.enqueue(h, c, now=IN_SHIFT)
        return h, c

    def terminal_claim(self, claim, seconds=1):
        self.store.terminal(
            claim["lease_id"], claim["fencing_token"], "COMPLETED",
            now=IN_SHIFT + dt.timedelta(seconds=seconds),
        )

    def test_protocol_is_frozen(self):
        self.assertEqual(NIGHT_SCHEDULER_PROTOCOL, "control-gateway.a01-night-scheduler.v1")

    def test_enqueue_accepts_only_overnight_work(self):
        h = helpers.make_handoff("A", "LANE-A", execution_class="IMMEDIATE")
        c = helpers.make_coord(h)
        with self.assertRaisesRegex(NightSchedulerError, "OVERNIGHT"):
            self.scheduler.enqueue(h, c, now=IN_SHIFT)

    def test_exact_duplicate_enqueue_is_idempotent_and_collision_fails(self):
        h, c = self.enqueue("A", "LANE-A")
        first = self.scheduler.enqueue(h, c, now=IN_SHIFT)
        second = self.scheduler.enqueue(h, c, now=IN_SHIFT)
        self.assertEqual(first["scheduler_digest"], second["scheduler_digest"])
        changed = overnight("A", "LANE-A", order=2)
        changed_c = helpers.make_coord(changed, graph="NIGHT-GRAPH")
        with self.assertRaisesRegex(NightSchedulerError, "identity collision"):
            self.scheduler.enqueue(changed, changed_c, now=IN_SHIFT)

    def test_outside_shift_never_claims(self):
        self.enqueue("A", "LANE-A")
        result = self.scheduler.tick(now=OUT_SHIFT)
        self.assertFalse(result["shift_open"])
        self.assertEqual(result["claims"], [])
        self.assertIsNone(self.store.conn.execute("SELECT 1 FROM claims WHERE released_at IS NULL").fetchone())

    def test_execution_order_is_hard_stage_barrier_and_priority_orders_stage(self):
        self.enqueue("C", "LANE-C", order=2, priority=999)
        self.enqueue("A", "LANE-A", order=1, priority=100)
        self.enqueue("B", "LANE-B", order=1, priority=500)
        first = self.scheduler.tick(now=IN_SHIFT, max_claims=3)
        self.assertEqual(first["active_execution_order"], 1)
        self.assertEqual([x["delegation_id"] for x in first["claims"]], ["D-B", "D-A"])
        self.assertNotIn("D-C", [x["delegation_id"] for x in first["claims"]])
        self.terminal_claim(first["claims"][0], 1)
        self.terminal_claim(first["claims"][1], 2)
        second = self.scheduler.tick(now=IN_SHIFT + dt.timedelta(seconds=3), max_claims=3)
        self.assertEqual(second["active_execution_order"], 2)
        self.assertEqual([x["delegation_id"] for x in second["claims"]], ["D-C"])

    def test_future_lower_stage_blocks_later_stage_until_completed(self):
        future = (IN_SHIFT + dt.timedelta(hours=1)).isoformat().replace("+00:00", "Z")
        self.enqueue("A", "LANE-A", order=0, not_before=future)
        self.enqueue("B", "LANE-B", order=1)
        first = self.scheduler.tick(now=IN_SHIFT, max_claims=2)
        self.assertEqual(first["active_execution_order"], 0)
        self.assertEqual(first["claims"], [])
        at_future = IN_SHIFT + dt.timedelta(hours=1)
        second = self.scheduler.tick(now=at_future, max_claims=2)
        self.assertEqual([x["delegation_id"] for x in second["claims"]], ["D-A"])
        self.store.terminal(
            second["claims"][0]["lease_id"], second["claims"][0]["fencing_token"], "COMPLETED",
            now=at_future + dt.timedelta(seconds=1),
        )
        third = self.scheduler.tick(now=at_future + dt.timedelta(seconds=2), max_claims=2)
        self.assertEqual([x["delegation_id"] for x in third["claims"]], ["D-B"])

    def test_dependency_gate_unlocks_only_after_parent_completed_in_prior_stage(self):
        self.enqueue("A", "LANE-A", order=0)
        self.enqueue("B", "LANE-B", order=1, deps=["D-A"])
        first = self.scheduler.tick(now=IN_SHIFT, max_claims=2)
        self.assertEqual([x["delegation_id"] for x in first["claims"]], ["D-A"])
        self.terminal_claim(first["claims"][0], 1)
        second = self.scheduler.tick(now=IN_SHIFT + dt.timedelta(seconds=2), max_claims=2)
        self.assertEqual([x["delegation_id"] for x in second["claims"]], ["D-B"])

    def test_resource_limit_remains_authoritative_across_lanes(self):
        self.enqueue("A", "LANE-A", order=1, resource="GPU", limit=1, priority=200)
        self.enqueue("B", "LANE-B", order=1, resource="GPU", limit=1, priority=100)
        result = self.scheduler.tick(now=IN_SHIFT, max_claims=2)
        self.assertEqual(len(result["claims"]), 1)
        self.assertEqual(result["claims"][0]["delegation_id"], "D-A")
        self.assertTrue(any(x["delegation_id"] == "D-B" for x in result["blocked"]))

    def test_cancelled_lower_stage_unlocks_next_stage(self):
        self.enqueue("A", "LANE-A", order=0)
        self.enqueue("B", "LANE-B", order=1)
        self.scheduler.request_cancel("D-A", "operator cancelled", now=IN_SHIFT)
        result = self.scheduler.tick(now=IN_SHIFT)
        self.assertEqual([x["delegation_id"] for x in result["claims"]], ["D-B"])

    def test_queued_night_task_cannot_bypass_scheduler_through_coordination_claim(self):
        h, c = self.enqueue("A", "LANE-A")
        with self.assertRaisesRegex(sqlite3.IntegrityError, "CG010_NIGHT_SCHEDULER_AUTH_REQUIRED"):
            self.scheduler.coordination.claim(h, c, now=IN_SHIFT)
        self.assertIsNone(self.store.conn.execute("SELECT 1 FROM claims").fetchone())

    def test_queued_night_task_cannot_bypass_scheduler_through_store_claim(self):
        h, _c = self.enqueue("A", "LANE-A")
        with self.assertRaisesRegex(sqlite3.IntegrityError, "CG010_NIGHT_SCHEDULER_AUTH_REQUIRED"):
            self.store.claim_ready(
                lane=h["lane"], delegation_id=h["delegation_id"], objective_id=h["objective_id"],
                control_head=h["control_head"], idempotency_key=h["idempotency_key"],
                executor_kind=h["executor_kind"], now=IN_SHIFT,
            )
        self.assertIsNone(self.store.conn.execute("SELECT 1 FROM claims").fetchone())

    def test_queue_and_exact_scheduling_inputs_survive_restart(self):
        self.enqueue("A", "LANE-A", order=7, priority=321)
        before = self.scheduler.snapshot()["queue"][0]
        self.store.close()
        self.store = SupervisorStore(self.db)
        self.scheduler = A01NightScheduler(self.store)
        after = self.scheduler.snapshot()["queue"][0]
        self.assertEqual(before["scheduler_digest"], after["scheduler_digest"])
        self.assertEqual(after["handoff"]["execution_order"], 7)
        self.assertEqual(after["handoff"]["priority"], 321)
        result = self.scheduler.tick(now=IN_SHIFT)
        self.assertEqual(result["claims"][0]["delegation_id"], "D-A")

    def test_binding_state_survives_and_exact_retry_completes_binding(self):
        h = overnight("A", "LANE-A")
        c = helpers.make_coord(h, resource="RESOURCE-LANE-A", graph="NIGHT-GRAPH")
        now_text = IN_SHIFT.isoformat().replace("+00:00", "Z")
        self.store.conn.execute(
            "INSERT INTO night_scheduler_queue(delegation_id,handoff_json,contract_json,scheduler_digest,state,enqueued_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            (h["delegation_id"], helpers.canonical(h), helpers.canonical(c), self.scheduler._scheduler_digest(h, c), "BINDING", now_text, now_text),
        )
        self.store.close(); self.store = SupervisorStore(self.db); self.scheduler = A01NightScheduler(self.store)
        row = self.scheduler.enqueue(h, c, now=IN_SHIFT)
        self.assertEqual(row["state"], "QUEUED")
        self.assertEqual(self.scheduler.tick(now=IN_SHIFT)["claims"][0]["delegation_id"], "D-A")

    def test_parallel_scheduler_ticks_cannot_double_claim(self):
        self.enqueue("A", "LANE-A")
        self.store.close()
        barrier = threading.Barrier(2)
        def worker(_):
            with SupervisorStore(self.db) as store:
                scheduler = A01NightScheduler(store)
                barrier.wait()
                return scheduler.tick(now=IN_SHIFT, max_claims=1)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
            results = list(ex.map(worker, range(2)))
        claimed = [c for result in results for c in result["claims"]]
        self.assertEqual(len(claimed), 1, results)
        self.store = SupervisorStore(self.db); self.scheduler = A01NightScheduler(self.store)
        live = self.store.conn.execute("SELECT COUNT(*) n FROM claims WHERE released_at IS NULL").fetchone()["n"]
        self.assertEqual(live, 1)

    def test_terminal_work_reconciles_out_of_scheduler_queue(self):
        self.enqueue("A", "LANE-A")
        result = self.scheduler.tick(now=IN_SHIFT)
        self.terminal_claim(result["claims"][0], 1)
        self.scheduler.reconcile(now=IN_SHIFT + dt.timedelta(seconds=2))
        state = self.store.conn.execute("SELECT state FROM night_scheduler_queue WHERE delegation_id='D-A'").fetchone()["state"]
        self.assertEqual(state, "TERMINAL")

    def test_scheduler_snapshot_reports_zero_invariant_problems_and_no_auth_leak(self):
        self.enqueue("A", "LANE-A")
        snap = self.scheduler.snapshot()
        self.assertEqual(snap["authorization_leaks"], 0)
        self.assertEqual(snap["coordination_problems"], [])
        self.assertEqual(snap["supervisor_problems"], [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
