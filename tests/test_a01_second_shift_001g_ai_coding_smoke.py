from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "control-gateway" / "python" / "a01_second_shift_001g_ai_coding_smoke.py"
spec = importlib.util.spec_from_file_location("smoke001g", MODULE_PATH)
assert spec and spec.loader
smoke001g = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = smoke001g
spec.loader.exec_module(smoke001g)


class A01SecondShift001GAICodingSmokeContractTests(unittest.TestCase):
    def test_payload_is_exactly_bounded_to_proven_local_model_and_fixture(self) -> None:
        subject = "a" * 40
        payload = smoke001g.build_payload(subject)
        self.assertEqual(payload["subject_sha"], subject)
        self.assertEqual(payload["model"], "Qwen3-Coder-30B-A3B-Instruct-GGUF")
        self.assertEqual(payload["base_url"], "http://127.0.0.1:13305/api/v1")
        self.assertEqual(payload["allowed_paths"], [smoke001g.TARGET])
        self.assertEqual(payload["allowed_commands"], [])
        self.assertTrue(payload["evaluator_required"])
        self.assertEqual(payload["max_steps"], 8)
        self.assertEqual(payload["timeout_seconds"], 900)

    def test_fixture_transition_is_small_and_deterministic(self) -> None:
        self.assertEqual(smoke001g.BEFORE, "SECOND_SHIFT_001G_AI_CODING_SMOKE=BEFORE\n")
        self.assertEqual(smoke001g.AFTER, "SECOND_SHIFT_001G_AI_CODING_SMOKE=AFTER\n")
        self.assertNotEqual(smoke001g.BEFORE, smoke001g.AFTER)
        self.assertTrue(smoke001g.TARGET.startswith("tests/fixtures/"))


if __name__ == "__main__":
    unittest.main()
