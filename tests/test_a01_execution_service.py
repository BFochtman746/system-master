from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
PYTHON_DIR = ROOT / "control-gateway" / "python"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

import a01_execution_service as service
from a01_execution_worker import RECONCILIATION_REQUIRED
from a01_repository_repair_executor import REPAIR_EXECUTOR_KIND, execute_repository_repair


class FakeWorker:
    def __init__(self, store, **kwargs):
        self.store = store
        self.kwargs = kwargs
        self.executors = dict(kwargs.get("executors") or {})
        self.executor_retry_safety = dict(kwargs.get("executor_retry_safety") or {})


class ExecutionServiceBindingTests(unittest.TestCase):
    def test_build_worker_registers_repository_repair_with_reconciliation_required(self):
        with mock.patch.object(service, "A01ExecutionWorker", FakeWorker):
            worker = service.build_worker(object(), root=ROOT)
        self.assertIs(worker.executors[REPAIR_EXECUTOR_KIND], execute_repository_repair)
        self.assertEqual(
            worker.executor_retry_safety[REPAIR_EXECUTOR_KIND],
            RECONCILIATION_REQUIRED,
        )

    def test_wiring_report_exposes_presence_not_token_value(self):
        worker = FakeWorker(
            object(),
            executors={REPAIR_EXECUTOR_KIND: execute_repository_repair},
            executor_retry_safety={REPAIR_EXECUTOR_KIND: RECONCILIATION_REQUIRED},
        )
        with mock.patch.dict(os.environ, {"A01_REPAIR_DISPATCH_TOKEN": "do-not-expose-this"}, clear=False):
            report = service.wiring_report(worker)
        rendered = json.dumps(report, sort_keys=True)
        self.assertTrue(report["repository_repair_registered"])
        self.assertTrue(report["repair_dispatch_token_present"])
        self.assertEqual(report["repository_repair_retry_safety"], RECONCILIATION_REQUIRED)
        self.assertFalse(report["repository_contents_write_authority"])
        self.assertEqual(report["scheduling_owner"], "A01_SUPERVISOR")
        self.assertNotIn("do-not-expose-this", rendered)


if __name__ == "__main__":
    unittest.main(verbosity=2)
