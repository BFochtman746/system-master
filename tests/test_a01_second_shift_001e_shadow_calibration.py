from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "control-gateway" / "python" / "a01_second_shift_001e_shadow_calibration.py"
spec = importlib.util.spec_from_file_location("shadow001e", MODULE_PATH)
assert spec and spec.loader
shadow001e = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = shadow001e
spec.loader.exec_module(shadow001e)


class ShadowCalibrationContractTest(unittest.TestCase):
    def test_payload_is_bounded_registered_text_task(self) -> None:
        subject = "a" * 40
        payload = shadow001e.build_registered_task_payload(subject, 1)
        self.assertEqual(
            set(payload),
            {
                "qualification_id", "workstream_id", "subject_sha", "control_plane_sha",
                "task_id", "task_type", "instruction", "model", "max_output_tokens", "temperature",
            },
        )
        self.assertEqual(payload["task_type"], "TEXT_RESPONSE_V1")
        self.assertEqual(payload["model"], "gpt-oss-20b-NPU")
        self.assertEqual(payload["temperature"], 0)
        self.assertLessEqual(payload["max_output_tokens"], 1024)
        self.assertEqual(payload["subject_sha"], subject)
        self.assertEqual(payload["control_plane_sha"], subject)

    def test_threshold_is_evidence_derived_and_has_floor(self) -> None:
        self.assertEqual(shadow001e.calibrated_max_task_ms([18000, 20000, 21000]), 60000)
        self.assertEqual(shadow001e.calibrated_max_task_ms([41000, 42000, 43000]), 65000)
        with self.assertRaises(ValueError):
            shadow001e.calibrated_max_task_ms([])

    def test_shadow_contract_requires_three_cycles(self) -> None:
        self.assertEqual(shadow001e.CYCLE_COUNT, 3)
        self.assertEqual(shadow001e.EXPECTED_RESPONSE, "A01_REGISTERED_TASK_OK")


if __name__ == "__main__":
    unittest.main()
