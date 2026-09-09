from __future__ import annotations

import os
import tempfile
import unittest

from learning_lab.real_learner_pilot_completion import (
    RealLearnerPilotCompletionError,
    closed_loop_status,
    finalize_closed_loop_if_ready,
)
from learning_lab.real_learner_pilot_human_session import HUMAN_TURN_ATTESTATION_KIND
from learning_lab.real_learner_pilot_runtime_binding import PILOT_RUNTIME_BINDING_KIND
from learning_lab.repository import Repository


PILOT_ID = "PILOT-COMP-0001"
PARTICIPANT_KEY = "LRN-COMP-0001"
COURSE_ID = "COURSE-COMP-0001"


class RealLearnerPilotCompletionTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))

    def tearDown(self):
        self.td.cleanup()

    def baseline(self, *, correct: bool = True):
        return {
            "turn_id": "TURN-BASELINE",
            "submitted_at": 10,
            "mode": "EVIDENCE",
            "action_type": "DIAGNOSTIC_PROBE",
            "response_digest": "1" * 64,
            "diagnostic_integrity": {
                "correct": correct,
                "assisted": False,
                "answer_revealed_before_commit": False,
                "item_family_id": "F-BASELINE",
            },
            "next_action": {"action_type": "INDEPENDENT_VERIFICATION", "skill_id": "S-1"},
            "next_authority": "TEST",
        }

    def verification(self, *, correct: bool = True):
        return {
            "turn_id": "TURN-VERIFY",
            "submitted_at": 120,
            "mode": "EVIDENCE",
            "action_type": "INDEPENDENT_VERIFICATION",
            "response_digest": "2" * 64,
            "evidence": {
                "correct": correct,
                "assisted": False,
                "answer_revealed_before_commit": False,
            },
            "task_metadata": {"family_id": "F-VERIFY"},
            "next_action": {"action_type": "RETENTION_WAIT", "skill_id": "S-1"},
            "next_authority": "TEST",
        }

    def retention(self, *, correct: bool = True):
        return {
            "turn_id": "TURN-RETENTION",
            "submitted_at": 3720,
            "mode": "EVIDENCE",
            "action_type": "RETENTION_CHECK",
            "response_digest": "3" * 64,
            "evidence": {
                "correct": correct,
                "assisted": False,
                "answer_revealed_before_commit": False,
            },
            "task_metadata": {"family_id": "F-RETENTION"},
            "next_action": {"action_type": "TRANSFER_CHECK", "skill_id": "S-1"},
            "next_authority": "TEST",
        }

    def transfer(self, *, correct: bool = True, next_action: str = "COURSE_COMPLETE"):
        return {
            "turn_id": "TURN-TRANSFER",
            "submitted_at": 3800,
            "mode": "EVIDENCE",
            "action_type": "TRANSFER_CHECK",
            "response_digest": "4" * 64,
            "evidence": {
                "correct": correct,
                "assisted": False,
                "answer_revealed_before_commit": False,
            },
            "task_metadata": {
                "family_id": "F-TRANSFER",
                "novelty": {"context_shift": True},
            },
            "next_action": {"action_type": next_action, "skill_id": "S-1"},
            "next_authority": "TEST",
        }

    def install(self, rows, *, terminal=None, attest=True):
        binding = {
            "pilot_id": PILOT_ID,
            "participant_key": PARTICIPANT_KEY,
            "journey_id": "J-COMP",
            "session_id": "SESSION-COMP",
            "learner_id": "L-COMP",
            "course_id": COURSE_ID,
            "started_at": 0,
            "consented_at": 1,
            "consent_recorded": True,
            "protocol_version": "PILOT-001-v1",
            "binding_version": "PILOT-001-CURRENT-RUNTIME-BINDING-V1",
            "revision": 1,
            "turn_receipts": list(rows),
            "terminal": terminal,
            "authority_boundary": {},
            "runtime_versions": {},
        }
        self.repo.put_object(PILOT_RUNTIME_BINDING_KIND, PILOT_ID, 1, binding)
        if attest:
            for row in rows:
                self.repo.put_object(HUMAN_TURN_ATTESTATION_KIND, row["turn_id"], 1, {
                    "pilot_id": PILOT_ID,
                    "turn_id": row["turn_id"],
                    "raw_response_stored": False,
                })

    def test_no_receipts_is_baseline_pending(self):
        self.install([])
        status = closed_loop_status(repo=self.repo, pilot_id=PILOT_ID, now=5)
        self.assertEqual(status["standing"], "BASELINE_PENDING")
        self.assertEqual(status["captured_turn_count"], 0)
        self.assertFalse(status["eligible_for_effectiveness_review"])

    def test_missing_human_attestation_fails_closed(self):
        self.install([self.baseline()], attest=False)
        with self.assertRaisesRegex(RealLearnerPilotCompletionError, "CAPTURE_WITHOUT_HUMAN_ATTESTATION"):
            closed_loop_status(repo=self.repo, pilot_id=PILOT_ID, now=10)

    def test_passed_verification_waits_until_exact_retention_boundary(self):
        self.install([self.baseline(), self.verification()])
        early = closed_loop_status(repo=self.repo, pilot_id=PILOT_ID, now=3719)
        self.assertEqual(early["standing"], "RETENTION_WAIT")
        self.assertEqual(early["retention_not_before"], 3720)
        self.assertEqual(early["retention_seconds_remaining"], 1)
        due = closed_loop_status(repo=self.repo, pilot_id=PILOT_ID, now=3720)
        self.assertEqual(due["standing"], "RETENTION_DUE")
        self.assertTrue(due["retention_due"])

    def test_failed_verification_is_not_mislabeled_retention_pending(self):
        self.install([self.baseline(), self.verification(correct=False)])
        status = closed_loop_status(repo=self.repo, pilot_id=PILOT_ID, now=5000)
        self.assertEqual(status["standing"], "VERIFICATION_NONPASS_REMEDIATION_PENDING")
        self.assertNotIn("retention_not_before", status)

    def test_passed_retention_advances_to_transfer_pending(self):
        self.install([self.baseline(), self.verification(), self.retention()])
        status = closed_loop_status(repo=self.repo, pilot_id=PILOT_ID, now=3720)
        self.assertEqual(status["standing"], "TRANSFER_PENDING")
        self.assertEqual(status["participant_outcome"], "INCOMPLETE")

    def test_transfer_receipt_requires_course_complete_before_terminalization(self):
        self.install([
            self.baseline(), self.verification(), self.retention(),
            self.transfer(next_action="TRANSFER_REMEDIATION"),
        ])
        status = closed_loop_status(repo=self.repo, pilot_id=PILOT_ID, now=3800)
        self.assertEqual(status["standing"], "TRANSFER_NONPASS_REMEDIATION_PENDING")
        with self.assertRaisesRegex(RealLearnerPilotCompletionError, "PILOT_COMPLETION_NOT_READY"):
            finalize_closed_loop_if_ready(
                repo=self.repo,
                operation_id="OP-NOT-READY",
                pilot_id=PILOT_ID,
                completed_at=3801,
            )

    def test_ready_transfer_terminalizes_and_adjudicates_closed_loop(self):
        self.install([self.baseline(), self.verification(), self.retention(), self.transfer()])
        status = closed_loop_status(repo=self.repo, pilot_id=PILOT_ID, now=3800)
        self.assertEqual(status["standing"], "COMPLETION_READY")
        result = finalize_closed_loop_if_ready(
            repo=self.repo,
            operation_id="OP-COMPLETE",
            pilot_id=PILOT_ID,
            completed_at=3801,
        )
        self.assertEqual(result["standing"], "CLOSED_LOOP_COMPLETE")
        self.assertEqual(result["adjudication"]["participant_outcome"], "CLOSED_LOOP_PASS")
        self.assertTrue(result["adjudication"]["closed_loop_passed"])
        replay = closed_loop_status(repo=self.repo, pilot_id=PILOT_ID, now=3802)
        self.assertEqual(replay["standing"], "CLOSED_LOOP_COMPLETE")
        self.assertTrue(replay["eligible_for_effectiveness_review"])

    def test_prebaseline_withdrawal_is_reportable_without_fabricated_baseline(self):
        self.install([], terminal={"kind": "WITHDRAWN", "occurred_at": 2})
        status = closed_loop_status(repo=self.repo, pilot_id=PILOT_ID, now=3)
        self.assertEqual(status["standing"], "WITHDRAWN")
        self.assertEqual(status["participant_outcome"], "WITHDRAWN")
        self.assertFalse(status["record_materialized"])
        self.assertEqual(status["withdrawn_stage"], "PRE_BASELINE")


if __name__ == "__main__":
    unittest.main()
