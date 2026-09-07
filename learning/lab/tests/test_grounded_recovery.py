import os
import tempfile
import unittest

from learning_lab import GroundedLearningEngine, InjectedCrash, REAL_GIT_OUTCOME, Repository
from learning_lab.real_course import DeterministicModelAdapter, FrozenResearchPort


class CountingResearch(FrozenResearchPort):
    def __init__(self): self.calls = 0
    def research(self, desired_outcome):
        self.calls += 1
        return super().research(desired_outcome)


class CountingModel(DeterministicModelAdapter):
    def __init__(self): self.calls = 0
    def generate_course(self, **kwargs):
        self.calls += 1
        return super().generate_course(**kwargs)


class GroundedRecoveryTests(unittest.TestCase):
    def test_crash_after_research_reloads_checkpoint_without_research_repeat(self):
        with tempfile.TemporaryDirectory() as td:
            path = os.path.join(td, "lab.sqlite3")
            r = CountingResearch(); m = CountingModel()
            engine = GroundedLearningEngine(Repository(path), research_port=r, model_port=m)
            with self.assertRaises(InjectedCrash):
                engine.create_research_grounded_course_job(operation_id="OP", job_id="JOB", goal_id="G", title="Git", desired_outcome=REAL_GIT_OUTCOME, crash_after_phase="RESEARCH_FROZEN")
            self.assertEqual(r.calls, 1); self.assertEqual(m.calls, 0)
            restarted = GroundedLearningEngine(Repository(path), research_port=r, model_port=m)
            out = restarted.create_research_grounded_course_job(operation_id="OP", job_id="JOB", goal_id="G", title="Git", desired_outcome=REAL_GIT_OUTCOME)
            self.assertEqual(r.calls, 1)
            self.assertEqual(m.calls, 1)
            self.assertEqual(out["validation_status"], "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED")

    def test_crash_after_validation_reloads_generation_without_model_repeat(self):
        with tempfile.TemporaryDirectory() as td:
            path = os.path.join(td, "lab.sqlite3")
            r = CountingResearch(); m = CountingModel()
            engine = GroundedLearningEngine(Repository(path), research_port=r, model_port=m)
            with self.assertRaises(InjectedCrash):
                engine.create_research_grounded_course_job(operation_id="OP", job_id="JOB", goal_id="G", title="Git", desired_outcome=REAL_GIT_OUTCOME, crash_after_phase="COURSE_GENERATED_VALIDATED")
            self.assertEqual(r.calls, 1); self.assertEqual(m.calls, 1)
            restarted = GroundedLearningEngine(Repository(path), research_port=r, model_port=m)
            out = restarted.create_research_grounded_course_job(operation_id="OP", job_id="JOB", goal_id="G", title="Git", desired_outcome=REAL_GIT_OUTCOME)
            self.assertEqual(r.calls, 1)
            self.assertEqual(m.calls, 1)
            self.assertEqual(Repository(path).count_objects("course"), 1)
            self.assertEqual(Repository(path).count_objects("course_validation"), 1)
            self.assertEqual(out["validation_status"], "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED")

    def test_create_replay_is_idempotent(self):
        with tempfile.TemporaryDirectory() as td:
            repo = Repository(os.path.join(td, "lab.sqlite3"))
            engine = GroundedLearningEngine(repo)
            args = dict(operation_id="OP", job_id="JOB", goal_id="G", title="Git", desired_outcome=REAL_GIT_OUTCOME)
            first = engine.create_research_grounded_course_job(**args)
            second = engine.create_research_grounded_course_job(**args)
            self.assertEqual(first, second)
            self.assertEqual(repo.count_objects("course"), 1)
            self.assertEqual(repo.count_objects("research_dossier"), 1)


if __name__ == "__main__":
    unittest.main()
