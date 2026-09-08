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
from learning_lab.action_presentation import ActionPresentationError, present_current_action


class LearningActionPresentationTests(unittest.TestCase):
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
        self.diagnostic = BaselineDiagnosticDirector(self.repo, scorer=self.engine.git_oracle.score)
        self.sessions = MultiSessionDirector(self.repo, self.engine)
        self.journey = AdaptiveEntryJourneyDirector(
            self.repo,
            self.engine,
            self.diagnostic,
            TutorDirector(self.repo, self.engine),
            self.sessions,
        )
        self.journey.start_journey(
            operation_id="OP-JOURNEY",
            journey_id="J1",
            diagnostic_id="D1",
            learner_id="L1",
            course_id=self.course_id,
            claimed_skill_ids=["S-GIT-STAGE-COMMIT"],
            started_at=0,
        )
        self.sessions.start_session(
            operation_id="OP-SESSION",
            session_id="S1",
            learner_id="L1",
            course_id=self.course_id,
            started_at=0,
        )

    def tearDown(self):
        self.td.cleanup()

    def present(self, suffix: str, now: int, **scope):
        return present_current_action(
            repo=self.repo,
            operation_id=f"OP-PRESENT-{suffix}",
            presentation_id=f"PRESENT-{suffix}",
            journey_id=scope.get("journey_id", "J1"),
            session_id=scope.get("session_id", "S1"),
            learner_id=scope.get("learner_id", "L1"),
            course_id=scope.get("course_id", self.course_id),
            now=now,
        )

    @staticmethod
    def assert_no_secret_fields(testcase, result):
        encoded = json.dumps(result, sort_keys=True)
        testcase.assertNotIn('"answer":', encoded)
        testcase.assertNotIn('"rationale":', encoded)
        testcase.assertNotIn('"response":', encoded)

    def pass_stage_diagnostic(self, at: int = 10):
        return self.journey.record_diagnostic_probe(
            journey_id="J1",
            now=at,
            operation_id=f"OP-DIAG-{at}",
            probe_id=f"DP-{at}",
            diagnostic_id="D1",
            item_id="P-GIT-STAGE-1",
            response="git add notes.txt",
            submitted_at=at,
        )

    def test_diagnostic_presentation_exposes_prompt_but_never_answer(self):
        out = self.present("DIAG", 1)
        self.assertEqual(out["action"]["action_type"], "DIAGNOSTIC_PROBE")
        self.assertEqual(out["action"]["target_id"], "P-GIT-STAGE-1")
        self.assertEqual(out["surface_kind"], "LEARNER_RESPONSE_REQUIRED")
        self.assertTrue(out["response_required"])
        self.assertTrue(out["answer_withheld"])
        self.assertEqual(out["evidence_role"], "DIAGNOSTIC_ROUTING_ONLY")
        self.assertIn("notes.txt", out["prompt"])
        self.assert_no_secret_fields(self, out)

    def test_correct_diagnostic_advances_presentation_to_independent_verification(self):
        self.pass_stage_diagnostic()
        out = self.present("VERIFY", 11)
        self.assertEqual(out["action"]["action_type"], "INDEPENDENT_VERIFICATION")
        self.assertEqual(out["action"]["target_id"], "M-GIT-STAGE-1")
        self.assertEqual(out["assessment_mode"], "MASTERY_CHECK")
        self.assertEqual(out["evidence_role"], "INDEPENDENT_ASSESSMENT")
        self.assertTrue(out["qualifies_mastery_if_passed"])
        self.assertIn("app.txt", out["prompt"])
        self.assert_no_secret_fields(self, out)

    def test_retention_wait_withholds_future_prompt_until_due(self):
        self.pass_stage_diagnostic()
        self.engine.submit_attempt(
            operation_id="OP-MASTERY",
            attempt_id="A-MASTERY",
            learner_id="L1",
            course_id=self.course_id,
            item_id="M-GIT-STAGE-1",
            response="git add app.txt; git commit -m 'Feature work'",
            submitted_at=120,
        )
        out = self.present("WAIT", 121)
        self.assertEqual(out["action"]["action_type"], "RETENTION_WAIT")
        self.assertEqual(out["surface_kind"], "WAIT")
        self.assertFalse(out["response_required"])
        self.assertIsNone(out["prompt"])
        self.assertTrue(out["prompt_withheld_until_due"])
        self.assertEqual(out["earliest_due_at"], 3720)
        self.assert_no_secret_fields(self, out)

    def test_due_retention_exposes_fresh_prompt_with_answer_withheld(self):
        self.pass_stage_diagnostic()
        self.engine.submit_attempt(
            operation_id="OP-MASTERY-DUE",
            attempt_id="A-MASTERY-DUE",
            learner_id="L1",
            course_id=self.course_id,
            item_id="M-GIT-STAGE-1",
            response="git add app.txt; git commit -m 'Feature work'",
            submitted_at=120,
        )
        out = self.present("RETENTION", 4000)
        self.assertEqual(out["action"]["action_type"], "RETENTION_CHECK")
        self.assertEqual(out["surface_kind"], "LEARNER_RESPONSE_REQUIRED")
        self.assertTrue(out["answer_withheld"])
        self.assertEqual(out["evidence_role"], "RETENTION_EVIDENCE")
        self.assertIn("later.txt", out["prompt"])
        self.assert_no_secret_fields(self, out)

    def test_incorrect_diagnostic_presents_tutor_boundary_not_assessment_answer(self):
        self.journey.record_diagnostic_probe(
            journey_id="J1",
            now=10,
            operation_id="OP-DIAG-WRONG",
            probe_id="DP-WRONG",
            diagnostic_id="D1",
            item_id="P-GIT-STAGE-1",
            response="git status",
            submitted_at=10,
        )
        out = self.present("TUTOR", 11)
        self.assertEqual(out["action"]["action_type"], "TUTOR_REMEDIATION")
        self.assertEqual(out["surface_kind"], "TUTOR_INTERACTION_REQUIRED")
        self.assertTrue(out["tutor_begin_required"])
        self.assertFalse(out["response_required"])
        self.assertIsNone(out["prompt"])
        self.assertEqual(out["evidence_role"], "FORMATIVE_ONLY")
        self.assert_no_secret_fields(self, out)

    def test_exact_presentation_replay_stays_bound_to_what_was_shown(self):
        first = self.present("REPLAY", 1)
        self.pass_stage_diagnostic()
        replay = self.present("REPLAY", 1)
        self.assertEqual(first, replay)
        self.assertEqual(replay["action"]["action_type"], "DIAGNOSTIC_PROBE")
        current = self.present("AFTER-REPLAY", 11)
        self.assertEqual(current["action"]["action_type"], "INDEPENDENT_VERIFICATION")
        self.assertEqual(self.repo.count_objects("learning_action_presentation"), 2)

    def test_wrong_learner_scope_fails_before_presentation_is_stored(self):
        before = self.repo.count_objects("learning_action_presentation")
        with self.assertRaisesRegex(ActionPresentationError, "JOURNEY_SCOPE_MISMATCH"):
            self.present("WRONG", 1, learner_id="OTHER")
        self.assertEqual(self.repo.count_objects("learning_action_presentation"), before)


if __name__ == "__main__":
    unittest.main()
