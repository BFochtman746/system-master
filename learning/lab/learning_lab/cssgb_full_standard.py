from __future__ import annotations

import copy
import json
from typing import Any, Dict, List, Optional

from .models import Course, Criterion, Item, Lesson, Skill


CSSGB_FULL_STANDARD_DOMAIN_KEY = "asq-cssgb-2022-full-standard"
CSSGB_001E_BATCH_01_DOMAIN_KEY = "asq-cssgb-2022-001e-i-a-1"
CSSGB_001E_BATCH_01_REQUIREMENT_ID = "ASQ-CSSGB-2022-I.A.1"
CSSGB_001E_BATCH_01_SKILL_ID = "CSSGB-2022::ASQ-CSSGB-2022-I.A.1::SUBSKILL::value-mechanisms"
CSSGB_001E_BATCH_01_CRITERION_ID = "CRIT::CSSGB-2022::ASQ-CSSGB-2022-I.A.1::SUBSKILL::value-mechanisms"
CSSGB_001E_BATCH_01_LESSON_ID = "LESSON::CSSGB-2022::ASQ-CSSGB-2022-I.A.1::SUBSKILL::value-mechanisms"
CSSGB_001E_BATCH_01_OUTCOME = (
    "Given a bounded organizational scenario, distinguish plausible operational, customer, and financial "
    "value mechanisms of Six Sigma and explain the causal link without claiming observed business impact."
)
CSSGB_VALUE_SCORING_TYPE = "CSSGB_I_A_1_BOUNDED_VALUE_V1"


I_A_1_SOURCE_DOSSIER: Dict[str, Any] = {
    "dossier_id": "RSCH-CSSGB-2022-I-A-1-001",
    "retrieved_date": "2026-09-10",
    "source_policy": "FROZEN_STANDARD_IDENTITY_PLUS_ASQ_SUPPLEMENTAL_INSTRUCTIONAL_GROUNDING",
    "domain_key": CSSGB_001E_BATCH_01_DOMAIN_KEY,
    "frozen_requirement_identity": {
        "requirement_id": CSSGB_001E_BATCH_01_REQUIREMENT_ID,
        "source_locator": "ASQ CSSGB BoK 2022 p.3 / I.A.1",
        "title": "Value of Six Sigma",
        "highest_cognitive_level": "UNDERSTAND",
        "supplemental_sources_replace_frozen_identity": False,
    },
    "sources": [
        {
            "source_id": "SRC-ASQ-SIX-SIGMA-DEFINITION",
            "title": "Six Sigma Definition - What is Lean Six Sigma?",
            "url": "https://asq.org/quality-resources/six-sigma",
            "authority": "AMERICAN_SOCIETY_FOR_QUALITY",
            "standing": "ADMITTED",
            "retrieved_date": "2026-09-10",
            "source_bytes_archived": False,
        },
        {
            "source_id": "SRC-ASQ-PAINT-SHOP-CASE",
            "title": "Improving Customer Satisfaction Through Six Sigma: A Paint Shop Case Study",
            "url": "https://asq.org/quality-resources/articles/case-studies/improving-customer-satisfaction-through-six-sigma-a-paint-shop-case-study",
            "authority": "AMERICAN_SOCIETY_FOR_QUALITY",
            "standing": "ADMITTED",
            "retrieved_date": "2026-09-10",
            "source_bytes_archived": False,
        },
        {
            "source_id": "SRC-ASQ-3M-CASE",
            "title": "Quality Revolution Reduces Defects, Drives Sales Growth at 3M",
            "url": "https://asq.org/quality-resources/articles/case-studies/quality-revolution-reduces-defects-drives-sales-growth-at-3m",
            "authority": "AMERICAN_SOCIETY_FOR_QUALITY",
            "standing": "ADMITTED",
            "retrieved_date": "2026-09-10",
            "source_bytes_archived": False,
        },
    ],
    "claims": [
        {
            "claim_id": "CL-CSSGB-I-A-1-001",
            "source_id": "SRC-ASQ-SIX-SIGMA-DEFINITION",
            "text": "ASQ describes Six Sigma as a disciplined improvement method intended to improve process capability and customer satisfaction by reducing process variation that can contribute to defects or errors.",
            "kind": "PARAPHRASED_SOURCE_CLAIM",
        },
        {
            "claim_id": "CL-CSSGB-I-A-1-002",
            "source_id": "SRC-ASQ-SIX-SIGMA-DEFINITION",
            "text": "ASQ links better process performance and lower variation with possible reductions in defects and improvements in quality, customer satisfaction, and financial results; these are mechanisms or potential outcomes, not proof that a particular project already produced them.",
            "kind": "PARAPHRASED_SOURCE_CLAIM_WITH_EVIDENCE_BOUNDARY",
        },
        {
            "claim_id": "CL-CSSGB-I-A-1-003",
            "source_id": "SRC-ASQ-PAINT-SHOP-CASE",
            "text": "An ASQ-hosted paint-shop case reports that a Six Sigma team addressed customer dissatisfaction and recurring quality problems and achieved a substantial measured quality improvement in that specific case.",
            "kind": "PARAPHRASED_CASE_EVIDENCE",
        },
        {
            "claim_id": "CL-CSSGB-I-A-1-004",
            "source_id": "SRC-ASQ-3M-CASE",
            "text": "An ASQ-hosted 3M case reports that a Lean Six Sigma project addressing customer complaints coincided with a large reduction in defects and increased sales in that specific project; the case does not establish that every Six Sigma project will produce the same business result.",
            "kind": "PARAPHRASED_CASE_EVIDENCE_WITH_GENERALIZATION_BOUNDARY",
        },
    ],
    "limitations": [
        "SUPPLEMENTAL_WEB_SOURCES_DO_NOT_REPLACE_THE_FROZEN_2022_STANDARD_IDENTITY",
        "SOURCE_BYTES_NOT_ARCHIVED_IN_THIS_PORTABLE_BATCH",
        "CASE_RESULTS_ARE_CONTEXT_SPECIFIC_AND_NOT_GENERAL_CAUSAL_GUARANTEES",
        "NO_REAL_LEARNER_OR_PSYCHOMETRIC_EVIDENCE_IS_CREATED_BY_THIS DOSSIER",
    ],
}


def i_a_1_dossier() -> Dict[str, Any]:
    return copy.deepcopy(I_A_1_SOURCE_DOSSIER)


def _response(mechanisms: List[Dict[str, Any]], *, missing: Optional[List[str]] = None) -> str:
    return json.dumps(
        {
            "mechanisms": mechanisms,
            "realized_impact_claimed": False,
            "missing_evidence": missing or [],
        },
        sort_keys=True,
        separators=(",", ":"),
    )


I_A_1_ORACLE_SPECS: Dict[str, Dict[str, Any]] = {
    "P-CSSGB-I-A-1-01": {
        "min_mechanisms": 2,
        "allowed_pairs": {
            "operational": {"F1", "F2"},
            "customer": {"F3"},
        },
        "allowed_missing_evidence": {"FINANCIAL_OUTCOME"},
        "required_missing_evidence": set(),
    },
    "P-CSSGB-I-A-1-02": {
        "min_mechanisms": 2,
        "allowed_pairs": {
            "operational": {"F1"},
            "customer": {"F2"},
        },
        "allowed_missing_evidence": {"FINANCIAL_OUTCOME"},
        "required_missing_evidence": {"FINANCIAL_OUTCOME"},
    },
    "M-CSSGB-I-A-1-01": {
        "min_mechanisms": 2,
        "allowed_pairs": {
            "operational": {"F1", "F2"},
            "customer": {"F3"},
            "financial": {"F2"},
        },
        "allowed_missing_evidence": {"REALIZED_POST_CHANGE_IMPACT"},
        "required_missing_evidence": set(),
    },
    "R-CSSGB-I-A-1-01": {
        "min_mechanisms": 2,
        "allowed_pairs": {
            "operational": {"G1"},
            "customer": {"G2"},
            "financial": {"G1"},
        },
        "allowed_missing_evidence": {"REALIZED_POST_CHANGE_IMPACT"},
        "required_missing_evidence": set(),
    },
}


class CSSGBValueMechanismOracle:
    """Independent structured-response oracle for 001E I.A.1.

    Correctness is derived from an oracle-owned scenario specification keyed by
    item_id. It never compares the learner response with Item.answer and rejects
    malformed structures, unsupported mechanism/fact links, and claims that
    realized post-change impact has already been observed.
    """

    scoring_type = CSSGB_VALUE_SCORING_TYPE

    @staticmethod
    def _parse(response: str) -> Optional[Dict[str, Any]]:
        try:
            value = json.loads(response)
        except Exception:
            return None
        if not isinstance(value, dict) or set(value) != {"mechanisms", "realized_impact_claimed", "missing_evidence"}:
            return None
        if not isinstance(value["mechanisms"], list) or not isinstance(value["realized_impact_claimed"], bool) or not isinstance(value["missing_evidence"], list):
            return None
        return value

    def score(self, item: Dict[str, Any], response: str) -> bool:
        spec = I_A_1_ORACLE_SPECS.get(item.get("item_id"))
        if not spec or item.get("scoring_type") != self.scoring_type:
            return False
        value = self._parse(response)
        if value is None or value["realized_impact_claimed"]:
            return False
        missing = value["missing_evidence"]
        if any(not isinstance(x, str) for x in missing) or len(set(missing)) != len(missing):
            return False
        missing_set = set(missing)
        if not missing_set.issubset(spec["allowed_missing_evidence"]):
            return False
        if not spec["required_missing_evidence"].issubset(missing_set):
            return False

        seen_mechanisms = set()
        for link in value["mechanisms"]:
            if not isinstance(link, dict) or set(link) != {"mechanism", "fact_ids"}:
                return False
            mechanism = link["mechanism"]
            fact_ids = link["fact_ids"]
            if mechanism in seen_mechanisms or mechanism not in spec["allowed_pairs"]:
                return False
            if not isinstance(fact_ids, list) or not fact_ids or any(not isinstance(x, str) for x in fact_ids):
                return False
            if not set(fact_ids).issubset(spec["allowed_pairs"][mechanism]):
                return False
            seen_mechanisms.add(mechanism)
        return len(seen_mechanisms) >= int(spec["min_mechanisms"])

    def validate_reference_items(self, course: Dict[str, Any]) -> Dict[str, Any]:
        checked = []
        for item in course.get("items", []):
            if item.get("scoring_type") != self.scoring_type:
                continue
            ok = self.score(item, item.get("answer", ""))
            checked.append({"item_id": item["item_id"], "pass": ok})
        return {
            "status": "PASS" if checked and all(x["pass"] for x in checked) else "FAIL",
            "checked": checked,
            "answer_key_used_as_oracle": False,
        }

    def validate_lesson_examples(self, course: Dict[str, Any]) -> Dict[str, Any]:
        lesson = next((x for x in course.get("lessons", []) if x.get("lesson_id") == CSSGB_001E_BATCH_01_LESSON_ID), None)
        failures: List[str] = []
        examples = list(lesson.get("worked_examples", [])) if lesson else []
        expected_tokens = [
            ["F1", "operational", "F2", "customer", "plausible", "not an observed result"],
            ["F1", "operational", "F2", "customer", "missing", "financial", "not an observed result"],
        ]
        if len(examples) != len(expected_tokens):
            failures.append("WORKED_EXAMPLE_COUNT")
        else:
            for idx, tokens in enumerate(expected_tokens):
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


def build_i_a_1_slice_course(*, goal_id: str, title: str, desired_outcome: str, dossier: Dict[str, Any]) -> Course:
    if dossier.get("dossier_id") != I_A_1_SOURCE_DOSSIER["dossier_id"]:
        raise ValueError("CSSGB_I_A_1_DOSSIER_MISMATCH")
    if dossier.get("domain_key") != CSSGB_001E_BATCH_01_DOMAIN_KEY:
        raise ValueError("CSSGB_I_A_1_DOMAIN_MISMATCH")
    if desired_outcome.strip() != CSSGB_001E_BATCH_01_OUTCOME:
        raise ValueError("CSSGB_I_A_1_OUTCOME_MISMATCH")

    criterion = Criterion(CSSGB_001E_BATCH_01_CRITERION_ID, CSSGB_001E_BATCH_01_SKILL_ID, CSSGB_001E_BATCH_01_OUTCOME)
    skill = Skill(CSSGB_001E_BATCH_01_SKILL_ID, "Explain Six Sigma value mechanisms", [CSSGB_001E_BATCH_01_CRITERION_ID], [])

    explanation = (
        "Six Sigma creates value through evidence-bounded mechanisms rather than by guaranteeing a business result. "
        "Reducing process variation that contributes to defects can plausibly improve operational performance by reducing errors, rework, or instability. "
        "When those defects affect what customers receive, the same mechanism can plausibly improve customer experience or satisfaction. "
        "If defects, rework, scrap, warranty activity, or delay consume resources, reducing them can also create a plausible financial mechanism. "
        "A mechanism is not the same as an observed result: a scenario must provide post-change evidence before a learner may claim that profit, quality, or satisfaction actually improved."
    )
    examples = [
        "Example 1 — Facts F1 and F2: F1 states that fill-weight variation is producing rework; F2 states that customers are receiving inconsistent quantities. A supported explanation links F1 to an operational mechanism and F2 to a customer mechanism. Both are plausible value mechanisms, not an observed result; post-change evidence would still be required.",
        "Example 2 — Facts F1 and F2: F1 states that a process has recurring adjustment-related rework and F2 states that customers complain about inconsistent output. Operational value can be linked to F1 and customer value to F2. Financial value is missing supporting evidence in this scenario, so it should be identified as unestablished rather than guessed; it is not an observed result."
    ]
    lesson = Lesson(
        CSSGB_001E_BATCH_01_LESSON_ID,
        "Value of Six Sigma: Explain Six Sigma value mechanisms",
        CSSGB_001E_BATCH_01_SKILL_ID,
        [CSSGB_001E_BATCH_01_CRITERION_ID],
        CSSGB_001E_BATCH_01_OUTCOME,
        explanation,
        examples,
        ["P-CSSGB-I-A-1-01", "P-CSSGB-I-A-1-02"],
        claim_refs=["CL-CSSGB-I-A-1-001", "CL-CSSGB-I-A-1-002", "CL-CSSGB-I-A-1-003", "CL-CSSGB-I-A-1-004"],
        grounding_spans=[
            {"role": "EXPLANATION", "text": explanation, "claim_refs": ["CL-CSSGB-I-A-1-001", "CL-CSSGB-I-A-1-002", "CL-CSSGB-I-A-1-003", "CL-CSSGB-I-A-1-004"]},
            {"role": "WORKED_EXAMPLE", "text": examples[0], "claim_refs": ["CL-CSSGB-I-A-1-001", "CL-CSSGB-I-A-1-002"]},
            {"role": "WORKED_EXAMPLE", "text": examples[1], "claim_refs": ["CL-CSSGB-I-A-1-001", "CL-CSSGB-I-A-1-002"]},
        ],
    )

    items = [
        Item(
            "P-CSSGB-I-A-1-01", "F-CSSGB-I-A-1-P1", CSSGB_001E_BATCH_01_CRITERION_ID, "PRACTICE",
            "Scenario facts: F1=process variation is causing repeated adjustment and rework; F2=defect-related rework consumes technician time; F3=customers report inconsistent output. Return JSON with mechanisms, realized_impact_claimed, and missing_evidence. Identify at least two supported value mechanisms without claiming a realized result.",
            _response([{"mechanism": "operational", "fact_ids": ["F1", "F2"]}, {"mechanism": "customer", "fact_ids": ["F3"]}], missing=["FINANCIAL_OUTCOME"]),
            "Variation-related rework supports an operational mechanism and stated customer inconsistency supports a customer mechanism; no realized post-change result is given.",
            scoring_type=CSSGB_VALUE_SCORING_TYPE,
            claim_refs=["CL-CSSGB-I-A-1-001", "CL-CSSGB-I-A-1-002"],
            grounding_spans=[{"role": "RATIONALE", "text": "Variation-related rework supports an operational mechanism and stated customer inconsistency supports a customer mechanism; no realized post-change result is given.", "claim_refs": ["CL-CSSGB-I-A-1-001", "CL-CSSGB-I-A-1-002"]}],
        ),
        Item(
            "P-CSSGB-I-A-1-02", "F-CSSGB-I-A-1-P2", CSSGB_001E_BATCH_01_CRITERION_ID, "PRACTICE",
            "Scenario facts: F1=operators repeat adjustments because output varies; F2=customers complain about inconsistent output. No cost or financial outcome data are supplied. Return JSON with at least two supported mechanisms and explicitly identify missing financial evidence.",
            _response([{"mechanism": "operational", "fact_ids": ["F1"]}, {"mechanism": "customer", "fact_ids": ["F2"]}], missing=["FINANCIAL_OUTCOME"]),
            "The supplied facts support operational and customer mechanisms, while financial value remains unestablished because the scenario provides no financial evidence.",
            scoring_type=CSSGB_VALUE_SCORING_TYPE,
            claim_refs=["CL-CSSGB-I-A-1-001", "CL-CSSGB-I-A-1-002"],
            grounding_spans=[{"role": "RATIONALE", "text": "The supplied facts support operational and customer mechanisms, while financial value remains unestablished because the scenario provides no financial evidence.", "claim_refs": ["CL-CSSGB-I-A-1-001", "CL-CSSGB-I-A-1-002"]}],
        ),
        Item(
            "M-CSSGB-I-A-1-01", "F-CSSGB-I-A-1-M1", CSSGB_001E_BATCH_01_CRITERION_ID, "MASTERY_CHECK",
            "Independent scenario: F1=fill-weight variation is outside the desired operating range; F2=scrap and rework costs are rising; F3=customers return underfilled units. Return JSON identifying at least two supported operational/customer/financial value mechanisms linked to supplied fact IDs. realized_impact_claimed must reflect whether post-change results are actually supplied.",
            _response([{"mechanism": "operational", "fact_ids": ["F1"]}, {"mechanism": "customer", "fact_ids": ["F3"]}, {"mechanism": "financial", "fact_ids": ["F2"]}]),
            "The scenario supports multiple plausible value mechanisms, but it contains no post-change evidence that any benefit has already been realized.",
            scoring_type=CSSGB_VALUE_SCORING_TYPE,
            claim_refs=["CL-CSSGB-I-A-1-001", "CL-CSSGB-I-A-1-002", "CL-CSSGB-I-A-1-003", "CL-CSSGB-I-A-1-004"],
            grounding_spans=[{"role": "RATIONALE", "text": "The scenario supports multiple plausible value mechanisms, but it contains no post-change evidence that any benefit has already been realized.", "claim_refs": ["CL-CSSGB-I-A-1-001", "CL-CSSGB-I-A-1-002", "CL-CSSGB-I-A-1-003", "CL-CSSGB-I-A-1-004"]}],
        ),
        Item(
            "R-CSSGB-I-A-1-01", "F-CSSGB-I-A-1-R1", CSSGB_001E_BATCH_01_CRITERION_ID, "RETENTION_CHECK",
            "Delayed parallel scenario: G1=variation in order processing creates overtime and repeated manual correction; G2=customers report late and inconsistent delivery. Return JSON identifying at least two supported value mechanisms linked to supplied fact IDs without claiming a realized post-change result.",
            _response([{"mechanism": "operational", "fact_ids": ["G1"]}, {"mechanism": "customer", "fact_ids": ["G2"]}]),
            "A distinct delayed scenario can support operational and customer mechanisms while still requiring post-change evidence before realized impact is claimed.",
            scoring_type=CSSGB_VALUE_SCORING_TYPE,
            claim_refs=["CL-CSSGB-I-A-1-001", "CL-CSSGB-I-A-1-002"],
            grounding_spans=[{"role": "RATIONALE", "text": "A distinct delayed scenario can support operational and customer mechanisms while still requiring post-change evidence before realized impact is claimed.", "claim_refs": ["CL-CSSGB-I-A-1-001", "CL-CSSGB-I-A-1-002"]}],
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
        generation_adapter="CSSGB-001E-I-A-1-GROUNDED-CONTENT-V1",
    )
