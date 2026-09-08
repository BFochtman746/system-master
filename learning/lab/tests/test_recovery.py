import os
import tempfile
import unittest

from learning_lab import InjectedCrash, LearningEngine, Repository


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, "lab.sqlite3")

    def tearDown(self):
        self.tmp.cleanup()

    def test_course_job_crash_recover_retry_no_duplicate_course(self):
        repo = Repository(self.path)
        engine = LearningEngine(repo)
        with self.assertRaises(InjectedCrash):
            engine.create_course_job(operation_id="OP-C", job_id="JOB-C", goal_id="G1", title="T", desired_outcome="Classify token stability and select the correct route independently.", crash_after_phase="COURSE_COMPILED")
        self.assertEqual(1, repo.count_objects("course"))
        job = repo.get_job("JOB-C")
        self.assertEqual("COURSE_COMPILED", job["phase"])

        # New process/repository instance simulates restart.
        repo2 = Repository(self.path)
        engine2 = LearningEngine(repo2)
        result = engine2.create_course_job(operation_id="OP-C", job_id="JOB-C", goal_id="G1", title="T", desired_outcome="Classify token stability and select the correct route independently.")
        self.assertEqual("READY_FOR_REVIEW", result["state"])
        self.assertEqual(1, repo2.count_objects("course"))
        self.assertEqual("SUCCEEDED", repo2.get_job("JOB-C")["state"])

        replay = engine2.create_course_job(operation_id="OP-C", job_id="JOB-C", goal_id="G1", title="T", desired_outcome="Classify token stability and select the correct route independently.")
        self.assertEqual(result, replay)
        self.assertEqual(1, repo2.count_objects("course"))

    def test_same_operation_id_different_payload_conflicts(self):
        repo = Repository(self.path)
        engine = LearningEngine(repo)
        engine.create_course_job(operation_id="OP-C", job_id="JOB-C", goal_id="G1", title="T", desired_outcome="Classify token stability and select the correct route independently.")
        with self.assertRaisesRegex(ValueError, "IDEMPOTENCY_DIGEST_MISMATCH"):
            engine.create_course_job(operation_id="OP-C", job_id="JOB-C", goal_id="G1", title="CHANGED", desired_outcome="Classify token stability and select the correct route independently.")

    def test_attempt_replay_is_idempotent(self):
        repo = Repository(self.path)
        engine = LearningEngine(repo)
        course_id = engine.create_course_job(operation_id="OP-C", job_id="JOB-C", goal_id="G1", title="T", desired_outcome="Classify token stability and select the correct route independently.")["course_id"]
        first = engine.submit_attempt(operation_id="OP-A", attempt_id="A1", learner_id="L", course_id=course_id, item_id="P-STAB-1", response="STABLE", submitted_at=10)
        replay = engine.submit_attempt(operation_id="OP-A", attempt_id="A1", learner_id="L", course_id=course_id, item_id="P-STAB-1", response="STABLE", submitted_at=10)
        self.assertEqual(first, replay)
        self.assertEqual(1, len(repo.attempts_for_skill("L", course_id, "S-STABILITY")))


if __name__ == "__main__":
    unittest.main()
