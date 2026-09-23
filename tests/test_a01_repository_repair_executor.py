from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "control-gateway" / "python"))

import a01_repository_repair_executor as repair  # noqa: E402


class FakeResponse:
    def __init__(self, body: dict):
        self.status = 200
        self.headers = {}
        self._body = json.dumps(body).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return self._body


class RepositoryRepairExecutorTransportTests(unittest.TestCase):
    @staticmethod
    def _base_payload():
        return {
            "protocol_version": repair.REPAIR_EXECUTOR_PROTOCOL,
            "qualification_id": "Q",
            "subject_sha": "a" * 40,
            "workstream_id": "W",
            "state_ref": "control-gateway-state/active-work/example",
            "authority": {},
            "qualification": {},
            "mutation_plan": {},
            "effects": ["CONTROL_GATEWAY_DEVELOPMENT_WRITE"],
            "development_response_base64": "eA==",
            "development_response_receipt": {},
            "writer_timeout_minutes": 5,
        }

    def test_protocol_and_executor_kind_are_frozen(self):
        self.assertEqual(repair.REPAIR_EXECUTOR_KIND, "A01_REPOSITORY_REPAIR")
        self.assertEqual(
            repair.REPAIR_EXECUTOR_PROTOCOL,
            "control-gateway.a01-repository-repair-executor.v1",
        )

    def test_default_worker_registers_repository_repair_as_reconciliation_required(self):
        from a01_execution_worker import A01ExecutionWorker, RECONCILIATION_REQUIRED
        from a01_night_scheduler import A01NightScheduler
        from tools.second_shift_supervisor_v2 import SupervisorStore

        with tempfile.TemporaryDirectory() as tmp:
            with SupervisorStore(Path(tmp) / "supervisor.db") as store:
                worker = A01ExecutionWorker(store, scheduler=A01NightScheduler(store))
                self.assertIs(
                    worker.executors[repair.REPAIR_EXECUTOR_KIND],
                    repair.execute_repository_repair,
                )
                self.assertEqual(
                    worker.executor_retry_safety[repair.REPAIR_EXECUTOR_KIND],
                    RECONCILIATION_REQUIRED,
                )

    def test_workflow_dispatch_requests_exact_run_details(self):
        captured = {}

        def fake_urlopen(request, timeout):
            captured["body"] = json.loads(request.data.decode("utf-8"))
            captured["method"] = request.get_method()
            captured["timeout"] = timeout
            return FakeResponse(
                {
                    "workflow_run_id": 123456789,
                    "run_url": "https://api.github.com/repos/BFochtman746/system-master/actions/runs/123456789",
                    "html_url": "https://github.com/BFochtman746/system-master/actions/runs/123456789",
                }
            )

        transport = repair.GitHubRepairTransport("BFochtman746", "system-master", "test-token")
        with patch.object(repair.urllib.request, "urlopen", side_effect=fake_urlopen):
            run_id = transport.dispatch("main", {"state_ref": "state-ref"})

        self.assertEqual(run_id, 123456789)
        self.assertEqual(captured["method"], "POST")
        self.assertEqual(set(captured["body"]), {"ref", "inputs", "return_run_details"})
        self.assertEqual(captured["body"]["ref"], "main")
        self.assertEqual(captured["body"]["inputs"], {"state_ref": "state-ref"})
        self.assertIs(captured["body"]["return_run_details"], True)

    def test_transport_budget_stays_below_github_workflow_dispatch_limit(self):
        self.assertLess(repair.MAX_WORKFLOW_INPUT_CHARS, 65535)

    def test_repair_payload_schema_accepts_exact_run_now_authorization(self):
        payload = self._base_payload()
        payload["user_directed_run_now"] = {
            "protocol_version": repair.RUN_NOW_AUTH_PROTOCOL,
            "command_id": "RUN-NOW-1",
            "issue_number": 123,
        }
        repair._validate_repair_payload_schema(payload)

    def test_repair_payload_schema_keeps_overnight_payload_valid(self):
        repair._validate_repair_payload_schema(self._base_payload())

    def test_repair_payload_schema_rejects_malformed_run_now_authorization(self):
        payload = self._base_payload()
        payload["user_directed_run_now"] = {
            "protocol_version": repair.RUN_NOW_AUTH_PROTOCOL,
            "command_id": "RUN-NOW-1",
            "issue_number": 123,
            "extra": True,
        }
        with self.assertRaises(repair.RepositoryRepairExecutionError) as ctx:
            repair._validate_repair_payload_schema(payload)
        self.assertEqual(ctx.exception.code, "REPAIR_PAYLOAD_INVALID")

    def test_repair_payload_schema_rejects_unknown_top_level_field(self):
        payload = self._base_payload()
        payload["unexpected"] = True
        with self.assertRaises(repair.RepositoryRepairExecutionError) as ctx:
            repair._validate_repair_payload_schema(payload)
        self.assertEqual(ctx.exception.code, "REPAIR_PAYLOAD_INVALID")


if __name__ == "__main__":
    unittest.main(verbosity=2)
