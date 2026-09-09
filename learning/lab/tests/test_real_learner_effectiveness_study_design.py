from __future__ import annotations

import copy
import unittest

from learning_lab.real_learner_effectiveness_study_design import (
    REAL_LEARNER_EFFECTIVENESS_STUDY_DESIGN_VERSION,
    RealLearnerEffectivenessStudyDesignError,
    validate_effectiveness_study_design,
)


class RealLearnerEffectivenessStudyDesignTests(unittest.TestCase):
    def _plan(self, claim_target: str = "CAUSAL_EFFECTIVENESS"):
        causal = claim_target == "CAUSAL_EFFECTIVENESS"
        return {
            "contract_version": REAL_LEARNER_EFFECTIVENESS_STUDY_DESIGN_VERSION,
            "study_id": "LEARNING-EFFECTIVENESS-STUDY-001",
            "claim_target": claim_target,
            "intervention": {
                "subject_sha": "e" * 40,
                "runtime_binding_digest": "1" * 64,
            },
            "protocol": {
                "version": "LEARNING-EFFECTIVENESS-PROTOCOL-V1",
                "protocol_digest": "2" * 64,
                "analysis_plan_digest": "3" * 64,
                "frozen_at": "2026-09-09T03:00:00Z",
                "first_outcome_access_at": None,
                "amendment_policy": "VERSIONED_AUDIT_TRAIL",
            },
            "governance": {
                "status": "APPROVED",
                "authority_ref": "EXTERNAL-GOVERNANCE-DECISION-001",
                "software_self_approved": False,
            },
            "population": {
                "recruitment_frame": "Prespecified eligible adult volunteer learner frame",
                "inclusion_criteria": ["Meets prespecified age and language criteria"],
                "exclusion_criteria": ["Prior exposure above the prespecified ceiling"],
                "site_plan": ["SITE-001"],
            },
            "assignment": {
                "method": "RANDOMIZED" if causal else "NONE",
                "unit": "INDIVIDUAL",
                "generation_and_concealment_ref": "RANDOMIZATION-PLAN-001" if causal else "NOT_APPLICABLE",
            },
            "analysis_unit": "INDIVIDUAL",
            "comparison": {
                "present": causal,
                "description": "Prespecified comparator learning experience" if causal else "NOT_APPLICABLE",
                "contamination_controls": ["Separate intervention access"] if causal else [],
            },
            "sample_size": {
                "target_units": 40 if causal else 12,
                "basis": "POWER_OR_PRECISION" if causal else "FEASIBILITY_OBJECTIVES",
                "rationale_ref": "SAMPLE-SIZE-RATIONALE-001",
                "assumptions_frozen": True,
                "progression_criteria": [] if causal else ["Recruitment and retention feasibility threshold"],
            },
            "primary_outcome": {
                "outcome_id": "OUTCOME-INDEPENDENT-TRANSFER",
                "construct": "Independent novel transfer performance",
                "timepoint": "Prespecified post-intervention transfer window",
                "intended_interpretation": "Evidence of independent application to a novel task family",
                "measure_version": "TRANSFER-MEASURE-V1",
                "scoring_version": "TRANSFER-SCORING-V1",
                "validity_evidence_ref": "VALIDITY-USE-ARGUMENT-001",
                "reliability_or_scoring_evidence_ref": "SCORING-RELIABILITY-001",
                "overalignment_review_ref": "OVERALIGNMENT-REVIEW-001",
                "independent_assessment": causal,
            },
            "attrition": {
                "denominator": "ALL_ASSIGNED_OR_ENROLLED_REQUIRED_BY_DESIGN",
                "missing_data_strategy": "Prespecified conservative missing-outcome strategy",
                "reasons_preserved": True,
                "post_outcome_exclusion_rule_predeclared": True,
            },
            "baseline": {
                "covariates": ["Prespecified baseline performance"],
                "adjustment_strategy": "ANCOVA_PRESPECIFIED" if causal else "NONE",
                "equivalence_assessment_plan": "Report prespecified baseline descriptive balance",
            },
            "identity_independence": {
                "unique_human_authority_ref": "SEPARATE-IDENTITY-REGISTRY-001" if causal else None,
                "analysis_identity_separated": True,
                "assistance_contamination_controls": [
                    "Independent tasks prohibit AI/search/docs/person/answer-key assistance"
                ],
                "assessor_independence": "Scoring authority isolated from tutor/answer reveal path",
            },
            "analysis": {
                "estimand": "Mean between-group difference on prespecified primary outcome",
                "effect_measure": "STANDARDIZED_MEAN_DIFFERENCE" if causal else "DESCRIPTIVE_FEASIBILITY_ESTIMATES",
                "uncertainty_reporting": "CONFIDENCE_INTERVAL" if causal else "DESCRIPTIVE_INTERVALS",
                "multiplicity_policy": "Single primary outcome; secondary outcomes identified separately",
                "subgroup_policy": "PRESPECIFIED_ONLY" if causal else "NO_EFFECT_SUBGROUP_TESTING",
                "cluster_strategy": "NOT_CLUSTERED",
                "analysis_population": "INTENTION_TO_TREAT" if causal else "ALL_ENROLLED_WITH_FLOW_ACCOUNTING",
            },
            "stopping": {
                "rule": "No outcome-driven stopping; any safety/governance stop is documented",
                "unplanned_outcome_peeking_allowed": False,
            },
            "privacy": {
                "direct_pii_in_analysis": False,
                "raw_response_in_analysis": False,
                "identity_linkage_separate": True,
                "retention_policy_ref": "PILOT-EVIDENCE-RETENTION-POLICY-001",
            },
            "reporting": {
                "participant_flow": True,
                "attrition_by_group": True,
                "protocol_deviations": True,
                "all_prespecified_outcomes": True,
            },
        }

    def test_valid_feasibility_design_is_ready_only_for_feasibility(self):
        result = validate_effectiveness_study_design(self._plan("FEASIBILITY"))
        self.assertEqual(result["design_standing"], "DESIGN_READY_FOR_FEASIBILITY_STUDY")
        self.assertEqual(result["claim_target"], "FEASIBILITY")
        self.assertFalse(result["claims"]["learning_effectiveness_proven"])
        self.assertFalse(result["claims"]["causal_effect_proven"])
        self.assertFalse(result["sample_size"]["statistical_adequacy_independently_verified"])

    def test_valid_randomized_causal_design_does_not_claim_a_result(self):
        result = validate_effectiveness_study_design(self._plan())
        self.assertEqual(result["design_standing"], "DESIGN_READY_FOR_RANDOMIZED_EFFECTIVENESS_STUDY")
        self.assertEqual(result["assignment"]["method"], "RANDOMIZED")
        self.assertTrue(result["comparison"]["comparator_present"])
        self.assertFalse(result["claims"]["study_executed"])
        self.assertFalse(result["claims"]["causal_effect_proven"])
        self.assertFalse(result["claims"]["population_generalization_proven"])
        self.assertFalse(result["claims"]["external_standard_compliance_proven"])

    def test_v1_causal_design_rejects_quasi_experimental_substitution(self):
        plan = self._plan()
        plan["assignment"]["method"] = "QUASI_EXPERIMENTAL"
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyDesignError, "V1_CAUSAL_REQUIRES_RANDOMIZED"):
            validate_effectiveness_study_design(plan)

    def test_causal_design_requires_comparator(self):
        plan = self._plan()
        plan["comparison"]["present"] = False
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyDesignError, "CAUSAL_COMPARATOR_REQUIRED"):
            validate_effectiveness_study_design(plan)

    def test_feasibility_cannot_use_power_basis_as_effectiveness_shortcut(self):
        plan = self._plan("FEASIBILITY")
        plan["sample_size"]["basis"] = "POWER_OR_PRECISION"
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyDesignError, "FEASIBILITY_SAMPLE_BASIS_INVALID"):
            validate_effectiveness_study_design(plan)

    def test_feasibility_requires_progression_criteria(self):
        plan = self._plan("FEASIBILITY")
        plan["sample_size"]["progression_criteria"] = []
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyDesignError, "FEASIBILITY_PROGRESSION_CRITERIA_REQUIRED"):
            validate_effectiveness_study_design(plan)

    def test_causal_design_requires_power_or_precision_basis(self):
        plan = self._plan()
        plan["sample_size"]["basis"] = "ARBITRARY_N"
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyDesignError, "CAUSAL_SAMPLE_BASIS_INVALID"):
            validate_effectiveness_study_design(plan)

    def test_analysis_plan_cannot_be_frozen_after_first_outcome_access(self):
        plan = self._plan()
        plan["protocol"]["first_outcome_access_at"] = "2026-09-09T02:59:59Z"
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyDesignError, "ANALYSIS_PLAN_NOT_PROSPECTIVE"):
            validate_effectiveness_study_design(plan)

    def test_pending_governance_cannot_be_self_promoted(self):
        plan = self._plan()
        plan["governance"]["status"] = "PENDING"
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyDesignError, "GOVERNANCE_NOT_RESOLVED"):
            validate_effectiveness_study_design(plan)

    def test_software_cannot_self_approve_external_governance(self):
        plan = self._plan()
        plan["governance"]["software_self_approved"] = True
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyDesignError, "SOFTWARE_CANNOT_SELF_APPROVE"):
            validate_effectiveness_study_design(plan)

    def test_causal_design_requires_separate_unique_human_authority(self):
        plan = self._plan()
        plan["identity_independence"]["unique_human_authority_ref"] = None
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyDesignError, "CAUSAL_UNIQUE_HUMAN_AUTHORITY_REQUIRED"):
            validate_effectiveness_study_design(plan)

    def test_attrition_denominator_cannot_be_redefined_after_assignment(self):
        plan = self._plan()
        plan["attrition"]["denominator"] = "COMPLETERS_ONLY"
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyDesignError, "ATTRITION_DENOMINATOR_INVALID"):
            validate_effectiveness_study_design(plan)

    def test_primary_outcome_requires_validity_reliability_and_overalignment_evidence(self):
        for field in (
            "validity_evidence_ref",
            "reliability_or_scoring_evidence_ref",
            "overalignment_review_ref",
        ):
            plan = self._plan()
            plan["primary_outcome"][field] = ""
            with self.subTest(field=field):
                with self.assertRaisesRegex(RealLearnerEffectivenessStudyDesignError, "PRIMARY_OUTCOME_FIELD_REQUIRED"):
                    validate_effectiveness_study_design(plan)

    def test_causal_outcome_requires_independent_assessment(self):
        plan = self._plan()
        plan["primary_outcome"]["independent_assessment"] = False
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyDesignError, "CAUSAL_OUTCOME_MUST_BE_INDEPENDENTLY_ASSESSED"):
            validate_effectiveness_study_design(plan)

    def test_causal_analysis_requires_uncertainty_interval_and_prespecified_subgroups(self):
        plan = self._plan()
        plan["analysis"]["uncertainty_reporting"] = "P_VALUE_ONLY"
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyDesignError, "CAUSAL_UNCERTAINTY_INTERVAL_REQUIRED"):
            validate_effectiveness_study_design(plan)
        plan = self._plan()
        plan["analysis"]["subgroup_policy"] = "EXPLORE_AFTER_RESULTS"
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyDesignError, "CAUSAL_SUBGROUP_POLICY_INVALID"):
            validate_effectiveness_study_design(plan)

    def test_causal_baseline_adjustment_must_be_prespecified(self):
        plan = self._plan()
        plan["baseline"]["adjustment_strategy"] = "NONE"
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyDesignError, "CAUSAL_BASELINE_ADJUSTMENT"):
            validate_effectiveness_study_design(plan)

    def test_unplanned_outcome_peeking_is_forbidden(self):
        plan = self._plan()
        plan["stopping"]["unplanned_outcome_peeking_allowed"] = True
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyDesignError, "UNPLANNED_OUTCOME_PEEKING_FORBIDDEN"):
            validate_effectiveness_study_design(plan)

    def test_participant_identity_or_raw_data_are_forbidden_in_design_packet(self):
        for field in ("participant_key", "learner_id", "raw_response", "email"):
            plan = self._plan()
            plan["privacy"][field] = "SHOULD-NOT-BE-HERE"
            with self.subTest(field=field):
                with self.assertRaisesRegex(RealLearnerEffectivenessStudyDesignError, "PARTICIPANT_DATA_FORBIDDEN"):
                    validate_effectiveness_study_design(plan)

    def test_population_generalization_is_not_a_direct_claim_target(self):
        plan = self._plan()
        plan["claim_target"] = "POPULATION_GENERALIZATION"
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyDesignError, "CLAIM_TARGET_UNSUPPORTED"):
            validate_effectiveness_study_design(plan)

    def test_plan_input_is_not_mutated(self):
        plan = self._plan()
        original = copy.deepcopy(plan)
        validate_effectiveness_study_design(plan)
        self.assertEqual(plan, original)


if __name__ == "__main__":
    unittest.main()
