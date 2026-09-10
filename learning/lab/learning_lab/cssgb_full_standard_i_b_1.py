from __future__ import annotations

import copy
import json
from typing import Any, Dict, List, Optional

from .models import Course, Criterion, Item, Lesson, Skill

DOMAIN_KEY = "asq-cssgb-2022-001e-i-b-1"
REQUIREMENT_ID = "ASQ-CSSGB-2022-I.B.1"
SKILL_ID = "CSSGB-2022::ASQ-CSSGB-2022-I.B.1::SUBSKILL::lean-value-flow-waste"
CRITERION_ID = "CRIT::CSSGB-2022::ASQ-CSSGB-2022-I.B.1::SUBSKILL::lean-value-flow-waste"
LESSON_ID = "LESSON::CSSGB-2022::ASQ-CSSGB-2022-I.B.1::SUBSKILL::lean-value-flow-waste"
ASSESSMENT_TARGET_ID = "ASSESS::CSSGB-2022::ASQ-CSSGB-2022-I.B.1::lean-value-flow-waste::TARGET::bounded-lean-application"
OUTCOME = "Given a bounded process description, identify value-creating versus non-value-creating activity and explain how flow or waste concepts affect improvement reasoning."
SCORING_TYPE = "CSSGB_I_B_1_LEAN_VALUE_FLOW_WASTE_V1"

DOSSIER: Dict[str, Any] = {
    "dossier_id": "RSCH-CSSGB-2022-I-B-1-001",
    "retrieved_date": "2026-09-10",
    "domain_key": DOMAIN_KEY,
    "frozen_requirement_identity": {
        "requirement_id": REQUIREMENT_ID,
        "source_locator": "ASQ CSSGB BoK 2022 p.3 / I.B.1",
        "title": "Lean concepts",
        "highest_cognitive_level": "APPLY",
        "supplemental_sources_replace_frozen_identity": False,
    },
    "sources": [
        {"source_id":"SRC-ASQ-LEAN","title":"What is Lean? Lean Manufacturing & Lean Enterprise","url":"https://asq.org/quality-resources/lean","authority":"AMERICAN_SOCIETY_FOR_QUALITY","standing":"ADMITTED","retrieved_date":"2026-09-10","source_bytes_archived":False},
        {"source_id":"SRC-ASQ-VSM","title":"Value Stream Mapping Tutorial - What is VSM?","url":"https://asq.org/quality-resources/value-stream-mapping","authority":"AMERICAN_SOCIETY_FOR_QUALITY","standing":"ADMITTED","retrieved_date":"2026-09-10","source_bytes_archived":False},
        {"source_id":"SRC-ASQ-SIX-SIGMA-TOOLS","title":"Six Sigma Tools: DMAIC, Lean & Other Techniques","url":"https://asq.org/quality-resources/sixsigma/tools","authority":"AMERICAN_SOCIETY_FOR_QUALITY","standing":"ADMITTED","retrieved_date":"2026-09-10","source_bytes_archived":False},
    ],
    "claims": [
        {"claim_id":"CL-CSSGB-I-B-1-001","source_id":"SRC-ASQ-LEAN","text":"ASQ defines Lean around improving efficiency and effectiveness by reducing or eliminating non-value-adding activity and waste.","kind":"PARAPHRASED_SOURCE_CLAIM"},
        {"claim_id":"CL-CSSGB-I-B-1-002","source_id":"SRC-ASQ-VSM","text":"ASQ explains that Lean value is defined from the end customer's need; value-added work contributes directly to meeting that need while unnecessary time, effort, or material is waste.","kind":"PARAPHRASED_SOURCE_CLAIM"},
        {"claim_id":"CL-CSSGB-I-B-1-003","source_id":"SRC-ASQ-SIX-SIGMA-TOOLS","text":"ASQ describes Lean flow as progressive movement through the value stream without stoppages, scrap, or backflows and identifies waiting, defects, transport, inventory, motion, overproduction, and over-processing among Lean wastes.","kind":"PARAPHRASED_SOURCE_CLAIM"},
        {"claim_id":"CL-CSSGB-I-B-1-004","source_id":"SRC-ASQ-LEAN","text":"Identifying waste supports prospective improvement reasoning, but classification of a condition as waste does not itself prove that a proposed change has improved performance.","kind":"EVIDENCE_BOUNDARY_INSTRUCTIONAL_INFERENCE"},
    ],
    "limitations": [
        "SUPPLEMENTAL_SOURCES_DO_NOT_REPLACE_FROZEN_2022_IDENTITY",
        "SOURCE_BYTES_NOT_ARCHIVED_IN_THIS_PORTABLE_BATCH",
        "LEAN_CLASSIFICATION_IS_LIMITED_TO_EXPLICIT_SYNTHETIC_PROCESS_FACTS_AND_STATED_CUSTOMER_NEED",
        "NO_REAL_LEARNER_OR_PSYCHOMETRIC_EVIDENCE_CREATED",
    ],
}


def dossier() -> Dict[str, Any]:
    return copy.deepcopy(DOSSIER)


def _answer(value_added: List[str], non_value_added: List[str], waste: List[str], flow: List[str], improvement: Optional[str], unresolved: Optional[List[str]] = None, missing: Optional[List[str]] = None) -> str:
    return json.dumps({
        "value_added_activity_ids": value_added,
        "non_value_added_activity_ids": non_value_added,
        "waste_condition_ids": waste,
        "flow_problem_ids": flow,
        "improvement_action_id": improvement,
        "unresolved_activity_ids": unresolved or [],
        "missing_evidence": missing or [],
        "observed_improvement_claimed": False,
    }, sort_keys=True, separators=(",", ":"))


SPECS = {
    "P-CSSGB-I-B-1-01": {"va":{"A1"},"nva":{"A2","A3"},"waste":{"W1","W2"},"flow":{"F1"},"improvement":"REDUCE_APPROVAL_QUEUE","unresolved":set(),"missing":set()},
    "P-CSSGB-I-B-1-02": {"va":{"A1"},"nva":{"A2"},"waste":{"W1"},"flow":{"F1"},"improvement":"REDUCE_WAIT_BEFORE_HANDOFF","unresolved":{"A3"},"missing":{"A3_PURPOSE_RELATION_TO_CUSTOMER_NEED"}},
    "M-CSSGB-I-B-1-01": {"va":{"A1"},"nva":{"A2","A3"},"waste":{"W1","W2"},"flow":{"F1"},"improvement":"REMOVE_DUPLICATE_ENTRY_AND_QUEUE","unresolved":set(),"missing":set()},
    "R-CSSGB-I-B-1-01": {"va":{"A1"},"nva":{"A2","A3"},"waste":{"W1","W2"},"flow":{"F1"},"improvement":"REDUCE_REWORK_AND_WAIT","unresolved":set(),"missing":set()},
}


class CSSGBLeanValueFlowWasteOracle:
    scoring_type = SCORING_TYPE
    keys = {"value_added_activity_ids","non_value_added_activity_ids","waste_condition_ids","flow_problem_ids","improvement_action_id","unresolved_activity_ids","missing_evidence","observed_improvement_claimed"}

    @classmethod
    def _parse(cls, response: str) -> Optional[Dict[str, Any]]:
        try: value = json.loads(response)
        except Exception: return None
        if not isinstance(value, dict) or set(value) != cls.keys: return None
        for key in ("value_added_activity_ids","non_value_added_activity_ids","waste_condition_ids","flow_problem_ids","unresolved_activity_ids","missing_evidence"):
            if not isinstance(value[key], list) or any(not isinstance(x, str) for x in value[key]) or len(value[key]) != len(set(value[key])): return None
        if value["improvement_action_id"] is not None and not isinstance(value["improvement_action_id"], str): return None
        if value["observed_improvement_claimed"] is not False: return None
        return value

    def score(self, item: Dict[str, Any], response: str) -> bool:
        spec = SPECS.get(item.get("item_id"))
        if not spec or item.get("scoring_type") != self.scoring_type: return False
        value = self._parse(response)
        if value is None: return False
        fields = (("value_added_activity_ids","va"),("non_value_added_activity_ids","nva"),("waste_condition_ids","waste"),("flow_problem_ids","flow"),("unresolved_activity_ids","unresolved"),("missing_evidence","missing"))
        if any(set(value[out_key]) != spec[spec_key] for out_key, spec_key in fields): return False
        if value["improvement_action_id"] != spec["improvement"]: return False
        if set(value["value_added_activity_ids"]) & set(value["non_value_added_activity_ids"]): return False
        if set(value["unresolved_activity_ids"]) & (set(value["value_added_activity_ids"]) | set(value["non_value_added_activity_ids"])): return False
        return True

    def validate_reference_items(self, course: Dict[str, Any]) -> Dict[str, Any]:
        checked = [{"item_id":i["item_id"],"pass":self.score(i,i.get("answer",""))} for i in course.get("items",[]) if i.get("scoring_type")==self.scoring_type]
        return {"status":"PASS" if checked and all(x["pass"] for x in checked) else "FAIL","checked":checked,"answer_key_used_as_oracle":False}

    def validate_lesson_examples(self, course: Dict[str, Any]) -> Dict[str, Any]:
        lesson = next((x for x in course.get("lessons",[]) if x.get("lesson_id")==LESSON_ID), None)
        examples = list(lesson.get("worked_examples",[])) if lesson else []
        joined = "\n".join(examples).lower()
        required = ["customer need","value-added","waiting","flow","prospective","missing evidence"]
        failures = [f"TOKEN_MISSING:{x}" for x in required if x not in joined]
        if len(examples) < 2: failures.append("WORKED_EXAMPLE_COUNT")
        return {"status":"PASS" if not failures else "FAIL","checked":len(examples),"failures":failures,"behavior_expectation_owned_by_oracle":True}


def build_course(*, goal_id: str, title: str, desired_outcome: str, dossier: Dict[str, Any]) -> Course:
    if dossier.get("dossier_id") != DOSSIER["dossier_id"] or dossier.get("domain_key") != DOMAIN_KEY: raise ValueError("CSSGB_I_B_1_DOSSIER_MISMATCH")
    if desired_outcome.strip() != OUTCOME: raise ValueError("CSSGB_I_B_1_OUTCOME_MISMATCH")
    claims = [f"CL-CSSGB-I-B-1-{i:03d}" for i in range(1,5)]
    explanation = ("Apply Lean from the stated customer need outward. Classify an activity as value-added only when the supplied process facts show that it directly contributes to the customer-required product or service. Waiting, correction or rework, unnecessary movement, and other non-value-adding conditions are waste when the scenario establishes them. A flow problem is a stoppage, queue, backflow, or similar interruption in progressive movement through the value stream. Improvement reasoning should target the evidence-supported waste or flow condition prospectively; never report an improvement as observed unless post-change evidence is supplied. If an activity's purpose or relationship to customer need is not supplied, leave that classification unresolved and identify the missing evidence rather than guess.")
    examples = [
        "Example 1 — Customer need: receive the correct configured order. A1 assembles the requested configuration and is value-added. A2 waits two days in an approval queue and A3 repeats data entry after an error; those are non-value-added conditions. The waiting creates a flow interruption. A prospective improvement can target the approval queue, but no post-change improvement is claimed.",
        "Example 2 — Customer need: an accurate service record. A1 records the required service result, A2 waits for a handoff, and A3 transfers the record to another system for an unstated purpose. A1 is value-added and the waiting is non-value-added with a flow problem. A3 must remain unresolved because missing evidence prevents tying its purpose to the customer need; do not invent a classification.",
    ]
    lesson = Lesson(LESSON_ID,"Lean concepts: apply value, flow, and waste to bounded process evidence",SKILL_ID,[CRITERION_ID],OUTCOME,explanation,examples,["P-CSSGB-I-B-1-01","P-CSSGB-I-B-1-02"],claim_refs=claims,grounding_spans=[{"role":"EXPLANATION","text":explanation,"claim_refs":claims},{"role":"WORKED_EXAMPLE","text":examples[0],"claim_refs":claims},{"role":"WORKED_EXAMPLE","text":examples[1],"claim_refs":claims}])
    rationale = "The classifications follow the stated customer need and explicit process facts; the improvement implication remains prospective and does not assert an observed post-change result."
    rationale_missing = "The supplied facts support some classifications but do not establish A3's relationship to customer need, so A3 remains unresolved and the missing evidence is named."
    items = [
        Item("P-CSSGB-I-B-1-01","F-CSSGB-I-B-1-P1",CRITERION_ID,"PRACTICE","Customer need: receive the correct configured order. A1=assemble requested configuration; A2=wait two days for internal approval; A3=re-enter order data after a typing error. W1=waiting at approval; W2=correction/rework after error; F1=queue stops order flow. Choose a prospective improvement from REDUCE_APPROVAL_QUEUE or ADD_MORE_WAIT. Return the required JSON.",_answer(["A1"],["A2","A3"],["W1","W2"],["F1"],"REDUCE_APPROVAL_QUEUE"),rationale,scoring_type=SCORING_TYPE,claim_refs=claims,grounding_spans=[{"role":"RATIONALE","text":rationale,"claim_refs":claims}]),
        Item("P-CSSGB-I-B-1-02","F-CSSGB-I-B-1-P2",CRITERION_ID,"PRACTICE","Customer need: accurate service record. A1=record required service result; A2=wait in a handoff queue; A3=transfer record to another system, but its purpose is not supplied. W1=handoff waiting; F1=queue interrupts flow. Choose REDUCE_WAIT_BEFORE_HANDOFF and classify only what the evidence supports; identify missing evidence for A3. Return JSON.",_answer(["A1"],["A2"],["W1"],["F1"],"REDUCE_WAIT_BEFORE_HANDOFF",["A3"],["A3_PURPOSE_RELATION_TO_CUSTOMER_NEED"]),rationale_missing,scoring_type=SCORING_TYPE,claim_refs=claims,grounding_spans=[{"role":"RATIONALE","text":rationale_missing,"claim_refs":claims}]),
        Item("M-CSSGB-I-B-1-01","F-CSSGB-I-B-1-M1",CRITERION_ID,"MASTERY_CHECK","Independent scenario. Customer need: receive an accurate invoice promptly. A1=create invoice from confirmed order; A2=enter the same confirmed data a second time into a duplicate system; A3=wait overnight before the duplicate entry can be reviewed. W1=extra-processing/duplicate entry; W2=waiting; F1=overnight queue interrupts flow. Select REMOVE_DUPLICATE_ENTRY_AND_QUEUE prospectively and return JSON without claiming observed improvement.",_answer(["A1"],["A2","A3"],["W1","W2"],["F1"],"REMOVE_DUPLICATE_ENTRY_AND_QUEUE"),rationale,scoring_type=SCORING_TYPE,claim_refs=claims,grounding_spans=[{"role":"RATIONALE","text":rationale,"claim_refs":claims}]),
        Item("R-CSSGB-I-B-1-01","F-CSSGB-I-B-1-R1",CRITERION_ID,"RETENTION_CHECK","Delayed parallel scenario. Customer need: ship the correct item on the promised day. A1=pick the ordered item; A2=correct a mis-keyed shipping label; A3=wait in a staging queue caused by the correction. W1=defect/rework; W2=waiting; F1=staging queue interrupts flow. Select REDUCE_REWORK_AND_WAIT prospectively and return JSON without claiming an observed result.",_answer(["A1"],["A2","A3"],["W1","W2"],["F1"],"REDUCE_REWORK_AND_WAIT"),rationale,scoring_type=SCORING_TYPE,claim_refs=claims,grounding_spans=[{"role":"RATIONALE","text":rationale,"claim_refs":claims}]),
    ]
    return Course(course_id=f"COURSE-{goal_id}",version=1,goal_id=goal_id,title=title,desired_outcome=desired_outcome,skills=[Skill(SKILL_ID,"Classify Lean value, flow, and waste implications",[CRITERION_ID],[])],criteria=[Criterion(CRITERION_ID,SKILL_ID,OUTCOME)],lessons=[lesson],items=items,source_ids=[x["source_id"] for x in dossier["sources"]],research_dossier_id=dossier["dossier_id"],generation_adapter="CSSGB-001E-I-B-1-GROUNDED-CONTENT-V1")
