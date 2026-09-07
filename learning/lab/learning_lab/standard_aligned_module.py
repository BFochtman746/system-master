from __future__ import annotations

import copy
import json
from dataclasses import asdict
from typing import Any, Dict, List, Optional, Tuple

from .domain_general import DomainSpec
from .engine import InjectedCrash
from .external_standard import build_update_training_delta
from .models import Course, Criterion, Item, Lesson, Skill
from .real_course import validate_grounding, validate_instructional_design
from .repository import Repository, digest

ASQ_DEFINE_DOMAIN_KEY = "asq-cssgb-define-sipoc-charter"
ASQ_DEFINE_OUTCOME = "Analyze a process with SIPOC and frame an improvement project with a project charter aligned to selected ASQ CSSGB requirements."
ASQ_SIPOC_REQ = "ASQ-CSSGB-2022-II.A.4"
ASQ_CHARTER_REQ = "ASQ-CSSGB-2022-II.C.2"
MODULE_VERSION = "ASQ-STANDARD-ALIGNED-BOUNDED-MODULE-V1"
ASSESSMENT_BLUEPRINT_VERSION = "ASQ-STANDARD-ALIGNED-ASSESSMENT-BLUEPRINT-V1"
UPDATE_EXECUTION_VERSION = "ASQ-UPDATE-TRAINING-EXECUTION-V1"

ASQ_DEFINE_DOSSIER: Dict[str, Any] = {
    "dossier_id": "RSCH-ASQ-CSSGB-DEFINE-BOUND-001",
    "retrieved_date": "2026-09-07",
    "source_policy": "AUTHORITATIVE_ASQ_PRIMARY_PREFERRED",
    "sources": [
        {"source_id":"SRC-ASQ-BOK","title":"ASQ Certified Six Sigma Green Belt Body of Knowledge / official certification materials","url":"https://www.asq.org/cert/six-sigma-green-belt","authority":"ASQ","standing":"ADMITTED"},
        {"source_id":"SRC-ASQ-SIPOC","title":"SIPOC+CM Diagram","url":"https://asq.org/quality-resources/sipoc","authority":"ASQ","standing":"ADMITTED"},
        {"source_id":"SRC-ASQ-DMAIC","title":"DMAIC Process","url":"https://asq.org/quality-resources/dmaic","authority":"ASQ","standing":"ADMITTED"},
    ],
    "claims": [
        {"claim_id":"CL-ASQ-BOK-SIPOC","source_id":"SRC-ASQ-BOK","text":"The selected CSSGB requirement expects analysis of process inputs and outputs using the SIPOC model.","kind":"EXTERNAL_STANDARD"},
        {"claim_id":"CL-ASQ-BOK-CHARTER","source_id":"SRC-ASQ-BOK","text":"The selected CSSGB project-charter requirement is at Apply level and includes developing a problem statement with baseline/current status and project goals.","kind":"EXTERNAL_STANDARD"},
        {"claim_id":"CL-ASQ-SIPOC-ELEMENTS","source_id":"SRC-ASQ-SIPOC","text":"SIPOC captures suppliers, inputs, process, outputs, and customers for the process under study.","kind":"FACT"},
        {"claim_id":"CL-ASQ-SIPOC-BOUNDARY","source_id":"SRC-ASQ-SIPOC","text":"A SIPOC analysis should clearly identify the process and define its start and end boundaries.","kind":"FACT"},
        {"claim_id":"CL-ASQ-CHARTER-ELEMENTS","source_id":"SRC-ASQ-DMAIC","text":"In Define, the project charter establishes focus, scope, direction, and motivation and includes problem and goal statements, metrics, and a broad timeline.","kind":"FACT"},
    ],
    "domain_key": ASQ_DEFINE_DOMAIN_KEY,
    "external_requirement_ids": [ASQ_SIPOC_REQ, ASQ_CHARTER_REQ],
}

SCENARIOS: Dict[str, Dict[str, Any]] = {
    "FULFILLMENT": {
        "suppliers":["customer","inventory system"], "inputs":["customer order","inventory status"],
        "process_steps":["receive order","pick items","pack order","ship order"],
        "outputs":["shipped order","shipment confirmation"], "customers":["customer"],
        "start":"order received", "end":"shipment confirmation sent",
        "problem_contains":["late","orders"], "baseline_contains":["18%"], "goal_contains":["8%"],
        "metric_contains":["late-order rate"], "scope_in_contains":["order receipt","shipment"], "scope_out_contains":["supplier manufacturing"],
    },
    "SERVICE": {
        "suppliers":["customer","support portal"], "inputs":["support request","account data"],
        "process_steps":["receive ticket","triage ticket","resolve issue","close ticket"],
        "outputs":["resolved ticket","closure notice"], "customers":["customer"],
        "start":"ticket received", "end":"closure notice sent",
        "problem_contains":["reopened","tickets"], "baseline_contains":["12%"], "goal_contains":["5%"],
        "metric_contains":["reopen rate"], "scope_in_contains":["ticket receipt","closure"], "scope_out_contains":["product redesign"],
    },
    "WAREHOUSE": {
        "suppliers":["receiving team","warehouse system"], "inputs":["pick request","location data"],
        "process_steps":["release pick","locate item","pick item","confirm pick"],
        "outputs":["picked item","pick confirmation"], "customers":["packing team"],
        "start":"pick request released", "end":"pick confirmation recorded",
        "problem_contains":["mis-picks"], "baseline_contains":["6%"], "goal_contains":["2%"],
        "metric_contains":["mis-pick rate"], "scope_in_contains":["pick release","pick confirmation"], "scope_out_contains":["carrier delivery"],
    },
}


def _j(obj: Dict[str, Any]) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


def _sipoc_answer(scenario: str) -> str:
    s=SCENARIOS[scenario]
    return _j({"suppliers":s["suppliers"],"inputs":s["inputs"],"process_steps":s["process_steps"],"outputs":s["outputs"],"customers":s["customers"],"start":s["start"],"end":s["end"]})


def _charter_answer(scenario: str) -> str:
    s=SCENARIOS[scenario]
    return _j({
        "problem_statement":f"Current performance includes {s['baseline_contains'][0]} {s['problem_contains'][0]} {s['problem_contains'][1] if len(s['problem_contains'])>1 else ''}".strip(),
        "baseline":s["baseline_contains"][0], "goal":s["goal_contains"][0],
        "primary_metric":s["metric_contains"][0], "scope_in":" to ".join(s["scope_in_contains"]),
        "scope_out":s["scope_out_contains"][0],
    })

ITEM_SCENARIO = {
    "P-ASQ-SIPOC-1":"FULFILLMENT", "P-ASQ-SIPOC-2":"SERVICE", "M-ASQ-SIPOC-1":"FULFILLMENT", "R-ASQ-SIPOC-1":"SERVICE",
    "P-ASQ-CHARTER-1":"FULFILLMENT", "P-ASQ-CHARTER-2":"SERVICE", "M-ASQ-CHARTER-1":"FULFILLMENT", "R-ASQ-CHARTER-1":"SERVICE",
    "T-ASQ-SIPOC-WAREHOUSE":"WAREHOUSE", "T-ASQ-CHARTER-WAREHOUSE":"WAREHOUSE",
    "MN-ASQ-SIPOC-2":"WAREHOUSE", "MN-ASQ-CHARTER-2":"WAREHOUSE",
}

class ASQDefineBehaviorOracle:
    @staticmethod
    def _contains_all(value: str, tokens: List[str]) -> bool:
        v=value.casefold()
        return all(t.casefold() in v for t in tokens)

    def score(self, item: Dict[str, Any], response: str) -> bool:
        try:
            body=json.loads(response)
        except Exception:
            return False
        scenario=ITEM_SCENARIO.get(item.get("item_id"))
        if not scenario:
            raise ValueError("ASQ_ITEM_SCENARIO_UNKNOWN")
        s=SCENARIOS[scenario]
        st=item.get("scoring_type")
        if st=="ASQ_SIPOC_JSON":
            required=("suppliers","inputs","process_steps","outputs","customers","start","end")
            if any(k not in body for k in required): return False
            for k in ("suppliers","inputs","process_steps","outputs","customers"):
                if not isinstance(body[k],list) or {str(x).casefold() for x in body[k]} != {str(x).casefold() for x in s[k]}: return False
            return str(body["start"]).casefold()==s["start"].casefold() and str(body["end"]).casefold()==s["end"].casefold()
        if st=="ASQ_CHARTER_JSON":
            required=("problem_statement","baseline","goal","primary_metric","scope_in","scope_out")
            if any(k not in body for k in required): return False
            return (
                self._contains_all(str(body["problem_statement"]),s["problem_contains"]) and
                self._contains_all(str(body["baseline"]),s["baseline_contains"]) and
                self._contains_all(str(body["goal"]),s["goal_contains"]) and
                self._contains_all(str(body["primary_metric"]),s["metric_contains"]) and
                self._contains_all(str(body["scope_in"]),s["scope_in_contains"]) and
                self._contains_all(str(body["scope_out"]),s["scope_out_contains"])
            )
        raise ValueError("ASQ_SCORING_TYPE_UNKNOWN")

    def validate_reference_items(self, course: Dict[str, Any]) -> Dict[str, Any]:
        failures=[]
        for item in course.get("items",[]):
            if item.get("scoring_type") in {"ASQ_SIPOC_JSON","ASQ_CHARTER_JSON"} and not self.score(item,item["answer"]):
                failures.append(item["item_id"])
        return {"status":"PASS" if not failures else "FAIL","failed_item_ids":failures}

    def validate_lesson_examples(self, course: Dict[str, Any]) -> Dict[str, Any]:
        failures=[]
        for lesson in course.get("lessons",[]):
            if len(lesson.get("worked_examples",[]))<2: failures.append(lesson["lesson_id"])
            if not all("Scenario" in x or "Example" in x for x in lesson.get("worked_examples",[])): failures.append(lesson["lesson_id"]+":FORMAT")
        return {"status":"PASS" if not failures else "FAIL","failed_examples":failures}


def build_asq_define_course(*, goal_id: str, title: str, desired_outcome: str, dossier: Dict[str, Any]) -> Course:
    if desired_outcome != ASQ_DEFINE_OUTCOME: raise ValueError("ASQ_DEFINE_OUTCOME_MISMATCH")
    skills=[
        Skill("S-ASQ-SIPOC","Analyze process inputs/outputs with SIPOC",["C-ASQ-SIPOC"]),
        Skill("S-ASQ-CHARTER","Frame an improvement project with a charter",["C-ASQ-CHARTER"],["S-ASQ-SIPOC"]),
    ]
    criteria=[
        Criterion("C-ASQ-SIPOC","S-ASQ-SIPOC","Analyze a bounded process using suppliers, inputs, process, outputs, customers, and explicit boundaries."),
        Criterion("C-ASQ-CHARTER","S-ASQ-CHARTER","Apply project-charter elements to define a measurable improvement problem and goal with bounded scope."),
    ]
    sipoc_refs=["CL-ASQ-BOK-SIPOC","CL-ASQ-SIPOC-ELEMENTS","CL-ASQ-SIPOC-BOUNDARY"]
    charter_refs=["CL-ASQ-BOK-CHARTER","CL-ASQ-CHARTER-ELEMENTS"]
    sipoc_exp="A SIPOC is a high-level process boundary and relationship model: identify suppliers and inputs, the core process steps, outputs and customers, then make the process start/end explicit."
    charter_exp="A project charter turns a selected improvement problem into a bounded project by stating the current problem/baseline, a measurable goal, the primary metric, and what is in and out of scope."
    lessons=[
        Lesson("L-ASQ-SIPOC","SIPOC process analysis","S-ASQ-SIPOC",["C-ASQ-SIPOC"],"Analyze a process boundary and its supplier-input-process-output-customer relationships.",sipoc_exp,
               ["Example Scenario: order fulfillment maps order/customer/system inputs through picking and shipping to shipment outputs.","Example Scenario: service support maps requests/account data through triage and resolution to closure outputs."],
               ["P-ASQ-SIPOC-1","P-ASQ-SIPOC-2"],sipoc_refs,
               [{"role":"EXPLANATION","text":sipoc_exp,"claim_refs":sipoc_refs},{"role":"WORKED_EXAMPLE","text":"Example Scenario: order fulfillment maps order/customer/system inputs through picking and shipping to shipment outputs.","claim_refs":sipoc_refs},{"role":"WORKED_EXAMPLE","text":"Example Scenario: service support maps requests/account data through triage and resolution to closure outputs.","claim_refs":sipoc_refs}]),
        Lesson("L-ASQ-CHARTER","Project charter application","S-ASQ-CHARTER",["C-ASQ-CHARTER"],"Apply charter elements to a measurable process-improvement problem.",charter_exp,
               ["Example Scenario: an 18% late-order baseline is framed against an 8% goal with a late-order metric and bounded fulfillment scope.","Example Scenario: a 12% ticket-reopen baseline is framed against a 5% goal with a reopen-rate metric and bounded support scope."],
               ["P-ASQ-CHARTER-1","P-ASQ-CHARTER-2"],charter_refs,
               [{"role":"EXPLANATION","text":charter_exp,"claim_refs":charter_refs},{"role":"WORKED_EXAMPLE","text":"Example Scenario: an 18% late-order baseline is framed against an 8% goal with a late-order metric and bounded fulfillment scope.","claim_refs":charter_refs},{"role":"WORKED_EXAMPLE","text":"Example Scenario: a 12% ticket-reopen baseline is framed against a 5% goal with a reopen-rate metric and bounded support scope.","claim_refs":charter_refs}]),
    ]
    def item(i,f,c,m,p,a,r,st,refs): return Item(i,f,c,m,p,a,r,st,refs,[{"role":"RATIONALE","text":r,"claim_refs":refs}])
    items=[
        item("P-ASQ-SIPOC-1","F-ASQ-SIPOC-P1","C-ASQ-SIPOC","PRACTICE","Build the fulfillment SIPOC as JSON.",_sipoc_answer("FULFILLMENT"),"Practice uses a bounded known scenario.","ASQ_SIPOC_JSON",sipoc_refs),
        item("P-ASQ-SIPOC-2","F-ASQ-SIPOC-P2","C-ASQ-SIPOC","PRACTICE","Build the service SIPOC as JSON.",_sipoc_answer("SERVICE"),"Second practice varies the process context.","ASQ_SIPOC_JSON",sipoc_refs),
        item("M-ASQ-SIPOC-1","F-ASQ-SIPOC-M1","C-ASQ-SIPOC","MASTERY_CHECK","Independently analyze the fulfillment process as SIPOC JSON.",_sipoc_answer("FULFILLMENT"),"Independent scenario analysis matches the ASQ Analyze-level target.","ASQ_SIPOC_JSON",sipoc_refs),
        item("R-ASQ-SIPOC-1","F-ASQ-SIPOC-R1","C-ASQ-SIPOC","RETENTION_CHECK","Later, independently analyze the service process as SIPOC JSON.",_sipoc_answer("SERVICE"),"Delayed distinct-family evidence checks retention.","ASQ_SIPOC_JSON",sipoc_refs),
        item("P-ASQ-CHARTER-1","F-ASQ-CHARTER-P1","C-ASQ-CHARTER","PRACTICE","Build the fulfillment project charter as JSON.",_charter_answer("FULFILLMENT"),"Practice applies the charter elements to a bounded improvement case.","ASQ_CHARTER_JSON",charter_refs),
        item("P-ASQ-CHARTER-2","F-ASQ-CHARTER-P2","C-ASQ-CHARTER","PRACTICE","Build the service project charter as JSON.",_charter_answer("SERVICE"),"Second practice varies the business problem.","ASQ_CHARTER_JSON",charter_refs),
        item("M-ASQ-CHARTER-1","F-ASQ-CHARTER-M1","C-ASQ-CHARTER","MASTERY_CHECK","Independently build the fulfillment charter as JSON.",_charter_answer("FULFILLMENT"),"Independent charter construction matches the ASQ Apply-level target.","ASQ_CHARTER_JSON",charter_refs),
        item("R-ASQ-CHARTER-1","F-ASQ-CHARTER-R1","C-ASQ-CHARTER","RETENTION_CHECK","Later, independently build the service charter as JSON.",_charter_answer("SERVICE"),"Delayed distinct-family application checks retention.","ASQ_CHARTER_JSON",charter_refs),
    ]
    return Course(f"COURSE-{goal_id}",1,goal_id,title,desired_outcome,skills,criteria,lessons,items,source_ids=[x["source_id"] for x in dossier["sources"]],research_dossier_id=dossier["dossier_id"],generation_adapter="ASQ-STANDARD-ALIGNED-COMPILER-V1")

ASQ_TRANSFER_TASKS={
    "T-ASQ-SIPOC-WAREHOUSE":{"item_id":"T-ASQ-SIPOC-WAREHOUSE","family_id":"F-ASQ-SIPOC-T1","criterion_id":"C-ASQ-SIPOC","skill_id":"S-ASQ-SIPOC","mode":"TRANSFER_CHECK","prompt":"Analyze the warehouse picking process as SIPOC JSON.","answer":_sipoc_answer("WAREHOUSE"),"scoring_type":"ASQ_SIPOC_JSON","claim_refs":["CL-ASQ-BOK-SIPOC","CL-ASQ-SIPOC-ELEMENTS","CL-ASQ-SIPOC-BOUNDARY"],"novelty":{"scenario_family":"WAREHOUSE_PICKING","unseen_context":True}},
    "T-ASQ-CHARTER-WAREHOUSE":{"item_id":"T-ASQ-CHARTER-WAREHOUSE","family_id":"F-ASQ-CHARTER-T1","criterion_id":"C-ASQ-CHARTER","skill_id":"S-ASQ-CHARTER","mode":"TRANSFER_CHECK","prompt":"Build a project charter for the warehouse mis-pick problem as JSON.","answer":_charter_answer("WAREHOUSE"),"scoring_type":"ASQ_CHARTER_JSON","claim_refs":["CL-ASQ-BOK-CHARTER","CL-ASQ-CHARTER-ELEMENTS"],"novelty":{"scenario_family":"WAREHOUSE_PICKING","unseen_context":True}},
}
ASQ_MAINTENANCE_TASKS={
    "MN-ASQ-SIPOC-2":dict(ASQ_TRANSFER_TASKS["T-ASQ-SIPOC-WAREHOUSE"],item_id="MN-ASQ-SIPOC-2",family_id="F-ASQ-SIPOC-R2",mode="RETENTION_CHECK",fresh_family=True),
    "MN-ASQ-CHARTER-2":dict(ASQ_TRANSFER_TASKS["T-ASQ-CHARTER-WAREHOUSE"],item_id="MN-ASQ-CHARTER-2",family_id="F-ASQ-CHARTER-R2",mode="RETENTION_CHECK",fresh_family=True),
}


def asq_define_domain_spec() -> DomainSpec:
    return DomainSpec(ASQ_DEFINE_DOMAIN_KEY,ASQ_DEFINE_OUTCOME,copy.deepcopy(ASQ_DEFINE_DOSSIER),build_asq_define_course,ASQDefineBehaviorOracle(),"ASQ-STANDARD-ALIGNED-COMPILER-V1",copy.deepcopy(ASQ_MAINTENANCE_TASKS),copy.deepcopy(ASQ_TRANSFER_TASKS),{"S-ASQ-SIPOC","S-ASQ-CHARTER"},{},lambda p,r:(False,None),lambda s,c,a:{"content":"","claim_refs":[]})


def _validate_requirement_set_integrity(requirement_set: Dict[str, Any], *, exact_standard_id: Optional[str] = None) -> None:
    stored=requirement_set.get("requirement_set_digest")
    body={k:copy.deepcopy(v) for k,v in requirement_set.items() if k!="requirement_set_digest"}
    if not stored or stored != digest(body):
        raise ValueError("REQUIREMENT_SET_DIGEST_MISMATCH")
    sid=str(requirement_set.get("external_standard_id") or "")
    if not sid.startswith("ASQ-CSSGB-BOK-"):
        raise ValueError("UNEXPECTED_EXTERNAL_STANDARD_FAMILY")
    if exact_standard_id is not None and sid != exact_standard_id:
        raise ValueError("UNEXPECTED_EXTERNAL_STANDARD_FOR_MODULE")


def build_assessment_blueprint(course: Dict[str, Any], requirement_set: Dict[str, Any]) -> Dict[str, Any]:
    _validate_requirement_set_integrity(requirement_set, exact_standard_id="ASQ-CSSGB-BOK-2022")
    req_by_id={r["requirement_id"]:r for r in requirement_set["requirements"]}
    if ASQ_SIPOC_REQ not in req_by_id or ASQ_CHARTER_REQ not in req_by_id: raise ValueError("SELECTED_EXTERNAL_REQUIREMENT_MISSING")
    rows=[
        {"external_requirement_id":ASQ_SIPOC_REQ,"skill_id":"S-ASQ-SIPOC","criterion_id":"C-ASQ-SIPOC","external_cognitive_level":req_by_id[ASQ_SIPOC_REQ]["highest_cognitive_level"],"assessment_modes":["MASTERY_CHECK","RETENTION_CHECK","TRANSFER_CHECK"],"required_performance":"INDEPENDENT_SCENARIO_ANALYSIS","oracle":"ASQ_SIPOC_JSON"},
        {"external_requirement_id":ASQ_CHARTER_REQ,"skill_id":"S-ASQ-CHARTER","criterion_id":"C-ASQ-CHARTER","external_cognitive_level":req_by_id[ASQ_CHARTER_REQ]["highest_cognitive_level"],"assessment_modes":["MASTERY_CHECK","RETENTION_CHECK","TRANSFER_CHECK"],"required_performance":"INDEPENDENT_APPLICATION_TASK","oracle":"ASQ_CHARTER_JSON"},
    ]
    failures=[]
    expected={ASQ_SIPOC_REQ:"ANALYZE",ASQ_CHARTER_REQ:"APPLY"}
    for r in rows:
        if r["external_cognitive_level"]!=expected[r["external_requirement_id"]]: failures.append("COGNITIVE_LEVEL_DRIFT:"+r["external_requirement_id"])
        if "TRANSFER_CHECK" not in r["assessment_modes"]: failures.append("TRANSFER_EVIDENCE_MISSING:"+r["external_requirement_id"])
    bp={"version":ASSESSMENT_BLUEPRINT_VERSION,"module_course_id":course["course_id"],"module_course_digest":digest(course),"requirement_set_digest":requirement_set["requirement_set_digest"],"rows":rows,"status":"PASS" if not failures else "FAIL","failures":failures,"external_certification_status":"NOT_MADE"}
    bp["assessment_blueprint_digest"]=digest(bp)
    return bp


def validate_standard_aligned_module(course: Dict[str, Any], requirement_set: Dict[str, Any]) -> Dict[str, Any]:
    grounding=validate_grounding(course,ASQ_DEFINE_DOSSIER)
    instructional=validate_instructional_design(course)
    behavior=ASQDefineBehaviorOracle().validate_reference_items(course)
    lesson_behavior=ASQDefineBehaviorOracle().validate_lesson_examples(course)
    bp=build_assessment_blueprint(course,requirement_set)
    failures=[]
    for name,val in (("grounding",grounding),("instructional",instructional),("behavior",behavior),("lesson_behavior",lesson_behavior),("assessment_blueprint",bp)):
        if val["status"]!="PASS": failures.append(name.upper()+"_FAILED")
    return {"status":"PASS" if not failures else "FAIL","failures":failures,"grounding":grounding,"instructional":instructional,"behavior":behavior,"lesson_behavior":lesson_behavior,"assessment_blueprint":bp,"standing":"MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED"}


class StandardAlignedModuleCompiler:
    PHASES=("REQUIREMENTS_BOUND","DOSSIER_FROZEN","MODULE_COMPILED","ASSESSMENT_BLUEPRINT_VERIFIED","COMPLETE_BEFORE_RETURN")
    def __init__(self,repo:Repository): self.repo=repo
    def execute(self,*,operation_id:str,job_id:str,goal_id:str,requirement_set:Dict[str,Any],crash_after_phase:Optional[str]=None)->Dict[str,Any]:
        selected=[ASQ_SIPOC_REQ,ASQ_CHARTER_REQ]
        _validate_requirement_set_integrity(requirement_set, exact_standard_id="ASQ-CSSGB-BOK-2022")
        payload={"job_id":job_id,"goal_id":goal_id,"requirement_set_digest":requirement_set.get("requirement_set_digest"),"selected_requirement_ids":selected}
        prior=self.repo.operation_result(operation_id,payload)
        if prior: return prior
        req_by={r["requirement_id"]:r for r in requirement_set.get("requirements",[])}
        if any(x not in req_by for x in selected): raise ValueError("SELECTED_EXTERNAL_REQUIREMENT_MISSING")
        def phase(name:str):
            self.repo.put_object("standard_module_phase",f"{job_id}:{name}",1,{"job_id":job_id,"phase":name,"payload_digest":digest(payload)})
            if crash_after_phase==name: raise InjectedCrash(name)
        phase("REQUIREMENTS_BOUND")
        self.repo.put_object("research_dossier",ASQ_DEFINE_DOSSIER["dossier_id"],1,ASQ_DEFINE_DOSSIER); phase("DOSSIER_FROZEN")
        course=asdict(build_asq_define_course(goal_id=goal_id,title="ASQ CSSGB Define: SIPOC + Project Charter",desired_outcome=ASQ_DEFINE_OUTCOME,dossier=ASQ_DEFINE_DOSSIER)); course["domain_key"]=ASQ_DEFINE_DOMAIN_KEY
        self.repo.put_object("course",course["course_id"],1,course); phase("MODULE_COMPILED")
        val=validate_standard_aligned_module(course,requirement_set)
        if val["status"]!="PASS": raise ValueError("STANDARD_ALIGNED_MODULE_VALIDATION_FAILED:"+",".join(val["failures"]))
        bp=val["assessment_blueprint"]
        self.repo.put_object("standard_aligned_assessment_blueprint",course["course_id"],1,bp); phase("ASSESSMENT_BLUEPRINT_VERIFIED")
        alignment={"version":MODULE_VERSION,"course_id":course["course_id"],"course_digest":digest(course),"external_requirement_ids":selected,"requirement_set_digest":requirement_set["requirement_set_digest"],"validation_standing":val["standing"],"external_certification_status":"NOT_MADE"}; alignment["alignment_digest"]=digest(alignment)
        self.repo.put_object("standard_module_alignment",course["course_id"],1,alignment); phase("COMPLETE_BEFORE_RETURN")
        result={"status":"COMPLETE","course_id":course["course_id"],"course_digest":digest(course),"assessment_blueprint_digest":bp["assessment_blueprint_digest"],"alignment_digest":alignment["alignment_digest"],"selected_requirement_ids":selected,"validation_standing":val["standing"]}
        self.repo.record_operation(operation_id,payload,result); return result


def execute_update_training_delta(old_course:Dict[str,Any],old_set:Dict[str,Any],new_set:Dict[str,Any])->Dict[str,Any]:
    _validate_requirement_set_integrity(old_set, exact_standard_id="ASQ-CSSGB-BOK-2022")
    _validate_requirement_set_integrity(new_set)
    delta=build_update_training_delta(old_set,new_set)
    selected={ASQ_SIPOC_REQ:"S-ASQ-SIPOC",ASQ_CHARTER_REQ:"S-ASQ-CHARTER"}
    affected=[rid for rid in delta["affected_training_requirement_ids"] if rid in selected]
    preserved=[rid for rid in selected if rid not in affected]
    update_lessons=[]
    update_assessments=[]
    revalidation=[]
    new_by={r["requirement_id"]:r for r in new_set.get("requirements",[])}
    for rid in affected:
        skill=selected[rid]
        source_lesson=next(l for l in old_course["lessons"] if l["skill_id"]==skill)
        ul=copy.deepcopy(source_lesson); ul["lesson_id"]="UPD-"+source_lesson["lesson_id"]
        ul["title"]="Update: "+source_lesson["title"]
        ul["objective"]="Refresh changed external requirement: "+rid
        update_lessons.append(ul)
        level=new_by[rid].get("highest_cognitive_level") if rid in new_by else "UNKNOWN"
        perf={"APPLY":"INDEPENDENT_APPLICATION_TASK","ANALYZE":"INDEPENDENT_SCENARIO_ANALYSIS","EVALUATE":"INDEPENDENT_JUDGMENT_TASK","CREATE":"AUTHENTIC_CONSTRUCTED_ARTIFACT"}.get(level,"INDEPENDENT_KNOWLEDGE_ASSESSMENT")
        update_assessments.append({"external_requirement_id":rid,"skill_id":skill,"new_cognitive_level":level,"required_performance":perf,"standing":"FRESH_REVALIDATION_REQUIRED"})
        revalidation.append({"external_requirement_id":rid,"skill_id":skill,"standing":"REVALIDATION_REQUIRED"})
    for rid in preserved:
        revalidation.append({"external_requirement_id":rid,"skill_id":selected[rid],"standing":"PRESERVE_BY_SEMANTIC_EQUIVALENCE"})
    out={"version":UPDATE_EXECUTION_VERSION,"old_course_digest":digest(old_course),"old_requirement_set_digest":old_set["requirement_set_digest"],"new_requirement_set_digest":new_set["requirement_set_digest"],"source_delta_digest":delta["update_training_delta_digest"],"affected_requirement_ids":affected,"update_lessons":update_lessons,"update_assessments":update_assessments,"revalidation_plan":sorted(revalidation,key=lambda x:x["external_requirement_id"]),"retake_entire_course_required":False,"status":"NO_UPDATE_NEEDED" if not affected else "TARGETED_UPDATE_TRAINING_READY","external_certification_status":"NOT_MADE"}
    out["update_execution_digest"]=digest(out); return out
