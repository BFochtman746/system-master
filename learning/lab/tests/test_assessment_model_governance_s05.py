from __future__ import annotations

import os
import tempfile
import unittest

from learning_lab.assessment_governance import (
    AI_ROLE_ADVISORY,
    AI_ROLE_DISALLOWED,
    AI_ROLE_FINALIZATION,
    ASSESSMENT_ATTEMPT_KIND,
    ASSESSMENT_CHALLENGE_KIND,
    ASSESSMENT_EXTERNAL_DELIVERY_KIND,
    ASSESSMENT_GOVERNANCE_VERSION,
    ASSESSMENT_RESULT_KIND,
    OBSERVATION_ADVISORY,
    OBSERVATION_BLOCKED,
    OBSERVATION_ELIGIBLE,
    OBSERVATION_REVIEW,
    REVIEW_APPROVE,
    REVIEW_REGRADE,
    AssessmentGovernanceError,
    AssessmentGovernanceService,
    build_scoring_policy,
)
from learning_lab.engine import LearningEngine
from learning_lab.fixture import SUPPORTED_OUTCOME
from learning_lab.mastery_evidence_reader import validated_attempts_for_skill
from learning_lab.repository import Repository


class AssessmentModelGovernanceS05Tests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        self.engine = LearningEngine(self.repo)
        created = self.engine.create_course_job(
            operation_id="OP-COURSE",
            job_id="JOB-COURSE",
            goal_id="G-S05",
            title="S05 controlled assessment",
            desired_outcome=SUPPORTED_OUTCOME,
        )
        self.course_id = created["course_id"]
        self.service = AssessmentGovernanceService(self.repo, self.engine)

    def tearDown(self):
        self.td.cleanup()

    def policy(
        self,
        *,
        ai_role=AI_ROLE_DISALLOWED,
        require_human_review=False,
        high_consequence=False,
        permitted=None,
        domains=None,
    ):
        return build_scoring_policy(
            policy_version="S05-POLICY-1",
            rubric_version="RUBRIC-1",
            ai_scoring_role=ai_role,
            require_assurance_for_ai=True,
            require_human_review=require_human_review,
            high_consequence=high_consequence,
            permitted_assistance_conditions=permitted or ["INDEPENDENT", "AUTHORIZED_ACCOMMODATION", "TOOL_PERMITTED"],
            supported_response_types=["TEXT"],
            supported_languages=["en"],
            supported_domain_keys=domains or [],
        )

    def begin(self, *, attempt_id="AA-1", item_id="M-STAB-1", policy=None):
        return self.service.begin_attempt(
            operation_id=f"OP-BEGIN-{attempt_id}",
            assessment_attempt_id=attempt_id,
            learner_id="L1",
            course_id=self.course_id,
            item_id=item_id,
            started_at=10,
            scoring_policy=policy or self.policy(),
            accommodation_conditions=["SCREEN_READER_ALLOWED"],
        )

    def submit(
        self,
        *,
        attempt_id="AA-1",
        submission_id="SUB-1",
        response="STABLE",
        assistance="INDEPENDENT",
        accommodation_authorized=False,
        tool_part_of_construct=False,
        response_type="TEXT",
        language="en",
        domain_key=None,
        integrity_signal=None,
    ):
        return self.service.submit_attempt(
            operation_id=f"OP-SUBMIT-{submission_id}",
            assessment_attempt_id=attempt_id,
            submission_id=submission_id,
            response=response,
            submitted_at=20,
            assistance_condition=assistance,
            accommodation_authorized=accommodation_authorized,
            tool_part_of_construct=tool_part_of_construct,
            response_type=response_type,
            language=language,
            domain_key=domain_key,
            integrity_signal=integrity_signal,
        )

    def human_observation(self, *, observation_id="OBS-H1", correct=True, score=1.0):
        return self.service.record_score_observation(
            operation_id=f"OP-{observation_id}",
            observation_id=observation_id,
            assessment_attempt_id="AA-1",
            submission_id="SUB-1",
            scorer_kind="HUMAN",
            scorer_id="REVIEWER-1",
            observed_at=30,
            correct=correct,
            score=score,
            confidence=None,
        )

    def assurance(self, attempt, *, model_version="m1", valid_until=1000, fairness="PASS", drift="PASS", calibration="PASS"):
        return {
            "owner": "SHARED_ASSURANCE",
            "standing_id": "ASR-1",
            "status": "APPROVED",
            "calibration_status": calibration,
            "fairness_status": fairness,
            "drift_status": drift,
            "valid_until": valid_until,
            "scope": {
                "assessment_definition_digest": attempt["definition"]["definition_digest"],
                "rubric_version": attempt["definition"]["rubric_version"],
                "scoring_policy_version": attempt["scoring_policy"]["policy_version"],
                "model_id": "model-a",
                "model_version": model_version,
            },
        }

    def ai_observation(
        self,
        attempt,
        *,
        observation_id="OBS-AI1",
        assurance=None,
        model_version="m1",
        correct=True,
        score=1.0,
        confidence=0.99,
        provider_metadata=None,
    ):
        return self.service.record_score_observation(
            operation_id=f"OP-{observation_id}",
            observation_id=observation_id,
            assessment_attempt_id="AA-1",
            submission_id="SUB-1",
            scorer_kind="AI",
            scorer_id="AI-SCORER-1",
            observed_at=30,
            correct=correct,
            score=score,
            confidence=confidence,
            model_context={
                "model_id": "model-a",
                "model_version": model_version,
                "configuration_version": "cfg-1",
                "prompt_version": "prompt-1",
            },
            assurance_standing=assurance,
            provider_metadata=provider_metadata,
        )

    def finalize(self, *, result_id="RES-1", observation_ids=None, selected="OBS-H1", review_id=None, supersedes=None, finalized_at=40):
        return self.service.finalize_score(
            operation_id=f"OP-FINAL-{result_id}",
            result_id=result_id,
            assessment_attempt_id="AA-1",
            submission_id="SUB-1",
            observation_ids=observation_ids or [selected],
            selected_observation_id=selected,
            finalized_at=finalized_at,
            review_id=review_id,
            supersedes_result_id=supersedes,
        )

    def test_version_is_exact_and_definition_remains_curriculum_owned(self):
        out = self.begin()
        self.assertEqual(out["governance_version"], ASSESSMENT_GOVERNANCE_VERSION)
        self.assertEqual(out["owner"], "LEARNING")
        self.assertEqual(out["definition"]["curriculum_owner"], "CURRICULUM")
        self.assertNotIn("answer", out["definition"])

    def test_begin_pins_definition_skill_criterion_rubric_and_policy_versions(self):
        out = self.begin()
        definition = out["definition"]
        self.assertEqual(definition["course_version"], 1)
        self.assertEqual(definition["skill_id"], "S-STABILITY")
        self.assertEqual(definition["criterion_id"], "C-STABILITY")
        self.assertEqual(definition["rubric_version"], "RUBRIC-1")
        self.assertEqual(definition["scoring_policy_version"], "S05-POLICY-1")
        self.assertTrue(definition["definition_digest"])

    def test_attempt_records_mode_assistance_and_accommodation_contract(self):
        out = self.begin()
        self.assertEqual(out["definition"]["mode"], "MASTERY_CHECK")
        self.assertIn("INDEPENDENT", out["scoring_policy"]["permitted_assistance_conditions"])
        self.assertEqual(out["accommodation_conditions"], ["SCREEN_READER_ALLOWED"])

    def test_begin_is_idempotent_and_changed_payload_conflicts(self):
        first = self.begin()
        replay = self.begin()
        self.assertEqual(first, replay)
        with self.assertRaises(ValueError):
            self.service.begin_attempt(
                operation_id="OP-BEGIN-AA-1",
                assessment_attempt_id="AA-1",
                learner_id="L2",
                course_id=self.course_id,
                item_id="M-STAB-1",
                started_at=10,
                scoring_policy=self.policy(),
                accommodation_conditions=["SCREEN_READER_ALLOWED"],
            )

    def test_attempt_and_submission_do_not_create_mastery_evidence(self):
        self.begin()
        self.submit()
        self.assertEqual(self.repo.count_attempts(), 0)
        self.assertIsNone(self.repo.latest_projection("L1", self.course_id, "S-STABILITY"))

    def test_submission_identity_is_distinct_and_pins_response_digest(self):
        self.begin()
        out = self.submit()
        self.assertEqual(out["submission"]["submission_id"], "SUB-1")
        self.assertEqual(out["submission"]["assessment_attempt_id"], "AA-1")
        self.assertTrue(out["submission"]["response_digest"])
        self.assertNotEqual(out["submission"]["submission_id"], out["submission"]["assessment_attempt_id"])

    def test_submission_outside_assistance_policy_requires_review_not_silent_invalidation(self):
        self.begin(policy=self.policy(permitted=["INDEPENDENT"]))
        out = self.submit(assistance="AI_ASSISTED")
        self.assertEqual(out["submission"]["integrity_standing"], "REVIEW_REQUIRED")
        self.assertIn("ASSISTANCE_OUTSIDE_POLICY_REQUIRES_REVIEW", out["submission"]["integrity_reason_codes"])

    def test_integrity_signal_is_preserved_for_review_not_auto_invalidated(self):
        self.begin()
        out = self.submit(integrity_signal="AI_DETECTOR_FLAG")
        self.assertEqual(out["submission"]["integrity_standing"], "REVIEW_REQUIRED")
        self.assertEqual(self.repo.count_attempts(), 0)

    def test_authorized_accommodation_remains_distinct_from_scaffold(self):
        self.begin()
        out = self.submit(assistance="AUTHORIZED_ACCOMMODATION", accommodation_authorized=True)
        self.assertEqual(out["submission"]["assistance_condition"], "AUTHORIZED_ACCOMMODATION")
        self.assertTrue(out["submission"]["accommodation_authorized"])

    def test_human_score_is_observation_until_finalized(self):
        self.begin()
        self.submit()
        out = self.human_observation()
        self.assertEqual(out["standing"], OBSERVATION_ELIGIBLE)
        self.assertFalse(out["finalized"])
        self.assertEqual(out["mastery_effect"], "NONE")
        self.assertEqual(self.repo.count_attempts(), 0)

    def test_ai_scoring_disallowed_policy_blocks_observation(self):
        attempt = self.begin(policy=self.policy(ai_role=AI_ROLE_DISALLOWED))
        self.submit()
        out = self.ai_observation(attempt, assurance=self.assurance(attempt))
        self.assertEqual(out["standing"], OBSERVATION_BLOCKED)
        self.assertIn("AI_SCORING_DISALLOWED_BY_POLICY", out["reason_codes"])

    def test_ai_advisory_output_cannot_masquerade_as_finalizable_score(self):
        attempt = self.begin(policy=self.policy(ai_role=AI_ROLE_ADVISORY))
        self.submit()
        out = self.ai_observation(attempt, assurance=self.assurance(attempt))
        self.assertEqual(out["standing"], OBSERVATION_ADVISORY)
        with self.assertRaisesRegex(AssessmentGovernanceError, "HUMAN_REVIEW_REQUIRED"):
            self.finalize(selected="OBS-AI1")

    def test_ai_finalization_requires_exact_model_identity(self):
        attempt = self.begin(policy=self.policy(ai_role=AI_ROLE_FINALIZATION))
        self.submit()
        out = self.service.record_score_observation(
            operation_id="OP-OBS-BAD-MODEL",
            observation_id="OBS-BAD-MODEL",
            assessment_attempt_id="AA-1",
            submission_id="SUB-1",
            scorer_kind="AI",
            scorer_id="AI-SCORER",
            observed_at=30,
            correct=True,
            model_context={"model_id": "model-a"},
            assurance_standing=self.assurance(attempt),
        )
        self.assertEqual(out["standing"], OBSERVATION_BLOCKED)
        self.assertIn("MODEL_IDENTITY_INCOMPLETE", out["reason_codes"])

    def test_ai_finalization_requires_shared_assurance_not_provider_metadata(self):
        attempt = self.begin(policy=self.policy(ai_role=AI_ROLE_FINALIZATION))
        self.submit()
        out = self.ai_observation(
            attempt,
            assurance=None,
            provider_metadata={"calibrated": True, "fair": True, "confidence": 1.0},
        )
        self.assertEqual(out["standing"], OBSERVATION_REVIEW)
        self.assertIn("ASSURANCE_STANDING_MISSING", out["reason_codes"])

    def test_assurance_scope_is_use_specific_and_model_specific(self):
        attempt = self.begin(policy=self.policy(ai_role=AI_ROLE_FINALIZATION))
        self.submit()
        bad = self.assurance(attempt, model_version="other")
        out = self.ai_observation(attempt, assurance=bad, model_version="m1")
        self.assertEqual(out["standing"], OBSERVATION_REVIEW)
        self.assertTrue(any(x.startswith("ASSURANCE_SCOPE_MISMATCH:model_version") for x in out["reason_codes"]))

    def test_stale_assurance_blocks_direct_finalization(self):
        attempt = self.begin(policy=self.policy(ai_role=AI_ROLE_FINALIZATION))
        self.submit()
        out = self.ai_observation(attempt, assurance=self.assurance(attempt, valid_until=29))
        self.assertEqual(out["standing"], OBSERVATION_REVIEW)
        self.assertIn("ASSURANCE_STALE", out["reason_codes"])

    def test_fairness_failure_blocks_direct_finalization_even_with_calibration(self):
        attempt = self.begin(policy=self.policy(ai_role=AI_ROLE_FINALIZATION))
        self.submit()
        out = self.ai_observation(attempt, assurance=self.assurance(attempt, fairness="FAIL"))
        self.assertEqual(out["standing"], OBSERVATION_REVIEW)
        self.assertIn("FAIRNESS_STATUS_NOT_ACCEPTABLE", out["reason_codes"])

    def test_drift_failure_blocks_direct_finalization(self):
        attempt = self.begin(policy=self.policy(ai_role=AI_ROLE_FINALIZATION))
        self.submit()
        out = self.ai_observation(attempt, assurance=self.assurance(attempt, drift="FAIL"))
        self.assertEqual(out["standing"], OBSERVATION_REVIEW)
        self.assertIn("DRIFT_STATUS_NOT_ACCEPTABLE", out["reason_codes"])

    def test_out_of_scope_language_or_domain_requires_review(self):
        attempt = self.begin(policy=self.policy(ai_role=AI_ROLE_FINALIZATION, domains=["token-domain"]))
        self.submit(language="fr", domain_key="other-domain")
        out = self.ai_observation(attempt, assurance=self.assurance(attempt))
        self.assertEqual(out["standing"], OBSERVATION_REVIEW)
        self.assertIn("LANGUAGE_OUT_OF_SCOPE", out["reason_codes"])
        self.assertIn("DOMAIN_OUT_OF_SCOPE", out["reason_codes"])

    def test_valid_assured_ai_observation_is_finalization_eligible(self):
        attempt = self.begin(policy=self.policy(ai_role=AI_ROLE_FINALIZATION))
        self.submit()
        out = self.ai_observation(attempt, assurance=self.assurance(attempt))
        self.assertEqual(out["standing"], OBSERVATION_ELIGIBLE)
        self.assertIn("ASSURANCE_SCOPE_VERIFIED", out["reason_codes"])

    def test_model_confidence_alone_never_authorizes_finalization(self):
        attempt = self.begin(policy=self.policy(ai_role=AI_ROLE_FINALIZATION))
        self.submit()
        out = self.ai_observation(attempt, assurance=None, confidence=1.0)
        self.assertEqual(out["standing"], OBSERVATION_REVIEW)
        with self.assertRaisesRegex(AssessmentGovernanceError, "HUMAN_REVIEW_REQUIRED"):
            self.finalize(selected="OBS-AI1")

    def test_material_scorer_disagreement_requires_review_not_averaging(self):
        self.begin()
        self.submit()
        self.human_observation(observation_id="OBS-H1", correct=True, score=1.0)
        self.human_observation(observation_id="OBS-H2", correct=False, score=0.0)
        with self.assertRaisesRegex(AssessmentGovernanceError, "HUMAN_REVIEW_REQUIRED"):
            self.finalize(observation_ids=["OBS-H1", "OBS-H2"], selected="OBS-H1")

    def test_high_consequence_policy_requires_human_review(self):
        attempt = self.begin(policy=self.policy(ai_role=AI_ROLE_FINALIZATION, high_consequence=True))
        self.submit()
        self.ai_observation(attempt, assurance=self.assurance(attempt))
        with self.assertRaisesRegex(AssessmentGovernanceError, "HUMAN_REVIEW_REQUIRED"):
            self.finalize(selected="OBS-AI1")

    def test_human_review_preserves_original_observation_lineage(self):
        attempt = self.begin(policy=self.policy(ai_role=AI_ROLE_FINALIZATION, high_consequence=True))
        self.submit()
        self.ai_observation(attempt, assurance=self.assurance(attempt))
        review = self.service.record_human_review(
            operation_id="OP-REVIEW-1",
            review_id="REV-1",
            assessment_attempt_id="AA-1",
            submission_id="SUB-1",
            observation_ids=["OBS-AI1"],
            reviewer_role="QUALIFIED_REVIEWER",
            disposition=REVIEW_APPROVE,
            reason_codes=["HIGH_CONSEQUENCE_REVIEW_COMPLETE"],
            reviewed_at=35,
            adjudicated_correct=True,
            adjudicated_score=1.0,
        )
        self.assertTrue(review["preserves_original_observations"])
        self.assertEqual(review["observation_ids"], ["OBS-AI1"])
        self.assertFalse(review["chain_of_thought_required"])

    def test_owner_valid_finalization_creates_evidence_not_peer_mastery_truth(self):
        self.begin()
        self.submit()
        self.human_observation()
        out = self.finalize()
        result = out["result"]
        self.assertEqual(result["score_status"], "FINALIZED_OWNER_VALID")
        self.assertEqual(result["mastery_effect"], "EVIDENCE_INPUT_ONLY")
        self.assertEqual(out["mastery_authority"], "LEARNING_ENGINE_S03")
        self.assertEqual(self.repo.count_attempts(), 1)
        self.assertIsNotNone(self.repo.latest_projection("L1", self.course_id, "S-STABILITY"))

    def test_finalization_binds_attempt_submission_rubric_policy_and_scorer(self):
        self.begin()
        self.submit()
        self.human_observation()
        result = self.finalize()["result"]
        self.assertEqual(result["assessment_attempt_id"], "AA-1")
        self.assertEqual(result["submission_id"], "SUB-1")
        self.assertEqual(result["rubric_version"], "RUBRIC-1")
        self.assertEqual(result["scoring_policy_version"], "S05-POLICY-1")
        self.assertEqual(result["selected_scorer_id"], "REVIEWER-1")

    def test_ai_finalized_result_preserves_model_and_assurance_context(self):
        attempt = self.begin(policy=self.policy(ai_role=AI_ROLE_FINALIZATION))
        self.submit()
        self.ai_observation(attempt, assurance=self.assurance(attempt))
        result = self.finalize(selected="OBS-AI1")["result"]
        self.assertEqual(result["selected_model_context"]["model_version"], "m1")
        self.assertEqual(result["selected_assurance_standing"]["owner"], "SHARED_ASSURANCE")
        self.assertIn("AI_SCORER_LINEAGE_PRESERVED", result["reason_codes"])

    def test_finalization_is_exact_replay_and_does_not_duplicate_evidence(self):
        self.begin()
        self.submit()
        self.human_observation()
        first = self.finalize()
        count = self.repo.count_attempts()
        replay = self.finalize()
        self.assertEqual(first, replay)
        self.assertEqual(self.repo.count_attempts(), count)

    def test_changed_finalization_payload_conflicts(self):
        self.begin()
        self.submit()
        self.human_observation()
        self.finalize()
        with self.assertRaises(AssessmentGovernanceError):
            self.service.finalize_score(
                operation_id="OP-FINAL-RES-1",
                result_id="RES-1",
                assessment_attempt_id="AA-1",
                submission_id="SUB-1",
                observation_ids=["OBS-H1"],
                selected_observation_id="OBS-H1",
                finalized_at=41,
            )

    def test_result_explanation_is_bounded_and_has_no_hidden_reasoning_dependency(self):
        self.begin()
        self.submit()
        self.human_observation()
        explanation = self.finalize()["result"]["explanation"]
        self.assertEqual(explanation["chain_of_thought"], None)
        self.assertIn("reason_codes", explanation)
        self.assertIn("rubric_version", explanation)

    def test_challenge_preserves_historical_result_and_only_opens_review(self):
        self.begin()
        self.submit()
        self.human_observation()
        before = self.finalize()["result"]
        challenge = self.service.record_challenge(
            operation_id="OP-CHALLENGE",
            challenge_id="CH-1",
            result_id="RES-1",
            learner_id="L1",
            reason_codes=["LEARNER_DISPUTES_SCORE"],
            raised_at=50,
        )
        after = self.repo.get_latest_object(ASSESSMENT_RESULT_KIND, "RES-1")
        self.assertEqual(challenge["state"], "PENDING_REVIEW")
        self.assertFalse(challenge["historical_result_mutated"])
        self.assertEqual(before["correct"], after["correct"])

    def test_regrade_requires_governed_successor_authorization(self):
        self.begin()
        self.submit()
        self.human_observation(observation_id="OBS-H1", correct=False, score=0.0)
        self.finalize(selected="OBS-H1")
        self.human_observation(observation_id="OBS-H2", correct=True, score=1.0)
        with self.assertRaisesRegex(AssessmentGovernanceError, "HUMAN_REVIEW_REQUIRED"):
            self.finalize(result_id="RES-2", selected="OBS-H2", supersedes="RES-1", finalized_at=60)

    def test_regrade_preserves_old_result_but_successor_becomes_active_mastery_evidence(self):
        self.begin()
        self.submit()
        self.human_observation(observation_id="OBS-H1", correct=False, score=0.0)
        first = self.finalize(selected="OBS-H1")["result"]
        self.human_observation(observation_id="OBS-H2", correct=True, score=1.0)
        self.service.record_human_review(
            operation_id="OP-REGRADE-REV",
            review_id="REV-REGRADE",
            assessment_attempt_id="AA-1",
            submission_id="SUB-1",
            observation_ids=["OBS-H2"],
            reviewer_role="QUALIFIED_REVIEWER",
            disposition=REVIEW_REGRADE,
            reason_codes=["CHALLENGE_UPHELD"],
            reviewed_at=55,
            adjudicated_correct=True,
            adjudicated_score=1.0,
        )
        second = self.finalize(
            result_id="RES-2",
            selected="OBS-H2",
            review_id="REV-REGRADE",
            supersedes="RES-1",
            finalized_at=60,
        )["result"]
        old = self.repo.get_latest_object(ASSESSMENT_RESULT_KIND, "RES-1")
        self.assertEqual(old["result_id"], "RES-1")
        self.assertEqual(second["supersedes_result_id"], "RES-1")
        active = validated_attempts_for_skill(self.repo, "L1", self.course_id, "S-STABILITY")
        self.assertEqual([x["attempt_id"] for x in active], [second["evidence_attempt_id"]])
        self.assertNotEqual(first["evidence_attempt_id"], second["evidence_attempt_id"])

    def test_external_delivery_is_pending_and_cannot_become_canonical_score(self):
        self.begin()
        self.submit()
        delivery = self.service.record_external_score_delivery(
            operation_id="OP-EXT-1",
            delivery_id="DEL-1",
            provider_id="provider-x",
            assessment_attempt_id="AA-1",
            submission_id="SUB-1",
            received_at=30,
            provider_payload={"score": 1.0, "confidence": 1.0},
        )
        self.assertEqual(delivery["standing"], "PENDING_REVIEW")
        self.assertFalse(delivery["canonical_score_created"])
        self.assertFalse(delivery["transport_success_is_finalization"])
        self.assertEqual(self.repo.count_attempts(), 0)

    def test_duplicate_external_delivery_does_not_create_duplicate_semantic_score(self):
        self.begin()
        self.submit()
        first = self.service.record_external_score_delivery(
            operation_id="OP-EXT-1",
            delivery_id="DEL-1",
            provider_id="provider-x",
            assessment_attempt_id="AA-1",
            submission_id="SUB-1",
            received_at=30,
            provider_payload={"score": 1.0},
        )
        replay = self.service.record_external_score_delivery(
            operation_id="OP-EXT-2",
            delivery_id="DEL-1",
            provider_id="provider-x",
            assessment_attempt_id="AA-1",
            submission_id="SUB-1",
            received_at=30,
            provider_payload={"score": 1.0},
        )
        self.assertEqual(first["provider_payload_digest"], replay["provider_payload_digest"])
        self.assertEqual(self.repo.count_objects(ASSESSMENT_EXTERNAL_DELIVERY_KIND), 1)

    def test_attempt_state_reconstructs_after_repository_restart(self):
        self.begin()
        self.submit()
        reopened = Repository(self.repo.path)
        latest = reopened.get_latest_object(ASSESSMENT_ATTEMPT_KIND, "AA-1")
        self.assertEqual(latest["state"], "SUBMITTED")
        self.assertEqual(latest["submission_id"], "SUB-1")

    def test_scoring_policy_cannot_use_provider_metadata_as_assurance_or_confidence_as_authority(self):
        policy = self.policy(ai_role=AI_ROLE_FINALIZATION)
        self.assertFalse(policy["provider_metadata_is_assurance"])
        self.assertFalse(policy["model_confidence_can_finalize"])
        self.assertFalse(policy["ai_detector_can_invalidate"])
        self.assertEqual(policy["external_score_ingress"], "FAIL_CLOSED")

    def test_finalized_score_remains_evidence_input_and_not_psychometric_or_effectiveness_claim(self):
        self.begin()
        self.submit()
        self.human_observation()
        result = self.finalize()["result"]
        self.assertEqual(result["mastery_effect"], "EVIDENCE_INPUT_ONLY")
        self.assertNotIn("psychometric_validity", result)
        self.assertNotIn("educational_effectiveness", result)


if __name__ == "__main__":
    unittest.main()
