import os
import tempfile
import unittest

from learning_lab import AdaptiveLearningEngine, REAL_GIT_OUTCOME, Repository


class AdaptivePracticeNotMasteryRegressionTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        self.engine = AdaptiveLearningEngine(self.repo)
        created = self.engine.create_research_grounded_course_job(
            operation_id="OP-CREATE-PRACTICE-REGRESSION",
            job_id="JOB-CREATE-PRACTICE-REGRESSION",
            goal_id="G-PRACTICE-REGRESSION",
            title="Git practice-only mastery regression",
            desired_outcome=REAL_GIT_OUTCOME,
        )
        self.course_id = created["course_id"]

    def tearDown(self):
        self.td.cleanup()

    def test_correct_practice_only_remains_building_until_independent_mastery(self):
        course = self.engine.course(self.course_id)
        practice = next(item for item in course["items"] if item["mode"] == "PRACTICE")

        result = self.engine.submit_attempt(
            operation_id="OP-PRACTICE-ONLY",
            attempt_id="ATT-PRACTICE-ONLY",
            learner_id="L-PRACTICE-ONLY",
            course_id=self.course_id,
            item_id=practice["item_id"],
            response=practice["answer"],
            submitted_at=1000,
        )

        self.assertTrue(result["attempt"]["correct"])
        projection = result["projection"]
        self.assertEqual(projection["stage"], "BUILDING")
        self.assertEqual(projection["gate_states"]["CRITERION_PERFORMANCE"], "UNKNOWN")
        self.assertEqual(projection["gate_states"]["INDEPENDENCE"], "UNKNOWN")
        self.assertEqual(projection["gate_states"]["RETENTION"], "UNKNOWN")
        self.assertEqual(projection["mastery_progress_percent"], 0)
        self.assertEqual(projection["evidence_coverage_percent"], 0)
        self.assertIn("PRACTICE_NOT_MASTERY", projection["reason_codes"])
        self.assertIn("INDEPENDENT_MASTERY_EVIDENCE_REQUIRED", projection["reason_codes"])
        self.assertNotIn("ALL_REQUIRED_GATES_SATISFIED", projection["reason_codes"])

        action = self.engine.next_action("L-PRACTICE-ONLY", self.course_id, now=1001)
        self.assertEqual(action["action_type"], "MASTERY_CHECK")


if __name__ == "__main__":
    unittest.main()
