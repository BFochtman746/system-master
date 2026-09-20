from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "control-gateway" / "python"))

import a01_registered_task_worker as registered_worker  # noqa: E402
from a01_execution_worker import RECONCILIATION_REQUIRED, WorkExecutionFailed  # noqa: E402
from tools.second_shift_supervisor_v2 import SupervisorStore  # noqa: E402


class A01RegisteredTaskWorkerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = SupervisorStore(Path(self.tmp.name) / "supervisor.db")
        self.worker = registered_worker.A01RegisteredTaskExecutionWorker(
            self.store,
            root=ROOT,
            evidence_root=Path(self.tmp.name) / "evidence",
        )

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_preserves_existing_executors_and_adds_registered_task(self):
        self.assertIn("A01_CONTROL_PLANE_QUALIFICATION", self.worker.executors)
        self.assertIn("AI_CODING", self.worker.executors)
        self.assertIn("A01_REGISTERED_TASK", self.worker.executors)
        self.assertEqual(self.worker.executor_retry_safety["AI_CODING"], RECONCILIATION_REQUIRED)
        self.assertEqual(self.worker.executor_retry_safety["A01_REGISTERED_TASK"], registered_worker.RETRY_SAFE)

    def test_registered_task_rejects_model_drift_before_execution(self):
        payload = {
            "qualification_id": "Q",
            "workstream_id": "SYSTEM-MASTER",
            "subject_sha": "1" * 40,
            "control_plane_sha": "1" * 40,
            "task_id": "T",
            "task_type": "TEXT_RESPONSE_V1",
            "instruction": "Reply exactly.",
            "model": "unregistered-model",
            "max_output_tokens": 64,
            "temperature": 0,
        }
        with self.assertRaisesRegex(WorkExecutionFailed, "frozen local model"):
            self.worker._execute_registered_task(payload, object())

    def test_proven_wrapper_is_present_and_uses_fixed_local_chat_endpoint(self):
        wrapper = ROOT / ".github" / "scripts" / "a01-agent-registered-task-production-binding-001.js"
        text = wrapper.read_text(encoding="utf-8")
        self.assertIn("/chat/completions", text)
        self.assertIn("gpt-oss-20b-NPU", text)
        self.assertIn("A01_REGISTERED_TASK_OK", text)


if __name__ == "__main__":
    unittest.main()
