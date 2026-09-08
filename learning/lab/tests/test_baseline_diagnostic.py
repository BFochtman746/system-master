import os
import tempfile
import unittest

from learning_lab import LearningEngine, Repository
from learning_lab.baseline_diagnostic import BaselineDiagnosticDirector, DiagnosticPolicyError
from learning_lab.engine import InjectedCrash
from learning_lab.domain_general import DomainGeneralLearningEngine, default_domain_registry
from learning_lab.standard_aligned_module import ASQ_DEFINE_OUTCOME, ASQDefineBehaviorOracle, asq_define_domain_spec, _sipoc_answer


class BaselineDiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.tmp.name, "lab.sqlite3"))
        self.engine = LearningEngine(self.repo)
        result = self.engine.create_course_job(
            operation_id="OP-CREATE", job_id="JOB-CREATE", goal_id="G1",
            title="Synthetic routing basics",
            desired_outcome="Classify token stability and select the correct route independently.",
        )
        self.course_id = result["course_id"]
        self.diag = BaselineDiagnosticDirector(self.repo)

    def tearDown(self):
        self.tmp.cleanup()

    def create(self, claims):
        return self.diag.create_diagnostic(
            operation_id="OP-DIAG", diagnostic_id="D1", learner_id="L1",
            course_id=self.course_id, claimed_skill_ids=claims, created_at=100,
        )

    def test_no_claim_starts_with_instruction(self):
        r = self.create([])
        self.assertEqual("LESSON", r["next_action"]["action_type"])
        self.assertEqual("S-STABILITY", r["next_action"]["skill_id"])

    def test_claimed_foundational_skill_gets_probe_not_credit(self):
        r = self.create(["S-STABILITY"])
        self.assertEqual("DIAGNOSTIC_PROBE", r["next_action"]["action_type"])
        self.assertEqual("P-STAB-1", r["next_action"]["target_id"])
        self.assertEqual(0, self.repo.count_attempts())
        self.assertIsNone(self.repo.latest_projection("L1", self.course_id, "S-STABILITY"))

    def test_advanced_claim_probes_hidden_prerequisite_first(self):
        r = self.create(["S-ROUTE"])
        self.assertEqual("DIAGNOSTIC_PROBE", r["next_action"]["action_type"])
        self.assertEqual("S-STABILITY", r["next_action"]["skill_id"])
        self.assertIn("ADVANCED_CLAIM_REQUIRES_PREREQUISITE_CHECK", r["next_action"]["reason_codes"])

    def test_correct_probe_routes_to_independent_verification_not_mastery(self):
        self.create(["S-ROUTE"])
        r = self.diag.record_probe(
            operation_id="OP-PROBE", probe_id="DP1", diagnostic_id="D1",
            item_id="P-STAB-1", response="STABLE", submitted_at=110,
        )
        self.assertEqual("OBSERVED_CORRECT_INDEPENDENT", r["probe"]["standing"])
        self.assertFalse(r["probe"]["qualifies_mastery"])
        self.assertEqual("INDEPENDENT_VERIFICATION", r["next_action"]["action_type"])
        self.assertEqual("M-STAB-1", r["next_action"]["target_id"])
        self.assertEqual(0, self.repo.count_attempts())
        self.assertIsNone(self.repo.latest_projection("L1", self.course_id, "S-STABILITY"))

    def test_incorrect_prerequisite_probe_routes_targeted_remediation(self):
        self.create(["S-ROUTE"])
        r = self.diag.record_probe(
            operation_id="OP-PROBE", probe_id="DP1", diagnostic_id="D1",
            item_id="P-STAB-1", response="UNSTABLE", submitted_at=110,
        )
        self.assertEqual("OBSERVED_INCORRECT_INDEPENDENT", r["probe"]["standing"])
        self.assertEqual("TARGETED_REMEDIATION", r["next_action"]["action_type"])
        self.assertEqual("L-STABILITY", r["next_action"]["target_id"])

    def test_blank_probe_abstains_and_uses_fresh_family(self):
        self.create(["S-STABILITY"])
        r = self.diag.record_probe(
            operation_id="OP-PROBE", probe_id="DP1", diagnostic_id="D1",
            item_id="P-STAB-1", response="", submitted_at=110,
        )
        self.assertEqual("INSUFFICIENT_EVIDENCE", r["probe"]["standing"])
        self.assertEqual("DIAGNOSTIC_PROBE", r["next_action"]["action_type"])
        self.assertEqual("P-STAB-2", r["next_action"]["target_id"])

    def test_second_fresh_probe_is_append_only_and_can_support_verification(self):
        self.create(["S-STABILITY"])
        first = self.diag.record_probe(
            operation_id="OP-PROBE-1", probe_id="DP1", diagnostic_id="D1",
            item_id="P-STAB-1", response="", submitted_at=110,
        )
        self.assertEqual("P-STAB-2", first["next_action"]["target_id"])
        second = self.diag.record_probe(
            operation_id="OP-PROBE-2", probe_id="DP2", diagnostic_id="D1",
            item_id="P-STAB-2", response="UNSTABLE", submitted_at=120,
        )
        self.assertEqual("OBSERVED_CORRECT_INDEPENDENT", second["probe"]["standing"])
        self.assertEqual("INDEPENDENT_VERIFICATION", second["next_action"]["action_type"])
        self.assertEqual(0, self.repo.count_attempts())

    def test_assisted_probe_cannot_support_bypass(self):
        self.create(["S-STABILITY"])
        r = self.diag.record_probe(
            operation_id="OP-PROBE", probe_id="DP1", diagnostic_id="D1",
            item_id="P-STAB-1", response="STABLE", submitted_at=110, assisted=True,
        )
        self.assertEqual("ASSISTED_NOT_INDEPENDENT", r["probe"]["standing"])
        self.assertNotEqual("INDEPENDENT_VERIFICATION", r["next_action"]["action_type"])
        self.assertEqual("P-STAB-2", r["next_action"]["target_id"])

    def test_answer_reveal_contaminates_probe(self):
        self.create(["S-STABILITY"])
        r = self.diag.record_probe(
            operation_id="OP-PROBE", probe_id="DP1", diagnostic_id="D1",
            item_id="P-STAB-1", response="STABLE", submitted_at=110,
            answer_revealed_before_commit=True,
        )
        self.assertEqual("ASSISTED_NOT_INDEPENDENT", r["probe"]["standing"])
        self.assertFalse(r["probe"]["qualifies_mastery"])

    def test_diagnostic_cannot_call_mastery_item_directly(self):
        self.create(["S-STABILITY"])
        with self.assertRaisesRegex(DiagnosticPolicyError, "UNAUTHORIZED_DIAGNOSTIC_PROBE"):
            self.diag.record_probe(
                operation_id="OP-PROBE", probe_id="DP1", diagnostic_id="D1",
                item_id="M-STAB-1", response="STABLE", submitted_at=110,
            )

    def test_create_recovers_after_diagnostic_pin_crash(self):
        with self.assertRaises(InjectedCrash):
            self.diag.create_diagnostic(
                operation_id="OP-DIAG", diagnostic_id="D1", learner_id="L1",
                course_id=self.course_id, claimed_skill_ids=["S-STABILITY"], created_at=100,
                crash_after_phase="DIAGNOSTIC_PINNED",
            )
        r = self.create(["S-STABILITY"])
        self.assertEqual("DIAGNOSTIC_PROBE", r["next_action"]["action_type"])

    def test_probe_recovers_after_store_crash(self):
        self.create(["S-STABILITY"])
        with self.assertRaises(InjectedCrash):
            self.diag.record_probe(operation_id="OP-PROBE", probe_id="DP1", diagnostic_id="D1",
                                   item_id="P-STAB-1", response="STABLE", submitted_at=110,
                                   crash_after_phase="PROBE_STORED")
        r = self.diag.record_probe(operation_id="OP-PROBE", probe_id="DP1", diagnostic_id="D1",
                                   item_id="P-STAB-1", response="STABLE", submitted_at=110)
        self.assertEqual("INDEPENDENT_VERIFICATION", r["next_action"]["action_type"])

    def test_probe_recovers_after_index_crash_without_duplicate_index(self):
        self.create(["S-STABILITY"])
        with self.assertRaises(InjectedCrash):
            self.diag.record_probe(operation_id="OP-PROBE", probe_id="DP1", diagnostic_id="D1",
                                   item_id="P-STAB-1", response="STABLE", submitted_at=110,
                                   crash_after_phase="PROBE_INDEXED")
        r = self.diag.record_probe(operation_id="OP-PROBE", probe_id="DP1", diagnostic_id="D1",
                                   item_id="P-STAB-1", response="STABLE", submitted_at=110)
        self.assertEqual("INDEPENDENT_VERIFICATION", r["next_action"]["action_type"])
        self.assertIsNone(self.repo.get_object("diagnostic_probe_index", "D1:S-STABILITY", 2))

    def test_probe_id_cannot_be_reused_by_different_operation(self):
        self.create(["S-STABILITY"])
        self.diag.record_probe(operation_id="OP-PROBE", probe_id="DP1", diagnostic_id="D1",
                               item_id="P-STAB-1", response="STABLE", submitted_at=110)
        with self.assertRaisesRegex(DiagnosticPolicyError, "PROBE_ID_REUSE_ACROSS_OPERATION"):
            self.diag.record_probe(operation_id="OP-PROBE-OTHER", probe_id="DP1", diagnostic_id="D1",
                                   item_id="P-STAB-1", response="STABLE", submitted_at=110)

    def test_real_asq_advanced_claim_probes_sipoc_prerequisite(self):
        with tempfile.TemporaryDirectory() as td:
            repo = Repository(os.path.join(td, "asq.sqlite3"))
            reg = default_domain_registry(); reg.register(asq_define_domain_spec())
            eng = DomainGeneralLearningEngine(repo, reg)
            cid = eng.create_research_grounded_course_job(operation_id="C", job_id="J", goal_id="G-ASQ",
                title="ASQ bounded module", desired_outcome=ASQ_DEFINE_OUTCOME)["course_id"]
            d = BaselineDiagnosticDirector(repo, scorer=ASQDefineBehaviorOracle().score)
            created = d.create_diagnostic(operation_id="D", diagnostic_id="D-ASQ", learner_id="L-ASQ",
                                          course_id=cid, claimed_skill_ids=["S-ASQ-CHARTER"], created_at=1)
            self.assertEqual("S-ASQ-SIPOC", created["next_action"]["skill_id"])
            observed = d.record_probe(operation_id="P", probe_id="P-ASQ", diagnostic_id="D-ASQ",
                                      item_id=created["next_action"]["target_id"],
                                      response=_sipoc_answer("FULFILLMENT"), submitted_at=2)
            self.assertEqual("INDEPENDENT_VERIFICATION", observed["next_action"]["action_type"])
            self.assertEqual(0, repo.count_attempts())

    def test_unknown_claim_fails_closed(self):
        with self.assertRaisesRegex(DiagnosticPolicyError, "UNKNOWN_CLAIMED_SKILL"):
            self.create(["S-NOT-REAL"])

    def test_existing_mastery_skips_diagnostic_for_current_skill(self):
        self.engine.submit_attempt(operation_id="OP-M1", attempt_id="A-M1", learner_id="L1", course_id=self.course_id,
                                   item_id="M-STAB-1", response="STABLE", submitted_at=100)
        self.engine.submit_attempt(operation_id="OP-R1", attempt_id="A-R1", learner_id="L1", course_id=self.course_id,
                                   item_id="R-STAB-1", response="UNSTABLE", submitted_at=4000)
        r = self.create(["S-ROUTE"])
        self.assertEqual("DIAGNOSTIC_PROBE", r["next_action"]["action_type"])
        self.assertEqual("S-ROUTE", r["next_action"]["skill_id"])
        self.assertEqual("P-ROUTE-1", r["next_action"]["target_id"])

    def test_retention_due_is_honored_before_new_diagnostic(self):
        self.engine.submit_attempt(operation_id="OP-M1", attempt_id="A-M1", learner_id="L1", course_id=self.course_id,
                                   item_id="M-STAB-1", response="STABLE", submitted_at=100)
        r = self.create(["S-ROUTE"])
        self.assertEqual("RETENTION_CHECK", r["next_action"]["action_type"])
        self.assertEqual("R-STAB-1", r["next_action"]["target_id"])

    def test_after_independent_verification_existing_engine_remains_authority(self):
        self.create(["S-ROUTE"])
        self.diag.record_probe(operation_id="OP-PROBE", probe_id="DP1", diagnostic_id="D1",
                               item_id="P-STAB-1", response="STABLE", submitted_at=110)
        self.engine.submit_attempt(operation_id="OP-M1", attempt_id="A-M1", learner_id="L1", course_id=self.course_id,
                                   item_id="M-STAB-1", response="STABLE", submitted_at=120)
        action = self.diag.next_action("D1")
        self.assertEqual("RETENTION_CHECK", action["action_type"])
        self.assertEqual("R-STAB-1", action["target_id"])

    def test_diagnostic_creation_is_idempotent(self):
        a = self.create(["S-STABILITY"])
        b = self.diag.create_diagnostic(
            operation_id="OP-DIAG", diagnostic_id="D1", learner_id="L1",
            course_id=self.course_id, claimed_skill_ids=["S-STABILITY"], created_at=100,
        )
        self.assertEqual(a, b)

    def test_same_operation_different_claims_rejected(self):
        self.create(["S-STABILITY"])
        with self.assertRaisesRegex(ValueError, "IDEMPOTENCY_DIGEST_MISMATCH"):
            self.diag.create_diagnostic(
                operation_id="OP-DIAG", diagnostic_id="D1", learner_id="L1",
                course_id=self.course_id, claimed_skill_ids=["S-ROUTE"], created_at=100,
            )

    def test_probe_replay_is_idempotent(self):
        self.create(["S-STABILITY"])
        kwargs = dict(operation_id="OP-PROBE", probe_id="DP1", diagnostic_id="D1",
                      item_id="P-STAB-1", response="STABLE", submitted_at=110)
        a = self.diag.record_probe(**kwargs)
        b = self.diag.record_probe(**kwargs)
        self.assertEqual(a, b)

    def test_probe_replay_payload_change_rejected(self):
        self.create(["S-STABILITY"])
        self.diag.record_probe(operation_id="OP-PROBE", probe_id="DP1", diagnostic_id="D1",
                               item_id="P-STAB-1", response="STABLE", submitted_at=110)
        with self.assertRaisesRegex(ValueError, "IDEMPOTENCY_DIGEST_MISMATCH"):
            self.diag.record_probe(operation_id="OP-PROBE", probe_id="DP1", diagnostic_id="D1",
                                   item_id="P-STAB-1", response="UNSTABLE", submitted_at=110)

    def test_diagnostic_never_changes_attempt_count_or_projection_history(self):
        self.create(["S-STABILITY"])
        before_attempts = self.repo.count_attempts()
        before_history = self.repo.projection_history("L1", self.course_id, "S-STABILITY")
        self.diag.record_probe(operation_id="OP-PROBE", probe_id="DP1", diagnostic_id="D1",
                               item_id="P-STAB-1", response="STABLE", submitted_at=110)
        self.assertEqual(before_attempts, self.repo.count_attempts())
        self.assertEqual(before_history, self.repo.projection_history("L1", self.course_id, "S-STABILITY"))

    def test_non_exact_probe_without_independent_scorer_fails_closed(self):
        course = self.engine.course(self.course_id)
        course["items"][0]["scoring_type"] = "CUSTOM"
        self.repo.put_object("course", "COURSE-G2", 1, {**course, "course_id": "COURSE-G2"})
        d = BaselineDiagnosticDirector(self.repo)
        d.create_diagnostic(operation_id="OP-D2", diagnostic_id="D2", learner_id="L1",
                            course_id="COURSE-G2", claimed_skill_ids=["S-STABILITY"], created_at=1)
        with self.assertRaisesRegex(DiagnosticPolicyError, "DIAGNOSTIC_SCORER_REQUIRED"):
            d.record_probe(operation_id="OP-P2", probe_id="DP2", diagnostic_id="D2",
                           item_id="P-STAB-1", response="STABLE", submitted_at=2)

    def test_injected_independent_scorer_supports_non_exact_probe(self):
        course = self.engine.course(self.course_id)
        course["items"][0]["scoring_type"] = "CUSTOM"
        self.repo.put_object("course", "COURSE-G2", 1, {**course, "course_id": "COURSE-G2"})
        d = BaselineDiagnosticDirector(self.repo, scorer=lambda item, response: response == "OK")
        d.create_diagnostic(operation_id="OP-D2", diagnostic_id="D2", learner_id="L1",
                            course_id="COURSE-G2", claimed_skill_ids=["S-STABILITY"], created_at=1)
        r = d.record_probe(operation_id="OP-P2", probe_id="DP2", diagnostic_id="D2",
                           item_id="P-STAB-1", response="OK", submitted_at=2)
        self.assertEqual("INDEPENDENT_VERIFICATION", r["next_action"]["action_type"])


if __name__ == "__main__":
    unittest.main()
