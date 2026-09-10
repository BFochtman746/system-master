from __future__ import annotations

import copy
import json
from typing import Any, Dict, List, Optional, Tuple

from .models import Course, Criterion, Item, Lesson, Skill

DOMAIN_KEY = "cssgb-2022-i-a-1-value-mechanisms"
DESIRED_OUTCOME = (
    "Given a bounded organizational scenario, distinguish plausible operational, customer, "
    "and financial value mechanisms of Six Sigma and explain the causal link without claiming "
    "observed business impact."
)
SKILL_ID = "CSSGB-2022::ASQ-CSSGB-2022-I.A.1::SUBSKILL::value-mechanisms"
CRITERION_ID = "CRIT::CSSGB-2022::ASQ-CSSGB-2022-I.A.1::SUBSKILL::value-mechanisms"
LESSON_ID = "LESSON::CSSGB-2022::ASQ-CSSGB-2022-I.A.1::SUBSKILL::value-mechanisms"
SCORING_TYPE = "CSSGB_VALUE_MECHANISMS_V1"
DOSSIER_ID = "RSCH-ASQ-CSSGB-2022-I.A.1-001E-B01"

SOURCE_DOSSIER: Dict[str, Any] = {
    "dossier_id": DOSSIER_ID,
    "domain_key": DOMAIN_KEY,
    "retrieved_date": "2026-09-10",
    "source_policy": "OFFICIAL_PRIMARY_PREFERRED__FROZEN_STANDARD_IDENTITY_UNCHANGED",
    "source_bytes_archived": False,
    "source_bytes_archive_limitation": (
        "Portable Batch 01 records source identity and bounded paraphrased claims but does not archive "
        "the external page bytes; source drift must therefore be handled by the existing freshness/review lane."
    ),
    "sources": [
        {
            "source_id": "SRC-ASQ-SIX-SIGMA-OVERVIEW",
            "title": "Six Sigma Definition - What is Lean Six Sigma?",
            "url": "https://asq.org/quality-resources/six-sigma",
            "authority": "AMERICAN_SOCIETY_FOR_QUALITY_OFFICIAL_RESOURCE",
            "standing": "ADMITTED",
            "retrieved_date": "2026-09-10",
        }
    ],
    "claims": [
        {
            "claim_id": "CL-CSSGB-I.A.1-001",
            "source_id": "SRC-ASQ-SIX-SIGMA-OVERVIEW",
            "text": "Six Sigma uses disciplined process improvement to reduce process variation that can contribute to defects and errors.",
            "kind": "FACT_PARAPHRASE",
        },
        {
            "claim_id": "CL-CSSGB-I.A.1-002",
            "source_id": "SRC-ASQ-SIX-SIGMA-OVERVIEW",
            "text": "Reducing variation and defects can support improved product or service quality and customer satisfaction.",
            "kind": "FACT_PARAPHRASE",
        },
        {
            "claim_id": "CL-CSSGB-I.A.1-003",
            "source_id": "SRC-ASQ-SIX-SIGMA-OVERVIEW",
            "text": "Process-performance improvement and defect reduction can contribute to financial value, but a specific realized financial result requires evidence from the organization and scenario being evaluated.",
            "kind": "FACT_PLUS_EVIDENCE_BOUNDARY",
        },
        {
            "claim_id": "CL-CSSGB-I.A.1-004",
            "source_id": "SRC-ASQ-SIX-SIGMA-OVERVIEW",
            "text": "Six Sigma is fact-based and data-driven, so value reasoning should connect stated process evidence to a plausible improvement mechanism rather than assume an outcome.",
            "kind": "FACT_PLUS_INSTRUCTIONAL_DERIVATION",
        },
    ],
}

ITEM_IDS = {
    "practice_1": "PRACTICE::CSSGB-2022::I.A.1::VALUE-MECHANISMS::01",
    "practice_2": "PRACTICE::CSSGB-2022::I.A.1::VALUE-MECHANISMS::02",
    "mastery": "MASTERY::CSSGB-2022::I.A.1::VALUE-MECHANISMS::01",
    "retention": "RETENTION::CSSGB-2022::I.A.1::VALUE-MECHANISMS::01",
}

SCENARIOS: Dict[str, Dict[str, Any]] = {
    ITEM_IDS["practice_1"]: {
        "facts": {
            "P1-F1": {"text": "Labeling errors vary substantially by shift and create rework.", "mechanisms": ["operational"]},
            "P1-F2": {"text": "Customers sometimes receive replacements after a labeling error.", "mechanisms": ["customer"]},
            "P1-F3": {"text": "Each replacement creates extra shipping and handling cost.", "mechanisms": ["financial"]},
        }
    },
    ITEM_IDS["practice_2"]: {
        "facts": {
            "P2-F1": {"text": "Order-entry mistakes fluctuate by operator and require correction.", "mechanisms": ["operational"]},
            "P2-F2": {"text": "Some mistakes cause customers to receive a corrected confirmation later than promised.", "mechanisms": ["customer"]},
        }
    },
    ITEM_IDS["mastery"]: {
        "facts": {
            "M-F1": {"text": "A service process has highly variable handoff times and repeated handoff errors.", "mechanisms": ["operational"]},
            "M-F2": {"text": "Customer complaints identify missed handoff commitments as a recurring issue.", "mechanisms": ["customer"]},
            "M-F3": {"text": "No cost, revenue, or savings data are supplied.", "mechanisms": []},
        }
    },
    ITEM_IDS["retention"]: {
        "facts": {
            "R-F1": {"text": "A billing process has recurring data-entry defects that require staff rework.", "mechanisms": ["operational"]},
            "R-F2": {"text": "The organization records a known labor cost for each rework event.", "mechanisms": ["financial"]},
            "R-F3": {"text": "No customer experience measure is supplied.", "mechanisms": []},
        }
    },
}


def _canonical_response(mechanisms: List[Dict[str, Any]], missing_evidence: List[str]) -> str:
    return json.dumps(
        {
            "mechanisms": mechanisms,
            "realized_impact_claimed": False,
            "missing_evidence": missing_evidence,
        },
        sort_keys=True,
        separators=(",", ":"),
    )


def _scenario_prompt(item_id: str) -> str:
    scenario = SCENARIOS[item_id]
    facts = "; ".join(f"{fid}: {spec['text']}" for fid, spec in scenario["facts"].items())
    return (
        f"Scenario facts: {facts} Respond as UTF-8 JSON with keys mechanisms, realized_impact_claimed, "
        "and missing_evidence. mechanisms must be an array of objects {mechanism, fact_ids[]}. Identify "
        "at least two supported value mechanisms. Link every mechanism to supplied fact IDs. If evidence for "
        "a value category is absent, identify the missing evidence rather than guess. Do not claim realized impact."
    )


LESSON_EXPLANATION = (
    "Treat value as an evidence-bounded causal pathway, not as a guaranteed result. Start with the facts the "
    "scenario actually supplies. An operational value mechanism is supported when those facts show variation, "
    "defects, errors, rework, or another process condition that disciplined Six Sigma improvement could plausibly "
    "reduce. A customer value mechanism is supported when supplied facts connect the process condition to a "
    "customer-facing error, delay, quality problem, or satisfaction consequence. A financial value mechanism is "
    "supported only when supplied facts provide a cost, resource, revenue, or other financial linkage. These are "
    "plausible mechanisms; none is an observed realized result unless the scenario supplies outcome evidence."
)

WORKED_EXAMPLES = [
    (
        "Example 1: A packaging process varies by shift, packaging errors cause customer returns, and each return "
        "has a stated handling cost. The same evidence can support three plausible pathways: operational value from "
        "less variation/error and rework, customer value from fewer error-driven returns, and financial value from "
        "lower handling cost if the error frequency actually falls. The scenario supports the mechanisms but does "
        "not establish a realized result."
    ),
    (
        "Example 2: A process has variable cycle time and recurring internal correction, while the scenario provides "
        "no customer measure and no cost or revenue evidence. Operational value is plausible because the stated "
        "process condition can be improved through variation/error reduction. Customer and financial value should "
        "be reported as missing evidence rather than invented, and no realized result should be claimed."
    ),
]


def _items() -> List[Item]:
    p1_answer = _canonical_response(
        [
            {"mechanism": "operational", "fact_ids": ["P1-F1"]},
            {"mechanism": "customer", "fact_ids": ["P1-F2"]},
            {"mechanism": "financial", "fact_ids": ["P1-F3"]},
        ],
        [],
    )
    p2_answer = _canonical_response(
        [
            {"mechanism": "operational", "fact_ids": ["P2-F1"]},
            {"mechanism": "customer", "fact_ids": ["P2-F2"]},
        ],
        ["No supplied cost, revenue, savings, or other financial consequence supports a financial-value claim."],
    )
    mastery_answer = _canonical_response(
        [
            {"mechanism": "operational", "fact_ids": ["M-F1"]},
            {"mechanism": "customer", "fact_ids": ["M-F2"]},
        ],
        ["No supplied cost, revenue, savings, or other financial consequence supports a financial-value claim."],
    )
    retention_answer = _canonical_response(
        [
            {"mechanism": "operational", "fact_ids": ["R-F1"]},
            {"mechanism": "financial", "fact_ids": ["R-F2"]},
        ],
        ["No supplied customer experience or customer-impact fact supports a customer-value claim."],
    )
    common_refs = ["CL-CSSGB-I.A.1-001", "CL-CSSGB-I.A.1-002", "CL-CSSGB-I.A.1-003", "CL-CSSGB-I.A.1-004"]
    data = [
        (ITEM_IDS["practice_1"], "FAM-CSSGB-I.A.1-PRACTICE-A", "PRACTICE", p1_answer),
        (ITEM_IDS["practice_2"], "FAM-CSSGB-I.A.1-PRACTICE-B", "PRACTICE", p2_answer),
        (ITEM_IDS["mastery"], "FAM-CSSGB-I.A.1-MASTERY-A", "MASTERY_CHECK", mastery_answer),
        (ITEM_IDS["retention"], "FAM-CSSGB-I.A.1-RETENTION-A", "RETENTION_CHECK", retention_answer),
    ]
    out: List[Item] = []
    for item_id, family_id, mode, answer in data:
        rationale = (
            "A passing response must identify at least two value mechanisms, connect each mechanism to supplied "
            "scenario facts, avoid claiming an unobserved realized result, and explicitly surface missing evidence "
            "when a value category is unsupported."
        )
        out.append(
            Item(
                item_id=item_id,
                family_id=family_id,
                criterion_id=CRITERION_ID,
                mode=mode,
                prompt=_scenario_prompt(item_id),
                answer=answer,
                rationale=rationale,
                scoring_type=SCORING_TYPE,
                claim_refs=common_refs,
                grounding_spans=[{"role": "RATIONALE", "text": rationale, "claim_refs": common_refs}],
            )
        )
    return out


def build_course(*, goal_id: str, title: str, desired_outcome: str, dossier: Dict[str, Any]) -> Course:
    if desired_outcome.strip() != DESIRED_OUTCOME:
        raise ValueError("CSSGB_I_A_1_OUTCOME_MISMATCH")
    admitted = {c["claim_id"] for c in dossier.get("claims", [])}
    required_claims = {f"CL-CSSGB-I.A.1-{i:03d}" for i in range(1, 5)}
    if not required_claims.issubset(admitted):
        raise ValueError("CSSGB_I_A_1_GROUNDING_CLAIMS_INCOMPLETE")
    lesson_claims = sorted(required_claims)
    lesson = Lesson(
        lesson_id=LESSON_ID,
        title="Value of Six Sigma: explain evidence-bounded value mechanisms",
        skill_id=SKILL_ID,
        criterion_ids=[CRITERION_ID],
        objective=DESIRED_OUTCOME,
        explanation=LESSON_EXPLANATION,
        worked_examples=copy.deepcopy(WORKED_EXAMPLES),
        practice_item_ids=[ITEM_IDS["practice_1"], ITEM_IDS["practice_2"]],
        claim_refs=lesson_claims,
        grounding_spans=[
            {"role": "EXPLANATION", "text": LESSON_EXPLANATION, "claim_refs": lesson_claims},
            {"role": "WORKED_EXAMPLE", "text": WORKED_EXAMPLES[0], "claim_refs": lesson_claims},
            {"role": "WORKED_EXAMPLE", "text": WORKED_EXAMPLES[1], "claim_refs": lesson_claims},
        ],
    )
    return Course(
        course_id=f"COURSE-{goal_id}",
        version=1,
        goal_id=goal_id,
        title=title,
        desired_outcome=desired_outcome,
        skills=[Skill(SKILL_ID, "Explain Six Sigma value mechanisms", [CRITERION_ID], [])],
        criteria=[Criterion(CRITERION_ID, SKILL_ID, DESIRED_OUTCOME)],
        lessons=[lesson],
        items=_items(),
        state="READY_FOR_REVIEW",
        source_ids=["SRC-ASQ-SIX-SIGMA-OVERVIEW"],
        research_dossier_id=DOSSIER_ID,
        generation_adapter="CSSGB-2022-001E-B01-DETERMINISTIC-CONTENT-V1",
    )


class CSSGBValueMechanismOracle:
    allowed_mechanisms = {"operational", "customer", "financial"}

    def score(self, item: Dict[str, Any], response: str) -> bool:
        if item.get("scoring_type") != SCORING_TYPE:
            return False
        scenario = SCENARIOS.get(item.get("item_id"))
        if scenario is None:
            return False
        try:
            body = json.loads(response)
        except Exception:
            return False
        if not isinstance(body, dict):
            return False
        if set(("mechanisms", "realized_impact_claimed", "missing_evidence")) - set(body):
            return False
        mechanisms = body.get("mechanisms")
        missing = body.get("missing_evidence")
        if not isinstance(mechanisms, list) or not isinstance(missing, list):
            return False
        if body.get("realized_impact_claimed") is not False:
            return False
        if any(not isinstance(x, str) or not x.strip() for x in missing):
            return False
        facts = scenario["facts"]
        observed = set()
        for row in mechanisms:
            if not isinstance(row, dict):
                return False
            mechanism = str(row.get("mechanism", "")).strip().lower()
            fact_ids = row.get("fact_ids")
            if mechanism not in self.allowed_mechanisms or mechanism in observed:
                return False
            if not isinstance(fact_ids, list) or not fact_ids:
                return False
            if len(set(fact_ids)) != len(fact_ids):
                return False
            for fact_id in fact_ids:
                if fact_id not in facts:
                    return False
                if mechanism not in set(facts[fact_id].get("mechanisms", [])):
                    return False
            observed.add(mechanism)
        if len(observed) < 2:
            return False
        scenario_supported = {
            mechanism
            for spec in facts.values()
            for mechanism in spec.get("mechanisms", [])
            if mechanism in self.allowed_mechanisms
        }
        unsupported_categories = self.allowed_mechanisms - scenario_supported
        if unsupported_categories and not missing:
            return False
        return True

    def validate_reference_items(self, course: Dict[str, Any]) -> Dict[str, Any]:
        checked = []
        for item in course.get("items", []):
            if item.get("scoring_type") != SCORING_TYPE:
                continue
            ok = self.score(item, item.get("answer", ""))
            checked.append({"item_id": item["item_id"], "pass": ok})
        return {"status": "PASS" if checked and all(x["pass"] for x in checked) else "FAIL", "checked": checked}

    def validate_lesson_examples(self, course: Dict[str, Any]) -> Dict[str, Any]:
        checked = []
        for lesson in course.get("lessons", []):
            examples = lesson.get("worked_examples", [])
            lower = "\n".join(examples).lower()
            ok = len(examples) >= 2 and "plausible" in lower and "realized result" in lower and "missing evidence" in lower
            checked.append({"lesson_id": lesson.get("lesson_id"), "pass": ok})
        return {"status": "PASS" if checked and all(x["pass"] for x in checked) else "FAIL", "checked": checked}


def tutor_observer(probe: Dict[str, Any], response: str) -> Tuple[bool, Optional[str]]:
    return False, None


def tutor_move(signature: Optional[str], confirmed: bool, abstained: bool) -> Dict[str, Any]:
    return {
        "content": "Return to the supplied scenario facts and separate plausible value mechanisms from observed results.",
        "claim_refs": ["CL-CSSGB-I.A.1-004"],
    }


def dossier_copy() -> Dict[str, Any]:
    return copy.deepcopy(SOURCE_DOSSIER)
