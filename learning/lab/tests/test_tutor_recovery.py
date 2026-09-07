import os
import tempfile
import unittest

from learning_lab import GroundedLearningEngine, InjectedCrash, REAL_GIT_OUTCOME, Repository, TutorDirector


class TutorRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.td.name, "lab.sqlite3")
        self.repo = Repository(self.path)
        self.engine = GroundedLearningEngine(self.repo)
        self.created = self.engine.create_research_grounded_course_job(
            operation_id="OP-CREATE", job_id="JOB-CREATE", goal_id="G-GIT", title="Git feature branch workflow", desired_outcome=REAL_GIT_OUTCOME
        )
        self.course_id = self.created["course_id"]

    def tearDown(self):
        self.td.cleanup()

    def args(self):
        return dict(
            operation_id="OP-T", turn_id="T", session_id="S", learner_id="L",
            course_id=self.course_id, skill_id="S-GIT-STAGE-COMMIT", probe_id="TP-STAGE-1",
            response="git commit -m 'Demo'", requested_help_level=3, now=100,
        )

    def test_recovery_from_each_checkpoint_without_duplicate_turn(self):
        for phase in ("OBSERVATION_RECORDED", "DIAGNOSIS_RECORDED", "MOVE_SELECTED", "TURN_COMPLETED_BEFORE_RETURN"):
            with self.subTest(phase=phase):
                local_td = tempfile.TemporaryDirectory()
                try:
                    path = os.path.join(local_td.name, "r.sqlite3")
                    repo = Repository(path)
                    engine = GroundedLearningEngine(repo)
                    created = engine.create_research_grounded_course_job(
                        operation_id="OP-CREATE", job_id="JOB-CREATE", goal_id="G-GIT", title="Git feature branch workflow", desired_outcome=REAL_GIT_OUTCOME
                    )
                    tutor = TutorDirector(repo, engine)
                    kwargs = dict(
                        operation_id="OP-T", turn_id="T", session_id="S", learner_id="L",
                        course_id=created["course_id"], skill_id="S-GIT-STAGE-COMMIT", probe_id="TP-STAGE-1",
                        response="git commit -m 'Demo'", requested_help_level=3, now=100,
                    )
                    with self.assertRaises(InjectedCrash):
                        tutor.process_turn(**kwargs, crash_after_phase=phase)
                    restarted_repo = Repository(path)
                    restarted = TutorDirector(restarted_repo, GroundedLearningEngine(restarted_repo))
                    out = restarted.process_turn(**kwargs)
                    replay = restarted.process_turn(**kwargs)
                    self.assertEqual(out, replay)
                    self.assertEqual(restarted_repo.count_tutor_turns("S"), 1)
                finally:
                    local_td.cleanup()

    def test_changed_payload_under_same_operation_id_is_rejected(self):
        tutor = TutorDirector(self.repo, self.engine)
        tutor.process_turn(**self.args())
        changed = self.args()
        changed["response"] = "git add demo.txt"
        with self.assertRaisesRegex(ValueError, "IDEMPOTENCY_DIGEST_MISMATCH"):
            tutor.process_turn(**changed)

    def test_same_turn_id_cannot_be_reused_by_different_operation(self):
        tutor = TutorDirector(self.repo, self.engine)
        tutor.process_turn(**self.args())
        changed = self.args()
        changed["operation_id"] = "OP-T-OTHER"
        with self.assertRaises(Exception):
            tutor.process_turn(**changed)


if __name__ == "__main__":
    unittest.main()
