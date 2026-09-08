from __future__ import annotations

import copy
import json
import os
import tempfile
import unittest
from pathlib import Path

from qualification_impl009 import build_seed
from learning_lab import (
    InjectedCrash, WorkplacePerformanceService,
    evaluate_requirement_coverage, build_gap_plan, build_role_portfolio_handoff,
    verify_role_portfolio_handoff, RoleCompetencyCoverageService,
)

ROOT = Path(__file__).resolve().parents[1]
SC1 = json.loads((ROOT / "sources" / "PYTHON_COMPREHENSIONS_WORKPLACE_SCENARIO_V1.json").read_text())
SC2 = json.loads((ROOT / "sources" / "PYTHON_COMPREHENSIONS_WORKPLACE_SCENARIO_V2_SERVICE.json").read_text())
REQ = json.loads((ROOT / "sources" / "ROLE_PYTHON_OPS_REQUIREMENT_SET_V1.json").read_text())
CATALOG = {SC1["scenario_id"]: SC1, SC2["scenario_id"]: SC2}
SYN = {"reviewer_id":"SYN-REV","role":"WORKPLACE_REVIEWER","independence":"INDEPENDENT","evidence_class":"SYNTHETIC_TEST_FIXTURE","standing":"APPROVE"}
HUMAN_LOGIC_FIXTURE = {"reviewer_id":"HUMAN-FIXTURE","role":"WORKPLACE_REVIEWER","independence":"INDEPENDENT","evidence_class":"REAL_HUMAN_REVIEW","standing":"APPROVE"}


def submission1(sid="ROLE-SUB-1", observed_at=1000):
    return {
        "submission_id":sid,"learner_id":"L","course_id":"COURSE-G-PY-REFRESH","observed_at":observed_at,
        "conditions":{"assisted":False,"answer_revealed_before_commit":False,"scenario_previously_seen":False,"environment":"BOUNDED_LAB_SANDBOX"},
        "artifact":{
            "priority_expression":'[r["order_id"] for r in records if r["status"] == "late" and r["amount"] >= 800]',
            "late_amount_expression":'{r["order_id"]: r["amount"] for r in records if r["status"] == "late"}',
            "declared_outputs":{"priority_order_ids":["A100","A102"],"late_amount_by_id":{"A100":1200,"A102":900,"A104":700}},
        },
        "defense_responses":{"D1":"The ordered list gives the supervisor a direct priority queue while preserving input order.","D2":"The order identifier is the key; I would validate uniqueness and missing values before production use."},
    }


def submission2(sid="ROLE-SUB-2", observed_at=1100):
    return {
        "submission_id":sid,"learner_id":"L","course_id":"COURSE-G-PY-REFRESH","observed_at":observed_at,
        "conditions":{"assisted":False,"answer_revealed_before_commit":False,"scenario_previously_seen":False,"environment":"BOUNDED_LAB_SANDBOX"},
        "artifact":{
            "priority_expression":'[r["case_id"] for r in records if r["state"] == "escalated" and r["severity_score"] >= 7]',
            "mapping_expression":'{r["case_id"]: r["severity_score"] for r in records if r["state"] == "escalated"}',
            "declared_outputs":{"priority_case_ids":["T201","T203"],"escalated_severity_by_id":{"T201":9,"T203":7,"T205":6}},
        },
        "defense_responses":{"D1":"The ordered case list gives the supervisor a bounded escalation queue that preserves source ordering.","D2":"The case identifier is the lookup key; I would validate duplicate IDs and severity data before operational use."},
    }


class RoleCompetencyCoverageTests(unittest.TestCase):
    def setUp(self):
        self.td=tempfile.TemporaryDirectory()
        self.repo,self.engine,self.out=build_seed(os.path.join(self.td.name,"seed.db"),learner=True)
        self.course=self.repo.get_object("course",self.out["course_id"],1)
        self.d1=self.make_dossier(SC1, submission1(), "A", [SYN])
        self.d2=self.make_dossier(SC2, submission2(), "B", [SYN])

    def tearDown(self): self.td.cleanup()

    def make_dossier(self, scenario, sub, suffix, reviews):
        out=WorkplacePerformanceService(self.repo,scenario).execute(
            operation_id="WP-ROLE-"+suffix,job_id="WP-ROLE-J-"+suffix,course=self.course,learner_id="L",submission=sub,defense_reviews=reviews)
        return self.repo.get_object("capability_evidence_dossier",out["capability_dossier_id"],1)

    def coverage(self,dossiers=None,req=None,as_of=1200,learner="L",catalog=None):
        return evaluate_requirement_coverage(requirement_set=req or REQ,learner_id=learner,dossiers=dossiers or [self.d1,self.d2],scenario_catalog=catalog or CATALOG,as_of=as_of)

    def by_id(self,cov,rid): return next(x for x in cov["requirement_coverage"] if x["requirement_id"]==rid)

    def test_second_scenario_is_mechanically_verified(self):
        self.assertEqual(self.d2["assessment_conditions"]["mechanical_artifact_verification"],"PASS")
        self.assertEqual(self.d2["workplace_scenario_id"],SC2["scenario_id"])

    def test_two_distinct_scenario_families_support_mechanical_requirements(self):
        c=self.coverage()
        for rid in ("REQ-PY-OPS-01","REQ-PY-OPS-02","REQ-PY-OPS-03"):
            self.assertEqual(self.by_id(c,rid)["status"],"SUPPORTED")

    def test_human_judgment_requirement_remains_partial_with_synthetic_reviews(self):
        c=self.coverage()
        r=self.by_id(c,"REQ-PY-OPS-04")
        self.assertEqual(r["status"],"PARTIALLY_SUPPORTED")
        self.assertIn("HUMAN_DEFENSE_REVIEW_REQUIRED",r["reason_codes"])

    def test_overall_requirement_set_is_partial_not_job_ready(self):
        c=self.coverage()
        self.assertEqual(c["coverage_standing"],"DECLARED_REQUIREMENT_SET_PARTIALLY_SUPPORTED")
        self.assertEqual(c["external_eligibility_decision"],"NOT_MADE")
        self.assertIn("JOB_READY",c["forbidden_claims_without_external_authority"])

    def test_one_scenario_is_not_enough_for_diversity(self):
        c=self.coverage([self.d1])
        self.assertEqual(self.by_id(c,"REQ-PY-OPS-01")["status"],"PARTIALLY_SUPPORTED")
        self.assertIn("INSUFFICIENT_SCENARIO_DIVERSITY",self.by_id(c,"REQ-PY-OPS-01")["reason_codes"])

    def test_duplicate_same_family_does_not_create_diversity(self):
        d=copy.deepcopy(self.d1); d.pop("dossier_digest"); d["workplace_scenario_id"]=SC1["scenario_id"]; from learning_lab.repository import digest; d["dossier_digest"]=digest(d)
        c=self.coverage([self.d1,d])
        self.assertEqual(len(self.by_id(c,"REQ-PY-OPS-01")["distinct_scenario_families"]),1)
        self.assertEqual(self.by_id(c,"REQ-PY-OPS-01")["status"],"PARTIALLY_SUPPORTED")

    def test_distinct_family_but_same_independence_group_does_not_count_as_independent(self):
        cat=copy.deepcopy(CATALOG); cat[SC2["scenario_id"]]["independence_group"]=SC1["independence_group"]
        c=self.coverage(catalog=cat)
        self.assertEqual(self.by_id(c,"REQ-PY-OPS-03")["status"],"PARTIALLY_SUPPORTED")

    def test_stale_evidence_is_not_current_support(self):
        c=self.coverage(as_of=1100+86401)
        self.assertEqual(self.by_id(c,"REQ-PY-OPS-01")["status"],"STALE")
        self.assertTrue(self.by_id(c,"REQ-PY-OPS-01")["stale_evidence_refs"])

    def test_wrong_learner_has_no_support(self):
        c=self.coverage(learner="OTHER")
        self.assertEqual(self.by_id(c,"REQ-PY-OPS-01")["status"],"NOT_SUPPORTED")

    def test_unverified_mapping_cannot_be_used_consequentially(self):
        req=copy.deepcopy(REQ); req["requirements"][0]["mapping"]["standing"]="AI_INFERRED_SIMILARITY"
        c=self.coverage(req=req)
        self.assertEqual(self.by_id(c,"REQ-PY-OPS-01")["status"],"MAPPING_UNVERIFIED")

    def test_corrupt_dossier_is_inadmissible_if_only_evidence(self):
        bad=copy.deepcopy(self.d1); bad["claim_ceiling"]="JOB_READY"
        c=self.coverage([bad])
        self.assertEqual(self.by_id(c,"REQ-PY-OPS-01")["status"],"INADMISSIBLE_FOR_USE")

    def test_failed_workplace_dossier_does_not_support_requirement(self):
        badsub=submission2("BAD-SUB"); badsub["artifact"]["priority_expression"]='[r["case_id"] for r in records]'
        bad=self.make_dossier(SC2,badsub,"BAD",[SYN])
        c=self.coverage([bad])
        self.assertEqual(self.by_id(c,"REQ-PY-OPS-01")["status"],"NOT_SUPPORTED")

    def test_assisted_workplace_dossier_does_not_support_requirement(self):
        sub=submission2("AST-SUB"); sub["conditions"]["assisted"]=True
        bad=self.make_dossier(SC2,sub,"AST",[SYN])
        c=self.coverage([bad])
        self.assertEqual(self.by_id(c,"REQ-PY-OPS-01")["status"],"NOT_SUPPORTED")

    def test_gap_plan_names_missing_scenario_diversity(self):
        p=build_gap_plan(coverage=self.coverage([self.d1]))
        self.assertTrue(any(x["gap_code"]=="SCENARIO_DIVERSITY_GAP" for x in p["actions"]))

    def test_gap_plan_is_planning_only_not_competence(self):
        p=build_gap_plan(coverage=self.coverage())
        self.assertTrue(p["planning_only"]); self.assertTrue(p["does_not_create_competence"])

    def test_full_logic_with_human_review_fixture_supports_defense_requirement(self):
        d1=self.make_dossier(SC1,submission1("H1",1300),"H1",[HUMAN_LOGIC_FIXTURE])
        d2=self.make_dossier(SC2,submission2("H2",1400),"H2",[HUMAN_LOGIC_FIXTURE])
        c=self.coverage([d1,d2],as_of=1500)
        self.assertEqual(self.by_id(c,"REQ-PY-OPS-04")["status"],"SUPPORTED")
        self.assertEqual(c["external_eligibility_decision"],"NOT_MADE")

    def test_portfolio_handoff_is_read_only_and_links_evidence(self):
        c=self.coverage(); p=build_gap_plan(coverage=c); h=build_role_portfolio_handoff(coverage=c,gap_plan=p)
        self.assertTrue(h["read_only"]); self.assertFalse(h["portfolio_may_rewrite_competence_truth"])
        self.assertGreaterEqual(len(h["canonical_capability_evidence_refs"]),2)
        self.assertEqual(verify_role_portfolio_handoff(coverage=c,gap_plan=p,handoff=h)["status"],"PASS")

    def test_portfolio_cannot_change_coverage_standing(self):
        c=self.coverage(); p=build_gap_plan(coverage=c); h=build_role_portfolio_handoff(coverage=c,gap_plan=p); h["coverage_standing"]="JOB_READY"
        self.assertEqual(verify_role_portfolio_handoff(coverage=c,gap_plan=p,handoff=h)["status"],"FAIL")

    def test_portfolio_cannot_make_external_eligibility_decision(self):
        c=self.coverage(); p=build_gap_plan(coverage=c); h=build_role_portfolio_handoff(coverage=c,gap_plan=p); h["external_eligibility_decision"]="QUALIFIED_FOR_ROLE"
        self.assertEqual(verify_role_portfolio_handoff(coverage=c,gap_plan=p,handoff=h)["status"],"FAIL")

    def test_coverage_tampering_is_detected(self):
        c=self.coverage(); p=build_gap_plan(coverage=c); h=build_role_portfolio_handoff(coverage=c,gap_plan=p); c["coverage_standing"]="DECLARED_REQUIREMENT_SET_EVIDENCE_SUPPORTED"
        self.assertEqual(verify_role_portfolio_handoff(coverage=c,gap_plan=p,handoff=h)["status"],"FAIL")

    def test_gap_plan_tampering_is_detected(self):
        c=self.coverage(); p=build_gap_plan(coverage=c); h=build_role_portfolio_handoff(coverage=c,gap_plan=p); p["complete"]=True
        self.assertEqual(verify_role_portfolio_handoff(coverage=c,gap_plan=p,handoff=h)["status"],"FAIL")

    def test_service_persists_coverage_gap_and_handoff(self):
        svc=RoleCompetencyCoverageService(self.repo,REQ,CATALOG)
        out=svc.execute(operation_id="RC-OP",job_id="RC-JOB",learner_id="L",dossiers=[self.d1,self.d2],as_of=1200)
        self.assertEqual(out["status"],"COMPLETE")
        self.assertEqual(self.repo.count_objects("role_requirement_coverage"),1)
        self.assertEqual(self.repo.count_objects("role_gap_plan"),1)
        self.assertEqual(self.repo.count_objects("role_portfolio_handoff"),1)

    def test_service_replay_is_idempotent(self):
        svc=RoleCompetencyCoverageService(self.repo,REQ,CATALOG)
        a=svc.execute(operation_id="RC-IDEM",job_id="RC-IDEM-J",learner_id="L",dossiers=[self.d1,self.d2],as_of=1200)
        b=svc.execute(operation_id="RC-IDEM",job_id="RC-IDEM-J",learner_id="L",dossiers=[self.d1,self.d2],as_of=1200)
        self.assertEqual(a,b)

    def test_same_operation_changed_evidence_conflicts(self):
        svc=RoleCompetencyCoverageService(self.repo,REQ,CATALOG)
        svc.execute(operation_id="RC-CHG",job_id="RC-CHG-J",learner_id="L",dossiers=[self.d1,self.d2],as_of=1200)
        with self.assertRaisesRegex(ValueError,"IDEMPOTENCY_DIGEST_MISMATCH"):
            svc.execute(operation_id="RC-CHG",job_id="RC-CHG-J",learner_id="L",dossiers=[self.d1],as_of=1200)

    def test_requirement_set_identity_collision_fails_closed(self):
        svc=RoleCompetencyCoverageService(self.repo,REQ,CATALOG)
        svc.execute(operation_id="RC-RS1",job_id="RC-RS1-J",learner_id="L",dossiers=[self.d1,self.d2],as_of=1200)
        changed=copy.deepcopy(REQ); changed["title"] += " changed"
        with self.assertRaisesRegex(ValueError,"OBJECT_IDENTITY_COLLISION"):
            RoleCompetencyCoverageService(self.repo,changed,CATALOG).execute(operation_id="RC-RS2",job_id="RC-RS2-J",learner_id="L",dossiers=[self.d1,self.d2],as_of=1200)

    def test_scenario_catalog_drift_after_crash_fails_closed(self):
        svc=RoleCompetencyCoverageService(self.repo,REQ,CATALOG)
        with self.assertRaises(InjectedCrash):
            svc.execute(operation_id="RC-CAT",job_id="RC-CAT-J",learner_id="L",dossiers=[self.d1,self.d2],as_of=1200,crash_after_phase="REQUIREMENT_SET_BOUND")
        cat=copy.deepcopy(CATALOG); cat[SC2["scenario_id"]]["scenario_family"]="CHANGED"
        with self.assertRaisesRegex(ValueError,"ROLE_COVERAGE_JOB_PAYLOAD_DRIFT"):
            RoleCompetencyCoverageService(self.repo,REQ,cat).execute(operation_id="RC-CAT",job_id="RC-CAT-J",learner_id="L",dossiers=[self.d1,self.d2],as_of=1200)

    def test_evidence_set_drift_after_crash_fails_closed(self):
        svc=RoleCompetencyCoverageService(self.repo,REQ,CATALOG)
        with self.assertRaises(InjectedCrash):
            svc.execute(operation_id="RC-EV",job_id="RC-EV-J",learner_id="L",dossiers=[self.d1,self.d2],as_of=1200,crash_after_phase="EVIDENCE_BOUND")
        with self.assertRaisesRegex(ValueError,"ROLE_COVERAGE_JOB_PAYLOAD_DRIFT"):
            svc.execute(operation_id="RC-EV",job_id="RC-EV-J",learner_id="L",dossiers=[self.d1],as_of=1200)

    def test_as_of_drift_after_crash_fails_closed(self):
        svc=RoleCompetencyCoverageService(self.repo,REQ,CATALOG)
        with self.assertRaises(InjectedCrash):
            svc.execute(operation_id="RC-TIME",job_id="RC-TIME-J",learner_id="L",dossiers=[self.d1,self.d2],as_of=1200,crash_after_phase="REQUIREMENT_SET_BOUND")
        with self.assertRaisesRegex(ValueError,"ROLE_COVERAGE_JOB_PAYLOAD_DRIFT"):
            svc.execute(operation_id="RC-TIME",job_id="RC-TIME-J",learner_id="L",dossiers=[self.d1,self.d2],as_of=1300)

    def test_every_crash_boundary_recovers(self):
        for phase in RoleCompetencyCoverageService.PHASES:
            with self.subTest(phase=phase):
                td=tempfile.TemporaryDirectory()
                try:
                    repo,eng,out=build_seed(os.path.join(td.name,"x.db"),learner=True); course=repo.get_object("course",out["course_id"],1)
                    d1=self._dossier_on(repo,course,SC1,submission1("C1"),"C1")
                    d2=self._dossier_on(repo,course,SC2,submission2("C2"),"C2")
                    svc=RoleCompetencyCoverageService(repo,REQ,CATALOG)
                    with self.assertRaises(InjectedCrash):
                        svc.execute(operation_id="COP",job_id="CJOB",learner_id="L",dossiers=[d1,d2],as_of=1200,crash_after_phase=phase)
                    out2=RoleCompetencyCoverageService(repo,REQ,CATALOG).execute(operation_id="COP",job_id="CJOB",learner_id="L",dossiers=[d1,d2],as_of=1200)
                    self.assertEqual(out2["status"],"COMPLETE")
                finally: td.cleanup()

    def _dossier_on(self,repo,course,scenario,sub,suffix):
        out=WorkplacePerformanceService(repo,scenario).execute(operation_id="W"+suffix,job_id="WJ"+suffix,course=course,learner_id="L",submission=sub,defense_reviews=[SYN])
        return repo.get_object("capability_evidence_dossier",out["capability_dossier_id"],1)

    def test_coverage_does_not_mutate_learning_attempts_or_projections(self):
        before_attempts=self.repo.count_attempts(); before={s["skill_id"]:self.repo.latest_projection("L",self.course["course_id"],s["skill_id"]) for s in self.course["skills"]}
        RoleCompetencyCoverageService(self.repo,REQ,CATALOG).execute(operation_id="RC-NM",job_id="RC-NM-J",learner_id="L",dossiers=[self.d1,self.d2],as_of=1200)
        self.assertEqual(before_attempts,self.repo.count_attempts())
        self.assertEqual(before,{s["skill_id"]:self.repo.latest_projection("L",self.course["course_id"],s["skill_id"]) for s in self.course["skills"]})

    def test_requirement_coverage_has_exact_evidence_refs(self):
        r=self.by_id(self.coverage(),"REQ-PY-OPS-01")
        self.assertEqual(len(r["qualifying_evidence_refs"]),2)
        self.assertTrue(all(x.startswith("capability_dossier:") for x in r["qualifying_evidence_refs"]))

    def test_requirement_set_does_not_contain_learner_identity(self):
        self.assertNotIn("learner_id",REQ)

    def test_coverage_subject_is_explicit(self):
        self.assertEqual(self.coverage()["learner_id"],"L")



    def test_coverage_snapshots_are_subject_and_time_specific(self):
        svc=RoleCompetencyCoverageService(self.repo,REQ,CATALOG)
        a=svc.execute(operation_id="RC-SNAP-A",job_id="RC-SNAP-AJ",learner_id="L",dossiers=[self.d1,self.d2],as_of=1200)
        b=svc.execute(operation_id="RC-SNAP-B",job_id="RC-SNAP-BJ",learner_id="L",dossiers=[self.d1,self.d2],as_of=1300)
        c=svc.execute(operation_id="RC-SNAP-C",job_id="RC-SNAP-CJ",learner_id="OTHER",dossiers=[self.d1,self.d2],as_of=1200)
        self.assertNotEqual(a["coverage_id"],b["coverage_id"])
        self.assertNotEqual(a["coverage_id"],c["coverage_id"])
        self.assertEqual(self.repo.count_objects("role_requirement_coverage"),3)

    def test_dossier_order_is_semantically_canonicalized_across_recovery(self):
        svc=RoleCompetencyCoverageService(self.repo,REQ,CATALOG)
        with self.assertRaises(InjectedCrash):
            svc.execute(operation_id="RC-ORD",job_id="RC-ORD-J",learner_id="L",dossiers=[self.d1,self.d2],as_of=1200,crash_after_phase="EVIDENCE_BOUND")
        out=svc.execute(operation_id="RC-ORD",job_id="RC-ORD-J",learner_id="L",dossiers=[self.d2,self.d1],as_of=1200)
        self.assertEqual(out["status"],"COMPLETE")

    def test_scenario_digest_mismatch_makes_evidence_inadmissible(self):
        cat=copy.deepcopy(CATALOG); cat[SC1["scenario_id"]]["title"] += " changed after evaluation"
        c=self.coverage([self.d1],catalog=cat)
        self.assertEqual(self.by_id(c,"REQ-PY-OPS-01")["status"],"INADMISSIBLE_FOR_USE")

    def test_unbound_scenario_cannot_count_for_requirement(self):
        scenario=copy.deepcopy(SC2)
        scenario["scenario_id"]="WP-PY-SERVICE-UNBOUND"
        scenario["requirement_bindings"]=[x for x in scenario["requirement_bindings"] if x["requirement_id"]!="REQ-PY-OPS-01"]
        d=self.make_dossier(scenario,submission2("UNBOUND",1150),"UNBOUND",[SYN])
        cat={scenario["scenario_id"]:scenario}
        c=self.coverage([d],catalog=cat)
        self.assertEqual(self.by_id(c,"REQ-PY-OPS-01")["status"],"NOT_SUPPORTED")

    def test_requirement_set_duplicate_ids_fail_closed(self):
        req=copy.deepcopy(REQ); req["requirements"][1]["requirement_id"]=req["requirements"][0]["requirement_id"]
        with self.assertRaisesRegex(ValueError,"ROLE_REQUIREMENT_ID_DUPLICATE_OR_MISSING"):
            self.coverage(req=req)

    def test_requirement_set_owner_and_version_are_required(self):
        req=copy.deepcopy(REQ); req.pop("owner_ref")
        with self.assertRaisesRegex(ValueError,"ROLE_REQUIREMENT_OWNER_OR_VERSION_MISSING"):
            self.coverage(req=req)

    def test_unknown_empty_requirement_set_stays_unknown(self):
        req=copy.deepcopy(REQ); req["requirement_set_id"]="EMPTY"; req["requirements"]=[]
        self.assertEqual(self.coverage(req=req)["coverage_standing"],"UNKNOWN")


if __name__ == "__main__": unittest.main()
