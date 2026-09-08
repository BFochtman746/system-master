from __future__ import annotations

import json
import os
import tempfile
import unittest

from learning_lab import (
    AdaptiveEntryJourneyDirector,
    AdaptiveLearningEngine,
    BaselineDiagnosticDirector,
    MultiSessionDirector,
    REAL_GIT_OUTCOME,
    Repository,
    TutorDirector,
)
from learning_lab.unified_turn_controller import (
    TURN_KIND,
    TURN_SUBMISSION_KIND,
    UnifiedTurnControllerError,
    prepare_learning_turn,
    submit_learning_turn,
)


class UnifiedLearningTurnControllerTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        self.engine = AdaptiveLearningEngine(self.repo)
        created = self.engine.create_research_grounded_course_job(
            operation_id="OP-CREATE",
            job_id="JOB-CREATE",
            goal_id="G-GIT",
            title="Git feature branch workflow",
            desired_outcome=REAL_GIT_OUTCOME,
        )
        self.course_id = created["course_id"]
        self._start("A", "LA")

    def tearDown(self):
        self.td.cleanup()

    def _start(self, suffix: str, learner_id: str):
        diagnostic = BaselineDiagnosticDirector(self.repo, scorer=self.engine.git_oracle.score)
        sessions = MultiSessionDirector(self.repo, self.engine)
        journey = AdaptiveEntryJourneyDirector(
            self.repo,
            self.engine,
            diagnostic,
            TutorDirector(self.repo, self.engine),
            sessions,
        )
        journey_id = f"J-{suffix}"
        diagnostic_id = f"D-{suffix}"
        session_id = f"S-{suffix}"
        journey.start_journey(
            operation_id=f"OP-J-{suffix}",
            journey_id=journey_id,
            diagnostic_id=diagnostic_id,
            learner_id=learner_id,
            course_id=self.course_id,
            claimed_skill_ids=["S-GIT-STAGE-COMMIT"],
            started_at=0,
        )
        sessions.start_session(
            operation_id=f"OP-S-{suffix}",
            session_id=session_id,
            learner_id=learner_id,
            course_id=self.course_id,
            started_at=0,
        )
        return journey_id, session_id

    def prepare(self, turn_id: str, now: int, *, suffix="A", learner_id="LA", operation_id=None):
        return prepare_learning_turn(
            repo=self.repo,
            operation_id=operation_id or f"OP-PREP-{turn_id}",
            turn_id=turn_id,
            journey_id=f"J-{suffix}",
            session_id=f"S-{suffix}",
            learner_id=learner_id,
            course_id=self.course_id,
            now=now,
        )

    def submit(self, turn, response: str, submitted_at: int, *, operation_id=None, **kwargs):
        return submit_learning_turn(
            repo=self.repo,
            operation_id=operation_id or f"OP-SUB-{turn['turn_id']}",
            turn_id=turn["turn_id"],
            turn_binding_digest=turn["turn_binding_digest"],
            response=response,
            submitted_at=submitted_at,
            **kwargs,
        )

    def test_prepare_diagnostic_turn_is_bound_answer_withheld_evidence_mode(self):
        turn = self.prepare("TURN-DIAG", 1)
        self.assertEqual(turn["mode"], "EVIDENCE")
        self.assertEqual(turn["action"]["action_type"], "DIAGNOSTIC_PROBE")
        self.assertEqual(turn["action"]["target_id"], "P-GIT-STAGE-1")
        self.assertIn("notes.txt", turn["prompt"])
        self.assertTrue(turn["answer_withheld"])
        self.assertTrue(turn["response_required"])
        self.assertEqual(len(turn["turn_binding_digest"]), 64)
        self.assertNotIn('"answer":', json.dumps(turn, sort_keys=True))

    def test_evidence_turns_continue_through_verification_to_retention_wait(self):
        diagnostic = self.prepare("TURN-E1", 1)
        diagnostic_result = self.submit(diagnostic, "git add notes.txt", 10)
        self.assertEqual(diagnostic_result["mode"], "EVIDENCE")
        self.assertEqual(diagnostic_result["evidence"]["evidence_kind"], "DIAGNOSTIC_ROUTING_ONLY")
        self.assertEqual(diagnostic_result["next_action"]["action_type"], "INDEPENDENT_VERIFICATION")

        verify = self.prepare("TURN-E2", 11)
        self.assertEqual(verify["action"]["action_type"], "INDEPENDENT_VERIFICATION")
        self.assertIn("app.txt", verify["prompt"])
        mastery = self.submit(
            verify,
            "git add app.txt; git commit -m 'Feature work'",
            120,
        )
        self.assertEqual(mastery["evidence"]["evidence_kind"], "MASTERY_CHECK")
        self.assertTrue(mastery["evidence"]["correct"])
        self.assertEqual(mastery["next_action"]["action_type"], "RETENTION_WAIT")

        wait = self.prepare("TURN-E3", 121)
        self.assertEqual(wait["mode"], "WAIT")
        self.assertFalse(wait["response_required"])
        self.assertIsNone(wait["prompt"])
        self.assertEqual(wait["earliest_due_at"], 3720)
        with self.assertRaisesRegex(UnifiedTurnControllerError, "TURN_DOES_NOT_ACCEPT_RESPONSE:WAIT"):
            self.submit(wait, "should not be accepted", 122)

    def test_wrong_diagnostic_routes_through_two_tutor_turns_then_independent_verification(self):
        self._start("B", "LB")
        diagnostic = self.prepare("TURN-T1", 1, suffix="B", learner_id="LB")
        wrong = self.submit(diagnostic, "git status", 10)
        self.assertEqual(wrong["next_action"]["action_type"], "TUTOR_REMEDIATION")

        tutor_one = self.prepare("TURN-T2", 11, suffix="B", learner_id="LB")
        self.assertEqual(tutor_one["mode"], "TUTOR")
        self.assertEqual(tutor_one["tutor"]["probe_id"], "DG-TP-GIT-STAGE-1")
        self.assertIn("demo.txt", tutor_one["prompt"])
        first = self.submit(
            tutor_one,
            "git commit -m 'oops'",
            12,
            requested_help_level=1,
        )
        self.assertEqual(first["evidence"]["evidence_kind"], "TUTOR_FORMATIVE_ONLY")
        self.assertFalse(first["evidence"]["mastery_attempt_written"])
        self.assertEqual(first["next_action"]["action_type"], "TUTOR_REMEDIATION")

        tutor_two = self.prepare("TURN-T3", 13, suffix="B", learner_id="LB")
        self.assertEqual(tutor_two["mode"], "TUTOR")
        self.assertEqual(tutor_two["tutor"]["probe_id"], "DG-TP-GIT-STAGE-2")
        self.assertIn("report.txt", tutor_two["prompt"])
        second = self.submit(tutor_two, "git add report.txt", 14, requested_help_level=0)
        self.assertEqual(second["evidence"]["teaching_move"]["move"], "INDEPENDENT_RECHECK_PASSED")
        self.assertEqual(second["next_action"]["action_type"], "INDEPENDENT_VERIFICATION")
        self.assertEqual(second["next_authority"], "TUTOR_FORMATIVE_ROUTING_HANDOFF")

        verification = self.prepare("TURN-T4", 15, suffix="B", learner_id="LB")
        self.assertEqual(verification["mode"], "EVIDENCE")
        self.assertEqual(verification["action"]["action_type"], "INDEPENDENT_VERIFICATION")
        self.assertEqual(verification["action"]["target_id"], "M-GIT-STAGE-1")

    def test_prepare_replay_is_stable_and_turn_id_cannot_rebind(self):
        first = self.prepare("TURN-REPLAY", 1, operation_id="OP-PREP-REPLAY-1")
        replay = self.prepare("TURN-REPLAY", 1, operation_id="OP-PREP-REPLAY-2")
        self.assertEqual(first, replay)
        self.assertEqual(self.repo.count_objects(TURN_KIND), 1)
        with self.assertRaisesRegex(UnifiedTurnControllerError, "TURN_ID_REUSE"):
            self.prepare("TURN-REPLAY", 2, operation_id="OP-PREP-REPLAY-3")

    def test_submit_retry_can_use_new_operation_id_but_different_input_is_rejected(self):
        turn = self.prepare("TURN-SUBMIT-REPLAY", 1)
        first = self.submit(
            turn,
            "git add notes.txt",
            10,
            operation_id="OP-SUBMIT-REPLAY-1",
        )
        replay = self.submit(
            turn,
            "git add notes.txt",
            10,
            operation_id="OP-SUBMIT-REPLAY-2",
        )
        self.assertEqual(first, replay)
        self.assertEqual(self.repo.count_objects(TURN_SUBMISSION_KIND), 1)
        with self.assertRaisesRegex(UnifiedTurnControllerError, "TURN_ALREADY_SUBMITTED_WITH_DIFFERENT_INPUT"):
            self.submit(
                turn,
                "git status",
                10,
                operation_id="OP-SUBMIT-REPLAY-3",
            )

    def test_turn_binding_mismatch_fails_before_evidence_write(self):
        turn = self.prepare("TURN-BIND", 1)
        attempts_before = self.repo.count_attempts()
        with self.assertRaisesRegex(UnifiedTurnControllerError, "TURN_BINDING_MISMATCH"):
            submit_learning_turn(
                repo=self.repo,
                operation_id="OP-BAD-BIND",
                turn_id=turn["turn_id"],
                turn_binding_digest="0" * 64,
                response="git add notes.txt",
                submitted_at=10,
            )
        self.assertEqual(self.repo.count_attempts(), attempts_before)
        self.assertEqual(self.repo.count_objects(TURN_SUBMISSION_KIND), 0)

    def test_unified_turn_and_submission_objects_do_not_store_raw_response(self):
        turn = self.prepare("TURN-NO-RAW", 1)
        raw = "git add notes.txt"
        result = self.submit(turn, raw, 10)
        self.assertFalse(result["response_echoed"])
        stored_turn = self.repo.get_object(TURN_KIND, turn["turn_id"], 1)
        stored_submission = self.repo.get_object(TURN_SUBMISSION_KIND, turn["turn_id"], 1)
        self.assertNotIn(raw, json.dumps(stored_turn, sort_keys=True))
        self.assertNotIn(raw, json.dumps(stored_submission, sort_keys=True))
        self.assertEqual(len(result["response_digest"]), 64)

    def test_wrong_scope_fails_before_turn_is_stored(self):
        before = self.repo.count_objects(TURN_KIND)
        with self.assertRaisesRegex(ValueError, "JOURNEY_SCOPE_MISMATCH"):
            prepare_learning_turn(
                repo=self.repo,
                operation_id="OP-PREP-WRONG-SCOPE",
                turn_id="TURN-WRONG-SCOPE",
                journey_id="J-A",
                session_id="S-A",
                learner_id="OTHER",
                course_id=self.course_id,
                now=1,
            )
        self.assertEqual(self.repo.count_objects(TURN_KIND), before)


if __name__ == "__main__":
    unittest.main()
