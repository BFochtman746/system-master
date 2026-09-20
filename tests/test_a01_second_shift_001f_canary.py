from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "control-gateway" / "python" / "a01_second_shift_001f_canary.py"
spec = importlib.util.spec_from_file_location("canary001f", MODULE_PATH)
assert spec and spec.loader
canary001f = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = canary001f
spec.loader.exec_module(canary001f)


class CanaryContractTest(unittest.TestCase):
    def test_payload_is_bounded_registered_text_task(self) -> None:
        subject = "a" * 40
        payload = canary001f.build_registered_task_payload(subject, 1)
        self.assertEqual(
            set(payload),
            {
                "qualification_id", "workstream_id", "subject_sha", "control_plane_sha",
                "task_id", "task_type", "instruction", "model", "max_output_tokens", "temperature",
            },
        )
        self.assertEqual(payload["qualification_id"], "A01-AGENT-REGISTERED-TASK-PRODUCTION-BINDING-001")
        self.assertEqual(payload["task_type"], "TEXT_RESPONSE_V1")
        self.assertEqual(payload["model"], "gpt-oss-20b-NPU")
        self.assertEqual(payload["temperature"], 0)
        self.assertEqual(payload["task_id"], "SECOND-SHIFT-001F-CANARY-TASK-001")
        self.assertEqual(payload["subject_sha"], subject)
        self.assertEqual(payload["control_plane_sha"], subject)

    def test_canary_is_bounded_beyond_shadow_but_before_live_cutover(self) -> None:
        self.assertEqual(canary001f.QUALIFICATION_ID, "SECOND-SHIFT-PRODUCTION-MASTER-COMPLETION-001F-CANARY")
        self.assertEqual(canary001f.CANARY_TASK_COUNT, 3)
        self.assertEqual(canary001f.CALIBRATED_MAX_TASK_MS, 60000)
        self.assertEqual(canary001f.CANARY_DB_NAME, "second-shift-001f-canary.db")
        self.assertEqual(canary001f.EXPECTED_RESPONSE, "A01_REGISTERED_TASK_OK")


if __name__ == "__main__":
    unittest.main()
