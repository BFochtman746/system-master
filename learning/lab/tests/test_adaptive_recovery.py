import os
import tempfile
import unittest

from learning_lab import AdaptiveLearningEngine, InjectedCrash, MultiSessionDirector, REAL_GIT_OUTCOME, Repository


class AdaptiveRecoveryTests(unittest.TestCase):
    def build(self, path):
        repo = Repository(path)
        engine = AdaptiveLearningEngine(repo)
        created = engine.create_research_grounded_course_job(
            operation_id="OP-CREATE", job_id="JOB-CREATE", goal_id="G-GIT",
            title="Git feature branch workflow", desired_outcome=REAL_GIT_OUTCOME,
        )
        return repo, engine, MultiSessionDirector(repo, engine), created

    def test_director_recovery_from_each_checkpoint_without_duplicate_decision(self):
        for phase in ("SESSION_BOUND", "PROJECTION_SNAPSHOTTED", "ACTION_SELECTED", "DECISION_COMPLETED_BEFORE_RETURN"):
            with self.subTest(phase=phase):
                with tempfile.TemporaryDirectory() as td:
                    path = os.path.join(td, "lab.sqlite3")
                    repo, engine, director, created = self.build(path)
                    director.start_session(operation_id="OP-S", session_id="S", learner_id="L", course_id=created["course_id"], started_at=0)
                    kwargs = dict(operation_id="OP-D", decision_id="D", session_id="S", learner_id="L", course_id=created["course_id"], now=1)
                    with self.assertRaises(InjectedCrash):
                        director.plan_next(**kwargs, crash_after_phase=phase)
                    restarted_repo = Repository(path)
                    restarted_engine = AdaptiveLearningEngine(restarted_repo)
                    restarted = MultiSessionDirector(restarted_repo, restarted_engine)
                    out = restarted.plan_next(**kwargs)
                    replay = restarted.plan_next(**kwargs)
                    self.assertEqual(out, replay)
                    self.assertEqual(restarted_repo.count_director_decisions(), 1)

    def test_changed_payload_under_same_director_operation_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            repo, engine, director, created = self.build(os.path.join(td, "lab.sqlite3"))
            director.start_session(operation_id="OP-S", session_id="S", learner_id="L", course_id=created["course_id"], started_at=0)
            director.plan_next(operation_id="OP-D", decision_id="D", session_id="S", learner_id="L", course_id=created["course_id"], now=1)
            with self.assertRaisesRegex(ValueError, "IDEMPOTENCY_DIGEST_MISMATCH"):
                director.plan_next(operation_id="OP-D", decision_id="D", session_id="S", learner_id="L", course_id=created["course_id"], now=2)

    def test_session_start_is_idempotent_and_identity_mismatch_fails(self):
        with tempfile.TemporaryDirectory() as td:
            repo, engine, director, created = self.build(os.path.join(td, "lab.sqlite3"))
            a = director.start_session(operation_id="OP-S", session_id="S", learner_id="L", course_id=created["course_id"], started_at=0)
            b = director.start_session(operation_id="OP-S", session_id="S", learner_id="L", course_id=created["course_id"], started_at=0)
            self.assertEqual(a, b)
            with self.assertRaisesRegex(ValueError, "IDEMPOTENCY_DIGEST_MISMATCH"):
                director.start_session(operation_id="OP-S", session_id="S", learner_id="OTHER", course_id=created["course_id"], started_at=0)


if __name__ == "__main__":
    unittest.main()
