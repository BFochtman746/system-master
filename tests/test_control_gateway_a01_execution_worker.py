from __future__ import annotations

import datetime as dt
import importlib.util
import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "control-gateway" / "python"))

from a01_execution_worker import (  # noqa: E402
    A01ExecutionWorker,
    EXECUTION_WORKER_PROTOCOL,
    RECONCILIATION_REQUIRED,
    RETRY_SAFE,
)
from a01_night_scheduler import A01NightScheduler  # noqa: E402
from tools.second_shift_supervisor_v2 import Conflict, StaleWorker, SupervisorStore, parse_iso  # noqa: E402

HELPERS_PATH = ROOT / "tests" / "test_control_gateway_a01_supervisor_coordination.py"
spec = importlib.util.spec_from_file_location("cg009_worker_helpers", HELPERS_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("unable to load CG-009 helpers")
helpers = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = helpers
spec.loader.exec_module(helpers)

UTC = dt.timezone.utc
IN_SHIFT = dt.datetime(2026, 9, 12, 5, 0, tzinfo=UTC)


def overnight(
    name: str,
    lane: str,
    *,
    order: int = 1,
    priority: int = 100,
    executor_kind: str = "TEST_EXECUTOR",
):
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
            return {
                "task": payload["task"],
                "done": True,
                "idempotency_key": context.idempotency_key,
                "attempt_id": context.attempt_id,
            }

        self.worker = self.make_worker(
            self.store,
            execute,
            worker_id="primary-worker",
            retry_safety=RETRY_SAFE,
        )

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def make_worker(
        self,
        store: SupervisorStore,
        executor,
        *,
        worker_id: str,
        retry_safety: str,
    ) -> A01ExecutionWorker:
        return A01ExecutionWorker(
            store,
            scheduler=A01NightScheduler(store),
            executors={"TEST_EXECUTOR": executor},
            executor_retry_safety={"TEST_EXECUTOR": retry_safety},
            lease_seconds=60,
            renew_seconds=10,
            heartbeat_sla_seconds=120,
            clock=lambda: self.clock[0],
            worker_id=worker_id,
        )

    def enqueue(
        self,
        name: str,
        lane: str,
        *,
        order: int = 1,
        priority: int = 100,
        executor_kind: str = "TEST_EXECUTOR",
        deps=None,
    ):
        h = overnight(name, lane, order=order, priority=priority, executor_kind=executor_kind)
        c = helpers.make_coord(
            h,
            deps=deps or [],
            resource=f"RESOURCE-{lane}",
            graph="EXECUTION-WORKER-GRAPH",
        )
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
        self.assertEqual(execution["attempt_count"], 1)
        self.assertEqual(execution["execution_generation"], 1)
        self.assertEqual(self.calls, ["A"])
        attempts = self.store.conn.execute(
            "SELECT COUNT(*) n FROM night_execution_attempts WHERE dispatch_id=?",
            (execution["dispatch_id"],),
        ).fetchone()["n"]
        self.assertEqual(attempts, 1)
        claim = self.store.conn.execute("SELECT * FROM claims").fetchone()
        self.assertIsNotNone(claim["released_at"])
        self.assertEqual(claim["status"], "COMPLETED")
        delegation = self.store.conn.execute(
            "SELECT state FROM delegations WHERE delegation_id='D-A'"
        ).fetchone()
        self.assertEqual(delegation["state"], "COMPLETED")
        queue = self.store.conn.execute(
            "SELECT state FROM night_scheduler_queue WHERE delegation_id='D-A'"
        ).fetchone()
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
        claim = self.scheduler.tick(
            now=self.clock[0], max_claims=1, lease_seconds=30
        )["claims"][0]
        before = self.store.conn.execute(
            "SELECT expires_at FROM claims WHERE lease_id=?", (claim["lease_id"],)
        ).fetchone()["expires_at"]
        later = self.clock[0] + dt.timedelta(seconds=10)
        extended = self.worker.renew_lease(
            claim["lease_id"],
            claim["fencing_token"],
            lease_seconds=60,
            now=later,
        )
        self.assertGreater(parse_iso(extended), parse_iso(before))
        row = self.store.conn.execute(
            "SELECT expires_at,status FROM claims WHERE lease_id=?", (claim["lease_id"],)
        ).fetchone()
        self.assertEqual(row["expires_at"], extended)
        self.assertEqual(row["status"], "RUNNING")

    def test_stale_fence_cannot_renew_or_publish(self):
        h, _ = self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(
            now=self.clock[0], max_claims=1, lease_seconds=60
        )["claims"][0]
        self.store.invalidate_head(
            h["lane"], "e" * 40, now=self.clock[0] + dt.timedelta(seconds=1)
        )
        with self.assertRaises(StaleWorker):
            self.worker.renew_lease(
                claim["lease_id"],
                claim["fencing_token"],
                now=self.clock[0] + dt.timedelta(seconds=2),
            )

    def test_executor_failure_is_durable_and_blocks_dependents(self):
        def fail(payload, context):
            self.calls.append(payload["task"])
            raise RuntimeError("intentional failure")

        self.worker.executors["TEST_EXECUTOR"] = fail
        self.enqueue("A", "LANE-A", order=0)
        self.enqueue("B", "LANE-B", order=1, deps=["D-A"])
        result = self.worker.run_once(now=self.clock[0])["execution"]
        self.assertEqual(result["state"], "FAILED")
        self.assertEqual(result["terminal_state"], "BLOCKED")
        self.assertEqual(self.calls, ["A"])
        self.clock[0] += dt.timedelta(seconds=1)
        next_result = self.worker.run_once(now=self.clock[0])
        self.assertIsNone(next_result["execution"])
        self.assertEqual(self.calls, ["A"])

    def test_pending_claim_recovery_preserves_identity_rotates_fence_and_executes(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(
            now=self.clock[0], max_claims=1, lease_seconds=30
        )["claims"][0]
        self.clock[0] += dt.timedelta(seconds=31)
        result = self.worker.run_once(now=self.clock[0])
        self.assertEqual(result["recovery"]["stale_leases"], [])
        self.assertEqual(len(result["recovery"]["resumed_leases"]), 1)
        resumed = result["recovery"]["resumed_leases"][0]
        self.assertEqual(resumed["lease_id"], claim["lease_id"])
        self.assertEqual(resumed["dispatch_id"], claim["dispatch_id"])
        self.assertGreater(resumed["fencing_token"], claim["fencing_token"])
        self.assertEqual(result["execution"]["state"], "SUCCEEDED")
        self.assertEqual(self.calls, ["A"])
        claims = self.store.conn.execute("SELECT COUNT(*) n FROM claims").fetchone()["n"]
        self.assertEqual(claims, 1)

    def test_recovered_old_fence_is_rejected(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(
            now=self.clock[0], max_claims=1, lease_seconds=30
        )["claims"][0]
        self.clock[0] += dt.timedelta(seconds=31)
        recovery = self.worker.recover(now=self.clock[0])
        new_fence = recovery["resumed_leases"][0]["fencing_token"]
        self.assertGreater(new_fence, claim["fencing_token"])
        with self.assertRaises(StaleWorker):
            self.store.heartbeat(
                claim["lease_id"],
                claim["fencing_token"],
                "old-worker",
                now=self.clock[0],
            )
        self.worker.renew_lease(claim["lease_id"], new_fence, now=self.clock[0])

    def test_crash_recovery_rotates_execution_generation_and_attempt_identity(self):
        self.enqueue("A", "LANE-A", order=1)
        self.enqueue("B", "LANE-B", order=2)
        claim = self.scheduler.tick(
            now=self.clock[0], max_claims=1, lease_seconds=30
        )["claims"][0]
        bundle = self.worker._dispatch_bundle(claim["dispatch_id"])
        old_context = self.worker._acquire_execution(bundle, self.clock[0])
        self.store.mark_dispatched(
            claim["dispatch_id"], f"local:{claim['dispatch_id']}", now=self.clock[0]
        )
        self.clock[0] += dt.timedelta(seconds=31)

        first = self.worker.run_once(now=self.clock[0])
        self.assertEqual(first["execution"]["dispatch_id"], claim["dispatch_id"])
        self.assertEqual(first["execution"]["state"], "SUCCEEDED")
        self.assertEqual(first["execution"]["attempt_count"], 2)
        self.assertEqual(first["execution"]["execution_generation"], 2)
        self.assertNotEqual(first["execution"]["current_attempt_id"], old_context.attempt_id)
        self.assertEqual(self.calls, ["A"])
        attempts = self.store.conn.execute(
            "SELECT attempt_id,state FROM night_execution_attempts WHERE dispatch_id=? ORDER BY execution_generation",
            (claim["dispatch_id"],),
        ).fetchall()
        self.assertEqual(len(attempts), 2)
        self.assertEqual(attempts[0]["attempt_id"], old_context.attempt_id)
        self.assertEqual(attempts[0]["state"], "FENCED")
        self.assertEqual(attempts[1]["state"], "SUCCEEDED")

        self.clock[0] += dt.timedelta(seconds=1)
        second = self.worker.run_once(now=self.clock[0])
        self.assertEqual(second["execution"]["state"], "SUCCEEDED")
        self.assertEqual(self.calls, ["A", "B"])

    def test_result_ready_recovery_commits_without_rerunning_executor(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(
            now=self.clock[0], max_claims=1, lease_seconds=30
        )["claims"][0]
        bundle = self.worker._dispatch_bundle(claim["dispatch_id"])
        context = self.worker._acquire_execution(bundle, self.clock[0])
        self.worker._stage_owned_result(
            bundle,
            context,
            terminal_state="COMPLETED",
            result={"task": "A", "done": True},
            error=None,
            now=self.clock[0],
        )
        self.clock[0] += dt.timedelta(seconds=31)
        result = self.worker.run_once(now=self.clock[0])
        self.assertEqual(result["execution"]["state"], "SUCCEEDED")
        self.assertEqual(self.calls, [])
        self.assertEqual(result["recovery"]["stale_leases"], [])
        self.assertEqual(len(result["recovery"]["resumed_leases"]), 1)
        self.assertEqual(
            result["execution"]["current_attempt_id"],
            context.attempt_id,
        )

    def test_unsupported_executor_recovery_remains_fail_closed(self):
        self.enqueue("A", "LANE-A", executor_kind="UNKNOWN_EXECUTOR")
        claim = self.scheduler.tick(
            now=self.clock[0], max_claims=1, lease_seconds=30
        )["claims"][0]
        self.clock[0] += dt.timedelta(seconds=31)
        result = self.worker.run_once(now=self.clock[0])
        self.assertIn(claim["lease_id"], result["recovery"]["stale_leases"])
        self.assertEqual(result["recovery"]["resumed_leases"], [])
        self.assertIsNone(result["execution"])
        self.assertEqual(self.calls, [])

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
        claim = self.scheduler.tick(
            now=self.clock[0], max_claims=1, lease_seconds=60
        )["claims"][0]
        bundle = self.worker._dispatch_bundle(claim["dispatch_id"])
        context = self.worker._acquire_execution(bundle, self.clock[0])
        self.worker._stage_owned_result(
            bundle,
            context,
            terminal_state="COMPLETED",
            result={"task": "A", "done": True},
            error=None,
            now=self.clock[0],
        )
        replay = self.worker.consume_dispatch(claim["dispatch_id"], now=self.clock[0])
        self.assertEqual(replay["state"], "SUCCEEDED")
        self.assertEqual(self.calls, [])
        claim_row = self.store.conn.execute(
            "SELECT status,released_at FROM claims WHERE lease_id=?",
            (claim["lease_id"],),
        ).fetchone()
        self.assertEqual(claim_row["status"], "COMPLETED")
        self.assertIsNotNone(claim_row["released_at"])

    def test_two_workers_same_live_dispatch_invoke_executor_exactly_once(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(
            now=self.clock[0], max_claims=1, lease_seconds=60
        )["claims"][0]
        entered = threading.Event()
        release = threading.Event()
        thread_result: dict[str, object] = {}
        calls: list[str] = []

        def blocking_executor(payload, context):
            calls.append("winner")
            context.renew(checkpoint_pointer="winner-entered", now=self.clock[0])
            entered.set()
            if not release.wait(timeout=5):
                raise RuntimeError("test release timeout")
            return {"winner": True}

        def run_winner():
            with SupervisorStore(self.db) as store:
                worker = self.make_worker(
                    store,
                    blocking_executor,
                    worker_id="winner-worker",
                    retry_safety=RETRY_SAFE,
                )
                thread_result["result"] = worker.run_once(now=self.clock[0])

        thread = threading.Thread(target=run_winner, daemon=True)
        thread.start()
        self.assertTrue(entered.wait(timeout=5), "winner did not enter executor")

        def loser_executor(payload, context):
            calls.append("loser")
            return {"loser": True}

        with SupervisorStore(self.db) as loser_store:
            loser = self.make_worker(
                loser_store,
                loser_executor,
                worker_id="loser-worker",
                retry_safety=RETRY_SAFE,
            )
            loser_result = loser.run_once(now=self.clock[0])
        self.assertIsNone(loser_result["execution"])
        self.assertIsNotNone(loser_result["busy_dispatch"])
        self.assertEqual(loser_result["busy_dispatch"]["dispatch_id"], claim["dispatch_id"])
        self.assertEqual(calls, ["winner"])

        release.set()
        thread.join(timeout=5)
        self.assertFalse(thread.is_alive(), "winner thread did not finish")
        winner_result = thread_result["result"]
        self.assertEqual(winner_result["execution"]["state"], "SUCCEEDED")
        self.assertEqual(calls, ["winner"])
        final = self.store.conn.execute(
            "SELECT state,attempt_count FROM night_execution_results WHERE dispatch_id=?",
            (claim["dispatch_id"],),
        ).fetchone()
        self.assertEqual(final["state"], "SUCCEEDED")
        self.assertEqual(final["attempt_count"], 1)

    def test_stale_generation_cannot_downgrade_terminal_winner(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(
            now=self.clock[0], max_claims=1, lease_seconds=30
        )["claims"][0]
        bundle = self.worker._dispatch_bundle(claim["dispatch_id"])
        stale_context = self.worker._acquire_execution(bundle, self.clock[0])
        self.store.mark_dispatched(
            claim["dispatch_id"], f"local:{claim['dispatch_id']}", now=self.clock[0]
        )
        self.clock[0] += dt.timedelta(seconds=31)

        with SupervisorStore(self.db) as winner_store:
            def winner_exec(payload, context):
                return {"winner": True}

            winner = self.make_worker(
                winner_store,
                winner_exec,
                worker_id="recovery-winner",
                retry_safety=RETRY_SAFE,
            )
            winner_result = winner.run_once(now=self.clock[0])
        self.assertEqual(winner_result["execution"]["state"], "SUCCEEDED")
        before = dict(
            self.store.conn.execute(
                "SELECT state,terminal_state,finished_at,result_json FROM night_execution_results WHERE dispatch_id=?",
                (claim["dispatch_id"],),
            ).fetchone()
        )
        self.worker._record_authority_lost(
            stale_context,
            "late stale loser",
            self.clock[0] + dt.timedelta(seconds=1),
        )
        after = dict(
            self.store.conn.execute(
                "SELECT state,terminal_state,finished_at,result_json FROM night_execution_results WHERE dispatch_id=?",
                (claim["dispatch_id"],),
            ).fetchone()
        )
        self.assertEqual(after, before)
        self.assertEqual(after["state"], "SUCCEEDED")

    def test_old_execution_context_cannot_renew_after_generation_rotation(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(
            now=self.clock[0], max_claims=1, lease_seconds=30
        )["claims"][0]
        bundle = self.worker._dispatch_bundle(claim["dispatch_id"])
        old_context = self.worker._acquire_execution(bundle, self.clock[0])
        self.store.mark_dispatched(
            claim["dispatch_id"], f"local:{claim['dispatch_id']}", now=self.clock[0]
        )
        self.clock[0] += dt.timedelta(seconds=31)
        recovery = self.worker.recover(now=self.clock[0])
        self.assertEqual(recovery["resumed_leases"][0]["execution_generation"], 2)
        with self.assertRaises(StaleWorker):
            old_context.renew(now=self.clock[0])

    def test_recovery_fails_closed_on_outbox_fence_mismatch(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(
            now=self.clock[0], max_claims=1, lease_seconds=30
        )["claims"][0]
        with self.store.tx() as c:
            c.execute(
                "UPDATE dispatch_outbox SET fencing_token=fencing_token+10 WHERE dispatch_id=?",
                (claim["dispatch_id"],),
            )
        self.clock[0] += dt.timedelta(seconds=31)
        with self.assertRaises(Conflict):
            self.worker.recover(now=self.clock[0])
        unchanged = self.store.conn.execute(
            "SELECT fencing_token,released_at FROM claims WHERE lease_id=?",
            (claim["lease_id"],),
        ).fetchone()
        self.assertEqual(unchanged["fencing_token"], claim["fencing_token"])
        self.assertIsNone(unchanged["released_at"])

    def test_recovery_fails_closed_on_result_digest_mismatch(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(
            now=self.clock[0], max_claims=1, lease_seconds=30
        )["claims"][0]
        bundle = self.worker._dispatch_bundle(claim["dispatch_id"])
        self.worker._acquire_execution(bundle, self.clock[0])
        with self.store.tx() as c:
            c.execute(
                "UPDATE night_execution_results SET input_digest=? WHERE dispatch_id=?",
                ("0" * 64, claim["dispatch_id"]),
            )
        self.clock[0] += dt.timedelta(seconds=31)
        with self.assertRaises(Conflict):
            self.worker.recover(now=self.clock[0])
        result = self.store.conn.execute(
            "SELECT state,execution_generation FROM night_execution_results WHERE dispatch_id=?",
            (claim["dispatch_id"],),
        ).fetchone()
        self.assertEqual(result["state"], "RUNNING")
        self.assertEqual(result["execution_generation"], 1)

    def test_reconciliation_required_running_work_is_not_replayed(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(
            now=self.clock[0], max_claims=1, lease_seconds=30
        )["claims"][0]
        calls: list[str] = []

        def execute(payload, context):
            calls.append(payload["task"])
            return {"done": True}

        with SupervisorStore(self.db) as store:
            worker = self.make_worker(
                store,
                execute,
                worker_id="reconcile-worker",
                retry_safety=RECONCILIATION_REQUIRED,
            )
            bundle = worker._dispatch_bundle(claim["dispatch_id"])
            worker._acquire_execution(bundle, self.clock[0])
            store.mark_dispatched(
                claim["dispatch_id"], f"local:{claim['dispatch_id']}", now=self.clock[0]
            )
            self.clock[0] += dt.timedelta(seconds=31)
            result = worker.run_once(now=self.clock[0])
            self.assertIn(claim["lease_id"], result["recovery"]["stale_leases"])
            self.assertEqual(result["recovery"]["resumed_leases"], [])
            self.assertIsNone(result["execution"])
            row = store.conn.execute(
                "SELECT state,terminal_state FROM night_execution_results WHERE dispatch_id=?",
                (claim["dispatch_id"],),
            ).fetchone()
            self.assertEqual(row["state"], "AUTHORITY_LOST")
            self.assertEqual(row["terminal_state"], "STALE")
        self.assertEqual(calls, [])

    def test_process_tree_termination_kills_descendant(self):
        parent = Path(self.tmp.name) / "parent.py"
        marker = Path(self.tmp.name) / "orphan.txt"
        ready = Path(self.tmp.name) / "ready.txt"
        parent.write_text(
            "import pathlib,subprocess,sys,time\n"
            "child = \"import pathlib,sys,time;time.sleep(1.5);pathlib.Path(sys.argv[1]).write_text('orphan',encoding='utf-8')\"\n"
            "subprocess.Popen([sys.executable, '-c', child, sys.argv[1]])\n"
            "pathlib.Path(sys.argv[2]).write_text('ready',encoding='utf-8')\n"
            "time.sleep(30)\n",
            encoding="utf-8",
        )
        proc = self.worker._spawn_managed_process(
            [sys.executable, str(parent), str(marker), str(ready)],
            cwd=Path(self.tmp.name),
        )
        deadline = time.time() + 5
        while time.time() < deadline and not ready.exists():
            time.sleep(0.05)
        self.assertTrue(ready.exists(), "parent did not spawn descendant")
        self.worker._terminate_process_tree(proc)
        time.sleep(2)
        self.assertFalse(marker.exists(), f"descendant survived process-tree termination on {os.name}")

    def test_attempt_evidence_identity_is_unique_per_recovery_generation(self):
        self.enqueue("A", "LANE-A")
        claim = self.scheduler.tick(
            now=self.clock[0], max_claims=1, lease_seconds=30
        )["claims"][0]
        bundle = self.worker._dispatch_bundle(claim["dispatch_id"])
        first = self.worker._acquire_execution(bundle, self.clock[0])
        first_dir = str(first.evidence_dir)
        self.store.mark_dispatched(
            claim["dispatch_id"], f"local:{claim['dispatch_id']}", now=self.clock[0]
        )
        self.clock[0] += dt.timedelta(seconds=31)
        self.worker.recover(now=self.clock[0])
        refreshed = self.worker._dispatch_bundle(claim["dispatch_id"])
        second = self.worker._acquire_execution(refreshed, self.clock[0])
        self.assertEqual(second.execution_generation, first.execution_generation + 1)
        self.assertNotEqual(second.attempt_id, first.attempt_id)
        self.assertNotEqual(str(second.evidence_dir), first_dir)
        rows = self.store.conn.execute(
            "SELECT execution_generation,evidence_dir FROM night_execution_attempts WHERE dispatch_id=? ORDER BY execution_generation",
            (claim["dispatch_id"],),
        ).fetchall()
        self.assertEqual(len(rows), 2)
        self.assertNotEqual(rows[0]["evidence_dir"], rows[1]["evidence_dir"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
