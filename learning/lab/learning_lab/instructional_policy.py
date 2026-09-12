from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional


INSTRUCTIONAL_POLICY_VERSION = "001M-S04-INSTRUCTIONAL-POLICY-V2"

SUPPORT_LADDER = (
    "ORIENT_ACTIVATE",
    "QUESTION_PROMPT",
    "NUDGE",
    "HINT",
    "CLUE",
    "PARTIAL_STEP",
    "WORKED_EXAMPLE",
    "DIRECT_EXPLANATION",
    "DIRECT_ANSWER",
)

SUPPORT_INDEX = {name: index for index, name in enumerate(SUPPORT_LADDER)}
POLICY_STRATEGIES = frozenset(set(SUPPORT_LADDER) | {"SELF_EXPLANATION"})
STRATEGY_SUPPORT_LEVEL = dict(SUPPORT_INDEX)
STRATEGY_SUPPORT_LEVEL["SELF_EXPLANATION"] = SUPPORT_INDEX["QUESTION_PROMPT"]


class InstructionalPolicyError(ValueError):
    pass


@dataclass(frozen=True)
class InstructionalPolicyDecision:
    strategy: str
    support_level: int
    reason_codes: tuple[str, ...]
    policy_version: str
    direct_answer_permitted: bool
    assistance_condition: str
    accommodation_preserved: bool
    model_used: bool

    def as_dict(self) -> Dict[str, Any]:
        return {
            "strategy": self.strategy,
            "support_level": self.support_level,
            "reason_codes": list(self.reason_codes),
            "policy_version": self.policy_version,
            "direct_answer_permitted": self.direct_answer_permitted,
            "assistance_condition": self.assistance_condition,
            "accommodation_preserved": self.accommodation_preserved,
            "model_used": self.model_used,
        }


def _normalize_strategy(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    strategy = str(value).strip().upper()
    if strategy not in POLICY_STRATEGIES:
        raise InstructionalPolicyError("INSTRUCTIONAL_STRATEGY_NOT_ALLOWED")
    return strategy


def _support_level(strategy: str) -> int:
    return int(STRATEGY_SUPPORT_LEVEL[strategy])


def choose_instructional_strategy(
    *,
    requested_help_level: int = 0,
    requested_strategy: Optional[str] = None,
    prior_support_level: int = 0,
    learner_correct: Optional[bool] = None,
    learner_requests_independent: bool = False,
    assessment_active: bool = False,
    independent_evidence_active: bool = False,
    accommodation_active: bool = False,
    accommodation_kind: Optional[str] = None,
    direct_answer_allowed_by_curriculum: bool = False,
    diagnosis_supported: bool = False,
    diagnosis_unknown: bool = False,
    model_available: bool = True,
    model_approved: bool = True,
    policy_version: str = INSTRUCTIONAL_POLICY_VERSION,
) -> Dict[str, Any]:
    """Curriculum-owned instructional-policy evaluator.

    It decides how much and how to teach. It never decides mastery or which
    Learning action is eligible. Model availability can realize a policy-permitted
    choice but cannot create permission the Curriculum policy does not grant.
    """
    if isinstance(requested_help_level, bool) or not isinstance(requested_help_level, int):
        raise InstructionalPolicyError("REQUESTED_HELP_LEVEL_INVALID")
    requested_help_level = max(0, requested_help_level)
    prior_support_level = max(0, int(prior_support_level))
    requested_strategy = _normalize_strategy(requested_strategy)

    if assessment_active or independent_evidence_active:
        return InstructionalPolicyDecision(
            strategy="QUESTION_PROMPT",
            support_level=SUPPORT_INDEX["QUESTION_PROMPT"],
            reason_codes=(
                "ASSESSMENT_INTEGRITY_BOUNDARY" if assessment_active else "INDEPENDENT_EVIDENCE_BOUNDARY",
                "DIRECT_ANSWER_BLOCKED",
                "HINTS_AND_STEPS_WITHHELD",
            ),
            policy_version=policy_version,
            direct_answer_permitted=False,
            assistance_condition="AUTHORIZED_ACCOMMODATION" if accommodation_active else "INDEPENDENT",
            accommodation_preserved=bool(accommodation_active),
            model_used=False,
        ).as_dict()

    if learner_requests_independent:
        return InstructionalPolicyDecision(
            strategy="QUESTION_PROMPT",
            support_level=SUPPORT_INDEX["QUESTION_PROMPT"],
            reason_codes=("LEARNER_REQUESTED_INDEPENDENT_ATTEMPT", "SCAFFOLD_FADE"),
            policy_version=policy_version,
            direct_answer_permitted=False,
            assistance_condition="AUTHORIZED_ACCOMMODATION" if accommodation_active else "INDEPENDENT",
            accommodation_preserved=bool(accommodation_active),
            model_used=False,
        ).as_dict()

    if learner_correct is True and prior_support_level > 0:
        return InstructionalPolicyDecision(
            strategy="QUESTION_PROMPT",
            support_level=SUPPORT_INDEX["QUESTION_PROMPT"],
            reason_codes=("CORRECT_WITH_PRIOR_SUPPORT", "SCAFFOLD_FADE", "FRESH_RECHECK"),
            policy_version=policy_version,
            direct_answer_permitted=False,
            assistance_condition="AUTHORIZED_ACCOMMODATION" if accommodation_active else "INSTRUCTIONAL_SCAFFOLD",
            accommodation_preserved=bool(accommodation_active),
            model_used=False,
        ).as_dict()

    if requested_strategy is not None:
        target = requested_strategy
    elif diagnosis_unknown:
        target = "QUESTION_PROMPT"
    elif diagnosis_supported:
        target = "HINT" if requested_help_level <= 3 else "PARTIAL_STEP"
    elif requested_help_level <= 0:
        target = "QUESTION_PROMPT"
    elif requested_help_level == 1:
        target = "NUDGE"
    elif requested_help_level == 2:
        target = "HINT"
    elif requested_help_level == 3:
        target = "CLUE"
    elif requested_help_level == 4:
        target = "PARTIAL_STEP"
    elif requested_help_level == 5:
        target = "WORKED_EXAMPLE"
    else:
        target = "DIRECT_EXPLANATION"

    if target == "DIRECT_ANSWER" and not direct_answer_allowed_by_curriculum:
        target = "DIRECT_EXPLANATION"
        direct_answer_permitted = False
        direct_reason = "DIRECT_ANSWER_NOT_PERMITTED_BY_CURRICULUM"
    else:
        direct_answer_permitted = target == "DIRECT_ANSWER"
        direct_reason = None

    model_used = bool(model_available and model_approved)
    reasons = ["LEAST_HELP_FIRST_POLICY"]
    if requested_help_level > 0 or requested_strategy is not None:
        reasons.append("LEARNER_HELP_REQUEST_WITHIN_POLICY")
    if target == "SELF_EXPLANATION":
        reasons.append("SELF_EXPLANATION_POLICY_STRATEGY")
    if diagnosis_supported:
        reasons.append("EVIDENCE_SUPPORTED_DIAGNOSIS")
    if diagnosis_unknown:
        reasons.append("CAUSE_UNKNOWN_USE_CLARIFYING_PROMPT")
    if direct_reason:
        reasons.append(direct_reason)
    if not model_available:
        reasons.append("MODEL_UNAVAILABLE_DETERMINISTIC_FALLBACK")
    elif not model_approved:
        reasons.append("MODEL_UNAPPROVED_DETERMINISTIC_FALLBACK")
    elif model_used:
        reasons.append("MODEL_MAY_REALIZE_POLICY_BOUNDED_STRATEGY")

    if accommodation_active:
        reasons.append("ACCOMMODATION_PRESERVED_NOT_FADED")

    support_level = _support_level(target)
    return InstructionalPolicyDecision(
        strategy=target,
        support_level=support_level,
        reason_codes=tuple(reasons),
        policy_version=policy_version,
        direct_answer_permitted=direct_answer_permitted,
        assistance_condition="AUTHORIZED_ACCOMMODATION" if accommodation_active else (
            "INSTRUCTIONAL_SCAFFOLD" if support_level > SUPPORT_INDEX["QUESTION_PROMPT"] else "INDEPENDENT"
        ),
        accommodation_preserved=bool(accommodation_active),
        model_used=model_used,
    ).as_dict()


def validate_tutor_move_against_policy(
    move: Dict[str, Any],
    *,
    assessment_active: bool = False,
    independent_evidence_active: bool = False,
    accommodation_active: bool = False,
    policy_version: str = INSTRUCTIONAL_POLICY_VERSION,
) -> Dict[str, Any]:
    """Validate and annotate an existing formative tutor move.

    Existing tutor implementations remain responsible for grounded content. This
    function enforces the constitutional teaching-policy fence without creating a
    second tutor or rewriting the move's domain content.
    """
    out = dict(move)
    text = str(out.get("content", "")).lower()
    strategy_by_move = {
        "CLARIFYING_PROBE": "QUESTION_PROMPT",
        "TARGETED_HINT": "HINT",
        "TARGETED_REMEDIATION": "PARTIAL_STEP",
        "FADE_SUPPORT": "QUESTION_PROMPT",
        "FRESH_RECHECK": "QUESTION_PROMPT",
        "INDEPENDENT_RECHECK_PASSED": "QUESTION_PROMPT",
        "ASSESSMENT_INTEGRITY_BOUNDARY": "QUESTION_PROMPT",
        "PREREQUISITE_BLOCKED": "ORIENT_ACTIVATE",
        "SELF_EXPLANATION": "SELF_EXPLANATION",
    }
    strategy = strategy_by_move.get(str(out.get("move", "")), "QUESTION_PROMPT")
    support_level = _support_level(strategy)
    if (assessment_active or independent_evidence_active) and support_level > SUPPORT_INDEX["QUESTION_PROMPT"]:
        raise InstructionalPolicyError("SUPPORT_NOT_PERMITTED_DURING_INDEPENDENT_EVIDENCE")
    if assessment_active and any(marker in text for marker in ("the answer is", "correct answer", "use this answer")):
        raise InstructionalPolicyError("ASSESSMENT_DIRECT_ANSWER_BLOCKED")

    out["instructional_strategy"] = strategy
    out["instructional_policy_version"] = policy_version
    out["assistance_condition"] = (
        "AUTHORIZED_ACCOMMODATION" if accommodation_active else (
            "INSTRUCTIONAL_SCAFFOLD" if support_level > SUPPORT_INDEX["QUESTION_PROMPT"] else "INDEPENDENT"
        )
    )
    out["accommodation_preserved"] = bool(accommodation_active)
    out["direct_answer_permitted"] = False
    return out
