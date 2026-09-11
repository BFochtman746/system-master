from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from controller_v2 import (
    ControllerAlreadyRunning,
    ControllerRuntime,
    ProcessOwnershipLock,
)
from controller_v2.reliability import RecoveryReport

ROOT = Path(__file__).resolve().parents[1]


class DummyStore:
    def __init__(self, db_path: Path, events: list[str], *, fail_initialize: bool = False):
        self.db_path = str(db_path)
        self.events = events
        self.fail_initialize = fail_initialize

    def initialize(self) -> None:
        self.events.append("initialize")
        if self.fail_initialize:
            raise RuntimeError("injected initialize failure")


class DummyRecovery:
    def __init__(self, events: list[str]):
        self.events = events

    def recover_after_restart(self) -> RecoveryReport:
        self.events.append("recover")
        return RecoveryReport(0, 0, 0, 0, 0)


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.db = self.root / "controller.db"
        self.lock_path = self.root / "controller.db.controller.lock"

    def tearDown(self):
        self.tmp.cleanup()

    def test_second_process_is_rejected_nonblocking(self):
        owner = ProcessOwnershipLock(self.lock_path)
        owner.acquire()
        try:
            script = (
                "import sys; "
                "from controller_v2.lifecycle import ProcessOwnershipLock,ControllerAlreadyRunning; "
                "lock=ProcessOwnershipLock(sys.argv[1]); "
                "\ntry:\n lock.acquire(); print('ACQUIRED'); lock.release(); raise SystemExit(0)"
                "\nexcept ControllerAlreadyRunning:\n print('CONTROLLER_ALREADY_RUNNING'); raise SystemExit(23)"
            )
            started = time.monotonic()
            result = subprocess.run(
                [sys.executable, "-c", script, str(self.lock_path)],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=10,
            )
            self.assertEqual(result.returncode, 23, result.stdout + result.stderr)
            self.assertIn("CONTROLLER_ALREADY_RUNNING", result.stdout)
            self.assertLess(time.monotonic() - started, 5.0)
        finally:
            owner.release()

    def test_abnormal_process_exit_releases_ownership(self):
        script = (
            "import os,sys; "
            "from controller_v2.lifecycle import ProcessOwnershipLock; "
            "lock=ProcessOwnershipLock(sys.argv[1]); lock.acquire(); "
            "print('ACQUIRED', flush=True); os._exit(0)"
        )
        proc = subprocess.Popen(
            [sys.executable, "-c", script, str(self.lock_path)],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        stdout, stderr = proc.communicate(timeout=10)
        self.assertEqual(proc.returncode, 0, stdout + stderr)
        self.assertIn("ACQUIRED", stdout)

        deadline = time.monotonic() + 5.0
        while True:
            successor = ProcessOwnershipLock(self.lock_path)
            try:
                successor.acquire()
                successor.release()
                break
            except ControllerAlreadyRunning:
                if time.monotonic() >= deadline:
                    self.fail("OS ownership lock was not released after abnormal process exit")
                time.sleep(0.05)

    def test_stale_metadata_is_not_authority(self):
        lock = ProcessOwnershipLock(self.lock_path)
        lock.metadata_path.parent.mkdir(parents=True, exist_ok=True)
        lock.metadata_path.write_text(
            json.dumps({"instance_id": "stale", "pid": 1, "state": "OWNED"}),
            encoding="utf-8",
        )
        lock.acquire()
        try:
            self.assertTrue(lock.owned)
            metadata = json.loads(lock.metadata_path.read_text(encoding="utf-8"))
            self.assertNotEqual(metadata["instance_id"], "stale")
            self.assertEqual(metadata["state"], "OWNED")
        finally:
            lock.release()

    def test_unheld_lock_file_is_not_authority(self):
        self.lock_path.write_bytes(b"\0")
        lock = ProcessOwnershipLock(self.lock_path)
        lock.acquire()
        try:
            self.assertTrue(lock.owned)
        finally:
            lock.release()

    def test_ownership_descriptor_is_non_inheritable(self):
        lock = ProcessOwnershipLock(self.lock_path)
        lock.acquire()
        try:
            self.assertFalse(os.get_inheritable(lock.fileno()))
        finally:
            lock.release()

    def test_equivalent_database_paths_share_one_ownership_path(self):
        events: list[str] = []
        alternate = self.root / "subdir" / ".." / "controller.db"
        first = ControllerRuntime(DummyStore(self.db, events), recovery_manager=DummyRecovery(events))
        second = ControllerRuntime(DummyStore(alternate, []), recovery_manager=DummyRecovery([]))
        self.assertEqual(first.db_path, second.db_path)
        self.assertEqual(first.lock_path, second.lock_path)

    def test_runtime_initializes_then_recovers_then_becomes_ready(self):
        events: list[str] = []
        runtime = ControllerRuntime(
            DummyStore(self.db, events),
            recovery_manager=DummyRecovery(events),
        )
        runtime.start()
        try:
            self.assertEqual(events, ["initialize", "recover"])
            self.assertTrue(runtime.ready)
            status = json.loads(runtime.status_path.read_text(encoding="utf-8"))
            self.assertEqual(status["state"], "READY")
            self.assertEqual(status["instance_id"], runtime.instance_id)
            self.assertEqual(status["recovery"]["ambiguous_effects"], 0)
        finally:
            runtime.stop()

    def test_startup_failure_releases_ownership_and_never_becomes_ready(self):
        events: list[str] = []
        runtime = ControllerRuntime(
            DummyStore(self.db, events, fail_initialize=True),
            recovery_manager=DummyRecovery(events),
        )
        with self.assertRaisesRegex(RuntimeError, "injected initialize failure"):
            runtime.start()
        self.assertFalse(runtime.ready)
        self.assertEqual(events, ["initialize"])
        status = json.loads(runtime.status_path.read_text(encoding="utf-8"))
        self.assertEqual(status["state"], "FAILED")

        probe = ProcessOwnershipLock(runtime.lock_path)
        probe.acquire()
        probe.release()

    def test_graceful_stop_releases_ownership_for_successor(self):
        events: list[str] = []
        first = ControllerRuntime(
            DummyStore(self.db, events), recovery_manager=DummyRecovery(events)
        )
        first.start()
        first.stop()
        self.assertFalse(first.ready)
        status = json.loads(first.status_path.read_text(encoding="utf-8"))
        self.assertEqual(status["state"], "STOPPED")

        successor_events: list[str] = []
        second = ControllerRuntime(
            DummyStore(self.db, successor_events),
            recovery_manager=DummyRecovery(successor_events),
        )
        second.start()
        try:
            self.assertTrue(second.ready)
        finally:
            second.stop()

    def test_runtime_rejects_second_owner_same_database(self):
        first_events: list[str] = []
        first = ControllerRuntime(
            DummyStore(self.db, first_events), recovery_manager=DummyRecovery(first_events)
        )
        first.start()
        try:
            second_events: list[str] = []
            second = ControllerRuntime(
                DummyStore(self.db, second_events),
                recovery_manager=DummyRecovery(second_events),
            )
            with self.assertRaises(ControllerAlreadyRunning):
                second.start()
            self.assertFalse(second.ready)
            self.assertEqual(second_events, [])
        finally:
            first.stop()

    def test_rejected_second_owner_cannot_overwrite_live_status(self):
        first = ControllerRuntime(DummyStore(self.db, []), recovery_manager=DummyRecovery([]))
        first.start()
        try:
            before = json.loads(first.status_path.read_text(encoding="utf-8"))
            second = ControllerRuntime(DummyStore(self.db, []), recovery_manager=DummyRecovery([]))
            with self.assertRaises(ControllerAlreadyRunning):
                second.start()
            after = json.loads(first.status_path.read_text(encoding="utf-8"))
            self.assertEqual(after["state"], "READY")
            self.assertEqual(after["instance_id"], before["instance_id"])
            self.assertEqual(after["instance_id"], first.instance_id)
        finally:
            first.stop()

    def test_lifecycle_module_has_no_provider_or_scheduler_runtime_dependency(self):
        lifecycle = (ROOT / "controller_v2" / "lifecycle.py").read_text(encoding="utf-8")
        forbidden = (
            "requests",
            "urllib",
            "api.github.com",
            "workflow_dispatch",
            "SECOND_SHIFT",
            "lane",
            "shift",
            "scheduler",
        )
        for token in forbidden:
            self.assertNotIn(token, lifecycle)


if __name__ == "__main__":
    unittest.main()
