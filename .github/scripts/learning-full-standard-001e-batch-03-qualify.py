from __future__ import annotations

import copy
import hashlib
import json
import os
import subprocess
import tempfile
from dataclasses import asdict
from pathlib import Path

from learning_lab.cssgb_full_standard_i_a_3 import (
    ASSESSMENT_TARGET_ID, CRITERION_ID, DOMAIN_KEY, LESSON_ID, OUTCOME,
    REQUIREMENT_ID, SCORING_TYPE, SKILL_ID, CSSGBDriverMetricOracle,
    build_course, dossier,
)
from learning_lab.domain_general import DomainGeneralLearningEngine, DomainRegistry, DomainSpec
from learning_lab.real_course import validate_grounding, validate_instructional_design
from learning_lab.repository import Repository

ROOT=Path(os.environ.get("GITHUB_WORKSPACE",Path.cwd()))
QDIR=ROOT/"qualification"/"learning"
EVIDENCE_DIR=Path(os.environ.get("EVIDENCE_DIR",os.environ.get("RUNNER_TEMP",str(ROOT))+"/learning-001e-batch-03-evidence"))
EVIDENCE_DIR.mkdir(parents=True,exist_ok=True)
CANDIDATE="LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001E-INSTRUCTIONAL-CONTENT-AND-SCORING-BATCH-03-CANDIDATE-064A.json"
CONTRACT="LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001E-INSTRUCTIONAL-CONTENT-AND-SCORING-CONTRACT-059.json"
BLUEPRINT_REF="02dc615fcb5d44b997ed1322848eccc6e37bb172"
BLUEPRINT_PATH="qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001D-EXECUTABLE-CURRICULUM-BLUEPRINT-057B.json"
EXPECTED_DIGEST="98aa0b621b0cbe5234d5dd8bdb9890a1692c4c9d91aaf955fd3a459632949e54"


def fail(code,detail=""):
    msg=f"{code}:{detail}" if detail else code
    (EVIDENCE_DIR/"failure-summary.json").write_text(json.dumps({"subject_sha":os.environ.get("GITHUB_SHA","LOCAL"),"result_class":"FAIL","failure":msg},indent=2)+"\n")
    raise AssertionError(msg)


def canonical_digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()).hexdigest()


def load(name): return json.loads((QDIR/name).read_text())

def git_json(ref,path):
    p=subprocess.run(["git","show",f"{ref}:{path}"],cwd=ROOT,capture_output=True,text=True)
    if p.returncode: fail("HISTORICAL_INPUT_UNAVAILABLE",p.stderr.strip())
    return json.loads(p.stdout)

def answer(driver="D1",selected=None,rejected=None,missing=None):
    return json.dumps({"driver_id":driver,"selected_metric_id":selected,"rejected_metric_ids":rejected or [],"missing_evidence":missing or []},sort_keys=True,separators=(",",":"))


def main():
    candidate=load(CANDIDATE); contract=load(CONTRACT)
    if candidate.get("base_control_head")!="daea871f60879af8f5e257a08b04bb427829c0e7": fail("BASE_CONTROL_HEAD_DRIFT")
    if candidate.get("selection",{}).get("001d_ordinal")!=3: fail("BATCH_SELECTION_DRIFT")
    if contract.get("base_control_head")!="706d5eadd08897d1fa464aff804a245997822bde": fail("CONTRACT_PREDECESSOR_DRIFT")
    bp=git_json(BLUEPRINT_REF,BLUEPRINT_PATH)
    if bp.get("artifact_digest_sha256")!=EXPECTED_DIGEST: fail("001D_DECLARED_DIGEST_DRIFT")
    unsigned=copy.deepcopy(bp); unsigned.pop("artifact_digest_sha256",None)
    observed=canonical_digest(unsigned)
    if observed!=EXPECTED_DIGEST: fail("001D_DIGEST_DRIFT",observed)
    nodes=bp.get("execution_nodes",[])
    if len(nodes)!=66: fail("001D_NODE_COUNT",str(len(nodes)))
    node=nodes[2]
    checks=[
        (node.get("ordinal")==3,"ORDINAL"),
        (node["requirement"]["requirement_id"]==REQUIREMENT_ID,"REQUIREMENT"),
        (node["skill"]["skill_id"]==SKILL_ID,"SKILL"),
        (node["criterion"]["criterion_id"]==CRITERION_ID,"CRITERION"),
        (node["lesson_spec"]["lesson_id"]==LESSON_ID,"LESSON"),
        (node["assessment_binding"]["assessment_target_id"]==ASSESSMENT_TARGET_ID,"ASSESSMENT"),
        (node["assessment_binding"]["runtime_scoring_status"]=="RUBRIC_DEFINED__BEHAVIOR_ORACLE_UNBOUND","SCORING_PRECONDITION"),
        (node["assessment_binding"]["mastery_evidence_admission_allowed"] is False,"MASTERY_PRECONDITION"),
    ]
    for ok,name in checks:
        if not ok: fail("001D_IDENTITY_DRIFT",name)

    d=dossier(); sources=[s for s in d["sources"] if s.get("standing")=="ADMITTED"]
    if len(sources)!=3 or len(d.get("claims",[]))!=4: fail("GROUNDING_INPUT_COUNTS")
    if any(s.get("authority")!="AMERICAN_SOCIETY_FOR_QUALITY" for s in sources): fail("NON_ASQ_SOURCE")
    if any(s.get("source_bytes_archived") is not False for s in sources): fail("SOURCE_ARCHIVE_STANDING")
    if d["frozen_requirement_identity"]["supplemental_sources_replace_frozen_identity"] is not False: fail("SOURCE_REPLACEMENT_FORBIDDEN")

    course=build_course(goal_id="GOAL-ASQ-CSSGB-2022-001E-I-A-3",title="ASQ CSSGB 2022 I.A.3 Qualification Slice",desired_outcome=OUTCOME,dossier=d)
    body=asdict(course); body["domain_key"]=DOMAIN_KEY
    grounding=validate_grounding(body,d)
    if grounding["status"]!="PASS" or grounding.get("claim_coverage_percent")!=100 or not grounding.get("closed_world_span_coverage"): fail("GROUNDING_FAIL",json.dumps(grounding,sort_keys=True))
    instructional=validate_instructional_design(body)
    if instructional["status"]!="PASS": fail("INSTRUCTIONAL_FAIL",json.dumps(instructional,sort_keys=True))
    oracle=CSSGBDriverMetricOracle()
    reference=oracle.validate_reference_items(body); lesson_behavior=oracle.validate_lesson_examples(body)
    if reference["status"]!="PASS" or reference.get("answer_key_used_as_oracle") is not False: fail("REFERENCE_ORACLE_FAIL")
    if lesson_behavior["status"]!="PASS": fail("LESSON_BEHAVIOR_FAIL",json.dumps(lesson_behavior,sort_keys=True))

    mastery=next(i for i in body["items"] if i["mode"]=="MASTERY_CHECK")
    p2=next(i for i in body["items"] if i["item_id"]=="P-CSSGB-I-A-3-02")
    canonical=mastery["answer"]; mutated=copy.deepcopy(mastery); mutated["answer"]="MUTATED_ANSWER_MUST_NOT_CONTROL_ORACLE"
    negative={
        "malformed_json_rejected":not oracle.score(mastery,"not-json"),
        "wrong_driver_rejected":not oracle.score(mastery,answer("D9","M1",["M2","M3"])),
        "wrong_selected_metric_rejected":not oracle.score(mastery,answer("D1","M2",["M1","M3"])),
        "incomplete_rejected_set_rejected":not oracle.score(mastery,answer("D1","M1",["M2"])),
        "selected_metric_also_rejected_rejected":not oracle.score(mastery,answer("D1","M1",["M1","M2","M3"])),
        "insufficient_forced_selection_rejected":not oracle.score(p2,answer("D1","M1",["M2"])),
        "insufficient_without_missing_evidence_rejected":not oracle.score(p2,answer("D1",None,["M1","M2"])),
        "answer_mutation_does_not_change_oracle_correctness":oracle.score(mutated,canonical),
    }
    if not all(negative.values()): fail("ORACLE_NEGATIVE_MATRIX_FAIL",json.dumps(negative,sort_keys=True))

    def observer(probe,response_text): return False,None
    def move(signature,confirmed,abstained): return {"content":"Qualification-slice remediation is not claimed in 001E Batch 03.","claim_refs":[]}
    spec=DomainSpec(domain_key=DOMAIN_KEY,desired_outcome=OUTCOME,dossier=d,course_factory=build_course,behavior_oracle=oracle,generation_adapter_id="CSSGB-001E-I-A-3-GROUNDED-CONTENT-V1",maintenance_tasks={},transfer_tasks={},transfer_required_skills=set(),tutor_probes={},tutor_observer=observer,tutor_move=move)
    with tempfile.TemporaryDirectory() as td:
        repo=Repository(str(Path(td)/"learning.sqlite")); engine=DomainGeneralLearningEngine(repo,registry=DomainRegistry([spec]))
        created=engine.create_research_grounded_course_job(operation_id="OP-B03-CREATE",job_id="JOB-B03-CREATE",goal_id="GOAL-ASQ-CSSGB-2022-001E-I-A-3",title="ASQ CSSGB 2022 I.A.3 Qualification Slice",desired_outcome=OUTCOME)
        cid=created["course_id"]
        if created["state"]!="READY_FOR_REVIEW" or created["validation_status"]!="MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED": fail("CREATE_STANDING")
        stored=engine.course(cid); first=engine.next_action("L-B03",cid,now=3000)
        if first["action_type"]!="LESSON" or first["target_id"]!=LESSON_ID: fail("FIRST_ACTION")
        practice=next(i for i in stored["items"] if i["item_id"]=="P-CSSGB-I-A-3-01")
        pr=engine.submit_attempt(operation_id="OP-B03-P",attempt_id="ATT-B03-P",learner_id="L-B03",course_id=cid,item_id=practice["item_id"],response=practice["answer"],submitted_at=3100)
        if not pr["attempt"]["correct"] or pr["projection"]["stage"]!="BUILDING" or "PRACTICE_NOT_MASTERY" not in pr["projection"]["reason_codes"]: fail("PRACTICE_BOUNDARY")
        bad=engine.submit_attempt(operation_id="OP-B03-M-BAD",attempt_id="ATT-B03-M-BAD",learner_id="L-B03",course_id=cid,item_id=mastery["item_id"],response=answer("D1","M2",["M1","M3"]),submitted_at=3200)
        if bad["attempt"]["correct"] is not False or bad["projection"]["stage"]!="BUILDING": fail("BAD_MASTERY_BOUNDARY")
        good=engine.submit_attempt(operation_id="OP-B03-M-GOOD",attempt_id="ATT-B03-M-GOOD",learner_id="L-B03",course_id=cid,item_id=mastery["item_id"],response=canonical,submitted_at=3300)
        if not good["attempt"]["correct"] or good["projection"]["stage"]!="RETENTION_DUE": fail("GOOD_MASTERY_BOUNDARY")
        wait=engine.next_action("L-B03",cid,now=3301)
        if wait["action_type"]!="RETENTION_WAIT" or int(wait["earliest_due_at"])!=6900: fail("RETENTION_WAIT")
        retention=next(i for i in stored["items"] if i["mode"]=="RETENTION_CHECK")
        retained=engine.submit_attempt(operation_id="OP-B03-R",attempt_id="ATT-B03-R",learner_id="L-B03",course_id=cid,item_id=retention["item_id"],response=retention["answer"],submitted_at=6901)
        if not retained["attempt"]["correct"] or retained["projection"]["stage"]!="MASTERED": fail("RETENTION_BOUNDARY")
        final=engine.next_action("L-B03",cid,now=6901)
        if final["action_type"]!="COURSE_COMPLETE": fail("SLICE_COMPLETE")
        runtime={"created":created,"first_action":first,"practice_projection":pr["projection"],"rejected_mastery_projection":bad["projection"],"accepted_mastery_projection":good["projection"],"retention_wait":wait,"retained_projection":retained["projection"],"final_action":final}

    summary={"subject_sha":os.environ.get("GITHUB_SHA","LOCAL"),"result_class":"PASS","phase":"001E_INSTRUCTIONAL_CONTENT_AND_SCORING_REALIZATION_BATCH_03","batch_index":3,"requirements_realized_this_batch":1,"cumulative_requirements_realized":3,"requirement_id":REQUIREMENT_ID,"001d_ordinal":3,"001d_blueprint_digest_sha256":observed,"grounding_status":grounding["status"],"grounding_claim_coverage_percent":grounding["claim_coverage_percent"],"admitted_source_count":len(sources),"instructional_design_status":instructional["status"],"worked_example_count":2,"practice_item_count":2,"mastery_item_count":1,"retention_item_count":1,"scoring_type":SCORING_TYPE,"oracle_reference_status":reference["status"],"lesson_behavior_status":lesson_behavior["status"],"oracle_negative_matrix":negative,"runtime_engine_path_verified":True,"runtime_course_state":"READY_FOR_REVIEW","practice_not_mastery_verified":True,"mastery_advances_only_to_retention_due":True,"retention_delay_enforced":True,"delayed_distinct_retention_path_verified":True,"portable_fixture_mastery_only":True,"real_learner_mastery":"UNOBSERVED","psychometric_validity":"UNOBSERVED","sme_approval":"UNOBSERVED","certification_equivalence":"UNOBSERVED","a01_native_production_authority":"NOT_INFERRED","full_course_activation_allowed":False,"source_bytes_archived":False,"next_successor":"Admit Batch 03 and select exact 001D ordinal 4 (ASQ-CSSGB-2022-I.B.1) without replaying prior work."}
    for name,value in (("qualification-summary.json",summary),("grounding-validation.json",grounding),("instructional-validation.json",instructional),("runtime-evidence.json",runtime),("materialized-i-a-3-course.json",body),("i-a-3-grounding-dossier.json",d)):
        (EVIDENCE_DIR/name).write_text(json.dumps(value,indent=2,sort_keys=True)+"\n")
    print(json.dumps(summary,sort_keys=True))

if __name__=="__main__": main()
