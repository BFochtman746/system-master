from __future__ import annotations

import copy
import unittest

from learning_lab.learning_effectiveness import (
    LEARNING_EFFECTIVENESS_VERSION,
    RESULT_STANDINGS,
    LearningEffectivenessError,
    build_evaluation_protocol,
    finalize_evaluation,
    validate_subgroup_request,
    correct_evaluation_result,
    build_downstream_policy_consumption,
    evaluate_change_control,
    software_qualification_report,
)


def base_outcome(family="IMMEDIATE_PERFORMANCE", **overrides):
    row = {
        "outcome_id": "o1",
        "family": family,
        "instrument_version": "inst-v1",
        "window": "post-0d",
        "primary": True,
        "assistance_condition": "INDEPENDENT",
    }
    row.update(overrides)
    return row


def protocol(**overrides):
    args = {
        "evaluation_id": "eval-1",
        "intervention_id": "intervention-v1",
        "comparator_id": "baseline-v1",
        "design": "RANDOMIZED",
        "versions": {
            "curriculum_version": "cur-v1",
            "assessment_version": "assess-v1",
            "policy_version": "policy-v1",
            "model_provider": "provider-a",
            "model_version": "model-v1",
            "prompt_version": "prompt-v1",
            "tutoring_version": "tutor-v1",
            "adaptive_policy_version": "adaptive-v1",
            "scaffold_version": "scaffold-v1",
            "tool_version": "tool-v1",
        },
        "target_context": {"population": "adult learners", "course": "lean-101"},
        "intended_claim": "intervention improves immediate learning performance in the evaluated context",
        "outcomes": [base_outcome()],
        "confirmatory": True,
        "assignment_integrity": "PASS",
        "analysis_plan": {"method": "difference-in-means", "adverse_effect_review": True},
        "missingness_plan": {"strategy": "report-all"},
        "contamination_plan": {"strategy": "track-crossover"},
        "stopping_rule": "fixed-n",
        "assistance_conditions": ["INDEPENDENT"],
        "accommodation_conditions": ["AUTHORIZED_ACCOMMODATION"],
    }
    args.update(overrides)
    return build_evaluation_protocol(**args)


def result(p=None, **overrides):
    args = {
        "protocol": p or protocol(),
        "result_id": "result-1",
        "standing": "SUPPORTIVE",
        "observations": [{"family": "IMMEDIATE_PERFORMANCE", "value": 0.2}],
        "statistics": {
            "sample_count": 40,
            "design_unit": "learner",
            "analysis_unit": "learner",
            "point_estimate": 0.2,
            "uncertainty": {"low": 0.05, "high": 0.35},
            "p_value": 0.02,
        },
        "missingness": {"reported": True, "count": 2},
        "contamination": {"reported": True, "crossover_count": 1},
        "source_data_refs": ["data:source:v1"],
        "derived_data_refs": ["data:derived:v1"],
        "analysis_code_ref": "git:analysis@abc",
        "environment_ref": "env:python-3.11",
    }
    args.update(overrides)
    return finalize_evaluation(**args)

class LearningEffectivenessS06CasesA(unittest.TestCase):
    def test_t01_contract_case_01(self):
        p = protocol()
        self.assertEqual(p["owner"], "LEARNING")

    def test_t02_contract_case_02(self):
        p = protocol()
        self.assertEqual(p["versions"]["curriculum_version"], "cur-v1")

    def test_t03_contract_case_03(self):
        p = protocol()
        self.assertEqual(p["generic_statistics_owner"], "SHARED_ASSURANCE_OR_ANALYTICS")

    def test_t04_contract_case_04(self):
        p = protocol()
        self.assertEqual({p["mastery_effect"], p["retention_truth_effect"], p["transfer_truth_effect"], p["assessment_truth_effect"], p["goal_truth_effect"], p["self_regulation_truth_effect"]}, {"NONE"})

    def test_t05_contract_case_05(self):
        q = software_qualification_report(executable_cases_passed=96, total_cases=96, regression_tests=990)
        self.assertFalse(q["educational_effectiveness_evidence"])

    def test_t06_contract_case_06(self):
        q = software_qualification_report(executable_cases_passed=96, total_cases=96, regression_tests=990)
        self.assertFalse(q["measurement_validity_evidence"])

    def test_t07_contract_case_07(self):
        r = result()
        self.assertFalse(r["universal_generalization_proven"])

    def test_t08_contract_case_08(self):
        p = protocol()
        self.assertEqual(p["owner"], "LEARNING")
        self.assertNotEqual(p["generic_statistics_owner"], p["owner"])

    def test_t09_contract_case_09(self):
        p = protocol(evaluation_id="eval-exact", intervention_id="int-exact")
        self.assertEqual((p["evaluation_id"], p["intervention_id"]), ("eval-exact", "int-exact"))

    def test_t10_contract_case_10(self):
        p = protocol()
        for k in ("curriculum_version", "policy_version", "model_version", "prompt_version", "assessment_version"):
            self.assertTrue(p["versions"][k])

    def test_t11_contract_case_11(self):
        p = protocol(outcomes=[base_outcome(primary=True), base_outcome(outcome_id="o2", primary=False)])
        self.assertEqual([x["outcome_id"] for x in p["outcomes"] if x["primary"]], ["o1"])

    def test_t12_contract_case_12(self):
        p = protocol(target_context={"population":"novices"}, intended_claim="bounded claim")
        self.assertEqual(p["target_context"]["population"], "novices")
        self.assertEqual(p["intended_claim"], "bounded claim")

    def test_t13_contract_case_13(self):
        p = protocol(assistance_conditions=["INDEPENDENT", "HINTS"], accommodation_conditions=["AUTHORIZED_ACCOMMODATION"])
        self.assertEqual(p["assistance_conditions"], ["HINTS", "INDEPENDENT"])

    def test_t14_contract_case_14(self):
        with self.assertRaisesRegex(LearningEffectivenessError, "CONFIRMATORY_RULES_REQUIRED"):
            protocol(analysis_plan={})

    def test_t15_contract_case_15(self):
        p = protocol(confirmatory=False, prospective=False, analysis_plan={}, missingness_plan={}, contamination_plan={}, stopping_rule="")
        r = result(p)
        self.assertEqual(r["standing"], "EXPLORATORY")

    def test_t16_contract_case_16(self):
        c = evaluate_change_control({"model_version":"m1"}, {"model_version":"m2"})
        self.assertTrue(c["effectiveness_review_required"])
        self.assertFalse(c["standing_inherited_automatically"])

    def test_t17_contract_case_17(self):
        with self.assertRaisesRegex(LearningEffectivenessError, "COMPARATOR_REQUIRED"):
            protocol(comparator_id="")

    def test_t18_contract_case_18(self):
        p = protocol(comparator_is_strawman=True)
        r = result(p)
        self.assertEqual(r["standing"], "NOT_GENERALIZABLE")

    def test_t19_contract_case_19(self):
        r = result(protocol(design="RANDOMIZED", assignment_integrity="PASS"))
        self.assertEqual(r["claim_class"], "CAUSAL_BOUNDED")

    def test_t20_contract_case_20(self):
        p = protocol(design="QUASI_EXPERIMENTAL", identifying_assumptions=["parallel trends"], assignment_integrity="NOT_APPLICABLE")
        r = result(p)
        self.assertEqual(r["claim_class"], "QUASI_CAUSAL_BOUNDED")

    def test_t21_contract_case_21(self):
        p = protocol(design="OBSERVATIONAL", assignment_integrity="NOT_APPLICABLE")
        r = result(p)
        self.assertEqual(r["claim_class"], "OBSERVATIONAL_ASSOCIATION")

    def test_t22_contract_case_22(self):
        p = protocol(design="N_OF_1", assignment_integrity="NOT_APPLICABLE", intended_claim="effective for all learners")
        r = result(p)
        self.assertEqual(r["standing"], "NOT_GENERALIZABLE")

    def test_t23_contract_case_23(self):
        p = protocol(design="WITHIN_LEARNER_REPEATED", assignment_integrity="NOT_APPLICABLE", target_context={"period":"2", "carryover":"tracked", "reversibility":"limited"})
        r = result(p)
        self.assertEqual(r["claim_class"], "WITHIN_LEARNER_BOUNDED")
        self.assertEqual(r["claim_scope"]["carryover"], "tracked")

    def test_t24_contract_case_24(self):
        obs = [{"family":"IMMEDIATE_PERFORMANCE", "value":0.2, "baseline_imbalance":{"severity":"material", "adjustment":"none"}}]
        r = result(observations=obs)
        self.assertEqual(r["observations"][0]["baseline_imbalance"]["severity"], "material")

    def test_t25_contract_case_25(self):
        r = result(observations=[{"family":"IMMEDIATE_PERFORMANCE", "value":0.2}])
        self.assertEqual(r["observations"][0]["family"], "IMMEDIATE_PERFORMANCE")

    def test_t26_contract_case_26(self):
        with self.assertRaisesRegex(LearningEffectivenessError, "LEARNING_OUTCOME_EVIDENCE_REQUIRED"):
            result(observations=[{"family":"EXPERIENCE", "task_completion_only":True}])

    def test_t27_contract_case_27(self):
        with self.assertRaisesRegex(LearningEffectivenessError, "LEARNING_OUTCOME_EVIDENCE_REQUIRED"):
            result(observations=[{"family":"EXPERIENCE", "accepted_ai_output_only":True}])

    def test_t28_contract_case_28(self):
        with self.assertRaisesRegex(LearningEffectivenessError, "RETENTION_DELAY_REQUIRED"):
            protocol(outcomes=[base_outcome("DELAYED_RETENTION", timing="IMMEDIATE")])

    def test_t29_contract_case_29(self):
        p = protocol(intended_claim="improves retention")
        with self.assertRaisesRegex(LearningEffectivenessError, "RETENTION_EVIDENCE_REQUIRED"):
            result(p)

    def test_t30_contract_case_30(self):
        obs = [{"family":"DELAYED_RETENTION", "value":0.15, "measurement_type":"delayed_application", "exact_repeat_recall":False}]
        r = result(protocol(outcomes=[base_outcome("DELAYED_RETENTION", timing="P30D", window="30d")]), observations=obs)
        self.assertEqual(r["observations"][0]["measurement_type"], "delayed_application")

    def test_t31_contract_case_31(self):
        p = protocol(outcomes=[base_outcome("DELAYED_RETENTION", timing="P30D", window="30d", assistance_condition="HINTS")])
        self.assertEqual(p["outcomes"][0]["assistance_condition"], "HINTS")

    def test_t32_contract_case_32(self):
        obs=[{"family":"DELAYED_RETENTION", "immediate_improved":True, "retention_degraded":True}]
        r=result(protocol(outcomes=[base_outcome("DELAYED_RETENTION", timing="P30D", window="30d")]), observations=obs)
        self.assertEqual(r["standing"], "ADVERSE_SIGNAL")

    def test_t33_contract_case_33(self):
        p=protocol(outcomes=[base_outcome("TRANSFER", transfer_distance="far", materially_different_from_training=True)])
        self.assertTrue(p["outcomes"][0]["materially_different_from_training"])

    def test_t34_contract_case_34(self):
        with self.assertRaisesRegex(LearningEffectivenessError, "TRANSFER_MATERIAL_DIFFERENCE_REQUIRED"):
            protocol(outcomes=[base_outcome("TRANSFER", transfer_distance="cosmetic", materially_different_from_training=False)])

    def test_t35_contract_case_35(self):
        with self.assertRaisesRegex(LearningEffectivenessError, "TRANSFER_DISTANCE_REQUIRED"):
            protocol(outcomes=[base_outcome("TRANSFER", materially_different_from_training=True)])

    def test_t36_contract_case_36(self):
        p=protocol(outcomes=[base_outcome("INDEPENDENT_PERFORMANCE", assistance_condition="HINTS")])
        self.assertFalse(p["outcomes"][0]["independence_eligible"])

    def test_t37_contract_case_37(self):
        p=protocol(outcomes=[base_outcome("INDEPENDENT_PERFORMANCE", assistance_condition="AI_TUTOR")])
        self.assertEqual(p["outcomes"][0]["assistance_condition"], "AI_TUTOR")

    def test_t38_contract_case_38(self):
        p=protocol(outcomes=[base_outcome("INDEPENDENT_PERFORMANCE", assistance_condition="AUTHORIZED_ACCOMMODATION")])
        self.assertTrue(p["outcomes"][0]["independence_eligible"])

    def test_t39_contract_case_39(self):
        p=protocol(outcomes=[base_outcome("INDEPENDENT_PERFORMANCE", assistance_condition="INDEPENDENT")])
        self.assertEqual(p["mastery_effect"], "NONE")
        self.assertEqual(p["transfer_truth_effect"], "NONE")

    def test_t40_contract_case_40(self):
        obs=[{"family":"INDEPENDENT_PERFORMANCE", "supported_improved":True, "unsupported_degraded":True}]
        r=result(protocol(outcomes=[base_outcome("INDEPENDENT_PERFORMANCE")]), observations=obs)
        self.assertEqual(r["standing"], "ADVERSE_SIGNAL")

    def test_t41_contract_case_41(self):
        with self.assertRaisesRegex(LearningEffectivenessError, "EFFICIENCY_RESOURCE_MEASURE_REQUIRED"):
            protocol(outcomes=[base_outcome("LEARNING_EFFICIENCY")])

    def test_t42_contract_case_42(self):
        obs=[{"family":"DELAYED_RETENTION", "faster_completion":True, "immediate_improved":True, "retention_degraded":True}]
        r=result(protocol(outcomes=[base_outcome("DELAYED_RETENTION", timing="P30D", window="30d")]), observations=obs)
        self.assertEqual(r["standing"], "ADVERSE_SIGNAL")

    def test_t43_contract_case_43(self):
        p=protocol(target_context={"prompt_count_reduced":True})
        self.assertEqual(p["mastery_effect"], "NONE")

    def test_t44_contract_case_44(self):
        p=protocol(outcomes=[base_outcome("SELF_REGULATION")])
        self.assertEqual(p["outcomes"][0]["family"], "SELF_REGULATION")
        self.assertEqual(p["self_regulation_truth_effect"], "NONE")

    def test_t45_contract_case_45(self):
        p=protocol(outcomes=[base_outcome("EXPERIENCE")])
        self.assertEqual(p["outcomes"][0]["family"], "EXPERIENCE")

    def test_t46_contract_case_46(self):
        with self.assertRaisesRegex(LearningEffectivenessError, "LEARNING_OUTCOME_EVIDENCE_REQUIRED"):
            result(protocol(outcomes=[base_outcome("EXPERIENCE")]), observations=[{"family":"EXPERIENCE", "helpfulness":5}])

    def test_t47_contract_case_47(self):
        p=protocol(design="OBSERVATIONAL", assignment_integrity="NOT_APPLICABLE", outcomes=[base_outcome("EXPERIENCE")], confirmatory=False, prospective=False, analysis_plan={}, missingness_plan={}, contamination_plan={}, stopping_rule="")
        r=result(p, standing="EXPLORATORY", observations=[{"family":"EXPERIENCE", "preference":"A"}])
        self.assertEqual(r["claim_class"], "OBSERVATIONAL_ASSOCIATION")

    def test_t48_contract_case_48(self):
        obs=[{"family":"EXPERIENCE", "collection_method":"survey", "timing":"post", "missing_response_standing":"REPORTED"}]
        r=result(protocol(outcomes=[base_outcome("EXPERIENCE")]), standing="EXPLORATORY", observations=obs)
        self.assertEqual(r["observations"][0]["missing_response_standing"], "REPORTED")


if __name__ == '__main__':
    unittest.main()
