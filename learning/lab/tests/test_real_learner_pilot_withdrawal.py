from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import patch

from learning_lab.real_learner_pilot_runtime_binding import (
    PILOT_RUNTIME_BINDING_KIND,
    start_runtime_bound_pilot,
)
from learning_lab.real_learner_pilot_withdrawal import (
    REAL_LEARNER_PILOT_WITHDRAWAL_VERSION,
    RealLearnerPilotWithdrawalError,
    withdrawal_status,
    withdraw_runtime_bound_pilot,
)
from learning_lab.repository import Repository


class RealLearnerPilotWithdrawalTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        start_runtime_bound_pilot(
            repo=self.repo,
            operation_id="OP-WITHDRAW-START",
            pilot_id="PILOT-WITHDRAW-0001",
            participant_key="LRN-WITHDRAW-0001",
            journey_id="J-WITHDRAW-0001",
            session_id="S-WITHDRAW-0001",
            learner_id="L-WITHDRAW-0001",
            course_id="COURSE-WITHDRAW-0001",
            started_at=10,
            consented_at=11,
            consent_recorded=True,
        )

    def tearDown(self):
        self.td.cleanup()

    def test_prebaseline_withdrawal_is_terminal_without_fabricated_v1_record(self):
        with patch(
            "learning_lab.real_learner_pilot_withdrawal.mark_runtime_bound_pilot_withdrawn",
            side_effect=AssertionError("frozen v1 path must not be called before baseline"),
        ):
            result = withdraw_runtime_bound_pilot(
                repo=self.repo,
                operation_id="OP-WITHDRAW-PREBASELINE",
                pilot_id="PILOT-WITHDRAW-0001",
                withdrawn_at=12,
            )
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["withdrawal_stage"], "PRE_BASELINE")
        self.assertEqual(result["participant_outcome"], "WITHDRAWN")
        self.assertFalse(result["eligible_for_effectiveness_review"])
        self.assertFalse(result["record_materialized"])
        self.assertFalse(result["frozen_v1_validator_used"])
        self.assertNotIn("record", result)
        latest = self.repo.get_latest_object(PILOT_RUNTIME_BINDING_KIND, "PILOT-WITHDRAW-0001")
        self.assertEqual(latest["terminal"]["kind"], "WITHDRAWN")
        self.assertEqual(latest["terminal"]["stage"], "PRE_BASELINE")
        self.assertEqual(latest["turn_receipts"], [])
        self.assertEqual(latest["revision"], 2)

    def test_exact_prebaseline_withdrawal_operation_replay_is_stable(self):
        first = withdraw_runtime_bound_pilot(
            repo=self.repo,
            operation_id="OP-WITHDRAW-REPLAY",
            pilot_id="PILOT-WITHDRAW-0001",
            withdrawn_at=12,
        )
        replay = withdraw_runtime_bound_pilot(
            repo=self.repo,
            operation_id="OP-WITHDRAW-REPLAY",
            pilot_id="PILOT-WITHDRAW-0001",
            withdrawn_at=12,
        )
        self.assertEqual(first, replay)

    def test_prebaseline_withdrawal_time_cannot_precede_consent(self):
        with self.assertRaisesRegex(RealLearnerPilotWithdrawalError, "PILOT_WITHDRAWAL_TIME_REVERSED"):
            withdraw_runtime_bound_pilot(
                repo=self.repo,
                operation_id="OP-WITHDRAW-TIME",
                pilot_id="PILOT-WITHDRAW-0001",
                withdrawn_at=10,
            )
        latest = self.repo.get_latest_object(PILOT_RUNTIME_BINDING_KIND, "PILOT-WITHDRAW-0001")
        self.assertIsNone(latest["terminal"])

    def test_withdrawal_status_reports_prebaseline_terminal(self):
        withdraw_runtime_bound_pilot(
            repo=self.repo,
            operation_id="OP-WITHDRAW-STATUS",
            pilot_id="PILOT-WITHDRAW-0001",
            withdrawn_at=14,
        )
        status = withdrawal_status(repo=self.repo, pilot_id="PILOT-WITHDRAW-0001")
        self.assertTrue(status["withdrawn"])
        self.assertEqual(status["withdrawal_stage"], "PRE_BASELINE")
        self.assertEqual(status["captured_turn_count"], 0)
        self.assertFalse(status["eligible_for_effectiveness_review"])
        self.assertEqual(status["withdrawal_version"], REAL_LEARNER_PILOT_WITHDRAWAL_VERSION)

    def test_existing_evidence_delegates_to_frozen_v1_withdrawal_path(self):
        latest = self.repo.get_latest_object(PILOT_RUNTIME_BINDING_KIND, "PILOT-WITHDRAW-0001")
        latest = dict(latest)
        latest["turn_receipts"] = [{"turn_id": "TURN-1", "submitted_at": 20, "action_type": "DIAGNOSTIC_PROBE"}]
        latest["revision"] = 2
        self.repo.put_object(PILOT_RUNTIME_BINDING_KIND, "PILOT-WITHDRAW-0001", 2, latest)
        delegated = {
            "status": "PASS",
            "pilot_id": "PILOT-WITHDRAW-0001",
            "record": {"protocol_version": "PILOT-001-v1"},
            "adjudication": {
                "participant_outcome": "WITHDRAWN",
                "eligible_for_effectiveness_review": False,
            },
            "revision": 3,
        }
        with patch(
            "learning_lab.real_learner_pilot_withdrawal.mark_runtime_bound_pilot_withdrawn",
            return_value=delegated,
        ) as frozen:
            result = withdraw_runtime_bound_pilot(
                repo=self.repo,
                operation_id="OP-WITHDRAW-DELEGATE",
                pilot_id="PILOT-WITHDRAW-0001",
                withdrawn_at=21,
            )
        frozen.assert_called_once()
        self.assertEqual(result["withdrawal_stage"], "POST_BASELINE_EVIDENCE")
        self.assertTrue(result["record_materialized"])
        self.assertTrue(result["frozen_v1_validator_used"])
        self.assertEqual(result["participant_outcome"], "WITHDRAWN")


if __name__ == "__main__":
    unittest.main()
