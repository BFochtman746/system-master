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

    def test_candidate_waits_for_independent_evaluator_and_blocks_successor(self):
        now = worker_module.dt.datetime(2026, 9, 19, 5, 0, tzinfo=worker_module.dt.timezone.utc)
        head = "1" * 40
        self.store.register_lane("CORE", "SYSTEM_MASTER/CORE", "system-master/control-v2", head, now)
        self.store.bind_ready("CORE", "D-AI", "O-AI", head, "O-AI", {"kind": "ai"}, now)
        claim = self.store.claim_ready("CORE", "D-AI", "O-AI", head, "IDEM-AI", "AI_CODING", {"payload": "test"}, now=now)
        self.store.mark_dispatched(claim.dispatch_id, f"local:{claim.dispatch_id}", now)
        bundle = self.worker._dispatch_bundle(claim.dispatch_id)
        context = self.worker._acquire_execution(bundle, now)
        candidate = {"status": "CANDIDATE_READY_FOR_INDEPENDENT_EVALUATION", "evaluator_required": True, "patch_sha256": "a" * 64}
        self.worker._stage_owned_result(bundle, context, terminal_state="COMPLETED", result=candidate, error=None, now=now)
        result_row = self.worker._commit_evaluation_candidate(bundle, now)

        claim_row = self.store.conn.execute("SELECT status,released_at FROM claims WHERE lease_id=?", (claim.lease_id,)).fetchone()
        self.assertEqual(result_row["state"], "SUCCEEDED")
        self.assertEqual(result_row["terminal_state"], "VALIDATING")
        self.assertEqual(claim_row["status"], "VALIDATING")
        self.assertIsNotNone(claim_row["released_at"])
        self.assertEqual(self.store.conn.execute("SELECT state FROM delegations WHERE delegation_id='D-AI'").fetchone()["state"], "VALIDATING")
        self.assertEqual(self.store.conn.execute("SELECT state FROM dispatch_outbox WHERE dispatch_id=?", (claim.dispatch_id,)).fetchone()["state"], "VALIDATING")
        self.assertEqual(self.store.audit_invariants(), [])

        with self.assertRaisesRegex(worker_module.Conflict, "awaits independent evaluation"):
            self.store.bind_ready("CORE", "D-NEXT", "O-NEXT", head, "O-NEXT", {"kind": "next"}, now)
        with self.assertRaisesRegex(worker_module.Conflict, "candidate digest differs"):
            self.store.evaluator_verdict(claim.lease_id, claim.fencing_token, "VERDICT-AI-1", "PASS", "b" * 64, {"tests": "pass"}, now)

        self.assertEqual(
            self.store.evaluator_verdict(claim.lease_id, claim.fencing_token, "VERDICT-AI-1", "PASS", "a" * 64, {"tests": "pass"}, now),
            "COMPLETED",
        )
        self.assertEqual(self.store.conn.execute("SELECT state FROM delegations WHERE delegation_id='D-AI'").fetchone()["state"], "COMPLETED")
        self.assertEqual(self.store.audit_invariants(), [])

    def test_recovery_closes_validation_handoff_crash_window(self):
        now = worker_module.dt.datetime(2026, 9, 19, 5, 0, tzinfo=worker_module.dt.timezone.utc)
        head = "2" * 40
        self.store.register_lane("CORE", "SYSTEM_MASTER/CORE", "system-master/control-v2", head, now)
        self.store.bind_ready("CORE", "D-REC", "O-REC", head, "O-REC", {"kind": "ai"}, now)
        claim = self.store.claim_ready("CORE", "D-REC", "O-REC", head, "IDEM-REC", "AI_CODING", {"payload": "test"}, now=now)
        self.store.mark_dispatched(claim.dispatch_id, f"local:{claim.dispatch_id}", now)
        bundle = self.worker._dispatch_bundle(claim.dispatch_id)
        context = self.worker._acquire_execution(bundle, now)
        candidate = {"status": "CANDIDATE_READY_FOR_INDEPENDENT_EVALUATION", "evaluator_required": True, "patch_sha256": "c" * 64}
        self.worker._stage_owned_result(bundle, context, terminal_state="COMPLETED", result=candidate, error=None, now=now)
        staged = worker_module.json.loads(self.worker._result_row(claim.dispatch_id)["result_json"])
        self.store.await_evaluation(claim.lease_id, claim.fencing_token, "c" * 64, payload=staged, now=now)

        recovered = self.worker.recover(now=now)
        self.assertEqual(recovered["resumed_evaluation_dispatches"], [claim.dispatch_id])
        row = self.worker._result_row(claim.dispatch_id)
        self.assertEqual(row["state"], "SUCCEEDED")
        self.assertEqual(row["terminal_state"], "VALIDATING")
        self.assertEqual(self.store.audit_invariants(), [])


if __name__ == "__main__":
    unittest.main()
