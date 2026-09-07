import json
import os
import tempfile
import unittest

from learning_lab import GroundedLearningEngine, REAL_GIT_OUTCOME, Repository, TutorDirector, TutorContextCompiler
from learning_lab.tutor import PROBES


class TutorDirectorTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "lab.sqlite3"))
        self.engine = GroundedLearningEngine(self.repo)
        self.created = self.engine.create_research_grounded_course_job(
            operation_id="OP-CREATE", job_id="JOB-CREATE", goal_id="G-GIT", title="Git feature branch workflow", desired_outcome=REAL_GIT_OUTCOME
        )
        self.course_id = self.created["course_id"]
        self.tutor = TutorDirector(self.repo, self.engine)

    def tearDown(self):
        self.td.cleanup()

    def turn(self, n, probe_id, response, help_level=0, session="S1", learner="L1", skill="S-GIT-STAGE-COMMIT"):
        return self.tutor.process_turn(
            operation_id=f"OP-T{n}", turn_id=f"T{n}", session_id=session, learner_id=learner,
            course_id=self.course_id, skill_id=skill, probe_id=probe_id, response=response,
            requested_help_level=help_level, now=100+n,
        )

    def test_clean_correct_control_does_not_invent_problem(self):
        out = self.turn(1, "TP-STAGE-1", "git add demo.txt")
        self.assertEqual(out["diagnosis"]["status"], "NO_DEFECT_OBSERVED")
        self.assertIsNone(out["diagnosis"]["primary_cause"])
        self.assertEqual(out["diagnosis"]["standing"], "DIRECT_OBSERVATION")

    def test_ambiguous_wrong_response_abstains(self):
        out = self.turn(1, "TP-STAGE-1", "I am not sure")
        self.assertEqual(out["diagnosis"]["status"], "ABSTAINED")
        self.assertIsNone(out["diagnosis"]["primary_cause"])
        self.assertIn("ABSTENTION_REQUIRED", out["diagnosis"]["reason_codes"])
        self.assertEqual(out["teaching_move"]["move"], "CLARIFYING_PROBE")

    def test_single_error_pattern_is_hypothesis_not_confirmed_misconception(self):
        out = self.turn(1, "TP-STAGE-1", "git commit -m 'Demo'")
        self.assertEqual(out["diagnosis"]["primary_cause"], "STAGING_OMITTED")
        self.assertEqual(out["diagnosis"]["standing"], "TEACHING_HYPOTHESIS")
        self.assertIn("HYPOTHESIS_NOT_CONFIRMED", out["diagnosis"]["reason_codes"])

    def test_repeated_distinct_family_pattern_can_be_evidence_supported(self):
        a = self.turn(1, "TP-STAGE-1", "git commit -m 'Demo'")
        b = self.turn(2, "TP-STAGE-2", "git commit -m 'Report'")
        self.assertEqual(a["diagnosis"]["standing"], "TEACHING_HYPOTHESIS")
        self.assertEqual(b["diagnosis"]["standing"], "EVIDENCE_SUPPORTED")
        self.assertEqual(b["diagnosis"]["primary_cause"], "STAGING_OMITTED")
        self.assertEqual(b["teaching_move"]["move"], "TARGETED_REMEDIATION")

    def test_overhelping_request_is_capped_on_first_error(self):
        out = self.turn(1, "TP-STAGE-1", "git commit -m 'Demo'", help_level=3)
        self.assertEqual(out["teaching_move"]["support_level_after"], 1)
        self.assertTrue(out["teaching_move"]["overhelping_prevented"])
        self.assertNotIn("git add demo.txt", out["teaching_move"]["content"].lower())

    def test_supported_success_forces_fade(self):
        out = self.turn(1, "TP-STAGE-1", "git add demo.txt", help_level=2)
        self.assertEqual(out["teaching_move"]["move"], "FADE_SUPPORT")
        self.assertEqual(out["teaching_move"]["support_level_after"], 0)
        self.assertEqual(out["next_action"]["target_id"], "TP-STAGE-RECHECK")

    def test_fresh_unaided_recheck_after_support_points_to_mastery_not_mastery_itself(self):
        self.turn(1, "TP-STAGE-1", "git add demo.txt", help_level=2)
        out = self.turn(2, "TP-STAGE-RECHECK", "git add plan.txt", help_level=0)
        self.assertEqual(out["teaching_move"]["move"], "INDEPENDENT_RECHECK_PASSED")
        self.assertEqual(out["next_action"]["action_type"], "MASTERY_CHECK")
        self.assertEqual(out["next_action"]["target_id"], "M-GIT-STAGE-1")
        self.assertEqual(self.repo.count_attempts(), 0, "tutor formative turns must not create mastery attempts")
        self.assertIsNone(self.repo.latest_projection("L1", self.course_id, "S-GIT-STAGE-COMMIT"))

    def test_repeated_supported_success_detects_independence_gap_without_trait_inference(self):
        self.turn(1, "TP-STAGE-1", "git add demo.txt", help_level=1)
        out = self.turn(2, "TP-STAGE-2", "git add report.txt", help_level=1)
        self.assertEqual(out["diagnosis"]["standing"], "EVIDENCE_SUPPORTED")
        self.assertEqual(out["diagnosis"]["primary_cause"], "INDEPENDENCE_NOT_YET_DEMONSTRATED")
        self.assertNotIn("personality", json.dumps(out).lower())
        self.assertNotIn("intelligence", json.dumps(out).lower())

    def test_mastery_check_help_is_blocked_and_answer_is_not_leaked(self):
        course = self.engine.course(self.course_id)
        item = next(i for i in course["items"] if i["item_id"] == "M-GIT-STAGE-1")
        out = self.tutor.process_turn(
            operation_id="OP-BLOCK", turn_id="TBLOCK", session_id="S-BLOCK", learner_id="L-BLOCK",
            course_id=self.course_id, skill_id="S-GIT-STAGE-COMMIT", probe_id=None,
            response="please give me a hint", requested_help_level=3, now=500,
            active_assessment_item_id="M-GIT-STAGE-1",
        )
        self.assertEqual(out["teaching_move"]["move"], "ASSESSMENT_INTEGRITY_BOUNDARY")
        self.assertEqual(out["teaching_move"]["support_level_after"], 0)
        self.assertNotIn(item["answer"].lower(), out["teaching_move"]["content"].lower())
        self.assertEqual(self.repo.count_attempts(), 0)

    def test_retention_check_help_is_also_blocked(self):
        out = self.tutor.process_turn(
            operation_id="OP-RBLOCK", turn_id="TRBLOCK", session_id="S-RBLOCK", learner_id="L-RBLOCK",
            course_id=self.course_id, skill_id="S-GIT-STAGE-COMMIT", probe_id=None,
            response="tell me the first command", requested_help_level=1, now=600,
            active_assessment_item_id="R-GIT-STAGE-1",
        )
        self.assertEqual(out["teaching_move"]["move"], "ASSESSMENT_INTEGRITY_BOUNDARY")
        self.assertEqual(out["next_action"]["action_type"], "RETENTION_CHECK")

    def test_context_compiler_excludes_all_answer_and_rationale_keys(self):
        compiler = TutorContextCompiler(self.repo)
        context = compiler.compile(
            session_id="SC", learner_id="LC", course_id=self.course_id, skill_id="S-GIT-STAGE-COMMIT",
            probe=PROBES["TP-STAGE-1"], active_assessment_item_id="M-GIT-STAGE-1",
        )
        text = json.dumps(context, sort_keys=True).lower()
        self.assertNotIn('"answer":', text)
        self.assertNotIn('"rationale":', text)
        self.assertNotIn("git add app.txt; git commit -m", text)
        self.assertTrue(context["active_assessment"]["answer_withheld"])

    def test_tutor_does_not_overwrite_learning_mastery_truth(self):
        self.turn(1, "TP-STAGE-1", "git add demo.txt")
        self.turn(2, "TP-STAGE-RECHECK", "git add plan.txt")
        self.assertEqual(self.repo.count_attempts(), 0)
        action = self.engine.next_action("L1", self.course_id, now=500)
        self.assertEqual(action["action_type"], "LESSON")

    def test_branch_tutor_is_blocked_until_hard_prerequisite_mastered(self):
        out = self.turn(1, "TP-BRANCH-1", "git branch hotfix", skill="S-GIT-BRANCH-MERGE")
        self.assertEqual(out["teaching_move"]["move"], "PREREQUISITE_BLOCKED")
        self.assertIn("S-GIT-STAGE-COMMIT", out["missing_prerequisite_skill_ids"])
        self.assertEqual(out["next_action"]["skill_id"], "S-GIT-STAGE-COMMIT")

    def test_branch_probe_diagnosis_after_prerequisite_mastered(self):
        self.engine.submit_attempt(operation_id="OP-MPRE", attempt_id="A-MPRE", learner_id="L1", course_id=self.course_id, item_id="M-GIT-STAGE-1", response="git add app.txt; git commit -m 'Feature work'", submitted_at=100)
        self.engine.submit_attempt(operation_id="OP-RPRE", attempt_id="A-RPRE", learner_id="L1", course_id=self.course_id, item_id="R-GIT-STAGE-1", response="git add later.txt; git commit -m 'Later work'", submitted_at=4000)
        out = self.turn(1, "TP-BRANCH-1", "git branch hotfix", skill="S-GIT-BRANCH-MERGE")
        self.assertEqual(out["diagnosis"]["primary_cause"], "BRANCH_NOT_SWITCHED")
        self.assertEqual(out["diagnosis"]["standing"], "TEACHING_HYPOTHESIS")

    def test_overcomplete_wrong_response_does_not_false_diagnose_staging_omission(self):
        out = self.turn(1, "TP-STAGE-1", "git add demo.txt; git commit -m 'Demo'")
        self.assertEqual(out["diagnosis"]["status"], "ABSTAINED")
        self.assertIsNone(out["diagnosis"]["primary_cause"])

    def test_repetition_of_same_probe_family_does_not_confirm_cause(self):
        first = self.turn(1, "TP-STAGE-1", "git commit -m 'Demo'")
        second = self.turn(2, "TP-STAGE-1", "git commit -m 'Again'")
        self.assertEqual(first["diagnosis"]["standing"], "TEACHING_HYPOTHESIS")
        self.assertEqual(second["diagnosis"]["standing"], "TEACHING_HYPOTHESIS")

    def test_factual_teaching_move_has_admitted_research_claim_refs(self):
        out = self.turn(1, "TP-STAGE-1", "git commit -m 'Demo'")
        self.assertTrue(out["teaching_move"]["claim_refs"])
        compiler = TutorContextCompiler(self.repo)
        context = compiler.compile(
            session_id="S1", learner_id="L1", course_id=self.course_id, skill_id="S-GIT-STAGE-COMMIT",
            probe=PROBES["TP-STAGE-1"],
        )
        admitted = {c["claim_id"] for c in context["admitted_claims"]}
        self.assertTrue(set(out["teaching_move"]["claim_refs"]).issubset(admitted))

    def test_unadmitted_tutor_claim_ref_is_fail_closed(self):
        class BadTutor(TutorDirector):
            def _choose_move(self, **kwargs):
                move = super()._choose_move(**kwargs)
                move["claim_refs"] = ["CL-NOT-ADMITTED"]
                return move
        bad = BadTutor(self.repo, self.engine)
        with self.assertRaisesRegex(ValueError, "TUTOR_MOVE_GROUNDING_REF_NOT_ADMITTED"):
            bad.process_turn(
                operation_id="OP-BAD", turn_id="T-BAD", session_id="S-BAD", learner_id="L-BAD",
                course_id=self.course_id, skill_id="S-GIT-STAGE-COMMIT", probe_id="TP-STAGE-1",
                response="git commit -m 'Demo'", requested_help_level=0, now=900,
            )


if __name__ == "__main__":
    unittest.main()
