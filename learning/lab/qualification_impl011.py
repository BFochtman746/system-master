from __future__ import annotations

import copy
import json
import os
import py_compile
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

from qualification_impl009 import build_seed
from learning_lab import InjectedCrash, WorkplacePerformanceService, build_capability_evidence_dossier, build_portfolio_handoff, evaluate_workplace_submission, verify_portfolio_handoff
from learning_lab.repository import digest
from tests.test_workplace_performance import valid_submission, SYN

ROOT = Path(__file__).resolve().parent
EVIDENCE = ROOT / "evidence"
EVIDENCE.mkdir(exist_ok=True)
SCENARIO = json.loads((ROOT / "sources" / "PYTHON_COMPREHENSIONS_WORKPLACE_SCENARIO_V1.json").read_text())


def write(name, obj):
    (EVIDENCE / name).write_text(json.dumps(obj, indent=2, sort_keys=True), encoding="utf-8")
    return obj


def run(args):
    return subprocess.run(args, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)


def test_suite(full=True):
    if full:
        args=[sys.executable,"-m","unittest","discover","-s","tests","-v"]
        expected=323
        txt="impl011_full_tests.txt"; js="impl011_full_tests.json"
    else:
        modules=sorted("tests."+p.stem for p in (ROOT/"tests").glob("test_*.py") if p.stem!="test_workplace_performance")
        args=[sys.executable,"-m","unittest","-v",*modules]
        expected=285
        txt="impl011_predecessor_tests.txt"; js="impl011_predecessor_tests.json"
    p=run(args); (EVIDENCE/txt).write_text(p.stdout,encoding="utf-8")
    passed=p.stdout.count(" ... ok")
    return write(js,{"pass":p.returncode==0 and passed==expected,"passed":passed,"expected":expected,"returncode":p.returncode})


def new_slice_tests():
    p=run([sys.executable,"-m","unittest","-v","tests.test_workplace_performance"])
    (EVIDENCE/"impl011_new_tests.txt").write_text(p.stdout,encoding="utf-8")
    passed=p.stdout.count(" ... ok")
    return write("impl011_new_tests.json",{"pass":p.returncode==0 and passed==38,"passed":passed,"expected":38,"returncode":p.returncode})

def compile_all():
    files=sorted(p for p in ROOT.rglob("*.py") if "__pycache__" not in p.parts)
    errors=[]
    for p in files:
        try: py_compile.compile(str(p),doraise=True)
        except Exception as exc: errors.append(f"{p.relative_to(ROOT)}:{exc}")
    return write("impl011_compile.json",{"pass":not errors,"files":len(files),"errors":errors})


def seed(path):
    repo,eng,out=build_seed(path,learner=True)
    return repo, repo.get_object("course",out["course_id"],1)


def demo():
    with tempfile.TemporaryDirectory() as td:
        repo,course=seed(os.path.join(td,"demo.db"))
        svc=WorkplacePerformanceService(repo,SCENARIO)
        before_attempts=repo.count_attempts()
        out=svc.execute(operation_id="DEMO-OP",job_id="DEMO-JOB",course=course,learner_id="L",submission=valid_submission("DEMO-SUB"),defense_reviews=[SYN])
        ev=repo.get_object("workplace_evaluation",out["workplace_evaluation_id"],1)
        dossier=repo.get_object("capability_evidence_dossier",out["capability_dossier_id"],1)
        handoff=repo.get_object("portfolio_evidence_handoff",out["portfolio_handoff_id"],1)
        verify=verify_portfolio_handoff(dossier=dossier,handoff=handoff)
        result={
            "pass": all([
                ev["status"]=="MECHANICALLY_VERIFIED_DEFENSE_REVIEW_REQUIRED",
                dossier["claim_ceiling"]=="AUTHENTIC_WORKPLACE_ARTIFACT_MECHANICALLY_DEMONSTRATED_DEFENSE_REVIEW_PENDING",
                dossier["defense_review"]["status"]=="SYNTHETIC_REVIEW_LOGIC_APPROVED_NOT_HUMAN_EVIDENCE",
                handoff["read_only"] is True,
                handoff["portfolio_may_rewrite_competence_truth"] is False,
                "JOB_READY" in handoff["forbidden_without_external_authority"],
                verify["status"]=="PASS",
                repo.count_attempts()==before_attempts,
            ]),
            "scenario_id":SCENARIO["scenario_id"],
            "workplace_evaluation":ev,
            "capability_dossier":dossier,
            "portfolio_handoff":handoff,
            "handoff_verification":verify,
            "truth_boundary":"SYNTHETIC_LEARNER_AND_REVIEW_FIXTURE; BOUNDED AUTHENTIC WORKPLACE SCENARIO; NOT JOB READY, ROLE QUALIFIED, CERTIFIED, LICENSED, OR SME",
        }
        write("impl011_workplace_demo.json",result)
        write("impl011_capability_dossier.json",dossier)
        write("impl011_portfolio_handoff.json",handoff)
        return result


def adversarial():
    names=[
        "test_wrong_business_rule_fails",
        "test_plain_list_literal_cannot_fake_list_comprehension",
        "test_plain_dict_literal_cannot_fake_dict_comprehension",
        "test_unsafe_call_is_rejected",
        "test_unknown_name_is_rejected",
        "test_declared_output_must_match_executed_artifact",
        "test_assistance_contaminates_independent_capability_evidence",
        "test_answer_reveal_contaminates_independence",
        "test_seen_scenario_contaminates_first_authentic_evidence",
        "test_defense_must_be_structurally_complete",
        "test_defense_is_not_mechanically_promoted_to_professional_judgment",
        "test_synthetic_defense_review_proves_logic_not_human_judgment",
        "test_duplicate_defense_reviewer_identity_is_rejected",
        "test_no_mastery_does_not_get_mastery_claim",
        "test_failed_workplace_task_cannot_create_success_claim",
        "test_assisted_workplace_task_cannot_create_independent_claim",
        "test_portfolio_cannot_promote_job_ready",
        "test_dossier_tampering_is_detected",
        "test_service_does_not_mutate_learning_attempts_or_projections",
        "test_same_operation_changed_submission_conflicts",
        "test_same_submission_identity_changed_content_collides",
        "test_scenario_drift_after_crash_fails_closed",
        "test_scenario_skill_binding_must_match_course",
        "test_submission_learner_identity_must_match_service_subject",
        "test_submission_course_identity_must_match_service_subject",
    ]
    fq=[f"tests.test_workplace_performance.WorkplacePerformanceTests.{n}" for n in names]
    p=run([sys.executable,"-m","unittest","-v",*fq]); (EVIDENCE/"impl011_adversarial.txt").write_text(p.stdout,encoding="utf-8")
    passed=p.stdout.count(" ... ok")
    return write("impl011_adversarial.json",{"pass":p.returncode==0 and passed==len(names),"passed":passed,"total":len(names),"cases":names})


def sqlite_backup(src,dst):
    with sqlite3.connect(src) as s, sqlite3.connect(dst) as d:
        s.backup(d)


def recovery_stress(runs=100):
    phases=list(WorkplacePerformanceService.PHASES)
    phase_pass={x:0 for x in phases}
    crash_seed={x:False for x in phases}
    dossier_digests=set(); handoff_digests=set(); eval_digests=set(); claim_ceilings=set()
    with tempfile.TemporaryDirectory() as td:
        base=os.path.join(td,"base.db"); seed(base)
        crash_paths={}
        for phase in phases:
            p=os.path.join(td,"crash-"+phase+".db"); sqlite_backup(base,p)
            repo,course=seed_from_existing(p)
            svc=WorkplacePerformanceService(repo,SCENARIO); sub=valid_submission("REC-SUB")
            try:
                svc.execute(operation_id="REC-OP",job_id="REC-JOB",course=course,learner_id="L",submission=sub,defense_reviews=[SYN],crash_after_phase=phase)
            except InjectedCrash:
                crash_seed[phase]=True
                snapshot=os.path.join(td,"snapshot-"+phase+".db")
                sqlite_backup(p,snapshot)
                crash_paths[phase]=snapshot
        passes=0
        for i in range(runs):
            phase=phases[i%len(phases)]
            p=os.path.join(td,f"run-{i}.db"); shutil.copy2(crash_paths[phase],p)
            repo,course=seed_from_existing(p)
            svc=WorkplacePerformanceService(repo,SCENARIO); sub=valid_submission("REC-SUB")
            out=svc.execute(operation_id="REC-OP",job_id="REC-JOB",course=course,learner_id="L",submission=sub,defense_reviews=[SYN])
            replay=svc.execute(operation_id="REC-OP",job_id="REC-JOB",course=course,learner_id="L",submission=sub,defense_reviews=[SYN])
            if out==replay and repo.count_objects("workplace_evaluation")==1 and repo.count_objects("capability_evidence_dossier")==1 and repo.count_objects("portfolio_evidence_handoff")==1:
                passes+=1; phase_pass[phase]+=1
                eval_digests.add(out["workplace_evaluation_digest"]); dossier_digests.add(out["capability_dossier_digest"]); handoff_digests.add(out["portfolio_handoff_digest"]); claim_ceilings.add(out["claim_ceiling"])
        result={
            "pass":all(crash_seed.values()) and passes==runs and len(eval_digests)==len(dossier_digests)==len(handoff_digests)==len(claim_ceilings)==1,
            "runs":runs,"passes":passes,"crash_seeds":crash_seed,"phase_passes":phase_pass,
            "unique_evaluation_digests":len(eval_digests),"unique_dossier_digests":len(dossier_digests),"unique_handoff_digests":len(handoff_digests),"unique_claim_ceilings":len(claim_ceilings),
        }
        return write("impl011_recovery_stress.json",result)


def seed_from_existing(path):
    from learning_lab.repository import Repository
    repo=Repository(path)
    course=repo.get_object("course","COURSE-G-PY-REFRESH",1)
    if course is None: raise RuntimeError("seed course missing")
    return repo,course


def determinism(runs=100):
    with tempfile.TemporaryDirectory() as td:
        repo,course=seed(os.path.join(td,"d.db"))
        ev_d=set(); dos_d=set(); hand_d=set()
        for _ in range(runs):
            ev=evaluate_workplace_submission(scenario=copy.deepcopy(SCENARIO),submission=valid_submission("DET-SUB"))
            dos=build_capability_evidence_dossier(repo=repo,course=course,learner_id="L",evaluation=ev,defense_reviews=[copy.deepcopy(SYN)])
            hand=build_portfolio_handoff(dossier=dos)
            ev_d.add(ev["evaluation_digest"]); dos_d.add(dos["dossier_digest"]); hand_d.add(hand["handoff_digest"])
        return write("impl011_determinism.json",{"pass":len(ev_d)==len(dos_d)==len(hand_d)==1,"runs":runs,"unique_evaluation_digests":len(ev_d),"unique_dossier_digests":len(dos_d),"unique_handoff_digests":len(hand_d)})


def main():
    full=test_suite(True)
    new_slice=new_slice_tests()
    predecessor={"pass": bool(full.get("pass") and new_slice.get("pass") and full.get("passed")-new_slice.get("passed")==285), "passed": 285 if full.get("pass") and new_slice.get("pass") else None, "expected":285, "derivation":"FULL_SUITE_MINUS_IMPL011_SLICE"}
    write("impl011_predecessor_tests.json",predecessor)
    result={
        "predecessor":predecessor,
        "full":full,
        "new_slice":new_slice,
        "compile":compile_all(),
        "demo":demo(),
        "adversarial":adversarial(),
        "recovery":recovery_stress(100),
        "determinism":determinism(100),
    }
    result["status"]="PASS_PORTABLE_IMPLEMENTATION" if all(v.get("pass") for v in result.values() if isinstance(v,dict) and "pass" in v) else "FAIL"
    write("qualification_receipt_impl011.json",result)
    print(json.dumps(result,indent=2,sort_keys=True))
    return 0 if result["status"].startswith("PASS") else 1

if __name__=="__main__": raise SystemExit(main())
