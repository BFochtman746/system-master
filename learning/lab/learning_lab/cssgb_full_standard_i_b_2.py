from __future__ import annotations

import copy
import json
from typing import Any, Dict, List, Optional

from .models import Course, Criterion, Item, Lesson, Skill

DOMAIN_KEY = "asq-cssgb-2022-001e-i-b-2"
REQUIREMENT_ID = "ASQ-CSSGB-2022-I.B.2"
SKILL_ID = "CSSGB-2022::ASQ-CSSGB-2022-I.B.2::SUBSKILL::vsm-interpretation"
PREREQUISITE_SKILL_ID = "CSSGB-2022::ASQ-CSSGB-2022-I.B.1::SUBSKILL::lean-value-flow-waste"
CRITERION_ID = "CRIT::CSSGB-2022::ASQ-CSSGB-2022-I.B.2::SUBSKILL::vsm-interpretation"
LESSON_ID = "LESSON::CSSGB-2022::ASQ-CSSGB-2022-I.B.2::SUBSKILL::vsm-interpretation"
ASSESSMENT_TARGET_ID = "ASSESS::CSSGB-2022::ASQ-CSSGB-2022-I.B.2::vsm-interpretation::TARGET::bounded-map-explanation"
OUTCOME = "Given a simplified value-stream map, identify the process-flow information it conveys and explain at least one process condition the map makes visible without inferring unavailable performance evidence."
SCORING_TYPE = "CSSGB_I_B_2_VSM_INTERPRETATION_V1"

DOSSIER: Dict[str, Any] = {
    "dossier_id": "RSCH-CSSGB-2022-I-B-2-001",
    "retrieved_date": "2026-09-10",
    "domain_key": DOMAIN_KEY,
    "frozen_requirement_identity": {
        "requirement_id": REQUIREMENT_ID,
        "source_locator": "ASQ CSSGB BoK 2022 p.3 / I.B.2",
        "title": "Value stream mapping",
        "highest_cognitive_level": "UNDERSTAND",
        "supplemental_sources_replace_frozen_identity": False,
    },
    "sources": [
        {"source_id":"SRC-ASQ-VSM","title":"Value Stream Mapping Tutorial - What is VSM?","url":"https://asq.org/quality-resources/value-stream-mapping","authority":"AMERICAN_SOCIETY_FOR_QUALITY","standing":"ADMITTED","retrieved_date":"2026-09-10","source_bytes_archived":False},
        {"source_id":"SRC-ASQ-VSM-TRAINING","title":"Value Stream Mapping","url":"https://asq.org/training/value-stream-mapping-vsmasq","authority":"AMERICAN_SOCIETY_FOR_QUALITY","standing":"ADMITTED","retrieved_date":"2026-09-10","source_bytes_archived":False},
        {"source_id":"SRC-ASQ-SIX-SIGMA-TOOLS","title":"Six Sigma Tools: DMAIC, Lean & Other Techniques","url":"https://asq.org/quality-resources/sixsigma/tools","authority":"AMERICAN_SOCIETY_FOR_QUALITY","standing":"ADMITTED","retrieved_date":"2026-09-10","source_bytes_archived":False}
    ],
    "claims": [
        {"claim_id":"CL-CSSGB-I-B-2-001","source_id":"SRC-ASQ-VSM","text":"ASQ describes value stream mapping as a visual flowchart-based Lean tool that documents process steps and combines material processing with information flow and related data.","kind":"PARAPHRASED_SOURCE_CLAIM"},
        {"claim_id":"CL-CSSGB-I-B-2-002","source_id":"SRC-ASQ-VSM","text":"ASQ identifies current-state map data such as cycle or processing time, inventory, queues or waiting time, information flow, material flow, and value-added versus non-value-added time.","kind":"PARAPHRASED_SOURCE_CLAIM"},
        {"claim_id":"CL-CSSGB-I-B-2-003","source_id":"SRC-ASQ-VSM-TRAINING","text":"ASQ describes VSM as a way to understand and visualize the flow of materials and information through a value stream and to identify sources of waste.","kind":"PARAPHRASED_SOURCE_CLAIM"},
        {"claim_id":"CL-CSSGB-I-B-2-004","source_id":"SRC-ASQ-SIX-SIGMA-TOOLS","text":"ASQ describes Lean flow as progressive movement through the value stream without stoppages, scrap, or backflows; a map can expose a flow condition when such evidence is explicitly shown.","kind":"PARAPHRASED_SOURCE_CLAIM"},
        {"claim_id":"CL-CSSGB-I-B-2-005","source_id":"SRC-ASQ-VSM","text":"Interpreting a bounded map must remain limited to visible elements and stated map data; causes, missing performance data, or post-improvement results are not established merely because a map shows a condition.","kind":"EVIDENCE_BOUNDARY_INSTRUCTIONAL_INFERENCE"}
    ],
    "limitations": [
        "SUPPLEMENTAL_SOURCES_DO_NOT_REPLACE_FROZEN_2022_IDENTITY",
        "SOURCE_BYTES_NOT_ARCHIVED_IN_THIS_PORTABLE_BATCH",
        "PORTABLE_I_B_2_SLICE_TESTS_LOCAL_ORACLE_BEHAVIOR_IN_ISOLATION;THE_FULL_001D_BLUEPRINT_RETAINS_I_B_1_AS_A_HARD_PREREQUISITE",
        "NO_REAL_LEARNER_OR_PSYCHOMETRIC_EVIDENCE_CREATED"
    ]
}


def dossier() -> Dict[str, Any]:
    return copy.deepcopy(DOSSIER)


def _answer(flow_links: List[List[str]], conditions: List[str], unsupported: Optional[List[str]] = None, missing: Optional[List[str]] = None) -> str:
    return json.dumps({
        "flow_links": [{"from_id": a, "to_id": b} for a, b in flow_links],
        "supported_condition_ids": conditions,
        "unsupported_conclusion_ids": unsupported or [],
        "missing_evidence": missing or [],
        "post_improvement_performance_claimed": False,
    }, sort_keys=True, separators=(",", ":"))


SPECS = {
    "P-CSSGB-I-B-2-01": {"links":{("P1","Q1"),("Q1","P2")},"conditions":{"WAIT_BETWEEN_P1_P2"},"unsupported":set(),"missing":set()},
    "P-CSSGB-I-B-2-02": {"links":{("P1","INV1"),("INV1","P2")},"conditions":{"INVENTORY_BETWEEN_P1_P2"},"unsupported":{"CAUSE_OF_INVENTORY"},"missing":{"CAUSE_EVIDENCE_FOR_INVENTORY"}},
    "M-CSSGB-I-B-2-01": {"links":{("ORDER","P1"),("P1","Q1"),("Q1","P2")},"conditions":{"QUEUE_INTERRUPTS_FLOW","INFORMATION_FLOW_TO_P1"},"unsupported":set(),"missing":set()},
    "R-CSSGB-I-B-2-01": {"links":{("P1","INV1"),("INV1","P2"),("P2","CUSTOMER")},"conditions":{"INVENTORY_BETWEEN_STEPS"},"unsupported":set(),"missing":set()},
}


class CSSGBVSMInterpretationOracle:
    scoring_type = SCORING_TYPE
    keys = {"flow_links","supported_condition_ids","unsupported_conclusion_ids","missing_evidence","post_improvement_performance_claimed"}

    @classmethod
    def _parse(cls, response: str) -> Optional[Dict[str, Any]]:
        try: value = json.loads(response)
        except Exception: return None
        if not isinstance(value, dict) or set(value) != cls.keys or value["post_improvement_performance_claimed"] is not False: return None
        if not isinstance(value["flow_links"], list): return None
        links = []
        for row in value["flow_links"]:
            if not isinstance(row, dict) or set(row) != {"from_id","to_id"}: return None
            if not isinstance(row["from_id"], str) or not isinstance(row["to_id"], str): return None
            links.append((row["from_id"],row["to_id"]))
        if len(links) != len(set(links)): return None
        for key in ("supported_condition_ids","unsupported_conclusion_ids","missing_evidence"):
            if not isinstance(value[key], list) or any(not isinstance(x,str) for x in value[key]) or len(value[key]) != len(set(value[key])): return None
        value["_links"] = set(links)
        return value

    def score(self, item: Dict[str, Any], response: str) -> bool:
        spec = SPECS.get(item.get("item_id"))
        if not spec or item.get("scoring_type") != self.scoring_type: return False
        value = self._parse(response)
        if value is None: return False
        if value["_links"] != spec["links"]: return False
        if set(value["supported_condition_ids"]) != spec["conditions"]: return False
        if set(value["unsupported_conclusion_ids"]) != spec["unsupported"]: return False
        if set(value["missing_evidence"]) != spec["missing"]: return False
        return len(value["_links"]) >= 2 and len(value["supported_condition_ids"]) >= 1

    def validate_reference_items(self, course: Dict[str, Any]) -> Dict[str, Any]:
        checked=[{"item_id":i["item_id"],"pass":self.score(i,i.get("answer",""))} for i in course.get("items",[]) if i.get("scoring_type")==self.scoring_type]
        return {"status":"PASS" if checked and all(x["pass"] for x in checked) else "FAIL","checked":checked,"answer_key_used_as_oracle":False}

    def validate_lesson_examples(self, course: Dict[str, Any]) -> Dict[str, Any]:
        lesson=next((x for x in course.get("lessons",[]) if x.get("lesson_id")==LESSON_ID),None)
        examples=list(lesson.get("worked_examples",[])) if lesson else []
        text="\n".join(examples).lower()
        required=["visible","flow","queue","inventory","missing evidence","cause"]
        failures=[f"TOKEN_MISSING:{t}" for t in required if t not in text]
        if len(examples)<2: failures.append("WORKED_EXAMPLE_COUNT")
        return {"status":"PASS" if not failures else "FAIL","checked":len(examples),"failures":failures,"behavior_expectation_owned_by_oracle":True}


def build_course(*, goal_id: str, title: str, desired_outcome: str, dossier: Dict[str, Any]) -> Course:
    if dossier.get("dossier_id") != DOSSIER["dossier_id"] or desired_outcome.strip()!=OUTCOME: raise ValueError("CSSGB_I_B_2_INPUT_MISMATCH")
    claims=[f"CL-CSSGB-I-B-2-{i:03d}" for i in range(1,6)]
    explanation=("Interpret only what the simplified value-stream map makes visible. Trace process, material, and information-flow connections in the direction shown. A queue, waiting marker, inventory symbol, or other explicit map feature can support a bounded process-condition statement. The map does not by itself establish why that condition exists, any unshown metric, or post-improvement performance. When a requested conclusion depends on an unshown relationship or datum, identify the conclusion as unsupported and name the missing evidence. In the full 66-node curriculum, this capability remains gated by the admitted Lean-concepts prerequisite from I.B.1.")
    examples=[
        "Example 1 — The visible map shows P1 feeding a queue Q1 and Q1 feeding P2. That visible flow supports the condition that a queue or wait interrupts flow between P1 and P2. Do not infer the cause of the queue or any performance improvement that the map does not show.",
        "Example 2 — The visible map shows P1 feeding inventory INV1 and INV1 feeding P2. Inventory between steps is supported. If asked why the inventory exists, the map alone is insufficient: report the cause as unsupported and identify missing evidence rather than inventing a cause."
    ]
    lesson=Lesson(LESSON_ID,"Value stream mapping: interpret only visible process and information flow",SKILL_ID,[CRITERION_ID],OUTCOME,explanation,examples,["P-CSSGB-I-B-2-01","P-CSSGB-I-B-2-02"],claim_refs=claims,grounding_spans=[{"role":"EXPLANATION","text":explanation,"claim_refs":claims},{"role":"WORKED_EXAMPLE","text":examples[0],"claim_refs":claims},{"role":"WORKED_EXAMPLE","text":examples[1],"claim_refs":claims}])
    rationale="The response traces only visible map links and states process conditions supported by explicit queue, inventory, or information-flow elements without inventing unshown causes or post-improvement performance."
    items=[
        Item("P-CSSGB-I-B-2-01","F-CSSGB-I-B-2-P1",CRITERION_ID,"PRACTICE","Map: P1 -> Q1 -> P2. Q1 is explicitly labeled waiting queue. Report both visible links and WAIT_BETWEEN_P1_P2. Return the required JSON.",_answer([["P1","Q1"],["Q1","P2"]],["WAIT_BETWEEN_P1_P2"]),rationale,scoring_type=SCORING_TYPE,claim_refs=claims,grounding_spans=[{"role":"RATIONALE","text":rationale,"claim_refs":claims}]),
        Item("P-CSSGB-I-B-2-02","F-CSSGB-I-B-2-P2",CRITERION_ID,"PRACTICE","Map: P1 -> INV1 -> P2. INV1 is explicitly inventory. The map gives no cause for the inventory. Report the two visible links, INVENTORY_BETWEEN_P1_P2, mark CAUSE_OF_INVENTORY unsupported, and identify CAUSE_EVIDENCE_FOR_INVENTORY as missing. Return JSON.",_answer([["P1","INV1"],["INV1","P2"]],["INVENTORY_BETWEEN_P1_P2"],["CAUSE_OF_INVENTORY"],["CAUSE_EVIDENCE_FOR_INVENTORY"]),rationale,scoring_type=SCORING_TYPE,claim_refs=claims,grounding_spans=[{"role":"RATIONALE","text":rationale,"claim_refs":claims}]),
        Item("M-CSSGB-I-B-2-01","F-CSSGB-I-B-2-M1",CRITERION_ID,"MASTERY_CHECK","Independent map: ORDER -> P1 -> Q1 -> P2. ORDER is an information signal to P1; Q1 is a waiting queue. Report the three visible links and the supported conditions QUEUE_INTERRUPTS_FLOW and INFORMATION_FLOW_TO_P1. Do not claim post-improvement performance.",_answer([["ORDER","P1"],["P1","Q1"],["Q1","P2"]],["QUEUE_INTERRUPTS_FLOW","INFORMATION_FLOW_TO_P1"]),rationale,scoring_type=SCORING_TYPE,claim_refs=claims,grounding_spans=[{"role":"RATIONALE","text":rationale,"claim_refs":claims}]),
        Item("R-CSSGB-I-B-2-01","F-CSSGB-I-B-2-R1",CRITERION_ID,"RETENTION_CHECK","Delayed parallel map: P1 -> INV1 -> P2 -> CUSTOMER. INV1 is inventory between P1 and P2. Report all three visible links and INVENTORY_BETWEEN_STEPS without inferring a cause or post-change result.",_answer([["P1","INV1"],["INV1","P2"],["P2","CUSTOMER"]],["INVENTORY_BETWEEN_STEPS"]),rationale,scoring_type=SCORING_TYPE,claim_refs=claims,grounding_spans=[{"role":"RATIONALE","text":rationale,"claim_refs":claims}])
    ]
    # This portable slice isolates I.B.2 scoring behavior. The immutable full-course blueprint, not this local fixture,
    # is authoritative for the admitted I.B.1 -> I.B.2 hard prerequisite.
    return Course(course_id=f"COURSE-{goal_id}",version=1,goal_id=goal_id,title=title,desired_outcome=desired_outcome,skills=[Skill(SKILL_ID,"Interpret a bounded value-stream map",[CRITERION_ID],[])],criteria=[Criterion(CRITERION_ID,SKILL_ID,OUTCOME)],lessons=[lesson],items=items,source_ids=[s["source_id"] for s in dossier["sources"]],research_dossier_id=dossier["dossier_id"],generation_adapter="CSSGB-001E-I-B-2-GROUNDED-CONTENT-V1")
