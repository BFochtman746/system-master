from __future__ import annotations

import copy
import hashlib
import json
import os
import subprocess
import tempfile
from dataclasses import asdict
from pathlib import Path

from learning_lab.cssgb_full_standard_i_b_2 import (
    ASSESSMENT_TARGET_ID, CRITERION_ID, DOMAIN_KEY, LESSON_ID, OUTCOME,
    PREREQUISITE_SKILL_ID, REQUIREMENT_ID, SCORING_TYPE, SKILL_ID,
    CSSGBVSMInterpretationOracle, build_course, dossier,
)
from learning_lab.domain_general import DomainGeneralLearningEngine, DomainRegistry, DomainSpec
from learning_lab.real_course import validate_grounding, validate_instructional_design
from learning_lab.repository import Repository

ROOT=Path(os.environ.get("GITHUB_WORKSPACE",Path.cwd()))
QDIR=ROOT/"qualification"/"learning"
EVIDENCE_DIR=Path(os.environ.get("EVIDENCE_DIR",os.environ.get("RUNNER_TEMP",str(ROOT))+"/learning-001e-batch-05-evidence")); EVIDENCE_DIR.mkdir(parents=True,exist_ok=True)
CANDIDATE="LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001E-INSTRUCTIONAL-CONTENT-AND-SCORING-BATCH-05-CANDIDATE-068A.json"
CONTRACT="LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001E-INSTRUCTIONAL-CONTENT-AND-SCORING-CONTRACT-059.json"
BP_REF="02dc615fcb5d44b997ed1322848eccc6e37bb172"
BP_PATH="qualification/learning/LEARNING-FULL-STANDARD-CURRICULUM-COMPILER-001D-EXECUTABLE-CURRICULUM-BLUEPRINT-057B.json"
EXPECTED_DIGEST="98aa0b621b0cbe5234d5dd8bdb9890a1692c4c9d91aaf955fd3a459632949e54"
EXPECTED_CONTROL="8236781a5df74fd9127463d24d7919542deffd72"


def fail(code, detail=""):
    msg=f"{code}:{detail}" if detail else code
    (EVIDENCE_DIR/"failure-summary.json").write_text(json.dumps({"subject_sha":os.environ.get("GITHUB_SHA","LOCAL"),"result_class":"FAIL","failure":msg},indent=2)+"\n",encoding="utf-8")
    raise AssertionError(msg)


def local(name): return json.loads((QDIR/name).read_text(encoding="utf-8"))
def git_json(ref,path):
    p=subprocess.run(["git","show",f"{ref}:{path}"],cwd=ROOT,capture_output=True,text=True,check=False)
    if p.returncode: fail("HISTORICAL_INPUT_UNAVAILABLE",p.stderr.strip())
    return json.loads(p.stdout)
def digest(v): return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()).hexdigest()

def resp(links,conditions,unsupported=None,missing=None,post=False):
    return json.dumps({"flow_links":[{"from_id":a,"to_id":b} for a,b in links],"supported_condition_ids":conditions,"unsupported_conclusion_ids":unsupported or [],"missing_evidence":missing or [],"post_improvement_performance_claimed":post},sort_keys=True,separators=(",",":"))


def main():
    candidate=local(CANDIDATE); contract=local(CONTRACT)
    if candidate.get("base_control_head")!=EXPECTED_CONTROL: fail("BASE_CONTROL_HEAD_DRIFT")
    if candidate.get("selection",{}).get("001d_ordinal")!=5: fail("BATCH_SELECTION_DRIFT")
    if contract.get("base_control_head")!="706d5eadd08897d1fa464aff804a245997822bde": fail("CONTRACT_PREDECESSOR_DRIFT")

    bp=git_json(BP_REF,BP_PATH)
    if bp.get("artifact_digest_sha256")!=EXPECTED_DIGEST: fail("001D_DECLARED_DIGEST_DRIFT")
    unsigned=copy.deepcopy(bp); unsigned.pop("artifact_digest_sha256",None)
    observed=digest(unsigned)
    if observed!=EXPECTED_DIGEST: fail("001D_DIGEST_DRIFT",observed)
    nodes=bp.get("execution_nodes",[])
    if len(nodes)!=66: fail("001D_NODE_COUNT",str(len(nodes)))
    node=nodes[4]
    checks=[
        (node.get("ordinal")==5,"ORDINAL"),(node["requirement"]["requirement_id"]==REQUIREMENT_ID,"REQUIREMENT"),
        (node["skill"]["skill_id"]==SKILL_ID,"SKILL"),(node["criterion"]["criterion_id"]==CRITERION_ID,"CRITERION"),
        (node["lesson_spec"]["lesson_id"]==LESSON_ID,"LESSON"),(node["criterion"]["outcome"]==OUTCOME,"OUTCOME"),
        (node["assessment_binding"]["assessment_target_id"]==ASSESSMENT_TARGET_ID,"ASSESSMENT"),
        (node["skill"]["hard_prerequisite_skill_ids"]==[PREREQUISITE_SKILL_ID],"HARD_PREREQUISITE"),
        (node["lesson_spec"]["materialization_status"]=="UNMATERIALIZED__GROUNDING_AND_REVIEW_REQUIRED","MATERIALIZATION_PRECONDITION"),
        (node["assessment_binding"]["runtime_scoring_status"]=="RUBRIC_DEFINED__BEHAVIOR_ORACLE_UNBOUND","SCORING_PRECONDITION"),
        (node["assessment_binding"]["mastery_evidence_admission_allowed"] is False,"MASTERY_PRECONDITION")]
    for ok,name in checks:
        if not ok: fail("001D_IDENTITY_OR_GATE_DRIFT",name)

    d=dossier(); sources=[s for s in d.get("sources",[]) if s.get("standing")=="ADMITTED"]
    if len(sources)!=3 or len(d.get("claims",[]))!=5: fail("GROUNDING_INPUT_COUNTS")
    if any(s.get("authority")!="AMERICAN_SOCIETY_FOR_QUALITY" for s in sources): fail("NON_ASQ_SOURCE")
    if any(s.get("source_bytes_archived") is not False for s in sources): fail("SOURCE_ARCHIVE_STANDING")
    if d["frozen_requirement_identity"]["supplemental_sources_replace_frozen_identity"] is not False: fail("SOURCE_REPLACEMENT_FORBIDDEN")
    if not any("full_001d_blueprint_retain" in x.lower() for x in d.get("limitations",[])): fail("PORTABLE_PREREQUISITE_LIMITATION_MISSING")

    course=build_course(goal_id="GOAL-ASQ-CSSGB-2022-001E-I-B-2",title="ASQ CSSGB 2022 I.B.2 Qualification Slice",desired_outcome=OUTCOME,dossier=d)
    body=asdict(course); body["domain_key"]=DOMAIN_KEY
    # Isolation is explicit: the portable slice must not pretend to satisfy or rewrite the full-course hard gate.
    if body["skills"][0]["hard_prerequisite_skill_ids"]: fail("PORTABLE_SLICE_FALSE_PREREQUISITE_SATISFACTION")
    grounding=validate_grounding(body,d); instructional=validate_instructional_design(body)
    if grounding["status"]!="PASS" or grounding.get("claim_coverage_percent")!=100 or not grounding.get("closed_world_span_coverage"): fail("GROUNDING_FAIL",json.dumps(grounding,sort_keys=True))
    if instructional["status"]!="PASS": fail("INSTRUCTIONAL_FAIL",json.dumps(instructional,sort_keys=True))

    oracle=CSSGBVSMInterpretationOracle(); reference=oracle.validate_reference_items(body); lesson=oracle.validate_lesson_examples(body)
    if reference["status"]!="PASS" or reference.get("answer_key_used_as_oracle") is not False: fail("REFERENCE_ORACLE_FAIL",json.dumps(reference,sort_keys=True))
    if lesson["status"]!="PASS": fail("LESSON_BEHAVIOR_FAIL",json.dumps(lesson,sort_keys=True))
    mastery=next(i for i in body["items"] if i["mode"]=="MASTERY_CHECK"); p2=next(i for i in body["items"] if i["item_id"]=="P-CSSGB-I-B-2-02")
    canonical=mastery["answer"]; mutated=copy.deepcopy(mastery); mutated["answer"]="ANSWER_FIELD_NOT_ORACLE_AUTHORITY"
    negative={
        "malformed_json_rejected":not oracle.score(mastery,"not-json"),
        "missing_visible_link_rejected":not oracle.score(mastery,resp([["ORDER","P1"],["P1","Q1"]],["QUEUE_INTERRUPTS_FLOW","INFORMATION_FLOW_TO_P1"])),
        "invented_visible_link_rejected":not oracle.score(mastery,resp([["ORDER","P1"],["P1","Q1"],["Q1","P2"],["P2","CUSTOMER"]],["QUEUE_INTERRUPTS_FLOW","INFORMATION_FLOW_TO_P1"])),
        "wrong_supported_condition_rejected":not oracle.score(mastery,resp([["ORDER","P1"],["P1","Q1"],["Q1","P2"]],["INVENTORY_BETWEEN_STEPS"])),
        "unsupported_cause_omission_rejected":not oracle.score(p2,resp([["P1","INV1"],["INV1","P2"]],["INVENTORY_BETWEEN_P1_P2"])),
        "missing_evidence_omission_rejected":not oracle.score(p2,resp([["P1","INV1"],["INV1","P2"]],["INVENTORY_BETWEEN_P1_P2"],["CAUSE_OF_INVENTORY"],[])),
        "post_improvement_claim_rejected":not oracle.score(mastery,resp([["ORDER","P1"],["P1","Q1"],["Q1","P2"]],["QUEUE_INTERRUPTS_FLOW","INFORMATION_FLOW_TO_P1"],post=True)),
        "answer_mutation_does_not_change_oracle_correctness":oracle.score(mutated,canonical)}
    if not all(negative.values()): fail("ORACLE_NEGATIVE_MATRIX_FAIL",json.dumps(negative,sort_keys=True))

    def observer(probe,response_text): return False,None
    def move(signature,confirmed,abstained): return {"content":"Use only visible map relationships and state missing evidence for unshown conclusions.","claim_refs":[]}
    spec=DomainSpec(domain_key=DOMAIN_KEY,desired_outcome=OUTCOME,dossier=d,course_factory=build_course,behavior_oracle=oracle,generation_adapter_id="CSSGB-001E-I-B-2-GROUNDED-CONTENT-V1",maintenance_tasks={},transfer_tasks={},transfer_required_skills=set(),tutor_probes={},tutor_observer=observer,tutor_move=move)
    with tempfile.TemporaryDirectory() as td:
        repo=Repository(str(Path(td)/"learning.sqlite")); engine=DomainGeneralLearningEngine(repo,registry=DomainRegistry([spec]))
        created=engine.create_research_grounded_course_job(operation_id="OP-B05-CREATE",job_id="JOB-B05-CREATE",goal_id="GOAL-ASQ-CSSGB-2022-001E-I-B-2",title="ASQ CSSGB 2022 I.B.2 Qualification Slice",desired_outcome=OUTCOME)
        cid=created["course_id"]
        if created["state"]!="READY_FOR_REVIEW" or created["validation_status"]!="MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED": fail("CREATE_STANDING")
        stored=engine.course(cid); first=engine.next_action("L-B05",cid,now=5000)
        if first["action_type"]!="LESSON" or first["target_id"]!=LESSON_ID: fail("FIRST_ACTION")
        practice=next(i for i in stored["items"] if i["item_id"]=="P-CSSGB-I-B-2-01")
        pr=engine.submit_attempt(operation_id="OP-B05-P",attempt_id="ATT-B05-P",learner_id="L-B05",course_id=cid,item_id=practice["item_id"],response=practice["answer"],submitted_at=5100)
        if not pr["attempt"]["correct"] or pr["projection"]["stage"]!="BUILDING" or "PRACTICE_NOT_MASTERY" not in pr["projection"]["reason_codes"]: fail("PRACTICE_BOUNDARY")
        bad=engine.submit_attempt(operation_id="OP-B05-M-BAD",attempt_id="ATT-B05-M-BAD",learner_id="L-B05",course_id=cid,item_id=mastery["item_id"],response=resp([["ORDER","P1"],["P1","Q1"]],["QUEUE_INTERRUPTS_FLOW","INFORMATION_FLOW_TO_P1"]),submitted_at=5200)
        if bad["attempt"]["correct"] is not False or bad["projection"]["stage"]!="BUILDING": fail("BAD_MASTERY_BOUNDARY")
        good=engine.submit_attempt(operation_id="OP-B05-M-GOOD",attempt_id="ATT-B05-M-GOOD",learner_id="L-B05",course_id=cid,item_id=mastery["item_id"],response=canonical,submitted_at=5300)
        if not good["attempt"]["correct"] or good["projection"]["stage"]!="RETENTION_DUE": fail("GOOD_MASTERY_BOUNDARY")
        wait=engine.next_action("L-B05",cid,now=5301)
        if wait["action_type"]!="RETENTION_WAIT" or int(wait["earliest_due_at"])!=8900: fail("RETENTION_WAIT",json.dumps(wait,sort_keys=True))
        retention=next(i for i in stored["items"] if i["mode"]=="RETENTION_CHECK")
        retained=engine.submit_attempt(operation_id="OP-B05-R",attempt_id="ATT-B05-R",learner_id="L-B05",course_id=cid,item_id=retention["item_id"],response=retention["answer"],submitted_at=8901)
        if not retained["attempt"]["correct"] or retained["projection"]["stage"]!="MASTERED": fail("RETENTION_BOUNDARY")
        if engine.course(cid)["state"]!="READY_FOR_REVIEW": fail("COURSE_ACTIVATED_DURING_QUALIFICATION")
        runtime={"first_action":first,"practice_projection":pr["projection"],"rejected_mastery_projection":bad["projection"],"accepted_mastery_projection":good["projection"],"retention_wait":wait,"retained_projection":retained["projection"]}

    summary={"subject_sha":os.environ.get("GITHUB_SHA","LOCAL"),"result_class":"PASS","phase":"001E_INSTRUCTIONAL_CONTENT_AND_SCORING_REALIZATION_BATCH_05","batch_index":5,"requirements_realized_this_batch":1,"cumulative_requirements_realized":5,"requirement_id":REQUIREMENT_ID,"001d_ordinal":5,"001d_blueprint_digest_sha256":observed,"full_course_hard_prerequisite_skill_ids":[PREREQUISITE_SKILL_ID],"portable_slice_prerequisite_satisfaction_claimed":False,"grounding_status":grounding["status"],"grounding_claim_coverage_percent":grounding["claim_coverage_percent"],"admitted_source_count":len(sources),"instructional_design_status":instructional["status"],"worked_example_count":2,"practice_item_count":2,"mastery_item_count":1,"retention_item_count":1,"scoring_type":SCORING_TYPE,"oracle_reference_status":reference["status"],"lesson_behavior_status":lesson["status"],"oracle_negative_matrix":negative,"runtime_engine_path_verified":True,"runtime_course_state":"READY_FOR_REVIEW","practice_not_mastery_verified":True,"mastery_advances_only_to_retention_due":True,"retention_delay_enforced":True,"delayed_distinct_retention_path_verified":True,"portable_fixture_mastery_only":True,"real_learner_mastery":"UNOBSERVED","full_course_prerequisite_satisfaction":"UNOBSERVED_REAL_LEARNER","psychometric_validity":"UNOBSERVED","sme_approval":"UNOBSERVED","certification_equivalence":"UNOBSERVED","a01_native_production_authority":"NOT_INFERRED","full_course_activation_allowed":False,"source_bytes_archived":False,"next_successor":"Admit Batch 05 and select exact 001D ordinal 6 (ASQ-CSSGB-2022-I.C.1) without replaying prior work."}
    for name,value in (("qualification-summary.json",summary),("grounding-validation.json",grounding),("instructional-validation.json",instructional),("runtime-evidence.json",runtime),("materialized-i-b-2-course.json",body),("i-b-2-grounding-dossier.json",d)):
        (EVIDENCE_DIR/name).write_text(json.dumps(value,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    print(json.dumps(summary,sort_keys=True))

if __name__=="__main__": main()
