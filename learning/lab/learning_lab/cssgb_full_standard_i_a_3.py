from __future__ import annotations

import copy
import json
from typing import Any, Dict, List, Optional

from .models import Course, Criterion, Item, Lesson, Skill

DOMAIN_KEY = "asq-cssgb-2022-001e-i-a-3"
REQUIREMENT_ID = "ASQ-CSSGB-2022-I.A.3"
SKILL_ID = "CSSGB-2022::ASQ-CSSGB-2022-I.A.3::SUBSKILL::driver-metric-linkage"
CRITERION_ID = "CRIT::CSSGB-2022::ASQ-CSSGB-2022-I.A.3::SUBSKILL::driver-metric-linkage"
LESSON_ID = "LESSON::CSSGB-2022::ASQ-CSSGB-2022-I.A.3::SUBSKILL::driver-metric-linkage"
ASSESSMENT_TARGET_ID = "ASSESS::CSSGB-2022::ASQ-CSSGB-2022-I.A.3::driver-metric-linkage::TARGET::bounded-driver-metric-explanation"
OUTCOME = "Given an organizational driver and several candidate measures, identify which measure materially observes progress toward the driver and explain the relationship."
SCORING_TYPE = "CSSGB_I_A_3_DRIVER_METRIC_LINKAGE_V1"

DOSSIER: Dict[str, Any] = {
    "dossier_id": "RSCH-CSSGB-2022-I-A-3-001",
    "retrieved_date": "2026-09-10",
    "domain_key": DOMAIN_KEY,
    "frozen_requirement_identity": {
        "requirement_id": REQUIREMENT_ID,
        "source_locator": "ASQ CSSGB BoK 2022 p.3 / I.A.3",
        "title": "Organizational drivers and metrics",
        "highest_cognitive_level": "UNDERSTAND",
        "supplemental_sources_replace_frozen_identity": False,
    },
    "sources": [
        {"source_id":"SRC-ASQ-CSSGB-2022-I-A-3","title":"ASQ Certified Six Sigma Green Belt Body of Knowledge (2022) - I.A.3","url":"https://asq.org/-/media/Images/gift/H1597-ASQ-Certified-Six-Sigma-Green-Belt-Third-Edition--ebook-sampler.pdf","authority":"AMERICAN_SOCIETY_FOR_QUALITY","standing":"ADMITTED","retrieved_date":"2026-09-10","source_bytes_archived":False},
        {"source_id":"SRC-ASQ-PERFORMANCE-METRICS","title":"What are Performance Metrics?","url":"https://asq.org/quality-resources/metrics","authority":"AMERICAN_SOCIETY_FOR_QUALITY","standing":"ADMITTED","retrieved_date":"2026-09-10","source_bytes_archived":False},
        {"source_id":"SRC-ASQ-SELECTING-METRICS","title":"Selecting Performance Measures & Metrics","url":"https://asq.org/quality-resources/metrics/selecting-metrics-tutorial","authority":"AMERICAN_SOCIETY_FOR_QUALITY","standing":"ADMITTED","retrieved_date":"2026-09-10","source_bytes_archived":False},
    ],
    "claims": [
        {"claim_id":"CL-CSSGB-I-A-3-001","source_id":"SRC-ASQ-CSSGB-2022-I-A-3","text":"The frozen 2022 requirement identifies business drivers such as profit, market share, customer satisfaction, efficiency, product differentiation, and KPIs and requires understanding how metrics and scorecards affect the organization.","kind":"PARAPHRASED_FROZEN_REQUIREMENT_CLAIM"},
        {"claim_id":"CL-CSSGB-I-A-3-002","source_id":"SRC-ASQ-PERFORMANCE-METRICS","text":"ASQ describes performance metrics as figures and data representing organizational actions, capabilities, and quality and notes that organizations should select key measures that help guide and gauge success.","kind":"PARAPHRASED_SOURCE_CLAIM"},
        {"claim_id":"CL-CSSGB-I-A-3-003","source_id":"SRC-ASQ-SELECTING-METRICS","text":"ASQ distinguishes organizational outcome measures from process-level measures and explains that appropriate measures depend on what needs to be observed, including customer-important results and the processes that drive them.","kind":"PARAPHRASED_SOURCE_CLAIM"},
        {"claim_id":"CL-CSSGB-I-A-3-004","source_id":"SRC-ASQ-SELECTING-METRICS","text":"A useful metric must correspond to the performance question being asked; a measure can be valid data yet still be too indirect or irrelevant for the stated driver.","kind":"PARAPHRASED_INSTRUCTIONAL_INFERENCE"},
    ],
    "limitations": [
        "SUPPLEMENTAL_SOURCES_DO_NOT_REPLACE_FROZEN_2022_IDENTITY",
        "SOURCE_BYTES_NOT_ARCHIVED_IN_THIS_PORTABLE_BATCH",
        "METRIC_RELEVANCE_IS_EVALUATED_ONLY_WITHIN_SUPPLIED_SYNTHETIC_SCENARIOS",
        "NO_REAL_LEARNER_OR_PSYCHOMETRIC_EVIDENCE_CREATED",
    ],
}


def dossier() -> Dict[str, Any]:
    return copy.deepcopy(DOSSIER)


def _answer(driver_id: str, selected_metric_id: Optional[str], rejected_metric_ids: List[str], missing_evidence: Optional[List[str]] = None) -> str:
    return json.dumps({"driver_id":driver_id,"selected_metric_id":selected_metric_id,"rejected_metric_ids":rejected_metric_ids,"missing_evidence":missing_evidence or []},sort_keys=True,separators=(",",":"))

SPECS = {
    "P-CSSGB-I-A-3-01": {"driver":"D1","selected":"M2","allowed_rejected":{"M1","M3"},"required_missing":set()},
    "P-CSSGB-I-A-3-02": {"driver":"D1","selected":None,"allowed_rejected":{"M1","M2"},"required_missing":{"DIRECT_DRIVER_MEASURE"}},
    "M-CSSGB-I-A-3-01": {"driver":"D1","selected":"M1","allowed_rejected":{"M2","M3"},"required_missing":set()},
    "R-CSSGB-I-A-3-01": {"driver":"D1","selected":"M2","allowed_rejected":{"M1","M3"},"required_missing":set()},
}


class CSSGBDriverMetricOracle:
    scoring_type = SCORING_TYPE

    @staticmethod
    def _parse(response: str) -> Optional[Dict[str, Any]]:
        try: value=json.loads(response)
        except Exception: return None
        if not isinstance(value,dict) or set(value)!={"driver_id","selected_metric_id","rejected_metric_ids","missing_evidence"}: return None
        if not isinstance(value["driver_id"],str): return None
        if value["selected_metric_id"] is not None and not isinstance(value["selected_metric_id"],str): return None
        if not isinstance(value["rejected_metric_ids"],list) or not isinstance(value["missing_evidence"],list): return None
        return value

    def score(self,item:Dict[str,Any],response:str)->bool:
        spec=SPECS.get(item.get("item_id"))
        if not spec or item.get("scoring_type")!=self.scoring_type: return False
        value=self._parse(response)
        if value is None or value["driver_id"]!=spec["driver"] or value["selected_metric_id"]!=spec["selected"]: return False
        rejected=value["rejected_metric_ids"]; missing=value["missing_evidence"]
        if any(not isinstance(x,str) for x in rejected+missing): return False
        if len(set(rejected))!=len(rejected) or len(set(missing))!=len(missing): return False
        if set(rejected)!=spec["allowed_rejected"]: return False
        if set(missing)!=spec["required_missing"]: return False
        if value["selected_metric_id"] in set(rejected): return False
        return True

    def validate_reference_items(self,course:Dict[str,Any])->Dict[str,Any]:
        checked=[{"item_id":i["item_id"],"pass":self.score(i,i.get("answer",""))} for i in course.get("items",[]) if i.get("scoring_type")==self.scoring_type]
        return {"status":"PASS" if checked and all(x["pass"] for x in checked) else "FAIL","checked":checked,"answer_key_used_as_oracle":False}

    def validate_lesson_examples(self,course:Dict[str,Any])->Dict[str,Any]:
        lesson=next((x for x in course.get("lessons",[]) if x.get("lesson_id")==LESSON_ID),None)
        examples=list(lesson.get("worked_examples",[])) if lesson else []
        failures=[]
        required=[["driver","customer satisfaction","metric","direct"],["no candidate","missing","measure","insufficient"]]
        if len(examples)!=2: failures.append("WORKED_EXAMPLE_COUNT")
        else:
            for idx,tokens in enumerate(required):
                text=examples[idx].lower()
                for token in tokens:
                    if token not in text: failures.append(f"EXAMPLE_{idx+1}_TOKEN_MISSING:{token}")
        return {"status":"PASS" if not failures else "FAIL","checked":len(examples),"failures":failures,"behavior_expectation_owned_by_oracle":True}


def build_course(*,goal_id:str,title:str,desired_outcome:str,dossier:Dict[str,Any])->Course:
    if dossier.get("dossier_id")!=DOSSIER["dossier_id"] or dossier.get("domain_key")!=DOMAIN_KEY: raise ValueError("CSSGB_I_A_3_DOSSIER_MISMATCH")
    if desired_outcome.strip()!=OUTCOME: raise ValueError("CSSGB_I_A_3_OUTCOME_MISMATCH")
    criterion=Criterion(CRITERION_ID,SKILL_ID,OUTCOME)
    skill=Skill(SKILL_ID,"Connect organizational drivers to metrics",[CRITERION_ID],[])
    explanation=("A business driver describes an organizational result or condition that matters; a metric is the observable measure used to track it. The best metric is the one whose defined observation corresponds most directly to the stated driver. A measure may be legitimate yet irrelevant to the particular driver. Process measures can help explain what influences an enterprise result, but they should not be substituted for a direct result measure when the question asks whether the driver itself is improving. If none of the supplied measures observes the driver, the correct response is to say the evidence is insufficient and identify the missing measure.")
    examples=[
        "Example 1 — The driver is customer satisfaction. Candidate metrics include employee training hours, customer satisfaction survey score, and machine uptime. The survey score is the direct metric for the stated driver; the other measures may matter operationally but do not directly observe customer satisfaction.",
        "Example 2 — The driver is market share, but the only candidate measures are internal training hours and machine setup time. No candidate directly observes market share. The correct conclusion is insufficient evidence: name the missing direct market-share measure instead of selecting an unrelated metric.",
    ]
    claims=["CL-CSSGB-I-A-3-001","CL-CSSGB-I-A-3-002","CL-CSSGB-I-A-3-003","CL-CSSGB-I-A-3-004"]
    lesson=Lesson(LESSON_ID,"Organizational drivers and metrics: choose measures that observe the driver",SKILL_ID,[CRITERION_ID],OUTCOME,explanation,examples,["P-CSSGB-I-A-3-01","P-CSSGB-I-A-3-02"],claim_refs=claims,grounding_spans=[{"role":"EXPLANATION","text":explanation,"claim_refs":claims},{"role":"WORKED_EXAMPLE","text":examples[0],"claim_refs":claims},{"role":"WORKED_EXAMPLE","text":examples[1],"claim_refs":claims}])
    rationale_direct="The selected metric directly observes the stated driver as defined in the scenario; the rejected measures observe different conditions and therefore do not answer the same performance question."
    rationale_missing="None of the supplied measures directly observes the stated driver, so selection would invent relevance; the missing direct-driver measure must be identified."
    items=[
        Item("P-CSSGB-I-A-3-01","F-CSSGB-I-A-3-P1",CRITERION_ID,"PRACTICE","Driver D1=customer satisfaction. M1=employee training hours; M2=customer satisfaction survey score; M3=machine uptime. Return JSON selecting the direct metric and rejecting the others.",_answer("D1","M2",["M1","M3"]),rationale_direct,scoring_type=SCORING_TYPE,claim_refs=claims,grounding_spans=[{"role":"RATIONALE","text":rationale_direct,"claim_refs":claims}]),
        Item("P-CSSGB-I-A-3-02","F-CSSGB-I-A-3-P2",CRITERION_ID,"PRACTICE","Driver D1=market share. M1=internal training hours; M2=machine setup minutes. No market-share measure is supplied. Return JSON selecting no metric, rejecting both candidates, and identifying missing direct-driver evidence.",_answer("D1",None,["M1","M2"],["DIRECT_DRIVER_MEASURE"]),rationale_missing,scoring_type=SCORING_TYPE,claim_refs=claims,grounding_spans=[{"role":"RATIONALE","text":rationale_missing,"claim_refs":claims}]),
        Item("M-CSSGB-I-A-3-01","F-CSSGB-I-A-3-M1",CRITERION_ID,"MASTERY_CHECK","Independent scenario: Driver D1=operational efficiency. M1=median order-processing cycle time; M2=social-media impressions; M3=employee badge-completion count. Return JSON selecting the direct metric and rejecting the others.",_answer("D1","M1",["M2","M3"]),rationale_direct,scoring_type=SCORING_TYPE,claim_refs=claims,grounding_spans=[{"role":"RATIONALE","text":rationale_direct,"claim_refs":claims}]),
        Item("R-CSSGB-I-A-3-01","F-CSSGB-I-A-3-R1",CRITERION_ID,"RETENTION_CHECK","Delayed parallel scenario: Driver D1=market share. M1=internal scrap percentage; M2=organization sales as a percentage of total defined market sales; M3=training hours. Return JSON selecting the direct metric and rejecting the others.",_answer("D1","M2",["M1","M3"]),rationale_direct,scoring_type=SCORING_TYPE,claim_refs=claims,grounding_spans=[{"role":"RATIONALE","text":rationale_direct,"claim_refs":claims}]),
    ]
    return Course(course_id=f"COURSE-{goal_id}",version=1,goal_id=goal_id,title=title,desired_outcome=desired_outcome,skills=[skill],criteria=[criterion],lessons=[lesson],items=items,source_ids=[x["source_id"] for x in dossier["sources"]],research_dossier_id=dossier["dossier_id"],generation_adapter="CSSGB-001E-I-A-3-GROUNDED-CONTENT-V1")
