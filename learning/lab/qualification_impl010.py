from __future__ import annotations

import copy
import json
import os
import py_compile
import subprocess
import sys
import tempfile
from pathlib import Path

from qualification_impl009 import build_seed
from learning_lab import build_external_review_dossier, build_capability_evidence_handoff_template, adjudicate_reviews
from learning_lab.repository import digest

ROOT = Path(__file__).resolve().parent
EVIDENCE = ROOT / "evidence"
EVIDENCE.mkdir(exist_ok=True)
DESCRIPTOR = json.loads((ROOT / "sources" / "PYTHON_COMPREHENSIONS_REVIEW_DESCRIPTOR_V1.json").read_text())

SYN_A = {"reviewer_id":"SME-A","role":"SUBJECT_MATTER_EXPERT","independence":"INDEPENDENT","evidence_class":"SYNTHETIC_TEST_FIXTURE","standing":"APPROVE"}
SYN_B = {"reviewer_id":"FACULTY-B","role":"FACULTY_REVIEWER","independence":"INDEPENDENT","evidence_class":"SYNTHETIC_TEST_FIXTURE","standing":"APPROVE"}


def write(name, obj):
    (EVIDENCE / name).write_text(json.dumps(obj, indent=2, sort_keys=True), encoding="utf-8")
    return obj


def cmd(args):
    return subprocess.run(args, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)


def tests(full=True):
    if full:
        args=[sys.executable,"-m","unittest","discover","-s","tests","-v"]; expected=285; name="impl010_full_tests.txt"
    else:
        modules=sorted("tests."+p.stem for p in (ROOT/"tests").glob("test_*.py") if p.stem!="test_professional_rigor")
        args=[sys.executable,"-m","unittest","-v",*modules]; expected=247; name="impl010_predecessor_tests.txt"
    p=cmd(args); (EVIDENCE/name).write_text(p.stdout,encoding="utf-8")
    passed=p.stdout.count(" ... ok")
    return write("impl010_full_tests.json" if full else "impl010_predecessor_tests.json", {"pass":p.returncode==0 and passed==expected,"passed":passed,"expected":expected,"returncode":p.returncode})


def compile_all():
    files=sorted(p for p in ROOT.rglob("*.py") if "__pycache__" not in p.parts)
    errors=[]
    for p in files:
        try: py_compile.compile(str(p),doraise=True)
        except Exception as e: errors.append(f"{p.relative_to(ROOT)}:{e}")
    return write("impl010_compile.json", {"pass":not errors,"files":len(files),"errors":errors})


def seeded_subject():
    td=tempfile.TemporaryDirectory()
    repo,eng,out=build_seed(os.path.join(td.name,"subject.db"), learner=True)
    course=repo.get_object("course",out["course_id"],1)
    dossier=repo.get_object("research_dossier",course["research_dossier_id"],1)
    return td,repo,course,dossier


def demo():
    td,repo,course,dossier=seeded_subject()
    try:
        review=build_external_review_dossier(course=course,dossier=dossier,package=dossier,descriptor=DESCRIPTOR,review_records=[SYN_A,SYN_B],mechanical_oracle_pass=True)
        handoff=build_capability_evidence_handoff_template(course=course)
        projections=[]
        for sid in [x["skill_id"] for x in course["skills"]]:
            p=repo.latest_projection("L",course["course_id"],sid)
            if p: projections.append({"skill_id":sid,"stage":p["stage"],"counted_attempt_ids":p.get("counted_attempt_ids",[]),"reason_codes":p.get("reason_codes",[])})
        result={
            "pass": all([
                review["external_review_readiness"]=="READY_TO_SUBMIT_FOR_INDEPENDENT_REVIEW",
                review["independent_review"]["status"]=="SYNTHETIC_REVIEW_LOGIC_APPROVED_NOT_HUMAN_EVIDENCE",
                review["external_recognition"]=="NOT_CLAIMED",
                review["standalone_certificate_or_credit_readiness"]=="NOT_SUPPORTED_BY_BOUNDED_MODULE_SCOPE",
                handoff["course_completion_alone_is_competence"] is False,
                "JOB_READY" in handoff["forbidden_without_external_authority"],
            ]),
            "course_id":course["course_id"],
            "review_dossier":review,
            "capability_handoff_template":handoff,
            "synthetic_learner_projection_examples":projections,
            "truth_boundary":"SYNTHETIC_REVIEW_AND_LEARNER_FIXTURE; NOT EXTERNAL ACCREDITATION, CREDIT, CERTIFICATION, OR EMPLOYMENT QUALIFICATION"
        }
        write("impl010_review_readiness_demo.json",result)
        write("impl010_capability_handoff_template.json",handoff)
        return result
    finally: td.cleanup()


def adversarial():
    names=[
      "test_missing_mastery_mode_fails_blueprint","test_missing_transfer_fails_blueprint_when_required",
      "test_compensatory_average_passing_standard_is_rejected","test_uncalibrated_pass_probability_claim_is_rejected",
      "test_outcome_level_must_cover_all_criteria","test_outcome_level_below_application_floor_is_rejected",
      "test_entry_prerequisites_are_required","test_independent_capstone_or_transfer_is_required",
      "test_workload_must_be_documented","test_credit_hour_equivalency_cannot_be_self_claimed",
      "test_subject_completeness_without_sme_boundary_fails","test_tutor_support_must_fade_before_independent_mastery",
      "test_answer_reveal_protection_is_quality_gate","test_accessibility_text_equivalent_is_required",
      "test_mechanical_oracle_failure_blocks_review_readiness","test_one_reviewer_is_insufficient",
      "test_duplicate_reviewer_identity_does_not_count_twice","test_nonindependent_second_reviewer_does_not_count",
      "test_reviewer_disagreement_does_not_average_away","test_reviewer_abstention_is_preserved",
      "test_external_review_approval_does_not_mint_accreditation","test_capability_handoff_forbids_job_ready_and_certified_without_authority"
    ]
    fq=[f"tests.test_professional_rigor.ProfessionalRigorTests.{n}" for n in names]
    p=cmd([sys.executable,"-m","unittest","-v",*fq]); (EVIDENCE/"impl010_adversarial.txt").write_text(p.stdout,encoding="utf-8")
    passed=p.stdout.count(" ... ok")
    return write("impl010_adversarial.json", {"pass":p.returncode==0 and passed==len(names),"passed":passed,"total":len(names),"cases":names})


def determinism(runs=100):
    td,repo,course,dossier=seeded_subject()
    try:
        digests=set(); review_digests=set(); handoff_digests=set()
        for _ in range(runs):
            r=build_external_review_dossier(course=course,dossier=dossier,package=dossier,descriptor=copy.deepcopy(DESCRIPTOR),review_records=[copy.deepcopy(SYN_A),copy.deepcopy(SYN_B)],mechanical_oracle_pass=True)
            digests.add(r["dossier_digest"]); review_digests.add(digest(r["independent_review"])); handoff_digests.add(digest(build_capability_evidence_handoff_template(course=course)))
        return write("impl010_determinism.json", {"pass":len(digests)==len(review_digests)==len(handoff_digests)==1,"runs":runs,"unique_dossier_digests":len(digests),"unique_review_digests":len(review_digests),"unique_handoff_digests":len(handoff_digests)})
    finally: td.cleanup()


def reviewer_state_matrix():
    real_a=copy.deepcopy(SYN_A); real_b=copy.deepcopy(SYN_B); real_a["evidence_class"]=real_b["evidence_class"]="REAL_HUMAN_REVIEW"
    revise=copy.deepcopy(SYN_B); revise["standing"]="REVISE"
    abstain=copy.deepcopy(SYN_B); abstain["standing"]="ABSTAIN"
    matrix={
      "none":adjudicate_reviews([])["status"],
      "one":adjudicate_reviews([SYN_A])["status"],
      "synthetic_approve":adjudicate_reviews([SYN_A,SYN_B])["status"],
      "real_human_approve_logic":adjudicate_reviews([real_a,real_b])["status"],
      "disagree":adjudicate_reviews([SYN_A,revise])["status"],
      "abstain":adjudicate_reviews([SYN_A,abstain])["status"],
    }
    expected={"none":"PENDING_INDEPENDENT_REVIEW","one":"PENDING_INDEPENDENT_REVIEW","synthetic_approve":"SYNTHETIC_REVIEW_LOGIC_APPROVED_NOT_HUMAN_EVIDENCE","real_human_approve_logic":"INDEPENDENT_REVIEW_APPROVED","disagree":"DISAGREEMENT_REQUIRES_ADJUDICATION","abstain":"ABSTAINED_REQUIRES_ADJUDICATION"}
    return write("impl010_reviewer_state_matrix.json", {"pass":matrix==expected,"states":matrix,"note":"REAL_HUMAN_REVIEW rows are state-machine fixtures only; no human review was performed in this Lab run."})


def main():
    result={
      "predecessor":tests(False),"full":tests(True),"compile":compile_all(),"demo":demo(),
      "adversarial":adversarial(),"determinism":determinism(100),"review_states":reviewer_state_matrix()
    }
    result["status"]="PASS_PORTABLE_IMPLEMENTATION" if all(v.get("pass") for v in result.values() if isinstance(v,dict) and "pass" in v) else "FAIL"
    write("qualification_receipt_impl010.json",result)
    print(json.dumps(result,indent=2,sort_keys=True))
    return 0 if result["status"].startswith("PASS") else 1

if __name__=="__main__": raise SystemExit(main())
