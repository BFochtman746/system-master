from __future__ import annotations

import copy
import json
from typing import Any, Dict, List, Optional

from .models import Course, Criterion, Item, Lesson, Skill

DOMAIN_KEY = "asq-cssgb-2022-001e-i-c-1"
REQUIREMENT_ID = "ASQ-CSSGB-2022-I.C.1"
SKILL_ID = "CSSGB-2022::ASQ-CSSGB-2022-I.C.1::SUBSKILL::dfss-roadmap-recognition"
CRITERION_ID = "CRIT::CSSGB-2022::ASQ-CSSGB-2022-I.C.1::SUBSKILL::dfss-roadmap-recognition"
LESSON_ID = "LESSON::CSSGB-2022::ASQ-CSSGB-2022-I.C.1::SUBSKILL::dfss-roadmap-recognition"
ASSESSMENT_TARGET_ID = "ASSESS::CSSGB-2022::ASQ-CSSGB-2022-I.C.1::dfss-roadmap-recognition::TARGET::bounded-roadmap-explanation"
OUTCOME = "Given a design-oriented improvement scenario, explain what a DfSS road map contributes to sequencing and decision structure without asserting a specific proprietary road map not present in the frozen source evidence."
SCORING_TYPE = "CSSGB_I_C_1_DFSS_ROADMAP_ROLE_V1"

DOSSIER: Dict[str, Any] = {
    "dossier_id": "RSCH-CSSGB-2022-I-C-1-001",
    "retrieved_date": "2026-09-10",
    "domain_key": DOMAIN_KEY,
    "frozen_requirement_identity": {
        "requirement_id": REQUIREMENT_ID,
        "source_locator": "ASQ CSSGB BoK 2022 p.4 / I.C.1",
        "title": "Road maps for DfSS",
        "highest_cognitive_level": "UNDERSTAND",
        "supplemental_sources_replace_frozen_identity": False,
    },
    "sources": [
        {
            "source_id": "SRC-ASQ-DFSS-TRAINING",
            "title": "Design for Six Sigma (DFSS)",
            "url": "https://asq.org/training/design-for-six-sigma--dfss--dfssasq",
            "authority": "AMERICAN_SOCIETY_FOR_QUALITY",
            "standing": "ADMITTED",
            "retrieved_date": "2026-09-10",
            "source_bytes_archived": False,
        },
        {
            "source_id": "SRC-ASQ-CSSGB-HANDBOOK-SAMPLER",
            "title": "The ASQ Certified Six Sigma Green Belt Handbook, Third Edition - eBook sampler",
            "url": "https://asq.org/-/media/Images/gift/H1597-ASQ-Certified-Six-Sigma-Green-Belt-Third-Edition--ebook-sampler.pdf",
            "authority": "AMERICAN_SOCIETY_FOR_QUALITY",
            "standing": "ADMITTED",
            "retrieved_date": "2026-09-10",
            "source_bytes_archived": False,
        },
        {
            "source_id": "SRC-ASQ-DFSS-CASE",
            "title": "Designing New Housing at the University of Miami: A Six Sigma DMADV/DFSS Case Study",
            "url": "https://asq.org/quality-resources/articles/case-studies/designing-new-housing-at-the-university-of-miami-a-six-sigmac-dmadvdfss-case-study?id=5692f87c78b14ebb9ab885aaa4e92c2e",
            "authority": "AMERICAN_SOCIETY_FOR_QUALITY",
            "standing": "ADMITTED",
            "retrieved_date": "2026-09-10",
            "source_bytes_archived": False,
        },
    ],
    "claims": [
        {
            "claim_id": "CL-CSSGB-I-C-1-001",
            "source_id": "SRC-ASQ-DFSS-TRAINING",
            "text": "ASQ explicitly describes DFSS as not being a single road map, but a menu of possible strategies, tactics, and tools.",
            "kind": "PARAPHRASED_SOURCE_CLAIM",
        },
        {
            "claim_id": "CL-CSSGB-I-C-1-002",
            "source_id": "SRC-ASQ-DFSS-TRAINING",
            "text": "ASQ presents DMADV as one DFSS phase structure and associates the phases with tollgate deliverables and appropriate tools, supporting the general idea that a road map structures ordered decisions and gates.",
            "kind": "PARAPHRASED_SOURCE_CLAIM",
        },
        {
            "claim_id": "CL-CSSGB-I-C-1-003",
            "source_id": "SRC-ASQ-CSSGB-HANDBOOK-SAMPLER",
            "text": "The ASQ Green Belt handbook sampler identifies DMADV and IDOV among common DFSS road-map acronyms and describes them as design-phase approaches rather than one universally mandatory sequence.",
            "kind": "PARAPHRASED_SOURCE_CLAIM",
        },
        {
            "claim_id": "CL-CSSGB-I-C-1-004",
            "source_id": "SRC-ASQ-DFSS-CASE",
            "text": "An ASQ-published DFSS case study uses DMADV as a road map for conducting a particular design project, illustrating that a named road map can organize a design effort when that method is actually specified.",
            "kind": "PARAPHRASED_SOURCE_CLAIM",
        },
        {
            "claim_id": "CL-CSSGB-I-C-1-005",
            "source_id": "SRC-ASQ-DFSS-TRAINING",
            "text": "Using a DFSS road map provides sequencing and decision structure; it does not by itself constitute observed evidence that the resulting design succeeded, and a specific proprietary step must not be inferred when the governing method is not supplied.",
            "kind": "EVIDENCE_BOUNDARY_INSTRUCTIONAL_INFERENCE",
        },
    ],
    "limitations": [
        "SUPPLEMENTAL_SOURCES_DO_NOT_REPLACE_FROZEN_2022_IDENTITY",
        "SOURCE_BYTES_NOT_ARCHIVED_IN_THIS_PORTABLE_BATCH",
        "NO_SINGLE_PROPRIETARY_DFSS_ROADMAP_IS_INFERRED_FROM_GENERIC_SCENARIO_DEPENDENCIES",
        "PORTABLE_FIXTURE_MASTERY_IS_MACHINE_QUALIFICATION_ONLY",
        "NO_REAL_LEARNER_OR_PSYCHOMETRIC_EVIDENCE_CREATED",
    ],
}


def dossier() -> Dict[str, Any]:
    return copy.deepcopy(DOSSIER)


def _answer(
    ordered: List[str],
    links: List[List[str]],
    roles: List[str],
    unsupported: Optional[List[str]] = None,
    missing: Optional[List[str]] = None,
) -> str:
    return json.dumps(
        {
            "ordered_decision_ids": ordered,
            "dependency_links": [{"before_id": a, "after_id": b} for a, b in links],
            "roadmap_role_ids": roles,
            "unsupported_specific_step_ids": unsupported or [],
            "missing_authority": missing or [],
            "proprietary_roadmap_claimed": False,
            "observed_design_success_claimed": False,
        },
        sort_keys=True,
        separators=(",", ":"),
    )


SPECS: Dict[str, Dict[str, Any]] = {
    "P-CSSGB-I-C-1-01": {
        "ordered": ["REQ", "CONCEPT", "VERIFY"],
        "links": {("REQ", "CONCEPT"), ("CONCEPT", "VERIFY")},
        "roles": {"SEQUENCE_DEPENDENT_DECISIONS", "PLACE_DECISION_GATES"},
        "unsupported": set(),
        "missing": set(),
    },
    "P-CSSGB-I-C-1-02": {
        "ordered": ["NEED", "DESIGN"],
        "links": {("NEED", "DESIGN")},
        "roles": {"SEQUENCE_DEPENDENT_DECISIONS", "PLACE_DECISION_GATES"},
        "unsupported": {"PROPRIETARY_PHASE_BETWEEN_NEED_AND_DESIGN"},
        "missing": {"NAMED_DFSS_ROADMAP_AUTHORITY"},
    },
    "M-CSSGB-I-C-1-01": {
        "ordered": ["D1", "D2", "D3"],
        "links": {("D1", "D2"), ("D2", "D3")},
        "roles": {"SEQUENCE_DEPENDENT_DECISIONS", "PLACE_DECISION_GATES"},
        "unsupported": set(),
        "missing": set(),
    },
    "R-CSSGB-I-C-1-01": {
        "ordered": ["R1", "R2", "R3"],
        "links": {("R1", "R2"), ("R2", "R3")},
        "roles": {"SEQUENCE_DEPENDENT_DECISIONS", "PLACE_DECISION_GATES"},
        "unsupported": set(),
        "missing": set(),
    },
}


class CSSGBDFSSRoadmapRoleOracle:
    scoring_type = SCORING_TYPE
    keys = {
        "ordered_decision_ids",
        "dependency_links",
        "roadmap_role_ids",
        "unsupported_specific_step_ids",
        "missing_authority",
        "proprietary_roadmap_claimed",
        "observed_design_success_claimed",
    }

    @classmethod
    def _parse(cls, response: str) -> Optional[Dict[str, Any]]:
        try:
            value = json.loads(response)
        except Exception:
            return None
        if not isinstance(value, dict) or set(value) != cls.keys:
            return None
        if value["proprietary_roadmap_claimed"] is not False:
            return None
        if value["observed_design_success_claimed"] is not False:
            return None
        if not isinstance(value["ordered_decision_ids"], list) or any(
            not isinstance(x, str) for x in value["ordered_decision_ids"]
        ):
            return None
        if len(value["ordered_decision_ids"]) != len(set(value["ordered_decision_ids"])):
            return None
        if not isinstance(value["dependency_links"], list):
            return None
        links = []
        for row in value["dependency_links"]:
            if not isinstance(row, dict) or set(row) != {"before_id", "after_id"}:
                return None
            if not isinstance(row["before_id"], str) or not isinstance(row["after_id"], str):
                return None
            links.append((row["before_id"], row["after_id"]))
        if len(links) != len(set(links)):
            return None
        for key in ("roadmap_role_ids", "unsupported_specific_step_ids", "missing_authority"):
            if not isinstance(value[key], list) or any(not isinstance(x, str) for x in value[key]):
                return None
            if len(value[key]) != len(set(value[key])):
                return None
        value["_links"] = set(links)
        return value

    def score(self, item: Dict[str, Any], response: str) -> bool:
        spec = SPECS.get(item.get("item_id"))
        if not spec or item.get("scoring_type") != self.scoring_type:
            return False
        value = self._parse(response)
        if value is None:
            return False
        if value["ordered_decision_ids"] != spec["ordered"]:
            return False
        if value["_links"] != spec["links"]:
            return False
        if set(value["roadmap_role_ids"]) != spec["roles"]:
            return False
        if set(value["unsupported_specific_step_ids"]) != spec["unsupported"]:
            return False
        if set(value["missing_authority"]) != spec["missing"]:
            return False
        return len(value["roadmap_role_ids"]) >= 2

    def validate_reference_items(self, course: Dict[str, Any]) -> Dict[str, Any]:
        checked = [
            {"item_id": item["item_id"], "pass": self.score(item, item.get("answer", ""))}
            for item in course.get("items", [])
            if item.get("scoring_type") == self.scoring_type
        ]
        return {
            "status": "PASS" if checked and all(x["pass"] for x in checked) else "FAIL",
            "checked": checked,
            "answer_key_used_as_oracle": False,
        }

    def validate_lesson_examples(self, course: Dict[str, Any]) -> Dict[str, Any]:
        lesson = next(
            (x for x in course.get("lessons", []) if x.get("lesson_id") == LESSON_ID),
            None,
        )
        examples = list(lesson.get("worked_examples", [])) if lesson else []
        text = "\n".join(examples).lower()
        required = ["dependency", "gate", "not one universal", "missing authority", "success"]
        failures = [f"TOKEN_MISSING:{token}" for token in required if token not in text]
        if len(examples) < 2:
            failures.append("WORKED_EXAMPLE_COUNT")
        return {
            "status": "PASS" if not failures else "FAIL",
            "checked": len(examples),
            "failures": failures,
            "behavior_expectation_owned_by_oracle": True,
        }


def build_course(*, goal_id: str, title: str, desired_outcome: str, dossier: Dict[str, Any]) -> Course:
    if dossier.get("dossier_id") != DOSSIER["dossier_id"] or desired_outcome.strip() != OUTCOME:
        raise ValueError("CSSGB_I_C_1_INPUT_MISMATCH")
    claims = [f"CL-CSSGB-I-C-1-{i:03d}" for i in range(1, 6)]
    explanation = (
        "A DFSS road map supplies an ordered decision structure for design work: it makes dependencies explicit, "
        "places gates before downstream decisions, and helps a team know what must be settled before proceeding. "
        "ASQ does not treat DFSS as one universal road map; named structures such as DMADV or IDOV are examples, not "
        "authority to invent a method for a scenario that does not name one. Therefore, when the scenario supplies only "
        "decision dependencies, order only those supplied decisions. If a question asks for a proprietary or named phase "
        "that is not governed by supplied authority, mark it unsupported and identify the missing authority. A road map can "
        "organize verification decisions, but using the road map is not evidence that the design actually succeeded."
    )
    examples = [
        "Example 1 — A scenario says requirement decision REQ must precede concept decision CONCEPT, and CONCEPT must precede VERIFY. The dependency chain can be ordered and a decision gate placed before each downstream choice. This illustrates roadmap structure, but DFSS is not one universal roadmap and the scenario does not authorize a proprietary phase name or prove design success.",
        "Example 2 — A scenario says NEED must be resolved before DESIGN, then asks for the exact proprietary phase that must sit between them without naming a governing DFSS method. Preserve the supplied dependency and gate, but decline the proprietary step: the missing authority is a named roadmap source. Do not turn structural guidance into a claim of success.",
    ]
    lesson = Lesson(
        LESSON_ID,
        "Road maps for DfSS: sequence design decisions without inventing a proprietary method",
        SKILL_ID,
        [CRITERION_ID],
        OUTCOME,
        explanation,
        examples,
        ["P-CSSGB-I-C-1-01", "P-CSSGB-I-C-1-02"],
        claim_refs=claims,
        grounding_spans=[
            {"role": "EXPLANATION", "text": explanation, "claim_refs": claims},
            {"role": "WORKED_EXAMPLE", "text": examples[0], "claim_refs": claims},
            {"role": "WORKED_EXAMPLE", "text": examples[1], "claim_refs": claims},
        ],
    )
    rationale = (
        "The response orders only the decision dependencies supplied by the scenario, identifies sequencing and gate roles, "
        "refuses any unsupported proprietary phase, and does not claim observed design success."
    )
    items = [
        Item(
            "P-CSSGB-I-C-1-01",
            "F-CSSGB-I-C-1-P1",
            CRITERION_ID,
            "PRACTICE",
            "Design scenario: REQ must be settled before CONCEPT; CONCEPT must be settled before VERIFY. No named DFSS method is supplied. Return the required JSON showing the ordered decisions, both dependency links, and roadmap roles SEQUENCE_DEPENDENT_DECISIONS and PLACE_DECISION_GATES. Do not name a proprietary roadmap or claim design success.",
            _answer(
                ["REQ", "CONCEPT", "VERIFY"],
                [["REQ", "CONCEPT"], ["CONCEPT", "VERIFY"]],
                ["SEQUENCE_DEPENDENT_DECISIONS", "PLACE_DECISION_GATES"],
            ),
            rationale,
            scoring_type=SCORING_TYPE,
            claim_refs=claims,
            grounding_spans=[{"role": "RATIONALE", "text": rationale, "claim_refs": claims}],
        ),
        Item(
            "P-CSSGB-I-C-1-02",
            "F-CSSGB-I-C-1-P2",
            CRITERION_ID,
            "PRACTICE",
            "Design scenario: NEED must precede DESIGN. The prompt also asks for the exact proprietary phase that must occur between them, but no named DFSS roadmap is supplied. Preserve NEED -> DESIGN, identify roadmap sequencing/gate roles, mark PROPRIETARY_PHASE_BETWEEN_NEED_AND_DESIGN unsupported, and identify NAMED_DFSS_ROADMAP_AUTHORITY as missing. Return JSON.",
            _answer(
                ["NEED", "DESIGN"],
                [["NEED", "DESIGN"]],
                ["SEQUENCE_DEPENDENT_DECISIONS", "PLACE_DECISION_GATES"],
                ["PROPRIETARY_PHASE_BETWEEN_NEED_AND_DESIGN"],
                ["NAMED_DFSS_ROADMAP_AUTHORITY"],
            ),
            rationale,
            scoring_type=SCORING_TYPE,
            claim_refs=claims,
            grounding_spans=[{"role": "RATIONALE", "text": rationale, "claim_refs": claims}],
        ),
        Item(
            "M-CSSGB-I-C-1-01",
            "F-CSSGB-I-C-1-M1",
            CRITERION_ID,
            "MASTERY_CHECK",
            "Independent scenario: D1 establishes design requirements. D2 compares design concepts and may occur only after D1. D3 verifies the selected design against the stated requirements and may occur only after D2. No proprietary DFSS method is named. Return D1,D2,D3 in order with both dependency links and the two roadmap-role IDs. Do not claim a proprietary roadmap or observed design success.",
            _answer(
                ["D1", "D2", "D3"],
                [["D1", "D2"], ["D2", "D3"]],
                ["SEQUENCE_DEPENDENT_DECISIONS", "PLACE_DECISION_GATES"],
            ),
            rationale,
            scoring_type=SCORING_TYPE,
            claim_refs=claims,
            grounding_spans=[{"role": "RATIONALE", "text": rationale, "claim_refs": claims}],
        ),
        Item(
            "R-CSSGB-I-C-1-01",
            "F-CSSGB-I-C-1-R1",
            CRITERION_ID,
            "RETENTION_CHECK",
            "Delayed parallel scenario: R1 establishes what the design must satisfy. R2 selects among alternatives and depends on R1. R3 checks the chosen design against the stated need and depends on R2. No named proprietary method is supplied. Return R1,R2,R3 in order with both dependency links and the two roadmap-role IDs, without claiming design success.",
            _answer(
                ["R1", "R2", "R3"],
                [["R1", "R2"], ["R2", "R3"]],
                ["SEQUENCE_DEPENDENT_DECISIONS", "PLACE_DECISION_GATES"],
            ),
            rationale,
            scoring_type=SCORING_TYPE,
            claim_refs=claims,
            grounding_spans=[{"role": "RATIONALE", "text": rationale, "claim_refs": claims}],
        ),
    ]
    return Course(
        course_id=f"COURSE-{goal_id}",
        version=1,
        goal_id=goal_id,
        title=title,
        desired_outcome=desired_outcome,
        skills=[Skill(SKILL_ID, "Recognize the role of a DfSS road map", [CRITERION_ID], [])],
        criteria=[Criterion(CRITERION_ID, SKILL_ID, OUTCOME)],
        lessons=[lesson],
        items=items,
        source_ids=[source["source_id"] for source in dossier["sources"]],
        research_dossier_id=dossier["dossier_id"],
        generation_adapter="CSSGB-001E-I-C-1-GROUNDED-CONTENT-V1",
    )
