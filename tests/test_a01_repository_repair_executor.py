from __future__ import annotations

import json
import sys
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
    def test_protocol_and_executor_kind_are_frozen(self):
        self.assertEqual(repair.REPAIR_EXECUTOR_KIND, "A01_REPOSITORY_REPAIR")
        self.assertEqual(
            repair.REPAIR_EXECUTOR_PROTOCOL,
            "control-gateway.a01-repository-repair-executor.v1",
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
