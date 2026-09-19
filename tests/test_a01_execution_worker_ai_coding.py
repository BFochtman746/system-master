from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "control-gateway" / "python"))

import a01_execution_worker as worker_module  # noqa: E402
from tools.second_shift_supervisor_v2 import SupervisorStore  # noqa: E402


class A01ExecutionWorkerAICodingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = SupervisorStore(Path(self.tmp.name) / "supervisor.db")
        self.worker = worker_module.A01ExecutionWorker(
            self.store,
            root=ROOT,
            evidence_root=Path(self.tmp.name) / "evidence",
        )

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_ai_coding_is_registered_with_reconciliation_required_retry(self):
        self.assertIn("AI_CODING", self.worker.executors)
        self.assertEqual(
            self.worker.executor_retry_safety["AI_CODING"],
            worker_module.RECONCILIATION_REQUIRED,
        )

    def test_ai_coding_candidate_is_returned_without_worker_acceptance(self):
        candidate = {
            "status": "CANDIDATE_READY_FOR_INDEPENDENT_EVALUATION",
            "evaluator_required": True,
            "patch_sha256": "a" * 64,
        }
        with mock.patch.object(worker_module, "dispatch_ai_coding", return_value=candidate) as dispatch:
            result = self.worker._execute_ai_coding({"packet_id": "P-1"}, object())
        self.assertEqual(result, candidate)
        self.assertNotIn("PASS", result.values())
        dispatch.assert_called_once()
        self.assertEqual(dispatch.call_args.kwargs["root"], ROOT.resolve())

    def test_ambiguous_dispatch_preserves_reconciliation_evidence(self):
        error = worker_module.DispatchAmbiguousError(
            "ambiguous",
            {"evidence_path": "evidence/reconcile.json", "changed_paths": ["x.py"]},
        )
        with mock.patch.object(worker_module, "dispatch_ai_coding", side_effect=error):
            with self.assertRaises(worker_module.WorkExecutionFailed) as caught:
                self.worker._execute_ai_coding({"packet_id": "P-2"}, object())
        self.assertTrue(caught.exception.result["reconciliation_required"])
        self.assertEqual(caught.exception.result["evidence_path"], "evidence/reconcile.json")
        self.assertEqual(caught.exception.result["changed_paths"], ["x.py"])

    def test_failed_dispatch_preserves_details_without_claiming_acceptance(self):
        error = worker_module.ModelDispatchFailed(
            "failed",
            {"returncode": 7, "stderr_tail": "failure"},
        )
        with mock.patch.object(worker_module, "dispatch_ai_coding", side_effect=error):
            with self.assertRaises(worker_module.WorkExecutionFailed) as caught:
                self.worker._execute_ai_coding({"packet_id": "P-3"}, object())
        self.assertEqual(caught.exception.result["returncode"], 7)
        self.assertNotIn("result_class", caught.exception.result)


if __name__ == "__main__":
    unittest.main()
