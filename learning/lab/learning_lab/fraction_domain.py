from __future__ import annotations

import json
import math
import re
from dataclasses import asdict
from fractions import Fraction
from typing import Any, Dict, List, Optional, Tuple

from .models import Course, Criterion, Item, Lesson, Skill
from .repository import digest

REAL_FRACTION_OUTCOME = (
    "Add and subtract fractions with unlike denominators, simplify results, "
    "and solve a simple quantity-change word problem."
)
FRACTION_DOMAIN_KEY = "fractions-unlike-denominators"

FRACTION_SOURCE_DOSSIER: Dict[str, Any] = {
    "dossier_id": "RSCH-FRACTIONS-UNLIKE-DENOMINATORS-001",
    "domain_key": FRACTION_DOMAIN_KEY,
    "retrieved_date": "2026-09-07",
    "source_policy": "AUTHORITATIVE_EDUCATIONAL_SOURCE",
    "sources": [
        {
            "source_id": "SRC-OPENSTAX-FRAC-DIFF",
            "title": "OpenStax Prealgebra 2e - 4.5 Add and Subtract Fractions with Different Denominators",
            "url": "https://openstax.org/books/prealgebra-2e/pages/4-5-add-and-subtract-fractions-with-different-denominators",
            "authority": "OPENSTAX_PEER_REVIEWED_TEXTBOOK",
            "standing": "ADMITTED",
        },
        {
            "source_id": "SRC-OPENSTAX-FRAC-SIMPLIFY",
            "title": "OpenStax Prealgebra 2e - 4.2 Multiply and Divide Fractions",
            "url": "https://openstax.org/books/prealgebra-2e/pages/4-2-multiply-and-divide-fractions",
            "authority": "OPENSTAX_PEER_REVIEWED_TEXTBOOK",
            "standing": "ADMITTED",
        },
        {
            "source_id": "SRC-OPENSTAX-FRAC-KEY",
            "title": "OpenStax Prealgebra 2e - Chapter 4 Key Concepts",
            "url": "https://openstax.org/books/prealgebra-2e/pages/4-key-concepts",
            "authority": "OPENSTAX_PEER_REVIEWED_TEXTBOOK",
            "standing": "ADMITTED",
        },
    ],
    "claims": [
        {
            "claim_id": "CL-FRAC-001",
            "source_id": "SRC-OPENSTAX-FRAC-DIFF",
            "text": "The least common denominator of two fractions is the least common multiple of their denominators.",
            "kind": "FACT",
        },
        {
            "claim_id": "CL-FRAC-002",
            "source_id": "SRC-OPENSTAX-FRAC-KEY",
            "text": "Equivalent fractions can be formed by multiplying a fraction's numerator and denominator by the same nonzero number.",
            "kind": "FACT",
        },
        {
            "claim_id": "CL-FRAC-003",
            "source_id": "SRC-OPENSTAX-FRAC-DIFF",
            "text": "To add or subtract fractions with different denominators, first convert them to equivalent fractions with a common denominator, then combine the numerators.",
            "kind": "FACT",
        },
        {
            "claim_id": "CL-FRAC-004",
            "source_id": "SRC-OPENSTAX-FRAC-DIFF",
            "text": "A complete add-or-subtract procedure is: find the LCD, convert each fraction to an equivalent form with that denominator, add or subtract, and write the result in simplified form.",
            "kind": "PROCEDURE",
        },
        {
            "claim_id": "CL-FRAC-005",
            "source_id": "SRC-OPENSTAX-FRAC-SIMPLIFY",
            "text": "A fraction is simplified when numerator and denominator have no common factor greater than one.",
            "kind": "FACT",
        },
        {
            "claim_id": "CL-FRAC-006",
            "source_id": "SRC-OPENSTAX-FRAC-DIFF",
            "text": "Unlike-denominator fractions cannot be added or subtracted by directly combining their numerators while leaving different denominators unchanged.",
            "kind": "DESIGN_DERIVATION_FROM_PROCEDURE",
        },
    ],
}


def build_fraction_course(*, goal_id: str, title: str, desired_outcome: str, dossier: Dict[str, Any]) -> Course:
    if desired_outcome.strip() != REAL_FRACTION_OUTCOME:
        raise ValueError("UNSUPPORTED_FRACTION_GOAL")
    required = {f"CL-FRAC-{i:03d}" for i in range(1, 7)}
    actual = {c["claim_id"] for c in dossier.get("claims", [])}
    if not required.issubset(actual):
        raise ValueError("RESEARCH_CLAIM_COVERAGE_INCOMPLETE")

    criteria = [
        Criterion(
            "C-FRAC-EQUIV-LCD",
            "S-FRAC-EQUIV-LCD",
            "Find a least common denominator and rewrite unlike-denominator fractions as equivalent fractions using it.",
        ),
        Criterion(
            "C-FRAC-ADD-SUB",
            "S-FRAC-ADD-SUB",
            "Add or subtract fractions with unlike denominators and simplify the result.",
        ),
    ]
    skills = [
        Skill("S-FRAC-EQUIV-LCD", "Find an LCD and build equivalent fractions", ["C-FRAC-EQUIV-LCD"]),
        Skill(
            "S-FRAC-ADD-SUB",
            "Add and subtract unlike-denominator fractions",
            ["C-FRAC-ADD-SUB"],
            ["S-FRAC-EQUIV-LCD"],
        ),
    ]
    lessons = [
        Lesson(
            "L-FRAC-EQUIV-LCD",
            "Make the pieces comparable",
            "S-FRAC-EQUIV-LCD",
            ["C-FRAC-EQUIV-LCD"],
            "Find the LCD and rewrite each fraction without changing its value.",
            "For unlike denominators, first find the least common multiple of the denominators; that value is the LCD. Then multiply each numerator and denominator by the same factor needed to reach the LCD. This changes the form of each fraction, not its value.",
            [
                "For 1/2 and 1/3, LCD = 6, so `1/2 = 3/6` and `1/3 = 2/6`.",
                "For 3/4 and 1/6, LCD = 12, so `3/4 = 9/12` and `1/6 = 2/12`.",
            ],
            ["P-FRAC-LCD-1", "P-FRAC-LCD-2"],
            claim_refs=["CL-FRAC-001", "CL-FRAC-002"],
            grounding_spans=[
                {
                    "role": "EXPLANATION",
                    "text": "For unlike denominators, first find the least common multiple of the denominators; that value is the LCD. Then multiply each numerator and denominator by the same factor needed to reach the LCD. This changes the form of each fraction, not its value.",
                    "claim_refs": ["CL-FRAC-001", "CL-FRAC-002"],
                },
                {
                    "role": "WORKED_EXAMPLE",
                    "text": "For 1/2 and 1/3, LCD = 6, so `1/2 = 3/6` and `1/3 = 2/6`.",
                    "claim_refs": ["CL-FRAC-001", "CL-FRAC-002"],
                },
                {
                    "role": "WORKED_EXAMPLE",
                    "text": "For 3/4 and 1/6, LCD = 12, so `3/4 = 9/12` and `1/6 = 2/12`.",
                    "claim_refs": ["CL-FRAC-001", "CL-FRAC-002"],
                },
            ],
        ),
        Lesson(
            "L-FRAC-ADD-SUB",
            "Add and subtract after conversion",
            "S-FRAC-ADD-SUB",
            ["C-FRAC-ADD-SUB"],
            "Convert to a common denominator, combine numerators, and simplify the result.",
            "After equivalent fractions have a common denominator, add or subtract their numerators while keeping that denominator. Then simplify the resulting fraction by removing common factors from numerator and denominator when possible.",
            [
                "`1/2 + 1/3 = 3/6 + 2/6 = 5/6`.",
                "`3/4 - 1/6 = 9/12 - 2/12 = 7/12`.",
            ],
            ["P-FRAC-ADD-1", "P-FRAC-SUB-1"],
            claim_refs=["CL-FRAC-003", "CL-FRAC-004", "CL-FRAC-005"],
            grounding_spans=[
                {
                    "role": "EXPLANATION",
                    "text": "After equivalent fractions have a common denominator, add or subtract their numerators while keeping that denominator. Then simplify the resulting fraction by removing common factors from numerator and denominator when possible.",
                    "claim_refs": ["CL-FRAC-003", "CL-FRAC-004", "CL-FRAC-005"],
                },
                {
                    "role": "WORKED_EXAMPLE",
                    "text": "`1/2 + 1/3 = 3/6 + 2/6 = 5/6`.",
                    "claim_refs": ["CL-FRAC-003", "CL-FRAC-004"],
                },
                {
                    "role": "WORKED_EXAMPLE",
                    "text": "`3/4 - 1/6 = 9/12 - 2/12 = 7/12`.",
                    "claim_refs": ["CL-FRAC-003", "CL-FRAC-004", "CL-FRAC-005"],
                },
            ],
        ),
    ]
    items = [
        Item(
            "P-FRAC-LCD-1", "F-FRAC-LCD-P1", "C-FRAC-EQUIV-LCD", "PRACTICE",
            "What is the LCD of 4 and 6?", "12",
            "The LCD is the least common multiple of the denominators.",
            scoring_type="INTEGER",
            claim_refs=["CL-FRAC-001"],
            grounding_spans=[{"role":"RATIONALE","text":"The LCD is the least common multiple of the denominators.","claim_refs":["CL-FRAC-001"]}],
        ),
        Item(
            "P-FRAC-LCD-2", "F-FRAC-LCD-P2", "C-FRAC-EQUIV-LCD", "PRACTICE",
            "Rewrite 2/3 with denominator 12.", "8/12",
            "Multiplying numerator and denominator by four preserves the fraction's value.",
            scoring_type="EQUIVALENT_WITH_DENOMINATOR",
            claim_refs=["CL-FRAC-002"],
            grounding_spans=[{"role":"RATIONALE","text":"Multiplying numerator and denominator by four preserves the fraction's value.","claim_refs":["CL-FRAC-002"]}],
        ),
        Item(
            "M-FRAC-LCD-1", "F-FRAC-LCD-M1", "C-FRAC-EQUIV-LCD", "MASTERY_CHECK",
            "For 5/8 and 7/12, give the LCD and rewrite both fractions using it. Format: LCD=...; 5/8=...; 7/12=...",
            "LCD=24; 5/8=15/24; 7/12=14/24",
            "Use the least common multiple 24 and equivalent-fraction multipliers three and two.",
            scoring_type="LCD_EQUIV",
            claim_refs=["CL-FRAC-001", "CL-FRAC-002"],
            grounding_spans=[{"role":"RATIONALE","text":"Use the least common multiple 24 and equivalent-fraction multipliers three and two.","claim_refs":["CL-FRAC-001","CL-FRAC-002"]}],
        ),
        Item(
            "R-FRAC-LCD-1", "F-FRAC-LCD-R1", "C-FRAC-EQUIV-LCD", "RETENTION_CHECK",
            "For 3/10 and 5/12, give the LCD and rewrite both fractions using it. Format: LCD=...; 3/10=...; 5/12=...",
            "LCD=60; 3/10=18/60; 5/12=25/60",
            "A delayed parallel problem checks the same LCD/equivalence skill with new denominators.",
            scoring_type="LCD_EQUIV",
            claim_refs=["CL-FRAC-001", "CL-FRAC-002"],
            grounding_spans=[{"role":"RATIONALE","text":"A delayed parallel problem checks the same LCD/equivalence skill with new denominators.","claim_refs":["CL-FRAC-001","CL-FRAC-002"]}],
        ),
        Item(
            "P-FRAC-ADD-1", "F-FRAC-ADD-P1", "C-FRAC-ADD-SUB", "PRACTICE",
            "Compute 1/2 + 1/3 and simplify.", "5/6",
            "Convert to sixths, add numerators, and simplify if needed.",
            scoring_type="FRACTION",
            claim_refs=["CL-FRAC-003", "CL-FRAC-004", "CL-FRAC-005"],
            grounding_spans=[{"role":"RATIONALE","text":"Convert to sixths, add numerators, and simplify if needed.","claim_refs":["CL-FRAC-003","CL-FRAC-004","CL-FRAC-005"]}],
        ),
        Item(
            "P-FRAC-SUB-1", "F-FRAC-SUB-P1", "C-FRAC-ADD-SUB", "PRACTICE",
            "Compute 3/4 - 1/6 and simplify.", "7/12",
            "Convert to twelfths before subtracting numerators.",
            scoring_type="FRACTION",
            claim_refs=["CL-FRAC-003", "CL-FRAC-004", "CL-FRAC-005"],
            grounding_spans=[{"role":"RATIONALE","text":"Convert to twelfths before subtracting numerators.","claim_refs":["CL-FRAC-003","CL-FRAC-004","CL-FRAC-005"]}],
        ),
        Item(
            "M-FRAC-ADD-1", "F-FRAC-ADD-M1", "C-FRAC-ADD-SUB", "MASTERY_CHECK",
            "Compute 3/4 + 5/6 and give the simplified result.", "19/12",
            "Use a common denominator of 12, combine numerators, then simplify.",
            scoring_type="FRACTION",
            claim_refs=["CL-FRAC-003", "CL-FRAC-004", "CL-FRAC-005"],
            grounding_spans=[{"role":"RATIONALE","text":"Use a common denominator of 12, combine numerators, then simplify.","claim_refs":["CL-FRAC-003","CL-FRAC-004","CL-FRAC-005"]}],
        ),
        Item(
            "R-FRAC-SUB-1", "F-FRAC-SUB-R1", "C-FRAC-ADD-SUB", "RETENTION_CHECK",
            "Compute 7/10 - 1/4 and give the simplified result.", "9/20",
            "A delayed parallel subtraction problem requires a fresh common denominator and simplification.",
            scoring_type="FRACTION",
            claim_refs=["CL-FRAC-003", "CL-FRAC-004", "CL-FRAC-005"],
            grounding_spans=[{"role":"RATIONALE","text":"A delayed parallel subtraction problem requires a fresh common denominator and simplification.","claim_refs":["CL-FRAC-003","CL-FRAC-004","CL-FRAC-005"]}],
        ),
    ]
    return Course(
        course_id=f"COURSE-{goal_id}",
        version=1,
        goal_id=goal_id,
        title=title,
        desired_outcome=desired_outcome,
        skills=skills,
        criteria=criteria,
        lessons=lessons,
        items=items,
        state="READY_FOR_REVIEW",
        source_ids=[s["source_id"] for s in dossier["sources"]],
        research_dossier_id=dossier["dossier_id"],
        generation_adapter="MODEL-STUB-FRACTIONS-V1",
    )


FRACTION_MAINTENANCE_TASKS: Dict[str, Dict[str, Any]] = {
    "MN-FRAC-LCD-2": {
        "item_id": "MN-FRAC-LCD-2", "family_id": "F-FRAC-LCD-R2",
        "criterion_id": "C-FRAC-EQUIV-LCD", "skill_id": "S-FRAC-EQUIV-LCD",
        "mode": "RETENTION_CHECK",
        "prompt": "For 7/15 and 5/18, give the LCD and rewrite both fractions using it. Format: LCD=...; 7/15=...; 5/18=...",
        "answer": "LCD=90; 7/15=42/90; 5/18=25/90",
        "scoring_type": "LCD_EQUIV",
        "claim_refs": ["CL-FRAC-001", "CL-FRAC-002"],
        "fresh_family": True,
    },
    "MN-FRAC-ADD-2": {
        "item_id": "MN-FRAC-ADD-2", "family_id": "F-FRAC-ADD-R2",
        "criterion_id": "C-FRAC-ADD-SUB", "skill_id": "S-FRAC-ADD-SUB",
        "mode": "RETENTION_CHECK",
        "prompt": "Compute 5/12 + 7/18 and give the simplified result.",
        "answer": "29/36",
        "scoring_type": "FRACTION",
        "claim_refs": ["CL-FRAC-003", "CL-FRAC-004", "CL-FRAC-005"],
        "fresh_family": True,
    },
}

FRACTION_TRANSFER_TASKS: Dict[str, Dict[str, Any]] = {
    "T-FRAC-TRANSFER-DISTANCE": {
        "item_id": "T-FRAC-TRANSFER-DISTANCE", "family_id": "F-FRAC-TRANSFER-A",
        "criterion_id": "C-FRAC-ADD-SUB", "skill_id": "S-FRAC-ADD-SUB",
        "mode": "TRANSFER_CHECK",
        "prompt": "A hiker walks 2/3 mile before lunch and 5/8 mile after lunch. What total distance did the hiker walk? Give a simplified fraction of a mile.",
        "answer": "31/24",
        "scoring_type": "FRACTION",
        "claim_refs": ["CL-FRAC-003", "CL-FRAC-004", "CL-FRAC-005"],
        "novelty": {
            "surface_context_changed": True,
            "operation_embedded_in_word_problem": True,
            "numbers_unseen": True,
            "preserved_construct": "add unlike-denominator fractions and simplify",
        },
    },
    "T-FRAC-TRANSFER-TANK": {
        "item_id": "T-FRAC-TRANSFER-TANK", "family_id": "F-FRAC-TRANSFER-B",
        "criterion_id": "C-FRAC-ADD-SUB", "skill_id": "S-FRAC-ADD-SUB",
        "mode": "TRANSFER_CHECK",
        "prompt": "A tank is 5/6 full. Water equal to 1/4 of the tank's capacity is used. What fraction of the tank remains? Give a simplified fraction.",
        "answer": "7/12",
        "scoring_type": "FRACTION",
        "claim_refs": ["CL-FRAC-003", "CL-FRAC-004", "CL-FRAC-005"],
        "novelty": {
            "surface_context_changed": True,
            "subtraction_embedded_in_word_problem": True,
            "numbers_unseen": True,
            "preserved_construct": "subtract unlike-denominator fractions and simplify",
        },
    },
}


def _fraction_value(text: str) -> Optional[Fraction]:
    cleaned = text.strip().replace(" ", "")
    if re.fullmatch(r"[-+]?\d+", cleaned):
        return Fraction(int(cleaned), 1)
    m = re.fullmatch(r"([-+]?\d+)\/([-+]?\d+)", cleaned)
    if not m or int(m.group(2)) == 0:
        return None
    return Fraction(int(m.group(1)), int(m.group(2)))


def _parse_lcd_equiv(text: str) -> Optional[Tuple[int, List[Tuple[Fraction, int, int]]]]:
    m = re.search(r"lcd\s*=\s*(\d+)", text, flags=re.I)
    if not m:
        return None
    lcd = int(m.group(1))
    eqs: List[Tuple[Fraction, int, int]] = []
    for left_n, left_d, right_n, right_d in re.findall(r"(\d+)\s*\/\s*(\d+)\s*=\s*(\d+)\s*\/\s*(\d+)", text):
        eqs.append((Fraction(int(left_n), int(left_d)), int(right_n), int(right_d)))
    return lcd, eqs


class FractionBehaviorOracle:
    """Independent deterministic math oracle for the second real domain.

    Correctness is derived from the prompt/problem structure, not trusted from
    the candidate answer key. This lets a deliberately wrong answer key fail
    validation instead of validating itself.
    """

    @staticmethod
    def _lcm(a: int, b: int) -> int:
        return abs(a * b) // math.gcd(a, b)

    def expected_for_item(self, item: Dict[str, Any]) -> Optional[str]:
        scoring = item.get("scoring_type", "EXACT")
        prompt = item.get("prompt", "")

        if scoring == "INTEGER":
            m = re.search(r"LCD\s+of\s+(\d+)\s+and\s+(\d+)", prompt, flags=re.I)
            if not m:
                return None
            return str(self._lcm(int(m.group(1)), int(m.group(2))))

        if scoring == "EQUIVALENT_WITH_DENOMINATOR":
            m = re.search(r"Rewrite\s+(\d+)\s*/\s*(\d+)\s+with\s+denominator\s+(\d+)", prompt, flags=re.I)
            if not m:
                return None
            n, d, target = map(int, m.groups())
            if target % d != 0:
                return None
            factor = target // d
            return f"{n * factor}/{target}"

        if scoring == "LCD_EQUIV":
            m = re.search(r"For\s+(\d+)\s*/\s*(\d+)\s+and\s+(\d+)\s*/\s*(\d+)", prompt, flags=re.I)
            if not m:
                return None
            n1, d1, n2, d2 = map(int, m.groups())
            lcd = self._lcm(d1, d2)
            return f"LCD={lcd}; {n1}/{d1}={n1*(lcd//d1)}/{lcd}; {n2}/{d2}={n2*(lcd//d2)}/{lcd}"

        if scoring == "FRACTION":
            # Direct symbolic calculation prompt.
            m = re.search(r"Compute\s+([-+]?\d+\s*/\s*\d+)\s*([+-])\s*([-+]?\d+\s*/\s*\d+)", prompt, flags=re.I)
            if m:
                a = _fraction_value(m.group(1).replace(" ", ""))
                b = _fraction_value(m.group(3).replace(" ", ""))
                if a is None or b is None:
                    return None
                out = a + b if m.group(2) == "+" else a - b
                return f"{out.numerator}/{out.denominator}" if out.denominator != 1 else str(out.numerator)

            # Bounded word-problem forms in this real-domain slice.
            fracs = [_fraction_value(x.replace(" ", "")) for x in re.findall(r"\d+\s*/\s*\d+", prompt)]
            if len(fracs) >= 2 and all(x is not None for x in fracs[:2]):
                a, b = fracs[0], fracs[1]
                lowered = prompt.lower()
                if "total" in lowered or "altogether" in lowered:
                    out = a + b
                elif "used" in lowered or "remains" in lowered or "left" in lowered:
                    out = a - b
                else:
                    return None
                return f"{out.numerator}/{out.denominator}" if out.denominator != 1 else str(out.numerator)
            return None

        return item.get("answer")

    def score(self, item: Dict[str, Any], response: str) -> bool:
        scoring = item.get("scoring_type", "EXACT")
        expected_text = self.expected_for_item(item)
        if expected_text is None:
            return False
        if scoring == "INTEGER":
            try:
                return int(response.strip()) == int(expected_text)
            except ValueError:
                return False
        if scoring == "FRACTION":
            got = _fraction_value(response)
            expected = _fraction_value(expected_text)
            return got is not None and expected is not None and got == expected
        if scoring == "EQUIVALENT_WITH_DENOMINATOR":
            got_match = re.fullmatch(r"\s*([-+]?\d+)\s*\/\s*([-+]?\d+)\s*", response)
            exp_match = re.fullmatch(r"\s*([-+]?\d+)\s*\/\s*([-+]?\d+)\s*", expected_text)
            if not got_match or not exp_match:
                return False
            gn, gd = int(got_match.group(1)), int(got_match.group(2))
            en, ed = int(exp_match.group(1)), int(exp_match.group(2))
            return gd == ed and Fraction(gn, gd) == Fraction(en, ed)
        if scoring == "LCD_EQUIV":
            got = _parse_lcd_equiv(response)
            expected = _parse_lcd_equiv(expected_text)
            if got is None or expected is None:
                return False
            if got[0] != expected[0] or len(got[1]) != len(expected[1]):
                return False
            expected_by_value = {left: (rn, rd) for left, rn, rd in expected[1]}
            for left, rn, rd in got[1]:
                if left not in expected_by_value:
                    return False
                _, expected_den = expected_by_value[left]
                if rd != got[0] or rd != expected_den or Fraction(rn, rd) != left:
                    return False
            return True
        return response.strip().lower() == expected_text.strip().lower()

    def validate_reference_items(self, course: Dict[str, Any]) -> Dict[str, Any]:
        checked = []
        for item in course["items"]:
            derived = self.expected_for_item(item)
            key_ok = derived is not None and self.score(item, item["answer"])
            checked.append({"item_id": item["item_id"], "pass": key_ok, "derived_expected": derived})
        return {"status": "PASS" if checked and all(x["pass"] for x in checked) else "FAIL", "checked": checked}

    @staticmethod
    def _equation_ok(text: str) -> bool:
        # Validate a chain such as 1/2 + 1/3 = 3/6 + 2/6 = 5/6 or
        # equality-only spans such as 1/2 = 3/6.
        expr = text.strip().strip("`.")
        parts = [p.strip() for p in expr.split("=")]
        if len(parts) < 2:
            return False

        def eval_piece(piece: str) -> Optional[Fraction]:
            piece = piece.strip()
            simple = _fraction_value(piece)
            if simple is not None:
                return simple
            m = re.fullmatch(r"(\d+\/\d+)\s*([+-])\s*(\d+\/\d+)", piece)
            if not m:
                return None
            a = _fraction_value(m.group(1)); b = _fraction_value(m.group(3))
            if a is None or b is None:
                return None
            return a + b if m.group(2) == "+" else a - b

        vals = [eval_piece(p) for p in parts]
        return all(v is not None for v in vals) and all(v == vals[0] for v in vals[1:])

    def validate_lesson_examples(self, course: Dict[str, Any]) -> Dict[str, Any]:
        checked: List[Dict[str, Any]] = []
        for lesson in course["lessons"]:
            for idx, example in enumerate(lesson.get("worked_examples", [])):
                spans = re.findall(r"`([^`]+)`", example)
                if lesson["skill_id"] == "S-FRAC-EQUIV-LCD":
                    ok = bool(spans) and all(self._equation_ok(s) for s in spans)
                    lcd_match = re.search(r"LCD\s*=\s*(\d+)", example, flags=re.I)
                    if not lcd_match:
                        ok = False
                    else:
                        lcd = int(lcd_match.group(1))
                        denominators = []
                        for s in spans:
                            right = s.split("=")[-1].strip()
                            m = re.fullmatch(r"\d+/(\d+)", right)
                            if not m:
                                ok = False
                                break
                            denominators.append(int(m.group(1)))
                        if denominators and not all(d == lcd for d in denominators):
                            ok = False
                else:
                    ok = bool(spans) and all(self._equation_ok(s) for s in spans)
                checked.append({"lesson_id": lesson["lesson_id"], "example_index": idx, "pass": ok})
        return {"status": "PASS" if checked and all(x["pass"] for x in checked) else "FAIL", "checked": checked}


FRACTION_TUTOR_PROBES: Dict[str, Dict[str, Any]] = {
    "TP-FRAC-ADD-1": {
        "probe_id": "TP-FRAC-ADD-1", "skill_id": "S-FRAC-ADD-SUB", "family_id": "TF-FRAC-ADD-A",
        "prompt": "Compute 1/2 + 1/3.", "answer": "5/6",
        "claim_refs": ["CL-FRAC-001", "CL-FRAC-002", "CL-FRAC-003", "CL-FRAC-004", "CL-FRAC-005"],
        "error_signature": "ADDS_DENOMINATORS",
        "wrong_signature_answers": ["2/5"],
        "next_probe_id": "TP-FRAC-ADD-2",
    },
    "TP-FRAC-ADD-2": {
        "probe_id": "TP-FRAC-ADD-2", "skill_id": "S-FRAC-ADD-SUB", "family_id": "TF-FRAC-ADD-B",
        "prompt": "Compute 2/3 + 1/4.", "answer": "11/12",
        "claim_refs": ["CL-FRAC-001", "CL-FRAC-002", "CL-FRAC-003", "CL-FRAC-004", "CL-FRAC-005"],
        "error_signature": "ADDS_DENOMINATORS",
        "wrong_signature_answers": ["3/7"],
        "next_probe_id": "TP-FRAC-ADD-RECHECK",
    },
    "TP-FRAC-ADD-RECHECK": {
        "probe_id": "TP-FRAC-ADD-RECHECK", "skill_id": "S-FRAC-ADD-SUB", "family_id": "TF-FRAC-ADD-C",
        "prompt": "Compute 3/5 + 1/6.", "answer": "23/30",
        "claim_refs": ["CL-FRAC-001", "CL-FRAC-002", "CL-FRAC-003", "CL-FRAC-004", "CL-FRAC-005"],
        "error_signature": "ADDS_DENOMINATORS",
        "wrong_signature_answers": ["4/11"],
        "next_probe_id": None,
    },
}


def fraction_tutor_diagnose(probe: Dict[str, Any], response: str) -> Tuple[bool, Optional[str]]:
    got = _fraction_value(response)
    expected = _fraction_value(probe["answer"])
    correct = got is not None and expected is not None and got == expected
    if correct:
        return True, None
    wrongs = {_fraction_value(x) for x in probe.get("wrong_signature_answers", [])}
    if got is not None and got in wrongs:
        return False, probe.get("error_signature")
    return False, None


def fraction_tutor_move(signature: Optional[str], confirmed: bool, abstained: bool) -> Dict[str, Any]:
    if abstained:
        return {
            "content": "The answer is not correct, but this response does not show why. First identify a common denominator that both fractions can use; then try again.",
            "claim_refs": ["CL-FRAC-001", "CL-FRAC-003"],
        }
    if signature == "ADDS_DENOMINATORS" and confirmed:
        return {
            "content": "You have repeated a pattern of adding denominators. For addition, first rewrite both fractions with a common denominator; only then combine the numerators and simplify the result.",
            "claim_refs": ["CL-FRAC-003", "CL-FRAC-004", "CL-FRAC-005"],
        }
    return {
        "content": "Before combining numerators, check whether the fractions have the same denominator. If not, convert them to equivalent fractions with a common denominator first.",
        "claim_refs": ["CL-FRAC-002", "CL-FRAC-003"],
    }
