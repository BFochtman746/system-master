from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "control-gateway" / "python"))

from a01_github_ingress import IngressError, SUPPORTED_EXECUTORS, validate_registered_task_payload

SUBJECT = "a" * 40
QUALIFICATION = "A01-AGENT-REGISTERED-TASK-PRODUCTION-BINDING-001"
WORKSTREAM = "SYSTEM-MASTER"
TASK = "A01-REGISTERED-TASK-E2E-QUAL-001"


def payload() -> dict:
    return {
        "qualification_id": QUALIFICATION,
        "workstream_id": WORKSTREAM,
        "subject_sha": SUBJECT,
        "control_plane_sha": SUBJECT,
        "task_id": TASK,
        "task_type": "TEXT_RESPONSE_V1",
        "instruction": "Reply with exactly: A01_REGISTERED_TASK_OK",
        "model": "gpt-oss-20b-NPU",
        "max_output_tokens": 256,
        "temperature": 0,
    }


class RegisteredTaskIngressTest(unittest.TestCase):
    def validate(self, value: dict) -> None:
        validate_registered_task_payload(
            value,
            qualification_id=QUALIFICATION,
            registered_workstream=WORKSTREAM,
            subject_sha=SUBJECT,
            task_id=TASK,
        )

    def test_executor_is_explicitly_supported(self) -> None:
        self.assertIn("A01_REGISTERED_TASK", SUPPORTED_EXECUTORS)
        self.validate(payload())

    def test_rejects_widened_fields(self) -> None:
        value = payload()
        value["command"] = "whoami"
        with self.assertRaises(IngressError):
            self.validate(value)

    def test_rejects_model_or_temperature_drift(self) -> None:
        value = payload()
        value["model"] = "other-model"
        with self.assertRaises(IngressError):
            self.validate(value)
        value = payload()
        value["temperature"] = 1
        with self.assertRaises(IngressError):
            self.validate(value)

    def test_rejects_subject_and_token_drift(self) -> None:
        value = payload()
        value["control_plane_sha"] = "b" * 40
        with self.assertRaises(IngressError):
            self.validate(value)
        value = payload()
        value["max_output_tokens"] = 1025
        with self.assertRaises(IngressError):
            self.validate(value)


if __name__ == "__main__":
    unittest.main()
