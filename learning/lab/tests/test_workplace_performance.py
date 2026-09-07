from __future__ import annotations

import copy
import json
import os
import tempfile
import unittest
from pathlib import Path

from qualification_impl009 import build_seed
from learning_lab import (
    InjectedCrash,
    WorkplacePerformanceService,
    evaluate_workplace_submission,
    adjudicate_workplace_defense_reviews,
    build_capability_evidence_dossier,
    build_portfolio_handoff,
    verify_portfolio_handoff,
)

ROOT = Path(__file__).resolve().parents[1]
SCENARIO = json.loads((ROOT / "sources" / "PYTHON_COMPREHENSIONS_WORKPLACE_SCENARIO_V1.json").read_text())


def valid_submission(submission_id="WP-SUB-1"):
    return {
        "submission_id": submission_id,
        "learner_id": "L",
        "course_id": "COURSE-G-PY-REFRESH",
        "conditions": {
            "assisted": False,
            "answer_revealed_before_commit": False,
            "scenario_previously_seen": False,
            "environment": "BOUNDED_LAB_SANDBOX",
        },
        "artifact": {
            "priority_expression": '[r["order_id"] for r in records if r["status"] == "late" and r["amount"] >= 800]',
            "late_amount_expression": '{r["order_id"]: r["amount"] for r in records if r["status"] == "late"}',
            "declared_outputs": {
                "priority_order_ids": ["A100", "A102"],
                "late_amount_by_id": {"A100": 1200, "A102": 900, "A104": 700},
            },
        },
        "defense_responses": {
            "D1": "A list preserves the ordered priority IDs the supervisor can work through directly.",
            "D2": "order_id is the lookup key; I would verify uniqueness because duplicate keys can overwrite values.",
        },
    }


SYN = {"reviewer_id":"SUP-1","role":"WORKPLACE_REVIEWER","independence":"INDEPENDENT","evidence_class":"SYNTHETIC_TEST_FIXTURE","standing":"APPROVE"}
REAL = {"reviewer_id":"SUP-REAL","role":"WORKPLACE_REVIEWER","independence":"INDEPENDENT","evidence_class":"REAL_HUMAN_REVIEW","standing":"APPROVE"}


class WorkplacePerformanceTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo, self.engine, self.out = build_seed(os.path.join(self.td.name, "seed.db"), learner=True)
        self.course = self.repo.get_object("course", self.out["course_id"], 1)

    def tearDown(self):
        self.td.cleanup()

    def evaluate(self, sub=None):
        return evaluate_workplace_submission(scenario=SCENARIO, submission=sub or valid_submission())

    def test_valid_artifact_is_mechanically_verified(self):
        r = self.evaluate()
        self.assertEqual(r["mechanical_artifact_verification"], "PASS")
        self.assertEqual(r["status"], "MECHANICALLY_VERIFIED_DEFENSE_REVIEW_REQUIRED")

    def test_expected_outputs_are_derived_from_scenario(self):
        r = self.evaluate()
        self.assertEqual(r["observed_outputs"]["priority_order_ids"], ["A100", "A102"])
        self.assertEqual(r["observed_outputs"]["late_amount_by_id"], {"A100":1200,"A102":900,"A104":700})

    def test_wrong_business_rule_fails(self):
        s=valid_submission(); s["artifact"]["priority_expression"]='[r["order_id"] for r in records if r["status"] == "late"]'
        r=self.evaluate(s)
        self.assertEqual(r["status"], "FAILED_WORKPLACE_PERFORMANCE")
        self.assertIn("BUSINESS_OUTPUT_MISMATCH", r["failures"])

    def test_plain_list_literal_cannot_fake_list_comprehension(self):
        s=valid_submission(); s["artifact"]["priority_expression"]='["A100", "A102"]'
        r=self.evaluate(s)
        self.assertTrue(any("WORKPLACE_LIST_COMPREHENSION_REQUIRED" in x for x in r["failures"]))

    def test_plain_dict_literal_cannot_fake_dict_comprehension(self):
        s=valid_submission(); s["artifact"]["late_amount_expression"]='{"A100":1200,"A102":900,"A104":700}'
        r=self.evaluate(s)
        self.assertTrue(any("WORKPLACE_DICT_COMPREHENSION_REQUIRED" in x for x in r["failures"]))

    def test_unsafe_call_is_rejected(self):
        s=valid_submission(); s["artifact"]["priority_expression"]='__import__("os").system("echo pwn")'
        r=self.evaluate(s)
        self.assertTrue(any("FORBIDDEN" in x for x in r["failures"]))

    def test_unknown_name_is_rejected(self):
        s=valid_submission(); s["artifact"]["priority_expression"]='[x for x in secret]'
        r=self.evaluate(s)
        self.assertTrue(any("NAME_FORBIDDEN" in x for x in r["failures"]))

    def test_declared_output_must_match_executed_artifact(self):
        s=valid_submission(); s["artifact"]["declared_outputs"]["priority_order_ids"]=["A100"]
        r=self.evaluate(s)
        self.assertIn("DECLARED_OUTPUT_DOES_NOT_MATCH_EXECUTED_ARTIFACT",r["failures"])

    def test_assistance_contaminates_independent_capability_evidence(self):
        s=valid_submission(); s["conditions"]["assisted"]=True
        self.assertEqual(self.evaluate(s)["status"], "INADMISSIBLE_FOR_INDEPENDENT_CAPABILITY_EVIDENCE")

    def test_answer_reveal_contaminates_independence(self):
        s=valid_submission(); s["conditions"]["answer_revealed_before_commit"]=True
        self.assertEqual(self.evaluate(s)["status"], "INADMISSIBLE_FOR_INDEPENDENT_CAPABILITY_EVIDENCE")

    def test_seen_scenario_contaminates_first_authentic_evidence(self):
        s=valid_submission(); s["conditions"]["scenario_previously_seen"]=True
        self.assertEqual(self.evaluate(s)["status"], "INADMISSIBLE_FOR_INDEPENDENT_CAPABILITY_EVIDENCE")

    def test_defense_must_be_structurally_complete(self):
        s=valid_submission(); s["defense_responses"]["D2"]="short"
        r=self.evaluate(s)
        self.assertEqual(r["status"], "FAILED_WORKPLACE_PERFORMANCE")
        self.assertEqual(r["defense_semantic_standing"], "STRUCTURALLY_INCOMPLETE")

    def test_defense_is_not_mechanically_promoted_to_professional_judgment(self):
        self.assertEqual(self.evaluate()["criterion_results"]["WP-PY-04"], "HUMAN_REVIEW_REQUIRED")

    def test_no_defense_review_remains_pending(self):
        self.assertEqual(adjudicate_workplace_defense_reviews([])["status"], "PENDING_HUMAN_DEFENSE_REVIEW")

    def test_synthetic_defense_review_proves_logic_not_human_judgment(self):
        self.assertEqual(adjudicate_workplace_defense_reviews([SYN])["status"], "SYNTHETIC_REVIEW_LOGIC_APPROVED_NOT_HUMAN_EVIDENCE")

    def test_real_human_defense_review_can_approve_state_logic(self):
        self.assertEqual(adjudicate_workplace_defense_reviews([REAL])["status"], "INDEPENDENT_HUMAN_DEFENSE_APPROVED")

    def test_duplicate_defense_reviewer_identity_is_rejected(self):
        self.assertEqual(adjudicate_workplace_defense_reviews([SYN,copy.deepcopy(SYN)])["status"], "PENDING_HUMAN_DEFENSE_REVIEW")

    def test_dossier_combines_mastery_and_new_workplace_evidence(self):
        ev=self.evaluate()
        d=build_capability_evidence_dossier(repo=self.repo,course=self.course,learner_id="L",evaluation=ev)
        self.assertEqual(len(d["learning_skill_evidence"]),2)
        self.assertTrue(all(x["stage"]=="MASTERED" for x in d["learning_skill_evidence"]))
        self.assertIn("A-LC-M", d["learning_skill_evidence"][0]["canonical_evidence_refs"])

    def test_dossier_with_pending_defense_caps_claim(self):
        d=build_capability_evidence_dossier(repo=self.repo,course=self.course,learner_id="L",evaluation=self.evaluate())
        self.assertEqual(d["claim_ceiling"], "AUTHENTIC_WORKPLACE_ARTIFACT_MECHANICALLY_DEMONSTRATED_DEFENSE_REVIEW_PENDING")

    def test_real_human_defense_can_raise_only_bounded_scenario_claim(self):
        d=build_capability_evidence_dossier(repo=self.repo,course=self.course,learner_id="L",evaluation=self.evaluate(),defense_reviews=[REAL])
        self.assertEqual(d["claim_ceiling"], "AUTHENTIC_WORKPLACE_TASK_DEMONSTRATED_WITHIN_DECLARED_SCENARIO")
        self.assertIn("JOB_READY", d["forbidden_claims_without_external_authority"])

    def test_no_mastery_does_not_get_mastery_claim(self):
        ev=self.evaluate()
        d=build_capability_evidence_dossier(repo=self.repo,course=self.course,learner_id="UNKNOWN",evaluation=ev)
        self.assertEqual(d["claim_ceiling"], "BOUNDED_WORKPLACE_TASK_MECHANICALLY_DEMONSTRATED_NO_MASTERY_CLAIM")

    def test_failed_workplace_task_cannot_create_success_claim(self):
        s=valid_submission(); s["artifact"]["priority_expression"]='[r["order_id"] for r in records]'
        ev=self.evaluate(s)
        d=build_capability_evidence_dossier(repo=self.repo,course=self.course,learner_id="L",evaluation=ev)
        self.assertEqual(d["claim_ceiling"], "NO_SUCCESSFUL_WORKPLACE_PERFORMANCE_CLAIM")

    def test_assisted_workplace_task_cannot_create_independent_claim(self):
        s=valid_submission(); s["conditions"]["assisted"]=True
        d=build_capability_evidence_dossier(repo=self.repo,course=self.course,learner_id="L",evaluation=self.evaluate(s))
        self.assertEqual(d["claim_ceiling"], "NO_INDEPENDENT_CAPABILITY_CLAIM")

    def test_portfolio_handoff_is_read_only(self):
        d=build_capability_evidence_dossier(repo=self.repo,course=self.course,learner_id="L",evaluation=self.evaluate())
        h=build_portfolio_handoff(dossier=d)
        self.assertTrue(h["read_only"])
        self.assertFalse(h["portfolio_may_rewrite_competence_truth"])

    def test_portfolio_handoff_preserves_claim_ceiling(self):
        d=build_capability_evidence_dossier(repo=self.repo,course=self.course,learner_id="L",evaluation=self.evaluate())
        h=build_portfolio_handoff(dossier=d)
        self.assertEqual(h["claim_ceiling"],d["claim_ceiling"])
        self.assertEqual(verify_portfolio_handoff(dossier=d,handoff=h)["status"],"PASS")

    def test_portfolio_cannot_promote_job_ready(self):
        d=build_capability_evidence_dossier(repo=self.repo,course=self.course,learner_id="L",evaluation=self.evaluate())
        h=build_portfolio_handoff(dossier=d); h["claim_ceiling"]="JOB_READY"
        self.assertEqual(verify_portfolio_handoff(dossier=d,handoff=h)["status"],"FAIL")

    def test_dossier_tampering_is_detected(self):
        d=build_capability_evidence_dossier(repo=self.repo,course=self.course,learner_id="L",evaluation=self.evaluate())
        h=build_portfolio_handoff(dossier=d); d["claim_ceiling"]="JOB_READY"
        self.assertEqual(verify_portfolio_handoff(dossier=d,handoff=h)["status"],"FAIL")

    def test_dossier_exposes_resolvable_workplace_evidence_refs(self):
        d=build_capability_evidence_dossier(repo=self.repo,course=self.course,learner_id="L",evaluation=self.evaluate())
        self.assertIn("workplace_submission:WP-SUB-1:v1", d["canonical_workplace_evidence_refs"])
        self.assertEqual(d["artifact_ref"], "workplace_submission:WP-SUB-1:v1#artifact")

    def test_portfolio_handoff_links_without_copying_competence_authority(self):
        d=build_capability_evidence_dossier(repo=self.repo,course=self.course,learner_id="L",evaluation=self.evaluate())
        h=build_portfolio_handoff(dossier=d)
        self.assertEqual(h["artifact_ref"], d["artifact_ref"])
        self.assertEqual(h["source_owner"], "LEARNING_COMPETENCE_EVIDENCE_SEMANTICS")
        self.assertEqual(h["canonical_workplace_evidence_refs"], d["canonical_workplace_evidence_refs"])

    def test_service_does_not_mutate_learning_attempts_or_projections(self):
        before_attempts=self.repo.count_attempts()
        before={s["skill_id"]:self.repo.latest_projection("L",self.course["course_id"],s["skill_id"]) for s in self.course["skills"]}
        svc=WorkplacePerformanceService(self.repo,SCENARIO)
        svc.execute(operation_id="WP-OP",job_id="WP-JOB",course=self.course,learner_id="L",submission=valid_submission())
        self.assertEqual(self.repo.count_attempts(),before_attempts)
        self.assertEqual(before,{s["skill_id"]:self.repo.latest_projection("L",self.course["course_id"],s["skill_id"]) for s in self.course["skills"]})

    def test_service_replay_is_idempotent(self):
        svc=WorkplacePerformanceService(self.repo,SCENARIO); sub=valid_submission()
        a=svc.execute(operation_id="WP-OP",job_id="WP-JOB",course=self.course,learner_id="L",submission=sub)
        b=svc.execute(operation_id="WP-OP",job_id="WP-JOB",course=self.course,learner_id="L",submission=sub)
        self.assertEqual(a,b)
        self.assertEqual(self.repo.count_objects("capability_evidence_dossier"),1)

    def test_same_operation_changed_submission_conflicts(self):
        svc=WorkplacePerformanceService(self.repo,SCENARIO); sub=valid_submission()
        svc.execute(operation_id="WP-OP",job_id="WP-JOB",course=self.course,learner_id="L",submission=sub)
        bad=copy.deepcopy(sub); bad["defense_responses"]["D1"] += " changed"
        with self.assertRaisesRegex(ValueError,"IDEMPOTENCY_DIGEST_MISMATCH"):
            svc.execute(operation_id="WP-OP",job_id="WP-JOB",course=self.course,learner_id="L",submission=bad)

    def test_same_submission_identity_changed_content_collides(self):
        svc=WorkplacePerformanceService(self.repo,SCENARIO); sub=valid_submission()
        svc.execute(operation_id="WP-OP",job_id="WP-JOB",course=self.course,learner_id="L",submission=sub)
        changed=copy.deepcopy(sub); changed["defense_responses"]["D1"] += " changed"
        with self.assertRaisesRegex(ValueError,"OBJECT_IDENTITY_COLLISION|IDEMPOTENCY_DIGEST_MISMATCH"):
            svc.execute(operation_id="WP-OP2",job_id="WP-JOB2",course=self.course,learner_id="L",submission=changed)

    def test_every_crash_boundary_recovers(self):
        for phase in WorkplacePerformanceService.PHASES:
            with self.subTest(phase=phase):
                td=tempfile.TemporaryDirectory()
                try:
                    repo,eng,out=build_seed(os.path.join(td.name,"x.db"),learner=True)
                    course=repo.get_object("course",out["course_id"],1)
                    svc=WorkplacePerformanceService(repo,SCENARIO); sub=valid_submission("SUB-"+phase)
                    with self.assertRaises(InjectedCrash):
                        svc.execute(operation_id="OP-"+phase,job_id="JOB-"+phase,course=course,learner_id="L",submission=sub,crash_after_phase=phase)
                    svc2=WorkplacePerformanceService(repo,SCENARIO)
                    out2=svc2.execute(operation_id="OP-"+phase,job_id="JOB-"+phase,course=course,learner_id="L",submission=sub)
                    self.assertEqual(out2["status"],"COMPLETE")
                finally: td.cleanup()

    def test_submission_learner_identity_must_match_service_subject(self):
        svc=WorkplacePerformanceService(self.repo,SCENARIO); sub=valid_submission(); sub["learner_id"]="OTHER"
        with self.assertRaisesRegex(ValueError,"WORKPLACE_SUBMISSION_LEARNER_MISMATCH"):
            svc.execute(operation_id="WP-ID-L",job_id="WP-ID-L-J",course=self.course,learner_id="L",submission=sub)

    def test_submission_course_identity_must_match_service_subject(self):
        svc=WorkplacePerformanceService(self.repo,SCENARIO); sub=valid_submission(); sub["course_id"]="OTHER"
        with self.assertRaisesRegex(ValueError,"WORKPLACE_SUBMISSION_COURSE_MISMATCH"):
            svc.execute(operation_id="WP-ID-C",job_id="WP-ID-C-J",course=self.course,learner_id="L",submission=sub)

    def test_scenario_drift_after_crash_fails_closed(self):
        svc=WorkplacePerformanceService(self.repo,SCENARIO); sub=valid_submission("DRIFT-SUB")
        with self.assertRaises(InjectedCrash):
            svc.execute(operation_id="WP-DRIFT",job_id="WP-DRIFT-J",course=self.course,learner_id="L",submission=sub,crash_after_phase="SCENARIO_BOUND")
        changed=copy.deepcopy(SCENARIO); changed["requirements"]["priority_threshold"]=900
        svc2=WorkplacePerformanceService(self.repo,changed)
        with self.assertRaisesRegex(ValueError,"WORKPLACE_JOB_PAYLOAD_DRIFT|WORKPLACE_SCENARIO_DRIFT"):
            svc2.execute(operation_id="WP-DRIFT",job_id="WP-DRIFT-J",course=self.course,learner_id="L",submission=sub)

    def test_scenario_skill_binding_must_match_course(self):
        changed=copy.deepcopy(SCENARIO); changed["course_skill_refs"].append("S-NOT-IN-COURSE")
        svc=WorkplacePerformanceService(self.repo,changed)
        with self.assertRaisesRegex(ValueError,"WORKPLACE_SCENARIO_SKILL_BINDING_MISMATCH"):
            svc.execute(operation_id="WP-SKILL",job_id="WP-SKILL-J",course=self.course,learner_id="L",submission=valid_submission())


if __name__ == "__main__": unittest.main()
