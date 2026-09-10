from __future__ import annotations

import copy
import json
from typing import Any, Dict, List, Optional

from .models import Course, Criterion, Item, Lesson, Skill


CSSGB_001E_BATCH_02_DOMAIN_KEY = "asq-cssgb-2022-001e-i-a-2"
CSSGB_001E_BATCH_02_REQUIREMENT_ID = "ASQ-CSSGB-2022-I.A.2"
CSSGB_001E_BATCH_02_SKILL_ID = "CSSGB-2022::ASQ-CSSGB-2022-I.A.2::SUBSKILL::goal-project-alignment"
CSSGB_001E_BATCH_02_CRITERION_ID = "CRIT::CSSGB-2022::ASQ-CSSGB-2022-I.A.2::SUBSKILL::goal-project-alignment"
CSSGB_001E_BATCH_02_LESSON_ID = "LESSON::CSSGB-2022::ASQ-CSSGB-2022-I.A.2::SUBSKILL::goal-project-alignment"
CSSGB_001E_BATCH_02_ASSESSMENT_TARGET_ID = "ASSESS::CSSGB-2022::ASQ-CSSGB-2022-I.A.2::goal-project-alignment::TARGET::bounded-alignment-explanation"
CSSGB_001E_BATCH_02_OUTCOME = (
    "Given an organizational goal and a candidate Six Sigma project outcome, determine whether the project supports "
    "the goal and state the evidence or metric linkage needed to justify the alignment."
)
CSSGB_ALIGNMENT_SCORING_TYPE = "CSSGB_I_A_2_GOAL_PROJECT_ALIGNMENT_V1"


I_A_2_SOURCE_DOSSIER: Dict[str, Any] = {
    "dossier_id": "RSCH-CSSGB-2022-I-A-2-001",
    "retrieved_date": "2026-09-10",
    "domain_key": CSSGB_001E_BATCH_02_DOMAIN_KEY,
    "source_policy": "FROZEN_STANDARD_IDENTITY_PLUS_ASQ_SUPPLEMENTAL_INSTRUCTIONAL_GROUNDING",
    "frozen_requirement_identity": {
        "requirement_id": CSSGB_001E_BATCH_02_REQUIREMENT_ID,
        "source_locator": "ASQ CSSGB BoK 2022 p.3 / I.A.2",
        "title": "Organizational goals and Six Sigma projects",
        "highest_cognitive_level": "UNDERSTAND",
        "supplemental_sources_replace_frozen_identity": False,
    },
    "sources": [
        {
            "source_id": "SRC-ASQ-PROJECTS-THAT-MATTER",
            "title": "Selecting Six Sigma Projects That Matter",
            "url": "https://asq.org/quality-resources/articles/selecting-six-sigma-projects-that-matter?id=b373ac1802974020b74bca61c334cff7",
            "authority": "AMERICAN_SOCIETY_FOR_QUALITY",
            "standing": "ADMITTED",
            "retrieved_date": "2026-09-10",
            "source_bytes_archived": False,
        },
        {
            "source_id": "SRC-ASQ-PICK-YOUR-SPOTS",
            "title": "Pick Your Spots",
            "url": "https://asq.org/quality-progress/articles/pick-your-spots?id=243f1185b24c428cb317daf1acc6568c",
            "authority": "AMERICAN_SOCIETY_FOR_QUALITY",
            "standing": "ADMITTED",
            "retrieved_date": "2026-09-10",
            "source_bytes_archived": False,
        },
        {
            "source_id": "SRC-ASQ-PERFORMANCE-METRICS",
            "title": "Selecting Performance Measures & Metrics",
            "url": "https://asq.org/quality-resources/metrics/selecting-metrics-tutorial",
            "authority": "AMERICAN_SOCIETY_FOR_QUALITY",
            "standing": "ADMITTED",
            "retrieved_date": "2026-09-10",
            "source_bytes_archived": False,
        },
        {
            "source_id": "SRC-ASQ-DMAIC",
            "title": "DMAIC Process: Define, Measure, Analyze, Improve, Control",
            "url": "https://asq.org/quality-resources/dmaic",
            "authority": "AMERICAN_SOCIETY_FOR_QUALITY",
            "standing": "ADMITTED",
            "retrieved_date": "2026-09-10",
            "source_bytes_archived": False,
        },
    ],
    "claims": [
        {
            "claim_id": "CL-CSSGB-I-A-2-001",
            "source_id": "SRC-ASQ-PROJECTS-THAT-MATTER",
            "text": "ASQ project-selection guidance describes a strategic selection approach that links Six Sigma projects to critical business issues and organizational goals rather than choosing projects only because they are available.",
            "kind": "PARAPHRASED_SOURCE_CLAIM",
        },
        {
            "claim_id": "CL-CSSGB-I-A-2-002",
            "source_id": "SRC-ASQ-PICK-YOUR-SPOTS",
            "text": "An ASQ case description emphasizes validating candidate projects against company goals, strategies, and key metrics before prioritizing them.",
            "kind": "PARAPHRASED_CASE_CLAIM",
        },
        {
            "claim_id": "CL-CSSGB-I-A-2-003",
            "source_id": "SRC-ASQ-PERFORMANCE-METRICS",
            "text": "ASQ describes performance metrics as organization- and project-specific information used to characterize and assess performance, making metric selection part of evidence-based improvement reasoning.",
            "kind": "PARAPHRASED_SOURCE_CLAIM",
        },
        {
            "claim_id": "CL-CSSGB-I-A-2-004",
            "source_id": "SRC-ASQ-DMAIC",
            "text": "ASQ's DMAIC overview places problem and project goals, metrics, scope, and direction in the Define-phase foundation, reinforcing that project intent and measurement should be explicitly connected.",
            "kind": "PARAPHRASED_SOURCE_CLAIM",
        },
    ],
    "limitations": [
        "SUPPLEMENTAL_WEB_SOURCES_DO_NOT_REPLACE_THE_FROZEN_2022_STANDARD_IDENTITY",
        "SOURCE_BYTES_NOT_ARCHIVED_IN_THIS_PORTABLE_BATCH",
        "STRATEGIC_ALIGNMENT_IN_A_SYNTHETIC_SCENARIO_IS_NOT_EVIDENCE_OF_REAL_PROJECT_SUCCESS",
        "NO_REAL_LEARNER_OR_PSYCHOMETRIC_EVIDENCE_IS CREATED_BY_THIS_DOSSIER",
    ],
}


def i_a_2_dossier() -> Dict[str, Any]:
    return copy.deepcopy(I_A_2_SOURCE_DOSSIER)


def _response(*, alignment: str, goal_id: str, outcome_id: str, metric_ids: List[str], missing_evidence: Optional[List[str]] = None) -> str:
    return json.dumps(
        {
            "alignment": alignment,
            "goal_id": goal_id,
            "outcome_id": outcome_id,
            "metric_ids": metric_ids,
            "missing_evidence": missing_evidence or [],
        },
        sort_keys=True,
        separators=(",", ":"),
    )


I_A_2_ORACLE_SPECS: Dict[str, Dict[str, Any]] = {
    "P-CSSGB-I-A-2-01": {
        "goal_id": "G1",
        "outcome_id": "O1",
        "alignment": "ALIGNED",
        "goal_metric_ids": {"M1"},
        "outcome_metric_ids": {"M2"},
        "allowed_metric_ids": {"M1", "M2"},
        "required_missing_evidence": set(),
        "allowed_missing_evidence": set(),
    },
    "P-CSSGB-I-A-2-02": {
        "goal_id": "G1",
        "outcome_id": "O1",
        "alignment": "NOT_ESTABLISHED",
        "goal_metric_ids": set(),
        "outcome_metric_ids": set(),
        "allowed_metric_ids": {"M1", "M2"},
        "required_missing_evidence": {"OUTCOME_TO_GOAL_LINKAGE"},
        "allowed_missing_evidence": {"OUTCOME_TO_GOAL_LINKAGE"},
    },
    "M-CSSGB-I-A-2-01": {
        "goal_id": "G1",
        "outcome_id": "O1",
        "alignment": "ALIGNED",
        "goal_metric_ids": {"M1"},
        "outcome_metric_ids": {"M2"},
        "allowed_metric_ids": {"M1", "M2"},
        "required_missing_evidence": set(),
        "allowed_missing_evidence": set(),
    },
    "R-CSSGB-I-A-2-01": {
        "goal_id": "G1",
        "outcome_id": "O1",
        "alignment": "ALIGNED",
        "goal_metric_ids": {"M1"},
        "outcome_metric_ids": {"M2"},
        "allowed_metric_ids": {"M1", "M2"},
        "required_missing_evidence": set(),
        "allowed_missing_evidence": set(),
    },
}


class CSSGBGoalProjectAlignmentOracle:
    """Independent structured oracle for the I.A.2 goal/project/metric linkage target."""

    scoring_type = CSSGB_ALIGNMENT_SCORING_TYPE

    @staticmethod
    def _parse(response: str) -> Optional[Dict[str, Any]]:
        try:
            value = json.loads(response)
        except Exception:
            return None
        if not isinstance(value, dict) or set(value) != {"alignment", "goal_id", "outcome_id", "metric_ids", "missing_evidence"}:
            return None
        if value["alignment"] not in {"ALIGNED", "NOT_ALIGNED", "NOT_ESTABLISHED"}:
            return None
        if not isinstance(value["goal_id"], str) or not isinstance(value["outcome_id"], str):
            return None
        if not isinstance(value["metric_ids"], list) or not isinstance(value["missing_evidence"], list):
            return None
        return value

    def score(self, item: Dict[str, Any], response: str) -> bool:
        spec = I_A_2_ORACLE_SPECS.get(item.get("item_id"))
        if not spec or item.get("scoring_type") != self.scoring_type:
            return False
        value = self._parse(response)
        if value is None:
            return False
        if value["goal_id"] != spec["goal_id"] or value["outcome_id"] != spec["outcome_id"]:
            return False
        if value["alignment"] != spec["alignment"]:
            return False
        metric_ids = value["metric_ids"]
        missing = value["missing_evidence"]
        if any(not isinstance(x, str) for x in metric_ids + missing):
            return False
        if len(metric_ids) != len(set(metric_ids)) or len(missing) != len(set(missing)):
            return False
        metric_set = set(metric_ids)
        missing_set = set(missing)
        if not metric_set.issubset(spec["allowed_metric_ids"]):
            return False
        if not missing_set.issubset(spec["allowed_missing_evidence"]):
            return False
        if not spec["required_missing_evidence"].issubset(missing_set):
            return False
        if spec["alignment"] == "ALIGNED":
            if not (metric_set & spec["goal_metric_ids"]):
                return False
            if not (metric_set & spec["outcome_metric_ids"]):
                return False
        if spec["alignment"] == "NOT_ESTABLISHED" and metric_set:
            return False
        return True

    def validate_reference_items(self, course: Dict[str, Any]) -> Dict[str, Any]:
        checked = []
        for item in course.get("items", []):
            if item.get("scoring_type") != self.scoring_type:
                continue
            checked.append({"item_id": item["item_id"], "pass": self.score(item, item.get("answer", ""))})
        return {
            "status": "PASS" if checked and all(x["pass"] for x in checked) else "FAIL",
            "checked": checked,
            "answer_key_used_as_oracle": False,
        }

    def validate_lesson_examples(self, course: Dict[str, Any]) -> Dict[str, Any]:
        lesson = next((x for x in course.get("lessons", []) if x.get("lesson_id") == CSSGB_001E_BATCH_02_LESSON_ID), None)
        failures: List[str] = []
        examples = list(lesson.get("worked_examples", [])) if lesson else []
        required_tokens = [
            ["organizational goal", "project outcome", "goal metric", "outcome metric", "alignment"],
            ["not established", "missing", "linkage", "metric", "goal"],
        ]
        if len(examples) != 2:
            failures.append("WORKED_EXAMPLE_COUNT")
        else:
            for idx, tokens in enumerate(required_tokens):
                text = examples[idx].lower()
                for token in tokens:
                    if token.lower() not in text:
                        failures.append(f"EXAMPLE_{idx + 1}_TOKEN_MISSING:{token}")
        return {
            "status": "PASS" if not failures else "FAIL",
            "checked": len(examples),
            "failures": failures,
            "behavior_expectation_owned_by_oracle": True,
        }


def build_i_a_2_slice_course(*, goal_id: str, title: str, desired_outcome: str, dossier: Dict[str, Any]) -> Course:
    if dossier.get("dossier_id") != I_A_2_SOURCE_DOSSIER["dossier_id"]:
        raise ValueError("CSSGB_I_A_2_DOSSIER_MISMATCH")
    if dossier.get("domain_key") != CSSGB_001E_BATCH_02_DOMAIN_KEY:
        raise ValueError("CSSGB_I_A_2_DOMAIN_MISMATCH")
    if desired_outcome.strip() != CSSGB_001E_BATCH_02_OUTCOME:
        raise ValueError("CSSGB_I_A_2_OUTCOME_MISMATCH")

    criterion = Criterion(CSSGB_001E_BATCH_02_CRITERION_ID, CSSGB_001E_BATCH_02_SKILL_ID, CSSGB_001E_BATCH_02_OUTCOME)
    skill = Skill(CSSGB_001E_BATCH_02_SKILL_ID, "Evaluate goal-to-project alignment", [CSSGB_001E_BATCH_02_CRITERION_ID], [])

    explanation = (
        "A Six Sigma project is strategically aligned only when its intended process outcome can be traced to a stated organizational goal using relevant evidence. "
        "Start with the goal, then identify the project outcome the team intends to change. Next select measures that observe the organizational result and the project/process outcome. "
        "An alignment claim should be supported by that explicit chain rather than by generic statements that Six Sigma is valuable. If the project outcome and organizational goal are merely adjacent topics and the scenario supplies no evidence linking them, alignment is not established even if both have metrics. "
        "Metrics provide evidence for the relationship; they do not by themselves prove that the project has succeeded."
    )
    examples = [
        "Example 1 — An organizational goal is to reduce late customer deliveries. A project outcome is to reduce dispatch scheduling variation. A goal metric can be late-delivery rate and an outcome metric can be dispatch schedule variance. Because the project outcome can be monitored in a way that connects to the stated organizational goal, the alignment can be justified prospectively without claiming project success.",
        "Example 2 — An organizational goal is to improve customer retention, while a project outcome is only to shorten preparation time for an internal report. A retention metric and a report-cycle metric may both exist, but that does not establish the missing outcome-to-goal linkage. The correct conclusion is not established, and the missing linkage evidence should be named rather than assuming strategic alignment."
    ]
    claims = ["CL-CSSGB-I-A-2-001", "CL-CSSGB-I-A-2-002", "CL-CSSGB-I-A-2-003", "CL-CSSGB-I-A-2-004"]
    lesson = Lesson(
        CSSGB_001E_BATCH_02_LESSON_ID,
        "Organizational goals and Six Sigma projects: justify project alignment",
        CSSGB_001E_BATCH_02_SKILL_ID,
        [CSSGB_001E_BATCH_02_CRITERION_ID],
        CSSGB_001E_BATCH_02_OUTCOME,
        explanation,
        examples,
        ["P-CSSGB-I-A-2-01", "P-CSSGB-I-A-2-02"],
        claim_refs=claims,
        grounding_spans=[
            {"role": "EXPLANATION", "text": explanation, "claim_refs": claims},
            {"role": "WORKED_EXAMPLE", "text": examples[0], "claim_refs": claims},
            {"role": "WORKED_EXAMPLE", "text": examples[1], "claim_refs": claims},
        ],
    )

    rationale_aligned = "A justified alignment response identifies the supplied organizational goal and project outcome and binds each to relevant supplied measures; the measures support the linkage but do not prove realized success."
    rationale_unestablished = "When the supplied project outcome is not connected to the organizational goal by scenario evidence, the response must state NOT_ESTABLISHED and identify the missing outcome-to-goal linkage rather than infer alignment."

    items = [
        Item(
            "P-CSSGB-I-A-2-01", "F-CSSGB-I-A-2-P1", CSSGB_001E_BATCH_02_CRITERION_ID, "PRACTICE",
            "Scenario: G1=reduce order-to-ship time by 20% while maintaining accuracy. O1=reduce queue time in order approval. Metrics: M1=median order-to-ship hours; M2=median approval queue hours; M3=website visits. Return JSON with alignment, goal_id, outcome_id, metric_ids, and missing_evidence.",
            _response(alignment="ALIGNED", goal_id="G1", outcome_id="O1", metric_ids=["M1", "M2"]),
            rationale_aligned,
            scoring_type=CSSGB_ALIGNMENT_SCORING_TYPE,
            claim_refs=claims,
            grounding_spans=[{"role": "RATIONALE", "text": rationale_aligned, "claim_refs": claims}],
        ),
        Item(
            "P-CSSGB-I-A-2-02", "F-CSSGB-I-A-2-P2", CSSGB_001E_BATCH_02_CRITERION_ID, "PRACTICE",
            "Scenario: G1=increase customer retention. O1=reduce preparation time for an internal operations report. Metrics: M1=monthly customer retention rate; M2=report preparation minutes. No evidence connects report preparation time to retention. Return JSON with alignment, goal_id, outcome_id, metric_ids, and missing_evidence.",
            _response(alignment="NOT_ESTABLISHED", goal_id="G1", outcome_id="O1", metric_ids=[], missing_evidence=["OUTCOME_TO_GOAL_LINKAGE"]),
            rationale_unestablished,
            scoring_type=CSSGB_ALIGNMENT_SCORING_TYPE,
            claim_refs=claims,
            grounding_spans=[{"role": "RATIONALE", "text": rationale_unestablished, "claim_refs": claims}],
        ),
        Item(
            "M-CSSGB-I-A-2-01", "F-CSSGB-I-A-2-M1", CSSGB_001E_BATCH_02_CRITERION_ID, "MASTERY_CHECK",
            "Independent scenario: G1=reduce warranty claims by 15% over 12 months. O1=reduce defect escape rate from final inspection. Metrics: M1=warranty claims per 1,000 shipped units; M2=defect escapes per 1,000 inspected units; M3=training hours completed. Return JSON with the evidence-bounded alignment conclusion and supporting metric IDs.",
            _response(alignment="ALIGNED", goal_id="G1", outcome_id="O1", metric_ids=["M1", "M2"]),
            rationale_aligned,
            scoring_type=CSSGB_ALIGNMENT_SCORING_TYPE,
            claim_refs=claims,
            grounding_spans=[{"role": "RATIONALE", "text": rationale_aligned, "claim_refs": claims}],
        ),
        Item(
            "R-CSSGB-I-A-2-01", "F-CSSGB-I-A-2-R1", CSSGB_001E_BATCH_02_CRITERION_ID, "RETENTION_CHECK",
            "Delayed parallel scenario: G1=reduce late deliveries to customers. O1=reduce dispatch scheduling variance. Metrics: M1=late-delivery rate; M2=dispatch schedule variance; M3=social-media impressions. Return JSON with the evidence-bounded alignment conclusion and supporting metric IDs.",
            _response(alignment="ALIGNED", goal_id="G1", outcome_id="O1", metric_ids=["M1", "M2"]),
            rationale_aligned,
            scoring_type=CSSGB_ALIGNMENT_SCORING_TYPE,
            claim_refs=claims,
            grounding_spans=[{"role": "RATIONALE", "text": rationale_aligned, "claim_refs": claims}],
        ),
    ]

    return Course(
        course_id=f"COURSE-{goal_id}",
        version=1,
        goal_id=goal_id,
        title=title,
        desired_outcome=desired_outcome,
        skills=[skill],
        criteria=[criterion],
        lessons=[lesson],
        items=items,
        source_ids=[x["source_id"] for x in dossier["sources"]],
        research_dossier_id=dossier["dossier_id"],
        generation_adapter="CSSGB-001E-I-A-2-GROUNDED-CONTENT-V1",
    )
