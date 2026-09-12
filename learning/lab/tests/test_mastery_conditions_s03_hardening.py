import os
import tempfile
import unittest

from learning_lab.engine import LearningEngine
from learning_lab.fixture import SUPPORTED_OUTCOME
from learning_lab.mastery_conditions import (
    ASSISTANCE_ACCOMMODATION,
    ASSISTANCE_UNKNOWN,
    evaluate_mastery_conditions,
)
from learning_lab.repository import Repository


def evidence_attempt(*, assistance_condition, accommodation_authorized=False):
    return {
        "attempt_id": "m-hardening",
        "learner_id": "L1",
        "course_id": "C1",
        "skill_id": "S1",
        "criterion_id": "CR1",
        "item_id": "I1",
        "item_family_id": "F1",
        "mode": "MASTERY_CHECK",
        "correct": True,
        "assisted": assistance_condition != "INDEPENDENT",
        "assistance_condition": assistance_condition,
        "accommodation_authorized": accommodation_authorized,
        "answer_revealed_before_commit": False,
        "submitted_at": 100,
        "evidence_standing": "CURRENT",
    }


class S03HardeningTests(unittest.TestCase):
    def test_unrecognized_assistance_fails_closed_to_unknown(self):
        result = evaluate_mastery_conditions(
            [evidence_attempt(assistance_condition="UNRECOGNIZED_ASSISTANCE")],
            retention_required=False,
        )
        self.assertEqual(ASSISTANCE_UNKNOWN, result["assistance_conditions"]["m-hardening"])
        self.assertEqual("UNKNOWN", result["gate_states"]["INDEPENDENCE"])
        self.assertNotEqual("MASTERED", result["stage"])
        self.assertIn("ASSISTANCE_UNKNOWN", result["uncertainty"]["reason_codes"])

    def test_unverified_accommodation_cannot_close_mastery(self):
        result = evaluate_mastery_conditions(
            [
                evidence_attempt(
                    assistance_condition=ASSISTANCE_ACCOMMODATION,
                    accommodation_authorized=False,
                )
            ],
            retention_required=False,
        )
        self.assertEqual("SATISFIED", result["gate_states"]["CRITERION_PERFORMANCE"])
        self.assertEqual("SATISFIED", result["gate_states"]["INDEPENDENCE"])
        self.assertNotEqual("MASTERED", result["stage"])
        self.assertIn(
            "ACCOMMODATION_AUTHORIZATION_UNVERIFIED",
            result["evidence_coverage"]["interpretation_blockers"],
        )
        self.assertIn(
            "ACCOMMODATION_AUTHORIZATION_UNVERIFIED",
            result["uncertainty"]["reason_codes"],
        )

    def test_mastery_reprojection_excludes_future_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Repository(os.path.join(tmp, "learning.db"))
            engine = LearningEngine(repo)
            created = engine.create_course_job(
                operation_id="create-hardening",
                job_id="job-hardening",
                goal_id="G-hardening",
                title="Hardening",
                desired_outcome=SUPPORTED_OUTCOME,
            )
            course = engine.course(created["course_id"])
            item = next(item for item in course["items"] if item["mode"] == "MASTERY_CHECK")
            criterion = next(
                criterion
                for criterion in course["criteria"]
                if criterion["criterion_id"] == item["criterion_id"]
            )
            engine.submit_attempt(
                operation_id="future-attempt-op",
                attempt_id="future-attempt",
                learner_id="L-hardening",
                course_id=created["course_id"],
                item_id=item["item_id"],
                response=item["answer"],
                submitted_at=100,
            )
            projection = engine.reproject(
                "L-hardening",
                created["course_id"],
                criterion["skill_id"],
                now=50,
            )
            self.assertEqual("INSUFFICIENT_EVIDENCE", projection["stage"])
            self.assertEqual([], projection["counted_attempt_ids"])
            self.assertEqual(["future-attempt"], projection["future_attempt_ids_excluded"])
            self.assertEqual(50, projection["projection_as_of"])


if __name__ == "__main__":
    unittest.main()
