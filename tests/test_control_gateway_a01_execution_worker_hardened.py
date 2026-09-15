from __future__ import annotations

import datetime as dt
import importlib.util
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "control-gateway" / "python"))

from a01_execution_worker_hardened import (  # noqa: E402
    A01ExecutionWorkerHardened,
    HARDENING_CONTRACT,
    RECONCILE_REQUIRED,
    RETRY_SAFE,
)
from a01_night_scheduler import A01NightScheduler  # noqa: E402
from tools.second_shift_supervisor_v2 import Conflict, SupervisorStore  # noqa: E402

BASE_TEST_PATH = ROOT / "tests" / "test_control_gateway_a01_execution_worker.py"
spec = importlib.util.spec_from_file_location("pqf_base_execution_worker_tests", BASE_TEST_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("unable to load execution-worker test helpers")
base_tests = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = base_tests
spec.loader.exec_module(base_tests)

UTC = dt.timezone.utc
IN_SHIFT = dt.datetime(2026, 9, 12, 5, 0, tzinfo=UTC)


class HardenedExecutionWorkerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "supervisor.db"
        self.seed_store = SupervisorStore(self.db)
        self.seed_scheduler = A01NightScheduler(self.seed_store)

    def tearDown(self):
        self.seed_store.close()
        self.tmp.cleanup()

    def enqueue(self, name: str = "A", lane: str = "LANE-A", *, executor_kind: str = "TEST_EXECUTOR"):
        h = base_tests.overnight(name, lane, executor_kind=executor_kind)
        c = base_tests.helpers.make_coord(
            h,
            deps=[],
            resource=f"RESOURCE-{lane}",
            graph="PQF-REPAIR-A01-001-GRAPH",
        )
        self.seed_scheduler.enqueue(h, c, now=IN_SHIFT)
        return h, c

    @staticmethod
    def worker(
        store: SupervisorStore,
        *,
        worker_id: str,
        execute,
        clock,
        retry_policy: str = RETRY_SAFE,
    ) -> A01ExecutionWorkerHardened:
        return A01ExecutionWorkerHardened(
            store,
            scheduler=A01NightScheduler(store),
            executors={"TEST_EXECUTOR": execute},
            executor_retry_policies={"TEST_EXECUTOR": retry_policy},
            worker_instance_id=worker_id,
            lease_seconds=60,
            renew_seconds=10,
            heartbeat_sla_seconds=120,
            clock=clock,
        )

    def test_hardening_contract_is_frozen(self):
        self.assertEqual(HARDENING_CONTRACT, "pqf-repair-a01-001.execution-owner.v1")

    def test_two_workers_same_dispatch_exactly_one_executor_invocation(self):
        self.enqueue()
        entered = threading.Event()
        release = threading.Event()
        calls: list[str] = []
        calls_lock = threading.Lock()
        thread_result: dict[str, object] = {}
        thread_error: list[BaseException] = []

        def execute_a(payload, context):
            with calls_lock:
                calls.append("A")
            entered.set()
            if not release.wait(timeout=10):
                raise RuntimeError("test executor release timeout")
            context.renew(checkpoint_pointer="pqf:worker-a", now=IN_SHIFT)
            return {"worker": "A", "done": True}

        def run_a():
            try:
                with SupervisorStore(self.db) as store:
                    worker = self.worker(
                        store,
                        worker_id="worker-A",
                        execute=execute_a,
                        clock=lambda: IN_SHIFT,
                    )
                    thread_result.update(worker.run_once(now=IN_SHIFT))
            except BaseException as exc:  # pragma: no cover - surfaced below
                thread_error.append(exc)

        thread = threading.Thread(target=run_a, daemon=True)
        thread.start()
        self.assertTrue(entered.wait(timeout=10), "worker A did not enter executor")

        def execute_b(payload, context):
            with calls_lock:
                calls.append("B")
            return {"worker": "B", "done": True}

        with SupervisorStore(self.db) as store_b:
            worker_b = self.worker(
                store_b,
                worker_id="worker-B",
                execute=execute_b,
                clock=lambda: IN_SHIFT,
            )
            loser = worker_b.run_once(now=IN_SHIFT)
            self.assertIsNone(loser["execution"])
            self.assertIn("busy_dispatch_id", loser)

        release.set()
        thread.join(timeout=15)
        self.assertFalse(thread.is_alive(), "worker A did not finish")
        if thread_error:
            raise thread_error[0]
        self.assertEqual(calls, ["A"])
        self.assertEqual(thread_result["execution"]["state"], "SUCCEEDED")
        row = self.seed_store.conn.execute("SELECT state,attempt_count FROM night_execution_results").fetchone()
        self.assertEqual(row["state"], "SUCCEEDED")
        self.assertEqual(row["attempt_count"], 1)

    def test_stale_loser_cannot_downgrade_winner_terminal_result(self):
        self.enqueue()

        def execute(payload, context):
            context.renew(checkpoint_pointer="pqf:winner", now=IN_SHIFT)
            return {"winner": True}

        winner = self.worker(
            self.seed_store,
            worker_id="worker-winner",
            execute=execute,
            clock=lambda: IN_SHIFT,
        )
        result = winner.run_once(now=IN_SHIFT)["execution"]
        self.assertEqual(result["state"], "SUCCEEDED")
        dispatch_id = result["dispatch_id"]
        generation = int(result["execution_generation"])

        with SupervisorStore(self.db) as loser_store:
            loser = self.worker(
                loser_store,
                worker_id="worker-loser",
                execute=lambda payload, context: {"loser": True},
                clock=lambda: IN_SHIFT,
            )
            bundle = loser._dispatch_bundle(dispatch_id)
            changed = loser._record_authority_lost(
                bundle,
                generation,
                "simulated stale loser after winner terminalized",
                IN_SHIFT + dt.timedelta(seconds=1),
            )
            self.assertFalse(changed)

        final = self.seed_store.conn.execute(
            "SELECT state,terminal_state,error_class FROM night_execution_results WHERE dispatch_id=?",
            (dispatch_id,),
        ).fetchone()
        self.assertEqual(final["state"], "SUCCEEDED")
        self.assertEqual(final["terminal_state"], "COMPLETED")
        self.assertIsNone(final["error_class"])

    def test_retry_safe_recovery_rotates_fence_and_execution_generation(self):
        self.enqueue()
        claim = self.seed_scheduler.tick(now=IN_SHIFT, max_claims=1, lease_seconds=30)["claims"][0]

        owner = self.worker(
            self.seed_store,
            worker_id="worker-before-crash",
            execute=lambda payload, context: {"before": True},
            clock=lambda: IN_SHIFT,
            retry_policy=RETRY_SAFE,
        )
        bundle = owner._dispatch_bundle(claim["dispatch_id"])
        row = owner._acquire_execution(bundle, IN_SHIFT)
        generation = int(row["execution_generation"])
        first_attempt = owner._mark_attempt_owned(bundle, generation, IN_SHIFT)
        self.seed_store.mark_dispatched(claim["dispatch_id"], f"local:{claim['dispatch_id']}", now=IN_SHIFT)

        later = IN_SHIFT + dt.timedelta(seconds=31)
        calls: list[str] = []

        def recovered_execute(payload, context):
            calls.append(context.attempt_identity)
            return {"recovered": True}

        with SupervisorStore(self.db) as recovery_store:
            recovery_worker = self.worker(
                recovery_store,
                worker_id="worker-after-crash",
                execute=recovered_execute,
                clock=lambda: later,
                retry_policy=RETRY_SAFE,
            )
            recovery = recovery_worker.recover(now=later)
            self.assertEqual(recovery["stale_leases"], [])
            self.assertEqual(len(recovery["resumed_leases"]), 1)
            resumed = recovery["resumed_leases"][0]
            self.assertGreater(resumed["fencing_token"], claim["fencing_token"])
            self.assertEqual(resumed["previous_execution_generation"], generation)
            self.assertEqual(resumed["execution_generation"], generation + 1)
            rotated = recovery_store.conn.execute(
                "SELECT execution_generation,owner_token,fencing_token FROM night_execution_results WHERE dispatch_id=?",
                (claim["dispatch_id"],),
            ).fetchone()
            self.assertEqual(rotated["execution_generation"], generation + 1)
            self.assertIsNone(rotated["owner_token"])
            completed = recovery_worker.run_once(now=later)["execution"]
            self.assertEqual(completed["state"], "SUCCEEDED")
            self.assertEqual(completed["attempt_count"], 2)
            self.assertNotEqual(completed["attempt_identity"], first_attempt)
        self.assertEqual(len(calls), 1)

    def test_reconcile_required_running_execution_is_not_replayed(self):
        self.enqueue()
        claim = self.seed_scheduler.tick(now=IN_SHIFT, max_claims=1, lease_seconds=30)["claims"][0]
        owner = self.worker(
            self.seed_store,
            worker_id="worker-nonretry",
            execute=lambda payload, context: {"should_not_run": True},
            clock=lambda: IN_SHIFT,
            retry_policy=RECONCILE_REQUIRED,
        )
        bundle = owner._dispatch_bundle(claim["dispatch_id"])
        row = owner._acquire_execution(bundle, IN_SHIFT)
        owner._mark_attempt_owned(bundle, int(row["execution_generation"]), IN_SHIFT)
        self.seed_store.mark_dispatched(claim["dispatch_id"], f"local:{claim['dispatch_id']}", now=IN_SHIFT)

        later = IN_SHIFT + dt.timedelta(seconds=31)
        with SupervisorStore(self.db) as recovery_store:
            recovery_worker = self.worker(
                recovery_store,
                worker_id="worker-reconcile",
                execute=lambda payload, context: {"should_not_run": True},
                clock=lambda: later,
                retry_policy=RECONCILE_REQUIRED,
            )
            recovery = recovery_worker.recover(now=later)
            self.assertEqual(recovery["resumed_leases"], [])
            self.assertIn(claim["lease_id"], recovery["stale_leases"])
            result = recovery_store.conn.execute(
                "SELECT state,terminal_state FROM night_execution_results WHERE dispatch_id=?",
                (claim["dispatch_id"],),
            ).fetchone()
            self.assertEqual(result["state"], "AUTHORITY_LOST")
            self.assertEqual(result["terminal_state"], "STALE")

    def test_recovery_refuses_fencing_identity_corruption(self):
        self.enqueue()
        claim = self.seed_scheduler.tick(now=IN_SHIFT, max_claims=1, lease_seconds=30)["claims"][0]
        self.seed_store.conn.execute(
            "UPDATE dispatch_outbox SET fencing_token=fencing_token+99 WHERE dispatch_id=?",
            (claim["dispatch_id"],),
        )
        later = IN_SHIFT + dt.timedelta(seconds=31)
        worker = self.worker(
            self.seed_store,
            worker_id="worker-corruption-check",
            execute=lambda payload, context: {"never": True},
            clock=lambda: later,
        )
        with self.assertRaises(Conflict):
            worker.recover(now=later)

    @unittest.skipUnless(os.name == "nt", "native process-tree proof runs on A-01 Windows")
    def test_windows_fence_loss_terminates_descendant_process_tree(self):
        worker = self.worker(
            self.seed_store,
            worker_id="worker-process-tree",
            execute=lambda payload, context: {},
            clock=lambda: IN_SHIFT,
        )
        parent_code = (
            "import subprocess,sys,time; "
            "c=subprocess.Popen([sys.executable,'-c','import time; time.sleep(120)']); "
            "print(c.pid,flush=True); time.sleep(120)"
        )
        parent = subprocess.Popen(
            [sys.executable, "-c", parent_code],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
        self.assertIsNotNone(parent.stdout)
        child_pid = int(parent.stdout.readline().strip())
        worker._terminate_process_tree(parent)
        self.assertIsNotNone(parent.poll())
        time.sleep(0.5)
        tasklist = subprocess.run(
            ["tasklist", "/FI", f"PID eq {child_pid}", "/NH"],
            capture_output=True,
            text=True,
            shell=False,
            check=False,
        )
        self.assertNotIn(str(child_pid), tasklist.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
