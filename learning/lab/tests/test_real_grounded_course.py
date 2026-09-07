import os
import tempfile
import unittest

from learning_lab import GroundedLearningEngine, REAL_GIT_OUTCOME, Repository


class RealGroundedCourseTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "lab.sqlite3"))
        self.engine = GroundedLearningEngine(self.repo)
        self.created = self.engine.create_research_grounded_course_job(
            operation_id="OP-CREATE",
            job_id="JOB-CREATE",
            goal_id="G-GIT",
            title="Git feature branch workflow",
            desired_outcome=REAL_GIT_OUTCOME,
        )
        self.course_id = self.created["course_id"]

    def tearDown(self):
        self.td.cleanup()

    def test_real_research_dossier_and_validation_persisted(self):
        self.assertEqual(self.created["validation_status"], "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED")
        dossier = self.repo.get_object("research_dossier", self.created["research_dossier_id"], 1)
        self.assertEqual(len(dossier["sources"]), 6)
        self.assertEqual(len(dossier["claims"]), 7)
        validation = self.repo.get_object("course_validation", self.created["validation_id"], 1)
        self.assertEqual(validation["grounding"]["status"], "PASS")
        self.assertEqual(validation["grounding"]["claim_coverage_percent"], 100)
        self.assertEqual(validation["git_behavior_oracle"]["status"], "PASS")

    def test_generated_course_contains_grounded_lessons(self):
        course = self.engine.course(self.course_id)
        self.assertEqual(len(course["skills"]), 2)
        self.assertTrue(all(l["claim_refs"] for l in course["lessons"]))
        self.assertTrue(all(i["claim_refs"] for i in course["items"]))
        self.assertEqual(course["research_dossier_id"], "RSCH-GIT-FEATURE-WORKFLOW-001")
        self.assertEqual(course["generation_adapter"], "MODEL-STUB-GROUNDED-V1")

    def test_real_course_learning_flow_reaches_course_complete(self):
        learner = "L1"
        # Skill 1 practice does not become mastery.
        p1 = self.engine.submit_attempt(operation_id="OP-P1", attempt_id="A-P1", learner_id=learner, course_id=self.course_id, item_id="P-GIT-STAGE-1", response="git add notes.txt", submitted_at=100)
        self.assertNotEqual(p1["projection"]["stage"], "MASTERED")
        self.assertEqual(self.engine.next_action(learner, self.course_id, now=100)["action_type"], "MASTERY_CHECK")

        m1 = self.engine.submit_attempt(operation_id="OP-M1", attempt_id="A-M1", learner_id=learner, course_id=self.course_id, item_id="M-GIT-STAGE-1", response="git add app.txt; git commit -m 'Feature work'", submitted_at=200)
        self.assertTrue(m1["attempt"]["correct"])
        self.assertEqual(m1["projection"]["stage"], "RETENTION_DUE")
        r1 = self.engine.submit_attempt(operation_id="OP-R1", attempt_id="A-R1", learner_id=learner, course_id=self.course_id, item_id="R-GIT-STAGE-1", response="git add later.txt; git commit -m 'Later work'", submitted_at=4000)
        self.assertEqual(r1["projection"]["stage"], "MASTERED")
        self.assertEqual(self.engine.next_action(learner, self.course_id, now=4000)["skill_id"], "S-GIT-BRANCH-MERGE")

        p2 = self.engine.submit_attempt(operation_id="OP-P2", attempt_id="A-P2", learner_id=learner, course_id=self.course_id, item_id="P-GIT-BRANCH-1", response="git switch -c feature", submitted_at=4100)
        self.assertNotEqual(p2["projection"]["stage"], "MASTERED")
        m2 = self.engine.submit_attempt(operation_id="OP-M2", attempt_id="A-M2", learner_id=learner, course_id=self.course_id, item_id="M-GIT-BRANCH-1", response="git switch -c topic; git add change.txt; git commit -m 'Add change'; git switch main; git merge topic", submitted_at=4200)
        self.assertTrue(m2["attempt"]["correct"])
        r2 = self.engine.submit_attempt(operation_id="OP-R2", attempt_id="A-R2", learner_id=learner, course_id=self.course_id, item_id="R-GIT-BRANCH-1", response="git switch -c fix; git add fix.txt; git commit -m 'Fix issue'; git switch main; git merge fix", submitted_at=8000)
        self.assertEqual(r2["projection"]["stage"], "MASTERED")
        self.assertEqual(self.engine.next_action(learner, self.course_id, now=8000)["action_type"], "COURSE_COMPLETE")

    def test_wrong_git_workflow_fails_mastery(self):
        result = self.engine.submit_attempt(
            operation_id="OP-WRONG", attempt_id="A-WRONG", learner_id="L2", course_id=self.course_id,
            item_id="M-GIT-BRANCH-1",
            response="git switch -c topic; git add change.txt; git commit -m 'Add change'; git merge topic; git switch main",
            submitted_at=500,
        )
        self.assertFalse(result["attempt"]["correct"])
        self.assertEqual(result["projection"]["stage"], "BUILDING")
        self.assertIn("MASTERY_CHECK_FAILED", result["projection"]["reason_codes"])

    def test_assisted_real_mastery_still_fails_independence(self):
        result = self.engine.submit_attempt(
            operation_id="OP-ASST", attempt_id="A-ASST", learner_id="L3", course_id=self.course_id,
            item_id="M-GIT-STAGE-1", response="git add app.txt; git commit -m 'Feature work'", submitted_at=500, assisted=True,
        )
        self.assertTrue(result["attempt"]["correct"])
        self.assertNotEqual(result["projection"]["stage"], "MASTERED")
        self.assertIn("ASSISTANCE_BREAKS_INDEPENDENCE", result["projection"]["excluded_attempts"].values())


if __name__ == "__main__":
    unittest.main()
