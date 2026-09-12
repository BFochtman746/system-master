from __future__ import annotations

import os
import tempfile
import unittest

from learning_lab.assessment_governance import (
    AI_ROLE_FINALIZATION,
    ASSESSMENT_REVIEW_KIND,
    ASSESSMENT_SCORE_OBSERVATION_KIND,
    OBSERVATION_REVIEW,
    REVIEW_APPROVE,
    AssessmentGovernanceError,
    AssessmentGovernanceService,
    build_scoring_policy,
)
from learning_lab.engine import LearningEngine
from learning_lab.fixture import SUPPORTED_OUTCOME
from learning_lab.repository import Repository


class AssessmentModelGovernanceS05HardeningTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        self.engine = LearningEngine(self.repo)
        created = self.engine.create_course_job(
            operation_id="OP-COURSE-H",
            job_id="JOB-COURSE-H",
            goal_id="G-S05-H",
            title="S05 hardening",
            desired_outcome=SUPPORTED_OUTCOME,
        )
        self.course_id = created["course_id"]
        self.service = AssessmentGovernanceService(self.repo, self.engine)

    def tearDown(self):
        self.td.cleanup()

    def policy(self, *, ai=False, permitted=None):
        return build_scoring_policy(
            policy_version="S05-POLICY-H",
            rubric_version="RUBRIC-H",
            ai_scoring_role=AI_ROLE_FINALIZATION if ai else "DISALLOWED",
            permitted_assistance_conditions=permitted or ["INDEPENDENT", "AI_ASSISTED", "AUTHORIZED_ACCOMMODATION", "TOOL_PERMITTED"],
            supported_response_types=["TEXT"],
            supported_languages=["en"],
        )

    def begin_submit(self, *, policy=None, assistance="INDEPENDENT", accommodation=False, tool=False):
        attempt = self.service.begin_attempt(
            operation_id="OP-BEGIN-H",
            assessment_attempt_id="AA-H",
            learner_id="L-H",
            course_id=self.course_id,
            item_id="M-STAB-1",
            started_at=10,
            scoring_policy=policy or self.policy(),
        )
        submission = self.service.submit_attempt(
            operation_id="OP-SUB-H",
            assessment_attempt_id="AA-H",
            submission_id="SUB-H",
            response="STABLE",
            submitted_at=20,
            assistance_condition=assistance,
            accommodation_authorized=accommodation,
            tool_part_of_construct=tool,
        )
        return attempt, submission

    def human_observation(self, *, observation_id="OBS-H", correct=True):
        return self.service.record_score_observation(
            operation_id=f"OP-{observation_id}",
            observation_id=observation_id,
            assessment_attempt_id="AA-H",
            submission_id="SUB-H",
            scorer_kind="HUMAN",
            scorer_id="HUMAN-H",
            observed_at=30,
            correct=correct,
            score=1.0 if correct else 0.0,
        )

    def finalize(self, *, observation_id="OBS-H", review_id=None):
        return self.service.finalize_score(
            operation_id="OP-FINAL-H",
            result_id="RES-H",
            assessment_attempt_id="AA-H",
            submission_id="SUB-H",
            observation_ids=[observation_id],
            selected_observation_id=observation_id,
            finalized_at=40,
            review_id=review_id,
        )

    def assurance(self, attempt, *, rubric_version=None):
        return {
            "owner": "SHARED_ASSURANCE",
            "status": "APPROVED",
            "calibration_status": "PASS",
            "fairness_status": "PASS",
            "drift_status": "PASS",
            "valid_until": 1000,
            "scope": {
                "assessment_definition_digest": attempt["definition"]["definition_digest"],
                "rubric_version": rubric_version or attempt["definition"]["rubric_version"],
                "scoring_policy_version": attempt["scoring_policy"]["policy_version"],
                "model_id": "model-h",
                "model_version": "m1",
            },
        }

    def test_concurrent_or_late_second_submission_cannot_overwrite_owner_valid_attempt_state(self):
        self.begin_submit()
        before = self.repo.get_latest_object("assessment_attempt_s05", "AA-H")
        with self.assertRaisesRegex(AssessmentGovernanceError, "ASSESSMENT_ATTEMPT_NOT_OPEN"):
            self.service.submit_attempt(
                operation_id="OP-SUB-LATE",
                assessment_attempt_id="AA-H",
                submission_id="SUB-LATE",
                response="UNSTABLE",
                submitted_at=21,
            )
        after = self.repo.get_latest_object("assessment_attempt_s05", "AA-H")
        self.assertEqual(before["submission_id"], after["submission_id"])
        self.assertEqual(before["_object_version"], after["_object_version"])

    def test_assurance_for_different_rubric_does_not_transfer(self):
        attempt, _ = self.begin_submit(policy=self.policy(ai=True))
        observation = self.service.record_score_observation(
            operation_id="OP-OBS-AI-H",
            observation_id="OBS-AI-H",
            assessment_attempt_id="AA-H",
            submission_id="SUB-H",
            scorer_kind="AI",
            scorer_id="AI-H",
            observed_at=30,
            correct=True,
            score=1.0,
            model_context={
                "model_id": "model-h",
                "model_version": "m1",
                "configuration_version": "cfg-h",
                "prompt_version": "prompt-h",
            },
            assurance_standing=self.assurance(attempt, rubric_version="OTHER-RUBRIC"),
        )
        self.assertEqual(observation["standing"], OBSERVATION_REVIEW)
        self.assertIn("ASSURANCE_SCOPE_MISMATCH:rubric_version", observation["reason_codes"])

    def test_permitted_ai_assistance_is_not_automatically_misconduct(self):
        _, submission = self.begin_submit(assistance="AI_ASSISTED")
        self.assertEqual(submission["submission"]["integrity_standing"], "CLEAR")
        self.assertEqual(submission["submission"]["assistance_condition"], "AI_ASSISTED")

    def test_authorized_accommodation_can_remain_independence_eligible_after_finalization(self):
        self.begin_submit(assistance="AUTHORIZED_ACCOMMODATION", accommodation=True)
        self.human_observation()
        result = self.finalize()["result"]
        projection = self.repo.latest_projection("L-H", self.course_id, "S-STABILITY")
        self.assertIn(result["evidence_attempt_id"], projection["counted_attempt_ids"])
        self.assertNotIn(result["evidence_attempt_id"], projection["excluded_attempts"])

    def test_tool_permitted_as_part_of_construct_can_remain_independence_eligible(self):
        self.begin_submit(assistance="TOOL_PERMITTED", tool=True)
        self.human_observation()
        result = self.finalize()["result"]
        projection = self.repo.latest_projection("L-H", self.course_id, "S-STABILITY")
        self.assertIn(result["evidence_attempt_id"], projection["counted_attempt_ids"])

    def test_human_review_preserves_reason_codes_and_exact_observation_version_lineage(self):
        self.begin_submit()
        observation = self.human_observation()
        review = self.service.record_human_review(
            operation_id="OP-REV-H",
            review_id="REV-H",
            assessment_attempt_id="AA-H",
            submission_id="SUB-H",
            observation_ids=["OBS-H"],
            reviewer_role="QUALIFIED_REVIEWER",
            disposition=REVIEW_APPROVE,
            reason_codes=["MANUAL_CHECK_COMPLETE"],
            reviewed_at=35,
            adjudicated_correct=True,
            adjudicated_score=1.0,
        )
        stored_observation = self.repo.get_latest_object(ASSESSMENT_SCORE_OBSERVATION_KIND, "OBS-H")
        stored_review = self.repo.get_latest_object(ASSESSMENT_REVIEW_KIND, "REV-H")
        self.assertEqual(stored_review["reason_codes"], ["MANUAL_CHECK_COMPLETE"])
        self.assertEqual(stored_review["observation_ids"], ["OBS-H"])
        self.assertEqual(stored_observation["rubric_version"], "RUBRIC-H")
        self.assertEqual(stored_observation["scoring_policy_version"], "S05-POLICY-H")
        self.assertEqual(observation["submission_digest"], stored_observation["submission_digest"])

    def test_finalized_ai_result_preserves_model_config_prompt_and_submission_digest(self):
        attempt, submission = self.begin_submit(policy=self.policy(ai=True))
        self.service.record_score_observation(
            operation_id="OP-OBS-AI-H",
            observation_id="OBS-AI-H",
            assessment_attempt_id="AA-H",
            submission_id="SUB-H",
            scorer_kind="AI",
            scorer_id="AI-H",
            observed_at=30,
            correct=True,
            score=1.0,
            model_context={
                "model_id": "model-h",
                "model_version": "m1",
                "configuration_version": "cfg-h",
                "prompt_version": "prompt-h",
            },
            assurance_standing=self.assurance(attempt),
        )
        result = self.finalize(observation_id="OBS-AI-H")["result"]
        self.assertEqual(result["selected_model_context"]["configuration_version"], "cfg-h")
        self.assertEqual(result["selected_model_context"]["prompt_version"], "prompt-h")
        self.assertEqual(result["submission_digest"], submission["submission"]["response_digest"])


if __name__ == "__main__":
    unittest.main()
