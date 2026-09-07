from __future__ import annotations

import copy
import json
import os
import tempfile
import unittest
from pathlib import Path

from qualification_impl009 import build_seed
from learning_lab import (
    PROFESSIONAL_REVIEW_PROFILE_VERSION,
    CAPABILITY_HANDOFF_VERSION,
    build_external_review_dossier,
    build_capability_evidence_handoff_template,
    adjudicate_reviews,
)

ROOT = Path(__file__).resolve().parents[1]
DESCRIPTOR = json.loads((ROOT / "sources" / "PYTHON_COMPREHENSIONS_REVIEW_DESCRIPTOR_V1.json").read_text())

APPROVE_A = {"reviewer_id": "SME-A", "role": "SUBJECT_MATTER_EXPERT", "independence": "INDEPENDENT", "evidence_class": "SYNTHETIC_TEST_FIXTURE", "standing": "APPROVE"}
APPROVE_B = {"reviewer_id": "FACULTY-B", "role": "FACULTY_REVIEWER", "independence": "INDEPENDENT", "evidence_class": "SYNTHETIC_TEST_FIXTURE", "standing": "APPROVE"}
REVISE_B = {"reviewer_id": "FACULTY-B", "role": "FACULTY_REVIEWER", "independence": "INDEPENDENT", "evidence_class": "SYNTHETIC_TEST_FIXTURE", "standing": "REVISE"}
ABSTAIN_B = {"reviewer_id": "FACULTY-B", "role": "FACULTY_REVIEWER", "independence": "INDEPENDENT", "evidence_class": "SYNTHETIC_TEST_FIXTURE", "standing": "ABSTAIN"}


class ProfessionalRigorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.td = tempfile.TemporaryDirectory()
        repo, engine, out = build_seed(os.path.join(cls.td.name, "seed.db"), learner=False)
        cls.course = repo.get_object("course", out["course_id"], 1)
        cls.dossier = repo.get_object("research_dossier", cls.course["research_dossier_id"], 1)

    @classmethod
    def tearDownClass(cls):
        cls.td.cleanup()

    def evaluate(self, descriptor=None, reviews=(), oracle=True, course=None, dossier=None):
        c = copy.deepcopy(course or self.course)
        d = copy.deepcopy(dossier or self.dossier)
        return build_external_review_dossier(
            course=c, dossier=d, package=d,
            descriptor=copy.deepcopy(descriptor or DESCRIPTOR),
            review_records=reviews, mechanical_oracle_pass=oracle,
        )

    def test_profile_version_is_frozen(self):
        self.assertEqual(PROFESSIONAL_REVIEW_PROFILE_VERSION, "PROFESSIONAL-COURSE-REVIEW-READINESS-V2")

    def test_current_course_is_structurally_ready_for_independent_review(self):
        r = self.evaluate()
        self.assertTrue(r["document_complete_for_review"])
        self.assertEqual(r["external_review_readiness"], "READY_TO_SUBMIT_FOR_INDEPENDENT_REVIEW")

    def test_bounded_module_is_not_misrepresented_as_standalone_certificate_or_credit(self):
        r = self.evaluate()
        self.assertEqual(r["standalone_certificate_or_credit_readiness"], "NOT_SUPPORTED_BY_BOUNDED_MODULE_SCOPE")
        self.assertEqual(r["external_recognition"], "NOT_CLAIMED")

    def test_assessment_blueprint_covers_every_criterion(self):
        r = self.evaluate()
        self.assertEqual(r["assessment_blueprint"]["status"], "PASS")
        self.assertEqual(set(r["assessment_blueprint"]["criteria"]), {"C-PY-LISTCOMP", "C-PY-DICTCOMP"})

    def test_missing_mastery_mode_fails_blueprint(self):
        c = copy.deepcopy(self.course)
        c["items"] = [x for x in c["items"] if not (x["criterion_id"] == "C-PY-LISTCOMP" and x["mode"] == "MASTERY_CHECK")]
        r = self.evaluate(course=c)
        self.assertEqual(r["external_review_readiness"], "BLOCKED")
        self.assertTrue(any("ASSESSMENT_BLUEPRINT_COVERAGE_GAP:C-PY-LISTCOMP:MASTERY_CHECK" in x for x in r["assessment_blueprint"]["failures"]))

    def test_missing_transfer_fails_blueprint_when_required(self):
        d = copy.deepcopy(self.dossier); d["transfer_tasks"] = []
        r = self.evaluate(dossier=d)
        self.assertEqual(r["assessment_blueprint"]["status"], "FAIL")

    def test_passing_standard_is_criterion_referenced(self):
        self.assertEqual(self.evaluate()["passing_standard"]["status"], "PASS")

    def test_compensatory_average_passing_standard_is_rejected(self):
        d = copy.deepcopy(DESCRIPTOR)
        d["passing_standard"] = {"type": "PERCENT_AVERAGE", "rule": "70 percent overall passes", "numeric_probability_claim": "NOT_USED"}
        r = self.evaluate(descriptor=d)
        self.assertEqual(r["passing_standard"]["status"], "FAIL")

    def test_uncalibrated_pass_probability_claim_is_rejected(self):
        d = copy.deepcopy(DESCRIPTOR); d["passing_standard"]["numeric_probability_claim"] = "94_PERCENT_PASS_PROBABILITY"
        self.assertEqual(self.evaluate(descriptor=d)["passing_standard"]["status"], "FAIL")

    def test_outcome_level_must_cover_all_criteria(self):
        d = copy.deepcopy(DESCRIPTOR); d["outcome_levels"].pop("C-PY-DICTCOMP")
        self.assertEqual(self.evaluate(descriptor=d)["rigor_depth"]["status"], "FAIL")

    def test_outcome_level_below_application_floor_is_rejected(self):
        d = copy.deepcopy(DESCRIPTOR); d["outcome_levels"]["C-PY-LISTCOMP"] = "REMEMBER_ONLY"
        self.assertEqual(self.evaluate(descriptor=d)["rigor_depth"]["status"], "FAIL")

    def test_entry_prerequisites_are_required(self):
        d = copy.deepcopy(DESCRIPTOR); d["entry_prerequisites"] = []
        self.assertEqual(self.evaluate(descriptor=d)["rigor_depth"]["status"], "FAIL")

    def test_independent_capstone_or_transfer_is_required(self):
        d = copy.deepcopy(DESCRIPTOR); d["capstone"]["independent"] = False
        self.assertEqual(self.evaluate(descriptor=d)["rigor_depth"]["status"], "FAIL")

    def test_workload_must_be_documented(self):
        d = copy.deepcopy(DESCRIPTOR); d["workload_estimate"]["estimated_minutes"] = 0
        self.assertEqual(self.evaluate(descriptor=d)["rigor_depth"]["status"], "FAIL")

    def test_credit_hour_equivalency_cannot_be_self_claimed(self):
        d = copy.deepcopy(DESCRIPTOR); d["workload_estimate"]["credit_hour_equivalency"] = "1_CREDIT_HOUR"
        self.assertEqual(self.evaluate(descriptor=d)["rigor_depth"]["status"], "FAIL")

    def test_subject_completeness_is_bounded_not_python_expertise(self):
        r = self.evaluate()["rigor_depth"]["subject_completeness"]
        self.assertTrue(r["not_a_claim_of_complete_python_expertise"])
        self.assertTrue(r["requires_external_sme_confirmation"])

    def test_subject_completeness_without_sme_boundary_fails(self):
        d = copy.deepcopy(DESCRIPTOR); d["subject_completeness"]["requires_external_sme_confirmation"] = False
        self.assertEqual(self.evaluate(descriptor=d)["rigor_depth"]["status"], "FAIL")

    def test_tutor_support_must_fade_before_independent_mastery(self):
        d = copy.deepcopy(DESCRIPTOR); d["learner_support"]["support_fades_before_independent_mastery"] = False
        self.assertEqual(self.evaluate(descriptor=d)["support_accessibility"]["status"], "FAIL")

    def test_answer_reveal_protection_is_quality_gate(self):
        d = copy.deepcopy(DESCRIPTOR); d["learner_support"]["answer_reveal_prohibited_during_independent_checks"] = False
        self.assertEqual(self.evaluate(descriptor=d)["support_accessibility"]["status"], "FAIL")

    def test_accessibility_text_equivalent_is_required(self):
        d = copy.deepcopy(DESCRIPTOR); d["accessibility_review"]["content_text_equivalent"] = False
        self.assertEqual(self.evaluate(descriptor=d)["support_accessibility"]["status"], "FAIL")

    def test_target_native_accessibility_remains_pending_not_faked(self):
        r = self.evaluate()
        self.assertEqual(r["support_accessibility"]["accessibility"]["assistive_technology_conformance"], "TARGET_NATIVE_REVIEW_REQUIRED")

    def test_mechanical_oracle_failure_blocks_review_readiness(self):
        r = self.evaluate(oracle=False)
        self.assertEqual(r["external_review_readiness"], "BLOCKED")
        self.assertEqual(r["assessment_evidence"]["mechanical_scoring_correctness"], "FAILED")

    def test_reliability_is_not_claimed_without_real_population(self):
        r = self.evaluate()
        self.assertEqual(r["assessment_evidence"]["reliability_claim"], "NOT_ESTABLISHED")
        self.assertIn("REAL_POPULATION", r["assessment_evidence"]["internal_structure_reliability"])

    def test_validity_is_partial_not_promoted_from_mechanical_checks(self):
        self.assertEqual(self.evaluate()["assessment_evidence"]["validity_claim"], "PARTIAL_EVIDENCE_ONLY_NOT_FULLY_VALIDATED")

    def test_no_reviews_yields_pending_not_approval(self):
        self.assertEqual(adjudicate_reviews([])["status"], "PENDING_INDEPENDENT_REVIEW")

    def test_one_reviewer_is_insufficient(self):
        self.assertEqual(adjudicate_reviews([APPROVE_A])["status"], "PENDING_INDEPENDENT_REVIEW")

    def test_two_synthetic_independent_approvals_prove_logic_not_human_review(self):
        self.assertEqual(adjudicate_reviews([APPROVE_A, APPROVE_B])["status"], "SYNTHETIC_REVIEW_LOGIC_APPROVED_NOT_HUMAN_EVIDENCE")

    def test_reviewer_disagreement_does_not_average_away(self):
        self.assertEqual(adjudicate_reviews([APPROVE_A, REVISE_B])["status"], "DISAGREEMENT_REQUIRES_ADJUDICATION")

    def test_reviewer_abstention_is_preserved(self):
        self.assertEqual(adjudicate_reviews([APPROVE_A, ABSTAIN_B])["status"], "ABSTAINED_REQUIRES_ADJUDICATION")

    def test_nonindependent_second_reviewer_does_not_count(self):
        b = copy.deepcopy(APPROVE_B); b["independence"] = "SAME_GENERATOR_TEAM"
        self.assertEqual(adjudicate_reviews([APPROVE_A, b])["status"], "PENDING_INDEPENDENT_REVIEW")


    def test_duplicate_reviewer_identity_does_not_count_twice(self):
        dup = copy.deepcopy(APPROVE_A)
        self.assertEqual(adjudicate_reviews([APPROVE_A, dup])["status"], "PENDING_INDEPENDENT_REVIEW")

    def test_real_human_review_requires_distinct_roles_and_can_approve(self):
        a = copy.deepcopy(APPROVE_A); b = copy.deepcopy(APPROVE_B)
        a["evidence_class"] = "REAL_HUMAN_REVIEW"; b["evidence_class"] = "REAL_HUMAN_REVIEW"
        self.assertEqual(adjudicate_reviews([a, b])["status"], "INDEPENDENT_REVIEW_APPROVED")

    def test_external_review_approval_does_not_mint_accreditation(self):
        r = self.evaluate(reviews=[APPROVE_A, APPROVE_B])
        self.assertEqual(r["independent_review"]["status"], "SYNTHETIC_REVIEW_LOGIC_APPROVED_NOT_HUMAN_EVIDENCE")
        self.assertEqual(r["external_recognition"], "NOT_CLAIMED")

    def test_dossier_contains_explicit_limitations(self):
        lim = set(self.evaluate()["limitations"])
        self.assertIn("NO_EXTERNAL_ACCREDITATION_OR_COLLEGE_CREDIT_CLAIM", lim)
        self.assertIn("NO_JOB_READY_OR_QUALIFIED_FOR_ROLE_CLAIM", lim)

    def test_dossier_digest_is_deterministic(self):
        self.assertEqual(self.evaluate()["dossier_digest"], self.evaluate()["dossier_digest"])

    def test_capability_handoff_is_to_portfolio_not_a_second_mastery_owner(self):
        h = build_capability_evidence_handoff_template(course=self.course)
        self.assertEqual(h["version"], CAPABILITY_HANDOFF_VERSION)
        self.assertEqual(h["portfolio_owner"], "MOD-PORTFOLIO-001")
        self.assertFalse(h["course_completion_alone_is_competence"])

    def test_capability_handoff_allows_evidence_bounded_mastery_claim(self):
        h = build_capability_evidence_handoff_template(course=self.course)
        self.assertEqual(h["allowed_claim_ceiling_by_learning_stage"]["MASTERED"], "MASTERY_WITHIN_EXACT_POLICY_SCOPE")

    def test_capability_handoff_forbids_job_ready_and_certified_without_authority(self):
        h = build_capability_evidence_handoff_template(course=self.course)
        self.assertIn("JOB_READY", h["forbidden_without_external_authority"])
        self.assertIn("EXTERNALLY_CERTIFIED", h["forbidden_without_external_authority"])


if __name__ == "__main__":
    unittest.main()
