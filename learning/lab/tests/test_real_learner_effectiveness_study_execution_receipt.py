from __future__ import annotations

import copy
import unittest

from learning_lab.real_learner_effectiveness_study_design import (
    REAL_LEARNER_EFFECTIVENESS_STUDY_DESIGN_VERSION,
)
from learning_lab.real_learner_effectiveness_study_execution_receipt import (
    REAL_LEARNER_EFFECTIVENESS_STUDY_EXECUTION_RECEIPT_VERSION,
    RealLearnerEffectivenessStudyExecutionReceiptError,
    canonical_study_plan_digest,
    validate_study_execution_receipt,
)


class RealLearnerEffectivenessStudyExecutionReceiptTests(unittest.TestCase):
    def _plan(self, claim_target: str = "CAUSAL_EFFECTIVENESS"):
        causal = claim_target == "CAUSAL_EFFECTIVENESS"
        return {
            "contract_version": REAL_LEARNER_EFFECTIVENESS_STUDY_DESIGN_VERSION,
            "study_id": "LEARNING-EFFECTIVENESS-STUDY-001",
            "claim_target": claim_target,
            "intervention": {"subject_sha": "e" * 40, "runtime_binding_digest": "1" * 64},
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
                "inclusion_criteria": ["Meets prespecified eligibility"],
                "exclusion_criteria": [],
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
                "description": "Prespecified comparator" if causal else "NOT_APPLICABLE",
                "contamination_controls": ["Separate intervention access"] if causal else [],
            },
            "sample_size": {
                "target_units": 40 if causal else 12,
                "basis": "POWER_OR_PRECISION" if causal else "FEASIBILITY_OBJECTIVES",
                "rationale_ref": "SAMPLE-SIZE-RATIONALE-001",
                "assumptions_frozen": True,
                "progression_criteria": [] if causal else ["Feasibility progression threshold"],
            },
            "primary_outcome": {
                "outcome_id": "OUTCOME-INDEPENDENT-TRANSFER",
                "construct": "Independent novel transfer performance",
                "timepoint": "Prespecified post-intervention transfer window",
                "intended_interpretation": "Independent novel transfer",
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
                "equivalence_assessment_plan": "Report prespecified baseline balance",
            },
            "identity_independence": {
                "unique_human_authority_ref": "SEPARATE-IDENTITY-REGISTRY-001" if causal else None,
                "analysis_identity_separated": True,
                "assistance_contamination_controls": ["Independent-task assistance prohibition"],
                "assessor_independence": "Scoring isolated from tutoring",
            },
            "analysis": {
                "estimand": "Mean between-group difference" if causal else "Feasibility descriptive estimates",
                "effect_measure": "STANDARDIZED_MEAN_DIFFERENCE" if causal else "DESCRIPTIVE_FEASIBILITY_ESTIMATES",
                "uncertainty_reporting": "CONFIDENCE_INTERVAL" if causal else "DESCRIPTIVE_INTERVALS",
                "multiplicity_policy": "Single primary outcome",
                "subgroup_policy": "PRESPECIFIED_ONLY" if causal else "NO_EFFECT_SUBGROUP_TESTING",
                "cluster_strategy": "NOT_CLUSTERED",
                "analysis_population": "INTENTION_TO_TREAT" if causal else "ALL_ENROLLED_WITH_FLOW_ACCOUNTING",
            },
            "stopping": {"rule": "No outcome-driven stopping", "unplanned_outcome_peeking_allowed": False},
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

    def _receipt(self, plan=None):
        plan = plan or self._plan()
        causal = plan["claim_target"] == "CAUSAL_EFFECTIVENESS"
        if causal:
            enrolled, assigned, excluded = 42, 40, 2
            groups = {
                "CONTROL": {
                    "denominator_count": 20,
                    "primary_outcome_observed_count": 18,
                    "primary_outcome_missing_count": 2,
                },
                "SYSTEM_MASTER": {
                    "denominator_count": 20,
                    "primary_outcome_observed_count": 19,
                    "primary_outcome_missing_count": 1,
                },
            }
            observed, missing = 37, 3
            reasons = {"WITHDRAWAL": 2, "LOST_TO_FOLLOWUP": 1}
            identity_ref = "SEPARATE-IDENTITY-REGISTRY-001"
        else:
            enrolled, assigned, excluded = 12, 0, 0
            groups = {
                "FEASIBILITY_COHORT": {
                    "denominator_count": 12,
                    "primary_outcome_observed_count": 10,
                    "primary_outcome_missing_count": 2,
                }
            }
            observed, missing = 10, 2
            reasons = {"WITHDRAWAL": 2}
            identity_ref = "FEASIBILITY-IDENTITY-AUTHORITY-001"
        return {
            "receipt_version": REAL_LEARNER_EFFECTIVENESS_STUDY_EXECUTION_RECEIPT_VERSION,
            "study_id": plan["study_id"],
            "study_plan_digest": canonical_study_plan_digest(plan),
            "binding": {
                "study_design_version": REAL_LEARNER_EFFECTIVENESS_STUDY_DESIGN_VERSION,
                "intervention_subject_sha": plan["intervention"]["subject_sha"],
                "runtime_binding_digest": plan["intervention"]["runtime_binding_digest"],
                "protocol_digest": plan["protocol"]["protocol_digest"],
                "analysis_plan_digest": plan["protocol"]["analysis_plan_digest"],
            },
            "governance_authority_ref": plan["governance"]["authority_ref"],
            "execution": {
                "started_at": "2026-09-10T12:00:00Z",
                "first_primary_outcome_access_at": "2026-09-12T12:00:00Z",
                "completed_at": "2026-09-13T12:00:00Z",
            },
            "flow": {
                "screened_count": enrolled + 8,
                "enrolled_count": enrolled,
                "assigned_count": assigned,
                "pre_assignment_exclusion_count": excluded,
                "analysis_denominator_count": assigned if causal else enrolled,
                "primary_outcome_observed_count": observed,
                "primary_outcome_missing_count": missing,
                "groups": groups,
                "missing_primary_outcome_reasons": reasons,
            },
            "identity_authority": {
                "authority_ref": identity_ref,
                "attestation_digest": "4" * 64,
                "verified_unique_unit_count": assigned if causal else enrolled,
            },
            "evidence": {
                "primary_outcome_dataset_digest": "5" * 64,
                "scoring_implementation_digest": "6" * 64,
                "participant_flow_digest": "7" * 64,
                "protocol_deviation_digest": "8" * 64,
                "allocation_audit_digest": "9" * 64 if causal else None,
            },
            "incidents": {
                "assistance_or_contamination_count": 1,
                "protocol_deviation_count": 2,
                "all_incidents_preserved": True,
            },
            "amendments": [],
        }

    def test_valid_randomized_receipt_is_ready_only_for_prespecified_analysis(self):
        plan = self._plan()
        result = validate_study_execution_receipt(study_plan=plan, receipt=self._receipt(plan))
        self.assertEqual(result["receipt_standing"], "EXECUTION_RECEIPT_READY_FOR_PRESPECIFIED_CAUSAL_ANALYSIS")
        self.assertTrue(result["analysis_admission"]["prospective_primary_analysis_intact"])
        self.assertFalse(result["analysis_admission"]["inferential_calculation_performed"])
        self.assertFalse(result["claims"]["causal_effect_proven"])

    def test_valid_feasibility_receipt_is_not_causal(self):
        plan = self._plan("FEASIBILITY")
        result = validate_study_execution_receipt(study_plan=plan, receipt=self._receipt(plan))
        self.assertEqual(result["receipt_standing"], "EXECUTION_RECEIPT_READY_FOR_FEASIBILITY_ANALYSIS")
        self.assertFalse(result["claims"]["learning_effectiveness_proven"])

    def test_study_plan_digest_mismatch_is_rejected(self):
        plan = self._plan()
        receipt = self._receipt(plan)
        receipt["study_plan_digest"] = "a" * 64
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyExecutionReceiptError, "PLAN_DIGEST_MISMATCH"):
            validate_study_execution_receipt(study_plan=plan, receipt=receipt)

    def test_intervention_runtime_protocol_and_analysis_bindings_are_exact(self):
        for section, field, bad in (
            ("binding", "intervention_subject_sha", "f" * 40),
            ("binding", "runtime_binding_digest", "a" * 64),
            ("binding", "protocol_digest", "b" * 64),
            ("binding", "analysis_plan_digest", "c" * 64),
        ):
            plan = self._plan()
            receipt = self._receipt(plan)
            receipt[section][field] = bad
            with self.subTest(field=field):
                with self.assertRaises(RealLearnerEffectivenessStudyExecutionReceiptError):
                    validate_study_execution_receipt(study_plan=plan, receipt=receipt)

    def test_execution_cannot_start_before_protocol_freeze(self):
        plan = self._plan()
        receipt = self._receipt(plan)
        receipt["execution"]["started_at"] = "2026-09-09T02:59:59Z"
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyExecutionReceiptError, "STARTED_BEFORE_PROTOCOL_FREEZE"):
            validate_study_execution_receipt(study_plan=plan, receipt=receipt)

    def test_primary_outcome_access_must_be_inside_execution_window(self):
        plan = self._plan()
        receipt = self._receipt(plan)
        receipt["execution"]["first_primary_outcome_access_at"] = "2026-09-14T00:00:00Z"
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyExecutionReceiptError, "OUTCOME_ACCESS_OUTSIDE_EXECUTION"):
            validate_study_execution_receipt(study_plan=plan, receipt=receipt)

    def test_analysis_denominator_must_match_design_denominator(self):
        plan = self._plan()
        receipt = self._receipt(plan)
        receipt["flow"]["analysis_denominator_count"] = 39
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyExecutionReceiptError, "ANALYSIS_DENOMINATOR_MISMATCH"):
            validate_study_execution_receipt(study_plan=plan, receipt=receipt)

    def test_group_counts_must_sum_to_full_denominator(self):
        plan = self._plan()
        receipt = self._receipt(plan)
        receipt["flow"]["groups"]["CONTROL"]["denominator_count"] = 19
        receipt["flow"]["groups"]["CONTROL"]["primary_outcome_observed_count"] = 17
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyExecutionReceiptError, "GROUP_TOTALS_MISMATCH"):
            validate_study_execution_receipt(study_plan=plan, receipt=receipt)

    def test_missing_outcomes_must_have_complete_reason_accounting(self):
        plan = self._plan()
        receipt = self._receipt(plan)
        receipt["flow"]["missing_primary_outcome_reasons"] = {"WITHDRAWAL": 1}
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyExecutionReceiptError, "MISSING_REASON_TOTAL_MISMATCH"):
            validate_study_execution_receipt(study_plan=plan, receipt=receipt)

    def test_causal_receipt_requires_at_least_two_groups(self):
        plan = self._plan()
        receipt = self._receipt(plan)
        receipt["flow"]["groups"] = {
            "SYSTEM_MASTER": {
                "denominator_count": 40,
                "primary_outcome_observed_count": 37,
                "primary_outcome_missing_count": 3,
            }
        }
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyExecutionReceiptError, "CAUSAL_REQUIRES_AT_LEAST_TWO_GROUPS"):
            validate_study_execution_receipt(study_plan=plan, receipt=receipt)

    def test_verified_unique_unit_count_must_equal_analysis_denominator(self):
        plan = self._plan()
        receipt = self._receipt(plan)
        receipt["identity_authority"]["verified_unique_unit_count"] = 39
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyExecutionReceiptError, "UNIQUE_UNIT_COUNT_MISMATCH"):
            validate_study_execution_receipt(study_plan=plan, receipt=receipt)

    def test_causal_identity_authority_must_match_frozen_design(self):
        plan = self._plan()
        receipt = self._receipt(plan)
        receipt["identity_authority"]["authority_ref"] = "DIFFERENT-AUTHORITY"
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyExecutionReceiptError, "IDENTITY_AUTHORITY_MISMATCH"):
            validate_study_execution_receipt(study_plan=plan, receipt=receipt)

    def test_causal_receipt_requires_allocation_audit_digest(self):
        plan = self._plan()
        receipt = self._receipt(plan)
        receipt["evidence"]["allocation_audit_digest"] = None
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyExecutionReceiptError, "ALLOCATION_AUDIT_DIGEST_REQUIRED"):
            validate_study_execution_receipt(study_plan=plan, receipt=receipt)

    def test_post_outcome_primary_analysis_change_downgrades_to_descriptive_only(self):
        plan = self._plan()
        receipt = self._receipt(plan)
        receipt["amendments"] = [{
            "amendment_id": "AMEND-001",
            "scope": "PRIMARY_ANALYSIS_PLAN",
            "effective_at": "2026-09-12T12:00:01Z",
            "amendment_digest": "a" * 64,
            "reason_ref": "AMENDMENT-REASON-001",
        }]
        result = validate_study_execution_receipt(study_plan=plan, receipt=receipt)
        self.assertEqual(result["receipt_standing"], "EXECUTION_RECEIPT_POST_OUTCOME_ANALYSIS_CHANGE_DESCRIPTIVE_ONLY")
        self.assertFalse(result["analysis_admission"]["prospective_primary_analysis_intact"])
        self.assertFalse(result["claims"]["causal_effect_proven"])

    def test_pre_outcome_primary_analysis_amendment_preserves_prospective_standing(self):
        plan = self._plan()
        receipt = self._receipt(plan)
        receipt["amendments"] = [{
            "amendment_id": "AMEND-001",
            "scope": "PRIMARY_ANALYSIS_PLAN",
            "effective_at": "2026-09-11T12:00:00Z",
            "amendment_digest": "a" * 64,
            "reason_ref": "AMENDMENT-REASON-001",
        }]
        result = validate_study_execution_receipt(study_plan=plan, receipt=receipt)
        self.assertEqual(result["receipt_standing"], "EXECUTION_RECEIPT_READY_FOR_PRESPECIFIED_CAUSAL_ANALYSIS")

    def test_duplicate_amendment_id_is_rejected(self):
        plan = self._plan()
        receipt = self._receipt(plan)
        amendment = {
            "amendment_id": "AMEND-001",
            "scope": "OTHER_PROTOCOL",
            "effective_at": "2026-09-11T12:00:00Z",
            "amendment_digest": "a" * 64,
            "reason_ref": "AMENDMENT-REASON-001",
        }
        receipt["amendments"] = [copy.deepcopy(amendment), copy.deepcopy(amendment)]
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyExecutionReceiptError, "DUPLICATE_AMENDMENT_ID"):
            validate_study_execution_receipt(study_plan=plan, receipt=receipt)

    def test_incidents_cannot_be_hidden(self):
        plan = self._plan()
        receipt = self._receipt(plan)
        receipt["incidents"]["all_incidents_preserved"] = False
        with self.assertRaisesRegex(RealLearnerEffectivenessStudyExecutionReceiptError, "INCIDENTS_NOT_FULLY_PRESERVED"):
            validate_study_execution_receipt(study_plan=plan, receipt=receipt)

    def test_receipt_cannot_contain_direct_identity_or_raw_response(self):
        for field in ("participant_key", "learner_id", "raw_response", "email", "full_name"):
            plan = self._plan()
            receipt = self._receipt(plan)
            receipt[field] = "FORBIDDEN"
            with self.subTest(field=field):
                with self.assertRaisesRegex(RealLearnerEffectivenessStudyExecutionReceiptError, "PARTICIPANT_DATA_FORBIDDEN"):
                    validate_study_execution_receipt(study_plan=plan, receipt=receipt)

    def test_receipt_validation_never_calculates_or_promotes_effect(self):
        plan = self._plan()
        result = validate_study_execution_receipt(study_plan=plan, receipt=self._receipt(plan))
        self.assertFalse(result["analysis_admission"]["inferential_calculation_performed"])
        self.assertFalse(result["claims"]["human_execution_independently_verified_by_this_validator"])
        self.assertFalse(result["claims"]["learning_effectiveness_proven"])
        self.assertFalse(result["claims"]["causal_effect_proven"])
        self.assertFalse(result["claims"]["population_generalization_proven"])
        self.assertTrue(result["truth_boundary"]["execution_receipt_is_not_effect_estimate"])


if __name__ == "__main__":
    unittest.main()
