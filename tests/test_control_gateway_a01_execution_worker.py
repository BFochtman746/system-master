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

from a01_execution_worker import A01ExecutionWorker, EXECUTION_WORKER_PROTOCOL  # noqa: E402
from a01_night_scheduler import A01NightScheduler  # noqa: E402
from tools.second_shift_supervisor_v2 import StaleWorker, SupervisorStore, parse_iso  # noqa: E402

HELPERS_PATH = ROOT / "tests" / "test_control_gateway_a01_supervisor_coordination.py"
spec = importlib.util.spec_from_file_location("cg009_worker_helpers", HELPERS_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("unable to load CG-009 helpers")
helpers = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = helpers
spec.loader.exec_module(helpers)

UTC = dt.timezone.utc
IN_SHIFT = dt.datetime(2026, 9, 12, 5, 0, tzinfo=UTC)


def overnight(name: str, lane: str, *, order: int = 1, priority: int = 100, executor_kind: str = "TEST_EXECUTOR"):
    h = helpers.make_handoff(name, lane, execution_class="OVERNIGHT")
    payload = {"task": name, "value": name.lower()}
    receipt = h["admission_receipt"]
    receipt["executor_kind"] = executor_kind
    receipt["execution_order"] = order
    receipt["priority"] = priority
    receipt["payload_digest"] = helpers.digest(payload)
    receipt_body = dict(receipt)
    receipt_body.pop("admission_digest")
    receipt["admission_digest"] = helpers.digest(receipt_body)
    h["executor_kind"] = executor_kind
    h["execution_order"] = order
    h["priority"] = priority
    h["payload"] = payload
    h["payload_digest"] = helpers.digest(payload)
    h["admission_receipt"] = receipt
    body = dict(h)
    body.pop("handoff_digest")
    h["handoff_digest"] = helpers.digest(body)
    return h


class ExecutionWorkerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "supervisor.db"
        self.store = SupervisorStore(self.db)
        self.scheduler = A01NightScheduler(self.store)
        self.clock = [IN_SHIFT]
        self.calls: list[str] = []

        def execute(payload, context):
            self.calls.append(payload["task"])
            context.renew(checkpoint_pointer=f"test:{payload['task']}", now=self.clock[0])
            return {"task": payload["task"], "done": True}

        self.worker = A01ExecutionWorker(
            self.store,
            scheduler=self.scheduler,
            executors={"TEST_EXECUTOR": execute},
            lease_seconds=60,
            renew_seconds=10,
            heartbeat_sla_seconds=120,
            clock=lambda: self.clock[0],
        )

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def enqueue(self, name: str, lane: str, *, order: int = 1, priority: int = 100, executor_kind: str = "TEST_EXECUTOR"):
        h = overnight(name, lane, order=order, priority=priority, executor_kind=executor_kind)
        c = helpers.make_coord(h, resource=f"RESOURCE-{lane}", graph="EXECUTION-WORKER-GRAPH")
        self.scheduler.enqueue(h, c, now=self.clock[0])
        return h, c

    def test_protocol_is_frozen(self):
        self.assertEqual(EXECUTION_WORKER_PROTOCOL, "control-gateway.a01-execution-worker.v1")

    def test_worker_consumes_authorized_claim_records_result_and_releases_lane(self):
        self.enqueue("A", "LANE-A")
        result = self.worker.run_once(now=self.clock[0])
        execution = result["execution"]
        self.assertEqual(execution["state"], "SUCCEEDED")
        self.assertEqual(execution["terminal_state"], "COMPLETED")
        self.assertEqual(self.calls, ["A"])
        claim = self.store.conn.execute("SELECT * FROM claims").fetchone()
        self.assertIsNotNone(claim["released_at"])
        self.assertEqual(claim["status"], "COMPLETED")
        delegation = self.store.conn.execute("SELECT state FROM delegations WHERE delegation_id='D-A'").fetchone()
        self.assertEqual(delegation["state"], "COMPLETED")
        queue = self.store.conn.execute("SELECT state FROM night_scheduler_queue WHERE delegation_id='D-A'").fetchone()
        self.assertEqual(queue["state"], "TERMINAL")

    def test_dispatch_result_is_idempotent_and_does_not_repeat_work(self):
        self.enqueue("A", "LANE-A")
        first = self.worker.run_once(now=self.clock[0])["execution"]
        replay = self.worker.consume_dispatch(first["dispatch_id"], now=self.clock[0])
        self.assertEqual(replay["state"], "SUCCEEDED")
        self.assertEqual(self.calls, ["A"])
        self.assertEqual(replay["attempt_count"], 1)

    def test_renewal_extends_expiry_under_exact_fence(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(now=self.clock[0], max_claims=1, lease_seconds=30)["claims"][0]
        before = self.store.conn.execute("SELECT expires_at FROM claims WHERE lease_id=?", (claim["lease_id"],)).fetchone()["expires_at"]
        later = self.clock[0] + dt.timedelta(seconds=10)
        extended = self.worker.renew_lease(claim["lease_id"], claim["fencing_token"], lease_seconds=60, now=later)
        self.assertGreater(parse_iso(extended), parse_iso(before))
        row = self.store.conn.execute("SELECT expires_at,status FROM claims WHERE lease_id=?", (claim["lease_id"],)).fetchone()
        self.assertEqual(row["expires_at"], extended)
        self.assertEqual(row["status"], "RUNNING")

    def test_stale_fence_cannot_renew_or_publish(self):
        h, _ = self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(now=self.clock[0], max_claims=1, lease_seconds=60)["claims"][0]
        self.store.invalidate_head(h["lane"], "e" * 40, now=self.clock[0] + dt.timedelta(seconds=1))
        with self.assertRaises(StaleWorker):
            self.worker.renew_lease(
                claim["lease_id"], claim["fencing_token"],
                now=self.clock[0] + dt.timedelta(seconds=2),
            )

    def test_executor_failure_is_durable_and_blocks_dependents(self):
        def fail(payload, context):
            self.calls.append(payload["task"])
            raise RuntimeError("intentional failure")

        self.worker.executors["TEST_EXECUTOR"] = fail
        self.enqueue("A", "LANE-A", order=0)
        h2 = overnight("B", "LANE-B", order=1)
        c2 = helpers.make_coord(h2, deps=["D-A"], resource="RESOURCE-LANE-B", graph="EXECUTION-WORKER-GRAPH")
        self.scheduler.enqueue(h2, c2, now=self.clock[0])
        result = self.worker.run_once(now=self.clock[0])["execution"]
        self.assertEqual(result["state"], "FAILED")
        self.assertEqual(result["terminal_state"], "BLOCKED")
        self.assertEqual(self.calls, ["A"])
        self.clock[0] += dt.timedelta(seconds=1)
        next_result = self.worker.run_once(now=self.clock[0])
        self.assertIsNone(next_result["execution"])
        self.assertEqual(self.calls, ["A"])

    def test_recovery_stales_expired_claim_before_any_work_runs(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(now=self.clock[0], max_claims=1, lease_seconds=30)["claims"][0]
        self.clock[0] += dt.timedelta(seconds=31)
        result = self.worker.run_once(now=self.clock[0])
        self.assertIn(claim["lease_id"], result["recovery"]["stale_leases"])
        self.assertIsNone(result["execution"])
        self.assertEqual(self.calls, [])
        row = self.store.conn.execute("SELECT status,released_at FROM claims WHERE lease_id=?", (claim["lease_id"],)).fetchone()
        self.assertEqual(row["status"], "STALE")
        self.assertIsNotNone(row["released_at"])

    def test_normal_loop_resumes_scheduler_selected_next_stage(self):
        self.enqueue("A", "LANE-A", order=1)
        self.enqueue("B", "LANE-B", order=2)
        first = self.worker.run_once(now=self.clock[0])["execution"]
        self.assertEqual(first["state"], "SUCCEEDED")
        self.assertEqual(self.calls, ["A"])
        self.clock[0] += dt.timedelta(seconds=1)
        second = self.worker.run_once(now=self.clock[0])["execution"]
        self.assertEqual(second["state"], "SUCCEEDED")
        self.assertEqual(self.calls, ["A", "B"])

    def test_unknown_executor_fails_closed_and_records_blocked_result(self):
        self.enqueue("A", "LANE-A", executor_kind="UNKNOWN_EXECUTOR")
        result = self.worker.run_once(now=self.clock[0])["execution"]
        self.assertEqual(result["state"], "FAILED")
        self.assertEqual(result["terminal_state"], "BLOCKED")
        self.assertEqual(result["error_class"], "UnsupportedExecutor")
        self.assertEqual(self.calls, [])

    def test_result_ready_restart_commits_terminal_without_rerunning_executor(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(now=self.clock[0], max_claims=1, lease_seconds=60)["claims"][0]
        bundle = self.worker._dispatch_bundle(claim["dispatch_id"])
        self.worker._ensure_execution_record(bundle, self.clock[0])
        self.worker._stage_result(
            bundle,
            terminal_state="COMPLETED",
            result={"task": "A", "done": True},
            error=None,
            now=self.clock[0],
        )
        replay = self.worker.consume_dispatch(claim["dispatch_id"], now=self.clock[0])
        self.assertEqual(replay["state"], "SUCCEEDED")
        self.assertEqual(self.calls, [])
        claim_row = self.store.conn.execute("SELECT status,released_at FROM claims WHERE lease_id=?", (claim["lease_id"],)).fetchone()
        self.assertEqual(claim_row["status"], "COMPLETED")
        self.assertIsNotNone(claim_row["released_at"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
