import os
import tempfile
import unittest

from learning_lab import LearningEngine, Repository


class EndToEndSliceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.tmp.name, "lab.sqlite3"))
        self.engine = LearningEngine(self.repo)
        self.result = self.engine.create_course_job(
            operation_id="OP-CREATE", job_id="JOB-CREATE", goal_id="G1",
            title="Synthetic routing basics",
            desired_outcome="Classify token stability and select the correct route independently.",
        )
        self.course_id = self.result["course_id"]

    def tearDown(self):
        self.tmp.cleanup()

    def test_course_creation_has_coverage_and_prerequisite(self):
        course = self.engine.course(self.course_id)
        self.assertEqual(2, len(course["skills"]))
        self.assertEqual(["S-STABILITY"], course["skills"][1]["hard_prerequisite_skill_ids"])
        lesson_criteria = {c for l in course["lessons"] for c in l["criterion_ids"]}
        self.assertEqual({"C-STABILITY", "C-ROUTE"}, lesson_criteria)
        self.assertTrue(all(l["objective"] and l["explanation"] and l["worked_examples"] for l in course["lessons"]))

    def test_initial_action_is_first_lesson(self):
        action = self.engine.next_action("L1", self.course_id, now=0)
        self.assertEqual("LESSON", action["action_type"])
        self.assertEqual("L-STABILITY", action["target_id"])

    def test_practice_is_not_mastery(self):
        r = self.engine.submit_attempt(operation_id="OP-P1", attempt_id="A-P1", learner_id="L1", course_id=self.course_id, item_id="P-STAB-1", response="STABLE", submitted_at=100, assisted=False)
        self.assertNotEqual("MASTERED", r["projection"]["stage"])
        self.assertIn("PRACTICE_NOT_MASTERY", r["projection"]["reason_codes"])
        action = self.engine.next_action("L1", self.course_id, now=100)
        self.assertEqual("MASTERY_CHECK", action["action_type"])

    def test_assisted_mastery_attempt_does_not_satisfy_independence(self):
        r = self.engine.submit_attempt(operation_id="OP-MA", attempt_id="A-MA", learner_id="L1", course_id=self.course_id, item_id="M-STAB-1", response="STABLE", submitted_at=100, assisted=True)
        self.assertNotEqual("MASTERED", r["projection"]["stage"])
        self.assertEqual("UNKNOWN", r["projection"]["gate_states"]["INDEPENDENCE"])
        self.assertEqual("ASSISTANCE_BREAKS_INDEPENDENCE", r["projection"]["excluded_attempts"]["A-MA"])

    def test_failed_mastery_check_selects_remediation(self):
        r = self.engine.submit_attempt(operation_id="OP-MF", attempt_id="A-MF", learner_id="L1", course_id=self.course_id, item_id="M-STAB-1", response="UNSTABLE", submitted_at=100)
        self.assertEqual("BUILDING", r["projection"]["stage"])
        action = self.engine.next_action("L1", self.course_id, now=100)
        self.assertEqual("REMEDIATION", action["action_type"])

    def test_correct_independent_check_requires_retention(self):
        r = self.engine.submit_attempt(operation_id="OP-M1", attempt_id="A-M1", learner_id="L1", course_id=self.course_id, item_id="M-STAB-1", response="STABLE", submitted_at=100)
        self.assertEqual("RETENTION_DUE", r["projection"]["stage"])
        self.assertEqual(67, r["projection"]["mastery_progress_percent"])
        action = self.engine.next_action("L1", self.course_id, now=100)
        self.assertEqual("RETENTION_CHECK", action["action_type"])

    def test_too_early_retention_is_excluded(self):
        self.engine.submit_attempt(operation_id="OP-M1", attempt_id="A-M1", learner_id="L1", course_id=self.course_id, item_id="M-STAB-1", response="STABLE", submitted_at=100)
        r = self.engine.submit_attempt(operation_id="OP-R1", attempt_id="A-R1", learner_id="L1", course_id=self.course_id, item_id="R-STAB-1", response="UNSTABLE", submitted_at=200)
        self.assertEqual("RETENTION_DUE", r["projection"]["stage"])
        self.assertEqual("RETENTION_DELAY_NOT_MET", r["projection"]["excluded_attempts"]["A-R1"])

    def test_delayed_retention_mastery_unlocks_next_skill(self):
        self.engine.submit_attempt(operation_id="OP-M1", attempt_id="A-M1", learner_id="L1", course_id=self.course_id, item_id="M-STAB-1", response="STABLE", submitted_at=100)
        r = self.engine.submit_attempt(operation_id="OP-R1", attempt_id="A-R1", learner_id="L1", course_id=self.course_id, item_id="R-STAB-1", response="UNSTABLE", submitted_at=4000)
        self.assertEqual("MASTERED", r["projection"]["stage"])
        self.assertEqual(100, r["projection"]["mastery_progress_percent"])
        action = self.engine.next_action("L1", self.course_id, now=4000)
        self.assertEqual("LESSON", action["action_type"])
        self.assertEqual("S-ROUTE", action["skill_id"])

    def test_answer_reveal_before_mastery_commit_is_denied(self):
        with self.assertRaisesRegex(ValueError, "IntegrityPolicyViolation"):
            self.engine.submit_attempt(operation_id="OP-X", attempt_id="A-X", learner_id="L1", course_id=self.course_id, item_id="M-STAB-1", response="STABLE", submitted_at=100, answer_revealed_before_commit=True)

    def test_projection_history_is_append_only(self):
        self.engine.submit_attempt(operation_id="OP-P1", attempt_id="A-P1", learner_id="L1", course_id=self.course_id, item_id="P-STAB-1", response="STABLE", submitted_at=10)
        self.engine.submit_attempt(operation_id="OP-M1", attempt_id="A-M1", learner_id="L1", course_id=self.course_id, item_id="M-STAB-1", response="STABLE", submitted_at=20)
        history = self.repo.projection_history("L1", self.course_id, "S-STABILITY")
        self.assertEqual(2, len(history))
        self.assertNotEqual(history[0]["stage"], history[1]["stage"])

    def test_complete_both_skills_reaches_course_complete(self):
        self.engine.submit_attempt(operation_id="OP-M1", attempt_id="A-M1", learner_id="L1", course_id=self.course_id, item_id="M-STAB-1", response="STABLE", submitted_at=100)
        self.engine.submit_attempt(operation_id="OP-R1", attempt_id="A-R1", learner_id="L1", course_id=self.course_id, item_id="R-STAB-1", response="UNSTABLE", submitted_at=4000)
        self.engine.submit_attempt(operation_id="OP-M2", attempt_id="A-M2", learner_id="L1", course_id=self.course_id, item_id="M-ROUTE-1", response="ALPHA", submitted_at=4100)
        mid = self.engine.next_action("L1", self.course_id, now=4100)
        self.assertEqual("RETENTION_CHECK", mid["action_type"])
        self.assertEqual("R-ROUTE-1", mid["target_id"])
        self.engine.submit_attempt(operation_id="OP-R2", attempt_id="A-R2", learner_id="L1", course_id=self.course_id, item_id="R-ROUTE-1", response="BETA", submitted_at=8000)
        final = self.engine.next_action("L1", self.course_id, now=8000)
        self.assertEqual("COURSE_COMPLETE", final["action_type"])



if __name__ == "__main__":
    unittest.main()
