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

class LearningEffectivenessS06CasesB(unittest.TestCase):
    def test_t49_contract_case_49(self):
        with self.assertRaisesRegex(LearningEffectivenessError, "ADVERSE_EFFECT_REVIEW_REQUIRED"):
            protocol(target_context={"population":"x", "consequential":True}, analysis_plan={"method":"x"})

    def test_t50_contract_case_50(self):
        r=result(observations=[{"family":"IMMEDIATE_PERFORMANCE", "excessive_prompting_burden":True}])
        self.assertEqual(r["standing"], "ADVERSE_SIGNAL")

    def test_t51_contract_case_51(self):
        r=result(observations=[{"family":"IMMEDIATE_PERFORMANCE", "time_increase_without_learning_benefit":True}])
        self.assertEqual(r["standing"], "ADVERSE_SIGNAL")

    def test_t52_contract_case_52(self):
        r=result(observations=[{"family":"INDEPENDENT_PERFORMANCE", "independent_performance_degraded":True}])
        self.assertEqual(r["standing"], "ADVERSE_SIGNAL")

    def test_t53_contract_case_53(self):
        r=result(observations=[{"family":"IMMEDIATE_PERFORMANCE", "accessibility_regression":True}])
        self.assertIn("ACCESSIBILITY_REGRESSION", [x["code"] for x in r["adverse_signals"]])

    def test_t54_contract_case_54(self):
        r=result(observations=[{"family":"IMMEDIATE_PERFORMANCE", "integrity_degradation":True}])
        self.assertIn("ASSESSMENT_INTEGRITY_DEGRADATION", [x["code"] for x in r["adverse_signals"]])

    def test_t55_contract_case_55(self):
        r=result()
        self.assertFalse(r["absence_of_adverse_effects_proven"])

    def test_t56_contract_case_56(self):
        r=result(adverse_signals=[{"code":"credible-risk", "material":True}])
        self.assertEqual(r["standing"], "ADVERSE_SIGNAL")

    def test_t57_contract_case_57(self):
        p=protocol()
        sg=validate_subgroup_request({"attribute":"prior_experience", "attribute_source":"authorized_record", "authorized":True, "necessary":True, "minimum_sample":10, "observed_sample":20, "reidentification_protection":True})
        self.assertEqual(p["owner"], "LEARNING")
        self.assertTrue(sg["publish_detail"])

    def test_t58_contract_case_58(self):
        with self.assertRaisesRegex(LearningEffectivenessError, "SUBGROUP_NECESSITY_REQUIRED"):
            validate_subgroup_request({"attribute":"x","attribute_source":"record","authorized":True,"necessary":True,"collect_only_because_available":True})

    def test_t59_contract_case_59(self):
        sg=validate_subgroup_request({"attribute":"prior_experience","attribute_source":"authorized_record","authorized":True,"necessary":True,"minimum_sample":10,"observed_sample":15,"reidentification_protection":True})
        self.assertTrue(sg["publish_detail"])

    def test_t60_contract_case_60(self):
        sg=validate_subgroup_request({"attribute":"prior_experience","attribute_source":"authorized_record","authorized":True,"necessary":True,"minimum_sample":10,"observed_sample":3,"reidentification_protection":True})
        self.assertEqual(sg["precision_standing"], "SUPPRESSED_OR_UNCERTAIN")

    def test_t61_contract_case_61(self):
        with self.assertRaisesRegex(LearningEffectivenessError, "SENSITIVE_TRAIT_INFERENCE_FORBIDDEN"):
            validate_subgroup_request({"attribute":"religion","attribute_source":"raw_chat","authorized":True,"necessary":True})

    def test_t62_contract_case_62(self):
        sg={"attribute":"prior_experience","attribute_source":"authorized_record","authorized":True,"necessary":True,"minimum_sample":5,"observed_sample":20,"reidentification_protection":True,"material_adverse_signal":True}
        r=result(subgroup_results=[sg])
        self.assertEqual(r["standing"], "ADVERSE_SIGNAL")

    def test_t63_contract_case_63(self):
        sg=validate_subgroup_request({"attribute":"UNKNOWN","attribute_source":"not_provided","authorized":True,"necessary":True,"minimum_sample":5,"observed_sample":0,"reidentification_protection":True})
        self.assertEqual(sg["attribute"], "UNKNOWN")
        self.assertFalse(sg["publish_detail"])

    def test_t64_contract_case_64(self):
        sg=validate_subgroup_request({"attribute":"prior_experience","attribute_source":"authorized_record","authorized":True,"necessary":True,"minimum_sample":5,"observed_sample":20,"reidentification_protection":False})
        self.assertFalse(sg["publish_detail"])

    def test_t65_contract_case_65(self):
        r=result()
        s=r["statistics"]
        for k in ("sample_count","design_unit","analysis_unit","point_estimate","uncertainty"):
            self.assertIn(k,s)

    def test_t66_contract_case_66(self):
        r=result()
        self.assertFalse(r["statistics"]["statistical_significance_is_educational_importance"])

    def test_t67_contract_case_67(self):
        r=result(statistics={"sample_count":12,"design_unit":"learner","analysis_unit":"learner","point_estimate":0.8,"uncertainty":{"low":-0.2,"high":1.8}})
        self.assertEqual(r["statistics"]["precision_standing"], "BOUNDED")

    def test_t68_contract_case_68(self):
        r=result()
        self.assertIsNone(r["statistics"]["universal_effect_size_threshold"])

    def test_t69_contract_case_69(self):
        with self.assertRaisesRegex(LearningEffectivenessError, "MISSINGNESS_MUST_BE_REPORTED"):
            result(missingness={"reported":False,"count":5})

    def test_t70_contract_case_70(self):
        r=result(missingness={"reported":True,"by_condition":{"A":1,"B":5},"differential":True})
        self.assertTrue(r["missingness"]["differential"])

    def test_t71_contract_case_71(self):
        r=result(contamination={"reported":True,"crossover_count":4,"outside_tutoring":2,"answer_leakage":1})
        self.assertEqual(r["contamination"]["crossover_count"],4)

    def test_t72_contract_case_72(self):
        r=result(contamination={"reported":True,"outcome_item_overlap":"material"})
        self.assertEqual(r["contamination"]["outcome_item_overlap"],"material")

    def test_t73_contract_case_73(self):
        r=result()
        self.assertEqual(r["protocol_version"], LEARNING_EFFECTIVENESS_VERSION)
        self.assertEqual(r["intervention_versions"]["curriculum_version"],"cur-v1")

    def test_t74_contract_case_74(self):
        r=result()
        self.assertEqual(r["measurement_instruments"][0]["instrument_version"],"inst-v1")
        self.assertEqual(r["measurement_instruments"][0]["window"],"post-0d")

    def test_t75_contract_case_75(self):
        r=result(source_data_refs=["source:sha256:a"], derived_data_refs=["derived:sha256:b"])
        self.assertEqual(r["source_data_refs"],["source:sha256:a"])
        self.assertEqual(r["derived_data_refs"],["derived:sha256:b"])

    def test_t76_contract_case_76(self):
        r=result(analysis_code_ref="git:abc", environment_ref="container:def")
        self.assertEqual((r["analysis_code_ref"],r["environment_ref"]),("git:abc","container:def"))

    def test_t77_contract_case_77(self):
        r1=result()
        r2=result()
        self.assertEqual(r1["result_digest"],r2["result_digest"])

    def test_t78_contract_case_78(self):
        prior=result()
        rep=copy.deepcopy(prior)
        cor=correct_evaluation_result(prior, successor_result_id="result-2", correction_reason="data correction", changed_inputs_or_analysis_ref="analysis:v2", replacement=rep)
        self.assertEqual(cor["original"]["standing"],"SUPERSEDED")
        self.assertEqual(cor["successor"]["supersedes_result_id"],"result-1")

    def test_t79_contract_case_79(self):
        prior=result()
        cor=correct_evaluation_result(prior, successor_result_id="result-2", correction_reason="reanalysis", changed_inputs_or_analysis_ref="analysis:v2", replacement=prior)
        self.assertEqual(cor["successor"]["original_result_digest"], prior["result_digest"])
        self.assertEqual(cor["successor"]["changed_inputs_or_analysis_ref"],"analysis:v2")

    def test_t80_contract_case_80(self):
        r=result()
        c=build_downstream_policy_consumption(result=r, consumer="adaptive-policy", policy_version="adapt-v2", decision_type="INSTRUCTIONAL_ADAPTATION")
        self.assertEqual(c["evaluation_result_digest"], r["result_digest"])

    def test_t81_contract_case_81(self):
        r=result()
        c=build_downstream_policy_consumption(result=r, consumer="adaptive-policy", policy_version="adapt-v2", decision_type="INSTRUCTIONAL_ADAPTATION")
        self.assertEqual(c["mastery_effect"],"NONE")

    def test_t82_contract_case_82(self):
        r=result()
        c=build_downstream_policy_consumption(result=r, consumer="learner-model", policy_version="lm-v1", decision_type="POLICY_INPUT")
        self.assertFalse(c["individual_learner_fact_projection"])

    def test_t83_contract_case_83(self):
        p=protocol(outcomes=[base_outcome("EXPERIENCE")])
        with self.assertRaisesRegex(LearningEffectivenessError,"LEARNING_OUTCOME_EVIDENCE_REQUIRED"):
            result(p, observations=[{"family":"EXPERIENCE","preference":"A"}])

    def test_t84_contract_case_84(self):
        r=result()
        c=build_downstream_policy_consumption(result=r, consumer="adaptive-policy", policy_version="adapt-v2", decision_type="INSTRUCTIONAL_ADAPTATION")
        self.assertEqual(c["policy_version"],"adapt-v2")
        self.assertEqual(c["evaluation_result_id"],"result-1")

    def test_t85_contract_case_85(self):
        r=result()
        c=build_downstream_policy_consumption(result=r, consumer="adaptive-policy", policy_version="adapt-v2", decision_type="INSTRUCTIONAL_ADAPTATION")
        self.assertFalse(c["optimize_immediate_correctness_only"])

    def test_t86_contract_case_86(self):
        p=protocol(confirmatory=False, prospective=False, analysis_plan={}, missingness_plan={}, contamination_plan={}, stopping_rule="")
        r=result(p, standing="EXPLORATORY")
        with self.assertRaisesRegex(LearningEffectivenessError,"RESULT_NOT_POLICY_CONSUMABLE"):
            build_downstream_policy_consumption(result=r, consumer="adaptive-policy", policy_version="v1", decision_type="POLICY_INPUT")

    def test_t87_contract_case_87(self):
        r=result(adverse_signals=[{"code":"risk","material":True}])
        c=build_downstream_policy_consumption(result=r, consumer="adaptive-policy", policy_version="v1", decision_type="POLICY_INPUT")
        self.assertTrue(c["adverse_signal_remains_decision_relevant"])

    def test_t88_contract_case_88(self):
        r=result()
        for decision in ("CERTIFICATION","LICENSING","HIRING","JOB_ELIGIBILITY"):
            with self.assertRaisesRegex(LearningEffectivenessError,"DOWNSTREAM_DECISION_FORBIDDEN"):
                build_downstream_policy_consumption(result=r, consumer="x", policy_version="v1", decision_type=decision)

    def test_t89_contract_case_89(self):
        c=evaluate_change_control({"model_provider":"a","model_version":"m1"},{"model_provider":"b","model_version":"m2"})
        self.assertTrue(c["coverage_review_required"])
        self.assertTrue(c["effectiveness_review_required"])

    def test_t90_contract_case_90(self):
        keys=("tutoring_version","prompt_version","curriculum_version","adaptive_policy_version","scaffold_version","tool_version","assessment_version")
        for key in keys:
            c=evaluate_change_control({key:"v1"},{key:"v2"})
            self.assertTrue(c["coverage_review_required"], key)

    def test_t91_contract_case_91(self):
        self.assertEqual(RESULT_STANDINGS, ("PLANNED","IN_PROGRESS","EXPLORATORY","INCONCLUSIVE","SUPPORTIVE","ADVERSE_SIGNAL","SUPERSEDED","NOT_GENERALIZABLE"))

    def test_t92_contract_case_92(self):
        r=result(claim_text="improves immediate performance for adult learners in lean-101")
        self.assertEqual(r["standing"],"SUPPORTIVE")
        self.assertEqual(r["claim_scope"]["course"],"lean-101")
        self.assertFalse(r["universal_generalization_proven"])

    def test_t93_contract_case_93(self):
        q=software_qualification_report(executable_cases_passed=96,total_cases=96,regression_tests=990)
        self.assertFalse(q["system_master_proven_effective"])

    def test_t94_contract_case_94(self):
        q=software_qualification_report(executable_cases_passed=96,total_cases=96,regression_tests=990)
        self.assertEqual(q["claim_class"],"SOFTWARE_QUALIFICATION_ONLY")
        self.assertFalse(q["educational_effectiveness_evidence"])

    def test_t95_contract_case_95(self):
        c=evaluate_change_control({"model_version":"m1"},{"model_version":"m2"})
        self.assertTrue(c["fresh_software_qualification_required"])
        self.assertTrue(c["effectiveness_review_required"])

    def test_t96_contract_case_96(self):
        with self.assertRaisesRegex(LearningEffectivenessError,"SOFTWARE_QUALIFICATION_INCOMPLETE"):
            software_qualification_report(executable_cases_passed=95,total_cases=96,regression_tests=990)
        q=software_qualification_report(executable_cases_passed=96,total_cases=96,regression_tests=990)
        self.assertEqual(q["executable_cases"],"96/96")


if __name__ == '__main__':
    unittest.main()
