from __future__ import annotations

import datetime as dt
import importlib.util
import json
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

from a01_execution_worker import (  # noqa: E402
    A01ExecutionWorker,
    ExecutionBusy,
    ExecutionContext,
    RECONCILE_REQUIRED,
)
from a01_night_scheduler import A01NightScheduler  # noqa: E402
from tools.second_shift_supervisor_v2 import SupervisorStore  # noqa: E402

LEGACY_TEST = ROOT / "tests" / "test_control_gateway_a01_execution_worker.py"
spec = importlib.util.spec_from_file_location("execution_worker_legacy_tests", LEGACY_TEST)
if spec is None or spec.loader is None:
    raise RuntimeError("unable to load execution-worker test helpers")
legacy = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = legacy
spec.loader.exec_module(legacy)

UTC = dt.timezone.utc
IN_SHIFT = dt.datetime(2026, 9, 12, 5, 0, tzinfo=UTC)


def enqueue(store: SupervisorStore, name: str = "A", lane: str = "LANE-A", *, executor_kind: str = "TEST_EXECUTOR"):
    scheduler = A01NightScheduler(store)
    handoff = legacy.overnight(name, lane, executor_kind=executor_kind)
    coord = legacy.helpers.make_coord(
        handoff,
        deps=[],
        resource=f"RESOURCE-{lane}",
        graph="EXECUTION-WORKER-SINGLE-OWNER-GRAPH",
    )
    scheduler.enqueue(handoff, coord, now=IN_SHIFT)
    claim = scheduler.tick(now=IN_SHIFT, max_claims=1, lease_seconds=60)["claims"][0]
    return scheduler, claim


class ExecutionWorkerSingleOwnerTests(unittest.TestCase):
    def test_two_workers_same_dispatch_execute_exactly_once_and_terminal_is_immutable(self):
        with tempfile.TemporaryDirectory() as td:
            db = Path(td) / "supervisor.db"
            with SupervisorStore(db) as setup_store:
                _, claim = enqueue(setup_store)
                dispatch_id = claim["dispatch_id"]

            started = threading.Event()
            release = threading.Event()
            invocations: list[str] = []
            contexts: list[ExecutionContext] = []
            result_holder: list[dict] = []
            error_holder: list[BaseException] = []

            def execute(payload, context):
                invocations.append(context.execution_owner)
                contexts.append(context)
                started.set()
                if not release.wait(timeout=10):
                    raise RuntimeError("test executor release timeout")
                return {"done": True, "owner": context.execution_owner}

            def first_worker():
                try:
                    with SupervisorStore(db) as store:
                        worker = A01ExecutionWorker(
                            store,
                            scheduler=A01NightScheduler(store),
                            executors={"TEST_EXECUTOR": execute},
                            worker_instance_id="worker-A",
                            lease_seconds=60,
                            renew_seconds=10,
                            heartbeat_sla_seconds=120,
                            clock=lambda: IN_SHIFT,
                        )
                        result_holder.append(worker.consume_dispatch(dispatch_id, now=IN_SHIFT))
                except BaseException as exc:  # pragma: no cover - diagnostic capture
                    error_holder.append(exc)

            thread = threading.Thread(target=first_worker, daemon=True)
            thread.start()
            self.assertTrue(started.wait(timeout=5), "first worker did not enter executor")

            with SupervisorStore(db) as store:
                second = A01ExecutionWorker(
                    store,
                    scheduler=A01NightScheduler(store),
                    executors={"TEST_EXECUTOR": execute},
                    worker_instance_id="worker-B",
                    lease_seconds=60,
                    renew_seconds=10,
                    heartbeat_sla_seconds=120,
                    clock=lambda: IN_SHIFT,
                )
                with self.assertRaises(ExecutionBusy):
                    second.consume_dispatch(dispatch_id, now=IN_SHIFT)

            release.set()
            thread.join(timeout=10)
            self.assertFalse(thread.is_alive(), "first worker did not finish")
            self.assertEqual(error_holder, [])
            self.assertEqual(len(invocations), 1)
            self.assertEqual(result_holder[0]["state"], "SUCCEEDED")
            self.assertEqual(result_holder[0]["attempt_count"], 1)

            stale_context = contexts[0]
            with SupervisorStore(db) as store:
                checker = A01ExecutionWorker(
                    store,
                    scheduler=A01NightScheduler(store),
                    executors={"TEST_EXECUTOR": execute},
                    worker_instance_id="worker-C",
                    clock=lambda: IN_SHIFT,
                )
                changed = checker._record_authority_loss_if_owned(
                    stale_context,
                    IN_SHIFT + dt.timedelta(seconds=1),
                    "stale loser must not overwrite terminal result",
                )
                self.assertFalse(changed)
                row = store.conn.execute(
                    "SELECT state,terminal_state,execution_owner FROM night_execution_results WHERE dispatch_id=?",
                    (dispatch_id,),
                ).fetchone()
                self.assertEqual(row["state"], "SUCCEEDED")
                self.assertEqual(row["terminal_state"], "COMPLETED")
                self.assertIsNone(row["execution_owner"])

    def test_recovery_rotates_execution_generation_before_replay(self):
        with tempfile.TemporaryDirectory() as td:
            db = Path(td) / "supervisor.db"
            clock = [IN_SHIFT]
            calls: list[int] = []
            with SupervisorStore(db) as store:
                scheduler, claim = enqueue(store)

                def execute(payload, context):
                    calls.append(context.execution_generation)
                    return {"done": True, "generation": context.execution_generation}

                worker = A01ExecutionWorker(
                    store,
                    scheduler=scheduler,
                    executors={"TEST_EXECUTOR": execute},
                    worker_instance_id="recovery-worker",
                    lease_seconds=60,
                    renew_seconds=10,
                    heartbeat_sla_seconds=120,
                    clock=lambda: clock[0],
                )
                bundle = worker._dispatch_bundle(claim["dispatch_id"])
                worker._ensure_execution_record(bundle, clock[0])
                worker._mark_attempt(claim["dispatch_id"], clock[0])
                store.mark_dispatched(claim["dispatch_id"], f"local:{claim['dispatch_id']}", now=clock[0])
                before = worker._result_row(claim["dispatch_id"])
                self.assertEqual(before["execution_generation"], 0)
                self.assertEqual(before["attempt_count"], 1)

                clock[0] += dt.timedelta(seconds=61)
                recovery = worker.recover(now=clock[0])
                self.assertEqual(len(recovery["resumed_leases"]), 1)
                recovered = worker._result_row(claim["dispatch_id"])
                self.assertEqual(recovered["execution_generation"], 1)
                self.assertIsNone(recovered["execution_owner"])

                result = worker.consume_dispatch(claim["dispatch_id"], now=clock[0])
                self.assertEqual(result["state"], "SUCCEEDED")
                self.assertEqual(result["attempt_count"], 2)
                self.assertEqual(calls, [1])

    def test_running_reconcile_required_executor_fails_closed_in_recovery(self):
        with tempfile.TemporaryDirectory() as td:
            db = Path(td) / "supervisor.db"
            clock = [IN_SHIFT]
            with SupervisorStore(db) as store:
                scheduler, claim = enqueue(store)
                worker = A01ExecutionWorker(
                    store,
                    scheduler=scheduler,
                    executors={"TEST_EXECUTOR": lambda payload, context: {"done": True}},
                    executor_recovery_policy={"TEST_EXECUTOR": RECONCILE_REQUIRED},
                    lease_seconds=60,
                    renew_seconds=10,
                    heartbeat_sla_seconds=120,
                    clock=lambda: clock[0],
                )
                bundle = worker._dispatch_bundle(claim["dispatch_id"])
                worker._ensure_execution_record(bundle, clock[0])
                worker._mark_attempt(claim["dispatch_id"], clock[0])
                store.mark_dispatched(claim["dispatch_id"], f"local:{claim['dispatch_id']}", now=clock[0])
                clock[0] += dt.timedelta(seconds=61)
                recovery = worker.recover(now=clock[0])
                self.assertEqual(recovery["resumed_leases"], [])
                self.assertEqual(recovery["recovery_blockers"][0]["reason"], "RECONCILIATION_REQUIRED")
                self.assertIn(claim["lease_id"], recovery["stale_leases"])

    def test_attempt_evidence_identity_includes_attempt_and_generation(self):
        with tempfile.TemporaryDirectory() as td:
            db = Path(td) / "supervisor.db"
            with SupervisorStore(db) as store:
                worker = A01ExecutionWorker(store, evidence_root=Path(td) / "evidence")
                one = ExecutionContext(worker, "dispatch", "lease", 1, "key", "delegation", 2, "owner", 3)
                two = ExecutionContext(worker, "dispatch", "lease", 2, "key", "delegation", 3, "owner", 4)
                self.assertNotEqual(worker._attempt_evidence_dir(one), worker._attempt_evidence_dir(two))
                self.assertIn("attempt-0003-generation-0002", str(worker._attempt_evidence_dir(one)))

    @unittest.skipUnless(os.name == "nt", "native Windows process-tree proof runs on A-01")
    def test_windows_fence_loss_terminates_entire_process_tree(self):
        with tempfile.TemporaryDirectory() as td:
            db = Path(td) / "supervisor.db"
            child_pid_file = Path(td) / "child.pid"
            child_code = "import time; time.sleep(60)"
            parent_code = (
                "import pathlib,subprocess,sys,time; "
                f"p=subprocess.Popen([sys.executable,'-c',{json.dumps(child_code)}]); "
                f"pathlib.Path({json.dumps(str(child_pid_file))}).write_text(str(p.pid)); "
                "time.sleep(60)"
            )
            proc = subprocess.Popen([sys.executable, "-c", parent_code])
            deadline = time.time() + 5
            while time.time() < deadline and not child_pid_file.exists():
                time.sleep(0.05)
            self.assertTrue(child_pid_file.exists(), "child process id was not published")
            child_pid = int(child_pid_file.read_text().strip())
            with SupervisorStore(db) as store:
                worker = A01ExecutionWorker(store)
                worker._terminate_process_tree(proc)
            self.assertIsNotNone(proc.poll())
            listing = subprocess.run(
                ["tasklist", "/FI", f"PID eq {child_pid}", "/FO", "CSV", "/NH"],
                capture_output=True,
                text=True,
                shell=False,
                timeout=10,
            )
            self.assertNotIn(str(child_pid), listing.stdout, "descendant survived fence-loss tree termination")


if __name__ == "__main__":
    unittest.main(verbosity=2)
