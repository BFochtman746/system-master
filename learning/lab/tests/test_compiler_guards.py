import copy
import os
import tempfile
import unittest

from dataclasses import asdict
from learning_lab import LearningEngine, Repository
from learning_lab.fixture import SUPPORTED_OUTCOME, build_synthetic_course


class CompilerGuardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.engine = LearningEngine(Repository(os.path.join(self.tmp.name, "lab.sqlite3")))
        self.base = asdict(build_synthetic_course("G", "Synthetic routing basics", SUPPORTED_OUTCOME))

    def tearDown(self):
        self.tmp.cleanup()

    def test_unsupported_goal_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_GOAL_FOR_SLICE"):
            self.engine.create_course_job(operation_id="X", job_id="J", goal_id="G", title="Unrelated", desired_outcome="Teach me advanced welding.")

    def test_hard_prerequisite_cycle_rejected(self):
        c = copy.deepcopy(self.base)
        c["skills"][0]["hard_prerequisite_skill_ids"] = ["S-ROUTE"]
        with self.assertRaisesRegex(ValueError, "InvalidPrerequisiteGraph"):
            self.engine._validate_course(c)

    def test_missing_lesson_coverage_rejected(self):
        c = copy.deepcopy(self.base)
        c["lessons"] = [x for x in c["lessons"] if x["skill_id"] != "S-ROUTE"]
        with self.assertRaisesRegex(ValueError, "CoverageGap:lesson"):
            self.engine._validate_course(c)

    def test_missing_evidence_path_rejected(self):
        c = copy.deepcopy(self.base)
        c["items"] = [x for x in c["items"] if x["criterion_id"] != "C-ROUTE"]
        with self.assertRaisesRegex(ValueError, "CoverageGap:evidence"):
            self.engine._validate_course(c)

    def test_incomplete_lesson_rejected(self):
        c = copy.deepcopy(self.base)
        c["lessons"][0]["explanation"] = ""
        with self.assertRaisesRegex(ValueError, "LessonDefinitionIncomplete"):
            self.engine._validate_course(c)

    def test_missing_mastery_key_rejected(self):
        c = copy.deepcopy(self.base)
        next(x for x in c["items"] if x["mode"] == "MASTERY_CHECK")["answer"] = ""
        with self.assertRaisesRegex(ValueError, "AssessmentKeyMissing"):
            self.engine._validate_course(c)


if __name__ == "__main__":
    unittest.main()
